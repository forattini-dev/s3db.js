# 🌐 API Plugin

> **Transform s3db.js into a production-ready REST API in one line of code.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration →](./api/configuration.md) | [Authentication →](./api/authentication.md) | [Guards →](./api/guards.md) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));  // That's it!
```

> 🧩 **Namespaces**: Provide `namespace: 'public-api'` (or pass an alias to `db.usePlugin`) to isolate this plugin's internal resources—Failban bans/violations will be stored under `plg_public-api_*`.

**You get instantly:**
- ✅ Auto-generated REST endpoints (GET/POST/PUT/PATCH/DELETE)
- ✅ Interactive Swagger UI at `/docs`
- ✅ Multiple auth methods (JWT, OAuth2/OIDC, API Keys, Basic)
- ✅ Enterprise security (rate limiting, IP banning, GeoIP blocking)
- ✅ Relationship hydration via `?populate=` (with RelationPlugin)
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
await db.usePlugin(new ApiPlugin({ port: 3000 }));

// ✨ API running at http://localhost:3000
```

### Populate relationships (RelationPlugin)

Install the [RelationPlugin](./relation.md) before the API plugin to expose relational data effortlessly:

```javascript
await db.usePlugin(new RelationPlugin({ relations: {/* ... */} }));
await db.usePlugin(new ApiPlugin({ port: 3000 }));
```

Any resource can now hydrate related records with a single query parameter:

```http
GET /orders?populate=customer,items.product
```

- `populate=customer` hydrates the belongsTo relation.
- `populate=items.product` hydrates nested relations (`items` and each item's `product`).
- Invalid relation names return `400 INVALID_POPULATE` with detailed errors.

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

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**Peer Dependencies (for ApiPlugin):**

This plugin requires the Hono web framework and related packages:

```bash
pnpm install hono @hono/node-server @hono/swagger-ui jose
```

**Individual packages:**
- `hono` - Fast, lightweight web framework (~50KB core, 3-12x faster than Express)
- `@hono/node-server` - Node.js adapter for Hono
- `@hono/swagger-ui` - Interactive API documentation at `/docs`
- `jose` - JWT/OIDC token validation (JOSE standard implementation)

**Optional Dependencies (By Feature):**

**Authentication Drivers:**
```bash
# OAuth2/OIDC support (Azure AD, Keycloak, Google, etc.)
pnpm install openid-client

# Session tracking with encryption
# (No additional packages needed - uses Node.js built-in crypto)
```

**Validation & Rate Limiting (Custom Routes):**
```bash
# Zod validation with @hono/zod-validator
pnpm install zod @hono/zod-validator

# Rate limiting for custom endpoints
pnpm install hono-rate-limiter
```

**Security Features:**
```bash
# GeoIP country blocking
pnpm install @maxmind/geoip2-node

# Download GeoLite2 database (free)
wget https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-Country.mmdb
```

**Static File Serving:**
```bash
# S3-based static assets (alternative to filesystem)
# (Uses same AWS SDK as s3db.js core - already included)
```

**Why Peer Dependencies?**

ApiPlugin uses peer dependencies to:
- ✅ Keep core s3db.js lightweight (~500KB)
- ✅ Allow version flexibility (you control Hono/jose versions)
- ✅ Prevent dependency conflicts in monorepos
- ✅ Enable tree-shaking (only bundle what you use)

**Minimum Node.js Version:** 18.x (for native fetch, Web Streams)

---

## 📑 Table of Contents

- [TL;DR](#-tldr)
- [Quick Start](#-quick-start)
- [Dependencies](#-dependencies)
- [Documentation Hub](#-documentation-hub)
- [Context Access Patterns](#-context-access-patterns)
- [Quick Wins](#-quick-wins)
- [Real-World Examples](#-real-world-examples)
- [Killer Features](#-killer-features)
- [Configuration](#-configuration)
- [Endpoints](#-endpoints)
- [Integrations](./api/integrations.md)
- [⚡ Performance Optimizations](#-performance-optimizations)
- [FAQ](#-faq)

---

## 📚 Documentation Hub

**Core Guides** - Essential features and setup:

| Guide | What's Inside | When to Read |
|-------|---------------|--------------|
| **[🔐 Authentication](./api/authentication.md)** | JWT, OAuth2/OIDC, API Keys, Basic Auth | Setting up user authentication |
| **[🛡️ Guards & Authorization](./api/guards.md)** | Row-level security, multi-tenancy, RBAC | Controlling access to data |
| **[🔒 Security](./api/security.md)** | Failban, rate limiting, GeoIP blocking, CSP headers | Protecting your API |
| **[🔌 Integrations](./api/integrations.md)** | RelationPlugin populate, Cloud/Kubernetes inventory exposure | Serving data from other plugins |
| **[📝 OpenAPI & Swagger UI](./api/openapi-docs.md)** | Add descriptions, customize docs, best practices | Creating beautiful API documentation |
| **[📊 Observability](./api/observability.md)** | Metrics, events, tracing, health checks | Monitoring production APIs |
| **[📦 Static Files](./api/static-files.md)** | Serve SPAs (React/Vue/Angular) and assets | Building full-stack apps |
| **[🚀 Deployment](./api/deployment.md)** | Docker, Kubernetes, zero-downtime deploys | Going to production |

**Advanced Topics**:

| Topic | What You'll Learn |
|-------|-------------------|
| **[Authorization Patterns](./api/authorization-patterns.md)** | Granular scopes, ABAC, hierarchical permissions |
| **[Configuration Deep Dive](./api/configuration.md)** | All configuration options explained |

---

## 🔌 Context Access Patterns

The API Plugin provides **3 ways** to access database and resources in custom routes. Understanding these patterns is crucial for writing clean, maintainable code.

### 1. Enhanced Context (Recommended ✅)

**Best for:** Custom routes, guards, resource-level routes

The enhanced context provides the cleanest developer experience with automatic context injection and helpful utilities.

```javascript
routes: {
  '/urls/:id': async (c, ctx) => {
    // ✅ Clean access to everything
    const { db, resources, validator, user, session } = ctx;

    // ✅ Resource access with Proxy validation
    const url = await resources.urls_v1.get(ctx.param('id'));

    // ✅ Validation helpers
    const { valid, errors } = await ctx.validator.validateBody('urls_v1');
    if (!valid) return ctx.error(errors[0].message, 400);

    // ✅ Response shortcuts
    return ctx.success({ url });
  }
}
```

**Key Features:**
- **Resource Proxy**: Automatic validation and helpful error messages when accessing non-existent resources
- **Request Helpers**: `ctx.param()`, `ctx.query()`, `ctx.body()`, `ctx.header()`
- **Response Helpers**: `ctx.success()`, `ctx.error()`, `ctx.notFound()`, `ctx.unauthorized()`, `ctx.forbidden()`
- **Validator Helpers**: `ctx.validator.validate()`, `ctx.validator.validateBody()`, `ctx.validator.validateOrThrow()`
- **Auth Helpers**: `ctx.user`, `ctx.session`, `ctx.isAuthenticated`, `ctx.hasScope()`, `ctx.requireAuth()`
- **Partition Helpers**: `ctx.setPartition()` for tenant isolation in guards
- **Template Rendering**: `ctx.render()` if template engine is configured

**Auto-Detection Magic:** If your handler has **2 parameters** `(c, ctx)`, the enhanced context is **automatically injected**! No wrapper function needed.

```javascript
// ✨ This automatically gets enhanced context:
async (c, ctx) => {
  // ctx is fully populated with all helpers
}

// ⚠️ This uses legacy behavior:
async (c) => {
  // Must manually access context via c.get()
}
```

---

### 2. Context Injection (Direct Access)

**Best for:** Simple routes, middleware, when you prefer minimal abstraction

Resources and database are injected directly into the Hono context for lightweight access.

```javascript
routes: {
  '/health': async (c) => {
    // Direct access via c.get()
    const db = c.get('db');
    const urls = c.get('urls_v1');  // Direct resource access

    const count = await urls.count();
    return c.json({ healthy: true, urls: count });
  }
}
```

**Key Features:**
- **Direct Resource Access**: `c.get('resourceName')` for each resource
- **Database Access**: `c.get('db')` or `c.get('database')`
- **Lighter Weight**: No abstraction layer, direct Hono context usage
- **Prefixed Access**: `c.get('resource:resourceName')` also works

**How it Works:**

The `context-injection.js` middleware automatically injects all resources:

```javascript
// Automatic injection (happens behind the scenes):
c.set('db', database);
c.set('database', database);

// Each resource is injected
c.set('urls_v1', urlsResource);
c.set('resource:urls_v1', urlsResource);
```

---

### 3. withContext Helper (Destructuring)

**Best for:** When you prefer explicit context extraction with destructuring

Import the `withContext` helper for clean destructuring syntax.

```javascript
import { withContext } from 's3db.js/plugins/api';

routes: {
  '/custom': withContext(async (c, { db, resources }) => {
    // Destructure exactly what you need
    const { urls_v1, clicks_v1 } = resources;

    const urls = await urls_v1.list();
    const clicks = await clicks_v1.query({ urlId: urls[0]?.id });

    return c.json({ urls, clicks });
  })
}
```

**Key Features:**
- **Explicit Wrapper**: You control when context is extracted
- **Resource Proxy**: Same helpful error messages as enhanced context
- **Destructuring**: Clean syntax for extracting only what you need
- **Fallback Support**: Works with both context injection and legacy systems

**How it Works:**

```javascript
// withContext extracts helpers for you:
{
  db: database,              // Database instance
  database: database,        // Alias
  resources: Proxy {         // Proxy with validation
    urls_v1: Resource,
    clicks_v1: Resource,
    // ... all resources
  }
}
```

---

### Comparison Table

| Feature | Enhanced Context | Context Injection | withContext |
|---------|------------------|-------------------|-------------|
| **Auto-injection** | ✅ Yes (2 params) | ❌ No | ❌ No (explicit wrap) |
| **Resource Proxy** | ✅ Yes | ❌ No | ✅ Yes |
| **Request Helpers** | ✅ ctx.param() | ❌ c.req.param() | ❌ c.req.param() |
| **Response Helpers** | ✅ ctx.success() | ❌ c.json() | ❌ c.json() |
| **Validator Helpers** | ✅ ctx.validator | ❌ Manual | ❌ Manual |
| **Auth Helpers** | ✅ ctx.hasScope() | ⚠️ c.get('user') | ⚠️ Manual |
| **Partition Helpers** | ✅ ctx.setPartition() | ❌ Manual | ❌ Manual |
| **Best For** | Custom routes, Guards | Simple routes | Explicit control |
| **Code Style** | Modern, clean | Traditional | Functional |

---

### Migration Guide: Legacy → Enhanced

Upgrading from the old verbose context access pattern is simple:

```javascript
// ❌ OLD WAY (Legacy - Verbose)
routes: {
  '/:id': async (c) => {
    // Manual context extraction
    const ctx = c.get('customRouteContext');
    const { database } = ctx;

    // Verbose resource access
    const url = await database.resources.urls_v1.get(c.req.param('id'));

    // Manual response
    return c.json({ success: true, data: { url } });
  }
}

// ✅ NEW WAY (Enhanced - Clean)
routes: {
  '/:id': async (c, ctx) => {
    // Auto-injected context (note the 2nd parameter!)
    const url = await ctx.resources.urls_v1.get(ctx.param('id'));

    // Helper response methods
    return ctx.success({ url });
  }
}
```

**Step-by-step migration:**

1. **Add `ctx` as second parameter** → Triggers auto-wrapping
2. **Replace `c.get('customRouteContext')` with `ctx`**
3. **Use `ctx.resources.xxx`** instead of `database.resources.xxx`
4. **Use `ctx.param()`** instead of `c.req.param()`
5. **Use `ctx.success()`** instead of `c.json({ success: true, data })`
6. **Use `ctx.error()`** instead of manual error responses

**Benefits:**
- ✅ 50% less code
- ✅ Better error messages (resource proxy)
- ✅ Type-safe helpers
- ✅ Consistent API across routes

---

### Auto-Wrapping Behavior

**How the API Plugin detects which context system to use:**

The plugin automatically inspects your handler's **function signature** (number of parameters):

```javascript
// 1 parameter (c) → Legacy behavior (no auto-wrap)
routes: {
  '/legacy': async (c) => {
    // Must manually access context
    const db = c.get('db');
    const urls = c.get('urls_v1');
  }
}

// 2 parameters (c, ctx) → Enhanced context (auto-wrap)
routes: {
  '/enhanced': async (c, ctx) => {
    // ctx is automatically populated with enhanced context!
    const { resources } = ctx;
  }
}
```

**Technical Details:**

The auto-wrapping happens in `custom-routes.js`:

```javascript
// If handler expects 2 arguments → auto-wrap with RouteContext
if (handler.length === 2) {
  return await withContext(handler, { resource: context.resource })(c);
}
// If handler expects 1 argument → use legacy behavior
else {
  return await handler(c);
}
```

**Why this matters:**
- ✅ **Backward Compatibility**: Existing routes keep working
- ✅ **Opt-in Enhancement**: Add `ctx` parameter to upgrade
- ✅ **Zero Configuration**: No wrapper imports needed
- ✅ **Type Safety**: TypeScript can infer the correct types

---

### Guards and Enhanced Context

Guards receive the **same enhanced context** for authorization logic:

```javascript
const projects = await db.createResource({
  name: 'projects',
  attributes: { /* ... */ },
  partitions: {
    byTenant: { fields: { tenantId: 'string' } }
  },

  guard: {
    // Guards receive enhanced context (ctx)
    list: (ctx) => {
      // ✅ Access user from context
      if (ctx.user?.scopes?.includes('admin')) {
        return true; // Admins see everything
      }

      // ✅ Use partition helpers for O(1) tenant isolation
      ctx.setPartition('byTenant', { tenantId: ctx.user.tenantId });
      return true;
    },

    create: (ctx) => {
      // ✅ Auto-inject tenant from user context
      ctx.body.tenantId = ctx.user.tenantId;
      ctx.body.ownerId = ctx.user.sub;
      return true;
    },

    update: (ctx, record) => {
      // ✅ Authorization with scope helpers
      return ctx.hasScope('admin') || record.ownerId === ctx.user.sub;
    }
  }
});
```

**Guard Context API:**
- `ctx.user` - Authenticated user object
- `ctx.hasScope(scope)` - Check user scopes
- `ctx.setPartition(name, fields)` - Filter queries by partition (O(1) isolation)
- `ctx.body` - Request body (for create/update guards)
- `ctx.isAuthenticated` - Boolean auth check

---

### RouteContext API Reference

When using enhanced context `(c, ctx)`, you have access to:

#### Request Properties
- `ctx.c` - Raw Hono context
- `ctx.db` / `ctx.database` - Database instance
- `ctx.resources` - Proxy to all resources (with validation)
- `ctx.resource` - Current resource (for resource-level routes)
- `ctx.user` - Authenticated user (if auth enabled)
- `ctx.session` - Session object (if session tracking enabled)
- `ctx.sessionId` - Session ID
- `ctx.requestId` - Request ID
- `ctx.isAuthenticated` - Boolean auth status

#### Request Helpers
- `ctx.param(name)` - Get path parameter
- `ctx.params()` - Get all path parameters
- `ctx.query(name)` - Get query parameter
- `ctx.queries()` - Get all query parameters
- `ctx.header(name)` - Get request header
- `ctx.body()` - Parse JSON body (Promise)
- `ctx.text()` - Get body as text (Promise)
- `ctx.formData()` - Get FormData (Promise)

#### Response Helpers
- `ctx.json(data, status?)` - JSON response
- `ctx.success(data, status?)` - Success response `{ success: true, data }`
- `ctx.error(message, status?)` - Error response `{ success: false, error }`
- `ctx.notFound(message?)` - 404 response
- `ctx.unauthorized(message?)` - 401 response
- `ctx.forbidden(message?)` - 403 response
- `ctx.html(html, status?)` - HTML response
- `ctx.redirect(url, status?)` - Redirect response
- `ctx.render(template, data, opts?)` - Render template (if configured)

#### Validator Helpers
- `ctx.validator.validate(data)` - Validate against current resource schema
- `ctx.validator.validate(resourceName, data)` - Validate against specific resource
- `ctx.validator.validateOrThrow(data)` - Validate and throw on error
- `ctx.validator.validateBody(resourceName?)` - Validate request body

#### Auth Helpers
- `ctx.hasScope(scope)` - Check if user has scope
- `ctx.hasAnyScope(...scopes)` - Check if user has any scope
- `ctx.hasAllScopes(...scopes)` - Check if user has all scopes
- `ctx.requireAuth()` - Throw 401 if not authenticated
- `ctx.requireScope(scope)` - Throw 403 if scope missing

#### Partition Helpers (for Guards)
- `ctx.setPartition(name, fields)` - Set partition filter for tenant isolation
- `ctx.getPartitionFilters()` - Get active partition filters (internal)
- `ctx.clearPartitionFilters()` - Clear partition filters (internal)
- `ctx.hasPartitionFilters()` - Check if partitions are set

---

### Best Practices

#### ✅ DO: Use Enhanced Context for Custom Routes

```javascript
routes: {
  '/analytics/:userId': async (c, ctx) => {
    // Clean, readable, maintainable
    const userId = ctx.param('userId');
    const clicks = await ctx.resources.clicks.query({ userId });
    return ctx.success({ clicks });
  }
}
```

#### ✅ DO: Use Partition Helpers in Guards

```javascript
guard: {
  list: (ctx) => {
    // O(1) tenant isolation with partitions
    ctx.setPartition('byTenant', { tenantId: ctx.user.tenantId });
    return true;
  }
}
```

#### ✅ DO: Leverage Validator Helpers

```javascript
routes: {
  'POST /urls': async (c, ctx) => {
    // Automatic validation against schema
    const { valid, errors, data } = await ctx.validator.validateBody('urls_v1');
    if (!valid) return ctx.error(errors[0].message, 400);

    const url = await ctx.resources.urls_v1.insert(data);
    return ctx.success({ url }, 201);
  }
}
```

#### ❌ DON'T: Mix Context Systems

```javascript
// ❌ BAD: Mixing enhanced context and manual access
routes: {
  '/:id': async (c, ctx) => {
    const db = c.get('db');  // ❌ Unnecessary, use ctx.db
    const url = await ctx.resources.urls.get(c.req.param('id'));  // ❌ Use ctx.param('id')
  }
}

// ✅ GOOD: Consistent enhanced context usage
routes: {
  '/:id': async (c, ctx) => {
    const url = await ctx.resources.urls.get(ctx.param('id'));
    return ctx.success({ url });
  }
}
```

#### ❌ DON'T: Use Legacy customRouteContext

```javascript
// ❌ BAD: Legacy verbose pattern
routes: {
  '/:id': async (c) => {
    const { database } = c.get('customRouteContext');
    const url = await database.resources.urls.get(c.req.param('id'));
  }
}

// ✅ GOOD: Enhanced context
routes: {
  '/:id': async (c, ctx) => {
    const url = await ctx.resources.urls.get(ctx.param('id'));
    return ctx.success({ url });
  }
}
```

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

await db.usePlugin(new ApiPlugin({ port: 3000 }));
// ✨ API running at http://localhost:3000
```

### Add Authentication (JWT)

```javascript
await db.usePlugin(new ApiPlugin({
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
await db.usePlugin(new ApiPlugin({
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
await db.usePlugin(new ApiPlugin({
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
await db.usePlugin(new ApiPlugin({
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
    'GET /r/:id': async (c, ctx) => {
      // ✨ Enhanced context with 2 parameters
      const url = await ctx.resources.urls.get(ctx.param('id'));
      if (!url) return ctx.notFound();

      // Track click asynchronously
      ctx.resources.clicks.insert({
        shortId: url.id,
        ip: ctx.header('x-forwarded-for'),
        country: ctx.header('cf-ipcountry')
      });

      return ctx.redirect(url.target, 302);
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
      if (!ctx.hasScope('admin')) {
        ctx.setPartition('byUser', { userId: ctx.user.sub });
      }
      return true;
    },
    create: (ctx) => {
      // Auto-inject userId from authenticated user
      ctx.body.userId = ctx.user.sub;
      return true;
    }
  }
});

// Custom route for checkout with validation
await db.usePlugin(new ApiPlugin({
  routes: {
    'POST /checkout': async (c, ctx) => {
      // ✅ Validate cart items
      const { valid, errors, data } = await ctx.validator.validateBody('orders');
      if (!valid) return ctx.error(errors[0].message, 400);

      // ✅ Create order
      const order = await ctx.resources.orders.insert(data);

      return ctx.success({ order, message: 'Order created!' }, 201);
    }
  }
}));

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
await db.usePlugin(new ApiPlugin({
  port: 3000,
  verbose: true
}));
```

### Production-Ready

```javascript
await db.usePlugin(new ApiPlugin({
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
    resourceNames: {
      bans: 'plg_security_bans',
      violations: 'plg_security_violations'
    },
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

#### Query Parameters (per resource)

| Parameter | Applies To | Description |
|-----------|------------|-------------|
| `limit`, `offset` | `GET /{resource}` | Pagination controls (default `limit=100`) |
| `partition`, `partitionValues` | `GET` routes | Direct partition lookups (O(1) when resource defines partitions) |
| `populate` | `GET` routes | Hydrate relations on demand (requires RelationPlugin) |

**Populate examples (RelationPlugin installed):**

```http
GET /orders?populate=customer               # Hydrates belongsTo relation
GET /orders?populate=customer,items.product # Nested hydration
GET /orders/ord-1?populate=items.product    # Works on single-record fetches too
```

- Supports dot notation for nested relations.
- Validation errors return `400 INVALID_POPULATE` with the offending path.
- Hints appear automatically in `/openapi.json` and Swagger UI.

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

## ⚡ Performance Optimizations

The API Plugin includes **6 built-in optimizations** for maximum performance. All are **fully configurable** with production-ready defaults.

### Optimization Summary

| Optimization | Default | Performance Gain | Configuration |
|--------------|---------|------------------|---------------|
| **JWT Token Cache** | ✅ Enabled | 40-60% faster auth | `auth.jwt.cache` |
| **Public Paths Early Return** | ✅ Auto | 30-50% on public routes | Automatic via `auth.publicPaths` |
| **OpenAPI Schema Cache** | ✅ Enabled | 80-90% schema generation | `docs.cache` |
| **Response Compression** | ✅ Enabled | 70-85% bandwidth reduction | `compression` |
| **HTTP Keep-Alive** | ✅ Enabled | 20-30% latency reduction | `keepAlive` |
| **Validator Cache** | ✅ Enabled | 30-50% validation speed | `validation.cache` |

### Configuration Examples

#### Maximum Performance (Default)

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  // All optimizations enabled by default
}));
```

#### Custom Configuration

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,

  // JWT Token Cache (40-60% faster auth)
  auth: {
    jwt: {
      cache: {
        enabled: true,     // Default: true
        max: 1000,         // Default: 1000 tokens
        ttl: 60000         // Default: 60s
      }
    }
  },

  // OpenAPI Schema Cache (80-90% faster docs)
  docs: {
    cache: {
      enabled: true        // Default: true
    }
  },

  // Response Compression (70-85% bandwidth reduction)
  compression: {
    enabled: true,         // Default: true
    threshold: 1024,       // Default: 1KB
    encoding: 'gzip'       // Default: gzip
  },

  // HTTP Keep-Alive (20-30% latency reduction)
  keepAlive: {
    enabled: true,         // Default: true
    timeout: 65000,        // Default: 65s
    headersTimeout: 66000  // Default: 66s (must be > timeout)
  },

  // Validator Cache (30-50% faster validation)
  validation: {
    cache: {
      enabled: true        // Default: true
    }
  }
}));
```

#### Disable All Optimizations (Not Recommended)

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: { jwt: { cache: { enabled: false } } },
  docs: { cache: { enabled: false } },
  compression: { enabled: false },
  keepAlive: { enabled: false },
  validation: { cache: { enabled: false } }
}));
```

### Performance Tips

1. **Use Compression** - Reduces bandwidth by 70-85% (enabled by default)
2. **Enable Keep-Alive** - Reduces latency by 20-30% (enabled by default)
3. **Public Paths** - Define in `auth.publicPaths` for automatic optimization
4. **JWT Cache** - Keep TTL at 60s for security/performance balance
5. **OpenAPI Cache** - Automatically invalidates when schemas change

### Observability

Enable `verbose: true` to see optimization logs:

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  verbose: true  // Shows: "Compression enabled", "JWT cache HIT", etc.
}));
```

**Example Output:**
```
[MiddlewareChain] Compression enabled (gzip, threshold: 1KB)
[OpenAPIGenerator] Cache HIT (0ms)
[MiddlewareChain] CORS enabled (maxAge: 86400s, origin: *)
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
await db.usePlugin(new ApiPlugin({ port: 3000 }));
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
<summary><strong>How do I add rate limiting to custom routes?</strong></summary>

**Use `hono-rate-limiter` for per-route rate limiting:**

```bash
pnpm install hono-rate-limiter
```

```javascript
import { rateLimiter } from 'hono-rate-limiter';

// Create rate limiter middleware
const leadSubmissionLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  limit: 5,                   // Max 5 requests per window
  standardHeaders: 'draft-6', // Return rate limit info in headers
  keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
});

routes: {
  'POST /newsletter': {
    POST: [
      leadSubmissionLimiter,  // Apply rate limiting
      async (c, ctx) => {
        const lead = await ctx.resources.leads.insert(await c.req.json());
        return ctx.success({ lead }, 201);
      }
    ]
  },

  'POST /contact': {
    POST: [
      leadSubmissionLimiter,  // Reuse same limiter
      async (c, ctx) => {
        const lead = await ctx.resources.leads.insert(await c.req.json());
        return ctx.success({ lead }, 201);
      }
    ]
  }
}
```

**Rate Limit Headers:**
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining in window
- `RateLimit-Reset`: Time when limit resets

**Note:** For global rate limiting, use the built-in `failban` feature instead.

**[→ Learn more: Security features](./api/security.md#failban)**
</details>

<details>
<summary><strong>How do I protect against brute force attacks?</strong></summary>

**Enable failban** - automatic IP banning after violations:

```javascript
failban: {
  enabled: true,
  maxViolations: 3,           // Ban after 3 strikes
  violationWindow: 3600000,   // Within 1 hour
  banDuration: 86400000,      // Ban for 24 hours
  resourceNames: {
    bans: 'plg_security_bans',          // Optional override
    violations: 'plg_security_events'
  },

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
<br>**Resource names:** override ban/violation tables via `resourceNames.failban`.

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

### Custom Routes & Context

<details>
<summary><strong>What's the difference between (c) and (c, ctx) in route handlers?</strong></summary>

**The number of parameters determines which context system is used:**

```javascript
// 1 parameter → Legacy/manual context access
routes: {
  '/legacy': async (c) => {
    const db = c.get('db');  // Must manually get from Hono context
    const urls = c.get('urls_v1');
    return c.json({ urls: await urls.list() });
  }
}

// 2 parameters → Enhanced context (auto-injected!)
routes: {
  '/enhanced': async (c, ctx) => {
    // ctx has everything: resources, validator, helpers
    const urls = await ctx.resources.urls_v1.list();
    return ctx.success({ urls });
  }
}
```

**Enhanced context benefits:**
- ✅ Resource proxy with validation
- ✅ Request helpers (`ctx.param()`, `ctx.query()`, `ctx.body()`)
- ✅ Response helpers (`ctx.success()`, `ctx.error()`, `ctx.notFound()`)
- ✅ Validator helpers (`ctx.validator.validateBody()`)
- ✅ Auth helpers (`ctx.user`, `ctx.hasScope()`)
- ✅ Partition helpers (`ctx.setPartition()`)

**When to use each:**
- **Use (c, ctx)** - Custom routes with complex logic, validation, auth checks
- **Use (c)** - Simple routes, health checks, redirects

**[→ Learn more: Context Access Patterns](#-context-access-patterns)**
</details>

<details>
<summary><strong>How do I access resources in custom routes?</strong></summary>

**There are 3 ways** (enhanced context is recommended):

**1. Enhanced Context (Recommended ✅)**
```javascript
routes: {
  'GET /stats': async (c, ctx) => {
    // Proxy with validation and helpful errors
    const users = await ctx.resources.users.count();
    const orders = await ctx.resources.orders.count();
    return ctx.success({ users, orders });
  }
}
```

**2. Direct Injection**
```javascript
routes: {
  'GET /stats': async (c) => {
    const users = c.get('users');
    const orders = c.get('orders');
    return c.json({
      users: await users.count(),
      orders: await orders.count()
    });
  }
}
```

**3. withContext Helper**
```javascript
import { withContext } from 's3db.js/plugins/api';

routes: {
  'GET /stats': withContext(async (c, { resources }) => {
    const { users, orders } = resources;
    return c.json({
      users: await users.count(),
      orders: await orders.count()
    });
  })
}
```

**Comparison:**
- **Enhanced**: Best DX, auto-wrap, helpers, validation
- **Direct**: Lightweight, minimal abstraction
- **withContext**: Explicit, functional style

**[→ Learn more: Context Access Patterns](#-context-access-patterns)**
</details>

<details>
<summary><strong>How do I validate request bodies in custom routes?</strong></summary>

**Option 1: Use built-in validator (validates against resource schema):**

```javascript
routes: {
  'POST /users': async (c, ctx) => {
    // Validate body against 'users' resource schema
    const { valid, errors, data } = await ctx.validator.validateBody('users');

    if (!valid) {
      return ctx.error(errors[0].message, 400);
    }

    // data is the validated body
    const user = await ctx.resources.users.insert(data);
    return ctx.success({ user }, 201);
  }
}
```

**Option 2: Use Zod for custom validation schemas:**

```bash
pnpm install zod @hono/zod-validator
```

```javascript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const NewsletterSchema = z.object({
  email: z.string().email(),
  source: z.string().optional()
});

routes: {
  'POST /newsletter': {
    POST: [
      zValidator('json', NewsletterSchema),
      async (c, ctx) => {
        const data = c.req.valid('json');
        const lead = await ctx.resources.leads.insert({
          email: data.email,
          source: data.source || 'newsletter',
          type: 'newsletter'
        });
        return ctx.success({ lead }, 201);
      }
    ]
  }
}
```

**Validator methods (built-in):**
- `ctx.validator.validate(resourceName, data)` - Validate data against schema
- `ctx.validator.validateBody(resourceName)` - Validate request body
- `ctx.validator.validateOrThrow(data)` - Validate or throw 400 error

**[→ Learn more: RouteContext API Reference](#routecontext-api-reference)**
</details>

<details>
<summary><strong>Can I use ctx.resources in guards?</strong></summary>

**Yes! Guards receive the same enhanced context:**

```javascript
guard: {
  create: async (ctx) => {
    // ✅ Access other resources in guards
    const tenant = await ctx.resources.tenants.get(ctx.user.tenantId);

    if (!tenant || !tenant.active) {
      return false;  // Deny if tenant is inactive
    }

    // Auto-inject tenant context
    ctx.body.tenantId = ctx.user.tenantId;
    return true;
  },

  update: async (ctx, record) => {
    // ✅ Use auth helpers
    if (ctx.hasScope('admin')) return true;

    // ✅ Cross-resource validation
    const owner = await ctx.resources.users.get(record.ownerId);
    return owner?.id === ctx.user.sub;
  }
}
```

**Available in guards:**
- `ctx.user` - Authenticated user
- `ctx.resources` - All resources (with Proxy validation)
- `ctx.hasScope(scope)` - Check user scopes
- `ctx.setPartition(name, fields)` - Partition filters for tenant isolation
- `ctx.body` - Request body (for create/update)

**[→ Learn more: Guards and Enhanced Context](#guards-and-enhanced-context)**
</details>

---

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

> ℹ️ Static routes are evaluated before resource routes. Combine with `pathRules` (or `pathAuth`) if you need per-path auth.

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

## 🚨 Error Handling

Misconfigurations now surface structured `PluginError` payloads so API operators get instant remediation guidance. Examples include:
- Missing `usersResource` for `basicAuth`/`apiKeyAuth` → `statusCode: 500`, `retriable: false`, suggestion to wire the correct resource.
- JWT/OIDC misconfigurations (no secret, bad issuer, invalid duration strings) → `statusCode: 400`, explaining the expected format.
- Custom auth driver registration issues (duplicate drivers, missing `initialize`) → `statusCode: 400/500` with metadata referencing the driver name.
- Static asset misconfiguration (`static[]`) now calls out the bad entry with `statusCode: 400` and the mount index so you can fix it quickly.

Surface `error.suggestion` and `error.metadata` in your admin UI/logging to keep response teams fast.

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
