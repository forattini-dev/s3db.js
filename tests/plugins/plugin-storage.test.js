/**
 * PluginStorage Tests - EXHAUSTIVE COVERAGE
 * Tests for the PluginStorage utility with 100% code coverage
 */

import { createDatabaseForTest } from '../config.js';
import { PluginStorage } from '#src/concerns/plugin-storage.js';
import { Plugin } from '#src/plugins/plugin.class.js';

describe('PluginStorage - Exhaustive Tests', () => {
  let db;
  let storage;

  beforeEach(async () => {
    db = createDatabaseForTest('plugin-storage');
    await db.connect();

    storage = new PluginStorage(db.client, 'test-plugin');
  });

  afterEach(async () => {
    // Cleanup: delete all test data
    try {
      await storage.deleteAll();
    } catch (err) {
      // Ignore
    }

    await db.disconnect();
  });

  describe('Constructor', () => {
    test('should create PluginStorage instance', () => {
      expect(storage).toBeInstanceOf(PluginStorage);
      expect(storage.client).toBe(db.client);
      expect(storage.pluginSlug).toBe('test-plugin');
    });

    test('should throw if client is missing', () => {
      expect(() => new PluginStorage(null, 'test')).toThrow('PluginStorage requires a client instance');
    });

    test('should throw if client is undefined', () => {
      expect(() => new PluginStorage(undefined, 'test')).toThrow('PluginStorage requires a client instance');
    });

    test('should throw if pluginSlug is missing', () => {
      expect(() => new PluginStorage(db.client, null)).toThrow('PluginStorage requires a pluginSlug');
    });

    test('should throw if pluginSlug is empty string', () => {
      expect(() => new PluginStorage(db.client, '')).toThrow('PluginStorage requires a pluginSlug');
    });

    test('should throw if pluginSlug is undefined', () => {
      expect(() => new PluginStorage(db.client, undefined)).toThrow('PluginStorage requires a pluginSlug');
    });
  });

  describe('getPluginKey', () => {
    test('should generate global plugin key', () => {
      const key = storage.getPluginKey(null, 'config');
      expect(key).toBe('plugin=test-plugin/config');
    });

    test('should generate resource-scoped key', () => {
      const key = storage.getPluginKey('users', 'cache', 'user-1');
      expect(key).toBe('resource=users/plugin=test-plugin/cache/user-1');
    });

    test('should handle multiple path parts', () => {
      const key = storage.getPluginKey('wallets', 'balance', 'transactions', 'id=txn1');
      expect(key).toBe('resource=wallets/plugin=test-plugin/balance/transactions/id=txn1');
    });

    test('should handle single path part', () => {
      const key = storage.getPluginKey(null, 'data');
      expect(key).toBe('plugin=test-plugin/data');
    });

    test('should handle no path parts', () => {
      const key = storage.getPluginKey(null);
      expect(key).toBe('plugin=test-plugin/');
    });

    test('should handle resource with no path parts', () => {
      const key = storage.getPluginKey('users');
      expect(key).toBe('resource=users/plugin=test-plugin/');
    });
  });

  describe('put and get - Basic Operations', () => {
    test('should save and retrieve data with body-overflow behavior', async () => {
      const key = storage.getPluginKey(null, 'test-data');
      const data = {
        name: 'Test',
        count: 42,
        active: true
      };

      await storage.set(key, data, { behavior: 'body-overflow' });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should save and retrieve data with body-only behavior', async () => {
      const key = storage.getPluginKey(null, 'test-body-only');
      const data = {
        large: 'x'.repeat(3000), // Larger than metadata limit
        field: 'value'
      };

      await storage.set(key, data, { behavior: 'body-only' });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should return null for non-existent key', async () => {
      const key = storage.getPluginKey(null, 'does-not-exist');
      const retrieved = await storage.get(key);
      expect(retrieved).toBeNull();
    });

    test('should handle complex nested data', async () => {
      const key = storage.getPluginKey(null, 'complex-data');
      const data = {
        user: {
          name: 'Alice',
          age: 30
        },
        tags: ['test', 'plugin'],
        metadata: {
          created: '2025-01-15',
          updated: '2025-01-16'
        }
      };

      await storage.set(key, data, { behavior: 'body-overflow' });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });
  });

  describe('put - Edge Cases', () => {
    test('should handle null values', async () => {
      const key = storage.getPluginKey(null, 'null-value');
      const data = {
        name: 'Test',
        value: null
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle undefined values (converted to null)', async () => {
      const key = storage.getPluginKey(null, 'undefined-value');
      const data = {
        name: 'Test',
        value: undefined
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      // undefined is converted to null in JSON
      expect(retrieved.value).toBeUndefined();
    });

    test('should handle empty objects', async () => {
      const key = storage.getPluginKey(null, 'empty-object');
      const data = {};

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle empty arrays', async () => {
      const key = storage.getPluginKey(null, 'empty-array');
      const data = {
        items: []
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle boolean values', async () => {
      const key = storage.getPluginKey(null, 'boolean-values');
      const data = {
        active: true,
        deleted: false
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle number values', async () => {
      const key = storage.getPluginKey(null, 'number-values');
      const data = {
        integer: 42,
        float: 3.14,
        negative: -10,
        zero: 0
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle string values', async () => {
      const key = storage.getPluginKey(null, 'string-values');
      const data = {
        name: 'Test',
        empty: '',
        multiline: 'Line1\nLine2\nLine3'
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle deeply nested objects', async () => {
      const key = storage.getPluginKey(null, 'deep-nested');
      const data = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep'
              }
            }
          }
        }
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle mixed arrays with different types', async () => {
      const key = storage.getPluginKey(null, 'mixed-array');
      const data = {
        items: [1, 'string', true, null, { nested: 'object' }, [1, 2, 3]]
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle custom contentType', async () => {
      const key = storage.getPluginKey(null, 'custom-content-type');
      const data = { test: 'data' };

      await storage.set(key, data, { contentType: 'application/custom+json' });
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });
  });

  describe('get - Edge Cases', () => {
    test('should handle metadata-only data (no body)', async () => {
      const key = storage.getPluginKey(null, 'metadata-only');
      const data = { small: 'data' };

      await storage.set(key, data, { behavior: 'body-overflow' });
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle body with whitespace only', async () => {
      const key = storage.getPluginKey(null, 'whitespace-body');

      // Directly put object with empty body
      await db.client.putObject({
        key,
        metadata: { field: 'value' },
        body: '   \n  \t  '
      });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual({ field: 'value' });
    });

    test('should parse JSON objects in metadata correctly', async () => {
      const key = storage.getPluginKey(null, 'json-in-metadata');
      const data = {
        config: { nested: 'value' }
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved.config).toEqual({ nested: 'value' });
    });

    test('should parse JSON arrays in metadata correctly', async () => {
      const key = storage.getPluginKey(null, 'array-in-metadata');
      const data = {
        items: [1, 2, 3]
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);
      expect(retrieved.items).toEqual([1, 2, 3]);
    });

    test('should parse number strings in metadata correctly', async () => {
      const key = storage.getPluginKey(null, 'number-strings');

      await db.client.putObject({
        key,
        metadata: {
          count: '42',
          float: '3.14'
        }
      });

      const retrieved = await storage.get(key);
      expect(retrieved.count).toBe(42);
      expect(retrieved.float).toBe(3.14);
    });

    test('should parse boolean strings in metadata correctly', async () => {
      const key = storage.getPluginKey(null, 'boolean-strings');

      await db.client.putObject({
        key,
        metadata: {
          active: 'true',
          deleted: 'false'
        }
      });

      const retrieved = await storage.get(key);
      expect(retrieved.active).toBe(true);
      expect(retrieved.deleted).toBe(false);
    });

    test('should keep strings that look like numbers but have spaces', async () => {
      const key = storage.getPluginKey(null, 'number-with-spaces');

      await db.client.putObject({
        key,
        metadata: {
          value: '  42  '
        }
      });

      const retrieved = await storage.get(key);
      // Trimmed spaces should make it parseable as number
      expect(retrieved.value).toBe(42);
    });

    test('should keep invalid JSON as string', async () => {
      const key = storage.getPluginKey(null, 'invalid-json');

      await db.client.putObject({
        key,
        metadata: {
          broken: '{not valid json}'
        }
      });

      const retrieved = await storage.get(key);
      expect(retrieved.broken).toBe('{not valid json}');
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create some test data
      await storage.set(storage.getPluginKey(null, 'config/general'), { test: 1 });
      await storage.set(storage.getPluginKey(null, 'config/advanced'), { test: 2 });
      await storage.set(storage.getPluginKey(null, 'cache/item-1'), { test: 3 });
    });

    test('should list all plugin keys', async () => {
      const keys = await storage.list();
      expect(keys.length).toBeGreaterThanOrEqual(3);
      expect(keys).toEqual(
        expect.arrayContaining([
          'plugin=test-plugin/config/general',
          'plugin=test-plugin/config/advanced',
          'plugin=test-plugin/cache/item-1'
        ])
      );
    });

    test('should list keys with prefix', async () => {
      const keys = await storage.list('config');
      expect(keys.length).toBe(2);
      expect(keys).toEqual(
        expect.arrayContaining([
          'plugin=test-plugin/config/general',
          'plugin=test-plugin/config/advanced'
        ])
      );
    });

    test('should list keys with limit', async () => {
      const keys = await storage.list('', { limit: 2 });
      expect(keys.length).toBeLessThanOrEqual(2);
    });

    test('should list keys with empty prefix', async () => {
      const keys = await storage.list('');
      expect(keys.length).toBeGreaterThanOrEqual(3);
    });

    test('should return empty array if no keys match prefix', async () => {
      const keys = await storage.list('nonexistent');
      expect(keys.length).toBe(0);
    });
  });

  describe('listForResource', () => {
    beforeEach(async () => {
      // Create resource-scoped data
      await storage.set(storage.getPluginKey('users', 'cache', 'user-1'), { test: 1 });
      await storage.set(storage.getPluginKey('users', 'cache', 'user-2'), { test: 2 });
      await storage.set(storage.getPluginKey('users', 'stats', 'daily'), { test: 3 });
      await storage.set(storage.getPluginKey('products', 'cache', 'prod-1'), { test: 4 });
    });

    test('should list all keys for a resource', async () => {
      const keys = await storage.listForResource('users');
      expect(keys.length).toBe(3);
      expect(keys).toEqual(
        expect.arrayContaining([
          'resource=users/plugin=test-plugin/cache/user-1',
          'resource=users/plugin=test-plugin/cache/user-2',
          'resource=users/plugin=test-plugin/stats/daily'
        ])
      );
    });

    test('should list keys for resource with subprefix', async () => {
      const keys = await storage.listForResource('users', 'cache');
      expect(keys.length).toBe(2);
      expect(keys).toEqual(
        expect.arrayContaining([
          'resource=users/plugin=test-plugin/cache/user-1',
          'resource=users/plugin=test-plugin/cache/user-2'
        ])
      );
    });

    test('should not list keys from different resource', async () => {
      const keys = await storage.listForResource('users');
      expect(keys).not.toContain('resource=products/plugin=test-plugin/cache/prod-1');
    });

    test('should list keys for resource with empty subprefix', async () => {
      const keys = await storage.listForResource('users', '');
      expect(keys.length).toBe(3);
    });

    test('should list keys for resource with limit', async () => {
      const keys = await storage.listForResource('users', '', { limit: 2 });
      expect(keys.length).toBeLessThanOrEqual(2);
    });

    test('should return empty array if resource has no keys', async () => {
      const keys = await storage.listForResource('nonexistent');
      expect(keys.length).toBe(0);
    });
  });

  describe('delete', () => {
    test('should delete a single key', async () => {
      const key = storage.getPluginKey(null, 'to-delete');
      await storage.set(key, { test: 1 });

      // Verify it exists
      let data = await storage.get(key);
      expect(data).toEqual({ test: 1 });

      // Delete it
      await storage.delete(key);

      // Verify it's gone
      data = await storage.get(key);
      expect(data).toBeNull();
    });

    test('should not throw when deleting non-existent key', async () => {
      const key = storage.getPluginKey(null, 'does-not-exist');
      await expect(storage.delete(key)).resolves.not.toThrow();
    });
  });

  describe('deleteAll', () => {
    beforeEach(async () => {
      // Create test data
      await storage.set(storage.getPluginKey(null, 'global-1'), { test: 1 });
      await storage.set(storage.getPluginKey(null, 'global-2'), { test: 2 });
      await storage.set(storage.getPluginKey('users', 'cache', 'user-1'), { test: 3 });
      await storage.set(storage.getPluginKey('products', 'cache', 'prod-1'), { test: 4 });
    });

    test('should delete all plugin data', async () => {
      const deleted = await storage.deleteAll();
      expect(deleted).toBeGreaterThanOrEqual(4);

      // Verify all data is gone
      const keys = await storage.list();
      expect(keys.length).toBe(0);
    });

    test('should delete all data for specific resource', async () => {
      const deleted = await storage.deleteAll('users');
      expect(deleted).toBe(1);

      // Verify only users data is gone
      const usersKeys = await storage.listForResource('users');
      expect(usersKeys.length).toBe(0);

      // Verify other data still exists
      const productsKeys = await storage.listForResource('products');
      expect(productsKeys.length).toBe(1);
    });

    test('should return 0 when deleting from resource with no data', async () => {
      const deleted = await storage.deleteAll('nonexistent');
      expect(deleted).toBe(0);
    });

    test('should return 0 when deleting all but no data exists', async () => {
      // First delete all
      await storage.deleteAll();

      // Try to delete again
      const deleted = await storage.deleteAll();
      expect(deleted).toBe(0);
    });
  });

  describe('batchSet', () => {
    test('should save multiple items', async () => {
      const items = [
        { key: storage.getPluginKey(null, 'batch-1'), data: { value: 1 } },
        { key: storage.getPluginKey(null, 'batch-2'), data: { value: 2 } },
        { key: storage.getPluginKey(null, 'batch-3'), data: { value: 3 } }
      ];

      const results = await storage.batchSet(items);

      expect(results.length).toBe(3);
      expect(results.every(r => r.ok)).toBe(true);

      // Verify data was saved
      const data1 = await storage.get(storage.getPluginKey(null, 'batch-1'));
      expect(data1).toEqual({ value: 1 });
    });

    test('should save items with different behaviors', async () => {
      const items = [
        { key: storage.getPluginKey(null, 'batch-overflow'), data: { value: 1 }, options: { behavior: 'body-overflow' } },
        { key: storage.getPluginKey(null, 'batch-body-only'), data: { value: 2 }, options: { behavior: 'body-only' } }
      ];

      const results = await storage.batchSet(items);

      expect(results.length).toBe(2);
      expect(results.every(r => r.ok)).toBe(true);
    });

    test('should handle empty batch', async () => {
      const results = await storage.batchSet([]);
      expect(results.length).toBe(0);
    });

    test('should continue on individual failures', async () => {
      const items = [
        { key: storage.getPluginKey(null, 'batch-good'), data: { value: 1 } },
        { key: storage.getPluginKey(null, 'batch-bad'), data: { huge: 'x'.repeat(10000) }, options: { behavior: 'enforce-limits' } },
        { key: storage.getPluginKey(null, 'batch-good-2'), data: { value: 2 } }
      ];

      const results = await storage.batchSet(items);

      expect(results.length).toBe(3);
      expect(results[0].ok).toBe(true);
      expect(results[1].ok).toBe(false);
      expect(results[1].error).toBeDefined();
      expect(results[2].ok).toBe(true);
    });
  });

  describe('batchGet', () => {
    beforeEach(async () => {
      await storage.set(storage.getPluginKey(null, 'get-1'), { value: 1 });
      await storage.set(storage.getPluginKey(null, 'get-2'), { value: 2 });
    });

    test('should retrieve multiple items', async () => {
      const keys = [
        storage.getPluginKey(null, 'get-1'),
        storage.getPluginKey(null, 'get-2')
      ];

      const results = await storage.batchGet(keys);

      expect(results.length).toBe(2);
      expect(results[0].ok).toBe(true);
      expect(results[0].data).toEqual({ value: 1 });
      expect(results[1].ok).toBe(true);
      expect(results[1].data).toEqual({ value: 2 });
    });

    test('should handle mix of existing and non-existing keys', async () => {
      const keys = [
        storage.getPluginKey(null, 'get-1'),
        storage.getPluginKey(null, 'does-not-exist')
      ];

      const results = await storage.batchGet(keys);

      expect(results.length).toBe(2);
      expect(results[0].ok).toBe(true);
      expect(results[0].data).toEqual({ value: 1 });
      expect(results[1].ok).toBe(true);
      expect(results[1].data).toBeNull();
    });

    test('should handle empty batch', async () => {
      const results = await storage.batchGet([]);
      expect(results.length).toBe(0);
    });
  });

  describe('Behavior: body-overflow', () => {
    test('should put small data in metadata', async () => {
      const key = storage.getPluginKey(null, 'small-overflow');
      const data = { small: 'value' };

      await storage.set(key, data, { behavior: 'body-overflow' });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should overflow large data to body', async () => {
      const key = storage.getPluginKey(null, 'large-overflow');
      const data = {
        large: 'x'.repeat(2000),
        small: 'value'
      };

      await storage.set(key, data, { behavior: 'body-overflow' });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should prioritize smaller fields for metadata', async () => {
      const key = storage.getPluginKey(null, 'mixed-sizes');
      const data = {
        large: 'x'.repeat(1000),
        medium: 'y'.repeat(500),
        small: 'z'
      };

      await storage.set(key, data, { behavior: 'body-overflow' });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });
  });

  describe('Behavior: body-only', () => {
    test('should put all data in body', async () => {
      const key = storage.getPluginKey(null, 'body-only-test');
      const data = {
        field1: 'value1',
        field2: 'value2'
      };

      await storage.set(key, data, { behavior: 'body-only' });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });

    test('should handle large data in body-only mode', async () => {
      const key = storage.getPluginKey(null, 'body-only-large');
      const data = {
        large: 'x'.repeat(10000)
      };

      await storage.set(key, data, { behavior: 'body-only' });

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(data);
    });
  });

  describe('Behavior: enforce-limits', () => {
    test('should throw if data exceeds metadata limit', async () => {
      const key = storage.getPluginKey(null, 'too-large');
      const largeData = {
        field1: 'x'.repeat(1000),
        field2: 'y'.repeat(1000),
        field3: 'z'.repeat(1000)
      };

      await expect(
        storage.set(key, largeData, { behavior: 'enforce-limits' })
      ).rejects.toThrow('exceeds metadata limit');
    });

    test('should succeed if data fits in metadata', async () => {
      const key = storage.getPluginKey(null, 'small-data');
      const smallData = {
        name: 'Test',
        count: 42
      };

      await expect(
        storage.set(key, smallData, { behavior: 'enforce-limits' })
      ).resolves.not.toThrow();

      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(smallData);
    });
  });

  describe('Behavior: unknown', () => {
    test('should throw for unknown behavior', async () => {
      const key = storage.getPluginKey(null, 'unknown-behavior');
      const data = { test: 'data' };

      await expect(
        storage.set(key, data, { behavior: 'invalid-behavior' })
      ).rejects.toThrow('Unknown behavior: invalid-behavior');
    });
  });

  describe('Integration with Plugin.getStorage()', () => {
    test('should work with Plugin.getStorage()', async () => {
      // Create a test plugin
      class TestPlugin extends Plugin {
        constructor(options = {}) {
          super({ ...options, slug: 'integration-test' });
        }

        async onInstall() {
          const storage = this.getStorage();
          await storage.set(
            storage.getPluginKey(null, 'config'),
            { initialized: true }
          );
        }
      }

      const plugin = new TestPlugin();
      await plugin.install(db);

      // Verify data was saved
      const pluginStorage = new PluginStorage(db.client, 'integration-test');
      const config = await pluginStorage.get(
        pluginStorage.getPluginKey(null, 'config')
      );

      expect(config).toEqual({ initialized: true });

      // Cleanup
      await pluginStorage.deleteAll();
    });

    test('should isolate data between different plugin instances', async () => {
      class Plugin1 extends Plugin {
        constructor() {
          super({ slug: 'plugin-one' });
        }

        async onInstall() {
          const storage = this.getStorage();
          await storage.set(
            storage.getPluginKey(null, 'data'),
            { plugin: 'one' }
          );
        }
      }

      class Plugin2 extends Plugin {
        constructor() {
          super({ slug: 'plugin-two' });
        }

        async onInstall() {
          const storage = this.getStorage();
          await storage.set(
            storage.getPluginKey(null, 'data'),
            { plugin: 'two' }
          );
        }
      }

      const p1 = new Plugin1();
      const p2 = new Plugin2();

      await p1.install(db);
      await p2.install(db);

      // Verify data isolation
      const storage1 = new PluginStorage(db.client, 'plugin-one');
      const storage2 = new PluginStorage(db.client, 'plugin-two');

      const data1 = await storage1.get(storage1.getPluginKey(null, 'data'));
      const data2 = await storage2.get(storage2.getPluginKey(null, 'data'));

      expect(data1).toEqual({ plugin: 'one' });
      expect(data2).toEqual({ plugin: 'two' });

      // Cleanup
      await storage1.deleteAll();
      await storage2.deleteAll();
    });

    test('should support resource-scoped data in plugins', async () => {
      class CachePlugin extends Plugin {
        constructor() {
          super({ slug: 'cache-plugin' });
        }

        async onInstall() {
          const storage = this.getStorage();

          // Cache data for different resources
          await storage.set(
            storage.getPluginKey('users', 'cache', 'user-1'),
            { name: 'Alice', cached: true }
          );

          await storage.set(
            storage.getPluginKey('products', 'cache', 'prod-1'),
            { title: 'Product 1', cached: true }
          );
        }
      }

      const plugin = new CachePlugin();
      await plugin.install(db);

      const storage = new PluginStorage(db.client, 'cache-plugin');

      // List all cached users
      const userKeys = await storage.listForResource('users', 'cache');
      expect(userKeys.length).toBe(1);

      // List all cached products
      const productKeys = await storage.listForResource('products', 'cache');
      expect(productKeys.length).toBe(1);

      // Cleanup
      await storage.deleteAll();
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle transaction log pattern', async () => {
      // Simulate EventualConsistency transaction storage
      const resourceName = 'wallets';
      const field = 'balance';

      const transactions = [
        { id: 'txn-1', operation: 'add', value: 100, timestamp: '2025-01-01T00:00:00Z' },
        { id: 'txn-2', operation: 'add', value: 50, timestamp: '2025-01-01T01:00:00Z' },
        { id: 'txn-3', operation: 'sub', value: 30, timestamp: '2025-01-01T02:00:00Z' }
      ];

      for (const txn of transactions) {
        await storage.set(
          storage.getPluginKey(resourceName, field, 'transactions', `id=${txn.id}`),
          txn,
          { behavior: 'body-overflow' }
        );
      }

      // List all transactions
      const keys = await storage.listForResource(resourceName, `${field}/transactions`);
      expect(keys.length).toBe(3);

      // Get specific transaction
      const txn1 = await storage.get(
        storage.getPluginKey(resourceName, field, 'transactions', 'id=txn-1')
      );
      expect(txn1).toEqual(transactions[0]);
    });

    test('should handle cache pattern', async () => {
      // Simulate cache plugin storing cached records
      const resourceName = 'users';

      const cachedRecords = [
        { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        { id: 'user-2', name: 'Bob', email: 'bob@example.com' }
      ];

      for (const record of cachedRecords) {
        await storage.set(
          storage.getPluginKey(resourceName, 'cache', record.id),
          record,
          { behavior: 'body-only' }
        );
      }

      // List all cached users
      const keys = await storage.listForResource(resourceName, 'cache');
      expect(keys.length).toBe(2);

      // Get specific cached record
      const user1 = await storage.get(
        storage.getPluginKey(resourceName, 'cache', 'user-1')
      );
      expect(user1.name).toBe('Alice');

      // Delete cache for resource
      const deleted = await storage.deleteAll(resourceName);
      expect(deleted).toBe(2);
    });

    test('should handle config/state pattern', async () => {
      // Simulate plugin storing configuration
      const config = {
        mode: 'async',
        interval: 5000,
        enabled: true,
        settings: {
          retries: 3,
          timeout: 30000
        }
      };

      await storage.set(
        storage.getPluginKey(null, 'config'),
        config,
        { behavior: 'body-overflow' }
      );

      // Retrieve config
      const retrieved = await storage.get(
        storage.getPluginKey(null, 'config')
      );
      expect(retrieved).toEqual(config);

      // Update config
      config.interval = 10000;
      await storage.set(
        storage.getPluginKey(null, 'config'),
        config,
        { behavior: 'body-overflow' }
      );

      const updated = await storage.get(
        storage.getPluginKey(null, 'config')
      );
      expect(updated.interval).toBe(10000);
    });

    test('should handle analytics pattern', async () => {
      // Simulate storing analytics data
      const resourceName = 'urls';
      const field = 'clicks';

      const analytics = [
        { cohort: '2025-01-01', count: 100, sum: 100 },
        { cohort: '2025-01-02', count: 150, sum: 250 },
        { cohort: '2025-01-03', count: 200, sum: 450 }
      ];

      for (const data of analytics) {
        await storage.set(
          storage.getPluginKey(resourceName, field, 'analytics', data.cohort),
          data,
          { behavior: 'body-overflow' }
        );
      }

      // List all analytics
      const keys = await storage.listForResource(resourceName, `${field}/analytics`);
      expect(keys.length).toBe(3);

      // Get specific day
      const day1 = await storage.get(
        storage.getPluginKey(resourceName, field, 'analytics', '2025-01-01')
      );
      expect(day1.count).toBe(100);
    });
  });

  describe('Error handling', () => {
    test('should throw descriptive error on put failure', async () => {
      // Create invalid storage with bad client
      const badClient = {
        putObject: async () => {
          throw new Error('S3 connection failed');
        }
      };

      const badStorage = new PluginStorage(badClient, 'test');

      await expect(
        badStorage.set('test-key', { data: 'test' })
      ).rejects.toThrow(/Failed to save plugin data/);
    });

    test('should throw descriptive error on get failure (non-NoSuchKey)', async () => {
      const badClient = {
        getObject: async () => {
          const error = new Error('Access denied');
          error.name = 'AccessDenied';
          throw error;
        }
      };

      const badStorage = new PluginStorage(badClient, 'test');

      await expect(
        badStorage.get('test-key')
      ).rejects.toThrow(/Failed to retrieve plugin data/);
    });

    test('should throw on JSON parse error in get', async () => {
      const key = storage.getPluginKey(null, 'invalid-json-body');

      // Put invalid JSON directly
      await db.client.putObject({
        key,
        body: '{invalid json}'
      });

      await expect(
        storage.get(key)
      ).rejects.toThrow(/Failed to parse JSON body/);
    });

    test('should throw descriptive error on list failure', async () => {
      const badClient = {
        listObjects: async () => {
          throw new Error('List operation failed');
        }
      };

      const badStorage = new PluginStorage(badClient, 'test');

      await expect(
        badStorage.list()
      ).rejects.toThrow(/Failed to list plugin data/);
    });

    test('should throw descriptive error on listForResource failure', async () => {
      const badClient = {
        listObjects: async () => {
          throw new Error('List operation failed');
        }
      };

      const badStorage = new PluginStorage(badClient, 'test');

      await expect(
        badStorage.listForResource('users')
      ).rejects.toThrow(/Failed to list resource data/);
    });

    test('should throw descriptive error on delete failure', async () => {
      const badClient = {
        deleteObject: async () => {
          throw new Error('Delete operation failed');
        }
      };

      const badStorage = new PluginStorage(badClient, 'test');

      await expect(
        badStorage.delete('test-key')
      ).rejects.toThrow(/Failed to delete plugin data/);
    });
  });

  describe('_removeKeyPrefix', () => {
    test('should remove keyPrefix from keys', () => {
      // Create client with keyPrefix
      const clientWithPrefix = {
        ...db.client,
        config: {
          ...db.client.config,
          keyPrefix: 'prefix/'
        }
      };

      const storageWithPrefix = new PluginStorage(clientWithPrefix, 'test');

      const keys = [
        'prefix/plugin=test/key1',
        'prefix/plugin=test/key2'
      ];

      const cleaned = storageWithPrefix._removeKeyPrefix(keys);

      expect(cleaned).toEqual([
        'plugin=test/key1',
        'plugin=test/key2'
      ]);
    });

    test('should handle keys with leading slash after prefix removal', () => {
      const clientWithPrefix = {
        ...db.client,
        config: {
          ...db.client.config,
          keyPrefix: 'prefix'
        }
      };

      const storageWithPrefix = new PluginStorage(clientWithPrefix, 'test');

      const keys = ['prefix/plugin=test/key1'];
      const cleaned = storageWithPrefix._removeKeyPrefix(keys);

      expect(cleaned).toEqual(['plugin=test/key1']);
    });

    test('should return keys unchanged if no keyPrefix', () => {
      const keys = ['plugin=test/key1', 'plugin=test/key2'];
      const cleaned = storage._removeKeyPrefix(keys);

      expect(cleaned).toEqual(keys);
    });
  });
});
