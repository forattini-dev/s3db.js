import { PluginStorage, type PluginClient } from "../../concerns/plugin-storage.js";
import { Cache, type CacheConfig } from "./cache.class.js";
export interface S3CacheConfig extends CacheConfig {
    client: unknown;
    keyPrefix?: string;
    ttl?: number;
    prefix?: string;
    enableCompression?: boolean;
    compressionThreshold?: number;
}
export declare class S3Cache extends Cache {
    config: S3CacheConfig;
    client: PluginClient;
    keyPrefix: string;
    ttlMs: number;
    ttlSeconds: number;
    storage: PluginStorage;
    constructor({ client, keyPrefix, ttl, prefix, enableCompression, compressionThreshold }: S3CacheConfig);
    private _compressData;
    private _decompressData;
    protected _set(key: string, data: unknown): Promise<void>;
    protected _get(key: string): Promise<unknown>;
    protected _del(key: string): Promise<unknown>;
    protected _clear(prefix?: string): Promise<unknown>;
    size(): Promise<number>;
    keys(): Promise<string[]>;
}
export default S3Cache;
//# sourceMappingURL=s3-cache.class.d.ts.map