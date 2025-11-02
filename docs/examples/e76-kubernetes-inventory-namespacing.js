/**
 * Example 76: Kubernetes Inventory Plugin - Resource Naming & Multi-Cluster Isolation
 *
 * This example demonstrates:
 * - Custom resource names (externalization)
 * - Plugin namespace support
 * - Multi-cluster data isolation via clusterId
 * - Querying data from specific clusters
 *
 * Prerequisites:
 * - @kubernetes/client-node installed: pnpm add @kubernetes/client-node
 */

import { Database } from '../../src/database.class.js';
import { KubernetesInventoryPlugin } from '../../src/plugins/kubernetes-inventory.plugin.js';

console.log('🔧 Kubernetes Inventory Plugin - Resource Naming & Multi-Cluster Isolation\n');
console.log('=' .repeat(80) + '\n');

async function demonstrateDefaultResourceNames() {
  console.log('📋 PART 1: Default Resource Names\n');
  console.log('=' .repeat(80) + '\n');

  const db = new Database({
    connectionString: 'memory://k8s-default-names/databases/demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      { id: 'cluster1', name: 'Cluster 1' },
      { id: 'cluster2', name: 'Cluster 2' }
    ],
    discovery: { runOnInstall: false }
  });

  await db.usePlugin(plugin);
  await db.connect();

  console.log('Default internal resource names:');
  console.log('  Snapshots:', plugin.resourceNames.snapshots);
  console.log('  Versions:', plugin.resourceNames.versions);
  console.log('  Changes:', plugin.resourceNames.changes);
  console.log('  Clusters:', plugin.resourceNames.clusters);

  console.log('\n✅ Resources created with default names:\n');

  const resources = await db.listResources();
  resources.forEach(r => {
    if (r.createdBy === 'KubernetesInventoryPlugin') {
      console.log(`  - ${r.name}`);
    }
  });

  await db.disconnect();
  console.log('\n');
}

async function demonstrateCustomResourceNames() {
  console.log('📋 PART 2: Custom Resource Names (Externalization)\n');
  console.log('=' .repeat(80) + '\n');

  const db = new Database({
    connectionString: 'memory://k8s-custom-names/databases/demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      { id: 'prod', name: 'Production' }
    ],

    // 🎯 CUSTOM RESOURCE NAMES
    resourceNames: {
      snapshots: 'k8s_prod_snapshots',      // Custom name
      versions: 'k8s_prod_versions',        // Custom name
      changes: 'k8s_prod_changes',          // Custom name
      clusters: 'k8s_prod_clusters'         // Custom name
    },

    discovery: { runOnInstall: false }
  });

  await db.usePlugin(plugin);
  await db.connect();

  console.log('Custom internal resource names:');
  console.log('  Snapshots:', plugin.resourceNames.snapshots);
  console.log('  Versions:', plugin.resourceNames.versions);
  console.log('  Changes:', plugin.resourceNames.changes);
  console.log('  Clusters:', plugin.resourceNames.clusters);

  console.log('\n✅ Resources created with custom names:\n');

  const resources = await db.listResources();
  resources.forEach(r => {
    if (r.createdBy === 'KubernetesInventoryPlugin') {
      console.log(`  - ${r.name}`);
    }
  });

  console.log('\n💡 Use case: Multiple plugin instances with different names\n');

  await db.disconnect();
  console.log('\n');
}

async function demonstrateNamespaceSupport() {
  console.log('📋 PART 3: Plugin Namespace Support\n');
  console.log('=' .repeat(80) + '\n');

  const db = new Database({
    connectionString: 'memory://k8s-namespace/databases/demo'
  });

  // Plugin instance 1: Production environment
  const prodPlugin = new KubernetesInventoryPlugin({
    clusters: [{ id: 'prod', name: 'Production' }],
    resourceNames: {
      snapshots: 'prod_k8s_snapshots',
      versions: 'prod_k8s_versions',
      changes: 'prod_k8s_changes',
      clusters: 'prod_k8s_clusters'
    },
    discovery: { runOnInstall: false }
  });

  // Plugin instance 2: Staging environment
  const stagingPlugin = new KubernetesInventoryPlugin({
    clusters: [{ id: 'staging', name: 'Staging' }],
    resourceNames: {
      snapshots: 'staging_k8s_snapshots',
      versions: 'staging_k8s_versions',
      changes: 'staging_k8s_changes',
      clusters: 'staging_k8s_clusters'
    },
    discovery: { runOnInstall: false }
  });

  // Install both plugins in the same database
  await db.usePlugin(prodPlugin);
  await db.usePlugin(stagingPlugin);
  await db.connect();

  console.log('Production Plugin Resources:');
  console.log('  Snapshots:', prodPlugin.resourceNames.snapshots);
  console.log('  Versions:', prodPlugin.resourceNames.versions);
  console.log('  Changes:', prodPlugin.resourceNames.changes);
  console.log('  Clusters:', prodPlugin.resourceNames.clusters);

  console.log('\nStaging Plugin Resources:');
  console.log('  Snapshots:', stagingPlugin.resourceNames.snapshots);
  console.log('  Versions:', stagingPlugin.resourceNames.versions);
  console.log('  Changes:', stagingPlugin.resourceNames.changes);
  console.log('  Clusters:', stagingPlugin.resourceNames.clusters);

  console.log('\n✅ All resources created (isolated by namespace):\n');

  const resources = await db.listResources();
  resources.forEach(r => {
    if (r.createdBy === 'KubernetesInventoryPlugin') {
      console.log(`  - ${r.name}`);
    }
  });

  console.log('\n💡 Two separate plugin instances, completely isolated!\n');

  await db.disconnect();
  console.log('\n');
}

async function demonstrateMultiClusterIsolation() {
  console.log('📋 PART 4: Multi-Cluster Data Isolation via clusterId\n');
  console.log('=' .repeat(80) + '\n');

  const db = new Database({
    connectionString: 'memory://k8s-multi-cluster/databases/demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      { id: 'aws-eks', name: 'AWS EKS Production', tags: { provider: 'aws' } },
      { id: 'gcp-gke', name: 'GCP GKE Staging', tags: { provider: 'gcp' } },
      { id: 'azure-aks', name: 'Azure AKS Dev', tags: { provider: 'azure' } }
    ],
    discovery: { runOnInstall: false }
  });

  await db.usePlugin(plugin);
  await db.connect();

  // Simulate some data for different clusters
  const snapshotsResource = db.getResource(plugin.resourceNames.snapshots);
  const versionsResource = db.getResource(plugin.resourceNames.versions);
  const changesResource = db.getResource(plugin.resourceNames.changes);
  const clustersResource = db.getResource(plugin.resourceNames.clusters);

  console.log('💾 Simulating data for 3 clusters...\n');

  // Create cluster records
  await clustersResource.insert({
    id: 'aws-eks',
    name: 'AWS EKS Production',
    status: 'idle',
    tags: { provider: 'aws' }
  });

  await clustersResource.insert({
    id: 'gcp-gke',
    name: 'GCP GKE Staging',
    status: 'idle',
    tags: { provider: 'gcp' }
  });

  await clustersResource.insert({
    id: 'azure-aks',
    name: 'Azure AKS Dev',
    status: 'idle',
    tags: { provider: 'azure' }
  });

  // AWS EKS - 5 snapshots
  for (let i = 1; i <= 5; i++) {
    await snapshotsResource.insert({
      id: `aws-eks::core.v1.Pod::default::pod-${i}`,
      clusterId: 'aws-eks',        // 🎯 CLUSTER ID
      namespace: 'default',
      resourceType: 'core.v1.Pod',
      resourceId: `pod-${i}`,
      name: `pod-${i}`,
      apiVersion: 'v1',
      kind: 'Pod',
      labels: {},
      annotations: {},
      latestDigest: `digest-${i}`,
      latestVersion: 1,
      changelogSize: 0,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // GCP GKE - 3 snapshots
  for (let i = 1; i <= 3; i++) {
    await snapshotsResource.insert({
      id: `gcp-gke::apps.v1.Deployment::production::deploy-${i}`,
      clusterId: 'gcp-gke',        // 🎯 CLUSTER ID
      namespace: 'production',
      resourceType: 'apps.v1.Deployment',
      resourceId: `deploy-${i}`,
      name: `deploy-${i}`,
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      labels: {},
      annotations: {},
      latestDigest: `digest-${i}`,
      latestVersion: 1,
      changelogSize: 0,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Azure AKS - 2 snapshots
  for (let i = 1; i <= 2; i++) {
    await snapshotsResource.insert({
      id: `azure-aks::core.v1.Service::kube-system::svc-${i}`,
      clusterId: 'azure-aks',      // 🎯 CLUSTER ID
      namespace: 'kube-system',
      resourceType: 'core.v1.Service',
      resourceId: `svc-${i}`,
      name: `svc-${i}`,
      apiVersion: 'v1',
      kind: 'Service',
      labels: {},
      annotations: {},
      latestDigest: `digest-${i}`,
      latestVersion: 1,
      changelogSize: 0,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  console.log('✅ Data created for all clusters\n');

  // ============================================
  // QUERY BY CLUSTER ID
  // ============================================
  console.log('🔍 Querying data by clusterId:\n');

  // Query AWS EKS only
  const awsSnapshots = await plugin.getSnapshots({ clusterId: 'aws-eks' });
  console.log(`AWS EKS snapshots: ${awsSnapshots.length}`);
  awsSnapshots.forEach(s => {
    console.log(`  - ${s.clusterId} → ${s.resourceType}/${s.resourceId}`);
  });

  // Query GCP GKE only
  const gcpSnapshots = await plugin.getSnapshots({ clusterId: 'gcp-gke' });
  console.log(`\nGCP GKE snapshots: ${gcpSnapshots.length}`);
  gcpSnapshots.forEach(s => {
    console.log(`  - ${s.clusterId} → ${s.resourceType}/${s.resourceId}`);
  });

  // Query Azure AKS only
  const azureSnapshots = await plugin.getSnapshots({ clusterId: 'azure-aks' });
  console.log(`\nAzure AKS snapshots: ${azureSnapshots.length}`);
  azureSnapshots.forEach(s => {
    console.log(`  - ${s.clusterId} → ${s.resourceType}/${s.resourceId}`);
  });

  // ============================================
  // QUERY BY CLUSTER ID + RESOURCE TYPE
  // ============================================
  console.log('\n\n🔍 Querying by clusterId + resourceType:\n');

  const awsPods = await plugin.getSnapshots({
    clusterId: 'aws-eks',
    resourceType: 'core.v1.Pod'
  });
  console.log(`AWS EKS Pods: ${awsPods.length}`);

  const gcpDeployments = await plugin.getSnapshots({
    clusterId: 'gcp-gke',
    resourceType: 'apps.v1.Deployment'
  });
  console.log(`GCP GKE Deployments: ${gcpDeployments.length}`);

  // ============================================
  // QUERY ALL CLUSTERS
  // ============================================
  console.log('\n\n🔍 Querying all clusters:\n');

  const allSnapshots = await plugin.getSnapshots({});
  console.log(`Total snapshots across all clusters: ${allSnapshots.length}`);

  // Group by cluster
  const byCluster = allSnapshots.reduce((acc, snapshot) => {
    if (!acc[snapshot.clusterId]) acc[snapshot.clusterId] = 0;
    acc[snapshot.clusterId]++;
    return acc;
  }, {});

  console.log('\nBreakdown by cluster:');
  Object.entries(byCluster).forEach(([clusterId, count]) => {
    console.log(`  ${clusterId}: ${count} resources`);
  });

  // ============================================
  // PARTITIONS FOR EFFICIENT QUERIES
  // ============================================
  console.log('\n\n📊 Partition-based queries (O(1) performance):\n');

  // Query using partition
  const awsPartition = await snapshotsResource.listPartition('byClusterId', { clusterId: 'aws-eks' });
  console.log(`AWS EKS (via partition): ${awsPartition.length} resources`);

  const gcpPartition = await snapshotsResource.listPartition('byClusterId', { clusterId: 'gcp-gke' });
  console.log(`GCP GKE (via partition): ${gcpPartition.length} resources`);

  const azurePartition = await snapshotsResource.listPartition('byClusterId', { clusterId: 'azure-aks' });
  console.log(`Azure AKS (via partition): ${azurePartition.length} resources`);

  console.log('\n💡 Partitions enable O(1) queries instead of O(n) scans!\n');

  // ============================================
  // CLUSTER SUMMARY
  // ============================================
  console.log('\n📋 Cluster Summary:\n');

  const clusters = await clustersResource.list();
  clusters.forEach(cluster => {
    console.log(`\nCluster: ${cluster.name} (${cluster.id})`);
    console.log(`  Status: ${cluster.status}`);
    console.log(`  Tags:`, cluster.tags);
  });

  await db.disconnect();
  console.log('\n');
}

async function main() {
  await demonstrateDefaultResourceNames();
  await demonstrateCustomResourceNames();
  await demonstrateNamespaceSupport();
  await demonstrateMultiClusterIsolation();

  console.log('=' .repeat(80));
  console.log('\n📝 Key Takeaways:\n');
  console.log('=' .repeat(80) + '\n');

  console.log('1️⃣  Resource Names are Externalized');
  console.log('   - Use resourceNames option to customize');
  console.log('   - Default: plg_k8s_inventory_*');
  console.log('   - Custom: any name you want\n');

  console.log('2️⃣  Multiple Plugin Instances Supported');
  console.log('   - Use different resourceNames for each instance');
  console.log('   - Complete data isolation');
  console.log('   - Example: prod vs staging inventories\n');

  console.log('3️⃣  Multi-Cluster Data Isolation');
  console.log('   - Every resource has clusterId field (required)');
  console.log('   - Query by clusterId for isolation');
  console.log('   - Partitions optimize clusterId queries (O(1))\n');

  console.log('4️⃣  Partition Strategy');
  console.log('   - byClusterId: Fast cluster filtering');
  console.log('   - byResourceType: Fast resource type filtering');
  console.log('   - byClusterAndType: Combined filtering');
  console.log('   - byNamespace: Namespace filtering\n');

  console.log('✅ All examples completed!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
