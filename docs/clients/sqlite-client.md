# SqliteClient

`SqliteClient` is the embedded SQLite-backed storage client for s3db.js.

It gives you durable local persistence with the same object-storage interface used by
`S3Client`, `MemoryClient`, and `FilesystemClient`, but without external infrastructure.

For remote SQLite backends such as Turso/libsql and Cloudflare D1, s3db.js also supports
remote connection strings through `RemoteSqliteClient`.

## TLDR

- Use it for local development, CI, migration drills, and single-process services that need persistence.
- Use `sqlite+libsql://` or `sqlite+d1://` when the SQLite engine is remote.
- It is an object-store backend backed by SQLite, not a relational table-per-resource engine.
- Resource schema changes are handled by s3db metadata and stable schema registries, not by `ALTER TABLE` for each resource.
- It is optimized for local reads like `head`, `exists`, `list`, and metadata-heavy flows.
- Prefer `S3Client` for distributed production workloads and `MemoryClient` for maximum test speed.

## When To Use It

`SqliteClient` is a good fit when you want:

- Local persistence between process restarts
- Repeatable integration tests without external S3 infrastructure
- A durable cache or local state store in a single process
- Migration rehearsals before moving the same application to S3
- Predictable local latency for object-style storage

It is usually the wrong choice when you need:

- Multi-node or distributed coordination
- Shared storage across many processes or containers
- A relational query engine over resource fields
- Independent SQL tables per resource
- Horizontal scaling with strong cross-process metadata coordination

## How It Stores Data

`SqliteClient` stores s3db objects in a local SQLite file. Internally, there is a single
SQLite object table plus internal bookkeeping tables.

The important consequence is this:

- Your resources are still persisted as s3db objects
- `s3db.json` still owns resource definitions, versions, and schema registries
- SQLite does not create one SQL table per resource
- Changing resource attributes does not require per-resource DDL migrations

That means resource evolution works the same conceptual way it does on S3:

1. s3db persists resource metadata and schema registries
2. attribute mappings stay stable across schema changes
3. older objects can still be read after reconnects
4. new versions are recorded in metadata when definitions change

## Process Model

`SqliteClient` is designed first for local and single-process use.

SQLite itself supports concurrent access, but s3db metadata coordination for this client is
still local-first. Object writes are transactional, but `s3db.json` metadata should not be
treated as a distributed coordination mechanism between multiple independent processes.

Practical recommendation:

- Good: one service process, one SQLite file
- Good: CI job or integration test suite using its own SQLite file
- Risky: multiple independent services coordinating against the same SQLite file

## Quick Start

### Connection String

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite:///tmp/s3db.sqlite'
});

await db.connect();
```

### Explicit Client

```javascript
import { Database, SqliteClient } from 's3db.js';

const client = new SqliteClient({
  basePath: '/tmp/s3db.sqlite',
  bucket: 'my-bucket',
  maxObjectSize: 5 * 1024 * 1024,
  maxMemoryMB: 256
});

const db = new Database({ client });
await db.connect();
```

### In-Memory SQLite

This is useful when you want SQLite behavior without writing a file:

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite:///:memory:'
});

await db.connect();
```

## Connection String Format

Use `sqlite://` with a file path:

```bash
# Absolute path
sqlite:///tmp/s3db.sqlite

# Relative path
sqlite://./data/s3db.sqlite

# In-memory SQLite database
sqlite:///:memory:
```

URI query parameters map directly to `SqliteClient` config:

```bash
sqlite:///tmp/s3db.sqlite?enforceLimits=true&maxObjectSize=5242880&maxMemoryMB=256
```

## Remote SQLite Connection Strings

Remote SQLite uses explicit provider-qualified schemes so `sqlite://` can stay local-only.

### Turso / libsql

```bash
sqlite+libsql://my-db-my-org.turso.io?authToken=YOUR_TOKEN
```

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite+libsql://my-db-my-org.turso.io?authToken=YOUR_TOKEN'
});
```

`@libsql/client` is optional and must be installed by applications that use this scheme:

```bash
pnpm add @libsql/client
```

### Cloudflare D1

```bash
sqlite+d1://ACCOUNT_ID/DATABASE_ID?apiToken=YOUR_TOKEN
```

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite+d1://ACCOUNT_ID/DATABASE_ID?apiToken=YOUR_TOKEN'
});
```

The Node.js path currently uses the Cloudflare D1 HTTP API. A Worker binding-shaped
connection string such as `sqlite+d1://binding/DB` is parsed for future runtime support,
but is not usable from plain Node.js yet.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | `./s3db.sqlite` | SQLite database file path |
| `bucket` | `string` | `s3db` | Logical bucket namespace used by the client |
| `keyPrefix` | `string` | `''` | Prefix applied to every stored object key |
| `logLevel` | `string` | `info` | Logger level |
| `concurrency` | `number` | `5` | Batch operation concurrency for client task execution |
| `retries` | `number` | `3` | Retry count for task executor operations |
| `retryDelay` | `number` | `1000` | Retry delay in milliseconds |
| `timeout` | `number` | `30000` | Task executor timeout in milliseconds |
| `enforceLimits` | `boolean` | `false` | Enables metadata and object-size validation before writes |
| `metadataLimit` | `number` | `2048` | Metadata limit in bytes when `enforceLimits` is enabled |
| `maxObjectSize` | `number` | `5GB` | Maximum allowed object payload |
| `maxMemoryMB` | `number` | unset | Logical payload budget for the current bucket |

## Schema Changes and Attribute Evolution

A common misunderstanding is expecting SQLite-backed resources to create or migrate SQL tables
whenever attributes change. That is not how this client works.

With `SqliteClient`:

- resource definitions live in `s3db.json`
- stable attribute indices live in schema registries
- new attributes get new stable indices
- old objects stay readable after reconnect
- current resource version is advanced in metadata when the definition changes

Example:

```javascript
const db = new Database({
  connectionString: 'sqlite:///tmp/s3db.sqlite'
});

await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string',
    email: 'email'
  }
});

await users.insert({
  name: 'Ada',
  email: 'ada@example.com'
});

await db.disconnect();

const db2 = new Database({
  connectionString: 'sqlite:///tmp/s3db.sqlite'
});

await db2.connect();

const evolvedUsers = await db2.createResource({
  name: 'users',
  attributes: {
    name: 'string',
    email: 'email',
    age: 'number|optional'
  }
});
```

In this flow:

- the original data remains readable
- `name` and `email` keep stable attribute mapping
- `age` gets a new mapping
- the resource definition version advances in metadata

## Performance Characteristics

`SqliteClient` is optimized around the access patterns that matter most in local object storage:

- `headObject` and `exists` use metadata-only lookups
- `listObjects`, pagination, and prefix scans operate directly in SQLite
- payload budget checks use internal bucket stats instead of recalculating the entire bucket on every write
- `getObject` loads the BLOB only when the body is actually needed

This makes it especially good for:

- metadata-heavy test suites
- local API runs with many `exists/head/list` calls
- plugin behavior that creates lots of small or medium objects

It is still object storage, so if your workload depends on relational filtering across fields,
SQLite is not acting as a SQL query layer here.

## Payload Budget and `maxMemoryMB`

`maxMemoryMB` is a logical payload budget, not a literal measurement of SQLite engine memory.

What it does:

- tracks total stored payload for the current bucket
- rejects writes that would exceed the configured budget
- protects local environments from unbounded object growth

What it does not do:

- measure WAL size
- measure SQLite page cache usage
- measure process RSS
- account precisely for engine overhead or JSON metadata overhead

Example:

```javascript
const db = new Database({
  connectionString: 'sqlite:///tmp/s3db.sqlite?maxMemoryMB=128'
});
```

When the budget is exceeded, writes fail with:

- message: `SQLite memory budget exceeded`
- code: `SqliteMemoryLimitExceeded`

Use it as a local safety rail, not as a precise memory profiler.

## Limits and Validation

When `enforceLimits` is enabled, the client validates:

- metadata size against `metadataLimit`
- payload size against `maxObjectSize`

Example:

```javascript
const client = new SqliteClient({
  basePath: '/tmp/s3db.sqlite',
  enforceLimits: true,
  metadataLimit: 2048,
  maxObjectSize: 10 * 1024 * 1024
});
```

Typical failures:

- `Metadata limit exceeded in sqlite storage`
- `Object size exceeds in sqlite limit`

## Object Semantics

`SqliteClient` follows the same storage contract expected by s3db object persistence:

- `putObject` supports `ifMatch` and `ifNoneMatch`
- `copyObject` supports metadata merge and replace behavior
- `listObjects` supports prefix, delimiter, continuation token, and `startAfter`
- `deleteObjects` behaves like other local clients and reports missing keys as deleted

Current boundaries:

- cross-bucket copy is not supported
- this is not a versioned object store
- transaction boundaries protect local write correctness, not distributed coordination

## Testing Patterns

### Integration Test With Persistence

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite:///tmp/test-suite.sqlite',
  deferMetadataWrites: false
});

await db.connect();
```

### Per-Test Temporary Database

```javascript
import path from 'path';
import os from 'os';
import { Database } from 's3db.js';

const db = new Database({
  connectionString: `sqlite://${path.join(os.tmpdir(), 'case-123.sqlite')}`
});
```

### When To Prefer MemoryClient Instead

Prefer `MemoryClient` when:

- persistence is not required
- you want the fastest possible tests
- the suite creates and destroys many databases quickly

Prefer `SqliteClient` when:

- you need reconnect behavior
- you want local durability
- schema evolution across reconnects matters to the test

## Operational Notes

- Use one SQLite file per environment or test scope.
- Keep `deferMetadataWrites=false` when you want the most deterministic reconnect behavior in tests.
- Use `keyPrefix` to isolate logical datasets inside the same file.
- If large payloads are common, tune `maxObjectSize` and `maxMemoryMB` explicitly instead of relying on defaults.
- If your service is becoming multi-process or shared across hosts, move to `S3Client`.

## Troubleshooting

### `sqlite:// connection string requires a path`

Use one of:

- `sqlite:///absolute/path/file.sqlite`
- `sqlite://./relative/path/file.sqlite`
- `sqlite:///:memory:`

### `SQLite memory budget exceeded`

One of these is true:

- your bucket payload exceeded `maxMemoryMB`
- a single overwrite would push the bucket above the budget
- the configured budget is too low for the current test or local dataset

### Old data still reads after schema changes. Is that expected?

Yes. That is the intended behavior. Attribute evolution is driven by s3db schema metadata and
stable mappings, so old records remain readable while the current resource definition advances.

### Why do I not see one SQL table per resource?

Because `SqliteClient` is an embedded object-storage backend. SQLite is used as the durable
storage engine for s3db objects, not as a relational schema-per-resource layer.

## See Also

- [Clients Overview](/clients/README.md)
- [Connection Strings](/reference/connection-strings.md)
- [MemoryClient](/clients/memory-client.md)
- [FilesystemClient](/clients/filesystem-client.md)
