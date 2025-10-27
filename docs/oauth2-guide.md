# OAuth2 + OpenID Connect Guide

**Complete guide to implementing OAuth2/OIDC Single Sign-On (SSO) with s3db.js API Plugin.**

This guide covers building production-ready SSO architectures for microservices using RS256 asymmetric keys, JWKS, and standard OAuth2/OIDC protocols.

---

## 📖 Back to API Plugin Documentation

See [API Plugin docs](plugins/api.md) for the complete API Plugin reference.

---

#### Architecture Overview

```mermaid
graph TB
    Client[Client Application]
    SSO[SSO Server<br/>Port 3000<br/>Authorization Server]
    Orders[Orders API<br/>Port 3001<br/>Resource Server]
    Products[Products API<br/>Port 3002<br/>Resource Server]
    Payments[Payments API<br/>Port 3003<br/>Resource Server]

    Client -->|1. POST /auth/token<br/>client_id + client_secret| SSO
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
- ✅ **Centralized authentication**: Single SSO service manages all users
- ✅ **Distributed authorization**: Each API validates tokens independently (no SSO calls)
- ✅ **No shared secrets**: APIs only need public keys from JWKS
- ✅ **Standard protocols**: OAuth2/OIDC compliance
- ✅ **RS256 signing**: Asymmetric keys (private key only on SSO)
- ✅ **One token, multiple services**: Same token works across all APIs

#### Complete SSO Flow

```mermaid
sequenceDiagram
    participant Client
    participant SSO as SSO Server<br/>(Port 3000)
    participant Orders as Orders API<br/>(Port 3001)
    participant Products as Products API<br/>(Port 3002)

    Note over SSO: Initialization
    SSO->>SSO: Generate RSA key pair<br/>(private + public)
    SSO->>SSO: Store in oauth_keys resource<br/>(private key encrypted)

    Note over Orders,Products: Resource Servers Init
    Orders->>SSO: GET /.well-known/jwks.json
    SSO-->>Orders: Public keys (JWKS)
    Orders->>Orders: Cache JWKS (1 hour)

    Products->>SSO: GET /.well-known/jwks.json
    SSO-->>Products: Public keys (JWKS)
    Products->>Products: Cache JWKS (1 hour)

    Note over Client,SSO: Step 1: Get Token
    Client->>SSO: POST /auth/token<br/>grant_type=client_credentials<br/>client_id + client_secret<br/>scope=orders:read products:write
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
    Orders->>Orders: Extract userId from sub claim
    Orders->>Orders: Query orders WHERE userId
    Orders-->>Client: { orders: [...], user: {...} }

    Note over Client,Products: Step 3: Access Products API (SAME TOKEN!)
    Client->>Products: POST /products<br/>Authorization: Bearer eyJhbGci...
    Products->>Products: Extract token
    Products->>Products: Get public key from cache
    Products->>Products: Verify signature locally
    Products->>Products: Validate claims
    Products->>Products: Check scope: products:write ✓
    Products->>Products: Create product
    Products-->>Client: { product: {...} }

    Note over Orders,Products: ✅ NO communication with SSO!<br/>✅ Validation is 100% local!
```

#### Token Validation Flow

```mermaid
sequenceDiagram
    participant API as Resource Server<br/>(Orders/Products/Payments)
    participant Cache as JWKS Cache<br/>(In-memory)
    participant Request as Incoming Request

    Request->>API: Authorization: Bearer eyJhbGci...

    API->>API: 1. Extract token from header

    API->>API: 2. Decode JWT header<br/>{alg: "RS256", kid: "abc123"}

    API->>Cache: 3. Get public key for kid: abc123

    alt Key found in cache
        Cache-->>API: Public key (PEM format)
    else Key not in cache
        Cache-->>API: null
        API->>API: Fetch JWKS from SSO
        API->>Cache: Store keys in cache
    end

    API->>API: 4. Verify RS256 signature<br/>using public key

    alt Signature valid
        API->>API: 5. Validate claims:<br/>• iss = http://sso ✓<br/>• aud = http://api ✓<br/>• exp > now ✓

        alt Claims valid
            API->>API: 6. Extract payload:<br/>• sub (userId)<br/>• scope (permissions)
            API->>API: 7. Check required scopes

            alt Has required scopes
                API-->>Request: ✅ 200 OK + Data
            else Missing scopes
                API-->>Request: ❌ 403 Forbidden
            end
        else Claims invalid
            API-->>Request: ❌ 401 Unauthorized<br/>(Invalid claims)
        end
    else Signature invalid
        API-->>Request: ❌ 401 Unauthorized<br/>(Invalid signature)
    end
```

#### Component Architecture

```mermaid
graph TB
    subgraph "SSO Server (Authorization Server)"
        SSO_API[API Endpoints]
        SSO_Users[users Resource<br/>email, password, scopes]
        SSO_Keys[oauth_keys Resource<br/>kid, publicKey, privateKey]
        SSO_Clients[oauth_clients Resource<br/>clientId, clientSecret]
        OAuth2[OAuth2Server Class]
        KeyMgr[KeyManager<br/>RS256 Signing]

        SSO_API --> OAuth2
        OAuth2 --> KeyMgr
        OAuth2 --> SSO_Users
        OAuth2 --> SSO_Keys
        OAuth2 --> SSO_Clients

        SSO_API -->|GET /.well-known/jwks.json| Public[Public Keys JWKS]
        SSO_API -->|POST /auth/token| Tokens[Issue Tokens]
        SSO_API -->|GET /auth/userinfo| UserInfo[User Claims]
    end

    subgraph "Orders API (Resource Server)"
        Orders_API[API Endpoints]
        Orders_Data[orders Resource<br/>userId, productId, total]
        OIDC_Orders[OIDCClient]
        JWKS_Cache_Orders[JWKS Cache<br/>TTL: 1 hour]

        Orders_API --> OIDC_Orders
        OIDC_Orders --> JWKS_Cache_Orders
        OIDC_Orders --> Orders_Data
    end

    subgraph "Products API (Resource Server)"
        Products_API[API Endpoints]
        Products_Data[products Resource<br/>name, price, sku]
        OIDC_Products[OIDCClient]
        JWKS_Cache_Products[JWKS Cache<br/>TTL: 1 hour]

        Products_API --> OIDC_Products
        OIDC_Products --> JWKS_Cache_Products
        OIDC_Products --> Products_Data
    end

    Public -.->|One-time fetch<br/>Cache 1 hour| JWKS_Cache_Orders
    Public -.->|One-time fetch<br/>Cache 1 hour| JWKS_Cache_Products

    style SSO_Users fill:#bbdefb
    style SSO_Keys fill:#ffccbc
    style SSO_Clients fill:#c8e6c9
    style Orders_Data fill:#f0f4c3
    style Products_Data fill:#f0f4c3
```

#### RS256 vs HS256 Security Model

```mermaid
graph LR
    subgraph "❌ HS256 (Symmetric) - DON'T USE for Microservices"
        SSO_H[SSO Server<br/>shared secret]
        Orders_H[Orders API<br/>shared secret]
        Products_H[Products API<br/>shared secret]
        Payments_H[Payments API<br/>shared secret]

        SSO_H -.->|Same secret<br/>everywhere| Orders_H
        SSO_H -.->|Same secret<br/>everywhere| Products_H
        SSO_H -.->|Same secret<br/>everywhere| Payments_H

        style SSO_H fill:#ffcdd2,stroke:#c62828
        style Orders_H fill:#ffcdd2,stroke:#c62828
        style Products_H fill:#ffcdd2,stroke:#c62828
        style Payments_H fill:#ffcdd2,stroke:#c62828
    end

    subgraph "✅ RS256 (Asymmetric) - CORRECT for Microservices"
        SSO_R[SSO Server<br/>🔒 PRIVATE key<br/>signs tokens]
        Orders_R[Orders API<br/>🔓 PUBLIC key<br/>validates only]
        Products_R[Products API<br/>🔓 PUBLIC key<br/>validates only]
        Payments_R[Payments API<br/>🔓 PUBLIC key<br/>validates only]

        SSO_R -->|JWKS<br/>public keys only| Orders_R
        SSO_R -->|JWKS<br/>public keys only| Products_R
        SSO_R -->|JWKS<br/>public keys only| Payments_R

        style SSO_R fill:#c8e6c9,stroke:#2e7d32
        style Orders_R fill:#e1f5fe,stroke:#01579b
        style Products_R fill:#e1f5fe,stroke:#01579b
        style Payments_R fill:#e1f5fe,stroke:#01579b
    end
```

**Why RS256 is superior for microservices:**

| Aspect | HS256 (Symmetric) | RS256 (Asymmetric) |
|--------|-------------------|-------------------|
| **Secret Distribution** | ❌ Shared secret on ALL services | ✅ Private key ONLY on SSO |
| **Security Risk** | ❌ One leak compromises EVERYTHING | ✅ Public key leak is safe |
| **Token Creation** | ❌ Any service can create fake tokens | ✅ Only SSO can create tokens |
| **Key Rotation** | ❌ Update ALL services | ✅ Update SSO, APIs auto-fetch JWKS |
| **Validation** | ✅ Fast (symmetric) | ✅ Fast (cached public key) |
| **Use Case** | Single service | Microservices, SSO |

#### Quick Start: SSO Server Setup

```javascript
import Database from 's3db.js';
import { APIPlugin } from 's3db.js/plugins/api';
import { OAuth2Server } from 's3db.js/plugins/api/auth/oauth2-server';

// 1. Create SSO database
const ssoDb = new Database({
  connectionString: 's3://minioadmin:minioadmin@localhost:9000/sso',
  encryptionKey: 'your-encryption-key'
});
await ssoDb.connect();

// 2. Create users resource
const usersResource = await ssoDb.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',
    name: 'string',
    scopes: 'array|items:string',  // ['orders:read', 'products:write', ...]
    active: 'boolean|default:true'
  }
});

// 3. Create OAuth keys resource
const keysResource = await ssoDb.createResource({
  name: 'oauth_keys',
  attributes: {
    kid: 'string|required',
    publicKey: 'string|required',
    privateKey: 'secret|required',  // AES-256-GCM encrypted
    algorithm: 'string|default:RS256',
    active: 'boolean|default:true'
  }
});

// 4. Create OAuth clients resource (optional)
const clientsResource = await ssoDb.createResource({
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

// 5. Initialize OAuth2 server
const oauth2 = new OAuth2Server({
  issuer: 'http://localhost:3000',
  keyResource: keysResource,
  userResource: usersResource,
  clientResource: clientsResource,

  // Token expiry
  accessTokenExpiry: '15m',
  idTokenExpiry: '15m',
  refreshTokenExpiry: '7d',

  // Supported features
  supportedScopes: [
    'openid',           // OIDC identity
    'profile',          // User profile
    'email',            // User email
    'offline_access',   // Refresh tokens
    'orders:read',      // Custom scopes
    'orders:write',
    'products:read',
    'products:write'
  ],
  supportedGrantTypes: [
    'client_credentials',
    'authorization_code',
    'refresh_token'
  ]
});

await oauth2.initialize();  // Generates RSA key pair if needed

// 6. Create API with OAuth2 endpoints
const api = new APIPlugin({ port: 3000 });

// OIDC Discovery endpoint
api.addRoute({
  path: '/.well-known/openid-configuration',
  method: 'GET',
  handler: oauth2.discoveryHandler.bind(oauth2),
  auth: false
});

// JWKS endpoint (public keys)
api.addRoute({
  path: '/.well-known/jwks.json',
  method: 'GET',
  handler: oauth2.jwksHandler.bind(oauth2),
  auth: false
});

// Token endpoint (all grant types)
api.addRoute({
  path: '/auth/token',
  method: 'POST',
  handler: oauth2.tokenHandler.bind(oauth2),
  auth: false
});

// UserInfo endpoint
api.addRoute({
  path: '/auth/userinfo',
  method: 'GET',
  handler: oauth2.userinfoHandler.bind(oauth2),
  auth: false  // Validates token internally
});

// Token introspection endpoint
api.addRoute({
  path: '/auth/introspect',
  method: 'POST',
  handler: oauth2.introspectHandler.bind(oauth2),
  auth: false
});

await ssoDb.use(api);

console.log('✅ SSO Server running on http://localhost:3000');
console.log('📖 JWKS: http://localhost:3000/.well-known/jwks.json');
console.log('🔐 Token: POST http://localhost:3000/auth/token');
```

#### Quick Start: Resource Server Setup

```javascript
import Database from 's3db.js';
import { APIPlugin } from 's3db.js/plugins/api';
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

// 1. Create Orders API database
const ordersDb = new Database({
  connectionString: 's3://minioadmin:minioadmin@localhost:9000/orders'
});
await ordersDb.connect();

// 2. Create orders resource (NO users resource!)
const ordersResource = await ordersDb.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',  // From token sub claim
    productId: 'string|required',
    quantity: 'number|required',
    total: 'number|required',
    status: 'string|default:pending'
  }
});

// 3. Initialize OIDC client
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000',        // SSO server URL
  audience: 'http://localhost:3001',      // This API's URL
  jwksCacheTTL: 3600000,                  // Cache JWKS for 1 hour
  clockTolerance: 60,                     // 60 seconds clock skew tolerance
  autoRefreshJWKS: true                   // Auto-refresh JWKS periodically
});

await oidcClient.initialize();  // Fetches JWKS from SSO

// 4. Create API
const api = new APIPlugin({ port: 3001 });

// 5. Add OIDC auth driver
api.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));

// 6. Protected routes
api.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    // req.user contains validated token payload
    const userId = req.user.sub;
    const scopes = req.user.scope.split(' ');

    // Check required scope
    if (!scopes.includes('orders:read')) {
      return res.status(403).json({ error: 'Insufficient scopes' });
    }

    // Query orders for this user
    const orders = await ordersResource.query({ userId });
    res.json({ orders, user: req.user });
  },
  auth: 'oidc'  // Requires valid OIDC token
});

api.addRoute({
  path: '/orders',
  method: 'POST',
  handler: async (req, res) => {
    const userId = req.user.sub;
    const scopes = req.user.scope.split(' ');

    if (!scopes.includes('orders:write')) {
      return res.status(403).json({ error: 'Insufficient scopes' });
    }

    const order = await ordersResource.insert({
      userId,
      productId: req.body.productId,
      quantity: req.body.quantity,
      total: req.body.total
    });

    res.status(201).json({ order });
  },
  auth: 'oidc'
});

// Public route (no auth)
api.addRoute({
  path: '/health',
  method: 'GET',
  handler: (req, res) => {
    res.json({ status: 'healthy' });
  },
  auth: false
});

await ordersDb.use(api);

console.log('✅ Orders API running on http://localhost:3001');
```

#### Grant Types

##### 1. Client Credentials (Service-to-Service)

**Use case**: Backend services communicating with each other (no user involved)

```bash
# Request token
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=service-a" \
  -d "client_secret=secret" \
  -d "scope=orders:read orders:write products:read"

# Response
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIs...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "orders:read orders:write products:read"
}

# Use token
curl http://localhost:3001/orders \
  -H "Authorization: Bearer eyJhbGci..."
```

##### 2. Authorization Code (Web Applications)

**Use case**: Web apps with user login (user consents to access)

```bash
# Step 1: Redirect user to SSO for login
GET http://localhost:3000/auth/authorize?
  response_type=code&
  client_id=webapp&
  redirect_uri=https://app.com/callback&
  scope=openid profile email orders:read&
  state=random-state-value

# Step 2: User logs in, SSO redirects back with code
https://app.com/callback?code=AUTH_CODE&state=random-state-value

# Step 3: Exchange code for tokens
curl -X POST http://localhost:3000/auth/token \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE" \
  -d "redirect_uri=https://app.com/callback" \
  -d "client_id=webapp" \
  -d "client_secret=secret"

# Response
{
  "access_token": "eyJhbGci...",
  "id_token": "eyJhbGci...",         # User identity (OIDC)
  "refresh_token": "refresh...",     # If offline_access scope
  "token_type": "Bearer",
  "expires_in": 900
}
```

##### 3. Refresh Token (Long-lived Sessions)

**Use case**: Get new access token without re-authentication

```bash
curl -X POST http://localhost:3000/auth/token \
  -d "grant_type=refresh_token" \
  -d "refresh_token=refresh..." \
  -d "client_id=webapp" \
  -d "client_secret=secret" \
  -d "scope=orders:read"  # Optional, must be subset

# Response
{
  "access_token": "eyJhbGci...",
  "id_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

#### Token Structure

**Access Token (JWT Payload)**:
```json
{
  "iss": "http://localhost:3000",           // Issuer (SSO server)
  "sub": "user-abc123",                     // Subject (user ID)
  "aud": "http://localhost:3001",           // Audience (target API)
  "scope": "orders:read orders:write",      // Permissions
  "exp": 1234567890,                        // Expiration (Unix timestamp)
  "iat": 1234567000,                        // Issued at
  "client_id": "mobile-app"                 // OAuth client
}
```

**ID Token (OIDC - User Identity)**:
```json
{
  "iss": "http://localhost:3000",
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

#### Scopes and Permissions

```javascript
// SSO Server - Define supported scopes
const oauth2 = new OAuth2Server({
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

#### Key Rotation

```javascript
// Rotate RSA key pair (recommended every 90 days)
await oauth2.rotateKeys();

// What happens:
// 1. Generates new RSA key pair
// 2. Marks old key inactive (but keeps it)
// 3. New tokens signed with new key
// 4. Old tokens still valid until expiry
// 5. Resource servers auto-fetch new JWKS
```

**Best practices:**
- ✅ Rotate keys every 90 days
- ✅ Keep old keys for token validity period (e.g., 24 hours)
- ✅ Use automated rotation (cron job)
- ✅ Monitor key usage metrics
- ✅ Delete old keys after all tokens expire

#### Zero Dependencies

s3db.js OAuth2/OIDC uses **ZERO external dependencies** - built entirely on Node.js native crypto APIs:

```javascript
// Native Node.js modules only
import {
  generateKeyPairSync,  // RSA key generation
  createSign,           // JWT signing
  createVerify,         // JWT verification
  createHash,           // SHA-256 hashing
  randomBytes,          // Secure random generation
  randomUUID            // UUID generation
} from 'crypto';

// Node.js 18+ native fetch
const jwks = await fetch('http://sso/.well-known/jwks.json');
```

**Benefits**:
- ✅ No supply chain vulnerabilities
- ✅ Smaller bundle size (~38 KB vs ~5 MB)
- ✅ Faster performance (native crypto)
- ✅ No dependency updates needed
- ✅ Works wherever Node.js works (Docker, Lambda, Edge)

#### Troubleshooting

**Token validation fails**:

```javascript
// Debug token validation
const verification = await oidcClient.verifyToken(token);

if (!verification.valid) {
  console.error('Token invalid:', verification.error);
  console.log('Header:', verification.header);
  console.log('Payload:', verification.payload);
}

// Common issues:
// ❌ Issuer mismatch: iss claim doesn't match OIDC issuer
// ❌ Audience mismatch: aud claim doesn't match resource server
// ❌ Expired token: exp claim < current time
// ❌ Clock skew: Increase clockTolerance option
// ❌ Invalid signature: JWKS not cached or wrong key
```

**JWKS not found**:

```javascript
// Force refresh JWKS
await oidcClient.fetchJWKS(true);

// Check JWKS endpoint is accessible
console.log('JWKS URI:', oidcClient.jwksUri);
const jwks = await fetch(oidcClient.jwksUri);
console.log('JWKS:', await jwks.json());
```

**Clock skew issues**:

```javascript
// Increase tolerance for time validation
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000',
  clockTolerance: 300  // 5 minutes tolerance
});
```

#### Complete Working Example

See [`docs/examples/e60-oauth2-microservices.js`](../examples/e60-oauth2-microservices.js) for a complete working example with:
- SSO server (port 3000)
- Orders API (port 3001)
- Products API (port 3002)
- Test client that requests tokens and makes API calls

Run it:
```bash
# Start MinIO
docker run -d -p 9000:9000 -p 9001:9001 \
  minio/minio server /data --console-address ":9001"

# Run example
node docs/examples/e60-oauth2-microservices.js
```

#### Docker Compose Example

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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

  sso:
    build: ./sso-service
    ports:
      - "3000:3000"
    environment:
      S3DB_CONNECTION: http://minioadmin:minioadmin@minio:9000/sso
      S3DB_ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      OAUTH2_ISSUER: http://sso:3000
    depends_on:
      minio:
        condition: service_healthy

  orders-api:
    build: ./orders-service
    ports:
      - "3001:3001"
    environment:
      S3DB_CONNECTION: http://minioadmin:minioadmin@minio:9000/orders
      OAUTH2_ISSUER: http://sso:3000
    depends_on:
      - sso

  products-api:
    build: ./products-service
    ports:
      - "3002:3002"
    environment:
      S3DB_CONNECTION: http://minioadmin:minioadmin@minio:9000/products
      OAUTH2_ISSUER: http://sso:3000
    depends_on:
      - sso
```

#### When to Use OAuth2/OIDC

**✅ Use OAuth2/OIDC when:**
- You have multiple services (microservices)
- You need Single Sign-On (SSO)
- Services are deployed independently
- You want centralized user management
- You need standard protocol compliance
- You want to avoid shared secrets

**❌ Don't use OAuth2/OIDC when:**
- You have a single monolithic API
- You don't need SSO
- Complexity isn't worth it
- JWT driver is sufficient

**Comparison**:

| Feature | OAuth2/OIDC | JWT Driver | Basic Auth |
|---------|-------------|-----------|------------|
| **Best For** | Microservices | Single API | Scripts/Tools |
| **Setup Complexity** | High | Medium | Low |
| **Security** | High (RS256) | Medium (HS256) | Low |
| **SSO Support** | ✅ Yes | ❌ No | ❌ No |
| **Token Sharing** | ✅ Yes | ❌ No | ❌ No |
| **Key Management** | Asymmetric | Symmetric | N/A |
| **Standards** | OAuth2/OIDC | JWT | HTTP Basic |

#### Testing OAuth2/OIDC

##### Test Suite Overview

s3db.js includes comprehensive OAuth2/OIDC tests (~101 tests) covering all components:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `api.plugin.oauth2.rsa-keys.test.js` | 28 | RSA key generation, signing, verification |
| `api.plugin.oauth2.oidc-discovery.test.js` | 43 | Discovery, claims, scopes validation |
| `api.plugin.oauth2.test.js` | ~30 | End-to-end SSO + Resource Servers |

**Run tests:**
```bash
# All OAuth2/OIDC tests
pnpm test:js -- oauth2

# Specific test files
pnpm test:js -- oauth2.rsa-keys
pnpm test:js -- oauth2.oidc-discovery
pnpm test:js -- oauth2.test
```

##### What Tests Guarantee

**SSO Server:**
- ✅ Generates valid RSA 2048-bit key pairs
- ✅ Signs tokens with RS256 correctly
- ✅ Exposes OIDC discovery document
- ✅ Returns public keys via JWKS endpoint
- ✅ Validates client credentials
- ✅ Issues tokens with correct claims (iss, sub, exp, iat)

**Resource Servers:**
- ✅ Validate tokens locally without SSO communication
- ✅ Verify RS256 signatures using public keys
- ✅ Validate all claims (issuer, audience, expiration)
- ✅ Handle clock skew tolerance
- ✅ Block invalid/expired/tampered tokens (401)
- ✅ Enforce scope requirements (403)

**Security Tests:**
- ✅ Token tampering blocked (modified payload rejected)
- ✅ Expired tokens rejected
- ✅ Wrong issuer rejected
- ✅ Algorithm confusion prevented (RS256 vs HS256)
- ✅ Missing claims rejected

##### Testing Your Implementation

**Test SSO Server:**
```bash
# 1. Check JWKS endpoint
curl http://localhost:3000/.well-known/jwks.json

# Expected:
# {
#   "keys": [{
#     "kty": "RSA",
#     "kid": "abc123",
#     "use": "sig",
#     "alg": "RS256",
#     "n": "modulus...",
#     "e": "AQAB"
#   }]
# }

# 2. Get access token
curl -X POST http://localhost:3000/auth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=test" \
  -d "client_secret=secret" \
  -d "scope=openid orders:read"

# Expected:
# {
#   "access_token": "eyJhbGci...",
#   "token_type": "Bearer",
#   "expires_in": 900,
#   "scope": "openid orders:read"
# }

# 3. Decode token to verify claims
TOKEN="eyJhbGci..."
echo $TOKEN | cut -d. -f2 | base64 -d | jq

# Expected payload:
# {
#   "iss": "http://localhost:3000",
#   "sub": "user-123",
#   "aud": "http://localhost:3001",
#   "scope": "openid orders:read",
#   "exp": 1234567890,
#   "iat": 1234567000
# }
```

**Test Resource Server:**
```bash
# 1. Test without token (should fail)
curl http://localhost:3001/orders
# Expected: 401 Unauthorized

# 2. Test with invalid token (should fail)
curl http://localhost:3001/orders \
  -H "Authorization: Bearer invalid-token"
# Expected: 401 Unauthorized

# 3. Test with valid token (should succeed)
curl http://localhost:3001/orders \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 OK + data

# 4. Test scope enforcement
curl -X POST http://localhost:3001/orders \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"productId":"p1","quantity":1}'
# Expected: 403 Forbidden if missing 'orders:write' scope
```

**Test Token Validation:**
```javascript
// Manual token verification for debugging
const verification = await oidcClient.verifyToken(token);

if (!verification.valid) {
  console.error('Token invalid:', verification.error);
  // Common errors:
  // - "Token expired" → exp claim < current time
  // - "Invalid issuer" → iss claim doesn't match
  // - "Invalid audience" → aud claim doesn't match
  // - "Invalid signature" → Tampered token or wrong key
  // - "Public key not found" → JWKS not cached
}

console.log('Payload:', verification.payload);
// { sub: 'user-123', scope: 'orders:read', ... }
```

##### Integration Testing

```javascript
// tests/oauth2-integration.test.js
import { expect, beforeAll, afterAll, describe, it } from 'bun:test';

describe('OAuth2 Microservices Integration', () => {
  let ssoServer, ordersAPI, token;

  beforeAll(async () => {
    // Start SSO server
    ssoServer = await startSSOServer(3000);

    // Start Orders API
    ordersAPI = await startOrdersAPI(3001);

    // Wait for services to be ready
    await waitForHealth('http://localhost:3000/health');
    await waitForHealth('http://localhost:3001/health');
  });

  afterAll(async () => {
    await ssoServer.close();
    await ordersAPI.close();
  });

  it('should get token from SSO', async () => {
    const response = await fetch('http://localhost:3000/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=test&client_secret=secret&scope=orders:read'
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('Bearer');

    token = data.access_token;
  });

  it('should access Orders API with token', async () => {
    const response = await fetch('http://localhost:3001/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.orders).toBeDefined();
  });

  it('should reject invalid token', async () => {
    const response = await fetch('http://localhost:3001/orders', {
      headers: { 'Authorization': 'Bearer invalid-token' }
    });

    expect(response.status).toBe(401);
  });

  it('should enforce scope requirements', async () => {
    // Get token without 'orders:write' scope
    const tokenResponse = await fetch('http://localhost:3000/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=test&client_secret=secret&scope=orders:read'
    });

    const { access_token } = await tokenResponse.json();

    // Try to POST (requires orders:write)
    const response = await fetch('http://localhost:3001/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productId: 'p1', quantity: 1 })
    });

    expect(response.status).toBe(403);  // Forbidden (missing scope)
  });
});
```

#### Integrating with External Identity Providers

s3db.js resource servers can validate tokens from **any** OAuth2/OIDC-compliant identity provider, not just s3db.js SSO servers.

##### Azure AD (Microsoft Entra ID) Integration

**Use case:** Your resource server validates tokens issued by Azure AD - no user management needed!

```javascript
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

// Configure OIDC client for Azure AD
const azureOIDC = new OIDCClient({
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: 'api://YOUR_API_CLIENT_ID',  // Your API's app registration ID
  discoveryUri: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
  jwksCacheTTL: 3600000,  // 1 hour
  clockTolerance: 60
});

await azureOIDC.initialize();

// Add to API
api.addAuthDriver('azure', azureOIDC.middleware.bind(azureOIDC));

// Protected route
api.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    // Azure AD token claims
    const userId = req.user.oid;  // Azure Object ID
    const email = req.user.upn || req.user.email;
    const roles = req.user.roles || [];  // App Roles
    const scopes = req.user.scp?.split(' ') || [];  // Delegated permissions

    // Check Azure AD App Role
    if (!roles.includes('Orders.Read')) {
      return res.status(403).json({ error: 'Missing required role' });
    }

    const orders = await ordersResource.query({ userId });
    res.json({ orders });
  },
  auth: 'azure'
});
```

**Azure AD token claims:**
```json
{
  "iss": "https://login.microsoftonline.com/{tenant-id}/v2.0",
  "aud": "api://YOUR_API_CLIENT_ID",
  "sub": "unique-user-id",
  "oid": "object-id",  // User's Azure AD Object ID
  "upn": "user@tenant.com",  // User Principal Name
  "email": "user@tenant.com",
  "roles": ["Orders.Read", "Products.Write"],  // App Roles
  "scp": "Orders.Read Orders.Write",  // Delegated scopes
  "tid": "tenant-id",
  "exp": 1234567890,
  "iat": 1234567000
}
```

**Setup steps:**
1. Create App Registration in Azure Portal
2. Configure API permissions and App Roles
3. Expose API (api://YOUR_API_CLIENT_ID)
4. Configure your resource server with Azure AD issuer
5. Users get tokens from Azure AD, your API validates them

See [`docs/examples/e62-azure-ad-integration.js`](../examples/e62-azure-ad-integration.js) for complete example.

##### Keycloak Integration

**Use case:** Self-hosted open-source identity provider

```javascript
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

// Configure OIDC client for Keycloak
const keycloakOIDC = new OIDCClient({
  issuer: `http://localhost:8080/realms/production`,
  audience: 'orders-api',  // Client ID in Keycloak
  discoveryUri: `http://localhost:8080/realms/production/.well-known/openid-configuration`
});

await keycloakOIDC.initialize();

api.addAuthDriver('keycloak', keycloakOIDC.middleware.bind(keycloakOIDC));

api.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    // Keycloak token claims
    const userId = req.user.sub;
    const username = req.user.preferred_username;
    const email = req.user.email;

    // Check Keycloak Realm Roles
    const realmRoles = req.user.realm_access?.roles || [];
    if (!realmRoles.includes('orders-viewer')) {
      return res.status(403).json({ error: 'Missing realm role' });
    }

    // Check Keycloak Client Roles
    const clientRoles = req.user.resource_access?.['orders-api']?.roles || [];
    if (!clientRoles.includes('read')) {
      return res.status(403).json({ error: 'Missing client role' });
    }

    const orders = await ordersResource.query({ userId });
    res.json({ orders });
  },
  auth: 'keycloak'
});
```

**Keycloak token claims:**
```json
{
  "iss": "http://localhost:8080/realms/production",
  "aud": "orders-api",
  "sub": "user-uuid",
  "preferred_username": "john",
  "email": "john@example.com",
  "email_verified": true,
  "realm_access": {
    "roles": ["orders-viewer", "products-editor"]
  },
  "resource_access": {
    "orders-api": {
      "roles": ["read", "write"]
    }
  },
  "scope": "openid profile email",
  "exp": 1234567890,
  "iat": 1234567000
}
```

**Run Keycloak with Docker:**
```bash
docker run -d -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

See [`docs/examples/e63-keycloak-integration.js`](../examples/e63-keycloak-integration.js) for complete example.

##### Comparison: Azure AD vs Keycloak vs s3db.js SSO

| Feature | Azure AD | Keycloak | s3db.js SSO |
|---------|----------|----------|-------------|
| **Cost** | Paid (per user) | Free (self-hosted) | Free (built-in) |
| **Hosting** | Microsoft-managed | Self-hosted | Built into your app |
| **Setup** | Azure Portal | Admin Console | JavaScript code |
| **Customization** | Limited | High | Total |
| **User Management** | Azure Portal | Keycloak UI | Your database |
| **Multi-tenant** | Built-in | Realms | DIY |
| **Integration** | Office 365, AD | LDAP, SAML | S3 storage |
| **Best For** | Enterprise, Office 365 | Self-hosted, custom | Simple microservices |

**All three work seamlessly with s3db.js resource servers!** The API just validates tokens using `OIDCClient` - it doesn't care who issued them.

#### Advanced OAuth2/OIDC Patterns

##### Multi-Audience Tokens

Support tokens valid for multiple APIs:

```javascript
// SSO Server - Issue token for multiple audiences
const oauth2 = new OAuth2Server({
  issuer: 'http://localhost:3000',
  // Token will include aud: ["api://orders", "api://products"]
});

// Resource Servers validate their audience
const ordersOIDC = new OIDCClient({
  issuer: 'http://localhost:3000',
  audience: 'api://orders'  // Accepts if aud includes this
});

const productsOIDC = new OIDCClient({
  issuer: 'http://localhost:3000',
  audience: 'api://products'  // Accepts if aud includes this
});
```

##### PKCE (Proof Key for Code Exchange)

Protect authorization code flow from interception:

```javascript
// Client-side: Generate code verifier and challenge
import crypto from 'crypto';

const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Step 1: Authorization request with PKCE
const authUrl = new URL('http://localhost:3000/auth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', 'mobile-app');
authUrl.searchParams.set('redirect_uri', 'myapp://callback');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('scope', 'openid profile');

// Redirect user to authUrl

// Step 2: Exchange code for token (with code_verifier)
const tokenResponse = await fetch('http://localhost:3000/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: 'myapp://callback',
    client_id: 'mobile-app',
    code_verifier: codeVerifier  // Proves you initiated the request
  })
});
```

**Why PKCE?**
- ✅ Prevents authorization code interception attacks
- ✅ Required for mobile and SPA applications
- ✅ Works without client secret (public clients)

##### Token Refresh Flow

Maintain long-lived sessions:

```javascript
// SSO Server - Enable refresh tokens
const oauth2 = new OAuth2Server({
  supportedScopes: ['openid', 'profile', 'offline_access'],  // offline_access = refresh tokens
  refreshTokenExpiry: '30d'
});

// Client - Request refresh token
const initialResponse = await fetch('http://localhost:3000/auth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    scope: 'openid profile offline_access',  // Request refresh token
    ...
  })
});

const { access_token, refresh_token, expires_in } = await initialResponse.json();

// Later: Use refresh token to get new access token
const refreshResponse = await fetch('http://localhost:3000/auth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh_token,
    client_id: 'webapp',
    client_secret: 'secret'
  })
});

const { access_token: newAccessToken } = await refreshResponse.json();
```

##### Token Introspection

Validate tokens server-side (optional):

```javascript
// Resource Server - Introspect token at SSO
const introspection = await oidcClient.introspectToken(
  token,
  'orders-api',  // client_id
  'client-secret'
);

if (introspection.active) {
  console.log('Token is valid');
  console.log('User ID:', introspection.sub);
  console.log('Scopes:', introspection.scope);
} else {
  console.log('Token is invalid or expired');
}
```

**Note:** Introspection requires SSO communication (not needed for RS256 validation).

#### OAuth2/OIDC Troubleshooting Guide

##### Common Issues and Solutions

**1. Token validation fails with "Invalid signature"**

```javascript
// Debug: Check if JWKS is cached correctly
const jwks = oidcClient.getJWKS();
console.log('Cached keys:', jwks.keys.map(k => k.kid));

// Force refresh JWKS
await oidcClient.fetchJWKS(true);

// Verify token manually
const verification = await oidcClient.verifyToken(token);
console.log('Valid:', verification.valid);
console.log('Error:', verification.error);
```

**Causes:**
- ❌ JWKS not fetched from SSO
- ❌ Key rotation occurred (old token with new JWKS)
- ❌ Wrong issuer URL in OIDC client
- ❌ Network issues fetching JWKS

**Solutions:**
- ✅ Ensure `.initialize()` is called and completes
- ✅ Check JWKS endpoint is accessible: `curl http://sso/.well-known/jwks.json`
- ✅ Verify issuer URL matches exactly (no trailing slash)
- ✅ Increase `jwksCacheTTL` if rotation is frequent

**2. Token validation fails with "Token expired"**

```javascript
// Check token expiration
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64'));
const now = Math.floor(Date.now() / 1000);
console.log('Token exp:', payload.exp);
console.log('Current time:', now);
console.log('Expired by:', now - payload.exp, 'seconds');
```

**Causes:**
- ❌ Access token expired (default: 15 minutes)
- ❌ Clock skew between servers

**Solutions:**
- ✅ Request new token using refresh token
- ✅ Increase `clockTolerance`: `new OIDCClient({ clockTolerance: 300 })` (5 minutes)
- ✅ Sync server clocks with NTP
- ✅ Use longer token expiry: `accessTokenExpiry: '1h'` (trade-off: less secure)

**3. Token validation fails with "Invalid issuer"**

```javascript
// Check issuer claim
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64'));
console.log('Token iss:', payload.iss);
console.log('Expected iss:', oidcClient.issuer);
```

**Causes:**
- ❌ Token issued by different SSO
- ❌ Issuer URL mismatch (http vs https, trailing slash, port)

**Solutions:**
- ✅ Ensure SSO `issuer` matches OIDC `issuer` exactly
- ✅ Use same protocol (http/https) in both
- ✅ Remove trailing slashes: `http://sso` not `http://sso/`

**4. Token validation fails with "Invalid audience"**

```javascript
// Check audience claim
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64'));
console.log('Token aud:', payload.aud);
console.log('Expected aud:', oidcClient.audience);
```

**Causes:**
- ❌ Token issued for different API
- ❌ Audience not specified in OIDC client

**Solutions:**
- ✅ Set correct `audience` in OIDC client: `audience: 'http://localhost:3001'`
- ✅ Request token with correct audience in SSO
- ✅ Omit `audience` in OIDC client if not enforcing (less secure)

**5. Scope enforcement fails (403 Forbidden)**

```javascript
// Check scopes in token
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64'));
const scopes = payload.scope?.split(' ') || [];
console.log('Token scopes:', scopes);
console.log('Required scope:', 'orders:write');
console.log('Has scope?', scopes.includes('orders:write'));
```

**Causes:**
- ❌ Token doesn't include required scope
- ❌ Scope name mismatch

**Solutions:**
- ✅ Request correct scopes when getting token: `scope=orders:read orders:write`
- ✅ Update user scopes in SSO database
- ✅ Check scope validation logic in handler

**6. JWKS endpoint not accessible**

```bash
# Test JWKS endpoint
curl http://localhost:3000/.well-known/jwks.json

# Expected: JSON with keys array
# {
#   "keys": [
#     {
#       "kty": "RSA",
#       "kid": "abc123",
#       ...
#     }
#   ]
# }
```

**Causes:**
- ❌ SSO server not running
- ❌ JWKS route not registered
- ❌ Network/firewall blocking request

**Solutions:**
- ✅ Verify SSO server is running: `curl http://localhost:3000/health`
- ✅ Check JWKS route is registered: `api.addRoute({ path: '/.well-known/jwks.json', ... })`
- ✅ Test from resource server host: `curl http://sso:3000/.well-known/jwks.json`
- ✅ Check Docker network / Kubernetes service discovery

**7. Public key not found for kid**

```javascript
// Debug: List all cached keys
const jwks = oidcClient.getJWKS();
console.log('Available kids:', jwks.keys.map(k => k.kid));

// Decode token to see kid
const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64'));
console.log('Token kid:', header.kid);
```

**Causes:**
- ❌ Key rotation occurred, old key not in JWKS
- ❌ Token signed with different key

**Solutions:**
- ✅ Force refresh JWKS: `await oidcClient.fetchJWKS(true)`
- ✅ Check SSO has active key: Query `oauth_keys` resource
- ✅ Wait for JWKS cache to refresh (auto-refresh enabled by default)

**8. OAuth2Server initialization fails**

```javascript
try {
  await oauth2.initialize();
} catch (err) {
  console.error('OAuth2 init error:', err.message);

  // Common errors:
  // "Resource 'oauth_keys' not found" → Create keys resource first
  // "No active keys found" → Generate keys: await oauth2.rotateKeys()
}
```

**Solutions:**
- ✅ Create all required resources before `initialize()`
- ✅ Verify resource names match: `keyResource: keysResource`
- ✅ Check database connection is established

##### Performance Optimization

**JWKS Caching:**
```javascript
// Aggressive caching (1 hour)
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000',
  jwksCacheTTL: 3600000,  // 1 hour
  autoRefreshJWKS: true   // Auto-refresh in background
});

// Conservative caching (5 minutes)
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:3000',
  jwksCacheTTL: 300000,   // 5 minutes
  autoRefreshJWKS: true
});
```

**Impact:**
- Without cache: ~50-100ms per request (network + verify)
- With cache: <1ms per request (verify only)

**Token Expiry Trade-offs:**
```javascript
// Short-lived (more secure, more token requests)
const oauth2 = new OAuth2Server({
  accessTokenExpiry: '5m',
  refreshTokenExpiry: '1d'
});

// Long-lived (less secure, fewer token requests)
const oauth2 = new OAuth2Server({
  accessTokenExpiry: '1h',
  refreshTokenExpiry: '30d'
});
```

**Recommendation:** 15 minutes for access tokens, 7 days for refresh tokens (default).

#### Additional Resources

- **OAuth 2.0 Spec**: [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- **OpenID Connect Core**: [Spec](https://openid.net/specs/openid-connect-core-1_0.html)
- **JWT Best Practices**: [RFC 8725](https://datatracker.ietf.org/doc/html/rfc8725)
- **PKCE**: [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- **Token Introspection**: [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662)
- **Complete Examples**:
  - [`e60-oauth2-microservices.js`](../examples/e60-oauth2-microservices.js) - Full SSO architecture
  - [`e61-sso-architecture-explained.js`](../examples/e61-sso-architecture-explained.js) - Detailed walkthrough
  - [`e62-azure-ad-integration.js`](../examples/e62-azure-ad-integration.js) - Azure AD integration
  - [`e63-keycloak-integration.js`](../examples/e63-keycloak-integration.js) - Keycloak integration

