import { CoordinatorPlugin } from "./concerns/coordinator-plugin.class.js";
import type { Database } from "../database.class.js";
import type { Resource } from "../resource.class.js";
export type TTLGranularity = 'minute' | 'hour' | 'day' | 'week';
export type TTLExpireStrategy = 'soft-delete' | 'hard-delete' | 'archive' | 'callback';
export interface TTLResourceConfig {
    ttl?: number;
    field?: string;
    onExpire: TTLExpireStrategy;
    deleteField?: string;
    archiveResource?: string;
    keepOriginalId?: boolean;
    callback?: (record: Record<string, unknown>, resource: Resource) => Promise<boolean>;
    granularity?: TTLGranularity;
}
export interface TTLPluginOptions {
    resources?: Record<string, TTLResourceConfig>;
    batchSize?: number;
    schedules?: Partial<Record<TTLGranularity, string>>;
    resourceFilter?: (resourceName: string) => boolean;
    resourceAllowlist?: string[];
    resourceBlocklist?: string[];
    resourceNames?: {
        index?: string;
    };
    indexResourceName?: string;
    logLevel?: string;
    namespace?: string;
    [key: string]: unknown;
}
export interface TTLStats {
    totalScans: number;
    totalExpired: number;
    totalDeleted: number;
    totalArchived: number;
    totalSoftDeleted: number;
    totalCallbacks: number;
    totalErrors: number;
    lastScanAt: string | null;
    lastScanDuration: number;
}
export declare class TTLPlugin extends CoordinatorPlugin {
    config: TTLPluginOptions & {
        logLevel?: string;
    };
    resources: Record<string, TTLResourceConfig>;
    resourceFilter: (resourceName: string) => boolean;
    batchSize: number;
    schedules: Partial<Record<TTLGranularity, string>>;
    stats: TTLStats;
    isRunning: boolean;
    expirationIndex: Resource | null;
    indexResourceName: string;
    private _indexResourceDescriptor;
    constructor(options?: TTLPluginOptions);
    private _buildResourceFilter;
    install(database: Database): Promise<void>;
    private _resolveIndexResourceName;
    onNamespaceChanged(): void;
    private _validateResourceConfig;
    private _createExpirationIndex;
    private _setupResourceHooks;
    private _addToIndex;
    private _removeFromIndex;
    onBecomeCoordinator(): Promise<void>;
    onStopBeingCoordinator(): Promise<void>;
    coordinatorWork(): Promise<void>;
    private _startIntervals;
    private _cleanupGranularity;
    private _processExpiredEntry;
    private _softDelete;
    private _hardDelete;
    private _archive;
    cleanupResource(resourceName: string): Promise<{
        resource: string;
        granularity: TTLGranularity;
    }>;
    runCleanup(): Promise<void>;
    getStats(): TTLStats & {
        resources: number;
        isRunning: boolean;
        cronJobs: number;
    };
    onStop(): Promise<void>;
    uninstall(): Promise<void>;
}
//# sourceMappingURL=ttl.plugin.d.ts.map