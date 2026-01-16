import EventEmitter, { EventEmitter as EventEmitter$1 } from 'events';
import { Logger as Logger$2, TransportSingleOptions } from 'pino';
import * as FastestValidatorModule from 'fastest-validator';
import { ValidatorConstructorOptions } from 'fastest-validator';
import { Transform, TransformCallback, Writable, Readable } from 'stream';
import { ReadableStream as ReadableStream$1, ReadableStreamDefaultController, ReadableStreamDefaultReader } from 'node:stream/web';
import { S3Client as S3Client$4 } from '@aws-sdk/client-s3';

interface ValidatorCacheStats {
    size: number;
    totalReferences: number;
    zeroRefValidators: number;
    cacheHits: number;
    cacheMisses: number;
    hitRate: number;
}
interface CacheMemoryUsage {
    estimatedKB: number;
    estimatedMB: number;
    validatorCount: number;
}
declare function getCacheStats(): ValidatorCacheStats;
declare function getCacheMemoryUsage(): CacheMemoryUsage;

type AttributeValue$1 = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];
interface SchemaAttributes {
    [key: string]: AttributeValue$1 | SchemaAttributes;
}
interface AttributeMapping {
    [key: string]: string;
}
interface PluginAttributeMetadata {
    [key: string]: {
        __plugin__: string;
        [key: string]: unknown;
    };
}
interface PluginAttributes {
    [pluginName: string]: string[];
}
interface HookEntry {
    action: string;
    params: Record<string, unknown>;
}
interface SchemaHooks {
    beforeMap: Record<string, (string | HookEntry)[]>;
    afterMap: Record<string, (string | HookEntry)[]>;
    beforeUnmap: Record<string, (string | HookEntry)[]>;
    afterUnmap: Record<string, (string | HookEntry)[]>;
}
interface SchemaOptions {
    autoEncrypt?: boolean;
    autoDecrypt?: boolean;
    arraySeparator?: string;
    generateAutoHooks?: boolean;
    allNestedObjectsOptional?: boolean;
    hooks?: SchemaHooks;
}
interface SchemaConstructorArgs {
    map?: AttributeMapping;
    pluginMap?: AttributeMapping;
    name: string;
    attributes?: SchemaAttributes;
    passphrase?: string;
    bcryptRounds?: number;
    version?: number;
    options?: SchemaOptions;
    _pluginAttributeMetadata?: PluginAttributeMetadata;
    _pluginAttributes?: PluginAttributes;
    /** Existing schema registry from s3db.json - if provided, indices are preserved */
    schemaRegistry?: SchemaRegistry;
    /** Existing plugin schema registry from s3db.json (accepts both legacy numeric and new string-key formats) */
    pluginSchemaRegistry?: Record<string, PluginSchemaRegistry | SchemaRegistry>;
}
interface SchemaExport {
    version: number;
    name: string;
    options: SchemaOptions;
    attributes: SchemaAttributes;
    map: AttributeMapping;
    pluginMap: AttributeMapping;
    _pluginAttributeMetadata: PluginAttributeMetadata;
    _pluginAttributes: PluginAttributes;
}
/**
 * Schema Registry - Persistent attribute index mapping (Protocol Buffers style).
 * Prevents data corruption when adding/removing attributes by assigning
 * permanent indices that never change once assigned.
 */
interface SchemaRegistry {
    /** Next available index for new attributes */
    nextIndex: number;
    /** Permanent mapping of attribute path to numeric index */
    mapping: Record<string, number>;
    /** Indices that were used but attribute was removed - never reused */
    burned: Array<{
        index: number;
        attribute: string;
        burnedAt: string;
        reason?: string;
    }>;
}
/**
 * Plugin Schema Registry - Stores actual key strings for plugin attributes.
 * Unlike user attributes (which use numeric indices → base62), plugin attributes
 * use SHA256 hash-based keys that must be preserved exactly.
 */
interface PluginSchemaRegistry {
    /** Permanent mapping of attribute name to full key string (e.g., "_createdAt" → "p1a2") */
    mapping: Record<string, string>;
    /** Keys that were used but attribute was removed - never reused */
    burned: Array<{
        key: string;
        attribute: string;
        burnedAt: string;
        reason?: string;
    }>;
}
type ValidatorFunction = (data: Record<string, unknown>) => Promise<true | Record<string, unknown>[]> | true | Record<string, unknown>[];
declare class Schema {
    name: string;
    version: number;
    attributes: SchemaAttributes;
    passphrase: string;
    bcryptRounds: number;
    options: SchemaOptions;
    allNestedObjectsOptional: boolean;
    _pluginAttributeMetadata: PluginAttributeMetadata;
    _pluginAttributes: PluginAttributes;
    _schemaFingerprint: string;
    validator: ValidatorFunction;
    map: AttributeMapping;
    reversedMap: AttributeMapping;
    pluginMap: AttributeMapping;
    reversedPluginMap: AttributeMapping;
    /** Updated schema registry - should be persisted to s3db.json */
    _schemaRegistry?: SchemaRegistry;
    /** Updated plugin schema registries - should be persisted to s3db.json */
    _pluginSchemaRegistry?: Record<string, PluginSchemaRegistry>;
    /** Whether the registry was modified and needs persistence */
    _registryChanged: boolean;
    constructor(args: SchemaConstructorArgs);
    defaultOptions(): SchemaOptions;
    private _buildRegistryFromMap;
    /**
     * Generate initial schema registry from current mapping.
     * Used for migrating existing databases that don't have a registry yet.
     * This "freezes" the current mapping as the source of truth.
     */
    generateInitialRegistry(): {
        schemaRegistry: SchemaRegistry;
        pluginSchemaRegistry: Record<string, PluginSchemaRegistry>;
    };
    /**
     * Check if the schema registry needs to be persisted.
     */
    needsRegistryPersistence(): boolean;
    /**
     * Get the updated schema registry for persistence.
     */
    getSchemaRegistry(): SchemaRegistry | undefined;
    /**
     * Get the updated plugin schema registries for persistence.
     */
    getPluginSchemaRegistry(): Record<string, PluginSchemaRegistry> | undefined;
    addHook(hook: keyof SchemaHooks, attribute: string, action: string, params?: Record<string, unknown>): void;
    extractObjectKeys(obj: Record<string, unknown>, prefix?: string): string[];
    _generateHooksFromOriginalAttributes(attributes: Record<string, unknown>, prefix?: string): void;
    generateAutoHooks(): void;
    static import(data: string | SchemaExport): Schema;
    static _importAttributes(attrs: unknown): unknown;
    export(): SchemaExport;
    _exportAttributes(attrs: unknown): SchemaAttributes;
    applyHooksActions(resourceItem: Record<string, unknown>, hook: keyof SchemaHooks): Promise<Record<string, unknown>>;
    validate(resourceItem: Record<string, unknown>, { mutateOriginal }?: {
        mutateOriginal?: boolean | undefined;
    }): Promise<true | Record<string, unknown>[]>;
    mapper(resourceItem: Record<string, unknown>): Promise<Record<string, unknown>>;
    unmapper(mappedResourceItem: Record<string, unknown>, mapOverride?: AttributeMapping, pluginMapOverride?: AttributeMapping): Promise<Record<string, unknown>>;
    getAttributeDefinition(key: string): unknown;
    regeneratePluginMapping(): void;
    preprocessAttributesForValidation(attributes: SchemaAttributes): Record<string, unknown>;
    dispose(): void;
    static getValidatorCacheStats(): ReturnType<typeof getCacheStats>;
    static getValidatorCacheMemoryUsage(): ReturnType<typeof getCacheMemoryUsage>;
    static evictUnusedValidators(maxAgeMs?: number): number;
}

type LogLevel$1 = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
type LogFormat = 'json' | 'pretty';
interface LoggerOptions {
    level?: LogLevel$1;
    name?: string;
    format?: LogFormat;
    transport?: TransportSingleOptions;
    bindings?: Record<string, unknown>;
    redactPatterns?: RegExp[];
    maxPayloadBytes?: number;
}
interface S3DBLogger extends Logger$2 {
    _maxPayloadBytes?: number;
}
type Logger$1 = S3DBLogger;
declare function createLogger(options?: LoggerOptions): S3DBLogger;

interface AsyncEventEmitterOptions {
    logLevel?: LogLevel$1;
    logger?: S3DBLogger;
}
declare class AsyncEventEmitter extends EventEmitter {
    private _asyncMode;
    logLevel: LogLevel$1;
    logger: S3DBLogger;
    constructor(options?: AsyncEventEmitterOptions);
    emit(event: string | symbol, ...args: unknown[]): boolean;
    emitSync(event: string | symbol, ...args: unknown[]): boolean;
    setAsyncMode(enabled: boolean): void;
}

declare const FastestValidator: new (opts?: ValidatorConstructorOptions) => FastestValidatorModule.default;
interface ValidatorOptions {
    options?: Record<string, unknown>;
    passphrase?: string;
    bcryptRounds?: number;
    autoEncrypt?: boolean;
    autoHash?: boolean;
}
declare class Validator extends FastestValidator {
    passphrase?: string;
    bcryptRounds: number;
    autoEncrypt: boolean;
    autoHash: boolean;
    constructor({ options, passphrase, bcryptRounds, autoEncrypt, autoHash }?: ValidatorOptions);
}
declare const ValidatorManager: typeof Validator;

/** Log levels supported by the logger */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
/** Record with string keys */
type StringRecord$1<T = unknown> = Record<string, T>;
/** Event handler type */
type EventHandler<T = unknown> = (data: T) => void | Promise<void>;
/** Disposable interface for cleanup */
interface Disposable {
    dispose(): void | Promise<void>;
}

interface ValidatorConfig {
    type?: string;
    optional?: boolean;
    min?: number;
    max?: number;
    properties?: AttributesSchema;
    props?: AttributesSchema;
    items?: string | ValidatorConfig;
    strict?: boolean | 'remove';
    [key: string]: unknown;
}
type AttributeValue = string | boolean | undefined | ValidatorConfig | AttributesSchema;
interface AttributesSchema {
    [key: string]: AttributeValue | 'remove';
    $$async?: boolean;
    $$strict?: boolean | 'remove';
    $$type?: string;
}
interface ResourceValidatorConfig {
    attributes?: AttributesSchema;
    strictValidation?: boolean;
    allNestedObjectsOptional?: boolean;
    passphrase?: string;
    bcryptRounds?: number;
    autoEncrypt?: boolean;
    autoDecrypt?: boolean;
}
interface ValidationResult {
    isValid: boolean;
    errors: ValidationErrorItem[];
    data: StringRecord$1;
}
interface ValidationErrorItem {
    message?: string;
    error?: Error;
    field?: string;
    type?: string;
    [key: string]: unknown;
}
interface ValidationOptions {
    throwOnError?: boolean;
    includeId?: boolean;
    mutateOriginal?: boolean;
}
type ValidateFn = (data: StringRecord$1) => Promise<true | ValidationErrorItem[]>;
declare class ResourceValidator {
    attributes: AttributesSchema;
    strictValidation: boolean;
    allNestedObjectsOptional: boolean;
    passphrase?: string;
    bcryptRounds?: number;
    autoEncrypt: boolean;
    autoDecrypt: boolean;
    validatorManager: InstanceType<typeof ValidatorManager>;
    validateFn: ValidateFn;
    constructor(config?: ResourceValidatorConfig);
    compileValidator(): void;
    updateSchema(newAttributes: AttributesSchema): void;
    validate(data: StringRecord$1, options?: ValidationOptions): Promise<ValidationResult>;
    preprocessAttributesForValidation(attributes: AttributesSchema): AttributesSchema;
    applyDefaults(data: StringRecord$1): StringRecord$1;
}

interface S3Object$1 {
    Key: string;
}
interface ListObjectsResponse$1 {
    Contents: S3Object$1[];
    NextContinuationToken?: string;
    IsTruncated: boolean;
}
interface S3ClientConfig$1 {
    keyPrefix: string;
}
interface S3Client$3 {
    parallelism: number;
    config: S3ClientConfig$1;
    listObjects(options: {
        prefix: string;
        continuationToken: string | null;
    }): Promise<ListObjectsResponse$1>;
}
interface Resource$5 {
    name: string;
    client: S3Client$3;
}
interface ResourceIdsReaderOptions {
    resource: Resource$5;
}
declare class ResourceIdsReader extends EventEmitter {
    resource: Resource$5;
    client: S3Client$3;
    stream: ReadableStream$1<string | string[]>;
    controller: ReadableStreamDefaultController<string | string[]>;
    continuationToken: string | null;
    closeNextIteration: boolean;
    constructor({ resource }: ResourceIdsReaderOptions);
    build(): ReadableStreamDefaultReader<string | string[]>;
    _start(controller: ReadableStreamDefaultController<string | string[]>): Promise<void>;
    _pull(_controller: ReadableStreamDefaultController<string | string[]>): Promise<void>;
    enqueue(ids: string[]): void;
    _cancel(_reason?: unknown): void;
}

declare class ResourceIdsPageReader extends ResourceIdsReader {
    enqueue(ids: string[]): void;
}

interface S3Client$2 {
    parallelism: number;
    config: {
        keyPrefix: string;
    };
    listObjects(options: {
        prefix: string;
        continuationToken: string | null;
    }): Promise<unknown>;
}
interface Resource$4 {
    name: string;
    client: S3Client$2;
    get(id: string): Promise<Record<string, unknown>>;
}
interface ResourceReaderOptions {
    resource: Resource$4;
    batchSize?: number;
    concurrency?: number;
}
declare class ResourceReader extends EventEmitter {
    resource: Resource$4;
    client: S3Client$2;
    batchSize: number;
    concurrency: number;
    input: ResourceIdsPageReader;
    transform: Transform;
    constructor({ resource, batchSize, concurrency }: ResourceReaderOptions);
    build(): this;
    _transform(chunk: string[], _encoding: BufferEncoding, callback: TransformCallback): Promise<void>;
    resume(): void;
}

interface S3Client$1 {
    parallelism: number;
    config: {
        keyPrefix: string;
    };
}
interface Resource$3 {
    name: string;
    client: S3Client$1;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
interface ResourceWriterOptions {
    resource: Resource$3;
    batchSize?: number;
    concurrency?: number;
}
declare class ResourceWriter extends EventEmitter {
    resource: Resource$3;
    client: S3Client$1;
    batchSize: number;
    concurrency: number;
    buffer: Record<string, unknown>[];
    writing: boolean;
    ended: boolean;
    writable: Writable;
    constructor({ resource, batchSize, concurrency }: ResourceWriterOptions);
    build(): this;
    write(chunk: Record<string, unknown>): boolean;
    end(): void;
    _maybeWrite(): Promise<void>;
    _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
}

declare function streamToString(stream: Readable): Promise<string>;

interface S3ClientConfig {
    logLevel?: string;
    logger?: Logger | null;
    id?: string | null;
    AwsS3Client?: unknown;
    connectionString: string;
    httpClientOptions?: HttpClientOptions;
    taskExecutor?: boolean | TaskExecutorConfig;
    executorPool?: boolean | TaskExecutorConfig | null;
}
interface HttpClientOptions {
    keepAlive?: boolean;
    keepAliveMsecs?: number;
    maxSockets?: number;
    maxFreeSockets?: number;
    timeout?: number;
    [key: string]: unknown;
}
interface TaskExecutorConfig {
    enabled?: boolean;
    concurrency?: number | 'auto';
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    retryableErrors?: string[];
    autotune?: AutotuneConfig$1 | null;
    monitoring?: MonitoringConfig$1;
}
interface AutotuneConfig$1 {
    initialConcurrency?: number;
    minConcurrency?: number;
    maxConcurrency?: number;
    targetLatencyMs?: number;
    adjustmentInterval?: number;
    [key: string]: unknown;
}
interface MonitoringConfig$1 {
    collectMetrics?: boolean;
    [key: string]: unknown;
}
interface Logger {
    debug: (obj: unknown, msg?: string) => void;
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
    trace?: (obj: unknown, msg?: string) => void;
}
interface MemoryClientConfig {
    id?: string;
    logLevel?: string;
    logger?: Logger;
    concurrency?: number;
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    retryableErrors?: string[];
    taskExecutor?: TaskManager;
    taskExecutorMonitoring?: MonitoringConfig$1 | null;
    bucket?: string;
    keyPrefix?: string;
    region?: string;
    enforceLimits?: boolean;
    metadataLimit?: number;
    maxObjectSize?: number;
    persistPath?: string;
    autoPersist?: boolean;
    maxMemoryMB?: number;
    evictionEnabled?: boolean;
}
interface FileSystemClientConfig {
    id?: string;
    logLevel?: string;
    logger?: Logger;
    taskExecutor?: TaskManager;
    taskExecutorMonitoring?: MonitoringConfig$1 | null;
    concurrency?: number;
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    retryableErrors?: string[];
    basePath?: string;
    bucket?: string;
    keyPrefix?: string;
    region?: string;
    enforceLimits?: boolean;
    metadataLimit?: number;
    maxObjectSize?: number;
    compression?: CompressionConfig;
    ttl?: TTLConfig;
    locking?: LockingConfig;
    backup?: BackupConfig;
    journal?: JournalConfig;
    stats?: StatsConfig;
}
interface CompressionConfig {
    enabled?: boolean;
    threshold?: number;
    level?: number;
}
interface TTLConfig {
    enabled?: boolean;
    defaultTTL?: number;
    cleanupInterval?: number;
}
interface LockingConfig {
    enabled?: boolean;
    timeout?: number;
}
interface BackupConfig {
    enabled?: boolean;
    suffix?: string;
}
interface JournalConfig {
    enabled?: boolean;
    file?: string;
}
interface StatsConfig {
    enabled?: boolean;
}
interface ClientConfig {
    bucket: string;
    keyPrefix: string;
    region: string;
    endpoint?: string;
    basePath?: string;
    forcePathStyle?: boolean;
    accessKeyId?: string;
    secretAccessKey?: string;
}
interface TaskManager {
    concurrency?: number;
    process: <T, R>(items: T[], fn: (item: T) => Promise<R>) => Promise<ProcessResult$2<R>>;
    getStats?: () => QueueStats | null;
    getAggregateMetrics?: (since?: number) => unknown | null;
}
interface ProcessResult$2<T> {
    results: T[];
    errors: Array<{
        error: Error;
        index: number;
        item?: unknown;
    }>;
}
interface QueueStats {
    queueSize?: number;
    activeCount?: number;
    effectiveConcurrency?: number;
    [key: string]: unknown;
}
interface PutObjectParams {
    key: string;
    metadata?: Record<string, unknown>;
    contentType?: string;
    body?: Buffer | string | Readable;
    contentEncoding?: string;
    contentLength?: number;
    ifMatch?: string;
    ifNoneMatch?: string;
}
interface CopyObjectParams {
    from: string;
    to: string;
    metadata?: Record<string, unknown>;
    metadataDirective?: 'COPY' | 'REPLACE';
    contentType?: string;
}
interface ListObjectsParams {
    prefix?: string;
    delimiter?: string | null;
    maxKeys?: number;
    continuationToken?: string | null;
    startAfter?: string | null;
}
interface GetKeysPageParams {
    prefix?: string;
    offset?: number;
    amount?: number;
}
interface S3Object {
    Body?: Readable & {
        transformToString?: (encoding?: string) => Promise<string>;
        transformToByteArray?: () => Promise<Uint8Array>;
        transformToWebStream?: () => ReadableStream;
    };
    Metadata: Record<string, string>;
    ContentType?: string;
    ContentLength?: number;
    ETag?: string;
    LastModified?: Date;
    ContentEncoding?: string;
}
interface ListObjectsResponse {
    Contents: S3ObjectInfo[];
    CommonPrefixes: Array<{
        Prefix: string;
    }>;
    IsTruncated: boolean;
    ContinuationToken?: string;
    NextContinuationToken?: string | null;
    KeyCount: number;
    MaxKeys: number;
    Prefix?: string;
    Delimiter?: string | null;
    StartAfter?: string;
}
interface S3ObjectInfo {
    Key: string;
    Size: number;
    LastModified: Date;
    ETag: string;
    StorageClass?: string;
}
interface PutObjectResponse {
    ETag: string;
    VersionId: string | null;
    ServerSideEncryption: string | null;
    Location: string;
}
interface CopyObjectResponse {
    CopyObjectResult: {
        ETag: string;
        LastModified: string;
    };
    BucketKeyEnabled: boolean;
    VersionId: string | null;
    ServerSideEncryption: string | null;
}
interface DeleteObjectResponse {
    DeleteMarker: boolean;
    VersionId: string | null;
}
interface DeleteObjectsResponse {
    Deleted: Array<{
        Key: string;
    }>;
    Errors: Array<{
        Key: string;
        Code: string;
        Message: string;
    }>;
}
interface StoragePutParams {
    body?: Buffer | string | unknown;
    metadata?: Record<string, string>;
    contentType?: string;
    contentEncoding?: string;
    contentLength?: number;
    ifMatch?: string;
    ifNoneMatch?: string;
    ttl?: number;
}
interface StorageCopyParams {
    metadata?: Record<string, string>;
    metadataDirective?: 'COPY' | 'REPLACE';
    contentType?: string;
}
interface StorageListParams {
    prefix?: string;
    delimiter?: string | null;
    maxKeys?: number;
    continuationToken?: string | null;
    startAfter?: string | null;
}
interface MemoryStorageConfig {
    bucket?: string;
    enforceLimits?: boolean;
    metadataLimit?: number;
    maxObjectSize?: number;
    persistPath?: string;
    autoPersist?: boolean;
    logLevel?: string;
    logger?: Logger;
    maxMemoryMB?: number;
    evictionEnabled?: boolean;
}
interface FileSystemStorageConfig {
    basePath?: string;
    bucket?: string;
    enforceLimits?: boolean;
    metadataLimit?: number;
    maxObjectSize?: number;
    logLevel?: string;
    logger?: Logger;
    compression?: CompressionConfig;
    ttl?: TTLConfig;
    locking?: LockingConfig;
    backup?: BackupConfig;
    journal?: JournalConfig;
    stats?: StatsConfig;
}
interface MemoryStorageStats {
    objectCount: number;
    totalSize: number;
    totalSizeFormatted: string;
    keys: string[];
    bucket: string;
    maxMemoryMB: number;
    memoryUsagePercent: number;
    evictions: number;
    evictedBytes: number;
    peakMemoryBytes: number;
}
interface FileSystemStorageStats {
    gets: number;
    puts: number;
    deletes: number;
    errors: number;
    compressionSaved: number;
    totalCompressed: number;
    totalUncompressed: number;
    avgCompressionRatio: string | number;
    features: {
        compression: boolean;
        ttl: boolean;
        locking: boolean;
        backup: boolean;
        journal: boolean;
        stats: boolean;
    };
}
interface StorageSnapshot {
    timestamp: string;
    bucket: string;
    objectCount: number;
    objects: Record<string, {
        body: string;
        metadata: Record<string, string>;
        contentType: string;
        etag: string;
        lastModified: string;
        size: number;
        contentEncoding?: string;
        contentLength: number;
    }>;
}
interface Client extends EventEmitter {
    id: string;
    config: ClientConfig;
    connectionString: string;
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
    getQueueStats(): QueueStats | null;
    getAggregateMetrics(since?: number): unknown | null;
    destroy(): void;
}

interface SchemaInfo {
    map?: StringRecord$1;
    pluginMap?: StringRecord$1;
}
interface ResourceConfig$1 {
    timestamps?: boolean;
}
interface Resource$2 {
    name: string;
    version: string;
    config: ResourceConfig$1;
    schema?: SchemaInfo;
    emit(event: string, payload: unknown): void;
}
interface BehaviorHandleInsertParams {
    resource: Resource$2;
    data: StringRecord$1;
    mappedData: StringRecord$1<string>;
    originalData?: StringRecord$1;
}
interface BehaviorHandleUpdateParams {
    resource: Resource$2;
    id: string;
    data: StringRecord$1;
    mappedData: StringRecord$1<string>;
    originalData?: StringRecord$1;
}
interface BehaviorHandleUpsertParams {
    resource: Resource$2;
    id: string;
    data: StringRecord$1;
    mappedData: StringRecord$1<string>;
}
interface BehaviorHandleGetParams {
    resource: Resource$2;
    metadata: StringRecord$1<string>;
    body: string;
}
interface BehaviorResult {
    mappedData: StringRecord$1<string>;
    body: string;
}
interface BehaviorGetResult {
    metadata: StringRecord$1<string>;
    body: string;
}
interface Behavior {
    handleInsert(params: BehaviorHandleInsertParams): Promise<BehaviorResult>;
    handleUpdate(params: BehaviorHandleUpdateParams): Promise<BehaviorResult>;
    handleUpsert?(params: BehaviorHandleUpsertParams): Promise<BehaviorResult>;
    handleGet(params: BehaviorHandleGetParams): Promise<BehaviorGetResult>;
}
type BehaviorName = 'user-managed' | 'enforce-limits' | 'truncate-data' | 'body-overflow' | 'body-only';
type BehaviorType = BehaviorName;

type HookFunction<T = unknown> = (data: T) => T | Promise<T>;
type BoundHookFunction<T = unknown> = HookFunction<T> & {
    __s3db_original?: HookFunction<T>;
};
interface HooksCollection {
    beforeInsert: BoundHookFunction[];
    afterInsert: BoundHookFunction[];
    beforeUpdate: BoundHookFunction[];
    afterUpdate: BoundHookFunction[];
    beforeDelete: BoundHookFunction[];
    afterDelete: BoundHookFunction[];
    beforeGet: BoundHookFunction[];
    afterGet: BoundHookFunction[];
    beforeList: BoundHookFunction[];
    afterList: BoundHookFunction[];
    beforeQuery: BoundHookFunction[];
    afterQuery: BoundHookFunction[];
    beforePatch: BoundHookFunction[];
    afterPatch: BoundHookFunction[];
    beforeReplace: BoundHookFunction[];
    afterReplace: BoundHookFunction[];
    beforeExists: BoundHookFunction[];
    afterExists: BoundHookFunction[];
    beforeCount: BoundHookFunction[];
    afterCount: BoundHookFunction[];
    beforeGetMany: BoundHookFunction[];
    afterGetMany: BoundHookFunction[];
    beforeDeleteMany: BoundHookFunction[];
    afterDeleteMany: BoundHookFunction[];
    [event: string]: BoundHookFunction[];
}
type HookEvent = 'beforeInsert' | 'afterInsert' | 'beforeUpdate' | 'afterUpdate' | 'beforeDelete' | 'afterDelete' | 'beforeGet' | 'afterGet' | 'beforeList' | 'afterList' | 'beforeQuery' | 'afterQuery' | 'beforePatch' | 'afterPatch' | 'beforeReplace' | 'afterReplace' | 'beforeExists' | 'afterExists' | 'beforeCount' | 'afterCount' | 'beforeGetMany' | 'afterGetMany' | 'beforeDeleteMany' | 'afterDeleteMany';

interface JWTUser {
    scope?: string;
    azp?: string;
    resource_access?: {
        [clientId: string]: {
            roles?: string[];
        };
    };
    realm_access?: {
        roles?: string[];
    };
    roles?: string[];
    [key: string]: unknown;
}
interface GuardContext {
    user?: JWTUser;
    params?: StringRecord$1;
    body?: unknown;
    query?: StringRecord$1;
    headers?: StringRecord$1;
    setPartition?: (partition: string, values?: StringRecord$1) => void;
}
type GuardFunction = (context: GuardContext, record?: unknown) => boolean | Promise<boolean>;
type GuardValue = boolean | string[] | GuardFunction;
interface GuardConfig {
    [operation: string]: GuardValue;
}

type SupportedMethod = 'get' | 'list' | 'listIds' | 'getAll' | 'count' | 'page' | 'insert' | 'update' | 'delete' | 'deleteMany' | 'exists' | 'getMany' | 'content' | 'hasContent' | 'query' | 'getFromPartition' | 'setContent' | 'deleteContent' | 'replace';
interface MiddlewareContext {
    resource: Resource$1;
    args: unknown[];
    method: string;
}
type NextFunction = () => Promise<unknown>;
type MiddlewareFunction = (ctx: MiddlewareContext, next: NextFunction) => Promise<unknown>;
interface Resource$1 {
    name: string;
    [method: string]: unknown;
}

interface PartitionFields$1 {
    [fieldName: string]: string;
}
interface PartitionDefinition$1 {
    fields: PartitionFields$1;
}
interface PartitionsConfig {
    [partitionName: string]: PartitionDefinition$1;
}

interface PartitionFields {
    [fieldName: string]: string;
}
interface PartitionDefinition {
    fields: PartitionFields;
}
interface OrphanedPartition {
    missingFields: string[];
    definition: PartitionDefinition;
    allFields: string[];
}
interface OrphanedPartitions {
    [partitionName: string]: OrphanedPartition;
}

type EventListener = (...args: unknown[]) => void | Promise<void>;
interface EventListeners {
    [eventName: string]: EventListener | EventListener[];
}

interface IncrementalConfig {
    type: 'incremental';
    start?: number;
    prefix?: string;
    mode?: 'fast' | 'normal';
    [key: string]: unknown;
}
type IdGeneratorConfig = ((data?: unknown) => string) | number | string | IncrementalConfig;
interface SequenceInterface {
    getValue(fieldName: string): Promise<number>;
    reset(fieldName: string, value: number): Promise<boolean>;
    list(): Promise<SequenceInfo[]>;
    reserveBatch(fieldName: string, count: number): Promise<BatchInfo>;
    getBatchStatus(fieldName: string): BatchStatus | null;
    releaseBatch(fieldName: string): void;
}
interface SequenceInfo {
    fieldName: string;
    currentValue: number;
}
interface BatchInfo {
    start: number;
    end: number;
    current: number;
}
interface BatchStatus {
    start: number;
    end: number;
    current: number;
    remaining: number;
    [key: string]: unknown;
}
type IdGeneratorFunction = (() => string) | (() => Promise<string>);
type IncrementalGenerator = IdGeneratorFunction & {
    _sequence?: SequenceInterface;
};

interface ResourceConfig {
    name: string;
    client: Client;
    database?: Database$1;
    version?: string;
    attributes?: AttributesSchema;
    behavior?: BehaviorType;
    passphrase?: string;
    bcryptRounds?: number;
    observers?: Database$1[];
    cache?: boolean;
    autoEncrypt?: boolean;
    autoDecrypt?: boolean;
    timestamps?: boolean;
    partitions?: PartitionsConfig | string[];
    paranoid?: boolean;
    allNestedObjectsOptional?: boolean;
    hooks?: Partial<HooksCollection>;
    idGenerator?: IdGeneratorFunction | number | string;
    idSize?: number;
    versioningEnabled?: boolean;
    strictValidation?: boolean;
    events?: EventListeners;
    asyncEvents?: boolean;
    asyncPartitions?: boolean;
    strictPartitions?: boolean;
    createdBy?: string;
    guard?: GuardConfig;
    logLevel?: LogLevel;
    map?: StringRecord$1<string>;
    disableEvents?: boolean;
    disableResourceEvents?: boolean;
    api?: ResourceApiConfig$1;
    description?: string;
    /** Schema registry for stable attribute indices - loaded from s3db.json */
    schemaRegistry?: SchemaRegistry;
    /** Plugin schema registries for stable plugin attribute indices */
    pluginSchemaRegistry?: Record<string, PluginSchemaRegistry | SchemaRegistry>;
}
interface ResourceApiConfig$1 {
    enabled?: boolean;
    path?: string;
    operations?: {
        list?: boolean;
        get?: boolean;
        insert?: boolean;
        update?: boolean;
        delete?: boolean;
        query?: boolean;
    };
    middleware?: MiddlewareFunction[];
}
interface ResourceInternalConfig {
    cache: boolean;
    hooks: Partial<HooksCollection>;
    paranoid: boolean;
    timestamps: boolean;
    partitions: PartitionsConfig;
    autoEncrypt: boolean;
    autoDecrypt: boolean;
    allNestedObjectsOptional: boolean;
    asyncEvents: boolean;
    asyncPartitions: boolean;
    strictPartitions: boolean;
    createdBy: string;
}
interface ResourceExport {
    name: string;
    attributes: AttributesSchema;
    behavior: BehaviorType;
    timestamps: boolean;
    partitions: PartitionsConfig;
    paranoid: boolean;
    allNestedObjectsOptional: boolean;
    autoDecrypt: boolean;
    cache: boolean;
    asyncEvents?: boolean;
    asyncPartitions?: boolean;
    hooks: Partial<HooksCollection>;
    map?: StringRecord$1<string>;
}
interface ResourceData {
    id: string;
    [key: string]: unknown;
}
interface ContentResult {
    buffer: Buffer | null;
    contentType: string | null;
}
interface SetContentParams {
    id: string;
    buffer: Buffer | string;
    contentType?: string;
}
interface PageResult {
    items: ResourceData[];
    total: number;
    offset: number;
    size: number;
    hasMore: boolean;
}
interface QueryFilter {
    [key: string]: unknown;
}
interface QueryOptions {
    limit?: number;
    offset?: number;
    partition?: string | null;
    partitionValues?: StringRecord$1;
}
interface ListOptions {
    partition?: string | null;
    partitionValues?: StringRecord$1;
    limit?: number;
    offset?: number;
}
interface CountOptions {
    partition?: string | null;
    partitionValues?: StringRecord$1;
}
interface DeleteManyResult {
    deleted: number;
    failed: number;
    errors?: unknown[];
}
interface PageOptions {
    offset?: number;
    size?: number;
    partition?: string | null;
    partitionValues?: StringRecord$1;
    skipCount?: boolean;
}
interface UpdateConditionalResult {
    success: boolean;
    data?: ResourceData;
    error?: string;
    currentETag?: string;
}
interface UpdateConditionalResult {
    success: boolean;
    data?: ResourceData;
    etag?: string;
    error?: string;
}
interface ComposeFullObjectParams {
    id: string;
    metadata: StringRecord$1;
    body: string;
    behavior: BehaviorType;
}
interface GetFromPartitionParams {
    id: string;
    partitionName: string;
    partitionValues?: StringRecord$1;
}
interface Database$1 {
    id: string;
    logger: Logger$1;
    getChildLogger(name: string, bindings?: Record<string, unknown>): Logger$1;
    emit(event: string, data: unknown): void;
    savedMetadata?: SavedMetadata$1 | null;
}
interface SavedMetadata$1 {
    resources?: StringRecord$1<ResourceMetadata$1>;
}
interface ResourceMetadata$1 {
    currentVersion?: string;
    versions?: StringRecord$1<VersionData$1>;
}
interface VersionData$1 {
    hash?: string;
    attributes?: AttributesSchema;
}
declare class Resource extends AsyncEventEmitter implements Disposable {
    name: string;
    client: Client;
    version: string;
    logLevel: LogLevel$1;
    logger: Logger$1;
    behavior: BehaviorType;
    private _resourceAsyncEvents;
    observers: Database$1[];
    passphrase: string;
    bcryptRounds: number;
    versioningEnabled: boolean;
    strictValidation: boolean;
    asyncEvents: boolean;
    idGenerator: IdGeneratorFunction | IncrementalGenerator | null;
    idSize: number;
    idGeneratorType: IdGeneratorConfig | undefined;
    config: ResourceInternalConfig;
    validator: ResourceValidator;
    schema: Schema;
    $schema: Readonly<Omit<ResourceConfig, 'database' | 'observers' | 'client'>>;
    hooks: HooksCollection;
    attributes: AttributesSchema;
    guard: GuardConfig | null;
    eventsDisabled: boolean;
    database?: Database$1;
    map?: StringRecord$1<string>;
    private _schemaRegistry?;
    private _pluginSchemaRegistry?;
    private _instanceId;
    private _idGenerator;
    private _hooksModule;
    private _partitions;
    private _eventsModule;
    private _guards;
    private _middleware;
    private _query;
    private _content;
    private _streams;
    private _persistence;
    constructor(config?: ResourceConfig);
    private _normalizePartitionsInput;
    configureIdGenerator(customIdGenerator: IdGeneratorFunction | number | string | undefined, idSize: number): IdGeneratorFunction | IncrementalGenerator | null;
    private _initIncrementalIdGenerator;
    hasAsyncIdGenerator(): boolean;
    getIdGeneratorType(customIdGenerator: IdGeneratorFunction | number | undefined, idSize: number): IdGeneratorConfig | undefined;
    export(): ResourceExport;
    applyConfiguration({ map }?: {
        map?: StringRecord$1<string>;
    }): void;
    updateAttributes(newAttributes: AttributesSchema): {
        oldAttributes: AttributesSchema;
        newAttributes: AttributesSchema;
    };
    addPluginAttribute(name: string, definition: string | Record<string, unknown>, pluginName: string): void;
    removePluginAttribute(name: string, pluginName?: string | null): boolean;
    addHook(event: HookEvent, fn: HookFunction): void;
    executeHooks(event: HookEvent, data: unknown): Promise<unknown>;
    _bindHook(fn: HookFunction): BoundHookFunction<unknown> | null;
    setupPartitionHooks(): void;
    validate(data: Record<string, unknown>, options?: ValidationOptions): Promise<ValidationResult>;
    validatePartitions(): void;
    fieldExistsInAttributes(fieldName: string): boolean;
    findOrphanedPartitions(): OrphanedPartitions;
    removeOrphanedPartitions({ dryRun }?: {
        dryRun?: boolean | undefined;
    }): OrphanedPartitions;
    applyPartitionRule(value: unknown, rule: string): unknown;
    getResourceKey(id: string): string;
    getPartitionKey({ partitionName, id, data }: {
        partitionName: string;
        id: string;
        data: Record<string, unknown>;
    }): string | null;
    getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown;
    calculateContentLength(body: string | Buffer | object | null | undefined): number;
    _emitStandardized(event: string, payload: unknown, id?: string | null): void;
    _ensureEventsWired(): void;
    on(eventName: string, listener: EventHandler): this;
    addListener(eventName: string, listener: EventHandler): this;
    once(eventName: string, listener: EventHandler): this;
    emit(eventName: string, ...args: unknown[]): boolean;
    insert({ id, ...attributes }: {
        id?: string;
    } & Record<string, unknown>): Promise<ResourceData>;
    get(id: string): Promise<ResourceData>;
    getOrNull(id: string): Promise<ResourceData | null>;
    getOrThrow(id: string): Promise<ResourceData>;
    exists(id: string): Promise<boolean>;
    update(id: string, attributes: Record<string, unknown>): Promise<ResourceData>;
    patch(id: string, fields: Record<string, unknown>, options?: {
        partition?: string;
        partitionValues?: StringRecord$1;
    }): Promise<ResourceData>;
    _patchViaCopyObject(id: string, fields: Record<string, unknown>, options?: Record<string, unknown>): Promise<ResourceData>;
    replace(id: string, fullData: Record<string, unknown>, options?: {
        partition?: string;
        partitionValues?: StringRecord$1;
    }): Promise<ResourceData>;
    updateConditional(id: string, attributes: Record<string, unknown>, options?: {
        ifMatch?: string;
    }): Promise<UpdateConditionalResult>;
    delete(id: string): Promise<unknown>;
    upsert({ id, ...attributes }: {
        id: string;
    } & Record<string, unknown>): Promise<ResourceData>;
    count({ partition, partitionValues }?: CountOptions): Promise<number>;
    insertMany(objects: Record<string, unknown>[]): Promise<ResourceData[]>;
    _executeBatchHelper(operations: unknown[], options?: Record<string, unknown>): Promise<unknown>;
    deleteMany(ids: string[]): Promise<DeleteManyResult>;
    deleteAll(): Promise<{
        deletedCount: number;
    }>;
    deleteAllData(): Promise<{
        deletedCount: number;
    }>;
    listIds({ partition, partitionValues, limit, offset }?: ListOptions): Promise<string[]>;
    list({ partition, partitionValues, limit, offset }?: ListOptions): Promise<ResourceData[]>;
    listMain({ limit, offset }: {
        limit?: number;
        offset?: number;
    }): Promise<ResourceData[]>;
    listPartition({ partition, partitionValues, limit, offset }: {
        partition: string;
        partitionValues: StringRecord$1;
        limit?: number;
        offset?: number;
    }): Promise<ResourceData[]>;
    buildPartitionPrefix(partition: string, partitionDef: PartitionDefinition$1, partitionValues: StringRecord$1): string;
    extractIdsFromKeys(keys: string[]): string[];
    processListResults(ids: string[], context?: string): Promise<ResourceData[]>;
    processPartitionResults(ids: string[], partition: string, partitionDef: PartitionDefinition$1, keys: string[]): Promise<ResourceData[]>;
    extractPartitionValuesFromKey(id: string, keys: string[], sortedFields: string[]): StringRecord$1;
    handleResourceError(error: Error, id: string, context: string): ResourceData;
    handleListError(error: Error, { partition, partitionValues }: {
        partition: string | null;
        partitionValues: StringRecord$1;
    }): ResourceData[];
    getMany(ids: string[]): Promise<ResourceData[]>;
    getAll(): Promise<ResourceData[]>;
    page({ offset, size, partition, partitionValues, skipCount }?: PageOptions): Promise<PageResult>;
    readable(): ResourceReader;
    writable(): ResourceWriter;
    setContent({ id, buffer, contentType }: SetContentParams): Promise<ResourceData>;
    content(id: string): Promise<ContentResult>;
    hasContent(id: string): Promise<boolean>;
    deleteContent(id: string): Promise<unknown>;
    getDefinitionHash(): string;
    extractVersionFromKey(key: string): string | null;
    getSchemaForVersion(version: string): Promise<Schema>;
    createPartitionReferences(data: ResourceData): Promise<void>;
    deletePartitionReferences(data: ResourceData): Promise<void>;
    query(filter?: QueryFilter, { limit, offset, partition, partitionValues }?: QueryOptions): Promise<ResourceData[]>;
    handlePartitionReferenceUpdates(oldData: ResourceData, newData: ResourceData): Promise<void>;
    handlePartitionReferenceUpdate(partitionName: string, partition: PartitionDefinition$1, oldData: ResourceData, newData: ResourceData): Promise<void>;
    updatePartitionReferences(data: ResourceData): Promise<void>;
    getFromPartition({ id, partitionName, partitionValues }: GetFromPartitionParams): Promise<ResourceData>;
    createHistoricalVersion(id: string, data: ResourceData): Promise<void>;
    applyVersionMapping(data: ResourceData, fromVersion: string, toVersion: string): Promise<ResourceData>;
    composeFullObjectFromWrite({ id, metadata, body, behavior }: ComposeFullObjectParams): Promise<ResourceData>;
    _normalizeGuard(guard: GuardConfig): GuardConfig | null;
    executeGuard(operation: string, context: GuardContext, resource?: ResourceData | null): Promise<boolean>;
    _checkRolesScopes(requiredRolesScopes: string[], user: JWTUser): boolean;
    _initMiddleware(): void;
    useMiddleware(method: SupportedMethod, fn: MiddlewareFunction): void;
    applyDefaults(data: Record<string, unknown>): Record<string, unknown>;
    getSequenceValue(fieldName?: string): Promise<number | null>;
    resetSequence(fieldName: string, value: number): Promise<boolean>;
    listSequences(): Promise<SequenceInfo[] | null>;
    reserveIdBatch(count?: number): Promise<{
        start: number;
        end: number;
        current: number;
    } | null>;
    getBatchStatus(fieldName?: string): {
        start: number;
        end: number;
        current: number;
        remaining: number;
    } | null;
    releaseBatch(fieldName?: string): void;
    dispose(): void;
}

interface ProcessManagerOptions {
    logLevel?: LogLevel$1;
    shutdownTimeout?: number;
    exitOnSignal?: boolean;
    logger?: S3DBLogger;
}
type CleanupFn = () => Promise<void> | void;
interface ProcessManagerStatus {
    isShuttingDown: boolean;
    intervals: string[];
    timeouts: string[];
    cleanups: string[];
    counts: {
        intervals: number;
        timeouts: number;
        cleanups: number;
    };
}
interface ShutdownOptions {
    timeout?: number;
}
declare class ProcessManager {
    private options;
    private logger;
    private intervals;
    private timeouts;
    private cleanups;
    private isShuttingDown;
    private shutdownPromise;
    private _boundSignalHandler;
    private _signalHandlersSetup;
    constructor(options?: ProcessManagerOptions);
    setInterval(fn: () => void, interval: number, name: string): ReturnType<typeof setTimeout>;
    clearInterval(name: string): void;
    setTimeout(fn: () => void, delay: number, name: string): ReturnType<typeof setTimeout>;
    clearTimeout(name: string): void;
    registerCleanup(cleanupFn: CleanupFn, name: string): void;
    unregisterCleanup(name: string): void;
    private _setupSignalHandlers;
    private _handleSignal;
    shutdown(options?: ShutdownOptions): Promise<void>;
    private _performShutdown;
    getStatus(): ProcessManagerStatus;
    removeSignalHandlers(): void;
}
declare function getProcessManager(options?: ProcessManagerOptions): ProcessManager;
declare function resetProcessManager(): void;

interface SafeEventEmitterOptions {
    logLevel?: LogLevel$1;
    logger?: S3DBLogger;
    autoCleanup?: boolean;
    maxListeners?: number;
}
interface ListenerStats {
    [eventName: string]: number;
}
declare class SafeEventEmitter extends EventEmitter {
    options: Required<Omit<SafeEventEmitterOptions, 'logger'>> & {
        logger?: S3DBLogger;
    };
    logger: S3DBLogger;
    private _signalHandlersSetup;
    private _isDestroyed;
    private _boundCleanupHandler?;
    constructor(options?: SafeEventEmitterOptions);
    private _setupSignalHandlers;
    private _handleCleanup;
    on(eventName: string | symbol, listener: (...args: unknown[]) => void): this;
    once(eventName: string | symbol, listener: (...args: unknown[]) => void): this;
    emit(eventName: string | symbol, ...args: unknown[]): boolean;
    private handleError;
    getListenerStats(): ListenerStats;
    getTotalListenerCount(): number;
    destroy(): void;
    isDestroyed(): boolean;
    removeSignalHandlers(): void;
}
declare function createSafeEventEmitter(options?: SafeEventEmitterOptions): SafeEventEmitter;

interface CronManagerOptions {
    logLevel?: LogLevel$1;
    shutdownTimeout?: number;
    exitOnSignal?: boolean;
    disabled?: boolean;
    logger?: S3DBLogger;
}
interface CronTask {
    start(): void;
    stop(): void;
    destroy?(): void;
    run?(...args: unknown[]): Promise<void>;
}
interface ScheduleOptions {
    scheduled?: boolean;
    timezone?: string;
    recoverMissedExecutions?: boolean;
    replace?: boolean;
}
interface JobStats {
    name: string;
    expression: string;
    createdAt: number;
    uptime: number;
}
interface CronStats {
    totalJobs: number;
    jobs: JobStats[];
    isDestroyed: boolean;
}
interface CronShutdownOptions {
    timeout?: number;
    signal?: string;
    error?: Error;
}
declare class CronManager {
    private options;
    private logger;
    private jobs;
    private _cron;
    private _destroyed;
    private _signalHandlersSetup;
    private _boundShutdownHandler?;
    private _boundErrorHandler?;
    disabled: boolean;
    constructor(options?: CronManagerOptions);
    private _setupSignalHandlers;
    removeSignalHandlers(): void;
    private _handleShutdown;
    private _handleError;
    private _loadCron;
    schedule(expression: string, fn: () => void | Promise<void>, name: string, options?: ScheduleOptions): Promise<CronTask | null>;
    scheduleInterval(ms: number, fn: () => void | Promise<void>, name: string, options?: ScheduleOptions): Promise<CronTask | null>;
    stop(name: string): boolean;
    getStats(): CronStats;
    isDestroyed(): boolean;
    shutdown(options?: CronShutdownOptions): Promise<void>;
    private _createStubTask;
    private _inferIntervalFromExpression;
    private _createTestCronStub;
}

type StringRecord<T = unknown> = StringRecord$1<T>;
interface ExecutorPoolConfig {
    enabled?: boolean;
    concurrency?: number;
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    retryableErrors?: string[];
    autotune?: AutotuneConfig | null;
    monitoring?: MonitoringConfig;
}
interface AutotuneConfig {
    enabled?: boolean;
    targetLatency?: number;
    minConcurrency?: number;
    maxConcurrency?: number;
}
interface MonitoringConfig {
    collectMetrics?: boolean;
    [key: string]: unknown;
}
interface TaskExecutorMonitoringConfig {
    enabled?: boolean;
    metricsInterval?: number;
}
interface LoggerConfig {
    level?: LogLevel;
    pretty?: boolean;
    destination?: string;
    childLevels?: StringRecord<LogLevel>;
}
interface ClientOptions$1 {
    compression?: {
        enabled?: boolean;
    };
    retries?: number;
    timeout?: number;
    [key: string]: unknown;
}
interface CacheConfig {
    enabled?: boolean;
    ttl?: number;
    maxSize?: number;
}
interface SavedMetadata {
    version: string;
    s3dbVersion: string;
    lastUpdated: string;
    resources: StringRecord<ResourceMetadata>;
}
interface ResourceMetadata {
    currentVersion: string;
    partitions: PartitionsConfig;
    createdBy?: string;
    versions: StringRecord<VersionData>;
    /** Persistent attribute index mapping - prevents data corruption on schema changes */
    schemaRegistry?: SchemaRegistry;
    /** Persistent plugin attribute index mapping - per plugin namespace (supports both legacy numeric and new string-based formats) */
    pluginSchemaRegistry?: StringRecord<PluginSchemaRegistry | SchemaRegistry>;
}
interface VersionData {
    hash: string;
    attributes: AttributesSchema;
    behavior: BehaviorType;
    timestamps?: boolean;
    partitions?: PartitionsConfig;
    paranoid?: boolean;
    allNestedObjectsOptional?: boolean;
    autoDecrypt?: boolean;
    cache?: boolean;
    asyncEvents?: boolean;
    asyncPartitions?: boolean;
    hooks?: StringRecord<HookSummary>;
    idSize?: number;
    idGenerator?: string | number | Record<string, unknown>;
    createdAt?: string;
    map?: StringRecord<string>;
}
interface HookSummary {
    count: number;
    handlers: Array<{
        name: string | null;
        length: number | null;
        type: string;
    }>;
}
interface DefinitionChange {
    type: 'new' | 'changed' | 'deleted';
    resourceName: string;
    currentHash: string | null;
    savedHash: string | null;
    fromVersion?: string;
    toVersion?: string;
    deletedVersion?: string;
}
interface GlobalCoordinatorOptions {
    autoStart?: boolean;
    config?: GlobalCoordinatorConfig;
}
interface GlobalCoordinatorConfig {
    heartbeatInterval?: number;
    heartbeatJitter?: number;
    leaseTimeout?: number;
    workerTimeout?: number;
    diagnosticsEnabled?: boolean;
    circuitBreaker?: {
        failureThreshold?: number;
        resetTimeout?: number;
    };
}
interface GlobalCoordinatorService {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getLeader: () => Promise<string | null>;
    getCircuitBreakerStatus: () => {
        state: string;
        failures: number;
    };
    on: (event: string, handler: EventHandler) => void;
}
type HookEventName = 'beforeConnect' | 'afterConnect' | 'beforeCreateResource' | 'afterCreateResource' | 'beforeUploadMetadata' | 'afterUploadMetadata' | 'beforeDisconnect' | 'afterDisconnect' | 'resourceCreated' | 'resourceUpdated';
type DatabaseHookFunction = (context: {
    database: DatabaseRef;
    [key: string]: unknown;
}) => void | Promise<void>;
interface DatabaseRef {
    id: string;
    version: string;
    s3dbVersion: string;
    client: Client;
    logger: Logger$1;
    savedMetadata: SavedMetadata | null;
    _resourcesMap: StringRecord<Resource>;
    resources: StringRecord<Resource>;
    passphrase: string;
    bcryptRounds: number;
    versioningEnabled: boolean;
    strictValidation: boolean;
    strictHooks: boolean;
    disableResourceEvents: boolean;
    deferMetadataWrites: boolean;
    metadataWriteDelay: number;
    cache: CacheConfig | boolean | undefined;
    processManager: ProcessManager;
    cronManager: CronManager;
    executorPool: ExecutorPoolConfig;
    pluginList: PluginConstructor[];
    pluginRegistry: StringRecord<Plugin>;
    plugins: StringRecord<Plugin>;
    bucket: string;
    keyPrefix: string;
    emit: (event: string, data?: unknown) => void | Promise<void>;
    isConnected: () => boolean;
    getChildLogger: (name: string, bindings?: Record<string, unknown>) => Logger$1;
    generateDefinitionHash: (definition: ResourceExport, behavior?: BehaviorType) => string;
    getNextVersion: (versions?: StringRecord<VersionData>) => string;
    blankMetadataStructure: () => SavedMetadata;
}
interface Plugin {
    name?: string;
    instanceName?: string;
    processManager?: ProcessManager;
    cronManager?: CronManager;
    logger?: Logger$1;
    setInstanceName?: (name: string) => void;
    install: (db: DatabaseRef) => Promise<void>;
    start: () => Promise<void>;
    stop?: () => Promise<void>;
    uninstall?: (options?: {
        purgeData?: boolean;
    }) => Promise<void>;
    removeAllListeners?: () => void;
}
type PluginConstructor = (new (db: DatabaseRef) => Plugin) | Plugin;

interface ResourceApiConfig {
    enabled?: boolean;
    path?: string;
    operations?: {
        list?: boolean;
        get?: boolean;
        insert?: boolean;
        update?: boolean;
        delete?: boolean;
        query?: boolean;
    };
    middleware?: MiddlewareFunction[];
}
interface CreateResourceConfig {
    name: string;
    attributes: AttributesSchema;
    behavior?: BehaviorType;
    hooks?: Partial<HooksCollection>;
    middlewares?: MiddlewareFunction[] | StringRecord$1<MiddlewareFunction | MiddlewareFunction[]>;
    timestamps?: boolean;
    partitions?: PartitionsConfig | string[];
    paranoid?: boolean;
    cache?: boolean;
    autoDecrypt?: boolean;
    asyncEvents?: boolean;
    asyncPartitions?: boolean;
    strictValidation?: boolean;
    passphrase?: string;
    bcryptRounds?: number;
    idGenerator?: ((size?: number) => string) | number | string;
    idSize?: number;
    map?: StringRecord$1<string>;
    events?: StringRecord$1<EventHandler | EventHandler[]>;
    disableEvents?: boolean;
    createdBy?: string;
    version?: string;
    allNestedObjectsOptional?: boolean;
    api?: ResourceApiConfig;
    description?: string;
}
interface HashExistsResult {
    exists: boolean;
    sameHash: boolean;
    hash: string | null;
    existingHash?: string;
}

interface DatabaseOptions {
    connectionString?: string;
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    client?: Client;
    clientOptions?: ClientOptions$1;
    plugins?: PluginConstructor[];
    cache?: CacheConfig | boolean;
    passphrase?: string;
    bcryptRounds?: number;
    versioningEnabled?: boolean;
    strictValidation?: boolean;
    strictHooks?: boolean;
    disableResourceEvents?: boolean;
    deferMetadataWrites?: boolean;
    metadataWriteDelay?: number;
    parallelism?: number | string;
    executorPool?: ExecutorPoolConfig | false;
    operationsPool?: ExecutorPoolConfig | false;
    taskExecutorMonitoring?: TaskExecutorMonitoringConfig;
    logLevel?: LogLevel;
    loggerOptions?: LoggerConfig;
    logger?: Logger$1;
    processManager?: ProcessManager;
    cronManager?: CronManager;
    exitOnSignal?: boolean;
    autoCleanup?: boolean;
}
declare class Database extends SafeEventEmitter {
    id: string;
    version: string;
    s3dbVersion: string;
    resources: StringRecord$1<Resource>;
    savedMetadata: SavedMetadata | null;
    databaseOptions: DatabaseOptions;
    executorPool: ExecutorPoolConfig;
    taskExecutor: ExecutorPoolConfig;
    pluginList: PluginConstructor[];
    pluginRegistry: StringRecord$1<Plugin>;
    plugins: StringRecord$1<Plugin>;
    cache: CacheConfig | boolean | undefined;
    passphrase: string;
    bcryptRounds: number;
    versioningEnabled: boolean;
    strictValidation: boolean;
    strictHooks: boolean;
    disableResourceEvents: boolean;
    deferMetadataWrites: boolean;
    metadataWriteDelay: number;
    processManager: ProcessManager;
    cronManager: CronManager;
    logLevel: string;
    logger: Logger$1;
    client: Client;
    connectionString: string | undefined;
    bucket: string;
    keyPrefix: string;
    _resourcesMap: StringRecord$1<Resource>;
    private _parallelism;
    private _childLoggerLevels;
    private _hooksModule;
    private _coordinatorsModule;
    private _recoveryModule;
    private _metadataModule;
    private _pluginsModule;
    private _resourcesModule;
    private _connectionModule;
    constructor(options: DatabaseOptions);
    private _initializeClient;
    get parallelism(): number;
    set parallelism(value: number | string);
    setConcurrency(value: number | string): void;
    get operationsPool(): ExecutorPoolConfig;
    get config(): {
        version: string;
        s3dbVersion: string;
        bucket: string;
        keyPrefix: string;
        taskExecutor: ExecutorPoolConfig;
        logLevel: string;
    };
    getChildLogger(name: string, bindings?: Record<string, unknown>): Logger$1;
    setChildLevel(name: string, level: LogLevel): void;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    startPlugins(): Promise<void>;
    usePlugin(plugin: Plugin, name?: string | null): Promise<Plugin>;
    uninstallPlugin(name: string, options?: {
        purgeData?: boolean;
    }): Promise<void>;
    getGlobalCoordinator(namespace: string, options?: GlobalCoordinatorOptions): Promise<GlobalCoordinatorService>;
    createResource(config: CreateResourceConfig): Promise<Resource>;
    listResources(): Promise<ResourceExport[]>;
    getResource(name: string): Promise<Resource>;
    resourceExists(name: string): boolean;
    resourceExistsWithSameHash(params: {
        name: string;
        attributes: AttributesSchema;
        behavior?: BehaviorType;
        partitions?: PartitionsConfig;
    }): HashExistsResult;
    uploadMetadataFile(): Promise<void>;
    flushMetadata(): Promise<void>;
    blankMetadataStructure(): SavedMetadata;
    detectDefinitionChanges(savedMetadata: SavedMetadata): DefinitionChange[];
    generateDefinitionHash(definition: ResourceExport, behavior?: BehaviorType): string;
    getNextVersion(versions?: StringRecord$1<VersionData>): string;
    addHook(event: HookEventName, fn: DatabaseHookFunction): void;
    removeHook(event: HookEventName, fn: DatabaseHookFunction): void;
    getHooks(event: HookEventName): DatabaseHookFunction[];
    clearHooks(event: HookEventName): void;
    private _deepMerge;
    private _applyTaskExecutorMonitoring;
    private _normalizeParallelism;
    private _normalizeOperationsPool;
    private _inferConnectionStringFromClient;
}
declare class S3db extends Database {
}

type ClientType = 'filesystem' | 'memory' | 's3' | 'custom';
interface ClientOptions {
    [key: string]: unknown;
}
declare class ConnectionString {
    region: string;
    bucket: string;
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    endpoint: string;
    keyPrefix: string;
    forcePathStyle?: boolean;
    clientType?: ClientType;
    basePath?: string;
    clientOptions: ClientOptions;
    constructor(connectionString: string);
    private _parseQueryParams;
    private _coerceValue;
    private defineFromS3;
    private defineFromCustomUri;
    private defineFromFileUri;
    private defineFromMemoryUri;
}

interface AwsCommand {
    constructor: {
        name: string;
    };
    input?: any;
}
declare class S3Client extends EventEmitter {
    id: string;
    logLevel: string;
    private logger;
    config: ConnectionString;
    connectionString: string;
    httpClientOptions: HttpClientOptions;
    client: S3Client$4;
    private _inflightCoalescing;
    private taskExecutorConfig;
    private taskExecutor;
    constructor({ logLevel, logger, id, AwsS3Client: providedClient, connectionString, httpClientOptions, taskExecutor, executorPool, }: S3ClientConfig);
    private _coalesce;
    private _normalizeTaskExecutorConfig;
    private _createTasksPool;
    private _executeOperation;
    private _executeBatch;
    getQueueStats(): QueueStats | null;
    getAggregateMetrics(since?: number): unknown | null;
    pausePool(): Promise<void | null>;
    resumePool(): void | null;
    drainPool(): Promise<void | null>;
    stopPool(): void;
    destroy(): void;
    createClient(): S3Client$4;
    sendCommand(command: AwsCommand): Promise<unknown>;
    putObject(params: PutObjectParams): Promise<unknown>;
    getObject(key: string): Promise<unknown>;
    headObject(key: string): Promise<unknown>;
    copyObject(params: CopyObjectParams): Promise<unknown>;
    exists(key: string): Promise<boolean>;
    deleteObject(key: string): Promise<unknown>;
    deleteObjects(keys: string[]): Promise<{
        deleted: unknown[];
        notFound: Array<{
            message: string;
            raw: Error;
        }>;
    }>;
    deleteAll({ prefix }?: {
        prefix?: string;
    }): Promise<number>;
    moveObject({ from, to }: {
        from: string;
        to: string;
    }): Promise<boolean>;
    listObjects(params?: ListObjectsParams): Promise<unknown>;
    count({ prefix }?: {
        prefix?: string;
    }): Promise<number>;
    getAllKeys({ prefix }?: {
        prefix?: string;
    }): Promise<string[]>;
    getContinuationTokenAfterOffset(params?: {
        prefix?: string;
        offset?: number;
    }): Promise<string | null>;
    getKeysPage(params?: GetKeysPageParams): Promise<string[]>;
    moveAllObjects({ prefixFrom, prefixTo }: {
        prefixFrom: string;
        prefixTo: string;
    }): Promise<string[]>;
}

declare class MemoryStorage {
    private objects;
    private bucket;
    private enforceLimits;
    private metadataLimit;
    private maxObjectSize;
    private persistPath?;
    private autoPersist;
    private logLevel;
    private maxMemoryMB;
    private maxMemoryBytes;
    private currentMemoryBytes;
    private evictionEnabled;
    private _stats;
    private logger;
    constructor(config?: MemoryStorageConfig);
    private _generateETag;
    private _toBuffer;
    private _formatEtag;
    private _normalizeEtagHeader;
    private _encodeContinuationToken;
    private _decodeContinuationToken;
    private _extractCommonPrefix;
    private _calculateMetadataSize;
    private _validateLimits;
    put(key: string, params: StoragePutParams): Promise<PutObjectResponse>;
    get(key: string): Promise<S3Object>;
    head(key: string): Promise<Omit<S3Object, 'Body'>>;
    copy(from: string, to: string, params: StorageCopyParams): Promise<CopyObjectResponse>;
    exists(key: string): boolean;
    delete(key: string): Promise<DeleteObjectResponse>;
    deleteMultiple(keys: string[]): Promise<DeleteObjectsResponse>;
    list(params: StorageListParams): Promise<ListObjectsResponse>;
    snapshot(): StorageSnapshot;
    restore(snapshot: StorageSnapshot): void;
    saveToDisk(customPath?: string): Promise<string>;
    loadFromDisk(customPath?: string): Promise<StorageSnapshot>;
    getStats(): MemoryStorageStats;
    getKeys(): string[];
    private _formatBytes;
    private _trackMemory;
    private _touchKey;
    private _evictIfNeeded;
    clear(): void;
    resetStats(): void;
}

interface CommandInput$1 {
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
interface Command$1 {
    constructor: {
        name: string;
    };
    input?: CommandInput$1;
}
declare class MemoryClient extends EventEmitter {
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
    sendCommand(command: Command$1): Promise<unknown>;
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

declare class FileSystemStorage {
    private basePath;
    private bucket;
    private enforceLimits;
    private metadataLimit;
    private maxObjectSize;
    private logLevel;
    private enableCompression;
    private compressionThreshold;
    private compressionLevel;
    private enableTTL;
    private defaultTTL;
    private cleanupInterval;
    private enableLocking;
    private lockTimeout;
    private enableBackup;
    private backupSuffix;
    private enableJournal;
    private journalFile;
    private enableStats;
    private isWindows;
    private locks;
    private stats;
    private logger;
    private cronManager;
    private cleanupJobName;
    constructor(config?: FileSystemStorageConfig);
    private _keyToPath;
    private _pathToKey;
    private _getObjectPath;
    private _getMetadataPath;
    private _ensureDirectory;
    private _generateETag;
    private _toBuffer;
    private _formatEtag;
    private _normalizeEtagHeader;
    private _encodeContinuationToken;
    private _decodeContinuationToken;
    private _extractCommonPrefix;
    private _calculateMetadataSize;
    private _validateLimits;
    private _writeAtomic;
    private _readMetadata;
    private _writeMetadata;
    private _initCleanup;
    private _runCleanup;
    private _acquireLock;
    private _releaseLock;
    private _journalOperation;
    private _createBackup;
    private _compressBody;
    private _decompressBody;
    getStats(): FileSystemStorageStats | null;
    private _mapFilesystemError;
    put(key: string, params: StoragePutParams & {
        ttl?: number;
    }): Promise<PutObjectResponse>;
    get(key: string): Promise<S3Object>;
    head(key: string): Promise<Omit<S3Object, 'Body'>>;
    copy(from: string, to: string, params: StorageCopyParams): Promise<CopyObjectResponse>;
    delete(key: string): Promise<DeleteObjectResponse>;
    deleteMultiple(keys: string[]): Promise<DeleteObjectsResponse>;
    private _walkDirectory;
    list(params: StorageListParams): Promise<ListObjectsResponse>;
    exists(key: string): boolean;
    clear(): Promise<void>;
    destroy(): void;
}

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
declare class FileSystemClient extends EventEmitter {
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

/**
 * S3DB Error Classes
 *
 * Typed error hierarchy for s3db.js operations.
 */

/** Base error context for all S3DB errors */
interface BaseErrorContext {
    verbose?: boolean;
    bucket?: string;
    key?: string;
    message?: string;
    code?: string;
    statusCode?: number;
    requestId?: string;
    awsMessage?: string;
    original?: Error | unknown;
    commandName?: string;
    commandInput?: unknown;
    metadata?: StringRecord$1;
    description?: string;
    suggestion?: string;
    retriable?: boolean;
    docs?: string;
    title?: string;
    hint?: string;
    [key: string]: unknown;
}
/** Serialized error format */
interface SerializedError {
    name: string;
    message: string;
    code?: string;
    statusCode?: number;
    requestId?: string;
    awsMessage?: string;
    bucket?: string;
    key?: string;
    thrownAt?: Date;
    retriable?: boolean;
    suggestion?: string;
    docs?: string;
    title?: string;
    hint?: string;
    commandName?: string;
    commandInput?: unknown;
    metadata?: StringRecord$1;
    description?: string;
    data?: StringRecord$1;
    original?: unknown;
    stack?: string;
}
declare class BaseError extends Error {
    bucket?: string;
    key?: string;
    thrownAt: Date;
    code?: string;
    statusCode: number;
    requestId?: string;
    awsMessage?: string;
    original?: Error | unknown;
    commandName?: string;
    commandInput?: unknown;
    metadata?: StringRecord$1;
    description?: string;
    suggestion?: string;
    retriable: boolean;
    docs?: string;
    title: string;
    hint?: string;
    data: StringRecord$1;
    constructor(context: BaseErrorContext);
    toJSON(): SerializedError;
    toString(): string;
}
/** AWS Error with $metadata */
interface AwsErrorLike {
    code?: string;
    Code?: string;
    name?: string;
    message?: string;
    statusCode?: number;
    requestId?: string;
    stack?: string;
    $metadata?: {
        httpStatusCode?: number;
        requestId?: string;
        [key: string]: unknown;
    };
}
/** S3DB Error details */
interface S3dbErrorDetails {
    bucket?: string;
    key?: string;
    original?: AwsErrorLike | Error | unknown;
    statusCode?: number;
    retriable?: boolean;
    suggestion?: string;
    description?: string;
    [key: string]: unknown;
}
declare class S3dbError extends BaseError {
    constructor(message: string, details?: S3dbErrorDetails);
}
declare class DatabaseError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
declare class ValidationError extends S3dbError {
    field?: string;
    value?: unknown;
    constraint?: string;
    constructor(message: string, details?: S3dbErrorDetails & {
        field?: string;
        value?: unknown;
        constraint?: string;
    });
}
declare class AuthenticationError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
declare class PermissionError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
declare class EncryptionError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
interface ResourceNotFoundDetails extends S3dbErrorDetails {
    bucket: string;
    resourceName: string;
    id: string;
}
declare class ResourceNotFound extends S3dbError {
    resourceName: string;
    id: string;
    constructor(details: ResourceNotFoundDetails);
}
interface NoSuchBucketDetails extends S3dbErrorDetails {
    bucket: string;
}
declare class NoSuchBucket extends S3dbError {
    constructor(details: NoSuchBucketDetails);
}
interface NoSuchKeyDetails extends S3dbErrorDetails {
    bucket: string;
    key: string;
    resourceName?: string;
    id?: string;
}
declare class NoSuchKey extends S3dbError {
    resourceName?: string;
    id?: string;
    constructor(details: NoSuchKeyDetails);
}
declare class NotFound extends S3dbError {
    resourceName?: string;
    id?: string;
    constructor(details: NoSuchKeyDetails);
}
declare class MissingMetadata extends S3dbError {
    constructor(details: NoSuchBucketDetails);
}
interface InvalidResourceItemDetails extends S3dbErrorDetails {
    bucket: string;
    resourceName: string;
    attributes?: unknown;
    validation?: unknown;
    message?: string;
}
declare class InvalidResourceItem extends S3dbError {
    constructor(details: InvalidResourceItemDetails);
}
declare class UnknownError extends S3dbError {
}
declare const ErrorMap: {
    readonly NotFound: typeof NotFound;
    readonly NoSuchKey: typeof NoSuchKey;
    readonly UnknownError: typeof UnknownError;
    readonly NoSuchBucket: typeof NoSuchBucket;
    readonly MissingMetadata: typeof MissingMetadata;
    readonly InvalidResourceItem: typeof InvalidResourceItem;
};
interface MapAwsErrorContext {
    bucket?: string;
    key?: string;
    resourceName?: string;
    id?: string;
    operation?: string;
    commandName?: string;
    commandInput?: unknown;
    retriable?: boolean;
}
declare function mapAwsError(err: AwsErrorLike | Error, context?: MapAwsErrorContext): S3dbError;
declare class ConnectionStringError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
declare class CryptoError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
declare class SchemaError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
declare class ResourceError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
interface PartitionErrorDetails extends S3dbErrorDetails {
    resourceName?: string;
    partitionName?: string;
    fieldName?: string;
    availableFields?: string[];
    strictValidation?: boolean;
}
declare class PartitionError extends S3dbError {
    constructor(message: string, details?: PartitionErrorDetails);
}
interface PluginErrorDetails extends S3dbErrorDetails {
    pluginName?: string;
    operation?: string;
}
declare class PluginError extends S3dbError {
    pluginName: string;
    operation: string;
    constructor(message: string, details?: PluginErrorDetails);
}
interface PluginStorageErrorDetails extends S3dbErrorDetails {
    pluginSlug?: string;
    key?: string;
    operation?: string;
}
declare class PluginStorageError extends S3dbError {
    constructor(message: string, details?: PluginStorageErrorDetails);
}
interface PartitionDriverErrorDetails extends S3dbErrorDetails {
    driver?: string;
    operation?: string;
    queueSize?: number;
    maxQueueSize?: number;
}
declare class PartitionDriverError extends S3dbError {
    constructor(message: string, details?: PartitionDriverErrorDetails);
}
interface BehaviorErrorDetails extends S3dbErrorDetails {
    behavior?: string;
    availableBehaviors?: string[];
}
declare class BehaviorError extends S3dbError {
    constructor(message: string, details?: BehaviorErrorDetails);
}
interface StreamErrorDetails extends S3dbErrorDetails {
    operation?: string;
    resource?: string;
}
declare class StreamError extends S3dbError {
    constructor(message: string, details?: StreamErrorDetails);
}
interface MetadataLimitErrorDetails extends S3dbErrorDetails {
    totalSize?: number;
    effectiveLimit?: number;
    absoluteLimit?: number;
    excess?: number;
    resourceName?: string;
    operation?: string;
}
declare class MetadataLimitError extends S3dbError {
    constructor(message: string, details?: MetadataLimitErrorDetails);
}
interface AnalyticsNotEnabledErrorDetails extends S3dbErrorDetails {
    pluginName?: string;
    resourceName?: string;
    field?: string;
    configuredResources?: string[];
    registeredResources?: string[];
    pluginInitialized?: boolean;
}
declare class AnalyticsNotEnabledError extends S3dbError {
    constructor(details?: AnalyticsNotEnabledErrorDetails);
}

/** Result tuple type for tryFn */
type TryResult<T> = [ok: true, err: null, data: T] | [ok: false, err: Error, data: undefined];
/**
 * tryFn - A robust error handling utility for JavaScript functions and values.
 *
 * This utility provides a consistent way to handle errors and return values across different types:
 * - Synchronous functions
 * - Asynchronous functions (Promises)
 * - Direct values
 * - Promises
 * - null/undefined values
 */
declare function tryFn<T>(fnOrPromise: null | undefined): TryResult<T>;
declare function tryFn<T>(fnOrPromise: () => Promise<T>): Promise<TryResult<Awaited<T>>>;
declare function tryFn<T>(fnOrPromise: Promise<T>): Promise<TryResult<Awaited<T>>>;
declare function tryFn<T>(fnOrPromise: () => T): TryResult<T>;
declare function tryFn<T>(fnOrPromise: T): TryResult<T>;
/**
 * Synchronous version of tryFn for cases where you know the function is synchronous
 */
declare function tryFnSync<T>(fn: () => T): TryResult<T>;

declare function encrypt(content: string, passphrase: string): Promise<string>;
declare function decrypt(encryptedBase64: string, passphrase: string): Promise<string>;

declare function initializeNanoid(): Promise<void>;
declare const idGenerator: (size?: number) => string;
declare const passwordGenerator: (size?: number) => string;
declare const createCustomGenerator: (alphabet: string, size: number) => ((size?: number) => string);

declare const encode: (n: number) => string;
declare const decode: (s: string) => number;
declare const encodeDecimal: (n: number) => string;
declare const decodeDecimal: (s: string) => number;

/**
 * Encode Buffer to Base64 string
 */
declare function encodeBuffer(buffer: Buffer | Uint8Array | null | undefined): string | null;
/**
 * Decode Base64 string back to Buffer
 */
declare function decodeBuffer(encoded: string | null | undefined): Buffer | null;
/**
 * Encode a bitmap (Buffer) with optional size validation
 */
declare function encodeBits(buffer: Buffer | Uint8Array | null | undefined, expectedBits?: number | null, skipValidation?: boolean): string | null;
/**
 * Decode Base64 string back to bitmap Buffer
 */
declare function decodeBits(encoded: string | null | undefined, expectedBits?: number | null, skipValidation?: boolean): Buffer | null;

interface MapWithConcurrencyOptions<T> {
    concurrency?: number;
    onError?: ((error: Error, item: T) => void | Promise<void>) | null;
}
interface MapWithConcurrencyError<T> {
    item: T;
    index: number;
    message: string;
    raw: Error;
}
interface MapWithConcurrencyResult<T, R> {
    results: R[];
    errors: MapWithConcurrencyError<T>[];
}
declare function mapWithConcurrency<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, options?: MapWithConcurrencyOptions<T>): Promise<MapWithConcurrencyResult<T, R>>;

declare const behaviors: Record<BehaviorName, Behavior>;
declare function getBehavior(behaviorName: string): Behavior;
declare const AVAILABLE_BEHAVIORS: BehaviorName[];
declare const DEFAULT_BEHAVIOR: BehaviorName;

type TaskFunction$1<T> = () => Promise<T>;
interface EnqueueOptions$2 {
    priority?: number;
    retries?: number;
    timeout?: number;
    metadata?: Record<string, unknown>;
}
interface ProcessOptions$1<T = unknown> {
    onSuccess?: (item: T, result: unknown) => void;
    onError?: (item: T, error: Error) => void;
    priority?: number;
    retries?: number;
    timeout?: number;
    totalCount?: number;
    [key: string]: unknown;
}
interface ProcessResult$1<T> {
    results: T[];
    errors: (Error | {
        item?: unknown;
        error?: Error;
        index?: number;
    })[];
}
declare abstract class TaskExecutor {
    abstract setConcurrency(concurrency: number): void;
    abstract getConcurrency(): number | 'auto';
    abstract enqueue<T>(fn: TaskFunction$1<T>, options?: EnqueueOptions$2): Promise<T>;
    abstract process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: ProcessOptions$1<T>): Promise<ProcessResult$1<R>>;
    abstract pause(): void;
    abstract resume(): void;
    abstract stop(): void;
    abstract destroy(): Promise<void>;
    abstract getStats(): Record<string, unknown>;
}

interface AdaptiveTuningOptions {
    minConcurrency?: number;
    maxConcurrency?: number;
    targetLatency?: number;
    targetMemoryPercent?: number;
    adjustmentInterval?: number;
}
interface TaskMetrics {
    latency: number;
    queueWait: number;
    success: boolean;
    retries: number;
    heapDelta: number;
}
interface ConcurrencyAdjustment {
    timestamp: number;
    old: number;
    new: number;
    reason: string;
    metrics: {
        avgLatency: number;
        avgMemory: number;
        avgThroughput: number;
    };
}
interface AdaptiveMetrics {
    latencies: number[];
    throughputs: number[];
    memoryUsages: number[];
    errorRates: number[];
    concurrencyHistory: ConcurrencyAdjustment[];
}
interface MetricsSummary {
    current: number;
    avgLatency: number;
    avgMemory: number;
    avgThroughput: number;
    history: ConcurrencyAdjustment[];
}
declare class AdaptiveTuning {
    minConcurrency: number;
    maxConcurrency: number;
    targetLatency: number;
    targetMemoryPercent: number;
    adjustmentInterval: number;
    metrics: AdaptiveMetrics;
    currentConcurrency: number;
    lastAdjustment: number;
    intervalId: ReturnType<typeof setInterval> | null;
    constructor(options?: AdaptiveTuningOptions);
    suggestInitial(): number;
    recordTaskMetrics(task: TaskMetrics): void;
    startMonitoring(): void;
    adjust(): number | null;
    getConcurrency(): number;
    getMetrics(): MetricsSummary;
    stop(): void;
    private _avg;
}

interface SignatureStatsOptions {
    alpha?: number;
    maxEntries?: number;
}
interface SignatureEntry {
    signature: string;
    count: number;
    avgQueueWait: number;
    avgExecution: number;
    successRate: number;
}
interface SignatureMetrics {
    queueWait?: number;
    execution?: number;
    success?: boolean;
}
interface SignatureSnapshot {
    signature: string;
    count: number;
    avgQueueWait: number;
    avgExecution: number;
    successRate: number;
}
declare class SignatureStats {
    alpha: number;
    maxEntries: number;
    entries: Map<string, SignatureEntry>;
    constructor(options?: SignatureStatsOptions);
    record(signature: string, metrics?: SignatureMetrics): void;
    snapshot(limit?: number): SignatureSnapshot[];
    reset(): void;
    private _mix;
}

declare class FifoTaskQueue<T = unknown> {
    buffer: Array<T | undefined>;
    mask: number;
    head: number;
    tail: number;
    constructor(capacity?: number);
    get length(): number;
    enqueue(value: T): void;
    dequeue(): T | null;
    flush(callback?: (item: T) => void): void;
    clear(): void;
    setAgingMultiplier(_multiplier?: number): void;
    toArray(): T[];
    private _grow;
    private _normalizeCapacity;
}

interface PriorityTaskQueueOptions {
    agingMs?: number;
    maxAgingBoost?: number;
}
interface PriorityNode<T = unknown> {
    task: T;
    priority: number;
    order: number;
    enqueuedAt?: number;
}
interface TaskWithPriority {
    priority?: number;
}
declare class PriorityTaskQueue<T extends TaskWithPriority = TaskWithPriority> {
    heap: PriorityNode<T>[];
    counter: number;
    agingMs: number;
    maxAgingBoost: number;
    agingMultiplier: number;
    private _agingEnabled;
    constructor(options?: PriorityTaskQueueOptions);
    get length(): number;
    enqueue(task: T): void;
    dequeue(): T | null;
    flush(callback?: (task: T) => void): void;
    clear(): void;
    setAgingMultiplier(multiplier: number): void;
    private _bubbleUp;
    private _bubbleDown;
    private _isHigherPriority;
    private _priorityValue;
    private _swap;
    private _agingTimestamp;
    private _agingBase;
}

interface TaskContext {
    id: string;
    attempt: number;
    retries: number;
    metadata: Record<string, unknown>;
    signal?: AbortSignal;
}
type TaskFunction<T = unknown> = (context: TaskContext) => Promise<T>;
interface TaskPoolOptions {
    concurrency?: number | 'auto';
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    retryableErrors?: string[];
    autoTuning?: {
        enabled?: boolean;
        instance?: AdaptiveTuning;
        targetLatency?: number;
        [key: string]: unknown;
    };
    monitoring?: {
        enabled?: boolean;
        collectMetrics?: boolean;
        sampleRate?: number;
        telemetrySampleRate?: number;
        sampleInterval?: number;
        rollingWindowMs?: number;
        reportInterval?: number;
        signatureSampleLimit?: number;
        signatureAlpha?: number;
        signatureMaxEntries?: number;
        mode?: 'light' | 'passive' | 'detailed' | 'full' | 'balanced';
        exporter?: (snapshot: MonitoringSnapshot$1) => void;
    };
    features?: {
        profile?: 'bare' | 'light' | 'balanced';
        emitEvents?: boolean;
        signatureInsights?: boolean;
    };
    retryStrategy?: {
        jitter?: boolean;
        minDelay?: number;
        maxDelay?: number;
        clampDelay?: number;
        pressureClampThreshold?: number;
        pressureSkipThreshold?: number;
        latencyTarget?: number;
    };
    queue?: {
        agingMs?: number;
        maxAgingBoost?: number;
        latencyTarget?: number;
    };
}
interface EnqueueOptions$1 {
    priority?: number;
    retries?: number;
    timeout?: number;
    metadata?: Record<string, unknown>;
    signature?: string;
    [key: string]: unknown;
}
interface BatchOptions extends EnqueueOptions$1 {
    onItemComplete?: (result: unknown, index: number) => void;
    onItemError?: (error: Error, index: number) => void;
}
interface BatchResult<T = unknown> {
    results: (T | null)[];
    errors: Array<{
        error: Error;
        index: number;
    }>;
    batchId: string;
}
interface TaskTimings {
    queueWait: number | null;
    execution: number | null;
    retryDelays: number[] | null;
    retryDelayTotal: number;
    total: number | null;
    failedAttempts: Array<{
        attempt: number;
        duration: number;
        error: string;
    }> | null;
    overhead?: number;
}
interface TaskPerformance {
    heapUsedBefore: number | null;
    heapUsedAfter: number | null;
    heapDelta: number | null;
}
interface PoolTask<T = unknown> {
    id: string;
    fn: TaskFunction<T>;
    priority: number;
    retries: number;
    timeout: number;
    metadata: Record<string, unknown>;
    attemptCount: number;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    collectMetrics: boolean;
    timings: TaskTimings;
    controller: AbortController | null;
    delayController?: AbortController | null;
    performance: TaskPerformance;
    signature: string;
    promise: Promise<T>;
    resolve: (result: T) => void;
    reject: (error: Error) => void;
}
interface PoolStats {
    queueSize: number;
    activeCount: number;
    processedCount: number;
    errorCount: number;
    retryCount: number;
}
interface RollingMetricsSnapshot$1 {
    sampleSize: number;
    avgQueueWait: number;
    avgExecution: number;
    avgRetries: number;
    errorRate: number;
}
interface ThroughputSnapshot {
    windowMs: number;
    throughputPerSec: number;
    successRate: number;
}
interface RollingMetricsResult {
    samples: RollingMetricsSnapshot$1 | null;
    throughput: ThroughputSnapshot | null;
}
interface AggregateMetrics$1 {
    count: number;
    avgQueueWait: number;
    avgExecution: number;
    avgTotal: number;
    p50Execution: number;
    p95Execution: number;
    p99Execution: number;
    avgHeapDelta: number;
    errorRate: number;
    avgRetries: number;
    autoTuning: unknown;
}
interface MonitoringSnapshot$1 {
    timestamp: number;
    stage: string;
    profile: string;
    queueSize: number;
    activeCount: number;
    processed: number;
    errors: number;
    retries: number;
    throughput: number;
    signatureInsights: unknown[];
}
interface TaskMetricsEntry {
    id: string;
    metadata: Record<string, unknown>;
    timings: TaskTimings;
    performance: TaskPerformance;
    attemptCount: number;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    success: boolean;
}
interface RollingMetricsEntry {
    queueWait: number;
    execution: number;
    retries: number;
    success: boolean;
}
declare class MemorySampler {
    interval: number;
    lastSampleTime: number;
    lastSample: {
        heapUsed: number;
    };
    constructor(interval?: number);
    snapshot(): number;
    maybeSample(): number;
    sampleNow(): number;
}
declare class RollingMetrics {
    size: number;
    entries: Array<RollingMetricsEntry | undefined>;
    index: number;
    length: number;
    sums: {
        queueWait: number;
        execution: number;
        retries: number;
    };
    errorCount: number;
    constructor(size?: number);
    push(entry: RollingMetricsEntry): void;
    snapshot(): RollingMetricsSnapshot$1;
}
declare class RollingWindow {
    windowMs: number;
    events: Array<{
        timestamp: number;
        success: boolean;
    }>;
    constructor(windowMs?: number);
    record(timestamp?: number, success?: boolean): void;
    snapshot(): ThroughputSnapshot;
    private _prune;
}
declare class TasksPool extends EventEmitter$1 implements TaskExecutor {
    features: {
        profile: string;
        emitEvents: boolean;
        signatureInsights: boolean;
    };
    lightMode: boolean;
    bareMode: boolean;
    autoConcurrency: boolean;
    retries: number;
    retryDelay: number;
    timeout: number;
    retryableErrors: string[];
    retryStrategy: {
        jitter: boolean;
        minDelay: number;
        maxDelay: number;
        clampDelay: number;
        pressureClampThreshold: number;
        pressureSkipThreshold: number;
        latencyTarget: number;
    };
    priorityConfig: {
        agingMs: number;
        maxAgingBoost: number;
        latencyTarget: number;
    };
    queue: FifoTaskQueue<PoolTask> | PriorityTaskQueue<PoolTask>;
    active: Map<Promise<unknown>, PoolTask>;
    paused: boolean;
    stopped: boolean;
    stats: PoolStats;
    rollingMetrics: RollingMetrics;
    monitoring: {
        enabled: boolean;
        mode: string;
        collectMetrics: boolean;
        sampleRate: number;
        telemetryRate: number;
        sampleInterval: number;
        rollingWindowMs: number;
        reportInterval: number;
        signatureSampleLimit: number;
        exporter: ((snapshot: MonitoringSnapshot$1) => void) | null;
    };
    taskMetrics: Map<string, TaskMetricsEntry>;
    memorySampler: MemorySampler | null;
    rollingWindow: RollingWindow | null;
    signatureStats: SignatureStats | null;
    tuner: AdaptiveTuning | null;
    autoTuningConfig?: Record<string, unknown>;
    private _configuredConcurrency;
    private _effectiveConcurrency;
    private _drainInProgress;
    private _pendingDrain;
    private _activeWaiters;
    private _lightActiveTasks;
    private _monitoringState;
    private _lastTunedConcurrency;
    constructor(options?: TaskPoolOptions);
    private _normalizeConcurrency;
    get concurrency(): number | 'auto';
    get effectiveConcurrency(): number;
    private _defaultAutoConcurrency;
    private _normalizeSampleRate;
    private _shouldSampleMetrics;
    private _shouldCaptureAttemptTimeline;
    setTuner(tuner: AdaptiveTuning): void;
    enqueue<T = unknown>(fn: TaskFunction<T>, options?: EnqueueOptions$1): Promise<T>;
    addBatch<T = unknown>(fns: Array<TaskFunction<T>>, options?: BatchOptions): Promise<BatchResult<T>>;
    /**
     * Process an array of items with controlled concurrency.
     * This is a convenience method that mimics PromisePool.for().process() API.
     *
     * @example
     * const { results, errors } = await TasksPool.map(
     *   users,
     *   async (user) => fetchUserData(user.id),
     *   { concurrency: 10 }
     * );
     */
    static map<T, R>(items: T[], processor: (item: T, index: number) => Promise<R>, options?: {
        concurrency?: number;
        onItemComplete?: (result: R, index: number) => void;
        onItemError?: (error: Error, item: T, index: number) => void;
    }): Promise<{
        results: R[];
        errors: Array<{
            error: Error;
            item: T;
            index: number;
        }>;
    }>;
    processNext(): void;
    private _drainQueue;
    private _canProcessNext;
    private _processLightQueue;
    private _processBareQueue;
    private _executeTaskWithRetry;
    private _runSingleAttempt;
    private _executeBareTask;
    private _executeWithTimeout;
    private _isErrorRetryable;
    private _insertByPriority;
    private _recordTaskCompletion;
    private _storeTaskMetrics;
    private _recordRollingMetrics;
    pause(): Promise<void>;
    resume(): void;
    stop(): void;
    drain(): Promise<void>;
    private _waitForActive;
    private _notifyActiveWaiters;
    setConcurrency(n: number | 'auto'): void;
    getConcurrency(): number | 'auto';
    getStats(): Record<string, unknown>;
    getTaskMetrics(taskId: string): TaskMetricsEntry | undefined;
    getRollingMetrics(): RollingMetricsResult;
    getSignatureInsights(limit?: number): unknown[];
    getAggregateMetrics(since?: number): AggregateMetrics$1 | null;
    private _avg;
    private _percentile;
    private _sleep;
    private _buildTaskContext;
    private _readHeapUsage;
    private _computeHeapDelta;
    private _shouldEnforceTimeout;
    private _computeRetryDelay;
    private _isTransientNetworkError;
    private _latencyTargetMs;
    private _syncQueueAging;
    private _safeEmit;
    private _currentActiveCount;
    private _maybeExportMonitoringSample;
    private _applyTunedConcurrency;
    process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: {
        onSuccess?: (item: T, result: R) => void;
        onError?: (item: T, error: Error) => void;
        priority?: number;
        retries?: number;
        timeout?: number;
        totalCount?: number;
        [key: string]: unknown;
    }): Promise<{
        results: R[];
        errors: (Error | {
            item?: T;
            error?: Error;
            index?: number;
        })[];
    }>;
    destroy(): Promise<void>;
}

interface RunnerOptions {
    concurrency?: number;
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    retryableErrors?: string[];
    priority?: boolean;
    autoTuning?: {
        enabled?: boolean;
        instance?: AdaptiveTuning;
        [key: string]: unknown;
    };
    monitoring?: {
        enabled?: boolean;
        collectMetrics?: boolean;
        sampleRate?: number;
        maxSamples?: number;
        rollingWindowMs?: number;
        reportInterval?: number;
        telemetrySampleRate?: number;
        signatureSampleLimit?: number;
        signatureAlpha?: number;
        signatureMaxEntries?: number;
        mode?: 'light' | 'passive' | 'detailed';
        exporter?: (snapshot: MonitoringSnapshot) => void;
    };
    features?: {
        profile?: 'bare' | 'light' | 'balanced';
        emitEvents?: boolean;
        trackProcessedItems?: boolean;
        signatureInsights?: boolean;
    };
}
interface EnqueueOptions {
    priority?: number;
    retries?: number;
    timeout?: number;
    metadata?: Record<string, unknown>;
    signature?: string;
}
interface ProcessOptions<T = unknown> extends EnqueueOptions {
    onProgress?: (item: T, stats: ProgressStats) => void;
    onItemComplete?: (item: T, result: unknown) => void;
    onItemError?: (item: T, error: Error) => void;
    totalCount?: number;
}
interface ProgressStats {
    processedCount: number;
    totalCount: number | null;
    percentage: string | null;
}
interface ProcessResult<T = unknown> {
    results: T[];
    errors: Array<{
        item: unknown;
        error: Error;
        index: number;
    }>;
}
interface RunnerStats {
    queueSize: number;
    activeCount: number;
    processedCount: number;
    errorCount: number;
    retryCount: number;
}
interface RollingMetricsSnapshot {
    sampleSize: number;
    avgQueueWait: number;
    avgExecution: number;
    avgRetries: number;
    errorRate: number;
}
interface AggregateMetrics {
    count: number;
    avgQueueWait: number;
    avgExecution: number;
    avgTotal: number;
    p50Execution: number;
    p95Execution: number;
    p99Execution: number;
    errorRate: number;
    avgRetries: number;
}
interface ProgressInfo {
    total: number;
    completed: number;
    pending: number;
    active: number;
    percentage: string | number;
}
interface MonitoringSnapshot {
    timestamp: number;
    stage: string;
    profile: string;
    queueSize: number;
    activeCount: number;
    processed: number;
    errors: number;
    retries: number;
    throughput: number;
    signatureInsights: unknown[];
}
interface TaskTelemetry {
    enqueuedAt: number;
    startedAt?: number;
    failedAttempts: Array<{
        attempt: number;
        duration: number;
        errorName: string;
        errorMessage: string;
    }>;
}
interface TaskMetricEntry {
    id: string;
    completedAt: number;
    success: boolean;
    attemptCount: number;
    timings: {
        queueWait: number;
        execution: number;
        total: number;
        failedAttempts: Array<{
            attempt: number;
            duration: number;
            errorName: string;
            errorMessage: string;
        }>;
    };
    performance: Record<string, unknown>;
    error: {
        name: string;
        message: string;
    } | null;
}
interface RunnerTask<T = unknown> {
    id: string;
    fn: () => Promise<T>;
    priority: number;
    retries: number;
    timeout: number;
    metadata: Record<string, unknown>;
    attemptCount: number;
    createdAt: number;
    signature: string;
    promise: Promise<T>;
    resolve: (result: T) => void;
    reject: (error: Error) => void;
    telemetry?: TaskTelemetry;
}
declare class TasksRunner extends EventEmitter$1 implements TaskExecutor {
    static notRun: symbol;
    static failed: symbol;
    features: {
        profile: string;
        emitEvents: boolean;
        trackProcessedItems: boolean;
        signatureInsights: boolean;
    };
    lightMode: boolean;
    bareMode: boolean;
    concurrency: number;
    retries: number;
    retryDelay: number;
    timeout: number;
    retryableErrors: string[];
    active: Set<Promise<unknown>>;
    paused: boolean;
    stopped: boolean;
    stats: RunnerStats;
    processedItems: unknown[] | null;
    taskMetrics: Map<string, TaskMetricEntry>;
    monitoring: {
        enabled: boolean;
        mode: string;
        collectMetrics: boolean;
        sampleRate: number;
        maxSamples: number;
        rollingWindowMs: number;
        reportInterval: number;
        telemetryRate: number;
        signatureSampleLimit: number;
        exporter: ((snapshot: MonitoringSnapshot) => void) | null;
    };
    signatureStats: SignatureStats | null;
    tuner: AdaptiveTuning | null;
    autoTuningConfig?: Record<string, unknown>;
    private _queue;
    private _activeWaiters;
    private _activeLightTasks;
    private _taskMetricsOrder;
    private _monitoringState;
    private _lastTunedConcurrency;
    constructor(options?: RunnerOptions);
    get queue(): RunnerTask[];
    process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: ProcessOptions<T>): Promise<ProcessResult<R>>;
    enqueue<T = unknown>(fn: () => Promise<T>, options?: EnqueueOptions): Promise<T>;
    processIterable<T, R>(iterable: Iterable<T> | AsyncIterable<T>, processor: (item: T, index: number, runner: TasksRunner) => Promise<R>, options?: ProcessOptions<T>): Promise<ProcessResult<R>>;
    processCorresponding<T, R>(items: T[], processor: (item: T, index: number, runner: TasksRunner) => Promise<R>, options?: ProcessOptions<T>): Promise<Array<R | typeof TasksRunner.failed | typeof TasksRunner.notRun>>;
    processNext(): void;
    private _processLightQueue;
    private _processBareQueue;
    private _currentActiveCount;
    private _maybeExportMonitoringSample;
    private _executeTaskWithRetry;
    private _runSingleAttempt;
    private _executeBareTask;
    private _shouldEnforceTimeout;
    private _executeWithTimeout;
    private _isErrorRetryable;
    private _insertByPriority;
    private _waitForSlot;
    private _waitForActive;
    private _notifyActiveWaiters;
    private _sleep;
    private _primeTaskTelemetry;
    private _markTaskDequeued;
    private _shouldSampleMetrics;
    private _shouldTrackTelemetry;
    private _storeTaskMetric;
    private _recordTaskMetrics;
    pause(): Promise<void>;
    resume(): void;
    stop(): void;
    drain(): Promise<void>;
    setConcurrency(n: number): void;
    getConcurrency(): number;
    getStats(): Record<string, unknown>;
    getRollingMetrics(): RollingMetricsSnapshot | null;
    getSignatureInsights(limit?: number): unknown[];
    getAggregateMetrics(since?: number): AggregateMetrics | null;
    getProgress(): ProgressInfo;
    reset(): void;
    destroy(): Promise<void>;
    private _safeEmit;
    private _applyTunedConcurrency;
    private _normalizeSampleRate;
    private _avg;
    private _percentile;
    static process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: RunnerOptions & ProcessOptions<T>): Promise<ProcessResult<R>>;
    static withConcurrency(concurrency: number): TasksRunner;
}

interface BenchmarkResult {
    duration: number;
    timestamp: number;
}
interface BenchmarkStats {
    iterations: number;
    results: number[];
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
}
declare class Benchmark {
    name: string;
    startTime: number | null;
    endTime: number | null;
    results: BenchmarkResult[];
    constructor(name: string);
    start(): void;
    end(): number;
    elapsed(): number;
    measure<T>(fn: () => Promise<T>): Promise<T>;
    measureRepeated(fn: () => Promise<unknown>, iterations?: number): Promise<BenchmarkStats>;
    percentile(arr: number[], p: number): number;
    report(): void;
}
declare function benchmark(name: string, fn: () => Promise<unknown>): Promise<Benchmark>;

interface TaskQueueStats {
    queueSize: number;
    activeCount: number;
    processedCount: number;
    errorCount: number;
    concurrency?: number;
    effectiveConcurrency?: number;
}
interface PerformanceMetrics {
    avgExecution: number;
    p95Execution: number;
}
interface SystemMetrics {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    uptime: number;
}
interface Snapshot {
    timestamp: number;
    taskQueue: TaskQueueStats | null;
    performance: PerformanceMetrics | null;
    system: SystemMetrics;
}
interface TaskQueueReport {
    totalProcessed: number;
    totalErrors: number;
    avgQueueSize: number;
    avgConcurrency: number;
}
interface PerformanceReport {
    avgLatency: number;
    p95Latency: number;
}
interface SystemReport {
    avgMemoryMB: number;
    peakMemoryMB: number;
}
interface MonitorReport {
    duration: number;
    snapshots: number;
    taskQueue: TaskQueueReport | null;
    performance: PerformanceReport | null;
    system: SystemReport;
}
interface DatabaseClient {
    getQueueStats?: () => TaskQueueStats;
    getAggregateMetrics?: () => PerformanceMetrics;
}
interface DatabaseLike {
    client?: DatabaseClient;
}
declare class PerformanceMonitor {
    db: DatabaseLike;
    snapshots: Snapshot[];
    intervalId: ReturnType<typeof setInterval> | null;
    constructor(database: DatabaseLike);
    start(intervalMs?: number): void;
    stop(): void;
    takeSnapshot(): Snapshot;
    getReport(): MonitorReport | null;
    private _avg;
}

export { AVAILABLE_BEHAVIORS, AdaptiveTuning, AnalyticsNotEnabledError, AuthenticationError, BaseError, BehaviorError, Benchmark, S3Client as Client, ConnectionString, ConnectionStringError, CryptoError, DEFAULT_BEHAVIOR, Database, DatabaseError, EncryptionError, ErrorMap, FileSystemClient, InvalidResourceItem, MemoryClient, MetadataLimitError, MissingMetadata, NoSuchBucket, NoSuchKey, NotFound, PartitionDriverError, PartitionError, PerformanceMonitor, PermissionError, PluginError, PluginStorageError, ProcessManager, Resource, ResourceError, ResourceIdsPageReader, ResourceIdsReader, ResourceNotFound, ResourceReader, ResourceWriter, S3Client, Database as S3db, S3dbError, SafeEventEmitter, Schema, SchemaError, StreamError, TaskExecutor, TasksPool, TasksRunner, UnknownError, ValidationError, Validator, behaviors, benchmark, createCustomGenerator, createLogger, createSafeEventEmitter, decode, decodeBits, decodeBuffer, decodeDecimal, decrypt, S3db as default, encode, encodeBits, encodeBuffer, encodeDecimal, encrypt, getBehavior, getProcessManager, idGenerator, initializeNanoid, mapAwsError, mapWithConcurrency, passwordGenerator, resetProcessManager, streamToString, tryFn, tryFnSync };
export type { AnalyticsNotEnabledErrorDetails, BaseErrorContext, BehaviorErrorDetails, InvalidResourceItemDetails, LogLevel$1 as LogLevel, MapAwsErrorContext, MetadataLimitErrorDetails, NoSuchBucketDetails, NoSuchKeyDetails, PartitionDriverErrorDetails, PartitionErrorDetails, PluginErrorDetails, PluginStorageErrorDetails, ResourceNotFoundDetails, S3dbErrorDetails, SchemaRegistry, SerializedError, StreamErrorDetails, TryResult };
