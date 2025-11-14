# 🔌 Plugin Integrations

> **Navigation:** [← Back to API Plugin](./README.md) | [Configuration →](./configuration.md)

The API Plugin plays nicely with other first-party plugins. This guide shows how to expose their data through REST endpoints with zero ceremony.

---

## Relation Plugin

- Install the [RelationPlugin](../relation.md) *before* the API plugin.
- All `GET` endpoints gain `?populate=` to hydrate relationships (`?populate=customer,items.product`).
- Unknown relation paths raise `400 INVALID_POPULATE` automatically.
- Individual relations can be hidden by setting `resources[resourceName].relations[relationName].expose = false`.

```javascript
await db.usePlugin(new RelationPlugin({ relations: { /* ... */ } }));
await db.usePlugin(new ApiPlugin({ port: 3000 }));

// GET /orders?populate=customer,items.product
```

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

All resources created by the plugin are available in `db.resources`. Those whose name starts with `plg_` are hidden by default; listing them in `ApiPlugin.resources` opt-in to REST exposure.

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

Just like other resources, you retain full control over guards, pagination, and relation hydration.

---

## General Tips

- **Opt-in for plugin resources**: any resource whose name begins with `plg_` must be listed in `ApiPlugin.resources` to be exposed.
- **Rename routes if needed**: create a view resource or custom route if you prefer a friendlier path (e.g., `/cloud/resources`).
- **Combine with guards**: use the guards helpers to enforce tenant ownership or RBAC on plugin-provided data.
- **Documented automatically**: once exposed, the endpoints appear in `/openapi.json` and Swagger UI with the right schema.

Have another plugin you’d like to expose? Add it to `ApiPlugin.resources` and the data becomes instantly RESTful.

