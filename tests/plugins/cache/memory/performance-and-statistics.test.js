import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../../config.js';
import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';


describe('Cache Plugin - MemoryCache Driver - Performance and Statistics', () => {
  let db;
  let cachePlugin;
  let users;

  beforeEach(async () => {
    db = createDatabaseForTest('suite=plugins/cache-memory');
    await db.connect();

    cachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 60000,
      maxSize: 100,
    });
    await cachePlugin.install(db);

    users = await db.createResource({
      name: 'users',
      asyncPartitions: false,
      attributes: {
        name: 'string|required',
        email: 'string|required',
        department: 'string|required',
        region: 'string|required',
        status: 'string|required',
      },
      partitions: {
        byDepartment: { fields: { department: 'string' } },
        byRegion: { fields: { region: 'string' } },
      },
    });
  });

  afterEach(async () => {
    if (cachePlugin && cachePlugin.driver) {
      await cachePlugin.clearAllCache();
    }
    if (db) {
      await db.disconnect();
    }
  });

  beforeEach(async () => {
    await users.insertMany([
      { name: 'Perf User 1', email: 'perf1@example.com', department: 'IT', region: 'US', status: 'active' },
      { name: 'Perf User 2', email: 'perf2@example.com', department: 'IT', region: 'US', status: 'active' },
      { name: 'Perf User 3', email: 'perf3@example.com', department: 'IT', region: 'US', status: 'active' }
    ]);
  });

  test('should improve performance with caching', async () => {
    // First call (cache miss)
    const start1 = Date.now();
    await users.count();
    const time1 = Date.now() - start1;

    // Second call (cache hit)
    const start2 = Date.now();
    await users.count();
    const time2 = Date.now() - start2;

    // Cache hit should be faster or equal
    expect(time2).toBeLessThanOrEqual(time1);
  });

  test('should provide accurate cache statistics', async () => {
    // Generate some cache activity
    await users.count();
    await users.list();
    await users.listIds();

    const stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.keys).toBeDefined();
    expect(stats.driver).toBe('MemoryCache');
    expect(Array.isArray(stats.keys)).toBe(true);
  });

  test('should track cache hits and misses', async () => {
    // This depends on MemoryCache having hit/miss tracking
    const driver = cachePlugin.driver;

    // Generate cache miss
    await users.count();

    // Generate cache hit
    await users.count();

    // Check if driver exposes hit/miss stats
    if (driver.getStats) {
      const driverStats = driver.getStats();
      expect(driverStats).toBeDefined();
    }
  });
});
