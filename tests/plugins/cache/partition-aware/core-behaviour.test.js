import { beforeEach, describe, expect, test, jest } from '@jest/globals';

import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { PartitionAwareFilesystemCache } from '../../../../src/plugins/cache/index.js';
import { setupPartitionAwareCacheSuite } from '../helpers.js';

const ctx = setupPartitionAwareCacheSuite();

describe('Partition-aware filesystem cache', () => {
  test('installs filesystem driver with configured directory', () => {
    expect(ctx.cachePlugin.driver).toBeInstanceOf(PartitionAwareFilesystemCache);
    expect(ctx.cachePlugin.driver.directory).toBe(ctx.directory);
    expect(ctx.cachePlugin.database).toBe(ctx.db);
  });

  test('supports overriding driver options during install', async () => {
    const plugin = new CachePlugin({
      logLevel: 'silent',driver: 'filesystem',
      partitionAware: true,
      partitionStrategy: 'temporal',
      config: {
        directory: ctx.directory,
        enableStats: true
      }
    });

    await plugin.install(ctx.db);

    expect(plugin.driver.partitionStrategy).toBe('temporal');
    expect(plugin.driver.enableStats).toBe(true);
  });
});

describe('Partition caching behaviour', () => {
  beforeEach(async () => {
    await ctx.cachePlugin.clearAllCache().catch(() => {});
    await ctx.seedUsers();
  });

  test('caches global and partitioned queries independently', async () => {
    const users = ctx.resource;

    expect(await users.count()).toBe(3);
    expect(await users.count()).toBe(3);

    const usCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    const cachedUsCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    expect(usCount).toBe(2);
    expect(cachedUsCount).toBe(2);
  });

  test('keeps partitioned list results stable', async () => {
    const users = ctx.resource;

    const firstList = await users.list({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    const cachedList = await users.list({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });

    expect(firstList).toHaveLength(2);
    expect(cachedList.map(user => user.id)).toEqual(firstList.map(user => user.id));
  });

  test('handles empty partitions gracefully', async () => {
    const count = await ctx.resource.count({
      partition: 'byRegion',
      partitionValues: { region: 'APAC' }
    });
    const list = await ctx.resource.list({
      partition: 'byRegion',
      partitionValues: { region: 'APAC' }
    });

    expect(count).toBe(0);
    expect(list).toHaveLength(0);
  });
});

describe('Partition cache management and statistics', () => {
  beforeEach(async () => {
    await ctx.cachePlugin.clearAllCache().catch(() => {});
    await ctx.seedUsers();
  });

  test('exposes cache stats and clear operations via plugin', async () => {
    await ctx.resource.count();
    await ctx.resource.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    const warmStats = await ctx.cachePlugin.getCacheStats();
    expect(warmStats.size).toBeGreaterThan(0);
    expect(warmStats.driver).toBe('PartitionAwareFilesystemCache');

    await ctx.cachePlugin.clearAllCache();
    const clearedStats = await ctx.cachePlugin.getCacheStats();
    expect(clearedStats.size).toBe(0);
  });

  test('provides partition-level stats and driver helpers', async () => {
    const driver = ctx.cachePlugin.driver;

    await ctx.resource.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    const stats = await driver.getPartitionStats('users');
    expect(stats).toBeDefined();
    expect(stats.totalFiles).toBeGreaterThanOrEqual(0);

    const cleared = await driver.clearPartition('users', 'byRegion', { region: 'US' });
    expect(cleared).toBe(true);
  });
});

describe('Error handling', () => {
  beforeEach(async () => {
    await ctx.cachePlugin.clearAllCache().catch(() => {});
    await ctx.seedUsers();
  });

  test('falls back to fresh data when driver get fails', async () => {
    const users = ctx.resource;
    const driver = ctx.cachePlugin.driver;
    const originalGet = driver.get.bind(driver);

    driver.get = jest.fn().mockRejectedValue(new Error('Filesystem cache error'));

    const count = await users.count();
    expect(count).toBeGreaterThanOrEqual(0);

    driver.get = originalGet;
  });
});
