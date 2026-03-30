import type { StateMachinePluginContext, Resource, TransitionHistoryOptions, TransitionQueryOptions, TransitionResult, TransitionHistoryEntry, StateMachineSnapshot, MachineProxy, TransitionContext, StateRecord } from './types.js';
import { TRANSITION_HISTORY_PAGE_SIZE } from './types.js';
import { StateMachineError } from '../state-machine.errors.js';
import tryFn from '../../concerns/try-fn.js';

export async function attachStateMachinesToResources(plugin: StateMachinePluginContext): Promise<void> {
  const resourceStateMachineBindingMap = new Map<string, string>();

  for (const [machineName, machineData] of plugin.machines.entries()) {
    const resourceConfig = machineData.config;

    if (!resourceConfig.resource) {
      plugin.logger.debug({ machineName }, `Machine '${machineName}' has no resource configured, skipping attachment`);
      continue;
    }

    let resource: Resource | undefined;
    if (typeof resourceConfig.resource === 'string') {
      resource = plugin.database.resources[resourceConfig.resource] as unknown as Resource | undefined;
      if (!resource) {
        plugin.logger.warn(
          { machineName, resourceName: resourceConfig.resource },
          `Resource '${resourceConfig.resource}' not found for machine '${machineName}'. Resource API will not be available.`
        );
        continue;
      }
    } else {
      resource = resourceConfig.resource as Resource;
    }

    const machineProxy: MachineProxy = {
      send: async (id: string, event: string, eventData?: Record<string, unknown>) => {
        return plugin.send(machineName, id, event, eventData || {});
      },
      getState: async (id: string) => {
        return plugin.getState(machineName, id);
      },
      canTransition: async (id: string, event: string) => {
        const validEvents = await plugin.getValidEvents(machineName, id);
        return validEvents.includes(event);
      },
      getValidEvents: async (id: string) => {
        return plugin.getValidEvents(machineName, id);
      },
      initializeEntity: async (id: string, context?: Record<string, unknown>) => {
        return plugin.initializeEntity(machineName, id, context || {});
      },
      getTransitionHistory: async (id: string, options?: TransitionHistoryOptions) => {
        return plugin.getTransitionHistory(machineName, id, options);
      },
      transitions: async (id: string, options?: TransitionQueryOptions) => {
        return plugin.getTransitions(machineName, id, options);
      },
      transition: async (id: string, transitionId: string) => {
        return plugin.getTransition(machineName, id, transitionId);
      },
      getTransition: async (id: string, transitionId: string) => {
        return plugin.getTransition(machineName, id, transitionId);
      },
      transitionCount: async (id: string, options?: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>) => {
        return plugin.getTransitionCount(machineName, id, options);
      },
      getLastTransitions: async (id: string, limit?: number) => {
        return plugin.getLastTransitions(machineName, id, limit);
      },
      getTransitions: async (id: string, options?: TransitionQueryOptions) => {
        return plugin.getTransitions(machineName, id, options);
      },
      getTransitionCount: async (id: string, options?: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>) => {
        return plugin.getTransitionCount(machineName, id, options);
      },
      getSnapshot: async (id: string) => {
        return plugin.getSnapshot(machineName, id);
      },
      snapshot: async (id: string) => {
        return plugin.getSnapshot(machineName, id);
      },
      deleteEntity: async (id: string) => {
        return plugin.deleteEntity(machineName, id);
      }
    };

    const existingMachine = resourceStateMachineBindingMap.get(resource.name);
    if (existingMachine && existingMachine !== machineName) {
      throw new StateMachineError(`Resource '${resource.name}' already has state machine '${existingMachine}' attached. A resource can expose only one resource.state binding.`, {
        operation: 'attachStateMachinesToResources',
        resourceName: resource.name,
        machineName,
        existingMachine
      });
    }

    resourceStateMachineBindingMap.set(resource.name, machineName);
    (resource as Resource & { _stateMachine: MachineProxy })._stateMachine = machineProxy;

    Object.defineProperty(resource, 'state', {
      get: () => ({
        send: async (id: string, event: string, eventData?: Record<string, unknown>) => machineProxy.send(id, event, eventData),
        get: async (id: string) => machineProxy.getState(id),
        canTransition: async (id: string, event: string) => machineProxy.canTransition(id, event),
        getValidEvents: async (id: string) => machineProxy.getValidEvents(id),
        initialize: async (id: string, context?: Record<string, unknown>) => machineProxy.initializeEntity(id, context),
        history: async (id: string, options?: TransitionHistoryOptions) => machineProxy.getTransitionHistory(id, options),
        transitions: async (id: string, options?: TransitionQueryOptions) => machineProxy.transitions(id, options),
        transition: async (id: string, transitionId: string) => machineProxy.transition(id, transitionId),
        transitionCount: async (id: string, options?: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>) => machineProxy.transitionCount(id, options),
        getLastTransitions: async (id: string, limit?: number) => machineProxy.getLastTransitions(id, limit),
        snapshot: async (id: string) => machineProxy.snapshot(id),
        delete: async (id: string) => machineProxy.deleteEntity(id)
      }),
      configurable: true,
      enumerable: false
    });

    if (resourceConfig.autoCleanup !== false) {
      const resourceWithHooks = resource as Resource & { addHook?: (event: string, handler: (data: Record<string, unknown>) => Promise<Record<string, unknown>>) => void };
      if (typeof resourceWithHooks.addHook === 'function') {
        resourceWithHooks.addHook('afterDelete', async (data: Record<string, unknown>) => {
          const entityId = data.id as string;
          if (entityId) {
            await tryFn(() => plugin.deleteEntity(machineName, entityId));
          }
          return data;
        });
        plugin.logger.debug({ machineName, resourceName: resource.name }, `Registered autoCleanup hook for machine '${machineName}'`);
      }
    }

    plugin.logger.debug({ machineName, resourceName: resource.name }, `Attached machine '${machineName}' to resource '${resource.name}'`);
  }
}

export async function initializeEntity(plugin: StateMachinePluginContext, machineId: string, entityId: string, context: Record<string, unknown> = {}): Promise<string> {
  const machine = plugin.machines.get(machineId);
  if (!machine) {
    throw new StateMachineError(`State machine '${machineId}' not found`, {
      operation: 'initializeEntity',
      machineId,
      availableMachines: Array.from(plugin.machines.keys()),
      suggestion: 'Check machine ID or use getMachines() to list available machines'
    });
  }

  const initialState = machine.config.initialState;
  machine.currentStates.set(entityId, initialState);

  if (plugin.config.persistTransitions) {
    const now = new Date().toISOString();
    const stateId = `${machineId}_${entityId}`;
    const stateResource = plugin.getStateResource();

    if (!stateResource) {
      plugin.logger.warn({ machineId, entityId }, 'State resource unavailable during initializeEntity. Initial state will be kept in memory only.');
    } else {
      const [ok, err] = await tryFn(() =>
        stateResource.insert({
          id: stateId,
          machineId,
          entityId,
          currentState: initialState,
          stateVersion: 0,
          context,
          lastTransition: null,
          updatedAt: now
        })
      );

      if (!ok && err && !(err as Error).message?.includes('already exists')) {
        throw new StateMachineError('Failed to initialize entity state', {
          operation: 'initializeEntity',
          machineId,
          entityId,
          initialState,
          original: err,
          suggestion: 'Check state resource configuration and database permissions'
        });
      }
    }
  }

  plugin.setInMemoryState(machineId, entityId, initialState, 0);

  const initialStateConfig = machine.config.states[initialState];
  const initAfterEnterHooks = plugin.resolveHooks(initialStateConfig, 'afterEnter', 'entry');
  if (initAfterEnterHooks.length > 0) {
    await plugin.executeHooks(
      initAfterEnterHooks,
      context,
      'INIT',
      machineId,
      entityId,
      { machineId, entityId, event: 'INIT', from: undefined, to: initialState } as Partial<TransitionContext>,
      { cancellable: false, hookLabel: 'after-enter', stateName: initialState }
    );
  }

  plugin.emit('plg:state-machine:entity-initialized', { machineId, entityId, initialState });

  await plugin.executeMachineHooks(
    machineId, 'afterInitialize', context, 'INIT', entityId,
    { machineId, entityId, event: 'INIT', from: undefined, to: initialState } as Partial<TransitionContext>,
    { cancellable: false }
  );

  return initialState;
}

export async function deleteEntity(plugin: StateMachinePluginContext, machineId: string, entityId: string): Promise<void> {
  const machine = plugin.machines.get(machineId);
  if (!machine) {
    throw new StateMachineError(`State machine '${machineId}' not found`, {
      operation: 'deleteEntity',
      machineId,
      availableMachines: Array.from(plugin.machines.keys()),
      suggestion: 'Check machine ID or use getMachines() to list available machines'
    });
  }

  const stateId = `${machineId}_${entityId}`;

  machine.currentStates.delete(entityId);
  machine.currentStateVersions.delete(entityId);

  const stateResource = plugin.getStateResource();
  if (stateResource) {
    await tryFn(() =>
      stateResource.delete(stateId)
    );
  }

  if (plugin.config.persistTransitions) {
    const transitionLogResource = plugin.getTransitionLogResource();

    if (!transitionLogResource) {
      plugin.logger.debug({ machineId, entityId }, 'Skipping transition history cleanup because transition log resource is unavailable');
      plugin.emit('plg:state-machine:entity-deleted', { machineId, entityId });
      await plugin.executeMachineHooks(machineId, 'afterDelete', {}, 'DELETE', entityId,
        { machineId, entityId, event: 'DELETE', from: undefined, to: undefined } as Partial<TransitionContext>,
        { cancellable: false });
      return;
    }

    const transitionPartition = {
      partition: 'byMachineEntity',
      partitionValues: { machineId, entityId }
    };

    while (true) {
      const [ok, , transitions] = await tryFn<Record<string, unknown>[]>(() =>
        transitionLogResource.query(
          {},
          {
            ...transitionPartition,
            limit: TRANSITION_HISTORY_PAGE_SIZE,
            offset: 0
          }
        ) as unknown as Promise<Record<string, unknown>[]>
      );

      if (!ok || !transitions || transitions.length === 0) {
        break;
      }

      await Promise.all(
        transitions.map(t =>
          tryFn(() =>
            transitionLogResource.delete(t.id as string)
          )
        )
      );

      if (transitions.length < TRANSITION_HISTORY_PAGE_SIZE) {
        break;
      }
    }
  }

  plugin.logger.debug({ machineId, entityId }, `Deleted entity state and history`);
  plugin.emit('plg:state-machine:entity-deleted', { machineId, entityId });
  await plugin.executeMachineHooks(machineId, 'afterDelete', {}, 'DELETE', entityId,
    { machineId, entityId, event: 'DELETE', from: undefined, to: undefined } as Partial<TransitionContext>,
    { cancellable: false });
}
