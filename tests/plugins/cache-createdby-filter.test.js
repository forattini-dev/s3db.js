/**
 * CachePlugin - createdBy Filter & Cache Invalidation Test
 *
 * Tests that:
 * 1. Plugin only caches user-created resources (createdBy: 'user')
 * 2. Plugin SKIPS plugin-created resources (createdBy: 'EventualConsistencyPlugin')
 * 3. update() invalidates cache for that specific record
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency.plugin.js';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { createDatabaseForTest } from '../config.js';

describe('CachePlugin - createdBy Filter & Cache Invalidation', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('cache-createdby-filter');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should only cache user-created resources, not plugin resources', async () => {
    console.log('\n🧪 Testing CachePlugin createdBy filter...\n');
    console.log('=' .repeat(70));

    // Create user resource
    console.log('1️⃣  Creating USER resource (users)...\n');
    const users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required'
      }
    });

    // Install EventualConsistency (will create plugin resources)
    console.log('2️⃣  Installing EventualConsistencyPlugin...\n');
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        users: ['clicks'] // Will create users_transactions_clicks, users_consolidation_locks_clicks
      },
      mode: 'async',
      autoConsolidate: false,
      verbose: false
    });
    await database.usePlugin(ecPlugin);

    // Force metadata save
    await database.uploadMetadataFile();

    console.log('   Created resources:');
    console.log('   - users (createdBy: user)');
    console.log('   - users_transactions_clicks (createdBy: EventualConsistencyPlugin)');
    console.log('   - users_consolidation_locks_clicks (createdBy: EventualConsistencyPlugin)\n');

    // Install CachePlugin AFTER plugin resources are created
    console.log('3️⃣  Installing CachePlugin...\n');
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: false
    });
    await database.usePlugin(cachePlugin);

    console.log('4️⃣  Testing which resources are cached...\n');

    // Check if each resource should be cached
    const usersShould = cachePlugin.shouldCacheResource('users');
    const transactionsShould = cachePlugin.shouldCacheResource('users_transactions_clicks');
    const locksShould = cachePlugin.shouldCacheResource('users_consolidation_locks_clicks');

    console.log(`   users: ${usersShould ? '✅ CACHED' : '❌ NOT CACHED'} (createdBy: user)`);
    console.log(`   users_transactions_clicks: ${transactionsShould ? '✅ CACHED' : '❌ NOT CACHED'} (createdBy: EventualConsistencyPlugin)`);
    console.log(`   users_consolidation_locks_clicks: ${locksShould ? '✅ CACHED' : '❌ NOT CACHED'} (createdBy: EventualConsistencyPlugin)`);

    // Verify expectations
    expect(usersShould).toBe(true); // User resource SHOULD be cached
    expect(transactionsShould).toBe(false); // Plugin resource should NOT be cached
    expect(locksShould).toBe(false); // Plugin resource should NOT be cached

    console.log('\n✅ CachePlugin correctly filters by createdBy!\n');
    console.log('   Summary:');
    console.log('   - User resources: CACHED ✅');
    console.log('   - Plugin resources: NOT CACHED ❌\n');
  }, 30000);

  it('should invalidate cache when record is updated', async () => {
    console.log('\n🧪 Testing cache invalidation on update...\n');
    console.log('=' .repeat(70));

    // Create products resource
    console.log('1️⃣  Creating products resource...\n');
    const products = await database.createResource({
      name: 'products',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        price: 'number|required',
        stock: 'number|default:0'
      }
    });

    // Install CachePlugin
    console.log('2️⃣  Installing CachePlugin (memory driver)...\n');
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: false
    });
    await database.usePlugin(cachePlugin);

    // Insert a product
    console.log('3️⃣  Inserting product...\n');
    await products.insert({
      id: 'prod-001',
      name: 'iPhone 15',
      price: 999,
      stock: 10
    });

    console.log('   ✅ Product created: iPhone 15 ($999, stock: 10)\n');

    // First get (will cache it)
    console.log('4️⃣  First get() - will cache the record...\n');
    const product1 = await products.get('prod-001');
    console.log(`   📦 Fetched: ${product1.name} - $${product1.price} (stock: ${product1.stock})`);
    console.log('   ✅ Record now cached in memory\n');

    // Check cache stats
    const statsBefore = await cachePlugin.getCacheStats();
    console.log(`   📊 Cache keys before update: ${statsBefore.keys.length}\n`);

    // Update the product
    console.log('5️⃣  Updating product (price and stock)...\n');
    await products.update('prod-001', {
      price: 899, // Price drop!
      stock: 5 // Stock reduced
    });

    console.log('   ✅ Product updated: $999 → $899, stock: 10 → 5');
    console.log('   🔥 Cache for prod-001 should be INVALIDATED\n');

    // Second get (should fetch fresh data, not cached)
    console.log('6️⃣  Second get() - should fetch fresh data...\n');
    const product2 = await products.get('prod-001');
    console.log(`   📦 Fetched: ${product2.name} - $${product2.price} (stock: ${product2.stock})`);

    // Verify the data is fresh (updated values)
    console.log('\n7️⃣  Verifying values are up-to-date...\n');
    console.log('   Expected:');
    console.log('   - price: 899');
    console.log('   - stock: 5\n');
    console.log('   Actual:');
    console.log(`   - price: ${product2.price}`);
    console.log(`   - stock: ${product2.stock}\n`);

    expect(product2.price).toBe(899); // Should have NEW price
    expect(product2.stock).toBe(5); // Should have NEW stock

    console.log('=' .repeat(70));
    console.log('\n✅ CACHE INVALIDATION WORKING!\n');
    console.log('   Summary:');
    console.log('   - Product updated successfully');
    console.log('   - Cache was invalidated automatically');
    console.log('   - Second get() returned fresh data\n');
  }, 30000);

  it('should cache list() but invalidate on insert/update/delete', async () => {
    console.log('\n🧪 Testing list() cache invalidation...\n');
    console.log('=' .repeat(70));

    // Create posts resource
    console.log('1️⃣  Creating posts resource...\n');
    const posts = await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|required',
        title: 'string|required',
        views: 'number|default:0'
      }
    });

    // Install CachePlugin
    console.log('2️⃣  Installing CachePlugin...\n');
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: false
    });
    await database.usePlugin(cachePlugin);

    // Insert 3 posts
    console.log('3️⃣  Inserting 3 posts...\n');
    await posts.insert({ id: 'post-1', title: 'First Post', views: 10 });
    await posts.insert({ id: 'post-2', title: 'Second Post', views: 20 });
    await posts.insert({ id: 'post-3', title: 'Third Post', views: 30 });

    console.log('   ✅ 3 posts created\n');

    // First list() - will cache
    console.log('4️⃣  First list() - will cache...\n');
    const list1 = await posts.list();
    console.log(`   📋 Count: ${list1.length} posts`);
    list1.forEach(p => console.log(`      - ${p.title} (${p.views} views)`));
    console.log('   ✅ List cached\n');

    // Update one post
    console.log('5️⃣  Updating post-2 views: 20 → 100...\n');
    await posts.update('post-2', { views: 100 });
    console.log('   ✅ Post updated');
    console.log('   🔥 List cache INVALIDATED\n');

    // Second list() - should be fresh
    console.log('6️⃣  Second list() - should fetch fresh data...\n');
    const list2 = await posts.list();
    console.log(`   📋 Count: ${list2.length} posts`);
    list2.forEach(p => console.log(`      - ${p.title} (${p.views} views)`));

    // Verify post-2 has updated views
    const post2 = list2.find(p => p.id === 'post-2');
    console.log('\n7️⃣  Verifying post-2 views updated...\n');
    console.log(`   Expected: 100`);
    console.log(`   Actual: ${post2?.views}`);
    console.log(`   Status: ${post2?.views === 100 ? '✅ PASS' : '❌ FAIL'}`);

    expect(post2?.views).toBe(100);

    console.log('\n✅ LIST CACHE INVALIDATION WORKING!\n');
  }, 30000);

  it('should allow explicit include of plugin resources', async () => {
    console.log('\n🧪 Testing explicit include of plugin resources...\n');
    console.log('=' .repeat(70));

    // Create user resource
    console.log('1️⃣  Creating users resource...\n');
    const users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        balance: 'number|default:0'
      }
    });

    // Install EventualConsistency
    console.log('2️⃣  Installing EventualConsistencyPlugin...\n');
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        users: ['balance']
      },
      mode: 'async',
      autoConsolidate: false,
      verbose: false
    });
    await database.usePlugin(ecPlugin);

    await database.uploadMetadataFile();

    // Install CachePlugin with EXPLICIT include of plugin resource
    console.log('3️⃣  Installing CachePlugin with EXPLICIT include...\n');
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      include: ['users', 'users_transactions_balance'], // Explicitly include plugin resource
      verbose: false
    });
    await database.usePlugin(cachePlugin);

    console.log('4️⃣  Testing which resources are cached...\n');

    const usersShould = cachePlugin.shouldCacheResource('users');
    const transactionsShould = cachePlugin.shouldCacheResource('users_transactions_balance');
    const locksShould = cachePlugin.shouldCacheResource('users_consolidation_locks_balance');

    console.log(`   users: ${usersShould ? '✅ CACHED' : '❌ NOT CACHED'}`);
    console.log(`   users_transactions_balance: ${transactionsShould ? '✅ CACHED' : '❌ NOT CACHED'} (explicitly included)`);
    console.log(`   users_consolidation_locks_balance: ${locksShould ? '✅ CACHED' : '❌ NOT CACHED'} (not included)`);

    expect(usersShould).toBe(true);
    expect(transactionsShould).toBe(true); // Should be cached because explicitly included!
    expect(locksShould).toBe(false); // Not in include list

    console.log('\n✅ Explicit include works correctly!\n');
    console.log('   Summary:');
    console.log('   - Can override default behavior with include');
    console.log('   - Plugin resources can be cached if needed\n');
  }, 30000);
});
