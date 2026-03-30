import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine/index.js';
import { StateMachineError } from '../../../src/plugins/state-machine.errors.js';
import { calculateBackoff, toEpoch } from '../../../src/plugins/state-machine/helpers.js';
import { fetchTransitionHistory } from '../../../src/plugins/state-machine/query.js';

interface ResourceWithSchema {
  $schema?: {
    stateMachine?: string | {
      machine: string;
      stateField?: string;
      autoCleanup?: boolean;
    };
  };
  state?: {
    send: (id: string, event: string, eventData?: Record<string, unknown>) => Promise<unknown>;
    get: (id: string) => Promise<string>;
    canTransition: (id: string, event: string) => Promise<boolean>;
    getValidEvents: (id: string) => Promise<string[]>;
    initialize: (id: string, context?: Record<string, unknown>) => Promise<string>;
    history: (id: string, options?: { limit?: number; offset?: number }) => Promise<unknown[]>;
    transitions: (id: string, options?: Record<string, unknown>) => Promise<unknown[]>;
    transition: (id: string, transitionId: string) => Promise<unknown>;
    transitionCount: (id: string, options?: Record<string, unknown>) => Promise<number>;
    getLastTransitions: (id: string, limit?: number) => Promise<unknown[]>;
    snapshot: (id: string) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
  };
  insert: (data: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
}

describe('StateMachinePlugin - Coverage Edges', () => {
  const buildMachineConfig = () => ({
    flow: {
      initialState: 'pending',
      states: {
        pending: {
          on: {
            CONFIRM: 'confirmed',
            FAIL: 'failed'
          }
        },
        confirmed: {
          type: 'final'
        },
        failed: {
          type: 'final'
        }
      }
    }
  });

  const createPlugin = async (options: Record<string, unknown> = {}) => {
    const database = createDatabaseForTest('suite=plugins/state-machine-coverage-edges');
    await database.connect();

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: buildMachineConfig(),
      persistTransitions: false,
      ...options
    });

    await plugin.install(database);

    return { database, plugin };
  };

  const createInMemoryHistoryPlugin = async (resourceNames: Record<string, string>) => {
    const transitionLogResource = {
      query: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue(undefined)
    } as const;

    const stateResource = {
      delete: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue(undefined)
    } as const;

    const database = {
      createResource: vi.fn().mockResolvedValue(undefined),
      resources: {
        [resourceNames.transitionLog]: transitionLogResource,
        [resourceNames.states]: stateResource
      }
    };

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: buildMachineConfig(),
      persistTransitions: true,
      resourceNames
    });

    await plugin.install(database as any);

    return {
      database,
      plugin,
      transitionLogResource,
      stateResource
    };
  };

  it('throws when global concurrency conflict is invalid', () => {
    expect(() => {
      new StateMachinePlugin({
        logLevel: 'silent',
        stateMachines: buildMachineConfig(),
        concurrency: {
          conflict: 'invalid' as any
        }
      });
    }).toThrow(/Invalid global concurrency conflict policy/);
  });

  it('returns GUARD_NOT_FOUND with missing guard action', async () => {
    const database = createDatabaseForTest('suite=plugins/state-machine-coverage-edges-missing-guard');
    await database.connect();

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'pending',
          states: {
            pending: {
              on: {
                CONFIRM: 'confirmed'
              },
              guards: {
                CONFIRM: 'configuredGuard'
              }
            },
            confirmed: { type: 'final' }
          }
        }
      },
      guards: {
        configuredGuard: vi.fn().mockResolvedValue(true)
      }
    });

    await plugin.install(database);

    await plugin.initializeEntity('flow', 'entity-1');

    delete plugin.config.guards.configuredGuard;

    const result = await plugin.send('flow', 'entity-1', 'CONFIRM');

    expect(result).toMatchObject({
      ok: false,
      code: 'GUARD_NOT_FOUND',
      reason: 'GUARD_NOT_FOUND',
      details: {
        operation: 'guard-not-found'
      },
      guard: 'configuredGuard'
    });

    await database.disconnect();
  });

  it('returns ACTION_NOT_FOUND when state action is missing', async () => {
    const database = createDatabaseForTest('suite=plugins/state-machine-coverage-edges-missing-action');
    await database.connect();

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'pending',
          states: {
            pending: {
              on: {
                CONFIRM: 'confirmed'
              },
              exit: 'configuredAction'
            },
            confirmed: { type: 'final' }
          }
        }
      },
      actions: {
        configuredAction: vi.fn().mockResolvedValue({ action: 'ok' })
      }
    });

    await plugin.install(database);
    await plugin.initializeEntity('flow', 'entity-1');

    delete plugin.config.actions.configuredAction;

    const result = await plugin.send('flow', 'entity-1', 'CONFIRM');

    expect(result).toMatchObject({
      ok: false,
      code: 'HOOK_NOT_FOUND',
      reason: 'HOOK_NOT_FOUND',
      details: {
        operation: 'hook-not-found'
      }
    });

    await database.disconnect();
  });

  it('maps concurrency conflict when lock cannot be acquired (reject and drop)', async () => {
    const { database, plugin } = await createPlugin({
      concurrency: {
        conflict: 'reject'
      }
    });

    vi.spyOn(plugin as any, 'acquireTransitionLock').mockRejectedValue(
      new StateMachineError('lock busy', {
        operation: 'send',
        machineId: 'flow',
        entityId: 'entity-1',
        lockTimeout: 1000,
        workerId: 'default'
      })
    );
    await plugin.initializeEntity('flow', 'entity-1');

    const rejected = await plugin.send('flow', 'entity-1', 'CONFIRM');

    expect(rejected).toMatchObject({
      ok: false,
      code: 'CONCURRENCY_CONFLICT',
      reason: 'CONCURRENCY_CONFLICT'
    });

    const dropPluginConfig = {
      concurrency: {
        conflict: 'drop'
      }
    };

    const { database: dropDatabase, plugin: pluginDrop } = await createPlugin(dropPluginConfig);

    vi.spyOn(pluginDrop as any, 'acquireTransitionLock').mockRejectedValue(
      new StateMachineError('lock busy', {
        operation: 'send',
        machineId: 'flow',
        entityId: 'entity-1',
        lockTimeout: 1000,
        workerId: 'default'
      })
    );
    await pluginDrop.initializeEntity('flow', 'entity-1');

    const dropped = await pluginDrop.send('flow', 'entity-1', 'CONFIRM');

    expect(dropped).toMatchObject({
      ok: false,
      code: 'CONCURRENCY_CONFLICT',
      reason: 'CONCURRENCY_CONFLICT_DROP'
    });

    await database.disconnect();
    await dropDatabase.disconnect();
  });

  it('persists send if release lock fails in finally', async () => {
    const { database, plugin } = await createPlugin({});
    const lock = { name: 'send-lock' };
    const storage = {
      acquireLock: vi.fn().mockResolvedValue(lock),
      releaseLock: vi.fn().mockRejectedValue(new Error('release failed'))
    };

    vi.spyOn(plugin, 'getStorage').mockReturnValue(storage as any);
    await plugin.initializeEntity('flow', 'entity-1');

    const result = await plugin.send('flow', 'entity-1', 'CONFIRM');

    expect(result).toMatchObject({
      ok: true,
      from: 'pending',
      to: 'confirmed'
    });

    await database.disconnect();
  });

  it('evaluates all transition history branches and sort order in _getTransitionHistory', async () => {
    const resourceNames = {
      transitionLog: 'cov_transition_log',
      states: 'cov_state_resource'
    };

    const { plugin, transitionLogResource } = await createInMemoryHistoryPlugin(resourceNames);

    const allMachineTransitions = Array.from({ length: 1000 }, (_, index) => ({
      id: `hist-${index}`,
      machineId: 'flow',
      entityId: 'entity-1',
      fromState: 'pending',
      toState: 'confirmed',
      event: `E-${index}`,
      context: {},
      timestamp: index,
      createdAt: '2026-01-01'
    }));

    transitionLogResource.query
      .mockResolvedValueOnce(allMachineTransitions)
      .mockResolvedValueOnce([]);

    const all = await fetchTransitionHistory(plugin as any, 'flow', 'entity-1');

    expect(transitionLogResource.query).toHaveBeenCalledTimes(2);
    expect(all).toHaveLength(1000);
    expect(all[0].event).toBe('E-999');
    expect(all[all.length - 1].event).toBe('E-0');

    transitionLogResource.query.mockClear();

    const limited = [
      {
        id: 'limited-1',
        machineId: 'flow',
        entityId: 'entity-1',
        fromState: 'pending',
        toState: 'confirmed',
        event: 'LIMIT',
        context: {},
        timestamp: 900,
        createdAt: '2026-01-01'
      },
      {
        id: 'limited-2',
        machineId: 'flow',
        entityId: 'entity-1',
        fromState: 'pending',
        toState: 'confirmed',
        event: 'LIMIT2',
        context: {},
        timestamp: 800,
        createdAt: '2026-01-01'
      }
    ];

    transitionLogResource.query.mockResolvedValueOnce(limited);

    const limitedHistory = await fetchTransitionHistory(plugin as any, 'flow', 'entity-1', {
      limit: 2,
      offset: 1
    });

    expect(transitionLogResource.query).toHaveBeenCalledWith(
      {},
      {
        partition: 'byMachineEntity',
        partitionValues: {
          machineId: 'flow',
          entityId: 'entity-1'
        },
        limit: 2,
        offset: 1
      }
    );

    expect(limitedHistory).toHaveLength(2);
    expect(limitedHistory[0].event).toBe('LIMIT');
    expect(limitedHistory[1].event).toBe('LIMIT2');
  });

  it('falls back to initial state when persisted snapshot lookup fails', async () => {
    const { database, plugin } = await createPlugin({ persistTransitions: true });
    await plugin.initializeEntity('flow', 'entity-1');

    const stateResource = database.resources[plugin.config.stateResource];
    const machine = plugin.machines.get('flow');

    expect(machine).toBeDefined();
    machine.currentStates.clear();

    vi.spyOn(stateResource, 'get').mockRejectedValue(new Error('state lookup failed'));

    const state = await plugin.getState('flow', 'entity-1');
    expect(state).toBe('pending');

    await database.disconnect();
  });

  it('updates namespace-resolved resource names when namespace changes', () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: buildMachineConfig(),
      persistTransitions: false
    });

    const originalTransitionLog = plugin.resourceNames.transitionLog;
    plugin.setNamespace('team-prod');

    expect(plugin.resourceNames.transitionLog).not.toBe(originalTransitionLog);
    expect(plugin.resourceNames.transitionLog).toContain('team-prod');
    expect(plugin.config.transitionLogResource).toContain('team-prod');
  });

  it('handles exponential, linear and fixed backoff branches deterministically', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(calculateBackoff(1, {
      backoffStrategy: 'exponential',
      baseDelay: 100,
      maxDelay: 1000
    })).toBe(100);

    expect(calculateBackoff(2, {
      backoffStrategy: 'linear',
      baseDelay: 100,
      maxDelay: 1000
    })).toBe(200);

    expect(calculateBackoff(2, {
      backoffStrategy: 'fixed',
      baseDelay: 150,
      maxDelay: 120
    })).toBe(150);

    randomSpy.mockRestore();
  });

  it('parses invalid timestamp in toEpoch as zero', () => {
    expect(toEpoch('not-a-date')).toBe(0);
  });

  it('uses direct state name path in getValidEvents', async () => {
    const { database, plugin } = await createPlugin();

    const result = await plugin.getValidEvents('flow', 'pending');

    expect(result).toEqual(expect.arrayContaining(['CONFIRM']));

    await database.disconnect();
  });

  it('returns all transitions when getLastTransitions receives n <= 0', async () => {
    const { database, plugin } = await createPlugin({
        persistTransitions: true,
        stateMachines: {
          flow: {
          initialState: 'pending',
          states: {
            pending: { on: { GO: 'running' } },
            running: { on: { GO: 'running', DONE: 'completed' } },
            completed: { type: 'final' }
          }
        }
      }
    });

    await plugin.initializeEntity('flow', 'entity-1');
    await plugin.send('flow', 'entity-1', 'GO');
    await plugin.send('flow', 'entity-1', 'GO');
    await plugin.send('flow', 'entity-1', 'DONE');

    const all = await plugin.getLastTransitions('flow', 'entity-1');
    const zero = await plugin.getLastTransitions('flow', 'entity-1', 0);
    const negative = await plugin.getLastTransitions('flow', 'entity-1', -1);

    expect(all).toHaveLength(3);
    expect(all).toEqual(zero);
    expect(all).toEqual(negative);
    expect(all[0].event).toBe('DONE');
    expect(all[all.length - 1].event).toBe('GO');

    await database.disconnect();
  });

  it('returns empty transition history when persistence is disabled', async () => {
    const { database, plugin } = await createPlugin({
      persistTransitions: false
    });

    await plugin.initializeEntity('flow', 'entity-1');
    await plugin.send('flow', 'entity-1', 'CONFIRM');

    const transitions = await plugin.getTransitions('flow', 'entity-1');
    const transitionHistory = await plugin.getTransitionHistory('flow', 'entity-1');

    expect(transitions).toEqual([]);
    expect(transitionHistory).toEqual([]);

    await database.disconnect();
  });

  it('retries an action before transition succeeds when retry config says retriable', async () => {
    const database = createDatabaseForTest('suite=plugins/state-machine-coverage-retry');
    await database.connect();

    const retryAction = vi.fn()
      .mockRejectedValueOnce(new Error('temporary timeout'))
      .mockResolvedValue({ action: 'ok' });
    const onRetry = vi.fn().mockResolvedValue(undefined);

    const retryPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'pending',
          states: {
            pending: {
              on: { START: 'started' }
            },
            started: { type: 'final' }
          }
        }
      },
      actions: {
        retryAction
      },
      persistTransitions: false,
      retryConfig: {
        maxAttempts: 1,
        baseDelay: 0,
        onRetry
      }
    });

    await retryPlugin.install(database);
    await retryPlugin.initializeEntity('flow', 'entity-1');

    const result = await retryPlugin.executeAction('retryAction', {}, 'START', 'flow', 'entity-1');

    expect(result).toEqual({ action: 'ok' });
    expect(retryAction).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);

    await database.disconnect();
  });

  it('does not retry and returns error when action error is non-retriable', async () => {
    const database = createDatabaseForTest('suite=plugins/state-machine-coverage-nonretriable');
    await database.connect();

    const nonRetriableAction = vi.fn().mockImplementation(() => {
      const error = new Error('validation failed');
      error.name = 'StateMachineError';
      throw error;
    });

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'pending',
          states: {
            pending: {
              on: { START: 'started' },
              exit: 'nonRetriableAction'
            },
            started: { type: 'final' }
          }
        }
      },
      actions: {
        nonRetriableAction
      },
      persistTransitions: false,
      retryConfig: {
        maxAttempts: 1,
        baseDelay: 0
      }
    });

    await plugin.install(database);
    await plugin.initializeEntity('flow', 'entity-1');

    const result = await plugin.send('flow', 'entity-1', 'START');

    expect(result).toMatchObject({
      ok: false,
      code: 'INTERNAL_ERROR',
      reason: 'INTERNAL_ERROR'
    });
    expect(nonRetriableAction).toHaveBeenCalledTimes(1);

    const state = await plugin.getState('flow', 'entity-1');
    expect(state).toBe('pending');

    await database.disconnect();
  });

  it('falls back to state insert when state update fails during transition persistence', async () => {
    const stateResource = {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockRejectedValue(new Error('update failed')),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    } as const;

    const transitionResource = {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    } as const;

    const database = {
      createResource: vi.fn().mockResolvedValue(undefined),
      resources: {
        plg_entity_states: stateResource,
        plg_state_transitions: transitionResource
      }
    } as const;

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'pending',
          states: {
            pending: { on: { NEXT: 'done' } },
            done: { type: 'final' }
          }
        }
      },
      persistTransitions: true,
      concurrency: {
        mode: 'parallel'
      },
    });

    await plugin.install(database as any);

    await plugin.initializeEntity('flow', 'entity-1');

    const result = await plugin.send('flow', 'entity-1', 'NEXT');

    expect(result).toMatchObject({
      ok: true,
      from: 'pending',
      to: 'done'
    });
    expect(stateResource.update).toHaveBeenCalledTimes(1);
    expect(stateResource.insert).toHaveBeenCalledTimes(2);
    expect(transitionResource.insert).toHaveBeenCalledTimes(1);
  });

  it('returns [] when transition history query fails', async () => {
    const { plugin, transitionLogResource } = await createInMemoryHistoryPlugin({
      transitionLog: 'plg_state_transitions',
      states: 'plg_entity_states'
    });

    transitionLogResource.query.mockRejectedValueOnce(new Error('query failed'));

    const result = await fetchTransitionHistory(plugin as any, 'flow', 'entity-1');

    expect(result).toEqual([]);
  });

  it('returns null when getTransition is called with persistence disabled', async () => {
    const { database, plugin } = await createPlugin({
      persistTransitions: false
    });

    await plugin.initializeEntity('flow', 'entity-1');

    const transition = await plugin.getTransition('flow', 'entity-1', 'any-transition-id');

    expect(transition).toBeNull();

    await database.disconnect();
  });

  it('supports canTransition on resource state helper', async () => {
    const database = createDatabaseForTest('suite=plugins/state-machine-resource-can-transition');
    await database.connect();

    await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        currentState: 'string|required',
        customerId: 'string|default:unknown'
      },
      behavior: 'body-only'
    });

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'pending',
          states: {
            pending: { on: { CONFIRM: 'confirmed' } },
            confirmed: { type: 'final' }
          },
          resource: 'orders'
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);
    await plugin.initializeEntity('flow', 'entity-1');

    const resource = database.resources.orders;
    expect(await resource.state.canTransition('entity-1', 'CONFIRM')).toBe(true);
    expect(await resource.state.canTransition('entity-1', 'REJECT')).toBe(false);

    await database.disconnect();
  });

  it('attaches state API to resource via $schema.stateMachine shorthand', async () => {
    const database = createDatabaseForTest('suite=plugins/state-machine-resource-schema-stateMachine-shorthand');
    await database.connect();

    const orders = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        status: 'string|required'
      },
      behavior: 'body-only'
    }) as ResourceWithSchema;

    orders.$schema = {
      stateMachine: 'flow'
    };

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'pending',
          states: {
            pending: {
              on: {
                CONFIRM: 'confirmed'
              }
            },
            confirmed: {
              type: 'final'
            }
          }
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);
    await orders.insert({ id: 'order-1', status: 'pending' });

    const transition = await orders.state.send('order-1', 'CONFIRM');
    const current = await orders.state.get('order-1');
    const stored = await orders.get('order-1') as { status?: string };

    expect(orders.state).toBeDefined();
    expect(typeof orders.state.send).toBe('function');
    expect(transition).toMatchObject({ ok: true, from: 'pending', to: 'confirmed' });
    expect(current).toBe('confirmed');
    expect(stored?.status).toBe('confirmed');

    await database.disconnect();
  });

  it('reads stateField + autoCleanup from $schema.stateMachine object binding', async () => {
    const database = createDatabaseForTest('suite=plugins/state-machine-resource-schema-stateMachine-object');
    await database.connect();

    const orders = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        workflowState: 'string|required',
        status: 'string|required'
      },
      behavior: 'body-only'
    }) as ResourceWithSchema;

    orders.$schema = {
      stateMachine: {
        machine: 'flow',
        stateField: 'workflowState',
        autoCleanup: false
      }
    };

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'draft',
          states: {
            draft: {
              on: {
                SEND: 'sent'
              }
            },
            sent: {
              type: 'final'
            }
          }
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);
    const machine = await plugin.getMachineDefinition('flow');

    await orders.insert({ id: 'order-1', status: 'open', workflowState: 'draft' });

    const transition = await orders.state.send('order-1', 'SEND');
    const stored = await orders.get('order-1') as { workflowState?: string; status?: string };

    expect(machine?.autoCleanup).toBe(false);
    expect(transition).toMatchObject({ ok: true, from: 'draft', to: 'sent' });
    expect(stored?.workflowState).toBe('sent');
    expect(stored?.status).toBe('open');

    await database.disconnect();
  });

  it('preserves only one resource.state binding while keeping plugin-level machines available', async () => {
    const database = createDatabaseForTest('suite=plugins/state-machine-resource-schema-stateMachine-plugin-machine-multi');
    await database.connect();

    const orders = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        status: 'string|required'
      },
      behavior: 'body-only'
    }) as ResourceWithSchema;

    orders.$schema = {
      stateMachine: 'flow'
    };

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'pending',
          states: {
            pending: {
              on: {
                CONFIRM: 'confirmed'
              }
            },
            confirmed: {
              type: 'final'
            }
          }
        },
        audit: {
          initialState: 'started',
          states: {
            started: {
              on: {
                LOG: 'done'
              }
            },
            done: {
              type: 'final'
            }
          }
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);

    expect(plugin.getMachines().sort()).toEqual(['audit', 'flow']);
    await orders.insert({ id: 'order-1', status: 'pending' });

    const transition = await orders.state.send('order-1', 'CONFIRM');
    const stored = await orders.get('order-1') as { status?: string };
    const manualTransition = await plugin.send('audit', 'order-1', 'LOG');

    expect(transition).toMatchObject({ ok: true, from: 'pending', to: 'confirmed' });
    expect(stored?.status).toBe('confirmed');
    expect(manualTransition).toMatchObject({ ok: true, from: 'started', to: 'done' });

    await database.disconnect();
  });

  it('getMachineDefinitionDiagnostics returns null for missing machine', async () => {
    const { plugin } = await createPlugin({ persistTransitions: false });

    expect(plugin.getMachineDefinitionDiagnostics('missing-machine')).toBeNull();
    expect(plugin.getMachineDefinition('missing-machine')).toBeNull();
  });

});
