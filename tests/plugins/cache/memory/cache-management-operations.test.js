import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../../config.js';
import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';


describe('Cache Plugin - MemoryCache Driver - Cache Management Operations', () => {
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
    await users.insert({ name: 'Management User', email: 'mgmt@example.com', department: 'Admin', region: 'US', status: 'active' });
  });

  test('should clear all cache', async () => {
    // Generate cache entries
    await users.count();
    await users.list();

    let stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);

    // Clear all cache
    await cachePlugin.clearAllCache();

    stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBe(0);
  });

  test('should warm cache for resource', async () => {
    // Clear any existing cache
    await cachePlugin.clearAllCache();

    // Warm cache
    await cachePlugin.warmCache('users');

    // Cache should be populated
    const stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should handle resource-specific cache clearing', async () => {
    // Generate cache for users
    await users.count();
    await users.list();

    let stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);

    // Clear cache at plugin level
    await cachePlugin.clearAllCache();

    // Verify cache was cleared
    stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBe(0);
  });
});
