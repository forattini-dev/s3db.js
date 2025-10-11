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

  it.skip('should handle multiple concurrent clients with distributed locking (SKIP: locks use PluginStorage now)', async () => {
    console.log('\n🧪 Testing Multi-Client Concurrency with Distributed Locking...\n');
    console.log('=' .repeat(70));

    // Create accounts resource
    accounts = await database.createResource({
      name: 'accounts',
      attributes: {
        id: 'string|required',
        email: 'string|required',
        balance: 'number|default:0',
        transactions: 'number|default:0'
      }
    });

    console.log('\n1️⃣  Setting up EventualConsistencyPlugin in async mode...\n');

    const plugin = new EventualConsistencyPlugin({
      resources: {
        accounts: ['balance', 'transactions']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: false // 30 seconds for lock
    });
    await database.usePlugin(plugin);

    console.log('   ✅ Plugin configured with distributed locking enabled\n');

    // Create account
    console.log('2️⃣  Creating account with initial balance...\n');
    await accounts.insert({
      id: 'acc-001',
      email: 'user@example.com',
      balance: 1000,
      transactions: 0
    });

    console.log('   Initial state:');
    console.log('   - balance: 1000');
    console.log('   - transactions: 0\n');

    // Simulate 3 concurrent clients (different servers/containers)
    console.log('3️⃣  Simulating 3 concurrent clients making operations...\n');
    console.log('=' .repeat(70));

    const startTime = Date.now();

    // Client 1: 5 deposits
    console.log('\n   💰 Client 1: Making 5 deposits of $50 each...');
    const client1Operations = [];
    for (let i = 0; i < 5; i++) {
      client1Operations.push(
        accounts.add('acc-001', 'balance', 50).then(() => {
          console.log(`      ✅ Client 1: Deposit #${i + 1} (+$50)`);
        })
      );
      client1Operations.push(
        accounts.add('acc-001', 'transactions', 1)
      );
    }

    // Client 2: 5 withdrawals
    console.log('   💸 Client 2: Making 5 withdrawals of $30 each...');
    const client2Operations = [];
    for (let i = 0; i < 5; i++) {
      client2Operations.push(
        accounts.sub('acc-001', 'balance', 30).then(() => {
          console.log(`      ✅ Client 2: Withdrawal #${i + 1} (-$30)`);
        })
      );
      client2Operations.push(
        accounts.add('acc-001', 'transactions', 1)
      );
    }

    // Client 3: 3 deposits + 2 withdrawals
    console.log('   🔄 Client 3: Making mixed operations...');
    const client3Operations = [];
    for (let i = 0; i < 3; i++) {
      client3Operations.push(
        accounts.add('acc-001', 'balance', 20).then(() => {
          console.log(`      ✅ Client 3: Deposit #${i + 1} (+$20)`);
        })
      );
      client3Operations.push(
        accounts.add('acc-001', 'transactions', 1)
      );
    }
    for (let i = 0; i < 2; i++) {
      client3Operations.push(
        accounts.sub('acc-001', 'balance', 10).then(() => {
          console.log(`      ✅ Client 3: Withdrawal #${i + 1} (-$10)`);
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
    console.log(`\n   ⏱️  All operations completed in ${operationsTime}ms\n`);

    // Check pending transactions
    console.log('4️⃣  Checking transaction logs before consolidation...\n');

    const balanceTransactions = await database.resources.plg_accounts_tx_balance.list();
    const txCountTransactions = await database.resources.plg_accounts_tx_transactions.list();

    console.log(`   💰 balance: ${balanceTransactions.length} pending transactions`);
    console.log(`   📊 transactions: ${txCountTransactions.length} pending operations\n`);

    expect(balanceTransactions.length).toBeGreaterThan(0);
    expect(txCountTransactions.length).toBeGreaterThan(0);

    // Consolidate with distributed locking
    console.log('5️⃣  Consolidating with distributed locking...\n');
    console.log('=' .repeat(70));

    console.log('\n   🔒 Acquiring lock for balance field...');
    const balanceStart = Date.now();
    await accounts.consolidate('acc-001', 'balance');
    const balanceTime = Date.now() - balanceStart;
    console.log(`   ✅ Balance consolidated in ${balanceTime}ms`);

    console.log('\n   🔒 Acquiring lock for transactions field...');
    const txStart = Date.now();
    await accounts.consolidate('acc-001', 'transactions');
    const txTime = Date.now() - txStart;
    console.log(`   ✅ Transactions consolidated in ${txTime}ms`);

    // Verify locks were released
    console.log('\n6️⃣  Verifying locks were released...\n');
    const balanceLocks = await database.resources.accounts_consolidation_locks_balance.list();
    const txLocks = await database.resources.accounts_consolidation_locks_transactions.list();

    console.log(`   🔓 Balance locks remaining: ${balanceLocks.length}`);
    console.log(`   🔓 Transactions locks remaining: ${txLocks.length}`);

    expect(balanceLocks.length).toBe(0);
    expect(txLocks.length).toBe(0);

    // Verify final values
    console.log('\n7️⃣  Verifying final consolidated values...\n');
    console.log('=' .repeat(70));

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

    console.log('\n   📋 RESULTS:\n');
    console.log('   Field          | Expected | Actual | Status');
    console.log('   ' + '-'.repeat(50));
    console.log(`   💰 balance     | ${String(expectedBalance).padStart(8)} | ${String(finalAccount.balance).padStart(6)} | ${finalAccount.balance === expectedBalance ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   📊 transactions| ${String(expectedTransactions).padStart(8)} | ${String(finalAccount.transactions).padStart(6)} | ${finalAccount.transactions === expectedTransactions ? '✅ PASS' : '❌ FAIL'}`);

    expect(finalAccount.balance).toBe(expectedBalance);
    expect(finalAccount.transactions).toBe(expectedTransactions);

    console.log('\n' + '=' .repeat(70));
    console.log('\n✅ MULTI-CLIENT CONCURRENCY TEST PASSED!\n');
    console.log('   Summary:');
    console.log('   - 3 concurrent clients made 30 operations');
    console.log('   - Distributed locks prevented race conditions');
    console.log('   - All transactions applied correctly');
    console.log('   - Final values are mathematically correct\n');
  }, 60000);

  it.skip('should demonstrate lock acquisition and release cycle (SKIP: locks use PluginStorage now)', async () => {
    console.log('\n🧪 Testing Lock Lifecycle...\n');
    console.log('=' .repeat(70));

    // Create simple counter
    const counters = await database.createResource({
      name: 'counters',
      attributes: {
        id: 'string|required',
        value: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      resources: {
        counters: ['value']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Creating counter...\n');
    await counters.insert({ id: 'counter-1', value: 0 });

    // Add transactions
    console.log('2️⃣  Adding 10 transactions...\n');
    for (let i = 0; i < 10; i++) {
      await counters.add('counter-1', 'value', 1);
      console.log(`   ✅ Transaction ${i + 1} recorded`);
    }

    // Check locks before consolidation
    console.log('\n3️⃣  Checking locks before consolidation...\n');
    let locks = await database.resources.counters_consolidation_locks_value.list();
    console.log(`   🔒 Active locks: ${locks.length}`);
    expect(locks.length).toBe(0);

    // Start consolidation (this will acquire lock)
    console.log('\n4️⃣  Starting consolidation (will acquire lock)...\n');
    const consolidateStart = Date.now();

    // Run consolidation
    const result = await counters.consolidate('counter-1', 'value');

    const consolidateTime = Date.now() - consolidateStart;
    console.log(`   ✅ Consolidation completed in ${consolidateTime}ms`);
    console.log(`   📊 Final value: ${result}`);

    // Check locks after consolidation
    console.log('\n5️⃣  Checking locks after consolidation...\n');
    locks = await database.resources.counters_consolidation_locks_value.list();
    console.log(`   🔓 Active locks: ${locks.length} (should be 0)`);
    expect(locks.length).toBe(0);

    // Verify final value
    const counter = await counters.get('counter-1');
    console.log('\n6️⃣  Final verification...\n');
    console.log(`   Expected: 10`);
    console.log(`   Actual: ${counter.value}`);
    console.log(`   Status: ${counter.value === 10 ? '✅ PASS' : '❌ FAIL'}`);

    expect(counter.value).toBe(10);

    console.log('\n✅ Lock lifecycle working correctly!\n');
  }, 30000);

  it.skip('should handle lock contention between simultaneous consolidations', async () => {
    console.log('\n🧪 Testing Lock Contention...\n');
    console.log('=' .repeat(70));

    // Create resource
    const votes = await database.createResource({
      name: 'votes',
      attributes: {
        id: 'string|required',
        upvotes: 'number|default:0',
        downvotes: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      resources: {
        votes: ['upvotes', 'downvotes']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Creating post with votes...\n');
    await votes.insert({ id: 'post-123', upvotes: 0, downvotes: 0 });

    // Add transactions for both fields
    console.log('2️⃣  Adding transactions to both fields...\n');
    await Promise.all([
      votes.add('post-123', 'upvotes', 10),
      votes.add('post-123', 'upvotes', 5),
      votes.add('post-123', 'downvotes', 2),
      votes.add('post-123', 'downvotes', 3)
    ]);

    console.log('   ✅ Transactions added:\n');
    console.log('      - upvotes: +10, +5');
    console.log('      - downvotes: +2, +3\n');

    // Try to consolidate BOTH fields simultaneously (will create lock contention)
    console.log('3️⃣  Consolidating both fields in parallel...\n');
    console.log('   ⚠️  This creates lock contention (same resource, different fields)\n');

    const startTime = Date.now();

    const [upvotesResult, downvotesResult] = await Promise.all([
      votes.consolidate('post-123', 'upvotes').then(result => {
        console.log(`   ✅ upvotes consolidated: ${result}`);
        return result;
      }),
      votes.consolidate('post-123', 'downvotes').then(result => {
        console.log(`   ✅ downvotes consolidated: ${result}`);
        return result;
      })
    ]);

    const totalTime = Date.now() - startTime;
    console.log(`\n   ⏱️  Both consolidations completed in ${totalTime}ms`);

    // Verify results
    console.log('\n4️⃣  Verifying final values...\n');

    const post = await votes.get('post-123');

    console.log('   Expected:');
    console.log('   - upvotes: 15 (0 + 10 + 5)');
    console.log('   - downvotes: 5 (0 + 2 + 3)\n');

    console.log('   Actual:');
    console.log(`   - upvotes: ${post.upvotes}`);
    console.log(`   - downvotes: ${post.downvotes}\n`);

    expect(post.upvotes).toBe(15);
    expect(post.downvotes).toBe(5);

    // Check locks are released
    const upvotesLocks = await database.resources.votes_consolidation_locks_upvotes.list();
    const downvotesLocks = await database.resources.votes_consolidation_locks_downvotes.list();

    console.log('5️⃣  Verifying locks released...\n');
    console.log(`   🔓 upvotes locks: ${upvotesLocks.length}`);
    console.log(`   🔓 downvotes locks: ${downvotesLocks.length}`);

    expect(upvotesLocks.length).toBe(0);
    expect(downvotesLocks.length).toBe(0);

    console.log('\n✅ Lock contention handled correctly!\n');
  }, 30000);

  it('should show transaction ordering is preserved during consolidation', async () => {
    console.log('\n🧪 Testing Transaction Ordering...\n');
    console.log('=' .repeat(70));

    // Create wallet
    const wallets = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|required',
        balance: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      resources: {
        wallets: ['balance']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Creating wallet...\n');
    await wallets.insert({ id: 'wallet-001', balance: 100 });

    console.log('2️⃣  Making ordered transactions...\n');

    // Make specific ordered operations
    await wallets.add('wallet-001', 'balance', 50);
    console.log('   T1: +50  (balance should be 150)');

    await wallets.sub('wallet-001', 'balance', 20);
    console.log('   T2: -20  (balance should be 130)');

    await wallets.add('wallet-001', 'balance', 30);
    console.log('   T3: +30  (balance should be 160)');

    await wallets.sub('wallet-001', 'balance', 10);
    console.log('   T4: -10  (balance should be 150)');

    // List transactions to show their order
    console.log('\n3️⃣  Listing transactions in order...\n');
    const transactions = await database.resources.plg_wallets_tx_balance
      .list()
      .then(txs => txs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));

    transactions.forEach((tx, i) => {
      const op = tx.operation === 'add' ? '+' : '-';
      console.log(`   Transaction ${i + 1}: ${op}${tx.value} at ${tx.createdAt}`);
    });

    // Consolidate
    console.log('\n4️⃣  Consolidating (will apply in order)...\n');
    await wallets.consolidate('wallet-001', 'balance');

    // Verify final balance
    const wallet = await wallets.get('wallet-001');

    console.log('5️⃣  Final verification...\n');
    console.log('   Calculation: 100 + 50 - 20 + 30 - 10 = 150\n');
    console.log(`   Expected: 150`);
    console.log(`   Actual: ${wallet.balance}`);
    console.log(`   Status: ${wallet.balance === 150 ? '✅ PASS' : '❌ FAIL'}`);

    expect(wallet.balance).toBe(150);

    console.log('\n✅ Transaction ordering preserved correctly!\n');
  }, 30000);
});
