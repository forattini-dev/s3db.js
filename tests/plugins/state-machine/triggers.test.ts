import { EventEmitter } from 'node:events';
import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('StateMachinePlugin - Triggers', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/state-machine-triggers');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should execute cron trigger with targetState when condition is true', async () => {
    const exitSpy = vi.fn().mockResolvedValue({ action: 'exit' });
    const enterSpy = vi.fn().mockResolvedValue({ action: 'enter' });
    const conditionSpy = vi.fn().mockResolvedValue(true);

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        poller: {
          initialState: 'waiting',
          states: {
            waiting: {
              exit: 'exitSpy',
              triggers: [
                {
                  type: 'cron',
                  schedule: '*/1 * * * * *',
                  targetState: 'running',
                  condition: conditionSpy
                }
              ]
            },
            running: {
              type: 'final',
              entry: 'enterSpy'
            }
          }
        }
      },
      actions: {
        exitSpy,
        enterSpy
      },
      persistTransitions: true
    });

    await plugin.install(database);
    await plugin.initializeEntity('poller', 'job-1', { id: 'job-1' });

    const cronJob = await plugin._createCronJob('poller', 'waiting', {
      type: 'cron',
      schedule: '*/1 * * * * *',
      targetState: 'running',
      condition: conditionSpy
    }, 'tick');

    const result = await cronJob.action();

    expect(conditionSpy).toHaveBeenCalledWith({ id: 'job-1' }, 'job-1');
    expect(result).toEqual({ processed: 1, executed: 1 });
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(enterSpy).toHaveBeenCalledTimes(1);

    const state = await plugin.getState('poller', 'job-1');
    expect(state).toBe('running');

    await plugin.stop();
  });

  it('should respect condition in date trigger before transitioning to targetState', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        poller: {
          initialState: 'waiting',
          states: {
            waiting: {
              triggers: [
                {
                  type: 'date',
                  field: 'dueAt',
                  targetState: 'running',
                  condition: vi.fn().mockResolvedValue(true)
                }
              ]
            },
            running: {
              type: 'final'
            }
          }
        }
      },
      persistTransitions: true,
      triggerCheckInterval: 20
    });

    await plugin.install(database);
    await plugin.initializeEntity('poller', 'job-2', {
      id: 'job-2',
      dueAt: new Date(Date.now() - 1000).toISOString()
    });

    await vi.waitFor(async () => {
      const state = await plugin.getState('poller', 'job-2');
      expect(state).toBe('running');
    }, {
      timeout: 1500,
      interval: 25
    });

    await plugin.stop();
  });

  it('should call onMaxTriggersReached only once for function trigger', async () => {
    const heartbeatSpy = vi.fn().mockResolvedValue({ action: 'heartbeat' });

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        poller: {
          initialState: 'waiting',
          states: {
            waiting: {
              on: {
                MAX_REACHED: 'maxed'
              },
              triggers: [
                {
                  type: 'function',
                  action: 'heartbeat',
                  maxTriggers: 1,
                  onMaxTriggersReached: 'MAX_REACHED'
                }
              ]
            },
            maxed: { type: 'final' }
          }
        }
      },
      actions: {
        heartbeat: heartbeatSpy
      },
      persistTransitions: true,
      triggerCheckInterval: 20
    });

    await plugin.install(database);
    await plugin.initializeEntity('poller', 'job-3', { id: 'job-3' });

    await vi.waitFor(async () => {
      const state = await plugin.getState('poller', 'job-3');
      expect(state).toBe('maxed');
    }, {
      timeout: 1500,
      interval: 25
    });

    expect(heartbeatSpy).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(heartbeatSpy).toHaveBeenCalledTimes(1);
    }, {
      timeout: 300,
      interval: 25
    });

    expect(heartbeatSpy).toHaveBeenCalledTimes(1);

    await plugin.stop();
  });

  it('should wrap plugin event trigger handlers in pending tracker', async () => {
    const slowAction = vi.fn(() => sleep(60));

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        poller: {
          initialState: 'waiting',
          states: {
            waiting: {
              triggers: [
                {
                  type: 'event',
                  event: 'manual-async',
                  action: 'longWork'
                }
              ]
            }
          }
        }
      },
      actions: {
        longWork: slowAction
      },
      persistTransitions: true
    });

    await plugin.install(database);
    await plugin.initializeEntity('poller', 'job-4', { id: 'job-4' });

    plugin.emit('manual-async', { entityId: 'job-4' });

    await expect(plugin.waitForPendingEvents(10)).rejects.toThrow('Timeout waiting for');
    await expect(plugin.waitForPendingEvents(1000)).resolves.toBeUndefined();
    expect(slowAction).toHaveBeenCalledTimes(1);

    await plugin.stop();
  });

  it('should wrap eventSource listeners in pending tracker', async () => {
    const slowAction = vi.fn(() => sleep(60));
    const source = new EventEmitter();

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        poller: {
          initialState: 'waiting',
          states: {
            waiting: {
              triggers: [
                {
                  type: 'event',
                  eventName: 'updated',
                  eventSource: source,
                  action: 'longWork'
                }
              ]
            }
          }
        }
      },
      actions: {
        longWork: slowAction
      },
      persistTransitions: true
    });

    await plugin.install(database);
    await plugin.initializeEntity('poller', 'job-5', { id: 'job-5' });

    source.emit('updated', { entityId: 'job-5' });

    await expect(plugin.waitForPendingEvents(10)).rejects.toThrow('Timeout waiting for');
    await expect(plugin.waitForPendingEvents(1000)).resolves.toBeUndefined();
    expect(slowAction).toHaveBeenCalledTimes(1);

    await plugin.stop();
  });

  it('should execute targetState transition on event trigger', async () => {
    const exitSpy = vi.fn().mockResolvedValue({ action: 'exitWaiting' });
    const enterSpy = vi.fn().mockResolvedValue({ action: 'enterRunning' });

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        poller: {
          initialState: 'waiting',
          states: {
            waiting: {
              exit: 'exitWaiting',
              triggers: [
                {
                  type: 'event',
                  event: 'manual-target',
                  targetState: 'running'
                }
              ]
            },
            running: {
              type: 'final',
              entry: 'enterRunning'
            }
          }
        }
      },
      actions: {
        exitWaiting: exitSpy,
        enterRunning: enterSpy
      },
      persistTransitions: true
    });

    await plugin.install(database);
    await plugin.initializeEntity('poller', 'job-6', { id: 'job-6' });

    const transitionSpy = vi.fn();
    plugin.on('plg:state-machine:transition', transitionSpy);

    plugin.emit('manual-target', { id: 'job-6' });

    await expect(plugin.waitForPendingEvents(1000)).resolves.toBeUndefined();

    const state = await plugin.getState('poller', 'job-6');
    expect(state).toBe('running');
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(enterSpy).toHaveBeenCalledTimes(1);
    expect(transitionSpy).toHaveBeenCalledWith({
      machineId: 'poller',
      entityId: 'job-6',
      from: 'waiting',
      to: 'running',
      event: 'TRIGGER',
      context: expect.objectContaining({ id: 'job-6', eventData: { id: 'job-6' } })
    });

    await plugin.stop();
  });
});
