import type {
  TransitionEdge,
  ConditionalTarget,
  StateConfig,
  MachineConfig,
  TransitionContext,
  RetryConfig,
  RawTransitionRecord,
  TransitionRecord,
  TransitionHistoryEntry,
  TransitionQueryOptions,
  TransitionSortOrder
} from './types.js';

export function resolveEdge(edgeConfig: string | TransitionEdge | ConditionalTarget): { target: string; guard: string | undefined; beforeTransition: string[]; afterTransition: string[] } {
  if (typeof edgeConfig === 'string') {
    return { target: edgeConfig, guard: undefined, beforeTransition: [], afterTransition: [] };
  }

  if (typeof edgeConfig === 'object' && edgeConfig !== null) {
    const bt = (edgeConfig as TransitionEdge).beforeTransition;
    const at = (edgeConfig as TransitionEdge).afterTransition;
    return {
      target: (edgeConfig as TransitionEdge).target,
      guard: (edgeConfig as TransitionEdge).guard || undefined,
      beforeTransition: bt ? (Array.isArray(bt) ? bt : [bt]) : [],
      afterTransition: at ? (Array.isArray(at) ? at : [at]) : []
    };
  }

  return { target: String(edgeConfig), guard: undefined, beforeTransition: [], afterTransition: [] };
}

export function resolveHooks(stateConfig: StateConfig | undefined, hookName: string, legacyField?: string): string[] {
  const explicit = stateConfig?.[hookName] as string | string[] | undefined;
  const legacy = legacyField ? stateConfig?.[legacyField] as string | string[] | undefined : undefined;
  const explicitArr: string[] = explicit ? (Array.isArray(explicit) ? explicit : [explicit]) : [];
  const legacyArr: string[] = legacy ? (Array.isArray(legacy) ? legacy : [legacy]) : [];
  const merged = [...legacyArr, ...explicitArr];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of merged) {
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function findGuardForTargetState(config: MachineConfig, fromState: string, targetState: string, event: string): string | undefined {
  const stateConfig = config.states[fromState];
  if (!stateConfig?.on) return undefined;

  for (const [, edgeConfig] of Object.entries(stateConfig.on)) {
    if (Array.isArray(edgeConfig)) {
      for (const candidate of edgeConfig as ConditionalTarget[]) {
        const edge = resolveEdge(candidate);
        if (edge.target === targetState && edge.guard) return edge.guard;
      }
    } else {
      const edge = resolveEdge(edgeConfig as string | TransitionEdge);
      if (edge.target === targetState && edge.guard) return edge.guard;
    }
  }

  if (stateConfig.guards) {
    for (const [evt, guardName] of Object.entries(stateConfig.guards)) {
      const edgeConfig = stateConfig.on[evt];
      if (!edgeConfig) continue;
      const edge = resolveEdge(
        Array.isArray(edgeConfig) ? (edgeConfig as ConditionalTarget[])[0]! : edgeConfig as string | TransitionEdge
      );
      if (edge.target === targetState) return guardName;
    }
  }

  const wildcardConfig = config.states['*'];
  if (wildcardConfig?.on) {
    for (const [, edgeConfig] of Object.entries(wildcardConfig.on)) {
      if (Array.isArray(edgeConfig)) {
        for (const candidate of edgeConfig as ConditionalTarget[]) {
          const edge = resolveEdge(candidate);
          if (edge.target === targetState && edge.guard) return edge.guard;
        }
      } else {
        const edge = resolveEdge(edgeConfig as string | TransitionEdge);
        if (edge.target === targetState && edge.guard) return edge.guard;
      }
    }
  }

  return undefined;
}

export function buildTransitionContext(
  machineId: string,
  entityId: string,
  event: string,
  startedAt: string,
  endedAt: string,
  options: {
    correlationId: string;
    context: Record<string, unknown>;
    from?: string;
    to?: string;
    guard?: string;
    stateVersion?: number;
    error?: string;
  }
): TransitionContext {
  const elapsedMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

  return {
    machineId,
    entityId,
    event,
    from: options.from,
    to: options.to,
    guard: options.guard,
    stateVersion: options.stateVersion,
    context: options.context,
    correlationId: options.correlationId,
    startedAt,
    endedAt,
    elapsedMs,
    error: options.error
  };
}

export function getCorrelationId(context: Record<string, unknown>, machineId: string, entityId: string, event: string): string {
  const provided = context?.correlationId;
  if (typeof provided === 'string' && provided.length > 0) {
    return provided;
  }

  return `${machineId}:${entityId}:${event}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;
}

export function contractAssertionFailure(message: string, details: Record<string, unknown>): never {
  const error = new Error(`[state-machine contract] ${message}`);
  (error as Error & { details?: Record<string, unknown> }).details = details;
  throw error;
}

export function calculateBackoff(attempt: number, retryConfig: RetryConfig): number {
  const {
    backoffStrategy = 'exponential',
    baseDelay = 1000,
    maxDelay = 30000
  } = retryConfig || {};

  let delay: number;

  if (backoffStrategy === 'exponential') {
    delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  } else if (backoffStrategy === 'linear') {
    delay = Math.min(baseDelay * attempt, maxDelay);
  } else {
    delay = baseDelay;
  }

  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return Math.round(delay + jitter);
}

export function parseDuration(value: number | string): number {
  if (typeof value === 'number') return value;
  const str = String(value).trim().toLowerCase();
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/);
  if (!match) return parseInt(str, 10) || 0;
  const num = parseFloat(match[1]!);
  const unit = match[2]! as 'ms' | 's' | 'm' | 'h' | 'd';
  const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Math.round(num * (multipliers[unit] || 1));
}

export function toEpoch(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }

  const epoch = new Date(value).getTime();
  return Number.isNaN(epoch) ? 0 : epoch;
}

export function normalizeTransitionRecord(record: RawTransitionRecord | TransitionRecord): TransitionHistoryEntry {
  return {
    id: record.id,
    machineId: record.machineId,
    entityId: record.entityId,
    from: record.fromState,
    to: record.toState,
    event: record.event,
    context: record.context,
    timestamp: new Date(toEpoch(record.timestamp)).toISOString()
  };
}

export function applyTransitionFilters(
  transitions: TransitionHistoryEntry[],
  options: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>
): TransitionHistoryEntry[] {
  const fromTimestamp = toEpoch(options.from || '');
  const toTimestamp = toEpoch(options.to || '');

  const hasFromFilter = typeof options.from === 'string' && options.from.trim().length > 0;
  const hasToFilter = typeof options.to === 'string' && options.to.trim().length > 0;

  return transitions.filter((entry) => {
    if (options.event && entry.event !== options.event) {
      return false;
    }

    if (options.fromState && entry.from !== options.fromState) {
      return false;
    }

    if (options.toState && entry.to !== options.toState) {
      return false;
    }

    if (hasFromFilter || hasToFilter) {
      const transitionTs = toEpoch(entry.timestamp);
      if (hasFromFilter && transitionTs < fromTimestamp) {
        return false;
      }

      if (hasToFilter && transitionTs > toTimestamp) {
        return false;
      }
    }

    return true;
  });
}

export function sortTransitions(transitions: TransitionHistoryEntry[], sort: TransitionSortOrder = 'desc'): TransitionHistoryEntry[] {
  const sorted = [...transitions];
  sorted.sort((a, b) => {
    const aTs = toEpoch(a.timestamp);
    const bTs = toEpoch(b.timestamp);

    return sort === 'desc'
      ? bTs - aTs
      : aTs - bTs;
  });

  return sorted;
}
