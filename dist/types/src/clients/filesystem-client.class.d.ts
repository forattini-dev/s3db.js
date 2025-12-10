import EventEmitter from 'events';
import { FileSystemStorage } from './filesystem-storage.class.js';
import type { FileSystemClientConfig, ClientConfig, QueueStats, PutObjectParams, CopyObjectParams, ListObjectsParams, GetKeysPageParams, S3Object, PutObjectResponse, CopyObjectResponse, DeleteObjectResponse, DeleteObjectsResponse, ListObjectsResponse, FileSystemStorageStats } from './types.js';
interface CommandInput {
    Key?: string;
    Prefix?: string;
    Metadata?: Record<string, unknown>;
    ContentType?: string;
    Body?: unknown;
    ContentEncoding?: string;
    ContentLength?: number;
    IfMatch?: string;
    IfNoneMatch?: string;
    CopySource?: string;
    MetadataDirective?: 'COPY' | 'REPLACE';
    Delimiter?: string | null;
    MaxKeys?: number;
    ContinuationToken?: string | null;
    StartAfter?: string | null;
    Delete?: {
        Objects?: Array<{
            Key: string;
        }>;
    };
}
interface Command {
    constructor: {
        name: string;
    };
    input?: CommandInput;
}
export declare class FileSystemClient extends EventEmitter {
    id: string;
    logLevel: string;
    private logger;
    private taskExecutorMonitoring;
    private taskManager;
    storage: FileSystemStorage;
    private basePath;
    bucket: string;
    private keyPrefix;
    private region;
    private _keyPrefixForStrip;
    connectionString: string;
    config: ClientConfig;
    constructor(config?: FileSystemClientConfig);
    getQueueStats(): QueueStats | null;
    getAggregateMetrics(since?: number): unknown | null;
    sendCommand(command: Command): Promise<unknown>;
    private _handlePutObject;
    private _handleGetObject;
    private _handleHeadObject;
    private _handleCopyObject;
    private _handleDeleteObject;
    private _handleDeleteObjects;
    private _handleListObjects;
    putObject(params: PutObjectParams): Promise<PutObjectResponse>;
    getObject(key: string): Promise<S3Object>;
    headObject(key: string): Promise<S3Object>;
    copyObject(params: CopyObjectParams): Promise<CopyObjectResponse>;
    exists(key: string): Promise<boolean>;
    deleteObject(key: string): Promise<DeleteObjectResponse>;
    deleteObjects(keys: string[]): Promise<DeleteObjectsResponse>;
    listObjects(params?: ListObjectsParams): Promise<ListObjectsResponse>;
    getKeysPage(params?: GetKeysPageParams): Promise<string[]>;
    getAllKeys(params?: {
        prefix?: string;
    }): Promise<string[]>;
    count(params?: {
        prefix?: string;
    }): Promise<number>;
    deleteAll(params?: {
        prefix?: string;
    }): Promise<number>;
    getContinuationTokenAfterOffset(params?: {
        prefix?: string;
        offset?: number;
    }): Promise<string | null>;
    moveObject(params: {
        from: string;
        to: string;
    }): Promise<boolean>;
    moveAllObjects(params: {
        prefixFrom: string;
        prefixTo: string;
    }): Promise<Array<{
        from: string;
        to: string;
    }>>;
    clear(): Promise<void>;
    private _encodeMetadata;
    private _decodeMetadataResponse;
    private _applyKeyPrefix;
    private _stripKeyPrefix;
    private _encodeContinuationTokenKey;
    private _parseCopySource;
    private _normalizeListResponse;
    getStats(): FileSystemStorageStats | null;
    destroy(): void;
    static clearPathStorage(basePath: string): void;
    static clearAllStorage(): void;
}
export default FileSystemClient;
//# sourceMappingURL=filesystem-client.class.d.ts.map