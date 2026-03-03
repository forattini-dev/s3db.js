import { tryFn } from '../concerns/try-fn.js';
import { isNotFoundError } from '../concerns/s3-errors.js';
import { PartitionError, mapAwsError } from '../errors.js';
import type { StringRecord } from '../types/common.types.js';
import { createHash } from 'node:crypto';

export interface PartitionFields {
  [fieldName: string]: string;
}

export interface PartitionDefinition {
  fields: PartitionFields;
}

export interface PartitionsConfig {
  [partitionName: string]: PartitionDefinition;
}

export interface ResourceConfig {
  partitions?: PartitionsConfig;
}

export interface S3Client {
  count(params: { prefix: string }): Promise<number>;
  getKeysPage(params: { prefix: string; offset: number; amount: number }): Promise<string[]>;
  listObjects(params: { prefix: string; maxKeys: number; continuationToken?: string | null }): Promise<{
    Contents?: Array<{ Key: string }>;
    IsTruncated?: boolean;
    NextContinuationToken?: string | null;
  }>;
}

export interface Observer {
  emit(event: string, ...args: unknown[]): void;
}

export interface BatchOptions {
  onItemError?: (error: Error, index: number) => void | StringRecord;
}

export interface BatchResult<T> {
  results: Array<T | null>;
  errors: Array<{ error: Error; index: number }>;
}

export interface ResourceData extends StringRecord {
  id?: string;
  _partition?: string;
  _partitionValues?: StringRecord;
  _decryptionFailed?: boolean;
  _error?: string;
}

export interface Resource {
  name: string;
  client: S3Client;
  config: ResourceConfig;
  observers: Observer[];

  executeHooks(hookName: string, data: unknown): Promise<unknown>;
  get(id: string): Promise<ResourceData>;
  applyPartitionRule(value: unknown, rule: string): string;
  buildPartitionPrefix(partition: string, partitionDef: PartitionDefinition, partitionValues: StringRecord): string;
  extractPartitionValuesFromKey(id: string, keys: string[], sortedFields: Array<[string, string]>): StringRecord;
  emit(event: string, ...args: unknown[]): void;
  _emitStandardized(event: string, data: unknown): void;
  _executeBatchHelper<T>(
    operations: Array<() => Promise<T>>,
    options?: BatchOptions
  ): Promise<BatchResult<T>>;
  cache?: ResourceQueryCacheNamespace;
  getCacheNamespace?(name?: string | null): ResourceQueryCacheNamespace | null;
}

export interface ResourceQueryCacheNamespace {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<unknown>;
}

export interface CountParams {
  partition?: string | null;
  partitionValues?: StringRecord;
  skipCache?: boolean;
}

export interface ListIdsParams {
  partition?: string | null;
  partitionValues?: StringRecord;
  limit?: number;
  offset?: number;
}

export interface ListParams {
  partition?: string | null;
  partitionValues?: StringRecord;
  limit?: number;
  offset?: number;
}

export interface PageParams {
  page?: number;
  size?: number;
  partition?: string | null;
  partitionValues?: StringRecord;
  skipCount?: boolean;
  cursor?: string | null;
}

export interface PageResult {
  items: ResourceData[];
  totalItems: number | null;
  page: number | null;
  pageSize: number;
  totalPages: number | null;
  hasMore: boolean;
  nextCursor?: string | null;
  _debug: {
    requestedSize: number;
    requestedOffset: number;
    actualItemsReturned: number;
    skipCount: boolean;
    hasTotalItems: boolean;
    usedCursor?: boolean;
    hasNextCursor?: boolean;
    error?: string;
  };
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  partition?: string | null;
  partitionValues?: StringRecord;
}

interface PartitionPlannerCandidate {
  partition: string;
  partitionValues: StringRecord;
  matchCount: number;
  totalFields: number;
}

interface CursorPayload {
  v: number;
  prefix: string;
  token: string | null;
  pageSize: number;
}

function encodeCursorPayload(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeCursorPayload(cursor: string): CursorPayload | null {
  try {
    const normalized = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as CursorPayload;

    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== 1) return null;
    if (typeof parsed.prefix !== 'string') return null;
    if (parsed.token !== null && typeof parsed.token !== 'string') return null;
    if (typeof parsed.pageSize !== 'number' || !Number.isFinite(parsed.pageSize) || parsed.pageSize <= 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

export class ResourceQuery {
  resource: Resource;

  constructor(resource: Resource) {
    this.resource = resource;
  }

  private isUsablePartitionFilterValue(value: unknown): boolean {
    return value !== undefined && value !== null;
  }

  private buildPlannerCandidateForPartition(
    filter: StringRecord,
    partitionName: string,
    partitionDef: PartitionDefinition
  ): PartitionPlannerCandidate | null {
    const fields = partitionDef?.fields || {};
    const partitionValues: StringRecord = {};
    let matchCount = 0;
    const totalFields = Object.keys(fields).length;

    for (const [fieldName, rule] of Object.entries(fields)) {
      if (!Object.prototype.hasOwnProperty.call(filter, fieldName)) {
        continue;
      }

      const value = filter[fieldName];
      if (!this.isUsablePartitionFilterValue(value)) {
        continue;
      }

      partitionValues[fieldName] = this.resource.applyPartitionRule(value, rule);
      matchCount++;
    }

    if (matchCount === 0) {
      return null;
    }

    return {
      partition: partitionName,
      partitionValues,
      matchCount,
      totalFields
    };
  }

  private resolvePartitionFromFilter(filter: StringRecord): { partition: string; partitionValues: StringRecord } | null {
    const partitionEntries = Object.entries(this.partitions);
    if (partitionEntries.length === 0) {
      return null;
    }

    const candidates: PartitionPlannerCandidate[] = [];

    for (const [partitionName, partitionDef] of partitionEntries) {
      if (!partitionDef || !partitionDef.fields || Object.keys(partitionDef.fields).length === 0) {
        continue;
      }

      const candidate = this.buildPlannerCandidateForPartition(filter, partitionName, partitionDef);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount;
      }

      if (a.totalFields !== b.totalFields) {
        return a.totalFields - b.totalFields;
      }

      return a.partition.localeCompare(b.partition);
    });

    const bestCandidate = candidates[0];
    if (!bestCandidate) {
      return null;
    }

    return {
      partition: bestCandidate.partition,
      partitionValues: bestCandidate.partitionValues
    };
  }

  get client(): S3Client {
    return this.resource.client;
  }

  get partitions(): PartitionsConfig {
    return this.resource.config?.partitions || {};
  }

  private _getCacheNamespace(): ResourceQueryCacheNamespace | null {
    const namespaceFromAccessor = typeof this.resource.getCacheNamespace === 'function'
      ? this.resource.getCacheNamespace()
      : null;
    const namespace = namespaceFromAccessor || this.resource.cache || null;

    if (!namespace || typeof namespace.get !== 'function' || typeof namespace.set !== 'function') {
      return null;
    }

    return namespace;
  }

  private _hashValue(value: unknown): string {
    const replacer = (_key: string, val: unknown): unknown => {
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        return val;
      }

      const sorted = Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(sorted);
    };

    const serialized = JSON.stringify(value ?? {}, replacer);
    return createHash('sha1').update(serialized).digest('hex').slice(0, 16);
  }

  private _buildCountMetaCacheKey(partition: string | null, partitionValues: StringRecord): string {
    const partitionName = partition || 'main';
    const valuesHash = this._hashValue(partitionValues || {});
    return `resource=${this.resource.name}/meta/count/partition=${partitionName}/values=${valuesHash}.json`;
  }

  private _buildCursorCheckpointCacheKey({
    page,
    size,
    partition,
    partitionValues
  }: {
    page: number;
    size: number;
    partition: string | null;
    partitionValues: StringRecord;
  }): string {
    const partitionName = partition || 'main';
    const valuesHash = this._hashValue(partitionValues || {});
    return `resource=${this.resource.name}/meta/cursor-checkpoint/partition=${partitionName}/size=${size}/values=${valuesHash}/page=${page}.json`;
  }

  private _normalizeCachedCount(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).count === 'number') {
      const cachedCount = (value as Record<string, unknown>).count as number;
      return Number.isFinite(cachedCount) ? cachedCount : null;
    }

    return null;
  }

  private _normalizeCachedCursor(value: unknown): string | null | undefined {
    if (value === null) return null;
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return undefined;

    const cursor = (value as Record<string, unknown>).cursor;
    if (cursor === null) return null;
    if (typeof cursor === 'string') return cursor;
    return undefined;
  }

  private async _getCheckpointCursorForPage({
    page,
    size,
    partition,
    partitionValues
  }: {
    page: number;
    size: number;
    partition: string | null;
    partitionValues: StringRecord;
  }): Promise<string | null | undefined> {
    const cache = this._getCacheNamespace();
    if (!cache) return undefined;

    const key = this._buildCursorCheckpointCacheKey({ page, size, partition, partitionValues });
    return this._normalizeCachedCursor(await cache.get(key));
  }

  private async _setCheckpointCursorForPage({
    page,
    size,
    partition,
    partitionValues,
    cursor
  }: {
    page: number;
    size: number;
    partition: string | null;
    partitionValues: StringRecord;
    cursor: string | null;
  }): Promise<void> {
    const cache = this._getCacheNamespace();
    if (!cache) return;

    const key = this._buildCursorCheckpointCacheKey({ page, size, partition, partitionValues });
    await cache.set(key, {
      cursor,
      cachedAt: Date.now()
    });
  }

  async count({ partition = null, partitionValues = {}, skipCache = false }: CountParams = {}): Promise<number> {
    await this.resource.executeHooks('beforeCount', { partition, partitionValues });

    let prefix: string;

    if (partition && Object.keys(partitionValues).length > 0) {
      const partitionDef = this.partitions[partition];
      if (!partitionDef) {
        throw new PartitionError(`Partition '${partition}' not found`, {
          resourceName: this.resource.name,
          partitionName: partition,
          operation: 'count'
        });
      }

      const partitionSegments: string[] = [];
      const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
      for (const [fieldName, rule] of sortedFields) {
        const value = partitionValues[fieldName];
        if (value !== undefined && value !== null) {
          const transformedValue = this.resource.applyPartitionRule(value, rule);
          partitionSegments.push(`${fieldName}=${transformedValue}`);
        }
      }

      if (partitionSegments.length > 0) {
        prefix = `resource=${this.resource.name}/partition=${partition}/${partitionSegments.join('/')}`;
      } else {
        prefix = `resource=${this.resource.name}/partition=${partition}`;
      }
    } else {
      prefix = `resource=${this.resource.name}/data`;
    }

    const cache = this._getCacheNamespace();
    const countCacheKey = this._buildCountMetaCacheKey(partition, partitionValues);

    if (!skipCache && cache) {
      const cachedCount = this._normalizeCachedCount(await cache.get(countCacheKey));
      if (cachedCount !== null) {
        await this.resource.executeHooks('afterCount', { count: cachedCount, partition, partitionValues });
        this.resource._emitStandardized('count', cachedCount);
        return cachedCount;
      }
    }

    const count = await this.client.count({ prefix });

    if (!skipCache && cache) {
      await cache.set(countCacheKey, { count, cachedAt: Date.now() });
    }

    await this.resource.executeHooks('afterCount', { count, partition, partitionValues });

    this.resource._emitStandardized('count', count);
    return count;
  }

  async listIds({ partition = null, partitionValues = {}, limit, offset = 0 }: ListIdsParams = {}): Promise<string[]> {
    let prefix: string;
    if (partition && Object.keys(partitionValues).length > 0) {
      if (!this.partitions[partition]) {
        throw new PartitionError(`Partition '${partition}' not found`, {
          resourceName: this.resource.name,
          partitionName: partition,
          operation: 'listIds'
        });
      }
      const partitionDef = this.partitions[partition];
      const partitionSegments: string[] = [];
      const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
      for (const [fieldName, rule] of sortedFields) {
        const value = partitionValues[fieldName];
        if (value !== undefined && value !== null) {
          const transformedValue = this.resource.applyPartitionRule(value, rule);
          partitionSegments.push(`${fieldName}=${transformedValue}`);
        }
      }
      if (partitionSegments.length > 0) {
        prefix = `resource=${this.resource.name}/partition=${partition}/${partitionSegments.join('/')}`;
      } else {
        prefix = `resource=${this.resource.name}/partition=${partition}`;
      }
    } else {
      prefix = `resource=${this.resource.name}/data`;
    }

    const keys = await this.client.getKeysPage({
      prefix,
      offset: offset,
      amount: limit || 1000,
    });

    const ids = keys.map((key) => {
      const parts = key.split('/');
      const idPart = parts.find(part => part.startsWith('id='));
      return idPart ? idPart.replace('id=', '') : null;
    }).filter((id): id is string => id !== null);

    this.resource._emitStandardized('listed-ids', ids.length);
    return ids;
  }

  async list({ partition = null, partitionValues = {}, limit, offset = 0 }: ListParams = {}): Promise<ResourceData[]> {
    await this.resource.executeHooks('beforeList', { partition, partitionValues, limit, offset });

    const [ok, err, result] = await tryFn(async () => {
      if (!partition) {
        return this.listMain({ limit, offset });
      }
      return this.listPartition({ partition, partitionValues, limit, offset });
    });

    if (!ok) {
      return this.handleListError(err as Error, { partition, partitionValues });
    }

    return this.resource.executeHooks('afterList', result) as Promise<ResourceData[]>;
  }

  async listMain({ limit, offset = 0 }: { limit?: number; offset?: number }): Promise<ResourceData[]> {
    const [ok, err, ids] = await tryFn<string[]>(() => this.listIds({ limit, offset }));
    if (!ok || !ids) throw err;
    const results = await this.processListResults(ids, 'main');
    this.resource._emitStandardized('list', { count: results.length, errors: 0 });
    return results;
  }

  async listPartition({ partition, partitionValues, limit, offset = 0 }: {
    partition: string;
    partitionValues: StringRecord;
    limit?: number;
    offset?: number;
  }): Promise<ResourceData[]> {
    if (!this.partitions[partition]) {
      this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 0 });
      return [];
    }

    const partitionDef = this.partitions[partition];
    const prefix = this.resource.buildPartitionPrefix(partition, partitionDef, partitionValues);

    const [ok, err, keys] = await tryFn<string[]>(() => this.client.getKeysPage({
      prefix,
      offset,
      amount: limit || 1000
    }));

    if (!ok || !keys) throw err;

    const filteredIds = this.extractIdsFromKeys(keys);
    const results = await this.processPartitionResults(filteredIds, partition, partitionDef, keys);

    this.resource._emitStandardized('list', { partition, partitionValues, count: results.length, errors: 0 });
    return results;
  }

  extractIdsFromKeys(keys: string[]): string[] {
    return keys
      .map(key => {
        const parts = key.split('/');
        const idPart = parts.find(part => part.startsWith('id='));
        return idPart ? idPart.replace('id=', '') : null;
      })
      .filter((id): id is string => id !== null);
  }

  async processListResults(ids: string[], context: string = 'main'): Promise<ResourceData[]> {
    const operations = ids.map((id) => async () => {
      const [ok, err, result] = await tryFn<ResourceData>(() => this.resource.get(id));
      if (ok && result) {
        return result;
      }
      return this.handleResourceError(err as Error, id, context);
    });

    const { results } = await this.resource._executeBatchHelper(operations, {
      onItemError: (error, index) => {
        this.resource.emit('error', error, ids[index]);
        this.resource.observers.forEach((x) => x.emit('error', this.resource.name, error, ids[index]));
      }
    });

    this.resource._emitStandardized('list', { count: results.length, errors: 0 });
    return results.filter((r): r is ResourceData => r !== null);
  }

  async processPartitionResults(
    ids: string[],
    partition: string,
    partitionDef: PartitionDefinition,
    keys: string[]
  ): Promise<ResourceData[]> {
    const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b)) as Array<[string, string]>;

    const operations = ids.map((id) => async () => {
      const [ok, err, result] = await tryFn<ResourceData>(async () => {
        const actualPartitionValues = this.resource.extractPartitionValuesFromKey(id, keys, sortedFields);
        const data = await this.resource.get(id);
        data._partition = partition;
        data._partitionValues = actualPartitionValues;
        return data;
      });
      if (ok && result) return result;
      return this.handleResourceError(err as Error, id, 'partition');
    });

    const { results } = await this.resource._executeBatchHelper(operations, {
      onItemError: (error, index) => {
        this.resource.emit('error', error, ids[index]);
        this.resource.observers.forEach((x) => x.emit('error', this.resource.name, error, ids[index]));
      }
    });

    return results.filter((item): item is ResourceData => item !== null);
  }

  handleResourceError(error: Error, id: string, context: string): ResourceData {
    if (error.message.includes('Cipher job failed') || error.message.includes('OperationError')) {
      return {
        id,
        _decryptionFailed: true,
        _error: error.message,
        ...(context === 'partition' && { _partition: context })
      };
    }
    throw error;
  }

  handleListError(error: Error, { partition, partitionValues }: { partition: string | null; partitionValues: StringRecord }): ResourceData[] {
    if (error instanceof PartitionError || isNotFoundError(error)) {
      this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 0 });
      return [];
    }

    this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 1 });

    if (error && typeof error === 'object') {
      const errObj = error as unknown as Record<string, unknown>;
      if ('statusCode' in errObj || 'retriable' in errObj) {
        throw error;
      }
    }

    throw mapAwsError(error, {
      resourceName: this.resource.name,
      operation: 'list'
    });
  }

  async getMany(ids: string[]): Promise<ResourceData[]> {
    await this.resource.executeHooks('beforeGetMany', { ids });

    const operations = ids.map((id) => async () => {
      const [ok, err, data] = await tryFn<ResourceData>(() => this.resource.get(id));
      if (ok && data) return data;
      const error = err as Error;
      if (error.message.includes('Cipher job failed') || error.message.includes('OperationError')) {
        return {
          id,
          _decryptionFailed: true,
          _error: error.message
        } as ResourceData;
      }
      throw error;
    });

    const { results } = await this.resource._executeBatchHelper(operations, {
      onItemError: (error, index) => {
        this.resource.emit('error', error, ids[index]);
        this.resource.observers.forEach((x) => x.emit('error', this.resource.name, error, ids[index]));
        return {
          id: ids[index],
          _error: error.message,
          _decryptionFailed: error.message.includes('Cipher job failed') || error.message.includes('OperationError')
        };
      }
    });

    const finalResults = await this.resource.executeHooks('afterGetMany', results.filter((r): r is ResourceData => r !== null)) as ResourceData[];

    this.resource._emitStandardized('fetched-many', ids.length);
    return finalResults;
  }

  async getAll(): Promise<ResourceData[]> {
    const ids: string[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const [okIds, errIds, page] = await tryFn<string[]>(() => this.listIds({ limit: pageSize, offset }));
      if (!okIds || !page) throw errIds;

      ids.push(...page);
      if (page.length < pageSize) {
        break;
      }

      offset += page.length;
    }

    if (ids.length === 0) {
      return [];
    }

    const results: ResourceData[] = [];
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);

      const operations = batchIds.map((id) => async () => {
        const [ok, err, item] = await tryFn<ResourceData>(() => this.resource.get(id));
        if (ok && item) return item;
        return this.handleResourceError(err as Error, id, 'getAll');
      });

      const { results: batchResults } = await this.resource._executeBatchHelper(operations, {
        onItemError: (error, index) => {
          const batchId = batchIds[index];
          this.resource.emit('error', error, batchId);
          this.resource.observers.forEach((x) => x.emit('error', this.resource.name, error, batchId));
        }
      });

      results.push(...batchResults.filter((item): item is ResourceData => item !== null));
    }

    return results;
  }

  private _buildPagePrefix(partition: string | null, partitionValues: StringRecord): { prefix: string; partitionDef: PartitionDefinition | null } {
    if (!partition) {
      return {
        prefix: `resource=${this.resource.name}/data`,
        partitionDef: null
      };
    }

    const partitionDef = this.partitions[partition];
    if (!partitionDef) {
      throw new PartitionError(`Partition '${partition}' not found`, {
        resourceName: this.resource.name,
        partitionName: partition,
        operation: 'page'
      });
    }

    return {
      prefix: this.resource.buildPartitionPrefix(partition, partitionDef, partitionValues),
      partitionDef
    };
  }

  private async _listPageByCursor({
    cursor,
    size,
    partition,
    partitionValues
  }: {
    cursor: string | null;
    size: number;
    partition: string | null;
    partitionValues: StringRecord;
  }): Promise<{ items: ResourceData[]; nextCursor: string | null }> {
    const { prefix, partitionDef } = this._buildPagePrefix(partition, partitionValues);
    let continuationToken: string | null = null;

    if (cursor) {
      const decoded = decodeCursorPayload(cursor);
      if (!decoded || decoded.prefix !== prefix || decoded.pageSize !== size) {
        throw new PartitionError('Invalid pagination cursor', {
          resourceName: this.resource.name,
          partitionName: partition || undefined,
          operation: 'page',
          cursor
        });
      }

      continuationToken = decoded.token;
    }

    const response = await this.client.listObjects({
      prefix,
      maxKeys: size,
      continuationToken
    });

    const keys = (response.Contents ?? [])
      .map(item => item.Key)
      .filter((key): key is string => typeof key === 'string' && key.length > 0);
    const ids = this.extractIdsFromKeys(keys);

    let items: ResourceData[];
    if (partition && partitionDef) {
      items = await this.processPartitionResults(ids, partition, partitionDef, keys);
    } else {
      items = await this.processListResults(ids, 'cursor');
    }

    const nextToken = response.IsTruncated ? (response.NextContinuationToken ?? null) : null;
    const nextCursor = nextToken
      ? encodeCursorPayload({
          v: 1,
          prefix,
          token: nextToken,
          pageSize: size
        })
      : null;

    return {
      items,
      nextCursor
    };
  }

  private async _listPageByPageNumber({
    page,
    size,
    partition,
    partitionValues
  }: {
    page: number;
    size: number;
    partition: string | null;
    partitionValues: StringRecord;
  }): Promise<{ items: ResourceData[]; nextCursor: string | null }> {
    const targetPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

    await this._setCheckpointCursorForPage({
      page: 1,
      size,
      partition,
      partitionValues,
      cursor: null
    });

    if (targetPage === 1) {
      const firstResult = await this._listPageByCursor({
        cursor: null,
        size,
        partition,
        partitionValues
      });

      await this._setCheckpointCursorForPage({
        page: 2,
        size,
        partition,
        partitionValues,
        cursor: firstResult.nextCursor
      });

      return firstResult;
    }

    let startCursor = await this._getCheckpointCursorForPage({
      page: targetPage,
      size,
      partition,
      partitionValues
    });

    if (startCursor === undefined) {
      let cursor: string | null = null;
      let exhausted = false;

      for (let currentPage = 1; currentPage < targetPage; currentPage++) {
        const nextPage = currentPage + 1;

        const cachedCursor = await this._getCheckpointCursorForPage({
          page: nextPage,
          size,
          partition,
          partitionValues
        });

        if (cachedCursor !== undefined) {
          cursor = cachedCursor;
          if (cachedCursor === null) {
            exhausted = true;
            break;
          }
          continue;
        }

        const currentPageResult = await this._listPageByCursor({
          cursor,
          size,
          partition,
          partitionValues
        });

        await this._setCheckpointCursorForPage({
          page: nextPage,
          size,
          partition,
          partitionValues,
          cursor: currentPageResult.nextCursor
        });

        cursor = currentPageResult.nextCursor;
        if (!cursor) {
          exhausted = true;
          break;
        }
      }

      if (exhausted && cursor === null) {
        return { items: [], nextCursor: null };
      }

      startCursor = cursor;
    }

    if (startCursor === null) {
      return { items: [], nextCursor: null };
    }

    const targetResult = await this._listPageByCursor({
      cursor: startCursor,
      size,
      partition,
      partitionValues
    });

    await this._setCheckpointCursorForPage({
      page: targetPage + 1,
      size,
      partition,
      partitionValues,
      cursor: targetResult.nextCursor
    });

    return targetResult;
  }

  async page(params: PageParams = {}): Promise<PageResult> {
    const {
      page,
      size = 100,
      partition = null,
      partitionValues = {},
      cursor = null
    } = params;
    const effectiveSize = size > 0 ? size : 100;
    const offsetOptionProvided = Object.prototype.hasOwnProperty.call(params, 'offset');
    const cursorOptionProvided = Object.prototype.hasOwnProperty.call(params, 'cursor');
    const pageOptionProvided = Object.prototype.hasOwnProperty.call(params, 'page');
    const normalizedPage = typeof page === 'number' && Number.isFinite(page)
      ? Math.floor(page)
      : null;
    const normalizedCursor = typeof cursor === 'string' && cursor.trim().length > 0
      ? cursor.trim()
      : null;
    const usingPageNumber = pageOptionProvided;

    if (offsetOptionProvided) {
      throw new PartitionError('Offset pagination is not supported', {
        resourceName: this.resource.name,
        partitionName: partition || undefined,
        operation: 'page'
      });
    }

    if (usingPageNumber && (normalizedPage === null || normalizedPage < 1)) {
      throw new PartitionError('Invalid pagination page number', {
        resourceName: this.resource.name,
        partitionName: partition || undefined,
        operation: 'page',
        page
      });
    }

    if (usingPageNumber && cursorOptionProvided) {
      throw new PartitionError('Cannot combine page number and cursor in the same request', {
        resourceName: this.resource.name,
        partitionName: partition || undefined,
        operation: 'page',
        page,
        cursor
      });
    }

    const currentPage = usingPageNumber
      ? normalizedPage!
      : null;
    let items: ResourceData[] = [];
    let nextCursor: string | null = null;

    if (usingPageNumber) {
      const pageResult = await this._listPageByPageNumber({
        page: normalizedPage!,
        size: effectiveSize,
        partition,
        partitionValues
      });
      items = pageResult.items;
      nextCursor = pageResult.nextCursor;
    } else {
      const cursorResult = await this._listPageByCursor({
        cursor: normalizedCursor,
        size: effectiveSize,
        partition,
        partitionValues
      });
      items = cursorResult.items;
      nextCursor = cursorResult.nextCursor;
    }

    const pageResult: PageResult = {
      items,
      totalItems: null,
      page: currentPage,
      pageSize: effectiveSize,
      totalPages: null,
      hasMore: Boolean(nextCursor),
      nextCursor,
      _debug: {
        requestedSize: size,
        requestedOffset: 0,
        actualItemsReturned: items.length,
        skipCount: false,
        hasTotalItems: false,
        usedCursor: !usingPageNumber,
        hasNextCursor: Boolean(nextCursor)
      }
    };
    this.resource._emitStandardized('paginated', pageResult);
    return pageResult;
  }

  async query(filter: StringRecord = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} }: QueryOptions = {}): Promise<ResourceData[]> {
    await this.resource.executeHooks('beforeQuery', { filter, limit, offset, partition, partitionValues });

    if (Object.keys(filter).length === 0) {
      return await this.list({ partition, partitionValues, limit, offset });
    }

    let queryPartition = partition;
    let queryPartitionValues = partitionValues;

    if (!partition) {
      const plannedPartition = this.resolvePartitionFromFilter(filter);
      if (plannedPartition) {
        queryPartition = plannedPartition.partition;
        queryPartitionValues = plannedPartition.partitionValues;
      }
    }

    const results: ResourceData[] = [];
    let currentOffset = offset;
    const batchSize = Math.min(limit, 50);

    while (results.length < limit) {
      const batch = await this.list({
        partition: queryPartition,
        partitionValues: queryPartitionValues,
        limit: batchSize,
        offset: currentOffset
      });

      if (batch.length === 0) {
        break;
      }

      const filteredBatch = batch.filter(doc => {
        return Object.entries(filter).every(([key, value]) => {
          return doc[key] === value;
        });
      });

      results.push(...filteredBatch);
      currentOffset += batchSize;

      if (batch.length < batchSize) {
        break;
      }
    }

    const finalResults = results.slice(0, limit);

    return await this.resource.executeHooks('afterQuery', finalResults) as ResourceData[];
  }
}

export default ResourceQuery;
