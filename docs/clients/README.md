# Storage Clients

s3db.js supports multiple storage backends through a unified client interface.

## Available Clients

| Client | Protocol | Use Case | Dependencies |
|--------|----------|----------|--------------|
| [S3Client](s3-client.md) | `s3://`, `http://`, `https://` | Production with AWS S3, MinIO, R2 | `@aws-sdk/client-s3` |
| [RemoteSqliteClient](sqlite-client.md) | `sqlite+d1://`, `sqlite+libsql://` | Cloudflare D1, Turso/libsql | Optional: `@libsql/client` |
| [SqliteClient](sqlite-client.md) | `sqlite://` | Local persistence, CI, single-process | None |
| [MemoryClient](memory-client.md) | `memory://` | Testing, development | None |
| [FilesystemClient](filesystem-client.md) | `file://` | Local development, edge cases | None |
| [RedDbClient](reddb-client.md) | `reddb://` | Multi-structure DB (tables, graphs, vectors) | None |

> Not sure which backend to use? See the [Choosing a Backend](/guides/choosing-a-backend.md) guide for pricing comparisons and decision flowcharts.

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

### Cloudflare D1 (RemoteSqliteClient)

Serverless SQLite at the edge via the Cloudflare D1 HTTP API. Scale-to-zero, zero egress, generous free tier.

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite+d1://ACCOUNT_ID/DATABASE_ID?apiToken=YOUR_TOKEN'
});
```

**Best for:**
- Read-heavy workloads with small-to-medium datasets (< 10 GB)
- Apps where egress costs matter (zero data transfer charges)
- Scale-to-zero deployments (no idle costs)

**Current limitation:** Uses the D1 REST API (adds ~50-200ms latency per operation). Native Worker bindings are parsed but not yet implemented.

See [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Choosing a Backend](/guides/choosing-a-backend.md) for cost comparisons.

### Turso / libsql (RemoteSqliteClient)

Remote SQLite with edge replicas. Works outside the Cloudflare ecosystem.

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite+libsql://my-db-my-org.turso.io?authToken=YOUR_TOKEN'
});
```

Requires `@libsql/client`:

```bash
pnpm add @libsql/client
```

**Best for:**
- Remote SQLite outside Cloudflare
- Edge replicas with embedded sync mode
- Low-latency reads globally

### SqliteClient (local)

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

# RedDB
reddb://localhost:8080
reddb://authToken@localhost:8080/prefix?collection=myCollection
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
                        What's your use case?
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                  ▼
       ┌─────────┐      ┌─────────┐        ┌─────────┐
       │ Testing │      │  Local  │        │Production│
       │         │      │   Dev   │        │         │
       └────┬────┘      └────┬────┘        └────┬────┘
            │                │                   │
            ▼                ▼              ┌────┴────────┐
     ┌────────────┐   ┌────────────┐       ▼             ▼
     │  Memory    │   │  SQLite or │  Data < 50GB?   Data > 50GB?
     │  Client    │   │   MinIO    │       │              │
     └────────────┘   └────────────┘  ┌────┴────┐   ┌────┴────┐
                                      │Read     │   │ S3 / R2 │
                                      │heavy?   │   │         │
                                      └────┬────┘   └─────────┘
                                 ┌─────────┴─────────┐
                                 ▼                   ▼
                           ┌──────────┐        ┌──────────┐
                           │  D1 or   │        │  S3 / R2 │
                           │  Turso   │        │          │
                           └──────────┘        └──────────┘
```

For detailed pricing comparisons and scenario analysis, see [Choosing a Backend](/guides/choosing-a-backend.md).

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

- [Choosing a Backend](/guides/choosing-a-backend.md) - Pricing comparison and decision guide
- [S3Client](s3-client.md) - Full AWS S3 documentation
- [SqliteClient](sqlite-client.md) - SQLite persistence and limits (local, D1, Turso)
- [MemoryClient](memory-client.md) - Testing patterns
- [FilesystemClient](filesystem-client.md) - Local storage
- [RedDbClient](reddb-client.md) - RedDB multi-structure database
- [Connection Strings](/reference/connection-strings.md) - Complete reference
