# Usage Patterns

> **In this guide:** Import workflows, format-specific examples, progress tracking, and real-world scenarios.

**Navigation:** [← Back to Importer Plugin](../README.md) | [Configuration](./configuration.md)

---

## Basic Imports

### CSV Import

```javascript
import { Database } from 's3db.js';
import { ImporterPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

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
  format: 'jsonl',
  batchSize: 5000
});

await db.usePlugin(importer);
await importer.import('./events.jsonl');
```

---

## Import BackupPlugin Exports

BackupPlugin creates JSONL.gz exports that ImporterPlugin can restore directly:

```javascript
// BackupPlugin creates: users.jsonl.gz
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'jsonl',  // Gzip auto-detected
  filePath: './backups/full-2025-10-21T02-00-00-abc123/users.jsonl.gz',
  batchSize: 1000,
  parallelism: 10
});

await db.usePlugin(importer);
await importer.import();
// Backup restored! 1M records in ~12 seconds
```

---

## Format Examples

### CSV File

```csv
id,name,email,age
u1,Alice,alice@example.com,30
u2,Bob,bob@example.com,25
```

### JSON File

```json
[
  {"id": "u1", "name": "Alice", "email": "alice@example.com"},
  {"id": "u2", "name": "Bob", "email": "bob@example.com"}
]
```

### JSONL File

```jsonl
{"id":"u1","name":"Alice","email":"alice@example.com"}
{"id":"u2","name":"Bob","email":"bob@example.com"}
```

---

## Field Mapping Examples

### Rename Fields

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

## Transformation Examples

### Type Conversion

```javascript
transforms: {
  age: (value) => parseInt(value, 10),
  price: (value) => parseFloat(value),
  isActive: (value) => value === 'true' || value === '1',
  createdAt: (value) => new Date(value).getTime()
}
```

### String Manipulation

```javascript
transforms: {
  email: (value) => value.toLowerCase().trim(),
  name: (value) => value.trim(),
  status: (value) => value.toUpperCase()
}
```

### Computed Fields

```javascript
transforms: {
  fullName: (value, record) => `${record.firstName} ${record.lastName}`,
  totalPrice: (value, record) => record.quantity * record.unitPrice,
  ageGroup: (value) => {
    if (value < 18) return 'minor';
    if (value < 65) return 'adult';
    return 'senior';
  }
}
```

### Array Parsing

```javascript
transforms: {
  tags: (value) => value.split(',').map(t => t.trim()),
  permissions: (value) => JSON.parse(value)
}
```

---

## Progress Tracking

### Basic Progress Events

```javascript
importer.on('progress', (progress) => {
  console.log(`Progress: ${progress.percent}%`);
  console.log(`Processed: ${progress.processed}`);
  console.log(`Inserted: ${progress.inserted}`);
  console.log(`Skipped: ${progress.skipped}`);
});

importer.on('error', (error) => {
  console.error(`Error at row ${error.row}:`, error.message);
});

importer.on('complete', (result) => {
  console.log('Import complete!');
  console.log(`Total inserted: ${result.inserted}`);
  console.log(`Duration: ${result.duration}ms`);
});
```

### Progress Bar Integration

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

---

## Real-World Examples

### Migrate from PostgreSQL

```javascript
// 1. Export from PostgreSQL
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
console.log(`Migrated ${result.inserted} users`);
```

### Import Analytics Events

```javascript
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

### Import Excel Reports

```javascript
const importer = new ImporterPlugin({
  resource: 'sales',
  format: 'excel',
  driverConfig: {
    sheet: 'Sales Data',
    headerRow: 1,
    startRow: 2
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

## Error Handling Patterns

### Continue on Error

```javascript
const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  continueOnError: true,
  validate: (record) => record.age >= 0
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
  continueOnError: false
});

try {
  await importer.import('./users.csv');
} catch (error) {
  console.error('Import failed:', error.message);
}
```

### Save Rejected Records

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

// Save rejected records for review
fs.writeFileSync('./rejected.json', JSON.stringify(rejectedRecords, null, 2));
```

---

## Advanced Patterns

### Import from S3

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

// Import from temp file
await importer.import('/tmp/users.csv');
```

### Import from URL

```javascript
const response = await fetch('https://example.com/data.csv');
const buffer = await response.arrayBuffer();
fs.writeFileSync('/tmp/data.csv', Buffer.from(buffer));

await importer.import('/tmp/data.csv');
```

### Filter Specific Rows

```javascript
validate: (record, index) => {
  // Import only rows 100-200
  return index >= 100 && index < 200;
}
```

### Multiple File Import

```javascript
const files = ['file1.csv', 'file2.csv', 'file3.csv'];

for (const file of files) {
  console.log(`Importing ${file}...`);
  const result = await importer.import(file);
  console.log(`Imported ${result.inserted} records`);
}
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Performance, error handling, troubleshooting, FAQ
