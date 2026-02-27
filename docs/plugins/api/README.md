# 🌐 API Plugin

> **Transform s3db.js into a production-ready REST API in one line of code**

```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));
// ✅ REST API + Auth + Docs + Metrics running
```

**Instant features:** Auto-generated endpoints • JWT/OAuth2/OIDC auth • Row-level security • Rate limiting • Swagger UI • Production metrics

**Works with:** Any OIDC provider (IdentityPlugin, Keycloak, Azure AD, AWS Cognito, etc.)

---

## ⚡ Quick Start

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
// ✨ API at http://localhost:3000 with Swagger UI at /docs
```

### 2. Add JWT Authentication

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  auth: {
    resource: 'users',
    drivers: { jwt: { secret: process.env.JWT_SECRET } },
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
      cookieSecret: process.env.COOKIE_SECRET
    }
  }
}
```

**✨ Latest OIDC enhancements:** Auto token refresh • Continue URL • Provider quirks (Google/Azure/Auth0) • Cross-subdomain auth
**[→ OIDC Quick Start](/plugins/api/guides/oidc.md)**

---

## 📚 Documentation

### Getting Started

| Guide | Description | Read Time |
|-------|-------------|-----------|
| **[Authentication](/plugins/api/guides/authentication.md)** | JWT, OAuth2/OIDC, API Keys, Basic Auth | 10 min |
| **[Identity Integration](/plugins/api/guides/identity.md)** | Delegate auth to IdentityPlugin + remote metadata | 15 min |
| **[Guards](/plugins/api/guides/guards.md)** | Row-level security, multi-tenancy, RBAC | 15 min |
| **[Security](/plugins/api/guides/security.md)** | Failban, rate limiting, GeoIP blocking | 10 min |
| **[Deployment](/plugins/api/guides/deployment.md)** | Docker, Kubernetes, production tips | 15 min |

### Features Deep Dive

| Guide | Description | Read Time |
|-------|-------------|-----------|
| **[OIDC Guide](/plugins/api/guides/oidc.md)** | ✨ Complete OAuth2/OIDC setup (Google, Azure, etc) | 20 min |
| **[OpenAPI Docs](/plugins/api/guides/openapi.md)** | Customize Swagger UI, add descriptions | 10 min |
| **[Routing](/plugins/api/reference/routing.md)** | Custom routes, precedence, path rules | 5 min |

### Reference

| Document | Description |
|----------|-------------|
| **[Configuration](/plugins/api/reference/configuration.md)** | All config options (alphabetical) |
| **[Enhanced Context](/plugins/api/reference/enhanced-context.md)** | Route context API reference |
| **[FAQ](/plugins/api/faq.md)** | Common questions and troubleshooting |

### Examples

| Example | Description |
|---------|-------------|
| [e50-oidc-simple.js](/examples/e50-oidc-simple.js) | Basic OIDC with Google |
| [e88-oidc-enhancements.js](/examples/e88-oidc-enhancements.js) | Complete OIDC enhancements demo |
| [e101-path-based-basic-oidc.js](/examples/e101-path-based-basic-oidc.js) | Dual auth (Basic + OIDC) |

---

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

### URL Shortener

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
GET     /users           # List/query with filters
POST    /users           # Create
GET     /users/:id       # Get by ID
PUT     /users/:id       # Update (full replace)
PATCH   /users/:id       # Update (partial merge)
DELETE  /users/:id       # Delete
HEAD    /users           # Count
OPTIONS /users           # Metadata

GET     /docs            # Interactive Swagger UI
GET     /openapi.json    # OpenAPI 3.0 spec
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

**[→ Performance guide](/plugins/api/guides/deployment.md#performance)**

---

## 📦 Installation

**Required:**
```bash
pnpm add s3db.js hono @hono/node-server @hono/swagger-ui jose
```

**Optional (by feature):**
```bash
# OAuth2/OIDC
pnpm add openid-client

# GeoIP blocking
pnpm add @maxmind/geoip2-node

# Validation (custom routes)
pnpm add zod @hono/zod-validator

# Rate limiting (custom routes)
pnpm add hono-rate-limiter
```

---

## ❓ FAQ

<details>
<summary><strong>What makes this different from Express/Fastify?</strong></summary>

**Built on Hono** (12x faster than Express), but gives you **instant REST APIs** from s3db.js resources. Zero boilerplate:

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
    return ctx.success({ data });
  },
  'POST /webhook': async (c) => {
    const payload = await c.req.json();
    // Process webhook...
    return c.json({ received: true });
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

**Built on Hono:** 12x faster than Express, 3x faster than Fastify

**[→ Performance benchmarks](/plugins/api/guides/deployment.md#performance)**
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

**[→ Observability guide](/plugins/api/guides/observability.md)**
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
