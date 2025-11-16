# Client Classes

s3db.js provides **two client implementations** for different use cases:

| Client | Use Case | Speed | Setup |
|--------|----------|-------|-------|
| **S3Client** | Production, LocalStack, MinIO | S3 speed | AWS credentials |
| **MemoryClient** | Testing, development | **100-1000x faster** | Zero config |

---

## 🚀 MemoryClient - Ultra-Fast Testing

**Pure in-memory client** for ultra-fast tests without external services.

**Features:**
- ⚡ **100-1000x faster** than LocalStack
- 🎯 **No external services** - no Docker or S3 needed
- 💯 **100% API compatible** with S3Client
- 💾 **Snapshot/restore** - rapid test state management
- 📦 **Optional persistence** - save/load to disk
- 🔄 **BackupPlugin compatible** - export/import JSONL format

📚 **[Full MemoryClient Documentation](../src/clients/memory-client.md)**

```javascript
import { S3db, MemoryClient } from 's3db.js';

const db = new S3db({
  client: new MemoryClient({ bucket: 'test-bucket' })
});

await db.connect();
// Use exactly like S3Client - same API!
```

---

## 📡 S3Client - Production Client

The `S3Client` class is the production S3 interface that powers s3db.js. It provides optimized AWS S3 operations with connection pooling, metadata encoding, and error handling.

## Table of Contents

- [Overview](#overview)
- [Constructor](#constructor)
- [HTTP Client Configuration](#http-client-configuration)
- [Object Operations](#object-operations)
- [Listing & Pagination](#listing--pagination)
- [Bulk Operations](#bulk-operations)
- [Events](#events)
- [Error Handling](#error-handling)

---

## Overview

The S3Client class wraps the AWS SDK S3Client with:
- ✅ **Connection pooling** - HTTP keep-alive with configurable pool sizes
- ✅ **Smart metadata encoding** - Automatic compression for S3 metadata
- ✅ **Error mapping** - Actionable error messages with suggestions
- ✅ **Event system** - Monitor all S3 operations
- ✅ **Parallelism control** - Configurable concurrency for bulk operations

**When to use directly:**
- Advanced S3 operations not exposed by Resource API
- Custom S3 workflows requiring fine-grained control
- Building custom plugins or extensions

**Most users should use the Resource API instead**, which provides a higher-level interface.

---

## Constructor

```javascript
import { S3Client } from 's3db.js';

const client = new S3Client({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@BUCKET/prefix',
  logLevel: 'silent',
  parallelism: 100,  // Separate OperationsPool per database (default)
  httpClientOptions: {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 500,
    maxFreeSockets: 100,
    timeout: 60000
  }
});
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `connectionString` | string | **required** | S3 connection string with credentials and bucket |
| `logLevel` | boolean | `false` | Enable detailed logging |
| `id` | string | auto-generated | Client instance ID (77 chars) |
| `parallelism` | number | `100` | Concurrent operations for bulk methods (Separate OperationsPool per Database) |
| `httpClientOptions` | object | see below | HTTP agent configuration |
| `AwsS3Client` | S3Client | auto-created | Custom AWS S3Client instance |

### HTTP Client Options

| Option | Default | Description |
|--------|---------|-------------|
| `keepAlive` | `true` | Enable HTTP connection reuse |
| `keepAliveMsecs` | `1000` | Keep-alive duration (ms) |
| `maxSockets` | `500` | Maximum concurrent connections |
| `maxFreeSockets` | `100` | Free connections in pool |
| `timeout` | `60000` | Request timeout (60 seconds) |

**Performance Tip:** The default configuration supports high concurrency (500 max sockets). For resource-constrained environments, reduce `maxSockets` to 10-50.

---

## HTTP Client Configuration

The Client uses optimized HTTP settings for S3 performance:

### Default Configuration (Optimized)

```javascript
const client = new Client({
  connectionString: 's3://...',
  // Default settings (optimized for high concurrency):
  httpClientOptions: {
    keepAlive: true,         // Connection reuse enabled
    keepAliveMsecs: 1000,    // 1 second keep-alive
    maxSockets: 500,         // High concurrency support
    maxFreeSockets: 100,     // Better connection reuse
    timeout: 60000           // 60 second timeout
  }
});
```

### Custom Configurations

**High-Throughput Applications:**
```javascript
const client = new Client({
  connectionString: 's3://...',
  httpClientOptions: {
    keepAlive: true,
    keepAliveMsecs: 5000,    // Longer keep-alive
    maxSockets: 1000,        // Very high concurrency
    maxFreeSockets: 200,     // Large pool
    timeout: 120000          // 2 minute timeout
  }
});
```

**Resource-Constrained Environments:**
```javascript
const client = new Client({
  connectionString: 's3://...',
  httpClientOptions: {
    keepAlive: true,
    keepAliveMsecs: 500,     // Shorter keep-alive
    maxSockets: 10,          // Lower concurrency
    maxFreeSockets: 2,       // Smaller pool
    timeout: 15000           // 15 second timeout
  }
});
```

---

## Object Operations

### putObject

Store an object in S3 with metadata.

```javascript
await client.putObject({
  key: 'users/user-123',
  metadata: {
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  },
  body: Buffer.from('binary data'),
  contentType: 'application/octet-stream',
  contentEncoding: 'gzip',
  contentLength: 1024,
  ifMatch: 'etag-value'  // Conditional put
});
```

**Parameters:**
- `key` (string, required) - S3 object key
- `metadata` (object, optional) - Metadata automatically encoded
- `body` (Buffer/string, optional) - Object body (defaults to empty buffer)
- `contentType` (string, optional) - MIME type
- `contentEncoding` (string, optional) - Content encoding
- `contentLength` (number, optional) - Content length
- `ifMatch` (string, optional) - Conditional put based on ETag

**Smart Metadata Encoding:**
- Metadata values are automatically compressed using Base62, Base64, and dictionary encoding
- Saves 40-50% space on typical datasets
- All values converted to strings for S3 compatibility

### getObject

Retrieve an object from S3.

```javascript
const response = await client.getObject('users/user-123');

console.log(response.Metadata);     // Decoded metadata
console.log(response.Body);         // Stream or buffer
console.log(response.ContentType);  // MIME type
console.log(response.ContentLength);// Size in bytes
console.log(response.ETag);         // Object version
console.log(response.LastModified); // Last modification date
```

**Returns:** AWS S3 GetObjectCommand response with decoded metadata

### headObject

Retrieve object metadata without downloading the body.

```javascript
const response = await client.headObject('users/user-123');

console.log(response.Metadata);     // Object metadata
console.log(response.ContentLength);// Size
console.log(response.ETag);         // Version
console.log(response.LastModified); // Last modified
```

**Use case:** Check if object exists, get size, or validate version without downloading content.

### deleteObject

Delete a single object.

```javascript
await client.deleteObject('users/user-123');
```

### copyObject

Copy an object to a new location.

```javascript
await client.copyObject({
  from: 'users/user-123',
  to: 'archive/user-123'
});
```

**Note:** Metadata and content are preserved in the copy.

### moveObject

Move an object (copy + delete).

```javascript
await client.moveObject({
  from: 'users/user-123',
  to: 'archive/user-123'
});
```

**Atomic:** Uses copy-then-delete strategy.

### exists

Check if an object exists.

```javascript
const exists = await client.exists('users/user-123');
console.log(exists); // true or false
```

**Efficient:** Uses HEAD request (no data transfer).

---

## Listing & Pagination

### listObjects

List objects with pagination support.

```javascript
const response = await client.listObjects({
  prefix: 'users/',
  maxKeys: 100,
  continuationToken: 'token-from-previous-call'
});

console.log(response.Contents);            // Array of objects
console.log(response.KeyCount);            // Number of keys returned
console.log(response.IsTruncated);         // More results available?
console.log(response.NextContinuationToken); // Token for next page
```

**Parameters:**
- `prefix` (string, optional) - Filter by prefix
- `maxKeys` (number, default: 1000) - Max results per page
- `continuationToken` (string, optional) - Pagination token

### getAllKeys

Get all object keys under a prefix (handles pagination automatically).

```javascript
const keys = await client.getAllKeys({ prefix: 'users/' });
console.log(keys); // ['users/user-1', 'users/user-2', ...]
```

**Performance:** Uses efficient pagination with 1000 keys per batch.

### getKeysPage

Get a specific page of keys with offset support.

```javascript
const keys = await client.getKeysPage({
  prefix: 'users/',
  offset: 100,  // Skip first 100 keys
  amount: 50    // Return next 50 keys
});
```

**Use case:** Implement custom pagination in UI.

### count

Count total objects under a prefix.

```javascript
const count = await client.count({ prefix: 'users/' });
console.log(`Total users: ${count}`);
```

**Efficient:** Counts without downloading object data.

### getContinuationTokenAfterOffset

Get a continuation token to start listing from a specific offset.

```javascript
const token = await client.getContinuationTokenAfterOffset({
  prefix: 'users/',
  offset: 500  // Skip first 500 objects
});

const response = await client.listObjects({
  prefix: 'users/',
  continuationToken: token
});
```

**Use case:** Jump to a specific page without iterating through all previous pages.

---

## Bulk Operations

### deleteObjects

Delete multiple objects efficiently (up to 1000 per batch).

```javascript
const keys = ['users/user-1', 'users/user-2', 'users/user-3'];
const report = await client.deleteObjects(keys);

console.log(report.deleted);  // Successfully deleted
console.log(report.notFound); // Errors (e.g., not found)
```

**Automatic batching:** Splits requests into 1000-key chunks automatically.

**Parallelism:** Controlled by `parallelism` constructor option (default: 100 concurrent batches via Separate OperationsPool).

### deleteAll

Delete all objects under a prefix.

```javascript
const totalDeleted = await client.deleteAll({ prefix: 'temp/' });
console.log(`Deleted ${totalDeleted} objects`);
```

**Efficient:** Uses pagination and bulk delete (1000 objects per batch).

**Use case:** Clean up test data, remove entire resource collections.

### moveAllObjects

Move all objects from one prefix to another.

```javascript
const movedKeys = await client.moveAllObjects({
  prefixFrom: 'users/',
  prefixTo: 'archive/users/'
});

console.log(`Moved ${movedKeys.length} objects`);
```

**Parallelism:** Controlled by `parallelism` option.

**Atomic per object:** Each object is copied then deleted (no transaction guarantees across all objects).

---

## Events

The Client extends EventEmitter and emits events for all operations.

### Available Events

| Event | Payload | When |
|-------|---------|------|
| `command.request` | `(commandName, input)` | Before sending any S3 command |
| `command.response` | `(commandName, response, input)` | After successful S3 command |
| `putObject` | `(response, {key, metadata, ...})` | After putting an object |
| `getObject` | `(response, {key})` | After getting an object |
| `headObject` | `(response, {key})` | After head request |
| `deleteObject` | `(response, {key})` | After deleting an object |
| `deleteObjects` | `(report, keys)` | After bulk delete |
| `deleteAll` | `({prefix, batch, total})` | During deleteAll batches |
| `deleteAllComplete` | `({prefix, totalDeleted})` | After deleteAll completes |
| `copyObject` | `(response, {from, to})` | After copying an object |
| `listObjects` | `(response, options)` | After listing objects |
| `count` | `(count, {prefix})` | After counting objects |
| `getAllKeys` | `(keys, {prefix})` | After getting all keys |
| `getKeysPage` | `(keys, params)` | After getting keys page |
| `getContinuationTokenAfterOffset` | `(token, params)` | After getting continuation token |
| `moveAllObjects` | `({results, errors}, {prefixFrom, prefixTo})` | After moving all objects |

### Using Events

```javascript
// Monitor all S3 commands
client.on('command.request', (commandName, input) => {
  console.log(`Sending ${commandName}:`, input);
});

client.on('command.response', (commandName, response) => {
  console.log(`${commandName} completed`);
});

// Track deletions
client.on('deleteObject', (response, {key}) => {
  console.log(`Deleted: ${key}`);
});

// Monitor bulk operations
client.on('deleteAll', ({prefix, batch, total}) => {
  console.log(`Deleted ${batch} objects (${total} total) from ${prefix}`);
});

client.on('deleteAllComplete', ({prefix, totalDeleted}) => {
  console.log(`Cleanup complete: ${totalDeleted} objects deleted from ${prefix}`);
});
```

---

## Error Handling

The Client automatically maps AWS errors to actionable s3db.js errors:

### Error Types

| Error | AWS Error | When |
|-------|-----------|------|
| `NoSuchKey` | NoSuchKey | Object doesn't exist |
| `NotFound` | 404 | Resource not found |
| `AccessDenied` | AccessDenied | Insufficient permissions |
| `BucketNotFound` | NoSuchBucket | Bucket doesn't exist |
| `UnknownError` | Other | Unexpected error |

### Error Context

All errors include context for debugging:

```javascript
try {
  await client.getObject('nonexistent-key');
} catch (error) {
  console.log(error.name);         // 'NoSuchKey'
  console.log(error.message);      // 'Object not found'
  console.log(error.context.bucket); // Bucket name
  console.log(error.context.key);    // Object key
  console.log(error.suggestion);   // Actionable suggestion
}
```

### Best Practices

**1. Use tryFn for optional operations:**
```javascript
import { tryFn } from 's3db.js';

const [ok, err, data] = await tryFn(() => client.getObject('optional-key'));
if (ok) {
  console.log('Object found:', data);
} else {
  console.log('Object not found, using defaults');
}
```

**2. Handle specific errors:**
```javascript
try {
  await client.getObject('my-key');
} catch (error) {
  if (error.name === 'NoSuchKey') {
    // Handle missing object
  } else if (error.name === 'AccessDenied') {
    // Handle permission error
  } else {
    throw error; // Unknown error
  }
}
```

**3. Monitor errors with events:**
```javascript
client.on('command.response', (commandName, response, input) => {
  if (response instanceof Error) {
    console.error(`${commandName} failed:`, response.message);
  }
});
```

---

## Advanced Usage

### Custom S3Client

Pass your own configured S3Client:

```javascript
import { S3Client } from '@aws-sdk/client-s3';
import { Client } from 's3db.js';

const s3Client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'YOUR_KEY',
    secretAccessKey: 'YOUR_SECRET'
  }
});

const client = new Client({
  connectionString: 's3://BUCKET/prefix',
  AwsS3Client: s3Client
});
```

### Connection String Examples

**AWS S3:**
```javascript
's3://ACCESS_KEY:SECRET_KEY@my-bucket/databases/myapp'
```

**MinIO:**
```javascript
'http://minioadmin:minioadmin@localhost:9000/mybucket'
```

**Digital Ocean Spaces:**
```javascript
'https://SPACES_KEY:SPACES_SECRET@nyc3.digitaloceanspaces.com/space-name'
```

**IAM Role (no credentials):**
```javascript
's3://my-bucket/databases/myapp'
```

---

## Performance Tips

1. **Use bulk operations** for multiple objects:
   ```javascript
   // ❌ Slow
   for (const key of keys) {
     await client.deleteObject(key);
   }

   // ✅ Fast
   await client.deleteObjects(keys);
   ```

2. **Adjust parallelism** for your workload:
   ```javascript
   // High-throughput
   const client = new Client({
     connectionString: 's3://...',
     parallelism: 50  // More concurrent operations
   });
   ```

3. **Optimize HTTP settings** for your environment:
   ```javascript
   const client = new Client({
     connectionString: 's3://...',
     httpClientOptions: {
       maxSockets: 1000,      // High concurrency
       maxFreeSockets: 200,   // Large pool
       keepAliveMsecs: 5000   // Longer keep-alive
     }
   });
   ```

4. **Use prefix filtering** to reduce listing overhead:
   ```javascript
   // ❌ Lists everything
   const allKeys = await client.getAllKeys();

   // ✅ Lists only what you need
   const userKeys = await client.getAllKeys({ prefix: 'users/' });
   ```

5. **Monitor operations** with events:
   ```javascript
   client.on('command.request', (cmd) => {
     console.time(cmd);
   });

   client.on('command.response', (cmd) => {
     console.timeEnd(cmd);
   });
   ```

---

## See Also

- [Database Class](./database.md) - High-level database interface
- [Resource Class](./resource.md) - Resource (collection) operations
- [Connection Strings](./connection-strings.md) - Connection string formats
- [Error Handling](./errors.md) - Error types and handling strategies
