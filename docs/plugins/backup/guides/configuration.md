# Configuration

> **In this guide:** All configuration options, driver types, retention policies, and output format.

**Navigation:** [← Back to Backup Plugin](../README.md)

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
| `logLevel` | `boolean` | `false` | Enable detailed logging |

---

## Driver Types

### Filesystem Driver

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

### S3 Driver

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

### Multi Driver

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

## Retention Policies (GFS)

Grandfather-Father-Son rotation keeps backups efficiently:

```javascript
retention: {
  daily: 7,      // Keep 7 daily backups
  weekly: 4,     // Keep 4 weekly backups
  monthly: 12,   // Keep 12 monthly backups
  yearly: 3      // Keep 3 yearly backups
}
```

**How GFS Works:**
- Daily: keeps X daily backups
- Weekly: keeps X weekly backups (typically Sunday)
- Monthly: keeps X monthly backups (typically 1st of month)
- Yearly: keeps X yearly backups (typically Jan 1st)

---

## Encryption Configuration

### Client-Side Encryption

```javascript
new BackupPlugin({
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

  verification: true
})
```

---

## Backup Output Format

Each backup creates a directory with:

```
/backups/full-2025-10-21T02-00-00-abc123/
  ├── s3db.json           # Metadata: schemas, record counts, compression info
  ├── users.jsonl.gz      # ALL users at backup time (streaming export)
  ├── orders.jsonl.gz     # ALL orders at backup time
  └── products.jsonl.gz   # ALL products at backup time
```

### s3db.json Metadata Format

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
  logLevel?: string,
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

## See Also

- [Usage Patterns](./usage-patterns.md) - Step-by-step usage levels
- [Best Practices](./best-practices.md) - Production tips, error handling, FAQ
