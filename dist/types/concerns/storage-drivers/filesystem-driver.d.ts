export interface FilesystemStorageConfig {
    basePath: string;
}
export interface SetOptions {
    ttl?: number;
    metadata?: Record<string, unknown>;
}
export interface ListOptions {
    prefix?: string;
    limit?: number;
}
export interface StorageMetadata {
    createdAt: string;
    pluginSlug: string;
    ttl?: number;
    expiresAt?: string;
    [key: string]: unknown;
}
export interface StorageObject {
    key: string;
    data: Record<string, unknown>;
    metadata: StorageMetadata;
}
export interface SetResult {
    ETag: string;
}
export declare class FilesystemStorageDriver {
    basePath: string;
    pluginSlug: string;
    constructor(config: FilesystemStorageConfig, pluginSlug: string);
    private _keyToPath;
    set(key: string, data: Record<string, unknown>, options?: SetOptions): Promise<SetResult>;
    get(key: string): Promise<Record<string, unknown> | null>;
    delete(key: string): Promise<boolean>;
    list(options?: ListOptions): Promise<string[]>;
    deleteAll(): Promise<number>;
}
//# sourceMappingURL=filesystem-driver.d.ts.map