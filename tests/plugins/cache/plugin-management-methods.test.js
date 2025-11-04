import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { Cache, MemoryCache, S3Cache } from '../../../src/plugins/cache/index.js';
import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/partition-aware-filesystem-cache.class.js';

describe('Cache Plugin - Plugin Management Methods', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/cache');
    await database.connect();
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  let cachePlugin;

  beforeEach(async () => {
    cachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 60000
    });
    await cachePlugin.install(database);
  });

  test('should provide cache statistics', async () => {
    const stats = await cachePlugin.getCacheStats();

    expect(stats).toBeDefined();
    expect(stats.size).toBeGreaterThanOrEqual(0);
    expect(stats.keys).toBeDefined();
    expect(stats.driver).toBe('MemoryCache');
  });

  test('should clear all cache', async () => {
    await cachePlugin.clearAllCache();

    const stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBe(0);
  });

  test('should warm cache for resource', async () => {
    const users = await database.createResource({
      name: 'warm_users',
      attributes: {
        name: 'string|required'
      }
    });

    await users.insert({ name: 'Test User' });
    await cachePlugin.warmCache('warm_users');

    const stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should throw error when warming non-existent resource', async () => {
    // Should throw error for non-existent resource
    await expect(cachePlugin.warmCache('non-existent-resource')).rejects.toThrow(/Resource not found/);
  });

  test('should analyze cache usage when partition-aware', async () => {
    const tempDir = await createTemporaryPathForTest('cache-analysis');
    
    const partitionCachePlugin = new CachePlugin({
      driver: 'filesystem',
      partitionAware: true,
      trackUsage: true,
      config: {
        directory: tempDir
      }
    });
    await partitionCachePlugin.install(database);

    const analysis = await partitionCachePlugin.analyzeCacheUsage();
    expect(analysis).toBeDefined();
    expect(analysis.totalResources).toBeGreaterThanOrEqual(0);
    expect(analysis.resourceStats).toBeDefined();
    expect(analysis.summary).toBeDefined();
  });
    
});
