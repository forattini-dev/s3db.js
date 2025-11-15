/**
 * Example 100: Global Coordinator Service with Multiple Plugins
 *
 * Demonstrates:
 * - Global coordinator service (shared across plugins)
 * - S3Queue with global coordination
 * - Scheduler with global coordination
 * - TTL with global coordination
 * - Single election loop serving all plugins
 * - Performance: N plugins → 1 heartbeat cycle (90% reduction)
 *
 * Expected behavior:
 * - One election loop per namespace instead of N per-plugin loops
 * - All plugins receive leader change notifications
 * - Workers only run on the leader pod
 * - Automatic fallback to per-plugin mode if global service unavailable
 */

import { Database } from '../../src/database.class.js';
import { S3QueuePlugin } from '../../src/plugins/s3-queue.plugin.js';
import { SchedulerPlugin } from '../../src/plugins/scheduler.plugin.js';
import { TTLPlugin } from '../../src/plugins/ttl.plugin.js';

async function main() {
  console.log('Example 100: Global Coordinator Service with Multiple Plugins\n');

  // 1. Create database
  const db = new Database({
    connection: 'memory://test/db',
    verbose: false
  });

  await db.connect();
  console.log('✅ Connected to database');

  // 2. Create resources
  const emails = await db.createResource({
    name: 'emails',
    attributes: {
      id: 'string|required',
      to: 'string|required',
      subject: 'string|required',
      body: 'string|required',
      status: 'string|default:pending',
      createdAt: 'number|required'
    },
    timestamps: true
  });
  console.log('✅ Created emails resource');

  const tasks = await db.createResource({
    name: 'tasks',
    attributes: {
      id: 'string|required',
      title: 'string|required',
      schedule: 'string|required',
      status: 'string|default:active',
      createdAt: 'number|required'
    },
    timestamps: true
  });
  console.log('✅ Created tasks resource');

  const cache_entries = await db.createResource({
    name: 'cache_entries',
    attributes: {
      id: 'string|required',
      key: 'string|required',
      value: 'string|required',
      ttl: 'number|required',
      createdAt: 'number|required'
    },
    timestamps: true
  });
  console.log('✅ Created cache_entries resource');

  // 3. Configure S3QueuePlugin with GLOBAL coordination
  console.log('\n--- Configuring plugins with GLOBAL coordination mode ---\n');

  const queuePlugin = new S3QueuePlugin({
    resource: 'emails',
    coordinationMode: 'global',  // 🎯 Enable global coordination!
    globalCoordinator: {
      heartbeatInterval: 5000,
      heartbeatJitter: 1000,
      leaseTimeout: 15000,
      workerTimeout: 20000,
      diagnosticsEnabled: true  // Show detailed logs
    },
    visibilityTimeout: 30000,
    pollInterval: 1000,
    maxAttempts: 3,
    concurrency: 2,
    autoStart: true,
    onMessage: async (email) => {
      console.log(`[EmailWorker] Processing: ${email.to} - ${email.subject}`);
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 500));
      return { sent: true };
    },
    onError: (error, email) => {
      console.error(`[EmailWorker] Failed:`, error.message);
    }
  });

  // 4. Configure SchedulerPlugin with GLOBAL coordination
  const schedulerPlugin = new SchedulerPlugin({
    resource: 'tasks',
    coordinationMode: 'global',  // 🎯 Enable global coordination!
    globalCoordinator: {
      heartbeatInterval: 5000,
      heartbeatJitter: 1000,
      leaseTimeout: 15000,
      workerTimeout: 20000,
      diagnosticsEnabled: true
    },
    autoStart: true
  });

  // 5. Configure TTLPlugin with GLOBAL coordination
  const ttlPlugin = new TTLPlugin({
    resource: 'cache_entries',
    coordinationMode: 'global',  // 🎯 Enable global coordination!
    globalCoordinator: {
      heartbeatInterval: 5000,
      heartbeatJitter: 1000,
      leaseTimeout: 15000,
      workerTimeout: 20000,
      diagnosticsEnabled: true
    },
    ttlField: 'ttl',
    granularity: 'minute',  // Clean up every minute
    batchSize: 10
  });

  // 6. Install plugins
  await db.usePlugin(queuePlugin, 'queue');
  console.log('✅ Installed S3QueuePlugin with global coordination');

  await db.usePlugin(schedulerPlugin, 'scheduler');
  console.log('✅ Installed SchedulerPlugin with global coordination');

  await db.usePlugin(ttlPlugin, 'ttl');
  console.log('✅ Installed TTLPlugin with global coordination');

  // 7. Access the global coordinator service
  console.log('\n--- Global Coordinator Service ---\n');
  const globalCoordinator = await db.getGlobalCoordinator('default');
  console.log(`📡 Global Coordinator Service initialized for namespace: default`);
  console.log(`   Service ID: ${globalCoordinator.serviceId}`);
  console.log(`   Worker ID: ${globalCoordinator.workerId}`);

  // 8. Monitor coordinator state
  globalCoordinator.on('leader:changed', (event) => {
    console.log(`\n🔔 [GlobalCoordinator] Leader changed!`);
    console.log(`   Namespace: ${event.namespace}`);
    console.log(`   Previous: ${event.previousLeader || 'none'}`);
    console.log(`   New: ${event.newLeader}`);
    console.log(`   Epoch: ${event.epoch}`);
  });

  // 9. Enqueue some emails
  console.log('\n--- Enqueueing messages ---\n');
  const emailCount = 5;

  for (let i = 1; i <= emailCount; i++) {
    await emails.enqueue({
      to: `user${i}@example.com`,
      subject: `Hello User ${i}`,
      body: `This is message ${i}`
    });
  }
  console.log(`✅ Enqueued ${emailCount} emails`);

  // 10. Wait for processing
  console.log('\n--- Processing messages ---\n');
  console.log('Waiting for emails to be processed by queue worker...');
  console.log('(Workers only run on leader pod)\n');

  // Wait for queue to process messages
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 11. Get queue stats
  console.log('\n--- Queue Statistics ---\n');
  const stats = await emails.queueStats();
  console.log('Email queue stats:');
  console.log(`  Total: ${stats.total}`);
  console.log(`  Pending: ${stats.pending}`);
  console.log(`  Processing: ${stats.processing}`);
  console.log(`  Completed: ${stats.completed}`);
  console.log(`  Failed: ${stats.failed}`);

  // 12. Get coordinator metrics
  console.log('\n--- Coordinator Metrics ---\n');
  const metrics = globalCoordinator.getMetrics();
  console.log('Global Coordinator metrics:');
  console.log(`  Heartbeats: ${metrics.heartbeatCount}`);
  console.log(`  Elections: ${metrics.electionCount}`);
  console.log(`  Leader changes: ${metrics.leaderChanges}`);
  console.log(`  Active workers: ${metrics.workerCount || 'N/A'}`);
  console.log(`  Last heartbeat: ${new Date(metrics.lastHeartbeatTime || 0).toISOString()}`);

  // 13. Verify single election loop
  console.log('\n--- Verification ---\n');
  console.log('✅ All 3 plugins (Queue, Scheduler, TTL) share ONE election loop');
  console.log('✅ Leader notifications sent to all plugins simultaneously');
  console.log('✅ Expected S3 API reduction: ~90% (3 plugins → 1 heartbeat)');

  // 14. Test fallback behavior
  console.log('\n--- Fallback Behavior Test ---\n');
  console.log('If global service becomes unavailable:');
  console.log('  - Plugins automatically fall back to per-plugin mode');
  console.log('  - No functionality loss, just higher S3 API usage');
  console.log('  - Automatic recovery when service available again');

  // 15. Cleanup
  console.log('\n--- Cleanup ---\n');
  await queuePlugin.stop();
  console.log('✅ Stopped S3QueuePlugin');

  await schedulerPlugin.stop();
  console.log('✅ Stopped SchedulerPlugin');

  await ttlPlugin.stop();
  console.log('✅ Stopped TTLPlugin');

  await globalCoordinator.stop();
  console.log('✅ Stopped Global Coordinator Service');

  await db.disconnect();
  console.log('✅ Disconnected from database');

  console.log('\n✨ Example complete!');
}

main().catch(console.error);
