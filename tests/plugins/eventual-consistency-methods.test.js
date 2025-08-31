import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency.plugin.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventualConsistencyPlugin Methods", () => {
  let database;
  let walletsResource;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/ec-methods-test');
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

    // Add plugin
    plugin = new EventualConsistencyPlugin({
      resource: 'wallets',
      field: 'balance',
      mode: 'async'
    });

    await database.usePlugin(plugin);
    await plugin.start();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  describe("Transaction Creation", () => {
    it("should create transaction with set", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-1',
        userId: 'user-1',
        balance: 0
      });

      // Use set to create transaction
      await walletsResource.set('wallet-1', 100);

      // Wait for async processing
      await sleep(100);

      // Check transaction was created
      const transactions = await database.resources.wallets_transactions_balance.query({
        originalId: 'wallet-1'
      });

      expect(transactions.length).toBe(1);
      expect(transactions[0].field).toBe('balance');
      expect(transactions[0].value).toBe(100);
      expect(transactions[0].operation).toBe('set');
      expect(transactions[0].source).toBe('set');
    });

    it("should create transaction with add", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-2',
        userId: 'user-2',
        balance: 50
      });

      // Use add
      await walletsResource.add('wallet-2', 100);

      // Wait for async processing
      await sleep(100);

      // Check transaction
      const transactions = await database.resources.wallets_transactions_balance.query({
        originalId: 'wallet-2'
      });

      expect(transactions.length).toBe(1);
      expect(transactions[0].operation).toBe('add');
      expect(transactions[0].value).toBe(100);
    });

    it("should create transaction with sub", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-3',
        userId: 'user-3',
        balance: 100
      });

      // Use sub
      await walletsResource.sub('wallet-3', 25);

      // Wait for async processing
      await sleep(100);

      // Check transaction
      const transactions = await database.resources.wallets_transactions_balance.query({
        originalId: 'wallet-3'
      });

      expect(transactions.length).toBe(1);
      expect(transactions[0].operation).toBe('sub');
      expect(transactions[0].value).toBe(25);
    });
  });

  describe("Consolidation", () => {
    it("should consolidate with default reducer", async () => {
      const walletId = 'wallet-consolidate';
      
      // Create wallet
      await walletsResource.insert({
        id: walletId,
        userId: 'user-consolidate',
        balance: 100
      });

      // Perform operations
      await walletsResource.set(walletId, 100);
      await walletsResource.add(walletId, 50);
      await walletsResource.sub(walletId, 30);
      await walletsResource.add(walletId, 20);

      // Wait for async processing
      await sleep(200);

      // Consolidate
      const consolidatedValue = await walletsResource.consolidate(walletId);
      
      // Should be: 100 (set) + 50 - 30 + 20 = 140
      expect(consolidatedValue).toBe(140);

      // Verify in database
      const wallet = await walletsResource.get(walletId);
      expect(wallet.balance).toBe(140);
    });
  });

  describe("Sync Mode", () => {
    it("should immediately update in sync mode", async () => {
      // Create new plugin in sync mode
      const syncPlugin = new EventualConsistencyPlugin({
        resource: 'accounts',
        field: 'credits',
        mode: 'sync'
      });

      const accountsResource = await database.createResource({
        name: 'accounts',
        attributes: {
          id: 'string|required',
          credits: 'number|default:0'
        }
      });

      await database.usePlugin(syncPlugin);

      // Create account
      await accountsResource.insert({
        id: 'account-sync',
        credits: 1000
      });

      // Operations should be immediate in sync mode
      await accountsResource.add('account-sync', 500);
      
      // No need to wait in sync mode
      const account = await accountsResource.get('account-sync');
      expect(account.credits).toBe(1500);

      // More operations
      await accountsResource.sub('account-sync', 200);
      const account2 = await accountsResource.get('account-sync');
      expect(account2.credits).toBe(1300);
    });
  });

  describe("Parallel Operations", () => {
    it("should handle parallel operations correctly", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-parallel',
        userId: 'user-parallel',
        balance: 1000
      });

      // Execute parallel operations
      const operations = [];
      
      // 10 adds of 10 each = +100
      for (let i = 0; i < 10; i++) {
        operations.push(walletsResource.add('wallet-parallel', 10));
      }
      
      // 5 subs of 20 each = -100
      for (let i = 0; i < 5; i++) {
        operations.push(walletsResource.sub('wallet-parallel', 20));
      }

      await Promise.all(operations);
      
      // Wait for async processing
      await sleep(200);

      // Consolidate
      const finalBalance = await walletsResource.consolidate('wallet-parallel');
      
      // Should be: 1000 + 100 - 100 = 1000
      expect(finalBalance).toBe(1000);
    });

    it("should maintain consistency with chaos operations", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-chaos',
        userId: 'user-chaos',
        balance: 5000
      });

      // Generate random operations
      const operations = [];
      let expectedBalance = 5000;

      for (let i = 0; i < 30; i++) {
        if (Math.random() < 0.5) {
          const amount = Math.floor(Math.random() * 100) + 1;
          operations.push(walletsResource.add('wallet-chaos', amount));
          expectedBalance += amount;
        } else {
          const amount = Math.floor(Math.random() * 50) + 1;
          operations.push(walletsResource.sub('wallet-chaos', amount));
          expectedBalance -= amount;
        }
      }

      // Execute all in parallel
      await Promise.all(operations);
      
      // Wait for async processing
      await sleep(300);

      // Consolidate and verify
      const finalBalance = await walletsResource.consolidate('wallet-chaos');
      expect(finalBalance).toBe(expectedBalance);
    });
  });

  describe("Partition Structure", () => {
    it("should create transaction resource with day and month partitions", async () => {
      // Check that the transaction resource has the correct partitions
      const transactionResource = database.resources.wallets_transactions_balance;
      expect(transactionResource).toBeDefined();
      
      // Verify partition configuration (partitions are in config)
      const partitions = transactionResource.config.partitions;
      expect(partitions).toBeDefined();
      expect(partitions.byDay).toBeDefined();
      expect(partitions.byDay.fields.cohortDate).toBe('string');
      expect(partitions.byMonth).toBeDefined();
      expect(partitions.byMonth.fields.cohortMonth).toBe('string');
    });

    it("should store transactions with correct cohort date and month", async () => {
      // Create wallet
      await walletsResource.insert({
        id: 'wallet-partition',
        userId: 'user-partition',
        balance: 100
      });

      // Add transaction
      await walletsResource.add('wallet-partition', 50);
      
      // Wait for async processing
      await sleep(100);

      // Query transaction
      const transactions = await database.resources.wallets_transactions_balance.query({
        originalId: 'wallet-partition'
      });

      expect(transactions.length).toBeGreaterThan(0);
      const transaction = transactions[0];
      
      // Check cohort fields format
      expect(transaction.cohortDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
      expect(transaction.cohortMonth).toMatch(/^\d{4}-\d{2}$/);      // YYYY-MM
      
      // Verify the cohort date is reasonable (within 1 day of now)
      const txDate = new Date(transaction.cohortDate);
      const now = new Date();
      const dayDiff = Math.abs(txDate - now) / (1000 * 60 * 60 * 24);
      expect(dayDiff).toBeLessThan(2); // Should be today or yesterday/tomorrow (timezone differences)
    });

    it("should respect timezone configuration for cohorts", async () => {
      // Create resource with Sao Paulo timezone
      const brazilResource = await database.createResource({
        name: 'brazil_accounts',
        attributes: {
          id: 'string|required',
          balance: 'number|default:0'
        }
      });

      const brazilPlugin = new EventualConsistencyPlugin({
        resource: 'brazil_accounts',
        field: 'balance',
        mode: 'sync',
        cohort: {
          timezone: 'America/Sao_Paulo'  // UTC-3
        }
      });

      await database.usePlugin(brazilPlugin);

      // Create account
      await brazilResource.insert({
        id: 'brazil-1',
        balance: 1000
      });

      // Add transaction
      await brazilResource.add('brazil-1', 100);

      // Query transaction
      const transactions = await database.resources.brazil_accounts_transactions_balance.query({
        originalId: 'brazil-1'
      });

      expect(transactions.length).toBeGreaterThan(0);
      const transaction = transactions[0];

      // Verify cohort date is adjusted for Sao Paulo timezone (UTC-3)
      const date = new Date(transaction.timestamp);
      const spOffset = -3 * 3600000; // Sao Paulo is UTC-3
      const spDate = new Date(date.getTime() + spOffset);
      
      const expectedDate = `${spDate.getFullYear()}-${String(spDate.getMonth() + 1).padStart(2, '0')}-${String(spDate.getDate()).padStart(2, '0')}`;
      const expectedMonth = `${spDate.getFullYear()}-${String(spDate.getMonth() + 1).padStart(2, '0')}`;
      
      expect(transaction.cohortDate).toBe(expectedDate);
      expect(transaction.cohortMonth).toBe(expectedMonth);
    });
  });

  describe("Helper Methods", () => {
    it("should have all helper methods available", async () => {
      expect(typeof walletsResource.set).toBe('function');
      expect(typeof walletsResource.add).toBe('function');
      expect(typeof walletsResource.sub).toBe('function');
      expect(typeof walletsResource.consolidate).toBe('function');
    });

    it("should use consistent method names regardless of field", async () => {
      // Create resource with different field name
      const pointsResource = await database.createResource({
        name: 'points',
        attributes: {
          id: 'string|required',
          score: 'number|default:0'
        }
      });

      const pointsPlugin = new EventualConsistencyPlugin({
        resource: 'points',
        field: 'score',
        mode: 'async'
      });

      await database.usePlugin(pointsPlugin);

      // Should have the same methods available
      expect(typeof pointsResource.set).toBe('function');
      expect(typeof pointsResource.add).toBe('function');
      expect(typeof pointsResource.sub).toBe('function');
      expect(typeof pointsResource.consolidate).toBe('function');
    });
  });
});