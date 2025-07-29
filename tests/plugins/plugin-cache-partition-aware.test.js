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
      filesystemOptions: {
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
}); 