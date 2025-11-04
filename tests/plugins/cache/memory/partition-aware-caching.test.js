import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../../config.js';
import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';


describe('Cache Plugin - MemoryCache Driver - Partition-Aware Caching', () => {
  let db;
  let cachePlugin;
  let users;

  beforeEach(async () => {
    db = createDatabaseForTest('suite=plugins/cache-memory');
    await db.connect();

    cachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 60000,
      maxSize: 100,
    });
    await cachePlugin.install(db);

    users = await db.createResource({
      name: 'users',
      asyncPartitions: false,
      attributes: {
        name: 'string|required',
        email: 'string|required',
        department: 'string|required',
        region: 'string|required',
        status: 'string|required',
      },
      partitions: {
        byDepartment: { fields: { department: 'string' } },
        byRegion: { fields: { region: 'string' } },
      },
    });
  });

  afterEach(async () => {
    if (cachePlugin && cachePlugin.driver) {
      await cachePlugin.clearAllCache();
    }
    if (db) {
      await db.disconnect();
    }
  });

  beforeEach(async () => {
    await users.insertMany([
      { name: 'US Engineer 1', email: 'use1@example.com', department: 'Engineering', region: 'US', status: 'active' },
      { name: 'US Engineer 2', email: 'use2@example.com', department: 'Engineering', region: 'US', status: 'active' },
      { name: 'EU Engineer 1', email: 'eue1@example.com', department: 'Engineering', region: 'EU', status: 'active' },
      { name: 'US Sales 1', email: 'uss1@example.com', department: 'Sales', region: 'US', status: 'active' }
    ]);
    // Small delay to ensure partition indexes are ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test('should cache partition-specific count queries', async () => {
    // Cache Engineering department count
    const engCount1 = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(engCount1).toBe(3);

    // Should hit cache
    const engCount2 = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(engCount2).toBe(3);

    // Different partition should be separate cache entry
    const salesCount = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Sales' }
    });
    expect(salesCount).toBe(1);
  });

  test('should cache partition-specific list queries', async () => {
    // Cache US region users
    const usUsers1 = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usUsers1).toHaveLength(3);
    expect(usUsers1.every(u => u.region === 'US')).toBe(true);

    // Should hit cache
    const usUsers2 = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usUsers2).toEqual(usUsers1);

    // Different partition
    const euUsers = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'EU' }
    });
    expect(euUsers).toHaveLength(1);
    expect(euUsers[0].region).toBe('EU');
  });

  test('should cache partition-specific page queries', async () => {
    const page1 = await users.page({
      offset: 0,
      size: 2,
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(page1.items).toHaveLength(2);

    const page2 = await users.page({
      offset: 0,
      size: 2,
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(page2.items).toEqual(page1.items);
  });
});
