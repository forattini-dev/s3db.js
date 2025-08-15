import { S3db } from '../src/database.class.js';
import { ReplicatorPlugin } from '../src/plugins/replicator.plugin.js';

/**
 * Example: Using the new Replicator System
 * 
 * This example demonstrates how to use the new driver-based replicator system
 * with all four available drivers: s3db, sqs, bigquery, and postgres.
 * 
 * ⚠️  REQUIRED DEPENDENCIES: Before running this example, install the required dependencies:
 * 
 * ```bash
 * # For SQS replicator
 * npm install @aws-sdk/client-sqs
 * 
 * # For BigQuery replicator  
 * npm install @google-cloud/bigquery
 * 
 * # For PostgreSQL replicator
 * npm install pg
 * 
 * # Or install all at once
 * npm install @aws-sdk/client-sqs @google-cloud/bigquery pg
 * ```
 */

async function main() {
  // Create database with replicator plugin
  const s3db = new S3db({
    connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/replicator-demo",
    plugins: [new ReplicatorPlugin({
      enabled: true,
      replicators: [
        // S3DB Replicator - Replicate to another s3db instance
        {
          driver: 's3db',
          resources: ['users', 'products'], // Only replicate these resources
          config: {
            connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup",
            region: 'us-west-2'
          }
        },
        
        // SQS Replicator - Send data to AWS SQS queue
        {
          driver: 'sqs',
          resources: ['orders'], // Only replicate orders to SQS
          config: {
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/s3db-events',
            region: 'us-east-1',
            messageGroupId: 's3db-replicator',
            deduplicationId: true // Enable deduplication
          }
        },
        
        // BigQuery Replicator - Send data to Google BigQuery
        {
          driver: 'bigquery',
          config: {
            projectId: 'my-analytics-project',
            datasetId: 's3db_data',
            location: 'US',
            logTable: 'replicator_log',
            credentials: {
              // Your Google Cloud credentials
              client_email: 'service-account@project.iam.gserviceaccount.com',
              private_key: '-----BEGIN PRIVATE KEY-----\n...'
            }
          },
          resources: {
            users: [
              { actions: ['insert', 'update', 'delete'], table: 'users_table' },
            ],
            orders: [
              { actions: ['insert'], table: 'orders_table' },
              { actions: ['insert'], table: 'orders_analytics' }, // Also replicate to analytics table
            ],
            products: 'products_table' // Short form: equivalent to { actions: ['insert'], table: 'products_table' }
          }
        },
        
        // PostgreSQL Replicator - Send data to PostgreSQL database
        {
          driver: 'postgres',
          config: {
            connectionString: 'postgresql://user:password@localhost:5432/analytics',
            ssl: false,
            logTable: 's3db_replicator_log'
          },
          resources: {
            users: [
              { actions: ['insert', 'update', 'delete'], table: 'users_table' },
            ],
            orders: [
              { actions: ['insert'], table: 'orders_table' },
              { actions: ['insert'], table: 'orders_analytics' }, // Also replicate to analytics table
            ],
            products: 'products_table' // Short form: equivalent to { actions: ['insert'], table: 'products_table' }
          }
        }
      ],
      syncMode: 'async', // Process replicators asynchronously
      retryAttempts: 3,
      retryDelay: 1000
    })]
  });

  await s3db.connect();

  // Create resources
  const users = await s3db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required',
      createdAt: 'string|required'
    }
  });

  const products = await s3db.createResource({
    name: 'products',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      price: 'number|required',
      category: 'string|required'
    }
  });

  const orders = await s3db.createResource({
    name: 'orders',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      productId: 'string|required',
      quantity: 'number|required',
      total: 'number|required'
    }
  });

  // Listen to replicator events
  const ReplicatorPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicatorPlugin');
  
  ReplicatorPlugin.on('replicator.queued', (data) => {
  });

  ReplicatorPlugin.on('replicator.success', (data) => {
  });

  ReplicatorPlugin.on('replicator.failed', (data) => {
  });

  // Listen to replicator-specific events
  ReplicatorPlugin.on('replicator.initialized', (data) => {
  });

  ReplicatorPlugin.on('replicator.validation.failed', (data) => {
  });

  // Insert data - this will trigger replicator to applicable targets
  // Insert data - this will trigger replicator to applicable targets

  const user1 = await users.insert({
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date().toISOString()
  });

  const product1 = await products.insert({
    id: 'prod-1',
    name: 'Laptop',
    price: 999.99,
    category: 'Electronics'
  });

  const order1 = await orders.insert({
    id: 'order-1',
    userId: 'user-1',
    productId: 'prod-1',
    quantity: 1,
    total: 999.99
  });

  // Wait a bit for async replicators to process
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get replicator statistics
  const stats = await ReplicatorPlugin.getreplicatorStats();

  // Get replicator logs
  const logs = await ReplicatorPlugin.getreplicatorLogs({
    limit: 10
  });

  // Test connection to replicators
  for (const replicator of ReplicatorPlugin.replicators) {
    try {
      const isConnected = await replicator.instance.testConnection();
    } catch (error) {
    }
  }

  // Example: Sync all data to a specific replicator
  const s3dbReplicator = ReplicatorPlugin.replicators.find(r => r.driver === 's3db');
  if (s3dbReplicator) {
    await ReplicatorPlugin.syncAllData(s3dbReplicator.id);
  }
}

// Error handling
main().catch(error => {
  process.exit(1);
}); 