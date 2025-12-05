import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - State Transitions', () => {
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

  beforeEach(async () => {
    await plugin.initializeEntity('order_processing', 'order1', { id: 'order1' });
  });

  it('should transition to valid next state', async () => {
    const result = await plugin.send('order_processing', 'order1', 'CONFIRM', { paymentId: 'pay1' });

    expect(result.from).toBe('pending');
    expect(result.to).toBe('confirmed');
    expect(result.event).toBe('CONFIRM');
    expect(result.timestamp).toBeDefined();

    const newState = await plugin.getState('order_processing', 'order1');
    expect(newState).toBe('confirmed');
  });

  it('should execute entry and exit actions during transition', async () => {
    await plugin.send('order_processing', 'order1', 'CONFIRM');
    await plugin.send('order_processing', 'order1', 'PREPARE');

    // Entry action called when entering confirmed
    // Exit action called when leaving confirmed
    expect(mockActions.onConfirmed).toHaveBeenCalledTimes(2);
  });

  it('should throw error for invalid event', async () => {
    await expect(plugin.send('order_processing', 'order1', 'INVALID')).rejects.toThrow(
      "Event 'INVALID' not valid for state 'pending' in machine 'order_processing'"
    );
  });

  it('should throw error for unknown machine in send', async () => {
    await expect(plugin.send('unknown', 'order1', 'EVENT')).rejects.toThrow(
      "State machine 'unknown' not found"
    );
  });

  it('should emit transition event', async () => {
    const transitionSpy = vi.fn();
    plugin.on('plg:state-machine:transition', transitionSpy);

    await plugin.send('order_processing', 'order1', 'CONFIRM', { test: 'data' });

    expect(transitionSpy).toHaveBeenCalledWith({
      machineId: 'order_processing',
      entityId: 'order1',
      from: 'pending',
      to: 'confirmed',
      event: 'CONFIRM',
      context: { test: 'data' }
    });
  });

  it('should handle multiple sequential transitions', async () => {
    await plugin.send('order_processing', 'order1', 'CONFIRM');
    await plugin.send('order_processing', 'order1', 'PREPARE');
    await plugin.send('order_processing', 'order1', 'SHIP');

    const finalState = await plugin.getState('order_processing', 'order1');
    expect(finalState).toBe('shipped');
  });
});
