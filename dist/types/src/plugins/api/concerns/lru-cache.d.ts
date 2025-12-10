export interface LRUCacheOptions {
    max?: number;
    ttl?: number;
}
export declare class LRUCache<T = unknown> {
    private max;
    private ttl;
    private cache;
    constructor(options?: LRUCacheOptions);
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    get size(): number;
}
//# sourceMappingURL=lru-cache.d.ts.map