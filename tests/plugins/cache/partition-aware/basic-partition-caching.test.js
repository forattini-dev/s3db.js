import { beforeEach, describe, expect, test } from '@jest/globals';

import { setupPartitionAwareCacheSuite } from '../helpers.js';

const USERS = [
  { name: 'Alice', email: 'alice@example.com', region: 'US', department: 'Engineering' },
  { name: 'Bob', email: 'bob@example.com', region: 'US', department: 'Sales' },
  { name: 'Charlie', email: 'charlie@example.com', region: 'EU', department: 'Engineering' }
];

describe('Cache Plugin - PartitionAwareFilesystemCache - Basic Partition Caching', () => {
  const ctx = setupPartitionAwareCacheSuite();

  beforeEach(async () => {
    await ctx.seedUsers(USERS);
  });

  test('caches standard queries and partition queries independently', async () => {
    const users = ctx.resource;

    const baselineCount = await users.count();
    const cachedBaseline = await users.count();

    const usCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    const cachedUsCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    expect(baselineCount).toBe(3);
    expect(cachedBaseline).toBe(3);
    expect(usCount).toBe(2);
    expect(cachedUsCount).toBe(2);
  });

  test('caches partitioned lists and keeps results stable per partition', async () => {
    const users = ctx.resource;

    const initialList = await users.list({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    const cachedList = await users.list({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });

    expect(initialList).toHaveLength(2);
    expect(cachedList).toEqual(initialList);
  });
});

