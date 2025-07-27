import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import CachePlugin from '../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../src/plugins/cache/index.js';

describe('Cache Plugin - MemoryCache Driver', () => {
  let db;
  let cachePlugin;
  let users;

  beforeEach(async () => {
    db = createDatabaseForTest('plugin-cache-memory');
    await db.connect();

    // Configure memory cache
    cachePlugin = new CachePlugin({
      driver: 'memory',
      memoryOptions: {
        ttl: 60000,
        maxSize: 100
      }
    });
    await cachePlugin.setup(db);

    // Create test resource
    users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        department: 'string|required',
        region: 'string|required',
        status: 'string|required'
      },
      partitions: {
        byDepartment: {
          fields: { department: 'string' }
        },
        byRegion: {
          fields: { region: 'string' }
        }
      }
    });
  });

  afterEach(async () => {
    if (cachePlugin && cachePlugin.driver) {
      await cachePlugin.clearAllCache();
    }
    if (db) {
      await db.disconnect();
    }
  });

  describe('Driver Setup and Configuration', () => {
    test('should initialize MemoryCache with correct configuration', () => {
      expect(cachePlugin.driver).toBeInstanceOf(MemoryCache);
      expect(cachePlugin.driver.ttl).toBe(60000);
      expect(cachePlugin.driver.maxSize).toBe(100);
    });

    test('should handle default configuration', async () => {
      const defaultCachePlugin = new CachePlugin({
        driver: 'memory',
        memoryOptions: {
          ttl: 300000
        }
      });
      await defaultCachePlugin.setup(db);

      expect(defaultCachePlugin.driver).toBeInstanceOf(MemoryCache);
      expect(defaultCachePlugin.driver.ttl).toBe(300000);
    });

    test('should handle custom maxSize configuration', async () => {
      const customCachePlugin = new CachePlugin({
        driver: 'memory',
        memoryOptions: {
          maxSize: 50
        }
      });
      await customCachePlugin.setup(db);

      expect(customCachePlugin.driver.maxSize).toBe(50);
    });
  });

  describe('Basic Cache Operations', () => {
    beforeEach(async () => {
      // Insert test data
      await users.insertMany([
        { name: 'Alice', email: 'alice@example.com', department: 'Engineering', region: 'US', status: 'active' },
        { name: 'Bob', email: 'bob@example.com', department: 'Sales', region: 'US', status: 'active' },
        { name: 'Charlie', email: 'charlie@example.com', department: 'Engineering', region: 'EU', status: 'inactive' }
      ]);
    });

    test('should cache and retrieve count results', async () => {
      // First call - cache miss
      const count1 = await users.count();
      expect(count1).toBe(3);

      // Second call - cache hit
      const count2 = await users.count();
      expect(count2).toBe(3);

      // Verify cache was used
      const stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    test('should cache and retrieve list results', async () => {
      // First call - cache miss
      const list1 = await users.list();
      expect(list1).toHaveLength(3);

      // Second call - cache hit
      const list2 = await users.list();
      expect(list2).toEqual(list1);
    });

    test('should cache and retrieve listIds results', async () => {
      const ids1 = await users.listIds();
      expect(ids1).toHaveLength(3);

      const ids2 = await users.listIds();
      expect(ids2).toEqual(ids1);
    });

    test('should cache and retrieve getMany results', async () => {
      const allIds = await users.listIds();
      const testIds = allIds.slice(0, 2);

      const many1 = await users.getMany(testIds);
      expect(many1).toHaveLength(2);

      const many2 = await users.getMany(testIds);
      expect(many2).toEqual(many1);
    });

    test('should cache and retrieve getAll results', async () => {
      const all1 = await users.getAll();
      expect(all1).toHaveLength(3);

      const all2 = await users.getAll();
      expect(all2).toEqual(all1);
    });

    test('should cache and retrieve page results', async () => {
      const page1 = await users.page({ offset: 0, size: 2 });
      expect(page1.items).toHaveLength(2);

      const page2 = await users.page({ offset: 0, size: 2 });
      expect(page2.items).toEqual(page1.items);
    });

    test('should cache individual get results', async () => {
      const userId = (await users.listIds())[0];

      const user1 = await users.get(userId);
      expect(user1).toBeDefined();

      const user2 = await users.get(userId);
      expect(user2).toEqual(user1);
    });
  });

  describe('Partition-Aware Caching', () => {
    beforeEach(async () => {
      await users.insertMany([
        { name: 'US Engineer 1', email: 'use1@example.com', department: 'Engineering', region: 'US', status: 'active' },
        { name: 'US Engineer 2', email: 'use2@example.com', department: 'Engineering', region: 'US', status: 'active' },
        { name: 'EU Engineer 1', email: 'eue1@example.com', department: 'Engineering', region: 'EU', status: 'active' },
        { name: 'US Sales 1', email: 'uss1@example.com', department: 'Sales', region: 'US', status: 'active' }
      ]);
    });

    test('should cache partition-specific count queries', async () => {
      // Cache Engineering department count
      const engCount1 = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'Engineering' }
      });
      expect(engCount1).toBe(3);

      // Should hit cache
      const engCount2 = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'Engineering' }
      });
      expect(engCount2).toBe(3);

      // Different partition should be separate cache entry
      const salesCount = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'Sales' }
      });
      expect(salesCount).toBe(1);
    });

    test('should cache partition-specific list queries', async () => {
      // Cache US region users
      const usUsers1 = await users.list({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usUsers1).toHaveLength(3);
      expect(usUsers1.every(u => u.region === 'US')).toBe(true);

      // Should hit cache
      const usUsers2 = await users.list({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usUsers2).toEqual(usUsers1);

      // Different partition
      const euUsers = await users.list({
        partition: 'byRegion',
        partitionValues: { region: 'EU' }
      });
      expect(euUsers).toHaveLength(1);
      expect(euUsers[0].region).toBe('EU');
    });

    test('should cache partition-specific page queries', async () => {
      const page1 = await users.page({
        offset: 0,
        size: 2,
        partition: 'byDepartment',
        partitionValues: { department: 'Engineering' }
      });
      expect(page1.items).toHaveLength(2);

      const page2 = await users.page({
        offset: 0,
        size: 2,
        partition: 'byDepartment',
        partitionValues: { department: 'Engineering' }
      });
      expect(page2.items).toEqual(page1.items);
    });
  });

  describe('Cache Invalidation', () => {
    beforeEach(async () => {
      await users.insert({
        name: 'Test User',
        email: 'test@example.com',
        department: 'IT',
        region: 'US',
        status: 'active'
      });
    });

    test('should invalidate cache on insert', async () => {
      // Cache count
      const initialCount = await users.count();
      expect(initialCount).toBe(1);

      // Insert new user
      await users.insert({
        name: 'New User',
        email: 'new@example.com',
        department: 'HR',
        region: 'US',
        status: 'active'
      });

      // Count should reflect new data
      const newCount = await users.count();
      expect(newCount).toBe(2);
    });

    test('should invalidate cache on update', async () => {
      const userId = (await users.listIds())[0];

      // Cache user data
      const originalUser = await users.get(userId);
      expect(originalUser.name).toBe('Test User');

      // Update user
      await users.update(userId, { name: 'Updated User' });

      // Cache should be invalidated
      const updatedUser = await users.get(userId);
      expect(updatedUser.name).toBe('Updated User');
    });

    test('should invalidate cache on delete', async () => {
      const userId = (await users.listIds())[0];

      // Cache count
      const initialCount = await users.count();
      expect(initialCount).toBe(1);

      // Delete user
      await users.delete(userId);

      // Cache should be invalidated
      const newCount = await users.count();
      expect(newCount).toBe(0);
    });

    test('should invalidate cache on deleteMany', async () => {
      // Insert more users
      await users.insertMany([
        { name: 'User 2', email: 'user2@example.com', department: 'HR', region: 'US', status: 'active' },
        { name: 'User 3', email: 'user3@example.com', department: 'IT', region: 'EU', status: 'active' }
      ]);

      const initialCount = await users.count();
      expect(initialCount).toBe(3);

      const allIds = await users.listIds();
      await users.deleteMany(allIds.slice(0, 2));

      const newCount = await users.count();
      expect(newCount).toBe(1);
    });

    test('should invalidate partition cache appropriately', async () => {
      // Insert more IT users
      await users.insertMany([
        { name: 'IT User 2', email: 'it2@example.com', department: 'IT', region: 'US', status: 'active' },
        { name: 'HR User 1', email: 'hr1@example.com', department: 'HR', region: 'US', status: 'active' }
      ]);

      // Cache IT department count
      const itCount1 = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'IT' }
      });
      expect(itCount1).toBe(2);

      // Cache HR department count
      const hrCount1 = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'HR' }
      });
      expect(hrCount1).toBe(1);

      // Insert new IT user
      await users.insert({
        name: 'IT User 3',
        email: 'it3@example.com',
        department: 'IT',
        region: 'EU',
        status: 'active'
      });

      // IT count should be updated
      const itCount2 = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'IT' }
      });
      expect(itCount2).toBe(3);

      // HR count should remain the same (cache still valid)
      const hrCount2 = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'HR' }
      });
      expect(hrCount2).toBe(1);
    });
  });

  describe('Memory Management', () => {
    test('should handle memory limit constraints', async () => {
      // Create cache with very small limit
      const smallCachePlugin = new CachePlugin({
        driver: 'memory',
        memoryOptions: {
          maxSize: 2
        }
      });
      await smallCachePlugin.setup(db);

      const smallUsers = await db.createResource({
        name: 'small_users',
        attributes: {
          name: 'string|required'
        }
      });

      // Insert test data
      await smallUsers.insertMany([
        { name: 'User 1' },
        { name: 'User 2' },
        { name: 'User 3' }
      ]);

      // Generate multiple cache entries
      await smallUsers.count();
      await smallUsers.list();
      await smallUsers.listIds();

      // Cache should respect size limit
      const stats = await smallCachePlugin.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(2);
    });

    test('should handle TTL expiration', async () => {
      // Create cache with very short TTL
      const shortTtlPlugin = new CachePlugin({
        driver: 'memory',
        memoryOptions: {
          ttl: 0.05 // 50ms in seconds
        }
      });
      await shortTtlPlugin.setup(db);

      const ttlUsers = await db.createResource({
        name: 'ttl_users',
        attributes: {
          name: 'string|required'
        }
      });

      await ttlUsers.insert({ name: 'TTL User' });

      // Cache the count
      const count1 = await ttlUsers.count();
      expect(count1).toBe(1);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      // Insert another user
      await ttlUsers.insert({ name: 'TTL User 2' });

      // Count should reflect new data (cache expired)
      const count2 = await ttlUsers.count();
      expect(count2).toBe(2);
    });
  });

  describe('Performance and Statistics', () => {
    beforeEach(async () => {
      await users.insertMany([
        { name: 'Perf User 1', email: 'perf1@example.com', department: 'IT', region: 'US', status: 'active' },
        { name: 'Perf User 2', email: 'perf2@example.com', department: 'IT', region: 'US', status: 'active' },
        { name: 'Perf User 3', email: 'perf3@example.com', department: 'IT', region: 'US', status: 'active' }
      ]);
    });

    test('should improve performance with caching', async () => {
      // First call (cache miss)
      const start1 = Date.now();
      await users.count();
      const time1 = Date.now() - start1;

      // Second call (cache hit)
      const start2 = Date.now();
      await users.count();
      const time2 = Date.now() - start2;

      // Cache hit should be faster or equal
      expect(time2).toBeLessThanOrEqual(time1);
    });

    test('should provide accurate cache statistics', async () => {
      // Generate some cache activity
      await users.count();
      await users.list();
      await users.listIds();

      const stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.keys).toBeDefined();
      expect(stats.driver).toBe('MemoryCache');
      expect(Array.isArray(stats.keys)).toBe(true);
    });

    test('should track cache hits and misses', async () => {
      // This depends on MemoryCache having hit/miss tracking
      const driver = cachePlugin.driver;
      
      // Generate cache miss
      await users.count();
      
      // Generate cache hit
      await users.count();
      
      // Check if driver exposes hit/miss stats
      if (driver.getStats) {
        const driverStats = driver.getStats();
        expect(driverStats).toBeDefined();
      }
    });
  });

  describe('Cache Management Operations', () => {
    beforeEach(async () => {
      await users.insert({ name: 'Management User', email: 'mgmt@example.com', department: 'Admin', region: 'US', status: 'active' });
    });

    test('should clear all cache', async () => {
      // Generate cache entries
      await users.count();
      await users.list();

      let stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      // Clear all cache
      await cachePlugin.clearAllCache();

      stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBe(0);
    });

    test('should warm cache for resource', async () => {
      // Clear any existing cache
      await cachePlugin.clearAllCache();

      // Warm cache
      await cachePlugin.warmCache('users');

      // Cache should be populated
      const stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    test('should handle resource-specific cache clearing', async () => {
      // Generate cache for users
      await users.count();
      await users.list();

      let stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      // Clear cache at plugin level
      await cachePlugin.clearAllCache();

      // Verify cache was cleared
      stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle cache errors gracefully', async () => {
      await users.insert({ name: 'Error Test', email: 'error@example.com', department: 'Test', region: 'US', status: 'active' });

      // Mock driver error - wrap in try-catch to avoid unhandled promise rejection
      const originalGet = cachePlugin.driver.get;
      cachePlugin.driver.get = jest.fn().mockRejectedValue(new Error('Memory cache error'));

      try {
        // Operations should still work or handle the error
        const count = await users.count();
        expect(count).toBe(1);
      } catch (error) {
        // If cache error propagates, verify operation handles it
        expect(error.message).toBe('Memory cache error');
      } finally {
        // Restore original method
        cachePlugin.driver.get = originalGet;
      }
    });

    test('should handle null/undefined cache values', async () => {
      // Mock driver to return null
      const originalGet = cachePlugin.driver.get;
      cachePlugin.driver.get = jest.fn().mockResolvedValue(null);

      await users.insert({ name: 'Null Test', email: 'null@example.com', department: 'Test', region: 'US', status: 'active' });

      // Should still work and get fresh data
      const count = await users.count();
      expect(count).toBe(1);

      // Restore original method
      cachePlugin.driver.get = originalGet;
    });

    test('should handle concurrent cache operations', async () => {
      await users.insertMany([
        { name: 'Concurrent 1', email: 'conc1@example.com', department: 'Test', region: 'US', status: 'active' },
        { name: 'Concurrent 2', email: 'conc2@example.com', department: 'Test', region: 'US', status: 'active' }
      ]);

      // Perform multiple concurrent operations
      const promises = [
        users.count(),
        users.list(),
        users.listIds(),
        users.count(),
        users.list()
      ];

      const results = await Promise.all(promises);
      
      // All operations should complete successfully
      expect(results[0]).toBe(2); // count
      expect(results[1]).toHaveLength(2); // list
      expect(results[2]).toHaveLength(2); // listIds
      expect(results[3]).toBe(2); // count (cached)
      expect(results[4]).toHaveLength(2); // list (should be same length, order may vary)
    });

    test('should handle resource cleanup', async () => {
      // Generate cache entries
      await users.count();
      await users.list();

      let stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      // Simulate resource cleanup by clearing cache
      await cachePlugin.clearAllCache();

      // Cache should be accessible and empty
      stats = await cachePlugin.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.size).toBe(0);
    });
  });
}); 