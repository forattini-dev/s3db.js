import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - deleteAll', () => {
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
