import { beforeEach, describe, expect, test } from '@jest/globals';

import { setupPartitionAwareCacheSuite } from '../helpers.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Error Handling', () => {
  const ctx = setupPartitionAwareCacheSuite();

  beforeEach(async () => {
    await ctx.seedUsers();
  });

  test('handles operations against empty partitions gracefully', async () => {
    const users = ctx.resource;

    const count = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'APAC' }
    });
    const list = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'APAC' }
    });

    expect(count).toBe(0);
    expect(list).toHaveLength(0);
  });

  test('falls back to fresh data when cache driver fails', async () => {
    const users = ctx.resource;
    const driver = ctx.cachePlugin.driver;
    const originalGet = driver.get.bind(driver);

    driver.get = async () => {
      throw new Error('Filesystem cache error');
    };

    const count = await users.count();
    expect(count).toBeGreaterThanOrEqual(0);

    driver.get = originalGet;
  });
});
