/**
 * ReplicatorPlugin TypeScript Type Test
 * Validates that our TypeScript definitions match the implementation
 */

/// <reference path="../../src/s3db.d.ts" />

import { ReplicatorPlugin, ReplicatorPluginConfig, ReplicatorStats } from 's3db.js';

// Test 1: ReplicatorPluginConfig is complete
function testReplicatorPluginConfig(): void {
  const config: ReplicatorPluginConfig = {
    enabled: true,
    replicators: [
      {
        driver: 's3db',
        config: {
          connectionString: 's3://backup:key@backup-bucket',
          createResources: true,
          preservePartitions: true,
          batchSize: 100
        },
        resources: ['users', 'orders']
      }
    ],
    // New fields added
    persistReplicatorLog: true,
    replicatorLogResource: 'custom_replicator_logs',
    logErrors: true,
    batchSize: 50,
    maxRetries: 5,
    timeout: 60000,
    verbose: true
  };

  // TypeScript should autocomplete all these fields
  console.log('Config validated:', config.persistReplicatorLog);
}

// Test 2: ReplicatorStats type is specific
function testReplicatorStats(): void {
  // Mock plugin instance
  const plugin = {} as ReplicatorPlugin;

  // This should return a properly typed object, not 'any'
  const stats: Promise<ReplicatorStats> = plugin.getReplicatorStats();

  stats.then(result => {
    // TypeScript should know the structure
    const totalReps: number = result.stats.totalReplications;
    const totalErrs: number = result.stats.totalErrors;
    const lastSync: string | null = result.stats.lastSync;
    const replicators = result.replicators;

    // Should autocomplete these properties
    console.log('Total replications:', totalReps);
    console.log('Total errors:', totalErrs);
    console.log('Last sync:', lastSync);
    console.log('Replicators count:', replicators.length);
  });
}

// Test 3: Method names match implementation
function testMethodNames(): void {
  const plugin = {} as ReplicatorPlugin;

  // ✅ Correct method name (after fix)
  const retryResult: Promise<{ retried: number }> = plugin.retryFailedReplicators();

  // This would fail with old definition:
  // const oldResult = plugin.retryFailedReplications();

  retryResult.then(result => {
    const count: number = result.retried;
    console.log('Retried count:', count);
  });
}

// Test 4: All plugin methods are accessible
function testAllMethods(): void {
  const plugin = {} as ReplicatorPlugin;

  // Core methods
  plugin.replicate('insert', 'users', { id: '1' }, undefined);
  plugin.getReplicatorStats();
  plugin.getReplicatorLogs({ resourceName: 'users' });
  plugin.retryFailedReplicators();
  plugin.syncAllData('backup');

  // Lifecycle methods (inherited from Plugin)
  plugin.setup({} as any);
  plugin.start();
  plugin.stop();
}

// Test 5: Replicator drivers are correctly typed
function testReplicatorDrivers(): void {
  // All valid drivers
  const s3dbConfig: ReplicatorPluginConfig = {
    replicators: [{ driver: 's3db', config: { connectionString: 's3://test' } as any, resources: [] }]
  };

  const sqsConfig: ReplicatorPluginConfig = {
    replicators: [{ driver: 'sqs', config: { region: 'us-east-1', defaultQueueUrl: 'url' } as any, resources: [] }]
  };

  const bigqueryConfig: ReplicatorPluginConfig = {
    replicators: [{ driver: 'bigquery', config: { projectId: 'test', datasetId: 'test' } as any, resources: [] }]
  };

  const postgresConfig: ReplicatorPluginConfig = {
    replicators: [{ driver: 'postgres', config: { database: 'test', resourceArn: 'arn', secretArn: 'arn' } as any, resources: [] }]
  };

  // This would cause TypeScript error (invalid driver):
  // const invalidConfig: ReplicatorPluginConfig = {
  //   replicators: [{ driver: 'invalid', config: {}, resources: [] }]
  // };
}

// Test 6: Complex replicator configuration
function testComplexReplicatorConfig(): void {
  const config: ReplicatorPluginConfig = {
    enabled: true,
    verbose: true,
    persistReplicatorLog: true,
    replicatorLogResource: 'audit_replication_logs',
    logErrors: true,
    batchSize: 100,
    maxRetries: 3,
    timeout: 30000,
    replicators: [
      // S3DB to S3DB backup
      {
        driver: 's3db',
        config: {
          connectionString: 's3://backup-key:backup-secret@backup-bucket/replica',
          region: 'us-west-2',
          createResources: true,
          preservePartitions: true,
          syncMetadata: true,
          batchSize: 50,
          maxConcurrency: 10,
          logProgress: true,
          validateData: true,
          retryAttempts: 3,
          retryDelay: 1000
        },
        resources: ['users', 'orders', 'products']
      },
      // Event streaming to SQS
      {
        driver: 'sqs',
        config: {
          region: 'us-east-1',
          defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123/events',
          messageFormat: 'json',
          batchSize: 10,
          logMessages: true,
          messageDelaySeconds: 0,
          useFIFO: false,
          compressMessages: true
        },
        resources: ['user_events', 'order_events']
      },
      // Analytics to BigQuery
      {
        driver: 'bigquery',
        config: {
          projectId: 'analytics-project',
          datasetId: 'production_data',
          location: 'US',
          batchSize: 1000,
          maxRetries: 3,
          writeDisposition: 'WRITE_APPEND',
          createDisposition: 'CREATE_IF_NEEDED',
          logOperations: true
        },
        resources: ['analytics_events']
      }
    ]
  };

  // TypeScript should validate this entire structure
  console.log('Complex config validated:', config.replicators.length);
}

console.log('ReplicatorPlugin TypeScript types validated successfully!');
