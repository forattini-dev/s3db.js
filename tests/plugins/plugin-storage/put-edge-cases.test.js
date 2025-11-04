import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - put - Edge Cases', () => {
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
