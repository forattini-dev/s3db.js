# OAuth2 + OpenID Connect with s3db.js

Complete OAuth2 and OpenID Connect (OIDC) implementation for microservices architecture using s3db.js.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [SSO Service (Authorization Server)](#sso-service-authorization-server)
- [Resource Servers](#resource-servers)
- [Token Flows](#token-flows)
- [Security](#security)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Examples](#examples)

---

## Overview

s3db.js provides a complete OAuth2 + OIDC implementation that enables microservices to:

- **Centralized Authentication**: Single SSO service manages all user authentication
- **Distributed Authorization**: Resource servers validate tokens independently
- **Standard Protocols**: Full OAuth2 and OpenID Connect compliance
- **RS256 Signing**: Asymmetric keys (no shared secrets)
- **Zero Dependencies**: Built on Node.js crypto only

### Key Features

✅ **OAuth2 Flows**:
- Client Credentials (service-to-service)
- Authorization Code (web applications)
- Refresh Token (long-lived sessions)

✅ **OIDC Support**:
- Discovery document (`.well-known/openid-configuration`)
- JWKS endpoint (public key distribution)
- ID Tokens with user claims
- UserInfo endpoint

✅ **Security**:
- RS256 (RSA-SHA256) token signing
- Key rotation support
- PKCE (Proof Key for Code Exchange)
- Token introspection (RFC 7662)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MICROSERVICES ARCHITECTURE                   │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│   Client App     │
└────────┬─────────┘
         │
         │ 1. POST /auth/token
         │    (client_id + client_secret)
         ▼
┌──────────────────────────────────────┐
│   SSO Service (Port 3000)            │
│   Authorization Server               │
│                                      │
│   • Manages users                    │
│   • Issues RS256 tokens              │
│   • Stores private key               │
│   • Exposes public key (JWKS)        │
└──────────────┬───────────────────────┘
               │
               │ 2. Returns Access Token
               │    (signed with private key)
               ▼
         ┌──────────┐
         │  Client  │
         └─────┬────┘
               │
       ┌───────┴────────┐
       │                │
       │ 3. GET /orders │ 3. GET /products
       │    + Bearer    │    + Bearer
       ▼                ▼
┌─────────────┐   ┌─────────────┐
│ Orders API  │   │ Products API│
│ (Port 3001) │   │ (Port 3002) │
│             │   │             │
│ • Fetches   │   │ • Fetches   │
│   JWKS      │   │   JWKS      │
│ • Verifies  │   │ • Verifies  │
│   token     │   │   token     │
│ • Validates │   │ • Validates │
│   claims    │   │   claims    │
└─────────────┘   └─────────────┘
```

### Components

1. **SSO Service** (Authorization Server)
   - Issues tokens
   - Manages user authentication
   - Exposes public keys via JWKS

2. **Resource Servers** (APIs)
   - Validate tokens locally using public keys
   - No direct communication with SSO for validation
   - Cache JWKS for performance

3. **Clients** (Applications)
   - Request tokens from SSO
   - Use tokens to access resource servers

---

## Quick Start

### 1. Install Dependencies

```bash
npm install s3db.js
```

### 2. Create SSO Service

```javascript
import Database from 's3db.js';
import { APIPlugin } from 's3db.js/plugins/api';
import { OAuth2Server } from 's3db.js/plugins/api/auth/oauth2-server';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/sso',
  encryptionKey: 'your-encryption-key'
});

await db.connect();

// Create resources
const usersResource = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',
    name: 'string'
  }
});

const keysResource = await db.createResource({
  name: 'oauth_keys',
  attributes: {
    kid: 'string|required',
    publicKey: 'string|required',
    privateKey: 'secret|required',
    active: 'boolean'
  }
});

// Initialize OAuth2 server
const oauth2 = new OAuth2Server({
  issuer: 'http://localhost:3000',
  keyResource: keysResource,
  userResource: usersResource
});

await oauth2.initialize();

// Create API
const api = new APIPlugin({ port: 3000 });

api.addRoute({
  path: '/.well-known/jwks.json',
  method: 'GET',
  handler: oauth2.jwksHandler.bind(oauth2),
  auth: false
});

api.addRoute({
  path: '/auth/token',
  method: 'POST',
  handler: oauth2.tokenHandler.bind(oauth2),
  auth: false
});

await db.use(api);
```

### 3. Create Resource Server

```javascript
import Database from 's3db.js';
import { APIPlugin } from 's3db.js/plugins/api';
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/orders'
});

await db.connect();

// Initialize OIDC client
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000',
  audience: 'http://localhost:3001'
});

await oidcClient.initialize();

// Create API
const api = new APIPlugin({ port: 3001 });

// Add OIDC auth driver
api.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

// Protected route
api.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    // req.user contains validated token payload
    res.json({ user: req.user });
  },
  auth: 'oidc'
});

await db.use(api);
```

### 4. Get Access Token

```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test&client_secret=secret&scope=openid"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

### 5. Use Access Token

```bash
curl http://localhost:3001/orders \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

---

## SSO Service (Authorization Server)

The SSO service is the central authentication authority that issues tokens.

### Setup

```javascript
import { OAuth2Server } from 's3db.js/plugins/api/auth/oauth2-server';

const oauth2 = new OAuth2Server({
  issuer: 'https://sso.example.com',
  keyResource: keysResource,        // Stores RSA key pairs
  userResource: usersResource,      // User accounts
  clientResource: clientsResource,  // OAuth clients (optional)
  authCodeResource: authCodesResource, // Auth codes (optional)

  // Token expiry
  accessTokenExpiry: '15m',
  idTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  authCodeExpiry: '10m',

  // Supported features
  supportedScopes: ['openid', 'profile', 'email', 'offline_access'],
  supportedGrantTypes: ['client_credentials', 'authorization_code', 'refresh_token'],
  supportedResponseTypes: ['code', 'token', 'id_token']
});

await oauth2.initialize();
```

### Required Resources

#### 1. Users Resource

```javascript
const usersResource = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',
    name: 'string',
    givenName: 'string',
    familyName: 'string',
    picture: 'url',
    emailVerified: 'boolean',
    locale: 'string'
  }
});
```

#### 2. OAuth Keys Resource

```javascript
const keysResource = await db.createResource({
  name: 'oauth_keys',
  attributes: {
    kid: 'string|required',
    publicKey: 'string|required',
    privateKey: 'secret|required',
    algorithm: 'string',
    use: 'string',
    active: 'boolean',
    createdAt: 'string'
  }
});
```

#### 3. OAuth Clients Resource (Optional)

```javascript
const clientsResource = await db.createResource({
  name: 'oauth_clients',
  attributes: {
    clientId: 'string|required',
    clientSecret: 'secret|required',
    name: 'string',
    redirectUris: 'array|items:string',
    grantTypes: 'array|items:string',
    scopes: 'array|items:string'
  }
});
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/openid-configuration` | GET | OIDC discovery document |
| `/.well-known/jwks.json` | GET | Public keys (JWKS) |
| `/auth/token` | POST | Token endpoint (all grant types) |
| `/auth/userinfo` | GET | User claims endpoint |
| `/auth/introspect` | POST | Token introspection (RFC 7662) |

### Key Rotation

```javascript
// Rotate keys (generates new RSA pair, marks old keys inactive)
await oauth2.rotateKeys();
```

Recommended rotation frequency: Every 90 days

---

## Resource Servers

Resource servers validate tokens issued by the SSO service.

### Setup

```javascript
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

const oidcClient = new OIDCClient({
  issuer: 'https://sso.example.com',
  audience: 'https://api.example.com',
  jwksCacheTTL: 3600000,  // 1 hour
  clockTolerance: 60,      // 60 seconds
  autoRefreshJWKS: true    // Auto-refresh keys
});

await oidcClient.initialize();
```

### Integration with API Plugin

```javascript
// Add OIDC auth driver
apiPlugin.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

// Protected route
apiPlugin.addRoute({
  path: '/protected',
  method: 'GET',
  handler: async (req, res) => {
    // req.user contains validated token payload
    // req.token contains raw JWT
    res.json({ user: req.user });
  },
  auth: 'oidc'
});

// Public route
apiPlugin.addRoute({
  path: '/public',
  method: 'GET',
  handler: (req, res) => {
    res.json({ message: 'Public endpoint' });
  },
  auth: false
});
```

### Token Validation

The OIDC client automatically:

1. ✅ Fetches JWKS from SSO service
2. ✅ Caches public keys (configurable TTL)
3. ✅ Verifies RS256 signature
4. ✅ Validates claims (iss, aud, exp, nbf, iat)
5. ✅ Handles clock skew (configurable tolerance)
6. ✅ Auto-refreshes JWKS periodically

### Manual Token Verification

```javascript
const verification = await oidcClient.verifyToken(token);

if (verification.valid) {
  console.log('User:', verification.payload.sub);
  console.log('Scopes:', verification.payload.scope);
} else {
  console.error('Invalid token:', verification.error);
}
```

---

## Token Flows

### 1. Client Credentials Flow

**Use Case**: Service-to-service authentication (no user involved)

**Flow**:
```
Client → POST /auth/token
  {
    grant_type: "client_credentials",
    client_id: "service-a",
    client_secret: "secret",
    scope: "api:read api:write"
  }

SSO → Response
  {
    access_token: "eyJhbGci...",
    token_type: "Bearer",
    expires_in: 900,
    scope: "api:read api:write"
  }

Client → GET /api/resource
  Authorization: Bearer eyJhbGci...

Resource Server → Validates token → Returns data
```

**Example**:
```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=service-a" \
  -d "client_secret=secret" \
  -d "scope=openid profile"
```

### 2. Authorization Code Flow

**Use Case**: Web applications with backend (involves user login)

**Flow**:
```
1. Client redirects user to SSO:
   GET /auth/authorize?
     response_type=code&
     client_id=webapp&
     redirect_uri=https://app.com/callback&
     scope=openid profile email&
     state=random-state

2. User logs in, SSO redirects back:
   https://app.com/callback?code=AUTH_CODE&state=random-state

3. Client exchanges code for tokens:
   POST /auth/token
     {
       grant_type: "authorization_code",
       code: "AUTH_CODE",
       redirect_uri: "https://app.com/callback",
       client_id: "webapp",
       client_secret: "secret"
     }

4. SSO returns tokens:
   {
     access_token: "eyJhbGci...",
     id_token: "eyJhbGci...",     // User identity
     refresh_token: "refresh...",  // If offline_access scope
     token_type: "Bearer",
     expires_in: 900
   }
```

### 3. Refresh Token Flow

**Use Case**: Get new access token without re-authentication

**Flow**:
```
Client → POST /auth/token
  {
    grant_type: "refresh_token",
    refresh_token: "refresh...",
    client_id: "webapp",
    client_secret: "secret",
    scope: "openid profile"  // Optional, must be subset of original
  }

SSO → Response
  {
    access_token: "eyJhbGci...",
    id_token: "eyJhbGci...",
    token_type: "Bearer",
    expires_in: 900
  }
```

---

## Security

### RS256 vs HS256

s3db.js uses **RS256** (RSA-SHA256) for OAuth2/OIDC tokens instead of HS256:

| Feature | RS256 | HS256 |
|---------|-------|-------|
| Algorithm | Asymmetric (RSA) | Symmetric (HMAC) |
| Keys | Public + Private | Single shared secret |
| Microservices | ✅ Perfect | ❌ Requires shared secret |
| Key Distribution | Public key via JWKS | Secret must be distributed |
| Security | ✅ Higher | ⚠️ Secret leakage risk |

**Why RS256 for Microservices?**
- Resource servers only need public key (JWKS)
- No shared secrets between services
- Private key stays on SSO service only
- Public key can be cached and distributed freely

### Token Security

**Access Tokens**:
- Short-lived (default: 15 minutes)
- Contain minimal claims (sub, iss, aud, scope)
- Cannot be revoked (expire naturally)

**ID Tokens**:
- Short-lived (default: 15 minutes)
- Contain user identity claims
- Signed with RS256
- Include nonce for replay protection

**Refresh Tokens**:
- Long-lived (default: 7 days)
- Only for offline_access scope
- Should be stored securely
- Can be revoked via database

### PKCE (Proof Key for Code Exchange)

PKCE protects authorization code flow from interception attacks.

**Flow**:
```javascript
// 1. Generate code verifier
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// 2. Generate code challenge
const codeChallenge = crypto.createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// 3. Authorization request
GET /auth/authorize?
  response_type=code&
  client_id=app&
  code_challenge=CHALLENGE&
  code_challenge_method=S256

// 4. Token request
POST /auth/token
  {
    grant_type: "authorization_code",
    code: "AUTH_CODE",
    code_verifier: "VERIFIER"
  }
```

### Best Practices

1. ✅ **Use HTTPS in production**
2. ✅ **Rotate keys every 90 days**
3. ✅ **Keep private keys secure** (use encryption at rest)
4. ✅ **Validate all claims** (iss, aud, exp)
5. ✅ **Use short-lived access tokens** (15 minutes)
6. ✅ **Implement rate limiting** on token endpoint
7. ✅ **Log all authentication events**
8. ✅ **Use PKCE** for public clients (mobile, SPA)

---

## Configuration

### OAuth2Server Options

```javascript
new OAuth2Server({
  // Required
  issuer: 'https://sso.example.com',  // Issuer URL (must match in tokens)
  keyResource: keysResource,           // Resource for RSA key pairs
  userResource: usersResource,         // Resource for user accounts

  // Optional
  clientResource: clientsResource,     // OAuth clients (for client auth)
  authCodeResource: authCodesResource, // Authorization codes

  // Token expiry (format: 60s, 30m, 24h, 7d)
  accessTokenExpiry: '15m',
  idTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  authCodeExpiry: '10m',

  // Supported features
  supportedScopes: ['openid', 'profile', 'email', 'offline_access'],
  supportedGrantTypes: ['client_credentials', 'authorization_code', 'refresh_token'],
  supportedResponseTypes: ['code', 'token', 'id_token']
})
```

### OIDCClient Options

```javascript
new OIDCClient({
  // Required
  issuer: 'https://sso.example.com',   // SSO service URL

  // Optional
  audience: 'https://api.example.com', // Expected audience in tokens
  jwksUri: 'https://sso.example.com/.well-known/jwks.json', // Custom JWKS URL
  jwksCacheTTL: 3600000,               // JWKS cache duration (ms)
  clockTolerance: 60,                  // Clock skew tolerance (seconds)
  autoRefreshJWKS: true,               // Auto-refresh JWKS
  discoveryUri: 'https://sso.example.com/.well-known/openid-configuration'
})
```

---

## API Reference

### OAuth2Server

#### Methods

**`async initialize()`**
- Initializes key manager, loads or generates keys

**`async discoveryHandler(req, res)`**
- Handler for `GET /.well-known/openid-configuration`

**`async jwksHandler(req, res)`**
- Handler for `GET /.well-known/jwks.json`

**`async tokenHandler(req, res)`**
- Handler for `POST /auth/token` (all grant types)

**`async userinfoHandler(req, res)`**
- Handler for `GET /auth/userinfo`

**`async introspectHandler(req, res)`**
- Handler for `POST /auth/introspect`

**`async rotateKeys()`**
- Rotates RSA key pair, marks old keys inactive

### OIDCClient

#### Methods

**`async initialize()`**
- Fetches discovery document and JWKS

**`async fetchJWKS(force = false)`**
- Fetches JWKS from issuer

**`async verifyToken(token)`**
- Verifies RS256 token, returns `{ valid, header, payload, error }`

**`async middleware(req, res, next)`**
- Express middleware for route protection

**`async introspectToken(token, clientId, clientSecret)`**
- Introspect token via SSO service

**`getDiscovery()`**
- Returns cached discovery document

**`getJWKS()`**
- Returns cached JWKS

**`destroy()`**
- Cleanup resources (stop auto-refresh)

---

## Examples

### Complete Examples

- **`docs/examples/e60-oauth2-microservices.js`** - Full microservices architecture
  - SSO service (port 3000)
  - Orders API (port 3001)
  - Products API (port 3002)

### Run Example

```bash
# Start MinIO (required for s3db.js)
docker run -d -p 9000:9000 -p 9001:9001 \
  minio/minio server /data --console-address ":9001"

# Run example
node docs/examples/e60-oauth2-microservices.js
```

### Docker Compose

```yaml
version: '3.8'

services:
  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"

  sso:
    build: .
    ports:
      - "3000:3000"
    environment:
      S3DB_CONNECTION: http://minioadmin:minioadmin@minio:9000/sso
      S3DB_ENCRYPTION_KEY: change-in-production
      OAUTH2_ISSUER: http://sso:3000
    depends_on:
      - minio

  orders-api:
    build: .
    ports:
      - "3001:3001"
    environment:
      S3DB_CONNECTION: http://minioadmin:minioadmin@minio:9000/orders
      OAUTH2_ISSUER: http://sso:3000
    depends_on:
      - sso

  products-api:
    build: .
    ports:
      - "3002:3002"
    environment:
      S3DB_CONNECTION: http://minioadmin:minioadmin@minio:9000/products
      OAUTH2_ISSUER: http://sso:3000
    depends_on:
      - sso
```

---

## Troubleshooting

### Token Validation Fails

**Issue**: Resource server rejects valid tokens

**Solutions**:
1. Check issuer URL matches exactly (no trailing slash)
2. Verify JWKS is accessible from resource server
3. Check clock synchronization (use NTP)
4. Verify audience claim matches resource server

```javascript
// Debug token validation
const verification = await oidcClient.verifyToken(token);
console.log('Valid:', verification.valid);
console.log('Error:', verification.error);
console.log('Payload:', verification.payload);
```

### JWKS Not Found

**Issue**: `Public key not found for kid`

**Solutions**:
1. Force refresh JWKS: `await oidcClient.fetchJWKS(true)`
2. Check SSO service is running
3. Verify JWKS endpoint is accessible
4. Check key rotation didn't invalidate token

### Clock Skew Issues

**Issue**: Token rejected for exp/iat/nbf

**Solutions**:
1. Increase clock tolerance:
```javascript
new OIDCClient({
  clockTolerance: 300  // 5 minutes
})
```
2. Sync server clocks with NTP
3. Check timezone configuration

---

## Performance

### JWKS Caching

Resource servers cache JWKS to avoid fetching on every request:

```javascript
new OIDCClient({
  jwksCacheTTL: 3600000,  // 1 hour
  autoRefreshJWKS: true   // Refresh in background
})
```

**Performance impact**:
- Without cache: ~50-100ms per request (network overhead)
- With cache: <1ms per request (local verification only)

### Key Rotation

Rotating keys creates minimal disruption:

1. Generate new key pair
2. Mark old keys inactive
3. Continue accepting tokens signed with old keys until expiry
4. Resource servers fetch new JWKS automatically

**Recommended frequency**: Every 90 days

---

## Migration from HS256

If migrating from HS256 JWT to OAuth2/OIDC:

### Before (HS256)

```javascript
import { createToken, verifyToken } from 's3db.js/plugins/api/auth/jwt-auth';

// SSO Service
const token = createToken({ userId: '123' }, 'shared-secret');

// Resource Server
const payload = verifyToken(token, 'shared-secret');
```

### After (RS256 OAuth2/OIDC)

```javascript
// SSO Service
const oauth2 = new OAuth2Server({ ... });
const token = oauth2.keyManager.createToken({ sub: '123' });

// Resource Server
const oidcClient = new OIDCClient({ issuer: 'http://sso:3000' });
const verification = await oidcClient.verifyToken(token);
```

**Benefits**:
- No shared secrets
- Standard protocol (OAuth2/OIDC)
- Better security
- Key rotation support
- Introspection endpoint

---

## Additional Resources

- [OAuth 2.0 Spec (RFC 6749)](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [Token Introspection (RFC 7662)](https://datatracker.ietf.org/doc/html/rfc7662)
- [PKCE (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)
- [JWT Best Practices (RFC 8725)](https://datatracker.ietf.org/doc/html/rfc8725)

---

**Built with s3db.js** - Zero-dependency OAuth2 + OIDC for Node.js microservices
