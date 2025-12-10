# Configuration

> **In this guide:** All configuration options, audit log structure, and API reference.

**Navigation:** [← Back to Audit Plugin](/plugins/audit/README.md)

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable audit logging globally |
| `includeData` | boolean | `true` | Store before/after data snapshots in logs |
| `includePartitions` | boolean | `true` | Include partition field values in logs |
| `maxDataSize` | number | `10000` | Maximum size of data payloads (bytes). Larger data is truncated. |
| `getCurrentUserId` | function | `() => 'system'` | Function to extract current user ID |
| `getMetadata` | function | `undefined` | Function to add custom metadata to logs |
| `resources` | string[] | `undefined` | Only log specific resources (whitelist) |
| `operations` | string[] | `undefined` | Only log specific operations |
| `shouldAudit` | function | `undefined` | Custom filter function |
| `async` | boolean | `false` | Non-blocking audit logging |
| `ttl` | number | `undefined` | TTL for automatic cleanup (ms) |
| `debug` | boolean | `false` | Enable detailed logging |
| `onError` | function | `undefined` | Error callback handler |

---

## Audit Log Structure

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

## Configuration Examples

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
```

### Example 5: Filtered Audit Logging

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

### Example 6: With Metadata

Enrich logs with custom context:

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
```

---

## API Reference

### Plugin Methods

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

#### `getPartitionHistory(resourceName, partitionName, partitionValues)`

Get history for a specific partition:

```javascript
const history = await plugin.getPartitionHistory(
  'orders',
  'byRegion',
  { region: 'US' }
);
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
```

#### `cleanupOldAudits(days)`

Remove old audit logs:

```javascript
const deleted = await plugin.cleanupOldAudits(90); // Remove logs older than 90 days
console.log(`Deleted ${deleted} old audit logs`);
```

---

## Accessing Audit Logs Directly

Query the audit resource directly:

```javascript
const audits = s3db.resources.plg_audits;

// Get all changes to a specific record
const userHistory = await audits.list({
  filter: log => log.resourceName === 'users' && log.recordId === 'user-123'
});

// Get recent deletions
const deletions = await audits.list({
  filter: log => log.operation === 'deleted' &&
    new Date(log.timestamp) > new Date(Date.now() - 24*60*60*1000)
});

console.log(`${deletions.length} deletions in last 24h`);
```

---

## See Also

- [Usage Patterns](/plugins/audit/guides/usage-patterns.md) - Examples and compliance patterns
- [Best Practices](/plugins/audit/guides/best-practices.md) - Recommendations and FAQ
