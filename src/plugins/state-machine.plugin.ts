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

interface Resource {
  name: string;
  insert(data: Record<string, unknown>): Promise<unknown>;
  update(id: string, data: Record<string, unknown>): Promise<unknown>;
  patch(id: string, data: Record<string, unknown>): Promise<unknown>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<StateRecord | null>;
  query(filter: Record<string, unknown>, options?: QueryOptions): Promise<TransitionRecord[]>;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface QueryOptions {
  limit?: number;
  offset?: number;
}

interface StateRecord {
  id: string;
  machineId: string;
  entityId: string;
  currentState: string;
  context: Record<string, unknown>;
  lastTransition: string | null;
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
  timestamp: number;
  createdAt: string;
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
  from: string;
  to: string;
  event: string;
  timestamp: string;
}

export interface TransitionHistoryEntry {
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

interface EntityInState {
  entityId: string;
  currentState: string;
  context: Record<string, unknown>;
  triggerCounts: Record<string, number>;
}

interface MachineProxy {
  send(id: string, event: string, eventData?: Record<string, unknown>): Promise<TransitionResult>;
  getState(id: string): Promise<string>;
  canTransition(id: string, event: string): Promise<boolean>;
  getValidEvents(id: string): Promise<string[]>;
  initializeEntity(id: string, context?: Record<string, unknown>): Promise<string>;
  getTransitionHistory(id: string, options?: TransitionHistoryOptions): Promise<TransitionHistoryEntry[]>;
  deleteEntity(id: string): Promise<void>;
}

interface SchedulerPluginClass {
  new(options: Record<string, unknown>): Plugin & { stop(): Promise<void> };
}

export class StateMachinePlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: StateMachineConfig;
  machines: Map<string, MachineData>;
  resourceNames: ResourceNames;
  triggerJobNames: string[];
  schedulerPlugin: (Plugin & { stop(): Promise<void> }) | null;
  _pendingEventHandlers: Set<Promise<void>>;

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
      stateMachines,
      actions,
      guards,
      persistTransitions,
      transitionLogResource: this.resourceNames.transitionLog,
      stateResource: this.resourceNames.states,
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
      if (Date.now() - startTime > timeout) {
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
        await Promise.race(Array.from(this._pendingEventHandlers));
      }

      await new Promise(resolve => setImmediate(resolve));
    }
  }

  private _validateConfiguration(): void {
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
    }
  }

  override async onInstall(): Promise<void> {
    if (this.config.persistTransitions) {
      await this._createStateResources();
    }

    for (const [machineName, machineConfig] of Object.entries(this.config.stateMachines)) {
      this.machines.set(machineName, {
        config: machineConfig,
        currentStates: new Map()
      });
    }

    await this._attachStateMachinesToResources();
    await this._setupTriggers();

    this.emit('db:plugin:initialized', { machines: Array.from(this.machines.keys()) });
  }

  private async _createStateResources(): Promise<void> {
    const [logOk] = await tryFn(() => this.database.createResource({
      name: this.config.transitionLogResource,
      attributes: {
        id: 'string|required',
        machineId: 'string|required',
        entityId: 'string|required',
        fromState: 'string',
        toState: 'string|required',
        event: 'string|required',
        context: 'json',
        timestamp: 'number|required',
        createdAt: 'string|required'
      },
      behavior: 'body-overflow',
      partitions: {
        byMachine: { fields: { machineId: 'string' } },
        byDate: { fields: { createdAt: 'string|maxlength:10' } }
      }
    }));

    const [stateOk] = await tryFn(() => this.database.createResource({
      name: this.config.stateResource,
      attributes: {
        id: 'string|required',
        machineId: 'string|required',
        entityId: 'string|required',
        currentState: 'string|required',
        context: 'json|default:{}',
        lastTransition: 'string|default:null',
        triggerCounts: 'json|default:{}',
        updatedAt: 'string|required'
      },
      behavior: 'body-overflow'
    }));
  }

  async send(machineId: string, entityId: string, event: string, context: Record<string, unknown> = {}): Promise<TransitionResult> {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'send',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    const lock = await this._acquireTransitionLock(machineId, entityId);

    try {
      const currentState = await this.getState(machineId, entityId);
      const stateConfig = machine.config.states[currentState];

      if (!stateConfig || !stateConfig.on || !stateConfig.on[event]) {
        throw new StateMachineError(`Event '${event}' not valid for state '${currentState}' in machine '${machineId}'`, {
          operation: 'send',
          machineId,
          entityId,
          event,
          currentState,
          validEvents: stateConfig && stateConfig.on ? Object.keys(stateConfig.on) : [],
          suggestion: 'Use getValidEvents() to check which events are valid for the current state'
        });
      }

      const targetState = stateConfig.on[event];

      if (stateConfig.guards && stateConfig.guards[event]) {
        const guardName = stateConfig.guards[event];
        const guard = this.config.guards[guardName];

        if (guard) {
          const [guardOk, guardErr, guardResult] = await tryFn(() =>
            guard(context, event, { database: this.database as unknown as Database, machineId, entityId })
          );

          if (!guardOk || !guardResult) {
            throw new StateMachineError(`Transition blocked by guard '${guardName}'`, {
              operation: 'send',
              machineId,
              entityId,
              event,
              currentState,
              guardName,
              guardError: (guardErr as Error)?.message || 'Guard returned false',
              suggestion: 'Check guard conditions or modify the context to satisfy guard requirements'
            });
          }
        }
      }

      if (stateConfig.exit) {
        await this._executeAction(stateConfig.exit, context, event, machineId, entityId);
      }

      await this._transition(machineId, entityId, currentState, targetState, event, context);

      const targetStateConfig = machine.config.states[targetState];
      if (targetStateConfig && targetStateConfig.entry) {
        await this._executeAction(targetStateConfig.entry, context, event, machineId, entityId);
      }

      this.emit('plg:state-machine:transition', {
        machineId,
        entityId,
        from: currentState,
        to: targetState,
        event,
        context
      });

      return {
        from: currentState,
        to: targetState,
        event,
        timestamp: new Date().toISOString()
      };
    } finally {
      await this._releaseTransitionLock(lock);
    }
  }

  private async _executeAction(
    actionName: string,
    context: Record<string, unknown>,
    event: string,
    machineId: string,
    entityId: string
  ): Promise<unknown> {
    const action = this.config.actions[actionName];
    if (!action) {
      this.logger.warn({ actionName, machineId, entityId }, `Action '${actionName}' not found`);
      return undefined;
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
        const result = await action(context, event, { database: this.database as unknown as Database, machineId, entityId });

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
          this.logger.error({ actionName, machineId, entityId, error: lastError.message }, `Action '${actionName}' failed: ${lastError.message}`);
          this.emit('plg:state-machine:action-error', { actionName, error: lastError.message, machineId, entityId });
          return;
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
    context: Record<string, unknown>
  ): Promise<void> {
    const timestamp = Date.now();
    const now = new Date().toISOString();

    const machine = this.machines.get(machineId)!;
    machine.currentStates.set(entityId, toState);

    if (this.config.persistTransitions) {
      const transitionId = `${machineId}_${entityId}_${timestamp}`;

      let logOk = false;
      let lastLogErr: Error | undefined;

      for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
        const [ok, err] = await tryFn(() =>
          this.database.resources[this.config.transitionLogResource]!.insert({
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
        this.logger.warn({ machineId, entityId, attempts: this.config.retryAttempts, error: lastLogErr.message }, `Failed to log transition after ${this.config.retryAttempts} attempts: ${lastLogErr.message}`);
      }

      const stateId = `${machineId}_${entityId}`;
      const stateData = {
        machineId,
        entityId,
        currentState: toState,
        context,
        lastTransition: transitionId,
        updatedAt: now
      };

      const [updateOk] = await tryFn(() =>
        this.database.resources[this.config.stateResource]!.update(stateId, stateData)
      );

      if (!updateOk) {
        const [insertOk, insertErr] = await tryFn(() =>
          this.database.resources[this.config.stateResource]!.insert({ id: stateId, ...stateData })
        );

        if (!insertOk) {
          this.logger.warn({ machineId, entityId, stateId, error: (insertErr as Error).message }, `Failed to upsert state: ${(insertErr as Error).message}`);
        }
      }
    }
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
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: 'getState',
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: 'Check machine ID or use getMachines() to list available machines'
      });
    }

    if (machine.currentStates.has(entityId)) {
      return machine.currentStates.get(entityId)!;
    }

    if (this.config.persistTransitions) {
      const stateId = `${machineId}_${entityId}`;
      const [ok, , stateRecord] = await tryFn<StateRecord>(() =>
        this.database.resources[this.config.stateResource]!.get(stateId) as unknown as Promise<StateRecord>
      );

      if (ok && stateRecord) {
        machine.currentStates.set(entityId, stateRecord.currentState);
        return stateRecord.currentState;
      }
    }

    const initialState = machine.config.initialState;
    machine.currentStates.set(entityId, initialState);
    return initialState;
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

  async getTransitionHistory(machineId: string, entityId: string, options: TransitionHistoryOptions = {}): Promise<TransitionHistoryEntry[]> {
    if (!this.config.persistTransitions) {
      return [];
    }

    const { limit = 50, offset = 0 } = options;

    const [ok, err, transitions] = await tryFn<TransitionRecord[]>(() =>
      this.database.resources[this.config.transitionLogResource]!.query({
        machineId,
        entityId
      }, {
        limit,
        offset
      }) as unknown as Promise<TransitionRecord[]>
    );

    if (!ok) {
      this.logger.warn({ machineId, entityId, error: (err as Error).message }, `Failed to get transition history: ${(err as Error).message}`);
      return [];
    }

    const sorted = (transitions || []).sort((a, b) => b.timestamp - a.timestamp);

    return sorted.map(t => ({
      from: t.fromState,
      to: t.toState,
      event: t.event,
      context: t.context,
      timestamp: new Date(t.timestamp).toISOString()
    }));
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

      const [ok, err] = await tryFn(() =>
        this.database.resources[this.config.stateResource]!.insert({
          id: stateId,
          machineId,
          entityId,
          currentState: initialState,
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

    await tryFn(() =>
      this.database.resources[this.config.stateResource]?.delete(stateId)
    );

    if (this.config.persistTransitions) {
      const [ok, , transitions] = await tryFn<TransitionRecord[]>(() =>
        this.database.resources[this.config.transitionLogResource]?.query({
          machineId,
          entityId
        }) as unknown as Promise<TransitionRecord[]>
      );

      if (ok && transitions && transitions.length > 0) {
        await Promise.all(
          transitions.map(t =>
            tryFn(() =>
              this.database.resources[this.config.transitionLogResource]?.delete(t.id)
            )
          )
        );
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

    const [ok, err, records] = await tryFn<StateRecord[]>(() =>
      this.database.resources[this.config.stateResource]!.query({
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

    const [ok, , stateRecord] = await tryFn<StateRecord>(() =>
      this.database.resources[this.config.stateResource]!.get(stateId) as unknown as Promise<StateRecord>
    );

    if (ok && stateRecord) {
      const triggerCounts: Record<string, number> = stateRecord.triggerCounts || {};
      triggerCounts[triggerName] = (triggerCounts[triggerName] || 0) + 1;

      await tryFn(() =>
        this.database.resources[this.config.stateResource]!.patch(stateId, { triggerCounts })
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
            if (trigger.condition) {
              const shouldTrigger = await trigger.condition(entity.context, entity.entityId);
              if (!shouldTrigger) continue;
            }

            if (trigger.maxTriggers !== undefined) {
              const triggerCount = entity.triggerCounts?.[triggerName] || 0;
              if (triggerCount >= trigger.maxTriggers) {
                if (trigger.onMaxTriggersReached) {
                  await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                }
                continue;
              }
            }

            const result = await this._executeAction(
              trigger.action!,
              entity.context,
              'TRIGGER',
              machineId,
              entity.entityId
            );

            await this._incrementTriggerCount(machineId, entity.entityId, triggerName);
            executedCount++;

            if (trigger.eventOnSuccess) {
              await this.send(machineId, entity.entityId, trigger.eventOnSuccess, {
                ...entity.context,
                triggerResult: result
              });
            } else if (trigger.event) {
              await this.send(machineId, entity.entityId, trigger.event, {
                ...entity.context,
                triggerResult: result
              });
            }

            this.emit('plg:state-machine:trigger-executed', {
              machineId,
              entityId: entity.entityId,
              state: stateName,
              trigger: triggerName,
              type: 'cron'
            });

          } catch (error) {
            if (trigger.event) {
              await tryFn(() => this.send(machineId, entity.entityId, trigger.event!, {
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
              if (trigger.maxTriggers !== undefined) {
                const triggerCount = entity.triggerCounts?.[triggerName] || 0;
                if (triggerCount >= trigger.maxTriggers) {
                  if (trigger.onMaxTriggersReached) {
                    await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                  }
                  continue;
                }
              }

              const result = await this._executeAction(trigger.action!, entity.context, 'TRIGGER', machineId, entity.entityId);
              await this._incrementTriggerCount(machineId, entity.entityId, triggerName);

              if (trigger.event) {
                await this.send(machineId, entity.entityId, trigger.event, {
                  ...entity.context,
                  triggerResult: result
                });
              }

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
            if (trigger.maxTriggers !== undefined) {
              const triggerCount = entity.triggerCounts?.[triggerName] || 0;
              if (triggerCount >= trigger.maxTriggers) {
                if (trigger.onMaxTriggersReached) {
                  await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
                }
                continue;
              }
            }

            const shouldTrigger = await trigger.condition!(entity.context, entity.entityId);

            if (shouldTrigger) {
              const result = await this._executeAction(trigger.action!, entity.context, 'TRIGGER', machineId, entity.entityId);
              await this._incrementTriggerCount(machineId, entity.entityId, triggerName);

              if (trigger.event) {
                await this.send(machineId, entity.entityId, trigger.event, {
                  ...entity.context,
                  triggerResult: result
                });
              }

              this.emit('plg:state-machine:trigger-executed', {
                machineId,
                entityId: entity.entityId,
                state: stateName,
                trigger: triggerName,
                type: 'function'
              });
            }
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
          let resolvedEventName: string;
          if (typeof baseEventName === 'function') {
            resolvedEventName = baseEventName(entity.context);
          } else {
            resolvedEventName = baseEventName;
          }

          if (eventSource && typeof baseEventName === 'function') {
            const eventIdMatch = (eventData as Record<string, unknown>)?.id || (eventData as Record<string, unknown>)?.entityId;
            if (eventIdMatch && entity.entityId !== eventIdMatch) {
              continue;
            }
          }

          if (trigger.condition) {
            const shouldTrigger = await trigger.condition(entity.context, entity.entityId, eventData);
            if (!shouldTrigger) continue;
          }

          if (trigger.maxTriggers !== undefined) {
            const triggerCount = entity.triggerCounts?.[triggerName] || 0;
            if (triggerCount >= trigger.maxTriggers) {
              if (trigger.onMaxTriggersReached) {
                await this.send(machineId, entity.entityId, trigger.onMaxTriggersReached, entity.context);
              }
              continue;
            }
          }

          if (trigger.targetState) {
            await this._transition(
              machineId,
              entity.entityId,
              stateName,
              trigger.targetState,
              'TRIGGER',
              { ...entity.context, eventData, triggerName }
            );

            const machine = this.machines.get(machineId)!;
            const resourceConfig = machine.config;
            if (resourceConfig.resource && resourceConfig.stateField) {
              let resource: Resource;
              if (typeof resourceConfig.resource === 'string') {
                resource = await this.database.getResource(resourceConfig.resource) as unknown as Resource;
              } else {
                resource = resourceConfig.resource as Resource;
              }

              if (resource) {
                const [ok] = await tryFn(() =>
                  resource.patch(entity.entityId, { [resourceConfig.stateField!]: trigger.targetState })
                );
                if (!ok) {
                  this.logger.warn({ machineId, entityId: entity.entityId }, `Failed to update resource stateField for entity ${entity.entityId}`);
                }
              }
            }

            const targetStateConfig = machine.config.states[trigger.targetState];
            if (targetStateConfig?.entry) {
              await this._executeAction(
                targetStateConfig.entry,
                { ...entity.context, eventData },
                'TRIGGER',
                machineId,
                entity.entityId
              );
            }

            this.emit('plg:state-machine:transition', {
              machineId,
              entityId: entity.entityId,
              from: stateName,
              to: trigger.targetState,
              event: 'TRIGGER',
              context: { ...entity.context, eventData, triggerName }
            });
          } else if (trigger.action) {
            const result = await this._executeAction(
              trigger.action,
              { ...entity.context, eventData },
              'TRIGGER',
              machineId,
              entity.entityId
            );

            if (trigger.sendEvent) {
              await this.send(machineId, entity.entityId, trigger.sendEvent, {
                ...entity.context,
                triggerResult: result,
                eventData
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

    if (eventSource) {
      const baseEvent = typeof baseEventName === 'function' ? 'updated' : baseEventName;

      const wrappedHandler = async (...args: unknown[]) => {
        const handlerPromise = eventHandler(args[0]);

        if (!this._pendingEventHandlers) {
          this._pendingEventHandlers = new Set();
        }
        this._pendingEventHandlers.add(handlerPromise);

        try {
          await handlerPromise;
        } finally {
          this._pendingEventHandlers.delete(handlerPromise);
        }
      };

      eventSource.on(baseEvent, wrappedHandler);

      this.logger.debug({ baseEvent, resourceName: eventSource.name, triggerName }, `Listening to resource event '${baseEvent}' from '${eventSource.name}' for trigger '${triggerName}' (async-safe)`);
    } else {
      const staticEventName = typeof baseEventName === 'function' ? 'updated' : baseEventName;

      if (staticEventName.startsWith('db:')) {
        const dbEventName = staticEventName.substring(3);
        this.database.on(dbEventName, eventHandler);

        this.logger.debug({ dbEventName, triggerName }, `Listening to database event '${dbEventName}' for trigger '${triggerName}'`);
      } else {
        this.on(staticEventName, eventHandler);

        this.logger.debug({ staticEventName, triggerName }, `Listening to plugin event '${staticEventName}' for trigger '${triggerName}'`);
      }
    }
  }

  private async _attachStateMachinesToResources(): Promise<void> {
    for (const [machineName, machineConfig] of Object.entries(this.config.stateMachines)) {
      const resourceConfig = (machineConfig as MachineConfig).config || machineConfig;

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
        deleteEntity: async (id: string) => {
          return this.deleteEntity(machineName, id);
        }
      };

      (resource as Resource & { _stateMachine: MachineProxy })._stateMachine = machineProxy;

      Object.defineProperty(resource, 'state', {
        get: () => ({
          send: async (id: string, event: string, eventData?: Record<string, unknown>) => machineProxy.send(id, event, eventData),
          get: async (id: string) => machineProxy.getState(id),
          canTransition: async (id: string, event: string) => machineProxy.canTransition(id, event),
          getValidEvents: async (id: string) => machineProxy.getValidEvents(id),
          initialize: async (id: string, context?: Record<string, unknown>) => machineProxy.initializeEntity(id, context),
          history: async (id: string, options?: TransitionHistoryOptions) => machineProxy.getTransitionHistory(id, options),
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
    this.removeAllListeners();
  }
}
