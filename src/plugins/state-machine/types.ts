import { Plugin } from '../plugin.class.js';

export const TRANSITION_HISTORY_PAGE_SIZE = 1000;

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

export interface Resource {
  $schema?: {
    stateMachine?: string | ResourceStateMachineBinding;
    [key: string]: unknown;
  };
  name: string;
  insert(data: Record<string, unknown>): Promise<unknown>;
  update(id: string, data: Record<string, unknown>): Promise<unknown>;
  patch(id: string, data: Record<string, unknown>): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  get(id: string): Promise<Record<string, unknown> | null>;
  query(filter: Record<string, unknown>, options?: QueryOptions): Promise<Record<string, unknown>[]>;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

export interface ResourceStateMachineBinding {
  machine: string;
  stateField?: string;
  autoCleanup?: boolean;
}

export interface ResolvedStateMachineBinding extends ResourceStateMachineBinding {
  resourceName: string;
  resource: Resource;
}

export interface ResourceWithSchema extends Resource {
  $schema?: {
    stateMachine?: string | ResourceStateMachineBinding;
  };
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  partition?: string | null;
  partitionValues?: Record<string, unknown>;
}

export interface StateRecord {
  id: string;
  machineId: string;
  entityId: string;
  currentState: string;
  context: Record<string, unknown>;
  lastTransition: string | null;
  stateVersion?: number;
  triggerCounts?: Record<string, number>;
  updatedAt: string;
}

export interface TransitionRecord {
  id: string;
  machineId: string;
  entityId: string;
  fromState: string;
  toState: string;
  event: string;
  context: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface RawTransitionRecord extends Omit<TransitionRecord, 'timestamp'> {
  timestamp: string | number;
}

export interface PluginStorage {
  acquireLock(name: string, options: LockOptions): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
}

export interface LockOptions {
  ttl: number;
  timeout: number;
  workerId: string;
}

export interface Lock {
  name: string;
}

export interface Database {
  resources: Record<string, Resource>;
  pluginRegistry: PluginRegistry;
  createResource(config: ResourceConfig): Promise<Resource>;
  usePlugin(plugin: Plugin): Promise<void>;
  getResource(name: string): Promise<Resource>;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

export interface PluginRegistry {
  [key: string]: Plugin;
}

export interface ResourceConfig {
  name: string;
  attributes: Record<string, string>;
  partitions?: Record<string, { fields: Record<string, string> }>;
  behavior?: string;
}

export type ActionHandler = (context: Record<string, unknown>, event: string, machine: ActionContext) => Promise<unknown>;
export type GuardHandler = (context: Record<string, unknown>, event: string, machine: ActionContext) => Promise<boolean>;
export type ConditionHandler = (context: Record<string, unknown>, entityId: string, eventData?: unknown) => Promise<boolean>;
export type EventNameResolver = (context: Record<string, unknown>) => string;

export interface ActionContext {
  database: Database;
  machineId: string;
  entityId: string;
  resource?: Resource | null;
  entity?: Record<string, unknown> | null;
  machineContext?: Record<string, unknown>;
  assign?: (partial: Record<string, unknown>) => void;
}

export interface TransitionEdge {
  target: string;
  guard?: string;
  beforeTransition?: string | string[];
  afterTransition?: string | string[];
}

export type ConditionalTarget = TransitionEdge;

export interface StateTTL {
  after: number | string;
  send: string;
}

export interface StateConfig {
  on?: Record<string, string | TransitionEdge | ConditionalTarget[]>;
  type?: 'final';
  /** @deprecated Use `afterEnter` instead. Kept for backward compatibility. */
  entry?: string | string[];
  /** @deprecated Use `beforeLeave` instead. Kept for backward compatibility. */
  exit?: string | string[];
  guards?: Record<string, string>;
  meta?: Record<string, unknown>;
  triggers?: TriggerConfig[];
  retryConfig?: RetryConfig;
  beforeLeave?: string | string[];
  beforeEnter?: string | string[];
  afterLeave?: string | string[];
  afterEnter?: string | string[];
  ttl?: StateTTL;
  [key: string]: unknown;
}

export type ConcurrencyMode = 'serial' | 'parallel';
export type ConcurrencyConflictPolicy = 'reject' | 'drop';

export interface ConcurrencyConfig {
  mode: ConcurrencyMode;
  conflict: ConcurrencyConflictPolicy;
}

export interface TriggerConfig {
  type: 'cron' | 'date' | 'function' | 'event';
  action?: string;
  schedule?: string;
  field?: string;
  interval?: number;
  event?: string;
  eventName?: string | EventNameResolver;
  eventSource?: Resource;
  condition?: ConditionHandler;
  maxTriggers?: number;
  onMaxTriggersReached?: string;
  eventOnSuccess?: string;
  sendEvent?: string;
  targetState?: string;
}

export interface MachineHooks {
  beforeTransition?: string | string[];
  afterTransition?: string | string[];
  beforeFinalize?: string | string[];
  afterFinalize?: string | string[];
  afterReject?: string | string[];
  afterError?: string | string[];
  afterInitialize?: string | string[];
  afterDelete?: string | string[];
  [key: string]: string | string[] | undefined;
}

export interface MachineConfig {
  initialState: string;
  states: Record<string, StateConfig>;
  resource?: string | Resource;
  stateField?: string;
  retryConfig?: RetryConfig;
  autoCleanup?: boolean;
  config?: MachineConfig;
  hooks?: MachineHooks;
  concurrency?: {
    mode?: ConcurrencyMode;
    conflict?: ConcurrencyConflictPolicy;
  };
}

export interface RetryConfig {
  maxAttempts?: number;
  backoffStrategy?: 'exponential' | 'linear' | 'fixed';
  baseDelay?: number;
  maxDelay?: number;
  retryableErrors?: string[];
  nonRetriableErrors?: string[];
  onRetry?: (attempt: number, error: Error, context: Record<string, unknown>) => Promise<void>;
}

export interface SchedulerConfig {
  [key: string]: unknown;
}

export interface SchedulerJob {
  schedule: string;
  description: string;
  action: (database: Database, context: Record<string, unknown>) => Promise<{ processed: number; executed: number }>;
}

export interface TriggerListenerRef {
  emitter: {
    on?: (eventName: string, handler: (...args: unknown[]) => unknown) => void;
    off?: (eventName: string, handler: (...args: unknown[]) => unknown) => void;
    removeListener?: (eventName: string, handler: (...args: unknown[]) => unknown) => void;
  };
  eventName: string;
  handler: (...args: unknown[]) => unknown;
}

export type TransitionSortOrder = 'asc' | 'desc';

export interface StateMachinePluginOptions {
  resourceNames?: {
    transitionLog?: string;
    states?: string;
  };
  stateMachines?: Record<string, MachineConfig>;
  actions?: Record<string, ActionHandler>;
  guards?: Record<string, GuardHandler>;
  persistTransitions?: boolean;
  transitionLogResource?: string;
  stateResource?: string;
  concurrency?: {
    mode?: ConcurrencyMode;
    conflict?: ConcurrencyConflictPolicy;
  };
  retryAttempts?: number;
  retryDelay?: number;
  workerId?: string;
  lockTimeout?: number;
  lockTTL?: number;
  retryConfig?: RetryConfig | null;
  enableScheduler?: boolean;
  schedulerConfig?: SchedulerConfig;
  enableDateTriggers?: boolean;
  enableFunctionTriggers?: boolean;
  enableEventTriggers?: boolean;
  triggerCheckInterval?: number;
  logLevel?: string;
  [key: string]: unknown;
}

export interface StateMachineConfig {
  stateMachines: Record<string, MachineConfig>;
  actions: Record<string, ActionHandler>;
  guards: Record<string, GuardHandler>;
  persistTransitions: boolean;
  transitionLogResource: string;
  stateResource: string;
  concurrency: ConcurrencyConfig;
  retryAttempts: number;
  retryDelay: number;
  workerId: string;
  lockTimeout: number;
  lockTTL: number;
  retryConfig: RetryConfig | null;
  enableScheduler: boolean;
  schedulerConfig: SchedulerConfig;
  enableDateTriggers: boolean;
  enableFunctionTriggers: boolean;
  enableEventTriggers: boolean;
  triggerCheckInterval: number;
  logLevel?: string;
}

export interface MachineData {
  config: MachineConfig;
  currentStates: Map<string, string>;
  currentStateVersions: Map<string, number>;
  concurrency: ConcurrencyConfig;
}

export interface ResourceNames {
  transitionLog: string;
  states: string;
}

export interface ResourceDescriptor {
  defaultName: string;
  override?: string;
}

export interface TransitionResult {
  ok: boolean;
  machineId?: string;
  entityId?: string;
  event?: string;
  state?: string;
  from?: string;
  to?: string;
  guard?: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  startedAt?: string;
  endedAt?: string;
  elapsedMs?: number;
  code?: string;
  reason?: string;
  details?: Record<string, unknown>;
  message?: string;
  timestamp?: string;
  stateVersion?: number;
}

export interface TransitionSuccessResult extends TransitionResult {
  ok: true;
  from: string;
  to: string;
  event: string;
  timestamp: string;
  machineId: string;
  entityId: string;
  context: Record<string, unknown>;
  correlationId: string;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  stateVersion: number;
  afterHookErrors?: string[];
}

export interface TransitionRejectedResult extends TransitionResult {
  ok: false;
  code: 'MACHINE_NOT_FOUND' | 'INVALID_EVENT' | 'GUARD_NOT_FOUND' | 'GUARD_REJECTED' | 'GUARD_ERROR' | 'ACTION_NOT_FOUND' | 'TRANSITION_LOCK_TIMEOUT' | 'CONCURRENCY_CONFLICT' | 'STATE_VERSION_MISMATCH' | 'INTERNAL_ERROR' | 'HOOK_REJECTED' | 'HOOK_ERROR' | 'HOOK_NOT_FOUND' | 'NO_MATCHING_TARGET';
  reason: string;
  details: Record<string, unknown>;
}

export interface TransitionAssertionSuccessParams<TMachine extends string = string, TEvent extends string = string> {
  machineId: TMachine;
  entityId: string;
  event: TEvent;
  from?: string;
  to: string;
  stateVersion?: number;
  context?: Record<string, unknown>;
}

export interface TransitionAssertionRejectParams<TMachine extends string = string, TEvent extends string = string> {
  machineId: TMachine;
  entityId: string;
  event: TEvent;
  code?: TransitionRejectedResult['code'];
  reason?: string;
  from?: string;
  to?: string;
  context?: Record<string, unknown>;
}

export type MachineEventPayloadMap = Record<string, Record<string, Record<string, unknown>>>;

export interface MachineDefinitionIssue {
  code:
    | 'MISSING_TARGET_STATE'
    | 'MISSING_GUARD'
    | 'MISSING_ACTION'
    | 'MISSING_HOOK_ACTION'
    | 'DUPLICATE_HOOK_ACTION'
    | 'STATE_WITHOUT_TRANSITIONS'
    | 'UNREACHABLE_STATE'
    | 'ORPHAN_STATE';
  message: string;
  state?: string;
  event?: string;
  targetState?: string;
  guardName?: string;
  actionName?: string;
}

export interface MachineDefinitionDiagnostics {
  machineId: string;
  errors: MachineDefinitionIssue[];
  warnings: MachineDefinitionIssue[];
  stats: {
    states: number;
    transitions: number;
    deadStates: string[];
    unreachableStates: string[];
  };
}

export interface TransitionHistoryEntry {
  id?: string;
  machineId?: string;
  entityId?: string;
  from: string;
  to: string;
  event: string;
  context: Record<string, unknown>;
  timestamp: string;
}

export interface TransitionHistoryOptions {
  limit?: number;
  offset?: number;
}

export interface TransitionQueryOptions {
  limit?: number;
  offset?: number;
  sort?: TransitionSortOrder;
  from?: string;
  to?: string;
  event?: string;
  fromState?: string;
  toState?: string;
}

export interface StateMachineSnapshot {
  machineId: string;
  entityId: string;
  state: string;
  stateVersion: number;
  context: Record<string, unknown>;
  lastTransition: string | null;
  triggerCounts: Record<string, number>;
  updatedAt: string;
  persisted: boolean;
}

export interface EntityInState {
  entityId: string;
  currentState: string;
  context: Record<string, unknown>;
  triggerCounts: Record<string, number>;
}

export interface TransitionContext {
  machineId: string;
  entityId: string;
  event: string;
  from?: string;
  to?: string;
  guard?: string;
  stateVersion?: number;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  correlationId: string;
  context: Record<string, unknown>;
  error?: string;
}

export interface MachineProxy {
  send(id: string, event: string, eventData?: Record<string, unknown>): Promise<TransitionResult>;
  getState(id: string): Promise<string>;
  canTransition(id: string, event: string): Promise<boolean>;
  getValidEvents(id: string): Promise<string[]>;
  initializeEntity(id: string, context?: Record<string, unknown>): Promise<string>;
  transitions(id: string, options?: TransitionQueryOptions): Promise<TransitionHistoryEntry[]>;
  transition(id: string, transitionId: string): Promise<TransitionHistoryEntry | null>;
  transitionCount(id: string, options?: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>): Promise<number>;
  getTransitions(id: string, options?: TransitionQueryOptions): Promise<TransitionHistoryEntry[]>;
  getTransitionHistory(id: string, options?: TransitionHistoryOptions): Promise<TransitionHistoryEntry[]>;
  getTransitionCount(id: string, options?: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>): Promise<number>;
  getSnapshot(id: string): Promise<StateMachineSnapshot>;
  snapshot(id: string): Promise<StateMachineSnapshot>;
  getTransition(id: string, transitionId: string): Promise<TransitionHistoryEntry | null>;
  getLastTransitions(id: string, limit?: number): Promise<TransitionHistoryEntry[]>;
  deleteEntity(id: string): Promise<void>;
}

export interface SchedulerPluginClass {
  new(options: Record<string, unknown>): Plugin & { stop(): Promise<void> };
}

export interface StateMachinePluginContext {
  config: StateMachineConfig;
  machines: Map<string, MachineData>;
  database: any;
  logger: Logger;
  logLevel: string;
  triggerJobNames: string[];
  schedulerPlugin: (Plugin & { stop(): Promise<void> }) | null;
  _pendingEventHandlers: Set<Promise<void>>;
  _triggerListeners: TriggerListenerRef[];
  emit(event: string, data: unknown): void;
  getStorage(): any;
  send(machineId: string, entityId: string, event: string, context: Record<string, unknown>): Promise<TransitionResult>;
  getState(machineId: string, entityId: string): Promise<string>;
  getValidEvents(machineId: string, stateOrEntityId: string): Promise<string[]>;
  getTransitions(machineId: string, entityId: string, options?: TransitionQueryOptions): Promise<TransitionHistoryEntry[]>;
  getTransitionHistory(machineId: string, entityId: string, options?: TransitionHistoryOptions): Promise<TransitionHistoryEntry[]>;
  getTransition(machineId: string, entityId: string, transitionId: string): Promise<TransitionHistoryEntry | null>;
  getTransitionCount(machineId: string, entityId: string, options?: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>): Promise<number>;
  getLastTransitions(machineId: string, entityId: string, limit?: number): Promise<TransitionHistoryEntry[]>;
  getSnapshot(machineId: string, entityId: string): Promise<StateMachineSnapshot>;
  initializeEntity(machineId: string, entityId: string, context?: Record<string, unknown>): Promise<string>;
  deleteEntity(machineId: string, entityId: string): Promise<void>;
  getAttachedResource(machineId: string): Promise<Resource | null>;
  getStateResource(): Resource | null;
  getTransitionLogResource(): Resource | null;
  getStateSnapshot(machineId: string, entityId: string): Promise<{ state: string; version: number }>;
  setInMemoryState(machineId: string, entityId: string, state: string, version: number): void;
  acquireTransitionLock(machineId: string, entityId: string): Promise<Lock | null>;
  releaseTransitionLock(lock: Lock | null): Promise<void>;
  persistTransition(machineId: string, entityId: string, fromState: string, toState: string, event: string, context: Record<string, unknown>, fromStateVersion?: number): Promise<number>;
  transitionToTargetState(machineId: string, entityId: string, targetState: string, event: string, context: Record<string, unknown>): Promise<{ from: string; to: string; stateVersion: number; cancelled?: boolean }>;
  executeAction(actionName: string, context: Record<string, unknown>, event: string, machineId: string, entityId: string, transitionContext?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void }): Promise<unknown>;
  executeHooks(hookNames: string[], context: Record<string, unknown>, event: string, machineId: string, entityId: string, transitionCtx?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void }, options?: { cancellable?: boolean; hookLabel?: string; stateName?: string }): Promise<{ cancelled: boolean; action?: string }>;
  executeMachineHooks(machineId: string, hookName: string, context: Record<string, unknown>, event: string, entityId: string, transitionCtx?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void }, options?: { cancellable?: boolean }): Promise<{ cancelled: boolean; action?: string }>;
  resolveHooks(stateConfig: StateConfig | undefined, hookName: string, legacyField?: string): string[];
  hasTTLStates(machineId: string): boolean;
  cancelTTL(machineId: string, entityId: string): void;
  scheduleTTL(machineId: string, entityId: string, stateConfig?: StateConfig): void;
  wrapEventHandler(handler: (...args: unknown[]) => unknown): (...args: unknown[]) => void;
}
