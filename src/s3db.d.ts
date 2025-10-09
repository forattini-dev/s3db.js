declare module 's3db.js' {
  import { EventEmitter } from 'events';
  import { Readable, Writable } from 'stream';

  // ============================================================================
  // CORE TYPES
  // ============================================================================

  /** HTTP Client configuration for keep-alive and connection pooling */
  export interface HttpClientOptions {
    /** Enable keep-alive for better performance (default: true) */
    keepAlive?: boolean;
    /** Keep-alive duration in milliseconds (default: 1000) */
    keepAliveMsecs?: number;
    /** Maximum number of sockets (default: 50) */
    maxSockets?: number;
    /** Maximum number of free sockets in pool (default: 10) */
    maxFreeSockets?: number;
    /** Request timeout in milliseconds (default: 60000) */
    timeout?: number;
  }

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
    persistHooks?: boolean;
    cache?: CacheConfig | boolean;
    plugins?: (PluginInterface | PluginFunction)[];
    client?: Client;
    httpClientOptions?: HttpClientOptions;
  }

  /** Resource configuration */
  export interface ResourceConfig {
    name: string;
    client: Client;
    database?: Database;
    version?: string;
    attributes: Record<string, any>;
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
    map?: any;
    events?: EventListenerConfig;
  }

  /** Partition configuration */
  export interface PartitionConfig {
    fields: Record<string, string>;
    description?: string;
  }

  /** Hook configuration */
  export interface HookConfig {
    beforeInsert?: Function[];
    afterInsert?: Function[];
    beforeUpdate?: Function[];
    afterUpdate?: Function[];
    beforeDelete?: Function[];
    afterDelete?: Function[];
  }

  /** Event listener configuration */
  export interface EventListenerConfig {
    [eventName: string]: Function | Function[];
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
    truncateIndicator?: string;
    priorityFields?: string[];
    preserveStructure?: boolean;
    fieldLimits?: Record<string, number>;
    defaultLimit?: number;
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
    metadataReserve?: number;
    priorityFields?: string[];
    preserveOrder?: boolean;
    maxBodySize?: number;
    overflowStrategy?: 'truncate' | 'split' | 'reject';
    truncateMode?: 'end' | 'start' | 'middle';
    truncateIndicator?: string;
    preserveStructure?: boolean;
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
  export type PluginFunction = (database: Database) => PluginInterface;

  /** Plugin base interface */
  export interface PluginInterface {
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

  /** Queue Consumer Plugin config */
  export interface QueueConsumerPluginConfig extends PluginConfig {
    consumers?: QueueConsumerConfig[];
  }

  /** Replicator Plugin config */
  export interface ReplicatorPluginConfig extends PluginConfig {
    replicators: ReplicatorConfig[];
    persistReplicatorLog?: boolean;
    replicatorLogResource?: string;
    logErrors?: boolean;
    batchSize?: number;
    maxRetries?: number;
    timeout?: number;
    verbose?: boolean;
  }

  // ============================================================================
  // QUEUE CONSUMER TYPES
  // ============================================================================

  /** Queue Consumer configuration */
  export interface QueueConsumerConfig {
    driver: 'sqs' | 'rabbitmq';
    config: SQSConsumerConfig | RabbitMQConsumerConfig;
    resources?: string[];
  }

  /** SQS Consumer config */
  export interface SQSConsumerConfig {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    queueUrl: string;
    maxNumberOfMessages?: number;
    waitTimeSeconds?: number;
    visibilityTimeout?: number;
    messageRetentionPeriod?: number;
    maxReceiveCount?: number;
    deadLetterQueueUrl?: string;
    logMessages?: boolean;
    autoDeleteMessages?: boolean;
    sqsClientOptions?: Record<string, any>;
  }

  /** RabbitMQ Consumer config */
  export interface RabbitMQConsumerConfig {
    connectionUrl: string;
    queueName: string;
    exchangeName?: string;
    routingKey?: string;
    durable?: boolean;
    autoDelete?: boolean;
    exclusive?: boolean;
    arguments?: Record<string, any>;
    prefetch?: number;
    autoAck?: boolean;
    logMessages?: boolean;
    connectionOptions?: Record<string, any>;
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
    credentials?: Record<string, any>;
    location?: string;
    logTable?: string;
    batchSize?: number;
    maxRetries?: number;
    writeDisposition?: string;
    createDisposition?: string;
    tableMapping?: Record<string, string>;
    logOperations?: boolean;
  }

  /** BigQuery Resource Configuration */
  export interface BigQueryResourceConfig {
    table: string;
    actions?: ('insert' | 'update' | 'delete')[];
    transform?: (data: any) => any;
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
    plugins: Record<string, PluginInterface>;
    pluginList: PluginInterface[];
    cache: CacheConfig | boolean;
    passphrase: string;
    versioningEnabled: boolean;
    client: Client;
    bucket: string;
    keyPrefix: string;
    
    // Connection methods
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    
    // Resource methods
    createResource(config: ResourceConfig): Promise<Resource>;
    resource(name: string): Resource;
    getResource(name: string): Promise<Resource>;
    listResources(): Promise<Array<{ name: string }>>;
    resourceExists(name: string): boolean;
    resourceExistsWithSameHash(config: { 
      name: string; 
      attributes: any; 
      behavior?: string; 
      partitions?: Record<string, PartitionConfig>;
      options?: any;
    }): { exists: boolean; sameHash: boolean; hash: string | null; existingHash?: string };
    
    // Plugin methods
    startPlugins(): Promise<void>;
    usePlugin(plugin: PluginInterface | PluginFunction, name?: string): Promise<PluginInterface>;
    
    // Utility methods
    generateDefinitionHash(definition: any, behavior?: string): string;
    getNextVersion(versions?: Record<string, any>): string;
    detectDefinitionChanges(savedMetadata: any): DefinitionChangeEvent[];
    uploadMetadataFile(): Promise<void>;
    blankMetadataStructure(): any;
    
    // Configuration
    get config(): {
      version: string;
      s3dbVersion: string;
      bucket: string;
      keyPrefix: string;
      parallelism: number;
      verbose: boolean;
    };
    
    // Events
    on(event: 'connected', handler: (date: Date) => void): this;
    on(event: 'disconnected', handler: (date: Date) => void): this;
    on(event: 'metadataUploaded', handler: (metadata: any) => void): this;
    on(event: 'resourceDefinitionsChanged', handler: (data: { changes: DefinitionChangeEvent[]; metadata: any }) => void): this;
    on(event: 's3db.resourceCreated', handler: (name: string) => void): this;
    on(event: 's3db.resourceUpdated', handler: (name: string) => void): this;
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
    database?: Database;
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
      beforeInsert: Function[];
      afterInsert: Function[];
      beforeUpdate: Function[];
      afterUpdate: Function[];
      beforeDelete: Function[];
      afterDelete: Function[];
    };
    attributes: Record<string, any>;
    schema: Schema;
    map: any;
    
    // CRUD operations
    insert(data: any): Promise<any>;
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
    page(options?: PageOptions): Promise<{ 
      items: any[]; 
      totalItems?: number; 
      page: number; 
      pageSize: number; 
      totalPages?: number; 
      hasMore: boolean;
      _debug: {
        requestedSize: number;
        requestedOffset: number;
        actualItemsReturned: number;
        skipCount: boolean;
        hasTotalItems: boolean;
        error?: string;
      };
    }>;
    
    // Stream operations
    readable(): Promise<Readable>;
    writable(): Promise<Writable>;
    
    // Content operations
    setContent(options: { id: string; buffer: Buffer; contentType?: string }): Promise<void>;
    content(id: string): Promise<Buffer>;
    hasContent(id: string): Promise<boolean>;
    deleteContent(id: string): Promise<void>;
    
    // Schema and validation
    updateAttributes(newAttributes: Record<string, any>): { oldAttributes: Record<string, any>; newAttributes: Record<string, any> };
    validate(data: any): Promise<{ 
      original: any; 
      isValid: boolean; 
      errors: any[]; 
      data: any; 
    }>;
    validatePartitions(): void;
    
    // Partition operations
    getPartitionKey(options: { partitionName: string; id: string; data: any }): string;
    getFromPartition(options: { id: string; partitionName: string; partitionValues?: Record<string, any> }): Promise<any>;
    
    // Query operations
    query(filter?: any, options?: QueryOptions): Promise<any[]>;
    
    // Versioning operations
    createHistoricalVersion(id: string, data: any): Promise<void>;
    applyVersionMapping(data: any, fromVersion: string, toVersion: string): any;
    getSchemaForVersion(version: string): Promise<Schema>;
    
    // Hook operations
    addHook(event: string, fn: Function): void;
    executeHooks(event: string, data: any): Promise<any>;
    
    // Utility methods
    getResourceKey(id: string): string;
    getDefinitionHash(): string;
    export(): any;
    get options(): any;
    applyDefaults(data: any): any;
    
    // Events
    on(event: 'exceedsLimit', handler: (event: ExceedsLimitEvent) => void): this;
    on(event: 'truncate', handler: (event: TruncateEvent) => void): this;
    on(event: 'overflow', handler: (event: OverflowEvent) => void): this;
    on(event: 'versionUpdated', handler: (event: { oldVersion: string; newVersion: string }) => void): this;
    on(event: 'get', handler: (data: any) => void): this;
    on(event: 'page', handler: (result: any) => void): this;
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
    putObject(options: { 
      key: string; 
      metadata?: Record<string, any>; 
      contentType?: string; 
      body?: Buffer; 
      contentEncoding?: string; 
      contentLength?: number;
    }): Promise<any>;
    getObject(key: string): Promise<any>;
    headObject(key: string): Promise<any>;
    copyObject(options: { from: string; to: string }): Promise<any>;
    exists(key: string): Promise<boolean>;
    deleteObject(key: string): Promise<any>;
    deleteObjects(keys: string[]): Promise<{ deleted: any[]; notFound: any[] }>;
    deleteAll(options?: { prefix?: string }): Promise<number>;
    moveObject(options: { from: string; to: string }): Promise<boolean>;
    moveAllObjects(options: { prefixFrom: string; prefixTo: string }): Promise<string[]>;
    
    // List operations
    listObjects(options?: { 
      prefix?: string; 
      maxKeys?: number; 
      continuationToken?: string;
    }): Promise<any>;
    count(options?: { prefix?: string }): Promise<number>;
    getAllKeys(options?: { prefix?: string }): Promise<string[]>;
    getContinuationTokenAfterOffset(params?: { 
      prefix?: string; 
      offset?: number; 
      maxKeys?: number; 
      continuationToken?: string;
    }): Promise<string | null>;
    getKeysPage(params?: { 
      prefix?: string; 
      offset?: number; 
      amount?: number;
    }): Promise<string[]>;
    
    // Utility methods
    createClient(): any;
    sendCommand(command: any): Promise<any>;
    
    // Events
    on(event: 'command.request', handler: (commandName: string, input: any) => void): this;
    on(event: 'command.response', handler: (commandName: string, response: any, input: any) => void): this;
    on(event: 'putObject', handler: (response: any, options: any) => void): this;
    on(event: 'getObject', handler: (response: any, options: any) => void): this;
    on(event: 'headObject', handler: (response: any, options: any) => void): this;
    on(event: 'copyObject', handler: (response: any, options: any) => void): this;
    on(event: 'deleteObjects', handler: (report: any, keys: string[]) => void): this;
    on(event: 'deleteAll', handler: (data: { prefix?: string; batch: number; total: number }) => void): this;
    on(event: 'deleteAllComplete', handler: (data: { prefix?: string; totalDeleted: number }) => void): this;
    on(event: 'listObjects', handler: (response: any, options: any) => void): this;
    on(event: 'count', handler: (count: number, options: any) => void): this;
    on(event: 'getAllKeys', handler: (keys: string[], options: any) => void): this;
    on(event: 'getContinuationTokenAfterOffset', handler: (token: string | null, params: any) => void): this;
    on(event: 'getKeysPage', handler: (keys: string[], params: any) => void): this;
    on(event: 'moveAllObjects', handler: (result: { results: string[]; errors: any[] }, options: any) => void): this;
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
    constructor(config: {
      name?: string;
      attributes?: Record<string, any>;
      passphrase?: string;
      version?: string;
      options?: any;
      map?: any;
    });
    
    validate(data: any, options?: any): Promise<boolean | any[]>;
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
    unmapper(metadata: any): Promise<any>;
    map: any;
  }

  /** Validator class */
  export class Validator {
    constructor(schema?: any);
    validate(data: any): boolean;
    getErrors(): string[];
  }

  // ============================================================================
  // CACHE CLASSES
  // ============================================================================

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
    constructor(config: S3CacheConfig);
  }

  // ============================================================================
  // PLUGIN CLASSES
  // ============================================================================

  /** Plugin base class */
  export class Plugin extends EventEmitter implements PluginInterface {
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
  export class AuditPlugin extends Plugin {
    constructor(config?: AuditPluginConfig);
    logAudit(operation: string, resourceName: string, recordId: string, data?: any, oldData?: any): Promise<void>;
    getAuditLogs(filters?: any): Promise<any[]>;
    getAuditStats(filters?: any): Promise<any>;
  }

  /** Cache Plugin */
  export class CachePlugin extends Plugin {
    constructor(config?: CachePluginConfig);
    cacheKeyFor(action: string, params?: any): string;
    getCacheStats(): any;
    clearCache(): Promise<void>;
    warmCache(resourceName: string): Promise<void>;
  }

  /** Costs Plugin */
  export class CostsPlugin extends Plugin {
    constructor(config?: CostsPluginConfig);
    trackOperation(operation: string, size: number, metadata?: any): void;
    getCosts(): any;
    resetCosts(): void;
  }

  /** Fulltext Plugin */
  export class FullTextPlugin extends Plugin {
    constructor(config?: FulltextPluginConfig);
    search(query: string, options?: any): Promise<any[]>;
    indexResource(resourceName: string): Promise<void>;
    clearIndex(resourceName?: string): Promise<void>;
    getIndexStats(): any;
  }

  /** Metrics Plugin */
  export class MetricsPlugin extends Plugin {
    constructor(config?: MetricsPluginConfig);
    trackOperation(operation: string, duration: number, success: boolean): void;
    getMetrics(): any;
    getErrorLogs(): any[];
    getPerformanceLogs(): any[];
    getStats(): any;
  }

  /** Queue Consumer Plugin */
  export class QueueConsumerPlugin {
    constructor(config?: QueueConsumerPluginConfig);
    setup(database: Database): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    getConsumerStats(): any;
    getConsumerLogs(filters?: any): Promise<any[]>;
  }

  /** Replicator stats information */
  export interface ReplicatorStats {
    replicators: Array<{
      id: string;
      driver: string;
      config: any;
      status: any;
    }>;
    stats: {
      totalReplications: number;
      totalErrors: number;
      lastSync: string | null;
    };
    lastSync: string | null;
  }

  /** Replicator Plugin */
  export class ReplicatorPlugin extends Plugin {
    constructor(config?: ReplicatorPluginConfig);
    replicate(operation: string, resourceName: string, data: any, oldData?: any): Promise<void>;
    getReplicatorStats(): Promise<ReplicatorStats>;
    getReplicatorLogs(filters?: any): Promise<any[]>;
    retryFailedReplicators(): Promise<{ retried: number }>;
    syncAllData(targetName: string): Promise<void>;
  }

  // ============================================================================
  // REPLICATOR CLASSES
  // ============================================================================

  /** Base Replicator class */
  export class BaseReplicator {
    constructor(config: any);
    replicate(operation: string, resourceName: string, data: any, oldData?: any): Promise<void>;
    syncData(resourceName: string, data: any[]): Promise<void>;
    getStats(): any;
    getLogs(filters?: any): Promise<any[]>;
  }

  /** S3DB Replicator class */
  export class S3dbReplicator extends BaseReplicator {
    constructor(config: S3dbReplicatorConfig);
  }

  /** SQS Replicator class */
  export class SqsReplicator extends BaseReplicator {
    constructor(config: SQSReplicatorConfig);
  }

  /** BigQuery Replicator class */
  export class BigqueryReplicator extends BaseReplicator {
    constructor(config: BigQueryReplicatorConfig, resources: Record<string, string | BigQueryResourceConfig | BigQueryResourceConfig[]>);
  }

  /** Postgres Replicator class */
  export class PostgresReplicator extends BaseReplicator {
    constructor(config: PostgresReplicatorConfig);
  }

  // ============================================================================
  // STREAM CLASSES
  // ============================================================================

  /** Resource Reader Stream */
  export class ResourceReader extends Readable {
    constructor(config: { resource: Resource; options?: any });
    build(): Promise<Readable>;
  }

  /** Resource Writer Stream */
  export class ResourceWriter extends Writable {
    constructor(config: { resource: Resource; options?: any });
    build(): Promise<Writable>;
  }

  /** Resource IDs Reader Stream */
  export class ResourceIdsReader extends Readable {
    constructor(config: { resource: Resource; options?: any });
    build(): Promise<Readable>;
  }

  /** Resource IDs Page Reader Stream */
  export class ResourceIdsPageReader extends Readable {
    constructor(config: { resource: Resource; options?: any });
    build(): Promise<Readable>;
  }

  // ============================================================================
  // ERROR CLASSES
  // ============================================================================

  /** Base S3db error */
  export class BaseError extends Error {
    constructor(config: {
      verbose?: boolean;
      bucket?: string;
      key?: string;
      message: string;
      code?: string;
      statusCode?: number;
      requestId?: string;
      awsMessage?: string;
      original?: Error;
      commandName?: string;
      commandInput?: any;
      metadata?: any;
      suggestion?: string;
      [key: string]: any;
    });
    
    bucket?: string;
    key?: string;
    thrownAt: Date;
    code?: string;
    statusCode?: number;
    requestId?: string;
    awsMessage?: string;
    original?: Error;
    commandName?: string;
    commandInput?: any;
    metadata?: any;
    suggestion?: string;
    data: any;
    
    toJson(): any;
  }

  /** Not Found error */
  export class NotFound extends BaseError {
    constructor(config: any);
  }

  /** No Such Key error */
  export class NoSuchKey extends BaseError {
    constructor(config: any);
  }

  /** No Such Bucket error */
  export class NoSuchBucket extends BaseError {
    constructor(config: any);
  }

  /** Unknown Error */
  export class UnknownError extends BaseError {
    constructor(message: string, config?: any);
  }

  /** Missing Metadata error */
  export class MissingMetadata extends BaseError {
    constructor(config: any);
  }

  /** Invalid Resource Item error */
  export class InvalidResourceItem extends BaseError {
    constructor(config: any);
  }

  /** Resource Error */
  export class ResourceError extends BaseError {
    constructor(message: string, config?: any);
  }

  /** Resource Not Found error */
  export class ResourceNotFound extends BaseError {
    constructor(config: any);
  }

  /** Partition Error */
  export class PartitionError extends BaseError {
    constructor(config: any);
  }

  /** Crypto Error */
  export class CryptoError extends BaseError {
    constructor(message: string, config?: any);
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /** Convert stream to string */
  export function streamToString(stream: Readable): Promise<string>;

  /** Encrypt data */
  export function encrypt(data: any, passphrase: string): Promise<string>;

  /** Decrypt data */
  export function decrypt(encryptedData: string, passphrase: string): Promise<any>;

  /** SHA256 hash function */
  export function sha256(message: string): Promise<ArrayBuffer>;

  /** Generate ID */
  export function idGenerator(): string;

  /** Generate password */
  export function passwordGenerator(length?: number): string;

  /** Try function wrapper */
  export function tryFn<T>(fn: () => Promise<T>): Promise<[boolean, Error | null, T | null]>;
  export function tryFnSync<T>(fn: () => T): [boolean, Error | null, T | null];

  /** Calculate total size in bytes */
  export function calculateTotalSize(data: any): number;

  /** Calculate effective limit */
  export function calculateEffectiveLimit(config: {
    s3Limit: number;
    systemConfig: {
      version?: string;
      timestamps?: boolean;
      id?: string;
    };
  }): number;

  /** Calculate attribute sizes */
  export function calculateAttributeSizes(data: any): Record<string, number>;

  /** Calculate UTF-8 bytes */
  export function calculateUTF8Bytes(str: string): number;

  /** Map AWS error to s3db error */
  export function mapAwsError(error: Error, context: any): Error;

  /** Base62 encoding */
  export function base62Encode(num: number): string;
  export function base62Decode(str: string): number;

  // ============================================================================
  // BEHAVIOR FUNCTIONS
  // ============================================================================

  /** Available behavior names */
  export const AVAILABLE_BEHAVIORS: BehaviorName[];
  
  /** Default behavior name */
  export const DEFAULT_BEHAVIOR: BehaviorName;

  /** Get behavior implementation */
  export function getBehavior(behaviorName: BehaviorName): {
    handleInsert: (params: { resource: Resource; data: any; mappedData: any; originalData?: any }) => Promise<{ mappedData: any; body: string }>;
    handleUpdate: (params: { resource: Resource; id: string; data: any; mappedData: any; originalData?: any }) => Promise<{ mappedData: any; body: string }>;
    handleUpsert: (params: { resource: Resource; id: string; data: any; mappedData: any; originalData?: any }) => Promise<{ mappedData: any; body: string }>;
    handleGet: (params: { resource: Resource; metadata: any; body: string }) => Promise<{ metadata: any; body: string }>;
  };

  /** Available behaviors object */
  export const behaviors: Record<BehaviorName, any>;

  // ============================================================================
  // REPLICATOR CONSTANTS
  // ============================================================================

  /** Available replicator drivers */
  export const REPLICATOR_DRIVERS: {
    s3db: typeof S3dbReplicator;
    sqs: typeof SqsReplicator;
    bigquery: typeof BigqueryReplicator;
    postgres: typeof PostgresReplicator;
  };

  /** Create replicator instance */
  export function createReplicator(driver: string, config: any): BaseReplicator;

  // ============================================================================
  // DEFAULT EXPORT
  // ============================================================================

  export default S3db;
}