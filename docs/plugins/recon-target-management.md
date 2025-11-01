# Recon Plugin - Dynamic Target Management

**Add, remove, and update reconnaissance targets at runtime without restarting the plugin.**

---

## Overview

The ReconPlugin supports **dynamic target management**, allowing you to:

- ✅ Start with **zero targets** and add them on-demand
- ✅ Add/remove targets via **API or programmatically**
- ✅ Configure **per-target** behavior modes, features, and schedules
- ✅ Track scan history and metadata for each target
- ✅ Enable/disable targets without deleting them
- ✅ Organize targets with **tags** and custom metadata

---

## Quick Start

### Initialize with Zero Targets

```javascript
const plugin = new ReconPlugin({
  behavior: 'passive',
  schedule: {
    enabled: true,
    cron: '0 */6 * * *' // every 6 hours
  },
  targets: [] // Start empty!
});

await db.installPlugin(plugin);
await plugin.start();
```

### Add Targets Dynamically

```javascript
// Add a simple target
await plugin.addTarget('example.com');

// Add with configuration
await plugin.addTarget('api.example.com', {
  behavior: 'stealth',
  enabled: true,
  features: { certificate: true, ports: { nmap: true } },
  tools: ['dns', 'certificate', 'ports'],
  metadata: { owner: 'DevOps Team', criticality: 'high' },
  tags: ['production', 'api']
});

// Add subdomain with custom schedule
await plugin.addTarget('staging.example.com', {
  behavior: 'aggressive',
  enabled: false, // disabled until ready
  schedule: {
    enabled: true,
    cron: '0 2 * * *' // daily at 2am
  },
  tags: ['staging']
});
```

---

## API Methods

### `addTarget(target, options)`

Add a new target to the monitoring list.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` | `string` | Domain, subdomain, hostname, or IP address |
| `options.enabled` | `boolean` | Whether target is active (default: `true`) |
| `options.behavior` | `string` | Behavior mode: `passive`, `stealth`, `aggressive` |
| `options.features` | `object` | Feature toggles (overrides behavior defaults) |
| `options.tools` | `string[]` | Specific tools to run for this target |
| `options.schedule` | `object` | Per-target schedule config |
| `options.metadata` | `object` | Custom metadata (owner, criticality, etc.) |
| `options.tags` | `string[]` | Tags for filtering and organization |
| `options.addedBy` | `string` | Who/what added this target (default: `'manual'`) |

**Returns:** `Promise<Target>` - The created target record

**Example:**

```javascript
const target = await plugin.addTarget('example.com', {
  behavior: 'stealth',
  enabled: true,
  metadata: { owner: 'Security Team' },
  tags: ['production', 'public-facing']
});

console.log(target.id); // 'example.com'
console.log(target.scanCount); // 0
```

**Events:**
- Emits `recon:target-added` with `{ targetId, target, enabled, behavior }`

---

### `removeTarget(target)`

Remove a target from the monitoring list.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` | `string` | Target ID or original target string |

**Returns:** `Promise<{ targetId, removed: true }>`

**Example:**

```javascript
await plugin.removeTarget('staging.example.com');
// Target removed from both resource and in-memory list
```

**Events:**
- Emits `recon:target-removed` with `{ targetId, target }`

---

### `updateTarget(target, updates)`

Update target configuration.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` | `string` | Target ID or original target string |
| `updates` | `object` | Fields to update (partial update) |

**Returns:** `Promise<Target>` - Updated target record

**Example:**

```javascript
// Enable a disabled target
await plugin.updateTarget('staging.example.com', { enabled: true });

// Change behavior mode
await plugin.updateTarget('example.com', { behavior: 'aggressive' });

// Update metadata
await plugin.updateTarget('api.example.com', {
  metadata: { owner: 'Platform Team', sla: '99.9%' },
  tags: ['production', 'api', 'critical']
});
```

**Events:**
- Emits `recon:target-updated` with `{ targetId, updates }`

---

### `listTargets(options)`

List all configured targets.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.includeDisabled` | `boolean` | `true` | Include disabled targets |
| `options.fromResource` | `boolean` | `true` | Load from resource (vs config) |
| `options.limit` | `number` | `1000` | Max targets to return |

**Returns:** `Promise<Target[]>`

**Example:**

```javascript
// All targets
const all = await plugin.listTargets();

// Only enabled targets
const enabled = await plugin.listTargets({ includeDisabled: false });

// Filter manually by tags
const production = all.filter(t => t.tags.includes('production'));
```

---

### `getTarget(target)`

Get details of a specific target.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` | `string` | Target ID or original target string |

**Returns:** `Promise<Target | null>`

**Example:**

```javascript
const target = await plugin.getTarget('example.com');

console.log(target.id); // 'example.com'
console.log(target.scanCount); // 5
console.log(target.lastScanAt); // '2025-01-01T00:05:00.000Z'
console.log(target.lastScanStatus); // 'ok'
```

---

## Target Record Structure

```typescript
type Target = {
  id: string;                    // Normalized host (e.g., 'example.com')
  target: string;                // Original input (e.g., 'https://example.com')
  enabled: boolean;              // Active in scheduled sweeps
  behavior: string;              // 'passive' | 'stealth' | 'aggressive'
  features: object;              // Feature toggles
  tools: string[];               // Specific tools to run
  schedule: {
    enabled: boolean;
    cron: string;
    nextRun: string | null;
  };
  metadata: object;              // Custom metadata
  lastScanAt: string | null;     // ISO timestamp of last scan
  lastScanStatus: string | null; // 'ok' | 'partial' | 'error'
  scanCount: number;             // Total scans performed
  addedBy: string;               // Source: 'manual', 'api', 'discovery'
  tags: string[];                // Tags for filtering
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
};
```

---

## REST API Routes

When integrated with `ApiPlugin`, the following routes are available:

### `GET /recon/targets`

List all targets.

**Query Parameters:**
- `includeDisabled` (boolean, default: `true`) - Include disabled targets
- `limit` (number, default: `1000`, max: `5000`) - Max results

**Response:**
```json
{
  "success": true,
  "data": {
    "targets": [
      {
        "id": "example.com",
        "target": "https://example.com",
        "enabled": true,
        "behavior": "stealth",
        "scanCount": 12,
        "lastScanAt": "2025-01-01T00:05:00.000Z",
        "tags": ["production"]
      }
    ],
    "total": 1,
    "includeDisabled": true
  }
}
```

---

### `GET /recon/targets/:targetId`

Get specific target details.

**Response:**
```json
{
  "success": true,
  "data": {
    "target": {
      "id": "example.com",
      "target": "https://example.com",
      "enabled": true,
      "behavior": "stealth",
      "features": {},
      "tools": [],
      "schedule": { "enabled": true, "cron": "0 */6 * * *" },
      "metadata": { "owner": "DevOps" },
      "scanCount": 12,
      "lastScanAt": "2025-01-01T00:05:00.000Z",
      "lastScanStatus": "ok",
      "tags": ["production"],
      "addedBy": "api",
      "createdAt": "2024-12-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:05:00.000Z"
    }
  }
}
```

---

### `POST /recon/targets`

Add a new target.

**Request Body:**
```json
{
  "target": "api.example.com",
  "enabled": true,
  "behavior": "stealth",
  "features": { "certificate": true },
  "tools": ["dns", "certificate", "ping"],
  "schedule": { "enabled": true, "cron": "0 */4 * * *" },
  "metadata": { "owner": "Platform Team" },
  "tags": ["production", "api"],
  "addedBy": "automation"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "target": { "id": "api.example.com", ... }
  }
}
```

---

### `PATCH /recon/targets/:targetId`

Update target configuration.

**Request Body:**
```json
{
  "enabled": false,
  "metadata": { "reason": "maintenance" }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "target": { "id": "api.example.com", "enabled": false, ... }
  }
}
```

---

### `DELETE /recon/targets/:targetId`

Remove target.

**Response:**
```json
{
  "success": true,
  "data": {
    "targetId": "api.example.com",
    "removed": true
  }
}
```

---

### `POST /recon/targets/:targetId/scan`

Trigger immediate scan on a specific target.

**Request Body (optional):**
```json
{
  "features": { "certificate": true, "ports": { "nmap": true } },
  "tools": ["dns", "certificate", "ports"],
  "persist": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "report": { "status": "ok", "fingerprint": { ... } },
    "target": { "id": "api.example.com", "scanCount": 13, ... }
  }
}
```

---

## Scheduler Integration

### How Scheduled Sweeps Work

1. Plugin starts with `schedule.enabled: true` and a cron expression
2. On schedule trigger, `_triggerScheduledSweep()` runs:
   ```javascript
   const activeTargets = await plugin.listTargets({ includeDisabled: false });
   // Scans all enabled targets in parallel
   ```
3. After each scan, target metadata is updated:
   ```javascript
   await plugin.updateTarget(target, {
     lastScanAt: report.endedAt,
     lastScanStatus: report.status,
     scanCount: currentCount + 1
   });
   ```
4. Events emitted:
   - `recon:sweep-started` - Before sweep begins
   - `recon:completed` - After each target scan
   - `recon:target-error` - If target scan fails
   - `recon:sweep-completed` - After all targets scanned
   - `recon:no-active-targets` - If no enabled targets

**Example Event Handling:**

```javascript
plugin.on('recon:sweep-started', ({ targetCount, targets }) => {
  console.log(`Starting sweep of ${targetCount} targets: ${targets.join(', ')}`);
});

plugin.on('recon:completed', ({ target, status, scanCount }) => {
  console.log(`✅ ${target}: ${status} (scan #${scanCount})`);
});

plugin.on('recon:target-error', ({ target, message }) => {
  console.error(`❌ ${target} failed: ${message}`);
  // Send alert, disable target, etc.
});
```

---

## Use Cases

### 1. **Subdomain Discovery Pipeline**

```javascript
// Start with root domain
await plugin.addTarget('example.com', { behavior: 'passive' });

// Run discovery
const report = await plugin.runDiagnostics('example.com');

// Add discovered subdomains dynamically
for (const subdomain of report.fingerprint.subdomains || []) {
  await plugin.addTarget(subdomain, {
    behavior: 'passive',
    tags: ['auto-discovered', 'subdomain'],
    addedBy: 'discovery-pipeline'
  });
}
```

### 2. **On-Demand Client Scans**

```javascript
// API endpoint receives client request
app.post('/api/scan-domain', async (req, res) => {
  const { domain } = req.body;

  // Add target temporarily
  await plugin.addTarget(domain, {
    enabled: false, // don't include in scheduled sweeps
    behavior: 'passive',
    metadata: { clientId: req.user.id },
    tags: ['client-requested']
  });

  // Run immediate scan
  const report = await plugin.runDiagnostics(domain, { persist: true });

  res.json({ report });
});
```

### 3. **Multi-Tenant Monitoring**

```javascript
// Add targets per customer
const customers = ['acme.com', 'widgets.inc', 'example.org'];

for (const domain of customers) {
  await plugin.addTarget(domain, {
    behavior: 'stealth',
    metadata: {
      customerId: getCustomerId(domain),
      tier: 'premium',
      sla: '99.9%'
    },
    tags: ['customer', 'premium']
  });
}

// Filter by customer
const premiumTargets = (await plugin.listTargets())
  .filter(t => t.metadata.tier === 'premium');
```

### 4. **Graceful Decommissioning**

```javascript
// Disable target instead of removing (keeps history)
await plugin.updateTarget('old-site.example.com', {
  enabled: false,
  metadata: { status: 'decommissioned', reason: 'Migrated to new domain' }
});

// Later, remove completely
await plugin.removeTarget('old-site.example.com');
```

---

## Best Practices

1. **Start Small**: Initialize with zero targets, add as needed
2. **Use Tags**: Organize targets with `tags` for easy filtering
3. **Metadata is Flexible**: Store custom data (owner, SLA, criticality, etc.)
4. **Disable vs Remove**: Disable targets to pause scanning while keeping history
5. **Per-Target Configs**: Override behavior/features per target for granular control
6. **Track Sources**: Use `addedBy` to track how targets were discovered
7. **Monitor Events**: Listen to `recon:*` events for operational visibility
8. **API Integration**: Expose REST endpoints for external systems to manage targets

---

## Events Reference

| Event | Payload | Description |
|-------|---------|-------------|
| `recon:target-added` | `{ targetId, target, enabled, behavior }` | Target added |
| `recon:target-removed` | `{ targetId, target }` | Target removed |
| `recon:target-updated` | `{ targetId, updates }` | Target updated |
| `recon:sweep-started` | `{ reason, targetCount, targets }` | Scheduled sweep started |
| `recon:sweep-completed` | `{ reason, targetCount }` | Sweep finished |
| `recon:no-active-targets` | `{ reason, message }` | No enabled targets to scan |
| `recon:completed` | `{ target, status, scanCount }` | Individual scan completed |
| `recon:target-error` | `{ target, message, error }` | Scan failed |

---

## Storage

Targets are persisted in the `plg_recon_targets` resource:

```
resource=plg_recon_targets/
├── example.com.json
├── api.example.com.json
└── staging.example.com.json
```

Each record contains the full target configuration, scan history metadata, and custom metadata.

**Query targets via resource:**

```javascript
const targetsResource = await db.resources.plg_recon_targets;

// Get all production targets
const production = await targetsResource.query({ tags: 'production' });

// Get targets by owner
const devOpsTargets = await targetsResource.query({ 'metadata.owner': 'DevOps Team' });

// Get targets with high scan counts
const active = await targetsResource.query({ scanCount: { $gte: 10 } });
```

---

## Examples

- **Programmatic**: `docs/examples/e47-recon-dynamic-targets.js`
- **API Integration**: See `docs/plugins/recon.md` → API Integration

---

## Migration from Static Targets

**Before** (static config):

```javascript
new ReconPlugin({
  targets: [
    'example.com',
    'api.example.com',
    { target: 'staging.example.com', features: { ... } }
  ]
});
```

**After** (dynamic management):

```javascript
const plugin = new ReconPlugin({ targets: [] });
await db.installPlugin(plugin);

// Add targets at runtime
await plugin.addTarget('example.com');
await plugin.addTarget('api.example.com');
await plugin.addTarget('staging.example.com', { features: { ... } });
```

**Benefits:**
- ✅ No plugin restart needed
- ✅ Targets persist in database
- ✅ Track scan history per target
- ✅ Add/remove via API or code
- ✅ Enable/disable without losing configuration

---

Happy monitoring! 🎯
