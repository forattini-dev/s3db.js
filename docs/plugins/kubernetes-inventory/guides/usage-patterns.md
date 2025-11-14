# 🎯 Usage Patterns for Kubernetes Inventory

**Prev:** [← Configuration](./configuration.md)
**Next:** [Best Practices →](./best-practices.md)
**Main:** [← Kubernetes Inventory Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - 5 progressive patterns (Beginner → Advanced)
> - Complete working code for each pattern
> - API reference for all methods
> - Event handling & monitoring
> - Copy-paste recipes

**Time to read:** 20 minutes
**Difficulty:** Intermediate

---

## Pattern Overview

| Pattern | Use Case | Complexity | Typical Duration |
|---------|----------|-----------|------------------|
| Single Cluster Discovery | Local dev, single cluster monitoring | Beginner | 5 minutes |
| Multi-Cluster Monitoring | Production multi-cloud, multi-region | Intermediate | 15 minutes |
| Change Detection & Alerts | Real-time change tracking, compliance | Intermediate | 10 minutes |
| Version History & Audit | Incident investigation, rollback analysis | Advanced | 15 minutes |
| Scheduled Discovery | Scheduled sync, cost optimization | Advanced | 20 minutes |

---

## Pattern 1: Single Cluster Discovery

**Use case:** Local development, single cluster testing, basic monitoring

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/k8s-inventory'
});

const plugin = new KubernetesInventoryPlugin({
  namespace: 'dev_k8s',
  clusters: [
    {
      id: 'local',
      name: 'Local Kubernetes'
    }
  ],
  discovery: {
    enabled: true,
    runOnInstall: true,
    interval: 600000,        // Every 10 minutes
    select: {
      resourceTypes: [
        'core.v1.Pod',
        'apps.v1.Deployment',
        'core.v1.Service'
      ],
      namespaces: ['default']
    }
  }
});

await db.usePlugin(plugin);
await db.connect();

// Wait for initial discovery
await new Promise(resolve => setTimeout(resolve, 5000));

// Query discovered resources
const pods = await plugin.getSnapshots({
  clusterId: 'local',
  resourceType: 'core.v1.Pod'
});

console.log(`Found ${pods.length} Pods`);
pods.forEach(pod => {
  console.log(`  - ${pod.name} (${pod.data.status.phase})`);
});

// Stop discovery when done
await plugin.stopDiscovery();
await db.disconnect();
```

**Key Methods Used:**
- `getSnapshots()` - Get current resource state
- `stopDiscovery()` - Stop monitoring

---

## Pattern 2: Multi-Cluster Monitoring

**Use case:** Production multi-region, multi-cloud monitoring, centralized visibility

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/k8s-inventory'
});

const plugin = new KubernetesInventoryPlugin({
  namespace: 'prod_k8s',

  clusters: [
    {
      id: 'aws-us-east',
      name: 'AWS US East 1',
      kubeconfig: process.env.KUBECONFIG_AWS,
      tags: { provider: 'aws', region: 'us-east-1', env: 'prod' }
    },
    {
      id: 'gcp-us-central',
      name: 'GCP US Central',
      kubeconfig: process.env.KUBECONFIG_GCP,
      tags: { provider: 'gcp', region: 'us-central1', env: 'prod' }
    },
    {
      id: 'azure-eastus',
      name: 'Azure East US',
      kubeconfig: process.env.KUBECONFIG_AZURE,
      tags: { provider: 'azure', region: 'eastus', env: 'prod' }
    }
  ],

  discovery: {
    enabled: true,
    interval: 1800000,       // Every 30 minutes

    select: {
      resourceTypes: [
        'core.v1.Pod',
        'core.v1.Node',
        'apps.v1.Deployment',
        'apps.v1.StatefulSet',
        'core.v1.Service'
      ]
    },

    changeDetection: {
      enabled: true,
      ignoreFields: ['status.lastProbeTime', 'metadata.managedFields']
    }
  },

  partitions: {
    byCluster: { fields: { clusterId: 'string' } },
    byProvider: { fields: { provider: 'string' } },
    byResourceType: { fields: { resourceType: 'string' } }
  }
});

await db.usePlugin(plugin);
await db.connect();

// Monitor all clusters
plugin.on('cluster.sync.started', ({ clusterId }) => {
  console.log(`[${clusterId}] Sync started`);
});

plugin.on('cluster.sync.completed', ({ clusterId, resourceCount }) => {
  console.log(`[${clusterId}] Sync complete: ${resourceCount} resources`);
});

plugin.on('resource.discovered', ({ clusterId, resourceType, name }) => {
  console.log(`[${clusterId}] Discovered: ${resourceType}/${name}`);
});

// Query across all clusters
const allDeployments = await plugin.getSnapshots({
  resourceType: 'apps.v1.Deployment'
});

console.log(`\nTotal Deployments Across All Clusters: ${allDeployments.length}`);

// Query by provider
const awsResources = await plugin.getSnapshots({
  provider: 'aws'
});

console.log(`AWS Resources: ${awsResources.length}`);

// Query specific cluster
const gcpPods = await plugin.getSnapshots({
  clusterId: 'gcp-us-central',
  resourceType: 'core.v1.Pod'
});

console.log(`GCP Pods: ${gcpPods.length}`);
```

**Key Methods Used:**
- `getSnapshots()` with filters
- Event listeners: `cluster.sync.started`, `cluster.sync.completed`, `resource.discovered`

---

## Pattern 3: Change Detection & Alerts

**Use case:** Real-time change tracking, compliance monitoring, automated remediation

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/k8s-inventory'
});

const plugin = new KubernetesInventoryPlugin({
  namespace: 'compliance_k8s',

  clusters: [
    {
      id: 'prod',
      name: 'Production',
      kubeconfig: process.env.KUBECONFIG_PROD
    }
  ],

  discovery: {
    enabled: true,
    interval: 300000,        // Every 5 minutes for real-time detection

    select: {
      resourceTypes: [
        'core.v1.Secret',
        'rbac.authorization.k8s.io.v1.Role',
        'rbac.authorization.k8s.io.v1.RoleBinding',
        'core.v1.Service'
      ]
    },

    changeDetection: {
      enabled: true,
      calculateDiff: true,
      ignoreFields: []       // Track ALL changes for compliance
    }
  },

  ttl: {
    changes: null            // Never delete change records
  }
});

await db.usePlugin(plugin);
await db.connect();

// Alert on sensitive changes
plugin.on('change.detected', async ({ clusterId, resourceType, resourceId, diff }) => {
  // Flag suspicious changes
  const hasDangerousChanges =
    resourceType.includes('Secret') ||
    resourceType.includes('Role') ||
    diff.added['metadata.labels.sensitive'];

  if (hasDangerousChanges) {
    console.log(`⚠️  ALERT: Sensitive change detected!`);
    console.log(`  Cluster: ${clusterId}`);
    console.log(`  Resource: ${resourceType}/${resourceId}`);
    console.log(`  Added fields:`, Object.keys(diff.added || {}));
    console.log(`  Changed fields:`, Object.keys(diff.updated || {}));
    console.log(`  Removed fields:`, Object.keys(diff.removed || {}));

    // Send to alert system
    await sendAlert({
      severity: 'HIGH',
      message: `Suspicious change in ${resourceType}`,
      cluster: clusterId,
      resource: resourceId,
      diff: diff
    });
  }
});

// Monitor specific changes
plugin.on('change.detected', async ({ clusterId, resourceId, diff }) => {
  // Secret value changed
  if (diff.updated['data']) {
    console.log(`🔑 Secret value changed: ${resourceId}`);
    // Trigger secret rotation
    await rotateSecret(resourceId);
  }

  // RBAC permissions changed
  if (diff.updated['rules']) {
    console.log(`👤 RBAC rules changed: ${resourceId}`);
    // Validate new permissions
    await validateRBACChanges(resourceId);
  }
});

// Get change history
const changes = await plugin.getChanges({
  clusterId: 'prod',
  resourceType: 'core.v1.Secret'
});

console.log(`\nSecret Changes (last 24h): ${changes.length}`);
changes.forEach(change => {
  console.log(`  ${change.resourceId}: v${change.fromVersion} → v${change.toVersion}`);
});

async function sendAlert(alert) {
  console.log('📧 Sending alert:', alert);
}

async function rotateSecret(secretId) {
  console.log(`🔄 Rotating secret: ${secretId}`);
}

async function validateRBACChanges(rbacId) {
  console.log(`✓ Validating RBAC: ${rbacId}`);
}
```

**Key Methods Used:**
- `getChanges()` - Get change records
- Event listeners: `change.detected`

---

## Pattern 4: Version History & Audit Trail

**Use case:** Incident investigation, rollback analysis, compliance audits

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/k8s-inventory'
});

const plugin = new KubernetesInventoryPlugin({
  namespace: 'audit_k8s',

  clusters: [
    {
      id: 'prod',
      kubeconfig: process.env.KUBECONFIG_PROD
    }
  ],

  discovery: {
    enabled: true,
    interval: 1800000,

    changeDetection: {
      enabled: true,
      calculateDiff: true
    }
  },

  // Keep full audit trail
  ttl: {
    snapshots: null,
    versions: null,
    changes: null
  }
});

await db.usePlugin(plugin);
await db.connect();

// Investigate a specific resource
async function investigateDeployment(deploymentName) {
  console.log(`\n📋 Investigating Deployment: ${deploymentName}\n`);

  // Get current state
  const snapshots = await plugin.getSnapshots({
    clusterId: 'prod',
    resourceType: 'apps.v1.Deployment',
    resourceId: deploymentName
  });

  if (snapshots.length === 0) {
    console.log('❌ Deployment not found');
    return;
  }

  const current = snapshots[0];
  console.log(`Current Version: ${current.latestVersion}`);
  console.log(`Updated: ${current.updatedAt}`);
  console.log(`Replicas: ${current.data.spec.replicas}`);

  // Get complete version history
  const versions = await plugin.getVersions({
    clusterId: 'prod',
    resourceType: 'apps.v1.Deployment',
    resourceId: deploymentName
  });

  console.log(`\nTotal Versions: ${versions.length}`);
  console.log('Version History:');

  versions.forEach((version, index) => {
    const timeAgo = getTimeAgo(new Date(version.capturedAt));
    console.log(`  v${version.version}: ${timeAgo} (${version.digest.slice(0, 8)}...)`);
  });

  // Get changes between versions
  const changes = await plugin.getChanges({
    clusterId: 'prod',
    resourceType: 'apps.v1.Deployment',
    resourceId: deploymentName
  });

  console.log(`\nTotal Changes: ${changes.length}`);
  console.log('Recent Changes:');

  changes.slice(0, 5).forEach(change => {
    const timeAgo = getTimeAgo(new Date(change.capturedAt));
    console.log(`  v${change.fromVersion} → v${change.toVersion} (${timeAgo})`);
    console.log(`    Added: ${Object.keys(change.diff.added || {}).join(', ')}`);
    console.log(`    Changed: ${Object.keys(change.diff.updated || {}).join(', ')}`);
  });

  // Find when specific field changed
  const imageChanges = changes.filter(c =>
    c.diff.updated['spec.template.spec.containers[0].image']
  );

  if (imageChanges.length > 0) {
    console.log(`\nImage Changes: ${imageChanges.length}`);
    imageChanges.forEach(change => {
      const update = change.diff.updated['spec.template.spec.containers[0].image'];
      console.log(`  v${change.fromVersion}: ${update.from}`);
      console.log(`  v${change.toVersion}: ${update.to}`);
    });
  }
}

// Get resource at specific point in time
async function getResourceAtVersion(resourceId, version) {
  const versions = await plugin.getVersions({
    clusterId: 'prod',
    resourceId: resourceId
  });

  const targetVersion = versions.find(v => v.version === version);
  if (!targetVersion) {
    console.log(`Version ${version} not found`);
    return null;
  }

  console.log(`Resource at v${version}:`);
  console.log(JSON.stringify(targetVersion.data, null, 2));
  return targetVersion.data;
}

// Audit trail export
async function exportAuditTrail(startDate, endDate) {
  const changes = await plugin.getChanges({
    clusterId: 'prod'
  });

  const filtered = changes.filter(c => {
    const date = new Date(c.capturedAt);
    return date >= startDate && date <= endDate;
  });

  return {
    period: { startDate, endDate },
    totalChanges: filtered.length,
    changesByResourceType: groupBy(filtered, c => c.resourceType),
    changesByResource: groupBy(filtered, c => c.resourceId)
  };
}

function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function groupBy(arr, fn) {
  return arr.reduce((acc, item) => {
    const key = fn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

// Run investigation
await investigateDeployment('my-app-deployment');
```

**Key Methods Used:**
- `getSnapshots()` - Current state
- `getVersions()` - Version history
- `getChanges()` - Change records with diffs

---

## Pattern 5: Scheduled Discovery with Webhooks

**Use case:** Real-time change notifications, event-driven automation, external system sync

```javascript
import { Database } from 's3db.js';
import { KubernetesInventoryPlugin } from 's3db.js/plugins';
import express from 'express';

const db = new Database({
  connectionString: 's3://key:secret@bucket/k8s-inventory'
});

const plugin = new KubernetesInventoryPlugin({
  namespace: 'webhook_k8s',

  clusters: [
    {
      id: 'prod',
      kubeconfig: process.env.KUBECONFIG_PROD
    }
  ],

  discovery: {
    enabled: true,
    // Use cron for scheduled sync
    schedule: '*/15 * * * *',  // Every 15 minutes
    interval: null,            // Disable interval-based

    select: {
      resourceTypes: [
        'apps.v1.Deployment',
        'core.v1.Service',
        'core.v1.ConfigMap'
      ]
    },

    changeDetection: {
      enabled: true,
      calculateDiff: true
    }
  }
});

await db.usePlugin(plugin);
await db.connect();

// Create webhook server
const app = express();
app.use(express.json());

// Webhook handlers for different events
const webhooks = {
  'deployment.created': [],
  'deployment.updated': [],
  'deployment.deleted': [],
  'service.created': [],
  'configmap.updated': []
};

function registerWebhook(event, url) {
  if (!webhooks[event]) webhooks[event] = [];
  webhooks[event].push(url);
  console.log(`Registered webhook: ${event} → ${url}`);
}

async function triggerWebhooks(event, payload) {
  const hooks = webhooks[event] || [];
  for (const url of hooks) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error(`Webhook failed: ${url}`, err.message);
    }
  }
}

// Monitor resource creation
plugin.on('resource.discovered', async ({ clusterId, resourceType, resourceId, data }) => {
  if (resourceType === 'apps.v1.Deployment') {
    await triggerWebhooks('deployment.created', {
      clusterId,
      deploymentId: resourceId,
      replicas: data.spec.replicas,
      image: data.spec.template.spec.containers[0].image
    });
  }
});

// Monitor changes
plugin.on('change.detected', async ({ clusterId, resourceType, resourceId, diff }) => {
  if (resourceType === 'apps.v1.Deployment' && diff.updated['spec.replicas']) {
    await triggerWebhooks('deployment.updated', {
      clusterId,
      deploymentId: resourceId,
      change: 'replicas',
      from: diff.updated['spec.replicas'].from,
      to: diff.updated['spec.replicas'].to
    });
  }

  if (resourceType === 'core.v1.ConfigMap') {
    await triggerWebhooks('configmap.updated', {
      clusterId,
      configmapId: resourceId,
      updatedKeys: Object.keys(diff.updated || {})
    });
  }
});

// Register webhooks
registerWebhook('deployment.created', 'http://slack-bot/deploy-created');
registerWebhook('deployment.updated', 'http://metrics-collector/update');
registerWebhook('configmap.updated', 'http://cache-invalidator/refresh');

// Webhook endpoints
app.post('/webhooks/:event', (req, res) => {
  const { event } = req.params;
  webhooks[event] = webhooks[event] || [];
  webhooks[event].push(req.body.url);
  res.json({ success: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

**Key Methods Used:**
- Scheduled discovery with cron
- Event listeners: `resource.discovered`, `change.detected`
- Webhook integration for external systems

---

## API Reference

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getSnapshots(filter)` | Get current resource state | Array of snapshots |
| `getVersions(filter)` | Get resource version history | Array of versions |
| `getChanges(filter)` | Get changes between versions | Array of changes |
| `getClusters()` | List configured clusters | Array of cluster configs |
| `syncCluster(clusterId)` | Manually trigger cluster sync | Promise<number> (resource count) |
| `syncAllClusters()` | Manually sync all clusters | Promise<object> (results per cluster) |
| `stopDiscovery()` | Stop discovery scheduler | Promise<void> |

### Events

| Event | Payload | When Triggered |
|-------|---------|-----------------|
| `cluster.sync.started` | `{ clusterId, timestamp }` | Sync begins |
| `cluster.sync.completed` | `{ clusterId, resourceCount, timestamp }` | Sync finishes |
| `resource.discovered` | `{ clusterId, resourceType, name, data }` | New resource found |
| `resource.deleted` | `{ clusterId, resourceType, name }` | Resource deleted |
| `change.detected` | `{ clusterId, resourceType, resourceId, diff }` | Changes detected |

---

## Copy-Paste Recipes

### Recipe 1: Find All Deployments with Pending Pods

```javascript
const deployments = await plugin.getSnapshots({
  resourceType: 'apps.v1.Deployment'
});

const problematicDeployments = deployments.filter(d => {
  const replicas = d.data.spec.replicas;
  const ready = d.data.status.readyReplicas || 0;
  return ready < replicas;
});

console.log('Deployments with pending pods:', problematicDeployments.length);
problematicDeployments.forEach(d => {
  console.log(`  ${d.name}: ${d.data.status.readyReplicas}/${d.data.spec.replicas}`);
});
```

### Recipe 2: Compare Resource Across Clusters

```javascript
const clusterId1 = 'aws-prod';
const clusterId2 = 'gcp-prod';

const resource1 = await plugin.getSnapshots({
  clusterId: clusterId1,
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-app'
});

const resource2 = await plugin.getSnapshots({
  clusterId: clusterId2,
  resourceType: 'apps.v1.Deployment',
  resourceId: 'my-app'
});

const config1 = resource1[0].data.spec;
const config2 = resource2[0].data.spec;

const differences = compareConfigs(config1, config2);
console.log('Differences:', differences);

function compareConfigs(a, b, path = '') {
  const diffs = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach(key => {
    const currentPath = path ? `${path}.${key}` : key;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      diffs.push({
        path: currentPath,
        cluster1: a[key],
        cluster2: b[key]
      });
    }
  });
  return diffs;
}
```

### Recipe 3: Export Daily Audit Report

```javascript
async function generateDailyAuditReport() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const changes = await plugin.getChanges({
    clusterId: 'prod'
  });

  const dayChanges = changes.filter(c =>
    new Date(c.capturedAt) >= yesterday
  );

  const report = {
    date: yesterday.toISOString().split('T')[0],
    summary: {
      totalChanges: dayChanges.length,
      resourcesChanged: new Set(dayChanges.map(c => c.resourceId)).size,
      resourceTypes: groupBy(dayChanges, c => c.resourceType)
    },
    details: dayChanges.map(c => ({
      resource: `${c.resourceType}/${c.resourceId}`,
      version: `${c.fromVersion} → ${c.toVersion}`,
      timestamp: c.capturedAt,
      summary: {
        added: Object.keys(c.diff.added || {}).length,
        changed: Object.keys(c.diff.updated || {}).length,
        removed: Object.keys(c.diff.removed || {}).length
      }
    }))
  };

  return report;
}
```

---

## Next Steps

1. **Learn best practices** → [Best Practices](./best-practices.md)
2. **Understand performance** → Check out pattern 5 for scheduled syncing

---

**Prev:** [← Configuration](./configuration.md)
**Next:** [Best Practices →](./best-practices.md)
**Main:** [← Kubernetes Inventory Plugin](../README.md)
