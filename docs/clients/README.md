# Storage Clients

s3db.js supports multiple storage backends through a unified client interface.

## Available Clients

| Client | Use Case | Performance | Dependencies |
|--------|----------|-------------|--------------|
| [S3Client](s3-client.md) | Production with AWS S3, MinIO, R2 | Standard | `@aws-sdk/client-s3` |
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

### Examples

```bash
# AWS S3
s3://AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI%2FK7MDENG%2FbPxRfiCYEXAMPLEKEY@my-bucket?region=us-east-1

# MinIO (local)
http://minioadmin:minioadmin@localhost:9000/my-bucket

# MinIO (with path style)
http://minioadmin:minioadmin@localhost:9000/my-bucket?forcePathStyle=true

# Memory (testing)
memory://test-bucket/test-db

# Filesystem
file:///home/user/data/s3db
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
- [MemoryClient](memory-client.md) - Testing patterns
- [FilesystemClient](filesystem-client.md) - Local storage
- [Connection Strings](/reference/connection-strings.md) - Complete reference
