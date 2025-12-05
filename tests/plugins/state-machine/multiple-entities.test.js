import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Multiple Entities', () => {
  let database;
  let plugin;
  let mockActions = {};
  let mockGuards = {};

  beforeEach(async () => {
    mockActions = {
      onConfirmed: vi.fn().mockResolvedValue({ action: 'confirmed' }),
      onShipped: vi.fn().mockResolvedValue({ action: 'shipped' }),
      onError: vi.fn().mockRejectedValue(new Error('Action failed'))
    };

    mockGuards = {
      canShip: vi.fn().mockResolvedValue(true),
      cannotShip: vi.fn().mockResolvedValue(false),
      guardError: vi.fn().mockRejectedValue(new Error('Guard failed'))
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

  it('should handle multiple entities independently', async () => {
    await plugin.initializeEntity('order_processing', 'order1');
    await plugin.initializeEntity('order_processing', 'order2');

    await plugin.send('order_processing', 'order1', 'CONFIRM');

    const state1 = await plugin.getState('order_processing', 'order1');
    const state2 = await plugin.getState('order_processing', 'order2');

    expect(state1).toBe('confirmed');
    expect(state2).toBe('pending');
  });

  it('should handle multiple machines independently', async () => {
    await plugin.initializeEntity('order_processing', 'order1');
    await plugin.initializeEntity('user_onboarding', 'user1');

    await plugin.send('order_processing', 'order1', 'CONFIRM');
    await plugin.send('user_onboarding', 'user1', 'VERIFY_EMAIL');

    const orderState = await plugin.getState('order_processing', 'order1');
    const userState = await plugin.getState('user_onboarding', 'user1');

    expect(orderState).toBe('confirmed');
    expect(userState).toBe('verified');
  });
});
