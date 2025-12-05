import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - _removeKeyPrefix', () => {
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

  test('should remove keyPrefix from keys', () => {
    // Create client with keyPrefix
    const clientWithPrefix = {
      ...db.client,
      config: {
        ...db.client.config,
        keyPrefix: 'prefix/'
      }
    };

    const storageWithPrefix = new PluginStorage(clientWithPrefix, 'test');

    const keys = [
      'prefix/plugin=test/key1',
      'prefix/plugin=test/key2'
    ];

    const cleaned = storageWithPrefix._removeKeyPrefix(keys);

    expect(cleaned).toEqual([
      'plugin=test/key1',
      'plugin=test/key2'
    ]);
  });

  test('should handle keys with leading slash after prefix removal', () => {
    const clientWithPrefix = {
      ...db.client,
      config: {
        ...db.client.config,
        keyPrefix: 'prefix'
      }
    };

    const storageWithPrefix = new PluginStorage(clientWithPrefix, 'test');

    const keys = ['prefix/plugin=test/key1'];
    const cleaned = storageWithPrefix._removeKeyPrefix(keys);

    expect(cleaned).toEqual(['plugin=test/key1']);
  });

  test('should return keys unchanged if no keyPrefix', () => {
    const keys = ['plugin=test/key1', 'plugin=test/key2'];
    const cleaned = storage._removeKeyPrefix(keys);

    expect(cleaned).toEqual(keys);
  });
});
