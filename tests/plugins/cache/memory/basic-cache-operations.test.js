import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../../config.js';
import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';


describe('Cache Plugin - MemoryCache Driver - Basic Cache Operations', () => {
  let db;
  let cachePlugin;
  let users;

  beforeEach(async () => {
    db = createDatabaseForTest('suite=plugins/cache-memory');
    await db.connect();

    cachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 60000,
      maxSize: 100,
    });
    await cachePlugin.install(db);

    users = await db.createResource({
      name: 'users',
      asyncPartitions: false,
      attributes: {
        name: 'string|required',
        email: 'string|required',
        department: 'string|required',
        region: 'string|required',
        status: 'string|required',
      },
      partitions: {
        byDepartment: { fields: { department: 'string' } },
        byRegion: { fields: { region: 'string' } },
      },
    });
  });

  afterEach(async () => {
    if (cachePlugin && cachePlugin.driver) {
      await cachePlugin.clearAllCache();
    }
    if (db) {
      await db.disconnect();
    }
  });

  beforeEach(async () => {
    // Insert test data
    await users.insertMany([
      { name: 'Alice', email: 'alice@example.com', department: 'Engineering', region: 'US', status: 'active' },
      { name: 'Bob', email: 'bob@example.com', department: 'Sales', region: 'US', status: 'active' },
      { name: 'Charlie', email: 'charlie@example.com', department: 'Engineering', region: 'EU', status: 'inactive' }
    ]);
  });

  test('should cache and retrieve count results', async () => {
    // First call - cache miss
    const count1 = await users.count();
    expect(count1).toBe(3);

    // Second call - cache hit
    const count2 = await users.count();
    expect(count2).toBe(3);

    // Verify cache was used
    const stats = await cachePlugin.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should cache and retrieve list results', async () => {
    // First call - cache miss
    const list1 = await users.list();
    expect(list1).toHaveLength(3);

    // Second call - cache hit
    const list2 = await users.list();
    expect(list2).toEqual(list1);
  });

  test('should cache and retrieve listIds results', async () => {
    const ids1 = await users.listIds();
    expect(ids1).toHaveLength(3);

    const ids2 = await users.listIds();
    expect(ids2).toEqual(ids1);
  });

  test('should cache and retrieve getMany results', async () => {
    const allIds = await users.listIds();
    const testIds = allIds.slice(0, 2);

    const many1 = await users.getMany(testIds);
    expect(many1).toHaveLength(2);

    const many2 = await users.getMany(testIds);
    expect(many2).toEqual(many1);
  });

  test('should cache and retrieve getAll results', async () => {
    const all1 = await users.getAll();
    expect(all1).toHaveLength(3);

    const all2 = await users.getAll();
    expect(all2).toEqual(all1);
  });

  test('should cache and retrieve page results', async () => {
    const page1 = await users.page({ offset: 0, size: 2 });
    expect(page1.items).toHaveLength(2);

    const page2 = await users.page({ offset: 0, size: 2 });
    expect(page2.items).toEqual(page1.items);
  });

  test('should cache individual get results', async () => {
    const userId = (await users.listIds())[0];

    const user1 = await users.get(userId);
    expect(user1).toBeDefined();

    const user2 = await users.get(userId);
    expect(user2).toEqual(user1);
  });
});
