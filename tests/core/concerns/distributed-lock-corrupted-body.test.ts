import { describe, test, expect } from 'vitest';
import { DistributedLock, isValidLockPayload, isExpiredLockPayload } from '#src/concerns/distributed-lock.js';
import type { StorageAdapter, LockInfo } from '#src/concerns/distributed-lock.js';

function createMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    get: async () => null,
    set: async () => ({ ETag: '"mock-etag"' }),
    delete: async () => {},
    ...overrides
  };
}

describe('DistributedLock - corrupted body handling', () => {
  describe('release()', () => {
    test('should not throw when storage.get() throws (corrupted body)', async () => {
      const deleted: string[] = [];
      const storage = createMockStorage({
        get: async () => { throw new Error('Failed to parse JSON body'); },
        delete: async (key) => { deleted.push(key); }
      });

      const lock = new DistributedLock(storage);
      const handle = {
        name: 'test-lock',
        key: 'locks/test-lock',
        token: 'abc123',
        workerId: 'w1',
        expiresAt: Date.now() + 30000,
        etag: null
      };

      await expect(lock.release(handle)).resolves.toBeUndefined();
      expect(deleted).toContain('locks/test-lock');
    });

    test('should still verify token when body is readable', async () => {
      const deleted: string[] = [];
      const storage = createMockStorage({
        get: async (): Promise<LockInfo> => ({
          token: 'different-token',
          acquiredAt: Date.now(),
          _expiresAt: Date.now() + 30000
        }),
        delete: async (key) => { deleted.push(key); }
      });

      const lock = new DistributedLock(storage);
      await lock.release({ name: 'x', key: 'locks/x', token: 'my-token', workerId: 'w1', expiresAt: 0, etag: null });

      expect(deleted).toHaveLength(0);
    });

    test('should delete when token matches', async () => {
      const deleted: string[] = [];
      const storage = createMockStorage({
        get: async (): Promise<LockInfo> => ({
          token: 'my-token',
          acquiredAt: Date.now(),
          _expiresAt: Date.now() + 30000
        }),
        delete: async (key) => { deleted.push(key); }
      });

      const lock = new DistributedLock(storage);
      await lock.release({ name: 'x', key: 'locks/x', token: 'my-token', workerId: 'w1', expiresAt: 0, etag: null });

      expect(deleted).toContain('locks/x');
    });
  });

  describe('acquire()', () => {
    test('should clean up and retry when storage.get() throws during contention', async () => {
      let getCalls = 0;
      const deleted: string[] = [];

      const storage = createMockStorage({
        set: async (_key, _data, options) => {
          if (options?.ifNoneMatch === '*' && getCalls < 1) {
            const err = new Error('PreconditionFailed') as any;
            err.code = 'PreconditionFailed';
            throw err;
          }
          return { ETag: '"acquired"' };
        },
        get: async () => {
          getCalls++;
          if (getCalls === 1) {
            throw new Error('Failed to parse JSON body');
          }
          return null;
        },
        delete: async (key) => { deleted.push(key); }
      });

      const lock = new DistributedLock(storage);
      const handle = await lock.acquire('test', { timeout: 5000, retryDelay: 10 });

      expect(handle).not.toBeNull();
      expect(handle!.name).toBe('test');
      expect(deleted.length).toBeGreaterThanOrEqual(1);
    });

    test('should return null on timeout even with corrupted bodies', async () => {
      const storage = createMockStorage({
        set: async (_key, _data, options) => {
          if (options?.ifNoneMatch === '*') {
            const err = new Error('PreconditionFailed') as any;
            err.code = 'PreconditionFailed';
            throw err;
          }
          return { ETag: '"x"' };
        },
        get: async () => { throw new Error('Failed to parse JSON body'); },
        delete: async () => {}
      });

      const lock = new DistributedLock(storage);
      const handle = await lock.acquire('test', { timeout: 50, retryDelay: 10 });

      expect(handle).toBeNull();
    });
  });

  describe('isLocked()', () => {
    test('should return false when storage.get() throws (corrupted body)', async () => {
      const deleted: string[] = [];
      const storage = createMockStorage({
        get: async () => { throw new Error('Failed to parse JSON body'); },
        delete: async (key) => { deleted.push(key); }
      });

      const lock = new DistributedLock(storage);
      const result = await lock.isLocked('test-lock');

      expect(result).toBe(false);
      expect(deleted).toContain('locks/test-lock');
    });
  });

  describe('getLockInfo()', () => {
    test('should return null when storage.get() throws (corrupted body)', async () => {
      const deleted: string[] = [];
      const storage = createMockStorage({
        get: async () => { throw new Error('Failed to parse JSON body'); },
        delete: async (key) => { deleted.push(key); }
      });

      const lock = new DistributedLock(storage);
      const result = await lock.getLockInfo('test-lock');

      expect(result).toBeNull();
      expect(deleted).toContain('locks/test-lock');
    });
  });

  describe('helper functions', () => {
    test('isValidLockPayload rejects non-objects', () => {
      expect(isValidLockPayload(null)).toBe(false);
      expect(isValidLockPayload(undefined)).toBe(false);
      expect(isValidLockPayload('string')).toBe(false);
    });

    test('isExpiredLockPayload detects expired locks', () => {
      const expired: LockInfo = { token: 'a', acquiredAt: 1000, _expiresAt: 2000 };
      expect(isExpiredLockPayload(expired, 3000)).toBe(true);
      expect(isExpiredLockPayload(expired, 1500)).toBe(false);
    });
  });
});
