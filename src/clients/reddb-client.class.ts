import path from 'path';
import EventEmitter from 'events';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { chunk } from 'lodash-es';
import {
  createRedDbClient,
  type RedDbClient as ReckerRedDbNativeClient,
  type RedDbEntityData as ReckerRedDbEntityData,
  type RedDbOperationEnvelope,
  type RedDbQueryData,
  type RedDbTransportMode,
} from 'recker';

import { tryFn } from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { createHttpClient } from '../concerns/http-client.js';
import { DatabaseError, NoSuchKey, ResourceError } from '../errors.js';
import { TasksRunner } from '../tasks/tasks-runner.class.js';
import { createLogger } from '../concerns/logger.js';
import type { LogLevel } from '../types/common.types.js';
import type { HttpClient } from '../concerns/http-client.js';
import type {
  RedDbClientConfig,
  Logger,
  ClientConfig,
  QueueStats,
  MonitoringConfig,
  TaskManager,
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
} from './types.js';

const pathPosix = path.posix;

interface RedDbEntity {
  id: number;
  kind: string;
  collection: string;
  data: {
    named?: Record<string, unknown>;
    columns?: unknown[];
  };
  cross_refs?: unknown[];
}

interface RedDbQueryResponse {
  items?: RedDbEntity[];
  total?: number;
  next_offset?: number | null;
  collection?: string;
}

interface RedDbMutationResponse {
  ok: boolean;
  id?: number;
  entity?: RedDbEntity;
  error?: string;
  deleted?: boolean;
}

interface RedDbRecord {
  _entity_id?: number;
  _collection?: string;
  _kind?: string;
  [key: string]: unknown;
}

interface RedDbPrefixPage {
  items: RedDbEntity[];
  hasMore: boolean;
}

interface NativeDeleteBatchResult {
  Deleted: DeleteObjectsResponse['Deleted'];
  Errors: DeleteObjectsResponse['Errors'];
}

function escapeSqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function toSafeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isNotFoundLike(error: unknown): boolean {
  return error instanceof Error && (error.name === 'NotFoundError' || /not found/i.test(error.message));
}

function generateETag(body: unknown): string {
  const hash = createHash('md5');
  if (Buffer.isBuffer(body)) hash.update(body);
  else if (typeof body === 'string') hash.update(body);
  else if (body !== undefined && body !== null) hash.update(JSON.stringify(body));
  else hash.update('');
  return `"${hash.digest('hex')}"`;
}

function encodeBody(body: unknown): { _body: string; _body_encoding: string } | { _body: undefined; _body_encoding: undefined } {
  if (body === undefined || body === null) {
    return { _body: undefined as any, _body_encoding: undefined as any };
  }
  if (Buffer.isBuffer(body)) {
    return { _body: body.toString('base64'), _body_encoding: 'base64' };
  }
  if (typeof body === 'string') {
    return { _body: body, _body_encoding: 'utf8' };
  }
  return { _body: JSON.stringify(body), _body_encoding: 'json' };
}

function decodeBody(encoded: string | undefined, encoding: string | undefined): Buffer | string | undefined {
  if (encoded === undefined || encoded === null) return undefined;
  if (encoding === 'base64') return Buffer.from(encoded, 'base64');
  return encoded;
}

/**
 * RedDB Client for s3db.js
 *
 * Maps the s3db.js key-value object interface to RedDB using Recker's V2
 * transport-aware client, with HTTP fallback retained for compatibility.
 * Each object is stored as a RedDB row with _key, _body, _content_type,
 * _content_encoding, _etag fields. Object metadata maps to RedDB metadata.
 *
 * Connection string: reddb://[authToken@]host:port[/keyPrefix]
 */
export class RedDbClient extends EventEmitter {
  id: string;
  logLevel: string;
  private logger: Logger;
  private taskExecutorMonitoring: MonitoringConfig | null;
  private taskManager: TaskManager;
  private _httpClient: HttpClient | null;
  private _nativeClient: ReckerRedDbNativeClient | null;
  private _ensureIndexesEnabled: boolean;
  private _warmupIndexes: boolean;
  private _indexTransport?: RedDbTransportMode;
  private _indexPrimePromise: Promise<void> | null;
  private _indexesPrimed: boolean;
  private timeout: number;
  private baseUrl: string;
  private authToken: string | undefined;
  private writeToken: string | undefined;
  private collection: string;
  bucket: string;
  private keyPrefix: string;
  private _keyPrefixForStrip: string;
  connectionString: string;
  config: ClientConfig;

  constructor(config: RedDbClientConfig) {
    super();

    this.id = config.id || idGenerator(77);
    this.logLevel = config.logLevel || 'info';

    if (config.logger) {
      this.logger = config.logger;
    } else {
      this.logger = createLogger({ name: 'RedDbClient', level: this.logLevel as LogLevel });
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
        monitoring: this.taskExecutorMonitoring || undefined,
      }) as any;
    }

    this.timeout = config.timeout ?? 30000;
    this.baseUrl = config.baseUrl;
    this.authToken = config.authToken;
    this.writeToken = config.writeToken;
    this.bucket = config.bucket || 's3db';
    this.collection = config.collection || this.bucket;
    this.keyPrefix = config.keyPrefix || '';
    this._keyPrefixForStrip = this.keyPrefix ? pathPosix.join(this.keyPrefix, '') : '';
    this._httpClient = null;
    this._nativeClient = createRedDbClient({
      baseUrl: this.baseUrl,
      authToken: this.authToken,
      writeToken: this.writeToken,
      transport: config.transport,
      allowTransportFallback: config.allowTransportFallback,
      headers: config.headers,
      timeout: this.timeout,
      http2: config.http2,
      wireAddress: config.wireAddress,
      wireTls: config.wireTls,
      wirePoolSize: config.wirePoolSize,
      wireKeepAlive: config.wireKeepAlive,
      wireKeepAliveInitialDelayMs: config.wireKeepAliveInitialDelayMs,
      wireConnectTimeout: config.wireConnectTimeout,
      grpcAddress: config.grpcAddress,
      grpcTls: config.grpcTls,
      grpcOptions: config.grpcOptions,
      grpcKeepalive: config.grpcKeepalive,
      operationTimeouts: config.operationTimeouts,
      batchConcurrency: config.batchConcurrency,
    });
    this._ensureIndexesEnabled = config.ensureIndexes ?? true;
    this._warmupIndexes = config.warmupIndexes ?? this._ensureIndexesEnabled;
    this._indexTransport = config.indexTransport;
    this._indexPrimePromise = null;
    this._indexesPrimed = false;

    const urlObj = new URL(this.baseUrl);
    if (this.authToken) urlObj.username = this.authToken;
    urlObj.pathname = this.keyPrefix ? `/${this.keyPrefix}` : '/';
    this.connectionString = `reddb://${urlObj.username ? urlObj.username + '@' : ''}${urlObj.host}${urlObj.pathname === '/' ? '' : urlObj.pathname}`;

    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: config.region || 'reddb',
      endpoint: this.baseUrl,
      forcePathStyle: true,
    };

    this.logger.debug({
      id: this.id,
      baseUrl: this.baseUrl,
      collection: this.collection,
      transport: config.transport ?? 'auto',
      wireAddress: config.wireAddress,
      grpcAddress: config.grpcAddress,
    }, `Initialized (id: ${this.id})`);
  }

  private async _getHttpClient(): Promise<HttpClient> {
    if (!this._httpClient) {
      this._httpClient = await createHttpClient({
        baseUrl: this.baseUrl,
        timeout: this.timeout,
        auth: this.authToken ? { type: 'bearer', token: this.authToken } : undefined,
        retry: { maxAttempts: 3, backoff: 'exponential' },
      });
    }
    return this._httpClient;
  }

  private _primeIndexes(): void {
    if (!this._nativeClient || !this._ensureIndexesEnabled || this._indexesPrimed || this._indexPrimePromise) {
      return;
    }

    this._indexPrimePromise = this._ensureIndexes()
      .then(() => {
        this._indexesPrimed = true;
      })
      .catch((error) => {
        this.logger.debug({
          collection: this.collection,
          error: error instanceof Error ? error.message : String(error),
        }, 'RedDB index priming skipped');
      })
      .finally(() => {
        this._indexPrimePromise = null;
      });
  }

  private async _ensureIndexes(): Promise<void> {
    if (!this._nativeClient) return;

    const commonOptions = this._indexTransport
      ? { transport: this._indexTransport }
      : {};

    const hashIndexName = this._hashIndexName();
    const btreeIndexName = this._btreeIndexName();

    await this._nativeClient.indexes.create({
      ...commonOptions,
      name: hashIndexName,
      collection: this.collection,
      columns: ['_key'],
      method: 'HASH',
    });

    await this._nativeClient.indexes.create({
      ...commonOptions,
      name: btreeIndexName,
      collection: this.collection,
      columns: ['_key'],
      method: 'BTREE',
    });

    if (!this._warmupIndexes) {
      return;
    }

    await this._nativeClient.indexes.warmup({
      ...commonOptions,
      name: hashIndexName,
    });

    await this._nativeClient.indexes.warmup({
      ...commonOptions,
      name: btreeIndexName,
    });
  }

  private _hashIndexName(): string {
    return `${this._safeIndexPrefix()}__s3db_key_hash`;
  }

  private _btreeIndexName(): string {
    return `${this._safeIndexPrefix()}__s3db_key_btree`;
  }

  private _safeIndexPrefix(): string {
    const normalized = this.collection.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return normalized || 's3db';
  }

  private _recordToEntity(record: RedDbRecord | null | undefined): RedDbEntity | null {
    if (!record || typeof record !== 'object') {
      return null;
    }

    const named: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === '_entity_id' || key === '_collection' || key === '_kind') {
        continue;
      }
      named[key] = value;
    }

    return {
      id: toSafeNumber(record._entity_id) ?? 0,
      kind: typeof record._kind === 'string' ? record._kind : 'row',
      collection: typeof record._collection === 'string' ? record._collection : this.collection,
      data: {
        named,
      },
    };
  }

  private _extractNativeRecords(
    envelope: RedDbOperationEnvelope<RedDbQueryData>
  ): RedDbRecord[] {
    const records = envelope.data.result?.records;
    return Array.isArray(records) ? records as RedDbRecord[] : [];
  }

  private _extractNativeId(data: ReckerRedDbEntityData | undefined, fallback?: number): number | undefined {
    return toSafeNumber(data?.id) ?? fallback;
  }

  private _extractAffectedRows(
    envelope: RedDbOperationEnvelope<RedDbQueryData>
  ): number {
    return toSafeNumber(envelope.data.affected_rows) ?? toSafeNumber(envelope.metrics.affectedRows) ?? 0;
  }

  private async _readBody(body: unknown): Promise<Buffer | string | undefined> {
    if (body === undefined || body === null) return undefined;
    if (Buffer.isBuffer(body) || typeof body === 'string') return body;
    if (body instanceof Uint8Array) return Buffer.from(body);

    const candidate = body as Readable & {
      transformToByteArray?: () => Promise<Uint8Array>;
      transformToString?: (encoding?: string) => Promise<string>;
    };

    if (typeof candidate.transformToByteArray === 'function') {
      return Buffer.from(await candidate.transformToByteArray());
    }

    if (typeof candidate.transformToString === 'function') {
      return await candidate.transformToString();
    }

    if (candidate instanceof Readable || typeof (candidate as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
      const chunks: Buffer[] = [];
      for await (const chunk of candidate as AsyncIterable<unknown>) {
        if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
        else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
        else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
        else chunks.push(Buffer.from(String(chunk)));
      }
      return Buffer.concat(chunks);
    }

    return body as Buffer | string;
  }

  private async _queryByKey(fullKey: string): Promise<RedDbEntity | null> {
    if (this._nativeClient) {
      try {
        const envelope = await this._nativeClient.sql.query(
          `SELECT _entity_id, _collection, _kind, _key, _body, _body_encoding, _etag, _content_type, _content_encoding, _content_length, _last_modified, _metadata FROM ${escapeSqlIdentifier(this.collection)} WHERE _key = ${escapeSqlLiteral(fullKey)} LIMIT 1`
        );
        this._primeIndexes();
        return this._recordToEntity(this._extractNativeRecords(envelope)[0]);
      } catch (error) {
        if (isNotFoundLike(error)) {
          return null;
        }
        throw error;
      }
    }

    return await this._queryByKeyHttp(fullKey);
  }

  private async _queryByKeyHttp(fullKey: string): Promise<RedDbEntity | null> {
    const client = await this._getHttpClient();
    const escaped = fullKey.replace(/'/g, "''");
    const res = await client.post('/query', {
      body: { query: `FROM ${this.collection} WHERE _key = '${escaped}' LIMIT 1` },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      const text = await res.text();
      throw new DatabaseError(`RedDB query failed: ${text}`, {
        operation: 'query',
        statusCode: res.status,
        retriable: res.status >= 500,
      });
    }

    const data: RedDbQueryResponse = await res.json();
    return data.items?.[0] || null;
  }

  private async _queryByPrefix(
    fullPrefix: string,
    limit: number,
    offset: number
  ): Promise<{ items: RedDbEntity[]; total: number }> {
    return await this._queryByPrefixHttp(fullPrefix, limit, offset);
  }

  private async _queryByPrefixPageNative(
    fullPrefix: string,
    limit: number,
    offset: number
  ): Promise<RedDbPrefixPage> {
    if (!this._nativeClient) {
      return { items: [], hasMore: false };
    }

    const safeLimit = Math.max(0, limit);
    const fetchLimit = safeLimit + 1;
    const escapedPrefix = fullPrefix.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    const whereClause = fullPrefix
      ? ` WHERE _key LIKE '${escapedPrefix}%'`
      : '';
    const sql = `SELECT _entity_id, _collection, _kind, _key, _etag, _content_length, _last_modified FROM ${escapeSqlIdentifier(this.collection)}${whereClause} ORDER BY _key LIMIT ${fetchLimit} OFFSET ${offset}`;
    let records: RedDbRecord[] = [];
    try {
      const envelope = await this._nativeClient.sql.query(sql);
      records = this._extractNativeRecords(envelope);
      this._primeIndexes();
    } catch (error) {
      if (!isNotFoundLike(error)) {
        throw error;
      }
    }

    return {
      items: records.slice(0, safeLimit).map((record) => this._recordToEntity(record)).filter(Boolean) as RedDbEntity[],
      hasMore: records.length > safeLimit,
    };
  }

  private async _queryByPrefixHttp(
    fullPrefix: string,
    limit: number,
    offset: number
  ): Promise<{ items: RedDbEntity[]; total: number }> {
    const client = await this._getHttpClient();
    const escaped = fullPrefix.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    const whereClause = fullPrefix
      ? `WHERE _key LIKE '${escaped}%'`
      : '';
    const query = `FROM ${this.collection} ${whereClause} ORDER BY _key LIMIT ${limit} OFFSET ${offset}`;

    const res = await client.post('/query', { body: { query } });

    if (!res.ok) {
      if (res.status === 404) return { items: [], total: 0 };
      const text = await res.text();
      throw new DatabaseError(`RedDB query failed: ${text}`, {
        operation: 'query',
        statusCode: res.status,
        retriable: res.status >= 500,
      });
    }

    const data: RedDbQueryResponse = await res.json();
    return { items: data.items || [], total: data.total || 0 };
  }

  private async _countByPrefixNative(fullPrefix: string): Promise<number> {
    if (!this._nativeClient) {
      const { total } = await this._queryByPrefixHttp(fullPrefix, 0, 0);
      return total;
    }

    const escapedPrefix = fullPrefix.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    const whereClause = fullPrefix
      ? ` WHERE _key LIKE '${escapedPrefix}%'`
      : '';
    try {
      const envelope = await this._nativeClient.sql.query(
        `SELECT COUNT(*) AS total FROM ${escapeSqlIdentifier(this.collection)}${whereClause}`
      );
      const total = this._extractNativeRecords(envelope)[0]?.total;
      this._primeIndexes();
      return toSafeNumber(total) ?? 0;
    } catch (error) {
      if (isNotFoundLike(error)) {
        return 0;
      }
      throw error;
    }
  }

  private async _deleteKeysNative(keys: string[]): Promise<NativeDeleteBatchResult> {
    if (!this._nativeClient) {
      throw new DatabaseError('RedDB native client is not available for bulk delete', {
        operation: 'deleteObjects',
        retriable: false,
      });
    }

    if (keys.length === 0) {
      return { Deleted: [], Errors: [] };
    }

    const fullKeys = keys.map((key) => this._applyKeyPrefix(key));
    const conditions = fullKeys.map((key) => `_key = ${escapeSqlLiteral(key)}`).join(' OR ');
    try {
      await this._nativeClient.sql.query(
        `DELETE FROM ${escapeSqlIdentifier(this.collection)} WHERE ${conditions}`
      );
    } catch (error) {
      if (!isNotFoundLike(error)) {
        throw error;
      }
    }
    this._primeIndexes();

    return {
      Deleted: keys.map((key) => ({ Key: key })),
      Errors: [],
    };
  }

  private async _deletePrefixNative(fullPrefix: string): Promise<number> {
    if (!this._nativeClient) {
      return 0;
    }

    const escapedPrefix = fullPrefix.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    const whereClause = fullPrefix
      ? ` WHERE _key LIKE '${escapedPrefix}%'`
      : '';
    try {
      const envelope = await this._nativeClient.sql.query(
        `DELETE FROM ${escapeSqlIdentifier(this.collection)}${whereClause}`
      );
      this._primeIndexes();
      return this._extractAffectedRows(envelope);
    } catch (error) {
      if (isNotFoundLike(error)) {
        return 0;
      }
      throw error;
    }
  }

  private _entityToS3Object(entity: RedDbEntity, includeBody = true): S3Object {
    const named = entity.data?.named || {};
    const bodyStr = named._body as string | undefined;
    const bodyEncoding = named._body_encoding as string | undefined;
    const decodedBody = includeBody ? decodeBody(bodyStr, bodyEncoding) : undefined;
    const etag = (named._etag as string) || '';
    const contentType = (named._content_type as string) || 'application/octet-stream';
    const contentEncoding = named._content_encoding as string | undefined;
    const contentLength = named._content_length as number | undefined;
    const lastModified = named._last_modified as string | undefined;

    const metadata: Record<string, string> = {};
    const metaRaw = named._metadata as Record<string, string> | undefined;
    if (metaRaw && typeof metaRaw === 'object') {
      for (const [k, v] of Object.entries(metaRaw)) {
        metadata[k] = typeof v === 'string' ? v : String(v);
      }
    }

    const decodedMetadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metadata)) {
      decodedMetadata[k] = metadataDecode(v);
    }

    const obj: S3Object = {
      Metadata: decodedMetadata as Record<string, string>,
      ContentType: contentType,
      ETag: etag,
      LastModified: lastModified ? new Date(lastModified) : new Date(),
    };

    if (includeBody && decodedBody !== undefined) {
      const bodyBuf = Buffer.isBuffer(decodedBody) ? decodedBody : Buffer.from(decodedBody);
      obj.Body = Readable.from(bodyBuf) as S3Object['Body'];
    }

    if (contentEncoding) obj.ContentEncoding = contentEncoding;
    if (contentLength !== undefined) obj.ContentLength = contentLength;

    return obj;
  }

  private _buildRowFields(
    key: string,
    params: {
      body?: unknown;
      metadata?: Record<string, unknown>;
      contentType?: string;
      contentEncoding?: string;
      contentLength?: number;
    }
  ): Record<string, unknown> {
    const { _body, _body_encoding } = encodeBody(params.body);
    const etag = generateETag(params.body);
    const encodedMetadata: Record<string, string> = {};

    if (params.metadata) {
      for (const [rawKey, value] of Object.entries(params.metadata)) {
        const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
        const { encoded } = metadataEncode(value);
        encodedMetadata[validKey] = encoded;
      }
    }

    const fields: Record<string, unknown> = {
      _key: key,
      _etag: etag,
      _content_type: params.contentType || 'application/octet-stream',
      _last_modified: new Date().toISOString(),
      _metadata: encodedMetadata,
    };

    if (_body !== undefined) fields._body = _body;
    if (_body_encoding !== undefined) fields._body_encoding = _body_encoding;
    if (params.contentEncoding) fields._content_encoding = params.contentEncoding;
    if (params.contentLength !== undefined) fields._content_length = params.contentLength;

    return fields;
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
    const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;
    const fullKey = this._applyKeyPrefix(key);
    const existing = await this._queryByKey(fullKey);

    if (ifNoneMatch === '*' && existing) {
      throw new ResourceError('Precondition failed', {
        code: 'PRECONDITION_FAILED',
        statusCode: 412,
        key,
        bucket: this.bucket,
        retriable: false,
        suggestion: 'Object already exists and ifNoneMatch=* was specified.',
      });
    }

    if (ifMatch && existing) {
      const existingETag = (existing.data?.named?._etag as string) || '';
      if (existingETag !== ifMatch) {
        throw new ResourceError('Precondition failed', {
          code: 'PRECONDITION_FAILED',
          statusCode: 412,
          key,
          bucket: this.bucket,
          retriable: false,
          suggestion: 'ETag does not match. Fetch latest state and retry.',
        });
      }
    }

    const normalizedBody = await this._readBody(body);
    const fields = this._buildRowFields(fullKey, {
      body: normalizedBody,
      metadata,
      contentType,
      contentEncoding,
      contentLength,
    });

    let resultId: number | undefined;

    if (this._nativeClient) {
      if (existing) {
        const result = await this._nativeClient.rows.patch({
          collection: this.collection,
          id: existing.id,
          payload: { fields },
        });
        resultId = this._extractNativeId(result.data, existing.id);
      } else {
        const result = await this._nativeClient.rows.create({
          collection: this.collection,
          payload: { fields },
        });
        resultId = this._extractNativeId(result.data);
      }
      this._primeIndexes();
    } else {
      const client = await this._getHttpClient();
      let res: Response;
      if (existing) {
        res = await client.patch(`/collections/${encodeURIComponent(this.collection)}/entities/${existing.id}`, {
          body: { fields },
        });
      } else {
        res = await client.post(`/collections/${encodeURIComponent(this.collection)}/rows`, {
          body: { fields },
        });
      }

      if (!res.ok) {
        const text = await res.text();
        throw new DatabaseError(`RedDB put failed: ${text}`, {
          operation: existing ? 'PatchEntity' : 'CreateRow',
          key,
          bucket: this.bucket,
          statusCode: res.status,
          retriable: res.status >= 500,
        });
      }

      const result: RedDbMutationResponse = await res.json();
      resultId = result.id;
    }

    const etag = fields._etag as string;

    const response: PutObjectResponse = {
      ETag: etag,
      VersionId: String(resultId || existing?.id || ''),
      ServerSideEncryption: null,
      Location: `reddb://${this.collection}/${fullKey}`,
    };

    this.emit('cl:response', 'PutObjectCommand', response, { Key: key, Metadata: metadata });
    return response;
  }

  async getObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const entity = await this._queryByKey(fullKey);

    if (!entity) {
      throw new NoSuchKey({
        bucket: this.bucket,
        key,
        retriable: false,
      });
    }

    const obj = this._entityToS3Object(entity, true);
    this.emit('cl:response', 'GetObjectCommand', obj, { Key: key });
    return obj;
  }

  async headObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const entity = await this._queryByKey(fullKey);

    if (!entity) {
      throw new NoSuchKey({
        bucket: this.bucket,
        key,
        retriable: false,
      });
    }

    const obj = this._entityToS3Object(entity, false);
    this.emit('cl:response', 'HeadObjectCommand', obj, { Key: key });
    return obj;
  }

  async copyObject(params: CopyObjectParams): Promise<CopyObjectResponse> {
    const { from, to, metadata, metadataDirective, contentType } = params;
    const fullFrom = this._applyKeyPrefix(from);
    const fullTo = this._applyKeyPrefix(to);

    const sourceEntity = await this._queryByKey(fullFrom);
    if (!sourceEntity) {
      throw new NoSuchKey({
        bucket: this.bucket,
        key: from,
        retriable: false,
      });
    }

    const useSourceMetadata = metadataDirective !== 'REPLACE';
    const sourceNamed = sourceEntity.data?.named || {};
    const sourceBody = decodeBody(
      sourceNamed._body as string | undefined,
      sourceNamed._body_encoding as string | undefined
    );
    const sourceMetadata = (() => {
      const raw = sourceNamed._metadata as Record<string, string> | undefined;
      if (!raw || typeof raw !== 'object') return {};
      const decoded: Record<string, unknown> = {};
      for (const [metaKey, value] of Object.entries(raw)) {
        decoded[metaKey] = metadataDecode(typeof value === 'string' ? value : String(value));
      }
      return decoded;
    })();

    const fields = this._buildRowFields(fullTo, {
      body: sourceBody,
      metadata: useSourceMetadata ? sourceMetadata : (metadata as Record<string, unknown>),
      contentType: contentType || (sourceNamed._content_type as string | undefined),
      contentEncoding: sourceNamed._content_encoding as string | undefined,
      contentLength: toSafeNumber(sourceNamed._content_length),
    });

    const existing = await this._queryByKey(fullTo);

    if (this._nativeClient) {
      if (existing) {
        await this._nativeClient.rows.patch({
          collection: this.collection,
          id: existing.id,
          payload: { fields },
        });
      } else {
        await this._nativeClient.rows.create({
          collection: this.collection,
          payload: { fields },
        });
      }
      this._primeIndexes();
    } else {
      const client = await this._getHttpClient();
      let res: Response;
      if (existing) {
        res = await client.patch(`/collections/${encodeURIComponent(this.collection)}/entities/${existing.id}`, {
          body: { fields },
        });
      } else {
        res = await client.post(`/collections/${encodeURIComponent(this.collection)}/rows`, {
          body: { fields },
        });
      }

      if (!res.ok) {
        const text = await res.text();
        throw new DatabaseError(`RedDB copy failed: ${text}`, {
          operation: 'CopyObject',
          key: to,
          bucket: this.bucket,
          statusCode: res.status,
          retriable: res.status >= 500,
        });
      }
    }

    const response: CopyObjectResponse = {
      CopyObjectResult: {
        ETag: fields._etag as string,
        LastModified: new Date().toISOString(),
      },
      BucketKeyEnabled: false,
      VersionId: null,
      ServerSideEncryption: null,
    };

    this.emit('cl:response', 'CopyObjectCommand', response, { CopySource: from, Key: to });
    return response;
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this._applyKeyPrefix(key);
    const entity = await this._queryByKey(fullKey);
    return entity !== null;
  }

  async deleteObject(key: string): Promise<DeleteObjectResponse> {
    if (this._nativeClient) {
      const fullKey = this._applyKeyPrefix(key);
      await this._nativeClient.sql.query(
        `DELETE FROM ${escapeSqlIdentifier(this.collection)} WHERE _key = ${escapeSqlLiteral(fullKey)}`
      );
      this._primeIndexes();
    } else {
      const fullKey = this._applyKeyPrefix(key);
      const entity = await this._queryByKey(fullKey);

      if (entity) {
        const client = await this._getHttpClient();
        const res = await client.delete(
          `/collections/${encodeURIComponent(this.collection)}/entities/${entity.id}`
        );

        if (!res.ok && res.status !== 404) {
          const text = await res.text();
          throw new DatabaseError(`RedDB delete failed: ${text}`, {
            operation: 'DeleteObject',
            key,
            bucket: this.bucket,
            statusCode: res.status,
            retriable: res.status >= 500,
          });
        }
      }
    }

    const response: DeleteObjectResponse = { DeleteMarker: false, VersionId: '' };
    this.emit('cl:response', 'DeleteObjectCommand', response, { Key: key });
    return response;
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResponse> {
    const nativeBatchSize = 200;
    const batches = chunk(keys, this._nativeClient ? nativeBatchSize : (this.taskManager.concurrency || 5));
    const allResults: DeleteObjectsResponse = { Deleted: [], Errors: [] };

    const { results } = await this.taskManager.process(
      batches,
      async (batch: string[]) => {
        if (this._nativeClient) {
          return await this._deleteKeysNative(batch);
        }

        const batchResults: DeleteObjectsResponse = { Deleted: [], Errors: [] };
        for (const key of batch) {
          try {
            await this.deleteObject(key);
            batchResults.Deleted.push({ Key: key });
          } catch (err) {
            batchResults.Errors.push({
              Key: key,
              Code: 'InternalError',
              Message: (err as Error).message,
            });
          }
        }
        return batchResults;
      }
    );

    for (const result of results) {
      allResults.Deleted.push(...result.Deleted);
      allResults.Errors.push(...result.Errors);
    }

    this.emit('cl:response', 'DeleteObjectsCommand', allResults, {
      Delete: { Objects: keys.map((key) => ({ Key: key })) },
    });

    return allResults;
  }

  async listObjects(params: ListObjectsParams = {}): Promise<ListObjectsResponse> {
    const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');

    let offset = 0;
    if (continuationToken) {
      try {
        offset = parseInt(Buffer.from(continuationToken, 'base64').toString('utf8'), 10);
      } catch {
        offset = 0;
      }
    }

    let items: RedDbEntity[] = [];
    let isTruncated = false;

    if (this._nativeClient) {
      if (maxKeys > 0) {
        const page = await this._queryByPrefixPageNative(fullPrefix, maxKeys, offset);
        items = page.items;
        isTruncated = page.hasMore;
      } else {
        isTruncated = (await this._countByPrefixNative(fullPrefix)) > offset;
      }
    } else {
      const page = await this._queryByPrefix(fullPrefix, maxKeys, offset);
      items = page.items;
      isTruncated = offset + items.length < page.total;
    }

    const contents: Array<{ Key: string; Size: number; LastModified: Date; ETag: string }> = [];
    const commonPrefixSet = new Set<string>();

    for (const entity of items) {
      const named = entity.data?.named || {};
      const rawKey = named._key as string;
      const key = this._stripKeyPrefix(rawKey);

      if (delimiter) {
        const relKey = prefix ? key.slice(prefix.length) : key;
        const delimIndex = relKey.indexOf(delimiter);
        if (delimIndex >= 0) {
          const prefixStr = (prefix || '') + relKey.slice(0, delimIndex + delimiter.length);
          commonPrefixSet.add(prefixStr);
          continue;
        }
      }

      contents.push({
        Key: key,
        Size: (named._content_length as number) || 0,
        LastModified: named._last_modified ? new Date(named._last_modified as string) : new Date(),
        ETag: (named._etag as string) || '',
      });
    }

    const nextOffset = isTruncated ? offset + items.length : null;
    const nextContinuationToken = nextOffset !== null
      ? Buffer.from(String(nextOffset), 'utf8').toString('base64')
      : undefined;

    const response: ListObjectsResponse = {
      Contents: contents,
      CommonPrefixes: Array.from(commonPrefixSet).sort().map((p) => ({ Prefix: p })),
      IsTruncated: isTruncated,
      ContinuationToken: continuationToken || undefined,
      NextContinuationToken: nextContinuationToken,
      KeyCount: contents.length,
      MaxKeys: maxKeys,
      Prefix: prefix || undefined,
      Delimiter: delimiter || undefined,
    };

    this.emit('cl:response', 'ListObjectsV2Command', response, { Prefix: prefix, MaxKeys: maxKeys });
    return response;
  }

  async getKeysPage(params: GetKeysPageParams = {}): Promise<string[]> {
    const { prefix = '', offset = 0, amount = 100 } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const items = this._nativeClient
      ? (await this._queryByPrefixPageNative(fullPrefix, amount, offset)).items
      : (await this._queryByPrefix(fullPrefix, amount, offset)).items;
    const keys = items.map((e) => this._stripKeyPrefix((e.data?.named?._key as string) || ''));

    this.emit('cl:GetKeysPage', keys, params);
    return keys;
  }

  async getAllKeys(params: { prefix?: string } = {}): Promise<string[]> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const allKeys: string[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      let items: RedDbEntity[] = [];
      let hasMore = false;

      if (this._nativeClient) {
        const page = await this._queryByPrefixPageNative(fullPrefix, pageSize, offset);
        items = page.items;
        hasMore = page.hasMore;
      } else {
        const page = await this._queryByPrefix(fullPrefix, pageSize, offset);
        items = page.items;
        hasMore = offset + items.length < page.total;
      }

      for (const entity of items) {
        allKeys.push(this._stripKeyPrefix((entity.data?.named?._key as string) || ''));
      }
      offset += items.length;
      if (!hasMore || items.length === 0) break;
    }

    this.emit('cl:GetAllKeys', allKeys, params);
    return allKeys;
  }

  async count(params: { prefix?: string } = {}): Promise<number> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const total = this._nativeClient
      ? await this._countByPrefixNative(fullPrefix)
      : (await this._queryByPrefix(fullPrefix, 0, 0)).total;
    this.emit('cl:Count', total, { prefix });
    return total;
  }

  async deleteAll(params: { prefix?: string } = {}): Promise<number> {
    const { prefix = '' } = params;
    let totalDeleted = 0;

    if (this._nativeClient) {
      totalDeleted = await this._deletePrefixNative(this._applyKeyPrefix(prefix || ''));
      if (totalDeleted > 0) {
        this.emit('deleteAll', { prefix, batch: totalDeleted, total: totalDeleted });
      }
    } else {
      const keys = await this.getAllKeys({ prefix });
      if (keys.length > 0) {
        const result = await this.deleteObjects(keys);
        totalDeleted = result.Deleted.length;
        this.emit('deleteAll', { prefix, batch: totalDeleted, total: totalDeleted });
      }
    }

    this.emit('deleteAllComplete', { prefix, totalDeleted });
    return totalDeleted;
  }

  async getContinuationTokenAfterOffset(params: { prefix?: string; offset?: number } = {}): Promise<string | null> {
    const { prefix = '', offset = 1000 } = params;
    if (offset === 0) return null;

    const total = await this.count({ prefix });
    if (offset >= total) {
      this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    const token = Buffer.from(String(offset), 'utf8').toString('base64');
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
        original: err,
      });
    }

    return true;
  }

  async moveAllObjects(params: { prefixFrom: string; prefixTo: string }): Promise<Array<{ from: string; to: string }>> {
    const { prefixFrom, prefixTo } = params;
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const { results, errors } = await this.taskManager.process(
      keys,
      async (key: string) => {
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
        errors,
      };
      throw error;
    }

    return results;
  }

  async destroy(): Promise<void> {
    const taskManager = this.taskManager as { destroy?: () => Promise<void> | void };
    if (typeof taskManager.destroy === 'function') {
      await taskManager.destroy();
    }
    if (this._nativeClient) {
      await this._nativeClient.close();
      this._nativeClient = null;
    }
    this._httpClient = null;
    this.removeAllListeners();
  }

  private _applyKeyPrefix(key?: string): string {
    if (!this.keyPrefix) {
      if (key === undefined || key === null) return '';
      return key;
    }
    if (key === undefined || key === null || key === '') {
      return pathPosix.join(this.keyPrefix, '');
    }
    return pathPosix.join(this.keyPrefix, key);
  }

  private _stripKeyPrefix(key: string = ''): string {
    if (!this.keyPrefix) return key;
    const normalizedPrefix = this._keyPrefixForStrip;
    if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
      return key.slice(normalizedPrefix.length).replace(/^\/+/, '');
    }
    return key;
  }
}

export default RedDbClient;
