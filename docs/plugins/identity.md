# 🔐 Identity Plugin

> **Transform s3db.js into a production-ready OAuth2/OIDC Authorization Server.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration →](./identity/configuration.md) | [Architecture →](./identity/architecture.md) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

```javascript
import { Database, IdentityPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api']
}));

// 🎉 Full OAuth2/OIDC server ready!
```

**You get instantly:**
- ✅ **9 OAuth2/OIDC endpoints** (discovery, JWKS, token, authorize, userinfo, etc.)
- ✅ **4 grant types** (authorization_code, client_credentials, refresh_token, PKCE)
- ✅ **Purpose-scoped RSA keys** (separate signing and challenge keys)
- ✅ **Built-in login UI** (HTML form for authorization_code flow)
- ✅ **Enterprise features** (token revocation, dynamic client registration)
- ✅ **Adaptive rate limiting** (per login/token/authorize endpoint)
- ✅ **Sanitized audit logging** (PII-safe event trails)

**Works as:** Authorization Server (SSO) for your microservices ecosystem. Clients can be web apps, mobile apps, or other APIs.

---

## 🚀 Quick Start

### Installation

```bash
pnpm add hono @hono/node-server
```

### Minimal SSO Server

```javascript
import { Database, IdentityPlugin } from 's3db.js';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-server',
  encryptionKey: 'your-32-char-encryption-key!!'
});

await db.connect();

await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d'
}));

console.log('✅ SSO Server running at http://localhost:4000');
```

> 💡 **Multi-instance**: pass `namespace: 'tenant-a'` (or supply a custom alias to `db.usePlugin`) when you need multiple IdentityPlugin instances. All internal resources (`plg_identity_*`) and PluginStorage keys will be namespaced automatically (e.g., `plg_tenant-a_identity_sessions`).

### Create Users & Clients

```javascript
const users = db.resources.users;
const clients = db.resources.plg_oauth_clients;

// Create user
await users.insert({
  email: 'admin@example.com',
  password: 'SecurePassword123!',
  name: 'Admin User',
  scopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
  active: true
});

// Create OAuth2 client
await clients.insert({
  clientId: 'my-app-123',
  clientSecret: 'super-secret-key-456',
  name: 'My Application',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email', 'read:api'],
  grantTypes: ['authorization_code', 'refresh_token'],
  active: true
});
```

**Your endpoints:**
```bash
GET  http://localhost:4000/.well-known/openid-configuration  # Discovery
GET  http://localhost:4000/.well-known/jwks.json             # Public keys
POST http://localhost:4000/oauth/token                       # Get tokens
GET  http://localhost:4000/oauth/authorize                   # Login UI
GET  http://localhost:4000/oauth/userinfo                    # User profile
POST http://localhost:4000/oauth/introspect                  # Validate tokens
POST http://localhost:4000/oauth/revoke                      # Revoke tokens
POST http://localhost:4000/oauth/register                    # Dynamic client registration
```

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**Peer Dependencies (for IdentityPlugin):**

This plugin requires the Hono web framework:

```bash
pnpm install hono @hono/node-server
```

**Individual packages:**
- `hono` - Fast, lightweight web framework (~50KB core)
- `@hono/node-server` - Node.js adapter for Hono

**Optional Dependencies (By Feature):**

**JWT/Cryptography (Built-in):**
```bash
# NO additional packages needed!
# IdentityPlugin uses Node.js built-in crypto module for:
# - RSA key pair generation (purpose-scoped signing and challenge keys)
# - JWT signing and verification (RS256 algorithm)
# - Token encryption and hashing
# - PKCE code challenge/verifier validation
```

**Why Peer Dependencies?**

IdentityPlugin uses peer dependencies to:
- ✅ Keep core s3db.js lightweight (~500KB)
- ✅ Allow version flexibility (you control Hono versions)
- ✅ Prevent dependency conflicts in monorepos
- ✅ Share Hono instance with ApiPlugin (if using both)

**Minimum Node.js Version:** 18.x (for native crypto, Web Streams)

**Security Notice:**

IdentityPlugin automatically generates RSA key pairs on first initialization if none exist:
- **Signing keys** (`plg_identity_signing_keys`) - Used for JWT signature (RS256)
- **Challenge keys** (`plg_identity_challenge_keys`) - Used for PKCE code_challenge validation

These keys are stored in s3db.js resources and persisted to S3. In production:
- ✅ Use encryption (`encryptionKey` in Database config) to protect private keys at rest
- ✅ Rotate keys periodically (create new, deprecate old)
- ✅ Back up keys securely (losing private keys = all issued JWTs become invalid)

---

## 📑 Table of Contents

- [TL;DR](#-tldr)
- [Quick Start](#-quick-start)
- [Dependencies](#-dependencies)
- [Documentation Hub](#-documentation-hub)
- [Usage Journey](#-usage-journey)
- [Resource Customization](#-resource-customization)
- [Common Scenarios](#-common-scenarios)
- [FAQ](#-faq)
- [What's Next?](#-whats-next)
- [Need Help?](#-need-help)

---

## 📚 Documentation Hub

**Core Guides** - Essential features and setup:

| Guide | What's Inside | When to Read |
|-------|---------------|--------------|
| **[⚙️ Configuration](./identity/configuration.md)** | All config options, token settings, security | Setting up your SSO server |
| **[🏗️ Architecture](./identity/architecture.md)** | System design, token flows, grant types | Understanding how it works |
| **[🔌 API Reference](./identity/api-reference.md)** | All 9 endpoints with examples | Integrating with clients |
| **[🔗 Integration](./identity/integration.md)** | Connect apps, Azure AD, Keycloak | Building OAuth2 clients |
| **[🐛 Troubleshooting](./identity/troubleshooting.md)** | Common errors, debugging tips | When things go wrong |
| **[🎨 Whitelabel UI](./identity/WHITELABEL.md)** | Customize login page branding | Custom branding |

---

## 🎯 Usage Journey

### Level 1: Basic SSO Server (1 minute)

Get a working OAuth2/OIDC server instantly:

```javascript
await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email']
}));

// ✨ Done! You have 9 endpoints ready
```

**What you get:** Full OAuth2/OIDC Authorization Server with discovery, JWKS, token endpoints, and built-in login UI.

### Security defaults

- 🔐 **Rate limiting on by default** for `/login`, `/oauth/token`, and `/oauth/authorize` (tune via `rateLimit` config)
- 🔑 **Challenge tokens signed with dedicated RSA keys** (`purpose: 'challenge'`) so OAuth signing keys stay isolated
- 🧼 **Audit events are automatically sanitized** (passwords/secrets removed before persistence)
- ✅ **Startup validation** fails fast when SMTP, GeoIP or rate-limit configuration is inconsistent

These guardrails ship out-of-the-box; tweak them as needed in the configuration guide.

---

### Level 2: Add Users & Clients (2 minutes)

```javascript
// Create user
await db.resources.users.insert({
  email: 'john@example.com',
  password: 'SecurePassword123!',
  scopes: ['openid', 'profile', 'email', 'read:api'],
  active: true
});

// Create OAuth2 client
await db.resources.plg_oauth_clients.insert({
  clientId: 'my-app',
  clientSecret: 'secret-key',
  name: 'My App',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email'],
  grantTypes: ['authorization_code', 'refresh_token']
});
```

**What you get:** Users and clients ready for authentication flows.

---

### Level 3: Authorization Code Flow (Web Apps)

Implement user login:

```javascript
// Step 1: Redirect to SSO
const authUrl = new URL('http://localhost:4000/oauth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', 'my-app');
authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
authUrl.searchParams.set('scope', 'openid profile email');
authUrl.searchParams.set('state', generateRandomState());

window.location = authUrl.toString();

// Step 2: User logs in (SSO handles this)

// Step 3: Exchange code for tokens
const response = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': 'Basic ' + btoa('my-app:secret-key')
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: req.query.code,
    redirect_uri: 'http://localhost:3000/callback'
  })
});

const tokens = await response.json();
// { access_token, id_token, refresh_token, expires_in }
```

**What you get:** Complete user login flow with JWT tokens.

**[→ See Levels 4-7 in Configuration Guide](./identity/configuration.md)** (PKCE, Token Refresh, Multi-Tenant, Production)

---

## 🎨 Resource Customization

The plugin creates three resources: **users**, **tenants**, **clients**. You can extend them with custom fields:

### Base Schemas (Cannot Override)

**Users:**
```javascript
{
  email: 'string|required|email',
  password: 'password|required',  // Auto-hashed
  emailVerified: 'boolean',
  name: 'string',
  scopes: 'array|items:string',
  roles: 'array|items:string',
  tenantId: 'string',
  active: 'boolean|default:true'
}
```

**Clients:**
```javascript
{
  clientId: 'string|required',
  clientSecret: 'secret|required',
  name: 'string|required',
  redirectUris: 'array|items:string|required',
  allowedScopes: 'array|items:string',
  grantTypes: 'array|items:string',
  active: 'boolean|default:true'
}
```

### Extend with Custom Fields

```javascript
await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',

  resources: {
    users: {
      name: 'app_users',
      attributes: {
        // Custom fields (deep merged with base)
        companyId: 'string|default:default-company',
        department: 'string|default:engineering',
        employeeId: 'string|optional'
      },
      partitions: {
        byCompany: { fields: { companyId: 'string' } }
      },
      hooks: {
        beforeInsert: async (data) => {
          data.department = data.department?.toUpperCase();
          return data;
        }
      }
    },

    clients: {
      name: 'oauth_apps',
      attributes: {
        logoUrl: 'string|default:https://placeholder.com/logo.png',
        brandColor: 'string|default:#007bff'
      }
    }
  }
}));
```

**Rules:**
- ✅ Can add custom fields
- ✅ Can configure partitions, hooks, behavior
- ❌ Cannot override base attributes (email, password, clientId, etc.)
- ⚠️ Optional fields need defaults: `field: 'string|default:value'`

### Internal Resource Names

Every IdentityPlugin instance also creates a handful of internal resources for OAuth2 state (`oauth_keys`, `auth_codes`, `sessions`, `password_reset_tokens`, `mfa_devices`). They default to namespaced identifiers such as `plg_identity_oauth_keys`, but you can override them to match your naming conventions or to avoid cross-plugin collisions:

```javascript
await db.use(new IdentityPlugin({
  issuer: 'https://sso.example.com',
  resourceNames: {
    oauthKeys: 'plg_identity_oauth_keys_us_west_2',
    authCodes: 'plg_identity_auth_codes_sessions',
    sessions: 'plg_identity_sessions_primary'
  }
}));
```

Guidelines:
- Always keep the `plg_` prefix to avoid clashing with user-managed resources.
- Each plugin instance automatically scopes overrides by namespace, so `namespace: 'tenant-a'` produces `plg_tenant-a_identity_sessions` unless you supply a custom value.
- Provide overrides for every plugin instance that shares an S3 bucket to guarantee uniqueness across environments.

**[→ See complete customization guide](./identity/configuration.md#resource-customization)**

---

## 🔥 Common Scenarios

### 1. Development SSO Server

```javascript
await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email'],
  verbose: true  // Debug logs
}));
```

---

### 2. Production SSO with All Features

```javascript
await db.use(new IdentityPlugin({
  port: 443,
  issuer: 'https://sso.example.com',

  supportedScopes: [
    'openid', 'profile', 'email', 'offline_access',
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

  features: {
    tokenRevocation: true,
    dynamicClientRegistration: true,
    pkce: true,
    refreshTokenRotation: true,
    multiAudience: true
  }
}));
```

---

### 3. Mobile Apps (PKCE Required)

```javascript
await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'https://api.example.com',

  supportedScopes: ['openid', 'profile', 'offline_access'],
  supportedGrantTypes: ['authorization_code', 'refresh_token'],

  features: {
    pkce: true,  // Require code_challenge for all auth requests
    refreshTokenRotation: true
  },

  cors: {
    enabled: true,
    origin: ['myapp://', 'https://app.example.com']
  }
}));
```

---

### 4. Service-to-Service (Client Credentials Only)

```javascript
await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',

  supportedScopes: ['read:api', 'write:api', 'admin:all'],
  supportedGrantTypes: ['client_credentials'],  // No user login

  accessTokenExpiry: '1h'
}));

// Usage: Machine-to-machine authentication
const response = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': 'Basic ' + btoa('client:secret')
  },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'read:api write:api'
  })
});
```

---

### 5. Multi-Tenant SaaS

```javascript
await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',

  resources: {
    users: {
      attributes: {
        tenantId: 'string|required',
        companyName: 'string|default:Default Company'
      },
      partitions: {
        byTenant: { fields: { tenantId: 'string' } }
      },
      hooks: {
        beforeInsert: async (data) => {
          // Auto-assign tenant from context
          data.tenantId = context.tenantId;
          return data;
        }
      }
    },

    clients: {
      attributes: {
        tenantId: 'string|required'
      },
      partitions: {
        byTenant: { fields: { tenantId: 'string' } }
      }
    }
  }
}));
```

---

## ❓ FAQ

### Getting Started

<details>
<summary><strong>What is OIDC and how does it differ from OAuth2?</strong></summary>

**OAuth2** = Authorization (what you can do)
**OIDC** = Authentication (who you are) built on OAuth2

**OIDC adds:**
- ✅ ID tokens with user identity
- ✅ UserInfo endpoint for profile data
- ✅ Standard claims (name, email, picture)
- ✅ Discovery endpoint for auto-configuration

**Token comparison:**

| Token | Purpose | Contains |
|-------|---------|----------|
| **access_token** | API authorization | Scopes, permissions |
| **id_token** | User authentication | Name, email, profile |
| **refresh_token** | Get new tokens | Opaque string |

**[→ Learn more: Architecture Guide](./identity/architecture.md)**
</details>

<details>
<summary><strong>When should I use IdentityPlugin vs Azure AD/Keycloak?</strong></summary>

**Use IdentityPlugin when:**
- ✅ Need full control over authentication
- ✅ Want S3 as backend (simple, serverless)
- ✅ Self-hosted infrastructure
- ✅ Budget constraints (free)
- ✅ Simple microservices architecture
- ✅ Custom authentication flows

**Use Azure AD/Keycloak when:**
- ✅ Need social login (Google, Facebook, GitHub)
- ✅ Need SAML/LDAP integration
- ✅ Enterprise compliance (SOC2, ISO 27001)
- ✅ Advanced features (adaptive auth, risk-based MFA)
- ✅ Already invested in ecosystem

**💡 Pro tip:** IdentityPlugin tokens work with Azure AD clients! Your Resource Servers can validate tokens from multiple providers.

**[→ Learn more: Integration Guide](./identity/integration.md)**
</details>

<details>
<summary><strong>Is this production-ready?</strong></summary>

**Yes!** Includes:

**Security:**
- ✅ RS256 JWT signing (asymmetric keys)
- ✅ PKCE support for public clients
- ✅ Refresh token rotation
- ✅ Token revocation (RFC 7009)
- ✅ Rate limiting
- ✅ CORS with credentials
- ✅ Security headers (HSTS, CSP)

**Standards:**
- ✅ OAuth2 RFC 6749 compliant
- ✅ OIDC Core 1.0 compliant
- ✅ JWKS (RFC 7517)
- ✅ Token introspection (RFC 7662)
- ✅ Dynamic client registration (RFC 7591)

**Reliability:**
- ✅ S3 as persistent storage
- ✅ Graceful shutdown
- ✅ Error recovery
- ✅ Health checks

**[→ See deployment guide](./identity/configuration.md#production-configuration)**
</details>

<details>
<summary><strong>How do I test my SSO server?</strong></summary>

**1. Check discovery endpoint:**
```bash
curl http://localhost:4000/.well-known/openid-configuration | jq
```

**2. Check JWKS (public keys):**
```bash
curl http://localhost:4000/.well-known/jwks.json | jq
```

**3. Get token (client_credentials):**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'client:secret' | base64)" \
  -d "grant_type=client_credentials" \
  -d "scope=openid profile"
```

**4. Decode token:**
```bash
# Get payload (second part of JWT)
echo $TOKEN | cut -d. -f2 | base64 -d | jq

# Expected claims:
{
  "iss": "http://localhost:4000",  // Your issuer
  "sub": "client-id",               // Subject (user/client)
  "aud": "http://localhost:3001",   // Audience (API)
  "exp": 1234567890,                // Expiration (unix timestamp)
  "scope": "openid profile"
}
```

**5. Test authorization code flow:**
```
http://localhost:4000/oauth/authorize?response_type=code&client_id=my-app&redirect_uri=http://localhost:3000/callback&scope=openid&state=abc123
```

**[→ Complete testing guide](./identity/troubleshooting.md#testing)**
</details>

### Tokens & Security

<details>
<summary><strong>What's the difference between access_token, id_token, and refresh_token?</strong></summary>

| Token | Purpose | Audience | Lifetime | Contains | Use Case |
|-------|---------|----------|----------|----------|----------|
| **access_token** | Authorization | Resource Server (API) | Short (15m) | Scopes, permissions | API requests |
| **id_token** | Authentication | Client app | Short (15m) | User profile, email | User identity |
| **refresh_token** | Token renewal | Authorization Server | Long (7d-90d) | Opaque (nothing) | Get new access_token |

**Example usage:**

```javascript
// User logs in → receive all 3 tokens
const { access_token, id_token, refresh_token } = await login();

// Use access_token for API calls
fetch('https://api.example.com/orders', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});

// Use id_token for user profile
const profile = JSON.parse(atob(id_token.split('.')[1]));
console.log(profile.email, profile.name);

// When access_token expires, use refresh_token
const newTokens = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh_token
  })
});
```

**[→ Learn more: Architecture Guide](./identity/architecture.md#token-types)**
</details>

<details>
<summary><strong>How do I validate tokens in my API (Resource Server)?</strong></summary>

**Use OIDC auto-discovery:**

```javascript
import { OIDCClient } from 's3db.js';

const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'http://localhost:3001'
});

await oidcClient.initialize();  // Auto-fetches JWKS from discovery

// With API Plugin
api.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

// With Express
app.use('/api', oidcClient.middleware.bind(oidcClient));

// Handler
app.get('/api/orders', (req, res) => {
  // req.user contains validated token
  const userId = req.user.sub;
  const scopes = req.user.scope.split(' ');

  if (!scopes.includes('read:orders')) {
    return res.status(403).json({ error: 'Insufficient scopes' });
  }

  // ... fetch orders
});
```

**What it does:**
1. Fetches `/.well-known/openid-configuration` (issuer, JWKS URL)
2. Fetches JWKS public keys for signature verification
3. Validates every incoming JWT token:
   - Signature (RS256 with public key)
   - Issuer matches
   - Audience matches
   - Not expired
   - Not revoked (if introspection enabled)

**[→ Complete integration guide](./identity/integration.md#resource-server)**
</details>

<details>
<summary><strong>How do I revoke tokens?</strong></summary>

**Revoke access_token or refresh_token:**

```bash
curl -X POST http://localhost:4000/oauth/revoke \
  -H "Authorization: Basic $(echo -n 'client:secret' | base64)" \
  -d "token=eyJhbGciOiJSUzI1..." \
  -d "token_type_hint=access_token"
```

**In your app:**

```javascript
// Logout user (revoke refresh token)
async function logout(refreshToken) {
  await fetch('http://localhost:4000/oauth/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa('client:secret')
    },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: 'refresh_token'
    })
  });

  // Clear local tokens
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}
```

**How it works:**
- Tokens are added to revocation list (s3db resource)
- Introspection endpoint checks revocation status
- Resource Servers can optionally introspect tokens
- Expired tokens are auto-cleaned up

**[→ Learn more: Token Revocation](./identity/api-reference.md#token-revocation)**
</details>

<details>
<summary><strong>How do I rotate JWT signing keys?</strong></summary>

**Manual rotation:**

```javascript
await identityPlugin.oauth2.rotateKeys();
```

**Automatic rotation (every 90 days):**

```javascript
setInterval(async () => {
  await identityPlugin.oauth2.rotateKeys();
  console.log('✅ Keys rotated');
}, 90 * 24 * 60 * 60 * 1000);
```

**What happens:**
1. New RSA key pair generated
2. Old key kept in JWKS for grace period (24h)
3. New tokens signed with new key
4. Old tokens still valid (JWKS has both keys)
5. Old key removed after grace period

**Best practices:**
- Rotate every 90 days
- Keep old keys for 24h minimum
- Monitor token validation errors

**[→ Learn more: Key Management](./identity/configuration.md#key-rotation)**
</details>

### Grant Types & Flows

<details>
<summary><strong>Which grant type should I use?</strong></summary>

| Use Case | Grant Type | Client Type | Security |
|----------|-----------|-------------|----------|
| **Web app with backend** | authorization_code | Confidential (has secret) | ⭐⭐⭐⭐⭐ |
| **Mobile app** | authorization_code + PKCE | Public (no secret) | ⭐⭐⭐⭐⭐ |
| **SPA (React/Vue/Angular)** | authorization_code + PKCE | Public | ⭐⭐⭐⭐ |
| **Service-to-service** | client_credentials | Confidential | ⭐⭐⭐⭐⭐ |
| **Desktop app** | authorization_code + PKCE | Public | ⭐⭐⭐⭐ |
| **CLI tool** | device_code* | Public | ⭐⭐⭐⭐ |

*device_code not yet implemented

**Quick decision tree:**

```
Has user login?
├─ Yes → authorization_code
│  └─ Has backend?
│     ├─ No (SPA/Mobile) → + PKCE
│     └─ Yes → Optional PKCE (recommended)
└─ No → client_credentials (service-to-service)
```

**[→ Learn more: Grant Types](./identity/architecture.md#grant-types)**
</details>

<details>
<summary><strong>What is PKCE and do I need it?</strong></summary>

**PKCE (Proof Key for Code Exchange)** = Extra security layer for public clients (SPAs, mobile apps).

**How it works:**
1. Client generates random `code_verifier`
2. Client creates `code_challenge` = SHA256(code_verifier)
3. Authorization request includes `code_challenge`
4. Token request includes original `code_verifier`
5. Server verifies: SHA256(code_verifier) === code_challenge

**When to use:**

| Client Type | PKCE Required? |
|-------------|----------------|
| Mobile app | ✅ **Required** |
| SPA (React/Vue) | ✅ **Required** |
| Web app with backend | ⚠️ **Recommended** |
| Service-to-service | ❌ Not applicable |

**Example:**

```javascript
// Step 1: Generate code_verifier
const codeVerifier = generateRandomString(43);

// Step 2: Generate code_challenge
const encoder = new TextEncoder();
const data = encoder.encode(codeVerifier);
const hash = await crypto.subtle.digest('SHA-256', data);
const codeChallenge = base64UrlEncode(hash);

// Step 3: Authorization request
const authUrl = new URL('http://localhost:4000/oauth/authorize');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
// ... other params

// Step 4: Token request (include original verifier)
const response = await fetch('http://localhost:4000/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    code_verifier: codeVerifier  // Original!
  })
});
```

**[→ Learn more: PKCE Flow](./identity/architecture.md#pkce)**
</details>

<details>
<summary><strong>Can I disable specific grant types?</strong></summary>

**Yes!** Configure `supportedGrantTypes`:

```javascript
// Only authorization_code (no client_credentials, no refresh_token)
await db.use(new IdentityPlugin({
  supportedGrantTypes: ['authorization_code']
}));

// Only service-to-service (no user login)
await db.use(new IdentityPlugin({
  supportedGrantTypes: ['client_credentials']
}));

// Full suite
await db.use(new IdentityPlugin({
  supportedGrantTypes: [
    'authorization_code',
    'client_credentials',
    'refresh_token'
  ]
}));
```

**Per-client restrictions:**

```javascript
// Client configuration
await clients.insert({
  clientId: 'mobile-app',
  grantTypes: ['authorization_code', 'refresh_token'],  // No client_credentials
  requirePkce: true  // Force PKCE for this client
});
```

**[→ Learn more: Grant Type Configuration](./identity/configuration.md#grant-types)**
</details>

### Integration & Deployment

<details>
<summary><strong>Can Resource Servers validate tokens from multiple providers?</strong></summary>

**Yes!** OIDCClient supports multiple issuers:

```javascript
import { OIDCClient } from 's3db.js';

// IdentityPlugin SSO
const internalSSO = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'http://localhost:3001'
});

// Azure AD
const azureAD = new OIDCClient({
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: 'api://YOUR_API_CLIENT_ID'
});

// Keycloak
const keycloak = new OIDCClient({
  issuer: 'http://localhost:8080/realms/production',
  audience: 'orders-api'
});

await internalSSO.initialize();
await azureAD.initialize();
await keycloak.initialize();

// Use all three
api.addAuthDriver('internal', internalSSO.middleware.bind(internalSSO));
api.addAuthDriver('azure', azureAD.middleware.bind(azureAD));
api.addAuthDriver('keycloak', keycloak.middleware.bind(keycloak));

// Path-based routing
api.setAuthRules([
  { path: '/api/internal/**', drivers: ['internal'] },
  { path: '/api/azure/**', drivers: ['azure'] },
  { path: '/api/**', drivers: ['internal', 'azure', 'keycloak'] }  // Any
]);
```

**[→ Learn more: Multi-Provider Setup](./identity/integration.md#multiple-providers)**
</details>

<details>
<summary><strong>How do I deploy to production?</strong></summary>

**Production checklist:**

**1. HTTPS Required:**
```javascript
await db.use(new IdentityPlugin({
  port: 443,
  issuer: 'https://sso.example.com',  // Must be HTTPS!

  security: {
    enabled: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }
}));
```

**2. Environment Variables:**
```bash
ISSUER=https://sso.example.com
PORT=443
S3_CONNECTION_STRING=s3://...
ENCRYPTION_KEY=your-32-char-key
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
```

**3. Load Balancer Health Check:**
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

**4. Key Rotation:**
```javascript
// Auto-rotate every 90 days
setInterval(async () => {
  await identityPlugin.oauth2.rotateKeys();
}, 90 * 24 * 60 * 60 * 1000);
```

**5. Monitoring:**
```javascript
// Log all token requests
identityPlugin.on('token:issued', (event) => {
  console.log('Token issued:', event.clientId, event.grantType);
});

identityPlugin.on('auth:failed', (event) => {
  console.error('Auth failed:', event.error);
});
```

**[→ Complete deployment guide](./identity/configuration.md#production)**
</details>

<details>
<summary><strong>How do I customize the login page?</strong></summary>

**Full whitelabel customization:**

```javascript
await db.use(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',

  ui: {
    branding: {
      companyName: 'Acme Corporation',
      logo: 'https://example.com/logo.png',
      primaryColor: '#007bff',
      backgroundColor: '#f8f9fa'
    },

    customCss: `
      .login-container {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      .login-form {
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      }
    `,

    strings: {
      loginTitle: 'Sign in to your account',
      emailPlaceholder: 'Enter your email',
      passwordPlaceholder: 'Enter your password',
      loginButton: 'Sign In'
    }
  }
}));
```

**[→ Complete UI customization guide](./identity/WHITELABEL.md)**
</details>

### Troubleshooting

<details>
<summary><strong>Token validation fails with "Invalid signature"?</strong></summary>

**Cause:** Resource Server has cached old JWKS (public keys).

**Solution 1: Force JWKS refresh**
```javascript
await oidcClient.fetchJWKS(true);  // Force refresh
```

**Solution 2: Reduce JWKS cache TTL**
```javascript
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'http://localhost:3001',
  jwksCacheTTL: 60000  // 1 minute (default: 1 hour)
});
```

**Solution 3: Check key rotation timing**
```javascript
// Check if keys were just rotated
const jwks = await fetch('http://localhost:4000/.well-known/jwks.json').then(r => r.json());
console.log('Available keys:', jwks.keys.length);
```

**[→ Learn more: Key Rotation](./identity/troubleshooting.md#key-rotation-issues)**
</details>

<details>
<summary><strong>Getting CORS errors?</strong></summary>

**Add your Resource Server origins:**

```javascript
await db.use(new IdentityPlugin({
  cors: {
    enabled: true,
    origin: [
      'http://localhost:3001',  // API
      'http://localhost:3000',  // Frontend
      'https://app.example.com'
    ],
    credentials: true,  // Allow cookies
    methods: ['GET', 'POST', 'OPTIONS']
  }
}));
```

**Wildcard (development only!):**
```javascript
cors: {
  enabled: true,
  origin: '*'  // ⚠️ Not for production!
}
```

**[→ Learn more: CORS Configuration](./identity/troubleshooting.md#cors-issues)**
</details>

<details>
<summary><strong>Users can't log in?</strong></summary>

**Debugging checklist:**

**1. Check user exists and is active:**
```javascript
const user = await db.resources.users.query({ email: 'john@example.com' });
console.log('User found:', user);
console.log('User active:', user.active);
```

**2. Check password (manually test bcrypt):**
```javascript
import bcrypt from 'bcrypt';
const match = await bcrypt.compare('password123', user.password);
console.log('Password match:', match);
```

**3. Check client configuration:**
```javascript
const client = await db.resources.plg_oauth_clients.get('my-app');
console.log('Client active:', client.active);
console.log('Redirect URIs:', client.redirectUris);
console.log('Allowed scopes:', client.allowedScopes);
```

**4. Check redirect URI exact match:**
```javascript
const requestedUri = 'http://localhost:3000/callback';
const allowed = client.redirectUris.includes(requestedUri);
console.log('Redirect URI allowed:', allowed);
```

**5. Enable verbose logging:**
```javascript
await db.use(new IdentityPlugin({
  verbose: true  // Detailed logs
}));
```

**[→ Complete troubleshooting guide](./identity/troubleshooting.md)**
</details>

---

## 🎓 What's Next?

**Choose your path:**

| If you want to... | Start here |
|-------------------|------------|
| 🚀 Build SSO server | [Quick Start](#-quick-start) |
| ⚙️ Configure options | [Configuration Guide](./identity/configuration.md) |
| 🏗️ Understand architecture | [Architecture Guide](./identity/architecture.md) |
| 🔌 Connect an app | [Integration Guide](./identity/integration.md) |
| 🎨 Customize login UI | [Whitelabel Guide](./identity/WHITELABEL.md) |
| 🐛 Fix issues | [Troubleshooting Guide](./identity/troubleshooting.md) |
| 📖 See all endpoints | [API Reference](./identity/api-reference.md) |

**Learning path:**
1. **Beginner:** [Quick Start](#-quick-start) → [Usage Journey](#-usage-journey) → [Common Scenarios](#-common-scenarios)
2. **Intermediate:** [Configuration](./identity/configuration.md) → [Integration](./identity/integration.md) → [Whitelabel](./identity/WHITELABEL.md)
3. **Advanced:** [Architecture](./identity/architecture.md) → [API Reference](./identity/api-reference.md) → [Troubleshooting](./identity/troubleshooting.md)

- **Examples:**
  - [e80-sso-oauth2-server.js](../examples/e80-sso-oauth2-server.js) - Complete SSO server
  - [e81-oauth2-resource-server.js](../examples/e81-oauth2-resource-server.js) - API validating tokens
  - [e82-oidc-web-app.js](../examples/e82-oidc-web-app.js) - Web app with login
  - [e60-oauth2-microservices.js](../examples/e60-oauth2-microservices.js) - Full microservices setup

---

## 🚨 Error Handling

IdentityPlugin surfaces structured `PluginError` objects so API consumers and admin consoles can react consistently.

```javascript
try {
  await identityPlugin._initializeAuthDrivers();
} catch (error) {
  console.error(error.name);       // 'PluginError'
  console.error(error.operation);  // 'initializeAuthDrivers'
  console.error(error.statusCode); // REST-aligned status (e.g. 500)
  console.error(error.retriable);  // Retry hint for schedulers
  console.error(error.suggestion); // Human-friendly remediation
  console.error(error.metadata);   // { driverName, purpose, ... }
}
```

Common structured errors expose:

- **Auth driver misconfiguration** → `statusCode: 500`, `retriable: false`, suggestion to ensure constructors extend `AuthDriver`.
- **Password/email helpers missing** → `statusCode: 500`, guidance to register the built-in helper via plugin options.
- **Token duration/encoding issues** → `statusCode: 400`, suggestion describing accepted formats (e.g. `"15m"`, `"base64url"`).
- **RSA key rotation gaps** → `statusCode: 503`, `retriable: true`, metadata exposing the `purpose` so you can pre-warm key material.

Surface `error.suggestion` inside dashboards or alerts to give operators the next step without digging through logs.

---

## 💬 Need Help?

- **📖 Check the [FAQ](#-faq)** - Most questions answered with examples
- **🔍 Explore [Documentation Hub](#-documentation-hub)** - All guides in one place
- **🎯 Try [Common Scenarios](#-common-scenarios)** - Copy-paste solutions
- **🐛 Found a bug?** - Open an issue on GitHub
- **💡 Have a question?** - Check detailed guides or ask the community

---

## 🔗 Related Documentation

**API Plugin Integration:**
- **[API Plugin](./api.md)** - Build Resource Servers that validate IdentityPlugin tokens
- **[API Authentication](./api/authentication.md)** - OIDC driver for Resource Servers
- **[API Guards](./api/guards.md)** - Row-level security with OIDC tokens
- **[API Deployment](./api/deployment.md)** - Deploy SSO + Resource Servers together

**Complete Guides:**
- **[OAuth2/OIDC Guide](../oauth2-guide.md)** - Complete OAuth2 architecture, testing, troubleshooting

---

> **🎉 Ready to build your SSO?** This plugin gives you enterprise-grade OAuth2/OIDC with zero complexity. Start with one line of code, add features as you grow. Everything is opt-in!
>
> **⭐ Star us on GitHub** if this saved you time!
