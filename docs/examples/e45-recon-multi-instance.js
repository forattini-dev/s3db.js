/**
 * Example 45: ReconPlugin Multi-Instance (Namespace Support)
 *
 * Demonstrates running multiple ReconPlugin instances simultaneously:
 * - Uptime monitoring (20s checks, passive)
 * - Stealth reconnaissance (slow, low footprint)
 * - Aggressive reconnaissance (fast, comprehensive)
 *
 * Each instance has isolated storage and database resources.
 */

import { Database } from '../../src/database.class.js';
import { ReconPlugin } from '../../src/plugins/recon.plugin.js';

// ========================================
// 1. Setup Database
// ========================================

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/recon-multi',
  region: 'us-east-1'
});

await db.initialize();

// ========================================
// 2. Create Multiple Plugin Instances
// ========================================

// Instance 1: Uptime Monitoring (passive + uptime behavior)
const uptimePlugin = new ReconPlugin({
  namespace: 'uptime',
  behavior: 'passive',  // Minimal features
  features: {
    dns: true,
    certificate: false,
    http: { curl: true },
    latency: { ping: true, traceroute: false },
    subdomains: { amass: false, subfinder: false, assetfinder: false, crtsh: false },
    ports: { nmap: false, masscan: false },
    web: { ffuf: false, feroxbuster: false, gobuster: false },
    vulnerability: { nikto: false, wpscan: false, droopescan: false },
    tlsAudit: { openssl: false, sslyze: false, testssl: false },
    fingerprint: { whatweb: false },
    screenshots: { aquatone: false, eyewitness: false },
    osint: { theHarvester: false, reconNg: false }
  },
  behaviors: {
    uptime: {
      enabled: true,
      checkInterval: 20000,         // 20 seconds (3 samples/minute)
      aggregationInterval: 60000,   // Aggregate every 60 seconds
      methods: ['ping', 'http'],
      alertOnDowntime: true,
      downtimeThreshold: 3,         // 3 fails = downtime (60s)
      timeout: 5000,
      retainHistory: 30 * 24 * 60 * 60 * 1000,  // 30 days
      persistRawChecks: false       // Only persist minute cohorts
    }
  },
  storage: { enabled: true },
  resources: { persist: true },
  concurrency: 2
});

// Instance 2: Stealth Reconnaissance (slow, low footprint)
const stealthPlugin = new ReconPlugin({
  namespace: 'stealth',
  behavior: 'stealth',  // Uses stealth preset
  storage: { enabled: true },
  resources: { persist: true },
  concurrency: 1
});

// Instance 3: Aggressive Reconnaissance (fast, comprehensive)
const aggressivePlugin = new ReconPlugin({
  namespace: 'aggressive',
  behavior: 'aggressive',  // Uses aggressive preset
  storage: { enabled: true },
  resources: { persist: true },
  concurrency: 8
});

// ========================================
// 3. Register Plugins
// ========================================

await db.use(uptimePlugin);
await db.use(stealthPlugin);
await db.use(aggressivePlugin);

console.log('\n✅ All plugin instances registered!');
console.log('   - Uptime monitoring (namespace: uptime)');
console.log('   - Stealth recon (namespace: stealth)');
console.log('   - Aggressive recon (namespace: aggressive)\n');

// ========================================
// 4. Add Targets to Each Instance
// ========================================

// Uptime targets: Production services
await uptimePlugin.addTarget('api.example.com', {
  enabled: true,
  metadata: { environment: 'production', criticality: 'high' }
});

await uptimePlugin.addTarget('cdn.example.com', {
  enabled: true,
  metadata: { environment: 'production', criticality: 'high' }
});

console.log('✅ Added 2 uptime monitoring targets');

// Stealth targets: External assets (low visibility required)
await stealthPlugin.addTarget('partner.example.com', {
  enabled: true,
  metadata: { type: 'external', scan_frequency: 'weekly' }
});

console.log('✅ Added 1 stealth reconnaissance target');

// Aggressive targets: Internal assets (comprehensive scanning)
await aggressivePlugin.addTarget('staging.internal.example.com', {
  enabled: true,
  metadata: { environment: 'staging', full_audit: true }
});

console.log('✅ Added 1 aggressive reconnaissance target\n');

// ========================================
// 5. Start Uptime Monitoring
// ========================================

// Uptime plugin continuously checks targets every 20s
const uptimeTargets = await uptimePlugin.listTargets();
for (const target of uptimeTargets) {
  if (target.enabled) {
    await uptimePlugin.startMonitoring(target.target);
  }
}

console.log('✅ Uptime monitoring started (20s checks → 1min aggregation)\n');

// ========================================
// 6. Run One-Time Reconnaissance Scans
// ========================================

// Stealth scan (slow, minimal footprint)
console.log('🔍 Running stealth reconnaissance...');
const stealthReport = await stealthPlugin.runDiagnostics('partner.example.com', {
  persist: true
});

console.log(`✅ Stealth scan completed (${stealthReport.status})`);
console.log(`   Duration: ${stealthReport.executionTime}ms`);
console.log(`   IPs found: ${stealthReport.fingerprint?.infrastructure?.ips?.ipv4?.length || 0}`);
console.log(`   Open ports: ${stealthReport.fingerprint?.attackSurface?.openPorts?.length || 0}\n`);

// Aggressive scan (fast, comprehensive)
console.log('🔍 Running aggressive reconnaissance...');
const aggressiveReport = await aggressivePlugin.runDiagnostics('staging.internal.example.com', {
  persist: true
});

console.log(`✅ Aggressive scan completed (${aggressiveReport.status})`);
console.log(`   Duration: ${aggressiveReport.executionTime}ms`);
console.log(`   IPs found: ${aggressiveReport.fingerprint?.infrastructure?.ips?.ipv4?.length || 0}`);
console.log(`   Open ports: ${aggressiveReport.fingerprint?.attackSurface?.openPorts?.length || 0}`);
console.log(`   Subdomains found: ${aggressiveReport.fingerprint?.attackSurface?.subdomains?.length || 0}\n`);

// ========================================
// 7. Query Data from Each Namespace
// ========================================

// Query uptime data
const uptimeHostsResource = await db.getResource('plg_recon_uptime_hosts');
const uptimeHosts = await uptimeHostsResource.list({ limit: 10 });

console.log(`📊 Uptime namespace: ${uptimeHosts.length} monitored hosts`);

// Query stealth data
const stealthReportsResource = await db.getResource('plg_recon_stealth_reports');
const stealthReports = await stealthReportsResource.list({ limit: 10 });

console.log(`📊 Stealth namespace: ${stealthReports.length} reconnaissance reports`);

// Query aggressive data
const aggressiveReportsResource = await db.getResource('plg_recon_aggressive_reports');
const aggressiveReports = await aggressiveReportsResource.list({ limit: 10 });

console.log(`📊 Aggressive namespace: ${aggressiveReports.length} reconnaissance reports\n`);

// ========================================
// 8. Access Storage Directly
// ========================================

const storage = db.plugins.recon.getStorage();

// List uptime minute cohorts
const uptimeCohorts = await storage.list(
  storage.getPluginKey(null, 'uptime', 'uptime', 'api.example.com', 'cohorts')
);

console.log(`📁 Uptime storage: ${uptimeCohorts.length} minute cohorts persisted`);

// List stealth reports
const stealthStorageReports = await storage.list(
  storage.getPluginKey(null, 'stealth', 'reports', 'partner.example.com')
);

console.log(`📁 Stealth storage: ${stealthStorageReports.length} raw reports persisted`);

// List aggressive reports
const aggressiveStorageReports = await storage.list(
  storage.getPluginKey(null, 'aggressive', 'reports', 'staging.internal.example.com')
);

console.log(`📁 Aggressive storage: ${aggressiveStorageReports.length} raw reports persisted\n`);

// ========================================
// 9. List All Namespaces
// ========================================

const allNamespaces = await uptimePlugin._storageManager.listNamespaces();

console.log(`🔖 Total namespaces detected: ${allNamespaces.length}`);
console.log(`   Namespaces: ${allNamespaces.join(', ')}\n`);

// ========================================
// 10. Cleanup (simulate running for 5 minutes)
// ========================================

console.log('⏰ Simulating 5 minutes of uptime monitoring...');
console.log('   - 20s checks will accumulate');
console.log('   - 60s aggregation will persist minute cohorts');
console.log('   - Press Ctrl+C to stop\n');

// Wait 5 minutes
await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

// Stop uptime monitoring
for (const target of uptimeTargets) {
  await uptimePlugin.stopMonitoring(target.target);
}

console.log('✅ Uptime monitoring stopped');

// ========================================
// Summary
// ========================================

console.log('\n📋 Multi-Instance Summary:');
console.log('┌────────────────┬───────────────┬─────────────────┬──────────────┐');
console.log('│ Namespace      │ Purpose       │ Behavior        │ Concurrency  │');
console.log('├────────────────┼───────────────┼─────────────────┼──────────────┤');
console.log('│ uptime         │ Monitoring    │ passive + uptime│ 2            │');
console.log('│ stealth        │ Low visibility│ stealth         │ 1            │');
console.log('│ aggressive     │ Full audit    │ aggressive      │ 8            │');
console.log('└────────────────┴───────────────┴─────────────────┴──────────────┘');
console.log('\n📁 Storage Isolation:');
console.log('   plugin=recon/uptime/reports/...');
console.log('   plugin=recon/stealth/reports/...');
console.log('   plugin=recon/aggressive/reports/...');
console.log('\n📊 Database Resources:');
console.log('   plg_recon_uptime_hosts, plg_recon_uptime_reports, ...');
console.log('   plg_recon_stealth_hosts, plg_recon_stealth_reports, ...');
console.log('   plg_recon_aggressive_hosts, plg_recon_aggressive_reports, ...');
console.log('\n✅ All instances running independently without conflicts!\n');
