import { beforeEach, describe, expect, test } from '@jest/globals';

import { setupPartitionAwareCacheSuite } from '../helpers.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Cache Invalidation', () => {
  const ctx = setupPartitionAwareCacheSuite();

  beforeEach(async () => {
    await ctx.seedUsers();
  });

  test('invalidates partition caches when data is inserted', async () => {
    const users = ctx.resource;

    await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    await users.insert({
      name: 'New US User',
      email: 'new-us@example.com',
      region: 'US',
      department: 'Support'
    });

    const refreshedCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    expect(refreshedCount).toBe(3);
  });

  test('invalidates partition cache when records move partitions', async () => {
    const users = ctx.resource;
    const [user] = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    await users.update(user.id, { region: 'EU' });

    const usCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    const euCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'EU' }
    });

    expect(usCount).toBe(1);
    expect(euCount).toBe(2);
  });

  test('clears all caches for deleteMany operations', async () => {
    const users = ctx.resource;

    await users.count();

    const ids = await users.listIds();
    await users.deleteMany(ids);

    const count = await users.count();
    expect(count).toBe(0);
  });
});

