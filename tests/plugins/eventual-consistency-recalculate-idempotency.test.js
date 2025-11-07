import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistency - Recalculate Idempotency', () => {
  let database;
  let users;

  beforeAll(async () => {
    database = await createDatabaseForTest('recalculate-idempotency');

    // Create resource with eventual consistency
    users = await database.createResource({
      name: 'users_recalc_idempotent',
      attributes: {
        name: 'string|required',
        balance: 'number|default:0'
      }
    });

    // Install eventual consistency plugin
    const plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: {
        users_recalc_idempotent: ['balance']
      },
      consolidation: {
        mode: 'sync',
        auto: false  // Disable auto consolidation for this test
      },
      verbose: false
    });
    await database.usePlugin(plugin);
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('recalculate + recalculate + recalculate should be idempotent', async () => {
    // Create a user
    const user = await users.insert({ name: 'Alice', balance: 100 });

    // Apply several transactions
    await users.add(user.id, 'balance', 50);
    await users.add(user.id, 'balance', 30);
    await users.add(user.id, 'balance', -20);
    await users.add(user.id, 'balance', 10);

    // Wait for consolidation
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get current state
    const userBefore = await users.get(user.id);

    // First recalculate
    await users.recalculate(user.id, 'balance');
    const userAfterFirst = await users.get(user.id);

    // Second recalculate (should produce same result)
    await users.recalculate(user.id, 'balance');
    const userAfterSecond = await users.get(user.id);

    // Third recalculate (just to be sure)
    await users.recalculate(user.id, 'balance');
    const userAfterThird = await users.get(user.id);

    // All recalculates should produce the same result
    expect(userAfterFirst.balance).toBe(userAfterSecond.balance);
    expect(userAfterSecond.balance).toBe(userAfterThird.balance);

    // Expected: 100 (initial) + 50 + 30 - 20 + 10 = 170
    expect(userAfterFirst.balance).toBe(170);
  }, 30000);

  test('consolidate + consolidate + consolidate should be idempotent', async () => {
    // Create a user
    const user = await users.insert({ name: 'Bob', balance: 200 });

    // Apply several transactions
    await users.add(user.id, 'balance', 25);
    await users.add(user.id, 'balance', 75);
    await users.add(user.id, 'balance', -50);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Get current state
    const userBefore = await users.get(user.id);

    // First consolidate
    await users.consolidate(user.id, 'balance');
    const userAfterFirst = await users.get(user.id);

    // Second consolidate (should produce same result)
    await users.consolidate(user.id, 'balance');
    const userAfterSecond = await users.get(user.id);

    // Third consolidate (just to be sure)
    await users.consolidate(user.id, 'balance');
    const userAfterThird = await users.get(user.id);

    // All consolidates should produce the same result
    expect(userAfterFirst.balance).toBe(userAfterSecond.balance);
    expect(userAfterSecond.balance).toBe(userAfterThird.balance);

    // Expected: 200 (initial) + 25 + 75 - 50 = 250
    expect(userAfterFirst.balance).toBe(250);
  });

  test.skip('recalculate + consolidate should be idempotent (TODO: fix lock issue)', async () => {
    // Create a user
    const user = await users.insert({ name: 'Charlie', balance: 500 });

    // Apply several transactions
    await users.add(user.id, 'balance', 100);
    await users.add(user.id, 'balance', -25);
    await users.add(user.id, 'balance', 50);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Get current state
    const userBefore = await users.get(user.id);

    // Recalculate
    await users.recalculate(user.id, 'balance');
    const userAfterRecalc = await users.get(user.id);

    // Wait a bit to ensure lock is released
    await new Promise(resolve => setTimeout(resolve, 200));

    // Consolidate (should not change anything since recalculate already consolidated)
    await users.consolidate(user.id, 'balance');
    const userAfterConsolidate = await users.get(user.id);

    // Should be the same
    expect(userAfterRecalc.balance).toBe(userAfterConsolidate.balance);

    // Expected: 500 (initial) + 100 - 25 + 50 = 625
    expect(userAfterConsolidate.balance).toBe(625);
  });

  test.skip('consolidate + recalculate should be idempotent (TODO: fix lock issue)', async () => {
    // Create a user
    const user = await users.insert({ name: 'Diana', balance: 1000 });

    // Apply several transactions
    await users.add(user.id, 'balance', 200);
    await users.add(user.id, 'balance', -100);
    await users.add(user.id, 'balance', 300);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Get current state
    const userBefore = await users.get(user.id);

    // Consolidate first
    await users.consolidate(user.id, 'balance');
    const userAfterConsolidate = await users.get(user.id);

    // Wait a bit to ensure lock is released
    await new Promise(resolve => setTimeout(resolve, 200));

    // Then recalculate (should produce same result)
    await users.recalculate(user.id, 'balance');
    const userAfterRecalc = await users.get(user.id);

    // Should be the same
    expect(userAfterConsolidate.balance).toBe(userAfterRecalc.balance);

    // Expected: 1000 (initial) + 200 - 100 + 300 = 1400
    expect(userAfterRecalc.balance).toBe(1400);
  });

  test.skip('recalculate should reset to initial value and reapply transactions', async () => {
    // Create a user with initial balance
    const user = await users.insert({ name: 'Bob', balance: 1000 });

    // Apply transactions
    await users.add(user.id, 'balance', 200);
    await users.add(user.id, 'balance', -50);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Manually corrupt the balance
    await users.update(user.id, { balance: 9999 });

    const corruptedUser = await users.get(user.id);
    expect(corruptedUser.balance).toBe(9999);

    // Recalculate should fix it
    await users.recalculate(user.id, 'balance');
    const fixedUser = await users.get(user.id);

    // Should be: 0 (initial from eventualConsistency config) + 200 - 50 = 150
    // NOT 1000 + 200 - 50 = 1150 (would use insert balance as initial)
    expect(fixedUser.balance).toBe(150);

    // Second recalculate should produce same result
    await users.recalculate(user.id, 'balance');
    const fixedUserSecond = await users.get(user.id);
    expect(fixedUserSecond.balance).toBe(150);
  });

  test.skip('recalculate with multiple fields should be idempotent', async () => {
    // Create resource with multiple eventual consistency fields
    const accounts = await database.createResource({
      name: 'accounts_recalc_multi',
      attributes: {
        name: 'string|required',
        credits: 'number|default:0',
        debits: 'number|default:0'
      }
    });

    // Setup plugin for this resource
    const accountsPlugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: {
        accounts_recalc_multi: ['credits', 'debits']
      },
      consolidation: {
        mode: 'sync',
        auto: false
      },
      verbose: false
    });
    await database.usePlugin(accountsPlugin);

    try {
      const account = await accounts.insert({ name: 'Test Account', credits: 500, debits: 100 });

      // Apply transactions to both fields
      await accounts.add(account.id, 'credits', 100);
      await accounts.add(account.id, 'debits', 50);
      await accounts.add(account.id, 'credits', -30);
      await accounts.add(account.id, 'debits', 25);

      await new Promise(resolve => setTimeout(resolve, 100));

      // First recalculate for both fields
      await accounts.recalculate(account.id, 'credits');
      await accounts.recalculate(account.id, 'debits');
      const first = await accounts.get(account.id);

      // Second recalculate for both fields
      await accounts.recalculate(account.id, 'credits');
      await accounts.recalculate(account.id, 'debits');
      const second = await accounts.get(account.id);

      // Third recalculate for both fields
      await accounts.recalculate(account.id, 'credits');
      await accounts.recalculate(account.id, 'debits');
      const third = await accounts.get(account.id);

      // Should all be the same
      expect(first.credits).toBe(second.credits);
      expect(second.credits).toBe(third.credits);
      expect(first.debits).toBe(second.debits);
      expect(second.debits).toBe(third.debits);

      // Expected values: credits = 0 + 100 - 30 = 70, debits = 0 + 50 + 25 = 75
      expect(first.credits).toBe(70);
      expect(first.debits).toBe(75);
    } finally {
      // No cleanup needed - test database will be cleaned up
    }
  });
});
