import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/index.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Statistics and Management', () => {
  let db;
  let cachePlugin;
  let users;
  let testDir;

  beforeAll(async () => {
    testDir = await createTemporaryPathForTest('cache-partition-aware-simple');
  });

  afterAll(async () => {
    // Cleanup done in tests if necessary
  });

  beforeEach(async () => {
    db = createDatabaseForTest('suite=plugins/cache-partition-aware');
    await db.connect();

    cachePlugin = new CachePlugin({
      driver: 'filesystem',
      partitionAware: true,
      partitionStrategy: 'hierarchical',
      trackUsage: true,
      config: {
        directory: testDir,
        enableStats: true
      }
    });
    await cachePlugin.install(db);

    users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        region: 'string|required',
        department: 'string|required'
      },
      partitions: {
        byRegion: { fields: { region: 'string' } },
        byDepartment: { fields: { department: 'string' } }
      }
    });
  });

  afterEach(async () => {
    if (cachePlugin && cachePlugin.driver) {
      await cachePlugin.clearAllCache().catch(() => {});
    }
    if (db) {
      await db.disconnect();
    }
  });

  beforeEach(async () => {
    await users.insert({ name: 'Stats User', email: 'stats@example.com', region: 'US', department: 'Analytics' });
  });

  test('should provide cache statistics', async () => {
    // Generate cache entries
    await users.count();
    await users.count({ partition: 'byRegion', partitionValues: { region: 'US' } });

    const stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.driver).toBe('PartitionAwareFilesystemCache');
    expect(Array.isArray(stats.keys)).toBe(true);
  });

  test('should clear all cache', async () => {
    // Generate cache entries
    await users.count();
    await users.list({ partition: 'byRegion', partitionValues: { region: 'US' } });

    let stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);

    // Clear all cache
    await cachePlugin.clearAllCache();

    stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBe(0);
  });

  test('should handle cache warming', async () => {
    // Clear any existing cache
    await cachePlugin.clearAllCache();

    let stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBe(0);

    // Generate cache by using the resource
    await users.count();

    // Cache should be populated
    stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should expose partition stats and recommendations via resource helpers', async () => {
    await users.count({ partition: 'byRegion', partitionValues: { region: 'US' } });
    await users.count({ partition: 'byDepartment', partitionValues: { department: 'Engineering' } });

    const partitionStats = await users.getPartitionCacheStats('byRegion');
    expect(partitionStats).toBeDefined();
    expect(partitionStats.totalFiles).toBeGreaterThanOrEqual(0);

    const recommendations = await users.getCacheRecommendations();
    expect(Array.isArray(recommendations)).toBe(true);

    const warmed = await users.warmPartitionCache(['byRegion']);
    expect(typeof warmed).toBe('number');
  });
});
