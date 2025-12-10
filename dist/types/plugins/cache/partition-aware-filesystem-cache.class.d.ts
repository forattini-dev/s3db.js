import { FilesystemCache, type FilesystemCacheConfig } from './filesystem-cache.class.js';
export interface PartitionAwareFilesystemCacheConfig extends FilesystemCacheConfig {
    partitionStrategy?: 'hierarchical' | 'flat' | 'temporal';
    trackUsage?: boolean;
    preloadRelated?: boolean;
    preloadThreshold?: number;
    maxCacheSize?: string | null;
    usageStatsFile?: string;
}
export interface PartitionOptions {
    resource?: string;
    action?: string;
    partition?: string;
    partitionValues?: Record<string, unknown>;
    params?: Record<string, unknown>;
}
export interface PartitionUsage {
    count: number;
    firstAccess: number;
    lastAccess: number;
}
export interface PartitionStats {
    totalFiles: number;
    totalSize: number;
    partitions: Record<string, unknown>;
    usage: Record<string, PartitionUsage>;
}
export interface CacheRecommendation {
    partition: string;
    recommendation: string;
    priority: number;
    usage: number;
    lastAccess: string;
}
export declare class PartitionAwareFilesystemCache extends FilesystemCache {
    config: PartitionAwareFilesystemCacheConfig;
    partitionStrategy: string;
    trackUsage: boolean;
    preloadRelated: boolean;
    preloadThreshold: number;
    maxCacheSize: string | null;
    usageStatsFile: string;
    partitionUsage: Map<string, PartitionUsage>;
    constructor({ partitionStrategy, trackUsage, preloadRelated, preloadThreshold, maxCacheSize, usageStatsFile, ...config }: PartitionAwareFilesystemCacheConfig);
    private _getPartitionCacheKey;
    private _getPartitionDirectory;
    protected _set(key: string, data: unknown, options?: PartitionOptions): Promise<void>;
    set<T>(resource: string, action: T, options?: PartitionOptions): Promise<T>;
    set<T>(key: string, data: T): Promise<T>;
    get<T>(resource: string, action: string, options: PartitionOptions): Promise<T | undefined>;
    get<T>(key: string): Promise<T | undefined>;
    protected _get(key: string, options?: PartitionOptions): Promise<unknown>;
    clearPartition(resource: string, partition: string, partitionValues?: Record<string, unknown>): Promise<boolean>;
    clearResourcePartitions(resource: string): Promise<boolean>;
    protected _clear(prefix?: string): Promise<unknown>;
    getPartitionStats(resource: string, partition?: string | null): Promise<PartitionStats>;
    getCacheRecommendations(resource: string): Promise<CacheRecommendation[]>;
    warmPartitionCache(resource: string, options?: {
        partitions?: string[];
        maxFiles?: number;
    }): Promise<number>;
    private _trackPartitionUsage;
    private _getUsageKey;
    private _preloadRelatedPartitions;
    private _isTemporalPartition;
    private _getTemporalDirectory;
    private _sanitizePathValue;
    private _sanitizeFileName;
    private _splitKeySegments;
    private _ensurePartitionDirectoryForKey;
    protected _getFilePath(key: string): string;
    private _calculateDirectoryStats;
    loadUsageStats(): Promise<void>;
    private _saveUsageStats;
    private _writeFileWithMetadata;
    private _readFileWithMetadata;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    private _collectKeysRecursive;
}
export default PartitionAwareFilesystemCache;
//# sourceMappingURL=partition-aware-filesystem-cache.class.d.ts.map