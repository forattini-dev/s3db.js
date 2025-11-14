/**
 * Example 88: OIDC v16.3 Features Showcase
 *
 * Demonstrates all NEW v16.3 OIDC enhancements:
 * ✅ Implicit token refresh (autoRefreshTokens)
 * ✅ Continue URL pattern (externalUrl support)
 * ✅ Provider quirks (Google, Azure, Auth0, GitHub auto-configured)
 * ✅ Dual-cookie deletion (cross-subdomain logout)
 * ✅ Cache-Control headers (automatic)
 * ✅ Discovery cache (thread-safe, per-request)
 *
 * This example shows a production-ready OIDC configuration with:
 * - Google OAuth2 (with automatic quirks)
 * - Reverse proxy support (externalUrl)
 * - Cross-subdomain authentication (cookieDomain)
 * - Automatic token refresh (sessions never expire for active users)
 * - Custom post-login logic (onUserAuthenticated hook)
 * - Metrics and session tracking
 *
 * Usage:
 *   1. Set environment variables (see below)
 *   2. pnpm exec node docs/examples/e88-oidc-v16.3-features.js
 *   3. Open http://localhost:3000/dashboard
 *   4. Login via Google
 *   5. Token refreshes automatically every ~55 minutes
 *
 * Environment Variables:
 *   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
 *   GOOGLE_CLIENT_SECRET=your-client-secret
 *   COOKIE_SECRET=your-32-character-secret-here
 *   EXTERNAL_URL=https://api.example.com (optional, for reverse proxy)
 *   COOKIE_DOMAIN=.example.com (optional, for cross-subdomain)
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';

async function main() {
  // 1. Create database with users resource
  const db = new Database({
    connectionString: 'memory://oidc-v163-demo',
    passphrase: process.env.SECRET_PASSPHRASE || 'dev-secret-passphrase',
    verbose: false
  });
  await db.connect();

  // Users resource with profile metadata
  await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',           // email
      email: 'email|required|unique',
      username: 'string|required',
      name: 'string|required',
      picture: 'string',
      role: 'string|required',
      scopes: 'array|items:string',
      apiToken: 'string',               // API token for non-OIDC APIs
      active: 'boolean',
      lastLoginAt: 'string',
      metadata: {
        oidc: {
          sub: 'string',
          provider: 'string',
          lastSync: 'string',
          claims: 'object'
        },
        profile: {
          bio: 'string',
          timezone: 'string',
          language: 'string'
        }
      }
    },
    timestamps: true
  });

  // Profiles resource (for demonstration of onUserAuthenticated hook)
  await db.createResource({
    name: 'profiles',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      bio: 'string',
      avatar: 'string',
      preferences: {
        theme: 'string',
        notifications: 'boolean',
        timezone: 'string'
      },
      stats: {
        loginCount: 'number',
        lastLoginAt: 'string',
        firstLoginAt: 'string'
      }
    },
    timestamps: true
  });

  // 2. Configure API Plugin with all v16.3 features
  const api = new ApiPlugin({
    port: process.env.PORT || 3000,
    verbose: true,

    // ========================================
    // 🎯 OIDC v16.3 CONFIGURATION
    // ========================================
    auth: {
      resource: 'users',
      drivers: [
        {
          driver: 'oidc',
          config: {
            // ✅ PROVIDER DETECTION (Provider quirks auto-applied!)
            // Google detected → access_type=offline, prompt=consent added automatically
            issuer: process.env.GOOGLE_ISSUER || 'https://accounts.google.com',
            clientId: process.env.GOOGLE_CLIENT_ID || 'YOUR-CLIENT-ID.apps.googleusercontent.com',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'YOUR-CLIENT-SECRET',
            redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:3000/auth/callback',

            // ✅ SESSION SECURITY
            cookieSecret: process.env.COOKIE_SECRET || 'change-me-to-random-32-chars!!!',
            cookieSecure: process.env.NODE_ENV === 'production',  // HTTPS only in production
            cookieSameSite: 'Lax',

            // ✅ NEW v16.3: REVERSE PROXY SUPPORT
            // Continue URL uses external URL, not internal service URL
            externalUrl: process.env.EXTERNAL_URL,  // e.g., 'https://api.example.com'

            // ✅ NEW v16.3: CROSS-SUBDOMAIN AUTHENTICATION
            // Share auth across *.example.com (dual-cookie deletion automatic!)
            cookieDomain: process.env.COOKIE_DOMAIN,  // e.g., '.example.com'

            // ✅ NEW v16.3: IMPLICIT TOKEN REFRESH (Default: enabled!)
            // Active users never see session expiration
            autoRefreshTokens: true,           // Enable automatic refresh (default: true)
            refreshThreshold: 300000,          // Refresh 5 min before expiry (default: 300000ms = 5 min)

            // Session duration
            rollingDuration: 86400000,         // 24 hours idle timeout (default: 24h)
            absoluteDuration: 604800000,       // 7 days max session (default: 7 days)

            // OIDC configuration
            scopes: ['openid', 'profile', 'email', 'offline_access'],
            autoCreateUser: true,
            defaultRole: 'user',

            // ✅ POST-LOGIN HOOK (Create profile on first login)
            onUserAuthenticated: async ({ user, created, claims, context }) => {
              if (created) {
                // New user - create default profile
                await db.resources.profiles.insert({
                  id: `profile-${user.id}`,
                  userId: user.id,
                  bio: 'Welcome to the platform!',
                  preferences: {
                    theme: 'light',
                    notifications: true,
                    timezone: 'UTC'
                  },
                  stats: {
                    loginCount: 1,
                    lastLoginAt: new Date().toISOString(),
                    firstLoginAt: new Date().toISOString()
                  }
                });

                console.log(`✨ Created profile for new user: ${user.email}`);
              } else {
                // Existing user - update login stats
                const profile = await db.resources.profiles.get(`profile-${user.id}`);
                if (profile) {
                  await db.resources.profiles.update(`profile-${user.id}`, {
                    stats: {
                      ...profile.stats,
                      loginCount: (profile.stats?.loginCount || 0) + 1,
                      lastLoginAt: new Date().toISOString()
                    }
                  });
                }
              }

              // Set API token cookie for non-OIDC APIs (e.g., mobile apps)
              if (user.apiToken) {
                context.cookie('api_token', user.apiToken, {
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  maxAge: 7 * 24 * 60 * 60  // 7 days
                });
              }

              console.log(`🔑 User authenticated: ${user.email} (new: ${created})`);
            }
          }
        }
      ],

      // Path-based authentication rules
      pathRules: [
        // Public routes
        { path: '/', methods: [], required: false },
        { path: '/docs', methods: [], required: false },
        { path: '/openapi.json', methods: [], required: false },
        { path: '/metrics', methods: [], required: false },
        { path: '/health', methods: [], required: false },
        { path: '/health/**', methods: [], required: false },

        // Protected routes (require OIDC)
        { path: '/dashboard', methods: ['oidc'], required: true },
        { path: '/profile', methods: ['oidc'], required: true },
        { path: '/api/**', methods: ['oidc'], required: true }
      ]
    },

    // ========================================
    // 📊 OBSERVABILITY
    // ========================================
    metrics: { enabled: true, format: 'prometheus' },
    events: { enabled: true },
    requestId: { enabled: true },

    // Session tracking (see token refresh activity)
    sessionTracking: {
      enabled: true,
      resource: 'sessions',
      passphrase: process.env.SESSION_SECRET || 'session-secret',
      updateOnRequest: true,
      enrichSession: async ({ context }) => ({
        userAgent: context.req.header('user-agent'),
        ip: context.req.header('x-forwarded-for') || context.req.header('x-real-ip')
      })
    },

    // ========================================
    // 🔒 SECURITY
    // ========================================
    security: { enabled: true },
    cors: {
      enabled: true,
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*'
    },

    // ========================================
    // 🚦 CUSTOM ROUTES
    // ========================================
    routes: {
      // Homepage
      'GET /': async (c) => {
        const user = c.get('user');
        return c.html(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>OIDC v16.3 Demo</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  max-width: 900px;
                  margin: 50px auto;
                  padding: 20px;
                  background: #f5f5f5;
                }
                .card {
                  background: white;
                  border-radius: 12px;
                  padding: 30px;
                  margin: 20px 0;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .feature {
                  background: #e8f5e9;
                  padding: 15px;
                  margin: 10px 0;
                  border-radius: 8px;
                  border-left: 4px solid #4caf50;
                }
                .feature-title {
                  font-weight: bold;
                  color: #2e7d32;
                  margin-bottom: 5px;
                }
                .btn {
                  display: inline-block;
                  padding: 12px 24px;
                  background: #1976d2;
                  color: white;
                  text-decoration: none;
                  border-radius: 6px;
                  font-weight: 500;
                  transition: background 0.2s;
                }
                .btn:hover {
                  background: #1565c0;
                }
                .status {
                  display: inline-block;
                  padding: 4px 12px;
                  background: ${user ? '#4caf50' : '#ff9800'};
                  color: white;
                  border-radius: 16px;
                  font-size: 0.9em;
                  font-weight: 500;
                }
                .emoji {
                  font-size: 1.3em;
                  margin-right: 8px;
                }
                ul {
                  line-height: 1.8;
                }
                code {
                  background: #f5f5f5;
                  padding: 2px 6px;
                  border-radius: 4px;
                  font-family: 'Monaco', 'Courier New', monospace;
                  font-size: 0.9em;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>🚀 OIDC v16.3 Features Demo</h1>
                <p>Status: <span class="status">${user ? `✓ Authenticated as ${user.email}` : '○ Not authenticated'}</span></p>
                <p>
                  ${user
                    ? `<a href="/dashboard" class="btn">Go to Dashboard</a>`
                    : `<a href="/dashboard" class="btn">Login with Google</a>`
                  }
                </p>
              </div>

              <div class="card">
                <h2>✨ NEW in v16.3</h2>

                <div class="feature">
                  <div class="feature-title"><span class="emoji">🔄</span>Implicit Token Refresh</div>
                  <p>Active users never see session expiration. Tokens refresh automatically 5 minutes before expiry.</p>
                  <p><code>autoRefreshTokens: true</code> (enabled by default)</p>
                </div>

                <div class="feature">
                  <div class="feature-title"><span class="emoji">🔗</span>Continue URL Pattern</div>
                  <p>Users return to original destination after login, preserving query strings and hash fragments.</p>
                  <p><code>externalUrl</code> support for reverse proxies</p>
                </div>

                <div class="feature">
                  <div class="feature-title"><span class="emoji">🌐</span>Provider Quirks</div>
                  <p>Google, Azure, Auth0, GitHub auto-configured with provider-specific parameters.</p>
                  <p>Google: <code>access_type=offline</code>, <code>prompt=consent</code> added automatically</p>
                </div>

                <div class="feature">
                  <div class="feature-title"><span class="emoji">🍪</span>Dual-Cookie Deletion</div>
                  <p>Cross-subdomain logout works correctly with <code>cookieDomain</code> configuration.</p>
                  <p>Deletes both host-only and domain-scoped cookies</p>
                </div>

                <div class="feature">
                  <div class="feature-title"><span class="emoji">🔒</span>Cache-Control Headers</div>
                  <p>Prevents CDN/proxy caching of authenticated responses automatically.</p>
                  <p><code>Cache-Control: private, no-cache, no-store, must-revalidate</code></p>
                </div>

                <div class="feature">
                  <div class="feature-title"><span class="emoji">⚡</span>Discovery Cache</div>
                  <p>Thread-safe OIDC discovery with per-request caching for optimal performance.</p>
                  <p>Discovery endpoint called once per request</p>
                </div>
              </div>

              <div class="card">
                <h2>🎯 Test the Features</h2>
                <ul>
                  <li><span class="emoji">🔑</span><a href="/dashboard">Dashboard</a> - Protected route (triggers login)</li>
                  <li><span class="emoji">👤</span><a href="/profile">Profile</a> - User profile with stats</li>
                  <li><span class="emoji">📊</span><a href="/metrics">Metrics</a> - Performance metrics (public)</li>
                  <li><span class="emoji">📖</span><a href="/docs">API Docs</a> - Swagger UI (public)</li>
                  ${user ? `<li><span class="emoji">🚪</span><a href="/auth/logout">Logout</a> - Test dual-cookie deletion</li>` : ''}
                </ul>
              </div>

              <div class="card">
                <h2>📚 Documentation</h2>
                <ul>
                  <li><a href="https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/api/oidc-quickstart.md">Quick Start Guide</a></li>
                  <li><a href="https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/api/oidc-enhancements.md">Full Features Documentation</a></li>
                  <li><a href="https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/api/configuration.md">Configuration Reference</a></li>
                </ul>
              </div>
            </body>
          </html>
        `);
      },

      // Dashboard (protected)
      'GET /dashboard': async (c, ctx) => {
        const user = ctx.user;
        const profile = await db.resources.profiles.get(`profile-${user.id}`).catch(() => null);

        return c.html(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Dashboard - ${user.name}</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  max-width: 900px;
                  margin: 50px auto;
                  padding: 20px;
                  background: #f5f5f5;
                }
                .card {
                  background: white;
                  border-radius: 12px;
                  padding: 30px;
                  margin: 20px 0;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .user-header {
                  display: flex;
                  align-items: center;
                  gap: 20px;
                  margin-bottom: 20px;
                }
                .avatar {
                  width: 80px;
                  height: 80px;
                  border-radius: 50%;
                  border: 3px solid #1976d2;
                }
                .info-grid {
                  display: grid;
                  grid-template-columns: repeat(2, 1fr);
                  gap: 15px;
                }
                .info-item {
                  background: #f5f5f5;
                  padding: 15px;
                  border-radius: 8px;
                }
                .info-label {
                  font-weight: bold;
                  color: #666;
                  font-size: 0.85em;
                  text-transform: uppercase;
                  margin-bottom: 5px;
                }
                .info-value {
                  font-size: 1.1em;
                  color: #333;
                }
                .badge {
                  display: inline-block;
                  padding: 4px 12px;
                  background: #4caf50;
                  color: white;
                  border-radius: 16px;
                  font-size: 0.85em;
                  font-weight: 500;
                  margin: 4px;
                }
                .nav {
                  display: flex;
                  gap: 15px;
                  margin-top: 20px;
                }
                .nav a {
                  text-decoration: none;
                  color: #1976d2;
                  font-weight: 500;
                }
                .nav a:hover {
                  text-decoration: underline;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="user-header">
                  ${user.picture ? `<img src="${user.picture}" class="avatar" alt="Avatar" />` : ''}
                  <div>
                    <h1>Welcome, ${user.name}!</h1>
                    <p>Your session is protected with OIDC v16.3 features</p>
                  </div>
                </div>

                <div class="info-grid">
                  <div class="info-item">
                    <div class="info-label">Email</div>
                    <div class="info-value">${user.email}</div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Role</div>
                    <div class="info-value">${user.role}</div>
                  </div>
                  ${profile ? `
                    <div class="info-item">
                      <div class="info-label">Login Count</div>
                      <div class="info-value">${profile.stats?.loginCount || 1}</div>
                    </div>
                    <div class="info-item">
                      <div class="info-label">Last Login</div>
                      <div class="info-value">${new Date(profile.stats?.lastLoginAt).toLocaleString()}</div>
                    </div>
                  ` : ''}
                </div>

                ${user.scopes && user.scopes.length > 0 ? `
                  <div style="margin-top: 20px;">
                    <div class="info-label">Scopes</div>
                    ${user.scopes.map(scope => `<span class="badge">${scope}</span>`).join('')}
                  </div>
                ` : ''}

                <div class="nav">
                  <a href="/">← Home</a>
                  <a href="/profile">View Full Profile</a>
                  <a href="/metrics">Metrics</a>
                  <a href="/auth/logout">Logout</a>
                </div>
              </div>

              <div class="card">
                <h2>✨ Active Features</h2>
                <ul>
                  <li>🔄 <strong>Token Auto-Refresh:</strong> Your session refreshes automatically every ~55 minutes</li>
                  <li>🔗 <strong>Continue URL:</strong> You were redirected back to this page after login</li>
                  <li>🌐 <strong>Provider Quirks:</strong> Google OAuth2 quirks applied automatically</li>
                  <li>🔒 <strong>Cache-Control:</strong> This page has security headers to prevent caching</li>
                </ul>
              </div>
            </body>
          </html>
        `);
      },

      // Profile API (protected)
      'GET /profile': async (c, ctx) => {
        const user = ctx.user;
        const profile = await db.resources.profiles.get(`profile-${user.id}`).catch(() => null);

        return c.json({
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            name: user.name,
            picture: user.picture,
            role: user.role,
            scopes: user.scopes,
            authMethod: user.authMethod
          },
          profile: profile || null,
          session: {
            expires_at: user.session?.expires_at,
            has_refresh_token: !!user.session?.refresh_token,
            auto_refresh_enabled: true
          }
        });
      }
    }
  });

  await db.usePlugin(api);

  // ========================================
  // 📊 EVENT LOGGING
  // ========================================
  api.events.on('user:login', (data) => {
    console.log(`🔑 User logged in: ${data.user?.email || 'unknown'}`);
  });

  api.events.on('auth:success', (data) => {
    console.log(`✅ Auth success: ${data.method} - ${data.user?.email || 'unknown'}`);
  });

  api.events.on('auth:failure', (data) => {
    console.warn(`❌ Auth failure: ${data.method} - ${data.reason || 'unknown'}`);
  });

  // ========================================
  // 🚀 SERVER READY
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('🚀 OIDC v16.3 Features Demo Server');
  console.log('='.repeat(80));
  console.log('\n📖 Open in browser:');
  console.log('   👉 http://localhost:3000\n');
  console.log('✨ New v16.3 Features:');
  console.log('   🔄 Implicit token refresh (autoRefreshTokens: true)');
  console.log('   🔗 Continue URL pattern (externalUrl support)');
  console.log('   🌐 Provider quirks (Google auto-configured)');
  console.log('   🍪 Dual-cookie deletion (cookieDomain support)');
  console.log('   🔒 Cache-Control headers (automatic)');
  console.log('   ⚡ Discovery cache (thread-safe)\n');
  console.log('🔒 Protected Routes:');
  console.log('   👉 http://localhost:3000/dashboard');
  console.log('   👉 http://localhost:3000/profile\n');
  console.log('📊 Public Routes:');
  console.log('   👉 http://localhost:3000/metrics');
  console.log('   👉 http://localhost:3000/docs\n');
  console.log('⚙️  Environment Variables:');
  console.log('   GOOGLE_CLIENT_ID=' + (process.env.GOOGLE_CLIENT_ID ? '✓' : '✗ (using placeholder)'));
  console.log('   GOOGLE_CLIENT_SECRET=' + (process.env.GOOGLE_CLIENT_SECRET ? '✓' : '✗ (using placeholder)'));
  console.log('   COOKIE_SECRET=' + (process.env.COOKIE_SECRET ? '✓' : '✗ (using placeholder)'));
  console.log('   EXTERNAL_URL=' + (process.env.EXTERNAL_URL || '✗ (not set)'));
  console.log('   COOKIE_DOMAIN=' + (process.env.COOKIE_DOMAIN || '✗ (not set)'));
  console.log('\n' + '='.repeat(80) + '\n');
}

main().catch((err) => {
  console.error('❌ Example failed:', err);
  process.exit(1);
});
