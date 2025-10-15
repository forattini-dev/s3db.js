# 📝 Audit Plugin

## ⚡ TLDR

Automatic tracking of **all** database operations (insert/update/delete) with complete history for compliance, security and debugging.

**1 line to get started:**
```javascript
await db.usePlugin(new AuditPlugin());  // Done! All operations are now logged
```

**Key features:**
- ✅ Automatic logging of insert/update/delete/deleteMany
- ✅ Stores before/after data (optional)
- ✅ User tracking via `getCurrentUserId()`
- ✅ Query by resource/operation/user/data
- ✅ Size control with `maxDataSize`

**When to use:**
- 🔐 Compliance (GDPR, SOC2, HIPAA)
- 🕵️ Security auditing
- 🐛 Debug unexpected changes
- 📊 User activity analytics

---

## ⚡ Quickstart

```javascript
import { S3db, AuditPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://key:secret@bucket/path",
  plugins: [new AuditPlugin()]
});

await s3db.connect();

// All operations are now automatically logged
const users = s3db.resource('users');
await users.insert({ id: 'user-1', name: 'John', email: 'john@example.com' });
await users.update('user-1', { name: 'John Doe' });
await users.delete('user-1');

// Check audit logs
const audits = s3db.resource('plg_audits');
const logs = await audits.list();

console.log(`Tracked ${logs.length} operations:`, logs.map(l =>
  `${l.operation} on ${l.resourceName} by ${l.userId}`
));
// Output: Tracked 3 operations: ['insert on users by system', 'update on users by system', 'delete on users by system']
```

---

## 📊 Configuration Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable audit logging globally |
| `includeData` | boolean | `true` | Store before/after data snapshots in logs |
| `includePartitions` | boolean | `true` | Include partition field values in logs |
| `maxDataSize` | number | `10000` | Maximum size of data payloads (bytes). Larger data is truncated. |

**Audit Log Structure:**
```javascript
{
  id: 'audit-abc123',
  resourceName: 'users',
  operation: 'insert|update|delete|deleteMany',
  recordId: 'user-123',
  userId: 'admin-456',
  timestamp: '2024-01-15T10:30:00.000Z',
  oldData: '{"name":"John"}',           // JSON string (for updates/deletes)
  newData: '{"name":"John Doe"}',       // JSON string (for inserts/updates)
  partition: 'byStatus',                // Optional: partition name
  partitionValues: '{"status":"active"}', // Optional: partition values
  metadata: '{"ip":"192.168.1.1"}'      // Optional: custom metadata
}
```

---

## 📚 Configuration Examples

### Example 1: Basic Audit (Default)

All operations tracked with full data:

```javascript
new AuditPlugin()

// Tracks: insert, update, delete, deleteMany
// Includes: before/after data, partition info
// Storage: plg_audits resource
```

### Example 2: Minimal Audit (Metadata Only)

Track operations without storing data payloads:

```javascript
new AuditPlugin({
  includeData: false,
  includePartitions: false
})

// Use case: GDPR compliance, reduce storage costs
// Tracks: who did what, when
// Excludes: actual data content
```

### Example 3: Custom User Tracking

Extract user from request context:

```javascript
new AuditPlugin({
  getCurrentUserId: () => {
    // Access your auth context here
    return global.currentUser?.id || 'anonymous';
  }
})

const audits = s3db.resource('plg_audits');
const logs = await audits.list();

console.log('User activity:', logs.map(l =>
  `${l.userId} performed ${l.operation} on ${l.resourceName}`
));
// Output: User activity: ['admin-123 performed insert on users', 'user-456 performed update on products']
```

### Example 4: Large Data Truncation

Control storage size for large records:

```javascript
new AuditPlugin({
  includeData: true,
  maxDataSize: 1000  // 1KB limit
})

// Records larger than 1KB will be truncated with metadata:
// {
//   ...data,
//   _truncated: true,
//   _originalSize: 5234,
//   _truncatedAt: '2024-01-15T10:30:00.000Z'
// }

const audits = s3db.resource('plg_audits');
const truncated = (await audits.list()).filter(l =>
  l.newData?.includes('_truncated')
);

console.log(`${truncated.length} logs were truncated`);
```

### Example 5: Query Audit History

Find specific operations:

```javascript
const audits = s3db.resource('plg_audits');

// Get all changes to a specific record
const userHistory = await audits.list({
  filter: log => log.resourceName === 'users' && log.recordId === 'user-123'
});

console.log(`User user-123 history:`, userHistory.map(h => ({
  operation: h.operation,
  timestamp: h.timestamp,
  changedBy: h.userId
})));

// Get recent deletions
const deletions = await audits.list({
  filter: log => log.operation === 'delete' &&
    new Date(log.timestamp) > new Date(Date.now() - 24*60*60*1000)
});

console.log(`${deletions.length} deletions in last 24h`);
```

---

## 🔧 API Reference

### Plugin Methods

The AuditPlugin adds these helper methods:

#### `getAuditLogs(options)`

Query audit logs with filters:

```javascript
const plugin = s3db.plugins.find(p => p instanceof AuditPlugin);

const logs = await plugin.getAuditLogs({
  resourceName: 'users',
  operation: 'delete',
  recordId: 'user-123',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  limit: 100,
  offset: 0
});

console.log(`Found ${logs.length} matching audit logs`);
```

#### `getRecordHistory(resourceName, recordId)`

Get complete history for a specific record:

```javascript
const history = await plugin.getRecordHistory('users', 'user-123');

console.log('Record history:', history.map(h => ({
  operation: h.operation,
  timestamp: h.timestamp,
  user: h.userId
})));
```

#### `getAuditStats(options)`

Get aggregated statistics:

```javascript
const stats = await plugin.getAuditStats({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});

console.log('Audit statistics:', {
  total: stats.total,
  byOperation: stats.byOperation,
  byResource: stats.byResource,
  byUser: stats.byUser
});
// Output: Audit statistics: { total: 1250, byOperation: { insert: 500, update: 600, delete: 150 }, ... }
```

---

## ✅ Best Practices

### 1. Minimize Storage Costs

```javascript
// For high-volume applications
new AuditPlugin({
  includeData: false,      // Don't store data payloads
  maxDataSize: 1000        // Or limit size
})
```

### 2. Query Efficiently

```javascript
// Use filters instead of loading all logs
const audits = s3db.resource('plg_audits');
const recent = await audits.list({
  filter: log => new Date(log.timestamp) > new Date(Date.now() - 86400000)
});
```

### 3. Cleanup Old Logs

```javascript
// Archive or delete logs older than 90 days
const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
const oldLogs = await audits.list({
  filter: log => new Date(log.timestamp) < cutoff
});

for (const log of oldLogs) {
  await audits.delete(log.id);
}

console.log(`Cleaned up ${oldLogs.length} old audit logs`);
```

---

## 🔗 See Also

- [Metrics Plugin](./metrics.md) - Monitor performance alongside audit logs
- [Replicator Plugin](./replicator.md) - Replicate audit logs to external systems
- [Costs Plugin](./costs.md) - Track audit logging costs

---

## 🐛 Troubleshooting

**Issue: Audit logs not appearing**
- Solution: Check `enabled: true` and ensure `plg_audits` resource exists

**Issue: Too much storage used**
- Solution: Set `includeData: false` or reduce `maxDataSize`

**Issue: Missing user information**
- Solution: Implement `getCurrentUserId()` to extract user from your auth context

