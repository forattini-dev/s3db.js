import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../../config.js';
import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';


describe('Cache Plugin - MemoryCache Driver - Driver Setup and Configuration', () => {
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

  test('should initialize MemoryCache with correct configuration', () => {
    expect(cachePlugin.driver).toBeInstanceOf(MemoryCache);
    expect(cachePlugin.driver.ttl).toBe(60000);
    expect(cachePlugin.driver.maxSize).toBe(100);
  });

  test('should handle default configuration', async () => {
    const defaultCachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 300000
    });
    await defaultCachePlugin.install(db);

    expect(defaultCachePlugin.driver).toBeInstanceOf(MemoryCache);
    expect(defaultCachePlugin.driver.ttl).toBe(300000);
  });

  test('should handle custom maxSize configuration', async () => {
    const customCachePlugin = new CachePlugin({
      driver: 'memory',
      maxSize: 50
    });
    await customCachePlugin.install(db);

    expect(customCachePlugin.driver.maxSize).toBe(50);
  });
});
