# 📥 Importer Plugin

> **High-throughput CSV/JSON/Parquet imports with streaming transforms and batching.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## 📦 Dependencies

The Importer Plugin has **minimal core dependencies** with optional format-specific packages.

**Core Dependencies:** (included in s3db.js)
- ✅ CSV parser (built-in)
- ✅ JSON parser (built-in)
- ✅ JSONL/NDJSON parser (built-in)
- ✅ Streaming engine (built-in)
- ✅ Batch processor (built-in)

**Optional Peer Dependencies:** (install only if needed)

```bash
# Excel support (.xlsx, .xls)
npm install exceljs

# Parquet support (.parquet)
npm install parquetjs
```

**Installation:**
```javascript
import { Database, ImporterPlugin } from 's3db.js';

// Core formats (CSV, JSON, JSONL) work out of the box
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv'  // No extra dependencies needed!
});
```

**Format Support Matrix:**

| Format | Dependency | Auto-installed? |
|--------|-----------|-----------------|
| CSV | Built-in | ✅ Yes |
| TSV | Built-in | ✅ Yes |
| JSON | Built-in | ✅ Yes |
| JSONL/NDJSON | Built-in | ✅ Yes |
| Excel (.xlsx) | `exceljs` | ❌ Optional |
| Parquet | `parquetjs` | ❌ Optional |

---

## ⚡ TLDR

High-performance data import from **multiple file formats** with **streaming processing**, **automatic schema mapping**, and **batch parallelism**.

**2 lines to get started:**
```javascript
const importer = new ImporterPlugin({ resource: 'users', format: 'csv', filePath: './data.csv' });
await db.usePlugin(importer); await importer.import();  // Data imported!
```

**Key features:**
- ✅ Multi-format: CSV, JSON, JSONL, TSV, Parquet, Excel
- ✅ Streaming: Memory-efficient (~200MB for 1M rows)
- ✅ Fast: 5-9x faster than sequential processing
- ✅ Schema mapping: Automatic field mapping with transformations
- ✅ Batch processing: Configurable parallelism (default: 10 concurrent)
- ✅ Deduplication: Skip duplicates based on key fields
- ✅ **Works with BackupPlugin**: Import JSONL.gz backups directly!

**When to use:**
- 📊 Data migration from other systems
- 🔄 Restoring BackupPlugin exports
- 📁 Bulk import from CSV/Excel files
- 🔀 ETL pipelines and data transformations

**Import BackupPlugin exports:**
```javascript
// BackupPlugin creates: users.jsonl.gz
// ImporterPlugin can restore it directly!

const importer = new ImporterPlugin({
  resource: 'users',
  format: 'jsonl',  // JSONL format (gzip auto-detected)
  filePath: './backups/full-2025-10-21T02-00-00-abc123/users.jsonl.gz',
  batchSize: 1000,
  parallelism: 10
});

await db.usePlugin(importer);
await importer.import();
// ✅ Backup restored! 1M records in ~12 seconds
```

**Performance:**
```javascript
// Without ImporterPlugin: Manual import loop
for (const record of data) {
  await users.insert(record);  // 1M records = 60 seconds, 8GB RAM
}

// With ImporterPlugin: Streaming + parallel batches
await importer.import();  // 1M records = 12 seconds, 200MB RAM
// 5x faster, 40x less memory! 🚀
```

---

## 📋 Table of Contents

1. [📦 Dependencies](#-dependencies)
2. [⚡ TLDR](#-tldr)
3. [Overview](#overview)
4. [Installation](#installation)
5. [Quick Start](#quick-start)
6. [Supported Formats](#supported-formats)
7. [Configuration](#configuration)
8. [Field Mapping](#field-mapping)
9. [Data Transformations](#data-transformations)
10. [Validation](#validation)
11. [Deduplication](#deduplication)
12. [Progress Tracking](#progress-tracking)
13. [Performance Optimization](#performance-optimization)
14. [Error Handling](#error-handling)
15. [Real-World Examples](#real-world-examples)
16. [API Reference](#api-reference)
17. [Troubleshooting](#troubleshooting)
18. [Performance Tips](#performance-tips)
19. [❓ FAQ](#-faq)
20. [Related Documentation](#related-documentation)

---

## Overview

The ImporterPlugin enables seamless data migration from various file formats into S3DB resources. It handles schema mapping, data transformation, validation, and provides real-time progress tracking.

**Key Features**:
- ✅ **Multi-format support**: JSON, CSV, JSONL, NDJSON, TSV
- ✅ **Streaming processing**: Memory-efficient for large files
- ✅ **Automatic schema mapping**: Source → Target field mapping
- ✅ **Built-in transformers**: Date parsing, type conversion, string manipulation
- ✅ **Custom transformations**: User-defined transformation functions
- ✅ **Batch processing**: Configurable parallelism for performance
- ✅ **Deduplication**: Skip duplicate records based on key fields
- ✅ **Validation**: Schema validation before insert
- ✅ **Progress tracking**: Real-time progress events
- ✅ **Error handling**: Continue on error with detailed logging

**Performance Benchmarks**:

| Operation | Without Streaming | With Streaming | Improvement |
|-----------|------------------|----------------|-------------|
| CSV Import (1M rows) | ~60s, 8GB RAM | ~12s, 200MB RAM | **5x faster, 40x less memory** |
| JSON Import (100K records) | ~45s (sequential) | ~5s (parallel) | **9x faster** |
| JSONL Import (500K lines) | ~30s | ~6s | **5x faster** |

---

## Installation

The ImporterPlugin is included in S3DB core - no additional packages needed for JSON and CSV support.

```bash
npm install s3db.js
```

For additional formats (optional dependencies):
```bash
# Parquet support
npm install parquetjs

# Excel support
npm install exceljs
```

---

## Quick Start

### Basic CSV Import

```javascript
import { Database, ImporterPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// Create resource
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    email: 'string',
    age: 'number'
  }
});

// Create importer
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  batchSize: 1000,
  parallelism: 10
});

// Install and import
await db.usePlugin(importer);
const result = await importer.import('./users.csv');

console.log(`Imported ${result.inserted} records in ${result.duration}ms`);
// Imported 10000 records in 2500ms
```

### JSON Array Import

```javascript
const importer = new ImporterPlugin({
  resource: 'products',
  format: 'json'
});

await db.usePlugin(importer);
await importer.import('./products.json');
```

### JSONL Import (Line-Delimited)

```javascript
const importer = new ImporterPlugin({
  resource: 'events',
  format: 'jsonl',  // One JSON object per line
  batchSize: 5000
});

await db.usePlugin(importer);
await importer.import('./events.jsonl');
```

---

## Supported Formats

### JSON Formats

| Format | Extension | Description | Example |
|--------|-----------|-------------|---------|
| **JSON Array** | `.json` | Array of objects | `[{"id":"1"},{"id":"2"}]` |
| **JSONL** | `.jsonl` | Line-delimited JSON | `{"id":"1"}\n{"id":"2"}` |
| **NDJSON** | `.ndjson` | Newline-delimited JSON | Same as JSONL |

**JSON Example File**:
```json
[
  {"id": "u1", "name": "Alice", "email": "alice@example.com"},
  {"id": "u2", "name": "Bob", "email": "bob@example.com"}
]
```

**JSONL Example File**:
```jsonl
{"id":"u1","name":"Alice","email":"alice@example.com"}
{"id":"u2","name":"Bob","email":"bob@example.com"}
```

### CSV/TSV Formats

| Format | Extension | Delimiter | Auto-Detect |
|--------|-----------|-----------|-------------|
| **CSV** | `.csv` | Comma (`,`) | ✅ Yes |
| **TSV** | `.tsv` | Tab (`\t`) | ✅ Yes |
| **Custom** | `.txt` | Any | ✅ Yes |

**Features**:
- Auto-detection of delimiter (comma, semicolon, tab, pipe)
- Quoted fields support (`"Smith, John"`)
- Escaped quotes (`"He said ""Hello"""`)
- Optional header row

**CSV Example File**:
```csv
id,name,email,age
u1,Alice,alice@example.com,30
u2,Bob,bob@example.com,25
```

---

## Configuration

### Complete Configuration Options

```javascript
const importer = new ImporterPlugin({
  // === Required ===
  resource: 'users',              // Target resource name
  format: 'csv',                  // Format: 'json', 'jsonl', 'ndjson', 'csv', 'tsv'

  // === Field Mapping ===
  mapping: {
    'user_id': 'id',              // Source field → Target field
    'user_name': 'name',
    'user_email': 'email',
    'created_date': 'createdAt'
  },

  // === Transformations ===
  transforms: {
    createdAt: (value) => new Date(value).getTime(),
    age: (value) => parseInt(value, 10),
    name: (value) => value.toLowerCase()
  },

  // === Validation ===
  validate: (record) => {
    if (!record.id || !record.name) return false;
    if (record.age && record.age < 0) return false;
    return true;
  },

  // === Deduplication ===
  deduplicateBy: 'id',            // Skip records with duplicate IDs

  // === Performance ===
  batchSize: 1000,                // Records per batch
  parallelism: 10,                // Parallel operations
  streaming: true,                // Enable streaming mode

  // === Error Handling ===
  continueOnError: true,          // Continue on validation errors

  // === Driver-Specific ===
  driverConfig: {
    // CSV-specific
    delimiter: ',',               // Override auto-detection
    hasHeader: true,              // First row is header (default: true)

    // Excel-specific
    sheet: 0,                     // Sheet index or name
    headerRow: 0,                 // Header row index
    startRow: 1                   // Data starts at row 1
  }
});
```

---

## Field Mapping

Map source field names to target resource attributes.

### Simple Mapping

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  mapping: {
    'user_id': 'id',
    'user_name': 'name',
    'user_email': 'email'
  }
});
```

**Source CSV**:
```csv
user_id,user_name,user_email
u1,Alice,alice@example.com
```

**Imported as**:
```javascript
{ id: 'u1', name: 'Alice', email: 'alice@example.com' }
```

### Nested Field Mapping

```javascript
mapping: {
  'first_name': 'profile.firstName',
  'last_name': 'profile.lastName',
  'street': 'address.street',
  'city': 'address.city'
}
```

---

## Data Transformations

### Built-in Transformers

```javascript
import { Transformers } from 's3db.js';

const importer = new ImporterPlugin({
  resource: 'orders',
  format: 'csv',
  transforms: {
    // Date parsing
    orderDate: Transformers.parseDate('YYYY-MM-DD'),

    // Number parsing
    price: Transformers.parseFloat(2),      // 2 decimal places
    quantity: Transformers.parseInt(),

    // String manipulation
    status: Transformers.toLowerCase(),
    category: Transformers.toUpperCase(),
    name: Transformers.trim(),

    // Array parsing
    tags: Transformers.split(','),          // "tag1,tag2" → ["tag1", "tag2"]

    // JSON parsing
    metadata: Transformers.parseJSON()
  }
});
```

### Available Built-in Transformers

| Transformer | Parameters | Example Input | Example Output |
|-------------|-----------|---------------|----------------|
| `parseDate(format?)` | Optional format | `"2025-10-20"` | `1729468800000` |
| `parseFloat(decimals?)` | Decimal places | `"19.99"` | `19.99` |
| `parseInt()` | None | `"42"` | `42` |
| `toLowerCase()` | None | `"HELLO"` | `"hello"` |
| `toUpperCase()` | None | `"hello"` | `"HELLO"` |
| `trim()` | None | `" text "` | `"text"` |
| `split(delimiter)` | Delimiter | `"a,b,c"` | `["a", "b", "c"]` |
| `parseJSON()` | None | `'{"key":"val"}'` | `{key: "val"}` |

### Custom Transformers

```javascript
transforms: {
  // Simple transformation
  fullName: (value, record) => {
    return `${record.firstName} ${record.lastName}`;
  },

  // Complex transformation
  ageGroup: (value) => {
    if (value < 18) return 'minor';
    if (value < 65) return 'adult';
    return 'senior';
  },

  // Computed field
  totalPrice: (value, record) => {
    return record.quantity * record.unitPrice;
  },

  // Conditional transformation
  status: (value) => {
    return value === 'A' ? 'active' : 'inactive';
  }
}
```

---

## Validation

Validate records before insertion.

### Basic Validation

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  validate: (record) => {
    // Required fields
    if (!record.id || !record.name) return false;

    // Data type validation
    if (record.age && typeof record.age !== 'number') return false;

    // Range validation
    if (record.age && (record.age < 0 || record.age > 120)) return false;

    // Email format (simple check)
    if (record.email && !record.email.includes('@')) return false;

    return true;
  },
  continueOnError: true  // Skip invalid records
});
```

### Validation with Error Details

```javascript
const importer = new ImporterPlugin({
  resource: 'products',
  format: 'json',
  validate: (record) => {
    const errors = [];

    if (!record.id) errors.push('Missing ID');
    if (!record.name) errors.push('Missing name');
    if (record.price < 0) errors.push('Price cannot be negative');

    if (errors.length > 0) {
      console.error(`Validation failed for record ${record.id}:`, errors);
      return false;
    }

    return true;
  }
});
```

---

## Deduplication

Skip duplicate records based on key field(s).

### Single Field Deduplication

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  deduplicateBy: 'id'  // Skip records with duplicate IDs
});

// Input: [
//   {id: 'u1', name: 'Alice'},
//   {id: 'u2', name: 'Bob'},
//   {id: 'u1', name: 'Alice Updated'}  // Skipped
// ]
// Result: 2 inserted, 1 duplicate
```

### Multi-Field Deduplication

```javascript
const importer = new ImporterPlugin({
  resource: 'events',
  format: 'jsonl',
  deduplicateBy: ['userId', 'eventType', 'timestamp']
});
```

---

## Progress Tracking

Monitor import progress with real-time events.

### Progress Events

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  batchSize: 1000
});

// Progress event (emitted after each batch)
importer.on('progress', (progress) => {
  console.log(`Progress: ${progress.percent}%`);
  console.log(`Processed: ${progress.processed}`);
  console.log(`Inserted: ${progress.inserted}`);
  console.log(`Skipped: ${progress.skipped}`);
  console.log(`Errors: ${progress.errors}`);
});

// Error event
importer.on('error', (error) => {
  console.error(`Error at row ${error.row}:`, error.message);
});

// Complete event
importer.on('complete', (result) => {
  console.log('Import complete!');
  console.log(`Total inserted: ${result.inserted}`);
  console.log(`Total duplicates: ${result.duplicates}`);
  console.log(`Duration: ${result.duration}ms`);
});

await db.usePlugin(importer);
await importer.import('./users.csv');
```

### Statistics

```javascript
const result = await importer.import('./users.csv');

console.log(result);
// {
//   processed: 10000,      // Total records processed
//   inserted: 9800,        // Successfully inserted
//   skipped: 150,          // Validation failures
//   errors: 0,             // Fatal errors
//   duplicates: 50,        // Deduplicated records
//   duration: 2500         // Milliseconds
// }

// Detailed statistics
const stats = importer.getStats();
console.log(stats.recordsPerSecond);  // 4000
```

---

## Performance Optimization

### Batch Size Tuning

```javascript
// Small batches (good for memory-constrained environments)
batchSize: 100,
parallelism: 5

// Medium batches (balanced, recommended)
batchSize: 1000,
parallelism: 10

// Large batches (maximum throughput)
batchSize: 5000,
parallelism: 20
```

### Streaming vs Non-Streaming

```javascript
// Streaming mode (memory-efficient, default)
streaming: true,
batchSize: 1000

// Non-streaming (faster for small files)
streaming: false
```

### Format-Specific Optimization

```javascript
// CSV - Faster with larger batches
format: 'csv',
batchSize: 5000,
parallelism: 20

// JSON - Balanced batches
format: 'json',
batchSize: 1000,
parallelism: 10

// JSONL - Large batches for streaming
format: 'jsonl',
batchSize: 10000,
parallelism: 20
```

---

## Error Handling

### Continue on Error

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  continueOnError: true,  // Don't stop on validation errors
  validate: (record) => {
    return record.age >= 0;  // Reject negative ages
  }
});

importer.on('error', (error) => {
  console.error(`Skipped record:`, error.record);
  console.error(`Reason:`, error.message);
});

const result = await importer.import('./users.csv');
console.log(`Errors: ${result.errors}`);
console.log(`Skipped: ${result.skipped}`);
```

### Stop on Error

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  continueOnError: false  // Stop on first error
});

try {
  await importer.import('./users.csv');
} catch (error) {
  console.error('Import failed:', error.message);
  // Handle error...
}
```

---

## Real-World Examples

### Example 1: Migrate from PostgreSQL

```javascript
// 1. Export from PostgreSQL to CSV
// psql -c "COPY users TO '/tmp/users.csv' CSV HEADER"

// 2. Import to S3DB
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  mapping: {
    'user_id': 'id',
    'created_at': 'createdAt',
    'updated_at': 'updatedAt'
  },
  transforms: {
    createdAt: (value) => new Date(value).getTime(),
    updatedAt: (value) => new Date(value).getTime()
  },
  batchSize: 5000,
  parallelism: 20
});

await db.usePlugin(importer);
const result = await importer.import('/tmp/users.csv');
console.log(`Migrated ${result.inserted} users from PostgreSQL`);
```

### Example 2: Import Analytics Events

```javascript
// Import from JSONL log files
const importer = new ImporterPlugin({
  resource: 'events',
  format: 'jsonl',
  mapping: {
    'event_id': 'id',
    'event_type': 'type',
    'user_id': 'userId',
    'timestamp': 'createdAt'
  },
  transforms: {
    createdAt: (value) => new Date(value).getTime(),
    type: (value) => value.toLowerCase()
  },
  deduplicateBy: 'id',
  batchSize: 10000,
  parallelism: 20
});

// Import multiple log files
const files = [
  './logs/events-2025-10-01.jsonl',
  './logs/events-2025-10-02.jsonl',
  './logs/events-2025-10-03.jsonl'
];

for (const file of files) {
  await importer.import(file);
}
```

### Example 3: Import Excel Reports

```javascript
// Import from Excel spreadsheet
const importer = new ImporterPlugin({
  resource: 'sales',
  format: 'excel',
  driverConfig: {
    sheet: 'Sales Data',    // Sheet name
    headerRow: 1,           // Row 1 has headers
    startRow: 2             // Data starts at row 2
  },
  mapping: {
    'Order ID': 'orderId',
    'Customer Name': 'customerName',
    'Total Amount': 'amount',
    'Order Date': 'orderDate'
  },
  transforms: {
    amount: Transformers.parseFloat(2),
    orderDate: Transformers.parseDate()
  }
});

await db.usePlugin(importer);
await importer.import('./sales-report-2025.xlsx');
```

---

## API Reference

### Constructor

```javascript
new ImporterPlugin(config)
```

**Parameters**:
- `config.resource` (string, required) - Target resource name
- `config.format` (string, required) - File format ('json', 'jsonl', 'csv', 'tsv')
- `config.mapping` (object) - Field mapping (source → target)
- `config.transforms` (object) - Field transformations
- `config.validate` (function) - Validation function
- `config.deduplicateBy` (string|array) - Deduplication key field(s)
- `config.batchSize` (number) - Records per batch (default: 1000)
- `config.parallelism` (number) - Parallel operations (default: 10)
- `config.continueOnError` (boolean) - Continue on errors (default: true)
- `config.streaming` (boolean) - Enable streaming (default: true)
- `config.driverConfig` (object) - Driver-specific configuration

### Methods

#### `import(filePath, options)`

Import data from file.

**Parameters**:
- `filePath` (string) - Path to file (local, S3, or URL)
- `options` (object) - Import options (overrides config)

**Returns**: Promise<ImportResult>

```javascript
const result = await importer.import('./users.csv');
// {
//   processed: 10000,
//   inserted: 9800,
//   skipped: 150,
//   errors: 0,
//   duplicates: 50,
//   duration: 2500
// }
```

#### `getStats()`

Get import statistics.

**Returns**: Object

```javascript
const stats = importer.getStats();
// {
//   totalProcessed: 10000,
//   totalInserted: 9800,
//   totalSkipped: 150,
//   totalErrors: 0,
//   totalDuplicates: 50,
//   recordsPerSecond: 4000,
//   startTime: 1729468800000,
//   endTime: 1729468802500
// }
```

### Events

#### `progress`

Emitted after each batch.

```javascript
importer.on('progress', (progress) => {
  // progress: { processed, inserted, skipped, errors, percent }
});
```

#### `error`

Emitted on validation or insertion errors.

```javascript
importer.on('error', (error) => {
  // error: { row, message, record, error }
});
```

#### `complete`

Emitted when import completes.

```javascript
importer.on('complete', (result) => {
  // result: { processed, inserted, skipped, errors, duplicates, duration }
});
```

---

## Troubleshooting

### Slow Import Performance

**Problem**: Import is taking too long.

**Solutions**:
1. Increase `batchSize`:
   ```javascript
   batchSize: 5000  // Larger batches
   ```

2. Increase `parallelism`:
   ```javascript
   parallelism: 20  // More concurrent operations
   ```

3. Disable validation if not needed:
   ```javascript
   validate: null
   ```

4. Use JSONL instead of CSV for large files:
   ```javascript
   format: 'jsonl'  // Faster parsing than CSV
   ```

### High Memory Usage

**Problem**: Process runs out of memory.

**Solutions**:
1. Reduce `batchSize`:
   ```javascript
   batchSize: 500  // Smaller batches
   ```

2. Enable streaming:
   ```javascript
   streaming: true
   ```

3. Process files in chunks

### Validation Errors

**Problem**: Many records are being skipped.

**Solutions**:
1. Check validation function:
   ```javascript
   validate: (record) => {
     console.log('Validating:', record);  // Debug
     return true;
   }
   ```

2. Listen to error events:
   ```javascript
   importer.on('error', (error) => {
     console.error('Validation failed:', error);
   });
   ```

3. Review field mapping

### File Not Found

**Problem**: Cannot find input file.

**Solutions**:
1. Use absolute paths:
   ```javascript
   import path from 'path';
   const filePath = path.resolve('./users.csv');
   ```

2. Check file permissions

3. Verify file exists:
   ```javascript
   import fs from 'fs';
   if (!fs.existsSync(filePath)) {
     console.error('File not found:', filePath);
   }
   ```

---

## Performance Tips

1. **Use JSONL for large datasets** - Faster than CSV
2. **Tune batch size** - Start with 1000, adjust based on record size
3. **Increase parallelism** - For high-performance systems
4. **Disable validation** - If data is already validated
5. **Use deduplication wisely** - Only when necessary
6. **Monitor memory** - Reduce batch size if needed
7. **Profile transforms** - Avoid expensive operations in transforms
8. **Pre-process data** - Clean data before import when possible

---

## ❓ FAQ

### General

**Q: What does the ImporterPlugin do?**
A: Enables high-performance bulk data import from multiple file formats (CSV, JSON, JSONL, Excel, Parquet) with streaming processing, field mapping, transformations, validation, and deduplication.

**Q: Why use ImporterPlugin instead of manual inserts?**
A: ImporterPlugin is 5-9x faster with 40x less memory usage through streaming and parallel batch processing. Manual inserts process one record at a time, while ImporterPlugin processes thousands in parallel batches.

**Q: What file formats are supported?**
A:
- **CSV** (`.csv`) - Comma-separated values (built-in)
- **TSV** (`.tsv`) - Tab-separated values (built-in)
- **JSON** (`.json`) - JSON array (built-in)
- **JSONL/NDJSON** (`.jsonl`, `.ndjson`) - JSON Lines (built-in)
- **Excel** (`.xlsx`, `.xls`) - Requires `exceljs` package
- **Parquet** (`.parquet`) - Requires `parquetjs` package

All formats support gzip compression (`.gz` extension).

**Q: Do I need to install additional packages?**
A: Only for Excel and Parquet:
```bash
npm install exceljs      # For Excel (.xlsx)
npm install parquetjs    # For Parquet
```

CSV, JSON, and JSONL work out of the box.

### Configuration

**Q: What are the minimum required parameters?**
A: Only three:
```javascript
new ImporterPlugin({
  resource: 'users',       // Required: target resource name
  format: 'csv',          // Required: file format
  filePath: './data.csv'  // Required: path to file
})
```

**Q: How do I map source fields to target fields?**
A: Use the `mapping` option:
```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  mapping: {
    'user_id': 'id',           // Source → Target
    'user_name': 'name',
    'email_address': 'email'
  }
})
```

**Q: Can I transform data during import?**
A: Yes! Use the `transforms` option:
```javascript
transforms: {
  email: (value) => value.toLowerCase(),
  createdAt: (value) => new Date(value).getTime(),
  age: (value) => parseInt(value, 10),
  tags: (value) => value.split(',')
}
```

**Q: How do I configure batch size and parallelism?**
A: Use `batchSize` and `parallelism`:
```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  batchSize: 1000,    // Records per batch (default: 1000)
  parallelism: 10     // Concurrent batches (default: 10)
})
```

**Tuning guide:**
- Small files (<10K): `batchSize: 500, parallelism: 5`
- Medium files (10K-1M): `batchSize: 1000, parallelism: 10` (default)
- Large files (>1M): `batchSize: 5000, parallelism: 20`

**Q: How do I skip duplicate records?**
A: Use `deduplicateBy`:
```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  deduplicateBy: 'email'  // Skip records with duplicate emails
})

// Or multiple fields
deduplicateBy: ['userId', 'timestamp']
```

### Operations

**Q: Can ImporterPlugin restore BackupPlugin exports?**
**A:** Yes! BackupPlugin exports to JSONL.gz format, which ImporterPlugin can import directly:

```javascript
// BackupPlugin export: users.jsonl.gz
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'jsonl',  // Gzip auto-detected
  filePath: './backups/full-2025-10-21/users.jsonl.gz'
});

await importer.import();  // Restored!
```

**Q: What's the best format for large datasets?**
**A:** JSONL (JSON Lines) is fastest:
- **JSONL**: ~12s for 1M rows, streaming-friendly
- **CSV**: ~15s for 1M rows, needs parsing
- **JSON**: ~20s for 1M rows, loads entire array to memory
- **Excel**: ~25s for 1M rows, overhead from XLSX format

For maximum performance: Use JSONL with gzip compression.

**Q: How do I handle schema differences between source and target?**
**A:** Use field mapping and transformations:

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  filePath: './legacy-users.csv',
  fieldMapping: {
    'full_name': 'name',        // Rename field
    'email_address': 'email',   // Rename field
    'created': 'createdAt'      // Rename field
  },
  transforms: {
    createdAt: (value) => new Date(value).toISOString(),  // Convert to ISO
    email: (value) => value.toLowerCase()  // Normalize
  }
});
```

**Q: How do I skip duplicate records?**
**A:** Use the `deduplicationKey` option:

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  filePath: './users.csv',
  deduplicationKey: ['email'],  // Skip if email already exists
  continueOnError: true  // Continue importing even if duplicates found
});

await importer.import();
// Result: { imported: 950, skipped: 50, errors: 0 }
```

**Q: How much memory does ImporterPlugin use?**
**A:** Very little! Streaming processing uses ~200MB for any file size:
- 1K rows: ~200MB
- 1M rows: ~200MB
- 10M rows: ~200MB

Memory usage depends on `batchSize * recordSize`, not total file size.

**Q: Can I import from S3 directly?**
**A:** Not directly, but you can download first:

```javascript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { pipeline } from 'stream/promises';
import fs from 'fs';

const s3 = new S3Client({ region: 'us-east-1' });
const response = await s3.send(new GetObjectCommand({
  Bucket: 'my-bucket',
  Key: 'data/users.csv'
}));

// Stream to temp file
await pipeline(response.Body, fs.createWriteStream('/tmp/users.csv'));

// Then import
const importer = new ImporterPlugin({
  resource: 'users',
  filePath: '/tmp/users.csv'
});
await importer.import();
```

### Performance

**Q: How fast is ImporterPlugin?**
A: Performance benchmarks (1M records):
- CSV: ~12 seconds (~83K records/sec)
- JSONL: ~10 seconds (~100K records/sec)
- JSON: ~15 seconds (~66K records/sec)
- Excel: ~25 seconds (~40K records/sec)

Compared to manual inserts: 5-9x faster with 40x less memory.

**Q: What's the fastest file format?**
A: JSONL (JSON Lines) is fastest because:
- Streaming-friendly (one record per line)
- No array parsing overhead
- Gzip compression supported
- Minimal parsing required

**Q: How do I optimize import performance?**
A:
1. **Use JSONL format** for maximum speed
2. **Increase batchSize** for larger records: `batchSize: 5000`
3. **Increase parallelism** on powerful machines: `parallelism: 20`
4. **Disable validation** if data is pre-validated: `validate: null`
5. **Remove unnecessary transforms** - only transform what's needed
6. **Use gzip compression** for network transfers

**Q: Why is my import slow?**
A: Common causes:
1. **Small batch size** - Increase to 1000-5000
2. **Low parallelism** - Increase to 10-20
3. **Complex transforms** - Simplify or pre-process data
4. **Expensive validation** - Remove or optimize validation logic
5. **Network latency** - Import from local files when possible

**Q: How do I handle very large files (>10GB)?**
A:
1. **Split file** into smaller chunks:
   ```bash
   split -l 1000000 data.csv chunk_
   ```
2. **Import chunks sequentially**:
   ```javascript
   const files = ['chunk_aa', 'chunk_ab', 'chunk_ac'];
   for (const file of files) {
     await importer.import(file);
   }
   ```
3. **Increase batch size**: `batchSize: 10000`
4. **Monitor memory**: Keep below 80% system memory

### Validation & Errors

**Q: How do I validate records before import?**
A: Use the `validate` function:
```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  validate: (record) => {
    if (!record.id || !record.email) return false;
    if (record.age < 0 || record.age > 120) return false;
    if (!record.email.includes('@')) return false;
    return true;
  },
  continueOnError: true  // Skip invalid records
})
```

**Q: Should I stop or continue on validation errors?**
A: Depends on your use case:
- **Stop on error** (`continueOnError: false`): For critical data where any error is unacceptable
- **Continue on error** (`continueOnError: true`): For bulk imports where some errors are acceptable

**Q: How do I track validation errors?**
A: Listen to the `error` event:
```javascript
importer.on('error', (error) => {
  console.error(`Row ${error.row}: ${error.message}`);
  console.error('Record:', error.record);
});

const result = await importer.import('./data.csv');
console.log(`Skipped ${result.skipped} invalid records`);
```

**Q: Can I save rejected records to a file?**
A: Yes:
```javascript
const rejectedRecords = [];

importer.on('error', (error) => {
  rejectedRecords.push({
    row: error.row,
    record: error.record,
    reason: error.message
  });
});

await importer.import('./data.csv');

// Save rejected records
fs.writeFileSync(
  './rejected.json',
  JSON.stringify(rejectedRecords, null, 2)
);
```

### Progress Tracking

**Q: How do I monitor import progress?**
A: Use the `progress` event:
```javascript
importer.on('progress', (progress) => {
  console.log(`${progress.percent}% complete`);
  console.log(`Processed: ${progress.processed}`);
  console.log(`Inserted: ${progress.inserted}`);
  console.log(`Skipped: ${progress.skipped}`);
});
```

**Q: Can I show a progress bar?**
A: Yes, with a progress library:
```javascript
import cliProgress from 'cli-progress';

const bar = new cliProgress.SingleBar({});
let total = 0;

importer.on('start', (stats) => {
  total = stats.total;
  bar.start(total, 0);
});

importer.on('progress', (progress) => {
  bar.update(progress.processed);
});

importer.on('complete', () => {
  bar.stop();
});

await importer.import('./data.csv');
```

**Q: How often are progress events emitted?**
A: After each batch completes. With `batchSize: 1000`, you'll get a progress event every 1000 records.

### Troubleshooting

**Q: Import is failing with "Out of memory" error?**
A: Reduce batch size:
```javascript
batchSize: 500,      // Reduce from 1000
parallelism: 5       // Reduce from 10
```

**Q: Getting "File not found" error?**
A: Use absolute paths:
```javascript
import path from 'path';

const filePath = path.resolve('./data.csv');
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  filePath
});
```

**Q: CSV parsing errors with special characters?**
A: Specify encoding:
```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  driverConfig: {
    encoding: 'utf8'  // or 'latin1', 'utf16le'
  }
});
```

**Q: Excel import shows empty cells as undefined?**
A: Filter or transform undefined values:
```javascript
transforms: {
  age: (value) => value ?? 0,  // Default to 0
  name: (value) => value ?? ''  // Default to empty string
}
```

**Q: How do I handle CSV files without headers?**
A: Specify field mapping by index:
```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  driverConfig: {
    hasHeader: false
  },
  mapping: {
    '0': 'id',      // First column → id
    '1': 'name',    // Second column → name
    '2': 'email'    // Third column → email
  }
});
```

### Advanced

**Q: Can I import from URLs?**
A: Yes, download first with fetch:
```javascript
const response = await fetch('https://example.com/data.csv');
const buffer = await response.arrayBuffer();
fs.writeFileSync('/tmp/data.csv', Buffer.from(buffer));

await importer.import('/tmp/data.csv');
```

**Q: Can I transform nested objects?**
A: Yes, transformations work on nested fields:
```javascript
transforms: {
  'address.city': (value) => value.toUpperCase(),
  'profile.age': (value) => parseInt(value, 10)
}
```

**Q: How do I import only specific rows?**
A: Use validation to filter:
```javascript
validate: (record, index) => {
  // Import only rows 100-200
  return index >= 100 && index < 200;
}
```

**Q: Can I import multiple files in parallel?**
A: Yes, but carefully manage memory:
```javascript
const files = ['file1.csv', 'file2.csv', 'file3.csv'];

// Parallel import (use with caution)
await Promise.all(files.map(file =>
  new ImporterPlugin({
    resource: 'users',
    format: 'csv',
    batchSize: 500  // Reduce batch size for parallel
  }).import(file)
));
```

**Q: How do I handle date formats from different locales?**
A: Use a date parsing library:
```javascript
import { parse } from 'date-fns';

transforms: {
  createdAt: (value) => {
    // Handle multiple formats
    const formats = ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM-dd-yyyy'];
    for (const format of formats) {
      try {
        return parse(value, format, new Date()).getTime();
      } catch {}
    }
    return null;
  }
}
```

### For AI Agents

**Q: What problem does this plugin solve?**
**A:** Enables high-performance bulk data import from multiple file formats (CSV, JSON, JSONL, Excel, Parquet) with streaming processing, schema mapping, transformations, validation, and deduplication.

**Q: What are the minimum required parameters?**
**A:** Three required parameters:
- `resource`: Name of target s3db resource
- `format`: File format (csv, json, jsonl, tsv, excel, parquet)
- `filePath`: Path to file to import

```javascript
new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  filePath: './users.csv'
})
```

**Q: What are the default values for all configurations?**
**A:**
```javascript
{
  resource: undefined,        // Required
  format: undefined,          // Required
  filePath: undefined,        // Required
  batchSize: 1000,           // Records per batch
  parallelism: 10,           // Concurrent batches
  continueOnError: false,    // Stop on first error
  skipValidation: false,     // Validate before insert
  deduplicationKey: null,    // No deduplication
  fieldMapping: {},          // No field renaming
  transforms: {},            // No transformations
  onProgress: null,          // No progress callback
  onError: null,             // No error callback
  encoding: 'utf8'           // File encoding
}
```

**Q: What events does this plugin emit?**
**A:**
- `import:start` - Import started with total records estimate
- `import:progress` - Progress update (every N records based on batchSize)
- `import:batch` - Batch completed (records imported, time taken)
- `import:error` - Import error occurred
- `import:complete` - Import finished with summary stats

Listen via:
```javascript
importer.on('import:progress', (data) => {
  console.log(`Progress: ${data.processed}/${data.total} (${data.percent}%)`);
});
```

**Q: How do I debug import issues?**
**A:** Enable detailed logging and error callbacks:

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  filePath: './users.csv',
  continueOnError: true,
  onError: (error, record, index) => {
    console.error(`Error at row ${index}:`, error.message);
    console.error('Record:', record);
  },
  onProgress: (stats) => {
    console.log(`Imported: ${stats.imported}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  }
});

await importer.import();
```

**Q: What file formats are supported?**
**A:**
- **CSV** (`.csv`) - Comma-separated values
- **TSV** (`.tsv`) - Tab-separated values
- **JSON** (`.json`) - Single JSON array
- **JSONL** (`.jsonl`, `.ndjson`) - JSON Lines (one object per line)
- **Excel** (`.xlsx`, `.xls`) - Microsoft Excel
- **Parquet** (`.parquet`) - Apache Parquet

All formats support automatic gzip decompression (`.gz` extension).

**Q: How do transformations work?**
**A:** Transformations are applied to each field value before validation and insert:

```javascript
{
  transforms: {
    email: (value) => value.toLowerCase().trim(),
    createdAt: (value) => new Date(value).toISOString(),
    age: (value) => parseInt(value, 10),
    tags: (value) => value.split(',').map(t => t.trim())
  }
}
```

Execution order: Read → Transform → Map → Validate → Insert

---

## Related Documentation

- [ReplicatorPlugin](./replicator.md#-csv-replicator) - Export data to multiple formats
- [BackupPlugin](./backup.md) - Create JSONL.gz backups that ImporterPlugin can restore
- [Schema Validation](../schema.md) - Resource schema definition
- [Performance Optimization](../README.md#performance) - General performance tips

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: https://github.com/anthropics/s3db.js/issues
- Documentation: https://docs.s3db.js.org
