import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { createDatabaseForTest } from '../../config.js';
import { createMockClient } from '../../mocks/index.js';

describe('PluginStorage - Versioned Operations', () => {
  let db;
  let storage;

  beforeEach(async () => {
    db = createDatabaseForTest('plugin-storage-versioned');
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

  test('setIfVersion should only write when version matches', async () => {
    const key = storage.getPluginKey(null, 'versioned-item');
    await storage.set(key, { count: 1 });

    const snapshot = await storage.getWithVersion(key);
    expect(snapshot.version).toBeTruthy();
    expect(typeof snapshot.version).toBe('string');

    const stale = await storage.setIfVersion(key, { count: 2 }, '"wrong-version"', { behavior: 'body-only' });
    expect(stale).toBeNull();

    const staleData = await storage.get(key);
    expect(staleData?.count).toBe(1);

    const fresh = await storage.setIfVersion(key, { count: 2 }, snapshot.version as string, { behavior: 'body-only' });
    expect(typeof fresh).toBe('string');
    expect(fresh).not.toBe(snapshot.version);

    const latest = await storage.getWithVersion(key);
    expect(latest.data?.count).toBe(2);
  });

  test('deleteIfVersion should delete only when version matches', async () => {
    const key = storage.getPluginKey(null, 'delete-versioned-item');
    await storage.set(key, { value: 'abc' });

    const snapshot = await storage.getWithVersion(key);
    expect(snapshot.version).toBeTruthy();

    const staleDelete = await storage.deleteIfVersion(key, '"wrong-version"');
    expect(staleDelete).toBe(false);
    expect(await storage.has(key)).toBe(true);

    const deleted = await storage.deleteIfVersion(key, snapshot.version as string);
    expect(deleted).toBe(true);
    expect(await storage.has(key)).toBe(false);
  });

  test('deleteIfVersion should return false when current object has no version', async () => {
    const client = createMockClient({ bucket: 'mock-no-etag' });
    const noVersionStorage = new PluginStorage(client, 'test-plugin');
    const key = noVersionStorage.getPluginKey(null, 'legacy-object');

    client.headObject = async () => ({
      Metadata: {},
      ContentType: 'application/json'
    });

    await noVersionStorage.set(key, { value: 'legacy' });
    const deleted = await noVersionStorage.deleteIfVersion(key, '"anything"');

    expect(deleted).toBe(false);
  });

  test('deleteIfVersion should throw for unexpected head errors', async () => {
    const client = createMockClient({ bucket: 'mock-delete-version-error' });
    const failingStorage = new PluginStorage(client, 'test-plugin');
    const key = failingStorage.getPluginKey(null, 'no-access');

    const error = new Error('Access denied');
    error.name = 'AccessDenied';
    client.mockError(key, error);

    await expect(
      failingStorage.deleteIfVersion(key, '"anything"')
    ).rejects.toThrow(/Failed to verify current version before delete/);
  });
});
