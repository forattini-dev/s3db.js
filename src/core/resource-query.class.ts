import { tryFn } from '../concerns/try-fn.js';
import { isNotFoundError } from '../concerns/s3-errors.js';
import { metadataEncode } from '../concerns/metadata-encoding.js';
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
  getContinuationTokenAfterOffset?(params: { prefix?: string; offset?: number }): Promise<string | null>;
  getFilteredObjectsPage?(params: {
    prefix: string;
    offset?: number;
    amount?: number;
    filters?: Array<{
      metadataPath: string;
      metadataValue: string;
      mappedBodyPath?: string | null;
      mappedBodyValue?: string | null;
      rawBodyPath?: string | null;
      rawBodyValue?: string | null;
    }>;
  }): Promise<BulkGetObjectResponse[]>;
  listObjects(params: { prefix: string; maxKeys: number; continuationToken?: string | null }): Promise<{
    Contents?: Array<{ Key: string }>;
    IsTruncated?: boolean;
    NextContinuationToken?: string | null;
  }>;
  getObjects?(keys: string[]): Promise<BulkGetObjectResponse[]>;
}

export interface ClientObjectResponse {
  Metadata?: StringRecord<string>;
  ContentLength?: number;
  ContentType?: string;
  LastModified?: Date;
  ETag?: string;
  VersionId?: string;
  Expiration?: string;
  Body?: {
    transformToByteArray(): Promise<Uint8Array>;
  };
}

export interface BulkGetObjectResponse {
  key: string;
  object: ClientObjectResponse;
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
  schema: {
    mapper(data: StringRecord): Promise<StringRecord>;
  };

  executeHooks(hookName: string, data: unknown): Promise<unknown>;
  get(id: string): Promise<ResourceData>;
  getResourceKey(id: string): string;
  hydrateClientObject(id: string, request: ClientObjectResponse): Promise<ResourceData>;
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

      partitionValues[fieldName] = value;
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

  private enrichPartitionValuesFromFilter(
    partition: string | null,
    partitionValues: StringRecord,
    filter: StringRecord
  ): StringRecord {
    if (!partition) {
      return { ...partitionValues };
    }

    const partitionDef = this.partitions[partition];
    if (!partitionDef?.fields) {
      return { ...partitionValues };
    }

    const enrichedValues: StringRecord = { ...partitionValues };

    for (const fieldName of Object.keys(partitionDef.fields)) {
      if (Object.prototype.hasOwnProperty.call(enrichedValues, fieldName)) {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(filter, fieldName)) {
        continue;
      }

      const value = filter[fieldName];
      if (!this.isUsablePartitionFilterValue(value)) {
        continue;
      }

      enrichedValues[fieldName] = value;
    }

    return enrichedValues;
  }

  get client(): S3Client {
    return this.resource.client;
  }

  get partitions(): PartitionsConfig {
    return this.resource.config?.partitions || {};
  }

  private _supportsBulkObjectReads(): boolean {
    return typeof this.client.getObjects === 'function';
  }

  private async _getBulkObjectMap(ids: string[]): Promise<Map<string, ClientObjectResponse> | null> {
    if (ids.length <= 1 || !this._supportsBulkObjectReads()) {
      return null;
    }

    const keys = ids.map((id) => this.resource.getResourceKey(id));
    const [ok, , objects] = await tryFn<BulkGetObjectResponse[]>(() => this.client.getObjects!(keys));
    if (!ok || !objects) {
      return null;
    }

    const objectMap = new Map<string, ClientObjectResponse>();
    for (const entry of objects) {
      if (entry && typeof entry.key === 'string' && entry.object) {
        objectMap.set(entry.key, entry.object);
      }
    }

    return objectMap;
  }

  private async _hydrateResourceData(
    id: string,
    context: string,
    objectMap: Map<string, ClientObjectResponse> | null,
    decorate?: (data: ResourceData) => Promise<ResourceData> | ResourceData
  ): Promise<ResourceData> {
    const resourceKey = this.resource.getResourceKey(id);
    const bulkObject = objectMap?.get(resourceKey);

    const [ok, err, result] = await tryFn<ResourceData>(async () => {
      let data: ResourceData;

      if (bulkObject) {
        await this.resource.executeHooks('beforeGet', { id });
        data = await this.resource.hydrateClientObject(id, bulkObject);
      } else {
        data = await this.resource.get(id);
      }

      if (decorate) {
        data = await decorate(data);
      }

      return data;
    });

    if (ok && result) {
      return result;
    }

    return this.handleResourceError(err as Error, id, context);
  }

  private _buildResidualFilter(
    filter: StringRecord,
    partition: string | null,
    partitionValues: StringRecord
  ): StringRecord {
    if (!partition) {
      return { ...filter };
    }

    const partitionDef = this.partitions[partition];
    if (!partitionDef?.fields) {
      return { ...filter };
    }

    const residualFilter: StringRecord = { ...filter };

    for (const [fieldName, rule] of Object.entries(partitionDef.fields)) {
      if (!Object.prototype.hasOwnProperty.call(residualFilter, fieldName)) {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(partitionValues, fieldName)) {
        continue;
      }

      const plannedValue = this.resource.applyPartitionRule(partitionValues[fieldName], rule);
      const filteredValue = this.resource.applyPartitionRule(residualFilter[fieldName], rule);

      if (plannedValue === filteredValue) {
        delete residualFilter[fieldName];
      }
    }

    return residualFilter;
  }

  private _supportsFilteredObjectPages(): boolean {
    return typeof this.client.getFilteredObjectsPage === 'function';
  }

  private _sanitizeMetadataKey(key: string): string {
    return String(key).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
  }

  private _escapeJsonPathSegment(segment: string): string {
    return String(segment).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private _buildLiteralJsonPath(key: string): string {
    return `$."${this._escapeJsonPathSegment(key)}"`;
  }

  private _buildNestedJsonPath(key: string): string {
    const segments = String(key || '').split('.').filter(Boolean);
    if (segments.length === 0) {
      return '$';
    }

    return `$${segments.map((segment) => `."${this._escapeJsonPathSegment(segment)}"`).join('')}`;
  }

  private _normalizeJsonComparisonValue(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }

    return null;
  }

  private _getNestedFieldValue(data: StringRecord, fieldPath: string): unknown {
    if (!fieldPath.includes('.')) {
      return data[fieldPath];
    }

    const segments = fieldPath.split('.');
    let current: unknown = data;

    for (const segment of segments) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        return undefined;
      }

      current = (current as StringRecord)[segment];
    }

    return current;
  }

  private _extractPartitionValuesFromData(data: ResourceData, partitionDef: PartitionDefinition): StringRecord {
    const values: StringRecord = {};

    for (const [fieldName, rule] of Object.entries(partitionDef.fields || {})) {
      const fieldValue = this._getNestedFieldValue(data, fieldName);
      if (!this.isUsablePartitionFilterValue(fieldValue)) {
        continue;
      }

      values[fieldName] = this.resource.applyPartitionRule(fieldValue, rule) as string;
    }

    return values;
  }

  private async _buildFilteredObjectPageFilters(filter: StringRecord): Promise<Array<{
    metadataPath: string;
    metadataValue: string;
    mappedBodyPath?: string | null;
    mappedBodyValue?: string | null;
    rawBodyPath?: string | null;
    rawBodyValue?: string | null;
  }> | null> {
    if (!this._supportsFilteredObjectPages()) {
      return null;
    }

    const filters: Array<{
      metadataPath: string;
      metadataValue: string;
      mappedBodyPath?: string | null;
      mappedBodyValue?: string | null;
      rawBodyPath?: string | null;
      rawBodyValue?: string | null;
    }> = [];

    for (const [fieldName, rawValue] of Object.entries(filter)) {
      if (rawValue === null || rawValue === undefined) {
        return null;
      }

      if (typeof rawValue === 'object' || typeof rawValue === 'function' || typeof rawValue === 'symbol') {
        return null;
      }

      const mappedFilter = await this.resource.schema.mapper({ [fieldName]: rawValue });
      const mappedEntries = Object.entries(mappedFilter).filter(([key]) => key !== '_v');

      if (mappedEntries.length !== 1) {
        return null;
      }

      const [mappedKey, mappedValue] = mappedEntries[0]!;
      const mappedBodyValue = this._normalizeJsonComparisonValue(mappedValue);
      const rawBodyValue = this._normalizeJsonComparisonValue(rawValue);

      if (mappedBodyValue === null && rawBodyValue === null) {
        return null;
      }

      filters.push({
        metadataPath: this._buildLiteralJsonPath(this._sanitizeMetadataKey(mappedKey)),
        metadataValue: metadataEncode(mappedValue).encoded,
        mappedBodyPath: mappedBodyValue !== null ? this._buildLiteralJsonPath(mappedKey) : null,
        mappedBodyValue,
        rawBodyPath: rawBodyValue !== null ? this._buildNestedJsonPath(fieldName) : null,
        rawBodyValue
      });
    }

    return filters;
  }

  private async _hydratePrefetchedResults(
    ids: string[],
    context: string,
    objectMap: Map<string, ClientObjectResponse>,
    decorate?: (data: ResourceData) => Promise<ResourceData> | ResourceData
  ): Promise<ResourceData[]> {
    const operations = ids.map((id) => async () => {
      return this._hydrateResourceData(id, context, objectMap, decorate);
    });

    const { results } = await this.resource._executeBatchHelper(operations, {
      onItemError: (error, index) => {
        this.resource.emit('error', error, ids[index]);
        this.resource.observers.forEach((x) => x.emit('error', this.resource.name, error, ids[index]));
      }
    });

    return results.filter((item): item is ResourceData => item !== null);
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
    const prefetchedResults = await this._listWithPrefetchedObjectPage({
      prefix: `resource=${this.resource.name}/data`,
      limit,
      offset,
      partition: null,
      partitionDef: null,
      context: 'main-prefetched'
    });

    if (prefetchedResults) {
      this.resource._emitStandardized('list', { count: prefetchedResults.length, errors: 0 });
      return prefetchedResults;
    }

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

    const prefetchedResults = await this._listWithPrefetchedObjectPage({
      prefix,
      limit,
      offset,
      partition,
      partitionDef,
      context: 'partition-prefetched'
    });

    if (prefetchedResults) {
      this.resource._emitStandardized('list', { partition, partitionValues, count: prefetchedResults.length, errors: 0 });
      return prefetchedResults;
    }

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
    const objectMap = await this._getBulkObjectMap(ids);
    const results = await this._hydratePrefetchedResults(ids, context, objectMap || new Map());
    this.resource._emitStandardized('list', { count: results.length, errors: 0 });
    return results;
  }

  async processPartitionResults(
    ids: string[],
    partition: string,
    partitionDef: PartitionDefinition,
    keys: string[]
  ): Promise<ResourceData[]> {
    const objectMap = await this._getBulkObjectMap(ids);
    return await this._hydratePrefetchedResults(ids, 'partition', objectMap || new Map(), async (data) => {
      data._partition = partition;
      data._partitionValues = this._extractPartitionValuesFromData(data, partitionDef);
      return data;
    });
  }

  private async _listWithPrefetchedObjectPage({
    prefix,
    limit,
    offset,
    partition,
    partitionDef,
    context
  }: {
    prefix: string;
    limit?: number;
    offset: number;
    partition: string | null;
    partitionDef: PartitionDefinition | null;
    context: string;
  }): Promise<ResourceData[] | null> {
    if (!this.client.getFilteredObjectsPage) {
      return null;
    }

    const page = await this.client.getFilteredObjectsPage({
      prefix,
      offset,
      amount: limit || 1000,
      filters: []
    });
    const ids = this.extractIdsFromKeys(page.map((entry) => entry.key));
    const objectMap = new Map<string, ClientObjectResponse>();

    for (const entry of page) {
      objectMap.set(entry.key, entry.object);
    }

    if (partition && partitionDef) {
      return await this._hydratePrefetchedResults(ids, context, objectMap, async (data) => {
        data._partition = partition;
        data._partitionValues = this._extractPartitionValuesFromData(data, partitionDef);
        return data;
      });
    }

    return await this._hydratePrefetchedResults(ids, context, objectMap);
  }

  private async _listPageByNumberWithPrefetchedObjectPage({
    page,
    size,
    partition,
    partitionValues
  }: {
    page: number;
    size: number;
    partition: string | null;
    partitionValues: StringRecord;
  }): Promise<{ items: ResourceData[]; nextCursor: string | null } | null> {
    if (!this.client.getFilteredObjectsPage || typeof this.client.getContinuationTokenAfterOffset !== 'function') {
      return null;
    }

    const { prefix, partitionDef } = this._buildPagePrefix(partition, partitionValues);
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeSize = Math.max(1, Math.floor(size));
    const offset = (safePage - 1) * safeSize;
    const pageRows = await this.client.getFilteredObjectsPage({
      prefix,
      offset,
      amount: safeSize + 1,
      filters: []
    });
    const hasMore = pageRows.length > safeSize;
    const visibleRows = hasMore ? pageRows.slice(0, safeSize) : pageRows;
    const ids = this.extractIdsFromKeys(visibleRows.map((entry) => entry.key));
    const objectMap = new Map<string, ClientObjectResponse>();

    for (const entry of visibleRows) {
      objectMap.set(entry.key, entry.object);
    }

    let items: ResourceData[];
    if (partition && partitionDef) {
      items = await this._hydratePrefetchedResults(ids, 'page-prefetched-partition', objectMap, async (data) => {
        data._partition = partition;
        data._partitionValues = this._extractPartitionValuesFromData(data, partitionDef);
        return data;
      });
    } else {
      items = await this._hydratePrefetchedResults(ids, 'page-prefetched', objectMap);
    }

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const continuationToken = await this.client.getContinuationTokenAfterOffset({
        prefix,
        offset: offset + items.length - 1
      });

      nextCursor = continuationToken
        ? encodeCursorPayload({
            v: 1,
            prefix,
            token: continuationToken,
            pageSize: safeSize
          })
        : null;
    }

    await this._setCheckpointCursorForPage({
      page: 1,
      size: safeSize,
      partition,
      partitionValues,
      cursor: null
    });
    await this._setCheckpointCursorForPage({
      page: safePage + 1,
      size: safeSize,
      partition,
      partitionValues,
      cursor: nextCursor
    });

    return { items, nextCursor };
  }

  private async _queryWithFilteredObjectPage({
    prefix,
    filter,
    limit,
    offset,
    partition,
    partitionDef
  }: {
    prefix: string;
    filter: StringRecord;
    limit: number;
    offset: number;
    partition: string | null;
    partitionDef: PartitionDefinition | null;
  }): Promise<ResourceData[] | null> {
    const filters = await this._buildFilteredObjectPageFilters(filter);
    if (!filters || filters.length === 0 || !this.client.getFilteredObjectsPage) {
      return null;
    }

    const page = await this.client.getFilteredObjectsPage({
      prefix,
      offset,
      amount: limit,
      filters
    });

    const keys = page.map((entry) => entry.key);
    const ids = this.extractIdsFromKeys(keys);
    const objectMap = new Map<string, ClientObjectResponse>();

    for (const entry of page) {
      objectMap.set(entry.key, entry.object);
    }

    if (partition && partitionDef) {
      return await this._hydratePrefetchedResults(ids, 'partition-filtered', objectMap, async (data) => {
        data._partition = partition;
        data._partitionValues = this._extractPartitionValuesFromData(data, partitionDef);
        return data;
      });
    }

    return await this._hydratePrefetchedResults(ids, 'filtered', objectMap);
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
    const objectMap = await this._getBulkObjectMap(ids);

    const operations = ids.map((id) => async () => {
      return this._hydrateResourceData(id, 'getMany', objectMap);
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
    if (this.client.getFilteredObjectsPage) {
      const results: ResourceData[] = [];
      let offset = 0;
      const pageSize = 1000;

      while (true) {
        const page = await this._listWithPrefetchedObjectPage({
          prefix: `resource=${this.resource.name}/data`,
          limit: pageSize,
          offset,
          partition: null,
          partitionDef: null,
          context: 'getAll-prefetched'
        });

        if (!page || page.length === 0) {
          break;
        }

        results.push(...page);
        if (page.length < pageSize) {
          break;
        }

        offset += page.length;
      }

      return results;
    }

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
      const objectMap = await this._getBulkObjectMap(batchIds);
      const batchResults = await this._hydratePrefetchedResults(batchIds, 'getAll', objectMap || new Map());
      results.push(...batchResults);
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
    const prefetchedPageResult = await this._listPageByNumberWithPrefetchedObjectPage({
      page: targetPage,
      size,
      partition,
      partitionValues
    });

    if (prefetchedPageResult) {
      return prefetchedPageResult;
    }

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

    queryPartitionValues = this.enrichPartitionValuesFromFilter(queryPartition, queryPartitionValues, filter);

    const residualFilter = this._buildResidualFilter(filter, queryPartition, queryPartitionValues);
    if (Object.keys(residualFilter).length === 0) {
      const directResults = await this.list({
        partition: queryPartition,
        partitionValues: queryPartitionValues,
        limit,
        offset
      });

      return await this.resource.executeHooks('afterQuery', directResults) as ResourceData[];
    }

    const { prefix, partitionDef } = this._buildPagePrefix(queryPartition, queryPartitionValues);
    const filteredPageResults = await this._queryWithFilteredObjectPage({
      prefix,
      filter: residualFilter,
      limit,
      offset,
      partition: queryPartition,
      partitionDef
    });

    if (filteredPageResults) {
      return await this.resource.executeHooks('afterQuery', filteredPageResults) as ResourceData[];
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
        return Object.entries(residualFilter).every(([key, value]) => {
          return this._getNestedFieldValue(doc, key) === value;
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
