# Best Practices & FAQ

> **In this guide:** Performance optimization, error handling, troubleshooting, and FAQ.

**Navigation:** [← Back to Importer Plugin](../README.md) | [Configuration](./configuration.md)

---

## Performance Optimization

### Batch Size Tuning

| Scenario | batchSize | parallelism | Notes |
|----------|-----------|-------------|-------|
| Small files (<10K) | `500` | `5` | Conservative |
| Medium files (10K-1M) | `1000` | `10` | Default, balanced |
| Large files (>1M) | `5000` | `20` | Maximum throughput |

```javascript
// Small batches (memory-constrained)
batchSize: 500, parallelism: 5

// Balanced (recommended)
batchSize: 1000, parallelism: 10

// Maximum throughput
batchSize: 5000, parallelism: 20
```

### Format Selection

| Format | Speed | Memory | Best For |
|--------|-------|--------|----------|
| **JSONL** | Fastest | Low | Large datasets, streaming |
| **CSV** | Fast | Low | Tabular data |
| **JSON** | Medium | Higher | Small-medium files |
| **Excel** | Slower | Higher | Spreadsheet imports |

**Recommendation:** Use JSONL with gzip for maximum performance.

### Performance Benchmarks

| Operation | Duration | Throughput |
|-----------|----------|------------|
| CSV (1M rows) | ~12s | ~83K/sec |
| JSONL (1M rows) | ~10s | ~100K/sec |
| JSON (1M rows) | ~15s | ~66K/sec |
| Excel (1M rows) | ~25s | ~40K/sec |

### Optimization Checklist

1. **Use JSONL format** for maximum speed
2. **Increase batchSize** for larger records: `batchSize: 5000`
3. **Increase parallelism** on powerful machines: `parallelism: 20`
4. **Disable validation** if data is pre-validated: `validate: null`
5. **Remove unnecessary transforms** - only transform what's needed
6. **Use gzip compression** for network transfers

---

## Memory Management

### Streaming Mode

```javascript
// Default: streaming enabled (memory-efficient)
streaming: true,
batchSize: 1000

// Disable for small files (faster)
streaming: false
```

### Memory Footprint

| File Size | RAM Usage |
|-----------|-----------|
| 1K rows | ~200MB |
| 1M rows | ~200MB |
| 10M rows | ~200MB |

Memory depends on `batchSize * recordSize`, not total file size.

### Handle Very Large Files (>10GB)

```bash
# Split file into chunks
split -l 1000000 data.csv chunk_
```

```javascript
// Import chunks sequentially
const files = ['chunk_aa', 'chunk_ab', 'chunk_ac'];
for (const file of files) {
  await importer.import(file);
}
```

---

## Error Handling

### Error Handling Strategies

| Strategy | `continueOnError` | Use Case |
|----------|-------------------|----------|
| Stop on first error | `false` | Critical data, zero tolerance |
| Continue on error | `true` | Bulk imports, some errors acceptable |

### Track Validation Errors

```javascript
const errors = [];

importer.on('error', (error) => {
  errors.push({
    row: error.row,
    record: error.record,
    reason: error.message
  });
});

const result = await importer.import('./data.csv');
console.log(`Skipped ${errors.length} invalid records`);

// Save for review
fs.writeFileSync('./errors.json', JSON.stringify(errors, null, 2));
```

---

## Troubleshooting

### Slow Import Performance

**Causes:**
1. Small batch size
2. Low parallelism
3. Complex transforms
4. Expensive validation

**Solutions:**
```javascript
// Increase batch size
batchSize: 5000

// Increase parallelism
parallelism: 20

// Disable validation if not needed
validate: null

// Use JSONL instead of CSV
format: 'jsonl'
```

### High Memory Usage

**Causes:**
1. Large batch size
2. Streaming disabled
3. Large record sizes

**Solutions:**
```javascript
// Reduce batch size
batchSize: 500

// Enable streaming
streaming: true

// Reduce parallelism
parallelism: 5
```

### Validation Errors

**Diagnosis:**
```javascript
importer.on('error', (error) => {
  console.error('Validation failed:', error);
  console.error('Record:', error.record);
});
```

**Common causes:**
- Missing required fields
- Wrong data types
- Field mapping issues

### File Not Found

```javascript
import path from 'path';

// Use absolute paths
const filePath = path.resolve('./users.csv');

// Verify file exists
import fs from 'fs';
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
}
```

### CSV Parsing Errors

```javascript
// Specify encoding
driverConfig: {
  encoding: 'utf8'  // or 'latin1', 'utf16le'
}
```

### Excel Empty Cells

```javascript
// Handle undefined values
transforms: {
  age: (value) => value ?? 0,
  name: (value) => value ?? ''
}
```

---

## FAQ

### General

**Q: What does ImporterPlugin do?**

A: Enables high-performance bulk data import from multiple file formats (CSV, JSON, JSONL, Excel, Parquet) with streaming processing, field mapping, transformations, validation, and deduplication.

**Q: Why use ImporterPlugin instead of manual inserts?**

A: 5-9x faster with 40x less memory. Manual inserts process one record at a time; ImporterPlugin processes thousands in parallel batches.

**Q: What file formats are supported?**

A:
- **CSV/TSV** - Built-in
- **JSON/JSONL** - Built-in
- **Excel** - Requires `exceljs`
- **Parquet** - Requires `parquetjs`

All formats support gzip compression.

---

### Configuration

**Q: What are the minimum required parameters?**

A:
```javascript
new ImporterPlugin({
  resource: 'users',     // Required
  format: 'csv'          // Required
})
```

**Q: How do I map source fields to target fields?**

A:
```javascript
mapping: {
  'user_id': 'id',
  'user_name': 'name'
}
```

**Q: How do I skip duplicate records?**

A:
```javascript
deduplicateBy: 'email'  // Single field
deduplicateBy: ['userId', 'timestamp']  // Multiple fields
```

---

### Performance

**Q: What's the fastest format?**

A: JSONL (JSON Lines) - streaming-friendly, minimal parsing, gzip support.

**Q: How much memory does it use?**

A: ~200MB regardless of file size. Memory depends on `batchSize * recordSize`.

**Q: How do I optimize for large files?**

A:
1. Use JSONL format
2. Increase `batchSize: 5000`
3. Increase `parallelism: 20`
4. Disable validation if pre-validated

---

### Operations

**Q: Can ImporterPlugin restore BackupPlugin exports?**

A: Yes:
```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'jsonl',
  filePath: './backups/users.jsonl.gz'
});
await importer.import();
```

**Q: Can I import from S3?**

A: Download first, then import:
```javascript
// Download from S3
await pipeline(s3Response.Body, fs.createWriteStream('/tmp/data.csv'));

// Import
await importer.import('/tmp/data.csv');
```

**Q: How do I handle CSV files without headers?**

A:
```javascript
driverConfig: { hasHeader: false },
mapping: {
  '0': 'id',
  '1': 'name',
  '2': 'email'
}
```

---

### Progress & Errors

**Q: How do I monitor progress?**

A:
```javascript
importer.on('progress', (p) => {
  console.log(`${p.percent}% - ${p.inserted} inserted`);
});
```

**Q: How often are progress events emitted?**

A: After each batch. With `batchSize: 1000`, every 1000 records.

**Q: Should I stop or continue on errors?**

A:
- **Stop** (`continueOnError: false`): Critical data
- **Continue** (`continueOnError: true`): Bulk imports with acceptable errors

---

### Advanced

**Q: Can I transform nested objects?**

A:
```javascript
transforms: {
  'address.city': (value) => value.toUpperCase(),
  'profile.age': (value) => parseInt(value, 10)
}
```

**Q: Can I import only specific rows?**

A:
```javascript
validate: (record, index) => {
  return index >= 100 && index < 200;  // Rows 100-199 only
}
```

**Q: How do I handle date formats from different locales?**

A:
```javascript
import { parse } from 'date-fns';

transforms: {
  createdAt: (value) => {
    const formats = ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM-dd-yyyy'];
    for (const fmt of formats) {
      try {
        return parse(value, fmt, new Date()).getTime();
      } catch {}
    }
    return null;
  }
}
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Import workflows, format examples
- [BackupPlugin](../../backup/README.md) - Create JSONL.gz backups
- [ReplicatorPlugin](../../replicator/README.md) - Export data to multiple formats
