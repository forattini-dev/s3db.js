import { Cache, type CacheConfig } from './cache.class.js';
import { type CronManager } from '../../concerns/cron-manager.js';
export interface FilesystemCacheConfig extends CacheConfig {
    directory: string;
    prefix?: string;
    ttl?: number;
    enableCompression?: boolean;
    compressionThreshold?: number;
    createDirectory?: boolean;
    fileExtension?: string;
    enableMetadata?: boolean;
    maxFileSize?: number;
    enableStats?: boolean;
    enableCleanup?: boolean;
    cleanupInterval?: number;
    encoding?: BufferEncoding;
    fileMode?: number;
    enableBackup?: boolean;
    backupSuffix?: string;
    enableLocking?: boolean;
    lockTimeout?: number;
    enableJournal?: boolean;
    journalFile?: string;
}
export interface FilesystemCacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    clears: number;
    errors: number;
}
interface Logger {
    warn(message: string, ...args: unknown[]): void;
}
export declare class FilesystemCache extends Cache {
    config: FilesystemCacheConfig;
    directory: string;
    prefix: string;
    ttl: number;
    enableCompression: boolean;
    compressionThreshold: number;
    createDirectory: boolean;
    fileExtension: string;
    enableMetadata: boolean;
    maxFileSize: number;
    enableStats: boolean;
    enableCleanup: boolean;
    cleanupInterval: number;
    encoding: BufferEncoding;
    fileMode: number;
    enableBackup: boolean;
    backupSuffix: string;
    enableLocking: boolean;
    lockTimeout: number;
    enableJournal: boolean;
    journalFile: string;
    stats: FilesystemCacheStats;
    locks: Map<string, number>;
    cronManager: CronManager;
    cleanupJobName: string | null;
    logger: Logger;
    protected _initPromise: Promise<void>;
    protected _initError?: Error;
    constructor({ directory, prefix, ttl, enableCompression, compressionThreshold, createDirectory, fileExtension, enableMetadata, maxFileSize, enableStats, enableCleanup, cleanupInterval, encoding, fileMode, enableBackup, backupSuffix, enableLocking, lockTimeout, enableJournal, journalFile, ...config }: FilesystemCacheConfig);
    private _init;
    protected _ensureDirectory(dir: string): Promise<void>;
    protected _getFilePath(key: string): string;
    protected _getMetadataPath(filePath: string): string;
    protected _set(key: string, data: unknown): Promise<void>;
    protected _get(key: string): Promise<unknown>;
    protected _del(key: string): Promise<unknown>;
    protected _clear(prefix?: string): Promise<unknown>;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    protected _fileExists(filePath: string): Promise<boolean>;
    protected _copyFile(src: string, dest: string): Promise<void>;
    protected _cleanup(): Promise<void>;
    protected _acquireLock(filePath: string): Promise<void>;
    protected _releaseLock(filePath: string): void;
    protected _journalOperation(operation: string, key: string, metadata?: Record<string, unknown>): Promise<void>;
    destroy(): void;
    getStats(): FilesystemCacheStats & Record<string, unknown>;
}
export default FilesystemCache;
//# sourceMappingURL=filesystem-cache.class.d.ts.map