import { Plugin } from './plugin.class.js';
import tryFn from '../concerns/try-fn.js';
import { resolveResourceNames } from './concerns/resource-names.js';
import { StateMachineError } from './state-machine.errors.js';
import { ErrorClassifier } from '../concerns/error-classifier.js';
import { getCronManager } from '../concerns/cron-manager.js';

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

const TRANSITION_HISTORY_PAGE_SIZE = 1000;

interface Resource {
  $schema?: {
    stateMachine?: string | ResourceStateMachineBinding;
    [key: string]: unknown;
  };
  name: string;
  insert(data: Record<string, unknown>): Promise<unknown>;
  update(id: string, data: Record<string, unknown>): Promise<unknown>;
  patch(id: string, data: Record<string, unknown>): Promise<unknown>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<StateRecord | null>;
  query(filter: Record<string, unknown>, options?: QueryOptions): Promise<RawTransitionRecord[]>;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface ResourceStateMachineBinding {
  machine: string;
  stateField?: string;
  autoCleanup?: boolean;
}

interface ResolvedStateMachineBinding extends ResourceStateMachineBinding {
  resourceName: string;
  resource: Resource;
}

interface ResourceWithSchema extends Resource {
  $schema?: {
    stateMachine?: string | ResourceStateMachineBinding;
  };
}

interface QueryOptions {
  limit?: number;
  offset?: number;
  partition?: string | null;
  partitionValues?: Record<string, unknown>;
}

interface StateRecord {
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

interface TransitionRecord {
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

interface RawTransitionRecord extends Omit<TransitionRecord, 'timestamp'> {
  timestamp: string | number;
}

interface PluginStorage {
  acquireLock(name: string, options: LockOptions): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
}

interface LockOptions {
  ttl: number;
  timeout: number;
  workerId: string;
}

interface Lock {
  name: string;
}

interface Database {
  resources: Record<string, Resource>;
  pluginRegistry: PluginRegistry;
  createResource(config: ResourceConfig): Promise<Resource>;
  usePlugin(plugin: Plugin): Promise<void>;
  getResource(name: string): Promise<Resource>;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface PluginRegistry {
  [key: string]: Plugin;
}

interface ResourceConfig {
  name: string;
  attributes: Record<string, string>;
  partitions?: Record<string, { fields: Record<string, string> }>;
  behavior?: string;
}

type ActionHandler = (context: Record<string, unknown>, event: string, machine: ActionContext) => Promise<unknown>;
type GuardHandler = (context: Record<string, unknown>, event: string, machine: ActionContext) => Promise<boolean>;
type ConditionHandler = (context: Record<string, unknown>, entityId: string, eventData?: unknown) => Promise<boolean>;
type EventNameResolver = (context: Record<string, unknown>) => string;

interface ActionContext {
  database: Database;
  machineId: string;
  entityId: string;
  resource?: Resource | null;
}

interface StateConfig {
  on?: Record<string, string>;
  type?: 'final';
  entry?: string;
  exit?: string;
  guards?: Record<string, string>;
  meta?: Record<string, unknown>;
  triggers?: TriggerConfig[];
  retryConfig?: RetryConfig;
}

type ConcurrencyMode = 'serial' | 'parallel';
type ConcurrencyConflictPolicy = 'reject' | 'drop';

interface ConcurrencyConfig {
  mode: ConcurrencyMode;
  conflict: ConcurrencyConflictPolicy;
}

interface TriggerConfig {
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

interface MachineConfig {
  initialState: string;
  states: Record<string, StateConfig>;
  resource?: string | Resource;
  stateField?: string;
  retryConfig?: RetryConfig;
  autoCleanup?: boolean;
  config?: MachineConfig;
  concurrency?: {
    mode?: ConcurrencyMode;
    conflict?: ConcurrencyConflictPolicy;
  };
}

interface RetryConfig {
  maxAttempts?: number;
  backoffStrategy?: 'exponential' | 'linear' | 'fixed';
  baseDelay?: number;
  maxDelay?: number;
  retryableErrors?: string[];
  nonRetriableErrors?: string[];
  onRetry?: (attempt: number, error: Error, context: Record<string, unknown>) => Promise<void>;
}

interface SchedulerConfig {
  [key: string]: unknown;
}

interface SchedulerJob {
  schedule: string;
  description: string;
  action: (database: Database, context: Record<string, unknown>) => Promise<{ processed: number; executed: number }>;
}

interface TriggerListenerRef {
  emitter: {
    on?: (eventName: string, handler: (...args: unknown[]) => unknown) => void;
    off?: (eventName: string, handler: (...args: unknown[]) => unknown) => void;
    removeListener?: (eventName: string, handler: (...args: unknown[]) => unknown) => void;
  };
  eventName: string;
  handler: (...args: unknown[]) => unknown;
}

type TransitionSortOrder = 'asc' | 'desc';

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

interface StateMachineConfig {
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

interface MachineData {
  config: MachineConfig;
  currentStates: Map<string, string>;
  currentStateVersions: Map<string, number>;
  concurrency: ConcurrencyConfig;
}

interface ResourceNames {
  transitionLog: string;
  states: string;
}

interface ResourceDescriptor {
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
}

export interface TransitionRejectedResult extends TransitionResult {
  ok: false;
  code: 'MACHINE_NOT_FOUND' | 'INVALID_EVENT' | 'GUARD_NOT_FOUND' | 'GUARD_REJECTED' | 'GUARD_ERROR' | 'ACTION_NOT_FOUND' | 'TRANSITION_LOCK_TIMEOUT' | 'CONCURRENCY_CONFLICT' | 'STATE_VERSION_MISMATCH' | 'INTERNAL_ERROR';
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

interface EntityInState {
  entityId: string;
  currentState: string;
  context: Record<string, unknown>;
  triggerCounts: Record<string, number>;
}

interface TransitionContext {
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

interface MachineProxy {
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

interface SchedulerPluginClass {
  new(options: Record<string, unknown>): Plugin & { stop(): Promise<void> };
}

export class StateMachinePlugin<TMachineEvents extends MachineEventPayloadMap = Record<string, Record<string, Record<string, unknown>>>> extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: StateMachineConfig;
  machines: Map<string, MachineData>;
  resourceNames: ResourceNames;
  triggerJobNames: string[];
  schedulerPlugin: (Plugin & { stop(): Promise<void> }) | null;
  _pendingEventHandlers: Set<Promise<void>>;
  _triggerListeners: TriggerListenerRef[];

  private _resourceDescriptors: Record<string, ResourceDescriptor>;

  constructor(options: StateMachinePluginOptions = {}) {
    super(options);

    const smOptions = this.options as StateMachinePluginOptions;
    const {
      resourceNames = {},
      stateMachines = {},
      actions = {},
      guards = {},
      persistTransitions = true,
      transitionLogResource,
      stateResource,
      retryAttempts = 3,
      retryDelay = 100,
      workerId = 'default',
      lockTimeout = 1000,
      lockTTL = 5,
      concurrency = {},
      retryConfig = null,
      enableScheduler = false,
      schedulerConfig = {},
      enableDateTriggers = true,
      enableFunctionTriggers = true,
      enableEventTriggers = true,
      triggerCheckInterval = 60000,
      ...rest
    } = smOptions;

    const resourceNamesOption = resourceNames || {};
    const normalizedStateMachines = Object.entries(stateMachines).reduce<Record<string, MachineConfig>>(
      (acc, [machineName, machineConfig]) => {
        acc[machineName] = this._getMachineConfig(machineConfig);
        return acc;
      },
      {}
    );

    this._resourceDescriptors = {
      transitionLog: {
        defaultName: 'plg_state_transitions',
        override: resourceNamesOption.transitionLog || transitionLogResource
      },
      states: {
        defaultName: 'plg_entity_states',
        override: resourceNamesOption.states || stateResource
      }
    };

    this.resourceNames = this._resolveResourceNames();

    this.config = {
      stateMachines: normalizedStateMachines,
      actions,
      guards,
      persistTransitions,
      transitionLogResource: this.resourceNames.transitionLog,
      stateResource: this.resourceNames.states,
      concurrency: {
        mode: concurrency.mode || 'serial',
        conflict: concurrency.conflict || 'reject'
      },
      retryAttempts,
      retryDelay,
      logLevel: this.logLevel,
      workerId,
      lockTimeout,
      lockTTL,
      retryConfig,
      enableScheduler,
      schedulerConfig,
      enableDateTriggers,
      enableFunctionTriggers,
      enableEventTriggers,
      triggerCheckInterval,
      ...rest
    };

    this.machines = new Map();
    this.triggerJobNames = [];
    this.schedulerPlugin = null;
    this._pendingEventHandlers = new Set();
    this._triggerListeners = [];

    this._validateConfiguration();
  }

  private _resolveResourceNames(): ResourceNames {
    return resolveResourceNames('state_machine', this._resourceDescriptors, {
      namespace: this.namespace
    }) as unknown as ResourceNames;
  }

  override onNamespaceChanged(): void {
    this.resourceNames = this._resolveResourceNames();
    if (this.config) {
      this.config.transitionLogResource = this.resourceNames.transitionLog;
      this.config.stateResource = this.resourceNames.states;
    }
  }

  async waitForPendingEvents(timeout: number = 5000): Promise<void> {
    if (this._pendingEventHandlers.size === 0) {
      return;
    }

    const startTime = Date.now();

    while (this._pendingEventHandlers.size > 0) {
      const elapsed = Date.now() - startTime;
      const remaining = timeout - elapsed;

      if (remaining <= 0) {
        throw new StateMachineError(
          `Timeout waiting for ${this._pendingEventHandlers.size} pending event handlers`,
          {
            operation: 'waitForPendingEvents',
            pendingCount: this._pendingEventHandlers.size,
            timeout
          }
        );
      }

      if (this._pendingEventHandlers.size > 0) {
        let timeoutHandle: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
          timeoutHandle = setTimeout(() => resolve('timeout'), remaining);
        });
        const pendingPromise = Promise.race(
          Array.from(this._pendingEventHandlers, (promise) => promise.then(
            () => 'settled' as const,
            () => 'settled' as const
          ))
        );

        const result = await Promise.race([pendingPromise, timeoutPromise]);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        if (result === 'timeout' && this._pendingEventHandlers.size > 0) {
          throw new StateMachineError(
            `Timeout waiting for ${this._pendingEventHandlers.size} pending event handlers`,
            {
              operation: 'waitForPendingEvents',
              pendingCount: this._pendingEventHandlers.size,
              timeout
            }
          );
        }
      }

      await new Promise(resolve => setImmediate(resolve));
    }
  }

  private _getStateResource(): Resource | null {
    if (!this.config.persistTransitions || !this.database?.resources) {
      return null;
    }

    return (this.database.resources[this.config.stateResource] as Resource | undefined) || null;
  }

  private _getTransitionLogResource(): Resource | null {
    if (!this.config.persistTransitions || !this.database?.resources) {
      return null;
    }

    return (this.database.resources[this.config.transitionLogResource] as Resource | undefined) || null;
  }

  private _getMachineConfig(machineConfig: MachineConfig): MachineConfig {
    const nestedConfig = (machineConfig as { config?: MachineConfig }).config;

    if (!nestedConfig || nestedConfig === machineConfig) {
      return machineConfig;
    }

    if (typeof nestedConfig === 'object') {
      return {
        ...machineConfig,
        ...nestedConfig,
        config: undefined
      } as MachineConfig;
    }

    return machineConfig;
  }

  private _resolveMachineConcurrency(machineConfig: MachineConfig): ConcurrencyConfig {
    return {
      mode: machineConfig.concurrency?.mode || this.config.concurrency.mode,
      conflict: machineConfig.concurrency?.conflict || this.config.concurrency.conflict
    };
  }

  private _collectSchemaBoundMachines(): Map<string, ResolvedStateMachineBinding> {
    const bindings = new Map<string, ResolvedStateMachineBinding>();

    if (!this.database?.resources) {
      return bindings;
    }

    for (const [resourceName, resource] of Object.entries(this.database.resources)) {
      const candidate = resource as unknown as Resource;
      const binding = this._normalizeSchemaStateMachineBinding(candidate?.$schema?.stateMachine, resourceName, candidate);

      if (!binding) {
        continue;
      }

      if (bindings.has(binding.machine)) {
        throw new StateMachineError(`State machine '${binding.machine}' is already bound to another resource via schema`, {
          operation: 'collectSchemaBoundMachines',
          machine: binding.machine,
          resourceName,
          currentResource: bindings.get(binding.machine)?.resourceName,
          suggestion: 'Bind each machine to only one resource using resource.$schema.stateMachine'
        });
      }

      if (!this.config.stateMachines[binding.machine]) {
        this.logger.warn(
          { machine: binding.machine, resourceName },
          `Resource '${resourceName}' references undefined state machine '${binding.machine}' in $schema.stateMachine`
        );
        continue;
      }

      bindings.set(binding.machine, binding);
    }

    return bindings;
  }

  private _normalizeSchemaStateMachineBinding(
    rawBinding: string | ResourceStateMachineBinding | undefined,
    resourceName: string,
    resource: Resource
  ): ResolvedStateMachineBinding | null {
    if (!rawBinding) {
      return null;
    }

    if (typeof rawBinding === 'string') {
      const machine = rawBinding.trim();
      if (!machine) {
        return null;
      }

      return {
        machine,
        resourceName,
        resource
      };
    }

    if (typeof rawBinding !== 'object' || Array.isArray(rawBinding)) {
      this.logger.warn({ resourceName, stateMachine: rawBinding }, `Invalid stateMachine binding in resource.$schema.stateMachine`);
      return null;
    }

    const bindingObject = rawBinding as unknown as Record<string, unknown>;
    const machine = typeof bindingObject.machine === 'string' ? bindingObject.machine.trim() : '';
    if (!machine) {
      this.logger.warn({ resourceName, stateMachine: rawBinding }, `Invalid stateMachine binding in resource.$schema.stateMachine: missing machine`);
      return null;
    }

    const resolvedBinding: ResolvedStateMachineBinding = {
      machine,
      resourceName,
      resource
    };

    if (typeof bindingObject.stateField === 'string') {
      resolvedBinding.stateField = bindingObject.stateField;
    } else if (bindingObject.stateField !== undefined) {
      this.logger.warn({ resourceName, stateMachine: machine }, `Ignoring invalid stateMachine stateField in resource.$schema.stateMachine`);
    }

    if (typeof bindingObject.autoCleanup === 'boolean') {
      resolvedBinding.autoCleanup = bindingObject.autoCleanup;
    } else if (bindingObject.autoCleanup !== undefined) {
      this.logger.warn({ resourceName, stateMachine: machine }, `Ignoring invalid stateMachine autoCleanup in resource.$schema.stateMachine`);
    }

    return resolvedBinding;
  }

  private _resolveDefaultStateField(resource: Resource): string | undefined {
    const schema = (resource as { schema?: { attributes?: Record<string, unknown> } }).schema;
    if (schema?.attributes && Object.prototype.hasOwnProperty.call(schema.attributes, 'status')) {
      return 'status';
    }

    return undefined;
  }

  private _resolveMachineConfig(
    machineName: string,
    machineConfig: MachineConfig,
    schemaBinding?: ResolvedStateMachineBinding
  ): MachineConfig {
    const normalized = this._getMachineConfig(machineConfig);

    if (!schemaBinding) {
      return normalized;
    }

    const fallbackStateField = normalized.stateField || schemaBinding.stateField || this._resolveDefaultStateField(schemaBinding.resource);
    const fallbackResource = normalized.resource || schemaBinding.resource;

    if (!normalized.resource && fallbackResource) {
      this.logger.debug(
        {
          machine: machineName,
          resourceName: schemaBinding.resourceName,
          stateField: fallbackStateField,
          autoCleanup: normalized.autoCleanup ?? schemaBinding.autoCleanup
        },
        `Using resource from resource.$schema.stateMachine for machine '${machineName}'`
      );
    }

    return {
      ...normalized,
      resource: fallbackResource,
      stateField: fallbackStateField,
      autoCleanup: normalized.autoCleanup ?? schemaBinding.autoCleanup
    };
  }

  private _validateConfiguration(): void {
    if (this.config.concurrency.mode !== 'serial' && this.config.concurrency.mode !== 'parallel') {
      throw new StateMachineError(`Invalid global concurrency mode '${this.config.concurrency.mode}'`, {
        operation: 'validateConfiguration',
        suggestion: 'Use one of: serial | parallel'
      });
    }

    if (this.config.concurrency.conflict !== 'reject' && this.config.concurrency.conflict !== 'drop') {
      throw new StateMachineError(`Invalid global concurrency conflict policy '${this.config.concurrency.conflict}'`, {
        operation: 'validateConfiguration',
        suggestion: 'Use one of: reject | drop'
      });
    }

    if (!this.config.stateMachines || Object.keys(this.config.stateMachines).length === 0) {
      throw new StateMachineError('At least one state machine must be defined', {
        operation: 'validateConfiguration',
        machineCount: 0,
        suggestion: 'Provide at least one state machine in the stateMachines configuration'
      });
    }

    for (const [machineName, machine] of Object.entries(this.config.stateMachines)) {
      if (!machine.states || Object.keys(machine.states).length === 0) {
        throw new StateMachineError(`Machine '${machineName}' must have states defined`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          suggestion: 'Define at least one state in the states configuration'
        });
      }

      if (!machine.initialState) {
        throw new StateMachineError(`Machine '${machineName}' must have an initialState`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          availableStates: Object.keys(machine.states),
          suggestion: 'Specify an initialState property matching one of the defined states'
        });
      }

      if (!machine.states[machine.initialState]) {
        throw new StateMachineError(`Initial state '${machine.initialState}' not found in machine '${machineName}'`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          initialState: machine.initialState,
          availableStates: Object.keys(machine.states),
          suggestion: 'Set initialState to one of the defined states'
        });
      }

      if (machine.concurrency?.mode && machine.concurrency.mode !== 'serial' && machine.concurrency.mode !== 'parallel') {
        throw new StateMachineError(`Invalid concurrency mode '${machine.concurrency.mode}' in machine '${machineName}'`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          suggestion: 'Use one of: serial | parallel'
        });
      }

      if (machine.concurrency?.conflict && machine.concurrency.conflict !== 'reject' && machine.concurrency.conflict !== 'drop') {
        throw new StateMachineError(`Invalid concurrency conflict policy '${machine.concurrency.conflict}' in machine '${machineName}'`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          suggestion: 'Use one of: reject | drop'
        });
      }

      const diagnostics = this._getMachineDefinitionDiagnostics(machineName, machine);
      if (diagnostics.errors.length > 0) {
        throw new StateMachineError(`State machine '${machineName}' definition is invalid`, {
          operation: 'validateConfiguration',
          machineId: machineName,
          errors: diagnostics.errors,
          suggestion: 'Fix definition errors before initializing the plugin'
        });
      }

      if (diagnostics.warnings.length > 0) {
        this.logger.warn({ machineId: machineName, warnings: diagnostics.warnings }, `State machine '${machineName}' has definition warnings`);
      }
    }
  }

  override async onInstall(): Promise<void> {
    if (this.config.persistTransitions) {
      await this._createStateResources();
    }

    const schemaBoundMachines = this._collectSchemaBoundMachines();

    for (const [machineName, machineConfig] of Object.entries(this.config.stateMachines)) {
      const resolvedMachineConfig = this._resolveMachineConfig(machineName, machineConfig, schemaBoundMachines.get(machineName));
      const machineConcurrency = this._resolveMachineConcurrency(resolvedMachineConfig);

      this.machines.set(machineName, {
        config: resolvedMachineConfig,
        currentStates: new Map(),
        currentStateVersions: new Map(),
        concurrency: machineConcurrency
      });
    }

    await this._attachStateMachinesToResources();
    await this._setupTriggers();

    this.emit('db:plugin:initialized', { machines: Array.from(this.machines.keys()) });
  }

  private async _createStateResources(): Promise<void> {
    const [logOk, logErr] = await tryFn(() => this.database.createResource({
      name: this.config.transitionLogResource,
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

    if (!logOk && !this._getTransitionLogResource()) {
      this.logger.warn({
        machineResource: this.config.transitionLogResource,
        error: (logErr as Error)?.message
      }, `Failed to create transition log resource for state machine plugin: ${(logErr as Error)?.message || 'unknown error'}`);
    }

    const [stateOk, stateErr] = await tryFn(() => this.database.createResource({
      name: this.config.stateResource,
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

    if (!stateOk && !this._getStateResource()) {
      this.logger.warn({
        machineResource: this.config.stateResource,
        error: (stateErr as Error)?.message
      }, `Failed to create state resource for state machine plugin: ${(stateErr as Error)?.message || 'unknown error'}`);
    }
  }

  async send<TMachine extends keyof TMachineEvents & string, TEvent extends keyof TMachineEvents[TMachine] & string>(
    machineId: TMachine,
    entityId: string,
    event: TEvent,
    context?: TMachineEvents[TMachine][TEvent] & Record<string, unknown>
  ): Promise<TransitionResult>;
  async send(
    machineId: string,
    entityId: string,
    event: string,
    context: Record<string, unknown>
  ): Promise<TransitionResult>;
  async send(
    machineId: string,
    entityId: string,
    event: string,
    context: Record<string, unknown> = {}
  ): Promise<TransitionResult> {
    const startedAt = new Date().toISOString();
    const normalizedContext = context || {};
    const correlationId = this._getCorrelationId(normalizedContext, machineId, entityId, event);
    const requestedStateVersion = typeof normalizedContext.stateVersion === 'number' ? normalizedContext.stateVersion : undefined;
    const buildFailure = (
      code: TransitionRejectedResult['code'],
      reason: string,
      message: string,
      details: Record<string, unknown>,
      state: Partial<Pick<TransitionContext, 'from' | 'to' | 'guard' | 'stateVersion'>> & { state?: string } = {}
    ): TransitionResult => {
      const endedAt = new Date().toISOString();
      const transitionContext = this._buildTransitionContext(machineId, entityId, event, startedAt, endedAt, {
        correlationId,
        context: normalizedContext,
        from: state.from,
        to: state.to,
        guard: state.guard
      });

      this.emit('plg:state-machine:transition-rejected', {
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

    const machine = this.machines.get(machineId);
    if (!machine) {
      return buildFailure(
        'MACHINE_NOT_FOUND',
        'MACHINE_NOT_FOUND',
        `State machine '${machineId}' not found`,
        {
          machineId,
          availableMachines: Array.from(this.machines.keys()),
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
      const stateSnapshot = await this._getStateSnapshot(machineId, entityId);
      currentState = stateSnapshot.state;
      currentStateVersion = stateSnapshot.version;

      if (machine.concurrency.mode !== 'parallel') {
        lock = await this._acquireTransitionLock(machineId, entityId);
      }

      this.emit('plg:state-machine:before-transition', {
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

      if (!stateConfig || !stateConfig.on || !stateConfig.on[event]) {
        return buildFailure(
          'INVALID_EVENT',
          'INVALID_EVENT',
          `Event '${event}' not valid for state '${currentState}' in machine '${machineId}'`,
          {
            currentState,
            validEvents: stateConfig && stateConfig.on ? Object.keys(stateConfig.on) : []
          },
          { from: currentState }
        );
      }

      targetState = stateConfig.on[event];

      if (stateConfig.guards && stateConfig.guards[event]) {
        guardName = stateConfig.guards[event];
        const guard = this.config.guards[guardName];

        if (!guard) {
          return buildFailure(
            'GUARD_NOT_FOUND',
            'GUARD_NOT_FOUND',
            `Guard '${guardName}' not found`,
            {
              guardName,
              currentState
            },
            { from: currentState, to: targetState, guard: guardName }
          );
        }

        const [guardOk, guardErr, guardResult] = await tryFn(async () =>
          guard(normalizedContext, event, {
            database: this.database as unknown as Database,
            machineId,
            entityId,
            resource: await this._getAttachedResource(machineId)
          })
        );

        if (!guardOk) {
          return buildFailure(
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
        }

        if (!guardResult) {
          return buildFailure(
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
        }
      }

      if (stateConfig.exit) {
        await this._executeAction(stateConfig.exit, normalizedContext, event, machineId, entityId, {
          machineId,
          entityId,
          event,
          from: currentState,
          to: targetState,
          startedAt,
          correlationId,
          context: normalizedContext
        });
      }

      transitionedStateVersion = await this._transition(machineId, entityId, currentState, targetState, event, normalizedContext, currentStateVersion);

      const targetStateConfig = machine.config.states[targetState];
      if (targetStateConfig && targetStateConfig.entry) {
        await this._executeAction(targetStateConfig.entry, normalizedContext, event, machineId, entityId, {
          machineId,
          entityId,
          event,
          from: currentState,
          to: targetState,
          startedAt,
          correlationId,
          context: normalizedContext
        });
      }

      const endedAt = new Date().toISOString();
      const elapsedMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

      const transitionContext = this._buildTransitionContext(
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

      this.emit('plg:state-machine:transition', {
        ...transitionContext,
        to: targetState
      });

      this.emit('plg:state-machine:after-transition', {
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
        elapsedMs
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const details = {
        operation: error && typeof error === 'object' && 'operation' in error ? (error as { operation?: string }).operation : undefined,
        originalError: message
      };

      if (error instanceof StateMachineError) {
        const stateMachineError = error as Error & { operation?: string; guardName?: string; currentState?: string; targetState?: string };
        const operation = stateMachineError.operation;
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
        }

        return buildFailure(
          code,
          reason,
          error.message,
          {
            ...details
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
      await this._releaseTransitionLock(lock);
    }
  }

  async assertTransition<TMachine extends keyof TMachineEvents & string, TEvent extends keyof TMachineEvents[TMachine] & string>(
    params: TransitionAssertionSuccessParams<TMachine, TEvent> & { context?: TMachineEvents[TMachine][TEvent] }
  ): Promise<TransitionSuccessResult> {
    const result = await this.send(
      params.machineId,
      params.entityId,
      params.event,
      (params.context || {}) as TMachineEvents[TMachine][TEvent]
    );

    if (!result.ok) {
      this._contractAssertionFailure('Expected transition to be accepted, but it was rejected', {
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
      this._contractAssertionFailure('Transition started from a different state than expected', {
        machineId: params.machineId,
        entityId: params.entityId,
        event: params.event,
        expectedFrom: params.from,
        actualFrom: result.from
      });
    }

    if (result.to !== params.to) {
      this._contractAssertionFailure('Transition ended in a different state than expected', {
        machineId: params.machineId,
        entityId: params.entityId,
        event: params.event,
        expectedTo: params.to,
        actualTo: result.to
      });
    }

    if (typeof params.stateVersion === 'number' && result.stateVersion !== params.stateVersion) {
      this._contractAssertionFailure('Transition state version does not match expected value', {
        machineId: params.machineId,
        entityId: params.entityId,
        event: params.event,
        expectedStateVersion: params.stateVersion,
        actualStateVersion: result.stateVersion
      });
    }

    return result as TransitionSuccessResult;
  }

  async assertReject<TMachine extends keyof TMachineEvents & string, TEvent extends keyof TMachineEvents[TMachine] & string>(
    params: TransitionAssertionRejectParams<TMachine, TEvent> & { context?: TMachineEvents[TMachine][TEvent] }
  ): Promise<TransitionRejectedResult> {
    const result = await this.send(
      params.machineId,
      params.entityId,
      params.event,
      (params.context || {}) as TMachineEvents[TMachine][TEvent]
    );

    if (result.ok) {
      this._contractAssertionFailure('Expected transition to be rejected, but it succeeded', {
        machineId: params.machineId,
        entityId: params.entityId,
        event: params.event,
        expectedTo: params.to || null,
        actualResult: result
      });
    }

    if (params.code && result.code !== params.code) {
      this._contractAssertionFailure('Transition rejection code does not match expected code', {
        machineId: params.machineId,
        entityId: params.entityId,
        event: params.event,
        expectedCode: params.code,
        actualCode: result.code
      });
    }

    if (params.reason && result.reason !== params.reason) {
      this._contractAssertionFailure('Transition rejection reason does not match expected reason', {
        machineId: params.machineId,
        entityId: params.entityId,
        event: params.event,
        expectedReason: params.reason,
        actualReason: result.reason
      });
    }

    if (params.from && result.from !== params.from) {
      this._contractAssertionFailure('Rejected transition started from a different state than expected', {
        machineId: params.machineId,
        entityId: params.entityId,
        event: params.event,
        expectedFrom: params.from,
        actualFrom: result.from
      });
    }

    if (params.to && result.to !== params.to) {
      this._contractAssertionFailure('Rejected transition targeted an unexpected state', {
        machineId: params.machineId,
        entityId: params.entityId,
        event: params.event,
        expectedTo: params.to,
        actualTo: result.to
      });
    }

    return result as TransitionRejectedResult;
  }

  private _sendInternal(
    machineId: string,
    entityId: string,
    event: string,
    context: Record<string, unknown> = {}
  ): Promise<TransitionResult> {
    return this.send(machineId, entityId, event, context);
  }

  private _contractAssertionFailure(message: string, details: Record<string, unknown>): never {
    const error = new Error(`[state-machine contract] ${message}`);
    (error as Error & { details?: Record<string, unknown> }).details = details;
    throw error;
  }

  private _getCorrelationId(context: Record<string, unknown>, machineId: string, entityId: string, event: string): string {
    const provided = context?.correlationId;
    if (typeof provided === 'string' && provided.length > 0) {
      return provided;
    }

    return `${machineId}:${entityId}:${event}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;
  }

  private _buildTransitionContext(
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

  private async _getStateSnapshot(machineId: string, entityId: string): Promise<{ state: string; version: number }> {
    const machine = this.machines.get(machineId);
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

    if (this.config.persistTransitions && this._getStateResource()) {
      const stateId = `${machineId}_${entityId}`;
      const [ok, , stateRecord] = await tryFn<StateRecord>(() =>
        this._getStateResource()!.get(stateId) as unknown as Promise<StateRecord>
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

  private _setInMemoryState(machineId: string, entityId: string, state: string, stateVersion: number): void {
    const machine = this.machines.get(machineId);
    if (!machine) {
      return;
    }

    machine.currentStates.set(entityId, state);
    machine.currentStateVersions.set(entityId, stateVersion);
  }

  getMachineDefinitionDiagnostics(machineId: string): MachineDefinitionDiagnostics | null {
    const machine = this.machines.get(machineId);
    if (!machine) {
      return null;
    }

    return this._getMachineDefinitionDiagnostics(machineId, machine.config);
  }

  getDefinitionDiagnostics(): Record<string, MachineDefinitionDiagnostics> {
    const diagnostics: Record<string, MachineDefinitionDiagnostics> = {};

    for (const machineId of this.machines.keys()) {
      diagnostics[machineId] = this._getMachineDefinitionDiagnostics(machineId, this.machines.get(machineId)!.config);
    }

    return diagnostics;
  }

  private _getMachineDefinitionDiagnostics(machineId: string, config: MachineConfig): MachineDefinitionDiagnostics {
    const stateNames = Object.keys(config.states);
    const errors: MachineDefinitionIssue[] = [];
    const warnings: MachineDefinitionIssue[] = [];
    const incomingTransitions = new Map<string, number>();
    const transitionTargets = new Map<string, string[]>();
    let transitionCount = 0;
    let deadStatesCount: string[] = [];

    for (const stateName of stateNames) {
      incomingTransitions.set(stateName, 0);
    }

    for (const [stateName, stateConfig] of Object.entries(config.states)) {
      const on = stateConfig.on || {};
      const targets: string[] = [];

      for (const [event, target] of Object.entries(on)) {
        transitionCount++;
        targets.push(target);

        if (!config.states[target]) {
          errors.push({
            code: 'MISSING_TARGET_STATE',
            message: `Transition target state '${target}' is not defined in machine '${machineId}'`,
            state: stateName,
            event,
            targetState: target
          });
          continue;
        }

        const incoming = incomingTransitions.get(target) || 0;
        incomingTransitions.set(target, incoming + 1);
      }

      transitionTargets.set(stateName, targets);

      if (Object.keys(on).length === 0 && stateConfig.type !== 'final') {
        warnings.push({
          code: 'STATE_WITHOUT_TRANSITIONS',
          message: `State '${stateName}' has no outgoing transitions`,
          state: stateName
        });
      }

      const guardMappings = stateConfig.guards || {};
      for (const [event, guardName] of Object.entries(guardMappings)) {
        if (!this.config.guards[guardName]) {
          errors.push({
            code: 'MISSING_GUARD',
            message: `Guard '${guardName}' is not registered in machine '${machineId}'`,
            state: stateName,
            event,
            guardName
          });
        }
      }

      if (stateConfig.entry && !this.config.actions[stateConfig.entry]) {
        errors.push({
          code: 'MISSING_ACTION',
          message: `Entry action '${stateConfig.entry}' is not registered in machine '${machineId}'`,
          state: stateName,
          actionName: stateConfig.entry
        });
      }

      if (stateConfig.exit && !this.config.actions[stateConfig.exit]) {
        errors.push({
          code: 'MISSING_ACTION',
          message: `Exit action '${stateConfig.exit}' is not registered in machine '${machineId}'`,
          state: stateName,
          actionName: stateConfig.exit
        });
      }
    }

    const reachable = new Set<string>();
    const toVisit = [config.initialState];
    reachable.add(config.initialState);

    while (toVisit.length > 0) {
      const current = toVisit.shift();
      if (!current) continue;

      const targets = transitionTargets.get(current) || [];
      for (const target of targets) {
        if (!reachable.has(target)) {
          reachable.add(target);
          toVisit.push(target);
        }
      }
    }

    const unreachableStates = stateNames.filter((stateName) => !reachable.has(stateName));
    for (const stateName of unreachableStates) {
      warnings.push({
        code: 'UNREACHABLE_STATE',
        message: `State '${stateName}' is unreachable from initial state '${config.initialState}'`,
        state: stateName
      });
    }

    const orphanStates = stateNames.filter((stateName) => stateName !== config.initialState && (incomingTransitions.get(stateName) || 0) === 0);
    for (const stateName of orphanStates) {
      warnings.push({
        code: 'ORPHAN_STATE',
        message: `State '${stateName}' has no incoming transitions`,
        state: stateName
      });
    }

    deadStatesCount = stateNames.filter((stateName) => {
      const stateConfig = config.states[stateName];
      return stateConfig?.type !== 'final' && (!stateConfig?.on || Object.keys(stateConfig.on).length === 0);
    });

    return {
      machineId,
      errors,
      warnings,
      stats: {
        states: stateNames.length,
        transitions: transitionCount,
        deadStates: deadStatesCount,
        unreachableStates
      }
    };
  }

  private async _executeAction(
    actionName: string,
    context: Record<string, unknown>,
    event: string,
    machineId: string,
    entityId: string,
    transitionContext?: Partial<TransitionContext>
  ): Promise<unknown> {
    const action = this.config.actions[actionName];
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

    const machine = this.machines.get(machineId);
    const currentState = await this.getState(machineId, entityId);
    const stateConfig = machine?.config?.states?.[currentState];

    const retryConfig: RetryConfig = {
      ...(this.config.retryConfig || {}),
      ...(machine?.config?.retryConfig || {}),
      ...(stateConfig?.retryConfig || {})
    };

    const maxAttempts = retryConfig.maxAttempts ?? 0;
    const retryEnabled = maxAttempts > 0;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxAttempts) {
      try {
        const result = await action(context, event, {
          database: this.database as unknown as Database,
          machineId,
          entityId,
          resource: await this._getAttachedResource(machineId)
        });

        if (attempt > 0) {
          this.emit('plg:state-machine:action-retry-success', {
            machineId,
            entityId,
            action: actionName,
            attempts: attempt + 1,
            state: currentState
          });

          this.logger.debug({ actionName, machineId, entityId, attempts: attempt + 1 }, `Action '${actionName}' succeeded after ${attempt + 1} attempts`);
        }

        return result;

      } catch (error) {
        lastError = error as Error;

        if (!retryEnabled) {
          const actionContext = this._buildTransitionContext(machineId, entityId, event, transitionContext?.startedAt || new Date().toISOString(), new Date().toISOString(), {
            correlationId: transitionContext?.correlationId || 'unknown',
            context,
            from: transitionContext?.from,
            to: transitionContext?.to,
            guard: transitionContext?.guard,
            error: lastError.message
          });

          this.logger.error({ actionName, machineId, entityId, error: lastError.message }, `Action '${actionName}' failed: ${lastError.message}`);
          this.emit('plg:state-machine:action-error', {
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
          this.emit('plg:state-machine:action-error-non-retriable', {
            machineId,
            entityId,
            action: actionName,
            error: lastError.message,
            state: currentState
          });

          this.logger.error({ actionName, machineId, entityId, error: lastError.message, state: currentState }, `Action '${actionName}' failed with non-retriable error: ${lastError.message}`);

          throw error;
        }

        if (attempt >= maxAttempts) {
          this.emit('plg:state-machine:action-retry-exhausted', {
            machineId,
            entityId,
            action: actionName,
            attempts: attempt + 1,
            error: lastError.message,
            state: currentState
          });

          this.logger.error({ actionName, machineId, entityId, attempts: attempt + 1, error: lastError.message, state: currentState }, `Action '${actionName}' failed after ${attempt + 1} attempts: ${lastError.message}`);

          throw error;
        }

        attempt++;

        const delay = this._calculateBackoff(attempt, retryConfig);

        if (retryConfig.onRetry) {
          try {
            await retryConfig.onRetry(attempt, lastError, context);
          } catch (hookError) {
            this.logger.warn({ hookError: (hookError as Error).message }, `onRetry hook failed: ${(hookError as Error).message}`);
          }
        }

        this.emit('plg:state-machine:action-retry-attempt', {
          machineId,
          entityId,
          action: actionName,
          attempt,
          delay,
          error: lastError.message,
          state: currentState
        });

        this.logger.warn({ actionName, machineId, entityId, attempt, maxAttempts, delay, error: lastError.message }, `Action '${actionName}' failed (attempt ${attempt + 1}/${maxAttempts + 1}), retrying in ${delay}ms: ${lastError.message}`);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return undefined;
  }

  private async _transition(
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

    const machine = this.machines.get(machineId)!;
    const transitionId = `${machineId}_${entityId}_${timestamp}`;
    const stateId = `${machineId}_${entityId}`;
    const nextStateVersion = (typeof fromStateVersion === 'number' ? fromStateVersion : (machine.currentStateVersions.get(entityId) || 0)) + 1;
    const stateData = {
      machineId,
      entityId,
      currentState: toState,
      stateVersion: nextStateVersion,
      context,
      lastTransition: transitionId,
      updatedAt: now
    };

    const stateResource = this._getStateResource();
    const transitionLogResource = this._getTransitionLogResource();

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

      for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
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

            if (attempt < this.config.retryAttempts - 1) {
              const delay = this.config.retryDelay * Math.pow(2, attempt);
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
    } else if (this.config.persistTransitions) {
      this.logger.warn({
        machineId,
        entityId,
        reason: 'state resource unavailable'
      }, 'State resource is unavailable. Continuing with in-memory state only.');
    }

    if (transitionLogResource) {
      let logOk = false;
      let lastLogErr: Error | undefined;

      for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
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

        if (attempt < this.config.retryAttempts - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!logOk && lastLogErr) {
        this.logger.warn({
          machineId,
          entityId,
          attempts: this.config.retryAttempts,
          error: lastLogErr.message
        }, `Failed to log transition after ${this.config.retryAttempts} attempts: ${lastLogErr.message}`);
      }
    }

    machine.currentStates.set(entityId, toState);
    machine.currentStateVersions.set(entityId, nextStateVersion);

    return nextStateVersion;
  }

  private async _transitionToTargetState(
    machineId: string,
    entityId: string,
    targetState: string,
    event: string,
    context: Record<string, unknown>
  ): Promise<{ from: string; to: string; stateVersion: number }> {
    const machine = this.machines.get(machineId);
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

    const lock = machine.concurrency.mode === 'parallel' ? null : await this._acquireTransitionLock(machineId, entityId);
    const transitionStartedAt = new Date().toISOString();
    const transitionCorrelationId = this._getCorrelationId(context, machineId, entityId, event);

    try {
      const { state: fromState, version: fromStateVersion } = await this._getStateSnapshot(machineId, entityId);
      if (fromState === targetState) {
        return { from: fromState, to: targetState, stateVersion: fromStateVersion };
      }

      const fromStateConfig = machine.config.states[fromState];
      if (fromStateConfig?.exit) {
        await this._executeAction(fromStateConfig.exit, context, event, machineId, entityId);
      }

      const nextStateVersion = await this._transition(machineId, entityId, fromState, targetState, event, context, fromStateVersion);
      const endedAt = new Date().toISOString();

      const targetStateConfig = machine.config.states[targetState];
      if (targetStateConfig?.entry) {
        await this._executeAction(targetStateConfig.entry, context, event, machineId, entityId);
      }

      this.emit('plg:state-machine:transition', {
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
      await this._releaseTransitionLock(lock);
    }
  }

  private async _syncResourceStateField(machineId: string, entityId: string, state: string): Promise<void> {
    const machine = this.machines.get(machineId);
    if (!machine) return;

    const resourceConfig = machine.config;
    if (!resourceConfig.resource || !resourceConfig.stateField) return;

    let resource: Resource;
    if (typeof resourceConfig.resource === 'string') {
      resource = await this.database.getResource(resourceConfig.resource) as unknown as Resource;
    } else {
      resource = resourceConfig.resource as Resource;
    }

    if (!resource) return;

    const [ok] = await tryFn(() =>
      resource.patch(entityId, { [resourceConfig.stateField!]: state })
    );

    if (!ok) {
      this.logger.warn({ machineId, entityId, state }, `Failed to update resource stateField for entity ${entityId}`);
    }
  }

  private async _getAttachedResource(machineId: string): Promise<Resource | null> {
    const machine = this.machines.get(machineId);
    if (!machine) return null;

    const resourceConfig = machine.config;
    if (!resourceConfig.resource) return null;

    if (typeof resourceConfig.resource === 'string') {
      const resource = await this.database.getResource(resourceConfig.resource) as unknown as Resource | null;
      return resource || null;
    }

    return resourceConfig.resource as Resource;
  }

  private _wrapEventHandler(
    handler: (...args: unknown[]) => unknown
  ): (...args: unknown[]) => void {
    return (...args: unknown[]) => {
      const handlerPromise: Promise<void> = Promise.resolve()
        .then(() => handler(...args))
        .then(() => {});
      this._pendingEventHandlers.add(handlerPromise);

      const removePendingHandler = () => {
        this._pendingEventHandlers.delete(handlerPromise);
      };

      handlerPromise.then(removePendingHandler, removePendingHandler);
    };
  }

  private async _acquireTransitionLock(machineId: string, entityId: string): Promise<Lock | null> {
    const storage = this.getStorage() as PluginStorage;
    const lockName = `transition-${machineId}-${entityId}`;

    const lock = await storage.acquireLock(lockName, {
      ttl: this.config.lockTTL,
      timeout: this.config.lockTimeout,
      workerId: this.config.workerId
    });

    if (!lock) {
      throw new StateMachineError('Could not acquire transition lock - concurrent transition in progress', {
        operation: 'send',
        machineId,
        entityId,
        lockTimeout: this.config.lockTimeout,
        workerId: this.config.workerId,
        suggestion: 'Wait for current transition to complete or increase lockTimeout'
      });
    }

    return lock;
  }

  private async _releaseTransitionLock(lock: Lock | null): Promise<void> {
    if (!lock) return;

    const storage = this.getStorage() as PluginStorage;
    const [ok, err] = await tryFn(() => storage.releaseLock(lock));

    if (!ok) {
      this.logger.warn({ lockName: lock?.name, error: (err as Error).message }, `Failed to release lock '${lock?.name}': ${(err as Error).message}`);
    }
  }

  private _calculateBackoff(attempt: number, retryConfig: RetryConfig): number {
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

  async getState(machineId: string, entityId: string): Promise<string> {
    const snapshot = await this._getStateSnapshot(machineId, entityId);
    return snapshot.state;
  }

  async getValidEvents(machineId: string, stateOrEntityId: string): Promise<string[]> {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'getValidEvents',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    let state: string;
    if (machine.config.states[stateOrEntityId]) {
      state = stateOrEntityId;
    } else {
      state = await this.getState(machineId, stateOrEntityId);
    }

    const stateConfig = machine.config.states[state];
    return stateConfig && stateConfig.on ? Object.keys(stateConfig.on) : [];
  }

  private _toEpoch(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    const epoch = new Date(value).getTime();
    return Number.isNaN(epoch) ? 0 : epoch;
  }

  private _normalizeTransitionRecord(record: RawTransitionRecord | TransitionRecord): TransitionHistoryEntry {
    return {
      id: record.id,
      machineId: record.machineId,
      entityId: record.entityId,
      from: record.fromState,
      to: record.toState,
      event: record.event,
      context: record.context,
      timestamp: new Date(this._toEpoch(record.timestamp)).toISOString()
    };
  }

  private _applyTransitionFilters(
    transitions: TransitionHistoryEntry[],
    options: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>
  ): TransitionHistoryEntry[] {
    const fromTimestamp = this._toEpoch(options.from || '');
    const toTimestamp = this._toEpoch(options.to || '');

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
        const transitionTs = this._toEpoch(entry.timestamp);
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

  private _sortTransitions(transitions: TransitionHistoryEntry[], sort: TransitionSortOrder = 'desc'): TransitionHistoryEntry[] {
    const sorted = [...transitions];
    sorted.sort((a, b) => {
      const aTs = this._toEpoch(a.timestamp);
      const bTs = this._toEpoch(b.timestamp);

      return sort === 'desc'
        ? bTs - aTs
        : aTs - bTs;
    });

    return sorted;
  }

  async getTransitions(machineId: string, entityId: string, options: TransitionQueryOptions = {}): Promise<TransitionHistoryEntry[]> {
    const limit = options.limit;
    const offset = options.offset || 0;
    const sort = options.sort || 'desc';
    const includeFilters = this._applyTransitionFilters(
      await this._getTransitionHistory(machineId, entityId, {}),
      {
        from: options.from,
        to: options.to,
        event: options.event,
        fromState: options.fromState,
        toState: options.toState
      }
    );

    const sorted = this._sortTransitions(includeFilters, sort);

    if (typeof limit !== 'number') {
      return sorted.slice(offset);
    }

    return sorted.slice(offset, offset + limit);
  }

  async getTransitionHistory(machineId: string, entityId: string, options: TransitionHistoryOptions = {}): Promise<TransitionHistoryEntry[]> {
    const { limit = 50, offset = 0 } = options;
    return this.getTransitions(machineId, entityId, { limit, offset, sort: 'desc' });
  }

  async getTransitionCount(
    machineId: string,
    entityId: string,
    options: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'> = {}
  ): Promise<number> {
    const transitions = await this.getTransitions(machineId, entityId, options);
    return transitions.length;
  }

  async getSnapshot(machineId: string, entityId: string): Promise<StateMachineSnapshot> {
    const snapshot = await this._getStateSnapshot(machineId, entityId);
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

    const stateResource = this._getStateResource();
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

  async getTransition(machineId: string, entityId: string, transitionId: string): Promise<TransitionHistoryEntry | null> {
    if (!this.config.persistTransitions) {
      return null;
    }

    const transitionLogResource = this._getTransitionLogResource();
    if (!transitionLogResource) {
      this.logger.warn({ machineId, entityId, transitionId }, 'Transition log resource unavailable');
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

    return this._normalizeTransitionRecord(transition);
  }

  async getLastTransitions(machineId: string, entityId: string, n?: number): Promise<TransitionHistoryEntry[]> {
    if (typeof n === 'number' && n > 0) {
      return this.getTransitions(machineId, entityId, { limit: n, offset: 0, sort: 'desc' });
    }

    return this.getTransitions(machineId, entityId, { sort: 'desc' });
  }

  private async _getTransitionHistory(machineId: string, entityId: string, options: QueryOptions = {}): Promise<TransitionHistoryEntry[]> {
    if (!this.config.persistTransitions) {
      return [];
    }

    const transitionLogResource = this._getTransitionLogResource();

    if (!transitionLogResource) {
      this.logger.warn({ machineId, entityId }, 'Transition log resource unavailable');
      return [];
    }

    const toEpoch = (value: string | number): number => {
      if (typeof value === 'number') return value;
      const epoch = new Date(value).getTime();
      return Number.isNaN(epoch) ? 0 : epoch;
    };

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
        )
      );

      if (!ok) {
        this.logger.warn({ machineId, entityId, error: (err as Error).message }, `Failed to get transition history: ${(err as Error).message}`);
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
        )
      );

      if (!ok) {
        this.logger.warn({ machineId, entityId, error: (err as Error).message }, `Failed to get transition history: ${(err as Error).message}`);
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

  async initializeEntity(machineId: string, entityId: string, context: Record<string, unknown> = {}): Promise<string> {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'initializeEntity',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    const initialState = machine.config.initialState;
    machine.currentStates.set(entityId, initialState);

    if (this.config.persistTransitions) {
      const now = new Date().toISOString();
      const stateId = `${machineId}_${entityId}`;
      const stateResource = this._getStateResource();

      if (!stateResource) {
        this.logger.warn({ machineId, entityId }, 'State resource unavailable during initializeEntity. Initial state will be kept in memory only.');
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

    this._setInMemoryState(machineId, entityId, initialState, 0);

    const initialStateConfig = machine.config.states[initialState];
    if (initialStateConfig && initialStateConfig.entry) {
      await this._executeAction(initialStateConfig.entry, context, 'INIT', machineId, entityId);
    }

    this.emit('plg:state-machine:entity-initialized', { machineId, entityId, initialState });

    return initialState;
  }

  async deleteEntity(machineId: string, entityId: string): Promise<void> {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'deleteEntity',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    const stateId = `${machineId}_${entityId}`;

    machine.currentStates.delete(entityId);
    machine.currentStateVersions.delete(entityId);

    const stateResource = this._getStateResource();
    if (stateResource) {
      await tryFn(() =>
        stateResource.delete(stateId)
      );
    }

    if (this.config.persistTransitions) {
      const transitionLogResource = this._getTransitionLogResource();

      if (!transitionLogResource) {
        this.logger.debug({ machineId, entityId }, 'Skipping transition history cleanup because transition log resource is unavailable');
        this.emit('plg:state-machine:entity-deleted', { machineId, entityId });
        return;
      }

      const transitionPartition = {
        partition: 'byMachineEntity',
        partitionValues: { machineId, entityId }
      };

      while (true) {
        const [ok, , transitions] = await tryFn<TransitionRecord[]>(() =>
          transitionLogResource.query(
            {},
            {
              ...transitionPartition,
              limit: TRANSITION_HISTORY_PAGE_SIZE,
              offset: 0
            }
          ) as unknown as Promise<TransitionRecord[]>
        );

        if (!ok || !transitions || transitions.length === 0) {
          break;
        }

        await Promise.all(
          transitions.map(t =>
            tryFn(() =>
              transitionLogResource.delete(t.id)
            )
          )
        );

        if (transitions.length < TRANSITION_HISTORY_PAGE_SIZE) {
          break;
        }
      }
    }

    this.logger.debug({ machineId, entityId }, `Deleted entity state and history`);
    this.emit('plg:state-machine:entity-deleted', { machineId, entityId });
  }

  getMachineDefinition(machineId: string): MachineConfig | null {
    const machine = this.machines.get(machineId);
    return machine ? machine.config : null;
  }

  getMachines(): string[] {
    return Array.from(this.machines.keys());
  }

  visualize(machineId: string): string {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'visualize',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    let dot = `digraph ${machineId} {\n`;
    dot += `  rankdir=LR;\n`;
    dot += `  node [shape=circle];\n`;

    for (const [stateName, stateConfig] of Object.entries(machine.config.states)) {
      const shape = stateConfig.type === 'final' ? 'doublecircle' : 'circle';
      const color = (stateConfig.meta?.color as string) || 'lightblue';
      dot += `  ${stateName} [shape=${shape}, fillcolor=${color}, style=filled];\n`;
    }

    for (const [stateName, stateConfig] of Object.entries(machine.config.states)) {
      if (stateConfig.on) {
        for (const [event, targetState] of Object.entries(stateConfig.on)) {
          dot += `  ${stateName} -> ${targetState} [label="${event}"];\n`;
        }
      }
    }

    dot += `  start [shape=point];\n`;
    dot += `  start -> ${machine.config.initialState};\n`;

    dot += `}\n`;

    return dot;
  }

  private async _getEntitiesInState(machineId: string, stateName: string): Promise<EntityInState[]> {
    if (!this.config.persistTransitions) {
      const machine = this.machines.get(machineId);
      if (!machine) return [];

      const entities: EntityInState[] = [];
      for (const [entityId, currentState] of machine.currentStates) {
        if (currentState === stateName) {
          entities.push({ entityId, currentState, context: {}, triggerCounts: {} });
        }
      }
      return entities;
    }

    const stateResource = this._getStateResource();

    if (!stateResource) {
      this.logger.warn({ machineId, stateName, reason: 'state resource unavailable' }, `Failed to query entities in state '${stateName}'`);
      return [];
    }

    const [ok, err, records] = await tryFn<StateRecord[]>(() =>
      stateResource.query({
        machineId,
        currentState: stateName
      }) as unknown as Promise<StateRecord[]>
    );

    if (!ok) {
      this.logger.warn({ machineId, stateName, error: (err as Error).message }, `Failed to query entities in state '${stateName}': ${(err as Error).message}`);
      return [];
    }

    return (records || []).map(r => ({
      entityId: r.entityId,
      currentState: r.currentState,
      context: r.context,
      triggerCounts: r.triggerCounts || {}
    }));
  }

  private async _incrementTriggerCount(machineId: string, entityId: string, triggerName: string): Promise<void> {
    if (!this.config.persistTransitions) {
      return;
    }

    const stateId = `${machineId}_${entityId}`;
    const stateResource = this._getStateResource();

    if (!stateResource) {
      return;
    }

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
  }

  private async _setupTriggers(): Promise<void> {
    if (!this.config.enableScheduler && !this.config.enableDateTriggers && !this.config.enableFunctionTriggers && !this.config.enableEventTriggers) {
      return;
    }

    const cronJobs: Record<string, SchedulerJob> = {};

    for (const [machineId, machineData] of this.machines) {
      const machineConfig = machineData.config;

      for (const [stateName, stateConfig] of Object.entries(machineConfig.states)) {
        const triggers = stateConfig.triggers || [];

        for (let i = 0; i < triggers.length; i++) {
          const trigger = triggers[i]!;
          const triggerName = `${trigger.action}_${i}`;

          if (trigger.type === 'cron' && this.config.enableScheduler) {
            const jobName = `${machineId}_${stateName}_${triggerName}`;
            cronJobs[jobName] = await this._createCronJob(machineId, stateName, trigger, triggerName);
          } else if (trigger.type === 'date' && this.config.enableDateTriggers) {
            await this._setupDateTrigger(machineId, stateName, trigger, triggerName);
          } else if (trigger.type === 'function' && this.config.enableFunctionTriggers) {
            await this._setupFunctionTrigger(machineId, stateName, trigger, triggerName);
          } else if (trigger.type === 'event' && this.config.enableEventTriggers) {
            await this._setupEventTrigger(machineId, stateName, trigger, triggerName);
          }
        }
      }
    }

    if (Object.keys(cronJobs).length > 0 && this.config.enableScheduler) {
      const { SchedulerPlugin } = await import('./scheduler.plugin.js') as unknown as { SchedulerPlugin: SchedulerPluginClass };
      this.schedulerPlugin = new SchedulerPlugin({
        jobs: cronJobs,
        persistJobs: false,
        logLevel: this.logLevel,
        ...this.config.schedulerConfig
      });

      await (this.database as unknown as { usePlugin: (plugin: unknown) => Promise<void> }).usePlugin(this.schedulerPlugin);

      this.logger.debug({ cronJobCount: Object.keys(cronJobs).length }, `Installed SchedulerPlugin with ${Object.keys(cronJobs).length} cron triggers`);
    }
  }

  private async _createCronJob(machineId: string, stateName: string, trigger: TriggerConfig, triggerName: string): Promise<SchedulerJob> {
    return {
      schedule: trigger.schedule!,
      description: `Trigger '${triggerName}' for ${machineId}.${stateName}`,
      action: async () => {
        const entities = await this._getEntitiesInState(machineId, stateName);

        let executedCount = 0;

        for (const entity of entities) {
          try {
            const triggerContext = { ...entity.context, triggerName };

            if (trigger.condition) {
              const shouldTrigger = await trigger.condition(entity.context, entity.entityId);
              if (!shouldTrigger) continue;
            }

            if (trigger.maxTriggers !== undefined) {
              const triggerCount = entity.triggerCounts?.[triggerName] || 0;
              if (triggerCount >= trigger.maxTriggers) {
                if (triggerCount === trigger.maxTriggers && trigger.onMaxTriggersReached) {
                  await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
                  await this._sendInternal(machineId, entity.entityId, trigger.onMaxTriggersReached, triggerContext);
                }
                continue;
              }
            }

            if (trigger.targetState) {
              const transition = await this._transitionToTargetState(
                machineId,
                entity.entityId,
                trigger.targetState,
                'TRIGGER',
                triggerContext
              );

              await this._syncResourceStateField(machineId, entity.entityId, trigger.targetState);

              if (trigger.eventOnSuccess) {
                await this._sendInternal(machineId, entity.entityId, trigger.eventOnSuccess, {
                  ...triggerContext,
                  triggerResult: transition
                });
              } else if (trigger.event) {
                await this._sendInternal(machineId, entity.entityId, trigger.event, {
                  ...triggerContext,
                  triggerResult: transition
                });
              }
            } else {
              const result = await this._executeAction(
                trigger.action!,
                triggerContext,
                'TRIGGER',
                machineId,
                entity.entityId
              );

              if (trigger.eventOnSuccess) {
                await this._sendInternal(machineId, entity.entityId, trigger.eventOnSuccess, {
                  ...triggerContext,
                  triggerResult: result
                });
              } else if (trigger.event) {
                await this._sendInternal(machineId, entity.entityId, trigger.event, {
                  ...triggerContext,
                  triggerResult: result
                });
              }
            }

            await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
            executedCount++;

            this.emit('plg:state-machine:trigger-executed', {
              machineId,
              entityId: entity.entityId,
              state: stateName,
              trigger: triggerName,
              type: 'cron'
            });

          } catch (error) {
            if (trigger.event) {
              await tryFn(() => this._sendInternal(machineId, entity.entityId, trigger.event!, {
                ...entity.context,
                triggerError: (error as Error).message
              }));
            }

            this.logger.error({ triggerName, machineId, entityId: entity.entityId, error: (error as Error).message }, `Trigger '${triggerName}' failed for entity ${entity.entityId}: ${(error as Error).message}`);
          }
        }

        return { processed: entities.length, executed: executedCount };
      }
    };
  }

  private async _setupDateTrigger(machineId: string, stateName: string, trigger: TriggerConfig, triggerName: string): Promise<void> {
    const cronManager = getCronManager();
    await cronManager.scheduleInterval(
      this.config.triggerCheckInterval,
      async () => {
        const entities = await this._getEntitiesInState(machineId, stateName);

        for (const entity of entities) {
          try {
            const triggerDateValue = entity.context?.[trigger.field!];
            if (!triggerDateValue) continue;

            const triggerDate = new Date(triggerDateValue as string);
            const now = new Date();

            if (now >= triggerDate) {
              const triggerContext = { ...entity.context, triggerName };

              if (trigger.condition) {
                const shouldTrigger = await trigger.condition(entity.context, entity.entityId);
                if (!shouldTrigger) continue;
              }

              if (trigger.maxTriggers !== undefined) {
                const triggerCount = entity.triggerCounts?.[triggerName] || 0;
                if (triggerCount >= trigger.maxTriggers) {
                  if (triggerCount === trigger.maxTriggers && trigger.onMaxTriggersReached) {
                    await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
                    await this._sendInternal(machineId, entity.entityId, trigger.onMaxTriggersReached, triggerContext);
                  }
                  continue;
                }
              }

              if (trigger.targetState) {
                const transition = await this._transitionToTargetState(
                  machineId,
                  entity.entityId,
                  trigger.targetState,
                  'TRIGGER',
                  triggerContext
                );

                await this._syncResourceStateField(machineId, entity.entityId, trigger.targetState);

                if (trigger.eventOnSuccess) {
                  await this._sendInternal(machineId, entity.entityId, trigger.eventOnSuccess, {
                    ...triggerContext,
                    triggerResult: transition
                  });
                } else if (trigger.event) {
                  await this._sendInternal(machineId, entity.entityId, trigger.event, {
                    ...triggerContext,
                    triggerResult: transition
                  });
                }
              } else {
                const result = await this._executeAction(
                  trigger.action!,
                  triggerContext,
                  'TRIGGER',
                  machineId,
                  entity.entityId
                );

                if (trigger.eventOnSuccess) {
                  await this._sendInternal(machineId, entity.entityId, trigger.eventOnSuccess, {
                    ...triggerContext,
                    triggerResult: result
                  });
                } else if (trigger.event) {
                  await this._sendInternal(machineId, entity.entityId, trigger.event, {
                    ...triggerContext,
                    triggerResult: result
                  });
                }
              }

              await this._incrementTriggerCount(machineId, entity.entityId, triggerName);

              this.emit('plg:state-machine:trigger-executed', {
                machineId,
                entityId: entity.entityId,
                state: stateName,
                trigger: triggerName,
                type: 'date'
              });
            }
          } catch (error) {
            this.logger.error({ triggerName, machineId, stateName, error: (error as Error).message }, `Date trigger '${triggerName}' failed: ${(error as Error).message}`);
          }
        }
      },
      `date-trigger-${machineId}-${stateName}-${triggerName}`
    );

    const jobName = `date-trigger-${machineId}-${stateName}-${triggerName}`;
    this.triggerJobNames.push(jobName);
  }

  private async _setupFunctionTrigger(machineId: string, stateName: string, trigger: TriggerConfig, triggerName: string): Promise<void> {
    const interval = trigger.interval || this.config.triggerCheckInterval;

    const cronManager = getCronManager();
    await cronManager.scheduleInterval(
      interval,
      async () => {
        const entities = await this._getEntitiesInState(machineId, stateName);

        for (const entity of entities) {
          try {
            const shouldTrigger = trigger.condition
              ? await trigger.condition(entity.context, entity.entityId)
              : true;

            if (!shouldTrigger) {
              continue;
            }

            if (trigger.maxTriggers !== undefined) {
              const triggerCount = entity.triggerCounts?.[triggerName] || 0;
              if (triggerCount >= trigger.maxTriggers) {
                if (triggerCount === trigger.maxTriggers && trigger.onMaxTriggersReached) {
                  await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
                  await this._sendInternal(machineId, entity.entityId, trigger.onMaxTriggersReached, {
                    ...entity.context,
                    triggerName
                  });
                }
                continue;
              }
            }

            const triggerContext = { ...entity.context, triggerName };

            if (trigger.targetState) {
              const transition = await this._transitionToTargetState(
                machineId,
                entity.entityId,
                trigger.targetState,
                'TRIGGER',
                triggerContext
              );

              await this._syncResourceStateField(machineId, entity.entityId, trigger.targetState);

              if (trigger.eventOnSuccess) {
                await this._sendInternal(machineId, entity.entityId, trigger.eventOnSuccess, {
                  ...triggerContext,
                  triggerResult: transition
                });
              } else if (trigger.event) {
                await this._sendInternal(machineId, entity.entityId, trigger.event, {
                  ...triggerContext,
                  triggerResult: transition
                });
              }
            } else {
              const result = await this._executeAction(
                trigger.action!,
                triggerContext,
                'TRIGGER',
                machineId,
                entity.entityId
              );

              if (trigger.eventOnSuccess) {
                await this._sendInternal(machineId, entity.entityId, trigger.eventOnSuccess, {
                  ...triggerContext,
                  triggerResult: result
                });
              } else if (trigger.event) {
                await this._sendInternal(machineId, entity.entityId, trigger.event, {
                  ...triggerContext,
                  triggerResult: result
                });
              }
            }

            await this._incrementTriggerCount(machineId, entity.entityId, triggerName);

            this.emit('plg:state-machine:trigger-executed', {
              machineId,
              entityId: entity.entityId,
              state: stateName,
              trigger: triggerName,
              type: 'function'
            });
          } catch (error) {
            this.logger.error({ triggerName, machineId, stateName, error: (error as Error).message }, `Function trigger '${triggerName}' failed: ${(error as Error).message}`);
          }
        }
      },
      `function-trigger-${machineId}-${stateName}-${triggerName}`
    );

    const jobName = `function-trigger-${machineId}-${stateName}-${triggerName}`;
    this.triggerJobNames.push(jobName);
  }

  private async _setupEventTrigger(machineId: string, stateName: string, trigger: TriggerConfig, triggerName: string): Promise<void> {
    const baseEventName = trigger.eventName || trigger.event;
    const eventSource = trigger.eventSource;

    if (!baseEventName) {
      throw new StateMachineError(`Event trigger '${triggerName}' must have either 'event' or 'eventName' property`, {
        operation: '_setupEventTrigger',
        machineId,
        stateName,
        triggerName
      });
    }

    const eventHandler = async (eventData: unknown) => {
      const entities = await this._getEntitiesInState(machineId, stateName);

      for (const entity of entities) {
        try {
          if (trigger.condition) {
            const shouldTrigger = await trigger.condition(entity.context, entity.entityId, eventData);
            if (!shouldTrigger) continue;
          }

          if (trigger.maxTriggers !== undefined) {
            const triggerCount = entity.triggerCounts?.[triggerName] || 0;
            if (triggerCount >= trigger.maxTriggers) {
              if (triggerCount === trigger.maxTriggers && trigger.onMaxTriggersReached) {
                await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
                await this._sendInternal(machineId, entity.entityId, trigger.onMaxTriggersReached, {
                  ...entity.context,
                  eventData,
                  triggerName
                });
              }
              continue;
            }
          }

          if (eventSource && typeof baseEventName === 'function') {
            const eventIdMatch = (eventData as Record<string, unknown>)?.id || (eventData as Record<string, unknown>)?.entityId;
            if (eventIdMatch && entity.entityId !== eventIdMatch) {
              continue;
            }
          }

          const triggerContext = { ...entity.context, eventData, triggerName };

          if (trigger.targetState) {
            const transition = await this._transitionToTargetState(
              machineId,
              entity.entityId,
              trigger.targetState,
              'TRIGGER',
              triggerContext
            );

            await this._syncResourceStateField(machineId, entity.entityId, trigger.targetState);

          } else if (trigger.action) {
            const result = await this._executeAction(
              trigger.action,
              triggerContext,
              'TRIGGER',
              machineId,
              entity.entityId
            );

            if (trigger.sendEvent) {
              await this._sendInternal(machineId, entity.entityId, trigger.sendEvent, {
                ...triggerContext,
                triggerResult: result
              });
            }
          }

          await this._incrementTriggerCount(machineId, entity.entityId, triggerName);

          this.emit('plg:state-machine:trigger-executed', {
            machineId,
            entityId: entity.entityId,
            state: stateName,
            trigger: triggerName,
            type: 'event',
            eventName: typeof baseEventName === 'function' ? 'dynamic' : baseEventName,
            targetState: trigger.targetState
          });
        } catch (error) {
          this.logger.error({ triggerName, machineId, stateName, error: (error as Error).message }, `Event trigger '${triggerName}' failed: ${(error as Error).message}`);
        }
      }
    };

    const registerListener = (emitter: TriggerListenerRef['emitter'], eventName: string, handler: (...args: unknown[]) => unknown): void => {
      const wrappedHandler = this._wrapEventHandler(handler);
      emitter.on?.(eventName, wrappedHandler);
      this._triggerListeners.push({
        emitter,
        eventName,
        handler: wrappedHandler
      });
    };

    if (eventSource) {
      const baseEvent = typeof baseEventName === 'function' ? 'updated' : baseEventName;

      registerListener(eventSource as TriggerListenerRef['emitter'], baseEvent, eventHandler);

      this.logger.debug({ baseEvent, resourceName: eventSource.name, triggerName }, `Listening to resource event '${baseEvent}' from '${eventSource.name}' for trigger '${triggerName}' (async-safe)`);
    } else {
      const staticEventName = typeof baseEventName === 'function' ? 'updated' : baseEventName;

      if (staticEventName.startsWith('db:')) {
        const dbEventName = staticEventName.substring(3);
        registerListener(this.database, dbEventName, eventHandler);

        this.logger.debug({ dbEventName, triggerName }, `Listening to database event '${dbEventName}' for trigger '${triggerName}'`);
      } else {
        registerListener(this, staticEventName, eventHandler);

        this.logger.debug({ staticEventName, triggerName }, `Listening to plugin event '${staticEventName}' for trigger '${triggerName}'`);
      }
    }
  }
  private async _attachStateMachinesToResources(): Promise<void> {
    const resourceStateMachineBindingMap = new Map<string, string>();

    for (const [machineName, machineData] of this.machines.entries()) {
      const resourceConfig = machineData.config;

      if (!resourceConfig.resource) {
        this.logger.debug({ machineName }, `Machine '${machineName}' has no resource configured, skipping attachment`);
        continue;
      }

      let resource: Resource | undefined;
      if (typeof resourceConfig.resource === 'string') {
        resource = this.database.resources[resourceConfig.resource] as unknown as Resource | undefined;
        if (!resource) {
          this.logger.warn(
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
          return this.send(machineName, id, event, eventData || {});
        },
        getState: async (id: string) => {
          return this.getState(machineName, id);
        },
        canTransition: async (id: string, event: string) => {
          const validEvents = await this.getValidEvents(machineName, id);
          return validEvents.includes(event);
        },
        getValidEvents: async (id: string) => {
          return this.getValidEvents(machineName, id);
        },
        initializeEntity: async (id: string, context?: Record<string, unknown>) => {
          return this.initializeEntity(machineName, id, context || {});
        },
        getTransitionHistory: async (id: string, options?: TransitionHistoryOptions) => {
          return this.getTransitionHistory(machineName, id, options);
        },
        transitions: async (id: string, options?: TransitionQueryOptions) => {
          return this.getTransitions(machineName, id, options);
        },
        transition: async (id: string, transitionId: string) => {
          return this.getTransition(machineName, id, transitionId);
        },
        transitionCount: async (id: string, options?: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'>) => {
          return this.getTransitionCount(machineName, id, options);
        },
        getLastTransitions: async (id: string, limit?: number) => {
          return this.getLastTransitions(machineName, id, limit);
        },
        getSnapshot: async (id: string) => {
          return this.getSnapshot(machineName, id);
        },
        snapshot: async (id: string) => {
          return this.getSnapshot(machineName, id);
        },
        deleteEntity: async (id: string) => {
          return this.deleteEntity(machineName, id);
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
              await tryFn(() => this.deleteEntity(machineName, entityId));
            }
            return data;
          });
          this.logger.debug({ machineName, resourceName: resource.name }, `Registered autoCleanup hook for machine '${machineName}'`);
        }
      }

      this.logger.debug({ machineName, resourceName: resource.name }, `Attached machine '${machineName}' to resource '${resource.name}'`);
    }
  }

  override async start(): Promise<void> {
    this.logger.debug({ machineCount: this.machines.size }, `Started with ${this.machines.size} state machines`);
  }

  override async stop(): Promise<void> {
    const cronManager = getCronManager();
    for (const jobName of this.triggerJobNames) {
      cronManager.stop(jobName);
    }
    this.triggerJobNames = [];

    if (this.schedulerPlugin) {
      await this.schedulerPlugin.stop();
      this.schedulerPlugin = null;
    }

    this.machines.clear();
    for (const listener of this._triggerListeners) {
      if (listener.emitter.off) {
        listener.emitter.off(listener.eventName, listener.handler);
      } else if (listener.emitter.removeListener) {
        listener.emitter.removeListener(listener.eventName, listener.handler);
      }
    }
    this._triggerListeners = [];
    this.removeAllListeners();
  }
}
