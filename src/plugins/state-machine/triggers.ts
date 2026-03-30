import type { StateMachinePluginContext, StateRecord, TriggerConfig, EntityInState, SchedulerJob, TriggerListenerRef, Lock, Resource } from './types.js';
import { StateMachineError } from '../state-machine.errors.js';
import tryFn from '../../concerns/try-fn.js';
import { getCronManager } from '../../concerns/cron-manager.js';
import { buildTriggerSubscriptionKey, getEventEntityId } from './helpers.js';

export async function getEntitiesInState(plugin: StateMachinePluginContext, machineId: string, stateName: string): Promise<EntityInState[]> {
  if (!plugin.config.persistTransitions) {
    const machine = plugin.machines.get(machineId);
    if (!machine) return [];

    const entities: EntityInState[] = [];
    for (const [entityId, currentState] of machine.currentStates) {
      if (currentState === stateName) {
        entities.push({ entityId, currentState, context: {}, triggerCounts: {} });
      }
    }
    return entities;
  }

  const stateResource = plugin.getStateResource();

  if (!stateResource) {
    plugin.logger.warn({ machineId, stateName, reason: 'state resource unavailable' }, `Failed to query entities in state '${stateName}'`);
    return [];
  }

  const [ok, err, records] = await tryFn<StateRecord[]>(() =>
    stateResource.query({
      machineId,
      currentState: stateName
    }) as unknown as Promise<StateRecord[]>
  );

  if (!ok) {
    plugin.logger.warn({ machineId, stateName, error: (err as Error).message }, `Failed to query entities in state '${stateName}': ${(err as Error).message}`);
    return [];
  }

  return (records || []).map(r => ({
    entityId: r.entityId,
    currentState: r.currentState,
    context: r.context,
    triggerCounts: r.triggerCounts || {},
    _ttlExpiresAt: r._ttlExpiresAt || null,
    _ttlEvent: r._ttlEvent || null
  }));
}

export async function executeTriggerForEntity(
  plugin: StateMachinePluginContext,
  machineId: string,
  stateName: string,
  entity: EntityInState,
  trigger: TriggerConfig,
  triggerName: string,
  triggerType: string,
  extraContext: Record<string, unknown> = {}
): Promise<boolean> {
  const triggerContext = { ...entity.context, ...extraContext, triggerName };

  if (trigger.condition) {
    const shouldTrigger = await trigger.condition(entity.context, entity.entityId, extraContext.eventData);
    if (!shouldTrigger) return false;
  }

  if (trigger.maxTriggers !== undefined) {
    const triggerCount = entity.triggerCounts?.[triggerName] || 0;
    if (triggerCount >= trigger.maxTriggers) {
      if (triggerCount === trigger.maxTriggers && trigger.onMaxTriggersReached) {
        await incrementTriggerCount(plugin, machineId, entity.entityId, triggerName);
        await plugin.send(machineId, entity.entityId, trigger.onMaxTriggersReached, triggerContext);
      }
      return false;
    }
  }

  if (trigger.targetState) {
    const transition = await plugin.transitionToTargetState(
      machineId,
      entity.entityId,
      trigger.targetState,
      'TRIGGER',
      triggerContext
    );

    const followUpEvent = trigger.eventOnSuccess || trigger.sendEvent || trigger.event;
    if (followUpEvent) {
      await plugin.send(machineId, entity.entityId, followUpEvent, {
        ...triggerContext,
        triggerResult: transition
      });
    }
  } else if (trigger.action) {
    const result = await plugin.executeAction(
      trigger.action,
      triggerContext,
      'TRIGGER',
      machineId,
      entity.entityId
    );

    const followUpEvent = trigger.eventOnSuccess || trigger.sendEvent || trigger.event;
    if (followUpEvent) {
      await plugin.send(machineId, entity.entityId, followUpEvent, {
        ...triggerContext,
        triggerResult: result
      });
    }
  }

  await incrementTriggerCount(plugin, machineId, entity.entityId, triggerName);

  plugin.emit('plg:state-machine:trigger-executed', {
    machineId,
    entityId: entity.entityId,
    state: stateName,
    trigger: triggerName,
    type: triggerType
  });

  return true;
}

async function getSubscribedEntitySnapshot(
  plugin: StateMachinePluginContext,
  machineId: string,
  stateName: string,
  entityId: string
): Promise<EntityInState | null> {
  const snapshot = await plugin.getSnapshot(machineId, entityId).catch(() => null);
  if (!snapshot || snapshot.state !== stateName) {
    return null;
  }

  return {
    entityId,
    currentState: snapshot.state,
    context: snapshot.context || {},
    triggerCounts: snapshot.triggerCounts || {}
  };
}

export async function incrementTriggerCount(plugin: StateMachinePluginContext, machineId: string, entityId: string, triggerName: string): Promise<void> {
  if (!plugin.config.persistTransitions) {
    return;
  }

  const stateId = `${machineId}_${entityId}`;
  const stateResource = plugin.getStateResource();

  if (!stateResource) {
    return;
  }

  let lock: Lock | null = null;
  try {
    const storage = plugin.getStorage();
    lock = await storage.acquireLock(`trigger-count-${stateId}`, {
      ttl: plugin.config.lockTTL,
      timeout: plugin.config.lockTimeout,
      workerId: plugin.config.workerId
    });

    const [ok, , stateRecord] = await tryFn<StateRecord>(() =>
      stateResource.get(stateId) as unknown as Promise<StateRecord>
    );

    if (ok && stateRecord) {
      const triggerCounts: Record<string, number> = stateRecord.triggerCounts || {};
      triggerCounts[triggerName] = (triggerCounts[triggerName] || 0) + 1;

      await tryFn(() =>
        stateResource.patch(stateId, { triggerCounts })
      );
    }
  } finally {
    if (lock) {
      const storage = plugin.getStorage();
      const [ok, err] = await tryFn(() => storage.releaseLock(lock!));

      if (!ok) {
        plugin.logger.warn({ lockName: lock?.name, error: (err as Error).message }, `Failed to release lock '${lock?.name}': ${(err as Error).message}`);
      }
    }
  }
}

export async function setupTriggers(plugin: StateMachinePluginContext): Promise<void> {
  if (!plugin.config.enableScheduler && !plugin.config.enableDateTriggers && !plugin.config.enableFunctionTriggers && !plugin.config.enableEventTriggers) {
    return;
  }

  const cronJobs: Record<string, SchedulerJob> = {};

  for (const [machineId, machineData] of plugin.machines) {
    const machineConfig = machineData.config;

    for (const [stateName, stateConfig] of Object.entries(machineConfig.states)) {
      const triggers = stateConfig.triggers || [];

      for (let i = 0; i < triggers.length; i++) {
        const trigger = triggers[i]!;
        const triggerName = `${trigger.action}_${i}`;

        if (trigger.type === 'cron' && plugin.config.enableScheduler) {
          const jobName = `${machineId}_${stateName}_${triggerName}`;
          cronJobs[jobName] = await createCronJob(plugin, machineId, stateName, trigger, triggerName);
        } else if (trigger.type === 'date' && plugin.config.enableDateTriggers) {
          await setupDateTrigger(plugin, machineId, stateName, trigger, triggerName);
        } else if (trigger.type === 'function' && plugin.config.enableFunctionTriggers) {
          await setupFunctionTrigger(plugin, machineId, stateName, trigger, triggerName);
        } else if (trigger.type === 'event' && plugin.config.enableEventTriggers) {
          await setupEventTrigger(plugin, machineId, stateName, trigger, triggerName);
        }
      }
    }
  }

  if (Object.keys(cronJobs).length > 0 && plugin.config.enableScheduler) {
    const { SchedulerPlugin } = await import('../scheduler.plugin.js') as unknown as { SchedulerPlugin: SchedulerPluginClass };
    plugin.schedulerPlugin = new SchedulerPlugin({
      jobs: cronJobs,
      persistJobs: false,
      logLevel: plugin.logLevel,
      ...plugin.config.schedulerConfig
    });

    await (plugin.database as unknown as { usePlugin: (plugin: unknown) => Promise<void> }).usePlugin(plugin.schedulerPlugin);

    plugin.logger.debug({ cronJobCount: Object.keys(cronJobs).length }, `Installed SchedulerPlugin with ${Object.keys(cronJobs).length} cron triggers`);
  }
}

interface SchedulerPluginClass {
  new(options: Record<string, unknown>): any;
}

export async function createCronJob(plugin: StateMachinePluginContext, machineId: string, stateName: string, trigger: TriggerConfig, triggerName: string): Promise<SchedulerJob> {
  return {
    schedule: trigger.schedule!,
    description: `Trigger '${triggerName}' for ${machineId}.${stateName}`,
    action: async () => {
      const entities = await getEntitiesInState(plugin, machineId, stateName);
      let executedCount = 0;

      for (const entity of entities) {
        try {
          const executed = await executeTriggerForEntity(plugin, machineId, stateName, entity, trigger, triggerName, 'cron');
          if (executed) executedCount++;
        } catch (error) {
          if (trigger.event) {
            await tryFn(() => plugin.send(machineId, entity.entityId, trigger.event!, {
              ...entity.context,
              triggerError: (error as Error).message
            }));
          }
          plugin.logger.error({ triggerName, machineId, entityId: entity.entityId, error: (error as Error).message }, `Trigger '${triggerName}' failed for entity ${entity.entityId}: ${(error as Error).message}`);
        }
      }

      return { processed: entities.length, executed: executedCount };
    }
  };
}

export async function setupDateTrigger(plugin: StateMachinePluginContext, machineId: string, stateName: string, trigger: TriggerConfig, triggerName: string): Promise<void> {
  const cronManager = getCronManager();
  await cronManager.scheduleInterval(
    plugin.config.triggerCheckInterval,
    async () => {
      const entities = await getEntitiesInState(plugin, machineId, stateName);

      for (const entity of entities) {
        try {
          const triggerDateValue = entity.context?.[trigger.field!];
          if (!triggerDateValue) continue;

          const triggerDate = new Date(triggerDateValue as string);
          if (new Date() >= triggerDate) {
            await executeTriggerForEntity(plugin, machineId, stateName, entity, trigger, triggerName, 'date');
          }
        } catch (error) {
          plugin.logger.error({ triggerName, machineId, stateName, error: (error as Error).message }, `Date trigger '${triggerName}' failed: ${(error as Error).message}`);
        }
      }
    },
    `date-trigger-${machineId}-${stateName}-${triggerName}`
  );

  const jobName = `date-trigger-${machineId}-${stateName}-${triggerName}`;
  plugin.triggerJobNames.push(jobName);
}

export async function setupFunctionTrigger(plugin: StateMachinePluginContext, machineId: string, stateName: string, trigger: TriggerConfig, triggerName: string): Promise<void> {
  const interval = trigger.interval || plugin.config.triggerCheckInterval;

  const cronManager = getCronManager();
  await cronManager.scheduleInterval(
    interval,
    async () => {
      const entities = await getEntitiesInState(plugin, machineId, stateName);

      for (const entity of entities) {
        try {
          await executeTriggerForEntity(plugin, machineId, stateName, entity, trigger, triggerName, 'function');
        } catch (error) {
          plugin.logger.error({ triggerName, machineId, stateName, error: (error as Error).message }, `Function trigger '${triggerName}' failed: ${(error as Error).message}`);
        }
      }
    },
    `function-trigger-${machineId}-${stateName}-${triggerName}`
  );

  const jobName = `function-trigger-${machineId}-${stateName}-${triggerName}`;
  plugin.triggerJobNames.push(jobName);
}

export async function setupEventTrigger(plugin: StateMachinePluginContext, machineId: string, stateName: string, trigger: TriggerConfig, triggerName: string): Promise<void> {
  const baseEventName = trigger.eventName || trigger.event;
  const eventSource = trigger.eventSource;
  const subscriptionKey = buildTriggerSubscriptionKey(machineId, stateName, triggerName);

  if (!baseEventName) {
    throw new StateMachineError(`Event trigger '${triggerName}' must have either 'event' or 'eventName' property`, {
      operation: '_setupEventTrigger',
      machineId,
      stateName,
      triggerName
    });
  }

  const eventHandler = async (eventData: unknown) => {
    const targetedEntityId = getEventEntityId(eventData);
    const entities = targetedEntityId
      ? plugin.getTriggerSubscribedEntities(subscriptionKey)
          .filter((entityId) => entityId === targetedEntityId)
          .map((entityId) => ({ entityId }))
      : await getEntitiesInState(plugin, machineId, stateName);

    for (const entity of entities) {
      try {
        if (targetedEntityId && entity.entityId !== targetedEntityId) {
          continue;
        }

        const resolvedEntity = 'currentState' in entity
          ? entity as EntityInState
          : await getSubscribedEntitySnapshot(plugin, machineId, stateName, entity.entityId);

        if (!resolvedEntity) {
          continue;
        }

        await executeTriggerForEntity(plugin, machineId, stateName, resolvedEntity, trigger, triggerName, 'event', { eventData });
      } catch (error) {
        plugin.logger.error({ triggerName, machineId, stateName, error: (error as Error).message }, `Event trigger '${triggerName}' failed: ${(error as Error).message}`);
      }
    }
  };

  const registerListener = (emitter: TriggerListenerRef['emitter'], eventName: string, handler: (...args: unknown[]) => unknown): void => {
    const wrappedHandler = plugin.wrapEventHandler(handler);
    emitter.on?.(eventName, wrappedHandler);
    plugin._triggerListeners.push({
      emitter,
      eventName,
      handler: wrappedHandler
    });
  };

  if (eventSource) {
    const baseEvent = typeof baseEventName === 'function' ? 'updated' : baseEventName;

    registerListener(eventSource as TriggerListenerRef['emitter'], baseEvent, eventHandler);

    plugin.logger.debug({ baseEvent, resourceName: eventSource.name, triggerName }, `Listening to resource event '${baseEvent}' from '${eventSource.name}' for trigger '${triggerName}' (async-safe)`);
  } else {
    const staticEventName = typeof baseEventName === 'function' ? 'updated' : baseEventName;

    if (staticEventName.startsWith('db:')) {
      const dbEventName = staticEventName.substring(3);
      registerListener(plugin.database, dbEventName, eventHandler);

      plugin.logger.debug({ dbEventName, triggerName }, `Listening to database event '${dbEventName}' for trigger '${triggerName}'`);
    } else {
      registerListener(plugin as unknown as TriggerListenerRef['emitter'], staticEventName, eventHandler);

      plugin.logger.debug({ staticEventName, triggerName }, `Listening to plugin event '${staticEventName}' for trigger '${triggerName}'`);
    }
  }
}
