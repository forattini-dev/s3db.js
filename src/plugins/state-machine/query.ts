import type { StateMachinePluginContext, StateRecord, TransitionRecord, RawTransitionRecord, TransitionHistoryEntry, TransitionHistoryOptions, TransitionQueryOptions, StateMachineSnapshot, QueryOptions } from './types.js';
import { TRANSITION_HISTORY_PAGE_SIZE } from './types.js';
import { StateMachineError } from '../state-machine.errors.js';
import { toEpoch, normalizeTransitionRecord, applyTransitionFilters, sortTransitions } from './helpers.js';
import tryFn from '../../concerns/try-fn.js';

export async function getState(plugin: StateMachinePluginContext, machineId: string, entityId: string): Promise<string> {
  const snapshot = await plugin.getStateSnapshot(machineId, entityId);
  return snapshot.state;
}

export async function getValidEvents(plugin: StateMachinePluginContext, machineId: string, stateOrEntityId: string): Promise<string[]> {
  const machine = plugin.machines.get(machineId);
  if (!machine) {
    throw new StateMachineError(`State machine '${machineId}' not found`, {
      operation: 'getValidEvents',
      machineId,
      availableMachines: Array.from(plugin.machines.keys()),
      suggestion: 'Check machine ID or use getMachines() to list available machines'
    });
  }

  let state: string;
  if (machine.config.states[stateOrEntityId]) {
    state = stateOrEntityId;
  } else {
    state = await getState(plugin, machineId, stateOrEntityId);
  }

  const stateConfig = machine.config.states[state];
  const wildcardConfig = machine.config.states['*'];
  const stateEvents = stateConfig?.on ? Object.keys(stateConfig.on) : [];
  const wildcardEvents = (wildcardConfig?.on && stateConfig?.type !== 'final') ? Object.keys(wildcardConfig.on) : [];
  return [...new Set([...stateEvents, ...wildcardEvents])];
}

export async function getTransitions(plugin: StateMachinePluginContext, machineId: string, entityId: string, options: TransitionQueryOptions = {}): Promise<TransitionHistoryEntry[]> {
  const limit = options.limit;
  const offset = options.offset || 0;
  const sort = options.sort || 'desc';
  const includeFilters = applyTransitionFilters(
    await fetchTransitionHistory(plugin, machineId, entityId, {}),
    {
      from: options.from,
      to: options.to,
      event: options.event,
      fromState: options.fromState,
      toState: options.toState
    }
  );

  const sorted = sortTransitions(includeFilters, sort);

  if (typeof limit !== 'number') {
    return sorted.slice(offset);
  }

  return sorted.slice(offset, offset + limit);
}

export async function getTransitionHistory(plugin: StateMachinePluginContext, machineId: string, entityId: string, options: TransitionHistoryOptions = {}): Promise<TransitionHistoryEntry[]> {
  const { limit = 50, offset = 0 } = options;
  return getTransitions(plugin, machineId, entityId, { limit, offset, sort: 'desc' });
}

export async function getTransitionCount(
  plugin: StateMachinePluginContext,
  machineId: string,
  entityId: string,
  options: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'> = {}
): Promise<number> {
  const transitions = await getTransitions(plugin, machineId, entityId, options);
  return transitions.length;
}

export async function getSnapshot(plugin: StateMachinePluginContext, machineId: string, entityId: string): Promise<StateMachineSnapshot> {
  const snapshot = await plugin.getStateSnapshot(machineId, entityId);
  const defaultResult: StateMachineSnapshot = {
    machineId,
    entityId,
    state: snapshot.state,
    stateVersion: snapshot.version,
    context: {},
    lastTransition: null,
    triggerCounts: {},
    updatedAt: new Date().toISOString(),
    persisted: false
  };

  const stateResource = plugin.getStateResource();
  if (!stateResource) {
    return defaultResult;
  }

  const stateId = `${machineId}_${entityId}`;
  const [ok, , stateRecord] = await tryFn<StateRecord>(() =>
    stateResource.get(stateId) as unknown as Promise<StateRecord>
  );

  if (!ok || !stateRecord) {
    return defaultResult;
  }

  return {
    machineId,
    entityId,
    state: stateRecord.currentState,
    stateVersion: typeof stateRecord.stateVersion === 'number' ? stateRecord.stateVersion : snapshot.version,
    context: stateRecord.context || {},
    lastTransition: stateRecord.lastTransition || null,
    triggerCounts: stateRecord.triggerCounts || {},
    updatedAt: stateRecord.updatedAt,
    persisted: true
  };
}

export async function getTransition(plugin: StateMachinePluginContext, machineId: string, entityId: string, transitionId: string): Promise<TransitionHistoryEntry | null> {
  if (!plugin.config.persistTransitions) {
    return null;
  }

  const transitionLogResource = plugin.getTransitionLogResource();
  if (!transitionLogResource) {
    plugin.logger.warn({ machineId, entityId, transitionId }, 'Transition log resource unavailable');
    return null;
  }

  const [ok, err, transition] = await tryFn<TransitionRecord>(() =>
    transitionLogResource.get(transitionId) as unknown as Promise<TransitionRecord>
  );

  if (!ok || !transition) {
    return null;
  }

  if (transition.machineId !== machineId || transition.entityId !== entityId) {
    return null;
  }

  return normalizeTransitionRecord(transition);
}

export async function getLastTransitions(plugin: StateMachinePluginContext, machineId: string, entityId: string, n?: number): Promise<TransitionHistoryEntry[]> {
  if (typeof n === 'number' && n > 0) {
    return getTransitions(plugin, machineId, entityId, { limit: n, offset: 0, sort: 'desc' });
  }

  return getTransitions(plugin, machineId, entityId, { sort: 'desc' });
}

export async function fetchTransitionHistory(plugin: StateMachinePluginContext, machineId: string, entityId: string, options: QueryOptions = {}): Promise<TransitionHistoryEntry[]> {
  if (!plugin.config.persistTransitions) {
    return [];
  }

  const transitionLogResource = plugin.getTransitionLogResource();

  if (!transitionLogResource) {
    plugin.logger.warn({ machineId, entityId }, 'Transition log resource unavailable');
    return [];
  }

  const basePartitionQuery = {
    partition: 'byMachineEntity',
    partitionValues: { machineId, entityId }
  };

  const normalize = (transitions: RawTransitionRecord[]): TransitionHistoryEntry[] =>
    (transitions || [])
      .sort((a, b) => toEpoch(b.timestamp) - toEpoch(a.timestamp))
      .map(t => ({
        from: t.fromState,
        to: t.toState,
        event: t.event,
        context: t.context,
        timestamp: new Date(toEpoch(t.timestamp)).toISOString()
      }));

  if (typeof options.limit === 'number') {
    const [ok, err, transitions] = await tryFn<RawTransitionRecord[]>(() =>
      transitionLogResource.query(
        {},
        {
          ...basePartitionQuery,
          limit: options.limit,
          offset: options.offset
        }
      ) as unknown as Promise<RawTransitionRecord[]>
    );

    if (!ok) {
      plugin.logger.warn({ machineId, entityId, error: (err as Error).message }, `Failed to get transition history: ${(err as Error).message}`);
      return [];
    }

    return normalize(transitions || []);
  }

  const allTransitions: RawTransitionRecord[] = [];
  let offset = 0;

  while (true) {
    const [ok, err, transitions] = await tryFn<RawTransitionRecord[]>(() =>
      transitionLogResource.query(
        {},
        {
          ...basePartitionQuery,
          limit: TRANSITION_HISTORY_PAGE_SIZE,
          offset
        }
      ) as unknown as Promise<RawTransitionRecord[]>
    );

    if (!ok) {
      plugin.logger.warn({ machineId, entityId, error: (err as Error).message }, `Failed to get transition history: ${(err as Error).message}`);
      return normalize(allTransitions);
    }

    const chunk = transitions || [];
    if (chunk.length === 0) {
      break;
    }

    allTransitions.push(...chunk);

    if (chunk.length < TRANSITION_HISTORY_PAGE_SIZE) {
      break;
    }

    offset += chunk.length;
  }

  return normalize(allTransitions);
}
