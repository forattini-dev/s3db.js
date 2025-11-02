/**
 * Example 74: Kubernetes Inventory Plugin - Advanced Filtering
 *
 * This example demonstrates:
 * - Select filter (whitelist)
 * - Ignore filter (blacklist)
 * - Function-based filters
 * - Wildcard patterns
 * - API group filtering
 * - Namespace filtering
 * - Combining multiple filter strategies
 *
 * Prerequisites:
 * - Access to a Kubernetes cluster
 * - @kubernetes/client-node installed: pnpm add @kubernetes/client-node
 */

import { Database } from '../../src/database.class.js';
import { KubernetesInventoryPlugin } from '../../src/plugins/kubernetes-inventory.plugin.js';

async function runExample(description, filterConfig) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n📋 ${description}\n`);
  console.log(`${'='.repeat(80)}\n`);

  const db = new Database({
    connectionString: `memory://k8s-filters-${Date.now()}/databases/k8s-demo`
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      {
        id: 'local',
        name: 'Local Cluster',
        // kubeconfig: '~/.kube/config',

        discovery: {
          includeSecrets: false,
          includeCRDs: true,
          ...filterConfig.clusterDiscovery,
        },
      }
    ],

    discovery: {
      runOnInstall: true,
      dryRun: false,
      ...filterConfig.globalDiscovery,
    },

    logger: (level, message) => {
      if (level === 'info' || level === 'warn' || level === 'error') {
        console.log(`[${level.toUpperCase()}] ${message}`);
      }
    },
    verbose: false,
  });

  await db.usePlugin(plugin);
  await db.connect();

  // Wait for discovery
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Show results
  const snapshots = await plugin.getSnapshots({ clusterId: 'local' });

  console.log(`\n✅ Discovery completed: ${snapshots.length} resources collected\n`);

  // Group by resource type
  const byType = {};
  snapshots.forEach(snapshot => {
    if (!byType[snapshot.resourceType]) {
      byType[snapshot.resourceType] = 0;
    }
    byType[snapshot.resourceType]++;
  });

  console.log('Resource breakdown:');
  Object.entries(byType)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .slice(0, 15) // Top 15
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

  await db.disconnect();
}

async function main() {
  console.log('🎯 Kubernetes Inventory Plugin - Advanced Filtering Examples\n');

  // ============================================
  // EXAMPLE 1: Select Only Specific Types
  // ============================================
  await runExample(
    'Example 1: Select Only Pods and Services',
    {
      globalDiscovery: {
        select: ['core.v1.Pod', 'core.v1.Service']
      }
    }
  );

  // ============================================
  // EXAMPLE 2: Wildcard Selection
  // ============================================
  await runExample(
    'Example 2: Select All Core API Resources',
    {
      globalDiscovery: {
        select: ['core.*']
      }
    }
  );

  // ============================================
  // EXAMPLE 3: Multiple API Groups
  // ============================================
  await runExample(
    'Example 3: Select Core, Apps, and Batch Resources',
    {
      globalDiscovery: {
        select: ['core.*', 'apps.*', 'batch.*']
      }
    }
  );

  // ============================================
  // EXAMPLE 4: Ignore Noisy Resources
  // ============================================
  await runExample(
    'Example 4: Collect Everything Except Events and Leases',
    {
      globalDiscovery: {
        select: null, // Allow all
        ignore: ['core.v1.Event', 'events.v1.Event', 'coordination.v1.Lease']
      }
    }
  );

  // ============================================
  // EXAMPLE 5: Select with Ignore Override
  // ============================================
  await runExample(
    'Example 5: Select Apps Resources But Ignore ReplicaSets',
    {
      globalDiscovery: {
        select: ['apps.*'],
        ignore: ['apps.v1.ReplicaSet']
      }
    }
  );

  // ============================================
  // EXAMPLE 6: Function-Based Selection
  // ============================================
  await runExample(
    'Example 6: Function Filter - Only Namespaced Resources',
    {
      globalDiscovery: {
        select: (resource) => {
          // Only include namespaced resources
          return resource.namespace !== null;
        }
      }
    }
  );

  // ============================================
  // EXAMPLE 7: Function-Based Ignore
  // ============================================
  await runExample(
    'Example 7: Function Filter - Ignore System Namespaces',
    {
      globalDiscovery: {
        select: null,
        ignore: (resource) => {
          // Ignore resources in kube-* namespaces
          return resource.namespace && resource.namespace.startsWith('kube-');
        }
      }
    }
  );

  // ============================================
  // EXAMPLE 8: Complex Function Filter
  // ============================================
  await runExample(
    'Example 8: Complex Filter - Production Workloads Only',
    {
      globalDiscovery: {
        select: (resource) => {
          // Only workload resources (Pods, Deployments, StatefulSets, DaemonSets, Jobs)
          const workloadTypes = [
            'core.v1.Pod',
            'apps.v1.Deployment',
            'apps.v1.StatefulSet',
            'apps.v1.DaemonSet',
            'batch.v1.Job',
            'batch.v1.CronJob'
          ];

          if (!workloadTypes.includes(resource.resourceType)) {
            return false;
          }

          // Only resources with 'production' label
          const labels = resource.labels || {};
          return labels.env === 'production' || labels.environment === 'production';
        }
      }
    }
  );

  // ============================================
  // EXAMPLE 9: Namespace Filtering (Cluster-Level)
  // ============================================
  await runExample(
    'Example 9: Namespace Filtering - Only Default and Kube-System',
    {
      clusterDiscovery: {
        namespaces: ['default', 'kube-system'],
      }
    }
  );

  // ============================================
  // EXAMPLE 10: Exclude Namespaces
  // ============================================
  await runExample(
    'Example 10: Namespace Filtering - Exclude System Namespaces',
    {
      clusterDiscovery: {
        namespaces: null, // All namespaces
        excludeNamespaces: ['kube-system', 'kube-public', 'kube-node-lease'],
      }
    }
  );

  // ============================================
  // EXAMPLE 11: Wildcard with Kind
  // ============================================
  await runExample(
    'Example 11: Wildcard - All Deployments Across API Groups',
    {
      globalDiscovery: {
        select: ['*.Deployment']
      }
    }
  );

  // ============================================
  // EXAMPLE 12: Combining All Filter Types
  // ============================================
  await runExample(
    'Example 12: Combined Filters - Production Workloads, No System Namespaces',
    {
      clusterDiscovery: {
        namespaces: null,
        excludeNamespaces: ['kube-system', 'kube-public', 'kube-node-lease'],
      },
      globalDiscovery: {
        select: ['core.v1.Pod', 'apps.*', 'batch.*'],
        ignore: [
          'apps.v1.ReplicaSet',      // Managed by Deployments
          'apps.v1.ControllerRevision' // Managed by StatefulSets
        ]
      }
    }
  );

  // ============================================
  // EXAMPLE 13: CRDs Only
  // ============================================
  await runExample(
    'Example 13: Custom Resources Only (CRDs)',
    {
      clusterDiscovery: {
        coreResources: false,
        appsResources: false,
        batchResources: false,
        networkingResources: false,
        storageResources: false,
        rbacResources: false,
        includeCRDs: true,
      }
    }
  );

  // ============================================
  // EXAMPLE 14: Monitoring Resources Only
  // ============================================
  await runExample(
    'Example 14: Monitoring Stack Resources (Prometheus, Grafana)',
    {
      globalDiscovery: {
        select: (resource) => {
          // Select Prometheus and Grafana CRDs
          const monitoringGroups = [
            'monitoring.coreos.com',
            'grafana.integreatly.org'
          ];

          const [group] = resource.resourceType.split('.');
          return monitoringGroups.includes(group);
        }
      }
    }
  );

  // ============================================
  // EXAMPLE 15: Dry Run Mode
  // ============================================
  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n📋 Example 15: Dry Run Mode (Preview Without Persisting)\n`);
  console.log(`${'='.repeat(80)}\n`);

  const db = new Database({
    connectionString: 'memory://k8s-dry-run/databases/k8s-demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [{ id: 'local', name: 'Local' }],
    discovery: {
      runOnInstall: true,
      dryRun: true, // Preview mode
      select: ['apps.*']
    },
    logger: (level, message) => {
      console.log(`[${level.toUpperCase()}] ${message}`);
    },
    verbose: true,
  });

  await db.usePlugin(plugin);
  await db.connect();

  await new Promise(resolve => setTimeout(resolve, 5000));

  const snapshots = await plugin.getSnapshots({ clusterId: 'local' });
  console.log(`\n✅ Dry run completed. Resources discovered (but not persisted): ${snapshots.length}\n`);

  await db.disconnect();

  console.log('\n\n✅ All filtering examples completed!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
