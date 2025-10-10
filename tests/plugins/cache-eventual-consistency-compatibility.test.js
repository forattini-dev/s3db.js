/**
 * Cache + EventualConsistencyPlugin Compatibility Tests
 * Tests that plugin-created resources are not cached and cache is properly invalidated
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { createDatabaseForTest } from '../config.js';

describe('CachePlugin + EventualConsistencyPlugin Compatibility', () => {
  let database;
  let wallets;
  let eventualPlugin;
  let cachePlugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('cache-eventual-consistency');

    // Create wallets resource
    wallets = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        balance: 'number|default:0'
      },
      createdBy: 'user' // Explicitly user-created
    });

    // Add EventualConsistencyPlugin first
    eventualPlugin = new EventualConsistencyPlugin({
      resources: {
        wallets: ['balance']
      },
      mode: 'sync',
      autoConsolidate: false,
      enableAnalytics: false,
      verbose: false
    });

    await database.usePlugin(eventualPlugin);

    // Add CachePlugin after (so it can see all resources)
    cachePlugin = new CachePlugin({
      driver: 'memory',
      verbose: false
    });

    await database.usePlugin(cachePlugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should NOT cache plugin-created resources (transactions, locks)', async () => {
    // Check that transaction resource exists
    const transactionResourceName = 'wallets_transactions_balance';
    const transactionResource = database.resources[transactionResourceName];

    expect(transactionResource).toBeDefined();

    // Check that transaction resource has createdBy = 'EventualConsistencyPlugin'
    const transactionMetadata = database.savedMetadata?.resources?.[transactionResourceName];
    expect(transactionMetadata?.createdBy).toBe('EventualConsistencyPlugin');

    // Check that shouldCacheResource returns false for plugin resources
    const shouldCache = cachePlugin.shouldCacheResource(transactionResourceName);
    expect(shouldCache).toBe(false);

    // Verify transaction resource doesn't have cache property
    expect(transactionResource.cache).toBeUndefined();
  });

  it('should cache user-created resources (wallets)', async () => {
    // Check that wallets resource has createdBy = 'user'
    const walletsMetadata = database.savedMetadata?.resources?.wallets;
    expect(walletsMetadata?.createdBy).toBe('user');

    // Check that shouldCacheResource returns true for user resources
    const shouldCache = cachePlugin.shouldCacheResource('wallets');
    expect(shouldCache).toBe(true);

    // Verify wallets resource HAS cache property
    expect(wallets.cache).toBeDefined();
  });

  it('should invalidate cache after consolidation', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 100 });

    // First get (will be cached)
    const wallet1 = await wallets.get('w1');
    expect(wallet1.balance).toBe(100);

    // Generate cache key and manually set cache
    const cacheKey = await wallets.cacheKeyFor({ id: 'w1' });
    await wallets.cache.set(cacheKey, { ...wallet1 });

    // Verify it's in cache
    const cached1 = await wallets.cache.get(cacheKey);
    expect(cached1).toBeDefined();
    expect(cached1.balance).toBe(100);

    // Add transactions
    await wallets.add('w1', 'balance', 50);
    await wallets.add('w1', 'balance', 25);

    // Consolidate (should invalidate cache)
    await wallets.consolidate('w1', 'balance');

    // Check that cache was invalidated
    const cached2 = await wallets.cache.get(cacheKey);
    expect(cached2).toBeNull(); // Cache should be empty

    // Get again (will fetch from S3 and cache the new value)
    const wallet2 = await wallets.get('w1');
    expect(wallet2.balance).toBe(175); // 100 + 50 + 25
  });

  it('should work correctly when cache is disabled for resource', async () => {
    // Create resource without cache
    const accounts = await database.createResource({
      name: 'accounts',
      attributes: {
        id: 'string|required',
        balance: 'number|default:0'
      },
      cache: false,
      createdBy: 'user'
    });

    // Add EventualConsistencyPlugin
    const accountsPlugin = new EventualConsistencyPlugin({
      resources: {
        accounts: ['balance']
      },
      mode: 'sync',
      autoConsolidate: false
    });

    await database.usePlugin(accountsPlugin);

    // Insert and consolidate
    await accounts.insert({ id: 'a1', balance: 0 });
    await accounts.add('a1', 'balance', 100);
    await accounts.consolidate('a1', 'balance');

    // Verify value was updated
    const account = await accounts.get('a1');
    expect(account.balance).toBe(100);
  });

  it('should allow explicit inclusion of plugin resources in cache', async () => {
    // Disconnect and reconnect with new cache config
    await database.disconnect();

    database = await createDatabaseForTest('cache-explicit-include');

    wallets = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|required',
        balance: 'number|default:0'
      }
    });

    eventualPlugin = new EventualConsistencyPlugin({
      resources: {
        wallets: ['balance']
      },
      mode: 'sync',
      autoConsolidate: false,
      enableAnalytics: false
    });

    await database.usePlugin(eventualPlugin);

    const transactionResourceName = 'wallets_transactions_balance';

    // Add cache with explicit include for transaction resource
    cachePlugin = new CachePlugin({
      driver: 'memory',
      include: [transactionResourceName], // Explicitly include plugin resource
      verbose: false
    });

    await database.usePlugin(cachePlugin);

    // Now plugin resource SHOULD be cached
    const shouldCache = cachePlugin.shouldCacheResource(transactionResourceName);
    expect(shouldCache).toBe(true);

    const transactionResource = database.resources[transactionResourceName];
    expect(transactionResource.cache).toBeDefined();
  });

  it('should handle multiple consolidations with cache correctly', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    // First consolidation
    await wallets.add('w1', 'balance', 100);
    await wallets.consolidate('w1', 'balance');

    const wallet1 = await wallets.get('w1');
    expect(wallet1.balance).toBe(100);

    // Second consolidation
    await wallets.add('w1', 'balance', 50);
    await wallets.consolidate('w1', 'balance');

    const wallet2 = await wallets.get('w1');
    expect(wallet2.balance).toBe(150);

    // Third consolidation
    await wallets.add('w1', 'balance', 25);
    await wallets.consolidate('w1', 'balance');

    const wallet3 = await wallets.get('w1');
    expect(wallet3.balance).toBe(175);

    // All should have the correct value (no stale cache)
    expect(wallet1.balance).toBe(100);
    expect(wallet2.balance).toBe(150);
    expect(wallet3.balance).toBe(175);
  });

  it('should handle cache invalidation errors gracefully', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    // Mock cache.delete to throw error
    const originalDelete = wallets.cache.delete;
    let deleteCallCount = 0;
    wallets.cache.delete = async () => {
      deleteCallCount++;
      throw new Error('Cache delete failed');
    };

    // Add transaction and consolidate
    await wallets.add('w1', 'balance', 100);

    // Should not throw error (gracefully handles cache invalidation failure)
    let consolidateResult;
    let consolidateError;
    try {
      consolidateResult = await wallets.consolidate('w1', 'balance');
    } catch (err) {
      consolidateError = err;
    }

    expect(consolidateError).toBeUndefined(); // No error thrown
    expect(consolidateResult).toBe(100); // Consolidation completed successfully
    expect(deleteCallCount).toBe(1); // Delete was attempted

    // Restore original delete
    wallets.cache.delete = originalDelete;

    // Verify value was still updated despite cache error
    const wallet = await wallets.get('w1');
    expect(wallet.balance).toBe(100);
  });
});
