import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Persistence', () => {
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

  it('should persist state changes to database', async () => {
    await plugin.initializeEntity('order_processing', 'order1');
    await plugin.send('order_processing', 'order1', 'CONFIRM');

    // Check state resource
    const stateRecord = await database.resources[plugin.config.stateResource]
      .get('order_processing_order1');

    expect(stateRecord).toBeDefined();
    expect(stateRecord.currentState).toBe('confirmed');
    expect(stateRecord.machineId).toBe('order_processing');
    expect(stateRecord.entityId).toBe('order1');
  });

  it('should persist transition log', async () => {
    await plugin.initializeEntity('order_processing', 'order1');
    await plugin.send('order_processing', 'order1', 'CONFIRM', { test: 'data' });

    // Check transition log
    const transitions = await database.resources[plugin.config.transitionLogResource]
      .list({
        where: { machineId: 'order_processing', entityId: 'order1' }
      });

    expect(transitions).toHaveLength(1);
    expect(transitions[0].fromState).toBe('pending');
    expect(transitions[0].toState).toBe('confirmed');
    expect(transitions[0].event).toBe('CONFIRM');
    expect(transitions[0].context).toEqual({ test: 'data' });
  });

  it('should recover state from persistence', async () => {
    // Initialize and transition
    await plugin.initializeEntity('order_processing', 'order1');
    await plugin.send('order_processing', 'order1', 'CONFIRM');

    // Clear in-memory cache
    const machine = plugin.machines.get('order_processing');
    machine.currentStates.clear();

    // Should recover from persistence
    const state = await plugin.getState('order_processing', 'order1');
    expect(state).toBe('confirmed');
  });
});
