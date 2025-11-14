/**
 * Example 102: OIDC with S3DB Session Store
 *
 * Demonstrates how to use s3db.js resources as a persistent session store
 * for OIDC authentication using the driver pattern.
 *
 * **Key Benefits:**
 * - ✅ Persistent sessions (survive server restart)
 * - ✅ Horizontal scaling (sessions shared across instances)
 * - ✅ Integrated with your s3db.js data
 * - ✅ 99% smaller cookies (50 bytes vs 4-40KB)
 * - ✅ Automatic cleanup with TTL plugin
 * - ✅ Simple driver-based configuration
 *
 * **Setup:**
 * ```bash
 * docker compose up -d minio redis localstack
 * node e102-oidc-s3db-session-store.js
 * ```
 *
 * **Test:**
 * ```bash
 * # Login flow
 * curl http://localhost:3000/auth/login
 *
 * # Check session resource
 * curl http://localhost:3000/api/oidc_sessions
 * ```
 */

import { Database } from '../../src/index.js';
import { APIPlugin } from '../../src/plugins/api/index.js';

console.log('🚀 Starting OIDC with S3DB Session Store Example\n');

// ============================================================================
// STEP 1: Setup Database
// ============================================================================

const db = new Database({
  bucketName: 'test-oidc-sessions',
  region: 'us-east-1',
  endpoint: 'http://localhost:4566'  // LocalStack
});

console.log('📦 Creating resources...');

// Create OIDC sessions resource
let sessionsResource;
try {
  const existing = await db.metadata();
  if (!existing.resources?.oidc_sessions) {
    sessionsResource = await db.createResource({
      name: 'oidc_sessions',
      attributes: {
        // Session metadata
        expiresAt: 'string|required',      // Expiration time (ISO 8601)
        lastActivity: 'string',             // For rolling session duration

        // User info (from OIDC token claims)
        userId: 'string',
        email: 'string',
        name: 'string'
      },
      timestamps: true
    });
    console.log('✅ Created oidc_sessions resource');
  } else {
    sessionsResource = db.resources.oidc_sessions;
    console.log('✅ Using existing oidc_sessions resource');
  }
} catch (err) {
  console.error('❌ Failed to create sessions resource:', err.message);
  process.exit(1);
}

// Create users resource (stores OIDC user data)
let usersResource;
if (!db.resources.users) {
  usersResource = await db.createResource({
    name: 'users',
    attributes: {
      email: 'string|required|email',
      name: 'string',
      picture: 'string',
      provider: 'string',              // "google", "azure", etc.
      providerId: 'string',            // sub from OIDC token
      scopes: 'string'                 // comma-separated or JSON array
    },
    timestamps: true
  });
  console.log('✅ Created users resource');
} else {
  usersResource = db.resources.users;
  console.log('✅ Using existing users resource');
}

console.log('');

// ============================================================================
// STEP 2: Configure API Plugin with OIDC + S3DB Session Store
// ============================================================================

const apiPlugin = new APIPlugin({
  port: 3000,
  cors: { enabled: true },

  auth: {
    drivers: [
      {
        driver: 'oidc',
        config: {
          // OIDC Provider Configuration
          // Using a mock OIDC provider for demo (replace with real provider)
          issuer: 'https://accounts.google.com',
          clientId: 'your-client-id-here',
          clientSecret: 'your-client-secret-here',
          redirectUri: 'http://localhost:3000/auth/callback',
          scopes: ['openid', 'profile', 'email'],

          // 🎯 KEY: S3DB Session Store using driver pattern
          sessionStore: {
            driver: 's3db',              // ← Use s3db.js resource
            config: {
              resourceName: 'oidc_sessions'  // ← Resource name to use
            }
          },

          // Session configuration
          cookieMaxAge: 86400000,          // 24 hours
          rollingDuration: 3600000,        // 1 hour rolling idle timeout
          absoluteDuration: 604800000,     // 7 day absolute max

          // Cookie security
          cookieSecure: false,             // Set to true in production (HTTPS)
          cookieSameSite: 'Lax',
          cookieName: 'oidc_session',
          cookieSecret: 'your-32-byte-secret-key-change-this!!!',

          // Logging
          verbose: true,

          // Auto-create users from OIDC claims
          autoCreateUser: true,
          usersResource,                   // ← Where to store user data

          // Hooks
          onUserAuthenticated: async ({ user, created, context }) => {
            console.log(`[OIDC] ${created ? '✨ User created:' : '✅ User authenticated:'} ${user.email}`);
          }
        }
      }
    ]
  },

  // Expose session resource via REST API (for monitoring)
  resources: {
    oidc_sessions: {
      methods: ['GET', 'DELETE'],         // Read-only to clients
      guard: async (action) => {
        // Require admin token to view/delete sessions
        return action === 'query';         // Allow listing sessions
      }
    },
    users: {
      methods: ['GET', 'POST'],
      guard: async (action) => action !== 'delete'
    }
  }
});

// Start API
try {
  await db.usePlugin(apiPlugin);
  console.log('✅ API Plugin started at http://localhost:3000\n');
} catch (err) {
  console.error('❌ Failed to start API:', err.message);
  process.exit(1);
}

// ============================================================================
// STEP 3: Optional - Add TTL Plugin for Auto-Cleanup
// ============================================================================

// Uncomment to auto-delete expired sessions:
/*
import { TTLPlugin } from '../../src/plugins/ttl.plugin.js';

const ttlPlugin = new TTLPlugin({
  verbose: true,
  resources: {
    oidc_sessions: {
      field: 'expiresAt',  // Use this field for expiration
      granularity: 'minute'  // Check every minute
    }
  }
});

await db.usePlugin(ttlPlugin);
console.log('🧹 TTL Plugin active - Expired sessions auto-deleted\n');
*/

// ============================================================================
// STEP 4: Monitoring and Management
// ============================================================================

// Endpoints and usage info
console.log('═'.repeat(70));
console.log('📋 OIDC with S3DB Session Store');
console.log('═'.repeat(70));
console.log('\n🔐 Authentication Endpoints:');
console.log('  GET  /auth/login       → Redirect to OIDC provider');
console.log('  GET  /auth/callback    → OAuth2 callback (automatic)');
console.log('  GET  /auth/logout      → Logout and clear session\n');

console.log('📊 Session Monitoring (REST API):');
console.log('  GET  /api/oidc_sessions              → List all sessions');
console.log('  GET  /api/oidc_sessions/:sessionId   → Get session details');
console.log('  DELETE /api/oidc_sessions/:sessionId → Force logout\n');

console.log('👤 User Management:');
console.log('  GET  /api/users              → List users');
console.log('  GET  /api/users/:userId      → Get user profile\n');

// Helper functions for management
console.log('═'.repeat(70));
console.log('🛠️  Session Management (programmatic):');
console.log('═'.repeat(70));

// Function to show session stats
async function showSessionStats() {
  try {
    const sessions = await db.resources.oidc_sessions.query();
    const now = new Date();

    const active = sessions.filter(s => new Date(s.expiresAt) >= now).length;
    const expired = sessions.filter(s => new Date(s.expiresAt) < now).length;

    console.log('\n📈 Session Statistics:');
    console.log(`   Total sessions: ${sessions.length}`);
    console.log(`   Active: ${active}`);
    console.log(`   Expired: ${expired}`);

    if (sessions.length > 0) {
      const mostRecent = sessions[sessions.length - 1];
      console.log(`   Latest session: ${mostRecent.id.substring(0, 8)}... (${mostRecent.email || 'unknown'})`);
    }
  } catch (err) {
    console.error('Error fetching session stats:', err.message);
  }
}

// Function to cleanup expired sessions manually
async function cleanupExpiredSessions() {
  try {
    const sessions = await db.resources.oidc_sessions.query();
    const now = new Date();

    const toDelete = sessions.filter(s => new Date(s.expiresAt) < now);
    console.log(`\n🧹 Deleting ${toDelete.length} expired sessions...`);

    for (const session of toDelete) {
      await db.resources.oidc_sessions.delete(session.id);
    }

    console.log(`✅ Cleanup complete`);
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }
}

// Show stats every 30 seconds
setInterval(showSessionStats, 30000);
await showSessionStats();  // Show immediately

// ============================================================================
// STEP 5: Graceful Shutdown
// ============================================================================

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  console.log('═'.repeat(70));
  await showSessionStats();
  await db.disconnect();
  console.log('✅ Shutdown complete');
  process.exit(0);
});

console.log('\n💡 Tip: Check sessions with: curl http://localhost:3000/api/oidc_sessions');
console.log('💡 Tip: Call cleanupExpiredSessions() in console to delete expired sessions');
console.log('\n');
