import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - listForResource', () => {
  let db;
  let storage;

  beforeEach(async () => {
    db = createDatabaseForTest('plugin-storage');
    await db.connect();

    storage = new PluginStorage(db.client, 'test-plugin');
  });

  afterEach(async () => {
    try {
      await storage.deleteAll();
    } catch (err) {
      // Ignore cleanup errors
    }

    await db.disconnect();
  });

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
