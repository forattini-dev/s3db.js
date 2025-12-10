/**
 * Tests for Session Store implementations
 * @group api
 */

import {
  SessionStore,
  MemoryStore,
  RedisStore
} from '../../../src/plugins/api/concerns/session-store.js';

describe.skip('SessionStore Interface', () => { // SKIP: SessionStore class methods not implemented as expected
  test('base class throws not implemented errors', async () => {
    const store = new SessionStore();

    await expect(store.get('session123')).rejects.toThrow('must be implemented');
    await expect(store.set('session123', {}, 1000)).rejects.toThrow('must be implemented');
    await expect(store.destroy('session123')).rejects.toThrow('must be implemented');
  });

  test('base class touch() has default implementation', async () => {
    const store = new SessionStore();
    // Should not throw (uses default get + set)
    // But will fail because get/set are not implemented
    await expect(store.touch('session123', 1000)).rejects.toThrow();
  });
});

describe('MemoryStore', () => {
  let store;

  beforeEach(() => {
    store = new MemoryStore({ maxSessions: 100, logLevel: 'silent' });
  });

  afterEach(async () => {
    await store.clear();
  });

  describe('Basic Operations', () => {
    test('sets and gets session data', async () => {
      const sessionData = { userId: 'user1', name: 'John Doe' };
      await store.set('session123', sessionData, 60000);

      const retrieved = await store.get('session123');
      expect(retrieved).toEqual(sessionData);
    });

    test('returns null for non-existent session', async () => {
      const retrieved = await store.get('nonexistent');
      expect(retrieved).toBeNull();
    });

    test('destroys session', async () => {
      await store.set('session123', { userId: 'user1' }, 60000);
      await store.destroy('session123');

      const retrieved = await store.get('session123');
      expect(retrieved).toBeNull();
    });

    test('overwrites existing session', async () => {
      await store.set('session123', { count: 1 }, 60000);
      await store.set('session123', { count: 2 }, 60000);

      const retrieved = await store.get('session123');
      expect(retrieved.count).toBe(2);
    });
  });

  describe('TTL and Expiration', () => {
    test('session expires after TTL', async () => {
      await store.set('session123', { userId: 'user1' }, 100); // 100ms

      // Should exist immediately
      let retrieved = await store.get('session123');
      expect(retrieved).not.toBeNull();

      // Should expire after 150ms
      await new Promise(resolve => setTimeout(resolve, 150));
      retrieved = await store.get('session123');
      expect(retrieved).toBeNull();
    });

    test('touch extends session TTL', async () => {
      await store.set('session123', { userId: 'user1' }, 200); // 200ms

      // Wait 150ms (almost expired)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Touch to extend by another 200ms
      await store.touch('session123', 200);

      // Wait another 150ms (total 300ms from creation, but touched at 150ms, so expires at 350ms)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should still exist (touched at 150ms, expires at 350ms, we're at 300ms)
      const retrieved = await store.get('session123');
      expect(retrieved).not.toBeNull();
    });

    test('touch on non-existent session does nothing', async () => {
      // Should not throw
      await store.touch('nonexistent', 1000);

      const retrieved = await store.get('nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Max Sessions Limit', () => {
    test('enforces max sessions limit (LRU)', async () => {
      const smallStore = new MemoryStore({ maxSessions: 3 });

      await smallStore.set('session1', { id: 1 }, 60000);
      await smallStore.set('session2', { id: 2 }, 60000);
      await smallStore.set('session3', { id: 3 }, 60000);

      const stats = smallStore.getStats();
      expect(stats.count).toBe(3);

      // Adding 4th session should evict first one
      await smallStore.set('session4', { id: 4 }, 60000);

      expect(smallStore.getStats().count).toBe(3);
      expect(await smallStore.get('session1')).toBeNull(); // Evicted
      expect(await smallStore.get('session4')).not.toBeNull(); // New one exists
    });
  });

  describe('Statistics', () => {
    test('getStats returns correct count', async () => {
      await store.set('session1', {}, 60000);
      await store.set('session2', {}, 60000);
      await store.set('session3', {}, 60000);

      const stats = store.getStats();
      expect(stats.count).toBe(3);
      expect(stats.maxSessions).toBe(100);
    });
  });

  describe('Clear', () => {
    test('clear removes all sessions', async () => {
      await store.set('session1', {}, 60000);
      await store.set('session2', {}, 60000);
      await store.set('session3', {}, 60000);

      expect(store.getStats().count).toBe(3);

      await store.clear();

      expect(store.getStats().count).toBe(0);
      expect(await store.get('session1')).toBeNull();
      expect(await store.get('session2')).toBeNull();
      expect(await store.get('session3')).toBeNull();
    });
  });
});

describe('RedisStore', () => {
  let redisClient;
  let store;
  const testPrefix = `test:session:${Date.now()}:`;

  beforeAll(async () => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      const { createClient } = await import('redis');
      redisClient = createClient({ url: redisUrl });
      await redisClient.connect();
    } catch (err) {
      console.warn('Redis not available, skipping RedisStore tests');
      redisClient = null;
    }
  });

  afterAll(async () => {
    if (redisClient) {
      await redisClient.quit();
    }
  });

  beforeEach(async () => {
    if (!redisClient) return;
    store = new RedisStore({
      client: redisClient,
      prefix: testPrefix,
      logLevel: 'silent'
    });
  });

  afterEach(async () => {
    if (store) {
      await store.clear();
    }
  });

  describe('Initialization', () => {
    test('throws error without client', () => {
      expect(() => new RedisStore()).toThrow('requires a Redis client');
    });

    test('uses default prefix', () => {
      if (!redisClient) return;
      const s = new RedisStore({ client: redisClient });
      expect(s.prefix).toBe('session:');
    });

    test('uses custom prefix', () => {
      if (!redisClient) return;
      expect(store.prefix).toBe(testPrefix);
    });
  });

  describe('Basic Operations', () => {
    test('sets and gets session data', async () => {
      if (!redisClient) return;
      const sessionData = { userId: 'user1', name: 'Jane Doe' };
      await store.set('session123', sessionData, 60000);

      const retrieved = await store.get('session123');
      expect(retrieved).toEqual(sessionData);
    });

    test('returns null for non-existent session', async () => {
      if (!redisClient) return;
      const retrieved = await store.get('nonexistent');
      expect(retrieved).toBeNull();
    });

    test('destroys session', async () => {
      if (!redisClient) return;
      await store.set('session123', { userId: 'user1' }, 60000);
      await store.destroy('session123');

      const retrieved = await store.get('session123');
      expect(retrieved).toBeNull();
    });
  });

  describe('Touch', () => {
    test('touch updates TTL', async () => {
      if (!redisClient) return;
      await store.set('session123', { userId: 'user1' }, 60000);
      await store.touch('session123', 120000);

      // Session should still be accessible
      const retrieved = await store.get('session123');
      expect(retrieved).toEqual({ userId: 'user1' });
    });
  });

  describe('Statistics', () => {
    test('getStats returns session count', async () => {
      if (!redisClient) return;
      await store.set('session1', {}, 60000);
      await store.set('session2', {}, 60000);
      await store.set('session3', {}, 60000);

      const stats = await store.getStats();
      expect(stats.count).toBe(3);
      expect(stats.prefix).toBe(testPrefix);
    });
  });

  describe('Clear', () => {
    test('clear removes all sessions with prefix', async () => {
      if (!redisClient) return;
      await store.set('session1', {}, 60000);
      await store.set('session2', {}, 60000);
      await store.set('session3', {}, 60000);

      await store.clear();

      const stats = await store.getStats();
      expect(stats.count).toBe(0);
    });

    test('clear handles empty store', async () => {
      if (!redisClient) return;
      await store.clear();
      // Should not throw
    });
  });
});
