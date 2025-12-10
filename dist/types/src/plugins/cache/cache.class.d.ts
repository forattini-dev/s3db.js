import EventEmitter from 'events';
export interface CacheConfig {
    [key: string]: unknown;
}
export interface CacheStats {
    enabled?: boolean;
    hits?: number;
    misses?: number;
    sets?: number;
    deletes?: number;
    evictions?: number;
    hitRate?: number;
    [key: string]: unknown;
}
export declare class Cache extends EventEmitter {
    config: CacheConfig;
    protected _fallbackStore: Map<string, unknown>;
    constructor(config?: CacheConfig);
    protected _set(_key: string, _data: unknown): Promise<unknown>;
    protected _get(_key: string): Promise<unknown>;
    protected _del(_key: string): Promise<unknown>;
    protected _clear(_prefix?: string): Promise<unknown>;
    validateKey(key: string): void;
    set<T>(key: string, data: T): Promise<T>;
    get<T>(key: string): Promise<T | undefined>;
    del(key: string): Promise<unknown>;
    delete(key: string): Promise<unknown>;
    clear(prefix?: string): Promise<unknown>;
}
export default Cache;
//# sourceMappingURL=cache.class.d.ts.map