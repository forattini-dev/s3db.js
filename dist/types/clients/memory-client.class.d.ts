import EventEmitter from 'events';
import { MemoryStorage } from './memory-storage.class.js';
import type { MemoryClientConfig, ClientConfig, QueueStats, PutObjectParams, CopyObjectParams, ListObjectsParams, GetKeysPageParams, S3Object, PutObjectResponse, CopyObjectResponse, DeleteObjectResponse, DeleteObjectsResponse, ListObjectsResponse, StorageSnapshot } from './types.js';
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
export declare class MemoryClient extends EventEmitter {
    id: string;
    logLevel: string;
    private logger;
    private taskExecutorMonitoring;
    private taskManager;
    storage: MemoryStorage;
    bucket: string;
    private keyPrefix;
    private region;
    private _keyPrefixForStrip;
    connectionString: string;
    config: ClientConfig;
    constructor(config?: MemoryClientConfig);
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
    snapshot(): StorageSnapshot;
    restore(snapshot: StorageSnapshot): void;
    clear(): Promise<void>;
    getStats(): ReturnType<MemoryStorage['getStats']>;
    destroy(): void;
    private _encodeMetadata;
    private _decodeMetadataResponse;
    private _applyKeyPrefix;
    private _stripKeyPrefix;
    private _encodeContinuationTokenKey;
    private _parseCopySource;
    private _normalizeListResponse;
    static clearBucketStorage(bucket: string): void;
    static clearAllStorage(): void;
}
export default MemoryClient;
//# sourceMappingURL=memory-client.class.d.ts.map