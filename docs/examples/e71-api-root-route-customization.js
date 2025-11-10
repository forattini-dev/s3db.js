/**
 * Example 71: API Plugin - Root Route Customization
 *
 * Shows how to customize or disable the root route (GET /) splash screen.
 *
 * Options:
 * - undefined (default): Shows beautiful splash screen with API info
 * - false: Disables root route entirely
 * - function: Custom Hono handler for root route
 *
 * Run: node docs/examples/e71-api-root-route-customization.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

// ====================================================================
// Example 1: Default Splash Screen (no config needed)
// ====================================================================

async function example1_defaultSplash() {
  console.log('\n=== Example 1: Default Splash Screen ===\n');

  const db = new Database({
    connectionString: 'memory://mybucket/apis/default'
  });

  await db.connect();

  const apiPlugin = new ApiPlugin({
    port: 3001,
    docs: {
      enabled: true,
      title: 'My Awesome API',
      description: 'A beautiful API powered by s3db.js with automatic documentation'
    }
    // rootRoute is undefined by default → shows splash screen
  });

  await db.usePlugin(apiPlugin);

  console.log('✓ Server started on http://localhost:3001');
  console.log('✓ Visit http://localhost:3001 to see the splash screen');
  console.log('✓ Click "View API Documentation" to go to /docs\n');

  // Keep alive for testing
  await new Promise(resolve => setTimeout(resolve, 60000));
}

// ====================================================================
// Example 2: Disable Root Route
// ====================================================================

async function example2_disableRoot() {
  console.log('\n=== Example 2: Disable Root Route ===\n');

  const db = new Database({
    connectionString: 'memory://mybucket/apis/disabled'
  });

  await db.connect();

  const apiPlugin = new ApiPlugin({
    port: 3002,
    rootRoute: false // Disable root route
  });

  await db.usePlugin(apiPlugin);

  console.log('✓ Server started on http://localhost:3002');
  console.log('✓ Root route (/) is disabled');
  console.log('✓ Visit http://localhost:3002 → will return 404\n');

  await new Promise(resolve => setTimeout(resolve, 60000));
}

// ====================================================================
// Example 3: Custom Root Handler
// ====================================================================

async function example3_customHandler() {
  console.log('\n=== Example 3: Custom Root Handler ===\n');

  const db = new Database({
    connectionString: 'memory://mybucket/apis/custom'
  });

  await db.connect();

  const apiPlugin = new ApiPlugin({
    port: 3003,
    rootRoute: (c) => {
      // Custom Hono handler
      return c.json({
        message: 'Welcome to my custom API!',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          docs: '/docs',
          metrics: '/metrics'
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  await db.usePlugin(apiPlugin);

  console.log('✓ Server started on http://localhost:3003');
  console.log('✓ Visit http://localhost:3003 to see custom JSON response\n');

  await new Promise(resolve => setTimeout(resolve, 60000));
}

// ====================================================================
// Example 4: Custom HTML with Redirect
// ====================================================================

async function example4_customHTML() {
  console.log('\n=== Example 4: Custom HTML with Auto-Redirect ===\n');

  const db = new Database({
    connectionString: 'memory://mybucket/apis/redirect'
  });

  await db.connect();

  const apiPlugin = new ApiPlugin({
    port: 3004,
    basePath: '/api/v1', // Test basePath support
    rootRoute: (c) => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta http-equiv="refresh" content="3;url=/api/v1/docs">
          <title>Redirecting...</title>
          <style>
            body {
              font-family: system-ui;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .box {
              text-align: center;
              background: rgba(255,255,255,0.1);
              padding: 40px;
              border-radius: 20px;
              backdrop-filter: blur(10px);
            }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>🚀 API Starting...</h1>
            <p>Redirecting to documentation in 3 seconds...</p>
            <p><a href="/api/v1/docs" style="color: white;">Click here if not redirected</a></p>
          </div>
        </body>
        </html>
      `;
      return c.html(html);
    }
  });

  await db.usePlugin(apiPlugin);

  console.log('✓ Server started on http://localhost:3004');
  console.log('✓ Visit http://localhost:3004 → auto-redirects to /api/v1/docs\n');

  await new Promise(resolve => setTimeout(resolve, 60000));
}

// ====================================================================
// Example 5: Root Route with Resources
// ====================================================================

async function example5_withResources() {
  console.log('\n=== Example 5: Root Route with Resources ===\n');

  const db = new Database({
    connectionString: 'memory://mybucket/apis/resources'
  });

  await db.connect();

  // Create sample resource
  await db.createResource({
    name: 'products',
    attributes: {
      name: 'string|required',
      price: 'number|required',
      stock: 'number|default:0'
    }
  });

  await db.resources.products.insert({
    name: 'Widget',
    price: 19.99,
    stock: 100
  });

  const apiPlugin = new ApiPlugin({
    port: 3005,
    docs: {
      enabled: true,
      title: 'E-commerce API',
      description: 'RESTful API for managing products, orders, and customers'
    },
    resources: {
      products: {
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      }
    }
    // Using default splash screen with custom title/description
  });

  await db.usePlugin(apiPlugin);

  console.log('✓ Server started on http://localhost:3005');
  console.log('✓ Splash screen shows: "E-commerce API"');
  console.log('✓ Resources available:');
  console.log('  - GET    /products');
  console.log('  - POST   /products');
  console.log('  - PUT    /products/:id');
  console.log('  - DELETE /products/:id\n');

  await new Promise(resolve => setTimeout(resolve, 60000));
}

// ====================================================================
// Run Examples
// ====================================================================

const examples = {
  '1': example1_defaultSplash,
  '2': example2_disableRoot,
  '3': example3_customHandler,
  '4': example4_customHTML,
  '5': example5_withResources
};

const exampleNumber = process.argv[2] || '1';
const selectedExample = examples[exampleNumber];

if (selectedExample) {
  selectedExample().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
} else {
  console.log('Usage: node e71-api-root-route-customization.js [1-5]');
  console.log('\nAvailable examples:');
  console.log('  1 - Default splash screen (beautiful UI)');
  console.log('  2 - Disable root route entirely');
  console.log('  3 - Custom JSON response');
  console.log('  4 - Custom HTML with auto-redirect');
  console.log('  5 - Root route with resources\n');
  process.exit(0);
}
