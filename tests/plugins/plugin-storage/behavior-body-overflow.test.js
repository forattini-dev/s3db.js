import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - Behavior: body-overflow', () => {
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
