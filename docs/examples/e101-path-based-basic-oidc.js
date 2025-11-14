/**
 * Example 101: Path-based Basic + OIDC
 *
 * Demonstrates how to run the API Plugin with:
 * - `/v1/**` protected by Basic Auth (email:apiToken)
 * - `/app/**` protected by OIDC (Authorization Code flow)
 * - Public routes for docs/metrics/health
 * - Rate limit rules + logging filters + Prometheus metrics
 *
 * This is a generic blueprint for migrating Express stacks that had
 * Basic tokens + dashboard login into the ApiPlugin/Hono runtime.
 *
 * Usage:
 *   pnpm exec node docs/examples/e101-path-based-basic-oidc.js
 *
 * (OIDC config uses placeholders. Plug real credentials to test end-to-end.)
 */

import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { idGenerator } from '../../src/concerns/id.js';

function generateApiToken() {
  return `token_${idGenerator({ size: 12 })}_${Date.now()}`;
}

async function createDatabase() {
  const db = new Database({
    connectionString: 'memory://path-based-basic-oidc',
    passphrase: process.env.SECRET_PASSPHRASE || 'dev-secret-passphrase',
    verbose: false
  });
  await db.connect();

  await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      email: 'email|required|unique',
      name: 'string|required',
      role: 'string|default:user',
      apToken: 'secret|required',
      metadata: 'json|optional'
    },
    timestamps: true
  });

  await db.createResource({
    name: 'links',
    attributes: {
      id: 'string|required',
      slug: 'string|required|unique',
      destination: 'string|required',
      ownerEmail: 'email|required'
    },
    timestamps: true
  });

  await db.resources.users.insert({
    id: 'admin@example.com',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    apToken: generateApiToken()
  });

  await db.resources.links.insert({
    id: 'link-001',
    slug: 'welcome',
    destination: 'https://example.com/welcome',
    ownerEmail: 'admin@example.com'
  });

  return db;
}

async function main() {
  const db = await createDatabase();

  const api = new ApiPlugin({
    port: process.env.PORT || 3100,
    versionPrefix: 'v1',
    basePath: '',
    verbose: true,

    auth: {
      resource: 'users',
      drivers: [
        {
          driver: 'basic',
          config: {
            realm: 'API Tokens',
            usernameField: 'email',
            passwordField: 'apToken'
          }
        },
        {
          driver: 'oidc',
          config: {
            issuer: process.env.OIDC_ISSUER || 'https://example-issuer',
            clientId: process.env.OIDC_CLIENT_ID || 'client-id',
            clientSecret: process.env.OIDC_CLIENT_SECRET || 'client-secret',
            redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:3100/auth/callback',
            cookieSecret: process.env.COOKIE_SECRET || 'change-me-cookie-secret-32chars',
            detectApiTokenField: true,
            generateApiToken: ({ user }) => `api_${user.id}_${idGenerator({ size: 10 })}`
          }
        }
      ],
      pathRules: [
        { path: '/v1/**', methods: ['basic'], required: true },
        { path: '/app/**', methods: ['oidc'], required: true },
        { path: '/docs', methods: [], required: false },
        { path: '/openapi.json', methods: [], required: false },
        { path: '/metrics', methods: [], required: false },
        { path: '/health', methods: [], required: false },
        { path: '/health/**', methods: [], required: false },
        { path: '/**', methods: [], required: false }
      ]
    },

    logging: {
      enabled: true,
      format: ':method :url => :status (:elapsed ms)',
      excludePaths: ['/health/**', '/metrics'],
      filter: ({ duration }) => duration > 1
    },

    rateLimit: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 500,
      rules: [
        { path: '/v1/**', maxRequests: 200, key: 'apiKey', keyHeader: 'x-api-key' },
        { path: '/app/**', maxRequests: 60, key: 'user' },
        { path: '/health/**', maxRequests: 2000, key: 'ip' }
      ]
    },

    metrics: { enabled: true, format: 'prometheus' },

    resources: {
      users: false,
      links: { methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }
    },

    routes: {
      'GET /': async (c) => c.json({ success: true, message: 'API Plugin path-based auth demo' }),
      'GET /app': async (c) => c.html(`
        <html>
          <body>
            <h1>Protected dashboard</h1>
            <p>User: ${c.get('user')?.email || 'anonymous'}</p>
            <p>Try <code>curl -u email:apiToken http://localhost:3100/v1/links</code></p>
          </body>
        </html>
      `)
    }
  });

  await db.usePlugin(api);
  console.log('🚀 API Plugin running at http://localhost:3100');
  console.log('   Public:        GET /, /docs, /openapi.json, /metrics, /health');
  console.log('   Basic Auth:    /v1/links');
  console.log('   OIDC Session:  /app/*');
}

main().catch((err) => {
  console.error('Example failed:', err);
  process.exit(1);
});
