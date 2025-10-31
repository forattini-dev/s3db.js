/**
 * CachePlugin - skipCache Option Test
 *
 * Tests the new skipCache option that allows bypassing cache
 * when you need to ensure reading fresh data from S3
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { createDatabaseForTest } from '../config.js';

describe('CachePlugin - skipCache Option', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('cache-skip-option');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should bypass cache when skipCache: true is used in get()', async () => {
    console.log('\n🧪 Testing skipCache option on get()...\n');

    // Create resource
    const users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        balance: 'number|default:0'
      }
    });

    // Install CachePlugin
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: true
    });
    await database.usePlugin(cachePlugin);

    // Insert user
    await users.insert({
      id: 'user-001',
      name: 'John Doe',
      balance: 100
    });

    console.log('✅ User inserted: balance = 100\n');

    // First get - will cache
    console.log('1️⃣  First get() - caching...');
    const user1 = await users.get('user-001');
    console.log('   balance:', user1.balance, '(cached)\n');
    expect(user1.balance).toBe(100);

    // Update user balance directly (simulating external update)
    console.log('2️⃣  Updating balance externally to 500...');
    await users.update('user-001', { balance: 500 });
    console.log('   ✅ Balance updated in S3\n');

    // Get with cache - should return CACHED value (100)
    console.log('3️⃣  get() WITHOUT skipCache - returns cached value...');
    const user2 = await users.get('user-001');
    console.log('   balance:', user2.balance, '(expected: 500, but cache was invalidated on update)');
    expect(user2.balance).toBe(500); // Cache should be invalidated by update()

    // Now let's manually cache an old value to test skipCache
    console.log('\n4️⃣  Simulating stale cache...');
    const cacheKey = await users.cacheKeyFor({ action: 'get', params: { id: 'user-001' } });
    await users.cache.set(cacheKey, { id: 'user-001', name: 'John Doe', balance: 999 });
    console.log('   Cached balance: 999 (stale value)\n');

    // Get without skipCache - returns cached (stale) value
    console.log('5️⃣  get() WITHOUT skipCache...');
    const user3 = await users.get('user-001');
    console.log('   balance:', user3.balance, '(cached stale value)\n');
    expect(user3.balance).toBe(999);

    // Get WITH skipCache - bypasses cache, returns fresh value
    console.log('6️⃣  get() WITH skipCache: true...');
    const user4 = await users.get('user-001', { skipCache: true });
    console.log('   balance:', user4.balance, '(fresh from S3)\n');
    expect(user4.balance).toBe(500);

    console.log('✅ skipCache option working correctly!\n');
  }, 30000);

  it('should work with EventualConsistency consolidation', async () => {
    console.log('\n🧪 Testing skipCache with EventualConsistency...\n');

    const { EventualConsistencyPlugin } = await import('../../src/plugins/eventual-consistency/index.js');

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      mode: 'async',
      autoConsolidate: false,
      verbose: true
    });
    await database.usePlugin(ecPlugin);

    // Install CachePlugin
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: true
    });
    await database.usePlugin(cachePlugin);

    // Insert URL
    await urls.insert({
      id: 'url-001',
      clicks: 0
    });

    console.log('✅ URL created with clicks: 0\n');

    // Add 5 clicks
    console.log('1️⃣  Adding 5 clicks...');
    for (let i = 0; i < 5; i++) {
      await urls.add('url-001', 'clicks', 1);
    }
    console.log('   ✅ 5 transactions created\n');

    // Consolidate
    console.log('2️⃣  Consolidating...');
    await urls.consolidate('url-001', 'clicks');
    console.log('   ✅ Consolidated to 5\n');

    // Get WITHOUT skipCache (relies on cache invalidation)
    console.log('3️⃣  get() WITHOUT skipCache...');
    const url1 = await urls.get('url-001');
    console.log('   clicks:', url1.clicks, '(should be 5 if cache invalidation worked)\n');
    expect(url1.clicks).toBe(5);

    // Get WITH skipCache (guaranteed fresh)
    console.log('4️⃣  get() WITH skipCache: true (guaranteed fresh)...');
    const url2 = await urls.get('url-001', { skipCache: true });
    console.log('   clicks:', url2.clicks, '(fresh from S3)\n');
    expect(url2.clicks).toBe(5);

    console.log('✅ skipCache works perfectly with EventualConsistency!\n');
  }, 30000);

  it('should work with list(), query(), and other methods', async () => {
    console.log('\n🧪 Testing skipCache with list() and query()...\n');

    // Create resource
    const products = await database.createResource({
      name: 'products',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        category: 'string|required',
        price: 'number|required'
      }
    });

    // Install CachePlugin
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: false
    });
    await database.usePlugin(cachePlugin);

    // Insert products
    await products.insert({ id: 'prod-1', name: 'MacBook', category: 'electronics', price: 1999 });
    await products.insert({ id: 'prod-2', name: 'iPhone', category: 'electronics', price: 999 });
    await products.insert({ id: 'prod-3', name: 'Book', category: 'books', price: 29 });

    console.log('✅ 3 products inserted\n');

    // list() with cache
    console.log('1️⃣  list() - caching...');
    const list1 = await products.list();
    console.log('   Count:', list1.length, '(cached)\n');
    expect(list1.length).toBe(3);

    // Insert another product
    console.log('2️⃣  Inserting 4th product...');
    await products.insert({ id: 'prod-4', name: 'Laptop', category: 'electronics', price: 1499 });
    console.log('   ✅ Product inserted\n');

    // list() WITHOUT skipCache (cache should be invalidated by insert)
    console.log('3️⃣  list() WITHOUT skipCache...');
    const list2 = await products.list();
    console.log('   Count:', list2.length, '(should be 4)\n');
    expect(list2.length).toBe(4);

    // list() WITH skipCache (guaranteed fresh)
    console.log('4️⃣  list() WITH skipCache: true...');
    const list3 = await products.list({ skipCache: true });
    console.log('   Count:', list3.length, '(fresh from S3)\n');
    expect(list3.length).toBe(4);

    // query() WITH skipCache
    console.log('5️⃣  query() WITH skipCache: true...');
    const electronics = await products.query({ category: 'electronics' }, { skipCache: true });
    console.log('   Electronics count:', electronics.length, '(expected: 3)\n');
    expect(electronics.length).toBe(3);

    console.log('✅ skipCache works with all methods!\n');
  }, 30000);
});
