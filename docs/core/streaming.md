# Streaming

s3db.js provides streaming APIs for processing large datasets without loading everything into memory.

## Overview

| Class | Purpose | Direction |
|-------|---------|-----------|
| `ResourceReader` | Read records as stream | S3 -> Application |
| `ResourceWriter` | Write records as stream | Application -> S3 |
| `ResourceIdsReader` | Stream only IDs | S3 -> Application |

## ResourceReader

Stream records from a resource:

```javascript
const reader = users.readable({
  batchSize: 10,      // IDs per batch
  concurrency: 5      // Parallel fetches
});

// Event-based consumption
reader.on('data', (record) => {
  console.log('Record:', record);
});

reader.on('end', () => {
  console.log('All records processed');
});

reader.on('error', (err) => {
  console.error('Stream error:', err);
});

reader.resume();  // Start streaming
```

### Async Iterator

```javascript
const reader = users.readable();

for await (const record of reader) {
  console.log('Processing:', record.id);
}
```

### Pipe to Transform

```javascript
import { Transform } from 'stream';

const transform = new Transform({
  objectMode: true,
  transform(record, encoding, callback) {
    // Process each record
    record.processed = true;
    this.push(record);
    callback();
  }
});

const reader = users.readable();
reader.pipe(transform).pipe(/* destination */);
reader.resume();
```

## ResourceWriter

Stream records into a resource:

```javascript
const writer = users.writable({
  batchSize: 10,      // Records per batch
  concurrency: 5      // Parallel inserts
});

// Write records
writer.write({ email: 'a@example.com', name: 'Alice' });
writer.write({ email: 'b@example.com', name: 'Bob' });
writer.write({ email: 'c@example.com', name: 'Charlie' });

// Signal completion
writer.end();

// Events
writer.on('finish', () => {
  console.log('All records written');
});

writer.on('error', (err, failedRecord) => {
  console.error('Write failed:', err, failedRecord);
});
```

### Piping Data

```javascript
import { Readable } from 'stream';

const source = Readable.from([
  { email: 'a@example.com', name: 'Alice' },
  { email: 'b@example.com', name: 'Bob' }
]);

const writer = users.writable();

source.pipe(writer.writable);

writer.on('finish', () => {
  console.log('Import complete');
});
```

## ResourceIdsReader

Stream only IDs for memory-efficient listing:

```javascript
import { ResourceIdsReader } from 's3db.js/stream';

const idsReader = new ResourceIdsReader({
  resource: users,
  batchSize: 100
});

const allIds = [];
idsReader.on('data', (idBatch) => {
  allIds.push(...idBatch);
});

idsReader.on('end', () => {
  console.log(`Found ${allIds.length} records`);
});

idsReader.resume();
```

## Configuration Options

### ResourceReader

```javascript
const reader = users.readable({
  batchSize: 10,       // IDs to fetch per LIST call (default: 10)
  concurrency: 5       // Parallel GET requests (default: 5)
});
```

### ResourceWriter

```javascript
const writer = users.writable({
  batchSize: 10,       // Records per batch (default: 10)
  concurrency: 5       // Parallel INSERT requests (default: 5)
});
```

## Error Handling

### Reader Errors

```javascript
const reader = users.readable();

reader.on('error', (err, context) => {
  if (err.code === 'NoSuchKey') {
    console.log('Record deleted during stream');
  } else {
    console.error('Read error:', err);
  }
});
```

### Writer Errors

```javascript
const writer = users.writable();

writer.on('error', (err, record) => {
  if (err.name === 'ValidationError') {
    console.log('Invalid record:', record);
  } else {
    console.error('Write error:', err);
  }
});
```

## Backpressure

Both streams handle backpressure automatically:

```javascript
const reader = users.readable();
const writer = otherResource.writable();

// Backpressure is handled via pipe()
reader.pipe(writer.writable);

// Or manually
reader.on('data', (record) => {
  const canContinue = writer.write(record);
  if (!canContinue) {
    reader.pause();
    writer.once('drain', () => reader.resume());
  }
});
```

## Use Cases

### Bulk Export

```javascript
import { createWriteStream } from 'fs';
import { Transform } from 'stream';

const toJSON = new Transform({
  objectMode: true,
  transform(record, enc, cb) {
    this.push(JSON.stringify(record) + '\n');
    cb();
  }
});

const reader = users.readable({ batchSize: 100 });
const file = createWriteStream('users.jsonl');

reader.pipe(toJSON).pipe(file);
reader.resume();
```

### Bulk Import

```javascript
import { createReadStream } from 'fs';
import { Transform } from 'stream';
import readline from 'readline';

const rl = readline.createInterface({
  input: createReadStream('users.jsonl'),
  crlfDelay: Infinity
});

const writer = users.writable({ concurrency: 10 });

for await (const line of rl) {
  const record = JSON.parse(line);
  writer.write(record);
}

writer.end();
await new Promise(resolve => writer.on('finish', resolve));
```

### Data Migration

```javascript
async function migrateResource(source, destination) {
  const reader = source.readable({ batchSize: 50 });
  const writer = destination.writable({ concurrency: 20 });

  let count = 0;

  reader.on('data', (record) => {
    // Transform if needed
    delete record.oldField;
    record.newField = 'default';

    writer.write(record);
    count++;

    if (count % 1000 === 0) {
      console.log(`Migrated ${count} records`);
    }
  });

  reader.on('end', () => {
    writer.end();
  });

  await new Promise(resolve => writer.on('finish', resolve));
  console.log(`Migration complete: ${count} records`);
}
```

### Parallel Processing

```javascript
const reader = users.readable({ batchSize: 100, concurrency: 20 });

let processed = 0;

reader.on('data', async (record) => {
  // Process record (already parallelized via concurrency)
  await processRecord(record);
  processed++;
});

reader.on('end', () => {
  console.log(`Processed ${processed} records`);
});

reader.resume();
```

## Performance Tips

### Batch Size

```javascript
// Small batches: Lower memory, more S3 calls
readable({ batchSize: 10 })   // Good for large records

// Large batches: Higher memory, fewer S3 calls
readable({ batchSize: 100 })  // Good for small records
```

### Concurrency

```javascript
// Low concurrency: Safer, slower
readable({ concurrency: 5 })

// High concurrency: Faster, more S3 connections
readable({ concurrency: 50 })  // Watch for rate limits
```

### Memory Management

```javascript
// For very large datasets
const reader = users.readable({
  batchSize: 50,
  concurrency: 10
});

// Process one at a time to minimize memory
reader.on('data', async (record) => {
  reader.pause();  // Pause stream
  await heavyProcessing(record);
  reader.resume(); // Resume after processing
});
```

## See Also

- [Resource](/core/resource.md) - CRUD operations
- [Performance Tuning](/guides/performance-tuning.md) - Optimization
- [Errors](/reference/errors.md) - StreamError handling
