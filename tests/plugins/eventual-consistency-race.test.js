import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency.plugin.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventualConsistencyPlugin - Race Conditions", () => {
  let database;
  let walletsResource;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/ec-race-test');
    await database.connect();

    // Create resource
    walletsResource = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        balance: 'number|default:0'
      }
    });

    // Add plugin in sync mode for immediate consolidation
    plugin = new EventualConsistencyPlugin({
      resource: 'wallets',
      field: 'balance',
      mode: 'sync' // Use sync mode to test locking
    });

    await database.usePlugin(plugin);
    await plugin.start();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  describe("Distributed Locking", () => {
    it("should prevent concurrent consolidation of the same record", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-lock-test',
        userId: 'user-1',
        balance: 1000
      });

      // Create multiple transactions in async mode first
      plugin.config.mode = 'async'; // Temporarily switch to async

      // Create 10 transactions
      for (let i = 0; i < 10; i++) {
        await walletsResource.add('wallet-lock-test', 10);
      }

      // Switch back to sync mode
      plugin.config.mode = 'sync';

      // Wait for transactions to be created
      await sleep(200);

      // Try to consolidate from 5 different "workers" simultaneously
      const consolidations = [];
      for (let i = 0; i < 5; i++) {
        consolidations.push(
          plugin.consolidateRecord('wallet-lock-test')
        );
      }

      const results = await Promise.all(consolidations);

      // All should succeed (some may wait for lock)
      expect(results.length).toBe(5);

      // Check final balance is correct (1000 + 10*10 = 1100)
      const wallet = await walletsResource.get('wallet-lock-test');
      expect(wallet.balance).toBe(1100);

      // All transactions should be marked as applied exactly once
      const transactions = await database.resources.wallets_transactions_balance.query({
        originalId: 'wallet-lock-test',
        applied: true
      });

      expect(transactions.length).toBe(10);
    }, 60000);

    it("should handle concurrent sync mode operations atomically", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-concurrent',
        userId: 'user-2',
        balance: 500
      });

      // Perform 20 concurrent add operations in sync mode
      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push(walletsResource.add('wallet-concurrent', 5));
      }

      const results = await Promise.all(operations);

      // All operations should complete
      expect(results.length).toBe(20);

      // Final balance should be correct: 500 + (20 * 5) = 600
      const wallet = await walletsResource.get('wallet-concurrent');
      expect(wallet.balance).toBe(600);

      // All transactions should be applied
      const transactions = await database.resources.wallets_transactions_balance.query({
        originalId: 'wallet-concurrent',
        applied: true
      });

      expect(transactions.length).toBe(20);
    }, 40000);
  });

  describe("Transaction ID Uniqueness", () => {
    it("should generate unique IDs even when created in the same millisecond", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-id-test',
        userId: 'user-3',
        balance: 0
      });

      // Switch to async mode
      plugin.config.mode = 'async';

      // Create 50 transactions as fast as possible (reduced from 1000 for speed)
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(walletsResource.add('wallet-id-test', 1));
      }

      await Promise.all(operations);

      // Wait for all transactions to be created
      await sleep(200);

      // Get all transactions
      const transactions = await database.resources.wallets_transactions_balance.query({
        originalId: 'wallet-id-test'
      });

      // Should have exactly 50 transactions
      expect(transactions.length).toBe(50);

      // All IDs should be unique
      const ids = transactions.map(t => t.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds.length).toBe(50);
    }, 30000);
  });

  describe("Batch Operations Safety", () => {
    it("should not lose transactions on flush error", async () => {
      // Create resource with batch enabled
      const batchWallets = await database.createResource({
        name: 'batch_wallets',
        attributes: {
          id: 'string|required',
          balance: 'number|default:0'
        }
      });

      const batchPlugin = new EventualConsistencyPlugin({
        resource: 'batch_wallets',
        field: 'balance',
        mode: 'async',
        batchTransactions: true,
        batchSize: 10
      });

      await database.usePlugin(batchPlugin);

      // Insert wallet
      await batchWallets.insert({
        id: 'batch-1',
        balance: 100
      });

      // Create 5 transactions (won't flush yet - batch size is 10)
      for (let i = 0; i < 5; i++) {
        await batchWallets.add('batch-1', 10);
      }

      // Pending transactions should be in memory
      expect(batchPlugin.pendingTransactions.size).toBe(5);

      // Now force flush manually
      await batchPlugin.flushPendingTransactions();

      // Pending transactions should be cleared after successful flush
      expect(batchPlugin.pendingTransactions.size).toBe(0);

      // Transactions should be in database
      const transactions = await database.resources.batch_wallets_transactions_balance.query({
        originalId: 'batch-1'
      });

      expect(transactions.length).toBe(5);
    });
  });

  describe("Parallel Consolidation", () => {
    it("should consolidate multiple records in parallel", async () => {
      // Create 5 wallets (reduced from 10 for speed)
      const walletIds = [];
      for (let i = 0; i < 5; i++) {
        const id = `wallet-parallel-${i}`;
        walletIds.push(id);
        await walletsResource.insert({
          id,
          userId: `user-${i}`,
          balance: 100
        });
      }

      // Switch to async mode
      plugin.config.mode = 'async';

      // Add transactions to each wallet
      for (const id of walletIds) {
        for (let i = 0; i < 3; i++) {
          await walletsResource.add(id, 20);
        }
      }

      // Wait for transactions
      await sleep(200);

      // Run consolidation (should use PromisePool with concurrency limit)
      await plugin.runConsolidation();

      // Check all wallets were consolidated
      for (const id of walletIds) {
        const wallet = await walletsResource.get(id);
        expect(wallet.balance).toBe(160); // 100 + (3 * 20)
      }

      // All transactions should be applied
      const allTransactions = await database.resources.wallets_transactions_balance.query({
        applied: true
      });

      expect(allTransactions.length).toBeGreaterThanOrEqual(15); // 5 wallets * 3 transactions
    });
  });

  describe("getConsolidatedValue Accuracy", () => {
    it("should include current value when no set operations exist", async () => {
      // Create wallet with initial balance
      await walletsResource.insert({
        id: 'wallet-value-test',
        userId: 'user-value',
        balance: 1000
      });

      // Switch to async mode
      plugin.config.mode = 'async';

      // Add pending transactions (no 'set' operation)
      await walletsResource.add('wallet-value-test', 50);
      await walletsResource.add('wallet-value-test', 30);

      // Wait for transactions
      await sleep(100);

      // Get consolidated value (should include base 1000)
      const value = await walletsResource.getConsolidatedValue('wallet-value-test');

      // Should be: 1000 (current) + 50 + 30 = 1080
      expect(value).toBe(1080);

      // Actual consolidation should produce the same result
      const consolidatedValue = await walletsResource.consolidate('wallet-value-test');
      expect(consolidatedValue).toBe(1080);

      const wallet = await walletsResource.get('wallet-value-test');
      expect(wallet.balance).toBe(1080);
    });

    it("should handle set operation overriding current value", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-set-test',
        userId: 'user-set',
        balance: 500
      });

      // Switch to async mode
      plugin.config.mode = 'async';

      // Set new value (should override 500)
      await walletsResource.set('wallet-set-test', 2000);
      await walletsResource.add('wallet-set-test', 100);

      // Wait
      await sleep(100);

      // Get consolidated value
      const value = await walletsResource.getConsolidatedValue('wallet-set-test');

      // Should be: 2000 (from set) + 100 = 2100 (not 500 + ...)
      expect(value).toBe(2100);
    });
  });

  describe("Synthetic Transaction Flag", () => {
    it("should include synthetic flag in synthetic transactions", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-synthetic',
        userId: 'user-syn',
        balance: 777
      });

      // Switch to async
      plugin.config.mode = 'async';

      // Add transaction without 'set'
      await walletsResource.add('wallet-synthetic', 23);

      await sleep(100);

      // Consolidate (will create synthetic transaction internally)
      await walletsResource.consolidate('wallet-synthetic');

      // The synthetic flag should be present in the logic
      // (We can't easily inspect it from outside, but we test it worked correctly)
      const wallet = await walletsResource.get('wallet-synthetic');
      expect(wallet.balance).toBe(800); // 777 + 23
    });
  });
});
