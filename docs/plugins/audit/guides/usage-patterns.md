# Usage Patterns

> **In this guide:** Progressive adoption levels and compliance patterns.

**Navigation:** [← Back to Audit Plugin](/plugins/audit/README.md) | [Configuration](/plugins/audit/guides/configuration.md)

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
```

**What you get:** SOC2/HIPAA/GDPR compliance, full audit trail.

---

## Retention Policies

### HIPAA Retention (7 years)

```javascript
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
```

### Compliance Report Export

```javascript
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

---

## Recovery Patterns

### Recover Deleted Data

```javascript
const logs = await auditPlugin.getAuditLogs({
  resourceName: 'users',
  operation: 'deleted',
  recordId: 'user-123'
});
const deletedData = JSON.parse(logs[0].oldData);

// Restore the record
await users.insert(deletedData);
```

### Rollback Changes

```javascript
const history = await auditPlugin.getRecordHistory('users', 'user-123');
const previousVersion = JSON.parse(history[1].newData); // Get version before latest

await users.update('user-123', previousVersion);
```

---

## Integration with ReplicatorPlugin

Replicate audit logs to external systems:

```javascript
import { AuditPlugin, ReplicatorPlugin } from 's3db.js';

// Replicate audit logs to PostgreSQL/BigQuery/Elasticsearch
await db.usePlugin(new AuditPlugin());
await db.usePlugin(new ReplicatorPlugin({
  resources: ['plg_audits'],
  targets: [{
    type: 'postgres',
    connectionString: 'postgres://...',
    table: 'audit_logs'
  }]
}));
```

---

## See Also

- [Configuration](/plugins/audit/guides/configuration.md) - Detailed configuration options
- [Best Practices](/plugins/audit/guides/best-practices.md) - Recommendations and FAQ
