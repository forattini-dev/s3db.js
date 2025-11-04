import { describe, expect, test } from '@jest/globals';

import { setupMemoryCacheSuite } from '../helpers.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';

describe('Cache Plugin - MemoryCache Driver - Performance and Statistics', () => {
  const ctx = setupMemoryCacheSuite();

  test('tracks cache hits and misses for repeated operations', async () => {
    const cache = new MemoryCache({ enableStats: true });

    await cache.set('users:list', [{ id: 1 }]);
    await cache.get('users:list'); // hit
    await cache.get('users:list'); // hit

    const stats = cache.getStats();
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.misses).toBeGreaterThanOrEqual(0);
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  test('reports cache summary via plugin stats helper', async () => {
    await ctx.seedUsers();
    await ctx.resource.list();

    const stats = await ctx.cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.driver).toBe('MemoryCache');
    expect(Array.isArray(stats.keys)).toBe(true);
  });
});
