import { PluginStorage } from '../../concerns/plugin-storage.js';

export interface LockResult {
  acquired: boolean;
  lockId?: string;
  expiresAt?: number;
  error?: Error;
}

export interface LockData {
  lockId: string;
  holderId: string;
  acquiredAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30000;
const DEFAULT_NAMESPACE = 'default';

export class S3Mutex {
  protected storage: PluginStorage;
  protected namespace: string;
  protected holderId: string;

  constructor(storage: PluginStorage, namespace?: string) {
    if (!storage) {
      throw new Error('S3Mutex: storage is required');
    }
    this.storage = storage;
    this.namespace = namespace || DEFAULT_NAMESPACE;
    this.holderId = this._generateHolderId();
  }

  async lock(key: string, ttlMs: number = DEFAULT_TTL_MS): Promise<LockResult> {
    return this.tryLock(key, ttlMs);
  }

  async tryLock(key: string, ttlMs: number = DEFAULT_TTL_MS): Promise<LockResult> {
    if (!key) {
      return {
        acquired: false,
        error: new Error('S3Mutex: key is required')
      };
    }

    const lockKey = this._getLockKey(key);
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const lockId = this._generateLockId();

    const lockData: LockData = {
      lockId,
      holderId: this.holderId,
      acquiredAt: now,
      expiresAt
    };

    const version = await this.storage.setIfNotExists(
      lockKey,
      lockData as unknown as Record<string, unknown>,
      { ttl: Math.ceil(ttlMs / 1000) + 60, behavior: 'body-only' }
    );

    if (version !== null) {
      return {
        acquired: true,
        lockId,
        expiresAt
      };
    }

    const existingResult = await this.storage.getWithVersion(lockKey);

    if (!existingResult.data) {
      return {
        acquired: false,
        error: new Error('Lock exists but could not be read')
      };
    }

    const existingLock = existingResult.data as unknown as LockData;

    if (existingLock.expiresAt <= now) {
      const newVersion = await this.storage.setIfVersion(
        lockKey,
        lockData as unknown as Record<string, unknown>,
        existingResult.version!,
        { ttl: Math.ceil(ttlMs / 1000) + 60, behavior: 'body-only' }
      );

      if (newVersion !== null) {
        return {
          acquired: true,
          lockId,
          expiresAt
        };
      }

      return {
        acquired: false,
        error: new Error('Lock was taken by another process during expired lock takeover')
      };
    }

    return {
      acquired: false,
      error: new Error(`Lock is held by ${existingLock.holderId} until ${new Date(existingLock.expiresAt).toISOString()}`)
    };
  }

  async unlock(key: string, lockId: string): Promise<boolean> {
    if (!key || !lockId) {
      return false;
    }

    const lockKey = this._getLockKey(key);

    const result = await this.storage.getWithVersion(lockKey);

    if (!result.data || !result.version) {
      return false;
    }

    const existingLock = result.data as unknown as LockData;

    if (existingLock.lockId !== lockId) {
      return false;
    }

    return await this.storage.deleteIfVersion(lockKey, result.version);
  }

  async isLocked(key: string): Promise<boolean> {
    if (!key) {
      return false;
    }

    const lockKey = this._getLockKey(key);
    const result = await this.storage.getWithVersion(lockKey);

    if (!result.data) {
      return false;
    }

    const lockData = result.data as unknown as LockData;
    const now = Date.now();

    return lockData.expiresAt > now;
  }

  async extend(key: string, lockId: string, ttlMs: number): Promise<boolean> {
    if (!key || !lockId || ttlMs <= 0) {
      return false;
    }

    const lockKey = this._getLockKey(key);
    const result = await this.storage.getWithVersion(lockKey);

    if (!result.data || !result.version) {
      return false;
    }

    const existingLock = result.data as unknown as LockData;
    const now = Date.now();

    if (existingLock.lockId !== lockId) {
      return false;
    }

    if (existingLock.expiresAt <= now) {
      return false;
    }

    const newExpiresAt = now + ttlMs;
    const updatedLock: LockData = {
      ...existingLock,
      expiresAt: newExpiresAt
    };

    const newVersion = await this.storage.setIfVersion(
      lockKey,
      updatedLock as unknown as Record<string, unknown>,
      result.version,
      { ttl: Math.ceil(ttlMs / 1000) + 60, behavior: 'body-only' }
    );

    return newVersion !== null;
  }

  async getLockInfo(key: string): Promise<LockData | null> {
    if (!key) {
      return null;
    }

    const lockKey = this._getLockKey(key);
    const result = await this.storage.getWithVersion(lockKey);

    if (!result.data) {
      return null;
    }

    return result.data as unknown as LockData;
  }

  protected _getLockKey(key: string): string {
    return this.storage.getPluginKey(null, 'locks', `namespace=${this.namespace}`, `${key}.json`);
  }

  protected _generateLockId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `lock-${this.holderId}-${timestamp}-${random}`;
  }

  protected _generateHolderId(): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.POD_NAME) {
        return `holder-${process.env.POD_NAME}`;
      }
      if (process.env.HOSTNAME) {
        return `holder-${process.env.HOSTNAME}`;
      }
    }
    return `holder-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export default S3Mutex;
