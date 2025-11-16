# 🔐 Identity Plugin

> **Standards-compliant OAuth2/OIDC Authorization Server for s3db.js**
>
> Compatible with **any OIDC client library** (Passport.js, Spring Security, go-oidc, authlib). Use it like Google OAuth, Azure AD, or Keycloak — but self-hosted on S3.
>
> **Navigation:** [Getting Started →](./guides/getting-started.md) | [OIDC Integration →](./OIDC_INTEGRATION.md) | [Configuration →](./guides/configuration.md) | [Best Practices →](./guides/best-practices.md)

---

## ⚡ TLDR

```javascript
import { Database, IdentityPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

await db.usePlugin(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api']
}));

// 🎉 Full OAuth2/OIDC server ready!
```

**You get instantly:**
- ✅ **9 OAuth2/OIDC endpoints** (discovery, JWKS, token, authorize, userinfo, introspect, revoke, register)
- ✅ **4 grant types** (authorization_code, client_credentials, refresh_token, PKCE)
- ✅ **Purpose-scoped RSA keys** (separate signing and challenge keys)
- ✅ **Built-in login UI** (HTML form for authorization_code flow)
- ✅ **Enterprise features** (token revocation, dynamic client registration, rate limiting)
- ✅ **Service-account lifecycle UI** with one-click rotation + audit logs

**Compatible with:**
- ✅ **Any OIDC library** (Passport.js, oidc-client, Spring Security, go-oidc, authlib)
- ✅ **Standard tools** (Postman, Insomnia, OAuth2 Proxy, Keycloak adapters)
- ✅ **Cloud services** that support custom OIDC providers

> **See [OIDC Integration Guide](./OIDC_INTEGRATION.md)** for examples with Node.js, Python, Go, and more.

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js hono @hono/node-server
```

**Optional (by feature):**
- JWT/Crypto: Built-in (Node.js native crypto)
- No additional packages needed!

**Minimum Node.js:** 18.x (for native crypto, Web Streams)

---

## 🚀 Quick Start (3 minutes)

### 1. Install & Initialize

```javascript
import { Database, IdentityPlugin } from 's3db.js';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-server',
  encryptionKey: 'your-32-char-encryption-key!!'
});

await db.connect();

await db.usePlugin(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email']
}));

console.log('✅ SSO running at http://localhost:4000');
```

### 2. Create User & Client

```javascript
// User
await db.resources.users.insert({
  email: 'user@example.com',
  password: 'SecurePassword123!',
  name: 'User Name',
  scopes: ['openid', 'profile', 'email'],
  active: true
});

// OAuth2 Client
await db.resources.plg_oauth_clients.insert({
  clientId: 'my-app',
  clientSecret: 'my-secret',
  name: 'My Application',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email'],
  grantTypes: ['authorization_code', 'refresh_token']
});
```

### 3. Test

```bash
# Discovery
curl http://localhost:4000/.well-known/openid-configuration | jq

# JWKS
curl http://localhost:4000/.well-known/jwks.json | jq

# Authorization flow
http://localhost:4000/oauth/authorize?response_type=code&client_id=my-app&redirect_uri=http://localhost:3000/callback&scope=openid
```

---

## 📚 Documentation Guides

All documentation is organized into focused guides:

### 🎯 For First-Time Users
- **[Getting Started](./guides/getting-started.md)** (10 min) - Installation, setup, first example
  - 3-step installation
  - Create your first SSO server
  - Create users and OAuth2 clients
  - 9 available endpoints
  - Test login flow
  - Common mistakes

### ⚙️ Configuration & Setup
- **[Configuration Guide](./guides/configuration.md)** (10 min) - All configuration options
  - Default configuration object
  - Complete option reference
  - 4 real-world patterns (Development, Production, Mobile, Multi-tenant)
  - Performance tuning
  - Validation checklist

### 💡 Real-World Scenarios
- **[Usage Patterns](./guides/usage-patterns.md)** (20 min) - 5 complete working examples
  - Pattern 1: Development SSO Server
  - Pattern 2: Web App with Backend
  - Pattern 3: Mobile App (PKCE)
  - Pattern 4: Service-to-Service
  - Pattern 5: Multi-Tenant SaaS
  - Grant type selection guide
  - Token handling best practices

### ✅ Best Practices & Troubleshooting
- **[Best Practices & FAQ](./guides/best-practices.md)** (25 min) - Production deployment
  - 5 essential best practices
  - 5 pro tips & tricks
  - Common mistakes with solutions
  - Error scenarios & troubleshooting
  - 40+ FAQ entries across 6 categories

---

## 🎯 Key Features

### OAuth2/OIDC Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/openid-configuration` | GET | OpenID Connect discovery |
| `/.well-known/jwks.json` | GET | Public signing keys (JWKS) |
| `/oauth/authorize` | GET | Start login flow (shows UI) |
| `/oauth/token` | POST | Exchange code for tokens |
| `/oauth/userinfo` | GET | Get authenticated user profile |
| `/oauth/introspect` | POST | Validate and inspect token |
| `/oauth/revoke` | POST | Revoke token |
| `/oauth/register` | POST | Dynamic client registration |
| `/.well-known/s3db-identity.json` | GET | S3DB integration metadata (issuer, JWKS, resources, registration helpers) |

### Security by Default

- ✅ RS256 JWT signing with RSA keys
- ✅ PKCE support for public clients
- ✅ Refresh token rotation option
- ✅ Token revocation (RFC 7009)
- ✅ Rate limiting per endpoint
- ✅ CORS with credentials
- ✅ Security headers (HSTS, CSP)
- ✅ Audit logging (PII-safe)
- ✅ **Service-account aware tokens** (explicit claims that distinguish humans vs clients)

### Enterprise Ready

- ✅ Multi-tenant support (namespaced resources)
- ✅ Custom user/client fields
- ✅ Partition-based organization
- ✅ Event system for monitoring
- ✅ Token key rotation
- ✅ Graceful shutdown
- ✅ Health checks
- ✅ **White-label admin console** with service-account CRUD & rotation

---

## 🔗 Integration Metadata (for ApiPlugin & remote services)

Identity publishes a machine-readable descriptor so other services know how to talk to it. You can fetch it in two ways:

1. **In-process**: `db.pluginRegistry.identity.integration`
2. **HTTPS**: `GET /.well-known/s3db-identity.json`

Example response:

```json
{
  "version": 1,
  "issuedAt": "2024-05-25T18:32:10.000Z",
  "cacheTtl": 3600,
  "issuer": "https://auth.example.com",
  "authorizationUrl": "https://auth.example.com/oauth/authorize",
  "tokenUrl": "https://auth.example.com/oauth/token",
  "userinfoUrl": "https://auth.example.com/oauth/userinfo",
  "jwksUrl": "https://auth.example.com/.well-known/jwks.json",
  "introspectionUrl": "https://auth.example.com/oauth/introspect",
  "supportedScopes": ["openid","profile","email","read:api","write:api"],
  "supportedGrantTypes": ["authorization_code","refresh_token","client_credentials","pkce"],
  "resources": {
    "users": "users",
    "tenants": "tenants",
    "clients": "plg_oauth_clients"
  },
  "clientRegistration": {
    "url": "https://auth.example.com/oauth/register",
    "supportedAuth": ["client_secret_post","client_secret_basic"]
  }
}
```

Use `cacheTtl`/`issuedAt` to decide when to refresh, and rely on HTTP `ETag` headers for conditional requests. When Identity runs side-by-side with ApiPlugin, the API reads the same object directly from the plugin registry.

---

## 🆔 Service Accounts & Admin UX

The admin console (`/admin`) now includes a **Service Accounts** section:

- Create OAuth clients with custom scopes, redirect URIs, and tenant scoping.
- Rotate secrets with one click; the UI shows the new secret exactly once.
- Toggle active/inactive status, list recent rotations, and review audit logs.
- White-label ready (logo/colors/text come from `config.ui`), so the console feels native to your product.

Tokens issued via `client_credentials` include a dedicated `service_account` block (clientId, name, scopes, audiences) plus `token_use: "service"`. User tokens carry `token_use: "user"` and user claims (sub/email/tenantId). This makes it trivial for downstream APIs to tell people from automation accounts.

---

## 🔄 Typical Workflows

### Web App with Login

```javascript
// 1. User clicks login
// 2. Redirect to: http://localhost:4000/oauth/authorize?...
// 3. User enters credentials (browser sees built-in UI)
// 4. Redirected back with code: http://localhost:3000/callback?code=abc123
// 5. Backend exchanges code for tokens
// 6. Tokens stored securely (HTTP-only cookie)
// 7. User logged in!
```

See [Usage Patterns](./guides/usage-patterns.md#pattern-2-web-app-backend) for complete code.

### Mobile App with PKCE

```javascript
// 1. App generates PKCE verifier + challenge
// 2. Opens browser with authorization_code + challenge
// 3. User logs in
// 4. Browser redirects back with code
// 5. App exchanges code (with verifier) for tokens
// 6. Tokens stored in secure storage (encrypted)
// 7. App can refresh when needed
```

See [Usage Patterns](./guides/usage-patterns.md#pattern-3-mobile-app-pkce-required) for complete code.

### Service-to-Service

```javascript
// 1. Service gets token directly (no user login)
// 2. POST to /oauth/token with client_credentials
// 3. Receives access_token
// 4. Uses token for API calls
// 5. Can cache token and refresh when needed
```

See [Usage Patterns](./guides/usage-patterns.md#pattern-4-service-to-service-client-credentials) for complete code.

---

## ❓ Quick FAQ

<details>
<summary><strong>Q: What is OIDC?</strong></summary>

**OAuth2** = Authorization (what you can do)
**OIDC** = Authentication (who you are) built on OAuth2

OIDC adds ID tokens with user identity, UserInfo endpoint, standard claims (name, email), and discovery endpoint.

**[→ See complete FAQ](./guides/best-practices.md#-faq)**
</details>

<details>
<summary><strong>Q: Is this production-ready?</strong></summary>

**Yes!** Includes RS256 signing, PKCE support, refresh token rotation, token revocation, rate limiting, CORS, security headers, S3 storage, and error recovery.

**[→ See deployment guide](./guides/best-practices.md#-deployment)**
</details>

<details>
<summary><strong>Q: When should I use this vs Azure AD/Keycloak?</strong></summary>

**Use IdentityPlugin when:**
- Need full control, want S3 backend, self-hosted, budget-conscious, simple microservices

**Use Azure AD/Keycloak when:**
- Need social login, SAML/LDAP, enterprise compliance, advanced features

**[→ See detailed comparison](./guides/best-practices.md#-faq)**
</details>

<details>
<summary><strong>Q: How do I secure tokens?</strong></summary>

**Backend:** HTTP-only secure cookies
**SPA:** sessionStorage (lost when tab closes)
**Mobile:** Encrypted secure storage
**Never:** localStorage (XSS vulnerable)

**[→ See token handling guide](./guides/usage-patterns.md#token-handling-best-practices)**
</details>

<details>
<summary><strong>Q: How do I validate tokens in my API?</strong></summary>

Use OIDCClient with middleware:
```javascript
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'my-api'
});
api.addAuthDriver('oidc', oidcClient.middleware);
```

**[→ See validation guide](./guides/best-practices.md#-faq)**
</details>

---

## 🔗 Common Use Cases

| Use Case | Pattern | Guide |
|----------|---------|-------|
| **Dev/testing SSO** | Minimal setup | [Getting Started](./guides/getting-started.md) |
| **Web app login** | authorization_code | [Usage Patterns](./guides/usage-patterns.md#pattern-2-web-app-backend) |
| **Mobile/SPA** | authorization_code + PKCE | [Usage Patterns](./guides/usage-patterns.md#pattern-3-mobile-app-pkce-required) |
| **Microservices** | client_credentials | [Usage Patterns](./guides/usage-patterns.md#pattern-4-service-to-service-client-credentials) |
| **Multi-tenant** | Partitioned users | [Usage Patterns](./guides/usage-patterns.md#pattern-5-multi-tenant-saas) |
| **Production deploy** | All features | [Configuration](./guides/configuration.md#pattern-2-production-enterprise-setup) |
| **Troubleshooting** | Error solutions | [Best Practices](./guides/best-practices.md#-error-scenarios--troubleshooting) |

---

## 🚀 Next Steps

1. **New to OAuth2/OIDC?** → [Getting Started](./guides/getting-started.md)
2. **Want to configure?** → [Configuration Guide](./guides/configuration.md)
3. **Need code examples?** → [Usage Patterns](./guides/usage-patterns.md)
4. **Going to production?** → [Best Practices](./guides/best-practices.md)
5. **Troubleshooting issue?** → [Best Practices FAQ](./guides/best-practices.md#-faq)

---

## 📖 Full Documentation Index

| Topic | Guide | Time |
|-------|-------|------|
| **Setup** | [Getting Started](./guides/getting-started.md) | 10 min |
| **Configuration** | [Configuration Guide](./guides/configuration.md) | 10 min |
| **Examples** | [Usage Patterns](./guides/usage-patterns.md) | 20 min |
| **Production** | [Best Practices](./guides/best-practices.md) | 25 min |

**Total Reading Time: ~65 minutes for complete understanding**

---

## 🔗 Related Plugins

- **[API Plugin](../api.md)** - Build Resource Servers that validate IdentityPlugin tokens
- **[Audit Plugin](../audit.md)** - Track all authentication events
- **[TTL Plugin](../ttl.md)** - Auto-expire sessions and tokens
- **[Cache Plugin](../cache.md)** - Speed up token validation

---

## 💬 Need Help?

- 📖 Check the [FAQ](./guides/best-practices.md#-faq) - Most questions answered
- 🔍 Read the [guide index](#-documentation-guides) - Find what you need
- 🎯 Try [usage patterns](./guides/usage-patterns.md) - Copy-paste solutions
- 🐛 Found a bug? Open an issue on GitHub
- 💡 Have a question? Check detailed guides or ask the community

---

**Ready to build your SSO?** Start with [Getting Started →](./guides/getting-started.md)
