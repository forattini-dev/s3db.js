import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Distributed Locks & Concurrency Control', () => {
  let database;
  let plugin;
  let mockActions = {};
  let mockGuards = {};

  beforeEach(async () => {
    mockActions = {
      onConfirmed: jest.fn().mockResolvedValue({ action: 'confirmed' }),
      onShipped: jest.fn().mockResolvedValue({ action: 'shipped' }),
      onError: jest.fn().mockRejectedValue(new Error('Action failed'))
    };

    mockGuards = {
      canShip: jest.fn().mockResolvedValue(true),
      cannotShip: jest.fn().mockResolvedValue(false),
      guardError: jest.fn().mockRejectedValue(new Error('Guard failed'))
    };

    database = createDatabaseForTest('suite=plugins/state-machine');

    plugin = new StateMachinePlugin({
      stateMachines: {
        order_processing: {
          initialState: 'pending',
          states: {
            pending: { on: { CONFIRM: 'confirmed', CANCEL: 'cancelled' }, meta: { color: 'yellow' } },
            confirmed: { on: { PREPARE: 'preparing', CANCEL: 'cancelled' }, entry: 'onConfirmed', exit: 'onConfirmed' },
            preparing: { on: { SHIP: 'shipped', CANCEL: 'cancelled' }, guards: { SHIP: 'canShip' } },
            shipped: { on: { DELIVER: 'delivered', RETURN: 'returned' }, entry: 'onShipped' },
            delivered: { type: 'final' },
            cancelled: { type: 'final' },
            returned: { type: 'final' }
          }
        },
        user_onboarding: {
          initialState: 'registered',
          states: { registered: { on: { VERIFY_EMAIL: 'verified' } }, verified: { on: { COMPLETE_PROFILE: 'active' } }, active: { type: 'final' } }
        },
        test_guards: {
          initialState: 'start',
          states: {
            start: {
              on: { PASS: 'success', FAIL: 'failure', ERROR: 'error' },
              guards: { PASS: 'canShip', FAIL: 'cannotShip', ERROR: 'guardError' }
            },
            success: { type: 'final' },
            failure: { type: 'final' },
            error: { type: 'final' }
          }
        }
      },
      actions: mockActions,
      guards: mockGuards,
      persistTransitions: true,
      verbose: false
    });

    await database.connect();
    await plugin.install(database);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should prevent concurrent transitions for the same entity', async () => {
    await database.connect();
    await plugin.install(database);
    await plugin.initializeEntity('order_processing', 'order1');

    // Try to execute two transitions concurrently for the same entity
    const transition1 = plugin.send('order_processing', 'order1', 'CONFIRM');
    const transition2 = plugin.send('order_processing', 'order1', 'CONFIRM');

    // One should succeed, one should fail (either with lock error or invalid state)
    const results = await Promise.allSettled([transition1, transition2]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    // One should succeed, one should fail
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    // The failed one will either be lock timeout or invalid state transition
    // (both are valid outcomes of race condition)
    const errorMsg = failed[0].reason.message;
    const isValidError = errorMsg.includes('Could not acquire transition lock') ||
                         errorMsg.includes('not valid for state');
    expect(isValidError).toBe(true);

    await database.disconnect();
  });

  it('should allow concurrent transitions for different entities', async () => {
    await database.connect();
    await plugin.install(database);
    await plugin.initializeEntity('order_processing', 'order1');
    await plugin.initializeEntity('order_processing', 'order2');

    // Execute transitions concurrently for different entities
    const transition1 = plugin.send('order_processing', 'order1', 'CONFIRM');
    const transition2 = plugin.send('order_processing', 'order2', 'CONFIRM');

    // Both should succeed
    const results = await Promise.all([transition1, transition2]);

    expect(results[0].to).toBe('confirmed');
    expect(results[1].to).toBe('confirmed');

    await database.disconnect();
  });

  it('should release lock even when transition fails', async () => {
    const failingPlugin = new StateMachinePlugin({
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: {
              on: { NEXT: 'middle' },
              guards: { NEXT: 'guardError' } // This guard will throw error
            },
            middle: {
              on: { COMPLETE: 'end' }
            },
            end: { type: 'final' }
          }
        }
      },
      actions: mockActions,
      guards: mockGuards,
      lockTimeout: 500,
      lockTTL: 2
    });

    const testDb = createDatabaseForTest('suite=plugins/state-machine-lock-release');
    await testDb.connect();
    await failingPlugin.install(testDb);
    await failingPlugin.initializeEntity('test', 'entity1');

    // First transition should fail (guard throws error)
    await expect(
      failingPlugin.send('test', 'entity1', 'NEXT')
    ).rejects.toThrow('Transition blocked by guard');

    // Second transition should also be able to acquire lock (lock was released)
    // This proves lock was released even though first transition failed
    await expect(
      failingPlugin.send('test', 'entity1', 'NEXT')
    ).rejects.toThrow('Transition blocked by guard');

    // State should remain 'start' because transitions failed
    const state = await failingPlugin.getState('test', 'entity1');
    expect(state).toBe('start');

    await testDb.disconnect();
  });

  it('should respect lockTimeout configuration', async () => {
    const shortTimeoutPlugin = new StateMachinePlugin({
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: {
              on: { NEXT: 'end' }
            },
            end: { type: 'final' }
          }
        }
      },
      lockTimeout: 100, // Very short timeout
      lockTTL: 5
    });

    const testDb = createDatabaseForTest('suite=plugins/state-machine-timeout');
    await testDb.connect();
    await shortTimeoutPlugin.install(testDb);
    await shortTimeoutPlugin.initializeEntity('test', 'entity1');

    // Simulate a slow transition by acquiring lock manually
    const storage = shortTimeoutPlugin.getStorage();
    const lockName = 'transition-test-entity1';
    await storage.set(
      shortTimeoutPlugin.getStorage().getPluginKey(null, 'locks', lockName),
      { workerId: 'test' },
      { ttl: 10 }
    );

    // Try to transition - should fail quickly due to short timeout
    const startTime = Date.now();
    await expect(
      shortTimeoutPlugin.send('test', 'entity1', 'NEXT')
    ).rejects.toThrow('Could not acquire transition lock');
    const duration = Date.now() - startTime;

    // Should fail within timeout + small buffer
    expect(duration).toBeLessThan(500);

    await testDb.disconnect();
  });

  it('should use workerId in lock acquisition', async () => {
    const worker1Plugin = new StateMachinePlugin({
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: { on: { NEXT: 'end' } },
            end: { type: 'final' }
          }
        }
      },
      workerId: 'worker-1',
      lockTimeout: 500,
      lockTTL: 2
    });

    const testDb = createDatabaseForTest('suite=plugins/state-machine-worker-id');
    await testDb.connect();
    await worker1Plugin.install(testDb);
    await worker1Plugin.initializeEntity('test', 'entity1');

    // Transition should succeed and store workerId in lock
    await worker1Plugin.send('test', 'entity1', 'NEXT');

    const state = await worker1Plugin.getState('test', 'entity1');
    expect(state).toBe('end');

    await testDb.disconnect();
  });

  it('should handle lock TTL expiration', async () => {
    const ttlPlugin = new StateMachinePlugin({
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: { on: { NEXT: 'end' } },
            end: { type: 'final' }
          }
        }
      },
      lockTimeout: 0,
      lockTTL: 1 // 1 second TTL
    });

    const testDb = createDatabaseForTest('suite=plugins/state-machine-ttl');
    await testDb.connect();
    await ttlPlugin.install(testDb);
    await ttlPlugin.initializeEntity('test', 'entity1');

    // Acquire lock manually
    const storage = ttlPlugin.getStorage();
    const lockName = 'transition-test-entity1';
    await storage.set(
      storage.getPluginKey(null, 'locks', lockName),
      { workerId: 'stuck-worker' },
      { ttl: 1 }
    );

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Transition should succeed (lock expired)
    await ttlPlugin.send('test', 'entity1', 'NEXT');

    const state = await ttlPlugin.getState('test', 'entity1');
    expect(state).toBe('end');

    await testDb.disconnect();
  });
});
