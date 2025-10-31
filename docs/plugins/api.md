# 🌐 API Plugin

**Transform s3db.js into a production-ready REST API in one line of code.**

---

## ⚡ TL;DR

```javascript
await db.use(new ApiPlugin({ port: 3000 }));  // That's it!
```

> 🧩 **Namespaces**: Provide `namespace: 'public-api'` (or pass an alias to `db.usePlugin`) to isolate this plugin's internal resources—Failban bans/violations will be stored under `plg_public-api_*`.

**You get instantly:**
- ✅ Auto-generated REST endpoints (GET/POST/PUT/PATCH/DELETE)
- ✅ Interactive Swagger UI at `/docs`
- ✅ Multiple auth methods (JWT, OAuth2/OIDC, API Keys, Basic)
- ✅ Enterprise security (rate limiting, IP banning, GeoIP blocking)
- ✅ Production observability (metrics, events, tracing, health checks)
- ✅ Zero boilerplate, all features opt-in

**Works with:** Azure AD • Google • Keycloak • Auth0 • Okta • Any OIDC provider

---

## 🚀 Quick Start

### Installation

```bash
pnpm add hono @hono/node-server @hono/swagger-ui jose
```

### Minimal Example

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// Create a resource
await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required'
  }
});

// Add API Plugin
await db.use(new ApiPlugin({ port: 3000 }));

// ✨ API running at http://localhost:3000
```

**Your API is ready:**
```bash
GET     /users           # List users
POST    /users           # Create user
GET     /users/:id       # Get user
PUT     /users/:id       # Update user (full)
PATCH   /users/:id       # Update user (partial)
DELETE  /users/:id       # Delete user

GET     /docs            # Interactive Swagger UI
GET     /health          # Health check
GET     /metrics         # Prometheus metrics
```

---

## 📑 Table of Contents

- [TL;DR](#-tldr)
- [Quick Start](#-quick-start)
- [Documentation Hub](#-documentation-hub)
- [Quick Wins](#-quick-wins)
- [Real-World Examples](#-real-world-examples)
- [Killer Features](#-killer-features)
- [Configuration](#-configuration)
- [Endpoints](#-endpoints)
- [FAQ](#-faq)

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

### Add OAuth2/OIDC (Works with Any Provider!)

**Supports:** Azure AD • Google Workspace • Keycloak • Auth0 • Okta • AWS Cognito • Any OIDC provider

```javascript
auth: {
  drivers: {
    oidc: {
      // Azure AD
      issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',

      // Or Keycloak (self-hosted)
      // issuer: 'https://keycloak.example.com/realms/myrealm',

      // Or Google
      // issuer: 'https://accounts.google.com',

      // Or Auth0
      // issuer: 'https://your-tenant.auth0.com',

      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
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

## ❓ FAQ

### Getting Started

<details>
<summary><strong>What makes this different from Express/Fastify/Hono?</strong></summary>

**This is built ON TOP of Hono**, but gives you instant REST APIs from s3db.js resources:

| Framework | What You Get |
|-----------|--------------|
| **Express/Fastify** | HTTP server, routing, middleware |
| **Hono** | Modern HTTP server with better performance |
| **API Plugin** | ✨ Everything above + auto-generated CRUD endpoints, auth, guards, metrics, security, docs |

**Key difference:** Zero boilerplate. Define your data schema once, get a complete REST API with authentication, authorization, and observability.

```javascript
// Traditional (100+ lines of code)
app.get('/users', auth, validate, async (req, res) => { /* ... */ });
app.post('/users', auth, validate, async (req, res) => { /* ... */ });
// ... repeat for PUT, PATCH, DELETE, error handling, etc.

// API Plugin (2 lines)
await db.createResource({ name: 'users', attributes: { ... } });
await db.use(new ApiPlugin({ port: 3000 }));
```

**[→ See comparison](./api/authentication.md#why-api-plugin)**
</details>

<details>
<summary><strong>Is this production-ready?</strong></summary>

**Yes!** Used in production by multiple companies. Includes:

**Security:**
- ✅ Automatic IP banning (failban with GeoIP country blocking)
- ✅ Rate limiting per auth driver (different limits for OIDC/JWT/API keys)
- ✅ Security headers (CSP, HSTS, X-Frame-Options, etc.)
- ✅ CORS with preflight caching

**Observability:**
- ✅ Real-time metrics endpoint (`/metrics`)
- ✅ Distributed tracing (Request ID)
- ✅ Event hooks for all operations
- ✅ Session tracking with encryption

**Reliability:**
- ✅ Graceful shutdown (zero-downtime deploys)
- ✅ Kubernetes health probes (`/health/live`, `/health/ready`)
- ✅ Custom health checks
- ✅ Error handling and recovery

**[→ See deployment guide](./api/deployment.md)**
</details>

<details>
<summary><strong>What's the performance like?</strong></summary>

**Built on Hono**, one of the fastest Node.js frameworks:
- ~12x faster than Express
- ~3x faster than Fastify
- Lightweight (~50KB core)

**With s3db.js partitions:**
- O(1) lookups instead of O(n) scans
- Multi-tenant queries: 10-100x faster with partition isolation
- Lazy loading: Only fetch what you need

**Production numbers** (from real deployments):
- p50 latency: ~20-50ms
- p95 latency: ~100-200ms
- p99 latency: ~300-500ms
- Handles 1000+ req/s on a single instance

**[→ See benchmarks](./api/deployment.md#performance)**
</details>

### Authentication & Authorization

<details>
<summary><strong>Can I use this with Azure AD / Google / Keycloak / Auth0?</strong></summary>

**Yes! Works with any OAuth2/OIDC provider:**

| Category | Providers |
|----------|-----------|
| **Enterprise** | Azure AD, Google Workspace, Okta |
| **Open Source** | Keycloak, Authentik, Authelia, Ory Hydra |
| **SaaS** | Auth0, AWS Cognito, FusionAuth, SuperTokens |
| **Self-hosted** | Keycloak (Java), Authentik (Python), Authelia (Go) |

```javascript
auth: {
  drivers: {
    oidc: {
      // Azure AD
      issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',

      // Keycloak (open source, self-hosted)
      // issuer: 'https://keycloak.example.com/realms/myrealm',

      // Google Workspace
      // issuer: 'https://accounts.google.com',

      // Auth0
      // issuer: 'https://your-tenant.auth0.com',

      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET
    }
  }
}
```

**💡 Pro tip:** Keycloak is a great open-source alternative to Azure AD - fully self-hosted, free, and production-ready!

**[→ Learn more: Authentication](./api/authentication.md#oidc)**
</details>

<details>
<summary><strong>Can I use multiple auth methods at once?</strong></summary>

**Yes!** Mix and match auth methods per route:

```javascript
auth: {
  drivers: {
    oidc: { /* Azure AD for admin dashboard */ },
    jwt: { /* JWT for mobile app */ },
    apikey: { /* API keys for integrations */ }
  },
  pathRules: [
    { path: '/admin/**', methods: ['oidc'], required: true },
    { path: '/api/**', methods: ['jwt', 'apikey'], required: true },
    { path: '/public/**', required: false }
  ]
}
```

**Real-world example:** URL shortener
- `/admin/**` → OIDC (Azure AD) for human admins
- `/api/**` → API keys for programmatic access
- `/r/:id` → Public redirects (no auth)

**[→ Learn more: Path-based auth](./api/authentication.md#path-based-authentication)**
</details>

<details>
<summary><strong>How do I implement multi-tenancy?</strong></summary>

**Use guards with partitions for O(1) tenant isolation:**

```javascript
const projects = await db.createResource({
  name: 'projects',
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
      // O(1) partition isolation
      ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
      return true;
    },
    create: (ctx) => {
      // Auto-inject tenantId
      ctx.body.tenantId = ctx.tenantId;
      return true;
    }
  }
});
```

**Key benefits:**
- ✅ O(1) lookups (not O(n) scans)
- ✅ Impossible to leak tenant data
- ✅ Auto-injection of tenant context
- ✅ Zero SQL/query builder needed

**[→ Learn more: Multi-tenancy patterns](./api/guards.md#multi-tenancy)**
</details>

<details>
<summary><strong>What's the difference between auth and guards?</strong></summary>

**Authentication (auth):** *Who are you?*
- Verifies user identity (JWT, OIDC, API key)
- Runs before request reaches your handlers
- Global or path-based

**Authorization (guards):** *What can you do?*
- Controls access to specific resources/records
- Row-level security (RLS)
- Runs per-resource operation

```javascript
// Auth: Verify JWT token
auth: {
  drivers: { jwt: { secret: 'xxx' } },
  pathRules: [{ path: '/api/**', methods: ['jwt'] }]
}

// Guards: Control what users can access
guard: {
  list: (ctx) => {
    // Users only see their own orders
    ctx.setPartition('byUser', { userId: ctx.user.sub });
    return true;
  },
  update: (ctx, record) => {
    // Only owner or admin can edit
    return ctx.user.scopes?.includes('admin') || record.userId === ctx.user.sub;
  }
}
```

**[→ Learn more: Guards](./api/guards.md)**
</details>

### Security

<details>
<summary><strong>How do I protect against brute force attacks?</strong></summary>

**Enable failban** - automatic IP banning after violations:

```javascript
failban: {
  enabled: true,
  maxViolations: 3,           // Ban after 3 strikes
  violationWindow: 3600000,   // Within 1 hour
  banDuration: 86400000,      // Ban for 24 hours

  // Optional: GeoIP country blocking
  geo: {
    enabled: true,
    databasePath: './GeoLite2-Country.mmdb',
    blockedCountries: ['CN', 'RU', 'KP']  // Block by ISO code
  }
}
```

**What counts as a violation:**
- Rate limit exceeded
- Authentication failure
- Invalid requests

**Auto-unban:** TTL-based, no manual intervention needed

**[→ Learn more: Security features](./api/security.md#failban)**
</details>

<details>
<summary><strong>Can I block traffic by country?</strong></summary>

**Yes!** GeoIP blocking with MaxMind GeoLite2 (free):

```javascript
failban: {
  geo: {
    enabled: true,
    databasePath: './GeoLite2-Country.mmdb',

    // Option 1: Whitelist (only allow these)
    allowedCountries: ['US', 'BR', 'CA', 'MX'],

    // Option 2: Blacklist (block these)
    blockedCountries: ['CN', 'RU', 'KP'],

    // Block unknown/unresolved IPs?
    blockUnknown: false
  }
}
```

**Download GeoLite2:**
```bash
wget https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-Country.mmdb
npm install @maxmind/geoip2-node
```

**Response headers:**
- `X-Country-Code`: ISO 3166-1 alpha-2 code
- `X-Ban-Status`: `country_blocked` | `banned` | `blacklisted`

**[→ Learn more: GeoIP blocking](./api/security.md#geoip)**
</details>

### Observability

<details>
<summary><strong>How do I monitor API performance?</strong></summary>

**Enable metrics** for real-time observability:

```javascript
metrics: { enabled: true },
events: { enabled: true }
```

**Visit `/metrics` for:**
- Request counts, RPS (requests per second)
- Latency percentiles (p50, p95, p99)
- Auth success/failure rates
- Resource operations tracking
- Error rates and types
- Top paths and slowest endpoints

**JSON format** (Prometheus-compatible):
```json
{
  "uptime": { "seconds": 3600, "formatted": "1h 0m 0s" },
  "requests": {
    "total": 12543,
    "rps": "3.48",
    "duration": { "p50": 23, "p95": 156, "p99": 342 }
  },
  "auth": {
    "successRate": "94.44%",
    "byMethod": { "oidc": 145, "jwt": 76 }
  }
}
```

**[→ Learn more: Metrics](./api/observability.md#metrics)**
</details>

<details>
<summary><strong>Can I trigger actions when things happen?</strong></summary>

**Yes! Event hooks** for everything:

```javascript
events: { enabled: true }

// Listen to events
apiPlugin.events.on('user:created', (data) => {
  // Send welcome email
  emailService.send({ to: data.user.email, template: 'welcome' });
});

apiPlugin.events.on('auth:failure', (data) => {
  // Alert security team
  slack.send(`Failed login attempt from ${data.ip}`);
});

apiPlugin.events.on('resource:created', async (data) => {
  // Replicate to analytics
  await bigquery.insert(data.resource, data.item);
});

apiPlugin.events.on('request:end', (data) => {
  if (data.duration > 1000) {
    console.warn(`Slow request: ${data.path} took ${data.duration}ms`);
  }
});
```

**Available events:**
- `user:*` - User lifecycle
- `auth:*` - Authentication events
- `resource:*` - CRUD operations (supports wildcards!)
- `request:*` - HTTP request lifecycle
- `security:*` - Security violations, bans

**[→ Learn more: Events](./api/observability.md#events)**
</details>

### Full-Stack Apps

<details>
<summary><strong>How do I serve a React/Vue/Angular app?</strong></summary>

**Use static files** feature for SPAs:

```javascript
static: [{
  driver: 'filesystem',
  path: '/app',              // Serve at /app/*
  root: './build',           // Build output directory
  config: {
    fallback: 'index.html'   // SPA support (client-side routing)
  }
}]
```

**Multiple apps:**
```javascript
static: [
  { path: '/admin', root: './admin/build', config: { fallback: 'index.html' } },
  { path: '/app', root: './app/build', config: { fallback: 'index.html' } },
  { path: '/assets', root: './public' }  // No fallback for assets
]
```

**With authentication:**
```javascript
auth: {
  pathRules: [
    { path: '/api/**', methods: ['jwt'], required: true },
    { path: '/app/**', required: false }  // Public SPA
  ]
}
```

**[→ Learn more: Static files](./api/static-files.md)**
</details>

<details>
<summary><strong>Can I customize routes or add my own endpoints?</strong></summary>

**Yes!** Add custom routes alongside auto-generated ones:

```javascript
routes: {
  '/custom/endpoint': {
    GET: async (c) => {
      return c.json({ message: 'Custom endpoint!' });
    }
  },

  '/api/search': {
    POST: async (c) => {
      const { query } = await c.req.json();
      const results = await performSearch(query);
      return c.json({ results });
    }
  },

  // Override default resource endpoints
  '/users': {
    GET: async (c) => {
      // Custom implementation
      const users = await getUsersWithCustomLogic();
      return c.json(users);
    }
  }
}
```

**Full Hono context available:** `c.req`, `c.json()`, `c.redirect()`, etc.

**[→ Learn more: Custom routes](./api/configuration.md#custom-routes)**
</details>

### Deployment

<details>
<summary><strong>How do I deploy to Kubernetes?</strong></summary>

**Use health probes** for zero-downtime:

```javascript
health: {
  readiness: {
    timeout: 5000,
    checks: [
      {
        name: 'database',
        check: async () => {
          const healthy = await db.ping();
          return { healthy };
        }
      },
      {
        name: 'redis',
        check: async () => {
          const pong = await redis.ping();
          return { healthy: pong === 'PONG' };
        },
        optional: true  // Don't fail readiness if Redis is down
      }
    ]
  }
}
```

**Kubernetes manifest:**
```yaml
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

**Graceful shutdown** built-in (SIGTERM handling, in-flight request tracking).

**[→ Learn more: Kubernetes deployment](./api/deployment.md#kubernetes)**
</details>

## 🎓 What's Next?

**Choose your path:**

| If you want to... | Start here |
|-------------------|------------|
| 🚀 Build your first API | [Quick Start](#-quick-start) |
| 🔐 Add authentication | [Authentication Guide](./api/authentication.md) |
| 🛡️ Secure your data | [Guards & Authorization](./api/guards.md) |
| 🔒 Prevent attacks | [Security Features](./api/security.md) |
| 📊 Monitor performance | [Observability](./api/observability.md) |
| 📦 Serve frontend apps | [Static Files](./api/static-files.md) |
| 🚀 Deploy to production | [Deployment Guide](./api/deployment.md) |

**Learning path:**
1. **Beginner:** [Quick Start](#-quick-start) → [Auth](./api/authentication.md) → [Guards](./api/guards.md)
2. **Intermediate:** [Security](./api/security.md) → [Observability](./api/observability.md) → [Static Files](./api/static-files.md)
3. **Advanced:** [Deployment](./api/deployment.md) → [Auth Patterns](./api/authorization-patterns.md) → [Full Config](./api/configuration.md)

---

## 💬 Need Help?

- **📖 Check the [FAQ](#-faq)** - Most questions answered
- **🔍 Explore [Documentation Hub](#-documentation-hub)** - All guides in one place
- **🎯 Try [Real-World Examples](#-real-world-examples)** - Copy-paste solutions
- **🐛 Found a bug?** - Open an issue on GitHub
- **💡 Have a question?** - Check detailed guides or ask the community

---

> **🎉 Ready to build something awesome?** This plugin gives you enterprise-grade APIs with zero boilerplate. Start simple with one line of code, add features as you grow. Everything is opt-in, nothing is mandatory. Build at your own pace!
>
> **⭐ Star us on GitHub** if this saved you time!
