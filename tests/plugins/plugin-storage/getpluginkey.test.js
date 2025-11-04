import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - getPluginKey', () => {
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

  test('should generate global plugin key', () => {
    const key = storage.getPluginKey(null, 'config');
    expect(key).toBe('plugin=test-plugin/config');
  });

  test('should generate resource-scoped key', () => {
    const key = storage.getPluginKey('users', 'cache', 'user-1');
    expect(key).toBe('resource=users/plugin=test-plugin/cache/user-1');
  });

  test('should handle multiple path parts', () => {
    const key = storage.getPluginKey('wallets', 'balance', 'transactions', 'id=txn1');
    expect(key).toBe('resource=wallets/plugin=test-plugin/balance/transactions/id=txn1');
  });

  test('should handle single path part', () => {
    const key = storage.getPluginKey(null, 'data');
    expect(key).toBe('plugin=test-plugin/data');
  });

  test('should handle no path parts', () => {
    const key = storage.getPluginKey(null);
    expect(key).toBe('plugin=test-plugin/');
  });

  test('should handle resource with no path parts', () => {
    const key = storage.getPluginKey('users');
    expect(key).toBe('resource=users/plugin=test-plugin/');
  });
});
