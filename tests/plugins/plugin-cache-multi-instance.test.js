import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { createMemoryDatabaseForTest } from '../config.js';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';

describe('Cache Plugin - Multi-instance namespacing', () => {
  let db;
  let users;
  let primaryPlugin;
  let secondaryPlugin;

  beforeEach(async () => {
    db = createMemoryDatabaseForTest('suite=plugins/cache-multi-instance');
    await db.connect();

    primaryPlugin = new CachePlugin({
      verbose: false,driver: 'memory',
      namespace: 'primary'
    });

    secondaryPlugin = new CachePlugin({
      verbose: false,driver: 'memory',
      namespace: 'secondary'
    });

    await primaryPlugin.install(db);
    await secondaryPlugin.install(db);

    users = await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        email: 'string|required',
        role: 'string'
      },
      timestamps: false
    });

    await users.insertMany([
      { id: 'u1', email: 'a@example.com', role: 'admin' },
      { id: 'u2', email: 'b@example.com', role: 'viewer' },
      { id: 'u3', email: 'c@example.com', role: 'editor' }
    ]);
  });

  afterEach(async () => {
    if (primaryPlugin?.driver) {
      await primaryPlugin.clearAllCache();
    }
    if (secondaryPlugin?.driver) {
      await secondaryPlugin.clearAllCache();
    }
    if (db) {
      await db.disconnect();
    }
  });

  it('exposes distinct drivers and cache key resolvers per instance', async () => {
    expect(primaryPlugin.slug).toBe('cache--primary');
    expect(secondaryPlugin.slug).toBe('cache--secondary');

    // First call populates both caches through middleware chain
    const firstCount = await users.count();
    expect(firstCount).toBe(3);
    const secondCount = await users.count();
    expect(secondCount).toBe(3);

    const primaryResolver = users.getCacheKeyResolver(primaryPlugin.slug);
    const secondaryResolver = users.getCacheKeyResolver(secondaryPlugin.slug);

    expect(typeof primaryResolver).toBe('function');
    expect(typeof secondaryResolver).toBe('function');

    const primaryKey = await primaryResolver({ action: 'count' });
    const secondaryKey = await secondaryResolver({ action: 'count' });

    const primaryCached = await primaryPlugin.driver.get(primaryKey);
    const secondaryCached = await secondaryPlugin.driver.get(secondaryKey);

    expect(primaryCached).toBe(3);
    expect(secondaryCached).toBe(3);

    // Clearing one driver should not affect the other
    await primaryPlugin.driver.clear(`resource=${users.name}`);
    const afterPrimaryClear = await primaryPlugin.driver.get(primaryKey);
    const secondaryStillCached = await secondaryPlugin.driver.get(secondaryKey);

    expect(afterPrimaryClear).toBeNull();
    expect(secondaryStillCached).toBe(3);
  });
});
