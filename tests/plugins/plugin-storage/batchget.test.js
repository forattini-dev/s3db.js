import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - batchGet', () => {
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
