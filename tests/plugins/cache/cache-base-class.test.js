import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { Cache, MemoryCache, S3Cache } from '../../../src/plugins/cache/index.js';
import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/partition-aware-filesystem-cache.class.js';

describe('Cache Plugin - Cache Base Class', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/cache');
    await database.connect();
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should create cache class with default configuration', () => {
    const cache = new Cache();
    expect(cache.config).toBeDefined();
    expect(typeof cache.config).toBe('object');
  });

  test('should create cache with custom configuration', () => {
    const config = { enabled: true, ttl: 300 };
    const cache = new Cache(config);
    expect(cache.config).toEqual(config);
  });

  test('should validate keys correctly', () => {
    const cache = new Cache();

    // Valid key should not throw
    expect(() => cache.validateKey('valid-key')).not.toThrow();

    // Invalid keys should throw
    expect(() => cache.validateKey(null)).toThrow('Invalid cache key');
    expect(() => cache.validateKey(undefined)).toThrow('Invalid cache key');
    expect(() => cache.validateKey('')).toThrow('Invalid cache key');
    expect(() => cache.validateKey(123)).toThrow('Invalid cache key');
  });

  test('should handle base cache operations with fallback store', async () => {
    const cache = new Cache();

    // Base cache has _fallbackStore that works even with no-op _get/_set
    await expect(cache.set('test-key', 'value')).resolves.toBe('value');
    await expect(cache.get('test-key')).resolves.toBe('value');
    await expect(cache.delete('test-key')).resolves.toBeUndefined();
    await expect(cache.get('test-key')).resolves.toBeUndefined();
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  test('should emit events during operations', async () => {
    const cache = new MemoryCache();
    const events = [];

    cache.on('set', (data) => events.push({ type: 'set', data }));
    cache.on('fetched', (data) => events.push({ type: 'get', data }));
    cache.on('deleted', (data) => events.push({ type: 'delete', data }));

    await cache.set('test-key', 'test-value');
    await cache.get('test-key');
    await cache.delete('test-key');

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'set', data: { key: 'test-key', value: 'test-value' } });
    expect(events[1]).toEqual({ type: 'get', data: { key: 'test-key', value: 'test-value' } });
    // delete returns true, not the value
    expect(events[2]).toEqual({ type: 'delete', data: { key: 'test-key', value: true } });
  });
    
});
