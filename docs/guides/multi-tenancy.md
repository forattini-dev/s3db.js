# 🏢 Multi-Tenancy with Plugins

> **Isolate data, manage multiple environments, and support multi-tenant architectures using the Plugin Namespace System.**
>
> **Related:** [Plugin Architecture](/plugins/README.md#️-plugin-architecture) | [API Reference](/plugins/README.md#-plugin-namespace-api-reference)

---

s3db.js plugins feature a built-in **Namespace System** that allows you to run multiple instances of the same plugin side-by-side without data collisions. This is essential for multi-tenant SaaS applications, CI/CD environments, and segregating production data from staging.

## 🎯 The Concept

By default, plugins use a "global" context. When you introduce a **namespace**, s3db.js automatically prefixes all underlying resources and storage keys.

### Without Namespace (Global)
```javascript
new ReconPlugin();
// Resources: plg_recon_hosts
// Storage:   plugin=recon/default/...
```

### With Namespace
```javascript
new ReconPlugin({ namespace: 'client-a' });
// Resources: plg_client-a_recon_hosts
// Storage:   plugin=recon/client-a/...
```

**Why "Namespace First"?**
Resource names follow the pattern `plg_{namespace}_{plugin}_{resource}`. This groups all resources for a specific tenant together alphabetically in your database, making management easier.

---

## 🚀 Usage Examples

### Scenario 1: Multi-Environment Setup

Run Production and Staging in the same bucket (cost-effective for small apps).

```javascript
const db = new S3db({ connectionString: '...' });

// 🟢 Production Cache
const prodCache = new CachePlugin({
  namespace: 'production',
  driver: 's3',
  ttl: 3600000 // 1 hour
});

// 🟡 Staging Cache
const stagingCache = new CachePlugin({
  namespace: 'staging',
  driver: 'memory',
  ttl: 300000 // 5 minutes
});

// Both run safely in parallel
await db.usePlugin(prodCache);
await db.usePlugin(stagingCache);
```

### Scenario 2: Multi-Tenant SaaS

Isolate data for different customers.

```javascript
const tenants = ['acme-corp', 'globex', 'soylent'];

for (const tenantId of tenants) {
  // Each tenant gets their own isolated metric storage
  const metrics = new MetricsPlugin({
    namespace: tenantId,
    interval: 60000
  });
  
  await db.usePlugin(metrics);
}

// Accessing tenant data
const acmeMetrics = db.plugins['metrics-acme-corp']; // Plugin instance alias
```

---

## 🛡️ Safety Features

The namespace system includes built-in safety nets to prevent accidental data overlap.

### Automatic Detection & Warnings

When you initialize a plugin, s3db.js scans your storage for existing namespaces and warns you if you might be connecting to the wrong one.

```javascript
// Console Output:
// [ReconPlugin] Detected 2 existing namespace(s): production, staging
// [ReconPlugin] Using namespace: "development"  <-- confirm this is intended
```

### Validation Rules

Namespaces must adhere to strict format rules to ensure S3 compatibility:
*   ✅ Alphanumeric characters (`a-z`, `0-9`)
*   ✅ Hyphens (`-`) and Underscores (`_`)
*   ✅ Length: 1-50 characters
*   ❌ No spaces, slashes, or special symbols

---

## 🔧 How It Works (Under the Hood)

### 1. Resource Isolation
Plugins automatically rename their required resources.

| Namespace | Original Name | Actual Resource Name |
| :--- | :--- | :--- |
| (default) | `plg_recon_hosts` | `plg_recon_hosts` |
| `prod` | `plg_recon_hosts` | `plg_prod_recon_hosts` |
| `test-1` | `plg_recon_hosts` | `plg_test-1_recon_hosts` |

### 2. Storage Isolation
`PluginStorage` (the key-value store used by plugins) creates isolated folders in S3.

*   `s3://bucket/db/plugin=recon/prod/config`
*   `s3://bucket/db/plugin=recon/test-1/config`

### 3. Event Isolation
Events emitted by the plugin are tagged with the namespace, allowing you to filter listeners.

```javascript
plugin.on('scan:complete', (data) => {
  console.log(`Scan complete for ${plugin.namespace}`);
});
```

---

## 💡 Best Practices

1.  **Consistent Naming**: Use a shared ID generator for namespaces (e.g., `tenant_123`, `env_prod`).
2.  **Separate Buckets for Scale**: For high-volume tenants, consider using separate S3 buckets (via separate `Database` instances) instead of namespaces. Namespaces are best for logical separation within a shared capacity.
3.  **Resource Cleanup**: When deleting a tenant, remember to uninstall the namespaced plugin with `purgeData: true`.

```javascript
// 🗑️ Completely remove tenant data
await acmePlugin.uninstall({ purgeData: true });
```
