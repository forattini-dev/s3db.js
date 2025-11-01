/**
 * Example e48: Recon Plugin - Per-Tool Artifact Storage
 *
 * Demonstrates how the ReconPlugin now persists individual tool artifacts
 * separately, allowing granular tracking and analysis of each tool's output.
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
  // Initialize ReconPlugin with aggressive behavior
  // ========================================
  console.log('📦 Initializing ReconPlugin (aggressive mode)...\n');

  const plugin = new ReconPlugin({
    behavior: 'aggressive',
    storage: {
      persist: true,
      persistRawOutput: true,
      historyLimit: 50
    },
    resources: {
      persist: true
    },
    features: {
      ports: { nmap: true, masscan: true },
      subdomains: { amass: true, subfinder: true, crtsh: true },
      web: { ffuf: false, feroxbuster: false },
      vulnerability: { nikto: false }
    }
  });

  await db.usePlugin(plugin);
  await plugin.start();

  console.log('Plugin initialized\n');

  // ========================================
  // Run diagnostics on target
  // ========================================
  console.log('🔍 Running diagnostics on example.com...\n');

  const report = await plugin.runDiagnostics('example.com', {
    persist: true
  });

  console.log(`✅ Scan completed: ${report.status}`);
  console.log(`   Tools attempted: ${report.toolsAttempted.join(', ')}\n`);

  // ========================================
  // Check storage structure
  // ========================================
  console.log('📂 Storage Structure:\n');

  if (report.toolStorageKeys) {
    console.log('Individual Tool Artifacts:');
    for (const [toolName, storageKey] of Object.entries(report.toolStorageKeys)) {
      console.log(`   - ${toolName}: ${storageKey}`);
    }
    console.log('');
  }

  if (report.stageStorageKeys) {
    console.log('Aggregated Stage Artifacts:');
    for (const [stageName, storageKey] of Object.entries(report.stageStorageKeys)) {
      console.log(`   - ${stageName}: ${storageKey}`);
    }
    console.log('');
  }

  // ========================================
  // Load individual tool artifacts
  // ========================================
  console.log('🔧 Loading individual tool artifacts...\n');

  const storage = plugin.getStorage();

  // Load nmap artifact
  if (report.toolStorageKeys?.nmap) {
    const nmapArtifact = await storage.get(report.toolStorageKeys.nmap);
    console.log('📦 Nmap Artifact:');
    console.log(`   Status: ${nmapArtifact.status}`);
    console.log(`   Open Ports: ${nmapArtifact.summary?.openPorts?.length || 0}`);
    if (nmapArtifact.summary?.detectedServices) {
      console.log(`   Detected Services: ${nmapArtifact.summary.detectedServices.join(', ')}`);
    }
    console.log('');
  }

  // Load masscan artifact
  if (report.toolStorageKeys?.masscan) {
    const masscanArtifact = await storage.get(report.toolStorageKeys.masscan);
    console.log('📦 Masscan Artifact:');
    console.log(`   Status: ${masscanArtifact.status}`);
    console.log(`   Open Ports: ${masscanArtifact.openPorts?.length || 0}`);
    console.log('');
  }

  // Load subfinder artifact
  if (report.toolStorageKeys?.subfinder) {
    const subfinderArtifact = await storage.get(report.toolStorageKeys.subfinder);
    console.log('📦 Subfinder Artifact:');
    console.log(`   Status: ${subfinderArtifact.status}`);
    console.log(`   Subdomains Found: ${subfinderArtifact.count || 0}`);
    if (subfinderArtifact.sample) {
      console.log(`   Sample: ${subfinderArtifact.sample.slice(0, 3).join(', ')}`);
    }
    console.log('');
  }

  // Load amass artifact
  if (report.toolStorageKeys?.amass) {
    const amassArtifact = await storage.get(report.toolStorageKeys.amass);
    console.log('📦 Amass Artifact:');
    console.log(`   Status: ${amassArtifact.status}`);
    console.log(`   Subdomains Found: ${amassArtifact.count || 0}`);
    if (amassArtifact.sample) {
      console.log(`   Sample: ${amassArtifact.sample.slice(0, 3).join(', ')}`);
    }
    console.log('');
  }

  // Load crtsh artifact
  if (report.toolStorageKeys?.crtsh) {
    const crtshArtifact = await storage.get(report.toolStorageKeys.crtsh);
    console.log('📦 crt.sh Artifact:');
    console.log(`   Status: ${crtshArtifact.status}`);
    console.log(`   Subdomains Found: ${crtshArtifact.count || 0}`);
    console.log('');
  }

  // ========================================
  // Load aggregated stage artifact
  // ========================================
  console.log('📊 Loading aggregated stage artifact...\n');

  if (report.stageStorageKeys?.subdomains) {
    const subdomainsStage = await storage.get(report.stageStorageKeys.subdomains);
    console.log('📦 Subdomains Stage (Aggregated):');
    console.log(`   Status: ${subdomainsStage.status}`);
    console.log(`   Total Unique Subdomains: ${subdomainsStage.total || 0}`);
    console.log(`   Sources:`);
    if (subdomainsStage.sources) {
      for (const [source, data] of Object.entries(subdomainsStage.sources)) {
        console.log(`     - ${source}: ${data.status} (${data.count || 0} found)`);
      }
    }
    console.log('');
  }

  // ========================================
  // Compare tool performance
  // ========================================
  console.log('📈 Tool Performance Comparison:\n');

  const toolComparison = [];

  if (report.toolStorageKeys) {
    for (const [toolName, storageKey] of Object.entries(report.toolStorageKeys)) {
      const artifact = await storage.get(storageKey);
      toolComparison.push({
        tool: toolName,
        status: artifact.status,
        findings: artifact.count || artifact.summary?.openPorts?.length || 0,
        hasRawOutput: !!artifact.raw
      });
    }
  }

  console.log('| Tool       | Status      | Findings | Raw Output |');
  console.log('|------------|-------------|----------|------------|');
  for (const entry of toolComparison) {
    const status = entry.status.padEnd(11);
    const findings = String(entry.findings).padStart(8);
    const hasRaw = entry.hasRawOutput ? 'Yes' : 'No';
    console.log(`| ${entry.tool.padEnd(10)} | ${status} | ${findings} | ${hasRaw.padEnd(10)} |`);
  }
  console.log('');

  // ========================================
  // Check scan history index
  // ========================================
  console.log('📜 Scan History Index:\n');

  const baseKey = storage.getPluginKey(null, 'reports', 'example.com');
  const indexKey = `${baseKey}/index.json`;
  const index = await storage.get(indexKey);

  if (index && index.history) {
    console.log(`Total scans in history: ${index.history.length}`);
    console.log('Latest scan:');
    const latest = index.history[0];
    console.log(`  - Timestamp: ${latest.timestamp}`);
    console.log(`  - Status: ${latest.status}`);
    console.log(`  - Stage Keys: ${Object.keys(latest.stageKeys || {}).length} stages`);
    console.log(`  - Tool Keys: ${Object.keys(latest.toolKeys || {}).length} tools`);
    console.log(`  - Primary IP: ${latest.summary?.primaryIp || 'N/A'}`);
    console.log(`  - Open Ports: ${latest.summary?.openPorts || 0}`);
    console.log(`  - Subdomains: ${latest.summary?.subdomains || 0}`);
    console.log('');
  }

  // ========================================
  // Demonstrate accessing raw output
  // ========================================
  console.log('📄 Raw Output Example:\n');

  if (report.toolStorageKeys?.nmap) {
    const nmapArtifact = await storage.get(report.toolStorageKeys.nmap);
    if (nmapArtifact.raw) {
      console.log('Nmap raw output (first 500 chars):');
      console.log(nmapArtifact.raw.substring(0, 500));
      console.log('...\n');
    }
  }

  // ========================================
  // Cleanup
  // ========================================
  await plugin.stop();
  await db.disconnect();

  console.log('✅ Example completed successfully\n');

  console.log('📖 Summary:');
  console.log('   - Each tool (nmap, masscan, amass, subfinder, crtsh) generates its own artifact');
  console.log('   - Individual artifacts stored in: .../tools/<toolName>.json');
  console.log('   - Aggregated stage views stored in: .../aggregated/<stageName>.json');
  console.log('   - Tool storage keys tracked in: report.toolStorageKeys');
  console.log('   - Stage storage keys tracked in: report.stageStorageKeys');
  console.log('   - Scan history index includes both toolKeys and stageKeys');
  console.log('   - Enables granular performance analysis and debugging');
  console.log('   - Backward compatible: existing code using stageStorageKeys still works\n');
}

main().catch((error) => {
  console.error('❌ Example failed:', error);
  process.exit(1);
});
