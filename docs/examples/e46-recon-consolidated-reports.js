/**
 * Example e46: Recon Plugin - Consolidated Reports
 *
 * Demonstrates how to generate comprehensive reports with full history,
 * diffs, and all tool outputs for a target.
 */

import { S3db } from '#src/database.class.js';
import { ReconPlugin } from '#src/plugins/recon.plugin.js';

async function main() {
  const db = new S3db({
    connectionString: process.env.S3DB_CONNECTION_STRING || 'http://minioadmin:minioadmin@localhost:9000/s3db-examples'
  });

  await db.connect();
  console.log('✅ Connected to S3DB\n');

  const plugin = new ReconPlugin({
    behavior: 'passive',
    storage: { persist: true, historyLimit: 10 },
    resources: { persist: true, autoCreate: true }
  });

  // Listen to dependency warnings
  plugin.on('recon:dependencies-warning', ({ warnings, message, missingTools }) => {
    console.log(`⚠️  ${message}`);
    console.log(`   Missing: ${missingTools.join(', ')}\n`);
  });

  // Listen to dependency check results
  plugin.on('recon:dependencies-checked', ({ available, missing, availableTools }) => {
    console.log(`📊 Dependency Check:`);
    console.log(`   ✅ Available: ${available} tool(s) - ${availableTools.join(', ')}`);
    console.log(`   ❌ Missing: ${missing} tool(s)\n`);
  });

  await db.installPlugin(plugin);
  await plugin.start();

  // ========================================
  // STEP 1: Run multiple scans to build history
  // ========================================
  console.log('🔄 Running 3 scans to build history...\n');

  for (let i = 1; i <= 3; i++) {
    console.log(`📡 Scan #${i} of example.com`);

    const report = await plugin.runDiagnostics('example.com', {
      persist: true
    });

    console.log(`   Status: ${report.status}`);
    console.log(`   Tools: ${report.toolsAttempted.join(', ')}`);
    console.log(`   Storage Key: ${report.storageKey}\n`);

    // Show individual stage storage
    for (const [stageName, stageKey] of Object.entries(report.stageStorageKeys || {})) {
      console.log(`   - ${stageName}: ${stageKey}`);
    }
    console.log('');

    // Wait 2 seconds between scans
    if (i < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // ========================================
  // STEP 2: Generate Client Report (latest scan)
  // ========================================
  console.log('\n📄 Generating Client Report (latest scan)...\n');

  const clientReport = await plugin.generateClientReport('example.com', {
    format: 'json',
    diffLimit: 5
  });

  console.log('Client Report Structure:');
  console.log(`   Host ID: ${clientReport.host.id}`);
  console.log(`   Last Scan: ${clientReport.host.lastScanAt}`);
  console.log(`   Primary IP: ${clientReport.host.summary.primaryIp}`);
  console.log(`   Subdomains: ${clientReport.host.summary.subdomainCount}`);
  console.log(`   Open Ports: ${clientReport.host.summary.openPortCount}`);
  console.log(`   Diffs: ${clientReport.diffs.length}`);
  console.log(`   Stages: ${clientReport.stages.length}\n`);

  // ========================================
  // STEP 3: Generate Consolidated Report (all history)
  // ========================================
  console.log('📊 Generating Consolidated Report (all history)...\n');

  const consolidatedReport = await plugin.generateConsolidatedReport('example.com', {
    historyLimit: 10,
    diffLimit: 20,
    includeRawOutputs: false // set true to include full raw outputs
  });

  console.log('Consolidated Report Structure:');
  console.log(`   Target: ${consolidatedReport.target}`);
  console.log(`   Generated At: ${consolidatedReport.generatedAt}`);
  console.log(`   Total Scans: ${consolidatedReport.totalScans}`);
  console.log(`   Recent Scans: ${consolidatedReport.recentScans}\n`);

  // Show scan history
  console.log('📜 Scan History:');
  for (const scan of consolidatedReport.scans) {
    console.log(`   - ${scan.timestamp}:`);
    console.log(`     Status: ${scan.status}`);
    console.log(`     Tools: ${scan.toolsAttempted.join(', ')}`);
    console.log(`     Primary IP: ${scan.summary?.primaryIp || 'N/A'}`);
    console.log(`     Subdomains: ${scan.summary?.subdomains || 0}`);
    console.log(`     Open Ports: ${scan.summary?.openPorts || 0}`);

    // Show stage summaries
    const stageNames = Object.keys(scan.stages || {});
    if (stageNames.length > 0) {
      console.log(`     Stages: ${stageNames.join(', ')}`);
    }
    console.log('');
  }

  // Show current state
  if (consolidatedReport.currentState) {
    console.log('🎯 Current State (from hosts resource):');
    console.log(`   Last Updated: ${consolidatedReport.currentState.lastScanAt}`);
    console.log(`   Technologies: ${consolidatedReport.currentState.summary.technologies.slice(0, 3).join(', ')}`);
    console.log('');
  }

  // Show recent changes
  if (consolidatedReport.recentChanges && consolidatedReport.recentChanges.length > 0) {
    console.log('📝 Recent Changes (diffs):');
    for (const diff of consolidatedReport.recentChanges.slice(0, 5)) {
      const changes = diff.changes || [];
      console.log(`   - ${diff.timestamp}:`);
      for (const change of changes.slice(0, 3)) {
        console.log(`     ${change.severity === 'high' ? '🚨' : '⚠️'} ${change.type}: ${change.description || change.values?.join(', ')}`);
      }
      console.log('');
    }
  }

  // Show subdomains
  if (consolidatedReport.subdomains) {
    console.log('🌐 Subdomains Discovery:');
    console.log(`   Total: ${consolidatedReport.subdomains.total}`);
    console.log(`   Last Scan: ${consolidatedReport.subdomains.lastScanAt}`);
    console.log(`   Sample: ${consolidatedReport.subdomains.subdomains.slice(0, 5).join(', ')}`);
    console.log('');
  }

  // Show discovered paths
  if (consolidatedReport.discoveredPaths) {
    console.log('🔍 Discovered Paths:');
    console.log(`   Total: ${consolidatedReport.discoveredPaths.total}`);
    console.log(`   Sample: ${consolidatedReport.discoveredPaths.paths.slice(0, 5).join(', ')}`);
    console.log('');
  }

  // ========================================
  // STEP 4: Export consolidated report
  // ========================================
  console.log('💾 Exporting consolidated report to JSON...\n');

  const fs = await import('fs/promises');
  await fs.writeFile(
    '/tmp/recon-consolidated-example.com.json',
    JSON.stringify(consolidatedReport, null, 2)
  );

  console.log('✅ Exported to /tmp/recon-consolidated-example.com.json\n');

  // ========================================
  // STEP 5: Check dependency status
  // ========================================
  console.log('🔍 Checking tool dependencies...\n');

  const missingTools = await plugin.checkDependencies();

  if (missingTools.length === 0) {
    console.log('✅ All configured tools are available!\n');
  } else {
    console.log('⚠️  Missing tools:');
    for (const missing of missingTools) {
      console.log(`   - ${missing.tool} (${missing.command})`);
      console.log(`     Category: ${missing.category}`);
      console.log(`     Install: ${missing.installDocs}\n`);
    }
  }

  // ========================================
  // Cleanup
  // ========================================
  await db.disconnect();
  console.log('✅ Example completed successfully\n');

  console.log('📖 Summary:');
  console.log('   1. Each scan creates:');
  console.log('      - Full report: plugin=recon/reports/<host>/<timestamp>.json');
  console.log('      - Stage outputs: plugin=recon/reports/<host>/stages/<timestamp>/<stage>.json');
  console.log('      - Index: plugin=recon/reports/<host>/index.json');
  console.log('   2. generateClientReport() - Latest scan with diffs');
  console.log('   3. generateConsolidatedReport() - All scans + resources + diffs');
  console.log('   4. checkDependencies() - Validate tool availability\n');
}

main().catch((error) => {
  console.error('❌ Example failed:', error);
  process.exit(1);
});
