import { tryFn } from './try-fn.js';
import { idGenerator } from './id.js';

export interface LockDefaults {
  ttl?: number;
  timeout?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  workerId?: string;
}

export interface AcquireOptions extends LockDefaults {
  ttl?: number;
  timeout?: number;
  workerId?: string;
  retryDelay?: number;
  maxRetryDelay?: number;
}

export interface LockHandle {
  name: string;
  key: string;
  token: string;
  workerId: string;
  expiresAt: number;
  etag: string | null;
}

export interface LockInfo {
  workerId?: string;
  token: string;
  acquiredAt: number;
  _expiresAt: number;
}

export interface StorageAdapter {
  get(key: string): Promise<LockInfo | null>;
  set(key: string, data: LockInfo, options?: SetOptions): Promise<{ ETag?: string }>;
  delete(key: string): Promise<void>;
}

export interface SetOptions {
  ttl?: number;
  behavior?: string;
  ifNoneMatch?: string;
}

export interface DistributedLockOptions {
  keyGenerator?: (name: string) => string;
  defaults?: LockDefaults;
}

interface PreconditionError extends Error {
  original?: {
    code?: string;
    Code?: string;
    name?: string;
    statusCode?: number;
    $metadata?: { httpStatusCode?: number };
  };
  code?: string;
  Code?: string;
  statusCode?: number;
  $metadata?: { httpStatusCode?: number };
}

const LOCK_DEFAULTS: Required<LockDefaults> = {
  ttl: 30,
  timeout: 0,
  retryDelay: 100,
  maxRetryDelay: 1000,
  workerId: 'unknown'
};

export function computeBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponential = Math.min(baseDelay * Math.pow(2, Math.max(attempt - 1, 0)), maxDelay);
  const jitter = Math.floor(Math.random() * Math.max(baseDelay / 2, 1));
  return exponential + jitter;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPreconditionFailure(err: PreconditionError | null | undefined): boolean {
  const originalError = err?.original || err;
  const errorCode = originalError?.code || originalError?.Code || originalError?.name;
  const statusCode = originalError?.statusCode || originalError?.$metadata?.httpStatusCode;
  return errorCode === 'PreconditionFailed' || statusCode === 412;
}

export function isValidLockPayload(value: unknown): value is LockInfo {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.acquiredAt === 'number' &&
    Number.isFinite(candidate.acquiredAt) &&
    (!('_expiresAt' in candidate) || (
      typeof candidate._expiresAt === 'number' && Number.isFinite(candidate._expiresAt)
    ))
  );
}

export function isExpiredLockPayload(lock: LockInfo, now: number): boolean {
  if (!('_expiresAt' in lock)) {
    return false;
  }

  return typeof lock._expiresAt === 'number' && now > lock._expiresAt;
}

export class DistributedLock {
  storage: StorageAdapter;
  keyGenerator: (name: string) => string;
  defaults: Required<LockDefaults>;

  constructor(storage: StorageAdapter, options: DistributedLockOptions = {}) {
    if (!storage) {
      throw new Error('DistributedLock requires a storage adapter');
    }

    this.storage = storage;
    this.keyGenerator = options.keyGenerator || ((name: string) => `locks/${name}`);
    this.defaults = { ...LOCK_DEFAULTS, ...options.defaults };
  }

  async acquire(lockName: string, options: AcquireOptions = {}): Promise<LockHandle | null> {
    const opts = { ...this.defaults, ...options };
    const { ttl, timeout, workerId, retryDelay, maxRetryDelay } = opts;

    const key = this.keyGenerator(lockName);
    const token = idGenerator();
    const startTime = Date.now();
    let attempt = 0;

    while (true) {
      const payload: LockInfo = {
        workerId,
        token,
        acquiredAt: Date.now(),
        _expiresAt: Date.now() + (ttl * 1000)
      };

      const [ok, err, putResponse] = await tryFn<{ ETag?: string }>(() =>
        this.storage.set(key, payload, {
          ttl,
          behavior: 'body-only',
          ifNoneMatch: '*'
        })
      );

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

      if (!isPreconditionFailure(err as PreconditionError)) {
        throw err;
      }

      if (timeout !== undefined && Date.now() - startTime >= timeout) {
        return null;
      }

      let current: LockInfo | null;
      try {
        current = await this.storage.get(key);
      } catch {
        await tryFn(() => this.storage.delete(key));
        continue;
      }

      if (!current) {
        continue;
      }

      if (!isValidLockPayload(current) || isExpiredLockPayload(current, Date.now())) {
        await tryFn(() => this.storage.delete(key));
        continue;
      }

      attempt += 1;
      const delay = computeBackoff(attempt, retryDelay, maxRetryDelay);
      await sleep(delay);
    }
  }

  async release(lock: LockHandle | string, token?: string): Promise<void> {
    if (!lock) return;

    let key: string;
    let expectedToken = token;

    if (typeof lock === 'object') {
      key = lock.key || this.keyGenerator(lock.name);
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

    let current: LockInfo | null;
    try {
      current = await this.storage.get(key);
    } catch {
      await tryFn(() => this.storage.delete(key));
      return;
    }

    if (!current) return;

    if (current.token !== expectedToken) {
      return;
    }

    await this.storage.delete(key);
  }

  async withLock<T>(
    lockName: string,
    options: AcquireOptions,
    callback: (lock: LockHandle) => Promise<T>
  ): Promise<T | null> {
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

  async isLocked(lockName: string): Promise<boolean> {
    const key = this.keyGenerator(lockName);

    let lock: LockInfo | null;
    try {
      lock = await this.storage.get(key);
    } catch {
      await tryFn(() => this.storage.delete(key));
      return false;
    }

    if (!isValidLockPayload(lock) || isExpiredLockPayload(lock, Date.now())) {
      if (lock) {
        await tryFn(() => this.storage.delete(key));
      }
      return false;
    }

    return true;
  }

  async getLockInfo(lockName: string): Promise<LockInfo | null> {
    const key = this.keyGenerator(lockName);

    let lock: LockInfo | null;
    try {
      lock = await this.storage.get(key);
    } catch {
      await tryFn(() => this.storage.delete(key));
      return null;
    }

    if (!isValidLockPayload(lock) || isExpiredLockPayload(lock, Date.now())) {
      if (lock) {
        await tryFn(() => this.storage.delete(key));
      }
      return null;
    }

    if (!('workerId' in lock)) {
      return {
        ...lock,
        workerId: 'unknown'
      };
    }

    return lock;
  }
}

export function createLockedFunction<T>(
  lock: DistributedLock,
  lockName: string,
  options: AcquireOptions = {}
): (callback: (lock: LockHandle) => Promise<T>) => Promise<T | null> {
  return async (callback) => lock.withLock(lockName, options, callback);
}

export default DistributedLock;
