import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - batchSet', () => {
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
