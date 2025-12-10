import { Plugin } from "./plugin.class.js";
interface Logger {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Database {
    createResource(config: ResourceConfig): Promise<Resource>;
    resources: Record<string, Resource>;
    addHook(event: string, handler: HookHandler): void;
    removeHook(event: string, handler: HookHandler): void;
    uploadMetadataFile?(): Promise<void>;
}
interface Resource {
    name: string;
    get(id: string): Promise<Record<string, unknown>>;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    patch(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    query(filter: Record<string, unknown>, options?: QueryOptions): Promise<Array<Record<string, unknown>>>;
    page(options: PageOptions): Promise<Array<Record<string, unknown>> | {
        items: Array<Record<string, unknown>>;
    }>;
    count(filter?: Record<string, unknown>): Promise<number>;
    on(event: string, handler: EventHandler): void;
    off(event: string, handler: EventHandler): void;
    addHook(hook: string, handler: HookHandler): void;
    _replicatorDefaultsInstalled?: boolean;
}
interface ResourceConfig {
    name: string;
    attributes: Record<string, string>;
    behavior?: string;
    partitions?: Record<string, PartitionConfig>;
}
interface PartitionConfig {
    fields: Record<string, string>;
}
interface QueryOptions {
    limit?: number;
    offset?: number;
}
interface PageOptions {
    offset: number;
    size: number;
}
type EventHandler = (...args: unknown[]) => void | Promise<void>;
type HookHandler = (data: unknown) => unknown | Promise<unknown>;
interface Replicator {
    id: string;
    name?: string;
    driver: string;
    config: Record<string, unknown>;
    initialize(database: Database): Promise<void>;
    replicate(resourceName: string, operation: string, data: Record<string, unknown> | null, recordId: string, beforeData?: Record<string, unknown> | null): Promise<unknown>;
    shouldReplicateResource(resourceName: string, operation?: string): boolean;
    getStatus(): Promise<ReplicatorStatus>;
    stop?(): Promise<void>;
}
interface ReplicatorStatus {
    healthy: boolean;
    lastSync?: Date;
    errorCount?: number;
}
interface ReplicatorConfig {
    driver: string;
    config?: Record<string, unknown>;
    resources: ResourcesDefinition;
    client?: unknown;
    queueUrlDefault?: string;
}
type ResourcesDefinition = string[] | Record<string, string | ResourceMapping | TransformFn>;
interface ResourceMapping {
    resource: string;
    transform?: TransformFn;
}
type TransformFn = (data: Record<string, unknown>) => Record<string, unknown>;
interface ReplicatorPluginConfig {
    replicators: ReplicatorConfig[];
    logErrors: boolean;
    persistReplicatorLog: boolean;
    enabled: boolean;
    batchSize: number;
    maxRetries: number;
    timeout: number;
    logLevel?: string;
    replicatorConcurrency: number;
    stopConcurrency: number;
    logResourceName: string;
}
interface ReplicatorStats {
    totalReplications: number;
    totalErrors: number;
    lastSync: string | null;
}
interface ReplicatorItem {
    id?: string;
    resourceName: string;
    operation: string;
    recordId: string;
    data?: Record<string, unknown> | null;
    beforeData?: Record<string, unknown> | null;
    replicator?: string;
    resource?: string;
    action?: string;
    status?: string;
    error?: string | null;
    retryCount?: number;
    timestamp?: number;
    createdAt?: string;
}
interface PromiseOutcome {
    status: 'fulfilled' | 'rejected';
    value?: unknown;
    reason?: Error;
}
interface ReplicatorLogsOptions {
    resourceName?: string;
    operation?: string;
    status?: string;
    limit?: number;
    offset?: number;
}
export interface ReplicatorPluginOptions {
    replicators?: ReplicatorConfig[];
    resourceNames?: {
        log?: string;
    };
    replicatorConcurrency?: number;
    stopConcurrency?: number;
    logErrors?: boolean;
    persistReplicatorLog?: boolean;
    enabled?: boolean;
    batchSize?: number;
    maxRetries?: number;
    timeout?: number;
    replicatorLogResource?: string;
    resourceFilter?: (resourceName: string) => boolean;
    resourceAllowlist?: string[];
    resourceBlocklist?: string[];
    logLevel?: string;
    logger?: Logger;
    [key: string]: unknown;
}
export declare class ReplicatorPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: ReplicatorPluginConfig;
    _logResourceDescriptor: {
        defaultName: string;
        override?: string;
    };
    logResourceName: string;
    resourceFilter: (resourceName: string) => boolean;
    replicators: Replicator[];
    eventListenersInstalled: Set<string>;
    eventHandlers: Map<string, {
        inserted: EventHandler;
        updated: EventHandler;
        deleted: EventHandler;
    }>;
    stats: ReplicatorStats;
    _afterCreateResourceHook: HookHandler | null;
    replicatorLog: Resource | null;
    _logResourceHooksInstalled: boolean;
    constructor(options?: ReplicatorPluginOptions);
    private _resolveLogResourceName;
    onNamespaceChanged(): void;
    filterInternalFields(obj: unknown): Record<string, unknown>;
    prepareReplicationData(resource: Resource, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    sanitizeBeforeData(beforeData: unknown): Record<string, unknown> | null;
    getCompleteData(resource: Resource, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    installEventListeners(resource: Resource, database: Database, plugin: ReplicatorPlugin): void;
    onInstall(): Promise<void>;
    start(): Promise<void>;
    installDatabaseHooks(): void;
    removeDatabaseHooks(): void;
    installReplicatorLogHooks(): void;
    createReplicator(driver: string, config: Record<string, unknown>, resources: ResourcesDefinition, client?: unknown): Promise<Replicator>;
    initializeReplicators(database: Database): Promise<void>;
    uploadMetadataFile(database: Database): Promise<void>;
    retryWithBackoff<T>(operation: () => Promise<T>, maxRetries?: number): Promise<T>;
    private _generateLogEntryId;
    private _normalizeLogEntry;
    logError(replicator: Replicator, resourceName: string, operation: string, recordId: string, data: Record<string, unknown> | null, error: Error): Promise<void>;
    processReplicatorEvent(operation: string, resourceName: string, recordId: string, data: Record<string, unknown> | null, beforeData?: Record<string, unknown> | null): Promise<PromiseOutcome[] | undefined>;
    processReplicatorItem(item: ReplicatorItem): Promise<PromiseOutcome[] | undefined>;
    logReplicator(item: ReplicatorItem): Promise<void>;
    updateReplicatorLog(logId: string, updates: Record<string, unknown>): Promise<void>;
    getReplicatorStats(): Promise<{
        replicators: Array<{
            id: string;
            driver: string;
            config: Record<string, unknown>;
            status: ReplicatorStatus;
        }>;
        stats: ReplicatorStats;
        lastSync: string | null;
    }>;
    getReplicatorLogs(options?: ReplicatorLogsOptions): Promise<Array<Record<string, unknown>>>;
    retryFailedReplicators(): Promise<{
        retried: number;
    }>;
    syncAllData(replicatorId: string): Promise<void>;
    stop(): Promise<void>;
    private _buildResourceFilter;
    private _shouldManageResource;
    private _filterResourcesDefinition;
    private _resourcesDefinitionIsEmpty;
}
export {};
//# sourceMappingURL=replicator.plugin.d.ts.map