/**
 * Example 59: Simple REST API - 5 Minutes to Production
 *
 * The simplest possible REST API example.
 * From zero to a working API in just a few lines of code!
 *
 * IMPORTANT: This example requires LocalStack or AWS S3.
 *
 * To run with LocalStack:
 *   1. Install: brew install localstack  (or see https://docs.localstack.cloud/getting-started/installation/)
 *   2. Start: localstack start
 *   3. Run: node docs/examples/e59-api-rest-simple.js
 *
 * To run with AWS S3:
 *   1. Set AWS credentials in ~/.aws/credentials
 *   2. Change connectionString below to use real S3 bucket
 *   3. Run: node docs/examples/e59-api-rest-simple.js
 */

import { Database } from '../../src/index.js';
import { APIPlugin } from '../../src/plugins/api/index.js';

console.log('\n🚀 Simple REST API Example\n');

// ============================================================================
// STEP 1: Create Database
// ============================================================================

// For LocalStack (development):
const connectionString = 's3://test:test@simple-api-demo?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';

// For AWS S3 (production):
// const connectionString = 's3://ACCESS_KEY:SECRET_KEY@your-bucket-name?region=us-east-1';

const db = new Database({ connectionString });

console.log('📦 Connecting to database...');

try {
  await db.connect();
  console.log('✅ Database connected\n');
} catch (error) {
  console.error('❌ Failed to connect to database');
  console.error('');
  console.error('Make sure LocalStack is running:');
  console.error('  brew install localstack');
  console.error('  localstack start');
  console.error('');
  console.error('Or use real AWS S3 credentials.');
  console.error('');
  console.error('Error:', error.message);
  process.exit(1);
}

// ============================================================================
// STEP 2: Create a Resource (like a table)
// ============================================================================

const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    price: 'number|required',
    description: 'string',
    inStock: 'boolean|default:true'
  }
});

console.log('✅ Created "products" resource\n');

// ============================================================================
// STEP 3: Start the API Server
// ============================================================================

await db.usePlugin(new APIPlugin({
  port: 3000,
  cors: { enabled: true }
}));

console.log('🚀 REST API running at http://localhost:3000\n');

// ============================================================================
// THAT'S IT! Your API is ready!
// ============================================================================

console.log('📚 Available Endpoints:\n');
console.log('   GET    http://localhost:3000/v1/products           - List all products');
console.log('   GET    http://localhost:3000/v1/products/:id       - Get one product');
console.log('   POST   http://localhost:3000/v1/products           - Create product');
console.log('   PUT    http://localhost:3000/v1/products/:id       - Update product');
console.log('   DELETE http://localhost:3000/v1/products/:id       - Delete product');
console.log('');
console.log('   GET    http://localhost:3000/docs                  - Interactive docs (Redoc)');
console.log('   GET    http://localhost:3000/health                - Health check');
console.log('\n');

// ============================================================================
// STEP 4 (Optional): Add some sample data
// ============================================================================

console.log('📝 Adding sample products...\n');

await products.insert({
  name: 'Laptop',
  price: 999.99,
  description: 'High-performance laptop',
  inStock: true
});

await products.insert({
  name: 'Mouse',
  price: 29.99,
  description: 'Wireless mouse',
  inStock: true
});

await products.insert({
  name: 'Keyboard',
  price: 79.99,
  description: 'Mechanical keyboard',
  inStock: false
});

console.log('✅ Added 3 sample products\n');

// ============================================================================
// TRY IT OUT!
// ============================================================================

console.log('🧪 Try these commands in your terminal:\n');
console.log('   # List all products');
console.log('   curl http://localhost:3000/v1/products\n');

console.log('   # Get products in stock');
console.log('   curl http://localhost:3000/v1/products?inStock=true\n');

console.log('   # Create a new product');
console.log('   curl -X POST http://localhost:3000/v1/products \\');
console.log('        -H "Content-Type: application/json" \\');
console.log('        -d \'{"name":"Monitor","price":299.99,"description":"4K Monitor"}\'\n');

console.log('   # Open interactive docs in browser');
console.log('   open http://localhost:3000/docs\n');

console.log('=' .repeat(80));
console.log('✨ Your API is live! Press Ctrl+C to stop.');
console.log('=' .repeat(80) + '\n');

// Keep server running
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});
