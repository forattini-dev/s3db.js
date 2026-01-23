# 🚀 Getting Started with Kubernetes Inventory Plugin

**Prev:** [← Kubernetes Inventory Plugin](../README.md)
**Next:** [Configuration →](./configuration.md)
**Main:** [← Kubernetes Inventory Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - What is Kubernetes Inventory
> - Installation and dependencies
> - Basic single cluster setup
> - Your first discovery
> - Understanding data structures

**Time to read:** 10 minutes
**Difficulty:** Beginner

---

## What is Kubernetes Inventory Plugin?

Kubernetes Inventory Plugin automatically discovers and tracks **ALL Kubernetes resources** across multiple clusters. It maintains:

1. **Snapshots** - Latest state of each resource
2. **Versions** - Complete immutable history
3. **Changes** - Diffs between versions

Think of it as a **time machine for your Kubernetes infrastructure** - see what changed, when it changed, and how it changed.

### When to use

- ✅ Track all resources across multiple clusters
- ✅ Monitor configuration changes in real-time
- ✅ Maintain audit trail for compliance
- ✅ Detect unauthorized modifications
- ✅ Troubleshoot resource issues with history
- ✅ Report on cluster inventory

### Performance highlights

- **O(1) queries** - Instant lookup by cluster (via partitions)
- **60+ resources** - All standard K8s resources + CRDs
- **Multi-cluster** - Track unlimited clusters simultaneously
- **Change detection** - SHA256-based diff calculation

---

## 📦 Installation & Dependencies

### Install Required Packages

```bash
pnpm install s3db.js
pnpm install @kubernetes/client-node
```

### Verify Kubernetes Access

Test that your cluster is reachable:

```bash
kubectl cluster-info
kubectl get nodes
```

If kubectl works, the plugin will work!

---

## ⚡ Quick Start (5 minutes)

### 1. Basic Single Cluster Setup

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@bucket/k8s-inventory'
});

// Create plugin with minimal config
const plugin = new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'local',
      name: 'Local Kubernetes Cluster'
      // Uses default kubeconfig (~/.kube/config)
    }
  ],
  discovery: {
    runOnInstall: true  // Auto-discover on install
  }
});

await db.usePlugin(plugin);
await db.connect();

console.log('✅ Plugin initialized and discovery started');
```

### 2. Wait for Initial Discovery

```javascript
// Wait for discovery to complete (5-30 seconds depending on cluster size)
await new Promise(resolve => setTimeout(resolve, 10000));
```

### 3. Query Discovered Resources

```javascript
// Get all Pods in local cluster
const pods = await plugin.getSnapshots({
  clusterId: 'local',
  resourceType: 'core.v1.Pod'
});

console.log(`Found ${pods.length} Pods`);

// Get all Deployments
const deployments = await plugin.getSnapshots({
  clusterId: 'local',
  resourceType: 'apps.v1.Deployment'
});

console.log(`Found ${deployments.length} Deployments`);
```

### 4. Check Resource History

```javascript
if (deployments.length > 0) {
  const deployment = deployments[0];

  // Get version history
  const versions = await plugin.getVersions({
    clusterId: 'local',
    resourceType: deployment.resourceType,
    resourceId: deployment.resourceId
  });

  console.log(`${deployment.name} has ${versions.length} version(s)`);
}
```

### 5. Detect Changes

```javascript
// Get all resource changes
const changes = await plugin.getChanges({
  clusterId: 'local'
});

console.log(`Detected ${changes.length} changes`);

// Show sample change
if (changes.length > 0) {
  const change = changes[0];
  console.log(`v${change.fromVersion} → v${change.toVersion}:`);
  console.log(`  Added: ${Object.keys(change.diff.added || {}).length} fields`);
  console.log(`  Changed: ${Object.keys(change.diff.updated || {}).length} fields`);
}
```

### 6. Graceful Shutdown

```javascript
await db.disconnect();
console.log('✅ Disconnected');
```

---

## Understanding Data Structures

### Snapshot (Latest State)

```javascript
{
  id: 'unique-id',
  clusterId: 'local',
  resourceType: 'core.v1.Pod',
  resourceId: 'my-pod',
  namespace: 'default',
  name: 'my-pod',

  // Version tracking
  latestVersion: 3,
  latestDigest: 'sha256:abc123...',

  // Captured state
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T12:00:00Z',

  // Full resource data
  data: { /* complete K8s object */ }
}
```

### Version (Historical Record)

```javascript
{
  id: 'unique-id',
  clusterId: 'local',
  resourceType: 'core.v1.Pod',
  resourceId: 'my-pod',

  // Version number (immutable)
  version: 1,
  digest: 'sha256:abc123...',

  // What changed
  previousDigest: 'sha256:older...',

  // When captured
  capturedAt: '2024-01-01T00:00:00Z',

  // Full resource at this version
  data: { /* complete K8s object */ }
}
```

### Change (Diff Record)

```javascript
{
  id: 'unique-id',
  clusterId: 'local',
  resourceType: 'core.v1.Pod',
  resourceId: 'my-pod',

  // What changed
  fromVersion: 1,
  toVersion: 2,

  // Detailed diff
  diff: {
    added: {
      'spec.containers[0].image': 'new-image:v2'
    },
    removed: {
      'spec.containers[0].image': 'old-image:v1'
    },
    updated: {
      'status.phase': { from: 'Pending', to: 'Running' }
    }
  },

  capturedAt: '2024-01-01T12:00:00Z'
}
```

---

## Common Discovery Use Cases

### Discover All Resources

```javascript
// Get everything in the cluster
const allResources = await plugin.getSnapshots({
  clusterId: 'local'
});

console.log(`Total resources: ${allResources.length}`);
```

### Discover by Namespace

```javascript
// Only production namespace
const prodResources = await plugin.getSnapshots({
  clusterId: 'local',
  namespace: 'production'
});

console.log(`Resources in production: ${prodResources.length}`);
```

### Discover by Resource Type

```javascript
// Only Deployments
const deployments = await plugin.getSnapshots({
  clusterId: 'local',
  resourceType: 'apps.v1.Deployment'
});

console.log(`Deployments: ${deployments.length}`);
```

### Get Resource Details

```javascript
// Specific Pod
const pods = await plugin.getSnapshots({
  clusterId: 'local',
  resourceType: 'core.v1.Pod',
  resourceId: 'my-pod'
});

if (pods.length > 0) {
  const pod = pods[0];
  console.log('Pod details:', {
    name: pod.name,
    namespace: pod.namespace,
    status: pod.data.status.phase,
    containers: pod.data.spec.containers.length
  });
}
```

---

## Authentication Methods

The plugin supports **6 authentication methods** (in priority order):

### Method 1: Default Kubeconfig (Easiest)

```javascript
// Uses ~/.kube/config automatically
const plugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'local' }]  // No auth config needed!
});
```

**When to use:** Local development, kubeconfig already configured

---

### Method 2: In-Cluster Service Account

```javascript
// Uses mounted service account in Kubernetes Pod
const plugin = new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'self',
      inCluster: true  // Reads from /var/run/secrets/...
    }
  ]
});
```

**When to use:** Running inside Kubernetes, no kubeconfig available

---

### Method 3: Kubeconfig File Path

```javascript
// Use specific kubeconfig file
const plugin = new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'prod',
      kubeconfig: '/path/to/prod-kubeconfig.yaml'
    }
  ]
});
```

**When to use:** Custom kubeconfig location

---

### Method 4: Environment Variables

```bash
# Set environment variable with kubeconfig file path
export KUBECONFIG_PROD=/path/to/prod-kubeconfig.yaml
# OR kubeconfig content (base64-encoded)
export KUBECONFIG_CONTENT_PROD=$(cat ~/.kube/config | base64)
```

```javascript
// Auto-detects and uses KUBECONFIG_PROD or KUBECONFIG_CONTENT_PROD
const plugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }]
});
```

**When to use:** CI/CD, secure credential management

---

### Method 5: Manual Connection

```javascript
// Hardcoded credentials (only for testing!)
const plugin = new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'manual',
      connection: {
        server: 'https://k8s.example.com:6443',
        token: 'your-service-account-token',
        caData: 'base64-encoded-ca-cert'
      }
    }
  ]
});
```

**When to use:** Dynamic credentials from secrets manager

---

### Method 6: Context Selection

```javascript
// Use specific context from kubeconfig
const plugin = new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'prod-us',
      context: 'prod-us-context'  // From kubeconfig contexts
    },
    {
      id: 'prod-eu',
      context: 'prod-eu-context'  // Different context, same kubeconfig
    }
  ]
});
```

**When to use:** Single kubeconfig with multiple contexts

---

## Common Mistakes

### ❌ Mistake 1: Not Waiting for Discovery

```javascript
// ❌ WRONG - Query immediately
const plugin = new KubernetesInventoryPlugin({...});
await db.usePlugin(plugin);

const pods = await plugin.getSnapshots({ clusterId: 'local' });
// Might be empty if discovery hasn't completed yet!
```

**Fix:**
```javascript
// ✅ CORRECT - Wait for discovery
const plugin = new KubernetesInventoryPlugin({...});
await db.usePlugin(plugin);
await new Promise(r => setTimeout(r, 10000));  // Wait 10 seconds

const pods = await plugin.getSnapshots({ clusterId: 'local' });
```

---

### ❌ Mistake 2: Using Wrong Cluster ID

```javascript
// ❌ WRONG - Cluster doesn't exist
const pods = await plugin.getSnapshots({
  clusterId: 'nonexistent-cluster'  // Not configured!
});
// Returns empty array, no error
```

**Fix:**
```javascript
// ✅ CORRECT - Use configured cluster ID
const clusters = await plugin.getClusters();
console.log('Available:', clusters.map(c => c.id));

const pods = await plugin.getSnapshots({
  clusterId: 'local'  // Matches configuration
});
```

---

### ❌ Mistake 3: Querying All Data Unfiltered

```javascript
// ❌ WRONG - Too much data
const allResources = await plugin.getSnapshots({});
// Returns 1000s of resources, slow!
```

**Fix:**
```javascript
// ✅ CORRECT - Use filters
const pods = await plugin.getSnapshots({
  clusterId: 'local',
  resourceType: 'core.v1.Pod',
  namespace: 'production'
});
```

---

## Next Steps

1. **Configure your cluster** → [Configuration Guide](./configuration.md)
2. **See real-world patterns** → [Usage Patterns](./usage-patterns.md)
3. **Production setup** → [Best Practices](./best-practices.md)

---

**Prev:** [← Kubernetes Inventory Plugin](../README.md)
**Next:** [Configuration →](./configuration.md)
**Main:** [← Kubernetes Inventory Plugin](../README.md)
