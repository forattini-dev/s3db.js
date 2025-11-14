# ☸️ Kubernetes Inventory Plugin

> **Continuous Kubernetes cluster inventory with multi-cluster support, version tracking, and change detection.**
>
> **Repository:** [s3db.js/docs/plugins/kubernetes-inventory](.)

---

## ⚡ TLDR

**Automatically discover and track ALL Kubernetes resources across multiple clusters with complete version history.**

**Quick start (single cluster):**
```javascript
const plugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'local' }]  // Uses ~/.kube/config
});

await db.usePlugin(plugin);
await db.connect();

// Wait for discovery
await new Promise(resolve => setTimeout(resolve, 5000));

// Query resources
const pods = await plugin.getSnapshots({
  clusterId: 'local',
  resourceType: 'core.v1.Pod'
});

console.log(`Found ${pods.length} Pods`);
```

**Production multi-cluster:**
```javascript
new KubernetesInventoryPlugin({
  clusters: [
    { id: 'prod-us', kubeconfig: process.env.KUBECONFIG_US },
    { id: 'prod-eu', kubeconfig: process.env.KUBECONFIG_EU }
  ],
  discovery: {
    select: {
      resourceTypes: [
        'core.v1.Pod',
        'apps.v1.Deployment',
        'core.v1.Service'
      ]
    }
  },
  partitions: {
    byCluster: { fields: { clusterId: 'string' } },
    byNamespace: { fields: { namespace: 'string' } }
  }
})
```

**Performance: O(1) lookups** (vs O(n) scans with 10,000+ resources)

---

## 🎯 Key Features

| Feature | Benefit | Example |
|---------|---------|---------|
| **Multi-Cluster** | Track unlimited clusters | AWS + GCP + Azure |
| **60+ Resources** | All standard K8s types + CRDs | Pods, Deployments, Istio, ArgoCD |
| **Version History** | Immutable audit trail | Every configuration change recorded |
| **Change Detection** | Automatic diff calculation | Know exactly what changed |
| **Flexible Auth** | 6 authentication methods | Kubeconfig, in-cluster, env vars, manual |
| **O(1) Queries** | Instant lookups with partitions | Get cluster resources in 1ms |
| **Scheduled Sync** | Cron-based automation | Every 6 hours via `schedule: '0 */6 * * *'` |

---

## 📚 Documentation Guides

Start with the **Getting Started** guide, then explore guides based on your use case:

| Guide | Time | Difficulty | Topics |
|-------|------|-----------|--------|
| **[Getting Started](./guides/getting-started.md)** | 10 min | Beginner | What is K8s Inventory, installation, basic setup, 6 authentication methods |
| **[Configuration](./guides/configuration.md)** | 15 min | Intermediate | All config options, 7 patterns (dev, prod, multi-cloud, CRD-heavy), tuning |
| **[Usage Patterns](./guides/usage-patterns.md)** | 20 min | Intermediate | 5 real-world patterns with complete code, API reference, recipes |
| **[Best Practices](./guides/best-practices.md)** | 25 min | Advanced | 6 best practices, common mistakes, troubleshooting, 30+ FAQ |

**⏱️ Total learning path:** ~70 minutes to production-ready

---

## 🚀 Quick FAQ

**Q: What authentication methods are supported?**
A: 6 methods in priority order: Default kubeconfig → In-cluster service account → Kubeconfig file path → Environment variables → Manual connection → Context selection. See [Getting Started](./guides/getting-started.md#-authentication-methods).

**Q: Can I monitor multiple clusters simultaneously?**
A: Yes, configure multiple clusters in the `clusters` array. Each is tracked independently with O(1) partition-based isolation.

**Q: How much storage for 10,000 resources?**
A: Approximately 2.5GB for 90-day retention with snapshots (500MB), versions (1.5GB), changes (500MB). Reduce with TTL and filtering.

**Q: How often should I sync?**
A: Development: 10 minutes. Production: 30-60 minutes. Cost-optimized: 2-6 hours. Or use cron scheduling: `schedule: '0 */6 * * *'`

**Q: How do I detect configuration changes?**
A: Enable change detection: `changeDetection: { enabled: true, calculateDiff: true }`. Subscribe to `change.detected` events.

---

## 🎓 Configuration Patterns at a Glance

| Pattern | Interval | Filters | TTL | Use Case |
|---------|----------|---------|-----|----------|
| **Local Dev** | 10 min | Namespace-specific | 1 day | minikube, kind |
| **Production** | 30 min | Multi-cluster, all types | 30 days | EKS, GKE, AKS |
| **CI/CD** | 5 min | Essential types only | 24 hours | Staging validation |
| **Compliance** | 1 hour | Security resources | Never delete | Audit & security |
| **CRD-Heavy** | 30 min | Custom resources | 30 days | Istio, ArgoCD, Flux |
| **Cost Optimized** | 6 hours | Essential types | 7 days | Budget constraints |
| **Multi-Cloud** | 30 min | All providers | 30 days | AWS + GCP + Azure |

👉 **See detailed patterns:** [Configuration Guide](./guides/configuration.md#-configuration-patterns)

---

## 🔄 Typical Workflows

### 1. **Single Cluster Monitoring**
→ Get started in **5 minutes** with [Getting Started](./guides/getting-started.md#-quick-start-5-minutes)

### 2. **Multi-Cluster Visibility**
→ Follow Pattern 2 in [Usage Patterns](./guides/usage-patterns.md#pattern-2-multi-cluster-monitoring)

### 3. **Change Detection & Compliance**
→ Follow Pattern 3 in [Usage Patterns](./guides/usage-patterns.md#pattern-3-change-detection--alerts)

### 4. **Incident Investigation**
→ Follow Pattern 4 in [Usage Patterns](./guides/usage-patterns.md#pattern-4-version-history--audit-trail)

### 5. **Automated Sync with Webhooks**
→ Follow Pattern 5 in [Usage Patterns](./guides/usage-patterns.md#pattern-5-scheduled-discovery-with-webhooks)

---

## 📊 API Quick Reference

**Core Methods:**
- `getSnapshots(filter)` - Get current resource state
- `getVersions(filter)` - Get resource version history
- `getChanges(filter)` - Get changes between versions
- `getClusters()` - List configured clusters
- `syncCluster(clusterId)` - Manually trigger cluster sync

**Events:**
- `cluster.sync.started` - Sync begins
- `cluster.sync.completed` - Sync finishes
- `resource.discovered` - New resource found
- `change.detected` - Changes detected

👉 **Full reference:** [Usage Patterns - API Reference](./guides/usage-patterns.md#api-reference)

---

## ✅ Production Deployment Checklist

- ✅ Clusters configured with proper authentication
- ✅ Use environment-specific namespaces
- ✅ Partitions configured for O(1) lookups
- ✅ Resource type filtering appropriate
- ✅ Status field filtering configured
- ✅ TTL set based on compliance requirements
- ✅ Error handling & monitoring in place
- ✅ Health checks running every 5 minutes
- ✅ Alerts configured for sync failures
- ✅ API rate limits respected (interval ≥ 30 min)

👉 **Full checklist:** [Best Practices - Production Checklist](./guides/best-practices.md#production-deployment-checklist)

---

## 🆘 Common Issues

| Issue | Solution | Link |
|-------|----------|------|
| No resources discovered | Check authentication, verify cluster accessible | [Troubleshooting](./guides/best-practices.md#issue-2-no-resources-discovered) |
| Queries are slow | Add partitions, filter by cluster/namespace | [Performance](./guides/best-practices.md#issue-4-slow-queries) |
| High API load | Increase sync interval to 1800000+ | [Rate Limits](./guides/best-practices.md#mistake-3-api-rate-limits-exceeded) |
| Memory growing | Set appropriate TTL, enable cleanup | [Memory Issues](./guides/best-practices.md#issue-5-storage-growing-too-large) |
| Auth failures | Verify kubeconfig path, test with kubectl | [Troubleshooting](./guides/best-practices.md#troubleshooting-guide) |

👉 **Full troubleshooting:** [Best Practices](./guides/best-practices.md#troubleshooting-guide)

---

## 🔗 Related Plugins

- **[TTL Plugin](../ttl.md)** - Auto-cleanup expired resources
- **[Cache Plugin](../cache.md)** - Cache query results
- **[Replicator Plugin](../replicator.md)** - Sync to PostgreSQL/BigQuery
- **[Metrics Plugin](../metrics.md)** - Performance monitoring

---

## 📖 Learning Path

```
Start Here
    ↓
Getting Started (10 min) - Basics & authentication
    ↓
Configuration (15 min) - All options & patterns
    ↓
Usage Patterns (20 min) - Real-world examples
    ↓
Best Practices (25 min) - Production readiness
    ↓
Ready for Production! 🚀
```

**Estimated total time:** ~70 minutes

---

## 💡 Quick Tips

1. **Start simple:** Begin with [Getting Started](./guides/getting-started.md) using default kubeconfig
2. **Add partitions:** Use `byCluster`, `byNamespace`, `byResourceType` partitions for O(1) queries
3. **Filter wisely:** Only sync resource types you actually need
4. **Monitor health:** Check sync status every 5 minutes with `getClusters()`
5. **Ignore noisy fields:** Filter out `status.*` and `metadata.managedFields` to reduce noise

---

## 📄 License

MIT - Same as s3db.js

---

**Navigation:**
- [← Back to Plugins Index](../README.md)
- [Getting Started →](./guides/getting-started.md)
- [Configuration →](./guides/configuration.md)
- [Usage Patterns →](./guides/usage-patterns.md)
- [Best Practices →](./guides/best-practices.md)
