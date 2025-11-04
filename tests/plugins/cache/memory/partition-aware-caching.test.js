import { beforeEach, describe, expect, test } from '@jest/globals';

import { setupMemoryCacheSuite } from '../helpers.js';

const PARTITIONED_USERS = [
  { name: 'US Engineer 1', email: 'use1@example.com', department: 'Engineering', region: 'US', status: 'active' },
  { name: 'US Engineer 2', email: 'use2@example.com', department: 'Engineering', region: 'US', status: 'active' },
  { name: 'EU Engineer 1', email: 'eue1@example.com', department: 'Engineering', region: 'EU', status: 'active' },
  { name: 'US Sales 1', email: 'uss1@example.com', department: 'Sales', region: 'US', status: 'active' }
];

describe('Cache Plugin - MemoryCache Driver - Partition-Aware Caching', () => {
  const ctx = setupMemoryCacheSuite();

  beforeEach(async () => {
    await ctx.seedUsers(PARTITIONED_USERS);
  });

  test('maintains separate cache entries per partition value', async () => {
    const users = ctx.resource;

    const engineeringCount = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    const cachedEngineering = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    const salesCount = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Sales' }
    });

    expect(engineeringCount).toBe(3);
    expect(cachedEngineering).toBe(3);
    expect(salesCount).toBe(1);
  });

  test('reuses cached lists for repeated partition queries', async () => {
    const users = ctx.resource;

    const usUsers = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    const cachedUsUsers = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    expect(usUsers).toHaveLength(3);
    expect(cachedUsUsers).toEqual(usUsers);
  });

  test('caches paginated partition results consistently', async () => {
    const users = ctx.resource;

    const firstPage = await users.page({
      offset: 0,
      size: 2,
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });

    const cachedPage = await users.page({
      offset: 0,
      size: 2,
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });

    expect(firstPage.items).toHaveLength(2);
    expect(cachedPage.items).toEqual(firstPage.items);
  });
});

