import { Cache, type CacheConfig, type CacheStats } from './cache.class.js';
import { type Logger } from '../../concerns/logger.js';
export type EvictionPolicy = 'lru' | 'fifo';
export interface MemoryCacheConfig extends CacheConfig {
    maxSize?: number;
    maxMemoryBytes?: number;
    maxMemoryPercent?: number;
    ttl?: number;
    enableStats?: boolean;
    evictionPolicy?: EvictionPolicy;
    logEvictions?: boolean;
    cleanupInterval?: number;
    caseSensitive?: boolean;
    serializer?: (value: unknown) => string;
    deserializer?: (str: string) => unknown;
    enableCompression?: boolean;
    compressionThreshold?: number;
    tags?: Record<string, string>;
    persistent?: boolean;
    persistencePath?: string;
    persistenceInterval?: number;
    heapUsageThreshold?: number;
    monitorInterval?: number;
}
interface CacheMeta {
    ts: number;
    createdAt: number;
    lastAccess: number;
    insertOrder: number;
    accessOrder: number;
    compressed: boolean;
    originalSize: number;
    compressedSize: number;
    originalKey: string;
}
interface CompressedData {
    __compressed: true;
    __data: string;
    __originalSize: number;
}
interface CompressionStats {
    totalCompressed: number;
    totalOriginalSize: number;
    totalCompressedSize: number;
    compressionRatio: string;
}
export interface MemoryCacheStats extends CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    evictions: number;
    memoryUsageBytes?: number;
    maxMemoryBytes?: number;
    evictedDueToMemory?: number;
    hitRate?: number;
    monitorInterval?: number;
    heapUsageThreshold?: number;
}
export interface MemoryStats {
    currentMemoryBytes: number;
    maxMemoryBytes: number;
    maxMemoryPercent: number;
    memoryUsagePercent: number;
    cachePercentOfSystemMemory: number;
    totalItems: number;
    maxSize: number;
    evictedDueToMemory: number;
    memoryPressureEvents: number;
    averageItemSize: number;
    memoryUsage: {
        current: string;
        max: string;
        available: string;
    };
    systemMemory: {
        total: string;
        free: string;
        used: string;
        cachePercent: string;
    };
}
export interface CompressionStatsResult {
    enabled: boolean;
    message?: string;
    totalItems?: number;
    compressedItems?: number;
    compressionThreshold?: number;
    totalOriginalSize?: number;
    totalCompressedSize?: number;
    averageCompressionRatio?: string;
    spaceSavingsPercent?: string | number;
    memoryUsage?: {
        uncompressed: string;
        compressed: string;
        saved: string;
    };
}
export declare class MemoryCache extends Cache {
    config: MemoryCacheConfig;
    logger: Logger;
    caseSensitive: boolean;
    serializer: (value: unknown) => string;
    deserializer: (str: string) => unknown;
    enableStats: boolean;
    evictionPolicy: EvictionPolicy;
    cache: Record<string, string | CompressedData>;
    meta: Record<string, CacheMeta>;
    maxSize: number;
    maxMemoryBytes: number;
    maxMemoryPercent: number;
    ttl: number;
    enableCompression: boolean;
    compressionThreshold: number;
    heapUsageThreshold: number;
    monitorInterval: number;
    compressionStats: CompressionStats;
    currentMemoryBytes: number;
    evictedDueToMemory: number;
    memoryPressureEvents: number;
    private _monitorHandle;
    private _accessCounter;
    stats: MemoryCacheStats;
    constructor(config?: MemoryCacheConfig);
    private _normalizeKey;
    private _recordStat;
    private _selectEvictionCandidate;
    private _evictKey;
    private _enforceMemoryLimit;
    private _reduceMemoryTo;
    private _memoryHealthCheck;
    shutdown(): Promise<void>;
    protected _set(key: string, data: unknown): Promise<unknown>;
    protected _get(key: string): Promise<unknown>;
    protected _del(key: string): Promise<boolean>;
    protected _clear(prefix?: string): Promise<boolean>;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    getStats(): MemoryCacheStats;
    getCompressionStats(): CompressionStatsResult;
    getMemoryStats(): MemoryStats;
    private _formatBytes;
}
export default MemoryCache;
//# sourceMappingURL=memory-cache.class.d.ts.map