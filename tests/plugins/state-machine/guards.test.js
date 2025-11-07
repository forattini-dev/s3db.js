import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Guards', () => {
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
      verbose: false,
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

  beforeEach(async () => {
    await plugin.initializeEntity('test_guards', 'test1');
  });

  it('should allow transition when guard returns true', async () => {
    mockGuards.canShip.mockResolvedValue(true);

    await plugin.send('test_guards', 'test1', 'PASS');

    const state = await plugin.getState('test_guards', 'test1');
    expect(state).toBe('success');
    expect(mockGuards.canShip).toHaveBeenCalled();
  });

  it('should block transition when guard returns false', async () => {
    mockGuards.cannotShip.mockResolvedValue(false);

    await expect(plugin.send('test_guards', 'test1', 'FAIL')).rejects.toThrow(
      /Transition blocked by guard 'cannotShip'/
    );

    const state = await plugin.getState('test_guards', 'test1');
    expect(state).toBe('start'); // Should remain in start state
  });

  it('should block transition when guard throws error', async () => {
    mockGuards.guardError.mockRejectedValue(new Error('Guard error'));

    await expect(plugin.send('test_guards', 'test1', 'ERROR')).rejects.toThrow(
      /Transition blocked by guard 'guardError'/
    );
  });

  it('should pass correct parameters to guard', async () => {
    const context = { test: 'data' };
    await plugin.send('test_guards', 'test1', 'PASS', context);

    expect(mockGuards.canShip).toHaveBeenCalledWith(
      context,
      'PASS',
      {
        database: plugin.database,
        machineId: 'test_guards',
        entityId: 'test1'
      }
    );
  });
});
