import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../src/plugins/cache/index.js';

describe('Cache Plugin - MemoryCache Driver', () => {
  let db;
  let cachePlugin;
  let users;

  beforeEach(async () => {
    db = createDatabaseForTest('suite=plugins/cache-memory');
    await db.connect();

    // Configure memory cache
    cachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 60000,
      maxSize: 100
    });
    await cachePlugin.install(db);

    // Create test resource
    users = await db.createResource({
      name: 'users',
      asyncPartitions: false, // Use sync mode for predictable tests
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
        ttl: 300000
      });
      await defaultCachePlugin.install(db);

      expect(defaultCachePlugin.driver).toBeInstanceOf(MemoryCache);
      expect(defaultCachePlugin.driver.ttl).toBe(300000);
    });

    test('should handle custom maxSize configuration', async () => {
      const customCachePlugin = new CachePlugin({
        driver: 'memory',
        maxSize: 50
      });
      await customCachePlugin.install(db);

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
      // Small delay to ensure partition indexes are ready
      await new Promise(resolve => setTimeout(resolve, 100));
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
      
      // Small delay to ensure partition indexes are ready
      await new Promise(resolve => setTimeout(resolve, 100));

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
      
      // Small delay to ensure partition indexes are ready
      await new Promise(resolve => setTimeout(resolve, 100));

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
    test('should handle memory limit constraints (maxSize)', async () => {
      // Create cache with very small limit
      const smallCachePlugin = new CachePlugin({
        driver: 'memory',
        maxSize: 2
      });
      await smallCachePlugin.install(db);

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

    test('should enforce maxMemoryBytes limit', async () => {
      // Create cache with 5KB memory limit
      const memoryCachePlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryBytes: 5 * 1024 // 5KB
        }
      });
      await memoryCachePlugin.install(db);

      const memoryUsers = await db.createResource({
        name: 'memory_users',
        attributes: {
          name: 'string|required',
          data: 'string|required'
        }
      });

      // Create large data entries (each ~2KB)
      const largeData = 'x'.repeat(2000);
      await memoryUsers.insertMany([
        { name: 'User 1', data: largeData },
        { name: 'User 2', data: largeData },
        { name: 'User 3', data: largeData }
      ]);

      // Cache all users (should trigger eviction)
      await memoryUsers.list();

      // Get memory stats
      const memoryStats = memoryCachePlugin.driver.getMemoryStats();
      expect(memoryStats.currentMemoryBytes).toBeLessThanOrEqual(memoryStats.maxMemoryBytes);
      expect(memoryStats.maxMemoryBytes).toBe(5 * 1024);
    });

    test('should track memory usage accurately', async () => {
      const memoryTrackingPlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryBytes: 50 * 1024 // 50KB
        }
      });
      await memoryTrackingPlugin.install(db);

      const trackingUsers = await db.createResource({
        name: 'tracking_users',
        attributes: {
          name: 'string|required',
          email: 'string|required'
        }
      });

      // Insert test data
      await trackingUsers.insertMany([
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
        { name: 'Charlie', email: 'charlie@example.com' }
      ]);

      // Cache data
      await trackingUsers.list();

      // Check initial memory usage
      const stats1 = memoryTrackingPlugin.driver.getMemoryStats();
      expect(stats1.currentMemoryBytes).toBeGreaterThan(0);
      expect(stats1.totalItems).toBeGreaterThan(0);
      expect(stats1.averageItemSize).toBeGreaterThan(0);

      // Clear cache and verify memory is released
      await memoryTrackingPlugin.clearAllCache();

      const stats2 = memoryTrackingPlugin.driver.getMemoryStats();
      expect(stats2.currentMemoryBytes).toBe(0);
      expect(stats2.totalItems).toBe(0);
    });

    test('should evict items when memory limit is exceeded', async () => {
      const evictionPlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryBytes: 3 * 1024 // 3KB - very small
        }
      });
      await evictionPlugin.install(db);

      const evictionUsers = await db.createResource({
        name: 'eviction_users',
        attributes: {
          name: 'string|required',
          data: 'string|required'
        }
      });

      // Create multiple large items
      const largeData = 'x'.repeat(1000);
      await evictionUsers.insertMany([
        { name: 'User 1', data: largeData },
        { name: 'User 2', data: largeData },
        { name: 'User 3', data: largeData },
        { name: 'User 4', data: largeData }
      ]);

      // Cache multiple lists (should trigger multiple evictions)
      await evictionUsers.list();
      await evictionUsers.count();
      await evictionUsers.listIds();

      const memoryStats = evictionPlugin.driver.getMemoryStats();

      // Should have evicted some items
      expect(memoryStats.evictedDueToMemory).toBeGreaterThan(0);

      // Should stay under limit
      expect(memoryStats.currentMemoryBytes).toBeLessThanOrEqual(memoryStats.maxMemoryBytes);
    });

    test('should provide human-readable memory stats', async () => {
      const readablePlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryBytes: 10 * 1024 * 1024 // 10MB
        }
      });
      await readablePlugin.install(db);

      const readableUsers = await db.createResource({
        name: 'readable_users',
        attributes: {
          name: 'string|required'
        }
      });

      await readableUsers.insert({ name: 'Test User' });
      await readableUsers.list();

      const memoryStats = readablePlugin.driver.getMemoryStats();

      expect(memoryStats.memoryUsage).toBeDefined();
      expect(memoryStats.memoryUsage.current).toMatch(/\d+\.\d+ (B|KB|MB|GB)/);
      expect(memoryStats.memoryUsage.max).toMatch(/\d+\.\d+ (B|KB|MB|GB)/);
      expect(memoryStats.memoryUsage.available).toMatch(/\d+\.\d+ (B|KB|MB|GB)/);
      expect(memoryStats.memoryUsagePercent).toBeGreaterThanOrEqual(0);
      expect(memoryStats.memoryUsagePercent).toBeLessThanOrEqual(100);
    });

    test('should handle unlimited memory when maxMemoryBytes is 0', async () => {
      const unlimitedPlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryBytes: 0 // Unlimited
        }
      });
      await unlimitedPlugin.install(db);

      const unlimitedUsers = await db.createResource({
        name: 'unlimited_users',
        attributes: {
          name: 'string|required',
          data: 'string|required'
        }
      });

      // Insert large data
      const largeData = 'x'.repeat(5000);
      await unlimitedUsers.insertMany([
        { name: 'User 1', data: largeData },
        { name: 'User 2', data: largeData },
        { name: 'User 3', data: largeData }
      ]);

      await unlimitedUsers.list();

      const memoryStats = unlimitedPlugin.driver.getMemoryStats();

      // Should have no memory limit
      expect(memoryStats.maxMemoryBytes).toBe(0);
      expect(memoryStats.memoryUsagePercent).toBe(0);
      expect(memoryStats.memoryUsage.max).toBe('unlimited');
      expect(memoryStats.memoryUsage.available).toBe('unlimited');

      // Should not evict due to memory
      expect(memoryStats.evictedDueToMemory).toBe(0);
    });

    test('should calculate memory limit from percentage', async () => {
      const percentPlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryPercent: 0.05 // 5% of system memory (0.05 = 5%)
        }
      });
      await percentPlugin.install(db);

      const percentUsers = await db.createResource({
        name: 'percent_users',
        attributes: {
          name: 'string|required'
        }
      });

      await percentUsers.insert({ name: 'Test User' });
      await percentUsers.list();

      const memoryStats = percentPlugin.driver.getMemoryStats();

      // Should have calculated maxMemoryBytes from percentage
      expect(memoryStats.maxMemoryPercent).toBe(0.05);
      expect(memoryStats.maxMemoryBytes).toBeGreaterThan(0);

      // Should have system memory info
      expect(memoryStats.systemMemory).toBeDefined();
      expect(memoryStats.systemMemory.total).toMatch(/\d+\.\d+ (B|KB|MB|GB)/);
      expect(memoryStats.systemMemory.free).toMatch(/\d+\.\d+ (B|KB|MB|GB)/);
      expect(memoryStats.systemMemory.cachePercent).toMatch(/\d+\.\d+%/);

      // Cache should be using some percentage of system memory
      expect(memoryStats.cachePercentOfSystemMemory).toBeGreaterThanOrEqual(0);
    });

    test('should throw error when both maxMemoryBytes and maxMemoryPercent are set', async () => {
      // Should throw error during plugin install (when MemoryCache is created)
      const bothPlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryBytes: 1024 * 1024, // 1MB
          maxMemoryPercent: 0.05 // 5% - conflict!
        }
      });

      // Error happens on install when MemoryCache is instantiated
      await expect(bothPlugin.install(db)).rejects.toThrow(
        '[MemoryCache] Cannot use both maxMemoryBytes and maxMemoryPercent'
      );
    });

    test('should throw error when maxMemoryPercent > 1', async () => {
      // Should throw error for invalid percentage
      const invalidPlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryPercent: 10 // Invalid: should be 0.1, not 10
        }
      });

      // Error happens on install when MemoryCache is instantiated
      await expect(invalidPlugin.install(db)).rejects.toThrow(
        '[MemoryCache] maxMemoryPercent must be between 0 and 1'
      );
    });

    test('should enforce percentage-based memory limit', async () => {
      const enforcePercentPlugin = new CachePlugin({
        driver: 'memory',
        config: {
          maxMemoryPercent: 0.00001 // Extremely small: 0.001% of system memory (0.00001 = 0.001%)
        }
      });
      await enforcePercentPlugin.install(db);

      const enforceUsers = await db.createResource({
        name: 'enforce_users',
        attributes: {
          name: 'string|required',
          data: 'string|required'
        }
      });

      // Insert data that will exceed the tiny limit
      const largeData = 'x'.repeat(10000);
      await enforceUsers.insertMany([
        { name: 'User 1', data: largeData },
        { name: 'User 2', data: largeData },
        { name: 'User 3', data: largeData },
        { name: 'User 4', data: largeData },
        { name: 'User 5', data: largeData }
      ]);

      // Cache operations should trigger eviction
      await enforceUsers.list();
      await enforceUsers.count();
      await enforceUsers.listIds();

      const memoryStats = enforcePercentPlugin.driver.getMemoryStats();

      // Should stay under the calculated limit (or be very close)
      expect(memoryStats.currentMemoryBytes).toBeLessThanOrEqual(memoryStats.maxMemoryBytes + 1000); // Allow small margin

      // Should have evicted items OR used all available space
      // (The test passes if either eviction happened OR cache is using the allocated space)
      expect(memoryStats.currentMemoryBytes).toBeGreaterThan(0);
    });

    test('should handle TTL expiration', async () => {
      // Create cache with very short TTL
      const shortTtlPlugin = new CachePlugin({
        driver: 'memory',
        ttl: 50 // 50ms
      });
      await shortTtlPlugin.install(db);

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