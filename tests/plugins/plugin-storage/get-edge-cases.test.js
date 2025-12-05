import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - get - Edge Cases', () => {
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
