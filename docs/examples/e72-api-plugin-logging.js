/**
 * Example 72: API Plugin - Logging Examples
 *
 * Shows different logging outputs with various configurations.
 *
 * Run: node docs/examples/e72-api-plugin-logging.js [scenario]
 *
 * Scenarios:
 * 1. minimal   - Default logging (minimal)
 * 2. verbose   - Verbose mode (all details)
 * 3. requests  - Request logging only
 * 4. events    - Event-based logging
 * 5. metrics   - Metrics logging
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

// ====================================================================
// Scenario 1: Minimal Logging (Default)
// ====================================================================

async function scenario1_minimal() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 1: MINIMAL LOGGING (Default)                ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const db = new Database({
    connectionString: 'memory://mybucket/minimal'
  });

  await db.connect();

  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required|email'
    }
  });

  const apiPlugin = new ApiPlugin({
    port: 3010,
    verbose: false,  // DEFAULT: minimal logging
    resources: {
      users: { methods: ['GET', 'POST'] }
    }
  });

  await db.usePlugin(apiPlugin);

  console.log('\n📝 Expected output (minimal):');
  console.log('  - Startup banner only');
  console.log('  - No middleware details');
  console.log('  - No route mounting logs');
  console.log('\n');

  // Make some requests
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n🔹 Making test request...\n');
  await fetch('http://localhost:3010/users');

  await new Promise(resolve => setTimeout(resolve, 1000));
  await apiPlugin.stop();
}

// ====================================================================
// Scenario 2: Verbose Logging
// ====================================================================

async function scenario2_verbose() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 2: VERBOSE LOGGING                           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const db = new Database({
    connectionString: 'memory://mybucket/verbose'
  });

  await db.connect();

  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required|email'
    }
  });

  await db.createResource({
    name: 'posts',
    attributes: {
      title: 'string|required',
      content: 'string'
    }
  });

  const apiPlugin = new ApiPlugin({
    port: 3011,
    verbose: true,  // 🔊 VERBOSE MODE
    basePath: '/api/v1',
    cors: { enabled: true },
    security: { enabled: true },
    requestId: { enabled: true },
    metrics: { enabled: true },
    health: { enabled: true },
    resources: {
      users: { methods: ['GET', 'POST', 'PUT', 'DELETE'] },
      posts: { methods: ['GET', 'POST'] }
    },
    auth: {
      drivers: ['jwt'],
      jwt: {
        jwtSecret: 'test-secret',
        allowRegistration: true
      }
    }
  });

  await db.usePlugin(apiPlugin);

  console.log('\n📝 Expected verbose output shows:');
  console.log('  ✓ Plugin installation steps');
  console.log('  ✓ OpenAPI generator cache status');
  console.log('  ✓ Each middleware registration');
  console.log('  ✓ Context injection setup');
  console.log('  ✓ Root route mounting');
  console.log('  ✓ Each resource route mounting');
  console.log('  ✓ Auth routes setup');
  console.log('  ✓ Admin routes (metrics)');
  console.log('  ✓ Health endpoints');
  console.log('  ✓ Network addresses');
  console.log('\n');

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n🔹 Making test requests with verbose mode...\n');
  await fetch('http://localhost:3011/api/v1/users');
  await fetch('http://localhost:3011/api/v1/posts');
  await fetch('http://localhost:3011/api/v1/health');

  await new Promise(resolve => setTimeout(resolve, 1000));
  await apiPlugin.stop();
}

// ====================================================================
// Scenario 3: Request Logging with Custom Format
// ====================================================================

async function scenario3_requests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 3: REQUEST LOGGING                           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const db = new Database({
    connectionString: 'memory://mybucket/requests'
  });

  await db.connect();

  await db.createResource({
    name: 'products',
    attributes: {
      name: 'string|required',
      price: 'number|required'
    }
  });

  // Insert some test data
  await db.resources.products.insert({ name: 'Widget', price: 19.99 });
  await db.resources.products.insert({ name: 'Gadget', price: 29.99 });

  const apiPlugin = new ApiPlugin({
    port: 3012,
    verbose: true,
    logging: {
      enabled: true,
      format: ':method :url => :status (:elapsed ms)',
      // Custom format tokens:
      // :method, :url, :status, :elapsed, :ip, :user-agent
      // :req[header], :res[header]
    },
    resources: {
      products: { methods: ['GET', 'POST', 'PUT', 'DELETE'] }
    }
  });

  await db.usePlugin(apiPlugin);

  console.log('\n📝 Request logs format: METHOD URL => STATUS (TIME ms)\n');

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n🔹 Making various requests to see logging...\n');

  // GET list
  await fetch('http://localhost:3012/products');
  await new Promise(resolve => setTimeout(resolve, 100));

  // GET single
  const products = await (await fetch('http://localhost:3012/products')).json();
  const productId = products.data[0].id;
  await fetch(`http://localhost:3012/products/${productId}`);
  await new Promise(resolve => setTimeout(resolve, 100));

  // POST
  await fetch('http://localhost:3012/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'New Product', price: 39.99 })
  });
  await new Promise(resolve => setTimeout(resolve, 100));

  // 404
  await fetch('http://localhost:3012/notfound');
  await new Promise(resolve => setTimeout(resolve, 100));

  await new Promise(resolve => setTimeout(resolve, 1000));
  await apiPlugin.stop();
}

// ====================================================================
// Scenario 4: Event-Based Logging
// ====================================================================

async function scenario4_events() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 4: EVENT-BASED LOGGING                       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const db = new Database({
    connectionString: 'memory://mybucket/events'
  });

  await db.connect();

  await db.createResource({
    name: 'orders',
    attributes: {
      product: 'string|required',
      quantity: 'number|required'
    }
  });

  const apiPlugin = new ApiPlugin({
    port: 3013,
    verbose: false,
    events: {
      enabled: true,
      verbose: true  // Show event logs
    },
    resources: {
      orders: { methods: ['GET', 'POST'] }
    }
  });

  // Listen to events
  apiPlugin.on('request:start', (data) => {
    console.log(`\n🟢 REQUEST START: ${data.method} ${data.path}`);
    console.log(`   IP: ${data.ip || 'unknown'}`);
    console.log(`   Request ID: ${data.requestId}`);
  });

  apiPlugin.on('request:end', (data) => {
    console.log(`\n🔵 REQUEST END: ${data.method} ${data.path}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Duration: ${data.duration}ms`);
  });

  apiPlugin.on('request:error', (data) => {
    console.log(`\n🔴 REQUEST ERROR: ${data.method} ${data.path}`);
    console.log(`   Error: ${data.error}`);
    console.log(`   Duration: ${data.duration}ms`);
  });

  apiPlugin.on('resource:insert', (data) => {
    console.log(`\n➕ RESOURCE INSERT: ${data.resource}`);
    console.log(`   Record ID: ${data.id}`);
  });

  await db.usePlugin(apiPlugin);

  console.log('\n📝 Event listeners registered:\n');
  console.log('  • request:start   - When request begins');
  console.log('  • request:end     - When request completes');
  console.log('  • request:error   - When request fails');
  console.log('  • resource:insert - When record is created');
  console.log('\n');

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n🔹 Making requests to trigger events...\n');

  // Success
  await fetch('http://localhost:3013/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: 'Widget', quantity: 5 })
  });

  await new Promise(resolve => setTimeout(resolve, 200));

  // Another success
  await fetch('http://localhost:3013/orders');

  await new Promise(resolve => setTimeout(resolve, 1000));
  await apiPlugin.stop();
}

// ====================================================================
// Scenario 5: Metrics Logging
// ====================================================================

async function scenario5_metrics() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 5: METRICS LOGGING                           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const db = new Database({
    connectionString: 'memory://mybucket/metrics'
  });

  await db.connect();

  await db.createResource({
    name: 'analytics',
    attributes: {
      event: 'string|required',
      value: 'number'
    }
  });

  const apiPlugin = new ApiPlugin({
    port: 3014,
    verbose: true,
    metrics: {
      enabled: true,
      verbose: true,  // Show metrics logs
      resetInterval: 10000  // Reset every 10s
    },
    resources: {
      analytics: { methods: ['GET', 'POST'] }
    }
  });

  await db.usePlugin(apiPlugin);

  console.log('\n📝 Metrics tracking enabled\n');

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n🔹 Making requests to collect metrics...\n');

  // Make various requests
  for (let i = 0; i < 5; i++) {
    await fetch('http://localhost:3014/analytics');
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  for (let i = 0; i < 3; i++) {
    await fetch('http://localhost:3014/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'page_view', value: 1 })
    });
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Get metrics
  console.log('\n📊 Fetching metrics summary...\n');
  const metricsResponse = await fetch('http://localhost:3014/metrics');
  const metrics = await metricsResponse.json();

  console.log('Metrics Summary:');
  console.log(JSON.stringify(metrics.data, null, 2));

  await new Promise(resolve => setTimeout(resolve, 1000));
  await apiPlugin.stop();
}

// ====================================================================
// Scenario 6: Production-Style Logging (JSON)
// ====================================================================

async function scenario6_production() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 6: PRODUCTION JSON LOGGING                   ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const db = new Database({
    connectionString: 'memory://mybucket/production'
  });

  await db.connect();

  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required'
    }
  });

  // Custom JSON logger middleware
  const jsonLogger = async (c, next) => {
    const start = Date.now();
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'http_request',
      method: c.req.method,
      path: c.req.path,
      ip: c.req.header('x-forwarded-for') || 'unknown',
      userAgent: c.req.header('user-agent')
    };

    try {
      await next();
      const duration = Date.now() - start;

      console.log(JSON.stringify({
        ...logEntry,
        status: c.res.status,
        duration,
        level: c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info'
      }));
    } catch (err) {
      const duration = Date.now() - start;

      console.log(JSON.stringify({
        ...logEntry,
        status: 500,
        duration,
        level: 'error',
        error: err.message,
        stack: err.stack
      }));
      throw err;
    }
  };

  const apiPlugin = new ApiPlugin({
    port: 3015,
    verbose: false,
    startupBanner: false,  // Suppress banner for production
    middlewares: [jsonLogger],
    resources: {
      users: { methods: ['GET', 'POST'] }
    }
  });

  await db.usePlugin(apiPlugin);

  console.log('📝 Production logging (JSON format):\n');

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Make requests
  await fetch('http://localhost:3015/users');
  await new Promise(resolve => setTimeout(resolve, 100));

  await fetch('http://localhost:3015/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'John' })
  });
  await new Promise(resolve => setTimeout(resolve, 100));

  await fetch('http://localhost:3015/notfound');
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n💡 Each line is valid JSON for log aggregation (ELK, Datadog, etc.)');

  await new Promise(resolve => setTimeout(resolve, 1000));
  await apiPlugin.stop();
}

// ====================================================================
// Run Scenarios
// ====================================================================

const scenarios = {
  '1': { name: 'minimal', fn: scenario1_minimal },
  '2': { name: 'verbose', fn: scenario2_verbose },
  '3': { name: 'requests', fn: scenario3_requests },
  '4': { name: 'events', fn: scenario4_events },
  '5': { name: 'metrics', fn: scenario5_metrics },
  '6': { name: 'production', fn: scenario6_production }
};

const arg = process.argv[2] || '1';
const scenario = scenarios[arg] || Object.values(scenarios).find(s => s.name === arg);

if (scenario) {
  scenario.fn().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });
} else {
  console.log('Usage: node e72-api-plugin-logging.js [scenario]');
  console.log('\nAvailable scenarios:');
  console.log('  1, minimal    - Default logging (minimal output)');
  console.log('  2, verbose    - Verbose mode (all details)');
  console.log('  3, requests   - HTTP request logging');
  console.log('  4, events     - Event-based logging');
  console.log('  5, metrics    - Metrics tracking');
  console.log('  6, production - Production JSON logging');
  console.log('\nExamples:');
  console.log('  node e72-api-plugin-logging.js 1');
  console.log('  node e72-api-plugin-logging.js verbose');
  process.exit(0);
}
