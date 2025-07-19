import { mkdir, rmdir } from 'fs/promises';
import { join } from 'path';
import { FilesystemCache } from '../../src/plugins/cache/filesystem-cache.class.js';

describe('FilesystemCache - Basic Tests', () => {
  let cache;
  let testDir;

  beforeAll(async () => {
    testDir = join(process.cwd(), 'test-cache-filesystem-simple');
    
    // Clean up any existing cache directory
    try {
      await rmdir(testDir, { recursive: true });
    } catch (e) {
      // Directory might not exist, ignore
    }
  });

  afterAll(async () => {
    try {
      await rmdir(testDir, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    if (cache && cache.destroy) {
      cache.destroy();
    }
    if (cache && cache.clear) {
      try {
        await cache.clear();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Constructor and Basic Operations', () => {
    test('should create cache with default options', () => {
      cache = new FilesystemCache({ directory: testDir });
      
      expect(cache.directory).toBe(testDir);
      expect(cache.prefix).toBe('cache');
      expect(cache.ttl).toBe(3600000);
      expect(cache.enableCompression).toBe(true);
    });

    test('should create cache with custom options', () => {
      cache = new FilesystemCache({
        directory: testDir,
        prefix: 'custom',
        ttl: 600000,
        enableCompression: false
      });
      
      expect(cache.prefix).toBe('custom');
      expect(cache.ttl).toBe(600000);
      expect(cache.enableCompression).toBe(false);
    });

    test('should throw error when directory is not provided', () => {
      expect(() => {
        new FilesystemCache({});
      }).toThrow('FilesystemCache: directory parameter is required');
    });
  });

  describe('Basic Cache Operations', () => {
    beforeEach(() => {
      cache = new FilesystemCache({
        directory: testDir,
        enableStats: true
      });
    });

    test('should set and get cache data', async () => {
      const testData = { name: 'John', age: 30 };
      
      await cache.set('user:1', testData);
      const result = await cache.get('user:1');
      
      expect(result).toEqual(testData);
    });

    test('should return null for non-existent keys', async () => {
      const result = await cache.get('non-existent');
      expect(result).toBeNull();
    });

    test('should delete cache entries', async () => {
      await cache.set('key1', { data: 'value1' });
      
      const deleted = await cache.del('key1');
      expect(deleted).toBe(true);
      
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    test('should clear all cache entries', async () => {
      await cache.set('key1', { data: 'value1' });
      await cache.set('key2', { data: 'value2' });
      
      const cleared = await cache.clear();
      expect(cleared).toBe(true);
      
      const size = await cache.size();
      expect(size).toBe(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      cache = new FilesystemCache({
        directory: testDir,
        enableStats: true
      });
    });

    test('should track cache statistics when enabled', async () => {
      await cache.set('key1', { data: 'value1' });
      await cache.get('key1'); // hit
      await cache.get('key3'); // miss
      
      const stats = cache.getStats();
      expect(stats.sets).toBeGreaterThan(0);
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
    });

    test('should not track statistics when disabled', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableStats: false
      });
      
      await cache.set('key1', { data: 'value1' });
      await cache.get('key1');
      
      const stats = cache.getStats();
      expect(stats.sets).toBe(0);
      expect(stats.hits).toBe(0);
    });
  });

  describe('TTL and Expiration', () => {
    test('should handle TTL configuration', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        ttl: 100 // 100ms TTL
      });
      
      await cache.set('ttl-key', { data: 'test ttl' });
      
      // Data should be available immediately
      let result = await cache.get('ttl-key');
      expect(result).toBeDefined();
      expect(result.data).toBe('test ttl');
      
      // TTL should be set correctly
      expect(cache.ttl).toBe(100);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid keys', () => {
      cache = new FilesystemCache({ directory: testDir });
      
      expect(() => cache.validateKey('')).toThrow('Invalid key');
      expect(() => cache.validateKey(null)).toThrow('Invalid key');
      expect(() => cache.validateKey(undefined)).toThrow('Invalid key');
      expect(() => cache.validateKey('valid-key')).not.toThrow();
    });

    test('should handle cleanup on destroy', () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableCleanup: true,
        cleanupInterval: 1000
      });
      
      // Should not throw
      expect(() => cache.destroy()).not.toThrow();
    });
  });
}); 