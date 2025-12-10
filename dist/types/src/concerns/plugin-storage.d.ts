import { LockHandle, AcquireOptions } from './distributed-lock.js';
export type PluginBehavior = 'body-overflow' | 'body-only' | 'enforce-limits';
export interface PluginStorageSetOptions {
    ttl?: number;
    behavior?: PluginBehavior;
    contentType?: string;
    ifMatch?: string;
    ifNoneMatch?: string;
}
export interface PluginStorageListOptions {
    limit?: number;
}
export interface BatchSetItem {
    key: string;
    data: Record<string, unknown>;
    options?: PluginStorageSetOptions;
}
export interface BatchSetResult {
    ok: boolean;
    key: string;
    error?: Error;
}
export interface BatchGetResult {
    key: string;
    ok: boolean;
    data?: Record<string, unknown> | null;
    error?: Error;
}
export interface SequenceOptions {
    resourceName?: string | null;
    initialValue?: number;
    increment?: number;
    lockTimeout?: number;
    lockTTL?: number;
}
export interface ResetSequenceOptions {
    resourceName?: string | null;
    lockTimeout?: number;
    lockTTL?: number;
}
export interface ListSequenceOptions {
    resourceName?: string | null;
}
export interface PluginSequenceInfo {
    name: string;
    value: number;
    resourceName?: string | null;
    createdAt: number;
    updatedAt?: number;
    resetAt?: number;
}
export interface BehaviorResult {
    metadata: Record<string, unknown>;
    body: Record<string, unknown> | null;
}
export interface PluginClient {
    config: {
        keyPrefix?: string;
    };
    getObject(key: string): Promise<GetObjectResponse>;
    putObject(params: PutObjectParams): Promise<PutObjectResponse>;
    deleteObject(key: string): Promise<void>;
    headObject(key: string): Promise<HeadObjectResponse>;
    copyObject(params: CopyObjectParams): Promise<CopyObjectResponse>;
    listObjects(params: ListObjectsParams): Promise<ListObjectsResponse>;
    getAllKeys(params: Record<string, unknown>): Promise<string[]>;
}
interface GetObjectResponse {
    Body?: {
        transformToString(): Promise<string>;
    };
    Metadata?: Record<string, string>;
    ContentType?: string;
}
interface HeadObjectResponse {
    Metadata?: Record<string, string>;
    ContentType?: string;
}
interface PutObjectParams {
    key: string;
    metadata?: Record<string, unknown>;
    body?: string;
    contentType?: string;
    ifMatch?: string;
    ifNoneMatch?: string;
}
interface PutObjectResponse {
    ETag?: string;
}
interface CopyObjectParams {
    from: string;
    to: string;
    metadata?: Record<string, string>;
    metadataDirective?: string;
    contentType?: string;
}
interface CopyObjectResponse {
    ETag?: string;
}
interface ListObjectsParams {
    prefix: string;
    maxKeys?: number;
}
interface ListObjectsResponse {
    Contents?: Array<{
        Key: string;
    }>;
}
export declare class PluginStorage {
    client: PluginClient;
    pluginSlug: string;
    private _lock;
    private _sequence;
    constructor(client: PluginClient, pluginSlug: string);
    getPluginKey(resourceName: string | null, ...parts: string[]): string;
    getSequenceKey(resourceName: string | null, sequenceName: string, suffix: string): string;
    set(key: string, data: Record<string, unknown>, options?: PluginStorageSetOptions): Promise<PutObjectResponse>;
    batchSet(items: BatchSetItem[]): Promise<BatchSetResult[]>;
    get(key: string): Promise<Record<string, unknown> | null>;
    private _parseMetadataValues;
    list(prefix?: string, options?: PluginStorageListOptions): Promise<string[]>;
    listForResource(resourceName: string, subPrefix?: string, options?: PluginStorageListOptions): Promise<string[]>;
    listWithPrefix(prefix?: string, options?: PluginStorageListOptions): Promise<Record<string, unknown>[]>;
    protected _removeKeyPrefix(keys: string[]): string[];
    has(key: string): Promise<boolean>;
    isExpired(key: string): Promise<boolean>;
    getTTL(key: string): Promise<number | null>;
    touch(key: string, additionalSeconds: number): Promise<boolean>;
    delete(key: string): Promise<void>;
    deleteAll(resourceName?: string | null): Promise<number>;
    batchPut(items: BatchSetItem[]): Promise<BatchSetResult[]>;
    batchGet(keys: string[]): Promise<BatchGetResult[]>;
    acquireLock(lockName: string, options?: AcquireOptions): Promise<LockHandle | null>;
    releaseLock(lock: LockHandle | string, token?: string): Promise<void>;
    withLock<T>(lockName: string, options: AcquireOptions, callback: (lock: LockHandle) => Promise<T>): Promise<T | null>;
    isLocked(lockName: string): Promise<boolean>;
    increment(key: string, amount?: number, options?: PluginStorageSetOptions): Promise<number>;
    decrement(key: string, amount?: number, options?: PluginStorageSetOptions): Promise<number>;
    nextSequence(name: string, options?: SequenceOptions): Promise<number>;
    private _withSequenceLock;
    getSequence(name: string, options?: {
        resourceName?: string | null;
    }): Promise<number | null>;
    resetSequence(name: string, value: number, options?: ResetSequenceOptions): Promise<boolean>;
    deleteSequence(name: string, options?: {
        resourceName?: string | null;
    }): Promise<void>;
    listSequences(options?: ListSequenceOptions): Promise<PluginSequenceInfo[]>;
    _applyBehavior(data: Record<string, unknown>, behavior: PluginBehavior): BehaviorResult;
}
export default PluginStorage;
//# sourceMappingURL=plugin-storage.d.ts.map