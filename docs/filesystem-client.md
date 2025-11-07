# FileSystemClient Documentation

The **FileSystemClient** converts your local filesystem into a fully fledged S3-compatible backend. It mirrors the behavior of the default `S3Client`, but stores every object under a directory you control. This is ideal for:

- Offline/local development without AWS credentials
- Deterministic integration tests that persist data across process restarts
- Desktop/CLI tools that need immediate access to the underlying files
- Debugging and inspection (metadata files are human-readable JSON)

## Quick Start

### Connection String

```javascript
import { S3db } from 's3db.js';

const db = new S3db({
  connectionString: 'file:///tmp/s3db/dev?compression.enabled=true&stats.enabled=true'
});

await db.connect();
```

### Manual Instantiation

```javascript
import { S3db, FileSystemClient } from 's3db.js';

const db = new S3db({
  client: new FileSystemClient({
    basePath: './.data/s3db-local',
    bucket: 'local-dev',
    keyPrefix: 'playground/',
    compression: { enabled: true, threshold: 256, level: 9 },
    ttl: { enabled: true, defaultTTL: 30 * 60 * 1000, cleanupInterval: 5 * 60 * 1000 },
    locking: { enabled: true, timeout: 10_000 },
    backup: { enabled: true, suffix: '.bak' },
    journal: { enabled: true, file: 'operations.log' },
    stats: { enabled: true }
  })
});

await db.connect();
```

## Directory Layout

- Each object is stored at `<basePath>/resource=<name>/id=<id>`
- Metadata lives alongside the data in `.meta.json` sidecar files
- Backups append the configured suffix (default `.bak`)
- Journals and stats files live at the top level

## Feature Matrix

| Feature | Description | Configuration |
|---------|-------------|----------------|
| Compression | Gzip large payloads before writing to disk | `compression.enabled`, `compression.threshold`, `compression.level` |
| TTL | Automatic deletion of expired objects via background job | `ttl.enabled`, `ttl.defaultTTL`, `ttl.cleanupInterval` |
| Locking | Prevent concurrent writes to the same key | `locking.enabled`, `locking.timeout` |
| Backup | Write `.bak` files before overwriting data | `backup.enabled`, `backup.suffix` |
| Journal | Append every mutation to an audit log | `journal.enabled`, `journal.file` |
| Stats | Track puts/gets/deletes, compression savings, feature flags | `stats.enabled` |

All of the options above can be provided either in `clientOptions` or through connection-string query parameters (e.g., `?compression.enabled=true`).

## Stats API

```javascript
const stats = db.client.getStats();
console.log(stats.puts, stats.gets, stats.features);
```

`stats` is `null` unless `stats.enabled` is true. When enabled, it contains:

- `puts`, `gets`, `deletes`, `errors`
- Compression accounting: `totalUncompressed`, `totalCompressed`, `compressionSaved`, `avgCompressionRatio`
- `features` flags indicating which enhancements are active

## Resetting State in Tests

```javascript
FileSystemClient.clearPathStorage('/tmp/s3db/dev'); // Removes files + stops cleanup jobs
FileSystemClient.clearAllStorage();                 // Nukes every registered basePath
```

Remember to disconnect databases in `afterEach`/`afterAll` so cron jobs and locks are released.

## Journals and Backups

- When `journal.enabled` is true, every mutation appends a JSON line to the configured file (default `operations.journal`).
- When `backup.enabled` is true, the previous version of a data file is copied to `<file>.bak` before overwriting.

These files are plain text/binary, so you can inspect or replay them as needed.

## TTL Cleanup

TTL operates at the storage level:

1. Each object gets an `expiresAt` timestamp (either from `ttl.defaultTTL` or the per-operation `ttl` option).
2. The cleanup interval walks the directory tree and deletes expired objects.
3. Reads also check `expiresAt` and treat stale records as missing.

## Tips

- Use `connectionString: 'file://./relative/path'` for project-specific sandbox folders.
- Combine with `MemoryClient` in different environments: memory for unit tests, filesystem for integration tests, S3 in production.
- Enable verbose mode (`verbose: true`) to log every `PUT/GET/DELETE` and cleanup event.

For further reference, see `tests/clients/filesystem-enhanced.test.js` for end-to-end examples covering every feature.

