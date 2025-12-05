import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - Error handling', () => {
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

  test('should throw descriptive error on put failure', async () => {
    // Create invalid storage with bad client
    const badClient = {
      putObject: async () => {
        throw new Error('S3 connection failed');
      }
    };

    const badStorage = new PluginStorage(badClient, 'test');

    await expect(
      badStorage.set('test-key', { data: 'test' })
    ).rejects.toThrow(/Failed to save plugin data/);
  });

  test('should throw descriptive error on get failure (non-NoSuchKey)', async () => {
    const badClient = {
      getObject: async () => {
        const error = new Error('Access denied');
        error.name = 'AccessDenied';
        throw error;
      }
    };

    const badStorage = new PluginStorage(badClient, 'test');

    await expect(
      badStorage.get('test-key')
    ).rejects.toThrow(/Failed to retrieve plugin data/);
  });

  test('should throw on JSON parse error in get', async () => {
    const key = storage.getPluginKey(null, 'invalid-json-body');

    // Put invalid JSON directly
    await db.client.putObject({
      key,
      body: '{invalid json}'
    });

    await expect(
      storage.get(key)
    ).rejects.toThrow(/Failed to parse JSON body/);
  });

  test('should throw descriptive error on list failure', async () => {
    const badClient = {
      listObjects: async () => {
        throw new Error('List operation failed');
      }
    };

    const badStorage = new PluginStorage(badClient, 'test');

    await expect(
      badStorage.list()
    ).rejects.toThrow(/Failed to list plugin data/);
  });

  test('should throw descriptive error on listForResource failure', async () => {
    const badClient = {
      listObjects: async () => {
        throw new Error('List operation failed');
      }
    };

    const badStorage = new PluginStorage(badClient, 'test');

    await expect(
      badStorage.listForResource('users')
    ).rejects.toThrow(/Failed to list resource data/);
  });

  test('should throw descriptive error on delete failure', async () => {
    const badClient = {
      deleteObject: async () => {
        throw new Error('Delete operation failed');
      }
    };

    const badStorage = new PluginStorage(badClient, 'test');

    await expect(
      badStorage.delete('test-key')
    ).rejects.toThrow(/Failed to delete plugin data/);
  });
});
