/**
 * Example 86: OIDC Authentication with User Hooks
 *
 * Demonstrates how to use the `onUserAuthenticated` hook to populate
 * additional resources (like profiles) when a user authenticates via OIDC/OAuth2.
 *
 * Use cases:
 * - Create user profile with extra data not in IDP
 * - Send welcome email to new users
 * - Log authentication events
 * - Initialize user preferences
 * - Trigger onboarding flow
 *
 * Run:
 *   node docs/examples/e86-oidc-user-hooks.js
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

const APP_PORT = 3000;

async function setupDatabase() {
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/oidc-hooks-example',
    encryptionKey: 'oidc-hooks-encryption-key-32chars!'
  });

  await db.connect();

  // Create users resource (managed by OIDC)
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
      lastLoginAt: 'datetime|optional',
      metadata: 'object|optional'
    },
    timestamps: true
  });

  // 🎯 Create profiles resource (extra data not in IDP)
  await db.createResource({
    name: 'profiles',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      bio: 'string|optional',
      company: 'string|optional',
      location: 'string|optional',
      phone: 'string|optional',
      website: 'string|optional',
      onboarded: 'boolean|optional',
      preferences: {
        theme: 'string|optional',
        language: 'string|optional',
        notifications: 'boolean|optional',
        timezone: 'string|optional'
      }
    },
    timestamps: true
  });

  // Create auth events log
  await db.createResource({
    name: 'auth_events',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      event: 'string|required',  // 'login', 'first_login', 'token_refresh'
      provider: 'string|required',
      metadata: 'object|optional'
    },
    timestamps: true
  });

  console.log('✓ Created users, profiles, and auth_events resources\n');

  return db;
}

async function setupAPI(db) {
  const apiPlugin = new ApiPlugin({
    port: APP_PORT,
    verbose: true,

    auth: {
      drivers: [
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

            // 🎯 HOOK: Called after user is authenticated
            onUserAuthenticated: async ({ user, created, claims, tokens }) => {
              console.log('\n🔔 User authenticated:', user.email);
              console.log('   Created:', created);
              console.log('   Claims:', JSON.stringify(claims, null, 2));

              // 1. Create profile if new user
              if (created) {
                console.log('🆕 New user - creating profile...');

                await db.resources.profiles.insert({
                  id: `profile-${user.id}`,
                  userId: user.id,
                  bio: '',
                  company: '',
                  location: '',
                  phone: '',
                  website: '',
                  onboarded: false,
                  preferences: {
                    theme: 'light',
                    language: 'en',
                    notifications: true,
                    timezone: 'UTC'
                  }
                });

                console.log('✅ Profile created for:', user.email);

                // 2. Send welcome email (simulated)
                console.log('📧 Sending welcome email to:', user.email);
                // await sendWelcomeEmail(user.email, user.name);

                // 3. Log first login event
                await db.resources.auth_events.insert({
                  id: `event-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  userId: user.id,
                  event: 'first_login',
                  provider: claims.iss || 'oidc',
                  metadata: {
                    name: claims.name,
                    picture: claims.picture,
                    locale: claims.locale
                  }
                });

                console.log('✅ First login event logged');
              } else {
                // Existing user - log regular login
                await db.resources.auth_events.insert({
                  id: `event-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  userId: user.id,
                  event: 'login',
                  provider: claims.iss || 'oidc',
                  metadata: {
                    ip: null, // Could get from request
                    userAgent: null
                  }
                });

                console.log('✅ Login event logged');
              }

              // 4. Update profile picture if changed
              try {
                const profile = await db.resources.profiles.get(`profile-${user.id}`);

                if (claims.picture && claims.picture !== user.picture) {
                  console.log('🖼️  Updating profile picture...');
                  // Could download and store picture
                }
              } catch (err) {
                console.warn('⚠️  Profile not found, might need to create it');
              }

              console.log('✅ Hook completed\n');
            }
          }
        },

        // Also support JWT for API access
        {
          driver: 'jwt',
          config: {
            secret: 'my-jwt-secret-key',
            expiresIn: '7d'
          }
        }
      ],
      resource: 'users'
    },

    resources: {
      users: {
        versionPrefix: 'v1',
        methods: ['GET', 'PUT', 'DELETE']
      },
      profiles: {
        versionPrefix: 'v1',
        methods: ['GET', 'PUT', 'PATCH']
      },
      auth_events: {
        versionPrefix: 'v1',
        methods: ['GET']  // Read-only
      }
    }
  });

  await db.usePlugin(apiPlugin);

  return apiPlugin;
}

function printUsage() {
  const baseUrl = `http://localhost:${APP_PORT}`;

  console.log(`\n🚀 OIDC Hooks Example running at: ${baseUrl}`);
  console.log('\n📋 How it works:\n');

  console.log('1️⃣  User clicks "Login with Google"');
  console.log('   GET /auth/oidc/login');

  console.log('\n2️⃣  Google OAuth2 callback');
  console.log('   GET /auth/oidc/callback?code=...');
  console.log('   → Token exchange');
  console.log('   → User created/updated in `users` resource');
  console.log('   → 🎯 onUserAuthenticated hook called:');
  console.log('       - If new user: Create profile, send email, log event');
  console.log('       - If existing: Log login event');

  console.log('\n3️⃣  Hook execution:');
  console.log('   ✓ Create profile in `profiles` resource');
  console.log('   ✓ Send welcome email (simulated)');
  console.log('   ✓ Log auth event in `auth_events` resource');
  console.log('   ✓ Update profile picture if changed');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 SETUP REQUIRED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Before running, set up Google OAuth2:');
  console.log('');
  console.log('1. Go to: https://console.cloud.google.com/apis/credentials');
  console.log('');
  console.log('2. Create OAuth 2.0 Client ID:');
  console.log('   - Application type: Web application');
  console.log('   - Authorized redirect URIs: ' + baseUrl + '/auth/oidc/callback');
  console.log('');
  console.log('3. Set environment variables:');
  console.log('   export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"');
  console.log('   export GOOGLE_CLIENT_SECRET="your-client-secret"');
  console.log('');
  console.log('4. Run example:');
  console.log('   node docs/examples/e86-oidc-user-hooks.js');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST ENDPOINTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Login:');
  console.log(`  ${baseUrl}/auth/oidc/login`);
  console.log('');

  console.log('After authentication, check data:');
  console.log(`  GET ${baseUrl}/api/v1/users           - List users`);
  console.log(`  GET ${baseUrl}/api/v1/profiles        - List profiles`);
  console.log(`  GET ${baseUrl}/api/v1/auth_events     - List auth events`);
  console.log('');

  console.log('Get your profile:');
  console.log(`  GET ${baseUrl}/api/v1/profiles/profile-<your-email>`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📖 HOOK SIGNATURE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('onUserAuthenticated: async ({ user, created, claims, tokens }) => {');
  console.log('  // user - User object from users resource');
  console.log('  // created - Boolean (true if new user, false if existing)');
  console.log('  // claims - ID token claims from IDP');
  console.log('  // tokens - { access_token, id_token, refresh_token }');
  console.log('');
  console.log('  if (created) {');
  console.log('    // New user - create profile, send email, etc.');
  console.log('  } else {');
  console.log('    // Existing user - log login, update data, etc.');
  console.log('  }');
  console.log('}');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 USE CASES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('✓ Create user profile with data not in IDP');
  console.log('✓ Send welcome email to new users');
  console.log('✓ Log authentication events for audit');
  console.log('✓ Initialize user preferences/settings');
  console.log('✓ Trigger onboarding workflow');
  console.log('✓ Sync user data with external systems');
  console.log('✓ Create default resources (folders, projects, etc.)');
  console.log('✓ Assign default permissions/roles');
  console.log('✓ Track login analytics');
  console.log('');

  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'your-client-id') {
    console.log('⚠️  Google OAuth2 not configured!');
    console.log('    Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.\n');
  } else {
    console.log('✅ Server ready! Open your browser and test OIDC login.\n');
  }
}

async function main() {
  console.log('🌐 Setting up OIDC User Hooks Example...\n');

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
