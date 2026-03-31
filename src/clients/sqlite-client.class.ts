import path from 'path';
import { mkdirSync } from 'fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';
import EventEmitter from 'events';
import { createHash } from 'crypto';
import { chunk } from 'lodash-es';

import { tryFn } from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { normalizeEtagHeader } from './client-compat.js';
import { getNodeSqliteAvailabilityError, getNodeSqliteDatabaseSync } from './sqlite-runtime.js';
import { createLogger } from '../concerns/logger.js';
import { mapAwsError, DatabaseError, ResourceError, ValidationError, BaseError, NoSuchKey } from '../errors.js';
import { TasksRunner } from '../tasks/tasks-runner.class.js';
import type { LogLevel } from '../types/common.types.js';
import type { DatabaseSync as NodeSqliteDatabaseSync } from 'node:sqlite';
import type {
  Logger,
  SqliteClientConfig,
  TaskManager,
  MonitoringConfig,
  PutObjectParams,
  CopyObjectParams,
  ListObjectsParams,
  GetKeysPageParams,
  GetFilteredObjectsPageParams,
  GetFilteredObjectsWindowParams,
  FilteredObjectsWindowResponse,
  FilteredObjectsPageFilter,
  QueueStats,
  S3Object,
  PutObjectResponse,
  CopyObjectResponse,
  DeleteObjectResponse,
  DeleteObjectsResponse,
  ListObjectsResponse
} from './types.js';

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
  constructor?: { name: string };
  name?: string;
  input?: CommandInput;
}

interface DbRow {
  key: string;
  metadata: string;
  content_type: string;
  content_encoding: string | null;
  content_length: number;
  etag: string;
  last_modified: string;
  body: Buffer;
}

interface DbObjectHeaderRow {
  key: string;
  metadata: string;
  content_type: string;
  content_encoding: string | null;
  content_length: number;
  etag: string;
  last_modified: string;
}

interface DbObjectStateRow {
  content_length: number;
  etag: string;
}

interface DbListRow {
  key: string;
  content_type: string;
  content_encoding: string | null;
  content_length: number;
  etag: string;
  last_modified: string;
}

interface DbCountRow {
  total: number;
}

interface DbBucketStatsRow {
  total_content_length: number;
}

interface DbDeleteSummaryRow {
  total_objects: number;
  total_content_length: number;
}

interface DbPartitionRow {
  key: string;
  metadata: string;
  content_type: string;
  etag: string;
  last_modified: string;
}

type DbCopySourceRow = DbRow & {
  source: 'object' | 'partition';
};

type SqlitePreparedStatement = ReturnType<NodeSqliteDatabaseSync['prepare']>;

export class SqliteClient extends EventEmitter {
  id: string;
  logLevel: string;
  readonly supportsPartitionIndex = true;
  private logger: Logger;
  private taskExecutorMonitoring: MonitoringConfig | null;
  private taskManager: TaskManager;
  private db: NodeSqliteDatabaseSync;
  private dbPath: string;
  bucket: string;
  private keyPrefix: string;
  private region: string;
  private _keyPrefixForStrip: string;
  connectionString: string;
  config: {
    bucket: string;
    keyPrefix: string;
    region: string;
    endpoint: string;
    forcePathStyle: true;
    basePath: string;
  };
  private enforceLimits: boolean;
  private metadataLimit: number;
  private maxObjectSize: number;
  private maxMemoryMB?: number;
  private maxMemoryBytes: number | null;
  private basePath: string;
  private _closed = false;
  private _writeTransactionDepth = 0;
  private _activeWriteToken: symbol | null = null;
  private _pendingWriteLock: Promise<void> = Promise.resolve();
  private readonly _writeContext = new AsyncLocalStorage<symbol>();
  private readonly statementCache = new Map<string, SqlitePreparedStatement>();
  private _sqliteVecEnabled = false;
  private _sqliteVecLoaded = false;
  private readonly _vecTables = new Set<string>();

  constructor(config: SqliteClientConfig = {}) {
    super();

    this.id = config.id || idGenerator(77);
    this.logLevel = config.logLevel || 'info';
    this.enforceLimits = Boolean(config.enforceLimits);
    this.metadataLimit = config.metadataLimit ?? 2048;
    this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024;
    this.maxMemoryMB = typeof config.maxMemoryMB === 'number' && config.maxMemoryMB > 0
      ? config.maxMemoryMB
      : undefined;
    this.maxMemoryBytes = this.maxMemoryMB
      ? Math.floor(this.maxMemoryMB * 1024 * 1024)
      : null;

    if (config.logger) {
      this.logger = config.logger;
    } else {
      this.logger = createLogger({ name: 'SqliteClient', level: this.logLevel as LogLevel });
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
        retryDelay: config.retryDelay || 1000,
        timeout: config.timeout || 30000,
        retryableErrors: config.retryableErrors || [],
        monitoring: this.taskExecutorMonitoring || undefined
      }) as any;
    }

    this.bucket = config.bucket || 's3db';
    this.keyPrefix = config.keyPrefix || '';
    this.region = config.region || 'sqlite';
    this._keyPrefixForStrip = this.keyPrefix ? path.posix.join(this.keyPrefix, '') : '';

    const rawBasePath = config.basePath || path.join(process.cwd(), 's3db.sqlite');
    this.dbPath = rawBasePath === ':memory:'
      ? ':memory:'
      : path.resolve(rawBasePath);
    this.basePath = this.dbPath;

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.basePath);
      mkdirSync(dir, { recursive: true });
    }

    this.connectionString = this.dbPath === ':memory:'
      ? 'sqlite:///:memory:'
      : `sqlite:///${encodeURI(this.basePath).replace(/^\//, '')}`;

    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: this.region,
      endpoint: this.connectionString,
      forcePathStyle: true,
      basePath: this.basePath
    };

    let DatabaseSyncClass: new (path: string) => NodeSqliteDatabaseSync;
    try {
      DatabaseSyncClass = getNodeSqliteDatabaseSync();
    } catch {
      const availabilityError = getNodeSqliteAvailabilityError();
      throw new DatabaseError('SqliteClient requires the node:sqlite builtin module, which is not available in this runtime.', {
        operation: 'SqliteClient.constructor',
        retriable: false,
        suggestion: 'Run on a Node.js runtime that provides node:sqlite, or use FileSystemClient/MemoryClient instead.',
        original: availabilityError || undefined
      });
    }

    this.db = new DatabaseSyncClass(this.basePath) as NodeSqliteDatabaseSync;

    // page_size must be set before the first table is created; ignored on existing DBs
    tryFn(() => this.db.exec('PRAGMA page_size = 8192;'));

    this.db.exec(`
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
      );

      CREATE TABLE IF NOT EXISTS bucket_stats (
        bucket TEXT PRIMARY KEY,
        total_content_length INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS partition_index (
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        resource_name TEXT NOT NULL,
        partition_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        metadata TEXT NOT NULL,
        content_type TEXT NOT NULL,
        etag TEXT NOT NULL,
        last_modified TEXT NOT NULL,
        PRIMARY KEY (bucket, key)
      );

      CREATE INDEX IF NOT EXISTS idx_partition_index_lookup
      ON partition_index (bucket, resource_name, partition_name, record_id);
    `);

    this._rebuildBucketStats();
    this._ensureBucketStatsRow();

    tryFn(() => this.db.exec('PRAGMA journal_mode = WAL;'));
    tryFn(() => this.db.exec(`
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
      PRAGMA mmap_size = 268435456;
      PRAGMA busy_timeout = 5000;
    `));

    this.logger.debug(
      {
        id: this.id,
        bucket: this.bucket,
        keyPrefix: this.keyPrefix,
        region: this.region,
        basePath: this.basePath
      },
      `Initialized (id: ${this.id}, dbPath: ${this.basePath})`
    );
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
    const commandName = command?.constructor?.name || command?.name || 'UnknownCommand';
    const input = command?.input || {};

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
    return this.putObject({
      key: input.Key ?? '',
      metadata: input.Metadata,
      contentType: input.ContentType,
      body: input.Body as PutObjectParams['body'],
      contentEncoding: input.ContentEncoding,
      contentLength: input.ContentLength,
      ifMatch: input.IfMatch,
      ifNoneMatch: input.IfNoneMatch
    });
  }

  private async _handleGetObject(input: CommandInput): Promise<S3Object> {
    return this.getObject(input.Key || '');
  }

  private async _handleHeadObject(input: CommandInput): Promise<S3Object> {
    return this.headObject(input.Key || '');
  }

  private async _handleCopyObject(input: CommandInput): Promise<CopyObjectResponse> {
    const { sourceBucket, sourceKey } = this._parseCopySource(input.CopySource);

    if (sourceBucket && sourceBucket !== this.bucket) {
      throw new DatabaseError(`Cross-bucket copy is not supported in SqliteClient (requested ${sourceBucket} → ${this.bucket})`, {
        operation: 'CopyObject',
        retriable: false,
        suggestion: 'Instantiate a SqliteClient with the requested destination bucket or copy within the same bucket.'
      });
    }

    return this.copyObject({
      from: sourceKey,
      to: input.Key || '',
      metadata: input.Metadata,
      metadataDirective: input.MetadataDirective,
      contentType: input.ContentType
    });
  }

  private async _handleDeleteObject(input: CommandInput): Promise<DeleteObjectResponse> {
    return this.deleteObject(input.Key || '');
  }

  private async _handleDeleteObjects(input: CommandInput): Promise<DeleteObjectsResponse> {
    const objects = input.Delete?.Objects || [];
    const keys = objects.map(obj => obj.Key);
    return this.deleteObjects(keys);
  }

  private async _handleListObjects(input: CommandInput): Promise<ListObjectsResponse> {
    return this.listObjects({
      prefix: input.Prefix || '',
      delimiter: input.Delimiter,
      maxKeys: input.MaxKeys,
      continuationToken: input.ContinuationToken,
      startAfter: input.StartAfter ? this._applyKeyPrefix(input.StartAfter) : null
    });
  }

  async putObject(params: PutObjectParams): Promise<PutObjectResponse> {
    return this._runWriteTask(async () => {
      const {
        key,
        metadata,
        contentType,
        body,
        contentEncoding,
        contentLength,
        ifMatch,
        ifNoneMatch
      } = params;

      const fullKey = this._applyKeyPrefix(key);
      const responseInput = {
        Key: key,
        Metadata: metadata,
        ContentType: contentType,
        Body: body,
        ContentEncoding: contentEncoding,
        ContentLength: contentLength,
        IfMatch: ifMatch,
        IfNoneMatch: ifNoneMatch
      };

      try {
        const initialState = this._getObjectState(fullKey);
        const objectLengthFromLimit = this._getWriteBodyLimit(initialState?.content_length || 0);
        const objectBody = await this._normalizeBody(body, objectLengthFromLimit);
        const objectLength = objectBody.length;
        const shouldMaterializePartition = this._shouldMaterializePartitionWrite(fullKey, objectBody);

        if (shouldMaterializePartition) {
          const response = this._withWriteTransaction(() => {
            const existingPartitionRow = this._getPartitionIndexRow(fullKey);
            const existingObjectRow = this._getObjectState(fullKey);
            const existingRow = existingPartitionRow
              ? { content_length: 0, etag: existingPartitionRow.etag }
              : existingObjectRow;

            this._validateLimits(objectBody, metadata, fullKey);
            this._validateMemoryBudget(0, existingObjectRow?.content_length || 0, fullKey);

            if (ifMatch !== undefined && ifMatch !== null) {
              if (!existingRow) {
                throw new ResourceError(`Precondition failed: object does not exist for key "${fullKey}"`, {
                  bucket: this.bucket,
                  key: fullKey,
                  code: 'PreconditionFailed',
                  statusCode: 412,
                  retriable: false,
                  suggestion: 'Fetch the latest object and retry with the current ETag in ifMatch.'
                });
              }

              const expectedEtags = normalizeEtagHeader(ifMatch);
              if (!expectedEtags.includes(existingRow.etag)) {
                throw new ResourceError(`Precondition failed: ETag mismatch for key "${fullKey}"`, {
                  bucket: this.bucket,
                  key: fullKey,
                  code: 'PreconditionFailed',
                  statusCode: 412,
                  retriable: false,
                  suggestion: 'Fetch the latest object and retry with the current ETag in ifMatch.'
                });
              }
            }

            if (ifNoneMatch !== undefined && ifNoneMatch !== null && existingRow) {
              if (ifNoneMatch === '*') {
                throw new ResourceError(`Precondition failed: object already exists for key "${fullKey}"`, {
                  bucket: this.bucket,
                  key: fullKey,
                  code: 'PreconditionFailed',
                  statusCode: 412,
                  retriable: false,
                  suggestion: 'Use ifNoneMatch: "*" only when the key should be created.'
                });
              }

              const normalized = normalizeEtagHeader(ifNoneMatch);
              if (normalized.includes(existingRow.etag)) {
                throw new ResourceError(`Precondition failed: object already exists for key "${fullKey}"`, {
                  bucket: this.bucket,
                  key: fullKey,
                  code: 'PreconditionFailed',
                  statusCode: 412,
                  retriable: false,
                  suggestion: 'Remove ifNoneMatch header if you want to overwrite the object.'
                });
              }
            }

            const partitionEntry = this._parsePartitionIndexKey(fullKey);
            if (!partitionEntry) {
              throw new DatabaseError(`Invalid partition index key: ${fullKey}`, {
                operation: 'putObject',
                bucket: this.bucket,
                key: fullKey,
                retriable: false,
                suggestion: 'Partition index keys must include resource=, partition= and id= segments.'
              });
            }

            const encodedMetadata = this._encodeMetadata(metadata);
            const now = new Date().toISOString();
            const etag = this._generateEtag(objectBody);
            const statement = this._prepareCached(`
              INSERT INTO partition_index (
                bucket, key, resource_name, partition_name, record_id, metadata, content_type, etag, last_modified
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(bucket, key) DO UPDATE SET
                resource_name = excluded.resource_name,
                partition_name = excluded.partition_name,
                record_id = excluded.record_id,
                metadata = excluded.metadata,
                content_type = excluded.content_type,
                etag = excluded.etag,
                last_modified = excluded.last_modified
            `);

            statement.run(
              this.bucket,
              fullKey,
              partitionEntry.resourceName,
              partitionEntry.partitionName,
              partitionEntry.recordId,
              JSON.stringify(encodedMetadata || {}),
              contentType || 'application/octet-stream',
              etag,
              now
            );

            if (existingObjectRow) {
              const legacyDeleteStatement = this._prepareCached('DELETE FROM objects WHERE bucket = ? AND key = ?');
              legacyDeleteStatement.run(this.bucket, fullKey);
              this._adjustBucketSize(-existingObjectRow.content_length);
            }

            return {
              ETag: this._formatEtag(etag),
              VersionId: null,
              ServerSideEncryption: null,
              Location: `/${this.bucket}/${fullKey}`
            } satisfies PutObjectResponse;
          });

          this.emit('cl:response', 'PutObjectCommand', response, responseInput);
          return response;
        }

        const response = this._withWriteTransaction(() => {
          const existingPartitionRow = this._getPartitionIndexRow(fullKey);
          const existingRow = existingPartitionRow
            ? { content_length: 0, etag: existingPartitionRow.etag }
            : this._getObjectState(fullKey);
          this._validateLimits(objectBody, metadata, fullKey);
          this._validateMemoryBudget(objectLength, existingRow?.content_length || 0, fullKey);
          const storedContentLength = typeof contentLength === 'number' ? contentLength : objectLength;

          if (ifMatch !== undefined && ifMatch !== null) {
            if (!existingRow) {
              throw new ResourceError(`Precondition failed: object does not exist for key "${fullKey}"`, {
                bucket: this.bucket,
                key: fullKey,
                code: 'PreconditionFailed',
                statusCode: 412,
                retriable: false,
                suggestion: 'Fetch the latest object and retry with the current ETag in ifMatch.'
              });
            }

            const expectedEtags = normalizeEtagHeader(ifMatch);
            if (!expectedEtags.includes(existingRow.etag)) {
              throw new ResourceError(`Precondition failed: ETag mismatch for key "${fullKey}"`, {
                bucket: this.bucket,
                key: fullKey,
                code: 'PreconditionFailed',
                statusCode: 412,
                retriable: false,
                suggestion: 'Fetch the latest object and retry with the current ETag in ifMatch.'
              });
            }
          }

          if (ifNoneMatch !== undefined && ifNoneMatch !== null && existingRow) {
            if (ifNoneMatch === '*') {
              throw new ResourceError(`Precondition failed: object already exists for key "${fullKey}"`, {
                bucket: this.bucket,
                key: fullKey,
                code: 'PreconditionFailed',
                statusCode: 412,
                retriable: false,
                suggestion: 'Use ifNoneMatch: "*" only when the key should be created.'
              });
            }

            const normalized = normalizeEtagHeader(ifNoneMatch);
            if (normalized.includes(existingRow.etag)) {
              throw new ResourceError(`Precondition failed: object already exists for key "${fullKey}"`, {
                bucket: this.bucket,
                key: fullKey,
                code: 'PreconditionFailed',
                statusCode: 412,
                retriable: false,
                suggestion: 'Remove ifNoneMatch header if you want to overwrite the object.'
              });
            }
          }

          const encodedMetadata = this._encodeMetadata(metadata);
          const now = new Date().toISOString();
          const etag = this._generateEtag(objectBody);
          const statement = this._prepareCached(`
            INSERT INTO objects (
              bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(bucket, key) DO UPDATE SET
              metadata = excluded.metadata,
              content_type = excluded.content_type,
              content_encoding = excluded.content_encoding,
              content_length = excluded.content_length,
              etag = excluded.etag,
              last_modified = excluded.last_modified,
              body = excluded.body
          `);

          statement.run(
            this.bucket,
            fullKey,
            JSON.stringify(encodedMetadata || {}),
            contentType || 'application/octet-stream',
            contentEncoding || null,
            storedContentLength,
            etag,
            now,
            objectBody
          );
          this._adjustBucketSize(storedContentLength - (existingRow?.content_length || 0));

          return {
            ETag: this._formatEtag(etag),
            VersionId: null,
            ServerSideEncryption: null,
            Location: `/${this.bucket}/${fullKey}`
          } satisfies PutObjectResponse;
        });

        this.emit('cl:response', 'PutObjectCommand', response, responseInput);
        return response;
      } catch (error) {
        if (error instanceof BaseError) {
          throw error;
        }
        throw mapAwsError(error as Error, {
          bucket: this.bucket,
          key: fullKey,
          operation: 'putObject',
          commandName: 'PutObjectCommand',
          commandInput: responseInput
        });
      }
    });
  }

  private _getWriteBodyLimit(existingSize: number): { maxBytes: number; code: string; suggestion: string } | null {
    let limit = Number.POSITIVE_INFINITY;
    let code = 'EntityTooLarge';
    let suggestion = 'Reduce object size or increase maxObjectSize in SqliteClient configuration.';

    if (this.enforceLimits && this.maxObjectSize > 0) {
      limit = Math.min(limit, this.maxObjectSize);
      code = 'EntityTooLarge';
      suggestion = 'Reduce object size or increase maxObjectSize in SqliteClient configuration.';
    }

    if (this.maxMemoryBytes !== null) {
      const currentUsage = this._getCurrentBucketSize();
      const budgetLimit = this.maxMemoryBytes - currentUsage + Math.max(existingSize, 0);
      if (budgetLimit < limit) {
        limit = Math.max(0, budgetLimit);
        code = 'SqliteMemoryLimitExceeded';
        suggestion = 'Lower object size/payload volume or raise maxMemoryMB for this SqliteClient.';
      }
    }

    if (!Number.isFinite(limit)) {
      return null;
    }

    return { maxBytes: Math.floor(limit), code, suggestion };
  }

  async getObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const responseInput = { Key: key };

    try {
      const partitionRow = this._isPartitionIndexKey(fullKey)
        ? this._getPartitionIndexRow(fullKey)
        : null;
      const row = partitionRow ? null : this._getRow(fullKey);
      if (partitionRow) {
        const response = this._normalizePartitionObject(partitionRow, false);
        this.emit('cl:response', 'GetObjectCommand', response, responseInput);
        return response;
      }

      if (!row) {
        throw new NoSuchKey({
          bucket: this.bucket,
          key: fullKey,
          statusCode: 404,
          retriable: false,
          suggestion: 'Ensure the key exists before attempting to read it.'
        });
      }

      const response = this._normalizeObject(row, false);
      this.emit('cl:response', 'GetObjectCommand', response, responseInput);
      return response;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw mapAwsError(error as Error, {
        bucket: this.bucket,
        key: fullKey,
        operation: 'getObject',
        commandName: 'GetObjectCommand',
        commandInput: responseInput
      });
    }
  }

  async getObjects(keys: string[]): Promise<Array<{ key: string; object: S3Object }>> {
    if (!Array.isArray(keys) || keys.length === 0) {
      return [];
    }

    const keyEntries = keys.map((key) => ({
      requestedKey: key,
      fullKey: this._applyKeyPrefix(key)
    }));
    const rowsByKey = new Map<string, DbRow>();

    for (const batch of chunk(keyEntries, 500)) {
      if (batch.length === 0) {
        continue;
      }

      const placeholders = batch.map(() => '?').join(', ');
      const statement = this._prepareCached(`
        SELECT key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
        FROM objects
        WHERE bucket = ? AND key IN (${placeholders})
      `);
      const rows = statement.all(
        this.bucket,
        ...batch.map((entry) => entry.fullKey)
      ) as unknown as DbRow[];

      for (const row of rows) {
        rowsByKey.set(row.key, row);
      }
    }

    return keyEntries.flatMap(({ requestedKey, fullKey }) => {
      const row = rowsByKey.get(fullKey);
      if (!row) {
        return [];
      }

      return [{
        key: requestedKey,
        object: this._normalizeObject(row, false)
      }];
    });
  }

  async headObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const responseInput = { Key: key };

    try {
      const partitionRow = this._isPartitionIndexKey(fullKey)
        ? this._getPartitionIndexRow(fullKey)
        : null;
      const row = partitionRow ? null : this._getObjectHeaderRow(fullKey);
      if (partitionRow) {
        const response = this._normalizePartitionObject(partitionRow, true);
        this.emit('cl:response', 'HeadObjectCommand', response, responseInput);
        return response;
      }

      if (!row) {
        throw new NoSuchKey({
          bucket: this.bucket,
          key: fullKey,
          statusCode: 404,
          retriable: false,
          suggestion: 'Ensure the key exists before attempting to read it.'
        });
      }

      const response = this._normalizeObject(row, true);
      this.emit('cl:response', 'HeadObjectCommand', response, responseInput);
      return response;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw mapAwsError(error as Error, {
        bucket: this.bucket,
        key: fullKey,
        operation: 'headObject',
        commandName: 'HeadObjectCommand',
        commandInput: responseInput
      });
    }
  }

  async copyObject(params: CopyObjectParams): Promise<CopyObjectResponse> {
    return this._runWriteTask(async () => {
      const { from, to, metadata, metadataDirective, contentType } = params;
      const fullFrom = this._applyKeyPrefix(from);
      const fullTo = this._applyKeyPrefix(to);
      const responseInput = {
        CopySource: from,
        Key: to,
        Metadata: metadata,
        MetadataDirective: metadataDirective,
        ContentType: contentType
      };

      try {
        const response = this._withWriteTransaction(() => {
          const sourceRow = this._getCopySourceRow(fullFrom);
          if (!sourceRow) {
            throw new NoSuchKey({
              bucket: this.bucket,
              key: fullFrom,
              statusCode: 404,
              retriable: false,
              suggestion: 'Copy requires an existing source object.'
            });
          }

          const destinationRow = this._getObjectState(fullTo);
          const destinationPartitionRow = this._isPartitionIndexKey(fullTo)
            ? this._getPartitionIndexRow(fullTo)
            : null;
          this._validateMemoryBudget(sourceRow.content_length, destinationRow?.content_length || 0, fullTo);

          const sourceMetadata = this._decodeMetadataRow(sourceRow);
          const normalizedMetadata = this._encodeMetadata(sourceMetadata);
          let finalMetadata: Record<string, string>;

          if (metadataDirective === 'REPLACE' && metadata) {
            finalMetadata = this._encodeMetadata(metadata) || {};
          } else if (metadata) {
            finalMetadata = { ...normalizedMetadata, ...this._encodeMetadata(metadata) };
          } else {
            finalMetadata = normalizedMetadata || {};
          }

          const finalContentType = contentType || sourceRow.content_type;
          const now = new Date().toISOString();
          const shouldMaterializeDestination = this._shouldMaterializePartitionWrite(fullTo, sourceRow.body);

          if (shouldMaterializeDestination) {
            const partitionEntry = this._parsePartitionIndexKey(fullTo);
            if (!partitionEntry) {
              throw new DatabaseError(`Invalid partition index key: ${fullTo}`, {
                operation: 'copyObject',
                bucket: this.bucket,
                key: fullTo,
                retriable: false,
                suggestion: 'Partition index keys must include resource=, partition= and id= segments.'
              });
            }

            const statement = this._prepareCached(`
              INSERT INTO partition_index (
                bucket, key, resource_name, partition_name, record_id, metadata, content_type, etag, last_modified
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(bucket, key) DO UPDATE SET
                resource_name = excluded.resource_name,
                partition_name = excluded.partition_name,
                record_id = excluded.record_id,
                metadata = excluded.metadata,
                content_type = excluded.content_type,
                etag = excluded.etag,
                last_modified = excluded.last_modified
            `);

            statement.run(
              this.bucket,
              fullTo,
              partitionEntry.resourceName,
              partitionEntry.partitionName,
              partitionEntry.recordId,
              JSON.stringify(finalMetadata || {}),
              finalContentType,
              sourceRow.etag,
              now
            );

            if (destinationRow) {
              const deleteLegacyStatement = this._prepareCached('DELETE FROM objects WHERE bucket = ? AND key = ?');
              deleteLegacyStatement.run(this.bucket, fullTo);
              this._adjustBucketSize(-destinationRow.content_length);
            }
          } else if (fullFrom === fullTo && sourceRow.source === 'object') {
            const statement = this._prepareCached(`
              UPDATE objects
              SET metadata = ?, content_type = ?, last_modified = ?
              WHERE bucket = ? AND key = ?
            `);
            statement.run(
              JSON.stringify(finalMetadata || {}),
              finalContentType,
              now,
              this.bucket,
              fullTo
            );
          } else {
            const statement = this._prepareCached(`
              INSERT INTO objects (
                bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(bucket, key) DO UPDATE SET
                metadata = excluded.metadata,
                content_type = excluded.content_type,
                content_encoding = excluded.content_encoding,
                content_length = excluded.content_length,
                etag = excluded.etag,
                last_modified = excluded.last_modified,
                body = excluded.body
            `);

            statement.run(
              this.bucket,
              fullTo,
              JSON.stringify(finalMetadata || {}),
              finalContentType,
              sourceRow.content_encoding,
              sourceRow.content_length,
              sourceRow.etag,
              now,
              sourceRow.body
            );
            this._adjustBucketSize(sourceRow.content_length - (destinationRow?.content_length || 0));

            if (destinationPartitionRow) {
              const deletePartitionStatement = this._prepareCached('DELETE FROM partition_index WHERE bucket = ? AND key = ?');
              deletePartitionStatement.run(this.bucket, fullTo);
            }
          }

          return {
            CopyObjectResult: {
              ETag: this._formatEtag(sourceRow.etag),
              LastModified: now
            },
            BucketKeyEnabled: false,
            VersionId: null,
            ServerSideEncryption: null
          } satisfies CopyObjectResponse;
        });

        this.emit('cl:response', 'CopyObjectCommand', response, responseInput);
        return response;
      } catch (error) {
        if (error instanceof BaseError) {
          throw error;
        }
        throw mapAwsError(error as Error, {
          bucket: this.bucket,
          key: fullTo,
          operation: 'copyObject',
          commandName: 'CopyObjectCommand',
          commandInput: responseInput
        });
      }
    });
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this._applyKeyPrefix(key);
    if (this._isPartitionIndexKey(fullKey) && this._hasPartitionIndexKey(fullKey)) {
      return true;
    }
    return this._hasKey(fullKey);
  }

  async deleteObject(key: string): Promise<DeleteObjectResponse> {
    return this._runWriteTask(async () => {
      const fullKey = this._applyKeyPrefix(key);
      const responseInput = { Key: key };

      try {
        const response = this._withWriteTransaction(() => {
          const partitionRow = this._isPartitionIndexKey(fullKey)
            ? this._getPartitionIndexRow(fullKey)
            : null;
          const existingRow = this._getObjectState(fullKey);
          const objectDeleteStatement = this._prepareCached('DELETE FROM objects WHERE bucket = ? AND key = ?');
          objectDeleteStatement.run(this.bucket, fullKey);

          if (partitionRow) {
            const partitionDeleteStatement = this._prepareCached('DELETE FROM partition_index WHERE bucket = ? AND key = ?');
            partitionDeleteStatement.run(this.bucket, fullKey);
          }

          if (existingRow) {
            this._adjustBucketSize(-existingRow.content_length);
          }

          return {
            DeleteMarker: false,
            VersionId: null
          } satisfies DeleteObjectResponse;
        });

        this.emit('cl:response', 'DeleteObjectCommand', response, responseInput);
        return response;
      } catch (error) {
        if (error instanceof BaseError) {
          throw error;
        }
        throw mapAwsError(error as Error, {
          bucket: this.bucket,
          key: fullKey,
          operation: 'deleteObject',
          commandName: 'DeleteObjectCommand',
          commandInput: responseInput
        });
      }
    });
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResponse> {
    return this._runWriteTask(async () => {
      const fullKeys = keys.map(key => this._applyKeyPrefix(key));
      const input = { Delete: { Objects: keys.map(key => ({ Key: key })) } };

      const batches = chunk(fullKeys, this.taskManager.concurrency || 5);
      const allResults: DeleteObjectsResponse = { Deleted: [], Errors: [] };

      const { results, errors } = await this.taskManager.process(
        batches,
        async (batch) => {
          return this._withWriteTransaction(() => {
            const deleted: Array<{ Key: string }> = [];
            const batchErrors: Array<{ Key: string; Code: string; Message: string }> = [];
            const objectDeleteStatement = this._prepareCached('DELETE FROM objects WHERE bucket = ? AND key = ?');
            const partitionDeleteStatement = this._prepareCached('DELETE FROM partition_index WHERE bucket = ? AND key = ?');
            let reclaimedBytes = 0;

            for (const fullKey of batch) {
              try {
                const partitionRow = this._isPartitionIndexKey(fullKey)
                  ? this._getPartitionIndexRow(fullKey)
                  : null;
                const existingRow = this._getObjectState(fullKey);
                objectDeleteStatement.run(this.bucket, fullKey) as any;
                if (partitionRow) {
                  partitionDeleteStatement.run(this.bucket, fullKey) as any;
                }
                if (existingRow) {
                  reclaimedBytes += existingRow.content_length;
                }
                const localKey = this._stripKeyPrefix(fullKey);
                deleted.push({ Key: localKey });
              } catch (error) {
                batchErrors.push({
                  Key: this._stripKeyPrefix(fullKey),
                  Code: (error as Error).name || 'InternalError',
                  Message: (error as Error).message
                });
              }
            }

            if (reclaimedBytes > 0) {
              this._adjustBucketSize(-reclaimedBytes);
            }

            return { deleted, batchErrors };
          });
        }
      );

      for (const result of results) {
        allResults.Deleted.push(...result.deleted);
        if (result.batchErrors.length > 0) {
          allResults.Errors.push(...result.batchErrors);
        }
      }
      for (const error of errors) {
        const sourceError = error.error;
        allResults.Errors.push({
          Key: keys[error.index] || `index-${error.index}`,
          Code: sourceError instanceof Error ? sourceError.name : 'InternalError',
          Message: sourceError instanceof Error ? sourceError.message : 'Unknown error'
        });
      }

      this.emit('cl:response', 'DeleteObjectsCommand', allResults, input);
      return allResults;
    });
  }

  async listObjects(params: ListObjectsParams = {}): Promise<ListObjectsResponse> {
    const {
      prefix = '',
      delimiter = null,
      maxKeys = 1000,
      continuationToken = null,
      startAfter = null
    } = params;

    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const responseInput = {
      Prefix: prefix,
      Delimiter: delimiter,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
      StartAfter: startAfter
    };

    try {
      if (this._prefixTargetsPartitionIndex(fullPrefix)) {
        const response = this._listPartitionObjects({
          prefix,
          fullPrefix,
          delimiter,
          maxKeys,
          continuationToken,
          startAfter
        });
        this.emit('cl:response', 'ListObjectsV2Command', response, responseInput);
        return response;
      }

      const startFilter = continuationToken
        ? this._decodeContinuationToken(continuationToken)
        : startAfter;
      const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);

      const queryParams: Array<string | number> = [this.bucket, rangeStart, rangeEnd];
      const whereClauses: string[] = ['bucket = ?', 'key >= ?', 'key < ?'];

      if (startFilter) {
        whereClauses.push('key > ?');
        queryParams.push(startFilter);
      }

      const maxKeysValue = Number.isFinite(maxKeys) ? Math.trunc(maxKeys) : 1000;
      const safeMaxKeys = Math.max(1, maxKeysValue);
      const queryLimit = safeMaxKeys === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : safeMaxKeys + 1;
      const statement = this._prepareCached(`
        SELECT key, content_length, etag, last_modified, content_type, content_encoding
        FROM objects
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY key ASC
        LIMIT ?
      `);
      const rows = statement.all(...queryParams, queryLimit) as unknown as DbListRow[];
      const hasExtraRow = rows.length > safeMaxKeys;

      const contents: Array<{ Key: string; Size: number; LastModified: Date; ETag: string; StorageClass: string }> = [];
      const commonPrefixSet = new Set<string>();
      const commonPrefixes: Array<{ Prefix: string }> = [];

      let processed = 0;
      let hasMore = false;
      let lastKey: string | null = null;

      for (const row of rows) {
        if (processed >= safeMaxKeys) {
          hasMore = true;
          break;
        }

        const commonPrefix = delimiter
          ? this._extractCommonPrefix(fullPrefix, delimiter, row.key)
          : null;

        if (commonPrefix) {
          if (!commonPrefixSet.has(commonPrefix)) {
            commonPrefixSet.add(commonPrefix);
            commonPrefixes.push({ Prefix: this._stripKeyPrefix(commonPrefix) });
            processed++;
            lastKey = row.key;
          }
          continue;
        }

        contents.push({
          Key: this._stripKeyPrefix(row.key),
          Size: row.content_length,
          LastModified: new Date(row.last_modified),
          ETag: this._formatEtag(row.etag),
          StorageClass: 'STANDARD'
        });
        processed++;
        lastKey = row.key;
      }

      hasMore = hasMore || hasExtraRow;

      const response: ListObjectsResponse = {
        Contents: contents,
        CommonPrefixes: commonPrefixes,
        IsTruncated: hasMore,
        ContinuationToken: continuationToken || undefined,
        NextContinuationToken: hasMore && lastKey ? this._encodeContinuationToken(lastKey) : null,
        KeyCount: contents.length,
        MaxKeys: maxKeys,
        Prefix: prefix || undefined,
        Delimiter: delimiter,
        StartAfter: startAfter || undefined
      };

      this.emit('cl:response', 'ListObjectsV2Command', response, responseInput);
      return response;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      if (error instanceof Error) {
        throw mapAwsError(error, {
          bucket: this.bucket,
          operation: 'listObjects',
          commandName: 'ListObjectsV2Command',
          commandInput: responseInput
        });
      }
      throw new DatabaseError('Unexpected error in listObjects', {
        bucket: this.bucket,
        operation: 'listObjects'
      });
    }
  }

  async getKeysPage(params: GetKeysPageParams = {}): Promise<string[]> {
    const { prefix = '', offset = 0, amount = 100 } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    if (this._prefixTargetsPartitionIndex(fullPrefix)) {
      const keys = this._getPartitionKeysPage(fullPrefix, offset, amount);
      this.emit('cl:GetKeysPage', keys, params);
      return keys;
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const safeAmount = Math.max(0, Math.trunc(amount));
    const safeOffset = Math.max(0, Math.trunc(offset));
    const statement = this._prepareCached(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
      ORDER BY key ASC
      LIMIT ? OFFSET ?
    `);
    const rows = statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      safeAmount,
      safeOffset
    ) as Array<{ key: string }>;
    const keys = rows.map((row) => this._stripKeyPrefix(row.key));

    this.emit('cl:GetKeysPage', keys, params);
    return keys;
  }

  async getFilteredObjectsPage(params: GetFilteredObjectsPageParams): Promise<Array<{ key: string; object: S3Object }>> {
    const { prefix, offset = 0, amount = 100, filters = [] } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const safeAmount = Math.max(0, Math.trunc(amount));
    const safeOffset = Math.max(0, Math.trunc(offset));

    const rows = this._prefixTargetsPartitionIndex(fullPrefix)
      ? this._getFilteredPartitionObjectRows(fullPrefix, filters, safeAmount, safeOffset)
      : this._getFilteredDataRows(fullPrefix, filters, safeAmount, safeOffset);

    const results = rows.map((row) => ({
      key: this._stripKeyPrefix(row.key),
      object: this._normalizeObject(row, false)
    }));

    this.emit('cl:GetFilteredObjectsPage', results, params);
    return results;
  }

  async getFilteredObjectsWindow(params: GetFilteredObjectsWindowParams): Promise<FilteredObjectsWindowResponse> {
    const {
      prefix,
      maxKeys = 100,
      continuationToken = null,
      filters = []
    } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const safeMaxKeys = Math.max(1, Math.trunc(maxKeys));
    const queryLimit = safeMaxKeys + 1;
    const startAfter = continuationToken
      ? this._decodeContinuationToken(continuationToken)
      : null;

    const rows = this._prefixTargetsPartitionIndex(fullPrefix)
      ? this._getFilteredPartitionObjectRowsAfter(fullPrefix, filters, queryLimit, startAfter)
      : this._getFilteredDataRowsAfter(fullPrefix, filters, queryLimit, startAfter);

    const hasMore = rows.length > safeMaxKeys;
    const visibleRows = hasMore ? rows.slice(0, safeMaxKeys) : rows;
    const lastVisibleRow = visibleRows.at(-1) || null;
    const response: FilteredObjectsWindowResponse = {
      Contents: visibleRows.map((row) => ({
        key: this._stripKeyPrefix(row.key),
        object: this._normalizeObject(row, false)
      })),
      IsTruncated: hasMore,
      NextContinuationToken: hasMore && lastVisibleRow ? this._encodeContinuationToken(lastVisibleRow.key) : null
    };

    this.emit('cl:GetFilteredObjectsWindow', response, params);
    return response;
  }

  async getAllKeys(params: { prefix?: string } = {}): Promise<string[]> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    if (this._prefixTargetsPartitionIndex(fullPrefix)) {
      return this._getAllPartitionKeys(fullPrefix);
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const statement = this._prepareCached(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
      ORDER BY key ASC
    `);
    const keys: string[] = [];

    for (const row of statement.iterate(
      this.bucket,
      rangeStart,
      rangeEnd
    ) as IterableIterator<{ key: string }>) {
      keys.push(this._stripKeyPrefix(row.key));
    }

    return keys;
  }

  async count(params: { prefix?: string } = {}): Promise<number> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    if (this._prefixTargetsPartitionIndex(fullPrefix)) {
      const count = this._countPartitionKeys(fullPrefix);
      this.emit('cl:Count', count, { prefix });
      return count;
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const statement = this._prepareCached(`
      SELECT COALESCE(COUNT(key), 0) AS total
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
    `);
    const row = statement.get(
      this.bucket,
      rangeStart,
      rangeEnd
    ) as DbCountRow | undefined;
    const count = Number(row?.total || 0);

    this.emit('cl:Count', count, { prefix });
    return count;
  }

  async deleteAll(params: { prefix?: string } = {}): Promise<number> {
    return this._runWriteTask(async () => {
      const { prefix = '' } = params;
      const fullPrefix = this._applyKeyPrefix(prefix || '');
      if (this._prefixTargetsPartitionIndex(fullPrefix)) {
        const totalDeleted = this._deleteAllPartitionKeys(fullPrefix);

        this.emit('deleteAll', {
          prefix,
          batch: totalDeleted,
          total: totalDeleted
        });

        this.emit('deleteAllComplete', {
          prefix,
          totalDeleted
        });
        return totalDeleted;
      }

      const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
      const totalDeleted = this._withWriteTransaction(() => {
        const summaryStatement = this._prepareCached(`
          SELECT
            COALESCE(COUNT(*), 0) AS total_objects,
            COALESCE(SUM(content_length), 0) AS total_content_length
          FROM objects
          WHERE bucket = ? AND key >= ? AND key < ?
        `);
        const deleteStatement = this._prepareCached(`
          DELETE FROM objects
          WHERE bucket = ? AND key >= ? AND key < ?
        `);
        const summary = summaryStatement.get(
          this.bucket,
          rangeStart,
          rangeEnd
        ) as DbDeleteSummaryRow | undefined;
        const totalObjects = Number(summary?.total_objects || 0);
        const reclaimedBytes = Number(summary?.total_content_length || 0);

        if (totalObjects === 0) {
          return 0;
        }

        deleteStatement.run(this.bucket, rangeStart, rangeEnd);
        if (reclaimedBytes > 0) {
          this._adjustBucketSize(-reclaimedBytes);
        }

        return totalObjects;
      });

      this.emit('deleteAll', {
        prefix,
        batch: totalDeleted,
        total: totalDeleted
      });

      this.emit('deleteAllComplete', {
        prefix,
        totalDeleted
      });
      return totalDeleted;
    });
  }

  async getContinuationTokenAfterOffset(params: { prefix?: string; offset?: number } = {}): Promise<string | null> {
    const { prefix = '', offset = 1000 } = params;
    if (offset === 0) {
      this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    const fullPrefix = this._applyKeyPrefix(prefix || '');
    if (this._prefixTargetsPartitionIndex(fullPrefix)) {
      const token = this._getPartitionContinuationTokenAfterOffset(fullPrefix, offset);
      this.emit('cl:GetContinuationTokenAfterOffset', token, { prefix, offset });
      return token;
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const offsetValue = Math.max(0, Math.trunc(offset));
    const statement = this._prepareCached(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
      ORDER BY key ASC
      LIMIT 1 OFFSET ?
    `);
    const row = statement.get(
      this.bucket,
      rangeStart,
      rangeEnd,
      offsetValue
    ) as { key: string } | undefined;

    if (!row) {
      this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    const token = this._encodeContinuationToken(row.key);

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
      throw new DatabaseError('Unexpected error in moveObject', {
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
    const allResults: Array<{ from: string; to: string }> = [];
    const allErrors: Array<{ error: Error; index: number; item?: unknown }> = [];
    let continuationToken: string | undefined;
    let truncated = true;

    while (truncated) {
      const listResult = await this.listObjects({
        prefix: prefixFrom,
        continuationToken,
        maxKeys: Math.max(this.taskManager.concurrency || 1000, 1)
      });
      const keys = listResult.Contents.map(x => x.Key);

      if (keys.length === 0) {
        break;
      }

      const { results, errors } = await this.taskManager.process(
        keys,
        async (key) => {
          const to = key.replace(prefixFrom, prefixTo);
          await this.moveObject({ from: key, to });
          return { from: key, to };
        }
      );

      allResults.push(...results);
      allErrors.push(...errors);

      truncated = listResult.IsTruncated || false;
      continuationToken = listResult.NextContinuationToken || undefined;
    }

    const errors = allErrors;
    const results = allResults;

    this.emit('moveAllObjects', { results, errors });

    if (errors.length > 0) {
      const error = new Error('Some objects could not be moved') as Error & { context: unknown };
      error.context = {
        bucket: this.bucket,
        operation: 'moveAllObjects',
        prefixFrom,
        prefixTo,
        totalKeys: results.length + errors.length,
        failedCount: errors.length,
        successCount: results.length,
        errors
      };
      throw error;
    }

    return results;
  }

  async destroy(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this.statementCache.clear();
    this.db.close();
    if (this.logger) {
      this.logger.debug('Closed sqlite database');
    }
    this.removeAllListeners();
  }

  async runInTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
    return this._runWriteTask(async () => {
      return this._withWriteTransactionAsync(fn);
    });
  }

  isInTransaction(): boolean {
    const currentToken = this._writeContext.getStore();
    return Boolean(currentToken && currentToken === this._activeWriteToken && this._writeTransactionDepth > 0);
  }

  private _shouldMaterializePartitionWrite(key: string, body: Buffer): boolean {
    return body.length === 0 && this._isPartitionIndexKey(key);
  }

  private _prefixTargetsPartitionIndex(prefix: string): boolean {
    if (!prefix) {
      return false;
    }

    return prefix.split('/').some((segment) => segment.startsWith('partition='));
  }

  private _isPartitionIndexKey(key: string): boolean {
    return this._parsePartitionIndexKey(key) !== null;
  }

  private _parsePartitionIndexKey(key: string): { resourceName: string; partitionName: string; recordId: string } | null {
    const segments = String(key || '').split('/');

    if (segments.includes('data')) {
      return null;
    }

    const resourceSegment = segments.find((segment) => segment.startsWith('resource='));
    const partitionSegment = segments.find((segment) => segment.startsWith('partition='));
    const idSegment = segments.find((segment) => segment.startsWith('id='));

    if (!resourceSegment || !partitionSegment || !idSegment) {
      return null;
    }

    const resourceName = resourceSegment.slice('resource='.length);
    const partitionName = partitionSegment.slice('partition='.length);
    const recordId = idSegment.slice('id='.length);

    if (!resourceName || !partitionName || !recordId) {
      return null;
    }

    return {
      resourceName,
      partitionName,
      recordId
    };
  }

  private _getPartitionIndexRow(key: string): DbPartitionRow | null {
    const statement = this._prepareCached(`
      SELECT key, metadata, content_type, etag, last_modified
      FROM partition_index
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbPartitionRow | undefined;
    return row || null;
  }

  private _hasPartitionIndexKey(key: string): boolean {
    const statement = this._prepareCached(`
      SELECT 1
      FROM partition_index
      WHERE bucket = ? AND key = ?
      LIMIT 1
    `);
    return Boolean(statement.get(this.bucket, key));
  }

  private _getCopySourceRow(key: string): DbCopySourceRow | null {
    const partitionRow = this._isPartitionIndexKey(key)
      ? this._getPartitionIndexRow(key)
      : null;

    if (partitionRow) {
      return {
        key: partitionRow.key,
        metadata: partitionRow.metadata,
        content_type: partitionRow.content_type,
        content_encoding: null,
        content_length: 0,
        etag: partitionRow.etag,
        last_modified: partitionRow.last_modified,
        body: Buffer.alloc(0),
        source: 'partition'
      };
    }

    const row = this._getRow(key);
    if (!row) {
      return null;
    }

    return {
      ...row,
      source: 'object'
    };
  }

  private _listPartitionObjects({
    prefix,
    fullPrefix,
    delimiter,
    maxKeys,
    continuationToken,
    startAfter
  }: {
    prefix: string;
    fullPrefix: string;
    delimiter: string | null;
    maxKeys: number;
    continuationToken: string | null;
    startAfter: string | null;
  }): ListObjectsResponse {
    const startFilter = continuationToken
      ? this._decodeContinuationToken(continuationToken)
      : startAfter;
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const maxKeysValue = Number.isFinite(maxKeys) ? Math.trunc(maxKeys) : 1000;
    const safeMaxKeys = Math.max(1, maxKeysValue);
    const queryLimit = safeMaxKeys === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : safeMaxKeys + 1;
    const params: Array<string | number> = [
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd
    ];

    const outerWhereClause = startFilter ? 'WHERE key > ?' : '';
    if (startFilter) {
      params.push(startFilter);
    }

    const statement = this._prepareCached(`
      SELECT key, content_length, etag, last_modified, content_type, content_encoding
      FROM (
        SELECT key, 0 AS content_length, etag, last_modified, content_type, NULL AS content_encoding
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION ALL
        SELECT o.key, o.content_length, o.etag, o.last_modified, o.content_type, o.content_encoding
        FROM objects o
        WHERE o.bucket = ? AND o.key >= ? AND o.key < ?
          AND NOT EXISTS (
            SELECT 1
            FROM partition_index p
            WHERE p.bucket = o.bucket AND p.key = o.key
          )
      )
      ${outerWhereClause}
      ORDER BY key ASC
      LIMIT ?
    `);
    const rows = statement.all(...params, queryLimit) as unknown as DbListRow[];
    const hasExtraRow = rows.length > safeMaxKeys;

    const contents: Array<{ Key: string; Size: number; LastModified: Date; ETag: string; StorageClass: string }> = [];
    const commonPrefixSet = new Set<string>();
    const commonPrefixes: Array<{ Prefix: string }> = [];

    let processed = 0;
    let hasMore = false;
    let lastKey: string | null = null;

    for (const row of rows) {
      if (processed >= safeMaxKeys) {
        hasMore = true;
        break;
      }

      const commonPrefix = delimiter
        ? this._extractCommonPrefix(fullPrefix, delimiter, row.key)
        : null;

      if (commonPrefix) {
        if (!commonPrefixSet.has(commonPrefix)) {
          commonPrefixSet.add(commonPrefix);
          commonPrefixes.push({ Prefix: this._stripKeyPrefix(commonPrefix) });
          processed++;
          lastKey = row.key;
        }
        continue;
      }

      contents.push({
        Key: this._stripKeyPrefix(row.key),
        Size: row.content_length,
        LastModified: new Date(row.last_modified),
        ETag: this._formatEtag(row.etag),
        StorageClass: 'STANDARD'
      });
      processed++;
      lastKey = row.key;
    }

    hasMore = hasMore || hasExtraRow;

    return {
      Contents: contents,
      CommonPrefixes: commonPrefixes,
      IsTruncated: hasMore,
      ContinuationToken: continuationToken || undefined,
      NextContinuationToken: hasMore && lastKey ? this._encodeContinuationToken(lastKey) : null,
      KeyCount: contents.length,
      MaxKeys: maxKeys,
      Prefix: prefix || undefined,
      Delimiter: delimiter,
      StartAfter: startAfter || undefined
    };
  }

  private _getPartitionKeysPage(fullPrefix: string, offset: number, amount: number): string[] {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const safeAmount = Math.max(0, Math.trunc(amount));
    const safeOffset = Math.max(0, Math.trunc(offset));
    const statement = this._prepareCached(`
      SELECT key
      FROM (
        SELECT key
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT key
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      )
      ORDER BY key ASC
      LIMIT ? OFFSET ?
    `);
    const rows = statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd,
      safeAmount,
      safeOffset
    ) as Array<{ key: string }>;

    return rows.map((row) => this._stripKeyPrefix(row.key));
  }

  private _buildFilteredObjectClause(
    alias: string,
    filters: FilteredObjectsPageFilter[]
  ): { sql: string; params: string[] } {
    if (!Array.isArray(filters) || filters.length === 0) {
      return { sql: '', params: [] };
    }

    const clauses: string[] = [];
    const params: string[] = [];

    for (const filter of filters) {
      const branchClauses: string[] = [
        `CAST(json_extract(${alias}.metadata, ?) AS TEXT) = ?`
      ];
      params.push(filter.metadataPath, filter.metadataValue);

      if (filter.mappedBodyPath && filter.mappedBodyValue !== undefined && filter.mappedBodyValue !== null) {
        branchClauses.push(`
          (
            json_valid(CAST(${alias}.body AS TEXT))
            AND CAST(json_extract(CAST(${alias}.body AS TEXT), ?) AS TEXT) = ?
          )
        `);
        params.push(filter.mappedBodyPath, filter.mappedBodyValue);
      }

      if (filter.rawBodyPath && filter.rawBodyValue !== undefined && filter.rawBodyValue !== null) {
        branchClauses.push(`
          (
            json_valid(CAST(${alias}.body AS TEXT))
            AND CAST(json_extract(CAST(${alias}.body AS TEXT), ?) AS TEXT) = ?
          )
        `);
        params.push(filter.rawBodyPath, filter.rawBodyValue);
      }

      clauses.push(`(${branchClauses.join(' OR ')})`);
    }

    return {
      sql: ` AND ${clauses.join(' AND ')}`,
      params
    };
  }

  private _buildDataKeyPrefixFromPartitionPrefix(fullPrefix: string): string | null {
    const segments = String(fullPrefix || '').split('/');
    const partitionIndex = segments.findIndex((segment) => segment.startsWith('partition='));

    if (partitionIndex <= 0) {
      return null;
    }

    return [...segments.slice(0, partitionIndex), 'data', 'id='].join('/');
  }

  private _getFilteredDataRows(
    fullPrefix: string,
    filters: FilteredObjectsPageFilter[],
    amount: number,
    offset: number
  ): DbRow[] {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const { sql: filterSql, params: filterParams } = this._buildFilteredObjectClause('o', filters);
    const statement = this._prepareCached(`
      SELECT o.key, o.metadata, o.content_type, o.content_encoding, o.content_length, o.etag, o.last_modified, o.body
      FROM objects o
      WHERE o.bucket = ? AND o.key >= ? AND o.key < ?${filterSql}
      ORDER BY o.key ASC
      LIMIT ? OFFSET ?
    `);

    return statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      ...filterParams,
      amount,
      offset
    ) as unknown as DbRow[];
  }

  private _getFilteredDataRowsAfter(
    fullPrefix: string,
    filters: FilteredObjectsPageFilter[],
    amount: number,
    startAfter: string | null
  ): DbRow[] {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const { sql: filterSql, params: filterParams } = this._buildFilteredObjectClause('o', filters);
    const afterSql = startAfter ? ' AND o.key > ?' : '';
    const statement = this._prepareCached(`
      SELECT o.key, o.metadata, o.content_type, o.content_encoding, o.content_length, o.etag, o.last_modified, o.body
      FROM objects o
      WHERE o.bucket = ? AND o.key >= ? AND o.key < ?${afterSql}${filterSql}
      ORDER BY o.key ASC
      LIMIT ?
    `);

    return statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      ...(startAfter ? [startAfter] : []),
      ...filterParams,
      amount
    ) as unknown as DbRow[];
  }

  private _getFilteredPartitionObjectRows(
    fullPrefix: string,
    filters: FilteredObjectsPageFilter[],
    amount: number,
    offset: number
  ): DbRow[] {
    const dataKeyPrefix = this._buildDataKeyPrefixFromPartitionPrefix(fullPrefix);
    if (!dataKeyPrefix) {
      return [];
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const { sql: filterSql, params: filterParams } = this._buildFilteredObjectClause('o', filters);
    const statement = this._prepareCached(`
      WITH matched_record_ids AS (
        SELECT record_id
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT substr(legacy.key, instr(legacy.key, '/id=') + 4) AS record_id
        FROM objects legacy
        WHERE legacy.bucket = ? AND legacy.key >= ? AND legacy.key < ?
          AND instr(legacy.key, '/id=') > 0
          AND NOT EXISTS (
            SELECT 1
            FROM partition_index p
            WHERE p.bucket = legacy.bucket AND p.key = legacy.key
          )
      )
      SELECT o.key, o.metadata, o.content_type, o.content_encoding, o.content_length, o.etag, o.last_modified, o.body
      FROM matched_record_ids m
      JOIN objects o
        ON o.bucket = ? AND o.key = ? || m.record_id
      WHERE 1 = 1${filterSql}
      ORDER BY o.key ASC
      LIMIT ? OFFSET ?
    `);

    return statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      dataKeyPrefix,
      ...filterParams,
      amount,
      offset
    ) as unknown as DbRow[];
  }

  private _getFilteredPartitionObjectRowsAfter(
    fullPrefix: string,
    filters: FilteredObjectsPageFilter[],
    amount: number,
    startAfter: string | null
  ): DbRow[] {
    const dataKeyPrefix = this._buildDataKeyPrefixFromPartitionPrefix(fullPrefix);
    if (!dataKeyPrefix) {
      return [];
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const { sql: filterSql, params: filterParams } = this._buildFilteredObjectClause('o', filters);
    const afterSql = startAfter ? ' AND o.key > ?' : '';
    const statement = this._prepareCached(`
      WITH matched_record_ids AS (
        SELECT record_id
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT substr(legacy.key, instr(legacy.key, '/id=') + 4) AS record_id
        FROM objects legacy
        WHERE legacy.bucket = ? AND legacy.key >= ? AND legacy.key < ?
          AND instr(legacy.key, '/id=') > 0
          AND NOT EXISTS (
            SELECT 1
            FROM partition_index p
            WHERE p.bucket = legacy.bucket AND p.key = legacy.key
          )
      )
      SELECT o.key, o.metadata, o.content_type, o.content_encoding, o.content_length, o.etag, o.last_modified, o.body
      FROM matched_record_ids m
      JOIN objects o
        ON o.bucket = ? AND o.key = ? || m.record_id
      WHERE 1 = 1${afterSql}${filterSql}
      ORDER BY o.key ASC
      LIMIT ?
    `);

    return statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      dataKeyPrefix,
      ...(startAfter ? [startAfter] : []),
      ...filterParams,
      amount
    ) as unknown as DbRow[];
  }

  private _getAllPartitionKeys(fullPrefix: string): string[] {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const statement = this._prepareCached(`
      SELECT key
      FROM (
        SELECT key
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT key
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      )
      ORDER BY key ASC
    `);
    const keys: string[] = [];

    for (const row of statement.iterate(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd
    ) as IterableIterator<{ key: string }>) {
      keys.push(this._stripKeyPrefix(row.key));
    }

    return keys;
  }

  private _countPartitionKeys(fullPrefix: string): number {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const statement = this._prepareCached(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT key
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT key
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      )
    `);
    const row = statement.get(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd
    ) as DbCountRow | undefined;

    return Number(row?.total || 0);
  }

  private _deleteAllPartitionKeys(fullPrefix: string): number {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);

    return this._withWriteTransaction(() => {
      const countStatement = this._prepareCached(`
        SELECT COUNT(*) AS total
        FROM (
          SELECT key
          FROM partition_index
          WHERE bucket = ? AND key >= ? AND key < ?
          UNION
          SELECT key
          FROM objects
          WHERE bucket = ? AND key >= ? AND key < ?
        )
      `);
      const objectSummaryStatement = this._prepareCached(`
        SELECT COALESCE(SUM(content_length), 0) AS total_content_length
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      `);
      const partitionDeleteStatement = this._prepareCached(`
        DELETE FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
      `);
      const objectDeleteStatement = this._prepareCached(`
        DELETE FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      `);

      const countRow = countStatement.get(
        this.bucket,
        rangeStart,
        rangeEnd,
        this.bucket,
        rangeStart,
        rangeEnd
      ) as DbCountRow | undefined;
      const objectSummary = objectSummaryStatement.get(
        this.bucket,
        rangeStart,
        rangeEnd
      ) as DbBucketStatsRow | undefined;
      const totalObjects = Number(countRow?.total || 0);
      const reclaimedBytes = Number(objectSummary?.total_content_length || 0);

      if (totalObjects === 0) {
        return 0;
      }

      partitionDeleteStatement.run(this.bucket, rangeStart, rangeEnd);
      objectDeleteStatement.run(this.bucket, rangeStart, rangeEnd);

      if (reclaimedBytes > 0) {
        this._adjustBucketSize(-reclaimedBytes);
      }

      return totalObjects;
    });
  }

  private _getPartitionContinuationTokenAfterOffset(fullPrefix: string, offset: number): string | null {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const offsetValue = Math.max(0, Math.trunc(offset));
    const statement = this._prepareCached(`
      SELECT key
      FROM (
        SELECT key
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT key
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      )
      ORDER BY key ASC
      LIMIT 1 OFFSET ?
    `);
    const row = statement.get(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd,
      offsetValue
    ) as { key: string } | undefined;

    return row ? this._encodeContinuationToken(row.key) : null;
  }

  private _formatEtag(etag: string): string {
    return `"${etag}"`;
  }

  private _generateEtag(body: Buffer): string {
    return createHash('md5').update(body).digest('hex');
  }

  private _encodeContinuationToken(key: string): string {
    return Buffer.from(String(key), 'utf8').toString('base64');
  }

  private _decodeContinuationToken(token: string): string {
    try {
      const normalized = String(token).trim();
      return Buffer.from(normalized, 'base64').toString('utf8');
    } catch {
      throw new ValidationError('Invalid continuation token', {
        field: 'ContinuationToken',
        retriable: false,
        suggestion: 'Use the NextContinuationToken returned by a previous ListObjectsV2 response.'
      });
    }
  }

  private _normalizeBody(
    inputBody: unknown,
    bodyLimit: { maxBytes: number; code: string; suggestion: string } | null = null
  ): Promise<Buffer> {
    const getLimitMessage = (code: string): string => {
      return code === 'SqliteMemoryLimitExceeded'
        ? 'SQLite memory budget exceeded'
        : 'Object size exceeds in sqlite limit';
    };

    if (inputBody === undefined || inputBody === null) {
      return Promise.resolve(Buffer.alloc(0));
    }
    if (Buffer.isBuffer(inputBody)) {
      if (bodyLimit && inputBody.length > bodyLimit.maxBytes) {
        throw new ResourceError(getLimitMessage(bodyLimit.code), {
          bucket: this.bucket,
          code: bodyLimit.code,
          statusCode: 413,
          retriable: false,
          suggestion: bodyLimit.suggestion
        });
      }
      return Promise.resolve(inputBody);
    }
    if (inputBody instanceof Uint8Array) {
      const buffer = Buffer.from(inputBody);
      if (bodyLimit && buffer.length > bodyLimit.maxBytes) {
        throw new ResourceError(getLimitMessage(bodyLimit.code), {
          bucket: this.bucket,
          code: bodyLimit.code,
          statusCode: 413,
          retriable: false,
          suggestion: bodyLimit.suggestion
        });
      }
      return Promise.resolve(buffer);
    }
    if (typeof inputBody === 'string') {
      const buffer = Buffer.from(inputBody);
      if (bodyLimit && buffer.length > bodyLimit.maxBytes) {
        throw new ResourceError(getLimitMessage(bodyLimit.code), {
          bucket: this.bucket,
          code: bodyLimit.code,
          statusCode: 413,
          retriable: false,
          suggestion: bodyLimit.suggestion
        });
      }
      return Promise.resolve(buffer);
    }
    if (inputBody instanceof Readable) {
      return this._bufferFromStream(inputBody, bodyLimit);
    }

    const buffer = Buffer.from(String(inputBody));
    if (bodyLimit && buffer.length > bodyLimit.maxBytes) {
      throw new ResourceError(getLimitMessage(bodyLimit.code), {
        bucket: this.bucket,
        code: bodyLimit.code,
        statusCode: 413,
        retriable: false,
        suggestion: bodyLimit.suggestion
      });
    }
    return Promise.resolve(buffer);
  }

  private async _bufferFromStream(
    stream: Readable,
    bodyLimit: { maxBytes: number; code: string; suggestion: string } | null
  ): Promise<Buffer> {
    const getLimitMessage = (code: string): string => {
      return code === 'SqliteMemoryLimitExceeded'
        ? 'SQLite memory budget exceeded'
        : 'Object size exceeds in sqlite limit';
    };

    const chunks: Buffer[] = [];
    let total = 0;

    for await (const item of stream) {
      const chunk = Buffer.isBuffer(item) ? item : Buffer.from(String(item));
      total += chunk.length;
      if (bodyLimit && total > bodyLimit.maxBytes) {
        throw new ResourceError(getLimitMessage(bodyLimit.code), {
          bucket: this.bucket,
          code: bodyLimit.code,
          statusCode: 413,
          retriable: false,
          suggestion: bodyLimit.suggestion
        });
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  private _validateLimits(body: Buffer, metadata?: Record<string, unknown>, key?: string): void {
    if (!this.enforceLimits) {
      return;
    }

    const metadataSize = this._getMetadataSize(metadata);
    if (metadataSize > this.metadataLimit) {
      throw new ResourceError('Metadata limit exceeded in sqlite storage', {
        bucket: this.bucket,
        key,
        code: 'MetadataLimitExceeded',
        statusCode: 413,
        retriable: false,
        suggestion: 'Reduce metadata size or disable enforceLimits in SqliteClient configuration.'
      });
    }

    if (body.length > this.maxObjectSize) {
      throw new ResourceError('Object size exceeds in sqlite limit', {
        bucket: this.bucket,
        key,
        code: 'EntityTooLarge',
        statusCode: 413,
        retriable: false,
        suggestion: 'Reduce object size or increase maxObjectSize in SqliteClient configuration.'
      });
    }
  }

  private _validateMemoryBudget(newSize: number, existingSize: number, key?: string): void {
    if (this.maxMemoryBytes === null) {
      return;
    }

    const existing = Math.max(0, existingSize);
    const next = Math.max(0, newSize);
    const currentUsage = this._getCurrentBucketSize();
    const projectedUsage = currentUsage - existing + next;

    if (projectedUsage > this.maxMemoryBytes) {
      throw new ResourceError('SQLite memory budget exceeded', {
        bucket: this.bucket,
        key,
        code: 'SqliteMemoryLimitExceeded',
        statusCode: 413,
        retriable: false,
        suggestion: 'Lower object size/payload volume or raise maxMemoryMB for this SqliteClient.'
      });
    }
  }

  private _getCurrentBucketSize(): number {
    const statement = this._prepareCached(`
      SELECT total_content_length
      FROM bucket_stats
      WHERE bucket = ?
    `);
    const row = statement.get(this.bucket) as DbBucketStatsRow | undefined;
    const total = Number(row?.total_content_length || 0);

    return Number.isFinite(total) ? total : 0;
  }

  private _rebuildBucketStats(): void {
    this.db.exec(`
      INSERT INTO bucket_stats (bucket, total_content_length)
      SELECT bucket, COALESCE(SUM(content_length), 0)
      FROM objects
      GROUP BY bucket
      ON CONFLICT(bucket) DO UPDATE SET
        total_content_length = excluded.total_content_length
    `);
  }

  private _ensureBucketStatsRow(): void {
    const statement = this._prepareCached(`
      INSERT OR IGNORE INTO bucket_stats (bucket, total_content_length)
      VALUES (?, 0)
    `);
    statement.run(this.bucket);
  }

  private _adjustBucketSize(delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    this._ensureBucketStatsRow();
    const statement = this._prepareCached(`
      UPDATE bucket_stats
      SET total_content_length = MAX(0, total_content_length + ?)
      WHERE bucket = ?
    `);
    statement.run(Math.trunc(delta), this.bucket);
  }

  private _getMetadataSize(metadata?: Record<string, unknown>): number {
    if (!metadata) return 0;

    let size = 0;
    for (const [metaKey, metaValue] of Object.entries(metadata)) {
      size += Buffer.byteLength(metaKey, 'utf8');
      size += Buffer.byteLength(String(metaValue), 'utf8');
    }
    return size;
  }

  private _getRow(key: string): DbRow | null {
    const statement = this._prepareCached(`
      SELECT key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
      FROM objects
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbRow | undefined;
    return row || null;
  }

  private _getObjectHeaderRow(key: string): DbObjectHeaderRow | null {
    const statement = this._prepareCached(`
      SELECT key, metadata, content_type, content_encoding, content_length, etag, last_modified
      FROM objects
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbObjectHeaderRow | undefined;
    return row || null;
  }

  private _getObjectState(key: string): DbObjectStateRow | null {
    const statement = this._prepareCached(`
      SELECT content_length, etag
      FROM objects
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbObjectStateRow | undefined;
    return row || null;
  }

  private _hasKey(key: string): boolean {
    const statement = this._prepareCached(`
      SELECT 1
      FROM objects
      WHERE bucket = ? AND key = ?
      LIMIT 1
    `);
    return Boolean(statement.get(this.bucket, key));
  }

  private async _runWriteTask<T>(fn: () => Promise<T> | T): Promise<T> {
    const currentToken = this._writeContext.getStore();

    if (currentToken && currentToken === this._activeWriteToken) {
      return await fn();
    }

    const token = Symbol('sqlite-write');
    let releaseLock!: () => void;
    const previousLock = this._pendingWriteLock;
    this._pendingWriteLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    this._activeWriteToken = token;

    try {
      return await this._writeContext.run(token, async () => {
        return await fn();
      });
    } finally {
      this._activeWriteToken = null;
      releaseLock();
    }
  }

  private async _withWriteTransactionAsync<T>(fn: () => Promise<T> | T): Promise<T> {
    const isOuterTransaction = this._writeTransactionDepth === 0;

    if (isOuterTransaction) {
      this.db.exec('BEGIN IMMEDIATE');
    }

    this._writeTransactionDepth += 1;

    try {
      const result = await fn();
      this._writeTransactionDepth -= 1;

      if (isOuterTransaction) {
        this.db.exec('COMMIT');
      }

      return result;
    } catch (error) {
      this._writeTransactionDepth = Math.max(0, this._writeTransactionDepth - 1);

      if (isOuterTransaction) {
        tryFn(() => this.db.exec('ROLLBACK'));
      }

      throw error;
    }
  }

  private _withWriteTransaction<T>(fn: () => T): T {
    const isOuterTransaction = this._writeTransactionDepth === 0;

    if (isOuterTransaction) {
      this.db.exec('BEGIN IMMEDIATE');
    }

    this._writeTransactionDepth += 1;

    try {
      const result = fn();
      this._writeTransactionDepth -= 1;

      if (isOuterTransaction) {
        this.db.exec('COMMIT');
      }

      return result;
    } catch (error) {
      this._writeTransactionDepth = Math.max(0, this._writeTransactionDepth - 1);

      if (isOuterTransaction) {
        tryFn(() => this.db.exec('ROLLBACK'));
      }

      throw error;
    }
  }

  private _encodeMetadata(metadata?: Record<string, unknown>): Record<string, string> | undefined {
    if (!metadata) {
      return undefined;
    }

    const encoded: Record<string, string> = {};
    for (const [rawKey, value] of Object.entries(metadata)) {
      const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const { encoded: encodedValue } = metadataEncode(value);
      encoded[validKey] = encodedValue;
    }

    return encoded;
  }

  private _decodeMetadataRow(row: { metadata: string }): Record<string, unknown> {
    let metadata: Record<string, string>;
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = {};
    }

    const decoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metadata || {})) {
      decoded[k] = metadataDecode(v);
    }

    return decoded;
  }

  private _parseCopySource(copySource?: string): { sourceBucket: string; sourceKey: string } {
    const trimmedSource = String(copySource || '').replace(/^\//, '');
    const [sourcePath] = trimmedSource.split('?');
    const decodedSource = decodeURIComponent(sourcePath || '');
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

  private _normalizePartitionObject(row: DbPartitionRow, headOnly: boolean): S3Object {
    const metadata = this._decodeMetadataRow(row);
    let bodyStream: S3Object['Body'] | undefined;

    if (!headOnly) {
      const bodyBuffer = Buffer.alloc(0);
      bodyStream = Readable.from(bodyBuffer) as S3Object['Body'];
      bodyStream!.transformToString = async () => bodyBuffer.toString('utf-8');
      bodyStream!.transformToByteArray = async () => new Uint8Array(bodyBuffer);
      bodyStream!.transformToWebStream = () => Readable.toWeb(bodyStream as Readable) as ReadableStream;
    }

    return {
      Body: headOnly ? undefined : bodyStream,
      Metadata: metadata as Record<string, string>,
      ContentType: row.content_type,
      ContentLength: 0,
      ETag: this._formatEtag(row.etag),
      LastModified: new Date(row.last_modified)
    };
  }

  private _normalizeObject(row: DbRow | DbObjectHeaderRow, headOnly: boolean): S3Object {
    const metadata = this._decodeMetadataRow(row);
    let bodyStream: S3Object['Body'] | undefined;

    if (!headOnly) {
      const bodyBuffer = Buffer.from((row as DbRow).body);
      bodyStream = Readable.from(bodyBuffer) as S3Object['Body'];
      bodyStream!.transformToString = async () => bodyBuffer.toString('utf-8');
      bodyStream!.transformToByteArray = async () => new Uint8Array(bodyBuffer);
      bodyStream!.transformToWebStream = () => Readable.toWeb(bodyStream as Readable) as ReadableStream;
    }

    return {
      Body: headOnly ? undefined : bodyStream,
      Metadata: metadata as Record<string, string>,
      ContentType: row.content_type,
      ContentLength: row.content_length,
      ETag: this._formatEtag(row.etag),
      LastModified: new Date(row.last_modified),
      ContentEncoding: row.content_encoding || undefined
    };
  }

  private _extractCommonPrefix(prefix: string, delimiter: string, key: string): string | null {
    if (!delimiter) return null;

    const hasPrefix = Boolean(prefix);
    if (hasPrefix && !key.startsWith(prefix)) return null;

    const remainder = hasPrefix ? key.slice(prefix.length) : key;
    const index = remainder.indexOf(delimiter);
    if (index === -1) return null;

    const baseLength = hasPrefix ? prefix.length : 0;
    return key.slice(0, baseLength + index + delimiter.length);
  }

  private _applyKeyPrefix(key?: string): string {
    if (!this.keyPrefix) {
      if (key === undefined || key === null) return '';
      return key;
    }
    if (key === undefined || key === null || key === '') {
      return path.posix.join(this.keyPrefix, '');
    }

    return path.posix.join(this.keyPrefix, key);
  }

  private _stripKeyPrefix(key: string = ''): string {
    if (!this.keyPrefix) return key;

    const normalizedPrefix = this._keyPrefixForStrip;
    if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
      return key.slice(normalizedPrefix.length).replace(/^\/+/, '');
    }

    return key;
  }

  /**
   * Attempts to dynamically load the sqlite-vec extension and bind it to this database connection.
   * Idempotent — subsequent calls return the cached result without re-loading.
   * Returns true if sqlite-vec is available and loaded, false otherwise.
   */
  async tryLoadSqliteVec(): Promise<boolean> {
    if (this._sqliteVecLoaded) return this._sqliteVecEnabled;
    this._sqliteVecLoaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — sqlite-vec is an optional peer dependency
      const mod = await import('sqlite-vec');
      (mod as unknown as { load: (db: unknown) => void }).load(this.db);
      this._sqliteVecEnabled = true;
    } catch {
      this._sqliteVecEnabled = false;
    }
    return this._sqliteVecEnabled;
  }

  get hasSqliteVec(): boolean {
    return this._sqliteVecEnabled;
  }

  /**
   * Creates a vec0 virtual table for storing vectors associated with a resource field.
   * Idempotent — does nothing if the table already exists.
   */
  ensureVecTable(tableName: string, dims: number): void {
    if (this._vecTables.has(tableName)) return;
    tryFn(() =>
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS "${tableName}" USING vec0(embedding FLOAT[${dims}])`
      )
    );
    this._vecTables.add(tableName);
  }

  /**
   * Inserts or replaces a vector for a given integer rowId in the specified vec0 table.
   */
  vecUpsert(tableName: string, rowId: number, vector: Float32Array): void {
    this._prepareCached(`INSERT OR REPLACE INTO "${tableName}"(rowid, embedding) VALUES (?, ?)`)
      .run(rowId, vector);
  }

  /**
   * Removes the vector entry for a given rowId from the vec0 table.
   */
  vecDelete(tableName: string, rowId: number): void {
    tryFn(() =>
      this._prepareCached(`DELETE FROM "${tableName}" WHERE rowid = ?`).run(rowId)
    );
  }

  /**
   * Performs a K-nearest-neighbour search in a vec0 table and returns the top-k results
   * sorted by ascending distance.
   */
  vecSearch(
    tableName: string,
    queryVector: Float32Array,
    k: number
  ): Array<{ rowId: number; distance: number }> {
    const rows = this._prepareCached(
      `SELECT rowid, distance FROM "${tableName}" WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
    ).all(queryVector, k) as Array<{ rowid: number; distance: number }>;
    return rows.map((r) => ({ rowId: Number(r.rowid), distance: r.distance }));
  }

  /**
   * Returns the string record key for a given integer rowId in the objects table.
   * The key prefix is stripped before returning.
   */
  getObjectKeyByRowId(rowId: number): string | null {
    const row = this._prepareCached('SELECT key FROM objects WHERE rowid = ?').get(
      rowId
    ) as { key: string } | undefined;
    return row ? this._stripKeyPrefix(row.key) : null;
  }

  /**
   * Returns the implicit integer rowId of the objects row for a given resource record.
   * Used to correlate between the objects table and vec0 virtual tables.
   */
  getRecordRowId(resourceName: string, recordId: string): number | null {
    const fullKey = this._applyKeyPrefix(`resource=${resourceName}/data/id=${recordId}`);
    const row = this._prepareCached(
      'SELECT rowid FROM objects WHERE bucket = ? AND key = ?'
    ).get(this.bucket, fullKey) as { rowid: number } | undefined;
    return row?.rowid ?? null;
  }

  /**
   * Creates generated VIRTUAL columns and covering indexes on the objects table for
   * every field referenced in a resource's partition definitions.
   * Transforms O(n) json_extract full-table scans into O(log n) index lookups for
   * filtered queries and resource.query() calls.
   * Idempotent — safe to call multiple times; uses IF NOT EXISTS and checks existing columns.
   */
  public ensureResourceIndexes(
    resourceName: string,
    partitions: Record<string, { fields?: Record<string, string> }>
  ): void {
    if (!partitions || typeof partitions !== 'object') return;

    const fieldPaths = new Set<string>();
    for (const partition of Object.values(partitions)) {
      if (partition?.fields && typeof partition.fields === 'object') {
        for (const fieldName of Object.keys(partition.fields)) {
          fieldPaths.add(fieldName);
        }
      }
    }

    if (fieldPaths.size === 0) return;

    const tableInfo = this.db.prepare('PRAGMA table_info(objects)').all() as Array<{ name: string }>;
    const existingColumns = new Set(tableInfo.map((row) => row.name));

    for (const fieldPath of fieldPaths) {
      const colSuffix = fieldPath.replace(/\./g, '__').replace(/[^a-zA-Z0-9_]/g, '_');
      const colName = `_idx_${colSuffix}`;
      const jsonPath = `$.${fieldPath}`;
      const indexName = `idx_obj_${colSuffix}`;

      if (!existingColumns.has(colName)) {
        tryFn(() =>
          this.db.exec(
            `ALTER TABLE objects ADD COLUMN ${colName} TEXT GENERATED ALWAYS AS (json_extract(metadata, '${jsonPath}')) VIRTUAL`
          )
        );
      }

      tryFn(() =>
        this.db.exec(
          `CREATE INDEX IF NOT EXISTS ${indexName} ON objects (${colName}, bucket, key) WHERE ${colName} IS NOT NULL`
        )
      );
    }
  }

  private _prepareCached(sql: string): SqlitePreparedStatement {
    const cached = this.statementCache.get(sql);
    if (cached) {
      return cached;
    }

    const statement = this.db.prepare(sql) as SqlitePreparedStatement;
    this.statementCache.set(sql, statement);
    return statement;
  }

  private _getKeyRange(prefix: string): { start: string; end: string } {
    return {
      start: prefix,
      end: `${prefix}\uffff`
    };
  }
}

export default SqliteClient;
