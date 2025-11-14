/**
 * Example 103: API Plugin - Complete Configuration Reference
 *
 * Demonstrates ALL API Plugin configuration options with real-world setup.
 * This is the most comprehensive example covering:
 *
 * ✅ Multiple auth drivers (OIDC, JWT, Basic, OAuth2 Server)
 * ✅ Session stores (S3DB, Redis, Memory)
 * ✅ Resource configuration with guards
 * ✅ Custom middleware
 * ✅ Custom routes
 * ✅ Documentation & OpenAPI
 * ✅ Security & CORS
 * ✅ Static files & templates
 * ✅ Performance & caching
 * ✅ Rate limiting & failban
 * ✅ Health checks & metrics
 *
 * **Run with:**
 * ```bash
 * docker compose up -d minio redis localstack
 * node e103-api-plugin-complete-config.js
 * ```
 */

import { Database } from '../../src/index.js';
import { APIPlugin } from '../../src/plugins/api/index.js';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { TTLPlugin } from '../../src/plugins/ttl.plugin.js';
import { MetricsPlugin } from '../../src/plugins/metrics.plugin.js';

console.log('🚀 Starting Complete API Plugin Configuration Example\n');

// ============================================================================
// SETUP: Database and Resources
// ============================================================================

const db = new Database({
  bucketName: 'test-api-complete',
  region: 'us-east-1',
  endpoint: 'http://localhost:4566'  // LocalStack
});

console.log('📦 Creating resources...\n');

// User resource (for OIDC/user management)
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email|unique',
    name: 'string|required',
    role: 'string|default:user',  // user, admin, moderator
    picture: 'string',
    provider: 'string',            // google, azure, etc.
    providerId: 'string',
    scopes: 'string',
    createdAt: 'string|required'
  },
  timestamps: true
});

// Posts resource (public content)
const posts = await db.createResource({
  name: 'posts',
  attributes: {
    title: 'string|required|minlength:5',
    body: 'string|required|minlength:10',
    authorId: 'string|required',
    status: 'string|default:draft',  // draft, published, archived
    tags: 'string',                   // comma-separated or JSON
    published: 'boolean|default:false',
    createdAt: 'string|required'
  },
  timestamps: true
});

// Comments resource (nested content)
const comments = await db.createResource({
  name: 'comments',
  attributes: {
    postId: 'string|required',
    authorId: 'string|required',
    body: 'string|required|minlength:1',
    approved: 'boolean|default:false',
    createdAt: 'string|required'
  },
  timestamps: true
});

// OIDC sessions resource (persistent sessions)
const sessions = await db.createResource({
  name: 'oidc_sessions',
  attributes: {
    expiresAt: 'string|required',
    userId: 'string',
    email: 'string'
  }
});

// Analytics resource (tracking)
const analytics = await db.createResource({
  name: 'analytics',
  attributes: {
    event: 'string|required',
    userId: 'string',
    data: 'string',
    userAgent: 'string',
    ip: 'ip4',
    timestamp: 'string|required'
  }
});

console.log('✅ Created 5 resources\n');

// ============================================================================
// STEP 1: Create API Plugin with COMPLETE Configuration
// ============================================================================

const apiPlugin = new APIPlugin({
  // ═══════════════════════════════════════════════════════════════════════
  // 1️⃣ SERVER CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════

  port: 3000,
  host: '0.0.0.0',
  basePath: '/api/v1',                    // All routes under /api/v1
  versionPrefix: 'v1',                    // For route versioning

  // ═══════════════════════════════════════════════════════════════════════
  // 2️⃣ AUTHENTICATION & AUTHORIZATION
  // ═══════════════════════════════════════════════════════════════════════

  auth: {
    // Default resource for user storage (auto-created if missing)
    resource: 'users',

    // Multiple auth drivers (will try them in order)
    drivers: [
      // ────────────────────────────────────────────────────────────────
      // DRIVER 1: OIDC (Google, Azure, Keycloak, Auth0, etc.)
      // ────────────────────────────────────────────────────────────────
      {
        driver: 'oidc',
        config: {
          // Provider configuration
          issuer: 'https://accounts.google.com',
          clientId: process.env.GOOGLE_CLIENT_ID || 'your-client-id',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-secret',
          redirectUri: 'http://localhost:3000/auth/callback',
          scopes: ['openid', 'profile', 'email', 'offline_access'],

          // Cookie & Session
          cookieName: 'oidc_session',
          cookieSecret: process.env.COOKIE_SECRET || 'your-32-byte-secret-key-change-this!!!',
          cookieSecure: false,               // true in production (HTTPS)
          cookieSameSite: 'Lax',
          cookieDomain: undefined,           // Set for cross-subdomain

          // Session duration
          cookieMaxAge: 86400000,            // 24 hours (cookie lifetime)
          rollingDuration: 1800000,          // 30 min idle timeout
          absoluteDuration: 604800000,       // 7 day max lifetime

          // 🎯 PERSISTENT SESSION STORE (S3DB)
          sessionStore: {
            driver: 's3db',
            config: {
              resourceName: 'oidc_sessions'
            }
          },
          // Alternative: Redis session store
          // sessionStore: {
          //   driver: 'redis',
          //   config: {
          //     url: process.env.REDIS_URL || 'redis://localhost:6379'
          //   }
          // },

          // User auto-creation & management
          autoCreateUser: true,
          defaultRole: 'user',
          onUserAuthenticated: async ({ user, created, claims, tokens, context }) => {
            if (created) {
              console.log(`✨ New user: ${user.email}`);
            }
          },

          // Token refresh (active users never see expiration)
          autoRefreshTokens: true,
          refreshThreshold: 300000,          // 5 min before expiry

          // External URL (for reverse proxy)
          externalUrl: process.env.EXTERNAL_URL,

          // Enhanced security
          idpLogout: true,                   // Logout from IdP too
          verbose: false
        }
      },

      // ────────────────────────────────────────────────────────────────
      // DRIVER 2: JWT (Bearer token)
      // ────────────────────────────────────────────────────────────────
      {
        driver: 'jwt',
        config: {
          secret: process.env.JWT_SECRET || 'your-jwt-secret',
          algorithms: ['HS256'],
          expiresIn: '24h',
          issuer: 'my-app',
          audience: 'my-app-users'
        }
      },

      // ────────────────────────────────────────────────────────────────
      // DRIVER 3: Basic Auth (username:password)
      // ────────────────────────────────────────────────────────────────
      {
        driver: 'basic',
        config: {
          secret: process.env.BASIC_SECRET || 'my-secret-key'
        }
      },

      // ────────────────────────────────────────────────────────────────
      // DRIVER 4: OAuth2 Server (issue tokens to other apps)
      // ────────────────────────────────────────────────────────────────
      {
        driver: 'oauth2-server',
        config: {
          accessTokenExpiresIn: 3600,        // 1 hour
          refreshTokenExpiresIn: 604800,     // 7 days
          authorizationCodeExpiresIn: 600,   // 10 minutes
          secret: process.env.OAUTH2_SECRET || 'oauth2-secret',
          allowedScopes: ['read', 'write', 'admin']
        }
      }
    ],

    // Path-based authentication rules (different routes, different auth)
    pathRules: [
      // Public routes (no auth required)
      { path: '/', methods: ['GET'], auth: false },
      { path: '/health', methods: ['GET'], auth: false },
      { path: '/docs', methods: ['GET'], auth: false },
      { path: '/api/v1/posts', methods: ['GET'], auth: false },  // Read-only public

      // Protected routes (require OIDC)
      { path: '/api/v1/posts', methods: ['POST', 'PUT', 'DELETE'], auth: true, drivers: ['oidc'] },
      { path: '/api/v1/comments', methods: ['*'], auth: true, drivers: ['oidc'] },

      // Admin-only routes (custom guard)
      { path: '/api/v1/admin/**', methods: ['*'], auth: true, drivers: ['oidc'] },

      // API routes (accept multiple auth methods)
      { path: '/api/**', methods: ['*'], auth: true, drivers: ['oidc', 'jwt', 'basic'] }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 3️⃣ RESOURCE CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════

  resources: {
    // Public resource (no auth, no guards)
    posts: {
      methods: ['GET', 'HEAD', 'OPTIONS']   // Read-only public access
    },

    // Protected resource with full CRUD
    comments: {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
      // Guard: Only your own comments + admins can delete
      guard: async (action, record, user, context) => {
        if (!user) return action === 'get';  // Non-auth can only read

        // Allow your own comments
        if (record.authorId === user.id) return true;

        // Allow admins to do anything
        if (user.role === 'admin') return true;

        // Otherwise deny
        return false;
      }
    },

    // User resource (admin-only access)
    users: {
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      guard: async (action, record, user) => {
        // Only admins can access users resource
        return user?.role === 'admin';
      }
    },

    // Analytics (read-only, admin-only)
    analytics: {
      methods: ['GET', 'HEAD'],
      guard: async (action, record, user) => {
        return user?.role === 'admin';
      }
    },

    // Sessions (internal resource, not exposed)
    oidc_sessions: {
      methods: []  // Don't expose via API
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 4️⃣ CUSTOM ROUTES
  // ═══════════════════════════════════════════════════════════════════════

  routes: {
    'GET /custom/hello': async (c) => {
      return c.json({ message: 'Hello from custom route!' });
    },

    'POST /custom/search': async (c) => {
      const query = await c.req.json();
      // Custom search logic
      return c.json({ results: [] });
    },

    'GET /stats': async (c) => {
      // Custom analytics endpoint
      const user = c.get('user');
      if (user?.role !== 'admin') {
        return c.json({ error: 'Forbidden' }, 403);
      }
      return c.json({ posts: 100, comments: 500, users: 50 });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 5️⃣ MIDDLEWARE
  // ═══════════════════════════════════════════════════════════════════════

  middlewares: [
    // Custom middleware (runs before route handling)
    {
      name: 'request-logger',
      handler: async (c, next) => {
        const start = Date.now();
        await next();
        const duration = Date.now() - start;
        console.log(`${c.req.method} ${c.req.path} ${duration}ms`);
      }
    },

    {
      name: 'request-id',
      handler: async (c, next) => {
        c.set('requestId', crypto.randomUUID());
        await next();
      }
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // 6️⃣ CORS & SECURITY
  // ═══════════════════════════════════════════════════════════════════════

  cors: {
    enabled: true,
    origin: ['http://localhost:3001', 'http://localhost:3002'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
  },

  security: {
    enabled: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 7️⃣ DOCUMENTATION
  // ═══════════════════════════════════════════════════════════════════════

  docs: {
    enabled: true,
    ui: 'redoc',                           // or 'swagger'
    title: 'My API - Complete',
    description: 'A complete API example',
    version: '1.0.0',
    contact: {
      name: 'Support',
      email: 'support@example.com'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 8️⃣ STATIC FILES & TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════

  static: [
    {
      path: '/public',
      dir: './public'
    },
    {
      path: '/images',
      dir: './images'
    }
  ],

  templates: {
    enabled: true,
    engine: 'jsx',                         // jsx, hono, etc.
    dir: './templates'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 9️⃣ RATE LIMITING & FAILBAN
  // ═══════════════════════════════════════════════════════════════════════

  rateLimit: {
    enabled: true,
    windowMs: 60000,                       // 1 minute window
    maxRequests: 100,                      // 100 requests per window
    keyGenerator: (c) => {
      // Rate limit by user ID if authenticated, IP otherwise
      return c.get('user')?.id || c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
    },
    // Custom headers
    headers: {
      'RateLimit-Limit': 'X-RateLimit-Limit',
      'RateLimit-Remaining': 'X-RateLimit-Remaining',
      'RateLimit-Reset': 'X-RateLimit-Reset'
    }
  },

  failban: {
    enabled: true,
    attempts: 5,                           // Ban after 5 failed attempts
    windowMs: 900000,                      // 15 minute window
    banDurationMs: 3600000,                // 1 hour ban
    skipSuccessfulRequests: true,
    skipFailedRequests: false,
    keyGenerator: (c) => c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🔟 HEALTH CHECKS & METRICS
  // ═══════════════════════════════════════════════════════════════════════

  health: {
    enabled: true,
    path: '/health'
  },

  metrics: {
    enabled: true,
    path: '/metrics',
    includeDefaultMetrics: true
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 1️⃣1️⃣ SESSION TRACKING & REQUEST ID
  // ═══════════════════════════════════════════════════════════════════════

  sessionTracking: {
    enabled: true,
    storage: 'memory'                      // or 's3', 'redis'
  },

  requestId: {
    enabled: true,
    header: 'x-request-id'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 1️⃣2️⃣ GENERAL OPTIONS
  // ═══════════════════════════════════════════════════════════════════════

  maxBodySize: '10mb',
  verbose: true,
  docsUI: 'redoc'
});

// ============================================================================
// STEP 2: Add Optional Plugins for Enhanced Features
// ============================================================================

// Cache plugin (improve performance)
const cachePlugin = new CachePlugin({
  driver: 'memory',
  ttl: 300000,                            // 5 minutes
  config: {
    maxMemoryPercent: 0.1,
    enableCompression: true
  }
});

// TTL plugin (auto-cleanup old records)
const ttlPlugin = new TTLPlugin({
  resources: {
    // Auto-delete sessions after expiration
    oidc_sessions: {
      field: 'expiresAt',
      granularity: 'hour'
    },
    // Auto-delete draft posts after 30 days
    posts: {
      field: 'createdAt',
      ttl: 2592000000,                     // 30 days in ms
      filter: (record) => record.status === 'draft'
    }
  }
});

// Metrics plugin (Prometheus-compatible)
const metricsPlugin = new MetricsPlugin({
  enabled: true,
  path: '/metrics',
  includeDefaultMetrics: true,
  buckets: [0.1, 0.5, 1, 2, 5]
});

// ============================================================================
// STEP 3: Initialize Everything
// ============================================================================

console.log('🔧 Initializing API Plugin with full configuration...\n');

try {
  await db.usePlugin(apiPlugin);
  await db.usePlugin(cachePlugin);
  await db.usePlugin(ttlPlugin);
  await db.usePlugin(metricsPlugin);

  console.log('✅ All plugins initialized\n');
} catch (err) {
  console.error('❌ Initialization failed:', err.message);
  process.exit(1);
}

// ============================================================================
// STEP 4: Print Configuration Summary
// ============================================================================

console.log('═'.repeat(70));
console.log('📋 API Plugin - Complete Configuration Summary');
console.log('═'.repeat(70));

console.log('\n🔐 Authentication:');
console.log('  ✅ OIDC (Google)');
console.log('  ✅ JWT (Bearer)');
console.log('  ✅ Basic Auth');
console.log('  ✅ OAuth2 Server');

console.log('\n💾 Resources:');
console.log('  ✅ posts (public read, auth write)');
console.log('  ✅ comments (full CRUD for auth users)');
console.log('  ✅ users (admin-only)');
console.log('  ✅ analytics (admin-only)');
console.log('  ✅ oidc_sessions (internal)');

console.log('\n📍 Routes:');
console.log('  GET  /api/v1/posts');
console.log('  POST /api/v1/posts (requires auth)');
console.log('  GET  /api/v1/comments/:id');
console.log('  POST /api/v1/comments (requires auth)');
console.log('  GET  /custom/hello');
console.log('  GET  /stats (admin only)');

console.log('\n📊 Features:');
console.log('  ✅ Session store (S3DB)');
console.log('  ✅ Token refresh (auto)');
console.log('  ✅ Rate limiting (100 req/min)');
console.log('  ✅ Failban (5 attempts)');
console.log('  ✅ CORS enabled');
console.log('  ✅ Security headers');
console.log('  ✅ Health check: /health');
console.log('  ✅ Metrics: /metrics');
console.log('  ✅ Docs: /docs');

console.log('\n🚀 Server running at:');
console.log('  API:  http://localhost:3000/api/v1');
console.log('  Docs: http://localhost:3000/docs');
console.log('  Metrics: http://localhost:3000/metrics');
console.log('  Health: http://localhost:3000/health');

console.log('\n💡 Try:');
console.log('  # Get public posts');
console.log('  curl http://localhost:3000/api/v1/posts');
console.log('');
console.log('  # Login');
console.log('  curl http://localhost:3000/auth/login');
console.log('');
console.log('  # Check docs');
console.log('  curl http://localhost:3000/docs');
console.log('');

console.log('═'.repeat(70));

// ============================================================================
// STEP 5: Graceful Shutdown
// ============================================================================

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  await db.disconnect();
  console.log('✅ Shutdown complete');
  process.exit(0);
});
