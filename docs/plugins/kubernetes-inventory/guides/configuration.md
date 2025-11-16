# ⚙️ Kubernetes Inventory Configuration Guide

**Prev:** [← Getting Started](./getting-started.md)
**Next:** [Usage Patterns →](./usage-patterns.md)
**Main:** [← Kubernetes Inventory Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - Default configuration object
> - All cluster and discovery options
> - Configuration patterns for different environments
> - Resource filtering and CRD discovery
> - Performance tuning and optimization
> - Logging and debugging setup

**Time to read:** 15 minutes
**Difficulty:** Intermediate

---

## Default Configuration

```javascript
new KubernetesInventoryPlugin({
  // Cluster definitions
  clusters: [
    {
      // Unique cluster identifier
      id: 'production',

      // Human-readable name
      name: 'Production EKS Cluster',

      // Authentication method (priority order)
      // Option 1: Kubeconfig file path
      kubeconfig: '/path/to/kubeconfig.yaml',

      // Option 2: Use in-cluster service account
      inCluster: false,

      // Option 3: Specific kubeconfig context
      context: 'prod-context',

      // Option 4: Manual connection
      connection: {
        server: 'https://k8s.example.com:6443',
        token: 'service-account-token',
        caData: 'base64-encoded-ca-cert'
      },

      // Namespace filtering
      namespaces: ['default', 'kube-system'],  // Include only these
      excludeNamespaces: [],                    // OR exclude these

      // Cluster-specific settings
      tags: { env: 'production', region: 'us-east-1' },
      tlsInsecure: false
    }
  ],

  // Global discovery settings
  discovery: {
    enabled: true,                              // Enable automatic discovery
    runOnInstall: true,                        // Auto-sync on plugin init
    interval: 3600000,                         // Sync every 1 hour

    // Resource filtering
    select: {
      resourceTypes: [                         // Only discover these types
        'core.v1.Pod',
        'apps.v1.Deployment',
        'apps.v1.StatefulSet'
      ],
      namespaces: [],                          // Empty = all namespaces
      labels: {                                // Only resources with these labels
        'app.kubernetes.io/managed-by': 'helm'
      }
    },

    ignore: {
      resourceTypes: ['core.v1.Event'],       // Never discover these
      namespaces: ['kube-node-lease'],        // Ignore these namespaces
      labels: {
        'app.kubernetes.io/ignore': 'true'    // Ignore with this label
      },
      pods: {
        inPhase: ['Succeeded', 'Failed']       // Ignore completed pods
      }
    },

    // CRD discovery
    customResourceDefinitions: {
      enabled: false,                          // Discover CRDs
      select: [],                              // Specific CRDs to sync
      ignore: []                               // CRDs to skip
    },

    // Scheduled discovery
    schedule: null,                            // Cron expression (optional)
    // schedule: '0 */6 * * *'                  // Every 6 hours

    // Change detection
    changeDetection: {
      enabled: true,                           // Track changes
      calculateDiff: true,                     // Detailed diffs
      detectDeletions: true,                   // Track deletions
      ignoreFields: [
        'status.lastProbeTime',               // Ignore changing status fields
        'metadata.managedFields'
      ]
    }
  },

  // Resource behavior
  behavior: 'body-overflow',                   // How to handle large resources
  // Options: 'body-overflow', 'body-only', 'truncate-data'

  // Data organization
  partitions: {
    byCluster: {
      fields: { clusterId: 'string' }
    },
    byNamespace: {
      fields: { namespace: 'string' }
    },
    byResourceType: {
      fields: { resourceType: 'string' }
    }
  },

  // Retention policies
  ttl: {
    snapshots: 2592000000,                     // Keep 30 days
    versions: 7776000000,                      // Keep 90 days
    changes: 2592000000,                       // Keep 30 days
    deletedResources: 604800000                // Keep 7 days after deletion
  },

  // Logging
  logLevel: 'silent',                              // Enable detailed logging
  logLevel: 'info',                           // 'debug', 'info', 'warn', 'error'
  logFormat: 'json',                          // 'json' or 'text'

  // Resource naming
  namespace: 'k8s-inventory',                 // Resource prefix
  resourceNames: {
    snapshots: 'k8s-inventory_snapshots',
    versions: 'k8s-inventory_versions',
    changes: 'k8s-inventory_changes',
    metadata: 'k8s-inventory_metadata'
  }
})
```

---

## Configuration Patterns

### Pattern 1: Local Development (Single Cluster)

Minimal setup for local Kubernetes cluster:

```javascript
new KubernetesInventoryPlugin({
  namespace: 'dev_k8s',
  clusters: [
    {
      id: 'local',
      name: 'Local Kubernetes',
      // Uses ~/.kube/config automatically
    }
  ],
  discovery: {
    enabled: true,
    runOnInstall: true,
    interval: 600000,        // Every 10 minutes
    select: {
      // Only sync default namespace
      namespaces: ['default', 'kube-system']
    }
  },
  ttl: {
    snapshots: 3600000,      // Keep 1 hour only
    versions: 3600000
  },
  logLevel: 'debug'              // Detailed logging for debugging
})
```

**Use when:**
- ✅ Local minikube/kind development
- ✅ Single cluster testing
- ✅ Interactive debugging

---

### Pattern 2: Production Multi-Cluster (AWS EKS)

Production setup monitoring multiple EKS clusters:

```javascript
new KubernetesInventoryPlugin({
  namespace: 'prod_k8s',
  clusters: [
    {
      id: 'prod-us-east',
      name: 'Production US East',
      kubeconfig: process.env.KUBECONFIG_PROD_US_EAST,
      tags: { env: 'production', region: 'us-east-1' },
      namespaces: ['default', 'kube-system', 'monitoring', 'ingress-nginx']
    },
    {
      id: 'prod-eu-west',
      name: 'Production EU West',
      kubeconfig: process.env.KUBECONFIG_PROD_EU_WEST,
      tags: { env: 'production', region: 'eu-west-1' },
      namespaces: ['default', 'kube-system', 'monitoring', 'ingress-nginx']
    },
    {
      id: 'prod-ap-south',
      name: 'Production AP South',
      kubeconfig: process.env.KUBECONFIG_PROD_AP_SOUTH,
      tags: { env: 'production', region: 'ap-south-1' },
      namespaces: ['default', 'kube-system', 'monitoring', 'ingress-nginx']
    }
  ],
  discovery: {
    enabled: true,
    interval: 1800000,       // Every 30 minutes
    select: {
      resourceTypes: [
        'core.v1.Pod',
        'core.v1.Service',
        'core.v1.ConfigMap',
        'core.v1.Secret',
        'apps.v1.Deployment',
        'apps.v1.StatefulSet',
        'apps.v1.DaemonSet',
        'batch.v1.Job',
        'batch.v1.CronJob',
        'networking.k8s.io.v1.NetworkPolicy',
        'storage.k8s.io.v1.StorageClass',
        'cert-manager.io.v1.Certificate'
      ],
      labels: {
        'managed-by': 'terraform'  // Only managed resources
      }
    },
    changeDetection: {
      enabled: true,
      ignoreFields: [
        'status.lastProbeTime',
        'status.lastUpdateTime',
        'metadata.managedFields',
        'metadata.generation'
      ]
    }
  },
  partitions: {
    byCluster: { fields: { clusterId: 'string' } },
    byNamespace: { fields: { namespace: 'string' } },
    byResourceType: { fields: { resourceType: 'string' } }
  },
  ttl: {
    snapshots: 2592000000,   // 30 days
    versions: 7776000000,    // 90 days
    changes: 2592000000      // 30 days
  }
})
```

**Use when:**
- ✅ Production environments
- ✅ Multi-region/multi-cluster setups
- ✅ High-scale monitoring
- ✅ Compliance & audit requirements

---

### Pattern 3: CI/CD Integration (Multiple Staging Environments)

Setup for testing against multiple staging clusters:

```javascript
new KubernetesInventoryPlugin({
  namespace: `${process.env.NODE_ENV}_k8s`,
  clusters: [
    {
      id: 'staging-1',
      name: 'Staging Cluster 1',
      context: 'staging-1-context',
      namespaces: ['default', 'staging', 'testing']
    },
    {
      id: 'staging-2',
      name: 'Staging Cluster 2',
      context: 'staging-2-context',
      namespaces: ['default', 'staging', 'testing']
    }
  ],
  discovery: {
    enabled: true,
    runOnInstall: true,
    interval: 300000,         // Every 5 minutes
    select: {
      resourceTypes: [
        'core.v1.Pod',
        'apps.v1.Deployment',
        'core.v1.Service',
        'core.v1.ConfigMap'
      ]
    },
    changeDetection: {
      enabled: true,
      detectDeletions: true
    }
  },
  ttl: {
    snapshots: 86400000,      // 1 day
    versions: 604800000       // 7 days
  },
  logLevel: process.env.DEBUG === 'true' ? 'debug' : 'info'
})
```

**Use when:**
- ✅ CI/CD pipelines
- ✅ Integration testing
- ✅ Staging validation
- ✅ Pre-production verification

---

### Pattern 4: Security-Focused (Audit & Compliance)

Configuration for compliance, audit trails, and security monitoring:

```javascript
new KubernetesInventoryPlugin({
  namespace: 'audit_k8s',
  clusters: [
    {
      id: 'secure-prod',
      name: 'Secure Production',
      inCluster: true,        // Use service account inside pod
      tags: { compliance: 'required', audit: 'enabled' }
    }
  ],
  discovery: {
    enabled: true,
    interval: 3600000,        // Every hour
    select: {
      resourceTypes: [
        'core.v1.Secret',           // Monitor secrets
        'rbac.authorization.k8s.io.v1.Role',
        'rbac.authorization.k8s.io.v1.RoleBinding',
        'rbac.authorization.k8s.io.v1.ClusterRole',
        'rbac.authorization.k8s.io.v1.ClusterRoleBinding',
        'core.v1.ServiceAccount',
        'policy.v1.NetworkPolicy',
        'policy.v1.PodSecurityPolicy'
      ]
    },
    changeDetection: {
      enabled: true,
      calculateDiff: true,
      // Track every field change for audit
      ignoreFields: []        // Don't ignore any fields
    }
  },
  ttl: {
    snapshots: null,          // Never auto-delete snapshots
    versions: null,           // Never auto-delete versions
    changes: null,            // Never auto-delete changes
    deletedResources: null    // Never auto-delete
  },
  logLevel: 'debug',
  logFormat: 'json'           // Structured logging for audit systems
})
```

**Use when:**
- ✅ Compliance requirements (SOC2, PCI-DSS, HIPAA)
- ✅ Security audits
- ✅ Change tracking for governance
- ✅ Incident investigation

---

### Pattern 5: CRD-Heavy (Service Mesh, Operators)

Configuration optimized for Istio, ArgoCD, Flux, or custom operators:

```javascript
new KubernetesInventoryPlugin({
  namespace: 'crd_k8s',
  clusters: [
    {
      id: 'service-mesh',
      name: 'Istio Service Mesh',
      kubeconfig: process.env.KUBECONFIG_SERVICE_MESH
    }
  ],
  discovery: {
    enabled: true,
    interval: 1800000,        // Every 30 minutes

    // Discover all CRDs
    customResourceDefinitions: {
      enabled: true,
      select: [
        'istio.io',            // Istio resources
        'fluxcd.io',           // Flux CD
        'argoproj.io',         // ArgoCD
        'operators.coreos.com' // Operators
      ]
    },

    // Include both standard + custom resources
    select: {
      resourceTypes: [
        // Standard K8s
        'core.v1.Pod',
        'core.v1.Service',
        'apps.v1.Deployment',
        'networking.k8s.io.v1.Ingress',
        // Istio CRDs
        'networking.istio.io.v1beta1.VirtualService',
        'networking.istio.io.v1beta1.DestinationRule',
        'networking.istio.io.v1beta1.Gateway',
        // ArgoCD CRDs
        'argoproj.io.v1alpha1.Application',
        'argoproj.io.v1alpha1.AppProject'
      ]
    },

    changeDetection: {
      enabled: true,
      // CRD status fields change frequently
      ignoreFields: [
        'status.observedGeneration',
        'status.lastSyncTime',
        'status.reconciledAt'
      ]
    }
  },

  // Store CRD definitions
  resourceNames: {
    customResourceDefinitions: 'crd_k8s_crds'
  }
})
```

**Use when:**
- ✅ Service mesh deployments (Istio)
- ✅ GitOps workflows (ArgoCD, Flux)
- ✅ Custom operator deployments
- ✅ Complex Kubernetes ecosystems

---

### Pattern 6: Cost Optimization (Resource Tracking)

Minimal configuration for resource inventory and cost analysis:

```javascript
new KubernetesInventoryPlugin({
  namespace: 'cost_k8s',
  clusters: [
    {
      id: 'prod',
      name: 'Production',
      context: 'prod-context'
    }
  ],
  discovery: {
    enabled: true,
    interval: 3600000,        // Every hour (less frequent = lower cost)

    select: {
      // Only resources that consume cost
      resourceTypes: [
        'core.v1.Pod',
        'core.v1.PersistentVolumeClaim',
        'storage.k8s.io.v1.StorageClass',
        'core.v1.Node'
      ]
    },

    changeDetection: {
      enabled: true,
      calculateDiff: false,   // Don't calculate diffs (saves space)
      ignoreFields: [
        'status.conditions',
        'status.phase',
        'metadata.managedFields'
      ]
    }
  },

  behavior: 'truncate-data',  // Aggressive truncation for cost

  ttl: {
    snapshots: 604800000,     // Keep 7 days
    versions: 604800000,
    changes: 86400000         // Keep 1 day
  }
})
```

**Use when:**
- ✅ Cost tracking & reporting
- ✅ Resource inventory only
- ✅ Budget-constrained environments
- ✅ Minimal monitoring requirements

---

### Pattern 7: Multi-Cloud (AWS + GCP + Azure)

Setup for monitoring Kubernetes across multiple cloud providers:

```javascript
new KubernetesInventoryPlugin({
  namespace: 'multicloud_k8s',
  clusters: [
    // AWS EKS
    {
      id: 'aws-prod',
      name: 'AWS EKS Production',
      kubeconfig: process.env.KUBECONFIG_AWS_PROD,
      tags: { provider: 'aws', region: 'us-east-1' }
    },
    // GCP GKE
    {
      id: 'gcp-prod',
      name: 'GCP GKE Production',
      kubeconfig: process.env.KUBECONFIG_GCP_PROD,
      tags: { provider: 'gcp', region: 'us-central1' }
    },
    // Azure AKS
    {
      id: 'azure-prod',
      name: 'Azure AKS Production',
      kubeconfig: process.env.KUBECONFIG_AZURE_PROD,
      tags: { provider: 'azure', region: 'eastus' }
    }
  ],

  discovery: {
    enabled: true,
    interval: 1800000,        // Every 30 minutes

    select: {
      resourceTypes: [
        'core.v1.Pod',
        'apps.v1.Deployment',
        'core.v1.Service',
        'core.v1.ConfigMap',
        'core.v1.Secret'
      ]
    },

    changeDetection: {
      enabled: true,
      ignoreFields: [
        'status',               // Provider-specific status differs
        'metadata.generation',
        'metadata.managedFields'
      ]
    }
  },

  partitions: {
    byProvider: {
      fields: { provider: 'string' }  // Query by cloud provider
    },
    byCluster: {
      fields: { clusterId: 'string' }
    }
  }
})
```

**Use when:**
- ✅ Multi-cloud strategies
- ✅ Hybrid cloud deployments
- ✅ Cloud provider comparison
- ✅ Disaster recovery across clouds

---

## Cluster Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | string | _(required)_ | Unique cluster identifier |
| `name` | string | `id` value | Human-readable cluster name |
| `kubeconfig` | string | `~/.kube/config` | Path to kubeconfig file |
| `context` | string | `current-context` | Specific kubeconfig context |
| `inCluster` | boolean | `false` | Use in-cluster service account |
| `connection` | object | `null` | Manual connection details (server, token, caData) |
| `namespaces` | array | `[]` | Include only these namespaces (empty = all) |
| `excludeNamespaces` | array | `[]` | Exclude these namespaces |
| `tags` | object | `{}` | Custom tags for organization |
| `tlsInsecure` | boolean | `false` | Skip TLS verification (dev only) |
| `timeout` | number | `30000` | API call timeout (ms) |
| `retries` | number | `3` | API retry attempts |

---

## Discovery Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable automatic discovery |
| `runOnInstall` | boolean | `true` | Auto-sync when plugin initializes |
| `interval` | number | `3600000` | Discovery interval (ms) |
| `schedule` | string | `null` | Cron expression for scheduled sync |
| `select.resourceTypes` | array | `[]` | Only discover these types (empty = all) |
| `select.namespaces` | array | `[]` | Only discover in these namespaces (empty = all) |
| `select.labels` | object | `{}` | Only resources with these labels |
| `ignore.resourceTypes` | array | `[]` | Never discover these types |
| `ignore.namespaces` | array | `[]` | Never discover in these namespaces |
| `ignore.labels` | object | `{}` | Ignore resources with these labels |
| `ignore.pods.inPhase` | array | `[]` | Ignore pods in these phases |
| `customResourceDefinitions.enabled` | boolean | `false` | Discover CRDs |
| `customResourceDefinitions.select` | array | `[]` | Specific CRD groups to sync |
| `customResourceDefinitions.ignore` | array | `[]` | CRD groups to skip |
| `changeDetection.enabled` | boolean | `true` | Track changes between versions |
| `changeDetection.calculateDiff` | boolean | `true` | Generate detailed diffs |
| `changeDetection.detectDeletions` | boolean | `true` | Track deleted resources |
| `changeDetection.ignoreFields` | array | `[]` | Fields to ignore in diff calculation |

### Resource Type Selection Guide

**All Standard Kubernetes Resource Types:**

| Category | Resource Types |
|----------|-----------------|
| Core | `core.v1.Pod`, `core.v1.Service`, `core.v1.ConfigMap`, `core.v1.Secret`, `core.v1.PersistentVolume`, `core.v1.PersistentVolumeClaim`, `core.v1.Namespace`, `core.v1.Node`, `core.v1.ServiceAccount` |
| Apps | `apps.v1.Deployment`, `apps.v1.StatefulSet`, `apps.v1.DaemonSet`, `apps.v1.ReplicaSet`, `batch.v1.Job`, `batch.v1.CronJob` |
| Networking | `networking.k8s.io.v1.Ingress`, `networking.k8s.io.v1.NetworkPolicy` |
| RBAC | `rbac.authorization.k8s.io.v1.Role`, `rbac.authorization.k8s.io.v1.RoleBinding`, `rbac.authorization.k8s.io.v1.ClusterRole`, `rbac.authorization.k8s.io.v1.ClusterRoleBinding` |
| Storage | `storage.k8s.io.v1.StorageClass`, `storage.k8s.io.v1.PersistentVolumeStorageClass` |
| Policy | `policy.v1.PodDisruptionBudget`, `policy.v1.PodSecurityPolicy` |
| Metrics | `metrics.k8s.io.v1beta1.PodMetrics`, `metrics.k8s.io.v1beta1.NodeMetrics` |
| Autoscaling | `autoscaling.v1.HorizontalPodAutoscaler`, `autoscaling.v2.HorizontalPodAutoscaler` |

---

## Namespace Filtering

### Include Specific Namespaces

```javascript
clusters: [
  {
    id: 'prod',
    // Only discover these namespaces
    namespaces: ['default', 'kube-system', 'monitoring', 'ingress-nginx']
  }
]
```

### Exclude Specific Namespaces

```javascript
clusters: [
  {
    id: 'prod',
    excludeNamespaces: [
      'kube-node-lease',
      'kube-public',
      'testing'
    ]
  }
]
```

### Dynamic Namespace Selection

```javascript
clusters: [
  {
    id: 'prod',
    // Discovered at runtime
    namespaces: (await getProductionNamespaces())
  }
]
```

---

## Label Filtering

### Include Resources by Label

```javascript
discovery: {
  select: {
    labels: {
      'app.kubernetes.io/managed-by': 'helm',
      'env': 'production'
    }
  }
}
```

**Match Logic:**
- All labels must match (AND logic)
- `{}` = no filtering (all resources included)
- Label selectors use exact matching

### Exclude Resources by Label

```javascript
discovery: {
  ignore: {
    labels: {
      'skip-inventory': 'true',
      'temporary': 'true'
    }
  }
}
```

---

## Scheduled Discovery

### Cron-Based Sync

```javascript
discovery: {
  // Sync every 6 hours
  schedule: '0 */6 * * *',

  // Sync at 2 AM daily
  schedule: '0 2 * * *',

  // Sync every 15 minutes
  schedule: '*/15 * * * *',

  // Sync Monday-Friday at 9 AM
  schedule: '0 9 * * 1-5'
}
```

**Cron Format:** `minute hour day month weekday`

**Common Schedules:**
| Schedule | Frequency |
|----------|-----------|
| `0 * * * *` | Every hour |
| `0 */6 * * *` | Every 6 hours |
| `0 0 * * *` | Daily at midnight |
| `0 2 * * *` | Daily at 2 AM |
| `0 0 * * 0` | Weekly (Sunday) |
| `*/15 * * * *` | Every 15 minutes |

---

## CRD Discovery Configuration

### Auto-Discover All CRDs

```javascript
discovery: {
  customResourceDefinitions: {
    enabled: true,
    // Discover ALL CRDs in cluster
  }
}
```

### Selective CRD Discovery

```javascript
discovery: {
  customResourceDefinitions: {
    enabled: true,
    select: [
      'istio.io',                    // All Istio CRDs
      'networking.istio.io',
      'argoproj.io',                 // ArgoCD CRDs
      'fluxcd.io',                   // Flux CD CRDs
      'operators.coreos.com'         // Operator framework
    ]
  }
}
```

### Exclude Specific CRDs

```javascript
discovery: {
  customResourceDefinitions: {
    enabled: true,
    ignore: [
      'metrics.k8s.io',              // Don't sync metrics
      'events.k8s.io'                // Don't sync events
    ]
  }
}
```

---

## Change Detection Configuration

### Selective Field Ignoring

```javascript
discovery: {
  changeDetection: {
    enabled: true,
    calculateDiff: true,
    ignoreFields: [
      'status.lastProbeTime',
      'status.lastUpdateTime',
      'metadata.managedFields',
      'metadata.generation',
      'metadata.resourceVersion',
      'status.observedGeneration'
    ]
  }
}
```

**Common Fields to Ignore:**
- `status.*` - Status updates frequently
- `metadata.managedFields` - Kubernetes tracks control plane changes
- `metadata.generation` - Internal tracking
- `metadata.resourceVersion` - Version counter
- `lastProbeTime`, `lastHeartbeat` - Periodic updates

### Detect All Changes

```javascript
discovery: {
  changeDetection: {
    enabled: true,
    calculateDiff: true,
    ignoreFields: []  // Track every change
  }
}
```

---

## Partitioning Configuration

### Optimize Query Performance

```javascript
partitions: {
  byCluster: {
    fields: { clusterId: 'string' }
  },
  byNamespace: {
    fields: { namespace: 'string' }
  },
  byResourceType: {
    fields: { resourceType: 'string' }
  },
  byStatus: {
    fields: { status: 'string' }  // For Pods: Running, Pending, Failed
  }
}
```

**Benefits:**
- ✅ O(1) lookups instead of O(n) scans
- ✅ Query specific cluster resources instantly
- ✅ Filter by namespace without scanning all
- ✅ Group by resource type efficiently

---

## Behavior Configuration

### Handle Large Resources

| Behavior | Use Case | Overhead |
|----------|----------|----------|
| `body-overflow` | Default, auto overflow to body | Low |
| `body-only` | Large resources (>2KB) | Low |
| `truncate-data` | Accept data loss for speed | None |
| `enforce-limits` | Production, strict validation | Medium |

```javascript
// For production with large resources
behavior: 'body-overflow',

// For aggressive cost reduction
behavior: 'truncate-data',

// For strict validation
behavior: 'enforce-limits'
```

---

## TTL (Retention) Configuration

### Retention Guidelines

| Resource Type | Min | Recommended | Max |
|---------------|-----|-------------|-----|
| Snapshots | 1 day | 30 days | ∞ |
| Versions | 7 days | 90 days | 1 year |
| Changes | 1 day | 30 days | ∞ |
| Deleted Resources | 1 day | 7 days | 30 days |

### Configure Retention

```javascript
ttl: {
  snapshots: 2592000000,         // 30 days
  versions: 7776000000,          // 90 days
  changes: 2592000000,           // 30 days
  deletedResources: 604800000    // 7 days
}
```

### Disable Auto-Cleanup

```javascript
ttl: {
  snapshots: null,      // Never auto-delete
  versions: null,
  changes: null,
  deletedResources: null
}
```

---

## Performance Tuning

### Increase Sync Frequency

**For real-time monitoring:**

```javascript
discovery: {
  interval: 300000,     // Every 5 minutes (vs 1 hour default)

  select: {
    resourceTypes: [
      'core.v1.Pod',
      'apps.v1.Deployment'
    ]
  }
}
```

**Trade-off:** Higher API load, more current data

### Reduce Sync Frequency

**For cost optimization:**

```javascript
discovery: {
  interval: 7200000,    // Every 2 hours (vs 1 hour default)

  changeDetection: {
    calculateDiff: false  // Skip diff calculation
  }
}
```

**Trade-off:** Lower API load, higher latency

### Optimize for Large Clusters (1000+ nodes)

```javascript
discovery: {
  interval: 3600000,
  select: {
    resourceTypes: [     // Only essential types
      'core.v1.Pod',
      'core.v1.Node',
      'apps.v1.Deployment'
    ]
  },
  changeDetection: {
    ignoreFields: [      // Ignore non-essential fields
      'status',
      'metadata.managedFields'
    ]
  }
}
```

---

## Logging Configuration

### Debug Mode

```javascript
logLevel: 'debug',
logLevel: 'debug',
logFormat: 'text'
```

### Production Logging

```javascript
logLevel: 'silent',
logLevel: 'info',
logFormat: 'json'
```

### Structured Logging (Audit)

```javascript
logLevel: 'silent',
logLevel: 'debug',
logFormat: 'json'
// Output suitable for ELK, DataDog, Splunk
```

---

## Resource Externalization

### Customize Resource Names

```javascript
resourceNames: {
  snapshots: 'custom_k8s_snapshots',
  versions: 'custom_k8s_versions',
  changes: 'custom_k8s_changes',
  metadata: 'custom_k8s_metadata'
}
```

### Access Resources Programmatically

```javascript
const snapshots = await db.getResource('k8s-inventory_snapshots');
const versions = await db.getResource('k8s-inventory_versions');
const changes = await db.getResource('k8s-inventory_changes');
```

---

## Environment-Specific Configuration

Load configuration from environment variables:

```javascript
const config = {
  namespace: `${process.env.NODE_ENV}_k8s`,

  clusters: JSON.parse(process.env.K8S_CLUSTERS || '[]'),

  discovery: {
    enabled: process.env.K8S_DISCOVERY_ENABLED !== 'false',
    interval: parseInt(process.env.K8S_DISCOVERY_INTERVAL || '3600000'),
    runOnInstall: process.env.NODE_ENV !== 'development',

    select: {
      resourceTypes: (process.env.K8S_RESOURCE_TYPES || '').split(',').filter(Boolean),
      namespaces: (process.env.K8S_NAMESPACES || '').split(',').filter(Boolean)
    }
  },

  ttl: {
    snapshots: parseInt(process.env.K8S_TTL_SNAPSHOTS || '2592000000'),
    versions: parseInt(process.env.K8S_TTL_VERSIONS || '7776000000'),
    changes: parseInt(process.env.K8S_TTL_CHANGES || '2592000000')
  },

  logLevel: process.env.K8S_VERBOSE === 'true' ? 'debug' : 'info'
};

const plugin = new KubernetesInventoryPlugin(config);
```

---

## Common Configuration Mistakes

### ❌ Mistake 1: Not Setting Required Authentication

```javascript
// ❌ WRONG - Will fail if kubeconfig doesn't exist
clusters: [{ id: 'prod' }]
```

**Fix:**
```javascript
// ✅ CORRECT - Explicitly configure authentication
clusters: [
  {
    id: 'prod',
    kubeconfig: '/path/to/kubeconfig.yaml'
  }
]
```

---

### ❌ Mistake 2: Discovering Too Many Resource Types

```javascript
// ❌ WRONG - Syncs everything = very large dataset
discovery: {
  select: { resourceTypes: [] }  // Empty = all types
}
```

**Fix:**
```javascript
// ✅ CORRECT - Only discover what you need
discovery: {
  select: {
    resourceTypes: [
      'core.v1.Pod',
      'apps.v1.Deployment',
      'core.v1.Service'
    ]
  }
}
```

---

### ❌ Mistake 3: Too-Short TTL for Compliance

```javascript
// ❌ WRONG - Deletes audit trail
ttl: {
  versions: 86400000  // 1 day = no history
}
```

**Fix:**
```javascript
// ✅ CORRECT - Keep enough history
ttl: {
  versions: 7776000000  // 90 days = sufficient audit trail
}
```

---

## Next Steps

1. **See usage patterns** → [Usage Patterns](./usage-patterns.md)
2. **Learn best practices** → [Best Practices](./best-practices.md)

---

**Prev:** [← Getting Started](./getting-started.md)
**Next:** [Usage Patterns →](./usage-patterns.md)
**Main:** [← Kubernetes Inventory Plugin](../README.md)
