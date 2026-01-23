# 🔐 Authentication Guide

> **Complete guide to all authentication methods: JWT • Basic Auth • API Keys • OAuth2/OIDC**

**Quick links:** [JWT](#jwt-authentication) • [Basic Auth](#basic-authentication) • [API Keys](#api-key-authentication) • [OIDC](#oidc--oauth2) • [Path-Based](#path-based-authentication)

---

## ⚡ Quick Start

### Choose Your Method

| Method | Use Case | Setup Time | Complexity |
|--------|----------|------------|------------|
| **[JWT](#jwt-authentication)** | Mobile apps, SPAs, stateless APIs | 2 min | Low |
| **[Basic Auth](#basic-authentication)** | CLI tools, scripts, internal APIs | 1 min | Very Low |
| **[API Keys](#api-key-authentication)** | Third-party integrations, webhooks | 2 min | Low |
| **[OIDC](#oidc--oauth2)** | SSO, Azure AD, Google, Keycloak | 5 min | Medium |

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
  usernameField: 'email',              // User field to match (default: 'username')
  passwordField: 'apiToken',           // Password field (default: 'password')
  hashPassword: false,                 // Password hashed? (default: false)

  // Optional: Custom user lookup
  findUser: async (username) => {
    return await db.resources.users.query({ email: username });
  }
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
  fieldName: 'apiToken',               // User field (default: 'apiToken')
  prefix: 'Bearer',                    // Optional: 'Bearer', 'Token', etc
  queryParam: 'apikey',                // Optional: allow ?apikey=xxx

  // Optional: Custom token lookup
  findUser: async (token) => {
    return await db.resources.users.query({ apiToken: token });
  }
}
```

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
  cookieSecret: process.env.COOKIE_SECRET
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

### URL Shortener (Dual Auth)

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

### Rate Limiting

```javascript
failban: {
  enabled: true,
  maxViolations: 3,      // Ban after 3 failed auth attempts
  banDuration: 3600000   // 1 hour ban
}
```

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
