import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine/index.js';

describe('Wildcard Transitions', () => {
  let database;
  let plugin;

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should allow wildcard event from any non-final state', async () => {
    database = createDatabaseForTest('suite=plugins/state-machine/wildcard-all');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        workflow: {
          initialState: 'draft',
          states: {
            '*': { on: { CANCEL: 'cancelled' } },
            draft: { on: { SUBMIT: 'pending' } },
            pending: { on: { APPROVE: 'approved' } },
            approved: { on: { PUBLISH: 'published' } },
            published: { type: 'final' },
            cancelled: { type: 'final' }
          }
        }
      },
      actions: {},
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('workflow', 'e1');
    let result = await plugin.send('workflow', 'e1', 'CANCEL');
    expect(result).toMatchObject({ ok: true, from: 'draft', to: 'cancelled' });

    await plugin.initializeEntity('workflow', 'e2');
    await plugin.send('workflow', 'e2', 'SUBMIT');
    result = await plugin.send('workflow', 'e2', 'CANCEL');
    expect(result).toMatchObject({ ok: true, from: 'pending', to: 'cancelled' });

    await plugin.initializeEntity('workflow', 'e3');
    await plugin.send('workflow', 'e3', 'SUBMIT');
    await plugin.send('workflow', 'e3', 'APPROVE');
    result = await plugin.send('workflow', 'e3', 'CANCEL');
    expect(result).toMatchObject({ ok: true, from: 'approved', to: 'cancelled' });
  });

  it('should prioritize state-specific event over wildcard', async () => {
    database = createDatabaseForTest('suite=plugins/state-machine/wildcard-priority');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        priority: {
          initialState: 'pending',
          states: {
            '*': { on: { SUBMIT: 'other' } },
            pending: { on: { SUBMIT: 'active' } },
            active: { type: 'final' },
            other: { type: 'final' }
          }
        }
      },
      actions: {},
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('priority', 'e1');
    const result = await plugin.send('priority', 'e1', 'SUBMIT');
    expect(result).toMatchObject({ ok: true, from: 'pending', to: 'active' });
  });

  it('should not apply wildcard events to final states', async () => {
    database = createDatabaseForTest('suite=plugins/state-machine/wildcard-final');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        finaltest: {
          initialState: 'open',
          states: {
            '*': { on: { RESET: 'open' } },
            open: { on: { CLOSE: 'closed' } },
            closed: { type: 'final' }
          }
        }
      },
      actions: {},
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('finaltest', 'e1');
    await plugin.send('finaltest', 'e1', 'CLOSE');

    const result = await plugin.send('finaltest', 'e1', 'RESET');
    expect(result).toMatchObject({ ok: false, code: 'INVALID_EVENT' });
  });

  it('should include wildcard events in getValidEvents', async () => {
    database = createDatabaseForTest('suite=plugins/state-machine/wildcard-valid-events');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        eventstest: {
          initialState: 'idle',
          states: {
            '*': { on: { CANCEL: 'cancelled', RESET: 'idle' } },
            idle: { on: { START: 'running' } },
            running: { on: { STOP: 'idle' } },
            cancelled: { type: 'final' }
          }
        }
      },
      actions: {},
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('eventstest', 'e1');
    const events = await plugin.getValidEvents('eventstest', 'e1');
    expect(events).toContain('START');
    expect(events).toContain('CANCEL');
    expect(events).toContain('RESET');
    expect(events).toHaveLength(3);

    await plugin.send('eventstest', 'e1', 'START');
    const runningEvents = await plugin.getValidEvents('eventstest', 'e1');
    expect(runningEvents).toContain('STOP');
    expect(runningEvents).toContain('CANCEL');
    expect(runningEvents).toContain('RESET');
    expect(runningEvents).toHaveLength(3);

    await plugin.send('eventstest', 'e1', 'CANCEL');
    const finalEvents = await plugin.getValidEvents('eventstest', 'e1');
    expect(finalEvents).toHaveLength(0);
  });

  it('should resolve guards with edge > state > wildcard priority', async () => {
    const edgeGuard = vi.fn().mockResolvedValue(true);
    const stateGuard = vi.fn().mockResolvedValue(true);
    const wildcardGuard = vi.fn().mockResolvedValue(true);

    database = createDatabaseForTest('suite=plugins/state-machine/wildcard-guard-priority');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        guardpriority: {
          initialState: 'start',
          states: {
            '*': {
              on: { GO: 'end' },
              guards: { GO: 'wildcardGuard' }
            },
            start: {
              on: {
                GO: { target: 'end', guard: 'edgeGuard' },
                MOVE: 'end'
              },
              guards: { MOVE: 'stateGuard' }
            },
            end: { type: 'final' }
          }
        }
      },
      actions: {},
      guards: { edgeGuard, stateGuard, wildcardGuard }
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('guardpriority', 'e1');
    await plugin.send('guardpriority', 'e1', 'GO');

    expect(edgeGuard).toHaveBeenCalled();
    expect(wildcardGuard).not.toHaveBeenCalled();
  });
});

describe('Conditional Transitions', () => {
  let database;
  let plugin;

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should route to first matching guard target', async () => {
    const isVip = vi.fn();

    database = createDatabaseForTest('suite=plugins/state-machine/conditional-match');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        routing: {
          initialState: 'pending',
          states: {
            pending: {
              on: {
                PROCESS: [
                  { target: 'vip', guard: 'isVip' },
                  { target: 'standard' }
                ]
              }
            },
            vip: { type: 'final' },
            standard: { type: 'final' }
          }
        }
      },
      actions: {},
      guards: { isVip }
    });

    await database.connect();
    await plugin.install(database);

    isVip.mockResolvedValue(true);
    await plugin.initializeEntity('routing', 'e1');
    let result = await plugin.send('routing', 'e1', 'PROCESS');
    expect(result).toMatchObject({ ok: true, from: 'pending', to: 'vip' });

    isVip.mockResolvedValue(false);
    await plugin.initializeEntity('routing', 'e2');
    result = await plugin.send('routing', 'e2', 'PROCESS');
    expect(result).toMatchObject({ ok: true, from: 'pending', to: 'standard' });
  });

  it('should return NO_MATCHING_TARGET when no guard matches and no fallback', async () => {
    const isVip = vi.fn().mockResolvedValue(false);
    const isPremium = vi.fn().mockResolvedValue(false);

    database = createDatabaseForTest('suite=plugins/state-machine/conditional-no-match');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        nomatch: {
          initialState: 'pending',
          states: {
            pending: {
              on: {
                ROUTE: [
                  { target: 'vip', guard: 'isVip' },
                  { target: 'premium', guard: 'isPremium' }
                ]
              }
            },
            vip: { type: 'final' },
            premium: { type: 'final' }
          }
        }
      },
      actions: {},
      guards: { isVip, isPremium }
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('nomatch', 'e1');
    const result = await plugin.send('nomatch', 'e1', 'ROUTE');
    expect(result).toMatchObject({
      ok: false,
      code: 'NO_MATCHING_TARGET'
    });
  });

  it('should execute edge hooks on conditional target', async () => {
    const isVip = vi.fn().mockResolvedValue(true);
    const vipBeforeHook = vi.fn().mockResolvedValue(undefined);
    const vipAfterHook = vi.fn().mockResolvedValue(undefined);

    database = createDatabaseForTest('suite=plugins/state-machine/conditional-hooks');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        edgehooks: {
          initialState: 'pending',
          states: {
            pending: {
              on: {
                PROCESS: [
                  {
                    target: 'vip',
                    guard: 'isVip',
                    beforeTransition: 'vipBeforeHook',
                    afterTransition: 'vipAfterHook'
                  },
                  { target: 'standard' }
                ]
              }
            },
            vip: { type: 'final' },
            standard: { type: 'final' }
          }
        }
      },
      actions: { vipBeforeHook, vipAfterHook },
      guards: { isVip }
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('edgehooks', 'e1');
    const result = await plugin.send('edgehooks', 'e1', 'PROCESS');
    expect(result).toMatchObject({ ok: true, to: 'vip' });
    expect(vipBeforeHook).toHaveBeenCalled();
    expect(vipAfterHook).toHaveBeenCalled();
  });
});

describe('Lifecycle Hook Pipeline', () => {
  let database;
  let plugin;

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should execute all 11 hooks in correct order for a final state transition', async () => {
    const order: string[] = [];

    const makeHook = (name: string, returnValue: unknown = undefined) =>
      vi.fn().mockImplementation(async () => {
        order.push(name);
        return returnValue;
      });

    const hookBeforeTransition = makeHook('machine.beforeTransition');
    const hookBeforeLeave = makeHook('state[from].beforeLeave');
    const hookBeforeEnter = makeHook('state[to].beforeEnter');
    const hookEdgeBefore = makeHook('edge.beforeTransition');
    const hookBeforeFinalize = makeHook('machine.beforeFinalize');
    const hookAfterLeave = makeHook('state[from].afterLeave');
    const hookAfterEnter = makeHook('state[to].afterEnter');
    const hookEdgeAfter = makeHook('edge.afterTransition');
    const hookAfterFinalize = makeHook('machine.afterFinalize');
    const hookAfterTransition = makeHook('machine.afterTransition');

    database = createDatabaseForTest('suite=plugins/state-machine/hook-pipeline');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        pipeline: {
          initialState: 'active',
          hooks: {
            beforeTransition: 'hookBeforeTransition',
            afterTransition: 'hookAfterTransition',
            beforeFinalize: 'hookBeforeFinalize',
            afterFinalize: 'hookAfterFinalize'
          },
          states: {
            active: {
              on: {
                FINISH: {
                  target: 'done',
                  beforeTransition: 'hookEdgeBefore',
                  afterTransition: 'hookEdgeAfter'
                }
              },
              beforeLeave: 'hookBeforeLeave',
              afterLeave: 'hookAfterLeave'
            },
            done: {
              type: 'final',
              beforeEnter: 'hookBeforeEnter',
              afterEnter: 'hookAfterEnter'
            }
          }
        }
      },
      actions: {
        hookBeforeTransition,
        hookBeforeLeave,
        hookBeforeEnter,
        hookEdgeBefore,
        hookBeforeFinalize,
        hookAfterLeave,
        hookAfterEnter,
        hookEdgeAfter,
        hookAfterFinalize,
        hookAfterTransition
      },
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('pipeline', 'e1');
    order.length = 0;

    await plugin.send('pipeline', 'e1', 'FINISH');

    expect(order).toEqual([
      'machine.beforeTransition',
      'state[from].beforeLeave',
      'state[to].beforeEnter',
      'edge.beforeTransition',
      'machine.beforeFinalize',
      'state[from].afterLeave',
      'state[to].afterEnter',
      'edge.afterTransition',
      'machine.afterFinalize',
      'machine.afterTransition'
    ]);
  });

  it('should reject transition when beforeLeave returns false', async () => {
    const rejectingLeave = vi.fn().mockResolvedValue(false);

    database = createDatabaseForTest('suite=plugins/state-machine/hook-before-leave-cancel');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        leaveguard: {
          initialState: 'open',
          states: {
            open: {
              on: { CLOSE: 'closed' },
              beforeLeave: 'rejectingLeave'
            },
            closed: { type: 'final' }
          }
        }
      },
      actions: { rejectingLeave },
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('leaveguard', 'e1');
    const result = await plugin.send('leaveguard', 'e1', 'CLOSE');

    expect(result).toMatchObject({
      ok: false,
      code: 'HOOK_REJECTED'
    });
    expect(result.details).toMatchObject({ hook: 'beforeLeave' });

    const state = await plugin.getState('leaveguard', 'e1');
    expect(state).toBe('open');
  });

  it('should reject transition when beforeEnter returns false', async () => {
    const rejectingEnter = vi.fn().mockResolvedValue(false);

    database = createDatabaseForTest('suite=plugins/state-machine/hook-before-enter-cancel');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        enterguard: {
          initialState: 'open',
          states: {
            open: { on: { CLOSE: 'closed' } },
            closed: {
              type: 'final',
              beforeEnter: 'rejectingEnter'
            }
          }
        }
      },
      actions: { rejectingEnter },
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('enterguard', 'e1');
    const result = await plugin.send('enterguard', 'e1', 'CLOSE');

    expect(result).toMatchObject({
      ok: false,
      code: 'HOOK_REJECTED'
    });
    expect(result.details).toMatchObject({ hook: 'beforeEnter' });

    const state = await plugin.getState('enterguard', 'e1');
    expect(state).toBe('open');
  });

  it('should fire afterReject hook on guard rejection', async () => {
    const blockGuard = vi.fn().mockResolvedValue(false);
    const afterRejectHook = vi.fn().mockResolvedValue(undefined);

    database = createDatabaseForTest('suite=plugins/state-machine/hook-after-reject');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        rejectmachine: {
          initialState: 'start',
          hooks: {
            afterReject: 'afterRejectHook'
          },
          states: {
            start: {
              on: { GO: 'end' },
              guards: { GO: 'blockGuard' }
            },
            end: { type: 'final' }
          }
        }
      },
      actions: { afterRejectHook },
      guards: { blockGuard }
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('rejectmachine', 'e1');
    const result = await plugin.send('rejectmachine', 'e1', 'GO');

    expect(result).toMatchObject({ ok: false, code: 'GUARD_REJECTED' });
    expect(afterRejectHook).toHaveBeenCalled();
  });

  it('should fire afterError hook on exception in after-hooks', async () => {
    const afterErrorHook = vi.fn().mockResolvedValue(undefined);
    const throwingAfterLeave = vi.fn().mockRejectedValue(new Error('after-leave explosion'));

    database = createDatabaseForTest('suite=plugins/state-machine/hook-after-error');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        errormachine: {
          initialState: 'start',
          hooks: {
            afterError: 'afterErrorHook'
          },
          states: {
            start: {
              on: { GO: 'end' },
              afterLeave: 'throwingAfterLeave'
            },
            end: { type: 'final' }
          }
        }
      },
      actions: { afterErrorHook, throwingAfterLeave },
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('errormachine', 'e1');
    const result = await plugin.send('errormachine', 'e1', 'GO');

    expect(result.ok).toBe(true);
    expect(result.afterHookErrors).toBeDefined();
    expect(result.afterHookErrors).toHaveLength(1);
    expect(result.afterHookErrors![0]).toContain('after-leave explosion');
    expect(afterErrorHook).toHaveBeenCalled();
  });

  it('should fire afterInitialize hook on initializeEntity', async () => {
    const afterInitHook = vi.fn().mockResolvedValue(undefined);

    database = createDatabaseForTest('suite=plugins/state-machine/hook-after-initialize');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        initmachine: {
          initialState: 'idle',
          hooks: {
            afterInitialize: 'afterInitHook'
          },
          states: {
            idle: { on: { START: 'running' } },
            running: { type: 'final' }
          }
        }
      },
      actions: { afterInitHook },
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('initmachine', 'e1', { foo: 'bar' });

    expect(afterInitHook).toHaveBeenCalledWith(
      { foo: 'bar' },
      'INIT',
      expect.objectContaining({
        machineId: 'initmachine',
        entityId: 'e1'
      })
    );
  });

  it('should fire afterDelete hook on deleteEntity', async () => {
    const afterDeleteHook = vi.fn().mockResolvedValue(undefined);

    database = createDatabaseForTest('suite=plugins/state-machine/hook-after-delete');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        delmachine: {
          initialState: 'alive',
          hooks: {
            afterDelete: 'afterDeleteHook'
          },
          states: {
            alive: { on: { KILL: 'dead' } },
            dead: { type: 'final' }
          }
        }
      },
      actions: { afterDeleteHook },
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('delmachine', 'e1');
    await plugin.deleteEntity('delmachine', 'e1');

    expect(afterDeleteHook).toHaveBeenCalledWith(
      {},
      'DELETE',
      expect.objectContaining({
        machineId: 'delmachine',
        entityId: 'e1'
      })
    );
  });

  it('should return ok:true with afterHookErrors when an after-hook throws', async () => {
    const throwingAfterEnter = vi.fn().mockRejectedValue(new Error('afterEnter boom'));
    const normalAfterLeave = vi.fn().mockResolvedValue(undefined);

    database = createDatabaseForTest('suite=plugins/state-machine/hook-after-fire-and-forget');

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      persistTransitions: false,
      stateMachines: {
        fireforget: {
          initialState: 'a',
          states: {
            a: {
              on: { NEXT: 'b' },
              afterLeave: 'normalAfterLeave'
            },
            b: {
              type: 'final',
              afterEnter: 'throwingAfterEnter'
            }
          }
        }
      },
      actions: { throwingAfterEnter, normalAfterLeave },
      guards: {}
    });

    await database.connect();
    await plugin.install(database);

    await plugin.initializeEntity('fireforget', 'e1');
    const result = await plugin.send('fireforget', 'e1', 'NEXT');

    expect(result.ok).toBe(true);
    expect(result.to).toBe('b');
    expect(result.afterHookErrors).toBeDefined();
    expect(result.afterHookErrors!.length).toBeGreaterThanOrEqual(1);
    expect(result.afterHookErrors![0]).toContain('afterEnter boom');

    const state = await plugin.getState('fireforget', 'e1');
    expect(state).toBe('b');
  });
});
