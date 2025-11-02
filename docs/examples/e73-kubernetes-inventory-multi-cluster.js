/**
 * Example 73: Kubernetes Inventory Plugin - Multi-Cluster with Scheduling
 *
 * This example demonstrates:
 * - Managing multiple Kubernetes clusters
 * - Different authentication methods per cluster
 * - Scheduled automatic discovery
 * - Comparing resources across clusters
 *
 * Prerequisites:
 * - Access to multiple Kubernetes clusters
 * - @kubernetes/client-node installed: pnpm add @kubernetes/client-node
 * - node-cron installed (for scheduling): pnpm add node-cron
 */

import { Database } from '../../src/database.class.js';
import { KubernetesInventoryPlugin } from '../../src/plugins/kubernetes-inventory.plugin.js';

async function main() {
  const db = new Database({
    connectionString: 'memory://k8s-multi-cluster/databases/k8s-demo'
  });

  console.log('📦 Initializing Multi-Cluster Kubernetes Inventory...\n');

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      // Cluster 1: Production (from kubeconfig file)
      {
        id: 'prod-vke',
        name: 'Production VKE Cluster',
        kubeconfig: '~/.kube/config-prod',

        discovery: {
          includeSecrets: false,
          includeCRDs: true,
          namespaces: null, // All namespaces
        },

        // Schedule: Every 6 hours
        scheduled: {
          enabled: true,
          cron: '0 */6 * * *',
          timezone: 'UTC',
          runOnStart: false, // Don't run immediately
        },

        tags: { env: 'production', region: 'us-east' },
        metadata: { cost_center: 'infra', team: 'platform' }
      },

      // Cluster 2: Staging (from kubeconfig context)
      {
        id: 'staging',
        name: 'Staging Cluster',
        context: 'staging-context', // Use specific context from default kubeconfig

        discovery: {
          includeSecrets: false,
          includeCRDs: true,
        },

        // Schedule: Every 12 hours
        scheduled: {
          enabled: true,
          cron: '0 */12 * * *',
          timezone: 'UTC',
          runOnStart: false,
        },

        tags: { env: 'staging', region: 'us-west' },
      },

      // Cluster 3: Development (in-cluster service account)
      {
        id: 'dev-local',
        name: 'Development Local',
        inCluster: true, // Use service account (when running inside K8s)

        discovery: {
          includeSecrets: false,
          includeCRDs: true,
          // Only specific namespaces
          namespaces: ['default', 'development'],
        },

        // Schedule: Every hour
        scheduled: {
          enabled: true,
          cron: '0 * * * *',
          timezone: 'UTC',
          runOnStart: true, // Run immediately on start
        },

        tags: { env: 'development', region: 'local' },
      },

      // Cluster 4: Manual configuration
      {
        id: 'external',
        name: 'External Cluster',
        connection: {
          server: 'https://k8s.example.com:6443',
          token: process.env.K8S_EXTERNAL_TOKEN,
          caData: process.env.K8S_EXTERNAL_CA, // Base64-encoded CA cert
        },

        discovery: {
          includeSecrets: false,
          includeCRDs: false, // Skip CRDs for this cluster
        },

        // No schedule - manual sync only
        scheduled: {
          enabled: false,
        },

        tags: { env: 'external', provider: 'third-party' },
      }
    ],

    discovery: {
      concurrency: 2,       // Sync max 2 clusters in parallel
      runOnInstall: true,   // Initial discovery
      dryRun: false,
    },

    // Distributed locking (prevent concurrent syncs)
    lock: {
      ttl: 600,    // 10 minutes
      timeout: 0,  // Don't wait for lock
    },

    logger: (level, message, meta) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}]`, message, meta);
    },
    verbose: true,
  });

  await db.usePlugin(plugin);
  await db.connect();

  console.log('✅ Plugin installed with 4 clusters!\n');
  console.log('🕐 Scheduled jobs active:\n');
  console.log('  - prod-vke: Every 6 hours');
  console.log('  - staging: Every 12 hours');
  console.log('  - dev-local: Every hour (runs on start)');
  console.log('  - external: Manual sync only\n');

  // Wait for initial discovery
  await new Promise(resolve => setTimeout(resolve, 10000));

  // ============================================
  // COMPARE RESOURCES ACROSS CLUSTERS
  // ============================================
  console.log('\n📊 Comparing Resources Across Clusters...\n');

  for (const clusterId of ['prod-vke', 'staging', 'dev-local']) {
    const pods = await plugin.getSnapshots({
      clusterId,
      resourceType: 'core.v1.Pod'
    });

    const deployments = await plugin.getSnapshots({
      clusterId,
      resourceType: 'apps.v1.Deployment'
    });

    const services = await plugin.getSnapshots({
      clusterId,
      resourceType: 'core.v1.Service'
    });

    console.log(`Cluster: ${clusterId}`);
    console.log(`  Pods: ${pods.length}`);
    console.log(`  Deployments: ${deployments.length}`);
    console.log(`  Services: ${services.length}\n`);
  }

  // ============================================
  // FIND RESOURCES BY TAG
  // ============================================
  console.log('\n🏷️  Finding Production Resources...\n');

  const snapshotsResource = db.getResource(plugin.resourceNames.snapshots);
  const allSnapshots = await snapshotsResource.list();

  const prodResources = allSnapshots.filter(snapshot => {
    // Snapshots inherit tags from cluster definition
    return snapshot.clusterId === 'prod-vke';
  });

  console.log(`Found ${prodResources.length} resources in production cluster`);

  // ============================================
  // MANUAL SYNC SPECIFIC CLUSTER
  // ============================================
  console.log('\n🔄 Manual Sync of External Cluster...\n');

  try {
    const syncResult = await plugin.syncCluster('external');
    console.log('External cluster sync result:', syncResult);
  } catch (error) {
    console.log('External cluster sync failed (expected if not configured):', error.message);
  }

  // ============================================
  // SYNC ALL CLUSTERS MANUALLY
  // ============================================
  console.log('\n🔄 Syncing All Clusters...\n');

  const syncAllResult = await plugin.syncAll();
  console.log('Sync all results:');
  syncAllResult.forEach(result => {
    console.log(`  ${result.clusterId}:`, {
      success: result.success || false,
      total: result.total || 0,
      created: result.created || 0,
      updated: result.updated || 0,
      unchanged: result.unchanged || 0
    });
  });

  // ============================================
  // CLUSTER STATUS DASHBOARD
  // ============================================
  console.log('\n📋 Cluster Status Dashboard...\n');

  const clustersResource = db.getResource(plugin.resourceNames.clusters);
  const clusters = await clustersResource.list();

  clusters.forEach(cluster => {
    console.log(`\n${cluster.name} (${cluster.id}):`);
    console.log(`  Status: ${cluster.status}`);
    console.log(`  Last Run: ${cluster.lastRunAt || 'Never'}`);
    console.log(`  Tags:`, cluster.tags);

    if (cluster.lastResult) {
      console.log(`  Last Result:`, {
        success: cluster.lastResult.success,
        duration: `${cluster.lastResult.duration}ms`,
        counters: cluster.lastResult.counters
      });
    }

    if (cluster.schedule?.enabled) {
      console.log(`  Schedule: ${cluster.schedule.cron} (${cluster.schedule.timezone})`);
    } else {
      console.log(`  Schedule: Manual only`);
    }
  });

  // ============================================
  // CROSS-CLUSTER CHANGE DETECTION
  // ============================================
  console.log('\n\n🔍 Cross-Cluster Change Detection...\n');

  const changesResource = db.getResource(plugin.resourceNames.changes);
  const allChanges = await changesResource.list();

  // Group changes by cluster
  const changesByCluster = {};
  allChanges.forEach(change => {
    if (!changesByCluster[change.clusterId]) {
      changesByCluster[change.clusterId] = [];
    }
    changesByCluster[change.clusterId].push(change);
  });

  console.log('Changes detected per cluster:');
  Object.entries(changesByCluster).forEach(([clusterId, changes]) => {
    console.log(`  ${clusterId}: ${changes.length} change(s)`);
  });

  // Keep running to see scheduled jobs (comment out in production)
  console.log('\n\n⏰ Scheduled jobs are now active. Press Ctrl+C to exit.\n');
  console.log('Waiting for next scheduled run...\n');

  // Wait indefinitely (in real usage, this would be your application loop)
  // await new Promise(() => {}); // Uncomment to keep running

  // Cleanup (for demo purposes)
  await db.disconnect();
  console.log('\n✅ Example completed!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
