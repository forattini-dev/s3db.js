import { Plugin } from './plugin.class.js';
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
    partitions?: Record<string, {
        fields: Record<string, string>;
    }>;
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
export declare class StateMachinePlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: StateMachineConfig;
    machines: Map<string, MachineData>;
    resourceNames: ResourceNames;
    triggerJobNames: string[];
    schedulerPlugin: (Plugin & {
        stop(): Promise<void>;
    }) | null;
    _pendingEventHandlers: Set<Promise<void>>;
    private _resourceDescriptors;
    constructor(options?: StateMachinePluginOptions);
    private _resolveResourceNames;
    onNamespaceChanged(): void;
    waitForPendingEvents(timeout?: number): Promise<void>;
    private _validateConfiguration;
    onInstall(): Promise<void>;
    private _createStateResources;
    send(machineId: string, entityId: string, event: string, context?: Record<string, unknown>): Promise<TransitionResult>;
    private _executeAction;
    private _transition;
    private _acquireTransitionLock;
    private _releaseTransitionLock;
    private _calculateBackoff;
    getState(machineId: string, entityId: string): Promise<string>;
    getValidEvents(machineId: string, stateOrEntityId: string): Promise<string[]>;
    getTransitionHistory(machineId: string, entityId: string, options?: TransitionHistoryOptions): Promise<TransitionHistoryEntry[]>;
    initializeEntity(machineId: string, entityId: string, context?: Record<string, unknown>): Promise<string>;
    getMachineDefinition(machineId: string): MachineConfig | null;
    getMachines(): string[];
    visualize(machineId: string): string;
    private _getEntitiesInState;
    private _incrementTriggerCount;
    private _setupTriggers;
    private _createCronJob;
    private _setupDateTrigger;
    private _setupFunctionTrigger;
    private _setupEventTrigger;
    private _attachStateMachinesToResources;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export {};
//# sourceMappingURL=state-machine.plugin.d.ts.map