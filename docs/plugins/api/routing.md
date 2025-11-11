# 🚦 Routing

This page summarizes all ways to expose routes with the ApiPlugin, when to use each, and how precedence and paths work — without overlap or surprises.

—

## Route Types (pick what fits)

- Auto‑CRUD per resource
  - Generated for every resource (GET/POST/PUT/PATCH/DELETE) with optional version prefix and `basePath`.
  - Best for standard REST over your s3db.js resources.

- Resource‑level custom routes
  - Define per‑resource endpoints (mounted under that resource’s app) using `resource.config.routes`.
  - Paths are RELATIVE to the resource mount. Example: `GET /:id/activate` will resolve under `/{basePath}/{version?}/{resource}/:id/activate`.
  - Use quando a rota é “sobre” aquele recurso.

- Plugin‑level custom routes
  - Global endpoints via `new ApiPlugin({ routes: { 'GET /healthz': handler } })`.
  - Paths are prefixed with `basePath` automaticamente.
  - Útil para ping/admin/aggregations/cross‑resource.

- Auth routes (JWT)
  - `/auth/register`, `/auth/login`, etc. Montados apenas quando o driver `jwt` está presente e NÃO há IdentityPlugin.

- Infra & Admin opcionais
  - `/openapi.json`, `/docs` (docs.enabled)
  - `/health` (health.enabled)
  - `/metrics` (metrics.enabled)
  - `/admin/security/*` (failban.enabled)
  - Static files (ver Static Files guide)

—

## Custom Routes: Sintaxe e Contexto

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

Regras:
- Key = `METHOD /path` (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS)
- Handler pode ser `(c)` ou `(c, ctx)`; quando recebe 2 args, o plugin fornece “enhanced context” (resource/database).
- Resource‑level: o path é relativo ao recurso montado. Plugin‑level: path é absoluto (o plugin aplica `basePath`).

—

## Precedência e Ordem

Ordem de aplicação (alto nível):
1. Middlewares: requestId → failban → security headers → CORS → session → custom middlewares → templates → body size
2. Rotas de recursos (CRUD)
3. Rotas customizadas por recurso (`resource.config.routes`)
4. Rotas customizadas do plugin (`config.routes`)
5. Rotas built‑in (docs, health, metrics, failban admin)

Observações:
- Mais específico primeiro: se houver colisão, a engine de roteamento casa pelas regras de path; prefira rotas específicas e evite duplicar caminhos.
- `basePath` e `versionPrefix` são respeitados em todas as rotas geradas automaticamente.

Diagrama (alto nível):
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

## Recomendações

- Use resource‑level routes quando a lógica pertence semanticamente ao recurso (ex.: `/:id/activate`).
- Use plugin‑level routes para integrações, ping/admin ou endpoints cross‑resource.
- Evite duplicar rotas existentes do CRUD; prefira estender com rotas novas (ex.: ações ou webhooks).
- Combine com `auth.pathRules` para exigir `oidc` (sessão) na UI e `oauth2` (Bearer) para serviços.

—

## Onde configurar

- Plugin‑level: `new ApiPlugin({ routes: { 'GET /foo': handler } })`
- Resource‑level: `await db.createResource({ name: 'items', routes: { 'POST /:id/activate': handler } })`

Todas as opções relacionadas em [Configuration (Canonical)](./configuration.md).
