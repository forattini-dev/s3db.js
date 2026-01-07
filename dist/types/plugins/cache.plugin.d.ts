import { Plugin, ResourceLike } from './plugin.class.js';
import { resolveCacheMemoryLimit, type MemoryLimitResult } from './cache/utils/memory-limits.js';
export { resolveCacheMemoryLimit, type MemoryLimitResult };
import { type S3DBLogger } from '../concerns/logger.js';
interface Resource {
    name: string;
    $schema: ResourceSchema;
    useMiddleware(method: string, handler: MiddlewareHandler): void;
    get(id: string, options?: Record<string, unknown>): Promise<unknown>;
    getMany(ids: string[], options?: Record<string, unknown>): Promise<unknown[]>;
    list(options?: Record<string, unknown>): Promise<unknown[]>;
    page(options?: Record<string, unknown>): Promise<PageResult | unknown[]>;
    count(options?: Record<string, unknown>): Promise<number>;
    query(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown[]>;
    cacheInstances?: Record<string, CacheDriver>;
    cacheNamespaces?: Record<string, CacheNamespace>;
    cache?: CacheNamespace;
    cacheKeyResolvers?: Record<string, CacheKeyResolver>;
    cacheKeyFor?: CacheKeyResolver;
    getCacheDriver?: (name?: string | null) => CacheDriver | null;
    getCacheNamespace?: (name?: string | null) => CacheNamespace | null;
    getCacheKeyResolver?: (name?: string | null) => CacheKeyResolver | null;
    clearPartitionCache?: (partition: string, partitionValues?: Record<string, unknown>) => Promise<void>;
    getPartitionCacheStats?: (partition?: string | null) => Promise<Record<string, unknown>>;
    getCacheRecommendations?: () => Promise<CacheRecommendation[]>;
    warmPartitionCache?: (partitions: string[], options?: Record<string, unknown>) => Promise<WarmResult>;
}
interface ResourceSchema {
    partitions?: Record<string, PartitionDefinition>;
    createdBy?: string;
}
interface PartitionDefinition {
    fields?: string[];
    [key: string]: unknown;
}
interface PageResult {
    items: unknown[];
    total?: number;
}
type MiddlewareHandler = (ctx: MiddlewareContext, next: () => Promise<unknown>) => Promise<unknown>;
interface MiddlewareContext {
    args: unknown[];
}
type CacheKeyResolver = (options?: CacheKeyOptions) => Promise<string>;
interface CacheKeyOptions {
    action?: string;
    params?: Record<string, unknown>;
    partition?: string | null;
    partitionValues?: Record<string, unknown> | null;
}
interface CacheDriver {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    clear(keyPrefix?: string): Promise<void>;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    stats?(): CacheDriverStats;
    getStats?(): CacheDriverStats;
    shutdown?(): Promise<void>;
    on?(event: string, handler: (payload: unknown) => void): void;
    _get?(key: string, options: Record<string, unknown>): Promise<unknown>;
    _set?(key: string, value: unknown, options: Record<string, unknown>): Promise<void>;
    getPartitionStats?(resourceName: string, partition?: string | null): Promise<Record<string, unknown>>;
    getCacheRecommendations?(resourceName: string): Promise<CacheRecommendation[]>;
    warmPartitionCache?(resourceName: string, options: Record<string, unknown>): Promise<WarmResult>;
    clearPartition?(resourceName: string, partition: string, partitionValues?: Record<string, unknown>): Promise<void>;
}
interface CacheDriverStats {
    size?: number;
    hits?: number;
    misses?: number;
    [key: string]: unknown;
}
interface CacheRecommendation {
    recommendation: string;
    priority: number;
    partition?: string;
    [key: string]: unknown;
}
interface WarmResult {
    resourceName: string;
    recordsSampled?: number;
    partitionsWarmed?: number;
    [key: string]: unknown;
}
interface CacheNamespace {
    driver: CacheDriver;
    instanceKey: string;
    driverName: string;
    keyFor(action: string, options?: CacheKeyOptions): Promise<string>;
    resolve(action: string, options?: CacheKeyOptions): Promise<string>;
    getDriver(): CacheDriver;
    warm(options?: Record<string, unknown>): Promise<WarmResult>;
    warmItem(id: string, control?: WarmControl): Promise<unknown>;
    warmMany(ids: string[], control?: WarmControl): Promise<unknown>;
    warmList(listOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
    warmPage(pageOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
    warmQuery(filter?: Record<string, unknown>, queryOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
    warmCount(countOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
    warmPartition(partitions?: string[], options?: Record<string, unknown>): Promise<WarmResult>;
    invalidate(scope?: unknown): Promise<void>;
    clearAll(): Promise<void>;
    stats(): CacheDriverStats;
}
interface WarmControl {
    forceRefresh?: boolean;
    returnData?: boolean;
}
export interface CachePluginOptions {
    driver?: string | CacheDriver;
    drivers?: DriverConfig[];
    promoteOnHit?: boolean;
    strategy?: 'write-through' | 'write-behind' | 'cache-aside';
    fallbackOnError?: boolean;
    ttl?: number;
    maxSize?: number;
    maxMemoryBytes?: number;
    maxMemoryPercent?: number;
    config?: DriverSpecificConfig;
    include?: string[] | null;
    exclude?: string[];
    includePartitions?: boolean;
    partitionStrategy?: string;
    partitionAware?: boolean;
    trackUsage?: boolean;
    preloadRelated?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
    verbose?: boolean;
    logger?: S3DBLogger;
    logLevel?: string;
    instanceName?: string;
    slug?: string;
    [key: string]: unknown;
}
interface DriverConfig {
    driver: string;
    name?: string;
    config?: DriverSpecificConfig;
}
interface DriverSpecificConfig {
    ttl?: number;
    maxSize?: number;
    maxMemoryBytes?: number;
    maxMemoryPercent?: number;
    enableCompression?: boolean;
    compressionThreshold?: number;
    inferredMaxMemoryPercent?: number;
    [key: string]: unknown;
}
interface CacheConfig {
    driver: string | CacheDriver;
    drivers?: DriverConfig[];
    isMultiTier: boolean;
    promoteOnHit: boolean;
    strategy: string;
    fallbackOnError: boolean;
    config: DriverSpecificConfig;
    include: string[] | null;
    exclude: string[];
    includePartitions: boolean;
    partitionStrategy: string;
    partitionAware: boolean;
    trackUsage: boolean;
    preloadRelated: boolean;
    retryAttempts: number;
    retryDelay: number;
    logLevel?: string;
}
interface CacheStats {
    hits: number;
    misses: number;
    writes: number;
    deletes: number;
    errors: number;
    startTime: number;
}
interface CacheStatsResult {
    hits: number;
    misses: number;
    writes: number;
    deletes: number;
    errors: number;
    total: number;
    hitRate: string;
    missRate: string;
    hitRateDecimal: number;
    missRateDecimal: number;
    uptime: number;
    uptimeFormatted: string;
    startTime: string;
    hitsPerSecond: string | number;
    missesPerSecond: string | number;
    writesPerSecond: string | number;
}
interface CacheAnalysis {
    message?: string;
    totalResources?: number;
    resourceStats?: Record<string, unknown>;
    recommendations?: Record<string, CacheRecommendation[]>;
    summary?: {
        mostUsedPartitions: CacheRecommendation[];
        leastUsedPartitions: CacheRecommendation[];
        suggestedOptimizations: string[];
    };
}
export declare class CachePlugin extends Plugin {
    namespace: string;
    logLevel: string;
    instanceName: string | null;
    slug: string;
    config: CacheConfig;
    driver: CacheDriver | null;
    stats: CacheStats;
    constructor(options?: CachePluginOptions);
    onInstall(): Promise<void>;
    installDatabaseHooks(): void;
    createResourceCacheNamespace(resource: Resource, driver: CacheDriver, computeCacheKey: CacheKeyResolver, instanceKey: string): CacheNamespace;
    onStart(): Promise<void>;
    private _createSingleDriver;
    private _createMultiTierDriver;
    installResourceHooks(): void;
    shouldCacheResource(resourceName: string): boolean;
    installResourceHooksForResource(resource: Resource): void;
    clearCacheForResource(resource: Resource, data?: Record<string, unknown>): Promise<void>;
    clearCacheWithRetry(cache: CacheDriver, key: string): Promise<[boolean, Error | null]>;
    private _getDriverForResource;
    generateCacheKey(resource: Resource, action: string, params?: Record<string, unknown>, partition?: string | null, partitionValues?: Record<string, unknown> | null): Promise<string>;
    hashParams(params: Record<string, unknown>): string;
    getPartitionValues(data: Record<string, unknown>, resource: ResourceLike): Record<string, Record<string, unknown>>;
    getCacheStats(): Promise<{
        size: number;
        keys: string[];
        driver: string;
        stats: CacheDriverStats | null;
    } | null>;
    clearAllCache(): Promise<void>;
    warmCache(resourceName: string, options?: Record<string, unknown>): Promise<WarmResult>;
    analyzeCacheUsage(): Promise<CacheAnalysis>;
    getStats(): CacheStatsResult;
    resetStats(): void;
    private _formatUptime;
    onStop(): Promise<void>;
}
//# sourceMappingURL=cache.plugin.d.ts.map