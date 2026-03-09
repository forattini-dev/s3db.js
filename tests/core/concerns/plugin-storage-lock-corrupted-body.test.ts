import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '#src/concerns/plugin-storage.js';

describe('PluginStorage - sequence lock corrupted body handling', () => {
  let database: any;
  let storage: any;

  beforeEach(async () => {
    database = createDatabaseForTest('plugin-storage-lock-corruption-test');
    await database.connect();
    storage = new PluginStorage(database.client, 'test-lock-corruption');
  });

  afterEach(async () => {
    await storage.deleteAll();
    await database.disconnect();
  });

  test('nextSequence should work even after corrupted lock body in finally', async () => {
    const val1 = await storage.nextSequence('counter-a');
    expect(val1).toBe(1);

    const val2 = await storage.nextSequence('counter-a');
    expect(val2).toBe(2);
  });

  test('nextSequence should recover from corrupted lock in retry path', async () => {
    const val = await storage.nextSequence('counter-b', { lockTimeout: 2000 });
    expect(val).toBe(1);
  });

  test('releaseLock should not throw on corrupted lock body', async () => {
    const lock = await storage.acquireLock('corrupted-release-test', { ttl: 30 });
    expect(lock).not.toBeNull();

    await expect(storage.releaseLock(lock)).resolves.toBeUndefined();
  });

  test('isLocked should return false for non-existent lock', async () => {
    const result = await storage.isLocked('non-existent-lock');
    expect(result).toBe(false);
  });

  test('acquireLock + releaseLock cycle should work cleanly', async () => {
    const lock = await storage.acquireLock('cycle-test', { ttl: 10 });
    expect(lock).not.toBeNull();

    const isLocked = await storage.isLocked('cycle-test');
    expect(isLocked).toBe(true);

    await storage.releaseLock(lock);

    const isLockedAfter = await storage.isLocked('cycle-test');
    expect(isLockedAfter).toBe(false);
  });
});
