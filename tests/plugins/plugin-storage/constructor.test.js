import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - Constructor', () => {
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

  test('should create PluginStorage instance', () => {
    expect(storage).toBeInstanceOf(PluginStorage);
    expect(storage.client).toBe(db.client);
    expect(storage.pluginSlug).toBe('test-plugin');
  });

  test('should throw if client is missing', () => {
    expect(() => new PluginStorage(null, 'test')).toThrow('PluginStorage requires a client instance');
  });

  test('should throw if client is undefined', () => {
    expect(() => new PluginStorage(undefined, 'test')).toThrow('PluginStorage requires a client instance');
  });

  test('should throw if pluginSlug is missing', () => {
    expect(() => new PluginStorage(db.client, null)).toThrow('PluginStorage requires a pluginSlug');
  });

  test('should throw if pluginSlug is empty string', () => {
    expect(() => new PluginStorage(db.client, '')).toThrow('PluginStorage requires a pluginSlug');
  });

  test('should throw if pluginSlug is undefined', () => {
    expect(() => new PluginStorage(db.client, undefined)).toThrow('PluginStorage requires a pluginSlug');
  });
});
