import { metadataEncode } from './metadata-encoding.js';
import { calculateEffectiveLimit, calculateUTF8Bytes } from './calculator.js';
import { tryFn } from './try-fn.js';
import { idGenerator } from './id.js';
import { PluginStorageError, MetadataLimitError, BehaviorError } from '../errors.js';
import { DistributedLock, computeBackoff, sleep, isPreconditionFailure } from './distributed-lock.js';
import { DistributedSequence } from './distributed-sequence.js';
const S3_METADATA_LIMIT = 2047;
export class PluginStorage {
    client;
    pluginSlug;
    _lock;
    _sequence;
    _now;
    constructor(client, pluginSlug, options = {}) {
        if (!client) {
            throw new PluginStorageError('PluginStorage requires a client instance', {
                operation: 'constructor',
                pluginSlug,
                suggestion: 'Pass a valid S3db Client instance when creating PluginStorage'
            });
        }
        if (!pluginSlug) {
            throw new PluginStorageError('PluginStorage requires a pluginSlug', {
                operation: 'constructor',
                suggestion: 'Provide a plugin slug (e.g., "eventual-consistency", "cache", "audit")'
            });
        }
        this.client = client;
        this.pluginSlug = pluginSlug;
        // Use arrow function to capture Date.now dynamically (enables FakeTimers mocking)
        this._now = options.now ?? (() => Date.now());
        this._lock = new DistributedLock(this, {
            keyGenerator: (name) => this.getPluginKey(null, 'locks', name)
        });
        this._sequence = new DistributedSequence(this, {
            valueKeyGenerator: (name) => this.getSequenceKey(null, name, 'value'),
            lockKeyGenerator: (name) => this.getSequenceKey(null, name, 'lock')
        });
    }
    getPluginKey(resourceName, ...parts) {
        if (resourceName) {
            return `resource=${resourceName}/plugin=${this.pluginSlug}/${parts.join('/')}`;
        }
        return `plugin=${this.pluginSlug}/${parts.join('/')}`;
    }
    getSequenceKey(resourceName, sequenceName, suffix) {
        if (resourceName) {
            return `resource=${resourceName}/plugin=${this.pluginSlug}/sequence=${sequenceName}/${suffix}`;
        }
        return `plugin=${this.pluginSlug}/sequence=${sequenceName}/${suffix}`;
    }
    async set(key, data, options = {}) {
        const { ttl, behavior = 'body-overflow', contentType = 'application/json', ifMatch, ifNoneMatch } = options;
        const dataToSave = { ...data };
        if (ttl && typeof ttl === 'number' && ttl > 0) {
            dataToSave._expiresAt = this._now() + (ttl * 1000);
        }
        const { metadata, body } = this._applyBehavior(dataToSave, behavior);
        const putParams = {
            key,
            metadata,
            contentType
        };
        if (body !== null) {
            putParams.body = JSON.stringify(body);
        }
        if (ifMatch !== undefined) {
            putParams.ifMatch = ifMatch;
        }
        if (ifNoneMatch !== undefined) {
            putParams.ifNoneMatch = ifNoneMatch;
        }
        const [ok, err, response] = await tryFn(() => this.client.putObject(putParams));
        if (!ok) {
            throw new PluginStorageError(`Failed to save plugin data`, {
                pluginSlug: this.pluginSlug,
                key,
                operation: 'set',
                behavior,
                ttl,
                original: err,
                suggestion: 'Check S3 permissions and key format'
            });
        }
        return response;
    }
    async batchSet(items) {
        const promises = items.map(async (item) => {
            const [ok, error] = await tryFn(() => this.set(item.key, item.data, item.options || {}));
            return { ok, key: item.key, error: ok ? undefined : error };
        });
        return Promise.all(promises);
    }
    async get(key) {
        const [ok, err, response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            const error = err;
            if (error?.name === 'NoSuchKey' ||
                error?.code === 'NoSuchKey' ||
                error?.Code === 'NoSuchKey' ||
                error?.statusCode === 404) {
                return null;
            }
            throw new PluginStorageError(`Failed to retrieve plugin data`, {
                pluginSlug: this.pluginSlug,
                key,
                operation: 'get',
                original: err,
                suggestion: 'Check if the key exists and S3 permissions are correct'
            });
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        let data = parsedMetadata;
        if (response.Body) {
            const [parseOk, parseErr, result] = await tryFn(async () => {
                const bodyContent = await response.Body.transformToString();
                if (bodyContent && bodyContent.trim()) {
                    const body = JSON.parse(bodyContent);
                    return { ...parsedMetadata, ...body };
                }
                return parsedMetadata;
            });
            if (!parseOk || !result) {
                throw new PluginStorageError(`Failed to parse JSON body`, {
                    pluginSlug: this.pluginSlug,
                    key,
                    operation: 'get',
                    original: parseErr,
                    suggestion: 'Body content may be corrupted. Check S3 object integrity'
                });
            }
            data = result;
        }
        const expiresAt = (data._expiresat || data._expiresAt);
        if (expiresAt) {
            if (this._now() > expiresAt) {
                await this.delete(key);
                return null;
            }
            delete data._expiresat;
            delete data._expiresAt;
        }
        return data;
    }
    _parseMetadataValues(metadata) {
        const parsed = {};
        for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === 'string') {
                if ((value.startsWith('{') && value.endsWith('}')) ||
                    (value.startsWith('[') && value.endsWith(']'))) {
                    try {
                        parsed[key] = JSON.parse(value);
                        continue;
                    }
                    catch {
                        // Not JSON, keep as string
                    }
                }
                if (!isNaN(Number(value)) && value.trim() !== '') {
                    parsed[key] = Number(value);
                    continue;
                }
                if (value === 'true') {
                    parsed[key] = true;
                    continue;
                }
                if (value === 'false') {
                    parsed[key] = false;
                    continue;
                }
            }
            parsed[key] = value;
        }
        return parsed;
    }
    async list(prefix = '', options = {}) {
        const { limit } = options;
        const fullPrefix = prefix
            ? `plugin=${this.pluginSlug}/${prefix}`
            : `plugin=${this.pluginSlug}/`;
        const [ok, err, result] = await tryFn(() => this.client.listObjects({ prefix: fullPrefix, maxKeys: limit }));
        if (!ok || !result) {
            throw new PluginStorageError(`Failed to list plugin data`, {
                pluginSlug: this.pluginSlug,
                operation: 'list',
                prefix,
                fullPrefix,
                limit,
                original: err,
                suggestion: 'Check S3 permissions and bucket configuration'
            });
        }
        const keys = (result.Contents ?? []).map(item => item.Key).filter((k) => typeof k === 'string');
        return this._removeKeyPrefix(keys);
    }
    async listForResource(resourceName, subPrefix = '', options = {}) {
        const { limit } = options;
        const fullPrefix = subPrefix
            ? `resource=${resourceName}/plugin=${this.pluginSlug}/${subPrefix}`
            : `resource=${resourceName}/plugin=${this.pluginSlug}/`;
        const [ok, err, result] = await tryFn(() => this.client.listObjects({ prefix: fullPrefix, maxKeys: limit }));
        if (!ok || !result) {
            throw new PluginStorageError(`Failed to list resource data`, {
                pluginSlug: this.pluginSlug,
                operation: 'listForResource',
                resourceName,
                subPrefix,
                fullPrefix,
                limit,
                original: err,
                suggestion: 'Check resource name and S3 permissions'
            });
        }
        const keys = (result.Contents ?? []).map(item => item.Key).filter((k) => typeof k === 'string');
        return this._removeKeyPrefix(keys);
    }
    async listWithPrefix(prefix = '', options = {}) {
        const keys = await this.list(prefix, options);
        if (!keys || keys.length === 0) {
            return [];
        }
        const results = await this.batchGet(keys);
        return results
            .filter(item => item.ok && item.data != null)
            .map(item => item.data);
    }
    _removeKeyPrefix(keys) {
        const keyPrefix = this.client.config.keyPrefix;
        if (!keyPrefix)
            return keys;
        return keys
            .map(key => key.replace(keyPrefix, ''))
            .map(key => (key.startsWith('/') ? key.replace('/', '') : key));
    }
    async has(key) {
        const data = await this.get(key);
        return data !== null;
    }
    async isExpired(key) {
        const [ok, , response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            return true;
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        let data = parsedMetadata;
        if (response.Body) {
            const [parseOk, , result] = await tryFn(async () => {
                const bodyContent = await response.Body.transformToString();
                if (bodyContent && bodyContent.trim()) {
                    const body = JSON.parse(bodyContent);
                    return { ...parsedMetadata, ...body };
                }
                return parsedMetadata;
            });
            if (!parseOk || !result) {
                return true;
            }
            data = result;
        }
        const expiresAt = (data._expiresat || data._expiresAt);
        if (!expiresAt) {
            return false;
        }
        return this._now() > expiresAt;
    }
    async getTTL(key) {
        const [ok, , response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            return null;
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        let data = parsedMetadata;
        if (response.Body) {
            const [parseOk, , result] = await tryFn(async () => {
                const bodyContent = await response.Body.transformToString();
                if (bodyContent && bodyContent.trim()) {
                    const body = JSON.parse(bodyContent);
                    return { ...parsedMetadata, ...body };
                }
                return parsedMetadata;
            });
            if (!parseOk || !result) {
                return null;
            }
            data = result;
        }
        const expiresAt = (data._expiresat || data._expiresAt);
        if (!expiresAt) {
            return null;
        }
        const remaining = Math.max(0, expiresAt - this._now());
        return Math.floor(remaining / 1000);
    }
    async touch(key, additionalSeconds) {
        const [ok, , response] = await tryFn(() => this.client.headObject(key));
        if (!ok || !response) {
            return false;
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        const expiresAt = (parsedMetadata._expiresat || parsedMetadata._expiresAt);
        if (!expiresAt) {
            return false;
        }
        parsedMetadata._expiresAt = expiresAt + (additionalSeconds * 1000);
        delete parsedMetadata._expiresat;
        const encodedMetadata = {};
        for (const [metaKey, metaValue] of Object.entries(parsedMetadata)) {
            const { encoded } = metadataEncode(metaValue);
            encodedMetadata[metaKey] = encoded;
        }
        const [copyOk] = await tryFn(() => this.client.copyObject({
            from: key,
            to: key,
            metadata: encodedMetadata,
            metadataDirective: 'REPLACE',
            contentType: response.ContentType || 'application/json'
        }));
        return copyOk;
    }
    async delete(key) {
        const [ok, err] = await tryFn(() => this.client.deleteObject(key));
        if (!ok) {
            throw new PluginStorageError(`Failed to delete plugin data`, {
                pluginSlug: this.pluginSlug,
                key,
                operation: 'delete',
                original: err,
                suggestion: 'Check S3 delete permissions'
            });
        }
    }
    async deleteAll(resourceName = null) {
        let deleted = 0;
        if (resourceName) {
            const keys = await this.listForResource(resourceName);
            for (const key of keys) {
                await this.delete(key);
                deleted++;
            }
        }
        else {
            const allKeys = await this.client.getAllKeys({});
            const pluginKeys = allKeys.filter(key => key.includes(`plugin=${this.pluginSlug}/`));
            for (const key of pluginKeys) {
                await this.delete(key);
                deleted++;
            }
        }
        return deleted;
    }
    async batchPut(items) {
        const promises = items.map(async (item) => {
            const [ok, error] = await tryFn(() => this.set(item.key, item.data, item.options));
            return { key: item.key, ok, error: ok ? undefined : error };
        });
        return Promise.all(promises);
    }
    async batchGet(keys) {
        const promises = keys.map(async (key) => {
            const [ok, error, data] = await tryFn(() => this.get(key));
            return { key, ok, data, error: ok ? undefined : error };
        });
        return Promise.all(promises);
    }
    /**
     * Set data only if the key does not exist (conditional PUT).
     * Uses ifNoneMatch: '*' to ensure atomicity.
     * @returns The ETag (version) if set succeeded, null if key already exists.
     */
    async setIfNotExists(key, data, options = {}) {
        const [ok, err, response] = await tryFn(() => this.set(key, data, { ...options, ifNoneMatch: '*' }));
        if (!ok) {
            const error = err;
            // PreconditionFailed (412) or similar means key already exists
            if (error?.name === 'PreconditionFailed' ||
                error?.code === 'PreconditionFailed' ||
                error?.statusCode === 412) {
                return null;
            }
            throw err;
        }
        return response?.ETag ?? null;
    }
    /**
     * Get data along with its version (ETag) for conditional updates.
     * @returns Object with data and version, or { data: null, version: null } if not found.
     */
    async getWithVersion(key) {
        const [ok, err, response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            const error = err;
            if (error?.name === 'NoSuchKey' ||
                error?.code === 'NoSuchKey' ||
                error?.Code === 'NoSuchKey' ||
                error?.statusCode === 404) {
                return { data: null, version: null };
            }
            throw new PluginStorageError(`Failed to retrieve plugin data with version`, {
                pluginSlug: this.pluginSlug,
                key,
                operation: 'getWithVersion',
                original: err,
                suggestion: 'Check if the key exists and S3 permissions are correct'
            });
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        let data = parsedMetadata;
        if (response.Body) {
            const [parseOk, parseErr, result] = await tryFn(async () => {
                const bodyContent = await response.Body.transformToString();
                if (bodyContent && bodyContent.trim()) {
                    const body = JSON.parse(bodyContent);
                    return { ...parsedMetadata, ...body };
                }
                return parsedMetadata;
            });
            if (!parseOk || !result) {
                throw new PluginStorageError(`Failed to parse JSON body`, {
                    pluginSlug: this.pluginSlug,
                    key,
                    operation: 'getWithVersion',
                    original: parseErr,
                    suggestion: 'Body content may be corrupted'
                });
            }
            data = result;
        }
        // Check expiration
        const expiresAt = (data._expiresat || data._expiresAt);
        if (expiresAt && this._now() > expiresAt) {
            await this.delete(key);
            return { data: null, version: null };
        }
        // Clean up internal fields
        delete data._expiresat;
        delete data._expiresAt;
        // Extract ETag from response - need to get it from headObject since getObject may not return it
        const [headOk, , headResponse] = await tryFn(() => this.client.headObject(key));
        const version = headOk && headResponse ? headResponse.ETag ?? null : null;
        return { data, version };
    }
    /**
     * Set data only if the current version matches (conditional PUT).
     * Uses ifMatch to ensure no concurrent modifications.
     * @returns The new ETag (version) if set succeeded, null if version mismatch.
     */
    async setIfVersion(key, data, version, options = {}) {
        const [ok, err, response] = await tryFn(() => this.set(key, data, { ...options, ifMatch: version }));
        if (!ok) {
            const error = err;
            // PreconditionFailed (412) means version mismatch
            if (error?.name === 'PreconditionFailed' ||
                error?.code === 'PreconditionFailed' ||
                error?.statusCode === 412) {
                return null;
            }
            throw err;
        }
        return response?.ETag ?? null;
    }
    /**
     * Delete data only if the current version matches (conditional DELETE).
     * @returns true if deleted, false if version mismatch or key not found.
     */
    async deleteIfVersion(key, version) {
        // First verify the version matches
        const [headOk, , headResponse] = await tryFn(() => this.client.headObject(key));
        if (!headOk || !headResponse) {
            return false;
        }
        const currentVersion = headResponse.ETag;
        if (currentVersion !== version) {
            return false;
        }
        const [deleteOk] = await tryFn(() => this.client.deleteObject(key));
        return deleteOk;
    }
    async acquireLock(lockName, options = {}) {
        return this._lock.acquire(lockName, options);
    }
    async releaseLock(lock, token) {
        return this._lock.release(lock, token);
    }
    async withLock(lockName, options, callback) {
        return this._lock.withLock(lockName, options, callback);
    }
    async isLocked(lockName) {
        return this._lock.isLocked(lockName);
    }
    async increment(key, amount = 1, options = {}) {
        const [headOk, , headResponse] = await tryFn(() => this.client.headObject(key));
        if (headOk && headResponse?.Metadata) {
            const metadata = headResponse.Metadata || {};
            const parsedMetadata = this._parseMetadataValues(metadata);
            const currentValue = parsedMetadata.value || 0;
            const newValue = currentValue + amount;
            parsedMetadata.value = newValue;
            if (options.ttl) {
                parsedMetadata._expiresAt = this._now() + (options.ttl * 1000);
            }
            const encodedMetadata = {};
            for (const [metaKey, metaValue] of Object.entries(parsedMetadata)) {
                const { encoded } = metadataEncode(metaValue);
                encodedMetadata[metaKey] = encoded;
            }
            const [copyOk] = await tryFn(() => this.client.copyObject({
                from: key,
                to: key,
                metadata: encodedMetadata,
                metadataDirective: 'REPLACE',
                contentType: headResponse.ContentType || 'application/json'
            }));
            if (copyOk) {
                return newValue;
            }
        }
        const data = await this.get(key);
        const value = (data?.value || 0) + amount;
        await this.set(key, { value }, options);
        return value;
    }
    async decrement(key, amount = 1, options = {}) {
        return this.increment(key, -amount, options);
    }
    async nextSequence(name, options = {}) {
        const { resourceName = null, initialValue = 1, increment = 1, lockTimeout = 5000, lockTTL = 10 } = options;
        const valueKey = this.getSequenceKey(resourceName, name, 'value');
        const lockKey = this.getSequenceKey(resourceName, name, 'lock');
        const result = await this._withSequenceLock(lockKey, { timeout: lockTimeout, ttl: lockTTL }, async () => {
            const data = await this.get(valueKey);
            if (!data) {
                await this.set(valueKey, {
                    value: initialValue + increment,
                    name,
                    resourceName,
                    createdAt: this._now()
                }, { behavior: 'body-only' });
                return initialValue;
            }
            const currentValue = data.value;
            await this.set(valueKey, {
                ...data,
                value: currentValue + increment,
                updatedAt: this._now()
            }, { behavior: 'body-only' });
            return currentValue;
        });
        if (result === null) {
            throw new PluginStorageError(`Failed to acquire lock for sequence "${name}"`, {
                pluginSlug: this.pluginSlug,
                operation: 'nextSequence',
                sequenceName: name,
                resourceName,
                lockTimeout,
                suggestion: 'Increase lockTimeout or check for deadlocks'
            });
        }
        return result;
    }
    async _withSequenceLock(lockKey, options, callback) {
        const { ttl = 30, timeout = 5000 } = options;
        const token = idGenerator();
        const startTime = this._now();
        let attempt = 0;
        while (true) {
            const payload = {
                token,
                acquiredAt: this._now(),
                _expiresAt: this._now() + (ttl * 1000)
            };
            const [ok, err] = await tryFn(() => this.set(lockKey, payload, {
                behavior: 'body-only',
                ifNoneMatch: '*'
            }));
            if (ok) {
                try {
                    return await callback();
                }
                finally {
                    const current = await this.get(lockKey);
                    if (current && current.token === token) {
                        await tryFn(() => this.delete(lockKey));
                    }
                }
            }
            if (!isPreconditionFailure(err)) {
                throw err;
            }
            if (timeout !== undefined && this._now() - startTime >= timeout) {
                return null;
            }
            const current = await this.get(lockKey);
            if (!current)
                continue;
            if (current._expiresAt && this._now() > current._expiresAt) {
                await tryFn(() => this.delete(lockKey));
                continue;
            }
            attempt += 1;
            const delay = computeBackoff(attempt, 100, 1000);
            await sleep(delay);
        }
    }
    async getSequence(name, options = {}) {
        const { resourceName = null } = options;
        const valueKey = this.getSequenceKey(resourceName, name, 'value');
        const data = await this.get(valueKey);
        return data?.value ?? null;
    }
    async resetSequence(name, value, options = {}) {
        const { resourceName = null, lockTimeout = 5000, lockTTL = 10 } = options;
        const valueKey = this.getSequenceKey(resourceName, name, 'value');
        const lockKey = this.getSequenceKey(resourceName, name, 'lock');
        const result = await this._withSequenceLock(lockKey, { timeout: lockTimeout, ttl: lockTTL }, async () => {
            const data = await this.get(valueKey);
            await this.set(valueKey, {
                value,
                name,
                resourceName,
                createdAt: data?.createdAt || this._now(),
                updatedAt: this._now(),
                resetAt: this._now()
            }, { behavior: 'body-only' });
            return true;
        });
        if (result === null) {
            throw new PluginStorageError(`Failed to acquire lock for sequence "${name}"`, {
                pluginSlug: this.pluginSlug,
                operation: 'resetSequence',
                sequenceName: name,
                resourceName,
                lockTimeout,
                suggestion: 'Increase lockTimeout or check for deadlocks'
            });
        }
        return result;
    }
    async deleteSequence(name, options = {}) {
        const { resourceName = null } = options;
        const valueKey = this.getSequenceKey(resourceName, name, 'value');
        const lockKey = this.getSequenceKey(resourceName, name, 'lock');
        await this.delete(valueKey);
        await tryFn(() => this.delete(lockKey));
    }
    async listSequences(options = {}) {
        const { resourceName = null } = options;
        let prefix;
        if (resourceName) {
            prefix = `resource=${resourceName}/plugin=${this.pluginSlug}/sequence=`;
        }
        else {
            prefix = `plugin=${this.pluginSlug}/sequence=`;
        }
        const [ok, , result] = await tryFn(() => this.client.listObjects({ prefix }));
        if (!ok || !result)
            return [];
        const keys = (result.Contents ?? []).map(item => item.Key).filter((k) => typeof k === 'string');
        const valueKeys = keys.filter(k => k.endsWith('/value'));
        const sequences = [];
        for (const key of valueKeys) {
            const data = await this.get(key);
            if (data) {
                sequences.push(data);
            }
        }
        return sequences;
    }
    _applyBehavior(data, behavior) {
        const effectiveLimit = calculateEffectiveLimit({ s3Limit: S3_METADATA_LIMIT });
        let metadata = {};
        let body = null;
        switch (behavior) {
            case 'body-overflow': {
                const entries = Object.entries(data);
                const sorted = entries.map(([key, value]) => {
                    const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
                    const { encoded } = metadataEncode(jsonValue);
                    const keySize = calculateUTF8Bytes(key);
                    const valueSize = calculateUTF8Bytes(encoded);
                    return { key, value, jsonValue, encoded, size: keySize + valueSize };
                }).sort((a, b) => a.size - b.size);
                let currentSize = 0;
                for (const item of sorted) {
                    if (currentSize + item.size <= effectiveLimit) {
                        metadata[item.key] = item.jsonValue;
                        currentSize += item.size;
                    }
                    else {
                        if (body === null)
                            body = {};
                        body[item.key] = item.value;
                    }
                }
                break;
            }
            case 'body-only': {
                body = data;
                break;
            }
            case 'enforce-limits': {
                let currentSize = 0;
                for (const [key, value] of Object.entries(data)) {
                    const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
                    const { encoded } = metadataEncode(jsonValue);
                    const keySize = calculateUTF8Bytes(key);
                    const valueSize = calculateUTF8Bytes(encoded);
                    currentSize += keySize + valueSize;
                    if (currentSize > effectiveLimit) {
                        throw new MetadataLimitError(`Data exceeds metadata limit with enforce-limits behavior`, {
                            totalSize: currentSize,
                            effectiveLimit,
                            absoluteLimit: S3_METADATA_LIMIT,
                            excess: currentSize - effectiveLimit,
                            operation: 'PluginStorage.set',
                            pluginSlug: this.pluginSlug,
                            suggestion: "Use 'body-overflow' or 'body-only' behavior to handle large data"
                        });
                    }
                    metadata[key] = jsonValue;
                }
                break;
            }
            default:
                throw new BehaviorError(`Unknown behavior: ${behavior}`, {
                    behavior,
                    availableBehaviors: ['body-overflow', 'body-only', 'enforce-limits'],
                    operation: 'PluginStorage._applyBehavior',
                    pluginSlug: this.pluginSlug,
                    suggestion: "Use 'body-overflow', 'body-only', or 'enforce-limits'"
                });
        }
        return { metadata, body };
    }
}
export default PluginStorage;
//# sourceMappingURL=plugin-storage.js.map