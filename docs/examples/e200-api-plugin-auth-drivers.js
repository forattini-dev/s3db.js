/**
 * Example: API Plugin with Driver-Specific Auth Configuration
 *
 * This example demonstrates the NEW (v16+) way to configure authentication
 * with driver-specific resource and field mappings.
 *
 * Benefits:
 * - Each driver can use a different user resource
 * - Each driver specifies its own field mappings (userField, passwordField, etc.)
 * - Cleaner separation of concerns
 * - Easier to understand and maintain
 *
 * Run: node docs/examples/e200-api-plugin-auth-drivers.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

const database = new Database({
  connectionString: 'memory://my-bucket/databases/auth-example',
  logLevel: 'info' // ✅ NEW: Use logLevel instead of verbose
});

await database.connect();

// Create multiple user resources for different auth methods
await database.createResource({
  name: 'admin_users',
  attributes: {
    username: 'string|required',
    password: 'secret|required',
    role: 'string|default:admin'
  }
});

await database.createResource({
  name: 'api_clients',
  attributes: {
    clientId: 'string|required',
    apiKey: 'string|required',
    companyName: 'string'
  }
});

// Configure API Plugin with driver-specific auth
const api = new ApiPlugin({
  port: 3000,
  logLevel: 'debug', // ✅ NEW: Replaces verbose: true

  auth: {
    // ✅ GLOBAL settings (apply to ALL drivers)
    registration: {
      enabled: true,
      allowedFields: ['username', 'email'],
      defaultRole: 'user'
    },
    loginThrottle: {
      enabled: true,
      maxAttempts: 5
    },

    // ✅ NEW: Driver-specific configurations
    drivers: [
      {
        driver: 'jwt',
        config: {
          secret: 'my-jwt-secret',
          expiresIn: '7d',

          // ✅ NEW: Driver-specific resource and fields
          resource: 'admin_users', // THIS driver uses admin_users
          userField: 'username',   // Login with username
          passwordField: 'password'
        }
      },
      {
        driver: 'apiKey',
        config: {
          headerName: 'X-API-Key',

          // ✅ NEW: Driver-specific resource and fields
          resource: 'api_clients',  // THIS driver uses api_clients
          keyField: 'apiKey'        // API key is in apiKey field
        }
      },
      {
        driver: 'basic',
        config: {
          realm: 'Admin Area',

          // ✅ NEW: Driver-specific resource and fields
          resource: 'admin_users',
          usernameField: 'username', // Already exists, now consistent
          passwordField: 'password'  // Already exists, now consistent
        }
      }
    ]
  },

  resources: {
    posts: {
      auth: ['jwt', 'apiKey'], // Both methods work
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  }
});

await database.usePlugin(api, 'api');

console.log('✅ API Plugin configured with driver-specific auth');
console.log('');
console.log('Auth Drivers:');
api.config.auth.drivers.forEach((driver) => {
  console.log(`  • ${driver.driver}:`);
  console.log(`    - Resource: ${driver.config.resource}`);
  console.log(`    - Fields:`, Object.keys(driver.config).filter(k =>
    k.endsWith('Field') || k === 'keyField'
  ));
});

console.log('');
console.log('🚀 Server starting on http://localhost:3000');
console.log('');
console.log('Test auth:');
console.log('  JWT:');
console.log('    POST http://localhost:3000/login');
console.log('    { "username": "admin", "password": "secret" }');
console.log('');
console.log('  API Key:');
console.log('    GET http://localhost:3000/api/posts');
console.log('    X-API-Key: <your-api-key>');
console.log('');
console.log('  Basic Auth:');
console.log('    GET http://localhost:3000/api/posts');
console.log('    Authorization: Basic <base64-encoded-username:password>');

// Keep server running
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await database.disconnect();
  process.exit(0);
});
