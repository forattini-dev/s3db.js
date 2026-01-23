# 💡 Usage Patterns & Scenarios

**Prev:** [← Configuration](/plugins/identity/guides/configuration.md)
**Next:** [Best Practices →](/plugins/identity/guides/best-practices.md)
**Main:** [← Identity Plugin](/plugins/identity/README.md) | **All guides:** [Index](/plugins/identity/README.md#-documentation-hub)

> **In this guide:**
> - 5 real-world OAuth2/OIDC scenarios
> - Complete working code for each pattern
> - Progressive learning (Beginner → Advanced)
> - Grant type selection guide
> - Token handling best practices

**Time to read:** 20 minutes
**Difficulty:** Intermediate

---

## Quick Reference

| Scenario | Use Case | Grant Type | Complexity |
|----------|----------|-----------|------------|
| **Development SSO** | Local testing, teams | authorization_code | Beginner |
| **Web App (Backend)** | Traditional web app | authorization_code | Intermediate |
| **Mobile/SPA** | React, Vue, Mobile apps | authorization_code + PKCE | Intermediate |
| **Service-to-Service** | Microservices, webhooks | client_credentials | Intermediate |
| **Multi-Tenant SaaS** | Multiple customers | authorization_code + isolation | Advanced |

---

## Pattern 1: Development SSO Server

**Perfect for:** Local development, team testing, prototyping

**Setup time:** 2 minutes

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso-dev',
  encryptionKey: 'dev-key-32-chars-must-be-long!'
});

await db.connect();

// Minimal SSO for development
await db.usePlugin(new IdentityPlugin({
  port: 4000,
  issuer: 'http://localhost:4000',
  supportedScopes: ['openid', 'profile', 'email'],
  logLevel: 'debug',                    // Debug logs
  cors: { origin: '*' },           // Allow any origin
  rateLimit: { enabled: false }    // No rate limiting
}));

// Create test user
await db.resources.users.insert({
  email: 'dev@example.com',
  password: 'dev-password-123',
  name: 'Dev User',
  scopes: ['openid', 'profile', 'email'],
  active: true
});

// Create test client
await db.resources.plg_oauth_clients.insert({
  clientId: 'test-app',
  clientSecret: 'test-secret',
  name: 'Test Application',
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email'],
  grantTypes: ['authorization_code', 'refresh_token']
});

console.log('✅ SSO running at http://localhost:4000');
console.log('📝 Test user: dev@example.com / dev-password-123');
console.log('🔑 Client: test-app / test-secret');
```

**Test it:**

```bash
# Get discovery
curl http://localhost:4000/.well-known/openid-configuration | jq

# Get public keys
curl http://localhost:4000/.well-known/jwks.json | jq

# Login flow: Manual
# 1. Visit http://localhost:4000/oauth/authorize?response_type=code&client_id=test-app&redirect_uri=http://localhost:3000/callback&scope=openid&state=abc123
# 2. Enter: dev@example.com / dev-password-123
# 3. See code in redirect
```

**Characteristics:**
- ✅ Permissive CORS
- ✅ Debug logging
- ✅ No rate limiting
- ✅ Fast iteration

---

## Pattern 2: Web App (Backend)

**Perfect for:** Next.js, Express, Django backends with SSO

**Setup time:** 5 minutes

**Backend code:**

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3_CONNECTION_STRING,
  encryptionKey: process.env.ENCRYPTION_KEY
});

await db.connect();

await db.usePlugin(new IdentityPlugin({
  port: 443,
  issuer: 'https://sso.example.com',
  supportedScopes: [
    'openid', 'profile', 'email',
    'offline_access',  // Allow refresh tokens
    'read:api', 'write:api'
  ],
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',

  cors: {
    enabled: true,
    origin: ['https://app.example.com'],
    credentials: true
  },

  security: {
    enabled: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true
    }
  },

  rateLimit: {
    enabled: true,
    login: { windowMs: 60000, max: 20 },
    token: { windowMs: 60000, max: 100 }
  }
}));
```

**Frontend code (Next.js example):**

```javascript
// pages/api/auth/callback.js
import { exchangeCodeForTokens } from '@/lib/sso';

export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Store in HTTP-only cookie
    res.setHeader('Set-Cookie', [
      `access_token=${tokens.access_token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
      `refresh_token=${tokens.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Strict`
    ]);

    // Redirect to app
    res.redirect('/dashboard');
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}
```

```javascript
// lib/sso.js
export async function exchangeCodeForTokens(code) {
  const response = await fetch('https://sso.example.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`)}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: `${process.env.APP_URL}/api/auth/callback`
    })
  });

  const tokens = await response.json();
  return tokens;
}

// Get access token from request
export function getAccessToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/access_token=([^;]*)/);
  return match ? match[1] : null;
}

// Refresh token when expired
export async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://sso.example.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`)}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  return await response.json();
}
```

**Login link:**

```javascript
// pages/login.js
export default function LoginPage() {
  const handleLogin = () => {
    const authUrl = new URL('https://sso.example.com/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`);
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', generateRandomState());

    window.location = authUrl.toString();
  };

  return <button onClick={handleLogin}>Sign In</button>;
}
```

**Characteristics:**
- ✅ Secure (HTTP-only cookies)
- ✅ Refresh token support
- ✅ HTTPS required
- ✅ Rate limiting
- ✅ HSTS headers

---

## Pattern 3: Mobile App (PKCE Required)

**Perfect for:** React Native, Flutter, native iOS/Android apps

**PKCE adds security layer:** Authorization code alone isn't safe for mobile apps (no secure storage for client secret). PKCE compensates.

**JavaScript implementation:**

```javascript
// sso-client.js - Reusable PKCE client
import * as Crypto from 'crypto';
import * as Base64 from 'base64-js';

export class PKCEClient {
  constructor(config) {
    this.issuer = config.issuer;
    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.scopes = config.scopes || ['openid', 'profile'];
  }

  // Step 1: Generate PKCE verifier and challenge
  generatePKCE() {
    const verifier = this._generateRandomString(128);
    const challenge = this._createChallenge(verifier);

    return { verifier, challenge };
  }

  // Step 2: Build authorization URL
  buildAuthorizationUrl(pkce, state) {
    const url = new URL(`${this.issuer}/oauth/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.toString();
  }

  // Step 3: Exchange code for tokens
  async exchangeCode(code, pkce) {
    const response = await fetch(`${this.issuer}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,  // No secret needed!
        code: code,
        code_verifier: pkce.verifier,  // Prove we own the challenge
        redirect_uri: this.redirectUri
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    return await response.json();
  }

  // Step 4: Refresh token when expired
  async refreshToken(refreshToken) {
    const response = await fetch(`${this.issuer}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        refresh_token: refreshToken
      })
    });

    return await response.json();
  }

  // Helper: Generate random string for state and verifier
  _generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const randomValues = new Uint8Array(length);
    Crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      result += chars[randomValues[i] % chars.length];
    }
    return result;
  }

  // Helper: Create S256 code challenge
  _createChallenge(verifier) {
    const hash = Crypto.createHash('sha256')
      .update(verifier)
      .digest();
    return Base64.fromByteArray(hash)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
```

**React Native example:**

```javascript
// hooks/useSSO.js
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { PKCEClient } from '@/lib/sso-client';

export function useSSO() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const client = new PKCEClient({
    issuer: 'https://sso.example.com',
    clientId: 'mobile-app',
    redirectUri: 'myapp://callback',
    scopes: ['openid', 'profile', 'email', 'offline_access']
  });

  useEffect(() => {
    // Check if already logged in
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const accessToken = await SecureStore.getItemAsync('access_token');
      if (accessToken) {
        // Token still valid?
        const user = await validateToken(accessToken);
        if (user) {
          setUser(user);
        } else {
          // Try refresh
          await refreshAuth();
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    try {
      setLoading(true);

      // Generate PKCE
      const pkce = client.generatePKCE();
      await SecureStore.setItemAsync('pkce_verifier', pkce.verifier);

      // Generate state
      const state = generateRandomString(32);
      await SecureStore.setItemAsync('oauth_state', state);

      // Open authorization URL
      const authUrl = client.buildAuthorizationUrl(pkce, state);
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        'myapp://callback'
      );

      if (result.type === 'success') {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        // Verify state
        const savedState = await SecureStore.getItemAsync('oauth_state');
        if (returnedState !== savedState) {
          throw new Error('State mismatch - possible CSRF attack');
        }

        // Exchange code for tokens
        const verifier = await SecureStore.getItemAsync('pkce_verifier');
        const tokens = await client.exchangeCode(code, { verifier });

        // Store tokens securely
        await SecureStore.setItemAsync('access_token', tokens.access_token);
        await SecureStore.setItemAsync('refresh_token', tokens.refresh_token);

        // Get user info
        const user = await fetchUserInfo(tokens.access_token);
        setUser(user);
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function refreshAuth() {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (!refreshToken) {
        logout();
        return;
      }

      const tokens = await client.refreshToken(refreshToken);

      // Update stored tokens
      await SecureStore.setItemAsync('access_token', tokens.access_token);
      if (tokens.refresh_token) {
        await SecureStore.setItemAsync('refresh_token', tokens.refresh_token);
      }

      // Get updated user info
      const user = await fetchUserInfo(tokens.access_token);
      setUser(user);
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
    }
  }

  async function logout() {
    // Revoke token
    const accessToken = await SecureStore.getItemAsync('access_token');
    if (accessToken) {
      try {
        await fetch('https://sso.example.com/oauth/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: accessToken,
            client_id: client.clientId
          })
        });
      } catch (error) {
        console.error('Revocation failed (non-critical):', error);
      }
    }

    // Clear local storage
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('pkce_verifier');
    await SecureStore.deleteItemAsync('oauth_state');

    setUser(null);
  }

  return { user, loading, login, logout, refreshAuth };
}
```

**Characteristics:**
- ✅ PKCE mandatory (no secrets in app)
- ✅ Tokens stored securely (encrypted storage)
- ✅ Refresh token rotation
- ✅ Deep linking support

---

## Pattern 4: Service-to-Service (Client Credentials)

**Perfect for:** Microservices, webhooks, scheduled jobs, CLI tools

**No user login involved** - machine-to-machine authentication

```javascript
// api-gateway.js - Validates service tokens
import { OIDCClient } from 's3db.js';

const oidcClient = new OIDCClient({
  issuer: 'https://sso.example.com',
  audience: 'api-gateway'  // Your API identifier
});

await oidcClient.initialize();  // Fetch JWKS

app.use('/api', oidcClient.middleware);

app.get('/api/orders', (req, res) => {
  // req.user contains decoded token
  const clientId = req.user.sub;
  const scopes = req.user.scope.split(' ');

  // Check permissions
  if (!scopes.includes('read:orders')) {
    return res.status(403).json({ error: 'Insufficient scopes' });
  }

  // Authorized!
  res.json({ orders: [...] });
});
```

```javascript
// notification-worker.js - Gets token and calls API
import { getServiceToken } from '@/lib/sso';

async function sendNotification() {
  // Get token
  const token = await getServiceToken({
    issuer: 'https://sso.example.com',
    clientId: 'notification-service',
    clientSecret: process.env.NOTIFICATION_SERVICE_SECRET,
    scopes: ['read:users', 'write:notifications']
  });

  // Call API with token
  const response = await fetch('https://api.example.com/api/notifications', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: 'user123',
      message: 'Your order is ready'
    })
  });

  return response.json();
}
```

```javascript
// lib/sso.js - Token caching
const tokenCache = new Map();

export async function getServiceToken(config) {
  const cacheKey = `${config.clientId}:${config.scopes.join(',')}`;

  // Check cache
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  // Get new token
  const response = await fetch(`${config.issuer}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: config.scopes.join(' ')
    })
  });

  const token = await response.json();

  // Cache with margin (refresh 60s before expiry)
  const expiresAt = Date.now() + (token.expires_in * 1000) - 60000;
  tokenCache.set(cacheKey, { ...token, expiresAt });

  return token;
}
```

**Characteristics:**
- ✅ No user login
- ✅ Can cache tokens
- ✅ Service credentials in backend only
- ✅ Scope-based permissions

---

## Pattern 5: Multi-Tenant SaaS

**Perfect for:** SaaS platforms with multiple customers

```javascript
import { Database } from 's3db.js';
import { IdentityPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3_CONNECTION_STRING,
  encryptionKey: process.env.ENCRYPTION_KEY
});

await db.connect();

// Single plugin instance, multi-tenant
await db.usePlugin(new IdentityPlugin({
  port: 443,
  issuer: 'https://sso.example.com',

  supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api', 'admin'],

  // Customize user resource
  resources: {
    users: {
      name: 'app_users',
      attributes: {
        // Base schema + custom fields
        tenantId: 'string|required',
        department: 'string|default:general',
        role: 'string|enum:user,admin,owner',
        customerId: 'string'  // Link to CRM
      },
      partitions: {
        // O(1) lookups by tenant
        byTenant: {
          fields: { tenantId: 'string' }
        }
      },
      hooks: {
        // Auto-assign tenant from context
        beforeInsert: async (data, context) => {
          data.tenantId = context.tenantId;
          data.role = data.role || 'user';
          return data;
        }
      }
    },

    clients: {
      name: 'app_oauth_clients',
      attributes: {
        tenantId: 'string|required',
        logoUrl: 'url'
      },
      partitions: {
        byTenant: {
          fields: { tenantId: 'string' }
        }
      }
    }
  }
}));

// Create tenant A
const tenantA = 'acme-corp';
const tenantB = 'widgets-inc';

// Users for Tenant A
await db.resources.app_users.insert({
  email: 'john@acme.com',
  password: 'secure123',
  tenantId: tenantA,
  department: 'engineering',
  role: 'admin'
});

// Client for Tenant A
await db.resources.app_oauth_clients.insert({
  clientId: 'acme-app',
  clientSecret: 'acme-secret',
  tenantId: tenantA,
  redirectUris: ['https://acme.example.com/callback'],
  allowedScopes: ['openid', 'profile', 'email', 'read:api']
});

// Users for Tenant B
await db.resources.app_users.insert({
  email: 'jane@widgets.com',
  password: 'secure456',
  tenantId: tenantB,
  department: 'sales',
  role: 'owner'
});

// Client for Tenant B
await db.resources.app_oauth_clients.insert({
  clientId: 'widgets-app',
  clientSecret: 'widgets-secret',
  tenantId: tenantB,
  redirectUris: ['https://widgets.example.com/callback'],
  allowedScopes: ['openid', 'profile', 'email', 'write:api']
});
```

**API enforces tenant isolation:**

```javascript
// middleware/tenant-isolation.js
export function tenantIsolation(req, res, next) {
  // Extract tenant from domain or header
  const tenant = req.subdomains[0] || req.headers['x-tenant-id'];

  if (!tenant) {
    return res.status(400).json({ error: 'Missing tenant' });
  }

  // Store in context
  req.tenantId = tenant;
  next();
}

// routes/users.js
app.get('/api/users', tenantIsolation, async (req, res) => {
  // Query only this tenant's users (via partition)
  const users = await db.resources.app_users.listPartition('byTenant', {
    tenantId: req.tenantId
  });

  res.json(users);
});

app.post('/api/users', tenantIsolation, async (req, res) => {
  // Automatically assigns tenant
  const user = await db.resources.app_users.insert({
    ...req.body,
    tenantId: req.tenantId  // Enforced here!
  });

  res.json(user);
});
```

**Characteristics:**
- ✅ Shared database (partition-based isolation)
- ✅ Per-tenant customization
- ✅ O(1) lookups via partitions
- ✅ Tenant enforcement via hooks
- ✅ Scalable to unlimited tenants

---

## Grant Type Selection Guide

**Decision tree:**

```
Does user login?
├─ No → client_credentials (service-to-service)
└─ Yes → authorization_code
   ├─ Has backend?
   │  ├─ Yes → authorization_code (can optionally use PKCE)
   │  └─ No → authorization_code + PKCE (mobile/SPA)
   └─ PKCE required?
      ├─ Yes → authorization_code + PKCE
      └─ No → authorization_code
```

**Quick reference:**

| Scenario | Grant Type | PKCE | Client Secret |
|----------|-----------|------|---------------|
| Web app with backend | authorization_code | Optional | Yes (required) |
| React/Vue SPA | authorization_code | **Required** | No |
| Mobile app | authorization_code | **Required** | No |
| CLI tool | device_code* | N/A | No |
| Microservice | client_credentials | N/A | Yes |
| Webhook | client_credentials | N/A | Yes |

*device_code not yet implemented

---

## Token Handling Best Practices

### Access Token

```javascript
// ✅ Access tokens are SHORT-LIVED (15 minutes typical)
// ✅ Used for API requests
// ✅ Should be refreshed when expired

// Get access token
const { access_token, expires_in } = await login();

// Use for API calls
fetch('https://api.example.com/orders', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});

// When it expires (after ~15 minutes), get a new one
```

### Refresh Token

```javascript
// ✅ Refresh tokens are LONG-LIVED (7 days typical)
// ✅ Used ONLY to get new access tokens
// ✅ Must be stored securely (HTTP-only cookies, encrypted storage)

// Store securely after login
// Mobile: Encrypted secure storage
// Web: HTTP-only secure cookie
// Desktop: System keyring

// When access token expires
const newTokens = await fetch('https://sso.example.com/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })
});

// Get new access token
const { access_token: newAccessToken } = await newTokens.json();
```

### ID Token

```javascript
// ✅ ID tokens contain USER INFO (name, email, profile pic)
// ✅ Used ONLY for user identification
// ✅ Verify signature before using!

// After login, extract user info
const idToken = tokens.id_token;  // JWT
const [header, payload, signature] = idToken.split('.');

// Decode payload (after verifying signature!)
const user = JSON.parse(atob(payload));
// {
//   sub: 'user123',
//   name: 'John Doe',
//   email: 'john@example.com',
//   email_verified: true,
//   picture: 'https://...'
// }

// ❌ NEVER use ID token for API authorization!
// ❌ NEVER store ID token long-term!
```

### Revocation Pattern

```javascript
// ✅ Revoke tokens on logout
async function logout(tokens) {
  // Revoke refresh token (stops future access)
  await fetch('https://sso.example.com/oauth/revoke', {
    method: 'POST',
    body: new URLSearchParams({
      token: tokens.refresh_token,
      token_type_hint: 'refresh_token'
    })
  });

  // Clear stored tokens
  clearTokenStorage();
}
```

---

## Common API Patterns

### Rate Limiting Awareness

```javascript
// IdentityPlugin applies rate limits per endpoint
// Hitting limits? See 429 response

const response = await fetch('https://sso.example.com/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({...})
});

if (response.status === 429) {
  // Retry-After header tells you when to retry
  const retryAfter = response.headers.get('Retry-After');
  console.log(`Rate limited. Retry after ${retryAfter}ms`);

  // Exponential backoff
  await sleep(Math.min(1000 * Math.pow(2, retries), 30000));
}
```

### Discovery Integration

```javascript
// ✅ Use discovery for flexibility
// Automatically get endpoints and keys

const discoveryUrl = 'https://sso.example.com/.well-known/openid-configuration';
const discovery = await fetch(discoveryUrl).then(r => r.json());

// Now you have:
// - discovery.token_endpoint
// - discovery.userinfo_endpoint
// - discovery.authorization_endpoint
// - discovery.jwks_uri
// - discovery.issuer
// - All supported scopes, grant types, etc.

// Use these instead of hardcoding URLs!
const token = await fetch(discovery.token_endpoint, {...});
```

---

## Next Steps

1. **Choose your pattern** - Pick the scenario that matches your use case
2. **Configure Identity Plugin** - Use settings from [Configuration Guide](/plugins/identity/guides/configuration.md)
3. **Implement login flow** - Copy code from pattern above
4. **Test with curl** - Verify endpoints work
5. **Troubleshoot** - Check [Best Practices Guide](/plugins/identity/guides/best-practices.md)

---

**Prev:** [← Configuration](/plugins/identity/guides/configuration.md)
**Next:** [Best Practices →](/plugins/identity/guides/best-practices.md)
**Main:** [← Identity Plugin](/plugins/identity/README.md)
