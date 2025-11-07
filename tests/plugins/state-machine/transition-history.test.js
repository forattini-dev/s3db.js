import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Transition History', () => {
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
    await plugin.initializeEntity('order_processing', 'order1');
  });

  it('should record transition history', async () => {
    await plugin.send('order_processing', 'order1', 'CONFIRM');
    await plugin.send('order_processing', 'order1', 'PREPARE');

    const history = await plugin.getTransitionHistory('order_processing', 'order1');

    expect(history).toHaveLength(2);
    expect(history[0].from).toBe('confirmed');
    expect(history[0].to).toBe('preparing');
    expect(history[0].event).toBe('PREPARE');
    expect(history[1].from).toBe('pending');
    expect(history[1].to).toBe('confirmed');
    expect(history[1].event).toBe('CONFIRM');
  });

  it('should return empty array when persistence disabled', async () => {
    const noPersistPlugin = new StateMachinePlugin({
      verbose: false,
      stateMachines: {
        test: {
          initialState: 'start',
          states: { start: {} }
        }
      },
      persistTransitions: false
    });

    const history = await noPersistPlugin.getTransitionHistory('test', 'entity1');
    expect(history).toEqual([]);
  });

  it('should support pagination in history', async () => {
    // Create multiple transitions
    await plugin.send('order_processing', 'order1', 'CONFIRM');
    await plugin.send('order_processing', 'order1', 'PREPARE');
    await plugin.send('order_processing', 'order1', 'SHIP');

    const history = await plugin.getTransitionHistory('order_processing', 'order1', {
      limit: 2,
      offset: 1
    });

    expect(history).toHaveLength(2);
  });

  it('should handle history query errors gracefully', async () => {
    // Mock database error
    const originalResource = plugin.database.resource;
    plugin.database.resource = jest.fn().mockReturnValue({
      list: jest.fn().mockRejectedValue(new Error('Database error'))
    });

    const history = await plugin.getTransitionHistory('order_processing', 'order1');
    expect(history).toEqual([]);

    // Restore original
    plugin.database.resource = originalResource;
  });
});
