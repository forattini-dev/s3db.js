# ⏱️ TTL Plugin v2

## ⚡ TLDR

**Automatic Time-To-Live cleanup** with partition-based indexing for O(1) performance.

**1 line to get started:**
```javascript
plugins: [new TTLPlugin({ resources: { sessions: { ttl: 86400, onExpire: 'soft-delete' } } })]
```

**Key features:**
- ✅ **O(1) cleanup via partition-based expiration index**
- ✅ **Zero full scans** - indexes records by expiration cohorts
- ✅ **Auto-granularity detection** (minute, hour, day, week)
- ✅ **Multiple intervals** - different cleanup frequencies per granularity
- ✅ 4 expiration strategies (soft-delete, hard-delete, archive, callback)
- ✅ Simple API - just TTL in most cases (auto-detects `_createdAt`)
- ✅ Event monitoring & statistics

**When to use:**
- 🗑️ Auto-delete temporary/session data
- 📦 Archive old records automatically
- 🧹 Cleanup expired uploads/caches
- 📊 Maintain database hygiene
- ⏰ Time-based data lifecycle management

**Access:**
```javascript
const stats = ttlPlugin.getStats();
console.log('Total expired:', stats.totalExpired);
console.log('Total deleted:', stats.totalDeleted);
```

---

## 🚀 Quick Start

```javascript
import { S3db, TTLPlugin } from 's3db.js';

// 1. Setup database with TTLPlugin
const db = new S3db({
  connectionString: "s3://KEY:SECRET@bucket/path",
  plugins: [
    new TTLPlugin({
      batchSize: 100,
      verbose: true,

      resources: {
        // Sessions expire after 24 hours (uses _createdAt by default)
        sessions: {
          ttl: 86400,              // 24 hours in seconds
          onExpire: 'soft-delete'  // Mark as deleted
        },

        // Temp uploads auto-delete after 1 hour
        temp_uploads: {
          ttl: 3600,               // 1 hour
          onExpire: 'hard-delete'  // Permanently remove
        },

        // Archive old orders after 30 days
        old_orders: {
          ttl: 2592000,            // 30 days
          onExpire: 'archive',
          archiveResource: 'archive_orders'
        },

        // Custom expiration field
        subscriptions: {
          field: 'endsAt',         // Absolute expiration date
          onExpire: 'soft-delete'
        }
      }
    })
  ]
});

await db.connect();

// 2. Records are automatically cleaned up!
// - Plugin creates expiration index with partitions
// - Automatic cleanup runs at intervals based on TTL granularity
// - Zero full scans - O(1) cleanup via partitions

// 3. Check statistics anytime
const stats = db.plugins.find(p => p.constructor.name === 'TTLPlugin').getStats();
console.log('Total scans:', stats.totalScans);
console.log('Total expired:', stats.totalExpired);
console.log('Last scan:', stats.lastScanAt);
```

---

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [📖 Overview](#overview)
- [✨ Key Features](#key-features)
- [⚙️ Configuration Options](#configuration-options)
- [💡 Expiration Strategies](#expiration-strategies)
  - [Soft Delete](#1-soft-delete)
  - [Hard Delete](#2-hard-delete)
  - [Archive](#3-archive)
  - [Callback](#4-callback)
- [📊 Usage Examples](#usage-examples)
- [📚 API Reference](#api-reference)
- [🎯 Events](#events)
- [✅ Best Practices](#best-practices)
- [❓ FAQ](#-faq)

---

## Overview

The **TTL (Time-To-Live) Plugin v2** automatically removes or archives expired records with **O(1) performance** using partition-based indexing. Unlike traditional TTL implementations that scan all records, v2 uses an expiration index to achieve zero full scans.

### How It Works

1. **Plugin Storage**: Creates `plg_ttl_expiration_index` resource with partition on `expiresAtCohort`
2. **Auto-Indexing**: Hooks into insert/delete to maintain expiration index automatically
3. **Cohort Partitioning**: Groups records by expiration time (e.g., `2024-10-25T14` for hour granularity)
4. **Granularity Auto-Detection**: Chooses optimal granularity (minute/hour/day/week) based on TTL
5. **Multiple Intervals**: Different cleanup frequencies for each granularity
6. **O(1) Cleanup**: Queries partitions (not full scans) to find expired records
7. **Strategy Execution**: Processes expired records based on configured strategy
8. **Batch Processing**: Handles large datasets efficiently in batches

### Architecture Highlights

**Granularities & Intervals:**
- `minute` (TTL < 1 hour): Check every 10 seconds, check last 3 minutes
- `hour` (TTL < 24 hours): Check every 10 minutes, check last 2 hours
- `day` (TTL < 30 days): Check every 1 hour, check last 2 days
- `week` (TTL ≥ 30 days): Check every 24 hours, check last 2 weeks

**Performance:**
- No full scans - only partition queries
- O(1) lookup for expired records
- 10-100x faster than traditional TTL scanning

> 💡 **Perfect for Data Lifecycle Management**: Automatically maintain database hygiene by removing or archiving expired data with minimal S3 API calls.

---

## Key Features

### 🎯 Core Features
- **Automatic Cleanup**: Periodic scanning without manual intervention
- **Multiple Strategies**: Choose soft-delete, hard-delete, archive, or custom callback
- **Resource-Specific Config**: Different TTL rules per resource
- **Flexible Expiration Fields**: Use any timestamp field (createdAt, expiresAt, etc.)
- **Batch Processing**: Efficient handling of large datasets

### 🔧 Technical Features
- **Event Monitoring**: Track cleanup progress via events
- **Statistics Tracking**: Comprehensive stats on cleanups performed
- **Error Handling**: Graceful failure handling with error events
- **Configurable Intervals**: Adjust scan frequency to your needs
- **Manual Triggers**: Force cleanup for specific resources

---

## Configuration Options

### Plugin-Level Options

```javascript
new TTLPlugin({
  batchSize: 100,         // Process N records at a time (default: 100)
  verbose: true,          // Enable logging (default: false)
  resources: {            // Resource-specific configurations
    // ... resource configs
  }
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `batchSize` | number | 100 | Records to process per batch |
| `verbose` | boolean | false | Enable console logging |
| `resources` | object | {} | Resource-specific TTL configurations |

> **Note:** No `checkInterval` in v2! Intervals are automatically configured based on granularity.

### Resource-Level Options

```javascript
resources: {
  resource_name: {
    ttl: 86400,                    // Optional: TTL in seconds
    field: 'expiresAt',            // Optional: Field to check (default: '_createdAt')
    onExpire: 'soft-delete',       // Required: Strategy

    // Strategy-specific options:
    deleteField: 'deletedat',      // For soft-delete (default: 'deletedat')
    archiveResource: 'archive',    // For archive (required)
    keepOriginalId: true,          // For archive (default: false)
    callback: async (record) => {} // For callback (required)
  }
}
```

| Option | Type | Required | Strategy | Description |
|--------|------|----------|----------|-------------|
| `ttl` | number | ❌* | All | Time-to-live in seconds. Auto-detects granularity. |
| `field` | string | ❌ | All | Field containing timestamp (default: `_createdAt`) |
| `onExpire` | string | ✅ | All | Expiration strategy (`soft-delete`, `hard-delete`, `archive`, `callback`) |
| `deleteField` | string | ❌ | soft-delete | Field to mark deletion (default: `deletedat`) |
| `archiveResource` | string | ✅ | archive | Destination resource name |
| `keepOriginalId` | boolean | ❌ | archive | Keep original ID in archive (default: false) |
| `callback` | function | ✅ | callback | Custom cleanup function |

\* Either `ttl` or `field` must be specified. If both provided, `field` is used as base and TTL is added to it.

---

## Expiration Strategies

### 1. Soft Delete

Marks records as deleted without removing them from S3. Perfect for maintaining history.

```javascript
resources: {
  sessions: {
    ttl: 86400,                // 24 hours
    onExpire: 'soft-delete',   // Mark as deleted
    deleteField: 'deletedat'   // Optional: custom field (default: 'deletedat')
  }
}
```

**Behavior:**
- Updates record with `deleteField: <current timestamp>`
- Adds `isdeleted: 'true'` field automatically
- Record remains in S3
- Can be queried/undeleted if needed
- No data loss
- Cleanup is O(1) via plugin's expiration index

**Use When:**
- Need audit trail
- May need to restore data
- Compliance requires retention
- Soft deletion is acceptable

**Querying Soft-Deleted Records:**

```javascript
// Get all records (including soft-deleted)
const allRecords = await sessions.list();

// Filter active records
const activeRecords = allRecords.filter(r => r.isdeleted !== 'true');

// Filter deleted records
const deletedRecords = allRecords.filter(r => r.isdeleted === 'true');

// Query for specific records
const activeUser = await sessions.query({ email: 'user@example.com', isdeleted: 'false' });
```

> **Note:** If you need O(1) queries for active/deleted records, consider creating a manual partition on `isdeleted` field in your resource definition. See [Partitioning docs](../../README.md#partitions) for details.

### 2. Hard Delete

Permanently removes records from S3. Cannot be recovered.

```javascript
resources: {
  temp_uploads: {
    ttl: 3600,               // 1 hour
    field: 'createdAt',
    onExpire: 'hard-delete'
  }
}
```

**Behavior:**
- Calls `resource.delete(id)`
- Record completely removed from S3
- Cannot be recovered
- Frees storage immediately

**Use When:**
- No need to retain data
- Storage costs are a concern
- Data is truly temporary
- GDPR/privacy requirements

### 3. Archive

Copies records to another resource before deleting. Best of both worlds.

```javascript
resources: {
  old_orders: {
    ttl: 2592000,            // 30 days
    field: 'createdAt',
    onExpire: 'archive',
    archiveResource: 'archive_orders',
    keepOriginalId: false    // Generate new ID in archive
  }
}
```

**Behavior:**
- Inserts record into `archiveResource`
- Adds metadata: `archivedAt`, `archivedFrom`, `originalId`
- Hard-deletes from original resource
- Keeps data accessible in archive

**Use When:**
- Need data retention
- Want to keep main resource clean
- Storage is cheaper in archive
- Compliance requires archival

### 4. Callback

Custom logic for complex cleanup scenarios.

```javascript
resources: {
  complex_cleanup: {
    ttl: 7200,               // 2 hours
    field: 'expiresAt',
    onExpire: 'callback',
    callback: async (record, resource) => {
      // Custom cleanup logic
      if (record.status === 'paid') {
        await archiveToExternalSystem(record);
        return true;  // Delete after archiving
      } else {
        await sendReminderEmail(record);
        return false; // Keep for now
      }
    }
  }
}
```

**Behavior:**
- Calls your custom function
- Receives `(record, resource)` as parameters
- Return `true` to delete, `false` to keep
- Full control over cleanup logic

**Use When:**
- Need conditional logic
- External system integration
- Complex business rules
- Custom workflows

---

## Usage Examples

### Example 1: Session Management

```javascript
const ttlPlugin = new TTLPlugin({
  verbose: true,

  resources: {
    user_sessions: {
      ttl: 1800,                 // 30 minutes
      field: 'lastActivity',     // Expire relative to last activity
      onExpire: 'soft-delete',
      deleteField: 'loggedOut'
    }
  }
});

await db.usePlugin(ttlPlugin);

// Sessions auto-expire after 30 minutes of inactivity
// Auto-detected granularity: 'hour' (checks every 10 minutes)
```

### Example 2: Multi-Resource Cleanup

```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    // Temporary uploads - delete after 1 hour
    temp_files: {
      ttl: 3600,              // Granularity: 'hour'
      onExpire: 'hard-delete'
    },

    // Email verification codes - delete after 15 minutes
    verification_codes: {
      ttl: 900,               // Granularity: 'minute'
      onExpire: 'hard-delete'
    },

    // Password reset tokens - delete after 1 hour
    reset_tokens: {
      ttl: 3600,              // Granularity: 'hour'
      onExpire: 'hard-delete'
    }
  }
});

// Plugin automatically:
// - Runs 'minute' interval every 10 seconds (for verification_codes)
// - Runs 'hour' interval every 10 minutes (for temp_files & reset_tokens)
```

### Example 3: Archival with Analytics

```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    orders: {
      ttl: 7776000,  // 90 days
      field: 'completedAt',
      onExpire: 'callback',
      callback: async (order, resource) => {
        // Send to analytics before archiving
        await analyticsService.recordCompletion(order);
        
        // Archive to cold storage
        await archiveResource.insert({
          ...order,
          archivedAt: new Date().toISOString()
        });
        
        return true;  // Delete from main resource
      }
    }
  }
});
```

### Example 4: Manual Cleanup Trigger

```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    temp_data: {
      ttl: 3600,
      onExpire: 'hard-delete'
    }
  }
});

await db.usePlugin(ttlPlugin);

// Automatic cleanup runs every 10 minutes (hour granularity)
// But you can also manually trigger cleanup when needed:
const result = await ttlPlugin.cleanupResource('temp_data');
console.log(`Cleaned up resource: ${result.resource}`);

// Or cleanup all resources:
await ttlPlugin.runCleanup();
```

### Example 5: Monitoring with Events

```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    sessions: {
      ttl: 86400,
      field: 'expiresAt',
      onExpire: 'soft-delete'
    }
  }
});

// Monitor cleanup events
ttlPlugin.on('recordExpired', ({ resource, recordId, strategy }) => {
  console.log(`Record ${recordId} expired in ${resource} using ${strategy}`);
});

ttlPlugin.on('scanCompleted', ({ totalExpired, totalProcessed, duration }) => {
  console.log(`Scan completed: ${totalExpired} expired, ${totalProcessed} processed in ${duration}ms`);
});

ttlPlugin.on('cleanupError', ({ resource, error }) => {
  console.error(`Cleanup error in ${resource}:`, error);
});
```

---

## API Reference

### Plugin Methods

#### `getStats()`

Returns current plugin statistics.

```javascript
const stats = ttlPlugin.getStats();
```

**Returns:**
```javascript
{
  totalScans: 123,           // Total scans performed (across all granularities)
  totalExpired: 456,         // Total records found expired
  totalDeleted: 234,         // Total hard-deleted
  totalArchived: 100,        // Total archived
  totalSoftDeleted: 122,     // Total soft-deleted
  totalCallbacks: 45,        // Total callback executions
  totalErrors: 2,            // Total errors encountered
  lastScanAt: '2025-01-15T10:30:00Z',  // Last scan timestamp
  lastScanDuration: 1234,    // Last scan duration (ms)
  isRunning: true,           // Intervals running?
  intervals: 3,              // Number of active intervals
  resources: 3               // Number of configured resources
}
```

#### `runCleanup()`

Manually trigger a full cleanup cycle.

```javascript
await ttlPlugin.runCleanup();
```

**Returns:** `Promise<void>`

#### `cleanupResource(resourceName)`

Manually cleanup a specific resource.

```javascript
const result = await ttlPlugin.cleanupResource('sessions');

console.log(result);
// {
//   resource: 'sessions',
//   granularity: 'hour'
// }
```

**Parameters:**
- `resourceName` (string): Name of resource to cleanup

**Returns:** `Promise<{resource, granularity}>`

---

## Events

The TTL Plugin emits several events for monitoring:

### `installed`

Emitted when plugin is installed.

```javascript
ttlPlugin.on('installed', ({ plugin, resources }) => {
  console.log(`${plugin} installed with resources:`, resources);
});
```

### `recordExpired`

Emitted for each expired record processed.

```javascript
ttlPlugin.on('recordExpired', ({ resource, record }) => {
  console.log(`Record ${record.id} expired in ${resource}`);
});
```

### `scanCompleted`

Emitted after completing a granularity scan.

```javascript
ttlPlugin.on('scanCompleted', ({ granularity, duration, cohorts }) => {
  console.log(`${granularity} scan completed in ${duration}ms`);
  console.log(`Checked cohorts:`, cohorts);
});
```

### `cleanupError`

Emitted when cleanup fails.

```javascript
ttlPlugin.on('cleanupError', ({ granularity, error }) => {
  console.error(`Error in ${granularity} cleanup:`, error);
});
```

---

## Best Practices

### 1. Choose the Right Strategy

```javascript
// ✅ Good: Match strategy to use case
{
  sessions: { onExpire: 'soft-delete' },      // Audit trail
  temp_uploads: { onExpire: 'hard-delete' },  // No retention needed
  old_orders: { onExpire: 'archive' },        // Long-term storage
  special_cases: { onExpire: 'callback' }     // Complex logic
}

// ❌ Bad: Using wrong strategy
{
  sessions: { onExpire: 'hard-delete' },  // Lost audit trail!
  temp_files: { onExpire: 'archive' }     // Wasted storage
}
```

### 2. Let Granularity Auto-Detect

```javascript
// ✅ Good: Let plugin auto-detect granularity
{
  resources: {
    shortLived: { ttl: 300 },      // Auto: 'minute' granularity
    mediumLived: { ttl: 7200 },    // Auto: 'hour' granularity
    longLived: { ttl: 2592000 }    // Auto: 'day' granularity
  }
}

// ❌ Bad: Overthinking - just set TTL
{
  // Don't manually calculate intervals or partitions
  // Plugin handles it automatically!
}
```

### 3. Use Appropriate Batch Sizes

```javascript
// ✅ Good: Reasonable batch size
{
  batchSize: 100  // Default, works for most cases
}

// ❌ Bad: Too large
{
  batchSize: 10000  // May timeout or cause memory issues
}
```

### 4. Monitor with Events

```javascript
// ✅ Good: Monitor for issues
ttlPlugin.on('cleanupError', ({ granularity, error }) => {
  logger.error(`TTL cleanup failed for ${granularity}:`, error);
  alerting.send(`TTL Plugin Error: ${granularity}`);
});

ttlPlugin.on('scanCompleted', ({ granularity, duration, cohorts }) => {
  logger.info(`${granularity} scan: ${duration}ms, cohorts: ${cohorts.join(', ')}`);
});
```

### 5. Test Your TTL Configuration

```javascript
// ✅ Good: Test with short TTLs first
const ttlPlugin = new TTLPlugin({
  verbose: true,  // Enable logging to see what's happening
  resources: {
    test_data: {
      ttl: 60,           // 1 minute for testing (minute granularity)
      onExpire: 'soft-delete'
    }
  }
});

// Watch logs to verify cleanup happens within ~10-20 seconds
// Then adjust to production TTL values
```

---

## FAQ

### Q: What happens if cleanup fails mid-scan?

Errors are caught per-record. The scan continues and emits `cleanupError` events. Statistics track total errors. The plugin is resilient to individual failures.

### Q: Can I change TTL config without restarting?

No, you need to recreate the plugin with new config. The expiration index is built during plugin installation based on your configuration.

### Q: How do I exclude certain records from cleanup?

Use the `callback` strategy:

```javascript
{
  onExpire: 'callback',
  callback: async (record, resource) => {
    if (record.keepForever) return false;
    // Otherwise delete
    await resource.delete(record.id);
    return true;
  }
}
```

### Q: What's the performance impact?

**Minimal!** TTL Plugin v2 uses partition-based indexing for O(1) cleanup performance. No full scans means minimal S3 API calls. The plugin creates one internal resource (`plg_ttl_expiration_index`) to track expirations.

**Cost breakdown:**
- Insert/delete hooks: +1 S3 PUT per user record operation
- Cleanup scans: Only queries partitions (O(1)), not full resource scans
- 10-100x faster than traditional TTL implementations

### Q: Can I disable automatic scanning?

Automatic intervals are built into v2's architecture. If you need manual-only cleanup, you can:
1. Set very long TTLs (week granularity = 24h interval)
2. Or stop intervals with `plugin._stopIntervals()` and use `runCleanup()` manually

### Q: How do I handle timezone issues?

Store timestamps in UTC (ISO 8601 format or Unix timestamps). The plugin compares against `Date.now()` which is UTC.

### Q: What is a "cohort"?

A cohort is a time bucket for grouping records by expiration time:
- `minute`: `2024-10-25T14:30` (expires in this minute)
- `hour`: `2024-10-25T14` (expires in this hour)
- `day`: `2024-10-25` (expires on this day)
- `week`: `2024-W43` (expires in this week)

This allows O(1) partition lookups instead of scanning all records.

### Q: Does the expiration index consume a lot of storage?

Minimal. Each index entry is ~100-200 bytes (resourceName, recordId, cohort, granularity). For 1 million records with TTL, expect ~100-200MB of index storage.

---

## See Also

- [Audit Plugin](./audit.md) - Track changes to records
- [Backup Plugin](./backup.md) - Backup before cleanup
- [State Machine Plugin](./state-machine.md) - State-based lifecycle
- [Scheduler Plugin](./scheduler.md) - Schedule cleanup tasks

---

**Need help?** Check the [main documentation](../../README.md) or [open an issue](https://github.com/forattini-dev/s3db.js/issues).
