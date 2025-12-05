import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - delete', () => {
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

  test('should delete a single key', async () => {
    const key = storage.getPluginKey(null, 'to-delete');
    await storage.set(key, { test: 1 });

    // Verify it exists
    let data = await storage.get(key);
    expect(data).toEqual({ test: 1 });

    // Delete it
    await storage.delete(key);

    // Verify it's gone
    data = await storage.get(key);
    expect(data).toBeNull();
  });

  test('should not throw when deleting non-existent key', async () => {
    const key = storage.getPluginKey(null, 'does-not-exist');
    await expect(storage.delete(key)).resolves.not.toThrow();
  });
});
