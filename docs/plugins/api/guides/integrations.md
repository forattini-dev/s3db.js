# Plugin Integrations

> **Navigation:** [← Back to API Plugin](/plugins/api/README.md) | [Configuration →](/plugins/api/reference/configuration.md)

The API Plugin plays nicely with other first-party plugins. This guide shows how to expose their data through REST endpoints with zero ceremony.

---

## The `plg_*` Convention

Plugins that create internal resources use the `plg_` prefix (e.g., `plg_audits`, `plg_api_failban_bans`). These resources are **hidden by default** — they won't generate REST endpoints unless explicitly opted in via `ApiPlugin.resources`.

**Why hidden?** Plugin resources are implementation details. Exposing them all would clutter your API with internal data that most consumers don't need.

**How to opt in:** List the resource name in `resources` config:

```javascript
await db.usePlugin(new ApiPlugin({
  resources: {
    plg_audits: { methods: ['GET'] },        // Read-only
    plg_cloud_inventory_costs: true           // Full CRUD
  }
}));
```

Once exposed, the endpoints appear in `/openapi.json` and `/docs` automatically.

---

## Relation Plugin

- Install the [RelationPlugin](/plugins/relation/README.md) *before* the API plugin.
- All `GET` endpoints gain `?populate=` to hydrate relationships (`?populate=customer,items.product`).
- Unknown relation paths raise `400 INVALID_POPULATE` automatically.
- Individual relations can be hidden by setting `resources[resourceName].relations[relationName].expose = false`.

```javascript
await db.usePlugin(new RelationPlugin({ relations: { /* ... */ } }));
await db.usePlugin(new ApiPlugin({ port: 3000 }));

// GET /orders?populate=customer,items.product
```

---

## Audit Plugin

The AuditPlugin tracks all create, update, and delete operations in a `plg_audits` resource. Expose it via REST for audit trail access:

```javascript
await db.usePlugin(new AuditPlugin());
await db.usePlugin(new ApiPlugin({
  port: 3000,
  resources: {
    plg_audits: {
      methods: ['GET'],              // Read-only (no create/update/delete)
      guard: {
        list: (ctx) => {
          // Only admins can view audit trails
          return ctx.user?.role === 'admin';
        }
      }
    }
  }
}));

// GET /plg_audits?limit=50
// GET /plg_audits?query={"resource":"users","action":"update"}
```

---

## Metrics Plugin

When the MetricsPlugin is installed with Prometheus enabled, the API plugin can integrate the `/metrics` endpoint directly:

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'integrated',            // Serve via ApiPlugin (default)
    path: '/metrics',              // Endpoint path (default)
    enforceIpAllowlist: true,      // Restrict access by IP
    ipAllowlist: ['10.0.0.0/8']   // Only internal IPs
  }
}));

await db.usePlugin(new ApiPlugin({ port: 3000 }));

// GET /metrics → Prometheus text format
```

When `mode` is `'integrated'`, the metrics endpoint is served by the API server. When `mode` is `'standalone'`, MetricsPlugin runs its own HTTP server.

The API plugin also has its own built-in metrics collector at `/metrics` (JSON format by default) that tracks request latency, RPS, error rates, and auth method usage — independent of MetricsPlugin.

---

## Cloud Inventory Plugin

The Cloud Inventory plugin creates a rich catalog of AWS accounts, services, and costs under the `plg_cloud_inventory_*` resources. To expose them via REST:

```javascript
await db.usePlugin(new CloudInventoryPlugin({
  accounts: ['123456789012'],
  regions: ['us-east-1', 'us-west-2']
}));

await db.usePlugin(new ApiPlugin({
  port: 3000,
  resources: {
    plg_cloud_inventory_accounts: { methods: ['GET'] },
    plg_cloud_inventory_resources: true,
    plg_cloud_inventory_costs: {
      methods: ['GET'],
      auth: ['jwt']           // Optional: restrict API access
    }
  }
}));

// GET /plg_cloud_inventory_resources?limit=50
```

---

## Kubernetes Inventory Plugin

Expose Kubernetes metadata (namespaces, pods, nodes, workloads) collected by the Kubernetes Inventory plugin:

```javascript
await db.usePlugin(new KubernetesInventoryPlugin({
  kubeconfigPath: '~/.kube/config',
  syncInterval: 60_000
}));

await db.usePlugin(new ApiPlugin({
  port: 3000,
  resources: {
    plg_kube_namespaces: { methods: ['GET'] },
    plg_kube_pods: { methods: ['GET'] },
    plg_kube_nodes: { methods: ['GET'] }
  }
}));

// GET /plg_kube_pods?populate=containers  (if RelationPlugin is also installed)
```

---

## Combining with Guards

Any exposed plugin resource supports the same guard configuration as user-defined resources. Use guards to enforce RBAC or tenancy on plugin data:

```javascript
resources: {
  plg_audits: {
    methods: ['GET'],
    guard: {
      list: (ctx) => {
        if (!ctx.hasRole('admin') && !ctx.hasScope('audit:read')) {
          return false;
        }
        return true;
      },
      get: (ctx) => ctx.hasRole('admin')
    }
  }
}
```

---

## General Tips

- **Opt-in for plugin resources**: any resource whose name begins with `plg_` must be listed in `ApiPlugin.resources` to be exposed.
- **Rename routes if needed**: create a view resource or custom route if you prefer a friendlier path (e.g., `/cloud/resources`).
- **Combine with guards**: use the guards helpers to enforce tenant ownership or RBAC on plugin-provided data.
- **Documented automatically**: once exposed, the endpoints appear in `/openapi.json` and `/docs` with the right schema.

Have another plugin you'd like to expose? Add it to `ApiPlugin.resources` and the data becomes instantly RESTful.

---

## Related Guides

- **[Guards](/plugins/api/guides/guards.md)** — Row-level security and RBAC
- **[OpenAPI Docs](/plugins/api/guides/openapi.md)** — How schemas are generated
- **[Configuration](/plugins/api/reference/configuration.md)** — All config options
