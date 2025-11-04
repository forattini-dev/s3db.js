import { beforeEach, describe, expect, test } from '@jest/globals';
import { setupMemoryCacheSuite } from '../helpers.js';

describe('Cache Plugin - MemoryCache Driver - Basic Cache Operations', () => {
  const ctx = setupMemoryCacheSuite();

  beforeEach(async () => {
    await ctx.seedUsers();
  });

  test('caches count results after the first miss', async () => {
    const users = ctx.resource;

    const firstCount = await users.count();
    const secondCount = await users.count();

    expect(firstCount).toBe(3);
    expect(secondCount).toBe(3);

    const stats = await ctx.cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
  });

  test('caches list responses to avoid repeated reads', async () => {
    const users = ctx.resource;

    const firstList = await users.list();
    const secondList = await users.list();

    expect(firstList).toHaveLength(3);
    expect(secondList).toEqual(firstList);
  });

  test('caches listIds so repeated calls avoid database work', async () => {
    const users = ctx.resource;

    const firstIds = await users.listIds();
    const secondIds = await users.listIds();

    expect(firstIds).toHaveLength(3);
    expect(secondIds).toEqual(firstIds);
  });

  test('reuses cached getMany calls for the same identifiers', async () => {
    const users = ctx.resource;
    const ids = (await users.listIds()).slice(0, 2);

    const firstMany = await users.getMany(ids);
    const secondMany = await users.getMany(ids);

    expect(firstMany).toHaveLength(2);
    expect(secondMany).toEqual(firstMany);
  });

  test('serves getAll from cache after warm-up', async () => {
    const users = ctx.resource;

    const firstGetAll = await users.getAll();
    const secondGetAll = await users.getAll();

    expect(firstGetAll).toHaveLength(3);
    expect(secondGetAll).toEqual(firstGetAll);
  });

  test('keeps cached pages consistent for identical paging arguments', async () => {
    const users = ctx.resource;

    const firstPage = await users.page({ offset: 0, size: 2 });
    const secondPage = await users.page({ offset: 0, size: 2 });

    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toEqual(firstPage.items);
  });

  test('caches single record lookups via get', async () => {
    const users = ctx.resource;
    const [userId] = await users.listIds();

    const firstGet = await users.get(userId);
    const secondGet = await users.get(userId);

    expect(firstGet).toBeDefined();
    expect(secondGet).toEqual(firstGet);
  });
});
