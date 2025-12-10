import path from 'path';
import EventEmitter from 'events';
import { chunk } from 'lodash-es';

import { ReckerHttpHandler } from './recker-http-handler.js';

import {
  S3Client as AwsS3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

import { tryFn } from '../concerns/try-fn.js';
import { md5 } from '../concerns/crypto.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { ConnectionString } from '../connection-string.class.js';
import { mapAwsError, UnknownError } from '../errors.js';
import { TasksPool } from '../tasks/tasks-pool.class.js';
import { AdaptiveTuning } from '../concerns/adaptive-tuning.js';
import type {
  Logger,
  S3ClientConfig,
  HttpClientOptions,
  TaskExecutorConfig,
  AutotuneConfig,
  MonitoringConfig,
  PutObjectParams,
  CopyObjectParams,
  ListObjectsParams,
  GetKeysPageParams,
  QueueStats,
  ReckerHttpHandlerOptions
} from './types.js';

interface NormalizedTaskExecutorConfig {
  enabled: boolean;
  concurrency?: number | 'auto';
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  autotune?: AutotuneConfig | null;
  monitoring?: MonitoringConfig;
}

interface ExecuteOperationOptions {
  bypassPool?: boolean;
  priority?: number;
  retries?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

interface BatchOptions {
  onItemComplete?: (value: unknown, index: number) => void;
  onItemError?: (error: Error, index: number) => void;
}

interface TasksPoolType {
  enqueue: <T>(fn: () => Promise<T>, options?: { priority?: number; retries?: number; timeout?: number; metadata?: Record<string, unknown> }) => Promise<T>;
  getStats: () => QueueStats;
  getAggregateMetrics: (since?: number) => unknown;
  pause: () => Promise<void>;
  resume: () => void;
  drain: () => Promise<void>;
  stop: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  stats?: { queueSize?: number; activeCount?: number };
}

interface AwsCommand {
  constructor: { name: string };
  input?: any;
}

export class S3Client extends EventEmitter {
  id: string;
  logLevel: string;
  private logger: Logger;
  config: ConnectionString;
  connectionString: string;
  httpClientOptions: HttpClientOptions;
  client: AwsS3Client;
  private _inflightCoalescing: Map<string, Promise<unknown>>;
  private taskExecutorConfig: NormalizedTaskExecutorConfig;
  private taskExecutor: TasksPoolType | null;

  constructor({
    logLevel = 'info',
    logger = null,
    id = null,
    AwsS3Client: providedClient,
    connectionString,
    httpClientOptions = {},
    taskExecutor = false,
    executorPool = null,
  }: S3ClientConfig) {
    super();
    this.logLevel = logLevel;

    const noop = (): void => {};
    this.logger = logger || {
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      trace: noop
    };

    this.id = id ?? idGenerator(77);
    this.config = new ConnectionString(connectionString);
    this.connectionString = connectionString;
    this.httpClientOptions = {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: httpClientOptions.maxSockets || 50,
      maxFreeSockets: httpClientOptions.maxFreeSockets || 10,
      timeout: 60000,
      ...httpClientOptions,
    };
    this.client = (providedClient as AwsS3Client) || this.createClient();
    this._inflightCoalescing = new Map();

    const poolConfig = executorPool ?? taskExecutor ?? false;

    this.taskExecutorConfig = this._normalizeTaskExecutorConfig(poolConfig as boolean | TaskExecutorConfig);
    this.taskExecutor = this.taskExecutorConfig.enabled ? this._createTasksPool() : null;
  }

  private async _coalesce<T>(key: string, operationFn: () => Promise<T>): Promise<T> {
    if (this._inflightCoalescing.has(key)) {
      return this._inflightCoalescing.get(key) as Promise<T>;
    }

    const promise = operationFn().finally(() => {
      this._inflightCoalescing.delete(key);
    });

    this._inflightCoalescing.set(key, promise);
    return promise;
  }

  private _normalizeTaskExecutorConfig(config: boolean | TaskExecutorConfig): NormalizedTaskExecutorConfig {
    const envEnabled = process.env.S3DB_EXECUTOR_ENABLED;
    const envConcurrency = process.env.S3DB_CONCURRENCY;

    if (config === false || (typeof config === 'object' && config?.enabled === false) || envEnabled === 'false' || envEnabled === '0') {
      return { enabled: false };
    }

    let defaultConcurrency = 10;
    if (envConcurrency) {
      const parsed = parseInt(envConcurrency, 10);
      if (!isNaN(parsed) && parsed > 0) {
        defaultConcurrency = parsed;
      }
    }

    const configObj = typeof config === 'object' ? config : {};

    const normalized: NormalizedTaskExecutorConfig = {
      enabled: configObj.enabled ?? true,
      concurrency: configObj.concurrency ?? defaultConcurrency,
      retries: configObj.retries ?? 3,
      retryDelay: configObj.retryDelay ?? 1000,
      timeout: configObj.timeout ?? 30000,
      retryableErrors: configObj.retryableErrors ?? [
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'EPIPE',
        'ECONNREFUSED',
        'SlowDown',
        'ServiceUnavailable',
        'InternalError',
        'RequestTimeout',
        'ThrottlingException',
        'ProvisionedThroughputExceededException',
      ],
      autotune: configObj.autotune ?? null,
      monitoring: configObj.monitoring ?? { collectMetrics: true },
    };

    return normalized;
  }

  private _createTasksPool(): TasksPoolType {
    const poolConfig: Record<string, unknown> = {
      concurrency: this.taskExecutorConfig.concurrency,
      retries: this.taskExecutorConfig.retries,
      retryDelay: this.taskExecutorConfig.retryDelay,
      timeout: this.taskExecutorConfig.timeout,
      retryableErrors: this.taskExecutorConfig.retryableErrors,
      monitoring: this.taskExecutorConfig.monitoring,
    };

    if (poolConfig.concurrency === 'auto') {
      const tuner = new AdaptiveTuning(this.taskExecutorConfig.autotune || {});
      poolConfig.concurrency = tuner.currentConcurrency;
      poolConfig.autotune = tuner;
    } else if (this.taskExecutorConfig.autotune) {
      const tuner = new AdaptiveTuning({
        ...this.taskExecutorConfig.autotune,
        minConcurrency: poolConfig.concurrency as number,
      });
      poolConfig.autotune = tuner;
    }

    const pool = new TasksPool(poolConfig) as unknown as TasksPoolType;

    pool.on('pool:taskStarted', (task: unknown) => {
      const typedTask = task as { timings: { queueWait: number }; id: string; signature: string; metadata?: { operation?: string } };
      this.emit('pool:taskStarted', typedTask);
    });
    pool.on('pool:taskCompleted', (task: unknown) => this.emit('pool:taskCompleted', task));
    pool.on('pool:taskFailed', (task: unknown, error: unknown) => this.emit('pool:taskFailed', task, error));
    pool.on('pool:taskRetried', (task: unknown, attempt: unknown) => this.emit('pool:taskRetried', task, attempt));

    return pool;
  }

  private async _executeOperation<T>(fn: () => Promise<T>, options: ExecuteOperationOptions = {}): Promise<T> {
    if (!this.taskExecutor || options.bypassPool) {
      return await fn();
    }

    if (this.logLevel === 'debug' || this.logLevel === 'trace') {
      const stats = this.taskExecutor.getStats();
      if ((stats.queueSize ?? 0) > 5 || (stats.activeCount ?? 0) > ((stats.effectiveConcurrency ?? 10) * 0.8)) {
        this.logger.debug(`[S3Client] Pool Load: Active=${stats.activeCount}/${stats.effectiveConcurrency}, Queue=${stats.queueSize}, Operation=${options.metadata?.operation || 'unknown'}`);
      }
    }

    const enqueueStart = Date.now();
    const result = await this.taskExecutor.enqueue(fn, {
      priority: options.priority ?? 0,
      retries: options.retries,
      timeout: options.timeout,
      metadata: options.metadata || {},
    });
    const totalMs = Date.now() - enqueueStart;

    if (totalMs > 100) {
      const op = options.metadata?.operation || 'unknown';
      const key = String(options.metadata?.key || '?').substring(0, 50);
      const stats = this.taskExecutor?.stats || {};
      this.logger.warn({ op, totalMs, key, queueSize: stats.queueSize || 0, active: stats.activeCount || 0 }, `[PERF] S3Client._executeOperation SLOW`);
    }

    return result;
  }

  private async _executeBatch<T>(
    fns: Array<() => Promise<T>>,
    options: BatchOptions = {}
  ): Promise<{ results: (T | null)[]; errors: Array<{ error: Error; index: number }> }> {
    const wrapped = fns.map((fn, index) =>
      Promise.resolve()
        .then(() => fn())
        .then((value) => {
          options.onItemComplete?.(value, index);
          return value;
        })
        .catch((error) => {
          options.onItemError?.(error as Error, index);
          throw error;
        })
    );

    const settled = await Promise.allSettled(wrapped);
    const results = settled.map((state) =>
      state.status === 'fulfilled' ? state.value : null
    );
    const errors = settled
      .map((state, index) =>
        state.status === 'rejected' ? { error: state.reason as Error, index } : null
      )
      .filter((e): e is { error: Error; index: number } => e !== null);

    return { results, errors };
  }

  getQueueStats(): QueueStats | null {
    return this.taskExecutor ? this.taskExecutor.getStats() : null;
  }

  getAggregateMetrics(since: number = 0): unknown | null {
    return this.taskExecutor ? this.taskExecutor.getAggregateMetrics(since) : null;
  }

  async pausePool(): Promise<void | null> {
    if (!this.taskExecutor) return null;
    return this.taskExecutor.pause();
  }

  resumePool(): void | null {
    if (!this.taskExecutor) return null;
    this.taskExecutor.resume();
  }

  async drainPool(): Promise<void | null> {
    if (!this.taskExecutor) return null;
    return this.taskExecutor.drain();
  }

  stopPool(): void {
    if (!this.taskExecutor) return;
    this.taskExecutor.stop();
  }

  destroy(): void {
    if (this.client && typeof this.client.destroy === 'function') {
      this.client.destroy();
    }
    this.stopPool();
    this.removeAllListeners();
  }

  createClient(): AwsS3Client {
    const httpHandler = new ReckerHttpHandler(this.httpClientOptions as unknown as ReckerHttpHandlerOptions);

    const options: {
      region: string;
      endpoint: string;
      requestHandler: ReckerHttpHandler;
      forcePathStyle?: boolean;
      credentials?: { accessKeyId: string; secretAccessKey: string };
    } = {
      region: this.config.region,
      endpoint: this.config.endpoint,
      requestHandler: httpHandler,
    };

    if (this.config.forcePathStyle) options.forcePathStyle = true;

    if (this.config.accessKeyId) {
      options.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey!,
      };
    }

    const client = new AwsS3Client(options as any);

    client.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === 'DeleteObjectsCommand') {
          const body = (args as { request: { body?: string; headers: Record<string, string> } }).request.body;
          if (body && typeof body === 'string') {
            const contentMd5 = await md5(body);
            (args as { request: { headers: Record<string, string> } }).request.headers['Content-MD5'] = contentMd5;
          }
        }
        return next(args);
      },
      {
        step: 'build',
        name: 'addContentMd5ForDeleteObjects',
        priority: 'high',
      }
    );

    return client;
  }

  async sendCommand(command: AwsCommand): Promise<unknown> {
    this.emit('cl:request', command.constructor.name, command.input);
    const [ok, err, response] = await tryFn(() => this.client.send(command as any));
    if (!ok) {
      const bucket = this.config.bucket;
      const key = command.input && command.input.Key;
      throw mapAwsError(err as Error, {
        bucket,
        key: key as string,
        commandName: command.constructor.name,
        commandInput: command.input,
      });
    }
    this.emit('cl:response', command.constructor.name, response, command.input);
    return response;
  }

  async putObject(params: PutObjectParams): Promise<unknown> {
    const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;

    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const fullKey = keyPrefix ? path.join(keyPrefix, key) : key;

      const stringMetadata: Record<string, string> = {};
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_');
          const { encoded } = metadataEncode(v);
          stringMetadata[validKey] = encoded;
        }
      }

      const options: Record<string, unknown> = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
        Metadata: stringMetadata,
        Body: body || Buffer.alloc(0),
      };

      if (contentType !== undefined) options.ContentType = contentType;
      if (contentEncoding !== undefined) options.ContentEncoding = contentEncoding;
      if (contentLength !== undefined) options.ContentLength = contentLength;
      if (ifMatch !== undefined) options.IfMatch = ifMatch;
      if (ifNoneMatch !== undefined) options.IfNoneMatch = ifNoneMatch;

      const [ok, err, response] = await tryFn(() => this.sendCommand(new PutObjectCommand(options as unknown as ConstructorParameters<typeof PutObjectCommand>[0])));
      this.emit('cl:PutObject', err || response, { key, metadata, contentType, body, contentEncoding, contentLength });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'PutObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'putObject', key } });
  }

  async getObject(key: string): Promise<unknown> {
    const getStart = Date.now();
    this.logger.debug({ key: key?.substring(0, 60) }, `[S3Client.getObject] START`);

    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const cmdStart = Date.now();
      const [ok, err, response] = await tryFn(async () => {
        const res = await this.sendCommand(new GetObjectCommand(options)) as { Metadata?: Record<string, string> };

        if (res.Metadata) {
          const decodedMetadata: Record<string, unknown> = {};
          for (const [k, value] of Object.entries(res.Metadata)) {
            decodedMetadata[k] = metadataDecode(value);
          }
          res.Metadata = decodedMetadata as Record<string, string>;
        }

        return res;
      });
      const cmdMs = Date.now() - cmdStart;

      this.emit('cl:GetObject', err || response, { key });

      if (!ok) {
        this.logger.debug({ key: key?.substring(0, 60), cmdMs, err: (err as Error)?.name }, `[S3Client.getObject] ERROR`);
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'GetObjectCommand',
          commandInput: options,
        });
      }

      const totalMs = Date.now() - getStart;
      if (totalMs > 50) {
        this.logger.warn({ totalMs, cmdMs, key: key?.substring(0, 60) }, `[PERF] S3Client.getObject SLOW`);
      } else {
        this.logger.debug({ totalMs, key: key?.substring(0, 60) }, `[S3Client.getObject] complete`);
      }

      return response;
    }, { metadata: { operation: 'getObject', key } });
  }

  async headObject(key: string): Promise<unknown> {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const [ok, err, response] = await tryFn(async () => {
        const res = await this.sendCommand(new HeadObjectCommand(options)) as { Metadata?: Record<string, string> };

        if (res.Metadata) {
          const decodedMetadata: Record<string, unknown> = {};
          for (const [k, value] of Object.entries(res.Metadata)) {
            decodedMetadata[k] = metadataDecode(value);
          }
          res.Metadata = decodedMetadata as Record<string, string>;
        }

        return res;
      });

      this.emit('cl:HeadObject', err || response, { key });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'HeadObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'headObject', key } });
  }

  async copyObject(params: CopyObjectParams): Promise<unknown> {
    const { from, to, metadata, metadataDirective, contentType } = params;

    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options: Record<string, unknown> = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, to) : to,
        CopySource: path.join(this.config.bucket, keyPrefix ? path.join(keyPrefix, from) : from),
      };

      if (metadataDirective) {
        options.MetadataDirective = metadataDirective;
      }

      if (metadata && typeof metadata === 'object') {
        const encodedMetadata: Record<string, string> = {};
        for (const [k, value] of Object.entries(metadata)) {
          const { encoded } = metadataEncode(value);
          encodedMetadata[k] = encoded;
        }
        options.Metadata = encodedMetadata;
      }

      if (contentType) {
        options.ContentType = contentType;
      }

      const [ok, err, response] = await tryFn(() => this.sendCommand(new CopyObjectCommand(options as unknown as ConstructorParameters<typeof CopyObjectCommand>[0])));
      this.emit('cl:CopyObject', err || response, { from, to, metadataDirective });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key: to,
          commandName: 'CopyObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'copyObject', from, to } });
  }

  async exists(key: string): Promise<boolean> {
    const [ok, err] = await tryFn(() => this.headObject(key));
    if (ok) return true;
    if ((err as Error).name === 'NoSuchKey' || (err as Error).name === 'NotFound') return false;
    throw err;
  }

  async deleteObject(key: string): Promise<unknown> {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const [ok, err, response] = await tryFn(() => this.sendCommand(new DeleteObjectCommand(options)));
      this.emit('cl:DeleteObject', err || response, { key });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'DeleteObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'deleteObject', key } });
  }

  async deleteObjects(keys: string[]): Promise<{ deleted: unknown[]; notFound: Array<{ message: string; raw: Error }> }> {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    const packages = chunk(keys, 1000);

    const results: unknown[] = [];
    const errors: Array<{ message: string; raw: Error }> = [];

    for (const packageKeys of packages) {
      const [ok, err, response] = await tryFn(async () => {
        return await this._executeOperation(async () => {
          for (const key of packageKeys) {
            await this.exists(key);
          }

          const options = {
            Bucket: this.config.bucket,
            Delete: {
              Objects: packageKeys.map((key) => ({
                Key: keyPrefix ? path.join(keyPrefix, key) : key,
              })),
            },
          };

          const [ok, err, res] = await tryFn(() => this.sendCommand(new DeleteObjectsCommand(options)));
          if (!ok) throw err;

          return res;
        }, { metadata: { operation: 'deleteObjects', count: packageKeys.length } });
      });

      if (ok) {
        results.push(response);
      } else {
        errors.push({ message: (err as Error).message, raw: err as Error });
      }
    }

    const report = {
      deleted: results,
      notFound: errors,
    };

    this.emit('cl:DeleteObjects', report, keys);
    return report;
  }

  async deleteAll({ prefix }: { prefix?: string } = {}): Promise<number> {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    let continuationToken: string | undefined;
    let totalDeleted = 0;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: keyPrefix ? path.join(keyPrefix, prefix || '') : prefix || '',
        ContinuationToken: continuationToken,
      });

      const listResponse = await this.client.send(listCommand) as { Contents?: Array<{ Key?: string }>; IsTruncated?: boolean; NextContinuationToken?: string };

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: listResponse.Contents.map(obj => ({ Key: obj.Key! }))
          }
        });

        const deleteResponse = await this.client.send(deleteCommand) as { Deleted?: unknown[] };
        const deletedCount = deleteResponse.Deleted ? deleteResponse.Deleted.length : 0;
        totalDeleted += deletedCount;

        this.emit('cl:DeleteAll', {
          prefix,
          batch: deletedCount,
          total: totalDeleted
        });
      }

      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    this.emit('cl:DeleteAllComplete', {
      prefix,
      totalDeleted
    });

    return totalDeleted;
  }

  async moveObject({ from, to }: { from: string; to: string }): Promise<boolean> {
    const [ok, err] = await tryFn(async () => {
      await this.copyObject({ from, to });
      await this.deleteObject(from);
    });
    if (!ok) {
      throw new UnknownError('Unknown error in moveObject', { bucket: this.config.bucket, from, to, original: err });
    }
    return true;
  }

  async listObjects(params: ListObjectsParams = {}): Promise<unknown> {
    const { prefix, maxKeys = 1000, continuationToken } = params;
    const listStart = Date.now();
    this.logger.debug({ prefix: prefix?.substring(0, 60), maxKeys }, `[S3Client.listObjects] START`);

    const options = {
      Bucket: this.config.bucket,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken || undefined,
      Prefix: this.config.keyPrefix
        ? path.join(this.config.keyPrefix, prefix || '')
        : prefix || '',
    };
    const [ok, err, response] = await tryFn(() => this.sendCommand(new ListObjectsV2Command(options)));

    const totalMs = Date.now() - listStart;
    if (!ok) {
      this.logger.warn({ totalMs, prefix: prefix?.substring(0, 60), err: (err as Error)?.name }, `[S3Client.listObjects] ERROR`);
      throw new UnknownError('Unknown error in listObjects', { prefix, bucket: this.config.bucket, original: err });
    }

    if (totalMs > 100) {
      this.logger.warn({ totalMs, prefix: prefix?.substring(0, 60), keys: (response as { KeyCount?: number })?.KeyCount || 0 }, `[PERF] S3Client.listObjects SLOW`);
    } else {
      this.logger.debug({ totalMs, prefix: prefix?.substring(0, 60), keys: (response as { KeyCount?: number })?.KeyCount || 0 }, `[S3Client.listObjects] complete`);
    }

    this.emit('cl:ListObjects', response, options);
    return response;
  }

  async count({ prefix }: { prefix?: string } = {}): Promise<number> {
    let count = 0;
    let truncated = true;
    let continuationToken: string | undefined;
    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };
      const response = await this.listObjects(options) as { KeyCount?: number; IsTruncated?: boolean; NextContinuationToken?: string };
      count += response.KeyCount || 0;
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
    this.emit('cl:Count', count, { prefix });
    return count;
  }

  async getAllKeys({ prefix }: { prefix?: string } = {}): Promise<string[]> {
    let keys: string[] = [];
    let truncated = true;
    let continuationToken: string | undefined;
    let iterations = 0;
    const startTotal = Date.now();

    while (truncated) {
      iterations++;
      const options = {
        prefix,
        continuationToken,
      };
      const startList = Date.now();
      const response = await this.listObjects(options) as { Contents?: Array<{ Key: string }>; IsTruncated?: boolean; NextContinuationToken?: string };
      const listMs = Date.now() - startList;

      if (listMs > 500) {
        this.logger.warn({ iterations, listMs, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getAllKeys: listObjects iteration SLOW`);
      }

      if (response.Contents) {
        keys = keys.concat(response.Contents.map((x) => x.Key));
      }
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }

    const totalMs = Date.now() - startTotal;
    if (totalMs > 100) {
      this.logger.warn({ totalMs, iterations, keysCount: keys.length, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getAllKeys SLOW TOTAL`);
    }

    if (this.config.keyPrefix) {
      keys = keys
        .map((x) => x.replace(this.config.keyPrefix!, ''))
        .map((x) => (x.startsWith('/') ? x.replace('/', '') : x));
    }
    this.emit('cl:GetAllKeys', keys, { prefix });
    return keys;
  }

  async getContinuationTokenAfterOffset(params: { prefix?: string; offset?: number } = {}): Promise<string | null> {
    const { prefix, offset = 1000 } = params;
    if (offset === 0) return null;
    let truncated = true;
    let continuationToken: string | undefined;
    let skipped = 0;
    while (truncated) {
      const maxKeys =
        offset < 1000
          ? offset
          : offset - skipped > 1000
            ? 1000
            : offset - skipped;
      const options = {
        prefix,
        maxKeys,
        continuationToken,
      };
      const res = await this.listObjects(options) as { Contents?: unknown[]; IsTruncated?: boolean; NextContinuationToken?: string };
      if (res.Contents) {
        skipped += res.Contents.length;
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (skipped >= offset) {
        break;
      }
    }
    this.emit('cl:GetContinuationTokenAfterOffset', continuationToken || null, params);
    return continuationToken || null;
  }

  async getKeysPage(params: GetKeysPageParams = {}): Promise<string[]> {
    const pageStart = Date.now();
    const { prefix, offset = 0, amount = 100 } = params;

    this.logger.debug({ prefix: prefix?.substring(0, 60), offset, amount }, `[S3Client.getKeysPage] START`);

    let keys: string[] = [];
    let truncated = true;
    let continuationToken: string | undefined;
    let iterations = 0;

    if (offset > 0) {
      const tokenStart = Date.now();
      continuationToken = await this.getContinuationTokenAfterOffset({
        prefix,
        offset,
      }) || undefined;
      const tokenMs = Date.now() - tokenStart;
      this.logger.debug({ tokenMs, hasToken: !!continuationToken }, `[S3Client.getKeysPage] getContinuationTokenAfterOffset`);
      if (!continuationToken) {
        this.emit('cl:GetKeysPage', [], params);
        return [];
      }
    }
    while (truncated) {
      iterations++;
      const options = {
        prefix,
        continuationToken,
      };
      const res = await this.listObjects(options) as { Contents?: Array<{ Key: string }>; IsTruncated?: boolean; NextContinuationToken?: string };
      if (res.Contents) {
        keys = keys.concat(res.Contents.map((x) => x.Key));
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (keys.length >= amount) {
        keys = keys.slice(0, amount);
        break;
      }
    }
    if (this.config.keyPrefix) {
      keys = keys
        .map((x) => x.replace(this.config.keyPrefix!, ''))
        .map((x) => (x.startsWith('/') ? x.replace('/', '') : x));
    }

    const totalMs = Date.now() - pageStart;
    if (totalMs > 100) {
      this.logger.warn({ totalMs, iterations, keysCount: keys.length, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getKeysPage SLOW`);
    } else {
      this.logger.debug({ totalMs, iterations, keysCount: keys.length }, `[S3Client.getKeysPage] complete`);
    }

    this.emit('cl:GetKeysPage', keys, params);
    return keys;
  }

  async moveAllObjects({ prefixFrom, prefixTo }: { prefixFrom: string; prefixTo: string }): Promise<string[]> {
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const results: string[] = [];
    const errors: Array<{ message: string; raw: Error; item: string }> = [];

    for (const key of keys) {
      const to = key.replace(prefixFrom, prefixTo);
      const [ok, err] = await tryFn(async () => {
        await this.moveObject({
          from: key,
          to,
        });
      });

      if (ok) {
        results.push(to);
      } else {
        errors.push({
          message: (err as Error).message,
          raw: err as Error,
          item: key
        });
      }
    }

    this.emit('cl:MoveAllObjects', { results, errors }, { prefixFrom, prefixTo });

    if (errors.length > 0) {
      throw new UnknownError('Some objects could not be moved', {
        bucket: this.config.bucket,
        operation: 'moveAllObjects',
        prefixFrom,
        prefixTo,
        totalKeys: keys.length,
        failedCount: errors.length,
        successCount: results.length,
        errors: errors.map(e => ({ message: e.message, raw: e.raw })),
        suggestion: 'Check S3 permissions and retry failed objects individually'
      });
    }
    return results;
  }
}

export default S3Client;
