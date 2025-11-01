/**
 * Example 50: ReconPlugin - Uptime Monitoring
 *
 * Demonstrates the uptime behavior for monitoring target availability:
 * - Periodic health checks (ping, HTTP, DNS)
 * - Uptime percentage calculation
 * - Downtime detection and alerting
 * - Historical tracking
 */

import { Database } from '../../src/database.class.js';
import { ReconPlugin } from '../../src/plugins/recon/index.js';

(async () => {
  console.log('='.repeat(80));
  console.log('Example 50: ReconPlugin - Uptime Monitoring');
  console.log('='.repeat(80));

  // Initialize database
  const db = new Database({
    bucketName: 'recon-uptime-demo',
    region: 'us-east-1',
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/recon-uptime-demo'
  });

  await db.connect();

  // Initialize ReconPlugin with uptime behavior enabled
  const plugin = new ReconPlugin({
    behaviors: {
      uptime: {
        enabled: true,
        interval: 10000, // Check every 10 seconds (demo purposes)
        methods: ['ping', 'http', 'dns'], // All check methods
        alertOnDowntime: true,
        downtimeThreshold: 3, // 3 failed checks = downtime
        timeout: 5000, // 5 seconds timeout
        retainHistory: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    }
  });

  await db.use(plugin);

  // Listen for uptime transition events
  plugin.on('uptime:transition', (transition) => {
    console.log('\n🔔 Uptime Transition Detected:');
    console.log(`   Host: ${transition.host}`);
    console.log(`   Status: ${transition.from} → ${transition.to}`);
    console.log(`   Timestamp: ${transition.timestamp}`);
    console.log(`   Check Results:`, JSON.stringify(transition.checkResults, null, 2));
  });

  console.log('\n📊 Starting uptime monitoring for multiple targets...\n');

  // Start monitoring multiple targets
  const targets = [
    'google.com',
    'github.com',
    'cloudflare.com',
    'example.com'
  ];

  for (const target of targets) {
    console.log(`🎯 Starting monitoring: ${target}`);
    const status = await plugin.startUptimeMonitoring(target);
    console.log(`   Initial status:`, JSON.stringify(status, null, 2));
  }

  // Wait 30 seconds to collect some data
  console.log('\n⏳ Collecting uptime data for 30 seconds...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Get uptime statuses
  console.log('\n📈 Current Uptime Statuses:');
  console.log('='.repeat(80));

  const allStatuses = plugin.getAllUptimeStatuses();
  for (const status of allStatuses) {
    console.log(`\n${status.host}:`);
    console.log(`  Status: ${status.status} ${status.isDown ? '🔴' : '🟢'}`);
    console.log(`  Uptime: ${status.uptimePercentage}%`);
    console.log(`  Total Checks: ${status.totalChecks}`);
    console.log(`  Successful: ${status.successfulChecks}`);
    console.log(`  Failed: ${status.failedChecks}`);
    console.log(`  Consecutive Fails: ${status.consecutiveFails}`);
    console.log(`  Last Check: ${status.lastCheck}`);
    console.log(`  Last Up: ${status.lastUp}`);
    console.log(`  Last Down: ${status.lastDown || 'Never'}`);

    // Show recent history
    console.log(`  Recent History (last ${status.recentHistory.length} checks):`);
    for (const entry of status.recentHistory) {
      const statusIcon = entry.status === 'up' ? '✅' : '❌';
      console.log(`    ${statusIcon} ${entry.timestamp} - ${entry.status}`);

      // Show method results
      for (const [method, result] of Object.entries(entry.methods)) {
        const methodIcon = result.status === 'ok' ? '✓' : '✗';
        console.log(`       ${methodIcon} ${method}: ${result.status} ${result.latency ? `(${result.latency}ms)` : ''}`);
      }
    }
  }

  // Get individual status
  console.log('\n📍 Detailed Status for google.com:');
  console.log('='.repeat(80));
  const googleStatus = plugin.getUptimeStatus('google.com');
  console.log(JSON.stringify(googleStatus, null, 2));

  // Load historical status from storage
  console.log('\n💾 Loading historical status from storage:');
  console.log('='.repeat(80));
  const historicalStatus = await plugin.loadUptimeStatus('google.com');
  if (historicalStatus) {
    console.log(JSON.stringify(historicalStatus, null, 2));
  } else {
    console.log('No historical data found');
  }

  // Stop monitoring for one target
  console.log('\n🛑 Stopping monitoring for example.com...');
  plugin.stopUptimeMonitoring('example.com');

  // Wait a bit and check statuses again
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n📊 Updated Statuses (after stopping example.com):');
  const updatedStatuses = plugin.getAllUptimeStatuses();
  console.log(`Active monitors: ${updatedStatuses.length}`);
  for (const status of updatedStatuses) {
    console.log(`  - ${status.host}: ${status.status} (${status.uptimePercentage}% uptime)`);
  }

  // Example: Simulate checking a target that might be down
  console.log('\n🧪 Testing with a non-existent domain:');
  try {
    await plugin.startUptimeMonitoring('this-domain-definitely-does-not-exist-12345.com');

    // Wait for a few checks
    await new Promise(resolve => setTimeout(resolve, 35000));

    const downStatus = plugin.getUptimeStatus('this-domain-definitely-does-not-exist-12345.com');
    console.log('\nStatus of non-existent domain:');
    console.log(`  Status: ${downStatus.status} ${downStatus.isDown ? '🔴 DOWN' : '🟢 UP'}`);
    console.log(`  Uptime: ${downStatus.uptimePercentage}%`);
    console.log(`  Consecutive Fails: ${downStatus.consecutiveFails}`);
  } catch (error) {
    console.error('Error testing non-existent domain:', error.message);
  }

  // Integration with scheduled scanning
  console.log('\n🔗 Integration with scheduled scanning:');
  console.log('='.repeat(80));

  // Add targets with scheduled scans
  await plugin.addTarget('github.com', '*/5 * * * *'); // Every 5 minutes
  await plugin.addTarget('cloudflare.com', '*/10 * * * *'); // Every 10 minutes

  // List targets
  const dynamicTargets = await plugin.listTargets();
  console.log('\nScheduled targets with uptime monitoring:');
  for (const target of dynamicTargets) {
    const uptimeStatus = plugin.getUptimeStatus(target.host);
    console.log(`\n  ${target.host}:`);
    console.log(`    Schedule: ${target.schedule}`);
    console.log(`    Scan Count: ${target.scanCount}`);
    console.log(`    Uptime: ${uptimeStatus?.uptimePercentage || 'N/A'}%`);
    console.log(`    Status: ${uptimeStatus?.status || 'unknown'}`);
  }

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await db.disconnect();

  console.log('\n✅ Example completed!');
  console.log('\n💡 Key takeaways:');
  console.log('   1. Enable uptime behavior in plugin config');
  console.log('   2. Start monitoring with startUptimeMonitoring(target)');
  console.log('   3. Get real-time status with getUptimeStatus(host)');
  console.log('   4. Listen for uptime:transition events for alerts');
  console.log('   5. Historical data is persisted to plugin storage');
  console.log('   6. Integrates seamlessly with scheduled scanning');
})();
