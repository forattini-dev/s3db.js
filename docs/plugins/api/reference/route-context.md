# RouteContext Reference

`ApiPlugin` custom routes use one supported handler contract:

```javascript
'GET /stats': async (c, ctx) => {
  const total = await ctx.services.resources.users.count();
  return ctx.success({ requestId: ctx.requestId, total });
}
```

`c` is the raw HTTP context. `ctx` is the supported `RouteContext` for the request.

The modern contract is capability-based:

- `ctx.auth`
- `ctx.input`
- `ctx.services`
- `ctx.logger`
- `ctx.signal`
- `ctx.requestId`

The runtime always invokes custom handlers with `(c, ctx)`. In JavaScript you can still write `(c)` if you do not need the second argument.

## Where it applies

- Plugin-level routes in `new ApiPlugin({ routes })`
- Resource-level custom routes declared in `resource.api`
- Helpers that wrap or adapt custom handlers with `withContext()` or `createRouteContext()`

## `ctx.input`

```javascript
'POST /users/:id?': async (c, ctx) => {
  const userId = ctx.input.params.id || null;
  const view = ctx.input.query.view || 'default';
  const body = await ctx.input.body();

  return ctx.success({ userId, view, body });
}
```

- `ctx.input.params`
- `ctx.input.query`
- `ctx.input.metadata`
- `ctx.input.body()`
- `ctx.input.json()`
- `ctx.input.text()`
- `ctx.input.formData()`

`ctx.request` remains available when you want HTTP-specific helpers such as `ctx.request.method`, `ctx.request.path`, `ctx.request.url`, `ctx.request.header(name)`, and `ctx.request.headers()`.

## `ctx.services`

```javascript
'GET /reports': async (c, ctx) => {
  const { resources, db, plugins } = ctx.services;

  return ctx.success({
    totalUsers: await resources.users.count(),
    hasAuditPlugin: !!plugins.audit,
    sameDb: db === ctx.db
  });
}
```

- `ctx.services.db`
- `ctx.services.database`
- `ctx.services.resources`
- `ctx.services.resource`
- `ctx.services.plugins`
- `ctx.services.pluginRegistry`

`ctx.services` is the supported service bag for custom routes. It is the preferred path over reading request-scoped state manually from `c.get(...)`.

## `ctx.auth`

```javascript
'GET /admin/stats': async (c, ctx) => {
  const principal = ctx.auth.require({
    roles: ['admin'],
    scopes: ['stats:read']
  });

  return ctx.success({
    principalId: principal.id,
    authenticated: ctx.auth.authenticated
  });
}
```

- `ctx.auth.authenticated`
- `ctx.auth.principal`
- `ctx.auth.principalId`
- `ctx.auth.roles`
- `ctx.auth.scopes`
- `ctx.auth.claims`
- `ctx.auth.tenantId`
- `ctx.auth.user`
- `ctx.auth.serviceAccount`
- `ctx.auth.hasRole(role)`
- `ctx.auth.hasScope(scope)`
- `ctx.auth.hasAnyScope(...scopes)`
- `ctx.auth.hasAllScopes(...scopes)`
- `ctx.auth.require(requirement?)`
- `ctx.auth.requireAuth()`
- `ctx.auth.requireRole(role)`
- `ctx.auth.requireScope(scope)`

Scope checks keep the API plugin wildcard behavior. For example, `reports:*` matches `reports:read`.

## `ctx.logger`, `ctx.signal`, and `ctx.requestId`

```javascript
'GET /jobs/:id': async (c, ctx) => {
  ctx.logger.info({ jobId: ctx.input.params.id, requestId: ctx.requestId }, 'job lookup');

  if (ctx.signal.aborted) {
    return ctx.serverError('Request aborted');
  }

  return ctx.success({ requestId: ctx.requestId });
}
```

- `ctx.logger` is a request-scoped logger
- `ctx.signal` is the request cancellation signal when available
- `ctx.requestId` is the correlation id stored for the request

The API plugin provides safe fallbacks, so these capabilities always exist even when logging or cancellation wiring is minimal.

## Response helpers

```javascript
'GET /healthz': async (c, ctx) => {
  return ctx.success({ ok: true });
}
```

- `ctx.json(data, status?)`
- `ctx.success(data, status?)`
- `ctx.error(messageOrError, status?, details?)`
- `ctx.badRequest(message?, details?)`
- `ctx.notFound(message?)`
- `ctx.unauthorized(message?)`
- `ctx.forbidden(message?)`
- `ctx.validationError(message?, details?)`
- `ctx.serverError(message?, details?)`
- `ctx.html(markup, status?)`
- `ctx.redirect(url, status?)`
- `ctx.render(template, data?, options?)` when templates are enabled

## Validation helpers

```javascript
'POST /users': async (c, ctx) => {
  const { valid, data, errors } = await ctx.validator.validateBody('users');

  if (!valid) {
    return ctx.validationError('Validation failed', errors);
  }

  return ctx.success(await ctx.services.resources.users.insert(data), 201);
}
```

- `ctx.validator.validate(resourceName, data)`
- `ctx.validator.validateOrThrow(resourceName, data)`
- `ctx.validator.validateBody(resourceName?)`

For resource-level routes, `validateBody()` can infer the current resource when you omit the name.

## Continuity aliases

These helpers are still supported, but the capability-based surface above is the primary contract:

- `ctx.db` / `ctx.database`
- `ctx.resources`
- `ctx.resource`
- `ctx.user`
- `ctx.session`
- `ctx.sessionId`
- `ctx.identity`
- `ctx.serviceAccount`
- `ctx.isAuthenticated`
- `ctx.isServiceAccount`
- `ctx.param(name)` / `ctx.params()`
- `ctx.query(name)` / `ctx.queries()`
- `ctx.header(name)`
- `ctx.body()` / `ctx.text()` / `ctx.formData()`
- `ctx.hasRole(role)` / `ctx.hasScope(scope)`
- `ctx.requireAuth()` / `ctx.requireRole(role)` / `ctx.requireScope(scope)`

## Request-scoped state

```javascript
'GET /tenant/projects': async (c, ctx) => {
  ctx.setPartition('byTenant', { tenantId: ctx.auth.tenantId });
  ctx.set('selectedTenant', ctx.auth.tenantId);

  return ctx.success({
    selectedTenant: ctx.get('selectedTenant')
  });
}
```

- `ctx.get(key)` / `ctx.set(key, value)` delegate to the raw request context
- `ctx.setPartition(name, values)` stores partition filters for downstream resource operations
- `ctx.getPartitionFilters()`, `ctx.hasPartitionFilters()`, `ctx.clearPartitionFilters()`

## Resource-level routes

Declare resource custom routes inside `resource.api` with `"METHOD /path"` keys:

```javascript
await db.createResource({
  name: 'orders',
  attributes: {
    customerId: 'string|required',
    total: 'number|required'
  },
  api: {
    'GET /summary': async (c, ctx) => {
      return ctx.success({
        resource: ctx.services.resource.name,
        total: await ctx.services.resource.count()
      });
    }
  }
});
```

Inside those handlers, `ctx.services.resource` and `ctx.resource` both point at the current resource.

## Helper exports

`ApiPlugin` exports:

- `RouteContext`
- `createRouteContext(c, options?)`
- `withContext(handler, options?)`

Use `withContext()` when you want to adapt a standalone handler, and `createRouteContext()` when you need to build the same contract manually inside lower-level middleware or adapters.
