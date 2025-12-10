import { Plugin, type PluginConfig, type ResourceLike } from './plugin.class.js';
import tryFn from '../concerns/try-fn.js';
import { FulltextError } from './fulltext.errors.js';
import { resolveResourceName } from './concerns/resource-names.js';

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

interface Resource {
  name: string;
  insert: (...args: unknown[]) => Promise<Record<string, unknown>>;
  _insert?: (...args: unknown[]) => Promise<Record<string, unknown>>;
  insertMany?: (data: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
  _insertMany?: (data: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
  update: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  _update?: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  delete: (id: string) => Promise<void>;
  _delete?: (id: string) => Promise<void>;
  deleteMany?: (ids: string[]) => Promise<void>;
  _deleteMany?: (ids: string[]) => Promise<void>;
  get: (id: string) => Promise<IndexRecord | null>;
  getAll: () => Promise<IndexRecord[]>;
  getMany: (ids: string[]) => Promise<Record<string, unknown>[]>;
  query: (filter: Record<string, unknown>) => Promise<IndexRecord[]>;
}

interface IndexRecord {
  id: string;
  resourceName: string;
  fieldName: string;
  word: string;
  recordIds: string[];
  count: number;
  lastUpdated?: string;
}

interface Database {
  resources: Record<string, Resource>;
  pluginRegistry: PluginRegistry;
  createResource(config: ResourceConfig): Promise<Resource>;
  _createResource?: (config: ResourceConfig) => Promise<Resource>;
  _previousCreateResourceForFullText?: (config: ResourceConfig) => Promise<Resource>;
  _fulltextProxyInstalled?: boolean;
  addHook(event: string, handler: (resource: Resource) => void): void;
  removeHook(event: string, handler: (resource: Resource) => void): void;
}

interface PluginRegistry {
  fulltext?: FullTextPlugin;
  FullTextPlugin?: FullTextPlugin;
}

interface ResourceConfig {
  name: string;
  attributes: Record<string, string>;
  partitions?: Record<string, { fields: Record<string, string> }>;
  behavior?: string;
}

export interface FullTextPluginOptions {
  resourceNames?: {
    index?: string;
  };
  indexResource?: string;
  minWordLength?: number;
  maxResults?: number;
  fields?: string[] | Record<string, string[]>;
  logLevel?: string;
  [key: string]: unknown;
}

interface FullTextConfig {
  minWordLength: number;
  maxResults: number;
  fields?: string[] | Record<string, string[]>;
  logLevel?: string;
}

interface IndexData {
  recordIds: string[];
  count: number;
}

interface ResourceDescriptor {
  defaultName: string;
  override?: string;
}

export interface SearchOptions {
  fields?: string[] | null;
  limit?: number;
  offset?: number;
  exactMatch?: boolean;
}

export interface SearchResult {
  recordId: string;
  score: number;
}

export interface SearchRecord extends Record<string, unknown> {
  id: string;
  _searchScore: number;
}

interface FieldStats {
  words: number;
  totalOccurrences: number;
}

interface ResourceStats {
  fields: Record<string, FieldStats>;
  totalRecords: Set<string> | number;
  totalWords: number;
}

export interface IndexStats {
  totalIndexes: number;
  resources: Record<string, ResourceStats>;
  totalWords: number;
}

export interface RebuildOptions {
  timeout?: number;
}

export class FullTextPlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  indexResource: Resource | null = null;
  indexResourceName: string;
  config: FullTextConfig;
  indexes: Map<string, IndexData>;
  dirtyIndexes: Set<string>;
  deletedIndexes: Set<string>;

  private _indexResourceDescriptor: ResourceDescriptor;

  constructor(options: FullTextPluginOptions = {}) {
    super(options as PluginConfig);

    this.indexResource = null;
    const opts = this.options as FullTextPluginOptions;
    const resourceNamesOption = opts.resourceNames || {};

    this._indexResourceDescriptor = {
      defaultName: 'plg_fulltext_indexes',
      override: resourceNamesOption.index || opts.indexResource
    };

    this.indexResourceName = this._resolveIndexResourceName();

    this.config = {
      minWordLength: (opts.minWordLength as number) || 3,
      maxResults: (opts.maxResults as number) || 100,
      logLevel: this.logLevel,
      ...(opts as Record<string, unknown>)
    };

    this.indexes = new Map();
    this.dirtyIndexes = new Set();
    this.deletedIndexes = new Set();
  }

  private _resolveIndexResourceName(): string {
    return resolveResourceName('fulltext', this._indexResourceDescriptor, {
      namespace: this.namespace
    });
  }

  override onNamespaceChanged(): void {
    this.indexResourceName = this._resolveIndexResourceName();
  }

  override async onInstall(): Promise<void> {
    const [ok, err, indexResource] = await tryFn(() => this.database.createResource({
      name: this.indexResourceName,
      attributes: {
        id: 'string|required',
        resourceName: 'string|required',
        fieldName: 'string|required',
        word: 'string|required',
        recordIds: 'json|required',
        count: 'number|required',
        lastUpdated: 'string|required'
      },
      partitions: {
        byResource: { fields: { resourceName: 'string' } }
      },
      behavior: 'body-overflow'
    }));

    if (ok) {
      this.indexResource = indexResource as unknown as Resource;
    } else if (this.database.resources[this.indexResourceName]) {
      this.indexResource = this.database.resources[this.indexResourceName] as unknown as Resource ?? null;
    } else {
      throw err;
    }

    await this.loadIndexes();
    this.installDatabaseHooks();
    this.installIndexingHooks();
  }

  override async start(): Promise<void> {
    // Plugin is ready
  }

  override async stop(): Promise<void> {
    await this.saveIndexes();
    this.removeDatabaseHooks();
  }

  isInternalResource(name: string): boolean {
    return name === this.indexResourceName || name === 'plg_fulltext_indexes';
  }

  async loadIndexes(): Promise<void> {
    if (!this.indexResource) return;

    const [ok, , allIndexes] = await tryFn(() => this.indexResource!.getAll());
    if (ok && allIndexes) {
      for (const indexRecord of allIndexes) {
        const key = `${indexRecord.resourceName}:${indexRecord.fieldName}:${indexRecord.word}`;
        this.indexes.set(key, {
          recordIds: indexRecord.recordIds || [],
          count: indexRecord.count || 0
        });
      }
    }
  }

  async saveIndexes(): Promise<void> {
    if (!this.indexResource) return;

    const [ok] = await tryFn(async () => {
      for (const key of this.deletedIndexes) {
        const [resourceName] = key.split(':');
        const [queryOk, , results] = await tryFn(() =>
          this.indexResource!.query({ resourceName })
        );

        if (queryOk && results) {
          for (const index of results) {
            const indexKey = `${index.resourceName}:${index.fieldName}:${index.word}`;
            if (indexKey === key) {
              await this.indexResource!.delete(index.id);
            }
          }
        }
      }

      for (const key of this.dirtyIndexes) {
        const [resourceName, fieldName, word] = key.split(':');
        const data = this.indexes.get(key);

        if (!data) continue;

        const [queryOk, , results] = await tryFn(() =>
          this.indexResource!.query({ resourceName })
        );

        let existingRecord: IndexRecord | null = null;
        if (queryOk && results) {
          existingRecord = results.find(
            (index) => index.resourceName === resourceName &&
                      index.fieldName === fieldName &&
                      index.word === word
          ) || null;
        }

        if (existingRecord) {
          await this.indexResource!.update(existingRecord.id, {
            recordIds: data.recordIds,
            count: data.count,
            lastUpdated: new Date().toISOString()
          });
        } else {
          await this.indexResource!.insert({
            id: `index-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName,
            fieldName,
            word,
            recordIds: data.recordIds,
            count: data.count,
            lastUpdated: new Date().toISOString()
          });
        }
      }

      this.dirtyIndexes.clear();
      this.deletedIndexes.clear();
    });
  }

  installDatabaseHooks(): void {
    (this.database as any).addHook('afterCreateResource', (resource: any) => {
      if (!this.isInternalResource(resource.name)) {
        this.installResourceHooks(resource as Resource);
      }
    });
  }

  removeDatabaseHooks(): void {
    (this.database as any).removeHook('afterCreateResource', this.installResourceHooks.bind(this));
  }

  installIndexingHooks(): void {
    if (!(this.database as any).pluginRegistry) {
      (this.database as any).pluginRegistry = {};
    }
    (this.database as any).pluginRegistry.fulltext = this;

    for (const resource of Object.values(this.database.resources)) {
      if (this.isInternalResource(resource.name)) continue;
      this.installResourceHooks(resource as unknown as Resource);
    }

    if (!(this.database as any)._fulltextProxyInstalled) {
      (this.database as any)._previousCreateResourceForFullText = this.database.createResource;
      const self = this;
      (this.database as any).createResource = async function(this: any, ...args: [ResourceConfig]) {
        const resource = await this._previousCreateResourceForFullText!(...args);
        if (this.pluginRegistry?.fulltext && !this.pluginRegistry.fulltext.isInternalResource(resource.name)) {
          this.pluginRegistry.fulltext.installResourceHooks(resource);
        }
        return resource;
      };
      (this.database as any)._fulltextProxyInstalled = true;
    }

    for (const resource of Object.values(this.database.resources)) {
      if (!this.isInternalResource(resource.name)) {
        this.installResourceHooks(resource as unknown as Resource);
      }
    }
  }

  installResourceHooks(resource: Resource): void {
    resource._insert = resource.insert;
    resource._insertMany = resource.insertMany;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;

    this.wrapResourceMethod(resource as unknown as ResourceLike, 'insert', (async (result: unknown, args: unknown[], methodName: string) => {
      const data = result as Record<string, unknown>;
      const id = data.id as string;
      this.indexRecord(resource.name, id, data).catch(() => {});
      return data;
    }) as any);

    this.wrapResourceMethod(resource as unknown as ResourceLike, 'insertMany', (async (result: unknown, args: unknown[], methodName: string) => {
      const records = result as Record<string, unknown>[];
      for (const data of records) {
        const id = data.id as string;
        this.indexRecord(resource.name, id, data).catch(() => {});
      }
      return records;
    }) as any);

    this.wrapResourceMethod(resource as unknown as ResourceLike, 'update', (async (result: unknown, args: unknown[], methodName: string) => {
      const data = result as Record<string, unknown>;
      const [id] = args as [string];
      this.removeRecordFromIndex(resource.name, id).catch(() => {});
      this.indexRecord(resource.name, id, data).catch(() => {});
      return data;
    }) as any);

    this.wrapResourceMethod(resource as unknown as ResourceLike, 'delete', async (result: unknown, args: unknown[]) => {
      const [id] = args as [string];
      this.removeRecordFromIndex(resource.name, id).catch(() => {});
      return result;
    });

    this.wrapResourceMethod(resource as unknown as ResourceLike, 'deleteMany', async (result: unknown, args: unknown[]) => {
      const [ids] = args as [string[]];
      for (const id of ids) {
        this.removeRecordFromIndex(resource.name, id).catch(() => {});
      }
      return result;
    });
  }

  async indexRecord(resourceName: string, recordId: string, data: Record<string, unknown>): Promise<void> {
    const indexedFields = this.getIndexedFields(resourceName);
    if (!indexedFields || indexedFields.length === 0) {
      return;
    }

    for (const fieldName of indexedFields) {
      const fieldValue = this.getFieldValue(data, fieldName);
      if (!fieldValue) {
        continue;
      }

      const words = this.tokenize(fieldValue);

      for (const word of words) {
        if (word.length < this.config.minWordLength) {
          continue;
        }

        const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
        const existing = this.indexes.get(key) || { recordIds: [], count: 0 };

        if (!existing.recordIds.includes(recordId)) {
          existing.recordIds.push(recordId);
          existing.count = existing.recordIds.length;
        }

        this.indexes.set(key, existing);
        this.dirtyIndexes.add(key);
      }
    }
  }

  async removeRecordFromIndex(resourceName: string, recordId: string): Promise<void> {
    for (const [key, data] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        const index = data.recordIds.indexOf(recordId);
        if (index > -1) {
          data.recordIds.splice(index, 1);
          data.count = data.recordIds.length;

          if (data.recordIds.length === 0) {
            this.indexes.delete(key);
            this.deletedIndexes.add(key);
          } else {
            this.indexes.set(key, data);
            this.dirtyIndexes.add(key);
          }
        }
      }
    }
  }

  getFieldValue(data: Record<string, unknown>, fieldPath: string): unknown {
    if (!fieldPath.includes('.')) {
      return data && data[fieldPath] !== undefined ? data[fieldPath] : null;
    }

    const keys = fieldPath.split('.');
    let value: unknown = data;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return null;
      }
    }

    return value;
  }

  tokenize(text: unknown): string[] {
    if (!text) return [];

    const str = String(text).toLowerCase();

    return str
      .replace(/[^\w\s\u00C0-\u017F]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  getIndexedFields(resourceName: string): string[] {
    if (this.config.fields) {
      if (Array.isArray(this.config.fields)) {
        return this.config.fields;
      }
      return (this.config.fields as Record<string, string[]>)[resourceName] || [];
    }

    const fieldMappings: Record<string, string[]> = {
      users: ['name', 'email'],
      products: ['name', 'description'],
      articles: ['title', 'content'],
    };

    return fieldMappings[resourceName] || [];
  }

  async search(resourceName: string, query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      fields = null,
      limit = this.config.maxResults,
      offset = 0,
      exactMatch = false
    } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchWords = this.tokenize(query);
    const results = new Map<string, number>();

    const searchFields = fields || this.getIndexedFields(resourceName);
    if (searchFields.length === 0) {
      return [];
    }

    for (const word of searchWords) {
      if (word.length < this.config.minWordLength) continue;

      for (const fieldName of searchFields) {
        if (exactMatch) {
          const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
          const indexData = this.indexes.get(key);

          if (indexData) {
            for (const recordId of indexData.recordIds) {
              const currentScore = results.get(recordId) || 0;
              results.set(recordId, currentScore + 1);
            }
          }
        } else {
          for (const [key, indexData] of this.indexes.entries()) {
            if (key.startsWith(`${resourceName}:${fieldName}:${word.toLowerCase()}`)) {
              for (const recordId of indexData.recordIds) {
                const currentScore = results.get(recordId) || 0;
                results.set(recordId, currentScore + 1);
              }
            }
          }
        }
      }
    }

    const sortedResults = Array.from(results.entries())
      .map(([recordId, score]) => ({ recordId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit);

    return sortedResults;
  }

  async searchRecords(resourceName: string, query: string, options: SearchOptions = {}): Promise<SearchRecord[]> {
    const searchResults = await this.search(resourceName, query, options);

    if (searchResults.length === 0) {
      return [];
    }

    const resource = this.database.resources[resourceName]!;
    if (!resource) {
      throw new FulltextError(`Resource '${resourceName}' not found`, {
        operation: 'searchRecords',
        resourceName,
        query,
        availableResources: Object.keys(this.database.resources),
        suggestion: 'Check resource name or ensure resource is created before searching'
      });
    }

    const recordIds = searchResults.map(result => result.recordId);
    const records = await resource.getMany(recordIds);

    const result = records
      .filter(record => record && typeof record === 'object')
      .map(record => {
        const searchResult = searchResults.find(sr => sr.recordId === (record as Record<string, unknown>).id);
        return {
          ...record,
          _searchScore: searchResult ? searchResult.score : 0
        } as SearchRecord;
      })
      .sort((a, b) => b._searchScore - a._searchScore);

    return result;
  }

  async rebuildIndex(resourceName: string): Promise<void> {
    const resource = this.database.resources[resourceName]!;
    if (!resource) {
      throw new FulltextError(`Resource '${resourceName}' not found`, {
        operation: 'rebuildIndex',
        resourceName,
        availableResources: Object.keys(this.database.resources),
        suggestion: 'Check resource name or ensure resource is created before rebuilding index'
      });
    }

    for (const [key] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        this.indexes.delete(key);
      }
    }

    const allRecords = await resource.getAll();
    const batchSize = 100;

    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      for (const record of batch) {
        const [ok] = await tryFn(() => this.indexRecord(resourceName, record.id, record as unknown as Record<string, unknown>));
      }
    }

    await this.saveIndexes();
  }

  async getIndexStats(): Promise<IndexStats> {
    const stats: IndexStats = {
      totalIndexes: this.indexes.size,
      resources: {},
      totalWords: 0
    };

    for (const [key, data] of this.indexes.entries()) {
      const [resourceName, fieldName] = key.split(':') as [string, string];

      if (!stats.resources[resourceName]) {
        stats.resources[resourceName] = {
          fields: {},
          totalRecords: new Set<string>(),
          totalWords: 0
        };
      }

      if (!stats.resources[resourceName]!.fields[fieldName]) {
        stats.resources[resourceName].fields[fieldName] = {
          words: 0,
          totalOccurrences: 0
        };
      }

      stats.resources[resourceName].fields[fieldName].words++;
      stats.resources[resourceName].fields[fieldName].totalOccurrences += data.count;
      stats.resources[resourceName].totalWords++;

      for (const recordId of data.recordIds) {
        (stats.resources[resourceName].totalRecords as Set<string>).add(recordId);
      }

      stats.totalWords++;
    }

    for (const resourceName in stats.resources) {
      stats.resources[resourceName]!.totalRecords = (stats.resources[resourceName]!.totalRecords as Set<string>).size;
    }

    return stats;
  }

  async rebuildAllIndexes(options: RebuildOptions = {}): Promise<void> {
    const { timeout } = options;

    if (timeout) {
      return Promise.race([
        this._rebuildAllIndexesInternal(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
      ]);
    }
    return this._rebuildAllIndexesInternal();
  }

  private async _rebuildAllIndexesInternal(): Promise<void> {
    const resourceNames = Object.keys(this.database.resources).filter(name => !this.isInternalResource(name));

    for (const resourceName of resourceNames) {
      const [ok] = await tryFn(() => this.rebuildIndex(resourceName));
    }
  }

  async clearIndex(resourceName: string): Promise<void> {
    for (const [key] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        this.indexes.delete(key);
      }
    }

    await this.saveIndexes();
  }

  async clearAllIndexes(): Promise<void> {
    this.indexes.clear();
    await this.saveIndexes();
  }
}
