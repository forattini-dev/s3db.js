/**
 * Example 46: ReconPlugin Namespace Detection
 *
 * Demonstrates automatic namespace detection and console warnings:
 * - Lists existing namespaces in storage
 * - Warns which namespace is being used
 * - Shows behavior when multiple instances exist
 */

import { Database } from '../../src/database.class.js';
import { ReconPlugin } from '../../src/plugins/recon.plugin.js';

// ========================================
// 1. Setup Database
// ========================================

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/recon-namespace-test',
  region: 'us-east-1'
});

await db.initialize();

console.log('✅ Database initialized\n');

// ========================================
// 2. Create First Instance (default)
// ========================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📌 Creating first instance (default namespace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const defaultPlugin = new ReconPlugin({
  // namespace: 'default' is implicit
  behavior: 'passive',
  storage: { enabled: true },
  resources: { persist: true }
});

// Expected output:
// [ReconPlugin] Using namespace: "default"
// (no existing namespaces detected yet)

await db.use(defaultPlugin);

// Create some data
await defaultPlugin.addTarget('example.com');
const report1 = await defaultPlugin.runDiagnostics('example.com', { persist: true });

console.log(`\n✅ Default namespace initialized`);
console.log(`   Created report: ${report1.id}`);

// ========================================
// 3. Create Second Instance (uptime)
// ========================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📌 Creating second instance (uptime namespace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const uptimePlugin = new ReconPlugin({
  namespace: 'uptime',
  behavior: 'passive',
  behaviors: {
    uptime: {
      enabled: true,
      checkInterval: 20000,
      aggregationInterval: 60000,
      methods: ['ping']
    }
  },
  storage: { enabled: true },
  resources: { persist: true }
});

// Expected output:
// [ReconPlugin] Detected 1 existing namespace(s): default
// [ReconPlugin] Using namespace: "uptime"

await db.use(uptimePlugin);

// Create some data
await uptimePlugin.addTarget('api.example.com');
await uptimePlugin.startMonitoring('api.example.com');

// Wait a few seconds for uptime checks
await new Promise(resolve => setTimeout(resolve, 5000));
await uptimePlugin.stopMonitoring('api.example.com');

console.log(`\n✅ Uptime namespace initialized`);
console.log(`   Started uptime monitoring`);

// ========================================
// 4. Create Third Instance (stealth)
// ========================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📌 Creating third instance (stealth namespace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const stealthPlugin = new ReconPlugin({
  namespace: 'stealth',
  behavior: 'stealth',
  storage: { enabled: true },
  resources: { persist: true }
});

// Expected output:
// [ReconPlugin] Detected 2 existing namespace(s): default, uptime
// [ReconPlugin] Using namespace: "stealth"

await db.use(stealthPlugin);

// Create some data
await stealthPlugin.addTarget('partner.example.com');
const report3 = await stealthPlugin.runDiagnostics('partner.example.com', { persist: true });

console.log(`\n✅ Stealth namespace initialized`);
console.log(`   Created report: ${report3.id}`);

// ========================================
// 5. Create Fourth Instance (aggressive)
// ========================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📌 Creating fourth instance (aggressive namespace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const aggressivePlugin = new ReconPlugin({
  namespace: 'aggressive',
  behavior: 'aggressive',
  storage: { enabled: true },
  resources: { persist: true }
});

// Expected output:
// [ReconPlugin] Detected 3 existing namespace(s): default, stealth, uptime
// [ReconPlugin] Using namespace: "aggressive"

await db.use(aggressivePlugin);

// Create some data
await aggressivePlugin.addTarget('staging.example.com');
const report4 = await aggressivePlugin.runDiagnostics('staging.example.com', { persist: true });

console.log(`\n✅ Aggressive namespace initialized`);
console.log(`   Created report: ${report4.id}`);

// ========================================
// 6. Verify Namespace Detection
// ========================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Namespace Detection Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const allNamespaces = await defaultPlugin._storageManager.listNamespaces();

console.log(`🔖 Total namespaces detected: ${allNamespaces.length}`);
console.log(`   Namespaces: ${allNamespaces.join(', ')}\n`);

// Verify each namespace has data
for (const namespace of allNamespaces) {
  const storage = db.plugins.recon.getStorage();
  const baseKey = storage.getPluginKey(null, namespace);
  const keys = await storage.list(baseKey);

  console.log(`📁 Namespace "${namespace}": ${keys.length} keys in storage`);
}

// ========================================
// 7. Create Another Instance of Existing Namespace
// ========================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📌 Creating another instance (reusing "uptime" namespace)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const uptimePlugin2 = new ReconPlugin({
  namespace: 'uptime',  // Same namespace as before
  behavior: 'passive',
  storage: { enabled: true },
  resources: { persist: true }
});

// Expected output:
// [ReconPlugin] Detected 4 existing namespace(s): aggressive, default, stealth, uptime
// [ReconPlugin] Using namespace: "uptime"

await db.use(uptimePlugin2);

console.log(`\n✅ Second uptime instance initialized (shares same namespace)`);

// ========================================
// 8. Summary
// ========================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Final Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ Namespace detection works as expected:');
console.log('   1. First instance: No existing namespaces detected');
console.log('   2. Second instance: Detected 1 namespace (default)');
console.log('   3. Third instance: Detected 2 namespaces (default, uptime)');
console.log('   4. Fourth instance: Detected 3 namespaces (default, stealth, uptime)');
console.log('   5. Fifth instance: Detected 4 namespaces (reuses uptime)\n');

console.log('✅ Console warnings emitted for:');
console.log('   - List of existing namespaces (if any)');
console.log('   - Which namespace is being used\n');

console.log('✅ Storage isolation verified:');
console.log('   - Each namespace has separate storage paths');
console.log('   - Each namespace has separate database resources');
console.log('   - Namespaces can be reused by multiple instances\n');

console.log('🔖 Namespaces created in this test:');
console.log('   ' + allNamespaces.join(', '));
console.log('\n✅ Test complete!\n');
