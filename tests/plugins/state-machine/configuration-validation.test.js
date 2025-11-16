import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Configuration Validation', () => {
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

  it('should throw error when no state machines defined', () => {
    expect(() => {
      new StateMachinePlugin({});
    }).toThrow('At least one state machine must be defined');
  });

  it('should throw error when machine has no states', () => {
    expect(() => {
      new StateMachinePlugin({
      logLevel: 'silent',
        stateMachines: {
          invalid: {}
        }
      });
    }).toThrow("Machine 'invalid' must have states defined");
  });

  it('should throw error when machine has no initial state', () => {
    expect(() => {
      new StateMachinePlugin({
      logLevel: 'silent',
        stateMachines: {
          invalid: {
            states: { start: {} }
          }
        }
      });
    }).toThrow("Machine 'invalid' must have an initialState");
  });

  it('should throw error when initial state not found in states', () => {
    expect(() => {
      new StateMachinePlugin({
      logLevel: 'silent',
        stateMachines: {
          invalid: {
            initialState: 'missing',
            states: { start: {} }
          }
        }
      });
    }).toThrow("Initial state 'missing' not found in machine 'invalid'");
  });
});
