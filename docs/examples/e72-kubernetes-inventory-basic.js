/**
 * Example 72: Kubernetes Inventory Plugin - Basic Usage
 *
 * This example demonstrates:
 * - Connecting to a Kubernetes cluster
 * - Discovering all resources (core + CRDs)
 * - Querying snapshots, versions, and changes
 * - Basic inventory operations
 *
 * Prerequisites:
 * - Access to a Kubernetes cluster
 * - Valid kubeconfig file
 * - @kubernetes/client-node installed: pnpm add @kubernetes/client-node
 */

import { Database } from '../../src/database.class.js';
import { KubernetesInventoryPlugin } from '../../src/plugins/kubernetes-inventory.plugin.js';

async function main() {
  // Create database with MemoryClient (for demo purposes)
  const db = new Database({
    connectionString: 'memory://k8s-inventory-demo/databases/k8s-demo'
  });

  console.log('📦 Initializing Kubernetes Inventory Plugin...\n');

  // Create and configure the plugin
  const plugin = new KubernetesInventoryPlugin({
    // Define cluster(s) to inventory
    clusters: [
      {
        id: 'local',
        name: 'Local Kubernetes Cluster',

        // Authentication: Multiple options available
        // See e75-kubernetes-inventory-config-methods.js for all methods

        // Option 1: Direct file path
        // kubeconfig: '~/.kube/config',

        // Option 2: Environment variable (auto-detected)
        // Set: export KUBECONFIG_LOCAL=/path/to/kubeconfig
        // OR:  export KUBECONFIG_CONTENT_LOCAL=$(cat kubeconfig | base64)

        // Option 3: Use specific context
        // context: 'minikube',

        // Option 4: In-cluster service account
        // inCluster: true,

        // Option 5: Manual connection
        // connection: {
        //   server: 'https://k8s.example.com:6443',
        //   token: process.env.K8S_TOKEN,
        //   caData: process.env.K8S_CA_CERT,
        // },

        // If none specified, uses default (~/.kube/config or KUBECONFIG env var)

        // Discovery options
        discovery: {
          includeSecrets: false,        // Don't include Secret data (security)
          includeConfigMaps: true,      // Include ConfigMaps
          includeCRDs: true,            // Auto-discover Custom Resources
          crdCacheTTL: 300000,         // Cache CRDs for 5 minutes

          // Uncomment to filter by namespaces:
          // namespaces: ['default', 'kube-system'],
          // excludeNamespaces: ['kube-public', 'kube-node-lease'],

          // Resource type toggles
          coreResources: true,
          appsResources: true,
          batchResources: true,
          networkingResources: true,
          storageResources: true,
          rbacResources: true,
        },

        // Optional metadata
        tags: { env: 'local', team: 'demo' },
        metadata: { location: 'local', purpose: 'development' }
      }
    ],

    // Global discovery options
    discovery: {
      runOnInstall: true,   // Auto-discover on plugin install
      concurrency: 2,       // Max clusters in parallel
      dryRun: false,        // Set to true to preview without persisting

      // Optional: Filter resources globally
      // select: ['core.*', 'apps.*'],  // Only core and apps API groups
      // ignore: ['*.Event', '*.Lease'], // Ignore Events and Leases
    },

    // Logging
    logger: (level, message, meta) => {
      console.log(`[${level.toUpperCase()}]`, message, meta);
    },
    verbose: true,
  });

  // Install plugin
  await db.usePlugin(plugin);
  await db.connect();

  console.log('\n✅ Plugin installed and cluster discovery started!\n');

  // Wait a moment for discovery to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  // ============================================
  // QUERY SNAPSHOTS (Latest state of resources)
  // ============================================
  console.log('\n📊 Querying Resource Snapshots...\n');

  // Get all Pods
  const pods = await plugin.getSnapshots({
    clusterId: 'local',
    resourceType: 'core.v1.Pod'
  });
  console.log(`Found ${pods.length} Pods`);
  if (pods.length > 0) {
    console.log('Sample Pod:', {
      name: pods[0].name,
      namespace: pods[0].namespace,
      version: pods[0].latestVersion,
      changes: pods[0].changelogSize
    });
  }

  // Get all Deployments
  const deployments = await plugin.getSnapshots({
    clusterId: 'local',
    resourceType: 'apps.v1.Deployment'
  });
  console.log(`\nFound ${deployments.length} Deployments`);

  // Get resources in specific namespace
  const defaultNamespaceResources = await plugin.getSnapshots({
    clusterId: 'local',
    namespace: 'default'
  });
  console.log(`\nFound ${defaultNamespaceResources.length} resources in 'default' namespace`);

  // ============================================
  // DISCOVER AVAILABLE RESOURCE TYPES
  // ============================================
  console.log('\n🔍 Discovering Available Resource Types...\n');

  const resourceTypes = await plugin.discoverResourceTypes('local');
  console.log(`Total resource types discovered: ${resourceTypes.length}`);

  // Show core resources
  const coreTypes = resourceTypes.filter(rt => rt.group === '');
  console.log(`\nCore resources (${coreTypes.length}):`);
  coreTypes.slice(0, 5).forEach(rt => {
    console.log(`  - ${rt.kind} (${rt.namespaced ? 'namespaced' : 'cluster-scoped'})`);
  });

  // Show CRDs
  const crds = resourceTypes.filter(rt => rt.isCRD);
  console.log(`\nCustom Resource Definitions (${crds.length}):`);
  crds.slice(0, 5).forEach(rt => {
    console.log(`  - ${rt.group}/${rt.version}/${rt.kind}`);
  });

  // ============================================
  // QUERY VERSION HISTORY
  // ============================================
  console.log('\n📜 Querying Version History...\n');

  if (deployments.length > 0) {
    const deployment = deployments[0];

    const versions = await plugin.getVersions({
      clusterId: 'local',
      resourceType: deployment.resourceType,
      resourceId: deployment.resourceId
    });

    console.log(`Deployment "${deployment.name}" has ${versions.length} version(s)`);
    versions.forEach(v => {
      console.log(`  Version ${v.version}: captured at ${v.capturedAt}`);
    });
  }

  // ============================================
  // QUERY CHANGES (Diffs)
  // ============================================
  console.log('\n🔄 Querying Resource Changes...\n');

  const changes = await plugin.getChanges({
    clusterId: 'local'
  });
  console.log(`Total changes detected: ${changes.length}`);

  if (changes.length > 0) {
    const change = changes[0];
    console.log('\nSample change:');
    console.log(`  Resource: ${change.resourceType}/${change.resourceId}`);
    console.log(`  Versions: ${change.fromVersion} → ${change.toVersion}`);
    console.log(`  Diff:`, {
      added: Object.keys(change.diff.added || {}).length,
      removed: Object.keys(change.diff.removed || {}).length,
      updated: Object.keys(change.diff.updated || {}).length
    });
  }

  // ============================================
  // MANUAL SYNC (Re-discover cluster)
  // ============================================
  console.log('\n🔄 Manual Cluster Sync...\n');

  const syncResult = await plugin.syncCluster('local');
  console.log('Sync result:', syncResult);

  // ============================================
  // CLUSTER SUMMARY
  // ============================================
  console.log('\n📋 Cluster Summary...\n');

  const clusterResource = db.getResource(plugin.resourceNames.clusters);
  const clusterSummary = await clusterResource.get('local');

  console.log('Cluster Status:', clusterSummary.status);
  console.log('Last Run:', clusterSummary.lastRunAt);
  console.log('Last Result:', clusterSummary.lastResult);

  // Cleanup
  await db.disconnect();
  console.log('\n✅ Example completed!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
