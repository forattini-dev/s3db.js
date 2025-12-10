# Best Practices & FAQ

> **In this guide:** Production recommendations, error handling, troubleshooting, and FAQ.

**Navigation:** [← Back to Audit Plugin](/plugins/audit/README.md) | [Configuration](/plugins/audit/guides/configuration.md)

---

## Best Practices

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

### 4. Use Async Mode for High Performance

```javascript
new AuditPlugin({
  async: true,           // Don't wait for audit log to be written
  includeData: false,    // Skip storing full record data
  excludeResources: [    // Skip low-priority resources
    'plg_cache',
    'plg_metrics'
  ]
})
```

**Performance Impact:**
| Mode | Insert Time | Overhead |
|------|-------------|----------|
| Without auditing | 45ms | - |
| Sync auditing | 92ms | +104% |
| Async auditing | 47ms | +4% |

---

## Error Handling

### Error 1: Audit Log Creation Failed

**Problem**: Plugin fails to create audit logs for operations.

**Solution:**
```javascript
try {
  await db.usePlugin(new AuditPlugin({ enabled: true }));
  await db.connect();
} catch (error) {
  if (error.message.includes('plg_audits')) {
    console.error('Audit resource not created. Check plugin initialization.');
  }
  throw error;
}
```

**Diagnosis:**
```javascript
// Check if audit resource exists
const audits = db.resources.plg_audits;
if (!audits) {
  console.error('Audit resource missing - plugin may not have initialized');
}
```

### Error 2: Audit Storage Quota Exceeded

**Solution:**
```javascript
new AuditPlugin({
  ttl: 90 * 24 * 60 * 60 * 1000,  // 90 days
  includeData: false,  // Don't store full record data
  maxDataSize: 1000    // Limit data size to 1KB
})
```

### Error 3: Missing User Information in Logs

**Solution:**
```javascript
new AuditPlugin({
  getCurrentUserId: (context) => {
    // Extract from request headers (API plugin)
    if (context?.req?.user) {
      return context.req.user.id;
    }

    // Extract from JWT token
    if (context?.auth?.userId) {
      return context.auth.userId;
    }

    // Extract from environment (batch jobs)
    if (process.env.BATCH_USER_ID) {
      return process.env.BATCH_USER_ID;
    }

    return 'system';  // Fallback
  }
})
```

### Error 4: Audit Logs Not Queryable by Date

**Solution**: Use partition-aware queries:

```javascript
const audits = db.resources.plg_audits;

// Good: Uses partition
const logs = await audits.getFromPartition({
  partitionName: 'byDate',
  partitionValue: '2024-01-15',
  limit: 100
});

// Bad: Full scan (slow)
const logs = await audits.query({
  'metadata.timestamp': { $gte: '2024-01-15T00:00:00Z' }
});
```

---

## Debug Mode

Enable detailed logging to diagnose issues:

```javascript
new AuditPlugin({
  debug: true,  // Logs all audit operations
  onError: (error, context) => {
    console.error('Audit error:', error);
    console.error('Context:', context);
    // Send to error tracking service
  }
})
```

---

## Troubleshooting Checklist

**Plugin Not Creating Logs:**
1. Check plugin is enabled: `enabled: true`
2. Verify `plg_audits` resource exists
3. Check S3 permissions (PutObject on bucket)
4. Verify plugin initialized before operations
5. Check no `excludeResources` blocking audits

**Storage Issues:**
1. Enable TTL: `ttl: 90 * 24 * 60 * 60 * 1000`
2. Disable data storage: `includeData: false`
3. Limit data size: `maxDataSize: 500`
4. Exclude plugin resources from auditing
5. Use partition-based cleanup

**Performance Issues:**
1. Enable async mode: `async: true`
2. Exclude reads: `operations: ['insert', 'update', 'delete']`
3. Whitelist critical resources only
4. Disable data inclusion
5. Consider ReplicatorPlugin for external storage

---

## Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| Logs not appearing | Check `enabled: true` and `plg_audits` exists |
| Too much storage | Set `includeData: false` or reduce `maxDataSize` |
| Missing user info | Implement `getCurrentUserId()` |
| Slow queries | Use partition queries (byDate, byResource) |
| Performance impact | Enable `async: true` |

---

## FAQ

### Basics

**Q: What is automatically audited?**
A: All operations: `inserted`, `updated`, `deleted` and `deleteMany`.

**Q: Where are logs stored?**
A: In a resource called `plg_audits` (by default), with partitioning by date and by resource.

**Q: What is the performance impact?**
A: Minimal with async mode (~4%). Sync mode adds ~100% overhead per operation.

---

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

---

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

---

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

---

### Compliance

**Q: Does AuditPlugin support HIPAA/SOC2/GDPR?**
A: Yes. Configure for compliance:
- `includeData: true` - Full audit trail
- `getCurrentUserId` - Track who accessed data
- `getMetadata` - Track IP, user agent, session
- Retention policy - 7 years for HIPAA

**Q: Are audit logs immutable?**
A: Logs are write-once, read-many. They're stored in S3 with server-side encryption and partitioned by date for compliance reporting.

---

## See Also

- [Configuration](/plugins/audit/guides/configuration.md) - Detailed configuration options
- [Usage Patterns](/plugins/audit/guides/usage-patterns.md) - Examples and compliance patterns
