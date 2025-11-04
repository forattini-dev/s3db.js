import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/index.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Error Handling', () => {
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

  test('should handle basic operations', async () => {
    await users.insert({ name: 'Error Test', email: 'error@example.com', region: 'US', department: 'Test' });

    // Basic operations should work
    const count = await users.count();
    expect(count).toBe(1);

    const usersList = await users.list();
    expect(usersList).toHaveLength(1);
  });

  test('should handle partition queries without data', async () => {
    // Query empty partition
    const emptyCount = await users.count({
      partition: 'byRegion',
      partitionValues: { region: 'EMPTY' }
    });
    expect(emptyCount).toBe(0);

    const emptyList = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'EMPTY' }
    });
    expect(emptyList).toHaveLength(0);
  });
});
