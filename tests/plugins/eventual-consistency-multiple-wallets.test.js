import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventualConsistencyPlugin - Multiple Wallets Independence", () => {
  let database;
  let walletsResource;
  let transactionsResource;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/ec-multiple-wallets');
    await database.connect();

    // Plugin configuration for wallets
    plugin = new EventualConsistencyPlugin({
      resources: {
        wallets: ['balance']
      },
      consolidation: { mode: 'sync' },
      verbose: false
    });

    await database.usePlugin(plugin);

    // Create Wallets resource
    walletsResource = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|optional',
        userId: 'string|required',
        balance: 'number|default:0'
      }
    });

    // Create Transactions resource
    transactionsResource = await database.createResource({
      name: 'transactions',
      attributes: {
        id: 'string|optional',
        walletId: 'string|required',
        amount: 'number|required',
        type: 'string|required', // 'credit' or 'debit'
        timestamp: 'string|required'
      }
    });

    // Hook: when transaction is created, update wallet balance
    transactionsResource.addHook('afterInsert', async (record) => {
      const amount = record.type === 'credit' ? record.amount : -record.amount;
      await walletsResource.add(record.walletId, 'balance', amount);
    });

    await plugin.start();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  test("should maintain independent balances for different wallets", async () => {
    // Create two wallets
    await walletsResource.insert({
      id: 'wallet-alice',
      userId: 'alice',
      balance: 0
    });

    await walletsResource.insert({
      id: 'wallet-bob',
      userId: 'bob',
      balance: 0
    });

    // Verify initial state
    let aliceWallet = await walletsResource.get('wallet-alice');
    let bobWallet = await walletsResource.get('wallet-bob');
    expect(aliceWallet.balance).toBe(0);
    expect(bobWallet.balance).toBe(0);

    // Add transactions for Alice
    await transactionsResource.insert({
      id: 'txn-alice-1',
      walletId: 'wallet-alice',
      amount: 100,
      type: 'credit',
      timestamp: new Date().toISOString()
    });

    await transactionsResource.insert({
      id: 'txn-alice-2',
      walletId: 'wallet-alice',
      amount: 50,
      type: 'credit',
      timestamp: new Date().toISOString()
    });

    await transactionsResource.insert({
      id: 'txn-alice-3',
      walletId: 'wallet-alice',
      amount: 30,
      type: 'debit',
      timestamp: new Date().toISOString()
    });

    // Add transactions for Bob
    await transactionsResource.insert({
      id: 'txn-bob-1',
      walletId: 'wallet-bob',
      amount: 200,
      type: 'credit',
      timestamp: new Date().toISOString()
    });

    await transactionsResource.insert({
      id: 'txn-bob-2',
      walletId: 'wallet-bob',
      amount: 75,
      type: 'debit',
      timestamp: new Date().toISOString()
    });

    // Verify balances are independent
    aliceWallet = await walletsResource.get('wallet-alice');
    bobWallet = await walletsResource.get('wallet-bob');

    expect(aliceWallet.balance).toBe(120); // 100 + 50 - 30
    expect(bobWallet.balance).toBe(125);   // 200 - 75

    // Verify Bob's balance is not affected by Alice's transactions
    expect(bobWallet.balance).not.toBe(aliceWallet.balance);
  });

  test("should handle direct add operations on multiple wallets", async () => {
    // Create two wallets
    await walletsResource.insert({
      id: 'wallet-charlie',
      userId: 'charlie',
      balance: 0
    });

    await walletsResource.insert({
      id: 'wallet-diana',
      userId: 'diana',
      balance: 0
    });

    // Direct add operations
    await walletsResource.add('wallet-charlie', 'balance', 50);
    await walletsResource.add('wallet-charlie', 'balance', 25);
    await walletsResource.add('wallet-charlie', 'balance', 15);

    await walletsResource.add('wallet-diana', 'balance', 100);
    await walletsResource.add('wallet-diana', 'balance', -40);
    await walletsResource.add('wallet-diana', 'balance', 10);

    // Verify independent balances
    const charlieWallet = await walletsResource.get('wallet-charlie');
    const dianaWallet = await walletsResource.get('wallet-diana');

    expect(charlieWallet.balance).toBe(90);  // 50 + 25 + 15
    expect(dianaWallet.balance).toBe(70);    // 100 - 40 + 10
  });

  test("should recalculate correct balances for multiple wallets", async () => {
    // Create two wallets
    await walletsResource.insert({
      id: 'wallet-eve',
      userId: 'eve',
      balance: 0
    });

    await walletsResource.insert({
      id: 'wallet-frank',
      userId: 'frank',
      balance: 0
    });

    // Add transactions for Eve
    await walletsResource.add('wallet-eve', 'balance', 100);
    await walletsResource.add('wallet-eve', 'balance', 50);
    await walletsResource.add('wallet-eve', 'balance', -20);

    // Add transactions for Frank
    await walletsResource.add('wallet-frank', 'balance', 300);
    await walletsResource.add('wallet-frank', 'balance', -100);

    // Verify initial balances
    let eveWallet = await walletsResource.get('wallet-eve');
    let frankWallet = await walletsResource.get('wallet-frank');
    expect(eveWallet.balance).toBe(130);
    expect(frankWallet.balance).toBe(200);

    // Recalculate Eve's balance
    await walletsResource.recalculate('wallet-eve', 'balance');

    // Verify Eve's balance is still correct
    eveWallet = await walletsResource.get('wallet-eve');
    expect(eveWallet.balance).toBe(130);

    // Recalculate Frank's balance
    await walletsResource.recalculate('wallet-frank', 'balance');

    // Verify Frank's balance is still correct
    frankWallet = await walletsResource.get('wallet-frank');
    expect(frankWallet.balance).toBe(200);

    // Verify balances remain independent
    expect(eveWallet.balance).not.toBe(frankWallet.balance);
  });

  test("should consolidate correct balances for multiple wallets", async () => {
    // Create two wallets
    await walletsResource.insert({
      id: 'wallet-grace',
      userId: 'grace',
      balance: 0
    });

    await walletsResource.insert({
      id: 'wallet-henry',
      userId: 'henry',
      balance: 0
    });

    // Add transactions for Grace
    await walletsResource.add('wallet-grace', 'balance', 50);
    await walletsResource.add('wallet-grace', 'balance', 30);
    await walletsResource.add('wallet-grace', 'balance', 20);

    // Add transactions for Henry
    await walletsResource.add('wallet-henry', 'balance', 40);
    await walletsResource.add('wallet-henry', 'balance', 25);
    await walletsResource.add('wallet-henry', 'balance', 10);

    // Verify balances before consolidation
    let graceWallet = await walletsResource.get('wallet-grace');
    let henryWallet = await walletsResource.get('wallet-henry');
    expect(graceWallet.balance).toBe(100);  // 50 + 30 + 20
    expect(henryWallet.balance).toBe(75);   // 40 + 25 + 10

    // Consolidate Grace's balance
    await walletsResource.consolidate('wallet-grace', 'balance');

    // Verify Grace's balance is still correct after consolidation
    graceWallet = await walletsResource.get('wallet-grace');
    expect(graceWallet.balance).toBe(100);

    // Consolidate Henry's balance
    await walletsResource.consolidate('wallet-henry', 'balance');

    // Verify Henry's balance is still correct after consolidation
    henryWallet = await walletsResource.get('wallet-henry');
    expect(henryWallet.balance).toBe(75);

    // Verify balances remain independent after consolidation
    expect(graceWallet.balance).not.toBe(henryWallet.balance);
  }, 60000);

  test("should handle mixed operations on multiple wallets", async () => {
    // Create three wallets
    await walletsResource.insert({
      id: 'wallet-ivan',
      userId: 'ivan',
      balance: 0
    });

    await walletsResource.insert({
      id: 'wallet-judy',
      userId: 'judy',
      balance: 0
    });

    await walletsResource.insert({
      id: 'wallet-karl',
      userId: 'karl',
      balance: 0
    });

    // Mixed operations
    await walletsResource.add('wallet-ivan', 'balance', 100);
    await walletsResource.add('wallet-judy', 'balance', 200);
    await walletsResource.add('wallet-karl', 'balance', 300);

    await walletsResource.add('wallet-ivan', 'balance', -25);
    await walletsResource.add('wallet-judy', 'balance', 50);
    await walletsResource.add('wallet-karl', 'balance', -100);

    // Recalculate one wallet
    await walletsResource.recalculate('wallet-ivan', 'balance');

    // Consolidate another wallet
    await walletsResource.consolidate('wallet-judy', 'balance');

    // Verify all balances are correct and independent
    const ivanWallet = await walletsResource.get('wallet-ivan');
    const judyWallet = await walletsResource.get('wallet-judy');
    const karlWallet = await walletsResource.get('wallet-karl');

    expect(ivanWallet.balance).toBe(75);   // 100 - 25
    expect(judyWallet.balance).toBe(250);  // 200 + 50
    expect(karlWallet.balance).toBe(200);  // 300 - 100

    // Verify all balances are different
    expect(ivanWallet.balance).not.toBe(judyWallet.balance);
    expect(judyWallet.balance).not.toBe(karlWallet.balance);
    expect(karlWallet.balance).not.toBe(ivanWallet.balance);
  }, 30000);
});
