# 💾 Backup Plugin

## ⚡ TLDR

Backup/restore system with **multiple drivers** (filesystem/S3/multi) and GFS retention policies.

**2 lines to get started:**
```javascript
const plugin = new BackupPlugin({ driver: 'filesystem', config: { path: './backups/' } });
await plugin.backup('full');  // Full backup created!
```

**Key features:**
- ✅ Drivers: filesystem, S3, multi-destination
- ✅ Types: full, incremental, selective
- ✅ Compression: gzip, brotli, deflate
- ✅ GFS retention: daily/weekly/monthly/yearly
- ✅ Path templates: `{date}`, `{time}`, `{year}`

**When to use:**
- 💾 Disaster recovery
- 🔄 Migration between environments
- 📦 Long-term archiving
- 🌍 Multi-region backup

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Driver Types](#driver-types)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

---

## Overview

The Backup Plugin provides comprehensive database backup and restore capabilities with a **driver-based architecture** supporting filesystem, S3, and multi-destination backups with flexible strategies, compression, encryption, and retention policies.

### How It Works

1. **Driver-Based Storage**: Configurable storage drivers for different backup destinations
2. **Multiple Backup Types**: Full, incremental, and selective backups
3. **Flexible Strategies**: Support for single and multi-destination backups
4. **Data Security**: Compression, encryption, and integrity verification
5. **Retention Management**: Grandfather-Father-Son (GFS) rotation policies

> ⚡ **NEW**: Driver-based architecture supports filesystem, S3, and multi-destination backups with flexible strategies.

---

## Key Features

### 🎯 Core Features
- **Multiple Drivers**: Filesystem, S3, and multi-destination support
- **Backup Types**: Full, incremental, and selective backup strategies
- **Template Paths**: Dynamic path generation with date/time variables
- **GFS Retention**: Intelligent backup rotation policies
- **Data Integrity**: Automatic verification and validation

### 🔧 Technical Features
- **Compression Support**: gzip, brotli, deflate compression options
- **Encryption**: Client-side and server-side encryption
- **Multi-Destination**: Concurrent backups to multiple locations
- **Event System**: Comprehensive hooks and event notifications
- **CLI Integration**: Command-line backup and restore operations

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
    destinations: [
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
    destinations: [
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
    destinations: [
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
    destinations: [
      { driver: 'filesystem', config: { path: '/local/backup/' } },
      { driver: 's3', config: { bucket: 'remote-backup' } }
    ]
  }
}

// For cost optimization: Priority strategy
{
  strategy: 'priority', // Try cheap options first
  destinations: [
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

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Audit Plugin](./audit.md) - Track backup operations
- [Metrics Plugin](./metrics.md) - Monitor backup performance
- [Scheduler Plugin](./scheduler.md) - Automate backup scheduling