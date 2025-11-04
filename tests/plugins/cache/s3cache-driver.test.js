import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { Cache, MemoryCache, S3Cache } from '../../../src/plugins/cache/index.js';
import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/partition-aware-filesystem-cache.class.js';

describe('Cache Plugin - S3Cache Driver', () => {
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

  test('should create S3 cache with configuration', () => {
    const config = {
      client: database.client,
      keyPrefix: 'test-cache',
      ttl: 300
    };
    
    const cache = new S3Cache(config);
    expect(cache.client).toBe(database.client);
    expect(cache.keyPrefix).toBe('test-cache');
    expect(cache.config.ttl).toBe(300);
  });

  test('should handle S3 cache operations', async () => {
    const cache = new S3Cache({
      client: database.client,
      keyPrefix: 'test-cache'
    });
    
    // Test set/get
    const testData = { data: 'test-s3-cache' };
    await cache.set('s3-test-key', testData);
    
    const result = await cache.get('s3-test-key');
    expect(result).toEqual(testData);
    
    // Test delete
    await cache.delete('s3-test-key');
    const deletedResult = await cache.get('s3-test-key');
    expect(deletedResult).toBeNull();
  });

  test('should handle missing keys gracefully', async () => {
    const cache = new S3Cache({
      client: database.client,
      keyPrefix: 'test-cache'
    });
    
    const result = await cache.get('non-existent-key');
    expect(result).toBeNull();
  });

  test('should handle S3 cache size and keys', async () => {
    const cache = new S3Cache({
      client: database.client,
      keyPrefix: 'size-test'
    });
    
    await cache.set('key1', { data: 'data1' });
    await cache.set('key2', { data: 'data2' });
    
    const size = await cache.size();
    const keys = await cache.keys();
    
    expect(size).toBeGreaterThanOrEqual(2);
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  test('should clear S3 cache', async () => {
    const cache = new S3Cache({
      client: database.client,
      keyPrefix: 'clear-test'
    });
    
    await cache.set('key1', { data: 'data1' });
    await cache.set('key2', { data: 'data2' });
    
    await cache.clear();
    
    const keys = await cache.keys();
    expect(keys).toHaveLength(0);
  });
    
});
