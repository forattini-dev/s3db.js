# RedDbClient

The **RedDbClient** connects s3db.js to [RedDB](https://github.com/nicholasgasior/reddb) -- a Rust-based unified database engine that supports tables, graphs, documents, and vectors in a single process. It maps the s3db.js key-value object interface to RedDB's HTTP API, storing each object as a row with structured fields.

**Best for:**

- Self-hosted environments where you want a single database engine for multiple data models
- Workloads that benefit from RedDB's table, graph, document, and vector capabilities alongside s3db.js
- Development and staging environments with a lightweight Rust binary instead of S3/MinIO

## Quick Start

### Connection String

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'reddb://localhost:8080'
});

await db.connect();
```

### Manual Instantiation

```javascript
import { Database, RedDbClient } from 's3db.js';

const db = new Database({
  client: new RedDbClient({
    baseUrl: 'http://localhost:8080',
    collection: 'my-app',
    bucket: 'my-app',
    keyPrefix: 'production/',
  })
});

await db.connect();
```

## Connection String Format

```
reddb://[authToken[:writeToken]@]host[:port][/keyPrefix][?collection=name]
```

| Component | Description | Default |
|-----------|-------------|---------|
| `authToken` | Bearer token for read requests | None |
| `writeToken` | Bearer token for write requests | None |
| `host` | RedDB server hostname | `localhost` |
| `port` | RedDB HTTP API port | `8080` |
| `keyPrefix` | Prefix applied to all keys | None |
| `collection` | RedDB collection name (query param) | Bucket name |

### Examples

```bash
# Local development, no auth
reddb://localhost:8080

# With authentication token
reddb://mySecretToken@reddb.internal:8080

# Separate read and write tokens
reddb://readToken:writeToken@reddb.internal:8080

# With key prefix (multi-tenant isolation)
reddb://localhost:8080/tenant-acme

# Custom collection name
reddb://localhost:8080?collection=events

# Full example: auth + prefix + collection
reddb://myToken@reddb.internal:8080/v2?collection=orders
```

## Configuration Options

```typescript
interface RedDbClientConfig {
  baseUrl: string;           // Required -- RedDB HTTP endpoint (e.g. 'http://localhost:8080')
  authToken?: string;        // Bearer token for read operations
  writeToken?: string;       // Bearer token for write operations
  collection?: string;       // RedDB collection name (defaults to bucket)
  bucket?: string;           // Bucket name (default: 's3db')
  keyPrefix?: string;        // Prefix applied to all key operations
  region?: string;           // Region identifier (default: 'reddb')
  concurrency?: number;      // Max parallel operations (default: 5)
  retries?: number;          // Retry attempts on failure (default: 3)
  retryDelay?: number;       // Delay between retries in ms (default: 1000)
  timeout?: number;          // Request timeout in ms (default: 30000)
  retryableErrors?: string[];// Error codes to retry on
  logLevel?: string;         // Log level (default: 'info')
  logger?: Logger;           // Custom logger instance
  id?: string;               // Client instance identifier
  taskExecutor?: TaskManager;           // Custom task executor
  taskExecutorMonitoring?: MonitoringConfig | null;
}
```

## How Data is Stored

Each s3db.js object becomes a row in a RedDB collection. The row contains these fields:

| Field | Type | Description |
|-------|------|-------------|
| `_key` | string | Object key (with prefix applied) |
| `_body` | string | Object body (encoded) |
| `_body_encoding` | string | Encoding format: `base64`, `utf8`, or `json` |
| `_etag` | string | MD5 hash of the body |
| `_metadata` | object | Encoded s3db.js metadata |
| `_content_type` | string | MIME type (default: `application/octet-stream`) |
| `_content_encoding` | string | Content encoding (if set) |
| `_content_length` | number | Body size in bytes |
| `_last_modified` | string | ISO 8601 timestamp |

Body encoding is automatic:

- `Buffer` values are stored as base64
- `string` values are stored as utf8
- Objects are JSON-serialized

## Usage

### Basic CRUD

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'reddb://localhost:8080'
});

await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'email|required',
    role: 'string|default:member',
  }
});

// Insert
await users.insert({ id: 'user-1', name: 'Alice', email: 'alice@example.com' });

// Get
const user = await users.get('user-1');

// Update
await users.update('user-1', { role: 'admin' });

// List
const allUsers = await users.list();

// Delete
await users.delete('user-1');

await db.disconnect();
```

### Authentication

```javascript
// Read-only token
const db = new Database({
  connectionString: 'reddb://readOnlyToken@reddb.internal:8080'
});

// Separate read and write tokens
const db = new Database({
  connectionString: 'reddb://readToken:writeToken@reddb.internal:8080'
});
```

The `authToken` is sent as a Bearer token on all requests. If `writeToken` is provided, it is stored separately (the HTTP client uses `authToken` for its Bearer header by default).

### Key Prefix for Multi-Tenancy

```javascript
// All keys are prefixed with 'tenant-acme/'
const db = new Database({
  connectionString: 'reddb://localhost:8080/tenant-acme'
});

// Inserting { id: 'user-1' } stores the key as 'tenant-acme/users/user-1'
// Listing and reading automatically strips the prefix
```

### Custom Collection

By default, the collection name matches the bucket name (`s3db`). You can override it:

```javascript
const db = new Database({
  connectionString: 'reddb://localhost:8080?collection=my-app-data'
});
```

Collections are created on-the-fly by RedDB -- you do not need to create them beforehand.

### Conditional Writes

RedDbClient supports `ifNoneMatch` and `ifMatch` for optimistic concurrency:

```javascript
// Insert only if key does not exist (atomic insert)
await client.putObject({
  key: 'users/user-1',
  body: Buffer.from('{"name":"Alice"}'),
  ifNoneMatch: '*',
});

// Update only if ETag matches (optimistic locking)
const obj = await client.getObject('users/user-1');
await client.putObject({
  key: 'users/user-1',
  body: Buffer.from('{"name":"Alice Updated"}'),
  ifMatch: obj.ETag,
});
```

Both throw a `ResourceError` with status 412 if the precondition fails.

### Pagination

`listObjects` uses offset-based pagination with base64-encoded continuation tokens:

```javascript
// First page
const page1 = await client.listObjects({ prefix: 'users/', maxKeys: 100 });

// Next page (if truncated)
if (page1.IsTruncated) {
  const page2 = await client.listObjects({
    prefix: 'users/',
    maxKeys: 100,
    continuationToken: page1.NextContinuationToken,
  });
}
```

## RedDB Query Language

Under the hood, RedDbClient translates operations into RedDB queries via `POST /query`:

| s3db.js Operation | RedDB Query |
|-------------------|-------------|
| `getObject(key)` | `FROM collection WHERE _key = 'key' LIMIT 1` |
| `listObjects({ prefix })` | `FROM collection WHERE _key LIKE 'prefix%' ORDER BY _key LIMIT N OFFSET M` |
| `count({ prefix })` | Same as list with `LIMIT 0` (uses `total` from response) |

Mutations use the RedDB entity API:

| s3db.js Operation | RedDB Endpoint |
|-------------------|----------------|
| `putObject` (new) | `POST /collections/{collection}/rows` |
| `putObject` (update) | `PATCH /collections/{collection}/entities/{id}` |
| `deleteObject` | `DELETE /collections/{collection}/entities/{id}` |

## Supported Operations

| Method | Supported | Notes |
|--------|-----------|-------|
| `putObject` | Yes | Creates or updates via query + POST/PATCH |
| `getObject` | Yes | Query by exact key |
| `headObject` | Yes | Same as get, without body decoding |
| `copyObject` | Yes | Read source, write to target |
| `deleteObject` | Yes | Query + DELETE by entity ID |
| `deleteObjects` | Yes | Batched with configurable concurrency |
| `listObjects` | Yes | Prefix-based LIKE query with delimiter support |
| `exists` | Yes | Query by key, returns boolean |
| `count` | Yes | Uses `total` from query response |
| `getAllKeys` | Yes | Paginated full scan |
| `getKeysPage` | Yes | Single-page key fetch |
| `moveObject` | Yes | Copy + delete |
| `moveAllObjects` | Yes | Batched move with task executor |
| `deleteAll` | Yes | getAllKeys + deleteObjects |

## Prerequisites

RedDB must be running and accessible over HTTP. The default port is 8080.

```bash
# Start RedDB (example -- adjust to your setup)
cd ~/Work/FF/reddb
cargo run
# RedDB HTTP API listening on :8080
# RedDB gRPC API listening on :50051
```

The client uses the s3db.js HTTP client (`recker` when available, native `fetch` as fallback). No additional dependencies are required.

## Limitations

- **No native transactions** -- s3db.js operations are individual HTTP calls. Conditional writes (`ifNoneMatch`, `ifMatch`) provide optimistic concurrency but not ACID transactions.
- **Query-then-mutate pattern** -- `putObject` queries for the existing entity first, then either creates or patches. This adds one extra round-trip compared to a direct upsert.
- **No streaming** -- Bodies are fully loaded into memory for encoding/decoding. Large objects consume proportional memory.
- **HTTP only** -- The client uses RedDB's HTTP API (port 8080), not the gRPC API (port 50051).

## Troubleshooting

### Connection refused

```
Error: RedDB query failed: fetch failed
```

Verify RedDB is running and the base URL is correct. The default port is 8080.

```bash
curl http://localhost:8080/query -d '{"query":"FROM s3db LIMIT 1"}'
```

### 404 on queries

A 404 from `/query` typically means the collection does not exist yet. RedDB creates collections on-the-fly when you first write to them. Ensure you have written at least one object, or check that the `collection` parameter matches what you expect.

### Precondition failed (412)

```
ResourceError: Precondition failed
```

This occurs when `ifNoneMatch: '*'` is used and the key already exists, or when `ifMatch` is used and the ETag does not match. Fetch the latest state and retry, or remove the precondition.
