import { Plugin } from '../plugin.class.js';
import { resolveResourceNames } from '../concerns/resource-names.js';
import { StateMachineError } from '../state-machine.errors.js';
import { getCronManager } from '../../concerns/cron-manager.js';

import {
  resolveEdge,
  resolveHooks,
  parseDuration,
  buildTriggerSubscriptionKey,
  buildEntityTriggerSubscriptionOwnerKey,
  isEntityAddressableTrigger
} from './helpers.js';

import {
  validateConfiguration,
  getMachineDefinitionDiagnostics as diagnosticsGetMachineDefinitionDiagnostics
} from './diagnostics.js';

import { executeAction, executeHooks, executeMachineHooks } from './hooks.js';

import {
  createStateResources,
  getStateResource,
  getTransitionLogResource,
  getAttachedResource as persistenceGetAttachedResource,
  getStateSnapshot,
  setInMemoryState,
  persistTransition as persistenceTransition,
  acquireTransitionLock as persistenceAcquireLock,
  releaseTransitionLock as persistenceReleaseLock
} from './persistence.js';

import {
  send as transitionEngineSend,
  assertTransition as engineAssertTransition,
  assertReject as engineAssertReject,
  transitionToTargetState as engineTransitionToTargetState
} from './transition-engine.js';

import {
  getState as queryGetState,
  getValidEvents as queryGetValidEvents,
  getTransitions as queryGetTransitions,
  getTransitionHistory as queryGetTransitionHistory,
  getTransitionCount as queryGetTransitionCount,
  getSnapshot as queryGetSnapshot,
  getTransition as queryGetTransition,
  getLastTransitions as queryGetLastTransitions
} from './query.js';

import { setupTriggers } from './triggers.js';

import {
  attachStateMachinesToResources,
  initializeEntity as attachInitializeEntity,
  deleteEntity as attachDeleteEntity
} from './resource-attachment.js';

import type {
  StateMachinePluginOptions,
  StateMachineConfig,
  MachineData,
  MachineConfig,
  MachineEventPayloadMap,
  ResourceNames,
  ResourceDescriptor,
  ResourceStateMachineBinding,
  ResolvedStateMachineBinding,
  Resource,
  Lock,
  PluginStorage,
  StateConfig,
  ConcurrencyConfig,
  ConditionalTarget,
  TransitionEdge,
  TransitionResult,
  TransitionSuccessResult,
  TransitionRejectedResult,
  TransitionAssertionSuccessParams,
  TransitionAssertionRejectParams,
  TransitionHistoryEntry,
  TransitionHistoryOptions,
  TransitionQueryOptions,
  StateMachineSnapshot,
  MachineDefinitionDiagnostics,
  MachineDefinitionIssue,
  TriggerListenerRef,
  TransitionContext
} from './types.js';

export class StateMachinePlugin<
  TMachineEvents extends MachineEventPayloadMap = Record<string, Record<string, Record<string, unknown>>>
> extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: StateMachineConfig;
  machines: Map<string, MachineData>;
  resourceNames: ResourceNames;
  triggerJobNames: string[];
  schedulerPlugin: (Plugin & { stop(): Promise<void> }) | null;
  _pendingEventHandlers: Set<Promise<void>>;
  _triggerListeners: TriggerListenerRef[];
  _ttlTimers: Map<string, NodeJS.Timeout>;
  _triggerSubscriptions: Map<string, Set<string>>;
  _entityTriggerSubscriptions: Map<string, Set<string>>;

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
    this._ttlTimers = new Map();
    this._triggerSubscriptions = new Map();
    this._entityTriggerSubscriptions = new Map();

    this._validateConfiguration();
  }

  // ── Resource name resolution ───────────────────────────────

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

  // ── Pending event handlers ─────────────────────────────────

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

  // ── Config helpers ─────────────────────────────────────────

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

  // ── Validation ─────────────────────────────────────────────

  private _validateConfiguration(): void {
    validateConfiguration(
      this.config,
      this.logger,
      (machineId, machineConfig) => diagnosticsGetMachineDefinitionDiagnostics(machineId, machineConfig, this.config.guards, this.config.actions)
    );
  }

  // ── Lifecycle ──────────────────────────────────────────────

  override async onInstall(): Promise<void> {
    if (this.config.persistTransitions) {
      await createStateResources(this);
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

    await attachStateMachinesToResources(this);
    await setupTriggers(this);

    this.emit('db:plugin:initialized', { machines: Array.from(this.machines.keys()) });
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

    for (const [, handle] of this._ttlTimers) {
      clearTimeout(handle);
    }
    this._ttlTimers.clear();

    this.machines.clear();
    for (const listener of this._triggerListeners) {
      if (listener.emitter.off) {
        listener.emitter.off(listener.eventName, listener.handler);
      } else if (listener.emitter.removeListener) {
        listener.emitter.removeListener(listener.eventName, listener.handler);
      }
    }
    this._triggerListeners = [];
    this._triggerSubscriptions.clear();
    this._entityTriggerSubscriptions.clear();
    this.removeAllListeners();
  }

  // ── Transition engine (public API) ─────────────────────────

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
    return transitionEngineSend(this, machineId, entityId, event, context);
  }

  async assertTransition<TMachine extends keyof TMachineEvents & string, TEvent extends keyof TMachineEvents[TMachine] & string>(
    params: TransitionAssertionSuccessParams<TMachine, TEvent> & { context?: TMachineEvents[TMachine][TEvent] }
  ): Promise<TransitionSuccessResult> {
    return engineAssertTransition(this, params);
  }

  async assertReject<TMachine extends keyof TMachineEvents & string, TEvent extends keyof TMachineEvents[TMachine] & string>(
    params: TransitionAssertionRejectParams<TMachine, TEvent> & { context?: TMachineEvents[TMachine][TEvent] }
  ): Promise<TransitionRejectedResult> {
    return engineAssertReject(this, params);
  }

  // ── Query (public API) ─────────────────────────────────────

  async getState(machineId: string, entityId: string): Promise<string> {
    return queryGetState(this, machineId, entityId);
  }

  async getValidEvents(machineId: string, stateOrEntityId: string): Promise<string[]> {
    return queryGetValidEvents(this, machineId, stateOrEntityId);
  }

  async getTransitions(machineId: string, entityId: string, options: TransitionQueryOptions = {}): Promise<TransitionHistoryEntry[]> {
    return queryGetTransitions(this, machineId, entityId, options);
  }

  async getTransitionHistory(machineId: string, entityId: string, options: TransitionHistoryOptions = {}): Promise<TransitionHistoryEntry[]> {
    return queryGetTransitionHistory(this, machineId, entityId, options);
  }

  async getTransitionCount(
    machineId: string,
    entityId: string,
    options: Omit<TransitionQueryOptions, 'limit' | 'offset' | 'sort'> = {}
  ): Promise<number> {
    return queryGetTransitionCount(this, machineId, entityId, options);
  }

  async getSnapshot(machineId: string, entityId: string): Promise<StateMachineSnapshot> {
    return queryGetSnapshot(this, machineId, entityId);
  }

  async getTransition(machineId: string, entityId: string, transitionId: string): Promise<TransitionHistoryEntry | null> {
    return queryGetTransition(this, machineId, entityId, transitionId);
  }

  async getLastTransitions(machineId: string, entityId: string, n?: number): Promise<TransitionHistoryEntry[]> {
    return queryGetLastTransitions(this, machineId, entityId, n);
  }

  // ── Diagnostics (public API) ───────────────────────────────

  getMachineDefinitionDiagnostics(machineId: string): MachineDefinitionDiagnostics | null {
    const machine = this.machines.get(machineId);
    if (!machine) {
      return null;
    }

    return diagnosticsGetMachineDefinitionDiagnostics(machineId, machine.config, this.config.guards, this.config.actions);
  }

  getDefinitionDiagnostics(): Record<string, MachineDefinitionDiagnostics> {
    const diagnostics: Record<string, MachineDefinitionDiagnostics> = {};

    for (const machineId of this.machines.keys()) {
      diagnostics[machineId] = diagnosticsGetMachineDefinitionDiagnostics(machineId, this.machines.get(machineId)!.config, this.config.guards, this.config.actions);
    }

    return diagnostics;
  }

  // ── Resource attachment (public API) ───────────────────────

  async initializeEntity(machineId: string, entityId: string, context: Record<string, unknown> = {}): Promise<string> {
    return attachInitializeEntity(this, machineId, entityId, context);
  }

  async deleteEntity(machineId: string, entityId: string): Promise<void> {
    return attachDeleteEntity(this, machineId, entityId);
  }

  // ── Inline public methods ──────────────────────────────────

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
        for (const [event, edgeConfig] of Object.entries(stateConfig.on)) {
          if (Array.isArray(edgeConfig)) {
            for (const candidate of edgeConfig as ConditionalTarget[]) {
              const edge = resolveEdge(candidate);
              const label = edge.guard ? `${event} [${edge.guard}]` : event;
              dot += `  ${stateName} -> ${edge.target} [label="${label}"];\n`;
            }
          } else {
            const edge = resolveEdge(edgeConfig as string | TransitionEdge);
            const label = edge.guard ? `${event} [${edge.guard}]` : event;
            dot += `  ${stateName} -> ${edge.target} [label="${label}"];\n`;
          }
        }
      }
    }

    dot += `  start [shape=point];\n`;
    dot += `  start -> ${machine.config.initialState};\n`;

    dot += `}\n`;

    return dot;
  }

  // ── Context interface methods (called by modules) ──────────

  getStateResource(): Resource | null {
    return getStateResource(this);
  }

  getTransitionLogResource(): Resource | null {
    return getTransitionLogResource(this);
  }

  async getAttachedResource(machineId: string): Promise<Resource | null> {
    return persistenceGetAttachedResource(this, machineId);
  }

  async acquireTransitionLock(machineId: string, entityId: string): Promise<Lock | null> {
    return persistenceAcquireLock(this, machineId, entityId);
  }

  async releaseTransitionLock(lock: Lock | null): Promise<void> {
    return persistenceReleaseLock(this, lock);
  }

  async getStateSnapshot(machineId: string, entityId: string): Promise<{ state: string; version: number }> {
    return getStateSnapshot(this, machineId, entityId);
  }

  async persistTransition(
    machineId: string,
    entityId: string,
    fromState: string,
    toState: string,
    event: string,
    context: Record<string, unknown>,
    fromStateVersion?: number
  ): Promise<number> {
    return persistenceTransition(this, machineId, entityId, fromState, toState, event, context, fromStateVersion);
  }

  setInMemoryState(machineId: string, entityId: string, state: string, version: number): void {
    setInMemoryState(this, machineId, entityId, state, version);
  }

  async transitionToTargetState(
    machineId: string,
    entityId: string,
    targetState: string,
    event: string,
    context: Record<string, unknown>
  ): Promise<{ from: string; to: string; stateVersion: number; cancelled?: boolean }> {
    return engineTransitionToTargetState(this, machineId, entityId, targetState, event, context);
  }

  async executeAction(
    actionName: string,
    context: Record<string, unknown>,
    event: string,
    machineId: string,
    entityId: string,
    transitionContext?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void }
  ): Promise<unknown> {
    return executeAction(this, actionName, context, event, machineId, entityId, transitionContext);
  }

  async executeHooks(
    hookNames: string[],
    context: Record<string, unknown>,
    event: string,
    machineId: string,
    entityId: string,
    transitionCtx?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void },
    options?: { cancellable?: boolean; hookLabel?: string; stateName?: string }
  ): Promise<{ cancelled: boolean; action?: string }> {
    return executeHooks(this, hookNames, context, event, machineId, entityId, transitionCtx, options);
  }

  async executeMachineHooks(
    machineId: string,
    hookName: string,
    context: Record<string, unknown>,
    event: string,
    entityId: string,
    transitionCtx?: Partial<TransitionContext> & { machineContext?: Record<string, unknown>; assign?: (partial: Record<string, unknown>) => void },
    options?: { cancellable?: boolean }
  ): Promise<{ cancelled: boolean; action?: string }> {
    return executeMachineHooks(this, machineId, hookName, context, event, entityId, transitionCtx, options);
  }

  resolveHooks(stateConfig: any, hookName: string, legacyField?: string): string[] {
    return resolveHooks(stateConfig, hookName, legacyField);
  }

  // ── TTL helpers ────────────────────────────────────────────

  hasTTLStates(machineId: string): boolean {
    const machine = this.machines?.get(machineId);
    if (!machine) return false;
    return Object.values(machine.config.states).some((s: StateConfig) => s.ttl);
  }

  scheduleTTL(machineId: string, entityId: string, stateConfig?: StateConfig): void {
    if (!stateConfig?.ttl) return;
    const ttlKey = `${machineId}:${entityId}`;
    this.cancelTTL(machineId, entityId);
    const delayMs = parseDuration(stateConfig.ttl.after);
    if (delayMs <= 0) return;
    const eventToSend = stateConfig.ttl.send;
    const handle = setTimeout(async () => {
      this._ttlTimers.delete(ttlKey);
      try {
        await this.send(machineId, entityId, eventToSend, { _ttlExpired: true });
      } catch (err) {
        this.logger.debug({ machineId, entityId, event: eventToSend, error: (err as Error)?.message },
          'TTL event send failed (entity may have left state)');
      }
    }, delayMs);
    if (handle.unref) handle.unref();
    this._ttlTimers.set(ttlKey, handle);
  }

  cancelTTL(machineId: string, entityId: string): void {
    const ttlKey = `${machineId}:${entityId}`;
    const existing = this._ttlTimers.get(ttlKey);
    if (existing) {
      clearTimeout(existing);
      this._ttlTimers.delete(ttlKey);
    }
  }

  updateEntityTriggerSubscriptions(machineId: string, entityId: string, stateName: string): void {
    const machine = this.machines.get(machineId);
    if (!machine) {
      return;
    }

    this.clearEntityTriggerSubscriptions(machineId, entityId);

    const stateConfig = machine.config.states[stateName];
    const triggers = stateConfig?.triggers || [];
    const ownerKey = buildEntityTriggerSubscriptionOwnerKey(machineId, entityId);

    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i]!;
      if (!isEntityAddressableTrigger(trigger)) {
        continue;
      }

      const triggerName = `${trigger.action}_${i}`;
      const subscriptionKey = buildTriggerSubscriptionKey(machineId, stateName, triggerName);

      if (!this._triggerSubscriptions.has(subscriptionKey)) {
        this._triggerSubscriptions.set(subscriptionKey, new Set());
      }
      this._triggerSubscriptions.get(subscriptionKey)!.add(entityId);

      if (!this._entityTriggerSubscriptions.has(ownerKey)) {
        this._entityTriggerSubscriptions.set(ownerKey, new Set());
      }
      this._entityTriggerSubscriptions.get(ownerKey)!.add(subscriptionKey);
    }
  }

  clearEntityTriggerSubscriptions(machineId: string, entityId: string): void {
    const ownerKey = buildEntityTriggerSubscriptionOwnerKey(machineId, entityId);
    const subscriptions = this._entityTriggerSubscriptions.get(ownerKey);
    if (!subscriptions) {
      return;
    }

    for (const subscriptionKey of subscriptions) {
      const entities = this._triggerSubscriptions.get(subscriptionKey);
      if (!entities) {
        continue;
      }

      entities.delete(entityId);
      if (entities.size === 0) {
        this._triggerSubscriptions.delete(subscriptionKey);
      }
    }

    this._entityTriggerSubscriptions.delete(ownerKey);
  }

  getTriggerSubscribedEntities(subscriptionKey: string): string[] {
    return Array.from(this._triggerSubscriptions.get(subscriptionKey) || []);
  }

  // ── Event handler wrapper ──────────────────────────────────

  wrapEventHandler(
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
}
