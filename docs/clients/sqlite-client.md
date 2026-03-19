# SqliteClient

`SqliteClient` is an embedded SQLite backend with the same storage interface used by
`S3Client` and `MemoryClient`.

It is useful when you want local persistence with predictable query performance and no
external object storage service.

## Use Cases

- Local and CI integration tests that need persistence between steps
- Single-process services that need a durable local cache
- Data migration experiments before moving to S3
- Environments where file-based state is preferred over raw in-memory data

## Quick Start

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite:///tmp/s3db.sqlite'
});

await db.connect();
```

You can also pass a `SqliteClient` instance directly:

```javascript
import { SqliteClient, Database } from 's3db.js';

const client = new SqliteClient({
  basePath: '/tmp/s3db.sqlite',
  bucket: 'my-bucket'
});

const db = new Database({ client });
```

## Connection String Format

Use `sqlite://` with the file path.

```bash
# Absolute path
sqlite:///tmp/s3db.sqlite

# Relative path
sqlite://./data/s3db.sqlite

# In-memory database
sqlite:///:memory:
```

### URI Query Options

Query options become `SqliteClient` config fields:

```bash
sqlite:///tmp/s3db.sqlite?enforceLimits=true&maxObjectSize=5242880&maxMemoryMB=256
```

## Client Options

| Option | Type | Description |
|--------|------|-------------|
| `basePath` | string | Absolute or relative path to the SQLite DB file |
| `bucket` | string | Logical bucket name for compatibility (`s3db` by default) |
| `keyPrefix` | string | Optional global key prefix |
| `enforceLimits` | boolean | Validate metadata and object size before write |
| `metadataLimit` | number | Metadata limit in bytes when `enforceLimits` is true |
| `maxObjectSize` | number | Hard max object size in bytes |
| `maxMemoryMB` | number | Optional memory budget in MB for SQLite write/read safety |
| `logLevel` | string | Logger level (`info`, `debug`, `warn`, `error`) |

## Memory Safety and `maxMemoryMB`

`maxMemoryMB` caps the effective bucket payload size and prevents oversized writes that can
impact the current process. This is especially important when objects can grow unexpectedly.

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'sqlite:///tmp/s3db.sqlite?maxMemoryMB=128'
});
```

If an operation exceeds the limit, writes fail with:

- `SQLite memory budget exceeded`
- Code: `SqliteMemoryLimitExceeded`

Adjust by lowering payload size or increasing `maxMemoryMB`.

## Local Alternatives

- `MemoryClient`: fastest, but no durability
- `FileSystemClient`: file-based storage without SQLite query engine
- `S3Client`: cloud object storage for production workloads

## See Also

- [Connection Strings](/reference/connection-strings.md)
- [Clients Overview](/clients/README.md)
