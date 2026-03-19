# Storage Clients

s3db.js supports multiple storage backends through a unified client interface.

## Available Clients

| Client | Use Case | Performance | Dependencies |
|--------|----------|-------------|--------------|
| [S3Client](s3-client.md) | Production with AWS S3, MinIO, R2 | Standard | `@aws-sdk/client-s3` |
| [SqliteClient](sqlite-client.md) | Local persistence, integration tests, single-process workloads | Very fast | None |
| [MemoryClient](memory-client.md) | Testing, development | 100-1000x faster | None |
| [FilesystemClient](filesystem-client.md) | Local development, edge cases | Fast | None |

## Quick Comparison

### S3Client

Production-ready client for AWS S3 and S3-compatible storage (MinIO, DigitalOcean Spaces, Cloudflare R2, etc).

```javascript
import { Database } from 's3db.js';

// AWS S3
const db = new Database({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@my-bucket?region=us-east-1'
});

// MinIO
const db = new Database({
  connectionString: 'http://ACCESS_KEY:SECRET_KEY@localhost:9000/my-bucket'
});

// Cloudflare R2
const db = new Database({
  connectionString: 'https://ACCESS_KEY:SECRET_KEY@ACCOUNT_ID.r2.cloudflarestorage.com/my-bucket'
});
```

### SqliteClient

Persistent embedded SQLite backend for local environments and CI.

It stores s3db objects durably in SQLite, but it does not turn resources into relational
tables. Resource evolution still happens through s3db metadata and schema registries.

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite:///tmp/s3db.sqlite'
});

// Or explicit configuration
import { SqliteClient } from 's3db.js';

const client = new SqliteClient({
  basePath: '/tmp/s3db.sqlite',
  maxObjectSize: 5 * 1024 * 1024,
  maxMemoryMB: 256
});
```

**Best for:**
- Single-process local services
- Integration tests with reconnect durability
- Migration drills and local persistence without S3

**Important caveat:**
- `maxMemoryMB` is a logical payload budget, not a precise SQLite engine memory measurement

### MemoryClient

In-memory implementation for blazing-fast tests. Zero external dependencies.

```javascript
import { Database } from 's3db.js';

// Simple connection string
const db = new Database({
  connectionString: 'memory://my-bucket/my-database'
});

// Or explicit configuration
import { MemoryClient } from 's3db.js';

const client = new MemoryClient({
  bucket: 'test-bucket',
  keyPrefix: 'test-db'
});
```

**Benefits:**
- 100-1000x faster than real S3
- No network latency
- No AWS credentials needed
- Snapshot/restore for test isolation
- Optional persistence to disk

### FilesystemClient

Stores data on local filesystem. Useful for development or edge deployments.

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'file:///path/to/data/directory'
});
```

## Connection String Format

All clients use a unified connection string format:

```
protocol://[credentials@]host[:port]/bucket[/prefix][?options]
```

SQLite does not use credentials. Use `sqlite:///absolute/path/to/file.db`,
`sqlite://./relative/path/file.db`, or `sqlite:///:memory:`.

### Examples

```bash
# AWS S3
s3://AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI%2FK7MDENG%2FbPxRfiCYEXAMPLEKEY@my-bucket?region=us-east-1

# MinIO (local)
http://minioadmin:minioadmin@localhost:9000/my-bucket

# MinIO (with path style)
http://minioadmin:minioadmin@localhost:9000/my-bucket?forcePathStyle=true

# SQLite (persistent local)
sqlite:///tmp/s3db.sqlite

# Memory (testing)
memory://test-bucket/test-db

# Filesystem
file:///home/user/data/s3db
```

### SQLite Query Parameters

```javascript
// Enforce limits from URI options
sqlite:///tmp/s3db.sqlite?enforceLimits=true&maxObjectSize=5242880&maxMemoryMB=256
```

### URL Encoding

Special characters in credentials must be URL-encoded:

| Character | Encoded |
|-----------|---------|
| `/` | `%2F` |
| `+` | `%2B` |
| `=` | `%3D` |
| `@` | `%40` |

```javascript
// If secret key is "abc/123+xyz"
const encoded = encodeURIComponent('abc/123+xyz'); // abc%2F123%2Bxyz
const connStr = `s3://AKID:${encoded}@bucket?region=us-east-1`;
```

## Choosing a Client

```
┌─────────────────────────────────────────────────────────────┐
│                     What's your use case?                   │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ Testing │     │  Local  │     │Production│
        │         │     │   Dev   │     │         │
        └────┬────┘     └────┬────┘     └────┬────┘
             │               │               │
             ▼               ▼               ▼
      ┌────────────┐  ┌────────────┐  ┌────────────┐
      │MemoryClient│  │Filesystem  │  │ S3Client   │
      │            │  │  Client    │  │            │
      │ Zero deps  │  │ or MinIO   │  │ AWS/MinIO  │
      │ Super fast │  │            │  │ R2/Spaces  │
      └────────────┘  └────────────┘  └────────────┘
                         │
                         ▼
                     ┌────────────┐
                     │SqliteClient│
                     │Persistent  │
                     │Local Disk  │
                     └────────────┘
```

## Client Interface

All clients implement the same interface:

```typescript
interface StorageClient {
  // Object operations
  put(key: string, body: Buffer, metadata?: object): Promise<void>;
  get(key: string): Promise<{ body: Buffer, metadata: object }>;
  head(key: string): Promise<{ metadata: object }>;
  delete(key: string): Promise<void>;

  // Listing
  list(prefix: string): Promise<string[]>;

  // Batch operations
  batchGet(keys: string[]): Promise<object[]>;
  batchDelete(keys: string[]): Promise<void>;
}
```

This allows seamless switching between clients:

```javascript
// test.js - Use MemoryClient
const db = new Database({
  connectionString: 'memory://test/db'
});

// production.js - Use S3Client
const db = new Database({
  connectionString: process.env.S3_CONNECTION_STRING
});

// Same code works with both!
const users = await db.createResource({ ... });
await users.insert({ ... });
```

## Next Steps

- [S3Client](s3-client.md) - Full AWS S3 documentation
- [SqliteClient](sqlite-client.md) - SQLite persistence and limits
- [MemoryClient](memory-client.md) - Testing patterns
- [FilesystemClient](filesystem-client.md) - Local storage
- [Connection Strings](/reference/connection-strings.md) - Complete reference
