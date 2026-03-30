import type { StateMachineConfig, MachineData, StateRecord, Resource, Lock, PluginStorage, ResourceNames, ResourceConfig } from './types.js';
import { StateMachineError } from '../state-machine.errors.js';
import tryFn from '../../concerns/try-fn.js';

export interface PersistencePluginContext {
  config: StateMachineConfig;
  machines: Map<string, MachineData>;
  database: any;
  logger: any;
  getStorage(): PluginStorage;
}

export function getStateResource(plugin: PersistencePluginContext): Resource | null {
  if (!plugin.config.persistTransitions || !plugin.database?.resources) {
    return null;
  }

  return (plugin.database.resources[plugin.config.stateResource] as Resource | undefined) || null;
}

export function getTransitionLogResource(plugin: PersistencePluginContext): Resource | null {
  if (!plugin.config.persistTransitions || !plugin.database?.resources) {
    return null;
  }

  return (plugin.database.resources[plugin.config.transitionLogResource] as Resource | undefined) || null;
}

export async function getStateSnapshot(plugin: PersistencePluginContext, machineId: string, entityId: string): Promise<{ state: string; version: number }> {
  const machine = plugin.machines.get(machineId);
  if (!machine) {
    throw new StateMachineError(`Machine '${machineId}' not found`, {
      operation: 'state-snapshot',
      machineId,
      entityId,
      suggestion: 'Check machine ID or use getMachines() to list available machines'
    });
  }

  if (machine.currentStates.has(entityId)) {
    return {
      state: machine.currentStates.get(entityId)!,
      version: machine.currentStateVersions.get(entityId) || 0
    };
  }

  if (plugin.config.persistTransitions && getStateResource(plugin)) {
    const stateId = `${machineId}_${entityId}`;
    const [ok, , stateRecord] = await tryFn<StateRecord>(() =>
      getStateResource(plugin)!.get(stateId) as unknown as Promise<StateRecord>
    );

    if (ok && stateRecord) {
      const stateVersion = typeof stateRecord.stateVersion === 'number' ? stateRecord.stateVersion : 0;
      machine.currentStates.set(entityId, stateRecord.currentState);
      machine.currentStateVersions.set(entityId, stateVersion);
      return {
        state: stateRecord.currentState,
        version: stateVersion
      };
    }
  }

  const initialState = machine.config.initialState;
  machine.currentStates.set(entityId, initialState);
  machine.currentStateVersions.set(entityId, 0);
  return {
    state: initialState,
    version: 0
  };
}

export function setInMemoryState(plugin: PersistencePluginContext, machineId: string, entityId: string, state: string, stateVersion: number): void {
  const machine = plugin.machines.get(machineId);
  if (!machine) {
    return;
  }

  machine.currentStates.set(entityId, state);
  machine.currentStateVersions.set(entityId, stateVersion);
}

export async function persistTransition(
  plugin: PersistencePluginContext,
  machineId: string,
  entityId: string,
  fromState: string,
  toState: string,
  event: string,
  context: Record<string, unknown>,
  fromStateVersion?: number
): Promise<number> {
  const timestamp = new Date().toISOString();
  const now = new Date().toISOString();

  const machine = plugin.machines.get(machineId)!;
  const transitionId = `${machineId}_${entityId}_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
  const stateId = `${machineId}_${entityId}`;
  const nextStateVersion = (typeof fromStateVersion === 'number' ? fromStateVersion : (machine.currentStateVersions.get(entityId) || 0)) + 1;
  const stateData: Record<string, unknown> = {
    machineId,
    entityId,
    currentState: toState,
    stateVersion: nextStateVersion,
    lastTransition: transitionId,
    updatedAt: now
  };

  const stateResource = getStateResource(plugin);
  const transitionLogResource = getTransitionLogResource(plugin);

  if (stateResource) {
    if (typeof fromStateVersion === 'number') {
      const [snapshotOk, , persistedRecord] = await tryFn(() =>
        stateResource.get(stateId) as unknown as Promise<StateRecord>
      );
      if (snapshotOk && persistedRecord && typeof persistedRecord.stateVersion === 'number' && persistedRecord.stateVersion !== fromStateVersion) {
        throw new StateMachineError('State version changed before transition could be applied', {
          operation: 'state-version-mismatch',
          machineId,
          entityId,
          expectedStateVersion: fromStateVersion,
          actualStateVersion: persistedRecord.stateVersion
        });
      }
    }

    let persisted = false;
    let lastStateErr: Error | undefined;

    for (let attempt = 0; attempt < plugin.config.retryAttempts; attempt++) {
      let [updateOk, updateErr] = await tryFn(() => stateResource.update(stateId, stateData));

      if (!updateOk) {
        const [insertOk, insertErr] = await tryFn(() =>
          stateResource.insert({
            id: stateId,
            ...stateData
          })
        );

        if (!insertOk) {
          lastStateErr = insertErr as Error;

          if (attempt < plugin.config.retryAttempts - 1) {
            const delay = plugin.config.retryDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        updateOk = insertOk;
        updateErr = insertErr;
      }

      if (updateOk) {
        persisted = true;
        break;
      }

      lastStateErr = updateErr as Error;
    }

    if (!persisted) {
      throw new StateMachineError('Failed to persist entity state transition', {
        operation: 'transition-state-persist',
        machineId,
        entityId,
        fromState,
        targetState: toState,
        event,
        original: lastStateErr,
        suggestion: 'Check state resource configuration and database permissions'
      });
    }
  } else if (plugin.config.persistTransitions) {
    plugin.logger.warn({
      machineId,
      entityId,
      reason: 'state resource unavailable'
    }, 'State resource is unavailable. Continuing with in-memory state only.');
  }

  if (transitionLogResource) {
    let logOk = false;
    let lastLogErr: Error | undefined;

    for (let attempt = 0; attempt < plugin.config.retryAttempts; attempt++) {
      const [ok, err] = await tryFn(() =>
        transitionLogResource.insert({
          id: transitionId,
          machineId,
          entityId,
          fromState,
          toState,
          event,
          context,
          timestamp,
          createdAt: now.slice(0, 10)
        })
      );

      if (ok) {
        logOk = true;
        break;
      }

      lastLogErr = err as Error;

      if (attempt < plugin.config.retryAttempts - 1) {
        const delay = plugin.config.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!logOk && lastLogErr) {
      plugin.logger.warn({
        machineId,
        entityId,
        attempts: plugin.config.retryAttempts,
        error: lastLogErr.message
      }, `Failed to log transition after ${plugin.config.retryAttempts} attempts: ${lastLogErr.message}`);
    }
  }

  await syncResourceStateField(plugin, machineId, entityId, toState);

  machine.currentStates.set(entityId, toState);
  machine.currentStateVersions.set(entityId, nextStateVersion);

  return nextStateVersion;
}

export async function syncResourceStateField(plugin: PersistencePluginContext, machineId: string, entityId: string, state: string): Promise<void> {
  const machine = plugin.machines.get(machineId);
  if (!machine) return;

  const resourceConfig = machine.config;
  if (!resourceConfig.resource || !resourceConfig.stateField) return;

  let resource: Resource;
  if (typeof resourceConfig.resource === 'string') {
    resource = await plugin.database.getResource(resourceConfig.resource) as unknown as Resource;
  } else {
    resource = resourceConfig.resource as Resource;
  }

  if (!resource) return;

  const [ok] = await tryFn(() =>
    resource.patch(entityId, { [resourceConfig.stateField!]: state })
  );

  if (!ok) {
    plugin.logger.warn({ machineId, entityId, state }, `Failed to update resource stateField for entity ${entityId}`);
  }
}

export async function getAttachedResource(plugin: PersistencePluginContext, machineId: string): Promise<Resource | null> {
  const machine = plugin.machines.get(machineId);
  if (!machine) return null;

  const resourceConfig = machine.config;
  if (!resourceConfig.resource) return null;

  if (typeof resourceConfig.resource === 'string') {
    const resource = await plugin.database.getResource(resourceConfig.resource) as unknown as Resource | null;
    return resource || null;
  }

  return resourceConfig.resource as Resource;
}

export async function createStateResources(plugin: PersistencePluginContext): Promise<void> {
  const [logOk, logErr] = await tryFn(() => plugin.database.createResource({
    name: plugin.config.transitionLogResource,
    attributes: {
      id: 'string|required',
      machineId: 'string|required',
      entityId: 'string|required',
      fromState: 'string',
      toState: 'string|required',
      event: 'string|required',
      context: 'json',
      timestamp: 'datetime|required',
      createdAt: 'dateonly|required'
    },
    behavior: 'body-only',
    partitions: {
      byMachine: { fields: { machineId: 'string' } },
      byEntity: { fields: { entityId: 'string' } },
      byMachineEntity: { fields: { machineId: 'string', entityId: 'string' } },
      byDate: { fields: { createdAt: 'dateonly' } }
    }
  }));

  if (!logOk && !getTransitionLogResource(plugin)) {
    plugin.logger.warn({
      machineResource: plugin.config.transitionLogResource,
      error: (logErr as Error)?.message
    }, `Failed to create transition log resource for state machine plugin: ${(logErr as Error)?.message || 'unknown error'}`);
  }

  const [stateOk, stateErr] = await tryFn(() => plugin.database.createResource({
    name: plugin.config.stateResource,
    attributes: {
      id: 'string|required',
      machineId: 'string|required',
      entityId: 'string|required',
      currentState: 'string|required',
      context: 'json|default:{}',
      lastTransition: 'string|default:null',
      stateVersion: 'number|default:0',
      triggerCounts: 'json|default:{}',
      updatedAt: 'datetime|required'
    },
    behavior: 'body-only'
  }));

  if (!stateOk && !getStateResource(plugin)) {
    plugin.logger.warn({
      machineResource: plugin.config.stateResource,
      error: (stateErr as Error)?.message
    }, `Failed to create state resource for state machine plugin: ${(stateErr as Error)?.message || 'unknown error'}`);
  }
}

export async function acquireTransitionLock(plugin: PersistencePluginContext, machineId: string, entityId: string): Promise<Lock | null> {
  const storage = plugin.getStorage();
  const lockName = `transition-${machineId}-${entityId}`;

  const lock = await storage.acquireLock(lockName, {
    ttl: plugin.config.lockTTL,
    timeout: plugin.config.lockTimeout,
    workerId: plugin.config.workerId
  });

  if (!lock) {
    throw new StateMachineError('Could not acquire transition lock - concurrent transition in progress', {
      operation: 'send',
      machineId,
      entityId,
      lockTimeout: plugin.config.lockTimeout,
      workerId: plugin.config.workerId,
      suggestion: 'Wait for current transition to complete or increase lockTimeout'
    });
  }

  return lock;
}

export async function releaseTransitionLock(plugin: PersistencePluginContext, lock: Lock | null): Promise<void> {
  if (!lock) return;

  const storage = plugin.getStorage();
  const [ok, err] = await tryFn(() => storage.releaseLock(lock));

  if (!ok) {
    plugin.logger.warn({ lockName: lock?.name, error: (err as Error).message }, `Failed to release lock '${lock?.name}': ${(err as Error).message}`);
  }
}
