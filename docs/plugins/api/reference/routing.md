# 🚦 Routing

This page summarizes all ways to expose routes with the ApiPlugin, when to use each, and how precedence and paths work — without overlap or surprises.

—

## Route Types (pick what fits)

- Auto‑CRUD per resource
  - Generated for every resource (GET/POST/PUT/PATCH/DELETE) with optional version prefix and `basePath`.
  - Best for standard REST over your s3db.js resources.

- Resource‑level custom routes
  - Define per‑resource endpoints (mounted under that resource’s app) using `resource.config.routes`.
  - Paths are RELATIVE to the resource mount. Example: `GET /:id/activate` resolves under `/{basePath}/{version?}/{resource}/:id/activate`.
  - Use when the route represents an action “about” that resource.

- Plugin‑level custom routes
  - Global endpoints via `new ApiPlugin({ routes: { 'GET /healthz': handler } })`.
  - Paths are automatically prefixed with `basePath`.
  - Useful for ping/admin/aggregation/cross-resource endpoints.

- Auth routes (JWT)
  - `/auth/register`, `/auth/login`, etc. Mounted only when the `jwt` driver is present and the IdentityPlugin is NOT installed.

- Infra & Admin opcionais
  - `/openapi.json`, `/docs` (docs.enabled)
  - `/health` (health.enabled)
  - `/metrics` (metrics.enabled)
  - `/admin/security/*` (failban.enabled)
  - Static files (ver Static Files guide)

—

## Custom Routes: Syntax & Context

Formato comum (plugin e resource):
```js
routes: {
  'GET /stats': async (c) => c.json({ ok: true }),
  'POST /:id/activate': async (c, ctx) => {
    // ctx.resource (resource-level only), ctx.database
    const { id } = c.req.param();
    return c.json(await ctx.resource.update(id, { active: true }));
  }
}
```

Rules:
- Key = `METHOD /path` (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS)
- Handler can be `(c)` or `(c, ctx)`; when it receives 2 args, the plugin provides the enhanced context (resource/database helpers).
- Resource‑level: path is relative to the mounted resource. Plugin‑level: path is absolute (the plugin applies `basePath`).

—

## Precedence & Order

Execution order (high level):
1. Middlewares: requestId → failban → security headers → CORS → session → custom middlewares → templates → body size
2. Rotas de recursos (CRUD)
3. Rotas customizadas por recurso (`resource.config.routes`)
4. Rotas customizadas do plugin (`config.routes`)
5. Rotas built‑in (docs, health, metrics, failban admin)

Notes:
- Most specific wins: if there’s overlap, the routing engine resolves using path specificity; favor explicit routes and avoid duplicates.
- `basePath` and `versionPrefix` are applied to all auto-generated routes.

High-level diagram:
```mermaid
flowchart TB
  subgraph App
    MW[Middlewares\nrequestId → failban → security → CORS → session → custom → templates → size]
    CRUD[Auto‑CRUD por recurso]
    RRES[Rotas custom (resource.config.routes)]
    RPLG[Rotas custom (plugin config.routes)]
    BUILTIN[Built‑in\n/docs /openapi.json /health /metrics /admin/security]
  end

  MW --> CRUD --> RRES --> RPLG --> BUILTIN
```

—

## Recommendations

- Use resource‑level routes when the logic semantically belongs to that resource (for example `/:id/activate`).
- Use plugin‑level routes for integrations, ping/admin endpoints, or cross-resource workflows.
- Avoid duplicating CRUD routes; extend the API with new routes (actions, webhooks, etc.) instead.
- Combine with `auth.pathRules` to require `oidc` (session) for UI traffic and `oauth2` (Bearer) for services.

—

## Where to configure

- Plugin‑level: `new ApiPlugin({ routes: { 'GET /foo': handler } })`
- Resource‑level: `await db.createResource({ name: 'items', routes: { 'POST /:id/activate': handler } })`

All related options live in [Configuration (Canonical)](./configuration.md).
