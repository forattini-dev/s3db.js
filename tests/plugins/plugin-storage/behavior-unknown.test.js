import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - Behavior: unknown', () => {
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

  test('should throw for unknown behavior', async () => {
    const key = storage.getPluginKey(null, 'unknown-behavior');
    const data = { test: 'data' };

    await expect(
      storage.set(key, data, { behavior: 'invalid-behavior' })
    ).rejects.toThrow('Unknown behavior: invalid-behavior');
  });
});
