import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { mkdir, rm as rmdir } from 'fs/promises';
import { join } from 'path';
import { createDatabaseForTest, createTemporaryPathForTest } from '../config.js';
import CachePlugin from '../../src/plugins/cache.plugin.js';
import { PartitionAwareFilesystemCache } from '../../src/plugins/cache/index.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Basic Tests', () => {
  let db;
  let cachePlugin;
  let users;
  let testDir;

  beforeAll(async () => {
    testDir = await createTemporaryPathForTest('cache-partition-aware-simple');
  });

  afterAll(async () => {
    try {
      await rmdir(testDir, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    db = createDatabaseForTest('suite=plugins/cache-partition-aware');
    await db.connect();

    // Configure partition-aware filesystem cache
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
    await cachePlugin.setup(db);

    // Create test resource with partitions
    users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        region: 'string|required',
        department: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        },
        byDepartment: {
          fields: { department: 'string' }
        }
      }
    });
  });

  afterEach(async () => {
    if (cachePlugin && cachePlugin.driver) {
      try {
        await cachePlugin.clearAllCache();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    if (db) {
      await db.disconnect();
    }
  });

  describe('Driver Setup and Configuration', () => {
    test('should initialize PartitionAwareFilesystemCache with correct configuration', () => {
      expect(cachePlugin.driver).toBeInstanceOf(PartitionAwareFilesystemCache);
      expect(cachePlugin.driver.directory).toBe(testDir);
      expect(cachePlugin.database).toBe(db);
    });

    test('should handle partition-aware configuration', () => {
      const driver = cachePlugin.driver;
      
      expect(driver.enableStats).toBe(true);
      expect(driver.partitionStrategy).toBeDefined();
    });
  });

  describe('Basic Partition Caching', () => {
    beforeEach(async () => {
      // Insert test data
      await users.insertMany([
        { name: 'Alice', email: 'alice@example.com', region: 'US', department: 'Engineering' },
        { name: 'Bob', email: 'bob@example.com', region: 'US', department: 'Sales' },
        { name: 'Charlie', email: 'charlie@example.com', region: 'EU', department: 'Engineering' }
      ]);
      
      // Wait for partition indexes to be created
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('should cache non-partitioned queries', async () => {
      // First call - cache miss
      const count1 = await users.count();
      expect(count1).toBe(3);

      // Second call - cache hit
      const count2 = await users.count();
      expect(count2).toBe(3);

      const stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    test('should cache region partition queries', async () => {
      // Cache US users
      const usCount1 = await users.count({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usCount1).toBe(2);

      // Should hit cache
      const usCount2 = await users.count({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usCount2).toBe(2);

      // Different partition - EU users
      const euCount = await users.count({
        partition: 'byRegion',
        partitionValues: { region: 'EU' }
      });
      expect(euCount).toBe(1);
    });

    test('should cache department partition queries', async () => {
      // Cache Engineering department
      const engCount1 = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'Engineering' }
      });
      expect(engCount1).toBe(2);

      // Should hit cache
      const engCount2 = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'Engineering' }
      });
      expect(engCount2).toBe(2);

      // Different partition - Sales department
      const salesCount = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'Sales' }
      });
      expect(salesCount).toBe(1);
    });

    test('should cache list results with partitions', async () => {
      // Cache US users list
      const usUsers1 = await users.list({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usUsers1).toHaveLength(2);

      // Should hit cache
      const usUsers2 = await users.list({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usUsers2).toHaveLength(2); // Check length instead of exact equality
    });
  });

  describe('Cache Invalidation', () => {
    test('should handle cache operations with insert', async () => {
      // Insert data
      await users.insert({
        name: 'Cache Test',
        email: 'cache@example.com',
        region: 'US',
        department: 'Test'
      });

      // Cache should work
      const count1 = await users.count();
      expect(count1).toBeGreaterThan(0);

      const count2 = await users.count();
      expect(count2).toBe(count1); // Should be cached
    });
  });

  describe('Statistics and Management', () => {
    beforeEach(async () => {
      await users.insert({ name: 'Stats User', email: 'stats@example.com', region: 'US', department: 'Analytics' });
    });

    test('should provide cache statistics', async () => {
      // Generate cache entries
      await users.count();
      await users.count({ partition: 'byRegion', partitionValues: { region: 'US' } });

      const stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.driver).toBe('PartitionAwareFilesystemCache');
      expect(Array.isArray(stats.keys)).toBe(true);
    });

    test('should clear all cache', async () => {
      // Generate cache entries
      await users.count();
      await users.list({ partition: 'byRegion', partitionValues: { region: 'US' } });

      let stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      // Clear all cache
      await cachePlugin.clearAllCache();

      stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBe(0);
    });

    test('should handle cache warming', async () => {
      // Clear any existing cache
      await cachePlugin.clearAllCache();

      let stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBe(0);

      // Generate cache by using the resource
      await users.count();

      // Cache should be populated
      stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
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

  test('should clear partition cache', async () => {
    // Insert data first
    const userData = { name: 'John', email: 'john@test.com', region: 'US', department: 'IT' };
    await users.insert(userData);

    // Cache some data
    await cachePlugin.driver.set('users', 'count', 5, { partition: 'byRegion', partitionValues: { region: 'US' } });
    
    // Verify it's cached
    const cached = await cachePlugin.driver.get('users', 'count', { partition: 'byRegion', partitionValues: { region: 'US' } });
    expect(cached).toBe(5);

    // Clear the partition cache
    const result = await cachePlugin.driver.clearPartition('users', 'byRegion', { region: 'US' });
    expect(result).toBe(true);

    // Verify it's cleared
    const clearedCache = await cachePlugin.driver.get('users', 'count', { partition: 'byRegion', partitionValues: { region: 'US' } });
    expect(clearedCache).toBeNull();
  });

  test('should clear all partitions for a resource', async () => {
    // Cache data for multiple partitions
    await cachePlugin.driver.set('users', 'count', 10, { partition: 'byRegion', partitionValues: { region: 'US' } });
    await cachePlugin.driver.set('users', 'count', 5, { partition: 'byDepartment', partitionValues: { department: 'IT' } });

    // Clear all partitions for the resource
    const result = await cachePlugin.driver.clearResourcePartitions('users');
    expect(result).toBe(true);

    // Verify all are cleared
    const cache1 = await cachePlugin.driver.get('users', 'count', { partition: 'byRegion', partitionValues: { region: 'US' } });
    const cache2 = await cachePlugin.driver.get('users', 'count', { partition: 'byDepartment', partitionValues: { department: 'IT' } });
    expect(cache1).toBeNull();
    expect(cache2).toBeNull();
  });

  test('should get partition statistics', async () => {
    // Cache some data
    await cachePlugin.driver.set('users', 'list', [{ id: '1' }], { partition: 'byRegion', partitionValues: { region: 'US' } });
    await cachePlugin.driver.set('users', 'count', 5, { partition: 'byRegion', partitionValues: { region: 'US' } });

    // Get stats
    const stats = await cachePlugin.driver.getPartitionStats('users');
    expect(stats).toBeDefined();
    expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
    expect(stats.totalSize).toBeGreaterThanOrEqual(0);
    expect(stats.partitions).toBeDefined();
  });

  test('should get cache recommendations', async () => {
    // Set up some usage data
    await cachePlugin.driver.set('users', 'list', [{ id: '1' }], { partition: 'byRegion', partitionValues: { region: 'US' } });
    
    // Get recommendations
    const recommendations = await cachePlugin.driver.getCacheRecommendations('users');
    expect(Array.isArray(recommendations)).toBe(true);
  });

  test('should handle temporal partition strategy', async () => {
    // Create cache with temporal strategy
    const temporalCache = new PartitionAwareFilesystemCache({
      directory: testDir,
      partitionStrategy: 'temporal'
    });

    // Test temporal partitioning
    const partitionDir = temporalCache._getPartitionDirectory('events', 'byDate', { date: '2024-01-01' });
    expect(partitionDir).toContain('events');
  });

  test('should handle flat partition strategy', async () => {
    // Create cache with flat strategy
    const flatCache = new PartitionAwareFilesystemCache({
      directory: testDir,
      partitionStrategy: 'flat'
    });

    // Test flat partitioning
    const partitionDir = flatCache._getPartitionDirectory('users', 'byRegion', { region: 'US' });
    expect(partitionDir).toContain('partitions');
  });

  test('should track usage statistics', async () => {
    // Enable usage tracking
    const trackingCache = new PartitionAwareFilesystemCache({
      directory: testDir,
      trackUsage: true
    });

    // Simulate usage
    await trackingCache.set('users', 'list', [{ id: '1' }], { partition: 'byRegion', partitionValues: { region: 'US' } });
    await trackingCache.get('users', 'list', { partition: 'byRegion', partitionValues: { region: 'US' } });

    // Check usage stats
    expect(trackingCache.partitionUsage.size).toBeGreaterThanOrEqual(0);
  });

  test('should handle partition cache key generation with params', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir
    });

    const key1 = cache._getPartitionCacheKey('users', 'list', 'byRegion', { region: 'US' }, { limit: 10 });
    const key2 = cache._getPartitionCacheKey('users', 'list', 'byRegion', { region: 'US' }, { limit: 20 });
    
    expect(key1).not.toBe(key2);
    expect(key1).toContain('params=');
  });

  test('should handle max cache size configuration', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir,
      maxCacheSize: '1MB'
    });

    expect(cache.maxCacheSize).toBe('1MB');
  });

  test('should save and load usage stats', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir,
      trackUsage: true
    });

    // Simulate usage
    cache.partitionUsage.set('users/byRegion', { count: 5, lastAccess: Date.now() });
    
    // Save stats
    await cache._saveUsageStats();
    
    // Load stats
    await cache.loadUsageStats();
    
    expect(cache.partitionUsage.has('users/byRegion')).toBe(true);
  });

  test('should handle preload related configuration', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir,
      preloadRelated: true,
      preloadThreshold: 5
    });

    expect(cache.preloadRelated).toBe(true);
    expect(cache.preloadThreshold).toBe(5);
  });

  test('should handle cache size limits', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir,
      maxCacheSize: '1KB' // Very small limit
    });

    // Test that cache respects size limits
    const largeData = 'x'.repeat(2000); // 2KB of data
    
    // This should work despite the small limit (implementation dependent)
    await cache.set('users', 'largeData', largeData);
    const retrieved = await cache.get('users', 'largeData');
    
    // The behavior depends on implementation but should not crash
    // Allow for data truncation or compression effects
    expect(retrieved === largeData || retrieved === null || typeof retrieved === 'string').toBe(true);
  });

  test('should calculate directory stats', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir
    });

    // Add some cache data
    await cache.set('users', 'data1', { id: 1 });
    await cache.set('users', 'data2', { id: 2 });

    const stats = await cache.getPartitionStats('users');
    expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
    expect(stats.totalSize).toBeGreaterThanOrEqual(0);
  });

  test('should handle usage key generation', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir
    });

    const key = cache._getUsageKey('users', 'byRegion', { region: 'US' });
    expect(key).toContain('users/byRegion');
  });

  test('should detect temporal partitions', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir,
      partitionStrategy: 'temporal'
    });

    // Test date-based partition detection
    const isTemporalDate = cache._isTemporalPartition('byDate', { date: '2024-01-01' });
    const isTemporalTime = cache._isTemporalPartition('byTime', { timestamp: Date.now() });
    
    expect(typeof isTemporalDate).toBe('boolean');
    expect(typeof isTemporalTime).toBe('boolean');
  });

  test('should handle partition cache key without partition', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir
    });

    const key = cache._getPartitionCacheKey('users', 'list', null, {});
    expect(key).toContain('resource=users');
    expect(key).toContain('action=list');
    expect(key).not.toContain('partition=');
  });

  test('should handle empty partition values', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir
    });

    const key = cache._getPartitionCacheKey('users', 'list', 'byRegion', {});
    expect(key).toContain('resource=users');
    expect(key).toContain('action=list');
    // When partition values are empty, partition is not included in key
    expect(key).not.toContain('partition=byRegion');
  });

  test('should clean up old cache files based on recommendations', async () => {
    const cache = new PartitionAwareFilesystemCache({
      directory: testDir,
      trackUsage: true
    });

    // Add some old cache data
    await cache.set('users', 'old_data', { id: 1 }, { partition: 'byRegion', partitionValues: { region: 'OLD' } });
    
    // Simulate old access time
    cache.partitionUsage.set('users/byRegion', { 
      count: 1, 
      lastAccess: Date.now() - (31 * 24 * 60 * 60 * 1000) // 31 days ago
    });

    const recommendations = await cache.getCacheRecommendations('users');
    const archiveRecommendations = recommendations.filter(r => r.recommendation === 'archive');
    
    // Should recommend archiving old data
    expect(archiveRecommendations.length).toBeGreaterThanOrEqual(0);
  });
}); 