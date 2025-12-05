/**
 * Tests for Session Store implementations
 * @group api
 */

import {
  SessionStore,
  MemoryStore,
  RedisStore
} from '../../../src/plugins/api/concerns/session-store.js';

describe('SessionStore Interface', () => {
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
  let mockRedis;
  let store;
  let storage;
  let callLog;

  beforeEach(() => {
    // Mock Redis client (manual mocking without vi.fn())
    storage = new Map();
    callLog = [];

    const mockReject = {};

    mockRedis = {
      get: async (key) => {
        if (mockReject.get) {
          const err = mockReject.get;
          mockReject.get = null;
          throw err;
        }
        callLog.push({ method: 'get', key });
        return storage.get(key) || null;
      },
      setEx: async (key, ttl, value) => {
        if (mockReject.setEx) {
          const err = mockReject.setEx;
          mockReject.setEx = null;
          throw err;
        }
        callLog.push({ method: 'setEx', key, ttl, value });
        storage.set(key, value);
        return 'OK';
      },
      del: async (keys) => {
        if (mockReject.del) {
          const err = mockReject.del;
          mockReject.del = null;
          throw err;
        }
        // Handle both single key string and array of keys
        const keyArray = Array.isArray(keys) ? keys : [keys];
        callLog.push({ method: 'del', keys: keyArray });
        keyArray.forEach(key => storage.delete(key));
        return keyArray.length;
      },
      expire: async (key, ttl) => {
        if (mockReject.expire) {
          const err = mockReject.expire;
          mockReject.expire = null;
          throw err;
        }
        callLog.push({ method: 'expire', key, ttl });
        // Simplified: just check if key exists
        return storage.has(key) ? 1 : 0;
      },
      keys: async (pattern) => {
        if (mockReject.keys) {
          const err = mockReject.keys;
          mockReject.keys = null;
          throw err;
        }
        callLog.push({ method: 'keys', pattern });
        // Simplified pattern matching
        const prefix = pattern.replace('*', '');
        return Array.from(storage.keys()).filter(k => k.startsWith(prefix));
      },
      _storage: storage,  // For test inspection
      _callLog: callLog,  // For test assertions
      _mockReject: mockReject  // For injecting errors
    };

    store = new RedisStore({
      client: mockRedis,
      prefix: 'test:session:',
      logLevel: 'silent'
    });
  });

  describe('Initialization', () => {
    test('throws error without client', () => {
      expect(() => new RedisStore()).toThrow('requires a Redis client');
    });

    test('uses default prefix', () => {
      const s = new RedisStore({ client: mockRedis });
      expect(s.prefix).toBe('session:');
    });

    test('uses custom prefix', () => {
      expect(store.prefix).toBe('test:session:');
    });
  });

  describe('Basic Operations', () => {
    test('sets and gets session data', async () => {
      const sessionData = { userId: 'user1', name: 'Jane Doe' };
      await store.set('session123', sessionData, 60000);

      // Check setEx was called correctly
      const setExCall = callLog.find(c =>
        c.method === 'setEx' &&
        c.key === 'test:session:session123'
      );
      expect(setExCall).toBeDefined();
      expect(setExCall.ttl).toBe(60);  // 60000ms = 60s
      expect(setExCall.value).toBe(JSON.stringify(sessionData));

      const retrieved = await store.get('session123');
      expect(retrieved).toEqual(sessionData);
    });

    test('returns null for non-existent session', async () => {
      const retrieved = await store.get('nonexistent');
      expect(retrieved).toBeNull();
    });

    test('destroys session', async () => {
      await store.set('session123', { userId: 'user1' }, 60000);
      callLog.length = 0; // Clear previous calls

      await store.destroy('session123');

      // Check del was called correctly
      const delCall = callLog.find(c => c.method === 'del');
      expect(delCall).toBeDefined();
      expect(delCall.keys).toContain('test:session:session123');

      const retrieved = await store.get('session123');
      expect(retrieved).toBeNull();
    });
  });

  describe('Touch', () => {
    test('touch updates TTL', async () => {
      await store.set('session123', { userId: 'user1' }, 60000);
      callLog.length = 0; // Clear previous calls

      await store.touch('session123', 120000);

      // Check expire was called correctly
      const expireCall = callLog.find(c =>
        c.method === 'expire' &&
        c.key === 'test:session:session123'
      );
      expect(expireCall).toBeDefined();
      expect(expireCall.ttl).toBe(120);  // 120000ms = 120s
    });

    test('touch falls back to get+set on error', async () => {
      await store.set('session123', { userId: 'user1' }, 60000);
      callLog.length = 0; // Clear previous calls

      // Make expire throw error
      mockRedis._mockReject.expire = new Error('Redis error');

      // Touch should fall back to get + set
      await store.touch('session123', 120000);

      // Should have called get and setEx
      const getCall = callLog.find(c => c.method === 'get' && c.key === 'test:session:session123');
      const setExCall = callLog.find(c => c.method === 'setEx' && c.key === 'test:session:session123');
      expect(getCall).toBeDefined();
      expect(setExCall).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('get handles Redis errors gracefully', async () => {
      mockRedis._mockReject.get = new Error('Redis connection lost');

      const result = await store.get('session123');
      expect(result).toBeNull();
    });

    test('set propagates errors', async () => {
      mockRedis._mockReject.setEx = new Error('Redis write error');

      await expect(store.set('session123', {}, 60000)).rejects.toThrow('Redis write error');
    });

    test('destroy propagates errors', async () => {
      mockRedis._mockReject.del = new Error('Redis delete error');

      await expect(store.destroy('session123')).rejects.toThrow('Redis delete error');
    });
  });

  describe('Statistics', () => {
    test('getStats returns session count', async () => {
      await store.set('session1', {}, 60000);
      await store.set('session2', {}, 60000);
      await store.set('session3', {}, 60000);

      const stats = await store.getStats();
      expect(stats.count).toBe(3);
      expect(stats.prefix).toBe('test:session:');
    });

    test('getStats handles errors', async () => {
      mockRedis._mockReject.keys = new Error('Redis error');

      const stats = await store.getStats();
      expect(stats.count).toBe(0);
    });
  });

  describe('Clear', () => {
    test('clear removes all sessions with prefix', async () => {
      await store.set('session1', {}, 60000);
      await store.set('session2', {}, 60000);
      await store.set('session3', {}, 60000);

      callLog.length = 0; // Clear previous calls
      await store.clear();

      // Check del was called with all session keys
      const delCall = callLog.find(c => c.method === 'del');
      expect(delCall).toBeDefined();
      expect(delCall.keys).toEqual([
        'test:session:session1',
        'test:session:session2',
        'test:session:session3'
      ]);

      const stats = await store.getStats();
      expect(stats.count).toBe(0);
    });

    test('clear handles empty store', async () => {
      await store.clear();
      // Should not throw
    });

    test('clear handles errors gracefully', async () => {
      mockRedis._mockReject.keys = new Error('Redis error');

      // Should not throw
      await store.clear();
    });
  });
});
