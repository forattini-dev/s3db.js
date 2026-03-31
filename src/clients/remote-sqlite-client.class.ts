import path from 'path';
import EventEmitter from 'events';
import { Readable } from 'node:stream';
import { createHash } from 'crypto';
import { chunk } from 'lodash-es';

import { tryFn } from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { normalizeEtagHeader } from './client-compat.js';
import { createLogger } from '../concerns/logger.js';
import { DatabaseError, ResourceError, NoSuchKey } from '../errors.js';
import { TasksRunner } from '../tasks/tasks-runner.class.js';
import { LibsqlExecutor } from './libsql-executor.class.js';
import { D1Executor } from './d1-executor.class.js';
import type { D1DatabaseLike } from './d1-executor.class.js';
import type { LogLevel } from '../types/common.types.js';
import type {
  ClientConfig,
  CopyObjectParams,
  CopyObjectResponse,
  DeleteObjectResponse,
  DeleteObjectsResponse,
  GetKeysPageParams,
  ListObjectsParams,
  ListObjectsResponse,
  Logger,
  MonitoringConfig,
  PutObjectParams,
  PutObjectResponse,
  QueueStats,
  RemoteSqliteClientConfig,
  S3Object,
  TaskManager
} from './types.js';
import type { SqlExecutor, SqlStatement } from './sql-executor.types.js';

const pathPosix = path.posix;

interface RemoteSqliteRow {
  key: string;
  metadata: string;
  content_type: string;
  content_encoding: string | null;
  content_length: number;
  etag: string;
  last_modified: string;
  body?: unknown;
}

export class RemoteSqliteClient extends EventEmitter {
  id: string;
  logLevel: string;
  private logger: Logger;
  private taskExecutorMonitoring: MonitoringConfig | null;
  private taskManager: TaskManager;
  bucket: string;
  private keyPrefix: string;
  private region: string;
  private _keyPrefixForStrip: string;
  connectionString: string;
  config: ClientConfig;
  private enforceLimits: boolean;
  private metadataLimit: number;
  private maxObjectSize: number;
  private endpoint: string;
  private sqliteDriver: 'libsql' | 'd1';
  private authToken?: string;
  private apiToken?: string;
  private syncUrl?: string;
  private syncInterval?: number;
  private d1Binding?: D1DatabaseLike;
  private executor?: SqlExecutor;
  private readonly providedExecutor?: SqlExecutor;
  private initPromise: Promise<void> | null = null;

  constructor(config: RemoteSqliteClientConfig) {
    super();

    this.id = config.id || idGenerator(77);
    this.logLevel = config.logLevel || 'info';
    this.enforceLimits = Boolean(config.enforceLimits);
    this.metadataLimit = config.metadataLimit ?? 1_048_576;
    this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024;
    this.endpoint = config.endpoint;
    this.sqliteDriver = config.sqliteDriver;
    this.authToken = config.authToken;
    this.apiToken = config.apiToken;
    this.syncUrl = config.syncUrl;
    this.syncInterval = config.syncInterval;
    this.d1Binding = config.d1Binding as D1DatabaseLike | undefined;
    this.providedExecutor = config.executor;

    if (config.logger) {
      this.logger = config.logger;
    } else {
      this.logger = createLogger({ name: 'RemoteSqliteClient', level: this.logLevel as LogLevel });
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
      }) as TaskManager;
    }

    this.bucket = config.bucket || 's3db';
    this.keyPrefix = config.keyPrefix || '';
    this.region = config.region || 'sqlite';
    this._keyPrefixForStrip = this.keyPrefix ? pathPosix.join(this.keyPrefix, '') : '';
    this.connectionString = config.connectionString || this.endpoint;

    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: true
    };
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

  async putObject(params: PutObjectParams): Promise<PutObjectResponse> {
    await this.ensureInitialized();

    const fullKey = this.applyKeyPrefix(params.key);
    const bodyBuffer = await this.toBuffer(params.body);
    this.validateLimits(bodyBuffer, params.metadata);

    const existing = await this.getStoredObject(fullKey, { includeBody: false });
    if (params.ifMatch !== undefined) {
      const expectedEtags = normalizeEtagHeader(params.ifMatch);
      const currentEtag = existing?.etag || null;
      const matches = expectedEtags.length > 0 && currentEtag ? expectedEtags.includes(currentEtag) : false;
      if (!existing || !matches) {
        throw new ResourceError(`Precondition failed: ETag mismatch for key "${params.key}"`, {
          bucket: this.bucket,
          key: params.key,
          code: 'PreconditionFailed',
          statusCode: 412,
          retriable: false,
          suggestion: 'Fetch the latest object and retry with the current ETag in options.ifMatch.'
        });
      }
    }

    if (params.ifNoneMatch !== undefined) {
      const normalized = normalizeEtagHeader(params.ifNoneMatch);
      const targetValue = existing?.etag || null;
      const shouldFail =
        (params.ifNoneMatch === '*' && Boolean(existing)) ||
        (normalized.length > 0 && existing && targetValue && normalized.includes(targetValue));
      if (shouldFail) {
        throw new ResourceError(`Precondition failed: object already exists for key "${params.key}"`, {
          bucket: this.bucket,
          key: params.key,
          code: 'PreconditionFailed',
          statusCode: 412,
          retriable: false,
          suggestion: 'Use ifNoneMatch: "*" only when the object should not exist or remove the conditional header.'
        });
      }
    }

    const metadata = this.encodeMetadata(params.metadata);
    const etag = this.generateEtag(bodyBuffer);
    const lastModified = new Date().toISOString();

    await this.exec(
      `INSERT INTO objects (
        bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket, key) DO UPDATE SET
        metadata = excluded.metadata,
        content_type = excluded.content_type,
        content_encoding = excluded.content_encoding,
        content_length = excluded.content_length,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        body = excluded.body`,
      [
        this.bucket,
        fullKey,
        JSON.stringify(metadata),
        params.contentType || 'application/octet-stream',
        params.contentEncoding || null,
        params.contentLength ?? bodyBuffer.length,
        etag,
        lastModified,
        bodyBuffer
      ]
    );

    const response = {
      ETag: this.formatEtag(etag),
      VersionId: null,
      ServerSideEncryption: null,
      Location: `${this.connectionString}/${fullKey}`,
      _rowsRead: existing ? 1 : 0,
      _rowsWritten: 1
    };

    this.emit('cl:response', 'PutObjectCommand', response, { Key: params.key, Body: bodyBuffer });

    return response;
  }

  async getObject(key: string): Promise<S3Object> {
    await this.ensureInitialized();
    const row = await this.getStoredObject(this.applyKeyPrefix(key), { includeBody: true });
    if (!row) {
      throw new NoSuchKey({ bucket: this.bucket, key });
    }
    const result = this.toS3Object(row, true);
    this.emit('cl:response', 'GetObjectCommand', { ...result, _rowsRead: 1, _rowsWritten: 0 }, { Key: key });
    return result;
  }

  async headObject(key: string): Promise<S3Object> {
    await this.ensureInitialized();
    const row = await this.getStoredObject(this.applyKeyPrefix(key), { includeBody: false });
    if (!row) {
      throw new NoSuchKey({ bucket: this.bucket, key });
    }
    const result = this.toS3Object(row, false);
    this.emit('cl:response', 'HeadObjectCommand', { ...result, _rowsRead: 1, _rowsWritten: 0 }, { Key: key });
    return result;
  }

  async copyObject(params: CopyObjectParams): Promise<CopyObjectResponse> {
    const source = await this.getStoredObject(this.applyKeyPrefix(params.from), { includeBody: true });
    if (!source) {
      throw new NoSuchKey({ bucket: this.bucket, key: params.from });
    }

    const metadataDirective = params.metadataDirective || 'COPY';
    const metadata = metadataDirective === 'REPLACE'
      ? this.encodeMetadata(params.metadata)
      : this.parseMetadata(source.metadata);
    const contentType = params.contentType || source.content_type;
    const bodyBuffer = this.toStoredBuffer(source.body);
    const etag = this.generateEtag(bodyBuffer);
    const lastModified = new Date().toISOString();

    await this.exec(
      `INSERT INTO objects (
        bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket, key) DO UPDATE SET
        metadata = excluded.metadata,
        content_type = excluded.content_type,
        content_encoding = excluded.content_encoding,
        content_length = excluded.content_length,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        body = excluded.body`,
      [
        this.bucket,
        this.applyKeyPrefix(params.to),
        JSON.stringify(metadata),
        contentType,
        source.content_encoding,
        source.content_length,
        etag,
        lastModified,
        bodyBuffer
      ]
    );

    const response = {
      CopyObjectResult: {
        ETag: this.formatEtag(etag),
        LastModified: lastModified
      },
      BucketKeyEnabled: false,
      VersionId: null,
      ServerSideEncryption: null,
      _rowsRead: 1,
      _rowsWritten: 1
    };

    this.emit('cl:response', 'CopyObjectCommand', response, { Key: params.to });

    return response;
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureInitialized();
    const row = await this.getStoredObject(this.applyKeyPrefix(key), { includeBody: false });
    return Boolean(row);
  }

  async deleteObject(key: string): Promise<DeleteObjectResponse> {
    await this.ensureInitialized();
    await this.exec('DELETE FROM objects WHERE bucket = ? AND key = ?', [this.bucket, this.applyKeyPrefix(key)]);
    const response = { DeleteMarker: true, VersionId: null, _rowsRead: 0, _rowsWritten: 1 };
    this.emit('cl:response', 'DeleteObjectCommand', response, { Key: key });
    return response;
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResponse> {
    await this.ensureInitialized();

    const batches = chunk(keys, this.taskManager.concurrency || 5);
    const allResults: DeleteObjectsResponse = { Deleted: [], Errors: [] };

    const { results } = await this.taskManager.process(batches, async batch => {
      const deleted: Array<{ Key: string }> = [];
      for (const key of batch) {
        await this.deleteObject(key);
        deleted.push({ Key: key });
      }
      return deleted;
    });

    for (const result of results) {
      allResults.Deleted.push(...result);
    }

    this.emit('cl:response', 'DeleteObjectsCommand', { ...allResults, _rowsRead: 0, _rowsWritten: allResults.Deleted.length }, { Keys: keys });

    return allResults;
  }

  async listObjects(params: ListObjectsParams = {}): Promise<ListObjectsResponse> {
    await this.ensureInitialized();

    const prefix = params.prefix || '';
    const fullPrefix = this.applyKeyPrefix(prefix);
    const maxKeys = params.maxKeys ?? 1000;
    const startAfterKey = params.continuationToken
      ? this.decodeContinuationToken(params.continuationToken)
      : params.startAfter
        ? this.applyKeyPrefix(params.startAfter)
        : null;

    const rows = await this.exec(
      `SELECT key, content_length, etag, last_modified
       FROM objects
       WHERE bucket = ? AND key LIKE ? ${startAfterKey ? 'AND key > ?' : ''}
       ORDER BY key ASC
       LIMIT ?`,
      startAfterKey
        ? [this.bucket, `${fullPrefix}%`, startAfterKey, maxKeys + 1]
        : [this.bucket, `${fullPrefix}%`, maxKeys + 1]
    );

    const contents: ListObjectsResponse['Contents'] = [];
    const commonPrefixes = new Set<string>();
    const visibleRows = rows.rows as unknown as RemoteSqliteRow[];
    let processed = 0;
    let lastKeyInPage: string | null = null;
    let hasMoreKeys = false;

    for (const row of visibleRows) {
      if (processed >= maxKeys) {
        hasMoreKeys = true;
        break;
      }

      const strippedKey = this.stripKeyPrefix(row.key);
      const prefixEntry = params.delimiter ? this.extractCommonPrefix(prefix, params.delimiter, strippedKey) : null;
      if (prefixEntry) {
        if (!commonPrefixes.has(prefixEntry)) {
          commonPrefixes.add(prefixEntry);
          processed++;
          lastKeyInPage = row.key;
        }
        continue;
      }

      contents.push({
        Key: strippedKey,
        Size: Number(row.content_length),
        LastModified: new Date(String(row.last_modified)),
        ETag: this.formatEtag(String(row.etag)),
        StorageClass: 'STANDARD'
      });
      processed++;
      lastKeyInPage = row.key;
    }

    const nextContinuationToken = hasMoreKeys && lastKeyInPage
      ? this.encodeContinuationToken(lastKeyInPage)
      : null;

    const response = {
      Contents: contents,
      CommonPrefixes: Array.from(commonPrefixes).map(commonPrefix => ({ Prefix: commonPrefix })),
      IsTruncated: Boolean(nextContinuationToken),
      ContinuationToken: params.continuationToken || undefined,
      NextContinuationToken: nextContinuationToken,
      KeyCount: contents.length,
      MaxKeys: maxKeys,
      Prefix: prefix || undefined,
      Delimiter: params.delimiter || undefined,
      StartAfter: params.startAfter || undefined,
      _rowsRead: contents.length,
      _rowsWritten: 0
    };

    this.emit('cl:response', 'ListObjectsV2Command', response, { Prefix: prefix });

    return response;
  }

  async getKeysPage(params: GetKeysPageParams = {}): Promise<string[]> {
    const { prefix = '', offset = 0, amount = 100 } = params;
    if (offset <= 0) {
      const response = await this.listObjects({ prefix, maxKeys: amount });
      return response.Contents.map(item => item.Key);
    }

    const allKeys = await this.getAllKeys({ prefix });
    return allKeys.slice(offset, offset + amount);
  }

  async getAllKeys(params: { prefix?: string } = {}): Promise<string[]> {
    await this.ensureInitialized();
    const prefix = params.prefix || '';
    const fullPrefix = this.applyKeyPrefix(prefix);
    const rows = await this.exec(
      'SELECT key FROM objects WHERE bucket = ? AND key LIKE ? ORDER BY key ASC',
      [this.bucket, `${fullPrefix}%`]
    );
    return rows.rows.map(row => this.stripKeyPrefix(String(row.key)));
  }

  async count(params: { prefix?: string } = {}): Promise<number> {
    await this.ensureInitialized();
    const prefix = this.applyKeyPrefix(params.prefix || '');
    const result = await this.exec(
      'SELECT COUNT(*) as total FROM objects WHERE bucket = ? AND key LIKE ?',
      [this.bucket, `${prefix}%`]
    );
    const total = result.rows[0]?.total;
    return typeof total === 'number' ? total : Number(total || 0);
  }

  async deleteAll(params: { prefix?: string } = {}): Promise<number> {
    const keys = await this.getAllKeys(params);
    if (keys.length === 0) {
      return 0;
    }
    const result = await this.deleteObjects(keys);
    return result.Deleted.length;
  }

  async getContinuationTokenAfterOffset(params: { prefix?: string; offset?: number } = {}): Promise<string | null> {
    const { prefix = '', offset = 1000 } = params;
    if (offset === 0) {
      return null;
    }
    const keys = await this.getAllKeys({ prefix });
    if (offset >= keys.length) {
      return null;
    }
    return this.encodeContinuationToken(this.applyKeyPrefix(keys[offset] || ''));
  }

  async moveObject(params: { from: string; to: string }): Promise<boolean> {
    const [ok, err] = await tryFn(async () => {
      await this.copyObject({ from: params.from, to: params.to, metadataDirective: 'COPY' });
      await this.deleteObject(params.from);
    });

    if (!ok) {
      throw new DatabaseError('Unknown error in moveObject', {
        bucket: this.bucket,
        from: params.from,
        to: params.to,
        original: err
      });
    }

    return true;
  }

  async moveAllObjects(params: { prefixFrom: string; prefixTo: string }): Promise<Array<{ from: string; to: string }>> {
    const keys = await this.getAllKeys({ prefix: params.prefixFrom });
    const { results, errors } = await this.taskManager.process(keys, async key => {
      const to = key.replace(params.prefixFrom, params.prefixTo);
      await this.moveObject({ from: key, to });
      return { from: key, to };
    });

    if (errors.length > 0) {
      throw new DatabaseError('Some objects could not be moved', {
        bucket: this.bucket,
        operation: 'moveAllObjects',
        prefixFrom: params.prefixFrom,
        prefixTo: params.prefixTo,
        totalKeys: keys.length,
        failedCount: errors.length,
        successCount: results.length
      });
    }

    return results;
  }

  async sync(): Promise<void> {
    await this.ensureInitialized();
    if (this.executor?.sync) await this.executor.sync();
  }

  async destroy(): Promise<void> {
    if (this.executor?.close) {
      await this.executor.close();
    }
    const taskManager = this.taskManager as { destroy?: () => Promise<void> | void };
    if (typeof taskManager.destroy === 'function') {
      await taskManager.destroy();
    }
    this.removeAllListeners();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    this.executor = this.providedExecutor || this.createExecutor();
    await this.exec(`
      CREATE TABLE IF NOT EXISTS objects (
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        metadata TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content_encoding TEXT,
        content_length INTEGER NOT NULL,
        etag TEXT NOT NULL,
        last_modified TEXT NOT NULL,
        body BLOB NOT NULL,
        PRIMARY KEY (bucket, key)
      )
    `);
  }

  private createExecutor(): SqlExecutor {
    if (this.sqliteDriver === 'libsql') {
      const url = this.syncUrl ? this.endpoint : this.toLibsqlUrl(this.endpoint);
      return new LibsqlExecutor({
        url,
        authToken: this.authToken,
        syncUrl: this.syncUrl,
        syncInterval: this.syncInterval
      });
    }

    return new D1Executor({
      endpoint: this.endpoint,
      apiToken: this.apiToken,
      binding: this.d1Binding
    });
  }

  private toLibsqlUrl(endpoint: string): string {
    if (endpoint.startsWith('sqlite+libsql://')) {
      return `libsql://${endpoint.slice('sqlite+libsql://'.length)}`;
    }
    return endpoint;
  }

  private async exec(sql: string, args: unknown[] = []) {
    if (!this.executor) {
      throw new DatabaseError('Remote SQLite executor is not initialized.', {
        operation: 'RemoteSqliteClient.exec',
        retriable: false
      });
    }
    return this.executor.execute(sql, args);
  }

  private async execBatch(statements: SqlStatement[]) {
    if (!this.executor) {
      throw new DatabaseError('Remote SQLite executor is not initialized.', {
        operation: 'RemoteSqliteClient.execBatch',
        retriable: false
      });
    }
    if (this.executor.batch) {
      return this.executor.batch(statements);
    }
    const results = [];
    for (const stmt of statements) {
      results.push(await this.executor.execute(stmt.sql, stmt.args));
    }
    return results;
  }

  private async getStoredObject(key: string, options: { includeBody: boolean }): Promise<RemoteSqliteRow | null> {
    const fields = options.includeBody
      ? 'key, metadata, content_type, content_encoding, content_length, etag, last_modified, body'
      : 'key, metadata, content_type, content_encoding, content_length, etag, last_modified';
    const result = await this.exec(
      `SELECT ${fields} FROM objects WHERE bucket = ? AND key = ? LIMIT 1`,
      [this.bucket, key]
    );
    return (result.rows[0] as RemoteSqliteRow | undefined) || null;
  }

  private validateLimits(body: Buffer, metadata?: Record<string, unknown>): void {
    if (!this.enforceLimits) {
      return;
    }

    if (body.length > this.maxObjectSize) {
      throw new ResourceError('Object size exceeds in remote sqlite limit', {
        bucket: this.bucket,
        size: body.length,
        maxObjectSize: this.maxObjectSize,
        statusCode: 413,
        retriable: false,
        suggestion: 'Store smaller objects or increase maxObjectSize when instantiating RemoteSqliteClient.'
      });
    }

    if (metadata) {
      const encoded = JSON.stringify(this.encodeMetadata(metadata));
      if (Buffer.byteLength(encoded, 'utf8') > this.metadataLimit) {
        throw new ResourceError('Metadata limit exceeded in remote sqlite storage', {
          bucket: this.bucket,
          metadataLimit: this.metadataLimit,
          statusCode: 413,
          retriable: false,
          suggestion: 'Store less metadata or raise metadataLimit for this client.'
        });
      }
    }
  }

  private encodeMetadata(metadata?: Record<string, unknown>): Record<string, string> {
    if (!metadata) {
      return {};
    }
    const encoded: Record<string, string> = {};
    for (const [rawKey, value] of Object.entries(metadata)) {
      const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const { encoded: encodedValue } = metadataEncode(value);
      encoded[validKey] = encodedValue;
    }
    return encoded;
  }

  private parseMetadata(metadata: string): Record<string, string> {
    const parsed = JSON.parse(metadata) as Record<string, string>;
    return parsed || {};
  }

  private decodeMetadata(metadata: Record<string, string>): Record<string, unknown> {
    const decoded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      decoded[key] = metadataDecode(value);
    }
    return decoded;
  }

  private toS3Object(row: RemoteSqliteRow, includeBody: boolean): S3Object {
    const metadata = this.parseMetadata(row.metadata);
    const response: S3Object = {
      Metadata: this.decodeMetadata(metadata) as Record<string, string>,
      ContentType: row.content_type,
      ContentLength: Number(row.content_length),
      ETag: this.formatEtag(String(row.etag)),
      LastModified: new Date(String(row.last_modified)),
      ContentEncoding: row.content_encoding || undefined
    };

    if (includeBody) {
      const buffer = this.toStoredBuffer(row.body);
      response.Body = this.createBodyStream(buffer);
    }

    return response;
  }

  private createBodyStream(buffer: Buffer): S3Object['Body'] {
    const bodyStream = Readable.from(buffer) as S3Object['Body'];
    bodyStream!.transformToString = async (encoding: string = 'utf-8') => {
      return buffer.toString(encoding as BufferEncoding);
    };
    bodyStream!.transformToByteArray = async () => {
      return new Uint8Array(buffer);
    };
    bodyStream!.transformToWebStream = () => {
      return Readable.toWeb(Readable.from(buffer)) as ReadableStream;
    };
    return bodyStream;
  }

  private async toBuffer(body?: Buffer | string | Readable): Promise<Buffer> {
    if (!body) {
      return Buffer.alloc(0);
    }
    if (Buffer.isBuffer(body)) {
      return body;
    }
    if (typeof body === 'string') {
      return Buffer.from(body);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
  }

  private toStoredBuffer(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) {
      return value;
    }
    if (value instanceof Uint8Array) {
      return Buffer.from(value);
    }
    if (value instanceof ArrayBuffer) {
      return Buffer.from(new Uint8Array(value));
    }
    if (typeof value === 'string') {
      return Buffer.from(value, 'base64');
    }
    return Buffer.alloc(0);
  }

  private generateEtag(buffer: Buffer): string {
    return createHash('md5').update(buffer).digest('hex');
  }

  private formatEtag(etag: string): string {
    return `"${etag}"`;
  }

  private applyKeyPrefix(key?: string): string {
    const value = key || '';
    return this.keyPrefix ? pathPosix.join(this.keyPrefix, value) : value;
  }

  private stripKeyPrefix(key: string): string {
    if (!this._keyPrefixForStrip) {
      return key;
    }
    if (!key.startsWith(this._keyPrefixForStrip)) {
      return key;
    }
    return key.slice(this._keyPrefixForStrip.length).replace(/^\/+/, '');
  }

  private encodeContinuationToken(key: string): string {
    return Buffer.from(key, 'utf8').toString('base64');
  }

  private decodeContinuationToken(token: string): string {
    return Buffer.from(token, 'base64').toString('utf8');
  }

  private extractCommonPrefix(prefix: string, delimiter: string, key: string): string | null {
    if (!delimiter) {
      return null;
    }
    const baseLength = prefix.length;
    const remainder = key.slice(baseLength);
    const index = remainder.indexOf(delimiter);
    if (index === -1) {
      return null;
    }
    return key.slice(0, baseLength + index + delimiter.length);
  }
}

export default RemoteSqliteClient;
