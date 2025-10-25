import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { mkdir, rm as rmdir } from 'fs/promises';
import { join } from 'path';
import { createDatabaseForTest, createTemporaryPathForTest } from '../config.js';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';

describe('Cache Plugin - Partition Integration - Basic Tests', () => {
  let db;
  let cachePlugin;
  let users;
  let testDir;

  beforeEach(async () => {
    // Create unique directory for each test to avoid pollution
    testDir = await createTemporaryPathForTest(`cache-partitions-${Date.now()}-${Math.random()}`);

    db = createDatabaseForTest('suite=plugins/cache-partitions');
    await db.connect();

    // Configure cache plugin with filesystem driver
    cachePlugin = new CachePlugin({
      driver: 'filesystem',
      partitionAware: true,
      config: {
        directory: testDir,
        enableStats: true
      }
    });
    await cachePlugin.install(db);

    // Create test resource with partitions
    users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        region: 'string|required',
        department: 'string|required'
      },
      asyncPartitions: false, // Use sync partitions for predictable test results
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
    // Clean up test directory
    if (testDir) {
      try {
        await rmdir(testDir, { recursive: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Basic Partition Integration', () => {
    test('should handle partition caching integration', async () => {
      // Insert test data
      await users.insertMany([
        { name: 'Alice', email: 'alice@example.com', region: 'US', department: 'Engineering' },
        { name: 'Bob', email: 'bob@example.com', region: 'EU', department: 'Sales' }
      ]);

      // Test partition queries
      const usCount = await users.count({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usCount).toBe(1);

      const engCount = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'Engineering' }
      });
      expect(engCount).toBe(1);

      // Verify partition queries work correctly
      expect(usCount).toBe(1);
      expect(engCount).toBe(1);
    });

    test('should handle non-partitioned and partitioned queries together', async () => {
      await users.insert({ name: 'Test User', email: 'test@example.com', region: 'US', department: 'IT' });

      // Non-partitioned query
      const totalCount = await users.count();
      expect(totalCount).toBe(1);

      // Partitioned query
      const usCount = await users.count({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usCount).toBe(1);

      // Both should be cached
      const stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    test('should handle different partition types', async () => {
      await users.insertMany([
        { name: 'US Eng', email: 'us.eng@example.com', region: 'US', department: 'Engineering' },
        { name: 'EU Sales', email: 'eu.sales@example.com', region: 'EU', department: 'Sales' }
      ]);

      // Region partition
      const regionCount = await users.count({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(regionCount).toBe(1);

      // Department partition
      const deptCount = await users.count({
        partition: 'byDepartment',
        partitionValues: { department: 'Engineering' }
      });
      expect(deptCount).toBe(1);

      // List operations
      const usList = await users.list({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(usList).toHaveLength(1);
      expect(usList[0].region).toBe('US');
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      await users.insert({ name: 'Cache User', email: 'cache@example.com', region: 'US', department: 'Test' });
    });

    test('should provide cache statistics', async () => {
      // Generate cache entries
      await users.count();
      await users.count({ partition: 'byRegion', partitionValues: { region: 'US' } });

      const stats = await cachePlugin.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
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

    test('should handle cache operations with insert', async () => {
      // Cache initial count
      const count1 = await users.count();
      expect(count1).toBe(1);

      // Insert more data
      await users.insert({ name: 'New User', email: 'new@example.com', region: 'EU', department: 'HR' });

      // Count should reflect new data
      const count2 = await users.count();
      expect(count2).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty partitions', async () => {
      // Query non-existent partition values
      const emptyCount = await users.count({
        partition: 'byRegion',
        partitionValues: { region: 'NONEXISTENT' }
      });
      expect(emptyCount).toBe(0);

      const emptyList = await users.list({
        partition: 'byDepartment',
        partitionValues: { department: 'NONEXISTENT' }
      });
      expect(emptyList).toHaveLength(0);
    });

    test('should handle basic operations without errors', async () => {
      await users.insert({ name: 'Error Test', email: 'error@example.com', region: 'US', department: 'Test' });

      // Basic operations should work
      const count = await users.count();
      expect(count).toBe(1);

      const list = await users.list();
      expect(list).toHaveLength(1);

      const regionCount = await users.count({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(regionCount).toBe(1);
    });
  });
}); 