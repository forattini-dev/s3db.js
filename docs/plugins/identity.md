# 🔐 Identity Provider Plugin

> **Quick Jump:** [⚡ Quick Start](#-quickstart) | [📖 Usage Journey](#-usage-journey) | [📊 Config](./identity/configuration.md) | [🏗️ Architecture](./identity/architecture.md) | [🔧 API](./identity/api-reference.md) | [🔗 Integration](./identity/integration.md) | [❓ FAQ](#-faq)

**OAuth2/OIDC Authorization Server** - Enterprise-grade Single Sign-On (SSO) for microservices with Azure AD/Keycloak feature parity.

## ⚡ TLDR

The IdentityPlugin transforms s3db.js into a **centralized OAuth2/OIDC Authorization Server** that manages users and authentication for your microservices ecosystem.

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';

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
- ✅ **Minimal external dependencies** - Uses Node.js native crypto for JWT signing (requires hono for HTTP server)
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
4. [📖 Detailed Documentation](#-detailed-documentation)
5. [🎯 Common Scenarios](#-common-scenarios)
6. [❓ FAQ](#-faq)
7. [🎯 Summary](#-summary)
8. [🔗 See Also](#-see-also)

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
import { IdentityPlugin } from 's3db.js';

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

**See complete journey:** [Configuration →](./identity/configuration.md) includes Levels 4-7 (PKCE, Token Refresh, Multi-Audience, Production)

---

## 📖 Detailed Documentation

Comprehensive guides for all Identity Plugin features:

- **[Configuration Reference](./identity/configuration.md)** - Complete configuration options
  - Core Options (port, issuer, scopes)
  - Token Expiration Settings
  - Security & CORS
  - Rate Limiting & Compression
  - Feature Flags
  - Configuration Examples

- **[Architecture & Token Flow](./identity/architecture.md)** - System design
  - System Architecture Diagrams
  - Complete SSO Flow (sequence diagrams)
  - Grant Types Explained (4 types)
  - Token Structure & Scopes
  - RS256 vs HS256 Security Model

- **[API Reference](./identity/api-reference.md)** - All 9 endpoints
  - Discovery Endpoint
  - JWKS Endpoint
  - Token Endpoint (all grant types)
  - Authorization Endpoints (GET/POST)
  - UserInfo Endpoint
  - Introspection Endpoint
  - Token Revocation
  - Dynamic Client Registration
  - Client & User Management

- **[Integration Guide](./identity/integration.md)** - Connect your apps
  - Resource Server Integration
  - Client Integration Examples
  - Azure AD Integration
  - Keycloak Integration
  - Multi-Audience Tokens

- **[Troubleshooting](./identity/troubleshooting.md)** - Solve common issues
  - Error Handling (IdentityError, OAuth2Error)
  - Common Errors & Recovery
  - Performance Optimization
  - Debugging Tips

---

## 🎯 Common Scenarios

**Quick-win patterns for typical use cases** - copy-paste and customize!

### 1. Minimal SSO Server (Development)

```javascript
const identityPlugin = new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email']
});
```

### 2. Production SSO with All Features

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

### 3. PKCE-Only (Mobile Apps)

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

### 4. Integration with Azure AD/Keycloak

```javascript
// Resource Server (not using IdentityPlugin, just validating tokens)
import { OIDCClient } from 's3db.js';

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
import { OIDCClient } from 's3db.js';

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

---

## 🎯 Summary

The **IdentityPlugin** transforms s3db.js into a production-ready OAuth2/OIDC Authorization Server with:

✅ **9 endpoints** - Discovery, JWKS, Token, Authorize, UserInfo, Introspect, Revoke, Register
✅ **4 grant types** - authorization_code, client_credentials, refresh_token, PKCE
✅ **RS256 signing** - Asymmetric RSA keys for secure JWT tokens
✅ **Uses Node.js native crypto** - for JWT signing and key generation
✅ **Enterprise features** - Azure AD/Keycloak parity
✅ **5-minute setup** - Simple configuration, automatic resource creation

**Next Steps:**
1. Read [Quickstart](#-quickstart)
2. Run example: `node docs/examples/e80-sso-oauth2-server.js`
3. Create Resource Server: `docs/examples/e81-oauth2-resource-server.js`
4. Build web app: `docs/examples/e82-oidc-web-app.js`
5. Read complete guide: `docs/oauth2-guide.md`

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

> **📖 For detailed documentation, see:**
> - [Configuration Reference](./identity/configuration.md)
> - [Architecture & Token Flow](./identity/architecture.md)
> - [API Reference](./identity/api-reference.md)
> - [Integration Guide](./identity/integration.md)
> - [Troubleshooting](./identity/troubleshooting.md)
