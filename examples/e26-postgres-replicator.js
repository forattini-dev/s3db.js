/**
 * PostgreSQL Replicator Example
 * 
 * This example demonstrates the new PostgreSQL replicator configuration structure
 * that supports per-resource table mapping and action filtering.
 * 
 * ⚠️  REQUIRED DEPENDENCY: You must install the PostgreSQL client library:
 * npm install pg
 * 
 * Features demonstrated:
 * - Multiple tables per resource
 * - Action filtering (insert, update, delete)
 * - Short form configuration
 * - Operation logging
 * - UPSERT operations with ON CONFLICT handling
 */

import S3db from '../src/index.js';
import { ReplicatorPlugin } from '../src/plugins/index.js';

// Example configuration - replace with your actual PostgreSQL credentials
const POSTGRES_CONFIG = {
  connectionString: 'postgresql://user:password@localhost:5432/analytics',
  // OR use individual parameters:
  // host: 'localhost',
  // port: 5432,
  // database: 'analytics',
  // user: 'user',
  // password: 'password',
  ssl: false,
  logTable: 's3db_replicator_log'
};

async function main() {
  console.log('🚀 PostgreSQL Replicator Example\n');

  // Create database with PostgreSQL replicator
  const s3db = new S3db({
    connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/postgres-demo",
    plugins: [new ReplicatorPlugin({
      enabled: true,
      replicators: [
        {
          driver: 'postgres',
          config: POSTGRES_CONFIG,
          resources: {
            // Users: replicate all operations to users table
            users: [
              { actions: ['insert', 'update', 'delete'], table: 'users_table' },
            ],
            
            // Orders: replicate only inserts to two different tables
            orders: [
              { actions: ['insert'], table: 'orders_table' },
              { actions: ['insert'], table: 'orders_analytics' }, // Also replicate to analytics table
            ],
            
            // Products: short form - just the table name (insert only)
            products: 'products_table',
            
            // Categories: short form
            categories: 'categories_table',
            
            // Reviews: short form
            reviews: 'reviews_table',
            
            // Inventory: short form
            inventory: 'inventory_table',
          }
        }
      ],
      syncMode: 'async',
      retryAttempts: 3,
      retryDelay: 1000
    })]
  });

  await s3db.connect();
  console.log('✅ Connected to S3DB with PostgreSQL replicator\n');

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

  const orders = await s3db.createResource({
    name: 'orders',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      productId: 'string|required',
      quantity: 'number|required',
      total: 'number|required',
      status: 'string|required'
    }
  });

  const products = await s3db.createResource({
    name: 'products',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      price: 'number|required',
      category: 'string|required',
      description: 'string'
    }
  });

  const categories = await s3db.createResource({
    name: 'categories',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      description: 'string'
    }
  });

  const reviews = await s3db.createResource({
    name: 'reviews',
    attributes: {
      id: 'string|required',
      productId: 'string|required',
      userId: 'string|required',
      rating: 'number|required',
      comment: 'string'
    }
  });

  const inventory = await s3db.createResource({
    name: 'inventory',
    attributes: {
      id: 'string|required',
      productId: 'string|required',
      quantity: 'number|required',
      location: 'string|required'
    }
  });

  console.log('✅ Created resources: users, orders, products, categories, reviews, inventory\n');

  // Listen to replicator events
  const ReplicatorPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicatorPlugin');
  
  ReplicatorPlugin.on('replicator.success', (data) => {
    console.log(`✅ replicator succeeded: ${data.item.resourceName} ${data.item.operation}`);
  });

  ReplicatorPlugin.on('replicator.failed', (data) => {
    console.log(`❌ replicator failed: ${data.item.resourceName} ${data.item.operation} - ${data.lastError}`);
  });

  // Listen to PostgreSQL replicator events
  ReplicatorPlugin.on('replicator.replicated', (data) => {
    if (data.replicator === 'PostgresReplicator') {
      console.log(`📊 PostgreSQL replicated: ${data.resourceName} ${data.operation} to ${data.tables.length} tables`);
      if (data.results) {
        data.results.forEach(result => {
          console.log(`  - Table ${result.table}: ${result.success ? '✅' : '❌'} (${result.rowCount} rows)`);
        });
      }
    }
  });

  // Insert test data
  console.log('📝 Inserting test data...\n');

  const user1 = await users.insert({
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date().toISOString()
  });
  console.log('👤 Created user:', user1.id);

  const category1 = await categories.insert({
    id: 'cat-1',
    name: 'Electronics',
    description: 'Electronic devices and gadgets'
  });
  console.log('📂 Created category:', category1.id);

  const product1 = await products.insert({
    id: 'prod-1',
    name: 'Laptop',
    price: 999.99,
    category: 'cat-1',
    description: 'High-performance laptop'
  });
  console.log('💻 Created product:', product1.id);

  const order1 = await orders.insert({
    id: 'order-1',
    userId: 'user-1',
    productId: 'prod-1',
    quantity: 1,
    total: 999.99,
    status: 'pending'
  });
  console.log('🛒 Created order:', order1.id);

  const review1 = await reviews.insert({
    id: 'review-1',
    productId: 'prod-1',
    userId: 'user-1',
    rating: 5,
    comment: 'Excellent laptop!'
  });
  console.log('⭐ Created review:', review1.id);

  const inventory1 = await inventory.insert({
    id: 'inv-1',
    productId: 'prod-1',
    quantity: 10,
    location: 'Warehouse A'
  });
  console.log('📦 Created inventory:', inventory1.id);

  // Test update operation (only users table supports updates)
  console.log('\n🔄 Testing update operation...');
  await users.update('user-1', {
    name: 'John Smith',
    email: 'johnsmith@example.com'
  });
  console.log('✅ Updated user');

  // Test delete operation (only users table supports deletes)
  console.log('\n🗑️  Testing delete operation...');
  await users.delete('user-1');
  console.log('✅ Deleted user');

  // Wait for async replicators to process
  console.log('\n⏳ Waiting for replicators to process...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get replicator statistics
  const stats = await ReplicatorPlugin.getreplicatorStats();
  console.log('\n📊 replicator Statistics:');
  console.log(JSON.stringify(stats, null, 2));

  // Test PostgreSQL connection
  console.log('\n🔍 Testing PostgreSQL connection...');
  const postgresReplicator = ReplicatorPlugin.replicators.find(r => r.driver === 'postgres');
  if (postgresReplicator) {
    try {
      const isConnected = await postgresReplicator.instance.testConnection();
      console.log(`- PostgreSQL: ${isConnected ? '✅ Connected' : '❌ Failed'}`);
    } catch (error) {
      console.log(`- PostgreSQL: ❌ Error - ${error.message}`);
    }
  }

  console.log('\n🎉 PostgreSQL Replicator Example Completed!');
  console.log('\n📋 Summary of what was replicated:');
  console.log('- users: insert, update, delete → users_table');
  console.log('- orders: insert → orders_table AND orders_analytics');
  console.log('- products: insert → products_table');
  console.log('- categories: insert → categories_table');
  console.log('- reviews: insert → reviews_table');
  console.log('- inventory: insert → inventory_table');
  console.log('- All operations logged to: s3db_replicator_log');
  console.log('\n💡 PostgreSQL Features:');
  console.log('- UPSERT operations with ON CONFLICT handling');
  console.log('- Transaction support for data consistency');
  console.log('- JSONB data storage for flexible schemas');
  console.log('- Automatic index creation for log table');
}

// Error handling
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
}); 