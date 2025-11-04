import { describe, expect, test } from '@jest/globals';

import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';
import { setupMemoryCacheSuite } from '../helpers.js';

describe('Cache Plugin - MemoryCache Driver - Driver Setup and Configuration', () => {
  const ctx = setupMemoryCacheSuite({ createResource: false });

  test('installs memory driver with default configuration', () => {
    expect(ctx.cachePlugin.driver).toBeInstanceOf(MemoryCache);
    expect(ctx.cachePlugin.driver.ttl).toBe(60000);
    expect(ctx.cachePlugin.driver.maxSize).toBe(100);
  });

  test('respects explicit ttl configuration during install', async () => {
    const plugin = new CachePlugin({ driver: 'memory', ttl: 300000 });
    await plugin.install(ctx.db);

    expect(plugin.driver).toBeInstanceOf(MemoryCache);
    expect(plugin.driver.ttl).toBe(300000);
  });

  test('respects explicit maxSize configuration during install', async () => {
    const plugin = new CachePlugin({ driver: 'memory', maxSize: 50 });
    await plugin.install(ctx.db);

    expect(plugin.driver.maxSize).toBe(50);
  });
});

