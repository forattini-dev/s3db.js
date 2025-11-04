import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { Cache, MemoryCache, S3Cache } from '../../../src/plugins/cache/index.js';
import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/partition-aware-filesystem-cache.class.js';

describe('Cache Plugin - Configuration Validation', () => {
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

  test('should validate required filesystem options', async () => {
    const cachePlugin = new CachePlugin({
      driver: 'filesystem'
      // Missing filesystemOptions.directory
    });

    await expect(cachePlugin.install(database)).rejects.toThrow();
  });

  test('should use database client for S3 cache by default', async () => {
    const cachePlugin = new CachePlugin({
      driver: 's3'
      // No explicit client - should use database.client
    });
    await cachePlugin.install(database);

    expect(cachePlugin.driver).toBeInstanceOf(S3Cache);
    expect(cachePlugin.driver.client).toBe(database.client);
  });

  test('should use default TTL when not specified', async () => {
    const cachePlugin = new CachePlugin({
      driver: 'memory'
      // No TTL specified
    });
    await cachePlugin.install(database);

    expect(cachePlugin.driver.ttl).toBeDefined();
  });

  test('should validate partition-aware options', async () => {
    const tempDir = await createTemporaryPathForTest('partition-validation');
    
    const cachePlugin = new CachePlugin({
      driver: 'filesystem',
      partitionAware: true,
      partitionStrategy: 'invalid-strategy',
      config: {
        directory: tempDir
      }
    });

    // Should not throw but use default strategy
    await cachePlugin.install(database);
    expect(cachePlugin.driver).toBeInstanceOf(PartitionAwareFilesystemCache);
  });
    
});
