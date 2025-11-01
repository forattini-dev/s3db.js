/**
 * Example e45: ReconPlugin Behavior Modes
 *
 * Demonstrates how to use behavior modes (passive, stealth, aggressive)
 * for different operational contexts.
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
  // SCENARIO 1: External Asset Discovery (Passive Mode)
  // ========================================
  console.log('📡 SCENARIO 1: External Asset Discovery (Passive Mode)');
  console.log('Use case: OSINT on external target without permission\n');

  const passivePlugin = new ReconPlugin({
    behavior: 'passive',
    storage: { persist: true, historyLimit: 5 },
    resources: { persist: false }
  });

  passivePlugin.on('recon:behavior-applied', ({ mode, final }) => {
    console.log(`🔧 Behavior "${mode}" applied:`);
    console.log(`   - Concurrency: ${final.concurrency}`);
    console.log(`   - DNS: ${final.features.dns}`);
    console.log(`   - Ping: ${final.features.latency?.ping}`);
    console.log(`   - Nmap: ${final.features.ports?.nmap}`);
    console.log(`   - CT Logs: ${final.features.subdomains?.crtsh}`);
    console.log(`   - theHarvester: ${final.features.osint?.theHarvester}\n`);
  });

  await db.installPlugin(passivePlugin);

  const passiveReport = await passivePlugin.runDiagnostics('example.com', {
    persist: true
  });

  console.log('📊 Passive Recon Results:');
  console.log(`   Target: ${passiveReport.target.host}`);
  console.log(`   Status: ${passiveReport.status}`);
  console.log(`   Tools Attempted: ${passiveReport.toolsAttempted.join(', ')}`);
  console.log(`   DNS IPs: ${passiveReport.fingerprint.ipAddresses.join(', ')}`);
  console.log(`   Subdomains: ${passiveReport.fingerprint.subdomainCount || 0}`);
  console.log('   ✅ No active scanning performed\n');

  // ========================================
  // SCENARIO 2: Authorized Pentest (Stealth Mode)
  // ========================================
  console.log('\n🕵️  SCENARIO 2: Authorized Pentest (Stealth Mode)');
  console.log('Use case: Authorized engagement with low noise\n');

  const stealthPlugin = new ReconPlugin({
    behavior: 'stealth',
    storage: { persist: true },
    resources: { persist: false }
  });

  let rateLimitCount = 0;
  stealthPlugin.on('recon:rate-limit-delay', ({ stage, delayMs }) => {
    rateLimitCount++;
    console.log(`   ⏱️  Rate limit: pausing ${delayMs}ms before stage "${stage}"`);
  });

  await db.installPlugin(stealthPlugin);

  const stealthReport = await stealthPlugin.runDiagnostics('example.com', {
    persist: true
  });

  console.log('\n📊 Stealth Recon Results:');
  console.log(`   Target: ${stealthReport.target.host}`);
  console.log(`   Status: ${stealthReport.status}`);
  console.log(`   Tools Attempted: ${stealthReport.toolsAttempted.join(', ')}`);
  console.log(`   Rate Limit Delays: ${rateLimitCount}x`);
  console.log(`   DNS: ${stealthReport.results.dns?.status}`);
  console.log(`   Ping: ${stealthReport.results.ping?.status} (avg: ${stealthReport.results.ping?.metrics?.avg || 'N/A'}ms)`);
  console.log(`   Ports: ${stealthReport.results.ports?.status} (nmap timing: -T2)`);
  console.log('   ✅ Low noise, rate-limited scan\n');

  // ========================================
  // SCENARIO 3: Internal Audit (Aggressive Mode)
  // ========================================
  console.log('\n🔥 SCENARIO 3: Internal Security Audit (Aggressive Mode)');
  console.log('Use case: Internal network with full authorization\n');

  const aggressivePlugin = new ReconPlugin({
    behavior: 'aggressive',
    storage: { persist: true },
    resources: { persist: false },
    behaviorOverrides: {
      nmap: { topPorts: 50 } // override aggressive default (100)
    }
  });

  await db.installPlugin(aggressivePlugin);

  console.log('⚠️  WARNING: Aggressive mode will:');
  console.log('   - Scan 50 ports with nmap -T4');
  console.log('   - Run all subdomain tools in parallel');
  console.log('   - Execute vulnerability scanners (if installed)');
  console.log('   - Generate high traffic (likely to trigger WAF/IDS)\n');

  const aggressiveReport = await aggressivePlugin.runDiagnostics('example.com', {
    persist: true,
    tools: ['dns', 'certificate', 'ping', 'curl', 'subdomains'] // limit for demo
  });

  console.log('📊 Aggressive Recon Results:');
  console.log(`   Target: ${aggressiveReport.target.host}`);
  console.log(`   Status: ${aggressiveReport.status}`);
  console.log(`   Concurrency: ${aggressivePlugin.config.concurrency}`);
  console.log(`   Tools Attempted: ${aggressiveReport.toolsAttempted.join(', ')}`);
  console.log(`   Subdomains Found: ${aggressiveReport.fingerprint.subdomainCount || 0}`);
  console.log(`   Technologies: ${aggressiveReport.fingerprint.technologies.slice(0, 3).join(', ')}`);
  console.log('   ✅ Fast, comprehensive scan\n');

  // ========================================
  // SCENARIO 4: Custom Behavior Override
  // ========================================
  console.log('\n⚙️  SCENARIO 4: Behavior Override');
  console.log('Use case: Passive mode + certificate check\n');

  const customPlugin = new ReconPlugin({
    behavior: 'passive',
    behaviorOverrides: {
      features: {
        certificate: true // enable cert check in passive mode
      }
    },
    storage: { persist: false },
    resources: { persist: false }
  });

  await db.installPlugin(customPlugin);

  const customReport = await customPlugin.runDiagnostics('https://example.com', {
    persist: false
  });

  console.log('📊 Custom Behavior Results:');
  console.log(`   Behavior: passive (with override)`);
  console.log(`   Certificate Status: ${customReport.results.certificate?.status}`);
  console.log(`   Issuer: ${customReport.results.certificate?.issuer?.CN || 'N/A'}`);
  console.log(`   Valid Until: ${customReport.results.certificate?.validTo || 'N/A'}`);
  console.log('   ✅ Passive + custom cert inspection\n');

  // ========================================
  // Cleanup
  // ========================================
  console.log('\n🧹 Cleaning up...');
  await db.disconnect();
  console.log('✅ Example completed successfully\n');

  console.log('📖 Summary:');
  console.log('   - passive: Zero active scanning (OSINT only)');
  console.log('   - stealth: Rate-limited with realistic UA and -T2 timing');
  console.log('   - aggressive: Full arsenal, high speed, high detection risk');
  console.log('   - behaviorOverrides: Customize presets per use case\n');
}

main().catch((error) => {
  console.error('❌ Example failed:', error);
  process.exit(1);
});
