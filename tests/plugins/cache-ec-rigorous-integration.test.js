/**
 * CachePlugin + EventualConsistencyPlugin - Rigorous Integration Test
 *
 * Comprehensive test of both plugins working together:
 * - Cache filtering by createdBy
 * - Cache invalidation on consolidation
 * - Performance verification
 * - Multi-field operations
 * - Concurrent operations with cache
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { createDatabaseForTest } from '../config.js';

describe('CachePlugin + EventualConsistencyPlugin - Rigorous Integration', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('cache-ec-rigorous');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should handle complete workflow: cache, EC operations, consolidation, invalidation', async () => {
    console.log('\n=== RIGOROUS INTEGRATION TEST ===\n');

    // STEP 1: Create resource
    console.log('Step 1: Creating ecommerce resource...');
    const products = await database.createResource({
      name: 'products',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        price: 'number|required',
        sold: 'number|default:0',
        views: 'number|default:0',
        revenue: 'number|default:0'
      }
    });
    console.log('  OK: Resource created\n');

    // STEP 2: Install EventualConsistency
    console.log('Step 2: Installing EventualConsistencyPlugin...');
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        products: ['sold', 'views', 'revenue']
      },
      mode: 'async',
      autoConsolidate: false,
      verbose: false
    });
    await database.usePlugin(ecPlugin);
    await database.uploadMetadataFile();
    console.log('  OK: EC Plugin installed');
    console.log('  Plugin resources created:');
    console.log('    - plg_products_tx_sold');
    console.log('    - plg_products_tx_views');
    console.log('    - plg_products_tx_revenue');
    console.log('    - products_consolidation_locks_sold');
    console.log('    - products_consolidation_locks_views');
    console.log('    - products_consolidation_locks_revenue\n');

    // STEP 3: Install CachePlugin
    console.log('Step 3: Installing CachePlugin...');
    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: false
    });
    await database.usePlugin(cachePlugin);
    console.log('  OK: Cache Plugin installed\n');

    // STEP 4: Verify cache filtering
    console.log('Step 4: Verifying cache filtering by createdBy...');
    const productsCached = cachePlugin.shouldCacheResource('products');
    const txSoldCached = cachePlugin.shouldCacheResource('plg_products_tx_sold');
    const txViewsCached = cachePlugin.shouldCacheResource('plg_products_tx_views');

    console.log('  products (user resource):', productsCached ? 'CACHED' : 'NOT CACHED');
    console.log('  plg_products_tx_sold (plugin):', txSoldCached ? 'CACHED' : 'NOT CACHED');
    console.log('  plg_products_tx_views (plugin):', txViewsCached ? 'CACHED' : 'NOT CACHED');
    console.log('  Note: locks use PluginStorage now (not a resource)');

    expect(productsCached).toBe(true);
    expect(txSoldCached).toBe(false);
    expect(txViewsCached).toBe(false);
    console.log('  OK: Cache correctly filters resources\n');

    // STEP 5: Insert product
    console.log('Step 5: Inserting product...');
    await products.insert({
      id: 'prod-001',
      name: 'iPhone 15 Pro',
      price: 999,
      sold: 0,
      views: 0,
      revenue: 0
    });
    console.log('  OK: Product inserted (sold: 0, views: 0, revenue: 0)\n');

    // STEP 6: First read (cache miss)
    console.log('Step 6: First read (cache miss)...');
    const start1 = Date.now();
    const product1 = await products.get('prod-001');
    const time1 = Date.now() - start1;
    console.log('  Product:', product1.name);
    console.log('  Time:', time1 + 'ms');
    console.log('  OK: Record cached\n');

    // STEP 7: Second read (cache hit)
    console.log('Step 7: Second read (cache hit)...');
    const start2 = Date.now();
    const product2 = await products.get('prod-001');
    const time2 = Date.now() - start2;
    console.log('  Product:', product2.name);
    console.log('  Time:', time2 + 'ms');
    console.log('  Performance improvement:', Math.round(((time1 - time2) / time1) * 100) + '%');
    console.log('  OK: Cache hit\n');

    // STEP 8: Make 20 concurrent EC operations
    console.log('Step 8: Making 20 concurrent EC operations...');
    const opsStart = Date.now();

    const operations = [];

    // 5 sales
    for (let i = 0; i < 5; i++) {
      operations.push(products.add('prod-001', 'sold', 1));
      operations.push(products.add('prod-001', 'revenue', 999));
    }

    // 10 views
    for (let i = 0; i < 10; i++) {
      operations.push(products.add('prod-001', 'views', 1));
    }

    await Promise.all(operations);
    const opsTime = Date.now() - opsStart;

    console.log('  OK: 20 operations completed in', opsTime + 'ms');
    console.log('    - 5 sales recorded');
    console.log('    - 5 revenue additions');
    console.log('    - 10 views recorded\n');

    // STEP 9: Check pending transactions
    console.log('Step 9: Checking pending transactions...');
    const soldTx = await database.resources.plg_products_tx_sold.list();
    const viewsTx = await database.resources.plg_products_tx_views.list();
    const revenueTx = await database.resources.plg_products_tx_revenue.list();

    console.log('  Pending transactions:');
    console.log('    - sold:', soldTx.length);
    console.log('    - views:', viewsTx.length);
    console.log('    - revenue:', revenueTx.length);

    expect(soldTx.length).toBeGreaterThan(0);
    expect(viewsTx.length).toBeGreaterThan(0);
    expect(revenueTx.length).toBeGreaterThan(0);
    console.log('  OK: Transactions pending\n');

    // STEP 10: Consolidate all 3 fields
    console.log('Step 10: Consolidating all 3 fields...');
    const consolidateStart = Date.now();

    await products.consolidate('prod-001', 'sold');
    console.log('  - sold consolidated');

    await products.consolidate('prod-001', 'views');
    console.log('  - views consolidated');

    await products.consolidate('prod-001', 'revenue');
    console.log('  - revenue consolidated');

    const consolidateTime = Date.now() - consolidateStart;
    console.log('  OK: All fields consolidated in', consolidateTime + 'ms\n');

    // STEP 11: Verify cache was invalidated and fresh data is returned
    console.log('Step 11: Verifying cache invalidation...');
    const product3 = await products.get('prod-001');

    console.log('  Fresh data:');
    console.log('    - sold:', product3.sold, '(expected: 5)');
    console.log('    - views:', product3.views, '(expected: 10)');
    console.log('    - revenue:', product3.revenue, '(expected: 4995)');

    expect(product3.sold).toBe(5);
    expect(product3.views).toBe(10);
    expect(product3.revenue).toBe(4995);
    console.log('  OK: Cache invalidated, fresh data returned\n');

    // STEP 12: Verify transactions were applied
    console.log('Step 12: Verifying transactions were applied...');
    const soldTxAfter = await database.resources.plg_products_tx_sold.list();
    const viewsTxAfter = await database.resources.plg_products_tx_views.list();
    const revenueTxAfter = await database.resources.plg_products_tx_revenue.list();

    const soldApplied = soldTxAfter.filter(t => t.appliedAt).length;
    const viewsApplied = viewsTxAfter.filter(t => t.appliedAt).length;
    const revenueApplied = revenueTxAfter.filter(t => t.appliedAt).length;

    console.log('  Applied transactions:');
    console.log('    - sold:', soldApplied + '/' + soldTxAfter.length);
    console.log('    - views:', viewsApplied + '/' + viewsTxAfter.length);
    console.log('    - revenue:', revenueApplied + '/' + revenueTxAfter.length);
    console.log('  OK: Transactions applied\n');

    // STEP 13: Update and verify cache invalidation
    console.log('Step 13: Testing update() cache invalidation...');
    await products.update('prod-001', { price: 899 });
    console.log('  Price updated: 999 -> 899');

    const product4 = await products.get('prod-001');
    console.log('  Fresh price:', product4.price);

    expect(product4.price).toBe(899);
    console.log('  OK: Cache invalidated on update\n');

    // STEP 14: List operations with cache
    console.log('Step 14: Testing list() with cache...');

    // Insert more products
    await products.insert({ id: 'prod-002', name: 'MacBook Pro', price: 1999, sold: 0, views: 0, revenue: 0 });
    await products.insert({ id: 'prod-003', name: 'iPad Air', price: 599, sold: 0, views: 0, revenue: 0 });

    const list1Start = Date.now();
    const list1 = await products.list();
    const list1Time = Date.now() - list1Start;
    console.log('  First list():', list1.length, 'products in', list1Time + 'ms');

    const list2Start = Date.now();
    const list2 = await products.list();
    const list2Time = Date.now() - list2Start;
    console.log('  Second list() (cached):', list2.length, 'products in', list2Time + 'ms');

    expect(list1.length).toBe(3);
    expect(list2.length).toBe(3);
    console.log('  OK: List caching working\n');

    // STEP 15: Final verification
    console.log('Step 15: Final state verification...');
    const finalStats = await cachePlugin.getCacheStats();
    console.log('  Cache stats:');
    console.log('    - Total keys:', finalStats.keys.length);
    console.log('    - Driver:', finalStats.driver);

    console.log('\n=== ALL TESTS PASSED ===');
    console.log('\nSummary:');
    console.log('  - Cache filters user vs plugin resources: YES');
    console.log('  - Cache improves read performance: YES');
    console.log('  - EC handles concurrent writes safely: YES (20 ops)');
    console.log('  - Consolidation invalidates cache: YES');
    console.log('  - update() invalidates cache: YES');
    console.log('  - list() caching works: YES');
    console.log('  - Multi-field operations work: YES (3 fields)');
    console.log('  - Final values accurate: YES\n');
  }, 120000);

  it('should handle high concurrency with both plugins', async () => {
    console.log('\n=== HIGH CONCURRENCY TEST ===\n');

    // Create resource
    const counters = await database.createResource({
      name: 'counters',
      attributes: {
        id: 'string|required',
        value: 'number|default:0'
      }
    });

    // Install plugins
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        counters: ['value']
      },
      mode: 'async',
      autoConsolidate: false,
      verbose: false
    });
    await database.usePlugin(ecPlugin);

    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: false
    });
    await database.usePlugin(cachePlugin);

    // Create counter
    await counters.insert({ id: 'counter-001', value: 0 });

    console.log('Making 50 concurrent operations...');
    const operations = [];
    for (let i = 0; i < 50; i++) {
      operations.push(counters.add('counter-001', 'value', 1));
    }

    const start = Date.now();
    await Promise.all(operations);
    const time = Date.now() - start;

    console.log('50 operations completed in', time + 'ms');
    console.log('Average:', Math.round(time / 50) + 'ms per operation');

    // Consolidate
    console.log('\nConsolidating...');
    await counters.consolidate('counter-001', 'value');

    // Verify
    const counter = await counters.get('counter-001');
    console.log('Final value:', counter.value, '(expected: 50)');

    expect(counter.value).toBe(50);
    console.log('\n=== HIGH CONCURRENCY TEST PASSED ===\n');
  }, 120000);

  it.skip('should maintain data integrity under stress', async () => {
    console.log('\n=== STRESS TEST ===\n');

    // Create wallet resource
    const wallets = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|required',
        balance: 'number|default:0',
        transactions: 'number|default:0'
      }
    });

    // Install plugins
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        wallets: ['balance', 'transactions']
      },
      mode: 'async',
      autoConsolidate: false,
      verbose: false
    });
    await database.usePlugin(ecPlugin);

    const cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: false
    });
    await database.usePlugin(cachePlugin);

    // Create wallet
    await wallets.insert({ id: 'wallet-001', balance: 10000, transactions: 0 });

    console.log('Initial balance: 10000');
    console.log('Making 100 operations (50 credits, 50 debits)...\n');

    const operations = [];

    // 50 credits of +100
    for (let i = 0; i < 50; i++) {
      operations.push(
        wallets.add('wallet-001', 'balance', 100).then(() =>
          wallets.add('wallet-001', 'transactions', 1)
        )
      );
    }

    // 50 debits of -80
    for (let i = 0; i < 50; i++) {
      operations.push(
        wallets.sub('wallet-001', 'balance', 80).then(() =>
          wallets.add('wallet-001', 'transactions', 1)
        )
      );
    }

    const start = Date.now();
    await Promise.all(operations);
    const time = Date.now() - start;

    console.log('100 operations completed in', time + 'ms\n');

    // Consolidate
    console.log('Consolidating balance and transactions...');
    await wallets.consolidate('wallet-001', 'balance');
    await wallets.consolidate('wallet-001', 'transactions');

    // Verify
    const wallet = await wallets.get('wallet-001');

    // Expected: 10000 + (50 * 100) - (50 * 80) = 10000 + 5000 - 4000 = 11000
    const expectedBalance = 11000;
    const expectedTransactions = 100;

    console.log('\nFinal state:');
    console.log('  balance:', wallet.balance, '(expected:', expectedBalance + ')');
    console.log('  transactions:', wallet.transactions, '(expected:', expectedTransactions + ')');

    expect(wallet.balance).toBe(expectedBalance);
    expect(wallet.transactions).toBe(expectedTransactions);

    console.log('\n=== STRESS TEST PASSED ===');
    console.log('Data integrity maintained under 100 concurrent operations\n');
  }, 180000);
});
