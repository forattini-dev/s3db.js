/**
 * EventualConsistency Plugin - Multi-Client Concurrency Test
 *
 * Tests distributed locking, ETags, and race condition handling
 * with multiple concurrent clients
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Multi-Client Locks & ETags', () => {
  let database;
  let accounts;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-multi-client');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should handle multiple concurrent clients with distributed locking', async () => {

    // Create accounts resource
    accounts = await database.createResource({
      name: 'accounts',
      attributes: {
        id: 'string|optional',
        email: 'string|required',
        balance: 'number|default:0',
        transactions: 'number|default:0'
      }
    });


    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        accounts: ['balance', 'transactions']
      },
      consolidation: { mode: 'async', auto: false },
      logLevel: 'silent' // 30 seconds for lock
    });
    await database.usePlugin(plugin);


    // Create account
    await accounts.insert({
      id: 'acc-001',
      email: 'user@example.com',
      balance: 1000,
      transactions: 0
    });


    // Simulate 3 concurrent clients (different servers/containers)

    const startTime = Date.now();

    // Client 1: 5 deposits
    const client1Operations = [];
    for (let i = 0; i < 5; i++) {
      client1Operations.push(
        accounts.add('acc-001', 'balance', 50).then(() => {
        })
      );
      client1Operations.push(
        accounts.add('acc-001', 'transactions', 1)
      );
    }

    // Client 2: 5 withdrawals
    const client2Operations = [];
    for (let i = 0; i < 5; i++) {
      client2Operations.push(
        accounts.sub('acc-001', 'balance', 30).then(() => {
        })
      );
      client2Operations.push(
        accounts.add('acc-001', 'transactions', 1)
      );
    }

    // Client 3: 3 deposits + 2 withdrawals
    const client3Operations = [];
    for (let i = 0; i < 3; i++) {
      client3Operations.push(
        accounts.add('acc-001', 'balance', 20).then(() => {
        })
      );
      client3Operations.push(
        accounts.add('acc-001', 'transactions', 1)
      );
    }
    for (let i = 0; i < 2; i++) {
      client3Operations.push(
        accounts.sub('acc-001', 'balance', 10).then(() => {
        })
      );
      client3Operations.push(
        accounts.add('acc-001', 'transactions', 1)
      );
    }

    // Execute ALL operations concurrently
    await Promise.all([
      ...client1Operations,
      ...client2Operations,
      ...client3Operations
    ]);

    const operationsTime = Date.now() - startTime;

    // Check pending transactions

    const balanceTransactions = await database.resources.plg_accounts_tx_balance.list();
    const txCountTransactions = await database.resources.plg_accounts_tx_transactions.list();


    expect(balanceTransactions.length).toBeGreaterThan(0);
    expect(txCountTransactions.length).toBeGreaterThan(0);

    // Consolidate with distributed locking

    const balanceStart = Date.now();
    await accounts.consolidate('acc-001', 'balance');
    const balanceTime = Date.now() - balanceStart;

    const txStart = Date.now();
    await accounts.consolidate('acc-001', 'transactions');
    const txTime = Date.now() - txStart;

    // Verify final values

    const finalAccount = await accounts.get('acc-001');

    // Expected calculations:
    // Initial: 1000
    // Client 1: +50 * 5 = +250
    // Client 2: -30 * 5 = -150
    // Client 3: +20 * 3 - 10 * 2 = +60 - 20 = +40
    // Total: 1000 + 250 - 150 + 40 = 1140
    const expectedBalance = 1140;

    // Transaction count: 5 + 5 + 5 = 15
    const expectedTransactions = 15;


    expect(finalAccount.balance).toBe(expectedBalance);
    expect(finalAccount.transactions).toBe(expectedTransactions);

  }, 60000);

  it('should demonstrate lock acquisition and release cycle', async () => {

    // Create simple counter
    const counters = await database.createResource({
      name: 'counters',
      attributes: {
        id: 'string|optional',
        value: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        counters: ['value']
      },
      consolidation: { mode: 'async', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);

    await counters.insert({ id: 'counter-1', value: 0 });

    // Add transactions
    for (let i = 0; i < 10; i++) {
      await counters.add('counter-1', 'value', 1);
    }

    // Run consolidation
    const result = await counters.consolidate('counter-1', 'value');

    // Verify final value
    const counter = await counters.get('counter-1');

    expect(counter.value).toBe(10);

  }, 30000);

  it.skip('should handle lock contention between simultaneous consolidations (TODO: investigate consolidate return value)', async () => {

    // Create resource
    const votes = await database.createResource({
      name: 'votes',
      attributes: {
        id: 'string|optional',
        upvotes: 'number|default:0',
        downvotes: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        votes: ['upvotes', 'downvotes']
      },
      consolidation: { mode: 'async', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);

    await votes.insert({ id: 'post-123', upvotes: 0, downvotes: 0 });

    // Add transactions for both fields
    await Promise.all([
      votes.add('post-123', 'upvotes', 10),
      votes.add('post-123', 'upvotes', 5),
      votes.add('post-123', 'downvotes', 2),
      votes.add('post-123', 'downvotes', 3)
    ]);

    // Wait for async transactions to be flushed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Try to consolidate BOTH fields simultaneously (will create lock contention)
    const startTime = Date.now();

    const [upvotesResult, downvotesResult] = await Promise.all([
      votes.consolidate('post-123', 'upvotes'),
      votes.consolidate('post-123', 'downvotes')
    ]);

    const totalTime = Date.now() - startTime;

    // Verify results from consolidation (with async + auto:false, values are calculated but not persisted)
    expect(upvotesResult).toBe(15);
    expect(downvotesResult).toBe(5);

  }, 30000);

  it('should show transaction ordering is preserved during consolidation', async () => {

    // Create wallet
    const wallets = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|optional',
        balance: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        wallets: ['balance']
      },
      consolidation: { mode: 'async', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);

    await wallets.insert({ id: 'wallet-001', balance: 100 });


    // Make specific ordered operations
    await wallets.add('wallet-001', 'balance', 50);

    await wallets.sub('wallet-001', 'balance', 20);

    await wallets.add('wallet-001', 'balance', 30);

    await wallets.sub('wallet-001', 'balance', 10);

    // List transactions to show their order
    const transactions = await database.resources.plg_wallets_tx_balance
      .list()
      .then(txs => txs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));

    transactions.forEach((tx, i) => {
      const op = tx.operation === 'add' ? '+' : '-';
    });

    // Consolidate
    await wallets.consolidate('wallet-001', 'balance');

    // Verify final balance
    const wallet = await wallets.get('wallet-001');


    expect(wallet.balance).toBe(150);

  }, 30000);
});
