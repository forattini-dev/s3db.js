# 🌐 API Plugin

> **Transform s3db.js into a production-ready REST API in one line of code**

```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));
// ✅ REST API + Auth + Docs + Metrics running
```

**Instant features:** Auto-generated endpoints • JWT/OAuth2/OIDC/Header Secret auth • Row-level security • Role-aware protected fields • Native resource views • Write policies per operation • Resource-level custom routes • Interactive docs (OpenAPI + USD) • Production metrics

**Works with:** Any OIDC provider (IdentityPlugin, Keycloak, Azure AD, AWS Cognito, etc.)

---

## TLDR

- `ApiPlugin` gives you native CRUD routes, auth, docs, security middleware, and runtime observability with almost no boilerplate.
- `resource.api` is the center of gravity for resource-level policy: `guard`, `views`, `protected`, `write`, and native `bulk.create`.
- Native batch support currently means `POST /:resource/bulk` via `resource.api.bulk.create`.
- There is no native `bulk delete` route documented or registered in this runtime yet; for bulk deletion, keep using resource methods or explicit custom routes.
- `ApiPlugin.previewRuntime()`, `ApiPlugin.doctor()`, and `ApiPlugin.contractTests()` expose the same route plan as structured inspection data, diagnostics, and generated checks without needing live traffic.
- Generated OpenAPI/USD schemas now flow through Raffel's canonical schema descriptor normalization, so fallback diagnostics stay visible when a schema is opaque.

## Table of Contents

- [Quick Start](#-quick-start)
- [Listener Matrix](#listener-matrix-multi-port--multiplexer)
- [Documentation](#-documentation)
- [Batch Operations](#-batch-operations)
- [Common Use Cases](#-common-use-cases)
- [Production Features](#-production-features)
- [Installation](#-installation)
- [FAQ](#-faq)
- [What's Next](#-whats-next)

## ⚡ Quick Start

### Inspection-First DX

```javascript
const api = new ApiPlugin({
  auth: { drivers: [{ driver: 'jwt', config: { secret: process.env.JWT_SECRET } }] },
  resources: { orders: { auth: ['jwt'] } }
});

await db.usePlugin(api);

const preview = await api.previewRuntime();
const doctor = await api.doctor();
const contractTests = await api.contractTests();
```

Use this when you want to inspect route exposure, review diagnostics, or generate auth/input regression checks from the plugin's own route metadata.

### 1. Basic API (30 seconds)

```javascript
import { Database } from 's3db.js';
import { ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://bucket/db' });
await db.connect();

await db.createResource({
  name: 'users',
  attributes: { email: 'string|required|email', name: 'string|required' }
});

await db.usePlugin(new ApiPlugin({ port: 3000 }));
// ✨ API at http://localhost:3000 with docs UI at /docs
```

### 2. Add JWT Authentication

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    resource: 'users',
    drivers: { jwt: { secret: process.env.JWT_SECRET, lookupById: true } },  // ⚡ O(1) when user.id = email
    pathRules: [{ path: '/api/**', methods: ['jwt'], required: true }]
  }
}));
```

### 3. Add OAuth2/OIDC (Google, Azure, etc)

```javascript
auth: {
  drivers: {
    oidc: {
      issuer: 'https://accounts.google.com',  // or Azure AD, Keycloak, Auth0
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: 'http://localhost:3000/auth/callback',
      cookieSecret: process.env.COOKIE_SECRET,
      lookupById: true                             // ⚡ O(1) when your fallback lookup field is also the user ID
    }
  }
}
```

**✨ Latest OIDC enhancements:** Auto token refresh • Continue URL • Provider quirks (Google/Azure/Auth0) • Cross-subdomain auth
**[→ OIDC Quick Start](/plugins/api/guides/oidc.md)**

### 4. Let an Admin App Call Native Routes Directly

```javascript
auth: {
  createResource: false,
  drivers: [{
    driver: 'header-secret',
    config: {
      headerName: 'x-admin-secret',
      secret: process.env.ADMIN_SECRET,
      role: 'admin',
      roles: ['admin'],
      serviceAccount: { clientId: 'admin-ui', name: 'Admin UI' }
    }
  }],
  pathRules: [
    { path: '/users/**', methods: ['header-secret'], required: true, roles: ['admin'] }
  ]
}
```

That lets the admin app consume `/users`, `/devices`, `/usage_records`, and other native resource routes without custom auth wrappers.

### 5. Model Resource Visibility and Mutability in One Place

```javascript
await db.createResource({
  name: 'users',
  attributes: { name: 'string', email: 'string', role: 'string', tokenHash: 'string' },
  api: {
    views: {
      public: {
        auto: true,
        priority: 1,
        fields: ['id', 'name']
      },
      admin: {
        auto: true,
        whenRole: ['admin'],
        priority: 100,
        fields: ['id', 'name', 'email', 'role', 'tokenHash']
      }
    },
    write: {
      patch: [
        { whenRole: ['admin'], priority: 100, writable: ['name', 'email', 'role'] },
        { whenRole: ['user'], priority: 10, writable: ['name', 'email'], readonly: ['role'] }
      ]
    }
  }
});
```

This keeps “who can see what” and “who can change what” attached to the resource instead of spread across handlers.

It also extends naturally to native batch routes. `resource.api.bulk.create` can expose `POST /:resource/bulk` while reusing the same `guard`, `write`, `views`, and `protected` rules defined on the resource.

Need the exact keys, precedence, and custom-route shape for `resource.api`?
**[→ Resource API Reference](/plugins/api/reference/resource-api.md)**

---

### Listener Matrix (multi-port / multiplexer)

Use `listeners` when you need either:

- **multi-port**: open multiple `bind` ports on the same plugin
- **multiplexer**: run more than one protocol on the same bind

```javascript
await db.usePlugin(new ApiPlugin({
  listeners: [{
    bind: { host: '0.0.0.0', port: 3000 },
    protocols: {
      http: { enabled: true },
      websocket: { enabled: true, path: '/ws' },
      udp: { enabled: true }
    }
  }, {
    bind: { host: '0.0.0.0', port: 4000 },
    protocols: {
      tcp: { enabled: true }
    }
  }]
}));
```

For protocol details and exact option matrix, see:
**[API Configuration Reference → Listeners section](/plugins/api/reference/configuration.md#listeners-multi-port--multiplexer)**

---

## 📚 Documentation

### Getting Started

| Guide | Description | Read Time |
|-------|-------------|-----------|
| **[Authentication](/plugins/api/guides/authentication.md)** | JWT, OAuth2/OIDC, API Keys, Basic Auth | 10 min |
| **[Resource Policies](/plugins/api/guides/resource-policies.md)** | Views, protected fields, per-operation mutability | 12 min |
| **[Identity Integration](/plugins/api/guides/identity.md)** | Delegate auth to IdentityPlugin + remote metadata | 15 min |
| **[Guards](/plugins/api/guides/guards.md)** | Row-level security, multi-tenancy, RBAC | 15 min |
| **[Security](/plugins/api/guides/security.md)** | Failban, rate limiting, GeoIP blocking | 10 min |
| **[Deployment](/plugins/api/guides/deployment.md)** | Docker, Kubernetes, production tips | 15 min |

### Features Deep Dive

| Guide | Description | Read Time |
|-------|-------------|-----------|
| **[OIDC Guide](/plugins/api/guides/oidc.md)** | ✨ Complete OAuth2/OIDC setup (Google, Azure, etc) | 20 min |
| **[OpenAPI Docs](/plugins/api/guides/openapi.md)** | Customize docs UI, add descriptions | 10 min |
| **[Routing](/plugins/api/reference/routing.md)** | Custom routes, precedence, path rules | 5 min |
| **[Authorization Patterns](/plugins/api/guides/authorization-patterns.md)** | RBAC, ABAC, multi-tenancy patterns | 10 min |
| **[Resource Policies](/plugins/api/guides/resource-policies.md)** | Model “who sees what” and “who can edit what” on the resource itself | 12 min |
| **[Static Files](/plugins/api/guides/static-files.md)** | Serve SPAs, assets, filesystem/S3 drivers | 5 min |
| **[Plugin Integrations](/plugins/api/guides/integrations.md)** | Expose AuditPlugin, Metrics, Cloud Inventory data | 5 min |

### Reference

| Document | Description |
|----------|-------------|
| **[Configuration](/plugins/api/reference/configuration.md)** | All config options (alphabetical) |
| **[Resource API Reference](/plugins/api/reference/resource-api.md)** | Exact `resource.api` keys, precedence, and custom route behavior |
| **[Route Context](/plugins/api/reference/route-context.md)** | Request, auth, validation, and response helpers for custom routes |
| **[FAQ](/plugins/api/faq.md)** | Common questions and troubleshooting |

### Batch Operations

| Topic | Description |
|-------|-------------|
| **[Resource Policies](/plugins/api/guides/resource-policies.md#apibulkcreate)** | How native batch create reuses `guard`, `write`, `views`, and `protected` |
| **[Resource API Reference](/plugins/api/reference/resource-api.md#bulk)** | Exact `bulk.create` keys, request shapes, statuses, and limits |

### Examples

| Example | Description |
|---------|-------------|
| [e50-oidc-simple.js](/examples/e50-oidc-simple.js) | Basic OIDC with Google |
| [e88-oidc-enhancements.js](/examples/e88-oidc-enhancements.js) | Complete OIDC enhancements demo |
| [e101-path-based-basic-oidc.js](/examples/e101-path-based-basic-oidc.js) | Dual auth (Basic + OIDC) |

---

## 📦 Batch Operations

The API plugin currently exposes one native batch route on the resource surface:

- `POST /:resource/bulk` through `resource.api.bulk.create`

That route is resource-native, so it keeps the same policy model as single-record create:

- `guard.create`
- `write.create`
- response shaping through `views`
- field removal through `protected`

Use it when the endpoint is still clearly about one resource and the client simply needs to submit many records in one request.

Important:

- native batch support currently covers create, not delete
- if you need batch deletion over HTTP today, use a custom route or keep the operation in application code on top of `resource.deleteMany()`
- if the endpoint orchestrates multiple resources or external systems, prefer a custom route instead of `resource.api.bulk.create`

Read:

- [Resource Policies](/plugins/api/guides/resource-policies.md#apibulkcreate)
- [Resource API Reference](/plugins/api/reference/resource-api.md#bulk)

## 🎯 Common Use Cases

### Multi-Tenant SaaS

```javascript
const projects = await db.createResource({
  name: 'projects',
  partitions: { byTenant: { fields: { tenantId: 'string' } } },
  guard: {
    list: (ctx) => {
      ctx.setPartition('byTenant', { tenantId: ctx.user.tenantId });
      return true;
    },
    create: (ctx) => {
      ctx.body.tenantId = ctx.user.tenantId;  // Auto-inject
      return true;
    }
  }
});
```

**Key wins:** O(1) tenant isolation • Zero SQL • Impossible to leak data
**[→ Full guide](/plugins/api/guides/guards.md#multi-tenancy)**

### Redirect Service

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    drivers: { oidc: {/*...*/}, basic: {/*...*/} },
    pathRules: [
      { path: '/admin/**', methods: ['oidc'], required: true },
      { path: '/api/**', methods: ['basic'], required: true },
      { path: '/r/**', required: false }  // Public redirects
    ]
  },
  failban: {
    enabled: true,
    geo: { blockedCountries: ['CN', 'RU'] }
  }
}));
```

**Key wins:** Dual auth • GeoIP blocking • Public + protected routes
**[→ Full guide](/plugins/api/guides/authentication.md#path-based-auth)**

### E-commerce API

```javascript
const orders = await db.createResource({
  name: 'orders',
  partitions: { byUser: { fields: { userId: 'string' } } },
  guard: {
    list: (ctx) => {
      if (!ctx.hasScope('admin')) {
        ctx.setPartition('byUser', { userId: ctx.user.sub });
      }
      return true;
    }
  }
});

// Event-driven inventory
apiPlugin.events.on('resource:created', async ({ resource, item }) => {
  if (resource === 'orders') {
    // Decrease stock...
  }
});
```

**Key wins:** User isolation • Admin override • Event-driven
**[→ Full guide](/plugins/api/guides/guards.md#e-commerce)**

---

## 🚀 Production Features

### Auto-Generated Endpoints

```bash
GET     /users           # List with cursor pagination (?limit=10&cursor=TOKEN or ?page=2)
POST    /users           # Create
GET     /users/:id       # Get by ID
PUT     /users/:id       # Update (full replace)
PATCH   /users/:id       # Update (partial merge)
DELETE  /users/:id       # Delete
HEAD    /users           # Count
OPTIONS /users           # Metadata

GET     /docs            # Interactive docs UI (Raffel USD)
GET     /openapi.json    # OpenAPI 3.1 spec
GET     /api.usd.json    # USD 1.0.0 spec
GET     /docs/openapi.json # OpenAPI 3.1 spec (docs alias)
GET     /docs/usd.json   # USD 1.0.0 spec (canonical path)
GET     /docs/usd.yaml   # USD 1.0.0 spec in YAML
GET     /health          # Health check
GET     /metrics         # Prometheus metrics
```

### Security Built-in

- **Failban:** Automatic IP banning after violations
- **GeoIP Blocking:** Block/allow by country (uses MaxMind GeoLite2)
- **Rate Limiting:** Per-route, per-user, per-IP
- **Security Headers:** CSP, HSTS, X-Frame-Options
- **CORS:** Configurable origins, credentials, preflight cache

### Observability

- **Real-time Metrics:** p50/p95/p99 latency, RPS, error rates
- **Event Hooks:** React to auth, CRUD, security events
- **Request Tracking:** Distributed tracing with Request ID
- **Session Tracking:** Encrypted cookies, visitor analytics

### Performance

- **JWT Token Cache:** 40-60% faster auth validation
- **Schema Cache:** 80-90% faster OpenAPI generation
- **HTTP Keep-Alive:** 20-30% latency reduction
- **Response Compression:** 70-85% bandwidth savings

### Lifecycle & Cleanup

- `ApiPlugin.stop()`/`uninstall()` shutdown path also disposes plugin internals (failban scheduler, rate-limiter stores, OIDC cleanup handlers).
- Prevents hidden timers/listeners between restarts and supports safe plugin lifecycle in long-running servers.

**[→ Performance guide](/plugins/api/guides/deployment.md#performance-tuning)**

---

## 📦 Installation

**Required:**
```bash
pnpm add s3db.js jose
```

**Optional (by feature):**
```bash
# OAuth2/OIDC
pnpm add openid-client

# GeoIP blocking
pnpm add @maxmind/geoip2-node

# Validation (custom routes)
pnpm add zod

# Standalone Raffel apps / low-level runtime integrations
pnpm add raffel
```

**Runtime note:** `ApiPlugin` runs on `Raffel`, and the examples/helpers in this guide assume the native Raffel request context.

---

## ❓ FAQ

<details>
<summary><strong>What makes this different from Express/Fastify?</strong></summary>

**Built on Raffel**, but gives you **instant REST APIs** from s3db.js resources. Zero boilerplate:

```javascript
// Traditional Express (100+ lines)
app.get('/users', auth, validate, async (req, res) => {/*...*/});
app.post('/users', auth, validate, async (req, res) => {/*...*/});
// ... repeat for PUT, PATCH, DELETE, error handling

// API Plugin (2 lines)
await db.createResource({ name: 'users', attributes: {/*...*/} });
await db.usePlugin(new ApiPlugin({ port: 3000 }));
```

You get: Auto CRUD • Auth • Guards • Metrics • Docs • Security
</details>

<details>
<summary><strong>Is this production-ready?</strong></summary>

**Yes!** Used in production with:
- ✅ Automatic IP banning (Failban + GeoIP)
- ✅ Rate limiting per route/user/IP
- ✅ Real-time metrics (p50/p95/p99)
- ✅ Kubernetes health probes
- ✅ Graceful shutdown
- ✅ Security headers (CSP, HSTS, etc)

**[→ Deployment guide](/plugins/api/guides/deployment.md)**
</details>

<details>
<summary><strong>Can I use Azure AD / Google / Keycloak?</strong></summary>

**Yes!** Works with any OAuth2/OIDC provider:

| Category | Providers |
|----------|-----------|
| **Enterprise** | Azure AD, Google Workspace, Okta |
| **Open Source** | Keycloak, Authentik, Authelia |
| **SaaS** | Auth0, AWS Cognito, FusionAuth |

```javascript
auth: {
  drivers: {
    oidc: {
      issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',  // Azure
      // issuer: 'https://accounts.google.com',  // Google
      // issuer: 'https://keycloak.example.com/realms/myrealm',  // Keycloak
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET
    }
  }
}
```

**[→ OIDC guide](/plugins/api/guides/oidc.md)**
</details>

<details>
<summary><strong>How do I implement multi-tenancy?</strong></summary>

Use **guards with partitions** for O(1) tenant isolation:

```javascript
guard: {
  list: (ctx) => {
    ctx.setPartition('byTenant', { tenantId: ctx.user.tenantId });
    return true;
  },
  create: (ctx) => {
    ctx.body.tenantId = ctx.user.tenantId;  // Auto-inject
    return true;
  }
}
```

**Benefits:** O(1) lookups • Zero SQL • Impossible to leak tenant data

**[→ Multi-tenancy guide](/plugins/api/guides/guards.md#multi-tenancy)**
</details>

<details>
<summary><strong>Can I add custom routes?</strong></summary>

**Yes!** Custom routes work alongside auto-generated ones:

```javascript
routes: {
  'GET /custom': async (c, ctx) => {
    const data = await ctx.resources.users.list();
    return ctx.response.success({ data });
  },
  'POST /webhook': async (c, ctx) => {
    const payload = await ctx.request.body();
    // Process webhook...
    return ctx.response.json({ received: true });
  }
}
```

**[→ Routing guide](/plugins/api/reference/routing.md)**
</details>

<details>
<summary><strong>How do I serve a React/Vue app?</strong></summary>

Use **static files** for SPAs:

```javascript
static: [{
  driver: 'filesystem',
  path: '/app',
  root: './build',
  config: { fallback: 'index.html' }  // Client-side routing
}]
```

**[→ Static files guide](/plugins/api/guides/static-files.md)**
</details>

<details>
<summary><strong>What's the performance like?</strong></summary>

**Production numbers:**
- p50 latency: ~20-50ms
- p95 latency: ~100-200ms
- p99 latency: ~300-500ms
- Handles 1000+ req/s per instance

**Runtime profile:** Raffel-based request handling, cached docs generation, and partition-aware resource access paths.

**[→ Performance benchmarks](/plugins/api/guides/deployment.md#performance-tuning)**
</details>

<details>
<summary><strong>How do I protect against brute force?</strong></summary>

Enable **Failban** for automatic IP banning:

```javascript
failban: {
  enabled: true,
  maxViolations: 3,        // Ban after 3 strikes
  banDuration: 86400000,   // 24 hours
  geo: {
    enabled: true,
    blockedCountries: ['CN', 'RU']  // Block by country
  }
}
```

**[→ Security guide](/plugins/api/guides/security.md)**
</details>

<details>
<summary><strong>Can I monitor API performance?</strong></summary>

**Yes!** Real-time metrics at `/metrics`:

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
  }
}
```

**[→ Deployment guide](/plugins/api/guides/deployment.md#prometheus-monitoring)**
</details>

<details>
<summary><strong>How do I deploy to Kubernetes?</strong></summary>

Built-in **health probes** for zero-downtime:

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
```

**[→ Kubernetes guide](/plugins/api/guides/deployment.md#kubernetes)**
</details>

**[→ See all FAQ](/plugins/api/faq.md)**

---

## 🎓 What's Next?

| If you want to... | Start here |
|-------------------|------------|
| 🚀 Build your first API | [Quick Start](#-quick-start) above |
| 🔐 Add authentication | [Authentication Guide](/plugins/api/guides/authentication.md) |
| 🛡️ Secure your data | [Guards Guide](/plugins/api/guides/guards.md) |
| 🌐 Use Google/Azure login | [OIDC Guide](/plugins/api/guides/oidc.md) |
| 📊 Monitor performance | [Deployment Guide](/plugins/api/guides/deployment.md) |
| 🐛 Troubleshoot issues | [FAQ](/plugins/api/faq.md) |

---

## 💬 Need Help?

- **📖 [FAQ](/plugins/api/faq.md)** - Common questions answered
- **🔍 [Documentation](#-documentation)** - All guides in one place
- **🎯 [Examples](/examples/)** - Copy-paste solutions
- **🐛 GitHub Issues** - Found a bug? Let us know!

---

> **⭐ Ready to build?** Start with one line of code, add features as you grow. Everything is opt-in, nothing is mandatory!
