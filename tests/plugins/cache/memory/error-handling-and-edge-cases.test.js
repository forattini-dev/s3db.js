import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { setupMemoryCacheSuite } from '../helpers.js';

describe('Cache Plugin - MemoryCache Driver - Error Handling and Edge Cases', () => {
  const ctx = setupMemoryCacheSuite();

  beforeEach(async () => {
    await ctx.seedUsers();
  });

  test('surface driver errors without breaking resource operations', async () => {
    const users = ctx.resource;
    const originalGet = ctx.cachePlugin.driver.get;

    ctx.cachePlugin.driver.get = jest.fn().mockRejectedValue(new Error('Memory cache error'));

    await expect(users.count()).rejects.toThrow('Memory cache error');

    ctx.cachePlugin.driver.get = originalGet;
  });

  test('treats null cache responses as cache misses', async () => {
    const users = ctx.resource;
    const originalGet = ctx.cachePlugin.driver.get;

    ctx.cachePlugin.driver.get = jest.fn().mockResolvedValue(null);

    const count = await users.count();
    expect(count).toBe(3);

    ctx.cachePlugin.driver.get = originalGet;
  });

  test('handles concurrent cacheable operations', async () => {
    const users = ctx.resource;

    const results = await Promise.all([
      users.count(),
      users.list(),
      users.listIds(),
      users.count(),
      users.list()
    ]);

    expect(results[0]).toBe(3);
    expect(results[1]).toHaveLength(3);
    expect(results[2]).toHaveLength(3);
    expect(results[3]).toBe(3);
    expect(results[4]).toHaveLength(3);
  });

  test('clears cache safely even when already empty', async () => {
    await ctx.cachePlugin.clearAllCache();
    const stats = await ctx.cachePlugin.getCacheStats();

    expect(stats.size).toBe(0);
    expect(stats.keys).toEqual([]);
  });
});

