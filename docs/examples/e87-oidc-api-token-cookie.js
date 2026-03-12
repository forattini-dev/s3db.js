/**
 * Example 87: OIDC with API Token Cookie
 *
 * Demonstrates how to:
 * 1. Login via OIDC (Google, Azure AD, etc.)
 * 2. Generate API token for the user
 * 3. Set cookie with the API token
 * 4. Use cookie for subsequent API requests (independent of IDP)
 *
 * Use case:
 * - User logs in via OIDC (one-time)
 * - System generates API token
 * - Token stored in secure cookie
 * - Subsequent requests use cookie (no need to re-authenticate with IDP)
 *
 * Run:
 *   node docs/examples/e87-oidc-api-token-cookie.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import crypto from 'crypto';

const APP_PORT = 3000;

/**
 * Generate secure API token
 */
function generateApiToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function setupDatabase() {
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/oidc-token-cookie',
    encryptionKey: 'oidc-token-cookie-encryption-32chars!'
  });

  await db.connect();

  // Create users resource
  await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      email: 'string|required',
      username: 'string|optional',
      name: 'string|optional',
      picture: 'string|optional',
      role: 'string|optional',
      active: 'boolean|optional',
      apiToken: 'string|optional',  // 🔑 API Token field
      lastLoginAt: 'string|optional',
      metadata: 'object|optional'
    },
    timestamps: true
  });

  // 🎯 Hook on user insert to generate API token
  db.on('resource:users:insert', async (event) => {
    const user = event.data;

    // Generate API token if not present
    if (!user.apiToken) {
      const apiToken = generateApiToken();

      await db.resources.users.update(user.id, {
        apiToken
      });

      console.log('🔑 Generated API token for:', user.email);
    }
  });

  // Create profiles resource (extra data)
  await db.createResource({
    name: 'profiles',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      bio: 'string|optional',
      company: 'string|optional',
      preferences: 'object|optional'
    },
    timestamps: true
  });

  console.log('✓ Created users and profiles resources\n');

  return db;
}

async function setupAPI(db) {
  const apiPlugin = new ApiPlugin({
    port: APP_PORT,
    verbose: true,

    auth: {
      drivers: [
        // 1️⃣ OIDC for initial login
        {
          driver: 'oidc',
          config: {
            issuer: 'https://accounts.google.com',
            clientId: process.env.GOOGLE_CLIENT_ID || 'your-client-id',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-client-secret',
            redirectUri: `http://localhost:${APP_PORT}/auth/oidc/callback`,
            scopes: ['openid', 'profile', 'email'],
            cookieSecret: 'my-super-secret-cookie-key-minimum-32-chars!!!',
            rollingDuration: 86400000,  // 24 hours
            absoluteDuration: 604800000, // 7 days
            idpLogout: true,
            autoCreateUser: true,

            // 🎯 HOOK: Set API token cookie after authentication
            onUserAuthenticated: async ({ user, created, claims, tokens, context }) => {
              console.log('\n🔔 User authenticated:', user.email);
              console.log('   New user?', created);

              // 1️⃣ Create profile if new user
              if (created) {
                await db.resources.profiles.insert({
                  id: `profile-${user.id}`,
                  userId: user.id,
                  bio: '',
                  company: '',
                  preferences: {
                    theme: 'light',
                    language: 'en'
                  }
                });
                console.log('✅ Profile created');
              }

              // 2️⃣ Get user with updated API token (from insert hook)
              const updatedUser = await db.resources.users.get(user.id);

              if (!updatedUser.apiToken) {
                console.warn('⚠️  API token not generated yet, retrying...');
                // Wait a bit for the hook to complete
                await new Promise(resolve => setTimeout(resolve, 100));
                const retryUser = await db.resources.users.get(user.id);
                updatedUser.apiToken = retryUser.apiToken;
              }

              // 3️⃣ Set cookie with API token
              if (updatedUser.apiToken) {
                context.cookie('api_token', updatedUser.apiToken, {
                  httpOnly: true,        // Cannot be accessed by JavaScript
                  secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
                  sameSite: 'Lax',       // CSRF protection
                  maxAge: 7 * 24 * 60 * 60,  // 7 days
                  path: '/'
                });

                console.log('🍪 API token cookie set!');
                console.log('   Token:', updatedUser.apiToken.substring(0, 20) + '...');
              } else {
                console.error('❌ No API token available to set cookie');
              }

              console.log('✅ Hook completed\n');
            }
          }
        },

        // 2️⃣ API Key for subsequent requests (from cookie or header)
        {
          driver: 'apiKey',
          config: {
            headerName: 'X-API-Key',
            cookieName: 'api_token',  // 🔥 Also read from cookie!
            tokenField: 'apiToken'
          }
        }
      ],
      resource: 'users',

      // Path-based auth: Use API Key (cookie) for /api/**
      pathRules: [
        // Public: Health checks
        {
          path: '/health/**',
          required: false
        },

        // Public: Auth endpoints
        {
          path: '/auth/**',
          required: false
        },

        // Protected: API endpoints (API Key from cookie or header)
        {
          path: '/api/**',
          methods: ['apiKey'],
          required: true
        }
      ]
    },

    resources: {
      users: {
        versionPrefix: 'v1',
        methods: ['GET', 'PUT', 'DELETE']
      },
      profiles: {
        versionPrefix: 'v1',
        methods: ['GET', 'PUT', 'PATCH']
      }
    }
  });

  await db.usePlugin(apiPlugin);

  return apiPlugin;
}

function printUsage() {
  const baseUrl = `http://localhost:${APP_PORT}`;

  console.log(`\n🚀 OIDC + API Token Cookie Example running at: ${baseUrl}`);
  console.log('\n📋 Flow:\n');

  console.log('1️⃣  User clicks "Login with Google"');
  console.log(`   ${baseUrl}/auth/oidc/login`);

  console.log('\n2️⃣  Google OAuth2 callback');
  console.log('   → Token exchange');
  console.log('   → User created/updated');
  console.log('   → API token generated (via hook)');
  console.log('   → 🍪 Cookie set with API token');

  console.log('\n3️⃣  Subsequent requests use cookie automatically');
  console.log(`   GET ${baseUrl}/api/v1/users`);
  console.log('   → Cookie: api_token=<token>');
  console.log('   → No need to login again!');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 SETUP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('1. Configure Google OAuth2:');
  console.log('   https://console.cloud.google.com/apis/credentials');
  console.log('');
  console.log('2. Set environment variables:');
  console.log('   export GOOGLE_CLIENT_ID="your-id.apps.googleusercontent.com"');
  console.log('   export GOOGLE_CLIENT_SECRET="your-secret"');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TESTING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('1. Login via OIDC (browser):');
  console.log(`   open ${baseUrl}/auth/oidc/login`);
  console.log('');

  console.log('2. After login, check cookie:');
  console.log('   Browser DevTools → Application → Cookies');
  console.log('   Should see: api_token=<long-token>');
  console.log('');

  console.log('3. Test API with cookie (automatic):');
  console.log(`   curl ${baseUrl}/api/v1/users \\`);
  console.log('     --cookie "api_token=<token-from-browser>"');
  console.log('');

  console.log('4. Test API with header (manual):');
  console.log(`   curl ${baseUrl}/api/v1/users \\`);
  console.log('     -H "X-API-Key: <token>"');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 API TOKEN FLOW');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('User Insert Hook:');
  console.log('  db.on("resource:users:insert") → Generate API token');
  console.log('');

  console.log('OIDC Hook:');
  console.log('  onUserAuthenticated({ context }) → Set cookie');
  console.log('');

  console.log('API Key Driver:');
  console.log('  Reads from: Cookie (api_token) OR Header (X-API-Key)');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🍪 COOKIE CONFIGURATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('context.cookie("api_token", token, {');
  console.log('  httpOnly: true,      // Cannot be accessed by JS');
  console.log('  secure: true,        // HTTPS only (production)');
  console.log('  sameSite: "Lax",     // CSRF protection');
  console.log('  maxAge: 604800,      // 7 days');
  console.log('  path: "/"            // Available on all paths');
  console.log('});');
  console.log('');

  console.log('✅ Secure:');
  console.log('  ✓ HttpOnly = No XSS attacks');
  console.log('  ✓ Secure = HTTPS only');
  console.log('  ✓ SameSite = CSRF protection');
  console.log('  ✓ MaxAge = Auto-expire');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 BENEFITS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('✓ Login once via OIDC → cookie set');
  console.log('✓ Subsequent requests automatic (browser sends cookie)');
  console.log('✓ No need to re-authenticate with IDP');
  console.log('✓ Works independently of IDP availability');
  console.log('✓ Can revoke token by updating user.apiToken');
  console.log('✓ Mobile apps can use X-API-Key header instead');
  console.log('');

  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'your-client-id') {
    console.log('⚠️  Google OAuth2 not configured!');
    console.log('    Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET\n');
  } else {
    console.log('✅ Server ready! Login via OIDC and get your API token cookie.\n');
  }
}

async function main() {
  console.log('🌐 Setting up OIDC + API Token Cookie Example...\n');

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
