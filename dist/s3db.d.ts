import EventEmitter$1, { EventEmitter as EventEmitter$2 } from 'events';
import { Logger as Logger$j, TransportSingleOptions } from 'pino';
import * as FastestValidatorModule from 'fastest-validator';
import { ValidatorConstructorOptions } from 'fastest-validator';
import { Transform, TransformCallback, Writable, Readable } from 'stream';
import { ReadableStream as ReadableStream$1, ReadableStreamDefaultController, ReadableStreamDefaultReader } from 'node:stream/web';
import { S3Client as S3Client$5 } from '@aws-sdk/client-s3';
import { MiddlewareHandler as MiddlewareHandler$1, Context, Hono } from 'hono';
import { ChildProcess } from 'child_process';
import * as http from 'http';
import { Server, IncomingMessage, ServerResponse } from 'http';

interface CachedValidator {
    validator: unknown;
    refCount: number;
    createdAt: number;
    lastAccessedAt: number;
}
interface ValidatorOptions$1 {
    passphrase?: string;
    bcryptRounds?: number;
    allNestedObjectsOptional?: boolean;
}
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
declare function generateSchemaFingerprint(attributes: Record<string, unknown>, options?: ValidatorOptions$1): string;
declare function getCachedValidator(fingerprint: string): unknown | null;
declare function cacheValidator(fingerprint: string, validator: unknown): void;
declare function releaseValidator(fingerprint: string): void;
declare function evictUnusedValidators(maxAgeMs?: number): number;
declare function getCacheStats(): ValidatorCacheStats;
declare function clearValidatorCache(): void;
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

type LogLevel$3 = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
type LogFormat = 'json' | 'pretty';
interface LoggerOptions {
    level?: LogLevel$3;
    name?: string;
    format?: LogFormat;
    transport?: TransportSingleOptions;
    bindings?: Record<string, unknown>;
    redactPatterns?: RegExp[];
    maxPayloadBytes?: number;
}
interface S3DBLogger extends Logger$j {
    _maxPayloadBytes?: number;
}
type Logger$i = S3DBLogger;
declare function createLogger(options?: LoggerOptions): S3DBLogger;
declare function getGlobalLogger(options?: LoggerOptions): S3DBLogger;
declare function resetGlobalLogger(): void;
declare function getLoggerOptionsFromEnv(configOptions?: LoggerOptions): LoggerOptions;
declare function exampleUsage(): void;

interface AsyncEventEmitterOptions {
    logLevel?: LogLevel$3;
    logger?: S3DBLogger;
}
declare class AsyncEventEmitter extends EventEmitter$1 {
    private _asyncMode;
    logLevel: LogLevel$3;
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
type LogLevel$2 = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
/** Record with string keys */
type StringRecord$1<T = unknown> = Record<string, T>;
/** Event handler type */
type EventHandler$2<T = unknown> = (data: T) => void | Promise<void>;
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
interface ValidationResult$2 {
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
interface ValidationOptions$1 {
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
    validate(data: StringRecord$1, options?: ValidationOptions$1): Promise<ValidationResult$2>;
    preprocessAttributesForValidation(attributes: AttributesSchema): AttributesSchema;
    applyDefaults(data: StringRecord$1): StringRecord$1;
}

interface S3Object$1 {
    Key: string;
}
interface ListObjectsResponse$3 {
    Contents: S3Object$1[];
    NextContinuationToken?: string;
    IsTruncated: boolean;
}
interface S3ClientConfig$1 {
    keyPrefix: string;
}
interface S3Client$4 {
    parallelism: number;
    config: S3ClientConfig$1;
    listObjects(options: {
        prefix: string;
        continuationToken: string | null;
    }): Promise<ListObjectsResponse$3>;
}
interface Resource$o {
    name: string;
    client: S3Client$4;
}
interface ResourceIdsReaderOptions {
    resource: Resource$o;
}
declare class ResourceIdsReader extends EventEmitter$1 {
    resource: Resource$o;
    client: S3Client$4;
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

interface S3Client$3 {
    parallelism: number;
    config: {
        keyPrefix: string;
    };
    listObjects(options: {
        prefix: string;
        continuationToken: string | null;
    }): Promise<unknown>;
}
interface Resource$n {
    name: string;
    client: S3Client$3;
    get(id: string): Promise<Record<string, unknown>>;
}
interface ResourceReaderOptions {
    resource: Resource$n;
    batchSize?: number;
    concurrency?: number;
}
declare class ResourceReader extends EventEmitter$1 {
    resource: Resource$n;
    client: S3Client$3;
    batchSize: number;
    concurrency: number;
    input: ResourceIdsPageReader;
    transform: Transform;
    constructor({ resource, batchSize, concurrency }: ResourceReaderOptions);
    build(): this;
    _transform(chunk: string[], _encoding: BufferEncoding, callback: TransformCallback): Promise<void>;
    resume(): void;
}

interface S3Client$2 {
    parallelism: number;
    config: {
        keyPrefix: string;
    };
}
interface Resource$m {
    name: string;
    client: S3Client$2;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
interface ResourceWriterOptions {
    resource: Resource$m;
    batchSize?: number;
    concurrency?: number;
}
declare class ResourceWriter extends EventEmitter$1 {
    resource: Resource$m;
    client: S3Client$2;
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
    logger?: Logger$h | null;
    id?: string | null;
    AwsS3Client?: unknown;
    connectionString: string;
    httpClientOptions?: HttpClientOptions$1;
    taskExecutor?: boolean | TaskExecutorConfig;
    executorPool?: boolean | TaskExecutorConfig | null;
}
interface HttpClientOptions$1 {
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
interface Logger$h {
    debug: (obj: unknown, msg?: string) => void;
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
    trace?: (obj: unknown, msg?: string) => void;
}
interface MemoryClientConfig {
    id?: string;
    logLevel?: string;
    logger?: Logger$h;
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
    logger?: Logger$h;
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
    compression?: CompressionConfig$1;
    ttl?: TTLConfig;
    locking?: LockingConfig;
    backup?: BackupConfig;
    journal?: JournalConfig;
    stats?: StatsConfig;
}
interface CompressionConfig$1 {
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
    getStats?: () => QueueStats$2 | null;
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
interface QueueStats$2 {
    queueSize?: number;
    activeCount?: number;
    effectiveConcurrency?: number;
    [key: string]: unknown;
}
interface PutObjectParams$2 {
    key: string;
    metadata?: Record<string, unknown>;
    contentType?: string;
    body?: Buffer | string | Readable;
    contentEncoding?: string;
    contentLength?: number;
    ifMatch?: string;
    ifNoneMatch?: string;
}
interface CopyObjectParams$1 {
    from: string;
    to: string;
    metadata?: Record<string, unknown>;
    metadataDirective?: 'COPY' | 'REPLACE';
    contentType?: string;
}
interface ListObjectsParams$2 {
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
interface ListObjectsResponse$2 {
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
interface PutObjectResponse$2 {
    ETag: string;
    VersionId: string | null;
    ServerSideEncryption: string | null;
    Location: string;
}
interface CopyObjectResponse$1 {
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
interface StorageObjectData {
    body: Buffer;
    metadata: Record<string, string>;
    contentType: string;
    etag: string;
    lastModified: string;
    size: number;
    contentEncoding?: string;
    contentLength: number;
    compressed?: boolean;
    originalSize?: number;
    compressionRatio?: string;
    expiresAt?: number | null;
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
    logger?: Logger$h;
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
    logger?: Logger$h;
    compression?: CompressionConfig$1;
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
interface ReckerHttpHandlerOptions {
    connectTimeout?: number;
    headersTimeout?: number;
    bodyTimeout?: number;
    keepAliveTimeout?: number;
    keepAliveMaxTimeout?: number;
    connections?: number;
    pipelining?: number;
    http2?: boolean;
    http2MaxConcurrentStreams?: number;
    /** HTTP/2 preset: 'balanced' | 'performance' | 'low-latency' | 'low-memory' */
    http2Preset?: 'balanced' | 'performance' | 'low-latency' | 'low-memory';
    /** Enable Expect: 100-Continue for large uploads (bytes threshold or boolean) */
    expectContinue?: boolean | number;
    /** Enable HTTP/2 observability metrics */
    enableHttp2Metrics?: boolean;
    enableDedup?: boolean;
    enableCircuitBreaker?: boolean;
    circuitBreakerThreshold?: number;
    circuitBreakerResetTimeout?: number;
    enableRetry?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    maxRetryDelay?: number;
    retryJitter?: boolean;
    respectRetryAfter?: boolean;
}
interface CircuitStats {
    failures: number;
    lastFailureTime: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}
interface HandlerMetrics {
    requests: number;
    retries: number;
    deduped: number;
    circuitBreakerTrips: number;
    circuitStates?: Record<string, CircuitStats>;
    pendingDeduped?: number;
    /** HTTP/2 metrics (when enableHttp2Metrics is true) */
    http2?: {
        sessions: number;
        activeSessions: number;
        streams: number;
        activeStreams: number;
        errors: number;
    };
}
interface AwsHttpRequest {
    protocol?: string;
    hostname: string;
    port?: number;
    path: string;
    query?: Record<string, string | string[] | null | undefined>;
    method: string;
    headers: Record<string, string | undefined>;
    body?: unknown;
}
interface AwsHttpResponse {
    statusCode: number;
    reason?: string;
    headers: Record<string, string>;
    body?: Readable;
}
interface HandleOptions {
    abortSignal?: AbortSignal;
    requestTimeout?: number;
}
interface Client extends EventEmitter$1 {
    id: string;
    config: ClientConfig;
    connectionString: string;
    putObject(params: PutObjectParams$2): Promise<PutObjectResponse$2>;
    getObject(key: string): Promise<S3Object>;
    headObject(key: string): Promise<S3Object>;
    copyObject(params: CopyObjectParams$1): Promise<CopyObjectResponse$1>;
    exists(key: string): Promise<boolean>;
    deleteObject(key: string): Promise<DeleteObjectResponse>;
    deleteObjects(keys: string[]): Promise<DeleteObjectsResponse>;
    listObjects(params?: ListObjectsParams$2): Promise<ListObjectsResponse$2>;
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
    getQueueStats(): QueueStats$2 | null;
    getAggregateMetrics(since?: number): unknown | null;
    destroy(): void;
}

interface SchemaInfo {
    map?: StringRecord$1;
    pluginMap?: StringRecord$1;
}
interface ResourceConfig$9 {
    timestamps?: boolean;
}
interface Resource$l {
    name: string;
    version: string;
    config: ResourceConfig$9;
    schema?: SchemaInfo;
    emit(event: string, payload: unknown): void;
}
interface BehaviorHandleInsertParams {
    resource: Resource$l;
    data: StringRecord$1;
    mappedData: StringRecord$1<string>;
    originalData?: StringRecord$1;
}
interface BehaviorHandleUpdateParams {
    resource: Resource$l;
    id: string;
    data: StringRecord$1;
    mappedData: StringRecord$1<string>;
    originalData?: StringRecord$1;
}
interface BehaviorHandleUpsertParams {
    resource: Resource$l;
    id: string;
    data: StringRecord$1;
    mappedData: StringRecord$1<string>;
}
interface BehaviorHandleGetParams {
    resource: Resource$l;
    metadata: StringRecord$1<string>;
    body: string;
}
interface BehaviorResult$1 {
    mappedData: StringRecord$1<string>;
    body: string;
}
interface BehaviorGetResult {
    metadata: StringRecord$1<string>;
    body: string;
}
interface Behavior {
    handleInsert(params: BehaviorHandleInsertParams): Promise<BehaviorResult$1>;
    handleUpdate(params: BehaviorHandleUpdateParams): Promise<BehaviorResult$1>;
    handleUpsert?(params: BehaviorHandleUpsertParams): Promise<BehaviorResult$1>;
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
interface MiddlewareContext$1 {
    resource: Resource$k;
    args: unknown[];
    method: string;
}
type NextFunction$1 = () => Promise<unknown>;
type MiddlewareFunction$1 = (ctx: MiddlewareContext$1, next: NextFunction$1) => Promise<unknown>;
interface Resource$k {
    name: string;
    [method: string]: unknown;
}

interface PartitionFields$1 {
    [fieldName: string]: string;
}
interface PartitionDefinition$3 {
    fields: PartitionFields$1;
}
interface PartitionsConfig {
    [partitionName: string]: PartitionDefinition$3;
}

interface PartitionFields {
    [fieldName: string]: string;
}
interface PartitionDefinition$2 {
    fields: PartitionFields;
}
interface OrphanedPartition {
    missingFields: string[];
    definition: PartitionDefinition$2;
    allFields: string[];
}
interface OrphanedPartitions {
    [partitionName: string]: OrphanedPartition;
}

type EventListener = (...args: unknown[]) => void | Promise<void>;
interface EventListeners {
    [eventName: string]: EventListener | EventListener[];
}

interface IncrementalConfig$1 {
    type: 'incremental';
    start?: number;
    prefix?: string;
    mode?: 'fast' | 'normal';
    [key: string]: unknown;
}
type IdGeneratorConfig = ((data?: unknown) => string) | number | string | IncrementalConfig$1;
interface SequenceInterface {
    getValue(fieldName: string): Promise<number>;
    reset(fieldName: string, value: number): Promise<boolean>;
    list(): Promise<SequenceInfo$1[]>;
    reserveBatch(fieldName: string, count: number): Promise<BatchInfo$1>;
    getBatchStatus(fieldName: string): BatchStatus$1 | null;
    releaseBatch(fieldName: string): void;
}
interface SequenceInfo$1 {
    fieldName: string;
    currentValue: number;
}
interface BatchInfo$1 {
    start: number;
    end: number;
    current: number;
}
interface BatchStatus$1 {
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

interface ResourceConfig$8 {
    name: string;
    client: Client;
    database?: Database$b;
    version?: string;
    attributes?: AttributesSchema;
    behavior?: BehaviorType;
    passphrase?: string;
    bcryptRounds?: number;
    observers?: Database$b[];
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
    logLevel?: LogLevel$2;
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
    middleware?: MiddlewareFunction$1[];
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
interface PageResult$1 {
    items: ResourceData[];
    total: number;
    offset: number;
    size: number;
    hasMore: boolean;
}
interface QueryFilter {
    [key: string]: unknown;
}
interface QueryOptions$4 {
    limit?: number;
    offset?: number;
    partition?: string | null;
    partitionValues?: StringRecord$1;
}
interface ListOptions$4 {
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
interface PageOptions$1 {
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
interface Database$b {
    id: string;
    logger: Logger$i;
    getChildLogger(name: string, bindings?: Record<string, unknown>): Logger$i;
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
declare class Resource$j extends AsyncEventEmitter implements Disposable {
    name: string;
    client: Client;
    version: string;
    logLevel: LogLevel$3;
    logger: Logger$i;
    behavior: BehaviorType;
    private _resourceAsyncEvents;
    observers: Database$b[];
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
    $schema: Readonly<Omit<ResourceConfig$8, 'database' | 'observers' | 'client'>>;
    hooks: HooksCollection;
    attributes: AttributesSchema;
    guard: GuardConfig | null;
    eventsDisabled: boolean;
    database?: Database$b;
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
    constructor(config?: ResourceConfig$8);
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
    validate(data: Record<string, unknown>, options?: ValidationOptions$1): Promise<ValidationResult$2>;
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
    on(eventName: string, listener: EventHandler$2): this;
    addListener(eventName: string, listener: EventHandler$2): this;
    once(eventName: string, listener: EventHandler$2): this;
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
    listIds({ partition, partitionValues, limit, offset }?: ListOptions$4): Promise<string[]>;
    list({ partition, partitionValues, limit, offset }?: ListOptions$4): Promise<ResourceData[]>;
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
    buildPartitionPrefix(partition: string, partitionDef: PartitionDefinition$3, partitionValues: StringRecord$1): string;
    extractIdsFromKeys(keys: string[]): string[];
    processListResults(ids: string[], context?: string): Promise<ResourceData[]>;
    processPartitionResults(ids: string[], partition: string, partitionDef: PartitionDefinition$3, keys: string[]): Promise<ResourceData[]>;
    extractPartitionValuesFromKey(id: string, keys: string[], sortedFields: string[]): StringRecord$1;
    handleResourceError(error: Error, id: string, context: string): ResourceData;
    handleListError(error: Error, { partition, partitionValues }: {
        partition: string | null;
        partitionValues: StringRecord$1;
    }): ResourceData[];
    getMany(ids: string[]): Promise<ResourceData[]>;
    getAll(): Promise<ResourceData[]>;
    page({ offset, size, partition, partitionValues, skipCount }?: PageOptions$1): Promise<PageResult$1>;
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
    query(filter?: QueryFilter, { limit, offset, partition, partitionValues }?: QueryOptions$4): Promise<ResourceData[]>;
    handlePartitionReferenceUpdates(oldData: ResourceData, newData: ResourceData): Promise<void>;
    handlePartitionReferenceUpdate(partitionName: string, partition: PartitionDefinition$3, oldData: ResourceData, newData: ResourceData): Promise<void>;
    updatePartitionReferences(data: ResourceData): Promise<void>;
    getFromPartition({ id, partitionName, partitionValues }: GetFromPartitionParams): Promise<ResourceData>;
    createHistoricalVersion(id: string, data: ResourceData): Promise<void>;
    applyVersionMapping(data: ResourceData, fromVersion: string, toVersion: string): Promise<ResourceData>;
    composeFullObjectFromWrite({ id, metadata, body, behavior }: ComposeFullObjectParams): Promise<ResourceData>;
    _normalizeGuard(guard: GuardConfig): GuardConfig | null;
    executeGuard(operation: string, context: GuardContext, resource?: ResourceData | null): Promise<boolean>;
    _checkRolesScopes(requiredRolesScopes: string[], user: JWTUser): boolean;
    _initMiddleware(): void;
    useMiddleware(method: SupportedMethod, fn: MiddlewareFunction$1): void;
    applyDefaults(data: Record<string, unknown>): Record<string, unknown>;
    getSequenceValue(fieldName?: string): Promise<number | null>;
    resetSequence(fieldName: string, value: number): Promise<boolean>;
    listSequences(): Promise<SequenceInfo$1[] | null>;
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
    logLevel?: LogLevel$3;
    shutdownTimeout?: number;
    exitOnSignal?: boolean;
    logger?: S3DBLogger;
}
interface IntervalEntry {
    id: ReturnType<typeof setTimeout>;
    fn: () => void;
    interval: number;
    precise: boolean;
}
interface TimeoutEntry {
    id: ReturnType<typeof setTimeout>;
    fn: () => void;
    delay: number;
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
declare class ProcessManager$1 {
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
declare function getProcessManager(options?: ProcessManagerOptions): ProcessManager$1;
declare function resetProcessManager(): void;

interface SafeEventEmitterOptions {
    logLevel?: LogLevel$3;
    logger?: S3DBLogger;
    autoCleanup?: boolean;
    maxListeners?: number;
}
interface ListenerStats {
    [eventName: string]: number;
}
declare class SafeEventEmitter extends EventEmitter$1 {
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
    logLevel?: LogLevel$3;
    shutdownTimeout?: number;
    exitOnSignal?: boolean;
    disabled?: boolean;
    logger?: S3DBLogger;
}
interface CronJobEntry {
    task: CronTask;
    expression: string;
    fn: () => void | Promise<void>;
    options: ScheduleOptions;
    createdAt: number;
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
declare function intervalToCron(ms: number): string;
declare const CRON_PRESETS: {
    readonly EVERY_SECOND: "* * * * * *";
    readonly EVERY_5_SECONDS: `${string} * * * * *`;
    readonly EVERY_10_SECONDS: `${string} * * * * *`;
    readonly EVERY_15_SECONDS: `${string} * * * * *`;
    readonly EVERY_30_SECONDS: `${string} * * * * *`;
    readonly EVERY_MINUTE: "* * * * *";
    readonly EVERY_5_MINUTES: `${string} * * * *`;
    readonly EVERY_10_MINUTES: `${string} * * * *`;
    readonly EVERY_15_MINUTES: `${string} * * * *`;
    readonly EVERY_30_MINUTES: `${string} * * * *`;
    readonly EVERY_HOUR: "0 * * * *";
    readonly EVERY_2_HOURS: string;
    readonly EVERY_6_HOURS: string;
    readonly EVERY_12_HOURS: string;
    readonly EVERY_DAY: "0 0 * * *";
    readonly EVERY_DAY_NOON: "0 12 * * *";
    readonly EVERY_WEEK: "0 0 * * 0";
    readonly EVERY_MONTH: "0 0 1 * *";
    readonly BUSINESS_HOURS_START: "0 9 * * 1-5";
    readonly BUSINESS_HOURS_END: "0 17 * * 1-5";
};
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
declare function getCronManager(options?: CronManagerOptions): CronManager;
declare function resetCronManager(): void;
declare function createCronManager(options?: CronManagerOptions): CronManager;

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
    level?: LogLevel$2;
    pretty?: boolean;
    destination?: string;
    childLevels?: StringRecord<LogLevel$2>;
}
interface ClientOptions$2 {
    compression?: {
        enabled?: boolean;
    };
    retries?: number;
    timeout?: number;
    [key: string]: unknown;
}
interface CacheConfig$2 {
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
interface GlobalCoordinatorOptions$1 {
    autoStart?: boolean;
    config?: GlobalCoordinatorConfig$1;
}
interface GlobalCoordinatorConfig$1 {
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
interface GlobalCoordinatorService$1 {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getLeader: () => Promise<string | null>;
    getCircuitBreakerStatus: () => {
        state: string;
        failures: number;
    };
    on: (event: string, handler: EventHandler$2) => void;
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
    logger: Logger$i;
    savedMetadata: SavedMetadata | null;
    _resourcesMap: StringRecord<Resource$j>;
    resources: StringRecord<Resource$j>;
    passphrase: string;
    bcryptRounds: number;
    versioningEnabled: boolean;
    strictValidation: boolean;
    strictHooks: boolean;
    disableResourceEvents: boolean;
    deferMetadataWrites: boolean;
    metadataWriteDelay: number;
    cache: CacheConfig$2 | boolean | undefined;
    processManager: ProcessManager$1;
    cronManager: CronManager;
    executorPool: ExecutorPoolConfig;
    pluginList: PluginConstructor[];
    pluginRegistry: StringRecord<Plugin$1>;
    plugins: StringRecord<Plugin$1>;
    bucket: string;
    keyPrefix: string;
    emit: (event: string, data?: unknown) => void | Promise<void>;
    isConnected: () => boolean;
    getChildLogger: (name: string, bindings?: Record<string, unknown>) => Logger$i;
    generateDefinitionHash: (definition: ResourceExport, behavior?: BehaviorType) => string;
    getNextVersion: (versions?: StringRecord<VersionData>) => string;
    blankMetadataStructure: () => SavedMetadata;
}
interface Plugin$1 {
    name?: string;
    instanceName?: string;
    processManager?: ProcessManager$1;
    cronManager?: CronManager;
    logger?: Logger$i;
    setInstanceName?: (name: string) => void;
    install: (db: DatabaseRef) => Promise<void>;
    start: () => Promise<void>;
    stop?: () => Promise<void>;
    uninstall?: (options?: {
        purgeData?: boolean;
    }) => Promise<void>;
    removeAllListeners?: () => void;
}
type PluginConstructor = (new (db: DatabaseRef) => Plugin$1) | Plugin$1;

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
    middleware?: MiddlewareFunction$1[];
}
interface CreateResourceConfig {
    name: string;
    attributes: AttributesSchema;
    behavior?: BehaviorType;
    hooks?: Partial<HooksCollection>;
    middlewares?: MiddlewareFunction$1[] | StringRecord$1<MiddlewareFunction$1 | MiddlewareFunction$1[]>;
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
    events?: StringRecord$1<EventHandler$2 | EventHandler$2[]>;
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
    clientOptions?: ClientOptions$2;
    plugins?: PluginConstructor[];
    cache?: CacheConfig$2 | boolean;
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
    logLevel?: LogLevel$2;
    loggerOptions?: LoggerConfig;
    logger?: Logger$i;
    processManager?: ProcessManager$1;
    cronManager?: CronManager;
    exitOnSignal?: boolean;
    autoCleanup?: boolean;
}
declare class Database$a extends SafeEventEmitter {
    id: string;
    version: string;
    s3dbVersion: string;
    resources: StringRecord$1<Resource$j>;
    savedMetadata: SavedMetadata | null;
    databaseOptions: DatabaseOptions;
    executorPool: ExecutorPoolConfig;
    taskExecutor: ExecutorPoolConfig;
    pluginList: PluginConstructor[];
    pluginRegistry: StringRecord$1<Plugin$1>;
    plugins: StringRecord$1<Plugin$1>;
    cache: CacheConfig$2 | boolean | undefined;
    passphrase: string;
    bcryptRounds: number;
    versioningEnabled: boolean;
    strictValidation: boolean;
    strictHooks: boolean;
    disableResourceEvents: boolean;
    deferMetadataWrites: boolean;
    metadataWriteDelay: number;
    processManager: ProcessManager$1;
    cronManager: CronManager;
    logLevel: string;
    logger: Logger$i;
    client: Client;
    connectionString: string | undefined;
    bucket: string;
    keyPrefix: string;
    _resourcesMap: StringRecord$1<Resource$j>;
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
    getChildLogger(name: string, bindings?: Record<string, unknown>): Logger$i;
    setChildLevel(name: string, level: LogLevel$2): void;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    startPlugins(): Promise<void>;
    usePlugin(plugin: Plugin$1, name?: string | null): Promise<Plugin$1>;
    uninstallPlugin(name: string, options?: {
        purgeData?: boolean;
    }): Promise<void>;
    getGlobalCoordinator(namespace: string, options?: GlobalCoordinatorOptions$1): Promise<GlobalCoordinatorService$1>;
    createResource(config: CreateResourceConfig): Promise<Resource$j>;
    listResources(): Promise<ResourceExport[]>;
    getResource(name: string): Promise<Resource$j>;
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
declare class S3db extends Database$a {
}

type ClientType = 'filesystem' | 'memory' | 's3' | 'custom';
interface ClientOptions$1 {
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
    clientOptions: ClientOptions$1;
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
declare class S3Client$1 extends EventEmitter$1 {
    id: string;
    logLevel: string;
    private logger;
    config: ConnectionString;
    connectionString: string;
    httpClientOptions: HttpClientOptions$1;
    client: S3Client$5;
    private _inflightCoalescing;
    private taskExecutorConfig;
    private taskExecutor;
    constructor({ logLevel, logger, id, AwsS3Client: providedClient, connectionString, httpClientOptions, taskExecutor, executorPool, }: S3ClientConfig);
    private _coalesce;
    private _normalizeTaskExecutorConfig;
    private _createTasksPool;
    private _executeOperation;
    private _executeBatch;
    getQueueStats(): QueueStats$2 | null;
    getAggregateMetrics(since?: number): unknown | null;
    pausePool(): Promise<void | null>;
    resumePool(): void | null;
    drainPool(): Promise<void | null>;
    stopPool(): void;
    destroy(): void;
    createClient(): S3Client$5;
    sendCommand(command: AwsCommand): Promise<unknown>;
    putObject(params: PutObjectParams$2): Promise<unknown>;
    getObject(key: string): Promise<unknown>;
    headObject(key: string): Promise<unknown>;
    copyObject(params: CopyObjectParams$1): Promise<unknown>;
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
    listObjects(params?: ListObjectsParams$2): Promise<unknown>;
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
    put(key: string, params: StoragePutParams): Promise<PutObjectResponse$2>;
    get(key: string): Promise<S3Object>;
    head(key: string): Promise<Omit<S3Object, 'Body'>>;
    copy(from: string, to: string, params: StorageCopyParams): Promise<CopyObjectResponse$1>;
    exists(key: string): boolean;
    delete(key: string): Promise<DeleteObjectResponse>;
    deleteMultiple(keys: string[]): Promise<DeleteObjectsResponse>;
    list(params: StorageListParams): Promise<ListObjectsResponse$2>;
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
declare class MemoryClient extends EventEmitter$1 {
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
    getQueueStats(): QueueStats$2 | null;
    getAggregateMetrics(since?: number): unknown | null;
    sendCommand(command: Command$1): Promise<unknown>;
    private _handlePutObject;
    private _handleGetObject;
    private _handleHeadObject;
    private _handleCopyObject;
    private _handleDeleteObject;
    private _handleDeleteObjects;
    private _handleListObjects;
    putObject(params: PutObjectParams$2): Promise<PutObjectResponse$2>;
    getObject(key: string): Promise<S3Object>;
    headObject(key: string): Promise<S3Object>;
    copyObject(params: CopyObjectParams$1): Promise<CopyObjectResponse$1>;
    exists(key: string): Promise<boolean>;
    deleteObject(key: string): Promise<DeleteObjectResponse>;
    deleteObjects(keys: string[]): Promise<DeleteObjectsResponse>;
    listObjects(params?: ListObjectsParams$2): Promise<ListObjectsResponse$2>;
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
    }): Promise<PutObjectResponse$2>;
    get(key: string): Promise<S3Object>;
    head(key: string): Promise<Omit<S3Object, 'Body'>>;
    copy(from: string, to: string, params: StorageCopyParams): Promise<CopyObjectResponse$1>;
    delete(key: string): Promise<DeleteObjectResponse>;
    deleteMultiple(keys: string[]): Promise<DeleteObjectsResponse>;
    private _walkDirectory;
    list(params: StorageListParams): Promise<ListObjectsResponse$2>;
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
declare class FileSystemClient extends EventEmitter$1 {
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
    getQueueStats(): QueueStats$2 | null;
    getAggregateMetrics(since?: number): unknown | null;
    sendCommand(command: Command): Promise<unknown>;
    private _handlePutObject;
    private _handleGetObject;
    private _handleHeadObject;
    private _handleCopyObject;
    private _handleDeleteObject;
    private _handleDeleteObjects;
    private _handleListObjects;
    putObject(params: PutObjectParams$2): Promise<PutObjectResponse$2>;
    getObject(key: string): Promise<S3Object>;
    headObject(key: string): Promise<S3Object>;
    copyObject(params: CopyObjectParams$1): Promise<CopyObjectResponse$1>;
    exists(key: string): Promise<boolean>;
    deleteObject(key: string): Promise<DeleteObjectResponse>;
    deleteObjects(keys: string[]): Promise<DeleteObjectsResponse>;
    listObjects(params?: ListObjectsParams$2): Promise<ListObjectsResponse$2>;
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

declare class ReckerHttpHandler {
    private options;
    private client;
    private deduplicator;
    private circuitBreaker;
    private metrics;
    private http2MetricsEnabled;
    constructor(options?: ReckerHttpHandlerOptions);
    get metadata(): {
        handlerProtocol: string;
    };
    handle(request: AwsHttpRequest, { abortSignal, requestTimeout }?: HandleOptions): Promise<{
        response: AwsHttpResponse;
    }>;
    updateHttpClientConfig(key: keyof ReckerHttpHandlerOptions, value: unknown): void;
    httpHandlerConfigs(): ReckerHttpHandlerOptions;
    getMetrics(): HandlerMetrics;
    resetMetrics(): void;
    destroy(): void;
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

declare const encode: (n: number) => string;
declare const decode: (s: string) => number;
declare const encodeDecimal: (n: number) => string;
declare const decodeDecimal: (s: string) => number;
/**
 * Fixed-point encoding optimized for normalized values (typically -1 to 1)
 * Common in embeddings, similarity scores, probabilities, etc.
 *
 * Achieves ~77% compression vs encodeDecimal for embedding vectors.
 */
declare const encodeFixedPoint: (n: number, precision?: number) => string;
/**
 * Decodes fixed-point encoded values
 */
declare const decodeFixedPoint: (s: string, precision?: number) => number;
/**
 * Batch encoding for arrays of fixed-point numbers (optimized for embeddings)
 *
 * Achieves ~17% additional compression vs individual encodeFixedPoint by using
 * a single prefix for the entire array instead of one prefix per value.
 */
declare const encodeFixedPointBatch: (values: number[], precision?: number) => string;
/**
 * Decodes batch-encoded fixed-point arrays
 */
declare const decodeFixedPointBatch: (s: string, precision?: number) => number[];

/**
 * Binary/Buffer Encoding Utilities
 *
 * Provides compact Base64 encoding for binary data (Buffer, Uint8Array)
 * to save space in S3 metadata.
 */
type BitValue = 0 | 1;
interface BufferSavingsResult {
    originalBytes: number;
    originalBits: number;
    encodedSize: number;
    overhead: number;
    overheadPercent: string;
    fitsInMetadata: boolean;
    maxBitsInMetadata: number;
}
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
/**
 * Helper: Create an empty bitmap with N bits
 */
declare function createBitmap(bits: number, skipValidation?: boolean): Buffer;
/**
 * Helper: Set a bit in a bitmap
 */
declare function setBit(bitmap: Buffer, index: number): Buffer;
/**
 * Helper: Clear a bit in a bitmap
 */
declare function clearBit(bitmap: Buffer, index: number): Buffer;
/**
 * Helper: Get a bit from a bitmap
 */
declare function getBit(bitmap: Buffer, index: number): BitValue;
/**
 * Helper: Toggle a bit in a bitmap
 */
declare function toggleBit(bitmap: Buffer, index: number): Buffer;
/**
 * Helper: Count set bits (popcount) in a bitmap
 */
declare function countBits(bitmap: Buffer): number;
/**
 * Calculate space savings for buffer encoding
 */
declare function calculateBufferSavings(bufferOrSize: Buffer | number): BufferSavingsResult;
/**
 * Ultra-fast bitmap creation (no validation)
 */
declare function createBitmapFast(bits: number): Buffer;
/**
 * Ultra-fast bit set (no bounds checking)
 */
declare function setBitFast(bitmap: Buffer, index: number): void;
/**
 * Ultra-fast bit get (no bounds checking)
 */
declare function getBitFast(bitmap: Buffer, index: number): BitValue;
/**
 * Ultra-fast bit clear (no bounds checking)
 */
declare function clearBitFast(bitmap: Buffer, index: number): void;
/**
 * Ultra-fast bit toggle (no bounds checking)
 */
declare function toggleBitFast(bitmap: Buffer, index: number): void;
/**
 * Ultra-fast popcount using lookup table
 */
declare function countBitsFast(bitmap: Buffer): number;
/**
 * Ultra-fast encode (no validation)
 */
declare function encodeBitsFast(buffer: Buffer): string;
/**
 * Ultra-fast decode (no validation)
 */
declare function decodeBitsFast(encoded: string): Buffer;

declare function calculateUTF8Bytes(str: unknown): number;
declare function clearUTF8Memory(): void;
declare function calculateAttributeNamesSize(mappedObject: Record<string, unknown>): number;
declare function transformValue(value: unknown): string;
declare function calculateAttributeSizes(mappedObject: Record<string, unknown>): Record<string, number>;
declare function calculateTotalSize(mappedObject: Record<string, unknown>): number;
interface SizeBreakdownAttribute {
    attribute: string;
    size: number;
    percentage: string;
}
interface SizeBreakdown {
    total: number;
    valueSizes: Record<string, number>;
    namesSize: number;
    valueTotal: number;
    breakdown: SizeBreakdownAttribute[];
    detailedBreakdown: {
        values: number;
        names: number;
        total: number;
    };
}
declare function getSizeBreakdown(mappedObject: Record<string, unknown>): SizeBreakdown;
interface SystemOverheadConfig {
    version?: string;
    timestamps?: boolean;
    id?: string;
}
declare function calculateSystemOverhead(config?: SystemOverheadConfig): number;
interface EffectiveLimitConfig {
    s3Limit?: number;
    systemConfig?: SystemOverheadConfig;
}
declare function calculateEffectiveLimit(config?: EffectiveLimitConfig): number;

declare function sha256(message: string): Promise<string>;
declare function encrypt(content: string, passphrase: string): Promise<string>;
declare function decrypt(encryptedBase64: string, passphrase: string): Promise<string>;
declare function md5(data: string | Buffer): Promise<string>;

/**
 * IP Address Encoding/Decoding Utilities
 *
 * Provides compact binary encoding for IPv4 and IPv6 addresses
 * to save space in S3 metadata.
 */
type IPVersion = 'ipv4' | 'ipv6';
interface IPSavingsResult {
    version: IPVersion | null;
    originalSize: number;
    encodedSize: number;
    savings: number;
    savingsPercent?: string;
}
/**
 * Validate IPv4 address format
 */
declare function isValidIPv4(ip: string): boolean;
/**
 * Validate IPv6 address format
 */
declare function isValidIPv6(ip: string): boolean;
/**
 * Encode IPv4 address to Base64 binary representation
 */
declare function encodeIPv4(ip: string): string;
/**
 * Decode Base64 binary to IPv4 address
 */
declare function decodeIPv4(encoded: string): string;
/**
 * Normalize IPv6 address to full expanded form
 */
declare function expandIPv6(ip: string): string;
/**
 * Compress IPv6 address (remove leading zeros and use ::)
 */
declare function compressIPv6(ip: string): string;
/**
 * Encode IPv6 address to Base64 binary representation
 */
declare function encodeIPv6(ip: string): string;
/**
 * Decode Base64 binary to IPv6 address
 */
declare function decodeIPv6(encoded: string, compress?: boolean): string;
/**
 * Detect IP version from string
 */
declare function detectIPVersion(ip: string): IPVersion | null;
/**
 * Calculate savings percentage for IP encoding
 */
declare function calculateIPSavings(ip: string): IPSavingsResult;

declare function hashPasswordSync(password: string, rounds?: number): string;
declare function hashPassword(password: string, rounds?: number): Promise<string>;
declare function verifyPassword(plaintext: string, hash: string): Promise<boolean>;
declare function compactHash(bcryptHash: string): string;
declare function expandHash(compactHashStr: string, rounds?: number): string;
declare function isBcryptHash(str: string): boolean;

declare function initializeNanoid(): Promise<void>;
declare function getNanoidInitializationError(): Error | null;
declare const idGenerator: (size?: number) => string;
declare const passwordGenerator: (size?: number) => string;
declare const getUrlAlphabet: () => string;
declare const createCustomGenerator: (alphabet: string, size: number) => ((size?: number) => string);

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

/**
 * Money Encoding/Decoding - Integer-based (Banking Standard)
 *
 * IMPORTANT: Money should NEVER use floats/decimals due to precision errors.
 * Always store as integers in smallest currency unit (cents, satoshis, etc).
 */
declare const CURRENCY_DECIMALS: Record<string, number>;
/**
 * Get decimal places for a currency
 */
declare function getCurrencyDecimals(currency: string): number;
/**
 * Encode money value to integer-based base62
 */
declare function encodeMoney(value: number | null | undefined, currency?: string): string | null | undefined;
/**
 * Decode money from base62 to decimal value
 */
declare function decodeMoney(encoded: string | unknown, currency?: string): number | unknown;
/**
 * Validate if a currency code is supported
 */
declare function isSupportedCurrency(currency: string): boolean;
/**
 * Get list of all supported currencies
 */
declare function getSupportedCurrencies(): string[];
/**
 * Format money value for display
 */
declare function formatMoney(value: number, currency?: string, locale?: string): string;

interface FlattenOptions {
    safe?: boolean;
}
interface UnflattenOptions {
}
type FlattenValue = unknown;
type FlattenResult = Record<string, FlattenValue>;
/**
 * Flatten nested objects into dot-notation keys
 * Lightweight replacement for 'flat' package (only needed features)
 */
declare function flatten(obj: unknown, options?: FlattenOptions): FlattenResult;
/**
 * Unflatten dot-notation keys back into nested objects
 * Lightweight replacement for 'flat' package (only needed features)
 */
declare function unflatten(obj: Record<string, unknown>, _options?: UnflattenOptions): Record<string, unknown>;

declare const RETRIABLE: "RETRIABLE";
declare const NON_RETRIABLE: "NON_RETRIABLE";
type ErrorClassification = typeof RETRIABLE | typeof NON_RETRIABLE;
interface ClassifyOptions {
    retryableErrors?: string[];
    nonRetriableErrors?: string[];
}
interface ClassifiableError extends Error {
    code?: string;
    statusCode?: number;
    retriable?: boolean;
}
declare class ErrorClassifier {
    static classify(error: ClassifiableError | null | undefined, options?: ClassifyOptions): ErrorClassification;
    static isRetriable(error: ClassifiableError | null | undefined, options?: ClassifyOptions): boolean;
    static isNonRetriable(error: ClassifiableError | null | undefined, options?: ClassifyOptions): boolean;
}

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
interface ForEachWithConcurrencyResult<T> {
    errors: MapWithConcurrencyError<T>[];
}
declare function forEachWithConcurrency<T>(items: T[], fn: (item: T, index: number) => Promise<void>, options?: MapWithConcurrencyOptions<T>): Promise<ForEachWithConcurrencyResult<T>>;

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

declare const BUILT_IN_SENSITIVE_FIELDS: string[];
declare function createRedactRules(customPatterns?: RegExp[]): string[];
declare function isSensitiveField(fieldName: string, customPatterns?: RegExp[]): boolean;
interface TruncatedPayload {
    _truncated: true;
    _originalSize: number;
    _maxSize: number;
    _data: unknown;
}
declare function createPayloadRedactionSerializer(maxBytes?: number): (value: unknown) => unknown;
declare function createSensitiveDataSerializer(customPatterns?: RegExp[]): (data: unknown) => unknown;

type AuthType = 'bearer' | 'basic' | 'apikey';
type BackoffStrategy = 'fixed' | 'exponential';
interface BearerAuth {
    type: 'bearer';
    token: string;
}
interface BasicAuth {
    type: 'basic';
    username: string;
    password: string;
}
interface ApiKeyAuth {
    type: 'apikey';
    header?: string;
    value: string;
}
type AuthConfig$3 = BearerAuth | BasicAuth | ApiKeyAuth;
interface RetryConfig$1 {
    maxAttempts?: number;
    delay?: number;
    backoff?: BackoffStrategy;
    jitter?: boolean;
    retryAfter?: boolean;
    retryOn?: number[];
    limit?: number;
}
interface HttpClientOptions {
    baseUrl?: string;
    headers?: Record<string, string>;
    timeout?: number;
    retry?: RetryConfig$1;
    auth?: AuthConfig$3;
}
interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
    json?: unknown;
}
interface HttpClient$3 {
    request(url: string, options?: RequestOptions): Promise<Response>;
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, options?: RequestOptions): Promise<Response>;
    put(url: string, options?: RequestOptions): Promise<Response>;
    patch(url: string, options?: RequestOptions): Promise<Response>;
    delete(url: string, options?: RequestOptions): Promise<Response>;
}
interface ReckerModule {
    createClient(options: unknown): ReckerClient;
}
interface ReckerClient {
    get(url: string, options?: unknown): Promise<Response>;
    post(url: string, options?: unknown): Promise<Response>;
    put(url: string, options?: unknown): Promise<Response>;
    patch(url: string, options?: unknown): Promise<Response>;
    delete(url: string, options?: unknown): Promise<Response>;
    request(url: string, options?: unknown): Promise<Response>;
    scrape?(url: string, options?: unknown): Promise<unknown>;
}
declare function isReckerAvailable(): Promise<boolean>;
declare class FetchFallback implements HttpClient$3 {
    baseUrl: string;
    defaultHeaders: Record<string, string>;
    timeout: number;
    retry: Required<Omit<RetryConfig$1, 'limit'>>;
    auth: AuthConfig$3 | null;
    constructor(options?: HttpClientOptions);
    private _buildHeaders;
    request(url: string, options?: RequestOptions): Promise<Response>;
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, options?: RequestOptions): Promise<Response>;
    put(url: string, options?: RequestOptions): Promise<Response>;
    patch(url: string, options?: RequestOptions): Promise<Response>;
    delete(url: string, options?: RequestOptions): Promise<Response>;
}
declare class ReckerWrapper implements HttpClient$3 {
    private recker;
    private client;
    private options;
    constructor(options: HttpClientOptions | undefined, reckerMod: ReckerModule);
    request(url: string, options?: RequestOptions): Promise<Response>;
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, options?: RequestOptions): Promise<Response>;
    put(url: string, options?: RequestOptions): Promise<Response>;
    patch(url: string, options?: RequestOptions): Promise<Response>;
    delete(url: string, options?: RequestOptions): Promise<Response>;
    scrape(url: string, options?: RequestOptions): Promise<unknown>;
}
declare function createHttpClient(options?: HttpClientOptions): Promise<HttpClient$3>;
declare function createHttpClientSync(options?: HttpClientOptions): HttpClient$3;
declare function httpGet(url: string, options?: HttpClientOptions): Promise<Response>;
declare function httpPost(url: string, body: unknown, options?: HttpClientOptions): Promise<Response>;
declare function preloadRecker(): Promise<boolean>;

interface LockDefaults {
    ttl?: number;
    timeout?: number;
    retryDelay?: number;
    maxRetryDelay?: number;
    workerId?: string;
}
interface AcquireOptions extends LockDefaults {
    ttl?: number;
    timeout?: number;
    workerId?: string;
    retryDelay?: number;
    maxRetryDelay?: number;
}
interface LockHandle {
    name: string;
    key: string;
    token: string;
    workerId: string;
    expiresAt: number;
    etag: string | null;
}
interface LockInfo {
    workerId: string;
    token: string;
    acquiredAt: number;
    _expiresAt: number;
}
interface StorageAdapter {
    get(key: string): Promise<LockInfo | null>;
    set(key: string, data: LockInfo, options?: SetOptions$2): Promise<{
        ETag?: string;
    }>;
    delete(key: string): Promise<void>;
}
interface SetOptions$2 {
    ttl?: number;
    behavior?: string;
    ifNoneMatch?: string;
}
interface DistributedLockOptions {
    keyGenerator?: (name: string) => string;
    defaults?: LockDefaults;
}
interface PreconditionError extends Error {
    original?: {
        code?: string;
        Code?: string;
        name?: string;
        statusCode?: number;
        $metadata?: {
            httpStatusCode?: number;
        };
    };
    code?: string;
    Code?: string;
    statusCode?: number;
    $metadata?: {
        httpStatusCode?: number;
    };
}
declare function computeBackoff(attempt: number, baseDelay: number, maxDelay: number): number;
declare function sleep(ms: number): Promise<void>;
declare function isPreconditionFailure(err: PreconditionError | null | undefined): boolean;
declare class DistributedLock {
    storage: StorageAdapter;
    keyGenerator: (name: string) => string;
    defaults: Required<LockDefaults>;
    constructor(storage: StorageAdapter, options?: DistributedLockOptions);
    acquire(lockName: string, options?: AcquireOptions): Promise<LockHandle | null>;
    release(lock: LockHandle | string, token?: string): Promise<void>;
    withLock<T>(lockName: string, options: AcquireOptions, callback: (lock: LockHandle) => Promise<T>): Promise<T | null>;
    isLocked(lockName: string): Promise<boolean>;
    getLockInfo(lockName: string): Promise<LockInfo | null>;
}
declare function createLockedFunction<T>(lock: DistributedLock, lockName: string, options?: AcquireOptions): (callback: (lock: LockHandle) => Promise<T>) => Promise<T | null>;

interface SequenceDefaults {
    initialValue?: number;
    increment?: number;
    lockTimeout?: number;
    lockTTL?: number;
}
interface SequenceData {
    value: number;
    name: string;
    createdAt: number;
    updatedAt?: number;
    resetAt?: number;
    [key: string]: unknown;
}
interface SequenceStorageAdapter {
    get(key: string): Promise<SequenceData | null>;
    set(key: string, data: SequenceData, options?: {
        behavior?: string;
    }): Promise<void>;
    delete(key: string): Promise<void>;
}
interface DistributedSequenceOptions {
    valueKeyGenerator?: (name: string) => string;
    lockKeyGenerator?: (name: string) => string;
    defaults?: SequenceDefaults;
}
interface NextOptions extends SequenceDefaults {
    metadata?: Record<string, unknown>;
}
interface ResetOptions$1 {
    lockTimeout?: number;
    lockTTL?: number;
    metadata?: Record<string, unknown>;
}
interface CreateSequenceOptions {
    prefix?: string;
    resourceName?: string;
    pluginSlug?: string;
    valueKeyGenerator?: (name: string) => string;
    lockKeyGenerator?: (name: string) => string;
    defaults?: SequenceDefaults;
}
declare class DistributedSequence {
    storage: SequenceStorageAdapter;
    valueKeyGenerator: (name: string) => string;
    lockKeyGenerator: (name: string) => string;
    defaults: Required<SequenceDefaults>;
    lock: DistributedLock;
    constructor(storage: SequenceStorageAdapter, options?: DistributedSequenceOptions);
    next(name: string, options?: NextOptions): Promise<number>;
    get(name: string): Promise<number | null>;
    getData(name: string): Promise<SequenceData | null>;
    reset(name: string, value: number, options?: ResetOptions$1): Promise<boolean>;
    set(name: string, value: number, options?: ResetOptions$1): Promise<boolean>;
    delete(name: string): Promise<void>;
    exists(name: string): Promise<boolean>;
    increment(name: string, options?: NextOptions): Promise<number>;
}
declare function createSequence(storage: SequenceStorageAdapter, options?: CreateSequenceOptions): DistributedSequence;

interface DictionaryEncodeResult {
    encoded: string;
    encoding: 'dictionary';
    originalLength: number;
    encodedLength: number;
    dictionaryType: 'exact' | 'prefix';
    savings: number;
    prefix?: string;
    remainder?: string;
}
interface DictionaryCompressionStats {
    compressible: boolean;
    original: number;
    encoded: number;
    savings: number;
    ratio: number;
    savingsPercent?: string;
}
interface DictionaryStats {
    contentTypes: number;
    urlPrefixes: number;
    statusMessages: number;
    total: number;
    avgSavingsContentType: number;
    avgSavingsStatus: number;
}
declare const CONTENT_TYPE_DICT: Record<string, string>;
declare const URL_PREFIX_DICT: Record<string, string>;
declare const STATUS_MESSAGE_DICT: Record<string, string>;
declare function dictionaryEncode(value: string): DictionaryEncodeResult | null;
declare function dictionaryDecode(encoded: string): string | null;
declare function calculateDictionaryCompression(value: string): DictionaryCompressionStats;
declare function getDictionaryStats(): DictionaryStats;

interface GeoPoint {
    latitude: number;
    longitude: number;
}
declare function encodeGeoLat(lat: number | null | undefined, precision?: number): string | number | null | undefined;
declare function decodeGeoLat(encoded: string | number, precision?: number): number | string;
declare function encodeGeoLon(lon: number | null | undefined, precision?: number): string | number | null | undefined;
declare function decodeGeoLon(encoded: string | number, precision?: number): number | string;
declare function encodeGeoPoint(lat: number, lon: number, precision?: number): string;
declare function decodeGeoPoint(encoded: string, precision?: number): GeoPoint;
declare function isValidCoordinate(lat: number, lon: number): boolean;
declare function getPrecisionForAccuracy(accuracyMeters: number): number;
declare function getAccuracyForPrecision(precision: number): number;

interface EncodingComparison {
    original: number;
    base64Pure: number;
    base64Prefixed: number;
    urlPure: number;
    urlPrefixed: number;
    optimized: number;
    optimizedMethod: 'none' | 'ascii-marked' | 'url' | 'base64' | 'unknown';
}
declare function optimizedEncode(value: unknown): string;
declare function optimizedDecode(value: unknown): unknown;
declare function compareEncodings(value: unknown): EncodingComparison;

type EncodingType = 'none' | 'special' | 'ascii' | 'url' | 'base64' | 'dictionary';
interface AnalysisStats {
    ascii: number;
    latin1: number;
    multibyte: number;
}
interface AnalysisResult {
    type: EncodingType;
    safe: boolean;
    reason?: string;
    stats?: AnalysisStats;
}
interface EncodeResult {
    encoded: string;
    encoding: EncodingType;
    analysis?: AnalysisResult;
    dictionaryType?: 'exact' | 'prefix';
    savings?: number;
    compressionRatio?: string;
    reason?: string;
}
interface EncodedSizeInfo {
    original: number;
    encoded: number;
    overhead: number;
    ratio: number;
    encoding: EncodingType;
}
declare function analyzeString(str: string): AnalysisResult;
declare function metadataEncode(value: unknown): EncodeResult;
declare function metadataDecode(value: unknown): unknown;
declare function calculateEncodedSize(value: string): EncodedSizeInfo;

type IncrementalMode = 'standard' | 'fast';
interface IncrementalConfig {
    type: 'incremental';
    start: number;
    increment: number;
    mode: IncrementalMode;
    batchSize: number;
    prefix: string;
    padding: number;
}
interface ParseIncrementalOptions {
    validate?: boolean;
}
interface ValidationOptions {
    throwOnError?: boolean;
}
interface IncrementalValidationError {
    field: string;
    message: string;
    value: unknown;
}
interface IncrementalValidationResult {
    valid: boolean;
    errors: IncrementalValidationError[];
}
interface BatchInfo {
    start: number;
    end: number;
    current: number;
    reservedAt: number;
}
interface BatchStatus {
    start: number;
    end: number;
    current: number;
    remaining: number;
    reservedAt: number;
}
interface SequenceInfo {
    value: number;
    name: string;
    createdAt: number;
    updatedAt?: number;
    resetAt?: number;
}
interface IncrementalSequenceOptions {
    client: SequenceClient;
    resourceName: string;
    config: IncrementalConfig;
    logger?: Logger$g;
}
interface Logger$g {
    debug?: (context: Record<string, unknown>, message: string) => void;
}
interface SequenceClient {
    getObject(key: string): Promise<GetObjectResponse$1>;
    putObject(params: PutObjectParams$1): Promise<PutObjectResponse$1>;
    deleteObject(key: string): Promise<void>;
    listObjects(params: ListObjectsParams$1): Promise<ListObjectsResponse$1>;
}
interface GetObjectResponse$1 {
    Body?: {
        transformToString(): Promise<string>;
    };
}
interface PutObjectParams$1 {
    key: string;
    body: string;
    contentType: string;
    ifNoneMatch?: string;
}
interface PutObjectResponse$1 {
    ETag?: string;
}
interface ListObjectsParams$1 {
    prefix: string;
}
interface ListObjectsResponse$1 {
    Contents?: Array<{
        Key: string;
    }>;
}
interface SetOptions$1 {
    ttl?: number;
    ifNoneMatch?: string;
}
declare class IncrementalConfigError extends Error {
    field: string;
    value: unknown;
    constructor(message: string, field: string, value: unknown);
}
declare function validateIncrementalConfig(config: Partial<IncrementalConfig>, options?: ValidationOptions): IncrementalValidationResult;
declare function parseIncrementalConfig(config: string | Partial<IncrementalConfig>, options?: ParseIncrementalOptions): IncrementalConfig;
declare function formatIncrementalValue(value: number, options?: {
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
    set(key: string, data: SequenceInfo, options?: SetOptions$1): Promise<PutObjectResponse$1>;
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
declare class IncrementalSequence {
    client: SequenceClient;
    resourceName: string;
    config: IncrementalConfig;
    logger: Logger$g;
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
interface CreateIncrementalIdGeneratorOptions {
    client: SequenceClient;
    resourceName: string;
    config: string | Partial<IncrementalConfig>;
    logger?: Logger$g;
}
interface IncrementalIdGenerator {
    (): Promise<string>;
    _sequence: IncrementalSequence;
    _config: IncrementalConfig;
}
declare function createIncrementalIdGenerator(options: CreateIncrementalIdGeneratorOptions): IncrementalIdGenerator;

type PluginBehavior = 'body-overflow' | 'body-only' | 'enforce-limits';
interface PluginStorageSetOptions {
    ttl?: number;
    behavior?: PluginBehavior;
    contentType?: string;
    ifMatch?: string;
    ifNoneMatch?: string;
}
interface PluginStorageListOptions {
    limit?: number;
}
interface BatchSetItem {
    key: string;
    data: Record<string, unknown>;
    options?: PluginStorageSetOptions;
}
interface BatchSetResult {
    ok: boolean;
    key: string;
    error?: Error;
}
interface BatchGetResult {
    key: string;
    ok: boolean;
    data?: Record<string, unknown> | null;
    error?: Error;
}
interface SequenceOptions {
    resourceName?: string | null;
    initialValue?: number;
    increment?: number;
    lockTimeout?: number;
    lockTTL?: number;
}
interface ResetSequenceOptions {
    resourceName?: string | null;
    lockTimeout?: number;
    lockTTL?: number;
}
interface ListSequenceOptions {
    resourceName?: string | null;
}
interface PluginSequenceInfo {
    name: string;
    value: number;
    resourceName?: string | null;
    createdAt: number;
    updatedAt?: number;
    resetAt?: number;
}
interface BehaviorResult {
    metadata: Record<string, unknown>;
    body: Record<string, unknown> | null;
}
interface PluginClient {
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
    Body?: GetObjectBody;
    Metadata?: Record<string, string>;
    ContentType?: string;
}
type GetObjectBody = string | Uint8Array | ArrayBuffer | Buffer | {
    transformToString?: () => Promise<string>;
    transformToByteArray?: () => Promise<Uint8Array>;
    on?: (...args: unknown[]) => void;
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer>;
};
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
interface PluginStorageOptions {
    /**
     * Custom time function for testing. Defaults to Date.now.
     * Inject a mock function to enable time-travel in tests.
     */
    now?: () => number;
}
declare class PluginStorage$1 {
    client: PluginClient;
    pluginSlug: string;
    private _lock;
    private _sequence;
    private _now;
    constructor(client: PluginClient, pluginSlug: string, options?: PluginStorageOptions);
    getPluginKey(resourceName: string | null, ...parts: string[]): string;
    getSequenceKey(resourceName: string | null, sequenceName: string, suffix: string): string;
    set(key: string, data: Record<string, unknown>, options?: PluginStorageSetOptions): Promise<PutObjectResponse>;
    batchSet(items: BatchSetItem[]): Promise<BatchSetResult[]>;
    get(key: string): Promise<Record<string, unknown> | null>;
    private _parseMetadataValues;
    private _readBodyAsString;
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
    /**
     * Set data only if the key does not exist (conditional PUT).
     * Uses ifNoneMatch: '*' to ensure atomicity.
     * @returns The ETag (version) if set succeeded, null if key already exists.
     */
    setIfNotExists(key: string, data: Record<string, unknown>, options?: PluginStorageSetOptions): Promise<string | null>;
    /**
     * Get data along with its version (ETag) for conditional updates.
     * @returns Object with data and version, or { data: null, version: null } if not found.
     */
    getWithVersion(key: string): Promise<{
        data: Record<string, unknown> | null;
        version: string | null;
    }>;
    /**
     * Set data only if the current version matches (conditional PUT).
     * Uses ifMatch to ensure no concurrent modifications.
     * @returns The new ETag (version) if set succeeded, null if version mismatch.
     */
    setIfVersion(key: string, data: Record<string, unknown>, version: string, options?: PluginStorageSetOptions): Promise<string | null>;
    /**
     * Delete data only if the current version matches (conditional DELETE).
     * @returns true if deleted, false if version mismatch or key not found.
     */
    deleteIfVersion(key: string, version: string): Promise<boolean>;
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

type PartitionOperationType = 'create' | 'update' | 'delete';
type QueueItemStatus = 'pending' | 'retrying' | 'completed' | 'failed';
interface PartitionOperation {
    type: PartitionOperationType;
    resource: PartitionResource;
    data: Record<string, unknown>;
}
interface QueueItem {
    id: string;
    operation: PartitionOperation;
    retries: number;
    createdAt: Date;
    status: QueueItemStatus;
    lastError?: Error;
}
interface PartitionResource {
    createPartitionReferences(data: Record<string, unknown>): Promise<void>;
    handlePartitionReferenceUpdates(original: Record<string, unknown>, updated: Record<string, unknown>): Promise<void>;
    deletePartitionReferences(data: Record<string, unknown>): Promise<void>;
}
interface QueuePersistence {
    save(item: QueueItem): Promise<void>;
    remove(id: string): Promise<void>;
    moveToDLQ(item: QueueItem): Promise<void>;
    getPending(): Promise<QueueItem[]>;
    getDLQ?(): Promise<QueueItem[]>;
}
interface PartitionQueueOptions {
    maxRetries?: number;
    retryDelay?: number;
    persistence?: QueuePersistence | null;
}
interface QueueStats$1 {
    pending: number;
    failures: number;
    processing: boolean;
    failureRate: number;
}
declare class PartitionQueue extends EventEmitter$2 {
    maxRetries: number;
    retryDelay: number;
    persistence: QueuePersistence | null;
    queue: QueueItem[];
    processing: boolean;
    failures: QueueItem[];
    constructor(options?: PartitionQueueOptions);
    enqueue(operation: PartitionOperation): Promise<string>;
    process(): Promise<void>;
    executeOperation(item: QueueItem): Promise<void>;
    recover(): Promise<void>;
    getStats(): QueueStats$1;
}
declare class InMemoryPersistence implements QueuePersistence {
    private items;
    private dlq;
    constructor();
    save(item: QueueItem): Promise<void>;
    remove(id: string): Promise<void>;
    moveToDLQ(item: QueueItem): Promise<void>;
    getPending(): Promise<QueueItem[]>;
    getDLQ(): Promise<QueueItem[]>;
}

interface InsertStats {
    inserted: number;
    failed: number;
    partitionsPending: number;
    avgInsertTime: number;
}
interface FullStats extends InsertStats {
    bufferSize: number;
    isProcessing: boolean;
    throughput: number;
}
interface InsertResult {
    success: boolean;
    data?: Record<string, unknown>;
    error?: Error;
}
interface QueuedItem {
    data: Record<string, unknown>;
    timestamp: number;
    promise: Promise<unknown> | null;
}
interface PartitionQueueItem {
    operation: string;
    data: Record<string, unknown>;
    partitions: Record<string, unknown>;
}
interface HighPerformanceInserterOptions {
    batchSize?: number;
    concurrency?: number;
    flushInterval?: number;
    disablePartitions?: boolean;
    useStreamMode?: boolean;
}
interface BulkInsertResult {
    success: number;
    failed: number;
    errors: Error[];
}
interface StreamInserterOptions {
    concurrency?: number;
    skipPartitions?: boolean;
    skipHooks?: boolean;
    skipValidation?: boolean;
}
interface ResourceLike$9 {
    config: {
        asyncPartitions?: boolean;
        partitions?: Record<string, unknown>;
    };
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    createPartitionReferences(data: Record<string, unknown>): Promise<void>;
    emit(event: string, data: Record<string, unknown>): void;
    generateId(): string;
    getResourceKey(id: string): string;
    schema: {
        mapper(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
    client: {
        config: {
            bucket: string;
        };
        client: {
            send(command: unknown): Promise<void>;
        };
    };
}
declare class HighPerformanceInserter {
    resource: ResourceLike$9;
    batchSize: number;
    concurrency: number;
    flushInterval: number;
    disablePartitions: boolean;
    useStreamMode: boolean;
    insertBuffer: QueuedItem[];
    partitionBuffer: Map<string, unknown>;
    stats: InsertStats;
    flushTimer: ReturnType<typeof setTimeout> | null;
    isProcessing: boolean;
    partitionQueue: PartitionQueueItem[];
    partitionProcessor: ReturnType<typeof setImmediate> | null;
    constructor(resource: ResourceLike$9, options?: HighPerformanceInserterOptions);
    add(data: Record<string, unknown>): Promise<{
        queued: boolean;
        position: number;
    }>;
    bulkAdd(items: Record<string, unknown>[]): Promise<{
        queued: number;
    }>;
    flush(): Promise<void>;
    performInsert(item: QueuedItem): Promise<InsertResult>;
    processPartitionsAsync(): Promise<void>;
    forceFlush(): Promise<void>;
    getStats(): FullStats;
    destroy(): void;
}
declare class StreamInserter {
    resource: ResourceLike$9;
    concurrency: number;
    skipPartitions: boolean;
    skipHooks: boolean;
    skipValidation: boolean;
    constructor(resource: ResourceLike$9, options?: StreamInserterOptions);
    fastInsert(data: Record<string, unknown>): Promise<{
        id: string;
        inserted: boolean;
    }>;
    bulkInsert(items: Record<string, unknown>[]): Promise<BulkInsertResult>;
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
interface MetricsSummary$1 {
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
    getMetrics(): MetricsSummary$1;
    stop(): void;
    private _avg;
}

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
interface PerformanceReport$1 {
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
    performance: PerformanceReport$1 | null;
    system: SystemReport;
}
interface DatabaseClient {
    getQueueStats?: () => TaskQueueStats;
    getAggregateMetrics?: () => PerformanceMetrics;
}
interface DatabaseLike$7 {
    client?: DatabaseClient;
}
declare class PerformanceMonitor {
    db: DatabaseLike$7;
    snapshots: Snapshot[];
    intervalId: ReturnType<typeof setInterval> | null;
    constructor(database: DatabaseLike$7);
    start(intervalMs?: number): void;
    stop(): void;
    takeSnapshot(): Snapshot;
    getReport(): MonitorReport | null;
    private _avg;
}

interface MemoryUsageStats {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
    totalHeapSize: number;
    totalHeapSizeExecutable: number;
    totalPhysicalSize: number;
    totalAvailableSize: number;
    usedHeapSize: number;
    heapSizeLimit: number;
    mallocedMemory: number;
    peakMallocedMemory: number;
    rssMB: number;
    heapTotalMB: number;
    heapUsedMB: number;
    externalMB: number;
    heapSizeLimitMB: number;
}
interface MemorySample {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedMB: number;
}
interface MemorySamplerOptions {
    maxSamples?: number;
    sampleIntervalMs?: number;
}
interface SamplerStats {
    sampleCount: number;
    minHeapUsedMB: number;
    maxHeapUsedMB: number;
    avgHeapUsedMB: number;
    currentHeapUsedMB: number;
    timeRangeMs: number;
}
interface LeakDetectionResult {
    detected: boolean;
    growthRate: number;
    startHeapMB: number;
    endHeapMB: number;
    samples: number;
    timeRangeMs: number;
}
interface MemoryComparison {
    diff: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    diffMB: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    before: {
        heapUsedMB: number;
        heapTotalMB: number;
        externalMB: number;
        rssMB: number;
    };
    after: {
        heapUsedMB: number;
        heapTotalMB: number;
        externalMB: number;
        rssMB: number;
    };
}
interface MeasureMemoryResult<T> {
    result: T | undefined;
    error: Error | undefined;
    duration: number;
    memory: MemoryComparison;
    heapGrowthMB: number;
}
declare function getMemoryUsage(): MemoryUsageStats;
declare function bytesToMB(bytes: number): number;
declare function captureHeapSnapshot(outputDir: string, prefix?: string): Promise<string>;
declare function formatMemoryUsage(): string;
declare class MemorySampler$1 {
    samples: MemorySample[];
    maxSamples: number;
    sampleInterval: number;
    timer: ReturnType<typeof setInterval> | null;
    isRunning: boolean;
    constructor(options?: MemorySamplerOptions);
    start(): void;
    stop(): void;
    sample(): MemorySample;
    getSamples(): MemorySample[];
    getStats(): SamplerStats | null;
    detectLeak(threshold?: number): false | LeakDetectionResult;
    reset(): void;
}
declare function compareMemorySnapshots(before: MemoryUsageStats, after: MemoryUsageStats): MemoryComparison;
declare function forceGC(): boolean;
declare function measureMemory<T>(fn: () => Promise<T>, withGC?: boolean): Promise<MeasureMemoryResult<T>>;

interface GeoOptions {
    enabled?: boolean;
    databasePath?: string | null;
    allowedCountries?: string[];
    blockedCountries?: string[];
    blockUnknown?: boolean;
    cacheResults?: boolean;
}
interface FailbanManagerOptions {
    namespace?: string | null;
    resourceNames?: {
        bans?: string;
        violations?: string;
    };
    resources?: {
        bans?: string;
        violations?: string;
    };
    enabled?: boolean;
    database?: DatabaseLike$6;
    maxViolations?: number;
    violationWindow?: number;
    banDuration?: number;
    whitelist?: string[];
    blacklist?: string[];
    persistViolations?: boolean;
    logLevel?: LogLevel$3;
    geo?: GeoOptions;
    logger?: S3DBLogger;
}
interface FailbanOptions {
    enabled: boolean;
    database?: DatabaseLike$6;
    maxViolations: number;
    violationWindow: number;
    banDuration: number;
    whitelist: string[];
    blacklist: string[];
    persistViolations: boolean;
    logLevel: LogLevel$3;
    geo: Required<GeoOptions>;
    resources: ResourceNames$3;
}
interface ResourceNames$3 {
    bans: string;
    violations: string;
}
interface ResourceDescriptor$2 {
    defaultName: string;
    override?: string;
}
interface BanRecord$1 {
    id: string;
    ip: string;
    reason: string;
    violations: number;
    bannedAt: string;
    expiresAt: string;
    metadata: {
        userAgent?: string;
        path?: string;
        lastViolation: string;
    };
}
interface CachedBan {
    expiresAt: number;
    reason: string;
    violations: number;
}
interface CountryBlockResult {
    blocked: boolean;
    reason: string;
    country: string;
    ip: string;
}
interface ViolationMetadata {
    path?: string;
    userAgent?: string;
    violationCount?: number;
}
interface FailbanStats {
    enabled: boolean;
    activeBans: number;
    cachedBans: number;
    totalViolations: number;
    whitelistedIPs: number;
    blacklistedIPs: number;
    geo: {
        enabled: boolean;
        allowedCountries: number;
        blockedCountries: number;
        blockUnknown: boolean;
    };
    config: {
        maxViolations: number;
        violationWindow: number;
        banDuration: number;
    };
}
interface ResourceLike$8 {
    get(id: string): Promise<BanRecord$1 | null>;
    insert(data: Record<string, unknown>): Promise<BanRecord$1>;
    delete(id: string): Promise<void>;
    list(options?: {
        limit?: number;
    }): Promise<BanRecord$1[]>;
    query(filters: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
}
interface DatabaseLike$6 {
    getResource(name: string): Promise<ResourceLike$8>;
    createResource(config: Record<string, unknown>): Promise<ResourceLike$8>;
    resources?: Record<string, ResourceLike$8>;
    pluginRegistry?: {
        ttl?: {
            options: {
                resources?: Record<string, {
                    enabled: boolean;
                    field: string;
                }>;
            };
        };
        TTLPlugin?: {
            options: {
                resources?: Record<string, {
                    enabled: boolean;
                    field: string;
                }>;
            };
        };
    };
    emit?(event: string, data: Record<string, unknown>): void;
}
interface GeoReader {
    country(ip: string): {
        country?: {
            isoCode?: string;
        };
    };
}
declare class FailbanManager {
    logger: S3DBLogger;
    namespace: string | null;
    resourceNames: ResourceNames$3;
    options: FailbanOptions;
    database?: DatabaseLike$6;
    bansResource: ResourceLike$8 | null;
    violationsResource: ResourceLike$8 | null;
    memoryCache: Map<string, CachedBan>;
    geoCache: Map<string, string | null>;
    geoReader: GeoReader | null;
    cleanupJobName: CronTask | null;
    private _resourceDescriptors;
    constructor(options?: FailbanManagerOptions);
    private _resolveResourceNames;
    setNamespace(namespace: string): void;
    initialize(): Promise<void>;
    private _createBansResource;
    private _createViolationsResource;
    private _loadBansIntoCache;
    private _setupCleanupTimer;
    private _initializeGeoIP;
    getCountryCode(ip: string): string | null;
    isCountryBlocked(countryCode: string | null): boolean;
    checkCountryBlock(ip: string): CountryBlockResult | null;
    isWhitelisted(ip: string): boolean;
    isBlacklisted(ip: string): boolean;
    isBanned(ip: string): boolean;
    getBan(ip: string): Promise<BanRecord$1 | {
        ip: string;
        reason: string;
        permanent: boolean;
    } | null>;
    recordViolation(ip: string, type?: string, metadata?: ViolationMetadata): Promise<void>;
    private _checkAndBan;
    ban(ip: string, reason: string, metadata?: ViolationMetadata): Promise<void>;
    unban(ip: string): Promise<boolean>;
    listBans(): Promise<BanRecord$1[]>;
    getStats(): Promise<FailbanStats>;
    cleanup(): Promise<void>;
}

interface GenerateTypesOptions {
    outputPath?: string | null;
    moduleName?: string;
    includeResource?: boolean;
    logLevel?: string;
}
interface TypeGenResourceConfig {
    attributes?: Record<string, FieldDefinition>;
    timestamps?: boolean;
}
type FieldDefinition = string | ObjectFieldDefinition;
interface ObjectFieldDefinition {
    type?: string;
    required?: boolean;
    description?: string;
    props?: Record<string, FieldDefinition>;
    items?: string | ObjectFieldDefinition;
    [key: string]: any;
}
interface ResourceInterface {
    name: string;
    interfaceName: string;
    resource: ResourceLike$7;
}
interface ResourceLike$7 {
    config?: TypeGenResourceConfig;
    attributes?: Record<string, FieldDefinition>;
    schema?: {
        _pluginAttributes?: Record<string, string[]>;
    };
}
interface DatabaseLike$5 {
    resources: Record<string, ResourceLike$7>;
}
declare function generateTypes(database: DatabaseLike$5, options?: GenerateTypesOptions): Promise<string>;
declare function printTypes(database: DatabaseLike$5, options?: GenerateTypesOptions): Promise<string>;

/**
 * Fixed-size circular buffer for efficient rolling metrics.
 * Used by GlobalCoordinatorService for latency percentile tracking.
 *
 * Inspired by etcd's histogram-based metrics but implemented as a simple
 * ring buffer to avoid external dependencies.
 */
declare class RingBuffer<T> {
    private capacity;
    private buffer;
    private head;
    private _count;
    constructor(capacity: number);
    push(value: T): void;
    toArray(): T[];
    get count(): number;
    get isFull(): boolean;
    clear(): void;
}
/**
 * Specialized ring buffer for numeric latency tracking with percentile calculations.
 */
declare class LatencyBuffer extends RingBuffer<number> {
    private sortedCache;
    private sortedCacheVersion;
    private currentVersion;
    constructor(capacity?: number);
    push(value: number): void;
    private getSorted;
    percentile(p: number): number;
    p50(): number;
    p95(): number;
    p99(): number;
    max(): number;
    min(): number;
    avg(): number;
    getStats(): LatencyStats$1;
    clear(): void;
}
interface LatencyStats$1 {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
}

declare const behaviors: Record<BehaviorName, Behavior>;
declare function getBehavior(behaviorName: string): Behavior;
declare const AVAILABLE_BEHAVIORS: BehaviorName[];
declare const DEFAULT_BEHAVIOR: BehaviorName;

type TaskFunction$1<T> = () => Promise<T>;
interface EnqueueOptions$3 {
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
    abstract enqueue<T>(fn: TaskFunction$1<T>, options?: EnqueueOptions$3): Promise<T>;
    abstract process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: ProcessOptions$1<T>): Promise<ProcessResult$1<R>>;
    abstract pause(): void;
    abstract resume(): void;
    abstract stop(): void;
    abstract destroy(): Promise<void>;
    abstract getStats(): Record<string, unknown>;
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
interface EnqueueOptions$2 {
    priority?: number;
    retries?: number;
    timeout?: number;
    metadata?: Record<string, unknown>;
    signature?: string;
    [key: string]: unknown;
}
interface BatchOptions extends EnqueueOptions$2 {
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
declare class TasksPool extends EventEmitter$2 implements TaskExecutor {
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
    enqueue<T = unknown>(fn: TaskFunction<T>, options?: EnqueueOptions$2): Promise<T>;
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
interface EnqueueOptions$1 {
    priority?: number;
    retries?: number;
    timeout?: number;
    metadata?: Record<string, unknown>;
    signature?: string;
}
interface ProcessOptions<T = unknown> extends EnqueueOptions$1 {
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
declare class TasksRunner extends EventEmitter$2 implements TaskExecutor {
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
    enqueue<T = unknown>(fn: () => Promise<T>, options?: EnqueueOptions$1): Promise<T>;
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

interface Resource$i {
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
interface Database$9 {
    resources: Record<string, Resource$i>;
}
interface FactoryContext {
    seq: number;
    factory: Factory;
}
type FieldGenerator = (context: FactoryContext) => unknown | Promise<unknown>;
type DefinitionObject = Record<string, unknown | FieldGenerator>;
type DefinitionFunction = (context: FactoryContext) => DefinitionObject | Promise<DefinitionObject>;
type TraitDefinition = DefinitionObject | ((context: FactoryContext) => DefinitionObject | Promise<DefinitionObject>);
type BeforeCreateCallback = (attributes: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown> | void> | void;
type AfterCreateCallback = (created: Record<string, unknown>, context: {
    database: Database$9;
}) => Record<string, unknown> | Promise<Record<string, unknown> | void> | void;
interface FactoryOptions {
    [key: string]: unknown;
}
interface BuildOptions {
    traits?: string[];
}
interface CreateOptions extends BuildOptions {
    database?: Database$9;
}
declare class Factory {
    private static _sequences;
    private static _factories;
    private static _database;
    resourceName: string;
    definition: DefinitionObject | DefinitionFunction;
    options: FactoryOptions;
    traits: Map<string, TraitDefinition>;
    afterCreateCallbacks: AfterCreateCallback[];
    beforeCreateCallbacks: BeforeCreateCallback[];
    static define(resourceName: string, definition: DefinitionObject | DefinitionFunction, options?: FactoryOptions): Factory;
    static setDatabase(database: Database$9): void;
    static get(resourceName: string): Factory | undefined;
    static resetSequences(): void;
    static reset(): void;
    constructor(resourceName: string, definition: DefinitionObject | DefinitionFunction, options?: FactoryOptions);
    sequence(name?: string): number;
    trait(name: string, attributes: TraitDefinition): this;
    afterCreate(callback: AfterCreateCallback): this;
    beforeCreate(callback: BeforeCreateCallback): this;
    build(overrides?: Record<string, unknown>, options?: BuildOptions): Promise<Record<string, unknown>>;
    create(overrides?: Record<string, unknown>, options?: CreateOptions): Promise<Record<string, unknown>>;
    createMany(count: number, overrides?: Record<string, unknown>, options?: CreateOptions): Promise<Record<string, unknown>[]>;
    buildMany(count: number, overrides?: Record<string, unknown>, options?: BuildOptions): Promise<Record<string, unknown>[]>;
    createWithTraits(traits: string | string[], overrides?: Record<string, unknown>, options?: CreateOptions): Promise<Record<string, unknown>>;
    buildWithTraits(traits: string | string[], overrides?: Record<string, unknown>, options?: BuildOptions): Promise<Record<string, unknown>>;
}

interface Resource$h {
    listIds(): Promise<string[]>;
    deleteMany(ids: string[]): Promise<unknown>;
}
interface Database$8 {
    resources: Record<string, Resource$h>;
}
interface SeederOptions {
    logLevel?: string;
    logger?: Logger$i;
}
type SeederCallback = (database: Database$8) => Promise<unknown>;
declare class Seeder {
    database: Database$8;
    options: SeederOptions;
    logLevel: string;
    logger: Logger$i;
    constructor(database: Database$8, options?: SeederOptions);
    private log;
    seed(specs: Record<string, number>): Promise<Record<string, Record<string, unknown>[]>>;
    call<T>(callback: (database: Database$8) => Promise<T>): Promise<T>;
    truncate(resourceNames: string[]): Promise<void>;
    truncateAll(): Promise<void>;
    run(seeders: SeederCallback[]): Promise<unknown[]>;
    seedAndReturn(specs: Record<string, number>): Promise<Record<string, Record<string, unknown>[]>>;
    reset(): Promise<void>;
}

interface FilesystemStorageConfig {
    basePath: string;
}
interface SetOptions {
    ttl?: number;
    metadata?: Record<string, unknown>;
}
interface ListOptions$3 {
    prefix?: string;
    limit?: number;
}
interface SetResult {
    ETag: string;
}
declare class FilesystemStorageDriver {
    basePath: string;
    pluginSlug: string;
    constructor(config: FilesystemStorageConfig, pluginSlug: string);
    private _keyToPath;
    set(key: string, data: Record<string, unknown>, options?: SetOptions): Promise<SetResult>;
    get(key: string): Promise<Record<string, unknown> | null>;
    delete(key: string): Promise<boolean>;
    list(options?: ListOptions$3): Promise<string[]>;
    deleteAll(): Promise<number>;
}

interface PluginConfig {
    slug?: string;
    namespace?: string;
    instanceId?: string;
    logLevel?: string;
    logger?: S3DBLogger;
    storage?: StorageConfig;
    [key: string]: unknown;
}
interface StorageConfig {
    driver?: 's3' | 'filesystem';
    config?: Record<string, unknown>;
}
interface PartitionDefinition$1 {
    fields?: Record<string, unknown>;
}
interface ResourceConfig$7 {
    partitions?: Record<string, PartitionDefinition$1>;
}
interface ResourceLike$6 {
    config?: ResourceConfig$7;
    $schema?: ResourceConfig$7;
    name?: string;
    _pluginWrappers?: Map<string, WrapperFunction[]>;
    _pluginMiddlewares?: Record<string, MiddlewareFunction[]>;
    applyPartitionRule?(value: unknown, rule: unknown): unknown;
    insert?(data: unknown): Promise<unknown>;
    update?(id: string, data: unknown): Promise<unknown>;
    delete?(id: string): Promise<unknown>;
    get?(id: string): Promise<unknown>;
    list?(options?: unknown): Promise<unknown>;
    on?(event: string, handler: (...args: unknown[]) => void): void;
    off?(event: string, handler: (...args: unknown[]) => void): void;
}
type HookHandler$1 = (...args: unknown[]) => Promise<unknown> | unknown;
type WrapperFunction = (result: unknown, args: unknown[], methodName: string) => Promise<unknown>;
type MiddlewareFunction = (next: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => Promise<unknown>;
interface ScheduledTask {
    stop?(): void;
}
interface UninstallOptions$1 {
    purgeData?: boolean;
}
declare class Plugin<TOptions extends PluginConfig = PluginConfig> extends EventEmitter$1 {
    name: string;
    options: TOptions;
    hooks: Map<string, Map<string, HookHandler$1[]>>;
    baseSlug: string;
    slug: string;
    protected _storage: PluginStorage$1 | FilesystemStorageDriver | null;
    instanceName: string | null;
    namespace: string | null;
    protected _namespaceExplicit: boolean;
    cronManager: CronManager | null;
    protected _cronJobs: string[];
    logger: S3DBLogger;
    database: Database$a;
    logLevel: string;
    constructor(options?: TOptions);
    protected _generateSlug(): string;
    protected _normalizeNamespace(value: string | null | undefined): string | null;
    setNamespace(value: string | null | undefined, { explicit }?: {
        explicit?: boolean;
    }): void;
    setInstanceName(name: string | null | undefined): void;
    onNamespaceChanged(_namespace: string | null): void;
    getChildLogger(name: string, bindings?: Record<string, unknown>): S3DBLogger;
    scheduleCron(expression: string, fn: () => Promise<void> | void, suffix?: string, options?: Record<string, unknown>): Promise<ScheduledTask | null>;
    scheduleInterval(ms: number, fn: () => Promise<void> | void, suffix?: string, options?: Record<string, unknown>): Promise<ScheduledTask | null>;
    stopAllCronJobs(): number;
    getStorage(): PluginStorage$1 | FilesystemStorageDriver;
    detectAndWarnNamespaces(): Promise<string[]>;
    install(database: Database$a): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    uninstall(options?: UninstallOptions$1): Promise<void>;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(_options: UninstallOptions$1): Promise<void>;
    addHook(resource: string, event: string, handler: HookHandler$1): void;
    removeHook(resource: string, event: string, handler: HookHandler$1): void;
    wrapResourceMethod(resource: ResourceLike$6, methodName: string, wrapper: WrapperFunction): void;
    addMiddleware(resource: ResourceLike$6, methodName: string, middleware: MiddlewareFunction): void;
    getPartitionValues(data: Record<string, unknown>, resource: ResourceLike$6): Record<string, Record<string, unknown>>;
    getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown;
    beforeInstall(): void;
    afterInstall(): void;
    beforeStart(): void;
    afterStart(): void;
    beforeStop(): void;
    afterStop(): void;
    beforeUninstall(): void;
    afterUninstall(): void;
}

interface PluginObjectInterface {
    setup(database: Database$a): void;
    start(): void;
    stop(): void;
}
declare const PluginObject: PluginObjectInterface;

interface CircuitBreakerConfig {
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenMaxAttempts?: number;
}
interface ContentionConfig {
    enabled?: boolean;
    threshold?: number;
    rateLimitMs?: number;
}
interface GlobalCoordinatorConfig {
    heartbeatInterval?: number;
    heartbeatJitter?: number;
    leaseTimeout?: number;
    workerTimeout?: number;
    diagnosticsEnabled?: boolean | string;
    circuitBreaker?: CircuitBreakerConfig;
    contention?: ContentionConfig;
    metricsBufferSize?: number;
}
interface GlobalCoordinatorOptions {
    namespace: string;
    database: Database$a;
    config?: GlobalCoordinatorConfig;
}
interface CoordinatorMetrics {
    heartbeatCount: number;
    electionCount: number;
    electionDurationMs: number;
    leaderChanges: number;
    workerRegistrations: number;
    workerTimeouts: number;
    startTime: number | null;
    lastHeartbeatTime: number | null;
    circuitBreakerTrips: number;
    circuitBreakerState: CircuitBreakerState;
    contentionEvents: number;
    epochDriftEvents: number;
}
interface EnhancedCoordinatorMetrics extends CoordinatorMetrics {
    latency: LatencyStats$1;
    metricsWindowSize: number;
}
type CircuitBreakerState = 'closed' | 'open' | 'half-open';
interface CircuitBreakerInternalState {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    openedAt: number | null;
    failureThreshold: number;
    resetTimeout: number;
    halfOpenMaxAttempts: number;
}
interface LeaderState {
    leaderId: string | null;
    leaderPod?: string;
    epoch: number;
    leaseStart?: number;
    leaseEnd?: number;
    electedBy?: string;
    electedAt?: number;
}
interface WorkerData {
    workerId: string;
    pluginName: string;
    pod: string;
    lastHeartbeat: number;
    startTime: number | null;
    namespace: string;
}
interface LeaderChangeEvent {
    namespace: string;
    previousLeader: string | null;
    newLeader: string | null;
    epoch: number;
    timestamp: number;
}
interface CircuitBreakerStatus {
    state: CircuitBreakerState;
    failureCount: number;
    failureThreshold: number;
    resetTimeout: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    openedAt: number | null;
    trips: number;
}
interface SubscribablePlugin {
    workerId?: string;
    onGlobalLeaderChange?(isLeader: boolean, data: LeaderChangeEvent): void;
}
interface ContentionState {
    lastEventTime: number;
    rateLimitMs: number;
}
interface NormalizedConfig$1 {
    heartbeatInterval: number;
    heartbeatJitter: number;
    leaseTimeout: number;
    workerTimeout: number;
    diagnosticsEnabled: boolean;
    contentionEnabled: boolean;
    contentionThreshold: number;
    contentionRateLimitMs: number;
    metricsBufferSize: number;
}
interface ElectionResult {
    leaderId: string | null;
    epoch: number;
}
declare class GlobalCoordinatorService extends EventEmitter$2 {
    namespace: string;
    database: Database$a;
    serviceId: string;
    workerId: string;
    isRunning: boolean;
    isLeader: boolean;
    currentLeaderId: string | null;
    currentEpoch: number;
    config: NormalizedConfig$1;
    heartbeatTimer: ReturnType<typeof setTimeout> | null;
    electionTimer: ReturnType<typeof setTimeout> | null;
    subscribedPlugins: Map<string, SubscribablePlugin>;
    metrics: CoordinatorMetrics;
    protected _circuitBreaker: CircuitBreakerInternalState;
    protected _contentionState: ContentionState;
    protected _latencyBuffer: LatencyBuffer;
    storage: CoordinatorPluginStorage | null;
    protected _pluginStorage: CoordinatorPluginStorage | null;
    logger: S3DBLogger;
    constructor({ namespace, database, config }: GlobalCoordinatorOptions);
    start(): Promise<void>;
    protected _startLoop(): Promise<void>;
    stop(): Promise<void>;
    subscribePlugin(pluginName: string, plugin: SubscribablePlugin): Promise<void>;
    unsubscribePlugin(pluginName: string): void;
    isLeaderCheck(workerId: string): Promise<boolean>;
    getLeader(): Promise<string | null>;
    getEpoch(): Promise<number>;
    getActiveWorkers(): Promise<WorkerData[]>;
    getMetrics(): EnhancedCoordinatorMetrics;
    incrementEpochDriftEvents(): void;
    protected _heartbeatCycle(): Promise<void>;
    protected _checkContention(durationMs: number): void;
    protected _conductElection(previousEpoch?: number): Promise<ElectionResult>;
    protected _registerWorker(): Promise<void>;
    protected _registerWorkerEntry(workerId: string, pluginName?: string | null): Promise<void>;
    protected _unregisterWorker(): Promise<void>;
    protected _unregisterWorkerEntry(workerId: string): Promise<void>;
    protected _getState(): Promise<LeaderState | null>;
    protected _initializeMetadata(): Promise<void>;
    protected _notifyLeaderChange(previousLeaderId: string | null, newLeaderId: string | null): void;
    protected _notifyPlugin(pluginName: string, plugin: SubscribablePlugin, eventType: string, data: LeaderChangeEvent): void;
    protected _scheduleHeartbeat(): void;
    protected _getStorage(): CoordinatorPluginStorage;
    protected _getStateKey(): string;
    protected _getWorkersPrefix(): string;
    protected _getWorkerKey(workerId: string): string;
    protected _getMetadataKey(): string;
    protected _circuitBreakerAllows(): boolean;
    protected _circuitBreakerSuccess(): void;
    protected _circuitBreakerFailure(): void;
    getCircuitBreakerStatus(): CircuitBreakerStatus;
    protected _getWorkerPod(_workerId: string): string;
    protected _normalizeConfig(config: GlobalCoordinatorConfig): NormalizedConfig$1;
    protected _sleep(ms: number): Promise<void>;
    protected _log(...args: unknown[]): void;
    protected _logError(msg: string, err: Error): void;
    protected _generateWorkerId(): string;
}
declare class CoordinatorPluginStorage extends PluginStorage$1 {
    constructor(client: S3Client$1, pluginSlug?: string);
    list(prefix?: string, options?: {
        limit?: number;
    }): Promise<string[]>;
    listWithPrefix(prefix?: string, options?: {
        limit?: number;
    }): Promise<Record<string, unknown>[]>;
    protected _getActiveKeys(prefix: string, timeoutMs: number): Promise<string[]>;
    listActiveWorkers(prefix: string, timeoutMs: number): Promise<WorkerData[]>;
    listActiveWorkerIds(prefix: string, timeoutMs: number): Promise<string[]>;
    protected _deleteStaleWorkers(keys: string[]): Promise<void>;
}

interface CoordinatorConfig$1 extends PluginConfig {
    enableCoordinator?: boolean;
    startupJitterMin?: number;
    startupJitterMax?: number;
    coldStartDuration?: number;
    skipColdStart?: boolean;
    coordinatorWorkInterval?: number | null;
    heartbeatInterval?: number;
    heartbeatJitter?: number;
    leaseTimeout?: number;
    workerTimeout?: number;
    logger?: S3DBLogger;
    epochFencingEnabled?: boolean;
    epochGracePeriodMs?: number;
}
interface NormalizedCoordinatorConfig {
    enableCoordinator: boolean;
    startupJitterMin: number;
    startupJitterMax: number;
    coldStartDuration: number;
    skipColdStart: boolean;
    coordinatorWorkInterval: number | null;
    heartbeatInterval: number;
    heartbeatJitter: number;
    leaseTimeout: number;
    workerTimeout: number;
    epochFencingEnabled: boolean;
    epochGracePeriodMs: number;
}
interface EpochValidationResult {
    valid: boolean;
    reason?: 'stale' | 'grace_period' | 'current';
    taskEpoch: number;
    currentEpoch: number;
}
type ColdStartPhase = 'not_started' | 'observing' | 'election' | 'preparation' | 'ready';
interface IntervalHandle {
    type: 'cron' | 'manual';
    jobName?: string;
    timer?: ReturnType<typeof setInterval>;
}

declare class CoordinatorPlugin<TOptions extends CoordinatorConfig$1 = CoordinatorConfig$1> extends Plugin<TOptions> {
    slug: string;
    workerId: string;
    workerStartTime: number;
    isCoordinator: boolean;
    currentLeaderId: string | null;
    protected _globalCoordinator: GlobalCoordinatorService | null;
    protected _leaderChangeListener: ((event: LeaderChangeEvent) => Promise<void>) | null;
    protected _heartbeatHandle: IntervalHandle | null;
    protected _coordinatorWorkHandle: IntervalHandle | null;
    coldStartPhase: ColdStartPhase;
    coldStartCompleted: boolean;
    protected _coordinatorConfig: NormalizedCoordinatorConfig;
    protected _coordinationStarted: boolean;
    protected _lastKnownEpoch: number;
    protected _lastEpochChangeTime: number;
    constructor(config?: TOptions);
    protected _normalizeConfig(config: CoordinatorConfig$1): NormalizedCoordinatorConfig;
    onBecomeCoordinator(): Promise<void>;
    onStopBeingCoordinator(): Promise<void>;
    coordinatorWork(): Promise<void>;
    get coordinatorConfig(): NormalizedCoordinatorConfig;
    get enableCoordinator(): boolean;
    startCoordination(): Promise<void>;
    protected _runBackgroundElection(): Promise<void>;
    stopCoordination(): Promise<void>;
    isLeader(): Promise<boolean>;
    getLeader(): Promise<string | null>;
    getActiveWorkers(): Promise<unknown[]>;
    getCurrentEpoch(): Promise<number>;
    /**
     * Validates if a task should be processed based on its epoch.
     * Inspired by etcd Raft's Term fencing mechanism.
     *
     * Returns true if the task should be processed, false if it should be rejected.
     * Tasks from stale epochs are rejected to prevent split-brain scenarios.
     */
    validateEpoch(taskEpoch: number, taskTimestamp?: number): EpochValidationResult;
    /**
     * Convenience method that returns boolean only.
     */
    isEpochValid(taskEpoch: number, taskTimestamp?: number): boolean;
    protected _initializeGlobalCoordinator(): Promise<void>;
    protected _setupLeaderChangeListener(): void;
    protected _clearLeaderChangeListener(): void;
    protected _executeColdStart(): Promise<void>;
    protected _startCoordinatorWork(): Promise<void>;
    protected _scheduleInterval(fn: () => Promise<void>, intervalMs: number, name: string): Promise<IntervalHandle>;
    protected _clearIntervalHandle(handle: IntervalHandle | null): void;
    protected _sleep(ms: number): Promise<void>;
    protected _generateWorkerId(): string;
}

interface AuditPluginOptions {
    resourceNames?: {
        audit?: string;
    };
    resourceName?: string;
    includeData?: boolean;
    includePartitions?: boolean;
    maxDataSize?: number;
    namespace?: string;
    logger?: Logger$i;
    logLevel?: string;
    [key: string]: unknown;
}
interface AuditQueryOptions {
    resourceName?: string;
    operation?: string;
    recordId?: string;
    partition?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
interface AuditRecord {
    id: string;
    resourceName: string;
    operation: string;
    recordId: string;
    userId: string;
    timestamp: string;
    createdAt: string;
    oldData?: string | null;
    newData?: string | null;
    partition?: string | null;
    partitionValues?: string | null;
    metadata?: string;
}
interface AuditStats {
    total: number;
    byOperation: Record<string, number>;
    byResource: Record<string, number>;
    byPartition: Record<string, number>;
    byUser: Record<string, number>;
    timeline: Record<string, number>;
}
interface AuditConfig$1 {
    includeData: boolean;
    includePartitions: boolean;
    maxDataSize: number;
    logLevel?: string;
}
interface ResourceDescriptor$1 {
    defaultName: string;
    override?: string;
}
interface Resource$g {
    name: string;
    $schema: {
        partitions?: Record<string, {
            fields: Record<string, string>;
        }>;
    };
    on(event: string, callback: (data: unknown) => Promise<void>): void;
    insert(data: Record<string, unknown>): Promise<void>;
    get(id: string): Promise<Record<string, unknown>>;
    list(options?: {
        limit?: number;
    }): Promise<Record<string, unknown>[]>;
    query(filter: Record<string, unknown>, options?: {
        limit?: number;
    }): Promise<Record<string, unknown>[]>;
    page(options?: {
        size?: number;
        offset?: number;
    }): Promise<{
        items: Record<string, unknown>[];
    }>;
    delete(id: string): Promise<void>;
    deleteMany: (ids: string[]) => Promise<void>;
    _originalDeleteMany?: (ids: string[]) => Promise<void>;
}
declare class AuditPlugin$1 extends Plugin {
    namespace: string;
    auditResource: Resource$g | null;
    _auditResourceDescriptor: ResourceDescriptor$1;
    auditResourceName: string;
    config: AuditConfig$1;
    getCurrentUserId?: () => string;
    constructor(options?: AuditPluginOptions);
    _resolveAuditResourceName(): string;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    setupResourceAuditing(resource: Resource$g): void;
    logAudit(auditData: {
        resourceName: string;
        operation: string;
        recordId: string;
        oldData: string | null;
        newData: string | null;
        partition: string | null;
        partitionValues: string | null;
    }): Promise<void>;
    getPartitionValues(data: Record<string, unknown>, resource: ResourceLike$6): Record<string, Record<string, unknown>>;
    getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown;
    getPrimaryPartition(partitionValues: Record<string, unknown>): string | null;
    truncateData(data: Record<string, unknown>): Record<string, unknown> | null;
    getAuditLogs(options?: AuditQueryOptions): Promise<AuditRecord[]>;
    _generateDateRange(startDate: string, endDate?: string): string[];
    getRecordHistory(resourceName: string, recordId: string): Promise<AuditRecord[]>;
    getPartitionHistory(resourceName: string, partitionName: string, partitionValues: Record<string, unknown>): Promise<AuditRecord[]>;
    getAuditStats(options?: AuditQueryOptions): Promise<AuditStats>;
    cleanupOldAudits(retentionDays?: number): Promise<number>;
}

interface MemoryLimitConfig {
    maxMemoryBytes?: number;
    maxMemoryPercent?: number;
    heapUsageThreshold?: number;
}
interface MemoryLimitResult {
    maxMemoryBytes: number;
    inferredPercent?: number;
    derivedFromPercent?: boolean;
    heapLimit: number;
}
declare function resolveCacheMemoryLimit(config: MemoryLimitConfig): MemoryLimitResult;

interface Resource$f {
    name: string;
    $schema: ResourceSchema;
    useMiddleware(method: string, handler: MiddlewareHandler): void;
    get(id: string, options?: Record<string, unknown>): Promise<unknown>;
    getMany(ids: string[], options?: Record<string, unknown>): Promise<unknown[]>;
    list(options?: Record<string, unknown>): Promise<unknown[]>;
    page(options?: Record<string, unknown>): Promise<PageResult | unknown[]>;
    count(options?: Record<string, unknown>): Promise<number>;
    query(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown[]>;
    cacheInstances?: Record<string, CacheDriver>;
    cacheNamespaces?: Record<string, CacheNamespace>;
    cache?: CacheNamespace;
    cacheKeyResolvers?: Record<string, CacheKeyResolver>;
    cacheKeyFor?: CacheKeyResolver;
    getCacheDriver?: (name?: string | null) => CacheDriver | null;
    getCacheNamespace?: (name?: string | null) => CacheNamespace | null;
    getCacheKeyResolver?: (name?: string | null) => CacheKeyResolver | null;
    clearPartitionCache?: (partition: string, partitionValues?: Record<string, unknown>) => Promise<void>;
    getPartitionCacheStats?: (partition?: string | null) => Promise<Record<string, unknown>>;
    getCacheRecommendations?: () => Promise<CacheRecommendation$1[]>;
    warmPartitionCache?: (partitions: string[], options?: Record<string, unknown>) => Promise<WarmResult>;
}
interface ResourceSchema {
    partitions?: Record<string, PartitionDefinition>;
    createdBy?: string;
}
interface PartitionDefinition {
    fields?: string[];
    [key: string]: unknown;
}
interface PageResult {
    items: unknown[];
    total?: number;
}
type MiddlewareHandler = (ctx: MiddlewareContext, next: () => Promise<unknown>) => Promise<unknown>;
interface MiddlewareContext {
    args: unknown[];
}
type CacheKeyResolver = (options?: CacheKeyOptions) => Promise<string>;
interface CacheKeyOptions {
    action?: string;
    params?: Record<string, unknown>;
    partition?: string | null;
    partitionValues?: Record<string, unknown> | null;
}
interface CacheDriver {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    clear(keyPrefix?: string): Promise<void>;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    stats?(): CacheDriverStats;
    getStats?(): CacheDriverStats;
    shutdown?(): Promise<void>;
    on?(event: string, handler: (payload: unknown) => void): void;
    _get?(key: string, options: Record<string, unknown>): Promise<unknown>;
    _set?(key: string, value: unknown, options: Record<string, unknown>): Promise<void>;
    getPartitionStats?(resourceName: string, partition?: string | null): Promise<Record<string, unknown>>;
    getCacheRecommendations?(resourceName: string): Promise<CacheRecommendation$1[]>;
    warmPartitionCache?(resourceName: string, options: Record<string, unknown>): Promise<WarmResult>;
    clearPartition?(resourceName: string, partition: string, partitionValues?: Record<string, unknown>): Promise<void>;
}
interface CacheDriverStats {
    size?: number;
    hits?: number;
    misses?: number;
    [key: string]: unknown;
}
interface CacheRecommendation$1 {
    recommendation: string;
    priority: number;
    partition?: string;
    [key: string]: unknown;
}
interface WarmResult {
    resourceName: string;
    recordsSampled?: number;
    partitionsWarmed?: number;
    [key: string]: unknown;
}
interface CacheNamespace {
    driver: CacheDriver;
    instanceKey: string;
    driverName: string;
    keyFor(action: string, options?: CacheKeyOptions): Promise<string>;
    resolve(action: string, options?: CacheKeyOptions): Promise<string>;
    getDriver(): CacheDriver;
    warm(options?: Record<string, unknown>): Promise<WarmResult>;
    warmItem(id: string, control?: WarmControl): Promise<unknown>;
    warmMany(ids: string[], control?: WarmControl): Promise<unknown>;
    warmList(listOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
    warmPage(pageOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
    warmQuery(filter?: Record<string, unknown>, queryOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
    warmCount(countOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
    warmPartition(partitions?: string[], options?: Record<string, unknown>): Promise<WarmResult>;
    invalidate(scope?: unknown): Promise<void>;
    clearAll(): Promise<void>;
    stats(): CacheDriverStats;
}
interface WarmControl {
    forceRefresh?: boolean;
    returnData?: boolean;
}
interface CachePluginOptions {
    driver?: string | CacheDriver;
    drivers?: DriverConfig$1[];
    promoteOnHit?: boolean;
    strategy?: 'write-through' | 'write-behind' | 'cache-aside';
    fallbackOnError?: boolean;
    ttl?: number;
    maxSize?: number;
    maxMemoryBytes?: number;
    maxMemoryPercent?: number;
    config?: DriverSpecificConfig;
    include?: string[] | null;
    exclude?: string[];
    includePartitions?: boolean;
    partitionStrategy?: string;
    partitionAware?: boolean;
    trackUsage?: boolean;
    preloadRelated?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
    verbose?: boolean;
    logger?: S3DBLogger;
    logLevel?: string;
    instanceName?: string;
    slug?: string;
    [key: string]: unknown;
}
interface DriverConfig$1 {
    driver: string;
    name?: string;
    config?: DriverSpecificConfig;
}
interface DriverSpecificConfig {
    ttl?: number;
    maxSize?: number;
    maxMemoryBytes?: number;
    maxMemoryPercent?: number;
    enableCompression?: boolean;
    compressionThreshold?: number;
    inferredMaxMemoryPercent?: number;
    [key: string]: unknown;
}
interface CacheConfig$1 {
    driver: string | CacheDriver;
    drivers?: DriverConfig$1[];
    isMultiTier: boolean;
    promoteOnHit: boolean;
    strategy: string;
    fallbackOnError: boolean;
    config: DriverSpecificConfig;
    include: string[] | null;
    exclude: string[];
    includePartitions: boolean;
    partitionStrategy: string;
    partitionAware: boolean;
    trackUsage: boolean;
    preloadRelated: boolean;
    retryAttempts: number;
    retryDelay: number;
    logLevel?: string;
}
interface CacheStats$2 {
    hits: number;
    misses: number;
    writes: number;
    deletes: number;
    errors: number;
    startTime: number;
}
interface CacheStatsResult {
    hits: number;
    misses: number;
    writes: number;
    deletes: number;
    errors: number;
    total: number;
    hitRate: string;
    missRate: string;
    hitRateDecimal: number;
    missRateDecimal: number;
    uptime: number;
    uptimeFormatted: string;
    startTime: string;
    hitsPerSecond: string | number;
    missesPerSecond: string | number;
    writesPerSecond: string | number;
}
interface CacheAnalysis {
    message?: string;
    totalResources?: number;
    resourceStats?: Record<string, unknown>;
    recommendations?: Record<string, CacheRecommendation$1[]>;
    summary?: {
        mostUsedPartitions: CacheRecommendation$1[];
        leastUsedPartitions: CacheRecommendation$1[];
        suggestedOptimizations: string[];
    };
}
declare class CachePlugin extends Plugin {
    namespace: string;
    logLevel: string;
    instanceName: string | null;
    slug: string;
    config: CacheConfig$1;
    driver: CacheDriver | null;
    stats: CacheStats$2;
    constructor(options?: CachePluginOptions);
    onInstall(): Promise<void>;
    installDatabaseHooks(): void;
    createResourceCacheNamespace(resource: Resource$f, driver: CacheDriver, computeCacheKey: CacheKeyResolver, instanceKey: string): CacheNamespace;
    onStart(): Promise<void>;
    private _createSingleDriver;
    private _createMultiTierDriver;
    installResourceHooks(): void;
    shouldCacheResource(resourceName: string): boolean;
    installResourceHooksForResource(resource: Resource$f): void;
    clearCacheForResource(resource: Resource$f, data?: Record<string, unknown>): Promise<void>;
    clearCacheWithRetry(cache: CacheDriver, key: string): Promise<[boolean, Error | null]>;
    private _getDriverForResource;
    generateCacheKey(resource: Resource$f, action: string, params?: Record<string, unknown>, partition?: string | null, partitionValues?: Record<string, unknown> | null): Promise<string>;
    hashParams(params: Record<string, unknown>): string;
    getPartitionValues(data: Record<string, unknown>, resource: ResourceLike$6): Record<string, Record<string, unknown>>;
    getCacheStats(): Promise<{
        size: number;
        keys: string[];
        driver: string;
        stats: CacheDriverStats | null;
    } | null>;
    clearAllCache(): Promise<void>;
    warmCache(resourceName: string, options?: Record<string, unknown>): Promise<WarmResult>;
    analyzeCacheUsage(): Promise<CacheAnalysis>;
    getStats(): CacheStatsResult;
    resetStats(): void;
    private _formatUptime;
    onStop(): Promise<void>;
}

interface S3Client {
    costs?: CostsData;
    on(event: string, handler: EventHandler$1): void;
}
type EventHandler$1 = (name: string, response: S3Response, input: S3Input) => void;
interface S3Response {
    httpResponse?: {
        headers?: Record<string, string | number>;
    };
    ContentLength?: number;
}
interface S3Input {
    Body?: string | Buffer | {
        length?: number;
    };
    body?: string | Buffer | {
        length?: number;
    };
}
interface CostsPluginOptions {
    considerFreeTier?: boolean;
    region?: string;
    logLevel?: string;
}
interface CostsConfig {
    considerFreeTier: boolean;
    region: string;
    logLevel?: string;
}
interface RequestPrices {
    put: number;
    copy: number;
    list: number;
    post: number;
    get: number;
    select: number;
    delete: number;
    head: number;
}
interface RequestCounts {
    put: number;
    post: number;
    copy: number;
    list: number;
    get: number;
    select: number;
    delete: number;
    head: number;
}
interface RequestEvents {
    PutObjectCommand: number;
    GetObjectCommand: number;
    CopyObjectCommand: number;
    HeadObjectCommand: number;
    DeleteObjectCommand: number;
    DeleteObjectsCommand: number;
    ListObjectsV2Command: number;
}
interface RequestsData {
    prices: RequestPrices;
    total: number;
    counts: RequestCounts;
    totalEvents: number;
    events: RequestEvents;
    subtotal: number;
}
interface StorageTier {
    limit: number;
    pricePerGB: number;
}
interface StorageData$1 {
    totalBytes: number;
    totalGB: number;
    tiers: StorageTier[];
    currentTier: number;
    subtotal: number;
}
interface DataTransferTier {
    limit: number;
    pricePerGB: number;
}
interface DataTransferData {
    inBytes: number;
    inGB: number;
    inCost: number;
    outBytes: number;
    outGB: number;
    tiers: DataTransferTier[];
    freeTierGB: number;
    freeTierUsed: number;
    currentTier: number;
    subtotal: number;
}
interface CostsData {
    total: number;
    requests: RequestsData;
    storage: StorageData$1;
    dataTransfer: DataTransferData;
}
type CommandName = 'PutObjectCommand' | 'GetObjectCommand' | 'CopyObjectCommand' | 'HeadObjectCommand' | 'DeleteObjectCommand' | 'DeleteObjectsCommand' | 'ListObjectsV2Command';
type MethodName = 'put' | 'get' | 'copy' | 'head' | 'delete' | 'list';
declare class CostsPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: CostsConfig;
    map: Record<CommandName, MethodName>;
    costs: CostsData;
    client: S3Client | null;
    constructor(config?: CostsPluginOptions);
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    addRequest(name: CommandName, method: MethodName | undefined, response?: S3Response, input?: S3Input): void;
    trackStorage(bytes: number): void;
    trackDataTransferIn(bytes: number): void;
    trackDataTransferOut(bytes: number): void;
    calculateStorageCost(storage: StorageData$1): number;
    calculateDataTransferCost(dataTransfer: DataTransferData): number;
    updateTotal(): void;
}

interface Resource$e {
    name: string;
    insert: (...args: unknown[]) => Promise<Record<string, unknown>>;
    _insert?: (...args: unknown[]) => Promise<Record<string, unknown>>;
    insertMany?: (data: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
    _insertMany?: (data: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
    update: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    _update?: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    delete: (id: string) => Promise<void>;
    _delete?: (id: string) => Promise<void>;
    deleteMany?: (ids: string[]) => Promise<void>;
    _deleteMany?: (ids: string[]) => Promise<void>;
    get: (id: string) => Promise<IndexRecord | null>;
    getAll: () => Promise<IndexRecord[]>;
    getMany: (ids: string[]) => Promise<Record<string, unknown>[]>;
    query: (filter: Record<string, unknown>) => Promise<IndexRecord[]>;
}
interface IndexRecord {
    id: string;
    resourceName: string;
    fieldName: string;
    word: string;
    recordIds: string[];
    count: number;
    lastUpdated?: string;
}
interface FullTextPluginOptions {
    resourceNames?: {
        index?: string;
    };
    indexResource?: string;
    minWordLength?: number;
    maxResults?: number;
    fields?: string[] | Record<string, string[]>;
    logLevel?: string;
    [key: string]: unknown;
}
interface FullTextConfig {
    minWordLength: number;
    maxResults: number;
    fields?: string[] | Record<string, string[]>;
    logLevel?: string;
}
interface IndexData {
    recordIds: string[];
    count: number;
}
interface SearchOptions {
    fields?: string[] | null;
    limit?: number;
    offset?: number;
    exactMatch?: boolean;
}
interface SearchResult {
    recordId: string;
    score: number;
}
interface SearchRecord extends Record<string, unknown> {
    id: string;
    _searchScore: number;
}
interface FieldStats {
    words: number;
    totalOccurrences: number;
}
interface ResourceStats$1 {
    fields: Record<string, FieldStats>;
    totalRecords: Set<string> | number;
    totalWords: number;
}
interface IndexStats {
    totalIndexes: number;
    resources: Record<string, ResourceStats$1>;
    totalWords: number;
}
interface RebuildOptions {
    timeout?: number;
}
declare class FullTextPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    indexResource: Resource$e | null;
    indexResourceName: string;
    config: FullTextConfig;
    indexes: Map<string, IndexData>;
    dirtyIndexes: Set<string>;
    deletedIndexes: Set<string>;
    private _indexResourceDescriptor;
    constructor(options?: FullTextPluginOptions);
    private _resolveIndexResourceName;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    isInternalResource(name: string): boolean;
    loadIndexes(): Promise<void>;
    saveIndexes(): Promise<void>;
    installDatabaseHooks(): void;
    removeDatabaseHooks(): void;
    installIndexingHooks(): void;
    installResourceHooks(resource: Resource$e): void;
    indexRecord(resourceName: string, recordId: string, data: Record<string, unknown>): Promise<void>;
    removeRecordFromIndex(resourceName: string, recordId: string): Promise<void>;
    getFieldValue(data: Record<string, unknown>, fieldPath: string): unknown;
    tokenize(text: unknown): string[];
    getIndexedFields(resourceName: string): string[];
    search(resourceName: string, query: string, options?: SearchOptions): Promise<SearchResult[]>;
    searchRecords(resourceName: string, query: string, options?: SearchOptions): Promise<SearchRecord[]>;
    rebuildIndex(resourceName: string): Promise<void>;
    getIndexStats(): Promise<IndexStats>;
    rebuildAllIndexes(options?: RebuildOptions): Promise<void>;
    private _rebuildAllIndexesInternal;
    clearIndex(resourceName: string): Promise<void>;
    clearAllIndexes(): Promise<void>;
}

interface Logger$f {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Resource$d {
    name: string;
    insert: (...args: unknown[]) => Promise<unknown>;
    _insert?: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
    _update?: (...args: unknown[]) => Promise<unknown>;
    delete: (...args: unknown[]) => Promise<unknown>;
    _delete?: (...args: unknown[]) => Promise<unknown>;
    deleteMany?: (...args: unknown[]) => Promise<unknown>;
    _deleteMany?: (...args: unknown[]) => Promise<unknown>;
    get: (...args: unknown[]) => Promise<unknown>;
    _get?: (...args: unknown[]) => Promise<unknown>;
    getMany?: (...args: unknown[]) => Promise<unknown>;
    _getMany?: (...args: unknown[]) => Promise<unknown>;
    getAll: () => Promise<MetricRecord[]>;
    _getAll?: () => Promise<MetricRecord[]>;
    list: (...args: unknown[]) => Promise<unknown[]>;
    _list?: (...args: unknown[]) => Promise<unknown[]>;
    listIds?: (...args: unknown[]) => Promise<string[]>;
    _listIds?: (...args: unknown[]) => Promise<string[]>;
    count?: (...args: unknown[]) => Promise<number>;
    _count?: (...args: unknown[]) => Promise<number>;
    page?: (...args: unknown[]) => Promise<unknown>;
    _page?: (...args: unknown[]) => Promise<unknown>;
    query: (filter: Record<string, unknown>) => Promise<MetricRecord[]>;
}
interface MetricRecord {
    id: string;
    type?: string;
    resourceName?: string;
    operation?: string;
    count?: number;
    totalTime?: number;
    errors?: number;
    avgTime?: number;
    timestamp?: string;
    createdAt?: string;
    duration?: number;
    error?: string;
    stack?: string;
    metadata?: Record<string, unknown>;
}
interface PrometheusConfig {
    enabled?: boolean;
    mode?: 'auto' | 'integrated' | 'standalone';
    port?: number;
    path?: string;
    includeResourceLabels?: boolean;
    ipAllowlist?: string[];
    enforceIpAllowlist?: boolean;
}
interface MetricsPluginOptions {
    resourceNames?: {
        metrics?: string;
        errors?: string;
        performance?: string;
    };
    resources?: {
        metrics?: string;
        errors?: string;
        performance?: string;
    };
    collectPerformance?: boolean;
    collectErrors?: boolean;
    collectUsage?: boolean;
    retentionDays?: number;
    flushInterval?: number;
    prometheus?: PrometheusConfig;
    logger?: Logger$f;
    logLevel?: string;
    [key: string]: unknown;
}
interface MetricsConfig {
    collectPerformance: boolean;
    collectErrors: boolean;
    collectUsage: boolean;
    retentionDays: number;
    flushInterval: number;
    prometheus: Required<PrometheusConfig>;
    logLevel?: string;
}
interface OperationMetrics {
    count: number;
    totalTime: number;
    errors: number;
}
interface PoolMetrics {
    tasksStarted: number;
    tasksCompleted: number;
    tasksFailed: number;
    tasksRetried: number;
    totalExecutionTime: number;
    avgExecutionTime: number;
}
interface PerformanceEntry {
    resourceName: string;
    operation: string;
    duration: number;
    timestamp: string;
}
interface ErrorEntry {
    resourceName: string;
    operation: string;
    error: string;
    stack?: string;
    timestamp: string;
}
interface MetricsData {
    operations: Record<string, OperationMetrics>;
    pool: PoolMetrics;
    resources: Record<string, Record<string, OperationMetrics>>;
    errors: ErrorEntry[];
    performance: PerformanceEntry[];
    startTime: string;
}
interface ResourceNames$2 {
    metrics: string;
    errors: string;
    performance: string;
}
interface MetricsQueryOptions {
    type?: string;
    resourceName?: string;
    operation?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
interface ErrorLogsQueryOptions {
    resourceName?: string;
    operation?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
interface PerformanceLogsQueryOptions {
    resourceName?: string;
    operation?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
interface OperationStats {
    count: number;
    errors: number;
    avgTime: number;
}
interface MetricsStats {
    period: string;
    totalOperations: number;
    totalErrors: number;
    avgResponseTime: number;
    operationsByType: Record<string, OperationStats>;
    resources: Record<string, unknown>;
    pool: PoolMetrics;
    uptime: {
        startTime: string;
        duration: number;
    };
}
interface FlushTimer {
    stop?: () => void;
    destroy?: () => void;
}
declare class MetricsPlugin$1 extends Plugin {
    namespace: string;
    logLevel: string;
    config: MetricsConfig;
    metrics: MetricsData;
    resourceNames: ResourceNames$2;
    metricsResource: Resource$d | null;
    errorsResource: Resource$d | null;
    performanceResource: Resource$d | null;
    flushJobName: string | null;
    flushTimer: FlushTimer | null;
    metricsServer: Server | null;
    private _resourceDescriptors;
    constructor(options?: MetricsPluginOptions);
    private _resolveResourceNames;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    start(): Promise<void>;
    private _setupOperationPoolListeners;
    stop(): Promise<void>;
    installDatabaseHooks(): void;
    removeDatabaseHooks(): void;
    isInternalResource(resourceName: string): boolean;
    installMetricsHooks(): void;
    installResourceHooks(resource: Resource$d): void;
    recordOperation(resourceName: string, operation: string, duration: number, isError: boolean): void;
    recordError(resourceName: string, operation: string, error: Error): void;
    startFlushTimer(): void;
    flushMetrics(): Promise<void>;
    resetMetrics(): void;
    getMetrics(options?: MetricsQueryOptions): Promise<MetricRecord[]>;
    getErrorLogs(options?: ErrorLogsQueryOptions): Promise<MetricRecord[]>;
    getPerformanceLogs(options?: PerformanceLogsQueryOptions): Promise<MetricRecord[]>;
    getStats(): Promise<MetricsStats>;
    cleanupOldData(): Promise<void>;
    getPrometheusMetrics(): Promise<string>;
    private _setupPrometheusExporter;
    private _setupIntegratedMetrics;
    private _setupStandaloneMetrics;
}

interface Resource$c {
    name: string;
    get(id: string): Promise<QueueEntry>;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    query(filter: Record<string, unknown>, options?: QueryOptions$3): Promise<QueueEntry[]>;
    count(filter?: Record<string, unknown>): Promise<number>;
    updateConditional(id: string, data: Record<string, unknown>, options: {
        ifMatch: string;
    }): Promise<{
        success: boolean;
        data?: QueueEntry;
        etag?: string;
        error?: string;
    }>;
    enqueue?: (data: Record<string, unknown>, options?: EnqueueOptions) => Promise<Record<string, unknown>>;
    queueStats?: () => Promise<QueueStats>;
    startProcessing?: (handler: MessageHandler$2, options?: ProcessingOptions) => Promise<void>;
    stopProcessing?: () => Promise<void>;
    extendQueueVisibility?: (queueId: string, extraMilliseconds: number, options?: {
        lockToken?: string;
    }) => Promise<boolean>;
    renewQueueLock?: (queueId: string, lockToken: string, extraMilliseconds: number) => Promise<boolean>;
    clearQueueCache?: () => void;
}
interface QueryOptions$3 {
    limit?: number;
    offset?: number;
}
interface QueueEntry {
    id: string;
    originalId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
    visibleAt: number;
    claimedBy?: string | null;
    claimedAt?: number | null;
    lockToken?: string | null;
    attempts: number;
    maxAttempts: number;
    queuedAt: number;
    error?: string | null;
    result?: unknown;
    createdAt: string;
    completedAt?: number | null;
    _etag?: string;
    _queuedAt?: number;
}
interface EnqueueOptions {
    maxAttempts?: number;
}
interface QueueStats {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead: number;
}
interface ProcessingOptions {
    concurrency?: number;
}
interface MessageContext {
    queueId: string;
    attempts: number;
    workerId: string;
    lockToken: string;
    visibleUntil: number;
    renewLock: (extraMilliseconds?: number) => Promise<boolean>;
}
type MessageHandler$2 = (record: Record<string, unknown>, context: MessageContext) => Promise<unknown>;
interface ClaimedMessage {
    queueId: string;
    record: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
    originalId: string;
    lockToken: string;
    visibleUntil: number;
    etag?: string;
    queuedAt: number;
}
interface Lock {
    name: string;
    workerId: string;
    acquired: number;
}
interface TicketData {
    ticketId: string;
    messageId: string;
    originalId?: string;
    queuedAt?: number;
    orderIndex: number;
    publishedAt: number;
    publishedBy: string;
    status: 'available' | 'claimed' | 'processed';
    claimedBy: string | null;
    claimedAt: number | null;
    ticketTTL?: number;
    _ttl?: number;
}
interface FailureStrategy {
    mode: 'retry' | 'dead-letter' | 'hybrid';
    maxRetries: number;
    deadLetterQueue: string | null;
}
interface S3QueuePluginOptions extends CoordinatorConfig$1 {
    resource: string;
    resourceNames?: {
        queue?: string;
        deadLetter?: string;
    };
    visibilityTimeout?: number;
    pollInterval?: number;
    maxAttempts?: number;
    concurrency?: number;
    deadLetterResource?: string | null;
    autoStart?: boolean;
    onMessage?: MessageHandler$2;
    onError?: (error: Error, record: Record<string, unknown>) => void | Promise<void>;
    onComplete?: (record: Record<string, unknown>, result: unknown) => void | Promise<void>;
    pollBatchSize?: number;
    recoveryInterval?: number;
    recoveryBatchSize?: number;
    processedCacheTTL?: number;
    maxPollInterval?: number;
    queueResource?: string;
    orderingMode?: 'fifo' | 'lifo';
    orderingGuarantee?: boolean;
    orderingLockTTL?: number;
    failureStrategy?: string | {
        mode?: string;
        maxRetries?: number;
        deadLetterQueue?: string;
    };
    lockTTL?: number;
    heartbeatTTL?: number;
    epochDuration?: number;
    ticketBatchSize?: number;
    dispatchInterval?: number;
}
interface S3QueueConfig {
    resource: string;
    visibilityTimeout: number;
    pollInterval: number;
    maxAttempts: number;
    concurrency: number;
    deadLetterResource: string | null;
    autoStart: boolean;
    onMessage?: MessageHandler$2;
    onError?: (error: Error, record: Record<string, unknown>) => void | Promise<void>;
    onComplete?: (record: Record<string, unknown>, result: unknown) => void | Promise<void>;
    logLevel?: string;
    orderingGuarantee: boolean;
    orderingLockTTL: number;
    orderingMode: 'fifo' | 'lifo';
    failureStrategy: FailureStrategy;
    lockTTL: number;
    ticketBatchSize: number;
    dispatchInterval: number;
    pollBatchSize: number;
    recoveryInterval: number;
    recoveryBatchSize: number;
    processedCacheTTL: number;
    maxPollInterval: number;
    queueResourceName: string;
    enableCoordinator: boolean;
    heartbeatTTL: number;
}
declare class S3QueuePlugin extends CoordinatorPlugin<S3QueuePluginOptions> {
    namespace: string;
    logLevel: string;
    workerId: string;
    isCoordinator: boolean;
    currentLeaderId: string | null;
    config: S3QueueConfig;
    _queueResourceDescriptor: {
        defaultName: string;
        override?: string;
    };
    queueResourceName: string;
    _deadLetterDescriptor: {
        defaultName: string;
        override?: string;
    } | null;
    deadLetterResourceName: string | null;
    queueResourceAlias: string;
    deadLetterResourceAlias: string | null;
    queueResource: Resource$c | null;
    targetResource: Resource$c | null;
    deadLetterResourceObj: Resource$c | null;
    workers: Promise<void>[];
    isRunning: boolean;
    processedCache: Map<string, number>;
    cacheCleanupJobName: string | null;
    messageLocks: Map<string, Lock>;
    _lastRecovery: number;
    _recoveryInFlight: boolean;
    _bestEffortNotified: boolean;
    dispatchHandle: ReturnType<typeof setInterval> | null;
    constructor(options: S3QueuePluginOptions);
    private _resolveQueueResourceName;
    private _resolveDeadLetterResourceName;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    addHelperMethods(): void;
    _publishTickets(): Promise<number>;
    onBecomeCoordinator(): Promise<void>;
    onStopBeingCoordinator(): Promise<void>;
    coordinatorWork(): Promise<void>;
    startProcessing(handler?: MessageHandler$2 | null, options?: ProcessingOptions): Promise<void>;
    stopProcessing(): Promise<void>;
    createWorker(handler: MessageHandler$2, workerIndex: number): Promise<void>;
    claimMessage(): Promise<ClaimedMessage | null>;
    private _prepareAvailableMessages;
    private _ensureQueuedAt;
    private _sortMessages;
    private _attemptMessagesInOrder;
    private _generateLockToken;
    private _notifyBestEffortOrdering;
    private _orderingLockName;
    private _acquireOrderingLock;
    private _lockNameForMessage;
    acquireLock(messageId: string): Promise<Lock | null>;
    releaseLock(lockOrMessageId: Lock | string): Promise<void>;
    cleanupStaleLocks(): Promise<void>;
    attemptClaim(msg: QueueEntry, options?: {
        enforceOrder?: boolean;
    }): Promise<ClaimedMessage | null>;
    processMessage(message: ClaimedMessage, handler: MessageHandler$2): Promise<void>;
    completeMessage(message: ClaimedMessage, result: unknown): Promise<void>;
    failMessage(message: ClaimedMessage, error: string): Promise<void>;
    retryMessage(message: ClaimedMessage, attempts: number, error: string): Promise<void>;
    moveToDeadLetter(message: ClaimedMessage, error: string): Promise<void>;
    getStats(): Promise<QueueStats>;
    createDeadLetterResource(): Promise<void>;
    extendVisibility(queueId: string, extraMilliseconds: number, { lockToken }?: {
        lockToken?: string;
    }): Promise<boolean>;
    renewLock(queueId: string, lockToken: string, extraMilliseconds?: number): Promise<boolean>;
    recoverStalledMessages(now: number): Promise<void>;
    private _recoverSingleMessage;
    private _emitOutcome;
    private _handleProcessingFailure;
    private _updateQueueEntryWithLock;
    private _normalizeOrderingMode;
    private _normalizeFailureStrategy;
    private _resolveMaxAttempts;
    private _computeIdleDelay;
    protected _sleep(ms: number): Promise<void>;
    clearProcessedCache(): void;
    private _markMessageProcessed;
    private _isRecentlyProcessed;
    private _clearProcessedMarker;
    coordinatorDispatchLoop(): Promise<void>;
    publishDispatchTickets(orderedMessages: QueueEntry[]): Promise<number>;
    getAvailableTickets(): Promise<TicketData[]>;
    claimFromTicket(ticket: TicketData): Promise<ClaimedMessage | null>;
    markTicketProcessed(ticketId: string): Promise<void>;
    releaseTicket(ticketId: string): Promise<void>;
    recoverStalledTickets(): Promise<void>;
}

interface Logger$e {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Database$7 {
    createResource(config: ResourceConfig$6): Promise<Resource$b>;
    resources: Record<string, Resource$b>;
}
interface Resource$b {
    name: string;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    query(filter: Record<string, unknown>, options?: QueryOptions$2): Promise<Record<string, unknown>[]>;
}
interface ResourceConfig$6 {
    name: string;
    attributes: Record<string, string>;
    behavior?: string;
    partitions?: Record<string, PartitionConfig$2>;
}
interface PartitionConfig$2 {
    fields: Record<string, string>;
}
interface QueryOptions$2 {
    limit?: number;
    offset?: number;
}
type JobAction = (database: Database$7, context: JobContext, scheduler: SchedulerPlugin$1) => Promise<unknown>;
interface JobConfig$1 {
    schedule: string;
    description?: string;
    action: JobAction;
    enabled?: boolean;
    retries?: number;
    timeout?: number;
}
interface JobData extends JobConfig$1 {
    enabled: boolean;
    retries: number;
    timeout: number;
    lastRun: Date | null;
    nextRun: Date | null;
    runCount: number;
    successCount: number;
    errorCount: number;
}
interface JobContext {
    jobName: string;
    executionId: string;
    scheduledTime: Date;
    database: Database$7;
}
interface JobStatistics {
    totalRuns: number;
    totalSuccesses: number;
    totalErrors: number;
    avgDuration: number;
    lastRun: Date | null;
    lastSuccess: Date | null;
    lastError: JobError | null;
}
interface JobError {
    time: Date;
    message: string;
}
interface JobStatus {
    name: string;
    enabled: boolean;
    schedule: string;
    description?: string;
    lastRun: Date | null;
    nextRun: Date | null;
    isRunning: boolean;
    statistics: {
        totalRuns: number;
        totalSuccesses: number;
        totalErrors: number;
        successRate: number;
        avgDuration: number;
        lastSuccess: Date | null;
        lastError: JobError | null;
    };
}
interface JobHistoryEntry {
    id: string;
    status: string;
    startTime: Date;
    endTime: Date | null;
    duration: number;
    result: unknown;
    error: string | null;
    retryCount: number;
}
interface JobHistoryOptions {
    limit?: number;
    status?: string | null;
}
type JobStartHook = (jobName: string, context: JobContext) => void | Promise<void>;
type JobCompleteHook = (jobName: string, result: unknown, duration: number) => void | Promise<void>;
type JobErrorHook = (jobName: string, error: Error, attempt: number) => void | Promise<void>;
interface SchedulerPluginOptions {
    timezone?: string;
    jobs?: Record<string, JobConfig$1>;
    defaultTimeout?: number;
    defaultRetries?: number;
    jobHistoryResource?: string;
    persistJobs?: boolean;
    onJobStart?: JobStartHook | null;
    onJobComplete?: JobCompleteHook | null;
    onJobError?: JobErrorHook | null;
    logLevel?: string;
    logger?: Logger$e;
}
interface SchedulerConfig$1 {
    timezone: string;
    jobs: Record<string, JobConfig$1>;
    defaultTimeout: number;
    defaultRetries: number;
    jobHistoryResource: string;
    persistJobs: boolean;
    onJobStart: JobStartHook | null;
    onJobComplete: JobCompleteHook | null;
    onJobError: JobErrorHook | null;
    logLevel?: string;
}
declare class SchedulerPlugin$1 extends CoordinatorPlugin {
    namespace: string;
    logLevel: string;
    workerId: string;
    isCoordinator: boolean;
    config: SchedulerConfig$1;
    jobs: Map<string, JobData>;
    activeJobs: Map<string, string>;
    timers: Map<string, ReturnType<typeof setTimeout>>;
    statistics: Map<string, JobStatistics>;
    constructor(options?: SchedulerPluginOptions);
    private _isTestEnvironment;
    private _validateConfiguration;
    private _isValidCronExpression;
    onInstall(): Promise<void>;
    private _createJobHistoryResource;
    onBecomeCoordinator(): Promise<void>;
    onStopBeingCoordinator(): Promise<void>;
    coordinatorWork(): Promise<void>;
    private _startScheduling;
    private _scheduleNextExecution;
    private _calculateNextRun;
    _calculateNextRunFromConfig(config?: {
        enabled?: boolean;
        schedule?: string;
        timezone?: string;
    }): Date | null;
    private _executeJob;
    private _persistJobExecution;
    private _executeHook;
    runJob(jobName: string, context?: Record<string, unknown>): Promise<void>;
    enableJob(jobName: string): void;
    disableJob(jobName: string): void;
    getJobStatus(jobName: string): JobStatus | null;
    getAllJobsStatus(): JobStatus[];
    getJobHistory(jobName: string, options?: JobHistoryOptions): Promise<JobHistoryEntry[]>;
    addJob(jobName: string, jobConfig: JobConfig$1): void;
    removeJob(jobName: string): void;
    getPlugin(pluginName: string): unknown;
    start(): Promise<void>;
    stop(): Promise<void>;
}

interface Resource$a {
    name: string;
    insert(data: Record<string, unknown>): Promise<unknown>;
    update(id: string, data: Record<string, unknown>): Promise<unknown>;
    patch(id: string, data: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<void>;
    get(id: string): Promise<StateRecord | null>;
    query(filter: Record<string, unknown>, options?: QueryOptions$1): Promise<TransitionRecord[]>;
    on(event: string, handler: (...args: unknown[]) => void): void;
}
interface QueryOptions$1 {
    limit?: number;
    offset?: number;
}
interface StateRecord {
    id: string;
    machineId: string;
    entityId: string;
    currentState: string;
    context: Record<string, unknown>;
    lastTransition: string | null;
    triggerCounts?: Record<string, number>;
    updatedAt: string;
}
interface TransitionRecord {
    id: string;
    machineId: string;
    entityId: string;
    fromState: string;
    toState: string;
    event: string;
    context: Record<string, unknown>;
    timestamp: number;
    createdAt: string;
}
interface Database$6 {
    resources: Record<string, Resource$a>;
    pluginRegistry: PluginRegistry$1;
    createResource(config: ResourceConfig$5): Promise<Resource$a>;
    usePlugin(plugin: Plugin): Promise<void>;
    getResource(name: string): Promise<Resource$a>;
    on(event: string, handler: (...args: unknown[]) => void): void;
}
interface PluginRegistry$1 {
    [key: string]: Plugin;
}
interface ResourceConfig$5 {
    name: string;
    attributes: Record<string, string>;
    partitions?: Record<string, {
        fields: Record<string, string>;
    }>;
    behavior?: string;
}
type ActionHandler = (context: Record<string, unknown>, event: string, machine: ActionContext) => Promise<unknown>;
type GuardHandler = (context: Record<string, unknown>, event: string, machine: ActionContext) => Promise<boolean>;
type ConditionHandler = (context: Record<string, unknown>, entityId: string, eventData?: unknown) => Promise<boolean>;
type EventNameResolver = (context: Record<string, unknown>) => string;
interface ActionContext {
    database: Database$6;
    machineId: string;
    entityId: string;
}
interface StateConfig {
    on?: Record<string, string>;
    type?: 'final';
    entry?: string;
    exit?: string;
    guards?: Record<string, string>;
    meta?: Record<string, unknown>;
    triggers?: TriggerConfig[];
    retryConfig?: RetryConfig;
}
interface TriggerConfig {
    type: 'cron' | 'date' | 'function' | 'event';
    action?: string;
    schedule?: string;
    field?: string;
    interval?: number;
    event?: string;
    eventName?: string | EventNameResolver;
    eventSource?: Resource$a;
    condition?: ConditionHandler;
    maxTriggers?: number;
    onMaxTriggersReached?: string;
    eventOnSuccess?: string;
    sendEvent?: string;
    targetState?: string;
}
interface MachineConfig {
    initialState: string;
    states: Record<string, StateConfig>;
    resource?: string | Resource$a;
    stateField?: string;
    retryConfig?: RetryConfig;
    config?: MachineConfig;
}
interface RetryConfig {
    maxAttempts?: number;
    backoffStrategy?: 'exponential' | 'linear' | 'fixed';
    baseDelay?: number;
    maxDelay?: number;
    retryableErrors?: string[];
    nonRetriableErrors?: string[];
    onRetry?: (attempt: number, error: Error, context: Record<string, unknown>) => Promise<void>;
}
interface SchedulerConfig {
    [key: string]: unknown;
}
interface StateMachinePluginOptions {
    resourceNames?: {
        transitionLog?: string;
        states?: string;
    };
    stateMachines?: Record<string, MachineConfig>;
    actions?: Record<string, ActionHandler>;
    guards?: Record<string, GuardHandler>;
    persistTransitions?: boolean;
    transitionLogResource?: string;
    stateResource?: string;
    retryAttempts?: number;
    retryDelay?: number;
    workerId?: string;
    lockTimeout?: number;
    lockTTL?: number;
    retryConfig?: RetryConfig | null;
    enableScheduler?: boolean;
    schedulerConfig?: SchedulerConfig;
    enableDateTriggers?: boolean;
    enableFunctionTriggers?: boolean;
    enableEventTriggers?: boolean;
    triggerCheckInterval?: number;
    logLevel?: string;
    [key: string]: unknown;
}
interface StateMachineConfig {
    stateMachines: Record<string, MachineConfig>;
    actions: Record<string, ActionHandler>;
    guards: Record<string, GuardHandler>;
    persistTransitions: boolean;
    transitionLogResource: string;
    stateResource: string;
    retryAttempts: number;
    retryDelay: number;
    workerId: string;
    lockTimeout: number;
    lockTTL: number;
    retryConfig: RetryConfig | null;
    enableScheduler: boolean;
    schedulerConfig: SchedulerConfig;
    enableDateTriggers: boolean;
    enableFunctionTriggers: boolean;
    enableEventTriggers: boolean;
    triggerCheckInterval: number;
    logLevel?: string;
}
interface MachineData {
    config: MachineConfig;
    currentStates: Map<string, string>;
}
interface ResourceNames$1 {
    transitionLog: string;
    states: string;
}
interface TransitionResult {
    from: string;
    to: string;
    event: string;
    timestamp: string;
}
interface TransitionHistoryEntry {
    from: string;
    to: string;
    event: string;
    context: Record<string, unknown>;
    timestamp: string;
}
interface TransitionHistoryOptions {
    limit?: number;
    offset?: number;
}
declare class StateMachinePlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: StateMachineConfig;
    machines: Map<string, MachineData>;
    resourceNames: ResourceNames$1;
    triggerJobNames: string[];
    schedulerPlugin: (Plugin & {
        stop(): Promise<void>;
    }) | null;
    _pendingEventHandlers: Set<Promise<void>>;
    private _resourceDescriptors;
    constructor(options?: StateMachinePluginOptions);
    private _resolveResourceNames;
    onNamespaceChanged(): void;
    waitForPendingEvents(timeout?: number): Promise<void>;
    private _validateConfiguration;
    onInstall(): Promise<void>;
    private _createStateResources;
    send(machineId: string, entityId: string, event: string, context?: Record<string, unknown>): Promise<TransitionResult>;
    private _executeAction;
    private _transition;
    private _acquireTransitionLock;
    private _releaseTransitionLock;
    private _calculateBackoff;
    getState(machineId: string, entityId: string): Promise<string>;
    getValidEvents(machineId: string, stateOrEntityId: string): Promise<string[]>;
    getTransitionHistory(machineId: string, entityId: string, options?: TransitionHistoryOptions): Promise<TransitionHistoryEntry[]>;
    initializeEntity(machineId: string, entityId: string, context?: Record<string, unknown>): Promise<string>;
    getMachineDefinition(machineId: string): MachineConfig | null;
    getMachines(): string[];
    visualize(machineId: string): string;
    private _getEntitiesInState;
    private _incrementTriggerCount;
    private _setupTriggers;
    private _createCronJob;
    private _setupDateTrigger;
    private _setupFunctionTrigger;
    private _setupEventTrigger;
    private _attachStateMachinesToResources;
    start(): Promise<void>;
    stop(): Promise<void>;
}

type TTLGranularity = 'minute' | 'hour' | 'day' | 'week';
type TTLExpireStrategy = 'soft-delete' | 'hard-delete' | 'archive' | 'callback';
interface TTLResourceConfig {
    ttl?: number;
    field?: string;
    onExpire: TTLExpireStrategy;
    deleteField?: string;
    archiveResource?: string;
    keepOriginalId?: boolean;
    callback?: (record: Record<string, unknown>, resource: Resource$j) => Promise<boolean>;
    granularity?: TTLGranularity;
}
interface TTLPluginOptions {
    resources?: Record<string, TTLResourceConfig>;
    batchSize?: number;
    schedules?: Partial<Record<TTLGranularity, string>>;
    resourceFilter?: (resourceName: string) => boolean;
    resourceAllowlist?: string[];
    resourceBlocklist?: string[];
    resourceNames?: {
        index?: string;
    };
    indexResourceName?: string;
    logLevel?: string;
    namespace?: string;
    [key: string]: unknown;
}
interface TTLStats {
    totalScans: number;
    totalExpired: number;
    totalDeleted: number;
    totalArchived: number;
    totalSoftDeleted: number;
    totalCallbacks: number;
    totalErrors: number;
    lastScanAt: string | null;
    lastScanDuration: number;
}
declare class TTLPlugin extends CoordinatorPlugin {
    config: TTLPluginOptions & {
        logLevel?: string;
    };
    resources: Record<string, TTLResourceConfig>;
    resourceFilter: (resourceName: string) => boolean;
    batchSize: number;
    schedules: Partial<Record<TTLGranularity, string>>;
    stats: TTLStats;
    isRunning: boolean;
    expirationIndex: Resource$j | null;
    indexResourceName: string;
    private _indexResourceDescriptor;
    constructor(options?: TTLPluginOptions);
    private _buildResourceFilter;
    install(database: Database$a): Promise<void>;
    private _resolveIndexResourceName;
    onNamespaceChanged(): void;
    private _validateResourceConfig;
    private _createExpirationIndex;
    private _setupResourceHooks;
    private _addToIndex;
    private _removeFromIndex;
    onBecomeCoordinator(): Promise<void>;
    onStopBeingCoordinator(): Promise<void>;
    coordinatorWork(): Promise<void>;
    private _startIntervals;
    private _cleanupGranularity;
    private _processExpiredEntry;
    private _softDelete;
    private _hardDelete;
    private _archive;
    cleanupResource(resourceName: string): Promise<{
        resource: string;
        granularity: TTLGranularity;
    }>;
    runCleanup(): Promise<void>;
    getStats(): TTLStats & {
        resources: number;
        isRunning: boolean;
        cronJobs: number;
    };
    onStop(): Promise<void>;
    uninstall(): Promise<void>;
}

type DistanceMetric = 'cosine' | 'euclidean' | 'manhattan';
type DistanceFunction = (a: number[], b: number[]) => number;
interface VectorPluginOptions extends Record<string, unknown> {
    dimensions?: number;
    distanceMetric?: DistanceMetric;
    storageThreshold?: number;
    autoFixBehavior?: boolean;
    autoDetectVectorField?: boolean;
    emitEvents?: boolean;
    verboseEvents?: boolean;
    eventThrottle?: number;
    logLevel?: string;
    logLevelEvents?: boolean;
    logger?: Logger$i;
}
interface VectorPluginConfig extends VectorPluginOptions {
    dimensions: number;
    distanceMetric: DistanceMetric;
    storageThreshold: number;
    autoFixBehavior: boolean;
    autoDetectVectorField: boolean;
    emitEvents: boolean;
    verboseEvents: boolean;
    eventThrottle: number;
}
interface VectorSearchOptions {
    vectorField?: string;
    limit?: number;
    distanceMetric?: DistanceMetric;
    threshold?: number | null;
    partition?: string | null;
    partitionValues?: Record<string, unknown> | null;
}
interface VectorSearchResult {
    record: Record<string, unknown>;
    distance: number;
}
interface ClusterOptions {
    vectorField?: string;
    k?: number;
    distanceMetric?: DistanceMetric;
    partition?: string | null;
    partitionValues?: Record<string, unknown> | null;
    maxIterations?: number;
    [key: string]: unknown;
}
interface ClusterResult {
    clusters: Array<Array<Record<string, unknown>>>;
    centroids: number[][];
    inertia: number;
    iterations: number;
    converged: boolean;
}
interface VectorFieldInfo {
    name: string;
    length: number;
    estimatedBytes: number;
}
interface AutoPartitionConfig {
    partitionName: string;
    partitionValues: Record<string, boolean>;
}
interface FindOptimalKOptions {
    minK?: number;
    maxK?: number;
    maxIterations?: number;
    tolerance?: number;
    distanceFn?: DistanceFunction;
}
declare class VectorPlugin extends Plugin {
    config: VectorPluginConfig;
    distanceFunctions: Record<DistanceMetric, DistanceFunction>;
    private _vectorFieldCache;
    private _throttleState;
    constructor(options?: VectorPluginOptions);
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(): Promise<void>;
    validateVectorStorage(): void;
    setupEmbeddingPartitions(resource: Resource$j, vectorFields: VectorFieldInfo[]): void;
    isFieldOptional(attributes: Record<string, unknown>, fieldPath: string): boolean;
    capitalize(str: string): string;
    installEmbeddingHooks(resource: Resource$j, vectorField: string, trackingField: string): void;
    hasVectorValue(data: Record<string, unknown>, fieldPath: string): boolean;
    hasNestedKey(obj: Record<string, unknown>, path: string): boolean;
    getNestedValue(obj: Record<string, unknown>, path: string): unknown;
    setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void;
    getAutoEmbeddingPartition(resource: Resource$j, vectorField: string): AutoPartitionConfig | null;
    detectVectorField(resource: Resource$j): string | null;
    private _findEmbeddingField;
    private _emitEvent;
    findVectorFields(attributes: Record<string, unknown>, path?: string): VectorFieldInfo[];
    estimateVectorBytes(dimensions: number): number;
    installResourceMethods(): void;
    createVectorSearchMethod(resource: Resource$j): (queryVector: number[], options?: VectorSearchOptions) => Promise<VectorSearchResult[]>;
    createClusteringMethod(resource: Resource$j): (options?: ClusterOptions) => Promise<ClusterResult>;
    createDistanceMethod(): (vector1: number[], vector2: number[], metric?: DistanceMetric) => number;
    static normalize(vector: number[]): number[];
    static dotProduct(vector1: number[], vector2: number[]): number;
    static findOptimalK(vectors: number[][], options?: FindOptimalKOptions): Promise<unknown>;
}

interface ModelConfig {
    type: 'regression' | 'classification' | 'timeseries' | 'neural-network';
    resource: string;
    features: string[];
    target: string;
    partition?: {
        name: string;
        values: Record<string, any>;
    };
    autoTrain?: boolean;
    trainInterval?: number;
    trainAfterInserts?: number;
    saveModel?: boolean;
    saveTrainingData?: boolean;
    modelConfig?: Record<string, any>;
    filter?: (item: any) => boolean;
    map?: (item: any) => any;
    [key: string]: any;
}
interface MLPluginOptions {
    models?: Record<string, ModelConfig>;
    verbose?: boolean;
    minTrainingSamples?: number;
    saveModel?: boolean;
    saveTrainingData?: boolean;
    enableVersioning?: boolean;
    logger?: any;
    logLevel?: string;
}
interface ModelStats {
    loss?: number;
    accuracy?: number;
    r2?: number;
    samples?: number;
    isTrained?: boolean;
}
interface ModelInstance {
    isTrained: boolean;
    dispose?: () => void;
    export: () => Promise<any>;
    import: (data: any) => Promise<void>;
    train: (data: any[]) => Promise<any>;
    predict: (input: any) => Promise<any>;
    predictBatch: (inputs: any[]) => Promise<any[]>;
    getStats: () => ModelStats;
}
declare class MLPlugin extends Plugin {
    config: Required<MLPluginOptions> & {
        models: Record<string, ModelConfig>;
    };
    models: Record<string, ModelInstance>;
    _dependenciesValidated: boolean;
    modelVersions: Map<string, {
        currentVersion: number;
        latestVersion: number;
    }>;
    modelCache: Map<string, string>;
    training: Map<string, boolean>;
    insertCounters: Map<string, number>;
    _pendingAutoTrainingHandlers: Map<string, (createdName: string) => void>;
    _autoTrainingInitialized: Set<string>;
    cronManager: any;
    jobNames: Map<string, string>;
    stats: {
        totalTrainings: number;
        totalPredictions: number;
        totalErrors: number;
        startedAt: string | null;
    };
    constructor(options?: MLPluginOptions);
    /**
     * Install the plugin
     */
    onInstall(): Promise<void>;
    /**
     * Start the plugin
     */
    onStart(): Promise<void>;
    /**
     * Stop the plugin
     */
    onStop(): Promise<void>;
    /**
     * Uninstall the plugin
     */
    onUninstall(options?: {
        purgeData?: boolean;
    }): Promise<void>;
    /**
     * Build model cache for fast lookup
     * @private
     */
    _buildModelCache(): void;
    /**
     * Inject ML methods into Resource prototype
     * @private
     */
    _injectResourceMethods(): void;
    /**
     * Find model for a resource and target attribute
     * @private
     */
    _findModelForResource(resourceName: string, targetAttribute: string): string | null;
    /**
     * Auto-setup and train ML model (resource.ml.learn implementation)
     * @param resourceName - Resource name
     * @param target - Target attribute to predict
     * @param options - Configuration options
     * @returns Training results
     * @private
     */
    _resourceLearn(resourceName: string, target: string, options?: any): Promise<any>;
    /**
     * Auto-detect model type based on target attribute
     * @param resourceName - Resource name
     * @param target - Target attribute
     * @returns Model type
     * @private
     */
    _autoDetectType(resourceName: string, target: string): Promise<string>;
    /**
     * Auto-select best features for prediction
     * @param resourceName - Resource name
     * @param target - Target attribute
     * @returns Selected features
     * @private
     */
    _autoSelectFeatures(resourceName: string, target: string): Promise<string[]>;
    /**
     * Get default model config for type
     * @param type - Model type
     * @returns Default config
     * @private
     */
    _getDefaultModelConfig(type: string): Record<string, any>;
    /**
     * Resource predict implementation
     * @private
     */
    _resourcePredict(resourceName: string, input: any, targetAttribute: string): Promise<any>;
    /**
     * Resource trainModel implementation
     * @private
     */
    _resourceTrainModel(resourceName: string, targetAttribute: string, options?: any): Promise<any>;
    /**
     * List models for a resource
     * @private
     */
    _resourceListModels(resourceName: string): any[];
    /**
     * Validate model configuration
     * @private
     */
    _validateModelConfig(modelName: string, config: ModelConfig): void;
    /**
     * Initialize a model instance
     * @private
     */
    _initializeModel(modelName: string, config: ModelConfig): Promise<void>;
    /**
     * Setup auto-training for a model
     * @private
    */
    _setupAutoTraining(modelName: string, config: ModelConfig): void;
    /**
     * Train a model
     * @param modelName - Model name
     * @param options - Training options
     * @returns Training results
     */
    train(modelName: string, options?: any): Promise<any>;
    /**
     * Make a prediction
     * @param modelName - Model name
     * @param input - Input data (object for single prediction, array for time series)
     * @returns Prediction result
     */
    predict(modelName: string, input: any): Promise<any>;
    /**
     * Make predictions for multiple inputs
     * @param modelName - Model name
     * @param inputs - Array of input objects
     * @returns Array of prediction results
     */
    predictBatch(modelName: string, inputs: any[]): Promise<any[]>;
    /**
     * Retrain a model (reset and train from scratch)
     * @param modelName - Model name
     * @param options - Options
     * @returns Training results
     */
    retrain(modelName: string, options?: any): Promise<any>;
    /**
     * Get model statistics
     * @param modelName - Model name
     * @returns Model stats
     */
    getModelStats(modelName: string): ModelStats;
    /**
     * Get plugin statistics
     * @returns Plugin stats
     */
    getStats(): any;
    /**
     * Export a model
     * @param modelName - Model name
     * @returns Serialized model
     */
    exportModel(modelName: string): Promise<any>;
    /**
     * Import a model
     * @param modelName - Model name
     * @param data - Serialized model data
     */
    importModel(modelName: string, data: any): Promise<void>;
    /**
     * Initialize versioning for a model
     * @private
     */
    _initializeVersioning(modelName: string): Promise<void>;
    /**
     * Get next version number for a model
     * @private
     */
    _getNextVersion(modelName: string): number;
    /**
     * Update version info in storage
     * @private
     */
    _updateVersionInfo(modelName: string, version: number): Promise<void>;
    /**
     * Save model to plugin storage
     * @private
     */
    _saveModel(modelName: string): Promise<void>;
    /**
     * Save intermediate training data to plugin storage (incremental - only new samples)
     * @private
     */
    _saveTrainingData(modelName: string, rawData: any[]): Promise<void>;
    /**
     * Load model from plugin storage
     * @private
     */
    _loadModel(modelName: string): Promise<void>;
    /**
     * Load training data from plugin storage (reconstructs specific version from incremental data)
     * @param modelName - Model name
     * @param version - Version number (optional, defaults to latest)
     * @returns Training data or null if not found
     */
    getTrainingData(modelName: string, version?: number | null): Promise<any | null>;
    /**
     * Delete model from plugin storage (all versions)
     * @private
     */
    _deleteModel(modelName: string): Promise<void>;
    /**
     * Delete training data from plugin storage (all versions)
     * @private
     */
    _deleteTrainingData(modelName: string): Promise<void>;
    /**
     * List all versions of a model
     * @param modelName - Model name
     * @returns List of version info
     */
    listModelVersions(modelName: string): Promise<any[]>;
    /**
     * Load a specific version of a model
     * @param modelName - Model name
     * @param version - Version number
     */
    loadModelVersion(modelName: string, version: number): Promise<any>;
    /**
     * Set active version for a model (used for predictions)
     * @param modelName - Model name
     * @param version - Version number
     */
    setActiveVersion(modelName: string, version: number): Promise<any>;
    /**
     * Get training history for a model
     * @param modelName - Model name
     * @returns Training history
     */
    getTrainingHistory(modelName: string): Promise<any>;
    /**
     * Compare metrics between two versions
     * @param modelName - Model name
     * @param version1 - First version
     * @param version2 - Second version
     * @returns Comparison results
     */
    compareVersions(modelName: string, version1: number, version2: number): Promise<any>;
    /**
     * Rollback to a previous version
     * @param modelName - Model name
     * @param version - Version to rollback to (defaults to previous version)
     * @returns Rollback info
     */
    rollbackVersion(modelName: string, version?: number | null): Promise<any>;
}

type SMTPMode = 'relay' | 'server';
type SMTPDriver = 'sendgrid' | 'aws-ses' | 'mailgun' | 'postmark' | 'smtp' | string;
type RelayStrategy = 'failover' | 'round-robin' | 'domain-based';
type TemplateEngineType = 'handlebars' | 'custom';
type WebhookProvider = 'sendgrid' | 'aws-ses' | 'mailgun' | 'postmark' | string;
type EmailStatus = 'pending' | 'sent' | 'failed' | 'bounced' | 'complained' | 'opened' | 'clicked';
type BounceType = 'hard' | 'soft';
type ComplaintType = 'abuse' | 'fraud' | 'general' | 'not-spam';
interface SMTPAuth$1 {
    user?: string;
    pass?: string;
}
interface RetryPolicy {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    multiplier: number;
    jitter: number;
}
interface RateLimitConfig$2 {
    maxPerSecond: number;
    maxQueueDepth: number;
}
interface RelayConfig {
    driver: SMTPDriver;
    config: Record<string, unknown>;
    from?: string;
    [key: string]: unknown;
}
interface SMTPPluginOptions {
    mode?: SMTPMode;
    driver?: SMTPDriver | null;
    config?: Record<string, unknown>;
    relays?: RelayConfig[] | null;
    relayStrategy?: RelayStrategy;
    from?: string | null;
    host?: string | null;
    port?: number | null;
    secure?: boolean;
    auth?: SMTPAuth$1;
    emailResource?: string;
    retryPolicy?: Partial<RetryPolicy>;
    rateLimit?: Partial<RateLimitConfig$2>;
    templateEngine?: TemplateEngineType;
    templateDir?: string | null;
    maxAttachmentSize?: number;
    maxEmailSize?: number;
    webhookSecret?: string | null;
    webhookPath?: string;
    webhookProvider?: WebhookProvider;
    webhookMaxEventLogSize?: number;
    requireAuth?: boolean;
    serverPort?: number;
    serverHost?: string;
    [key: string]: unknown;
}
interface EmailAttachment {
    filename: string;
    content?: string | Buffer;
    size?: number;
    contentType?: string;
    path?: string;
    cid?: string;
}
interface SendEmailOptions$1 {
    from: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    body?: string;
    html?: string;
    template?: string;
    templateData?: Record<string, unknown>;
    attachments?: EmailAttachment[];
    metadata?: Record<string, unknown>;
}
interface EmailRecord {
    id: string;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    html?: string;
    template?: string;
    templateData?: Record<string, unknown>;
    attachments: EmailAttachment[];
    status: EmailStatus;
    errorCode?: string;
    errorMessage?: string;
    attempts: number;
    maxAttempts: number;
    nextRetryAt?: number;
    sentAt?: number;
    failedAt?: number;
    bounceType?: BounceType;
    complaintType?: ComplaintType;
    messageId?: string;
    metadata: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
}
interface SendResult {
    messageId?: string;
    relayUsed?: string | null;
}
interface WebhookEvent {
    type: string;
    messageId: string;
    timestamp: number;
    bounceType?: BounceType;
    complaintType?: ComplaintType;
    reason?: string;
    userAgent?: string;
    ip?: string;
    url?: string;
}
interface WebhookProcessResult {
    processed: boolean;
    eventType?: string;
    [key: string]: unknown;
}
interface PluginStatus {
    name: string;
    mode: SMTPMode;
    queuedEmails: number;
    rateLimitTokens: number;
    configType?: 'multi-relay' | 'driver' | 'legacy';
    relayStatus?: unknown;
    driver?: string;
    driverInfo?: unknown;
    connected?: boolean;
}
interface SMTPDriverInstance {
    name: string;
    sendEmail: (options: {
        from: string;
        to: string[];
        cc: string[];
        bcc: string[];
        subject: string;
        body?: string;
        html?: string;
        attachments: EmailAttachment[];
    }) => Promise<SendResult>;
    getInfo: () => unknown;
}
interface MultiRelayManagerInstance {
    initialize: (relays: RelayConfig[]) => Promise<void>;
    sendEmail: (options: {
        from: string;
        to: string[];
        cc: string[];
        bcc: string[];
        subject: string;
        body?: string;
        html?: string;
        attachments: EmailAttachment[];
    }) => Promise<SendResult>;
    getStatus: () => unknown;
}
interface SMTPConnectionManagerInstance {
    initialize: () => Promise<void>;
    sendEmail: (options: {
        from: string;
        to: string;
        cc?: string;
        bcc?: string;
        subject: string;
        text?: string;
        html?: string;
        attachments: EmailAttachment[];
    }) => Promise<SendResult>;
    close: () => Promise<void>;
    _isConnected: boolean;
}
interface SMTPTemplateEngineInstance {
    render: (templateName: string, data: Record<string, unknown>) => Promise<{
        subject?: string;
        body?: string;
        html?: string;
    }>;
    registerHelper: (name: string, fn: Function) => void;
    registerPartial: (name: string, template: string) => void;
    clearCache: () => void;
    getCacheStats: () => unknown;
}
interface WebhookReceiverInstance {
    processWebhook: (body: unknown, headers: Record<string, string>) => Promise<WebhookProcessResult>;
    on: (eventType: string, handler: (event: WebhookEvent) => Promise<void>) => void;
    getEventLog: (limit?: number) => unknown[];
    clearEventLog: () => void;
    getHandlerCount: () => number;
}
declare class SMTPPlugin extends Plugin {
    mode: SMTPMode;
    from: string | null;
    emailResource: string;
    useDriverPattern: boolean;
    driver: SMTPDriver | null;
    config: Record<string, unknown>;
    relays: RelayConfig[] | null;
    relayStrategy: RelayStrategy;
    host: string | null;
    port: number | null;
    secure: boolean;
    auth: SMTPAuth$1;
    templateDir: string | null;
    maxAttachmentSize: number;
    maxEmailSize: number;
    webhookSecret: string | null;
    webhookPath: string;
    retryPolicy: RetryPolicy;
    rateLimit: RateLimitConfig$2;
    connectionManager: SMTPConnectionManagerInstance | null;
    templateEngine: SMTPTemplateEngineInstance;
    webhookReceiver: WebhookReceiverInstance;
    multiRelayManager?: MultiRelayManagerInstance;
    relayDriver?: SMTPDriverInstance;
    smtpHooks: Map<string, Function[]>;
    private _emailQueue;
    private _queuedCount;
    private _rateLimitTokens;
    private _lastRateLimitRefill;
    private _rateLimitCarry;
    constructor(options?: SMTPPluginOptions);
    initialize(): Promise<void>;
    private _initializeDriverMode;
    private _initializeLegacyMode;
    private _initializeServerMode;
    private _ensureEmailResource;
    sendEmail(options: SendEmailOptions$1): Promise<EmailRecord>;
    private _validateEmailOptions;
    private _validateAttachments;
    private _renderTemplate;
    registerTemplateHelper(name: string, fn: Function): void;
    registerTemplatePartial(name: string, template: string): void;
    clearTemplateCache(): void;
    getTemplateCacheStats(): unknown;
    processWebhook(body: unknown, headers?: Record<string, string>): Promise<WebhookProcessResult>;
    onWebhookEvent(eventType: string, handler?: (event: WebhookEvent) => Promise<void>): void;
    private _handleWebhookEvent;
    getWebhookEventLog(limit?: number): unknown[];
    clearWebhookEventLog(): void;
    getWebhookHandlerCount(): number;
    private _checkRateLimit;
    private _createEmailRecord;
    private _updateEmailStatus;
    private _handleSendError;
    private _calculateBackoff;
    close(): Promise<void>;
    getStatus(): PluginStatus;
    static getAvailableDrivers(): string[];
}

interface FormatConfig {
    bestOf?: number;
    pointsWin?: number;
    pointsDraw?: number;
    pointsLoss?: number;
    [key: string]: unknown;
}
interface Bracket {
    config?: FormatConfig;
    rounds?: number;
    matches?: BracketMatch[][];
    winnersMatches?: BracketMatch[][];
    losersMatches?: BracketMatch[][];
    winnersRounds?: number;
    losersRounds?: number;
    grandFinals?: GrandFinals;
    grandFinalsReset?: boolean | null;
    thirdPlaceMatch?: ThirdPlaceMatch | null;
    participants?: string[];
    groups?: Group[];
    schedule?: ScheduleRound[];
    currentRound?: number;
    roundMatches?: RoundMatch[];
    rankings?: LadderRanking$1[];
    pendingChallenges?: PendingChallenge[];
    events?: CircuitEvent$1[];
    divisions?: Division$1[];
    season?: number;
    [key: string]: unknown;
}
interface BracketMatch {
    id: string;
    round: number;
    matchNumber: number;
    participant1Id: string | null;
    participant2Id: string | null;
    winnerId: string | null;
    loserId?: string | null;
    status: MatchStatus$1;
    bestOf?: number;
    nextMatchId?: string | null;
    loserNextMatchId?: string | null;
    score1?: number;
    score2?: number;
    groupId?: string | null;
}
interface GrandFinals {
    id?: string;
    participant1Id: string | null;
    participant2Id: string | null;
    winnerId: string | null;
    loserId?: string | null;
    status: MatchStatus$1;
}
interface ThirdPlaceMatch {
    id: string;
    round: number;
    participant1Id: string | null;
    participant2Id: string | null;
    status: MatchStatus$1;
    winnerId: string | null;
}
interface Group {
    id: string;
    name: string;
    participants: string[];
    matches: BracketMatch[];
    standings: GroupStanding[];
}
interface GroupStanding {
    participantId: string;
    rank: number;
    points: number;
    wins: number;
    losses: number;
    draws: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
}
interface ScheduleRound {
    round: number;
    matches: BracketMatch[];
}
interface RoundMatch {
    round: number;
    pairings: SwissPairing[];
}
interface SwissPairing {
    id: string;
    participant1Id: string | null;
    participant2Id: string | null;
    winnerId: string | null;
    status: MatchStatus$1;
}
interface LadderRanking$1 {
    participantId: string;
    rank: number;
    rating: number;
    wins: number;
    losses: number;
    streak: number;
    lastActivity: number;
    protectedUntil?: number;
}
interface PendingChallenge {
    id: string;
    challengerId: string;
    defenderId: string;
    status: 'pending' | 'accepted' | 'declined' | 'completed';
    createdAt: number;
    expiresAt: number;
}
interface CircuitEvent$1 {
    id: string;
    name: string;
    tier: string;
    points: Record<number, number>;
    results: CircuitResult[];
    completedAt?: number;
}
interface CircuitResult {
    participantId: string;
    placement: number;
    points: number;
}
interface Division$1 {
    id: string;
    name: string;
    tier: number;
    participants: string[];
    schedule: ScheduleRound[];
    standings: DivisionStanding[];
    promotionSpots?: number;
    relegationSpots?: number;
}
interface DivisionStanding {
    participantId: string;
    rank: number;
    points: number;
    wins: number;
    losses: number;
    draws: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
}
type MatchStatus$1 = 'pending' | 'scheduled' | 'in-progress' | 'completed' | 'bye' | 'cancelled';
interface Match$1 {
    id: string;
    tournamentId?: string;
    phase: string;
    round: number;
    matchNumber: number;
    participant1Id: string | null;
    participant2Id: string | null;
    bestOf: number;
    score1: number;
    score2: number;
    games: Game$1[];
    winnerId: string | null;
    loserId: string | null;
    status: MatchStatus$1;
    nextMatchId: string | null;
    loserNextMatchId?: string | null;
    groupId: string | null;
    scheduledAt: number | null;
    startedAt: number | null;
    completedAt: number | null;
    metadata: Record<string, unknown>;
}
interface Game$1 {
    gameNumber: number;
    score1: number;
    score2: number;
    winnerId: string | null;
    completedAt?: number;
    metadata?: Record<string, unknown>;
}
interface Standing {
    participantId: string;
    rank?: number;
    placement?: number;
    points?: number;
    wins?: number;
    losses?: number;
    draws?: number;
    played?: number;
    goalsFor?: number;
    goalsAgainst?: number;
    goalDifference?: number;
    tiebreaker?: number;
    buchholz?: number;
    rating?: number;
    eliminatedPhase?: string | null;
    eliminatedRound?: number;
    [key: string]: unknown;
}

interface TournamentCreateOptions$1 {
    name: string;
    organizerId: string;
    format: string;
    participantType?: string;
    participantResource?: string | null;
    config?: FormatConfig;
    metadata?: Record<string, unknown>;
}
interface TournamentRecord$1 {
    id: string;
    name: string;
    organizerId: string;
    format: string;
    participantType: string;
    participantResource: string | null;
    status: string;
    config: FormatConfig;
    participants: string[];
    bracket: Bracket | null;
    standings: Standing[];
    currentPhase: string | null;
    currentRound: number;
    metadata: Record<string, unknown>;
    startedAt: number | null;
    completedAt: number | null;
}
interface TournamentListFilters$1 {
    organizerId?: string;
    status?: string;
    format?: string;
    limit?: number;
}
interface RegistrationRecord$1 {
    participantId: string;
}
interface MatchRecord$1 extends Match$1 {
    tournamentId: string;
}
interface TournamentPlugin$3 {
    tournamentsResource: {
        insert(data: Record<string, unknown>): Promise<TournamentRecord$1>;
        get(id: string): Promise<TournamentRecord$1 | null>;
        update(id: string, data: Record<string, unknown>): Promise<TournamentRecord$1>;
        delete(id: string): Promise<void>;
        list(options: {
            limit: number;
        }): Promise<TournamentRecord$1[]>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
            limit?: number;
        }): Promise<TournamentRecord$1[]>;
    };
    logger: {
        debug(data: Record<string, unknown>, message: string): void;
        info(data: Record<string, unknown>, message: string): void;
        warn(data: Record<string, unknown>, message: string): void;
    };
    emit(event: string, data: Record<string, unknown>): void;
    matchManager: {
        create(data: Record<string, unknown>): Promise<MatchRecord$1>;
        deleteByTournament(id: string): Promise<number>;
        getByTournament(id: string): Promise<MatchRecord$1[]>;
    };
    registrationManager: {
        getConfirmed(id: string): Promise<RegistrationRecord$1[]>;
        deleteByTournament(id: string): Promise<number>;
    };
}
declare class TournamentManager {
    private plugin;
    private logger;
    constructor(plugin: TournamentPlugin$3);
    get resource(): {
        insert(data: Record<string, unknown>): Promise<TournamentRecord$1>;
        get(id: string): Promise<TournamentRecord$1 | null>;
        update(id: string, data: Record<string, unknown>): Promise<TournamentRecord$1>;
        delete(id: string): Promise<void>;
        list(options: {
            limit: number;
        }): Promise<TournamentRecord$1[]>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
            limit?: number;
        }): Promise<TournamentRecord$1[]>;
    };
    create(options: TournamentCreateOptions$1): Promise<TournamentRecord$1>;
    get(id: string): Promise<TournamentRecord$1 | null>;
    update(id: string, data: Partial<TournamentRecord$1>): Promise<TournamentRecord$1>;
    delete(id: string): Promise<void>;
    list(filters?: TournamentListFilters$1): Promise<TournamentRecord$1[]>;
    openRegistration(id: string): Promise<void>;
    closeRegistration(id: string): Promise<void>;
    start(id: string): Promise<void>;
    cancel(id: string, reason?: string): Promise<void>;
    complete(id: string): Promise<void>;
    getStandings(id: string): Promise<Standing[]>;
    getBracket(id: string): Promise<Bracket | null>;
    updateBracket(tournamentId: string, completedMatch: Match$1): Promise<{
        bracket: Bracket;
        newMatches: Match$1[];
    }>;
}

interface GameResult {
    score1: number;
    score2: number;
    metadata?: Record<string, unknown>;
}
interface MatchResult$2 {
    score1: number;
    score2: number;
    games?: GameResult[];
    metadata?: Record<string, unknown>;
}
interface MatchCreateData {
    id?: string;
    tournamentId: string;
    phase?: string;
    round: number;
    matchNumber: number;
    participant1Id?: string | null;
    participant2Id?: string | null;
    bestOf?: number;
    groupId?: string | null;
    nextMatchId?: string | null;
    loserNextMatchId?: string | null;
    scheduledAt?: number | null;
    metadata?: Record<string, unknown>;
}
interface MatchFilters$1 {
    phase?: string;
    round?: number;
    status?: string;
    limit?: number;
}
interface MatchRecord extends Match$1 {
    tournamentId: string;
    loserNextMatchId?: string | null;
}
interface TournamentPlugin$2 {
    matchesResource: {
        insert(data: Record<string, unknown>): Promise<MatchRecord>;
        get(id: string): Promise<MatchRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<MatchRecord>;
        delete(id: string): Promise<void>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
            limit?: number;
        }): Promise<MatchRecord[]>;
    };
    logger: {
        debug(data: Record<string, unknown>, message: string): void;
        info(data: Record<string, unknown>, message: string): void;
        warn(data: Record<string, unknown>, message: string): void;
    };
    emit(event: string, data: Record<string, unknown>): void;
    tournamentManager: {
        updateBracket(tournamentId: string, match: MatchRecord): Promise<void>;
    };
}
declare class MatchManager {
    private plugin;
    private logger;
    constructor(plugin: TournamentPlugin$2);
    get resource(): {
        insert(data: Record<string, unknown>): Promise<MatchRecord>;
        get(id: string): Promise<MatchRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<MatchRecord>;
        delete(id: string): Promise<void>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
            limit?: number;
        }): Promise<MatchRecord[]>;
    };
    create(data: MatchCreateData): Promise<MatchRecord>;
    _determineInitialStatus(p1: string | null | undefined, p2: string | null | undefined): string;
    get(id: string): Promise<MatchRecord | null>;
    getByTournament(tournamentId: string, filters?: MatchFilters$1): Promise<MatchRecord[]>;
    deleteByTournament(tournamentId: string): Promise<number>;
    schedule(matchId: string, scheduledAt: number): Promise<void>;
    start(matchId: string): Promise<void>;
    reportResult(matchId: string, result: MatchResult$2): Promise<MatchRecord>;
    reportWalkover(matchId: string, winnerId: string, reason?: string): Promise<MatchRecord>;
    reportGame(matchId: string, game: GameResult): Promise<MatchRecord>;
    getUpcoming(tournamentId: string, limit?: number): Promise<MatchRecord[]>;
    getLive(tournamentId: string): Promise<MatchRecord[]>;
    _advanceToMatch(matchId: string, participantId: string, _slot: string, tournamentId?: string | null): Promise<void>;
    setParticipant(matchId: string, participantId: string, slot: 1 | 2): Promise<void>;
}

interface RegistrationOptions$1 {
    seed?: number | null;
    metadata?: Record<string, unknown>;
}
interface RegistrationFilters {
    status?: string;
}
interface RegistrationRecord {
    id: string;
    tournamentId: string;
    participantId: string;
    seed: number | null;
    status: string;
    registeredAt: number;
    confirmedAt: number | null;
    checkedInAt: number | null;
    metadata: Record<string, unknown>;
}
interface TournamentRecord {
    id: string;
    status: string;
    config: {
        maxParticipants?: number;
    };
}
interface BulkParticipant {
    participantId?: string;
    seed?: number;
    metadata?: Record<string, unknown>;
}
interface BulkResult {
    success: boolean;
    registration?: RegistrationRecord;
    participantId?: string;
    error?: string;
}
interface TournamentPlugin$1 {
    registrationsResource: {
        insert(data: Record<string, unknown>): Promise<RegistrationRecord>;
        get(id: string): Promise<RegistrationRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<RegistrationRecord>;
        delete(id: string): Promise<void>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
        }): Promise<RegistrationRecord[]>;
    };
    logger: {
        debug(data: Record<string, unknown>, message: string): void;
        info(data: Record<string, unknown>, message: string): void;
        warn(data: Record<string, unknown>, message: string): void;
    };
    emit(event: string, data: Record<string, unknown>): void;
    tournamentManager: {
        get(id: string): Promise<TournamentRecord | null>;
    };
}
declare class RegistrationManager {
    private plugin;
    private logger;
    constructor(plugin: TournamentPlugin$1);
    get resource(): {
        insert(data: Record<string, unknown>): Promise<RegistrationRecord>;
        get(id: string): Promise<RegistrationRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<RegistrationRecord>;
        delete(id: string): Promise<void>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
        }): Promise<RegistrationRecord[]>;
    };
    register(tournamentId: string, participantId: string, options?: RegistrationOptions$1): Promise<RegistrationRecord>;
    confirm(tournamentId: string, participantId: string): Promise<void>;
    checkIn(tournamentId: string, participantId: string): Promise<void>;
    withdraw(tournamentId: string, participantId: string, reason?: string): Promise<void>;
    getRegistration(tournamentId: string, participantId: string): Promise<RegistrationRecord | undefined>;
    getByTournament(tournamentId: string, filters?: RegistrationFilters): Promise<RegistrationRecord[]>;
    getConfirmed(tournamentId: string): Promise<RegistrationRecord[]>;
    getCount(tournamentId: string, status?: string | null): Promise<number>;
    deleteByTournament(tournamentId: string): Promise<number>;
    setSeed(tournamentId: string, participantId: string, seed: number): Promise<void>;
    shuffleSeeds(tournamentId: string): Promise<{
        participantId: string;
        seed: number;
    }[]>;
    getByParticipant(participantId: string, filters?: RegistrationFilters): Promise<RegistrationRecord[]>;
    bulkRegister(tournamentId: string, participants: (string | BulkParticipant)[]): Promise<BulkResult[]>;
    confirmAll(tournamentId: string): Promise<number>;
}

interface Resource$9 {
    name: string;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    get(id: string): Promise<Record<string, unknown> | null>;
    update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    delete(id: string): Promise<void>;
    list(options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
    listPartition(options: {
        partition: string;
        partitionValues: Record<string, unknown>;
    }): Promise<Record<string, unknown>[]>;
}
interface TournamentConfig {
    logLevel?: string;
}
interface TournamentStats {
    tournamentsCreated: number;
    matchesPlayed: number;
    registrations: number;
    errors: number;
}
type TournamentFormat = 'round-robin' | 'single-elimination' | 'double-elimination' | 'swiss' | 'group-stage' | 'league-playoffs' | 'ladder' | 'circuit' | 'promotion-relegation';
type TournamentStatus = 'draft' | 'registration_open' | 'registration_closed' | 'in_progress' | 'completed' | 'cancelled';
type ParticipantType = 'player' | 'team';
interface TournamentCreateOptions {
    name: string;
    organizerId: string;
    format: TournamentFormat;
    participantType: ParticipantType;
    participantResource?: string;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
interface TournamentUpdateData {
    name?: string;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    bracket?: Record<string, unknown>;
    standings?: unknown[];
    currentPhase?: string;
    currentRound?: number;
    status?: TournamentStatus;
}
interface TournamentListFilters {
    organizerId?: string;
    status?: TournamentStatus;
    format?: TournamentFormat;
    limit?: number;
    offset?: number;
}
interface Tournament {
    id: string;
    name: string;
    organizerId: string;
    format: TournamentFormat;
    participantType: ParticipantType;
    participantResource?: string;
    status: TournamentStatus;
    config?: Record<string, unknown>;
    participants?: string[];
    bracket?: Record<string, unknown>;
    standings?: unknown[];
    currentPhase?: string;
    currentRound?: number;
    metadata?: Record<string, unknown>;
    startedAt?: number;
    completedAt?: number;
    createdAt?: number;
    updatedAt?: number;
}
interface Match {
    id: string;
    tournamentId: string;
    phase: string;
    round: number;
    matchNumber: number;
    groupId?: string;
    participant1Id?: string;
    participant2Id?: string;
    bestOf?: number;
    games?: Game[];
    score1?: number;
    score2?: number;
    winnerId?: string;
    loserId?: string;
    status: MatchStatus;
    nextMatchId?: string;
    loserNextMatchId?: string;
    scheduledAt?: number;
    startedAt?: number;
    completedAt?: number;
    metadata?: Record<string, unknown>;
}
interface Game {
    gameNumber: number;
    score1: number;
    score2: number;
    winnerId?: string;
    metadata?: Record<string, unknown>;
}
type MatchStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'cancelled';
interface MatchFilters {
    phase?: string;
    round?: number;
    status?: MatchStatus;
    groupId?: string;
}
interface MatchResult$1 {
    score1: number;
    score2: number;
    winnerId?: string;
    games?: Game[];
    metadata?: Record<string, unknown>;
}
interface Registration {
    id: string;
    tournamentId: string;
    participantId: string;
    seed?: number;
    status: RegistrationStatus;
    registeredAt?: number;
    confirmedAt?: number;
    checkedInAt?: number;
    metadata?: Record<string, unknown>;
}
type RegistrationStatus = 'pending' | 'confirmed' | 'checked_in' | 'withdrawn' | 'disqualified';
interface RegistrationOptions {
    seed?: number;
    metadata?: Record<string, unknown>;
}
interface FormatMetadata {
    name: string;
    description: string;
    minParticipants: number;
    maxParticipants?: number;
    supportsSeeding: boolean;
    supportsGroups: boolean;
    [key: string]: unknown;
}
interface LadderRanking {
    participantId: string;
    rank: number;
    wins: number;
    losses: number;
    rating?: number;
    [key: string]: unknown;
}
interface CircuitBracket {
    events: CircuitEvent[];
    standings: CircuitStanding[];
    [key: string]: unknown;
}
interface CircuitEvent {
    id: string;
    name: string;
    date?: number;
    pointsMultiplier?: number;
    results?: CircuitEventResult[];
    [key: string]: unknown;
}
interface CircuitEventResult {
    participantId: string;
    placement: number;
    points: number;
    [key: string]: unknown;
}
interface CircuitStanding {
    participantId: string;
    totalPoints: number;
    eventsPlayed: number;
    [key: string]: unknown;
}
interface Division {
    id: string;
    name: string;
    tier: number;
    participants: string[];
    standings: unknown[];
    [key: string]: unknown;
}
interface PromotionZone {
    positions: number[];
    participants: string[];
}
interface RelegationZone {
    positions: number[];
    participants: string[];
}
interface TournamentPluginOptions {
    resourceNames?: {
        tournaments?: string;
        matches?: string;
        registrations?: string;
    };
    logLevel?: string;
}
declare class TournamentPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: TournamentConfig;
    private _tournamentsDescriptor;
    private _matchesDescriptor;
    private _registrationsDescriptor;
    tournamentsResource: Resource$9 | null;
    matchesResource: Resource$9 | null;
    registrationsResource: Resource$9 | null;
    tournamentManager: TournamentManager | null;
    matchManager: MatchManager | null;
    registrationManager: RegistrationManager | null;
    stats: TournamentStats;
    constructor(options?: TournamentPluginOptions);
    onInstall(): Promise<void>;
    private _createResources;
    private _initializeManagers;
    private _resolveTournamentsName;
    private _resolveMatchesName;
    private _resolveRegistrationsName;
    onNamespaceChanged(): void;
    create(options: TournamentCreateOptions): Promise<Tournament>;
    get(tournamentId: string): Promise<Tournament | null>;
    update(tournamentId: string, data: TournamentUpdateData): Promise<Tournament>;
    delete(tournamentId: string): Promise<void>;
    list(filters?: TournamentListFilters): Promise<Tournament[]>;
    openRegistration(tournamentId: string): Promise<Tournament>;
    closeRegistration(tournamentId: string): Promise<Tournament>;
    startTournament(tournamentId: string): Promise<Tournament>;
    cancel(tournamentId: string, reason?: string): Promise<Tournament>;
    complete(tournamentId: string): Promise<Tournament>;
    register(tournamentId: string, participantId: string, options?: RegistrationOptions): Promise<Registration>;
    confirmRegistration(tournamentId: string, participantId: string): Promise<Registration>;
    checkIn(tournamentId: string, participantId: string): Promise<Registration>;
    withdraw(tournamentId: string, participantId: string, reason?: string): Promise<Registration>;
    getParticipants(tournamentId: string): Promise<Registration[]>;
    setSeed(tournamentId: string, participantId: string, seed: number): Promise<Registration>;
    shuffleSeeds(tournamentId: string): Promise<Registration[]>;
    getMatches(tournamentId: string, filters?: MatchFilters): Promise<Match[]>;
    getMatch(matchId: string): Promise<Match | null>;
    scheduleMatch(matchId: string, scheduledAt: number): Promise<Match>;
    startMatch(matchId: string): Promise<Match>;
    reportResult(matchId: string, result: MatchResult$1): Promise<Match>;
    reportWalkover(matchId: string, winnerId: string, reason?: string): Promise<Match>;
    reportGame(matchId: string, game: Game): Promise<Match>;
    getUpcomingMatches(tournamentId: string, limit?: number): Promise<Match[]>;
    getLiveMatches(tournamentId: string): Promise<Match[]>;
    getStandings(tournamentId: string): Promise<unknown[]>;
    getBracket(tournamentId: string): Promise<Record<string, unknown>>;
    challenge(tournamentId: string, challengerId: string, defenderId: string): Promise<Match>;
    getLadderRanking(tournamentId: string): Promise<LadderRanking[]>;
    addCircuitEvent(circuitId: string, event: CircuitEvent): Promise<CircuitBracket>;
    getCircuitStandings(circuitId: string): Promise<CircuitStanding[]>;
    getDivisions(tournamentId: string): Promise<Division[]>;
    getPromotionZone(tournamentId: string, divisionId: string): Promise<PromotionZone>;
    getRelegationZone(tournamentId: string, divisionId: string): Promise<RelegationZone>;
    getAvailableFormats(): TournamentFormat[];
    getFormatMetadata(): Record<TournamentFormat, FormatMetadata>;
    getStats(): TournamentStats;
    onStop(): Promise<void>;
}

interface GraphErrorContext {
    code?: string;
    statusCode?: number;
    retriable?: boolean;
    vertexId?: string;
    edgeId?: string;
    fromVertex?: string;
    toVertex?: string;
    [key: string]: unknown;
}
declare class GraphError extends Error {
    context: GraphErrorContext;
    code: string;
    statusCode: number;
    retriable: boolean;
    constructor(message: string, context?: GraphErrorContext);
}
declare class GraphConfigurationError extends GraphError {
    constructor(message: string, context?: GraphErrorContext);
}
declare class VertexNotFoundError extends GraphError {
    constructor(vertexId: string, context?: GraphErrorContext);
}
declare class PathNotFoundError extends GraphError {
    constructor(fromVertex: string, toVertex: string, context?: GraphErrorContext);
}
declare class InvalidEdgeError extends GraphError {
    constructor(message: string, context?: GraphErrorContext);
}

interface GraphPluginOptions {
    vertices?: string | string[] | null;
    edges?: string | string[] | null;
    directed?: boolean;
    weighted?: boolean;
    defaultWeight?: number;
    maxTraversalDepth?: number;
    createResources?: boolean;
    vertexIdField?: string;
    edgeSourceField?: string;
    edgeTargetField?: string;
    edgeLabelField?: string;
    edgeWeightField?: string;
    denormalize?: string[];
    logLevel?: string;
    logger?: Logger$i;
    [key: string]: unknown;
}
interface GraphConfig {
    vertices: string[];
    edges: string[];
    directed: boolean;
    weighted: boolean;
    defaultWeight: number;
    maxTraversalDepth: number;
    createResources: boolean;
    vertexIdField: string;
    edgeSourceField: string;
    edgeTargetField: string;
    edgeLabelField: string;
    edgeWeightField: string;
    denormalize: string[];
}
interface EdgeRecord {
    id: string;
    _direction?: 'outgoing' | 'incoming';
    _reverse?: boolean;
    _originalEdge?: string;
    snapshot?: Record<string, unknown>;
    [key: string]: unknown;
}
interface NeighborResult {
    id: string;
    _edges: EdgeRecord[];
    [key: string]: unknown;
}
interface DegreeResult {
    total: number;
    outgoing: number;
    incoming: number;
}
interface PathResult {
    path: string[];
    edges: EdgeRecord[];
    distance: number;
    stats?: {
        iterations: number;
        visited: number;
    };
}
interface TraverseNode {
    id: string;
    depth: number;
    path: string[];
    data: Record<string, unknown> | null;
}
interface EdgeOptions {
    direction?: 'outgoing' | 'incoming' | 'both';
    label?: string | null;
    limit?: number;
}
interface NeighborOptions extends EdgeOptions {
    includeEdges?: boolean;
}
interface ShortestPathOptions {
    maxDepth?: number;
    heuristic?: ((from: string, to: string) => number) | null;
    returnPath?: boolean;
    direction?: 'outgoing' | 'incoming' | 'both';
    includeStats?: boolean;
}
interface TraverseOptions {
    maxDepth?: number;
    direction?: 'outgoing' | 'incoming' | 'both';
    filter?: ((node: TraverseNode) => boolean) | null;
    visitor?: ((node: TraverseNode) => Promise<boolean | void>) | null;
    mode?: 'bfs' | 'dfs';
}
interface CreateEdgeOptions {
    label?: string | null;
    weight?: number | null;
    data?: Record<string, unknown>;
}
declare class GraphPlugin extends Plugin {
    config: GraphConfig;
    private _resourceGraphNamespaces;
    constructor(options?: GraphPluginOptions);
    onInstall(): Promise<void>;
    private _createGraphResources;
    private _installResourceMethods;
    private _createGraphNamespace;
    private _getEdgeResource;
    private _getVertexEdges;
    private _getNeighbors;
    private _getDegree;
    private _findShortestPath;
    private _getPathLength;
    private _reconstructPath;
    private _traverse;
    private _createEdge;
    private _createEdgeInResource;
    private _removeEdge;
    private _removeEdgeFromResource;
    private _isConnected;
    private _getEdgesByLabel;
    private _getEdgesBySource;
    private _getEdgesByTarget;
    private _getEdgesBetween;
    onUninstall(): Promise<void>;
    getStats(): {
        vertexResources: string[];
        edgeResources: string[];
        directed: boolean;
        weighted: boolean;
    };
}

interface NestedSetConfig {
    treeField: string | null;
    parentField: string;
    leftField: string;
    rightField: string;
    depthField: string;
    rootParentValue: string | null;
    [key: string]: unknown;
}
interface TreeNode$1 {
    id: string;
    children?: TreeNode$1[];
    [key: string]: unknown;
}
interface Resource$8 {
    name: string;
    config: {
        partitions?: {
            byParent?: unknown;
            byTree?: unknown;
        };
    };
    get(id: string): Promise<TreeNode$1 | null>;
    list(options: {
        limit: number;
    }): Promise<TreeNode$1[]>;
    listPartition(options: {
        partition: string;
        partitionValues: Record<string, unknown>;
        limit: number;
    }): Promise<TreeNode$1[]>;
    insert(data: Record<string, unknown>): Promise<TreeNode$1>;
    patch(id: string, data: Record<string, unknown>): Promise<TreeNode$1>;
    delete(id: string): Promise<void>;
}
interface Database$5 {
    resources: Record<string, Resource$8>;
}
interface Logger$d {
    info(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface GetChildrenOptions$1 {
    orderBy?: string;
    order?: 'asc' | 'desc';
}
interface GetDescendantsOptions$1 {
    includeNode?: boolean;
    maxDepth?: number | null;
}
interface GetAncestorsOptions$1 {
    includeNode?: boolean;
}
interface GetRootsOptions$1 {
    treeId?: string | null;
}
interface GetSiblingsOptions {
    includeSelf?: boolean;
}
interface GetLeavesOptions {
    treeId?: string | null;
}
interface DeleteNodeOptions$1 {
    promoteChildren?: boolean;
}
interface DeleteResult$1 {
    deleted: number;
    promoted?: number;
}
interface RebuildResult$1 {
    rebuilt: number;
}
interface VerifyError {
    type: string;
    nodeId: string;
    value?: number;
    left?: number;
    right?: number;
    parentId?: string;
    message: string;
    treeId?: string;
}
interface VerifyResult {
    valid: boolean;
    nodeCount: number;
    errors: VerifyError[];
}
interface GetFullTreeOptions {
    flat?: boolean;
    treeId?: string | null;
}
interface ToNestedArrayOptions {
    treeId?: string | null;
}
declare class NestedSetDriver {
    plugin: TreePlugin;
    config: NestedSetConfig;
    constructor(plugin: TreePlugin, config: NestedSetConfig);
    get database(): Database$5;
    get logger(): Logger$d;
    get treeField(): string | null;
    private _getTreeId;
    private _getLockKey;
    private _getNodesForTree;
    createRoot(resourceName: string, data?: Record<string, unknown>): Promise<TreeNode$1>;
    addChild(resourceName: string, parentId: string, data?: Record<string, unknown>): Promise<TreeNode$1>;
    insertBefore(resourceName: string, siblingId: string, data?: Record<string, unknown>): Promise<TreeNode$1>;
    insertAfter(resourceName: string, siblingId: string, data?: Record<string, unknown>): Promise<TreeNode$1>;
    getNode(resourceName: string, nodeId: string): Promise<TreeNode$1>;
    getRoot(resourceName: string, options?: GetRootsOptions$1): Promise<TreeNode$1 | null>;
    getRoots(resourceName: string, options?: GetRootsOptions$1): Promise<TreeNode$1[]>;
    getParent(resourceName: string, nodeId: string): Promise<TreeNode$1 | null>;
    getChildren(resourceName: string, nodeId: string, options?: GetChildrenOptions$1): Promise<TreeNode$1[]>;
    getDescendants(resourceName: string, nodeId: string, options?: GetDescendantsOptions$1): Promise<TreeNode$1[]>;
    getAncestors(resourceName: string, nodeId: string, options?: GetAncestorsOptions$1): Promise<TreeNode$1[]>;
    getSiblings(resourceName: string, nodeId: string, options?: GetSiblingsOptions): Promise<TreeNode$1[]>;
    getSubtree(resourceName: string, nodeId: string, options?: GetDescendantsOptions$1): Promise<TreeNode$1[]>;
    getLeaves(resourceName: string, nodeId?: string | null, options?: GetLeavesOptions): Promise<TreeNode$1[]>;
    getDepth(resourceName: string, nodeId: string): Promise<number>;
    getTreeDepth(resourceName: string, options?: GetRootsOptions$1): Promise<number>;
    isRoot(resourceName: string, nodeId: string): Promise<boolean>;
    isLeaf(resourceName: string, nodeId: string): Promise<boolean>;
    isDescendantOf(resourceName: string, nodeId: string, ancestorId: string): Promise<boolean>;
    isAncestorOf(resourceName: string, nodeId: string, descendantId: string): Promise<boolean>;
    countDescendants(resourceName: string, nodeId: string): Promise<number>;
    moveSubtree(resourceName: string, nodeId: string, newParentId: string): Promise<TreeNode$1>;
    deleteNode(resourceName: string, nodeId: string, options?: DeleteNodeOptions$1): Promise<DeleteResult$1>;
    deleteSubtree(resourceName: string, nodeId: string): Promise<DeleteResult$1>;
    private _shiftNodes;
    rebuildTree(resourceName: string, options?: GetRootsOptions$1): Promise<RebuildResult$1>;
    verifyTree(resourceName: string, options?: GetRootsOptions$1): Promise<VerifyResult>;
    getFullTree(resourceName: string, options?: GetFullTreeOptions): Promise<TreeNode$1[]>;
    toNestedArray(resourceName: string, nodeId?: string | null, options?: ToNestedArrayOptions): Promise<TreeNode$1[]>;
}

interface AdjacencyListConfig {
    treeField: string | null;
    parentField: string;
    rootParentValue: string | null;
    [key: string]: unknown;
}
interface TreeNode {
    id: string;
    [key: string]: unknown;
}
interface Resource$7 {
    name: string;
    config: {
        partitions?: {
            byParent?: unknown;
            byTree?: unknown;
        };
    };
    get(id: string): Promise<TreeNode | null>;
    list(options: {
        limit: number;
    }): Promise<TreeNode[]>;
    listPartition(options: {
        partition: string;
        partitionValues: Record<string, unknown>;
        limit: number;
    }): Promise<TreeNode[]>;
    insert(data: Record<string, unknown>): Promise<TreeNode>;
    patch(id: string, data: Record<string, unknown>): Promise<TreeNode>;
    delete(id: string): Promise<void>;
}
interface Database$4 {
    resources: Record<string, Resource$7>;
}
interface Logger$c {
    info(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface GetChildrenOptions {
    orderBy?: string;
    order?: 'asc' | 'desc';
}
interface GetDescendantsOptions {
    includeNode?: boolean;
    maxDepth?: number | null;
}
interface GetAncestorsOptions {
    includeNode?: boolean;
}
interface GetRootsOptions {
    treeId?: string | null;
}
interface DeleteNodeOptions {
    promoteChildren?: boolean;
}
interface DeleteResult {
    deleted: number;
    promoted?: number;
}
interface RebuildResult {
    rebuilt: number;
    message?: string;
}
declare class AdjacencyListDriver {
    plugin: TreePlugin;
    config: AdjacencyListConfig;
    constructor(plugin: TreePlugin, config: AdjacencyListConfig);
    get database(): Database$4;
    get logger(): Logger$c;
    get treeField(): string | null;
    private _getTreeId;
    private _getNodesForTree;
    validateResource(resourceName: string): void;
    createRoot(resourceName: string, data?: Record<string, unknown>): Promise<TreeNode>;
    addChild(resourceName: string, parentId: string, data?: Record<string, unknown>): Promise<TreeNode>;
    getNode(resourceName: string, nodeId: string): Promise<TreeNode>;
    getRoots(resourceName: string, options?: GetRootsOptions): Promise<TreeNode[]>;
    getChildren(resourceName: string, nodeId: string, options?: GetChildrenOptions): Promise<TreeNode[]>;
    getDescendants(resourceName: string, nodeId: string, options?: GetDescendantsOptions): Promise<TreeNode[]>;
    getAncestors(resourceName: string, nodeId: string, options?: GetAncestorsOptions): Promise<TreeNode[]>;
    moveSubtree(resourceName: string, nodeId: string, newParentId: string): Promise<TreeNode>;
    deleteNode(resourceName: string, nodeId: string, options?: DeleteNodeOptions): Promise<DeleteResult>;
    deleteSubtree(resourceName: string, nodeId: string): Promise<DeleteResult>;
    isDescendantOf(resourceName: string, nodeId: string, ancestorId: string): Promise<boolean>;
    rebuildTree(_resourceName: string): Promise<RebuildResult>;
}

interface TreeErrorContext {
    code?: string;
    statusCode?: number;
    nodeId?: string;
    parentId?: string;
    reason?: string;
    [key: string]: unknown;
}
declare class TreeError extends Error {
    context: TreeErrorContext;
    code: string;
    statusCode: number;
    constructor(message: string, context?: TreeErrorContext);
}
declare class TreeConfigurationError extends TreeError {
    constructor(message: string, context?: TreeErrorContext);
}
declare class NodeNotFoundError extends TreeError {
    constructor(nodeId: string, context?: TreeErrorContext);
}
declare class InvalidParentError extends TreeError {
    constructor(nodeId: string, parentId: string, context?: TreeErrorContext);
}
declare class RootNodeError extends TreeError {
    constructor(message: string, context?: TreeErrorContext);
}
declare class TreeIntegrityError extends TreeError {
    constructor(message: string, context?: TreeErrorContext);
}

interface PluginOptions {
    name?: string;
    namespace?: string;
    logLevel?: string;
    [key: string]: unknown;
}
interface TreePluginOptions extends PluginOptions {
    resources?: string | string[];
    driver?: 'nested-set' | 'adjacency-list';
    leftField?: string;
    rightField?: string;
    depthField?: string;
    parentField?: string;
    treeField?: string | null;
    rootParentValue?: string | null;
    autoRebuild?: boolean;
    logLevel?: string;
    logger?: Logger$i;
}
interface TreePluginConfig {
    resources: string[];
    driver: string;
    leftField: string;
    rightField: string;
    depthField: string;
    parentField: string;
    treeField: string | null;
    rootParentValue: string | null;
    autoRebuild: boolean;
}
type TreeDriver = NestedSetDriver | AdjacencyListDriver;
declare class TreePlugin extends Plugin {
    config: TreePluginConfig;
    driver: TreeDriver;
    private _resourceTreeNamespaces;
    private _locks;
    constructor(options?: TreePluginOptions);
    onInstall(): Promise<void>;
    private _installResourceMethods;
    private _installNodeTreeMiddleware;
    private _enrichNodeWithTree;
    private _createTreeNamespace;
    _acquireLock(resourceName: string): Promise<void>;
    _releaseLock(resourceName: string): void;
    _withLock<T>(resourceName: string, fn: () => Promise<T>): Promise<T>;
    onUninstall(): Promise<void>;
    getStats(): Record<string, unknown>;
}

/**
 * Configuration for EventualConsistencyPlugin
 * @module eventual-consistency/config
 */
type CohortGranularity = 'hour' | 'day' | 'week' | 'month';
type ConsolidationMode = 'sync' | 'async';
type ReducerFunction = (current: number, incoming: number) => number;
type RollupStrategy = 'incremental' | 'full';
interface CohortConfig {
    granularity: CohortGranularity;
    timezone: string;
}
interface AnalyticsConfig {
    rollupStrategy: RollupStrategy;
    retentionDays: number;
}
interface FieldConfig {
    field: string;
    fieldPath?: string;
    initialValue?: number;
    reducer?: ReducerFunction;
    cohort?: Partial<CohortConfig>;
}
interface ResourceConfig$4 {
    resource: string;
    fields: (string | FieldConfig)[];
}
interface EventualConsistencyPluginOptions {
    resources?: ResourceConfig$4[];
    mode?: ConsolidationMode;
    consolidationInterval?: number;
    consolidationWindow?: number;
    autoConsolidate?: boolean;
    transactionRetention?: number;
    gcInterval?: number;
    enableAnalytics?: boolean;
    enableCoordinator?: boolean;
    ticketBatchSize?: number;
    ticketTTL?: number;
    workerClaimLimit?: number;
    cohort?: Partial<CohortConfig>;
    analyticsConfig?: Partial<AnalyticsConfig>;
    logLevel?: string;
    [key: string]: any;
}
interface NormalizedConfig {
    resources: ResourceConfig$4[];
    mode: ConsolidationMode;
    consolidationInterval: number;
    consolidationWindow: number;
    autoConsolidate: boolean;
    transactionRetention: number;
    gcInterval: number;
    enableAnalytics: boolean;
    enableCoordinator: boolean;
    ticketBatchSize: number;
    ticketTTL: number;
    workerClaimLimit: number;
    cohort: CohortConfig;
    analyticsConfig: AnalyticsConfig;
    logLevel?: string;
    [key: string]: any;
}
interface FieldHandlerConfig extends NormalizedConfig {
    resource: string;
    field: string;
    fieldPath?: string;
    initialValue: number;
    reducer: ReducerFunction;
}

/**
 * Utility functions for EventualConsistencyPlugin
 * @module eventual-consistency/utils
 */

interface Transaction {
    id: string;
    originalId: string;
    field: string;
    fieldPath?: string;
    value: number;
    operation: string;
    timestamp: string;
    cohortDate: string;
    cohortHour: string;
    cohortWeek?: string;
    cohortMonth?: string;
    source?: string;
    applied?: boolean;
    createdAt?: string;
}
interface TransactionResource {
    insert(data: Partial<Transaction>): Promise<Transaction>;
    get(id: string): Promise<Transaction>;
    update(id: string, data: Partial<Transaction>): Promise<Transaction>;
    delete(id: string): Promise<void>;
    list(options?: {
        limit?: number;
    }): Promise<Transaction[]>;
    query(query: Record<string, any>, options?: {
        limit?: number;
    }): Promise<Transaction[]>;
}
interface AnalyticsResource {
    insert(data: any): Promise<any>;
    get(id: string): Promise<any>;
    update(id: string, data: any): Promise<any>;
    list(options?: {
        limit?: number;
    }): Promise<any[]>;
}
interface TicketResource {
    insert(data: any): Promise<any>;
    get(id: string): Promise<any>;
    update(id: string, data: any): Promise<any>;
    delete(id: string): Promise<void>;
    query(query: Record<string, any>, options?: {
        limit?: number;
    }): Promise<any[]>;
}
interface FieldHandler {
    resource: string;
    field: string;
    fieldPath?: string;
    config: FieldHandlerConfig;
    targetResource?: any;
    transactionResource?: TransactionResource;
    analyticsResource?: AnalyticsResource;
    ticketResource?: TicketResource;
    pendingTransactions?: Map<string, Transaction[]>;
    consolidationJobName?: string;
    gcJobName?: string;
    deferredSetup?: boolean;
    initialValue: number;
    reducer: ReducerFunction;
}

/**
 * Consolidation logic for EventualConsistencyPlugin
 * @module eventual-consistency/consolidation
 */

interface ConsolidationResult {
    success: boolean;
    recordsProcessed: number;
    transactionsApplied: number;
    errors: Error[];
}
interface CohortStats {
    cohort: string;
    pending: number;
    applied: number;
    total: number;
}

/**
 * Ticket System for EventualConsistencyPlugin
 * @module eventual-consistency/tickets
 */

interface Ticket {
    id: string;
    resourceName: string;
    fieldName: string;
    records: string[];
    status: 'available' | 'processing';
    cohortHour: string;
    ticketCreatedAt: number;
    ticketExpiresAt: number;
    claimedBy?: string;
    ticketClaimedAt?: number;
}
interface ProcessTicketResults {
    ticketId: string;
    recordsProcessed: number;
    transactionsApplied: number;
    errors: Array<{
        originalId?: string;
        ticketId?: string;
        error: string;
    }>;
}

/**
 * Analytics for EventualConsistencyPlugin
 * @module eventual-consistency/analytics
 */

interface OperationBreakdown {
    [operation: string]: {
        count: number;
        sum: number;
    };
}
interface AnalyticsDataPoint {
    cohort: string;
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    operations?: OperationBreakdown;
    recordCount: number;
}
interface GetAnalyticsOptions {
    period?: 'hour' | 'day' | 'week' | 'month';
    date?: string;
    startDate?: string;
    endDate?: string;
    month?: string;
    year?: number;
    breakdown?: 'operations' | boolean;
    recordId?: string;
    fillGaps?: boolean;
}
interface TopRecord {
    recordId: string;
    count: number;
    sum: number;
}
interface GetTopRecordsOptions {
    period?: 'hour' | 'day' | 'month';
    date?: string;
    metric?: 'transactionCount' | 'totalValue';
    limit?: number;
}
interface GetRawEventsOptions {
    recordId?: string;
    startDate?: string;
    endDate?: string;
    cohortDate?: string;
    cohortHour?: string;
    cohortMonth?: string;
    applied?: boolean;
    operation?: string;
    limit?: number;
}

/**
 * EventualConsistencyPlugin - Eventually consistent counters and aggregations
 * @module eventual-consistency
 */

interface CoordinatorConfig {
    namespace?: string;
    heartbeatInterval?: number;
    leaderTTL?: number;
}
declare class EventualConsistencyPlugin extends CoordinatorPlugin<EventualConsistencyPluginOptions> {
    config: NormalizedConfig;
    private fieldHandlers;
    private storage;
    workerId: string;
    constructor(options?: EventualConsistencyPluginOptions);
    /**
     * Initialize field handlers from configuration
     */
    private _initializeFieldHandlers;
    /**
     * Plugin installation hook
     */
    onInstall(): Promise<void>;
    /**
     * Plugin start hook
     */
    onStart(): Promise<void>;
    /**
     * Plugin stop hook
     */
    onStop(): Promise<void>;
    /**
     * Complete field setup for a handler
     */
    private _completeFieldSetup;
    /**
     * Watch for resource creation
     */
    private _watchForResource;
    /**
     * Check if resource should be managed
     */
    private _shouldManageResource;
    /**
     * Emit an event
     */
    private _emit;
    /**
     * Run consolidation for a field handler
     */
    runConsolidation(handler: FieldHandler, resourceName: string, fieldName: string): Promise<ConsolidationResult>;
    /**
     * Run garbage collection for a field handler
     */
    private _runGC;
    /**
     * Get consolidated value for a record
     */
    getConsolidatedValue(resourceName: string, fieldName: string, recordId: string): Promise<number>;
    /**
     * Get cohort statistics
     */
    getCohortStats(resourceName: string, fieldName: string): Promise<CohortStats[]>;
    /**
     * Recalculate a record's value
     */
    recalculateRecord(resourceName: string, fieldName: string, recordId: string): Promise<number>;
    /**
     * Get a field handler
     */
    private _getHandler;
    /**
     * Start coordinator mode
     */
    private _startCoordinator;
    /**
     * Stop coordinator mode
     */
    private _stopCoordinator;
    /**
     * Coordinator work (runs only on leader)
     */
    protected doCoordinatorWork(): Promise<void>;
    /**
     * Worker work (runs on all instances)
     */
    protected doWorkerWork(): Promise<void>;
    /**
     * Get analytics for a field
     */
    getAnalytics(resourceName: string, fieldName: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get month analytics broken down by day
     */
    getMonthByDay(resourceName: string, fieldName: string, month: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get day analytics broken down by hour
     */
    getDayByHour(resourceName: string, fieldName: string, date: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get last N days analytics
     */
    getLastNDays(resourceName: string, fieldName: string, days?: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get year analytics broken down by month
     */
    getYearByMonth(resourceName: string, fieldName: string, year: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get year analytics broken down by week
     */
    getYearByWeek(resourceName: string, fieldName: string, year: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get month analytics broken down by week
     */
    getMonthByWeek(resourceName: string, fieldName: string, month: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get month analytics broken down by hour
     */
    getMonthByHour(resourceName: string, fieldName: string, month: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get top records by activity
     */
    getTopRecords(resourceName: string, fieldName: string, options?: GetTopRecordsOptions): Promise<TopRecord[]>;
    /**
     * Get year analytics broken down by day
     */
    getYearByDay(resourceName: string, fieldName: string, year: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get week analytics broken down by day
     */
    getWeekByDay(resourceName: string, fieldName: string, week: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get week analytics broken down by hour
     */
    getWeekByHour(resourceName: string, fieldName: string, week: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get last N hours analytics
     */
    getLastNHours(resourceName: string, fieldName: string, hours?: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get last N weeks analytics
     */
    getLastNWeeks(resourceName: string, fieldName: string, weeks?: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get last N months analytics
     */
    getLastNMonths(resourceName: string, fieldName: string, months?: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get raw transaction events
     */
    getRawEvents(resourceName: string, fieldName: string, options?: GetRawEventsOptions): Promise<any[]>;
    /**
     * Fill gaps in analytics data
     */
    fillGaps(data: AnalyticsDataPoint[], period: string, startDate: string, endDate: string): AnalyticsDataPoint[];
    /**
     * Force consolidation for all handlers
     */
    consolidateAll(): Promise<Map<string, ConsolidationResult>>;
    /**
     * Get plugin status
     */
    getStatus(): Record<string, any>;
}

interface TfStatePluginConfig {
    logger?: any;
    logLevel?: string;
    driver?: 's3' | 'filesystem';
    config?: any;
    resources?: {
        resources?: string;
        stateFiles?: string;
        diffs?: string;
        lineages?: string;
    };
    resourceNames?: {
        resources?: string;
        stateFiles?: string;
        diffs?: string;
        lineages?: string;
    };
    resourceName?: string;
    stateFilesName?: string;
    diffsName?: string;
    monitor?: {
        enabled?: boolean;
        cron?: string;
    };
    diffs?: {
        enabled?: boolean;
        lookback?: number;
    };
    trackDiffs?: boolean;
    asyncPartitions?: boolean;
    autoSync?: boolean;
    watchPaths?: string[];
    filters?: {
        types?: string[];
        providers?: string[];
        exclude?: string[];
        include?: string[];
    };
    [key: string]: unknown;
}
declare class TfStatePlugin extends Plugin {
    driverType: string | null;
    driverConfig: any;
    _resourceDescriptors: any;
    resourceName: string;
    stateFilesName: string;
    diffsName: string;
    lineagesName: string;
    monitorEnabled: boolean;
    monitorCron: string;
    trackDiffs: boolean;
    diffsLookback: number;
    asyncPartitions: boolean;
    autoSync: boolean;
    watchPaths: string[];
    filters: {
        types?: string[];
        providers?: string[];
        exclude?: string[];
        include?: string[];
    };
    logLevel: string;
    supportedVersions: number[];
    driver: any | null;
    resource: any | null;
    stateFilesResource: any | null;
    diffsResource: any | null;
    lineagesResource: any | null;
    watchers: any[];
    cronTask: any | null;
    lastProcessedSerial: number | null;
    _partitionCache: Map<string, string | null>;
    stats: {
        statesProcessed: number;
        resourcesExtracted: number;
        resourcesInserted: number;
        diffsCalculated: number;
        errors: number;
        lastProcessedSerial: number | null;
        partitionCacheHits: number;
        partitionQueriesOptimized: number;
    };
    constructor(config?: TfStatePluginConfig);
    _resolveResourceNames(): any;
    onNamespaceChanged(): void;
    /**
     * Install the plugin
     * @override
     */
    onInstall(): Promise<void>;
    /**
     * Start the plugin
     * @override
     */
    onStart(): Promise<void>;
    /**
     * Stop the plugin
     * @override
     */
    onStop(): Promise<void>;
    /**
     * Import multiple Terraform/OpenTofu states from local filesystem using glob pattern
     */
    importStatesGlob(pattern: string, options?: any): Promise<any>;
    /**
     * Find files matching glob pattern
     * @private
     */
    _findFilesGlob(pattern: string): Promise<string[]>;
    /**
     * Import Terraform/OpenTofu state from remote S3 bucket
     */
    importStateFromS3(bucket: string, key: string, options?: any): Promise<any>;
    /**
     * Import multiple Terraform/OpenTofu states from S3 using glob pattern
     */
    importStatesFromS3Glob(bucket: string, pattern: string, options?: any): Promise<any>;
    /**
     * Match S3 key against glob pattern
     * Simple glob matching supporting *, **, ?, and []
     * @private
     */
    _matchesGlobPattern(key: string, pattern: string): boolean;
    /**
     * Ensure lineage record exists and is up-to-date
     * Creates or updates the lineage tracking record
     * @private
     */
    _ensureLineage(lineageUuid: string, stateMeta: any): Promise<any>;
    /**
     * Import Terraform/OpenTofu state from file
     */
    importState(filePath: string): Promise<any>;
    /**
     * Read and parse Tfstate file
     * @private
     */
    _readStateFile(filePath: string): Promise<any>;
    /**
     * Validate basic state structure
     * @private
     */
    _validateState(state: any, filePath: string): void;
    /**
     * Validate Tfstate version
     * @private
     */
    _validateStateVersion(state: any): void;
    /**
     * Extract resources from Tfstate
     * @private
     */
    _extractResources(state: any, filePath: string, stateFileId: string, lineageId: string | null): Promise<any[]>;
    /**
     * Extract single resource instance
     * @private
     */
    _extractResourceInstance(resource: any, instance: any, stateSerial: number, stateVersion: number, importedAt: number, sourceFile: string, stateFileId: string, lineageId: string | null): any;
    /**
     * Detect provider from resource type
     * @private
     */
    _detectProvider(resourceType: string): string;
    /**
     * Check if resource should be included based on filters
     * @private
     */
    _shouldIncludeResource(resource: any): boolean;
    /**
     * Match resource address against pattern (supports wildcards)
     * @private
     */
    _matchesPattern(address: string, pattern: string): boolean;
    /**
     * Calculate diff between current and previous state
     * NEW: Uses lineage-based tracking for O(1) lookup
     * @private
     */
    _calculateDiff(currentState: any, lineageId: string, currentStateFileId: string): Promise<any>;
    /**
     * Compute diff between two state serials
     * NEW: Uses lineage-based partition for efficient resource lookup
     * @private
     */
    _computeDiff(oldSerial: number, newSerial: number, lineageId: string): Promise<any>;
    /**
     * Compute changes between old and new attributes
     * @private
     */
    _computeAttributeChanges(oldAttrs: any, newAttrs: any): any[];
    /**
     * Save diff to diffsResource
     * NEW: Includes lineage-based fields for efficient querying
     * @private
     */
    _saveDiff(diff: any, lineageId: string, newStateFileId: string): Promise<any>;
    /**
     * Calculate SHA256 hash of state content
     * @private
     */
    _calculateSHA256(state: any): string;
    /**
     * Insert resources into database with controlled parallelism
     * @private
     */
    _insertResources(resources: any[]): Promise<any[]>;
    /**
     * Setup cron-based monitoring for state file changes
     * @private
     */
    _setupCronMonitoring(): Promise<void>;
    /**
     * Monitor state files for changes
     * Called by cron task
     * @private
     */
    _monitorStateFiles(): Promise<any>;
    /**
     * Setup file watchers for auto-sync
     * @private
     */
    _setupFileWatchers(): Promise<void>;
    /**
     * Export resources to Tfstate format
     */
    exportState(options?: any): Promise<any>;
    /**
     * Export state to local file
     */
    exportStateToFile(filePath: string, options?: any): Promise<any>;
    /**
     * Export state to S3
     */
    exportStateToS3(bucket: string, key: string, options?: any): Promise<any>;
    /**
     * Get diffs with lookback support
     */
    getDiffsWithLookback(sourceFile: string, options?: any): Promise<any[]>;
    /**
     * Get diff timeline for a state file
     */
    getDiffTimeline(sourceFile: string, options?: any): Promise<any>;
    /**
     * Compare two specific state serials
     */
    compareStates(sourceFile: string, oldSerial: number, newSerial: number): Promise<any>;
    /**
     * Trigger monitoring check manually
     */
    triggerMonitoring(): Promise<any>;
    /**
     * Get resources by type (uses partition for fast queries)
     */
    getResourcesByType(type: string): Promise<any[]>;
    /**
     * Get resources by provider (uses partition for fast queries)
     */
    getResourcesByProvider(provider: string): Promise<any[]>;
    /**
     * Get resources by provider and type (uses partition for ultra-fast queries)
     */
    getResourcesByProviderAndType(provider: string, type: string): Promise<any[]>;
    /**
     * Get diff between two state serials
     */
    getDiff(sourceFile: string, oldSerial: number, newSerial: number): Promise<any>;
    /**
     * Get statistics by provider
     */
    getStatsByProvider(): Promise<Record<string, number>>;
    /**
     * Get statistics by resource type
     */
    getStatsByType(): Promise<Record<string, number>>;
    /**
     * Find partition by field name (for efficient queries)
     * Uses cache to avoid repeated lookups
     * @private
     */
    _findPartitionByField(resource: any, fieldName: string): string | null;
    /**
     * Get plugin statistics
     */
    getStats(): Promise<any>;
}

interface ApiEventEmitterOptions {
    enabled?: boolean;
    logLevel?: string;
    maxListeners?: number;
}
interface EventData {
    event?: string;
    timestamp?: string;
    [key: string]: unknown;
}
interface EventStats {
    enabled: boolean;
    maxListeners: number;
    listeners: Record<string, number>;
}
declare class ApiEventEmitter extends EventEmitter$2 {
    private options;
    constructor(options?: ApiEventEmitterOptions);
    emit(event: string, data?: EventData): boolean;
    emitUserEvent(action: string, data: EventData): void;
    emitAuthEvent(action: string, data: EventData): void;
    emitResourceEvent(action: string, data: EventData): void;
    emitRequestEvent(action: string, data: EventData): void;
    getStats(): EventStats;
}

interface MetricsCollectorOptions {
    enabled?: boolean;
    logLevel?: string;
    maxPathsTracked?: number;
    resetInterval?: number;
    format?: 'json' | 'prometheus';
}
interface RequestMetrics {
    method: string;
    path: string;
    status: number;
    duration: number;
}
interface AuthMetrics {
    success: boolean;
    method: string;
}
interface ResourceOperationMetrics {
    action: 'created' | 'updated' | 'deleted';
    resource: string;
}
interface UserEventMetrics {
    action: 'login' | 'created';
}
interface ErrorMetrics {
    error: string;
    type?: string;
}
interface AuthMethodStats {
    success: number;
    failure: number;
}
interface ResourceStats {
    created: number;
    updated: number;
    deleted: number;
}
interface TopPathEntry {
    path: string;
    count: number;
    avgDuration: string;
    errors: number;
    errorRate: string;
}
interface MetricsSummary {
    uptime: {
        milliseconds: number;
        seconds: number;
        formatted: string;
    };
    requests: {
        total: number;
        rps: string;
        byMethod: Record<string, number>;
        byStatus: Record<string, number>;
        topPaths: TopPathEntry[];
        duration: {
            p50: number;
            p95: number;
            p99: number;
            avg: string | number;
        };
    };
    auth: {
        total: number;
        success: number;
        failure: number;
        successRate: string;
        byMethod: Record<string, AuthMethodStats>;
    };
    resources: {
        total: number;
        created: number;
        updated: number;
        deleted: number;
        byResource: Record<string, ResourceStats>;
    };
    users: {
        logins: number;
        newUsers: number;
    };
    errors: {
        total: number;
        rate: string;
        byType: Record<string, number>;
    };
}
declare class MetricsCollector {
    private options;
    private metrics;
    private startTime;
    private cronManager;
    private resetJobName;
    constructor(options?: MetricsCollectorOptions);
    private _createEmptyMetrics;
    recordRequest({ method, path, status, duration }: RequestMetrics): void;
    recordAuth({ success, method }: AuthMetrics): void;
    recordResourceOperation({ action, resource }: ResourceOperationMetrics): void;
    recordUserEvent({ action }: UserEventMetrics): void;
    recordError({ error, type }: ErrorMetrics): void;
    private _percentile;
    getSummary(): MetricsSummary;
    getPrometheusMetrics(): string;
    private _getTopPaths;
    private _calculateRate;
    private _formatDuration;
    reset(): void;
    stop(): void;
}

type HonoConstructor = new () => HonoType;
type HonoType = {
    get: (path: string, handler: ((c: Context) => Response | Promise<Response>) | MiddlewareHandler$1) => void;
    use: (path: string, handler: MiddlewareHandler$1) => void;
    route: (path: string, app: HonoType) => void;
    on: (method: string, path: string, handler: ((c: Context) => Response | Promise<Response>) | MiddlewareHandler$1) => void;
};
interface ResourceConfig$3 {
    enabled?: boolean;
    versionPrefix?: string | boolean;
    auth?: boolean | string[];
    customMiddleware?: MiddlewareHandler$1 | MiddlewareHandler$1[];
    methods?: string[];
    validation?: boolean;
    relations?: Record<string, {
        expose?: boolean;
    }>;
    [key: string]: unknown;
}
interface ResourceLike$5 {
    config?: {
        currentVersion?: string;
        versionPrefix?: string | boolean;
        methods?: string[];
        validation?: boolean;
        routes?: Record<string, unknown>;
        [key: string]: unknown;
    };
    version?: string;
    [key: string]: unknown;
}
interface RoutesConfig {
    [path: string]: unknown;
}
interface AuthConfig$2 {
    drivers?: Array<{
        driver: string;
        config?: Record<string, unknown>;
    }>;
    resource?: string;
    usernameField?: string;
    passwordField?: string;
    registration?: {
        enabled?: boolean;
        allowedFields?: string[];
        defaultRole?: string;
    };
    loginThrottle?: {
        enabled?: boolean;
        maxAttempts?: number;
        windowMs?: number;
        blockDurationMs?: number;
        maxEntries?: number;
    };
}
interface StaticConfig$2 {
    driver: 'filesystem' | 's3';
    path: string;
    root?: string;
    bucket?: string;
    prefix?: string;
    config?: {
        index?: string;
        fallback?: string;
        maxAge?: number;
        dotfiles?: string;
        etag?: boolean;
        cors?: boolean;
        streaming?: boolean;
        signedUrlExpiry?: number;
        cacheControl?: string;
        contentDisposition?: string;
    };
}
interface FailbanPlugin {
    [key: string]: unknown;
}
interface MetricsPlugin {
    options?: {
        enabled?: boolean;
        format?: string;
    };
    getPrometheusMetrics?: () => string;
    getSummary?: () => Record<string, unknown>;
}
interface RelationConfig {
    type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
    resource: string;
    [key: string]: unknown;
}
interface RelationsPlugin {
    relations?: Record<string, Record<string, RelationConfig>>;
    database?: DatabaseLike$4;
    populate?(resource: unknown, items: unknown, includes: Record<string, unknown>): Promise<void>;
}
interface EventEmitter {
    emitResourceEvent(event: string, data: Record<string, unknown>): void;
    [key: string]: unknown;
}
interface DatabaseLike$4 {
    resources: Record<string, ResourceLike$5>;
    client?: {
        client?: unknown;
    };
    pluginRegistry?: Record<string, unknown>;
}
interface RouteSummary {
    resource: string;
    path: string;
    methods: string[];
    authEnabled: boolean;
    authConfig?: boolean | string[];
}
interface RouterOptions {
    database: DatabaseLike$4;
    resources?: Record<string, ResourceConfig$3>;
    routes?: RoutesConfig;
    versionPrefix?: string | boolean;
    basePath?: string;
    auth?: AuthConfig$2;
    static?: StaticConfig$2[];
    failban?: FailbanPlugin;
    metrics?: MetricsPlugin;
    relationsPlugin?: RelationsPlugin;
    authMiddleware?: MiddlewareHandler$1;
    logLevel?: string;
    logger?: Logger$i;
    Hono: HonoConstructor;
    apiTitle?: string;
    apiDescription?: string;
    docsEnabled?: boolean;
    rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
}
declare class Router {
    private database;
    private resources;
    private routes;
    private versionPrefix;
    private basePath;
    private auth;
    private staticConfigs;
    private failban;
    private metrics;
    private relationsPlugin;
    private authMiddleware;
    private logLevel;
    private logger;
    private Hono;
    private apiTitle;
    private apiDescription;
    private docsEnabled;
    private rootRoute;
    private routeSummaries;
    constructor({ database, resources, routes, versionPrefix, basePath, auth, static: staticConfigs, failban, metrics, relationsPlugin, authMiddleware, logLevel, logger, Hono, apiTitle, apiDescription, docsEnabled, rootRoute }: RouterOptions);
    mount(app: HonoType, events: EventEmitter): void;
    private mountRootRoute;
    private _createSplashScreen;
    private mountResourceRoutes;
    private mountAuthRoutes;
    private mountStaticRoutes;
    private mountRelationalRoutes;
    private mountCustomRoutes;
    private mountAdminRoutes;
    private _withBasePath;
    getRouteSummaries(): RouteSummary[];
}

/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and delegates routing/middleware concerns
 * to dedicated components (MiddlewareChain, Router, HealthManager).
 */

interface ApiServerOptions {
    port?: number;
    host?: string;
    database?: DatabaseLike$3;
    namespace?: string | null;
    basePath?: string;
    versionPrefix?: string | boolean;
    resources?: Record<string, unknown>;
    routes?: Record<string, unknown>;
    templates?: {
        enabled: boolean;
        engine: string;
    };
    middlewares?: MiddlewareHandler$1[];
    cors?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    security?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    sessionTracking?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    requestId?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    httpLogger?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    events?: {
        enabled: boolean;
        logLevel?: string;
        maxListeners?: number;
        [key: string]: unknown;
    };
    metrics?: {
        enabled: boolean;
        logLevel?: string;
        maxPathsTracked?: number;
        resetInterval?: number;
        format?: string;
        [key: string]: unknown;
    };
    failban?: {
        enabled: boolean;
        maxViolations?: number;
        violationWindow?: number;
        banDuration?: number;
        whitelist?: string[];
        blacklist?: string[];
        persistViolations?: boolean;
        logLevel?: string;
        geo?: Record<string, unknown>;
        resourceNames?: Record<string, string>;
        [key: string]: unknown;
    };
    static?: StaticConfig$1[];
    health?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    logLevel?: string;
    auth?: AuthConfig$1;
    docsEnabled?: boolean;
    docsUI?: string;
    docsCsp?: string | null;
    apiTitle?: string;
    apiVersion?: string;
    apiDescription?: string;
    maxBodySize?: number;
    startupBanner?: boolean;
    rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
    compression?: {
        enabled: boolean;
        threshold?: number;
    };
    logger?: Logger$i;
    docs?: {
        enabled?: boolean;
        ui?: string;
        title?: string;
        version?: string;
        description?: string;
        csp?: string | null;
    };
}
interface StaticConfig$1 {
    path: string;
    root: string;
    [key: string]: unknown;
}
interface AuthConfig$1 {
    drivers?: DriverConfig[];
    resource?: string;
    pathAuth?: PathAuthConfig[];
    pathRules?: PathRuleConfig[];
    [key: string]: unknown;
}
interface DriverConfig {
    driver: string;
    config?: Record<string, unknown>;
}
interface PathAuthConfig {
    pattern?: string;
    path?: string;
    required?: boolean;
    drivers?: string[];
}
interface PathRuleConfig {
    pattern: string;
    auth?: string[] | boolean;
    methods?: string[];
    [key: string]: unknown;
}
interface DatabaseLike$3 {
    resources?: Record<string, ResourceLike$4>;
    s3dbVersion?: string;
    pluginRegistry?: Record<string, unknown>;
    [key: string]: unknown;
}
interface ResourceLike$4 {
    name?: string;
    [key: string]: unknown;
}
declare class ApiServer {
    private options;
    private logger;
    private app;
    private server;
    private isRunning;
    private initialized;
    private oidcMiddleware;
    private middlewareChain;
    router: Router | null;
    private healthManager;
    private inFlightRequests;
    private acceptingRequests;
    events: ApiEventEmitter;
    metrics: MetricsCollector;
    failban: FailbanManager | null;
    private relationsPlugin;
    private openApiGenerator;
    private Hono;
    private serve;
    private swaggerUI;
    private cors;
    private ApiApp;
    constructor(options?: ApiServerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    getInfo(): {
        isRunning: boolean;
        port: number;
        host: string;
        resources: number;
    };
    getApp(): Hono | null;
    stopAcceptingRequests(): void;
    private _registerMetricsPluginRoute;
    waitForRequestsToFinish({ timeout }?: {
        timeout?: number | undefined;
    }): Promise<boolean>;
    shutdown({ timeout }?: {
        timeout?: number | undefined;
    }): Promise<void>;
    private _setupMetricsEventListeners;
    private _setupDocumentationRoutes;
    private _setupOIDCRoutes;
    private _createAuthMiddleware;
    private _printStartupBanner;
    private _resolveLocalHostname;
    private _resolveNetworkHostname;
    private _findLanAddress;
    private _buildUrl;
    _generateOpenAPISpec(): Record<string, unknown>;
}

/**
 * OIDC Client Middleware for Resource Servers
 *
 * Validates RS256 JWT tokens issued by an OAuth2/OIDC Authorization Server.
 * Fetches and caches JWKS (public keys) from the issuer's /.well-known/jwks.json endpoint.
 *
 * @example
 * import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';
 *
 * const oidcClient = new OIDCClient({
 *   issuer: 'https://sso.example.com',
 *   audience: 'https://api.example.com',
 *   jwksCacheTTL: 3600000 // 1 hour
 * });
 *
 * await oidcClient.initialize();
 *
 * // Use with API plugin
 * apiPlugin.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));
 *
 * // Or use directly in routes
 * apiPlugin.addRoute({
 *   path: '/protected',
 *   method: 'GET',
 *   handler: async (req, res) => {
 *     // req.user contains validated token payload
 *     res.json({ user: req.user });
 *   },
 *   auth: 'oidc'
 * });
 */

interface TokenPayload {
    sub?: string;
    iat?: number;
    exp?: number;
    iss?: string;
    aud?: string | string[];
    nbf?: number;
    [key: string]: unknown;
}
interface JWK$1 {
    kty: string;
    use?: string;
    kid?: string;
    n?: string;
    e?: string;
    alg?: string;
    [key: string]: unknown;
}
interface JWKS$1 {
    keys: JWK$1[];
}
interface DiscoveryDocument {
    issuer?: string;
    jwks_uri?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    introspection_endpoint?: string;
    userinfo_endpoint?: string;
    [key: string]: unknown;
}
interface OIDCClientOptions {
    issuer: string;
    audience?: string;
    jwksUri?: string;
    jwksCacheTTL?: number;
    clockTolerance?: number;
    autoRefreshJWKS?: boolean;
    discoveryUri?: string;
    logLevel?: string;
    logger?: Logger$i;
}
interface TokenVerificationResult {
    valid: boolean;
    error?: string;
    header?: Record<string, unknown>;
    payload?: TokenPayload;
}
interface IntrospectionResult {
    active: boolean;
    [key: string]: unknown;
}
interface ExpressRequest {
    headers: {
        authorization?: string;
        [key: string]: string | string[] | undefined;
    };
    user?: TokenPayload;
    token?: string;
}
interface ExpressResponse {
    status(code: number): ExpressResponse;
    json(data: unknown): void;
}
type NextFunction = () => void;
/**
 * OIDC Client for validating tokens from Authorization Server
 */
declare class OIDCClient {
    private issuer;
    private audience?;
    private jwksUri;
    private discoveryUri;
    private jwksCacheTTL;
    private clockTolerance;
    private autoRefreshJWKS;
    private logger;
    private jwksCache;
    private jwksCacheExpiry;
    private discoveryCache;
    private keys;
    private cronManager;
    private refreshJobName;
    private logLevel;
    private _httpClient;
    constructor(options: OIDCClientOptions);
    /**
     * Get or create HTTP client
     */
    private _getHttpClient;
    /**
     * Initialize OIDC client - fetch discovery document and JWKS
     */
    initialize(): Promise<void>;
    /**
     * Fetch OIDC discovery document
     */
    fetchDiscovery(): Promise<DiscoveryDocument>;
    /**
     * Fetch JWKS from issuer
     */
    fetchJWKS(force?: boolean): Promise<JWKS$1>;
    /**
     * Convert JWK to PEM format
     */
    jwkToPem(jwk: JWK$1): string;
    /**
     * Get public key by kid
     */
    getPublicKey(kid: string): Promise<string | undefined>;
    /**
     * Verify RS256 JWT token
     */
    verifyToken(token: string): Promise<TokenVerificationResult>;
    /**
     * Express middleware for OIDC authentication
     */
    middleware(req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void>;
    /**
     * Start auto-refresh of JWKS
     */
    startJWKSRefresh(): void;
    /**
     * Stop auto-refresh of JWKS
     */
    stopJWKSRefresh(): void;
    /**
     * Introspect token via Authorization Server (RFC 7662)
     */
    introspectToken(token: string, clientId: string, clientSecret: string): Promise<IntrospectionResult>;
    /**
     * Get discovery document
     */
    getDiscovery(): DiscoveryDocument | null;
    /**
     * Get cached JWKS
     */
    getJWKS(): JWKS$1 | null;
    /**
     * Cleanup resources
     */
    destroy(): void;
}

type CustomRenderer = (c: Context, template: string, data: Record<string, unknown>, renderOptions: Record<string, unknown>) => Response | Promise<Response>;
interface TemplateEngineOptions {
    engine?: 'ejs' | 'pug' | 'jsx' | 'custom';
    templatesDir?: string;
    layout?: string | null;
    engineOptions?: Record<string, unknown>;
    customRenderer?: CustomRenderer | null;
}
declare function setupTemplateEngine(options?: TemplateEngineOptions): MiddlewareHandler$1;
declare function ejsEngine(templatesDir: string, options?: Omit<TemplateEngineOptions, 'engine' | 'templatesDir'>): MiddlewareHandler$1;
declare function pugEngine(templatesDir: string, options?: Omit<TemplateEngineOptions, 'engine' | 'templatesDir'>): MiddlewareHandler$1;
declare function jsxEngine(): MiddlewareHandler$1;

interface OpenGraphDefaults {
    siteName?: string;
    locale?: string;
    type?: string;
    twitterCard?: string;
    twitterSite?: string | null;
    defaultImage?: string | null;
}
interface OpenGraphData extends OpenGraphDefaults {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    imageAlt?: string;
    imageWidth?: number;
    imageHeight?: number;
    twitterCreator?: string;
}
declare class OpenGraphHelper {
    private defaults;
    constructor(defaults?: OpenGraphDefaults);
    generateTags(data?: OpenGraphData): string;
    middleware(): MiddlewareHandler$1;
    private _escape;
}

interface UserInfo {
    scopes?: string[];
    [key: string]: unknown;
}
interface ValidationResult$1 {
    valid: boolean;
    errors?: unknown[];
}
interface ValidateBodyResult extends ValidationResult$1 {
    data?: Record<string, unknown>;
}
interface SchemaLike {
    validate(data: Record<string, unknown>): true | unknown[];
}
interface ResourceLike$3 {
    schema?: SchemaLike;
    [key: string]: unknown;
}
interface PluginRegistry {
    [key: string]: unknown;
}
interface PartitionFilter {
    partitionName: string;
    partitionFields: Record<string, unknown>;
}
interface ValidatorHelper {
    validate(resourceOrData: string | Record<string, unknown>, data?: Record<string, unknown> | null): ValidationResult$1;
    validateOrThrow(resourceOrData: string | Record<string, unknown>, data?: Record<string, unknown> | null): void;
    validateBody(resourceName?: string | null): Promise<ValidateBodyResult>;
}
interface WithContextOptions {
    resource?: ResourceLike$3 | null;
}
declare class RouteContext {
    c: Context;
    db: Database$a;
    database: Database$a;
    private _currentResource;
    pluginRegistry: PluginRegistry;
    resources: Record<string, ResourceLike$3>;
    validator: ValidatorHelper;
    resource: ResourceLike$3 | null;
    private _partitionFilters;
    constructor(honoContext: Context, database: Database$a, resource?: ResourceLike$3 | null, plugins?: PluginRegistry);
    private _createResourcesProxy;
    private _createValidator;
    param(name: string): string | undefined;
    params(): Record<string, string>;
    query(name: string): string | undefined;
    queries(): Record<string, string>;
    header(name: string): string | undefined;
    body(): Promise<Record<string, unknown>>;
    text(): Promise<string>;
    formData(): Promise<FormData>;
    json(data: unknown, status?: number): Response;
    success(data: unknown, status?: number): Response;
    error(message: string | Error | null, status?: number, details?: unknown): Response;
    notFound(message?: string): Response;
    unauthorized(message?: string): Response;
    forbidden(message?: string): Response;
    html(htmlContent: string, status?: number): Response;
    redirect(url: string, status?: number): Response;
    render(template: string, data?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Response>;
    get user(): UserInfo | null;
    get session(): Record<string, unknown> | null;
    get sessionId(): string | null;
    get requestId(): string | null;
    get isAuthenticated(): boolean;
    hasScope(scope: string): boolean;
    hasAnyScope(...scopes: string[]): boolean;
    hasAllScopes(...scopes: string[]): boolean;
    requireAuth(): void;
    requireScope(scope: string): void;
    setPartition(partitionName: string, partitionFields: Record<string, unknown>): void;
    getPartitionFilters(): PartitionFilter[];
    clearPartitionFilters(): void;
    hasPartitionFilters(): boolean;
}
declare function withContext(handler: (c: Context, ctx: RouteContext) => Promise<Response>, options?: WithContextOptions): (c: Context) => Promise<Response>;

declare function errorResponse(c: Context, message: string, status?: number): Response;
declare function successResponse(c: Context, data: unknown, status?: number): Response;

interface ResourceLike$2 {
    [key: string]: unknown;
}
interface DatabaseLike$2 {
    resources?: Record<string, ResourceLike$2>;
    [key: string]: unknown;
}
declare function createContextInjectionMiddleware(database: DatabaseLike$2): MiddlewareHandler$1;

interface CookieChunkOverflowDetails {
    cookieName: string;
    chunkCount: number;
    chunkLimit: number;
    payloadBytes: number;
}
interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    maxAge?: number;
    domain?: string;
    path?: string;
    expires?: Date;
}
interface ChunkingOptions {
    onOverflow?: (details: CookieChunkOverflowDetails & {
        value: string;
    }) => boolean | void;
}
type CookieJar = Record<string, string>;
declare function setChunkedCookie(context: Context, name: string, value: string | null | undefined, options?: CookieOptions, chunkingOptions?: ChunkingOptions): void;
declare function getChunkedCookie(context: Context, name: string, cookieJarOverride?: CookieJar | null): string | null;
declare function deleteChunkedCookie(context: Context, name: string, options?: CookieOptions, cookieJar?: CookieJar | null): void;
declare function isChunkedCookie(context: Context, name: string): boolean;

/**
 * API Plugin - RESTful HTTP API for s3db.js resources
 *
 * Transforms s3db.js resources into HTTP REST endpoints with:
 * - Multiple authentication methods (JWT, API Key, Basic Auth, Public)
 * - Automatic versioning based on resource version
 * - Production features (CORS, Rate Limiting, Logging, Compression)
 * - Schema validation middleware
 * - Custom middleware support
 *
 * @example
 * const apiPlugin = new ApiPlugin({
 *   port: 3000,
 *   docs: { enabled: true },
 *   auth: {
 *     jwt: { enabled: true, secret: 'my-secret' },
 *     apiKey: { enabled: true }
 *   },
 *   resources: {
 *     cars: {
 *       auth: ['jwt', 'apiKey'],
 *       methods: ['GET', 'POST', 'PUT', 'DELETE']
 *     }
 *   },
 *   cors: { enabled: true },
 *   rateLimit: { enabled: true, maxRequests: 100 },
 *   logging: { enabled: true },
 *   compression: { enabled: true },
 *   validation: { enabled: true }
 * });
 *
 * await database.usePlugin(apiPlugin);
 */

interface RegistrationConfig$1 {
    enabled: boolean;
    allowedFields: string[];
    defaultRole: string;
}
interface LoginThrottleConfig {
    enabled: boolean;
    maxAttempts: number;
    windowMs: number;
    blockDurationMs: number;
    maxEntries: number;
}
interface DocsConfig {
    enabled: boolean;
    ui: 'swagger' | 'redoc';
    title: string;
    version: string;
    description: string;
    csp: string | null;
}
interface CorsConfig$2 {
    enabled: boolean;
    origin: string | string[];
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
}
interface RateLimitConfig$1 {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    keyGenerator: ((c: Context) => string) | null;
    maxUniqueKeys: number;
    rules: unknown[];
}
interface LoggingConfig$2 {
    enabled: boolean;
    [key: string]: unknown;
}
interface CompressionConfig {
    enabled: boolean;
    threshold: number;
    level: number;
}
interface ValidationConfig {
    enabled: boolean;
    validateOnInsert: boolean;
    validateOnUpdate: boolean;
    returnValidationErrors: boolean;
}
interface CspDirectives {
    'default-src'?: string[];
    'script-src'?: string[];
    'style-src'?: string[];
    'font-src'?: string[];
    'img-src'?: string[];
    'connect-src'?: string[];
    [key: string]: string[] | undefined;
}
interface ContentSecurityPolicyConfig$1 {
    enabled: boolean;
    directives: CspDirectives;
    reportOnly: boolean;
    reportUri: string | null;
}
interface FrameguardConfig {
    action: 'deny' | 'sameorigin';
}
interface HstsConfig {
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
}
interface ReferrerPolicyConfig {
    policy: string;
}
interface DnsPrefetchControlConfig {
    allow: boolean;
}
interface PermittedCrossDomainPoliciesConfig {
    policy: string;
}
interface XssFilterConfig {
    mode: string;
}
interface PermissionsPolicyFeatures {
    geolocation?: string[];
    microphone?: string[];
    camera?: string[];
    payment?: string[];
    usb?: string[];
    magnetometer?: string[];
    gyroscope?: string[];
    accelerometer?: string[];
    [key: string]: string[] | undefined;
}
interface PermissionsPolicyConfig {
    features: PermissionsPolicyFeatures;
}
interface SecurityConfig$2 {
    enabled: boolean;
    contentSecurityPolicy: ContentSecurityPolicyConfig$1 | false;
    frameguard: FrameguardConfig | false;
    noSniff: boolean;
    hsts: HstsConfig | false;
    referrerPolicy: ReferrerPolicyConfig | false;
    dnsPrefetchControl: DnsPrefetchControlConfig | false;
    ieNoOpen: boolean;
    permittedCrossDomainPolicies: PermittedCrossDomainPoliciesConfig | false;
    xssFilter: XssFilterConfig | false;
    permissionsPolicy: PermissionsPolicyConfig | false;
}
interface TemplatesConfig {
    enabled: boolean;
    engine: 'jsx' | 'ejs' | 'custom';
    templatesDir: string;
    layout: string | null;
    engineOptions: Record<string, unknown>;
    customRenderer: ((template: string, data: unknown) => string) | null;
}
interface FailbanConfig$2 {
    enabled: boolean;
    resourceNames?: Record<string, string>;
    [key: string]: unknown;
}
interface HealthConfig$1 {
    enabled: boolean;
    [key: string]: unknown;
}
interface StaticConfig {
    path: string;
    root: string;
    [key: string]: unknown;
}
interface AuthDriverDefinition {
    driver: string;
    config?: {
        resource?: string;
        [key: string]: unknown;
    };
}
interface AuthConfig {
    drivers: AuthDriverDefinition[];
    registration: RegistrationConfig$1;
    loginThrottle: LoginThrottleConfig;
    createResource: boolean;
    usersResourcePasswordValidation: string;
    enableIdentityContextMiddleware: boolean;
    usersResourceAttributes: Record<string, string>;
    resource?: string;
    [key: string]: unknown;
}
interface ApiPluginConfig {
    port: number;
    host: string;
    logLevel: string | false;
    basePath: string;
    startupBanner: boolean;
    versionPrefix: boolean | string;
    docs: DocsConfig;
    auth: AuthConfig;
    routes: Record<string, unknown>;
    templates: TemplatesConfig;
    cors: CorsConfig$2;
    rateLimit: RateLimitConfig$1;
    logging: LoggingConfig$2;
    compression: CompressionConfig;
    validation: ValidationConfig;
    security: SecurityConfig$2;
    middlewares: MiddlewareHandler$1[];
    requestId: {
        enabled: boolean;
    };
    sessionTracking: {
        enabled: boolean;
    };
    events: {
        enabled: boolean;
    };
    metrics: {
        enabled: boolean;
    };
    failban: FailbanConfig$2;
    static: StaticConfig[];
    health: HealthConfig$1;
    maxBodySize: number;
    resources: Record<string, unknown>;
}
interface ApiPluginOptions {
    port?: number;
    host?: string;
    basePath?: string;
    startupBanner?: boolean;
    versionPrefix?: boolean | string;
    docs?: Partial<DocsConfig>;
    docsEnabled?: boolean;
    apiTitle?: string;
    apiVersion?: string;
    apiDescription?: string;
    auth?: Partial<AuthConfig> & {
        resource?: string;
        registration?: Partial<RegistrationConfig$1>;
        loginThrottle?: Partial<LoginThrottleConfig>;
    };
    routes?: Record<string, unknown>;
    templates?: Partial<TemplatesConfig>;
    cors?: Partial<CorsConfig$2>;
    rateLimit?: Partial<RateLimitConfig$1> & {
        rules?: unknown[];
    };
    logging?: Partial<LoggingConfig$2>;
    compression?: Partial<CompressionConfig>;
    validation?: Partial<ValidationConfig>;
    security?: Partial<SecurityConfig$2> & {
        contentSecurityPolicy?: Partial<ContentSecurityPolicyConfig$1> | false;
    };
    csp?: {
        directives?: CspDirectives;
        reportOnly?: boolean;
        reportUri?: string;
    };
    middlewares?: MiddlewareHandler$1[];
    requestId?: {
        enabled: boolean;
    };
    sessionTracking?: {
        enabled: boolean;
    };
    events?: {
        enabled: boolean;
    };
    metrics?: {
        enabled: boolean;
    };
    failban?: Partial<FailbanConfig$2>;
    static?: StaticConfig[];
    health?: Partial<HealthConfig$1> | boolean;
    maxBodySize?: number;
    resources?: Record<string, unknown>;
    resourceNames?: {
        authUsers?: string;
        failban?: Record<string, string>;
    };
    logLevel?: string | false;
}
interface ServerInfo$1 {
    isRunning: boolean;
    port?: number;
    host?: string;
    resources?: number;
}
interface UninstallOptions {
    purgeData?: boolean;
}
interface ResourceLike$1 {
    name: string;
    [key: string]: unknown;
}
declare class ApiPlugin extends Plugin {
    config: ApiPluginConfig;
    private _usersResourceDescriptor;
    usersResourceName: string;
    server: ApiServer | null;
    usersResource: ResourceLike$1 | null;
    compiledMiddlewares: MiddlewareHandler$1[];
    constructor(options?: ApiPluginOptions);
    private _validateDependencies;
    onInstall(): Promise<void>;
    private _createUsersResource;
    private _findExistingUsersResource;
    private _deepMerge;
    private _setupMiddlewares;
    onStart(): Promise<void>;
    private _checkPortAvailability;
    onStop(): Promise<void>;
    private _resolveUsersResourceName;
    onNamespaceChanged(): void;
    onUninstall(options?: UninstallOptions): Promise<void>;
    getServerInfo(): ServerInfo$1;
    getApp(): Hono | null;
}

interface JWK {
    kty: string;
    use: string;
    alg: string;
    kid: string;
    n: string;
    e: string;
}
interface JWKS {
    keys: JWK[];
}
interface JWTHeader {
    alg: string;
    typ: string;
    kid: string;
}
interface JWTPayload {
    iss?: string;
    sub?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    [key: string]: any;
}
interface KeyRecord {
    id?: string;
    kid: string;
    publicKey: string;
    privateKey: string;
    algorithm?: string;
    use?: string;
    active: boolean;
    createdAt?: string;
    purpose?: string;
}
interface KeyEntry {
    publicKey: string;
    privateKey: string;
    kid: string;
    createdAt?: string;
    active: boolean;
    purpose: string;
    id?: string;
}
interface VerifyTokenResult {
    payload: JWTPayload;
    header: JWTHeader;
    kid: string;
}
interface KeyResource$1 {
    list: () => Promise<KeyRecord[]>;
    query: (filter: Record<string, any>) => Promise<KeyRecord[]>;
    insert: (data: Record<string, any>) => Promise<KeyRecord>;
    update: (id: string, data: Record<string, any>) => Promise<KeyRecord>;
}
declare class KeyManager {
    private keyResource;
    private keysByPurpose;
    private currentKeys;
    private keysByKid;
    constructor(keyResource: KeyResource$1);
    initialize(): Promise<void>;
    rotateKey(purpose?: string): Promise<KeyRecord>;
    getCurrentKey(purpose?: string): KeyEntry | null;
    getKey(kid: string): Promise<KeyEntry | null>;
    ensurePurpose(purpose?: string): Promise<KeyEntry>;
    getJWKS(): Promise<JWKS>;
    createToken(payload: JWTPayload, expiresIn?: string, purpose?: string): string;
    verifyToken(token: string): Promise<VerifyTokenResult | null>;
    private _normalizePurpose;
    private _storeKeyRecord;
}

/**
 * OAuth2/OIDC Authorization Server
 *
 * Provides endpoints for OAuth2 + OpenID Connect flows:
 * - /.well-known/openid-configuration (Discovery)
 * - /.well-known/jwks.json (Public keys)
 * - /auth/token (Token endpoint)
 * - /auth/userinfo (User info endpoint)
 * - /auth/introspect (Token introspection)
 */

interface OAuth2ServerOptions {
    issuer: string;
    keyResource: KeyResource;
    userResource: UserResource;
    clientResource?: ClientResource;
    authCodeResource?: AuthCodeResource;
    supportedScopes?: string[];
    supportedGrantTypes?: string[];
    supportedResponseTypes?: string[];
    accessTokenExpiry?: string;
    idTokenExpiry?: string;
    refreshTokenExpiry?: string;
    authCodeExpiry?: string;
}
interface KeyResource {
    list: () => Promise<KeyRecord[]>;
    query: (filter: Record<string, any>) => Promise<KeyRecord[]>;
    insert: (data: Record<string, any>) => Promise<KeyRecord>;
    update: (id: string, data: Record<string, any>) => Promise<KeyRecord>;
}
interface UserResource {
    get: (id: string) => Promise<UserRecord | null>;
    query: (filter: Record<string, any>) => Promise<UserRecord[]>;
}
interface ClientResource {
    query: (filter: Record<string, any>) => Promise<ClientRecord[]>;
    insert: (data: Record<string, any>) => Promise<ClientRecord>;
}
interface AuthCodeResource {
    query: (filter: Record<string, any>) => Promise<AuthCodeRecord[]>;
    insert: (data: Record<string, any>) => Promise<AuthCodeRecord>;
    delete: (id: string) => Promise<void>;
}
interface UserRecord {
    id: string;
    email?: string;
    password?: string;
    name?: string;
    givenName?: string;
    familyName?: string;
    picture?: string;
    tenantId?: string;
    emailVerified?: boolean;
    active?: boolean;
    roles?: string[];
    metadata?: Record<string, any>;
    locale?: string;
    zoneinfo?: string;
    birthdate?: string;
    gender?: string;
}
interface ClientRecord {
    id: string;
    clientId: string;
    clientSecret?: string;
    secret?: string;
    secrets?: string[];
    name?: string;
    clientName?: string;
    displayName?: string;
    redirectUris?: string[];
    allowedScopes?: string[];
    grantTypes?: string[];
    allowedGrantTypes?: string[];
    responseTypes?: string[];
    tokenEndpointAuthMethod?: string;
    active?: boolean;
    audiences?: string[];
    allowedAudiences?: string[];
    defaultAudience?: string;
    audience?: string;
    tenantId?: string;
    description?: string;
    metadata?: {
        audiences?: string[];
        audience?: string;
        [key: string]: any;
    };
}
interface AuthCodeRecord {
    id: string;
    code: string;
    clientId: string;
    userId: string;
    redirectUri: string;
    scope: string;
    expiresAt: string | number;
    used: boolean;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    nonce?: string;
    audience?: string;
}
interface ExpressStyleRequest$1 {
    body: Record<string, any>;
    query?: Record<string, any>;
    headers: {
        authorization?: string;
        [key: string]: string | undefined;
    };
    authenticatedClient?: ClientRecord | null;
}
interface ExpressStyleResponse$1 {
    status: (code: number) => ExpressStyleResponse$1;
    json: (data: any) => any;
    header: (name: string, value: string) => ExpressStyleResponse$1;
    send: (data?: any) => any;
    redirect: (url: string) => any;
}
interface IdentityPluginInstance$1 {
    authenticateWithPassword?: (params: {
        email: string;
        password: string;
    }) => Promise<AuthenticateResult$1>;
    getAuthDriver?: (type: string) => AuthDriver$1 | undefined;
    config?: {
        logLevel?: string;
    };
}
interface AuthDriver$1 {
    supportsGrant?: (grantType: string) => boolean;
    authenticate: (request: {
        clientId: string;
        clientSecret: string;
    }) => Promise<{
        success: boolean;
        client?: ClientRecord;
    }>;
}
interface AuthenticateResult$1 {
    success: boolean;
    user?: UserRecord;
    error?: string;
    statusCode?: number;
}
declare class OAuth2Server {
    private issuer;
    private keyResource;
    private userResource;
    private clientResource;
    private authCodeResource;
    private supportedScopes;
    private supportedGrantTypes;
    private supportedResponseTypes;
    private accessTokenExpiry;
    private idTokenExpiry;
    private refreshTokenExpiry;
    private authCodeExpiry;
    private keyManager;
    private identityPlugin;
    private logger;
    constructor(options: OAuth2ServerOptions);
    initialize(): Promise<void>;
    setIdentityPlugin(identityPlugin: IdentityPluginInstance$1): void;
    discoveryHandler(_req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    jwksHandler(_req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    tokenHandler(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    handleClientCredentials(_req: ExpressStyleRequest$1, res: ExpressStyleResponse$1, context?: {
        client?: ClientRecord | {
            clientId: string;
        } | null;
        client_id?: string;
        scope?: string;
    }): Promise<any>;
    handleAuthorizationCode(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    handlePasswordGrant(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1, context?: {
        client?: ClientRecord | null;
        scope?: string;
    }): Promise<any>;
    handleRefreshToken(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1, context?: {
        client?: ClientRecord | null;
        scope?: string;
    }): Promise<any>;
    userinfoHandler(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    introspectHandler(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    authenticateClient(clientId: string, clientSecret: string): Promise<ClientRecord | null>;
    private _isHashedSecret;
    validatePKCE(codeVerifier: string, codeChallenge: string, codeChallengeMethod?: string): Promise<boolean>;
    parseExpiryToSeconds(expiresIn: string): number;
    private _resolveClientAudiences;
    private _formatAudienceClaim;
    private _buildServiceAccountContext;
    private _buildUserContext;
    authorizeHandler(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    authorizePostHandler(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    registerClientHandler(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    revokeHandler(req: ExpressStyleRequest$1, res: ExpressStyleResponse$1): Promise<any>;
    rotateKeys(): Promise<KeyRecord>;
    parseAuthCodeExpiry(value: string | number): number;
}

/**
 * Sliding window rate limiter for IP-based throttling
 */

interface RateLimiterOptions {
    windowMs?: number;
    max?: number;
}
interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfter: number;
}
declare class RateLimiter {
    private windowMs;
    private max;
    private buckets;
    constructor(options?: RateLimiterOptions);
    consume(key: string): RateLimitResult;
    enabled(): boolean;
    private _prune;
}

type AttributeSchema = string;
interface BaseAttributes {
    [key: string]: AttributeSchema;
}
interface ResourceConfig$2 {
    name?: string;
    attributes?: BaseAttributes;
    [key: string]: any;
}

interface PreparedResourceConfigs {
    users: {
        userConfig: ResourceConfig$2 | undefined;
        mergedConfig: ResourceConfig$2 | null;
    };
    tenants: {
        userConfig: ResourceConfig$2 | undefined;
        mergedConfig: ResourceConfig$2 | null;
    };
    clients: {
        userConfig: ResourceConfig$2 | undefined;
        mergedConfig: ResourceConfig$2 | null;
    };
}

/**
 * Base Authentication Driver Interface
 *
 * Abstract base class for authentication drivers in the Identity Plugin.
 * All auth drivers must extend this class and implement the required methods.
 */
interface AuthDriverContext {
    database?: any;
    config?: any;
    resources?: {
        users?: any;
        clients?: any;
        tenants?: any;
    };
    helpers?: {
        password?: {
            hash: (password: string) => Promise<string>;
            verify: (password: string, hash: string) => Promise<boolean>;
        };
        token?: any;
    };
}
interface AuthenticateRequest {
    email?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    user?: any;
    [key: string]: any;
}
interface AuthenticateResult {
    success: boolean;
    user?: any;
    client?: any;
    error?: string;
    statusCode?: number;
}
interface IssueTokensPayload {
    user?: any;
    client?: any;
    scopes?: string[];
    [key: string]: any;
}
interface RevokeTokensPayload {
    token?: string;
    tokenType?: string;
    userId?: string;
    clientId?: string;
    [key: string]: any;
}
declare class AuthDriver {
    name: string;
    supportedTypes: string[];
    constructor(name: string, supportedTypes?: string[]);
    initialize(_context: AuthDriverContext): Promise<void>;
    authenticate(_request: AuthenticateRequest): Promise<AuthenticateResult>;
    supportsType(type: string): boolean;
    supportsGrant(_grantType: string): boolean;
    issueTokens(_payload: IssueTokensPayload): Promise<any>;
    revokeTokens(_payload: RevokeTokensPayload): Promise<void>;
}

/**
 * Onboarding Manager - First-run setup for Identity Plugin
 *
 * Handles automatic admin account creation on first run with multiple modes:
 * - Interactive: CLI wizard with prompts (dev mode)
 * - Environment: IDENTITY_ADMIN_EMAIL/PASSWORD env vars (production)
 * - Config: Declarative admin object in config (Kubernetes/Docker)
 * - Callback: Custom onFirstRun function (advanced)
 *
 * Security:
 * - Strong password validation (min 12 chars, complexity)
 * - Optional leaked password check (haveibeenpwned)
 * - Audit trail for admin creation
 * - Idempotent - skips if admin exists
 */
interface OnboardingConfig {
    enabled?: boolean;
    mode?: string;
    logLevel?: string;
    admin?: {
        email: string;
        password: string;
        name?: string;
        scopes?: string[];
        metadata?: Record<string, any>;
    };
    adminEmail?: string;
    adminPassword?: string;
    adminName?: string;
    passwordPolicy?: PasswordPolicy;
    onFirstRun?: OnFirstRunCallback;
    callback?: OnFirstRunCallback;
    force?: boolean;
}
interface PasswordPolicy {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSymbols?: boolean;
}
interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
}
interface OnboardingManagerOptions {
    resources?: {
        users?: Resource$6;
        clients?: Resource$6;
        tenants?: Resource$6;
    };
    db?: any;
    database?: any;
    logger?: Logger$b;
    options?: {
        issuer?: string;
        logLevel?: string;
        [key: string]: unknown;
    };
    config?: OnboardingConfig;
    auditPlugin?: AuditPlugin;
    pluginStorageResource?: Resource$6;
    usersResource?: Resource$6;
    clientsResource?: Resource$6;
}
interface AdminOptions {
    email: string;
    password: string;
    name?: string;
    scopes?: string[];
    metadata?: Record<string, any>;
}
interface ClientOptions {
    name: string;
    clientId?: string;
    clientSecret?: string;
    grantTypes?: string[];
    allowedScopes?: string[];
    redirectUris?: string[];
    audiences?: string[];
    metadata?: Record<string, any>;
}
interface ClientCredentials {
    id: string;
    clientId: string;
    clientSecret: string;
    name: string;
    grantTypes: string[];
    allowedScopes: string[];
    redirectUris: string[];
}
interface OnboardingStatus$2 {
    completed: boolean;
    adminExists?: boolean;
    completedAt?: string;
    mode?: string;
    clientsCount?: number;
    error?: string;
}
interface OnFirstRunContext {
    createAdmin: (options: AdminOptions) => Promise<any>;
    createClient: (options: ClientOptions) => Promise<ClientCredentials>;
    db: any;
    logger: Logger$b;
    config: OnboardingConfig;
}
type OnFirstRunCallback = (context: OnFirstRunContext) => Promise<void>;
interface Resource$6 {
    query: (filter: Record<string, any>) => Promise<any[]>;
    insert: (data: Record<string, any>) => Promise<any>;
}
interface Logger$b {
    info?: (message: string, ...args: any[]) => void;
    error?: (message: string, ...args: any[]) => void;
}
interface AuditPlugin {
    log: (data: {
        action: string;
        resource: string;
        metadata: Record<string, any>;
    }) => Promise<void>;
}
declare class OnboardingManager {
    private resources;
    private database;
    private logger;
    private config;
    private auditPlugin?;
    private pluginStorageResource?;
    private usersResource?;
    private clientsResource?;
    private passwordPolicy;
    private defaultAdminScopes;
    constructor(options?: OnboardingManagerOptions);
    detectFirstRun(): Promise<boolean>;
    validatePassword(password: string): PasswordValidationResult;
    validateEmail(email: string): boolean;
    createAdmin(options: AdminOptions): Promise<any>;
    createClient(options: ClientOptions): Promise<ClientCredentials>;
    getOnboardingStatus(): Promise<OnboardingStatus$2>;
    markOnboardingComplete(data?: Record<string, any>): Promise<void>;
    runEnvMode(): Promise<any>;
    runConfigMode(): Promise<any>;
    runCallbackMode(): Promise<void>;
    runInteractiveMode(): Promise<any>;
    private _getOnboardingMetadata;
    private _logAuditEvent;
    static resetCache(): void;
}

/**
 * Session Manager - Handles user sessions for Identity Provider
 *
 * Manages session lifecycle using S3DB resource as storage:
 * - Create/validate/destroy sessions
 * - Cookie-based session handling
 * - Automatic session cleanup (expired sessions)
 * - IP address and user agent tracking
 */
interface SessionConfig {
    sessionExpiry: string;
    cookieName: string;
    cookiePath: string;
    cookieHttpOnly: boolean;
    cookieSecure: boolean;
    cookieSameSite: 'Strict' | 'Lax' | 'None';
    cleanupInterval: number;
    enableCleanup: boolean;
}
interface SessionManagerOptions {
    sessionResource: SessionResource;
    config?: Partial<SessionConfig>;
}
interface CreateSessionData {
    userId: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    duration?: string;
}
interface CreateSessionResult {
    sessionId: string;
    expiresAt: number;
    session: SessionRecord;
}
interface ValidateSessionResult {
    valid: boolean;
    session: SessionRecord | null;
    reason: string | null;
}
interface SessionStatistics {
    total: number;
    active: number;
    expired: number;
    users: number;
}
interface SessionRecord {
    id: string;
    userId: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, any>;
    createdAt: string;
}
interface SessionResource {
    insert: (data: Record<string, any>) => Promise<SessionRecord>;
    get: (id: string) => Promise<SessionRecord | null>;
    update: (id: string, data: Record<string, any>) => Promise<SessionRecord>;
    delete: (id: string) => Promise<void>;
    query: (filter: Record<string, any>) => Promise<SessionRecord[]>;
    list: (options?: {
        limit?: number;
    }) => Promise<SessionRecord[]>;
}
interface HttpResponse$4 {
    setHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => void;
}
interface HttpRequest {
    headers?: {
        cookie?: string;
    };
    header?: (name: string) => string | undefined;
}
declare class SessionManager {
    private sessionResource;
    private config;
    private cronManager;
    private cleanupJobName;
    private logger;
    constructor(options: SessionManagerOptions);
    createSession(data: CreateSessionData): Promise<CreateSessionResult>;
    validateSession(sessionId: string): Promise<ValidateSessionResult>;
    getSession(sessionId: string): Promise<SessionRecord | null>;
    updateSession(sessionId: string, metadata: Record<string, any>): Promise<SessionRecord>;
    destroySession(sessionId: string): Promise<boolean>;
    destroyUserSessions(userId: string): Promise<number>;
    getUserSessions(userId: string): Promise<SessionRecord[]>;
    setSessionCookie(res: HttpResponse$4, sessionId: string, expiresAt: number): void;
    clearSessionCookie(res: HttpResponse$4): void;
    getSessionIdFromRequest(req: HttpRequest): string | null;
    cleanupExpiredSessions(): Promise<number>;
    private _startCleanup;
    stopCleanup(): void;
    getStatistics(): Promise<SessionStatistics>;
}

/**
 * Email Service for Identity Provider
 * Handles email sending via SMTP with template support
 */
interface SMTPAuth {
    user: string;
    pass: string;
}
interface SMTPTLSOptions {
    rejectUnauthorized: boolean;
}
interface TemplateConfig {
    baseUrl: string;
    brandName: string;
    brandLogo: string | null;
    brandColor: string;
    supportEmail: string | null;
    customFooter: string | null;
}
interface EmailServiceOptions {
    enabled?: boolean;
    from?: string;
    replyTo?: string | null;
    smtp?: Partial<{
        host: string;
        port: number;
        secure: boolean;
        auth: Partial<SMTPAuth>;
        tls: Partial<SMTPTLSOptions>;
    }>;
    templates?: Partial<TemplateConfig>;
    logLevel?: string | null;
}
interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
}
interface SendEmailResult {
    success: boolean;
    messageId?: string;
    accepted?: string[];
    rejected?: string[];
    reason?: string;
    error?: string;
}
interface PasswordResetEmailOptions {
    to: string;
    name: string;
    resetToken: string;
    expiresIn?: number;
}
interface EmailVerificationOptions {
    to: string;
    name: string;
    verificationToken: string;
    expiresIn?: number;
}
interface WelcomeEmailOptions {
    to: string;
    name: string;
}
declare class EmailService {
    private config;
    private transporter;
    private initialized;
    private logger;
    constructor(options?: EmailServiceOptions);
    private _initialize;
    sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
    private _htmlToText;
    private _baseTemplate;
    sendPasswordResetEmail({ to, name, resetToken, expiresIn }: PasswordResetEmailOptions): Promise<SendEmailResult>;
    sendEmailVerificationEmail({ to, name, verificationToken, expiresIn }: EmailVerificationOptions): Promise<SendEmailResult>;
    sendWelcomeEmail({ to, name }: WelcomeEmailOptions): Promise<SendEmailResult>;
    testConnection(): Promise<boolean>;
    close(): Promise<void>;
}

/**
 * MFA Manager - Multi-Factor Authentication for Identity Plugin
 *
 * Handles TOTP (Time-based One-Time Password) generation, verification,
 * and backup codes management.
 *
 * Compatible with: Google Authenticator, Authy, Microsoft Authenticator, 1Password
 */
type TOTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';
interface MFAManagerOptions {
    issuer?: string;
    algorithm?: TOTPAlgorithm;
    digits?: number;
    period?: number;
    window?: number;
    backupCodesCount?: number;
    backupCodeLength?: number;
}
interface MFAEnrollment {
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
    algorithm: TOTPAlgorithm;
    digits: number;
    period: number;
}
declare class MFAManager {
    private options;
    private OTPAuth;
    private logger;
    constructor(options?: MFAManagerOptions);
    initialize(): Promise<void>;
    generateEnrollment(accountName: string): MFAEnrollment;
    verifyTOTP(secret: string, token: string): boolean;
    generateBackupCodes(count?: number): string[];
    hashBackupCodes(codes: string[]): Promise<string[]>;
    verifyBackupCode(code: string, hashedCodes: string[]): Promise<number>;
    generateQRCodeDataURL(qrCodeUrl: string): Promise<string | null>;
}

/**
 * Identity Server - Hono-based HTTP server for Identity Provider Plugin
 *
 * Manages OAuth2/OIDC endpoints only (no CRUD routes)
 */

interface IdentityServerOptions {
    port?: number;
    host?: string;
    logLevel?: string;
    issuer?: string;
    oauth2Server?: OAuth2ServerInstance;
    sessionManager?: SessionManagerInstance | null;
    usersResource?: any;
    identityPlugin?: IdentityPluginInstance | null;
    failbanManager?: FailbanManagerInstance | null;
    failbanConfig?: FailbanConfig$1;
    cors?: CorsConfig$1;
    security?: SecurityConfig$1;
    logging?: LoggingConfig$1;
    logger?: Logger$a;
}
interface CorsConfig$1 {
    enabled?: boolean;
    origin?: string;
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
interface SecurityConfig$1 {
    enabled?: boolean;
    contentSecurityPolicy?: Record<string, any>;
}
interface LoggingConfig$1 {
    enabled?: boolean;
    format?: string;
}
interface FailbanConfig$1 {
    enabled?: boolean;
    geo?: {
        enabled?: boolean;
    };
}
interface Logger$a {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    debug: (arg1: any, arg2?: any) => void;
}
interface OAuth2ServerInstance {
    discoveryHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    jwksHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    tokenHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    userinfoHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    introspectHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    authorizeHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    authorizePostHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    registerClientHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    revokeHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
}
interface SessionManagerInstance {
}
interface IdentityPluginInstance {
    getOnboardingStatus?: () => Promise<OnboardingStatus$1>;
    getIntegrationMetadata: () => IntegrationMetadata$1;
    rateLimiters?: Record<string, RateLimiter>;
}
interface OnboardingStatus$1 {
    completed: boolean;
    adminExists: boolean;
    mode?: string;
    completedAt?: string;
}
interface IntegrationMetadata$1 {
    cacheTtl: number;
    issuedAt: string;
    [key: string]: any;
}
interface FailbanManagerInstance {
    isBlacklisted: (ip: string) => boolean;
    checkCountryBlock: (ip: string) => {
        country: string;
        reason: string;
    } | null;
    isBanned: (ip: string) => boolean;
    getBan: (ip: string) => Promise<BanRecord | null>;
}
interface BanRecord {
    expiresAt: string;
    reason: string;
}
interface ExpressStyleRequest {
    method: string;
    url: string;
    originalUrl: string;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body: Record<string, any>;
    cookies: Record<string, string>;
    ip: string;
    protocol: string;
    get: (name: string) => string | undefined;
}
interface ExpressStyleResponse {
    status: (code: number) => ExpressStyleResponse;
    json: (data: any) => any;
    header: (name: string, value: string) => ExpressStyleResponse;
    setHeader: (name: string, value: string) => ExpressStyleResponse;
    send: (data?: any) => any;
    redirect: (url: string, code?: number) => any;
}
declare class IdentityServer {
    private options;
    private app;
    private server;
    private isRunning;
    private initialized;
    private logger;
    private Hono;
    private serve;
    private identityPlugin;
    constructor(options?: IdentityServerOptions);
    private _setupFailbanMiddleware;
    private _extractClientIp;
    private _createRateLimitMiddleware;
    private _setupRoutes;
    private _setupOAuth2Routes;
    private _setupUIRoutes;
    start(): Promise<void>;
    get port(): number;
    stop(): Promise<void>;
    getInfo(): {
        isRunning: boolean;
        port: number;
        host: string;
        issuer: string;
    };
    getApp(): Hono | null;
}

/**
 * Identity Provider Plugin - OAuth2/OIDC Authorization Server
 *
 * Provides complete OAuth2 + OpenID Connect server functionality:
 * - RSA key management for token signing
 * - OAuth2 grant types (authorization_code, client_credentials, refresh_token)
 * - OIDC flows (id_token, userinfo endpoint)
 * - Token introspection
 * - Client registration
 *
 * @example
 * import { Database } from 's3db.js';
 * import { IdentityPlugin } from 's3db.js/plugins/identity';
 *
 * const db = new Database({ connectionString: '...' });
 * await db.connect();
 *
 * await db.usePlugin(new IdentityPlugin({
 *   port: 4000,
 *   issuer: 'http://localhost:4000',
 *   supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
 *   supportedGrantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
 *   accessTokenExpiry: '15m',
 *   idTokenExpiry: '15m',
 *   refreshTokenExpiry: '7d'
 * }));
 */

interface CorsConfig {
    enabled: boolean;
    origin: string | string[];
    methods: string[];
    allowedHeaders: string[];
    credentials: boolean;
    maxAge: number;
}
interface ContentSecurityPolicyConfig {
    enabled: boolean;
    directives: Record<string, string[]>;
    reportOnly: boolean;
    reportUri: string | null;
}
interface SecurityConfig {
    enabled: boolean;
    contentSecurityPolicy: ContentSecurityPolicyConfig;
}
interface LoggingConfig {
    enabled: boolean;
    format: string;
}
interface OnboardingOptions {
    enabled: boolean;
    mode: 'interactive' | 'env' | 'config' | 'callback' | 'disabled';
    force: boolean;
    adminEmail?: string;
    adminPassword?: string;
    adminName?: string;
    admin?: {
        email: string;
        password: string;
        name?: string;
        scopes?: string[];
    };
    onFirstRun?: (context: any) => Promise<void>;
    interactive?: Record<string, any>;
    passwordPolicy?: Record<string, any>;
}
interface SessionOptions {
    sessionExpiry: string;
    cookieName: string;
    cookiePath: string;
    cookieHttpOnly: boolean;
    cookieSecure: boolean;
    cookieSameSite: 'Strict' | 'Lax' | 'None';
    cleanupInterval: number;
    enableCleanup: boolean;
}
interface PasswordPolicyConfig {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSymbols: boolean;
    bcryptRounds: number;
}
interface RegistrationConfig {
    enabled: boolean;
    requireEmailVerification: boolean;
    allowedDomains: string[] | null;
    blockedDomains: string[];
    customMessage: string | null;
}
interface UIConfig {
    title: string;
    companyName: string;
    legalName: string;
    tagline: string;
    welcomeMessage: string;
    logoUrl: string | null;
    logo: string | null;
    favicon: string | null;
    primaryColor: string;
    secondaryColor: string;
    successColor: string;
    dangerColor: string;
    warningColor: string;
    infoColor: string;
    textColor: string;
    textMuted: string;
    backgroundColor: string;
    backgroundLight: string;
    borderColor: string;
    fontFamily: string;
    fontSize: string;
    borderRadius: string;
    boxShadow: string;
    footerText: string | null;
    supportEmail: string | null;
    privacyUrl: string;
    termsUrl: string;
    socialLinks: Record<string, string> | null;
    customCSS: string | null;
    customPages: Record<string, string>;
    baseUrl: string;
}
interface SMTPConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    tls: {
        rejectUnauthorized: boolean;
    };
}
interface EmailTemplatesConfig {
    baseUrl: string;
    brandName: string;
    brandLogo: string | null;
    brandColor: string;
    supportEmail: string | null;
    customFooter: string | null;
}
interface EmailConfig {
    enabled: boolean;
    from: string;
    replyTo: string | null;
    smtp: SMTPConfig;
    templates: EmailTemplatesConfig;
}
interface MFAConfig {
    enabled: boolean;
    required: boolean;
    issuer: string;
    algorithm: 'SHA1' | 'SHA256' | 'SHA512';
    digits: number;
    period: number;
    window: number;
    backupCodesCount: number;
    backupCodeLength: number;
}
interface AuditConfig {
    enabled: boolean;
    includeData: boolean;
    includePartitions: boolean;
    maxDataSize: number;
    resources: string[];
    events: string[];
}
interface AccountLockoutConfig {
    enabled: boolean;
    maxAttempts: number;
    lockoutDuration: number;
    resetOnSuccess: boolean;
}
interface GeoConfig {
    enabled: boolean;
    databasePath: string | null;
    allowedCountries: string[];
    blockedCountries: string[];
    blockUnknown: boolean;
}
interface FailbanEndpoints {
    login: boolean;
    token: boolean;
    register: boolean;
}
interface FailbanConfig {
    enabled: boolean;
    maxViolations: number;
    violationWindow: number;
    banDuration: number;
    whitelist: string[];
    blacklist: string[];
    persistViolations: boolean;
    endpoints: FailbanEndpoints;
    geo: GeoConfig;
}
interface RateLimitEndpoint {
    windowMs: number;
    max: number;
}
interface RateLimitConfig {
    enabled: boolean;
    login: RateLimitEndpoint;
    token: RateLimitEndpoint;
    authorize: RateLimitEndpoint;
}
interface PKCEConfig {
    enabled: boolean;
    required: boolean;
    methods: string[];
}
interface FeaturesConfig {
    discovery: boolean;
    jwks: boolean;
    token: boolean;
    authorize: boolean;
    userinfo: boolean;
    introspection: boolean;
    revocation: boolean;
    registration: boolean;
    builtInLoginUI: boolean;
    customLoginHandler: ((req: any, res: any) => Promise<void>) | null;
    pkce: PKCEConfig;
    refreshTokens: boolean;
    refreshTokenRotation: boolean;
    revokeOldRefreshTokens: boolean;
}
interface InternalResourceNames {
    oauthKeys: string;
    authCodes: string;
    sessions: string;
    passwordResetTokens: string;
    mfaDevices: string;
}
interface IdentityPluginConfig {
    port: number;
    host: string;
    logLevel: string;
    issuer: string;
    supportedScopes: string[];
    supportedGrantTypes: string[];
    supportedResponseTypes: string[];
    accessTokenExpiry: string;
    idTokenExpiry: string;
    refreshTokenExpiry: string;
    authCodeExpiry: string;
    resources: PreparedResourceConfigs;
    resourceNames: InternalResourceNames;
    cors: CorsConfig;
    security: SecurityConfig;
    logging: LoggingConfig;
    onboarding: OnboardingOptions;
    session: SessionOptions;
    passwordPolicy: PasswordPolicyConfig;
    registration: RegistrationConfig;
    ui: UIConfig;
    email: EmailConfig;
    mfa: MFAConfig;
    audit: AuditConfig;
    accountLockout: AccountLockoutConfig;
    failban: FailbanConfig;
    rateLimit: RateLimitConfig;
    features: FeaturesConfig;
    authDrivers: AuthDriversConfig | false;
}
interface AuthDriversConfig {
    disableBuiltIns?: boolean;
    drivers?: AuthDriver[];
    custom?: AuthDriver[];
    customDrivers?: AuthDriver[];
    builtIns?: Record<string, any>;
    [key: string]: any;
}
interface IdentityPluginOptions {
    port?: number;
    host?: string;
    logLevel?: string;
    issuer?: string;
    supportedScopes?: string[];
    supportedGrantTypes?: string[];
    supportedResponseTypes?: string[];
    accessTokenExpiry?: string;
    idTokenExpiry?: string;
    refreshTokenExpiry?: string;
    authCodeExpiry?: string;
    resources?: any;
    resourceNames?: Partial<InternalResourceNames>;
    internalResources?: Partial<InternalResourceNames>;
    cors?: Partial<CorsConfig>;
    security?: Partial<SecurityConfig>;
    logging?: Partial<LoggingConfig>;
    onboarding?: Partial<OnboardingOptions>;
    session?: Partial<SessionOptions>;
    passwordPolicy?: Partial<PasswordPolicyConfig>;
    registration?: Partial<RegistrationConfig>;
    ui?: Partial<UIConfig> & {
        logo?: string;
    };
    email?: Partial<EmailConfig>;
    mfa?: Partial<MFAConfig>;
    audit?: Partial<AuditConfig>;
    accountLockout?: Partial<AccountLockoutConfig>;
    failban?: Partial<FailbanConfig>;
    rateLimit?: Partial<RateLimitConfig>;
    features?: Partial<FeaturesConfig>;
    authDrivers?: AuthDriversConfig | false;
    [key: string]: unknown;
}
interface RegisterOAuthClientOptions {
    name?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUris: string[];
    allowedScopes?: string[];
    grantTypes?: string[];
    responseTypes?: string[];
    tokenEndpointAuthMethod?: string;
    audiences?: string[];
    metadata?: Record<string, any>;
}
interface RegisterOAuthClientResult {
    clientId: string;
    clientSecret: string;
    redirectUris: string[];
    allowedScopes: string[];
    grantTypes: string[];
    responseTypes: string[];
}
interface CompleteOnboardingOptions {
    admin?: {
        email: string;
        password: string;
        name?: string;
        scopes?: string[];
    };
    clients?: Array<{
        name?: string;
        redirectUris: string[];
        [key: string]: any;
    }>;
}
interface IntegrationMetadata {
    version: number;
    issuedAt: string;
    cacheTtl: number;
    issuer: string;
    discoveryUrl: string;
    jwksUrl: string;
    authorizationUrl: string;
    tokenUrl: string;
    userinfoUrl: string;
    introspectionUrl: string;
    revocationUrl: string;
    supportedScopes: string[];
    supportedGrantTypes: string[];
    supportedResponseTypes: string[];
    resources: {
        users: string;
        tenants: string;
        clients: string;
    };
    clientRegistration: {
        url: string;
        supportedAuth: string[];
    };
}
interface OnboardingStatus {
    completed: boolean;
    error?: string;
    [key: string]: any;
}
interface ServerInfo {
    isRunning: boolean;
    [key: string]: any;
}
interface AuthenticateWithPasswordParams {
    email: string;
    password: string;
    user?: any;
}
interface AuthenticateWithPasswordResult {
    success: boolean;
    error?: string;
    statusCode?: number;
    user?: Record<string, any>;
}
interface Resource$5 {
    name: string;
    insert: (data: Record<string, any>) => Promise<any>;
    get: (id: string) => Promise<any>;
    update: (id: string, data: Record<string, any>) => Promise<any>;
    delete: (id: string) => Promise<void>;
    query: (filter: Record<string, any>) => Promise<any[]>;
    list: (options?: {
        limit?: number;
    }) => Promise<any[]>;
}
/**
 * Identity Provider Plugin class
 */
declare class IdentityPlugin extends Plugin {
    config: IdentityPluginConfig;
    namespace: string;
    private _internalResourceOverrides;
    private _internalResourceDescriptors;
    internalResourceNames: InternalResourceNames;
    server: IdentityServer | null;
    oauth2Server: OAuth2Server | null;
    sessionManager: SessionManager | null;
    emailService: EmailService | null;
    failbanManager: FailbanManager | null;
    auditPlugin: AuditPlugin$1 | null;
    mfaManager: MFAManager | null;
    onboardingManager: OnboardingManager;
    keyManager: KeyManager | null;
    oauth2KeysResource: Resource$5 | null;
    oauth2AuthCodesResource: Resource$5 | null;
    sessionsResource: Resource$5 | null;
    passwordResetTokensResource: Resource$5 | null;
    mfaDevicesResource: Resource$5 | null;
    usersResource: Resource$5 | null;
    tenantsResource: Resource$5 | null;
    clientsResource: Resource$5 | null;
    rateLimiters: Record<string, RateLimiter>;
    authDrivers: Map<string, AuthDriver>;
    authDriverInstances: AuthDriver[];
    constructor(options?: IdentityPluginOptions);
    private _resolveInternalResourceNames;
    onNamespaceChanged(): void;
    private _validateDependencies;
    private _createRateLimiters;
    onInstall(): Promise<void>;
    private _exposeIntegrationMetadata;
    private _createOAuth2Resources;
    private _createUserManagedResources;
    private _initializeOAuth2Server;
    private _initializeSessionManager;
    private _initializeEmailService;
    private _initializeFailbanManager;
    private _initializeAuditPlugin;
    private _logAuditEvent;
    private _initializeMFAManager;
    private _initializeAuthDrivers;
    getAuthDriver(type: string): AuthDriver | undefined;
    private _sanitizeAuthSubject;
    authenticateWithPassword(params: AuthenticateWithPasswordParams): Promise<AuthenticateWithPasswordResult>;
    private _collectCustomAuthDrivers;
    private _extractBuiltInDriverOptions;
    private _isPlainObject;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(options?: {
        purgeData?: boolean;
    }): Promise<void>;
    getServerInfo(): ServerInfo;
    getOAuth2Server(): OAuth2Server | null;
    registerOAuthClient(options: RegisterOAuthClientOptions): Promise<RegisterOAuthClientResult>;
    private _runOnboarding;
    getOnboardingStatus(): Promise<OnboardingStatus>;
    completeOnboarding(options?: CompleteOnboardingOptions): Promise<void>;
    markOnboardingComplete(): Promise<void>;
    getIntegrationMetadata(): IntegrationMetadata;
}

interface BackupDriverConfig {
    compression?: 'none' | 'gzip' | 'brotli' | 'deflate';
    encryption?: {
        key: string;
        algorithm: string;
    } | null;
    logLevel?: string;
    [key: string]: unknown;
}
interface BackupManifest {
    type?: string;
    timestamp?: number;
    resources?: string[];
    compression?: string;
    encrypted?: boolean;
    s3db_version?: string;
    createdAt?: string;
    [key: string]: unknown;
}
interface UploadResult {
    path?: string;
    key?: string;
    bucket?: string;
    manifestPath?: string;
    manifestKey?: string;
    size?: number;
    uploadedAt?: string;
    storageClass?: string;
    etag?: string;
    [key: string]: unknown;
}
interface BackupMetadata {
    path?: string;
    key?: string;
    bucket?: string;
    manifestPath?: string;
    manifestKey?: string;
    destination?: number;
    destinations?: BackupMetadata[];
    status?: string;
    [key: string]: unknown;
}
interface ListOptions$2 {
    limit?: number;
    prefix?: string;
    [key: string]: unknown;
}
interface BackupListItem {
    id: string;
    path?: string;
    key?: string;
    bucket?: string;
    manifestPath?: string;
    manifestKey?: string;
    size?: number;
    createdAt?: string;
    lastModified?: string;
    storageClass?: string;
    destinations?: BackupMetadata[];
    [key: string]: unknown;
}
interface StorageInfo {
    type: string;
    config: BackupDriverConfig;
    [key: string]: unknown;
}
declare class BaseBackupDriver {
    config: BackupDriverConfig;
    logger: Logger$i;
    database: Database$a;
    constructor(config?: BackupDriverConfig);
    setup(database: Database$a): Promise<void>;
    onSetup(): Promise<void>;
    upload(_filePath: string, backupId: string, _manifest: BackupManifest): Promise<UploadResult | UploadResult[]>;
    download(backupId: string, _targetPath: string, _metadata: BackupMetadata): Promise<string>;
    delete(backupId: string, _metadata: BackupMetadata): Promise<void>;
    list(_options?: ListOptions$2): Promise<BackupListItem[]>;
    verify(backupId: string, _expectedChecksum: string, _metadata: BackupMetadata): Promise<boolean>;
    getType(): string;
    getStorageInfo(): StorageInfo;
    cleanup(): Promise<void>;
    log(message: string): void;
}

type CompressionType = 'none' | 'gzip' | 'brotli' | 'deflate';
type BackupType = 'full' | 'incremental';
interface EncryptionConfig {
    key: string;
    algorithm: string;
}
interface RetentionPolicy {
    daily?: number;
    weekly?: number;
    monthly?: number;
    yearly?: number;
}
interface BackupHookContext {
    backupId: string;
    type?: BackupType;
    error?: Error;
    size?: number;
    duration?: number;
    driverInfo?: UploadResult | UploadResult[];
    restored?: RestoredResourceInfo[];
    [key: string]: unknown;
}
type BackupHook = (type: string, context: BackupHookContext) => void | Promise<void>;
type RestoreHook = (backupId: string, context: Record<string, unknown>) => void | Promise<void>;
interface BackupPluginOptions {
    driver?: string;
    config?: Record<string, unknown>;
    schedule?: Record<string, unknown>;
    retention?: RetentionPolicy;
    compression?: CompressionType;
    encryption?: EncryptionConfig | null;
    verification?: boolean;
    parallelism?: number;
    include?: string[] | null;
    exclude?: string[];
    backupMetadataResource?: string;
    tempDir?: string;
    onBackupStart?: BackupHook | null;
    onBackupComplete?: BackupHook | null;
    onBackupError?: BackupHook | null;
    onRestoreStart?: RestoreHook | null;
    onRestoreComplete?: RestoreHook | null;
    onRestoreError?: RestoreHook | null;
    logLevel?: string;
    [key: string]: unknown;
}
interface BackupPluginConfig {
    driver: string;
    driverConfig: Record<string, unknown>;
    schedule: Record<string, unknown>;
    retention: Required<RetentionPolicy>;
    compression: CompressionType;
    encryption: EncryptionConfig | null;
    verification: boolean;
    parallelism: number;
    include: string[] | null;
    exclude: string[];
    backupMetadataResource: string;
    tempDir: string;
    logLevel?: string;
    onBackupStart: BackupHook | null;
    onBackupComplete: BackupHook | null;
    onBackupError: BackupHook | null;
    onRestoreStart: RestoreHook | null;
    onRestoreComplete: RestoreHook | null;
    onRestoreError: RestoreHook | null;
    [key: string]: unknown;
}
interface BackupMetadataRecord {
    id: string;
    type: BackupType;
    timestamp: number;
    resources: string[];
    driverInfo: UploadResult | UploadResult[];
    size: number;
    compressed: boolean;
    encrypted: boolean;
    checksum: string | null;
    status: 'in_progress' | 'completed' | 'failed';
    error: string | null;
    duration: number;
    createdAt: string;
}
interface BackupResult {
    id: string;
    type: BackupType;
    size: number;
    duration: number;
    checksum: string;
    driverInfo: UploadResult;
}
interface RestoredResourceInfo {
    name: string;
    recordsRestored: number;
    totalRecords: number;
}
interface RestoreResult {
    backupId: string;
    restored: RestoredResourceInfo[];
}
interface RestoreOptions {
    resources?: string[];
    mode?: 'merge' | 'replace' | 'skip';
}
interface ListBackupsOptions {
    limit?: number;
}
declare class BackupPlugin extends Plugin {
    config: BackupPluginConfig;
    driver: BaseBackupDriver | null;
    activeBackups: Set<string>;
    constructor(options?: BackupPluginOptions);
    createError(message: string, details?: Record<string, unknown>): PluginError;
    private _validateConfiguration;
    onInstall(): Promise<void>;
    private _createBackupMetadataResource;
    backup(type?: BackupType, options?: {
        resources?: string[];
    }): Promise<BackupResult>;
    private _generateBackupId;
    private _createBackupMetadata;
    private _updateBackupMetadata;
    private _createBackupManifest;
    private _exportResources;
    private _generateMetadataFile;
    private _createArchive;
    private _generateChecksum;
    private _cleanupTempFiles;
    restore(backupId: string, options?: RestoreOptions): Promise<RestoreResult>;
    private _restoreFromBackup;
    listBackups(options?: ListBackupsOptions): Promise<BackupMetadataRecord[]>;
    getBackupStatus(backupId: string): Promise<BackupMetadataRecord | null>;
    private _cleanupOldBackups;
    private _executeHook;
    private _executeRestoreHook;
    start(): Promise<void>;
    stop(): Promise<void>;
}

interface K8sResourceType {
    group: string;
    version: string;
    kind: string;
    plural: string;
    namespaced: boolean;
    category: string;
    sensitive?: boolean;
    highVolume?: boolean;
    isCRD?: boolean;
    crdName?: string;
}

type LogLevel$1 = 'debug' | 'info' | 'warn' | 'error' | 'trace';
type LoggerFunction$1 = (level: LogLevel$1, message: string, meta?: Record<string, unknown>) => void;
interface KubeConfig {
    loadFromCluster(): void;
    loadFromString(content: string): void;
    loadFromFile(path: string): void;
    loadFromDefault(): void;
    loadFromOptions(options: unknown): void;
    setCurrentContext(context: string): void;
    makeApiClient<T>(apiClass: new () => T): T;
}
interface K8sApiClient {
    listNamespace(): Promise<{
        body: {
            items: K8sResource$1[];
        };
    }>;
    [key: string]: unknown;
}
interface K8sResource$1 {
    apiVersion?: string;
    kind?: string;
    metadata?: {
        name?: string;
        namespace?: string;
        uid?: string;
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        creationTimestamp?: string;
        resourceVersion?: string;
        managedFields?: unknown[];
    };
    spec?: Record<string, unknown>;
    status?: Record<string, unknown>;
    data?: Record<string, string>;
    [key: string]: unknown;
}
interface K8sModule {
    KubeConfig: new () => KubeConfig;
    CoreV1Api: new () => K8sApiClient;
    AppsV1Api: new () => K8sApiClient;
    BatchV1Api: new () => K8sApiClient;
    NetworkingV1Api: new () => K8sApiClient;
    StorageV1Api: new () => K8sApiClient;
    RbacAuthorizationV1Api: new () => K8sApiClient;
    PolicyV1Api: new () => K8sApiClient;
    AutoscalingV1Api: new () => K8sApiClient;
    AutoscalingV2Api: new () => K8sApiClient;
    SchedulingV1Api: new () => K8sApiClient;
    NodeV1Api: new () => K8sApiClient;
    CertificatesV1Api: new () => K8sApiClient;
    CoordinationV1Api: new () => K8sApiClient;
    DiscoveryV1Api: new () => K8sApiClient;
    EventsV1Api: new () => K8sApiClient;
    AdmissionregistrationV1Api: new () => K8sApiClient;
    ApiregistrationV1Api: new () => K8sApiClient;
    ApiextensionsV1Api: new () => K8sApiClient;
    CustomObjectsApi: new () => K8sApiClient;
}
interface ApiClients {
    core: K8sApiClient;
    apps: K8sApiClient;
    batch: K8sApiClient;
    networking: K8sApiClient;
    storage: K8sApiClient;
    rbac: K8sApiClient;
    policy: K8sApiClient;
    autoscalingV1: K8sApiClient;
    autoscalingV2: K8sApiClient;
    scheduling: K8sApiClient;
    node: K8sApiClient;
    certificates: K8sApiClient;
    coordination: K8sApiClient;
    discovery: K8sApiClient;
    events: K8sApiClient;
    admission: K8sApiClient;
    apiRegistration: K8sApiClient;
    apiExtensions: K8sApiClient;
    customObjects: K8sApiClient;
}
interface KubernetesDriverDiscoveryOptions {
    includeSecrets?: boolean;
    includeConfigMaps?: boolean;
    includeCRDs?: boolean;
    coreResources?: boolean;
    appsResources?: boolean;
    batchResources?: boolean;
    networkingResources?: boolean;
    storageResources?: boolean;
    rbacResources?: boolean;
    namespaces?: string[] | null;
    excludeNamespaces?: string[];
    concurrency?: number;
    crdCacheTTL?: number;
    pagination?: {
        enabled: boolean;
        pageSize: number;
    };
}
interface KubernetesDriverRetryOptions {
    maxRetries?: number;
    backoffBase?: number;
    retryOn429?: boolean;
    retryOn5xx?: boolean;
}
interface KubernetesDriverSanitizationOptions {
    removeSecrets?: boolean;
    removeManagedFields?: boolean;
    removeResourceVersion?: boolean;
    removeRaw?: boolean;
    customSanitizer?: (config: Record<string, unknown>) => Record<string, unknown>;
}
interface KubernetesDriverConnectionOptions {
    server: string;
    caData?: string;
    skipTLSVerify?: boolean;
    token?: string;
    certData?: string;
    keyData?: string;
}
interface KubernetesDriverOptions {
    id: string;
    name?: string;
    inCluster?: boolean;
    connection?: KubernetesDriverConnectionOptions;
    kubeconfigContent?: string;
    kubeconfig?: string;
    context?: string;
    discovery?: KubernetesDriverDiscoveryOptions;
    retries?: KubernetesDriverRetryOptions;
    sanitization?: KubernetesDriverSanitizationOptions;
    logger?: LoggerFunction$1;
    logLevel?: LogLevel$1;
    tags?: Record<string, string>;
    metadata?: Record<string, unknown>;
}
interface KubernetesResource {
    provider: string;
    clusterId: string;
    clusterName: string;
    namespace: string | null;
    resourceType: string;
    resourceId: string;
    uid: string | undefined;
    apiVersion: string | undefined;
    kind: string | undefined;
    name: string | undefined;
    labels: Record<string, string>;
    annotations: Record<string, string>;
    creationTimestamp: string | undefined;
    resourceVersion?: string;
    configuration: Record<string, unknown>;
    tags: Record<string, string>;
    metadata: Record<string, unknown>;
    raw?: K8sResource$1;
}
interface ListResourcesOptions$1 {
    force?: boolean;
    runtime?: {
        emitProgress?: (info: Record<string, unknown>) => void;
    };
}
interface K8sError extends Error {
    response?: {
        statusCode?: number;
    };
    statusCode?: number;
    code?: string;
}
declare class KubernetesDriver {
    options: KubernetesDriverOptions;
    clusterId: string;
    clusterName: string;
    kubeConfig: KubeConfig | null;
    apiClients: Partial<ApiClients>;
    k8s: K8sModule | null;
    crdCache: K8sResourceType[] | null;
    crdCacheTime: number;
    crdCacheTTL: number;
    discovery: Required<KubernetesDriverDiscoveryOptions>;
    concurrency: number;
    pagination: {
        enabled: boolean;
        pageSize: number;
    };
    retries: Required<KubernetesDriverRetryOptions>;
    sanitization: Required<KubernetesDriverSanitizationOptions>;
    logger: LoggerFunction$1;
    logLevel: LogLevel$1;
    tags: Record<string, string>;
    metadata: Record<string, unknown>;
    constructor(options: KubernetesDriverOptions);
    initialize(): Promise<void>;
    _loadKubeConfig(): Promise<void>;
    _resolveKubeconfigContent(): string | null;
    _resolveKubeconfigPath(): string | null;
    _expandPath(path: string): string;
    _loadFromConnectionObject(): void;
    _createApiClients(): void;
    _testConnection(): Promise<void>;
    discoverResourceTypes(options?: {
        force?: boolean;
    }): Promise<K8sResourceType[]>;
    _filterSecrets(resourceTypes: K8sResourceType[]): K8sResourceType[];
    _discoverCRDs(force?: boolean): Promise<K8sResourceType[]>;
    listResources(options?: ListResourcesOptions$1): AsyncGenerator<KubernetesResource>;
    _fetchResourceType(resourceType: K8sResourceType): Promise<K8sResource$1[]>;
    _getNamespaces(): Promise<string[]>;
    _fetchNamespacedResources(resourceType: K8sResourceType, namespace: string): Promise<K8sResource$1[]>;
    _fetchClusterResources(resourceType: K8sResourceType): Promise<K8sResource$1[]>;
    _fetchStandardNamespacedResources(resourceType: K8sResourceType, namespace: string): Promise<K8sResource$1[]>;
    _fetchStandardClusterResources(resourceType: K8sResourceType): Promise<K8sResource$1[]>;
    _fetchCustomResources(resourceType: K8sResourceType, namespace: string | null): Promise<K8sResource$1[]>;
    _getApiClient(resourceType: K8sResourceType): K8sApiClient | null;
    _normalizeResource(resourceType: K8sResourceType, resource: K8sResource$1): KubernetesResource;
    _sanitizeConfiguration(resource: K8sResource$1): Record<string, unknown>;
    _retryOperation<T>(operation: () => Promise<T>, attempt?: number): Promise<T>;
    _shouldRetry(error: K8sError, attempt: number): boolean;
    destroy(): Promise<void>;
    log(level: LogLevel$1, message: string, meta?: Record<string, unknown>): void;
}

interface Logger$9 {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface ClusterDefinition {
    id: string;
    name?: string;
    discovery?: Partial<DiscoveryConfig>;
    scheduled?: ScheduleInput;
    tags?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}
interface DiscoveryConfig {
    concurrency: number;
    select: FilterType | null;
    ignore: FilterType[];
    runOnInstall: boolean;
    dryRun: boolean;
}
type FilterType = string | string[] | ((resource: K8sResource) => boolean);
interface Schedule {
    enabled: boolean;
    cron: string | null;
    timezone?: string;
    runOnStart: boolean;
}
interface ScheduleInput {
    enabled?: boolean;
    cron?: string;
    timezone?: string;
    runOnStart?: boolean;
}
interface LockConfig {
    ttl: number;
    timeout: number;
}
interface ResourceNamesConfig {
    snapshots?: string;
    versions?: string;
    changes?: string;
    clusters?: string;
}
interface KubernetesInventoryConfig {
    clusters: ClusterDefinition[];
    discovery: DiscoveryConfig;
    resourceNames: Record<string, string>;
    logger: LogFunction | null;
    logLevel?: string;
    scheduled: Schedule;
    lock: LockConfig;
    [key: string]: unknown;
}
type LogFunction = (level: string, message: string, meta?: Record<string, unknown>) => void;
interface K8sResource {
    clusterId: string;
    namespace?: string;
    resourceType: string;
    resourceId: string;
    uid?: string;
    name?: string;
    apiVersion?: string;
    kind?: string;
    labels?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    configuration: Record<string, unknown>;
}
interface ClusterDriverEntry {
    driver: KubernetesDriver;
    definition: ClusterDefinition;
}
interface SyncResult {
    clusterId: string;
    success: boolean;
    duration: number;
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
}
interface SkippedSyncResult {
    clusterId: string;
    skipped: true;
    reason: string;
    lockKey: string;
}
interface SnapshotFilter {
    clusterId?: string;
    resourceType?: string;
    namespace?: string;
}
interface VersionFilter {
    clusterId?: string;
    resourceType?: string;
    resourceId?: string;
}
interface ChangeFilter {
    clusterId?: string;
    resourceType?: string;
    resourceId?: string;
    since?: string | Date;
}
interface KubernetesInventoryPluginOptions {
    clusters?: ClusterDefinition[];
    resourceNames?: ResourceNamesConfig;
    discovery?: Partial<DiscoveryConfig>;
    logger?: Logger$9 | LogFunction;
    scheduled?: ScheduleInput;
    lock?: Partial<LockConfig>;
    logLevel?: string;
    [key: string]: unknown;
}
declare class KubernetesInventoryPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: KubernetesInventoryConfig;
    clusterDrivers: Map<string, ClusterDriverEntry>;
    resourceNames: Record<string, string>;
    internalResourceNames: Record<string, string>;
    private _internalResourceOverrides;
    private _internalResourceDescriptors;
    private _resourceHandles;
    private _scheduledJobs;
    private _cron;
    constructor(options?: KubernetesInventoryPluginOptions);
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(): Promise<void>;
    onNamespaceChanged(): void;
    syncAll(options?: Record<string, unknown>): Promise<Array<SyncResult | SkippedSyncResult>>;
    syncCluster(clusterId: string, options?: Record<string, unknown>): Promise<SyncResult | SkippedSyncResult>;
    discoverResourceTypes(clusterId: string, options?: Record<string, unknown>): Promise<unknown>;
    getSnapshots(filter?: SnapshotFilter): Promise<Record<string, unknown>[]>;
    getVersions(filter?: VersionFilter): Promise<Record<string, unknown>[]>;
    getChanges(filter?: ChangeFilter): Promise<Record<string, unknown>[]>;
    private _validateConfiguration;
    private _ensureResources;
    private _initializeDrivers;
    private _destroyDrivers;
    private _ensureClusterSummaryRecord;
    private _persistSnapshot;
    private _buildResourceKey;
    private _computeDigest;
    private _extractSummary;
    private _computeDiff;
    private _shouldIncludeResource;
    private _matchesFilter;
    private _matchesPattern;
    private _setupSchedules;
    private _scheduleJob;
    private _teardownSchedules;
    private _emitProgress;
    private _resolveInternalResourceNames;
    private _log;
}

interface CookieData$1 {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}
interface SessionData {
    sessionId: string;
    cookies: CookieData$1[];
    userAgent?: string;
    viewport?: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    proxyId?: string;
    domain: string;
    date: string;
    reputation: {
        successCount: number;
        failCount: number;
        successRate: number;
        lastUsed: number;
    };
    metadata: {
        createdAt: number;
        expiresAt: number;
        requestCount: number;
        age: number;
    };
}
interface CookieManagerConfig {
    enabled: boolean;
    storage: {
        resource: string;
        autoSave: boolean;
        autoLoad: boolean;
        encrypt: boolean;
    };
    farming: {
        enabled: boolean;
        warmup: {
            enabled: boolean;
            pages: string[];
            randomOrder: boolean;
            timePerPage: {
                min: number;
                max: number;
            };
            interactions: {
                scroll: boolean;
                click: boolean;
                hover: boolean;
            };
        };
        rotation: {
            enabled: boolean;
            requestsPerCookie: number;
            maxAge: number;
            poolSize: number;
        };
        reputation: {
            enabled: boolean;
            trackSuccess: boolean;
            retireThreshold: number;
            ageBoost: boolean;
        };
    };
}
interface CookieStats {
    total: number;
    healthy: number;
    unhealthy: number;
    averageAge: number;
    averageSuccessRate: number;
    byDomain: Record<string, number>;
}
interface SaveSessionOptions {
    success?: boolean;
    userAgent?: string;
    viewport?: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    proxyId?: string;
}
interface Logger$8 {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface Database$3 {
    createResource(config: Record<string, unknown>): Promise<unknown>;
    getResource(name: string): Promise<Resource$4>;
    resources: Record<string, Resource$4>;
}
interface Resource$4 {
    name: string;
    get(id: string): Promise<SessionData | null>;
    insert(data: Record<string, unknown>): Promise<SessionData>;
    patch(id: string, data: Record<string, unknown>): Promise<SessionData>;
    list(options: {
        limit: number;
    }): Promise<SessionData[]>;
}
interface Page$a {
    cookies(): Promise<CookieData$1[]>;
    setCookie(...cookies: CookieData$1[]): Promise<void>;
    url(): string;
    goto(url: string, options?: {
        waitUntil?: string;
    }): Promise<void>;
    evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
    $$(selector: string): Promise<ElementHandle$1[]>;
    _userAgent?: string;
    _viewport?: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    _proxyId?: string;
}
interface ElementHandle$1 {
    click(): Promise<void>;
    hover(): Promise<void>;
}
declare class CookieManager$1 {
    plugin: PuppeteerPlugin;
    config: CookieManagerConfig;
    storage: Resource$4 | null;
    sessions: Map<string, SessionData>;
    constructor(plugin: PuppeteerPlugin);
    get database(): Database$3;
    get logger(): Logger$8;
    initialize(): Promise<void>;
    private _loadAllSessions;
    loadSession(page: Page$a, sessionId: string): Promise<boolean>;
    saveSession(page: Page$a, sessionId: string, options?: SaveSessionOptions): Promise<SessionData>;
    farmCookies(sessionId: string): Promise<void>;
    private _randomScroll;
    private _randomHover;
    private _randomClick;
    getStats(): Promise<CookieStats>;
    getSession(sessionId: string): SessionData | undefined;
    hasSession(sessionId: string): boolean;
    rotateSession(sessionId: string): Promise<string>;
    private _delay;
}

interface ProxyConfig {
    id?: string;
    protocol: string;
    host: string;
    port: number;
    username: string | null;
    password: string | null;
    url: string;
}
interface ProxyManagerConfig {
    enabled: boolean;
    list: (string | Partial<ProxyConfig>)[];
    selectionStrategy: 'round-robin' | 'random' | 'least-used' | 'best-performance';
    bypassList?: string[];
    healthCheck?: {
        enabled?: boolean;
        interval?: number;
        testUrl?: string;
        timeout?: number;
        successRateThreshold?: number;
    };
}
interface ProxyStats {
    requests: number;
    failures: number;
    successRate: number;
    lastUsed: number;
    healthy: boolean;
    createdAt: number;
}
interface ProxyStatResult {
    proxyId: string;
    url: string;
    requests: number;
    failures: number;
    successRate: number;
    lastUsed: number;
    healthy: boolean;
    createdAt: number;
    boundSessions: number;
}
interface SessionBinding {
    sessionId: string;
    proxyId: string;
    proxyUrl: string;
}
interface HealthCheckResult$2 {
    total: number;
    healthy: number;
    unhealthy: number;
    checks: Array<{
        proxyId: string;
        url: string;
        healthy: boolean;
    }>;
}
interface Logger$7 {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface CookieManager {
    storage?: {
        list(options: {
            limit: number;
        }): Promise<Array<{
            sessionId: string;
            proxyId?: string;
        }>>;
    };
}
interface Browser$2 {
    newPage(): Promise<Page$9>;
    close(): Promise<void>;
}
interface Page$9 {
    authenticate(credentials: {
        username: string;
        password: string;
    }): Promise<void>;
    goto(url: string, options?: {
        timeout?: number;
    }): Promise<void>;
}
interface PuppeteerInstance$1 {
    launch(options: Record<string, unknown>): Promise<Browser$2>;
}
declare class ProxyManager {
    plugin: PuppeteerPlugin;
    config: ProxyManagerConfig;
    storage: unknown;
    proxies: ProxyConfig[];
    proxyStats: Map<string, ProxyStats>;
    sessionProxyMap: Map<string, string>;
    selectionStrategy: string;
    currentProxyIndex: number;
    constructor(plugin: PuppeteerPlugin);
    get logger(): Logger$7;
    get puppeteer(): PuppeteerInstance$1;
    get cookieManager(): CookieManager | null;
    initialize(): Promise<void>;
    private _parseProxy;
    private _loadSessionProxyBindings;
    getProxyForSession(sessionId: string, createIfMissing?: boolean): ProxyConfig | null;
    private _selectProxy;
    recordProxyUsage(proxyId: string, success?: boolean): void;
    getProxyStats(): ProxyStatResult[];
    getSessionBindings(): SessionBinding[];
    verifyBinding(sessionId: string, proxyId: string): boolean;
    getProxyLaunchArgs(proxy: ProxyConfig | null): string[];
    authenticateProxy(page: Page$9, proxy: ProxyConfig): Promise<void>;
    checkProxyHealth(proxyId: string): Promise<boolean>;
    checkAllProxies(): Promise<HealthCheckResult$2>;
    private _maskProxyUrl;
    _removeBinding(sessionId: string): void;
}

interface PerformanceThreshold {
    good: number;
    needsImprovement: number;
}
interface CoreWebVitals {
    lcp: number | null;
    fid: number | null;
    cls: number | null;
    inp: number | null;
    fcp: number | null;
    ttfb: number | null;
}
interface NavigationTiming {
    dnsStart: number;
    dnsEnd: number;
    dnsDuration: number;
    tcpStart: number;
    tcpEnd: number;
    tcpDuration: number;
    tlsStart: number;
    tlsDuration: number;
    requestStart: number;
    responseStart: number;
    responseEnd: number;
    requestDuration: number;
    responseDuration: number;
    domInteractive: number;
    domContentLoaded: number;
    domComplete: number;
    loadEventStart: number;
    loadEventEnd: number;
    loadEventDuration: number;
    redirectTime: number;
    fetchTime: number;
    totalTime: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
}
interface ResourceTiming {
    name: string;
    type: string;
    startTime: number;
    duration: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
    dns: number;
    tcp: number;
    tls: number;
    request: number;
    response: number;
    cached: boolean;
}
interface PaintTiming {
    'first-paint'?: number;
    'first-contentful-paint'?: number;
}
interface MemoryInfo {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    usedPercent: number;
}
interface DerivedMetrics {
    tti?: number;
    tbt?: number;
    si?: number;
    resources?: {
        totalRequests: number;
        totalSize: number;
        cachedRequests: number;
        cacheRate: number;
        avgDuration: number;
    };
    resourcesByType?: Array<{
        type: string;
        count: number;
        totalSize: number;
        avgDuration: number;
    }>;
}
interface ResourceSummary {
    total: number;
    byType: Record<string, {
        count: number;
        size: number;
        duration: number;
    }>;
    totalSize: number;
    totalDuration: number;
    cached: number;
    slowest: Array<{
        name: string;
        type: string;
        duration: number;
        size: number;
    }>;
}
interface Recommendation {
    metric: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestions: string[];
}
interface PerformanceReport {
    url: string;
    timestamp: number;
    collectionTime: number;
    score: number | null;
    scores: Record<string, number | null>;
    coreWebVitals: CoreWebVitals;
    navigationTiming: NavigationTiming | null;
    paintTiming: PaintTiming | null;
    resources: {
        summary: ResourceSummary;
        details: ResourceTiming[];
    } | null;
    memory: MemoryInfo | null;
    derived: DerivedMetrics;
    custom: unknown;
    screenshots: {
        final: string;
    } | null;
    recommendations: Recommendation[];
}
interface CollectMetricsOptions {
    waitForLoad?: boolean;
    collectResources?: boolean;
    collectMemory?: boolean;
    collectScreenshots?: boolean;
    customMetrics?: ((page: Page$8) => Promise<unknown>) | null;
}
interface ComparisonResult {
    timestamp: number;
    baseline: {
        url: string;
        timestamp: number;
        score: number | null;
    };
    current: {
        url: string;
        timestamp: number;
        score: number | null;
    };
    scoreDelta: number | null;
    improvements: Array<{
        metric: string;
        baseline: number;
        current: number;
        delta: number;
        percentChange: string;
    }>;
    regressions: Array<{
        metric: string;
        baseline: number;
        current: number;
        delta: number;
        percentChange: string;
    }>;
}
interface Page$8 {
    url(): string;
    waitForLoadState?(state: string, options: {
        timeout: number;
    }): Promise<void>;
    evaluateOnNewDocument(fn: () => void): Promise<void>;
    evaluate<T>(fn: () => T): Promise<T>;
    screenshot(options?: {
        encoding?: string;
    }): Promise<string>;
}
declare class PerformanceManager {
    plugin: PuppeteerPlugin;
    config: Record<string, unknown>;
    thresholds: Record<string, PerformanceThreshold>;
    weights: Record<string, number>;
    constructor(plugin: PuppeteerPlugin);
    collectMetrics(page: Page$8, options?: CollectMetricsOptions): Promise<PerformanceReport>;
    private _injectWebVitalsScript;
    private _collectCoreWebVitals;
    private _collectNavigationTiming;
    private _collectResourceTiming;
    private _collectPaintTiming;
    private _collectMemoryInfo;
    private _calculateDerivedMetrics;
    private _calculateScores;
    private _summarizeResources;
    private _generateRecommendations;
    private _collectScreenshots;
    compareReports(baseline: PerformanceReport, current: PerformanceReport): ComparisonResult;
    private _delay;
}

interface NetworkMonitorConfig$1 {
    enabled: boolean;
    persist: boolean;
    filters: {
        types: string[] | null;
        statuses: number[] | null;
        minSize: number | null;
        maxSize: number | null;
        saveErrors: boolean;
        saveLargeAssets: boolean;
    };
    compression: {
        enabled: boolean;
        threshold: number;
    };
}
interface NetworkRequest {
    requestId: string;
    url: string;
    method: string;
    resourceType: string;
    timestamp: number;
    requestHeaders?: Record<string, string>;
    postData?: string;
}
interface NetworkResponse {
    requestId: string;
    url: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    mimeType: string;
    timestamp: number;
    responseTime: number;
    size?: number;
    body?: string | Buffer;
    compressed?: boolean;
}
interface NetworkSession {
    sessionId: string;
    startTime: number;
    endTime?: number;
    requestCount: number;
    errorCount: number;
    totalSize: number;
}
interface NetworkStats {
    totalRequests: number;
    totalSize: number;
    byType: Record<string, {
        count: number;
        size: number;
    }>;
    byStatus: Record<string, number>;
    errorCount: number;
    avgResponseTime: number;
}
interface Logger$6 {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface Database$2 {
    createResource(config: Record<string, unknown>): Promise<unknown>;
    getResource(name: string): Promise<Resource$3>;
    resources: Record<string, Resource$3>;
}
interface Resource$3 {
    name: string;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    list(options: {
        limit: number;
    }): Promise<Record<string, unknown>[]>;
}
interface CDPSession {
    send(method: string, params?: Record<string, unknown>): Promise<unknown>;
    on(event: string, handler: (params: unknown) => void): void;
}
interface Page$7 {
    url(): string;
    target(): {
        createCDPSession(): Promise<CDPSession>;
    };
}
declare class NetworkMonitor {
    plugin: PuppeteerPlugin;
    config: NetworkMonitorConfig$1;
    requests: Map<string, Map<string, NetworkRequest>>;
    responses: Map<string, Map<string, NetworkResponse>>;
    sessions: Map<string, NetworkSession>;
    cdpSessions: Map<string, CDPSession>;
    constructor(plugin: PuppeteerPlugin);
    get database(): Database$2;
    get logger(): Logger$6;
    initialize(): Promise<void>;
    private _setupStorage;
    startSession(sessionId: string): NetworkSession;
    attachToPage(page: Page$7, sessionId: string): Promise<void>;
    endSession(sessionId: string): Promise<NetworkSession | null>;
    private _persistSession;
    getSessionStats(sessionId: string): NetworkStats | null;
    decompressBody(compressedBody: string): Promise<string>;
    clearSession(sessionId: string): void;
}

interface ConsoleMonitorConfig$1 {
    enabled: boolean;
    persist: boolean;
    filters: {
        levels: string[] | null;
        excludePatterns: RegExp[];
        includeStackTraces: boolean;
        includeSourceLocation: boolean;
        captureNetwork: boolean;
    };
}
interface ConsoleMessage {
    level: string;
    text: string;
    timestamp: number;
    url?: string;
    location?: {
        url: string;
        lineNumber?: number;
        columnNumber?: number;
    };
    stackTrace?: string[];
}
interface ConsoleSession {
    sessionId: string;
    startTime: number;
    endTime?: number;
    messageCount: number;
    errorCount: number;
    warningCount: number;
}
interface ConsoleStats {
    totalMessages: number;
    byLevel: Record<string, number>;
    errorsCount: number;
    warningsCount: number;
}
interface Logger$5 {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface Database$1 {
    createResource(config: Record<string, unknown>): Promise<unknown>;
    getResource(name: string): Promise<Resource$2>;
    resources: Record<string, Resource$2>;
}
interface Resource$2 {
    name: string;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    list(options: {
        limit: number;
    }): Promise<Record<string, unknown>[]>;
}
interface ConsoleMessageHandle {
    type(): string;
    text(): string;
    location(): {
        url: string;
        lineNumber?: number;
        columnNumber?: number;
    };
    stackTrace?(): Array<{
        url: string;
        lineNumber?: number;
        columnNumber?: number;
    }>;
}
interface PageErrorEvent extends Error {
    message: string;
    stack?: string;
}
interface Page$6 {
    on(event: 'console', handler: (msg: ConsoleMessageHandle) => void): void;
    on(event: 'pageerror', handler: (error: PageErrorEvent) => void): void;
    url(): string;
}
declare class ConsoleMonitor {
    plugin: PuppeteerPlugin;
    config: ConsoleMonitorConfig$1;
    messages: Map<string, ConsoleMessage[]>;
    sessions: Map<string, ConsoleSession>;
    storage: Resource$2 | null;
    constructor(plugin: PuppeteerPlugin);
    get database(): Database$1;
    get logger(): Logger$5;
    initialize(): Promise<void>;
    private _setupStorage;
    startSession(sessionId: string): ConsoleSession;
    attachToPage(page: Page$6, sessionId: string): void;
    endSession(sessionId: string): Promise<ConsoleSession | null>;
    private _persistSession;
    getSessionMessages(sessionId: string): ConsoleMessage[];
    getSessionStats(sessionId: string): ConsoleStats | null;
    clearSession(sessionId: string): void;
}

interface StorageData {
    [key: string]: string | null;
}
interface IndexedDBStoreInfo {
    name: string;
    recordCount?: number;
    keyPath?: string | string[] | null;
    autoIncrement?: boolean;
    indexes?: string[];
    error?: string;
}
interface IndexedDBInfo {
    name: string;
    version: number;
    stores: IndexedDBStoreInfo[];
}
interface IndexedDBResult {
    databases: IndexedDBInfo[];
    present: boolean;
    error?: string;
}
interface StorageResult {
    present: boolean;
    itemCount: number;
    data: StorageData;
}
interface AllStorageResult {
    localStorage: StorageResult;
    sessionStorage: StorageResult;
    indexedDB: IndexedDBResult;
    timestamp: number;
    summary: {
        totalStorageTypes: number;
        totalItems: number;
    };
}
interface Page$5 {
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}
interface Logger$4 {
    error(message: string, ...args: unknown[]): void;
}
declare function captureLocalStorage(page: Page$5, logger?: Logger$4): Promise<StorageData>;
declare function captureSessionStorage(page: Page$5, logger?: Logger$4): Promise<StorageData>;
declare function captureIndexedDB(page: Page$5, logger?: Logger$4): Promise<IndexedDBResult>;
declare function captureAllStorage(page: Page$5, logger?: Logger$4): Promise<AllStorageResult>;

interface AntiBotService {
    name: string;
    detected: boolean;
    indicators: string[];
    scripts?: string[];
    cookies?: string[];
    headers?: string[];
}
interface AntiBotDetectionResult {
    detected: boolean;
    services: AntiBotService[];
    captchaPresent: boolean;
    captchaType: string | null;
    scripts: string[];
    cookies: string[];
}
interface FingerprintCapability {
    name: string;
    available: boolean;
    details?: unknown;
}
interface FingerprintingResult {
    fingerprintingDetected: boolean;
    capabilities: FingerprintCapability[];
    canvasFingerprint: boolean;
    webglFingerprint: boolean;
    audioFingerprint: boolean;
    fontFingerprint: boolean;
    screenFingerprint: boolean;
    hardwareFingerprint: boolean;
    apiCallsDetected: string[];
}
interface BlockingSignal {
    type: string;
    detected: boolean;
    evidence: string[];
}
interface BlockingSignalsResult {
    blocked: boolean;
    signals: BlockingSignal[];
    httpStatus?: number;
    responseHeaders?: Record<string, string>;
}
interface AntiBotAndFingerprintingResult {
    antiBots: AntiBotDetectionResult;
    fingerprinting: FingerprintingResult;
    blocking: BlockingSignalsResult;
    summary: {
        antiBotDetected: boolean;
        fingerprintingAttempted: boolean;
        accessBlocked: boolean;
        riskLevel: 'low' | 'medium' | 'high';
    };
}
interface Page$4 {
    evaluate<T>(fn: () => T): Promise<T>;
    evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
    content(): Promise<string>;
    $$eval<T>(selector: string, fn: (elements: Element[]) => T): Promise<T>;
}
declare function detectAntiBotServices(page: Page$4): Promise<AntiBotDetectionResult>;
declare function detectFingerprinting(page: Page$4): Promise<FingerprintingResult>;
declare function detectBlockingSignals(page: Page$4): Promise<BlockingSignalsResult>;
declare function detectAntiBotsAndFingerprinting(page: Page$4): Promise<AntiBotAndFingerprintingResult>;

interface ICECandidate {
    candidate: string;
    protocol?: string;
    type?: string;
    address?: string | null;
    port?: number | null;
}
interface PeerConnectionInfo {
    id: string;
    connectionState?: string;
    iceConnectionState?: string;
}
interface WebRTCInfo {
    peerConnections: PeerConnectionInfo[];
    iceServers: unknown[];
    iceGatheringState: string | null;
    connectionState: string | null;
    iceConnectionState: string | null;
    signalingState: string | null;
    dataChannels: unknown[];
    mediaStreams: string[];
    detectedIPs: ICECandidate[];
    stunServers: string[];
    turnServers: string[];
    isActive: boolean;
}
interface WebRTCDetectionResult {
    webrtcDetected: boolean;
    webrtcInfo?: WebRTCInfo;
    error?: string;
}
interface AudioElementInfo {
    src: string;
    sources: Array<{
        src: string;
        type: string;
    }>;
    autoplay: boolean;
    controls: boolean;
    loop: boolean;
    muted: boolean;
}
interface VideoElementInfo {
    src: string;
    sources: Array<{
        src: string;
        type: string;
    }>;
    width: number;
    height: number;
    autoplay: boolean;
    controls: boolean;
    loop: boolean;
    muted: boolean;
    poster: string;
}
interface CanvasElementInfo {
    width: number;
    height: number;
    id: string;
    class: string;
}
interface MediaPermissions {
    microphone: string;
    camera: string;
    displayCapture: string;
}
interface MediaStreamsInfo {
    audioElements: AudioElementInfo[];
    videoElements: VideoElementInfo[];
    canvasElements: CanvasElementInfo[];
    mediaRecorders: string[];
    audioContexts: string[];
    videoStreams: unknown[];
    displayCapture: boolean;
    permissions: MediaPermissions;
}
interface MediaStreamsDetectionResult {
    streamsDetected: boolean;
    streamsInfo?: MediaStreamsInfo;
    error?: string;
}
interface StreamingProtocolsInfo {
    hls: boolean;
    dash: boolean;
    rtmp: boolean;
    smoothStreaming: boolean;
    protocols: string[];
    m3u8Files: string[];
    mpdFiles: string[];
    manifestFiles: string[];
}
interface StreamingProtocolsDetectionResult {
    streamingProtocolsDetected: boolean;
    protocolsInfo?: StreamingProtocolsInfo;
    error?: string;
}
interface WebRTCAndStreamsResult {
    webrtc: WebRTCDetectionResult;
    streams: MediaStreamsDetectionResult;
    protocols: StreamingProtocolsDetectionResult;
    summary: {
        webrtcActive: boolean;
        streamsPresent: boolean;
        streamingProtocols: boolean;
        anyActivity: boolean;
    };
    error?: string;
}
interface Page$3 {
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}
declare function detectWebRTC(page: Page$3): Promise<WebRTCDetectionResult>;
declare function detectMediaStreams(page: Page$3): Promise<MediaStreamsDetectionResult>;
declare function detectStreamingProtocols(page: Page$3): Promise<StreamingProtocolsDetectionResult>;
declare function detectWebRTCAndStreams(page: Page$3): Promise<WebRTCAndStreamsResult>;

interface PoolConfig {
    enabled: boolean;
    maxBrowsers: number;
    maxTabsPerBrowser: number;
    reuseTab: boolean;
    closeOnIdle: boolean;
    idleTimeout: number;
}
interface LaunchConfig {
    headless: boolean;
    args: string[];
    ignoreHTTPSErrors: boolean;
}
interface ViewportConfig {
    width: number;
    height: number;
    deviceScaleFactor: number;
    randomize: boolean;
    presets: string[];
}
interface UserAgentFilters {
    deviceCategory: string;
}
interface UserAgentConfig {
    enabled: boolean;
    random: boolean;
    filters: UserAgentFilters;
    custom: string | null;
}
interface StealthConfig {
    enabled: boolean;
    enableEvasions: boolean;
}
interface MouseConfig {
    enabled: boolean;
    bezierCurves: boolean;
    overshoot: boolean;
    jitter: boolean;
    pathThroughElements: boolean;
}
interface TypingConfig {
    enabled: boolean;
    mistakes: boolean;
    corrections: boolean;
    pauseAfterWord: boolean;
    speedVariation: boolean;
    delayRange: [number, number];
}
interface ScrollingConfig {
    enabled: boolean;
    randomStops: boolean;
    backScroll: boolean;
    horizontalJitter: boolean;
}
interface HumanBehaviorConfig {
    enabled: boolean;
    mouse: MouseConfig;
    typing: TypingConfig;
    scrolling: ScrollingConfig;
}
interface CookieStorageConfig {
    resource: string;
    autoSave: boolean;
    autoLoad: boolean;
    encrypt: boolean;
}
interface CookieWarmupConfig {
    enabled: boolean;
    pages: string[];
    randomOrder: boolean;
    timePerPage: {
        min: number;
        max: number;
    };
    interactions: {
        scroll: boolean;
        click: boolean;
        hover: boolean;
    };
}
interface CookieRotationConfig {
    enabled: boolean;
    requestsPerCookie: number;
    maxAge: number;
    poolSize: number;
}
interface CookieReputationConfig {
    enabled: boolean;
    trackSuccess: boolean;
    retireThreshold: number;
    ageBoost: boolean;
}
interface CookieFarmingConfig {
    enabled: boolean;
    warmup: CookieWarmupConfig;
    rotation: CookieRotationConfig;
    reputation: CookieReputationConfig;
}
interface CookiesConfig {
    enabled: boolean;
    storage: CookieStorageConfig;
    farming: CookieFarmingConfig;
}
interface BlockResourcesConfig {
    enabled: boolean;
    types: string[];
}
interface PerformanceConfig {
    blockResources: BlockResourcesConfig;
    cacheEnabled: boolean;
    javascriptEnabled: boolean;
}
interface NetworkFiltersConfig {
    types: string[] | null;
    statuses: number[] | null;
    minSize: number | null;
    maxSize: number | null;
    saveErrors: boolean;
    saveLargeAssets: boolean;
}
interface NetworkCompressionConfig {
    enabled: boolean;
    threshold: number;
}
interface NetworkMonitorConfig {
    enabled: boolean;
    persist: boolean;
    filters: NetworkFiltersConfig;
    compression: NetworkCompressionConfig;
}
interface ConsoleFiltersConfig {
    levels: string[] | null;
    excludePatterns: string[];
    includeStackTraces: boolean;
    includeSourceLocation: boolean;
    captureNetwork: boolean;
}
interface ConsoleMonitorConfig {
    enabled: boolean;
    persist: boolean;
    filters: ConsoleFiltersConfig;
}
interface ScreenshotConfig {
    fullPage: boolean;
    type: 'png' | 'jpeg' | 'webp';
}
interface ProxyHealthCheckConfig {
    enabled: boolean;
    interval: number;
    testUrl: string;
    timeout: number;
    successRateThreshold: number;
}
interface ProxyPluginConfig {
    enabled: boolean;
    list: (string | Partial<ProxyConfig>)[];
    selectionStrategy: 'round-robin' | 'random' | 'least-used' | 'best-performance';
    bypassList: string[];
    healthCheck: ProxyHealthCheckConfig;
    server: string | null;
    username: string | null;
    password: string | null;
}
interface RetriesConfig {
    enabled: boolean;
    maxAttempts: number;
    backoff: 'exponential' | 'linear' | 'fixed';
    initialDelay: number;
}
interface DebugConfig {
    enabled: boolean;
    screenshots: boolean;
    console: boolean;
    network: boolean;
}
interface PuppeteerPluginConfig {
    logLevel: string;
    pool: PoolConfig;
    launch: LaunchConfig;
    viewport: ViewportConfig;
    userAgent: UserAgentConfig;
    stealth: StealthConfig;
    humanBehavior: HumanBehaviorConfig;
    cookies: CookiesConfig;
    performance: PerformanceConfig;
    networkMonitor: NetworkMonitorConfig;
    consoleMonitor: ConsoleMonitorConfig;
    screenshot: ScreenshotConfig;
    proxy: ProxyPluginConfig;
    retries: RetriesConfig;
    debug: DebugConfig;
}
interface PuppeteerPluginOptions extends Partial<PuppeteerPluginConfig> {
    resourceNames?: {
        cookies?: string;
        consoleSessions?: string;
        consoleMessages?: string;
        consoleErrors?: string;
        networkSessions?: string;
        networkRequests?: string;
        networkErrors?: string;
    };
}
interface ResourceDescriptor {
    defaultName: string;
    override?: string;
}
interface ResourceNames {
    cookies: string;
    consoleSessions: string;
    consoleMessages: string;
    consoleErrors: string;
    networkSessions: string;
    networkRequests: string;
    networkErrors: string;
}
interface NavigateOptions {
    useSession?: string | null;
    screenshot?: boolean;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    timeout?: number;
}
interface WithSessionOptions extends NavigateOptions {
    url: string;
}
interface ViewportResult {
    width: number;
    height: number;
    deviceScaleFactor: number;
}
interface GhostCursor {
    moveTo(selector: string): Promise<void>;
    move(position: {
        x: number;
        y: number;
    }): Promise<void>;
    click(): Promise<void>;
}
interface ElementHandle {
    click(): Promise<void>;
    hover(): Promise<void>;
}
interface PageKeyboard {
    type(text: string, options?: {
        delay?: number;
    }): Promise<void>;
    press(key: string): Promise<void>;
}
interface Page$2 {
    setViewport(viewport: ViewportResult): Promise<void>;
    setUserAgent(userAgent: string): Promise<void>;
    setRequestInterception(enabled: boolean): Promise<void>;
    on(event: string, handler: (arg: unknown) => void): void;
    once(event: string, handler: () => void): void;
    goto(url: string, options?: {
        waitUntil?: string;
        timeout?: number;
    }): Promise<void>;
    screenshot(options?: Record<string, unknown>): Promise<Buffer>;
    close(...args: unknown[]): Promise<void>;
    isClosed(): boolean;
    $(selector: string): Promise<ElementHandle | null>;
    type(selector: string, text: string, options?: {
        delay?: number;
    }): Promise<void>;
    evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
    keyboard: PageKeyboard;
    _cursor?: GhostCursor;
    _userAgent?: string;
    _viewport?: ViewportResult;
    _proxyId?: string | null;
    _sessionId?: string | null;
    _navigationSuccess?: boolean;
    _sessionSaved?: boolean;
    _screenshot?: Buffer;
    humanClick?(selector: string, options?: Record<string, unknown>): Promise<void>;
    humanMoveTo?(selector: string, options?: Record<string, unknown>): Promise<void>;
    humanType?(selector: string, text: string, options?: Record<string, unknown>): Promise<void>;
    humanScroll?(options?: {
        distance?: number | null;
        direction?: 'up' | 'down';
    }): Promise<void>;
}
interface Browser$1 {
    newPage(): Promise<Page$2>;
    close(): Promise<void>;
    on(event: string, handler: () => void): void;
    once(event: string, handler: () => void): void;
}
interface PuppeteerInstance {
    launch(options: Record<string, unknown>): Promise<Browser$1>;
    use(plugin: unknown): void;
}
interface UserAgentClass {
    new (filters?: Record<string, unknown>): {
        toString(): string;
    };
}
type CreateCursorFn = (page: Page$2) => GhostCursor;
interface StorageManagerInstance {
    captureLocalStorage: typeof captureLocalStorage;
    captureSessionStorage: typeof captureSessionStorage;
    captureIndexedDB: typeof captureIndexedDB;
    captureAllStorage: typeof captureAllStorage;
}
interface AntiBotDetectorInstance {
    detectAntiBotServices: typeof detectAntiBotServices;
    detectFingerprinting: typeof detectFingerprinting;
    detectBlockingSignals: typeof detectBlockingSignals;
    detectAntiBotsAndFingerprinting: typeof detectAntiBotsAndFingerprinting;
}
interface WebRTCStreamsDetectorInstance {
    detectWebRTC: typeof detectWebRTC;
    detectMediaStreams: typeof detectMediaStreams;
    detectStreamingProtocols: typeof detectStreamingProtocols;
    detectWebRTCAndStreams: typeof detectWebRTCAndStreams;
}
declare class PuppeteerPlugin extends Plugin {
    namespace: string;
    config: PuppeteerPluginConfig;
    _resourceDescriptors: Record<string, ResourceDescriptor>;
    resourceNames: ResourceNames;
    browserPool: Browser$1[];
    tabPool: Map<Browser$1, Set<Page$2>>;
    browserIdleTimers: Map<Browser$1, ReturnType<typeof setTimeout>>;
    dedicatedBrowsers: Set<Browser$1>;
    puppeteer: PuppeteerInstance;
    UserAgent: UserAgentClass | null;
    createGhostCursor: CreateCursorFn;
    cookieManager: CookieManager$1 | null;
    proxyManager: ProxyManager | null;
    performanceManager: PerformanceManager | null;
    networkMonitor: NetworkMonitor | null;
    consoleMonitor: ConsoleMonitor | null;
    storageManager: StorageManagerInstance | null;
    antiBotDetector: AntiBotDetectorInstance | null;
    webrtcStreamsDetector: WebRTCStreamsDetectorInstance | null;
    initialized: boolean;
    constructor(options?: PuppeteerPluginOptions);
    _resolveResourceNames(): ResourceNames;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(_options?: UninstallOptions$1): Promise<void>;
    private _importDependencies;
    private _setupCookieStorage;
    private _initializeProxyManager;
    private _initializeCookieManager;
    private _initializePerformanceManager;
    private _initializeNetworkMonitor;
    private _initializeConsoleMonitor;
    private _warmupBrowserPool;
    private _createBrowser;
    private _getBrowser;
    private _closeBrowserPool;
    private _clearIdleTimer;
    private _scheduleIdleCloseIfNeeded;
    private _retireIdleBrowser;
    private _closeDedicatedBrowsers;
    private _generateUserAgent;
    private _generateViewport;
    navigate(url: string, options?: NavigateOptions): Promise<Page$2>;
    withSession<T>(sessionId: string, handler: (page: Page$2, plugin: PuppeteerPlugin) => Promise<T>, options: WithSessionOptions): Promise<T>;
    private _attachHumanBehaviorMethods;
    private _typeWithMistakes;
    private _scrollWithStops;
    private _randomDelay;
    farmCookies(sessionId: string): Promise<void>;
    getCookieStats(): Promise<CookieStats>;
    getProxyStats(): ProxyStatResult[];
    getSessionProxyBindings(): SessionBinding[];
    checkProxyHealth(): Promise<HealthCheckResult$2>;
    captureAllStorage(page: Page$2): Promise<AllStorageResult>;
    captureLocalStorage(page: Page$2): Promise<StorageData>;
    captureSessionStorage(page: Page$2): Promise<StorageData>;
    captureIndexedDB(page: Page$2): Promise<IndexedDBResult>;
    detectAntiBotServices(page: Page$2): Promise<AntiBotDetectionResult>;
    detectFingerprinting(page: Page$2): Promise<FingerprintingResult>;
    detectAntiBotsAndFingerprinting(page: Page$2): Promise<AntiBotAndFingerprintingResult>;
    detectWebRTC(page: Page$2): Promise<WebRTCDetectionResult>;
    detectMediaStreams(page: Page$2): Promise<MediaStreamsDetectionResult>;
    detectStreamingProtocols(page: Page$2): Promise<StreamingProtocolsDetectionResult>;
    detectWebRTCAndStreams(page: Page$2): Promise<WebRTCAndStreamsResult>;
}

interface PatternConfig {
    match: string | RegExp;
    activities?: string[];
    extract?: Record<string, string>;
    priority?: number;
    metadata?: Record<string, unknown>;
}
interface CompiledPattern$1 {
    name: string;
    original: string | RegExp;
    activities: string[];
    extract: Record<string, string>;
    priority: number;
    metadata: Record<string, unknown>;
    regex: RegExp | null;
    paramNames: string[];
}
interface MatchResult {
    pattern: string;
    params: Record<string, string>;
    activities: string[];
    metadata: Record<string, unknown>;
    priority: number;
    config: CompiledPattern$1 | {
        name: string;
        activities?: string[];
        metadata?: Record<string, unknown>;
    };
    isDefault?: boolean;
}
interface FilteredUrl {
    url: string;
    match: MatchResult;
}
declare class URLPatternMatcher {
    patterns: Map<string, CompiledPattern$1>;
    defaultPattern: {
        name: string;
        activities?: string[];
        metadata?: Record<string, unknown>;
    } | null;
    constructor(patterns?: Record<string, PatternConfig>);
    private _compilePattern;
    private _pathToRegex;
    match(url: string): MatchResult | null;
    private _extractParams;
    matches(url: string): boolean;
    getPatternNames(): string[];
    addPattern(name: string, config: PatternConfig): void;
    removePattern(name: string): void;
    filterUrls(urls: string[], patternNames?: string[]): FilteredUrl[];
}

interface CrawlContextConfig {
    userAgent?: string;
    acceptLanguage?: string;
    platform?: 'Windows' | 'Mac' | 'Linux';
    headers?: Record<string, string>;
    proxy?: string | null;
    viewport?: {
        width: number;
        height: number;
    };
    screen?: {
        width: number;
        height: number;
    };
    timezone?: string;
    locale?: string;
}
interface CookieData {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None' | string;
    url?: string;
    _source?: string;
    _updatedAt?: number;
}
interface PuppeteerCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
    url: string;
}
interface HttpClientConfig {
    headers: Record<string, string>;
    timeout: number;
    proxy?: string;
    retry: {
        maxAttempts: number;
        delay: number;
        backoff: string;
        jitter: boolean;
        retryAfter: boolean;
        retryOn: number[];
    };
}
interface PuppeteerLaunchConfig {
    headless: string;
    args: string[];
    defaultViewport: {
        width: number;
        height: number;
    };
    ignoreDefaultArgs: string[];
}
interface CrawlContextJSON {
    userAgent: string;
    acceptLanguage: string;
    platform: string;
    cookies: CookieData[];
    headers: Record<string, string>;
    proxy: string | null;
    viewport: {
        width: number;
        height: number;
    };
    screen: {
        width: number;
        height: number;
    };
    timezone: string;
    locale: string;
    lastUrl: string | null;
    referer: string | null;
}
interface Page$1 {
    url(): string;
    cookies(): Promise<CookieData[]>;
    setCookie(...cookies: PuppeteerCookie[]): Promise<void>;
    setUserAgent(userAgent: string): Promise<void>;
    setViewport(viewport: {
        width: number;
        height: number;
    }): Promise<void>;
    emulateTimezone(timezone: string): Promise<void>;
    setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
    evaluateOnNewDocument<T>(fn: (arg: T) => void, arg: T): Promise<void>;
    on(event: string, handler: (response: PuppeteerResponse$1) => void): void;
}
interface PuppeteerResponse$1 {
    url(): string;
    headers(): Record<string, string>;
}
interface HttpResponse$3 {
    headers: {
        get?(name: string): string | null;
        getSetCookie?(): string[];
        [key: string]: unknown;
    };
}
declare class CrawlContext {
    _userAgent: string;
    _acceptLanguage: string;
    _platform: string;
    _cookies: Map<string, CookieData[]>;
    _headers: Record<string, string>;
    _proxy: string | null;
    _viewport: {
        width: number;
        height: number;
    };
    _screen: {
        width: number;
        height: number;
    };
    _timezone: string;
    _locale: string;
    _lastUrl: string | null;
    _referer: string | null;
    constructor(config?: CrawlContextConfig);
    get userAgent(): string;
    set userAgent(ua: string);
    get viewport(): {
        width: number;
        height: number;
    };
    get timezone(): string;
    setCookies(cookies: CookieData[], source?: string): void;
    setCookiesFromHeader(setCookieHeader: string | string[], url: string): void;
    getCookieHeader(url: string): string;
    getCookiesForPuppeteer(url: string): PuppeteerCookie[];
    getAllCookies(): CookieData[];
    getCookiesForDomain(domain: string): (CookieData & {
        source?: string;
    })[];
    clearCookies(domain?: string): void;
    importFromPuppeteer(pageOrCookies: Page$1 | CookieData[]): Promise<void>;
    exportToPuppeteer(page: Page$1, url?: string): Promise<void>;
    getHttpClientConfig(url: string): HttpClientConfig;
    getLaunchConfig(): PuppeteerLaunchConfig;
    configurePage(page: Page$1): Promise<Page$1>;
    processResponse(response: HttpResponse$3, url: string): void;
    setReferer(url: string): void;
    toJSON(): CrawlContextJSON;
    static fromJSON(json: Partial<CrawlContextJSON> | null): CrawlContext;
    private _generateUserAgent;
    private _extractDomain;
    private _parseSetCookie;
    private _getMatchingCookies;
    private _domainMatches;
    private _normalizeSameSite;
}

interface RobotsParserConfig {
    userAgent?: string;
    defaultAllow?: boolean;
    cacheTimeout?: number;
    fetchTimeout?: number;
    fetcher?: ((url: string) => Promise<string>) | null;
    context?: CrawlContext | null;
}
interface RobotsCheckResult$1 {
    allowed: boolean;
    crawlDelay?: number | null;
    source: string;
    error?: string;
    matchedRule?: string;
}
interface CompiledPattern {
    original: string;
    regex: RegExp;
    length: number;
}
interface AgentRules {
    allow: CompiledPattern[];
    disallow: CompiledPattern[];
    crawlDelay: number | null;
}
interface ParsedRules {
    agents: Map<string, AgentRules>;
    sitemaps: string[];
}
interface CacheEntry$1 {
    rules: ParsedRules | null;
    timestamp: number;
}
interface CacheStats$1 {
    size: number;
    domains: string[];
}
interface HttpClient$2 {
    get(url: string): Promise<HttpResponse$2>;
}
interface HttpResponse$2 {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}
declare class RobotsParser {
    config: RobotsParserConfig & {
        userAgent: string;
        defaultAllow: boolean;
        cacheTimeout: number;
        fetchTimeout: number;
    };
    _context: CrawlContext | null;
    cache: Map<string, CacheEntry$1>;
    fetcher: ((url: string) => Promise<string>) | null;
    _httpClient: HttpClient$2 | null;
    constructor(config?: RobotsParserConfig);
    setFetcher(fetcher: (url: string) => Promise<string>): void;
    isAllowed(url: string): Promise<RobotsCheckResult$1>;
    private _getRules;
    private _getHttpClient;
    private _fetchRobotsTxt;
    _parse(content: string | null): ParsedRules;
    private _hasRules;
    private _compilePattern;
    private _findAgentRules;
    private _combineRules;
    private _checkPath;
    getSitemaps(domain: string): Promise<string[]>;
    getCrawlDelay(domain: string): Promise<number | null>;
    preload(domain: string): Promise<void>;
    clearCache(domain?: string): void;
    getCacheStats(): CacheStats$1;
}

interface SitemapParserConfig {
    userAgent?: string;
    fetchTimeout?: number;
    maxSitemaps?: number;
    maxUrls?: number;
    followSitemapIndex?: boolean;
    cacheTimeout?: number;
    fetcher?: ((url: string) => Promise<FetcherResult>) | null;
    context?: CrawlContext | null;
}
interface FetcherResult {
    content: string | Buffer;
    contentType?: string;
}
interface SitemapEntry {
    url: string;
    lastmod?: string | null;
    changefreq?: string | null;
    priority?: number | null;
    title?: string | null;
    description?: string | null;
    source: string;
    type?: string;
    images?: SitemapImage[];
    videos?: SitemapVideo[];
}
interface SitemapImage {
    url?: string | null;
    title?: string | null;
    caption?: string | null;
}
interface SitemapVideo {
    url?: string | null;
    thumbnailUrl?: string | null;
    title?: string | null;
    description?: string | null;
}
interface ParseOptions$1 {
    recursive?: boolean;
    maxDepth?: number;
    _depth?: number;
}
interface CacheEntry {
    entries: SitemapEntry[];
    timestamp: number;
    format: string;
}
interface SitemapStats {
    sitemapsParsed: number;
    urlsExtracted: number;
    errors: number;
    cacheSize: number;
}
interface ProbeResult {
    url: string;
    exists: boolean;
    format?: string;
}
interface HttpClient$1 {
    get(url: string): Promise<HttpResponse$1>;
}
interface HttpResponse$1 {
    ok: boolean;
    status: number;
    headers: Headers$1;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
}
interface Headers$1 {
    get(name: string): string | null;
}
declare class SitemapParser {
    config: SitemapParserConfig & {
        userAgent: string;
        fetchTimeout: number;
        maxSitemaps: number;
        maxUrls: number;
        followSitemapIndex: boolean;
        cacheTimeout: number;
    };
    _context: CrawlContext | null;
    cache: Map<string, CacheEntry>;
    fetcher: ((url: string) => Promise<FetcherResult>) | null;
    _httpClient: HttpClient$1 | null;
    stats: {
        sitemapsParsed: number;
        urlsExtracted: number;
        errors: number;
    };
    constructor(config?: SitemapParserConfig);
    setFetcher(fetcher: (url: string) => Promise<FetcherResult>): void;
    parse(sitemapUrl: string, options?: ParseOptions$1): Promise<SitemapEntry[]>;
    private _getHttpClient;
    private _fetch;
    private _decompress;
    private _detectFormat;
    private _looksLikeTextSitemap;
    private _parseXmlSitemap;
    private _parseUrlBlock;
    private _extractTag;
    private _extractImages;
    private _extractVideos;
    private _parseXmlIndex;
    private _parseTextSitemap;
    private _parseRssFeed;
    private _parseAtomFeed;
    private _decodeXmlEntities;
    private _parseDate;
    getStats(): SitemapStats;
    clearCache(url?: string): void;
    resetStats(): void;
    discoverFromRobotsTxt(robotsTxtUrl: string): Promise<string[]>;
    probeCommonLocations(baseUrl: string): Promise<ProbeResult[]>;
}

interface LinkDiscovererConfig {
    enabled?: boolean;
    maxDepth?: number;
    maxUrls?: number;
    sameDomainOnly?: boolean;
    includeSubdomains?: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
    followPatterns?: string[];
    followRegex?: RegExp | null;
    ignoreRegex?: RegExp | null;
    respectRobotsTxt?: boolean;
    ignoreQueryString?: boolean;
    ignoreHash?: boolean;
    robotsUserAgent?: string;
    robotsCacheTimeout?: number;
    useSitemaps?: boolean;
    sitemapMaxUrls?: number;
    defaultIgnore?: RegExp[];
    robotsFetcher?: ((url: string) => Promise<string>) | null;
    sitemapFetcher?: ((url: string) => Promise<string>) | null;
}
interface DiscoveredLink {
    url: string;
    anchorText?: string;
    depth: number;
    sourceUrl: string;
    pattern: string | null;
    params: Record<string, string>;
    activities: string[];
    metadata: Record<string, unknown>;
}
interface RobotsCheckResult {
    allowed: boolean;
    crawlDelay?: number | null;
}
interface DiscoveryStats {
    discovered: number;
    queued: number;
    blockedByRobots: number;
    fromSitemap: number;
    maxUrls: number;
    maxDepth: number;
    remaining: number;
    robotsCacheSize: number;
    sitemapStats: Record<string, unknown> | null;
}
interface SitemapDiscoveryOptions {
    autoDiscover?: boolean;
    sitemapUrls?: string[];
    checkRobots?: boolean;
}
interface ResetOptions {
    clearRobotsCache?: boolean;
    clearSitemapCache?: boolean;
}
declare class LinkDiscoverer {
    config: Required<Omit<LinkDiscovererConfig, 'robotsFetcher' | 'sitemapFetcher' | 'followRegex' | 'ignoreRegex'>> & {
        followRegex: RegExp | null;
        ignoreRegex: RegExp | null;
    };
    patternMatcher: URLPatternMatcher | null;
    robotsParser: RobotsParser | null;
    sitemapParser: SitemapParser | null;
    discovered: Set<string>;
    queued: Set<string>;
    blockedByRobots: Set<string>;
    fromSitemap: Set<string>;
    constructor(config?: LinkDiscovererConfig);
    setPatternMatcher(matcher: URLPatternMatcher): void;
    setRobotsFetcher(fetcher: (url: string) => Promise<string>): void;
    extractLinks(html: string, baseUrl: string, currentDepth?: number): DiscoveredLink[];
    extractLinksAsync(html: string, baseUrl: string, currentDepth?: number): Promise<DiscoveredLink[]>;
    isAllowedByRobots(url: string): Promise<RobotsCheckResult>;
    preloadRobots(url: string): Promise<void>;
    getSitemaps(url: string): Promise<string[]>;
    discoverFromSitemaps(url: string, options?: SitemapDiscoveryOptions): Promise<DiscoveredLink[]>;
    parseSitemap(sitemapUrl: string, options?: Record<string, unknown>): Promise<Array<{
        url?: string;
        [key: string]: unknown;
    }>>;
    probeSitemapLocations(url: string): Promise<Array<{
        url: string;
        exists: boolean;
        format?: string;
    }>>;
    private _normalizeUrl;
    private _shouldFollow;
    private _shouldFollowPattern;
    private _getMainDomain;
    markQueued(url: string): void;
    isQueued(url: string): boolean;
    getStats(): DiscoveryStats;
    reset(options?: ResetOptions): void;
    isLimitReached(): boolean;
}

interface SpiderPluginConfig {
    logLevel?: string;
    namespace?: string;
    resourcePrefix?: string;
    puppeteer?: Record<string, any>;
    queue?: Record<string, any>;
    ttl?: {
        enabled?: boolean;
        queue?: {
            ttl?: number;
            [key: string]: any;
        };
        [key: string]: any;
    };
    seo?: {
        enabled?: boolean;
        extractMetaTags?: boolean;
        extractOpenGraph?: boolean;
        extractTwitterCard?: boolean;
        extractAssets?: boolean;
        assetMetadata?: boolean;
        [key: string]: any;
    };
    techDetection?: {
        enabled?: boolean;
        detectFrameworks?: boolean;
        detectAnalytics?: boolean;
        detectMarketing?: boolean;
        detectCDN?: boolean;
        detectWebServer?: boolean;
        detectCMS?: boolean;
        [key: string]: any;
    };
    screenshot?: {
        enabled?: boolean;
        captureFullPage?: boolean;
        quality?: number;
        format?: 'jpeg' | 'png';
        maxWidth?: number;
        maxHeight?: number;
        [key: string]: any;
    };
    persistence?: {
        enabled?: boolean;
        saveResults?: boolean;
        saveSEOAnalysis?: boolean;
        saveTechFingerprint?: boolean;
        saveSecurityAnalysis?: boolean;
        saveScreenshots?: boolean;
        savePerformanceMetrics?: boolean;
        [key: string]: any;
    };
    performance?: {
        enabled?: boolean;
        collectCoreWebVitals?: boolean;
        collectNavigationTiming?: boolean;
        collectResourceTiming?: boolean;
        collectMemory?: boolean;
        [key: string]: any;
    };
    security?: {
        enabled?: boolean;
        analyzeSecurityHeaders?: boolean;
        analyzeCSP?: boolean;
        analyzeCORS?: boolean;
        captureConsoleLogs?: boolean;
        consoleLogLevels?: string[];
        maxConsoleLogLines?: number;
        analyzeTLS?: boolean;
        checkVulnerabilities?: boolean;
        captureWebSockets?: boolean;
        maxWebSocketMessages?: number;
        [key: string]: any;
    };
    patterns?: Record<string, any>;
    discovery?: {
        enabled?: boolean;
        maxDepth?: number;
        maxUrls?: number;
        sameDomainOnly?: boolean;
        includeSubdomains?: boolean;
        allowedDomains?: string[];
        blockedDomains?: string[];
        followPatterns?: string[];
        followRegex?: RegExp | null;
        ignoreRegex?: RegExp | null;
        respectRobotsTxt?: boolean;
        ignoreQueryString?: boolean;
        [key: string]: any;
    };
    logger?: any;
}
declare class SpiderPlugin extends Plugin {
    config: any;
    resourceNames: Record<string, string>;
    puppeteerPlugin: PuppeteerPlugin | null;
    queuePlugin: S3QueuePlugin | null;
    ttlPlugin: TTLPlugin | null;
    seoAnalyzer: any | null;
    techDetector: any | null;
    securityAnalyzer: any | null;
    patternMatcher: URLPatternMatcher | null;
    linkDiscoverer: LinkDiscoverer | null;
    initialized: boolean;
    namespace: string;
    constructor(options?: SpiderPluginConfig);
    /**
     * Initialize SpiderPlugin
     * Creates and initializes bundled plugins
     */
    initialize(): Promise<void>;
    /**
     * Create required resources
     */
    _createResources(): Promise<void>;
    /**
     * Check if a specific activity should be executed
     */
    _shouldExecuteActivity(task: any, activityName: string): boolean;
    /**
     * Check if ANY activity from a category should be executed
     */
    _shouldExecuteCategory(task: any, category: string): boolean;
    /**
     * Get which specific activities from a category should run
     */
    _getRequestedActivities(task: any, category: string): string[];
    /**
     * Setup queue processor function
     */
    _setupQueueProcessor(): Promise<void>;
    /**
     * Enqueue a crawl target
     */
    enqueueTarget(target: any): Promise<any>;
    /**
     * Enqueue multiple targets
     */
    enqueueBatch(targets: any[], defaultConfig?: any): Promise<any[]>;
    /**
     * Get results for a crawl
     */
    getResults(query?: any): Promise<any[]>;
    /**
     * Get SEO analysis for URLs
     */
    getSEOAnalysis(query?: any): Promise<any[]>;
    /**
     * Get technology fingerprints
     */
    getTechFingerprints(query?: any): Promise<any[]>;
    /**
     * Get screenshots
     */
    getScreenshots(query?: any): Promise<any[]>;
    /**
     * Get security analysis records
     */
    getSecurityAnalysis(query?: any): Promise<any[]>;
    /**
     * Get content analysis records (iframes, tracking pixels)
     */
    getContentAnalysis(query?: any): Promise<any[]>;
    /**
     * Get storage analysis records (localStorage, IndexedDB, sessionStorage)
     */
    getStorageAnalysis(query?: any): Promise<any[]>;
    /**
     * Get performance metrics records
     */
    getPerformanceMetrics(query?: any): Promise<any[]>;
    /**
     * Get assets analysis records (CSS, JS, images, videos, audios)
     */
    getAssetsAnalysis(query?: any): Promise<any[]>;
    /**
     * Detect anti-bot services and CAPTCHA implementations on a page
     */
    detectAntiBotServices(page: any): Promise<any>;
    /**
     * Detect browser fingerprinting capabilities and attempts
     */
    detectFingerprinting(page: any): Promise<any>;
    /**
     * Comprehensive anti-bot and fingerprinting detection
     */
    detectAntiBotsAndFingerprinting(page: any): Promise<any>;
    /**
     * Detect WebRTC peer connections and ICE candidates
     */
    detectWebRTC(page: any): Promise<any>;
    /**
     * Detect media streams (audio, video, display capture)
     */
    detectMediaStreams(page: any): Promise<any>;
    /**
     * Detect streaming protocols (HLS, DASH, RTMP, etc.)
     */
    detectStreamingProtocols(page: any): Promise<any>;
    /**
     * Comprehensive WebRTC and streaming detection
     */
    detectWebRTCAndStreams(page: any): Promise<any>;
    /**
     * Capture all storage data (localStorage, sessionStorage, IndexedDB) from page
     */
    captureAllStorage(page: any): Promise<any>;
    /**
     * Get access to the underlying PuppeteerPlugin for advanced usage
     */
    getPuppeteerPlugin(): PuppeteerPlugin | null;
    /**
     * Navigate to a URL using the underlying PuppeteerPlugin
     */
    navigate(url: string, options?: any): Promise<any>;
    /**
     * Match a URL against configured patterns
     */
    matchUrl(url: string): any | null;
    /**
     * Check if a URL matches any pattern (quick check)
     */
    urlMatchesPattern(url: string): boolean;
    /**
     * Add a new URL pattern at runtime
     */
    addPattern(name: string, config: any): void;
    /**
     * Remove a URL pattern
     */
    removePattern(name: string): void;
    /**
     * Get all configured pattern names
     */
    getPatternNames(): string[];
    /**
     * Filter URLs that match specific patterns
     */
    filterUrlsByPattern(urls: string[], patternNames?: string[]): Array<{
        url: string;
        match: any;
    }>;
    /**
     * Get discovery statistics
     */
    getDiscoveryStats(): any;
    /**
     * Reset discovery state (clear discovered/queued URLs)
     */
    resetDiscovery(): void;
    /**
     * Enable or configure auto-discovery at runtime
     */
    enableDiscovery(config?: any): void;
    /**
     * Disable auto-discovery
     */
    disableDiscovery(): void;
    /**
     * Get queue status
     */
    getQueueStatus(): Promise<any>;
    /**
     * Start queue processing
     */
    startProcessing(): Promise<void>;
    /**
     * Stop queue processing
     */
    stopProcessing(): Promise<void>;
    /**
     * Get persistence configuration
     */
    getPersistenceConfig(): any;
    /**
     * Enable persistence
     */
    enablePersistence(config?: any): void;
    /**
     * Disable persistence
     */
    disablePersistence(): void;
    /**
     * Get all available activities
     */
    getAvailableActivities(): any[];
    /**
     * Get activities by category
     */
    getActivitiesByCategory(category: string): any[];
    /**
     * Get all activity categories with their activities
     */
    getActivityCategories(): any;
    /**
     * Get all available activity presets
     */
    getActivityPresets(): Record<string, any>;
    /**
     * Get a specific preset by name
     */
    getPresetByName(presetName: string): any | null;
    /**
     * Validate a list of activity names
     */
    validateActivityList(activityNames: string[]): {
        valid: boolean;
        message?: string;
        invalidActivities?: string[];
    };
    /**
     * Clear all crawl data
     */
    clear(): Promise<void>;
    /**
     * Destroy SpiderPlugin
     * Closes browsers and stops processing
     */
    destroy(): Promise<void>;
}

interface HybridFetcherConfig {
    context?: CrawlContext;
    strategy?: 'auto' | 'recker-only' | 'puppeteer-only';
    timeout?: number;
    navigationTimeout?: number;
    puppeteerOptions?: Record<string, unknown>;
    httpClient?: HttpClient | null;
    jsDetectionPatterns?: RegExp[];
    userAgent?: string;
    acceptLanguage?: string;
    platform?: 'Windows' | 'Mac' | 'Linux';
    headers?: Record<string, string>;
    proxy?: string | null;
    viewport?: {
        width: number;
        height: number;
    };
}
interface FetchResult {
    html: string;
    response?: HttpResponse | PuppeteerResponse;
    url?: string;
    ok?: boolean;
    status?: number;
    headers?: Headers | Record<string, string>;
    source: 'recker' | 'puppeteer';
    method?: string;
    page?: Page;
}
interface FetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    waitUntil?: string;
    timeout?: number;
    keepPage?: boolean;
}
interface HeadResult {
    status: number;
    headers: Headers | Record<string, string>;
    ok: boolean;
}
interface FetcherStats {
    reckerRequests: number;
    puppeteerRequests: number;
    fallbacks: number;
    errors: number;
    browserActive: boolean;
    httpClientActive: boolean;
}
interface HttpClient {
    get(url: string, options?: {
        headers?: Record<string, string>;
    }): Promise<HttpResponse>;
    post(url: string, options?: {
        headers?: Record<string, string>;
        body?: unknown;
    }): Promise<HttpResponse>;
    request(url: string, options?: Record<string, unknown>): Promise<HttpResponse>;
}
interface HttpResponse {
    ok: boolean;
    status: number;
    headers: Headers;
    text(): Promise<string>;
}
interface Headers {
    get(name: string): string | null;
    [key: string]: unknown;
}
interface Page {
    goto(url: string, options?: {
        waitUntil?: string;
        timeout?: number;
    }): Promise<PuppeteerResponse | null>;
    content(): Promise<string>;
    close(): Promise<void>;
}
interface PuppeteerResponse {
    status(): number;
}
interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
}
interface PuppeteerModule {
    default: {
        launch(options: Record<string, unknown>): Promise<Browser>;
    };
}
declare class HybridFetcher {
    context: CrawlContext;
    strategy: 'auto' | 'recker-only' | 'puppeteer-only';
    timeout: number;
    navigationTimeout: number;
    puppeteerOptions: Record<string, unknown>;
    _customHttpClient: HttpClient | null;
    _httpClient: HttpClient | null;
    _browser: Browser | null;
    _puppeteer: PuppeteerModule | null;
    _jsPatterns: RegExp[];
    stats: {
        reckerRequests: number;
        puppeteerRequests: number;
        fallbacks: number;
        errors: number;
    };
    constructor(config?: HybridFetcherConfig);
    private _getHttpClient;
    private _getBrowser;
    private _needsJavaScript;
    fetchWithRecker(url: string, options?: FetchOptions): Promise<FetchResult>;
    fetchWithPuppeteer(url: string, options?: FetchOptions): Promise<FetchResult>;
    fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
    post(url: string, options?: FetchOptions): Promise<FetchResult>;
    head(url: string, options?: FetchOptions): Promise<HeadResult>;
    needsPuppeteer(url: string): Promise<boolean>;
    getStats(): FetcherStats;
    close(): Promise<void>;
    isPuppeteerAvailable(): Promise<boolean>;
}

interface CookieFarmPluginOptions {
    logLevel?: string;
    generation?: {
        count?: number;
        proxies?: any[];
        userAgentStrategy?: 'random' | 'desktop-only' | 'mobile-only';
        viewportStrategy?: 'varied' | 'fixed' | 'desktop-only';
    };
    warmup?: {
        enabled?: boolean;
        sites?: string[];
        sitesPerPersona?: number;
        randomOrder?: boolean;
        timePerSite?: {
            min: number;
            max: number;
        };
        interactions?: {
            scroll?: boolean;
            hover?: boolean;
            click?: boolean;
        };
    };
    quality?: {
        enabled?: boolean;
        factors?: {
            age?: number;
            successRate?: number;
            requestCount?: number;
            warmupCompleted?: number;
        };
        thresholds?: {
            high?: number;
            medium?: number;
            low?: number;
        };
    };
    rotation?: {
        enabled?: boolean;
        maxAge?: number;
        maxRequests?: number;
        minQualityScore?: number;
        retireOnFailureRate?: number;
    };
    storage?: {
        resource?: string;
        encrypt?: boolean;
    };
    export?: {
        format?: 'json' | 'csv';
        includeCredentials?: boolean;
    };
    stealth?: {
        enabled?: boolean;
        timingProfile?: 'very-slow' | 'slow' | 'normal' | 'fast';
        consistentFingerprint?: boolean;
        executeJSChallenges?: boolean;
        humanBehavior?: boolean;
        requestPacing?: boolean;
        geoConsistency?: boolean;
    };
    resourceNames?: {
        personas?: string;
    };
    [key: string]: any;
}
interface Persona {
    personaId: string;
    sessionId: string;
    proxyId: string | null;
    userAgent: string;
    viewport: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    cookies: any[];
    fingerprint: {
        proxy: string | null;
        userAgent: string;
        viewport: string;
    };
    reputation: {
        successCount: number;
        failCount: number;
        successRate: number;
        totalRequests: number;
    };
    quality: {
        score: number;
        rating: 'low' | 'medium' | 'high';
        lastCalculated: number;
    };
    metadata: {
        createdAt: number;
        lastUsed: number | null;
        expiresAt: number;
        age: number;
        warmupCompleted: boolean;
        retired: boolean;
    };
    id?: string;
}
declare class CookieFarmPlugin extends Plugin {
    config: Required<CookieFarmPluginOptions>;
    _storageResourceDescriptor: {
        defaultName: string;
        override?: string;
    };
    puppeteerPlugin: PuppeteerPlugin | null;
    stealthManager: any | null;
    personaPool: Map<string, Persona>;
    initialized: boolean;
    constructor(options?: CookieFarmPluginOptions);
    _resolveStorageResourceName(): string;
    onNamespaceChanged(): void;
    /**
     * Install plugin and validate dependencies
     */
    onInstall(): Promise<void>;
    /**
     * Locate PuppeteerPlugin dependency respecting namespaces
     * @private
     */
    private _findPuppeteerDependency;
    /**
     * Start plugin
     */
    onStart(): Promise<void>;
    /**
     * Stop plugin
     */
    onStop(): Promise<void>;
    /**
     * Uninstall plugin
     */
    onUninstall(options?: any): Promise<void>;
    /**
     * Setup persona storage resource
     * @private
     */
    private _setupPersonaStorage;
    /**
     * Load persona pool from storage
     * @private
     */
    private _loadPersonaPool;
    /**
     * Generate new personas
     * @param count - Number of personas to generate
     * @param options - Generation options
     * @returns
     */
    generatePersonas(count?: number, options?: any): Promise<Persona[]>;
    /**
     * Create a single persona
     * @private
     * @param proxies - Available proxies
     * @returns
     */
    private _createPersona;
    /**
     * Generate user agent based on strategy
     * @private
     */
    private _generateUserAgent;
    /**
     * Generate viewport based on strategy
     * @private
     */
    private _generateViewport;
    /**
     * Warmup a persona by visiting trusted sites
     * @param personaId - Persona identifier
     * @returns
     */
    warmupPersona(personaId: string): Promise<void>;
    /**
     * Visit a site with persona
     * @private
     */
    private _visitSite;
    /**
     * Calculate quality score for persona
     * @private
     */
    private _calculateQuality;
    /**
     * Save persona to storage
     * @private
     */
    private _savePersona;
    /**
     * Get persona by criteria
     * @param criteria - Selection criteria
     * @returns
     */
    getPersona(criteria?: {
        quality?: 'low' | 'medium' | 'high';
        minQualityScore?: number;
        proxyId?: string | null;
        excludeRetired?: boolean;
    }): Promise<Persona | null>;
    /**
     * Record persona usage
     * @param personaId - Persona identifier
     * @param result - Usage result
     */
    recordUsage(personaId: string, result?: {
        success?: boolean;
    }): Promise<void>;
    /**
     * Check if persona should be retired
     * @private
     */
    private _shouldRetire;
    /**
     * Retire a persona
     * @param personaId - Persona identifier
     */
    retirePersona(personaId: string): Promise<void>;
    /**
     * Get statistics
     * @returns
     */
    getStats(): Promise<any>;
    /**
     * Export personas
     * @param options - Export options
     * @returns
     */
    exportPersonas(options?: {
        includeRetired?: boolean;
        format?: 'json' | 'csv';
    }): Promise<Persona[]>;
    /**
     * Delay helper
     * @private
     */
    private _delay;
}

interface CookieFarmSuitePluginOptions {
    namespace?: string;
    jobsResource?: string;
    resources?: {
        jobs?: string;
        [key: string]: unknown;
    };
    queue?: {
        resource?: string;
        deadLetterResource?: string | null;
        visibilityTimeout?: number;
        pollInterval?: number;
        maxAttempts?: number;
        concurrency?: number;
        autoStart?: boolean;
        onMessage?: Function;
        logLevel?: string;
    };
    puppeteer?: any;
    cookieFarm?: any;
    ttl?: any;
    processor?: Function;
    pluginFactories?: {
        puppeteer?: (options: any) => PuppeteerPlugin;
        cookieFarm?: (options: any) => CookieFarmPlugin;
        queue?: (options: any) => S3QueuePlugin;
        ttl?: (options: any) => TTLPlugin;
    };
}
interface PersonaJob {
    id: string;
    jobType: string;
    payload?: any;
    priority?: number;
    requestedBy?: string;
    metadata?: any;
    createdAt: string;
}
/**
 * CookieFarmSuitePlugin
 *
 * Bundles CookieFarm + Puppeteer + S3Queue (+ optional TTL) with shared
 * namespace handling for persona farming workloads.
 */
declare class CookieFarmSuitePlugin extends Plugin {
    namespace: string;
    config: Required<Omit<CookieFarmSuitePluginOptions, 'pluginFactories'>>;
    pluginFactories: Required<NonNullable<CookieFarmSuitePluginOptions['pluginFactories']>>;
    dependencies: {
        name: string;
        instance: Plugin;
    }[];
    jobsResource: any | null;
    puppeteerPlugin: PuppeteerPlugin | null;
    cookieFarmPlugin: CookieFarmPlugin | null;
    queuePlugin: S3QueuePlugin | null;
    ttlPlugin: TTLPlugin | null;
    processor: Function | null;
    constructor(options?: CookieFarmSuitePluginOptions);
    _dependencyName(alias: string): string;
    _installDependency(alias: string, plugin: Plugin): Promise<Plugin>;
    _ensureJobsResource(): Promise<void>;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(options?: {
        purgeData?: boolean;
    }): Promise<void>;
    /**
     * Register a job processor.
     */
    setProcessor(handler: Function, { autoStart, concurrency }?: {
        autoStart?: boolean;
        concurrency?: number;
    }): Promise<void>;
    /**
     * Enqueue a persona job.
     */
    enqueueJob(data: PersonaJob, options?: any): Promise<any>;
    startProcessing(options?: {
        concurrency?: number;
    }): Promise<void>;
    stopProcessing(): Promise<void>;
    queueHandler(record: any, context: any): Promise<any>;
}

/**
 * TargetNormalizer
 *
 * Normalizes target URLs/domains into structured format:
 * - Parses URLs
 * - Extracts host, protocol, port
 * - Handles edge cases
 */
interface NormalizedTarget {
    original: string;
    host: string;
    protocol: string | null;
    port: number | null;
    path: string | null;
}

/**
 * StorageManager
 *
 * Handles all storage operations for the ReconPlugin:
 * - Report persistence to PluginStorage
 * - Resource updates (hosts, reports, diffs, stages, etc.)
 * - History pruning
 * - Diff computation and alerts
 */

interface ReconPlugin$n {
    database: any;
    namespace?: string;
    config: {
        storage: {
            historyLimit: number;
        };
        resources: {
            persist: boolean;
        };
    };
    getStorage(): PluginStorage;
    _getResource(name: string): Promise<any>;
    emit(event: string, data: any): void;
}
interface PluginStorage {
    getPluginKey(arg1: null, ...args: string[]): string;
    set(key: string, data: any, options?: {
        behavior?: string;
    }): Promise<void>;
    get(key: string): Promise<any>;
    delete(key: string): Promise<void>;
}
interface StageData {
    status?: string;
    duration?: number;
    error?: string;
    _individual?: Record<string, any>;
    _aggregated?: any;
    tools?: Record<string, any>;
    records?: Record<string, any>;
    openPorts?: any[];
    list?: any[];
    paths?: any[];
    total?: number;
}
interface ReportFingerprint {
    primaryIp?: string;
    ipAddresses?: string[];
    cdn?: string;
    server?: string;
    latencyMs?: number | null;
    subdomains?: string[];
    subdomainCount?: number;
    openPorts?: any[];
    technologies?: string[] | {
        detected?: string[];
    };
    infrastructure?: {
        ips?: {
            ipv4?: string[];
        };
    };
    attackSurface?: {
        openPorts?: any[];
        subdomains?: {
            total?: number;
        };
        discoveredPaths?: {
            total?: number;
        };
    };
}
interface Report$2 {
    id?: string;
    target: NormalizedTarget;
    timestamp?: string;
    endedAt: string;
    status: string;
    duration?: number;
    results?: Record<string, StageData>;
    fingerprint: ReportFingerprint;
    storageKey?: string;
    stageStorageKeys?: Record<string, string>;
    toolStorageKeys?: Record<string, string>;
    diffs?: DiffEntry[];
    riskLevel?: string;
    uptime?: any;
}
interface DiffEntry {
    type: string;
    values?: any[];
    previous?: any;
    current?: any;
    description: string;
    severity: string;
    critical: boolean;
    detectedAt: string;
}
interface HistoryEntry {
    timestamp: string;
    status: string;
    reportKey: string;
    stageKeys?: Record<string, string>;
    toolKeys?: Record<string, string>;
    summary: {
        latencyMs: number | null;
        openPorts: number;
        subdomains: number;
        primaryIp: string | null;
    };
}
interface HostRecord {
    id: string;
    target: string;
    summary: any;
    fingerprint: ReportFingerprint;
    lastScanAt: string;
    storageKey: string | null;
}
declare class StorageManager {
    private plugin;
    private resources;
    private logger;
    constructor(plugin: ReconPlugin$n);
    listNamespaces(): Promise<string[]>;
    initialize(): Promise<void>;
    getResource(name: string): any;
    _extractTimestampDay(isoTimestamp: string | undefined): string | null;
    persistReport(target: NormalizedTarget, report: Report$2): Promise<void>;
    persistToResources(report: Report$2): Promise<void>;
    pruneHistory(target: NormalizedTarget, pruned: HistoryEntry[]): Promise<void>;
    loadLatestReport(hostId: string): Promise<Report$2 | null>;
    loadHostSummary(hostId: string, report: Report$2): Promise<HostRecord>;
    saveDiffs(hostId: string, timestamp: string, diffs: DiffEntry[]): Promise<void>;
    loadRecentDiffs(hostId: string, limit?: number): Promise<DiffEntry[]>;
    _buildHostRecord(report: Report$2): HostRecord;
    _computeDiffs(existingRecord: HostRecord | null, report: Report$2): DiffEntry[];
    _createDiff(type: string, data: Partial<DiffEntry>, meta?: {
        severity?: string;
        critical?: boolean;
    }): DiffEntry;
    _emitDiffAlerts(hostId: string, report: Report$2, diffs: DiffEntry[]): Promise<void>;
    _summarizeStage(stageName: string, stageData: StageData): Record<string, any>;
    _stripRawFields(obj: any): Record<string, any>;
    _upsertResourceRecord(resource: any, record: any): Promise<void>;
    _extractToolNames(stageData: StageData | undefined, filter?: 'all' | 'succeeded' | 'failed'): string[];
    _countResults(stageData: StageData | undefined): number;
}

interface TargetOptions {
    enabled?: boolean;
    behavior?: string;
    features?: Record<string, any>;
    tools?: any;
    schedule?: string | null;
    metadata?: Record<string, any>;
    addedBy?: string;
    tags?: string[];
}
interface TargetRecord {
    id: string;
    target: string;
    enabled: boolean;
    behavior: string;
    features: Record<string, any>;
    tools: any;
    schedule: string | null;
    metadata: Record<string, any>;
    lastScanAt: string | null;
    lastScanStatus: string | null;
    scanCount: number;
    addedBy: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
}
interface ListOptions$1 {
    includeDisabled?: boolean;
    fromResource?: boolean;
    limit?: number;
}
interface ReconPlugin$m {
    config: {
        behavior: string;
        targets?: Array<string | TargetConfigEntry>;
    };
    namespace?: string;
    database: any;
    emit(event: string, data: any): void;
    _targetManager: TargetManager;
}
interface TargetConfigEntry {
    target?: string;
    host?: string;
    domain?: string;
    enabled?: boolean;
    behavior?: string;
    features?: Record<string, any>;
    tools?: any;
    schedule?: string | null;
    metadata?: Record<string, any>;
    tags?: string[];
}
interface Report$1 {
    endedAt: string;
    status: string;
}
declare class TargetManager {
    private plugin;
    constructor(plugin: ReconPlugin$m);
    add(targetInput: string, options?: TargetOptions): Promise<TargetRecord>;
    remove(targetInput: string): Promise<{
        targetId: string;
        removed: boolean;
    }>;
    update(targetInput: string, updates: Partial<TargetRecord>): Promise<TargetRecord>;
    list(options?: ListOptions$1): Promise<TargetRecord[]>;
    get(targetInput: string): Promise<TargetRecord | null>;
    updateScanMetadata(targetId: string, report: Report$1): Promise<void>;
    private _getResource;
    private _normalizeTarget;
    private _defaultPortForProtocol;
    private _normalizeConfigTargets;
}

/**
 * SchedulerManager
 *
 * Handles cron-based scheduled sweeps:
 * - Manages cron job registration
 * - Triggers scheduled target sweeps
 * - Iterates over enabled targets
 */

interface ReconPlugin$l {
    config: {
        schedule: {
            enabled: boolean;
            cron?: string;
            runOnStart?: boolean;
        };
        concurrency?: number;
    };
    namespace?: string;
    database?: {
        pluginRegistry?: {
            scheduler?: SchedulerPlugin;
        };
    };
    _targetManager: TargetManager;
    emit(event: string, data: any): void;
    runDiagnostics(target: string, options: DiagnosticOptions): Promise<Report>;
}
interface SchedulerPlugin {
    registerJob(config: JobConfig): Promise<string>;
    unregisterJob(jobId: string): Promise<void>;
}
interface JobConfig {
    name: string;
    cron: string;
    handler: () => Promise<void>;
    enabled: boolean;
    metadata: Record<string, any>;
}
interface DiagnosticOptions {
    behavior?: string;
    features?: Record<string, any>;
    tools?: any;
    persist?: boolean;
}
interface Report {
    target: {
        host: string;
    };
    status: string;
    endedAt: string;
}
declare class SchedulerManager {
    private plugin;
    private cronJobId;
    private fallbackJobName;
    constructor(plugin: ReconPlugin$l);
    start(): Promise<void>;
    stop(): Promise<void>;
    triggerSweep(reason?: string): Promise<void>;
    private _startFallbackScheduler;
    private _parseCronToInterval;
}

/**
 * CommandRunner
 *
 * Executes RedBlue CLI commands:
 * - Unified interface for all rb commands
 * - JSON output parsing
 * - Error handling
 * - Availability detection
 */
interface CommandOptions {
    timeout?: number;
    flags?: string[];
    cwd?: string;
}
interface CommandResult {
    status: 'ok' | 'error' | 'unavailable' | 'timeout';
    data?: any;
    raw?: string;
    error?: string;
    exitCode?: number;
    metadata: {
        command: string;
        duration: number;
        timestamp: string;
    };
}
interface ReconPlugin$k {
    config: {
        timeout?: {
            default?: number;
        };
    };
}
declare class CommandRunner {
    private plugin;
    private redBlueAvailable;
    constructor(plugin: ReconPlugin$k);
    isRedBlueAvailable(): Promise<boolean>;
    runRedBlue(category: string, subCategory: string, command: string, target: string, options?: CommandOptions): Promise<CommandResult>;
    runSimple(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
    private _executeCommand;
}

/**
 * DependencyManager
 *
 * Validates RedBlue (rb) availability:
 * - Single binary check (replaces ~30 individual tools)
 * - Provides installation guidance
 * - Emits warnings if rb is not found
 */

interface ReconPlugin$j {
    commandRunner: CommandRunner;
    emit(event: string, data: any): void;
}
interface DependencyWarning {
    tool: string;
    message: string;
    installGuide: string;
}
interface ToolStatus {
    available: boolean;
    required: boolean;
    description: string;
}
declare class DependencyManager {
    private plugin;
    constructor(plugin: ReconPlugin$j);
    checkAll(): Promise<DependencyWarning[]>;
    checkTool(toolName: string): Promise<boolean>;
    getToolStatus(): Promise<Record<string, ToolStatus>>;
    private _getInstallGuide;
}

/**
 * DnsStage
 *
 * DNS enumeration using RedBlue:
 * - A, AAAA, NS, MX, TXT, CNAME, SOA records
 * - Uses `rb dns record all` for comprehensive lookup
 */

interface ReconPlugin$i {
    commandRunner: CommandRunner;
}
interface Target$i {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface DnsFeatureConfig {
    timeout?: number;
    server?: string;
    intel?: boolean;
}
interface MxRecord {
    priority: number;
    exchange: string;
}
interface DnsRecords {
    a: string[];
    aaaa: string[];
    ns: string[];
    mx: MxRecord[];
    txt: string[];
    cname: string[];
    soa: string | null;
}
interface DnsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    records?: DnsRecords;
    errors?: Record<string, string>;
    metadata?: Record<string, any>;
}
declare class DnsStage {
    private plugin;
    private commandRunner;
    constructor(plugin: ReconPlugin$i);
    execute(target: Target$i, featureConfig?: DnsFeatureConfig): Promise<DnsResult>;
    private _buildFlags;
    private _normalizeRecords;
    private _parseRawOutput;
    private _emptyRecords;
}

/**
 * CertificateStage
 *
 * TLS certificate inspection using RedBlue:
 * - Subject and issuer details
 * - Validity period
 * - Fingerprint
 * - Subject Alternative Names (SANs)
 */

interface ReconPlugin$h {
    commandRunner: CommandRunner;
}
interface Target$h {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface CertificateFeatureConfig {
    timeout?: number;
}
interface CertificateResult {
    status: 'ok' | 'skipped' | 'unavailable' | 'error';
    message?: string;
    subject?: string | null;
    issuer?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
    fingerprint?: string | null;
    subjectAltName?: string[];
    serialNumber?: string | null;
    version?: number | null;
    signatureAlgorithm?: string | null;
    chain?: any[];
    metadata?: Record<string, any>;
}
declare class CertificateStage {
    private plugin;
    private commandRunner;
    constructor(plugin: ReconPlugin$h);
    execute(target: Target$h, featureConfig?: CertificateFeatureConfig): Promise<CertificateResult>;
    private _normalizeCertificate;
    private _normalizeAltNames;
    private _parseRawCert;
}

/**
 * LatencyStage
 *
 * Network latency measurement using RedBlue:
 * - ICMP ping with statistics
 * - Traceroute support (when available)
 */

interface ReconPlugin$g {
    commandRunner: CommandRunner;
    config: {
        ping?: {
            count?: number;
            timeout?: number;
        };
    };
}
interface Target$g {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface LatencyFeatureConfig {
    timeout?: number;
    count?: number;
    interval?: number;
    ping?: boolean;
    traceroute?: boolean;
    traceTimeout?: number;
}
interface PingMetrics {
    packetsTransmitted: number | null;
    packetsReceived: number | null;
    packetLoss: number | null;
    min: number | null;
    avg: number | null;
    max: number | null;
    stdDev: number | null;
}
interface PingResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    metrics?: PingMetrics;
    metadata?: Record<string, any>;
}
interface TracerouteResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    hops?: any[];
    metadata?: Record<string, any>;
}
interface LatencyResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    ping?: PingResult;
    traceroute?: TracerouteResult;
}
declare class LatencyStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$g);
    execute(target: Target$g, featureConfig?: LatencyFeatureConfig): Promise<LatencyResult>;
    private _executePing;
    private _executeTrace;
    private _normalizeMetrics;
    private _parseRawPing;
    private _defaultMetrics;
}

/**
 * HttpStage
 *
 * HTTP request testing using RedBlue:
 * - Basic GET requests
 * - Header inspection
 * - Security header audit
 * - Server fingerprinting
 */

interface ReconPlugin$f {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
interface Target$f {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface HttpFeatureConfig {
    timeout?: number;
    follow?: boolean;
    userAgent?: string;
    intel?: boolean;
}
interface HttpResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    url?: string;
    statusCode?: number | null;
    headers?: Record<string, string>;
    body?: string | null;
    contentType?: string | null;
    contentLength?: number | null;
    server?: string | null;
    redirects?: string[];
    securityHeaders?: any;
    grade?: any;
    metadata?: Record<string, any>;
}
declare class HttpStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$f);
    execute(target: Target$f, featureConfig?: HttpFeatureConfig): Promise<HttpResult>;
    private _buildUrl;
    private _defaultPortForProtocol;
    private _buildFlags;
    private _normalizeHttp;
    private _parseRawHttp;
    executeSecurityAudit(target: Target$f, featureConfig?: HttpFeatureConfig): Promise<HttpResult>;
    executeGrade(target: Target$f, featureConfig?: HttpFeatureConfig): Promise<HttpResult>;
}

/**
 * PortsStage
 *
 * Port scanning using RedBlue:
 * - Common ports preset (fast)
 * - Full port range scanning
 * - Service detection with banners
 * - Fast mode (masscan-style)
 */

interface ReconPlugin$e {
    commandRunner: CommandRunner;
    config: {
        ports?: {
            preset?: string;
        };
    };
}
interface Target$e {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface PortsFeatureConfig {
    timeout?: number;
    preset?: string;
    fast?: boolean;
    threads?: number;
    intel?: boolean;
}
interface PortEntry {
    port: number;
    protocol: string;
    state: string;
    service?: string | null;
    banner?: string | null;
    product?: string | null;
}
interface PortsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    openPorts?: PortEntry[];
    total?: number;
    range?: {
        start: number;
        end: number;
    };
    metadata?: Record<string, any>;
}
declare class PortsStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$e);
    execute(target: Target$e, featureConfig?: PortsFeatureConfig): Promise<PortsResult>;
    private _buildFlags;
    private _normalizePorts;
    private _normalizePortEntry;
    private _parseRawOutput;
    executeRangeScan(target: Target$e, startPort: number, endPort: number, featureConfig?: PortsFeatureConfig): Promise<PortsResult>;
}

/**
 * SubdomainsStage
 *
 * Subdomain enumeration using RedBlue:
 * - Certificate Transparency logs
 * - DNS bruteforce with wordlists
 * - Multi-threaded discovery
 * - Subdomain takeover detection
 */

interface ReconPlugin$d {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
interface Target$d {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface SubdomainsFeatureConfig {
    timeout?: number;
    passive?: boolean;
    recursive?: boolean;
    wordlist?: string;
    threads?: number;
    checkTakeover?: boolean;
    maxSubdomains?: number;
}
interface VulnerableSubdomain {
    subdomain: string;
    provider: string;
    cname: string;
    severity: string;
    evidence: string;
    recommendation: string;
}
interface TakeoverError {
    subdomain: string;
    error: string;
}
interface TakeoverResults {
    status: 'ok' | 'vulnerable';
    vulnerable: VulnerableSubdomain[];
    checked: number;
    errors: TakeoverError[];
}
interface SubdomainsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    total?: number;
    list?: string[];
    sources?: Record<string, number>;
    takeover?: TakeoverResults | null;
    metadata?: Record<string, any>;
}
declare class SubdomainsStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$d);
    execute(target: Target$d, featureConfig?: SubdomainsFeatureConfig): Promise<SubdomainsResult>;
    private _buildFlags;
    private _normalizeSubdomains;
    private _checkSubdomainTakeover;
    private _extractCname;
}

/**
 * WebDiscoveryStage
 *
 * Directory and endpoint fuzzing using RedBlue:
 * - Path/directory discovery
 * - Endpoint enumeration
 * - Custom wordlist support
 */

interface ReconPlugin$c {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
interface Target$c {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface WebDiscoveryFeatureConfig {
    timeout?: number;
    wordlist?: string;
    threads?: number;
    statusCodes?: string;
    extensions?: string;
    recursive?: boolean;
}
interface DiscoveredPath {
    path: string;
    status: number | null;
    size: number | null;
    type: 'directory' | 'file';
    redirect?: string | null;
}
interface WebDiscoveryResult {
    status: 'ok' | 'empty' | 'skipped' | 'unavailable' | 'error';
    message?: string;
    url?: string;
    paths?: DiscoveredPath[];
    total?: number;
    directories?: number;
    files?: number;
    metadata?: Record<string, any>;
}
declare class WebDiscoveryStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$c);
    execute(target: Target$c, featureConfig?: WebDiscoveryFeatureConfig): Promise<WebDiscoveryResult>;
    private _buildUrl;
    private _defaultPortForProtocol;
    private _normalizeDiscovery;
    private _normalizePath;
    private _parseRawDiscovery;
}

/**
 * VulnerabilityStage
 *
 * Vulnerability scanning using RedBlue:
 * - Web vulnerability detection
 * - CMS-specific scanning (WordPress, Drupal, Joomla)
 * - Auto-detection of CMS type
 */

interface ReconPlugin$b {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
interface Target$b {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface VulnerabilityFeatureConfig {
    timeout?: number;
    strategy?: string;
    aggressive?: boolean;
}
interface Vulnerability {
    title: string;
    severity: string;
    cve?: string | null;
    cvss?: number | null;
    description?: string | null;
    evidence?: string | null;
    recommendation?: string | null;
    references?: string[];
}
interface VulnerabilityResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    url?: string;
    vulnerabilities?: Vulnerability[];
    total?: number;
    cms?: string | null;
    version?: string | null;
    summary?: any | null;
    metadata?: Record<string, any>;
}
declare class VulnerabilityStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$b);
    execute(target: Target$b, featureConfig?: VulnerabilityFeatureConfig): Promise<VulnerabilityResult>;
    private _buildUrl;
    private _buildFlags;
    private _normalizeVulnerabilities;
    private _normalizeVuln;
    private _inferSeverity;
    private _parseRawVulns;
    executeCmsScan(target: Target$b, cmsType: string, featureConfig?: VulnerabilityFeatureConfig): Promise<VulnerabilityResult>;
}

/**
 * TlsAuditStage
 *
 * TLS/SSL security auditing using RedBlue:
 * - Protocol version detection
 * - Cipher suite enumeration
 * - Security vulnerability detection
 */

interface ReconPlugin$a {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
interface Target$a {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface TlsAuditFeatureConfig {
    timeout?: number;
}
interface TlsProtocol {
    name: string;
    supported: boolean;
    deprecated?: boolean;
}
interface TlsCipher {
    name: string;
    strength: string;
    keyExchange?: string | null;
    authentication?: string | null;
}
interface TlsVulnerability {
    name: string;
    severity: string;
}
interface TlsAuditResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    protocols?: TlsProtocol[];
    ciphers?: TlsCipher[];
    vulnerabilities?: TlsVulnerability[];
    certificate?: any | null;
    grade?: string | null;
    warnings?: string[];
    metadata?: Record<string, any>;
}
declare class TlsAuditStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$a);
    execute(target: Target$a, featureConfig?: TlsAuditFeatureConfig): Promise<TlsAuditResult>;
    private _normalizeAudit;
    private _normalizeProtocols;
    private _normalizeCiphers;
    private _isDeprecated;
    private _cipherStrength;
    private _parseRawAudit;
}

/**
 * FingerprintStage
 *
 * Web technology fingerprinting using RedBlue:
 * - Framework/CMS detection
 * - Server technology identification
 * - JavaScript library detection
 * - Version detection
 */

interface ReconPlugin$9 {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
interface Target$9 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface FingerprintFeatureConfig {
    timeout?: number;
    intel?: boolean;
}
interface Technology {
    name: string;
    version?: string | null;
    category: string;
    confidence?: number | null;
}
interface FingerprintResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    url?: string;
    technologies?: Technology[];
    server?: string | null;
    framework?: string | null;
    cms?: string | null;
    headers?: Record<string, string>;
    cookies?: string[];
    metadata?: Record<string, any>;
}
declare class FingerprintStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$9);
    execute(target: Target$9, featureConfig?: FingerprintFeatureConfig): Promise<FingerprintResult>;
    private _buildUrl;
    private _normalizeFingerprint;
    private _normalizeTech;
    private _parseRawFingerprint;
}

/**
 * ScreenshotStage
 *
 * Visual reconnaissance stage.
 *
 * NOTE: This functionality is not currently available in RedBlue.
 * This stage returns 'unavailable' status until screenshot support is added.
 */

interface ReconPlugin$8 {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
interface Target$8 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface ScreenshotFeatureConfig {
    timeout?: number;
    width?: number;
    height?: number;
    fullPage?: boolean;
}
interface ScreenshotResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    url: string;
    screenshot?: string;
    metadata?: Record<string, any>;
}
declare class ScreenshotStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$8);
    execute(target: Target$8, featureConfig?: ScreenshotFeatureConfig): Promise<ScreenshotResult>;
    private _buildUrl;
}

/**
 * OsintStage
 *
 * Open Source Intelligence using RedBlue:
 * - Email harvesting
 * - Username enumeration
 * - Domain intelligence
 * - Social media mapping
 *
 * LEGAL DISCLAIMER:
 * - Only collect publicly available information
 * - Do NOT use social engineering, exploits, or unauthorized access
 * - Respect rate limits and terms of service
 * - Use for defensive security and authorized testing only
 */

interface ReconPlugin$7 {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
interface Target$7 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface OsintFeatureConfig {
    timeout?: number;
    emails?: boolean;
    usernames?: boolean;
    urls?: boolean;
    social?: boolean;
    maxSites?: number;
    wayback?: boolean;
}
interface EmailsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    domain?: string;
    addresses: string[];
    count?: number;
    metadata?: Record<string, any>;
}
interface Profile {
    platform: string;
    url: string;
    username: string;
    category?: string | null;
}
interface UsernamesResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    searchTerm?: string;
    profiles: Profile[];
    count?: number;
    metadata?: Record<string, any>;
}
interface UrlsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    domain?: string;
    urls: string[];
    count?: number;
    metadata?: Record<string, any>;
}
interface SocialPlatform {
    url: string;
    found: boolean;
}
interface SocialResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    companyName?: string;
    domain?: string;
    platforms: Record<string, SocialPlatform>;
    metadata?: Record<string, any>;
}
interface OsintCategories {
    emails: EmailsResult | null;
    usernames: UsernamesResult | null;
    urls: UrlsResult | null;
    social: SocialResult | null;
}
interface OsintResult {
    status: string;
    domain: string;
    companyName: string;
    categories: OsintCategories;
    summary: {
        totalEmails: number;
        totalProfiles: number;
        totalUrls: number;
    };
    errors: Record<string, string>;
}
declare class OsintStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin$7);
    execute(target: Target$7, featureConfig?: OsintFeatureConfig): Promise<OsintResult>;
    private _harvestEmails;
    private _enumerateUsernames;
    private _harvestUrls;
    private _mapSocialMedia;
    private _normalizeEmails;
    private _normalizeProfiles;
    private _normalizeProfile;
    private _normalizeUrls;
    private _normalizeSocialMedia;
    private _parseRawProfiles;
    private _extractPlatformFromUrl;
    private _deduplicateProfiles;
    private _extractBaseDomain;
    private _extractCompanyName;
}

/**
 * WhoisStage
 *
 * WHOIS lookup using RedBlue:
 * - Domain registration information
 * - Registrar, dates, nameservers
 * - Contact information (if available)
 */

interface ReconPlugin$6 {
    commandRunner: CommandRunner;
}
interface Target$6 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface WhoisFeatureConfig {
    timeout?: number;
    raw?: boolean;
}
interface Registrant {
    name: string | null;
    organization: string | null;
    email: string | null;
    country: string | null;
}
interface Dates {
    created: string | null;
    updated: string | null;
    expiration: string | null;
    daysUntilExpiration?: number;
}
interface WhoisResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    domain?: string;
    registrar?: string | null;
    registrant?: Registrant;
    dates?: Dates;
    nameservers?: string[];
    domainStatus?: string[];
    dnssec?: string | null;
    raw?: string | null;
    expirationStatus?: string;
    metadata?: Record<string, any>;
}
declare class WhoisStage {
    private plugin;
    private commandRunner;
    constructor(plugin: ReconPlugin$6);
    execute(target: Target$6, featureConfig?: WhoisFeatureConfig): Promise<WhoisResult>;
    private _extractBaseDomain;
    private _normalizeWhois;
    private _parseRawWhois;
    private _parseDate;
}

/**
 * SecretsStage
 *
 * Secrets detection stage.
 *
 * NOTE: This functionality is not currently available in RedBlue.
 * This stage returns 'unavailable' status until secrets scanning support is added.
 *
 * For secrets detection, use dedicated tools:
 * - Gitleaks (https://github.com/gitleaks/gitleaks)
 * - TruffleHog (https://github.com/trufflesecurity/trufflehog)
 */

interface ReconPlugin$5 {
    commandRunner: CommandRunner;
}
interface Target$5 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface SecretsFeatureConfig {
    timeout?: number;
    depth?: number;
    patterns?: string[];
}
interface SecretFinding {
    type: string;
    severity: 'high' | 'medium' | 'low';
    file?: string;
    line?: number;
    match?: string;
    description?: string;
}
interface SecretsSummary {
    total: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
}
interface SecretsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    host: string;
    findings: SecretFinding[];
    summary: SecretsSummary;
    metadata?: Record<string, any>;
}
declare class SecretsStage {
    private plugin;
    private commandRunner;
    constructor(plugin: ReconPlugin$5);
    execute(target: Target$5, featureConfig?: SecretsFeatureConfig): Promise<SecretsResult>;
}

/**
 * ASNStage
 *
 * ASN (Autonomous System Number) and Network Intelligence
 *
 * Discovers:
 * - ASN ownership and organization
 * - IP ranges (CIDR blocks)
 * - Network provider information
 * - BGP routing data
 *
 * Uses 100% free APIs:
 * - iptoasn.com (unlimited, free)
 * - hackertarget.com (100 queries/day free)
 */

interface ReconPlugin$4 {
    commandRunner: CommandRunner;
    config: {
        curl?: {
            userAgent?: string;
        };
        storage?: {
            persistRawOutput?: boolean;
        };
    };
}
interface Target$4 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface ASNFeatureConfig {
    timeout?: number;
    hackertarget?: boolean;
}
interface ASNData {
    ip: string;
    asn: string;
    asnNumber: number;
    organization: string | null;
    country: string | null;
    network: string | null;
    source: string;
    _source?: string;
    sources?: string[];
}
interface DigResults {
    status: string;
    ipv4: string[];
    ipv6: string[];
    raw_ipv4?: string;
    raw_ipv6?: string;
}
interface IndividualResults$1 {
    iptoasn: {
        status: string;
        results: any[];
    };
    hackertarget: {
        status: string;
        results: any[];
    };
    dig: DigResults;
}
interface ASNAggregatedResult {
    status: string;
    host: string;
    ipAddresses: string[];
    asns: ASNData[];
    networks: string[];
    organizations: string[];
    errors: Record<string, string>;
}
interface ASNResult extends ASNAggregatedResult {
    _individual: IndividualResults$1;
    _aggregated: ASNAggregatedResult;
}
declare class ASNStage {
    private plugin;
    private commandRunner;
    private config;
    private _httpClient;
    constructor(plugin: ReconPlugin$4);
    private _getHttpClient;
    execute(target: Target$4, options?: ASNFeatureConfig): Promise<ASNResult>;
    resolveHostToIPs(host: string, digResults?: DigResults | null): Promise<string[]>;
    lookupASNViaIPToASN(ip: string, options?: ASNFeatureConfig): Promise<ASNData | null>;
    lookupASNViaHackerTarget(ip: string, options?: ASNFeatureConfig): Promise<ASNData | null>;
    deduplicateASNs(asns: ASNData[]): ASNData[];
}

/**
 * DNSDumpster Stage
 *
 * DNS Intelligence via dnsdumpster.com web scraping
 *
 * Discovers:
 * - DNS records (A, AAAA, MX, TXT, NS)
 * - Subdomains
 * - Related domains
 * - Network map data
 *
 * Uses 100% free web scraping (no API key required)
 * - dnsdumpster.com (unlimited, requires CSRF token handling)
 */

interface ReconPlugin$3 {
    commandRunner: CommandRunner;
    config: {
        curl?: {
            userAgent?: string;
        };
        storage?: {
            persistRawOutput?: boolean;
        };
    };
}
interface Target$3 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface DNSDumpsterFeatureConfig {
    timeout?: number;
    fallbackToDig?: boolean;
}
interface ARecord {
    hostname: string;
    ip: string;
}
interface MXRecord {
    priority: string;
    hostname: string;
    ip: string;
}
interface TXTRecord {
    content: string;
}
interface NSRecord {
    hostname: string;
    ip: string | null;
}
interface DNSRecords {
    A: ARecord[];
    AAAA: ARecord[];
    MX: MXRecord[];
    TXT: TXTRecord[];
    NS: NSRecord[];
}
interface ParsedDNSData {
    dnsRecords: DNSRecords;
    subdomains: string[];
    relatedDomains: string[];
}
interface IndividualResults {
    dnsdumpster: {
        status: string;
        data: ParsedDNSData | null;
        raw: string | null;
    };
    dig: {
        status: string;
        records: Record<string, any>;
        dnsRecords?: DNSRecords;
        subdomains?: string[];
        relatedDomains?: string[];
    };
}
interface DNSDumpsterAggregatedResult {
    status: string;
    host: string;
    dnsRecords: DNSRecords;
    subdomains: string[];
    relatedDomains: string[];
    errors: Record<string, string>;
}
interface DNSDumpsterResult extends DNSDumpsterAggregatedResult {
    _individual: IndividualResults;
    _aggregated: DNSDumpsterAggregatedResult;
}
declare class DNSDumpsterStage {
    private plugin;
    private commandRunner;
    private config;
    private _httpClient;
    constructor(plugin: ReconPlugin$3);
    private _getHttpClient;
    execute(target: Target$3, options?: DNSDumpsterFeatureConfig): Promise<DNSDumpsterResult>;
    getCsrfToken(baseUrl: string, options?: DNSDumpsterFeatureConfig): Promise<[string | null, string]>;
    submitQuery(baseUrl: string, domain: string, csrfToken: string, cookie: string, options?: DNSDumpsterFeatureConfig): Promise<string | null>;
    parseHtmlResponse(html: string): ParsedDNSData;
    fallbackDigLookup(host: string): Promise<{
        dnsRecords: DNSRecords;
        subdomains: string[];
        relatedDomains: string[];
    }>;
}

/**
 * GoogleDorksStage
 *
 * Search engine reconnaissance using Google Dorks
 *
 * Discovers:
 * - GitHub repositories
 * - Pastebin leaks
 * - LinkedIn employees
 * - Exposed files (PDF, DOC, XLS)
 * - Subdomains
 * - Login pages
 * - Exposed configs
 *
 * Uses 100% free web scraping (no API key required)
 */

interface ReconPlugin$2 {
    commandRunner: CommandRunner;
    config: {
        curl?: {
            userAgent?: string;
        };
    };
}
interface Target$2 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
type DorkCategory = 'github' | 'pastebin' | 'linkedin' | 'documents' | 'subdomains' | 'loginPages' | 'configs' | 'errors';
interface GoogleDorksFeatureConfig {
    timeout?: number;
    categories?: DorkCategory[];
    maxResults?: number;
}
interface SearchResultItem {
    url: string;
    query?: string;
    filetype?: string;
    subdomain?: string;
}
interface CategoryResult {
    status: 'ok' | 'error';
    results?: SearchResultItem[];
    count?: number;
    message?: string;
}
interface Categories {
    github: CategoryResult | null;
    pastebin: CategoryResult | null;
    linkedin: CategoryResult | null;
    documents: CategoryResult | null;
    subdomains: CategoryResult | null;
    loginPages: CategoryResult | null;
    configs: CategoryResult | null;
    errors: CategoryResult | null;
}
interface GoogleDorksResult {
    status: string;
    domain: string;
    companyName: string;
    categories: Categories;
    summary: {
        totalResults: number;
        totalCategories: number;
    };
    _individual: Record<string, CategoryResult | null>;
    _aggregated: Omit<GoogleDorksResult, '_individual' | '_aggregated'>;
}
declare class GoogleDorksStage {
    private plugin;
    private commandRunner;
    private config;
    private _httpClient;
    constructor(plugin: ReconPlugin$2);
    private _getHttpClient;
    execute(target: Target$2, options?: GoogleDorksFeatureConfig): Promise<GoogleDorksResult>;
    searchGitHub(domain: string, companyName: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchPastebin(domain: string, companyName: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchLinkedIn(domain: string, companyName: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchDocuments(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchSubdomains(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchLoginPages(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchConfigs(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchErrors(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    performGoogleSearch(query: string, options?: GoogleDorksFeatureConfig): Promise<string[]>;
    deduplicateResults(results: SearchResultItem[]): SearchResultItem[];
    extractBaseDomain(host: string): string;
    extractCompanyName(domain: string): string;
    private sleep;
}

/**
 * ProcessManager
 *
 * Manages child processes and cleanup for ReconPlugin.
 * Ensures all spawned processes (Chrome/Puppeteer, external tools) are properly terminated
 * when the parent process exits or when operations complete.
 *
 * Key Features:
 * - Tracks all spawned child processes
 * - Automatic cleanup on process exit (SIGINT, SIGTERM, uncaughtException)
 * - Force kill orphaned processes
 * - Cleanup temporary directories (Puppeteer profiles, etc.)
 * - Prevents zombie processes
 *
 * Usage:
 * const processManager = new ProcessManager();
 * processManager.track(childProcess);
 * processManager.cleanup(); // Manual cleanup
 */

interface TrackOptions {
    name?: string;
    tempDir?: string;
}
interface ProcessInfo {
    pid: number;
    name: string;
    uptime: number;
}
interface CleanupOptions {
    force?: boolean;
    silent?: boolean;
}
declare class ProcessManager {
    private processes;
    private tempDirs;
    private cleanupHandlersRegistered;
    private logger;
    constructor();
    track(childProcess: ChildProcess, options?: TrackOptions): void;
    trackTempDir(dirPath: string): void;
    private _removeProcess;
    private _setupCleanupHandlers;
    cleanup(options?: CleanupOptions): Promise<void>;
    private _killProcess;
    private _isProcessRunning;
    private _waitForProcessExit;
    private _cleanupTempDir;
    private _cleanupOrphanedPuppeteer;
    getProcessCount(): number;
    getProcesses(): ProcessInfo[];
    forceCleanup(): Promise<void>;
}

/**
 * UptimeBehavior
 *
 * Monitors target availability and calculates uptime metrics:
 * - Periodic health checks (ping, HTTP, DNS)
 * - Uptime percentage calculation
 * - Downtime detection and alerting
 * - Historical availability tracking
 *
 * Usage:
 * ```typescript
 * const plugin = new ReconPlugin({
 *   behaviors: {
 *     uptime: {
 *       enabled: true,
 *       interval: 60000,        // Check every 60 seconds
 *       methods: ['ping', 'http', 'dns'],
 *       alertOnDowntime: true,
 *       downtimeThreshold: 3    // 3 failed checks = downtime
 *     }
 *   }
 * });
 * ```
 */
type CheckMethod = 'ping' | 'http' | 'dns';
interface UptimeBehaviorConfig {
    enabled?: boolean;
    checkInterval?: number;
    aggregationInterval?: number;
    methods?: CheckMethod[];
    alertOnDowntime?: boolean;
    downtimeThreshold?: number;
    timeout?: number;
    retainHistory?: number;
    persistRawChecks?: boolean;
}
interface Target$1 {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
interface LatencyStats {
    avg: string;
    min: string;
    max: string;
    samples: number;
}
interface MinuteRecord {
    minuteCohort: string;
    timestamp: string;
    sampleCount: number;
    successCount: number;
    failCount: number;
    uptimePercent: string;
    avgLatencies: Record<string, LatencyStats>;
    overallStatus: 'up' | 'down';
}
interface UptimeStatus {
    host: string;
    status: 'unknown' | 'up' | 'down';
    uptimePercentage: string;
    totalChecks: number;
    successfulChecks: number;
    failedChecks: number;
    lastCheck: string | null;
    lastUp: string | null;
    lastDown: string | null;
    consecutiveFails: number;
    consecutiveSuccess: number;
    isDown: boolean;
    recentHistory: MinuteRecord[];
}
interface ReconPlugin$1 {
    emit: (event: string, data: any) => void;
    getStorage: () => any;
    namespace?: string;
}
declare class UptimeBehavior {
    private plugin;
    private config;
    private checks;
    private checkIntervals;
    private aggregationIntervals;
    private minuteBuffer;
    private logger;
    constructor(plugin: ReconPlugin$1, config?: UptimeBehaviorConfig);
    startMonitoring(target: Target$1): Promise<UptimeStatus | null>;
    stopMonitoring(host: string): void;
    getStatus(host: string): UptimeStatus | null;
    getAllStatuses(): UptimeStatus[];
    private _performCheck;
    private _aggregateMinute;
    private _extractMinuteCohort;
    private _calculateAverageLatencies;
    private _extractLatency;
    private _checkPing;
    private _checkHttp;
    private _checkDns;
    private _handleTransition;
    private _sendDowntimeAlert;
    private _pruneHistory;
    private _persistStatus;
    private _persistTransition;
    private _persistMinuteCohort;
    private _persistRawCheck;
    loadStatus(host: string): Promise<any>;
    linkReportToUptime(host: string, reportId: string, reportTimestamp: string): Promise<void>;
    cleanup(): void;
}

/**
 * ReconPlugin - Modular Refactored Version
 *
 * Main orchestrator that coordinates managers, stages, and concerns.
 * Backward compatible with the original monolithic API.
 *
 * Architecture:
 * - Managers: Handle high-level operations (storage, targets, scheduling, dependencies)
 * - Stages: Execute individual reconnaissance tasks (DNS, ports, subdomains, etc.)
 * - Concerns: Shared utilities (command runner, normalizer, report generator, etc.)
 */

interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
    original?: string;
}
interface ScanFeatures {
    dns?: boolean | Record<string, any>;
    certificate?: boolean | Record<string, any>;
    whois?: boolean | Record<string, any>;
    latency?: boolean | Record<string, any>;
    http?: boolean | Record<string, any>;
    ports?: boolean | Record<string, any>;
    subdomains?: boolean | Record<string, any>;
    webDiscovery?: boolean | Record<string, any>;
    vulnerability?: boolean | Record<string, any>;
    tlsAudit?: boolean | Record<string, any>;
    fingerprint?: boolean | Record<string, any>;
    screenshot?: boolean | Record<string, any>;
    osint?: boolean | Record<string, any>;
    secrets?: boolean | Record<string, any>;
    asn?: boolean | Record<string, any>;
    dnsdumpster?: boolean | Record<string, any>;
    googleDorks?: boolean | Record<string, any>;
}
interface ReconConfig {
    behavior?: string;
    behaviorOverrides?: {
        features?: Partial<ScanFeatures>;
    };
    features?: Partial<ScanFeatures>;
    storage?: {
        enabled?: boolean;
        [key: string]: any;
    };
    scheduler?: {
        enabled?: boolean;
        [key: string]: any;
    };
    behaviors?: {
        uptime?: UptimeBehaviorConfig;
    };
    resources?: {
        persist?: boolean;
        [key: string]: any;
    };
    rateLimit?: {
        enabled?: boolean;
        delayBetweenStages?: number;
        requestsPerMinute?: number;
    };
    [key: string]: any;
}
interface ScanReport {
    id: string;
    timestamp: string;
    target: Target;
    duration: number;
    status: 'completed' | 'error';
    results: Record<string, any>;
    fingerprint: Record<string, any>;
    uptime: {
        status: string;
        uptimePercentage: string;
        lastCheck: string | null;
        isDown: boolean;
        consecutiveFails: number;
    } | null;
}
interface DiffResult {
    added: string[];
    removed: string[];
    changed: Record<string, {
        old: any;
        new: any;
    }>;
}
interface SecurityAudit {
    findings: any[];
    recommendations: string[];
    score: number;
}
interface Stages {
    dns: DnsStage;
    certificate: CertificateStage;
    latency: LatencyStage;
    http: HttpStage;
    ports: PortsStage;
    subdomains: SubdomainsStage;
    webDiscovery: WebDiscoveryStage;
    vulnerability: VulnerabilityStage;
    tlsAudit: TlsAuditStage;
    fingerprint: FingerprintStage;
    screenshot: ScreenshotStage;
    osint: OsintStage;
    whois: WhoisStage;
    secrets: SecretsStage;
    asn: ASNStage;
    dnsdumpster: DNSDumpsterStage;
    googleDorks: GoogleDorksStage;
}
declare class ReconPlugin extends Plugin {
    static pluginName: string;
    config: ReconConfig;
    commandRunner: CommandRunner;
    processManager: ProcessManager;
    storageManager: StorageManager | null;
    targetManager: TargetManager | null;
    schedulerManager: SchedulerManager | null;
    dependencyManager: DependencyManager;
    stages: Stages;
    uptimeBehavior?: UptimeBehavior;
    constructor(config?: ReconConfig);
    initialize(): Promise<void>;
    private _applyRateLimit;
    cleanup(): Promise<void>;
    scan(target: string | Target, options?: Partial<ScanFeatures>): Promise<ScanReport>;
    batchScan(targets: (string | Target)[], options?: Partial<ScanFeatures>): Promise<(ScanReport | {
        target: string;
        status: 'error';
        error: string;
    })[]>;
    getReport(reportId: string): Promise<ScanReport | null>;
    listReports(options?: Record<string, any>): Promise<ScanReport[]>;
    getReportsByHost(host: string, options?: Record<string, any>): Promise<ScanReport[]>;
    compareReports(reportId1: string, reportId2: string): Promise<DiffResult | null>;
    generateMarkdownReport(report: ScanReport): string;
    generateJSONReport(report: ScanReport): string;
    generateHTMLReport(report: ScanReport): string;
    generateExecutiveSummary(report: ScanReport): string;
    generateSecurityAudit(report: ScanReport): SecurityAudit;
    generateSecurityAuditMarkdown(report: ScanReport): string;
    addTarget(target: string | Target, schedule?: string | null): Promise<any>;
    removeTarget(targetId: string): Promise<boolean>;
    listTargets(): Promise<any[]>;
    updateTargetSchedule(targetId: string, schedule: string): Promise<any>;
    getToolStatus(): Promise<Record<string, boolean>>;
    isToolAvailable(toolName: string): Promise<boolean>;
    runScheduledSweep(): Promise<any>;
    getLatestDiff(host: string): Promise<DiffResult | null>;
    getFingerprint(host: string): Promise<Record<string, any> | null>;
    private _generateReportId;
    startUptimeMonitoring(target: string | Target): Promise<UptimeStatus | null>;
    stopUptimeMonitoring(host: string): void;
    getUptimeStatus(host: string): UptimeStatus | null;
    getAllUptimeStatuses(): UptimeStatus[];
    loadUptimeStatus(host: string): Promise<any>;
    onStop(): Promise<void>;
    onUninstall(options?: Record<string, any>): Promise<void>;
    afterUninstall(): void;
}

interface Logger$3 {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Resource$1 {
    name: string;
    attributes: Record<string, string | AttributeDefinition>;
    config: ResourceConfig$1;
    _geoConfig?: GeoResourceConfig;
    addHook(event: string, handler: (data: Record<string, unknown>) => Promise<Record<string, unknown>>): void;
    updateAttributes(attributes: Record<string, string | AttributeDefinition>): void;
    setupPartitionHooks(): void;
    get(id: string): Promise<Record<string, unknown> | null>;
    list(options?: ListOptions): Promise<Record<string, unknown>[]>;
    listPartition(options: ListPartitionOptions): Promise<Record<string, unknown>[]>;
    findNearby?(options: FindNearbyOptions): Promise<Array<Record<string, unknown> & {
        _distance: number;
    }>>;
    findInBounds?(options: FindInBoundsOptions): Promise<Record<string, unknown>[]>;
    getDistance?(id1: string, id2: string): Promise<DistanceResult>;
}
interface AttributeDefinition {
    type?: string;
    optional?: boolean;
    [key: string]: unknown;
}
interface ResourceConfig$1 {
    partitions?: Record<string, PartitionConfig$1>;
    [key: string]: unknown;
}
interface PartitionConfig$1 {
    fields: Record<string, string>;
}
interface ListOptions {
    limit?: number;
}
interface ListPartitionOptions {
    partition: string;
    partitionValues: Record<string, string>;
    limit?: number;
}
interface FindNearbyOptions {
    lat: number;
    lon: number;
    radius?: number;
    limit?: number;
}
interface FindInBoundsOptions {
    north: number;
    south: number;
    east: number;
    west: number;
    limit?: number;
}
interface DistanceResult {
    distance: number;
    unit: string;
    from: string;
    to: string;
}
interface GeohashDecodeResult {
    latitude: number;
    longitude: number;
    error: {
        latitude: number;
        longitude: number;
    };
}
interface GeoResourceConfig {
    latField: string;
    lonField: string;
    precision: number;
    addGeohash?: boolean;
    usePartitions?: boolean;
    zoomLevels?: number[];
}
interface GeoPluginOptions {
    resources?: Record<string, GeoResourceConfig>;
    logger?: Logger$3;
    logLevel?: string;
}
interface GeoStats {
    resources: number;
    configurations: Array<{
        resource: string;
        latField: string;
        lonField: string;
        precision: number;
        cellSize: string;
    }>;
}
interface GetGeohashesInBoundsOptions {
    north: number;
    south: number;
    east: number;
    west: number;
    precision: number;
}
declare class GeoPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    resources: Record<string, GeoResourceConfig>;
    base32: string;
    constructor(options?: GeoPluginOptions);
    install(database: Database$a): Promise<void>;
    _setupResource(resourceName: string, config: GeoResourceConfig): Promise<void>;
    _setupPartitions(resource: Resource$1, config: GeoResourceConfig): Promise<void>;
    _addHooks(resource: Resource$1, config: GeoResourceConfig): void;
    _addHelperMethods(resource: Resource$1, config: GeoResourceConfig): void;
    encodeGeohash(latitude: number, longitude: number, precision?: number): string;
    decodeGeohash(geohash: string): GeohashDecodeResult;
    calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number;
    getNeighbors(geohash: string): string[];
    _getGeohashesInBounds({ north, south, east, west, precision }: GetGeohashesInBoundsOptions): string[];
    _toRadians(degrees: number): number;
    _getPrecisionDistance(precision: number): number;
    _selectOptimalZoom(zoomLevels: number[], radiusKm: number): number | null;
    getStats(): GeoStats;
    uninstall(): Promise<void>;
}

interface Logger$2 {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Database {
    createResource(config: ResourceConfig): Promise<Resource>;
    resources: Record<string, Resource>;
    addHook(event: string, handler: HookHandler): void;
    removeHook(event: string, handler: HookHandler): void;
    uploadMetadataFile?(): Promise<void>;
}
interface Resource {
    name: string;
    get(id: string): Promise<Record<string, unknown>>;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    patch(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    query(filter: Record<string, unknown>, options?: QueryOptions): Promise<Array<Record<string, unknown>>>;
    page(options: PageOptions): Promise<Array<Record<string, unknown>> | {
        items: Array<Record<string, unknown>>;
    }>;
    count(filter?: Record<string, unknown>): Promise<number>;
    on(event: string, handler: EventHandler): void;
    off(event: string, handler: EventHandler): void;
    addHook(hook: string, handler: HookHandler): void;
    _replicatorDefaultsInstalled?: boolean;
}
interface ResourceConfig {
    name: string;
    attributes: Record<string, string>;
    behavior?: string;
    partitions?: Record<string, PartitionConfig>;
}
interface PartitionConfig {
    fields: Record<string, string>;
}
interface QueryOptions {
    limit?: number;
    offset?: number;
}
interface PageOptions {
    offset: number;
    size: number;
}
type EventHandler = (...args: unknown[]) => void | Promise<void>;
type HookHandler = (data: unknown) => unknown | Promise<unknown>;
interface Replicator {
    id: string;
    name?: string;
    driver: string;
    config: Record<string, unknown>;
    initialize(database: Database): Promise<void>;
    replicate(resourceName: string, operation: string, data: Record<string, unknown> | null, recordId: string, beforeData?: Record<string, unknown> | null): Promise<unknown>;
    shouldReplicateResource(resourceName: string, operation?: string): boolean;
    getStatus(): Promise<ReplicatorStatus$1>;
    stop?(): Promise<void>;
}
interface ReplicatorStatus$1 {
    healthy: boolean;
    lastSync?: Date;
    errorCount?: number;
}
interface ReplicatorConfig {
    driver: string;
    config?: Record<string, unknown>;
    resources: ResourcesDefinition;
    client?: unknown;
    queueUrlDefault?: string;
}
type ResourcesDefinition = string[] | Record<string, string | ResourceMapping | TransformFn>;
interface ResourceMapping {
    resource: string;
    transform?: TransformFn;
}
type TransformFn = (data: Record<string, unknown>) => Record<string, unknown>;
interface ReplicatorPluginConfig {
    replicators: ReplicatorConfig[];
    logErrors: boolean;
    persistReplicatorLog: boolean;
    enabled: boolean;
    batchSize: number;
    maxRetries: number;
    timeout: number;
    logLevel?: string;
    replicatorConcurrency: number;
    stopConcurrency: number;
    logResourceName: string;
}
interface ReplicatorStats {
    totalReplications: number;
    totalErrors: number;
    lastSync: string | null;
}
interface ReplicatorItem {
    id?: string;
    resourceName: string;
    operation: string;
    recordId: string;
    data?: Record<string, unknown> | null;
    beforeData?: Record<string, unknown> | null;
    replicator?: string;
    resource?: string;
    action?: string;
    status?: string;
    error?: string | null;
    retryCount?: number;
    timestamp?: number;
    createdAt?: string;
}
interface PromiseOutcome {
    status: 'fulfilled' | 'rejected';
    value?: unknown;
    reason?: Error;
}
interface ReplicatorLogsOptions {
    resourceName?: string;
    operation?: string;
    status?: string;
    limit?: number;
    offset?: number;
}
interface ReplicatorPluginOptions {
    replicators?: ReplicatorConfig[];
    resourceNames?: {
        log?: string;
    };
    replicatorConcurrency?: number;
    stopConcurrency?: number;
    logErrors?: boolean;
    persistReplicatorLog?: boolean;
    enabled?: boolean;
    batchSize?: number;
    maxRetries?: number;
    timeout?: number;
    replicatorLogResource?: string;
    resourceFilter?: (resourceName: string) => boolean;
    resourceAllowlist?: string[];
    resourceBlocklist?: string[];
    logLevel?: string;
    logger?: Logger$2;
    [key: string]: unknown;
}
declare class ReplicatorPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: ReplicatorPluginConfig;
    _logResourceDescriptor: {
        defaultName: string;
        override?: string;
    };
    logResourceName: string;
    resourceFilter: (resourceName: string) => boolean;
    replicators: Replicator[];
    eventListenersInstalled: Set<string>;
    eventHandlers: Map<string, {
        inserted: EventHandler;
        updated: EventHandler;
        deleted: EventHandler;
    }>;
    stats: ReplicatorStats;
    _afterCreateResourceHook: HookHandler | null;
    replicatorLog: Resource | null;
    _logResourceHooksInstalled: boolean;
    constructor(options?: ReplicatorPluginOptions);
    private _resolveLogResourceName;
    onNamespaceChanged(): void;
    filterInternalFields(obj: unknown): Record<string, unknown>;
    prepareReplicationData(resource: Resource, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    sanitizeBeforeData(beforeData: unknown): Record<string, unknown> | null;
    getCompleteData(resource: Resource, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    installEventListeners(resource: Resource, database: Database, plugin: ReplicatorPlugin): void;
    onInstall(): Promise<void>;
    start(): Promise<void>;
    installDatabaseHooks(): void;
    removeDatabaseHooks(): void;
    installReplicatorLogHooks(): void;
    createReplicator(driver: string, config: Record<string, unknown>, resources: ResourcesDefinition, client?: unknown): Promise<Replicator>;
    initializeReplicators(database: Database): Promise<void>;
    uploadMetadataFile(database: Database): Promise<void>;
    retryWithBackoff<T>(operation: () => Promise<T>, maxRetries?: number): Promise<T>;
    private _generateLogEntryId;
    private _normalizeLogEntry;
    logError(replicator: Replicator, resourceName: string, operation: string, recordId: string, data: Record<string, unknown> | null, error: Error): Promise<void>;
    processReplicatorEvent(operation: string, resourceName: string, recordId: string, data: Record<string, unknown> | null, beforeData?: Record<string, unknown> | null): Promise<PromiseOutcome[] | undefined>;
    processReplicatorItem(item: ReplicatorItem): Promise<PromiseOutcome[] | undefined>;
    logReplicator(item: ReplicatorItem): Promise<void>;
    updateReplicatorLog(logId: string, updates: Record<string, unknown>): Promise<void>;
    getReplicatorStats(): Promise<{
        replicators: Array<{
            id: string;
            driver: string;
            config: Record<string, unknown>;
            status: ReplicatorStatus$1;
        }>;
        stats: ReplicatorStats;
        lastSync: string | null;
    }>;
    getReplicatorLogs(options?: ReplicatorLogsOptions): Promise<Array<Record<string, unknown>>>;
    retryFailedReplicators(): Promise<{
        retried: number;
    }>;
    syncAllData(replicatorId: string): Promise<void>;
    stop(): Promise<void>;
    private _buildResourceFilter;
    private _shouldManageResource;
    private _filterResourcesDefinition;
    private _resourcesDefinitionIsEmpty;
}

interface Logger$1 {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Consumer {
    start(): Promise<void>;
    stop(): Promise<void>;
}
interface ConsumerDefinition {
    resources: string | string[];
    queueUrl?: string;
    queueName?: string;
    [key: string]: unknown;
}
interface DriverDefinition {
    driver: string;
    config?: Record<string, unknown>;
    consumers?: ConsumerDefinition[];
}
interface QueueMessage {
    resource?: string;
    action?: string;
    data?: Record<string, unknown>;
    $body?: QueueMessage;
}
interface QueueConsumerPluginOptions {
    consumers?: DriverDefinition[];
    startConcurrency?: number;
    stopConcurrency?: number;
    logger?: Logger$1;
    logLevel?: string;
}
declare class QueueConsumerPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    driversConfig: DriverDefinition[];
    consumers: Consumer[];
    startConcurrency: number;
    stopConcurrency: number;
    constructor(options?: QueueConsumerPluginOptions);
    onInstall(): Promise<void>;
    stop(): Promise<void>;
    _handleMessage(msg: QueueMessage, configuredResource: string): Promise<unknown>;
    _handleError(_err: Error, _raw: unknown, _resourceName: string): void;
}

/**
 * HealthManager - Manages health check endpoints for WebSocket plugin
 *
 * Provides Kubernetes-compatible health endpoints via HTTP:
 * - /health - Generic health check
 * - /health/live - Liveness probe (is app alive?)
 * - /health/ready - Readiness probe (is app ready for traffic?)
 *
 * Supports custom health checks for external dependencies (database, redis, etc.)
 */

interface HealthConfig {
    enabled?: boolean;
    readiness?: {
        checks?: HealthCheck[];
    };
}
interface HealthCheckResult$1 {
    status: 'healthy' | 'unhealthy';
    latency_ms?: number;
    error?: string;
    [key: string]: any;
}
interface HealthCheck {
    name: string;
    check: () => Promise<HealthCheckResult$1 | {
        healthy: boolean;
        [key: string]: any;
    }>;
    optional?: boolean;
    timeout?: number;
}
declare class HealthManager {
    private database;
    private wsServer;
    private healthConfig;
    private logLevel?;
    private logger;
    constructor({ database, wsServer, healthConfig, logLevel, logger }: {
        database: Database$a;
        wsServer: WebSocketServer;
        healthConfig?: HealthConfig;
        logLevel?: string;
        logger?: any;
    });
    /**
     * Handle HTTP request for health endpoints
     * @param req
     * @param res
     * @returns - true if handled, false otherwise
     */
    handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
    /**
     * Liveness probe - checks if app is alive
     * If this fails, Kubernetes will restart the pod
     * @private
     */
    private _handleLiveness;
    /**
     * Readiness probe - checks if app is ready to receive traffic
     * If this fails, Kubernetes will remove pod from service endpoints
     * @private
     */
    private _handleReadiness;
    /**
     * Generic health check
     * @private
     */
    private _handleGeneric;
}

/**
 * ChannelManager - Manages channels, rooms, and presence for WebSocket plugin
 *
 * Implements channel types:
 * - public-* : Anyone can join, no auth required
 * - private-* : Requires authorization via guard
 * - presence-* : Private + tracks online members with metadata
 *
 * Features:
 * - Join/leave channels
 * - Member presence tracking
 * - Channel-scoped messaging
 * - Member metadata (name, avatar, etc.)
 */

interface ChannelManagerConfig {
    database: Database$a;
    authGuard?: Record<string, Function>;
    logLevel?: string;
    logger?: any;
}
interface MemberInfo {
    id: string;
    clientId: string;
    joinedAt: string;
    name?: string;
    avatar?: string;
    [key: string]: any;
}
interface ChannelState {
    type: 'public' | 'private' | 'presence';
    members: Map<string, MemberInfo>;
    createdAt: string;
    metadata?: Record<string, any>;
}
declare class ChannelManager {
    private database;
    private authGuard;
    private logLevel?;
    private logger;
    private channels;
    private clientChannels;
    constructor({ database, authGuard, logLevel, logger }: ChannelManagerConfig);
    /**
     * Get channel type from name
     * @private
     */
    private _getChannelType;
    /**
     * Check if client is authorized to join channel
     * @private
     */
    private _authorizeJoin;
    /**
     * Join a channel
     * @param clientId - Client identifier
     * @param channelName - Channel name (public-*, private-*, presence-*)
     * @param user - Authenticated user object (can be null)
     * @param userInfo - Custom member info for presence channels
     * @returns - { success, channel, members?, error? }
     */
    join(clientId: string, channelName: string, user: any, userInfo?: any): Promise<any>;
    /**
     * Leave a channel
     * @param clientId - Client identifier
     * @param channelName - Channel name
     * @returns - { success, channel, member? }
     */
    leave(clientId: string, channelName: string): any;
    /**
     * Remove client from all channels (on disconnect)
     * @param clientId - Client identifier
     * @returns - List of { channel, member } for each left channel
     */
    leaveAll(clientId: string): Array<{
        channel: string;
        member?: MemberInfo;
    }>;
    /**
     * Get members of a channel
     * @param channelName - Channel name
     * @returns - List of member info objects
     */
    getMembers(channelName: string): MemberInfo[];
    /**
     * Get member count of a channel
     * @param channelName - Channel name
     * @returns
     */
    getMemberCount(channelName: string): number;
    /**
     * Get all clients in a channel (for broadcasting)
     * @param channelName - Channel name
     * @returns - List of client IDs
     */
    getChannelClients(channelName: string): string[];
    /**
     * Check if client is in channel
     * @param clientId - Client identifier
     * @param channelName - Channel name
     * @returns
     */
    isInChannel(clientId: string, channelName: string): boolean;
    /**
     * Get all channels a client is in
     * @param clientId - Client identifier
     * @returns - List of channel names
     */
    getClientChannels(clientId: string): string[];
    /**
     * Get channel info
     * @param channelName - Channel name
     * @returns
     */
    getChannelInfo(channelName: string): ChannelState | null;
    /**
     * List all channels
     * @param options - { type?: string, prefix?: string }
     * @returns
     */
    listChannels(options?: {
        type?: string;
        prefix?: string;
    }): any[];
    /**
     * Update member info (for presence channels)
     * @param clientId - Client identifier
     * @param channelName - Channel name
     * @param userInfo - Updated user info
     * @returns
     */
    updateMemberInfo(clientId: string, channelName: string, userInfo: any): any;
    /**
     * Get stats
     * @returns
     */
    getStats(): any;
}

/**
 * WebSocket Server - Real-time connection manager for s3db.js resources
 *
 * Handles WebSocket connections, subscriptions, broadcasts, and authentication.
 *
 * @example
 * const server = new WebSocketServer({
 *   port: 3001,
 *   database,
 *   auth: { jwt: { secret: 'my-secret' } }
 * });
 * await server.start();
 */

interface WebSocketAuthDriver {
    driver: 'jwt' | 'apiKey';
    config?: any;
}
interface WebSocketAuth {
    drivers?: WebSocketAuthDriver[];
    required?: boolean;
}
interface WebSocketResourceConfig {
    auth?: string[] | Record<string, any>;
    protected?: string[];
    guard?: {
        get?: Function;
        list?: Function;
        create?: Function;
        update?: Function;
        delete?: Function;
    };
    publishAuth?: string[] | Record<string, any>;
}
interface WebSocketOptions {
    port?: number;
    host?: string;
    database: Database$a;
    namespace?: string;
    logger?: any;
    logLevel?: string;
    auth?: WebSocketAuth;
    resources?: Record<string, WebSocketResourceConfig>;
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
    maxPayloadSize?: number;
    rateLimit?: {
        enabled: boolean;
        windowMs?: number;
        maxRequests?: number;
    };
    cors?: {
        enabled: boolean;
        origin?: string;
    };
    startupBanner?: boolean;
    health?: {
        enabled?: boolean;
        [key: string]: any;
    };
    channels?: {
        enabled?: boolean;
        guards?: Record<string, Function>;
    };
    messageHandlers?: Record<string, Function>;
}
interface ClientInfo {
    ws: any;
    user: any | null;
    subscriptions: Set<string>;
    connectedAt: string;
    lastActivity: number;
    metadata: {
        ip?: string;
        userAgent?: string;
    };
}
declare class WebSocketServer extends EventEmitter$2 {
    port: number;
    host: string;
    database: Database$a;
    namespace?: string;
    logger: any;
    logLevel?: string;
    auth: WebSocketAuth;
    resources: Record<string, WebSocketResourceConfig>;
    heartbeatInterval: number;
    heartbeatTimeout: number;
    maxPayloadSize: number;
    rateLimit: {
        enabled: boolean;
        windowMs?: number;
        maxRequests?: number;
    };
    cors: {
        enabled: boolean;
        origin?: string;
    };
    startupBanner: boolean;
    health: {
        enabled?: boolean;
        [key: string]: any;
    };
    channels: {
        enabled?: boolean;
        guards?: Record<string, Function>;
    };
    wss: any | null;
    httpServer: http.Server | null;
    clients: Map<string, ClientInfo>;
    subscriptions: Map<string, Set<string>>;
    heartbeatTimers: Map<string, {
        ping: NodeJS.Timeout;
        timeout: NodeJS.Timeout | null;
    }>;
    rateLimitState: Map<string, {
        count: number;
        windowStart: number;
    }>;
    _resourceListeners: Map<string, Function>;
    healthManager: HealthManager | null;
    channelManager: ChannelManager | null;
    metrics: {
        connections: number;
        disconnections: number;
        messagesReceived: number;
        messagesSent: number;
        broadcasts: number;
        errors: number;
    };
    constructor(options: WebSocketOptions);
    /**
     * Start WebSocket server
     */
    start(): Promise<void>;
    /**
     * Stop WebSocket server
     */
    stop(): Promise<void>;
    /**
     * Verify client connection (authentication)
     * @private
     */
    private _verifyClient;
    /**
     * Validate authentication token
     * @private
     */
    private _validateToken;
    /**
     * Handle new WebSocket connection
     * @private
     */
    private _handleConnection;
    /**
     * Handle incoming message
     * @private
     */
    private _handleMessage;
    /**
     * Handle subscribe request
     * @private
     */
    private _handleSubscribe;
    /**
     * Handle unsubscribe request
     * @private
     */
    private _handleUnsubscribe;
    /**
     * Handle publish request (custom message to subscribers)
     * @private
     */
    private _handlePublish;
    /**
     * Handle get request
     * @private
     */
    private _handleGet;
    /**
     * Handle list request
     * @private
     */
    private _handleList;
    /**
     * Handle insert request
     * @private
     */
    private _handleInsert;
    /**
     * Handle update request
     * @private
     */
    private _handleUpdate;
    /**
     * Handle delete request
     * @private
     */
    private _handleDelete;
    /**
     * Handle join channel request
     * @private
     */
    private _handleJoinChannel;
    /**
     * Handle leave channel request
     * @private
     */
    private _handleLeaveChannel;
    /**
     * Handle channel message (broadcast to channel members)
     * @private
     */
    private _handleChannelMessage;
    /**
     * Handle channel update (update member info in presence channel)
     * @private
     */
    private _handleChannelUpdate;
    /**
     * Broadcast message to all members in a channel
     */
    _broadcastToChannel(channelName: string, message: any, excludeClientId?: string | null): number;
    /**
     * Handle client disconnect
     * @private
     */
    private _handleDisconnect;
    /**
     * Setup heartbeat for client
     * @private
     */
    private _setupHeartbeat;
    /**
     * Setup resource event listeners for broadcasting
     * @private
     */
    private _setupResourceListeners;
    /**
     * Remove resource event listeners
     * @private
     */
    private _removeResourceListeners;
    /**
     * Broadcast resource event to subscribers
     * @private
     */
    private _broadcastResourceEvent;
    /**
     * Check if data matches client's subscription filter
     * @private
     */
    private _matchesSubscriptionFilter;
    /**
     * Filter protected fields from data
     * @private
     */
    private _filterProtectedFields;
    /**
     * Check resource authorization
     * @private
     */
    private _checkResourceAuth;
    /**
     * Check rate limit
     * @private
     */
    private _checkRateLimit;
    /**
     * Send message to client
     * @private
     */
    private _send;
    /**
     * Broadcast message to all clients
     */
    broadcast(message: any, filter?: ((client: ClientInfo) => boolean) | null): void;
    /**
     * Send message to specific client
     */
    sendToClient(clientId: string, message: any): boolean;
    /**
     * Get server info
     */
    getInfo(): any;
    /**
     * Get connected clients
     */
    getClients(): any[];
}

/**
 * WebSocket Plugin - Real-time communication for s3db.js resources
 *
 * Provides WebSocket server with real-time subscriptions, broadcasts, and CRUD operations.
 *
 * Features:
 * - Real-time subscriptions to resource changes (insert/update/delete)
 * - Multiple authentication methods (JWT, API Key)
 * - Guards for row-level security
 * - Protected fields filtering
 * - Rate limiting
 * - Heartbeat/ping-pong for connection health
 * - Custom message publishing
 *
 * @example
 * const wsPlugin = new WebSocketPlugin({
 *   port: 3001,
 *   auth: {
 *     drivers: [{ driver: 'jwt', config: { secret: 'my-secret' } }]
 *   },
 *   resources: {
 *     users: {
 *       auth: ['admin', 'user'],
 *       protected: ['password', 'apiToken'],
 *       guard: {
 *         list: async (user) => user?.role === 'admin' ? true : { userId: user.id }
 *       }
 *     }
 *   }
 * });
 *
 * await database.usePlugin(wsPlugin);
 */

declare class WebSocketPlugin extends Plugin {
    config: WebSocketOptions;
    server: WebSocketServer | null;
    constructor(options?: Partial<WebSocketOptions>);
    /**
     * Validate plugin dependencies
     * @private
     */
    private _validateDependencies;
    /**
     * Install plugin
     */
    onInstall(): Promise<void>;
    /**
     * Start plugin
     */
    onStart(): Promise<void>;
    /**
     * Check if port is available
     * @private
     */
    private _checkPortAvailability;
    /**
     * Stop plugin
     */
    onStop(): Promise<void>;
    /**
     * Uninstall plugin
     */
    onUninstall(options?: any): Promise<void>;
    /**
     * Get server information
     */
    getServerInfo(): any;
    /**
     * Get connected clients
     */
    getClients(): any[];
    /**
     * Broadcast message to all connected clients
     * @param message - Message to broadcast
     * @param filter - Optional filter function (client) => boolean
     */
    broadcast(message: any, filter?: ((client: any) => boolean) | null): void;
    /**
     * Send message to specific client
     * @param clientId - Client ID
     * @param message - Message to send
     */
    sendToClient(clientId: string, message: any): boolean;
    /**
     * Broadcast to clients subscribed to a specific resource
     * @param resource - Resource name
     * @param message - Message to send
     */
    broadcastToResource(resource: string, message: any): void;
    /**
     * Get metrics
     */
    getMetrics(): any;
    /**
     * Get channel info
     * @param channelName - Channel name
     * @returns
     */
    getChannel(channelName: string): any | null;
    /**
     * List all channels
     * @param options - { type?: 'public'|'private'|'presence', prefix?: string }
     * @returns
     */
    listChannels(options?: {
        type?: 'public' | 'private' | 'presence';
        prefix?: string;
    }): any[];
    /**
     * Get members in a presence channel
     * @param channelName - Channel name
     * @returns
     */
    getChannelMembers(channelName: string): any[];
    /**
     * Broadcast message to all members in a channel
     * @param channelName - Channel name
     * @param message - Message to broadcast
     * @param excludeClientId - Optional client to exclude
     */
    broadcastToChannel(channelName: string, message: any, excludeClientId?: string | null): number;
    /**
     * Get channel statistics
     * @returns
     */
    getChannelStats(): any;
}

type PluginClass = new (...args: unknown[]) => unknown;
declare const lazyLoadPlugin: (pluginName: string) => Promise<PluginClass>;
declare const loadApiPlugin: () => Promise<PluginClass>;
declare const loadIdentityPlugin: () => Promise<PluginClass>;
declare const loadBackupPlugin: () => Promise<PluginClass>;
declare const loadCookieFarmPlugin: () => Promise<PluginClass>;
declare const loadCookieFarmSuitePlugin: () => Promise<PluginClass>;
declare const loadGeoPlugin: () => Promise<PluginClass>;
declare const loadMLPlugin: () => Promise<PluginClass>;
declare const loadPuppeteerPlugin: () => Promise<PluginClass>;
declare const loadSpiderPlugin: () => Promise<PluginClass>;
declare const loadCloudInventoryPlugin: () => Promise<PluginClass>;
declare const loadReplicatorPlugin: () => Promise<PluginClass>;
declare const loadReconPlugin: () => Promise<PluginClass>;
declare const loadKubernetesInventoryPlugin: () => Promise<PluginClass>;
declare const loadSMTPPlugin: () => Promise<PluginClass>;
declare const loadQueueConsumerPlugin: () => Promise<PluginClass>;
declare const loadWebSocketPlugin: () => Promise<PluginClass>;

interface ReplicationErrorDetails {
    replicatorClass?: string;
    operation?: string;
    resourceName?: string;
    description?: string;
    [key: string]: unknown;
}
declare class ReplicationError extends S3dbError {
    constructor(message: string, details?: ReplicationErrorDetails);
}

interface BaseReplicatorConfig {
    enabled?: boolean;
    batchConcurrency?: number;
    logLevel?: string | false;
    logger?: Logger$j;
    [key: string]: unknown;
}
interface ReplicatorStatus {
    name: string;
    config: BaseReplicatorConfig;
    connected: boolean;
    [key: string]: unknown;
}
interface BatchProcessOptions {
    concurrency?: number;
    mapError?: (error: Error, record: unknown) => unknown;
}
interface BatchProcessResult<T = unknown> {
    results: T[];
    errors: Array<{
        record: unknown;
        error: Error;
    } | unknown>;
}
interface ValidationResult {
    isValid: boolean;
    errors: string[];
}
interface ErrorDetails {
    operation?: string;
    resourceName?: string;
    statusCode?: number;
    retriable?: boolean;
    suggestion?: string;
    description?: string;
    docs?: string;
    hint?: string;
    metadata?: unknown;
    [key: string]: unknown;
}
interface DatabaseLike$1 {
    [key: string]: unknown;
}
declare class BaseReplicator extends EventEmitter$1 {
    config: BaseReplicatorConfig;
    name: string;
    enabled: boolean;
    batchConcurrency: number;
    logger: Logger$j;
    database: DatabaseLike$1 | null;
    constructor(config?: BaseReplicatorConfig);
    initialize(database: DatabaseLike$1): Promise<void>;
    replicate(resourceName: string, operation: string, data: unknown, id: string): Promise<unknown>;
    replicateBatch(resourceName: string, records: unknown[]): Promise<unknown>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus>;
    cleanup(): Promise<void>;
    setBatchConcurrency(value: number): void;
    processBatch<T = unknown, R = unknown>(records: T[] | undefined, handler: (record: T) => Promise<R>, { concurrency, mapError }?: BatchProcessOptions): Promise<BatchProcessResult<R>>;
    createError(message: string, details?: ErrorDetails): ReplicationError;
    validateConfig(): ValidationResult;
}

interface ResourceTransformConfig {
    resource: string;
    transform?: (data: Record<string, unknown>) => Record<string, unknown>;
    actions?: string[];
}
type ResourceMapEntry = string | ResourceTransformConfig | Array<string | ResourceTransformConfig> | ((data: Record<string, unknown>) => Record<string, unknown>);
interface S3dbReplicatorConfig extends BaseReplicatorConfig {
    connectionString?: string;
    region?: string;
    keyPrefix?: string;
}
interface ReplicateInput {
    resource: string;
    operation: string;
    data: Record<string, unknown>;
    id: string;
}
interface ReplicateResult$2 {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    action?: string;
    destination?: string;
    error?: string;
    results?: unknown[];
    errors?: Array<{
        id: string;
        error: string;
    }>;
    total?: number;
}
interface ResourceLike {
    insert(data: Record<string, unknown>): Promise<unknown>;
    update(id: string, data: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<unknown>;
}
interface DatabaseLike {
    resources?: Record<string, ResourceLike>;
    connect(): Promise<void>;
    removeAllListeners(): void;
}
type ResourcesInput$2 = string | string[] | Record<string, ResourceMapEntry>;
declare class S3dbReplicator extends BaseReplicator {
    instanceId: string;
    client: DatabaseLike | null;
    connectionString: string | undefined;
    region: string | undefined;
    keyPrefix: string | undefined;
    resourcesMap: Record<string, ResourceMapEntry> | ((data: Record<string, unknown>) => Record<string, unknown>);
    targetDatabase: DatabaseLike | null;
    constructor(config?: S3dbReplicatorConfig, resources?: ResourcesInput$2, client?: DatabaseLike | null);
    private _normalizeResources;
    validateConfig(): ValidationResult;
    initialize(database: unknown): Promise<void>;
    replicate(resourceOrObj: string | ReplicateInput, operation?: string, data?: Record<string, unknown>, recordId?: string, beforeData?: unknown): Promise<ReplicateResult$2 | ReplicateResult$2[]>;
    private _replicateToSingleDestination;
    private _applyTransformer;
    private _cleanInternalFields;
    private _resolveDestResource;
    private _getDestResourceObj;
    replicateBatch(resourceName: string, records: Array<{
        operation: string;
        id: string;
        data: Record<string, unknown>;
        beforeData?: unknown;
    }>): Promise<ReplicateResult$2>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        connected: boolean;
        targetDatabase: string;
        resources: string[];
        totalreplicators: number;
        totalErrors: number;
    }>;
    cleanup(): Promise<void>;
    shouldReplicateResource(resource: string, action?: string): boolean;
}

interface WebhookAuthConfig {
    type: 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    header?: string;
    value?: string;
}
interface WebhookResourceConfig {
    name?: string;
    transform?: (data: Record<string, unknown>) => Record<string, unknown>;
    [key: string]: unknown;
}
interface WebhookReplicatorConfig extends BaseReplicatorConfig {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    retryStrategy?: 'fixed' | 'exponential';
    retryOnStatus?: number[];
    batch?: boolean;
    batchSize?: number;
    auth?: WebhookAuthConfig | null;
}
interface WebhookPayload {
    resource: string;
    action: string;
    timestamp: string;
    source: string;
    data?: unknown;
    before?: unknown;
}
interface WebhookStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    retriedRequests: number;
    totalRetries: number;
}
interface ReplicateResult$1 {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    status?: number;
    error?: string;
    total?: number;
    successful?: number;
    errors?: number;
    results?: unknown[];
}
type ResourcesInput$1 = string[] | Array<{
    name: string;
    [key: string]: unknown;
}> | Record<string, WebhookResourceConfig | boolean>;
declare class WebhookReplicator extends BaseReplicator {
    url: string;
    method: string;
    headers: Record<string, string>;
    timeout: number;
    retries: number;
    retryDelay: number;
    retryStrategy: 'fixed' | 'exponential';
    retryOnStatus: number[];
    batch: boolean;
    batchSize: number;
    auth: WebhookAuthConfig | null;
    resources: Record<string, WebhookResourceConfig | boolean>;
    stats: WebhookStats;
    private _httpClient;
    constructor(config: WebhookReplicatorConfig, resources?: ResourcesInput$1, client?: unknown);
    validateConfig(): ValidationResult;
    private _applyTransformer;
    private _cleanInternalFields;
    createPayload(resource: string, operation: string, data: unknown, id: string, beforeData?: unknown): WebhookPayload;
    private _getHttpClient;
    private _makeRequest;
    initialize(database: unknown): Promise<void>;
    replicate(resource: string, operation: string, data: Record<string, unknown>, id: string, beforeData?: unknown): Promise<ReplicateResult$1>;
    replicateBatch(resource: string, records: Array<{
        operation: string;
        data: Record<string, unknown>;
        id: string;
        beforeData?: unknown;
    }>): Promise<ReplicateResult$1>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        url: string;
        method: string;
        authType: string;
        timeout: number;
        retries: number;
        retryStrategy: string;
        batchMode: boolean;
        resources: string[];
        stats: WebhookStats;
    }>;
    shouldReplicateResource(resource: string): boolean;
}

interface SqsResourceConfig {
    name?: string;
    queueUrl?: string;
    transform?: (data: Record<string, unknown>) => Record<string, unknown>;
    [key: string]: unknown;
}
interface SqsReplicatorConfig extends BaseReplicatorConfig {
    region?: string;
    queueUrl?: string;
    queues?: Record<string, string>;
    defaultQueue?: string | null;
    messageGroupId?: string;
    deduplicationId?: boolean;
    resourceQueueMap?: Record<string, string[]> | null;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
}
interface SqsMessage {
    resource: string;
    action: string;
    timestamp: string;
    source: string;
    data?: unknown;
    before?: unknown;
}
interface ReplicateResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    error?: string;
    results?: Array<{
        queueUrl: string;
        messageId: string;
    }>;
    total?: number;
    queueUrl?: string;
    errors?: Array<{
        batch: number;
        error: string;
    }>;
}
interface SQSClientLike {
    send(command: unknown): Promise<{
        MessageId?: string;
    }>;
    destroy(): void;
}
type ResourcesInput = string[] | Array<{
    name: string;
    queueUrl?: string;
    [key: string]: unknown;
}> | Record<string, SqsResourceConfig | boolean>;
declare class SqsReplicator extends BaseReplicator {
    client: SQSClientLike | null;
    queueUrl: string | undefined;
    queues: Record<string, string>;
    defaultQueue: string | null;
    region: string;
    sqsClient: SQSClientLike | null;
    messageGroupId: string | undefined;
    deduplicationId: boolean | undefined;
    resourceQueueMap: Record<string, string[]> | null;
    resources: Record<string, SqsResourceConfig | boolean>;
    constructor(config?: SqsReplicatorConfig, resources?: ResourcesInput, client?: SQSClientLike | null);
    validateConfig(): ValidationResult;
    getQueueUrlsForResource(resource: string): string[];
    private _applyTransformer;
    private _cleanInternalFields;
    createMessage(resource: string, operation: string, data: unknown, id: string, beforeData?: unknown): SqsMessage;
    initialize(database: unknown, client?: SQSClientLike): Promise<void>;
    replicate(resource: string, operation: string, data: Record<string, unknown>, id: string, beforeData?: unknown): Promise<ReplicateResult>;
    replicateBatch(resource: string, records: Array<{
        operation: string;
        data: Record<string, unknown>;
        id: string;
        beforeData?: unknown;
    }>): Promise<ReplicateResult>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        connected: boolean;
        queueUrl: string | undefined;
        region: string;
        resources: string[];
        totalreplicators: number;
        totalErrors: number;
    }>;
    cleanup(): Promise<void>;
    shouldReplicateResource(resource: string): boolean;
}

/**
 * Lazy-loaded replicators to avoid loading peer dependencies at initialization.
 *
 * Peer dependencies by replicator:
 * - bigquery: @google-cloud/bigquery, google-auth-library
 * - dynamodb: @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb
 * - mongodb: mongodb
 * - mysql: mysql2
 * - planetscale: @planetscale/database
 * - postgres: pg
 * - s3db: (none - uses core s3db.js)
 * - sqs: @aws-sdk/client-sqs
 * - turso: @libsql/client
 * - webhook: (none - uses fetch)
 *
 * Usage:
 *   const BigqueryReplicator = await loadBigqueryReplicator();
 *   const replicator = new BigqueryReplicator({ ... });
 *
 * Or use createReplicator() for dynamic driver selection:
 *   const replicator = await createReplicator('bigquery', config);
 */

type ReplicatorConstructor = new (config?: BaseReplicatorConfig, resources?: unknown[], client?: unknown) => BaseReplicator;
declare function createReplicator(driver: string, config?: BaseReplicatorConfig, resources?: unknown[], client?: unknown): Promise<BaseReplicator>;
declare function validateReplicatorConfig(driver: string, config: BaseReplicatorConfig, resources?: unknown[], client?: unknown): Promise<{
    isValid: boolean;
    errors: string[];
}>;
declare const loadBigqueryReplicator: () => Promise<ReplicatorConstructor>;
declare const loadDynamoDBReplicator: () => Promise<ReplicatorConstructor>;
declare const loadMongoDBReplicator: () => Promise<ReplicatorConstructor>;
declare const loadMySQLReplicator: () => Promise<ReplicatorConstructor>;
declare const loadPlanetScaleReplicator: () => Promise<ReplicatorConstructor>;
declare const loadPostgresReplicator: () => Promise<ReplicatorConstructor>;
declare const loadSqsReplicator: () => Promise<ReplicatorConstructor>;
declare const loadTursoReplicator: () => Promise<ReplicatorConstructor>;

interface SQSCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}
interface SQSMessageAttribute {
    StringValue?: string;
    DataType?: string;
}
interface SQSMessage {
    MessageId?: string;
    ReceiptHandle?: string;
    Body?: string;
    MessageAttributes?: Record<string, SQSMessageAttribute>;
}
interface ParsedMessage$1 {
    $body: unknown;
    $attributes: Record<string, string | undefined>;
    $raw: SQSMessage;
}
type MessageHandler$1 = (parsed: ParsedMessage$1, raw: SQSMessage) => Promise<void>;
type ErrorHandler$1 = (error: Error, message?: SQSMessage) => void;
interface SqsConsumerOptions {
    queueUrl: string;
    onMessage: MessageHandler$1;
    onError?: ErrorHandler$1;
    poolingInterval?: number;
    maxMessages?: number;
    region?: string;
    credentials?: SQSCredentials;
    endpoint?: string;
    driver?: string;
}
interface SQSClientInstance {
    send(command: unknown): Promise<{
        Messages?: SQSMessage[];
    }>;
}
declare class SqsConsumer {
    driver: string;
    queueUrl: string;
    onMessage: MessageHandler$1;
    onError?: ErrorHandler$1;
    poolingInterval: number;
    maxMessages: number;
    region: string;
    credentials?: SQSCredentials;
    endpoint?: string;
    sqs: SQSClientInstance | null;
    private _stopped;
    private _timer;
    private _pollPromise;
    private _pollResolve;
    private _SQSClient;
    private _ReceiveMessageCommand;
    private _DeleteMessageCommand;
    constructor({ queueUrl, onMessage, onError, poolingInterval, maxMessages, region, credentials, endpoint, driver }: SqsConsumerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private _poll;
    private _parseMessage;
}

interface RabbitMQMessage {
    content: Buffer;
    fields: Record<string, unknown>;
    properties: Record<string, unknown>;
}
interface ParsedMessage {
    $body: unknown;
    $raw: RabbitMQMessage;
}
type MessageHandler = (parsed: ParsedMessage) => Promise<void>;
type ErrorHandler = (error: Error, message?: RabbitMQMessage | null) => void;
interface Channel {
    assertQueue(queue: string, options: {
        durable: boolean;
    }): Promise<void>;
    prefetch(count: number): void;
    consume(queue: string, callback: (msg: RabbitMQMessage | null) => void): Promise<void>;
    ack(message: RabbitMQMessage): void;
    nack(message: RabbitMQMessage, allUpTo?: boolean, requeue?: boolean): void;
    close(): Promise<void>;
}
interface Connection {
    createChannel(): Promise<Channel>;
    close(): Promise<void>;
}
interface RabbitMqConsumerOptions {
    amqpUrl: string;
    queue: string;
    prefetch?: number;
    reconnectInterval?: number;
    onMessage: MessageHandler;
    onError?: ErrorHandler;
    driver?: string;
}
declare class RabbitMqConsumer {
    amqpUrl: string;
    queue: string;
    prefetch: number;
    reconnectInterval: number;
    onMessage: MessageHandler;
    onError?: ErrorHandler;
    driver: string;
    connection: Connection | null;
    channel: Channel | null;
    private _stopped;
    constructor({ amqpUrl, queue, prefetch, reconnectInterval, onMessage, onError, driver }: RabbitMqConsumerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private _connect;
}

declare function createConsumer<T extends Record<string, unknown>>(driver: string, config: T): Promise<SqsConsumer | RabbitMqConsumer>;
declare const loadSqsConsumer: () => Promise<typeof SqsConsumer>;
declare const loadRabbitMqConsumer: () => Promise<typeof RabbitMqConsumer>;

interface CacheConfig {
    [key: string]: unknown;
}
interface CacheStats {
    enabled?: boolean;
    hits?: number;
    misses?: number;
    sets?: number;
    deletes?: number;
    evictions?: number;
    hitRate?: number;
    [key: string]: unknown;
}
declare class Cache extends EventEmitter$1 {
    config: CacheConfig;
    protected _fallbackStore: Map<string, unknown>;
    constructor(config?: CacheConfig);
    protected _set(_key: string, _data: unknown): Promise<unknown>;
    protected _get(_key: string): Promise<unknown>;
    protected _del(_key: string): Promise<unknown>;
    protected _clear(_prefix?: string): Promise<unknown>;
    validateKey(key: string): void;
    set<T>(key: string, data: T): Promise<T>;
    get<T>(key: string): Promise<T | undefined>;
    del(key: string): Promise<unknown>;
    delete(key: string): Promise<unknown>;
    clear(prefix?: string): Promise<unknown>;
}

type EvictionPolicy = 'lru' | 'fifo';
interface MemoryCacheConfig extends CacheConfig {
    maxSize?: number;
    maxMemoryBytes?: number;
    maxMemoryPercent?: number;
    ttl?: number;
    enableStats?: boolean;
    evictionPolicy?: EvictionPolicy;
    logEvictions?: boolean;
    cleanupInterval?: number;
    caseSensitive?: boolean;
    serializer?: (value: unknown) => string;
    deserializer?: (str: string) => unknown;
    enableCompression?: boolean;
    compressionThreshold?: number;
    tags?: Record<string, string>;
    persistent?: boolean;
    persistencePath?: string;
    persistenceInterval?: number;
    heapUsageThreshold?: number;
    monitorInterval?: number;
}
interface CacheMeta {
    ts: number;
    createdAt: number;
    lastAccess: number;
    insertOrder: number;
    accessOrder: number;
    compressed: boolean;
    originalSize: number;
    compressedSize: number;
    originalKey: string;
}
interface CompressedData {
    __compressed: true;
    __data: string;
    __originalSize: number;
}
interface CompressionStats {
    totalCompressed: number;
    totalOriginalSize: number;
    totalCompressedSize: number;
    compressionRatio: string;
}
interface MemoryCacheStats extends CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    evictions: number;
    memoryUsageBytes?: number;
    maxMemoryBytes?: number;
    evictedDueToMemory?: number;
    hitRate?: number;
    monitorInterval?: number;
    heapUsageThreshold?: number;
}
interface MemoryStats {
    currentMemoryBytes: number;
    maxMemoryBytes: number;
    maxMemoryPercent: number;
    memoryUsagePercent: number;
    cachePercentOfSystemMemory: number;
    totalItems: number;
    maxSize: number;
    evictedDueToMemory: number;
    memoryPressureEvents: number;
    averageItemSize: number;
    memoryUsage: {
        current: string;
        max: string;
        available: string;
    };
    systemMemory: {
        total: string;
        free: string;
        used: string;
        cachePercent: string;
    };
}
interface CompressionStatsResult {
    enabled: boolean;
    message?: string;
    totalItems?: number;
    compressedItems?: number;
    compressionThreshold?: number;
    totalOriginalSize?: number;
    totalCompressedSize?: number;
    averageCompressionRatio?: string;
    spaceSavingsPercent?: string | number;
    memoryUsage?: {
        uncompressed: string;
        compressed: string;
        saved: string;
    };
}
declare class MemoryCache extends Cache {
    config: MemoryCacheConfig;
    logger: Logger$i;
    caseSensitive: boolean;
    serializer: (value: unknown) => string;
    deserializer: (str: string) => unknown;
    enableStats: boolean;
    evictionPolicy: EvictionPolicy;
    cache: Record<string, string | CompressedData>;
    meta: Record<string, CacheMeta>;
    maxSize: number;
    maxMemoryBytes: number;
    maxMemoryPercent: number;
    ttl: number;
    enableCompression: boolean;
    compressionThreshold: number;
    heapUsageThreshold: number;
    monitorInterval: number;
    compressionStats: CompressionStats;
    currentMemoryBytes: number;
    evictedDueToMemory: number;
    memoryPressureEvents: number;
    private _monitorHandle;
    private _accessCounter;
    stats: MemoryCacheStats;
    constructor(config?: MemoryCacheConfig);
    private _normalizeKey;
    private _recordStat;
    private _selectEvictionCandidate;
    private _evictKey;
    private _enforceMemoryLimit;
    private _reduceMemoryTo;
    private _memoryHealthCheck;
    shutdown(): Promise<void>;
    protected _set(key: string, data: unknown): Promise<unknown>;
    protected _get(key: string): Promise<unknown>;
    protected _del(key: string): Promise<boolean>;
    protected _clear(prefix?: string): Promise<boolean>;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    getStats(): MemoryCacheStats;
    getCompressionStats(): CompressionStatsResult;
    getMemoryStats(): MemoryStats;
    private _formatBytes;
}

interface S3CacheConfig extends CacheConfig {
    client: unknown;
    keyPrefix?: string;
    ttl?: number;
    prefix?: string;
    enableCompression?: boolean;
    compressionThreshold?: number;
}
declare class S3Cache extends Cache {
    config: S3CacheConfig;
    client: PluginClient;
    keyPrefix: string;
    ttlMs: number;
    ttlSeconds: number;
    storage: PluginStorage$1;
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

interface FilesystemCacheConfig extends CacheConfig {
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
interface FilesystemCacheStats {
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
declare class FilesystemCache extends Cache {
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

interface PartitionAwareFilesystemCacheConfig extends FilesystemCacheConfig {
    partitionStrategy?: 'hierarchical' | 'flat' | 'temporal';
    trackUsage?: boolean;
    preloadRelated?: boolean;
    preloadThreshold?: number;
    maxCacheSize?: string | null;
    usageStatsFile?: string;
}
interface PartitionOptions {
    resource?: string;
    action?: string;
    partition?: string;
    partitionValues?: Record<string, unknown>;
    params?: Record<string, unknown>;
}
interface PartitionUsage {
    count: number;
    firstAccess: number;
    lastAccess: number;
}
interface PartitionStats {
    totalFiles: number;
    totalSize: number;
    partitions: Record<string, unknown>;
    usage: Record<string, PartitionUsage>;
}
interface CacheRecommendation {
    partition: string;
    recommendation: string;
    priority: number;
    usage: number;
    lastAccess: string;
}
declare class PartitionAwareFilesystemCache extends FilesystemCache {
    config: PartitionAwareFilesystemCacheConfig;
    partitionStrategy: string;
    trackUsage: boolean;
    preloadRelated: boolean;
    preloadThreshold: number;
    maxCacheSize: string | null;
    usageStatsFile: string;
    partitionUsage: Map<string, PartitionUsage>;
    constructor({ partitionStrategy, trackUsage, preloadRelated, preloadThreshold, maxCacheSize, usageStatsFile, ...config }: PartitionAwareFilesystemCacheConfig);
    private _getPartitionCacheKey;
    private _getPartitionDirectory;
    protected _set(key: string, data: unknown, options?: PartitionOptions): Promise<void>;
    set<T>(resource: string, action: T, options?: PartitionOptions): Promise<T>;
    set<T>(key: string, data: T): Promise<T>;
    get<T>(resource: string, action: string, options: PartitionOptions): Promise<T | undefined>;
    get<T>(key: string): Promise<T | undefined>;
    protected _get(key: string, options?: PartitionOptions): Promise<unknown>;
    clearPartition(resource: string, partition: string, partitionValues?: Record<string, unknown>): Promise<boolean>;
    clearResourcePartitions(resource: string): Promise<boolean>;
    protected _clear(prefix?: string): Promise<unknown>;
    getPartitionStats(resource: string, partition?: string | null): Promise<PartitionStats>;
    getCacheRecommendations(resource: string): Promise<CacheRecommendation[]>;
    warmPartitionCache(resource: string, options?: {
        partitions?: string[];
        maxFiles?: number;
    }): Promise<number>;
    private _trackPartitionUsage;
    private _getUsageKey;
    private _preloadRelatedPartitions;
    private _isTemporalPartition;
    private _getTemporalDirectory;
    private _sanitizePathValue;
    private _sanitizeFileName;
    private _splitKeySegments;
    private _ensurePartitionDirectoryForKey;
    protected _getFilePath(key: string): string;
    private _calculateDirectoryStats;
    loadUsageStats(): Promise<void>;
    private _saveUsageStats;
    private _writeFileWithMetadata;
    private _readFileWithMetadata;
    size(): Promise<number>;
    keys(): Promise<string[]>;
    private _collectKeysRecursive;
}

interface FilesystemBackupDriverConfig extends BackupDriverConfig {
    path?: string;
    permissions?: number;
    directoryPermissions?: number;
}
declare class FilesystemBackupDriver extends BaseBackupDriver {
    config: FilesystemBackupDriverConfig;
    constructor(config?: FilesystemBackupDriverConfig);
    getType(): string;
    onSetup(): Promise<void>;
    resolvePath(backupId: string, manifest?: BackupManifest): string;
    upload(filePath: string, backupId: string, manifest: BackupManifest): Promise<UploadResult>;
    download(backupId: string, targetPath: string, metadata: BackupMetadata): Promise<string>;
    delete(backupId: string, metadata: BackupMetadata): Promise<void>;
    list(options?: ListOptions$2): Promise<BackupListItem[]>;
    private _scanDirectory;
    verify(backupId: string, expectedChecksum: string, metadata: BackupMetadata): Promise<boolean>;
    getStorageInfo(): StorageInfo;
}

interface S3BackupDriverConfig extends BackupDriverConfig {
    bucket?: string | null;
    path?: string;
    storageClass?: string;
    serverSideEncryption?: string;
    client?: S3Client$1 | null;
}
declare class S3BackupDriver extends BaseBackupDriver {
    config: S3BackupDriverConfig;
    constructor(config?: S3BackupDriverConfig);
    getType(): string;
    onSetup(): Promise<void>;
    resolveKey(backupId: string, manifest?: BackupManifest): string;
    resolveManifestKey(backupId: string, manifest?: BackupManifest): string;
    upload(filePath: string, backupId: string, manifest: BackupManifest): Promise<UploadResult>;
    download(backupId: string, targetPath: string, metadata: BackupMetadata): Promise<string>;
    delete(backupId: string, metadata: BackupMetadata): Promise<void>;
    list(options?: ListOptions$2): Promise<BackupListItem[]>;
    verify(backupId: string, expectedChecksum: string, metadata: BackupMetadata): Promise<boolean>;
    getStorageInfo(): StorageInfo;
}

interface DestinationConfig {
    driver: string;
    config?: BackupDriverConfig;
}
interface MultiBackupDriverConfig extends BackupDriverConfig {
    destinations?: DestinationConfig[];
    strategy?: 'all' | 'any' | 'priority';
    concurrency?: number;
    requireAll?: boolean;
}
interface DriverInstance {
    driver: BaseBackupDriver;
    config: DestinationConfig;
    index: number;
}
interface MultiUploadResult extends UploadResult {
    driver: string;
    destination: number;
    status: 'success' | 'failed';
    error?: string;
}
declare class MultiBackupDriver extends BaseBackupDriver {
    config: MultiBackupDriverConfig;
    drivers: DriverInstance[];
    constructor(config?: MultiBackupDriverConfig);
    getType(): string;
    onSetup(): Promise<void>;
    upload(filePath: string, backupId: string, manifest: BackupManifest): Promise<MultiUploadResult[]>;
    download(backupId: string, targetPath: string, metadata: BackupMetadata): Promise<string>;
    delete(backupId: string, metadata: BackupMetadata): Promise<void>;
    list(options?: ListOptions$2): Promise<BackupListItem[]>;
    verify(backupId: string, expectedChecksum: string, metadata: BackupMetadata): Promise<boolean>;
    cleanup(): Promise<void>;
    getStorageInfo(): StorageInfo;
    private _executeConcurrent;
}

interface BackupDriverConstructor {
    new (config?: BackupDriverConfig): BaseBackupDriver;
}
declare const BACKUP_DRIVERS: Record<string, BackupDriverConstructor | null>;
declare function createBackupDriver(driver: string, config?: BackupDriverConfig): BaseBackupDriver;
declare function validateBackupConfig(driver: string, config?: BackupDriverConfig): boolean;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LoggerFunction = (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
interface CloudResource {
    provider: string;
    accountId?: string;
    subscriptionId?: string;
    organizationId?: string;
    projectId?: string;
    region?: string | null;
    service?: string;
    resourceType: string;
    resourceId: string;
    name?: string | null;
    tags?: Record<string, string | null> | null;
    labels?: Record<string, string> | null;
    attributes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    configuration: Record<string, unknown>;
    raw?: unknown;
}
interface BaseCloudDriverOptions {
    id?: string;
    driver: string;
    credentials?: Record<string, unknown>;
    config?: Record<string, unknown>;
    globals?: Record<string, unknown>;
    logger?: LoggerFunction | null;
}
interface ListResourcesOptions {
    discovery?: {
        include?: string | string[];
        exclude?: string | string[];
    };
    runtime?: {
        emitProgress?: (info: {
            service: string;
            resourceId: string;
            resourceType: string;
        }) => void;
    };
}
interface HealthCheckResult {
    ok: boolean;
    details?: unknown;
}
declare class BaseCloudDriver {
    id: string;
    driver: string;
    credentials: Record<string, unknown>;
    config: Record<string, unknown>;
    globals: Record<string, unknown>;
    logger: LoggerFunction;
    constructor(options?: BaseCloudDriverOptions);
    initialize(): Promise<void>;
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    healthCheck(): Promise<HealthCheckResult>;
    destroy(): Promise<void>;
}

interface ImporterDriverConfig {
    [key: string]: unknown;
}
interface ImportResult {
    processed: number;
    inserted: number;
    skipped: number;
    errors: number;
    duplicates: number;
    duration: number;
}
interface ImportStats {
    totalProcessed: number;
    totalInserted: number;
    totalSkipped: number;
    totalErrors: number;
    totalDuplicates: number;
    startTime: number | null;
    endTime: number | null;
}
interface ParseOptions {
    delimiter?: string;
    hasHeader?: boolean;
    [key: string]: unknown;
}
interface BinaryFieldSchema {
    type: 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'int8' | 'int16' | 'int32' | 'int64' | 'float32' | 'float64';
    offset: number;
}
interface BinarySchema {
    [fieldName: string]: BinaryFieldSchema;
}
type TransformFunction = (value: unknown, record: Record<string, unknown>) => unknown;
type ValidateFunction = (record: Record<string, unknown>) => boolean;
interface ImporterPluginOptions extends PluginConfig {
    resource?: string;
    resourceName?: string;
    format?: string;
    mapping?: Record<string, string>;
    transforms?: Record<string, TransformFunction>;
    validate?: ValidateFunction | null;
    deduplicateBy?: string | null;
    batchSize?: number;
    parallelism?: number;
    continueOnError?: boolean;
    streaming?: boolean;
    driverConfig?: ImporterDriverConfig;
    sheet?: string | number;
    headerRow?: number;
    startRow?: number;
    binarySchema?: BinarySchema | null;
    recordSize?: number | null;
}
declare class ImporterPlugin extends Plugin {
    private resourceName;
    private format;
    private mapping;
    private transforms;
    private validateFn;
    private deduplicateBy;
    private batchSize;
    private parallelism;
    private continueOnError;
    private streaming;
    private driverConfig;
    private sheet;
    private headerRow;
    private startRow;
    private binarySchema;
    private recordSize;
    private resource;
    private driver;
    private seenKeys;
    private stats;
    constructor(config?: ImporterPluginOptions);
    onInstall(): Promise<void>;
    private _createDriver;
    import(filePath: string, options?: ParseOptions): Promise<ImportResult>;
    private _mapRecord;
    private _transformRecord;
    private _processBatch;
    getStats(): ImportStats & {
        recordsPerSecond: number;
    };
}
declare const Transformers: {
    parseDate: (format?: string) => (value: unknown) => number;
    parseFloat: (decimals?: number) => (value: unknown) => number;
    parseInt: () => (value: unknown) => number;
    toLowerCase: () => (value: unknown) => string;
    toUpperCase: () => (value: unknown) => string;
    split: (delimiter?: string) => (value: unknown) => string[];
    parseJSON: () => (value: unknown) => unknown;
    trim: () => (value: unknown) => string;
};

export { AVAILABLE_BEHAVIORS, AdaptiveTuning, AdjacencyListDriver, AnalyticsNotEnabledError, ApiPlugin, AsyncEventEmitter, AuditPlugin$1 as AuditPlugin, AuthenticationError, BACKUP_DRIVERS, BUILT_IN_SENSITIVE_FIELDS, BackupPlugin, BaseBackupDriver, BaseCloudDriver, BaseError, BaseReplicator, BehaviorError, Benchmark, CONTENT_TYPE_DICT, CRON_PRESETS, CURRENCY_DECIMALS, CachePlugin, S3Client$1 as Client, ConnectionString, ConnectionStringError, CookieFarmPlugin, CookieFarmSuitePlugin, CoordinatorPlugin, CostsPlugin, CrawlContext, CronManager, CryptoError, DEFAULT_BEHAVIOR, Database$a as Database, DatabaseError, DistributedLock, DistributedSequence, EncryptionError, ErrorClassifier, ErrorMap, EventualConsistencyPlugin, Factory, FailbanManager, FetchFallback, FileSystemClient, FileSystemStorage, FilesystemBackupDriver, FilesystemCache, FullTextPlugin, GeoPlugin, GraphConfigurationError, GraphError, GraphPlugin, HighPerformanceInserter, HybridFetcher, IdentityPlugin, ImporterPlugin, InMemoryPersistence, IncrementalConfigError, IncrementalSequence, InvalidEdgeError, InvalidParentError, InvalidResourceItem, KubernetesInventoryPlugin, LatencyBuffer, MLPlugin, MemoryCache, MemoryClient, MemorySampler$1 as MemorySampler, MemoryStorage, MetadataLimitError, MetricsPlugin$1 as MetricsPlugin, MissingMetadata, MultiBackupDriver, NON_RETRIABLE, NestedSetDriver, NoSuchBucket, NoSuchKey, NodeNotFoundError, NotFound, OIDCClient, OpenGraphHelper, PartitionAwareFilesystemCache, PartitionDriverError, PartitionError, PartitionQueue, PathNotFoundError, PerformanceMonitor, PermissionError, Plugin, PluginError, PluginObject, PluginStorage$1 as PluginStorage, PluginStorageError, ProcessManager$1 as ProcessManager, PuppeteerPlugin, QueueConsumerPlugin, RETRIABLE, RabbitMqConsumer, ReckerHttpHandler, ReckerWrapper, ReconPlugin, ReplicationError, ReplicatorPlugin, Resource$j as Resource, ResourceError, ResourceIdsPageReader, ResourceIdsReader, ResourceNotFound, ResourceReader, ResourceWriter, RingBuffer, RootNodeError, RouteContext, S3BackupDriver, S3Cache, S3Client$1 as S3Client, S3QueuePlugin, Database$a as S3db, S3dbError, S3dbReplicator, SMTPPlugin, STATUS_MESSAGE_DICT, SafeEventEmitter, SchedulerPlugin$1 as SchedulerPlugin, Schema, SchemaError, Seeder, SpiderPlugin, SqsConsumer, SqsReplicator, StateMachinePlugin, StreamError, StreamInserter, TTLPlugin, TaskExecutor, TasksPool, TasksRunner, TfStatePlugin, TournamentPlugin, Transformers, TreeConfigurationError, TreeIntegrityError, TreePlugin, URL_PREFIX_DICT, UnknownError, ValidationError, Validator, VectorPlugin, VertexNotFoundError, WebSocketPlugin, WebSocketServer, WebhookReplicator, analyzeString, behaviors, benchmark, bytesToMB, cacheValidator, calculateAttributeNamesSize, calculateAttributeSizes, calculateBufferSavings, calculateDictionaryCompression, calculateEffectiveLimit, calculateEncodedSize, calculateIPSavings, calculateSystemOverhead, calculateTotalSize, calculateUTF8Bytes, captureHeapSnapshot, clearBit, clearBitFast, clearUTF8Memory, clearValidatorCache, compactHash, compareEncodings, compareMemorySnapshots, compressIPv6, computeBackoff, countBits, countBitsFast, createBackupDriver, createBitmap, createBitmapFast, createConsumer, createContextInjectionMiddleware, createCronManager, createCustomGenerator, createHttpClient, createHttpClientSync, createIncrementalIdGenerator, createLockedFunction, createLogger, createPayloadRedactionSerializer, createRedactRules, createReplicator, createSafeEventEmitter, createSensitiveDataSerializer, createSequence, decode, decodeBits, decodeBitsFast, decodeBuffer, decodeDecimal, decodeFixedPoint, decodeFixedPointBatch, decodeGeoLat, decodeGeoLon, decodeGeoPoint, decodeIPv4, decodeIPv6, decodeMoney, decrypt, S3db as default, deleteChunkedCookie, detectIPVersion, dictionaryDecode, dictionaryEncode, ejsEngine, encode, encodeBits, encodeBitsFast, encodeBuffer, encodeDecimal, encodeFixedPoint, encodeFixedPointBatch, encodeGeoLat, encodeGeoLon, encodeGeoPoint, encodeIPv4, encodeIPv6, encodeMoney, encrypt, errorResponse, evictUnusedValidators, exampleUsage, expandHash, expandIPv6, flatten, forEachWithConcurrency, forceGC, formatIncrementalValue, formatMemoryUsage, formatMoney, generateSchemaFingerprint, generateTypes, getAccuracyForPrecision, getBehavior, getBit, getBitFast, getCacheMemoryUsage, getCacheStats, getCachedValidator, getChunkedCookie, getCronManager, getCurrencyDecimals, getDictionaryStats, getGlobalLogger, getLoggerOptionsFromEnv, getMemoryUsage, getNanoidInitializationError, getPrecisionForAccuracy, getProcessManager, getSizeBreakdown, getSupportedCurrencies, getUrlAlphabet, hashPassword, hashPasswordSync, httpGet, httpPost, idGenerator, initializeNanoid, intervalToCron, isBcryptHash, isChunkedCookie, isPreconditionFailure, isReckerAvailable, isSensitiveField, isSupportedCurrency, isValidCoordinate, isValidIPv4, isValidIPv6, jsxEngine, lazyLoadPlugin, loadApiPlugin, loadBackupPlugin, loadBigqueryReplicator, loadCloudInventoryPlugin, loadCookieFarmPlugin, loadCookieFarmSuitePlugin, loadDynamoDBReplicator, loadGeoPlugin, loadIdentityPlugin, loadKubernetesInventoryPlugin, loadMLPlugin, loadMongoDBReplicator, loadMySQLReplicator, loadPlanetScaleReplicator, loadPostgresReplicator, loadPuppeteerPlugin, loadQueueConsumerPlugin, loadRabbitMqConsumer, loadReconPlugin, loadReplicatorPlugin, loadSMTPPlugin, loadSpiderPlugin, loadSqsConsumer, loadSqsReplicator, loadTursoReplicator, loadWebSocketPlugin, mapAwsError, mapWithConcurrency, md5, measureMemory, metadataDecode, metadataEncode, optimizedDecode, optimizedEncode, parseIncrementalConfig, passwordGenerator, preloadRecker, printTypes, pugEngine, releaseValidator, resetCronManager, resetGlobalLogger, resetProcessManager, resolveCacheMemoryLimit, setBit, setBitFast, setChunkedCookie, setupTemplateEngine, sha256, sleep, streamToString, successResponse, toggleBit, toggleBitFast, transformValue, tryFn, tryFnSync, unflatten, validateBackupConfig, validateIncrementalConfig, validateReplicatorConfig, verifyPassword, withContext };
export type { AcquireOptions, AdaptiveMetrics, AdaptiveTuningOptions, AnalysisResult, AnalysisStats, AnalyticsDataPoint, AnalyticsNotEnabledErrorDetails, ApiKeyAuth, AsyncEventEmitterOptions, AuditConfig$1 as AuditConfig, AuditPluginOptions, AuditQueryOptions, AuditRecord, AuditStats, AuthConfig$3 as AuthConfig, AuthType, AutoPartitionConfig, BackoffStrategy, BanRecord$1 as BanRecord, BaseErrorContext, BasicAuth, BatchGetResult, BatchInfo, BatchSetItem, BatchSetResult, BatchStatus, BearerAuth, BehaviorErrorDetails, BehaviorResult, BenchmarkResult, BenchmarkStats, BitValue, BounceType, BufferSavingsResult, BulkInsertResult, CacheMemoryUsage, CachePluginOptions, CachedBan, CachedValidator, ClassifiableError, ClassifyOptions, CleanupFn, ClientConfig, ClusterOptions, ClusterResult, CohortStats, ComplaintType, ConcurrencyAdjustment, ConsolidationResult, CoordinatorConfig, CopyObjectParams$1 as CopyObjectParams, CostsData, CostsPluginOptions, CountryBlockResult, CreateEdgeOptions, CreateIncrementalIdGeneratorOptions, CreateSequenceOptions, CronJobEntry, CronManagerOptions, CronShutdownOptions, CronStats, CronTask, DegreeResult, DictionaryCompressionStats, DictionaryEncodeResult, DictionaryStats, DistanceFunction, DistanceMetric, DistributedLockOptions, DistributedSequenceOptions, EdgeOptions, EdgeRecord, EffectiveLimitConfig, EmailAttachment, EmailRecord, EmailStatus, EncodeResult, EncodedSizeInfo, EncodingComparison, EncodingType, ErrorClassification, ErrorLogsQueryOptions, EventualConsistencyPluginOptions, FailbanManagerOptions, FailbanOptions, FailbanStats, FieldDefinition, FieldHandler, FileSystemClientConfig, FileSystemStorageConfig, FileSystemStorageStats, FindOptimalKOptions, FlattenOptions, ForEachWithConcurrencyResult, FullStats, FullTextPluginOptions, GenerateTypesOptions, GeoOptions, GeoPoint, GetAnalyticsOptions, GetRawEventsOptions, GetTopRecordsOptions, GraphConfig, GraphPluginOptions, HandleOptions, HighPerformanceInserterOptions, HookHandler$1 as HookHandler, HttpClient$3 as HttpClient, HttpClientOptions, IPSavingsResult, IPVersion, IncrementalConfig, IncrementalIdGenerator, IncrementalMode, IncrementalSequenceOptions, IncrementalValidationError, IncrementalValidationResult, IndexStats, InsertResult, InsertStats, IntervalEntry, InvalidResourceItemDetails, JobStats, LatencyStats$1 as LatencyStats, LeakDetectionResult, ListObjectsParams$2 as ListObjectsParams, ListObjectsResponse$2 as ListObjectsResponse, ListSequenceOptions, ListenerStats, LockDefaults, LockHandle, LockInfo, LogFormat, LogLevel$3 as LogLevel, Logger$i as Logger, LoggerOptions, MLPluginOptions, MapAwsErrorContext, MapWithConcurrencyError, MapWithConcurrencyOptions, MapWithConcurrencyResult, MeasureMemoryResult, MemoryClientConfig, MemoryComparison, MemoryLimitResult, MemorySample, MemorySamplerOptions, MemoryStorageConfig, MemoryStorageStats, MemoryUsageStats, MetadataLimitErrorDetails, MetricsPluginOptions, MetricsQueryOptions, MetricsStats, MetricsSummary$1 as MetricsSummary, MiddlewareFunction, ModelConfig, ModelInstance, ModelStats, MonitorReport, NeighborOptions, NeighborResult, NextOptions, NoSuchBucketDetails, NoSuchKeyDetails, NormalizedConfig, ObjectFieldDefinition, ParseIncrementalOptions, PartitionDefinition$1 as PartitionDefinition, PartitionDriverErrorDetails, PartitionErrorDetails, PartitionOperation, PartitionOperationType, PartitionQueueItem, PartitionQueueOptions, PartitionResource, PathResult, PerformanceLogsQueryOptions, PerformanceMetrics, PerformanceReport$1 as PerformanceReport, PluginBehavior, PluginClient, PluginConfig, PluginErrorDetails, PluginObjectInterface, PluginSequenceInfo, PluginStatus, PluginStorageErrorDetails, PluginStorageListOptions, PluginStorageOptions, PluginStorageSetOptions, ProcessManagerOptions, ProcessManagerStatus, ProcessTicketResults, PrometheusConfig, PutObjectParams$2 as PutObjectParams, PutObjectResponse$2 as PutObjectResponse, QueueItem, QueueItemStatus, QueuePersistence, QueueStats$1 as QueueStats, QueuedItem, RateLimitConfig$2 as RateLimitConfig, RebuildOptions, ReckerHttpHandlerOptions, RelayConfig, RelayStrategy, RequestOptions, ResetOptions$1 as ResetOptions, ResetSequenceOptions, ResourceConfig$7 as ResourceConfig, ResourceDescriptor$2 as ResourceDescriptor, ResourceInterface, ResourceLike$6 as ResourceLike, ResourceNames$3 as ResourceNames, ResourceNotFoundDetails, RetryConfig$1 as RetryConfig, RetryPolicy, S3ClientConfig, S3DBLogger, S3Object, S3QueuePluginOptions, S3dbErrorDetails, SMTPAuth$1 as SMTPAuth, SMTPDriver, SMTPMode, SMTPPluginOptions, SafeEventEmitterOptions, SamplerStats, ScheduleOptions, ScheduledTask, SchedulerPluginOptions, SchemaRegistry, SearchOptions, SearchRecord, SearchResult, SendEmailOptions$1 as SendEmailOptions, SendResult, SequenceData, SequenceDefaults, SequenceInfo, SequenceOptions, SequenceStorageAdapter, SerializedError, SetOptions$2 as SetOptions, ShortestPathOptions, ShutdownOptions, SizeBreakdown, SizeBreakdownAttribute, Snapshot, StateMachinePluginOptions, StorageAdapter, StorageConfig, StorageObjectData, StoragePutParams, StreamErrorDetails, StreamInserterOptions, SystemMetrics, SystemOverheadConfig, SystemReport, TTLExpireStrategy, TTLGranularity, TTLPluginOptions, TTLResourceConfig, TTLStats, TaskMetrics, TaskQueueReport, TaskQueueStats, TemplateEngineType, TfStatePluginConfig, Ticket, TimeoutEntry, TopRecord, TournamentPluginOptions, TransitionHistoryEntry, TransitionHistoryOptions, TransitionResult, TraverseNode, TraverseOptions, TreePluginConfig, TreePluginOptions, TruncatedPayload, TryResult, TypeGenResourceConfig, UnflattenOptions, UninstallOptions$1 as UninstallOptions, ValidationOptions, ValidatorCacheStats, ValidatorOptions$1 as ValidatorOptions, VectorFieldInfo, VectorPluginConfig, VectorPluginOptions, VectorSearchOptions, VectorSearchResult, ViolationMetadata, WebhookEvent, WebhookProcessResult, WebhookProvider, WrapperFunction };
