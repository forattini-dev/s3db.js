import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Actions', () => {
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
      logLevel: 'silent',
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
      logLevel: 'silent'
    });

    await database.connect();
    await plugin.install(database);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should execute action with correct parameters', async () => {
    await plugin.initializeEntity('order_processing', 'order1');
    await plugin.send('order_processing', 'order1', 'CONFIRM', { test: 'data' });

    expect(mockActions.onConfirmed).toHaveBeenCalledWith(
      { test: 'data' },
      'CONFIRM',
      {
        database: plugin.database,
        machineId: 'order_processing',
        entityId: 'order1'
      }
    );
  });

  it('should handle action errors gracefully', async () => {
    const errorSpy = jest.fn();

    // Create machine with error action
    const errorPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: {
              entry: 'onError'
            }
          }
        }
      },
      actions: mockActions,
      logLevel: 'silent'
    });

    errorPlugin.on('plg:state-machine:action-error', errorSpy);

    const testDb = createDatabaseForTest('suite=plugins/state-machine-error');

    await testDb.connect();
    await errorPlugin.install(testDb);

    await errorPlugin.initializeEntity('test', 'entity1');

    expect(errorSpy).toHaveBeenCalledWith({
      actionName: 'onError',
      error: 'Action failed',
      machineId: 'test',
      entityId: 'entity1'
    });

    await testDb.disconnect();
  });

  it('should continue transition even if action fails', async () => {
    // This tests that action errors don't prevent state transitions
    const errorPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: {
              on: { NEXT: 'end' },
              exit: 'onError'
            },
            end: { type: 'final' }
          }
        }
      },
      actions: mockActions
    });

    const testDb = createDatabaseForTest('suite=plugins/state-machine-action-error');

    await testDb.connect();
    await errorPlugin.install(testDb);

    await errorPlugin.initializeEntity('test', 'entity1');
    await errorPlugin.send('test', 'entity1', 'NEXT');

    const state = await errorPlugin.getState('test', 'entity1');
    expect(state).toBe('end');

    await testDb.disconnect();
  });
});
