/**
 * Distributed Lock - Shared locking primitives for S3-based coordination
 *
 * Provides atomic distributed locking using S3 conditional writes (ifNoneMatch: '*').
 * Used by both PluginStorage and SequenceStorage for coordination.
 *
 * Features:
 * - Atomic lock acquisition using S3 preconditions
 * - TTL-based auto-expiration to prevent deadlocks
 * - Exponential backoff with jitter for contention handling
 * - Token-based ownership verification
 *
 * @example
 * const lock = new DistributedLock(storage, {
 *   keyGenerator: (name) => `locks/${name}`
 * });
 *
 * const handle = await lock.acquire('my-lock', { ttl: 30 });
 * try {
 *   // Critical section
 * } finally {
 *   await lock.release(handle);
 * }
 *
 * // Or use withLock helper
 * const result = await lock.withLock('my-lock', { ttl: 30 }, async () => {
 *   return 'result';
 * });
 */

import { tryFn } from './try-fn.js';
import { idGenerator } from './id.js';

/**
 * Default lock configuration
 */
const LOCK_DEFAULTS = {
  ttl: 30,              // Lock TTL in seconds
  timeout: 0,           // Max wait time in ms (0 = no wait, undefined = infinite)
  retryDelay: 100,      // Base retry delay in ms
  maxRetryDelay: 1000,  // Max retry delay in ms
  workerId: 'unknown'   // Worker identifier for debugging
};

/**
 * Compute exponential backoff with jitter
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} baseDelay - Base delay in ms
 * @param {number} maxDelay - Maximum delay in ms
 * @returns {number} Delay in ms
 */
export function computeBackoff(attempt, baseDelay, maxDelay) {
  const exponential = Math.min(baseDelay * Math.pow(2, Math.max(attempt - 1, 0)), maxDelay);
  const jitter = Math.floor(Math.random() * Math.max(baseDelay / 2, 1));
  return exponential + jitter;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is a precondition failure (lock already exists)
 * @param {Error} err - Error to check
 * @returns {boolean}
 */
export function isPreconditionFailure(err) {
  const originalError = err?.original || err;
  const errorCode = originalError?.code || originalError?.Code || originalError?.name;
  const statusCode = originalError?.statusCode || originalError?.$metadata?.httpStatusCode;
  return errorCode === 'PreconditionFailed' || statusCode === 412;
}

/**
 * DistributedLock - Atomic distributed locking
 *
 * Storage adapter interface (must implement):
 * - async get(key) → Object|null
 * - async set(key, data, options) → response (options: { ifNoneMatch, ttl?, behavior? })
 * - async delete(key) → void
 */
export class DistributedLock {
  /**
   * @param {Object} storage - Storage adapter with get/set/delete methods
   * @param {Object} [options] - Configuration options
   * @param {Function} [options.keyGenerator] - Function to generate lock key from name
   * @param {Object} [options.defaults] - Default options for acquire
   */
  constructor(storage, options = {}) {
    if (!storage) {
      throw new Error('DistributedLock requires a storage adapter');
    }

    this.storage = storage;
    this.keyGenerator = options.keyGenerator || ((name) => `locks/${name}`);
    this.defaults = { ...LOCK_DEFAULTS, ...options.defaults };
  }

  /**
   * Acquire a distributed lock
   *
   * @param {string} lockName - Lock identifier
   * @param {Object} [options] - Lock options
   * @param {number} [options.ttl=30] - Lock TTL in seconds
   * @param {number} [options.timeout=0] - Max wait time in ms (0 = no wait)
   * @param {string} [options.workerId='unknown'] - Worker identifier
   * @param {number} [options.retryDelay=100] - Base retry delay in ms
   * @param {number} [options.maxRetryDelay=1000] - Max retry delay in ms
   * @returns {Promise<Object|null>} Lock handle or null if couldn't acquire
   */
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

      const [ok, err, putResponse] = await tryFn(() =>
        this.storage.set(key, payload, {
          ttl,
          behavior: 'body-only',
          ifNoneMatch: '*'
        })
      );

      if (ok) {
        return {
          name: lockName,
          key,
          token,
          workerId,
          expiresAt: payload._expiresAt,
          etag: putResponse?.ETag || null
        };
      }

      if (!isPreconditionFailure(err)) {
        throw err;
      }

      // Check timeout (0 means don't wait, undefined means wait indefinitely)
      if (timeout !== undefined && Date.now() - startTime >= timeout) {
        return null;
      }

      // Check if existing lock is expired (get() with TTL auto-deletes expired)
      const current = await this.storage.get(key);
      if (!current) {
        continue; // Lock expired - retry immediately
      }

      // Manual TTL check for storages without auto-expiry
      if (current._expiresAt && Date.now() > current._expiresAt) {
        await tryFn(() => this.storage.delete(key));
        continue;
      }

      attempt += 1;
      const delay = computeBackoff(attempt, retryDelay, maxRetryDelay);
      await sleep(delay);
    }
  }

  /**
   * Release a distributed lock
   *
   * @param {Object|string} lock - Lock handle returned by acquire, or lock name
   * @param {string} [token] - Lock token (required when passing lock name)
   * @returns {Promise<void>}
   */
  async release(lock, token) {
    if (!lock) return;

    let key;
    let expectedToken = token;

    if (typeof lock === 'object') {
      key = lock.key || this.keyGenerator(lock.name || lock.lockName);
      expectedToken = lock.token ?? token;
    } else if (typeof lock === 'string') {
      key = this.keyGenerator(lock);
      expectedToken = token;
    } else {
      throw new Error('release() expects a lock handle or lock name');
    }

    if (!expectedToken) {
      throw new Error('release() requires the lock token');
    }

    if (!key) {
      throw new Error('Invalid lock key');
    }

    const current = await this.storage.get(key);
    if (!current) return;

    // Only release if we own the lock
    if (current.token !== expectedToken) {
      return;
    }

    await this.storage.delete(key);
  }

  /**
   * Execute callback while holding lock
   *
   * @param {string} lockName - Lock identifier
   * @param {Object} options - Options forwarded to acquire
   * @param {Function} callback - Async function to execute
   * @returns {Promise<*>} Callback result, or null if lock not acquired
   */
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
    } finally {
      await tryFn(() => this.release(lock));
    }
  }

  /**
   * Check if lock is currently held
   *
   * @param {string} lockName - Lock identifier
   * @returns {Promise<boolean>} True if locked
   */
  async isLocked(lockName) {
    const key = this.keyGenerator(lockName);
    const lock = await this.storage.get(key);
    return lock !== null;
  }

  /**
   * Get lock info without acquiring
   *
   * @param {string} lockName - Lock identifier
   * @returns {Promise<Object|null>} Lock info or null if not locked
   */
  async getLockInfo(lockName) {
    const key = this.keyGenerator(lockName);
    return this.storage.get(key);
  }
}

/**
 * Create a lock-wrapped function
 *
 * @param {DistributedLock} lock - Lock instance
 * @param {string} lockName - Lock name to use
 * @param {Object} [options] - Lock options
 * @returns {Function} Wrapped async function
 *
 * @example
 * const lockedFn = createLockedFunction(lock, 'my-resource', { ttl: 10 });
 * const result = await lockedFn(async () => {
 *   // This runs under lock
 *   return computeValue();
 * });
 */
export function createLockedFunction(lock, lockName, options = {}) {
  return async (callback) => lock.withLock(lockName, options, callback);
}

export default DistributedLock;
