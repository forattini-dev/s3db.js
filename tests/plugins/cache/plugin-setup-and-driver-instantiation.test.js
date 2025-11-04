import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { Cache, MemoryCache, S3Cache } from '../../../src/plugins/cache/index.js';
import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/partition-aware-filesystem-cache.class.js';

describe('Cache Plugin - Plugin Setup and Driver Instantiation', () => {
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

  test('should setup cache plugin with memory driver', async () => {
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 60000,
      maxSize: 100
    });
    await cachePlugin.install(database);

    expect(cachePlugin.driver).toBeInstanceOf(MemoryCache);
    expect(cachePlugin.database).toBe(database);
    expect(cachePlugin.driver).toBeDefined();
  });

  test('should setup cache plugin with filesystem driver', async () => {
    const tempDir = await createTemporaryPathForTest('filesystem-plugin');
    
    const cachePlugin = new CachePlugin({
      driver: 'filesystem',
      config: {
        directory: tempDir
      }
    });
    await cachePlugin.install(database);

    expect(cachePlugin.driver).toBeInstanceOf(FilesystemCache);
    expect(cachePlugin.database).toBe(database);
  });

  test('should setup cache plugin with partition-aware filesystem driver', async () => {
    const tempDir = await createTemporaryPathForTest('partition-aware-filesystem');
    
    const cachePlugin = new CachePlugin({
      driver: 'filesystem',
      partitionAware: true,
      config: {
        directory: tempDir
      }
    });
    await cachePlugin.install(database);

    expect(cachePlugin.driver).toBeInstanceOf(PartitionAwareFilesystemCache);
    expect(cachePlugin.database).toBe(database);
  });

  test('should setup cache plugin with S3 driver', async () => {
    const cachePlugin = new CachePlugin({
      driver: 's3',
      client: database.client
    });
    await cachePlugin.install(database);

    expect(cachePlugin.driver).toBeInstanceOf(S3Cache);
    expect(cachePlugin.database).toBe(database);
  });

  test('should default to S3Cache for invalid driver type', async () => {
    const cachePlugin = new CachePlugin({
      driver: 'invalid-driver'
    });
    await cachePlugin.install(database);

    expect(cachePlugin.driver).toBeInstanceOf(S3Cache);
    expect(cachePlugin.database).toBe(database);
  });

  test('should handle custom driver configuration', async () => {
    const customDriver = new MemoryCache({ ttl: 1000 });
    const cachePlugin = new CachePlugin({
      driver: customDriver
    });
    await cachePlugin.install(database);

    expect(cachePlugin.driver).toBe(customDriver);
    expect(cachePlugin.database).toBe(database);
  });

  test('should create cache plugin with memory cache', async () => {
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      maxSize: 100
    });
    
    await cachePlugin.install(database);
    expect(cachePlugin.driver).toBeDefined();
    expect(cachePlugin.driver.constructor.name).toBe('MemoryCache');
  });

  test('should create cache plugin with S3 cache', async () => {
    const cachePlugin = new CachePlugin({
      driver: 's3',
      config: { 
        keyPrefix: 'plugin-cache'
      }
    });
    
    await cachePlugin.install(database);
    expect(cachePlugin.driver).toBeDefined();
    expect(cachePlugin.driver.constructor.name).toBe('S3Cache');
  });

  test('should handle memory cache plugin setup', async () => {
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 300000,
      maxSize: 1000
    });
    
    await cachePlugin.install(database);
    expect(cachePlugin.driver).toBeDefined();
    expect(cachePlugin.driver.ttl).toBe(300000);
    expect(cachePlugin.driver.maxSize).toBe(1000);
  });

  test('should handle plugin setup', async () => {
    const cachePlugin = new CachePlugin({
      enabled: true,
      type: 'memory'
    });
    
    await cachePlugin.install(database);
    
    // Should complete without errors
    expect(true).toBe(true);
  });
    
});
