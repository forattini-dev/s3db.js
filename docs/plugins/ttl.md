# ⏱️ TTL Plugin

## ⚡ TLDR

**Automatic Time-To-Live cleanup** for expired records with multiple expiration strategies.

**1 line to get started:**
```javascript
plugins: [new TTLPlugin({ resources: { sessions: { ttl: 86400, field: 'expiresAt', onExpire: 'soft-delete' } } })]
```

**Key features:**
- ✅ Automatic periodic scanning
- ✅ 4 expiration strategies (soft-delete, hard-delete, archive, callback)
- ✅ Resource-specific TTL configuration  
- ✅ Batch processing for efficiency
- ✅ Event monitoring & statistics
- ✅ Custom expiration field support

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
      checkInterval: 300000,  // Check every 5 minutes
      batchSize: 100,
      verbose: true,
      
      resources: {
        // Sessions expire after 24 hours
        sessions: {
          ttl: 86400,           // 24 hours in seconds
          field: 'expiresAt',   // Field to check
          onExpire: 'soft-delete',  // Mark as deleted
          deleteField: 'deletedAt'
        },
        
        // Temp uploads auto-delete after 1 hour
        temp_uploads: {
          ttl: 3600,            // 1 hour
          field: 'createdAt',
          onExpire: 'hard-delete'  // Permanently remove
        },
        
        // Archive old orders after 30 days
        old_orders: {
          ttl: 2592000,         // 30 days
          field: 'createdAt',
          onExpire: 'archive',
          archiveResource: 'archive_orders'
        }
      }
    })
  ]
});

await db.connect();

// 2. Records are automatically cleaned up!
// No manual intervention needed

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

The **TTL (Time-To-Live) Plugin** automatically removes or archives expired records based on configurable rules. It periodically scans your resources and processes expired records using one of four strategies: soft-delete, hard-delete, archive, or custom callback.

### How It Works

1. **Periodic Scanning**: Runs on a configurable interval (default: 5 minutes)
2. **Record Evaluation**: Checks each record's expiration field against TTL
3. **Strategy Execution**: Processes expired records based on configured strategy
4. **Batch Processing**: Handles large datasets efficiently in batches
5. **Event Emission**: Emits events for monitoring and logging

> 💡 **Perfect for Data Lifecycle Management**: Automatically maintain database hygiene by removing or archiving expired data.

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
  checkInterval: 300000,  // Scan interval in ms (default: 5 minutes)
  batchSize: 100,         // Process N records at a time (default: 100)
  verbose: true,          // Enable logging (default: false)
  resources: {            // Resource-specific configurations
    // ... resource configs
  }
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `checkInterval` | number | 300000 | Milliseconds between scans (0 = disabled) |
| `batchSize` | number | 100 | Records to process per batch |
| `verbose` | boolean | false | Enable console logging |
| `resources` | object | {} | Resource-specific TTL configurations |

### Resource-Level Options

```javascript
resources: {
  resource_name: {
    ttl: 86400,                    // Required: TTL in seconds
    field: 'expiresAt',            // Required: Field to check
    onExpire: 'soft-delete',       // Required: Strategy
    
    // Strategy-specific options:
    deleteField: 'deletedAt',      // For soft-delete (default: 'deletedAt')
    archiveResource: 'archive',    // For archive (required)
    keepOriginalId: true,          // For archive (default: false)
    callback: async (record) => {} // For callback (required)
  }
}
```

| Option | Type | Required | Strategy | Description |
|--------|------|----------|----------|-------------|
| `ttl` | number | ✅ | All | Time-to-live in seconds |
| `field` | string | ✅ | All | Field containing timestamp |
| `onExpire` | string | ✅ | All | Expiration strategy |
| `deleteField` | string | ❌ | soft-delete | Field to mark deletion |
| `archiveResource` | string | ✅ | archive | Destination resource name |
| `keepOriginalId` | boolean | ❌ | archive | Keep original ID in archive |
| `callback` | function | ✅ | callback | Custom cleanup function |

---

## Expiration Strategies

### 1. Soft Delete

Marks records as deleted without removing them from S3. Perfect for maintaining history.

```javascript
resources: {
  sessions: {
    ttl: 86400,              // 24 hours
    field: 'expiresAt',
    onExpire: 'soft-delete',
    deleteField: 'deletedAt'  // Field to mark deletion
  }
}
```

**Behavior:**
- Updates record with `deleteField: <current timestamp>`
- Record remains in S3
- Can be queried/undeleted if needed
- No data loss

**Use When:**
- Need audit trail
- May need to restore data
- Compliance requires retention
- Soft deletion is acceptable

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
- Adds metadata: `_archivedAt`, `_archivedFrom`, `_originalId`
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
  checkInterval: 60000,  // Check every minute
  verbose: true,
  
  resources: {
    user_sessions: {
      ttl: 1800,           // 30 minutes
      field: 'lastActivity',
      onExpire: 'soft-delete',
      deleteField: 'loggedOut'
    }
  }
});

await db.usePlugin(ttlPlugin);

// Sessions auto-expire after 30 minutes of inactivity
```

### Example 2: Multi-Resource Cleanup

```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    // Temporary uploads - delete after 1 hour
    temp_files: {
      ttl: 3600,
      field: 'uploadedAt',
      onExpire: 'hard-delete'
    },
    
    // Email verification codes - delete after 15 minutes
    verification_codes: {
      ttl: 900,
      field: 'createdAt',
      onExpire: 'hard-delete'
    },
    
    // Password reset tokens - delete after 1 hour
    reset_tokens: {
      ttl: 3600,
      field: 'issuedAt',
      onExpire: 'hard-delete'
    }
  }
});
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
  checkInterval: 0,  // Disable automatic scanning
  resources: {
    temp_data: {
      ttl: 3600,
      field: 'createdAt',
      onExpire: 'hard-delete'
    }
  }
});

await db.usePlugin(ttlPlugin);

// Manually trigger cleanup when needed
const result = await ttlPlugin.cleanupResource('temp_data');
console.log(`Cleaned up ${result.processed} records`);
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
  totalScans: 123,           // Total scans performed
  totalExpired: 456,         // Total records found expired
  totalDeleted: 234,         // Total hard-deleted
  totalArchived: 100,        // Total archived
  totalSoftDeleted: 122,     // Total soft-deleted
  totalCallbacks: 45,        // Total callback executions
  totalErrors: 2,            // Total errors encountered
  lastScanAt: '2025-01-15T10:30:00Z',  // Last scan timestamp
  lastScanDuration: 1234,    // Last scan duration (ms)
  isRunning: false,          // Currently scanning?
  checkInterval: 300000,     // Configured interval
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
//   expired: 10,    // Records found expired
//   processed: 10,  // Successfully processed
//   errors: 0       // Errors encountered
// }
```

**Parameters:**
- `resourceName` (string): Name of resource to cleanup

**Returns:** `Promise<{expired, processed, errors}>`

---

## Events

The TTL Plugin emits several events for monitoring:

### `recordExpired`

Emitted for each expired record.

```javascript
ttlPlugin.on('recordExpired', ({ resource, recordId, strategy }) => {
  console.log(`${recordId} expired in ${resource} using ${strategy}`);
});
```

### `batchExpired`

Emitted after processing each batch.

```javascript
ttlPlugin.on('batchExpired', ({ resource, batchSize, processed, errors }) => {
  console.log(`Batch in ${resource}: ${processed}/${batchSize} processed, ${errors} errors`);
});
```

### `scanCompleted`

Emitted after completing a full scan cycle.

```javascript
ttlPlugin.on('scanCompleted', ({ scan, duration, totalExpired, totalProcessed, totalErrors, results }) => {
  console.log(`Scan #${scan} completed in ${duration}ms`);
  console.log(`Total: ${totalExpired} expired, ${totalProcessed} processed, ${totalErrors} errors`);
});
```

### `cleanupError`

Emitted when cleanup fails.

```javascript
ttlPlugin.on('cleanupError', ({ resource, error, scan }) => {
  console.error(`Error in ${resource}:`, error);
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

### 2. Optimize Scan Intervals

```javascript
// ✅ Good: Balanced intervals
{
  checkInterval: 300000,  // 5 minutes for most cases
  batchSize: 100         // Reasonable batch size
}

// ❌ Bad: Too frequent or too large
{
  checkInterval: 1000,   // Every second - excessive!
  batchSize: 10000       // May timeout or OOM
}
```

### 3. Use Partitions for Large Datasets

```javascript
// ✅ Good: Partition by date for efficient queries
await db.createResource({
  name: 'sessions',
  attributes: { /* ... */ },
  partitions: {
    byDate: { fields: { createdAt: 'string' } }
  }
});

// Then query partitions in callback
{
  onExpire: 'callback',
  callback: async (record, resource) => {
    // More efficient than listing all records
  }
}
```

### 4. Monitor with Events

```javascript
// ✅ Good: Monitor for issues
ttlPlugin.on('cleanupError', ({ error, resource }) => {
  logger.error(`TTL cleanup failed for ${resource}:`, error);
  alerting.send(`TTL Plugin Error: ${resource}`);
});

ttlPlugin.on('scanCompleted', ({ totalErrors }) => {
  if (totalErrors > 10) {
    alerting.send('High error rate in TTL cleanup');
  }
});
```

### 5. Test Your TTL Configuration

```javascript
// ✅ Good: Test with short TTLs first
const ttlPlugin = new TTLPlugin({
  checkInterval: 10000,  // 10 seconds for testing
  resources: {
    test_data: {
      ttl: 60,           // 1 minute for testing
      field: 'createdAt',
      onExpire: 'soft-delete'
    }
  }
});

// Verify it works, then adjust to production values
```

---

## FAQ

### Q: What happens if cleanup fails mid-scan?

Errors are caught per-record and per-resource. The scan continues and emits `cleanupError` events. Statistics track total errors.

### Q: Can I change TTL config without restarting?

No, you need to recreate the plugin with new config. Consider using separate TTLPlugin instances for different update frequencies.

### Q: How do I exclude certain records from cleanup?

Use the `callback` strategy:

```javascript
{
  onExpire: 'callback',
  callback: async (record) => {
    if (record.keepForever) return false;
    await resource.delete(record.id);
    return true;
  }
}
```

### Q: What's the performance impact?

Depends on dataset size and `checkInterval`. Use partitions for large datasets. Monitor with events and adjust `batchSize` accordingly.

### Q: Can I disable automatic scanning?

Yes, set `checkInterval: 0`. Then manually trigger with `runCleanup()` or `cleanupResource()`.

### Q: How do I handle timezone issues?

Store timestamps in UTC (ISO 8601 format). The plugin compares against `Date.now()` which is UTC.

---

## See Also

- [Audit Plugin](./audit.md) - Track changes to records
- [Backup Plugin](./backup.md) - Backup before cleanup
- [State Machine Plugin](./state-machine.md) - State-based lifecycle
- [Scheduler Plugin](./scheduler.md) - Schedule cleanup tasks

---

**Need help?** Check the [main documentation](../../README.md) or [open an issue](https://github.com/forattini-dev/s3db.js/issues).
