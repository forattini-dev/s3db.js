import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - State Management', () => {
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

  it('should return initial state for new entity', async () => {
    const state = await plugin.getState('order_processing', 'order1');
    expect(state).toBe('pending');
  });

  it('should initialize entity with initial state', async () => {
    const result = await plugin.initializeEntity('order_processing', 'order1', { id: 'order1' });
    expect(result).toBe('pending');

    const state = await plugin.getState('order_processing', 'order1');
    expect(state).toBe('pending');
  });

  it('should execute entry action when initializing entity', async () => {
    const entryPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: {
              entry: 'onConfirmed'
            }
          }
        }
      },
      actions: mockActions
    });

    const testDb = createDatabaseForTest('suite=plugins/state-machine-entry');

    await testDb.connect();
    await entryPlugin.install(testDb);

    await entryPlugin.initializeEntity('test', 'entity1');

    expect(mockActions.onConfirmed).toHaveBeenCalled();

    await testDb.disconnect();
  });

  it('should emit entity_initialized event', async () => {
    const initSpy = jest.fn();
    plugin.on('plg:state-machine:entity-initialized', initSpy);

    await plugin.initializeEntity('order_processing', 'order1');

    expect(initSpy).toHaveBeenCalledWith({
      machineId: 'order_processing',
      entityId: 'order1',
      initialState: 'pending'
    });
  });

  it('should throw error for unknown machine', async () => {
    await expect(plugin.getState('unknown', 'entity1')).rejects.toThrow("State machine 'unknown' not found");
  });
});
