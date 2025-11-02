# ☸️ Kubernetes Inventory Plugin

> **Continuous Kubernetes cluster inventory with multi-cluster support, version tracking, and change detection.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Automatically discover and track ALL Kubernetes resources across multiple clusters with complete version history.**

**1 line to get started:**
```javascript
await db.usePlugin(new KubernetesInventoryPlugin({ clusters: [{ id: 'local' }] }));
```

**Production-ready multi-cluster setup:**
```javascript
await db.usePlugin(new KubernetesInventoryPlugin({
  clusters: [
    { id: 'prod-us', context: 'prod-us-context', tags: { env: 'production', region: 'us' } },
    { id: 'prod-eu', context: 'prod-eu-context', tags: { env: 'production', region: 'eu' } }
  ],
  discovery: {
    runOnInstall: true,           // Auto-discover on plugin install
    select: ['core.*', 'apps.*'], // Only core and apps resources
    ignore: ['*.Event', '*.Lease'], // Ignore noisy resources
    concurrency: 2                // Max 2 clusters syncing in parallel
  },
  resourceNames: {
    snapshots: 'k8s_prod_snapshots',  // Custom resource names
    versions: 'k8s_prod_versions',
    changes: 'k8s_prod_changes',
    clusters: 'k8s_prod_clusters'
  }
}));

// Query resources from specific cluster
const pods = await plugin.getSnapshots({
  clusterId: 'prod-us',
  resourceType: 'core.v1.Pod'
});
```

**Key features:**
- ✅ **Multi-Cluster Support** - Track unlimited clusters with O(1) isolation via partitions
- ✅ **Complete Resource Coverage** - 60+ standard K8s resources + auto-discovered CRDs
- ✅ **Version Tracking** - Immutable history with SHA256-based change detection
- ✅ **Flexible Authentication** - Kubeconfig file, env vars, in-cluster, manual connection
- ✅ **Context Selection** - Single kubeconfig with multiple contexts
- ✅ **Smart Filtering** - Select/ignore patterns with wildcard support
- ✅ **Scheduled Discovery** - Cron-based automated inventory updates

**Performance comparison:**
```javascript
// ❌ Without partitioning: O(n) scan through all clusters
const allSnapshots = await snapshotsResource.list();
const prodUSData = allSnapshots.filter(s => s.clusterId === 'prod-us');
// Performance: O(n) - scans all 10,000+ resources

// ✅ With partitioning: O(1) cluster lookup
const prodUSData = await plugin.getSnapshots({ clusterId: 'prod-us' });
// Performance: O(1) - direct partition access to 500 resources
```

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [Usage Journey](#usage-journey)
   - [Level 1: Basic Single Cluster](#level-1-basic-single-cluster)
   - [Level 2: Multi-Cluster Management](#level-2-multi-cluster-management)
   - [Level 3: Resource Filtering](#level-3-resource-filtering)
   - [Level 4: Version History & Changes](#level-4-version-history--changes)
   - [Level 5: Custom Authentication](#level-5-custom-authentication)
   - [Level 6: Context Selection](#level-6-context-selection)
   - [Level 7: Production Setup](#level-7-production-setup)
4. [📊 Configuration Reference](#-configuration-reference)
5. [📚 Configuration Examples](#-configuration-examples)
6. [🔧 API Reference](#-api-reference)
7. [✅ Best Practices](#-best-practices)
8. [🚨 Error Handling](#-error-handling)
9. [🔗 See Also](#-see-also)
10. [❓ FAQ](#-faq)

---

## ⚡ Quickstart

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/databases/k8s-inventory'
});

// Create plugin with basic configuration
const plugin = new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'local',
      name: 'Local Kubernetes Cluster',
      // Uses default kubeconfig (~/.kube/config)
    }
  ],
  discovery: {
    runOnInstall: true,  // Auto-discover on install
    includeCRDs: true    // Include Custom Resource Definitions
  }
});

await db.usePlugin(plugin);
await db.connect();

// Wait for initial discovery
await new Promise(resolve => setTimeout(resolve, 5000));

// Query all Pods
const pods = await plugin.getSnapshots({
  clusterId: 'local',
  resourceType: 'core.v1.Pod'
});

console.log(`Found ${pods.length} Pods`);

// Get version history for a specific Pod
if (pods.length > 0) {
  const versions = await plugin.getVersions({
    clusterId: 'local',
    resourceType: pods[0].resourceType,
    resourceId: pods[0].resourceId
  });
  console.log(`Pod has ${versions.length} version(s) in history`);
}

await db.disconnect();
```

---

## Usage Journey

### Level 1: Basic Single Cluster

Connect to your local Kubernetes cluster and discover all resources.

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/k8s'
});

const plugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'local', name: 'Local Cluster' }],
  discovery: { runOnInstall: true }
});

await db.usePlugin(plugin);
await db.connect();

// Discover what resource types are available
const resourceTypes = await plugin.discoverResourceTypes('local');
console.log(`Discovered ${resourceTypes.length} resource types`);

// Get all resources in default namespace
const defaultResources = await plugin.getSnapshots({
  clusterId: 'local',
  namespace: 'default'
});
console.log(`Found ${defaultResources.length} resources in default namespace`);

await db.disconnect();
```

**What's happening:**
- Plugin connects to your default kubeconfig (~/.kube/config)
- Discovers all available K8s resource types (Pods, Services, Deployments, etc.)
- Auto-discovers Custom Resource Definitions (CRDs)
- Stores snapshots of all resources in s3db

---

### Level 2: Multi-Cluster Management

Track multiple Kubernetes clusters simultaneously.

```javascript
const plugin = new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'prod-us',
      name: 'Production US',
      kubeconfig: '/path/to/prod-us-kubeconfig',
      tags: { env: 'production', region: 'us-east' }
    },
    {
      id: 'prod-eu',
      name: 'Production EU',
      kubeconfig: '/path/to/prod-eu-kubeconfig',
      tags: { env: 'production', region: 'eu-west' }
    },
    {
      id: 'staging',
      name: 'Staging',
      // Uses KUBECONFIG_STAGING environment variable
      tags: { env: 'staging' }
    }
  ],
  discovery: {
    runOnInstall: true,
    concurrency: 2  // Sync max 2 clusters in parallel
  }
});

await db.usePlugin(plugin);
await db.connect();

// Query specific cluster
const prodUSPods = await plugin.getSnapshots({
  clusterId: 'prod-us',
  resourceType: 'core.v1.Pod'
});

// Compare clusters
const allClusters = await plugin.getClusters();
allClusters.forEach(cluster => {
  console.log(`${cluster.name}: ${cluster.status} (last sync: ${cluster.lastRunAt})`);
});

await db.disconnect();
```

**New concepts:**
- Each cluster has unique `id` for isolation
- clusterId field in all snapshots/versions/changes
- Partitions enable O(1) cluster-specific queries
- Tags for cluster metadata/filtering
- Concurrent sync with configurable concurrency

---

### Level 3: Resource Filtering

Control which resources to track using select/ignore patterns.

```javascript
const plugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }],
  discovery: {
    runOnInstall: true,

    // WHITELIST: Only track these resources
    select: [
      'core.*',              // All core resources (Pods, Services, ConfigMaps, etc.)
      'apps.*',              // All apps resources (Deployments, StatefulSets, etc.)
      'networking.k8s.io.*'  // All networking resources
    ],

    // BLACKLIST: Exclude these from selected resources
    ignore: [
      '*.Event',       // Ignore Events (too noisy)
      '*.Lease',       // Ignore Leases (ephemeral)
      'core.v1.Secret' // Ignore Secrets (security)
    ],

    // Namespace filtering
    namespaces: ['default', 'production', 'monitoring'],
    excludeNamespaces: ['kube-system', 'kube-public'],

    // Resource type toggles
    includeSecrets: false,    // Don't store Secret data
    includeConfigMaps: true,
    includeCRDs: true
  }
});

await db.usePlugin(plugin);
await db.connect();

// All queries automatically filtered
const snapshots = await plugin.getSnapshots({ clusterId: 'prod' });
// Will NOT contain Events, Leases, or Secrets

await db.disconnect();
```

**New concepts:**
- Select = whitelist (if null, all resources selected)
- Ignore = blacklist (applied after select)
- Wildcard patterns: `core.*`, `*.Pod`, `networking.*`
- Namespace-level filtering
- Security-focused filtering (exclude secrets)

---

### Level 4: Version History & Changes

Track resource changes over time with complete version history.

```javascript
const plugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }],
  discovery: { runOnInstall: true }
});

await db.usePlugin(plugin);
await db.connect();

// Get a specific Deployment snapshot
const deployments = await plugin.getSnapshots({
  clusterId: 'prod',
  resourceType: 'apps.v1.Deployment',
  namespace: 'production'
});

if (deployments.length > 0) {
  const deployment = deployments[0];

  // Get complete version history
  const versions = await plugin.getVersions({
    clusterId: 'prod',
    resourceType: deployment.resourceType,
    resourceId: deployment.resourceId
  });

  console.log(`Deployment "${deployment.name}" has ${versions.length} versions`);
  versions.forEach(v => {
    console.log(`  Version ${v.version}: ${v.capturedAt}`);
  });

  // Get all changes (diffs)
  const changes = await plugin.getChanges({
    clusterId: 'prod',
    resourceType: deployment.resourceType,
    resourceId: deployment.resourceId
  });

  console.log(`\nDetected ${changes.length} changes:`);
  changes.forEach(change => {
    console.log(`  v${change.fromVersion} → v${change.toVersion}:`);
    console.log(`    Added: ${Object.keys(change.diff.added || {}).length} fields`);
    console.log(`    Removed: ${Object.keys(change.diff.removed || {}).length} fields`);
    console.log(`    Updated: ${Object.keys(change.diff.updated || {}).length} fields`);
  });
}

await db.disconnect();
```

**New concepts:**
- Snapshots = latest state of each resource
- Versions = immutable history (never deleted)
- Changes = diffs between versions
- SHA256 digest-based change detection
- Complete audit trail

---

### Level 5: Custom Authentication

Use different authentication methods for each cluster.

```javascript
const plugin = new KubernetesInventoryPlugin({
  clusters: [
    // Method 1: Direct file path
    {
      id: 'local',
      kubeconfig: '~/.kube/config',
      context: 'minikube'
    },

    // Method 2: Environment variable (file path)
    // Uses KUBECONFIG_PROD_US env var
    {
      id: 'prod-us'
    },

    // Method 3: Environment variable (content)
    // Uses KUBECONFIG_CONTENT_PROD_EU env var
    {
      id: 'prod-eu'
    },

    // Method 4: Direct content string
    {
      id: 'staging',
      kubeconfigContent: process.env.STAGING_KUBECONFIG_YAML
    },

    // Method 5: In-cluster service account
    {
      id: 'self',
      inCluster: true
    },

    // Method 6: Manual connection
    {
      id: 'manual',
      connection: {
        server: 'https://k8s.example.com:6443',
        token: process.env.K8S_TOKEN,
        caData: process.env.K8S_CA_CERT
      }
    }
  ],
  discovery: { runOnInstall: false }
});

await db.usePlugin(plugin);
await db.connect();

// Manually sync specific cluster
await plugin.syncCluster('prod-us');

await db.disconnect();
```

**New concepts:**
- 6-level authentication priority
- Per-cluster auth configuration
- Environment variable patterns (KUBECONFIG_<CLUSTER_ID>)
- Base64 auto-detection for env vars
- Path expansion (~, ${VAR}, $VAR)
- Manual sync for control

---

### Level 6: Context Selection

Use single kubeconfig with multiple contexts for different clusters.

```javascript
// Set up environment variable with multi-context kubeconfig
// export KUBECONFIG_CONTENT=$(cat ~/.kube/config | base64)

const plugin = new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'prod-us',
      // Uses KUBECONFIG_CONTENT env var
      context: 'prod-us-context',
      tags: { env: 'production', region: 'us' }
    },
    {
      id: 'prod-eu',
      // Same kubeconfig, different context
      context: 'prod-eu-context',
      tags: { env: 'production', region: 'eu' }
    },
    {
      id: 'staging',
      // File-based with context
      kubeconfig: '~/.kube/config',
      context: 'staging-context',
      tags: { env: 'staging' }
    }
  ],
  discovery: { runOnInstall: true }
});

await db.usePlugin(plugin);
await db.connect();

// Each cluster isolated despite sharing kubeconfig
const prodUSData = await plugin.getSnapshots({ clusterId: 'prod-us' });
const prodEUData = await plugin.getSnapshots({ clusterId: 'prod-eu' });

console.log(`US cluster: ${prodUSData.length} resources`);
console.log(`EU cluster: ${prodEUData.length} resources`);

await db.disconnect();
```

**New concepts:**
- Single kubeconfig file with multiple contexts
- Context switching per cluster configuration
- Mix file-based and env var sources
- Complete cluster isolation despite shared config

---

### Level 7: Production Setup

Complete production-ready configuration with all features.

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/prod-k8s-inventory'
});

const plugin = new KubernetesInventoryPlugin({
  // ============================================
  // MULTI-CLUSTER CONFIGURATION
  // ============================================
  clusters: [
    {
      id: 'prod-us-east',
      name: 'Production US East',
      context: 'prod-us-east-context',
      tags: { env: 'production', region: 'us-east', provider: 'aws' },
      metadata: { clusterVersion: '1.28', nodeCount: 25 },

      // Cluster-specific discovery options
      discovery: {
        namespaces: ['production', 'monitoring'],
        excludeNamespaces: ['kube-system']
      }
    },
    {
      id: 'prod-eu-west',
      name: 'Production EU West',
      context: 'prod-eu-west-context',
      tags: { env: 'production', region: 'eu-west', provider: 'gcp' },
      metadata: { clusterVersion: '1.28', nodeCount: 20 }
    },
    {
      id: 'staging',
      name: 'Staging',
      kubeconfig: '/etc/k8s/staging-kubeconfig',
      tags: { env: 'staging' }
    }
  ],

  // ============================================
  // GLOBAL DISCOVERY OPTIONS
  // ============================================
  discovery: {
    runOnInstall: true,
    concurrency: 2,
    dryRun: false,

    // Resource filtering
    select: [
      'core.*',              // Pods, Services, ConfigMaps, PVCs
      'apps.*',              // Deployments, StatefulSets, DaemonSets
      'batch.*',             // Jobs, CronJobs
      'networking.k8s.io.*'  // Ingress, NetworkPolicies
    ],
    ignore: [
      '*.Event',
      '*.Lease',
      'core.v1.Secret'  // Security: don't store secret data
    ],

    // Resource toggles
    includeSecrets: false,
    includeConfigMaps: true,
    includeCRDs: true,
    crdCacheTTL: 300000,  // 5 minutes

    // Core resource categories
    coreResources: true,
    appsResources: true,
    batchResources: true,
    networkingResources: true,
    storageResources: true,
    rbacResources: true
  },

  // ============================================
  // SCHEDULED DISCOVERY
  // ============================================
  schedule: {
    enabled: true,
    cron: '*/15 * * * *',  // Every 15 minutes
    clusters: ['prod-us-east', 'prod-eu-west', 'staging']
  },

  // ============================================
  // RESOURCE NAMING (EXTERNALIZATION)
  // ============================================
  resourceNames: {
    snapshots: 'k8s_prod_snapshots',
    versions: 'k8s_prod_versions',
    changes: 'k8s_prod_changes',
    clusters: 'k8s_prod_clusters'
  },

  // ============================================
  // LOGGING
  // ============================================
  logger: (level, message, meta) => {
    console.log(`[K8S-INVENTORY][${level.toUpperCase()}]`, message, meta);
  },
  verbose: true
});

await db.usePlugin(plugin);
await db.connect();

// ============================================
// PRODUCTION QUERIES
// ============================================

// 1. Get cluster summary
const clusters = await plugin.getClusters();
clusters.forEach(cluster => {
  console.log(`\nCluster: ${cluster.name}`);
  console.log(`  Status: ${cluster.status}`);
  console.log(`  Last sync: ${cluster.lastRunAt}`);
  console.log(`  Result: ${cluster.lastResult?.success ? 'SUCCESS' : 'FAILED'}`);
});

// 2. Query specific resource type across all clusters
const allDeployments = await plugin.getSnapshots({
  resourceType: 'apps.v1.Deployment'
});

const byCluster = allDeployments.reduce((acc, d) => {
  if (!acc[d.clusterId]) acc[d.clusterId] = 0;
  acc[d.clusterId]++;
  return acc;
}, {});

console.log('\nDeployment count by cluster:');
Object.entries(byCluster).forEach(([clusterId, count]) => {
  console.log(`  ${clusterId}: ${count}`);
});

// 3. Detect recent changes
const recentChanges = await plugin.getChanges({
  // All clusters, all resources, last 24 hours
});

console.log(`\nDetected ${recentChanges.length} changes in last sync`);

// 4. Manual re-sync if needed
console.log('\nManually syncing prod-us-east...');
const syncResult = await plugin.syncCluster('prod-us-east');
console.log('Sync result:', syncResult);

await db.disconnect();
```

**Production features:**
- Multi-region, multi-provider clusters
- Scheduled automated discovery (cron)
- Security-focused filtering
- Custom resource names for namespacing
- Comprehensive logging
- Manual sync capability
- Cluster metadata and tags
- Per-cluster discovery options

---

## 📊 Configuration Reference

Complete configuration object with all options:

```javascript
new KubernetesInventoryPlugin({
  // ============================================
  // CLUSTER DEFINITIONS
  // ============================================
  clusters: [
    {
      // Required: Unique cluster identifier
      id: 'string',

      // Optional: Human-readable name
      name: 'string',

      // ========== AUTHENTICATION (Priority Order) ==========

      // 1. In-cluster service account (highest priority)
      inCluster: false,

      // 2. Manual connection object
      connection: {
        server: 'string',      // K8s API server URL
        token: 'string',       // Service account token
        caData: 'string',      // Base64-encoded CA cert
        certData: 'string',    // Base64-encoded client cert
        keyData: 'string',     // Base64-encoded client key
        skipTLSVerify: false   // Skip TLS verification (NOT RECOMMENDED)
      },

      // 3. Kubeconfig content (string or env var)
      kubeconfigContent: 'string',  // YAML content or uses KUBECONFIG_CONTENT_<CLUSTER_ID>

      // 4. Kubeconfig file path (or env var)
      kubeconfig: 'string',  // File path or uses KUBECONFIG_<CLUSTER_ID>

      // 5. Context selection (with any kubeconfig source)
      context: 'string',  // Switches to specific context

      // 6. Default: Uses ~/.kube/config or KUBECONFIG env var

      // ========== METADATA ==========

      tags: {
        // Arbitrary key-value pairs for filtering/grouping
        env: 'production',
        region: 'us-east',
        provider: 'aws'
      },

      metadata: {
        // Additional structured data
        clusterVersion: '1.28',
        nodeCount: 25
      },

      // ========== CLUSTER-SPECIFIC DISCOVERY ==========

      discovery: {
        namespaces: ['default'],          // Include only these namespaces
        excludeNamespaces: ['kube-system'], // Exclude these namespaces
        includeSecrets: false,            // Override global setting
        includeConfigMaps: true,
        includeCRDs: true
      }
    }
  ],

  // ============================================
  // GLOBAL DISCOVERY OPTIONS
  // ============================================
  discovery: {
    // Auto-discover on plugin install
    runOnInstall: true,

    // Dry run mode (preview without persisting)
    dryRun: false,

    // Max clusters to sync in parallel
    concurrency: 2,

    // ========== RESOURCE FILTERING ==========

    // Whitelist: Only track these resources (null = all)
    select: [
      'core.*',              // All core API resources
      'apps.*',              // All apps API resources
      'networking.k8s.io.*', // Specific API group
      '*.Pod',               // Specific kind across all groups
      'core.v1.Service'      // Exact resource type
    ],

    // Blacklist: Exclude these from selected resources
    ignore: [
      '*.Event',
      '*.Lease',
      'core.v1.Secret'
    ],

    // ========== NAMESPACE FILTERING ==========

    namespaces: ['default', 'production'],  // Include only these
    excludeNamespaces: ['kube-system'],      // Exclude these

    // ========== RESOURCE TYPE TOGGLES ==========

    includeSecrets: false,       // Don't store Secret data (security)
    includeConfigMaps: true,     // Include ConfigMaps
    includeCRDs: true,           // Auto-discover Custom Resources
    crdCacheTTL: 300000,        // Cache CRDs for 5 minutes

    // Core resource categories
    coreResources: true,         // Pods, Services, ConfigMaps, Secrets, etc.
    appsResources: true,         // Deployments, StatefulSets, DaemonSets, etc.
    batchResources: true,        // Jobs, CronJobs
    networkingResources: true,   // Ingress, NetworkPolicies
    storageResources: true,      // PersistentVolumes, StorageClasses
    rbacResources: true          // Roles, RoleBindings, ServiceAccounts
  },

  // ============================================
  // SCHEDULED DISCOVERY
  // ============================================
  schedule: {
    enabled: false,                // Enable cron-based scheduling
    cron: '0 * * * *',            // Every hour (cron expression)
    clusters: ['cluster-id'],      // Which clusters to sync (null = all)
    onComplete: (result) => {}     // Callback when sync completes
  },

  // ============================================
  // RESOURCE NAMING (EXTERNALIZATION)
  // ============================================
  resourceNames: {
    snapshots: 'plg_k8s_inventory_snapshots',  // Latest resource state
    versions: 'plg_k8s_inventory_versions',    // Version history
    changes: 'plg_k8s_inventory_changes',      // Change diffs
    clusters: 'plg_k8s_inventory_clusters'     // Cluster metadata
  },

  // ============================================
  // LOGGING
  // ============================================
  logger: (level, message, meta) => {
    // Custom logger function
    // level: 'debug', 'info', 'warn', 'error'
  },
  verbose: false  // Enable verbose logging
})
```

### Configuration Priority Table

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clusters` | array | `[]` | List of cluster configurations |
| `clusters[].id` | string | **required** | Unique cluster identifier |
| `clusters[].name` | string | `clusters[].id` | Human-readable name |
| `clusters[].inCluster` | boolean | `false` | Use in-cluster service account |
| `clusters[].connection` | object | `null` | Manual connection config |
| `clusters[].kubeconfigContent` | string | `null` | Kubeconfig YAML content |
| `clusters[].kubeconfig` | string | `null` | Path to kubeconfig file |
| `clusters[].context` | string | `null` | Context name to use |
| `clusters[].tags` | object | `{}` | Arbitrary metadata tags |
| `discovery.runOnInstall` | boolean | `true` | Auto-discover on install |
| `discovery.dryRun` | boolean | `false` | Preview mode (no persist) |
| `discovery.concurrency` | number | `2` | Max parallel cluster syncs |
| `discovery.select` | array\|null | `null` | Resource whitelist (null = all) |
| `discovery.ignore` | array | `[]` | Resource blacklist |
| `discovery.namespaces` | array\|null | `null` | Include only these namespaces |
| `discovery.excludeNamespaces` | array | `[]` | Exclude these namespaces |
| `discovery.includeSecrets` | boolean | `false` | Store Secret data |
| `discovery.includeConfigMaps` | boolean | `true` | Store ConfigMap data |
| `discovery.includeCRDs` | boolean | `true` | Auto-discover CRDs |
| `discovery.crdCacheTTL` | number | `300000` | CRD cache TTL (ms) |
| `schedule.enabled` | boolean | `false` | Enable cron scheduling |
| `schedule.cron` | string | `'0 * * * *'` | Cron expression |
| `schedule.clusters` | array\|null | `null` | Clusters to sync (null = all) |
| `resourceNames.snapshots` | string | `'plg_k8s_inventory_snapshots'` | Snapshot resource name |
| `resourceNames.versions` | string | `'plg_k8s_inventory_versions'` | Version resource name |
| `resourceNames.changes` | string | `'plg_k8s_inventory_changes'` | Changes resource name |
| `resourceNames.clusters` | string | `'plg_k8s_inventory_clusters'` | Cluster resource name |
| `verbose` | boolean | `false` | Enable verbose logging |

---

## 📚 Configuration Examples

### Use Case 1: Local Development

```javascript
new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'local',
      kubeconfig: '~/.kube/config',
      context: 'minikube'
    }
  ],
  discovery: {
    runOnInstall: true,
    select: ['core.*', 'apps.*']  // Only basic resources
  }
})
```

---

### Use Case 2: Multi-Environment CI/CD

```javascript
// Set environment variables:
// export KUBECONFIG_CONTENT_DEV=$(cat dev-kubeconfig | base64)
// export KUBECONFIG_CONTENT_STG=$(cat stg-kubeconfig | base64)
// export KUBECONFIG_CONTENT_PRD=$(cat prd-kubeconfig | base64)

new KubernetesInventoryPlugin({
  clusters: [
    { id: 'dev', tags: { env: 'development' } },
    { id: 'stg', tags: { env: 'staging' } },
    { id: 'prd', tags: { env: 'production' } }
  ],
  discovery: {
    runOnInstall: false,  // Manual control in CI/CD
    includeSecrets: false
  }
})
```

---

### Use Case 3: Multi-Cloud Production

```javascript
new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'aws-eks-us',
      name: 'AWS EKS US-East',
      context: 'aws-eks-us-context',
      tags: { provider: 'aws', region: 'us-east' }
    },
    {
      id: 'gcp-gke-eu',
      name: 'GCP GKE EU-West',
      context: 'gcp-gke-eu-context',
      tags: { provider: 'gcp', region: 'eu-west' }
    },
    {
      id: 'azure-aks-asia',
      name: 'Azure AKS Asia-Pacific',
      context: 'azure-aks-asia-context',
      tags: { provider: 'azure', region: 'asia-pacific' }
    }
  ],
  discovery: {
    runOnInstall: true,
    concurrency: 3,
    select: ['core.*', 'apps.*', 'batch.*'],
    ignore: ['*.Event', '*.Lease']
  },
  schedule: {
    enabled: true,
    cron: '*/30 * * * *'  // Every 30 minutes
  },
  resourceNames: {
    snapshots: 'k8s_multicloud_snapshots',
    versions: 'k8s_multicloud_versions',
    changes: 'k8s_multicloud_changes',
    clusters: 'k8s_multicloud_clusters'
  }
})
```

---

### Use Case 4: Security-Focused Inventory

```javascript
new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }],
  discovery: {
    runOnInstall: true,

    // Only security-relevant resources
    select: [
      'core.v1.ServiceAccount',
      'rbac.authorization.k8s.io.*',
      'networking.k8s.io.NetworkPolicy',
      'policy.*'
    ],

    // Exclude secrets for security
    ignore: ['*.Secret'],
    includeSecrets: false,

    // Only system namespaces
    namespaces: ['kube-system', 'default']
  }
})
```

---

### Use Case 5: CRD Discovery

```javascript
new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }],
  discovery: {
    runOnInstall: true,
    includeCRDs: true,
    crdCacheTTL: 600000,  // 10 minutes

    // Focus on custom resources
    select: [
      'argoproj.io.*',        // ArgoCD
      'cert-manager.io.*',    // Cert Manager
      'monitoring.coreos.com.*' // Prometheus Operator
    ]
  }
})
```

---

### Use Case 6: Namespace-Specific Monitoring

```javascript
new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }],
  discovery: {
    runOnInstall: true,

    // Only application namespaces
    namespaces: ['production', 'staging', 'monitoring'],

    // Exclude system namespaces
    excludeNamespaces: [
      'kube-system',
      'kube-public',
      'kube-node-lease'
    ],

    // Application-relevant resources
    select: [
      'core.v1.Pod',
      'core.v1.Service',
      'apps.v1.Deployment',
      'apps.v1.StatefulSet',
      'networking.k8s.io.Ingress'
    ]
  }
})
```

---

### Use Case 7: Manual Connection (Dynamic Credentials)

```javascript
// Fetch credentials from secrets manager
const credentials = await getK8sCredentials();

new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'dynamic',
      connection: {
        server: credentials.apiServer,
        token: credentials.token,
        caData: credentials.caCert  // Base64-encoded
      }
    }
  ],
  discovery: {
    runOnInstall: false  // Manual control
  }
})
```

---

### Use Case 8: Multiple Plugin Instances (Isolated Inventories)

```javascript
// Production inventory
const prodPlugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod-us' }, { id: 'prod-eu' }],
  resourceNames: {
    snapshots: 'prod_k8s_snapshots',
    versions: 'prod_k8s_versions',
    changes: 'prod_k8s_changes',
    clusters: 'prod_k8s_clusters'
  }
});

// Staging inventory
const stagingPlugin = new KubernetesInventoryPlugin({
  clusters: [{ id: 'staging' }],
  resourceNames: {
    snapshots: 'staging_k8s_snapshots',
    versions: 'staging_k8s_versions',
    changes: 'staging_k8s_changes',
    clusters: 'staging_k8s_clusters'
  }
});

// Both coexist in same database
await db.usePlugin(prodPlugin);
await db.usePlugin(stagingPlugin);
```

---

### Use Case 9: In-Cluster Discovery

```javascript
// Running inside Kubernetes pod
new KubernetesInventoryPlugin({
  clusters: [
    {
      id: 'self',
      inCluster: true,  // Uses service account
      discovery: {
        // Discover only current namespace
        namespaces: [process.env.NAMESPACE]
      }
    }
  ],
  schedule: {
    enabled: true,
    cron: '*/5 * * * *'  // Every 5 minutes
  }
})
```

---

### Use Case 10: Change Detection Only

```javascript
new KubernetesInventoryPlugin({
  clusters: [{ id: 'prod' }],
  discovery: {
    runOnInstall: true,
    select: ['apps.v1.Deployment']  // Only Deployments
  },
  schedule: {
    enabled: true,
    cron: '*/1 * * * *',  // Every minute
    onComplete: async (result) => {
      if (result.success) {
        // Check for new changes
        const changes = await plugin.getChanges({
          clusterId: 'prod',
          resourceType: 'apps.v1.Deployment'
        });

        if (changes.length > 0) {
          console.log(`⚠️  Detected ${changes.length} Deployment changes!`);
          // Send alerts, trigger webhooks, etc.
        }
      }
    }
  }
})
```

---

## 🔧 API Reference

### Plugin Methods

#### `syncCluster(clusterId, options?): Promise<SyncResult>`

Manually trigger cluster sync (discovery).

**Parameters:**
- `clusterId` (string, required): Cluster ID to sync
- `options` (object, optional):
  - `dryRun` (boolean): Preview mode without persisting

**Returns:** `Promise<SyncResult>`
```javascript
{
  success: boolean,
  clusterId: string,
  resourcesDiscovered: number,
  newResources: number,
  updatedResources: number,
  unchangedResources: number,
  changesDetected: number,
  duration: number,
  error?: Error
}
```

**Example:**
```javascript
const result = await plugin.syncCluster('prod-us');
console.log(`Discovered ${result.resourcesDiscovered} resources`);
console.log(`Detected ${result.changesDetected} changes`);
```

**Throws:**
- `PluginError` - When cluster not found or sync fails

---

#### `syncAllClusters(options?): Promise<SyncResult[]>`

Sync all configured clusters.

**Parameters:**
- `options` (object, optional):
  - `dryRun` (boolean): Preview mode
  - `concurrency` (number): Override default concurrency

**Returns:** `Promise<SyncResult[]>` - Array of results for each cluster

**Example:**
```javascript
const results = await plugin.syncAllClusters({ concurrency: 3 });
results.forEach(result => {
  console.log(`${result.clusterId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
});
```

---

#### `getSnapshots(query): Promise<Snapshot[]>`

Query resource snapshots (latest state).

**Parameters:**
- `query` (object):
  - `clusterId` (string, optional): Filter by cluster
  - `resourceType` (string, optional): Filter by resource type
  - `resourceId` (string, optional): Get specific resource
  - `namespace` (string, optional): Filter by namespace
  - `limit` (number, optional): Max results

**Returns:** `Promise<Snapshot[]>`

**Example:**
```javascript
// All Pods in prod-us cluster
const pods = await plugin.getSnapshots({
  clusterId: 'prod-us',
  resourceType: 'core.v1.Pod'
});

// All resources in default namespace
const defaultNS = await plugin.getSnapshots({
  clusterId: 'prod-us',
  namespace: 'default'
});

// Specific Deployment
const deployment = await plugin.getSnapshots({
  clusterId: 'prod-us',
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-deployment'
});
```

---

#### `getVersions(query): Promise<Version[]>`

Query version history for a resource.

**Parameters:**
- `query` (object):
  - `clusterId` (string, required): Cluster ID
  - `resourceType` (string, required): Resource type
  - `resourceId` (string, required): Resource ID
  - `limit` (number, optional): Max versions

**Returns:** `Promise<Version[]>` - Versions ordered newest to oldest

**Example:**
```javascript
const versions = await plugin.getVersions({
  clusterId: 'prod-us',
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-deployment'
});

console.log(`Deployment has ${versions.length} versions`);
versions.forEach(v => {
  console.log(`Version ${v.version}: ${v.capturedAt}`);
});
```

---

#### `getChanges(query): Promise<Change[]>`

Query resource changes (diffs).

**Parameters:**
- `query` (object):
  - `clusterId` (string, optional): Filter by cluster
  - `resourceType` (string, optional): Filter by resource type
  - `resourceId` (string, optional): Filter by resource ID
  - `limit` (number, optional): Max results

**Returns:** `Promise<Change[]>` - Changes ordered newest to oldest

**Example:**
```javascript
// All changes in cluster
const allChanges = await plugin.getChanges({
  clusterId: 'prod-us'
});

// Changes for specific resource
const deploymentChanges = await plugin.getChanges({
  clusterId: 'prod-us',
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-deployment'
});

deploymentChanges.forEach(change => {
  console.log(`v${change.fromVersion} → v${change.toVersion}:`);
  console.log(`  Added: ${Object.keys(change.diff.added || {}).length}`);
  console.log(`  Removed: ${Object.keys(change.diff.removed || {}).length}`);
  console.log(`  Updated: ${Object.keys(change.diff.updated || {}).length}`);
});
```

---

#### `getClusters(): Promise<ClusterMetadata[]>`

Get all cluster metadata.

**Returns:** `Promise<ClusterMetadata[]>`
```javascript
{
  id: string,
  name: string,
  status: 'idle' | 'syncing' | 'error',
  lastRunAt?: string,
  lastResult?: SyncResult,
  tags?: object,
  metadata?: object
}
```

**Example:**
```javascript
const clusters = await plugin.getClusters();
clusters.forEach(cluster => {
  console.log(`${cluster.name}: ${cluster.status}`);
  if (cluster.lastRunAt) {
    console.log(`  Last sync: ${cluster.lastRunAt}`);
  }
});
```

---

#### `discoverResourceTypes(clusterId): Promise<ResourceType[]>`

Discover available resource types in cluster.

**Parameters:**
- `clusterId` (string, required): Cluster ID

**Returns:** `Promise<ResourceType[]>`
```javascript
{
  group: string,
  version: string,
  kind: string,
  plural: string,
  namespaced: boolean,
  isCRD: boolean,
  category?: string
}
```

**Example:**
```javascript
const types = await plugin.discoverResourceTypes('prod-us');

// Show core resources
const coreTypes = types.filter(t => t.group === '');
console.log('Core resources:', coreTypes.map(t => t.kind));

// Show CRDs
const crds = types.filter(t => t.isCRD);
console.log('Custom resources:', crds.map(t => `${t.group}/${t.kind}`));
```

---

#### `startScheduler(): void`

Start the cron-based scheduler (if schedule.enabled).

**Example:**
```javascript
plugin.startScheduler();
```

---

#### `stopScheduler(): void`

Stop the scheduler.

**Example:**
```javascript
plugin.stopScheduler();
```

---

### Events

#### `cluster.sync.started`

Emitted when cluster sync begins.

**Payload:**
```javascript
{
  clusterId: string,
  timestamp: string
}
```

**Example:**
```javascript
plugin.on('cluster.sync.started', ({ clusterId, timestamp }) => {
  console.log(`[${timestamp}] Syncing ${clusterId}...`);
});
```

---

#### `cluster.sync.completed`

Emitted when cluster sync completes.

**Payload:**
```javascript
{
  clusterId: string,
  result: SyncResult,
  timestamp: string
}
```

**Example:**
```javascript
plugin.on('cluster.sync.completed', ({ clusterId, result }) => {
  if (result.success) {
    console.log(`✅ ${clusterId}: ${result.resourcesDiscovered} resources`);
  } else {
    console.error(`❌ ${clusterId} failed:`, result.error);
  }
});
```

---

#### `resource.discovered`

Emitted for each resource discovered.

**Payload:**
```javascript
{
  clusterId: string,
  resourceType: string,
  resourceId: string,
  isNew: boolean,
  hasChanges: boolean
}
```

**Example:**
```javascript
plugin.on('resource.discovered', ({ resourceType, isNew, hasChanges }) => {
  if (isNew) {
    console.log(`🆕 New resource: ${resourceType}`);
  } else if (hasChanges) {
    console.log(`🔄 Updated resource: ${resourceType}`);
  }
});
```

---

#### `change.detected`

Emitted when resource change is detected.

**Payload:**
```javascript
{
  clusterId: string,
  resourceType: string,
  resourceId: string,
  fromVersion: number,
  toVersion: number,
  diff: object
}
```

**Example:**
```javascript
plugin.on('change.detected', ({ resourceType, resourceId, diff }) => {
  console.log(`⚠️  Change in ${resourceType}/${resourceId}`);
  console.log(`  Added: ${Object.keys(diff.added || {}).length} fields`);
  console.log(`  Removed: ${Object.keys(diff.removed || {}).length} fields`);
  console.log(`  Updated: ${Object.keys(diff.updated || {}).length} fields`);
});
```

---

## ✅ Best Practices

### Do's ✅

1. **Use partitions for cluster queries**
   ```javascript
   // ✅ O(1) partition lookup
   const data = await plugin.getSnapshots({ clusterId: 'prod-us' });

   // ❌ O(n) full scan
   const all = await snapshotsResource.list();
   const data = all.filter(s => s.clusterId === 'prod-us');
   ```

2. **Filter resources to reduce storage costs**
   ```javascript
   // ✅ Only track what you need
   discovery: {
     select: ['core.*', 'apps.*'],
     ignore: ['*.Event', '*.Lease']
   }
   ```

3. **Exclude secrets for security**
   ```javascript
   // ✅ Don't store sensitive data
   discovery: {
     includeSecrets: false,
     ignore: ['core.v1.Secret']
   }
   ```

4. **Use custom resource names for multiple instances**
   ```javascript
   // ✅ Isolated inventories
   resourceNames: {
     snapshots: 'prod_k8s_snapshots',
     // ...
   }
   ```

5. **Set concurrency based on cluster size**
   ```javascript
   // ✅ Balance speed vs load
   discovery: {
     concurrency: 3  // For large clusters
   }
   ```

6. **Use environment variables for kubeconfig in CI/CD**
   ```javascript
   // ✅ Secure credential management
   export KUBECONFIG_CONTENT_PROD=$(cat kubeconfig | base64)

   // Then in code:
   clusters: [{ id: 'prod' }]  // Auto-detected
   ```

7. **Monitor sync results with events**
   ```javascript
   // ✅ Track sync health
   plugin.on('cluster.sync.completed', ({ clusterId, result }) => {
     if (!result.success) {
       alerting.send(`Cluster ${clusterId} sync failed`);
     }
   });
   ```

8. **Use scheduled discovery for continuous monitoring**
   ```javascript
   // ✅ Keep inventory fresh
   schedule: {
     enabled: true,
     cron: '*/15 * * * *'  // Every 15 minutes
   }
   ```

9. **Tag clusters for organization**
   ```javascript
   // ✅ Enable filtering and grouping
   clusters: [
     {
       id: 'prod-us',
       tags: { env: 'prod', region: 'us', provider: 'aws' }
     }
   ]
   ```

10. **Use dry-run to preview changes**
    ```javascript
    // ✅ Test filters before applying
    const result = await plugin.syncCluster('prod', { dryRun: true });
    console.log(`Would discover ${result.resourcesDiscovered} resources`);
    ```

---

### Don'ts ❌

1. **Don't store secrets in production**
   ```javascript
   // ❌ Security risk
   discovery: {
     includeSecrets: true
   }

   // ✅ Exclude secrets
   discovery: {
     includeSecrets: false,
     ignore: ['core.v1.Secret']
   }
   ```

2. **Don't sync all clusters simultaneously without concurrency limit**
   ```javascript
   // ❌ Overwhelms API servers
   discovery: {
     concurrency: 100
   }

   // ✅ Reasonable limit
   discovery: {
     concurrency: 2-5
   }
   ```

3. **Don't use same resource names for multiple plugin instances**
   ```javascript
   // ❌ Data collision
   const plugin1 = new KubernetesInventoryPlugin({...});
   const plugin2 = new KubernetesInventoryPlugin({...});
   // Both use default resource names!

   // ✅ Unique names per instance
   const plugin1 = new KubernetesInventoryPlugin({
     resourceNames: { snapshots: 'prod_snapshots', ... }
   });
   const plugin2 = new KubernetesInventoryPlugin({
     resourceNames: { snapshots: 'staging_snapshots', ... }
   });
   ```

4. **Don't ignore clusterId in queries**
   ```javascript
   // ❌ Returns data from ALL clusters
   const data = await plugin.getSnapshots({
     resourceType: 'core.v1.Pod'
   });

   // ✅ Specify cluster
   const data = await plugin.getSnapshots({
     clusterId: 'prod-us',
     resourceType: 'core.v1.Pod'
   });
   ```

5. **Don't hardcode kubeconfig paths**
   ```javascript
   // ❌ Not portable
   kubeconfig: '/home/user/.kube/config'

   // ✅ Use path expansion
   kubeconfig: '~/.kube/config'
   // OR: Use environment variables
   // (auto-detected from KUBECONFIG_<CLUSTER_ID>)
   ```

6. **Don't track all namespaces if not needed**
   ```javascript
   // ❌ Unnecessary data
   // (defaults to all namespaces)

   // ✅ Focus on relevant namespaces
   discovery: {
     namespaces: ['production', 'monitoring'],
     excludeNamespaces: ['kube-system']
   }
   ```

7. **Don't skip error handling**
   ```javascript
   // ❌ Silent failures
   await plugin.syncCluster('prod');

   // ✅ Handle errors
   try {
     const result = await plugin.syncCluster('prod');
     if (!result.success) {
       console.error('Sync failed:', result.error);
     }
   } catch (error) {
     console.error('Sync error:', error);
   }
   ```

8. **Don't use inCluster outside of Kubernetes**
   ```javascript
   // ❌ Won't work locally
   clusters: [{ id: 'local', inCluster: true }]

   // ✅ Use kubeconfig locally
   clusters: [{ id: 'local', kubeconfig: '~/.kube/config' }]
   ```

9. **Don't forget to stop scheduler on shutdown**
   ```javascript
   // ❌ Scheduler keeps running
   await db.disconnect();

   // ✅ Stop scheduler first
   plugin.stopScheduler();
   await db.disconnect();
   ```

10. **Don't query without filters on large clusters**
    ```javascript
    // ❌ Returns thousands of resources
    const all = await plugin.getSnapshots({});

    // ✅ Use specific filters
    const filtered = await plugin.getSnapshots({
      clusterId: 'prod-us',
      resourceType: 'apps.v1.Deployment',
      namespace: 'production'
    });
    ```

---

### Performance Tips

- **Use partitions**: All queries automatically benefit from `byClusterId`, `byClusterAndType`, `byNamespace` partitions (O(1) instead of O(n))
- **Filter early**: Use `select`/`ignore` to reduce data ingestion
- **Limit concurrency**: Set `discovery.concurrency` to 2-5 for best balance
- **Cache CRDs**: Set `crdCacheTTL` to 5-10 minutes to reduce API calls
- **Exclude noisy resources**: Always ignore Events and Leases
- **Batch queries**: Use broader filters instead of multiple specific queries
- **Schedule wisely**: Don't sync more often than resources actually change (15-30 minutes is usually sufficient)

---

### Security Considerations

- **Never store secrets**: Always set `includeSecrets: false` and add `core.v1.Secret` to ignore list
- **Use RBAC**: Ensure service accounts have minimal required permissions (list, get, watch)
- **Rotate credentials**: Use short-lived tokens when possible
- **Audit access**: Monitor who queries sensitive resource types
- **Encrypt at rest**: Enable S3 bucket encryption
- **Use TLS**: Never set `skipTLSVerify: true` in production
- **Limit namespaces**: Don't sync namespaces you don't need to track
- **Environment variables**: Use encrypted secrets management (AWS SSM, Vault, etc.) for kubeconfig content
- **In-cluster**: Use service account tokens instead of static kubeconfig when running in-cluster

---

## 🚨 Error Handling

### Common Errors

#### Error 1: Cluster Not Found

**Problem**: Attempting to sync non-existent cluster.

**Solution:**
```javascript
try {
  await plugin.syncCluster('invalid-id');
} catch (error) {
  if (error.message.includes('Cluster not found')) {
    console.error('Cluster ID not configured in plugin');
    // Check cluster configuration
  }
}
```

---

#### Error 2: Authentication Failed

**Problem**: Invalid kubeconfig or expired credentials.

**Solution:**
```javascript
plugin.on('cluster.sync.completed', ({ clusterId, result }) => {
  if (!result.success && result.error.message.includes('Unauthorized')) {
    console.error(`${clusterId}: Authentication failed`);
    // Refresh kubeconfig or credentials
    // Check KUBECONFIG_<CLUSTER_ID> env var
  }
});
```

---

#### Error 3: API Server Unreachable

**Problem**: Network issues or cluster down.

**Solution:**
```javascript
plugin.on('cluster.sync.completed', ({ clusterId, result }) => {
  if (!result.success && result.error.code === 'ECONNREFUSED') {
    console.error(`${clusterId}: API server unreachable`);
    // Check network connectivity
    // Verify cluster is running
    // Check server URL in kubeconfig
  }
});
```

---

#### Error 4: Resource Type Not Found

**Problem**: Querying non-existent resource type.

**Solution:**
```javascript
// First, discover available types
const types = await plugin.discoverResourceTypes('prod-us');
const hasDeployments = types.some(t =>
  t.group === 'apps' && t.kind === 'Deployment'
);

if (hasDeployments) {
  const deployments = await plugin.getSnapshots({
    clusterId: 'prod-us',
    resourceType: 'apps.v1.Deployment'
  });
}
```

---

#### Error 5: Concurrent Sync Detected

**Problem**: Attempting to sync while another sync is in progress.

**Solution:**
```javascript
try {
  await plugin.syncCluster('prod-us');
} catch (error) {
  if (error.message.includes('already syncing')) {
    console.warn('Sync already in progress, skipping...');
    // Wait for current sync to complete
  }
}
```

---

### Troubleshooting

#### Issue 1: No resources discovered

**Diagnosis:**
1. Check cluster connection: `kubectl get nodes`
2. Verify RBAC permissions: `kubectl auth can-i list pods --all-namespaces`
3. Check filters: Are `select`/`ignore` too restrictive?

**Fix:**
```javascript
// Test with minimal filters
const result = await plugin.syncCluster('prod', {
  dryRun: true
});
console.log(`Would discover ${result.resourcesDiscovered} resources`);

// Check resource types
const types = await plugin.discoverResourceTypes('prod');
console.log('Available types:', types.map(t => t.kind));
```

---

#### Issue 2: Changes not detected

**Diagnosis:**
1. Verify version incremented: Check `latestVersion` in snapshot
2. Check digest changed: Compare `latestDigest` values
3. Review diff: Inspect `change.diff` object

**Fix:**
```javascript
const snapshot = await plugin.getSnapshots({
  clusterId: 'prod',
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-deployment'
});

console.log('Latest version:', snapshot[0].latestVersion);
console.log('Latest digest:', snapshot[0].latestDigest);

const versions = await plugin.getVersions({
  clusterId: 'prod',
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-deployment'
});

console.log('Version history:', versions.length);
```

---

#### Issue 3: Scheduler not running

**Diagnosis:**
1. Check `schedule.enabled` is true
2. Verify cron expression is valid
3. Check if scheduler was started

**Fix:**
```javascript
// Verify configuration
console.log('Schedule config:', plugin.config.schedule);

// Manually start scheduler
plugin.startScheduler();

// Test with manual sync
await plugin.syncAllClusters();
```

---

#### Issue 4: High memory usage

**Diagnosis:**
1. Check number of resources: `getSnapshots({})` count
2. Review cluster count and size
3. Check concurrency setting

**Fix:**
```javascript
// Reduce scope with filtering
discovery: {
  select: ['core.*', 'apps.*'],  // Only essential resources
  ignore: ['*.Event', '*.Lease'], // Exclude noisy resources
  namespaces: ['production'],     // Limit namespaces
  concurrency: 1                  // Sync serially
}

// Query with limits
const snapshots = await plugin.getSnapshots({
  clusterId: 'prod',
  limit: 100
});
```

---

#### Issue 5: Slow sync performance

**Diagnosis:**
1. Check API server latency
2. Review number of resource types
3. Verify CRD cache settings

**Fix:**
```javascript
// Optimize discovery
discovery: {
  crdCacheTTL: 600000,  // Cache CRDs for 10 minutes
  concurrency: 3,        // Increase parallelism
  select: ['core.*'],    // Reduce resource types
  includeCRDs: false     // Skip CRD discovery if not needed
}

// Monitor sync duration
plugin.on('cluster.sync.completed', ({ clusterId, result }) => {
  console.log(`${clusterId} sync took ${result.duration}ms`);
});
```

---

## 🔗 See Also

- [CloudInventoryPlugin](./cloud-inventory.md) - Multi-cloud infrastructure inventory
- [TTL Plugin](./ttl.md) - Auto-cleanup expired inventory records
- [MetricsPlugin](./metrics.md) - Track plugin performance metrics
- [ReplicatorPlugin](./replicator.md) - Replicate inventory to PostgreSQL/BigQuery
- [s3db Partitioning Guide](../concepts/partitioning.md) - Optimize queries with partitions
- [Version Tracking](../concepts/versioning.md) - Understanding digest-based versioning

**Examples:**
- [e72: Basic Usage](../examples/e72-kubernetes-inventory-basic.js)
- [e73: Multi-Cluster](../examples/e73-kubernetes-inventory-multi-cluster.js)
- [e74: Advanced Filtering](../examples/e74-kubernetes-inventory-filters.js)
- [e75: Configuration Methods](../examples/e75-kubernetes-inventory-config-methods.js)
- [e76: Resource Naming & Isolation](../examples/e76-kubernetes-inventory-namespacing.js)
- [e77: Multi-Context](../examples/e77-kubernetes-inventory-multi-context.js)

---

## ❓ FAQ

### General

**Q: What is the KubernetesInventoryPlugin?**

A: A plugin that continuously discovers and tracks ALL Kubernetes resources across multiple clusters. It maintains snapshots (latest state), complete version history, and change diffs for every resource. Think of it as a time machine for your K8s infrastructure.

---

**Q: How is this different from CloudInventoryPlugin?**

A: CloudInventoryPlugin tracks cloud provider resources (EC2, S3, VPCs, etc.) while KubernetesInventoryPlugin tracks Kubernetes resources (Pods, Services, Deployments, etc.). They follow the same architecture pattern but target different infrastructure layers.

---

**Q: What resources does it track?**

A: **60+ standard K8s resources** across 17 API groups:
- **Core**: Pods, Services, ConfigMaps, Secrets, PVCs, Nodes, etc.
- **Apps**: Deployments, StatefulSets, DaemonSets, ReplicaSets
- **Batch**: Jobs, CronJobs
- **Networking**: Ingress, NetworkPolicies, Endpoints
- **Storage**: PersistentVolumes, StorageClasses
- **RBAC**: Roles, RoleBindings, ServiceAccounts
- **Auto-discovered CRDs**: ArgoCD, Cert-Manager, Prometheus Operator, etc.

---

**Q: Can I track multiple Kubernetes clusters?**

A: Yes! Configure unlimited clusters with complete data isolation via partitions. Each cluster gets a unique `clusterId` that enables O(1) queries.

```javascript
clusters: [
  { id: 'prod-us', context: 'prod-us-context' },
  { id: 'prod-eu', context: 'prod-eu-context' },
  { id: 'staging', context: 'staging-context' }
]
```

---

**Q: How do I authenticate to my cluster?**

A: **6 authentication methods** (in priority order):
1. In-cluster service account: `inCluster: true`
2. Manual connection: `connection: { server, token, caData }`
3. Kubeconfig content: `kubeconfigContent: '...'` or `KUBECONFIG_CONTENT_<CLUSTER_ID>` env var
4. Kubeconfig file path: `kubeconfig: '~/.kube/config'` or `KUBECONFIG_<CLUSTER_ID>` env var
5. Context selection: `context: 'minikube'`
6. Default: `~/.kube/config` or `KUBECONFIG` env var

---

**Q: Can I use one kubeconfig file for multiple clusters?**

A: Yes! Use context selection:

```javascript
clusters: [
  { id: 'prod-us', context: 'prod-us-context' },
  { id: 'prod-eu', context: 'prod-eu-context' }
]
// Both use same kubeconfig with different contexts
```

---

**Q: How do I filter which resources to track?**

A: Use `select` (whitelist) and `ignore` (blacklist):

```javascript
discovery: {
  select: ['core.*', 'apps.*'],     // Only core + apps resources
  ignore: ['*.Event', '*.Lease']     // Exclude noisy resources
}
```

---

**Q: Can I track only specific namespaces?**

A: Yes, use namespace filtering:

```javascript
discovery: {
  namespaces: ['production', 'monitoring'],  // Include only these
  excludeNamespaces: ['kube-system']         // Exclude these
}
```

---

**Q: How does version tracking work?**

A: Every resource gets a SHA256 digest. When digest changes, a new version is created with:
- Full resource snapshot
- Diff from previous version
- Immutable history (never deleted)

```javascript
const versions = await plugin.getVersions({
  clusterId: 'prod',
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-deployment'
});
// Returns: v1, v2, v3, ... (oldest to newest)
```

---

**Q: How do I detect changes to resources?**

A: Query the `changes` resource:

```javascript
const changes = await plugin.getChanges({
  clusterId: 'prod',
  resourceType: 'apps.v1.Deployment'
});

changes.forEach(change => {
  console.log(`v${change.fromVersion} → v${change.toVersion}`);
  console.log('Diff:', change.diff);  // { added, removed, updated }
});
```

---

**Q: Can I run multiple plugin instances in the same database?**

A: Yes! Use custom resource names to avoid collisions:

```javascript
const prodPlugin = new KubernetesInventoryPlugin({
  resourceNames: {
    snapshots: 'prod_k8s_snapshots',
    versions: 'prod_k8s_versions',
    changes: 'prod_k8s_changes',
    clusters: 'prod_k8s_clusters'
  }
});

const stagingPlugin = new KubernetesInventoryPlugin({
  resourceNames: {
    snapshots: 'staging_k8s_snapshots',
    // ... different names
  }
});
```

---

### Advanced

**Q: How do I schedule automated discovery?**

A: Use the built-in cron scheduler:

```javascript
schedule: {
  enabled: true,
  cron: '*/15 * * * *',  // Every 15 minutes
  clusters: ['prod-us', 'prod-eu'],  // Which clusters (null = all)
  onComplete: (result) => {
    console.log(`Sync result:`, result);
  }
}
```

---

**Q: How does partitioning improve query performance?**

A: Partitions create O(1) lookups instead of O(n) scans:

```javascript
// ❌ O(n) - scans 10,000 resources
const all = await snapshotsResource.list();
const prodUS = all.filter(s => s.clusterId === 'prod-us');

// ✅ O(1) - direct partition access to 500 resources
const prodUS = await plugin.getSnapshots({ clusterId: 'prod-us' });
```

**Available partitions:**
- `byClusterId`: Filter by cluster
- `byResourceType`: Filter by resource type
- `byClusterAndType`: Combined filtering
- `byNamespace`: Filter by namespace

---

**Q: Can I preview changes before committing?**

A: Yes, use dry-run mode:

```javascript
const result = await plugin.syncCluster('prod', { dryRun: true });
console.log(`Would discover ${result.resourcesDiscovered} resources`);
console.log(`Would detect ${result.changesDetected} changes`);
// Nothing persisted to database
```

---

**Q: How do I handle in-cluster discovery?**

A: Use the `inCluster` option when running inside Kubernetes:

```javascript
clusters: [
  {
    id: 'self',
    inCluster: true,  // Uses /var/run/secrets/kubernetes.io/serviceaccount/
    discovery: {
      namespaces: [process.env.NAMESPACE]  // Current namespace only
    }
  }
]
```

---

**Q: Can I use environment variables for kubeconfig?**

A: Yes! Multiple patterns supported:

```bash
# Global content (base64 or plain)
export KUBECONFIG_CONTENT=$(cat ~/.kube/config | base64)

# Cluster-specific content
export KUBECONFIG_CONTENT_PROD_US=$(cat prod-us.yaml | base64)

# Cluster-specific file path
export KUBECONFIG_PROD_EU=/path/to/prod-eu-kubeconfig

# Standard K8s env var
export KUBECONFIG=/path/to/default-config
```

Plugin auto-detects and decodes base64 if needed.

---

**Q: How do I monitor sync failures?**

A: Listen to events:

```javascript
plugin.on('cluster.sync.completed', ({ clusterId, result }) => {
  if (!result.success) {
    console.error(`❌ ${clusterId} sync failed:`, result.error);
    // Send alert, retry, etc.
  } else {
    console.log(`✅ ${clusterId}: ${result.resourcesDiscovered} resources`);
  }
});
```

---

**Q: What's the recommended sync frequency?**

A: Depends on your use case:
- **Real-time change detection**: Every 1-5 minutes
- **Compliance monitoring**: Every 15-30 minutes
- **Cost tracking**: Every hour
- **Auditing**: Every 6-24 hours

Most production setups use **15-30 minutes** as a good balance.

---

**Q: How do I exclude Custom Resource Definitions?**

A: Disable CRD discovery:

```javascript
discovery: {
  includeCRDs: false  // Skip auto-discovery of CRDs
}
```

---

**Q: Can I customize which CRDs to track?**

A: Yes, use select patterns:

```javascript
discovery: {
  includeCRDs: true,
  select: [
    'argoproj.io.*',           // ArgoCD resources
    'cert-manager.io.*',       // Cert Manager
    'monitoring.coreos.com.*'  // Prometheus Operator
  ]
}
```

---

**Q: How do I handle dynamic credentials (from Vault, AWS SSM, etc.)?**

A: Use manual connection object:

```javascript
const credentials = await vault.getK8sCredentials();

clusters: [
  {
    id: 'dynamic',
    connection: {
      server: credentials.apiServer,
      token: credentials.token,
      caData: credentials.caCert
    }
  }
]
```

---

### Performance

**Q: How much storage does this use?**

A: Depends on cluster size:
- **Small cluster** (50 resources): ~5-10 MB
- **Medium cluster** (500 resources): ~50-100 MB
- **Large cluster** (5000 resources): ~500-1000 MB

**Tip**: Use filtering to reduce storage:
```javascript
discovery: {
  select: ['core.*', 'apps.*'],  // Only essential resources
  ignore: ['*.Event', '*.Lease']  // Exclude noisy resources
}
```

---

**Q: How fast is discovery?**

A: **Typical performance:**
- **Small cluster** (50 resources): 2-5 seconds
- **Medium cluster** (500 resources): 10-30 seconds
- **Large cluster** (5000 resources): 60-180 seconds

**Factors:**
- K8s API latency
- Number of resource types
- CRD discovery enabled
- Concurrency setting

---

**Q: Can I speed up discovery?**

A: Yes, several optimizations:

```javascript
discovery: {
  concurrency: 3,           // Increase parallel syncs
  crdCacheTTL: 600000,     // Cache CRDs for 10 minutes
  select: ['core.*'],       // Reduce resource types
  includeCRDs: false        // Skip CRD discovery if not needed
}
```

---

**Q: How do I reduce S3 costs?**

A: **Cost optimization strategies:**

1. **Filter aggressively**:
   ```javascript
   discovery: {
     select: ['core.*', 'apps.*'],
     ignore: ['*.Event', '*.Lease']
   }
   ```

2. **Exclude namespaces**:
   ```javascript
   discovery: {
     excludeNamespaces: ['kube-system', 'kube-public']
   }
   ```

3. **Don't store secrets**:
   ```javascript
   discovery: {
     includeSecrets: false
   }
   ```

4. **Use S3 lifecycle policies**: Archive old versions to Glacier

---

**Q: What's the impact on Kubernetes API server?**

A: **Minimal impact:**
- Uses `list` + `watch` (efficient K8s API patterns)
- Respects API rate limits
- Automatic retry with exponential backoff
- Caches CRDs to reduce API calls

**Tip**: Limit concurrency to reduce load:
```javascript
discovery: {
  concurrency: 2  // Max 2 clusters syncing in parallel
}
```

---

### Troubleshooting

**Q: Why are no resources discovered?**

A: **Check these:**

1. **Cluster connectivity**:
   ```bash
   kubectl get nodes
   ```

2. **RBAC permissions**:
   ```bash
   kubectl auth can-i list pods --all-namespaces
   ```

3. **Filters**:
   ```javascript
   // Test with no filters
   discovery: { select: null, ignore: [] }
   ```

4. **Dry-run**:
   ```javascript
   const result = await plugin.syncCluster('prod', { dryRun: true });
   console.log('Resources:', result.resourcesDiscovered);
   ```

---

**Q: Why aren't changes being detected?**

A: **Verify:**

1. **Digest changed**: Compare `latestDigest` values
2. **Version incremented**: Check `latestVersion`
3. **Sync completed**: Check cluster status

```javascript
const snapshot = await plugin.getSnapshots({
  clusterId: 'prod',
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-deployment'
});

console.log('Version:', snapshot[0].latestVersion);
console.log('Digest:', snapshot[0].latestDigest);
```

---

**Q: Authentication failed - what should I check?**

A: **Diagnosis steps:**

1. **Test kubeconfig manually**:
   ```bash
   kubectl --kubeconfig=/path/to/config get nodes
   ```

2. **Check env vars**:
   ```bash
   echo $KUBECONFIG_CONTENT_PROD
   echo $KUBECONFIG_PROD
   ```

3. **Verify base64 encoding**:
   ```bash
   echo $KUBECONFIG_CONTENT | base64 -d | head -5
   ```

4. **Check context**:
   ```bash
   kubectl config get-contexts
   ```

---

**Q: Scheduler not running - how to debug?**

A: **Check:**

1. **Enabled**:
   ```javascript
   console.log(plugin.config.schedule.enabled);  // Should be true
   ```

2. **Valid cron**:
   ```javascript
   console.log(plugin.config.schedule.cron);  // Valid cron expression?
   ```

3. **Manually start**:
   ```javascript
   plugin.startScheduler();
   ```

4. **Test manual sync**:
   ```javascript
   await plugin.syncAllClusters();
   ```

---

**Q: High memory usage - how to reduce?**

A: **Optimization strategies:**

1. **Filter resources**:
   ```javascript
   discovery: {
     select: ['core.*', 'apps.*'],
     ignore: ['*.Event', '*.Lease'],
     namespaces: ['production']
   }
   ```

2. **Reduce concurrency**:
   ```javascript
   discovery: {
     concurrency: 1  // Sync serially
   }
   ```

3. **Query with limits**:
   ```javascript
   const snapshots = await plugin.getSnapshots({
     clusterId: 'prod',
     limit: 100
   });
   ```

4. **Disable CRDs if not needed**:
   ```javascript
   discovery: {
     includeCRDs: false
   }
   ```

---

**Q: Slow sync performance - how to optimize?**

A: **Tuning options:**

1. **Increase concurrency**:
   ```javascript
   discovery: {
     concurrency: 3  // More parallel syncs
   }
   ```

2. **Cache CRDs longer**:
   ```javascript
   discovery: {
     crdCacheTTL: 600000  // 10 minutes
   }
   ```

3. **Reduce resource types**:
   ```javascript
   discovery: {
     select: ['core.*'],  // Only core resources
     includeCRDs: false
   }
   ```

4. **Monitor API latency**:
   ```javascript
   plugin.on('cluster.sync.completed', ({ clusterId, result }) => {
     console.log(`${clusterId} took ${result.duration}ms`);
   });
   ```

---

**Q: How do I debug partition issues?**

A: **Check partition setup:**

```javascript
const snapshotsResource = db.getResource('plg_k8s_inventory_snapshots');

// List available partitions
console.log('Partitions:', snapshotsResource.partitions);

// Test partition query
const partitionData = await snapshotsResource.listPartition('byClusterId', {
  clusterId: 'prod-us'
});
console.log('Partition count:', partitionData.length);

// Compare with direct query
const directData = await plugin.getSnapshots({ clusterId: 'prod-us' });
console.log('Direct count:', directData.length);
// Should match
```

---

**Q: Can I recover from a failed sync?**

A: Yes, just re-sync:

```javascript
try {
  await plugin.syncCluster('prod');
} catch (error) {
  console.error('Sync failed:', error);

  // Wait and retry
  await new Promise(resolve => setTimeout(resolve, 30000));
  await plugin.syncCluster('prod');
}
```

Syncs are idempotent - safe to retry.

---

**Q: How do I migrate to custom resource names?**

A: **Migration steps:**

1. **Create new plugin with custom names**:
   ```javascript
   const newPlugin = new KubernetesInventoryPlugin({
     clusters: [...],
     resourceNames: {
       snapshots: 'k8s_v2_snapshots',
       versions: 'k8s_v2_versions',
       changes: 'k8s_v2_changes',
       clusters: 'k8s_v2_clusters'
     }
   });
   ```

2. **Install and sync**:
   ```javascript
   await db.usePlugin(newPlugin);
   await newPlugin.syncAllClusters();
   ```

3. **Verify data**:
   ```javascript
   const snapshots = await newPlugin.getSnapshots({});
   console.log('Migrated:', snapshots.length);
   ```

4. **Remove old plugin** (after verification)

---

**Q: What permissions does the plugin need?**

A: **Minimum RBAC permissions:**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: k8s-inventory-reader
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: k8s-inventory-reader-binding
subjects:
  - kind: ServiceAccount
    name: k8s-inventory
    namespace: default
roleRef:
  kind: ClusterRole
  name: k8s-inventory-reader
  apiGroup: rbac.authorization.k8s.io
```

**Security tip**: Don't grant `create`, `update`, `delete` permissions - read-only is sufficient.

---

✅ **All questions answered! For more details, see the [examples](../examples/) or [tests](../../tests/plugins/kubernetes-inventory.test.js).**
