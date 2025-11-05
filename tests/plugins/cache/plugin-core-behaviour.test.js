import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { createMemoryDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { FilesystemCache, MemoryCache, PartitionAwareFilesystemCache } from '../../../src/plugins/cache/index.js';

const RESOURCE_CONFIG = {
  name: 'users',
  attributes: {
    name: 'string|required'
  }
};

describe('CachePlugin core behaviour', () => {
  let database;

  beforeEach(async () => {
    database = createMemoryDatabaseForTest('suite=plugins/cache-core');
    await database.connect();
  });

  afterEach(async () => {
    await database.disconnect();
    database = null;
  });

  test('installs supported drivers and runs basic operations', async () => {
    const tempDir = await createTemporaryPathForTest('cache-plugin-core');

    const drivers = [
      {
        name: 'memory',
        setup: () => new CachePlugin({ driver: 'memory' }),
        expected: MemoryCache
      },
      {
        name: 'filesystem',
        setup: () => new CachePlugin({ driver: 'filesystem', config: { directory: tempDir } }),
        expected: FilesystemCache
      },
      {
        name: 'partition-aware',
        setup: () => new CachePlugin({
          driver: 'filesystem',
          partitionAware: true,
          trackUsage: true,
          config: { directory: tempDir }
        }),
        expected: PartitionAwareFilesystemCache
      }
    ];

    for (const driver of drivers) {
      const plugin = driver.setup();
      await plugin.install(database);

      expect(plugin.driver).toBeInstanceOf(driver.expected);

      const resource = await database.createResource({ ...RESOURCE_CONFIG, name: `users_${driver.name}` });
      await resource.insert({ name: `User ${driver.name}` });

      await plugin.warmCache(resource.name).catch(() => {});
      const stats = await plugin.getCacheStats();
      expect(stats.driver).toContain('Cache');

      await plugin.clearAllCache();
      const cleared = await plugin.getCacheStats();
      expect(cleared.size).toBe(0);
    }
  });

  test('reports errors for unknown resources on warmCache', async () => {
    const plugin = new CachePlugin({ driver: 'memory' });
    await plugin.install(database);

    await expect(plugin.warmCache('missing-resource')).rejects.toThrow(/Resource not found/i);
  });

  test('analyzes cache usage for partition-aware drivers', async () => {
    const tempDir = await createTemporaryPathForTest('cache-plugin-analysis');

    const plugin = new CachePlugin({
      driver: 'filesystem',
      partitionAware: true,
      trackUsage: true,
      config: { directory: tempDir }
    });
    await plugin.install(database);

    const analysis = await plugin.analyzeCacheUsage();
    expect(analysis).toMatchObject({
      totalResources: expect.any(Number),
      resourceStats: expect.any(Object),
      summary: expect.any(Object)
    });
  });

  test('rejects install when database is missing', async () => {
    const plugin = new CachePlugin({ driver: 'memory' });
    await expect(plugin.install(null)).rejects.toThrow();
  });

  test('allows installing the same plugin multiple times on one database', async () => {
    const plugin = new CachePlugin({ driver: 'memory' });
    await plugin.install(database);
    await expect(plugin.install(database)).resolves.not.toThrow();
  });

  test('exposes resource cache namespace helpers', async () => {
    const plugin = new CachePlugin({ driver: 'memory' });
    await plugin.install(database);

    const resource = await database.createResource({ ...RESOURCE_CONFIG, name: 'users_namespace' });
    const inserted = await resource.insert({ name: 'Namespaced User' });

    const cacheNs = resource.cache;
    expect(cacheNs).toBeDefined();
    expect(cacheNs.driver).toBe(plugin.driver);
    expect(typeof resource.getCacheNamespace).toBe('function');
    expect(resource.getCacheNamespace()).toBe(cacheNs);

    // Warm specific item and page with force refresh
    await cacheNs.warmItem(inserted.id, { forceRefresh: true });
    await cacheNs.warmPage({ offset: 0, size: 5 }, { forceRefresh: true });

    const itemKey = await cacheNs.keyFor('get', { params: { id: inserted.id } });
    const pageKey = await cacheNs.keyFor('page', { params: { offset: 0, size: 5 } });

    const cachedItem = await cacheNs.get(itemKey);
    const cachedPage = await cacheNs.get(pageKey);

    expect(cachedItem).toBeDefined();
    expect(cachedPage).toBeDefined();

    // Invalidate by id and ensure entry is cleared
    await cacheNs.invalidate({ id: inserted.id });
    const afterInvalidation = await cacheNs.get(itemKey);
    expect(afterInvalidation === null || afterInvalidation === undefined).toBe(true);
  });
});
