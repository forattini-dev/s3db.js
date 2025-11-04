import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { Cache, MemoryCache, S3Cache } from '../../../src/plugins/cache/index.js';
import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/partition-aware-filesystem-cache.class.js';

describe('Cache Plugin - Cross-Driver Compatibility', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/cache');
    await database.connect();
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should work consistently across different drivers', async () => {
    const tempDir = await createTemporaryPathForTest('compat-test');
    
    const drivers = [
      { type: 'memory', options: {} },
      { type: 'filesystem', options: { config: { directory: tempDir } } },
      { type: 's3', options: { config: { client: database.client } } }
    ];

    for (const driver of drivers) {
      const cachePlugin = new CachePlugin({
        driver: driver.type,
        ...driver.options
      });
      await cachePlugin.install(database);

      const users = await database.createResource({
        name: `compat_users_${driver.type}`,
        attributes: {
          name: 'string|required'
        }
      });

      await users.insert({ name: 'Test User' });

      // Test basic operations work
      const count = await users.count();
      expect(count).toBe(1);

      const stats = await cachePlugin.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.driver).toContain('Cache');
    }
  });
    
});
