# ✅ Best Practices, Troubleshooting & FAQ

**Prev:** [Usage Patterns](./usage-patterns.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)

> **In this guide:**
> - 5 best practices with code examples
> - Pro tips and tricks
> - Common mistakes to avoid
> - Error scenarios and solutions
> - 30+ FAQ entries
> - Troubleshooting guide

**Time to read:** 25 minutes
**Difficulty:** Intermediate

---

## 🎯 Best Practices

### Practice 1: Choose the Right Expiration Strategy

Match your TTL strategy to your use case:

```javascript
// ✅ Good: Strategy matches use case
new TTLPlugin({
  resources: {
    sessions: {
      ttl: 86400,
      onExpire: 'soft-delete'      // Need audit trail
    },
    temp_uploads: {
      ttl: 3600,
      onExpire: 'hard-delete'      // Save storage, no retention needed
    },
    old_orders: {
      ttl: 2592000,
      onExpire: 'archive',         // Keep in archive, clean main
      archiveResource: 'archive_orders'
    },
    special_orders: {
      ttl: 7200,
      onExpire: 'callback',        // Complex logic needed
      callback: async (record) => {
        // Custom logic
        return true;  // Delete after processing
      }
    }
  }
});

// ❌ Bad: Wrong strategy for use case
new TTLPlugin({
  resources: {
    sessions: {
      onExpire: 'hard-delete'  // Lost audit trail!
    },
    temp_files: {
      onExpire: 'archive'      // Wastes storage
    }
  }
});
```

**Why it matters:** Choosing wrong strategy either loses data or wastes storage.

---

### Practice 2: Let Granularity Auto-Detect

Let the plugin handle granularity automatically based on TTL:

```javascript
// ✅ Good: Let plugin auto-detect
new TTLPlugin({
  resources: {
    verification_codes: { ttl: 300 },      // Auto: 'minute' (check every 10s)
    sessions: { ttl: 3600 },               // Auto: 'hour' (check every 10m)
    old_data: { ttl: 2592000 }             // Auto: 'day' (check daily)
  }
});

// ❌ Bad: Overthinking (don't do this)
new TTLPlugin({
  resources: {
    data: { ttl: 300 }
  },
  schedules: {
    minute: '*/30 * * * * *'     // Don't manually override unless needed
  }
});
```

**Why it matters:** Default granularity is optimized. Override only for specific needs.

---

### Practice 3: Monitor with Events

Always monitor cleanup operations in production:

```javascript
// ✅ Good: Comprehensive event monitoring
const ttlPlugin = new TTLPlugin({...});

// Track individual record expiration
ttlPlugin.on('plg:ttl:record-expired', ({ resource, recordId, strategy }) => {
  logger.info(`Expired: ${recordId} from ${resource} (${strategy})`);
});

// Track scan completion
ttlPlugin.on('plg:ttl:scan-completed', ({ granularity, totalExpired, duration }) => {
  metrics.recordScan({
    granularity,
    expired: totalExpired,
    duration
  });
});

// Track errors
ttlPlugin.on('plg:ttl:cleanup-error', ({ resource, error }) => {
  logger.error(`TTL cleanup failed for ${resource}:`, error);
  alerts.send(`TTL ERROR: ${resource}`);
});

await db.usePlugin(ttlPlugin);

// ❌ Bad: No monitoring
new TTLPlugin({...});  // Silent failures possible
```

**Why it matters:** Catch problems before they affect users.

---

### Practice 4: Test with Short TTLs First

Verify configuration before deploying to production:

```javascript
// ✅ Good: Test with short TTL in development
const ttlPlugin = new TTLPlugin({
  logLevel: 'debug',  // Enable logging
  resources: {
    test_data: {
      ttl: 60,                 // 1 minute for testing
      field: '_createdAt',
      onExpire: 'soft-delete'
    }
  }
});

await db.usePlugin(ttlPlugin);

// Wait ~30 seconds and verify:
// 1. Check logs for "scan-completed" events
// 2. Verify records marked as deleted
// 3. Confirm isdeleted flag set correctly

// Then adjust to production values:
// { ttl: 86400, onExpire: 'soft-delete' }

// ❌ Bad: Deploy without testing
new TTLPlugin({
  resources: {
    sessions: { ttl: 86400, onExpire: 'hard-delete' }
  }
});
// What if it deletes wrong records? Too late!
```

**Why it matters:** Catch configuration bugs in dev, not production.

---

### Practice 5: Enable Coordinator in Multi-Pod Deployments

Prevent duplicate cleanup in distributed environments:

```javascript
// ✅ Good: Coordinator enabled for Kubernetes
new TTLPlugin({
  enableCoordinator: true,       // Automatic election (default)
  heartbeatInterval: 30000,      // 30 seconds
  resources: { ... }
});

// Pod 1: Elected as coordinator → runs cleanup
// Pod 2: Observes coordinator → stays idle
// Pod 3: Observes coordinator → stays idle
//
// If Pod 1 dies → Pod 2 elected → takes over cleanup

// ❌ Bad: No coordinator in multi-pod
// Kubernetes replicas: 3
new TTLPlugin({
  enableCoordinator: false,  // All 3 pods run cleanup = waste!
  resources: { ... }
});
// Result: 3x S3 API calls, 3x resource usage, race conditions
```

**Why it matters:** Coordinator mode prevents wasted resources and race conditions.

---

## 🔥 Pro Tips

### Tip 1: Use Hard-Delete Only for Truly Temporary Data

```javascript
// ✅ Good: Hard-delete for temporary data
resources: {
  verification_codes: { ttl: 600, onExpire: 'hard-delete' },
  temp_uploads: { ttl: 3600, onExpire: 'hard-delete' },
  reset_tokens: { ttl: 1800, onExpire: 'hard-delete' }
}

// ❌ Avoid: Hard-delete for important data
resources: {
  orders: { ttl: 86400, onExpire: 'hard-delete' },  // Lost data!
  users: { ttl: 2592000, onExpire: 'hard-delete' }  // GDPR violation!
}
```

---

### Tip 2: Archive Instead of Delete When Unsure

```javascript
// ✅ Safer approach: Archive, then delete
resources: {
  orders: {
    ttl: 30 * 86400,  // 30 days
    onExpire: 'archive',
    archiveResource: 'archive_orders'
  }
}

// Data saved in archive, main resource clean
```

---

### Tip 3: Use Relative Timestamps for Flexible Expiration

```javascript
// ✅ Expire based on activity, not creation
resources: {
  sessions: {
    field: 'lastActivity',     // Instead of _createdAt
    ttl: 1800,                 // 30 mins after last activity
    onExpire: 'soft-delete'
  }
}

// Updates lastActivity on each request
// Session expires 30 mins after last activity (typical session timeout)

// ❌ Creation-based (doesn't track activity)
resources: {
  sessions: {
    ttl: 1800,                 // Always expires 30 mins after creation
    onExpire: 'soft-delete'    // Active sessions deleted!
  }
}
```

---

### Tip 4: Stagger Cleanup Schedules to Avoid Load Spikes

```javascript
// ✅ Spread out cleanup operations
new TTLPlugin({
  resources: {
    // All resources cleaned at different times
  },
  schedules: {
    minute: '*/25 * * * * *',   // Every 25 seconds
    hour: '*/18 * * * *',       // Every 18 minutes
    day: '0 */6 * * *'          // Every 6 hours
  }
});

// Cleanup spread evenly → no spikes

// ❌ Default schedules (all at once)
schedules: {
  minute: '*/10 * * * * *',     // Every 10 seconds
  hour: '*/10 * * * *',         // Every 10 minutes
  day: '0 0 * * *'              // Daily at midnight
}
// Midnight spike: all day-granularity cleanup runs together
```

---

### Tip 5: Batch Large Callback Operations

```javascript
// ✅ Good: Batch-aware callback
const archives = [];
const batchSize = 100;

callback: async (record) => {
  archives.push(record);

  if (archives.length >= batchSize) {
    await archiveResource.insertBatch(archives);
    archives.length = 0;  // Clear for next batch
  }

  return true;  // Delete after collecting
}

// After scan, flush remaining records:
ttlPlugin.on('plg:ttl:scan-completed', async () => {
  if (archives.length > 0) {
    await archiveResource.insertBatch(archives);
    archives.length = 0;
  }
});

// ❌ Bad: One-by-one operations
callback: async (record) => {
  await archiveResource.insert(record);  // Slow!
  return true;
}
```

---

## ⚠️ Common Mistakes

### Mistake 1: TTL Too Short, Losing Data

```javascript
// ❌ Wrong - deletes active sessions
resources: {
  sessions: { ttl: 300, onExpire: 'hard-delete' }  // 5 mins!
}

// Solution: Match TTL to actual session duration
// ✅ Correct
resources: {
  sessions: { ttl: 3600, onExpire: 'soft-delete' }  // 1 hour
}
```

---

### Mistake 2: Hard-Delete When You Need History

```javascript
// ❌ Wrong - can't recover deleted records
resources: {
  orders: { ttl: 86400, onExpire: 'hard-delete' }
}

// Solution: Use archive or soft-delete
// ✅ Correct
resources: {
  orders: {
    ttl: 86400,
    onExpire: 'archive',
    archiveResource: 'archive_orders'
  }
}
```

---

### Mistake 3: Archive Resource Doesn't Exist

```javascript
// ❌ Wrong - throws error, cleanup fails
resources: {
  orders: {
    onExpire: 'archive',
    archiveResource: 'archive_orders'   // Doesn't exist!
  }
}

// Solution: Create archive resource first
// ✅ Correct
await db.createResource({
  name: 'archive_orders',
  attributes: { /* same as orders */ }
});

new TTLPlugin({
  resources: {
    orders: {
      onExpire: 'archive',
      archiveResource: 'archive_orders'  // Now exists
    }
  }
});
```

---

### Mistake 4: Callback Not Returning Boolean

```javascript
// ❌ Wrong - no return, record not deleted
callback: async (record) => {
  await someOperation(record);
  // Missing return statement!
}

// Solution: Always return true/false
// ✅ Correct
callback: async (record) => {
  await someOperation(record);
  return true;   // Delete record
}
```

---

### Mistake 5: Not Enabling Coordinator in Multi-Pod

```javascript
// ❌ Wrong - all pods run cleanup
// Kubernetes: 3 replicas
new TTLPlugin({
  enableCoordinator: false
});
// Result: Cleanup runs 3x simultaneously = race conditions

// ✅ Correct
new TTLPlugin({
  enableCoordinator: true  // Automatic election
});
// Result: Only 1 pod runs cleanup
```

---

## 🔧 Error Handling

### Error: "Archive resource does not exist"

**Symptom:** Cleanup fails with error about missing archive resource

**Causes:**
1. Archive resource not created before cleanup
2. Typo in `archiveResource` name
3. Archive resource deleted or renamed

**Solution:**
```javascript
// Step 1: Create archive resource
await db.createResource({
  name: 'archive_orders',
  attributes: {
    id: 'string',
    status: 'string',
    amount: 'number',
    archivedAt: 'string',
    originalId: 'string'
  }
});

// Step 2: Configure TTL plugin
new TTLPlugin({
  resources: {
    orders: {
      onExpire: 'archive',
      archiveResource: 'archive_orders'  // Must exist
    }
  }
});

// Step 3: Test
await ttlPlugin.cleanupResource('orders');
```

---

### Error: "Invalid onExpire strategy"

**Symptom:** Plugin fails during initialization

**Causes:**
1. Typo in strategy name
2. Used strategy before implementing callback

**Solution:**
```javascript
// ✅ Valid strategies
onExpire: 'soft-delete'   // ✓
onExpire: 'hard-delete'   // ✓
onExpire: 'archive'       // ✓
onExpire: 'callback'      // ✓

// ❌ Invalid
onExpire: 'delete'        // Wrong!
onExpire: 'softDelete'    // Wrong casing!
onExpire: 'archive-old'   // Typo!
```

---

### Error: "Callback is not a function"

**Symptom:** Cleanup fails when using callback strategy

**Causes:**
1. Callback not defined
2. Callback is not async
3. Callback not returning boolean

**Solution:**
```javascript
// ✅ Correct callback
callback: async (record, resource) => {
  // Do something
  return true;  // Delete
  // or
  return false; // Keep
}

// ❌ Wrong
callback: (record) => {    // Not async
  doSomething(record);
  // No return
}
```

---

### Error: "Cleanup timed out"

**Symptom:** Cleanup doesn't complete in expected time

**Causes:**
1. Callback operations too slow
2. Batch size too large
3. S3 API slow/throttled

**Solution:**
```javascript
// Reduce batch size
new TTLPlugin({
  batchSize: 50,  // Was 100
  resources: { ... }
});

// Or optimize callback
callback: async (record) => {
  // Parallelize operations
  await Promise.all([
    operation1(record),
    operation2(record)
  ]);
  return true;
}
```

---

### Error: "Too many open connections"

**Symptom:** Memory/connection leak, cascading failures

**Causes:**
1. Callback creating connections without closing
2. Archive resource insert not closing connections
3. Event handlers not cleaning up

**Solution:**
```javascript
// ✅ Good: Properly manage connections
callback: async (record) => {
  const connection = await pool.getConnection();
  try {
    await connection.query('INSERT ...');
    return true;
  } finally {
    await connection.release();
  }
}
```

---

### Error: "Record not found during soft-delete"

**Symptom:** Cleanup attempts to update record that's already gone

**Causes:**
1. Record deleted before TTL cleanup
2. Resource deleted
3. Partition corruption

**Solution:**
```javascript
// Gracefully handle missing records
ttlPlugin.on('plg:ttl:cleanup-error', ({ error }) => {
  if (error.message.includes('NotFound')) {
    // Record already deleted - ignore
    return;
  }
  // Report actual errors
  logger.error('TTL cleanup error:', error);
});
```

---

## ❓ FAQ

### General Questions

**Q: What is TTL Plugin v2?**

A: TTL Plugin v2 is an automatic record expiration system with **O(1) performance** using partition-based indexing. Unlike traditional TTL that scans all records (O(n)), v2 queries only expired partitions. Result: 10-100x faster, 99% fewer S3 API calls.

**Q: Does TTL Plugin have external dependencies?**

A: No! Zero external dependencies. Everything is built into s3db.js core (cron, partitioning, batch processing, events).

**Q: How does partition-based indexing work?**

A: TTL Plugin creates `plg_ttl_expiration_index` resource partitioned by `expiresAtCohort`. Instead of scanning all records, it queries only the partition for the current time. For example: "2024-11-14T14" (hour cohort) returns only records expiring in that hour.

**Q: Can I run TTL Plugin on multiple pods?**

A: Yes! Enable Coordinator Mode (`enableCoordinator: true` - default) for automatic election. Only one pod runs cleanup, others idle. If coordinator dies, new one elected automatically.

---

### Configuration Questions

**Q: What TTL should I use for sessions?**

A: Typical session TTL is 30 minutes to 24 hours:
- Very strict (banking): 15-30 minutes
- Standard (SaaS): 1-4 hours
- Relaxed (personal): 24+ hours

```javascript
{ ttl: 1800, onExpire: 'soft-delete' }  // 30 mins, safe
{ ttl: 3600, onExpire: 'soft-delete' }  // 1 hour, common
```

**Q: How do I expire based on last activity instead of creation?**

A: Use `field` option:
```javascript
{ field: 'lastActivity', ttl: 1800 }  // Expire 30 mins after last activity
```

**Q: Can I override cleanup schedules?**

A: Yes, with cron expressions:
```javascript
schedules: {
  hour: '*/15 * * * *'    // Every 15 minutes instead of default 10m
}
```

**Q: What's the default batch size?**

A: 100 records. Increase for high-volume, decrease for memory-constrained environments.

---

### Strategy Questions

**Q: When should I use soft-delete vs hard-delete?**

A: **Soft-delete**: Need audit trail, might restore, compliance requires retention.
**Hard-delete**: Truly temporary, save storage, GDPR right-to-be-forgotten.

**Q: Can I change strategy after deployment?**

A: Not recommended. Changing from soft-delete to hard-delete will delete marked records. Create new resource with new strategy instead.

**Q: What's the difference between archive and callback?**

A: **Archive**: Built-in, copy to another resource, simple.
**Callback**: Custom logic, conditional decisions, complex operations.

**Q: Can callback run external service calls?**

A: Yes, common pattern:
```javascript
callback: async (record) => {
  await externalAPI.send(record);  // Send to external system
  return true;                     // Delete after sending
}
```

---

### Performance Questions

**Q: How many records can TTL Plugin handle?**

A: Unlimited. Partition-based indexing means O(1) performance regardless of total records. Cleanup 1M records in seconds.

**Q: What batch size should I use?**

A: Start with default 100. If slow, increase to 500-1000. If memory issues, decrease to 50.

**Q: Why is cleanup taking so long?**

A: Check:
1. Callback operations slow? → Parallelize
2. Archive resource slow? → Check resource performance
3. S3 throttled? → Reduce batch size, stagger schedules
4. Debug logging enabled? → Disable for production

**Q: How do I measure cleanup performance?**

A: Monitor scan events:
```javascript
ttlPlugin.on('plg:ttl:scan-completed', ({ granularity, duration }) => {
  console.log(`${granularity} scan: ${duration}ms`);
});
```

---

### Troubleshooting Questions

**Q: Cleanup never runs. Why?**

A: Check:
1. Is plugin initialized? `await db.usePlugin(ttlPlugin)`
2. Is database connected? `await db.connect()`
3. Coordinator elected? Check logs for `coordinator-elected` event
4. Any errors? Enable `logLevel: 'debug'`

**Q: Some records not expiring. Why?**

A: Check:
1. TTL values correct?
2. Timestamp field exists? (`field` option)
3. Timestamp format valid ISO?
4. Resource in TTL config?

**Q: Cleanup deleting too many records. How to stop?**

A: Immediately:
1. Disable plugin (if possible)
2. Check soft-deleted records (can restore)
3. Check archived records
4. For hard-deleted: check S3 version history (if enabled)

**Q: Plugin crashes with "out of memory". Help!**

A: Reduce batch size and schedule frequency:
```javascript
new TTLPlugin({
  batchSize: 50,      // Reduced from 100
  schedules: {
    hour: '0 */2 * * *'  // Every 2 hours (reduced frequency)
  }
});
```

---

### Integration Questions

**Q: Can I use TTL with other plugins?**

A: Yes! Common combinations:
- **TTL + Cache**: Cache auto-expires
- **TTL + Replicator**: Archive to BigQuery, then TTL delete
- **TTL + Audit**: Audit logs kept, main data TTL'd

**Q: Can I archive to external database?**

A: Use callback for custom logic:
```javascript
callback: async (record) => {
  await externalDB.insert(record);  // Archive to external
  return true;                      // Delete from s3db
}
```

**Q: How do I sync archived records?**

A: Use callback + Replicator:
```javascript
// TTL archives to s3db resource
// Replicator syncs that resource to external DB
```

---

### Monitoring Questions

**Q: How do I monitor TTL cleanup?**

A: Use events:
```javascript
ttlPlugin.on('plg:ttl:record-expired', ({resource, recordId}) => {
  console.log(`Expired: ${recordId}`);
});

ttlPlugin.on('plg:ttl:scan-completed', ({granularity, totalExpired}) => {
  console.log(`Scan: ${totalExpired} expired`);
});

ttlPlugin.on('plg:ttl:cleanup-error', ({error}) => {
  console.error('Error:', error);
});
```

**Q: Can I get cleanup statistics?**

A: Yes:
```javascript
const stats = ttlPlugin.getStats();
// {totalScans, totalExpired, totalDeleted, totalArchived, ...}
```

---

### Testing Questions

**Q: How do I test TTL configuration?**

A: Use short TTL in development:
```javascript
new TTLPlugin({
  logLevel: 'debug',
  resources: {
    test: { ttl: 30, onExpire: 'soft-delete' }  // 30 seconds
  }
});
// Wait 30-40 seconds, check records marked deleted
```

**Q: Can I manually trigger cleanup for testing?**

A: Yes:
```javascript
await ttlPlugin.cleanupResource('sessions');  // Clean one resource
await ttlPlugin.runCleanup();                  // Clean all resources
```

---

### Coordinator Mode Questions

**Q: How does coordinator election work?**

A: Lexicographic ordering by worker ID:
1. All workers start coordinator observation (cold start phase)
2. After observation window, highest worker ID becomes coordinator
3. Coordinator sends heartbeat every 30 seconds
4. If no heartbeat for 2 intervals, new coordinator elected

**Q: What if coordinator dies?**

A: Automatic failover within ~90 seconds (3 × heartbeat interval).

**Q: Can I force a specific pod to be coordinator?**

A: Not recommended. Automatic election handles failures better. If needed: stop/restart other pods.

---

## 📚 See Also

- **[Configuration](./configuration.md)** - All config options
- **[Usage Patterns](./usage-patterns.md)** - Examples and strategies
- **[README](../README.md)** - Plugin overview
- **[Coordinator Mode](../README.md#-coordinator-mode)** - Multi-pod deployment

---

**Still have questions?** Check [README](../README.md) or file an issue on GitHub.
