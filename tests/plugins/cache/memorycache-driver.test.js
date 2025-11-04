import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { Cache, MemoryCache, S3Cache } from '../../../src/plugins/cache/index.js';
import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/partition-aware-filesystem-cache.class.js';

describe('Cache Plugin - MemoryCache Driver', () => {
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

  test('should create memory cache with default configuration', () => {
    const cache = new MemoryCache();
    expect(cache.cache).toBeDefined();
    expect(cache.meta).toBeDefined();
    expect(cache.maxSize).toBe(1000);
    expect(cache.ttl).toBe(300000);
  });

  test('should create memory cache with custom configuration', () => {
    const config = { maxSize: 100, ttl: 300 };
    const cache = new MemoryCache(config);
    expect(cache.maxSize).toBe(100);
    expect(cache.ttl).toBe(300);
  });

  test('should handle basic cache operations', async () => {
    const cache = new MemoryCache();
    
    // Test set/get
    await cache.set('test-key', { data: 'test' });
    const result = await cache.get('test-key');
    expect(result).toEqual({ data: 'test' });
    
    // Test delete
    await cache.delete('test-key');
    const deletedResult = await cache.get('test-key');
    expect(deletedResult).toBeNull();
  });

  test('should handle TTL expiration', async () => {
    const cache = new MemoryCache({ ttl: 50 }); // 50ms TTL

    await cache.set('expire-key', { data: 'will-expire' });
    const immediate = await cache.get('expire-key');
    expect(immediate).toEqual({ data: 'will-expire' });

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));
    const expired = await cache.get('expire-key');
    expect(expired).toBeNull();
  });

  test('should handle cache size limits', async () => {
    const cache = new MemoryCache({ maxSize: 2 });
    
    await cache.set('key1', { data: 'data1' });
    await cache.set('key2', { data: 'data2' });
    
    // Adding third item should evict oldest
    await cache.set('key3', { data: 'data3' });
    
    // key1 should be evicted
    const result1 = await cache.get('key1');
    const result3 = await cache.get('key3');
    expect(result1).toBeNull();
    expect(result3).toEqual({ data: 'data3' });
  });

  test('should clear cache with prefix', async () => {
    const cache = new MemoryCache();
    
    await cache.set('prefix:key1', { data: 'data1' });
    await cache.set('prefix:key2', { data: 'data2' });
    await cache.set('other:key', { data: 'other' });
    
    await cache.clear('prefix:');
    
    expect(await cache.get('prefix:key1')).toBeNull();
    expect(await cache.get('prefix:key2')).toBeNull();
    expect(await cache.get('other:key')).toEqual({ data: 'other' });
  });

  test('should get cache size and keys', async () => {
    const cache = new MemoryCache();
    
    await cache.set('key1', { data: 'data1' });
    await cache.set('key2', { data: 'data2' });
    
    const size = await cache.size();
    const keys = await cache.keys();
    
    expect(size).toBe(2);
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
  });
    
});
