# ✅ Best Practices & Troubleshooting

**Prev:** [← Usage Patterns](./usage-patterns.md)
**Main:** [← Kubernetes Inventory Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - 6 essential best practices
> - Common mistakes & fixes
> - Error handling strategies
> - Troubleshooting guide (8 scenarios)
> - Production deployment checklist
> - 30+ FAQ entries

**Time to read:** 25 minutes
**Difficulty:** Advanced

---

## 6 Essential Best Practices

### 1. Always Use Partitions for O(1) Lookups

**❌ Wrong:**
```javascript
const plugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }],
  // No partitions = O(n) scans
});
```

**✅ Correct:**
```javascript
const plugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }],
  partitions: {
    byCluster: { fields: { clusterId: 'string' } },
    byNamespace: { fields: { namespace: 'string' } },
    byResourceType: { fields: { resourceType: 'string' } }
  }
});

// Now O(1) lookups
const pods = await plugin.getSnapshots({
  clusterId: 'prod',        // O(1)
  namespace: 'production',  // O(1)
  resourceType: 'core.v1.Pod'  // O(1)
});
```

**Why:** Partitions enable instant lookups instead of scanning all resources. For 10,000+ resources, this means 1ms vs 500ms queries.

---

### 2. Filter Resource Types Appropriately

**❌ Wrong:**
```javascript
discovery: {
  select: {
    // Discovers EVERYTHING = massive dataset
    resourceTypes: []  // Empty = all types
  }
}
```

**✅ Correct:**
```javascript
discovery: {
  select: {
    // Only what you actually use
    resourceTypes: [
      'core.v1.Pod',
      'core.v1.Service',
      'apps.v1.Deployment',
      'core.v1.ConfigMap'
    ]
  }
}
```

**Why:** Unnecessary resource types inflate storage, slow queries, and increase API load.

---

### 3. Ignore Non-Essential Status Fields

**❌ Wrong:**
```javascript
discovery: {
  changeDetection: {
    enabled: true,
    ignoreFields: []  // Track every field change
  }
}
```

**✅ Correct:**
```javascript
discovery: {
  changeDetection: {
    enabled: true,
    // Ignore frequently-changing fields
    ignoreFields: [
      'status.lastProbeTime',
      'status.lastUpdateTime',
      'metadata.managedFields',
      'metadata.resourceVersion',
      'status.observedGeneration',
      'status.conditions'
    ]
  }
}
```

**Why:** Status fields change frequently without meaningful impact. Ignoring them reduces noise and storage.

---

### 4. Set TTL Based on Compliance Needs

**❌ Wrong:**
```javascript
ttl: {
  versions: 86400000  // 1 day = insufficient for audit
}
```

**✅ Correct:**
```javascript
// Development
ttl: {
  snapshots: 604800000,    // 7 days
  versions: 604800000
}

// Production
ttl: {
  snapshots: 2592000000,   // 30 days
  versions: 7776000000     // 90 days
}

// Compliance
ttl: {
  snapshots: null,         // Never delete
  versions: null
}
```

**Why:** Insufficient TTL loses audit trail. Excessive TTL wastes storage.

---

### 5. Monitor Cluster Sync Health

**❌ Wrong:**
```javascript
const plugin = new KubernetesInventoryPlugin({...});
await db.usePlugin(plugin);
// No monitoring = problems discovered too late
```

**✅ Correct:**
```javascript
const plugin = new KubernetesInventoryPlugin({...});
await db.usePlugin(plugin);

// Monitor sync health every 5 minutes
setInterval(async () => {
  const clusters = await plugin.getClusters();

  for (const cluster of clusters) {
    const snapshots = await plugin.getSnapshots({
      clusterId: cluster.id
    });

    console.log(`[${cluster.id}] ${snapshots.length} resources`);

    // Alert if sync hasn't happened recently
    if (cluster.lastSyncTime) {
      const timeSinceSync = Date.now() - new Date(cluster.lastSyncTime).getTime();
      if (timeSinceSync > 7200000) {  // 2 hours
        console.warn(`⚠️  [${cluster.id}] No sync for 2+ hours`);
        sendAlert({ cluster: cluster.id, issue: 'stale_data' });
      }
    }
  }
}, 300000);
```

**Why:** Health monitoring catches sync failures early before data becomes stale.

---

### 6. Use Environment-Specific Namespaces

**❌ Wrong:**
```javascript
// Same namespace across all environments
const devPlugin = new KubernetesInventoryPlugin({
  namespace: 'k8s_inventory'
});

const prodPlugin = new KubernetesInventoryPlugin({
  namespace: 'k8s_inventory'  // Resource collision!
});
```

**✅ Correct:**
```javascript
const plugin = new KubernetesInventoryPlugin({
  namespace: `${process.env.NODE_ENV}_k8s_inventory`
  // dev_k8s_inventory, prod_k8s_inventory
});
```

**Why:** Namespaces isolate data. Same namespace causes collisions and data mixing.

---

## Common Mistakes & Fixes

### Mistake 1: No Clusters Configured

**Symptoms:**
- Plugin initializes but discovers nothing
- No errors in logs
- getSnapshots() returns empty array

**Cause:**
```javascript
// ❌ Missing clusters
const plugin = new KubernetesInventoryPlugin({
  namespace: 'k8s_inventory'
  // No clusters defined!
});
```

**Fix:**
```javascript
// ✅ Define clusters
const plugin = new KubernetesInventoryPlugin({
  namespace: 'k8s_inventory',
  clusters: [
    { id: 'prod', kubeconfig: process.env.KUBECONFIG }
  ]
});
```

---

### Mistake 2: Authentication Fails Silently

**Symptoms:**
- Sync completes but 0 resources discovered
- No error messages
- getSnapshots() returns empty array

**Cause:**
```javascript
// ❌ Wrong authentication path
clusters: [
  {
    id: 'prod',
    kubeconfig: '/wrong/path/kubeconfig.yaml'
  }
]
```

**Fix:**
```javascript
// ✅ Verify authentication
clusters: [
  {
    id: 'prod',
    kubeconfig: process.env.KUBECONFIG || process.env.HOME + '/.kube/config'
  }
]

// Test before starting plugin
try {
  await plugin.syncCluster('prod');
  console.log('✅ Cluster accessible');
} catch (err) {
  console.error('❌ Cluster auth failed:', err.message);
}
```

---

### Mistake 3: API Rate Limits Exceeded

**Symptoms:**
- Sync starts then fails
- "rate limit exceeded" errors
- Sync hangs or becomes very slow

**Cause:**
```javascript
// ❌ Syncing too frequently
discovery: {
  interval: 60000  // Every minute = 1440 requests/day
}
```

**Fix:**
```javascript
// ✅ Reasonable sync interval
discovery: {
  interval: 1800000  // Every 30 minutes
}

// For rate-limited clusters
discovery: {
  interval: 3600000  // Every hour
}
```

---

### Mistake 4: Memory Issues from Large Clusters

**Symptoms:**
- Memory usage grows over time
- Process crashes with OOM
- Sync becomes progressively slower

**Cause:**
```javascript
// ❌ Keeping all history indefinitely
ttl: {
  snapshots: null,
  versions: null,
  changes: null
}

// With 10,000+ resources, this is gigabytes of data
```

**Fix:**
```javascript
// ✅ Aggressive cleanup for large clusters
ttl: {
  snapshots: 604800000,    // 7 days
  versions: 604800000,
  changes: 86400000        // 1 day
}

// Or enable compression in plugin
behavior: 'truncate-data'
```

---

### Mistake 5: Missing Partition for Large Result Sets

**Symptoms:**
- Queries are slow (>5 seconds)
- High CPU during queries
- getSnapshots() takes excessive time

**Cause:**
```javascript
// ❌ No partitions = O(n) scan
const pods = await plugin.getSnapshots({
  resourceType: 'core.v1.Pod'
  // Scans all 5,000+ pods!
});
```

**Fix:**
```javascript
// ✅ Use partitions for O(1) lookup
partitions: {
  byResourceType: { fields: { resourceType: 'string' } },
  byNamespace: { fields: { namespace: 'string' } }
}

// Now instant lookup
const pods = await plugin.getSnapshots({
  clusterId: 'prod',
  namespace: 'production',
  resourceType: 'core.v1.Pod'  // O(1)
});
```

---

## Error Handling Strategy

### Error Classification

```javascript
plugin.on('cluster.sync.completed', async ({ clusterId, error }) => {
  if (!error) {
    console.log(`✅ [${clusterId}] Sync successful`);
    return;
  }

  // Classify error
  if (error.code === 'ENOTFOUND') {
    console.error(`❌ [${clusterId}] Cluster unreachable`);
    // Network issue - will retry
  } else if (error.statusCode === 401) {
    console.error(`❌ [${clusterId}] Authentication failed`);
    // Auth issue - requires manual fix
    sendAlert({ cluster: clusterId, type: 'AUTH_FAILED' });
  } else if (error.statusCode === 429) {
    console.warn(`⚠️  [${clusterId}] Rate limited`);
    // Rate limit - will retry with backoff
  } else {
    console.error(`❌ [${clusterId}] Unknown error:`, error.message);
  }
});
```

---

## Troubleshooting Guide

### Issue 1: Discovery Not Running

**Solution:**
1. Check plugin initialization:
   ```javascript
   const plugin = new KubernetesInventoryPlugin({...});
   await db.usePlugin(plugin);
   console.log('Plugin initialized');
   ```

2. Verify discovery is enabled:
   ```javascript
   discovery: { enabled: true, runOnInstall: true }
   ```

3. Check cluster status:
   ```javascript
   const clusters = await plugin.getClusters();
   console.log('Configured clusters:', clusters);
   ```

---

### Issue 2: No Resources Discovered

**Solution:**
1. Verify cluster authentication:
   ```bash
   kubectl cluster-info
   kubectl get pods
   ```

2. Check resource type filtering:
   ```javascript
   // Try without filters
   discovery: {
     select: { resourceTypes: [] }  // Discover all
   }
   ```

3. Verify namespace access:
   ```bash
   kubectl get pods --all-namespaces
   ```

---

### Issue 3: High API Load

**Solution:**
1. Increase sync interval:
   ```javascript
   discovery: {
     interval: 3600000  // From 300000 to 3600000
   }
   ```

2. Filter resource types:
   ```javascript
   discovery: {
     select: {
       resourceTypes: ['core.v1.Pod', 'apps.v1.Deployment']
     }
   }
   ```

3. Use scheduled sync instead:
   ```javascript
   discovery: {
     schedule: '0 */6 * * *',  // 4x per day
     interval: null
   }
   ```

---

### Issue 4: Slow Queries

**Solution:**
1. Add partitions:
   ```javascript
   partitions: {
     byCluster: { fields: { clusterId: 'string' } },
     byNamespace: { fields: { namespace: 'string' } }
   }
   ```

2. Use more specific filters:
   ```javascript
   // ❌ Slow
   await plugin.getSnapshots({});

   // ✅ Fast
   await plugin.getSnapshots({
     clusterId: 'prod',
     namespace: 'production'
   });
   ```

---

### Issue 5: Storage Growing Too Large

**Solution:**
1. Reduce TTL:
   ```javascript
   ttl: {
     snapshots: 604800000,   // 7 days
     versions: 604800000,
     changes: 86400000
   }
   ```

2. Filter resource types:
   ```javascript
   discovery: {
     select: {
       resourceTypes: ['core.v1.Pod', 'apps.v1.Deployment']
     }
   }
   ```

3. Ignore status fields:
   ```javascript
   discovery: {
     changeDetection: {
       ignoreFields: ['status', 'metadata.managedFields']
     }
   }
   ```

---

### Issue 6: Cluster Connection Timeouts

**Solution:**
1. Increase timeout:
   ```javascript
   clusters: [
     {
       id: 'prod',
       timeout: 60000  // From 30000 to 60000
     }
   ]
   ```

2. Reduce resource types:
   ```javascript
   discovery: {
     select: {
       resourceTypes: ['core.v1.Pod', 'apps.v1.Deployment']
     }
   }
   ```

3. Check network connectivity:
   ```bash
   kubectl cluster-info
   kubectl auth can-i get pods --all-namespaces
   ```

---

### Issue 7: Permission Denied Errors

**Solution:**
1. Verify RBAC permissions:
   ```bash
   kubectl auth can-i get pods --all-namespaces
   kubectl auth can-i get deployments --all-namespaces
   ```

2. Create appropriate role:
   ```yaml
   kind: ClusterRole
   metadata:
     name: k8s-inventory
   rules:
   - apiGroups: [""]
     resources: ["pods", "services", "configmaps"]
     verbs: ["get", "list", "watch"]
   - apiGroups: ["apps"]
     resources: ["deployments", "statefulsets"]
     verbs: ["get", "list", "watch"]
   ```

---

### Issue 8: CRD Discovery Not Working

**Solution:**
1. Enable CRD discovery:
   ```javascript
   discovery: {
     customResourceDefinitions: {
       enabled: true
     }
   }
   ```

2. Verify CRDs exist:
   ```bash
   kubectl get customresourcedefinitions
   ```

3. Select specific CRDs:
   ```javascript
   discovery: {
     customResourceDefinitions: {
       enabled: true,
       select: ['istio.io', 'argoproj.io']
     }
   }
   ```

---

## Production Deployment Checklist

- ✅ Clusters configured with proper authentication
- ✅ Use environment-specific namespaces
- ✅ Partitions configured for O(1) lookups
- ✅ Resource type filtering appropriate
- ✅ Status field filtering configured
- ✅ TTL set based on compliance requirements
- ✅ Error handling & monitoring in place
- ✅ Health checks running every 5 minutes
- ✅ Alerts configured for sync failures
- ✅ API rate limits respected (interval ≥ 30 minutes)
- ✅ Change detection properly configured
- ✅ Audit trail retention matches compliance needs
- ✅ Graceful degradation on cluster failures

---

## ❓ FAQ

### General Questions

**Q: How often should I sync clusters?**

A: Depends on your needs:
- **Real-time monitoring:** 5-15 minutes (300000-900000ms)
- **Standard production:** 30-60 minutes (1800000-3600000ms)
- **Cost optimization:** Every 2-6 hours (7200000-21600000ms)
- **Compliance only:** Daily or weekly with scheduled sync

---

**Q: Can I monitor multiple clouds with one plugin?**

A: Yes! Each cluster is independent:
```javascript
clusters: [
  { id: 'aws-prod', kubeconfig: '...' },
  { id: 'gcp-prod', kubeconfig: '...' },
  { id: 'azure-prod', kubeconfig: '...' }
]
```

---

**Q: What's the maximum cluster size supported?**

A: No hard limit, but:
- **Small clusters** (<1000 pods): Use default settings
- **Medium clusters** (1000-10000 pods): Add partitions, increase interval
- **Large clusters** (10000+ pods): Aggressive filtering, scheduled sync only

---

### Configuration Questions

**Q: How much storage for 10,000 resources with 90-day retention?**

A: Approximately:
- Snapshots: ~500MB (50KB per resource)
- Versions: ~1.5GB (150KB per resource per month)
- Changes: ~500MB (50KB per change)
- **Total: ~2.5GB**

Reduce with: aggressive filtering, TTL, ignoring status fields

---

**Q: Can I have different resource types per cluster?**

A: Yes, apply at discovery level. To customize per cluster, use separate plugins with environment-specific namespaces.

---

### Performance Questions

**Q: Why are my queries slow?**

A: Check these in order:
1. No partitions configured
2. Querying without cluster/namespace filter
3. Large result sets (10000+ items)
4. Running on slow storage (S3 vs SSD)

---

**Q: How can I reduce API load?**

A:
1. Increase sync interval (1800000 or higher)
2. Filter resource types (don't sync events/logs)
3. Use scheduled sync instead of interval
4. Ignore frequently-changing status fields

---

### Compliance & Security

**Q: How do I maintain audit trail?**

A: Set TTL to null:
```javascript
ttl: {
  snapshots: null,
  versions: null,
  changes: null
}
```

Then regularly export to immutable storage (S3 versioning, database).

---

**Q: Can I detect unauthorized changes?**

A: Yes, by monitoring changes:
```javascript
plugin.on('change.detected', ({ resourceType, resourceId, diff }) => {
  if (resourceType.includes('Secret') || resourceType.includes('Role')) {
    sendAlert({ severity: 'HIGH', message: 'Security change', resource: resourceId });
  }
});
```

---

**Q: Should I monitor kube-system namespace?**

A: Depends:
- **Exclude** if only interested in applications
- **Include** if monitoring infrastructure changes
- **Include** for security audits (RBAC, secrets, network policies)

---

### Troubleshooting Questions

**Q: What if a cluster becomes unreachable?**

A: The plugin will:
1. Log error
2. Skip that cluster sync
3. Continue with other clusters
4. Retry on next interval

Old data remains available in snapshots.

---

**Q: How do I restore from old version?**

A: Query version history:
```javascript
const versions = await plugin.getVersions({
  clusterId: 'prod',
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-app'
});

const targetVersion = versions.find(v => v.version === 10);
console.log(targetVersion.data);
```

---

**Q: Can I delete historical data?**

A: Yes, set TTL or manually via database:
```javascript
const versions = await db.getResource('k8s-inventory_versions');
await versions.delete(oldVersionId);
```

But consider compliance implications before deleting audit trail.

---

**Q: How do I monitor for configuration drift?**

A: Compare current vs expected:
```javascript
const snapshot = await plugin.getSnapshots({...})[0];
const expected = loadExpectedConfig();
const drift = compare(snapshot.data, expected);
if (Object.keys(drift).length > 0) {
  console.log('Configuration drift detected:', drift);
}
```

---

**Prev:** [← Usage Patterns](./usage-patterns.md)
**Main:** [← Kubernetes Inventory Plugin](../README.md)
