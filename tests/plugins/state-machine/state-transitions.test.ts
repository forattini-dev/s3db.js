import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine/index.js';

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
      persistTransitions: true
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
    const result = await plugin.send('order_processing', 'order1', 'INVALID');

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_EVENT',
      reason: 'INVALID_EVENT'
    });
  });

  it('should throw error for unknown machine in send', async () => {
    const result = await plugin.send('unknown', 'order1', 'EVENT');

    expect(result).toMatchObject({
      ok: false,
      code: 'MACHINE_NOT_FOUND',
      reason: 'MACHINE_NOT_FOUND'
    });
  });

  it('should emit transition lifecycle hooks', async () => {
    const beforeHook = vi.fn();
    const transitionHook = vi.fn();
    const afterHook = vi.fn();
    const rejectHook = vi.fn();

    plugin.on('plg:state-machine:before-transition', beforeHook);
    plugin.on('plg:state-machine:transition', transitionHook);
    plugin.on('plg:state-machine:after-transition', afterHook);
    plugin.on('plg:state-machine:transition-rejected', rejectHook);

    const success = await plugin.send('order_processing', 'order1', 'CONFIRM');

    expect(success).toMatchObject({ ok: true, from: 'pending', to: 'confirmed' });
    expect(beforeHook).toHaveBeenCalled();
    expect(transitionHook).toHaveBeenCalled();
    expect(afterHook).toHaveBeenCalled();

    const rejected = await plugin.send('order_processing', 'order1', 'INVALID');
    expect(rejected).toMatchObject({ ok: false, code: 'INVALID_EVENT' });
    expect(rejectHook).toHaveBeenCalled();
  });

  it('should emit transition event', async () => {
    const transitionSpy = vi.fn();
    plugin.on('plg:state-machine:transition', transitionSpy);

    await plugin.send('order_processing', 'order1', 'CONFIRM', { test: 'data' });

    expect(transitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      machineId: 'order_processing',
      entityId: 'order1',
      from: 'pending',
      to: 'confirmed',
      event: 'CONFIRM',
      context: { test: 'data' }
    }));
  });

  it('should handle multiple sequential transitions', async () => {
    await plugin.send('order_processing', 'order1', 'CONFIRM');
    await plugin.send('order_processing', 'order1', 'PREPARE');
    await plugin.send('order_processing', 'order1', 'SHIP');

    const finalState = await plugin.getState('order_processing', 'order1');
    expect(finalState).toBe('shipped');
  });

  it('should execute function trigger when condition is omitted', async () => {
    const onHeartbeat = vi.fn().mockResolvedValue({ action: 'heartbeat' });

    const triggerPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        poller: {
          initialState: 'waiting',
          states: {
            waiting: {
              triggers: [
                {
                  type: 'function',
                  action: 'heartbeat'
                }
              ]
            }
          }
        }
      },
      actions: { heartbeat: onHeartbeat },
      persistTransitions: false,
      triggerCheckInterval: 20
    });

    await triggerPlugin.install(database);
    await triggerPlugin.initializeEntity('poller', 'job-1', { id: 'job-1' });

    await new Promise(resolve => setTimeout(resolve, 120));

    expect(onHeartbeat).toHaveBeenCalled();
    await triggerPlugin.stop();
  });

  it('should skip function trigger when condition returns false', async () => {
    const onHeartbeat = vi.fn().mockResolvedValue({ action: 'heartbeat' });
    const shouldRun = vi.fn().mockResolvedValue(false);

    const triggerPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        poller: {
          initialState: 'waiting',
          states: {
            waiting: {
              triggers: [
                {
                  type: 'function',
                  action: 'heartbeat',
                  condition: shouldRun,
                  maxTriggers: 1
                }
              ]
            }
          }
        }
      },
      actions: { heartbeat: onHeartbeat },
      persistTransitions: false,
      triggerCheckInterval: 20
    });

    await triggerPlugin.install(database);
    await triggerPlugin.initializeEntity('poller', 'job-2', { id: 'job-2' });

    await new Promise(resolve => setTimeout(resolve, 120));

    expect(shouldRun).toHaveBeenCalled();
    expect(onHeartbeat).not.toHaveBeenCalled();
    await triggerPlugin.stop();
  });
});
