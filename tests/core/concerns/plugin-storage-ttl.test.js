import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '#src/concerns/plugin-storage.js';

describe('PluginStorage - TTL Features', () => {
  let database, storage;

  beforeEach(async () => {
    database = createDatabaseForTest('plugin-storage-ttl-test');
    await database.connect();
    storage = new PluginStorage(database.client, 'test-plugin');
  });

  afterEach(async () => {
    await storage.deleteAll();
    await database.disconnect();
  });

  describe('TTL Support', () => {
    test('should set data with TTL', async () => {
      await storage.set('session', { user_id: 'user1' }, { ttl: 60 });

      const data = await storage.get('session');
      expect(data).toEqual({ user_id: 'user1' });
    });

    test('should return null for expired data', async () => {
      await storage.set('session', { user_id: 'user1' }, { ttl: 1 });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const data = await storage.get('session');
      expect(data).toBe(null);
    });

    test('should check if data is expired', async () => {
      await storage.set('session', { user_id: 'user1' }, { ttl: 1 });

      expect(await storage.isExpired('session')).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(await storage.isExpired('session')).toBe(true);
    });

    test('should get remaining TTL', async () => {
      await storage.set('session', { user_id: 'user1' }, { ttl: 60 });

      const ttl = await storage.getTTL('session');
      expect(ttl).toBeGreaterThan(55);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    test('should extend TTL with touch', async () => {
      await storage.set('session', { user_id: 'user1' }, { ttl: 2 });

      await new Promise(resolve => setTimeout(resolve, 1000));

      await storage.touch('session', 10);

      const ttl = await storage.getTTL('session');
      expect(ttl).toBeGreaterThan(8);
    });

    test('should check existence with has', async () => {
      await storage.set('session', { user_id: 'user1' }, { ttl: 60 });

      expect(await storage.has('session')).toBe(true);
      expect(await storage.has('nonexistent')).toBe(false);
    });
  });

  describe('Distributed Locks', () => {
    test('should acquire and release locks', async () => {
      const lock = await storage.acquireLock('task1', { ttl: 30 });
      expect(lock).toBeTruthy();
      expect(lock.workerId).toBe('unknown');

      await storage.releaseLock(lock);

      expect(await storage.isLocked('task1')).toBe(false);
    });

    test('should prevent double acquisition', async () => {
      const lock1 = await storage.acquireLock('task1', { ttl: 30, timeout: 0 });
      expect(lock1).toBeTruthy();

      const lock2 = await storage.acquireLock('task1', { ttl: 30, timeout: 0 });
      expect(lock2).toBe(null);

      if (lock1) {
        await storage.releaseLock(lock1);
      }
    });

    test('should auto-release locks after TTL', async () => {
      await storage.acquireLock('task1', { ttl: 1 });

      expect(await storage.isLocked('task1')).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(await storage.isLocked('task1')).toBe(false);
    });

    test('should support custom workerId', async () => {
      const lock = await storage.acquireLock('task1', {
        ttl: 30,
        workerId: 'worker-123'
      });

      expect(lock.workerId).toBe('worker-123');

      if (lock) {
        await storage.releaseLock(lock);
      }
    });

    test('should retry with timeout', async () => {
      const lock1 = await storage.acquireLock('task1', { ttl: 1, timeout: 0 });
      expect(lock1).toBeTruthy();

      // This should wait and succeed after TTL expires
      const lock2 = await storage.acquireLock('task1', { ttl: 30, timeout: 2000 });
      expect(lock2).toBeTruthy();

      if (lock2) {
        await storage.releaseLock(lock2);
      } else if (lock1) {
        await storage.releaseLock(lock1);
      }
    });
  });

  describe('Counter Methods', () => {
    test('should increment counter', async () => {
      await storage.set('counter', { value: 0 });

      await storage.increment('counter', 5);
      await storage.increment('counter', 3);

      const counter = await storage.get('counter');
      expect(counter.value).toBe(8);
    });

    test('should decrement counter', async () => {
      await storage.set('counter', { value: 10 });

      await storage.decrement('counter', 3);
      await storage.decrement('counter', 2);

      const counter = await storage.get('counter');
      expect(counter.value).toBe(5);
    });

    test('should increment from zero if not exists', async () => {
      await storage.increment('counter', 5);

      const counter = await storage.get('counter');
      expect(counter.value).toBe(5);
    });

    test('should support increment with TTL', async () => {
      await storage.increment('hourly-count', 1, { ttl: 60 });

      const counter = await storage.get('hourly-count');
      expect(counter.value).toBe(1);

      const ttl = await storage.getTTL('hourly-count');
      expect(ttl).toBeGreaterThan(55);
    });
  });

  // v13: Backward compatibility removed
  // describe('Backward Compatibility', () => {
  //   test('should support put() as alias for set()', async () => {
  //     await storage.put('config', { enabled: true });
  //
  //     const data = await storage.get('config');
  //     expect(data).toEqual({ enabled: true });
  //   });
  // });
});
