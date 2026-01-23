# Importer Plugin

> **High-throughput CSV/JSON/Parquet imports with streaming transforms and batching.**

---

## TLDR

**High-performance data import from multiple file formats with streaming processing, automatic schema mapping, and batch parallelism.**

**2 lines to get started:**
```javascript
const importer = new ImporterPlugin({ resource: 'users', format: 'csv' });
await db.usePlugin(importer); await importer.import('./data.csv');
```

**Key features:**
- Multi-format support (CSV, JSON, JSONL, TSV, Excel, Parquet)
- Streaming processing (~200MB RAM for any file size)
- 5-9x faster than sequential processing
- Field mapping and transformations
- Deduplication and validation
- Works with BackupPlugin exports

**Use cases:**
- Data migration from other systems
- Restoring BackupPlugin exports
- Bulk import from CSV/Excel files
- ETL pipelines and data transformations

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { ImporterPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    email: 'string',
    age: 'number'
  }
});

const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  batchSize: 1000,
  parallelism: 10
});

await db.usePlugin(importer);
const result = await importer.import('./users.csv');

console.log(`Imported ${result.inserted} records in ${result.duration}ms`);
```

---

## Dependencies

**Core formats (built-in):**
- CSV, TSV, JSON, JSONL/NDJSON

**Optional peer dependencies:**
```bash
# Excel support
pnpm install exceljs

# Parquet support
pnpm install parquetjs
```

| Format | Dependency | Required |
|--------|------------|----------|
| CSV/TSV | Built-in | No |
| JSON/JSONL | Built-in | No |
| Excel | `exceljs` | Optional |
| Parquet | `parquetjs` | Optional |

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, formats, field mapping, transforms, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Import workflows, format examples, progress tracking |
| [Best Practices](./guides/best-practices.md) | Performance, error handling, troubleshooting, FAQ |

---

## Quick Reference

### Supported Formats

| Format | Extension | Speed | Notes |
|--------|-----------|-------|-------|
| **JSONL** | `.jsonl` | Fastest | Streaming-friendly |
| **CSV** | `.csv` | Fast | Auto-detect delimiter |
| **JSON** | `.json` | Medium | Array of objects |
| **TSV** | `.tsv` | Fast | Tab-separated |
| **Excel** | `.xlsx` | Slower | Requires `exceljs` |
| **Parquet** | `.parquet` | Medium | Requires `parquetjs` |

All formats support gzip compression (`.gz`).

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resource` | string | Required | Target resource name |
| `format` | string | Required | File format |
| `mapping` | object | `{}` | Field mapping |
| `transforms` | object | `{}` | Field transformations |
| `validate` | function | `null` | Validation function |
| `deduplicateBy` | string/array | `null` | Deduplication key(s) |
| `batchSize` | number | `1000` | Records per batch |
| `parallelism` | number | `10` | Parallel operations |
| `continueOnError` | boolean | `false` | Continue on errors |

### Performance

| Operation | Without Plugin | With Plugin | Improvement |
|-----------|----------------|-------------|-------------|
| 1M CSV rows | ~60s, 8GB RAM | ~12s, 200MB | 5x faster, 40x less memory |
| 100K JSON | ~45s | ~5s | 9x faster |
| 500K JSONL | ~30s | ~6s | 5x faster |

### Plugin Methods

```javascript
// Import from file
const result = await importer.import('./users.csv');
// { processed, inserted, skipped, errors, duplicates, duration }

// Get statistics
const stats = importer.getStats();
// { totalProcessed, totalInserted, recordsPerSecond, ... }
```

### Events

```javascript
importer.on('progress', (p) => console.log(`${p.percent}%`));
importer.on('error', (e) => console.error(`Row ${e.row}: ${e.message}`));
importer.on('complete', (r) => console.log(`Done: ${r.inserted} inserted`));
```

---

## How It Works

1. **Stream**: Read file in chunks (memory-efficient)
2. **Transform**: Apply field mapping and transformations
3. **Validate**: Check records against validation function
4. **Deduplicate**: Skip records with duplicate keys
5. **Batch Insert**: Insert in parallel batches for speed

---

## Configuration Examples

### Field Mapping

```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  mapping: {
    'user_id': 'id',
    'user_name': 'name',
    'user_email': 'email'
  }
})
```

### Transformations

```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  transforms: {
    email: (v) => v.toLowerCase(),
    age: (v) => parseInt(v, 10),
    createdAt: (v) => new Date(v).getTime()
  }
})
```

### Import BackupPlugin Export

```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'jsonl',
  filePath: './backups/users.jsonl.gz',
  batchSize: 1000,
  parallelism: 10
})
```

---

## See Also

- [BackupPlugin](../backup/README.md) - Create JSONL.gz backups
- [ReplicatorPlugin](../replicator/README.md) - Export data to multiple formats
- [TTL Plugin](../ttl/README.md) - Auto-cleanup imported data
