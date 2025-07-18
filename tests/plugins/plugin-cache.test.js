import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

import { createDatabaseForTest } from '#tests/config.js';
import { CachePlugin } from '#src/plugins/cache.plugin.js';
import { MemoryCache } from '#src/plugins/cache/index.js';
import { S3Cache } from '#src/plugins/cache/s3-cache.class.js';

describe('Cache Plugin', () => {
  let database;
  let client;

  beforeEach(async () => {
    database = createDatabaseForTest('plugins-cache');
    await database.connect();
    client = database.client;
  });

  test('minimal count test', async () => {
    const users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'email|required',
        department: 'string|required',
        region: 'string|required'
      }
    });
    await users.insertMany([
      { id: 'user1', name: 'John Doe', email: 'john@example.com', department: 'IT', region: 'SP' },
      { id: 'user2', name: 'Jane Smith', email: 'jane@example.com', department: 'HR', region: 'RJ' },
      { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com', department: 'IT', region: 'SP' }
    ]);
    const count = await users.count();
    expect(count).toBe(3);
    await database.disconnect();
  });

  describe('Cache Plugin - Real Integration Tests', () => {
    let cachePlugin;
    let users;
    let products;

    beforeEach(async () => {
      cachePlugin = new CachePlugin({
        driverType: 'memory',
        ttl: 60000, // 60 seconds TTL in ms
        maxSize: 100 // Limit cache size
      });
      await cachePlugin.setup(database);
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'email|required',
          department: 'string|required',
          region: 'string|required'
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
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          description: 'string',
          category: 'string'
        }
      });
    });

    afterEach(async () => {
      // Clear cache
      if (cachePlugin && cachePlugin.driver) {
        await cachePlugin.clearAllCache();
      }
      // Drop all resources to free memory
      if (database && database.resources) {
        for (const resourceName of Object.keys(database.resources)) {
          await database.deleteResource?.(resourceName);
        }
      }
      // Disconnect database
      if (database) {
        await database.disconnect?.();
      }
      // Force garbage collection if available
      if (global.gc) global.gc();
    });

    describe('Setup and Initialization', () => {
      test('should setup cache plugin with memory driver', async () => {
        expect(cachePlugin.driver).toBeInstanceOf(MemoryCache);
        expect(cachePlugin.database).toBe(database);
      });

      test('should install cache hooks on resources', async () => {
        expect(users.cache).toBeDefined();
        expect(typeof users.cacheKeyFor).toBe('function');
        expect(products.cache).toBeDefined();
        expect(typeof products.cacheKeyFor).toBe('function');
      });


    });

    describe('Cache Key Generation', () => {
      test('should generate cache key for count operation', async () => {
        const key = await users.cacheKeyFor({ action: 'count' });
        expect(key).toContain('resource=users');
        expect(key).toContain('action=count');
        expect(key).toMatch(/\.json\.gz$/);
      });

      test('should generate cache key with parameters', async () => {
        const key = await users.cacheKeyFor({
          action: 'getMany',
          params: { ids: ['user1', 'user2'] }
        });
        expect(key).toContain('resource=users');
        expect(key).toContain('action=getMany');
      });

      test('should generate cache key with partition information', async () => {
        const key = await users.cacheKeyFor({
          action: 'list',
          partition: 'byDepartment',
          partitionValues: { department: 'IT' }
        });
        expect(key).toContain('resource=users');
        expect(key).toContain('action=list');
        expect(key).toContain('partition:byDepartment');
        expect(key).toContain('department:IT');
      });
    });

    describe('Read Operations Caching', () => {
      beforeEach(async () => {
        // Insert test data
        await users.insertMany([
          { id: 'user1', name: 'John Doe', email: 'john@example.com', department: 'IT', region: 'SP' },
          { id: 'user2', name: 'Jane Smith', email: 'jane@example.com', department: 'HR', region: 'RJ' },
          { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com', department: 'IT', region: 'SP' }
        ]);
      });

      test('should cache count result', async () => {
        // First call should hit the database
        const key1 = await users.cacheKeyFor({ action: 'count' });
        const count1 = await users.count();
        expect(count1).toBe(3);
        const cacheStats1 = await cachePlugin.getCacheStats();

        // Second call should use cache
        const key2 = await users.cacheKeyFor({ action: 'count' });
        const count2 = await users.count();
        expect(count2).toBe(3);
        const cacheStats2 = await cachePlugin.getCacheStats();

        // Verify cache was used
        const cacheStats = await cachePlugin.getCacheStats();
        expect(cacheStats.size).toBeGreaterThan(0);
      });

      test('should cache listIds result', async () => {
        const ids1 = await users.listIds();
        expect(ids1).toHaveLength(3);
        expect(ids1).toContain('user1');
        expect(ids1).toContain('user2');
        expect(ids1).toContain('user3');

        const ids2 = await users.listIds();
        expect(ids2).toEqual(ids1);
      });

      test('should cache getMany result', async () => {
        const users1 = await users.getMany(['user1', 'user2']);
        expect(users1).toHaveLength(2);

        const users2 = await users.getMany(['user1', 'user2']);
        expect(users2).toEqual(users1);
      });

      test('should cache getAll result', async () => {
        const allUsers1 = await users.getAll();
        expect(allUsers1).toHaveLength(3);

        const allUsers2 = await users.getAll();
        expect(allUsers2).toEqual(allUsers1);
      });

      test('should cache page result', async () => {
        const page1 = await users.page({ offset: 0, size: 2 });
        expect(page1.items).toHaveLength(2);

        const page2 = await users.page({ offset: 0, size: 2 });
        expect(page2.items).toEqual(page1.items);
      });

      test('should cache list result', async () => {
        const list1 = await users.list();
        expect(list1).toHaveLength(3);

        const list2 = await users.list();
        expect(list2).toEqual(list1);
      });

      test('should cache count with partition', async () => {
        const itCount1 = await users.count({
          partition: 'byDepartment',
          partitionValues: { department: 'IT' }
        });
        expect(itCount1).toBe(2);

        const itCount2 = await users.count({
          partition: 'byDepartment',
          partitionValues: { department: 'IT' }
        });
        expect(itCount2).toBe(2);
      });
    });

    describe('Write Operations Cache Invalidation', () => {
      beforeEach(async () => {
        await users.insert({
          id: 'user1',
          name: 'John Doe',
          email: 'john@example.com',
          department: 'IT',
          region: 'SP'
        });
      });

      test('should clear cache on insert', async () => {
        // Get initial count (should be cached)
        const initialCount = await users.count();
        expect(initialCount).toBe(1);

        // Insert new user
        await users.insert({
          id: 'user2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          department: 'HR',
          region: 'RJ'
        });

        // Count should reflect new data (cache cleared)
        const newCount = await users.count();
        expect(newCount).toBe(2);
      });

      test('should clear cache on update', async () => {
        // Get initial user
        const initialUser = await users.get('user1');
        expect(initialUser.name).toBe('John Doe');

        // Update user
        await users.update('user1', { name: 'John Smith' });

        // Get user again (should reflect update)
        const updatedUser = await users.get('user1');
        expect(updatedUser.name).toBe('John Smith');
      });

      test('should clear cache on delete', async () => {
        // Get initial count
        const initialCount = await users.count();
        expect(initialCount).toBe(1);

        // Delete user
        await users.delete('user1');

        // Count should reflect deletion
        const newCount = await users.count();
        expect(newCount).toBe(0);
      });

      test('should clear cache on deleteMany', async () => {
        // Insert more users
        await users.insertMany([
          { id: 'user2', name: 'Jane Smith', email: 'jane@example.com', department: 'HR', region: 'RJ' },
          { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com', department: 'IT', region: 'SP' }
        ]);

        // Get initial count
        const initialCount = await users.count();
        expect(initialCount).toBe(3);

        // Delete multiple users
        await users.deleteMany(['user1', 'user2']);

        // Count should reflect deletions
        const newCount = await users.count();
        expect(newCount).toBe(1);
      });
    });

    describe('Partition Cache Invalidation', () => {
      beforeEach(async () => {
        await users.insertMany([
          { id: 'user1', name: 'John Doe', email: 'john@example.com', department: 'IT', region: 'SP' },
          { id: 'user2', name: 'Jane Smith', email: 'jane@example.com', department: 'HR', region: 'RJ' },
          { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com', department: 'IT', region: 'SP' }
        ]);
      });

      test('should clear partition cache when inserting with partition data', async () => {
        // Get initial partition counts
        const itCount1 = await users.count({
          partition: 'byDepartment',
          partitionValues: { department: 'IT' }
        });
        expect(itCount1).toBe(2);

        const hrCount1 = await users.count({
          partition: 'byDepartment',
          partitionValues: { department: 'HR' }
        });
        expect(hrCount1).toBe(1);

        // Insert new IT user
        await users.insert({
          id: 'user4',
          name: 'Alice Johnson',
          email: 'alice@example.com',
          department: 'IT',
          region: 'SP'
        });

        // Partition counts should be updated
        const itCount2 = await users.count({
          partition: 'byDepartment',
          partitionValues: { department: 'IT' }
        });
        expect(itCount2).toBe(3);

        const hrCount2 = await users.count({
          partition: 'byDepartment',
          partitionValues: { department: 'HR' }
        });
        expect(hrCount2).toBe(1);
      });
    });

    describe('Cache Statistics and Management', () => {
      test('should provide cache statistics', async () => {
        const stats = await cachePlugin.getCacheStats();

        expect(stats).toBeDefined();
        expect(stats.size).toBeGreaterThanOrEqual(0);
        expect(stats.keys).toBeDefined();
        expect(stats.driver).toBe('MemoryCache');
      });

      test('should clear all cache', async () => {
        // Insert some data to populate cache
        await users.insert({
          id: 'user1',
          name: 'John Doe',
          email: 'john@example.com',
          department: 'IT',
          region: 'SP'
        });

        await users.count(); // This should cache the result

        // Clear all cache
        await cachePlugin.clearAllCache();

        // Cache should be empty
        const stats = await cachePlugin.getCacheStats();
        expect(stats.size).toBe(0);
      });

      test('should warm cache for resource', async () => {
        // Insert test data
        await users.insertMany([
          { id: 'user1', name: 'John Doe', email: 'john@example.com', department: 'IT', region: 'SP' },
          { id: 'user2', name: 'Jane Smith', email: 'jane@example.com', department: 'HR', region: 'RJ' }
        ]);

        // Warm cache
        await cachePlugin.warmCache('users');

        // Cache should be populated
        const stats = await cachePlugin.getCacheStats();
        expect(stats.size).toBeGreaterThan(0);
      });

      test('should warm partition cache when enabled', async () => {
        // Insert test data
        await users.insertMany([
          { id: 'user1', name: 'John Doe', email: 'john@example.com', department: 'IT', region: 'SP' },
          { id: 'user2', name: 'Jane Smith', email: 'jane@example.com', department: 'HR', region: 'RJ' }
        ]);

        // Warm cache with partitions
        await cachePlugin.warmCache('users', { includePartitions: true });

        // Cache should be populated
        const stats = await cachePlugin.getCacheStats();
        expect(stats.size).toBeGreaterThan(0);
      });
    });

    describe('S3Cache Integration', () => {
      test('should work with S3Cache driver', async () => {
        const s3CachePlugin = new CachePlugin({
          enabled: true,
          driverType: 's3',
          ttl: 3600,
          client: database.client // Passa explicitamente o client real
        });
        await s3CachePlugin.setup(database);
        // Verificação explícita
        const cacheClient = users.cache?.client;
        expect(typeof cacheClient?.getAllKeys).toBe('function');
        expect(s3CachePlugin.driver).toBeInstanceOf(S3Cache);
        expect(users.cache).toBeInstanceOf(S3Cache);
      });
    });

    describe('Error Handling', () => {
      test('should handle cache errors gracefully', async () => {
        // Insert test data
        await users.insert({
          id: 'user1',
          name: 'John Doe',
          email: 'john@example.com',
          department: 'IT',
          region: 'SP'
        });

        // Operations should still work even if cache fails
        const count = await users.count();
        expect(count).toBe(1);

        const user = await users.get('user1');
        expect(user.name).toBe('John Doe');
      });
    });

    describe('Performance', () => {
      test('should improve performance with caching', async () => {
        // Insert test data
        await users.insertMany([
          { id: 'user1', name: 'John Doe', email: 'john@example.com', department: 'IT', region: 'SP' },
          { id: 'user2', name: 'Jane Smith', email: 'jane@example.com', department: 'HR', region: 'RJ' },
          { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com', department: 'IT', region: 'SP' }
        ]);

        // First call (cache miss)
        const startTime1 = Date.now();
        await users.count();
        const time1 = Date.now() - startTime1;

        // Second call (cache hit)
        const startTime2 = Date.now();
        await users.count();
        const time2 = Date.now() - startTime2;

        // Cached call should be faster
        expect(time2).toBeLessThan(time1);
      });
    });

    describe('CachePlugin Detailed Flows', () => {
      beforeEach(async () => {
        // Em vez de deleteAll, sobrescreva os dados
        await users.insertMany([
          { id: 'user1', name: 'John Doe', email: 'john@example.com', department: 'IT', region: 'SP' },
          { id: 'user2', name: 'Jane Smith', email: 'jane@example.com', department: 'HR', region: 'RJ' },
          { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com', department: 'IT', region: 'SP' }
        ], { overwrite: true });
        await users.count(); // Popula o cache
      });

      test('should invalidate only relevant cache keys after deleteMany', async () => {
        const clearSpy = jest.spyOn(cachePlugin.driver, 'clear');
        // Não espionar delete, pois deleteMany usa clear
        await users.deleteMany(['user1', 'user2']);
        expect(clearSpy).toHaveBeenCalled();
        // Não espera deleteSpy
        const count = await users.count();
        expect(count).toBe(1);
        clearSpy.mockRestore();
      });

      // Outros testes detalhados podem ser adicionados aqui...
    });
  });
}); 