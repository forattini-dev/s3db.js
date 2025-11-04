import { describe, expect, test } from '@jest/globals';

import { setupMemoryCacheSuite } from '../helpers.js';

describe('Cache Plugin - MemoryCache Driver - Performance and Statistics', () => {
  const ctx = setupMemoryCacheSuite({
    pluginOptions: {
      config: { enableStats: true }
    }
  });

  test('tracks cache hits and misses for repeated operations', async () => {
    await ctx.seedUsers();
    const users = ctx.resource;

    await users.count(); // miss
    await users.count(); // hit

    const stats = ctx.cachePlugin.driver.getStats();
    expect(stats.enabled).toBe(true);
    expect(stats.misses).toBeGreaterThanOrEqual(1);
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  test('reports cache summary via plugin stats helper', async () => {
    await ctx.seedUsers();
    await ctx.resource.list();

    const stats = await ctx.cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.driver).toBe('MemoryCache');
    expect(Array.isArray(stats.keys)).toBe(true);
    expect(stats.stats.enabled).toBe(true);
  });
});

