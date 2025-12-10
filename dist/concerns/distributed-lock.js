import { tryFn } from './try-fn.js';
import { idGenerator } from './id.js';
const LOCK_DEFAULTS = {
    ttl: 30,
    timeout: 0,
    retryDelay: 100,
    maxRetryDelay: 1000,
    workerId: 'unknown'
};
export function computeBackoff(attempt, baseDelay, maxDelay) {
    const exponential = Math.min(baseDelay * Math.pow(2, Math.max(attempt - 1, 0)), maxDelay);
    const jitter = Math.floor(Math.random() * Math.max(baseDelay / 2, 1));
    return exponential + jitter;
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function isPreconditionFailure(err) {
    const originalError = err?.original || err;
    const errorCode = originalError?.code || originalError?.Code || originalError?.name;
    const statusCode = originalError?.statusCode || originalError?.$metadata?.httpStatusCode;
    return errorCode === 'PreconditionFailed' || statusCode === 412;
}
export class DistributedLock {
    storage;
    keyGenerator;
    defaults;
    constructor(storage, options = {}) {
        if (!storage) {
            throw new Error('DistributedLock requires a storage adapter');
        }
        this.storage = storage;
        this.keyGenerator = options.keyGenerator || ((name) => `locks/${name}`);
        this.defaults = { ...LOCK_DEFAULTS, ...options.defaults };
    }
    async acquire(lockName, options = {}) {
        const opts = { ...this.defaults, ...options };
        const { ttl, timeout, workerId, retryDelay, maxRetryDelay } = opts;
        const key = this.keyGenerator(lockName);
        const token = idGenerator();
        const startTime = Date.now();
        let attempt = 0;
        while (true) {
            const payload = {
                workerId,
                token,
                acquiredAt: Date.now(),
                _expiresAt: Date.now() + (ttl * 1000)
            };
            const [ok, err, putResponse] = await tryFn(() => this.storage.set(key, payload, {
                ttl,
                behavior: 'body-only',
                ifNoneMatch: '*'
            }));
            if (ok && putResponse) {
                return {
                    name: lockName,
                    key,
                    token,
                    workerId,
                    expiresAt: payload._expiresAt,
                    etag: putResponse.ETag || null
                };
            }
            if (!isPreconditionFailure(err)) {
                throw err;
            }
            if (timeout !== undefined && Date.now() - startTime >= timeout) {
                return null;
            }
            const current = await this.storage.get(key);
            if (!current) {
                continue;
            }
            if (current._expiresAt && Date.now() > current._expiresAt) {
                await tryFn(() => this.storage.delete(key));
                continue;
            }
            attempt += 1;
            const delay = computeBackoff(attempt, retryDelay, maxRetryDelay);
            await sleep(delay);
        }
    }
    async release(lock, token) {
        if (!lock)
            return;
        let key;
        let expectedToken = token;
        if (typeof lock === 'object') {
            key = lock.key || this.keyGenerator(lock.name);
            expectedToken = lock.token ?? token;
        }
        else if (typeof lock === 'string') {
            key = this.keyGenerator(lock);
            expectedToken = token;
        }
        else {
            throw new Error('release() expects a lock handle or lock name');
        }
        if (!expectedToken) {
            throw new Error('release() requires the lock token');
        }
        if (!key) {
            throw new Error('Invalid lock key');
        }
        const current = await this.storage.get(key);
        if (!current)
            return;
        if (current.token !== expectedToken) {
            return;
        }
        await this.storage.delete(key);
    }
    async withLock(lockName, options, callback) {
        if (typeof callback !== 'function') {
            throw new Error('withLock() requires a callback function');
        }
        const lock = await this.acquire(lockName, options);
        if (!lock) {
            return null;
        }
        try {
            return await callback(lock);
        }
        finally {
            await tryFn(() => this.release(lock));
        }
    }
    async isLocked(lockName) {
        const key = this.keyGenerator(lockName);
        const lock = await this.storage.get(key);
        return lock !== null;
    }
    async getLockInfo(lockName) {
        const key = this.keyGenerator(lockName);
        return this.storage.get(key);
    }
}
export function createLockedFunction(lock, lockName, options = {}) {
    return async (callback) => lock.withLock(lockName, options, callback);
}
export default DistributedLock;
//# sourceMappingURL=distributed-lock.js.map