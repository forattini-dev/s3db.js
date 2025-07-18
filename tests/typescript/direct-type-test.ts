/**
 * Direct TypeScript Type Definition Test
 * This file directly tests the s3db.js types to ensure they are valid TypeScript
 */

/// <reference path="../../src/s3db.d.ts" />

declare const S3db: typeof import('s3db.js').S3db;
declare const Database: typeof import('s3db.js').Database;

// Test 1: Basic type checking for configuration interfaces
function testBasicTypes(): void {
  // Test behavior names
  const userManaged: import('s3db.js').BehaviorName = 'user-managed';
  const enforceLimits: import('s3db.js').BehaviorName = 'enforce-limits';
  const truncateData: import('s3db.js').BehaviorName = 'truncate-data';
  const bodyOverflow: import('s3db.js').BehaviorName = 'body-overflow';
  const bodyOnly: import('s3db.js').BehaviorName = 'body-only';
  
  // Test database configuration
  const dbConfig: import('s3db.js').DatabaseConfig = {
    connectionString: 's3://key:secret@bucket',
    region: 'us-east-1',
    verbose: true,
    parallelism: 10,
    passphrase: 'test-secret',
    versioningEnabled: true,
    cache: {
      type: 'memory',
      ttl: 3600,
      maxSize: 1000
    }
  };
  
  // Test resource configuration
  const resourceConfig: import('s3db.js').ResourceConfig = {
    name: 'users',
    client: {} as any, // Mock client for type testing
    attributes: {
      name: 'string|required',
      email: 'string|required',
      age: 'number|optional'
    },
    behavior: 'user-managed',
    timestamps: true,
    partitions: {
      byCountry: {
        fields: { country: 'string' },
        description: 'Partition by country'
      }
    }
  };
}

// Test 2: Behavior configurations
function testBehaviorConfigurations(): void {
  const enforceLimitsConfig: import('s3db.js').EnforceLimitsBehaviorConfig = {
    enabled: true,
    maxBodySize: 1024 * 1024,
    maxMetadataSize: 2048,
    enforcementMode: 'strict',
    throwOnViolation: true,
    logViolations: true
  };
  
  const truncateConfig: import('s3db.js').DataTruncateBehaviorConfig = {
    enabled: true,
    truncateIndicator: '...',
    preserveStructure: true,
    priorityFields: ['id', 'name']
  };
  
  const overflowConfig: import('s3db.js').BodyOverflowBehaviorConfig = {
    enabled: true,
    metadataReserve: 50,
    priorityFields: ['id', 'name'],
    preserveOrder: false
  };
  
  const bodyOnlyConfig: import('s3db.js').BodyOnlyBehaviorConfig = {
    enabled: true,
    excludeFields: ['_internal'],
    applyToRead: true,
    applyToList: true
  };
}

// Test 3: Plugin configurations
function testPluginConfigurations(): void {
  const auditConfig: import('s3db.js').AuditPluginConfig = {
    enabled: true,
    trackOperations: ['insert', 'update', 'delete'],
    includeData: true,
    logToConsole: false,
    retentionDays: 30
  };
  
  const cacheConfig: import('s3db.js').CachePluginConfig = {
    enabled: true,
    type: 'memory',
    ttl: 3600,
    maxSize: 1000,
    enableCompression: true
  };
  
  const metricsConfig: import('s3db.js').MetricsPluginConfig = {
    enabled: true,
    trackLatency: true,
    trackThroughput: true,
    trackErrors: true,
    exportToCloudWatch: false
  };
  
  const fulltextConfig: import('s3db.js').FulltextPluginConfig = {
    enabled: true,
    searchableFields: ['title', 'content'],
    indexOnInsert: true,
    indexOnUpdate: true,
    searchAlgorithm: 'fuzzy',
    maxResults: 100
  };
}

// Test 4: Replicator configurations
function testReplicatorConfigurations(): void {
  const s3dbReplicatorConfig: import('s3db.js').S3dbReplicatorConfig = {
    connectionString: 's3://key:secret@target-bucket',
    createResources: true,
    overwriteExisting: false,
    preservePartitions: true,
    syncMetadata: true,
    batchSize: 100,
    maxConcurrency: 5,
    logProgress: true
  };
  
  const sqsReplicatorConfig: import('s3db.js').SQSReplicatorConfig = {
    region: 'us-east-1',
    defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
    maxRetries: 3,
    retryDelay: 1000,
    logMessages: true,
    batchSize: 10,
    messageFormat: 'json'
  };
  
  const bigqueryConfig: import('s3db.js').BigQueryReplicatorConfig = {
    projectId: 'my-project',
    datasetId: 'my-dataset',
    tableMapping: { users: 'user_table' },
    logOperations: true,
    batchSize: 1000,
    maxRetries: 3,
    writeDisposition: 'WRITE_APPEND',
    createDisposition: 'CREATE_IF_NEEDED'
  };
  
  const postgresConfig: import('s3db.js').PostgresReplicatorConfig = {
    database: 'mydb',
    resourceArn: 'arn:aws:rds:region:account:cluster:cluster-name',
    secretArn: 'arn:aws:secretsmanager:region:account:secret:secret-name',
    region: 'us-east-1',
    schema: 'public',
    maxRetries: 3,
    useUpsert: true
  };
}

// Test 5: Cache configurations
function testCacheConfigurations(): void {
  const memoryCacheConfig: import('s3db.js').MemoryCacheConfig = {
    maxSize: 1000,
    ttl: 3600,
    enableStats: true,
    evictionPolicy: 'lru',
    logEvictions: false,
    cleanupInterval: 60000,
    caseSensitive: true
  };
  
  const s3CacheConfig: import('s3db.js').S3CacheConfig = {
    bucket: 'cache-bucket',
    region: 'us-east-1',
    prefix: 'cache/',
    ttl: 3600,
    enableCompression: true,
    compressionThreshold: 1024,
    storageClass: 'STANDARD',
    enableEncryption: true,
    maxConcurrency: 10
  };
}

// Test 6: Event types
function testEventTypes(): void {
  const exceedsLimitHandler = (event: import('s3db.js').ExceedsLimitEvent) => {
    console.log(`Operation ${event.operation} exceeds limit: ${event.totalSize} bytes`);
    console.log(`Excess: ${event.excess} bytes over limit of ${event.limit}`);
    if (event.id) {
      console.log(`ID: ${event.id}`);
    }
  };
  
  const truncateHandler = (event: import('s3db.js').TruncateEvent) => {
    console.log(`Field ${event.fieldName} truncated from ${event.originalLength} to ${event.truncatedLength}`);
    console.log(`Operation: ${event.operation}`);
  };
  
  const overflowHandler = (event: import('s3db.js').OverflowEvent) => {
    console.log(`Overflow handled with strategy: ${event.strategy}`);
    console.log(`Original size: ${event.originalSize}, Max size: ${event.maxSize}`);
  };
  
  const definitionChangeHandler = (event: import('s3db.js').DefinitionChangeEvent) => {
    console.log(`Resource ${event.resourceName} definition changed: ${event.type}`);
    if (event.currentHash) {
      console.log(`Current hash: ${event.currentHash}`);
    }
    if (event.savedHash) {
      console.log(`Saved hash: ${event.savedHash}`);
    }
  };
}

// Test 7: Query and operation options
function testOperationOptions(): void {
  const queryOptions: import('s3db.js').QueryOptions = {
    limit: 10,
    offset: 0,
    partition: 'byCountry',
    partitionValues: { country: 'US' }
  };
  
  const pageOptions: import('s3db.js').PageOptions = {
    offset: 0,
    size: 10,
    skipCount: false,
    partition: 'byRegion',
    partitionValues: { region: 'north-america' }
  };
  
  const listOptions: import('s3db.js').ListOptions = {
    limit: 100,
    offset: 0,
    partition: 'byDate',
    partitionValues: { date: '2024-01-01' }
  };
  
  const countOptions: import('s3db.js').CountOptions = {
    partition: 'byCategory',
    partitionValues: { category: 'electronics' }
  };
  
  const insertOptions: import('s3db.js').InsertOptions = {
    id: 'custom-id-123'
  };
  
  const updateOptions: import('s3db.js').UpdateOptions = {
    id: 'existing-id-456'
  };
  
  const deleteOptions: import('s3db.js').DeleteOptions = {
    id: 'delete-id-789'
  };
}

// Test 8: Hook configurations
function testHookConfigurations(): void {
  const hooks: import('s3db.js').HookConfig = {
    beforeInsert: [
      async (data: any) => {
        data.createdAt = new Date().toISOString();
        return data;
      },
      async (data: any) => {
        if (!data.id) {
          data.id = 'auto-' + Math.random().toString(36).substr(2, 9);
        }
        return data;
      }
    ],
    afterInsert: [
      async (data: any) => {
        console.log('Inserted record with ID:', data.id);
      }
    ],
    beforeUpdate: [
      async (data: any) => {
        data.updatedAt = new Date().toISOString();
        return data;
      }
    ],
    afterUpdate: [
      async (data: any) => {
        console.log('Updated record:', data.id);
      }
    ],
    beforeDelete: [
      async (data: any) => {
        console.log('About to delete:', data.id);
        return data;
      }
    ],
    afterDelete: [
      async (data: any) => {
        console.log('Deleted record:', data.id);
      }
    ]
  };
}

// Test 9: Complete configuration example
function testCompleteConfiguration(): void {
  const fullDatabaseConfig: import('s3db.js').DatabaseConfig = {
    connectionString: 's3://access-key:secret-key@my-bucket/prefix',
    region: 'us-west-2',
    verbose: true,
    parallelism: 20,
    passphrase: 'super-secret-passphrase',
    versioningEnabled: true,
    cache: {
      type: 's3',
      bucket: 'cache-bucket',
      region: 'us-west-2',
      ttl: 7200,
      enableCompression: true,
      enableEncryption: true
    } as import('s3db.js').S3CacheConfig,
    plugins: [] // Would contain actual plugin instances
  };
  
  const fullResourceConfig: import('s3db.js').ResourceConfig = {
    name: 'products',
    client: {} as any, // Mock for type testing
    attributes: {
      id: 'string|required',
      name: 'string|required',
      description: 'string|optional',
      price: 'number|required',
      category: 'string|required',
      tags: 'array|optional',
      metadata: 'object|optional',
      isActive: 'boolean|default:true',
      createdAt: 'string|optional',
      updatedAt: 'string|optional'
    },
    behavior: 'body-overflow',
    timestamps: true,
    versioningEnabled: true,
    paranoid: true,
    allNestedObjectsOptional: true,
    autoDecrypt: true,
    cache: true,
    partitions: {
      byCategory: {
        fields: { category: 'string' },
        description: 'Partition products by category'
      },
      byPrice: {
        fields: { priceRange: 'string' },
        description: 'Partition by price range'
      },
      byCreatedDate: {
        fields: { createdAt: 'date|maxlength:10' },
        description: 'Partition by creation date'
      }
    },
    hooks: {
      beforeInsert: [
        async (data: any) => {
          if (!data.id) {
            data.id = 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          }
          data.createdAt = new Date().toISOString();
          data.updatedAt = data.createdAt;
          return data;
        }
      ],
      beforeUpdate: [
        async (data: any) => {
          data.updatedAt = new Date().toISOString();
          return data;
        }
      ]
    }
  };
}

// Type assertion tests to ensure correct typing
function testTypeAssertions(): void {
  // Test that behavior names are strictly typed
  const validBehaviors: import('s3db.js').BehaviorName[] = [
    'user-managed',
    'enforce-limits', 
    'truncate-data',
    'body-overflow',
    'body-only'
  ];
  
  // Test that invalid behavior names are rejected by TypeScript
  // const invalidBehavior: import('s3db.js').BehaviorName = 'invalid-behavior'; // This should cause a type error
  
  // Test that replicator drivers are strictly typed
  type ValidDrivers = import('s3db.js').ReplicatorConfig['driver'];
  const validDrivers: ValidDrivers[] = ['s3db', 'sqs', 'bigquery', 'postgres'];
  
  // Test cache types
  type ValidCacheTypes = import('s3db.js').CacheConfig['type'];
  const validCacheTypes: ValidCacheTypes[] = ['memory', 's3'];
  
  // Test enforcement modes
  type ValidEnforcementModes = import('s3db.js').EnforceLimitsBehaviorConfig['enforcementMode'];
  const validEnforcementModes: ValidEnforcementModes[] = ['strict', 'warn', 'soft'];
}

console.log('TypeScript type definitions are valid and properly structured!'); 