# 🔐 Identity Provider Plugin

> **Quick Jump:** [⚡ Quick Start](#-quickstart) | [📖 Usage Journey](#-usage-journey) | [📊 Config](#-configuration-reference) | [🔧 API](#-api-reference) | [❓ FAQ](#-faq) | [🎯 Summary](#-summary)

**OAuth2/OIDC Authorization Server** - Enterprise-grade Single Sign-On (SSO) for microservices with Azure AD/Keycloak feature parity.

## ⚡ TLDR

The IdentityPlugin transforms s3db.js into a **centralized OAuth2/OIDC Authorization Server** that manages users and authentication for your microservices ecosystem.

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js/plugins/identity';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-server',
  encryptionKey: 'sso-encryption-key-32-chars!!'
});

await db.connect();

const identityPlugin = new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
  supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
  accessTokenExpiry: '15m',
  idTokenExpiry: '15m',
  refreshTokenExpiry: '7d'
});

await db.usePlugin(identityPlugin);

// 🎉 You now have a full OAuth2/OIDC server with:
// - Discovery endpoint (/.well-known/openid-configuration)
// - JWKS endpoint (/.well-known/jwks.json)
// - Token endpoint (/oauth/token)
// - Authorization endpoint (/oauth/authorize + login UI)
// - UserInfo endpoint (/oauth/userinfo)
// - Introspection endpoint (/oauth/introspect)
// - Token revocation (/oauth/revoke)
// - Dynamic client registration (/oauth/register)
```

**Key Features:**
- ✅ **Zero dependencies** - Built on Node.js native crypto (only requires hono + @hono/node-server)
- ✅ **RS256 signing** - Asymmetric RSA keys for JWT tokens
- ✅ **OIDC Discovery** - Auto-configurable by Resource Servers
- ✅ **JWKS endpoint** - Public key distribution
- ✅ **4 grant types** - authorization_code, client_credentials, refresh_token, PKCE
- ✅ **Token revocation** - RFC 7009 compliant
- ✅ **Dynamic client registration** - RFC 7591 compliant
- ✅ **Built-in login UI** - HTML form for authorization_code flow
- ✅ **Enterprise features** - Azure AD/Keycloak feature parity

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [📖 Usage Journey](#-usage-journey)
   - [Level 1: Basic SSO Setup](#level-1-basic-sso-setup)
   - [Level 2: Add Clients & Users](#level-2-add-clients--users)
   - [Level 3: Authorization Code Flow](#level-3-authorization-code-flow)
   - [Level 4: Add PKCE](#level-4-add-pkce)
   - [Level 5: Token Refresh](#level-5-token-refresh)
   - [Level 6: Multi-Audience Tokens](#level-6-multi-audience-tokens)
   - [Level 7: Production (HTTPS, Rate Limiting, Monitoring)](#level-7-production-https-rate-limiting-monitoring)
4. [📊 Configuration Reference](#-configuration-reference)
5. [📚 Configuration Examples](#-configuration-examples)
6. [🔧 API Reference](#-api-reference)
7. [✅ Best Practices](#-best-practices)
8. [🏗️ Architecture & Token Flow](#️-architecture--token-flow)
9. [🔗 See Also](#-see-also)
10. [🚨 Error Handling](#-error-handling)
11. [🐛 Troubleshooting](#-troubleshooting)
12. [❓ FAQ](#-faq)

---

## ⚡ Quickstart

### Installation

```bash
# Install required dependencies
pnpm add hono @hono/node-server
```

### Basic SSO Server

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js/plugins/identity';

const SSO_PORT = 4000;
const SSO_URL = `http://localhost:${SSO_PORT}`;

async function createSSOServer() {
  // 1. Create database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-server',
    encryptionKey: 'sso-encryption-key-32-chars!!'
  });

  await db.connect();

  // 2. Configure IdentityPlugin
  const identityPlugin = new IdentityPlugin({
    port: SSO_PORT,
    issuer: SSO_URL,
    verbose: true,

    // OAuth2/OIDC configuration
    supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api', 'offline_access'],
    supportedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
    supportedResponseTypes: ['code', 'token', 'id_token'],

    // Token expiration
    accessTokenExpiry: '15m',
    idTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    authCodeExpiry: '10m',

    // User resource (auto-created if not exists)
    userResource: 'users',

    // CORS for other applications
    cors: {
      enabled: true,
      origin: '*',
      credentials: true
    },

    // Security headers
    security: {
      enabled: true
    },

    // Logging
    logging: {
      enabled: true,
      format: ':method :path :status :response-time ms'
    }
  });

  await db.usePlugin(identityPlugin);

  return { db, identityPlugin };
}

async function seedData(db) {
  const usersResource = db.resources.users;
  const clientsResource = db.resources.plg_oauth_clients;

  // Create test user
  const user = await usersResource.insert({
    email: 'admin@sso.local',
    password: 'Admin123!',
    name: 'Admin User',
    scopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
    active: true
  });

  console.log('✅ User created:', user.email);

  // Create OAuth2 client
  const client = await clientsResource.insert({
    clientId: 'app-client-123',
    clientSecret: 'super-secret-key-456',
    name: 'My Application',
    redirectUris: [
      'http://localhost:3000/callback',
      'http://localhost:3001/callback'
    ],
    allowedScopes: ['openid', 'profile', 'email', 'read:api'],
    grantTypes: ['authorization_code', 'refresh_token'],
    active: true
  });

  console.log('✅ OAuth2 Client created:', client.clientId);
}

// Start SSO server
const { db, identityPlugin } = await createSSOServer();
await seedData(db);

console.log(`🚀 SSO Server running on: ${SSO_URL}`);
console.log('📋 Available endpoints:');
console.log(`  GET  ${SSO_URL}/.well-known/openid-configuration`);
console.log(`  GET  ${SSO_URL}/.well-known/jwks.json`);
console.log(`  POST ${SSO_URL}/oauth/token`);
console.log(`  GET  ${SSO_URL}/oauth/authorize`);
console.log(`  POST ${SSO_URL}/oauth/authorize`);
console.log(`  GET  ${SSO_URL}/oauth/userinfo`);
console.log(`  POST ${SSO_URL}/oauth/introspect`);
console.log(`  POST ${SSO_URL}/oauth/revoke`);
console.log(`  POST ${SSO_URL}/oauth/register`);
```

---

## 📖 Usage Journey

### Level 1: Basic SSO Setup

Start here for immediate SSO functionality:

```javascript
// Minimal SSO server
const identityPlugin = new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email']
});

await db.usePlugin(identityPlugin);

// That's it! You now have:
// - Discovery endpoint for auto-configuration
// - JWKS endpoint for public keys
// - Token endpoint for all grant types
// - Built-in login UI for authorization_code flow
```

**What you get:** Fully functional OAuth2/OIDC Authorization Server with 9 endpoints.

### Level 2: Add Clients & Users

Create OAuth2 clients and users:

```javascript
const usersResource = db.resources.users;
const clientsResource = db.resources.plg_oauth_clients;

// Create user
const user = await usersResource.insert({
  email: 'john@example.com',
  password: 'SecurePassword123!',
  name: 'John Doe',
  scopes: ['openid', 'profile', 'email', 'read:api'],
  active: true
});

// Create OAuth2 client
const client = await clientsResource.insert({
  clientId: 'my-app-123',
  clientSecret: 'my-super-secret-key',
  name: 'My Application',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email', 'read:api'],
  grantTypes: ['authorization_code', 'refresh_token'],
  active: true
});
```

**What you get:** Users and clients ready for authentication flows.

### Level 3: Authorization Code Flow

Implement user login for web apps:

```javascript
// Step 1: Redirect user to authorization page
const authUrl = new URL('http://localhost:4000/oauth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', 'my-app-123');
authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
authUrl.searchParams.set('scope', 'openid profile email');
authUrl.searchParams.set('state', generateRandomState());

window.location = authUrl.toString();

// Step 2: User logs in (SSO handles this with built-in UI)

// Step 3: Handle callback (backend)
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state (CSRF protection)
  if (state !== req.session.state) {
    return res.status(400).send('Invalid state');
  }

  // Exchange code for tokens
  const response = await fetch('http://localhost:4000/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from('my-app-123:my-super-secret-key').toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: 'http://localhost:3000/callback'
    })
  });

  const tokens = await response.json();
  // { access_token, id_token, refresh_token, expires_in }

  req.session.accessToken = tokens.access_token;
  req.session.refreshToken = tokens.refresh_token;

  res.redirect('/dashboard');
});
```

**What you get:** User login flow with ID tokens containing user profile.

### Level 4: Add PKCE

Secure mobile apps and SPAs without client secrets:

```javascript
import crypto from 'crypto';

// Step 1: Generate code verifier
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// Step 2: Generate code challenge
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Step 3: Authorization request with PKCE
const authUrl = new URL('http://localhost:4000/oauth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', 'mobile-app');
authUrl.searchParams.set('redirect_uri', 'myapp://callback');
authUrl.searchParams.set('scope', 'openid profile');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('state', generateRandomState());

window.location = authUrl.toString();

// Step 4: Token request with code_verifier
const response = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: 'myapp://callback',
    client_id: 'mobile-app',
    code_verifier: codeVerifier  // ← PKCE verification
  })
});
```

**What you get:** Secure mobile/SPA authentication without exposing secrets.

### Level 5: Token Refresh

Maintain long-lived sessions without re-authentication:

```javascript
// Enable refresh tokens in configuration
const identityPlugin = new IdentityPlugin({
  supportedScopes: ['openid', 'profile', 'offline_access'],  // offline_access = refresh tokens
  refreshTokenExpiry: '7d'
});

// Request refresh token initially
const initialResponse = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    scope: 'openid profile offline_access',  // Request refresh token
    // ...
  })
});

const { access_token, refresh_token, expires_in } = await initialResponse.json();

// Later: Use refresh token to get new access token
const refreshResponse = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh_token,
    client_id: 'my-app',
    client_secret: 'secret'
  })
});

const { access_token: newAccessToken } = await refreshResponse.json();
```

**What you get:** Long-lived sessions with short-lived access tokens (security best practice).

### Level 6: Multi-Audience Tokens

Support tokens valid for multiple APIs:

```javascript
// SSO Server - Issue token for multiple audiences
const identityPlugin = new IdentityPlugin({
  issuer: 'http://localhost:4000',
  features: {
    multiAudience: true  // Enable multi-audience support
  }
});

// Token will include aud: ["api://orders", "api://products"]

// Resource Servers validate their audience
const ordersOIDC = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'api://orders'  // Accepts if aud includes this
});

const productsOIDC = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'api://products'  // Accepts if aud includes this
});
```

**What you get:** Single token works across multiple APIs (microservices-friendly).

### Level 7: Production (HTTPS, Rate Limiting, Monitoring)

Production-ready configuration with security hardening:

```javascript
const identityPlugin = new IdentityPlugin({
  port: 443,
  issuer: 'https://sso.example.com',  // ← HTTPS!

  // Token expiration
  accessTokenExpiry: '15m',
  idTokenExpiry: '15m',
  refreshTokenExpiry: '7d',

  // CORS - restrictive
  cors: {
    enabled: true,
    origin: [
      'https://app.example.com',
      'https://admin.example.com'
    ],
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },

  // Security headers
  security: {
    enabled: true,
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"]
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },

  // Rate limiting
  rateLimit: {
    enabled: true,
    windowMs: 60000,      // 1 minute
    max: 100,             // 100 requests per minute per IP
    message: 'Too many requests, please try again later'
  },

  // Compression
  compression: {
    enabled: true,
    threshold: 1024,
    level: 6,
    preferBrotli: true
  },

  // Logging
  logging: {
    enabled: true,
    format: ':method :path :status :response-time ms',
    tokens: {
      user: (c) => c.get('user')?.sub || 'anonymous',
      requestId: (c) => c.get('requestId') || 'none'
    }
  },

  // Features
  features: {
    tokenRevocation: true,
    dynamicClientRegistration: true,
    pkce: true,
    refreshTokenRotation: true
  }
});

// Monitor key rotation (recommended every 90 days)
setInterval(async () => {
  await identityPlugin.oauth2.rotateKeys();
  console.log('✅ RSA keys rotated');
}, 90 * 24 * 60 * 60 * 1000);  // 90 days
```

**What you get:** Production-ready SSO with enterprise security.

---

> **Section Navigation:** [↑ Top](#) | [← Usage Journey](#-usage-journey) | [Configuration Reference →](#-configuration-reference)

---

## 📊 Configuration Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `port` | number | `4000` | Port to listen on |
| `host` | string | `'0.0.0.0'` | Host to bind to |
| `issuer` | string | **required** | Issuer URL (MUST match public URL) |
| `verbose` | boolean | `false` | Enable verbose logging |
| `userResource` | string | `'users'` | Name of users resource |

### OAuth2/OIDC Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `supportedScopes` | string[] | `['openid']` | Allowed scopes (must include 'openid' for OIDC) |
| `supportedGrantTypes` | string[] | `['authorization_code', 'client_credentials', 'refresh_token']` | Allowed grant types |
| `supportedResponseTypes` | string[] | `['code']` | Allowed response types |
| `accessTokenExpiry` | string | `'15m'` | Access token lifetime (e.g., '15m', '1h') |
| `idTokenExpiry` | string | `'15m'` | ID token lifetime |
| `refreshTokenExpiry` | string | `'7d'` | Refresh token lifetime |
| `authCodeExpiry` | string | `'10m'` | Authorization code lifetime |

### Security Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `security.enabled` | boolean | `true` | Enable security headers |
| `security.contentSecurityPolicy` | object | `{}` | CSP configuration |
| `security.hsts` | object | `{}` | HSTS configuration |

### CORS Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cors.enabled` | boolean | `true` | Enable CORS |
| `cors.origin` | string/array | `'*'` | Allowed origins (* for dev only!) |
| `cors.credentials` | boolean | `true` | Allow credentials |
| `cors.methods` | string[] | `['GET', 'POST', 'PUT', 'DELETE']` | Allowed methods |
| `cors.allowedHeaders` | string[] | `['Content-Type', 'Authorization']` | Allowed headers |

### Rate Limiting Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `rateLimit.enabled` | boolean | `false` | Enable rate limiting |
| `rateLimit.windowMs` | number | `60000` | Time window in ms |
| `rateLimit.max` | number | `100` | Max requests per window |
| `rateLimit.message` | string | `'Too many requests'` | Rate limit error message |

### Compression Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `compression.enabled` | boolean | `false` | Enable response compression |
| `compression.threshold` | number | `1024` | Compress responses > 1KB |
| `compression.level` | number | `6` | Compression level (0-9) |
| `compression.preferBrotli` | boolean | `true` | Use Brotli over gzip |

### Logging Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `logging.enabled` | boolean | `false` | Enable request logging |
| `logging.format` | string | `':method :path :status :response-time ms'` | Log format |
| `logging.tokens` | object | `{}` | Custom log tokens |

### Features Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `features.tokenRevocation` | boolean | `true` | Enable token revocation (RFC 7009) |
| `features.dynamicClientRegistration` | boolean | `true` | Enable dynamic client registration (RFC 7591) |
| `features.pkce` | boolean | `true` | Enable PKCE support |
| `features.refreshTokenRotation` | boolean | `false` | Rotate refresh tokens on use |
| `features.multiAudience` | boolean | `false` | Support tokens for multiple audiences |

---

## 📚 Configuration Examples

### Example 1: Minimal SSO Server

Simple SSO for development:

```javascript
const identityPlugin = new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email']
});
```

### Example 2: Production SSO with All Features

Enterprise-ready configuration:

```javascript
const identityPlugin = new IdentityPlugin({
  port: 443,
  issuer: 'https://sso.example.com',

  supportedScopes: [
    'openid', 'profile', 'email',
    'offline_access',
    'read:api', 'write:api', 'admin:all'
  ],
  supportedGrantTypes: [
    'authorization_code',
    'client_credentials',
    'refresh_token'
  ],

  accessTokenExpiry: '15m',
  idTokenExpiry: '15m',
  refreshTokenExpiry: '7d',

  cors: {
    enabled: true,
    origin: ['https://app.example.com', 'https://admin.example.com'],
    credentials: true
  },

  security: {
    enabled: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },

  rateLimit: {
    enabled: true,
    windowMs: 60000,
    max: 100
  },

  compression: {
    enabled: true,
    preferBrotli: true
  },

  features: {
    tokenRevocation: true,
    dynamicClientRegistration: true,
    pkce: true,
    refreshTokenRotation: true,
    multiAudience: true
  }
});
```

### Example 3: PKCE-Only (Mobile Apps)

Mobile/SPA-focused configuration:

```javascript
const identityPlugin = new IdentityPlugin({
  port: 4000,
  issuer: 'https://api.example.com',

  supportedScopes: ['openid', 'profile', 'offline_access'],
  supportedGrantTypes: ['authorization_code', 'refresh_token'],

  features: {
    pkce: true,  // Require PKCE for all authorization_code requests
    refreshTokenRotation: true
  },

  cors: {
    enabled: true,
    origin: ['myapp://', 'https://app.example.com']
  }
});
```

### Example 4: Integration with Azure AD/Keycloak

Resource Server using external identity provider:

```javascript
// Resource Server (not using IdentityPlugin, just validating tokens)
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

// Azure AD
const azureOIDC = new OIDCClient({
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: 'api://YOUR_API_CLIENT_ID',
  discoveryUri: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
});

// OR Keycloak
const keycloakOIDC = new OIDCClient({
  issuer: `http://localhost:8080/realms/production`,
  audience: 'orders-api',
  discoveryUri: `http://localhost:8080/realms/production/.well-known/openid-configuration`
});

await azureOIDC.initialize();

// Add to API
api.addAuthDriver('azure', azureOIDC.middleware.bind(azureOIDC));
```

---

> **Section Navigation:** [↑ Top](#) | [← Configuration](#-configuration-reference) | [API Reference →](#-api-reference)

---

## 🔧 API Reference

### 9 OAuth2/OIDC Endpoints

The IdentityPlugin automatically creates these endpoints:

#### 1. Discovery Endpoint

**GET `/.well-known/openid-configuration`**

Returns OIDC Discovery document with metadata about the authorization server.

```bash
curl http://localhost:4000/.well-known/openid-configuration
```

**Response:**
```json
{
  "issuer": "http://localhost:4000",
  "authorization_endpoint": "http://localhost:4000/oauth/authorize",
  "token_endpoint": "http://localhost:4000/oauth/token",
  "userinfo_endpoint": "http://localhost:4000/oauth/userinfo",
  "jwks_uri": "http://localhost:4000/.well-known/jwks.json",
  "introspection_endpoint": "http://localhost:4000/oauth/introspect",
  "revocation_endpoint": "http://localhost:4000/oauth/revoke",
  "registration_endpoint": "http://localhost:4000/oauth/register",
  "scopes_supported": ["openid", "profile", "email", "read:api", "write:api"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "code_challenge_methods_supported": ["S256"]
}
```

#### 2. JWKS Endpoint

**GET `/.well-known/jwks.json`**

Returns JSON Web Key Set (JWKS) with public keys for token verification.

```bash
curl http://localhost:4000/.well-known/jwks.json
```

**Response:**
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "2024-01-15T10:30:00.000Z",
      "alg": "RS256",
      "n": "xGOXUw...",
      "e": "AQAB"
    }
  ]
}
```

#### 3. Token Endpoint

**POST `/oauth/token`**

Issues access tokens, ID tokens, and refresh tokens. Supports multiple grant types.

**Client Credentials Grant:**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Authorization: Basic $(echo -n 'app-client-123:super-secret-key-456' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=read:api write:api"
```

**Authorization Code Grant:**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "client_id=app-client-123" \
  -d "client_secret=super-secret-key-456"
```

**Refresh Token Grant:**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN" \
  -d "client_id=app-client-123" \
  -d "client_secret=super-secret-key-456"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjQtMDEtMTV...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "read:api write:api",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjQtMDEtMTV...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjQtMDEtMTV..."
}
```

#### 4. Authorization Endpoint (GET)

**GET `/oauth/authorize`**

Displays login form for authorization_code flow.

```bash
# Browser navigation:
http://localhost:4000/oauth/authorize?response_type=code&client_id=app-client-123&redirect_uri=http://localhost:3000/callback&scope=openid%20profile&state=xyz123
```

**Query Parameters:**
- `response_type` (required): "code" for authorization_code flow
- `client_id` (required): Registered client identifier
- `redirect_uri` (required): Callback URL (must match registered URI)
- `scope` (optional): Space-separated scopes (default: "openid")
- `state` (recommended): CSRF protection token
- `nonce` (optional): Replay attack protection
- `code_challenge` (PKCE): Base64-URL encoded SHA256 hash
- `code_challenge_method` (PKCE): "S256"

**Response:**
- HTML login form with email/password fields
- On success: Redirects to `redirect_uri?code=AUTH_CODE&state=xyz123`
- On error: Redirects to `redirect_uri?error=invalid_request&error_description=...`

#### 5. Authorization Endpoint (POST)

**POST `/oauth/authorize`**

Processes login form submission.

```bash
curl -X POST http://localhost:4000/oauth/authorize \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=admin@sso.local" \
  -d "password=Admin123!" \
  -d "client_id=app-client-123" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "scope=openid profile" \
  -d "state=xyz123" \
  -d "response_type=code"
```

#### 6. UserInfo Endpoint

**GET `/oauth/userinfo`**

Returns user profile information (OIDC standard).

```bash
curl http://localhost:4000/oauth/userinfo \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

**Response:**
```json
{
  "sub": "user-id-123",
  "email": "admin@sso.local",
  "name": "Admin User",
  "email_verified": false,
  "iss": "http://localhost:4000",
  "aud": "app-client-123"
}
```

#### 7. Token Introspection

**POST `/oauth/introspect`**

Validates and returns token metadata (RFC 7662).

```bash
curl -X POST http://localhost:4000/oauth/introspect \
  -H "Authorization: Basic $(echo -n 'app-client-123:super-secret-key-456' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=ACCESS_TOKEN"
```

**Response (active token):**
```json
{
  "active": true,
  "scope": "read:api write:api",
  "client_id": "app-client-123",
  "sub": "user-id-123",
  "exp": 1705332000,
  "iat": 1705331100,
  "iss": "http://localhost:4000",
  "aud": "app-client-123"
}
```

**Response (inactive token):**
```json
{
  "active": false
}
```

#### 8. Token Revocation

**POST `/oauth/revoke`**

Revokes access or refresh tokens (RFC 7009).

```bash
curl -X POST http://localhost:4000/oauth/revoke \
  -H "Authorization: Basic $(echo -n 'app-client-123:super-secret-key-456' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=ACCESS_TOKEN" \
  -d "token_type_hint=access_token"
```

**Response:**
```
200 OK (always returns 200 for security)
```

#### 9. Dynamic Client Registration

**POST `/oauth/register`**

Dynamically registers new OAuth2 clients (RFC 7591).

```bash
curl -X POST http://localhost:4000/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My New App",
    "redirect_uris": ["http://localhost:3002/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "scope": "openid profile email"
  }'
```

**Response:**
```json
{
  "client_id": "auto-generated-client-id",
  "client_secret": "auto-generated-client-secret",
  "client_name": "My New App",
  "redirect_uris": ["http://localhost:3002/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "client_secret_basic",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

### Client Management Methods

Auto-created resource: `plg_oauth_clients`

```javascript
const clientsResource = db.resources.plg_oauth_clients;

// Create client manually
const client = await clientsResource.insert({
  clientId: 'my-app-123',
  clientSecret: 'my-super-secret-key',
  name: 'My Application',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email'],
  grantTypes: ['authorization_code', 'refresh_token'],
  active: true
});

// Rotate client secret
const newSecret = crypto.randomBytes(32).toString('base64url');
await clientsResource.update(clientId, { clientSecret: newSecret });

// Deactivate client
await clientsResource.update(clientId, { active: false });

// Delete client
await clientsResource.delete(clientId);
```

### User Management Methods

Auto-created resource: `users`

```javascript
const usersResource = db.resources.users;

// Create user
const user = await usersResource.insert({
  email: 'john@example.com',
  password: 'SecurePassword123!',
  name: 'John Doe',
  scopes: ['openid', 'profile', 'email', 'read:api'],
  active: true
});

// Update user scopes
await usersResource.update(userId, {
  scopes: ['openid', 'profile', 'email', 'read:api', 'write:api', 'admin:all']
});

// Deactivate user
await usersResource.update(userId, { active: false });

// Delete user
await usersResource.delete(userId);
```

---

> **Section Navigation:** [↑ Top](#) | [← API Reference](#-api-reference) | [Best Practices →](#-best-practices)

---

## ✅ Best Practices

### Security

**1. Always use HTTPS in production:**
```javascript
const identityPlugin = new IdentityPlugin({
  issuer: 'https://sso.example.com',  // ← HTTPS!
  security: {
    enabled: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }
});
```

**2. Use strong client secrets:**
```javascript
// Good - long random secret
clientSecret: crypto.randomBytes(32).toString('base64url')

// Bad - weak secret
clientSecret: 'my-secret-123'
```

**3. Require PKCE for public clients:**
```javascript
const identityPlugin = new IdentityPlugin({
  features: {
    pkce: true  // Enforce PKCE for authorization_code flow
  }
});
```

**4. Use state parameter for CSRF protection:**
```javascript
// Client - generate random state
const state = crypto.randomBytes(16).toString('base64url');
req.session.oauthState = state;

// Callback - verify state
if (req.query.state !== req.session.oauthState) {
  return res.status(400).send('Invalid state - possible CSRF attack');
}
```

### Token Expiration

**Use short-lived access tokens:**
```javascript
const identityPlugin = new IdentityPlugin({
  accessTokenExpiry: '15m',     // Short-lived for security
  idTokenExpiry: '15m',
  refreshTokenExpiry: '7d'      // Long-lived for convenience
});
```

### Key Rotation

**Rotate RSA keys regularly:**
```javascript
// Rotate keys every 90 days
setInterval(async () => {
  await identityPlugin.oauth2.rotateKeys();
  console.log('✅ RSA keys rotated');
}, 90 * 24 * 60 * 60 * 1000);
```

**What happens during rotation:**
1. Generates new RSA key pair
2. Marks old key inactive (but keeps it)
3. New tokens signed with new key
4. Old tokens still valid until expiry
5. Resource servers auto-fetch new JWKS

### Rate Limiting

**Protect against brute force attacks:**
```javascript
const identityPlugin = new IdentityPlugin({
  rateLimit: {
    enabled: true,
    windowMs: 60000,     // 1 minute
    max: 100,            // 100 requests per minute per IP
    message: 'Too many requests, please try again later'
  }
});
```

### CORS Configuration

**Restrict CORS in production:**
```javascript
// Development - permissive
cors: {
  origin: '*',
  credentials: true
}

// Production - restrictive
cors: {
  origin: [
    'https://app.example.com',
    'https://admin.example.com'
  ],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
```

---

> **Section Navigation:** [↑ Top](#) | [← Best Practices](#-best-practices) | [Architecture →](#️-architecture--token-flow)

---

## 🏗️ Architecture & Token Flow

### System Architecture

```mermaid
graph TB
    Client[Client Application]
    SSO[SSO Server<br/>Port 4000<br/>Authorization Server]
    Orders[Orders API<br/>Port 3001<br/>Resource Server]
    Products[Products API<br/>Port 3002<br/>Resource Server]
    Payments[Payments API<br/>Port 3003<br/>Resource Server]

    Client -->|1. POST /oauth/token<br/>client_id + client_secret| SSO
    SSO -->|2. Access Token<br/>RS256 signed JWT| Client

    Client -->|3. GET /orders<br/>Bearer token| Orders
    Client -->|3. GET /products<br/>SAME token| Products
    Client -->|3. POST /payments<br/>SAME token| Payments

    SSO -.->|JWKS<br/>Public Keys| Orders
    SSO -.->|JWKS<br/>Public Keys| Products
    SSO -.->|JWKS<br/>Public Keys| Payments

    style SSO fill:#e1f5ff,stroke:#01579b,stroke-width:3px
    style Orders fill:#f3e5f5,stroke:#4a148c
    style Products fill:#f3e5f5,stroke:#4a148c
    style Payments fill:#f3e5f5,stroke:#4a148c
    style Client fill:#fff3e0,stroke:#e65100
```

**Key Benefits:**
- ✅ Centralized authentication (single SSO service)
- ✅ Distributed authorization (APIs validate independently)
- ✅ No shared secrets (APIs only need public keys)
- ✅ One token, multiple services

### Complete SSO Flow

```mermaid
sequenceDiagram
    participant Client
    participant SSO as SSO Server<br/>(Port 4000)
    participant Orders as Orders API<br/>(Port 3001)

    Note over SSO: Initialization
    SSO->>SSO: Generate RSA key pair<br/>(private + public)
    SSO->>SSO: Store in plg_oauth_keys<br/>(private key encrypted)

    Note over Orders: Resource Server Init
    Orders->>SSO: GET /.well-known/jwks.json
    SSO-->>Orders: Public keys (JWKS)
    Orders->>Orders: Cache JWKS (1 hour)

    Note over Client,SSO: Step 1: Get Token
    Client->>SSO: POST /oauth/token<br/>grant_type=client_credentials<br/>client_id + client_secret
    SSO->>SSO: Validate client credentials
    SSO->>SSO: Create JWT payload<br/>{iss, sub, aud, scope, exp}
    SSO->>SSO: Sign with PRIVATE key (RS256)
    SSO-->>Client: access_token: eyJhbGci...

    Note over Client,Orders: Step 2: Access Orders API
    Client->>Orders: GET /orders<br/>Authorization: Bearer eyJhbGci...
    Orders->>Orders: Extract token from header
    Orders->>Orders: Decode JWT header<br/>Extract kid (key ID)
    Orders->>Orders: Get public key from JWKS cache
    Orders->>Orders: Verify signature with PUBLIC key
    Orders->>Orders: Validate claims<br/>(iss, aud, exp)
    Orders->>Orders: Check scope: orders:read ✓
    Orders-->>Client: { orders: [...] }

    Note over Orders: ✅ NO communication with SSO!<br/>✅ Validation is 100% local!
```

### Grant Types Explained

#### 1. Client Credentials (Service-to-Service)

**Use Case:** Backend services authenticating with each other (no user involved).

**Flow:**
```
Service A → POST /oauth/token (client_id + client_secret)
         ← Access Token (no refresh token)
```

**Token Payload:**
```json
{
  "sub": "service-a",
  "aud": "http://localhost:4000",
  "iss": "http://localhost:4000",
  "scope": "read:api",
  "client_id": "service-a",
  "exp": 1705332000,
  "iat": 1705331100
}
```

#### 2. Authorization Code (Web Apps)

**Use Case:** Web applications with a backend server (user login flow).

**Flow:**
```
1. User → GET /oauth/authorize?... (browser)
2. User logs in with email/password
3. SSO → Redirect to callback?code=AUTH_CODE
4. App → POST /oauth/token (code + client_secret)
5. SSO → Access Token + ID Token + Refresh Token
```

#### 3. Refresh Token (Token Renewal)

**Use Case:** Renew expired access tokens without re-authentication.

**Flow:**
```
App → POST /oauth/token (refresh_token + client_secret)
    ← New Access Token + New Refresh Token
```

#### 4. PKCE (Proof Key for Code Exchange)

**Use Case:** Mobile apps and SPAs (public clients without client_secret).

**Flow:**
```
1. App generates code_verifier (random 43-128 chars)
2. App generates code_challenge = base64url(sha256(code_verifier))
3. App → GET /oauth/authorize?...&code_challenge=CHALLENGE&code_challenge_method=S256
4. SSO → Redirect with authorization code
5. App → POST /oauth/token (code + code_verifier)
```

**Why PKCE?**
- ✅ Prevents authorization code interception attacks
- ✅ Required for mobile and SPA applications
- ✅ Works without client secret (public clients)

### Token Structure

**Access Token (JWT Payload):**
```json
{
  "iss": "http://localhost:4000",           // Issuer (SSO server)
  "sub": "user-abc123",                     // Subject (user ID)
  "aud": "http://localhost:3001",           // Audience (target API)
  "scope": "orders:read orders:write",      // Permissions
  "exp": 1234567890,                        // Expiration (Unix timestamp)
  "iat": 1234567000,                        // Issued at
  "client_id": "mobile-app"                 // OAuth client
}
```

**ID Token (OIDC - User Identity):**
```json
{
  "iss": "http://localhost:4000",
  "sub": "user-abc123",
  "aud": "webapp",
  "exp": 1234567890,
  "iat": 1234567000,
  "name": "John Doe",
  "email": "john@example.com",
  "email_verified": true,
  "picture": "https://example.com/avatar.jpg"
}
```

### Scopes and Permissions

```javascript
// SSO Server - Define supported scopes
const identityPlugin = new IdentityPlugin({
  supportedScopes: [
    // OIDC standard scopes
    'openid',          // Required for OIDC
    'profile',         // User profile (name, picture)
    'email',           // User email
    'offline_access',  // Refresh tokens

    // Custom resource scopes
    'orders:read',
    'orders:write',
    'orders:delete',
    'products:read',
    'products:write',
    'payments:process',
    'admin:all'        // Full admin access
  ]
});

// Resource Server - Check scopes
api.addRoute({
  path: '/orders/:id',
  method: 'DELETE',
  handler: async (req, res) => {
    const scopes = req.user.scope.split(' ');

    // Require specific scope
    if (!scopes.includes('orders:delete')) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: 'Requires scope: orders:delete'
      });
    }

    // Check admin scope
    if (scopes.includes('admin:all')) {
      // Admin can delete any order
    } else {
      // Regular user can only delete own orders
      const order = await ordersResource.get(req.params.id);
      if (order.userId !== req.user.sub) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await ordersResource.delete(req.params.id);
    res.status(204).send();
  },
  auth: 'oidc'
});
```

### RS256 vs HS256 Security Model

```mermaid
graph LR
    subgraph "❌ HS256 (Symmetric) - DON'T USE"
        SSO_H[SSO Server<br/>shared secret]
        API_H[All APIs<br/>shared secret]

        SSO_H -.->|Same secret<br/>everywhere| API_H

        style SSO_H fill:#ffcdd2,stroke:#c62828
        style API_H fill:#ffcdd2,stroke:#c62828
    end

    subgraph "✅ RS256 (Asymmetric) - CORRECT"
        SSO_R[SSO Server<br/>🔒 PRIVATE key]
        API_R[All APIs<br/>🔓 PUBLIC key]

        SSO_R -->|JWKS<br/>public keys only| API_R

        style SSO_R fill:#c8e6c9,stroke:#2e7d32
        style API_R fill:#e1f5fe,stroke:#01579b
    end
```

**Why RS256 is superior:**

| Aspect | HS256 (Symmetric) | RS256 (Asymmetric) |
|--------|-------------------|-------------------|
| **Secret Distribution** | ❌ Shared secret on ALL services | ✅ Private key ONLY on SSO |
| **Security Risk** | ❌ One leak compromises EVERYTHING | ✅ Public key leak is safe |
| **Token Creation** | ❌ Any service can create fake tokens | ✅ Only SSO can create tokens |
| **Key Rotation** | ❌ Update ALL services | ✅ Update SSO, APIs auto-fetch JWKS |
| **Use Case** | Single service | Microservices, SSO |

---

> **Section Navigation:** [↑ Top](#) | [← Architecture](#️-architecture--token-flow) | [Error Handling →](#-error-handling)

---

## 🔗 See Also

**Related API Plugin Documentation:**
- **[API Plugin](./api.md)** - Resource Server documentation (uses IdentityPlugin tokens)
- **[API Authentication](./api/authentication.md)** - OIDC driver for Resource Servers
- **[API Guards](./api/guards.md)** - Row-level security with OIDC tokens
- **[API Deployment](./api/deployment.md)** - Deploy SSO + Resource Servers

**Guides:**
- **[OAuth2/OIDC Guide](../oauth2-guide.md)** - Complete OAuth2 guide (architecture, testing, troubleshooting)

**Examples:**
- [e80-sso-oauth2-server.js](../examples/e80-sso-oauth2-server.js) - SSO Server with IdentityPlugin
- [e81-oauth2-resource-server.js](../examples/e81-oauth2-resource-server.js) - Resource Server (API) validating tokens
- [e82-oidc-web-app.js](../examples/e82-oidc-web-app.js) - Web app with "Login with SSO"
- [e60-oauth2-microservices.js](../examples/e60-oauth2-microservices.js) - Complete microservices setup
- [e62-azure-ad-integration.js](../examples/e62-azure-ad-integration.js) - Azure AD integration
- [e63-keycloak-integration.js](../examples/e63-keycloak-integration.js) - Keycloak integration

---

> **Section Navigation:** [↑ Top](#) | [← See Also](#-see-also) | [Error Handling →](#-error-handling)

---

## 🚨 Error Handling

### IdentityError

All Identity Plugin operations throw `IdentityError` instances:

```javascript
try {
  await identityPlugin.oauth2.generateToken({});
} catch (error) {
  console.error(error.name);        // 'IdentityError'
  console.error(error.message);     // Brief error summary
  console.error(error.description); // Detailed explanation
  console.error(error.context);     // Operation context
}
```

### OAuth2Error

OAuth2-specific errors follow RFC 6749 standard error codes:

```javascript
// Standard OAuth2 error response
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired",
  "error_uri": "https://tools.ietf.org/html/rfc6749#section-5.2"
}
```

### Common Errors

#### invalid_client

**When:** Client authentication failed
**Causes:**
- ❌ Invalid client_id
- ❌ Invalid client_secret
- ❌ Client not found
- ❌ Client inactive

**Recovery:**
```javascript
// Verify client credentials
const client = await clientsResource.query({ clientId: 'app-123' });
console.log('Client active:', client.active);
console.log('Client grants:', client.grantTypes);
```

#### invalid_grant

**When:** Authorization code/refresh token invalid
**Causes:**
- ❌ Code expired (default: 10 minutes)
- ❌ Code already used
- ❌ Refresh token expired
- ❌ Refresh token revoked

**Recovery:**
```javascript
// Restart authorization flow
window.location = '/oauth/authorize?...';
```

#### invalid_scope

**When:** Requested scope not allowed
**Causes:**
- ❌ Scope not in `supportedScopes`
- ❌ Scope not in client's `allowedScopes`
- ❌ User doesn't have scope

**Recovery:**
```javascript
// Check user scopes
const user = await usersResource.get(userId);
console.log('User scopes:', user.scopes);

// Add missing scope
await usersResource.update(userId, {
  scopes: [...user.scopes, 'orders:write']
});
```

#### invalid_request

**When:** Missing required parameters
**Causes:**
- ❌ Missing grant_type
- ❌ Missing client_id
- ❌ Missing redirect_uri
- ❌ Invalid redirect_uri

**Recovery:**
```javascript
// Verify all required parameters are present
const params = {
  grant_type: 'authorization_code',
  code: authCode,
  redirect_uri: 'http://localhost:3000/callback',
  client_id: 'app-123',
  client_secret: 'secret'
};
```

#### unauthorized_client

**When:** Client not authorized for grant type
**Causes:**
- ❌ Grant type not in client's `grantTypes`

**Recovery:**
```javascript
// Update client grant types
await clientsResource.update(clientId, {
  grantTypes: ['authorization_code', 'refresh_token', 'client_credentials']
});
```

### Error Recovery Patterns

#### Graceful Degradation

```javascript
async function getTokenWithFallback() {
  try {
    return await getAccessToken();
  } catch (error) {
    if (error.error === 'invalid_grant') {
      console.warn('Token expired, redirecting to login');
      window.location = '/oauth/authorize?...';
    } else {
      throw error;
    }
  }
}
```

#### Token Refresh on Expiration

```javascript
async function callAPIWithAutoRefresh(url) {
  let token = req.session.accessToken;

  try {
    return await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (error) {
    if (error.status === 401) {
      // Token expired, refresh it
      const refreshResponse = await fetch('/oauth/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: req.session.refreshToken,
          client_id: 'app-123',
          client_secret: 'secret'
        })
      });

      const tokens = await refreshResponse.json();
      req.session.accessToken = tokens.access_token;

      // Retry with new token
      return await fetch(url, {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });
    }
    throw error;
  }
}
```

---

> **Section Navigation:** [↑ Top](#) | [← Error Handling](#-error-handling) | [Troubleshooting →](#-troubleshooting)

---

## 🐛 Troubleshooting

### Issue 1: "Invalid token signature"

**Cause:** Resource Server has cached old JWKS.

**Solution:**
```javascript
// Set lower JWKS cache TTL
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  jwksCacheTTL: 300000  // 5 minutes (default: 1 hour)
});

// Force refresh JWKS
await oidcClient.fetchJWKS(true);
```

### Issue 2: "Invalid redirect_uri"

**Cause:** Redirect URI doesn't match registered URI exactly (including trailing slash).

**Solution:**
```javascript
// Client registration
redirectUris: [
  'http://localhost:3000/callback',  // No trailing slash
  'https://myapp.com/auth/callback'  // Exact match required
]

// Authorization request - must match exactly
redirect_uri: 'http://localhost:3000/callback'  // ← Same as registered
```

### Issue 3: "Insufficient scopes"

**Cause:** User doesn't have requested scopes.

**Solution:**
```javascript
// Check user scopes
const user = await usersResource.get(userId);
console.log('User scopes:', user.scopes);

// Add missing scopes
await usersResource.update(userId, {
  scopes: [...user.scopes, 'read:api', 'write:api']
});
```

### Issue 4: "Token expired"

**Cause:** Access token expired (15 minutes by default).

**Solution:** Use refresh token to get new access token:
```bash
curl -X POST http://localhost:4000/oauth/token \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN" \
  -d "client_id=app-client-123" \
  -d "client_secret=super-secret-key-456"
```

### Issue 5: "CORS error"

**Cause:** Resource Server not allowed in CORS config.

**Solution:**
```javascript
const identityPlugin = new IdentityPlugin({
  cors: {
    enabled: true,
    origin: [
      'http://localhost:3000',  // Add your Resource Server
      'http://localhost:3001',
      'http://localhost:3002'
    ],
    credentials: true
  }
});
```

### Issue 6: "Public key not found for kid"

**Cause:** Key rotation occurred, old key not in JWKS.

**Solution:**
```javascript
// Debug: List all cached keys
const jwks = oidcClient.getJWKS();
console.log('Available kids:', jwks.keys.map(k => k.kid));

// Decode token to see kid
const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64'));
console.log('Token kid:', header.kid);

// Force refresh JWKS
await oidcClient.fetchJWKS(true);
```

### Issue 7: "JWKS endpoint not accessible"

**Cause:** SSO server not running or network issues.

**Solution:**
```bash
# Test JWKS endpoint
curl http://localhost:4000/.well-known/jwks.json

# Expected: JSON with keys array
# {
#   "keys": [{
#     "kty": "RSA",
#     "kid": "abc123",
#     ...
#   }]
# }

# Verify SSO server is running
curl http://localhost:4000/.well-known/openid-configuration
```

### Issue 8: "Clock skew - token not yet valid"

**Cause:** Time difference between SSO and Resource Server.

**Solution:**
```javascript
// Increase clock tolerance
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  clockTolerance: 300  // 5 minutes tolerance
});

// Sync server clocks with NTP
sudo ntpdate pool.ntp.org
```

### Performance Optimization

**JWKS Caching:**
```javascript
// Aggressive caching (1 hour)
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  jwksCacheTTL: 3600000,  // 1 hour
  autoRefreshJWKS: true   // Auto-refresh in background
});

// Impact:
// Without cache: ~50-100ms per request (network + verify)
// With cache: <1ms per request (verify only)
```

**Token Expiry Trade-offs:**
```javascript
// Short-lived (more secure, more token requests)
const identityPlugin = new IdentityPlugin({
  accessTokenExpiry: '5m',
  refreshTokenExpiry: '1d'
});

// Long-lived (less secure, fewer token requests)
const identityPlugin = new IdentityPlugin({
  accessTokenExpiry: '1h',
  refreshTokenExpiry: '30d'
});

// Recommendation: 15 minutes access, 7 days refresh
```

---

> **Section Navigation:** [↑ Top](#) | [← Troubleshooting](#-troubleshooting) | [FAQ →](#-faq)

---

## ❓ FAQ

### Basics

**Q: What is OIDC and how does it differ from OAuth2?**
A: OAuth2 is an **authorization** framework (what you can do). OIDC is an **authentication** layer on top of OAuth2 (who you are). OIDC adds:
- ID tokens with user identity
- UserInfo endpoint for profile data
- Standard claims (name, email, picture)
- Discovery endpoint for auto-configuration

**Q: When should I use IdentityPlugin vs external providers (Azure AD, Keycloak)?**
A:

**Use IdentityPlugin when:**
- ✅ Need full control over authentication
- ✅ Want to use S3 as backend
- ✅ Self-hosted infrastructure
- ✅ Budget constraints (free)
- ✅ Simple microservices architecture

**Use Azure AD/Keycloak when:**
- ✅ Need social login (Google, Facebook)
- ✅ Need SAML/LDAP integration
- ✅ Enterprise compliance (SOC2, ISO 27001)
- ✅ Advanced features (adaptive auth, MFA)

**Q: Can Resource Servers validate tokens from any OAuth2 provider?**
A: Yes! Resource Servers using `OIDCClient` can validate tokens from:
- IdentityPlugin
- Azure AD
- Keycloak
- Auth0
- Any OAuth2/OIDC-compliant provider

Just configure the issuer URL and audience.

### Configuration

**Q: How do I test my SSO server?**
A:
```bash
# 1. Check discovery endpoint
curl http://localhost:4000/.well-known/openid-configuration

# 2. Check JWKS endpoint
curl http://localhost:4000/.well-known/jwks.json

# 3. Get token
curl -X POST http://localhost:4000/oauth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=test" \
  -d "client_secret=secret" \
  -d "scope=openid"

# 4. Decode token
echo $TOKEN | cut -d. -f2 | base64 -d | jq
```

**Q: How do I enable PKCE?**
A: PKCE is enabled by default. Just use `code_challenge` and `code_challenge_method` in authorization requests:
```javascript
const identityPlugin = new IdentityPlugin({
  features: {
    pkce: true  // Enabled by default
  }
});
```

**Q: How do I rotate keys?**
A:
```javascript
// Manual rotation
await identityPlugin.oauth2.rotateKeys();

// Automatic rotation (every 90 days)
setInterval(async () => {
  await identityPlugin.oauth2.rotateKeys();
}, 90 * 24 * 60 * 60 * 1000);
```

### Tokens

**Q: What's the difference between access_token, id_token, and refresh_token?**
A:

| Token | Purpose | Audience | Lifetime | Contains |
|-------|---------|----------|----------|----------|
| **access_token** | Authorization (what you can do) | Resource Servers | Short (15m) | Scopes, permissions |
| **id_token** | Authentication (who you are) | Client app | Short (15m) | User profile, email |
| **refresh_token** | Get new tokens | Authorization Server | Long (7d) | Nothing (opaque) |

**Q: How do I validate tokens in my API?**
A: Use `OIDCClient`:
```javascript
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'http://localhost:3001'
});

await oidcClient.initialize();

api.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

api.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    // req.user contains validated token payload
    const userId = req.user.sub;
    const scopes = req.user.scope.split(' ');
    // ...
  },
  auth: 'oidc'
});
```

**Q: How do I revoke tokens?**
A: Use the revocation endpoint:
```bash
curl -X POST http://localhost:4000/oauth/revoke \
  -H "Authorization: Basic $(echo -n 'client:secret' | base64)" \
  -d "token=ACCESS_TOKEN" \
  -d "token_type_hint=access_token"
```

### Grant Types

**Q: Which grant type should I use?**
A:

| Use Case | Grant Type | Client Type |
|----------|-----------|-------------|
| Web app with backend | authorization_code | Confidential (has client_secret) |
| Mobile app | authorization_code + PKCE | Public (no client_secret) |
| SPA (React/Vue) | authorization_code + PKCE | Public |
| Service-to-service | client_credentials | Confidential |
| Desktop app | authorization_code + PKCE | Public |

**Q: Do I need PKCE for web apps with backend?**
A: Not required, but **highly recommended** as an additional security layer.

**Q: Can I disable specific grant types?**
A: Yes, configure `supportedGrantTypes`:
```javascript
const identityPlugin = new IdentityPlugin({
  supportedGrantTypes: ['authorization_code', 'refresh_token']  // No client_credentials
});
```

### Scopes

**Q: What scopes should I use?**
A: Use OIDC standard scopes + custom scopes:

```javascript
supportedScopes: [
  // OIDC standard (always include these)
  'openid',          // Required for OIDC
  'profile',         // User profile (name, picture)
  'email',           // User email
  'offline_access',  // Refresh tokens

  // Custom resource scopes (your API permissions)
  'read:orders',
  'write:orders',
  'read:products',
  'write:products',
  'admin:all'
]
```

**Q: How do I enforce scopes in my API?**
A:
```javascript
api.addRoute({
  path: '/orders',
  method: 'POST',
  handler: async (req, res) => {
    const scopes = req.user.scope.split(' ');

    if (!scopes.includes('write:orders')) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: 'Requires scope: write:orders'
      });
    }

    // Process request
  },
  auth: 'oidc'
});
```

### Integration

**Q: Can I use IdentityPlugin with existing databases?**
A: Yes! Just specify an existing `userResource`:
```javascript
const identityPlugin = new IdentityPlugin({
  userResource: 'existing_users_table'
});
```

The resource must have these fields:
- `email` (string)
- `password` (secret)
- `scopes` (array)
- `active` (boolean)

**Q: How do I integrate with Azure AD?**
A: Don't use IdentityPlugin for this - use `OIDCClient` in your Resource Server:
```javascript
const azureOIDC = new OIDCClient({
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: 'api://YOUR_API_CLIENT_ID'
});
```

See `docs/examples/e62-azure-ad-integration.js` for complete example.

### Troubleshooting

**Q: Token validation fails with "Invalid signature"?**
A: Resource Server has cached old JWKS. Force refresh:
```javascript
await oidcClient.fetchJWKS(true);
```

**Q: Getting CORS errors?**
A: Add your Resource Server to CORS allowed origins:
```javascript
cors: {
  enabled: true,
  origin: ['http://localhost:3001', 'http://localhost:3002']
}
```

**Q: Users can't log in?**
A: Check:
1. User exists: `await usersResource.query({ email: 'user@example.com' })`
2. User active: `user.active === true`
3. Client exists and active: `await clientsResource.get(clientId)`
4. Redirect URI matches: `client.redirectUris.includes(redirect_uri)`

**Q: How do I debug token issues?**
A: Decode tokens manually:
```bash
# Decode header
echo $TOKEN | cut -d. -f1 | base64 -d | jq

# Decode payload
echo $TOKEN | cut -d. -f2 | base64 -d | jq

# Check claims
{
  "iss": "http://localhost:4000",  // Must match OIDC issuer
  "sub": "user-123",
  "aud": "http://localhost:3001",  // Must match API audience
  "exp": 1234567890,               // Must be in future
  "scope": "openid profile"
}
```

### Comparison

**Q: IdentityPlugin vs Azure AD vs Keycloak?**
A:

| Feature | IdentityPlugin | Azure AD | Keycloak |
|---------|---------------|----------|----------|
| **Cost** | Free | Paid (per user) | Free |
| **Hosting** | Self-hosted | Microsoft cloud | Self-hosted |
| **Setup Time** | 5 min | 60 min | 30 min |
| **Social Login** | ❌ | ✅ | ✅ |
| **SAML/LDAP** | ❌ | ✅ | ✅ |
| **Customization** | Full | Very Limited | High |
| **Database** | S3/MinIO | Azure SQL | PostgreSQL |
| **Best For** | Simple SSO, S3 backend | Enterprise, Office 365 | Complex auth, self-hosted |

---

> **Section Navigation:** [↑ Top](#) | [← FAQ](#-faq) | [Summary →](#-summary)

---

## 🎯 Summary

The **IdentityPlugin** transforms s3db.js into a production-ready OAuth2/OIDC Authorization Server with:

✅ **9 endpoints** - Discovery, JWKS, Token, Authorize, UserInfo, Introspect, Revoke, Register
✅ **4 grant types** - authorization_code, client_credentials, refresh_token, PKCE
✅ **RS256 signing** - Asymmetric RSA keys for secure JWT tokens
✅ **Zero external dependencies** - Built on Node.js native crypto
✅ **Enterprise features** - Azure AD/Keycloak parity
✅ **5-minute setup** - Simple configuration, automatic resource creation

**Next Steps:**
1. Read [Quickstart](#-quickstart)
2. Run example: `node docs/examples/e80-sso-oauth2-server.js`
3. Create Resource Server: `docs/examples/e81-oauth2-resource-server.js`
4. Build web app: `docs/examples/e82-oidc-web-app.js`
5. Read complete guide: `docs/oauth2-guide.md`
