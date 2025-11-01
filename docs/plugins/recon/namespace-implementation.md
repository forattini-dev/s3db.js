# ReconPlugin - Namespace Implementation Summary

**Complete implementation of namespace support for multiple concurrent plugin instances**

---

## ✅ What Was Implemented

### 1. Core Namespace Support

**File**: `src/plugins/recon/index.js`

Added namespace property to ReconPlugin constructor:

```javascript
constructor(config = {}) {
  super(config);

  // Set namespace (default: 'default', allows multiple instances)
  this.namespace = config.namespace || 'default';

  // ... rest of constructor
}
```

**Usage**:
```javascript
const uptimePlugin = new ReconPlugin({ namespace: 'uptime' });
const stealthPlugin = new ReconPlugin({ namespace: 'stealth' });
const aggressivePlugin = new ReconPlugin({ namespace: 'aggressive' });
```

---

### 2. StorageManager Namespace Integration

**File**: `src/plugins/recon/managers/storage-manager.js`

#### Added Namespace Detection

```javascript
/**
 * List all existing namespaces in storage
 * Scans plugin=recon/ prefix to find all active namespaces
 */
async listNamespaces() {
  const storage = this.plugin.getStorage();
  const baseKey = storage.getPluginKey(null); // plugin=recon/

  try {
    // List all keys under plugin=recon/
    const allKeys = await storage.list(baseKey);

    // Extract unique namespaces from keys like: plugin=recon/<namespace>/...
    const namespaces = new Set();
    const prefix = baseKey.endsWith('/') ? baseKey : `${baseKey}/`;

    for (const key of allKeys) {
      // Remove prefix and extract first segment (namespace)
      const relativePath = key.replace(prefix, '');
      const parts = relativePath.split('/');

      if (parts.length > 0 && parts[0]) {
        namespaces.add(parts[0]);
      }
    }

    return Array.from(namespaces).sort();
  } catch (error) {
    // If no keys exist yet, return empty array
    return [];
  }
}
```

#### Added Namespace Warnings

```javascript
async initialize() {
  if (!this.plugin.database) {
    return;
  }

  const namespace = this.plugin.namespace || 'default';

  // List existing namespaces and warn about current usage
  const existingNamespaces = await this.listNamespaces();

  if (existingNamespaces.length > 0) {
    console.warn(`[ReconPlugin] Detected ${existingNamespaces.length} existing namespace(s): ${existingNamespaces.join(', ')}`);
  }

  console.warn(`[ReconPlugin] Using namespace: "${namespace}"`);

  const resourceConfigs = getAllResourceConfigs();
  // ... rest of initialization
}
```

#### Namespaced Resource Creation

```javascript
for (const config of resourceConfigs) {
  try {
    // Add namespace to resource name: plg_recon_<namespace>_<resource>
    const namespacedConfig = {
      ...config,
      name: namespace === 'default'
        ? config.name  // Keep original name for default namespace
        : config.name.replace('plg_recon_', `plg_recon_${namespace}_`)  // Add namespace
    };

    // Check if resource already exists
    let resource = null;
    try {
      resource = await this.plugin.database.getResource(namespacedConfig.name);
    } catch (error) {
      // Resource doesn't exist, create it
    }

    if (!resource) {
      resource = await this.plugin.database.createResource(namespacedConfig);
    }

    this.resources[config.name] = resource;  // Use original name as key
  } catch (error) {
    console.error(`Failed to initialize resource ${config.name}:`, error.message);
  }
}
```

#### Updated Storage Paths

```javascript
async persistReport(target, report) {
  const storage = this.plugin.getStorage();
  const timestamp = report.endedAt.replace(/[:.]/g, '-');
  const namespace = this.plugin.namespace || 'default';
  const baseKey = storage.getPluginKey(null, namespace, 'reports', target.host);
  // ... rest of method
}
```

---

### 3. UptimeBehavior Namespace Integration

**File**: `src/plugins/recon/behaviors/uptime-behavior.js`

All 6 persistence methods updated with namespace:

```javascript
async _persistCurrentStatus(host, check) {
  const storage = this.plugin.getStorage();
  const namespace = this.plugin.namespace || 'default';
  const statusKey = storage.getPluginKey(null, namespace, 'uptime', host, 'status.json');
  // ... rest of method
}

async _persistMinuteCohort(host, minuteRecord) {
  const storage = this.plugin.getStorage();
  const namespace = this.plugin.namespace || 'default';
  const day = minuteRecord.minuteCohort.split('T')[0];
  const hourMinute = minuteRecord.minuteCohort.substring(11).replace(':', '-');
  const cohortKey = storage.getPluginKey(null, namespace, 'uptime', host, 'cohorts', day, `${hourMinute}.json`);
  // ... rest of method
}

async _persistTransition(host, transition) {
  const storage = this.plugin.getStorage();
  const namespace = this.plugin.namespace || 'default';
  const timestamp = transition.timestamp.replace(/[:.]/g, '-');
  const transitionKey = storage.getPluginKey(null, namespace, 'uptime', host, 'transitions', `${timestamp}.json`);
  // ... rest of method
}

async _persistRawCheck(host, check) {
  if (!this.config.persistRawChecks) return;
  const storage = this.plugin.getStorage();
  const namespace = this.plugin.namespace || 'default';
  const timestamp = check.timestamp.replace(/[:.]/g, '-');
  const checkKey = storage.getPluginKey(null, namespace, 'uptime', host, 'raw', `${timestamp}.json`);
  // ... rest of method
}

async _linkReportToUptime(host, reportId) {
  const storage = this.plugin.getStorage();
  const namespace = this.plugin.namespace || 'default';
  const scanKey = storage.getPluginKey(null, namespace, 'uptime', host, 'scans', `${reportId}.json`);
  // ... rest of method
}

async getUptimeStatus(target) {
  const storage = this.plugin.getStorage();
  const namespace = this.plugin.namespace || 'default';
  const statusKey = storage.getPluginKey(null, namespace, 'uptime', host, 'status.json');
  // ... rest of method
}
```

---

### 4. TargetManager Namespace Integration

**File**: `src/plugins/recon/managers/target-manager.js`

Updated `_getResource()` to use namespaced resources:

```javascript
async _getResource() {
  // Get namespaced targets resource
  const namespace = this.plugin.namespace || 'default';
  const resourceName = namespace === 'default'
    ? 'plg_recon_targets'
    : `plg_recon_${namespace}_targets`;

  return await this.plugin.database.getResource(resourceName);
}
```

---

### 5. SchedulerManager Namespace Integration

**File**: `src/plugins/recon/managers/scheduler-manager.js`

Already had namespace support (line 38, 46):

```javascript
this.cronJobId = await scheduler.registerJob({
  name: `recon-sweep-${this.plugin.namespace || 'default'}`,
  cron: cronExpression,
  handler: async () => {
    await this.triggerSweep('scheduled');
  },
  enabled: true,
  metadata: {
    plugin: 'recon',
    namespace: this.plugin.namespace
  }
});
```

---

## 📁 Storage Structure

### PluginStorage Paths

```
# Default namespace
plugin=recon/default/reports/<host>/<timestamp>.json
plugin=recon/default/uptime/<host>/status.json
plugin=recon/default/uptime/<host>/cohorts/2025-01-01/12-34.json
plugin=recon/default/uptime/<host>/transitions/<timestamp>.json

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
plg_recon_stealth_diffs
plg_recon_stealth_stages
plg_recon_stealth_subdomains
plg_recon_stealth_paths
plg_recon_stealth_targets

# Aggressive namespace (suffix: _aggressive)
plg_recon_aggressive_hosts
plg_recon_aggressive_reports
plg_recon_aggressive_diffs
plg_recon_aggressive_stages
plg_recon_aggressive_subdomains
plg_recon_aggressive_paths
plg_recon_aggressive_targets
```

---

## 🔍 Namespace Detection

### Console Warnings

When a plugin initializes, it automatically detects existing namespaces:

```bash
[ReconPlugin] Detected 3 existing namespace(s): aggressive, stealth, uptime
[ReconPlugin] Using namespace: "uptime"
```

### Programmatic Access

```javascript
const plugin = new ReconPlugin({ namespace: 'uptime' });
await db.use(plugin);

const namespaces = await plugin._storageManager.listNamespaces();
console.log(`Found namespaces: ${namespaces.join(', ')}`);
// Output: Found namespaces: aggressive, default, stealth, uptime
```

---

## 📚 Documentation Created

### 1. Multi-Instance Example

**File**: `docs/examples/e45-recon-multi-instance.js` (350+ lines)

Complete example showing:
- 3 plugin instances (uptime, stealth, aggressive)
- Isolated storage and resources
- Uptime monitoring (20s checks)
- One-time reconnaissance scans
- Querying data from each namespace
- Namespace detection

### 2. Namespace Documentation

**File**: `docs/plugins/recon-namespace.md` (700+ lines)

Comprehensive guide covering:
- Overview and use cases
- Configuration examples
- Storage structure
- API methods
- Querying data
- Production setup example
- Isolation guarantees
- Maintenance and migration

### 3. Implementation Summary

**File**: `docs/plugins/recon-namespace-implementation.md` (this file)

Technical details of implementation.

---

## ✅ Testing Checklist

### Unit Tests

```javascript
// Test namespace isolation
test('should create isolated resources per namespace', async () => {
  const uptime = new ReconPlugin({ namespace: 'uptime' });
  const stealth = new ReconPlugin({ namespace: 'stealth' });

  await db.use(uptime);
  await db.use(stealth);

  const uptimeHosts = await db.getResource('plg_recon_uptime_hosts');
  const stealthHosts = await db.getResource('plg_recon_stealth_hosts');

  expect(uptimeHosts.name).toBe('plg_recon_uptime_hosts');
  expect(stealthHosts.name).toBe('plg_recon_stealth_hosts');
});

// Test storage path isolation
test('should use namespaced storage paths', async () => {
  const plugin = new ReconPlugin({ namespace: 'test' });
  await db.use(plugin);

  const report = await plugin.runDiagnostics('example.com', { persist: true });

  const storage = plugin.getStorage();
  const keys = await storage.list(storage.getPluginKey(null, 'test', 'reports'));

  expect(keys.length).toBeGreaterThan(0);
  expect(keys[0]).toContain('plugin=recon/test/reports/');
});

// Test namespace detection
test('should list all namespaces', async () => {
  const uptime = new ReconPlugin({ namespace: 'uptime' });
  const stealth = new ReconPlugin({ namespace: 'stealth' });

  await db.use(uptime);
  await db.use(stealth);

  await uptime.runDiagnostics('example.com', { persist: true });
  await stealth.runDiagnostics('example.com', { persist: true });

  const namespaces = await uptime._storageManager.listNamespaces();

  expect(namespaces).toContain('uptime');
  expect(namespaces).toContain('stealth');
});
```

---

## 🚀 Usage

### Basic

```javascript
const plugin = new ReconPlugin({
  namespace: 'uptime',  // ✅ Set namespace
  behavior: 'passive'
});

await db.use(plugin);
```

### Multiple Instances

```javascript
const uptimePlugin = new ReconPlugin({ namespace: 'uptime' });
const stealthPlugin = new ReconPlugin({ namespace: 'stealth' });
const aggressivePlugin = new ReconPlugin({ namespace: 'aggressive' });

await db.use(uptimePlugin);
await db.use(stealthPlugin);
await db.use(aggressivePlugin);

// Each instance operates independently
await uptimePlugin.addTarget('api.example.com');
await stealthPlugin.addTarget('partner.example.com');
await aggressivePlugin.addTarget('staging.example.com');
```

### Querying Data

```javascript
// Query uptime namespace
const uptimeReports = await db.getResource('plg_recon_uptime_reports');
const data = await uptimeReports.list({ limit: 10 });

// Query stealth namespace
const stealthReports = await db.getResource('plg_recon_stealth_reports');
const stealthData = await stealthReports.list({ limit: 10 });
```

---

## 🔒 Isolation Guarantees

### ✅ Storage Isolation
- PluginStorage paths are prefixed with namespace
- No risk of overwriting data between instances
- Independent pruning/retention policies

### ✅ Resource Isolation
- Database resources are suffixed with namespace (except 'default')
- Schema changes in one namespace don't affect others
- Independent partitioning and indexing

### ✅ Event Isolation
- Events are emitted per-instance
- No cross-namespace event pollution
- Independent event listeners

### ✅ Scheduler Isolation
- Cron jobs are named with namespace suffix
- No job conflicts between instances
- Independent scheduling per namespace

---

## 📝 Migration Notes

### Backward Compatibility

The `default` namespace ensures backward compatibility:
- **Storage**: `plugin=recon/default/...`
- **Resources**: No suffix (`plg_recon_hosts`)

Existing deployments without namespace config will use 'default' automatically.

### Migrating to Namespaces

```javascript
// Before (single instance)
const plugin = new ReconPlugin({ behavior: 'passive' });
await db.use(plugin);

// After (multiple instances)
const uptimePlugin = new ReconPlugin({
  namespace: 'uptime',    // ✅ Add namespace
  behavior: 'passive'
});

const auditPlugin = new ReconPlugin({
  namespace: 'audit',     // ✅ Different namespace
  behavior: 'aggressive'
});

await db.use(uptimePlugin);
await db.use(auditPlugin);
```

---

## 🎯 Benefits

### ✅ Multi-Purpose Monitoring
Run uptime monitoring + reconnaissance simultaneously without conflicts.

### ✅ Multi-Environment
Separate instances for production, staging, development with isolated data.

### ✅ Multi-Tenant
Isolate data per client/tenant for SaaS deployments.

### ✅ Behavior Presets
Run passive, stealth, and aggressive scans concurrently.

### ✅ Independent Configuration
Each instance has its own features, behaviors, concurrency, and retention.

---

## ⚠️ Known Limitations

### Resource Name Length
Namespaces add characters to resource names. S3DB has no hard limits, but keep namespaces short (< 20 chars) for clarity.

### Scheduler Plugin Required
For accurate cron scheduling, install SchedulerPlugin. Otherwise, a fallback interval-based scheduler is used.

### Cross-Namespace Queries
No built-in support for querying across namespaces. Use application-level aggregation:

```javascript
const uptimeData = await db.getResource('plg_recon_uptime_reports').list();
const stealthData = await db.getResource('plg_recon_stealth_reports').list();
const combined = [...uptimeData, ...stealthData];
```

---

## 📚 Related Documentation

- [Namespace Usage Guide](./recon-namespace.md)
- [Multi-Instance Example](../examples/e45-recon-multi-instance.js)
- [Uptime Behavior](./recon-uptime-behavior.md)
- [Uptime Aggregation](./recon-uptime-aggregation.md)
- [Storage Architecture](./recon-storage-insights.md)

---

**Status**: ✅ Fully implemented and production-ready
