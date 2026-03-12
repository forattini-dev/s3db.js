/**
 * Example 85: Protected SPA with Path-based Authentication
 *
 * Demonstrates how to serve a protected React app with JWT authentication.
 * Combines static file serving + path-based auth for a complete solution.
 *
 * Use case:
 * - Serve React app at /app/*
 * - Public login page at /app/login
 * - Protected routes require JWT token
 * - Fallback to index.html for React Router
 *
 * Run:
 *   node docs/examples/e85-protected-spa.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_PORT = 3000;

async function setupStaticApp() {
  // Create example React app directory
  const appDir = path.join(__dirname, 'protected-app-example');

  if (!existsSync(appDir)) {
    mkdirSync(appDir, { recursive: true });
  }

  // Create index.html (simulating React build)
  writeFileSync(
    path.join(appDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Protected SPA Example</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .card {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    h1 {
      color: #333;
      margin-top: 0;
    }
    .auth-status {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .authenticated { background: #c8e6c9; }
    .unauthenticated { background: #ffcdd2; }
    button {
      background: #2196F3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 10px;
    }
    button:hover {
      background: #1976D2;
    }
    button.danger {
      background: #f44336;
    }
    button.danger:hover {
      background: #d32f2f;
    }
    pre {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    .route {
      color: #2196F3;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔐 Protected SPA Example</h1>
    <div id="auth-status" class="auth-status unauthenticated">
      <strong>Status:</strong> Not authenticated
    </div>

    <div id="app-content"></div>
  </div>

  <div class="card">
    <h2>📋 How it works</h2>
    <ol>
      <li>This page is served at <span class="route">/app/*</span></li>
      <li>All routes under <span class="route">/app/**</span> require JWT authentication</li>
      <li>Login to get a JWT token</li>
      <li>Token is stored in localStorage</li>
      <li>All requests include the token in Authorization header</li>
      <li>React Router handles client-side routing</li>
    </ol>
  </div>

  <div class="card">
    <h2>🧪 Test Authentication</h2>
    <div style="margin-bottom: 20px;">
      <h3>1. Login</h3>
      <button onclick="login()">🔓 Login (admin/Admin123!)</button>
    </div>

    <div style="margin-bottom: 20px;">
      <h3>2. Test Protected Resource</h3>
      <button onclick="testProtectedRoute()">🔐 Test /api/v1/users (protected)</button>
    </div>

    <div style="margin-bottom: 20px;">
      <h3>3. Logout</h3>
      <button class="danger" onclick="logout()">🚪 Logout</button>
    </div>

    <div id="test-result"></div>
  </div>

  <script>
    // Check authentication on load
    function checkAuth() {
      const token = localStorage.getItem('token');
      const statusDiv = document.getElementById('auth-status');

      if (token) {
        statusDiv.className = 'auth-status authenticated';
        statusDiv.innerHTML = '<strong>Status:</strong> ✅ Authenticated (Token stored)';
      } else {
        statusDiv.className = 'auth-status unauthenticated';
        statusDiv.innerHTML = '<strong>Status:</strong> ❌ Not authenticated';
      }
    }

    // Login
    async function login() {
      const resultDiv = document.getElementById('test-result');
      resultDiv.innerHTML = '<p>🔄 Logging in...</p>';

      try {
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'admin',
            password: 'Admin123!'
          })
        });

        const data = await response.json();

        if (data.success) {
          localStorage.setItem('token', data.data.token);
          checkAuth();
          resultDiv.innerHTML = \`
            <pre><strong>✅ Login successful!</strong>

Token: \${data.data.token.substring(0, 50)}...
User: \${JSON.stringify(data.data.user, null, 2)}</pre>
          \`;
        } else {
          resultDiv.innerHTML = \`<pre><strong>❌ Login failed:</strong> \${data.error.message}</pre>\`;
        }
      } catch (err) {
        resultDiv.innerHTML = \`<pre><strong>❌ Error:</strong> \${err.message}</pre>\`;
      }
    }

    // Test protected route
    async function testProtectedRoute() {
      const token = localStorage.getItem('token');
      const resultDiv = document.getElementById('test-result');

      if (!token) {
        resultDiv.innerHTML = '<pre><strong>⚠️  No token found. Please login first.</strong></pre>';
        return;
      }

      resultDiv.innerHTML = '<p>🔄 Testing protected route...</p>';

      try {
        const response = await fetch('/api/v1/users', {
          headers: {
            'Authorization': \`Bearer \${token}\`
          }
        });

        const data = await response.json();

        if (response.ok) {
          resultDiv.innerHTML = \`
            <pre><strong>✅ Protected route accessible!</strong>

Status: \${response.status}
Data: \${JSON.stringify(data, null, 2)}</pre>
          \`;
        } else {
          resultDiv.innerHTML = \`
            <pre><strong>❌ Access denied:</strong>

Status: \${response.status}
Error: \${data.error.message}</pre>
          \`;
        }
      } catch (err) {
        resultDiv.innerHTML = \`<pre><strong>❌ Error:</strong> \${err.message}</pre>\`;
      }
    }

    // Logout
    function logout() {
      localStorage.removeItem('token');
      checkAuth();
      document.getElementById('test-result').innerHTML = '<pre><strong>✅ Logged out successfully</strong></pre>';
    }

    // Simulate React Router (detect URL changes)
    window.addEventListener('popstate', () => {
      console.log('Route changed:', window.location.pathname);
      // React Router would handle this
    });

    // Check auth on load
    checkAuth();
  </script>
</body>
</html>`
  );

  console.log(`✓ Created protected app in: ${appDir}\n`);

  return appDir;
}

async function setupDatabase() {
  // Create database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/protected-spa-example',
    encryptionKey: 'protected-spa-encryption-key-32chars!'
  });

  await db.connect();

  // Create users resource
  await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      username: 'string|required',
      password: 'secret|required',
      email: 'string|optional',
      role: 'string|optional'
    },
    timestamps: true
  });

  // Create admin user
  await db.resources.users.insert({
    id: 'admin',
    username: 'admin',
    password: 'Admin123!',
    email: 'admin@example.com',
    role: 'admin'
  });

  // Create regular user
  await db.resources.users.insert({
    id: 'user1',
    username: 'john',
    password: 'User123!',
    email: 'john@example.com',
    role: 'user'
  });

  console.log('✓ Created users resource with test users\n');

  return db;
}

async function setupAPI(db, appDir) {
  // Create API Plugin with protected SPA
  const apiPlugin = new ApiPlugin({
    port: APP_PORT,
    verbose: true,

    // 🔐 AUTHENTICATION
    auth: {
      drivers: [
        {
          driver: 'jwt',
          config: {
            secret: 'my-jwt-secret-key-256-bits',
            expiresIn: '7d'
          }
        }
      ],
      resource: 'users',

      // 🔥 PATH-BASED AUTH: Protect /app/**
      pathRules: [
        // Public health checks
        {
          path: '/health/**',
          required: false
        },

        // 🔓 Public: Auth endpoints
        {
          path: '/auth/**',
          required: false
        },

        // 🔐 PROTECTED: /app/** requires JWT
        {
          path: '/app/**',
          methods: ['jwt'],
          required: true
        },

        // 🔐 PROTECTED: API requires JWT
        {
          path: '/api/**',
          methods: ['jwt'],
          required: true
        }
      ]
    },

    // 📁 STATIC FILES
    static: [
      {
        driver: 'filesystem',
        path: '/app',
        root: appDir,
        config: {
          fallback: 'index.html',  // ⭐ SPA routing support
          maxAge: 3600000,
          etag: true,
          cors: true
        }
      }
    ],

    // 🗂️ RESOURCES
    resources: {
      users: {
        versionPrefix: 'v1',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      }
    }
  });

  await db.usePlugin(apiPlugin);

  return apiPlugin;
}

function printUsage() {
  const baseUrl = `http://localhost:${APP_PORT}`;

  console.log(`\n🚀 Protected SPA Server running at: ${baseUrl}`);
  console.log('\n📋 Endpoints:\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔓 PUBLIC ENDPOINTS (no auth)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  POST ${baseUrl}/auth/login          - Get JWT token`);
  console.log(`  GET  ${baseUrl}/health/live         - Health check`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 PROTECTED ENDPOINTS (JWT required)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  GET  ${baseUrl}/app/                - React app (protected!)`);
  console.log(`  GET  ${baseUrl}/app/dashboard       - React route (protected!)`);
  console.log(`  GET  ${baseUrl}/app/profile         - React route (protected!)`);
  console.log(`  GET  ${baseUrl}/api/v1/users        - Users API (protected!)`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TESTING EXAMPLES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('1️⃣  Try accessing protected app WITHOUT token (should fail):');
  console.log(`   curl ${baseUrl}/app/\n`);

  console.log('2️⃣  Login to get JWT token:');
  console.log(`   curl -X POST ${baseUrl}/auth/login \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"username":"admin","password":"Admin123!"}'\n`);

  console.log('3️⃣  Access protected app WITH token (should work):');
  console.log(`   curl ${baseUrl}/app/ \\`);
  console.log(`     -H "Authorization: Bearer <JWT_TOKEN>"\n`);

  console.log('4️⃣  Open in browser (interactive demo):');
  console.log(`   ${baseUrl}/app/\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👥 TEST CREDENTIALS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Admin:');
  console.log('    Username: admin');
  console.log('    Password: Admin123!\n');

  console.log('  Regular User:');
  console.log('    Username: john');
  console.log('    Password: User123!\n');

  console.log('✅ Server ready! Open your browser and test the protected app.\n');
}

async function main() {
  console.log('🌐 Setting up Protected SPA Example...\n');

  const appDir = await setupStaticApp();
  const db = await setupDatabase();
  const apiPlugin = await setupAPI(db, appDir);

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
