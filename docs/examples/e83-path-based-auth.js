/**
 * Example 83: Path-based Authentication
 *
 * Demonstrates how to configure authentication rules based on path patterns
 * using wildcards (* and **) with automatic specificity-based precedence.
 *
 * Use cases:
 * - Public endpoints (health checks, enums)
 * - Protected API endpoints (JWT required)
 * - Admin endpoints (JWT + API Key required)
 * - Mixed environments with different auth requirements
 *
 * Run:
 *   node docs/examples/e83-path-based-auth.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

const APP_PORT = 3000;

async function setupDatabase() {
  // Create database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/path-auth-example',
    encryptionKey: 'path-auth-encryption-key-32chars!'
  });

  await db.connect();

  // Create users resource (for authentication)
  const usersResource = await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      username: 'string|required',
      password: 'secret|required',
      role: 'string|optional',
      apiToken: 'string|optional'
    },
    timestamps: true
  });

  // Create admin user
  await usersResource.insert({
    id: 'admin',
    username: 'admin',
    password: 'Admin123!',
    role: 'admin',
    apiToken: 'admin-api-token-secure-123'
  });

  // Create regular user
  await usersResource.insert({
    id: 'user1',
    username: 'john',
    password: 'User123!',
    role: 'user',
    apiToken: 'user-api-token-456'
  });

  // Create products resource (public in /api/enums/*, protected in /api/v1/*)
  await db.createResource({
    name: 'products',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      price: 'number|required',
      category: 'string|optional'
    },
    timestamps: true
  });

  // Create enums resource (public)
  await db.createResource({
    name: 'enums',
    attributes: {
      id: 'string|required',
      type: 'string|required',
      value: 'string|required'
    }
  });

  // Seed data
  await db.resources.products.insert({ id: 'p1', name: 'Laptop', price: 1200, category: 'electronics' });
  await db.resources.products.insert({ id: 'p2', name: 'Mouse', price: 25, category: 'electronics' });

  await db.resources.enums.insert({ id: 'e1', type: 'category', value: 'electronics' });
  await db.resources.enums.insert({ id: 'e2', type: 'category', value: 'books' });
  await db.resources.enums.insert({ id: 'e3', type: 'status', value: 'active' });

  return db;
}

async function setupAPI(db) {
  // Create API Plugin with path-based authentication
  const apiPlugin = new ApiPlugin({
    port: APP_PORT,
    verbose: true,

    // Authentication configuration
    auth: {
      // Define available auth drivers
      drivers: [
        {
          driver: 'jwt',
          config: {
            secret: 'my-jwt-secret-key-256-bits-long',
            expiresIn: '7d'
          }
        },
        {
          driver: 'apiKey',
          config: {
            headerName: 'X-API-Key'
          }
        }
      ],
      resource: 'users',

      // ✨ NEW: Path-based authentication rules
      // Rules are evaluated in order of specificity (most specific wins)
      pathAuth: [
        // ========================================
        // PUBLIC PATHS (no authentication)
        // ========================================
        {
          pattern: '/health/**',
          required: false,  // Public
          drivers: []       // No auth drivers needed
        },
        {
          pattern: '/api/enums/**',
          required: false   // Public enums endpoint
        },

        // ========================================
        // PROTECTED PATHS (JWT required)
        // ========================================
        {
          pattern: '/api/v1/**',
          drivers: ['jwt'],  // Only JWT auth
          required: true
        },

        // ========================================
        // ADMIN PATHS (JWT + API Key required)
        // More specific than /api/v1/** above
        // ========================================
        {
          pattern: '/api/v1/admin/**',
          drivers: ['jwt', 'apiKey'],  // Both JWT and API Key accepted
          required: true
        },

        // ========================================
        // SUPER ADMIN (exact match, highest priority)
        // ========================================
        {
          pattern: '/api/v1/admin/system',
          drivers: ['jwt', 'apiKey'],  // Both required in headers
          required: true
        }
      ]
    },

    // Resource configuration
    resources: {
      products: {
        versionPrefix: 'v1',  // Accessible at /api/v1/products
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      },
      enums: {
        versionPrefix: false,  // Accessible at /api/enums (no version prefix)
        methods: ['GET']
      }
    }
  });

  await db.usePlugin(apiPlugin);

  return apiPlugin;
}

function printUsage() {
  const baseUrl = `http://localhost:${APP_PORT}`;

  console.log(`\n🚀 API Server running at: ${baseUrl}`);
  console.log('\n📋 Available Endpoints:\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ PUBLIC ENDPOINTS (no auth required)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  GET  ${baseUrl}/health/live`);
  console.log(`  GET  ${baseUrl}/health/ready`);
  console.log(`  GET  ${baseUrl}/api/enums              - List all enums`);
  console.log(`  GET  ${baseUrl}/api/enums/{id}         - Get enum by ID`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 PROTECTED ENDPOINTS (JWT required)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  POST ${baseUrl}/auth/login            - Get JWT token`);
  console.log(`  GET  ${baseUrl}/api/v1/products       - List products (JWT)`);
  console.log(`  POST ${baseUrl}/api/v1/products       - Create product (JWT)`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👑 ADMIN ENDPOINTS (JWT + API Key)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  GET  ${baseUrl}/api/v1/admin/**       - Admin routes`);
  console.log(`  GET  ${baseUrl}/api/v1/admin/system   - System admin`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📖 TESTING EXAMPLES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('1️⃣  Public endpoint (no auth):');
  console.log(`   curl ${baseUrl}/api/enums\n`);

  console.log('2️⃣  Login to get JWT token:');
  console.log(`   curl -X POST ${baseUrl}/auth/login \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"username":"john","password":"User123!"}'\n`);

  console.log('3️⃣  Access protected endpoint with JWT:');
  console.log(`   curl ${baseUrl}/api/v1/products \\`);
  console.log(`     -H "Authorization: Bearer <JWT_TOKEN>"\n`);

  console.log('4️⃣  Access admin endpoint (JWT or API Key):');
  console.log(`   # Using JWT:`);
  console.log(`   curl ${baseUrl}/api/v1/admin/users \\`);
  console.log(`     -H "Authorization: Bearer <JWT_TOKEN>"\n`);
  console.log(`   # OR using API Key:`);
  console.log(`   curl ${baseUrl}/api/v1/admin/users \\`);
  console.log(`     -H "X-API-Key: admin-api-token-secure-123"\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 PATH MATCHING RULES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Precedence (most specific wins):');
  console.log('  1. /api/v1/admin/system      (exact match)');
  console.log('  2. /api/v1/admin/**          (admin paths)');
  console.log('  3. /api/v1/**                (v1 API paths)');
  console.log('  4. /api/**                   (all API paths)');
  console.log('  5. /health/**                (health checks)');
  console.log('  6. /api/enums/**             (public enums)\n');

  console.log('Wildcard syntax:');
  console.log('  *   - Match single segment:  /api/v1/*  → /api/v1/users ✅, /api/v1/users/123 ❌');
  console.log('  **  - Match any depth:       /api/v1/** → /api/v1/users ✅, /api/v1/users/123 ✅\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👥 TEST USERS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Username: admin');
  console.log('  Password: Admin123!');
  console.log('  API Key:  admin-api-token-secure-123');
  console.log('  Role:     admin\n');

  console.log('  Username: john');
  console.log('  Password: User123!');
  console.log('  API Key:  user-api-token-456');
  console.log('  Role:     user\n');

  console.log('✅ Server ready!\n');
}

async function main() {
  console.log('🌐 Setting up Path-based Authentication Example...\n');

  const db = await setupDatabase();
  const apiPlugin = await setupAPI(db);

  printUsage();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    await apiPlugin.stop();
    await db.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
