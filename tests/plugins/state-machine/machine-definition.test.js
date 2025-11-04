import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Machine Definition', () => {
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

  it('should return machine definition', () => {
    const definition = plugin.getMachineDefinition('order_processing');

    expect(definition).toBeDefined();
    expect(definition.initialState).toBe('pending');
    expect(definition.states).toBeDefined();
    expect(definition.states.pending).toBeDefined();
  });

  it('should return null for unknown machine', () => {
    const definition = plugin.getMachineDefinition('unknown');
    expect(definition).toBeNull();
  });

  it('should return list of all machines', () => {
    const machines = plugin.getMachines();
    expect(machines).toEqual(expect.arrayContaining(['order_processing', 'user_onboarding', 'test_guards']));
  });
});
