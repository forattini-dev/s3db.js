import { Plugin } from './plugin.class.js';
import { BaseCloudDriver } from './cloud-inventory/index.js';
interface CloudDefinition {
    id: string;
    driver: string | CloudDriverFactory;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    tags?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    scheduled?: ScheduleInput;
}
type CloudDriverFactory = (options: CloudDriverOptions) => BaseCloudDriver;
interface CloudDriverOptions {
    globals?: CloudInventoryConfig;
    schedule?: Schedule;
    logger?: LogFunction;
    [key: string]: unknown;
}
type LogFunction = (level: string, message: string, meta?: Record<string, unknown>) => void;
interface CloudDriver {
    initialize(): Promise<void>;
    destroy?(): Promise<void>;
    listResources(options: ListResourcesOptions): Promise<CloudResource[] | AsyncIterable<CloudResource>>;
}
interface ListResourcesOptions {
    discovery: DiscoveryConfig;
    checkpoint: unknown;
    state: unknown;
    runtime: RuntimeContext;
    [key: string]: unknown;
}
interface RuntimeContext {
    checkpoint: unknown;
    state: unknown;
    emitCheckpoint: (value: unknown) => void;
    emitRateLimit: (value: unknown) => void;
    emitState: (value: unknown) => void;
    emitProgress: (value: unknown) => void;
}
interface CloudResource {
    resourceType?: string;
    type?: string;
    resourceId?: string;
    id?: string;
    name?: string;
    displayName?: string;
    configuration?: Record<string, unknown>;
    state?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    accountId?: string;
    subscriptionId?: string;
    organizationId?: string;
    projectId?: string;
    region?: string;
    location?: string;
    service?: string;
    product?: string;
    tags?: Record<string, unknown>;
    labels?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    arn?: string;
}
interface DiscoveryConfig {
    concurrency: number;
    include: string[] | null;
    exclude: string[];
    runOnInstall: boolean;
    dryRun: boolean;
}
interface Schedule {
    enabled: boolean;
    cron: string | null;
    timezone: string | undefined;
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
interface TerraformConfig {
    enabled: boolean;
    autoExport: boolean;
    output: string | ((data: TerraformStateData) => Promise<unknown>) | null;
    outputType: 'file' | 's3' | 'custom';
    filters: TerraformFilters;
    terraformVersion: string;
    serial: number;
}
interface TerraformFilters {
    providers: string[];
    resourceTypes: string[];
    cloudId: string | null;
}
interface TerraformStateData {
    state: unknown;
    stats: TerraformExportStats;
}
interface TerraformExportStats {
    total: number;
    converted: number;
    skipped: number;
}
interface ResourceNamesConfig {
    snapshots?: string;
    versions?: string;
    changes?: string;
    clouds?: string;
}
interface CloudInventoryConfig {
    clouds: CloudDefinition[];
    discovery: DiscoveryConfig;
    resourceNames: Record<string, string>;
    logger: LogFunction | null;
    logLevel?: string;
    scheduled: Schedule;
    lock: LockConfig;
    terraform: TerraformConfig;
    [key: string]: unknown;
}
interface CloudDriverEntry {
    driver: CloudDriver;
    definition: CloudDefinition & {
        scheduled: Schedule;
    };
    summary?: Record<string, unknown>;
}
interface SyncResult {
    cloudId: string;
    driver: string;
    created: number;
    updated: number;
    unchanged: number;
    processed: number;
    durationMs: number;
}
interface SkippedSyncResult {
    cloudId: string;
    driver: string;
    skipped: true;
    reason: string;
}
export interface CloudInventoryPluginOptions {
    clouds?: CloudDefinition[];
    resourceNames?: ResourceNamesConfig;
    discovery?: Partial<DiscoveryConfig>;
    logger?: LogFunction;
    scheduled?: ScheduleInput;
    lock?: Partial<LockConfig>;
    terraform?: Partial<TerraformConfig>;
    logLevel?: string;
    [key: string]: unknown;
}
interface TerraformExportOptions {
    resourceTypes?: string[];
    providers?: string[];
    cloudId?: string | null;
    terraformVersion?: string;
    lineage?: string;
    serial?: number;
    outputs?: Record<string, unknown>;
}
export declare class CloudInventoryPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: CloudInventoryConfig;
    cloudDrivers: Map<string, CloudDriverEntry>;
    resourceNames: Record<string, string>;
    internalResourceNames: Record<string, string>;
    private _internalResourceOverrides;
    private _internalResourceDescriptors;
    private _resourceHandles;
    private _scheduledJobs;
    private _cron;
    constructor(options?: CloudInventoryPluginOptions);
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(): Promise<void>;
    onNamespaceChanged(): void;
    syncAll(options?: Record<string, unknown>): Promise<Array<SyncResult | SkippedSyncResult>>;
    syncCloud(cloudId: string, options?: Record<string, unknown>): Promise<SyncResult | SkippedSyncResult>;
    _validateConfiguration(): void;
    exportToTerraformState(options?: TerraformExportOptions): Promise<TerraformStateData>;
    exportToTerraformStateFile(filePath: string, options?: TerraformExportOptions): Promise<TerraformStateData & {
        filePath: string;
    }>;
    exportToTerraformStateToS3(bucket: string, key: string, options?: TerraformExportOptions): Promise<TerraformStateData & {
        bucket: string;
        key: string;
    }>;
    private _autoExportTerraform;
    private _ensureResources;
    private _resolveInternalResourceNames;
    private _initializeDrivers;
    private _destroyDrivers;
    private _setupSchedules;
    private _scheduleJob;
    private _teardownSchedules;
    private _normalizeResource;
    private _persistSnapshot;
    private _ensureCloudSummaryRecord;
    private _updateCloudSummary;
    private _log;
}
export default CloudInventoryPlugin;
//# sourceMappingURL=cloud-inventory.plugin.d.ts.map