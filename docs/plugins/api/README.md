# API Plugin

> **Transform s3db.js into a production-ready REST API in one line of code**

```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));
// REST API + Auth + Docs + Metrics running
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Auto-Generated CRUD](#auto-generated-crud)
- [Resource API (`resource.api`)](#resource-api)
  - [Guards](#guards)
  - [Views](#views)
  - [Protected Fields](#protected-fields)
  - [Write Policies](#write-policies)
  - [Bulk Create](#bulk-create)
  - [Resource Custom Routes](#resource-custom-routes)
- [Global Guards](#global-guards)
- [Authentication](#authentication)
  - [JWT](#jwt)
  - [Basic Auth](#basic-auth)
  - [API Keys](#api-keys)
  - [Header Secret](#header-secret)
  - [OIDC / OAuth2](#oidc--oauth2)
  - [Path-Based Auth](#path-based-auth)
  - [Registration](#registration)
- [Security](#security)
  - [Security Headers](#security-headers)
  - [Rate Limiting](#rate-limiting)
  - [Failban](#failban)
  - [GeoIP Blocking](#geoip-blocking)
- [Static Files & SPA](#static-files--spa)
- [Custom Routes (Plugin-Level)](#custom-routes-plugin-level)
- [OpenAPI Docs](#openapi-docs)
- [Listeners (Multi-Port / Multi-Protocol)](#listeners-multi-port--multi-protocol)
- [Observability](#observability)
  - [Metrics](#metrics)
  - [Health Checks](#health-checks)
  - [Request ID](#request-id)
  - [Logging](#logging)
- [Session Tracking](#session-tracking)
- [Compression](#compression)
- [Templates (SSR)](#templates-ssr)
- [URL Versioning](#url-versioning)
- [Base Path](#base-path)
- [Plugin Integrations](#plugin-integrations)
- [Inspection DX](#inspection-dx)
- [Installation](#installation)
- [Documentation Index](#documentation-index)

---

## Quick Start

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://bucket/db' });
await db.connect();

await db.createResource({
  name: 'users',
  attributes: { email: 'email|required', name: 'string|required' }
});

await db.usePlugin(new ApiPlugin({ port: 3000 }));
// API at http://localhost:3000, docs at http://localhost:3000/docs
```

---

## Auto-Generated CRUD

Every resource gets full REST endpoints automatically:

```
GET     /users           # List with cursor pagination (?limit=10&cursor=TOKEN or ?page=2)
POST    /users           # Create
GET     /users/:id       # Get by ID
PUT     /users/:id       # Update (full replace)
PATCH   /users/:id       # Update (partial merge)
DELETE  /users/:id       # Delete
HEAD    /users           # Count
OPTIONS /users           # Metadata
```

Request validation is automatic from your resource schema:

```javascript
await db.createResource({
  name: 'cars',
  attributes: {
    brand: 'string|required|minlength:2',
    model: 'string|required',
    year: 'number|required|min:1900|max:2025',
    price: 'number|required|min:0'
  }
});
// POST /cars with invalid data returns 400 with detailed validation errors
```

---

## Resource API

`resource.api` is where you define all API behavior for a resource: authorization, response shaping, mutability, batch operations, and custom routes.

```javascript
await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'email|required',
    role: 'string|optional',
    tokenHash: 'string|optional'
  },
  api: {
    description: 'User directory and profile endpoints',

    guard: {
      list: (ctx) => {
        ctx.setPartition('byTenant', { tenantId: ctx.user.tenantId });
        return true;
      },
      create: ['admin'],
      delete: ['admin']
    },

    protected: [
      'tokenHash',
      { path: 'metadata.internal', unlessRole: ['admin'] }
    ],

    views: {
      public: { auto: true, priority: 1, fields: ['id', 'name'] },
      admin: { auto: true, whenRole: ['admin'], priority: 100, fields: ['id', 'name', 'email', 'role'] }
    },

    write: {
      patch: [
        { whenRole: ['admin'], priority: 100, writable: ['name', 'email', 'role'] },
        { whenRole: ['user'], priority: 10, writable: ['name', 'email'], readonly: ['role'] }
      ]
    },

    bulk: {
      create: { maxItems: 100, mode: 'partial' }
    },

    'GET /summary': async (c, { resource }) => {
      const total = await resource.count();
      return c.json({ total });
    }
  }
});
```

### Guards

Declarative authorization rules for row-level security, multi-tenancy, and ownership checks.

**Multi-Tenant SaaS:**

```javascript
await db.createResource({
  name: 'projects',
  partitions: { byTenant: { fields: { tenantId: 'string' } } },
  api: {
    guard: {
      '*': (ctx) => {
        ctx.tenantId = ctx.user.tenantId;
        return !!ctx.tenantId;
      },
      list: (ctx) => {
        ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
        return true;
      },
      create: (ctx) => {
        ctx.body.tenantId = ctx.tenantId;
        return true;
      },
      update: (ctx, record) => record.userId === ctx.user.sub,
      delete: ['admin']
    }
  }
});
```

Guard types: functions, role arrays (`['admin']`), scope arrays, boolean, wildcard (`'*'`).

**[-> Guards Guide](/plugins/api/guides/guards.md)**

### Views

Audience-specific response projections:

```javascript
api: {
  views: {
    public: {
      auto: true, priority: 1,
      fields: ['id', 'name']
    },
    support: {
      auto: true, whenRole: ['support'], priority: 50,
      fields: ['id', 'name', 'email', 'status']
    },
    admin: {
      auto: true, whenRole: ['admin'], priority: 100,
      fields: ['id', 'name', 'email', 'role', 'tokenHash']
    }
  }
}
```

Views are auto-selected based on the actor's role, or explicit via `?view=admin`. Response includes `meta.view` when active.

**[-> Resource Policies Guide](/plugins/api/guides/resource-policies.md)**

### Protected Fields

Fields hidden from API responses:

```javascript
api: {
  protected: [
    'internalNotes',                                    // Always hidden
    { path: 'tokenHash', unlessRole: ['admin'] },       // Hidden unless admin
    { path: 'ssoToken', unlessScope: ['tokens:read'] }  // Hidden unless scope
  ]
}
```

Supports dot notation (`metadata.internal`). Applies to all CRUD responses, wins over view `fields`.

### Write Policies

Per-operation field mutability:

```javascript
api: {
  write: {
    patch: [
      { whenRole: ['admin'], priority: 100, writable: ['name', 'email', 'role'] },
      { whenRole: ['user'], priority: 10, writable: ['name', 'email'], readonly: ['role'] }
    ],
    create: {
      writable: ['name', 'email'],
      readonly: ['role']
    }
  }
}
```

Forbidden writes return `400 FIELD_WRITE_NOT_ALLOWED`.

Global fallbacks: `writable: ['name', 'email']` and `readonly: ['role']` at the `api` root level.

**[-> Resource API Reference](/plugins/api/reference/resource-api.md)**

### Bulk Create

Native batch endpoint via `POST /users/bulk`:

```javascript
api: {
  bulk: {
    create: {
      path: '/bulk',
      maxItems: 100,
      mode: 'partial'  // or 'all-or-nothing'
    }
  }
}
```

Each item goes through `guard.create`, `write.create`, validation, and response shaping. Returns `201` (all success), `207` (mixed), or `400` (malformed).

### Resource Custom Routes

Colocate custom routes with the resource:

```javascript
api: {
  'GET /summary': async (c, { resource }) => {
    return c.json({ total: await resource.count() });
  },
  'POST /:id/activate': async (c, { resource }) => {
    const { id } = c.req.param();
    await resource.update(id, { active: true });
    return c.json({ id, active: true });
  }
}
```

Custom routes do not inherit `views`/`protected`/`write` -- apply them explicitly if needed.

**[-> Routing Reference](/plugins/api/reference/routing.md)**

---

## Global Guards

Apply authorization rules across ALL resources at the plugin level:

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  guards: {
    '*': (ctx) => {
      ctx.tenantId = ctx.user?.tenantId;
      return !!ctx.tenantId;
    },
    list: (ctx) => {
      ctx.setPartition('byTenant', { tenantId: ctx.tenantId });
      return true;
    },
    create: (ctx) => {
      ctx.data.tenantId = ctx.tenantId;
      return true;
    },
    delete: ['admin']
  }
}));
```

**Precedence:** `resource.api.guard` > `plugin guards` > no guard (public).

Resources can override global guards:

```javascript
await db.createResource({
  name: 'public_articles',
  api: {
    guard: { list: true, get: true }  // Override: public access
  }
});
```

**[-> Guards Guide](/plugins/api/guides/guards.md#global-guards)**

---

## Authentication

### JWT

```javascript
await db.usePlugin(new ApiPlugin({
  auth: {
    resource: 'users',
    drivers: { jwt: { secret: process.env.JWT_SECRET, lookupById: true } },
    pathRules: [{ path: '/api/**', methods: ['jwt'], required: true }]
  }
}));
```

Features: token caching (40-60% faster), configurable expiration, auto login/register endpoints.

### Basic Auth

```javascript
auth: {
  drivers: { basic: { realm: 'API Access', lookupById: true } },
  pathRules: [{ path: '/api/**', methods: ['basic'], required: true }]
}
```

### API Keys

```javascript
auth: {
  drivers: { apikey: { headerName: 'X-API-Key', lookupById: true } },
  pathRules: [{ path: '/api/**', methods: ['apikey'], required: true }]
}
```

### Header Secret

For admin apps and server-to-server calls:

```javascript
auth: {
  createResource: false,
  drivers: [{
    driver: 'header-secret',
    config: {
      headerName: 'x-admin-secret',
      secret: process.env.ADMIN_SECRET,
      roles: ['admin'],
      serviceAccount: { clientId: 'admin-ui', name: 'Admin UI' }
    }
  }],
  pathRules: [{ path: '/users/**', methods: ['header-secret'], required: true }]
}
```

### OIDC / OAuth2

Works with any provider (Google, Azure AD, Keycloak, Auth0, Cognito):

```javascript
auth: {
  drivers: {
    oidc: {
      issuer: 'https://accounts.google.com',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: 'http://localhost:3000/auth/callback',
      cookieSecret: process.env.COOKIE_SECRET,
      autoRefreshTokens: true,
      cookieDomain: '.example.com'
    }
  }
}
```

Provider presets simplify config:

```javascript
// Azure AD
oidc: { provider: 'azure', tenantId: '...', clientId: '...', clientSecret: '...' }

// Keycloak
oidc: { issuer: 'https://kc.example.com/realms/myrealm', clientId: '...', clientSecret: '...' }
```

**[-> OIDC Guide](/plugins/api/guides/oidc.md)** | **[-> Authentication Guide](/plugins/api/guides/authentication.md)**

### Path-Based Auth

Mix multiple auth methods per route:

```javascript
auth: {
  drivers: {
    oidc: { /* Azure AD for admin */ },
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

### Registration

```javascript
auth: {
  drivers: { jwt: { secret: '...' } },
  registration: {
    enabled: true,
    allowedFields: ['name', 'company'],
    defaultRole: 'user'
  }
}
```

Exposes `POST /auth/register` with immediate JWT token on success.

---

## Security

### Security Headers

Enabled by default: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

```javascript
security: {
  enabled: true,
  hsts: { maxAge: 63072000, preload: true },
  xFrameOptions: 'SAMEORIGIN',
  csp: "default-src 'self'; script-src 'self' https://cdn.example.com"
}
```

### Rate Limiting

Global and per-path rate limiting:

```javascript
rateLimit: {
  enabled: true,
  windowMs: 60_000,
  maxRequests: 200,
  rules: [
    { path: '/auth/login', key: 'ip', maxRequests: 10 },
    { path: '/api/**', key: 'user', maxRequests: 100 }
  ]
}
```

Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

### Failban

Auto-ban IPs after security violations:

```javascript
failban: {
  enabled: true,
  maxViolations: 3,
  banDuration: 86_400_000,
  whitelist: ['127.0.0.1'],
  persistViolations: true
}
```

Admin endpoints: `GET /_admin/failban/bans`, `POST /_admin/failban/bans`, `DELETE /_admin/failban/bans/:ip`, `GET /_admin/failban/stats`.

### GeoIP Blocking

Block or allow by country using MaxMind GeoLite2:

```javascript
failban: {
  enabled: true,
  geo: {
    enabled: true,
    databasePath: './GeoLite2-Country.mmdb',
    blockedCountries: ['CN', 'RU']
  }
}
```

**[-> Security Guide](/plugins/api/guides/security.md)**

---

## Static Files & SPA

Serve React/Vue/Angular apps and static assets:

```javascript
static: [{
  driver: 'filesystem',
  path: '/',
  root: './webapp',
  config: {
    fallback: 'index.html',
    fallbackIgnore: ['/api', '/ws', '/auth']
  }
}]
```

S3 driver for user-uploaded content:

```javascript
static: [{
  driver: 's3',
  path: '/files',
  bucket: 'my-bucket',
  prefix: 'uploads/',
  config: { streaming: true, signedUrlExpiry: 3600 }
}]
```

**[-> Static Files Guide](/plugins/api/guides/static-files.md)**

---

## Custom Routes (Plugin-Level)

Global endpoints alongside auto-generated resource routes:

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  routes: {
    'GET /stats': async (c, ctx) => {
      const total = await ctx.services.resources.users.count();
      return ctx.success({ total });
    },
    'POST /webhook': async (c) => {
      const payload = await c.req.json();
      return c.json({ received: true });
    }
  }
}));
```

Route handlers receive `(c, ctx)` where `ctx` provides `auth`, `input`, `services`, `logger`, `requestId`, and response helpers.

**[-> Route Context Reference](/plugins/api/reference/route-context.md)** | **[-> Routing Reference](/plugins/api/reference/routing.md)**

---

## OpenAPI Docs

Auto-generated interactive docs at `/docs`, OpenAPI 3.1 spec at `/openapi.json`, USD spec at `/api.usd.json`:

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  docs: {
    enabled: true,
    title: 'My API',
    version: '2.0.0',
    description: 'Full API documentation',
    uiTheme: 'dark',
    tryItOut: true,
    codeGeneration: true
  }
}));
```

Resource descriptions flow into the docs:

```javascript
api: { description: 'Order management with multi-tenant isolation' }
```

**[-> OpenAPI Guide](/plugins/api/guides/openapi.md)**

---

## Listeners (Multi-Port / Multi-Protocol)

Run multiple protocols on the same or different ports:

```javascript
await db.usePlugin(new ApiPlugin({
  listeners: [
    {
      name: 'public-http',
      bind: { host: '0.0.0.0', port: 3000 },
      protocols: {
        http: { enabled: true },
        websocket: { enabled: true, path: '/ws' },
        udp: { enabled: true }
      }
    },
    {
      name: 'raw-tcp',
      bind: { host: '0.0.0.0', port: 4000 },
      protocols: { tcp: { enabled: true } }
    }
  ]
}));
```

---

## Observability

### Metrics

Real-time metrics at `/metrics`:

```javascript
metrics: { enabled: true, format: 'json' }  // or 'prometheus'
```

```json
{
  "requests": { "total": 12543, "rps": "3.48", "duration": { "p50": 23, "p95": 156, "p99": 342 } },
  "auth": { "successRate": "94.44%", "byMethod": { "oidc": 145, "jwt": 76 } }
}
```

### Health Checks

Built-in Kubernetes-ready probes:

```javascript
health: { enabled: true }
```

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
```

### Request ID

Distributed tracing via `X-Request-ID` header:

```javascript
requestId: { enabled: true, headerName: 'X-Request-ID', includeInResponse: true }
```

### Logging

Request logging with customizable format and filtering:

```javascript
logging: {
  enabled: true,
  format: ':verb :url => :status (:elapsed ms)',
  colorize: true,
  excludePaths: ['/health/**', '/metrics'],
  filter: ({ duration }) => duration > 100  // Log only slow requests
}
```

---

## Session Tracking

Encrypted cookie-based session tracking with optional DB persistence:

```javascript
sessionTracking: {
  enabled: true,
  passphrase: process.env.SESSION_SECRET,
  cookieName: 'session_id',
  cookieMaxAge: 30 * 24 * 60 * 60 * 1000,
  cookieSecure: process.env.NODE_ENV === 'production',
  resource: 'sessions'
}
```

---

## Compression

Response compression with gzip/deflate:

```javascript
compression: { enabled: true, threshold: 1024, level: 6 }
```

---

## Templates (SSR)

Server-side rendering with JSX, EJS, or custom engines:

```javascript
templates: {
  enabled: true,
  engine: 'jsx',
  templatesDir: './views',
  layout: 'layout'
}
```

---

## URL Versioning

Version-prefixed endpoints from resource names:

```javascript
await db.createResource({ name: 'users_v1', attributes: { name: 'string' } });
await db.createResource({ name: 'users_v2', attributes: { name: 'string', phone: 'string' } });

await db.usePlugin(new ApiPlugin({ port: 3000, versionPrefix: true }));
// GET /v1/users  ->  users_v1
// GET /v2/users  ->  users_v2
```

---

## Base Path

Mount the entire API under a prefix:

```javascript
await db.usePlugin(new ApiPlugin({ port: 3000, basePath: '/api' }));
// GET /api/users, GET /api/docs, etc.
```

Combines with `versionPrefix`: `basePath: '/api'` + `versionPrefix: true` = `/api/v1/users`.

---

## Plugin Integrations

### RelationPlugin

Install before ApiPlugin to get `?populate=` on all GET endpoints:

```javascript
await db.usePlugin(new RelationPlugin({ relations: { /* ... */ } }));
await db.usePlugin(new ApiPlugin({ port: 3000 }));
// GET /orders?populate=customer,items.product
```

### AuditPlugin

Expose audit trail via REST:

```javascript
resources: { plg_audits: { methods: ['GET'] } }
```

### Other Plugins

Plugin internal resources (`plg_*`) are hidden by default. Opt-in via `resources` config to expose them.

**[-> Plugin Integrations Guide](/plugins/api/guides/integrations.md)**

---

## Inspection DX

Inspect your API surface without live traffic:

```javascript
const api = new ApiPlugin({ port: 3000, auth: { /* ... */ } });
await db.usePlugin(api);

const preview = await api.previewRuntime();      // Route plan as structured data
const doctor = await api.doctor();               // Diagnostics
const contractTests = await api.contractTests(); // Generated auth/input regression checks
```

---

## Installation

**Required:**
```bash
pnpm add s3db.js jose
```

**Optional (by feature):**
```bash
pnpm add openid-client          # OAuth2/OIDC
pnpm add @maxmind/geoip2-node   # GeoIP blocking
pnpm add zod                    # Validation (custom routes)
pnpm add raffel                 # Standalone Raffel apps
```

**Runtime:** ApiPlugin runs on Raffel.

---

## Documentation Index

### Guides

| Guide | Description |
|-------|-------------|
| **[Authentication](/plugins/api/guides/authentication.md)** | JWT, OAuth2/OIDC, API Keys, Basic Auth, Header Secret |
| **[Guards](/plugins/api/guides/guards.md)** | Row-level security, multi-tenancy, RBAC |
| **[Resource Policies](/plugins/api/guides/resource-policies.md)** | Views, protected fields, per-operation mutability |
| **[Authorization Patterns](/plugins/api/guides/authorization-patterns.md)** | RBAC, ABAC, scopes, multi-tenancy patterns |
| **[OIDC Guide](/plugins/api/guides/oidc.md)** | Complete OAuth2/OIDC setup (Google, Azure, Keycloak) |
| **[Security](/plugins/api/guides/security.md)** | Failban, rate limiting, GeoIP blocking |
| **[Static Files](/plugins/api/guides/static-files.md)** | Serve SPAs, assets, filesystem/S3 drivers |
| **[Identity Integration](/plugins/api/guides/identity.md)** | Delegate auth to IdentityPlugin |
| **[Deployment](/plugins/api/guides/deployment.md)** | Docker, Kubernetes, production tips |
| **[OpenAPI Docs](/plugins/api/guides/openapi.md)** | Customize docs UI, add descriptions |
| **[Plugin Integrations](/plugins/api/guides/integrations.md)** | Expose AuditPlugin, Metrics, Cloud Inventory |

### Reference

| Document | Description |
|----------|-------------|
| **[Configuration](/plugins/api/reference/configuration.md)** | All config options (alphabetical) |
| **[Resource API](/plugins/api/reference/resource-api.md)** | Exact `resource.api` keys, precedence, custom routes |
| **[Route Context](/plugins/api/reference/route-context.md)** | Request, auth, validation, response helpers |
| **[Routing](/plugins/api/reference/routing.md)** | Custom routes, precedence, path rules |
| **[FAQ](/plugins/api/faq.md)** | Common questions and troubleshooting |

### Examples

| Example | Description |
|---------|-------------|
| [e50-oidc-simple.js](/examples/e50-oidc-simple.js) | Basic OIDC with Google |
| [e88-oidc-enhancements.js](/examples/e88-oidc-enhancements.js) | Complete OIDC enhancements |
| [e101-path-based-basic-oidc.js](/examples/e101-path-based-basic-oidc.js) | Dual auth (Basic + OIDC) |
| [e66-guards-live.js](/examples/e66-guards-live.js) | Complete guards example |
| [e65-guards-comparison.js](/examples/e65-guards-comparison.js) | Before/after guards comparison |
