# 🔐 OIDC Authentication Guide

> **Complete OAuth2/OIDC setup for Azure AD, Google, Keycloak, Auth0, and any OIDC provider**

**Key OIDC enhancements:** Auto token refresh • Continue URL • Provider quirks • Cross-subdomain • Dual-cookie deletion

---

## ⚡ Quick Start (30 seconds)

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://bucket/db' });
await db.connect();

await db.usePlugin(new ApiPlugin({
  auth: {
    driver: 'oidc',
    config: {
      issuer: 'https://accounts.google.com',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: 'http://localhost:3000/auth/callback',
      cookieSecret: process.env.COOKIE_SECRET,  // 32+ characters

      // ✨ Everything else works automatically:
      // - Token refresh (autoRefreshTokens: true)
      // - Continue URL (externalUrl support)
      // - Google quirks (access_type=offline)
      // - Cache-Control headers
      // - Discovery caching
    }
  }
}));
```

**Result:**
- ✅ Users login via Google
- ✅ Sessions **never expire** if active (automatic refresh)
- ✅ After login, return to **original destination**
- ✅ `refresh_token` obtained automatically
- ✅ Production-ready security

---

## 🆕 Key Enhancements

| Feature | Benefit | Status |
|---------|---------|--------|
| **🔄 Implicit Token Refresh** | Active users never see session expiration | ✅ Default |
| **🔗 Continue URL** | Preserves destination after login | ✅ Automatic |
| **🌐 Provider Quirks** | Google, Azure, Auth0 auto-configured | ✅ Automatic |
| **🍪 Dual-Cookie Deletion** | Cross-subdomain logout works | ✅ Automatic |
| **🔒 Cache-Control Headers** | Prevents CDN caching | ✅ Automatic |
| **⚡ Discovery Cache** | Thread-safe, per-request cache | ✅ Automatic |

**All features are backward-compatible and enabled by default.**

---

## 🔥 Security & Scalability Upgrades

**Phase 1 Security & Scalability Improvements** (Inspired by Auth0's express-openid-connect):

| Feature | Benefit | Impact |
|---------|---------|--------|
| **🔐 HKDF Key Derivation** | RFC 5869 - Separate keys for signing/encryption | 🟢 Security |
| **🍪 Cookie Chunking** | Handles large sessions (>4KB) automatically | 🔴 Critical |
| **⏱️ Rolling Duration** | Idle timeout + absolute max (enterprise) | 🟡 UX |

**Why Cookie Chunking is Critical:**
- Without it: OIDC sessions with large tokens can exceed 4KB → **431 Request Header Fields Too Large** errors
- With it: Automatically splits into multiple cookies (`session.0`, `session.1`, etc.) → Zero failures
- **Transparent**: Works with all existing code, zero config changes

**Why HKDF Matters:**
- Before: Direct secret usage → Key reuse vulnerability
- After: Derives separate keys for signing vs encryption → Industry best practice (RFC 5869)
- **No breaking changes**: Existing secrets still work

**Phase 2 Scaling & Performance:**

| Feature | Benefit | Impact |
|---------|---------|--------|
| **💾 External Session Store** | Redis, Memory - Horizontal scaling | 🟣 Enterprise |
| **⚡ WeakMap Token Caching** | Per-request caching - Zero decode overhead | 🟢 Performance |

**Why Session Stores Matter:**
- Without: Sessions stored in cookies (4-40KB) → Large headers, bandwidth waste
- With: Only session ID in cookie (~50 bytes) → 99% smaller, shareable across instances
- **Use cases**: Load balancing, Kubernetes, serverless, microservices

**Why WeakMap Caching Matters:**
- Without: Session decoded multiple times per request (middleware, routes, hooks)
- With: Decoded once, auto garbage-collected → 2-3x faster middleware chain
- **Zero configuration**: Automatic per-request caching

**Phase 3 Provider Validation & UX:**

| Feature | Benefit | Impact |
|---------|---------|--------|
| **✅ Token Validation** | OIDC spec-compliant validation | 🟢 Security |
| **🎨 Error Pages** | Beautiful, user-friendly error pages | 🟡 UX |
| **🔄 Session Regeneration** | Prevent session fixation attacks | 🟢 Security |

**Why Token Validation Matters:**
- Without: Accepts invalid tokens (security risk)
- With: Full OIDC spec validation (issuer, audience, expiration, nonce)
- **Prevents**: Token replay attacks, issuer spoofing, expired token usage

**Why Error Pages Matter:**
- Without: Generic JSON errors (bad UX)
- With: Beautiful HTML error pages with actionable guidance
- **User-friendly**: "Your session expired" vs "Token validation failed"

**Why Session Regeneration Matters:**
- Without: Same session ID forever (fixation risk)
- With: New session ID on privilege change
- **Use case**: User becomes admin → regenerate session to prevent fixation

**Phase 4 Advanced Security & Enterprise Features:**

| Feature | Benefit | Impact |
|---------|---------|--------|
| **🔍 Provider Compatibility** | Pre-flight validation, early error detection | 🟢 DevEx |
| **👻 Silent Login** | Auto-login if IDP session exists (prompt=none) | 🟡 UX |
| **🔐 PAR (RFC 9126)** | Push authorization params securely | 🟢 Security |
| **🔑 Client Assertion (JWK)** | Asymmetric authentication with private_key_jwt | 🟢 Security |
| **📡 Backchannel Logout** | IDP-initiated logout (multi-device/app) | 🔴 Enterprise |

**Why Provider Compatibility Matters:**
- Without: Runtime failures (unsupported algorithms, missing scopes)
- With: Validation at startup with actionable warnings
- **Detects**: Unsupported signing algorithms, missing endpoints, incompatible features

**Why Silent Login Matters:**
- Without: User must click login every time, even if already logged in at IDP
- With: Automatic silent authentication attempt → better UX
- **Use case**: User visits app, already logged in at Google → Auto-login without prompt

**Why PAR Matters:**
- Without: Authorization params in URL (browser history, logs)
- With: Params pushed to secure endpoint → Short-lived request_uri in URL
- **Required by**: FAPI, Open Banking, some enterprise providers

**Why Client Assertion Matters:**
- Without: Shared secrets (symmetric) → Key rotation risk, compromise impact
- With: Asymmetric keys (RSA/EC/OKP) → Better key management, compliance
- **Use case**: Healthcare, finance, government (regulatory requirements)

**Why Backchannel Logout Matters:**
- Without: User logs out at IDP but app sessions remain active
- With: IDP sends logout token → All app sessions destroyed
- **Use case**: Multi-device security (user logs out on phone → desktop session ends)

---

## 📖 Table of Contents

- [Quick Start](#-quick-start-30-seconds)
- [Key Enhancements](#-key-enhancements)
- [Supported Providers](#-supported-providers)
- [Getting Started](#-getting-started)
  - [Google OAuth2](#google-oauth2)
  - [Azure AD](#azure-ad--entra-id)
  - [Keycloak](#keycloak-open-source)
  - [Auth0](#auth0)
- [Configuration](#-configuration)
  - [Basic Options](#basic-options)
  - [OIDC Enhancement Options](#oidc-enhancement-options)
  - [Session Management](#session-management)
  - [Security Options](#security-options)
- [Features Deep Dive](#-features-deep-dive)
  - [Implicit Token Refresh](#-implicit-token-refresh)
  - [Continue URL Pattern](#-continue-url-pattern)
  - [Provider Quirks](#-provider-quirks-auto-configuration)
  - [Dual-Cookie Deletion](#-dual-cookie-deletion)
  - [Cache-Control Headers](#-cache-control-headers)
  - [Discovery Cache](#-discovery-cache)
- [Advanced Features](#-advanced-features)
  - [HKDF Key Derivation](#hkdf-key-derivation)
  - [Cookie Chunking](#cookie-chunking)
  - [Rolling Session Duration](#rolling-session-duration)
  - [External Session Store](#external-session-store)
  - [WeakMap Token Caching](#weakmap-token-caching)
  - [Token Validation](#token-validation)
  - [User-Friendly Error Pages](#user-friendly-error-pages)
  - [Session Regeneration](#session-regeneration)
  - [Provider Compatibility Validation](#provider-compatibility-validation-phase-4)
  - [Silent Login (prompt=none)](#silent-login-promptnone-phase-4)
  - [PAR - Pushed Authorization Requests](#par---pushed-authorization-requests-phase-4)
  - [Client Assertion with JWK](#client-assertion-with-jwk-phase-4)
  - [Backchannel Logout](#backchannel-logout-phase-4)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)

---

## 🌐 Supported Providers

**Works with ANY OIDC-compliant provider:**

| Category | Providers |
|----------|-----------|
| **Enterprise** | Azure AD, Google Workspace, Okta |
| **Open Source** | Keycloak, Authentik, Authelia, Ory Hydra |
| **SaaS** | Auth0, AWS Cognito, FusionAuth, SuperTokens |
| **Social** | Google, GitHub (with limitations), GitLab |

---

## 🚀 Getting Started

### Google OAuth2

**1. Get credentials:**
- Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- Create OAuth 2.0 Client ID
- Add redirect URI: `http://localhost:3000/auth/callback`

**2. Configure:**

```javascript
auth: {
  driver: 'oidc',
  config: {
    issuer: 'https://accounts.google.com',
    clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    clientSecret: 'YOUR_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/auth/callback',
    cookieSecret: process.env.COOKIE_SECRET,

    // ✅ Google quirks applied automatically:
    // - access_type=offline (required for refresh_token)
    // - prompt=consent (required on first login)
  }
}
```

**3. Environment variables:**

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
COOKIE_SECRET=your-32-character-secret-here-min
```

---

### Azure AD / Entra ID

**1. Get credentials:**
- Go to [Azure Portal](https://portal.azure.com/) → App Registrations
- Create new registration
- Add redirect URI: `http://localhost:3000/auth/callback`

**2. Configure (Option A - Manual):**

```javascript
auth: {
  driver: 'oidc',
  config: {
    issuer: 'https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0',
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/auth/callback',
    cookieSecret: process.env.COOKIE_SECRET,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
  }
}
```

**2. Configure (Option B - Provider Preset):**

```javascript
auth: {
  driver: 'oidc',
  config: {
    provider: 'azure',  // Auto-configures issuer + scopes!
    tenantId: process.env.AZURE_TENANT_ID,  // or 'common'/'organizations'
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    redirectUri: 'http://localhost:3000/auth/callback',
    cookieSecret: process.env.COOKIE_SECRET,
  }
}
```

---

### Keycloak (Open Source)

**1. Setup Keycloak:**
- Create realm
- Create client (confidential)
- Add redirect URI: `http://localhost:3000/auth/callback`

**2. Configure:**

```javascript
auth: {
  driver: 'oidc',
  config: {
    issuer: 'https://keycloak.example.com/realms/myrealm',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    redirectUri: 'http://localhost:3000/auth/callback',
    cookieSecret: process.env.COOKIE_SECRET,
  }
}
```

**Docker Compose:**

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
    command: start-dev
```

---

### Auth0

**1. Get credentials:**
- Go to [Auth0 Dashboard](https://manage.auth0.com/) → Applications
- Create Regular Web Application
- Add redirect URI: `http://localhost:3000/auth/callback`

**2. Configure:**

```javascript
auth: {
  driver: 'oidc',
  config: {
    issuer: 'https://YOUR_DOMAIN.auth0.com',
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/auth/callback',
    cookieSecret: process.env.COOKIE_SECRET,
    audience: 'https://api.example.com',  // Required for non-opaque tokens
  }
}
```

**Or use preset:**

```javascript
config: {
  provider: 'auth0',
  domain: 'YOUR_DOMAIN.auth0.com',
  audience: 'https://api.example.com',
  // ... rest auto-configured
}
```

---

## ⚙️ Configuration

### Basic Options

```javascript
config: {
  // Provider
  issuer: 'https://accounts.google.com',              // REQUIRED
  clientId: 'your-client-id',                         // REQUIRED
  clientSecret: 'your-client-secret',                 // REQUIRED
  redirectUri: 'http://localhost:3000/auth/callback', // REQUIRED

  // Security
  cookieSecret: process.env.COOKIE_SECRET,            // REQUIRED (32+ chars)

  // Scopes
  scopes: ['openid', 'profile', 'email', 'offline_access'],  // Default

  // User management
  autoCreateUser: true,                               // Create user on first login
  defaultRole: 'user',                                // Default role for new users
}
```

### OIDC Enhancement Options

```javascript
config: {
  // ✨ NEW: Implicit token refresh (default: enabled)
  autoRefreshTokens: true,           // Active users never see expiration
  refreshThreshold: 300000,          // Refresh 5 min before expiry (ms)

  // ✨ NEW: Continue URL support (reverse proxy)
  externalUrl: 'https://api.example.com',  // Public-facing URL

  // ✨ NEW: Cross-subdomain authentication
  cookieDomain: '.example.com',      // Share auth across *.example.com

  // Provider quirks applied automatically based on issuer
  // Google: access_type=offline, prompt=consent
  // Azure: prompt=select_account
  // Auth0: audience parameter
  // GitHub: removes offline_access scope
}
```

### Session Management

```javascript
config: {
  // Session duration
  rollingDuration: 86400000,         // 24 hours idle timeout (default)
  absoluteDuration: 604800000,       // 7 days max session (default)

  // Cookie options
  cookieSecure: true,                // HTTPS only (production)
  cookieSameSite: 'Lax',            // CSRF protection
  cookiePath: '/',                   // Cookie path
}
```

### Security Options

```javascript
config: {
  // Cookie security
  cookieSecret: process.env.COOKIE_SECRET,  // REQUIRED: 32+ characters
  cookieSecure: process.env.NODE_ENV === 'production',  // HTTPS in prod
  cookieSameSite: 'Lax',                   // 'Strict', 'Lax', 'None'
  cookieDomain: '.example.com',            // Cross-subdomain

  // PKCE (Proof Key for Code Exchange)
  usePKCE: true,                           // Enable PKCE (default)

  // Discovery
  discovery: { enabled: true },            // Auto-discover endpoints (default)

  // Logging
  verbose: false,                          // Debug logs
}
```

---

## 🎯 Features Deep Dive

### 🔄 Implicit Token Refresh

**Problem:** Traditional sessions expire after fixed time, forcing users to re-authenticate during active use.

**Solution:** Automatic token refresh 5 minutes before expiry.

**How it works:**
1. User logs in → receives `access_token` (60 min) + `refresh_token`
2. At 55 minutes, middleware silently refreshes tokens
3. New tokens issued → session updated → **user never sees expiration**

**Configuration:**

```javascript
config: {
  autoRefreshTokens: true,     // Enable (default: true)
  refreshThreshold: 300000,    // 5 min before expiry (default)

  // See logs with verbose: true
  verbose: true  // "[OIDC] Token refreshed implicitly: { timeUntilExpiry: 240 }"
}
```

**Disable for security-critical apps:**

```javascript
config: {
  autoRefreshTokens: false,    // Disable automatic refresh
  rollingDuration: 900000,     // 15 min idle timeout
  absoluteDuration: 3600000,   // 1 hour max session
}
```

---

### 🔗 Continue URL Pattern

**Problem:** Users redirected to fixed post-login URL, losing original destination.

**Solution:** Preserves original URL (including query strings and hash fragments).

**Example:**
```
User visits:     /dashboard?tab=settings#profile
After login:     /dashboard?tab=settings#profile ✅
```

**Reverse proxy support:**

```javascript
config: {
  externalUrl: 'https://api.example.com',  // Public URL
  redirectUri: 'https://api.example.com/auth/callback',

  // Continue URL uses external URL, not internal service URL
}
```

---

### 🌐 Provider Quirks (Auto-Configuration)

**Problem:** Different providers require provider-specific parameters.

**Solution:** Automatic detection and configuration based on `issuer`.

| Provider | Detection | Auto-Added | Purpose |
|----------|-----------|------------|---------|
| **Google** | `accounts.google.com` | `access_type=offline`<br>`prompt=consent` | Required for `refresh_token` |
| **Azure AD** | `login.microsoftonline.com` | `prompt=select_account` | Better UX (account picker) |
| **Auth0** | `.auth0.com` | `audience=<config.audience>` | Non-opaque tokens |
| **GitHub** | `github.com` | Removes `offline_access` | GitHub doesn't support it |
| **Slack** | `slack.com` | `team=<config.teamId>` | Pre-select workspace |
| **GitLab** | `gitlab.com` | Adds `read_user` scope | Required for user info |

**No configuration needed** - quirks applied automatically!

---

### 🍪 Dual-Cookie Deletion

**Problem:** When using `cookieDomain`, logout only deletes host-only cookie, leaving domain cookie intact.

**Solution:** Deletes both host-only AND domain-scoped cookies automatically.

```javascript
config: {
  cookieDomain: '.example.com',  // Enable cross-subdomain

  // Logout now deletes BOTH:
  // 1. Host-only cookie (domain not set)
  // 2. Domain-scoped cookie (domain=.example.com)
}
```

**Before these enhancements:** User stuck logged in after logout
**After these enhancements:** Clean logout ✅

---

### 🔒 Cache-Control Headers

**Problem:** CDNs/proxies cache authenticated responses, leaking data between users.

**Solution:** Automatic `Cache-Control` headers on all authenticated responses.

```http
Cache-Control: private, no-cache, no-store, must-revalidate
```

- `private` - Only browser can cache
- `no-cache` - Revalidate before using cache
- `no-store` - Don't store in cache
- `must-revalidate` - Strict cache validation

**No configuration needed** - applied automatically!

---

### ⚡ Discovery Cache

**Problem:** OIDC discovery endpoint called multiple times per request, causing race conditions.

**Solution:** Per-request context-based caching.

```javascript
// Discovery called once per request, cached in Hono context
// Thread-safe, no race conditions
// Automatic - no configuration needed
```

**Disable discovery (use static endpoints):**

```javascript
config: {
  discovery: { enabled: false },
  authorizationEndpoint: '...',  // Manual endpoints
  tokenEndpoint: '...',
}
```

---

## 🔧 Common Configurations

### Reverse Proxy

```javascript
config: {
  externalUrl: 'https://api.example.com',  // Public URL
  redirectUri: 'https://api.example.com/auth/callback',
}
```

### Cross-Subdomain Auth

```javascript
config: {
  cookieDomain: '.example.com',  // Share across *.example.com
  cookieSecure: true,            // HTTPS required
  cookieSameSite: 'Lax',
}
```

### Short-Lived Sessions

```javascript
config: {
  autoRefreshTokens: false,     // Disable implicit refresh
  rollingDuration: 900000,      // 15 min idle timeout
  absoluteDuration: 3600000,    // 1 hour max session
}
```

### Custom Post-Login Logic

```javascript
config: {
  onUserAuthenticated: async ({ user, created, context }) => {
    if (created) {
      // New user - create profile
      await db.resources.profiles.insert({
        id: `profile-${user.id}`,
        userId: user.id,
      });
    }

    // Set API token cookie
    context.cookie('api_token', user.apiToken, {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60  // 7 days
    });
  }
}
```

---

## 🔧 Advanced Features

### HKDF Key Derivation

**What it is:** HMAC-based Extract-and-Expand Key Derivation Function (RFC 5869)

**Why we use it:**
- **Security Best Practice**: Derives separate keys from a single secret
- **Prevents Key Reuse**: Signing key ≠ Encryption key
- **Industry Standard**: Same approach used by Auth0, Okta, AWS

**How it works:**
```javascript
// Before the upgrade
const secret = Buffer.from(cookieSecret);
await signJWT(data, secret);  // Direct secret usage

// After the upgrade
import { deriveOidcKeys } from './concerns/crypto.js';
const { current } = deriveOidcKeys(cookieSecret);
await signJWT(data, current.signing);      // Derived signing key
await encrypt(data, current.encryption);   // Derived encryption key
```

**Benefits:**
- ✅ Separate keys for signing vs encryption (security)
- ✅ Key rotation support (array of secrets)
- ✅ No breaking changes (existing secrets work)
- ✅ Zero configuration needed

**Key Rotation Example:**
```javascript
config: {
  // Sign with first (newest), verify with any
  cookieSecret: [
    'new-secret-32-chars-long!!!!!!!!!',  // Current
    'old-secret-32-chars-long!!!!!!!!!'   // Previous (still valid)
  ]
}
```

---

### Cookie Chunking

**The Problem:**
- Browser cookie limit: **4096 bytes** per cookie
- OIDC sessions can exceed this (ID token + access token + refresh token = 5-8KB)
- Result: **431 Request Header Fields Too Large** errors

**The Solution:**
Automatically splits large cookies into multiple chunks:
- `session.0` (4000 bytes)
- `session.1` (4000 bytes)
- `session.2` (remaining bytes)
- `session.__chunks` (metadata: "3")

**Example:**
```javascript
// Session JWT: 8192 bytes (too large!)
setChunkedCookie(c, 'oidc_session', sessionJWT, {
  httpOnly: true,
  secure: true,
  maxAge: 604800
});

// Result in browser:
// ✅ oidc_session.0 = "eyJhbGc..." (4000 bytes)
// ✅ oidc_session.1 = "iOiJKV1Q..." (4000 bytes)
// ✅ oidc_session.2 = "dCI6MTY..." (192 bytes)
// ✅ oidc_session.__chunks = "3"

// Reading is automatic:
const sessionJWT = getChunkedCookie(c, 'oidc_session');
// Returns: full 8192-byte JWT (reassembled transparently)
```

**Benefits:**
- ✅ Zero configuration needed
- ✅ Handles sessions up to 40KB (10 chunks)
- ✅ Automatic cleanup of old chunks
- ✅ Works with all OIDC providers
- ✅ No breaking changes

**When does it activate?**
- Automatically when session > 4KB
- Common with Azure AD (large tokens)
- Also with Google (many scopes)
- Custom claims in tokens

**Monitoring:**
```javascript
// Check if your sessions are being chunked
console.log('Session size:', Buffer.byteLength(sessionJWT, 'utf8'));
// > 4000 bytes → Cookie chunking active
```

---

### Rolling Session Duration

**Enterprise Feature:** Idle timeout + absolute maximum

```javascript
config: {
  rollingDuration: 1800000,    // 30 min idle timeout
  absoluteDuration: 86400000,  // 24 hour max lifetime
}
```

**How it works:**
- **Idle timeout**: Session extends on activity (last_activity + rollingDuration)
- **Absolute max**: Session never exceeds this (issued_at + absoluteDuration)
- **Whichever comes first**: Session expires at earliest of both

**Use cases:**
- Banking: 15 min idle, 8 hour max
- Healthcare: 30 min idle, 12 hour max
- Enterprise: 1 hour idle, 24 hour max

**Example:**
```javascript
// User logs in at 9:00 AM
issued_at = 9:00 AM
last_activity = 9:00 AM

// User active at 9:25 AM (within 30 min idle)
last_activity = 9:25 AM  // Session extends to 9:55 AM

// User inactive until 10:00 AM
// Session expires (9:25 AM + 30 min = 9:55 AM)

// BUT: Even with activity, session expires at 9:00 PM (absolute 24h max)
```

---

### External Session Store

**The Problem:**
- **Cookie-based sessions**: 4-40KB in cookies → Large HTTP headers, bandwidth waste
- **No horizontal scaling**: Sessions only available on server that issued them
- **Serverless limitations**: Cookies must fit in CloudFront limits (8KB)

**The Solution:**
External session storage with Redis, Memcached, or MongoDB:
- Cookie contains only **session ID** (~50 bytes)
- Session data stored externally (shareable across instances)
- **99% smaller** cookies → Faster requests, lower bandwidth

**Quick Start:**
```javascript
import { RedisStore } from 's3db.js/plugins/api/concerns/session-store';
import { createClient } from 'redis';

// 1. Create Redis client
const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

// 2. Create session store
const sessionStore = new RedisStore({
  client: redis,
  prefix: 'session:',     // Key prefix (default: 'session:')
  serializer: JSON        // Custom serializer (default: JSON)
});

// 3. Use in OIDC config
config: {
  sessionStore,           // ← Add this line
  // ... rest of config
}
```

**Available Stores:**

| Store | Use Case | Persistence | Horizontal Scaling |
|-------|----------|-------------|-------------------|
| `MemoryStore` | Development, testing | ❌ Restart wipes data | ❌ Local only |
| `RedisStore` | Production, high-throughput | ✅ In-memory (volatile) | ✅ Yes |
| `S3DBSessionStore` | Production, S3-backed | ✅ Persistent (S3) | ✅ Yes |
| Custom (MongoDB, PostgreSQL) | Custom backends | ✅ Yes | ✅ Yes |

**Quick Comparison:**
- **MemoryStore**: Dev/testing only (fast, loses data on restart)
- **RedisStore**: Production default (fastest, volatile but with persistence options)
- **S3DBSessionStore**: Persistent sessions in your existing s3db.js database
- **Custom**: Use any backend (MongoDB, PostgreSQL, etc.)

**MemoryStore Example** (Testing Only):
```javascript
import { MemoryStore } from 's3db.js/plugins/api/concerns/session-store';

const sessionStore = new MemoryStore({
  maxSessions: 10000,     // LRU eviction (default: 10000)
  verbose: false          // Debug logging
});

config: {
  sessionStore,
  // ... rest of config
}
```

**RedisStore Example** (Production):
```javascript
import { RedisStore } from 's3db.js/plugins/api/concerns/session-store';
import { createClient } from 'redis';

const redis = createClient({
  url: 'redis://redis:6379',
  password: process.env.REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 5000)
  }
});

await redis.connect();

const sessionStore = new RedisStore({
  client: redis,
  prefix: 'oidc:session:',
  verbose: true
});

config: {
  sessionStore,
  cookieMaxAge: 86400000,  // Session TTL (24 hours)
  // ... rest of config
}
```

**Custom Store** (Implement `SessionStore` interface):
```javascript
import { SessionStore } from 's3db.js/plugins/api/concerns/session-store';

class MongoSessionStore extends SessionStore {
  constructor(mongoClient, collection) {
    super();
    this.collection = mongoClient.db().collection(collection);
  }

  async get(sessionId) {
    const doc = await this.collection.findOne({ _id: sessionId });
    if (!doc) return null;
    if (doc.expiresAt < new Date()) {
      await this.destroy(sessionId);
      return null;
    }
    return doc.data;
  }

  async set(sessionId, sessionData, ttl) {
    await this.collection.updateOne(
      { _id: sessionId },
      {
        $set: {
          data: sessionData,
          expiresAt: new Date(Date.now() + ttl)
        }
      },
      { upsert: true }
    );
  }

  async destroy(sessionId) {
    await this.collection.deleteOne({ _id: sessionId });
  }

  async touch(sessionId, ttl) {
    await this.collection.updateOne(
      { _id: sessionId },
      { $set: { expiresAt: new Date(Date.now() + ttl) } }
    );
  }
}
```

**S3DB Session Store** (Using s3db.js Resources):
```javascript
// OIDC configuration with S3DB session store
{
  driver: 'oidc',
  config: {
    issuer: 'https://accounts.google.com',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    redirectUri: 'http://localhost:3000/auth/callback',

    // 🎯 Session store using S3DB resource driver
    sessionStore: {
      driver: 's3db',          // ← Use s3db.js resource
      config: {
        resourceName: 'oidc_sessions'  // ← Resource to use
      }
    },

    cookieMaxAge: 86400000,    // 24 hours
    // ... rest of OIDC config
  }
}
```

**Setup Requirements:**
```javascript
import { Database } from 's3db.js';

const db = new Database({ /* ... */ });
await db.connect();

// 1. Create OIDC sessions resource (optional - auto-created if missing)
await db.createResource({
  name: 'oidc_sessions',
  attributes: {
    expiresAt: 'string|required',  // Required for TTL cleanup
    userId: 'string',
    email: 'string'
  }
});

// 2. Configure API plugin - the factory handles resource lookup
const apiPlugin = new APIPlugin({
  auth: {
    drivers: [
      {
        driver: 'oidc',
        config: {
          // ... OIDC settings ...
          sessionStore: {
            driver: 's3db',
            config: {
              resourceName: 'oidc_sessions'
            }
          }
        }
      }
    ]
  }
});

// 3. Resource must exist on db by the time auth is initialized
await apiPlugin.initialize(db);
```

**Benefits:**
- ✅ 99% smaller cookies (50 bytes vs 4-40KB)
- ✅ Horizontal scaling (load balancers, Kubernetes)
- ✅ Shared sessions across microservices
- ✅ Faster requests (smaller headers)
- ✅ Lower bandwidth costs
- ✅ Serverless-compatible (CloudFront limits)

**When to Use Each Store:**

```
My app is in...          Best Choice              Why?
─────────────────────────────────────────────────────────────
Development              MemoryStore              Simple, no setup
Testing/CI               MemoryStore              Fast, clean state
Production, single app   RedisStore               Industry standard
Production, microservices RedisStore               Shared via network
S3-centric app           S3DBSessionStore         Uses existing DB
Custom backend           Custom (MongoDB/etc)     Full control
```

**Choosing a Store Quickly:**
1. **Do you already use s3db.js?** → Use `S3DBSessionStore` ✨
2. **Need production reliability?** → Use `RedisStore` 🚀
3. **Just testing/developing?** → Use `MemoryStore` ⚡
4. **Custom requirements?** → Implement `SessionStore` interface 🔧

**Monitoring:**
```javascript
// Redis keys
await redis.keys('session:*');  // List all sessions

// MemoryStore stats
console.log(sessionStore.getStats());
// { count: 42, maxSessions: 10000 }
```

**Cleanup:**
```javascript
// Clear all sessions (testing)
await sessionStore.clear();
```

**S3DBSessionStore Cleanup and Monitoring:**
```javascript
// List all expired sessions for cleanup
const allSessions = await db.resources.oidc_sessions.query();
const now = new Date();
const expiredSessions = allSessions.filter(
  s => new Date(s.expiresAt) < now
);

console.log(`Found ${expiredSessions.length} expired sessions`);

// Delete expired sessions (optional, can be automated with TTL plugin)
for (const session of expiredSessions) {
  await db.resources.oidc_sessions.delete(session.id);
}

// Get session stats
const stats = await db.resources.oidc_sessions.list({ limit: 1 });
console.log(`Total sessions: ${stats.total}`);
console.log(`Active sessions: ${allSessions.filter(s => new Date(s.expiresAt) >= now).length}`);
```

**Pro Tip:** Use the **TTL Plugin** to automatically cleanup expired sessions:
```javascript
import { TTLPlugin } from 's3db.js/plugins/ttl.plugin';

const ttlPlugin = new TTLPlugin({
  // auto-delete sessions where expiresAt < now
  resources: {
    oidc_sessions: {
      field: 'expiresAt'  // Use this field for expiration
    }
  }
});

await db.usePlugin(ttlPlugin);
```

---

### WeakMap Token Caching

**The Problem:**
- Session decoding happens **multiple times per request**:
  - Authentication middleware
  - Authorization middleware
  - Route handler
  - Response hooks
- Each decode = JWT verify + JSON parse → **2-5ms overhead per decode**
- Result: **8-20ms wasted** per request on repetitive work

**The Solution:**
Per-request caching using `WeakMap`:
- Decode session **once** per request
- Cache result tied to request object
- **Automatic garbage collection** when request completes
- Zero configuration needed

**How it works:**
```javascript
// Internal implementation (automatic)
const sessionCache = new WeakMap();

async function getCachedSession(context, cookieName) {
  // Check cache first
  if (sessionCache.has(context)) {
    return sessionCache.get(context);  // ← Cache hit (no decode)
  }

  // Cache miss: decode and store
  const sessionCookie = getChunkedCookie(context, cookieName);
  if (!sessionCookie) return null;

  const session = await decodeSession(sessionCookie);
  if (session) {
    sessionCache.set(context, session);  // ← Store for this request
  }
  return session;
}

// When request completes → WeakMap auto garbage-collects
```

**Performance Impact:**

| Scenario | Without Cache | With Cache | Improvement |
|----------|--------------|------------|-------------|
| 1 decode/request | 5ms | 5ms | 0% |
| 2 decodes/request | 10ms | 5ms | **50%** |
| 3 decodes/request | 15ms | 5ms | **67%** |
| 4 decodes/request | 20ms | 5ms | **75%** |

**Common multi-decode scenarios:**
1. **Middleware chain**: Auth → RBAC → Rate limit → Route
2. **Hook cascade**: onRequest → onPreHandler → onResponse
3. **Nested routes**: Parent route checks auth, child route checks permissions
4. **Logging/metrics**: Multiple middlewares logging user context

**Benefits:**
- ✅ **Zero configuration** (automatic)
- ✅ **2-3x faster** middleware chains
- ✅ **Automatic cleanup** (WeakMap)
- ✅ **Memory safe** (no leaks)
- ✅ **Request-scoped** (no cross-request contamination)

**Why WeakMap?**
- Traditional cache: Risk of memory leaks (must manually clean up)
- WeakMap: **Automatic garbage collection** when request object is freed
- **Zero maintenance**: No cleanup code needed

**Verification:**
```javascript
// Enable verbose logging to see cache hits
config: {
  verbose: true
}

// Output:
// [OIDC] Session decoded (cache miss)
// [OIDC] Session retrieved (cache hit) ← No decode!
// [OIDC] Session retrieved (cache hit) ← No decode!
```

---

### Token Validation

**The Problem:**
- Basic OIDC implementations skip validation → Security vulnerabilities
- Expired tokens accepted → Session hijacking
- Issuer/audience not validated → Token spoofing
- Nonce not checked → Replay attacks

**The Solution:**
Comprehensive OIDC spec-compliant validation:
- **Issuer (iss)**: Token from correct provider
- **Audience (aud)**: Token intended for this app
- **Expiration (exp)**: Token not expired
- **Issued At (iat)**: Token not too old
- **Nonce**: Prevents replay attacks
- **Subject (sub)**: User identifier present

**Validation Happens Automatically:**
```javascript
// Phase 3: Automatic validation in callback handler
const tokens = await tokenResponse.json();

// 1. Validate token response structure
const tokenValidation = validateTokenResponse(tokens, config);
if (!tokenValidation.valid) {
  // Returns user-friendly error page
}

// 2. Validate ID token claims
const idTokenValidation = validateIdToken(idTokenClaims, config, {
  nonce: stateData.nonce,
  clockTolerance: 60,  // 60 seconds
  maxAge: 86400        // 24 hours
});

if (!idTokenValidation.valid) {
  // Returns user-friendly error page with specific issue
}
```

**Validation Checks:**

| Check | Purpose | Spec Requirement |
|-------|---------|-----------------|
| Issuer | Prevent token from wrong provider | REQUIRED |
| Audience | Ensure token for this app | REQUIRED |
| Expiration | Reject expired tokens | REQUIRED |
| Subject | User identifier present | REQUIRED |
| Nonce | Prevent replay attacks | RECOMMENDED |
| Not Before (nbf) | Respect token activation time | OPTIONAL |
| Issued At (iat) | Detect old tokens | RECOMMENDED |
| AZP | Validate authorized party (multi-audience) | CONDITIONAL |

**Configuration Options:**
```javascript
config: {
  // Validation is automatic, but you can customize:
  errorPage: true,         // Show HTML error pages (default: true)
  verbose: true,           // Log validation failures for debugging

  // Validation tolerances (built-in defaults):
  // - clockTolerance: 60 seconds (exp, iat, nbf)
  // - maxAge: 24 hours (how old can iat be)
}
```

**Benefits:**
- ✅ **OIDC spec-compliant** (RFC 6749, RFC 7519, OpenID Connect Core)
- ✅ **Prevents replay attacks** (nonce validation)
- ✅ **Rejects expired tokens** (exp, iat validation)
- ✅ **Validates token origin** (issuer, audience)
- ✅ **Multi-audience support** (azp validation)
- ✅ **Clock skew tolerance** (60-second default)

---

### User-Friendly Error Pages

**The Problem:**
- Generic error responses: `{ "error": "Authentication failed" }`
- No guidance for users: "What should I do?"
- Technical jargon: "Invalid nonce claim"
- JSON errors in browser: Ugly, confusing

**The Solution:**
Beautiful HTML error pages with actionable guidance:
- **User-friendly titles**: "Session Expired" vs "token_expired"
- **Clear messages**: "Your session has expired. Please sign in again."
- **Action buttons**: "Sign In Again", "Contact Support"
- **Technical details**: Collapsible (for debugging)
- **Responsive design**: Mobile-friendly

**Error Page Types:**

| Error Type | Title | User Action | Example |
|------------|-------|-------------|---------|
| `TOKEN_EXPIRED` | Session Expired | Sign In Again | Token exp < now |
| `TOKEN_INVALID` | Invalid Session | Sign In Again | Malformed JWT |
| `TOKEN_MISSING` | Authentication Required | Sign In | No cookie |
| `ISSUER_MISMATCH` | Configuration Error | Contact Support | Wrong provider |
| `AUDIENCE_MISMATCH` | Configuration Error | Contact Support | Wrong client ID |
| `NONCE_MISMATCH` | Security Error | Try Again | Replay attack |
| `STATE_MISMATCH` | Security Error | Sign In Again | CSRF detected |
| `PROVIDER_ERROR` | Provider Error | Try Again | Provider down |

**Example Error Page:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Session Expired - Authentication Error</title>
  <style>/* Beautiful responsive CSS */</style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">🔒</div>
    <h1>Session Expired</h1>
    <p>Your session has expired. Please sign in again to continue.</p>

    <a href="/auth/login" class="btn btn-primary">Sign In Again</a>
    <a href="/" class="btn btn-secondary">Go Home</a>

    <!-- Technical details (collapsible, only if verbose: true) -->
    <details class="technical-details">
      <summary>Technical Details</summary>
      <ul>
        <li>• Token expired at 2024-01-15T10:30:00Z</li>
        <li>• Current time: 2024-01-15T12:45:00Z</li>
      </ul>
    </details>

    <div class="error-code">Error Code: token_expired</div>
  </div>
</body>
</html>
```

**Automatic Content Negotiation:**
```javascript
// Browser request (Accept: text/html) → HTML error page
// API request (Accept: application/json) → JSON error response

// JSON response example:
{
  "error": {
    "code": "token_expired",
    "title": "Session Expired",
    "message": "Your session has expired. Please sign in again to continue.",
    "userAction": true,
    "details": ["Token expired at 2024-01-15T10:30:00Z"]
  },
  "statusCode": 401
}
```

**Configuration:**
```javascript
config: {
  errorPage: true,         // Enable HTML error pages (default: true)
  verbose: true,           // Show technical details (default: false)

  // Error pages shown for browser requests only
  // API requests always get JSON
}
```

**Customization:**
```javascript
// Disable error pages (always return JSON)
config: {
  errorPage: false
}

// Or handle errors manually in your app
app.use(async (c, next) => {
  try {
    await next();
  } catch (err) {
    if (err.code === 'OIDC_TOKEN_EXPIRED') {
      return c.html('<h1>Custom Error Page</h1>', 401);
    }
    throw err;
  }
});
```

**Benefits:**
- ✅ **User-friendly** (no technical jargon)
- ✅ **Actionable guidance** (clear next steps)
- ✅ **Beautiful design** (responsive, mobile-first)
- ✅ **Content negotiation** (HTML for browsers, JSON for APIs)
- ✅ **Debugging support** (collapsible technical details)
- ✅ **Zero configuration** (works automatically)

---

### Session Regeneration

**The Problem:**
- **Session fixation attacks**: Attacker sets victim's session ID, then waits for victim to login
- **Privilege escalation**: User becomes admin but keeps same session ID
- **Security best practice**: OWASP recommends regenerating session ID on auth level change

**The Solution:**
Regenerate session ID when user privileges change:
- Destroys old session (ID + data in store)
- Creates new session with new ID
- Preserves session data
- Updates cookie

**When to Regenerate:**
1. **Privilege escalation**: User becomes admin
2. **Role changes**: User gets new permissions
3. **Security sensitive operations**: Password reset, 2FA setup
4. **Periodic rotation**: Every N hours (optional)

**Basic Usage:**
```javascript
const oidcDriver = await createOIDCHandler(config);

app.post('/promote-to-admin', async (c) => {
  // 1. Get current session
  const session = c.get('session');

  // 2. Update user privileges
  session.roles = ['admin'];
  session.permissions = ['read', 'write', 'delete'];

  // 3. Regenerate session ID (SECURITY CRITICAL!)
  await oidcDriver.utils.regenerateSession(c, session);

  return c.json({
    success: true,
    message: 'You are now an admin'
  });
});
```

**Real-World Example:**
```javascript
// Password reset flow
app.post('/reset-password', async (c) => {
  const { token, newPassword } = await c.req.json();

  // Verify reset token
  const user = await verifyResetToken(token);
  if (!user) {
    return c.json({ error: 'Invalid token' }, 400);
  }

  // Update password
  await updatePassword(user.id, newPassword);

  // Get current session (if logged in)
  const session = await oidcDriver.utils.getCachedSession(c);

  if (session && session.sub === user.id) {
    // User is logged in - regenerate session for security
    await oidcDriver.utils.regenerateSession(c, session);
  }

  return c.json({ success: true });
});
```

**2FA Setup Example:**
```javascript
app.post('/enable-2fa', async (c) => {
  const session = c.get('session');

  // Enable 2FA for user
  await enable2FA(session.sub);

  // Update session with 2FA flag
  session.twoFactorEnabled = true;

  // Regenerate session (security level increased)
  await oidcDriver.utils.regenerateSession(c, session);

  return c.json({ success: true });
});
```

**Periodic Rotation (Optional):**
```javascript
// Middleware: regenerate every 4 hours
app.use(async (c, next) => {
  const session = c.get('session');

  if (session) {
    const lastRotation = session.lastRotation || session.iat;
    const hoursSinceRotation = (Date.now() / 1000 - lastRotation) / 3600;

    if (hoursSinceRotation > 4) {
      session.lastRotation = Math.floor(Date.now() / 1000);
      await oidcDriver.utils.regenerateSession(c, session);
    }
  }

  await next();
});
```

**Available Utilities:**
```javascript
const oidcDriver = await createOIDCHandler(config);

// 1. Regenerate session ID
await oidcDriver.utils.regenerateSession(c, sessionData);

// 2. Get current session (with caching)
const session = await oidcDriver.utils.getCachedSession(c);

// 3. Delete session (local logout, no provider redirect)
await oidcDriver.utils.deleteSession(c);
```

**How It Works:**
```javascript
async function regenerateSession(c, sessionData) {
  // 1. Delete old session (cookie + store)
  await deleteSessionCookie(c, cookieName);

  // 2. Clear WeakMap cache
  sessionCache.delete(c);

  // 3. Create new session with new ID
  const newSessionId = await encodeSession(sessionData);

  // 4. Set new cookie
  setChunkedCookie(c, cookieName, newSessionId, options);

  // 5. Update cache
  sessionCache.set(c, sessionData);
}
```

**Benefits:**
- ✅ **Prevents session fixation** (attacker can't predict session ID)
- ✅ **OWASP recommended** (security best practice)
- ✅ **Preserves session data** (seamless for user)
- ✅ **Works with external stores** (Redis, Memory)
- ✅ **Automatic cleanup** (old session destroyed)

**Security Notes:**
- **Always regenerate** after privilege changes
- **Never regenerate** on every request (performance impact)
- **Document when you regenerate** (security audit trail)
- **Log regeneration events** (monitoring)

---

### Provider Compatibility Validation (Phase 4)

**The Problem:**
- Runtime failures when provider doesn't support requested features
- Cryptic errors: "Invalid signing algorithm" or "Scope not supported"
- No way to validate configuration before deployment
- Trial-and-error configuration process

**The Solution:**
Pre-flight validation of provider capabilities against your configuration:
- Validates discovery document at startup
- Checks signing algorithms, response types, scopes
- Detects missing endpoints (token, userinfo, logout)
- Returns warnings (non-fatal) and errors (fatal)

**Quick Start:**
```javascript
import { validateProviderCompatibility, getProviderCapabilities } from 's3db.js/plugins/api/concerns/oidc-provider-validator';

// Get discovery document
const discovery = await fetchDiscoveryDocument(config.issuer);

// Validate compatibility
const validation = validateProviderCompatibility(discovery, config);

if (validation.errors.length > 0) {
  console.error('❌ Provider incompatible:', validation.errors);
  process.exit(1);
}

if (validation.warnings.length > 0) {
  console.warn('⚠️ Provider warnings:', validation.warnings);
}

// Check provider capabilities
const capabilities = getProviderCapabilities(discovery);
console.log('Provider supports:', {
  refreshTokens: capabilities.supportsRefreshTokens,
  pkce: capabilities.supportsPKCE,
  scopes: capabilities.supportedScopes,
  algorithms: capabilities.supportedSigningAlgs
});
```

**Validation Checks:**

| Check | Type | Purpose |
|-------|------|---------|
| **ID Token Signing Algorithm** | Warning | Requested algorithm supported by provider |
| **Response Type** | Warning | `code`, `id_token`, etc. supported |
| **Response Mode** | Warning | `query`, `fragment`, `form_post` supported |
| **Scopes** | Warning | Custom scopes available |
| **Grant Types** | Warning | `authorization_code`, `refresh_token` supported |
| **Authorization Endpoint** | Error | Required endpoint exists |
| **Token Endpoint** | Error | Required endpoint exists |
| **PKCE Support** | Warning | S256 code challenge supported (if enabled) |
| **Token Auth Method** | Warning | Client authentication method supported |
| **Claims** | Info | Standard claims available |
| **Refresh Token Support** | Warning | `refresh_token` grant + `offline_access` scope |
| **Userinfo Endpoint** | Info | Userinfo endpoint available |
| **End Session Endpoint** | Info | Logout endpoint available |

**Example Output:**
```javascript
{
  warnings: [
    'ID token signing algorithm "HS256" not listed in provider\'s supported algorithms: RS256, ES256',
    'Custom scope "custom_scope" not listed in provider\'s supported scopes',
    'autoRefreshTokens enabled but provider does not list "refresh_token" in grant_types_supported'
  ],
  errors: [
    'Provider discovery document missing required "token_endpoint"'
  ]
}
```

**Configuration:**
```javascript
config: {
  // Validate at startup (recommended)
  validateProvider: true,  // Enable validation (default: false)

  // Your configuration
  idTokenSigningAlg: 'RS256',
  responseType: 'code',
  scope: 'openid profile email offline_access',
  usePKCE: true,
  autoRefreshTokens: true
}
```

**Provider Capabilities:**
```javascript
const capabilities = getProviderCapabilities(discovery);

// Returns:
{
  hasTokenEndpoint: true,
  hasUserinfoEndpoint: true,
  hasLogoutEndpoint: true,
  hasRevocationEndpoint: false,
  supportsRefreshTokens: true,
  supportsPKCE: true,
  supportedScopes: ['openid', 'profile', 'email', 'offline_access'],
  supportedResponseTypes: ['code', 'code id_token'],
  supportedResponseModes: ['query', 'fragment'],
  supportedGrantTypes: ['authorization_code', 'refresh_token'],
  supportedSigningAlgs: ['RS256', 'ES256'],
  supportedAuthMethods: ['client_secret_basic', 'client_secret_post']
}
```

**Benefits:**
- ✅ **Early error detection** (startup vs runtime)
- ✅ **Actionable warnings** (specific configuration issues)
- ✅ **Provider capability discovery** (feature availability)
- ✅ **Configuration validation** (before deployment)
- ✅ **Debugging support** (clear error messages)

**Use Cases:**
- CI/CD validation (fail build if incompatible)
- Development (catch config errors early)
- Multi-provider support (detect feature availability)
- Documentation (list provider capabilities)

---

### Silent Login (prompt=none) (Phase 4)

**The Problem:**
- Users already logged in at IDP must click "Login" button
- Extra unnecessary step when IDP session exists
- Poor UX for frequently used applications
- Manual login flow even for active users

**The Solution:**
Automatic silent authentication attempt with `prompt=none`:
- Checks if user already has active IDP session
- Attempts silent login in background
- Falls back to interactive login if needed
- Prevents infinite redirect loops

**Quick Start:**
```javascript
config: {
  // Enable silent login
  enableSilentLogin: true,

  // Optional: Restrict to specific paths
  silentLoginPaths: ['/dashboard', '/admin'],

  // Optional: Exclude specific paths
  excludePaths: ['/public', '/login'],

  // ... rest of config
}
```

**How It Works:**
```
1. User visits protected page → Not authenticated
2. shouldAttemptSilentLogin() → Check conditions
3. Redirect to IDP with prompt=none
4. IDP checks active session:
   ✅ Session exists → Redirect back with code
   ❌ No session → Error: login_required
5. If login_required → Redirect to interactive login
6. Set cookie: _silent_login_attempted (prevent loop)
```

**Conditions for Silent Login:**
```javascript
// Silent login attempted if ALL conditions true:
- enableSilentLogin = true
- User not already authenticated
- Cookie _silent_login_attempted not set
- Request accepts text/html (not API)
- Path not in excludePaths
- Path in silentLoginPaths (if specified)
```

**Configuration:**
```javascript
config: {
  enableSilentLogin: true,

  // Path control (optional)
  silentLoginPaths: ['/dashboard', '/profile'],  // Only these paths
  excludePaths: ['/public', '/api'],             // Skip these paths

  // Cookie options
  cookieSecure: true,
  cookieDomain: '.example.com'
}
```

**Error Handling:**
```javascript
// Automatic handling of silent login errors
// Error: login_required → Redirect to interactive login
// Error: consent_required → Redirect to interactive login
// Error: interaction_required → Redirect to interactive login
// Error: account_selection_required → Redirect to interactive login

// Other errors → Show error page
```

**Example Flow:**
```javascript
// 1. User visits dashboard (not logged in)
GET /dashboard

// 2. Silent login attempt
→ Redirect: https://provider.com/authorize?prompt=none&...

// 3. IDP has active session
← Redirect: https://app.com/auth/callback?code=xyz&state=abc

// 4. Exchange code for tokens
→ POST https://provider.com/token

// 5. Create session
← Set-Cookie: oidc_session=...

// 6. User on dashboard (auto-logged in!)
```

**Cookie Management:**
```javascript
// Cookie: _silent_login_attempted
// Purpose: Prevent infinite redirect loops
// TTL: 1 hour (3600000ms)
// Domain: Same as session cookie
// HttpOnly: true
// Secure: true (production)

// Cleared after successful login
// Cleared after interactive login
```

**Benefits:**
- ✅ **Better UX** (no unnecessary login clicks)
- ✅ **SSO-like experience** (seamless re-authentication)
- ✅ **Loop prevention** (cookie-based tracking)
- ✅ **Content negotiation** (HTML only, APIs skip)
- ✅ **Path control** (include/exclude paths)
- ✅ **Automatic fallback** (interactive login if needed)

**Use Cases:**
- Intranet applications (users already logged in to company IDP)
- Multi-app SSO (user logged in to one app, auto-login to others)
- Mobile web apps (user has active Google/Apple session)
- Frequent visitors (improve return user experience)

**Disable Silent Login:**
```javascript
config: {
  enableSilentLogin: false  // Explicit interactive login required
}
```

---

### PAR - Pushed Authorization Requests (Phase 4)

**The Problem:**
- Authorization parameters in URL → Logged in browser history
- Large authorization requests → URL length limits
- Phishing attacks → Malicious redirect_uri modifications
- Regulatory requirements → FAPI compliance (Open Banking, finance)

**The Solution:**
Push authorization parameters to secure endpoint before redirect:
- POST params to PAR endpoint → Receive short-lived request_uri
- Redirect with request_uri only → Clean URL, no sensitive data
- Provider validates params before authorization → Early error detection

**RFC 9126 Compliance:**
```
Standard: Pushed Authorization Requests (PAR)
RFC: 9126
Status: Standards Track (October 2021)
Use Case: Financial-grade API (FAPI), Open Banking
```

**Quick Start:**
```javascript
import { providerSupportsPAR, validatePARConfig } from 's3db.js/plugins/api/concerns/oidc-par';

// 1. Check if provider supports PAR
const discovery = await fetchDiscoveryDocument(config.issuer);
const supportsPAR = providerSupportsPAR(discovery);

if (supportsPAR) {
  console.log('✅ Provider supports PAR:', discovery.pushed_authorization_request_endpoint);

  // 2. Validate configuration
  const validation = validatePARConfig(config, discovery);
  if (!validation.valid) {
    console.error('❌ PAR config invalid:', validation.errors);
  }
}

// 3. Enable PAR in config
config: {
  usePAR: true,  // Enable PAR (auto-detected if available)
  // ... rest of config
}
```

**How It Works:**
```
Traditional Flow:
1. Build authorization URL with all params
2. Redirect: https://provider.com/authorize?client_id=...&redirect_uri=...&scope=...&state=...&nonce=...&code_challenge=...
   ↑ Long URL, sensitive data visible

PAR Flow:
1. POST params to PAR endpoint
   → POST https://provider.com/as/par
   → Body: client_id, redirect_uri, scope, state, nonce, code_challenge
   ← Response: { request_uri: "urn:ietf:params:oauth:request_uri:xyz", expires_in: 90 }

2. Redirect with request_uri only
   → https://provider.com/authorize?client_id=abc&request_uri=urn:ietf:params:oauth:request_uri:xyz
   ↑ Clean URL, no sensitive data
```

**Configuration:**
```javascript
config: {
  usePAR: true,  // Enable PAR (default: false)

  // Authentication for PAR endpoint (required)
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',  // For client_secret_basic/post

  // Or use client assertion (more secure)
  privateKey: {
    kty: 'RSA',
    alg: 'RS256',
    kid: 'key-1',
    // ... RSA private key components
  },
  tokenEndpointAuthMethod: 'private_key_jwt'
}
```

**Client Authentication Methods:**

| Method | Security | Use Case |
|--------|----------|----------|
| `client_secret_basic` | ⚠️ Shared secret | Development, basic apps |
| `client_secret_post` | ⚠️ Shared secret | POST body auth |
| `private_key_jwt` | ✅ Asymmetric | Production, compliance (FAPI) |
| `none` | ❌ Public client | Mobile apps, SPAs |

**Manual Usage:**
```javascript
import {
  pushAuthorizationRequest,
  buildPARAuthorizationUrl
} from 's3db.js/plugins/api/concerns/oidc-par';

// 1. Push authorization params
const authParams = {
  response_type: 'code',
  client_id: config.clientId,
  redirect_uri: config.redirectUri,
  scope: config.scope,
  state: generateState(),
  nonce: generateNonce(),
  code_challenge: pkceChallenge,
  code_challenge_method: 'S256'
};

const clientAuth = {
  clientId: config.clientId,
  clientSecret: config.clientSecret
};

const parResponse = await pushAuthorizationRequest(
  discovery.pushed_authorization_request_endpoint,
  authParams,
  clientAuth
);

// parResponse: { request_uri: "urn:...", expires_in: 90 }

// 2. Build authorization URL
const authUrl = buildPARAuthorizationUrl(
  discovery.authorization_endpoint,
  parResponse.request_uri,
  config.clientId
);

// 3. Redirect user
return c.redirect(authUrl);
```

**Benefits:**
- ✅ **FAPI compliant** (Open Banking, financial services)
- ✅ **Better security** (no sensitive data in URL)
- ✅ **Phishing protection** (pre-validated redirect_uri)
- ✅ **Large requests** (no URL length limits)
- ✅ **Early validation** (errors before user sees browser)
- ✅ **Cleaner URLs** (browser history, logs)

**Error Handling:**
```javascript
// PAR errors returned immediately
try {
  const parResponse = await pushAuthorizationRequest(...);
} catch (error) {
  // error.message: "PAR request failed: invalid_redirect_uri - Redirect URI not registered"
  // Handle error before user sees authorization page
}
```

**Provider Support:**
- **Requires**: `pushed_authorization_request_endpoint` in discovery document
- **Example Providers**: Keycloak, ForgeRock, Ping Identity, some banks
- **Not Yet**: Google, Azure AD, Auth0 (as of 2024)

**Detection:**
```javascript
const discovery = await fetchDiscoveryDocument(issuer);
if (discovery.pushed_authorization_request_endpoint) {
  console.log('✅ Provider supports PAR');
  config.usePAR = true;
} else {
  console.log('❌ Provider does not support PAR');
  config.usePAR = false;
}
```

---

### Client Assertion with JWK (Phase 4)

**The Problem:**
- Shared secrets (client_secret) → Symmetric keys, rotation risk
- Secret compromise → All clients affected
- Compliance requirements → Asymmetric authentication (FAPI, healthcare, government)
- Key management → Manual rotation, downtime

**The Solution:**
Asymmetric client authentication using private_key_jwt:
- Client signs JWT with private key
- Provider verifies with public key
- No shared secrets → Better security model
- Key rotation → Update JWKS endpoint, zero downtime

**RFC 7523 Compliance:**
```
Standard: JSON Web Token (JWT) Profile for OAuth 2.0 Client Authentication
RFC: 7523
Status: Standards Track (May 2015)
Use Case: Financial-grade API (FAPI), healthcare (SMART on FHIR), government
```

**Quick Start:**
```javascript
import { generateRSAKeyPair } from 's3db.js/plugins/api/concerns/oidc-client-assertion';

// 1. Generate key pair (do once, store securely)
const { privateKey, publicKey } = await generateRSAKeyPair({
  modulusLength: 2048,
  keyId: 'key-2024-01'
});

// privateKey: { kty: 'RSA', alg: 'RS256', use: 'sig', n: '...', e: '...', d: '...' }
// publicKey:  { kty: 'RSA', alg: 'RS256', use: 'sig', n: '...', e: '...' }

// 2. Register public key with provider (JWKS endpoint or manual upload)

// 3. Configure OIDC with private key
config: {
  clientId: 'your-client-id',
  privateKey: privateKey,  // ← Use private key instead of clientSecret
  tokenEndpointAuthMethod: 'private_key_jwt',

  // ... rest of config
}
```

**Supported Key Types:**

| Type | Algorithm | Security | Use Case |
|------|-----------|----------|----------|
| **RSA** | RS256, RS384, RS512 | ⭐⭐⭐ | Most compatible |
| **EC** | ES256, ES384, ES512 | ⭐⭐⭐⭐ | Smaller keys, faster |
| **OKP** | EdDSA (Ed25519) | ⭐⭐⭐⭐⭐ | Newest, best performance |

**How It Works:**
```
1. Client needs access token
2. Generate client assertion JWT:
   {
     iss: client_id,          // Issuer = client
     sub: client_id,          // Subject = client
     aud: token_endpoint,     // Audience = provider
     jti: unique_id,          // JWT ID (replay protection)
     exp: now + 300,          // Expires in 5 minutes
     iat: now                 // Issued at
   }
3. Sign JWT with private key
4. POST to token endpoint:
   client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
   client_assertion=eyJhbGc...
5. Provider verifies JWT with public key
6. Provider issues tokens
```

**Complete Example:**
```javascript
import {
  generateRSAKeyPair,
  generateClientAssertion,
  createClientAuth,
  applyClientAuth,
  validatePrivateKey
} from 's3db.js/plugins/api/concerns/oidc-client-assertion';

// 1. Generate and validate key pair
const { privateKey, publicKey } = await generateRSAKeyPair({
  modulusLength: 2048,
  keyId: 'my-key-2024'
});

const validation = validatePrivateKey(privateKey);
if (!validation.valid) {
  console.error('Invalid private key:', validation.errors);
  process.exit(1);
}

// 2. Store keys securely
// - Private key: Environment variable, secrets manager, HSM
// - Public key: Register with provider JWKS endpoint

// 3. Generate client assertion
const assertion = await generateClientAssertion({
  clientId: 'your-client-id',
  tokenEndpoint: 'https://provider.com/token',
  privateKey: privateKey,
  algorithm: 'RS256',
  expiresIn: 300  // 5 minutes
});

// 4. Create client auth object
const clientAuth = await createClientAuth(config, tokenEndpoint);

// 5. Apply to token request
const requestOptions = {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', code: authCode })
};

const authenticatedRequest = applyClientAuth(clientAuth, requestOptions);

// 6. Make token request
const response = await fetch(tokenEndpoint, authenticatedRequest);
const tokens = await response.json();
```

**Key Storage:**
```javascript
// ❌ BAD: Hardcoded in code
const privateKey = { kty: 'RSA', d: '...' };

// ✅ GOOD: Environment variable (development)
const privateKey = JSON.parse(process.env.OIDC_PRIVATE_KEY);

// ✅ BETTER: Secrets manager (production)
const privateKey = await secretsManager.getSecret('oidc-private-key');

// ✅ BEST: Hardware Security Module (enterprise)
const privateKey = await hsm.getKey('oidc-key-id');
```

**Key Rotation:**
```javascript
// Zero-downtime key rotation:

// 1. Generate new key pair
const { privateKey: newKey, publicKey: newPubKey } = await generateRSAKeyPair({
  keyId: 'key-2024-02'  // New key ID
});

// 2. Add new public key to JWKS (keep old key active)
// Provider now accepts both old and new keys

// 3. Update application config to use new private key
config.privateKey = newKey;

// 4. Wait for token expiration (old tokens still valid)

// 5. Remove old public key from JWKS
```

**Client Authentication Methods:**
```javascript
// Method 1: Client Secret Basic (Authorization header)
config: {
  clientId: 'your-client-id',
  clientSecret: 'your-secret',
  tokenEndpointAuthMethod: 'client_secret_basic'  // Default
}

// Method 2: Client Secret Post (POST body)
config: {
  clientId: 'your-client-id',
  clientSecret: 'your-secret',
  tokenEndpointAuthMethod: 'client_secret_post'
}

// Method 3: Private Key JWT (Asymmetric) ← RECOMMENDED
config: {
  clientId: 'your-client-id',
  privateKey: { kty: 'RSA', alg: 'RS256', ... },
  tokenEndpointAuthMethod: 'private_key_jwt'
}

// Method 4: None (Public client)
config: {
  clientId: 'your-client-id',
  tokenEndpointAuthMethod: 'none'
}
```

**Benefits:**
- ✅ **Better security** (no shared secrets)
- ✅ **FAPI compliant** (financial services)
- ✅ **Key rotation** (zero downtime)
- ✅ **Compromise isolation** (only one client affected)
- ✅ **Audit trail** (key ID in JWT)
- ✅ **Regulatory compliance** (healthcare, government)

**Provider Support:**
- **Requires**: `private_key_jwt` in `token_endpoint_auth_methods_supported`
- **Example Providers**: Keycloak, Auth0, ForgeRock, Azure AD (manual config)
- **Check Discovery**: `discovery.token_endpoint_auth_methods_supported`

---

### Backchannel Logout (Phase 4)

**The Problem:**
- User logs out at IDP → App sessions remain active
- Multi-device security → User logs out on phone, desktop still logged in
- Enterprise requirement → Centralized session termination
- Compliance → Immediate logout across all applications

**The Solution:**
IDP-initiated logout via logout tokens:
- User logs out at IDP
- IDP sends logout token to all registered apps (POST to backchannel endpoint)
- App verifies logout token and destroys sessions
- Multi-device/app logout in real-time

**OpenID Connect Back-Channel Logout 1.0 Compliance:**
```
Standard: OpenID Connect Back-Channel Logout 1.0
Status: Final (January 2022)
Use Case: Enterprise SSO, multi-device security, compliance
```

**Quick Start:**
```javascript
import {
  providerSupportsBackchannelLogout,
  validateBackchannelLogoutConfig,
  getBackchannelLogoutUri
} from 's3db.js/plugins/api/concerns/oidc-backchannel-logout';

// 1. Check provider support
const discovery = await fetchDiscoveryDocument(config.issuer);
const supportsBackchannel = providerSupportsBackchannelLogout(discovery);

if (supportsBackchannel) {
  // 2. Configure session store (REQUIRED)
  const sessionStore = new RedisStore({ client: redisClient });

  // 3. Configure backchannel logout
  config: {
    sessionStore: sessionStore,  // REQUIRED
    backchannelLogoutUri: 'https://app.com/auth/backchannel-logout',

    // Optional: Custom logout handler
    onBackchannelLogout: async ({ claims, sessionIds, loggedOut }) => {
      console.log(`[Logout] IDP logged out ${loggedOut} sessions for user ${claims.sub}`);

      // Custom logic: notify user, audit log, etc.
      await auditLog.write({
        event: 'backchannel_logout',
        userId: claims.sub,
        sessionsTerminated: loggedOut
      });
    }
  };

  // 4. Register backchannel URI with provider
  const logoutUri = getBackchannelLogoutUri('https://app.com');
  console.log('Register this URI with your provider:', logoutUri);
}
```

**How It Works:**
```
1. User has active sessions in:
   - Web app (Desktop)
   - Mobile app (Phone)
   - API (Tablet)

2. User logs out at IDP

3. IDP sends logout token to all registered apps:
   POST https://app.com/auth/backchannel-logout
   Body: logout_token=eyJhbGc...

4. App verifies logout token:
   - Validate JWT signature
   - Check required claims (iss, aud, events, sub/sid, jti)
   - Verify nonce NOT present (distinguishes from ID token)

5. App finds sessions by sub/sid:
   - Query session store: findBySub(claims.sub)
   - Destroy all matching sessions

6. All devices logged out immediately
```

**Logout Token Structure:**
```javascript
{
  iss: 'https://provider.com',           // Issuer
  aud: 'your-client-id',                 // Audience
  iat: 1672531200,                       // Issued at
  jti: 'unique-jwt-id',                  // JWT ID (replay protection)
  events: {
    'http://schemas.openid.net/event/backchannel-logout': {}
  },
  sub: 'user-123',                       // Subject (user ID)
  sid: 'session-abc'                     // Session ID (optional)
  // NOTE: NO nonce claim (distinguishes from ID token)
}
```

**Session Store Requirements:**
```javascript
// Your session store MUST implement these methods:

class CustomSessionStore {
  // Find sessions by subject (user ID)
  async findBySub(sub) {
    return ['session-id-1', 'session-id-2'];
  }

  // Find sessions by session ID
  async findBySid(sid) {
    return ['session-id-3'];
  }

  // Destroy session
  async destroy(sessionId) {
    await redis.del(`session:${sessionId}`);
  }
}

// Built-in stores (RedisStore, MemoryStore) support these methods
```

**Complete Example:**
```javascript
import { Hono } from 'hono';
import { RedisStore } from 's3db.js/plugins/api/concerns/session-store';
import {
  registerBackchannelLogoutRoute,
  handleBackchannelLogout,
  validateLogoutTokenClaims
} from 's3db.js/plugins/api/concerns/oidc-backchannel-logout';

// 1. Create session store
const sessionStore = new RedisStore({
  client: redisClient,
  prefix: 'session:'
});

// 2. Configure OIDC
const config = {
  issuer: 'https://provider.com',
  clientId: 'your-client-id',
  sessionStore,
  backchannelLogoutUri: 'https://app.com/auth/backchannel-logout',

  // Hook for custom logout logic
  onBackchannelLogout: async ({ claims, sessionIds, loggedOut }) => {
    // Audit log
    await db.resources.auditLogs.insert({
      event: 'backchannel_logout',
      userId: claims.sub,
      sessionIds,
      loggedOut,
      timestamp: new Date()
    });

    // Notify user (email, push notification)
    await notifyUser(claims.sub, {
      title: 'Session Terminated',
      message: `You were logged out from ${loggedOut} device(s)`
    });
  }
};

// 3. Register backchannel logout route
const app = new Hono();
registerBackchannelLogoutRoute(
  app,
  '/auth/backchannel-logout',
  config,
  signingKey,  // JWK for verifying logout token
  sessionStore
);

// Or handle manually:
app.post('/auth/backchannel-logout', async (c) => {
  const result = await handleBackchannelLogout(
    c,
    config,
    signingKey,
    sessionStore
  );

  if (result.success) {
    console.log(`✅ Logged out ${result.sessionsLoggedOut} sessions`);
    return c.text('', 200);
  } else {
    console.error(`❌ Backchannel logout failed:`, result.error);
    return c.json({ error: result.error }, result.statusCode);
  }
});
```

**Validation:**
```javascript
// Automatic validation of logout token
const validation = validateLogoutTokenClaims(logoutTokenClaims);

if (!validation.valid) {
  console.error('Invalid logout token:', validation.errors);
  // Errors:
  // - 'Missing "events" claim'
  // - 'Missing backchannel-logout event in "events" claim'
  // - 'Must have either "sub" (subject) or "sid" (session ID) claim'
  // - 'Logout token must NOT contain "nonce" claim'
  // - 'Missing "jti" (JWT ID) claim for replay protection'
}
```

**Configuration:**
```javascript
config: {
  // Session store (REQUIRED)
  sessionStore: new RedisStore({ client: redisClient }),

  // Backchannel logout URI (register with provider)
  backchannelLogoutUri: 'https://app.com/auth/backchannel-logout',

  // Custom logout handler (optional)
  onBackchannelLogout: async ({ claims, sessionIds, loggedOut }) => {
    // Your custom logic
  },

  // Signing key for JWT verification (from JWKS)
  // Automatically fetched from provider's jwks_uri
}
```

**Provider Registration:**
```javascript
// You must register backchannel logout URI with your provider

// Keycloak: Client Settings → Backchannel Logout URL
// Auth0: Application Settings → Advanced → Backchannel Logout URL
// Azure AD: App Registration → Authentication → Backchannel Logout URL

const backchannelUri = getBackchannelLogoutUri('https://app.com');
console.log('Register this URI:', backchannelUri);
// Output: https://app.com/auth/backchannel-logout
```

**Benefits:**
- ✅ **Multi-device logout** (log out everywhere simultaneously)
- ✅ **Real-time** (immediate session termination)
- ✅ **Centralized control** (IDP manages all sessions)
- ✅ **Compliance** (enterprise security requirements)
- ✅ **Audit trail** (onBackchannelLogout hook for logging)
- ✅ **Session consistency** (no orphaned sessions)

**Provider Support:**
- **Requires**: `backchannel_logout_supported: true` in discovery document
- **Example Providers**: Keycloak, Auth0, ForgeRock, Azure AD (preview)
- **Check Discovery**: `discovery.backchannel_logout_supported`

**Security Considerations:**
- **JWT verification**: Always verify logout token signature
- **Replay protection**: Validate jti (JWT ID) uniqueness
- **Session store**: Required for finding sessions by sub/sid
- **HTTPS only**: Backchannel endpoint must use HTTPS
- **Error handling**: Return 200 even on errors (per spec)

**Troubleshooting:**
```javascript
// Enable verbose logging
config: {
  verbose: true
}

// Output:
// [OIDC] Backchannel logout request received
// [OIDC] Logout token verified: { sub: 'user-123', sid: 'session-abc' }
// [OIDC] Found 3 sessions to logout
// [OIDC] Destroyed session: session-id-1
// [OIDC] Destroyed session: session-id-2
// [OIDC] Destroyed session: session-id-3
// [OIDC] Backchannel logout complete: 3 sessions logged out
```

---

## 🐛 Troubleshooting

### No `refresh_token` returned

**Google:**
- ✅ Provider quirks should auto-add `access_type=offline`
- ✅ First login only returns `refresh_token` with `prompt=consent`
- ✅ Delete Google app permission and re-authenticate

**Azure AD:**
- ✅ Check `offline_access` scope is included
- ✅ Ensure app has "Allow public client flows" enabled

**Check logs:**
```javascript
config: {
  verbose: true  // Enable debug logging
}
```

### Session expires too soon

```javascript
config: {
  autoRefreshTokens: true,      // Ensure enabled (default)
  refreshThreshold: 300000,     // 5 min (default)
  rollingDuration: 86400000,    // 24 hours (increase if needed)
  absoluteDuration: 604800000,  // 7 days (increase if needed)
  verbose: true,                // Enable logging
}
```

### Continue URL not working

```javascript
config: {
  externalUrl: 'https://api.example.com',  // Set if behind reverse proxy
  verbose: true,                           // Check logs
}
```

### Cross-subdomain logout broken

```javascript
config: {
  cookieDomain: '.example.com',  // Ensure domain matches
  // Dual-cookie deletion handles this automatically ✅
}
```

### CORS errors

```javascript
// In API Plugin config (not OIDC config)
{
  cors: {
    enabled: true,
    origin: ['https://app.example.com', 'https://admin.example.com'],
    credentials: true
  }
}
```

---

## ❓ FAQ

**Q: Is implicit refresh enabled by default?**
A: Yes! `autoRefreshTokens: true` is the default. Disable explicitly if needed.

**Q: Does this work with all providers?**
A: Yes, but some providers don't return `refresh_token` (e.g., GitHub). Check provider docs.

**Q: What's the cookie size impact?**
A: Adds ~200-400 bytes for `refresh_token`. Total: ~600-1000 bytes (well under 4KB limit).

**Q: Can I disable specific OIDC enhancements?**
A: Yes! All features can be disabled:
```javascript
{
  autoRefreshTokens: false,   // Disable implicit refresh
  externalUrl: undefined,     // Disable external URL
  cookieDomain: undefined,    // Disable cross-subdomain
}
```

**Q: How do I get the user object in routes?**
A: Use enhanced context:
```javascript
routes: {
  'GET /profile': async (c, ctx) => {
    const user = ctx.user;  // Authenticated user
    return ctx.json({ user });
  }
}
```

**Q: Can I customize the user ID field?**
A: Yes! Use `userIdClaim`:
```javascript
config: {
  userIdClaim: 'email',  // Use email as user ID (default: 'sub')
}
```

**Q: How do I test locally without HTTPS?**
A: Set `cookieSecure: false` for development:
```javascript
config: {
  cookieSecure: process.env.NODE_ENV === 'production',  // HTTPS in prod only
}
```

**Q: Can I use OIDC with other auth methods?**
A: Yes! Mix and match:
```javascript
auth: {
  drivers: {
    oidc: {/*...*/},
    jwt: {/*...*/},
    basic: {/*...*/}
  },
  pathRules: [
    { path: '/admin/**', methods: ['oidc'], required: true },
    { path: '/api/**', methods: ['jwt', 'basic'], required: true }
  ]
}
```

---

## 📚 See Also

- [Authentication Overview](./authentication.md) - All auth methods
- [Configuration Reference](../reference/configuration.md) - Complete options
- [Guards](./guards.md) - Row-level security
- [Example: e50-oidc-simple.js](../../../examples/e50-oidc-simple.js)
- [Example: e88-oidc-enhancements.js](../../../examples/e88-oidc-enhancements.js)

---

**Questions?** [Open an issue](https://github.com/forattini-dev/s3db.js/issues)
