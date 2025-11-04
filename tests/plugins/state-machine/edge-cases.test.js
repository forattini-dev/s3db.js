import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Edge Cases', () => {
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

  it('should handle missing action gracefully', async () => {
    const missingActionPlugin = new StateMachinePlugin({
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: {
              on: { NEXT: 'end' },
              entry: 'missingAction'
            },
            end: {}
          }
        }
      },
      actions: {},
      verbose: false
    });

    const testDb = createDatabaseForTest('suite=plugins/state-machine-missing-action');

    await testDb.connect();
    await missingActionPlugin.install(testDb);

    // Should not throw even with missing action
    await missingActionPlugin.initializeEntity('test', 'entity1');

    await testDb.disconnect();
  });

  it('should handle missing guard gracefully', async () => {
    const missingGuardPlugin = new StateMachinePlugin({
      stateMachines: {
        test: {
          initialState: 'start',
          states: {
            start: {
              on: { NEXT: 'end' },
              guards: { NEXT: 'missingGuard' }
            },
            end: {}
          }
        }
      },
      guards: {}
    });

    const testDb = createDatabaseForTest('suite=plugins/state-machine-missing-guard');

    await testDb.connect();
    await missingGuardPlugin.install(testDb);

    await missingGuardPlugin.initializeEntity('test', 'entity1');

    // Should proceed with transition when guard is missing
    await missingGuardPlugin.send('test', 'entity1', 'NEXT');

    const state = await missingGuardPlugin.getState('test', 'entity1');
    expect(state).toBe('end');

    await testDb.disconnect();
  });
});
