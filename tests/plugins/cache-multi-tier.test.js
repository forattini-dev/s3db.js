import { jest } from '@jest/globals';
import MemoryCache from '../../src/plugins/cache/memory-cache.class.js';
import MultiTierCache from '../../src/plugins/cache/multi-tier-cache.class.js';

// Mock timer functions
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Simple mock cache for testing with TTL
class MockCache {
  constructor({ ttl = 0, name = 'MockCache' } = {}) {
    this.name = name;
    this.ttl = ttl;
    this.store = new Map();
    this.expiry = new Map();
  }

  async set(key, value) {
    this.store.set(key, value);
    if (this.ttl > 0) {
      this.expiry.set(key, Date.now() + this.ttl);
    }
    return true;
  }

  async get(key) {
    if (this.ttl > 0) {
      const expireTime = this.expiry.get(key);
      if (expireTime && Date.now() >= expireTime) {
        this.store.delete(key);
        this.expiry.delete(key);
        return null;
      }
    }
    return this.store.get(key) || null;
  }

  async del(key) {
    this.store.delete(key);
    this.expiry.delete(key);
    return true;
  }

  async clear() {
    this.store.clear();
    this.expiry.clear();
    return true;
  }

  async size() {
    return this.store.size;
  }

  async keys() {
    return Array.from(this.store.keys());
  }
}

describe('MultiTierCache', () => {
  describe('Constructor & Configuration', () => {
    test('should create multi-tier cache with 3 layers', () => {
      const l1 = new MockCache({ ttl: 100, name: 'L1' });
      const l2 = new MockCache({ ttl: 200, name: 'L2' });
      const l3 = new MockCache({ ttl: 500, name: 'L3' });

      const cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1-Memory' },
          { driver: l2, name: 'L2-Mock' },
          { driver: l3, name: 'L3-Mock' }
        ],
        promoteOnHit: true,
        strategy: 'write-through'
      });

      expect(cache.drivers).toHaveLength(3);
      expect(cache.drivers[0].name).toBe('L1-Memory');
      expect(cache.drivers[1].name).toBe('L2-Mock');
      expect(cache.drivers[2].name).toBe('L3-Mock');
    });

    test('should throw error if no drivers provided', () => {
      expect(() => {
        new MultiTierCache({ drivers: [] });
      }).toThrow('MultiTierCache requires at least one driver');
    });
  });

  describe('Cascade Flow - L1 → L2 → L3', () => {
    let cache, l1, l2, l3;

    beforeEach(() => {
      l1 = new MockCache({ ttl: 0, name: 'L1' });
      l2 = new MockCache({ ttl: 0, name: 'L2' });
      l3 = new MockCache({ ttl: 0, name: 'L3' });

      cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' },
          { driver: l3, name: 'L3' }
        ],
        promoteOnHit: true,
        strategy: 'write-through'
      });
    });

    test('should hit L1 immediately after write', async () => {
      await cache.set('key1', { value: 'data1' });
      const result = await cache.get('key1');

      expect(result).toEqual({ value: 'data1' });
      expect(cache.stats.tiers[0].hits).toBe(1);
    });

    test('should cascade to L2 when L1 is cleared', async () => {
      await cache.set('key1', { value: 'data1' });

      // Clear L1 to simulate expiration
      await l1.clear();

      const result = await cache.get('key1');

      expect(result).toEqual({ value: 'data1' });
      expect(cache.stats.tiers[0].misses).toBe(1);
      expect(cache.stats.tiers[1].hits).toBe(1);
    });

    test('should cascade to L3 when L1 and L2 are cleared', async () => {
      await cache.set('key1', { value: 'data1' });

      // Clear L1 and L2
      await l1.clear();
      await l2.clear();

      const result = await cache.get('key1');

      expect(result).toEqual({ value: 'data1' });
      expect(cache.stats.tiers[0].misses).toBe(1);
      expect(cache.stats.tiers[1].misses).toBe(1);
      expect(cache.stats.tiers[2].hits).toBe(1);
    });

    test('should return null when all tiers miss', async () => {
      const result = await cache.get('non-existent');

      expect(result).toBeNull();
      expect(cache.stats.tiers[0].misses).toBe(1);
      expect(cache.stats.tiers[1].misses).toBe(1);
      expect(cache.stats.tiers[2].misses).toBe(1);
    });
  });

  describe('TTL Expiration - Real Timing', () => {
    let cache, l1, l2, l3;

    beforeEach(() => {
      l1 = new MockCache({ ttl: 100, name: 'L1' }); // 100ms
      l2 = new MockCache({ ttl: 200, name: 'L2' }); // 200ms
      l3 = new MockCache({ ttl: 500, name: 'L3' }); // 500ms

      cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' },
          { driver: l3, name: 'L3' }
        ],
        promoteOnHit: false, // Disable for cleaner testing
        strategy: 'write-through'
      });
    });

    test('L1 expires after 100ms, should hit L2', async () => {
      await cache.set('key1', { value: 'data1' });

      // Immediate get hits L1
      let result = await cache.get('key1');
      expect(result).toEqual({ value: 'data1' });
      expect(cache.stats.tiers[0].hits).toBe(1);

      // Wait for L1 to expire
      await wait(150);

      // Should now hit L2
      result = await cache.get('key1');
      expect(result).toEqual({ value: 'data1' });
      expect(cache.stats.tiers[0].misses).toBe(1);
      expect(cache.stats.tiers[1].hits).toBe(1);
    });

    test('L1 and L2 expire after 200ms, should hit L3', async () => {
      await cache.set('key1', { value: 'data1' });

      // Wait for L1 and L2 to expire
      await wait(250);

      const result = await cache.get('key1');
      expect(result).toEqual({ value: 'data1' });
      expect(cache.stats.tiers[0].misses).toBe(1);
      expect(cache.stats.tiers[1].misses).toBe(1);
      expect(cache.stats.tiers[2].hits).toBe(1);
    });

    test('All tiers expire after 500ms, should return null', async () => {
      await cache.set('key1', { value: 'data1' });

      // Wait for all tiers to expire
      await wait(600);

      const result = await cache.get('key1');
      expect(result).toBeNull();
      expect(cache.stats.tiers[0].misses).toBe(1);
      expect(cache.stats.tiers[1].misses).toBe(1);
      expect(cache.stats.tiers[2].misses).toBe(1);
    });
  });

  describe('Auto-Promotion', () => {
    let cache, l1, l2, l3;

    beforeEach(() => {
      l1 = new MockCache({ ttl: 0, name: 'L1' });
      l2 = new MockCache({ ttl: 0, name: 'L2' });
      l3 = new MockCache({ ttl: 0, name: 'L3' });

      cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' },
          { driver: l3, name: 'L3' }
        ],
        promoteOnHit: true,
        strategy: 'write-through'
      });
    });

    test('L2 hit should promote to L1', async () => {
      await cache.set('key1', { value: 'data1' });
      await l1.clear();

      // Should hit L2 and promote to L1
      await cache.get('key1');

      // Next get should hit L1
      const result = await cache.get('key1');
      expect(result).toEqual({ value: 'data1' });
      expect(cache.stats.tiers[0].hits).toBe(1);
    });

    test('L3 hit should promote to L1 and L2', async () => {
      await cache.set('key1', { value: 'data1' });
      await l1.clear();
      await l2.clear();

      // Should hit L3 and promote to L1 and L2
      await cache.get('key1');

      // Check promotions happened
      expect(cache.stats.tiers[0].promotions).toBeGreaterThanOrEqual(1);
      expect(cache.stats.tiers[1].promotions).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Write Strategies', () => {
    test('write-through: writes to all tiers', async () => {
      const l1 = new MockCache({ name: 'L1' });
      const l2 = new MockCache({ name: 'L2' });

      const cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' }
        ],
        strategy: 'write-through'
      });

      await cache.set('key1', { value: 'data1' });

      // Both tiers should have the data
      expect(await l1.get('key1')).toEqual({ value: 'data1' });
      expect(await l2.get('key1')).toEqual({ value: 'data1' });
    });

    test('lazy-promotion: writes only to L1', async () => {
      const l1 = new MockCache({ name: 'L1' });
      const l2 = new MockCache({ name: 'L2' });

      const cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' }
        ],
        strategy: 'lazy-promotion'
      });

      await cache.set('key1', { value: 'data1' });

      // Only L1 should have the data
      expect(await l1.get('key1')).toEqual({ value: 'data1' });
      expect(await l2.get('key1')).toBeNull();
    });
  });

  describe('Delete and Clear', () => {
    test('should delete from all tiers', async () => {
      const l1 = new MockCache({ name: 'L1' });
      const l2 = new MockCache({ name: 'L2' });

      const cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' }
        ]
      });

      await cache.set('key1', { value: 'data1' });
      await cache.del('key1');

      expect(await l1.get('key1')).toBeNull();
      expect(await l2.get('key1')).toBeNull();
    });

    test('should clear all tiers', async () => {
      const l1 = new MockCache({ name: 'L1' });
      const l2 = new MockCache({ name: 'L2' });

      const cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' }
        ]
      });

      await cache.set('key1', { value: 'data1' });
      await cache.set('key2', { value: 'data2' });
      await cache.clear();

      expect(await l1.size()).toBe(0);
      expect(await l2.size()).toBe(0);
    });
  });

  describe('Statistics', () => {
    test('should track hits, misses, and promotions', async () => {
      const l1 = new MockCache({ name: 'L1' });
      const l2 = new MockCache({ name: 'L2' });

      const cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' }
        ],
        promoteOnHit: true
      });

      await cache.set('key1', { value: 'data1' });

      // L1 hit
      await cache.get('key1');

      // Clear L1, L2 hit with promotion
      await l1.clear();
      await cache.get('key1');

      const stats = cache.getStats();

      expect(stats.enabled).toBe(true);
      expect(stats.tiers[0].hits).toBe(1);
      expect(stats.tiers[1].hits).toBe(1);
      expect(stats.totals.hits).toBe(2);
    });

    test('should calculate hit rate', async () => {
      const l1 = new MockCache({ name: 'L1' });

      const cache = new MultiTierCache({
        drivers: [{ driver: l1, name: 'L1' }]
      });

      await cache.set('key1', { value: 'data1' });

      // 3 hits
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('key1');

      // 1 miss
      await cache.get('non-existent');

      const stats = cache.getStats();
      expect(stats.totals.hitRate).toBe(0.75); // 3/4 = 0.75
    });
  });

  describe('Error Handling', () => {
    test('should fallback to next tier on error', async () => {
      const l1 = new MockCache({ name: 'L1' });
      const l2 = new MockCache({ name: 'L2' });

      // Make L1 throw error
      jest.spyOn(l1, 'get').mockRejectedValueOnce(new Error('L1 error'));

      const cache = new MultiTierCache({
        drivers: [
          { driver: l1, name: 'L1' },
          { driver: l2, name: 'L2' }
        ],
        fallbackOnError: true
      });

      await cache.set('key1', { value: 'data1' });

      const result = await cache.get('key1');
      expect(result).toEqual({ value: 'data1' }); // Falls back to L2
      expect(cache.stats.tiers[0].errors).toBe(1);
    });
  });
});
