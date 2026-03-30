import type {
  StateMachineConfig,
  MachineData,
  MachineConfig,
  StateConfig,
  Resource,
  Lock,
  StateRecord,
  TransitionEdge,
  ConditionalTarget,
  TransitionResult,
  TransitionSuccessResult,
  TransitionRejectedResult,
  TransitionAssertionSuccessParams,
  TransitionAssertionRejectParams,
  TransitionContext,
  MachineEventPayloadMap,
  Database
} from './types.js';
import { StateMachineError } from '../state-machine.errors.js';
import tryFn from '../../concerns/try-fn.js';
import { resolveEdge, resolveHooks, findGuardForTargetState, buildTransitionContext, getCorrelationId, contractAssertionFailure } from './helpers.js';
import { executeHooks, executeMachineHooks, type HooksPluginContext } from './hooks.js';

export interface TransitionEngineContext extends HooksPluginContext {
  acquireTransitionLock(machineId: string, entityId: string): Promise<Lock | null>;
  releaseTransitionLock(lock: Lock | null): Promise<void>;
  getStateSnapshot(machineId: string, entityId: string): Promise<{ state: string; version: number }>;
  getStateResource(): Resource | null;
  persistTransition(machineId: string, entityId: string, fromState: string, toState: string, event: string, context: Record<string, unknown>, fromStateVersion?: number): Promise<number>;
  hasTTLStates(machineId: string): boolean;
  cancelTTL(machineId: string, entityId: string): void;
  scheduleTTL(machineId: string, entityId: string, stateConfig?: StateConfig): void;
}

export async function send<TMachineEvents extends MachineEventPayloadMap = Record<string, Record<string, Record<string, unknown>>>, TMachine extends keyof TMachineEvents & string = string, TEvent extends keyof TMachineEvents[TMachine] & string = string>(
  plugin: TransitionEngineContext,
  machineId: TMachine,
  entityId: string,
  event: TEvent,
  context?: TMachineEvents[TMachine][TEvent] & Record<string, unknown>
): Promise<TransitionResult>;
export async function send(
  plugin: TransitionEngineContext,
  machineId: string,
  entityId: string,
  event: string,
  context: Record<string, unknown>
): Promise<TransitionResult>;
export async function send(
  plugin: TransitionEngineContext,
  machineId: string,
  entityId: string,
  event: string,
  context: Record<string, unknown> = {}
): Promise<TransitionResult> {
  const startedAt = new Date().toISOString();
  const normalizedContext = context || {};
  const correlationId = getCorrelationId(normalizedContext, machineId, entityId, event);
  const requestedStateVersion = typeof normalizedContext.stateVersion === 'number' ? normalizedContext.stateVersion : undefined;
  const buildFailure = (
    code: TransitionRejectedResult['code'],
    reason: string,
    message: string,
    details: Record<string, unknown>,
    state: Partial<Pick<TransitionContext, 'from' | 'to' | 'guard' | 'stateVersion'>> & { state?: string } = {}
  ): TransitionResult => {
    const endedAt = new Date().toISOString();
    const transitionContext = buildTransitionContext(machineId, entityId, event, startedAt, endedAt, {
      correlationId,
      context: normalizedContext,
      from: state.from,
      to: state.to,
      guard: state.guard
    });

    plugin.emit('plg:state-machine:transition-rejected', {
      ...transitionContext,
      machineId,
      event,
      code,
      reason,
      message,
      details
    });

    return {
      ok: false,
      code,
      reason,
      message,
      details,
      state: state.state || state.from || state.to,
      ...transitionContext,
      event
    };
  };

  const machine = plugin.machines.get(machineId);
  if (!machine) {
    return buildFailure(
      'MACHINE_NOT_FOUND',
      'MACHINE_NOT_FOUND',
      `State machine '${machineId}' not found`,
      {
        machineId,
        availableMachines: Array.from(plugin.machines.keys()),
        operation: 'send'
      }
    );
  }

  let lock: Lock | null = null;
  let currentStateVersion = 0;
  let currentState = '';
  let targetState = '';
  let guardName: string | undefined;
  let transitionedStateVersion = 0;

  try {
    if (machine.concurrency.mode !== 'parallel') {
      lock = await plugin.acquireTransitionLock(machineId, entityId);
    }

    const stateSnapshot = await plugin.getStateSnapshot(machineId, entityId);
    currentState = stateSnapshot.state;
    currentStateVersion = stateSnapshot.version;

    let _machineContext: Record<string, unknown> = {};
    try {
      const stateResource = plugin.getStateResource();
      if (stateResource) {
        const stateId = `${machineId}_${entityId}`;
        const [ok, , record] = await tryFn<StateRecord>(() =>
          stateResource.get(stateId) as unknown as Promise<StateRecord>
        );
        if (ok && record?.context && typeof record.context === 'object') {
          _machineContext = { ...record.context };
        }
      }
    } catch (_) { /* no state resource yet -- start with empty context */ }

    const _pendingAssignments: Record<string, unknown> = {};
    const _assignFn = (partial: Record<string, unknown>): void => { Object.assign(_pendingAssignments, partial); };

    plugin.emit('plg:state-machine:before-transition', {
      machineId,
      entityId,
      event,
      context: normalizedContext,
      startedAt,
      correlationId,
      guard: undefined,
      from: currentState,
      stateVersion: currentStateVersion,
      to: undefined,
      endedAt: new Date().toISOString(),
      elapsedMs: 0
    });

    if (typeof requestedStateVersion === 'number' && requestedStateVersion !== currentStateVersion) {
      return buildFailure(
        'STATE_VERSION_MISMATCH',
        'STATE_VERSION_MISMATCH',
        `State version mismatch for machine '${machineId}' and entity '${entityId}'`,
        {
          machineId,
          entityId,
          currentState,
          requestedStateVersion,
          currentStateVersion
        },
        { from: currentState, stateVersion: currentStateVersion }
      );
    }

    const stateConfig = machine.config.states[currentState];
    const wildcardConfig = machine.config.states['*'];

    let eventSource: string | TransitionEdge | ConditionalTarget[] | undefined = stateConfig?.on?.[event];
    let eventFromWildcard = false;
    if (!eventSource && wildcardConfig?.on?.[event] && stateConfig?.type !== 'final') {
      eventSource = wildcardConfig.on![event];
      eventFromWildcard = true;
    }

    if (!eventSource) {
      const stateEvents = stateConfig?.on ? Object.keys(stateConfig.on) : [];
      const wildcardEvents = (wildcardConfig?.on && stateConfig?.type !== 'final') ? Object.keys(wildcardConfig.on) : [];
      const allEvents = [...new Set([...stateEvents, ...wildcardEvents])];
      return buildFailure(
        'INVALID_EVENT',
        'INVALID_EVENT',
        `Event '${event}' not valid for state '${currentState}' in machine '${machineId}'`,
        {
          currentState,
          validEvents: allEvents
        },
        { from: currentState }
      );
    }

    let edge: { target: string; guard: string | undefined; beforeTransition: string[]; afterTransition: string[] };
    if (Array.isArray(eventSource)) {
      let matched = false;
      // @ts-ignore - edge is assigned inside loop before break
      edge = undefined as unknown as typeof edge;
      for (const candidate of eventSource) {
        const resolved = resolveEdge(candidate);
        if (!resolved.guard) {
          edge = resolved;
          matched = true;
          break;
        }
        const candidateGuard = plugin.config.guards[resolved.guard];
        if (!candidateGuard) continue;
        const [gOk, , gResult] = await tryFn(async () =>
          candidateGuard(normalizedContext, event, {
            database: plugin.database as unknown as Database,
            machineId,
            entityId,
            resource: await plugin.getAttachedResource(machineId),
            entity: null,
            machineContext: _machineContext,
            assign: _assignFn
          })
        );
        if (gOk && gResult) {
          edge = resolved;
          matched = true;
          break;
        }
      }
      if (!matched) {
        return buildFailure(
          'NO_MATCHING_TARGET',
          'NO_MATCHING_TARGET',
          `No conditional target matched for event '${event}' in state '${currentState}'`,
          {
            currentState,
            event,
            candidates: (eventSource as ConditionalTarget[]).map((c: ConditionalTarget) => typeof c === 'string' ? c : c.target)
          },
          { from: currentState }
        );
      }
    } else {
      edge = resolveEdge(eventSource);
    }

    targetState = edge.target;

    guardName = edge.guard
      || (stateConfig?.guards && stateConfig.guards[event])
      || (eventFromWildcard && wildcardConfig?.guards && wildcardConfig.guards[event])
      || undefined;

    if (guardName) {
      const guard = plugin.config.guards[guardName];

      if (!guard) {
        const rejectResult = buildFailure(
          'GUARD_NOT_FOUND',
          'GUARD_NOT_FOUND',
          `Guard '${guardName}' not found`,
          {
            operation: 'guard-not-found',
            guardName,
            currentState
          },
          { from: currentState, to: targetState, guard: guardName }
        );
        await executeMachineHooks(plugin, machineId, 'afterReject', normalizedContext, event, entityId,
          { from: currentState, to: targetState, event, machineId, entityId } as Partial<TransitionContext>,
          { cancellable: false });
        return rejectResult;
      }

      const guardResource = await plugin.getAttachedResource(machineId);
      const guardEntity = guardResource ? await guardResource.get(entityId).catch(() => null) as Record<string, unknown> | null : null;

      const [guardOk, guardErr, guardResult] = await tryFn(async () =>
        guard(normalizedContext, event, {
          database: plugin.database as unknown as Database,
          machineId,
          entityId,
          resource: guardResource,
          entity: guardEntity,
          machineContext: _machineContext,
          assign: _assignFn
        })
      );

      if (!guardOk) {
        const rejectResult = buildFailure(
          'GUARD_ERROR',
          'GUARD_ERROR',
          `Guard '${guardName}' threw an error`,
          {
            currentState,
            guardName,
            guardError: (guardErr as Error)?.message || 'Unknown guard error'
          },
          { from: currentState, to: targetState, guard: guardName }
        );
        await executeMachineHooks(plugin, machineId, 'afterReject', normalizedContext, event, entityId,
          { from: currentState, to: targetState, event, machineId, entityId } as Partial<TransitionContext>,
          { cancellable: false });
        return rejectResult;
      }

      if (!guardResult) {
        const rejectResult = buildFailure(
          'GUARD_REJECTED',
          'MISSING_REQUIRED_FIELD',
          `Transition blocked by guard '${guardName}'`,
          {
            currentState,
            guardName,
            guardResult: false
          },
          { from: currentState, to: targetState, guard: guardName }
        );
        await executeMachineHooks(plugin, machineId, 'afterReject', normalizedContext, event, entityId,
          { from: currentState, to: targetState, event, machineId, entityId } as Partial<TransitionContext>,
          { cancellable: false });
        return rejectResult;
      }
    }

    const transitionCtx: Partial<TransitionContext> & { machineContext: Record<string, unknown>; assign: (partial: Record<string, unknown>) => void } = {
      machineId,
      entityId,
      event,
      from: currentState,
      to: targetState,
      startedAt,
      correlationId,
      context: normalizedContext,
      machineContext: _machineContext,
      assign: _assignFn
    };

    const targetStateConfig = machine.config.states[targetState];
    const isFinalize = targetStateConfig?.type === 'final';

    const btResult = await executeMachineHooks(plugin, machineId, 'beforeTransition', normalizedContext, event, entityId, transitionCtx, { cancellable: true });
    if (btResult.cancelled) {
      const rejectResult = buildFailure('HOOK_REJECTED', 'HOOK_REJECTED',
        `beforeTransition hook '${btResult.action}' rejected transition`,
        { hook: 'beforeTransition', action: btResult.action },
        { from: currentState, to: targetState });
      await executeMachineHooks(plugin, machineId, 'afterReject', normalizedContext, event, entityId, transitionCtx, { cancellable: false });
      return rejectResult;
    }

    const beforeLeaveHooks = resolveHooks(stateConfig, 'beforeLeave', 'exit');
    if (beforeLeaveHooks.length > 0) {
      const blResult = await executeHooks(plugin, beforeLeaveHooks, normalizedContext, event, machineId, entityId, transitionCtx, { cancellable: true, hookLabel: 'before-leave', stateName: currentState });
      if (blResult.cancelled) {
        const rejectResult = buildFailure('HOOK_REJECTED', 'HOOK_REJECTED',
          `beforeLeave hook '${blResult.action}' rejected transition`,
          { hook: 'beforeLeave', action: blResult.action, state: currentState },
          { from: currentState, to: targetState });
        await executeMachineHooks(plugin, machineId, 'afterReject', normalizedContext, event, entityId, transitionCtx, { cancellable: false });
        return rejectResult;
      }
    }

    const beforeEnterHooks = resolveHooks(targetStateConfig, 'beforeEnter');
    if (beforeEnterHooks.length > 0) {
      const beResult = await executeHooks(plugin, beforeEnterHooks, normalizedContext, event, machineId, entityId, transitionCtx, { cancellable: true, hookLabel: 'before-enter', stateName: targetState });
      if (beResult.cancelled) {
        const rejectResult = buildFailure('HOOK_REJECTED', 'HOOK_REJECTED',
          `beforeEnter hook '${beResult.action}' rejected transition`,
          { hook: 'beforeEnter', action: beResult.action, state: targetState },
          { from: currentState, to: targetState });
        await executeMachineHooks(plugin, machineId, 'afterReject', normalizedContext, event, entityId, transitionCtx, { cancellable: false });
        return rejectResult;
      }
    }

    if (edge.beforeTransition.length > 0) {
      const etResult = await executeHooks(plugin, edge.beforeTransition, normalizedContext, event, machineId, entityId, transitionCtx, { cancellable: true, hookLabel: 'before-transition', stateName: `${currentState}->${targetState}` });
      if (etResult.cancelled) {
        const rejectResult = buildFailure('HOOK_REJECTED', 'HOOK_REJECTED',
          `Edge beforeTransition hook '${etResult.action}' rejected transition`,
          { hook: 'edge.beforeTransition', action: etResult.action },
          { from: currentState, to: targetState });
        await executeMachineHooks(plugin, machineId, 'afterReject', normalizedContext, event, entityId, transitionCtx, { cancellable: false });
        return rejectResult;
      }
    }

    if (isFinalize) {
      const bfResult = await executeMachineHooks(plugin, machineId, 'beforeFinalize', normalizedContext, event, entityId, transitionCtx, { cancellable: true });
      if (bfResult.cancelled) {
        const rejectResult = buildFailure('HOOK_REJECTED', 'HOOK_REJECTED',
          `beforeFinalize hook '${bfResult.action}' rejected transition`,
          { hook: 'beforeFinalize', action: bfResult.action },
          { from: currentState, to: targetState });
        await executeMachineHooks(plugin, machineId, 'afterReject', normalizedContext, event, entityId, transitionCtx, { cancellable: false });
        return rejectResult;
      }
    }

    transitionedStateVersion = await plugin.persistTransition(machineId, entityId, currentState, targetState, event, normalizedContext, currentStateVersion);

    if (plugin.hasTTLStates(machineId)) {
      plugin.cancelTTL(machineId, entityId);
      plugin.scheduleTTL(machineId, entityId, targetStateConfig);
    }

    if (Object.keys(_pendingAssignments).length > 0) {
      try {
        Object.assign(_machineContext, _pendingAssignments);
        const stateResource = plugin.getStateResource();
        if (stateResource) {
          const stateId = `${machineId}_${entityId}`;
          await stateResource.update(stateId, { context: _machineContext });
        }
      } catch (assignErr) {
        plugin.logger.warn({ machineId, entityId, error: (assignErr as Error)?.message }, 'Failed to persist machineContext');
      }
    }

    const afterHookErrors: string[] = [];
    try {
      const afterLeaveHooks = resolveHooks(stateConfig, 'afterLeave');
      if (afterLeaveHooks.length > 0) {
        await executeHooks(plugin, afterLeaveHooks, normalizedContext, event, machineId, entityId, transitionCtx, { cancellable: false, hookLabel: 'after-leave', stateName: currentState });
      }

      const afterEnterHooks = resolveHooks(targetStateConfig, 'afterEnter', 'entry');
      if (afterEnterHooks.length > 0) {
        await executeHooks(plugin, afterEnterHooks, normalizedContext, event, machineId, entityId, transitionCtx, { cancellable: false, hookLabel: 'after-enter', stateName: targetState });
      }

      if (edge.afterTransition.length > 0) {
        await executeHooks(plugin, edge.afterTransition, normalizedContext, event, machineId, entityId, transitionCtx, { cancellable: false, hookLabel: 'after-transition', stateName: `${currentState}->${targetState}` });
      }

      if (isFinalize) {
        await executeMachineHooks(plugin, machineId, 'afterFinalize', normalizedContext, event, entityId, transitionCtx, { cancellable: false });
      }

      await executeMachineHooks(plugin, machineId, 'afterTransition', normalizedContext, event, entityId, transitionCtx, { cancellable: false });
    } catch (afterHookError) {
      const errMsg = afterHookError instanceof Error ? afterHookError.message : String(afterHookError);
      afterHookErrors.push(errMsg);
      plugin.logger.error({ machineId, entityId, event, from: currentState, to: targetState, error: errMsg },
        `Post-persist hook failed (transition already committed): ${errMsg}`);
      try {
        await executeMachineHooks(plugin, machineId, 'afterError', { ...normalizedContext, error: errMsg }, event, entityId, transitionCtx, { cancellable: false });
      } catch (_) { /* afterError itself failed -- nothing more we can do */ }
    }

    const endedAt = new Date().toISOString();
    const elapsedMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

    const transitionContext = buildTransitionContext(
      machineId,
      entityId,
      event,
      startedAt,
      endedAt,
      {
        correlationId,
        context: normalizedContext,
        from: currentState,
        to: targetState,
        stateVersion: transitionedStateVersion
      }
    );

    plugin.emit('plg:state-machine:transition', {
      ...transitionContext,
      to: targetState
    });

    plugin.emit('plg:state-machine:after-transition', {
      ...transitionContext,
      to: targetState
    });

    return {
      ok: true,
      state: targetState,
      from: currentState,
      to: targetState,
      event,
      timestamp: endedAt,
      machineId,
      entityId,
      context: normalizedContext,
      stateVersion: transitionedStateVersion,
      correlationId,
      startedAt,
      endedAt,
      elapsedMs,
      ...(afterHookErrors.length > 0 ? { afterHookErrors } : {})
    };
  } catch (error) {
    try {
      await executeMachineHooks(plugin, machineId, 'afterError',
        { ...normalizedContext, error: error instanceof Error ? error.message : String(error) },
        event, entityId,
        { from: currentState, to: targetState, event, machineId, entityId } as Partial<TransitionContext>,
        { cancellable: false });
    } catch (_hookErr) {
      plugin.logger.warn({ hookError: (_hookErr as Error)?.message }, 'afterError hook failed');
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const details: Record<string, unknown> = {
      operation: undefined as string | undefined,
      originalError: message
    };

    if (error instanceof StateMachineError) {
      const stateMachineError = error as Error & {
        operation?: string;
        guardName?: string;
        currentState?: string;
        targetState?: string;
        data?: Record<string, unknown>;
      };
      const operation = stateMachineError.operation || (typeof stateMachineError.data?.operation === 'string' ? stateMachineError.data.operation : undefined);

      details.operation = operation;
      let code: TransitionRejectedResult['code'] = 'INTERNAL_ERROR';
      let reason = 'INTERNAL_ERROR';

      if (operation === 'send') {
        if (machine.concurrency.conflict === 'drop') {
          code = 'CONCURRENCY_CONFLICT';
          reason = 'CONCURRENCY_CONFLICT_DROP';
        } else {
          code = 'CONCURRENCY_CONFLICT';
          reason = 'CONCURRENCY_CONFLICT';
        }
      } else if (operation === 'guard-not-found') {
        code = 'GUARD_NOT_FOUND';
        reason = 'GUARD_NOT_FOUND';
      } else if (operation === 'guard') {
        code = 'GUARD_REJECTED';
        reason = 'MISSING_REQUIRED_FIELD';
      } else if (operation === 'state-version-mismatch') {
        code = 'STATE_VERSION_MISMATCH';
        reason = 'STATE_VERSION_MISMATCH';
      } else if (operation === 'action-not-found') {
        code = 'ACTION_NOT_FOUND';
        reason = 'ACTION_NOT_FOUND';
      } else if (operation === 'hook-not-found') {
        code = 'HOOK_NOT_FOUND';
        reason = 'HOOK_NOT_FOUND';
      }

      return buildFailure(
        code,
        reason,
        error.message,
        {
          ...details,
          ...stateMachineError.data
        },
        {
          state: stateMachineError.currentState || currentState,
          from: stateMachineError.currentState || currentState,
          to: stateMachineError.targetState,
          guard: stateMachineError.guardName
        }
      );
    }

    return buildFailure('INTERNAL_ERROR', 'INTERNAL_ERROR', message, details);
  } finally {
    await plugin.releaseTransitionLock(lock);
  }
}

export async function assertTransition<TMachineEvents extends MachineEventPayloadMap = Record<string, Record<string, Record<string, unknown>>>, TMachine extends keyof TMachineEvents & string = string, TEvent extends keyof TMachineEvents[TMachine] & string = string>(
  plugin: TransitionEngineContext,
  params: TransitionAssertionSuccessParams<TMachine, TEvent> & { context?: TMachineEvents[TMachine][TEvent] }
): Promise<TransitionSuccessResult> {
  const result = await send(
    plugin,
    params.machineId,
    params.entityId,
    params.event,
    (params.context || {}) as TMachineEvents[TMachine][TEvent]
  );

  if (!result.ok) {
    contractAssertionFailure('Expected transition to be accepted, but it was rejected', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedTo: params.to,
      expectedFrom: params.from,
      expectedStateVersion: params.stateVersion,
      result
    });
  }

  if (params.from && result.from !== params.from) {
    contractAssertionFailure('Transition started from a different state than expected', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedFrom: params.from,
      actualFrom: result.from
    });
  }

  if (result.to !== params.to) {
    contractAssertionFailure('Transition ended in a different state than expected', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedTo: params.to,
      actualTo: result.to
    });
  }

  if (typeof params.stateVersion === 'number' && result.stateVersion !== params.stateVersion) {
    contractAssertionFailure('Transition state version does not match expected value', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedStateVersion: params.stateVersion,
      actualStateVersion: result.stateVersion
    });
  }

  return result as TransitionSuccessResult;
}

export async function assertReject<TMachineEvents extends MachineEventPayloadMap = Record<string, Record<string, Record<string, unknown>>>, TMachine extends keyof TMachineEvents & string = string, TEvent extends keyof TMachineEvents[TMachine] & string = string>(
  plugin: TransitionEngineContext,
  params: TransitionAssertionRejectParams<TMachine, TEvent> & { context?: TMachineEvents[TMachine][TEvent] }
): Promise<TransitionRejectedResult> {
  const result = await send(
    plugin,
    params.machineId,
    params.entityId,
    params.event,
    (params.context || {}) as TMachineEvents[TMachine][TEvent]
  );

  if (result.ok) {
    contractAssertionFailure('Expected transition to be rejected, but it succeeded', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedTo: params.to || null,
      actualResult: result
    });
  }

  if (params.code && result.code !== params.code) {
    contractAssertionFailure('Transition rejection code does not match expected code', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedCode: params.code,
      actualCode: result.code
    });
  }

  if (params.reason && result.reason !== params.reason) {
    contractAssertionFailure('Transition rejection reason does not match expected reason', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedReason: params.reason,
      actualReason: result.reason
    });
  }

  if (params.from && result.from !== params.from) {
    contractAssertionFailure('Rejected transition started from a different state than expected', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedFrom: params.from,
      actualFrom: result.from
    });
  }

  if (params.to && result.to !== params.to) {
    contractAssertionFailure('Rejected transition targeted an unexpected state', {
      machineId: params.machineId,
      entityId: params.entityId,
      event: params.event,
      expectedTo: params.to,
      actualTo: result.to
    });
  }

  return result as TransitionRejectedResult;
}

export function sendInternal(
  plugin: TransitionEngineContext,
  machineId: string,
  entityId: string,
  event: string,
  context: Record<string, unknown> = {}
): Promise<TransitionResult> {
  return send(plugin, machineId, entityId, event, context);
}

export async function transitionToTargetState(
  plugin: TransitionEngineContext,
  machineId: string,
  entityId: string,
  targetState: string,
  event: string,
  context: Record<string, unknown>
): Promise<{ from: string; to: string; stateVersion: number; cancelled?: boolean }> {
  const machine = plugin.machines.get(machineId);
  if (!machine) {
    throw new StateMachineError(`State machine '${machineId}' not found`, {
      operation: 'target-state-transition',
      machineId,
      entityId,
      targetState
    });
  }

  if (!machine.config.states[targetState]) {
    throw new StateMachineError(`Target state '${targetState}' is not defined in machine '${machineId}'`, {
      operation: 'target-state-transition',
      machineId,
      entityId,
      targetState
    });
  }

  const lock = machine.concurrency.mode === 'parallel' ? null : await plugin.acquireTransitionLock(machineId, entityId);
  const transitionStartedAt = new Date().toISOString();
  const transitionCorrelationId = getCorrelationId(context, machineId, entityId, event);

  try {
    const { state: fromState, version: fromStateVersion } = await plugin.getStateSnapshot(machineId, entityId);
    if (fromState === targetState) {
      return { from: fromState, to: targetState, stateVersion: fromStateVersion };
    }

    const fromStateConfig = machine.config.states[fromState];
    const targetStateConfig = machine.config.states[targetState];

    const guardName = findGuardForTargetState(machine.config, fromState, targetState, event);
    if (guardName) {
      const guard = plugin.config.guards[guardName];
      if (guard) {
        const resource = await plugin.getAttachedResource(machineId);
        const entity = resource ? await resource.get(entityId).catch(() => null) as Record<string, unknown> | null : null;
        const [guardOk, , guardResult] = await tryFn(async () =>
          guard(context, event, {
            database: plugin.database as unknown as Database,
            machineId,
            entityId,
            resource,
            entity,
            machineContext: {},
            assign: () => {}
          })
        );
        if (!guardOk || !guardResult) {
          return { from: fromState, to: fromState, stateVersion: fromStateVersion, cancelled: true };
        }
      }
    }

    const triggerTransitionCtx: Partial<TransitionContext> = {
      machineId,
      entityId,
      event,
      from: fromState,
      to: targetState,
      startedAt: transitionStartedAt,
      correlationId: transitionCorrelationId,
      context
    };

    const isFinalize = targetStateConfig?.type === 'final';

    const btResult = await executeMachineHooks(plugin, machineId, 'beforeTransition', context, event, entityId, triggerTransitionCtx, { cancellable: true });
    if (btResult.cancelled) {
      return { from: fromState, to: fromState, stateVersion: fromStateVersion, cancelled: true };
    }

    const beforeLeaveHooks = resolveHooks(fromStateConfig, 'beforeLeave', 'exit');
    if (beforeLeaveHooks.length > 0) {
      const blResult = await executeHooks(plugin, beforeLeaveHooks, context, event, machineId, entityId, triggerTransitionCtx, { cancellable: true, hookLabel: 'before-leave', stateName: fromState });
      if (blResult.cancelled) {
        return { from: fromState, to: fromState, stateVersion: fromStateVersion, cancelled: true };
      }
    }

    const beforeEnterHooks = resolveHooks(targetStateConfig, 'beforeEnter');
    if (beforeEnterHooks.length > 0) {
      const beResult = await executeHooks(plugin, beforeEnterHooks, context, event, machineId, entityId, triggerTransitionCtx, { cancellable: true, hookLabel: 'before-enter', stateName: targetState });
      if (beResult.cancelled) {
        return { from: fromState, to: fromState, stateVersion: fromStateVersion, cancelled: true };
      }
    }

    if (isFinalize) {
      const bfResult = await executeMachineHooks(plugin, machineId, 'beforeFinalize', context, event, entityId, triggerTransitionCtx, { cancellable: true });
      if (bfResult.cancelled) {
        return { from: fromState, to: fromState, stateVersion: fromStateVersion, cancelled: true };
      }
    }

    const nextStateVersion = await plugin.persistTransition(machineId, entityId, fromState, targetState, event, context, fromStateVersion);
    const endedAt = new Date().toISOString();

    try {
      const afterLeaveHooks = resolveHooks(fromStateConfig, 'afterLeave');
      if (afterLeaveHooks.length > 0) {
        await executeHooks(plugin, afterLeaveHooks, context, event, machineId, entityId, triggerTransitionCtx, { cancellable: false, hookLabel: 'after-leave', stateName: fromState });
      }

      const afterEnterHooks = resolveHooks(targetStateConfig, 'afterEnter', 'entry');
      if (afterEnterHooks.length > 0) {
        await executeHooks(plugin, afterEnterHooks, context, event, machineId, entityId, triggerTransitionCtx, { cancellable: false, hookLabel: 'after-enter', stateName: targetState });
      }

      if (isFinalize) {
        await executeMachineHooks(plugin, machineId, 'afterFinalize', context, event, entityId, triggerTransitionCtx, { cancellable: false });
      }

      await executeMachineHooks(plugin, machineId, 'afterTransition', context, event, entityId, triggerTransitionCtx, { cancellable: false });
    } catch (afterHookError) {
      const errMsg = afterHookError instanceof Error ? afterHookError.message : String(afterHookError);
      plugin.logger.error({ machineId, entityId, event, from: fromState, to: targetState, error: errMsg },
        `Post-persist hook failed in trigger transition (already committed): ${errMsg}`);
      try {
        await executeMachineHooks(plugin, machineId, 'afterError', { ...context, error: errMsg }, event, entityId, triggerTransitionCtx, { cancellable: false });
      } catch (_) { /* swallow */ }
    }

    plugin.emit('plg:state-machine:transition', {
      machineId,
      entityId,
      from: fromState,
      to: targetState,
      event,
      context,
      correlationId: transitionCorrelationId,
      startedAt: transitionStartedAt,
      endedAt,
      elapsedMs: new Date(endedAt).getTime() - new Date(transitionStartedAt).getTime(),
      stateVersion: nextStateVersion
    });

    return { from: fromState, to: targetState, stateVersion: nextStateVersion };
  } finally {
    await plugin.releaseTransitionLock(lock);
  }
}
