# ReconPlugin - Namespace Support

**Run multiple plugin instances simultaneously with isolated data**

---

## 🎯 Overview

Namespace support allows running multiple ReconPlugin instances in parallel without data conflicts:

```
┌─────────────────────────────────────────────────────────────────┐
│ Database (S3DB)                                                 │
│                                                                 │
│  Plugin Instance 1 (uptime)     Plugin Instance 2 (stealth)    │
│         ↓                                ↓                      │
│  plugin=recon/uptime/...         plugin=recon/stealth/...      │
│  plg_recon_uptime_hosts          plg_recon_stealth_hosts       │
│  plg_recon_uptime_reports        plg_recon_stealth_reports     │
│                                                                 │
│  Plugin Instance 3 (aggressive)  Plugin Instance 4 (default)   │
│         ↓                                ↓                      │
│  plugin=recon/aggressive/...     plugin=recon/default/...      │
│  plg_recon_aggressive_hosts      plg_recon_hosts               │
│  plg_recon_aggressive_reports    plg_recon_reports             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔖 Use Cases

### 1. **Uptime Monitoring + Reconnaissance**
- **Uptime namespace**: Continuous monitoring (20s checks, passive)
- **Default namespace**: Weekly reconnaissance scans (aggressive)

### 2. **Multi-Environment Scanning**
- **Production namespace**: Stealth scans (low footprint)
- **Staging namespace**: Aggressive scans (comprehensive)
- **Development namespace**: Passive scans (minimal)

### 3. **Multi-Client/Tenant**
- **client-acme namespace**: Scans for ACME Corp
- **client-globex namespace**: Scans for Globex Inc
- Each client has isolated data and reports

### 4. **Behavior Presets**
- **passive namespace**: DNS + Certificate only
- **stealth namespace**: Low visibility, rate-limited
- **aggressive namespace**: Full audit, all tools

---

## 📝 Configuration

### Basic Usage

```javascript
import { Database } from 's3db.js';
import { ReconPlugin } from 's3db.js';

const db = new Database({ connectionString: '...' });
await db.initialize();

// Create plugin with namespace
const plugin = new ReconPlugin({
  namespace: 'uptime',  // ✅ Set namespace here
  behavior: 'passive',
  behaviors: {
    uptime: { enabled: true }
  }
});

await db.usePlugin(plugin);
```

### Multiple Instances

```javascript
// Instance 1: Uptime monitoring
const uptimePlugin = new ReconPlugin({
  namespace: 'uptime',
  behavior: 'passive',
  behaviors: { uptime: { enabled: true } }
});

// Instance 2: Stealth reconnaissance
const stealthPlugin = new ReconPlugin({
  namespace: 'stealth',
  behavior: 'stealth'
});

// Instance 3: Aggressive reconnaissance
const aggressivePlugin = new ReconPlugin({
  namespace: 'aggressive',
  behavior: 'aggressive'
});

// Register all instances
await db.usePlugin(uptimePlugin);
// Console output: [ReconPlugin] Using namespace: "uptime"

await db.usePlugin(stealthPlugin);
// Console output:
// [ReconPlugin] Detected 1 existing namespace(s): uptime
// [ReconPlugin] Using namespace: "stealth"

await db.usePlugin(aggressivePlugin);
// Console output:
// [ReconPlugin] Detected 2 existing namespace(s): stealth, uptime
// [ReconPlugin] Using namespace: "aggressive"
```

**Console Output Behavior**:
- ✅ **First instance**: No warning about existing namespaces (storage is empty)
- ✅ **Second instance**: Lists existing namespaces found in storage
- ✅ **Every instance**: Always warns which namespace is being used

This automatic detection helps prevent accidental data conflicts and provides visibility into active instances.

---

## 📁 Storage Structure

### PluginStorage Paths

Each namespace has isolated storage paths:

```
# Default namespace (no prefix)
plugin=recon/default/reports/<host>/<timestamp>.json
plugin=recon/default/uptime/<host>/status.json
plugin=recon/default/uptime/<host>/cohorts/2025-01-01/12-34.json

# Uptime namespace
plugin=recon/uptime/reports/<host>/<timestamp>.json
plugin=recon/uptime/uptime/<host>/status.json
plugin=recon/uptime/uptime/<host>/cohorts/2025-01-01/12-34.json

# Stealth namespace
plugin=recon/stealth/reports/<host>/<timestamp>.json
plugin=recon/stealth/uptime/<host>/status.json

# Aggressive namespace
plugin=recon/aggressive/reports/<host>/<timestamp>.json
plugin=recon/aggressive/uptime/<host>/status.json
```

### Database Resources

Each namespace has isolated database resources:

```
# Default namespace (no suffix)
plg_recon_hosts
plg_recon_reports
plg_recon_diffs
plg_recon_stages
plg_recon_subdomains
plg_recon_paths
plg_recon_targets

# Uptime namespace (suffix: _uptime)
plg_recon_uptime_hosts
plg_recon_uptime_reports
plg_recon_uptime_diffs
plg_recon_uptime_stages
plg_recon_uptime_subdomains
plg_recon_uptime_paths
plg_recon_uptime_targets

# Stealth namespace (suffix: _stealth)
plg_recon_stealth_hosts
plg_recon_stealth_reports
...

# Aggressive namespace (suffix: _aggressive)
plg_recon_aggressive_hosts
plg_recon_aggressive_reports
...
```

---

## 🔍 Namespace Detection

On initialization, the plugin automatically detects existing namespaces and warns about usage:

```bash
[ReconPlugin] Detected 3 existing namespace(s): aggressive, stealth, uptime
[ReconPlugin] Using namespace: "uptime"
```

This helps prevent accidental data conflicts and provides visibility into active instances.

### List Namespaces Programmatically

```javascript
const plugin = new ReconPlugin({ namespace: 'uptime' });
await db.usePlugin(plugin);

// List all namespaces in storage
const namespaces = await plugin._storageManager.listNamespaces();

console.log(`Found namespaces: ${namespaces.join(', ')}`);
// Output: Found namespaces: aggressive, default, stealth, uptime
```

---

## 🔧 API Methods

All plugin methods automatically respect the configured namespace:

### Targets

```javascript
// Add target to namespace
await plugin.addTarget('example.com');

// List targets from namespace
const targets = await plugin.listTargets();

// Get target from namespace
const target = await plugin.getTarget('example.com');

// Remove target from namespace
await plugin.removeTarget('example.com');
```

### Reconnaissance

```javascript
// Run scan in namespace
const report = await plugin.runDiagnostics('example.com', {
  persist: true  // Persists to namespace storage + resources
});
```

### Uptime Monitoring

```javascript
// Start monitoring in namespace
await plugin.startMonitoring('example.com');

// Stop monitoring in namespace
await plugin.stopMonitoring('example.com');

// Get uptime status from namespace
const status = await plugin.getUptimeStatus('example.com');
```

### Scheduler

```javascript
// Scheduler automatically uses namespace
// Cron job name: recon-sweep-<namespace>
await plugin.scheduleSweep('0 2 * * *');  // 2 AM daily
```

---

## 📊 Querying Data

### Query by Namespace

```javascript
// Query uptime namespace
const uptimeReportsResource = await db.getResource('plg_recon_uptime_reports');
const uptimeReports = await uptimeReportsResource.query({
  timestampDay: '2025-01-01'
});

// Query stealth namespace
const stealthHostsResource = await db.getResource('plg_recon_stealth_hosts');
const highRiskHosts = await stealthHostsResource.query({
  riskLevel: 'high'
});

// Query aggressive namespace
const aggressiveReportsResource = await db.getResource('plg_recon_aggressive_reports');
const recentScans = await aggressiveReportsResource.list({
  limit: 10,
  sort: { field: 'timestamp', order: 'desc' }
});
```

### Cross-Namespace Queries

```javascript
// Compare data across namespaces
const defaultReports = await db.getResource('plg_recon_reports');
const uptimeReports = await db.getResource('plg_recon_uptime_reports');

const defaultData = await defaultReports.list({ limit: 100 });
const uptimeData = await uptimeReports.list({ limit: 100 });

console.log(`Default namespace: ${defaultData.length} reports`);
console.log(`Uptime namespace: ${uptimeData.length} reports`);
```

---

## 🧪 Example: Production Setup

### Scenario
- **Uptime monitoring**: 24/7 availability checks (passive + uptime behavior)
- **Weekly audits**: Comprehensive scans every Sunday (aggressive behavior)

### Implementation

```javascript
import { Database } from 's3db.js';
import { ReconPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@prod-recon-bucket?region=us-east-1'
});

await db.initialize();

// ========================================
// 1. Uptime Monitoring (24/7)
// ========================================

const uptimePlugin = new ReconPlugin({
  namespace: 'uptime',
  behavior: 'passive',
  features: {
    dns: true,
    http: { curl: true },
    latency: { ping: true }
  },
  behaviors: {
    uptime: {
      enabled: true,
      checkInterval: 20000,         // 20s checks
      aggregationInterval: 60000,   // 1min aggregation
      methods: ['ping', 'http'],
      downtimeThreshold: 3          // 3 fails = down
    }
  },
  storage: { enabled: true },
  resources: { persist: true }
});

await db.usePlugin(uptimePlugin);

// Add production services
await uptimePlugin.addTarget('api.example.com', {
  metadata: { criticality: 'high', team: 'platform' }
});

await uptimePlugin.addTarget('cdn.example.com', {
  metadata: { criticality: 'high', team: 'infra' }
});

// Start monitoring
const targets = await uptimePlugin.listTargets();
for (const target of targets) {
  await uptimePlugin.startMonitoring(target.target);
}

console.log('✅ Uptime monitoring started');

// ========================================
// 2. Weekly Audits (Sundays at 2 AM)
// ========================================

const auditPlugin = new ReconPlugin({
  namespace: 'audit',
  behavior: 'aggressive',
  schedule: {
    enabled: true,
    cron: '0 2 * * 0',  // Sundays at 2 AM
    runOnStart: false
  },
  storage: { enabled: true },
  resources: { persist: true }
});

await db.usePlugin(auditPlugin);

// Add audit targets
await auditPlugin.addTarget('api.example.com', {
  behavior: 'aggressive',
  metadata: { audit_type: 'full', compliance: 'PCI-DSS' }
});

await auditPlugin.addTarget('cdn.example.com', {
  behavior: 'aggressive',
  metadata: { audit_type: 'full', compliance: 'SOC2' }
});

console.log('✅ Weekly audit scheduler configured');

// ========================================
// 3. Monitor Events
// ========================================

uptimePlugin.on('uptime:transition', (event) => {
  if (event.to === 'down') {
    console.error(`🚨 DOWNTIME: ${event.host}`);
    // Send alert to PagerDuty, Slack, etc.
  } else if (event.to === 'up') {
    console.log(`🟢 RECOVERED: ${event.host}`);
  }
});

auditPlugin.on('recon:completed', async (event) => {
  console.log(`📊 Audit completed: ${event.target} (${event.status})`);

  // Generate compliance report
  const report = await auditPlugin.getReport(event.target);
  // Send to compliance dashboard
});

// ========================================
// 4. Query Dashboard Data
// ========================================

setInterval(async () => {
  // Uptime stats (last 24 hours)
  const uptimeHostsResource = await db.getResource('plg_recon_uptime_hosts');
  const hosts = await uptimeHostsResource.list();

  console.log(`\n📊 Uptime Dashboard (${new Date().toISOString()})`);
  for (const host of hosts) {
    console.log(`   ${host.host}: ${host.uptimePercentage}% uptime`);
  }

  // Latest audit results
  const auditReportsResource = await db.getResource('plg_recon_audit_reports');
  const latestAudits = await auditReportsResource.list({
    limit: 5,
    sort: { field: 'timestamp', order: 'desc' }
  });

  console.log(`\n🔍 Latest Audits:`);
  for (const report of latestAudits) {
    console.log(`   ${report.host}: Risk Level ${report.riskLevel} (${report.timestamp})`);
  }
}, 60 * 60 * 1000);  // Every hour
```

---

## 🔒 Isolation Guarantees

### Storage Isolation
- **PluginStorage paths** are prefixed with namespace
- No risk of overwriting data between instances
- Each instance has independent pruning/retention

### Resource Isolation
- **Database resources** are suffixed with namespace (except 'default')
- Schema changes in one namespace don't affect others
- Independent partitioning and indexing

### Event Isolation
- Events are emitted per-instance
- No cross-namespace event pollution
- Each instance has independent listeners

---

## ⚠️ Important Notes

### Default Namespace

The `default` namespace is special:
- **Storage**: `plugin=recon/default/...`
- **Resources**: No suffix (`plg_recon_hosts`, not `plg_recon_default_hosts`)

This ensures backward compatibility with existing deployments.

### Resource Name Mapping

```javascript
// Internal key → Actual resource name

// Default namespace
this.resources['plg_recon_hosts'] → plg_recon_hosts

// Uptime namespace
this.resources['plg_recon_hosts'] → plg_recon_uptime_hosts

// Stealth namespace
this.resources['plg_recon_hosts'] → plg_recon_stealth_hosts
```

The internal key remains consistent (`plg_recon_hosts`), allowing code to reference resources without knowing the namespace.

### Scheduler Integration

When using SchedulerPlugin, cron jobs are automatically namespaced:

```javascript
// Default namespace
Cron job name: recon-sweep-default

// Uptime namespace
Cron job name: recon-sweep-uptime

// Custom namespace
Cron job name: recon-sweep-<namespace>
```

This prevents job conflicts when running multiple instances.

---

## 🧹 Maintenance

### Pruning by Namespace

Each namespace has independent retention policies:

```javascript
// Prune uptime namespace (30 days)
const uptimePlugin = new ReconPlugin({
  namespace: 'uptime',
  behaviors: {
    uptime: {
      retainHistory: 30 * 24 * 60 * 60 * 1000  // 30 days
    }
  }
});

// Prune audit namespace (365 days - compliance requirement)
const auditPlugin = new ReconPlugin({
  namespace: 'audit',
  storage: {
    historyLimit: 365  // Keep 1 year of audit reports
  }
});
```

### Migration Between Namespaces

```javascript
// Move data from default to uptime namespace
const defaultPlugin = new ReconPlugin({ namespace: 'default' });
const uptimePlugin = new ReconPlugin({ namespace: 'uptime' });

await db.usePlugin(defaultPlugin);
await db.usePlugin(uptimePlugin);

// Copy targets
const targets = await defaultPlugin.listTargets();
for (const target of targets) {
  await uptimePlugin.addTarget(target.target, {
    enabled: target.enabled,
    metadata: target.metadata
  });
}

// Copy reports (if needed)
const defaultReportsResource = await db.getResource('plg_recon_reports');
const uptimeReportsResource = await db.getResource('plg_recon_uptime_reports');

const reports = await defaultReportsResource.list({ limit: 1000 });
for (const report of reports) {
  await uptimeReportsResource.insert(report);
}

console.log('✅ Migration complete');
```

### Delete Namespace

```javascript
// WARNING: Deletes all data in namespace!

const plugin = new ReconPlugin({ namespace: 'old-namespace' });
await db.usePlugin(plugin);

// Delete all resources
const resourceConfigs = getAllResourceConfigs();
for (const config of resourceConfigs) {
  const resourceName = `plg_recon_old-namespace_${config.name.replace('plg_recon_', '')}`;
  await db.deleteResource(resourceName);
}

// Delete all storage keys
const storage = plugin.getStorage();
const baseKey = storage.getPluginKey(null, 'old-namespace');
const allKeys = await storage.list(baseKey);

for (const key of allKeys) {
  await storage.delete(key);
}

console.log('✅ Namespace deleted');
```

---

## 📚 Related Documentation

- [Uptime Behavior Overview](./recon-uptime-behavior.md)
- [Uptime 20s Checks + 1-Minute Aggregation](./recon-uptime-aggregation.md)
- [Storage Architecture](./recon-storage-insights.md)
- [Architecture Fixes](./recon-architecture-fixes.md)
- [Multi-Instance Example](../examples/e45-recon-multi-instance.js)

---

**Status**: ✅ Implemented and production-ready
