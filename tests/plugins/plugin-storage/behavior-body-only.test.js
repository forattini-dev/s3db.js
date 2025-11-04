import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - Behavior: body-only', () => {
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
