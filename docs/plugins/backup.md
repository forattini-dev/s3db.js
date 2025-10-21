# 💾 Backup Plugin

## ⚡ TLDR

Backup/restore system with **streaming architecture** (~10KB constant memory), **JSONL format**, and **multiple drivers** (filesystem/S3/multi).

**2 lines to get started:**
```javascript
const plugin = new BackupPlugin({ driver: 'filesystem', config: { path: './backups/' } });
await plugin.backup('full');  // Full backup created!
```

**Key features:**
- ✅ Streaming export: Constant ~10KB memory (handles any dataset size)
- ✅ JSONL.gz format: 70-90% compression + BigQuery/Athena compatible
- ✅ s3db.json metadata: Full schemas for restore
- ✅ Drivers: filesystem, S3, multi-destination
- ✅ Types: full, incremental, selective
- ✅ GFS retention: daily/weekly/monthly/yearly
- ✅ Path templates: `{date}`, `{time}`, `{year}`

**When to use:**
- 💾 Disaster recovery
- 🔄 Migration between environments
- 📦 Long-term archiving
- 🌍 Multi-region backup

---

## 🆚 BackupPlugin vs ReplicatorPlugin

**BackupPlugin** creates **periodic snapshots** of your entire database (like taking photos):
- ✅ Full database state at specific timestamps
- ✅ Scheduled (cron) or manual execution
- ✅ All resources exported at once (batch)
- ✅ JSONL.gz format for portability
- ✅ Perfect for: disaster recovery, compliance, migrations

**ReplicatorPlugin** provides **real-time CDC** (Change Data Capture):
- ✅ Individual records replicated as they change
- ✅ Triggered on every insert/update/delete
- ✅ Near real-time (<10ms latency)
- ✅ Multiple destinations: PostgreSQL, BigQuery, SQS, Webhooks
- ✅ Perfect for: analytics, event sourcing, multi-region sync

| Aspect | BackupPlugin | ReplicatorPlugin |
|--------|-------------|------------------|
| **Timing** | Scheduled (hourly/daily) | Every operation |
| **Granularity** | All resources at once | 1 record at a time |
| **Latency** | Minutes/hours | Milliseconds |
| **Use Case** | Disaster recovery | Real-time analytics |
| **Format** | JSONL + s3db.json | Service-specific |

**Use Both Together:**
```javascript
// BackupPlugin for disaster recovery
new BackupPlugin({
  driver: 's3',
  config: { bucket: 'backups' },
  schedule: { daily: '0 2 * * *' }  // 2am daily
})

// ReplicatorPlugin for real-time analytics
new ReplicatorPlugin({
  replicators: [{
    driver: 'bigquery',
    resources: ['events', 'users'],
    config: { projectId: 'my-project', dataset: 'analytics' }
  }]
})
```

📚 See [ReplicatorPlugin docs](./replicator.md) for real-time replication.

---

**Recovery Time:**
```javascript
// ❌ Without backups: Data loss is permanent
// Database corruption or accidental delete = business over

// ✅ With BackupPlugin: Fast recovery
const plugin = new BackupPlugin({ driver: 'filesystem' });
await plugin.backup('full'); // Daily automated

// When disaster strikes:
const backups = await plugin.list();
await plugin.restore(backups[0].id); // Restored in minutes
// - Latest backup: 24h old max
// - Recovery time: <5 minutes for 1GB database
// - Zero data loss (except last 24h)
```

---

## 📋 Table of Contents

- [Overview](#overview)
- [Usage Journey](#usage-journey) - **Start here to learn step-by-step**
- [Installation & Setup](#installation--setup)
- [Driver Types](#driver-types)
- [Configuration Options](#configuration-options)
- [API Reference](#api-reference)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

---

## Overview

The Backup Plugin provides comprehensive database backup and restore capabilities with a **driver-based architecture** supporting filesystem, S3, and multi-destination backups with flexible strategies, compression, encryption, and retention policies.

### How It Works

1. **Streaming Export**: Memory-efficient streaming export (~10KB constant RAM usage)
2. **JSONL Format**: Industry-standard JSON Lines format with gzip compression (70-90% size reduction)
3. **Schema Metadata**: Generates s3db.json with full resource schemas for restore
4. **Driver-Based Storage**: Configurable storage drivers for different backup destinations
5. **Multiple Backup Types**: Full, incremental, and selective backups
6. **Flexible Strategies**: Support for single and multi-destination backups
7. **Data Security**: Compression, encryption, and integrity verification
8. **Retention Management**: Grandfather-Father-Son (GFS) rotation policies

> ⚡ **NEW**: Streaming architecture with constant memory usage - export databases of any size without memory constraints.

### Backup Output Format

Each backup creates a directory with:
```
/backups/full-2025-10-21T02-00-00-abc123/
  ├── s3db.json           # Metadata: schemas, record counts, compression info
  ├── users.jsonl.gz      # ALL users at backup time (streaming export)
  ├── orders.jsonl.gz     # ALL orders at backup time
  └── products.jsonl.gz   # ALL products at backup time
```

**Key Features:**
- **s3db.json**: Contains resource schemas, attributes, partitions, and statistics
- **JSONL.gz**: Compressed JSON Lines format (one JSON per line)
- **Streaming**: Never loads full dataset into memory
- **Compatible**: Works with BigQuery, Athena, Spark, and other analytics tools

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

    console.log(`✓ Backup completed in ${duration}ms`);

    // Send success metric
    await metrics.increment('backup.success');
    await metrics.timing('backup.duration', duration);

    // Verify backup
    const backups = await plugin.list();
    if (backups.length < 7) {
      await sendAlert('Warning: Less than 7 backups available');
    }
  } catch (error) {
    console.error('✗ Backup failed:', error);

    // Send alert
    await sendAlert({
      severity: 'critical',
      title: 'Backup Failed',
      message: error.message,
      runbook: 'Check disk space and S3 permissions'
    });

    // Track failure
    await metrics.increment('backup.failure');
  }
});

// Monthly restore test (verify backups work)
cron.schedule('0 3 1 * *', async () => {
  const backups = await plugin.list();
  const testBackup = backups[0];

  try {
    // Restore to test database
    await plugin.restore(testBackup.id, {
      destination: 'test-restore-db'
    });

    console.log('✓ Restore test successful');
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
- **Streaming Export**: Constant ~10KB memory usage regardless of dataset size
- **JSONL Format**: JSON Lines with gzip compression (70-90% smaller)
- **Schema Metadata**: s3db.json contains full resource definitions
- **Multiple Drivers**: Filesystem, S3, and multi-destination support
- **Backup Types**: Full, incremental, and selective backup strategies
- **Template Paths**: Dynamic path generation with date/time variables
- **GFS Retention**: Intelligent backup rotation policies
- **Data Integrity**: Automatic verification and validation

### 🔧 Technical Features
- **Memory-Efficient Streaming**: Never loads full dataset into memory
- **Compression Support**: gzip, brotli, deflate compression options (default: gzip)
- **Encryption**: Client-side and server-side encryption
- **Multi-Destination**: Concurrent backups to multiple locations
- **Event System**: Comprehensive hooks and event notifications
- **CLI Integration**: Command-line backup and restore operations
- **Analytics-Ready**: JSONL format compatible with BigQuery, Athena, Spark

### 📋 s3db.json Metadata Format

The s3db.json file contains complete metadata for restore operations:

```json
{
  "version": "1.0",
  "backupType": "full",
  "exportedAt": "2025-10-21T02:00:00.000Z",
  "database": {
    "bucket": "my-bucket",
    "region": "us-east-1"
  },
  "resources": {
    "users": {
      "name": "users",
      "attributes": { "id": "string", "name": "string", "email": "string" },
      "partitions": { "byRegion": { "fields": { "region": "string" } } },
      "timestamps": true,
      "recordCount": 15234,
      "exportFile": "users.jsonl.gz",
      "compression": "gzip",
      "format": "jsonl",
      "bytesWritten": 2048576
    }
  }
}
```

---

## Installation & Setup

### Basic Setup (Filesystem)

```javascript
import { S3db, BackupPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await s3db.connect();

// Install backup plugin with filesystem driver
const backupPlugin = new BackupPlugin({
  driver: 'filesystem',
  config: {
    path: './backups/{date}/',
    compression: 'gzip'
  },
  retention: {
    daily: 7,
    weekly: 4,
    monthly: 12
  }
});

await s3db.usePlugin(backupPlugin);

// Create backups
const fullBackup = await backupPlugin.backup('full');
console.log('Backup ID:', fullBackup.id);

// List and restore
const backups = await backupPlugin.listBackups();
await backupPlugin.restore(fullBackup.id);
```

### S3 Storage Setup

```javascript
const backupPlugin = new BackupPlugin({
  driver: 's3',
  config: {
    bucket: 'my-backup-bucket',
    path: 'database/{date}/',
    storageClass: 'STANDARD_IA',
    serverSideEncryption: 'AES256'
  },
  compression: 'gzip',
  verification: true
});
```

### Multi-Destination Setup

```javascript
const backupPlugin = new BackupPlugin({
  driver: 'multi',
  config: {
    strategy: 'all', // 'all', 'any', 'priority'
    drivers: [
      { 
        driver: 'filesystem', 
        config: { path: '/local/backups/{date}/' } 
      },
      { 
        driver: 's3', 
        config: { 
          bucket: 'remote-backups',
          storageClass: 'GLACIER'
        } 
      }
    ]
  }
});
```

---

## Driver Types

### 📁 Filesystem Driver

**Perfect for**: Local backups, network storage, development

```javascript
{
  driver: 'filesystem',
  config: {
    path: '/backups/{date}/',           // Template path with variables
    permissions: 0o644,                 // File permissions  
    directoryPermissions: 0o755         // Directory permissions
  }
}
```

**Path Templates:**
- `{date}` → `2024-03-15`
- `{time}` → `14-30-45`
- `{year}` → `2024`
- `{month}` → `03`
- `{day}` → `15`
- `{backupId}` → `full-2024-03-15T14-30-45-abc123`
- `{type}` → `full` | `incremental`

### ☁️ S3 Driver

**Perfect for**: Cloud backups, long-term storage, disaster recovery

```javascript
{
  driver: 's3',
  config: {
    bucket: 'my-backup-bucket',         // S3 bucket (optional, uses database bucket)
    path: 'backups/{date}/',            // S3 key prefix with templates
    storageClass: 'STANDARD_IA',        // S3 storage class
    serverSideEncryption: 'AES256',     // Server-side encryption
    client: customS3Client              // Custom S3 client (optional)
  }
}
```

**Storage Classes**: `STANDARD`, `STANDARD_IA`, `ONEZONE_IA`, `REDUCED_REDUNDANCY`, `GLACIER`, `DEEP_ARCHIVE`

### 🔄 Multi Driver

**Perfect for**: Redundancy, hybrid storage, complex backup strategies

```javascript
{
  driver: 'multi',
  config: {
    strategy: 'all',                    // Backup strategy
    concurrency: 3,                     // Max concurrent uploads
    drivers: [
      { driver: 'filesystem', config: {...} },
      { driver: 's3', config: {...} }
    ]
  }
}
```

**Strategies:**
- **`all`**: Upload to all destinations (fail if any fails)
- **`any`**: Upload to all, succeed if at least one succeeds  
- **`priority`**: Try destinations in order, stop on first success

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **`driver`** | `string` | `'filesystem'` | Driver type: `filesystem`, `s3`, `multi` |
| **`config`** | `object` | `{}` | Driver-specific configuration |
| `retention` | `object` | `{}` | Retention policy (GFS rotation) |
| `include` | `array` | `null` | Resources to include (null = all) |
| `exclude` | `array` | `[]` | Resources to exclude |
| `compression` | `string` | `'gzip'` | `'none'`, `'gzip'`, `'brotli'`, `'deflate'` |
| `encryption` | `object` | `null` | Encryption configuration |
| `verification` | `boolean` | `true` | Verify backup integrity |
| `tempDir` | `string` | `os.tmpdir()/s3db/backups` | Temporary working directory |
| `verbose` | `boolean` | `false` | Enable detailed logging |

### Retention Policies (GFS)

Grandfather-Father-Son rotation keeps backups efficiently:

```javascript
retention: {
  daily: 7,      // Keep 7 daily backups
  weekly: 4,     // Keep 4 weekly backups  
  monthly: 12,   // Keep 12 monthly backups
  yearly: 3      // Keep 3 yearly backups
}
```

---

## Usage Examples

### Basic Backup Operations

```javascript
// Full backup - complete database snapshot
const fullBackup = await backupPlugin.backup('full');
console.log(`✓ Full backup: ${fullBackup.id} (${fullBackup.size} bytes)`);

// Incremental backup - changes since last backup  
const incrementalBackup = await backupPlugin.backup('incremental');

// Selective backup - specific resources only
const selectiveBackup = await backupPlugin.backup('full', {
  resources: ['users', 'posts']
});

// Custom backup type
const customBackup = await backupPlugin.backup('weekly-snapshot');
```

### Backup Management

```javascript
// List all backups
const allBackups = await backupPlugin.listBackups();

// List with filters
const recentBackups = await backupPlugin.listBackups({
  limit: 10,
  prefix: 'full-2024'
});

// Get backup status
const status = await backupPlugin.getBackupStatus(backupId);
console.log(`Status: ${status.status}, Size: ${status.size}`);

// Restore operations
await backupPlugin.restore(backupId);                    // Full restore
await backupPlugin.restore(backupId, { overwrite: true }); // Overwrite existing
await backupPlugin.restore(backupId, { 
  resources: ['users'] 
}); // Selective restore
```

### Enterprise Multi-Region Setup

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

### Advanced Security Configuration

```javascript
const secureBackupPlugin = new BackupPlugin({
  driver: 's3',
  config: {
    bucket: 'secure-backups',
    storageClass: 'STANDARD_IA',
    serverSideEncryption: 'aws:kms',
    kmsKeyId: 'arn:aws:kms:region:account:key/key-id'
  },
  
  // Client-side encryption (before upload)
  encryption: {
    algorithm: 'AES-256-GCM',
    key: process.env.BACKUP_ENCRYPTION_KEY,
    keyDerivation: {
      algorithm: 'PBKDF2',
      iterations: 100000,
      salt: 'backup-salt-2024'
    }
  },
  
  // Integrity verification
  verification: true,
  
  // Compression for efficiency
  compression: 'gzip'
});
```

---

## API Reference

### Plugin Constructor

```javascript
new BackupPlugin({
  driver: 'filesystem' | 's3' | 'multi',
  config: object,
  retention?: object,
  include?: string[],
  exclude?: string[],
  compression?: 'none' | 'gzip' | 'brotli' | 'deflate',
  encryption?: object,
  verification?: boolean,
  tempDir?: string,
  verbose?: boolean,
  onBackupStart?: (type: string, context: object) => Promise<void>,
  onBackupComplete?: (type: string, stats: object) => Promise<void>,
  onBackupError?: (type: string, context: object) => Promise<void>
})
```

### Backup Methods

#### `backup(type, options?)`
Create a backup of specified type.

```javascript
const result = await backupPlugin.backup('full', {
  resources: ['users', 'posts'], // Optional: specific resources
  compression: 'gzip',           // Optional: override compression
  metadata: { project: 'v2.0' }  // Optional: custom metadata
});
```

#### `listBackups(options?)`
List available backups with optional filtering.

```javascript
const backups = await backupPlugin.listBackups({
  limit: 20,
  prefix: 'full-',
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});
```

#### `getBackupStatus(backupId)`
Get detailed status of a specific backup.

```javascript
const status = await backupPlugin.getBackupStatus('full-2024-01-15-abc123');
```

#### `restore(backupId, options?)`
Restore data from a backup.

```javascript
await backupPlugin.restore('backup-id', {
  overwrite: true,              // Overwrite existing data
  resources: ['users'],         // Selective restore
  target: 'different-database'  // Restore to different database
});
```

#### `deleteBackup(backupId)`
Delete a specific backup.

```javascript
await backupPlugin.deleteBackup('backup-id');
```

#### `cleanupBackups()`
Apply retention policies and clean up old backups.

```javascript
const cleaned = await backupPlugin.cleanupBackups();
console.log(`Cleaned up ${cleaned.count} old backups`);
```

---

## Advanced Patterns

### Event-Driven Backup Monitoring

```javascript
const backupPlugin = new BackupPlugin({
  driver: 'filesystem',
  config: { path: './backups/' },
  
  // Lifecycle hooks
  onBackupStart: async (type, { backupId }) => {
    console.log(`🚀 Starting ${type} backup: ${backupId}`);
    await notifySlack(`Backup ${backupId} started`);
  },
  
  onBackupComplete: async (type, stats) => {
    console.log(`✅ ${type} backup completed:`, {
      id: stats.backupId,
      size: `${Math.round(stats.size / 1024)}KB`,
      duration: `${stats.duration}ms`,
      destinations: stats.driverInfo
    });
  },
  
  onBackupError: async (type, { backupId, error }) => {
    console.error(`❌ Backup ${backupId} failed:`, error.message);
    await alertOps(error);
  }
});

// Event listeners
backupPlugin.on('backup_start', ({ id, type }) => {
  updateDashboard(`Backup ${id} started`);
});

backupPlugin.on('backup_complete', ({ id, type, size, duration }) => {
  metrics.record('backup.completed', { type, size, duration });
});

backupPlugin.on('restore_complete', ({ id, restored }) => {
  console.log(`Restored ${restored.length} resources from ${id}`);
});
```

### Automated Backup Scheduling

```javascript
class BackupScheduler {
  constructor(backupPlugin) {
    this.plugin = backupPlugin;
    this.schedules = new Map();
  }
  
  schedule(name, cron, backupType, options = {}) {
    const job = new CronJob(cron, async () => {
      try {
        console.log(`🕒 Running scheduled backup: ${name}`);
        const result = await this.plugin.backup(backupType, options);
        console.log(`✅ Scheduled backup completed: ${result.id}`);
      } catch (error) {
        console.error(`❌ Scheduled backup failed: ${name}`, error);
      }
    });
    
    this.schedules.set(name, job);
    job.start();
    
    console.log(`📅 Scheduled backup '${name}' created: ${cron}`);
  }
  
  unschedule(name) {
    const job = this.schedules.get(name);
    if (job) {
      job.stop();
      this.schedules.delete(name);
      console.log(`⏹️  Unscheduled backup: ${name}`);
    }
  }
  
  listSchedules() {
    return Array.from(this.schedules.keys());
  }
}

// Usage
const scheduler = new BackupScheduler(backupPlugin);

// Daily full backup at 2 AM
scheduler.schedule('daily-full', '0 2 * * *', 'full');

// Weekly incremental backup on Sundays at 6 AM
scheduler.schedule('weekly-incremental', '0 6 * * 0', 'incremental');

// Monthly archive backup on the 1st at midnight
scheduler.schedule('monthly-archive', '0 0 1 * *', 'full', {
  compression: 'brotli',
  metadata: { type: 'archive' }
});
```

### Backup Verification and Testing

```javascript
class BackupValidator {
  constructor(backupPlugin) {
    this.plugin = backupPlugin;
  }
  
  async validateBackup(backupId) {
    console.log(`🔍 Validating backup: ${backupId}`);
    
    const validation = {
      backupId,
      timestamp: new Date().toISOString(),
      checks: {},
      overall: 'pending'
    };
    
    try {
      // Check backup exists and is accessible
      const status = await this.plugin.getBackupStatus(backupId);
      validation.checks.exists = status ? 'pass' : 'fail';
      
      // Check backup integrity
      if (status && status.checksum) {
        const integrity = await this.verifyChecksum(backupId, status.checksum);
        validation.checks.integrity = integrity ? 'pass' : 'fail';
      }
      
      // Test restore to temporary location
      const restoreTest = await this.testRestore(backupId);
      validation.checks.restore = restoreTest ? 'pass' : 'fail';
      
      // Check data completeness
      const completeness = await this.checkDataCompleteness(backupId);
      validation.checks.completeness = completeness ? 'pass' : 'fail';
      
      // Determine overall result
      const allPassed = Object.values(validation.checks).every(result => result === 'pass');
      validation.overall = allPassed ? 'pass' : 'fail';
      
    } catch (error) {
      validation.error = error.message;
      validation.overall = 'error';
    }
    
    console.log(`${validation.overall === 'pass' ? '✅' : '❌'} Validation ${validation.overall}: ${backupId}`);
    return validation;
  }
  
  async verifyChecksum(backupId, expectedChecksum) {
    // Implementation would verify backup file checksum
    return true; // Simplified for example
  }
  
  async testRestore(backupId) {
    try {
      // Create temporary database instance
      const tempDb = new S3db({
        connectionString: "s3://test:test@temp-bucket/validation"
      });
      
      await tempDb.connect();
      
      // Attempt restore
      await this.plugin.restore(backupId, {
        target: tempDb,
        dryRun: true
      });
      
      await tempDb.disconnect();
      return true;
    } catch (error) {
      console.error('Restore test failed:', error);
      return false;
    }
  }
  
  async checkDataCompleteness(backupId) {
    // Implementation would check if all expected resources are in backup
    return true; // Simplified for example
  }
  
  async runValidationReport() {
    const backups = await this.plugin.listBackups({ limit: 10 });
    const validations = [];
    
    console.log(`🔍 Running validation on ${backups.length} recent backups...`);
    
    for (const backup of backups) {
      const validation = await this.validateBackup(backup.id);
      validations.push(validation);
    }
    
    const report = {
      timestamp: new Date().toISOString(),
      totalBackups: validations.length,
      passed: validations.filter(v => v.overall === 'pass').length,
      failed: validations.filter(v => v.overall === 'fail').length,
      errors: validations.filter(v => v.overall === 'error').length,
      validations
    };
    
    console.log('\n📋 BACKUP VALIDATION REPORT');
    console.log(`Total Backups: ${report.totalBackups}`);
    console.log(`✅ Passed: ${report.passed}`);
    console.log(`❌ Failed: ${report.failed}`);
    console.log(`🚨 Errors: ${report.errors}`);
    
    return report;
  }
}

// Usage
const validator = new BackupValidator(backupPlugin);

// Validate specific backup
const validation = await validator.validateBackup('backup-id');

// Run comprehensive validation report
const report = await validator.runValidationReport();
```

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
// Set up backup monitoring
const monitorBackups = async () => {
  const backups = await backupPlugin.listBackups({ limit: 5 });
  const latestBackup = backups[0];
  
  if (!latestBackup) {
    console.warn('⚠️  No backups found!');
    return;
  }
  
  const age = Date.now() - new Date(latestBackup.timestamp).getTime();
  const hoursOld = age / (1000 * 60 * 60);
  
  if (hoursOld > 25) { // More than 25 hours old
    console.warn(`⚠️  Latest backup is ${Math.round(hoursOld)} hours old`);
  }
  
  // Test backup integrity
  const status = await backupPlugin.getBackupStatus(latestBackup.id);
  if (status.status !== 'completed') {
    console.error(`❌ Latest backup status: ${status.status}`);
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
    const testUsers = testDb.resource('users');
    const count = await testUsers.count();
    
    console.log(`✅ Restore test successful: ${count} users restored`);
    
  } catch (error) {
    console.error('❌ Restore test failed:', error);
  } finally {
    await testDb.disconnect();
  }
};

// Test monthly
setInterval(testRestore, 30 * 24 * 60 * 60 * 1000);
```

---

## CLI Integration

The BackupPlugin works with s3db CLI commands:

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

> **Note**: CLI requires the BackupPlugin to be installed in the database instance.

---

## Error Handling

The Backup Plugin uses `BackupError` for all backup-related errors. All errors include comprehensive diagnostic information.

### Error Structure

```javascript
try {
  await backupPlugin.backup('full');
} catch (error) {
  console.log(error.name);         // 'BackupError'
  console.log(error.message);      // Brief error message
  console.log(error.description);  // Detailed diagnostic information
  console.log(error.driver);       // 'filesystem', 's3', 'multi'
  console.log(error.operation);    // 'backup', 'restore', 'list', etc.
}
```

### Common Errors

#### Driver Configuration Error
```javascript
// ❌ Invalid driver configuration
new BackupPlugin({
  driver: 'filesystem',
  config: { path: null } // Missing required path
});

// Error: BackupError
// Operation: validateConfig
// Description: Invalid backup driver configuration
```

#### Backup Upload Failed
```javascript
// ❌ Cannot write to destination
await backupPlugin.backup('full');

// Error: BackupError
// Operation: upload
// Driver: filesystem
// Description: Failed to upload backup file
// Common causes:
// 1. Insufficient disk space
// 2. Permission denied
// 3. Path does not exist
// 4. Network connectivity (S3)
```

#### Restore Failed
```javascript
// ❌ Backup not found or corrupted
await backupPlugin.restore('invalid-backup-id');

// Error: BackupError
// Operation: restore
// Description: Failed to restore from backup
// Common causes:
// 1. Backup ID does not exist
// 2. Backup file corrupted
// 3. Checksum mismatch
// 4. Incompatible backup format
```

#### Multi-Destination Strategy Failed
```javascript
// ❌ All destinations must succeed but one failed
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
// Operation: backup
// Driver: multi
// Description: Multi-destination backup failed
// Strategy: all (requires all destinations to succeed)
```

### Error Prevention

```javascript
// ✅ Validate configuration before creating backups
const backupPlugin = new BackupPlugin({
  driver: 'filesystem',
  config: {
    path: '/backups/{date}/',
    permissions: 0o644
  },
  verification: true,  // Always verify backups
  verbose: true        // Enable detailed logging
});

// ✅ Check backup status before restore
const status = await backupPlugin.getBackupStatus(backupId);
if (status.status === 'completed' && status.checksum) {
  await backupPlugin.restore(backupId);
}

// ✅ Handle errors gracefully
try {
  await backupPlugin.backup('full');
} catch (error) {
  if (error.name === 'BackupError') {
    console.error('Backup failed:', error.description);

    // Retry with different strategy or notify ops
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
| `delete` | Backup in use, permissions | Ensure backup is not being accessed |
| `cleanup` | Retention policy error | Verify retention configuration |

For complete error details, see [Error Classes Reference](../errors.md#backuperror).

---

## Troubleshooting

### Issue: Backup fails with permission errors
**Solution**: Check filesystem permissions and S3 bucket policies. Ensure proper read/write access.

### Issue: Large backup files consuming disk space
**Solution**: Enable compression, implement retention policies, and consider using S3 storage classes.

### Issue: Slow backup performance
**Solution**: Use multi-destination with concurrent uploads, optimize compression settings, or use faster storage.

### Issue: Backup verification fails
**Solution**: Check for corruption during transfer, verify checksums, and ensure stable network connection.

### Issue: Cannot restore specific resources
**Solution**: Verify resource names in backup, check for schema changes, and ensure compatible versions.

---

## Performance & Memory

### Memory Usage

The BackupPlugin uses streaming export to achieve constant memory usage:

```
Dataset: 1M records × 2KB = 2GB total
Memory: ~10KB constant (streaming!)

vs. Non-streaming approach:
Memory: 2GB+ (loads entire dataset)
```

**Streaming Benefits:**
- ✅ Backup databases of any size
- ✅ No memory limits or OOM errors
- ✅ Constant ~10KB buffer regardless of dataset size
- ✅ Handles millions of records efficiently

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

## BackupPlugin vs ReplicatorPlugin

The BackupPlugin creates **snapshots** at specific timestamps, while ReplicatorPlugin provides **real-time CDC** (Change Data Capture).

**Use BackupPlugin when:**
- ✅ You need point-in-time snapshots for disaster recovery
- ✅ Scheduled backups (daily, weekly, monthly)
- ✅ Compliance and audit requirements
- ✅ Migration between environments

**Use ReplicatorPlugin when:**
- ✅ You need real-time data sync
- ✅ Analytics pipelines
- ✅ Event sourcing
- ✅ Multi-destination replication

For a detailed comparison, see [BackupPlugin vs ReplicatorPlugin](./BACKUP_VS_REPLICATOR.md).

---

## See Also

- [BackupPlugin vs ReplicatorPlugin](./BACKUP_VS_REPLICATOR.md) - When to use each plugin
- [ReplicatorPlugin](./replicator.md) - Real-time data replication
- [Plugin Development Guide](./plugin-development.md)
- [Audit Plugin](./audit.md) - Track backup operations
- [Metrics Plugin](./metrics.md) - Monitor backup performance
- [Scheduler Plugin](./scheduler.md) - Automate backup scheduling
## ❓ FAQ

### Básico

**P: O que o BackupPlugin faz?**
R: Cria backups automatizados do banco de dados inteiro ou de recursos específicos, com suporte a compressão, encriptação e múltiplos destinos.

**P: Quais drivers estão disponíveis?**
R: `filesystem` (disco local), `s3` (S3 remoto), `multi` (múltiplos destinos simultâneos).

**P: Suporta backups incrementais?**
R: Sim, use `type: 'incremental'` para backup apenas de mudanças desde o último backup completo.

**P: Qual o formato dos backups?**
R: JSONL (JSON Lines) comprimido com gzip (.jsonl.gz) + arquivo s3db.json com metadados. Compatível com BigQuery, Athena, e outras ferramentas de analytics.

**P: Como funciona o streaming?**
R: O BackupPlugin escreve os records um por um sem carregar o dataset inteiro na memória, usando apenas ~10KB de RAM constante independente do tamanho do banco.

### Configuração

**P: Como configurar backup para filesystem?**
R:
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

**P: Como configurar backup para S3?**
R:
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

**P: Como configurar múltiplos destinos?**
R:
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

### Operações

**P: Como criar um backup manual?**
R: Use `backup`:
```javascript
const result = await backupPlugin.backup('full');
// Retorna: { id, type, size, duration, checksum, driverInfo }
```

**P: Como restaurar um backup?**
R: Use `restore`:
```javascript
const result = await backupPlugin.restore('full-2025-01-15-abc123', {
  resources: ['users', 'orders'],  // null = todos
  overwrite: true
});
```

**P: Como listar backups disponíveis?**
R: Use `listBackups`:
```javascript
const backups = await backupPlugin.listBackups({ limit: 20 });
// Retorna array de backups com metadata
```

**P: Como obter status de um backup?**
R: Use `getBackupStatus`:
```javascript
const status = await backupPlugin.getBackupStatus('full-2025-01-15-abc123');
// Retorna: { id, type, status, size, checksum, error, ... }
```

### Retenção

**P: Como funciona a política de retenção GFS?**
R: Grandfather-Father-Son:
- Daily: mantém X backups diários
- Weekly: mantém X backups semanais
- Monthly: mantém X backups mensais
- Yearly: mantém X backups anuais

**P: Como fazer cleanup de backups antigos?**
R: Use `cleanupBackups`:
```javascript
const cleaned = await backupPlugin.cleanupBackups();
console.log(`Cleaned up ${cleaned.count} old backups`);
```

### Segurança

**P: Como encriptar backups?**
R:
```javascript
new BackupPlugin({
  encryption: {
    algorithm: 'AES-256-GCM',
    key: process.env.BACKUP_ENCRYPTION_KEY
  }
})
```

**P: Como verificar integridade?**
R: A verificação por checksum é automática se `verification: true` (padrão).

### Troubleshooting

**P: Backup está falhando?**
R: Verifique:
1. Permissões de escrita no destino
2. Espaço em disco suficiente
3. Credenciais corretas (S3)
4. Use `verbose: true` para logs

**P: Restore está falhando?**
R: Verifique:
1. Backup existe e está completo
2. Checksum válido
3. Recursos existem no database de destino

---
