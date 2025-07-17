declare module 's3db.js' {
  // ============================================================================
  // CORE TYPES
  // ============================================================================

  /** Main Database configuration */
  export interface DatabaseConfig {
    connectionString?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    bucket?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    verbose?: boolean;
    parallelism?: number | string;
    passphrase?: string;
    versioningEnabled?: boolean;
    cache?: CacheConfig;
    plugins?: Plugin[] | PluginFunction[];
    client?: Client;
  }

  /** Resource configuration */
  export interface ResourceConfig {
    name: string;
    client: Client;
    version?: string;
    attributes?: Record<string, any>;
    behavior?: BehaviorName;
    passphrase?: string;
    parallelism?: number;
    observers?: any[];
    cache?: boolean | CacheConfig;
    autoDecrypt?: boolean;
    timestamps?: boolean;
    partitions?: Record<string, PartitionConfig>;
    paranoid?: boolean;
    allNestedObjectsOptional?: boolean;
    hooks?: HookConfig;
    idGenerator?: Function | number;
    idSize?: number;
    versioningEnabled?: boolean;
  }

  /** Partition configuration */
  export interface PartitionConfig {
    fields: Record<string, string>;
    description?: string;
  }

  /** Hook configuration */
  export interface HookConfig {
    preInsert?: Function[];
    afterInsert?: Function[];
    preUpdate?: Function[];
    afterUpdate?: Function[];
    preDelete?: Function[];
    afterDelete?: Function[];
  }

  /** Query options */
  export interface QueryOptions {
    limit?: number;
    offset?: number;
    partition?: string;
    partitionValues?: Record<string, any>;
  }

  /** Insert options */
  export interface InsertOptions {
    id?: string;
  }

  /** Update options */
  export interface UpdateOptions {
    id: string;
  }

  /** Delete options */
  export interface DeleteOptions {
    id: string;
  }

  /** Page options */
  export interface PageOptions {
    offset?: number;
    size?: number;
    partition?: string;
    partitionValues?: Record<string, any>;
    skipCount?: boolean;
  }

  /** List options */
  export interface ListOptions {
    partition?: string;
    partitionValues?: Record<string, any>;
    limit?: number;
    offset?: number;
  }

  /** Count options */
  export interface CountOptions {
    partition?: string;
    partitionValues?: Record<string, any>;
  }

  // ============================================================================
  // BEHAVIOR TYPES
  // ============================================================================

  /** Names of all built-in behaviors */
  export type BehaviorName =
    | 'user-managed'
    | 'enforce-limits'
    | 'truncate-data'
    | 'body-overflow'
    | 'body-only';

  /** User Managed Behavior config (default) */
  export interface UserManagedBehaviorConfig {
    enabled?: boolean;
  }

  /** Enforce Limits Behavior config */
  export interface EnforceLimitsBehaviorConfig {
    enabled?: boolean;
    maxBodySize?: number;
    maxMetadataSize?: number;
    maxKeySize?: number;
    maxValueSize?: number;
    maxFields?: number;
    maxNestingDepth?: number;
    maxArrayLength?: number;
    maxStringLength?: number;
    maxNumberValue?: number;
    minNumberValue?: number;
    enforcementMode?: 'strict' | 'warn' | 'soft';
    logViolations?: boolean;
    throwOnViolation?: boolean;
    customValidator?: (data: any, limits: any, context: any) => boolean;
    fieldLimits?: Record<string, number>;
    excludeFields?: string[];
    includeFields?: string[];
    applyToInsert?: boolean;
    applyToUpdate?: boolean;
    applyToUpsert?: boolean;
    applyToRead?: boolean;
    warningThreshold?: number;
    context?: Record<string, any>;
    validateMetadata?: boolean;
    validateBody?: boolean;
    validateKeys?: boolean;
    validateValues?: boolean;
  }

  /** Data Truncate Behavior config */
  export interface DataTruncateBehaviorConfig {
    enabled?: boolean;
    fieldLimits?: Record<string, number>;
    defaultLimit?: number;
    truncateIndicator?: string;
    truncateMode?: 'end' | 'start' | 'middle';
    preserveWords?: boolean;
    preserveSentences?: boolean;
    excludeFields?: string[];
    includeFields?: string[];
    applyToInsert?: boolean;
    applyToUpdate?: boolean;
    applyToUpsert?: boolean;
    logTruncations?: boolean;
    warnOnTruncation?: boolean;
    customTruncator?: (value: string, fieldName: string, limit: number, config: any) => string;
    fieldTruncators?: Record<string, (value: string, fieldName: string, limit: number, config: any) => string>;
    validateOnRead?: boolean;
    warningThreshold?: number;
    context?: Record<string, any>;
    preserveHTML?: boolean;
    preserveMarkdown?: boolean;
    preserveTags?: string[];
  }

  /** Body Overflow Behavior config */
  export interface BodyOverflowBehaviorConfig {
    enabled?: boolean;
    maxBodySize?: number;
    overflowStrategy?: 'truncate' | 'split' | 'reject';
    truncateMode?: 'end' | 'start' | 'middle';
    truncateIndicator?: string;
    preserveStructure?: boolean;
    priorityFields?: string[];
    overflowFields?: string[];
    overflowStorage?: {
      type?: 's3' | 'local' | 'memory';
      bucket?: string;
      prefix?: string;
      path?: string;
      maxSize?: number;
      compress?: boolean;
    };
    logOverflow?: boolean;
    customTruncator?: (data: any, maxSize: number, config: any) => any;
    customOverflowHandler?: (overflowData: any, originalData: any, config: any) => string;
    validateOnRead?: boolean;
    validateOnWrite?: boolean;
    warningThreshold?: number;
    context?: Record<string, any>;
  }

  /** Body Only Behavior config */
  export interface BodyOnlyBehaviorConfig {
    enabled?: boolean;
    excludeFields?: string[];
    includeFields?: string[];
    applyToRead?: boolean;
    applyToList?: boolean;
    applyToFind?: boolean;
    applyToStream?: boolean;
    preserveArrays?: boolean;
    deepFilter?: boolean;
    customFilter?: (data: any, context: any) => any;
    logFilteredFields?: boolean;
    context?: Record<string, any>;
  }

  // ============================================================================
  // PLUGIN TYPES
  // ============================================================================

  /** Plugin function type */
  export type PluginFunction = (database: Database) => Plugin;

  /** Plugin base interface */
  export interface Plugin {
    name?: string;
    setup?: (database: Database) => Promise<void> | void;
    start?: () => Promise<void> | void;
    stop?: () => Promise<void> | void;
    beforeSetup?: () => Promise<void> | void;
    afterSetup?: () => Promise<void> | void;
    beforeStart?: () => Promise<void> | void;
    afterStart?: () => Promise<void> | void;
    beforeStop?: () => Promise<void> | void;
    afterStop?: () => Promise<void> | void;
  }

  /** Plugin configuration base */
  export interface PluginConfig {
    enabled?: boolean;
  }

  /** Audit Plugin config */
  export interface AuditPluginConfig extends PluginConfig {
    trackOperations?: string[];
    includeData?: boolean;
    retentionDays?: number;
    logToConsole?: boolean;
    customLogger?: (logEntry: any) => void;
  }

  /** Cache Plugin config */
  export interface CachePluginConfig extends PluginConfig {
    type?: 'memory' | 's3';
    ttl?: number;
    maxSize?: number;
    enableCompression?: boolean;
    storageClass?: string;
    enableEncryption?: boolean;
  }

  /** Costs Plugin config */
  export interface CostsPluginConfig extends PluginConfig {
    trackOperations?: boolean;
    trackStorage?: boolean;
    trackRequests?: boolean;
    costThreshold?: number;
    alertOnThreshold?: boolean;
    customPricing?: Record<string, number>;
  }

  /** Fulltext Plugin config */
  export interface FulltextPluginConfig extends PluginConfig {
    searchableFields?: string[];
    indexOnInsert?: boolean;
    indexOnUpdate?: boolean;
    searchAlgorithm?: 'exact' | 'fuzzy' | 'prefix';
    maxResults?: number;
  }

  /** Metrics Plugin config */
  export interface MetricsPluginConfig extends PluginConfig {
    trackLatency?: boolean;
    trackThroughput?: boolean;
    trackErrors?: boolean;
    customMetrics?: string[];
    exportToCloudWatch?: boolean;
  }

  /** replicator Plugin config */
  export interface ReplicatorPluginConfig extends PluginConfig {
    replicators?: ReplicatorConfig[];
  }

  // ============================================================================
  // REPLICATOR TYPES
  // ============================================================================

  /** Replicator configuration */
  export interface ReplicatorConfig {
    driver: 's3db' | 'sqs' | 'bigquery' | 'postgres';
    config: S3dbReplicatorConfig | SQSReplicatorConfig | BigQueryReplicatorConfig | PostgresReplicatorConfig;
    resources?: string[];
  }

  /** S3DB Replicator config */
  export interface S3dbReplicatorConfig {
    connectionString: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    createResources?: boolean;
    overwriteExisting?: boolean;
    preservePartitions?: boolean;
    syncMetadata?: boolean;
    batchSize?: number;
    maxConcurrency?: number;
    logProgress?: boolean;
    targetPrefix?: string;
    resourceMapping?: Record<string, string>;
    validateData?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
  }

  /** SQS Replicator config */
  export interface SQSReplicatorConfig {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    defaultQueueUrl?: string;
    resourceQueues?: Record<string, string>;
    maxRetries?: number;
    retryDelay?: number;
    logMessages?: boolean;
    messageDelaySeconds?: number;
    messageAttributes?: Record<string, any>;
    messageGroupId?: string;
    useFIFO?: boolean;
    batchSize?: number;
    compressMessages?: boolean;
    messageFormat?: 'json' | 'stringified';
    sqsClientOptions?: Record<string, any>;
  }

  /** BigQuery Replicator config */
  export interface BigQueryReplicatorConfig {
    projectId: string;
    datasetId: string;
    keyFilename?: string;
    credentials?: Record<string, any>;
    tableMapping?: Record<string, string>;
    logOperations?: boolean;
    batchSize?: number;
    maxRetries?: number;
    retryDelay?: number;
    writeDisposition?: 'WRITE_TRUNCATE' | 'WRITE_APPEND' | 'WRITE_EMPTY';
    createDisposition?: 'CREATE_IF_NEEDED' | 'CREATE_NEVER';
    schema?: Record<string, any>[];
    location?: string;
    clustering?: string[];
    partitioning?: {
      type: 'DAY' | 'HOUR' | 'MONTH' | 'YEAR';
      field?: string;
    };
    labels?: Record<string, string>;
  }

  /** Postgres Replicator config */
  export interface PostgresReplicatorConfig {
    database: string;
    resourceArn: string;
    secretArn: string;
    region?: string;
    tableMapping?: Record<string, string>;
    logOperations?: boolean;
    schema?: string;
    maxRetries?: number;
    retryDelay?: number;
    useUpsert?: boolean;
    conflictColumn?: string;
  }

  // ============================================================================
  // CACHE TYPES
  // ============================================================================

  /** Cache configuration */
  export interface CacheConfig {
    type?: 'memory' | 's3';
    ttl?: number;
    maxSize?: number;
    enableCompression?: boolean;
    storageClass?: string;
    enableEncryption?: boolean;
  }

  /** Memory Cache config */
  export interface MemoryCacheConfig {
    maxSize?: number;
    ttl?: number;
    enableStats?: boolean;
    evictionPolicy?: 'lru' | 'fifo';
    logEvictions?: boolean;
    cleanupInterval?: number;
    caseSensitive?: boolean;
    serializer?: (value: any) => string;
    deserializer?: (str: string) => any;
    enableCompression?: boolean;
    compressionThreshold?: number;
    tags?: Record<string, any>;
    persistent?: boolean;
    persistencePath?: string;
    persistenceInterval?: number;
  }

  /** S3 Cache config */
  export interface S3CacheConfig {
    bucket: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    prefix?: string;
    ttl?: number;
    enableCompression?: boolean;
    compressionThreshold?: number;
    storageClass?: string;
    enableEncryption?: boolean;
    encryptionAlgorithm?: string;
    kmsKeyId?: string;
    maxConcurrency?: number;
    retryAttempts?: number;
    retryDelay?: number;
    logOperations?: boolean;
    metadata?: Record<string, any>;
    contentType?: string;
    enableVersioning?: boolean;
    maxKeys?: number;
    enableCacheControl?: boolean;
    cacheControl?: string;
    s3ClientOptions?: Record<string, any>;
    enableLocalCache?: boolean;
    localCacheSize?: number;
    localCacheTtl?: number;
  }

  // ============================================================================
  // EVENT TYPES
  // ============================================================================

  /** Event payload for S3 metadata limit warnings */
  export interface ExceedsLimitEvent {
    operation: 'insert' | 'update' | 'upsert';
    id?: string;
    totalSize: number;
    limit: number;
    excess: number;
    data: any;
  }

  /** Event payload for data truncation */
  export interface TruncateEvent {
    operation: 'insert' | 'update' | 'upsert';
    id?: string;
    fieldName: string;
    originalLength: number;
    truncatedLength: number;
    data: any;
  }

  /** Event payload for overflow handling */
  export interface OverflowEvent {
    operation: 'insert' | 'update' | 'upsert';
    id?: string;
    strategy: 'truncate' | 'split' | 'reject';
    originalSize: number;
    maxSize: number;
    data: any;
  }

  /** Definition change event */
  export interface DefinitionChangeEvent {
    type: 'new' | 'changed' | 'deleted';
    resourceName: string;
    currentHash?: string;
    savedHash?: string;
    fromVersion?: string;
    toVersion?: string;
    deletedVersion?: string;
  }

  // ============================================================================
  // MAIN CLASSES
  // ============================================================================

  /** Main Database class */
  export class Database extends EventEmitter {
    constructor(options?: DatabaseConfig);
    
    // Properties
    version: string;
    s3dbVersion: string;
    resources: Record<string, Resource>;
    savedMetadata: any;
    options: DatabaseConfig;
    verbose: boolean;
    parallelism: number;
    plugins: Plugin[];
    pluginList: Plugin[];
    cache: CacheConfig;
    passphrase: string;
    versioningEnabled: boolean;
    client: Client;
    bucket: string;
    keyPrefix: string;
    
    // Connection methods
    connect(): Promise<void>;
    isConnected(): boolean;
    
    // Resource methods
    createResource(config: ResourceConfig): Promise<Resource>;
    resource(name: string): Resource;
    getResource(name: string): Resource;
    listResources(): Promise<string[]>;
    
    // Plugin methods
    startPlugins(): Promise<void>;
    usePlugin(plugin: Plugin | PluginFunction, name?: string): Promise<void>;
    
    // Utility methods
    generateDefinitionHash(definition: any, behavior?: string): string;
    getNextVersion(versions?: Record<string, any>): string;
    detectDefinitionChanges(savedMetadata: any): DefinitionChangeEvent[];
    resourceExists(name: string): boolean;
    resourceExistsWithSameHash(config: { name: string; attributes: any; behavior?: string; options?: any }): boolean;
    uploadMetadataFile(): Promise<void>;
    blankMetadataStructure(): any;
    
    // Configuration
    get config(): DatabaseConfig;
    
    // Events
    on(event: 'connected', handler: (date: Date) => void): this;
    on(event: 'resourceDefinitionsChanged', handler: (data: { changes: DefinitionChangeEvent[]; metadata: any }) => void): this;
    on(event: string, handler: (...args: any[]) => void): this;
  }

  /** Main S3db class (alias for Database) */
  export class S3db extends Database {}

  /** Resource class */
  export class Resource extends EventEmitter {
    constructor(config: ResourceConfig);
    
    // Properties
    name: string;
    client: Client;
    version: string;
    behavior: BehaviorName;
    observers: any[];
    parallelism: number;
    passphrase: string;
    versioningEnabled: boolean;
    idGenerator: Function;
    config: {
      cache: boolean | CacheConfig;
      hooks: HookConfig;
      paranoid: boolean;
      timestamps: boolean;
      partitions: Record<string, PartitionConfig>;
      autoDecrypt: boolean;
      allNestedObjectsOptional: boolean;
    };
    hooks: {
      preInsert: Function[];
      afterInsert: Function[];
      preUpdate: Function[];
      afterUpdate: Function[];
      preDelete: Function[];
      afterDelete: Function[];
    };
    attributes: Record<string, any>;
    
    // CRUD operations
    insert(data: any, options?: InsertOptions): Promise<any>;
    insertMany(objects: any[]): Promise<any[]>;
    get(id: string): Promise<any>;
    exists(id: string): Promise<boolean>;
    update(id: string, attributes: any): Promise<any>;
    upsert(data: any): Promise<any>;
    delete(id: string): Promise<void>;
    deleteMany(ids: string[]): Promise<void>;
    deleteAll(): Promise<void>;
    deleteAllData(): Promise<void>;
    
    // List and count operations
    listIds(options?: ListOptions): Promise<string[]>;
    list(options?: ListOptions): Promise<any[]>;
    listMain(options?: { limit?: number; offset?: number }): Promise<any[]>;
    listPartition(options: { partition: string; partitionValues: Record<string, any>; limit?: number; offset?: number }): Promise<any[]>;
    count(options?: CountOptions): Promise<number>;
    
    // Batch operations
    getMany(ids: string[]): Promise<any[]>;
    getAll(): Promise<any[]>;
    
    // Pagination
    page(options?: PageOptions): Promise<{ data: any[]; total?: number; offset: number; size: number; hasMore: boolean }>;
    
    // Stream operations
    readable(): Promise<NodeJS.ReadableStream>;
    writable(): Promise<NodeJS.WritableStream>;
    
    // Content operations
    setContent(options: { id: string; buffer: Buffer; contentType?: string }): Promise<void>;
    content(id: string): Promise<Buffer>;
    hasContent(id: string): Promise<boolean>;
    deleteContent(id: string): Promise<void>;
    
    // Schema and validation
    updateAttributes(newAttributes: Record<string, any>): void;
    validate(data: any): Promise<boolean>;
    validatePartitions(): void;
    
    // Partition operations
    getPartitionKey(options: { partitionName: string; id: string; data: any }): string;
    getFromPartition(options: { id: string; partitionName: string; partitionValues?: Record<string, any> }): Promise<any>;
    
    // Query operations
    query(filter?: any, options?: QueryOptions): Promise<any[]>;
    
    // Versioning operations
    createHistoricalVersion(id: string, data: any): Promise<void>;
    applyVersionMapping(data: any, fromVersion: string, toVersion: string): any;
    
    // Hook operations
    addHook(event: string, fn: Function): void;
    executeHooks(event: string, data: any): Promise<any>;
    
    // Utility methods
    getResourceKey(id: string): string;
    getDefinitionHash(): string;
    export(): any;
    get options(): any;
    
    // Events
    on(event: 'exceedsLimit', handler: (event: ExceedsLimitEvent) => void): this;
    on(event: 'truncate', handler: (event: TruncateEvent) => void): this;
    on(event: 'overflow', handler: (event: OverflowEvent) => void): this;
    on(event: string, handler: (...args: any[]) => void): this;
  }

  /** Client class */
  export class Client extends EventEmitter {
    constructor(config: {
      verbose?: boolean;
      id?: string;
      AwsS3Client?: any;
      connectionString: string;
      parallelism?: number;
    });
    
    // Properties
    verbose: boolean;
    id: string;
    parallelism: number;
    config: ConnectionString;
    client: any;
    
    // S3 operations
    putObject(options: { key: string; metadata?: Record<string, any>; contentType?: string; body?: Buffer; contentEncoding?: string; contentLength?: number }): Promise<any>;
    getObject(key: string): Promise<any>;
    headObject(key: string): Promise<any>;
    copyObject(options: { from: string; to: string }): Promise<any>;
    exists(key: string): Promise<boolean>;
    deleteObject(key: string): Promise<any>;
    deleteObjects(keys: string[]): Promise<any>;
    deleteAll(options?: { prefix?: string }): Promise<any>;
    moveObject(options: { from: string; to: string }): Promise<any>;
    moveAllObjects(options: { prefixFrom: string; prefixTo: string }): Promise<any>;
    
    // List operations
    listObjects(options?: { prefix?: string; maxKeys?: number; continuationToken?: string }): Promise<any>;
    count(options?: { prefix?: string }): Promise<number>;
    getAllKeys(options?: { prefix?: string }): Promise<string[]>;
    getContinuationTokenAfterOffset(params?: { prefix?: string; offset?: number; maxKeys?: number; continuationToken?: string }): Promise<string | null>;
    getKeysPage(params?: { prefix?: string; offset?: number; amount?: number; continuationToken?: string }): Promise<{ keys: string[]; continuationToken?: string }>;
    
    // Utility methods
    createClient(): any;
    sendCommand(command: any): Promise<any>;
    errorProxy(error: any, data: any): Error;
    
    // Events
    on(event: 'command.request', handler: (commandName: string, input: any) => void): this;
    on(event: 'command.response', handler: (commandName: string, response: any, input: any) => void): this;
    on(event: 'putObject', handler: (response: any, options: any) => void): this;
    on(event: 'getObject', handler: (response: any, options: any) => void): this;
    on(event: 'headObject', handler: (response: any, options: any) => void): this;
    on(event: 'copyObject', handler: (response: any, options: any) => void): this;
    on(event: string, handler: (...args: any[]) => void): this;
  }

  /** Connection String class */
  export class ConnectionString {
    constructor(connectionString: string);
    parse(): DatabaseConfig;
    toString(): string;
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    keyPrefix?: string;
  }

  /** Schema class */
  export class Schema {
    constructor(attributes?: Record<string, any>, options?: any);
    validate(data: any, options?: any): boolean;
    migrate(data: any, fromVersion: string, toVersion: string): any;
    export(): any;
    import(data: any): void;
    applyHooksActions(data: any, action: string): any;
    preprocessAttributesForValidation(attributes: any, options?: any): any;
    toArray(value: any): string;
    fromArray(value: string): any;
    toJSON(value: any): string;
    fromJSON(value: string): any;
    toNumber(value: any): number;
    toBool(value: any): boolean;
    fromBool(value: any): boolean;
    extractObjectKeys(obj: any): string[];
  }

  /** Validator class */
  export class Validator {
    constructor(schema?: any);
    validate(data: any): boolean;
    getErrors(): string[];
  }

  /** Cache base class */
  export class Cache {
    constructor(config?: any);
    get(key: string): Promise<any>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    getStats(): any;
  }

  /** Memory Cache class */
  export class MemoryCache extends Cache {
    constructor(config?: MemoryCacheConfig);
  }

  /** S3 Cache class */
  export class S3Cache extends Cache {
    constructor(config?: S3CacheConfig);
  }

  // ============================================================================
  // PLUGIN CLASSES
  // ============================================================================

  /** Plugin base class */
  export class PluginBase extends EventEmitter implements Plugin {
    constructor(options?: any);
    name: string;
    options: any;
    database?: Database;
    
    setup(database: Database): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    beforeSetup(): Promise<void>;
    afterSetup(): Promise<void>;
    beforeStart(): Promise<void>;
    afterStart(): Promise<void>;
    beforeStop(): Promise<void>;
    afterStop(): Promise<void>;
    
    addHook(resourceName: string, event: string, fn: Function): void;
    removeHook(resourceName: string, event: string, fn: Function): void;
    wrapResourceMethod(resourceName: string, methodName: string, wrapper: Function): void;
    
    extractPartitionValues(data: any, resource: Resource): Record<string, any>;
    getNestedFieldValue(data: any, fieldPath: string): any;
  }

  /** Audit Plugin */
  export class AuditPlugin extends PluginBase {
    constructor(config?: AuditPluginConfig);
    logAudit(operation: string, resourceName: string, recordId: string, data?: any, oldData?: any): Promise<void>;
    getAuditLogs(filters?: any): Promise<any[]>;
    getAuditStats(filters?: any): Promise<any>;
  }

  /** Cache Plugin */
  export class CachePlugin extends PluginBase {
    constructor(config?: CachePluginConfig);
    cacheKeyFor(action: string, params?: any): string;
    getCacheStats(): any;
    clearCache(): Promise<void>;
    warmCache(resourceName: string): Promise<void>;
  }

  /** Costs Plugin */
  export class CostsPlugin extends PluginBase {
    constructor(config?: CostsPluginConfig);
    trackOperation(operation: string, size: number, metadata?: any): void;
    getCosts(): any;
    resetCosts(): void;
  }

  /** Fulltext Plugin */
  export class FulltextPlugin extends PluginBase {
    constructor(config?: FulltextPluginConfig);
    search(query: string, options?: any): Promise<any[]>;
    indexResource(resourceName: string): Promise<void>;
    clearIndex(resourceName?: string): Promise<void>;
    getIndexStats(): any;
  }

  /** Metrics Plugin */
  export class MetricsPlugin extends PluginBase {
    constructor(config?: MetricsPluginConfig);
    trackOperation(operation: string, duration: number, success: boolean): void;
    getMetrics(): any;
    getErrorLogs(): any[];
    getPerformanceLogs(): any[];
    getStats(): any;
  }

  /** replicator Plugin */
  export class ReplicatorPlugin extends PluginBase {
    constructor(config?: ReplicatorPluginConfig);
    replicate(operation: string, resourceName: string, data: any, oldData?: any): Promise<void>;
    getreplicatorStats(): any;
    getreplicatorLogs(filters?: any): Promise<any[]>;
    retryFailedreplicators(): Promise<void>;
    syncAllData(targetName: string): Promise<void>;
  }

  // ============================================================================
  // STREAM CLASSES
  // ============================================================================

  /** Resource Reader Stream */
  export class ResourceReader extends NodeJS.ReadableStream {
    constructor(resource: Resource, options?: any);
  }

  /** Resource Writer Stream */
  export class ResourceWriter extends NodeJS.WritableStream {
    constructor(resource: Resource, options?: any);
  }

  /** Resource IDs Reader Stream */
  export class ResourceIdsReader extends NodeJS.ReadableStream {
    constructor(resource: Resource, options?: any);
  }

  /** Resource IDs Page Reader Stream */
  export class ResourceIdsPageReader extends NodeJS.ReadableStream {
    constructor(resource: Resource, options?: any);
  }

  // ============================================================================
  // ERROR CLASSES
  // ============================================================================

  /** Base S3db error */
  export class BaseError extends Error {
    constructor(message: string, code?: string);
  }

  /** Not Found error */
  export class NotFound extends BaseError {
    constructor(message: string);
  }

  /** No Such Key error */
  export class NoSuchKey extends BaseError {
    constructor(message: string);
  }

  /** No Such Bucket error */
  export class NoSuchBucket extends BaseError {
    constructor(message: string);
  }

  /** Unknown Error */
  export class UnknownError extends BaseError {
    constructor(message: string);
  }

  /** Missing Metadata error */
  export class MissingMetadata extends BaseError {
    constructor(message: string);
  }

  /** Invalid Resource Item error */
  export class InvalidResourceItem extends BaseError {
    constructor(message: string);
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /** Convert stream to string */
  export function streamToString(stream: NodeJS.ReadableStream): Promise<string>;

  /** Encrypt data */
  export function encrypt(data: any, passphrase: string): Promise<string>;

  /** Decrypt data */
  export function decrypt(encryptedData: string, passphrase: string): Promise<any>;

  /** Generate ID */
  export function idGenerator(): string;

  /** Generate password */
  export function passwordGenerator(length?: number): string;

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  /** Available behavior names */
  export const AVAILABLE_BEHAVIORS: BehaviorName[];
  
  /** Default behavior name */
  export const DEFAULT_BEHAVIOR: BehaviorName;

  /** Get behavior implementation */
  export function getBehavior(behaviorName: BehaviorName): any;

  // ============================================================================
  // DEFAULT EXPORT
  // ============================================================================

  export default S3db;
}