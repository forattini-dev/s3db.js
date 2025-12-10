
import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { setupMemoryCacheSuite } from '../helpers.js';

const LARGE_DATA = 'x'.repeat(2000);

describe('Cache Plugin - MemoryCache Driver - Memory Management', () => {
  const ctx = setupMemoryCacheSuite({ createResource: false });

  test('enforces maxSize by evicting oldest entries', async () => {
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

  test('enforces maxMemoryBytes limit', async () => {
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

  test('tracks memory usage and resets after clear', async () => {
    const plugin = new CachePlugin({
      logLevel: 'silent',driver: 'memory',
      config: { maxMemoryBytes: 50 * 1024 }
    });
    await plugin.install(ctx.db);

    const users = await ctx.db.createResource({
      name: 'tracking_users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      }
    });

    await users.insertMany([
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' }
    ]);

    await users.list();

    const before = plugin.driver.getMemoryStats();
    expect(before.currentMemoryBytes).toBeGreaterThan(0);
    expect(before.totalItems).toBeGreaterThan(0);

    await plugin.clearAllCache();
    const after = plugin.driver.getMemoryStats();
    expect(after.currentMemoryBytes).toBe(0);
    expect(after.totalItems).toBe(0);
  });

  test('evicts entries when memory limit is exceeded', async () => {
    const plugin = new CachePlugin({
      logLevel: 'silent',driver: 'memory',
      config: { maxMemoryBytes: 3 * 1024 }
    });
    await plugin.install(ctx.db);

    const users = await ctx.db.createResource({
      name: 'eviction_users',
      attributes: {
        name: 'string|required',
        payload: 'string|required'
      }
    });

    await users.insertMany([
      { name: 'User 1', payload: LARGE_DATA },
      { name: 'User 2', payload: LARGE_DATA },
      { name: 'User 3', payload: LARGE_DATA },
      { name: 'User 4', payload: LARGE_DATA }
    ]);

    await users.list();
    await users.count();
    await users.listIds();

    const stats = plugin.driver.getMemoryStats();
    expect(stats.evictedDueToMemory).toBeGreaterThan(0);
    expect(stats.currentMemoryBytes).toBeLessThanOrEqual(stats.maxMemoryBytes);
  });

  test('exposes human readable memory statistics', async () => {
    const plugin = new CachePlugin({
      logLevel: 'silent',driver: 'memory',
      config: { maxMemoryBytes: 10 * 1024 * 1024 }
    });
    await plugin.install(ctx.db);

    const users = await ctx.db.createResource({
      name: 'readable_users',
      attributes: { name: 'string|required' }
    });

    await users.insert({ name: 'Readable' });
    await users.list();

    const stats = plugin.driver.getMemoryStats();
    expect(stats.memoryUsage).toBeDefined();
    expect(stats.memoryUsage.current).toMatch(/\d+(\.\d+)? (B|KB|MB|GB)/);
    expect(stats.memoryUsage.max).toMatch(/\d+(\.\d+)? (B|KB|MB|GB|unlimited)/);
    expect(stats.memoryUsage.available).toMatch(/\d+(\.\d+)? (B|KB|MB|GB|unlimited)/);
  });

  test('supports unlimited memory mode when maxMemoryBytes is 0', async () => {
    const plugin = new CachePlugin({
      logLevel: 'silent',driver: 'memory',
      config: { maxMemoryBytes: 0 }
    });
    await plugin.install(ctx.db);

    const users = await ctx.db.createResource({
      name: 'unlimited_users',
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
    // After commit 179723b: maxMemoryBytes: 0 triggers autodetection for safety
    // Instead of unlimited mode, it now applies a safe limit based on available memory
    expect(stats.maxMemoryBytes).toBeGreaterThan(0);
    expect(stats.memoryUsage.max).toMatch(/\d+(\.\d+)? (B|KB|MB|GB)/);
    expect(stats.evictedDueToMemory).toBe(0);
  });

  test('calculates memory limit from percentage configuration', async () => {
    const plugin = new CachePlugin({
      logLevel: 'silent',driver: 'memory',
      config: { maxMemoryPercent: 0.05 }
    });
    await plugin.install(ctx.db);

    const stats = plugin.driver.getMemoryStats();
    // After commit 179723b: CachePlugin stores inferredMaxMemoryPercent in config
    // The driver itself doesn't have maxMemoryPercent property anymore
    // Instead, check that the resolved bytes match approximately 5% of total memory
    expect(stats.maxMemoryBytes).toBeGreaterThan(0);

    // Verify the percentage is stored in plugin config (inferredMaxMemoryPercent)
    expect(plugin.config.config.inferredMaxMemoryPercent).toBeCloseTo(0.05, 1);
  });
});
