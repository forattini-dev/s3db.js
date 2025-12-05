import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - Behavior: enforce-limits', () => {
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

  test('should throw if data exceeds metadata limit', async () => {
    const key = storage.getPluginKey(null, 'too-large');
    const largeData = {
      field1: 'x'.repeat(1000),
      field2: 'y'.repeat(1000),
      field3: 'z'.repeat(1000)
    };

    await expect(
      storage.set(key, largeData, { behavior: 'enforce-limits' })
    ).rejects.toThrow('exceeds metadata limit');
  });

  test('should succeed if data fits in metadata', async () => {
    const key = storage.getPluginKey(null, 'small-data');
    const smallData = {
      name: 'Test',
      count: 42
    };

    await expect(
      storage.set(key, smallData, { behavior: 'enforce-limits' })
    ).resolves.not.toThrow();

    const retrieved = await storage.get(key);
    expect(retrieved).toEqual(smallData);
  });
});
