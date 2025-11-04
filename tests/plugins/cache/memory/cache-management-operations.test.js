import { beforeEach, describe, expect, test } from '@jest/globals';

import { setupMemoryCacheSuite } from '../helpers.js';

describe('Cache Plugin - MemoryCache Driver - Cache Management Operations', () => {
  const ctx = setupMemoryCacheSuite();

  beforeEach(async () => {
    await ctx.seedUsers();
  });

  test('clearAllCache removes every cached entry', async () => {
    const users = ctx.resource;

    await users.count();
    await users.list();

    const warmStats = await ctx.cachePlugin.getCacheStats();
    expect(warmStats.size).toBeGreaterThan(0);

    await ctx.cachePlugin.clearAllCache();

    const clearedStats = await ctx.cachePlugin.getCacheStats();
    expect(clearedStats.size).toBe(0);
    expect(clearedStats.keys.length).toBe(0);
  });

  test('warmCache primes cache for a given resource', async () => {
    await ctx.cachePlugin.clearAllCache();

    await ctx.cachePlugin.warmCache('users');

    const stats = await ctx.cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.keys.some(key => key.includes('resource=users'))).toBe(true);
  });

  test('getCacheStats reports driver level information', async () => {
    const stats = await ctx.cachePlugin.getCacheStats();

    expect(stats).toMatchObject({
      driver: 'MemoryCache',
      keys: expect.any(Array),
      size: expect.any(Number)
    });
  });
});

