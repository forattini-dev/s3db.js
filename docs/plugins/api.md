# 🌐 API Plugin

## ⚡ TLDR

**Transform s3db.js resources into production-ready REST API endpoints** with automatic versioning, multiple authentication methods, and enterprise features.

**1 line to get started:**
```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));  // Instant REST API!
```

**Key features:**
- ✅ **Automatic REST endpoints** for all resources
- ✅ **Swagger UI documentation**: Interactive API docs at `/docs`
- ✅ **Kubernetes health probes**: `/health/live`, `/health/ready`, `/health`
- ✅ **Auth drivers**: JWT, Basic Auth, OAuth2/OIDC (microservices SSO)
- ✅ **Clean URLs by default**: `/cars` (optional versioning: `/v1/cars`)
- ✅ **Production ready**: CORS, Rate Limiting, Logging, Compression
- ✅ **Schema validation**: Automatic validation using resource schemas
- ✅ **Custom middlewares**: Add your own middleware functions

**Generated endpoints:**
```
GET     /cars           → resource.list() or resource.query() with filters
GET     /cars/:id       → resource.get(id)
POST    /cars           → resource.insert(data)
PUT     /cars/:id       → resource.update(id, data)
PATCH   /cars/:id       → resource.update(id, partial)
DELETE  /cars/:id       → resource.delete(id)
HEAD    /cars           → resource.count() + statistics in headers
OPTIONS /cars           → resource metadata (schema, methods, endpoints)
```

**Filtering via query strings:**
```
GET /cars?status=active&year=2024&inStock=true
GET /cars?limit=50&offset=100&brand=Toyota
```

---

## 📑 Table of Contents

- [Quick Start](#-quick-start)
- [Interactive API Documentation](#-interactive-api-documentation)
- [Configuration Options](#-configuration-options)
- [Schema Validation](#-schema-validation)
- [URL Versioning Configuration](#-url-versioning-configuration)
- [Authentication](#-authentication)
- [Security & Validation](#️-security--validation)
- [Declarative Guards (Authorization)](#️-declarative-guards-authorization)
- [API Endpoints](#-api-endpoints)
- [Custom Middlewares](#-custom-middlewares)
- [Custom Routes](#️-custom-routes)
- [Rate Limiting](#-rate-limiting)
- [Request Logging](#-request-logging)
- [Response Compression](#-response-compression)
- [CORS Configuration](#-cors-configuration)
- [Production Deployment](#-production-deployment)
  - [Docker Setup](#docker-setup)
  - [Kubernetes Deployment](#kubernetes-deployment)
  - [Prometheus Monitoring](#prometheus-monitoring)
- [Best Practices](#-best-practices)
- [Advanced Usage](#-advanced-usage)
- [FAQ](#-faq)
- [Examples](#-examples)
- [Plugin Methods](#-plugin-methods)
- [HTTP Status Codes](#-http-status-codes---complete-reference)

---

## 🚀 Quick Start

### Installation

```bash
# Install required dependencies
pnpm add hono @hono/node-server @hono/swagger-ui
```

### Basic Usage

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// Create resource
const cars = await db.createResource({
  name: 'cars',
  attributes: {
    brand: 'string|required',
    model: 'string|required',
    year: 'number|required|min:1900|max:2025',
    price: 'number|required|min:0'
  }
});

// Add API Plugin
await db.usePlugin(new ApiPlugin({
  port: 3000,
  docs: { enabled: true },
  cors: { enabled: true },
  validation: { enabled: true }
}));

// Server running at http://localhost:3000
// GET http://localhost:3000/cars (clean URLs by default!)
// View docs at http://localhost:3000/docs
```

---

## 📚 Interactive API Documentation

The API Plugin automatically generates **Swagger UI documentation** at `/docs`:

```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));

// Visit http://localhost:3000/docs
// - Interactive API documentation
// - Try requests directly from browser
// - View all schemas and endpoints
// - See authentication requirements
```

### Features

- ✅ **Auto-generated from resources**: Schemas derived from resource attributes
- ✅ **Interactive testing**: Try API calls directly in browser
- ✅ **Authentication support**: Test with JWT, API Key, or Basic Auth
- ✅ **Schema validation examples**: See required fields and data types
- ✅ **OpenAPI 3.0 spec**: Available at `/openapi.json`

### Customizing API Documentation

```javascript
new ApiPlugin({
  port: 3000,

  // Customize API docs (recommended format)
  docs: {
    enabled: true,
    title: 'My Awesome API',
    version: '2.1.0',
    description: 'Complete API for managing cars, products, and users'
  },

  // Legacy format (still supported for backwards compatibility)
  // docsEnabled: true,
  // apiTitle: 'My Awesome API',
  // apiVersion: '2.1.0',
  // apiDescription: 'Complete API for managing cars, products, and users'
})
```

### Accessing OpenAPI Spec

```bash
# Get raw OpenAPI 3.0 specification
curl http://localhost:3000/openapi.json

# Use with external tools
swagger-cli validate http://localhost:3000/openapi.json
```

---

## 📋 Configuration Options

### Complete Configuration

```javascript
new ApiPlugin({
  // Server configuration
  port: 3000,
  host: '0.0.0.0',
  verbose: false,
  maxBodySize: 10 * 1024 * 1024,         // 10MB (default)

  // Authentication (all optional)
  auth: {
    jwt: {
      enabled: true,
      secret: 'your-jwt-secret-key',
      expiresIn: '7d'                    // Token expiration
    },
    apiKey: {
      enabled: true,
      headerName: 'X-API-Key'            // Custom header name
    },
    basic: {
      enabled: true,
      realm: 'API Access',               // HTTP Basic realm
      passphrase: 'secret'               // For password decryption
    }
  },

  // Resource configuration
  resources: {
    cars: {
      auth: ['jwt', 'apiKey'],           // Required auth methods
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      customMiddleware: [                // Resource-specific middleware
        async (c, next) => {
          // Custom logic
          await next();
        }
      ]
    },
    products: {
      auth: false,                       // Public access
      methods: ['GET']                   // Read-only
    }
  },

  // CORS configuration
  cors: {
    enabled: true,
    origin: '*',                         // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    credentials: true,
    maxAge: 86400                        // 24 hours
  },

  // Rate limiting
  rateLimit: {
    enabled: true,
    windowMs: 60000,                     // 1 minute
    maxRequests: 100,                    // 100 requests per window
    keyGenerator: (c) => {               // Custom key function
      return c.req.header('x-forwarded-for') || 'unknown';
    }
  },

  // Request logging
  logging: {
    enabled: true,
    format: ':method :path :status :response-time ms - :user',
    verbose: false
  },

  // Response compression
  compression: {
    enabled: true,
    threshold: 1024,                     // Only compress if >1KB
    level: 6                             // gzip compression level (1-9)
  },

  // Validation
  validation: {
    enabled: true,
    validateOnInsert: true,
    validateOnUpdate: true,
    returnValidationErrors: true
  },

  // Global custom middlewares
  middlewares: [
    async (c, next) => {
      c.set('requestId', crypto.randomUUID());
      await next();
    }
  ]
})
```

---

## ✅ Schema Validation

The API Plugin automatically validates requests using resource schemas:

```javascript
const cars = await db.createResource({
  name: 'cars',
  attributes: {
    brand: 'string|required|minlength:2',
    model: 'string|required',
    year: 'number|required|min:1900|max:2025',
    price: 'number|required|min:0'
  }
});
```

**Invalid Request:**
```bash
curl -X POST http://localhost:3000/cars \
  -H "Content-Type: application/json" \
  -d '{"brand":"X","year":1800}'
```

**Response:**
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "errors": [
        {
          "field": "brand",
          "message": "String length must be at least 2 characters",
          "expected": "minlength:2",
          "actual": "X"
        },
        {
          "field": "model",
          "message": "Field is required",
          "expected": "required"
        },
        {
          "field": "year",
          "message": "Number must be at least 1900",
          "expected": "min:1900",
          "actual": 1800
        },
        {
          "field": "price",
          "message": "Field is required",
          "expected": "required"
        }
      ]
    }
  }
}
```

Validation is automatic for:
- POST (insert) - Full validation
- PUT (update) - Full validation
- PATCH (partial update) - Partial validation

Disable validation per resource:
```javascript
resources: {
  cars: {
    validation: false  // Disable validation
  }
}
```

---

## 🔐 Authentication

### Overview

The API Plugin uses a **driver-based authentication system** where you choose ONE authentication driver for your API. This approach ensures consistency and simplicity across your entire API.

**Available drivers:**
- **JWT** - Token-based authentication with `/auth/login` endpoint
- **Basic** - HTTP Basic Auth with Base64-encoded credentials in headers
- **OAuth2/OIDC** - Microservices SSO with RS256 asymmetric keys ([docs](../oauth2-oidc.md))

**Key features:**
- ✅ Resource-based auth configuration (which resource manages users)
- ✅ Configurable username/password fields (default: `email`/`password`)
- ✅ Automatic `/auth` routes (registration, login for JWT)
- ✅ Per-resource auth requirements

### JWT Authentication

JWT (JSON Web Token) provides stateless authentication where users receive a token after login that must be included in subsequent requests.

**Setup:**
```javascript
// Create users resource FIRST (can be named anything)
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    password: 'secret|required',  // Automatically encrypted
    role: 'string|optional',
    active: 'boolean|default:true'
  }
});

// Configure API with JWT driver
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    driver: 'jwt',                        // Choose JWT driver
    resource: 'users',                    // Resource that manages auth
    usernameField: 'email',               // Field for username (default: 'email')
    passwordField: 'password',            // Field for password (default: 'password')
    config: {
      jwtSecret: 'your-256-bit-secret',  // Required for JWT
      jwtExpiresIn: '7d',                // Token expiration (default: 7d)
      allowRegistration: true             // Enable /auth/register (default: true)
    }
  },
  resources: {
    cars: {
      auth: true  // Require authentication for this resource
    }
  }
}));
```

**Generated routes:**
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT token
- `POST /auth/token/refresh` - Refresh JWT token
- `GET /auth/me` - Get current user info
- `POST /auth/api-key/regenerate` - Regenerate API key

**Usage flow:**
```bash
# 1. Register new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "secret123",
    "role": "user"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "user": { "id": "abc123", "email": "john@example.com", "role": "user" },
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
#   }
# }

# 2. Login (if already registered)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "secret123"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "user": { "id": "abc123", "email": "john@example.com" },
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#     "expiresIn": "7d"
#   }
# }

# 3. Use token to access protected resources
curl http://localhost:3000/cars \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Basic Authentication

HTTP Basic Auth validates credentials on EVERY request by checking username:password against your auth resource.

**Setup:**
```javascript
// Create users resource FIRST
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    password: 'secret|required',  // Automatically encrypted
    active: 'boolean|default:true'
  }
});

// Configure API with Basic Auth driver
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    driver: 'basic',                      // Choose Basic Auth driver
    resource: 'users',                    // Resource that manages auth
    usernameField: 'email',               // Field for username (default: 'email')
    passwordField: 'password',            // Field for password (default: 'password')
    config: {
      realm: 'API Access',                // WWW-Authenticate realm (default: 'API Access')
      allowRegistration: true             // Enable /auth/register (default: true)
    }
  },
  resources: {
    cars: {
      auth: true  // Require authentication
    }
  }
}));
```

**Usage:**
```bash
# 1. Register user (if registration enabled)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "secret123"
  }'

# 2. Access resources with Basic Auth
curl http://localhost:3000/cars \
  -u john@example.com:secret123

# Or with Authorization header
curl http://localhost:3000/cars \
  -H "Authorization: Basic $(echo -n 'john@example.com:secret123' | base64)"
```

**Note:** Basic Auth validates credentials on every request, so it's simpler but requires sending credentials each time. JWT is more efficient for frequent requests after initial login.

### OAuth2 + OpenID Connect (Microservices SSO)

For **microservices architecture** where multiple services need to authenticate against a central SSO (Single Sign-On) service, use OAuth2 + OIDC with RS256 asymmetric keys.

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

#### Additional Resources

- **OAuth 2.0 Spec**: [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- **OpenID Connect Core**: [Spec](https://openid.net/specs/openid-connect-core-1_0.html)
- **JWT Best Practices**: [RFC 8725](https://datatracker.ietf.org/doc/html/rfc8725)
- **PKCE**: [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- **Token Introspection**: [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662)

### Custom Username/Password Fields

You can use any field names for username and password:

```javascript
// Example: Using 'username' instead of 'email'
const accounts = await db.createResource({
  name: 'accounts',
  attributes: {
    id: 'string|required',
    username: 'string|required',        // Custom username field
    secretKey: 'secret|required',       // Custom password field
    isActive: 'boolean|default:true'
  }
});

await db.usePlugin(new ApiPlugin({
  auth: {
    driver: 'jwt',
    resource: 'accounts',              // Different resource name
    usernameField: 'username',         // Use 'username' field
    passwordField: 'secretKey',        // Use 'secretKey' field
    config: {
      jwtSecret: 'your-secret',
      jwtExpiresIn: '30d'
    }
  }
}));
```

### Public vs Protected Resources

Control authentication per resource:

```javascript
resources: {
  // Public resource - no auth required
  products: {
    auth: false,
    methods: ['GET']  // Read-only public access
  },

  // Protected resource - auth required
  orders: {
    auth: true,       // Requires authentication
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
}
```

### 🛡️ Security & Validation

The API Plugin implements industry-standard security practices to protect your data and routes.

#### ✅ Security Guarantees

**JWT Driver Protection:**
- ✅ All HTTP methods (GET, POST, PUT, DELETE) blocked without valid token (401 Unauthorized)
- ✅ Malformed tokens rejected (invalid structure, missing Bearer prefix, empty token)
- ✅ Invalid signatures rejected (tampered tokens, wrong secret, modified payload)
- ✅ Expired tokens rejected automatically
- ✅ Public routes accessible without authentication

**Basic Auth Driver Protection:**
- ✅ All HTTP methods blocked without credentials (401 + WWW-Authenticate header)
- ✅ Wrong username/password combinations rejected
- ✅ Malformed Authorization headers rejected
- ✅ Credentials validated on every request (stateless)
- ✅ Public routes accessible without authentication

#### 🔐 Best Practices

**JWT Authentication:**
```javascript
auth: {
  driver: 'jwt',
  config: {
    jwtSecret: process.env.JWT_SECRET,        // Use environment variables
    jwtExpiresIn: '1h',                       // Short expiration for sensitive apps
  }
}
```

**Basic Authentication:**
```javascript
auth: {
  driver: 'basic',
  config: {
    realm: 'Production API',                   // Descriptive realm name
    passphrase: process.env.ENCRYPTION_KEY     // Secure passphrase
  }
}
```

**Resource Protection:**
```javascript
resources: {
  // Protect sensitive resources
  payments: {
    auth: true,  // ✅ Requires authentication
    methods: ['GET', 'POST']
  },

  // Public data can be open
  products: {
    auth: false,  // ✅ Public read access
    methods: ['GET']
  }
}
```

#### ⚠️ Security Notes

1. **Always use HTTPS in production** - Authentication headers can be intercepted over HTTP
2. **Store JWT secrets securely** - Use environment variables, never commit secrets to git
3. **Use strong passwords** - Minimum 8 characters enforced by default
4. **Rotate secrets regularly** - Update `jwtSecret` and `passphrase` periodically
5. **Monitor failed login attempts** - Implement rate limiting for `/auth/login`
6. **Validate token expiration** - Shorter expiration = better security (trade-off with UX)

---

### 🛡️ Declarative Guards (Authorization)

**Guards** are declarative authorization rules defined directly in resource configuration. They enable **row-level security (RLS)**, **multi-tenancy**, and **ownership checks** with minimal code.

#### 🎯 Why Guards?

**Before Guards (Manual Authorization):**
```javascript
// ❌ 70+ lines of repetitive middleware
app.get('/orders', requireAuth, async (req, res) => {
  // Manual tenant check
  if (!req.user.tenantId) return res.status(403).json({ error: 'Forbidden' });

  // Manual partition setup
  const orders = await ordersResource.list({
    partition: 'byTenantUser',
    partitionValues: {
      tenantId: req.user.tenantId,
      userId: req.user.sub
    }
  });
  res.json(orders);
});

app.post('/orders', requireAuth, async (req, res) => {
  // Manual tenant injection (easy to forget!)
  if (!req.user.tenantId) return res.status(403).json({ error: 'Forbidden' });
  req.body.tenantId = req.user.tenantId;  // MUST remember to do this!
  req.body.userId = req.user.sub;

  const order = await ordersResource.insert(req.body);
  res.json(order);
});

// ... 50+ more lines for update, delete, ownership checks...
```

**With Guards (Declarative Authorization):**
```javascript
// ✅ 20 lines - Impossible to forget!
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: { tenantId: 'string|required', userId: 'string|required', ... },
  guard: {
    // Wildcard: applies to ALL operations
    '*': (ctx) => {
      const tenantId = ctx.user.tenantId || ctx.user.tid;
      if (!tenantId) return false;
      ctx.tenantId = tenantId;
      ctx.userId = ctx.user.sub;
      return true;
    },

    // List: automatic partition (O(1) RLS!)
    list: (ctx) => {
      ctx.setPartition('byTenantUser', {
        tenantId: ctx.tenantId,
        userId: ctx.userId
      });
      return true;
    },

    // Insert: force tenant/user from token (never trust body!)
    insert: (ctx) => {
      ctx.body.tenantId = ctx.tenantId;
      ctx.body.userId = ctx.userId;
      return true;
    },

    // Update: ownership check
    update: (ctx, resource) => resource.userId === ctx.userId,

    // Delete: ownership OR admin role
    delete: (ctx, resource) => {
      const isOwner = resource.userId === ctx.userId;
      const isAdmin = ctx.user.roles?.includes('admin');
      return isOwner || isAdmin;
    }
  }
});
```

**Benefits:**
- ✅ **70+ lines → 20 lines** (DRY principle)
- ✅ **Impossible to forget** protection (defined once, applied everywhere)
- ✅ **O(1) Row-Level Security** via automatic partitions
- ✅ **Framework-agnostic** (works with Hono, Express, Fastify)
- ✅ **Type-safe** authorization logic
- ✅ **Centralized** security rules

#### 📖 Guard Syntax

**Simple Role/Scope Array:**
```javascript
guard: ['admin']  // Allow if user has 'admin' role or scope
```

**Per-Operation Guards:**
```javascript
guard: {
  list: (ctx) => { /* ... */ },
  get: (ctx, resource) => { /* ... */ },
  insert: (ctx) => { /* ... */ },
  update: (ctx, resource) => { /* ... */ },
  delete: (ctx, resource) => { /* ... */ }
}
```

**Wildcard + Override:**
```javascript
guard: {
  '*': (ctx) => ctx.user.tenantId ? true : false,  // Apply to all
  delete: ['admin']  // Override: only admins can delete
}
```

**Guard Function Signature:**
```javascript
type GuardContext = {
  user: JWTPayload;           // Decoded JWT token
  params: Record<string, string>;
  body: any;
  query: Record<string, string>;
  headers: Record<string, string>;
  setPartition(name, values): void;  // Helper to set partition
  tenantId?: string;
  userId?: string;
  raw?: { req?, c?, request? };      // Framework-specific
};

type GuardFunction = (
  context: GuardContext,
  resource?: Resource  // Current resource (for get/update/delete)
) => boolean | Promise<boolean>;
```

#### 🔌 Framework Integration

**Hono (Recommended):**
```javascript
import { createHonoContext, applyGuardsToList } from 's3db.js/concerns/guards-helpers';
import { Hono } from 'hono';

const app = new Hono();

// Auth middleware (populate c.set('user'))
app.use('*', async (c, next) => {
  const token = c.req.header('authorization')?.replace('Bearer ', '');
  const user = verifyJWT(token);  // Your JWT verification
  c.set('user', user);
  await next();
});

// Routes with guards
app.get('/orders', async (c) => {
  const context = await createHonoContext(c);
  const options = await applyGuardsToList(ordersResource, context);
  const orders = await ordersResource.list(options);
  return c.json({ orders });
});

app.post('/orders', async (c) => {
  const context = await createHonoContext(c);
  const body = await c.req.json();
  const data = await applyGuardsToInsert(ordersResource, context, body);
  const order = await ordersResource.insert(data);
  return c.json(order, 201);
});
```

**Express:**
```javascript
import { createExpressContext, applyGuardsToList } from 's3db.js/concerns/guards-helpers';

app.get('/orders', async (req, res) => {
  const context = createExpressContext(req);
  const options = await applyGuardsToList(ordersResource, context);
  const orders = await ordersResource.list(options);
  res.json({ orders });
});
```

**Fastify:**
```javascript
import { createFastifyContext, applyGuardsToList } from 's3db.js/concerns/guards-helpers';

fastify.get('/orders', async (request, reply) => {
  const context = createFastifyContext(request);
  const options = await applyGuardsToList(ordersResource, context);
  const orders = await ordersResource.list(options);
  return { orders };
});
```

#### 🎯 Common Patterns

**Multi-Tenancy (Tenant Isolation):**
```javascript
guard: {
  '*': (ctx) => {
    ctx.tenantId = ctx.user.tenantId;
    return !!ctx.tenantId;
  },
  list: (ctx) => {
    ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
    return true;
  },
  insert: (ctx) => {
    ctx.body.tenantId = ctx.tenantId;  // Force tenant
    return true;
  }
}
```

**Ownership Checks:**
```javascript
guard: {
  get: (ctx, resource) => resource.userId === ctx.user.sub,
  update: (ctx, resource) => resource.userId === ctx.user.sub,
  delete: (ctx, resource) => resource.userId === ctx.user.sub
}
```

**Role-Based Access Control (RBAC):**
```javascript
guard: {
  list: ['user', 'admin'],           // Users and admins can list
  insert: ['user', 'admin'],         // Users and admins can create
  update: (ctx, resource) => {       // Only owners or admins can update
    const isOwner = resource.userId === ctx.user.sub;
    const isAdmin = ctx.user.roles?.includes('admin');
    return isOwner || isAdmin;
  },
  delete: ['admin']                  // Only admins can delete
}
```

**Scope-Based Authorization:**
```javascript
guard: {
  list: (ctx) => {
    const scopes = ctx.user.scope?.split(' ') || [];
    if (scopes.includes('orders:read:all')) {
      // Admin: see all orders
      return true;
    } else if (scopes.includes('orders:read:own')) {
      // User: see only own orders
      ctx.setPartition('byUser', { userId: ctx.user.sub });
      return true;
    }
    return false;
  }
}
```

#### 📚 Helper Functions

Import from `s3db.js/concerns/guards-helpers`:

```javascript
// Framework adapters
createHonoContext(c)          // Hono → GuardContext
createExpressContext(req)     // Express → GuardContext
createFastifyContext(request) // Fastify → GuardContext

// Guard application
applyGuardsToList(resource, context, options)    // Returns modified options
applyGuardsToGet(resource, context, record)      // Returns record or null
applyGuardsToInsert(resource, context, data)     // Returns modified data
applyGuardsToUpdate(resource, context, record)   // Throws if denied
applyGuardsToDelete(resource, context, record)   // Throws if denied
```

#### 🔗 Examples & Documentation

- **Complete Example**: [docs/examples/e66-guards-live.js](../../docs/examples/e66-guards-live.js)
- **Before/After Comparison**: [docs/examples/e65-guards-comparison.js](../../docs/examples/e65-guards-comparison.js)
- **Design Document**: [docs/guards-design.md](../../docs/guards-design.md)

#### ⚠️ Important Notes

1. **Guards are NOT automatic with API Plugin** - You must manually apply guards in custom routes
2. **Future feature**: `addResource()` method will auto-apply guards to generated routes
3. **Never trust request body** - Always force `tenantId`/`userId` from token in guards
4. **Use 404 instead of 403** - Prevents information leakage (don't reveal resource exists)
5. **Guards run BEFORE database operations** - Failed guards never hit the database
6. **Partitions = O(1) RLS** - Use `ctx.setPartition()` for optimal performance

---

## 🛣️ API Endpoints

### Resource Endpoints

For each resource, the following endpoints are automatically created:

#### List Resources (with Filtering)
```http
GET /{resource}?limit=100&offset=0&status=active&year=2024

Query Parameters:
- limit (number): Max items to return (default: 100, max: 1000)
- offset (number): Skip first N items (default: 0)
- partition (string): Partition name
- partitionValues (JSON): Partition values filter
- [any field]: Any resource field for filtering (e.g., status=active, year=2024)

Examples:
  GET /cars?inStock=true
  GET /cars?brand=Toyota&year=2024
  GET /cars?price={"$gte":20000,"$lte":30000}  (JSON filter)

Response:
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 150,
    "page": 1,
    "pageSize": 100,
    "pageCount": 2
  }
}

Headers:
- X-Total-Count: Total number of records
- X-Page-Count: Total number of pages

Note: If any filter parameters are present (other than limit, offset, partition,
partitionValues), the endpoint automatically uses resource.query() instead of
resource.list() for efficient filtering.
```

#### Get Single Resource
```http
GET /{resource}/:id

Response:
{
  "success": true,
  "data": { "id": "car-1", ... }
}
```

#### Create Resource
```http
POST /{resource}

Body:
{
  "brand": "Toyota",
  "model": "Corolla",
  "year": 2024,
  "price": 25000
}

Response:
{
  "success": true,
  "data": { "id": "abc123", ... },
  "meta": {
    "location": "/cars/abc123"
  }
}

Headers:
- Location: URL of created resource
```

#### Update Resource (Full)
```http
PUT /{resource}/:id

Body: Complete resource object

Response:
{
  "success": true,
  "data": { "id": "car-1", ... }
}
```

#### Update Resource (Partial)
```http
PATCH /{resource}/:id

Body: Partial resource object
{
  "price": 24000
}

Response:
{
  "success": true,
  "data": { "id": "car-1", "price": 24000, ... }
}
```

#### Delete Resource
```http
DELETE /{resource}/:id

Response:
{
  "success": true,
  "data": null
}
```

#### Get Resource Statistics
```http
HEAD /{resource}

Response: Empty body (200 OK)

Headers:
- X-Total-Count: 150 (total number of records)
- X-Resource-Version: v0 (current resource version)
- X-Schema-Fields: 8 (number of fields in schema)

Example:
  curl -I http://localhost:3000/cars

  HTTP/1.1 200 OK
  X-Total-Count: 150
  X-Resource-Version: v0
  X-Schema-Fields: 8
```

#### Check if Resource Exists
```http
HEAD /{resource}/:id

Response: Empty body (200 OK or 404 Not Found)

Headers (if exists):
- Last-Modified: Tue, 15 Nov 2024 12:30:00 GMT

Example:
  curl -I http://localhost:3000/cars/car-1

  HTTP/1.1 200 OK
  Last-Modified: Tue, 15 Nov 2024 12:30:00 GMT
```

#### Get Resource Metadata
```http
OPTIONS /{resource}

Response:
{
  "resource": "cars",
  "version": "v0",
  "totalRecords": 150,
  "allowedMethods": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  "schema": [
    {
      "name": "brand",
      "type": "string",
      "rules": ["required", "minlength:2"]
    },
    {
      "name": "year",
      "type": "number",
      "rules": ["required", "min:1900", "max:2025"]
    }
  ],
  "endpoints": {
    "list": "/cars",
    "get": "/cars/:id",
    "create": "/cars",
    "update": "/cars/:id",
    "delete": "/cars/:id"
  },
  "queryParameters": {
    "limit": "number (1-1000, default: 100)",
    "offset": "number (min: 0, default: 0)",
    "partition": "string (partition name)",
    "partitionValues": "JSON string",
    "[any field]": "any (filter by field value)"
  }
}

Headers:
- Allow: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
```

### Health Check Endpoints (Kubernetes)

The API provides 3 health check endpoints optimized for Kubernetes probes:

```http
GET /health/live
# Liveness probe - checks if app is alive
# If this fails, Kubernetes will restart the pod

GET /health/ready
# Readiness probe - checks if app is ready to receive traffic
# If this fails, Kubernetes will remove pod from service endpoints

GET /health
# Generic health check with links to other probes
```

**Liveness Probe** (`/health/live`):
```json
{
  "success": true,
  "data": {
    "status": "alive",
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

**Readiness Probe** (`/health/ready`):
```json
// When ready (200 OK)
{
  "success": true,
  "data": {
    "status": "ready",
    "database": {
      "connected": true,
      "resources": 5
    },
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}

// When not ready (503 Service Unavailable)
{
  "success": false,
  "error": {
    "message": "Service not ready",
    "code": "NOT_READY",
    "details": {
      "database": {
        "connected": false,
        "resources": 0
      }
    }
  }
}
```

**Kubernetes Configuration Example:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: s3db-api
spec:
  containers:
  - name: api
    image: my-s3db-api:latest
    ports:
    - containerPort: 3000
    livenessProbe:
      httpGet:
        path: /health/live
        port: 3000
      initialDelaySeconds: 10
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 5
```

### Other Utility Endpoints

```http
GET /
# API information and available resources

GET /docs
# Interactive Swagger UI documentation

GET /openapi.json
# OpenAPI 3.0 specification (JSON)
```

**Example `/` response:**
```json
{
  "success": true,
  "data": {
    "message": "s3db.js API",
    "version": "1.0.0",
    "resources": [
      {
        "name": "cars",
        "version": "v0",
        "endpoints": {
          "list": "/cars",
          "get": "/cars/:id",
          "create": "/cars",
          "update": "/cars/:id",
          "delete": "/cars/:id"
        }
      }
    ],
    "documentation": "/docs"
  }
}
```

---

## 🐳 Production Deployment

### Docker Setup

**Dockerfile:**
```dockerfile
# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build if needed (optional, for TypeScript projects)
# RUN pnpm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy application code
COPY --from=builder /app/src ./src
COPY --from=builder /app/docs ./docs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start application
CMD ["node", "src/your-api-server.js"]
```

**Docker Compose (for local development):**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - S3_BUCKET=my-s3db-bucket
      - S3_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./src:/app/src
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health/live"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    restart: unless-stopped

  # Optional: LocalStack for S3 development
  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=s3
      - DEBUG=1
    volumes:
      - ./localstack-data:/var/lib/localstack
```

**.dockerignore:**
```
node_modules/
npm-debug.log
.git/
.gitignore
*.md
tests/
coverage/
.env
.env.local
localstack-data/
```

**Build and run:**
```bash
# Build image
docker build -t my-s3db-api:1.0.0 .

# Run locally
docker run -p 3000:3000 \
  -e S3_BUCKET=my-bucket \
  -e AWS_ACCESS_KEY_ID=xxx \
  -e AWS_SECRET_ACCESS_KEY=yyy \
  my-s3db-api:1.0.0

# Or use docker-compose
docker-compose up -d

# Check health
curl http://localhost:3000/health/ready
```

---

### Kubernetes Deployment

**Complete Kubernetes manifests for production deployment:**

**1. Namespace:**
```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: s3db-api
  labels:
    name: s3db-api
```

**2. ConfigMap (non-sensitive configuration):**
```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: s3db-api-config
  namespace: s3db-api
data:
  # Server configuration
  PORT: "3000"
  HOST: "0.0.0.0"
  NODE_ENV: "production"

  # S3 configuration
  S3_BUCKET: "my-s3db-production"
  S3_REGION: "us-east-1"

  # API configuration
  CORS_ENABLED: "true"
  CORS_ORIGIN: "*"
  RATE_LIMIT_ENABLED: "true"
  RATE_LIMIT_MAX_REQUESTS: "100"
  RATE_LIMIT_WINDOW_MS: "60000"

  # Logging
  LOGGING_ENABLED: "true"
  VERBOSE: "false"
```

**3. Secret (sensitive data):**
```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: s3db-api-secret
  namespace: s3db-api
type: Opaque
stringData:
  # AWS Credentials (use IRSA in production - see below)
  AWS_ACCESS_KEY_ID: "your-access-key-id"
  AWS_SECRET_ACCESS_KEY: "your-secret-access-key"

  # JWT Secret
  JWT_SECRET: "your-super-secret-jwt-key-256-bits"

  # API Keys (if using Basic Auth)
  BASIC_AUTH_PASSPHRASE: "your-encryption-passphrase"
```

**4. Deployment:**
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: s3db-api
  namespace: s3db-api
  labels:
    app: s3db-api
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: s3db-api
  template:
    metadata:
      labels:
        app: s3db-api
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      # Use service account with IRSA for AWS credentials (recommended)
      serviceAccountName: s3db-api-sa

      # Security context
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault

      containers:
      - name: api
        image: my-registry/s3db-api:1.0.0
        imagePullPolicy: Always

        ports:
        - name: http
          containerPort: 3000
          protocol: TCP

        # Environment variables from ConfigMap
        envFrom:
        - configMapRef:
            name: s3db-api-config
        - secretRef:
            name: s3db-api-secret

        # Resource limits
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

        # Liveness probe - restart if unhealthy
        livenessProbe:
          httpGet:
            path: /health/live
            port: http
            scheme: HTTP
          initialDelaySeconds: 15
          periodSeconds: 10
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 3

        # Readiness probe - remove from load balancer if not ready
        readinessProbe:
          httpGet:
            path: /health/ready
            port: http
            scheme: HTTP
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 2

        # Startup probe - for slow-starting apps
        startupProbe:
          httpGet:
            path: /health/live
            port: http
          initialDelaySeconds: 0
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 12

        # Security context
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: false
          runAsNonRoot: true
          runAsUser: 1001
          capabilities:
            drop:
            - ALL

      # Graceful shutdown
      terminationGracePeriodSeconds: 30

      # DNS policy
      dnsPolicy: ClusterFirst

      # Restart policy
      restartPolicy: Always
```

**5. Service:**
```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: s3db-api
  namespace: s3db-api
  labels:
    app: s3db-api
spec:
  type: ClusterIP
  selector:
    app: s3db-api
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
  sessionAffinity: None
```

**6. Ingress (NGINX):**
```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: s3db-api
  namespace: s3db-api
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: s3db-api-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: s3db-api
            port:
              number: 80
```

**7. HorizontalPodAutoscaler:**
```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: s3db-api
  namespace: s3db-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: s3db-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 15
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 2
        periodSeconds: 15
      selectPolicy: Max
```

**8. ServiceAccount with IRSA (AWS IAM Roles for Service Accounts):**
```yaml
# serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3db-api-sa
  namespace: s3db-api
  annotations:
    # AWS EKS - IRSA annotation (replaces access keys)
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/s3db-api-role
```

**9. PodDisruptionBudget:**
```yaml
# pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: s3db-api
  namespace: s3db-api
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: s3db-api
```

---

### Deploy to Kubernetes

**1. Create namespace and apply manifests:**
```bash
# Create namespace
kubectl apply -f namespace.yaml

# Apply configurations
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f serviceaccount.yaml

# Deploy application
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml

# Apply autoscaling and PDB
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml

# Verify deployment
kubectl -n s3db-api get all
kubectl -n s3db-api get pods
kubectl -n s3db-api describe pod <pod-name>
```

**2. Check health probes:**
```bash
# Port-forward to test locally
kubectl -n s3db-api port-forward svc/s3db-api 8080:80

# Test health endpoints
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
curl http://localhost:8080/health

# Check pod events
kubectl -n s3db-api get events --sort-by=.metadata.creationTimestamp

# Check logs
kubectl -n s3db-api logs -f deployment/s3db-api
```

**3. Monitor rollout:**
```bash
# Watch rollout status
kubectl -n s3db-api rollout status deployment/s3db-api

# Check pod readiness
kubectl -n s3db-api get pods -w

# Describe deployment
kubectl -n s3db-api describe deployment s3db-api
```

**4. Update deployment:**
```bash
# Update image
kubectl -n s3db-api set image deployment/s3db-api \
  api=my-registry/s3db-api:1.0.1

# Or apply updated manifest
kubectl apply -f deployment.yaml

# Rollback if needed
kubectl -n s3db-api rollout undo deployment/s3db-api
kubectl -n s3db-api rollout history deployment/s3db-api
```

---

### AWS IAM Policy for S3 Access

**IAM Policy for s3db.js (attach to IRSA role):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-s3db-production",
        "arn:aws:s3:::my-s3db-production/*"
      ]
    }
  ]
}
```

**Trust policy for IRSA:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B71EXAMPLE"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.us-east-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B71EXAMPLE:sub": "system:serviceaccount:s3db-api:s3db-api-sa"
        }
      }
    }
  ]
}
```

---

### Production Best Practices

**1. Security:**
- ✅ Use IRSA instead of access keys (no secrets in pods)
- ✅ Run as non-root user (UID 1001)
- ✅ Read-only root filesystem when possible
- ✅ Drop all Linux capabilities
- ✅ Use secrets for sensitive data
- ✅ Enable TLS/HTTPS via Ingress
- ✅ Use NetworkPolicies to restrict traffic

**2. Reliability:**
- ✅ Set resource requests and limits
- ✅ Configure liveness and readiness probes
- ✅ Use PodDisruptionBudget (min 1 pod available)
- ✅ Enable HPA for auto-scaling
- ✅ Use RollingUpdate strategy with maxUnavailable: 0
- ✅ Set proper termination grace period (30s)

**3. Monitoring:**
- ✅ Expose metrics endpoint (Prometheus)
- ✅ Configure structured logging
- ✅ Use APM tools (DataDog, New Relic, etc.)
- ✅ Set up alerts for health probe failures
- ✅ Monitor S3 costs and API calls

**4. High Availability:**
- ✅ Run minimum 2 replicas (3+ recommended)
- ✅ Spread pods across availability zones
- ✅ Use pod anti-affinity for spreading
- ✅ Configure backup S3 buckets
- ✅ Implement circuit breakers for S3 calls

**Example pod anti-affinity:**
```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - s3db-api
        topologyKey: topology.kubernetes.io/zone
```

---

### Prometheus Monitoring

The API Plugin integrates seamlessly with the MetricsPlugin to expose Prometheus metrics for monitoring and observability.

**Two deployment modes:**

1. **Integrated Mode** (Recommended): Metrics exposed on same port as API (`/metrics` endpoint)
2. **Standalone Mode**: Separate metrics server on dedicated port (e.g., 9090)

#### Integrated Mode Setup

```javascript
import { Database, ApiPlugin, MetricsPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });

// 1. Add MetricsPlugin first (auto-detects API Plugin)
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'auto',        // Auto-detects API Plugin and integrates
    path: '/metrics'      // Metrics available at /metrics
  }
}));

// 2. Add API Plugin
await db.usePlugin(new ApiPlugin({
  port: 3000,
  resources: { /* ... */ }
}));

// Metrics now available at: http://localhost:3000/metrics
```

**Kubernetes Deployment with Prometheus Annotations:**

The deployment example above (line 944-947) includes Prometheus annotations that tell Prometheus to scrape metrics:

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"      # Enable scraping
    prometheus.io/port: "3000"        # Same port as API
    prometheus.io/path: "/metrics"    # Metrics endpoint path
```

**ServiceMonitor (Prometheus Operator):**

```yaml
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: s3db-api
  namespace: s3db-api
  labels:
    app: s3db-api
spec:
  selector:
    matchLabels:
      app: s3db-api
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
```

**Apply ServiceMonitor:**
```bash
kubectl apply -f servicemonitor.yaml

# Verify Prometheus is scraping
kubectl -n monitoring get servicemonitor s3db-api
```

#### Standalone Mode Setup

For security or compliance requirements, run metrics on a separate port:

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'standalone',   // Separate HTTP server
    port: 9090,           // Dedicated metrics port
    path: '/metrics'
  }
}));

// API on port 3000, metrics on port 9090
await db.usePlugin(new ApiPlugin({ port: 3000 }));
```

**Kubernetes Deployment for Standalone Mode:**

```yaml
# deployment.yaml (standalone metrics)
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"         # Separate metrics port
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: api
        ports:
        - name: http
          containerPort: 3000
        - name: metrics          # Additional port for metrics
          containerPort: 9090
```

**Service for Standalone Mode:**

```yaml
# service.yaml (with metrics port)
apiVersion: v1
kind: Service
metadata:
  name: s3db-api
  namespace: s3db-api
spec:
  ports:
  - name: http
    port: 80
    targetPort: 3000
  - name: metrics        # Expose metrics port
    port: 9090
    targetPort: 9090
  selector:
    app: s3db-api
```

**ServiceMonitor for Standalone Mode:**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: s3db-api-metrics
  namespace: s3db-api
spec:
  selector:
    matchLabels:
      app: s3db-api
  endpoints:
  - port: metrics        # Use dedicated metrics port
    path: /metrics
    interval: 30s
```

#### Exported Metrics

The MetricsPlugin exports these Prometheus metrics:

**Counters** (always increasing):
- `s3db_operations_total{operation, resource}` - Total operations by type
- `s3db_operation_errors_total{operation, resource}` - Total errors

**Gauges** (can increase/decrease):
- `s3db_operation_duration_seconds{operation, resource}` - Average operation duration
- `s3db_uptime_seconds` - Process uptime
- `s3db_resources_total` - Number of tracked resources
- `s3db_info{version, node_version}` - Build information

**Example Prometheus output:**
```
# HELP s3db_operations_total Total number of operations by type and resource
# TYPE s3db_operations_total counter
s3db_operations_total{operation="insert",resource="cars"} 1523
s3db_operations_total{operation="update",resource="cars"} 342

# HELP s3db_operation_duration_seconds Average operation duration in seconds
# TYPE s3db_operation_duration_seconds gauge
s3db_operation_duration_seconds{operation="insert",resource="cars"} 0.045
```

#### Testing Metrics Endpoint

```bash
# Integrated mode
curl http://localhost:3000/metrics

# Standalone mode
curl http://localhost:9090/metrics

# In Kubernetes (port-forward)
kubectl -n s3db-api port-forward svc/s3db-api 8080:80
curl http://localhost:8080/metrics
```

#### Grafana Dashboard Queries

**Request Rate:**
```promql
rate(s3db_operations_total[5m])
```

**Error Rate:**
```promql
rate(s3db_operation_errors_total[5m]) / rate(s3db_operations_total[5m])
```

**P95 Latency:**
```promql
histogram_quantile(0.95, rate(s3db_operation_duration_seconds[5m]))
```

**Resource Operations by Type:**
```promql
sum by (operation) (rate(s3db_operations_total{resource="cars"}[5m]))
```

#### Complete Example

See [e48-metrics-prometheus.js](../examples/e48-metrics-prometheus.js) for a complete working example demonstrating both integrated and standalone modes.

For detailed MetricsPlugin configuration and features, see [MetricsPlugin documentation](./metrics.md#prometheus-integration).

---

## 🔄 URL Versioning Configuration

**By default, the API Plugin generates clean URLs without version prefixes** (e.g., `/cars`, `/users`). This provides intuitive, simple endpoints that are easy to use and remember.

### Default Behavior (Clean URLs)

```javascript
const cars = await db.createResource({
  name: 'cars',
  attributes: {
    brand: 'string|required',
    model: 'string|required',
    year: 'number|required'
  }
});

await db.usePlugin(new ApiPlugin({ port: 3000 }));

// Endpoints created with clean URLs:
// GET /cars
// POST /cars
// GET /cars/:id
// etc.
```

### Enabling Version Prefixes

You can enable version prefixes globally or per-resource using the `versionPrefix` option:

#### Global Configuration

```javascript
// Enable version prefixes for ALL resources
await db.usePlugin(new ApiPlugin({
  port: 3000,
  versionPrefix: true  // Use resource version as prefix
}));

// All resources now have version prefix:
// GET /v0/cars
// GET /v0/users
// GET /v0/products
```

#### Per-Resource Configuration

```javascript
// Mix clean URLs with versioned endpoints
await db.usePlugin(new ApiPlugin({
  port: 3000,

  // Global default: no prefix
  versionPrefix: false,  // or omit (false is default)

  resources: {
    // cars: uses global default (no prefix)
    cars: {
      auth: false
    },

    // users: override with version prefix
    users: {
      auth: ['jwt'],
      versionPrefix: true  // Use /v1/users
    },

    // orders: override with custom prefix
    orders: {
      auth: ['jwt', 'apiKey'],
      versionPrefix: 'api/v2'  // Use /api/v2/orders
    }
  }
}));

// Resulting endpoints:
// GET /cars              (global default - no prefix)
// GET /v1/users          (resource override - version prefix)
// GET /api/v2/orders     (resource override - custom prefix)
```

### Version Prefix Options

The `versionPrefix` option accepts three types of values:

| Value | Behavior | Example URL |
|-------|----------|-------------|
| `false` | No prefix (DEFAULT) | `/cars` |
| `true` | Use resource version | `/v0/cars`, `/v1/cars` |
| `string` | Custom prefix | `/api/v1/cars`, `/v2/cars` |

### Resource Schema Versioning

s3db.js automatically versions resource schemas when you update attributes. Combined with `versionPrefix: true`, this enables API versioning:

```javascript
// Create initial resource (v0)
const cars = await db.createResource({
  name: 'cars',
  attributes: {
    brand: 'string|required',
    model: 'string|required',
    year: 'number|required'
  }
});

// Enable version prefix
await db.usePlugin(new ApiPlugin({
  port: 3000,
  resources: {
    cars: { versionPrefix: true }
  }
}));

// Initial endpoint: GET /v0/cars

// Update schema (creates v1)
await database.updateResourceAttributes('cars', {
  brand: 'string|required',
  model: 'string|required',
  year: 'number|required',
  electric: 'boolean|default:false'  // New field
});

// Now both versions are available:
// GET /v0/cars  (old schema)
// GET /v1/cars  (new schema)
```

**Benefits of versioned APIs:**
- Clients can continue using old API version during migration
- Gradual rollout of new features
- Test new version before switching
- Backward compatibility

**When to use versioned URLs:**
- Public APIs with external consumers
- Long-lived applications requiring backward compatibility
- APIs with multiple client versions in production
- Microservices with complex dependencies

**When to use clean URLs (default):**
- Internal APIs
- Rapid development and prototyping
- Single-page applications with synchronized deployments
- Simple CRUD operations
- When you control all API consumers

### Complete Example

See [e77-api-version-prefix.js](../examples/e77-api-version-prefix.js) for a complete working example demonstrating:
- Global `versionPrefix` configuration
- Per-resource overrides
- Custom prefix strings
- Mix of clean and versioned URLs

---

## 🎛️ Custom Middlewares

### Global Middlewares

Add middleware to all requests:

```javascript
new ApiPlugin({
  middlewares: [
    // Request ID
    async (c, next) => {
      c.set('requestId', crypto.randomUUID());
      await next();
    },

    // Request timing
    async (c, next) => {
      const start = Date.now();
      await next();
      const duration = Date.now() - start;
      c.header('X-Response-Time', `${duration}ms`);
    },

    // Custom header
    async (c, next) => {
      c.header('X-Powered-By', 's3db.js');
      await next();
    }
  ]
})
```

### Resource-Specific Middlewares

Add middleware to specific resources:

```javascript
resources: {
  cars: {
    customMiddleware: [
      // Check ownership
      async (c, next) => {
        const user = c.get('user');
        if (!user || user.role !== 'admin') {
          return c.json({
            success: false,
            error: { message: 'Admin access required' }
          }, 403);
        }
        await next();
      },

      // Add metadata
      async (c, next) => {
        await next();
        // Modify response after route handler
        c.header('X-Resource', 'cars');
      }
    ]
  }
}
```

---

## 🛤️ Custom Routes

Define custom routes at both plugin and resource level using a moleculer-js inspired syntax.

### Plugin-Level Custom Routes

Add global custom routes to your API:

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,

  // Plugin-level custom routes (mounted at root)
  routes: {
    'GET /health': async (c) => {
      return c.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: Date.now()
      });
    },

    'POST /webhook': async (c) => {
      const payload = await c.req.json();
      // Access database via context
      const context = c.get('customRouteContext');
      const { database } = context;

      // Process webhook
      await database.resources.webhooks.insert(payload);

      return c.json({ success: true });
    },

    'GET /stats': async (c) => {
      const context = c.get('customRouteContext');
      const { database } = context;

      const stats = {
        users: await database.resources.users.count(),
        orders: await database.resources.orders.count()
      };

      return c.json(stats);
    }
  }
}));
```

**Generated routes:**
- `GET /health`
- `POST /webhook`
- `GET /stats`

### Resource-Level Custom Routes

Add custom routes nested under resource paths:

```javascript
await db.usePlugin(new ApiPlugin({
  resources: {
    users: {
      methods: ['GET', 'POST', 'PUT', 'DELETE'],

      // Custom routes for users resource (mounted under /users)
      routes: {
        'POST /:id/activate': async (c) => {
          const userId = c.req.param('id');
          const context = c.get('customRouteContext');
          const { resource } = context;

          // Activate user
          await resource.update(userId, { active: true, activatedAt: new Date().toISOString() });

          return c.json({
            success: true,
            message: `User ${userId} activated`
          });
        },

        'POST /:id/reset-password': async (c) => {
          const userId = c.req.param('id');
          const { newPassword } = await c.req.json();
          const context = c.get('customRouteContext');
          const { resource } = context;

          await resource.update(userId, { password: newPassword });

          return c.json({ success: true });
        },

        'GET /:id/statistics': async (c) => {
          const userId = c.req.param('id');
          const context = c.get('customRouteContext');
          const { database } = context;

          // Query related data
          const orders = await database.resources.orders.query({ userId });
          const stats = {
            totalOrders: orders.length,
            totalSpent: orders.reduce((sum, o) => sum + o.total, 0)
          };

          return c.json(stats);
        }
      }
    }
  }
}));
```

**Generated routes:**
- `POST /users/:id/activate`
- `POST /users/:id/reset-password`
- `GET /users/:id/statistics`

### Route Key Format

Routes must follow the format: `"METHOD /path"`

**Valid methods:** GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS

**Path examples:**
- `"/health"` - Simple path
- `"/:id"` - Path parameter
- `"/:id/action"` - Nested path with parameter
- `"/users/:userId/orders/:orderId"` - Multiple parameters

### Context Access

Custom route handlers receive context via `c.get('customRouteContext')`:

**Plugin-level routes:**
```javascript
{
  database,      // Database instance
  plugins        // All plugins
}
```

**Resource-level routes:**
```javascript
{
  resource,      // Current resource instance
  database,      // Database instance
  resourceName,  // Resource name string
  version        // Resource version (e.g., 'v1')
}
```

### Complete Example

```javascript
const db = new Database({ connectionString: '...' });
await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    password: 'secret|required',
    active: 'boolean|default:false'
  }
});

await db.usePlugin(new ApiPlugin({
  port: 3000,

  // Global custom routes
  routes: {
    'GET /api/info': async (c) => {
      return c.json({
        name: 'My API',
        version: '1.0.0',
        environment: process.env.NODE_ENV
      });
    }
  },

  resources: {
    users: {
      // Resource-specific custom routes
      routes: {
        'POST /:id/activate': async (c) => {
          const userId = c.req.param('id');
          const context = c.get('customRouteContext');
          await context.resource.update(userId, { active: true });
          return c.json({ success: true });
        }
      }
    }
  }
}));

// Routes available:
// GET  /api/info
// POST /users/:id/activate
// GET  /users (standard CRUD)
// POST /users (standard CRUD)
// etc.
```

---

## 📊 Rate Limiting

Protect your API from abuse with built-in rate limiting:

```javascript
new ApiPlugin({
  rateLimit: {
    enabled: true,
    windowMs: 60000,        // 1 minute window
    maxRequests: 100,       // 100 requests per window
    keyGenerator: (c) => {
      // Custom key (default: IP address)
      const user = c.get('user');
      return user ? user.id : c.req.header('x-forwarded-for') || 'unknown';
    }
  }
})
```

**Response when limit exceeded:**
```json
{
  "success": false,
  "error": {
    "message": "Rate limit exceeded",
    "code": "RATE_LIMIT_EXCEEDED",
    "details": {
      "retryAfter": 45
    }
  }
}
```

**Response headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1234567890
Retry-After: 45
```

---

## 📝 Request Logging

Enable detailed request logging:

```javascript
new ApiPlugin({
  logging: {
    enabled: true,
    format: ':method :path :status :response-time ms - :user',
    verbose: false
  }
})
```

**Log output:**
```
[API Plugin] GET /v0/cars 200 45ms - john
[API Plugin] POST /v0/cars 201 123ms - alice
[API Plugin] DELETE /v0/cars/car-1 204 67ms - admin
```

---

## 🗜️ Response Compression

Reduce bandwidth with automatic **Brotli and Gzip compression** using native Node.js zlib (zero dependencies):

```javascript
new ApiPlugin({
  compression: {
    enabled: true,
    threshold: 1024,  // Only compress responses > 1KB
    level: 6          // Compression level (1-9, higher = better compression)
  }
})
```

**Compression Algorithms:**
- **Brotli** (modern): 30% better compression than gzip, used when client supports it
- **Gzip** (legacy): Fallback for older browsers

**Smart Features:**
- Automatic algorithm selection based on `Accept-Encoding` header
- Skips already-compressed content (images, videos, archives)
- Only compresses if result is smaller than original
- **40-60% response size reduction** on JSON/text responses

**Client Support:**
```
Accept-Encoding: br, gzip, deflate  # Brotli preferred
Accept-Encoding: gzip, deflate      # Gzip fallback
```

**Response Headers:**
```
Content-Encoding: br              # Brotli used
Content-Length: 125               # Compressed size
Vary: Accept-Encoding             # Cache hint
```

---

## 🌍 CORS Configuration

Enable Cross-Origin Resource Sharing:

```javascript
new ApiPlugin({
  cors: {
    enabled: true,
    origin: '*',  // Allow all origins
    // or specific origins:
    // origin: 'https://myapp.com',
    // or multiple origins:
    // origin: ['https://app1.com', 'https://app2.com'],

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    credentials: true,  // Allow cookies
    maxAge: 86400       // Cache preflight for 24 hours
  }
})
```

---

## 🎯 Best Practices

### 1. Use Environment Variables

```javascript
new ApiPlugin({
  port: process.env.API_PORT || 3000,
  auth: {
    jwt: {
      enabled: true,
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  }
})
```

### 2. Configure Resources Appropriately

```javascript
resources: {
  // Public read-only
  products: {
    auth: false,
    methods: ['GET', 'HEAD']
  },

  // Authenticated CRUD
  orders: {
    auth: ['jwt', 'apiKey'],
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },

  // Admin only
  users: {
    auth: ['jwt'],
    customMiddleware: [requireAdmin]
  }
}
```

### 3. Enable Production Features

```javascript
new ApiPlugin({
  cors: { enabled: true, origin: 'https://myapp.com' },
  rateLimit: { enabled: true, maxRequests: 1000 },
  logging: { enabled: true },
  compression: { enabled: true },
  validation: { enabled: true }
})
```

### 4. Handle Errors Gracefully

All errors return consistent format:
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

Common error codes:
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `RATE_LIMIT_EXCEEDED` (429)
- `INTERNAL_ERROR` (500)

---

## 🚀 Advanced Usage

### Custom Authentication

Integrate with external auth services:

```javascript
resources: {
  cars: {
    customMiddleware: [
      async (c, next) => {
        const token = c.req.header('authorization');

        // Validate with external service
        const user = await myAuthService.verify(token);

        if (!user) {
          return c.json({ error: 'Unauthorized' }, 401);
        }

        c.set('user', user);
        await next();
      }
    ]
  }
}
```

### Pagination Helpers

```javascript
// Client-side pagination helper
function getPaginatedUrl(baseUrl, page, pageSize) {
  const offset = (page - 1) * pageSize;
  return `${baseUrl}?limit=${pageSize}&offset=${offset}`;
}

// Fetch page 2 with 50 items per page
const url = getPaginatedUrl('/cars', 2, 50);
const response = await fetch(url);
```

### Filtering with Partitions

```javascript
// Query specific partition
const response = await fetch('/cars?partition=byRegion&partitionValues={"region":"US"}');

// Get from specific partition
const response = await fetch('/cars/car-1?partition=byRegion&partitionValues={"region":"US"}');
```

---

## ❓ FAQ

### For Developers

**Q: Can I use the API Plugin with existing authentication systems (Auth0, Firebase, etc.)?**

A: Yes! Use custom middlewares to integrate with any auth provider:

```javascript
resources: {
  cars: {
    customMiddleware: [
      async (c, next) => {
        const token = c.req.header('authorization')?.replace('Bearer ', '');

        // Validate with Auth0
        const user = await auth0.verifyToken(token);

        if (!user) {
          return c.json({ success: false, error: { message: 'Invalid token' } }, 401);
        }

        c.set('user', user);
        await next();
      }
    ]
  }
}
```

**Q: How do I handle file uploads with the API?**

A: For large files, consider using multipart/form-data and storing files directly in S3, then storing the S3 key in s3db:

```javascript
// Use a separate file upload endpoint
app.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file');

  // Upload to S3
  const key = await s3.upload(file);

  // Store reference in s3db
  await cars.insert({
    brand: formData.get('brand'),
    imageUrl: `https://s3.amazonaws.com/bucket/${key}`
  });
});
```

**Q: Can I customize the OpenAPI/Swagger documentation?**

A: Yes! The plugin auto-generates OpenAPI specs from your resource schemas. Customize via:

```javascript
new ApiPlugin({
  docs: {
    enabled: true,
    title: 'My Custom API',
    version: '2.0.0',
    description: 'Custom API documentation'
  }
})
```

The schema is automatically derived from resource attributes. For advanced customization, access the raw spec at `/openapi.json` and modify it externally.

**Q: How do I implement pagination with cursor-based navigation instead of offset?**

A: Use query filters with comparison operators:

```javascript
// Get first page (limit 50)
GET /cars?limit=50

// Get next page using last ID as cursor
GET /cars?id={"$gt":"last-id-from-previous-page"}&limit=50
```

For custom cursor pagination, add middleware:

```javascript
resources: {
  cars: {
    customMiddleware: [
      async (c, next) => {
        const cursor = c.req.query('cursor');
        if (cursor) {
          // Decode cursor and apply filter
          const decodedCursor = Buffer.from(cursor, 'base64').toString();
          c.set('cursorFilter', { id: { $gt: decodedCursor } });
        }
        await next();
      }
    ]
  }
}
```

**Q: Can I serve the API behind a reverse proxy (nginx, Cloudflare)?**

A: Yes! The API works perfectly behind reverse proxies. Key considerations:

```javascript
// Use X-Forwarded-For for rate limiting
new ApiPlugin({
  rateLimit: {
    enabled: true,
    keyGenerator: (c) => {
      return c.req.header('x-forwarded-for') ||
             c.req.header('x-real-ip') ||
             'unknown';
    }
  }
})
```

**Nginx configuration:**
```nginx
location /api/ {
  proxy_pass http://localhost:3000/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Q: How do I implement GraphQL instead of REST?**

A: The API Plugin is REST-focused. For GraphQL, use the underlying database directly:

```javascript
import { ApolloServer } from '@apollo/server';

const typeDefs = `
  type Car {
    id: ID!
    brand: String!
    model: String!
    year: Int!
  }
  type Query {
    cars: [Car]
    car(id: ID!): Car
  }
`;

const resolvers = {
  Query: {
    cars: async () => await cars.list({ limit: 1000 }),
    car: async (_, { id }) => await cars.get(id)
  }
};

const server = new ApolloServer({ typeDefs, resolvers });
```

---

### For AI Agents

**Q: What problem does the API Plugin solve?**

A: It transforms s3db.js resources into production-ready REST API endpoints with automatic CRUD operations, authentication, validation, and enterprise features (rate limiting, CORS, compression, health checks). Eliminates need to manually write API routes.

**Q: What are all the configuration parameters?**

A: Core parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `port` | `number` | `3000` | HTTP server port |
| `host` | `string` | `'0.0.0.0'` | Host to bind to |
| `verbose` | `boolean` | `false` | Enable verbose logging |
| `maxBodySize` | `number` | `10485760` | Max request body size (10MB) |
| `auth` | `object` | `{}` | Authentication config (JWT, API key, Basic) |
| `resources` | `object` | `{}` | Per-resource configuration |
| `cors` | `object` | `{ enabled: false }` | CORS configuration |
| `rateLimit` | `object` | `{ enabled: false }` | Rate limiting config |
| `logging` | `object` | `{ enabled: true }` | Request logging config |
| `compression` | `object` | `{ enabled: false }` | Response compression config |
| `validation` | `object` | `{ enabled: true }` | Schema validation config |
| `middlewares` | `array` | `[]` | Global middleware functions |
| `docs` | `object` | `{ enabled: false }` | Swagger UI configuration |

**Q: What are the default behaviors?**

A: Defaults:
- Server starts on port 3000, listens on 0.0.0.0
- All resources automatically get REST endpoints (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- **Clean URLs without version prefix** (`/cars`, `/users`) - Optional versioning available with `versionPrefix: true`
- Schema validation enabled by default
- Authentication disabled by default (public access)
- CORS disabled by default
- Rate limiting disabled by default
- Compression disabled by default
- Swagger docs disabled by default
- Request logging enabled by default
- Automatic error handling with consistent JSON responses

**Q: What events does this plugin emit?**

A: Events:

| Event | Payload | When Emitted |
|-------|---------|--------------|
| `apiServerStarted` | `{ port, host, resources }` | Server starts successfully |
| `apiServerStopped` | `{}` | Server stops |
| `apiRequestReceived` | `{ method, path, user, timestamp }` | Each request received |
| `apiRequestCompleted` | `{ method, path, status, duration }` | Each request completed |
| `apiAuthFailed` | `{ method, path, reason }` | Authentication fails |
| `apiValidationFailed` | `{ resource, errors }` | Validation fails |
| `apiRateLimitExceeded` | `{ key, limit, windowMs }` | Rate limit hit |
| `apiError` | `{ error, method, path }` | Unhandled error occurs |

**Q: How do I debug API issues?**

A: Debugging strategies:

```javascript
// 1. Enable verbose logging
new ApiPlugin({
  verbose: true,
  logging: { enabled: true, verbose: true }
})

// 2. Listen to events
db.on('apiRequestReceived', (data) => {
  console.log('Request:', data);
});

db.on('apiError', (data) => {
  console.error('Error:', data);
});

// 3. Add debug middleware
new ApiPlugin({
  middlewares: [
    async (c, next) => {
      console.log('Request:', {
        method: c.req.method,
        path: c.req.path,
        headers: c.req.header(),
        query: c.req.query()
      });
      await next();
    }
  ]
})

// 4. Check health endpoints
curl http://localhost:3000/health/ready

// 5. Inspect OpenAPI spec
curl http://localhost:3000/openapi.json | jq

// 6. Test with verbose curl
curl -v http://localhost:3000/cars
```

**Q: What HTTP methods are supported per endpoint?**

A: Default methods per endpoint:

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/{resource}` | GET, POST, HEAD, OPTIONS | List/create resources, get stats, get metadata |
| `/{resource}/:id` | GET, PUT, PATCH, DELETE, HEAD | Get/update/delete single resource, check existence |
| `/auth/register` | POST | User registration |
| `/auth/login` | POST | User login |
| `/auth/token/refresh` | POST | Refresh JWT token |
| `/auth/me` | GET | Get current user |
| `/auth/api-key/regenerate` | POST | Regenerate API key |
| `/health` | GET | Generic health check |
| `/health/live` | GET | Liveness probe |
| `/health/ready` | GET | Readiness probe |
| `/docs` | GET | Swagger UI |
| `/openapi.json` | GET | OpenAPI 3.0 spec |
| `/` | GET | API info |

**Q: How does URL versioning work?**

A: **By default, the API uses clean URLs without version prefixes** (e.g., `/cars`). Versioning is **optional** and can be enabled via `versionPrefix` option:

**Default behavior (clean URLs):**
```javascript
// Default: No version prefix
await db.usePlugin(new ApiPlugin({ port: 3000 }));

// Endpoints created:
GET /cars
POST /cars
GET /users
```

**Enable versioning:**
```javascript
// Enable version prefix globally
await db.usePlugin(new ApiPlugin({
  port: 3000,
  versionPrefix: true  // Use resource version in URL
}));

// Endpoints now include version:
GET /v0/cars
POST /v0/users
```

**How it works when enabled:**
1. Each resource has a `currentVersion` (e.g., `v0`, `v1`, `v2`)
2. When `versionPrefix: true`, API creates endpoints with version: `/v0/cars`, `/v1/cars`
3. When you update a resource schema with `updateResourceAttributes()`, a new version is created
4. Both old and new versions remain accessible for backward compatibility
5. Each version serves data according to its schema definition

**Example flow with versioning enabled:**
```javascript
// Enable versioning
await db.usePlugin(new ApiPlugin({
  versionPrefix: true,
  resources: { cars: {} }
}));

// Initial: v0 endpoints created
POST /v0/cars

// Update schema → v1 created
// Both versions available:
GET /v0/cars  (old schema)
GET /v1/cars  (new schema)
```

For more details, see the [URL Versioning Configuration](#-url-versioning-configuration) section.

**Q: Can I use this with serverless platforms (AWS Lambda, Vercel, Cloudflare Workers)?**

A: The API Plugin uses Hono, which supports multiple platforms:

**AWS Lambda (with adapter):**
```javascript
import { handle } from 'hono/aws-lambda';

const apiPlugin = new ApiPlugin({ port: 3000 });
const app = apiPlugin.getApp();

export const handler = handle(app);
```

**Vercel:**
```javascript
import { handle } from 'hono/vercel';

const app = apiPlugin.getApp();
export default handle(app);
```

**Cloudflare Workers:**
```javascript
const app = apiPlugin.getApp();

export default {
  fetch: app.fetch
};
```

Note: Health probes and server lifecycle may need adaptation for serverless.

---

## 📚 Examples

See complete examples:
- [e47-api-plugin-basic.js](../examples/e47-api-plugin-basic.js) - Basic usage
- [e49-api-plugin-complete.js](../examples/e49-api-plugin-complete.js) - Complete features demo
- [e58-api-rest-complete.js](../examples/e58-api-rest-complete.js) - Complete REST API
- [e59-api-rest-simple.js](../examples/e59-api-rest-simple.js) - Simple REST API

---

## 🔧 Plugin Methods

### getServerInfo()

Get server status:

```javascript
const info = apiPlugin.getServerInfo();
// {
//   isRunning: true,
//   port: 3000,
//   host: '0.0.0.0',
//   resources: 5
// }
```

### getApp()

Get Hono app instance for advanced usage:

```javascript
const app = apiPlugin.getApp();

// Add custom route
app.get('/custom', (c) => {
  return c.json({ custom: true });
});
```

### stop()

Stop the server:

```javascript
await apiPlugin.stop();
```

### uninstall()

Uninstall plugin and optionally purge data:

```javascript
await apiPlugin.uninstall({ purgeData: true });
```

---

## 🎉 Summary

The API Plugin transforms your s3db.js resources into a production-ready REST API with:

✅ **Automatic endpoint generation**
✅ **Multiple authentication methods**
✅ **Automatic versioning**
✅ **Schema validation**
✅ **Rate limiting**
✅ **CORS support**
✅ **Request logging**
✅ **Response compression**
✅ **Custom middlewares**

Perfect for:
- Building REST APIs quickly
- Exposing s3db.js resources to web/mobile clients
- Microservices architecture
- API-first development
- Rapid prototyping

Happy coding! 🚀

---

## 📊 HTTP Status Codes - Complete Reference

The API Plugin implements **ALL standard HTTP status codes** with consistent, detailed responses. Every response follows the same JSON structure for predictability and ease of integration.

### ✅ Success Codes (2xx)

#### 200 OK - Successful Request
**When**: GET requests, successful operations with data response
**Example**: Getting a resource, listing resources, successful query

```bash
# Request
GET /cars/car-123

# Response
HTTP/1.1 200 OK
Content-Type: application/json
```
```json
{
  "success": true,
  "data": {
    "id": "car-123",
    "brand": "Toyota",
    "model": "Corolla",
    "year": 2024,
    "price": 25000
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

#### 201 Created - Resource Created
**When**: POST requests that create new resources
**Example**: Inserting a new record

```bash
# Request
POST /cars
Content-Type: application/json
{
  "brand": "Honda",
  "model": "Civic",
  "year": 2024,
  "price": 28000
}

# Response
HTTP/1.1 201 Created
Content-Type: application/json
Location: /cars/car-456
```
```json
{
  "success": true,
  "data": {
    "id": "car-456",
    "brand": "Honda",
    "model": "Civic",
    "year": 2024,
    "price": 28000,
    "createdAt": "2024-11-15T12:30:00.000Z"
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z",
    "location": "/cars/car-456"
  }
}
```

#### 204 No Content - Successful Deletion
**When**: DELETE requests, successful operations with no response body
**Example**: Deleting a resource

```bash
# Request
DELETE /cars/car-123

# Response
HTTP/1.1 204 No Content
```
```json
{
  "success": true,
  "data": null,
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

---

### ❌ Client Error Codes (4xx)

#### 400 Bad Request - Validation Failed
**When**: Request data doesn't match schema, validation rules violated
**Example**: Missing required fields, invalid data types

```bash
# Request
POST /cars
Content-Type: application/json
{
  "brand": "X",
  "year": 1800
}

# Response
HTTP/1.1 400 Bad Request
Content-Type: application/json
```
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "errors": [
        {
          "field": "brand",
          "message": "String length must be at least 2 characters",
          "expected": "minlength:2",
          "actual": "X"
        },
        {
          "field": "model",
          "message": "Field is required",
          "expected": "required"
        },
        {
          "field": "year",
          "message": "Number must be at least 1900",
          "expected": "min:1900",
          "actual": 1800
        },
        {
          "field": "price",
          "message": "Field is required",
          "expected": "required"
        }
      ]
    }
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

#### 401 Unauthorized - Authentication Required
**When**: No credentials provided, invalid token, expired JWT
**Example**: Accessing protected endpoint without authentication

```bash
# Request
GET /cars

# Response
HTTP/1.1 401 Unauthorized
Content-Type: application/json
WWW-Authenticate: Bearer realm="API Access"
```
```json
{
  "success": false,
  "error": {
    "message": "Unauthorized - Authentication required",
    "code": "UNAUTHORIZED",
    "details": {
      "suggestion": "Please provide valid authentication credentials (JWT token, API key, or Basic Auth)"
    }
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

#### 403 Forbidden - Insufficient Permissions
**When**: Authenticated but lacking permissions for the operation
**Example**: Non-admin user trying to delete resources

```bash
# Request
DELETE /users/user-123
Authorization: Bearer <valid-token-but-not-admin>

# Response
HTTP/1.1 403 Forbidden
Content-Type: application/json
```
```json
{
  "success": false,
  "error": {
    "message": "Forbidden - Insufficient permissions",
    "code": "FORBIDDEN",
    "details": {
      "requiredRole": "admin",
      "userRole": "user"
    }
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

#### 404 Not Found - Resource Doesn't Exist
**When**: Resource ID not found, route doesn't exist
**Example**: Getting a non-existent resource

```bash
# Request
GET /cars/nonexistent-id

# Response
HTTP/1.1 404 Not Found
Content-Type: application/json
```
```json
{
  "success": false,
  "error": {
    "message": "cars with id 'nonexistent-id' not found",
    "code": "NOT_FOUND",
    "details": {
      "resource": "cars",
      "id": "nonexistent-id"
    }
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

#### 413 Payload Too Large - Request Body Exceeds Limit
**When**: Request body size exceeds configured maximum (default 10MB)
**Example**: Uploading large JSON payload

```bash
# Request
POST /cars
Content-Type: application/json
Content-Length: 15728640
{ ... very large payload ... }

# Response
HTTP/1.1 413 Payload Too Large
Content-Type: application/json
Connection: close
```
```json
{
  "success": false,
  "error": {
    "message": "Request payload too large",
    "code": "PAYLOAD_TOO_LARGE",
    "details": {
      "receivedSize": 15728640,
      "maxSize": 10485760,
      "receivedMB": "15.00",
      "maxMB": "10.00"
    }
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

**Configure max body size:**
```javascript
new ApiPlugin({
  maxBodySize: 50 * 1024 * 1024  // 50MB
})
```

#### 429 Too Many Requests - Rate Limit Exceeded
**When**: Request rate exceeds configured limit
**Example**: Too many requests in short time window

```bash
# Request (101st request in 1 minute)
GET /cars

# Response
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 45
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700054445
```
```json
{
  "success": false,
  "error": {
    "message": "Rate limit exceeded",
    "code": "RATE_LIMIT_EXCEEDED",
    "details": {
      "retryAfter": 45,
      "limit": 100,
      "windowMs": 60000
    }
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

**Configure rate limiting:**
```javascript
new ApiPlugin({
  rateLimit: {
    enabled: true,
    windowMs: 60000,     // 1 minute
    maxRequests: 1000    // 1000 requests per minute
  }
})
```

---

### 💥 Server Error Codes (5xx)

#### 500 Internal Server Error - Unexpected Server Error
**When**: Unhandled exceptions, S3 errors, database failures
**Example**: S3 connection failure, unexpected error

```bash
# Request
GET /cars/car-123

# Response
HTTP/1.1 500 Internal Server Error
Content-Type: application/json
```
```json
{
  "success": false,
  "error": {
    "message": "Internal server error",
    "code": "INTERNAL_ERROR",
    "details": {
      "suggestion": "Please try again later or contact support if the problem persists"
    },
    "stack": "Error: S3 connection timeout\n    at ..." // Only in development
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

#### 503 Service Unavailable - Service Not Ready
**When**: Database not connected, resources not loaded
**Example**: Application starting up, health check failing

```bash
# Request
GET /health/ready

# Response
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```
```json
{
  "success": false,
  "error": {
    "message": "Service not ready",
    "code": "NOT_READY",
    "details": {
      "database": {
        "connected": false,
        "resources": 0
      }
    }
  },
  "meta": {
    "timestamp": "2024-11-15T12:30:00.000Z"
  }
}
```

---

### 📋 Status Code Summary Table

| Code | Name | When | Response Body | Common Use Cases |
|------|------|------|---------------|------------------|
| **200** | OK | Successful GET, HEAD, OPTIONS | ✅ Yes | List resources, get resource, queries |
| **201** | Created | Successful POST | ✅ Yes + Location header | Create resource, insert data |
| **204** | No Content | Successful DELETE | ✅ Empty (null data) | Delete resource, bulk operations |
| **400** | Bad Request | Validation failed | ❌ Error details | Invalid schema, missing fields |
| **401** | Unauthorized | No auth credentials | ❌ Error + WWW-Authenticate | Missing token, expired JWT |
| **403** | Forbidden | Insufficient permissions | ❌ Error details | Role restrictions, access denied |
| **404** | Not Found | Resource/route not found | ❌ Error details | Invalid ID, wrong endpoint |
| **413** | Payload Too Large | Body exceeds limit | ❌ Error + size details | Large uploads, bulk inserts |
| **429** | Too Many Requests | Rate limit exceeded | ❌ Error + Retry-After | DDoS protection, API abuse |
| **500** | Internal Error | Server exception | ❌ Error + stack (dev) | S3 errors, unhandled errors |
| **503** | Service Unavailable | Not ready | ❌ Error + details | Startup, health check fail |

---

### 🎯 Response Structure Convention

**All responses follow this consistent structure:**

```typescript
// Success responses
{
  success: true,
  data: <any>,           // Response data (null for 204)
  meta: {
    timestamp: string,   // ISO 8601
    location?: string,   // For 201 Created
    ...                  // Additional metadata
  },
  pagination?: {         // For list endpoints
    total: number,
    page: number,
    pageSize: number,
    pageCount: number
  }
}

// Error responses
{
  success: false,
  error: {
    message: string,     // Human-readable error message
    code: string,        // Machine-readable error code
    details: object,     // Additional error context
    stack?: string       // Stack trace (development only)
  },
  meta: {
    timestamp: string    // ISO 8601
  }
}
```

---

### 💡 Best Practices

**1. Always check `success` field:**
```javascript
const response = await fetch('/v0/cars/car-123');
const json = await response.json();

if (json.success) {
  // Handle success
  console.log(json.data);
} else {
  // Handle error
  console.error(json.error.message);
  console.error(json.error.code);
}
```

**2. Use HTTP status codes for flow control:**
```javascript
const response = await fetch('/v0/cars', { method: 'POST', ... });

switch (response.status) {
  case 201:
    console.log('Created successfully');
    break;
  case 400:
    console.error('Validation failed');
    break;
  case 401:
    console.error('Please login');
    break;
  case 413:
    console.error('Payload too large');
    break;
  case 429:
    const retryAfter = response.headers.get('Retry-After');
    console.log(`Rate limited, retry after ${retryAfter}s`);
    break;
  case 500:
    console.error('Server error, please try again');
    break;
}
```

**3. Handle rate limiting gracefully:**
```javascript
async function apiCallWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After')) || 60;
      console.log(`Rate limited, waiting ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    return response;
  }
}
```

**4. Check payload size before sending:**
```javascript
const data = { /* large object */ };
const json = JSON.stringify(data);
const sizeBytes = new Blob([json]).size;
const sizeMB = sizeBytes / 1024 / 1024;

if (sizeMB > 10) {
  console.warn(`Payload is ${sizeMB.toFixed(2)}MB, may exceed server limit`);
  // Consider splitting into multiple requests
}
```

---

