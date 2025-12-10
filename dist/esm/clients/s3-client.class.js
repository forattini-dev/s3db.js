import path from 'path';
import EventEmitter from 'events';
import { chunk } from 'lodash-es';
import { ReckerHttpHandler } from './recker-http-handler.js';
import { S3Client as AwsS3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, } from '@aws-sdk/client-s3';
import { tryFn } from '../concerns/try-fn.js';
import { md5 } from '../concerns/crypto.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { ConnectionString } from '../connection-string.class.js';
import { mapAwsError, UnknownError } from '../errors.js';
import { TasksPool } from '../tasks/tasks-pool.class.js';
import { AdaptiveTuning } from '../concerns/adaptive-tuning.js';
export class S3Client extends EventEmitter {
    id;
    logLevel;
    logger;
    config;
    connectionString;
    httpClientOptions;
    client;
    _inflightCoalescing;
    taskExecutorConfig;
    taskExecutor;
    constructor({ logLevel = 'info', logger = null, id = null, AwsS3Client: providedClient, connectionString, httpClientOptions = {}, taskExecutor = false, executorPool = null, }) {
        super();
        this.logLevel = logLevel;
        const noop = () => { };
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
        this.client = providedClient || this.createClient();
        this._inflightCoalescing = new Map();
        const poolConfig = executorPool ?? taskExecutor ?? false;
        this.taskExecutorConfig = this._normalizeTaskExecutorConfig(poolConfig);
        this.taskExecutor = this.taskExecutorConfig.enabled ? this._createTasksPool() : null;
    }
    async _coalesce(key, operationFn) {
        if (this._inflightCoalescing.has(key)) {
            return this._inflightCoalescing.get(key);
        }
        const promise = operationFn().finally(() => {
            this._inflightCoalescing.delete(key);
        });
        this._inflightCoalescing.set(key, promise);
        return promise;
    }
    _normalizeTaskExecutorConfig(config) {
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
        const normalized = {
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
    _createTasksPool() {
        const poolConfig = {
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
        }
        else if (this.taskExecutorConfig.autotune) {
            const tuner = new AdaptiveTuning({
                ...this.taskExecutorConfig.autotune,
                minConcurrency: poolConfig.concurrency,
            });
            poolConfig.autotune = tuner;
        }
        const pool = new TasksPool(poolConfig);
        pool.on('pool:taskStarted', (task) => {
            const typedTask = task;
            this.emit('pool:taskStarted', typedTask);
        });
        pool.on('pool:taskCompleted', (task) => this.emit('pool:taskCompleted', task));
        pool.on('pool:taskFailed', (task, error) => this.emit('pool:taskFailed', task, error));
        pool.on('pool:taskRetried', (task, attempt) => this.emit('pool:taskRetried', task, attempt));
        return pool;
    }
    async _executeOperation(fn, options = {}) {
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
    async _executeBatch(fns, options = {}) {
        const wrapped = fns.map((fn, index) => Promise.resolve()
            .then(() => fn())
            .then((value) => {
            options.onItemComplete?.(value, index);
            return value;
        })
            .catch((error) => {
            options.onItemError?.(error, index);
            throw error;
        }));
        const settled = await Promise.allSettled(wrapped);
        const results = settled.map((state) => state.status === 'fulfilled' ? state.value : null);
        const errors = settled
            .map((state, index) => state.status === 'rejected' ? { error: state.reason, index } : null)
            .filter((e) => e !== null);
        return { results, errors };
    }
    getQueueStats() {
        return this.taskExecutor ? this.taskExecutor.getStats() : null;
    }
    getAggregateMetrics(since = 0) {
        return this.taskExecutor ? this.taskExecutor.getAggregateMetrics(since) : null;
    }
    async pausePool() {
        if (!this.taskExecutor)
            return null;
        return this.taskExecutor.pause();
    }
    resumePool() {
        if (!this.taskExecutor)
            return null;
        this.taskExecutor.resume();
    }
    async drainPool() {
        if (!this.taskExecutor)
            return null;
        return this.taskExecutor.drain();
    }
    stopPool() {
        if (!this.taskExecutor)
            return;
        this.taskExecutor.stop();
    }
    destroy() {
        if (this.client && typeof this.client.destroy === 'function') {
            this.client.destroy();
        }
        this.stopPool();
        this.removeAllListeners();
    }
    createClient() {
        const httpHandler = new ReckerHttpHandler(this.httpClientOptions);
        const options = {
            region: this.config.region,
            endpoint: this.config.endpoint,
            requestHandler: httpHandler,
        };
        if (this.config.forcePathStyle)
            options.forcePathStyle = true;
        if (this.config.accessKeyId) {
            options.credentials = {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            };
        }
        const client = new AwsS3Client(options);
        client.middlewareStack.add((next, context) => async (args) => {
            if (context.commandName === 'DeleteObjectsCommand') {
                const body = args.request.body;
                if (body && typeof body === 'string') {
                    const contentMd5 = await md5(body);
                    args.request.headers['Content-MD5'] = contentMd5;
                }
            }
            return next(args);
        }, {
            step: 'build',
            name: 'addContentMd5ForDeleteObjects',
            priority: 'high',
        });
        return client;
    }
    async sendCommand(command) {
        this.emit('cl:request', command.constructor.name, command.input);
        const [ok, err, response] = await tryFn(() => this.client.send(command));
        if (!ok) {
            const bucket = this.config.bucket;
            const key = command.input && command.input.Key;
            throw mapAwsError(err, {
                bucket,
                key: key,
                commandName: command.constructor.name,
                commandInput: command.input,
            });
        }
        this.emit('cl:response', command.constructor.name, response, command.input);
        return response;
    }
    async putObject(params) {
        const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;
        return await this._executeOperation(async () => {
            const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
            const fullKey = keyPrefix ? path.join(keyPrefix, key) : key;
            const stringMetadata = {};
            if (metadata) {
                for (const [k, v] of Object.entries(metadata)) {
                    const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_');
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
            if (contentType !== undefined)
                options.ContentType = contentType;
            if (contentEncoding !== undefined)
                options.ContentEncoding = contentEncoding;
            if (contentLength !== undefined)
                options.ContentLength = contentLength;
            if (ifMatch !== undefined)
                options.IfMatch = ifMatch;
            if (ifNoneMatch !== undefined)
                options.IfNoneMatch = ifNoneMatch;
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
                const res = await this.sendCommand(new GetObjectCommand(options));
                if (res.Metadata) {
                    const decodedMetadata = {};
                    for (const [k, value] of Object.entries(res.Metadata)) {
                        decodedMetadata[k] = metadataDecode(value);
                    }
                    res.Metadata = decodedMetadata;
                }
                return res;
            });
            const cmdMs = Date.now() - cmdStart;
            this.emit('cl:GetObject', err || response, { key });
            if (!ok) {
                this.logger.debug({ key: key?.substring(0, 60), cmdMs, err: err?.name }, `[S3Client.getObject] ERROR`);
                throw mapAwsError(err, {
                    bucket: this.config.bucket,
                    key,
                    commandName: 'GetObjectCommand',
                    commandInput: options,
                });
            }
            const totalMs = Date.now() - getStart;
            if (totalMs > 50) {
                this.logger.warn({ totalMs, cmdMs, key: key?.substring(0, 60) }, `[PERF] S3Client.getObject SLOW`);
            }
            else {
                this.logger.debug({ totalMs, key: key?.substring(0, 60) }, `[S3Client.getObject] complete`);
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
                if (res.Metadata) {
                    const decodedMetadata = {};
                    for (const [k, value] of Object.entries(res.Metadata)) {
                        decodedMetadata[k] = metadataDecode(value);
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
    async copyObject(params) {
        const { from, to, metadata, metadataDirective, contentType } = params;
        return await this._executeOperation(async () => {
            const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
            const options = {
                Bucket: this.config.bucket,
                Key: keyPrefix ? path.join(keyPrefix, to) : to,
                CopySource: path.join(this.config.bucket, keyPrefix ? path.join(keyPrefix, from) : from),
            };
            if (metadataDirective) {
                options.MetadataDirective = metadataDirective;
            }
            if (metadata && typeof metadata === 'object') {
                const encodedMetadata = {};
                for (const [k, value] of Object.entries(metadata)) {
                    const { encoded } = metadataEncode(value);
                    encodedMetadata[k] = encoded;
                }
                options.Metadata = encodedMetadata;
            }
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
        if (ok)
            return true;
        if (err.name === 'NoSuchKey' || err.name === 'NotFound')
            return false;
        throw err;
    }
    async deleteObject(key) {
        return await this._executeOperation(async () => {
            const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
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
                    if (!ok)
                        throw err;
                    return res;
                }, { metadata: { operation: 'deleteObjects', count: packageKeys.length } });
            });
            if (ok) {
                results.push(response);
            }
            else {
                errors.push({ message: err.message, raw: err });
            }
        }
        const report = {
            deleted: results,
            notFound: errors,
        };
        this.emit('cl:DeleteObjects', report, keys);
        return report;
    }
    async deleteAll({ prefix } = {}) {
        const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
        let continuationToken;
        let totalDeleted = 0;
        do {
            const listCommand = new ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: keyPrefix ? path.join(keyPrefix, prefix || '') : prefix || '',
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
    async moveObject({ from, to }) {
        const [ok, err] = await tryFn(async () => {
            await this.copyObject({ from, to });
            await this.deleteObject(from);
        });
        if (!ok) {
            throw new UnknownError('Unknown error in moveObject', { bucket: this.config.bucket, from, to, original: err });
        }
        return true;
    }
    async listObjects(params = {}) {
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
            this.logger.warn({ totalMs, prefix: prefix?.substring(0, 60), err: err?.name }, `[S3Client.listObjects] ERROR`);
            throw new UnknownError('Unknown error in listObjects', { prefix, bucket: this.config.bucket, original: err });
        }
        if (totalMs > 100) {
            this.logger.warn({ totalMs, prefix: prefix?.substring(0, 60), keys: response?.KeyCount || 0 }, `[PERF] S3Client.listObjects SLOW`);
        }
        else {
            this.logger.debug({ totalMs, prefix: prefix?.substring(0, 60), keys: response?.KeyCount || 0 }, `[S3Client.listObjects] complete`);
        }
        this.emit('cl:ListObjects', response, options);
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
        this.emit('cl:Count', count, { prefix });
        return count;
    }
    async getAllKeys({ prefix } = {}) {
        let keys = [];
        let truncated = true;
        let continuationToken;
        let iterations = 0;
        const startTotal = Date.now();
        while (truncated) {
            iterations++;
            const options = {
                prefix,
                continuationToken,
            };
            const startList = Date.now();
            const response = await this.listObjects(options);
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
                .map((x) => x.replace(this.config.keyPrefix, ''))
                .map((x) => (x.startsWith('/') ? x.replace('/', '') : x));
        }
        this.emit('cl:GetAllKeys', keys, { prefix });
        return keys;
    }
    async getContinuationTokenAfterOffset(params = {}) {
        const { prefix, offset = 1000 } = params;
        if (offset === 0)
            return null;
        let truncated = true;
        let continuationToken;
        let skipped = 0;
        while (truncated) {
            const maxKeys = offset < 1000
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
        this.emit('cl:GetContinuationTokenAfterOffset', continuationToken || null, params);
        return continuationToken || null;
    }
    async getKeysPage(params = {}) {
        const pageStart = Date.now();
        const { prefix, offset = 0, amount = 100 } = params;
        this.logger.debug({ prefix: prefix?.substring(0, 60), offset, amount }, `[S3Client.getKeysPage] START`);
        let keys = [];
        let truncated = true;
        let continuationToken;
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
                .map((x) => x.replace(this.config.keyPrefix, ''))
                .map((x) => (x.startsWith('/') ? x.replace('/', '') : x));
        }
        const totalMs = Date.now() - pageStart;
        if (totalMs > 100) {
            this.logger.warn({ totalMs, iterations, keysCount: keys.length, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getKeysPage SLOW`);
        }
        else {
            this.logger.debug({ totalMs, iterations, keysCount: keys.length }, `[S3Client.getKeysPage] complete`);
        }
        this.emit('cl:GetKeysPage', keys, params);
        return keys;
    }
    async moveAllObjects({ prefixFrom, prefixTo }) {
        const keys = await this.getAllKeys({ prefix: prefixFrom });
        const results = [];
        const errors = [];
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
            }
            else {
                errors.push({
                    message: err.message,
                    raw: err,
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
//# sourceMappingURL=s3-client.class.js.map