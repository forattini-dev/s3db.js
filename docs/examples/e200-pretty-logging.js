/**
 * Example: Pretty Logging (Default)
 *
 * Demonstrates s3db.js's default pretty logging format for better developer experience.
 *
 * Features:
 * - Pretty format enabled by default (pino-pretty)
 * - Colored, human-readable output inspired by Morgan's dev format
 * - HTTP request logging with pastel colors
 * - Structured logging with Pino under the hood
 * - Easy override to JSON format via environment variable
 *
 * Usage:
 *   node docs/examples/e200-pretty-logging.js              # Pretty format (default)
 *   S3DB_LOG_FORMAT=json node docs/examples/e200-pretty-logging.js  # JSON format
 *   S3DB_LOG_LEVEL=debug node docs/examples/e200-pretty-logging.js  # Debug level
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

async function main() {
  // 1. Create database with default logger (pretty format)
  const db = new Database({
    connectionString: 'memory://logging-demo/databases/myapp',
    logLevel: 'info' // Will use pretty format by default
  });

  await db.connect();

  console.log('\n=== Default Pretty Logging ===\n');
  console.log('✅ Logger automatically uses pretty format');
  console.log('✅ Colored output for better readability');
  console.log('✅ HTTP requests formatted like Morgan\'s dev format\n');

  // 2. Create a simple resource
  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required|email',
      role: 'string|default:user'
    }
  });

  // 3. Setup API plugin with logging enabled
  const apiPlugin = new ApiPlugin({
    port: 3456,
    logLevel: 'info', // Inherits pretty format from parent
    logging: {
      enabled: true,
      colorize: true // Enable colored HTTP logs
    },
    resources: {
      users: {
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        auth: []
      }
    },
    docs: { enabled: true }
  });

  await db.usePlugin(apiPlugin, 'api');

  console.log('🌐 API Server running at http://localhost:3456');
  console.log('📚 API Docs at http://localhost:3456/docs\n');
  console.log('Watch the pretty HTTP logs below:\n');

  // 4. Simulate some HTTP requests (for demonstration)
  await simulateRequests();

  // 5. Keep server alive for manual testing
  console.log('\n💡 Try making requests to see pretty logs:');
  console.log('   curl http://localhost:3456/users');
  console.log('   curl -X POST http://localhost:3456/users -H "Content-Type: application/json" -d \'{"name":"John","email":"john@example.com"}\'');
  console.log('\n🔧 Override format: S3DB_LOG_FORMAT=json node docs/examples/e200-pretty-logging.js\n');

  // Keep alive for 60 seconds
  setTimeout(() => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
  }, 60_000);
}

async function simulateRequests() {
  const baseUrl = 'http://localhost:3456';

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    // GET request (will return 200)
    await fetch(`${baseUrl}/users`);

    // POST request (will create user)
    await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com',
        role: 'admin'
      })
    });

    // GET single user (should return 200)
    const listResponse = await fetch(`${baseUrl}/users`);
    const users = await listResponse.json();
    if (users.data && users.data.length > 0) {
      await fetch(`${baseUrl}/users/${users.data[0].id}`);
    }

    // Invalid request (will return 400)
    await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' })
    });

  } catch (err) {
    console.error('Request simulation error:', err.message);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
