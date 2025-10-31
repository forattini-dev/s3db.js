# 🌐 API Plugin

**Transform s3db.js into a production-ready REST API in one line of code.**

```javascript
await db.use(new ApiPlugin({ port: 3000 }));  // 🎉
```

**You get:** Auto-generated CRUD endpoints • Enterprise auth • Rate limiting • Metrics • Health checks • Swagger docs

```bash
# Quick start
pnpm add hono @hono/node-server @hono/swagger-ui jose

# Your API is ready
GET  /users     → List users      GET  /health     → Health check
POST /users     → Create user     GET  /metrics    → Prometheus metrics
GET  /users/:id → Get user        GET  /docs       → Interactive Swagger UI
```

---

## 📚 Documentation Hub

**Core Guides** - Essential features and setup:

| Guide | What's Inside | When to Read |
|-------|---------------|--------------|
| **[🔐 Authentication](./api/authentication.md)** | JWT, OAuth2/OIDC, API Keys, Basic Auth | Setting up user authentication |
| **[🛡️ Guards & Authorization](./api/guards.md)** | Row-level security, multi-tenancy, RBAC | Controlling access to data |
| **[🔒 Security](./api/security.md)** | Failban, rate limiting, GeoIP blocking, CSP headers | Protecting your API |
| **[📊 Observability](./api/observability.md)** | Metrics, events, tracing, health checks | Monitoring production APIs |
| **[📦 Static Files](./api/static-files.md)** | Serve SPAs (React/Vue/Angular) and assets | Building full-stack apps |
| **[🚀 Deployment](./api/deployment.md)** | Docker, Kubernetes, zero-downtime deploys | Going to production |

**Advanced Topics**:

| Topic | What You'll Learn |
|-------|-------------------|
| **[Authorization Patterns](./api/authorization-patterns.md)** | Granular scopes, ABAC, hierarchical permissions |
| **[Guard Design](./api/guards-design.md)** | Framework-agnostic declarative authorization |
| **[Configuration Deep Dive](./api/configuration.md)** | All configuration options explained |

---

## ⚡ Quick Wins

### 30-Second API

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

await db.createResource({
  name: 'users',
  attributes: { email: 'string|required|email', name: 'string|required' }
});

await db.use(new ApiPlugin({ port: 3000 }));
// ✨ API running at http://localhost:3000
```

### Add Authentication (JWT)

```javascript
await db.use(new ApiPlugin({
  port: 3000,
  auth: {
    resource: 'users',
    drivers: {
      jwt: { secret: process.env.JWT_SECRET }
    },
    pathRules: [
      { path: '/api/**', methods: ['jwt'], required: true }
    ]
  }
}));
```

### Add OAuth2/OIDC (Azure AD, Google, Keycloak)

```javascript
auth: {
  drivers: {
    oidc: {
      issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      redirectUri: 'http://localhost:3000/auth/callback'
    }
  }
}
```

### Production-Ready Stack

```javascript
await db.use(new ApiPlugin({
  port: 3000,

  // 🔒 Security
  security: { enabled: true },
  cors: { enabled: true },
  failban: { enabled: true, maxViolations: 3 },

  // 📊 Observability
  metrics: { enabled: true },
  events: { enabled: true },
  requestId: { enabled: true },

  // 🏥 Health
  health: {
    readiness: {
      checks: [
        { name: 'database', check: async () => ({ healthy: true }) }
      ]
    }
  }
}));
```

---

## 🎯 Real-World Examples

### 1. Multi-Tenant SaaS with Row-Level Security

Perfect tenant isolation with O(1) partition lookups:

```javascript
import { requireTenant, requireScopes } from 's3db.js/plugins/api/concerns/guards-helpers';

const projects = await db.createResource({
  name: 'projects',
  attributes: {
    tenantId: 'string|required',
    name: 'string|required',
    ownerId: 'string|required'
  },
  partitions: {
    byTenant: { fields: { tenantId: 'string' } }
  },
  guard: {
    list: (ctx) => {
      // O(1) tenant isolation
      ctx.setPartition('byTenant', { tenantId: ctx.user.tenantId });
      return true;
    },
    create: (ctx) => {
      // Auto-inject tenant
      ctx.body.tenantId = ctx.user.tenantId;
      ctx.body.ownerId = ctx.user.sub;
      return true;
    },
    update: (ctx, record) => {
      // Only owner or admin can edit
      return ctx.user.scopes?.includes('admin') || record.ownerId === ctx.user.sub;
    }
  }
});
```

**Key wins:** Zero SQL, O(1) lookups, impossible to leak tenant data, auto-injection of user context.

**[→ See complete multi-tenant example](./api/guards.md#multi-tenancy-patterns)**

---

### 2. Analytics Platform with Session Tracking

Track every visitor with encrypted cookies and real-time metrics:

```javascript
await db.use(new ApiPlugin({
  sessionTracking: {
    enabled: true,
    resource: 'sessions',
    passphrase: process.env.SESSION_SECRET,
    updateOnRequest: true,
    enrichSession: async ({ context }) => ({
      country: context.req.header('cf-ipcountry'),
      fingerprint: context.req.header('x-visitor-id')
    })
  },

  metrics: { enabled: true },
  events: { enabled: true }
}));

// React to events
apiPlugin.events.on('request:end', async (data) => {
  await events.insert({
    sessionId: data.sessionId,
    path: data.path,
    duration: data.duration,
    timestamp: new Date().toISOString()
  });
});

// Real-time metrics at /metrics
// p50/p95/p99 latency, RPS, error rates, top paths
```

**Key wins:** Encrypted sessions, real-time metrics, event-driven analytics, automatic tracking.

**[→ See complete analytics example](./api/observability.md#session-tracking)**

---

### 3. URL Shortener with GeoIP Blocking

Public redirects, admin dashboard, automatic abuse prevention:

```javascript
await db.use(new ApiPlugin({
  auth: {
    drivers: {
      oidc: { /* Azure AD for admin */ },
      basic: { /* API tokens for programmatic access */ }
    },
    pathRules: [
      { path: '/admin/**', methods: ['oidc'], required: true },
      { path: '/api/**', methods: ['basic'], required: true },
      { path: '/r/**', required: false }  // Public redirects
    ]
  },

  failban: {
    enabled: true,
    maxViolations: 10,
    banDuration: 86400000,  // 24h
    geo: {
      enabled: true,
      databasePath: './GeoLite2-Country.mmdb',
      blockedCountries: ['CN', 'RU']  // Block by country
    }
  },

  routes: {
    '/r/:id': {
      GET: async (c) => {
        const url = await urls.get(c.req.param('id'));
        if (!url) return c.notFound();

        // Track click asynchronously
        clicks.insert({
          shortId: url.id,
          ip: c.req.header('x-forwarded-for'),
          country: c.req.header('cf-ipcountry')
        });

        return c.redirect(url.target, 302);
      }
    }
  }
}));
```

**Key wins:** Dual auth, GeoIP blocking, automatic IP banning, public + protected routes.

**[→ See complete URL shortener example](./api/authentication.md#path-based-authentication)**

---

### 4. E-commerce with Inventory Management

Real-time stock tracking with event-driven updates:

```javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    items: 'array|required',
    total: 'number|required'
  },
  partitions: {
    byUser: { fields: { userId: 'string' } }
  },
  guard: {
    list: (ctx) => {
      // Users see only their orders, admins see all
      if (!ctx.user.scopes?.includes('admin')) {
        ctx.setPartition('byUser', { userId: ctx.user.sub });
      }
      return true;
    },
    create: (ctx) => {
      ctx.body.userId = ctx.user.sub;
      return true;
    }
  }
});

// Event-driven inventory
apiPlugin.events.on('resource:created', async ({ resource, item }) => {
  if (resource === 'orders') {
    // Decrease stock for each item
    for (const orderItem of item.items) {
      const product = await products.get(orderItem.sku);
      await products.update(orderItem.sku, {
        stock: product.stock - orderItem.quantity
      });
    }
  }
});
```

**Key wins:** User isolation, admin override, event-driven inventory, automatic stock updates.

**[→ See complete e-commerce example](./api/guards.md#e-commerce-patterns)**

---

## 🔥 Killer Features

### Failban with GeoIP Blocking

Automatically ban abusive IPs and block by country:

```javascript
failban: {
  enabled: true,
  maxViolations: 3,        // Ban after 3 strikes
  violationWindow: 3600000, // Within 1 hour
  banDuration: 86400000,   // Ban for 24 hours
  geo: {
    enabled: true,
    databasePath: './GeoLite2-Country.mmdb',
    allowedCountries: ['US', 'BR', 'CA'],  // Whitelist
    blockedCountries: ['CN', 'RU'],        // Blacklist
    blockUnknown: false
  }
}
```

**[→ Deep dive: Security features](./api/security.md#failban)**

---

### Real-Time Metrics

Production-grade observability at `/metrics`:

```json
{
  "requests": {
    "total": 12543,
    "rps": "3.48",
    "duration": { "p50": 23, "p95": 156, "p99": 342 }
  },
  "auth": {
    "successRate": "94.44%",
    "byMethod": { "oidc": 145, "jwt": 76 }
  },
  "resources": {
    "created": 543,
    "updated": 1234,
    "deleted": 532
  }
}
```

**[→ Deep dive: Observability](./api/observability.md#metrics)**

---

### Event Hooks

React to everything happening in your API:

```javascript
events: { enabled: true }

apiPlugin.events.on('user:created', (data) => {
  // Send welcome email
});

apiPlugin.events.on('auth:failure', (data) => {
  // Alert security team
});

apiPlugin.events.on('resource:*', (data) => {
  // Replicate to BigQuery
});

apiPlugin.events.on('request:end', (data) => {
  if (data.duration > 1000) {
    // Log slow requests
  }
});
```

**Available events:** `user:created`, `user:login`, `auth:success`, `auth:failure`, `resource:*`, `request:*`, `security:*`

**[→ Deep dive: Event system](./api/observability.md#events)**

---

### Guard Helpers

Declarative authorization with zero boilerplate:

```javascript
import {
  requireScopes,
  requireRole,
  requireOwnership,
  requireTenant,
  anyOf,
  allOf
} from 's3db.js/plugins/api/concerns/guards-helpers';

guard: {
  list: requireTenant(),  // Automatic tenant isolation

  update: anyOf(
    requireScopes(['admin']),
    requireOwnership('userId')
  ),

  delete: allOf(
    requireRole('admin'),
    requireScopes(['delete:all'])
  )
}
```

**[→ Deep dive: Guards](./api/guards.md)**

---

## ⚙️ Configuration

### Minimal (Development)

```javascript
await db.use(new ApiPlugin({
  port: 3000,
  verbose: true
}));
```

### Production-Ready

```javascript
await db.use(new ApiPlugin({
  port: process.env.PORT || 3000,

  // 🔐 Authentication
  auth: {
    resource: 'users',
    drivers: {
      oidc: { issuer: process.env.OIDC_ISSUER, ... },
      jwt: { secret: process.env.JWT_SECRET }
    },
    pathRules: [
      { path: '/admin/**', methods: ['oidc'], required: true },
      { path: '/api/**', methods: ['jwt'], required: true }
    ]
  },

  // 🛡️ Security
  security: { enabled: true },
  cors: { enabled: true, origin: ['https://app.example.com'] },
  failban: {
    enabled: true,
    maxViolations: 3,
    geo: {
      enabled: true,
      allowedCountries: ['US', 'BR', 'CA']
    }
  },

  // 📊 Observability
  requestId: { enabled: true },
  metrics: { enabled: true },
  events: { enabled: true },
  sessionTracking: {
    enabled: true,
    resource: 'sessions',
    passphrase: process.env.SESSION_SECRET
  },

  // 🏥 Health Checks
  health: {
    readiness: {
      checks: [
        { name: 'database', check: async () => ({ healthy: true }) }
      ]
    }
  }
}));
```

**[→ See all configuration options](./api/configuration.md)**

---

## 🚀 Endpoints

### Auto-Generated (Per Resource)

```bash
GET     /{resource}        # List/query (with filters)
GET     /{resource}/:id    # Get by ID
POST    /{resource}        # Create
PUT     /{resource}/:id    # Update (full)
PATCH   /{resource}/:id    # Update (partial)
DELETE  /{resource}/:id    # Delete
HEAD    /{resource}        # Count
OPTIONS /{resource}        # Metadata
```

### System Endpoints

```bash
GET     /                  # API information
GET     /docs              # Interactive Swagger UI
GET     /openapi.json      # OpenAPI 3.0 spec
GET     /health            # Health check
GET     /health/live       # Kubernetes liveness probe
GET     /health/ready      # Kubernetes readiness probe
GET     /metrics           # Prometheus metrics (if enabled)
```

### Admin Endpoints (If Failban Enabled)

```bash
GET     /admin/security/bans       # List active bans
GET     /admin/security/bans/:ip   # Ban details
POST    /admin/security/bans       # Manual ban
DELETE  /admin/security/bans/:ip   # Unban
GET     /admin/security/stats      # Statistics
```

---

## ❓ Common Questions

<details>
<summary><strong>How do I protect against brute force attacks?</strong></summary>

Enable failban with rate limiting:

```javascript
failban: {
  enabled: true,
  maxViolations: 3,
  violationWindow: 3600000,
  banDuration: 86400000
}
```

After 3 violations (rate limit exceeded, auth failures), IP is automatically banned for 24 hours.

**[→ Learn more: Security](./api/security.md#failban)**
</details>

<details>
<summary><strong>How do I implement multi-tenancy?</strong></summary>

Use guards with partitions for O(1) tenant isolation:

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

**[→ Learn more: Guards](./api/guards.md#multi-tenancy)**
</details>

<details>
<summary><strong>Can I use this with Azure AD / Google / Keycloak?</strong></summary>

Yes! Use the OIDC driver:

```javascript
auth: {
  drivers: {
    oidc: {
      issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET
    }
  }
}
```

**[→ Learn more: Authentication](./api/authentication.md#oidc)**
</details>

<details>
<summary><strong>How do I monitor API performance?</strong></summary>

Enable metrics and events:

```javascript
metrics: { enabled: true },
events: { enabled: true }
```

Visit `/metrics` for real-time performance data (p50/p95/p99 latency, RPS, error rates). Listen to events for custom processing.

**[→ Learn more: Observability](./api/observability.md)**
</details>

<details>
<summary><strong>How do I serve a React/Vue/Angular app?</strong></summary>

Use the static files feature:

```javascript
static: [{
  driver: 'filesystem',
  path: '/app',
  root: './build',
  config: { fallback: 'index.html' }  // SPA support
}]
```

**[→ Learn more: Static Files](./api/static-files.md)**
</details>

<details>
<summary><strong>Is this production-ready?</strong></summary>

Yes! Includes:
- ✅ Automatic IP banning (failban with GeoIP)
- ✅ Rate limiting per auth driver
- ✅ Security headers (CSP, HSTS, etc.)
- ✅ Distributed tracing (Request ID)
- ✅ Real-time metrics & events
- ✅ Graceful shutdown
- ✅ Kubernetes health probes
- ✅ Session tracking

**[→ See deployment guide](./api/deployment.md)**
</details>

---

## 🎓 Learning Path

**Beginner** → Start here:
1. [Quick Start](#-quick-wins) - Get your first API running
2. [Authentication](./api/authentication.md) - Add user auth
3. [Guards](./api/guards.md) - Control data access

**Intermediate** → Level up:
4. [Security](./api/security.md) - Protect your API
5. [Observability](./api/observability.md) - Monitor production
6. [Static Files](./api/static-files.md) - Serve your frontend

**Advanced** → Master it:
7. [Deployment](./api/deployment.md) - Kubernetes & Docker
8. [Authorization Patterns](./api/authorization-patterns.md) - Advanced RBAC
9. [Configuration](./api/configuration.md) - Fine-tune everything

---

## 🔗 Next Steps

**Ready to build?** Pick a starting point:

- 🚀 **[Quick Start](#-quick-wins)** - Get running in 30 seconds
- 🔐 **[Authentication Guide](./api/authentication.md)** - Add user login
- 🛡️ **[Guards Tutorial](./api/guards.md)** - Secure your data
- 🎯 **[Real-World Examples](#-real-world-examples)** - Copy-paste solutions
- 🚀 **[Deployment Guide](./api/deployment.md)** - Go to production

**Need help?** Check the [FAQ](#-common-questions) or explore the [Documentation Hub](#-documentation-hub).

---

> **💡 Pro Tip:** This plugin transforms s3db.js resources into REST APIs with zero boilerplate. Start simple, add features as you need them. All features are opt-in!
