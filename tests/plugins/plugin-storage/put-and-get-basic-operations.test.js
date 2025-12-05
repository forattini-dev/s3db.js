import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - put and get - Basic Operations', () => {
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
