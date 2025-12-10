import { Cache, type CacheConfig } from "./cache.class.js";
export interface RedisCacheConfig extends CacheConfig {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    ttl?: number;
    enableCompression?: boolean;
    compressionThreshold?: number;
    connectTimeout?: number;
    commandTimeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
    lazyConnect?: boolean;
    keepAlive?: boolean;
    keepAliveInitialDelay?: number;
    retryStrategy?: (times: number) => number | null;
    enableStats?: boolean;
    redisOptions?: Record<string, unknown>;
}
export interface RedisCacheStats {
    hits: number;
    misses: number;
    errors: number;
    sets: number;
    deletes: number;
    enabled: boolean;
}
interface RedisClient {
    connect(): Promise<void>;
    quit(): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    setex(key: string, seconds: number, value: string): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    scan(cursor: string, match: string, pattern: string, count: string, num: number): Promise<[string, string[]]>;
    on(event: string, callback: (...args: unknown[]) => void): void;
}
interface Logger {
    error(message: string, ...args: unknown[]): void;
}
export declare class RedisCache extends Cache {
    config: RedisCacheConfig & {
        host: string;
        port: number;
        db: number;
        keyPrefix: string;
        connectTimeout: number;
        commandTimeout: number;
        retryAttempts: number;
        retryDelay: number;
        lazyConnect: boolean;
        keepAlive: boolean;
        keepAliveInitialDelay: number;
        enableStats: boolean;
    };
    ttlMs: number;
    ttlSeconds: number;
    stats: RedisCacheStats;
    client: RedisClient | null;
    connected: boolean;
    connecting: boolean;
    connectionCheckJobName: string | null;
    logger: Logger;
    constructor({ host, port, password, db, keyPrefix, ttl, enableCompression, compressionThreshold, connectTimeout, commandTimeout, retryAttempts, retryDelay, lazyConnect, keepAlive, keepAliveInitialDelay, retryStrategy, enableStats, ...redisOptions }: RedisCacheConfig);
    private _ensureConnection;
    private _getKey;
    private _compressData;
    private _decompressData;
    protected _set(key: string, data: unknown): Promise<unknown>;
    protected _get(key: string): Promise<unknown>;
    protected _del(key: string): Promise<unknown>;
    protected _clear(prefix?: string): Promise<unknown>;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    getStats(): RedisCacheStats & {
        total?: number;
        hitRate?: number;
        hitRatePercent?: string;
        message?: string;
    };
    disconnect(): Promise<void>;
}
export default RedisCache;
//# sourceMappingURL=redis-cache.class.d.ts.map