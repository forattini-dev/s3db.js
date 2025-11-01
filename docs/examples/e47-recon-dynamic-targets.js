/**
 * Example e47: Recon Plugin - Dynamic Target Management
 *
 * Demonstrates how to dynamically add/remove/update targets at runtime
 * without needing to restart the plugin or reconfigure it.
 */

import { S3db } from '#src/database.class.js';
import { ReconPlugin } from '#src/plugins/recon.plugin.js';

async function main() {
  const db = new S3db({
    connectionString: process.env.S3DB_CONNECTION_STRING || 'http://minioadmin:minioadmin@localhost:9000/s3db-examples'
  });

  await db.connect();
  console.log('✅ Connected to S3DB\n');

  // ========================================
  // Initialize plugin with NO targets
  // ========================================
  console.log('📦 Initializing ReconPlugin with zero targets...\n');

  const plugin = new ReconPlugin({
    behavior: 'passive',
    storage: { persist: true },
    resources: { persist: true },
    schedule: {
      enabled: true,
      cron: '*/5 * * * *', // every 5 minutes
      runOnStart: false
    },
    targets: [] // Start with ZERO targets
  });

  // Listen to events
  plugin.on('recon:target-added', ({ targetId, behavior }) => {
    console.log(`✅ Target added: ${targetId} (behavior: ${behavior})`);
  });

  plugin.on('recon:target-removed', ({ targetId }) => {
    console.log(`❌ Target removed: ${targetId}`);
  });

  plugin.on('recon:target-updated', ({ targetId, updates }) => {
    console.log(`🔄 Target updated: ${targetId}`, updates);
  });

  plugin.on('recon:sweep-started', ({ reason, targetCount, targets }) => {
    console.log(`🔄 Sweep started (${reason}): ${targetCount} targets - ${targets.join(', ')}`);
  });

  plugin.on('recon:completed', ({ target, status, scanCount }) => {
    console.log(`✅ Scan completed: ${target} (status: ${status}, count: ${scanCount})`);
  });

  plugin.on('recon:no-active-targets', ({ reason }) => {
    console.log(`⚠️  No active targets for sweep (${reason})`);
  });

  await db.installPlugin(plugin);
  await plugin.start();

  console.log('Plugin started with 0 targets\n');

  // ========================================
  // STEP 1: Add targets dynamically
  // ========================================
  console.log('📌 STEP 1: Adding targets dynamically\n');

  const target1 = await plugin.addTarget('example.com', {
    behavior: 'passive',
    enabled: true,
    metadata: { description: 'Main website' },
    tags: ['production', 'public']
  });
  console.log(`   Added: ${target1.id}`);

  const target2 = await plugin.addTarget('https://api.example.com', {
    behavior: 'stealth',
    enabled: true,
    features: {
      certificate: true,
      ports: { nmap: false }
    },
    tools: ['dns', 'certificate', 'ping'],
    metadata: { description: 'API endpoint' },
    tags: ['production', 'api']
  });
  console.log(`   Added: ${target2.id}`);

  const target3 = await plugin.addTarget('staging.example.com', {
    behavior: 'aggressive',
    enabled: false, // disabled for now
    metadata: { description: 'Staging environment' },
    tags: ['staging']
  });
  console.log(`   Added: ${target3.id} (disabled)\n`);

  // ========================================
  // STEP 2: List targets
  // ========================================
  console.log('📋 STEP 2: Listing all targets\n');

  const allTargets = await plugin.listTargets();
  console.log(`   Total targets: ${allTargets.length}`);
  for (const t of allTargets) {
    console.log(`   - ${t.id}: enabled=${t.enabled}, behavior=${t.behavior}, tags=${t.tags.join(',')}`);
  }
  console.log('');

  const enabledOnly = await plugin.listTargets({ includeDisabled: false });
  console.log(`   Enabled targets only: ${enabledOnly.length}`);
  for (const t of enabledOnly) {
    console.log(`   - ${t.id}`);
  }
  console.log('');

  // ========================================
  // STEP 3: Get specific target
  // ========================================
  console.log('🔍 STEP 3: Get specific target details\n');

  const target = await plugin.getTarget('example.com');
  console.log(`   Target: ${target.id}`);
  console.log(`   Original: ${target.target}`);
  console.log(`   Enabled: ${target.enabled}`);
  console.log(`   Behavior: ${target.behavior}`);
  console.log(`   Last Scan: ${target.lastScanAt || 'never'}`);
  console.log(`   Scan Count: ${target.scanCount}`);
  console.log(`   Tags: ${target.tags.join(', ')}\n`);

  // ========================================
  // STEP 4: Update target
  // ========================================
  console.log('🔄 STEP 4: Updating target\n');

  await plugin.updateTarget('example.com', {
    enabled: true,
    behavior: 'stealth', // change from passive to stealth
    metadata: { description: 'Main website (updated)', owner: 'DevOps team' },
    tags: ['production', 'public', 'monitored']
  });

  const updated = await plugin.getTarget('example.com');
  console.log(`   Updated behavior: ${updated.behavior}`);
  console.log(`   Updated tags: ${updated.tags.join(', ')}\n`);

  // ========================================
  // STEP 5: Trigger manual scan on specific target
  // ========================================
  console.log('🚀 STEP 5: Manual scan on specific target\n');

  const report = await plugin.runDiagnostics('example.com', {
    persist: true
  });

  console.log(`   Scan completed: ${report.status}`);
  console.log(`   Tools used: ${report.toolsAttempted.join(', ')}`);
  console.log(`   Primary IP: ${report.fingerprint.primaryIp}`);
  console.log(`   Storage Key: ${report.storageKey}\n`);

  // Check updated scan count
  const afterScan = await plugin.getTarget('example.com');
  console.log(`   Scan count updated: ${afterScan.scanCount}`);
  console.log(`   Last scan: ${afterScan.lastScanAt}`);
  console.log(`   Last status: ${afterScan.lastScanStatus}\n`);

  // ========================================
  // STEP 6: Trigger scheduled sweep
  // ========================================
  console.log('⏰ STEP 6: Trigger scheduled sweep (only enabled targets)\n');

  await plugin._triggerScheduledSweep('manual');

  console.log('   Sweep completed. Check scan counts:\n');

  const targetsAfterSweep = await plugin.listTargets({ includeDisabled: false });
  for (const t of targetsAfterSweep) {
    console.log(`   - ${t.id}: scans=${t.scanCount}, last=${t.lastScanAt}, status=${t.lastScanStatus}`);
  }
  console.log('');

  // ========================================
  // STEP 7: Enable disabled target
  // ========================================
  console.log('🔓 STEP 7: Enable disabled target\n');

  await plugin.updateTarget('staging.example.com', { enabled: true });
  console.log('   Enabled staging.example.com');

  const nowEnabled = await plugin.listTargets({ includeDisabled: false });
  console.log(`   Enabled targets now: ${nowEnabled.length}\n`);

  // ========================================
  // STEP 8: Remove target
  // ========================================
  console.log('🗑️  STEP 8: Remove target\n');

  const removed = await plugin.removeTarget('staging.example.com');
  console.log(`   Removed: ${removed.targetId}`);

  const remaining = await plugin.listTargets();
  console.log(`   Remaining targets: ${remaining.length}\n`);

  // ========================================
  // STEP 9: Bulk add targets
  // ========================================
  console.log('📦 STEP 9: Bulk add targets\n');

  const newTargets = [
    'sub1.example.com',
    'sub2.example.com',
    'sub3.example.com'
  ];

  for (const t of newTargets) {
    await plugin.addTarget(t, {
      behavior: 'passive',
      enabled: true,
      tags: ['subdomain', 'auto-discovered'],
      addedBy: 'discovery-script'
    });
    console.log(`   Added: ${t}`);
  }

  const allNow = await plugin.listTargets();
  console.log(`\n   Total targets now: ${allNow.length}\n`);

  // ========================================
  // STEP 10: Filter by tags (manual)
  // ========================================
  console.log('🏷️  STEP 10: Filter by tags\n');

  const productionTargets = allNow.filter(t => t.tags.includes('production'));
  console.log(`   Production targets: ${productionTargets.length}`);
  for (const t of productionTargets) {
    console.log(`   - ${t.id}`);
  }

  const autoDiscovered = allNow.filter(t => t.tags.includes('auto-discovered'));
  console.log(`\n   Auto-discovered targets: ${autoDiscovered.length}`);
  for (const t of autoDiscovered) {
    console.log(`   - ${t.id} (addedBy: ${t.addedBy})`);
  }
  console.log('');

  // ========================================
  // Cleanup
  // ========================================
  await plugin.stop();
  await db.disconnect();

  console.log('✅ Example completed successfully\n');

  console.log('📖 Summary:');
  console.log('   - Start with ZERO targets');
  console.log('   - Dynamically add/remove/update targets at runtime');
  console.log('   - Scheduler only scans enabled targets');
  console.log('   - Each scan updates scanCount and lastScanAt');
  console.log('   - Targets persist in plg_recon_targets resource');
  console.log('   - Use tags and metadata for organization\n');
}

main().catch((error) => {
  console.error('❌ Example failed:', error);
  process.exit(1);
});
