# 🔐 Authentication Guide

> **Complete guide to all authentication methods: JWT • Basic Auth • API Keys • Header Secret • OAuth2/OIDC**

**Quick links:** [JWT](#jwt-authentication) • [Basic Auth](#basic-authentication) • [API Keys](#api-key-authentication) • [Header Secret](#header-secret-authentication) • [OIDC](#oidc--oauth2) • [Path-Based](#path-based-authentication)

---

## ⚡ Quick Start

### Choose Your Method

| Method | Use Case | Setup Time | Complexity |
|--------|----------|------------|------------|
| **[JWT](#jwt-authentication)** | Mobile apps, SPAs, stateless APIs | 2 min | Low |
| **[Basic Auth](#basic-authentication)** | CLI tools, scripts, internal APIs | 1 min | Very Low |
| **[API Keys](#api-key-authentication)** | Third-party integrations, webhooks | 2 min | Low |
| **[Header Secret](#header-secret-authentication)** | Admin apps, service-to-service traffic | 1 min | Very Low |
| **[OIDC](#oidc--oauth2)** | SSO, Azure AD, Google, Keycloak | 5 min | Medium |

---

## ⚠️ Performance: User Lookup Strategy (CRITICAL)

> **Every resource-backed auth request needs to find a user.** By default, this can become an **O(n) full scan** of your users resource. This section shows how to keep it O(1).

### The Problem

The resource-backed auth drivers (JWT, Basic, API Key, OAuth2, OIDC) may need to look up the authenticated user from your resource. Without an ID match or a usable partition, that lookup falls back to:

```
authResource.query({ email: 'user@example.com' })  // O(n) — scans ALL users
```

### The Solution: Three Strategies (fastest to slowest)

#### Strategy 1: `lookupById` — O(1) via `resource.get()` ⚡

**Use when: the user's ID IS the lookup field** (e.g., `user.id === user.email`).

This is the **recommended pattern for 80%+ of use cases**. When your users resource uses email as the ID, every auth lookup becomes a single S3 GET:

```javascript
// Your resource: users where id = email
const usersResource = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    password: 'password|required|min:8',
    role: 'string|default:user'
  }
});

// Insert with email as ID
await usersResource.insert({ id: 'daniel@tetis.io', email: 'daniel@tetis.io', password: 'SecurePass123!' });

// Auth config — just add lookupById: true
await db.usePlugin(new ApiPlugin({
  auth: {
    resource: 'users',
    drivers: {
      jwt: {
        secret: process.env.JWT_SECRET,
        lookupById: true  // ⚡ O(1) — uses resource.get(email) instead of query
      }
    }
  }
}));
```

**Result:** `resource.get('daniel@tetis.io')` — **1 S3 call** instead of scanning all users.

Supported by all resource-backed drivers:

```javascript
// JWT
drivers: { jwt: { secret: '...', lookupById: true } }

// Basic Auth
drivers: { basic: { lookupById: true } }

// API Key
drivers: { 'api-key': { lookupById: true } }

// OAuth2 Resource Server
drivers: { oauth2: { issuer: '...', lookupById: true } }  // For fallback field lookups such as email

// OIDC
drivers: { oidc: { issuer: '...', clientId: '...', lookupById: true } }  // For fallback lookupFields such as email
```

`Header Secret` is not part of this because it does not query a user resource.

`OAuth2` and `OIDC` use hybrid resolution flows. They already try direct ID-style lookups from token claims first. `lookupById` helps when those drivers need to resolve a user by another configured field such as `email`.

**Multi-driver:** each driver has its own `lookupById`. You can mix strategies:

```javascript
drivers: {
  jwt: { secret: '...', lookupById: true },         // id = email
  'api-key': { partitionName: 'byApiKey' },          // partition lookup
  oauth2: { issuer: '...', lookupById: true }         // fallback field lookup uses get() when field value is the resource ID
}
```

#### Strategy 2: Partitions — O(1) via `listPartition()` ⚡

**Use when: the lookup field is NOT the resource ID** (e.g., ID is UUID but you look up by email).

Add a partition on the lookup field. The auth system **auto-detects partitions** using the convention `by{FieldName}`:

```javascript
const usersResource = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    password: 'password|required|min:8',
    apiKey: 'string|required'
  },
  partitions: {
    byEmail: { fields: { email: true } },      // Auto-detected for userField: 'email'
    byApiKey: { fields: { apiKey: true } }      // Auto-detected for keyField: 'apiKey'
  }
});

// Auth config — no lookupById needed, partitions are detected automatically
await db.usePlugin(new ApiPlugin({
  auth: {
    resource: 'users',
    drivers: {
      jwt: { secret: process.env.JWT_SECRET }   // Uses byEmail partition automatically
    }
  }
}));
```

**Partition naming convention:** field `email` → partition `byEmail`, field `apiKey` → partition `byApiKey`.

You can override the auto-detected name:

```javascript
drivers: {
  'api-key': {
    partitionName: 'myCustomApiKeyPartition'  // Override auto-detection
  }
}
```

#### Strategy 3: Query scan — O(n) ❌ (last resort)

If neither `lookupById` nor a partition is configured, the system falls back to `resource.query()`. This triggers a **loud warning on first use**:

```
WARN (AuthLookup): Auth lookup for field "email" is doing an O(n) full scan.
  Add a partition "byEmail" on field "email", or set lookupById: true if the
  field value is the resource ID.
```

**This warning is intentional.** Fix it by using Strategy 1 or 2.

### Decision Tree

```
Is the lookup field the resource ID? (e.g., user.id === user.email)
  ├─ YES → lookupById: true                    ⚡ O(1) get()
  └─ NO  → Does a partition exist for the field?
              ├─ YES → Automatic                ⚡ O(1) listPartition()
              └─ NO  → Add partition or change ID strategy
```

### Performance Comparison

| Strategy | S3 Calls per Auth | 10K Users | Cost |
|----------|-------------------|-----------|------|
| `lookupById: true` | **1** | 1 call | $0.000004 |
| Partition lookup | **1** | 1 call | $0.000004 |
| Query scan (no partition) | **10,000+** | 10,000 calls | $0.04 |

---

## JWT Authentication

**Best for:** Mobile apps, SPAs, stateless APIs

### Quick Start

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    resource: 'users',
    drivers: {
      jwt: {
        secret: process.env.JWT_SECRET,  // REQUIRED
        expiresIn: '7d',                 // Token lifetime
        lookupById: true,                // ⚡ O(1) lookup (when user.id = email)
        algorithm: 'HS256'               // HMAC SHA-256
      }
    },
    pathRules: [
      { path: '/api/**', methods: ['jwt'], required: true }
    ]
  }
}));
```

### Configuration

```javascript
jwt: {
  secret: process.env.JWT_SECRET,      // REQUIRED: Secret key (32+ chars)
  expiresIn: '7d',                     // Token expiration (default: '7d')
  algorithm: 'HS256',                  // Signing algorithm
  issuer: 'my-api',                    // Token issuer (optional)
  audience: 'my-app',                  // Token audience (optional)
  lookupById: true,                    // ⚡ O(1) via get() when user.id = userField value

  // Performance optimization
  cache: {
    enabled: true,                     // Cache validation (default: true)
    ttl: 60000,                        // Cache TTL: 60s
    max: 1000                          // Max cached tokens
  }
}
```

### Generate Tokens

```javascript
import { sign } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const token = await new SignJWT({
  sub: user.id,           // User ID
  email: user.email,
  role: user.role,
  scopes: ['read:orders', 'write:orders']
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('7d')
  .sign(secret);

// Return to client
return { token };
```

### Use Tokens

```bash
# Authorization header (preferred)
curl -H "Authorization: Bearer eyJhbGc..." http://localhost:3000/api/orders

# Query parameter (for download links)
curl http://localhost:3000/api/orders?token=eyJhbGc...
```

### Custom Username/Password Fields for JWT (Driver-Level Configuration)

JWT also supports custom field configuration at the driver level:

```javascript
// ✅ PATTERN: Driver-level configuration for JWT
await db.usePlugin(new ApiPlugin({
  auth: {
    drivers: [{
      driver: 'jwt',
      config: {
        jwtSecret: process.env.JWT_SECRET,
        usernameField: 'id',        // 🎯 Field to lookup user (default: 'userId')
        passwordField: 'apiToken'   // 🎯 Field for password comparison (default: 'apiToken')
      }
    }],
    resource: 'users'
  }
}));
```

### Access User in Routes

```javascript
routes: {
  'GET /profile': async (c, ctx) => {
    const user = ctx.user;  // Decoded JWT payload
    // { sub: 'user-123', email: 'user@example.com', role: 'admin' }

    return ctx.json({ user });
  }
}
```

### Security Best Practices

✅ **DO:**
- Use strong secrets (32+ characters, random)
- Set reasonable expiration (`expiresIn: '7d'`)
- Include minimal claims (sub, email, role, scopes)
- Use HTTPS in production
- Rotate secrets periodically

❌ **DON'T:**
- Store sensitive data in JWT (passwords, API keys)
- Use predictable secrets
- Set very long expiration (>30 days)
- Share secrets between environments

---

## Basic Authentication

**Best for:** CLI tools, scripts, internal APIs, testing

### Quick Start

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    resource: 'users',
    drivers: {
      basic: {
        realm: 'API Access',                    // Auth realm name
        usernameField: 'email',                 // Field to match username
        passwordField: 'apiToken'               // Field to match password
      }
    },
    pathRules: [
      { path: '/api/**', methods: ['basic'], required: true }
    ]
  }
}));
```

### Configuration

```javascript
basic: {
  realm: 'API Access',                 // Realm name (shown in browser prompt)
  usernameField: 'email',              // User field to match (default: 'email')
  passwordField: 'apiToken',           // Password field (default: 'password')
  lookupById: true,                    // ⚡ O(1) via get() when user.id = usernameField value
}
```

### Use Basic Auth

```bash
# Standard format
curl -u email@example.com:api-token-here http://localhost:3000/api/orders

# Base64 encoded header (equivalent)
curl -H "Authorization: Basic ZW1haWxAZXhhbXBsZS5jb206YXBpLXRva2VuLWhlcmU=" \
     http://localhost:3000/api/orders
```

### Generate API Tokens

```javascript
import { idGenerator } from 's3db.js';

// Create user with API token
await db.resources.users.insert({
  id: user.email,
  email: user.email,
  name: user.name,
  apiToken: `token_${idGenerator({ size: 32 })}_${Date.now()}`
});

// Return token to user
return { apiToken: user.apiToken };
```

### Custom Username/Password Fields (Driver-Level Configuration)

Field configuration is at the driver level for better clarity:

```javascript
// ✅ PATTERN: Driver-level configuration
await db.usePlugin(new ApiPlugin({
  auth: {
    drivers: [{
      driver: 'basic',
      config: {
        realm: 'API Access',
        usernameField: 'id',        // 🎯 Custom username field
        passwordField: 'apiToken'   // 🎯 Custom password field
      }
    }],
    resource: 'users'
  }
}));
```

### Security Notes

⚠️ **Important:**
- Always use HTTPS in production (credentials sent in every request)
- API tokens are preferred over passwords
- Use long, random tokens (32+ characters)
- Store tokens securely (encrypted field type: `apiToken: 'secret'`)

---

## API Key Authentication

**Best for:** Third-party integrations, webhooks, programmatic access

### Quick Start

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    resource: 'users',
    drivers: {
      apikey: {
        headerName: 'X-API-Key',           // Header to check
        fieldName: 'apiToken',             // User field with token
        prefix: 'Bearer'                   // Optional prefix
      }
    },
    pathRules: [
      { path: '/api/**', methods: ['apikey'], required: true }
    ]
  }
}));
```

### Configuration

```javascript
apikey: {
  headerName: 'X-API-Key',             // Header name (default: 'X-API-Key')
  keyField: 'apiKey',                   // User field with the key (default: 'apiKey')
  queryParam: 'apikey',                // Optional: allow ?apikey=xxx
  lookupById: true,                    // ⚡ O(1) via get() when user.id = API key value
  partitionName: 'byApiKey',           // Override auto-detected partition name (optional)
}
```

> **Tip:** If using API keys with UUID-based user IDs, add a partition `byApiKey` on your resource instead of `lookupById`. The auth system auto-detects it.

### Use API Keys

```bash
# Custom header
curl -H "X-API-Key: your-api-key-here" http://localhost:3000/api/orders

# With prefix
curl -H "X-API-Key: Bearer your-api-key-here" http://localhost:3000/api/orders

# Query parameter (if enabled)
curl http://localhost:3000/api/orders?apikey=your-api-key-here
```

### Generate API Keys

```javascript
import { idGenerator } from 's3db.js';
import crypto from 'crypto';

// Secure random token
function generateApiKey() {
  return `sk_${crypto.randomBytes(32).toString('hex')}`;
  // Result: sk_a1b2c3d4e5f6...
}

// Create API key for user
await db.resources.users.update(user.id, {
  apiToken: generateApiKey()
});
```

### Multiple API Keys per User

```javascript
// Create separate apikeys resource
await db.createResource({
  name: 'apikeys',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    key: 'secret|required',      // Encrypted storage
    name: 'string',              // Key description
    scopes: 'array|items:string',
    expiresAt: 'string',
    active: 'boolean'
  }
});

// Custom lookup
apikey: {
  findUser: async (token) => {
    const key = await db.resources.apikeys.query({
      key: token,
      active: true
    });
    if (!key) return null;

    // Check expiration
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return null;
    }

    // Return user
    return await db.resources.users.get(key.userId);
  }
}
```

---

## Registration

The API plugin can expose a `POST /auth/register` endpoint for user self-registration. Disabled by default.

### Configuration

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    resource: 'users',
    drivers: { jwt: { secret: process.env.JWT_SECRET } },
    registration: {
      enabled: true,                             // Enable registration endpoint
      allowedFields: ['name', 'company'],        // Extra fields users can submit
      defaultRole: 'user'                        // Role assigned to new users
    }
  }
}));
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable `POST /auth/register` |
| `allowedFields` | string[] | `[]` | Extra fields allowed beyond username/password |
| `defaultRole` | string | `'user'` | Role assigned to new users |

### Blocked Fields

These fields are always rejected in registration requests to prevent privilege escalation:

`role`, `active`, `apiKey`, `jwtSecret`, `scopes`, `createdAt`, `updatedAt`, `metadata`, `id`

### Example

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{ "email": "new@example.com", "password": "securepass123", "name": "Jane" }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": { "id": "new@example.com", "email": "new@example.com", "name": "Jane", "role": "user" },
    "token": "eyJhbGc..."
  }
}
```

When the JWT driver is active, a token is returned immediately so the user is logged in after registration. Password must be at least 8 characters. If the username already exists, a `409 CONFLICT` is returned.

---

## Header Secret Authentication

**Best for:** Admin apps, server-to-server calls, trusted internal traffic

### Quick Start

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    createResource: false,
    drivers: [{
      driver: 'header-secret',
      config: {
        headerName: 'x-admin-secret',
        secret: process.env.ADMIN_SECRET,
        role: 'admin',
        roles: ['admin'],
        scopes: ['admin:read'],
        serviceAccount: {
          clientId: 'admin-ui',
          name: 'Admin UI'
        }
      }
    }],
    pathRules: [
      { path: '/users/**', methods: ['header-secret'], required: true, roles: ['admin'] }
    ]
  }
}));
```

### Configuration

```javascript
{
  driver: 'header-secret',
  config: {
    headerName: 'x-admin-secret',     // Header to read
    secret: process.env.ADMIN_SECRET, // Single shared secret
    secrets: [],                      // Optional rotation window
    role: 'admin',                    // Default role
    roles: ['admin'],                 // Explicit role list
    scopes: ['admin:read'],           // Optional scopes
    subject: 'sa:admin-ui',           // Optional subject override
    serviceAccount: {
      clientId: 'admin-ui',
      name: 'Admin UI'
    }
  }
}
```

### Use It

```bash
curl \
  -H "x-admin-secret: $ADMIN_SECRET" \
  http://localhost:3000/users
```

The driver injects a service identity into the request context. In custom routes and guards, prefer `ctx.auth`:

```javascript
'GET /me': async (c, ctx) => {
  ctx.auth.requireRole('admin');

  return ctx.response.success({
    actor: ctx.auth.user,
    service: ctx.auth.serviceAccount
  });
}
```

---

## OIDC / OAuth2

**Best for:** SSO, Azure AD, Google, Keycloak, Auth0

### Quick Start (30 seconds)

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    resource: 'users',
    drivers: {
      oidc: {
        issuer: 'https://accounts.google.com',
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: 'http://localhost:3000/auth/callback',
        cookieSecret: process.env.COOKIE_SECRET,  // 32+ characters

        // ✨ Auto token refresh, continue URL, provider quirks
      }
    },
    pathRules: [
      { path: '/admin/**', methods: ['oidc'], required: true }
    ]
  }
}));
```

### Supported Providers

| Category | Providers |
|----------|-----------|
| **Enterprise** | Azure AD, Google Workspace, Okta |
| **Open Source** | Keycloak, Authentik, Authelia |
| **SaaS** | Auth0, AWS Cognito, FusionAuth |

### Provider Examples

**Google:**
```javascript
oidc: {
  issuer: 'https://accounts.google.com',
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: 'http://localhost:3000/auth/callback',
  cookieSecret: process.env.COOKIE_SECRET,
  lookupById: true                     // ⚡ O(1) for fallback lookupFields when that value is the resource ID
}
```

**Azure AD:**
```javascript
oidc: {
  provider: 'azure',  // Auto-configures issuer + scopes
  tenantId: process.env.AZURE_TENANT_ID,
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/auth/callback',
  cookieSecret: process.env.COOKIE_SECRET
}
```

**Keycloak:**
```javascript
oidc: {
  issuer: 'https://keycloak.example.com/realms/myrealm',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  redirectUri: 'http://localhost:3000/auth/callback',
  cookieSecret: process.env.COOKIE_SECRET
}
```

### OIDC Enhancements

✨ **Production-grade features enabled by default:**

- **🔄 Implicit Token Refresh** - Active users never see session expiration
- **🔗 Continue URL** - Preserves destination after login
- **🌐 Provider Quirks** - Google, Azure, Auth0 auto-configured
- **🍪 Dual-Cookie Deletion** - Cross-subdomain logout works
- **🔒 Cache-Control Headers** - Prevents CDN caching
- **⚡ Discovery Cache** - Thread-safe, per-request cache

**[→ Complete OIDC Guide](/plugins/api/guides/oidc.md)** - Deep dive with all features, configuration, troubleshooting

### OIDC vs OAuth2 Resource Server

**OIDC (Identity Provider Integration)** - Use when:
- ✅ You want to integrate with Azure AD, Google, Keycloak
- ✅ You handle login/logout flows
- ✅ You manage user sessions

**OAuth2 Resource Server** - Use when:
- ✅ Another service handles authentication
- ✅ You only validate access tokens
- ✅ You're building a microservice

```javascript
// Resource Server (validate tokens only)
jwt: {
  jwksUri: 'https://auth-server.com/.well-known/jwks.json',  // Public keys
  issuer: 'https://auth-server.com',
  audience: 'my-api'
}
```

### OAuth2 Resource Server Driver

Use the `oauth2` driver when your API validates tokens issued by an external Authorization Server (SSO). It verifies JWT signatures via JWKS and optionally falls back to token introspection for opaque tokens.

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    drivers: {
      oauth2: {
        issuer: 'https://auth.example.com',       // Required: token issuer
        audience: 'my-api',                        // Expected audience claim
        algorithms: ['RS256', 'ES256'],            // Allowed algorithms (default)
        cacheTTL: 3_600_000,                       // JWKS cache: 1 hour (default)
        clockTolerance: 60,                        // Clock skew tolerance in seconds
        fetchUserInfo: true,                       // Look up user in local DB (default)
        lookupById: true,                          // ⚡ O(1) for fallback field lookups such as email
        userMapping: {                             // Map token claims to user fields
          id: 'sub',
          email: 'email',
          username: 'preferred_username',
          role: 'role'
        },
        introspection: {                           // Opaque token fallback (optional)
          enabled: true,
          endpoint: 'https://auth.example.com/oauth/introspect',
          clientId: process.env.INTROSPECT_CLIENT_ID,
          clientSecret: process.env.INTROSPECT_CLIENT_SECRET
        }
      }
    },
    pathRules: [
      { path: '/api/**', methods: ['oauth2'], required: true }
    ]
  }
}));
```

OAuth2 first tries the mapped ID claim, typically `userMapping.id` or `sub`, with a direct `get()`. `lookupById` applies when the driver falls back to another field-based lookup such as `email`.

**Provider presets** simplify configuration for common providers:

```javascript
// Azure AD
oauth2: { provider: 'azure', tenantId: 'your-tenant-id', audience: 'api://my-api' }

// Auth0
oauth2: { provider: 'auth0', domain: 'your-tenant.auth0.com', audience: 'https://api.example.com' }

// Keycloak (with introspection)
oauth2: {
  provider: 'keycloak',
  baseUrl: 'https://keycloak.example.com',
  realm: 'myrealm',
  introspection: { enabled: true }
}

// AWS Cognito
oauth2: { provider: 'cognito', region: 'us-east-1', userPoolId: 'us-east-1_abc123' }
```

The driver auto-discovers JWKS endpoints via `.well-known/oauth-authorization-server` or `.well-known/openid-configuration`. If discovery fails, it falls back to `{issuer}/.well-known/jwks.json`.

---

## Multi-Driver Strategy

When multiple auth drivers are configured, the `strategy` option controls how they're evaluated:

```javascript
auth: {
  drivers: { jwt: { /* ... */ }, oauth2: { /* ... */ }, apikey: { /* ... */ } },
  strategy: 'any',       // Try all drivers, first success wins (default)
  priorities: {           // Optional: driver evaluation order
    jwt: 1,               // Highest priority
    oauth2: 2,
    apikey: 3              // Lowest priority
  }
}
```

| Strategy | Behavior |
|----------|----------|
| `'any'` | Try all drivers in order; first successful authentication wins |

When `priorities` is set, drivers are sorted by priority (lowest number = highest priority) before evaluation. This is useful when multiple drivers could match the same request — e.g., a `Bearer` token could be either JWT or OAuth2.

---

## Path-Based Authentication

**Mix multiple auth methods per route:**

```javascript
auth: {
  resource: 'users',
  drivers: {
    oidc: { /* Azure AD for admin dashboard */ },
    jwt: { /* JWT for mobile apps */ },
    basic: { /* Basic auth for CLI tools */ },
    apikey: { /* API keys for integrations */ }
  },

  pathRules: [
    // Admin dashboard: OIDC only
    { path: '/admin/**', methods: ['oidc'], required: true },

    // Mobile API: JWT or API keys
    { path: '/api/**', methods: ['jwt', 'apikey'], required: true },

    // CLI tools: Basic auth
    { path: '/cli/**', methods: ['basic'], required: true },

    // Public endpoints
    { path: '/health', methods: [], required: false },
    { path: '/docs', methods: [], required: false },

    // Catch-all: require any auth
    { path: '/**', methods: ['jwt', 'oidc', 'basic', 'apikey'], required: true }
  ]
}
```

### Route Matching

Routes are matched **in order** (first match wins):

```javascript
pathRules: [
  { path: '/public/**', required: false },       // Match first
  { path: '/admin/**', methods: ['oidc'] },      // Then this
  { path: '/**', methods: ['jwt', 'basic'] }     // Catch-all
]
```

### Public Routes

```javascript
pathRules: [
  // Specific public routes
  { path: '/health', required: false },
  { path: '/docs', required: false },
  { path: '/openapi.json', required: false },

  // Public directory
  { path: '/public/**', required: false },

  // Everything else requires auth
  { path: '/**', methods: ['jwt'], required: true }
]
```

---

## Common Patterns

### Redirect Service (Dual Auth)

```javascript
auth: {
  drivers: {
    oidc: { /* Admin dashboard */ },
    basic: { /* API access */ }
  },
  pathRules: [
    { path: '/admin/**', methods: ['oidc'], required: true },
    { path: '/api/**', methods: ['basic'], required: true },
    { path: '/r/:id', required: false }  // Public redirects
  ]
}
```

### E-commerce API (Triple Auth)

```javascript
auth: {
  drivers: {
    oidc: { /* Customer portal */ },
    jwt: { /* Mobile app */ },
    apikey: { /* Partner integrations */ }
  },
  pathRules: [
    { path: '/portal/**', methods: ['oidc'], required: true },
    { path: '/app/**', methods: ['jwt'], required: true },
    { path: '/partners/**', methods: ['apikey'], required: true }
  ]
}
```

### Internal Tool (Basic Auth)

```javascript
auth: {
  drivers: {
    basic: {
      usernameField: 'email',
      passwordField: 'apiToken'
    }
  },
  pathRules: [
    { path: '/**', methods: ['basic'], required: true }
  ]
}
```

---

## Accessing User in Routes

All auth methods populate `ctx.user`:

```javascript
routes: {
  'GET /profile': async (c, ctx) => {
    const user = ctx.user;

    // Common fields (all methods)
    // - id: user ID
    // - email: user email
    // - role: user role
    // - scopes: user scopes (array)
    // - authMethod: 'jwt' | 'basic' | 'apikey' | 'oidc'

    // OIDC-specific
    // - name, picture, metadata

    return ctx.json({ user });
  }
}
```

### Check Scopes

```javascript
routes: {
  'DELETE /orders/:id': async (c, ctx) => {
    if (!ctx.hasScope('delete:orders')) {
      return ctx.forbidden('Insufficient permissions');
    }

    await ctx.resources.orders.delete(ctx.param('id'));
    return ctx.success({ deleted: true });
  }
}
```

---

## Security Best Practices

### Secrets Management

```bash
# .env file (never commit!)
JWT_SECRET=random-secret-32-chars-minimum-here
COOKIE_SECRET=another-random-secret-32-chars-here
GOOGLE_CLIENT_SECRET=your-google-secret
```

```javascript
// Load from environment
jwt: {
  secret: process.env.JWT_SECRET
}
```

### HTTPS in Production

```javascript
// Enforce secure cookies in production
oidc: {
  cookieSecure: process.env.NODE_ENV === 'production'
}
```

### Rate Limiting & Login Throttle

```javascript
failban: {
  enabled: true,
  maxViolations: 3,      // Ban after 3 failed auth attempts
  banDuration: 3600000   // 1 hour ban
}
```

Login throttle is enabled by default for the JWT driver, blocking IPs after 5 failed login attempts for 5 minutes. See [Security Guide — Login Throttle](/plugins/api/guides/security.md#login-throttle) for full configuration.

### Security Headers

```javascript
security: {
  enabled: true  // Adds CSP, HSTS, X-Frame-Options, etc
}
```

---

## FAQ

**Q: Can I use multiple auth methods?**
A: Yes! Use `pathRules` to assign different methods per route.

**Q: Which method should I use?**
A:
- **JWT** - Mobile apps, SPAs
- **Basic/API Key** - CLI tools, integrations
- **OIDC** - SSO with Azure AD, Google, etc

**Q: How do I generate strong secrets?**
A:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Q: Can I customize auth logic?**
A: Yes! Use guards for fine-grained authorization:
```javascript
guard: {
  list: (ctx) => {
    // Custom logic here
    return ctx.user.role === 'admin';
  }
}
```

**Q: How do I handle password hashing?**
A: Use s3db.js `secret` field type:
```javascript
attributes: {
  password: 'secret|required'  // Auto-encrypted with AES-256-GCM
}
```

**Q: What about refresh tokens?**
A: OIDC driver handles refresh tokens automatically. For JWT, implement your own refresh token endpoint.

**Q: How do I test auth locally?**
A:
```bash
# JWT
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -d '{"email":"user@example.com","password":"pass"}' | jq -r .token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/orders

# Basic
curl -u email@example.com:token http://localhost:3000/api/orders
```

**Q: Can I use custom authentication logic?**
A: Yes! Create a custom auth driver:
```javascript
import { AuthDriver } from 's3db.js';

class CustomAuthDriver extends AuthDriver {
  async authenticate(context) {
    // Your logic here
    return { id: 'user-123', email: 'user@example.com' };
  }
}

// Register
auth: {
  drivers: {
    custom: new CustomAuthDriver()
  }
}
```

---

## See Also

- **[OIDC Complete Guide](/plugins/api/guides/oidc.md)** - Deep dive: all features, providers, troubleshooting
- [Guards](/plugins/api/guides/guards.md) - Row-level security
- [Authorization Patterns](/plugins/api/guides/authorization-patterns.md) - Advanced patterns
- [Security](/plugins/api/guides/security.md) - Failban, rate limiting, GeoIP
- [Configuration](/plugins/api/reference/configuration.md) - All options
- [FAQ](/plugins/api/faq.md) - More questions

---

**Questions?** [Open an issue](https://github.com/forattini-dev/s3db.js/issues)
