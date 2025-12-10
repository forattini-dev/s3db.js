# Usage Patterns

> **In this guide:** Step-by-step usage levels from basic to production-ready.

**Navigation:** [← Back to Backup Plugin](../README.md) | [Configuration](./configuration.md)

---

## Usage Journey

### Level 1: Simple Daily Backups

Start here for basic disaster recovery:

```javascript
// Step 1: Create backup plugin
const plugin = new BackupPlugin({
  driver: 'filesystem',
  config: { path: './backups/' }
});

// Step 2: Run daily backup (cron or manual)
await plugin.backup('full');
// Creates: ./backups/backup-2024-01-15-143052.tar.gz

// Step 3: List backups
const backups = await plugin.list();
console.log(`${backups.length} backups available`);

// Step 4: Restore if needed
await plugin.restore(backups[0].id);
```

**What you get:** Simple disaster recovery, local backups.

### Level 2: Add Compression & Retention

Reduce storage and auto-cleanup old backups:

```javascript
const plugin = new BackupPlugin({
  driver: 'filesystem',
  config: {
    path: './backups/',
    compression: 'gzip',  // 60-70% size reduction
    retention: {
      policy: 'simple',
      count: 7  // Keep last 7 backups only
    }
  }
});

await plugin.backup('full');
// - Compressed with gzip (~60% smaller)
// - Auto-deletes backups older than 7 days
```

**What you get:** 60% storage savings, automatic cleanup.

### Level 3: Production - S3 Backups

For production, use S3 for durability:

```javascript
const plugin = new BackupPlugin({
  driver: 's3',
  config: {
    bucket: 'my-backups',
    region: 'us-west-2',  // Different region than production
    prefix: 'production/db/',
    compression: 'gzip',
    retention: {
      policy: 'gfs',  // Grandfather-Father-Son
      daily: 7,
      weekly: 4,
      monthly: 12
    }
  }
});

await plugin.backup('full');
```

**What you get:** 99.999999999% durability, GFS retention, different region for DR.

### Level 4: Multi-Destination Backups

Ultimate redundancy with multiple backup locations:

```javascript
const plugin = new BackupPlugin({
  driver: 'multi',
  config: {
    drivers: [
      // Local for fast recovery
      {
        driver: 'filesystem',
        config: { path: '/mnt/backups/' }
      },

      // S3 for durability (same region)
      {
        driver: 's3',
        config: {
          bucket: 'backups-us-east-1',
          region: 'us-east-1',
          prefix: 'production/'
        }
      },

      // S3 Glacier for long-term (different region)
      {
        driver: 's3',
        config: {
          bucket: 'backups-eu-west-1',
          region: 'eu-west-1',
          storageClass: 'GLACIER_IR',  // Instant retrieval, cheaper
          prefix: 'archive/'
        }
      }
    ],
    compression: 'gzip',
    retention: {
      policy: 'gfs',
      daily: 7,
      weekly: 4,
      monthly: 12,
      yearly: 5
    }
  }
});

await plugin.backup('full');
// Backs up to 3 locations simultaneously:
// - Local: Fast recovery (<5min)
// - S3 US: Regional backup
// - S3 EU Glacier: Geographic redundancy + long-term archive
```

**What you get:** Triple redundancy, multi-region, instant local recovery + long-term archive.

### Level 5: Automated with Monitoring

Production-ready with scheduling and alerts:

```javascript
const plugin = new BackupPlugin({
  driver: 'multi',
  config: {
    drivers: [
      { driver: 'filesystem', config: { path: '/mnt/backups/' } },
      { driver: 's3', config: { bucket: 'backups-primary', region: 'us-east-1' } },
      { driver: 's3', config: { bucket: 'backups-secondary', region: 'eu-west-1', storageClass: 'GLACIER_IR' } }
    ],
    compression: 'gzip',
    retention: { policy: 'gfs', daily: 7, weekly: 4, monthly: 12 }
  }
});

// Schedule daily backups (cron: 2am daily)
cron.schedule('0 2 * * *', async () => {
  try {
    const start = Date.now();
    const backup = await plugin.backup('full');
    const duration = Date.now() - start;

    console.log(`Backup completed in ${duration}ms`);

    // Send success metric
    await metrics.increment('backup.success');
    await metrics.timing('backup.duration', duration);

    // Verify backup count
    const backups = await plugin.list();
    if (backups.length < 7) {
      await sendAlert('Warning: Less than 7 backups available');
    }
  } catch (error) {
    console.error('Backup failed:', error);

    // Send alert
    await sendAlert({
      severity: 'critical',
      title: 'Backup Failed',
      message: error.message,
      runbook: 'Check disk space and S3 permissions'
    });

    await metrics.increment('backup.failure');
  }
});

// Monthly restore test (verify backups work)
cron.schedule('0 3 1 * *', async () => {
  const backups = await plugin.list();
  const testBackup = backups[0];

  try {
    await plugin.restore(testBackup.id, {
      destination: 'test-restore-db'
    });

    console.log('Restore test successful');
    await sendNotification('Monthly backup restore test: PASSED');
  } catch (error) {
    await sendAlert({
      severity: 'high',
      title: 'Restore Test Failed',
      message: `Could not restore ${testBackup.id}: ${error.message}`
    });
  }
});
```

**What you get:** Automated backups, monitoring, alerts, monthly restore tests.

### Level 6: Selective Backups

Optimize costs by backing up only what you need:

```javascript
const plugin = new BackupPlugin({
  driver: 's3',
  config: {
    bucket: 'backups',
    region: 'us-east-1',
    compression: 'gzip'
  }
});

// Backup only specific resources
await plugin.backup('selective', {
  resources: ['users', 'orders'],  // Skip logs, analytics, temp data
  exclude: ['sessions', 'cache_*']
});

// Or incremental (only changes since last backup)
await plugin.backup('incremental', {
  since: lastBackupTime
});
```

**What you get:** Smaller backups, lower costs, faster backup/restore.

---

## Backup Types

### Full Backup

Complete database snapshot:

```javascript
const fullBackup = await backupPlugin.backup('full');
console.log(`Full backup: ${fullBackup.id} (${fullBackup.size} bytes)`);
```

### Incremental Backup

Changes since last backup:

```javascript
const incrementalBackup = await backupPlugin.backup('incremental');
```

### Selective Backup

Specific resources only:

```javascript
const selectiveBackup = await backupPlugin.backup('full', {
  resources: ['users', 'posts']
});
```

---

## Enterprise Multi-Region Setup

```javascript
const enterpriseBackup = new BackupPlugin({
  driver: 'multi',
  config: {
    strategy: 'all',
    drivers: [
      {
        driver: 's3',
        config: {
          bucket: 'backups-us-east-1',
          path: 'production/{date}/',
          storageClass: 'STANDARD_IA'
        }
      },
      {
        driver: 's3',
        config: {
          bucket: 'backups-eu-west-1',
          path: 'production/{date}/',
          storageClass: 'STANDARD_IA'
        }
      },
      {
        driver: 'filesystem',
        config: {
          path: '/mnt/backup-nas/s3db/{date}/'
        }
      }
    ]
  },
  retention: {
    daily: 30,
    weekly: 12,
    monthly: 24,
    yearly: 7
  },
  verification: true,
  compression: 'gzip'
});
```

---

## Partition-Based Backups

Backup only specific partitions:

```javascript
// Backup only US region data
await backup.backup('full', {
  resources: ['orders'],
  partitions: {
    byRegion: ['US']  // Only backup US partition
  }
});

// Backup multiple partitions
await backup.backup('full', {
  resources: ['orders'],
  partitions: {
    byRegion: ['US', 'EU'],  // US and EU partitions
    byStatus: ['active']     // Only active orders
  }
});
```

**Use cases:**
- Compliance (GDPR: backup only EU data)
- Testing (backup only test data partition)
- Performance (backup only active/hot data)

---

## Dry Run Mode

Test backups without writing files:

```javascript
const result = await backup.backup('full', {
  dryRun: true  // Don't write files, only calculate size/metadata
});

console.log(`Backup would be ${result.size} bytes`);
console.log(`Would backup ${result.recordCount} records`);
console.log(`Estimated duration: ${result.estimatedDuration}ms`);
```

**Use cases:**
- Estimating backup size before running
- Testing backup configuration
- Monitoring backup growth over time
- CI/CD pipeline validation

---

## Restore Operations

### Full Restore

```javascript
await backupPlugin.restore(backupId);
```

### Selective Restore

```javascript
await backupPlugin.restore(backupId, {
  resources: ['users']  // Only restore users
});
```

### Overwrite Existing

```javascript
await backupPlugin.restore(backupId, { overwrite: true });
```

### Restore with ImporterPlugin

For JSONL.gz backups, use ImporterPlugin:

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'jsonl',
  filePath: './backups/full-2025-10-21T02-00-00-abc123/users.jsonl.gz',
  batchSize: 1000,
  parallelism: 10
});
await db.usePlugin(importer);
await importer.import();  // Backup restored in ~12 seconds for 1M records
```

---

## See Also

- [Configuration](./configuration.md) - All options and driver types
- [Best Practices](./best-practices.md) - Production tips, error handling, FAQ
