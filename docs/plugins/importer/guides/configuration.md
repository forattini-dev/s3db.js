# Configuration

> **In this guide:** All configuration options, supported formats, field mapping, transformations, and API reference.

**Navigation:** [← Back to Importer Plugin](../README.md)

---

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resource` | string | Required | Target resource name |
| `format` | string | Required | File format |
| `filePath` | string | — | Path to file |
| `mapping` | object | `{}` | Field mapping (source → target) |
| `transforms` | object | `{}` | Field transformations |
| `validate` | function | `null` | Validation function |
| `deduplicateBy` | string/array | `null` | Deduplication key field(s) |
| `batchSize` | number | `1000` | Records per batch |
| `parallelism` | number | `10` | Parallel operations |
| `continueOnError` | boolean | `false` | Continue on validation errors |
| `streaming` | boolean | `true` | Enable streaming mode |
| `driverConfig` | object | `{}` | Format-specific configuration |

---

## Supported Formats

| Format | Extension | Dependency | Auto-installed |
|--------|-----------|------------|----------------|
| **CSV** | `.csv` | Built-in | Yes |
| **TSV** | `.tsv` | Built-in | Yes |
| **JSON** | `.json` | Built-in | Yes |
| **JSONL/NDJSON** | `.jsonl`, `.ndjson` | Built-in | Yes |
| **Excel** | `.xlsx`, `.xls` | `exceljs` | No |
| **Parquet** | `.parquet` | `parquetjs` | No |

All formats support gzip compression (`.gz` extension).

### Install Optional Dependencies

```bash
# Excel support
pnpm install exceljs

# Parquet support
pnpm install parquetjs
```

---

## Format-Specific Configuration

### CSV/TSV Configuration

```javascript
driverConfig: {
  delimiter: ',',        // Auto-detect by default
  hasHeader: true,       // First row is header
  encoding: 'utf8',      // File encoding
  quote: '"',            // Quote character
  escape: '"'            // Escape character
}
```

### Excel Configuration

```javascript
driverConfig: {
  sheet: 0,              // Sheet index or name
  headerRow: 0,          // Header row index
  startRow: 1,           // Data starts at row
  encoding: 'utf8'
}
```

### JSON/JSONL Configuration

```javascript
driverConfig: {
  encoding: 'utf8'
}
```

---

## Field Mapping

### Simple Mapping

```javascript
mapping: {
  'user_id': 'id',         // Source → Target
  'user_name': 'name',
  'user_email': 'email'
}
```

**Source CSV:**
```csv
user_id,user_name,user_email
u1,Alice,alice@example.com
```

**Imported as:**
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

### Index-Based Mapping (No Headers)

```javascript
driverConfig: { hasHeader: false },
mapping: {
  '0': 'id',      // First column → id
  '1': 'name',    // Second column → name
  '2': 'email'    // Third column → email
}
```

---

## Data Transformations

### Built-in Transformers

```javascript
import { Transformers } from 's3db.js';

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
  tags: Transformers.split(','),          // "a,b,c" → ["a", "b", "c"]

  // JSON parsing
  metadata: Transformers.parseJSON()
}
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
  }
}
```

---

## Validation

### Basic Validation

```javascript
validate: (record) => {
  // Required fields
  if (!record.id || !record.name) return false;

  // Data type validation
  if (record.age && typeof record.age !== 'number') return false;

  // Range validation
  if (record.age && (record.age < 0 || record.age > 120)) return false;

  // Email format
  if (record.email && !record.email.includes('@')) return false;

  return true;
}
```

### Validation with Error Logging

```javascript
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
```

---

## Deduplication

### Single Field

```javascript
deduplicateBy: 'id'  // Skip records with duplicate IDs
```

### Multi-Field

```javascript
deduplicateBy: ['userId', 'eventType', 'timestamp']
```

---

## API Reference

### Constructor

```javascript
new ImporterPlugin(config)
```

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `import(filePath, options?)` | Import data from file | `Promise<ImportResult>` |
| `getStats()` | Get import statistics | `ImportStats` |

### import(filePath, options)

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

### getStats()

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

| Event | Description | Payload |
|-------|-------------|---------|
| `progress` | After each batch | `{ processed, inserted, skipped, errors, percent }` |
| `error` | On validation/insertion error | `{ row, message, record, error }` |
| `complete` | Import finished | `{ processed, inserted, skipped, errors, duplicates, duration }` |
| `start` | Import started | `{ total }` |

```javascript
importer.on('progress', (progress) => {
  console.log(`${progress.percent}% complete`);
});

importer.on('error', (error) => {
  console.error(`Row ${error.row}: ${error.message}`);
});

importer.on('complete', (result) => {
  console.log(`Imported ${result.inserted} records`);
});
```

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Import workflows, format examples, progress tracking
- [Best Practices](./best-practices.md) - Performance, error handling, troubleshooting, FAQ
