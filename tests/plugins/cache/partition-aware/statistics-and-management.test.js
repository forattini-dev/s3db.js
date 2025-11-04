import { beforeEach, describe, expect, test } from '@jest/globals';

import { PartitionAwareFilesystemCache } from '../../../../src/plugins/cache/index.js';
import { setupPartitionAwareCacheSuite } from '../helpers.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Statistics and Management', () => {
  const ctx = setupPartitionAwareCacheSuite({
    pluginOptions: {
      config: { enableStats: true }
    }
  });

  beforeEach(async () => {
    await ctx.seedUsers();
  });

  test('exposes cache statistics via plugin helper', async () => {
    await ctx.resource.count();
    await ctx.resource.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    const stats = await ctx.cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.driver).toBe('PartitionAwareFilesystemCache');
    expect(Array.isArray(stats.keys)).toBe(true);
    expect(stats.stats).toBeDefined();
  });

  test('clears all cache entries when requested', async () => {
    await ctx.resource.count();

    const warmStats = await ctx.cachePlugin.getCacheStats();
    expect(warmStats.size).toBeGreaterThan(0);

    await ctx.cachePlugin.clearAllCache();

    const clearedStats = await ctx.cachePlugin.getCacheStats();
    expect(clearedStats.size).toBe(0);
  });

  test('provides partition-level statistics and recommendations', async () => {
    const users = ctx.resource;

    await users.count({ partition: 'byRegion', partitionValues: { region: 'US' } });
    await users.count({ partition: 'byDepartment', partitionValues: { department: 'Engineering' } });

    const partitionStats = await users.getPartitionCacheStats('byRegion');
    expect(partitionStats).toBeDefined();
    expect(partitionStats.totalFiles).toBeGreaterThanOrEqual(0);

    const recommendations = await users.getCacheRecommendations();
    expect(Array.isArray(recommendations)).toBe(true);
  });

  test('allows direct partition management via driver helpers', async () => {
    const driver = ctx.cachePlugin.driver;
    expect(driver).toBeInstanceOf(PartitionAwareFilesystemCache);

    await ctx.resource.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    const cleared = await driver.clearPartition('users', 'byRegion', { region: 'US' });
    expect(cleared).toBe(true);

    const partitionStats = await driver.getPartitionStats('users');
    expect(partitionStats).toBeDefined();
    expect(partitionStats.totalSize).toBeGreaterThanOrEqual(0);

    const recommendations = await driver.getCacheRecommendations('users');
    expect(Array.isArray(recommendations)).toBe(true);
  });
});
