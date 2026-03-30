import type { StateMachineConfig, MachineData, Database, Resource, ActionContext, RetryConfig, TransitionContext, Lock } from './types.js';
import { StateMachineError } from '../state-machine.errors.js';
import { ErrorClassifier } from '../../concerns/error-classifier.js';
import { buildTransitionContext, calculateBackoff } from './helpers.js';

export interface HooksPluginContext {
  config: StateMachineConfig;
  machines: Map<string, MachineData>;
  database: any;
  logger: any;
  emit(event: string, data: unknown): void;
  getAttachedResource(machineId: string): Promise<Resource | null>;
  getState(machineId: string, entityId: string): Promise<string>;
}

export async function executeAction(
  plugin: HooksPluginContext,
  actionName: string,
  context: Record<string, unknown>,
  event: string,
  machineId: string,
  entityId: string,
  transitionContext?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void }
): Promise<unknown> {
  const action = plugin.config.actions[actionName];
  if (!action) {
    throw new StateMachineError(`Action '${actionName}' not found`, {
      operation: 'action-not-found',
      machineId,
      entityId,
      actionName,
      event,
      suggestion: 'Register the action in plugin options and ensure the state transition references a valid action'
    });
  }

  const machine = plugin.machines.get(machineId);
  const currentState = await plugin.getState(machineId, entityId);
  const stateConfig = machine?.config?.states?.[currentState];

  const retryConfig: RetryConfig = {
    ...(plugin.config.retryConfig || {}),
    ...(machine?.config?.retryConfig || {}),
    ...(stateConfig?.retryConfig || {})
  };

  const maxAttempts = retryConfig.maxAttempts ?? 0;
  const retryEnabled = maxAttempts > 0;

  const resource = await plugin.getAttachedResource(machineId);
  let entity: Record<string, unknown> | null | undefined = undefined;
  const getEntity = async (): Promise<Record<string, unknown> | null> => {
    if (entity === undefined) {
      entity = resource ? await resource.get(entityId).catch(() => null) as Record<string, unknown> | null : null;
    }
    return entity;
  };

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxAttempts) {
    try {
      const result = await action(context, event, {
        database: plugin.database as unknown as Database,
        machineId,
        entityId,
        resource,
        entity: await getEntity(),
        machineContext: transitionContext?.machineContext || {},
        assign: transitionContext?.assign || (() => {})
      });

      if (attempt > 0) {
        plugin.emit('plg:state-machine:action-retry-success', {
          machineId,
          entityId,
          action: actionName,
          attempts: attempt + 1,
          state: currentState
        });

        plugin.logger.debug({ actionName, machineId, entityId, attempts: attempt + 1 }, `Action '${actionName}' succeeded after ${attempt + 1} attempts`);
      }

      return result;

    } catch (error) {
      lastError = error as Error;

      if (!retryEnabled) {
        const actionContext = buildTransitionContext(machineId, entityId, event, transitionContext?.startedAt || new Date().toISOString(), new Date().toISOString(), {
          correlationId: transitionContext?.correlationId || 'unknown',
          context,
          from: transitionContext?.from,
          to: transitionContext?.to,
          guard: transitionContext?.guard,
          error: lastError.message
        });

        plugin.logger.error({ actionName, machineId, entityId, error: lastError.message }, `Action '${actionName}' failed: ${lastError.message}`);
        plugin.emit('plg:state-machine:action-error', {
          actionName,
          error: lastError.message,
          machineId,
          entityId,
          event,
          from: actionContext.from,
          to: actionContext.to,
          guard: actionContext.guard,
          correlationId: actionContext.correlationId,
          context,
          startedAt: actionContext.startedAt,
          endedAt: actionContext.endedAt,
          elapsedMs: actionContext.elapsedMs
        });
        throw lastError;
      }

      const classification = ErrorClassifier.classify(error as Error, {
        retryableErrors: retryConfig.retryableErrors,
        nonRetriableErrors: retryConfig.nonRetriableErrors
      });

      if (classification === 'NON_RETRIABLE') {
        plugin.emit('plg:state-machine:action-error-non-retriable', {
          machineId,
          entityId,
          action: actionName,
          error: lastError.message,
          state: currentState
        });

        plugin.logger.error({ actionName, machineId, entityId, error: lastError.message, state: currentState }, `Action '${actionName}' failed with non-retriable error: ${lastError.message}`);

        throw error;
      }

      if (attempt >= maxAttempts) {
        plugin.emit('plg:state-machine:action-retry-exhausted', {
          machineId,
          entityId,
          action: actionName,
          attempts: attempt + 1,
          error: lastError.message,
          state: currentState
        });

        plugin.logger.error({ actionName, machineId, entityId, attempts: attempt + 1, error: lastError.message, state: currentState }, `Action '${actionName}' failed after ${attempt + 1} attempts: ${lastError.message}`);

        throw error;
      }

      attempt++;

      const delay = calculateBackoff(attempt, retryConfig);

      if (retryConfig.onRetry) {
        try {
          await retryConfig.onRetry(attempt, lastError, context);
        } catch (hookError) {
          plugin.logger.warn({ hookError: (hookError as Error).message }, `onRetry hook failed: ${(hookError as Error).message}`);
        }
      }

      plugin.emit('plg:state-machine:action-retry-attempt', {
        machineId,
        entityId,
        action: actionName,
        attempt,
        delay,
        error: lastError.message,
        state: currentState
      });

      plugin.logger.warn({ actionName, machineId, entityId, attempt, maxAttempts, delay, error: lastError.message }, `Action '${actionName}' failed (attempt ${attempt + 1}/${maxAttempts + 1}), retrying in ${delay}ms: ${lastError.message}`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return undefined;
}

export async function executeHooks(
  plugin: HooksPluginContext,
  hookNames: string[],
  context: Record<string, unknown>,
  event: string,
  machineId: string,
  entityId: string,
  transitionContext?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void },
  options: { cancellable?: boolean; hookLabel?: string; stateName?: string } = {}
): Promise<{ cancelled: boolean; action?: string }> {
  const { cancellable = false, hookLabel = 'hook', stateName = '' } = options;
  const resource = await plugin.getAttachedResource(machineId);
  let entity: Record<string, unknown> | null | undefined = undefined;
  const getEntity = async (): Promise<Record<string, unknown> | null> => {
    if (entity === undefined) {
      entity = resource ? await resource.get(entityId).catch(() => null) as Record<string, unknown> | null : null;
    }
    return entity;
  };

  for (const actionName of hookNames) {
    const action = plugin.config.actions[actionName];
    if (!action) {
      const errorData = {
        operation: 'hook-not-found',
        machineId,
        entityId,
        actionName,
        hook: hookLabel,
        state: stateName,
        event
      };
      plugin.emit('plg:state-machine:hook-rejected', {
        machineId,
        entityId,
        hook: hookLabel,
        action: actionName,
        from: transitionContext?.from,
        to: transitionContext?.to,
        reason: 'not-found'
      });
      throw new StateMachineError(`Hook action '${actionName}' not found for ${hookLabel}`, errorData);
    }

    try {
      const result = await action(context, event, {
        database: plugin.database as unknown as Database,
        machineId,
        entityId,
        resource,
        entity: await getEntity(),
        machineContext: transitionContext?.machineContext || {},
        assign: transitionContext?.assign || (() => {})
      });

      if (cancellable && result === false) {
        plugin.emit(`plg:state-machine:${hookLabel}`, {
          machineId,
          entityId,
          from: transitionContext?.from,
          to: transitionContext?.to,
          event,
          hook: actionName,
          rejected: true
        });
        plugin.emit('plg:state-machine:hook-rejected', {
          machineId,
          entityId,
          hook: hookLabel,
          action: actionName,
          from: transitionContext?.from,
          to: transitionContext?.to,
          reason: 'rejected'
        });
        return { cancelled: true, action: actionName };
      }
    } catch (error) {
      if (error instanceof StateMachineError && (error as StateMachineError & { data?: Record<string, unknown> }).data?.operation === 'hook-not-found') {
        throw error;
      }
      if (cancellable) {
        plugin.emit('plg:state-machine:hook-rejected', {
          machineId,
          entityId,
          hook: hookLabel,
          action: actionName,
          from: transitionContext?.from,
          to: transitionContext?.to,
          reason: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
      throw error;
    }

    plugin.emit(`plg:state-machine:${hookLabel}`, {
      machineId,
      entityId,
      from: transitionContext?.from,
      to: transitionContext?.to,
      event,
      hook: actionName
    });
  }

  return { cancelled: false };
}

export async function executeMachineHooks(
  plugin: HooksPluginContext,
  machineId: string,
  hookName: string,
  context: Record<string, unknown>,
  event: string,
  entityId: string,
  transitionCtx?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void },
  options: { cancellable?: boolean } = {}
): Promise<{ cancelled: boolean; action?: string }> {
  const machine = plugin.machines.get(machineId);
  if (!machine?.config?.hooks?.[hookName]) return { cancelled: false };
  const hookValue = machine.config.hooks[hookName];
  const hookNames: string[] = Array.isArray(hookValue) ? hookValue : [hookValue!];
  if (hookNames.length === 0) return { cancelled: false };
  return executeHooks(plugin, hookNames, context, event, machineId, entityId, transitionCtx, { ...options, hookLabel: hookName });
}
