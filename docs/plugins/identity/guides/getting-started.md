# 🚀 Getting Started with Identity Plugin

**Prev:** [← README](/plugins/identity/README.md)
**Next:** [Configuration](/plugins/identity/guides/configuration.md)
**Main:** [README](/plugins/identity/README.md) | **All guides:** [Index](/plugins/identity/README.md#-documentation-guides)

> **In this guide:**
> - Installation and setup (3 steps)
> - Create your first SSO server
> - Create users and OAuth2 clients
> - Access OAuth2/OIDC endpoints
> - Multi-instance setup

**Time to read:** 10 minutes
**Difficulty:** Beginner

---

## Quick Reference

| What | When |
|------|------|
| **SSO Server** | Single issuer for all apps |
| **Users Resource** | Authentication accounts with email/password |
| **Clients Resource** | OAuth2 applications that request access |
| **Scopes** | Permissions granted to clients (openid, profile, email, custom) |
| **Grant Types** | Flow types (authorization_code, client_credentials, refresh_token) |

---

## Installation

### Step 1: Install Dependencies

```bash
pnpm install s3db.js hono @hono/node-server
```

**What you're installing:**
- `s3db.js` - S3 document database with IdentityPlugin built-in
- `hono` - Fast, lightweight web framework for OAuth2/OIDC endpoints
- `@hono/node-server` - Node.js server adapter for Hono

### Step 2: Create S3 Database Connection

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-server',
  encryptionKey: 'your-32-char-encryption-key!!'
});

await db.connect();
```

**Connection string formats:**
```javascript
// MinIO (local development)
'http://minioadmin:minioadmin@localhost:9000/bucket'

// AWS S3
's3://ACCESS_KEY:SECRET_KEY@bucket'

// LocalStack (testing)
'http://test:test@localhost:4566/bucket'
```

### Step 3: Install IdentityPlugin

```javascript
await db.usePlugin(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d'
}));

console.log('✅ OAuth2/OIDC server running at http://localhost:4000');
```

**That's it!** Your SSO server is now ready.

---

## Create Your First Server

### Complete Minimal Example

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';

async function main() {
  // 1. Connect to database
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso',
    encryptionKey: 'this-should-be-a-real-secret-key-32'
  });

  await db.connect();

  // 2. Install IdentityPlugin
  await db.usePlugin(new IdentityPlugin({
    port: 4000,
    issuer: 'http://localhost:4000',
    supportedScopes: ['openid', 'profile', 'email'],
    logLevel: 'debug'  // Enable debug logs
  }));

  console.log('✅ SSO Server running!');
  console.log('   Discovery: http://localhost:4000/.well-known/openid-configuration');
  console.log('   Authorize: http://localhost:4000/oauth/authorize');
  console.log('   Token: http://localhost:4000/oauth/token');
}

main().catch(console.error);
```

**Test it:**
```bash
curl http://localhost:4000/.well-known/openid-configuration
```

Expected response:
```json
{
  "issuer": "http://localhost:4000",
  "authorization_endpoint": "http://localhost:4000/oauth/authorize",
  "token_endpoint": "http://localhost:4000/oauth/token",
  "userinfo_endpoint": "http://localhost:4000/oauth/userinfo",
  ...
}
```

---

## Create Users and Clients

### Step 1: Create a User

Users authenticate with email and password:

```javascript
const users = db.resources.users;

await users.insert({
  email: 'admin@example.com',
  password: 'SecurePassword123!',  // Auto-hashed with bcrypt
  name: 'Admin User',
  scopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
  active: true
});

console.log('✅ User created');
```

**User fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User email (unique, case-insensitive) |
| `password` | string | Yes | Plain text password (auto-hashed) |
| `name` | string | No | Display name |
| `scopes` | string[] | Yes | Permissions user can grant to apps |
| `active` | boolean | No | Enable/disable user account |

### Step 2: Create an OAuth2 Client

Clients are applications that request access on behalf of users:

```javascript
const clients = db.resources.plg_oauth_clients;

await clients.insert({
  clientId: 'my-app-123',
  clientSecret: 'super-secret-key-456',
  name: 'My Web Application',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email', 'read:api'],
  grantTypes: ['authorization_code', 'refresh_token'],
  active: true
});

console.log('✅ OAuth2 Client created');
```

**Client fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | string | Yes | Public client identifier |
| `clientSecret` | string | Yes | Secret key (keep confidential!) |
| `name` | string | Yes | Display name |
| `redirectUris` | string[] | Yes | Allowed callback URLs |
| `allowedScopes` | string[] | Yes | Scopes this client can request |
| `grantTypes` | string[] | Yes | Flow types allowed |
| `active` | boolean | No | Enable/disable client |

---

## Available Endpoints

IdentityPlugin provides 9 OAuth2/OIDC endpoints:

### Discovery & Configuration

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/openid-configuration` | GET | OpenID Connect discovery |
| `/.well-known/jwks.json` | GET | Public signing keys (JWKS) |

### Authorization & Tokens

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/oauth/authorize` | GET | Start authorization code flow (shows login UI) |
| `/oauth/token` | POST | Exchange code for tokens |
| `/oauth/userinfo` | GET | Get authenticated user profile |

### Token Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/oauth/introspect` | POST | Validate token |
| `/oauth/revoke` | POST | Revoke token |

### Client Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/oauth/register` | POST | Dynamic client registration |

---

## Test Login Flow

### 1. Direct User to Authorization Endpoint

```bash
# Browser: Redirects to login UI
GET http://localhost:4000/oauth/authorize?
  client_id=my-app-123&
  redirect_uri=http://localhost:3000/callback&
  response_type=code&
  scope=openid%20profile%20email&
  state=xyz123
```

User sees login form → enters email/password → grants permissions → redirected with auth code

### 2. Exchange Auth Code for Tokens

```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE_FROM_STEP_1" \
  -d "client_id=my-app-123" \
  -d "client_secret=super-secret-key-456" \
  -d "redirect_uri=http://localhost:3000/callback"
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "refresh_...",
  "id_token": "eyJhbGc..."
}
```

### 3. Get User Profile

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" \
  http://localhost:4000/oauth/userinfo
```

Response:
```json
{
  "sub": "admin@example.com",
  "email": "admin@example.com",
  "name": "Admin User",
  "email_verified": true
}
```

---

## Multi-Instance Setup

For multiple IdentityPlugin instances (e.g., different tenants), use namespacing:

```javascript
// Tenant A
await db.usePlugin(
  new IdentityPlugin({ port: 4000, issuer: 'http://tenant-a.example.com' }),
  { alias: 'tenant-a' }  // Namespaces all resources
);

// Tenant B
await db.usePlugin(
  new IdentityPlugin({ port: 4001, issuer: 'http://tenant-b.example.com' }),
  { alias: 'tenant-b' }  // Separate namespace
);
```

**Result:**
- Tenant A resources: `plg_tenant-a_identity_*`
- Tenant B resources: `plg_tenant-b_identity_*`
- Completely isolated per tenant

---

## Common Mistakes

### ❌ Mistake 1: Wrong Issuer URL

```javascript
// Wrong - doesn't match actual URL
const plugin = new IdentityPlugin({
  issuer: 'http://localhost:4000'  // But accessing via IP?
});

// Client gets tokens with wrong issuer claim
```

**Fix:** Issuer MUST match how clients access the server:
```javascript
const plugin = new IdentityPlugin({
  issuer: 'https://sso.example.com'  // Must match public URL
});
```

### ❌ Mistake 2: Forgetting to Create Clients

```javascript
// Users exist, but no OAuth2 clients
// Apps can't authenticate!
```

**Fix:** Always create clients before testing:
```javascript
await clients.insert({
  clientId: 'test-client',
  clientSecret: 'test-secret',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile'],
  grantTypes: ['authorization_code']
});
```

### ❌ Mistake 3: Plaintext Encryption Key

```javascript
// Security risk!
const db = new Database({
  connectionString: '...',
  encryptionKey: 'simple'  // Too short, not secure
});
```

**Fix:** Use a 32-character key:
```javascript
const db = new Database({
  connectionString: '...',
  encryptionKey: process.env.ENCRYPTION_KEY  // From env var
});
```

---

## Next Steps

1. **Configure Advanced Options**
   → See [Configuration Guide](/plugins/identity/guides/configuration.md)

2. **Learn Common Scenarios**
   → See [Usage Patterns](/plugins/identity/guides/usage-patterns.md)
   - Development SSO
   - Production setup
   - Mobile apps
   - Multi-tenant SaaS
   - Service-to-service

3. **Integration Details**
   → See [API Reference](/plugins/identity/guides/api-reference.md)

4. **Troubleshooting & FAQ**
   → See [Best Practices & FAQ](/plugins/identity/guides/best-practices.md)

---

## 📚 See Also

- **[Configuration Guide](/plugins/identity/guides/configuration.md)** - All configuration options
- **[Usage Patterns](/plugins/identity/guides/usage-patterns.md)** - 5 real-world scenarios
- **[API Reference](/plugins/identity/guides/api-reference.md)** - Complete endpoint documentation
- **[Best Practices & FAQ](/plugins/identity/guides/best-practices.md)** - Troubleshooting and 30+ Q&A

---

**Ready to dive deeper?** Check [Configuration Guide →](/plugins/identity/guides/configuration.md) for production setup options.
