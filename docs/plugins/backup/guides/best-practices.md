# Best Practices & FAQ

> **In this guide:** Production recommendations, error handling, monitoring, troubleshooting, and FAQ.

**Navigation:** [← Back to Backup Plugin](../README.md) | [Configuration](./configuration.md)

---

## Best Practices

### 1. Choose the Right Driver Strategy

```javascript
// For critical data: Multi-destination with 'all' strategy
{
  driver: 'multi',
  config: {
    strategy: 'all', // Ensure all destinations succeed
    drivers: [
      { driver: 'filesystem', config: { path: '/local/backup/' } },
      { driver: 's3', config: { bucket: 'remote-backup' } }
    ]
  }
}

// For cost optimization: Priority strategy
{
  strategy: 'priority', // Try cheap options first
  drivers: [
    { driver: 'filesystem', config: {...} }, // Fast, cheap
    { driver: 's3', config: { storageClass: 'GLACIER' } } // Slow, cheap
  ]
}
```

### 2. Implement Proper Retention Policies

```javascript
// Production environment
retention: {
  daily: 30,    // 30 days of daily backups
  weekly: 12,   // 3 months of weekly backups
  monthly: 24,  // 2 years of monthly backups
  yearly: 5     // 5 years of yearly backups
}

// Development environment
retention: {
  daily: 7,     // 1 week of daily backups
  weekly: 4     // 1 month of weekly backups
}
```

### 3. Use Compression Appropriately

```javascript
// For network storage or cloud backups
{
  compression: 'gzip', // Good balance of speed and compression
  config: {
    storageClass: 'STANDARD_IA' // Reduce storage costs
  }
}

// For local fast storage
{
  compression: 'none', // Skip compression for speed
  verification: true   // But always verify integrity
}
```

### 4. Monitor Backup Health

```javascript
const monitorBackups = async () => {
  const backups = await backupPlugin.listBackups({ limit: 5 });
  const latestBackup = backups[0];

  if (!latestBackup) {
    console.warn('No backups found!');
    return;
  }

  const age = Date.now() - new Date(latestBackup.timestamp).getTime();
  const hoursOld = age / (1000 * 60 * 60);

  if (hoursOld > 25) { // More than 25 hours old
    console.warn(`Latest backup is ${Math.round(hoursOld)} hours old`);
  }

  // Test backup integrity
  const status = await backupPlugin.getBackupStatus(latestBackup.id);
  if (status.status !== 'completed') {
    console.error(`Latest backup status: ${status.status}`);
  }
};

// Run every hour
setInterval(monitorBackups, 60 * 60 * 1000);
```

### 5. Secure Sensitive Data

```javascript
// Always encrypt sensitive data
{
  encryption: {
    algorithm: 'AES-256-GCM',
    key: process.env.BACKUP_ENCRYPTION_KEY, // Store securely
    keyDerivation: {
      algorithm: 'PBKDF2',
      iterations: 100000,
      salt: process.env.BACKUP_SALT
    }
  },
  verification: true // Always verify encrypted backups
}
```

### 6. Test Restore Procedures

```javascript
// Regular restore testing
const testRestore = async () => {
  const backups = await backupPlugin.listBackups({ limit: 1 });
  if (backups.length === 0) return;

  const testDb = new S3db({
    connectionString: "s3://test:test@test-bucket/restore-test"
  });

  try {
    await testDb.connect();

    // Test selective restore
    await backupPlugin.restore(backups[0].id, {
      target: testDb,
      resources: ['users'], // Test with smaller dataset
      overwrite: true
    });

    // Verify data
    const testUsers = testDb.resources.users;
    const count = await testUsers.count();

    console.log(`Restore test successful: ${count} users restored`);

  } catch (error) {
    console.error('Restore test failed:', error);
  } finally {
    await testDb.disconnect();
  }
};

// Test monthly
setInterval(testRestore, 30 * 24 * 60 * 60 * 1000);
```

---

## Event-Driven Monitoring

```javascript
const backupPlugin = new BackupPlugin({
  driver: 'filesystem',
  config: { path: './backups/' },

  // Lifecycle hooks
  onBackupStart: async (type, { backupId }) => {
    console.log(`Starting ${type} backup: ${backupId}`);
    await notifySlack(`Backup ${backupId} started`);
  },

  onBackupComplete: async (type, stats) => {
    console.log(`${type} backup completed:`, {
      id: stats.backupId,
      size: `${Math.round(stats.size / 1024)}KB`,
      duration: `${stats.duration}ms`
    });
  },

  onBackupError: async (type, { backupId, error }) => {
    console.error(`Backup ${backupId} failed:`, error.message);
    await alertOps(error);
  }
});

// Event listeners
backupPlugin.on('plg:backup:start', ({ id, type }) => {
  updateDashboard(`Backup ${id} started`);
});

backupPlugin.on('plg:backup:complete', ({ id, type, size, duration }) => {
  metrics.record('backup.completed', { type, size, duration });
});

backupPlugin.on('plg:backup:restore-complete', ({ id, restored }) => {
  console.log(`Restored ${restored.length} resources from ${id}`);
});
```

---

## Error Handling

### Error Structure

```javascript
try {
  await backupPlugin.backup('full');
} catch (error) {
  console.log(error.name);        // 'BackupError'
  console.log(error.message);     // Human readable summary
  console.log(error.statusCode);  // HTTP-aligned status (e.g. 409)
  console.log(error.retriable);   // Should we retry automatically?
  console.log(error.suggestion);  // Actionable remediation tip
  console.log(error.operation);   // 'backup', 'restore', 'verify', etc.
  console.log(error.metadata);    // Extra context (backupId, driver info, ...)
}
```

### Common Errors

#### Driver Configuration Error
```javascript
// Invalid driver configuration
new BackupPlugin({
  driver: 'filesystem',
  config: { path: null } // Missing required path
});

// Error: BackupError
// statusCode: 400
// retriable: false
// Suggestion: Provide a valid config.path for the filesystem driver.
```

#### Backup Upload Failed
```javascript
// Cannot write to destination
await backupPlugin.backup('full');

// Error: BackupError
// statusCode: 502
// retriable: true
// Suggestion: Check disk space/permissions or network connectivity, then retry.
// Common causes:
// 1. Insufficient disk space
// 2. Permission denied
// 3. Path does not exist
// 4. Network connectivity (S3)
```

#### Restore Failed
```javascript
// Backup not found or corrupted
await backupPlugin.restore('invalid-backup-id');

// Error: BackupError
// statusCode: 404
// retriable: false
// Suggestion: Confirm the backupId exists or run backupPlugin.list() before restoring.
```

#### Multi-Destination Strategy Failed
```javascript
// All destinations must succeed but one failed
new BackupPlugin({
  driver: 'multi',
  config: {
    strategy: 'all',
    drivers: [
      { driver: 'filesystem', config: { path: '/valid/' } },
      { driver: 's3', config: { bucket: 'invalid' } } // This fails
    ]
  }
});

// Error: BackupError
// statusCode: 502
// retriable: true
// Suggestion: Inspect individual driver errors in error.metadata.destinations.
```

### Error Prevention

```javascript
// Validate configuration before creating backups
const backupPlugin = new BackupPlugin({
  driver: 'filesystem',
  config: {
    path: '/backups/{date}/',
    permissions: 0o644
  },
  verification: true,  // Always verify backups
  logLevel: 'debug'    // Enable detailed logging
});

// Check backup status before restore
const status = await backupPlugin.getBackupStatus(backupId);
if (status.status === 'completed' && status.checksum) {
  await backupPlugin.restore(backupId);
}

// Handle errors gracefully
try {
  await backupPlugin.backup('full');
} catch (error) {
  if (error.name === 'BackupError') {
    console.error('Backup failed:', error.description);

    if (error.operation === 'upload') {
      await notifyOps('Backup upload failed', error);
    }
  }
}
```

### Error Reference

| Operation | Common Causes | Solutions |
|-----------|---------------|-----------|
| `backup` | Disk space, permissions, network | Check storage space, verify credentials |
| `restore` | Missing backup, corruption | Verify backup exists and is valid |
| `list` | Storage access denied | Check S3/filesystem permissions |
| `deleted` | Backup in use, permissions | Ensure backup is not being accessed |
| `cleanup` | Retention policy error | Verify retention configuration |

---

## Troubleshooting

### Backup fails with permission errors
**Solution**: Check filesystem permissions and S3 bucket policies. Ensure proper read/write access.

### Large backup files consuming disk space
**Solution**: Enable compression, implement retention policies, and consider using S3 storage classes.

### Slow backup performance
**Solution**: Use multi-destination with concurrent uploads, optimize compression settings, or use faster storage.

### Backup verification fails
**Solution**: Check for corruption during transfer, verify checksums, and ensure stable network connection.

### Cannot restore specific resources
**Solution**: Verify resource names in backup, check for schema changes, and ensure compatible versions.

---

## Performance & Memory

### Memory Usage

The BackupPlugin uses streaming export for constant memory usage:

```
Dataset: 1M records × 2KB = 2GB total
Memory: ~10KB constant (streaming!)

vs. Non-streaming approach:
Memory: 2GB+ (loads entire dataset)
```

**Streaming Benefits:**
- Backup databases of any size
- No memory limits or OOM errors
- Constant ~10KB buffer regardless of dataset size
- Handles millions of records efficiently

### Performance Benchmarks

**Full Backup Performance:**
```
Dataset: 1M records (~2GB)
Time: ~2 minutes
Throughput: ~8,300 records/sec
Compression: 70-90% size reduction (gzip)
```

**Incremental Backup Performance:**
```
Dataset: 10K changed records
Time: ~1 second
Throughput: ~10,000 records/sec
```

### Storage Efficiency

**Compression Savings:**
```
Original size: 2GB
JSONL.gz: 200-600MB (70-90% reduction)
+ s3db.json: ~10KB (metadata)
```

---

## CLI Integration

```bash
# Create backups
s3db backup full --connection "s3://key:secret@bucket"
s3db backup incremental --connection "s3://key:secret@bucket"

# List and status
s3db backup --list --connection "s3://key:secret@bucket"
s3db backup --status backup-id --connection "s3://key:secret@bucket"

# Restore operations
s3db restore backup-id --connection "s3://key:secret@bucket"
s3db restore backup-id --overwrite --connection "s3://key:secret@bucket"
```

---

## FAQ

### Basics

**Q: What does the BackupPlugin do?**
A: Creates automated backups of the entire database or specific resources, with support for compression, encryption, and multiple destinations.

**Q: Which drivers are available?**
A: `filesystem` (local disk), `s3` (remote S3), `multi` (simultaneous multiple destinations).

**Q: Does it support incremental backups?**
A: Yes, use `type: 'incremental'` to backup only changes since the last full backup.

**Q: What is the backup format?**
A: JSONL (JSON Lines) compressed with gzip (.jsonl.gz) + s3db.json file with metadata. Compatible with BigQuery, Athena, and other analytics tools.

**Q: How does streaming work?**
A: The BackupPlugin writes records one by one without loading the entire dataset into memory, using only ~10KB of constant RAM regardless of database size.

### Configuration

**Q: How to configure filesystem backup?**
A:
```javascript
new BackupPlugin({
  driver: 'filesystem',
  config: {
    path: '/var/backups/s3db/{date}/',
    compression: 'gzip'
  },
  retention: {
    daily: 7,
    weekly: 4,
    monthly: 12
  }
})
```

**Q: How to configure S3 backup?**
A:
```javascript
new BackupPlugin({
  driver: 's3',
  config: {
    bucket: 'my-backups',
    path: 'database/{date}/',
    storageClass: 'GLACIER'
  }
})
```

**Q: How to configure multiple destinations?**
A:
```javascript
new BackupPlugin({
  driver: 'multi',
  config: {
    strategy: 'all',  // 'all', 'any', 'priority'
    drivers: [
      { driver: 'filesystem', config: { path: '/backup/' } },
      { driver: 's3', config: { bucket: 'remote' } }
    ]
  }
})
```

### Operations

**Q: How to create a manual backup?**
A:
```javascript
const result = await backupPlugin.backup('full');
// Returns: { id, type, size, duration, checksum, driverInfo }
```

**Q: How to restore a backup?**
A:
```javascript
const result = await backupPlugin.restore('full-2025-01-15-abc123', {
  resources: ['users', 'orders'],  // null = all
  overwrite: true
});
```

**Q: How to list available backups?**
A:
```javascript
const backups = await backupPlugin.listBackups({ limit: 20 });
```

**Q: How to get backup status?**
A:
```javascript
const status = await backupPlugin.getBackupStatus('full-2025-01-15-abc123');
// Returns: { id, type, status, size, checksum, error, ... }
```

### Retention

**Q: How does the GFS retention policy work?**
A: Grandfather-Father-Son:
- Daily: keeps X daily backups
- Weekly: keeps X weekly backups
- Monthly: keeps X monthly backups
- Yearly: keeps X yearly backups

**Q: How to cleanup old backups?**
A:
```javascript
const cleaned = await backupPlugin.cleanupBackups();
console.log(`Cleaned up ${cleaned.count} old backups`);
```

### Security

**Q: How to encrypt backups?**
A:
```javascript
new BackupPlugin({
  encryption: {
    algorithm: 'AES-256-GCM',
    key: process.env.BACKUP_ENCRYPTION_KEY
  }
})
```

**Q: How to verify integrity?**
A: Checksum verification is automatic if `verification: true` (default).

### Troubleshooting

**Q: Backup is failing?**
A: Check:
1. Write permissions on destination
2. Sufficient disk space
3. Correct credentials (S3)
4. Use `logLevel: 'debug'` for logs

**Q: Restore is failing?**
A: Check:
1. Backup exists and is complete
2. Valid checksum
3. Resources exist in destination database

---

## See Also

- [Configuration](./configuration.md) - All options and driver types
- [Usage Patterns](./usage-patterns.md) - Step-by-step usage levels
