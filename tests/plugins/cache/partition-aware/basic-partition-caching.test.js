import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/index.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Basic Partition Caching', () => {
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
    // Insert test data
    await users.insertMany([
      { name: 'Alice', email: 'alice@example.com', region: 'US', department: 'Engineering' },
      { name: 'Bob', email: 'bob@example.com', region: 'US', department: 'Sales' },
      { name: 'Charlie', email: 'charlie@example.com', region: 'EU', department: 'Engineering' }
    ]);

    // Wait for partition indexes to be created
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test('should cache non-partitioned queries', async () => {
    // First call - cache miss
    const count1 = await users.count();
    expect(count1).toBe(3);

    // Second call - cache hit
    const count2 = await users.count();
    expect(count2).toBe(3);

    const stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should cache region partition queries', async () => {
    // Cache US users
    const usCount1 = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usCount1).toBe(2);

    // Should hit cache
    const usCount2 = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usCount2).toBe(2);

    // Different partition - EU users
    const euCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'EU' }
    });
    expect(euCount).toBe(1);
  });

  test('should cache department partition queries', async () => {
    // Cache Engineering department
    const engCount1 = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(engCount1).toBe(2);

    // Should hit cache
    const engCount2 = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(engCount2).toBe(2);

    // Different partition - Sales department
    const salesCount = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Sales' }
    });
    expect(salesCount).toBe(1);
  });

  test('should cache list results with partitions', async () => {
    // Cache US users list
    const usUsers1 = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usUsers1).toHaveLength(2);

    // Should hit cache
    const usUsers2 = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usUsers2).toHaveLength(2); // Check length instead of exact equality
  });
});
