# Audit Plugin

> **Compliance-grade operation logging for every insert, update, and delete.**

---

## TLDR

Automatic tracking of **all** database operations (insert/update/delete) with complete history for compliance, security and debugging.

**1 line to get started:**
```javascript
await db.usePlugin(new AuditPlugin());  // Done! All operations are now logged
```

**Main features:**
- Automatic logging of insert/update/delete/deleteMany
- Stores before/after data (optional)
- User tracking via `getCurrentUserId()`
- Query by resource/operation/user/data
- Size control with `maxDataSize`

**When to use:**
- Compliance (GDPR, SOC2, HIPAA)
- Security auditing
- Debug unexpected changes
- User activity analytics

**Access:**
```javascript
const audits = s3db.resources.plg_audits;
const logs = await audits.list();
console.log(`Tracked ${logs.length} operations`);
```

---

## Quick Start

```javascript
import { S3db } from 's3db.js';
import { AuditPlugin } from 's3db.js';

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
```

---

## Dependencies

**NO Peer Dependencies!** AuditPlugin works out-of-the-box with **zero external dependencies**.

**What's Included:**
- Node.js built-in modules
- Core s3db.js functionality
- No NPM packages required

**Built-in Storage:**
- Automatic partitioning by date
- TTL-based automatic cleanup (optional)
- Full s3db query capabilities

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](/plugins/audit/guides/configuration.md) | All options, audit log structure, API reference |
| [Usage Patterns](/plugins/audit/guides/usage-patterns.md) | Progressive adoption, compliance patterns, recovery |
| [Best Practices](/plugins/audit/guides/best-practices.md) | Production tips, error handling, troubleshooting, FAQ |

---

## Quick Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable audit logging |
| `includeData` | boolean | `true` | Store before/after data snapshots |
| `maxDataSize` | number | `10000` | Maximum data payload size (bytes) |
| `getCurrentUserId` | function | `() => 'system'` | Function to get current user |
| `getMetadata` | function | `undefined` | Function to add custom metadata |
| `async` | boolean | `false` | Non-blocking audit logging |

### Audit Log Structure

```javascript
{
  id: 'audit-abc123',
  resourceName: 'users',
  operation: 'insert|update|delete|deleteMany',
  recordId: 'user-123',
  userId: 'admin-456',
  timestamp: '2024-01-15T10:30:00.000Z',
  oldData: '{"name":"John"}',      // For updates/deletes
  newData: '{"name":"John Doe"}',  // For inserts/updates
  metadata: '{"ip":"192.168.1.1"}' // Optional
}
```

### Key Methods

```javascript
// Get audit logs with filters
const logs = await plugin.getAuditLogs({
  resourceName: 'users',
  operation: 'deleted',
  startDate: new Date('2024-01-01')
});

// Get complete history for a record
const history = await plugin.getRecordHistory('users', 'user-123');

// Get aggregated statistics
const stats = await plugin.getAuditStats({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});

// Cleanup old logs
await plugin.cleanupOldAudits(90); // 90 days
```

### User Tracking

```javascript
new AuditPlugin({
  getCurrentUserId: () => req.user?.id || 'anonymous',
  getMetadata: () => ({
    ip: req.ip,
    userAgent: req.headers['user-agent']
  })
})
```

### Performance Options

```javascript
// High-volume applications
new AuditPlugin({
  async: true,           // Non-blocking
  includeData: false,    // Skip data payloads
  maxDataSize: 1000      // Or limit size
})
```

---

## Compliance Support

| Standard | Support |
|----------|---------|
| GDPR | Full data access tracking |
| HIPAA | PHI access audit trail |
| SOC 2 | Automated operation logging |
| ISO 27001 | Complete activity monitoring |

---

## See Also

- [Metrics Plugin](/plugins/metrics/README.md) - Monitor performance alongside audit logs
- [Replicator Plugin](/plugins/replicator/README.md) - Replicate audit logs to external systems
- [Costs Plugin](/plugins/costs/README.md) - Track audit logging costs
