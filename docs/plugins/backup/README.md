# Backup Plugin

> **Streaming backups and restores with filesystem, S3, and multi-target drivers.**

---

## TLDR

Backup/restore system with **streaming architecture** (~10KB constant memory), **JSONL format**, and **multiple drivers** (filesystem/S3/multi).

**2 lines to get started:**
```javascript
const plugin = new BackupPlugin({ driver: 'filesystem', config: { path: './backups/' } });
await plugin.backup('full');  // Full backup created!
```

**Key features:**
- Streaming export: Constant ~10KB memory (handles any dataset size)
- JSONL.gz format: 70-90% compression + BigQuery/Athena compatible
- s3db.json metadata: Full schemas for restore
- Drivers: filesystem, S3, multi-destination
- Types: full, incremental, selective
- GFS retention: daily/weekly/monthly/yearly

**When to use:**
- Disaster recovery
- Migration between environments
- Long-term archiving
- Multi-region backup

**Access:**
```javascript
const backups = await backupPlugin.list();
await backupPlugin.restore(backups[0].id);
```

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { BackupPlugin } from 's3db.js';

// Step 1: Create database and plugin
const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

const backupPlugin = new BackupPlugin({
  driver: 'filesystem',
  config: { path: './backups' }
});

await db.usePlugin(backupPlugin);

// Step 2: Create a backup
const backupResult = await backupPlugin.backup('full');
console.log('Backup created:', backupResult.id);

// Step 3: List and restore
const backups = await backupPlugin.list();
// await backupPlugin.restore(backups[0].id);
```

---

## Dependencies

**NO Peer Dependencies!** BackupPlugin is built into s3db.js core with zero external dependencies.

**What's Included:**
- Streaming Architecture (~10KB constant memory)
- Compression (gzip, 70-90% savings)
- JSONL Format (BigQuery/Athena compatible)
- Multiple Drivers (filesystem, S3, multi)
- GFS Retention (daily/weekly/monthly/yearly)

**Platform Support:**
- Node.js 18+ (recommended)
- AWS Lambda (with `/tmp` or S3 driver)
- Docker/Kubernetes (persistent volumes or S3)
- Not supported: Browser, Edge (no fs access)

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | Driver types, all options, retention policies, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Step-by-step levels, backup types, restore operations |
| [Best Practices](./guides/best-practices.md) | Monitoring, error handling, troubleshooting, FAQ |

---

## Quick Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `driver` | string | `'filesystem'` | `filesystem`, `s3`, `multi` |
| `config` | object | `{}` | Driver-specific configuration |
| `compression` | string | `'gzip'` | `'none'`, `'gzip'`, `'brotli'` |
| `retention` | object | `{}` | GFS rotation policy |
| `verification` | boolean | `true` | Verify backup integrity |

### Driver Quick Setup

```javascript
// Filesystem
{ driver: 'filesystem', config: { path: './backups/{date}/' } }

// S3
{ driver: 's3', config: { bucket: 'backups', storageClass: 'STANDARD_IA' } }

// Multi-destination
{ driver: 'multi', config: { strategy: 'all', drivers: [...] } }
```

### Key Methods

```javascript
// Create backups
await backupPlugin.backup('full');
await backupPlugin.backup('incremental');
await backupPlugin.backup('full', { resources: ['users'] });

// Manage backups
const backups = await backupPlugin.listBackups();
const status = await backupPlugin.getBackupStatus(backupId);

// Restore
await backupPlugin.restore(backupId);
await backupPlugin.restore(backupId, { resources: ['users'] });

// Cleanup
await backupPlugin.cleanupBackups();
```

### Backup Output

```
/backups/full-2025-10-21/
  ├── s3db.json           # Metadata & schemas
  ├── users.jsonl.gz      # User records
  └── orders.jsonl.gz     # Order records
```

### Performance

| Metric | Value |
|--------|-------|
| Memory | ~10KB constant (streaming) |
| Throughput | ~8,300 records/sec |
| Compression | 70-90% reduction |

---

## BackupPlugin vs ReplicatorPlugin

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
new BackupPlugin({ driver: 's3', config: { bucket: 'backups' } })

// ReplicatorPlugin for real-time analytics
new ReplicatorPlugin({ replicators: [{ driver: 'bigquery', ... }] })
```

---

## See Also

- [ReplicatorPlugin](/plugins/replicator/README.md) - Real-time data replication
- [ImporterPlugin](/plugins/importer/README.md) - Restore JSONL backups
- [Audit Plugin](/plugins/audit/README.md) - Track backup operations
- [Metrics Plugin](/plugins/metrics/README.md) - Monitor backup performance
