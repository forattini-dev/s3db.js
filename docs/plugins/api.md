# 🌐 API Plugin

> **Production-ready REST API with zero boilerplate** - Transform s3db.js resources into enterprise-grade APIs with authentication, observability, security, and auto-scaling.

> **Quick Jump:** [🚀 Quick Start](#-quick-start) | [🔥 New Features](#-whats-new-in-v2) | [📖 Guides](#-detailed-documentation) | [⚙️ Config](#-configuration-reference) | [🎯 Real-World Examples](#-real-world-examples) | [❓ FAQ](#-faq)

## ⚡ TLDR

**Transform s3db.js resources into production-ready REST APIs** in one line:

```javascript
await db.use(new ApiPlugin({ port: 3000 }));  // That's it! 🎉
```

**What you get:**
- ✅ **Auto-generated REST endpoints** - CRUD for all resources
- ✅ **Enterprise security** - Rate limiting, failban, CORS, CSP headers
- ✅ **Observability** - Metrics, events, distributed tracing, health checks
- ✅ **Multiple auth methods** - JWT, Basic, OIDC/Azure AD, API Keys
- ✅ **Zero-downtime deploys** - Graceful shutdown, health probes
- ✅ **Interactive docs** - Auto-generated Swagger UI at `/docs`

**Generated endpoints:**
```
GET     /users           → List/query users
GET     /users/:id       → Get user by ID
POST    /users           → Create user
PUT     /users/:id       → Update user (full)
PATCH   /users/:id       → Update user (partial)
DELETE  /users/:id       → Delete user

GET     /health          → Health check (Kubernetes-ready)
GET     /metrics         → Prometheus-compatible metrics
GET     /docs            → Interactive Swagger UI
```

---

## 🔥 What's New in v2.0

### Security & Protection 🛡️

- **🚨 Failban Plugin** - fail2ban-style automatic IP banning
  - Ban after N violations (rate limit, auth failures)
  - TTL-based auto-unban using S3DB partitions
  - Whitelist/Blacklist support
  - Admin endpoints for ban management

- **⏱️ Advanced Rate Limiting** - Per-driver rate limiting with sliding windows
  - Different limits per auth method (OIDC: 5/15min, JWT: 20/5min, API Key: 100/1min)
  - Skip successful requests option
  - Retry-After headers
  - Auto-cleanup

- **🔒 Security Headers** - Production-grade security
  - Content-Security-Policy (CSP)
  - HTTP Strict-Transport-Security (HSTS)
  - X-Frame-Options, X-Content-Type-Options
  - Permissions-Policy

### Observability & Monitoring 📊

- **📈 Metrics Collector** - Real-time API metrics
  - Request counts, durations (p50/p95/p99), RPS
  - Auth success/failure rates
  - Resource operations tracking
  - Top paths, error rates
  - `/metrics` endpoint (Prometheus-compatible)

- **🎯 Event Hooks System** - React to API events
  - `user:created`, `user:login`
  - `auth:success`, `auth:failure`
  - `resource:created`, `resource:updated`, `resource:deleted`
  - `request:start`, `request:end`, `request:error`
  - Wildcard support (`resource:*`)

- **🔍 Request ID Tracking** - Distributed tracing
  - X-Request-ID header correlation
  - Auto-generation or pass-through
  - Included in all logs and events

- **🏥 Extensible Health Checks** - Custom readiness checks
  - Built-in: S3DB connection check
  - Custom: Add database, cache, external API checks
  - Timeout handling, optional checks
  - Kubernetes liveness/readiness probes

### Performance & Reliability 🚀

- **♻️ Graceful Shutdown** - Zero-downtime deploys
  - SIGTERM/SIGINT handling
  - In-flight request tracking
  - Configurable timeout
  - Reject new requests during shutdown

- **🍪 Session Tracking** - Analytics-grade session management
  - Encrypted cookies (AES-256-GCM)
  - Optional S3DB persistence
  - IP, User-Agent, Referer tracking
  - Auto-update on each request

- **🎭 Content Negotiation** - Smart response handling
  - HTML requests → Redirect to login
  - JSON requests → 401 with details
  - Based on Accept header

### Developer Experience 🛠️

- **🛡️ Guard Helpers** - Declarative authorization
  - `requireScopes(['admin'])` - Check user scopes
  - `requireRole('admin')` - Check user role
  - `requireOwnership()` - Check record ownership
  - `requireTenant()` - Multi-tenancy check
  - `anyOf(...guards)` - OR logic
  - `allOf(...guards)` - AND logic

---

## 📑 Table of Contents

- [Quick Start](#-quick-start)
- [Real-World Examples](#-real-world-examples)
- [📖 Detailed Documentation](#-detailed-documentation)
- [Security Features](#-security-features)
- [Observability Features](#-observability-features)
- [Configuration Reference](#-configuration-reference)
- [API Endpoints](#-api-endpoints)
- [Best Practices](#-best-practices)
- [FAQ](#-faq)

---

## 🚀 Quick Start

### Installation

```bash
# Install required dependencies
pnpm add hono @hono/node-server @hono/swagger-ui jose
```

### Basic Usage

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// Create resource
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    role: 'string|default:user'
  }
});

// Add API Plugin - that's it!
await db.use(new ApiPlugin({
  port: 3000,
  verbose: true
}));

// Server running at http://localhost:3000
// GET http://localhost:3000/users
// View docs at http://localhost:3000/docs
```

---

## 🎯 Real-World Examples

### 1. 📊 Analytics & Tracking Platform

**Scenario:** You need to track events, sessions, and user behavior with real-time analytics.

```javascript
import { ApiPlugin, TTLPlugin } from 's3db.js';

// Event tracking with TTL (auto-cleanup old events)
const events = await db.createResource({
  name: 'events',
  attributes: {
    sessionId: 'string|required',
    type: 'string|required',
    path: 'string',
    referrer: 'string',
    timestamp: 'string|required',
    expiresAt: 'string|required'  // TTL field
  },
  partitions: {
    bySession: { fields: { sessionId: 'string' } },
    byExpiry: { fields: { expiresAtCohort: 'string' } }  // TTL partition
  }
});

// Sessions with encrypted cookies
const sessions = await db.createResource({
  name: 'sessions',
  attributes: {
    fingerprint: 'string',
    ip: 'string',
    userAgent: 'string',
    country: 'string',
    firstSeen: 'string',
    lastSeen: 'string'
  }
});

// Setup API with session tracking + events
await db.use(new TTLPlugin({
  resources: {
    events: { enabled: true, field: 'expiresAt' }
  }
}));

await db.use(new ApiPlugin({
  port: 3000,

  // Session tracking (encrypted cookies)
  sessionTracking: {
    enabled: true,
    resource: 'sessions',
    cookieName: 'session_id',
    passphrase: process.env.SESSION_SECRET,
    updateOnRequest: true,
    enrichSession: async ({ session, context }) => ({
      // Enrich with custom data
      country: context.req.header('cf-ipcountry'),  // Cloudflare
      fingerprint: context.req.header('x-visitor-id')  // FingerprintJS
    })
  },

  // Event hooks for analytics
  events: { enabled: true },

  // Metrics for dashboards
  metrics: {
    enabled: true,
    maxPathsTracked: 200
  }
}));

// Listen to events for real-time processing
apiPlugin.events.on('request:end', async (data) => {
  // Record event
  await events.insert({
    sessionId: data.sessionId,
    type: 'pageview',
    path: data.path,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30*24*60*60*1000).toISOString()  // 30 days
  });
});

// Endpoints:
// POST /track     → Custom tracking endpoint
// GET  /metrics   → Real-time metrics (RPS, p95 latency, etc.)
// GET  /sessions  → View sessions
// GET  /events    → Query events
```

**Key Features:**
- ✅ Encrypted session cookies with visitor tracking
- ✅ Event tracking with auto-cleanup (TTL)
- ✅ Real-time metrics (`/metrics` endpoint)
- ✅ Event hooks for custom processing

---

### 2. 🔗 URL Shortener Service

**Scenario:** Build a production URL shortener with analytics, QR codes, and expiration.

```javascript
// URLs resource with TTL support
const urls = await db.createResource({
  name: 'urls',
  attributes: {
    shortId: 'string|required',  // e.g., "abc123"
    target: 'string|required',    // Original URL
    userId: 'string|required',
    title: 'string',
    expiresAt: 'string',
    metadata: {
      qrCode: 'string',           // Base64 QR code
      ogImage: 'string',          // Open Graph image
      ogTitle: 'string',
      ogDescription: 'string'
    }
  },
  partitions: {
    byUser: { fields: { userId: 'string' } }
  },
  guard: {
    list: (ctx) => {
      // Users only see their own URLs
      ctx.setPartition('byUser', { userId: ctx.user.sub });
      return true;
    },
    create: (ctx) => {
      // Auto-inject userId
      ctx.body.userId = ctx.user.sub;
      return true;
    }
  }
});

// Click tracking
const clicks = await db.createResource({
  name: 'clicks',
  attributes: {
    shortId: 'string|required',
    timestamp: 'string|required',
    ip: 'string',
    userAgent: 'string',
    referrer: 'string',
    country: 'string'
  },
  partitions: {
    byShortId: { fields: { shortId: 'string' } }
  }
});

await db.use(new ApiPlugin({
  port: 3000,

  // OIDC for admin dashboard
  auth: {
    resource: 'users',
    drivers: {
      oidc: {
        issuer: process.env.OIDC_ISSUER,
        clientId: process.env.OIDC_CLIENT_ID,
        clientSecret: process.env.OIDC_CLIENT_SECRET,
        redirectUri: 'http://localhost:3000/auth/callback'
      },
      basic: {
        usernameField: 'email',
        passwordField: 'apiToken'
      }
    },
    pathRules: [
      { path: '/admin/**', methods: ['oidc'], required: true },
      { path: '/api/**', methods: ['basic'], required: true },
      { path: '/r/**', required: false }  // Public redirects
    ]
  },

  // Session tracking for analytics
  sessionTracking: {
    enabled: true,
    resource: 'sessions',
    passphrase: process.env.SESSION_SECRET
  },

  // Rate limiting to prevent abuse
  failban: {
    enabled: true,
    maxViolations: 10,
    violationWindow: 3600000,  // 1 hour
    banDuration: 86400000      // 24 hours
  },

  // Metrics for monitoring
  metrics: { enabled: true },
  events: { enabled: true },

  // Custom routes for redirects and QR codes
  routes: {
    '/r/:id': {
      GET: async (c) => {
        const id = c.req.param('id');
        const url = await urls.get(id);

        if (!url) {
          return c.notFound();
        }

        // Track click asynchronously
        const sessionId = c.get('sessionId');
        clicks.insert({
          shortId: id,
          timestamp: new Date().toISOString(),
          ip: c.req.header('x-forwarded-for'),
          userAgent: c.req.header('user-agent'),
          referrer: c.req.header('referer')
        }).catch(console.error);

        // Redirect
        return c.redirect(url.target, 302);
      }
    },

    '/qr/:id': {
      GET: async (c) => {
        const id = c.req.param('id');
        const url = await urls.get(id);

        if (!url || !url.metadata?.qrCode) {
          return c.notFound();
        }

        // Return QR code image
        const qrBuffer = Buffer.from(url.metadata.qrCode, 'base64');
        return c.body(qrBuffer, 200, { 'Content-Type': 'image/png' });
      }
    }
  }
}));

// Event listeners for notifications
apiPlugin.events.on('resource:created', async (data) => {
  if (data.resource === 'urls') {
    // Send notification that URL was created
    console.log(`New URL created: ${data.id}`);
  }
});

// Endpoints:
// GET  /r/:id          → Redirect (public)
// GET  /qr/:id         → QR code image (public)
// GET  /api/urls       → List URLs (API token)
// POST /api/urls       → Create URL (API token)
// GET  /admin          → Admin dashboard (OIDC)
// GET  /metrics        → Metrics (protected)
```

**Key Features:**
- ✅ Public redirects with analytics
- ✅ QR code generation
- ✅ Dual auth (OIDC for dashboard, Basic for API)
- ✅ Automatic banning of abusive IPs
- ✅ Session tracking for visitor analytics

---

### 3. 🏢 Multi-Tenant SaaS Platform

**Scenario:** Build a SaaS where each tenant's data is completely isolated.

```javascript
import { requireTenant, requireScopes, anyOf } from 's3db.js/plugins/api/concerns/guards-helpers';

// Projects (tenant-isolated)
const projects = await db.createResource({
  name: 'projects',
  attributes: {
    tenantId: 'string|required',
    name: 'string|required',
    ownerId: 'string|required',
    status: 'string|default:active'
  },
  partitions: {
    byTenant: { fields: { tenantId: 'string' } }
  },
  guard: {
    '*': (ctx) => {
      // Extract tenant from JWT
      ctx.tenantId = ctx.user.tenantId || ctx.user.tid;
      return !!ctx.tenantId;
    },
    list: (ctx) => {
      // O(1) tenant isolation via partition
      ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
      return true;
    },
    create: (ctx) => {
      // Auto-inject tenantId and ownerId
      ctx.body.tenantId = ctx.tenantId;
      ctx.body.ownerId = ctx.user.sub;
      return true;
    },
    update: anyOf(
      requireScopes(['admin']),         // Admins can edit anything
      (ctx, record) => record.ownerId === ctx.user.sub  // Owners can edit their own
    ),
    delete: requireScopes(['admin'])  // Only admins can delete
  }
});

// Users (multi-tenant with role-based access)
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    tenantId: 'string|required',
    role: 'string|default:member',    // member, admin
    scopes: 'array|default:["read"]'  // read, write, admin
  },
  partitions: {
    byTenant: { fields: { tenantId: 'string' } }
  }
});

await db.use(new ApiPlugin({
  port: 3000,

  // JWT authentication with tenant claims
  auth: {
    resource: 'users',
    drivers: {
      jwt: {
        secret: process.env.JWT_SECRET,
        audience: 'api.myapp.com'
      }
    },
    pathRules: [
      { path: '/api/**', methods: ['jwt'], required: true }
    ]
  },

  // Security
  security: {
    enabled: true,
    headers: {
      csp: "default-src 'self'",
      hsts: { maxAge: 31536000, includeSubDomains: true }
    }
  },

  // Rate limiting per tenant
  failban: {
    enabled: true,
    maxViolations: 5,
    violationWindow: 900000,   // 15 min
    banDuration: 3600000       // 1 hour
  },

  // Observability
  requestId: { enabled: true },
  metrics: { enabled: true },
  events: { enabled: true }
}));

// Monitor tenant activity
apiPlugin.events.on('resource:created', (data) => {
  const tenantId = data.user?.tenantId;
  console.log(`Tenant ${tenantId} created ${data.resource}`);
});

// Endpoints:
// GET  /api/projects     → List tenant's projects (O(1) via partition)
// POST /api/projects     → Create project (auto-inject tenantId)
// GET  /api/users        → List tenant's users
// GET  /metrics          → Tenant-specific metrics
```

**Key Features:**
- ✅ O(1) tenant isolation via partitions
- ✅ Declarative guards with helper functions
- ✅ Auto-injection of tenantId/userId
- ✅ Role-based access control (RBAC)
- ✅ Comprehensive audit trail via events

---

### 4. 🛒 E-commerce API with Inventory Management

**Scenario:** Build an e-commerce backend with real-time inventory tracking.

```javascript
import { requireOwnership, requireScopes, anyOf } from 's3db.js/plugins/api/concerns/guards-helpers';

// Products (public read, admin write)
const products = await db.createResource({
  name: 'products',
  attributes: {
    sku: 'string|required',
    name: 'string|required',
    price: 'number|required|min:0',
    stock: 'number|required|min:0',
    category: 'string|required'
  },
  partitions: {
    byCategory: { fields: { category: 'string' } }
  }
});

// Orders (user-specific with guards)
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    items: 'array|required',
    total: 'number|required',
    status: 'string|default:pending',
    shippingAddress: {
      street: 'string|required',
      city: 'string|required',
      zip: 'string|required'
    }
  },
  partitions: {
    byUser: { fields: { userId: 'string' } },
    byStatus: { fields: { status: 'string' } }
  },
  guard: {
    list: (ctx) => {
      // Users see only their orders, admins see all
      if (ctx.user.scopes?.includes('admin')) {
        return true;
      }
      ctx.setPartition('byUser', { userId: ctx.user.sub });
      return true;
    },
    get: anyOf(
      requireScopes(['admin']),
      requireOwnership('userId')
    ),
    create: (ctx) => {
      // Auto-inject userId
      ctx.body.userId = ctx.user.sub;
      return true;
    },
    update: requireScopes(['admin']),  // Only admins can change orders
    delete: requireScopes(['admin'])
  }
});

await db.use(new ApiPlugin({
  port: 3000,

  // JWT + API Key authentication
  auth: {
    resource: 'users',
    drivers: {
      jwt: {
        secret: process.env.JWT_SECRET
      },
      apikey: {
        headerName: 'X-API-Key',
        field: 'apiKey'
      }
    },
    pathRules: [
      { path: '/products', methods: [], required: false },      // Public
      { path: '/api/products', methods: ['jwt'], required: true },  // Admin
      { path: '/api/orders', methods: ['jwt', 'apikey'], required: true }
    ]
  },

  // Rate limiting
  failban: {
    enabled: true,
    maxViolations: 20,
    violationWindow: 3600000,
    banDuration: 86400000,
    whitelist: ['10.0.0.0/8']  // Internal IPs
  },

  // Observability
  requestId: { enabled: true },
  metrics: { enabled: true },
  events: { enabled: true },

  // Custom routes for checkout flow
  routes: {
    '/api/checkout': {
      POST: async (c) => {
        const { items } = await c.req.json();

        // Validate stock availability
        for (const item of items) {
          const product = await products.get(item.sku);
          if (!product || product.stock < item.quantity) {
            return c.json({ error: 'Insufficient stock' }, 400);
          }
        }

        // Calculate total
        const total = items.reduce((sum, item) => {
          const product = products.get(item.sku);
          return sum + (product.price * item.quantity);
        }, 0);

        // Create order
        const order = await orders.insert({
          userId: c.get('user').sub,
          items,
          total,
          status: 'pending'
        });

        // Update inventory (in event listener)
        apiPlugin.events.emit('order:created', { order, items });

        return c.json({ success: true, orderId: order.id });
      }
    }
  }
}));

// Event listeners for inventory management
apiPlugin.events.on('order:created', async ({ order, items }) => {
  // Decrease stock
  for (const item of items) {
    const product = await products.get(item.sku);
    await products.update(item.sku, {
      stock: product.stock - item.quantity
    });
  }

  // Send confirmation email (via external service)
  // await emailService.send({ to: order.userId, template: 'order-confirmation' });
});

// Endpoints:
// GET  /products           → List products (public)
// GET  /api/products       → Manage products (admin)
// POST /api/checkout       → Create order with stock validation
// GET  /api/orders         → List user's orders
// GET  /metrics            → API metrics
```

**Key Features:**
- ✅ Public product catalog with O(1) category filtering
- ✅ User-specific order management
- ✅ Real-time inventory tracking via events
- ✅ Automatic IP banning for abuse prevention
- ✅ Dual auth (JWT for users, API keys for integrations)

---

## 📖 Detailed Documentation

### Core Topics

- **[Authentication](./api/authentication.md)** - Complete authentication guide
  - JWT, Basic Auth, API Keys
  - OAuth2 + OpenID Connect (Azure AD, Keycloak)
  - Path-Based Authentication
  - Rate Limiting per Driver

- **[Guards (Authorization)](./api/guards.md)** - Declarative authorization
  - Row-Level Security (RLS)
  - Multi-Tenancy
  - Guard Helpers (requireScopes, requireOwnership, anyOf, allOf)
  - Framework Integration

- **[Security](./api/security.md)** - Enterprise security features
  - Failban Plugin (fail2ban-style)
  - Security Headers (CSP, HSTS)
  - Rate Limiting
  - CORS Configuration

- **[Observability](./api/observability.md)** - Monitoring and tracing
  - Metrics Collector (`/metrics`)
  - Event Hooks System
  - Request ID Tracking
  - Health Checks (Kubernetes-ready)

- **[Static Files](./api/static-files.md)** - Serve files and SPAs
  - Filesystem Driver
  - S3 Driver
  - SPA Support (React, Vue, Angular)

- **[Deployment](./api/deployment.md)** - Production deployment
  - Docker Setup
  - Kubernetes Manifests
  - Zero-Downtime Deploys
  - Prometheus Monitoring

---

## 🛡️ Security Features

### 1. Failban Plugin (NEW!)

Automatic IP banning for security violations:

```javascript
await db.use(new ApiPlugin({
  failban: {
    enabled: true,
    maxViolations: 3,           // Ban after 3 violations
    violationWindow: 3600000,   // Within 1 hour
    banDuration: 86400000,      // Ban for 24 hours
    whitelist: ['127.0.0.1'],   // Never ban
    blacklist: [],              // Always ban
    persistViolations: true     // Track in S3DB
  }
}));

// Admin endpoints:
// GET    /admin/security/bans       → List active bans
// GET    /admin/security/bans/:ip   → Get ban details
// POST   /admin/security/bans       → Manually ban IP
// DELETE /admin/security/bans/:ip   → Unban IP
// GET    /admin/security/stats      → Ban statistics
```

**How it works:**
1. Rate limit exceeded → Violation recorded
2. Auth failure → Violation recorded
3. After N violations → IP automatically banned
4. TTLPlugin auto-unbans after duration
5. Events emitted: `security:banned`, `security:unbanned`, `security:violation`

### 2. Rate Limiting per Driver

Different limits for different auth methods:

```javascript
auth: {
  drivers: {
    oidc: {
      // ... config
      rateLimit: {
        enabled: true,
        windowMs: 900000,          // 15 minutes
        maxAttempts: 5,            // 5 attempts
        skipSuccessfulRequests: true  // Only count failures
      }
    },
    jwt: {
      // ... config
      rateLimit: {
        windowMs: 300000,          // 5 minutes
        maxAttempts: 20
      }
    },
    apikey: {
      // ... config
      rateLimit: {
        windowMs: 60000,           // 1 minute
        maxAttempts: 100
      }
    }
  }
}
```

### 3. Security Headers

Production-grade HTTP security headers:

```javascript
security: {
  enabled: true,
  headers: {
    csp: "default-src 'self'; script-src 'self' 'unsafe-inline'",
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: 'geolocation=(), microphone=(), camera=()'
  }
}
```

### 4. CORS with Preflight Cache

```javascript
cors: {
  enabled: true,
  origin: ['https://app.example.com'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposeHeaders: ['X-Request-ID', 'X-Total-Count'],
  credentials: true,
  maxAge: 86400  // 24 hour preflight cache
}
```

---

## 📊 Observability Features

### 1. Metrics Collector (NEW!)

Real-time API metrics at `/metrics`:

```javascript
metrics: {
  enabled: true,
  maxPathsTracked: 100,    // Limit memory usage
  resetInterval: 300000    // Reset every 5 minutes
}

// Visit http://localhost:3000/metrics for:
```

**Metrics included:**
```json
{
  "uptime": {
    "milliseconds": 3600000,
    "seconds": 3600,
    "formatted": "1h 0m 0s"
  },
  "requests": {
    "total": 12543,
    "rps": "3.48",
    "byMethod": { "GET": 10234, "POST": 2309 },
    "byStatus": { "2xx": 11891, "4xx": 543, "5xx": 109 },
    "topPaths": [
      {
        "path": "/api/users",
        "count": 5432,
        "avgDuration": "45.32",
        "errors": 12,
        "errorRate": "0.22%"
      }
    ],
    "duration": {
      "p50": 23,
      "p95": 156,
      "p99": 342,
      "avg": "45.67"
    }
  },
  "auth": {
    "total": 234,
    "success": 221,
    "failure": 13,
    "successRate": "94.44%",
    "byMethod": {
      "oidc": { "success": 145, "failure": 3 },
      "jwt": { "success": 76, "failure": 10 }
    }
  },
  "resources": {
    "total": 2309,
    "created": 543,
    "updated": 1234,
    "deleted": 532,
    "byResource": {
      "users": { "created": 123, "updated": 456, "deleted": 78 }
    }
  },
  "users": {
    "logins": 145,
    "newUsers": 23
  },
  "errors": {
    "total": 109,
    "rate": "0.87%",
    "byType": { "request": 87, "database": 22 }
  }
}
```

### 2. Event Hooks System (NEW!)

React to API events in real-time:

```javascript
events: { enabled: true }

// Listen to events
apiPlugin.events.on('user:created', (data) => {
  console.log('New user:', data.user);
  // Send welcome email, etc.
});

apiPlugin.events.on('auth:failure', (data) => {
  console.log('Auth failed:', data.ip, data.path);
  // Alert security team
});

apiPlugin.events.on('resource:*', (data) => {
  console.log('Resource event:', data.event, data.resource);
  // Replicate to BigQuery, SQS, etc.
});

apiPlugin.events.on('request:end', (data) => {
  if (data.duration > 1000) {
    console.warn('Slow request:', data.path, data.duration);
  }
});
```

**Available events:**
- `user:created` - New user created via OIDC
- `user:login` - User logged in
- `auth:success` - Authentication succeeded
- `auth:failure` - Authentication failed
- `resource:created` - Resource record created
- `resource:updated` - Resource record updated
- `resource:deleted` - Resource record deleted
- `request:start` - Request started
- `request:end` - Request ended
- `request:error` - Request errored
- `security:banned` - IP banned
- `security:unbanned` - IP unbanned
- `security:violation` - Security violation detected

### 3. Request ID Tracking (NEW!)

Distributed tracing with X-Request-ID:

```javascript
requestId: {
  enabled: true,
  headerName: 'X-Request-ID',     // Header name
  generator: () => generateId(),  // Custom ID generator
  includeInResponse: true         // Add to response headers
}
```

**Usage:**
- Pass `X-Request-ID` from client → Preserved throughout request
- No ID provided → Auto-generated
- Included in all logs and events
- Correlate requests across services

### 4. Session Tracking (NEW!)

Analytics-grade session management:

```javascript
sessionTracking: {
  enabled: true,
  resource: 'sessions',
  cookieName: 'session_id',
  cookieMaxAge: 2592000000,       // 30 days
  passphrase: process.env.SESSION_SECRET,
  updateOnRequest: true,          // Update lastSeenAt on each request
  enrichSession: async ({ session, context }) => ({
    // Custom enrichment
    country: context.req.header('cf-ipcountry'),
    fingerprint: context.req.header('x-visitor-id')
  })
}

// Access in routes:
const sessionId = c.get('sessionId');
const session = c.get('session');
```

**Features:**
- AES-256-GCM encrypted cookies
- Optional S3DB persistence
- Auto-update on each request
- IP, User-Agent, Referer tracking
- Custom enrichment function

### 5. Extensible Health Checks (NEW!)

Kubernetes-ready with custom checks:

```javascript
health: {
  liveness: {
    // Always returns 200 OK (is process alive?)
  },
  readiness: {
    timeout: 5000,
    checks: [
      {
        name: 'redis',
        check: async () => {
          const ping = await redis.ping();
          return { healthy: ping === 'PONG' };
        },
        optional: false
      },
      {
        name: 'external_api',
        check: async () => {
          const response = await fetch('https://api.example.com/health');
          return { healthy: response.ok };
        },
        optional: true  // Don't fail readiness if this fails
      }
    ]
  }
}
```

**Endpoints:**
- `GET /health/live` - Liveness probe (Kubernetes)
- `GET /health/ready` - Readiness probe (Kubernetes)
- `GET /health` - Generic health check

### 6. Graceful Shutdown (NEW!)

Zero-downtime deployments:

```javascript
// Automatic SIGTERM/SIGINT handling

// How it works:
// 1. SIGTERM received
// 2. Stop accepting new requests (returns 503)
// 3. Wait for in-flight requests to finish (max 30s)
// 4. Close HTTP server
// 5. Exit process

// Kubernetes readiness probe will remove pod from service
// No dropped requests!
```

---

## ⚙️ Configuration Reference

### Complete Configuration Example

```javascript
await db.use(new ApiPlugin({
  // Server
  port: 3000,
  host: '0.0.0.0',
  verbose: true,

  // Security
  security: {
    enabled: true,
    headers: {
      csp: "default-src 'self'",
      hsts: { maxAge: 31536000, includeSubDomains: true }
    }
  },

  cors: {
    enabled: true,
    origin: ['https://app.example.com'],
    credentials: true,
    maxAge: 86400
  },

  failban: {
    enabled: true,
    maxViolations: 3,
    violationWindow: 3600000,
    banDuration: 86400000,
    whitelist: ['127.0.0.1']
  },

  // Authentication
  auth: {
    resource: 'users',
    drivers: {
      oidc: {
        issuer: process.env.OIDC_ISSUER,
        clientId: process.env.OIDC_CLIENT_ID,
        clientSecret: process.env.OIDC_CLIENT_SECRET,
        redirectUri: 'http://localhost:3000/auth/callback',
        rateLimit: {
          enabled: true,
          maxAttempts: 5,
          windowMs: 900000
        }
      },
      jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: '7d'
      }
    },
    pathRules: [
      { path: '/admin/**', methods: ['oidc'], required: true },
      { path: '/api/**', methods: ['jwt'], required: true },
      { path: '/**', required: false }
    ]
  },

  // Observability
  requestId: { enabled: true },

  sessionTracking: {
    enabled: true,
    resource: 'sessions',
    passphrase: process.env.SESSION_SECRET,
    updateOnRequest: true
  },

  events: { enabled: true },

  metrics: {
    enabled: true,
    maxPathsTracked: 100,
    resetInterval: 300000
  },

  health: {
    readiness: {
      timeout: 5000,
      checks: [
        {
          name: 'database',
          check: async () => ({ healthy: true })
        }
      ]
    }
  },

  // Resources
  resources: {
    users: {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      validation: true
    }
  },

  // Custom routes
  routes: {
    '/custom': {
      GET: async (c) => c.json({ custom: true })
    }
  },

  // Static files
  static: [
    {
      driver: 'filesystem',
      path: '/app',
      root: './build',
      config: { fallback: 'index.html' }
    }
  ]
}));
```

---

## 🎯 API Endpoints

### Resource Endpoints

```bash
GET     /{resource}           # List/query
GET     /{resource}/:id       # Get by ID
POST    /{resource}           # Create
PUT     /{resource}/:id       # Update (full)
PATCH   /{resource}/:id       # Update (partial)
DELETE  /{resource}/:id       # Delete
HEAD    /{resource}           # Count
OPTIONS /{resource}           # Metadata
```

### System Endpoints

```bash
GET     /                     # API information
GET     /docs                 # Swagger UI
GET     /openapi.json         # OpenAPI spec
GET     /health               # Generic health
GET     /health/live          # Liveness probe
GET     /health/ready         # Readiness probe
GET     /metrics              # Metrics (if enabled)
```

### Admin Endpoints (if failban enabled)

```bash
GET     /admin/security/bans        # List bans
GET     /admin/security/bans/:ip    # Get ban
POST    /admin/security/bans        # Ban IP
DELETE  /admin/security/bans/:ip    # Unban IP
GET     /admin/security/stats       # Statistics
```

---

## 🏆 Best Practices

### 1. Use Environment Variables

```javascript
new ApiPlugin({
  port: process.env.PORT || 3000,
  auth: {
    drivers: {
      oidc: {
        issuer: process.env.OIDC_ISSUER,
        clientSecret: process.env.OIDC_CLIENT_SECRET
      }
    }
  },
  sessionTracking: {
    passphrase: process.env.SESSION_SECRET
  }
})
```

### 2. Enable All Production Features

```javascript
new ApiPlugin({
  // Security
  security: { enabled: true },
  cors: { enabled: true },
  failban: { enabled: true },

  // Observability
  requestId: { enabled: true },
  metrics: { enabled: true },
  events: { enabled: true },
  sessionTracking: { enabled: true },

  // Health checks
  health: {
    readiness: {
      checks: [/* your checks */]
    }
  }
})
```

### 3. Use Guards for Authorization

```javascript
import { requireScopes, anyOf, requireOwnership } from 's3db.js/plugins/api/concerns/guards-helpers';

guard: {
  update: anyOf(
    requireScopes(['admin']),
    requireOwnership()
  ),
  delete: requireScopes(['admin'])
}
```

### 4. Monitor with Events

```javascript
apiPlugin.events.on('request:error', (data) => {
  // Send to error tracking service
  errorTracker.report(data.error);
});

apiPlugin.events.on('security:banned', (data) => {
  // Alert security team
  slack.send(`IP banned: ${data.ip}`);
});
```

### 5. Use Partitions for Performance

```javascript
partitions: {
  byTenant: { fields: { tenantId: 'string' } },
  byStatus: { fields: { status: 'string' } }
}

// O(1) lookups instead of O(n) scans
```

---

## ❓ FAQ

**Q: Is this production-ready?**

A: Yes! Includes enterprise features:
- ✅ Automatic IP banning (failban)
- ✅ Rate limiting per auth driver
- ✅ Security headers (CSP, HSTS)
- ✅ Distributed tracing (Request ID)
- ✅ Real-time metrics
- ✅ Event hooks for integrations
- ✅ Graceful shutdown
- ✅ Health probes (Kubernetes)
- ✅ Session tracking

**Q: How do I protect against brute force attacks?**

A: Use failban + rate limiting:
```javascript
failban: {
  enabled: true,
  maxViolations: 3,
  banDuration: 86400000
}
```

After 3 violations (rate limit, auth failures), IP is automatically banned for 24 hours.

**Q: How do I track user sessions?**

A: Use session tracking:
```javascript
sessionTracking: {
  enabled: true,
  resource: 'sessions',
  passphrase: process.env.SESSION_SECRET
}
```

**Q: How do I monitor API performance?**

A: Use metrics + events:
```javascript
metrics: { enabled: true },
events: { enabled: true }

// Visit /metrics for real-time stats
// Listen to events for custom processing
```

**Q: How do I implement multi-tenancy?**

A: Use guards + partitions:
```javascript
guard: {
  '*': (ctx) => {
    ctx.tenantId = ctx.user.tenantId;
    return !!ctx.tenantId;
  },
  list: (ctx) => {
    ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
    return true;
  }
}
```

**Q: Can I use this with Azure AD?**

A: Yes! Use OIDC driver:
```javascript
auth: {
  drivers: {
    oidc: {
      issuer: 'https://login.microsoftonline.com/{tenantId}/v2.0',
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET
    }
  }
}
```

---

## 🔗 See Also

- [Authentication](./api/authentication.md)
- [Guards (Authorization)](./api/guards.md)
- [Security Features](./api/security.md)
- [Observability](./api/observability.md)
- [Deployment](./api/deployment.md)

---

> **🎉 Ready to build?** Start with the [Quick Start](#-quick-start) or explore [Real-World Examples](#-real-world-examples)!
