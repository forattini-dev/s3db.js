# ❓ API Plugin FAQ

> **Common questions and troubleshooting for s3db.js API Plugin**

Quick links: [Getting Started](#getting-started) • [Auth](#authentication--authorization) • [OIDC](#oidc--oauth2) • [Performance](#performance) • [Deployment](#deployment) • [Troubleshooting](#troubleshooting)

---

## Getting Started

### What makes this different from Express/Fastify/manual servers?

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

---

### Is this production-ready?

**Yes!** Used in production with:
- ✅ Automatic IP banning (Failban + GeoIP)
- ✅ Rate limiting per route/user/IP
- ✅ Real-time metrics (p50/p95/p99)
- ✅ Kubernetes health probes
- ✅ Graceful shutdown
- ✅ Security headers (CSP, HSTS, etc)

**[→ Deployment guide](/plugins/api/guides/deployment.md)**

---

### What's the performance like?

**Production numbers:**
- p50 latency: ~20-50ms
- p95 latency: ~100-200ms
- p99 latency: ~300-500ms
- Handles 1000+ req/s per instance

**Runtime profile:** Raffel-based request handling, cached docs generation, and partition-aware resource access paths.

**[→ Performance benchmarks](/plugins/api/guides/deployment.md#performance)**

---

### Can I add custom routes?

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

---

### How do I serve a React/Vue app?

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

---

### What's the difference between `ctx.error()` and `c.error()`?

Both return standardized error responses, but with different capabilities:

| Feature | `ctx.error()` | `c.error()` |
|---------|---------------|-------------|
| **Availability** | `RouteContext` custom routes | Global |
| **Response Format** | Basic | Advanced with auto-detection |
| **Status Code** | Manual only | Auto-detects from error name |
| **Stack Traces** | No | Yes (dev mode) |

**When to use:**
- `ctx.error()` - Quick and predictable inside custom routes
- `c.error()` - Advanced features (anywhere)

**[→ RouteContext reference](/plugins/api/reference/route-context.md)**

---

### Does the API plugin support bulk operations?

Yes, but the native batch surface is currently specific.

- native bulk create is supported through `resource.api.bulk.create`
- it exposes `POST /:resource/bulk`
- it still applies `guard.create`, `write.create`, `views`, and `protected`

Native bulk delete is not exposed as a built-in API route in this runtime.

If you need batch deletion over HTTP, use a custom route on top of `resource.deleteMany()` until the runtime grows a native delete counterpart.

**[→ Resource API Reference](/plugins/api/reference/resource-api.md#bulk)**

---

## Authentication & Authorization

### Can I use Azure AD / Google / Keycloak?

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

---

### Can I use multiple auth methods at once?

**Yes!** Mix and match auth methods per route:

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

**[→ Path-based auth guide](/plugins/api/guides/authentication.md#path-based-auth)**

---

### How do I implement multi-tenancy?

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

---

### What's the difference between auth and guards?

**Authentication (auth):** *Who are you?*
- Verifies user identity (JWT, OIDC, API key)
- Runs before request reaches handlers
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
    ctx.setPartition('byUser', { userId: ctx.user.sub });
    return true;
  }
}
```

**[→ Guards guide](/plugins/api/guides/guards.md)**

---

### Can protected fields vary by role?

Yes. `api.protected` accepts conditional rules, so you can hide a field for everyone except a role/scope:

```javascript
api: {
  protected: [
    'internalNotes',
    { path: 'tokenHash', unlessRole: ['admin'] }
  ]
}
```

In this example, `internalNotes` is always hidden, while `tokenHash` stays visible for `admin`.

---

### Can I mark fields as readonly or mutable per operation?

Yes. Use `api.write` to define per-operation write policy. You can keep it static or make it actor-aware:

```javascript
api: {
  write: {
    patch: [
      {
        whenRole: ['admin'],
        priority: 100,
        writable: ['phone', 'role', 'isActive']
      },
      {
        whenRole: ['user'],
        priority: 10,
        writable: ['phone'],
        readonly: ['role', 'isActive']
      }
    ]
  }
}
```

The native route rejects forbidden writes with `400 FIELD_WRITE_NOT_ALLOWED`.

For the full model and precedence rules, read [Resource Policies](/plugins/api/guides/resource-policies.md).

---

### Can I authenticate server-to-server calls with a shared header secret?

Yes. Use the native `header-secret` driver when an internal service or admin app should call the CRUD routes directly:

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
      scopes: ['admin:read'],
      serviceAccount: {
        clientId: 'admin-ui',
        name: 'Admin UI'
      }
    }
  }],
  pathRules: [
    { path: '/users/**', methods: ['header-secret'], required: true, roles: ['admin'] }
  ]
}
```

Successful requests get an injected service identity in `ctx.auth.user` / `ctx.auth.serviceAccount`, so native routes and guards can treat them like any other authenticated actor.

---

### Can I define admin projections or alternate views per resource?

Yes. Use `api.views`. They can be explicit via `?view=<name>` or automatic based on the current actor:

```javascript
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
      fields: ['id', 'email', 'role', 'tokenHash']
    }
  }
}
```

Then either call `/users?view=admin` / `/users/:id?view=admin`, or let the plugin choose the highest-priority matching auto view. Views compose well with `protected` rules.

For full examples and the evaluation order, read [Resource Policies](/plugins/api/guides/resource-policies.md).

---

### Where is the full `resource.api` reference?

Use [Resource API Reference](/plugins/api/reference/resource-api.md).

That page is the best place to look up:

- `description`
- `guard`
- `protected`
- `views`
- global `readonly` / `writable`
- `write.create`, `write.update`, `write.patch`
- custom resource routes like `'GET /summary'`

If you want patterns and tradeoffs instead of a key-by-key contract, read [Resource Policies](/plugins/api/guides/resource-policies.md).

---

### Can custom routes share guards, protected fields, and metadata in one place?

Partially. Resource-level custom routes already colocate well with the resource itself, but route-specific guard/projection metadata is still more manual than the CRUD surface.

If you need per-route policy today, keep the route near the resource and apply authorization/projection logic explicitly in the handler.

---

## OIDC & OAuth2

### Is implicit token refresh enabled by default?

**Yes!** `autoRefreshTokens: true` is the default. Active users never see session expiration.

Disable explicitly if needed:
```javascript
config: {
  autoRefreshTokens: false
}
```

**[→ OIDC guide](/plugins/api/guides/oidc.md#implicit-token-refresh)**

---

### My OIDC provider doesn't return `refresh_token`. Why?

**Common causes:**

**Google:**
- Missing `access_type=offline` parameter (auto-added by provider quirks ✅)
- Missing `prompt=consent` on first login (auto-added ✅)
- Need to revoke app permission and re-authenticate

**Azure AD:**
- Missing `offline_access` scope
- App needs "Allow public client flows" enabled

**GitHub:**
- GitHub doesn't support refresh tokens in OAuth Apps
- Use GitHub Apps instead

**Enable debug logging:**
```javascript
config: {
  logLevel: 'debug'  // See token exchange details
}
```

**[→ OIDC troubleshooting](/plugins/api/guides/oidc.md#troubleshooting)**

---

### How do I test OIDC locally without HTTPS?

Set `cookieSecure: false` for development:

```javascript
config: {
  cookieSecure: process.env.NODE_ENV === 'production',  // HTTPS in prod only
}
```

**Warning:** Never use `cookieSecure: false` in production!

---

### Can I use OIDC with other auth methods?

**Yes!** Mix OIDC with JWT, Basic, API keys:

```javascript
auth: {
  drivers: {
    oidc: {/*...*/},
    jwt: {/*...*/},
    basic: {/*...*/}
  },
  pathRules: [
    { path: '/admin/**', methods: ['oidc'], required: true },
    { path: '/api/**', methods: ['jwt', 'basic'], required: true }
  ]
}
```

**[→ Authentication guide](/plugins/api/guides/authentication.md)**

---

### What's the cookie size impact of token refresh?

Adds ~200-400 bytes for `refresh_token`. Total session cookie: ~600-1000 bytes (well under 4KB limit).

---

### How do I customize the user ID field?

Use `userIdClaim`:

```javascript
config: {
  userIdClaim: 'email',  // Use email as user ID (default: 'sub')
}
```

---

## Performance

### How do I add rate limiting to custom routes?

Use the plugin's built-in `rateLimit.rules` and target the custom route path directly:

```javascript
await db.usePlugin(new ApiPlugin({
  rateLimit: {
    enabled: true,
    rules: [
      { path: '/newsletter', key: 'ip', windowMs: 15 * 60 * 1000, maxRequests: 5 }
    ]
  },
  routes: {
    'POST /newsletter': async (c) => {
      const payload = await c.req.json();
      return c.json({ queued: true, email: payload.email });
    }
  }
}));
```

If you need behavior the built-in limiter does not cover, add a custom middleware or implement the check inside the handler.

**[→ Security guide](/plugins/api/guides/security.md#rate-limiting)**

---

### Can I monitor API performance?

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

Enable metrics:
```javascript
metrics: { enabled: true }
```

**[→ Deployment guide](/plugins/api/guides/deployment.md#metrics)**

---

### How do I optimize for production?

**All optimizations enabled by default:**
- JWT Token Cache (40-60% faster auth)
- Schema Cache (80-90% faster docs)
- HTTP Keep-Alive (20-30% latency reduction)
- Response Compression (70-85% bandwidth)

**Custom configuration:**
```javascript
await db.usePlugin(new ApiPlugin({
  compression: { enabled: true, threshold: 1024 },
  keepAlive: { enabled: true, timeout: 65000 },
  auth: { jwt: { cache: { enabled: true, ttl: 60000 } } }
}));
```

**[→ Performance guide](/plugins/api/guides/deployment.md#performance)**

---

## Deployment

### How do I deploy to Kubernetes?

Built-in **health probes** for zero-downtime:

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
  initialDelaySeconds: 10

readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
  initialDelaySeconds: 5
```

Configure health checks:
```javascript
health: {
  readiness: {
    checks: [
      {
        name: 'database',
        check: async () => ({ healthy: await db.ping() })
      }
    ]
  }
}
```

**[→ Kubernetes guide](/plugins/api/guides/deployment.md#kubernetes)**

---

### How do I protect against brute force?

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

**[→ Security guide](/plugins/api/guides/security.md#failban)**

---

### Can I block traffic by country?

**Yes!** GeoIP blocking with MaxMind GeoLite2:

```javascript
failban: {
  geo: {
    enabled: true,
    databasePath: './GeoLite2-Country.mmdb',
    allowedCountries: ['US', 'BR', 'CA'],  // Whitelist
    // OR
    blockedCountries: ['CN', 'RU'],        // Blacklist
  }
}
```

**Download GeoLite2:**
```bash
wget https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-Country.mmdb
pnpm add @maxmind/geoip2-node
```

**[→ GeoIP guide](/plugins/api/guides/security.md#geoip-blocking)**

---

## Troubleshooting

### Session expires too soon

```javascript
config: {
  autoRefreshTokens: true,      // Ensure enabled (default)
  refreshThreshold: 300000,     // 5 min (default)
  rollingDuration: 86400000,    // 24 hours (increase if needed)
  absoluteDuration: 604800000,  // 7 days (increase if needed)
  logLevel: 'debug',                // Enable logging
}
```

---

### Continue URL not working

```javascript
config: {
  externalUrl: 'https://api.example.com',  // Set if behind reverse proxy
  logLevel: 'debug',                           // Check logs
}
```

---

### Cross-subdomain logout broken

```javascript
config: {
  cookieDomain: '.example.com',  // Ensure domain matches
  // Dual-cookie deletion handles this automatically ✅
}
```

---

### CORS errors

```javascript
// In API Plugin config (not OIDC config)
{
  cors: {
    enabled: true,
    origin: ['https://app.example.com'],
    credentials: true
  }
}
```

---

### Route not found (404)

Check route precedence:
1. Static files (`static: [...]`)
2. Custom routes (`routes: {...}`)
3. Auth routes (`/auth/login`, `/auth/callback`, etc)
4. Resource routes (`/users`, `/orders`, etc)

**[→ Routing guide](/plugins/api/reference/routing.md)**

---

### Custom context not working

Custom routes use one supported contract: `(c, ctx)`.

```javascript
// ✅ Use RouteContext directly
routes: {
  '/custom': async (c, ctx) => {
    const user = ctx.user;  // Works!
  }
}

// ✅ Also valid when you do not need ctx
routes: {
  '/custom': async (c) => {
    return c.json({ ok: true });
  }
}
```

**[→ RouteContext reference](/plugins/api/reference/route-context.md)**

---

## Still Need Help?

- **📖 [Documentation](/plugins/api/README.md)** - Complete guides
- **🎯 [Examples](/examples/)** - Working code examples
- **🐛 [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)** - Report bugs
- **💬 [Discussions](https://github.com/forattini-dev/s3db.js/discussions)** - Ask questions

---

> **Can't find your question?** [Open an issue](https://github.com/forattini-dev/s3db.js/issues/new) and we'll add it to the FAQ!
