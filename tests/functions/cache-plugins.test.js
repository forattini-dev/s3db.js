import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { Cache, MemoryCache, S3Cache } from '../../src/plugins/cache/index.js';
import CachePlugin from '../../src/plugins/cache.plugin.js';

describe('Cache Plugins Coverage Tests', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('cache-plugins');
  });

  afterEach(async () => {
    // No cleanup needed for database in these tests
  });

  describe('Cache', () => {
    test('should create cache class with default configuration', () => {
      const cache = new Cache();
      expect(cache.config).toBeDefined();
      expect(typeof cache.config).toBe('object');
    });

    test('should create cache with custom configuration', () => {
      const config = { enabled: true, ttl: 300 };
      const cache = new Cache(config);
      expect(cache.config).toEqual(config);
    });

    test('should validate keys correctly', () => {
      const cache = new Cache();
      
      // Valid key should not throw
      expect(() => cache.validateKey('valid-key')).not.toThrow();
      
      // Invalid keys should throw
      expect(() => cache.validateKey(null)).toThrow('Invalid key');
      expect(() => cache.validateKey(undefined)).toThrow('Invalid key');
      expect(() => cache.validateKey('')).toThrow('Invalid key');
      expect(() => cache.validateKey(123)).toThrow('Invalid key');
    });

    test('should handle base cache operations (no-op implementation)', async () => {
      const cache = new Cache();
      
      // Base cache methods should complete without errors but return undefined
      await expect(cache.set('test-key', 'value')).resolves.toBe('value');
      await expect(cache.get('test-key')).resolves.toBeUndefined();
      await expect(cache.delete('test-key')).resolves.toBeUndefined();
      await expect(cache.clear()).resolves.toBeUndefined();
    });

    test('should emit events during operations', async () => {
      const cache = new Cache();
      const events = [];
      
      cache.on('set', (data) => events.push({ type: 'set', data }));
      cache.on('get', (data) => events.push({ type: 'get', data }));
      cache.on('delete', (data) => events.push({ type: 'delete', data }));
      
      await cache.set('test-key', 'test-value');
      await cache.get('test-key');
      await cache.delete('test-key');
      
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'set', data: 'test-value' });
    });
  });

  describe('MemoryCache', () => {
    test('should create memory cache with default configuration', () => {
      const cache = new MemoryCache();
      expect(cache.cache).toBeDefined();
      expect(cache.meta).toBeDefined();
      expect(cache.maxSize).toBe(0);
      expect(cache.ttl).toBe(0);
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
      const cache = new MemoryCache({ ttl: 0.05 }); // 50ms TTL
      
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

  describe('S3Cache', () => {
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

  describe('CachePlugin Integration', () => {
    test('should create cache plugin with memory cache', async () => {
      const cachePlugin = new CachePlugin({
        enabled: true,
        type: 'memory',
        config: { maxSize: 100 }
      });
      
      await cachePlugin.setup(database);
      expect(cachePlugin.config.enabled).toBe(true);
    });

    test('should create cache plugin with S3 cache', async () => {
      const cachePlugin = new CachePlugin({
        enabled: true,
        type: 's3',
        config: { 
          client: database.client,
          keyPrefix: 'plugin-cache'
        }
      });
      
      await cachePlugin.setup(database);
      expect(cachePlugin.config.enabled).toBe(true);
    });

    test('should handle disabled cache plugin', async () => {
      const cachePlugin = new CachePlugin({
        enabled: false,
        type: 'memory'
      });
      
      await cachePlugin.setup(database);
      expect(cachePlugin.config.enabled).toBe(false);
    });

    test('should handle plugin setup', async () => {
      const cachePlugin = new CachePlugin({
        enabled: true,
        type: 'memory'
      });
      
      await cachePlugin.setup(database);
      
      // Should complete without errors
      expect(true).toBe(true);
    });
  });
}); 