# MemoryClient - Ultra-Fast In-Memory Client

Pure in-memory S3-compatible client for blazing-fast tests and development. **100-1000x faster** than LocalStack with zero dependencies on Docker, LocalStack, or AWS.

## Features

✅ **100-1000x Faster** than LocalStack - All operations in memory
✅ **Zero Dependencies** - No Docker, MinIO, or AWS required
✅ **Full Compatibility** - Drop-in replacement for real S3 Client
✅ **Snapshot/Restore** - Perfect for test isolation
✅ **Optional Persistence** - Save/load state to disk
✅ **BackupPlugin Compatible** - Export/import JSONL format
✅ **Configurable Limits** - Simulate S3 limits (2KB metadata, etc)
✅ **Complete AWS SDK Support** - All commands implemented

## Quick Start

```javascript
import { S3db, MemoryClient } from 's3db.js';

// Create database with memory client
const db = new S3db({
  client: new MemoryClient()
});

await db.connect();

// Use normally - everything works in memory!
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    email: 'string|required|email'
  }
});

await users.insert({ id: 'u1', name: 'Alice', email: 'alice@test.com' });
const user = await users.get('u1');
```

## Usage

### Basic Usage

```javascript
import { S3db, MemoryClient } from 's3db.js';

const client = new MemoryClient({
  bucket: 'my-bucket',
  keyPrefix: 'databases/app',
  verbose: true
});

const db = new S3db({ client });
await db.connect();
```

### Test Helper

Use the built-in test helper for ultra-fast tests:

```javascript
import { createMemoryDatabaseForTest } from '../config.js';

describe('My Tests', () => {
  let database;

  beforeEach(async () => {
    // Creates isolated memory database
    database = createMemoryDatabaseForTest('my-test');
    await database.connect();
  });

  afterEach(async () => {
    await database.disconnect();
  });

  it('should work blazingly fast', async () => {
    const users = await database.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' }
    });

    await users.insert({ id: 'u1', name: 'Alice' });
    const user = await users.get('u1');

    expect(user.name).toBe('Alice');
  });
});
```

### Snapshot/Restore

Perfect for test isolation and state management:

```javascript
import { S3db, MemoryClient } from 's3db.js';

const client = new MemoryClient();
const db = new S3db({ client });
await db.connect();

// ... create resources and insert data ...

// Save current state
const snapshot = client.snapshot();

// Modify data
await users.update('u1', { name: 'Modified' });

// Restore original state
client.restore(snapshot);

// Data is back to original state!
```

### Persistence

Optionally persist memory state to disk for debugging:

```javascript
const client = new MemoryClient({
  persistPath: '/tmp/db-snapshot.json',
  autoPersist: true // Auto-save on changes
});

// Manual save/load
await client.saveToDisk();
await client.loadFromDisk();

// Or use custom path
await client.saveToDisk('/tmp/my-snapshot.json');
await client.loadFromDisk('/tmp/my-snapshot.json');
```

### BackupPlugin Compatibility

MemoryClient supports **two ways** to backup and restore data in BackupPlugin format:

#### Method 1: Direct MemoryClient Methods (Recommended for MemoryClient)

Use `exportBackup()` and `importBackup()` directly on the MemoryClient:

```javascript
import { S3db, MemoryClient } from 's3db.js';

const client = new MemoryClient();
const db = new S3db({ client });
await db.connect();

// Create some data
const users = await db.createResource({
  name: 'users',
  attributes: { id: 'string', name: 'string', email: 'string' }
});

await users.insert({ id: 'u1', name: 'Alice', email: 'alice@test.com' });
await users.insert({ id: 'u2', name: 'Bob', email: 'bob@test.com' });

// ✅ METHOD 1: Export using MemoryClient directly
await client.exportBackup('/tmp/backup', {
  compress: true,        // Use gzip compression (.jsonl.gz)
  database: db,          // Include resource schemas in s3db.json
  resources: ['users']   // Optional: filter specific resources
});

// Result:
// /tmp/backup/
//   ├── s3db.json        - Metadata with schemas and stats
//   └── users.jsonl.gz   - Compressed data (one JSON per line)

// ✅ METHOD 1: Import using MemoryClient directly
const importStats = await client.importBackup('/tmp/backup', {
  clear: true,           // Clear existing data first
  database: db,          // Recreate resources from schemas
  resources: ['users']   // Optional: import specific resources only
});

console.log(importStats);
// {
//   resourcesImported: 1,
//   recordsImported: 2,
//   errors: []
// }
```

#### Method 2: Using BackupPlugin (Works with MemoryClient AND S3Client)

Use the BackupPlugin for advanced features like scheduling, rotation, and multi-driver support:

```javascript
import { S3db, MemoryClient, BackupPlugin } from 's3db.js';

const client = new MemoryClient();
const db = new S3db({
  client,
  plugins: [
    new BackupPlugin({
      driver: 'filesystem',
      backupDir: '/tmp/backups',
      compress: true,
      schedule: '0 2 * * *',  // Daily at 2 AM
      retention: 7            // Keep 7 backups
    })
  ]
});

await db.connect();

// Create resources and data...
const users = await db.createResource({
  name: 'users',
  attributes: { id: 'string', name: 'string', email: 'string' }
});

await users.insert({ id: 'u1', name: 'Alice', email: 'alice@test.com' });

// ✅ METHOD 2: Backup using BackupPlugin
const backupPath = await db.plugins.backup.backup();
console.log(`Backup created: ${backupPath}`);
// Output: /tmp/backups/backup-2025-10-25T14-30-00-abc123/

// ✅ METHOD 2: Restore using BackupPlugin
await db.plugins.backup.restore(backupPath);
console.log('Database restored!');

// List all backups
const backups = await db.plugins.backup.listBackups();
console.log('Available backups:', backups);
```

**Comparison:**

| Feature | MemoryClient Direct | BackupPlugin |
|---------|-------------------|--------------|
| **Export/Import** | ✅ Manual control | ✅ Manual + Scheduled |
| **Compression** | ✅ Gzip | ✅ Gzip |
| **Resource Filtering** | ✅ Yes | ✅ Yes |
| **Scheduling** | ❌ No | ✅ Cron support |
| **Retention/Rotation** | ❌ No | ✅ Auto-cleanup |
| **Multi-Driver** | ❌ Filesystem only | ✅ S3 + Filesystem |
| **Works with S3Client** | ❌ No | ✅ Yes |
| **Simplicity** | ✅ Simpler API | ⚠️ More features |

**When to use each:**

- **Use MemoryClient Direct** when:
  - Working exclusively with MemoryClient
  - Need simple one-time exports/imports
  - Testing or development scenarios
  - Want minimal configuration

- **Use BackupPlugin** when:
  - Need scheduled backups
  - Want automatic retention/rotation
  - Need to backup to S3 or multiple locations
  - Working with real S3Client (production)
  - Need consistent backup strategy across environments

**BackupPlugin Format Details:**

Both methods create the **same directory structure**, ensuring full compatibility:

```
/backup-directory/
  ├── s3db.json           # Metadata file
  │   {
  │     "version": "1.0",
  │     "timestamp": "2025-10-25T...",
  │     "bucket": "my-bucket",
  │     "keyPrefix": "",
  │     "compressed": true,
  │     "resources": {
  │       "users": {
  │         "schema": {
  │           "attributes": {...},
  │           "partitions": {...},
  │           "behavior": "body-overflow"
  │         },
  │         "stats": {
  │           "recordCount": 2,
  │           "fileSize": 1024
  │         }
  │       }
  │     },
  │     "totalRecords": 2,
  │     "totalSize": 1024
  │   }
  │
  └── users.jsonl.gz      # Compressed JSON Lines (newline-delimited)
      {"id":"u1","name":"Alice","email":"alice@test.com"}
      {"id":"u2","name":"Bob","email":"bob@test.com"}
```

**Cross-Compatibility Examples:**

```javascript
// Example 1: Export with MemoryClient, Import with BackupPlugin
const memClient = new MemoryClient();
const memDb = new S3db({ client: memClient });
await memDb.connect();

// Create data in memory
const users = await memDb.createResource({
  name: 'users',
  attributes: { id: 'string', name: 'string' }
});
await users.insert({ id: 'u1', name: 'Alice' });

// Export using MemoryClient
await memClient.exportBackup('/tmp/backup');

// Import using BackupPlugin on a different database
const s3Db = new S3db({
  connectionString: 's3://...',
  plugins: [new BackupPlugin({ driver: 'filesystem' })]
});
await s3Db.connect();
await s3Db.plugins.backup.restore('/tmp/backup');
// ✅ Data now in S3!

// Example 2: Backup S3 with BackupPlugin, Test with MemoryClient
const prodDb = new S3db({
  connectionString: 's3://prod-bucket',
  plugins: [new BackupPlugin({ driver: 'filesystem', backupDir: '/backups' })]
});
await prodDb.connect();

// Create production backup
const backupPath = await prodDb.plugins.backup.backup();

// Load backup into MemoryClient for local testing
const testClient = new MemoryClient();
const testDb = new S3db({ client: testClient });
await testDb.connect();

await testClient.importBackup(backupPath, { database: testDb });
// ✅ Production data now in memory for testing!
```

**Use Cases:**
- **Migrate data** between MemoryClient and real S3
- **Share test fixtures** between projects and developers
- **Debug production data** locally without AWS access
- **Create portable snapshots** for CI/CD pipelines
- **Test with real data** in fast in-memory client
- **Disaster recovery** with automated backups
- **Analyze data** with BigQuery/Athena/Spark (JSONL format)

### Enforce S3 Limits

Validate that your code respects S3 limits:

```javascript
const client = new MemoryClient({
  enforceLimits: true,
  metadataLimit: 2048, // 2KB like S3
  maxObjectSize: 5 * 1024 * 1024 * 1024 // 5GB
});

// This will throw if metadata > 2KB
await resource.insert({ id: '1', largeMetadata: '...' });
// Error: Metadata size (3000 bytes) exceeds limit of 2048 bytes
```

### Storage Statistics

Get insights into memory usage:

```javascript
const stats = client.getStats();

console.log(stats);
// {
//   objectCount: 150,
//   totalSize: 1024000,
//   totalSizeFormatted: '1000 KB',
//   keys: ['key1', 'key2', ...],
//   bucket: 'my-bucket'
// }
```

## Configuration Options

```javascript
new MemoryClient({
  // Basic Configuration
  bucket: 'my-bucket',           // Bucket name (default: 's3db')
  keyPrefix: 'databases/app',    // Key prefix (default: '')
  region: 'us-east-1',           // Region (default: 'us-east-1')
  verbose: true,                 // Log operations (default: false)

  // Performance
  parallelism: 10,               // Parallel operations (default: 10)

  // Limits Enforcement
  enforceLimits: true,           // Enforce S3 limits (default: false)
  metadataLimit: 2048,           // Metadata limit in bytes (default: 2048)
  maxObjectSize: 5 * 1024 ** 3,  // Max object size (default: 5GB)

  // Persistence
  persistPath: '/tmp/db.json',   // Snapshot file path (default: none)
  autoPersist: true              // Auto-save on changes (default: false)
})
```

## API Reference

### Client Methods

#### Core Operations
- `putObject({ key, metadata, body, ... })` - Store object
- `getObject(key)` - Retrieve object
- `headObject(key)` - Get metadata only
- `copyObject({ from, to, ... })` - Copy object
- `deleteObject(key)` - Delete object
- `deleteObjects(keys)` - Batch delete
- `listObjects({ prefix, ... })` - List objects
- `exists(key)` - Check if exists

#### Snapshot/Restore
- `snapshot()` - Create state snapshot
- `restore(snapshot)` - Restore from snapshot

#### Persistence
- `saveToDisk(path?)` - Save to disk
- `loadFromDisk(path?)` - Load from disk
- `exportBackup(outputDir, options?)` - Export to BackupPlugin format
- `importBackup(backupDir, options?)` - Import from BackupPlugin format

#### Utilities
- `getStats()` - Get storage statistics
- `clear()` - Clear all objects

### Events

MemoryClient emits the same events as the real Client:

```javascript
client.on('command.request', (commandName, input) => {
  console.log(`Executing: ${commandName}`);
});

client.on('command.response', (commandName, response, input) => {
  console.log(`Completed: ${commandName}`);
});

client.on('putObject', (error, params) => {
  console.log('Object stored:', params.key);
});
```

## Performance

### Benchmark Results

Compared to LocalStack on a MacBook Pro M1:

| Operation | LocalStack | MemoryClient | Speedup |
|-----------|------------|--------------|---------|
| Insert 100 records | 2.5s | 0.01s | **250x** |
| Read 100 records | 1.8s | 0.005s | **360x** |
| List 1000 records | 3.2s | 0.002s | **1600x** |
| Full test suite (2600 tests) | ~90s | ~5s | **18x** |

### Memory Usage

- ~100 bytes per object (overhead)
- Actual data size (body + metadata)
- No external processes required

## Use Cases

### 1. Unit Tests
```javascript
// Super fast tests with isolation
describe('User Service', () => {
  let db;

  beforeEach(async () => {
    db = createMemoryDatabaseForTest('user-service');
    await db.connect();
  });

  it('should create user', async () => {
    // Test runs in milliseconds!
  });
});
```

### 2. Integration Tests with Snapshot
```javascript
it('should handle complex workflow', async () => {
  const db = createMemoryDatabaseForTest('workflow');
  await db.connect();

  // Setup initial state
  await setupTestData(db);

  // Save state
  const snapshot = db.client.snapshot();

  // Test scenario 1
  await testScenario1(db);
  db.client.restore(snapshot);

  // Test scenario 2 (fresh state)
  await testScenario2(db);
});
```

### 3. CI/CD Pipelines
```javascript
// No Docker required!
// Tests run 10-100x faster
// Perfect for GitHub Actions, GitLab CI, etc

// .github/workflows/test.yml
- name: Run Tests
  run: pnpm test
  # That's it! No LocalStack setup needed
```

### 4. Local Development
```javascript
import { S3db, MemoryClient } from 's3db.js';

// Instant startup, no waiting for Docker
const db = new S3db({
  client: new MemoryClient({ verbose: true })
});

// Iterate rapidly with hot reload
// See exactly what's happening with verbose logs
```

### 5. Demo/Prototype
```javascript
// Show off s3db.js features instantly
// No AWS credentials or infrastructure needed
// Perfect for workshops, tutorials, demos
```

### 6. Backup & Restore Production Data Locally

Export production S3 data and test locally with MemoryClient:

```javascript
// Step 1: Backup production database (run on server)
import { S3db, BackupPlugin } from 's3db.js';

const prodDb = new S3db({
  connectionString: process.env.PROD_S3_CONNECTION,
  plugins: [
    new BackupPlugin({
      driver: 'filesystem',
      backupDir: '/backups',
      compress: true
    })
  ]
});

await prodDb.connect();
const backupPath = await prodDb.plugins.backup.backup();
// Creates: /backups/backup-2025-10-25T14-30-00-abc123/

// Step 2: Download backup to local machine
// $ scp -r server:/backups/backup-2025-10-25T14-30-00-abc123/ ./local-backup/

// Step 3: Load into MemoryClient for local testing
import { S3db, MemoryClient } from 's3db.js';

const localClient = new MemoryClient();
const localDb = new S3db({ client: localClient });
await localDb.connect();

// Import production backup
await localClient.importBackup('./local-backup/backup-2025-10-25T14-30-00-abc123/', {
  database: localDb
});

// Now test against real production data locally!
const users = localDb.resources.users;
const user = await users.get('prod-user-id-123');
console.log('Testing with real production user:', user);

// Runs 100x faster than S3, no AWS costs, perfect for debugging!
```

### 7. Share Test Fixtures Between Teams

Create reusable test data for the entire team:

```javascript
// Create test fixture (run once by one developer)
import { S3db, MemoryClient } from 's3db.js';

const client = new MemoryClient();
const db = new S3db({ client });
await db.connect();

// Create comprehensive test data
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    email: 'string|required|email',
    role: 'string|required'
  }
});

const posts = await db.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    title: 'string|required',
    content: 'string|required'
  }
});

// Add test data
await users.insert({ id: 'admin', name: 'Admin User', email: 'admin@test.com', role: 'admin' });
await users.insert({ id: 'user1', name: 'John Doe', email: 'john@test.com', role: 'user' });
await posts.insert({ id: 'post1', userId: 'user1', title: 'First Post', content: 'Hello!' });

// Export fixture
await client.exportBackup('./fixtures/test-data-v1', {
  database: db,
  compress: true
});

// Commit to repo
// $ git add fixtures/test-data-v1
// $ git commit -m "Add test fixtures v1"

// Now any team member can use it:
// In any test file
const testClient = new MemoryClient();
const testDb = new S3db({ client: testClient });
await testDb.connect();

await testClient.importBackup('./fixtures/test-data-v1', {
  database: testDb
});

// All tests start with the same clean data!
const admin = await testDb.resources.users.get('admin');
expect(admin.role).toBe('admin');
```

### 8. Migrate Between Environments

Seamlessly move data between development, staging, and production:

```javascript
// Scenario: Migrate staging data to new production instance

// Step 1: Export from staging
import { S3db, BackupPlugin } from 's3db.js';

const stagingDb = new S3db({
  connectionString: 's3://staging-bucket',
  plugins: [new BackupPlugin({ driver: 'filesystem' })]
});
await stagingDb.connect();

const stagingBackup = await stagingDb.plugins.backup.backup();
// Output: /backups/staging-backup-2025-10-25.../

// Step 2: Test migration locally first (recommended!)
import { MemoryClient } from 's3db.js';

const testClient = new MemoryClient();
const testDb = new S3db({ client: testClient });
await testDb.connect();

await testClient.importBackup(stagingBackup, { database: testDb });

// Run validation scripts
const recordCount = testClient.getStats().objectCount;
console.log(`Testing ${recordCount} records...`);

// Verify data integrity
const users = testDb.resources.users;
const allUsers = await users.query({});
console.log(`Found ${allUsers.length} users`);

// Step 3: If tests pass, import to production
const prodDb = new S3db({
  connectionString: 's3://prod-bucket',
  plugins: [new BackupPlugin({ driver: 'filesystem' })]
});
await prodDb.connect();

await prodDb.plugins.backup.restore(stagingBackup);
console.log('✅ Migration complete!');
```

### 9. CI/CD with Real Test Data

Use production snapshots in CI without exposing credentials:

```javascript
// .github/workflows/test.yml
// - name: Download fixtures
//   run: |
//     curl -L https://fixtures.example.com/prod-snapshot.tar.gz | tar xz
//
// - name: Run tests
//   run: pnpm test

// In your test suite:
import { S3db, MemoryClient } from 's3db.js';

describe('Business Logic Tests', () => {
  let db;

  beforeAll(async () => {
    const client = new MemoryClient();
    db = new S3db({ client });
    await db.connect();

    // Load production snapshot (sanitized, of course!)
    await client.importBackup('./fixtures/prod-snapshot', {
      database: db
    });
  });

  it('should handle real-world user data', async () => {
    const users = db.resources.users;
    const activeUsers = await users.query({ status: 'active' });

    // Test against real production patterns
    expect(activeUsers.length).toBeGreaterThan(0);
  });

  it('should calculate metrics correctly', async () => {
    // Test business logic against production data distribution
    const orders = db.resources.orders;
    const totalRevenue = await calculateRevenue(orders);

    expect(totalRevenue).toBeGreaterThan(0);
  });
});
```

### 10. Cross-Format Data Analysis

Export for analysis in BigQuery, Athena, Spark:

```javascript
import { S3db, MemoryClient } from 's3db.js';

const client = new MemoryClient();
const db = new S3db({ client });
await db.connect();

// Load your data...
const users = await db.createResource({
  name: 'users',
  attributes: { id: 'string', name: 'string', signupDate: 'string' }
});

// ... populate data ...

// Export to JSONL for BigQuery
await client.exportBackup('/tmp/bigquery-import', {
  compress: false,  // BigQuery prefers uncompressed JSONL
  database: db
});

// Now load users.jsonl into BigQuery:
// $ bq load --source_format=NEWLINE_DELIMITED_JSON \
//     mydataset.users \
//     /tmp/bigquery-import/users.jsonl

// Or use with Athena, Spark, pandas, DuckDB, etc.
// The JSONL format is universally supported!
```

## Compatibility

MemoryClient implements the **complete** Client interface:

✅ All CRUD operations
✅ Metadata encoding/decoding
✅ All behaviors (body-overflow, body-only, etc)
✅ Partitions
✅ Timestamps
✅ Encryption (secret fields)
✅ Embeddings and special types
✅ Event emission
✅ Parallel operations

## Limitations

⚠️ **Not for Production** - Memory-only, data lost on restart
⚠️ **Single Process** - No multi-process synchronization
⚠️ **No Versioning** - S3 versioning not supported
⚠️ **No S3 Events** - No Lambda triggers, etc

Use MemoryClient for:
- ✅ Testing
- ✅ Development
- ✅ Prototyping
- ✅ CI/CD

Use Real S3 Client for:
- ✅ Production
- ✅ Multi-process apps
- ✅ Long-term persistence

## Migration Guide

### From LocalStack to MemoryClient

**Before:**
```javascript
import { S3db } from 's3db.js';

// Required: Docker, LocalStack running
const db = new S3db({
  connectionString: 'http://test:test@localhost:4566/bucket'
});
```

**After:**
```javascript
import { S3db, MemoryClient } from 's3db.js';

// Zero infrastructure!
const db = new S3db({
  client: new MemoryClient()
});
```

### From Real S3 to MemoryClient (for tests)

**Before:**
```javascript
import { S3db } from 's3db.js';

const db = new S3db({
  connectionString: process.env.BUCKET_CONNECTION_STRING
});
```

**After:**
```javascript
import { createMemoryDatabaseForTest } from './tests/config.js';

// Use helper
const db = createMemoryDatabaseForTest('my-test');
```

## Examples

See `tests/clients/memory-client.test.js` for comprehensive examples.

## Troubleshooting

### Memory Leaks in Tests

**Problem:** Tests accumulate memory over time.

**Solution:** Clear client after each test:

```javascript
afterEach(async () => {
  await database.disconnect();
  database.client.clear(); // Clear memory
});
```

### Snapshot Size Too Large

**Problem:** Snapshots are huge.

**Solution:** Only snapshot what you need:

```javascript
// Create fresh client for each test instead
beforeEach(() => {
  db = createMemoryDatabaseForTest('test');
});
```

### Tests Passing with MemoryClient but Failing with Real S3

**Problem:** Real S3 has limits that MemoryClient doesn't enforce by default.

**Solution:** Enable limit enforcement:

```javascript
const db = createMemoryDatabaseForTest('test', {
  enforceLimits: true // Catches metadata > 2KB errors
});
```

## Contributing

Found a bug? Have a feature request?

Open an issue at: https://github.com/forattini-dev/s3db.js/issues

## License

MIT - Same as s3db.js

---

**Made with ❤️ for the s3db.js community**

🚀 **Happy (fast) testing!**
