# 🔐 Identity Provider Plugin

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
- ✅ **Zero dependencies** - Built on Node.js native crypto
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

- [Quick Start](#-quick-start)
- [Installation](#installation)
- [Configuration Options](#-configuration-options)
- [Endpoints](#-endpoints)
- [Grant Types](#-grant-types)
- [Client Management](#-client-management)
- [User Management](#-user-management)
- [Security & Best Practices](#-security--best-practices)
- [Architecture Patterns](#-architecture-patterns)
- [Examples](#-examples)
- [Troubleshooting](#-troubleshooting)

---

## 🚀 Quick Start

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

## 📋 Configuration Options

### Complete Configuration

```javascript
{
  // HTTP Server
  port: 4000,                                // Port to listen on
  host: '0.0.0.0',                           // Host to bind to
  verbose: true,                             // Enable verbose logging

  // OAuth2/OIDC Core
  issuer: 'http://localhost:4000',          // Issuer URL (MUST match public URL)
  supportedScopes: [                         // Allowed scopes
    'openid',                                // OIDC - required for ID tokens
    'profile',                               // OIDC - name, picture, etc.
    'email',                                 // OIDC - email, email_verified
    'offline_access',                        // OAuth2 - refresh tokens
    'read:api',                              // Custom - API read access
    'write:api'                              // Custom - API write access
  ],
  supportedGrantTypes: [                     // Allowed grant types
    'authorization_code',                    // Web apps with backend
    'client_credentials',                    // Service-to-service
    'refresh_token'                          // Token renewal
  ],
  supportedResponseTypes: [                  // Allowed response types
    'code',                                  // Authorization code
    'token',                                 // Implicit flow (not recommended)
    'id_token'                               // OIDC implicit
  ],

  // Token Expiration
  accessTokenExpiry: '15m',                  // Access token lifetime
  idTokenExpiry: '15m',                      // ID token lifetime
  refreshTokenExpiry: '7d',                  // Refresh token lifetime
  authCodeExpiry: '10m',                     // Authorization code lifetime

  // User Resource
  userResource: 'users',                     // Name of users resource

  // CORS
  cors: {
    enabled: true,                           // Enable CORS
    origin: '*',                             // Allowed origins (* for dev only!)
    credentials: true,                       // Allow credentials
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },

  // Security Headers
  security: {
    enabled: true,                           // Enable security headers
    contentSecurityPolicy: {                 // CSP configuration
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    },
    hsts: {                                  // HSTS configuration
      maxAge: 31536000,                      // 1 year
      includeSubDomains: true,
      preload: true
    }
  },

  // Logging
  logging: {
    enabled: true,                           // Enable request logging
    format: ':method :path :status :response-time ms',
    tokens: {                                // Custom log tokens
      user: (c) => c.get('user')?.sub || 'anonymous',
      requestId: (c) => c.get('requestId') || 'none'
    }
  },

  // Rate Limiting
  rateLimit: {
    enabled: true,                           // Enable rate limiting
    windowMs: 60000,                         // 1 minute window
    max: 100,                                // 100 requests per window
    message: 'Too many requests from this IP',
    statusCode: 429,
    standardHeaders: true,                   // Return rate limit info in headers
    legacyHeaders: false                     // Disable X-RateLimit-* headers
  },

  // Compression
  compression: {
    enabled: true,                           // Enable response compression
    threshold: 1024,                         // Compress responses > 1KB
    level: 6,                                // Compression level (0-9)
    preferBrotli: true                       // Use Brotli over gzip
  }
}
```

---

## 🔌 Endpoints

The IdentityPlugin automatically creates **9 OAuth2/OIDC endpoints**:

### 1. Discovery Endpoint

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
  "scopes_supported": ["openid", "profile", "email", "read:api", "write:api", "offline_access"],
  "response_types_supported": ["code", "token", "id_token"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "code_challenge_methods_supported": ["S256"]
}
```

### 2. JWKS Endpoint

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

### 3. Token Endpoint

**POST `/oauth/token`**

Issues access tokens, ID tokens, and refresh tokens.

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

### 4. Authorization Endpoint (GET)

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

### 5. Authorization Endpoint (POST)

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

### 6. UserInfo Endpoint

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

### 7. Token Introspection

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

### 8. Token Revocation

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

### 9. Dynamic Client Registration

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

---

## 🔑 Grant Types

### 1. Client Credentials (Service-to-Service)

**Use Case:** Backend services authenticating with each other (no user involved).

**Flow:**
```
Service A → POST /oauth/token (client_id + client_secret)
         ← Access Token (no refresh token)
```

**Example:**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Authorization: Basic $(echo -n 'service-a:secret-key' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=read:api"
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

### 2. Authorization Code (Web Apps)

**Use Case:** Web applications with a backend server (user login flow).

**Flow:**
```
1. User → GET /oauth/authorize?... (browser)
2. User logs in with email/password
3. SSO → Redirect to callback?code=AUTH_CODE
4. App → POST /oauth/token (code + client_secret)
5. SSO → Access Token + ID Token + Refresh Token
```

**Example:**
```javascript
// Step 1: Redirect user to authorization page
window.location = 'http://localhost:4000/oauth/authorize?' + new URLSearchParams({
  response_type: 'code',
  client_id: 'app-client-123',
  redirect_uri: 'http://localhost:3000/callback',
  scope: 'openid profile email',
  state: generateRandomState(),
  nonce: generateRandomNonce()
});

// Step 2: User logs in (SSO handles this)

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
      'Authorization': 'Basic ' + Buffer.from('app-client-123:super-secret-key-456').toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: 'http://localhost:3000/callback'
    })
  });

  const tokens = await response.json();
  // {
  //   access_token: '...',
  //   id_token: '...',
  //   refresh_token: '...',
  //   expires_in: 900
  // }

  // Store tokens in session
  req.session.accessToken = tokens.access_token;
  req.session.refreshToken = tokens.refresh_token;

  res.redirect('/dashboard');
});
```

### 3. Refresh Token (Token Renewal)

**Use Case:** Renew expired access tokens without re-authentication.

**Flow:**
```
App → POST /oauth/token (refresh_token + client_secret)
    ← New Access Token + New Refresh Token
```

**Example:**
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN" \
  -d "client_id=app-client-123" \
  -d "client_secret=super-secret-key-456"
```

### 4. PKCE (Proof Key for Code Exchange)

**Use Case:** Mobile apps and SPAs (public clients without client_secret).

**Flow:**
```
1. App generates code_verifier (random 43-128 chars)
2. App generates code_challenge = base64url(sha256(code_verifier))
3. App → GET /oauth/authorize?...&code_challenge=CHALLENGE&code_challenge_method=S256
4. SSO → Redirect with authorization code
5. App → POST /oauth/token (code + code_verifier)
```

**Example:**
```javascript
import crypto from 'crypto';

// Step 1: Generate code_verifier
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// Step 2: Generate code_challenge
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Step 3: Authorization request
window.location = 'http://localhost:4000/oauth/authorize?' + new URLSearchParams({
  response_type: 'code',
  client_id: 'mobile-app',
  redirect_uri: 'myapp://callback',
  scope: 'openid profile',
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
  state: generateRandomState()
});

// Step 4: Token request (with code_verifier)
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

---

## 👥 Client Management

### Auto-Created Resource: `plg_oauth_clients`

The IdentityPlugin automatically creates a resource to store OAuth2 clients:

```javascript
{
  name: 'plg_oauth_clients',
  attributes: {
    clientId: 'string|required',              // Unique client identifier
    clientSecret: 'secret|required',          // Client secret (AES-256-GCM encrypted)
    name: 'string',                           // Human-readable name
    redirectUris: 'array|items:string',       // Allowed redirect URIs
    allowedScopes: 'array|items:string',      // Scopes this client can request
    grantTypes: 'array|items:string',         // Allowed grant types
    active: 'boolean|default:true',           // Client status
    createdAt: 'string',
    updatedAt: 'string'
  }
}
```

### Creating Clients Manually

```javascript
const clientsResource = db.resources.plg_oauth_clients;

const client = await clientsResource.insert({
  clientId: 'my-app-123',
  clientSecret: 'my-super-secret-key',
  name: 'My Application',
  redirectUris: [
    'http://localhost:3000/callback',
    'https://myapp.com/callback'
  ],
  allowedScopes: ['openid', 'profile', 'email', 'read:api'],
  grantTypes: ['authorization_code', 'refresh_token'],
  active: true
});

console.log('✅ Client created:', client.clientId);
```

### Creating Clients Dynamically (RFC 7591)

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

### Client Secret Rotation

```javascript
const clientsResource = db.resources.plg_oauth_clients;

// Generate new secret
const newSecret = crypto.randomBytes(32).toString('base64url');

// Update client
await clientsResource.update(clientId, {
  clientSecret: newSecret
});

console.log('✅ Client secret rotated');
```

---

## 👤 User Management

### Auto-Created Resource: `users`

The IdentityPlugin automatically creates (or uses existing) users resource:

```javascript
{
  name: 'users',
  attributes: {
    email: 'string|required|email',          // User email (username)
    password: 'secret|required',             // Password (AES-256-GCM encrypted)
    name: 'string',                          // Full name
    givenName: 'string',                     // First name
    familyName: 'string',                    // Last name
    picture: 'url',                          // Profile picture URL
    emailVerified: 'boolean|default:false',  // Email verification status
    locale: 'string',                        // User locale (en-US, pt-BR)
    scopes: 'array|items:string',            // User scopes
    active: 'boolean|default:true',          // Account status
    createdAt: 'string',
    updatedAt: 'string'
  }
}
```

### Creating Users

```javascript
const usersResource = db.resources.users;

const user = await usersResource.insert({
  email: 'john@example.com',
  password: 'SecurePassword123!',
  name: 'John Doe',
  givenName: 'John',
  familyName: 'Doe',
  scopes: ['openid', 'profile', 'email', 'read:api'],
  emailVerified: false,
  active: true
});

console.log('✅ User created:', user.email);
```

### User Scopes

Scopes control what resources a user can access:

```javascript
// Admin user - full access
await usersResource.insert({
  email: 'admin@example.com',
  password: 'Admin123!',
  scopes: ['openid', 'profile', 'email', 'read:api', 'write:api', 'admin:all']
});

// Read-only user
await usersResource.insert({
  email: 'viewer@example.com',
  password: 'Viewer123!',
  scopes: ['openid', 'profile', 'email', 'read:api']
});

// Limited user
await usersResource.insert({
  email: 'guest@example.com',
  password: 'Guest123!',
  scopes: ['openid', 'profile']
});
```

---

## 🛡️ Security & Best Practices

### 1. Token Signing (RS256)

The IdentityPlugin uses **RS256 (RSA + SHA256)** for JWT signing:

- ✅ **Asymmetric keys** - Private key only on Authorization Server
- ✅ **Public key distribution** - Via JWKS endpoint
- ✅ **Resource Servers validate** - Without calling Authorization Server
- ✅ **Key rotation** - Automatic kid (Key ID) in JWT header

**Auto-Generated RSA Keys:**
```javascript
// On first startup, IdentityPlugin generates:
{
  kid: '2024-01-15T10:30:00.000Z',     // Timestamp-based Key ID
  publicKey: '-----BEGIN PUBLIC KEY-----\n...',
  privateKey: '-----BEGIN PRIVATE KEY-----\n...',
  algorithm: 'RS256',
  use: 'sig',
  active: true
}
```

### 2. PKCE (Proof Key for Code Exchange)

Enable PKCE for mobile apps and SPAs:

```javascript
// Client (mobile app)
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

// Authorization request with code_challenge
window.location = `http://localhost:4000/oauth/authorize?...&code_challenge=${codeChallenge}&code_challenge_method=S256`;

// Token request with code_verifier
fetch('/oauth/token', {
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    code_verifier: codeVerifier  // ← Server verifies: sha256(code_verifier) === code_challenge
  })
});
```

### 3. HTTPS in Production

**CRITICAL:** Always use HTTPS in production:

```javascript
const identityPlugin = new IdentityPlugin({
  issuer: 'https://sso.example.com',  // ← HTTPS!
  // ...
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

### 4. Client Secret Security

**Best Practices:**
- ✅ Generate long, random secrets (32+ bytes)
- ✅ Store in environment variables
- ✅ Rotate regularly (every 90 days)
- ✅ Use different secrets per environment
- ❌ Never commit to Git
- ❌ Never log or expose in error messages

```javascript
// Good - from environment
clientSecret: process.env.OAUTH_CLIENT_SECRET

// Bad - hardcoded
clientSecret: 'my-secret-123'
```

### 5. CORS Configuration

Restrict CORS in production:

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

### 6. Rate Limiting

Protect against brute force attacks:

```javascript
rateLimit: {
  enabled: true,
  windowMs: 60000,        // 1 minute
  max: 100,               // 100 requests per minute per IP
  message: 'Too many requests, please try again later'
}
```

### 7. Token Expiration

Use short-lived access tokens:

```javascript
accessTokenExpiry: '15m',      // Access tokens expire in 15 minutes
idTokenExpiry: '15m',          // ID tokens expire in 15 minutes
refreshTokenExpiry: '7d',      // Refresh tokens expire in 7 days
authCodeExpiry: '10m'          // Auth codes expire in 10 minutes
```

### 8. State Parameter (CSRF Protection)

Always use state parameter in authorization_code flow:

```javascript
// Client - generate random state
const state = crypto.randomBytes(16).toString('base64url');
req.session.oauthState = state;

// Authorization request
window.location = `/oauth/authorize?...&state=${state}`;

// Callback handler - verify state
app.get('/callback', (req, res) => {
  if (req.query.state !== req.session.oauthState) {
    return res.status(400).send('Invalid state - possible CSRF attack');
  }
  // ...
});
```

---

## 🏗️ Architecture Patterns

### Pattern 1: Single SSO Server + Multiple Resource Servers

```
                    ┌─────────────────────┐
                    │   SSO Server        │
                    │   (IdentityPlugin)  │
                    │   Port 4000         │
                    │                     │
                    │ - Manages users     │
                    │ - Issues tokens     │
                    │ - JWKS endpoint     │
                    └──────────┬──────────┘
                               │
                               │ Tokens (RS256 JWT)
               ┌───────────────┼───────────────┐
               │               │               │
               ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │ Orders API  │ │ Products API│ │ Payments API│
        │ (ApiPlugin) │ │ (ApiPlugin) │ │ (ApiPlugin) │
        │ Port 3001   │ │ Port 3002   │ │ Port 3003   │
        │             │ │             │ │             │
        │ Validates   │ │ Validates   │ │ Validates   │
        │ tokens via  │ │ tokens via  │ │ tokens via  │
        │ JWKS        │ │ JWKS        │ │ JWKS        │
        └─────────────┘ └─────────────┘ └─────────────┘
```

**Benefits:**
- ✅ Centralized user management
- ✅ Single authentication point
- ✅ Same token works across all APIs
- ✅ No inter-service calls for auth (uses JWKS)

### Pattern 2: Multi-Tenant SSO

```
                    ┌─────────────────────┐
                    │   SSO Server        │
                    │   (IdentityPlugin)  │
                    │                     │
                    │ - Tenant A users    │
                    │ - Tenant B users    │
                    │ - Tenant C users    │
                    └──────────┬──────────┘
                               │
                               │ Tokens with tenant_id claim
               ┌───────────────┼───────────────┐
               │               │               │
               ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │ API Service │ │ API Service │ │ API Service │
        │             │ │             │ │             │
        │ req.user    │ │ req.user    │ │ req.user    │
        │ .tenant_id  │ │ .tenant_id  │ │ .tenant_id  │
        │   → filter  │ │   → filter  │ │   → filter  │
        │     data    │ │     data    │ │     data    │
        └─────────────┘ └─────────────┘ └─────────────┘
```

**Implementation:**
```javascript
// SSO - Add tenant_id to token
const token = await oauth2.generateToken({
  sub: user.id,
  scope: 'openid profile',
  tenant_id: user.tenantId  // ← Custom claim
});

// API - Filter by tenant
api.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    const tenantId = req.user.tenant_id;  // From validated token
    const orders = await ordersResource.query({ tenantId });
    res.json({ orders });
  },
  auth: 'oidc'
});
```

---

## 📚 Examples

### Example 1: SSO Server Setup

**File:** `docs/examples/e80-sso-oauth2-server.js`

Complete SSO server with user management and client registration.

```bash
node docs/examples/e80-sso-oauth2-server.js
```

### Example 2: Resource Server (Orders API)

**File:** `docs/examples/e81-oauth2-resource-server.js`

API that validates tokens from SSO server using OIDC driver.

```bash
node docs/examples/e81-oauth2-resource-server.js
```

### Example 3: Web Application (Authorization Code Flow)

**File:** `docs/examples/e82-oidc-web-app.js`

Web app with "Login with SSO" button and dashboard.

```bash
node docs/examples/e82-oidc-web-app.js
```

### Example 4: Microservices Architecture

**File:** `docs/examples/e60-oauth2-microservices.js`

Complete microservices setup with SSO + Orders API + Products API.

```bash
node docs/examples/e60-oauth2-microservices.js
```

---

## 🔧 Troubleshooting

### Issue 1: "Invalid token signature"

**Cause:** Resource Server has cached old JWKS.

**Solution:**
```javascript
// Set lower JWKS cache TTL
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',
  jwksCacheTTL: 300000  // 5 minutes (default: 1 hour)
});
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
  // ...
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

---

## 🆚 IdentityPlugin vs Alternatives

| Feature | IdentityPlugin | Keycloak | Azure AD | Auth0 |
|---------|---------------|----------|----------|-------|
| **Deployment** | Self-hosted | Self-hosted | Cloud | Cloud |
| **Database** | S3 + MinIO | PostgreSQL | Azure SQL | Proprietary |
| **Dependencies** | 2 (hono + @hono/node-server) | Java + DB | N/A | N/A |
| **OAuth2 Grants** | 4 | 6 | 5 | 6 |
| **OIDC** | ✅ | ✅ | ✅ | ✅ |
| **Token Signing** | RS256 | RS256, ES256 | RS256 | RS256, ES256 |
| **Cost** | Free | Free | $$$ | $$$ |
| **Setup Time** | 5 min | 30 min | 60 min | 15 min |
| **Customization** | Full code access | Limited | Very Limited | Limited |
| **Data Privacy** | Your infrastructure | Your infrastructure | Microsoft | Auth0 |

**When to use IdentityPlugin:**
- ✅ Need full control over authentication
- ✅ Want to use S3 as backend
- ✅ Microservices architecture
- ✅ Self-hosted infrastructure
- ✅ Budget constraints (free)

**When NOT to use IdentityPlugin:**
- ❌ Need social login (Google, Facebook) → Use Auth0
- ❌ Need SAML/LDAP → Use Keycloak
- ❌ Enterprise compliance (SOC2, ISO 27001) → Use Azure AD
- ❌ Need advanced features (adaptive auth, bot detection) → Use Auth0/Azure AD

---

## 📖 Related Documentation

- **[API Plugin](./api.md)** - Resource Server documentation
- **[OAuth2/OIDC Guide](../oauth2-guide.md)** - Complete OAuth2 guide (1,500+ lines)
- **[Examples](../examples/)** - Working examples (e80, e81, e82, e60)

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
1. Read [Quick Start](#-quick-start)
2. Run example: `node docs/examples/e80-sso-oauth2-server.js`
3. Create Resource Server: [e81-oauth2-resource-server.js](../examples/e81-oauth2-resource-server.js)
4. Build web app: [e82-oidc-web-app.js](../examples/e82-oidc-web-app.js)
