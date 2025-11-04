import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - list', () => {
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
