# ✅ Best Practices & FAQ

**Prev:** [← Usage Patterns](./usage-patterns.md)
**Main:** [← Identity Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-hub)

> **In this guide:**
> - 5 essential best practices with code examples
> - 5 pro tips and tricks
> - Common mistakes with solutions
> - Error scenarios and troubleshooting
> - 40+ FAQ entries across 6 categories

**Time to read:** 25 minutes
**Difficulty:** Advanced

---

## 5 Essential Best Practices

### Practice 1: Always Use HTTPS in Production

Never expose your OAuth2 server over HTTP. Use HTTPS everywhere.

```javascript
// ❌ Wrong - HTTP in production
await db.usePlugin(new IdentityPlugin({
  port: 80,
  issuer: 'http://sso.example.com'
}));

// ✅ Correct - HTTPS in production
await db.usePlugin(new IdentityPlugin({
  port: 443,
  issuer: 'https://sso.example.com',
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

**Why:** User credentials and tokens flow through this server. HTTP = anyone can intercept.

### Practice 2: Use Scope-Based Access Control

Don't rely on just checking if user is authenticated. Use scopes to granularly control permissions.

```javascript
// ❌ Wrong - only checks authentication
if (req.user) {
  // User is logged in, grant access
  return res.json(user.orders);
}

// ✅ Correct - checks both authentication AND scopes
const requiredScope = 'read:orders';
const userScopes = req.user.scope.split(' ');

if (!userScopes.includes(requiredScope)) {
  return res.status(403).json({
    error: 'Insufficient scopes',
    required: requiredScope,
    provided: userScopes
  });
}

return res.json(user.orders);
```

**Example scopes:**
- `read:users` - Can read user data
- `write:users` - Can create/update users
- `admin:all` - Full admin access
- `read:orders` - Can view orders
- `write:orders` - Can manage orders

### Practice 3: Rotate RSA Keys Periodically

Generate new signing keys every 90 days. Old keys stay valid for grace period.

```javascript
// Manual rotation
async function rotateKeys() {
  await identityPlugin.oauth2.rotateKeys();
  console.log('✅ Keys rotated');
  // Old key available for 24h (configurable)
  // New tokens use new key
  // Old tokens stay valid
}

// Automatic rotation every 90 days
setInterval(async () => {
  try {
    await rotateKeys();
  } catch (error) {
    console.error('Key rotation failed:', error);
    // Alert operations team
  }
}, 90 * 24 * 60 * 60 * 1000);

// Check key ages
const keys = await identityPlugin.oauth2.getKeys();
keys.forEach(key => {
  const ageMs = Date.now() - key.createdAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > 60) {
    console.warn(`Key ${key.id} is ${ageDays} days old - consider rotating`);
  }
});
```

### Practice 4: Secure Token Storage

Different storage for different client types:

```javascript
// Web backend: HTTP-only secure cookies
res.setHeader('Set-Cookie', [
  `access_token=${token.access_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900`,
  `refresh_token=${token.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`
]);

// SPA/Browser: SessionStorage (NOT localStorage!)
// JavaScript can't access it (XSS safer)
if (window.sessionStorage) {
  sessionStorage.setItem('access_token', token.access_token);
  // Lost when tab closes (safer)
}

// Mobile: Encrypted secure storage
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('access_token', token.access_token);
// Encrypted using OS keystore

// Desktop: System keyring
const keytar = require('keytar');
await keytar.setPassword('myapp', 'token', token.access_token);
// Uses system password manager
```

**Why:** localStorage is vulnerable to XSS attacks. Secure alternatives prevent token theft.

### Practice 5: Monitor and Alert on Auth Events

Track authentication events for security monitoring:

```javascript
// Track all auth attempts
identityPlugin.on('auth:attempt', (event) => {
  logger.info('Auth attempt', {
    clientId: event.clientId,
    grantType: event.grantType,
    timestamp: new Date().toISOString()
  });
});

// Alert on failures
identityPlugin.on('auth:failed', (event) => {
  logger.warn('Auth failed', {
    clientId: event.clientId,
    reason: event.reason,
    ip: event.ip
  });

  // Alert if repeated failures (brute force)
  const recentFailures = await countRecentFailures(event.ip, 5 * 60 * 1000);
  if (recentFailures > 10) {
    alerting.notify({
      severity: 'high',
      title: 'Brute force detected',
      details: `${recentFailures} failed attempts from ${event.ip}`
    });
  }
});

// Track token issued
identityPlugin.on('token:issued', (event) => {
  metrics.increment('token.issued', {
    clientId: event.clientId,
    grantType: event.grantType
  });
});

// Alert on revocations
identityPlugin.on('token:revoked', (event) => {
  logger.info('Token revoked', {
    clientId: event.clientId,
    reason: event.reason
  });
});
```

---

## 5 Pro Tips & Tricks

### Tip 1: Use Discovery for Resilience

Don't hardcode URLs. Use OpenID Connect discovery:

```javascript
// ✅ Good - Fetches from discovery endpoint
const discoveryUrl = 'https://sso.example.com/.well-known/openid-configuration';
const config = await fetch(discoveryUrl).then(r => r.json());

// Use discovered endpoints
const tokenEndpoint = config.token_endpoint;
const userInfoEndpoint = config.userinfo_endpoint;
const jwksUri = config.jwks_uri;

// If server updates endpoints, you automatically use new ones
```

### Tip 2: Cache JWKS Locally

Fetch public keys once, cache them, refresh periodically:

```javascript
import NodeCache from 'node-cache';

class JWKSCache {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 3600 });  // 1 hour cache
  }

  async getKeys(issuer) {
    const cached = this.cache.get(issuer);
    if (cached) return cached;

    const response = await fetch(`${issuer}/.well-known/jwks.json`);
    const keys = await response.json();

    this.cache.set(issuer, keys);
    return keys;
  }
}

const jwksCache = new JWKSCache();

// Use in token validation
async function validateToken(token, issuer) {
  const keys = await jwksCache.getKeys(issuer);
  // ... validate signature with keys
}
```

### Tip 3: Implement Automatic Token Refresh

Refresh tokens before they expire:

```javascript
class TokenManager {
  constructor() {
    this.token = null;
    this.refreshInterval = null;
  }

  async refreshIfNeeded() {
    if (!this.token) return;

    const expiresAt = this.token.expiresAt;
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;

    // Refresh 60 seconds before expiry
    if (timeUntilExpiry < 60000) {
      await this.refresh();
    }
  }

  async refresh() {
    const response = await fetch('https://sso.example.com/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.token.refreshToken
      })
    });

    const newToken = await response.json();
    this.token = {
      accessToken: newToken.access_token,
      refreshToken: newToken.refresh_token,
      expiresAt: Date.now() + (newToken.expires_in * 1000)
    };

    // Auto-refresh 5 minutes before next expiry
    clearInterval(this.refreshInterval);
    const nextRefreshIn = this.token.expiresAt - Date.now() - (5 * 60 * 1000);
    this.refreshInterval = setTimeout(() => this.refresh(), nextRefreshIn);
  }

  getAccessToken() {
    // Always refresh if needed before returning
    this.refreshIfNeeded();
    return this.token.accessToken;
  }
}
```

### Tip 4: Support Multiple Auth Providers

Let Resource Servers accept tokens from different issuers:

```javascript
const authProviders = new Map();

// Register IdentityPlugin
authProviders.set('identity-sso', new OIDCClient({
  issuer: 'https://sso.example.com',
  audience: 'my-api'
}));

// Also accept Azure AD tokens
authProviders.set('azure-ad', new OIDCClient({
  issuer: 'https://login.microsoftonline.com/TENANT_ID/v2.0',
  audience: 'api://MY_API_CLIENT_ID'
}));

// Middleware tries all providers
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.slice(7);

  // Try each provider
  for (const [name, provider] of authProviders) {
    try {
      const user = provider.validateToken(token);
      req.user = { ...user, provider: name };
      return next();
    } catch (err) {
      // Try next provider
    }
  }

  res.status(401).json({ error: 'Invalid token' });
});
```

### Tip 5: Implement Device Flow for CLI

Enable device authorization code flow for CLI tools:

```javascript
// CLI app initiates device flow
async function authenticateCLI() {
  const response = await fetch('https://sso.example.com/oauth/device', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: 'my-cli-tool'
    })
  });

  const { device_code, user_code, verification_uri } = await response.json();

  // Show user the code and URL
  console.log(`
  Please visit: ${verification_uri}
  And enter code: ${user_code}
  `);

  // Poll for authorization
  while (true) {
    const tokenResponse = await fetch('https://sso.example.com/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device_code,
        client_id: 'my-cli-tool'
      })
    });

    const data = await tokenResponse.json();

    if (data.access_token) {
      return data.access_token;
    }

    if (data.error === 'authorization_pending') {
      // Wait before next poll
      await new Promise(r => setTimeout(r, 5000));
    } else {
      throw new Error(data.error);
    }
  }
}
```

---

## Common Mistakes & Solutions

### ❌ Mistake 1: Hardcoding Issuer

```javascript
// Wrong - hardcoded issuer
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000'  // Won't work in production!
});

// Solution - use environment variable
const oidcClient = new OIDCClient({
  issuer: process.env.ISSUER_URL  // https://sso.example.com
});
```

### ❌ Mistake 2: Storing Tokens in localStorage

```javascript
// Wrong - localStorage vulnerable to XSS
localStorage.setItem('token', token.access_token);
// Anyone who runs JavaScript on your page can steal it

// Solution - HTTP-only cookies or secure storage
// Backend: HTTP-only cookie (JavaScript can't access)
res.setHeader('Set-Cookie', `token=${token.access_token}; HttpOnly; Secure`);

// Mobile: Encrypted secure storage
// Browser SPA: sessionStorage (lost when tab closes)
```

### ❌ Mistake 3: Using Expired Access Tokens

```javascript
// Wrong - never refresh tokens
fetch('https://api.example.com/orders', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
  // If accessToken expired, request fails with 401
});

// Solution - refresh before expiry
class TokenStore {
  getToken() {
    if (this.isExpired()) {
      this.refresh();  // Proactively refresh
    }
    return this.accessToken;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}
```

### ❌ Mistake 4: Ignoring PKCE for SPAs

```javascript
// Wrong - SPA without PKCE
const response = await fetch('https://sso.example.com/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'my-spa',
    client_secret: 'SECRET_IN_JS',  // Visible in source!
    code: authCode
  })
});

// Solution - use PKCE (no client_secret needed)
const { verifier, challenge } = generatePKCE();
// Use challenge in auth request, verifier in token request
```

### ❌ Mistake 5: Not Validating Token Signature

```javascript
// Wrong - trusting token without validation
const payload = JSON.parse(atob(token.split('.')[1]));
const userId = payload.sub;  // Could be forged!

// Solution - validate signature
const oidcClient = new OIDCClient({...});
const validatedPayload = oidcClient.validateToken(token);
// Signature verified with issuer's public key
```

---

## Error Scenarios & Troubleshooting

### Error: "Invalid issuer"

**Cause:** Token was issued by different server or issuer mismatch

```javascript
// Check token contains
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('Token issuer:', payload.iss);
console.log('Expected issuer:', 'https://sso.example.com');

// Solution: Ensure issuer matches
await db.usePlugin(new IdentityPlugin({
  issuer: 'https://sso.example.com'  // Must match token
}));
```

### Error: "Invalid signature"

**Cause:** Public keys not updated or different key pair signing

```javascript
// Solution 1: Force refresh JWKS
const response = await fetch('https://sso.example.com/.well-known/jwks.json?_nocache=' + Date.now());
const keys = await response.json();

// Solution 2: Reduce JWKS cache TTL
const oidcClient = new OIDCClient({
  issuer: 'https://sso.example.com',
  jwksCacheTTL: 60000  // 1 minute (default 1 hour)
});

// Solution 3: Check if keys were rotated
console.log('Available key IDs:', keys.keys.map(k => k.kid));
```

### Error: "Redirect URI mismatch"

**Cause:** Client's configured redirectUri doesn't match request

```javascript
// Check what's registered
const client = await db.resources.plg_oauth_clients.get('my-app');
console.log('Allowed URIs:', client.redirectUris);

// Must be exact match
// ❌ http://localhost:3000/callback != http://localhost:3000/auth/callback
// ✅ http://localhost:3000/callback == http://localhost:3000/callback

// Solution: Update in database
await client.update({
  redirectUris: ['http://localhost:3000/callback']
});
```

### Error: "Invalid client credentials"

**Cause:** clientId/clientSecret mismatch or client inactive

```javascript
// Debug steps
// 1. Check client exists and is active
const client = await db.resources.plg_oauth_clients.get('my-app');
console.log('Client exists:', !!client);
console.log('Client active:', client.active);

// 2. Verify secret matches
import bcrypt from 'bcrypt';
const matches = await bcrypt.compare('provided-secret', client.clientSecret);
console.log('Secret matches:', matches);

// 3. Solution: Activate client
await client.update({ active: true });
```

### Error: "Insufficient scopes"

**Cause:** Client requesting scopes it's not allowed to

```javascript
// Check client's allowed scopes
const client = await db.resources.plg_oauth_clients.get('my-app');
console.log('Allowed scopes:', client.allowedScopes);

// Requesting: read:orders, write:orders, admin
// But allowed: read:orders, profile

// Solution: Add scope to client
await client.update({
  allowedScopes: ['read:orders', 'write:orders', 'profile']
});
```

---

## FAQ

### General Questions

<details>
<summary><strong>Q: What is OIDC and how does it differ from OAuth2?</strong></summary>

**OAuth2** = Authorization (what you can do)
**OIDC** = Authentication (who you are) built on OAuth2

OIDC adds:
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
</details>

<details>
<summary><strong>Q: Is this production-ready?</strong></summary>

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
</details>

<details>
<summary><strong>Q: When should I use IdentityPlugin vs Azure AD/Keycloak?</strong></summary>

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

**Pro tip:** IdentityPlugin tokens work with Azure AD clients! Your Resource Servers can validate tokens from multiple providers.
</details>

<details>
<summary><strong>Q: How do I test my SSO server?</strong></summary>

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
echo $TOKEN | cut -d. -f2 | base64 -d | jq
```

**5. Test authorization code flow:**
```
http://localhost:4000/oauth/authorize?response_type=code&client_id=my-app&redirect_uri=http://localhost:3000/callback&scope=openid&state=abc123
```
</details>

### Tokens & Security

<details>
<summary><strong>Q: What's the difference between access_token, id_token, and refresh_token?</strong></summary>

| Token | Purpose | Audience | Lifetime | Contains | Use Case |
|-------|---------|----------|----------|----------|----------|
| **access_token** | Authorization | Resource Server (API) | Short (15m) | Scopes, permissions | API requests |
| **id_token** | Authentication | Client app | Short (15m) | User profile, email | User identity |
| **refresh_token** | Token renewal | Authorization Server | Long (7d-90d) | Opaque (nothing) | Get new access_token |

**Example usage:**
- Use access_token for API calls
- Use id_token to identify user
- Use refresh_token to get new access_token when expired
</details>

<details>
<summary><strong>Q: How do I validate tokens in my API (Resource Server)?</strong></summary>

```javascript
import { OIDCClient } from 's3db.js';

const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'http://localhost:3001'
});

await oidcClient.initialize();

// With API Plugin
api.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

// Handler
app.get('/api/orders', (req, res) => {
  const userId = req.user.sub;
  const scopes = req.user.scope.split(' ');

  if (!scopes.includes('read:orders')) {
    return res.status(403).json({ error: 'Insufficient scopes' });
  }

  res.json({...});
});
```

**What it does:**
1. Fetches `/.well-known/openid-configuration` (issuer, JWKS URL)
2. Fetches JWKS public keys for signature verification
3. Validates every incoming JWT token
</details>

<details>
<summary><strong>Q: How do I revoke tokens?</strong></summary>

```bash
curl -X POST http://localhost:4000/oauth/revoke \
  -H "Authorization: Basic $(echo -n 'client:secret' | base64)" \
  -d "token=eyJhbGciOiJSUzI1..." \
  -d "token_type_hint=access_token"
```

**How it works:**
- Tokens are added to revocation list (s3db resource)
- Introspection endpoint checks revocation status
- Resource Servers can optionally introspect tokens
- Expired tokens are auto-cleaned up
</details>

<details>
<summary><strong>Q: How do I rotate JWT signing keys?</strong></summary>

**Manual rotation:**
```javascript
await identityPlugin.oauth2.rotateKeys();
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
</details>

### Grant Types & Flows

<details>
<summary><strong>Q: Which grant type should I use?</strong></summary>

| Use Case | Grant Type | Client Type | Security |
|----------|-----------|-------------|----------|
| **Web app with backend** | authorization_code | Confidential (has secret) | ⭐⭐⭐⭐⭐ |
| **Mobile app** | authorization_code + PKCE | Public (no secret) | ⭐⭐⭐⭐⭐ |
| **SPA (React/Vue/Angular)** | authorization_code + PKCE | Public | ⭐⭐⭐⭐ |
| **Service-to-service** | client_credentials | Confidential | ⭐⭐⭐⭐⭐ |
| **Desktop app** | authorization_code + PKCE | Public | ⭐⭐⭐⭐ |
</details>

<details>
<summary><strong>Q: What is PKCE and do I need it?</strong></summary>

**PKCE (Proof Key for Code Exchange)** = Extra security layer for public clients (SPAs, mobile apps).

**When to use:**
- ✅ **Required** for mobile apps
- ✅ **Required** for SPAs
- ⚠️ **Recommended** for web apps with backend
- ❌ Not applicable for service-to-service

**How it works:**
1. Client generates random `code_verifier`
2. Client creates `code_challenge` = SHA256(code_verifier)
3. Authorization request includes `code_challenge`
4. Token request includes original `code_verifier`
5. Server verifies: SHA256(code_verifier) === code_challenge
</details>

<details>
<summary><strong>Q: Can I disable specific grant types?</strong></summary>

```javascript
// Only authorization_code (no client_credentials, no refresh_token)
await db.usePlugin(new IdentityPlugin({
  supportedGrantTypes: ['authorization_code']
}));

// Only service-to-service (no user login)
await db.usePlugin(new IdentityPlugin({
  supportedGrantTypes: ['client_credentials']
}));
```
</details>

### Integration & Deployment

<details>
<summary><strong>Q: Can Resource Servers validate tokens from multiple providers?</strong></summary>

Yes! Register multiple OIDC clients:

```javascript
const internalSSO = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'http://localhost:3001'
});

const azureAD = new OIDCClient({
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: 'api://YOUR_API_CLIENT_ID'
});

api.addAuthDriver('internal', internalSSO.middleware.bind(internalSSO));
api.addAuthDriver('azure', azureAD.middleware.bind(azureAD));
```
</details>

<details>
<summary><strong>Q: How do I deploy to production?</strong></summary>

**Production checklist:**

**1. HTTPS Required:**
```javascript
await db.usePlugin(new IdentityPlugin({
  port: 443,
  issuer: 'https://sso.example.com'
}));
```

**2. Environment Variables:**
```bash
ISSUER=https://sso.example.com
PORT=443
S3_CONNECTION_STRING=s3://...
ENCRYPTION_KEY=your-32-char-key
```

**3. Load Balancer Health Check:**
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

**4. Key Rotation:**
```javascript
setInterval(async () => {
  await identityPlugin.oauth2.rotateKeys();
}, 90 * 24 * 60 * 60 * 1000);
```

**5. Monitoring:**
```javascript
identityPlugin.on('token:issued', (event) => {
  console.log('Token issued:', event.clientId);
});

identityPlugin.on('auth:failed', (event) => {
  console.error('Auth failed:', event.error);
});
```
</details>

### Troubleshooting

<details>
<summary><strong>Q: Users can't log in?</strong></summary>

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

**5. Enable debug logging:**
```javascript
await db.usePlugin(new IdentityPlugin({
  logLevel: 'debug'
}));
```
</details>

<details>
<summary><strong>Q: Getting CORS errors?</strong></summary>

Add your Resource Server origins:

```javascript
await db.usePlugin(new IdentityPlugin({
  cors: {
    enabled: true,
    origin: [
      'http://localhost:3001',
      'http://localhost:3000',
      'https://app.example.com'
    ],
    credentials: true,
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
</details>

<details>
<summary><strong>Q: Token validation fails with "Invalid signature"?</strong></summary>

**Solution 1: Force JWKS refresh**
```javascript
await oidcClient.fetchJWKS(true);
```

**Solution 2: Reduce JWKS cache TTL**
```javascript
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  jwksCacheTTL: 60000  // 1 minute
});
```

**Solution 3: Check key rotation timing**
```javascript
const jwks = await fetch('http://localhost:4000/.well-known/jwks.json').then(r => r.json());
console.log('Available keys:', jwks.keys.length);
```
</details>

---

## Summary Checklist

**Before going to production:**

- ✅ HTTPS enabled with valid certificate
- ✅ HSTS headers configured
- ✅ CORS restricted to specific origins
- ✅ Rate limiting enabled and tuned
- ✅ Keys rotated (every 90 days)
- ✅ Monitoring and alerting set up
- ✅ Tokens stored securely
- ✅ Refresh tokens implemented
- ✅ Token revocation working
- ✅ Scope-based access control
- ✅ Multi-provider support (if needed)
- ✅ Disaster recovery tested

---

**Prev:** [← Usage Patterns](./usage-patterns.md)
**Main:** [← Identity Plugin](../README.md)
