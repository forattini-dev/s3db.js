# 📖 Usage Patterns & Expiration Strategies

**Prev:** [Configuration](./configuration.md)
**Next:** [Best Practices](./best-practices.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)

> **In this guide:**
> - 5 progressive usage patterns (Beginner → Advanced)
> - All 4 expiration strategies explained
> - Real-world examples with code
> - Common mistakes and solutions
> - API reference

**Time to read:** 20 minutes
**Difficulty:** Beginner → Intermediate

---

## Quick Reference

| Method | Purpose | Returns | Async |
|--------|---------|---------|-------|
| `getStats()` | Get plugin statistics | `{totalScans, totalExpired, ...}` | ❌ |
| `runCleanup()` | Manually trigger cleanup | `{resource, processed, expired}` | ✅ |
| `cleanupResource(name)` | Clean specific resource | `{resource, processed, expired}` | ✅ |

| Strategy | Use Case | Data Loss | Recovery |
|----------|----------|-----------|----------|
| `soft-delete` | Keep history | ❌ None | ✅ Easy |
| `hard-delete` | Free storage | ✅ Permanent | ❌ Impossible |
| `archive` | Both worlds | ❌ None | ✅ Easy |
| `callback` | Custom logic | ❓ Depends | ❓ Custom |

---

## Usage Patterns (Progressive Learning)

### Pattern 1: Basic Session Management (Beginner)

**When to use:** Getting started with TTL, simple cleanup needs

```javascript
import { Database } from 's3db.js';
import { TTLPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

// Create plugin with single TTL rule
const ttlPlugin = new TTLPlugin({
  resources: {
    user_sessions: {
      ttl: 1800,                 // 30 minutes
      onExpire: 'soft-delete'    // Mark as deleted
    }
  }
});

await db.usePlugin(ttlPlugin);
await db.connect();

// Sessions auto-expire after 30 minutes
// Plugin auto-detects: hour granularity (checks every 10 minutes)

// Check statistics
const stats = ttlPlugin.getStats();
console.log(`Total expired sessions: ${stats.totalExpired}`);
```

**What you get:**
- ✅ Automatic cleanup
- ✅ Maintains history (soft-delete)
- ✅ Auto-detected granularity

**What's missing:**
- No multiple resources
- No custom strategies
- No manual cleanup triggers

---

### Pattern 2: Multi-Resource Cleanup (Intermediate)

**When to use:** Managing different TTLs for different resource types

```javascript
const ttlPlugin = new TTLPlugin({
  batchSize: 200,              // Process 200 records at a time

  resources: {
    // Very short TTL - minute granularity
    verification_codes: {
      ttl: 600,                // 10 minutes
      onExpire: 'hard-delete'  // Actually delete (save storage)
    },

    // Medium TTL - hour granularity
    sessions: {
      ttl: 7200,               // 2 hours
      onExpire: 'soft-delete'  // Keep history
    },

    // Long TTL - day granularity
    old_logs: {
      ttl: 2592000,            // 30 days
      onExpire: 'archive',
      archiveResource: 'archive_logs'  // Move to archive
    }
  }
});

await db.usePlugin(ttlPlugin);

// Plugin automatically runs cleanup at different intervals:
// - verification_codes: every 10 seconds (minute granularity)
// - sessions: every 10 minutes (hour granularity)
// - old_logs: daily (day granularity)
```

**What you get:**
- ✅ Multiple resources with different TTLs
- ✅ Optimized cleanup frequency per granularity
- ✅ Different strategies per resource

**What's missing:**
- No custom cleanup schedules
- No event monitoring
- No callback logic

---

### Pattern 3: Custom Cleanup Schedules (Intermediate)

**When to use:** Control exactly when cleanup runs

```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    temp_files: {
      ttl: 3600,                 // 1 hour
      onExpire: 'hard-delete'
    },
    sessions: {
      ttl: 86400,                // 24 hours
      onExpire: 'soft-delete'
    }
  },

  // Custom cron schedules (second-level granularity!)
  schedules: {
    minute: '*/30 * * * * *',    // Every 30 seconds (instead of default 10s)
    hour: '*/15 * * * *',        // Every 15 minutes (instead of default 10m)
    day: '0 2 * * *'             // Daily at 2 AM (instead of default midnight)
  }
});

await db.usePlugin(ttlPlugin);

// Cleanup runs:
// - temp_files: every 30 seconds
// - sessions: every 15 minutes
// - (all day-granularity): at 2 AM daily
```

**What you get:**
- ✅ Precise control over cleanup frequency
- ✅ Run cleanup during off-peak hours
- ✅ Optimize for cost (fewer checks)

**What's missing:**
- No event monitoring
- No manual triggers
- No custom logic per record

---

### Pattern 4: Event Monitoring (Advanced)

**When to use:** Track and respond to cleanup events

```javascript
const ttlPlugin = new TTLPlugin({
  logLevel: 'debug',  // Enable logging
  resources: {
    sessions: {
      ttl: 3600,
      onExpire: 'soft-delete'
    }
  }
});

await db.usePlugin(ttlPlugin);

// Monitor individual record expiration
ttlPlugin.on('plg:ttl:record-expired', ({ resource, recordId, strategy }) => {
  console.log(`Record ${recordId} expired from ${resource} using ${strategy}`);
  // Send alerts, log to analytics, etc.
});

// Monitor scan completion
ttlPlugin.on('plg:ttl:scan-completed', ({
  granularity,
  totalExpired,
  totalProcessed,
  duration
}) => {
  console.log(`Scan (${granularity}): ${totalExpired}/${totalProcessed} in ${duration}ms`);
  // Update metrics, trigger downstream jobs, etc.
});

// Monitor errors
ttlPlugin.on('plg:ttl:cleanup-error', ({ resource, error }) => {
  console.error(`Error in ${resource}:`, error);
  // Send alerts, retry, failover
});
```

**What you get:**
- ✅ Real-time event monitoring
- ✅ Integration with logging/analytics
- ✅ Error handling

**What's missing:**
- No custom cleanup logic
- No conditional decisions per record

---

### Pattern 5: Custom Callback Logic (Advanced)

**When to use:** Complex cleanup decisions based on record content

```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    orders: {
      ttl: 7776000,              // 90 days
      field: 'completedAt',      // Use completion time, not creation
      onExpire: 'callback',

      callback: async (record, resource) => {
        // Complex decision logic

        if (record.status === 'paid') {
          // Archive to analytics before deleting
          await analyticsService.recordOrder(record);
          await archiveResource.insert({
            ...record,
            archivedAt: new Date().toISOString()
          });
          return true;  // Delete from main resource

        } else if (record.status === 'pending') {
          // Send reminder for unpaid orders
          await sendReminderEmail(record.customerId);
          return false;  // Keep for now

        } else {
          // Refunded orders - archive but don't delete
          await archiveResource.insert(record);
          return false;  // Keep original for reference
        }
      }
    }
  }
});

await db.usePlugin(ttlPlugin);
await db.connect();

// Orders handled based on status:
// - Paid: archived to analytics, then deleted
// - Pending: reminder sent, kept for follow-up
// - Refunded: archived but kept as reference
```

**What you get:**
- ✅ Custom logic per record
- ✅ Conditional decisions based on data
- ✅ Integration with external services

**What you can do:**
- Send notifications before deletion
- Archive selectively
- Aggregate data before cleanup
- Sync to external systems

---

## Expiration Strategies

### 1. Soft Delete

Marks records as deleted without removing from S3. **Best for:** Maintaining history, compliance requirements.

```javascript
resources: {
  sessions: {
    ttl: 1800,
    onExpire: 'soft-delete',
    deleteField: 'deletedat'    // Optional custom field
  }
}
```

**Behavior:**
- Updates record with `deleteField: <current timestamp>`
- Adds `isdeleted: 'true'` automatically
- Record remains in S3 (full audit trail)
- Can be undeleted/queried if needed

**When to use:**
- ✅ Need audit trail
- ✅ May need to restore data
- ✅ Compliance requires retention
- ✅ GDPR/right-to-be-forgotten (keep after marking)

**Storage impact:** ⭐⭐⭐⭐⭐ (all records kept)

**Recovery:** Easy - just unset the deleted flag

**Example:**
```javascript
// Query for active sessions
const activeSessions = await sessions.query({ isdeleted: { $ne: 'true' } });

// Query for deleted sessions
const deletedSessions = await sessions.query({ isdeleted: 'true' });

// Undelete a session
await sessions.patch(sessionId, { isdeleted: null, deletedat: null });
```

---

### 2. Hard Delete

Permanently removes records from S3. **Best for:** Storage optimization, temporary data.

```javascript
resources: {
  temp_files: {
    ttl: 3600,
    onExpire: 'hard-delete'
  }
}
```

**Behavior:**
- Calls `resource.delete(id)`
- Record completely removed from S3
- Storage freed immediately
- Cannot be recovered

**When to use:**
- ✅ No need to retain data
- ✅ Storage costs critical
- ✅ Temporary/session data
- ✅ GDPR right-to-be-forgotten (requires immediate deletion)

**Storage impact:** ⭐ (all records deleted)

**Recovery:** Impossible - deleted forever

**Performance:** Fastest cleanup (direct delete)

**Example:**
```javascript
resources: {
  verification_codes: { ttl: 900, onExpire: 'hard-delete' },
  reset_tokens: { ttl: 3600, onExpire: 'hard-delete' },
  temp_uploads: { ttl: 86400, onExpire: 'hard-delete' }
}
```

---

### 3. Archive

Copies records to another resource before deleting. **Best for:** Both retention and cleanup.

```javascript
resources: {
  orders: {
    ttl: 2592000,               // 30 days
    field: 'completedAt',
    onExpire: 'archive',
    archiveResource: 'archive_orders',
    keepOriginalId: false       // Generate new ID in archive
  }
}
```

**Behavior:**
- Inserts record into `archiveResource`
- Adds metadata:
  - `archivedAt`: Timestamp of archival
  - `archivedFrom`: Original resource name
  - `originalId`: ID from original resource (if `keepOriginalId: true`)
- Hard-deletes from original resource
- Data accessible in archive forever

**When to use:**
- ✅ Need data retention
- ✅ Want main resource clean
- ✅ Archive storage cheaper
- ✅ Compliance requires archival
- ✅ Cleanup + history together

**Storage impact:** ⭐⭐⭐ (moved, not deleted)

**Recovery:** Easy - data in archive

**Cost optimization:** Archive to cheaper storage tier

**Example:**
```javascript
// Archive with original ID tracking
resources: {
  orders: {
    ttl: 7776000,               // 90 days
    onExpire: 'archive',
    archiveResource: 'archive_orders',
    keepOriginalId: true        // Keep original ID for tracking
  }
}

// Later, find archived order by original ID
const archived = await archiveResource.query({ originalId: 'original-order-123' });
```

---

### 4. Callback

Custom logic for complex scenarios. **Best for:** Conditional cleanup, multi-step processes.

```javascript
resources: {
  orders: {
    ttl: 7776000,
    onExpire: 'callback',
    callback: async (record, resource) => {
      // Your custom logic here
      // Return true to delete, false to keep
    }
  }
}
```

**Behavior:**
- Calls your custom function for each expired record
- You decide what to do (archive, notify, aggregate, etc.)
- Return `true` to delete, `false` to keep
- Full control over cleanup process

**When to use:**
- ✅ Complex decision logic
- ✅ Conditional based on record data
- ✅ Multi-step cleanup (archive → notify → delete)
- ✅ Integration with external services
- ✅ Data transformation before deletion

**Flexibility:** Maximum ⭐⭐⭐⭐⭐

**Example patterns:**

**Pattern A: Send notification before deletion**
```javascript
callback: async (record) => {
  await sendExpirationNotice(record.userId);
  return true;  // Delete after notification
}
```

**Pattern B: Conditional archival**
```javascript
callback: async (record) => {
  if (record.value > 1000) {
    await importantArchive.insert(record);  // Archive high-value
  }
  return true;  // Always delete from main
}
```

**Pattern C: Sync to external system**
```javascript
callback: async (record) => {
  try {
    await externalAPI.archive(record);
    return true;  // Delete if sync succeeded
  } catch (error) {
    console.error('Sync failed:', error);
    return false;  // Keep for retry
  }
}
```

**Pattern D: Data aggregation**
```javascript
callback: async (record) => {
  // Aggregate before deletion
  await analytics.recordExpiration({
    resource: 'orders',
    status: record.status,
    value: record.totalAmount,
    timestamp: new Date()
  });
  return true;  // Delete after recording
}
```

---

## Strategy Comparison

| Aspect | Soft Delete | Hard Delete | Archive | Callback |
|--------|------------|-------------|---------|----------|
| **Data Loss** | ❌ None | ✅ Permanent | ❌ None | ❓ Depends |
| **Recovery** | ✅ Easy | ❌ Impossible | ✅ Easy | ✅ Custom |
| **Storage** | High | Low | Medium | Custom |
| **Query Impact** | Filter soft-deleted | N/A | Query archive | N/A |
| **Speed** | Fast | Fastest | Medium | Slowest |
| **Complexity** | Low | Low | Low | High |
| **Best for** | History | Temp data | Cleanup+Archive | Complex logic |

---

## Common Mistakes

### ❌ Mistake 1: TTL too short, losing data

```javascript
// Wrong - expires in 5 minutes!
resources: {
  important_data: { ttl: 300, onExpire: 'hard-delete' }
}
```

**Solution:**
```javascript
// Correct - expires in 30 days
resources: {
  important_data: { ttl: 2592000, onExpire: 'soft-delete' }
}
```

---

### ❌ Mistake 2: Hard-deleting when you need history

```javascript
// Wrong - can't recover deleted data
resources: {
  orders: { ttl: 86400, onExpire: 'hard-delete' }
}
```

**Solution:**
```javascript
// Correct - keep in archive
resources: {
  orders: {
    ttl: 86400,
    onExpire: 'archive',
    archiveResource: 'archive_orders'
  }
}
```

---

### ❌ Mistake 3: Archive resource doesn't exist

```javascript
// Wrong - archive_orders resource doesn't exist!
resources: {
  orders: {
    onExpire: 'archive',
    archiveResource: 'archive_orders'
  }
}
```

**Solution:**
```javascript
// Correct - create archive resource first
await db.createResource({
  name: 'archive_orders',
  attributes: { /* same as orders */ }
});

// Then configure TTL
new TTLPlugin({
  resources: {
    orders: {
      onExpire: 'archive',
      archiveResource: 'archive_orders'
    }
  }
})
```

---

### ❌ Mistake 4: Wrong field for expiration

```javascript
// Wrong - field doesn't exist or has wrong format
resources: {
  sessions: {
    field: 'createdTime',   // Doesn't exist
    ttl: 3600,
    onExpire: 'soft-delete'
  }
}
```

**Solution:**
```javascript
// Correct - verify field exists and has timestamp
resources: {
  sessions: {
    field: '_createdAt',    // Default, always exists
    ttl: 3600,
    onExpire: 'soft-delete'
  }
}
```

---

### ❌ Mistake 5: Callback not returning boolean

```javascript
// Wrong - callback doesn't return anything
callback: async (record) => {
  await someOperation(record);
  // Missing return statement!
}
```

**Solution:**
```javascript
// Correct - always return true or false
callback: async (record) => {
  await someOperation(record);
  return true;  // Delete after operation
}
```

---

## API Reference

### `getStats()`

Returns current plugin statistics.

**Signature:**
```typescript
getStats(): {
  totalScans: number
  totalExpired: number
  totalDeleted: number
  totalArchived: number
  totalSoftDeleted: number
  totalCallbackExecuted: number
  lastScanAt: Date | null
}
```

**Example:**
```javascript
const stats = ttlPlugin.getStats();
console.log(`Total scans: ${stats.totalScans}`);
console.log(`Expired records: ${stats.totalExpired}`);
console.log(`Hard deleted: ${stats.totalDeleted}`);
console.log(`Archived: ${stats.totalArchived}`);
console.log(`Last scan: ${stats.lastScanAt}`);
```

---

### `runCleanup()`

Manually trigger cleanup across all resources.

**Signature:**
```typescript
runCleanup(): Promise<{
  resource: string
  processed: number
  expired: number
}>
```

**Example:**
```javascript
const result = await ttlPlugin.runCleanup();
console.log(`Cleaned up resource: ${result.resource}`);
console.log(`Processed: ${result.processed}`);
console.log(`Expired: ${result.expired}`);
```

---

### `cleanupResource(name)`

Manually trigger cleanup for a specific resource.

**Signature:**
```typescript
cleanupResource(name: string): Promise<{
  resource: string
  processed: number
  expired: number
}>
```

**Example:**
```javascript
const result = await ttlPlugin.cleanupResource('sessions');
console.log(`Cleaned ${result.expired} expired sessions`);
```

---

## Performance Tips

### Tip 1: Use larger batchSize for high volume

```javascript
// For 10,000+ records
new TTLPlugin({ batchSize: 1000 })
```

### Tip 2: Stagger cleanup schedules to avoid spikes

```javascript
schedules: {
  hour: '*/20 * * * *',     // Every 20 min (spreads load)
  day: '0 */6 * * *'        // Every 6 hours
}
```

### Tip 3: Use hard-delete only for truly temporary data

```javascript
onExpire: 'hard-delete'  // Only for verification codes, temp files
```

### Tip 4: Archive rather than delete when unsure

```javascript
onExpire: 'archive'      // Safer default than hard-delete
```

---

## 📚 See Also

- **[Configuration](./configuration.md)** - All config options
- **[Best Practices](./best-practices.md)** - Tips, monitoring, troubleshooting
- **[README](../README.md#-expiration-strategies)** - Strategy details
- **[Coordinator Mode](../README.md#-coordinator-mode)** - Multi-pod deployment

---

**Still have questions?** → Check [FAQ](./best-practices.md#-faq)
