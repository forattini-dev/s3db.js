# 📝 Audit Plugin

> **Compliance-grade operation logging for every insert, update, and delete.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

Automatic tracking of **all** database operations (insert/update/delete) with complete history for compliance, security and debugging.

**1 line to get started:**
```javascript
await db.usePlugin(new AuditPlugin());  // Done! All operations are now logged
```

> 🧩 **Namespaces**: Use `namespace: 'compliance'` (or pass an alias via `db.usePlugin`) when you need separate audit trails. The log resource becomes `plg_compliance_audits`.

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

**Performance & Compliance:**
```javascript
// ❌ Without audit: No record of changes
await users.delete('user-123'); // Who deleted? When? What data was lost?
// - Can't answer "who deleted the customer?"
// - Fails SOC2/HIPAA audits
// - Can't recover from accidents
// - No security forensics

// ✅ With audit: Complete history
await users.delete('user-123'); // Auto-logged with who/when/what
// Query: "Who deleted user-123?"
const log = await audits.query({ recordId: 'user-123', operation: 'deleted' });
// Answer: "admin@company.com at 2024-01-15 10:30:42, data: {...}"
// - Pass SOC2/HIPAA audits
// - Full forensic trail
// - Can investigate any change
```

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [Usage Journey](#usage-journey)
   - [Level 1: Basic Audit Trail](#level-1-basic-audit-trail)
   - [Level 2: Add User Tracking](#level-2-add-user-tracking)
   - [Level 3: Store Before/After Data](#level-3-store-beforeafter-data)
   - [Level 4: Add Metadata & Context](#level-4-add-metadata--context)
   - [Level 5: Filtered Audit Logging](#level-5-filtered-audit-logging)
   - [Level 6: Production - Compliance Ready](#level-6-production---compliance-ready)
4. [📊 Configuration Reference](#-configuration-reference)
5. [📚 Configuration Examples](#-configuration-examples)
6. [🔧 API Reference](#-api-reference)
7. [✅ Best Practices](#-best-practices)
8. [🔗 See Also](#-see-also)
9. [🐛 Troubleshooting](#-troubleshooting)
10. [❓ FAQ](#-faq)

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
const users = s3db.resources.users;
await users.insert({ id: 'user-1', name: 'John', email: 'john@example.com' });
await users.update('user-1', { name: 'John Doe' });
await users.delete('user-1');

// Check audit logs
const audits = s3db.resources.plg_audits;
const logs = await audits.list();

console.log(`Tracked ${logs.length} operations:`, logs.map(l =>
  `${l.operation} on ${l.resourceName} by ${l.userId}`
));
// Output: Tracked 3 operations: ['insert on users by system', 'update on users by system', 'delete on users by system']
```

---

## Usage Journey

### Level 1: Basic Audit Trail

Start here for simple operation tracking:

```javascript
// Step 1: Enable audit (one line!)
plugins: [new AuditPlugin()]

// Step 2: All operations auto-logged
await users.insert({ name: 'John' });   // Logged
await users.update('id', { name: 'Jane' });  // Logged
await users.delete('id');  // Logged

// Step 3: Query audit history
const audits = db.resources.plg_audits;
const userChanges = await audits.query({ resourceName: 'users' });
```

**What you get:** Complete operation history, zero code changes.

### Level 2: Add User Tracking

Know WHO made each change:

```javascript
new AuditPlugin({
  getCurrentUserId: () => {
    // Return current user ID from your auth system
    return req.user?.id || 'anonymous';
    // Or from Express session: req.session.userId
    // Or from JWT: extractUserFromToken(req.headers.authorization)
  }
})

// Now logs include userId
await users.delete('user-123');
// Logged: { userId: 'admin@company.com', operation: 'deleted', ... }

// Find who deleted records
const deletions = await audits.query({ operation: 'deleted', userId: 'admin@company.com' });
```

**What you get:** Know exactly WHO did WHAT.

### Level 3: Store Before/After Data

For compliance, store full data snapshots:

```javascript
new AuditPlugin({
  includeData: true,  // Store oldData/newData
  maxDataSize: 50000,  // 50KB limit per log
  getCurrentUserId: () => req.user?.id
})

// Updates now store before/after
await users.update('user-123', { email: 'newemail@example.com' });
// Logged: {
//   oldData: '{"email":"old@example.com"}',
//   newData: '{"email":"newemail@example.com"}',
//   userId: 'admin@company.com'
// }

// Investigate "what changed"
const log = await audits.get('audit-id');
const old = JSON.parse(log.oldData);
const now = JSON.parse(log.newData);
console.log(`Email changed from ${old.email} to ${now.email}`);
```

**What you get:** Full forensic trail, can see exact changes.

### Level 4: Add Metadata & Context

Enrich logs with custom data:

```javascript
new AuditPlugin({
  includeData: true,
  getCurrentUserId: () => req.user?.id,
  getMetadata: () => ({
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    sessionId: req.session?.id,
    apiVersion: 'v2'
  })
})

// Logs now include context
await users.delete('user-123');
// Logged: {
//   userId: 'admin@company.com',
//   metadata: '{"ip":"192.168.1.1","userAgent":"Chrome/120",...}'
// }

// Investigate suspicious activity
const suspiciousIp = '10.0.0.1';
const actions = await audits.query({
  metadata: { $contains: suspiciousIp }
});
```

**What you get:** Rich context for security investigations.

### Level 5: Filtered Audit Logging

Only log specific resources or operations:

```javascript
new AuditPlugin({
  includeData: true,
  getCurrentUserId: () => req.user?.id,

  // Only log sensitive resources
  resources: ['users', 'payments', 'personal_data'],

  // Or only log specific operations
  operations: ['deleted', 'updated'],  // Skip inserts

  // Or custom filter
  shouldAudit: ({ resourceName, operation, data }) => {
    // Don't log system resources
    if (resourceName.startsWith('plg_')) return false;

    // Always log deletes
    if (operation === 'deleted') return true;

    // Log updates to sensitive fields
    if (operation === 'updated' && ('email' in data || 'password' in data)) {
      return true;
    }

    return false;
  }
})
```

**What you get:** Controlled logging, reduced storage costs.

### Level 6: Production - Compliance Ready

Full compliance setup for HIPAA/SOC2/GDPR:

```javascript
new AuditPlugin({
  includeData: true,
  maxDataSize: 100000,  // 100KB for medical records

  getCurrentUserId: () => {
    // Extract from JWT or session
    const token = req.headers.authorization?.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.sub;  // User ID from JWT subject
  },

  getMetadata: () => ({
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  }),

  // HIPAA: Log all access to patient data
  resources: ['patients', 'medical_records', 'prescriptions'],

  // Log all operations for compliance
  operations: ['inserted', 'updated', 'deleted', 'deleteMany']
})

// Setup retention policy
const audits = db.resources.plg_audits;

// HIPAA: Keep 7 years
const retention = 7 * 365 * 24 * 60 * 60 * 1000;

// Cleanup old logs (run monthly)
setInterval(async () => {
  const cutoff = Date.now() - retention;
  const oldLogs = await audits.query({
    timestamp: { $lt: new Date(cutoff).toISOString() }
  });

  for (const log of oldLogs) {
    await audits.delete(log.id);
  }
  console.log(`Cleaned up ${oldLogs.length} audit logs`);
}, 30 * 24 * 60 * 60 * 1000);

// Export for compliance reports
app.get('/admin/audit-report', async (req, res) => {
  const { startDate, endDate, userId, resourceName } = req.query;

  const logs = await audits.query({
    timestamp: {
      $gte: startDate,
      $lte: endDate
    },
    ...(userId && { userId }),
    ...(resourceName && { resourceName })
  });

  res.json({
    period: { start: startDate, end: endDate },
    totalOperations: logs.length,
    byOperation: groupBy(logs, 'operation'),
    byUser: groupBy(logs, 'userId'),
    logs: logs
  });
});
```

**What you get:** SOC2/HIPAA/GDPR compliance, full audit trail, retention policies.

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

const audits = s3db.resources.plg_audits;
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

const audits = s3db.resources.plg_audits;
const truncated = (await audits.list()).filter(l =>
  l.newData?.includes('_truncated')
);

console.log(`${truncated.length} logs were truncated`);
```

### Example 5: Query Audit History

Find specific operations:

```javascript
const audits = s3db.resources.plg_audits;

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
  filter: log => log.operation === 'deleted' &&
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
  operation: 'deleted',
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
const audits = s3db.resources.plg_audits;
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

---

## ❓ FAQ

### Basics

**Q: What is automatically audited?**
A: All operations: `inserted`, `updated`, `deleted` and `deleteMany`.

**Q: Where are logs stored?**
A: In a resource called `plg_audits` (by default), with partitioning by date and by resource.

**Q: What is the performance impact?**
A: Minimal. The plugin uses asynchronous events and doesn't block main operations.

### Configuration

**Q: How to disable full data capture?**
A: Configure `includeData: false`:
```javascript
new AuditPlugin({
  includeData: false  // Only metadata, no oldData/newData
})
```

**Q: How to limit captured data size?**
A: Use `maxDataSize`:
```javascript
new AuditPlugin({
  maxDataSize: 5000  // Truncate after 5KB
})
```

**Q: How to track the user who performed the operation?**
A: Configure `getCurrentUserId`:
```javascript
const auditPlugin = new AuditPlugin();
auditPlugin.getCurrentUserId = () => currentUser.id;
```

### Operations

**Q: How to query a record's history?**
A: Use `getRecordHistory`:
```javascript
const history = await auditPlugin.getRecordHistory('users', 'user-123');
```

**Q: How to get logs from a specific partition?**
A: Use `getPartitionHistory`:
```javascript
const history = await auditPlugin.getPartitionHistory(
  'orders',
  'byRegion',
  { region: 'US' }
);
```

**Q: How to generate audit statistics?**
A: Use `getAuditStats`:
```javascript
const stats = await auditPlugin.getAuditStats({
  resourceName: 'users',
  startDate: '2025-01-01',
  endDate: '2025-01-31'
});
```

### Maintenance

**Q: How to cleanup old logs?**
A: Use `cleanupOldAudits`:
```javascript
const deleted = await auditPlugin.cleanupOldAudits(90); // Remove logs older than 90 days
```

**Q: How to recover deleted data?**
A: Query the audit log and use the `oldData` field:
```javascript
const logs = await auditPlugin.getAuditLogs({
  resourceName: 'users',
  operation: 'deleted',
  recordId: 'user-123'
});
const deletedData = JSON.parse(logs[0].oldData);
```

### Troubleshooting

**Q: Logs are not being created?**
A: Check if the `plg_audits` resource was created correctly and if there are errors in the console (enable `verbose: true`).

