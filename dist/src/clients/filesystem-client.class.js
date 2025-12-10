import path from 'path';
import EventEmitter from 'events';
import { chunk } from 'lodash-es';
import { tryFn } from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { mapAwsError, DatabaseError, BaseError } from '../errors.js';
import { TasksRunner } from '../tasks/tasks-runner.class.js';
import { FileSystemStorage } from './filesystem-storage.class.js';
import { createLogger } from '../concerns/logger.js';
const pathPosix = path.posix;
const globalStorageRegistry = new Map();
export class FileSystemClient extends EventEmitter {
    id;
    logLevel;
    logger;
    taskExecutorMonitoring;
    taskManager;
    storage;
    basePath;
    bucket;
    keyPrefix;
    region;
    _keyPrefixForStrip;
    connectionString;
    config;
    constructor(config = {}) {
        super();
        this.id = config.id || idGenerator(77);
        this.logLevel = config.logLevel || 'info';
        if (config.logger) {
            this.logger = config.logger;
        }
        else {
            this.logger = createLogger({ name: 'FileSystemClient', level: this.logLevel });
        }
        this.taskExecutorMonitoring = config.taskExecutorMonitoring
            ? { ...config.taskExecutorMonitoring }
            : null;
        if (config.taskExecutor) {
            this.taskManager = config.taskExecutor;
        }
        else {
            this.taskManager = new TasksRunner({
                concurrency: config.concurrency || 5,
                retries: config.retries ?? 3,
                retryDelay: config.retryDelay ?? 1000,
                timeout: config.timeout ?? 30000,
                retryableErrors: config.retryableErrors || [],
                monitoring: this.taskExecutorMonitoring || undefined
            });
        }
        this.basePath = config.basePath || './s3db-data';
        this.bucket = config.bucket || 's3db';
        this.keyPrefix = config.keyPrefix || '';
        this.region = config.region || 'local';
        this._keyPrefixForStrip = this.keyPrefix ? pathPosix.join(this.keyPrefix, '') : '';
        this.basePath = path.resolve(this.basePath);
        const encodedBasePath = encodeURI(this.basePath);
        this.connectionString = `file://${encodedBasePath}`;
        if (!globalStorageRegistry.has(this.basePath)) {
            globalStorageRegistry.set(this.basePath, new FileSystemStorage({
                basePath: this.basePath,
                bucket: this.bucket,
                enforceLimits: config.enforceLimits || false,
                metadataLimit: config.metadataLimit || 2048,
                maxObjectSize: config.maxObjectSize || 5 * 1024 * 1024 * 1024,
                logLevel: this.logLevel,
                compression: config.compression,
                ttl: config.ttl,
                locking: config.locking,
                backup: config.backup,
                journal: config.journal,
                stats: config.stats
            }));
        }
        this.storage = globalStorageRegistry.get(this.basePath);
        this.config = {
            bucket: this.bucket,
            keyPrefix: this.keyPrefix,
            region: this.region,
            basePath: this.basePath,
            endpoint: `file://${this.basePath}`,
            forcePathStyle: true
        };
        this.logger.debug({ id: this.id, basePath: this.basePath, bucket: this.bucket }, `Initialized (id: ${this.id}, basePath: ${this.basePath}, bucket: ${this.bucket})`);
    }
    getQueueStats() {
        if (this.taskManager && typeof this.taskManager.getStats === 'function') {
            return this.taskManager.getStats();
        }
        return null;
    }
    getAggregateMetrics(since = 0) {
        if (this.taskManager && typeof this.taskManager.getAggregateMetrics === 'function') {
            return this.taskManager.getAggregateMetrics(since);
        }
        return null;
    }
    async sendCommand(command) {
        const commandName = command.constructor.name;
        const input = command.input || {};
        this.emit('cl:request', commandName, input);
        this.emit('command.request', commandName, input);
        let response;
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
        }
        catch (error) {
            if (error instanceof BaseError) {
                throw error;
            }
            const mappedError = mapAwsError(error, {
                bucket: this.bucket,
                key: input.Key,
                commandName,
                commandInput: input
            });
            throw mappedError;
        }
    }
    async _handlePutObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const metadata = this._encodeMetadata(input.Metadata || {});
        const contentType = input.ContentType;
        const body = input.Body;
        const contentEncoding = input.ContentEncoding;
        const contentLength = input.ContentLength;
        const ifMatch = input.IfMatch;
        const ifNoneMatch = input.IfNoneMatch;
        return await this.storage.put(key, {
            body: body,
            metadata,
            contentType,
            contentEncoding,
            contentLength,
            ifMatch,
            ifNoneMatch
        });
    }
    async _handleGetObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const response = await this.storage.get(key);
        return this._decodeMetadataResponse(response);
    }
    async _handleHeadObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const response = await this.storage.head(key);
        return this._decodeMetadataResponse(response);
    }
    async _handleCopyObject(input) {
        const { sourceBucket, sourceKey } = this._parseCopySource(input.CopySource);
        if (sourceBucket !== this.bucket) {
            throw new DatabaseError(`Cross-bucket copy is not supported in FileSystemClient (requested ${sourceBucket} → ${this.bucket})`, {
                operation: 'CopyObject',
                retriable: false,
                suggestion: 'Instantiate a FileSystemClient with the desired bucket or copy within the same bucket.'
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
    async _handleDeleteObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        return await this.storage.delete(key);
    }
    async _handleDeleteObjects(input) {
        const objects = input.Delete?.Objects || [];
        const keys = objects.map(obj => this._applyKeyPrefix(obj.Key));
        return await this.storage.deleteMultiple(keys);
    }
    async _handleListObjects(input) {
        const fullPrefix = this._applyKeyPrefix(input.Prefix || '');
        const params = {
            prefix: fullPrefix,
            delimiter: input.Delimiter,
            maxKeys: input.MaxKeys,
            continuationToken: input.ContinuationToken
        };
        if (input.StartAfter) {
            params.startAfter = this._applyKeyPrefix(input.StartAfter);
        }
        const response = await this.storage.list(params);
        return this._normalizeListResponse(response);
    }
    async putObject(params) {
        const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;
        const fullKey = this._applyKeyPrefix(key);
        const stringMetadata = this._encodeMetadata(metadata) || {};
        const input = { Key: key, Metadata: metadata, ContentType: contentType, Body: body, ContentEncoding: contentEncoding, ContentLength: contentLength, IfMatch: ifMatch, IfNoneMatch: ifNoneMatch };
        const response = await this.storage.put(fullKey, {
            body: body,
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
    async getObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.get(fullKey);
        const decodedResponse = this._decodeMetadataResponse(response);
        this.emit('cl:response', 'GetObjectCommand', decodedResponse, input);
        return decodedResponse;
    }
    async headObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.head(fullKey);
        const decodedResponse = this._decodeMetadataResponse(response);
        this.emit('cl:response', 'HeadObjectCommand', decodedResponse, input);
        return decodedResponse;
    }
    async copyObject(params) {
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
    async exists(key) {
        const fullKey = this._applyKeyPrefix(key);
        return this.storage.exists(fullKey);
    }
    async deleteObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.delete(fullKey);
        this.emit('cl:response', 'DeleteObjectCommand', response, input);
        return response;
    }
    async deleteObjects(keys) {
        const fullKeys = keys.map(key => this._applyKeyPrefix(key));
        const input = { Delete: { Objects: keys.map(key => ({ Key: key })) } };
        const batches = chunk(fullKeys, this.taskManager.concurrency || 5);
        const allResults = { Deleted: [], Errors: [] };
        const { results } = await this.taskManager.process(batches, async (batch) => {
            return await this.storage.deleteMultiple(batch);
        });
        for (const result of results) {
            allResults.Deleted.push(...result.Deleted.map(item => ({ Key: this._stripKeyPrefix(item.Key) })));
            allResults.Errors.push(...result.Errors);
        }
        this.emit('cl:response', 'DeleteObjectsCommand', allResults, input);
        return allResults;
    }
    async listObjects(params = {}) {
        const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
        const fullPrefix = this._applyKeyPrefix(prefix || '');
        const listParams = {
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
    async getKeysPage(params = {}) {
        const { prefix = '', offset = 0, amount = 100 } = params;
        let keys = [];
        let truncated = true;
        let continuationToken;
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
        }
        else {
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
    async getAllKeys(params = {}) {
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
    async count(params = {}) {
        const { prefix = '' } = params;
        const keys = await this.getAllKeys({ prefix });
        const count = keys.length;
        this.emit('cl:Count', count, { prefix });
        return count;
    }
    async deleteAll(params = {}) {
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
    async getContinuationTokenAfterOffset(params = {}) {
        const { prefix = '', offset = 1000 } = params;
        if (offset === 0)
            return null;
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
    async moveObject(params) {
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
    async moveAllObjects(params) {
        const { prefixFrom, prefixTo } = params;
        const keys = await this.getAllKeys({ prefix: prefixFrom });
        const { results, errors } = await this.taskManager.process(keys, async (key) => {
            const to = key.replace(prefixFrom, prefixTo);
            await this.moveObject({ from: key, to });
            return { from: key, to };
        });
        this.emit('moveAllObjects', { results, errors });
        if (errors.length > 0) {
            const error = new Error('Some objects could not be moved');
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
    async clear() {
        await this.storage.clear();
    }
    _encodeMetadata(metadata) {
        if (!metadata)
            return undefined;
        const encoded = {};
        for (const [rawKey, value] of Object.entries(metadata)) {
            const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
            const { encoded: encodedValue } = metadataEncode(value);
            encoded[validKey] = encodedValue;
        }
        return encoded;
    }
    _decodeMetadataResponse(response) {
        const decodedMetadata = {};
        if (response.Metadata) {
            for (const [k, v] of Object.entries(response.Metadata)) {
                decodedMetadata[k] = metadataDecode(v);
            }
        }
        return {
            ...response,
            Metadata: decodedMetadata
        };
    }
    _applyKeyPrefix(key) {
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
    _stripKeyPrefix(key = '') {
        if (!this.keyPrefix) {
            return key;
        }
        const normalizedPrefix = this._keyPrefixForStrip;
        if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
            return key.slice(normalizedPrefix.length).replace(/^\/+/, '');
        }
        return key;
    }
    _encodeContinuationTokenKey(key) {
        return Buffer.from(String(key), 'utf8').toString('base64');
    }
    _parseCopySource(copySource) {
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
    _normalizeListResponse(response) {
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
    getStats() {
        return this.storage.getStats();
    }
    destroy() {
        if (this.storage && typeof this.storage.destroy === 'function') {
            this.storage.destroy();
        }
    }
    static clearPathStorage(basePath) {
        const absolutePath = path.resolve(basePath);
        const storage = globalStorageRegistry.get(absolutePath);
        if (storage && typeof storage.destroy === 'function') {
            storage.destroy();
        }
        globalStorageRegistry.delete(absolutePath);
    }
    static clearAllStorage() {
        for (const storage of globalStorageRegistry.values()) {
            if (typeof storage.destroy === 'function') {
                storage.destroy();
            }
        }
        globalStorageRegistry.clear();
    }
}
export default FileSystemClient;
//# sourceMappingURL=filesystem-client.class.js.map