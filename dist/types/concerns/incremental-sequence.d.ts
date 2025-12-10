import { LockHandle } from './distributed-lock.js';
export type IncrementalMode = 'standard' | 'fast';
export interface IncrementalConfig {
    type: 'incremental';
    start: number;
    increment: number;
    mode: IncrementalMode;
    batchSize: number;
    prefix: string;
    padding: number;
}
export interface ParseIncrementalOptions {
    validate?: boolean;
}
export interface ValidationOptions {
    throwOnError?: boolean;
}
export interface IncrementalValidationError {
    field: string;
    message: string;
    value: unknown;
}
export interface IncrementalValidationResult {
    valid: boolean;
    errors: IncrementalValidationError[];
}
export interface BatchInfo {
    start: number;
    end: number;
    current: number;
    reservedAt: number;
}
export interface BatchStatus {
    start: number;
    end: number;
    current: number;
    remaining: number;
    reservedAt: number;
}
export interface SequenceInfo {
    value: number;
    name: string;
    createdAt: number;
    updatedAt?: number;
    resetAt?: number;
}
export interface IncrementalSequenceOptions {
    client: SequenceClient;
    resourceName: string;
    config: IncrementalConfig;
    logger?: Logger;
}
interface Logger {
    debug?: (context: Record<string, unknown>, message: string) => void;
}
interface SequenceClient {
    getObject(key: string): Promise<GetObjectResponse>;
    putObject(params: PutObjectParams): Promise<PutObjectResponse>;
    deleteObject(key: string): Promise<void>;
    listObjects(params: ListObjectsParams): Promise<ListObjectsResponse>;
}
interface GetObjectResponse {
    Body?: {
        transformToString(): Promise<string>;
    };
}
interface PutObjectParams {
    key: string;
    body: string;
    contentType: string;
    ifNoneMatch?: string;
}
interface PutObjectResponse {
    ETag?: string;
}
interface ListObjectsParams {
    prefix: string;
}
interface ListObjectsResponse {
    Contents?: Array<{
        Key: string;
    }>;
}
interface SetOptions {
    ttl?: number;
    ifNoneMatch?: string;
}
export declare class IncrementalConfigError extends Error {
    field: string;
    value: unknown;
    constructor(message: string, field: string, value: unknown);
}
export declare function validateIncrementalConfig(config: Partial<IncrementalConfig>, options?: ValidationOptions): IncrementalValidationResult;
export declare function parseIncrementalConfig(config: string | Partial<IncrementalConfig>, options?: ParseIncrementalOptions): IncrementalConfig;
export declare function formatIncrementalValue(value: number, options?: {
    prefix?: string;
    padding?: number;
}): string;
declare class SequenceStorage {
    client: SequenceClient;
    resourceName: string;
    private _lock;
    constructor(client: SequenceClient, resourceName: string);
    getKey(fieldName: string, suffix: string): string;
    getLockKey(fieldName: string): string;
    getValueKey(fieldName: string): string;
    get(key: string): Promise<SequenceInfo | null>;
    set(key: string, data: SequenceInfo, options?: SetOptions): Promise<PutObjectResponse>;
    delete(key: string): Promise<void>;
    acquireLock(fieldName: string, options?: {}): Promise<LockHandle | null>;
    releaseLock(lock: LockHandle): Promise<void>;
    withLock<T>(fieldName: string, options: Record<string, unknown>, callback: (lock: LockHandle) => Promise<T>): Promise<T | null>;
    nextSequence(fieldName: string, options?: {
        initialValue?: number;
        increment?: number;
        lockTimeout?: number;
        lockTTL?: number;
    }): Promise<number>;
    getSequence(fieldName: string): Promise<number | null>;
    resetSequence(fieldName: string, value: number, options?: {
        lockTimeout?: number;
        lockTTL?: number;
    }): Promise<boolean>;
    listSequences(): Promise<SequenceInfo[]>;
}
export declare class IncrementalSequence {
    client: SequenceClient;
    resourceName: string;
    config: IncrementalConfig;
    logger: Logger;
    storage: SequenceStorage;
    localBatches: Map<string, BatchInfo>;
    constructor(options: IncrementalSequenceOptions);
    nextValue(fieldName?: string): Promise<string>;
    nextValueFast(fieldName?: string): Promise<string>;
    reserveBatch(fieldName?: string, count?: number): Promise<BatchInfo>;
    next(fieldName?: string): Promise<string>;
    getValue(fieldName?: string): Promise<number | null>;
    reset(fieldName: string, value: number): Promise<boolean>;
    list(): Promise<SequenceInfo[]>;
    getBatchStatus(fieldName?: string): BatchStatus | null;
    releaseBatch(fieldName?: string): void;
}
export interface CreateIncrementalIdGeneratorOptions {
    client: SequenceClient;
    resourceName: string;
    config: string | Partial<IncrementalConfig>;
    logger?: Logger;
}
export interface IncrementalIdGenerator {
    (): Promise<string>;
    _sequence: IncrementalSequence;
    _config: IncrementalConfig;
}
export declare function createIncrementalIdGenerator(options: CreateIncrementalIdGeneratorOptions): IncrementalIdGenerator;
declare const _default: {
    parseIncrementalConfig: typeof parseIncrementalConfig;
    validateIncrementalConfig: typeof validateIncrementalConfig;
    formatIncrementalValue: typeof formatIncrementalValue;
    IncrementalSequence: typeof IncrementalSequence;
    IncrementalConfigError: typeof IncrementalConfigError;
    createIncrementalIdGenerator: typeof createIncrementalIdGenerator;
};
export default _default;
//# sourceMappingURL=incremental-sequence.d.ts.map