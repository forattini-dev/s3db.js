import { Cache, type CacheConfig } from "./cache.class.js";
import { type Logger } from '../../concerns/logger.js';
export interface CacheDriver {
    get<T>(key: string): Promise<T | null | undefined>;
    set<T>(key: string, data: T): Promise<T>;
    del(key: string): Promise<unknown>;
    clear(prefix?: string): Promise<unknown>;
    size?(): Promise<number>;
    keys?(): Promise<string[]>;
}
export interface DriverConfig {
    driver: CacheDriver;
    name?: string;
}
export interface TierInfo {
    instance: CacheDriver;
    name: string;
    tier: number;
}
export interface MultiTierCacheConfig extends CacheConfig {
    drivers?: DriverConfig[];
    promoteOnHit?: boolean;
    strategy?: 'write-through' | 'lazy-promotion';
    fallbackOnError?: boolean;
    logLevel?: string;
}
export interface TierStats {
    name: string;
    tier: number;
    hits: number;
    misses: number;
    errors: number;
    sets: number;
    promotions: number;
    hitRate?: number;
    hitRatePercent?: string;
}
export interface MultiTierCacheStats {
    hits: number;
    misses: number;
    writes: number;
    deletes: number;
    errors: number;
    tiers: TierStats[];
}
export interface MultiTierCacheStatsResult {
    enabled: boolean;
    strategy: string;
    promoteOnHit: boolean;
    tiers: TierStats[];
    totals: {
        hits: number;
        misses: number;
        promotions: number;
        errors: number;
        sets: number;
        total: number;
        hitRate: number;
        hitRatePercent: string;
    };
}
export declare class MultiTierCache extends Cache {
    config: MultiTierCacheConfig & {
        promoteOnHit: boolean;
        strategy: string;
        fallbackOnError: boolean;
        logLevel: string;
    };
    drivers: TierInfo[];
    stats: MultiTierCacheStats;
    logger: Logger;
    constructor({ drivers, promoteOnHit, strategy, fallbackOnError, logLevel }: MultiTierCacheConfig);
    private _log;
    protected _get(key: string): Promise<unknown>;
    private _promoteToFasterTiers;
    protected _set(key: string, data: unknown): Promise<void>;
    private _writeToAllTiers;
    private _writeToL1Only;
    protected _del(key: string): Promise<unknown>;
    protected _clear(prefix?: string): Promise<unknown>;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    getStats(): MultiTierCacheStatsResult;
}
export default MultiTierCache;
//# sourceMappingURL=multi-tier-cache.class.d.ts.map