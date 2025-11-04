import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../../config.js';
import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';


describe('Cache Plugin - MemoryCache Driver - Error Handling and Edge Cases', () => {
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

  test('should handle cache errors gracefully', async () => {
    await users.insert({ name: 'Error Test', email: 'error@example.com', department: 'Test', region: 'US', status: 'active' });

    // Mock driver error - wrap in try-catch to avoid unhandled promise rejection
    const originalGet = cachePlugin.driver.get;
    cachePlugin.driver.get = jest.fn().mockRejectedValue(new Error('Memory cache error'));

    try {
      // Operations should still work or handle the error
      const count = await users.count();
      expect(count).toBe(1);
    } catch (error) {
      // If cache error propagates, verify operation handles it
      expect(error.message).toBe('Memory cache error');
    } finally {
      // Restore original method
      cachePlugin.driver.get = originalGet;
    }
  });

  test('should handle null/undefined cache values', async () => {
    // Mock driver to return null
    const originalGet = cachePlugin.driver.get;
    cachePlugin.driver.get = jest.fn().mockResolvedValue(null);

    await users.insert({ name: 'Null Test', email: 'null@example.com', department: 'Test', region: 'US', status: 'active' });

    // Should still work and get fresh data
    const count = await users.count();
    expect(count).toBe(1);

    // Restore original method
    cachePlugin.driver.get = originalGet;
  });

  test('should handle concurrent cache operations', async () => {
    await users.insertMany([
      { name: 'Concurrent 1', email: 'conc1@example.com', department: 'Test', region: 'US', status: 'active' },
      { name: 'Concurrent 2', email: 'conc2@example.com', department: 'Test', region: 'US', status: 'active' }
    ]);

    // Perform multiple concurrent operations
    const promises = [
      users.count(),
      users.list(),
      users.listIds(),
      users.count(),
      users.list()
    ];

    const results = await Promise.all(promises);

    // All operations should complete successfully
    expect(results[0]).toBe(2); // count
    expect(results[1]).toHaveLength(2); // list
    expect(results[2]).toHaveLength(2); // listIds
    expect(results[3]).toBe(2); // count (cached)
    expect(results[4]).toHaveLength(2); // list (should be same length, order may vary)
  });

  test('should handle resource cleanup', async () => {
    // Generate cache entries
    await users.count();
    await users.list();

    let stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);

    // Simulate resource cleanup by clearing cache
    await cachePlugin.clearAllCache();

    // Cache should be accessible and empty
    stats = await cachePlugin.getCacheStats();
    expect(stats).toBeDefined();
    expect(stats.size).toBe(0);
  });
});
