import path from 'path';
import { mkdirSync } from 'fs';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import EventEmitter from 'events';
import { createHash } from 'crypto';
import { chunk } from 'lodash-es';

import { tryFn } from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { normalizeEtagHeader } from './client-compat.js';
import { createLogger } from '../concerns/logger.js';
import { mapAwsError, DatabaseError, ResourceError, ValidationError, BaseError, NoSuchKey } from '../errors.js';
import { TasksRunner } from '../tasks/tasks-runner.class.js';
import type { LogLevel } from '../types/common.types.js';
import type {
  Logger,
  SqliteClientConfig,
  TaskManager,
  MonitoringConfig,
  PutObjectParams,
  CopyObjectParams,
  ListObjectsParams,
  GetKeysPageParams,
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

export class SqliteClient extends EventEmitter {
  id: string;
  logLevel: string;
  private logger: Logger;
  private taskExecutorMonitoring: MonitoringConfig | null;
  private taskManager: TaskManager;
  private db: DatabaseSync;
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

    this.db = new DatabaseSync(this.basePath);
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
    `);

    tryFn(() => this.db.exec('PRAGMA journal_mode = WAL;'));

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
      const existingRow = this._getRow(fullKey);
      const objectLengthFromLimit = this._getWriteBodyLimit(existingRow?.content_length || 0);
      const objectBody = await this._normalizeBody(body, objectLengthFromLimit);
      const objectLength = objectBody.length;
      this._validateLimits(objectBody, metadata, fullKey);
      this._validateMemoryBudget(objectLength, existingRow?.content_length || 0, fullKey);

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
            suggestion: 'Use ifNoneMatch: \"*\" only when the key should be created.'
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
      const statement = this.db.prepare(`
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
        typeof contentLength === 'number' ? contentLength : objectLength,
        etag,
        now,
        objectBody
      );

      const response: PutObjectResponse = {
        ETag: this._formatEtag(etag),
        VersionId: null,
        ServerSideEncryption: null,
        Location: `/${this.bucket}/${fullKey}`
      };

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
      const row = this._getRow(fullKey);
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

  async headObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const responseInput = { Key: key };

    try {
      const row = this._getRow(fullKey);
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
      const sourceRow = this._getRow(fullFrom);
      if (!sourceRow) {
        throw new NoSuchKey({
          bucket: this.bucket,
          key: fullFrom,
          statusCode: 404,
          retriable: false,
          suggestion: 'Copy requires an existing source object.'
        });
      }

      const destinationRow = this._getRow(fullTo);
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
      const statement = this.db.prepare(`
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

      const now = new Date().toISOString();
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

      const response: CopyObjectResponse = {
        CopyObjectResult: {
          ETag: this._formatEtag(sourceRow.etag),
          LastModified: now
        },
        BucketKeyEnabled: false,
        VersionId: null,
        ServerSideEncryption: null
      };

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
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this._applyKeyPrefix(key);
    return Boolean(this._getRow(fullKey));
  }

  async deleteObject(key: string): Promise<DeleteObjectResponse> {
    const fullKey = this._applyKeyPrefix(key);
    const responseInput = { Key: key };

    try {
      const statement = this.db.prepare('DELETE FROM objects WHERE bucket = ? AND key = ?');
      statement.run(this.bucket, fullKey);

      const response: DeleteObjectResponse = {
        DeleteMarker: false,
        VersionId: null
      };

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
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResponse> {
    const fullKeys = keys.map(key => this._applyKeyPrefix(key));
    const input = { Delete: { Objects: keys.map(key => ({ Key: key })) } };

    const batches = chunk(fullKeys, this.taskManager.concurrency || 5);
    const allResults: DeleteObjectsResponse = { Deleted: [], Errors: [] };

    const { results, errors } = await this.taskManager.process(
      batches,
      async (batch) => {
        const deleted: Array<{ Key: string }> = [];
        const batchErrors: Array<{ Key: string; Code: string; Message: string }> = [];

        const statement = this.db.prepare('DELETE FROM objects WHERE bucket = ? AND key = ?');

        for (const fullKey of batch) {
          try {
            statement.run(this.bucket, fullKey) as any;
            const localKey = this._stripKeyPrefix(fullKey);
            // Keep behavior consistent with filesystem/memory: mark as deleted even if it did not exist.
            deleted.push({ Key: localKey });
          } catch (error) {
            batchErrors.push({
              Key: this._stripKeyPrefix(fullKey),
              Code: (error as Error).name || 'InternalError',
              Message: (error as Error).message
            });
          }
        }

        return { deleted, batchErrors };
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
      const startFilter = continuationToken
        ? this._decodeContinuationToken(continuationToken)
        : startAfter;

      const queryParams: string[] = [this.bucket];
      const whereClauses: string[] = ['bucket = ?'];

      const pattern = `${this._escapeLikePattern(fullPrefix)}%`;
      whereClauses.push('key LIKE ? ESCAPE \'\\\'');
      queryParams.push(pattern);

      if (startFilter) {
        whereClauses.push('key > ?');
        queryParams.push(startFilter);
      }

      const maxKeysValue = Number.isFinite(maxKeys) ? Math.trunc(maxKeys) : 1000;
      const safeMaxKeys = Math.max(1, maxKeysValue);
      const queryLimit = safeMaxKeys === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : safeMaxKeys + 1;
      const statement = this.db.prepare(`
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
    let keys: string[] = [];

    if (offset > 0) {
      const response = await this.listObjects({
        prefix,
        maxKeys: offset + amount
      });
      keys = response.Contents.map(x => x.Key).slice(offset, offset + amount);
      return keys;
    }

    let continuationToken: string | undefined;
    let truncated = true;

    while (truncated) {
      const remaining = amount - keys.length;
      if (remaining <= 0) {
        break;
      }

      const res = await this.listObjects({
        prefix,
        continuationToken,
        maxKeys: Math.max(remaining, 1)
      });
      keys = keys.concat(res.Contents.map(x => x.Key));
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken || undefined;
      if (keys.length >= amount) {
        keys = keys.slice(0, amount);
        break;
      }
    }

    this.emit('cl:GetKeysPage', keys, params);
    return keys;
  }

  async getAllKeys(params: { prefix?: string } = {}): Promise<string[]> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const statement = this.db.prepare(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key LIKE ? ESCAPE '\\'
      ORDER BY key ASC
    `);
    const keys: string[] = [];

    for (const row of statement.iterate(
      this.bucket,
      `${this._escapeLikePattern(fullPrefix)}%`
    ) as IterableIterator<{ key: string }>) {
      keys.push(this._stripKeyPrefix(row.key));
    }

    return keys;
  }

  async count(params: { prefix?: string } = {}): Promise<number> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const statement = this.db.prepare(`
      SELECT COALESCE(COUNT(key), 0) AS total
      FROM objects
      WHERE bucket = ? AND key LIKE ? ESCAPE '\\'
    `);
    const row = statement.get(
      this.bucket,
      `${this._escapeLikePattern(fullPrefix)}%`
    ) as DbCountRow | undefined;
    const count = Number(row?.total || 0);

    this.emit('cl:Count', count, { prefix });
    return count;
  }

  async deleteAll(params: { prefix?: string } = {}): Promise<number> {
    const { prefix = '' } = params;
    let totalDeleted = 0;
    let continuationToken: string | undefined;
    let truncated = true;

    while (truncated) {
      const result = await this.listObjects({
        prefix,
        continuationToken,
        maxKeys: Math.max(this.taskManager.concurrency || 1000, 1)
      });

      const keys = result.Contents.map(x => x.Key);
      if (keys.length === 0) {
        break;
      }

      const deleteResult = await this.deleteObjects(keys);
      totalDeleted += deleteResult.Deleted.length;

      this.emit('deleteAll', {
        prefix,
        batch: deleteResult.Deleted.length,
        total: totalDeleted
      });

      truncated = result.IsTruncated || false;
      continuationToken = result.NextContinuationToken || undefined;
    }

    this.emit('deleteAllComplete', {
      prefix,
      totalDeleted
    });
    return totalDeleted;
  }

  async getContinuationTokenAfterOffset(params: { prefix?: string; offset?: number } = {}): Promise<string | null> {
    const { prefix = '', offset = 1000 } = params;
    if (offset === 0) {
      this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const offsetValue = Math.max(0, Math.trunc(offset));
    const statement = this.db.prepare(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key LIKE ? ESCAPE '\\'
      ORDER BY key ASC
      LIMIT 1 OFFSET ?
    `);
    const row = statement.get(
      this.bucket,
      `${this._escapeLikePattern(fullPrefix)}%`,
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
    this.db.close();
    if (this.logger) {
      this.logger.debug('Closed sqlite database');
    }
    this.removeAllListeners();
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
    const statement = this.db.prepare(`
      SELECT COALESCE(SUM(content_length), 0) AS total
      FROM objects
      WHERE bucket = ?
    `);
    const row = statement.get(this.bucket) as { total: number } | undefined;
    const total = Number(row?.total || 0);

    return Number.isFinite(total) ? total : 0;
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
    const statement = this.db.prepare(`
      SELECT key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
      FROM objects
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbRow | undefined;
    return row || null;
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

  private _decodeMetadataRow(row: DbRow): Record<string, unknown> {
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

  private _normalizeObject(row: DbRow, headOnly: boolean): S3Object {
    const bodyBuffer = Buffer.from(row.body);
    const metadata = this._decodeMetadataRow(row);
    const bodyStream = Readable.from(bodyBuffer) as S3Object['Body'];

    bodyStream!.transformToString = async () => bodyBuffer.toString('utf-8');
    bodyStream!.transformToByteArray = async () => new Uint8Array(bodyBuffer);
    bodyStream!.transformToWebStream = () => Readable.toWeb(bodyStream as Readable) as ReadableStream;

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

  private _escapeLikePattern(prefix: string): string {
    return prefix
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
  }
}

export default SqliteClient;
