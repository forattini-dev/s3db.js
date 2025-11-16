import { beforeEach, describe, expect, test, jest } from '@jest/globals';

import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';
import { setupMemoryCacheSuite } from '../helpers.js';

const ctx = setupMemoryCacheSuite();

describe('MemoryCache driver basics', () => {
  test('installs memory driver with default configuration', () => {
    expect(ctx.cachePlugin.driver).toBeInstanceOf(MemoryCache);
    expect(ctx.cachePlugin.driver.ttl).toBe(60000);
    expect(ctx.cachePlugin.driver.maxSize).toBe(100);
  });

  test('respects custom ttl and maxSize during install', async () => {
    const plugin = new CachePlugin({ logLevel: 'silent', driver: 'memory', ttl: 300000, maxSize: 50 });
    await plugin.install(ctx.db);

    expect(plugin.driver.ttl).toBe(300000);
    expect(plugin.driver.maxSize).toBe(50);
  });

  test('exposes management operations (stats, clear, warm)', async () => {
    await ctx.cachePlugin.clearAllCache();

    await ctx.cachePlugin.warmCache('users');
    const stats = await ctx.cachePlugin.getCacheStats();

    expect(stats.driver).toBe('MemoryCache');
    expect(stats.size).toBeGreaterThanOrEqual(0);

    await ctx.cachePlugin.clearAllCache();
    const cleared = await ctx.cachePlugin.getCacheStats();
    expect(cleared.keys.length).toBe(0);
  });
});

describe('Cache operations and invalidation', () => {
  beforeEach(async () => {
    await ctx.cachePlugin.clearAllCache().catch(() => {});
    await ctx.seedUsers();
  });

  test('caches repeated reads for core queries', async () => {
    const users = ctx.resource;

    const firstCount = await users.count();
    const secondCount = await users.count();
    expect(firstCount).toBe(secondCount);

    const firstList = await users.list();
    const secondList = await users.list();
    expect(secondList).toEqual(firstList);
  });

  test('invalidates count after insert', async () => {
    const users = ctx.resource;
    await users.count();
    await users.insert({
      name: 'Diana',
      email: 'diana@example.com',
      department: 'Marketing',
      region: 'US',
      status: 'active'
    });
    expect(await users.count()).toBe(4);
  });

  test('invalidates cached entity after update', async () => {
    const users = ctx.resource;
    const [userId] = await users.listIds();

    await users.get(userId);
    await users.update(userId, { status: 'inactive' });

    const refreshed = await users.get(userId);
    expect(refreshed.status).toBe('inactive');
  });

  test('clears partition caches affected by deletes', async () => {
    const users = ctx.resource;
    const engineering = await users.list({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    await Promise.all(engineering.map(user => users.delete(user.id)));

    const refreshedCount = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(refreshedCount).toBe(0);
  });

  test('generates deterministic cache keys for actions and partitions', async () => {
    const users = ctx.resource;

    const countKey = await users.cacheKeyFor({ action: 'count' });
    expect(countKey).toContain('resource=users');
    expect(countKey).toContain('action=count');

    const partitionKey = await users.cacheKeyFor({
      action: 'list',
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });

    expect(partitionKey).toContain('partition:byRegion');
    expect(partitionKey).toContain('region:US');
    expect(partitionKey).not.toBe(countKey);
  });
});

describe('Memory limits and statistics', () => {
  const LARGE_DATA = 'x'.repeat(2000);

  test('evicts entries when maxSize is reached', async () => {
    const plugin = new CachePlugin({ logLevel: 'silent', driver: 'memory', maxSize: 2 });
    await plugin.install(ctx.db);

    const users = await ctx.db.createResource({
      name: 'max_size_users',
      attributes: { name: 'string|required' }
    });

    await users.insertMany([{ name: 'User 1' }, { name: 'User 2' }, { name: 'User 3' }]);
    await users.count();
    await users.list();
    await users.listIds();

    const stats = await plugin.getCacheStats();
    expect(stats.size).toBeLessThanOrEqual(2);
  });

  test('enforces maxMemoryBytes and reports memory stats', async () => {
    const plugin = new CachePlugin({
      logLevel: 'silent',driver: 'memory',
      config: { maxMemoryBytes: 5 * 1024 }
    });
    await plugin.install(ctx.db);

    const users = await ctx.db.createResource({
      name: 'max_bytes_users',
      attributes: {
        name: 'string|required',
        payload: 'string|required'
      }
    });

    await users.insertMany([
      { name: 'User 1', payload: LARGE_DATA },
      { name: 'User 2', payload: LARGE_DATA },
      { name: 'User 3', payload: LARGE_DATA }
    ]);
    await users.list();

    const stats = plugin.driver.getMemoryStats();
    expect(stats.currentMemoryBytes).toBeLessThanOrEqual(stats.maxMemoryBytes);
    expect(stats.maxMemoryBytes).toBe(5 * 1024);
  });

  test('exposes hit/miss statistics when enabled', async () => {
    const cache = new MemoryCache({ enableStats: true });
    await cache.set('users:list', [{ id: 1 }]);
    await cache.get('users:list');
    await cache.get('users:list');

    const stats = cache.getStats();
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.hitRate).toBeGreaterThan(0);
  });
});

describe('Error handling', () => {
  beforeEach(async () => {
    await ctx.cachePlugin.clearAllCache().catch(() => {});
    await ctx.seedUsers();
  });

  test('propagates driver errors without crashing resource operations', async () => {
    const users = ctx.resource;
    const originalGet = ctx.cachePlugin.driver.get;
    ctx.cachePlugin.driver.get = jest.fn().mockRejectedValue(new Error('Memory cache error'));

    await expect(users.count()).rejects.toThrow('Memory cache error');

    ctx.cachePlugin.driver.get = originalGet;
  });

  test('treats null driver responses as cache misses', async () => {
    const users = ctx.resource;
    const originalGet = ctx.cachePlugin.driver.get;
    ctx.cachePlugin.driver.get = jest.fn().mockResolvedValue(null);

    expect(await users.count()).toBe(3);

    ctx.cachePlugin.driver.get = originalGet;
  });
});
