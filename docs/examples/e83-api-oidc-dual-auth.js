/**
 * Example 83: API Plugin - Dual Auth Strategy (OIDC + Basic Auth)
 *
 * Demonstrates:
 * - Priority-based dual authentication (OIDC first, Basic Auth fallback)
 * - Path-based OIDC protection (/app/** requires OIDC, /api/** allows Basic)
 * - beforeCreateUser hook for external API integration (People API simulation)
 * - beforeUpdateUser hook for refreshing external data on login
 * - Complete mrt-shortner architecture replacement example
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { idGenerator } from '../../src/concerns/id.js';

// Simulate People API (Stone's internal service)
const mockPeopleAPI = {
  async getEmployeeByEmail(email) {
    console.log(`[People API] Looking up employee: ${email}`);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock data
    const employees = {
      'alice@company.com': {
        id: 'emp-001',
        name: 'Alice Johnson',
        email: 'alice@company.com',
        costCenter: { id: 'cc-marketing', name: 'Marketing' },
        department: 'Growth',
        team: 'Digital Marketing'
      },
      'bob@company.com': {
        id: 'emp-002',
        name: 'Bob Smith',
        email: 'bob@company.com',
        costCenter: { id: 'cc-engineering', name: 'Engineering' },
        department: 'Technology',
        team: 'Backend Team'
      }
    };

    return employees[email] || null;
  }
};

// Generate API token (similar to mrt-shortner)
function generateApiToken() {
  const env = process.env.NODE_ENV || 'local';
  const random = idGenerator({ size: 32 });
  return `mrt_${env}_${random}`;
}

async function main() {
  console.log('Example 83: Dual Auth Strategy (OIDC + Basic Auth)\n');

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
      id: 'string|required',         // email
      email: 'string|required|email',
      name: 'string|required',
      apiToken: 'secret|required',   // For Basic Auth
      costCenterId: 'string|optional',
      costCenterName: 'string|optional',
      team: 'string|optional',
      role: 'string|default:user',
      scopes: 'array|items:string|default:["openid", "profile", "email"]',
      active: 'boolean|default:true',
      lastLoginAt: 'string|optional',
      metadata: 'object|optional'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created users resource');

  // 3. Create URLs resource (example data resource)
  const urls = await db.createResource({
    name: 'urls',
    attributes: {
      id: 'string|required',
      userId: 'string|required',     // Owner (email)
      link: 'string|required|url',
      shortId: 'string|required',
      metadata: 'object|optional'
    },
    behavior: 'body-overflow',
    timestamps: true
  });
  console.log('✅ Created urls resource');

  // 4. Configure API Plugin with Dual Auth Strategy
  const apiPlugin = new ApiPlugin({
    port: 3103,
    verbose: true,

    auth: {
      // NEW: Priority strategy (waterfall - try in order)
      strategy: 'priority',

      // NEW: Priorities map (lower number = higher priority)
      priorities: {
        oidc: 1,    // Try OIDC first
        basic: 2    // Fallback to Basic Auth
      },

      drivers: [
        // OIDC Driver (Azure AD / Entra ID)
        {
          type: 'oidc',
          issuer: 'https://login.microsoftonline.com/common/v2.0',
          clientId: process.env.OIDC_CLIENT_ID || 'mock-client-id-for-demo',
          clientSecret: process.env.OIDC_CLIENT_SECRET || 'mock-client-secret',
          redirectUri: 'http://localhost:3103/auth/callback',
          scope: 'openid profile email offline_access',
          cookieSecret: 'this-is-a-very-long-secret-key-for-testing-purposes-only-32chars',

          // NEW: Path-based protection
          protectedPaths: ['/app/**', '/dashboard/**'],

          // NEW: beforeCreateUser hook (called when new user logs in via OIDC)
          beforeCreateUser: async ({ user, claims, usersResource }) => {
            console.log(`\n🔧 [Hook] beforeCreateUser called for: ${user.email}`);

            // Call People API to enrich user data
            const employee = await mockPeopleAPI.getEmployeeByEmail(user.email);

            if (employee) {
              console.log(`✅ [Hook] Found employee data:`, {
                costCenter: employee.costCenter.name,
                team: employee.team
              });

              // Generate API token for Basic Auth fallback
              const apiToken = generateApiToken();

              return {
                name: employee.name,
                costCenterId: employee.costCenter.id,
                costCenterName: employee.costCenter.name,
                team: employee.team,
                apiToken,  // Auto-generated
                metadata: {
                  ...user.metadata,
                  peopleData: {
                    employeeId: employee.id,
                    department: employee.department,
                    lastSync: new Date().toISOString()
                  }
                }
              };
            }

            // If not found in People API, use defaults
            console.log(`⚠️  [Hook] Employee not found in People API, using defaults`);
            return {
              apiToken: generateApiToken(),
              costCenterId: null,
              costCenterName: null
            };
          },

          // NEW: beforeUpdateUser hook (called when existing user logs in)
          beforeUpdateUser: async ({ user, updates, claims, usersResource }) => {
            console.log(`\n🔧 [Hook] beforeUpdateUser called for: ${user.email}`);

            // Refresh data from People API on every login
            const employee = await mockPeopleAPI.getEmployeeByEmail(user.email);

            if (employee) {
              // Check if costCenter changed
              if (user.costCenterId !== employee.costCenter.id) {
                console.log(`🔄 [Hook] Cost center changed: ${user.costCenterName} → ${employee.costCenter.name}`);
              }

              return {
                costCenterId: employee.costCenter.id,
                costCenterName: employee.costCenter.name,
                team: employee.team,
                metadata: {
                  ...updates.metadata,
                  peopleData: {
                    employeeId: employee.id,
                    department: employee.department,
                    lastSync: new Date().toISOString()
                  }
                }
              };
            }

            return {};
          }
        },

        // Basic Auth Driver (API token fallback)
        {
          type: 'basic',
          resource: 'users',
          usernameField: 'email',
          passwordField: 'apiToken',
          passphrase: process.env.MRT_PASSPHRASE || 'test-passphrase'
        }
      ]
    },

    resources: {
      // URLs resource - accepts BOTH auth methods
      urls: {
        auth: ['oidc', 'basic'],
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      },

      // Users resource - admin only (not exposed in this example)
      users: {
        auth: false,  // Disabled for demo
        methods: []
      }
    },

    // Custom routes (like mrt-shortner dynamic controller)
    routes: {
      // App page (OIDC only - protected by protectedPaths)
      'GET /app': async (c) => {
        const user = c.get('user');

        return c.json({
          success: true,
          data: {
            message: 'Welcome to the app!',
            user: {
              email: user.email,
              name: user.name,
              costCenter: user.metadata?.costCenterId,
              authMethod: user.authMethod
            }
          }
        });
      },

      // Health endpoint (public)
      'GET /health': async (c) => {
        return c.json({
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString()
          }
        });
      },

      // Me endpoint (dual auth)
      'GET /api/v1/me': async (c) => {
        const user = c.get('user');

        if (!user) {
          return c.json({ error: 'Unauthorized' }, 401);
        }

        return c.json({
          success: true,
          data: {
            id: user.id,
            email: user.email,
            name: user.name,
            costCenter: user.metadata?.costCenterId,
            team: user.metadata?.teamId,
            authMethod: user.authMethod,
            scopes: user.scopes
          }
        });
      }
    },

    docs: {
      enabled: true,
      ui: 'redoc'
    }
  });

  await db.usePlugin(apiPlugin);
  console.log('✅ API Plugin installed with dual auth strategy');
  console.log('\n📡 Server running on http://localhost:3103');
  console.log('📚 API Docs: http://localhost:3103/docs');

  // 5. Demo - Simulate flows
  console.log('\n--- Dual Auth Strategy Demo ---\n');

  // Manually create a user (simulating OIDC login flow)
  console.log('1️⃣ Simulating OIDC login for alice@company.com...');
  const alice = await users.insert({
    id: 'alice@company.com',
    email: 'alice@company.com',
    name: 'Alice Johnson',
    apiToken: generateApiToken(),
    costCenterId: 'cc-marketing',
    costCenterName: 'Marketing',
    team: 'Digital Marketing',
    metadata: {
      peopleData: {
        employeeId: 'emp-001',
        department: 'Growth'
      }
    }
  });
  console.log('✅ User created:', alice.email);
  console.log('   Cost Center:', alice.costCenterName);
  console.log('   API Token:', alice.apiToken.substring(0, 20) + '...');

  // Test Basic Auth (API token)
  console.log('\n2️⃣ Testing Basic Auth with API token...');
  const basicAuthHeader = Buffer.from(`${alice.email}:${alice.apiToken}`).toString('base64');
  const basicAuthResponse = await fetch('http://localhost:3103/api/v1/me', {
    headers: {
      'Authorization': `Basic ${basicAuthHeader}`
    }
  });

  if (basicAuthResponse.ok) {
    const basicData = await basicAuthResponse.json();
    console.log('✅ Basic Auth successful');
    console.log('   Auth Method:', basicData.data.authMethod);
    console.log('   User:', basicData.data.email);
  } else {
    console.log('❌ Basic Auth failed:', basicAuthResponse.status);
  }

  // Test public endpoint
  console.log('\n3️⃣ Testing public endpoint (no auth)...');
  const healthResponse = await fetch('http://localhost:3103/health');
  const healthData = await healthResponse.json();
  console.log('✅ Public endpoint:', healthData.data.status);

  // Test protected path without auth (should fail)
  console.log('\n4️⃣ Testing protected path /app without auth...');
  const appResponse = await fetch('http://localhost:3103/app');
  if (appResponse.status === 302) {
    const location = appResponse.headers.get('location');
    console.log('✅ Correctly redirected to login:', location);
  } else {
    console.log('❌ Expected redirect, got:', appResponse.status);
  }

  console.log('\n--- Key Features Demonstrated ---');
  console.log('✅ Priority-based auth (OIDC → Basic fallback)');
  console.log('✅ Path-based protection (/app/** requires OIDC)');
  console.log('✅ beforeCreateUser hook (People API integration)');
  console.log('✅ beforeUpdateUser hook (refresh on login)');
  console.log('✅ API token generation (Basic Auth fallback)');
  console.log('✅ Public endpoints (no auth required)');

  console.log('\n--- Configuration Summary ---');
  console.log('Auth Strategy: priority (waterfall)');
  console.log('Priorities: { oidc: 1, basic: 2 }');
  console.log('Protected Paths: ["/app/**", "/dashboard/**"]');
  console.log('Public Paths: ["/health", "/api/**" with Basic Auth]');

  console.log('\n💡 Tip: This architecture can replace mrt-shortner Express setup!');
  console.log('   - OIDC for /app (browser-based)');
  console.log('   - Basic Auth for /api (token-based)');
  console.log('   - External API integration via hooks');
  console.log('   - Path-based protection');

  // Keep server running
  console.log('\n⏳ Server will remain running for testing...');
  console.log('   Press Ctrl+C to stop\n');
}

main().catch(console.error);
