/**
 * Basic Usage TypeScript Test
 * Tests common usage patterns with s3db.js in TypeScript
 */

/// <reference path="../../src/s3db.d.ts" />

import type { 
  DatabaseConfig, 
  ResourceConfig, 
  BehaviorName,
  PluginInterface,
  ReplicatorConfig
} from 's3db.js';

// Test 1: Basic Database Configuration
function testBasicDatabaseConfiguration(): void {
  const config: DatabaseConfig = {
    connectionString: 's3://key:secret@bucket',
    region: 'us-east-1',
    verbose: true,
    parallelism: 10
  };

  // Test that all behavior names are valid
  const behaviors: BehaviorName[] = [
    'user-managed',
    'enforce-limits',
    'truncate-data', 
    'body-overflow',
    'body-only'
  ];

  // This should cause a TypeScript error if uncommented:
  // const invalidBehavior: BehaviorName = 'invalid-behavior';
}

// Test 2: Resource Configuration
function testResourceConfiguration(): void {
  const resourceConfig: ResourceConfig = {
    name: 'users',
    client: {} as any, // Mock for testing
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required|email',
      age: 'number|optional|min:0|max:150',
      profile: {
        bio: 'string|optional|maxlength:500',
        avatar: 'string|optional|url',
        preferences: {
          theme: 'string|optional|enum:light,dark',
          notifications: 'boolean|default:true'
        }
      },
      tags: 'array|optional',
      metadata: 'object|optional'
    },
    behavior: 'body-overflow',
    timestamps: true,
    versioningEnabled: true,
    partitions: {
      byRegion: {
        fields: { 'profile.region': 'string' },
        description: 'Partition users by geographic region'
      },
      bySubscriptionTier: {
        fields: { subscriptionTier: 'string' },
        description: 'Partition by subscription level'
      }
    },
    hooks: {
      beforeInsert: [
        async (data: any) => {
          // Add created timestamp
          data.createdAt = new Date().toISOString();
          return data;
        }
      ],
      afterInsert: [
        async (data: any) => {
          console.log('User created:', data.id);
        }
      ]
    }
  };
}

// Test 3: Plugin Configurations
function testPluginConfigurations(): void {
  // Audit plugin
  const auditConfig: import('s3db.js').AuditPluginConfig = {
    enabled: true,
    trackOperations: ['insert', 'update', 'delete'],
    includeData: false, // For privacy
    retentionDays: 90,
    logToConsole: false
  };

  // Cache plugin  
  const cacheConfig: import('s3db.js').CachePluginConfig = {
    enabled: true,
    type: 'memory',
    ttl: 3600, // 1 hour
    maxSize: 10000,
    enableCompression: true
  };

  // Metrics plugin
  const metricsConfig: import('s3db.js').MetricsPluginConfig = {
    enabled: true,
    trackLatency: true,
    trackThroughput: true,
    trackErrors: true,
    exportToCloudWatch: true
  };
}

// Test 4: Replicator Configurations
function testReplicatorConfigurations(): void {
  // S3 to S3 replication
  const s3Replication: ReplicatorConfig = {
    driver: 's3db',
    config: {
      connectionString: 's3://backup-key:backup-secret@backup-bucket',
      createResources: true,
      preservePartitions: true,
      batchSize: 100,
      logProgress: true
    },
    resources: ['users', 'orders', 'products']
  };

  // SQS replication for event streaming
  const sqsReplication: ReplicatorConfig = {
    driver: 'sqs',
    config: {
      region: 'us-east-1',
      defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/events',
      messageFormat: 'json',
      batchSize: 10,
      logMessages: true
    },
    resources: ['user-events', 'order-events']
  };

  // BigQuery replication for analytics
  const bigqueryReplication: ReplicatorConfig = {
    driver: 'bigquery',
    config: {
      projectId: 'my-analytics-project',
      datasetId: 'production_data',
      batchSize: 1000,
      writeDisposition: 'WRITE_APPEND',
      createDisposition: 'CREATE_IF_NEEDED'
    },
    resources: ['analytics-events']
  };
}

// Test 5: Event Handlers
function testEventHandlers(): void {
  // Limit exceeded handler
  const handleExceedsLimit = (event: import('s3db.js').ExceedsLimitEvent) => {
    console.warn(`${event.operation} operation exceeded S3 metadata limit:`);
    console.warn(`- Size: ${event.totalSize} bytes`);
    console.warn(`- Limit: ${event.limit} bytes`);
    console.warn(`- Excess: ${event.excess} bytes`);
    
    if (event.id) {
      console.warn(`- Resource ID: ${event.id}`);
    }
    
    // Could trigger alerts, logging, etc.
  };

  // Data truncation handler
  const handleTruncation = (event: import('s3db.js').TruncateEvent) => {
    console.info(`Field truncated: ${event.fieldName}`);
    console.info(`- Original length: ${event.originalLength}`);
    console.info(`- Truncated length: ${event.truncatedLength}`);
    console.info(`- Operation: ${event.operation}`);
  };

  // Overflow handler
  const handleOverflow = (event: import('s3db.js').OverflowEvent) => {
    console.info(`Data overflow handled with strategy: ${event.strategy}`);
    console.info(`- Original size: ${event.originalSize} bytes`);
    console.info(`- Max size: ${event.maxSize} bytes`);
  };
}

// Test 6: Advanced Configuration Example
function testAdvancedConfiguration(): void {
  const advancedConfig: DatabaseConfig = {
    connectionString: 's3://prod-key:prod-secret@production-bucket/app-data',
    region: 'us-west-2',
    verbose: false, // Production setting
    parallelism: 50, // High throughput
    passphrase: process.env.S3DB_ENCRYPTION_KEY || 'fallback-key',
    versioningEnabled: true,
    cache: {
      type: 's3',
      bucket: 'cache-bucket',
      region: 'us-west-2',
      ttl: 7200, // 2 hours
      enableCompression: true,
      enableEncryption: true,
      maxConcurrency: 20
    } as import('s3db.js').S3CacheConfig,
    plugins: [] // Would contain actual plugin instances in real code
  };

  const productionResourceConfig: ResourceConfig = {
    name: 'orders',
    client: {} as any, // Mock for testing
    attributes: {
      id: 'string|required',
      customerId: 'string|required',
      items: 'array|required',
      total: 'number|required|min:0',
      currency: 'string|required|enum:USD,EUR,GBP',
      status: 'string|required|enum:pending,processing,shipped,delivered,cancelled',
      shippingAddress: {
        street: 'string|required',
        city: 'string|required', 
        state: 'string|required',
        zipCode: 'string|required',
        country: 'string|required'
      },
      paymentMethod: 'string|required|enum:credit_card,paypal,bank_transfer',
      createdAt: 'string|optional',
      updatedAt: 'string|optional',
      shippedAt: 'string|optional',
      deliveredAt: 'string|optional'
    },
    behavior: 'body-overflow', // Handle large orders
    timestamps: true,
    versioningEnabled: true,
    paranoid: true, // Soft deletes
    autoDecrypt: true,
    cache: true,
    partitions: {
      byStatus: {
        fields: { status: 'string' },
        description: 'Partition orders by status for efficient querying'
      },
      byMonth: {
        fields: { createdAt: 'date|maxlength:7' }, // YYYY-MM format
        description: 'Partition orders by month for archival'
      },
      byCustomer: {
        fields: { customerId: 'string' },
        description: 'Partition orders by customer for GDPR compliance'
      }
    },
    hooks: {
      beforeInsert: [
        async (data: any) => {
          // Generate order ID if not provided
          if (!data.id) {
            data.id = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          }
          
          // Set default status
          if (!data.status) {
            data.status = 'pending';
          }
          
          // Add timestamps
          data.createdAt = new Date().toISOString();
          data.updatedAt = data.createdAt;
          
          return data;
        }
      ],
      afterInsert: [
        async (data: any) => {
          // Send order confirmation email
          console.log(`Order created: ${data.id} for customer ${data.customerId}`);
          
          // Trigger fulfillment process
          if (data.status === 'pending') {
            console.log(`Starting fulfillment for order ${data.id}`);
          }
        }
      ],
      beforeUpdate: [
        async (data: any) => {
          // Update timestamp
          data.updatedAt = new Date().toISOString();
          
          // Add status-specific timestamps
          if (data.status === 'shipped' && !data.shippedAt) {
            data.shippedAt = new Date().toISOString();
          }
          
          if (data.status === 'delivered' && !data.deliveredAt) {
            data.deliveredAt = new Date().toISOString();
          }
          
          return data;
        }
      ],
      afterUpdate: [
        async (data: any) => {
          // Send status update notifications
          console.log(`Order ${data.id} status updated to: ${data.status}`);
          
          // Trigger webhooks for status changes
          if (['shipped', 'delivered', 'cancelled'].includes(data.status)) {
            console.log(`Triggering webhook for order ${data.id} status: ${data.status}`);
          }
        }
      ]
    }
  };
}

// Type assertions to ensure strict typing
function testTypeAssertions(): void {
  // Test that behavior names are strictly typed
  type ValidBehaviors = import('s3db.js').BehaviorName;
  const validBehaviors: ValidBehaviors[] = [
    'user-managed',
    'enforce-limits',
    'truncate-data',
    'body-overflow', 
    'body-only'
  ];

  // Test replicator drivers
  type ValidDrivers = ReplicatorConfig['driver'];
  const validDrivers: ValidDrivers[] = ['s3db', 'sqs', 'bigquery', 'postgres'];

  // Test cache types
  type ValidCacheTypes = import('s3db.js').CacheConfig['type'];
  const validCacheTypes: ValidCacheTypes[] = ['memory', 's3'];

  // Test operation types for events
  type ValidOperations = import('s3db.js').ExceedsLimitEvent['operation'];
  const validOperations: ValidOperations[] = ['insert', 'update', 'upsert'];
}

console.log('Basic TypeScript usage patterns validated successfully!'); 