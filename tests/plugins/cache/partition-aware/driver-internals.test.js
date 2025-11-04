import { describe, expect, test } from '@jest/globals';

import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/index.js';
import { setupPartitionAwareCacheSuite } from '../helpers.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Driver Internals', () => {
  const ctx = setupPartitionAwareCacheSuite();

  test('builds stable partition cache keys with parameters', () => {
    const driver = ctx.cachePlugin.driver;

    const keyWithParams = driver._getPartitionCacheKey(
      'users',
      'list',
      'byRegion',
      { region: 'US', zone: 'east' },
      { limit: 10, offset: 0 }
    );

    expect(keyWithParams).toContain('resource=users');
    expect(keyWithParams).toContain('partition=byRegion');
    expect(keyWithParams).toContain('region=US');
    expect(keyWithParams).toContain('action=list');
    expect(keyWithParams).toContain('params=');

    const keyWithoutPartition = driver._getPartitionCacheKey('users', 'list', null, {});
    expect(keyWithoutPartition).toContain('resource=users');
    expect(keyWithoutPartition).not.toContain('partition=');
  });

  test('derives partition directories for different strategies', () => {
    const hierarchicalDir = ctx.cachePlugin.driver._getPartitionDirectory('users', 'byRegion', { region: 'US' });
    expect(hierarchicalDir).toContain('resource=users');
    expect(hierarchicalDir).toContain('partition=byRegion');

    const temporalDriver = new PartitionAwareFilesystemCache({
      directory: ctx.directory,
      partitionStrategy: 'temporal'
    });
    const temporalDir = temporalDriver._getPartitionDirectory('events', 'byDate', { date: '2024-01-01' });
    expect(temporalDir).toContain('2024');

    const flatDriver = new PartitionAwareFilesystemCache({
      directory: ctx.directory,
      partitionStrategy: 'flat'
    });
    const flatDir = flatDriver._getPartitionDirectory('users', 'byRegion', { region: 'US' });
    expect(flatDir.endsWith('partitions')).toBe(true);
  });

  test('clears resource partitions in a single call', async () => {
    await ctx.seedUsers();

    const driver = ctx.cachePlugin.driver;

    await ctx.resource.count({ partition: 'byRegion', partitionValues: { region: 'US' } });
    await ctx.resource.count({ partition: 'byRegion', partitionValues: { region: 'EU' } });

    const result = await driver.clearResourcePartitions('users');
    expect(result).toBe(true);

    const stats = await driver.getPartitionStats('users');
    expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
  });

  test('persists and reloads usage statistics', async () => {
    const driver = ctx.cachePlugin.driver;

    driver.partitionUsage.set('users/byRegion', { count: 5, lastAccess: Date.now() });
    await driver._saveUsageStats();

    driver.partitionUsage.clear();
    await driver.loadUsageStats();

    expect(driver.partitionUsage.has('users/byRegion')).toBe(true);
  });

  test('creates usage keys and detects temporal partitions', () => {
    const driver = ctx.cachePlugin.driver;

    const usageKey = driver._getUsageKey('users', 'byRegion', { region: 'US' });
    expect(usageKey).toBe('users/byRegion/region=US');

    const temporalDriver = new PartitionAwareFilesystemCache({
      directory: ctx.directory,
      partitionStrategy: 'temporal'
    });

    expect(temporalDriver._isTemporalPartition('byDate', { date: '2024-01-01' })).toBe(true);
    expect(temporalDriver._isTemporalPartition('byRegion', { region: 'US' })).toBe(false);
  });
});
