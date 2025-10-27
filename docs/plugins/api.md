# 🌐 API Plugin

> **Quick Jump:** [🚀 Quick Start](#-quick-start) | [📖 Guides](#-detailed-documentation) | [⚙️ Config](#-configuration-reference) | [🔧 API](#-api-endpoints) | [❓ FAQ](#-faq) | [📚 Examples](#-examples)

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
- [Common Scenarios](#-common-scenarios)
- [📖 Detailed Documentation](#-detailed-documentation)
  - [Authentication](./api/authentication.md) - JWT, Basic Auth, OIDC, OAuth2, Path-based auth
  - [Guards (Authorization)](./api/guards.md) - Row-level security, multi-tenancy, RBAC
  - [Static File Serving](./api/static-files.md) - Serve React/Vue/Angular apps, S3 files
  - [Configuration](./api/configuration.md) - Complete configuration options
  - [Deployment](./api/deployment.md) - Docker, Kubernetes, Prometheus, Production
- [API Endpoints](#-api-endpoints)
- [Custom Middlewares](#-custom-middlewares)
- [Custom Routes](#️-custom-routes)
- [Rate Limiting](#-rate-limiting)
- [Request Logging](#-request-logging)
- [Response Compression](#-response-compression)
- [CORS Configuration](#-cors-configuration)
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

---

## 🎯 Common Scenarios

**Quick-win patterns for typical use cases** - copy-paste and customize!

### 1. Simple CRUD API (Blog, E-commerce, CMS)

```javascript
import Database from 's3db.js';
import { ApiPlugin } from 's3db.js/plugins/api';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// Define resources
const posts = await db.createResource({
  name: 'posts',
  attributes: {
    title: 'string|required',
    content: 'string|required',
    author: 'string|required',
    published: 'boolean|default:false'
  }
});

const comments = await db.createResource({
  name: 'comments',
  attributes: {
    postId: 'string|required',
    author: 'string|required',
    text: 'string|required'
  }
});

// ✅ That's it! API ready at http://localhost:3000
await db.use(new ApiPlugin({ port: 3000 }));
// GET /posts, POST /posts, GET /posts/:id, etc.
```

### 2. Multi-Tenant SaaS (Isolated Data per Tenant)

```javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    tenantId: 'string|required',
    userId: 'string|required',
    total: 'number|required'
  },
  partitions: {
    byTenant: { fields: { tenantId: 'string' } }
  },
  guard: {
    '*': (ctx) => {
      ctx.tenantId = ctx.user.tenantId;  // Extract from JWT
      return !!ctx.tenantId;
    },
    list: (ctx) => {
      ctx.setPartition('byTenant', { tenantId: ctx.tenantId });  // O(1) isolation!
      return true;
    },
    create: (ctx) => {
      ctx.data.tenantId = ctx.tenantId;  // Auto-inject
      ctx.data.userId = ctx.user.sub;
      return true;
    }
  }
});

await db.use(new ApiPlugin({
  port: 3000,
  auth: {
    driver: 'jwt',
    secret: 'your-secret-key'
  }
}));

// ✅ Row-level security + O(1) tenant isolation!
// Each tenant only sees their own orders
```

### 3. Protected API with JWT Authentication

```javascript
// Create users resource
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',  // Automatically encrypted
    role: 'string|default:user'
  }
});

// Create protected resources
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    items: 'array|required',
    total: 'number|required'
  }
});

await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    driver: 'jwt',
    resource: 'users',
    config: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: '7d'
    }
  },
  resources: {
    orders: { auth: true }  // Protected
  }
}));

// ✅ Auto-generated auth endpoints:
// POST /auth/register
// POST /auth/login
// GET /auth/me
// Protected: GET /orders (requires JWT token)
```

---

## 📖 Detailed Documentation

### Core Topics

- **[Authentication](./api/authentication.md)** - Complete authentication guide
  - JWT Authentication
  - Basic Authentication
  - OAuth2 + OpenID Connect
  - OIDC with User Hooks
  - Path-Based Authentication
  - Security & Validation

- **[Guards (Authorization)](./api/guards.md)** - Declarative authorization
  - Row-Level Security (RLS)
  - Multi-Tenancy
  - Ownership Checks
  - Role-Based Access Control (RBAC)
  - Framework Integration (Hono, Express, Fastify)

- **[Static File Serving](./api/static-files.md)** - Serve files and SPAs
  - Filesystem Driver
  - S3 Driver
  - SPA Support (React, Vue, Angular)
  - Multiple Mount Points
  - Authentication Integration

- **[Configuration](./api/configuration.md)** - Complete configuration options
  - Server Configuration
  - Schema Validation
  - URL Versioning
  - Best Practices

- **[Deployment](./api/deployment.md)** - Production deployment
  - Docker Setup
  - Kubernetes Manifests
  - AWS IAM Policies
  - Prometheus Monitoring
  - Scaling Limits & Constraints
  - Production Best Practices

---

## 🛣️ API Endpoints

### Resource Endpoints

For each resource, the following endpoints are automatically created:

**GET /resource** - List/Query
```bash
# List all records
GET /cars

# Query with filters
GET /cars?brand=Toyota&year=2024

# Pagination
GET /cars?limit=50&offset=100

# Sorting
GET /cars?sortBy=price&sortOrder=desc
```

**GET /resource/:id** - Get by ID
```bash
GET /cars/abc123
```

**POST /resource** - Create
```bash
POST /cars
Content-Type: application/json

{
  "brand": "Toyota",
  "model": "Camry",
  "year": 2024,
  "price": 28000
}
```

**PUT /resource/:id** - Update (full)
```bash
PUT /cars/abc123
Content-Type: application/json

{
  "brand": "Toyota",
  "model": "Camry",
  "year": 2024,
  "price": 29000
}
```

**PATCH /resource/:id** - Update (partial)
```bash
PATCH /cars/abc123
Content-Type: application/json

{
  "price": 29000
}
```

**DELETE /resource/:id** - Delete
```bash
DELETE /cars/abc123
```

**HEAD /resource** - Count/Statistics
```bash
HEAD /cars

# Response headers:
# X-Total-Count: 1234
# X-Resource-Name: cars
```

**OPTIONS /resource** - Metadata
```bash
OPTIONS /cars

# Returns resource schema, methods, endpoints
```

### Health Check Endpoints (Kubernetes)

```bash
# Liveness probe - checks if app is alive
# If this fails, Kubernetes will restart the pod
GET /health/live

# Readiness probe - checks if app is ready to receive traffic
# If this fails, Kubernetes will remove pod from service endpoints
GET /health/ready

# Generic health check with links to other probes
GET /health
```

### Other Utility Endpoints

```bash
# API information and available resources
GET /

# Interactive Swagger UI documentation
GET /docs

# OpenAPI 3.0 specification (JSON)
GET /openapi.json
```

---

## 🎛️ Custom Middlewares

### Global Middlewares

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  middlewares: [
    async (c, next) => {
      console.log(`${c.req.method} ${c.req.path}`);
      await next();
    }
  ]
}));
```

### Resource-Specific Middlewares

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  resources: {
    cars: {
      customMiddleware: [
        async (c, next) => {
          // Resource-specific logic
          await next();
        }
      ]
    }
  }
}));
```

---

## 🛤️ Custom Routes

### Plugin-Level Custom Routes

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  customRoutes: [
    {
      method: 'GET',
      path: '/custom',
      handler: async (c) => {
        return c.json({ message: 'Custom endpoint' });
      }
    }
  ]
}));
```

### Resource-Level Custom Routes

```javascript
await db.createResource({
  name: 'cars',
  attributes: { /* ... */ },
  customRoutes: [
    {
      method: 'GET',
      path: '/:id/history',
      handler: async (c) => {
        const id = c.req.param('id');
        // Custom logic
        return c.json({ id, history: [] });
      }
    }
  ]
});
```

---

## 📊 Rate Limiting

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  rateLimit: {
    enabled: true,
    windowMs: 60000,        // 1 minute
    maxRequests: 100,       // 100 requests per window
    keyGenerator: (c) => {
      return c.req.header('x-forwarded-for') || 'unknown';
    }
  }
}));
```

---

## 📝 Request Logging

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  logging: {
    enabled: true,
    format: ':method :path :status :response-time ms - :user',
    verbose: false
  }
}));
```

---

## 🗜️ Response Compression

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  compression: {
    enabled: true,
    threshold: 1024,  // Only compress if >1KB
    level: 6          // gzip compression level (1-9)
  }
}));
```

---

## 🌍 CORS Configuration

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  cors: {
    enabled: true,
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Total-Count'],
    credentials: true,
    maxAge: 86400  // 24 hours
  }
}));
```

---

## 🎯 Best Practices

### 1. Use Environment Variables

```javascript
new ApiPlugin({
  port: process.env.API_PORT || 3000,
  auth: {
    driver: 'jwt',
    config: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  }
})
```

### 2. Configure Resources Appropriately

```javascript
resources: {
  // Public resources
  products: {
    auth: false,
    methods: ['GET']
  },

  // Protected resources
  orders: {
    auth: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
}
```

### 3. Enable Production Features

```javascript
new ApiPlugin({
  cors: { enabled: true },
  rateLimit: { enabled: true, maxRequests: 100 },
  compression: { enabled: true },
  logging: { enabled: true }
})
```

---

## 🚀 Advanced Usage

### Custom Authentication

```javascript
resources: {
  cars: {
    customMiddleware: [
      async (c, next) => {
        const token = c.req.header('authorization')?.replace('Bearer ', '');
        const user = await verifyCustomToken(token);

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
// Cursor-based pagination
GET /cars?cursor=abc123&limit=50

// Offset-based pagination
GET /cars?offset=100&limit=50
```

### Filtering with Partitions

```javascript
const cars = await db.createResource({
  name: 'cars',
  attributes: { /* ... */ },
  partitions: {
    byBrand: { fields: { brand: 'string' } }
  }
});

// Query uses partition automatically
GET /cars?brand=Toyota  // O(1) partition lookup!
```

---

## ❓ FAQ

### For Developers

**Q: Can I use the API Plugin with existing authentication systems (Auth0, Firebase, etc.)?**

A: Yes! Use custom middlewares to integrate with any auth provider. See [Authentication](./api/authentication.md) for examples.

**Q: How do I handle file uploads?**

A: For large files, use multipart/form-data and store files directly in S3, then store the S3 key in s3db. See [Static Files](./api/static-files.md) for details.

**Q: Can I customize the OpenAPI/Swagger documentation?**

A: Yes! The plugin auto-generates OpenAPI specs from your resource schemas. Access the raw spec at `/openapi.json` and modify it externally.

**Q: Can I serve the API behind a reverse proxy (nginx, Cloudflare)?**

A: Yes! The API works perfectly behind reverse proxies. See [Deployment](./api/deployment.md) for configuration examples.

**Q: How do I implement pagination with cursor-based navigation?**

A: Use query filters with comparison operators. See the Advanced Usage section above for examples.

### For AI Agents

**Q: What problem does the API Plugin solve?**

A: It transforms s3db.js resources into production-ready REST API endpoints with automatic CRUD operations, authentication, validation, and enterprise features (rate limiting, CORS, compression, health checks). Eliminates need to manually write API routes.

**Q: What are all the configuration parameters?**

A: See [Configuration](./api/configuration.md) for complete parameter documentation.

---

## 📚 Examples

See complete examples:
- [e47-api-plugin-basic.js](../examples/e47-api-plugin-basic.js) - Basic usage
- [e49-api-plugin-complete.js](../examples/e49-api-plugin-complete.js) - Complete features demo
- [e58-api-rest-complete.js](../examples/e58-api-rest-complete.js) - Complete REST API
- [e59-api-rest-simple.js](../examples/e59-api-rest-simple.js) - Simple REST API
- [e84-static-files.js](../examples/e84-static-files.js) - Static file serving
- [e85-protected-spa.js](../examples/e85-protected-spa.js) - Protected SPA
- [e86-oidc-user-hooks.js](../examples/e86-oidc-user-hooks.js) - OIDC user hooks
- [e87-oidc-api-token-cookie.js](../examples/e87-oidc-api-token-cookie.js) - OIDC + API token cookie

---

## 🔧 Plugin Methods

### getServerInfo()

```javascript
const info = await apiPlugin.getServerInfo();
// Returns: { port, host, baseUrl, resources }
```

### getApp()

```javascript
const app = apiPlugin.getApp();
// Returns: Hono app instance for custom route registration
```

### stop()

```javascript
await apiPlugin.stop();
// Gracefully stops the HTTP server
```

### uninstall()

```javascript
await apiPlugin.uninstall();
// Removes plugin from database and stops server
```

---

## 🎯 Summary

The API Plugin provides:

1. **Zero-config REST APIs** - Instant endpoints from resource definitions
2. **Multiple auth drivers** - JWT, Basic, OIDC, OAuth2, API Keys
3. **Production features** - Rate limiting, CORS, compression, health checks
4. **Interactive docs** - Auto-generated Swagger UI at `/docs`
5. **Type safety** - Automatic schema validation from resource definitions
6. **Kubernetes-ready** - Health probes, graceful shutdown, horizontal scaling
7. **Framework flexibility** - Works with Hono, Express, Fastify

**Next Steps:**
1. Secure your API: [Authentication →](./api/authentication.md)
2. Implement row-level security: [Guards →](./api/guards.md)
3. Deploy to production: [Deployment →](./api/deployment.md)
4. Try example code: [Example 47](../examples/e47-api-plugin-basic.js) | [Example 49](../examples/e49-api-plugin-complete.js)

---

## 🔗 See Also

**Related Documentation:**
- [Authentication](./api/authentication.md) - JWT, Basic Auth, OIDC, OAuth2
- [Guards](./api/guards.md) - Row-level security and authorization
- [Static Files](./api/static-files.md) - Serve React/Vue/Angular apps
- [Configuration](./api/configuration.md) - Complete config reference
- [Deployment](./api/deployment.md) - Docker, Kubernetes, production
- [Identity Plugin](./identity.md) - OAuth2/OIDC Authorization Server

**Examples:**
- [e47-api-plugin-basic.js](../examples/e47-api-plugin-basic.js) - Basic usage
- [e49-api-plugin-complete.js](../examples/e49-api-plugin-complete.js) - Complete features
- [e58-api-rest-complete.js](../examples/e58-api-rest-complete.js) - Full REST API
- [e84-static-files.js](../examples/e84-static-files.js) - Static file serving
- [e85-protected-spa.js](../examples/e85-protected-spa.js) - Protected SPA

---

## 📊 HTTP Status Codes - Complete Reference

### ✅ Success Codes (2xx)

- **200 OK** - GET, PUT, PATCH, DELETE successful
- **201 Created** - POST successful (resource created)
- **204 No Content** - DELETE successful (no response body)

### ❌ Client Error Codes (4xx)

- **400 Bad Request** - Invalid request body or parameters
- **401 Unauthorized** - Missing or invalid authentication
- **403 Forbidden** - Authenticated but not authorized
- **404 Not Found** - Resource or record not found
- **409 Conflict** - Resource already exists (duplicate ID)
- **429 Too Many Requests** - Rate limit exceeded

### 💥 Server Error Codes (5xx)

- **500 Internal Server Error** - Unexpected server error
- **503 Service Unavailable** - Server overloaded or S3 throttling

---

> **📖 For detailed documentation, see:**
> - [Authentication](./api/authentication.md)
> - [Guards (Authorization)](./api/guards.md)
> - [Static File Serving](./api/static-files.md)
> - [Configuration](./api/configuration.md)
> - [Deployment](./api/deployment.md)
