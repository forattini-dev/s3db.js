/**
 * Example 92: OIDC with External API Enrichment (People API Pattern)
 *
 * Demonstrates how to enrich OIDC users with data from external APIs
 * during auto-provisioning.
 *
 * Use Case: Fetch employee data from People API (HR system) when user
 * logs in via Azure AD/Entra ID for the first time.
 *
 * Pattern used by mrt-shortner to get costCenter, department, etc.
 *
 * Run: node docs/examples/e92-oidc-external-api-enrichment.js
 */

import { Database, ApiPlugin } from '../../dist/s3db.es.js';

// ============================================
// Mock External API (e.g., People API / HR System)
// ============================================

/**
 * Simulates fetching employee data from external HR/People API
 * In production, this would call actual API:
 * - Stone People API
 * - BambooHR
 * - Workday
 * - etc.
 */
async function fetchEmployeeFromPeopleAPI(email) {
  console.log(`[People API] Fetching employee data for: ${email}`);

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));

  // Mock employee database
  const employees = {
    'john.doe@stone.co': {
      email: 'john.doe@stone.co',
      name: 'John Doe',
      costCenterId: 'CC-123',
      costCenterName: 'Engineering',
      department: 'Backend',
      manager: 'jane.smith@stone.co',
      startDate: '2020-01-15',
      location: 'São Paulo',
      phone: '+55 11 99999-9999'
    },
    'jane.smith@stone.co': {
      email: 'jane.smith@stone.co',
      name: 'Jane Smith',
      costCenterId: 'CC-456',
      costCenterName: 'Product',
      department: 'Product Management',
      manager: null,  // VP, no manager
      startDate: '2018-05-01',
      location: 'Remote',
      phone: '+55 21 88888-8888'
    }
  };

  const employee = employees[email];

  if (employee) {
    console.log(`[People API] ✅ Found employee:`, employee.name);
    return employee;
  } else {
    console.log(`[People API] ⚠️  Employee not found in People API`);
    return null;
  }
}

/**
 * Extract relevant user data from employee record
 */
function extractUserDataFromEmployee(employee) {
  if (!employee) return {};

  return {
    costCenterId: employee.costCenterId,
    costCenterName: employee.costCenterName,
    name: employee.name,
    department: employee.department,
    peopleData: {
      manager: employee.manager,
      startDate: employee.startDate,
      location: employee.location,
      phone: employee.phone
    }
  };
}

// ============================================
// Setup Database
// ============================================

const db = new Database({
  connectionString: 'memory://',
  verbose: false
});

await db.connect();

// Create users resource
await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    name: 'string|optional',
    costCenterId: 'string|optional',
    costCenterName: 'string|optional',
    department: 'string|optional',
    needsOnboarding: 'boolean|default:true',
    metadata: 'object|optional'
  },
  timestamps: true
});

console.log('✅ Database setup complete');
console.log('');

// ============================================
// Setup API Plugin with OIDC + People API Enrichment
// ============================================

await db.use(new ApiPlugin({
  port: 3110,
  verbose: true,

  auth: {
    drivers: [{
      driver: 'oidc',
      config: {
        // Mock OIDC config (in production, use real Azure AD / Google / etc.)
        issuer: 'https://login.microsoftonline.com/TENANT_ID/v2.0',
        clientId: process.env.OIDC_CLIENT_ID || 'mock-client-id',
        clientSecret: process.env.OIDC_CLIENT_SECRET || 'mock-client-secret',
        redirectUri: 'http://localhost:3110/auth/oidc/callback',
        scopes: ['openid', 'profile', 'email'],
        cookieSecret: 'my-super-secret-cookie-key-minimum-32-chars!!!',
        rollingDuration: 86400000,  // 24 hours
        absoluteDuration: 604800000, // 7 days
        autoCreateUser: true,

        /**
         * ✅ KEY FEATURE: onUserAuthenticated hook
         *
         * This hook runs AFTER user is authenticated but BEFORE returning to app.
         * Perfect for enriching user data from external APIs.
         *
         * Parameters:
         * - user: User object from database (just created if new user)
         * - created: Boolean - true if user was just created
         * - claims: OIDC claims from identity provider
         * - tokens: Access token, ID token, refresh token
         */
        onUserAuthenticated: async ({ user, created, claims, tokens }) => {
          console.log('');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🔔 onUserAuthenticated Hook');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`Email: ${user.email}`);
          console.log(`Created: ${created ? 'YES (new user)' : 'NO (existing user)'}`);
          console.log(`Claims:`, JSON.stringify(claims, null, 2));
          console.log('');

          // ✅ PATTERN 1: Only enrich NEW users (first login)
          if (!created) {
            console.log('ℹ️  Existing user - skipping enrichment');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
            return;
          }

          console.log('🆕 New user detected - starting enrichment...');
          console.log('');

          try {
            // ✅ PATTERN 2: Fetch from external API
            const employee = await fetchEmployeeFromPeopleAPI(user.email);

            if (employee) {
              const enrichedData = extractUserDataFromEmployee(employee);

              console.log('📊 Enriched data from People API:');
              console.log(`  - Cost Center: ${enrichedData.costCenterId} (${enrichedData.costCenterName})`);
              console.log(`  - Department: ${enrichedData.department}`);
              console.log(`  - Name: ${enrichedData.name}`);
              console.log('');

              // ✅ PATTERN 3: Update user with enriched data
              await db.resources.users.patch(user.id, {
                costCenterId: enrichedData.costCenterId,
                costCenterName: enrichedData.costCenterName,
                name: enrichedData.name || user.name,  // Fallback to OIDC name
                department: enrichedData.department,
                needsOnboarding: false,  // ✅ Skip onboarding if data complete
                'metadata.peopleData': enrichedData.peopleData,
                'metadata.oidcClaims': claims
              });

              console.log('✅ User enriched successfully from People API');
            } else {
              // ✅ PATTERN 4: Graceful degradation if API fails
              console.log('⚠️  Employee not found in People API');
              console.log('   User will need to complete onboarding manually');

              // Keep needsOnboarding=true to trigger onboarding flow
              await db.resources.users.patch(user.id, {
                'metadata.oidcClaims': claims,
                'metadata.peopleApiChecked': true,
                'metadata.peopleApiFound': false
              });
            }
          } catch (error) {
            // ✅ PATTERN 5: Error handling (don't fail login!)
            console.error('❌ Error fetching from People API:', error.message);
            console.error('   User login will succeed, but without enriched data');
            console.error('   User will complete onboarding manually');

            // Log error but don't throw (allow login to succeed)
            await db.resources.users.patch(user.id, {
              'metadata.peopleApiError': error.message,
              'metadata.peopleApiChecked': true
            });
          }

          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('');
        }
      }
    }],
    resource: 'users',
    pathRules: [
      { path: '/app/**', methods: ['oidc'], required: true }
    ]
  },

  // Simple route to test enrichment
  routes: {
    '/': async (c, ctx) => {
      return ctx.html(`
        <h1>OIDC + People API Enrichment Example</h1>
        <p><a href="/auth/oidc/login">Login with OIDC</a></p>
        <p><a href="/app">Access Protected App</a></p>
      `);
    },

    '/app': async (c, ctx) => {
      ctx.requireAuth();

      const { user } = ctx;

      return ctx.html(`
        <h1>Protected App</h1>
        <h2>User Profile</h2>
        <pre>${JSON.stringify(user, null, 2)}</pre>

        <h2>Enrichment Status</h2>
        ${user.costCenterId
          ? '<p>✅ <strong>Enriched from People API</strong></p>'
          : '<p>⚠️ <strong>Not enriched</strong> - needs onboarding</p>'
        }

        ${user.needsOnboarding
          ? '<p><a href="/onboarding">Complete Onboarding →</a></p>'
          : '<p>Profile complete!</p>'
        }

        <p><a href="/auth/oidc/logout">Logout</a></p>
      `);
    },

    '/onboarding': async (c, ctx) => {
      ctx.requireAuth();

      return ctx.html(`
        <h1>Complete Your Profile</h1>
        <p>We couldn't find your data in our HR system.</p>
        <p>Please provide the following information:</p>

        <form method="POST" action="/api/complete-profile">
          <label>Cost Center ID:</label><br>
          <input type="text" name="costCenterId" required><br><br>

          <label>Department:</label><br>
          <input type="text" name="department" required><br><br>

          <button type="submit">Complete Profile</button>
        </form>
      `);
    },

    'POST /api/complete-profile': async (c, ctx) => {
      ctx.requireAuth();

      const formData = await ctx.formData();
      const costCenterId = formData.get('costCenterId');
      const department = formData.get('department');

      // Update user profile
      await db.resources.users.patch(ctx.user.id, {
        costCenterId,
        department,
        needsOnboarding: false
      });

      return ctx.redirect('/app');
    }
  }
}));

console.log('✅ API Plugin running at http://localhost:3110');
console.log('');
console.log('📋 How to Test:');
console.log('');
console.log('1. Open http://localhost:3110 in browser');
console.log('2. Click "Login with OIDC"');
console.log('3. Mock OIDC will create user with email from OIDC claims');
console.log('4. onUserAuthenticated hook will:');
console.log('   a. Detect if user is new (created=true)');
console.log('   b. Fetch employee data from People API');
console.log('   c. Enrich user profile with costCenter, department, etc.');
console.log('   d. Set needsOnboarding=false if data found');
console.log('5. If not found in People API:');
console.log('   - User redirected to /onboarding');
console.log('   - Manual form to complete profile');
console.log('');

console.log('🎯 Key Patterns Demonstrated:');
console.log('  ✅ OIDC auto-provisioning with autoCreateUser=true');
console.log('  ✅ onUserAuthenticated hook for enrichment');
console.log('  ✅ External API integration (People API)');
console.log('  ✅ Graceful degradation if API fails');
console.log('  ✅ Error handling (don\'t block login)');
console.log('  ✅ Onboarding flow for missing data');
console.log('  ✅ needsOnboarding flag pattern');
console.log('');

console.log('💡 Production Tips:');
console.log('  - Cache People API responses (avoid rate limits)');
console.log('  - Use retry logic with exponential backoff');
console.log('  - Log enrichment attempts for audit');
console.log('  - Consider async enrichment (don\'t block login)');
console.log('  - Add timeout to prevent slow logins');
console.log('');

console.log('📁 Real-World Usage:');
console.log('  - mrt-shortner: Fetch costCenter from Stone People API');
console.log('  - Employee portals: Sync org chart data');
console.log('  - B2B SaaS: Enrich with CRM data (Salesforce, HubSpot)');
console.log('  - Internal tools: Fetch permissions from LDAP');
console.log('');
