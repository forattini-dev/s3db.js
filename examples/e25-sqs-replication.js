import { join } from 'path';
import Database from '../src/database.class.js';
import Client from '../src/client.class.js';
import { ReplicatorPlugin } from '../src/plugins/replicator.plugin.js';

/**
 * SQS replicator Example
 * 
 * This example demonstrates how to use the SQS replicator with resource-specific queues
 * and standardized message structure.
 * 
 * ⚠️  REQUIRED DEPENDENCY: Before running this example, install the AWS SQS SDK:
 * 
 * ```bash
 * npm install @aws-sdk/client-sqs
 * # or
 * yarn add @aws-sdk/client-sqs
 * # or
 * pnpm add @aws-sdk/client-sqs
 * ```
 */

const testPrefix = join('s3db', 'examples', new Date().toISOString().substring(0, 10), 'sqs-replicator-' + Date.now());

async function main() {
  // Initialize database
  const client = new Client({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}`
  });

  const database = new Database({
    client,
    name: 'sqs-replicator-example'
  });

  await database.connect();

  // Create resources
  const usersResource = await database.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required',
      age: 'number|optional',
      status: 'string|optional'
    }
  });

  const ordersResource = await database.createResource({
    name: 'orders',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      amount: 'number|required',
      status: 'string|required',
      items: 'array|optional'
    }
  });

  const productsResource = await database.createResource({
    name: 'products',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      price: 'number|required',
      category: 'string|optional',
      stock: 'number|optional'
    }
  });

  // Configure SQS replicator Plugin with resource-specific queues
  const ReplicatorPlugin = new ReplicatorPlugin({
    enabled: true,
    syncMode: 'sync', // Process immediately for demo
    replicators: [
      {
        driver: 'sqs',
        config: {
          // Resource-specific queues
          queues: {
            users: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-events.fifo',
            orders: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-events.fifo',
            products: 'https://sqs.us-east-1.amazonaws.com/123456789012/products-events.fifo'
          },
          // Fallback queue for any other resources
          defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/default-events.fifo',
          // FIFO queue settings
          messageGroupId: 's3db-replicator',
          deduplicationId: true,
          region: 'us-east-1'
        },
        resources: ['users', 'orders', 'products'] // Replicate all these resources
      }
    ]
  });

  // Setup plugin
  await ReplicatorPlugin.setup(database);
  await ReplicatorPlugin.start();

  // Listen to replicator events
  ReplicatorPlugin.on('replicator.success', (data) => {
    console.log('✅ replicator succeeded:', {
      resource: data.item.resource,
      operation: data.item.operation,
      recordId: data.item.recordId,
      attempts: data.attempts
    });
  });

  ReplicatorPlugin.on('replicator.failed', (data) => {
    console.log('❌ replicator failed:', {
      resource: data.item.resource,
      operation: data.item.operation,
      recordId: data.item.recordId,
      error: data.lastError
    });
  });

  // Example 1: Insert operation
  const user = await usersResource.insert({
    id: 'user-001',
          name: 'John Silva',
          email: 'john@example.com',
    age: 30,
    status: 'active'
  });

  // Example 2: Update operation
  const updatedUser = await usersResource.update('user-001', {
          name: 'John Silva Santos',
    age: 31,
    status: 'verified'
  });

  // Example 3: Insert order
  const order = await ordersResource.insert({
    id: 'order-001',
    userId: 'user-001',
    amount: 299.99,
    status: 'pending',
    items: ['product-001', 'product-002']
  });

  // Example 4: Insert product
  const product = await productsResource.insert({
    id: 'product-001',
    name: 'Laptop Dell XPS 13',
    price: 1299.99,
    category: 'electronics',
    stock: 50
  });

  // Example 5: Delete operation
  await usersResource.delete('user-001');

  // Example 6: Batch operations
  const moreUsers = [
    { id: 'user-002', name: 'Mary Santos', email: 'mary@example.com', age: 25 },
    { id: 'user-003', name: 'Peter Costa', email: 'peter@example.com', age: 35 }
  ];
  const batchUsers = await usersResource.insertMany(moreUsers);

  // Example 7: DeleteMany operation
  await usersResource.deleteMany(['user-002', 'user-003']);

  // Show replicator stats
  const stats = await ReplicatorPlugin.getreplicatorStats();
  console.log(JSON.stringify(stats, null, 2));

  // Show replicator logs
  const logs = await ReplicatorPlugin.getreplicatorLogs({ limit: 5 });
  console.log(JSON.stringify(logs, null, 2));

  // Cleanup
  await ReplicatorPlugin.stop();
  await database.disconnect();

  console.log('\n✨ Example completed successfully!');
  console.log('\n💡 Key Features Demonstrated:');
  console.log('   • Resource-specific SQS queues');
  console.log('   • Standardized message structure');
  console.log('   • Before/after data for updates');
  console.log('   • FIFO queue support with deduplication');
  console.log('   • Fallback queue for unspecified resources');
  console.log('   • Comprehensive event logging');
}

main().catch(console.error); 