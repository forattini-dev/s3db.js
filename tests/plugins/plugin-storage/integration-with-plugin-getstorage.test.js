import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - Integration with Plugin.getStorage()', () => {
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

  test('should work with Plugin.getStorage()', async () => {
    // Create a test plugin
    class TestPlugin extends Plugin {
      constructor(options = {}) {
        super({ ...options, slug: 'integration-test' });
      }

      async onInstall() {
        const storage = this.getStorage();
        await storage.set(
          storage.getPluginKey(null, 'config'),
          { initialized: true }
        );
      }
    }

    const plugin = new TestPlugin();
    await plugin.install(db);

    // Verify data was saved
    const pluginStorage = new PluginStorage(db.client, 'integration-test');
    const config = await pluginStorage.get(
      pluginStorage.getPluginKey(null, 'config')
    );

    expect(config).toEqual({ initialized: true });

    // Cleanup
    await pluginStorage.deleteAll();
  });

  test('should isolate data between different plugin instances', async () => {
    class Plugin1 extends Plugin {
      constructor() {
        super({ slug: 'plugin-one' });
      }

      async onInstall() {
        const storage = this.getStorage();
        await storage.set(
          storage.getPluginKey(null, 'data'),
          { plugin: 'one' }
        );
      }
    }

    class Plugin2 extends Plugin {
      constructor() {
        super({ slug: 'plugin-two' });
      }

      async onInstall() {
        const storage = this.getStorage();
        await storage.set(
          storage.getPluginKey(null, 'data'),
          { plugin: 'two' }
        );
      }
    }

    const p1 = new Plugin1();
    const p2 = new Plugin2();

    await p1.install(db);
    await p2.install(db);

    // Verify data isolation
    const storage1 = new PluginStorage(db.client, 'plugin-one');
    const storage2 = new PluginStorage(db.client, 'plugin-two');

    const data1 = await storage1.get(storage1.getPluginKey(null, 'data'));
    const data2 = await storage2.get(storage2.getPluginKey(null, 'data'));

    expect(data1).toEqual({ plugin: 'one' });
    expect(data2).toEqual({ plugin: 'two' });

    // Cleanup
    await storage1.deleteAll();
    await storage2.deleteAll();
  });

  test('should support resource-scoped data in plugins', async () => {
    class CachePlugin extends Plugin {
      constructor() {
        super({ slug: 'cache-plugin' });
      }

      async onInstall() {
        const storage = this.getStorage();

        // Cache data for different resources
        await storage.set(
          storage.getPluginKey('users', 'cache', 'user-1'),
          { name: 'Alice', cached: true }
        );

        await storage.set(
          storage.getPluginKey('products', 'cache', 'prod-1'),
          { title: 'Product 1', cached: true }
        );
      }
    }

    const plugin = new CachePlugin();
    await plugin.install(db);

    const storage = new PluginStorage(db.client, 'cache-plugin');

    // List all cached users
    const userKeys = await storage.listForResource('users', 'cache');
    expect(userKeys.length).toBe(1);

    // List all cached products
    const productKeys = await storage.listForResource('products', 'cache');
    expect(productKeys.length).toBe(1);

    // Cleanup
    await storage.deleteAll();
  });
});
