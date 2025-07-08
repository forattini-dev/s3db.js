import { S3db } from '../src/database.class.js';
import { ReplicationPlugin } from '../src/plugins/replication.plugin.js';

/**
 * Example: Using the new Replicator System
 * 
 * This example demonstrates how to use the new driver-based replicator system
 * with all four available drivers: s3db, sqs, bigquery, and postgres.
 * 
 * ⚠️  REQUIRED DEPENDENCIES: Before running this example, install the required dependencies:
 * 
 * ```bash
 * # For SQS replication
 * npm install @aws-sdk/client-sqs
 * 
 * # For BigQuery replication  
 * npm install @google-cloud/bigquery
 * 
 * # For PostgreSQL replication
 * npm install pg
 * 
 * # Or install all at once
 * npm install @aws-sdk/client-sqs @google-cloud/bigquery pg
 * ```
 */

async function main() {
  console.log('🚀 Starting Replicator System Example\n');

  // Create database with replication plugin
  const s3db = new S3db({
    connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/replicator-demo",
    plugins: [new ReplicationPlugin({
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
            messageGroupId: 's3db-replication',
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
            logTable: 'replication_log',
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
            logTable: 's3db_replication_log'
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
      syncMode: 'async', // Process replications asynchronously
      retryAttempts: 3,
      retryDelay: 1000
    })]
  });

  await s3db.connect();
  console.log('✅ Connected to S3DB with replication plugin\n');

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

  console.log('✅ Created resources: users, products, orders\n');

  // Listen to replication events
  const replicationPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicationPlugin');
  
  replicationPlugin.on('replication.queued', (data) => {
    console.log(`📤 Replication queued: ${data.item.resourceName} ${data.item.operation}`);
  });

  replicationPlugin.on('replication.success', (data) => {
    console.log(`✅ Replication succeeded: ${data.item.resourceName} ${data.item.operation} (${data.attempts} attempts)`);
  });

  replicationPlugin.on('replication.failed', (data) => {
    console.log(`❌ Replication failed: ${data.item.resourceName} ${data.item.operation} - ${data.lastError}`);
  });

  // Listen to replicator-specific events
  replicationPlugin.on('replicator.initialized', (data) => {
    console.log(`🔧 Replicator initialized: ${data.driver}`);
  });

  replicationPlugin.on('replicator.validation.failed', (data) => {
    console.log(`⚠️  Replicator validation failed: ${data.driver} - ${data.errors.join(', ')}`);
  });

  // Insert data - this will trigger replication to applicable targets
  console.log('📝 Inserting test data...\n');

  const user1 = await users.insert({
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date().toISOString()
  });
  console.log('👤 Created user:', user1.id);

  const product1 = await products.insert({
    id: 'prod-1',
    name: 'Laptop',
    price: 999.99,
    category: 'Electronics'
  });
  console.log('💻 Created product:', product1.id);

  const order1 = await orders.insert({
    id: 'order-1',
    userId: 'user-1',
    productId: 'prod-1',
    quantity: 1,
    total: 999.99
  });
  console.log('🛒 Created order:', order1.id);

  // Wait a bit for async replications to process
  console.log('\n⏳ Waiting for replications to process...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get replication statistics
  const stats = await replicationPlugin.getReplicationStats();
  console.log('\n📊 Replication Statistics:');
  console.log(JSON.stringify(stats, null, 2));

  // Get replication logs
  const logs = await replicationPlugin.getReplicationLogs({
    limit: 10
  });
  console.log('\n📋 Recent Replication Logs:');
  logs.forEach(log => {
    console.log(`- ${log.resourceName} ${log.operation} (${log.status}): ${log.recordId}`);
  });

  // Test connection to replicators
  console.log('\n🔍 Testing replicator connections...');
  for (const replicator of replicationPlugin.replicators) {
    try {
      const isConnected = await replicator.instance.testConnection();
      console.log(`- ${replicator.driver}: ${isConnected ? '✅ Connected' : '❌ Failed'}`);
    } catch (error) {
      console.log(`- ${replicator.driver}: ❌ Error - ${error.message}`);
    }
  }

  // Example: Sync all data to a specific replicator
  console.log('\n🔄 Syncing all data to S3DB replicator...');
  const s3dbReplicator = replicationPlugin.replicators.find(r => r.driver === 's3db');
  if (s3dbReplicator) {
    await replicationPlugin.syncAllData(s3dbReplicator.id);
    console.log('✅ Full sync completed');
  }

  console.log('\n🎉 Replicator System Example Completed!');
}

// Error handling
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
}); 