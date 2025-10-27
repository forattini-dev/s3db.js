/**
 * Example 85: Path-Based Authentication with Specificity
 *
 * Demonstrates the new pathRules system where more specific paths
 * override less specific ones, allowing fine-grained auth control.
 *
 * Key Features:
 * - Path-specific auth requirements
 * - Specificity-based precedence (more specific wins)
 * - Per-path auth method selection
 * - Per-path priority configuration
 * - Exact matches > Parameterized > Wildcards
 *
 * Use Case: mrt-shortner Architecture
 * - /app/** → ONLY OIDC (browser-based)
 * - /api/v1/** → Basic OR OIDC (Basic has priority)
 * - /health → Public
 * - / → Public
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { idGenerator } from '../../src/concerns/id.js';

function generateApiToken() {
  return `token_${idGenerator({ size: 32 })}`;
}

async function main() {
  console.log('Example 85: Path-Based Authentication\\n');

  // 1. Create database
  const db = new Database({
    connection: 'memory://',
    verbose: false
  });

  await db.connect();
  console.log('✅ Connected to database');

  // 2. Create users resource
  const users = await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      email: 'string|required|email',
      name: 'string|required',
      apiToken: 'secret|required',
      role: 'string|default:user',
      active: 'boolean|default:true'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created users resource');

  // 3. Create test user
  const testUser = await users.insert({
    id: 'alice@test.com',
    email: 'alice@test.com',
    name: 'Alice Test',
    apiToken: generateApiToken()
  });
  console.log('✅ Created test user:', testUser.email);
  console.log('   API Token:', testUser.apiToken.substring(0, 20) + '...');

  // 4. Configure API Plugin with Path-Based Auth Rules
  const apiPlugin = new ApiPlugin({
    port: 3105,
    verbose: true,

    auth: {
      // ==================== PATH-BASED AUTH RULES ====================
      // More specific paths WIN over less specific ones
      pathRules: [
        // Rule 1: /app routes - ONLY OIDC (highest specificity for /app/**)
        {
          path: '/app/**',
          methods: ['oidc'],
          required: true,
          strategy: 'priority'
        },

        // Rule 2: /app (exact match - even MORE specific than /app/**)
        {
          path: '/app',
          methods: ['oidc'],
          required: true,
          strategy: 'priority'
        },

        // Rule 3: /api/v1 routes - Basic OR OIDC (Basic has priority)
        {
          path: '/api/v1/**',
          methods: ['basic', 'oidc'],
          required: true,
          strategy: 'priority',
          priorities: {
            basic: 1,  // Try Basic first
            oidc: 2    // Fallback to OIDC
          }
        },

        // Rule 4: /api/v1/public/** - Allow both but not required
        {
          path: '/api/v1/public/**',
          methods: ['basic', 'oidc'],
          required: false, // Optional auth
          strategy: 'any'
        },

        // Rule 5: Health check - Public (exact match)
        {
          path: '/health',
          methods: [],
          required: false
        },

        // Rule 6: Root - Public (exact match)
        {
          path: '/',
          methods: [],
          required: false
        },

        // Rule 7: Docs - Public
        {
          path: '/docs',
          methods: [],
          required: false
        },

        // Rule 8: Default fallback - Allow any method
        {
          path: '/**',
          methods: ['basic', 'oidc'],
          required: false,
          strategy: 'any'
        }
      ],

      // ==================== AUTH DRIVERS ====================
      drivers: [
        // OIDC Driver (mocked for demo)
        {
          type: 'oidc',
          issuer: 'https://login.microsoftonline.com/common/v2.0',
          clientId: 'demo-client',
          clientSecret: 'demo-secret',
          redirectUri: 'http://localhost:3105/auth/callback',
          scope: 'openid profile email',
          cookieSecret: 'this-is-a-very-long-secret-key-for-testing-purposes-only-32chars'
        },

        // Basic Auth Driver
        {
          type: 'basic',
          resource: 'users',
          usernameField: 'email',
          passwordField: 'apiToken',
          passphrase: 'test-secret',

          // Admin root user
          adminUser: {
            enabled: true,
            username: 'admin',
            password: 'admin-token',
            scopes: ['admin']
          }
        }
      ]
    },

    // ==================== CUSTOM ROUTES ====================
    routes: {
      // Public routes
      'GET /': async (c) => {
        return c.json({
          message: 'Welcome to path-based auth demo',
          endpoints: {
            '/app': 'OIDC only',
            '/app/dashboard': 'OIDC only',
            '/api/v1/users': 'Basic (priority) or OIDC',
            '/api/v1/public/stats': 'Optional auth',
            '/health': 'Public',
            '/docs': 'Public'
          }
        });
      },

      'GET /health': async (c) => {
        return c.json({
          status: 'healthy',
          timestamp: new Date().toISOString()
        });
      },

      // Protected: OIDC only
      'GET /app': async (c) => {
        const user = c.get('user');
        return c.json({
          message: 'App Dashboard',
          user: user ? user.email : 'anonymous',
          authMethod: user ? user.authMethod : 'none'
        });
      },

      'GET /app/dashboard': async (c) => {
        const user = c.get('user');
        return c.json({
          message: 'Dashboard (OIDC only)',
          user: user ? user.email : 'anonymous',
          authMethod: user ? user.authMethod : 'none'
        });
      },

      // Protected: Basic (priority) or OIDC
      'GET /api/v1/users': async (c) => {
        const user = c.get('user');
        return c.json({
          message: 'Users API (Basic priority)',
          user: user ? user.email : 'anonymous',
          authMethod: user ? user.authMethod : 'none'
        });
      },

      // Optional auth
      'GET /api/v1/public/stats': async (c) => {
        const user = c.get('user');
        return c.json({
          message: 'Public Stats (optional auth)',
          authenticated: !!user,
          user: user ? user.email : 'anonymous'
        });
      }
    },

    docs: {
      enabled: true,
      ui: 'redoc'
    }
  });

  await db.usePlugin(apiPlugin);
  console.log('✅ API Plugin installed with path-based auth');
  console.log('\\n📡 Server running on http://localhost:3105');
  console.log('📚 API Docs: http://localhost:3105/docs');

  // ==================== DEMO ====================
  console.log('\\n--- Path-Based Auth Demo ---\\n');

  // Test 1: Public endpoint
  console.log('1️⃣ Testing public endpoint (/)...');
  const rootRes = await fetch('http://localhost:3105/');
  const rootData = await rootRes.json();
  console.log('✅ Status:', rootRes.status);
  console.log('   Response:', rootData.message);

  // Test 2: Health endpoint (public)
  console.log('\\n2️⃣ Testing health endpoint (public)...');
  const healthRes = await fetch('http://localhost:3105/health');
  const healthData = await healthRes.json();
  console.log('✅ Status:', healthRes.status);
  console.log('   Health:', healthData.status);

  // Test 3: Protected /app without auth (should fail or redirect)
  console.log('\\n3️⃣ Testing /app without auth (should fail)...');
  const appNoAuthRes = await fetch('http://localhost:3105/app');
  console.log('✅ Status:', appNoAuthRes.status);
  if (appNoAuthRes.status === 401) {
    const appNoAuthData = await appNoAuthRes.json();
    console.log('   Error:', appNoAuthData.message);
  } else if (appNoAuthRes.status === 302) {
    console.log('   Redirect:', appNoAuthRes.headers.get('location'));
  }

  // Test 4: Protected /api/v1/users with Basic Auth
  console.log('\\n4️⃣ Testing /api/v1/users with Basic Auth...');
  const basicAuthHeader = Buffer.from(`${testUser.email}:${testUser.apiToken}`).toString('base64');
  const apiBasicRes = await fetch('http://localhost:3105/api/v1/users', {
    headers: { 'Authorization': `Basic ${basicAuthHeader}` }
  });
  console.log('✅ Status:', apiBasicRes.status);
  if (apiBasicRes.ok) {
    const apiBasicData = await apiBasicRes.json();
    console.log('   User:', apiBasicData.user);
    console.log('   Auth Method:', apiBasicData.authMethod);
  }

  // Test 5: Admin root user
  console.log('\\n5️⃣ Testing admin root user...');
  const adminAuthHeader = Buffer.from('admin:admin-token').toString('base64');
  const adminRes = await fetch('http://localhost:3105/api/v1/users', {
    headers: { 'Authorization': `Basic ${adminAuthHeader}` }
  });
  console.log('✅ Status:', adminRes.status);
  if (adminRes.ok) {
    const adminData = await adminRes.json();
    console.log('   User:', adminData.user);
    console.log('   Auth Method:', adminData.authMethod);
  }

  // Test 6: Optional auth endpoint without auth
  console.log('\\n6️⃣ Testing /api/v1/public/stats without auth (optional)...');
  const publicNoAuthRes = await fetch('http://localhost:3105/api/v1/public/stats');
  const publicNoAuthData = await publicNoAuthRes.json();
  console.log('✅ Status:', publicNoAuthRes.status);
  console.log('   Authenticated:', publicNoAuthData.authenticated);
  console.log('   User:', publicNoAuthData.user);

  // Test 7: Optional auth endpoint WITH auth
  console.log('\\n7️⃣ Testing /api/v1/public/stats with auth (optional)...');
  const publicAuthRes = await fetch('http://localhost:3105/api/v1/public/stats', {
    headers: { 'Authorization': `Basic ${basicAuthHeader}` }
  });
  const publicAuthData = await publicAuthRes.json();
  console.log('✅ Status:', publicAuthRes.status);
  console.log('   Authenticated:', publicAuthData.authenticated);
  console.log('   User:', publicAuthData.user);

  // ==================== SPECIFICITY DEMONSTRATION ====================
  console.log('\\n--- Specificity Rules Demonstration ---\\n');

  console.log('Path Matching Examples:');
  console.log('');
  console.log('Request: GET /health');
  console.log('  Matches: /health (exact - score: 10,100)');
  console.log('  Also matches: /** (wildcard - score: 50)');
  console.log('  WINNER: /health (higher specificity)');
  console.log('  Auth: Public');
  console.log('');
  console.log('Request: GET /app/dashboard');
  console.log('  Matches: /app/** (wildcard - score: 200)');
  console.log('  Also matches: /** (wildcard - score: 50)');
  console.log('  WINNER: /app/** (higher specificity)');
  console.log('  Auth: OIDC only');
  console.log('');
  console.log('Request: GET /api/v1/users');
  console.log('  Matches: /api/v1/** (wildcard - score: 300)');
  console.log('  Also matches: /** (wildcard - score: 50)');
  console.log('  WINNER: /api/v1/** (higher specificity)');
  console.log('  Auth: Basic (priority 1) or OIDC (priority 2)');
  console.log('');
  console.log('Request: GET /api/v1/public/stats');
  console.log('  Matches: /api/v1/public/** (wildcard - score: 400)');
  console.log('  Also matches: /api/v1/** (wildcard - score: 300)');
  console.log('  Also matches: /** (wildcard - score: 50)');
  console.log('  WINNER: /api/v1/public/** (highest specificity)');
  console.log('  Auth: Optional (Basic or OIDC)');

  console.log('\\n--- ✅ Path-Based Auth Complete ---');
  console.log('\\n💡 Key Takeaways:');
  console.log('  - More specific paths win (exact > params > wildcards)');
  console.log('  - Per-path auth method selection');
  console.log('  - Per-path priority configuration');
  console.log('  - Optional vs Required auth per path');
  console.log('  - Backward compatible with existing pathAuth');

  console.log('\\n⏳ Server will remain running for testing...');
  console.log('   Press Ctrl+C to stop\\n');
}

main().catch(console.error);
