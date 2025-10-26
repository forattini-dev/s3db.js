/**
 * Example 77 - API Plugin: Flexible Version Prefix Configuration
 *
 * Demonstrates the flexible version prefix configuration system:
 * - Global configuration (applies to all resources)
 * - Resource-level override
 * - Custom prefix strings (e.g., 'api/v1', 'v2')
 * - No prefix (clean URLs - DEFAULT)
 *
 * Prerequisites:
 * ```bash
 * pnpm add hono @hono/node-server @hono/swagger-ui
 * ```
 *
 * Features demonstrated:
 * - Global versionPrefix setting
 * - Per-resource versionPrefix override
 * - false: no prefix (DEFAULT - clean URLs)
 * - true: use resource version
 * - string: custom prefix
 *
 * Endpoints created:
 * - /products              → versionPrefix: false (global default - no prefix)
 * - /v1/users              → versionPrefix: true (with version)
 * - /api/v2/orders         → versionPrefix: 'api/v2' (custom prefix)
 * - /categories            → versionPrefix: false (uses global default)
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

async function main() {
  console.log('🚀 API Plugin Example - Flexible Version Prefix\n');

  // Initialize database
  const database = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/api-version-config'
  });

  await database.connect();

  // Create resources
  console.log('Creating resources...');

  const products = await database.createResource({
    name: 'products',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      price: 'number|required'
    }
  });

  const users = await database.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      username: 'string|required',
      email: 'string|required|email'
    }
  });

  const orders = await database.createResource({
    name: 'orders',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      total: 'number|required'
    }
  });

  const categories = await database.createResource({
    name: 'categories',
    attributes: {
      id: 'string|required',
      name: 'string|required'
    }
  });

  console.log('✅ Resources created\n');

  // Configure API Plugin with flexible version prefix
  console.log('Starting API server with flexible version prefix configuration...\n');

  const apiPlugin = new ApiPlugin({
    port: 3000,
    host: '0.0.0.0',
    verbose: true,

    // GLOBAL configuration: applies to all resources by default
    // Can be: false (no prefix - DEFAULT), true (use version), or string (custom prefix)
    // versionPrefix: false,  // Default - can be omitted (clean URLs)

    docs: {
      enabled: true,
      title: 'Flexible Versioning API',
      version: '1.0.0',
      description: 'Demonstrates global and per-resource version prefix configuration'
    },

    cors: {
      enabled: true,
      origin: '*'
    },

    resources: {
      // products: Uses GLOBAL default (versionPrefix: false)
      // Routes will be: /products (no prefix)
      products: {
        auth: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE']
        // versionPrefix not specified → uses global default (false)
      },

      // users: OVERRIDE with version prefix
      // Routes will be: /v1/users
      users: {
        auth: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        versionPrefix: true  // Override: use resource version
      },

      // orders: OVERRIDE with custom prefix
      // Routes will be: /api/v2/orders
      orders: {
        auth: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        versionPrefix: 'api/v2'  // Override: custom prefix
      },

      // categories: Uses GLOBAL default (like products)
      // Routes will be: /categories (no prefix)
      categories: {
        auth: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE']
        // versionPrefix not specified → uses global default (false)
      }
    }
  });

  await database.usePlugin(apiPlugin);

  console.log('✅ API server running on http://localhost:3000\n');

  console.log('📋 Routes Configuration:\n');
  console.log('┌────────────┬──────────────┬────────────────────────────┐');
  console.log('│ Resource   │ versionPrefix│ Routes                     │');
  console.log('├────────────┼──────────────┼────────────────────────────┤');
  console.log('│ products   │ false (glob) │ /products (no prefix)      │');
  console.log('│ users      │ true         │ /v1/users                  │');
  console.log('│ orders     │ "api/v2"     │ /api/v2/orders             │');
  console.log('│ categories │ false (glob) │ /categories (no prefix)    │');
  console.log('└────────────┴──────────────┴────────────────────────────┘\n');

  console.log('🔧 Configuration Hierarchy:');
  console.log('  1. Global versionPrefix: false (DEFAULT - clean URLs)');
  console.log('  2. Resource versionPrefix overrides global');
  console.log('  3. Options:');
  console.log('     • false → no prefix (DEFAULT - clean URLs)');
  console.log('     • true  → use resource version (v1, v2, etc)');
  console.log('     • string → custom prefix (e.g., "api/v1", "v2")\n');

  console.log('📚 Documentation:');
  console.log('  http://localhost:3000/docs           - Interactive API docs');
  console.log('  http://localhost:3000/openapi.json   - OpenAPI spec\n');

  // Add sample data
  console.log('📝 Adding sample data...');

  await products.insert({ id: 'prod-1', name: 'Laptop', price: 1200 });
  await users.insert({ id: 'user-1', username: 'john', email: 'john@example.com' });
  await orders.insert({ id: 'order-1', userId: 'user-1', total: 1200 });
  await categories.insert({ id: 'cat-1', name: 'Electronics' });

  console.log('✅ Sample data added\n');

  // Test all route variations
  console.log('🧪 Testing all route variations...\n');

  try {
    // Test 1: Global default (false) - products
    console.log('1️⃣ GET /products (global versionPrefix: false - no prefix)');
    const r1 = await fetch('http://localhost:3000/products');
    const d1 = await r1.json();
    console.log(`   Status: ${r1.status} - Found ${d1.data.length} products`);
    console.log(`   ✅ Clean URL (no prefix)\n`);

    // Test 2: Override with true - users
    console.log('2️⃣ GET /v1/users (versionPrefix: true)');
    const r2 = await fetch('http://localhost:3000/v1/users');
    const d2 = await r2.json();
    console.log(`   Status: ${r2.status} - Found ${d2.data.length} users`);
    console.log(`   ✅ Uses resource version as prefix\n`);

    // Test 3: Override with custom string - orders
    console.log('3️⃣ GET /api/v2/orders (versionPrefix: "api/v2")');
    const r3 = await fetch('http://localhost:3000/api/v2/orders');
    const d3 = await r3.json();
    console.log(`   Status: ${r3.status} - Found ${d3.data.length} orders`);
    console.log(`   ✅ Custom prefix string\n`);

    // Test 4: Global default (false) - categories
    console.log('4️⃣ GET /categories (global versionPrefix: false)');
    const r4 = await fetch('http://localhost:3000/categories');
    const d4 = await r4.json();
    console.log(`   Status: ${r4.status} - Found ${d4.data.length} categories`);
    console.log(`   ✅ Uses global default (same as products)\n`);

    // Test 5: Verify wrong paths don't work
    console.log('5️⃣ GET /users (should fail - users has version prefix)');
    const r5 = await fetch('http://localhost:3000/users');
    console.log(`   Status: ${r5.status}`);
    console.log(`   ${r5.status === 404 ? '✅' : '❌'} Correctly returns 404\n`);

    console.log('6️⃣ GET /v1/orders (should fail - orders uses custom prefix)');
    const r6 = await fetch('http://localhost:3000/v1/orders');
    console.log(`   Status: ${r6.status}`);
    console.log(`   ${r6.status === 404 ? '✅' : '❌'} Correctly returns 404\n`);

    console.log('7️⃣ GET /v1/users/user-1 (single resource with version)');
    const r7 = await fetch('http://localhost:3000/v1/users/user-1');
    const d7 = await r7.json();
    console.log(`   Status: ${r7.status} - User: ${d7.data.username}`);
    console.log(`   ✅ Single resource routes work correctly\n`);

    console.log('8️⃣ POST /api/v2/orders (create with custom prefix)');
    const r8 = await fetch('http://localhost:3000/api/v2/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'order-2', userId: 'user-1', total: 500 })
    });
    const d8 = await r8.json();
    console.log(`   Status: ${r8.status} - Created: ${d8.data.id}`);
    console.log(`   ✅ POST works with custom prefix\n`);

    // Test 9: Check OpenAPI spec
    console.log('9️⃣ GET /openapi.json (verify all paths in spec)');
    const rSpec = await fetch('http://localhost:3000/openapi.json');
    const spec = await rSpec.json();

    const expectedPaths = {
      '/products': true,
      '/v1/users': true,
      '/api/v2/orders': true,
      '/categories': true,
      '/users': false,      // should NOT exist (users has /v1/ prefix)
      '/v1/products': false,  // should NOT exist (products has no prefix)
      '/v1/orders': false  // should NOT exist
    };

    console.log('   Checking OpenAPI spec paths:');
    for (const [path, shouldExist] of Object.entries(expectedPaths)) {
      const exists = path in spec.paths;
      const status = exists === shouldExist ? '✅' : '❌';
      const msg = shouldExist ? 'exists' : 'does not exist';
      console.log(`     ${status} ${path} ${msg}`);
    }
    console.log('');

  } catch (err) {
    console.error('Error testing API:', err.message);
  }

  console.log('✅ All tests completed!\n');

  console.log('💡 Configuration Examples:\n');
  console.log('// Global configuration (all resources)');
  console.log('new ApiPlugin({');
  console.log('  // versionPrefix: false, // DEFAULT - all resources have no prefix (clean URLs)');
  console.log('  versionPrefix: true,      // All resources use their version (v1, v2, etc)');
  console.log('  versionPrefix: "api",     // All resources use custom prefix');
  console.log('  resources: { ... }');
  console.log('});\n');

  console.log('// Per-resource override');
  console.log('resources: {');
  console.log('  users: {');
  console.log('    versionPrefix: true     // Override: use version prefix');
  console.log('  },');
  console.log('  products: {');
  console.log('    versionPrefix: "api/v2" // Override: custom prefix');
  console.log('  },');
  console.log('  orders: {');
  console.log('    // versionPrefix not set → uses global default (false = no prefix)');
  console.log('  }');
  console.log('}\n');

  console.log('💡 Try these commands in another terminal:');
  console.log('  curl http://localhost:3000/products         # Global default (no prefix)');
  console.log('  curl http://localhost:3000/v1/users         # With version');
  console.log('  curl http://localhost:3000/api/v2/orders    # Custom prefix');
  console.log('  curl http://localhost:3000/categories       # Global default (no prefix)');
  console.log('  curl http://localhost:3000/docs             # Interactive docs\n');

  console.log('⏸️  Server is running. Press Ctrl+C to stop.');

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping server...');
    await apiPlugin.stop();
    await database.disconnect();
    console.log('✅ Server stopped');
    process.exit(0);
  });
}

main().catch(console.error);
