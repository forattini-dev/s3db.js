import type { Client } from '../clients/types.js';
import type { BehaviorType } from '../behaviors/types.js';
import type { LogLevel, StringRecord as CommonStringRecord, EventHandler } from '../types/common.types.js';
import type { ResourceExport } from '../resource.class.js';
import type { PartitionsConfig } from '../core/resource-query.class.js';
import type { AttributesSchema } from '../core/resource-validator.class.js';
import type { Logger } from '../concerns/logger.js';
import type { ProcessManager } from '../concerns/process-manager.js';
import type { CronManager } from '../concerns/cron-manager.js';
import type Resource from '../resource.class.js';
export type StringRecord<T = unknown> = CommonStringRecord<T>;
export interface ExecutorPoolConfig {
    enabled?: boolean;
    concurrency?: number;
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    retryableErrors?: string[];
    autotune?: AutotuneConfig | null;
    monitoring?: MonitoringConfig;
}
export interface AutotuneConfig {
    enabled?: boolean;
    targetLatency?: number;
    minConcurrency?: number;
    maxConcurrency?: number;
}
export interface MonitoringConfig {
    collectMetrics?: boolean;
    [key: string]: unknown;
}
export interface TaskExecutorMonitoringConfig {
    enabled?: boolean;
    metricsInterval?: number;
}
export interface LoggerConfig {
    level?: LogLevel;
    pretty?: boolean;
    destination?: string;
    childLevels?: StringRecord<LogLevel>;
}
export interface ClientOptions {
    compression?: {
        enabled?: boolean;
    };
    retries?: number;
    timeout?: number;
    [key: string]: unknown;
}
export interface CacheConfig {
    enabled?: boolean;
    ttl?: number;
    maxSize?: number;
}
export interface SavedMetadata {
    version: string;
    s3dbVersion: string;
    lastUpdated: string;
    resources: StringRecord<ResourceMetadata>;
}
export interface ResourceMetadata {
    currentVersion: string;
    partitions: PartitionsConfig;
    createdBy?: string;
    versions: StringRecord<VersionData>;
}
export interface VersionData {
    hash: string;
    attributes: AttributesSchema;
    behavior: BehaviorType;
    timestamps?: boolean;
    partitions?: PartitionsConfig;
    paranoid?: boolean;
    allNestedObjectsOptional?: boolean;
    autoDecrypt?: boolean;
    cache?: boolean;
    asyncEvents?: boolean;
    asyncPartitions?: boolean;
    hooks?: StringRecord<HookSummary>;
    idSize?: number;
    idGenerator?: string | number | Record<string, unknown>;
    createdAt?: string;
    map?: StringRecord<string>;
}
export interface HookSummary {
    count: number;
    handlers: Array<{
        name: string | null;
        length: number | null;
        type: string;
    }>;
}
export interface DefinitionChange {
    type: 'new' | 'changed' | 'deleted';
    resourceName: string;
    currentHash: string | null;
    savedHash: string | null;
    fromVersion?: string;
    toVersion?: string;
    deletedVersion?: string;
}
export interface GlobalCoordinatorOptions {
    autoStart?: boolean;
    config?: GlobalCoordinatorConfig;
}
export interface GlobalCoordinatorConfig {
    heartbeatInterval?: number;
    heartbeatJitter?: number;
    leaseTimeout?: number;
    workerTimeout?: number;
    diagnosticsEnabled?: boolean;
    circuitBreaker?: {
        failureThreshold?: number;
        resetTimeout?: number;
    };
}
export interface GlobalCoordinatorService {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getLeader: () => Promise<string | null>;
    getCircuitBreakerStatus: () => {
        state: string;
        failures: number;
    };
    on: (event: string, handler: EventHandler) => void;
}
export interface MemorySnapshot {
    timestamp: string;
    rssMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    arrayBuffersMB?: number;
}
export type HookEventName = 'beforeConnect' | 'afterConnect' | 'beforeCreateResource' | 'afterCreateResource' | 'beforeUploadMetadata' | 'afterUploadMetadata' | 'beforeDisconnect' | 'afterDisconnect' | 'resourceCreated' | 'resourceUpdated';
export type DatabaseHookFunction = (context: {
    database: DatabaseRef;
    [key: string]: unknown;
}) => void | Promise<void>;
export interface DatabaseRef {
    id: string;
    version: string;
    s3dbVersion: string;
    client: Client;
    logger: Logger;
    savedMetadata: SavedMetadata | null;
    _resourcesMap: StringRecord<Resource>;
    resources: StringRecord<Resource>;
    passphrase: string;
    bcryptRounds: number;
    versioningEnabled: boolean;
    strictValidation: boolean;
    strictHooks: boolean;
    disableResourceEvents: boolean;
    deferMetadataWrites: boolean;
    metadataWriteDelay: number;
    cache: CacheConfig | boolean | undefined;
    processManager: ProcessManager;
    cronManager: CronManager;
    executorPool: ExecutorPoolConfig;
    pluginList: PluginConstructor[];
    pluginRegistry: StringRecord<Plugin>;
    plugins: StringRecord<Plugin>;
    bucket: string;
    keyPrefix: string;
    emit: (event: string, data?: unknown) => void | Promise<void>;
    isConnected: () => boolean;
    getChildLogger: (name: string, bindings?: Record<string, unknown>) => Logger;
    generateDefinitionHash: (definition: ResourceExport, behavior?: BehaviorType) => string;
    getNextVersion: (versions?: StringRecord<VersionData>) => string;
    blankMetadataStructure: () => SavedMetadata;
}
export interface Plugin {
    name?: string;
    instanceName?: string;
    processManager?: ProcessManager;
    cronManager?: CronManager;
    logger?: Logger;
    setInstanceName?: (name: string) => void;
    install: (db: DatabaseRef) => Promise<void>;
    start: () => Promise<void>;
    stop?: () => Promise<void>;
    uninstall?: (options?: {
        purgeData?: boolean;
    }) => Promise<void>;
    removeAllListeners?: () => void;
}
export type PluginConstructor = (new (db: DatabaseRef) => Plugin) | Plugin;
//# sourceMappingURL=types.d.ts.map