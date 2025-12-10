import path from 'path';
import EventEmitter from 'events';
import { chunk } from 'lodash-es';

import { tryFn } from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { mapAwsError, DatabaseError, BaseError } from '../errors.js';
import { TasksRunner } from '../tasks/tasks-runner.class.js';
import { MemoryStorage } from './memory-storage.class.js';
import { createLogger } from '../concerns/logger.js';
import type { LogLevel } from '../types/common.types.js';
import type {
  Logger,
  MemoryClientConfig,
  TaskManager,
  ClientConfig,
  QueueStats,
  MonitoringConfig,
  PutObjectParams,
  CopyObjectParams,
  ListObjectsParams,
  GetKeysPageParams,
  S3Object,
  PutObjectResponse,
  CopyObjectResponse,
  DeleteObjectResponse,
  DeleteObjectsResponse,
  ListObjectsResponse,
  StorageSnapshot
} from './types.js';

const pathPosix = path.posix;

const globalStorageRegistry = new Map<string, MemoryStorage>();

interface CommandInput {
  Key?: string;
  Prefix?: string;
  Metadata?: Record<string, unknown>;
  ContentType?: string;
  Body?: unknown;
  ContentEncoding?: string;
  ContentLength?: number;
  IfMatch?: string;
  IfNoneMatch?: string;
  CopySource?: string;
  MetadataDirective?: 'COPY' | 'REPLACE';
  Delimiter?: string | null;
  MaxKeys?: number;
  ContinuationToken?: string | null;
  StartAfter?: string | null;
  Delete?: { Objects?: Array<{ Key: string }> };
}

interface Command {
  constructor: { name: string };
  input?: CommandInput;
}

export class MemoryClient extends EventEmitter {
  id: string;
  logLevel: string;
  private logger: Logger;
  private taskExecutorMonitoring: MonitoringConfig | null;
  private taskManager: TaskManager;
  storage: MemoryStorage;
  bucket: string;
  private keyPrefix: string;
  private region: string;
  private _keyPrefixForStrip: string;
  connectionString: string;
  config: ClientConfig;

  constructor(config: MemoryClientConfig = {}) {
    super();

    this.id = config.id || idGenerator(77);
    this.logLevel = config.logLevel || 'info';

    if (config.logger) {
      this.logger = config.logger;
    } else {
      this.logger = createLogger({ name: 'MemoryClient', level: this.logLevel as LogLevel });
    }
    this.taskExecutorMonitoring = config.taskExecutorMonitoring
      ? { ...config.taskExecutorMonitoring }
      : null;

    if (config.taskExecutor) {
      this.taskManager = config.taskExecutor;
    } else {
      this.taskManager = new TasksRunner({
        concurrency: config.concurrency || 5,
        retries: config.retries ?? 3,
        retryDelay: config.retryDelay ?? 1000,
        timeout: config.timeout ?? 30000,
        retryableErrors: config.retryableErrors || [],
        monitoring: this.taskExecutorMonitoring || undefined
      }) as any;
    }

    this.bucket = config.bucket || 's3db';
    this.keyPrefix = config.keyPrefix || '';
    this.region = config.region || 'memory';
    this._keyPrefixForStrip = this.keyPrefix ? pathPosix.join(this.keyPrefix, '') : '';
    this.connectionString = `memory://${this.bucket}${this.keyPrefix ? '/' + this.keyPrefix : ''}`;

    const storageKey = `${this.bucket}`;
    if (!globalStorageRegistry.has(storageKey)) {
      globalStorageRegistry.set(storageKey, new MemoryStorage({
        bucket: this.bucket,
        enforceLimits: config.enforceLimits || false,
        metadataLimit: config.metadataLimit || 2048,
        maxObjectSize: config.maxObjectSize || 5 * 1024 * 1024 * 1024,
        persistPath: config.persistPath,
        autoPersist: config.autoPersist,
        logLevel: this.logLevel,
        maxMemoryMB: config.maxMemoryMB,
        evictionEnabled: config.evictionEnabled
      }));
    }

    this.storage = globalStorageRegistry.get(storageKey)!;

    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: this.region,
      endpoint: 'memory://',
      forcePathStyle: true
    };

    this.logger.debug({ id: this.id, bucket: this.bucket }, `Initialized (id: ${this.id}, bucket: ${this.bucket})`);
  }

  getQueueStats(): QueueStats | null {
    if (this.taskManager && typeof this.taskManager.getStats === 'function') {
      return this.taskManager.getStats() as QueueStats;
    }
    return null;
  }

  getAggregateMetrics(since: number = 0): unknown | null {
    if (this.taskManager && typeof this.taskManager.getAggregateMetrics === 'function') {
      return this.taskManager.getAggregateMetrics(since);
    }
    return null;
  }

  async sendCommand(command: Command): Promise<unknown> {
    const commandName = command.constructor.name;
    const input = command.input || {};

    this.emit('cl:request', commandName, input);
    this.emit('command.request', commandName, input);

    let response: unknown;

    try {
      switch (commandName) {
        case 'PutObjectCommand':
          response = await this._handlePutObject(input);
          break;
        case 'GetObjectCommand':
          response = await this._handleGetObject(input);
          break;
        case 'HeadObjectCommand':
          response = await this._handleHeadObject(input);
          break;
        case 'CopyObjectCommand':
          response = await this._handleCopyObject(input);
          break;
        case 'DeleteObjectCommand':
          response = await this._handleDeleteObject(input);
          break;
        case 'DeleteObjectsCommand':
          response = await this._handleDeleteObjects(input);
          break;
        case 'ListObjectsV2Command':
          response = await this._handleListObjects(input);
          break;
        default:
          throw new DatabaseError(`Unsupported command: ${commandName}`, {
            operation: 'sendCommand',
            statusCode: 400,
            retriable: false,
            suggestion: 'Use one of the supported commands: PutObject, GetObject, HeadObject, CopyObject, DeleteObject, DeleteObjects, or ListObjectsV2.'
          });
      }

      this.emit('cl:response', commandName, response, input);
      this.emit('command.response', commandName, response, input);
      return response;

    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      const mappedError = mapAwsError(error as Error, {
        bucket: this.bucket,
        key: input.Key,
        commandName,
        commandInput: input
      });
      throw mappedError;
    }
  }

  private async _handlePutObject(input: CommandInput): Promise<PutObjectResponse> {
    const key = this._applyKeyPrefix(input.Key);
    const metadata = this._encodeMetadata(input.Metadata || {});
    const contentType = input.ContentType;
    const body = input.Body;
    const contentEncoding = input.ContentEncoding;
    const contentLength = input.ContentLength;
    const ifMatch = input.IfMatch;
    const ifNoneMatch = input.IfNoneMatch;

    return await this.storage.put(key, {
      body: body as Buffer | string,
      metadata,
      contentType,
      contentEncoding,
      contentLength,
      ifMatch,
      ifNoneMatch
    });
  }

  private async _handleGetObject(input: CommandInput): Promise<S3Object> {
    const key = this._applyKeyPrefix(input.Key);
    const response = await this.storage.get(key);
    return this._decodeMetadataResponse(response);
  }

  private async _handleHeadObject(input: CommandInput): Promise<Omit<S3Object, 'Body'>> {
    const key = this._applyKeyPrefix(input.Key);
    const response = await this.storage.head(key);
    return this._decodeMetadataResponse(response);
  }

  private async _handleCopyObject(input: CommandInput): Promise<CopyObjectResponse> {
    const { sourceBucket, sourceKey } = this._parseCopySource(input.CopySource);

    if (sourceBucket !== this.bucket) {
      throw new DatabaseError(`Cross-bucket copy is not supported in MemoryClient (requested ${sourceBucket} → ${this.bucket})`, {
        operation: 'CopyObject',
        retriable: false,
        suggestion: 'Instantiate a MemoryClient with the desired bucket or copy within the same bucket.'
      });
    }

    const destinationKey = this._applyKeyPrefix(input.Key);
    const encodedMetadata = this._encodeMetadata(input.Metadata);

    return await this.storage.copy(sourceKey, destinationKey, {
      metadata: encodedMetadata,
      metadataDirective: input.MetadataDirective,
      contentType: input.ContentType
    });
  }

  private async _handleDeleteObject(input: CommandInput): Promise<DeleteObjectResponse> {
    const key = this._applyKeyPrefix(input.Key);
    return await this.storage.delete(key);
  }

  private async _handleDeleteObjects(input: CommandInput): Promise<DeleteObjectsResponse> {
    const objects = input.Delete?.Objects || [];
    const keys = objects.map(obj => this._applyKeyPrefix(obj.Key));
    return await this.storage.deleteMultiple(keys);
  }

  private async _handleListObjects(input: CommandInput): Promise<ListObjectsResponse> {
    const fullPrefix = this._applyKeyPrefix(input.Prefix || '');
    const params = {
      prefix: fullPrefix,
      delimiter: input.Delimiter,
      maxKeys: input.MaxKeys,
      continuationToken: input.ContinuationToken
    };

    if (input.StartAfter) {
      (params as { startAfter?: string }).startAfter = this._applyKeyPrefix(input.StartAfter as string || undefined);
    }

    const response = await this.storage.list(params);
    return this._normalizeListResponse(response);
  }

  async putObject(params: PutObjectParams): Promise<PutObjectResponse> {
    const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;
    const fullKey = this._applyKeyPrefix(key);
    const stringMetadata = this._encodeMetadata(metadata) || {};

    const input = { Key: key, Metadata: metadata, ContentType: contentType, Body: body, ContentEncoding: contentEncoding, ContentLength: contentLength, IfMatch: ifMatch, IfNoneMatch: ifNoneMatch };

    const response = await this.storage.put(fullKey, {
      body: body as Buffer | string,
      metadata: stringMetadata,
      contentType,
      contentEncoding,
      contentLength,
      ifMatch,
      ifNoneMatch
    });

    this.emit('cl:response', 'PutObjectCommand', response, input);

    return response;
  }

  async getObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const input = { Key: key };
    const response = await this.storage.get(fullKey);
    const decodedResponse = this._decodeMetadataResponse(response);

    this.emit('cl:response', 'GetObjectCommand', decodedResponse, input);

    return decodedResponse;
  }

  async headObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const input = { Key: key };
    const response = await this.storage.head(fullKey);
    const decodedResponse = this._decodeMetadataResponse(response);

    this.emit('cl:response', 'HeadObjectCommand', decodedResponse, input);

    return decodedResponse as S3Object;
  }

  async copyObject(params: CopyObjectParams): Promise<CopyObjectResponse> {
    const { from, to, metadata, metadataDirective, contentType } = params;
    const fullFrom = this._applyKeyPrefix(from);
    const fullTo = this._applyKeyPrefix(to);
    const encodedMetadata = this._encodeMetadata(metadata);

    const input = { CopySource: from, Key: to, Metadata: metadata, MetadataDirective: metadataDirective, ContentType: contentType };

    const response = await this.storage.copy(fullFrom, fullTo, {
      metadata: encodedMetadata,
      metadataDirective,
      contentType
    });

    this.emit('cl:response', 'CopyObjectCommand', response, input);

    return response;
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this._applyKeyPrefix(key);
    return this.storage.exists(fullKey);
  }

  async deleteObject(key: string): Promise<DeleteObjectResponse> {
    const fullKey = this._applyKeyPrefix(key);
    const input = { Key: key };
    const response = await this.storage.delete(fullKey);

    this.emit('cl:response', 'DeleteObjectCommand', response, input);

    return response;
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResponse> {
    const fullKeys = keys.map(key => this._applyKeyPrefix(key));

    const input = { Delete: { Objects: keys.map(key => ({ Key: key })) } };

    const batches = chunk(fullKeys, this.taskManager.concurrency || 5);
    const allResults: DeleteObjectsResponse = { Deleted: [], Errors: [] };

    const { results } = await this.taskManager.process(
      batches,
      async (batch) => {
        return await this.storage.deleteMultiple(batch);
      }
    );

    for (const result of results) {
      allResults.Deleted.push(...result.Deleted.map(item => ({ Key: this._stripKeyPrefix(item.Key) })));
      allResults.Errors.push(...result.Errors);
    }

    this.emit('cl:response', 'DeleteObjectsCommand', allResults, input);

    return allResults;
  }

  async listObjects(params: ListObjectsParams = {}): Promise<ListObjectsResponse> {
    const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const listParams: ListObjectsParams & { startAfter?: string } = {
      prefix: fullPrefix,
      delimiter,
      maxKeys,
      continuationToken
    };

    if (startAfter) {
      listParams.startAfter = this._applyKeyPrefix(startAfter);
    }

    const input = { Prefix: prefix, Delimiter: delimiter, MaxKeys: maxKeys, ContinuationToken: continuationToken, StartAfter: startAfter };

    const response = await this.storage.list(listParams);
    const normalized = this._normalizeListResponse(response);

    this.emit('cl:response', 'ListObjectsV2Command', normalized, input);

    return normalized;
  }

  async getKeysPage(params: GetKeysPageParams = {}): Promise<string[]> {
    const { prefix = '', offset = 0, amount = 100 } = params;
    let keys: string[] = [];
    let truncated = true;
    let continuationToken: string | undefined;

    if (offset > 0) {
      const fullPrefix = this._applyKeyPrefix(prefix || '');
      const response = await this.storage.list({
        prefix: fullPrefix,
        maxKeys: offset + amount
      });
      keys = (response.Contents || [])
        .map(x => this._stripKeyPrefix(x.Key))
        .slice(offset, offset + amount);
      truncated = Boolean(response.NextContinuationToken);
      continuationToken = response.NextContinuationToken || undefined;
    } else {
      while (truncated) {
        const remaining = amount - keys.length;
        if (remaining <= 0) {
          break;
        }

        const res = await this.listObjects({
          prefix,
          continuationToken,
          maxKeys: remaining
        });
        if (res.Contents) {
          keys = keys.concat(res.Contents.map(x => x.Key));
        }
        truncated = res.IsTruncated || false;
        continuationToken = res.NextContinuationToken || undefined;
        if (keys.length >= amount) {
          keys = keys.slice(0, amount);
          break;
        }
      }
    }

    this.emit('cl:GetKeysPage', keys, params);
    return keys;
  }

  async getAllKeys(params: { prefix?: string } = {}): Promise<string[]> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const response = await this.storage.list({
      prefix: fullPrefix,
      maxKeys: Number.MAX_SAFE_INTEGER
    });

    const keys = (response.Contents || []).map(x => this._stripKeyPrefix(x.Key));

    this.emit('cl:GetAllKeys', keys, params);
    return keys;
  }

  async count(params: { prefix?: string } = {}): Promise<number> {
    const { prefix = '' } = params;
    const keys = await this.getAllKeys({ prefix });
    const count = keys.length;
    this.emit('cl:Count', count, { prefix });
    return count;
  }

  async deleteAll(params: { prefix?: string } = {}): Promise<number> {
    const { prefix = '' } = params;
    const keys = await this.getAllKeys({ prefix });
    let totalDeleted = 0;

    if (keys.length > 0) {
      const result = await this.deleteObjects(keys);
      totalDeleted = result.Deleted.length;

      this.emit('deleteAll', {
        prefix,
        batch: totalDeleted,
        total: totalDeleted
      });
    }

    this.emit('deleteAllComplete', {
      prefix,
      totalDeleted
    });

    return totalDeleted;
  }

  async getContinuationTokenAfterOffset(params: { prefix?: string; offset?: number } = {}): Promise<string | null> {
    const { prefix = '', offset = 1000 } = params;
    if (offset === 0) return null;

    const keys = await this.getAllKeys({ prefix });

    if (offset >= keys.length) {
      this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    const keyForToken = keys[offset];
    const fullKey = this._applyKeyPrefix(keyForToken || '');
    const token = this._encodeContinuationTokenKey(fullKey);
    this.emit('cl:GetContinuationTokenAfterOffset', token, { prefix, offset });
    return token;
  }

  async moveObject(params: { from: string; to: string }): Promise<boolean> {
    const { from, to } = params;
    const [ok, err] = await tryFn(async () => {
      await this.copyObject({ from, to, metadataDirective: 'COPY' });
      await this.deleteObject(from);
    });

    if (!ok) {
      throw new DatabaseError('Unknown error in moveObject', {
        bucket: this.bucket,
        from,
        to,
        original: err
      });
    }

    return true;
  }

  async moveAllObjects(params: { prefixFrom: string; prefixTo: string }): Promise<Array<{ from: string; to: string }>> {
    const { prefixFrom, prefixTo } = params;
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const { results, errors } = await this.taskManager.process(
      keys,
      async (key) => {
        const to = key.replace(prefixFrom, prefixTo);
        await this.moveObject({ from: key, to });
        return { from: key, to };
      }
    );

    this.emit('moveAllObjects', { results, errors });

    if (errors.length > 0) {
      const error = new Error('Some objects could not be moved') as Error & { context: unknown };
      error.context = {
        bucket: this.bucket,
        operation: 'moveAllObjects',
        prefixFrom,
        prefixTo,
        totalKeys: keys.length,
        failedCount: errors.length,
        successCount: results.length,
        errors
      };
      throw error;
    }

    return results;
  }

  snapshot(): StorageSnapshot {
    return this.storage.snapshot();
  }

  restore(snapshot: StorageSnapshot): void {
    this.storage.restore(snapshot);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  getStats(): ReturnType<MemoryStorage['getStats']> {
    return this.storage.getStats();
  }

  destroy(): void {
    // MemoryClient doesn't have cleanup, but interface requires it
  }

  private _encodeMetadata(metadata?: Record<string, unknown>): Record<string, string> | undefined {
    if (!metadata) return undefined;

    const encoded: Record<string, string> = {};
    for (const [rawKey, value] of Object.entries(metadata)) {
      const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const { encoded: encodedValue } = metadataEncode(value);
      encoded[validKey] = encodedValue;
    }
    return encoded;
  }

  private _decodeMetadataResponse<T extends { Metadata?: Record<string, string> }>(response: T): T {
    const decodedMetadata: Record<string, unknown> = {};
    if (response.Metadata) {
      for (const [k, v] of Object.entries(response.Metadata)) {
        decodedMetadata[k] = metadataDecode(v);
      }
    }

    return {
      ...response,
      Metadata: decodedMetadata as Record<string, string>
    };
  }

  private _applyKeyPrefix(key?: string): string {
    if (!this.keyPrefix) {
      if (key === undefined || key === null) {
        return '';
      }
      return key;
    }
    if (key === undefined || key === null || key === '') {
      return pathPosix.join(this.keyPrefix, '');
    }

    return pathPosix.join(this.keyPrefix, key);
  }

  private _stripKeyPrefix(key: string = ''): string {
    if (!this.keyPrefix) {
      return key;
    }

    const normalizedPrefix = this._keyPrefixForStrip;
    if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
      return key.slice(normalizedPrefix.length).replace(/^\/+/, '');
    }

    return key;
  }

  private _encodeContinuationTokenKey(key: string): string {
    return Buffer.from(String(key), 'utf8').toString('base64');
  }

  private _parseCopySource(copySource?: string): { sourceBucket: string; sourceKey: string } {
    const trimmedSource = String(copySource || '').replace(/^\//, '');
    const [sourcePath] = trimmedSource.split('?');
    const decodedSource = decodeURIComponent(sourcePath ?? '');
    const [sourceBucket, ...sourceKeyParts] = decodedSource.split('/');

    if (!sourceBucket || sourceKeyParts.length === 0) {
      throw new DatabaseError(`Invalid CopySource value: ${copySource}`, {
        operation: 'CopyObject',
        retriable: false,
        suggestion: 'Provide CopySource in the format "<bucket>/<key>" as expected by AWS S3.'
      });
    }

    return {
      sourceBucket,
      sourceKey: sourceKeyParts.join('/')
    };
  }

  private _normalizeListResponse(response: ListObjectsResponse): ListObjectsResponse {
    const rawContents = Array.isArray(response.Contents) ? response.Contents : [];
    const contents = rawContents.map(item => ({
      ...item,
      Key: this._stripKeyPrefix(item.Key)
    }));

    const rawPrefixes = Array.isArray(response.CommonPrefixes) ? response.CommonPrefixes : [];
    const commonPrefixes = rawPrefixes.map(({ Prefix }) => ({
      Prefix: this._stripKeyPrefix(Prefix)
    }));

    return {
      Contents: contents,
      CommonPrefixes: commonPrefixes,
      IsTruncated: response.IsTruncated,
      ContinuationToken: response.ContinuationToken,
      NextContinuationToken: response.NextContinuationToken,
      KeyCount: contents.length,
      MaxKeys: response.MaxKeys,
      Prefix: this.keyPrefix ? undefined : response.Prefix,
      Delimiter: response.Delimiter,
      StartAfter: response.StartAfter
    };
  }

  static clearBucketStorage(bucket: string): void {
    const storage = globalStorageRegistry.get(bucket);
    if (storage) {
      storage.clear();
    }
    globalStorageRegistry.delete(bucket);
  }

  static clearAllStorage(): void {
    for (const storage of globalStorageRegistry.values()) {
      storage.clear();
    }
    globalStorageRegistry.clear();
  }
}

export default MemoryClient;
