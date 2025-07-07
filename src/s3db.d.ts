declare module 's3db.js' {
  // ============================================================================
  // CORE TYPES
  // ============================================================================

  /** Main S3db configuration */
  export interface S3dbConfig {
    connectionString?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    bucket?: string;
    prefix?: string;
    encryption?: boolean;
    compression?: boolean;
    cache?: boolean;
    cacheTTL?: number;
    maxConcurrency?: number;
    retryAttempts?: number;
    retryDelay?: number;
    passphrase?: string;
    parallelism?: number;
    timestamps?: boolean;
    versioning?: boolean;
  }

  /** Resource configuration */
  export interface ResourceConfig {
    name: string;
    attributes?: Record<string, any>;
    behavior?: BehaviorName;
    timestamps?: boolean;
    partitions?: Record<string, PartitionConfig>;
    hooks?: HookConfig;
    options?: Record<string, any>;
    passphrase?: string;
    parallelism?: number;
    versioning?: boolean;
  }

  /** Partition configuration */
  export interface PartitionConfig {
    fields: Record<string, string>;
    description?: string;
  }

  /** Hook configuration */
  export interface HookConfig {
    beforeInsert?: (data: any) => Promise<any> | any;
    afterInsert?: (data: any, result: any) => Promise<void> | void;
    beforeUpdate?: (id: string, data: any) => Promise<any> | any;
    afterUpdate?: (id: string, data: any, result: any) => Promise<void> | void;
    beforeDelete?: (id: string) => Promise<void> | void;
    afterDelete?: (id: string) => Promise<void> | void;
  }

  /** Query options */
  export interface QueryOptions {
    limit?: number;
    offset?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    filter?: any;
    select?: string[];
    partition?: string;
    partitionValues?: Record<string, any>;
  }

  /** Insert options */
  export interface InsertOptions {
    encryption?: boolean;
    compression?: boolean;
    cache?: boolean;
    cacheTTL?: number;
    partition?: string;
    partitionValues?: Record<string, any>;
  }

  /** Update options */
  export interface UpdateOptions extends InsertOptions {
    upsert?: boolean;
  }

  /** Delete options */
  export interface DeleteOptions {
    cascade?: boolean;
    partition?: string;
    partitionValues?: Record<string, any>;
  }

  /** Stream options */
  export interface StreamOptions {
    batchSize?: number;
    concurrency?: number;
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
    | 'data-truncate'
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

  /** Replication Plugin config */
  export interface ReplicationPluginConfig extends PluginConfig {
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

  // ============================================================================
  // MAIN CLASSES
  // ============================================================================

  /** Main S3db class */
  export class S3db {
    constructor(config?: S3dbConfig);
    
    // Connection methods
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    
    // Resource methods
    createResource(config: ResourceConfig): Promise<Resource>;
    getResource(name: string): Resource;
    listResources(): Promise<string[]>;
    deleteResource(name: string, options?: DeleteOptions): Promise<void>;
    
    // Plugin methods
    usePlugin(name: string, config?: PluginConfig): void;
    getPlugin(name: string): any;
    
    // Utility methods
    getVersion(): string;
    getConfig(): S3dbConfig;
    export(): any;
    import(data: any): void;
  }

  /** Resource class */
  export class Resource {
    constructor(config: ResourceConfig);
    
    // CRUD operations
    insert(data: any, options?: InsertOptions): Promise<any>;
    insertMany(data: any[], options?: InsertOptions): Promise<any[]>;
    get(id: string, options?: QueryOptions): Promise<any>;
    list(options?: QueryOptions): Promise<any[]>;
    find(query?: any, options?: QueryOptions): Promise<any[]>;
    findOne(query?: any, options?: QueryOptions): Promise<any | null>;
    update(id: string, data: any, options?: UpdateOptions): Promise<any>;
    upsert(data: any, options?: UpdateOptions): Promise<any>;
    delete(id: string, options?: DeleteOptions): Promise<void>;
    
    // Stream operations
    readable(options?: StreamOptions): Promise<NodeJS.ReadableStream>;
    writable(options?: StreamOptions): Promise<NodeJS.WritableStream>;
    
    // Schema operations
    getSchema(): any;
    setSchema(schema: any): void;
    validate(data: any): boolean;
    
    // Partition operations
    getPartitions(): string[];
    getPartitionKey(options: { partitionName: string; id: string; data: any }): string;
    
    // Behavior operations
    getBehavior(): string;
    setBehavior(behavior: BehaviorName): void;
    
    // Event system
    on(event: 'exceedsLimit', handler: (event: ExceedsLimitEvent) => void): void;
    on(event: 'truncate', handler: (event: TruncateEvent) => void): void;
    on(event: 'overflow', handler: (event: OverflowEvent) => void): void;
    on(event: string, handler: (...args: any[]) => void): void;
    
    off(event: string, handler: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    
    // Utility methods
    getName(): string;
    getConfig(): ResourceConfig;
    export(): any;
  }

  /** Connection String class */
  export class ConnectionString {
    constructor(connectionString: string);
    parse(): S3dbConfig;
    toString(): string;
  }

  /** Validator class */
  export class Validator {
    constructor(schema?: any);
    validate(data: any): boolean;
    getErrors(): string[];
  }

  // ============================================================================
  // ERROR CLASSES
  // ============================================================================

  /** Base S3db error */
  export class S3dbError extends Error {
    constructor(message: string, code?: string);
  }

  /** Validation error */
  export class ValidationError extends S3dbError {
    constructor(message: string, errors?: string[]);
  }

  /** Connection error */
  export class ConnectionError extends S3dbError {
    constructor(message: string);
  }

  /** Behavior error */
  export class BehaviorError extends S3dbError {
    constructor(message: string);
  }

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  /** Available behavior names */
  export const AVAILABLE_BEHAVIORS: BehaviorName[];
  
  /** Default behavior name */
  export const DEFAULT_BEHAVIOR: BehaviorName;

  // ============================================================================
  // DEFAULT EXPORT
  // ============================================================================

  export default S3db;
}