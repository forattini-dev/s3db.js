import { Plugin } from './plugin.class.js';
import { KubernetesDriver } from './kubernetes-inventory/k8s-driver.js';
interface Logger {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface ClusterDefinition {
    id: string;
    name?: string;
    discovery?: Partial<DiscoveryConfig>;
    scheduled?: ScheduleInput;
    tags?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}
interface DiscoveryConfig {
    concurrency: number;
    select: FilterType | null;
    ignore: FilterType[];
    runOnInstall: boolean;
    dryRun: boolean;
}
type FilterType = string | string[] | ((resource: K8sResource) => boolean);
interface Schedule {
    enabled: boolean;
    cron: string | null;
    timezone?: string;
    runOnStart: boolean;
}
interface ScheduleInput {
    enabled?: boolean;
    cron?: string;
    timezone?: string;
    runOnStart?: boolean;
}
interface LockConfig {
    ttl: number;
    timeout: number;
}
interface ResourceNamesConfig {
    snapshots?: string;
    versions?: string;
    changes?: string;
    clusters?: string;
}
interface KubernetesInventoryConfig {
    clusters: ClusterDefinition[];
    discovery: DiscoveryConfig;
    resourceNames: Record<string, string>;
    logger: LogFunction | null;
    logLevel?: string;
    scheduled: Schedule;
    lock: LockConfig;
    [key: string]: unknown;
}
type LogFunction = (level: string, message: string, meta?: Record<string, unknown>) => void;
interface K8sResource {
    clusterId: string;
    namespace?: string;
    resourceType: string;
    resourceId: string;
    uid?: string;
    name?: string;
    apiVersion?: string;
    kind?: string;
    labels?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    configuration: Record<string, unknown>;
}
interface ClusterDriverEntry {
    driver: KubernetesDriver;
    definition: ClusterDefinition;
}
interface SyncResult {
    clusterId: string;
    success: boolean;
    duration: number;
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
}
interface SkippedSyncResult {
    clusterId: string;
    skipped: true;
    reason: string;
    lockKey: string;
}
interface SnapshotFilter {
    clusterId?: string;
    resourceType?: string;
    namespace?: string;
}
interface VersionFilter {
    clusterId?: string;
    resourceType?: string;
    resourceId?: string;
}
interface ChangeFilter {
    clusterId?: string;
    resourceType?: string;
    resourceId?: string;
    since?: string | Date;
}
export interface KubernetesInventoryPluginOptions {
    clusters?: ClusterDefinition[];
    resourceNames?: ResourceNamesConfig;
    discovery?: Partial<DiscoveryConfig>;
    logger?: Logger | LogFunction;
    scheduled?: ScheduleInput;
    lock?: Partial<LockConfig>;
    logLevel?: string;
    [key: string]: unknown;
}
export declare class KubernetesInventoryPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: KubernetesInventoryConfig;
    clusterDrivers: Map<string, ClusterDriverEntry>;
    resourceNames: Record<string, string>;
    internalResourceNames: Record<string, string>;
    private _internalResourceOverrides;
    private _internalResourceDescriptors;
    private _resourceHandles;
    private _scheduledJobs;
    private _cron;
    constructor(options?: KubernetesInventoryPluginOptions);
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(): Promise<void>;
    onNamespaceChanged(): void;
    syncAll(options?: Record<string, unknown>): Promise<Array<SyncResult | SkippedSyncResult>>;
    syncCluster(clusterId: string, options?: Record<string, unknown>): Promise<SyncResult | SkippedSyncResult>;
    discoverResourceTypes(clusterId: string, options?: Record<string, unknown>): Promise<unknown>;
    getSnapshots(filter?: SnapshotFilter): Promise<Record<string, unknown>[]>;
    getVersions(filter?: VersionFilter): Promise<Record<string, unknown>[]>;
    getChanges(filter?: ChangeFilter): Promise<Record<string, unknown>[]>;
    private _validateConfiguration;
    private _ensureResources;
    private _initializeDrivers;
    private _destroyDrivers;
    private _ensureClusterSummaryRecord;
    private _persistSnapshot;
    private _buildResourceKey;
    private _computeDigest;
    private _extractSummary;
    private _computeDiff;
    private _shouldIncludeResource;
    private _matchesFilter;
    private _matchesPattern;
    private _setupSchedules;
    private _scheduleJob;
    private _teardownSchedules;
    private _emitProgress;
    private _resolveInternalResourceNames;
    private _log;
}
export default KubernetesInventoryPlugin;
//# sourceMappingURL=kubernetes-inventory.plugin.d.ts.map