import { tryFn } from '../concerns/try-fn.js';
import { PartitionError } from '../errors.js';
import type { StringRecord } from '../types/common.types.js';

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
}

export interface CountParams {
  partition?: string | null;
  partitionValues?: StringRecord;
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
  offset?: number;
  size?: number;
  partition?: string | null;
  partitionValues?: StringRecord;
  skipCount?: boolean;
}

export interface PageResult {
  items: ResourceData[];
  totalItems: number | null;
  page: number;
  pageSize: number;
  totalPages: number | null;
  hasMore: boolean;
  _debug: {
    requestedSize: number;
    requestedOffset: number;
    actualItemsReturned: number;
    skipCount: boolean;
    hasTotalItems: boolean;
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

    return { partition: candidates[0].partition, partitionValues: candidates[0].partitionValues };
  }

  get client(): S3Client {
    return this.resource.client;
  }

  get partitions(): PartitionsConfig {
    return this.resource.config?.partitions || {};
  }

  async count({ partition = null, partitionValues = {} }: CountParams = {}): Promise<number> {
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

    const count = await this.client.count({ prefix });

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
        this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
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
        this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
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
    if (error.message.includes("Partition '") && error.message.includes("' not found")) {
      this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 1 });
      return [];
    }
    this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 1 });
    return [];
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
        this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
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
          this.resource.observers.map((x) => x.emit('error', this.resource.name, error, batchId));
        }
      });

      results.push(...batchResults.filter((item): item is ResourceData => item !== null));
    }

    return results;
  }

  async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false }: PageParams = {}): Promise<PageResult> {
    const effectiveSize = size > 0 ? size : 100;

    let totalItems: number | null = null;
    let totalPages: number | null = null;
    if (!skipCount) {
      totalItems = await this.count({ partition, partitionValues });
      totalPages = Math.ceil(totalItems / effectiveSize);
    }

    const page = Math.floor(offset / effectiveSize);
    const items = await this.list({ partition, partitionValues, limit: effectiveSize, offset });

    const pageResult: PageResult = {
      items,
      totalItems,
      page,
      pageSize: effectiveSize,
      totalPages,
      hasMore: items.length === effectiveSize && (offset + effectiveSize) < (totalItems || Infinity),
      _debug: {
        requestedSize: size,
        requestedOffset: offset,
        actualItemsReturned: items.length,
        skipCount,
        hasTotalItems: totalItems !== null
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
