import path from "path";
import EventEmitter from "events";
import { chunk } from "lodash-es";
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { NodeHttpHandler } from '@smithy/node-http-handler';

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

import tryFn from "../concerns/try-fn.js";
import { md5 } from "../concerns/crypto.js";
import { idGenerator } from "../concerns/id.js";
import { metadataEncode, metadataDecode } from "../concerns/metadata-encoding.js";
import { ConnectionString } from "../connection-string.class.js";
import { mapAwsError, UnknownError, NoSuchKey, NotFound } from "../errors.js";
import { TasksPool } from "../tasks-pool.class.js";
import { AdaptiveTuning } from "../concerns/adaptive-tuning.js";

export class S3Client extends EventEmitter {
  constructor({
    verbose = false,
    id = null,
    AwsS3Client,
    connectionString,
    httpClientOptions = {},
    taskExecutor = false, // Disabled by default (tests can opt-in)
    executorPool = null,  // New name (preferred), maps to taskExecutor
  }) {
    super();
    this.verbose = verbose;
    this.id = id ?? idGenerator(77);
    this.config = new ConnectionString(connectionString);
    this.connectionString = connectionString;
    this.httpClientOptions = {
      keepAlive: true, // Enabled for better performance
      keepAliveMsecs: 1000, // 1 second keep-alive
      maxSockets: httpClientOptions.maxSockets || 500, // High concurrency support
      maxFreeSockets: httpClientOptions.maxFreeSockets || 100, // Better connection reuse
      timeout: 60000, // 60 second timeout
      ...httpClientOptions,
    };
    this.client = AwsS3Client || this.createClient();

    // 🔄 Support both old (taskExecutor) and new (executorPool) names
    // executorPool is the new name, takes precedence over taskExecutor
    const poolConfig = executorPool ?? taskExecutor ?? false;

    // Initialize TasksPool (ENABLED BY DEFAULT!)
    this.taskExecutorConfig = this._normalizeTaskExecutorConfig(poolConfig);
    this.taskExecutor = this.taskExecutorConfig.enabled ? this._createTasksPool() : null;
  }

  /**
   * Normalize TaskExecutor configuration
   * @private
   */
  _normalizeTaskExecutorConfig(config) {
    if (config === false || config?.enabled === false) {
      return { enabled: false };
    }

    const normalized = {
      enabled: config.enabled ?? true, // ENABLED BY DEFAULT
      concurrency: config.concurrency ?? 100, // Default: 100 concurrent operations per pool
      retries: config.retries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      timeout: config.timeout ?? 30000,
      retryableErrors: config.retryableErrors ?? [],
      autotune: config.autotune ?? null,
      monitoring: config.monitoring ?? { collectMetrics: true },
    };

    return normalized;
  }

  /**
   * Create TasksPool instance
   * @private
   */
  _createTasksPool() {
    const poolConfig = {
      concurrency: this.taskExecutorConfig.concurrency,
      retries: this.taskExecutorConfig.retries,
      retryDelay: this.taskExecutorConfig.retryDelay,
      timeout: this.taskExecutorConfig.timeout,
      retryableErrors: this.taskExecutorConfig.retryableErrors,
      monitoring: this.taskExecutorConfig.monitoring,
    };

    // Handle 'auto' concurrency
    if (poolConfig.concurrency === 'auto') {
      const tuner = new AdaptiveTuning(this.taskExecutorConfig.autotune || {});
      poolConfig.concurrency = tuner.currentConcurrency;
      poolConfig.autotune = tuner;
    } else if (this.taskExecutorConfig.autotune) {
      const tuner = new AdaptiveTuning({
        ...this.taskExecutorConfig.autotune,
        initialConcurrency: poolConfig.concurrency,
      });
      poolConfig.autotune = tuner;
    }

    const pool = new TasksPool(poolConfig);

    // Forward pool events to client
    pool.on('pool:taskStarted', (task) => this.emit('pool:taskStarted', task));
    pool.on('pool:taskCompleted', (task) => this.emit('pool:taskCompleted', task));
    pool.on('pool:taskFailed', (task, error) => this.emit('pool:taskFailed', task, error));
    pool.on('pool:taskRetried', (task, attempt) => this.emit('pool:taskRetried', task, attempt));

    return pool;
  }

  /**
   * Execute an S3 operation through the pool (if enabled)
   * ALL S3 operations go through this method!
   * @private
   */
  async _executeOperation(fn, options = {}) {
    if (!this.taskExecutor || options.bypassPool) {
      // Pool disabled or explicitly bypassed
      return await fn();
    }

    // Execute through pool - THIS IS THE MAGIC!
    return await this.taskExecutor.enqueue(fn, {
      priority: options.priority ?? 0,
      retries: options.retries,
      timeout: options.timeout,
      metadata: options.metadata || {},
    });
  }

  /**
   * Execute batch of operations without re-enqueueing them into the TasksPool.
   *
   * Each operation is still free to call `_executeOperation`, so the underlying S3
   * commands remain throttled by the pool without causing recursive deadlocks.
   *
   * @private
   */
  async _executeBatch(fns, options = {}) {
    const wrapped = fns.map((fn, index) =>
      Promise.resolve()
        .then(() => fn())
        .then((value) => {
          options.onItemComplete?.(value, index);
          return value;
        })
        .catch((error) => {
          options.onItemError?.(error, index);
          throw error;
        })
    );

    const settled = await Promise.allSettled(wrapped);
    const results = settled.map((state) =>
      state.status === 'fulfilled' ? state.value : null
    );
    const errors = settled
      .map((state, index) =>
        state.status === 'rejected' ? { error: state.reason, index } : null
      )
      .filter(Boolean);

    return { results, errors };
  }

  /**
   * TasksPool helpers exposed for monitoring/tests
   */
  getQueueStats() {
    return this.taskExecutor ? this.taskExecutor.getStats() : null;
  }

  getAggregateMetrics(since = 0) {
    return this.taskExecutor ? this.taskExecutor.getAggregateMetrics(since) : null;
  }

  async pausePool() {
    if (!this.taskExecutor) return null;
    return this.taskExecutor.pause();
  }

  resumePool() {
    if (!this.taskExecutor) return null;
    this.taskExecutor.resume();
  }

  async drainPool() {
    if (!this.taskExecutor) return null;
    return this.taskExecutor.drain();
  }

  stopPool() {
    if (!this.taskExecutor) return;
    this.taskExecutor.stop();
  }

  createClient() {
    // Create HTTP agents with keep-alive configuration
    const httpAgent = new HttpAgent(this.httpClientOptions);
    const httpsAgent = new HttpsAgent(this.httpClientOptions);

    // Create HTTP handler with agents
    const httpHandler = new NodeHttpHandler({
      httpAgent,
      httpsAgent,
    });

    let options = {
      region: this.config.region,
      endpoint: this.config.endpoint,
      requestHandler: httpHandler,
    }

    if (this.config.forcePathStyle) options.forcePathStyle = true

    if (this.config.accessKeyId) {
      options.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      }
    }

    const client = new AwsS3Client(options);

    // Adiciona middleware para Content-MD5 em DeleteObjectsCommand
    client.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === 'DeleteObjectsCommand') {
          const body = args.request.body;
          if (body && typeof body === 'string') {
            const contentMd5 = await md5(body);
            args.request.headers['Content-MD5'] = contentMd5;
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

  async sendCommand(command) {
    this.emit("cl:request", command.constructor.name, command.input);
    const [ok, err, response] = await tryFn(() => this.client.send(command));
    if (!ok) {
      const bucket = this.config.bucket;
      const key = command.input && command.input.Key;
      throw mapAwsError(err, {
        bucket,
        key,
        commandName: command.constructor.name,
        commandInput: command.input,
      });
    }
    this.emit("cl:response", command.constructor.name, response, command.input);
    return response;
  }

  async putObject({ key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch }) {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const fullKey = keyPrefix ? path.join(keyPrefix, key) : key;

      // Ensure all metadata values are strings and use smart encoding
      const stringMetadata = {};
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          // Ensure key is a valid string
          const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_');

          // Smart encode the value
          const { encoded } = metadataEncode(v);
          stringMetadata[validKey] = encoded;
        }
      }

      const options = {
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

      const [ok, err, response] = await tryFn(() => this.sendCommand(new PutObjectCommand(options)));
      this.emit('cl:PutObject', err || response, { key, metadata, contentType, body, contentEncoding, contentLength });

      if (!ok) {
        throw mapAwsError(err, {
          bucket: this.config.bucket,
          key,
          commandName: 'PutObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'putObject', key } });
  }

  async getObject(key) {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const [ok, err, response] = await tryFn(async () => {
        const res = await this.sendCommand(new GetObjectCommand(options));

        // Smart decode metadata values
        if (res.Metadata) {
          const decodedMetadata = {};
          for (const [key, value] of Object.entries(res.Metadata)) {
            decodedMetadata[key] = metadataDecode(value);
          }
          res.Metadata = decodedMetadata;
        }

        return res;
      });

      this.emit('cl:GetObject', err || response, { key });

      if (!ok) {
        throw mapAwsError(err, {
          bucket: this.config.bucket,
          key,
          commandName: 'GetObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'getObject', key } });
  }

  async headObject(key) {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const [ok, err, response] = await tryFn(async () => {
        const res = await this.sendCommand(new HeadObjectCommand(options));

        // Smart decode metadata values (same as getObject)
        if (res.Metadata) {
          const decodedMetadata = {};
          for (const [key, value] of Object.entries(res.Metadata)) {
            decodedMetadata[key] = metadataDecode(value);
          }
          res.Metadata = decodedMetadata;
        }

        return res;
      });

      this.emit('cl:HeadObject', err || response, { key });

      if (!ok) {
        throw mapAwsError(err, {
          bucket: this.config.bucket,
          key,
          commandName: 'HeadObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'headObject', key } });
  }

  async copyObject({ from, to, metadata, metadataDirective, contentType }) {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, to) : to,
        CopySource: path.join(this.config.bucket, keyPrefix ? path.join(keyPrefix, from) : from),
      };

      // Add metadata directive if specified
      if (metadataDirective) {
        options.MetadataDirective = metadataDirective; // 'COPY' or 'REPLACE'
      }

      // Add metadata if specified (and encode values)
      if (metadata && typeof metadata === 'object') {
        const encodedMetadata = {};
        for (const [key, value] of Object.entries(metadata)) {
          const { encoded } = metadataEncode(value);
          encodedMetadata[key] = encoded;
        }
        options.Metadata = encodedMetadata;
      }

      // Add content type if specified
      if (contentType) {
        options.ContentType = contentType;
      }

      const [ok, err, response] = await tryFn(() => this.sendCommand(new CopyObjectCommand(options)));
      this.emit('cl:CopyObject', err || response, { from, to, metadataDirective });

      if (!ok) {
        throw mapAwsError(err, {
          bucket: this.config.bucket,
          key: to,
          commandName: 'CopyObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'copyObject', from, to } });
  }

  async exists(key) {
    const [ok, err] = await tryFn(() => this.headObject(key));
    if (ok) return true;
    if (err.name === "NoSuchKey" || err.name === "NotFound") return false;
    throw err;
  }

  async deleteObject(key) {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const fullKey = keyPrefix ? path.join(keyPrefix, key) : key;
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const [ok, err, response] = await tryFn(() => this.sendCommand(new DeleteObjectCommand(options)));
      this.emit('cl:DeleteObject', err || response, { key });

      if (!ok) {
        throw mapAwsError(err, {
          bucket: this.config.bucket,
          key,
          commandName: 'DeleteObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'deleteObject', key } });
  }

  async deleteObjects(keys) {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    const packages = chunk(keys, 1000);

    const results = [];
    const errors = [];

    // Process each package - TasksPool controls concurrency automatically
    for (const packageKeys of packages) {
      const [ok, err, response] = await tryFn(async () => {
        return await this._executeOperation(async () => {
          // Log existence before deletion
          for (const key of packageKeys) {
            const resolvedKey = keyPrefix ? path.join(keyPrefix, key) : key;
            const bucket = this.config.bucket;
            const existsBefore = await this.exists(key);
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

          if (res && res.Errors && res.Errors.length > 0) {
            // console.error('[Client][ERROR] DeleteObjectsCommand errors:', res.Errors);
          }
          if (res && res.Deleted && res.Deleted.length !== packageKeys.length) {
            // console.error('[Client][ERROR] Not all objects were deleted:', res.Deleted, 'expected:', packageKeys);
          }

          return res;
        }, { metadata: { operation: 'deleteObjects', count: packageKeys.length } });
      });

      if (ok) {
        results.push(response);
      } else {
        errors.push({ message: err.message, raw: err });
      }
    }

    const report = {
      deleted: results,
      notFound: errors,
    }

    this.emit("cl:DeleteObjects", report, keys);
    return report;
  }

  /**
   * Delete all objects under a specific prefix using efficient pagination
   * @param {Object} options - Delete options
   * @param {string} options.prefix - S3 prefix to delete
   * @returns {Promise<number>} Number of objects deleted
   */
  async deleteAll({ prefix } = {}) {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    let continuationToken;
    let totalDeleted = 0;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: keyPrefix ? path.join(keyPrefix, prefix || "") : prefix || "",
        ContinuationToken: continuationToken,
      });

      const listResponse = await this.client.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: listResponse.Contents.map(obj => ({ Key: obj.Key }))
          }
        });

        const deleteResponse = await this.client.send(deleteCommand);
        const deletedCount = deleteResponse.Deleted ? deleteResponse.Deleted.length : 0;
        totalDeleted += deletedCount;

        this.emit("cl:DeleteAll", {
          prefix,
          batch: deletedCount,
          total: totalDeleted
        });
      }

      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    this.emit("cl:DeleteAllComplete", {
      prefix,
      totalDeleted
    });

    return totalDeleted;
  }

  async moveObject({ from, to }) {
    const [ok, err] = await tryFn(async () => {
      await this.copyObject({ from, to });
      await this.deleteObject(from);
    });
    if (!ok) {
      throw new UnknownError("Unknown error in moveObject", { bucket: this.config.bucket, from, to, original: err });
    }
    return true;
  }

  async listObjects({
    prefix,
    maxKeys = 1000,
    continuationToken,
  } = {}) {
    const options = {
      Bucket: this.config.bucket,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
      Prefix: this.config.keyPrefix
        ? path.join(this.config.keyPrefix, prefix || "")
        : prefix || "",
    };
    const [ok, err, response] = await tryFn(() => this.sendCommand(new ListObjectsV2Command(options)));
    if (!ok) {
      throw new UnknownError("Unknown error in listObjects", { prefix, bucket: this.config.bucket, original: err });
    }
      this.emit("cl:ListObjects", response, options);
      return response;
  }

  async count({ prefix } = {}) {
    let count = 0;
    let truncated = true;
    let continuationToken;
    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };
      const response = await this.listObjects(options);
      count += response.KeyCount || 0;
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
    this.emit("cl:Count", count, { prefix });
    return count;
  }

  async getAllKeys({ prefix } = {}) {
    let keys = [];
    let truncated = true;
    let continuationToken;
    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };
      const response = await this.listObjects(options);
      if (response.Contents) {
        keys = keys.concat(response.Contents.map((x) => x.Key));
      }
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
    if (this.config.keyPrefix) {
      keys = keys
        .map((x) => x.replace(this.config.keyPrefix, ""))
        .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x));
    }
    this.emit("cl:GetAllKeys", keys, { prefix });
    return keys;
  }

  async getContinuationTokenAfterOffset(params = {}) {
    const {
      prefix,
      offset = 1000,
    } = params
    if (offset === 0) return null;
    let truncated = true;
    let continuationToken;
    let skipped = 0;
    while (truncated) {
      let maxKeys =
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
      const res = await this.listObjects(options);
      if (res.Contents) {
        skipped += res.Contents.length;
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (skipped >= offset) {
        break;
      }
    }
    this.emit("cl:GetContinuationTokenAfterOffset", continuationToken || null, params);
    return continuationToken || null;
  }

  async getKeysPage(params = {}) {
    const {
      prefix,
      offset = 0,
      amount = 100,
    } = params
    let keys = [];
    let truncated = true;
    let continuationToken;
    if (offset > 0) {
      continuationToken = await this.getContinuationTokenAfterOffset({
        prefix,
        offset,
      });
      if (!continuationToken) {
        this.emit("cl:GetKeysPage", [], params);
        return [];
      }
    }
    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };
      const res = await this.listObjects(options);
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
        .map((x) => x.replace(this.config.keyPrefix, ""))
        .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x));
    }
    this.emit("cl:GetKeysPage", keys, params);
    return keys;
  }

  async moveAllObjects({ prefixFrom, prefixTo }) {
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const results = [];
    const errors = [];

    // Process each key - TasksPool controls concurrency automatically
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
          message: err.message,
          raw: err,
          item: key
        });
      }
    }

    this.emit("cl:MoveAllObjects", { results, errors }, { prefixFrom, prefixTo });

    if (errors.length > 0) {
      throw new UnknownError("Some objects could not be moved", {
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

// Default export for backward compatibility
export default S3Client;
