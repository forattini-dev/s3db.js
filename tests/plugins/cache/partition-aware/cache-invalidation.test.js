import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/index.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Cache Invalidation', () => {
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

  test('should handle cache operations with insert', async () => {
    // Insert data
    await users.insert({
      name: 'Cache Test',
      email: 'cache@example.com',
      region: 'US',
      department: 'Test'
    });

    // Cache should work
    const count1 = await users.count();
    expect(count1).toBeGreaterThan(0);

    const count2 = await users.count();
    expect(count2).toBe(count1); // Should be cached
  });
});
