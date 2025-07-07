import { join } from 'path';
import Database from '../src/database.class.js';
import Client from '../src/client.class.js';
import { ReplicationPlugin } from '../src/plugins/replication.plugin.js';

/**
 * SQS Replication Example
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

const testPrefix = join('s3db', 'examples', new Date().toISOString().substring(0, 10), 'sqs-replication-' + Date.now());

console.log('🚀 SQS Replication Example');
console.log('==========================\n');

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
    name: 'sqs-replication-example'
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

  console.log('📦 Resources created successfully\n');

  // Configure SQS Replication Plugin with resource-specific queues
  const replicationPlugin = new ReplicationPlugin({
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
          messageGroupId: 's3db-replication',
          deduplicationId: true,
          region: 'us-east-1'
        },
        resources: ['users', 'orders', 'products'] // Replicate all these resources
      }
    ]
  });

  // Setup plugin
  await replicationPlugin.setup(database);
  await replicationPlugin.start();

  console.log('🔧 SQS Replication Plugin configured with resource-specific queues\n');

  // Listen to replication events
  replicationPlugin.on('replication.success', (data) => {
    console.log('✅ Replication succeeded:', {
      resource: data.item.resourceName,
      operation: data.item.operation,
      recordId: data.item.recordId,
      attempts: data.attempts
    });
  });

  replicationPlugin.on('replication.failed', (data) => {
    console.log('❌ Replication failed:', {
      resource: data.item.resourceName,
      operation: data.item.operation,
      recordId: data.item.recordId,
      error: data.lastError
    });
  });

  console.log('📝 Demonstrating SQS Message Structure\n');

  // Example 1: Insert operation
  console.log('1️⃣ INSERT Operation:');
  const user = await usersResource.insert({
    id: 'user-001',
    name: 'João Silva',
    email: 'joao@example.com',
    age: 30,
    status: 'active'
  });

  console.log('   Message structure:');
  console.log('   {');
  console.log('     resource: "users",');
  console.log('     action: "insert",');
  console.log('     data: { _v: 0, id: "user-001", name: "João Silva", ... },');
  console.log('     timestamp: "2024-01-01T10:00:00.000Z",');
  console.log('     source: "s3db-replication"');
  console.log('   }');
  console.log('   → Sent to: https://sqs.us-east-1.amazonaws.com/123456789012/users-events.fifo\n');

  // Example 2: Update operation
  console.log('2️⃣ UPDATE Operation:');
  const updatedUser = await usersResource.update('user-001', {
    name: 'João Silva Santos',
    age: 31,
    status: 'verified'
  });

  console.log('   Message structure:');
  console.log('   {');
  console.log('     resource: "users",');
  console.log('     action: "update",');
  console.log('     before: { _v: 0, id: "user-001", name: "João Silva", ... },');
  console.log('     data: { _v: 1, id: "user-001", name: "João Silva Santos", ... },');
  console.log('     timestamp: "2024-01-01T10:05:00.000Z",');
  console.log('     source: "s3db-replication"');
  console.log('   }');
  console.log('   → Sent to: https://sqs.us-east-1.amazonaws.com/123456789012/users-events.fifo\n');

  // Example 3: Insert order
  console.log('3️⃣ INSERT Order:');
  const order = await ordersResource.insert({
    id: 'order-001',
    userId: 'user-001',
    amount: 299.99,
    status: 'pending',
    items: ['product-001', 'product-002']
  });

  console.log('   Message structure:');
  console.log('   {');
  console.log('     resource: "orders",');
  console.log('     action: "insert",');
  console.log('     data: { _v: 0, id: "order-001", userId: "user-001", ... },');
  console.log('     timestamp: "2024-01-01T10:10:00.000Z",');
  console.log('     source: "s3db-replication"');
  console.log('   }');
  console.log('   → Sent to: https://sqs.us-east-1.amazonaws.com/123456789012/orders-events.fifo\n');

  // Example 4: Insert product
  console.log('4️⃣ INSERT Product:');
  const product = await productsResource.insert({
    id: 'product-001',
    name: 'Laptop Dell XPS 13',
    price: 1299.99,
    category: 'electronics',
    stock: 50
  });

  console.log('   Message structure:');
  console.log('   {');
  console.log('     resource: "products",');
  console.log('     action: "insert",');
  console.log('     data: { _v: 0, id: "product-001", name: "Laptop Dell XPS 13", ... },');
  console.log('     timestamp: "2024-01-01T10:15:00.000Z",');
  console.log('     source: "s3db-replication"');
  console.log('   }');
  console.log('   → Sent to: https://sqs.us-east-1.amazonaws.com/123456789012/products-events.fifo\n');

  // Example 5: Delete operation
  console.log('5️⃣ DELETE Operation:');
  await usersResource.delete('user-001');

  console.log('   Message structure:');
  console.log('   {');
  console.log('     resource: "users",');
  console.log('     action: "delete",');
  console.log('     data: { _v: 1, id: "user-001", name: "João Silva Santos", ... },');
  console.log('     timestamp: "2024-01-01T10:20:00.000Z",');
  console.log('     source: "s3db-replication"');
  console.log('   }');
  console.log('   → Sent to: https://sqs.us-east-1.amazonaws.com/123456789012/users-events.fifo\n');

  // Example 6: Batch operations
  console.log('6️⃣ BATCH Operations:');
  const batchUsers = await usersResource.insertMany([
    { id: 'user-002', name: 'Maria Santos', email: 'maria@example.com', age: 25 },
    { id: 'user-003', name: 'Pedro Costa', email: 'pedro@example.com', age: 35 }
  ]);

  console.log('   Each user generates a separate message to the users queue\n');

  // Example 7: DeleteMany operation
  console.log('7️⃣ DELETE MANY Operation:');
  await usersResource.deleteMany(['user-002', 'user-003']);

  console.log('   Each deletion generates a separate message to the users queue\n');

  // Show replication stats
  console.log('📊 Replication Statistics:');
  const stats = await replicationPlugin.getReplicationStats();
  console.log(JSON.stringify(stats, null, 2));

  // Show replication logs
  console.log('\n📋 Recent Replication Logs:');
  const logs = await replicationPlugin.getReplicationLogs({ limit: 5 });
  console.log(JSON.stringify(logs, null, 2));

  // Cleanup
  await replicationPlugin.stop();
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