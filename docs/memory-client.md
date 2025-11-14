# 💾 MemoryClient

> **Ultra-fast in-memory S3-compatible client for testing and development. 100-1000x faster than LocalStack.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-options) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**In-memory S3 client** for blazing-fast tests and development - **100-1000x faster** than LocalStack with **zero infrastructure**.

**1 line to get started:**
```javascript
const db = new Database({ client: new MemoryClient() });
```

**Key features:**
- ✅ **100-1000x Faster** than LocalStack - All operations in memory
- ✅ **Zero Infrastructure** - No Docker, MinIO, LocalStack, or AWS required
- ✅ **Full S3 API Compatibility** - Drop-in replacement for S3Client
- ✅ **Snapshot/Restore** - Perfect for test isolation and state management
- ✅ **Optional Persistence** - Save/load state to disk for debugging
- ✅ **Enforce S3 Limits** - Validate 2KB metadata limit compliance
- ✅ **BackupPlugin Compatible** - Import/export JSONL.gz format

**Performance comparison:**
```javascript
// ❌ Without MemoryClient: LocalStack tests
// - Requires Docker running (500MB+ RAM)
// - 2600 tests take ~90 seconds
// - Each insert/read: 25-50ms
// - CI/CD needs LocalStack setup

// ✅ With MemoryClient: In-memory tests
const db = new Database({ client: new MemoryClient() });
// - Zero dependencies
// - 2600 tests take ~5 seconds (18x faster!)
// - Each insert/read: <0.1ms (250-360x faster per operation)
// - CI/CD just works
```

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**NO Peer Dependencies!**

MemoryClient is **built into s3db.js core** with zero external dependencies!

**Why Zero Dependencies?**

- ✅ No Docker/LocalStack/MinIO setup required
- ✅ Works instantly in any environment (local, CI/CD, serverless)
- ✅ No version conflicts
- ✅ Smallest possible package size
- ✅ Perfect for testing and development

**What You Get:**

- **Full S3 API**: All operations (PutObject, GetObject, ListObjects, etc.)
- **Pure JavaScript**: Runs in Node.js 18+ (uses native Map/Set)
- **Cross-platform**: Works on Windows, macOS, Linux, CI/CD environments
- **No external processes**: Everything in-process for maximum speed

**Minimum Node.js Version:** 18.x (for native structuredClone)

---

## Features

✅ **100-1000x Faster** than LocalStack - All operations in memory
✅ **Zero Dependencies** - No Docker, MinIO, or AWS required
✅ **Full Compatibility** - Drop-in replacement for real S3 Client
✅ **Snapshot/Restore** - Perfect for test isolation
✅ **Optional Persistence** - Save/load state to disk
✅ **BackupPlugin Compatible** - Export/import JSONL format
✅ **Configurable Limits** - Simulate S3 limits (2KB metadata, etc)
✅ **Complete AWS SDK Support** - All commands implemented

---

## 📑 Table of Contents

- [TLDR](#-tldr)
- [Dependencies](#-dependencies)
- [Features](#features)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Basic Usage](#basic-usage)
  - [Test Helper](#test-helper)
  - [Snapshot/Restore](#snapshotrestore)
  - [Persistence](#persistence)
  - [BackupPlugin Compatibility](#backupplugin-compatibility)
  - [Enforce S3 Limits](#enforce-s3-limits)
  - [Storage Statistics](#storage-statistics)
- [Configuration Options](#configuration-options)
- [API Reference](#api-reference)
- [Performance](#performance)
- [Use Cases](#use-cases)
- [Compatibility](#compatibility)
- [Limitations](#limitations)
- [Migration Guide](#migration-guide)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [FAQ](#-faq)

---

## Quick Start

```javascript
import { Database, MemoryClient } from 's3db.js';

// Create database with memory client
const db = new Database({
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
import { Database, MemoryClient } from 's3db.js';

const client = new MemoryClient({
  bucket: 'my-bucket',
  keyPrefix: 'databases/app',
  verbose: true
});

const db = new Database({ client });
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
import { Database, MemoryClient } from 's3db.js';

const client = new MemoryClient();
const db = new Database({ client });
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
import { Database, MemoryClient } from 's3db.js';

const client = new MemoryClient();
const db = new Database({ client });
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
import { Database, MemoryClient, BackupPlugin } from 's3db.js';

const client = new MemoryClient();
const db = new Database({
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
const memDb = new Database({ client: memClient });
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
const s3Db = new Database({
  connectionString: 's3://...',
  plugins: [new BackupPlugin({ driver: 'filesystem' })]
});
await s3Db.connect();
await s3Db.plugins.backup.restore('/tmp/backup');
// ✅ Data now in S3!

// Example 2: Backup S3 with BackupPlugin, Test with MemoryClient
const prodDb = new Database({
  connectionString: 's3://prod-bucket',
  plugins: [new BackupPlugin({ driver: 'filesystem', backupDir: '/backups' })]
});
await prodDb.connect();

// Create production backup
const backupPath = await prodDb.plugins.backup.backup();

// Load backup into MemoryClient for local testing
const testClient = new MemoryClient();
const testDb = new Database({ client: testClient });
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
  parallelism: 100,              // Parallel operations (default: 100 - Separate OperationsPool per Database)

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
import { Database, MemoryClient } from 's3db.js';

// Instant startup, no waiting for Docker
const db = new Database({
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
import { Database, BackupPlugin } from 's3db.js';

const prodDb = new Database({
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
import { Database, MemoryClient } from 's3db.js';

const localClient = new MemoryClient();
const localDb = new Database({ client: localClient });
await localDb.connect();

// Import production backup
await localClient.importBackup('./local-backup/backup-2025-10-25T14-30-00-abc123/', {
  database: localDb
});

// Now test against real production data locally!
const users = await localDb.getResource('users');
const user = await users.get('prod-user-id-123');
console.log('Testing with real production user:', user);

// Runs 100x faster than S3, no AWS costs, perfect for debugging!
```

### 7. Share Test Fixtures Between Teams

Create reusable test data for the entire team:

```javascript
// Create test fixture (run once by one developer)
import { Database, MemoryClient } from 's3db.js';

const client = new MemoryClient();
const db = new Database({ client });
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
const testDb = new Database({ client: testClient });
await testDb.connect();

await testClient.importBackup('./fixtures/test-data-v1', {
  database: testDb
});

// All tests start with the same clean data!
const users = await testDb.getResource('users');
const admin = await users.get('admin');
expect(admin.role).toBe('admin');
```

### 8. Migrate Between Environments

Seamlessly move data between development, staging, and production:

```javascript
// Scenario: Migrate staging data to new production instance

// Step 1: Export from staging
import { Database, BackupPlugin } from 's3db.js';

const stagingDb = new Database({
  connectionString: 's3://staging-bucket',
  plugins: [new BackupPlugin({ driver: 'filesystem' })]
});
await stagingDb.connect();

const stagingBackup = await stagingDb.plugins.backup.backup();
// Output: /backups/staging-backup-2025-10-25.../

// Step 2: Test migration locally first (recommended!)
import { MemoryClient } from 's3db.js';

const testClient = new MemoryClient();
const testDb = new Database({ client: testClient });
await testDb.connect();

await testClient.importBackup(stagingBackup, { database: testDb });

// Run validation scripts
const recordCount = testClient.getStats().objectCount;
console.log(`Testing ${recordCount} records...`);

// Verify data integrity
const users = await testDb.getResource('users');
const allUsers = await users.query({});
console.log(`Found ${allUsers.length} users`);

// Step 3: If tests pass, import to production
const prodDb = new Database({
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
import { Database, MemoryClient } from 's3db.js';

describe('Business Logic Tests', () => {
  let db;

  beforeAll(async () => {
    const client = new MemoryClient();
    db = new Database({ client });
    await db.connect();

    // Load production snapshot (sanitized, of course!)
    await client.importBackup('./fixtures/prod-snapshot', {
      database: db
    });
  });

  it('should handle real-world user data', async () => {
    const users = await db.getResource('users');
    const activeUsers = await users.query({ status: 'active' });

    // Test against real production patterns
    expect(activeUsers.length).toBeGreaterThan(0);
  });

  it('should calculate metrics correctly', async () => {
    // Test business logic against production data distribution
    const orders = await db.getResource('orders');
    const totalRevenue = await calculateRevenue(orders);

    expect(totalRevenue).toBeGreaterThan(0);
  });
});
```

### 10. Cross-Format Data Analysis

Export for analysis in BigQuery, Athena, Spark:

```javascript
import { Database, MemoryClient } from 's3db.js';

const client = new MemoryClient();
const db = new Database({ client });
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
import { Database } from 's3db.js';

// Required: Docker, LocalStack running
const db = new Database({
  connectionString: 'http://test:test@localhost:4566/bucket'
});
```

**After:**
```javascript
import { Database, MemoryClient } from 's3db.js';

// Zero infrastructure!
const db = new Database({
  client: new MemoryClient()
});
```

### From Real S3 to MemoryClient (for tests)

**Before:**
```javascript
import { Database } from 's3db.js';

const db = new Database({
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

## ❓ FAQ

### General

**Q: What is MemoryClient and when should I use it?**

A: MemoryClient is an in-memory S3-compatible client built into s3db.js for **testing and development only**. It stores all data in RAM instead of actual S3, making it 100-1000x faster than LocalStack or real S3. Use it for:
- Unit tests (fast, isolated, zero infrastructure)
- Integration tests (no Docker/LocalStack required)
- CI/CD pipelines (faster builds, no external dependencies)
- Local development (rapid prototyping without AWS costs)
- Debugging (inspect state with snapshots)

**Never use it in production** - data is lost when process exits.

```javascript
// Perfect for tests
import { Database, MemoryClient } from 's3db.js';

const db = new Database({ client: new MemoryClient() });
await db.connect();
// Now test at lightning speed!
```

---

**Q: How much faster is MemoryClient compared to LocalStack?**

A: **18-250x faster** in real-world testing:

**LocalStack Performance:**
- 2600 test suite: ~90 seconds
- Single insert: 25-50ms
- Single read: 20-40ms
- Requires Docker (500MB+ RAM)

**MemoryClient Performance:**
- 2600 test suite: ~5 seconds (18x faster!)
- Single insert: <0.1ms (250-500x faster)
- Single read: <0.05ms (400-800x faster)
- Zero infrastructure

The speedup comes from:
- No network overhead (in-process)
- No Docker/container overhead
- No disk I/O (pure memory)
- No serialization/deserialization delays

---

**Q: Can I use MemoryClient in production?**

A: **No, never!** MemoryClient is designed for testing only. Here's why:

❌ **Data loss**: All data stored in RAM, lost on process restart
❌ **No persistence**: No backup, no recovery
❌ **Single process**: No multi-process/cluster synchronization
❌ **Memory limits**: Large datasets exhaust RAM
❌ **No S3 features**: No versioning, events, Lambda triggers

For production, use:
- **AWS S3** (scalable, durable, enterprise-grade)
- **MinIO** (self-hosted S3-compatible, on-premises)
- **DigitalOcean Spaces** (cost-effective, managed)
- **Cloudflare R2** (zero egress fees)

```javascript
// ✅ Production
const db = new Database({
  connectionString: 's3://key:secret@my-bucket?region=us-east-1'
});

// ❌ Production (data loss!)
const db = new Database({ client: new MemoryClient() });
```

---

**Q: Does MemoryClient require any external dependencies?**

A: **No!** MemoryClient is built into s3db.js core with zero external dependencies. It uses only Node.js built-ins:
- `Map` and `Set` for storage
- `structuredClone` for snapshots
- `fs/promises` for optional disk persistence

No Docker, no LocalStack, no AWS SDK, no MinIO. Just install s3db.js and you're ready:

```bash
pnpm install s3db.js
```

```javascript
import { Database, MemoryClient } from 's3db.js';
// Works immediately!
```

---

**Q: How do I migrate from LocalStack to MemoryClient?**

A: Simple! Just replace the connection string with `MemoryClient`:

**Before (LocalStack):**
```javascript
import { Database } from 's3db.js';

// Requires Docker, LocalStack running on port 4566
const db = new Database({
  connectionString: 'http://test:test@localhost:4566/my-bucket'
});
```

**After (MemoryClient):**
```javascript
import { Database, MemoryClient } from 's3db.js';

// Zero infrastructure!
const db = new Database({
  client: new MemoryClient()
});
```

**Benefits:**
- 🚀 18-250x faster tests
- 🔥 No Docker setup
- 💰 Zero infrastructure costs
- ⚡ Instant CI/CD (no container startup time)

---

**Q: Can I use the `memory://` connection string instead of `new MemoryClient()`?**

A: **Yes!** s3db.js supports the `memory://` connection string for convenience:

```javascript
import { Database } from 's3db.js';

// Connection string (auto-creates MemoryClient)
const db = new Database({
  connectionString: 'memory://my-bucket/databases/myapp'
});

// Equivalent to:
const db = new Database({
  client: new MemoryClient({
    bucket: 'my-bucket',
    keyPrefix: 'databases/myapp/'
  })
});
```

The connection string format is:
```
memory://<bucket>/<keyPrefix>
```

Use connection strings when you want simple configuration. Use `new MemoryClient()` when you need advanced options like `enforceLimits`, `persistPath`, or `debug`.

---

### Snapshot and Restore

**Q: How do snapshots work and when should I use them?**

A: Snapshots create a deep clone of MemoryClient's state (all keys, metadata, bodies) for later restoration. Use them for:
- Test isolation (reset to clean state between tests)
- Debugging (capture state at failure point)
- A/B testing (compare behavior with different data)

**Example:**
```javascript
const db = new Database({ client: new MemoryClient() });
await db.connect();

// Create test data
const users = await db.createResource({ name: 'users', attributes: { name: 'string' } });
await users.insert({ name: 'Alice' });

// Save state
const snapshot = db.client.snapshot();

// Modify data
await users.insert({ name: 'Bob' });
await users.insert({ name: 'Charlie' });

// Restore to original state (only Alice exists)
db.client.restore(snapshot);

const list = await users.list();
console.log(list.length); // 1 (only Alice)
```

**Performance:** Snapshots use `structuredClone()` - fast for small datasets (<100MB), but slow for large datasets. For large data, use `clear()` + re-populate instead.

---

**Q: Can I persist snapshots to disk for debugging?**

A: **Yes!** Use the `persistPath` option:

```javascript
import { Database, MemoryClient } from 's3db.js';

const db = new Database({
  client: new MemoryClient({
    persistPath: '/tmp/memory-client-debug.json',
    autoPersist: true // Auto-save on every write
  })
});

await db.connect();

// All writes automatically saved to disk
const users = await db.createResource({ name: 'users', attributes: { name: 'string' } });
await users.insert({ name: 'Alice' }); // Saved to disk

// On next run, data is restored:
const db2 = new Database({
  client: new MemoryClient({
    persistPath: '/tmp/memory-client-debug.json'
  })
});

await db2.connect();
const users2 = await db2.getResource('users');
console.log(await users2.list()); // Alice is still there!
```

**Warning:** Persistence adds disk I/O overhead. Only use for debugging, not in CI/CD.

---

**Q: What's the difference between `snapshot()` and `persistPath`?**

A: Different use cases:

| Feature | `snapshot()` | `persistPath` |
|---------|--------------|---------------|
| **Purpose** | Test isolation | Debugging persistence |
| **Storage** | In-memory | On disk |
| **Speed** | Fast (μs) | Slow (ms, disk I/O) |
| **Trigger** | Manual | Auto or manual |
| **Use Case** | Reset state between tests | Inspect state across runs |

**Example - `snapshot()` for test isolation:**
```javascript
describe('User tests', () => {
  let snapshot;

  beforeEach(() => {
    snapshot = db.client.snapshot(); // Save state
  });

  afterEach(() => {
    db.client.restore(snapshot); // Reset state
  });

  it('creates user', async () => {
    await users.insert({ name: 'Alice' });
    // Test passes, state reset after
  });
});
```

**Example - `persistPath` for debugging:**
```javascript
// Run 1: Populate data
const db = new Database({
  client: new MemoryClient({ persistPath: '/tmp/debug.json' })
});
await users.insert({ name: 'Alice' });

// Run 2: Inspect data (process restarted)
const db2 = new Database({
  client: new MemoryClient({ persistPath: '/tmp/debug.json' })
});
console.log(await users.list()); // Alice still exists!
```

---

### Testing Best Practices

**Q: Should I use snapshots or `clear()` between tests?**

A: **It depends on test size:**

**Small tests (<100 records):** Use `snapshot()` for speed
```javascript
beforeEach(() => {
  snapshot = db.client.snapshot();
});

afterEach(() => {
  db.client.restore(snapshot);
});
```

**Large tests (>100 records):** Use `clear()` to avoid memory overhead
```javascript
afterEach(async () => {
  await db.disconnect();
  db.client.clear(); // Instant, no cloning
});
```

**Benchmark:**
- `snapshot()` + `restore()`: O(n) time, O(n) memory (clones all data)
- `clear()`: O(1) time, O(1) memory (just resets Map)

---

**Q: How do I create a reusable test helper with MemoryClient?**

A: Create a factory function:

```javascript
// tests/helpers/db.js
import { Database, MemoryClient } from 's3db.js';

export function createTestDatabase(testName, options = {}) {
  return new Database({
    client: new MemoryClient({
      bucket: `test-${testName}`,
      enforceLimits: options.enforceLimits ?? true, // Catch 2KB errors
      debug: options.debug ?? false
    })
  });
}

// Usage in tests
import { createTestDatabase } from './helpers/db.js';

describe('User CRUD', () => {
  let db;

  beforeEach(async () => {
    db = createTestDatabase('user-crud');
    await db.connect();
  });

  afterEach(async () => {
    await db.disconnect();
    db.client.clear();
  });

  it('creates user', async () => {
    const users = await db.createResource({ /* ... */ });
    await users.insert({ name: 'Alice' });
    // Fast, isolated, zero infrastructure!
  });
});
```

---

**Q: My tests pass with MemoryClient but fail with real S3. Why?**

A: MemoryClient doesn't enforce S3 limits by default. Enable strict mode:

```javascript
const db = new Database({
  client: new MemoryClient({
    enforceLimits: true // Enforce 2KB metadata limit
  })
});
```

Common issues:
1. **Metadata > 2KB**: MemoryClient allows unlimited metadata by default. Enable `enforceLimits: true` to catch this early.
2. **Eventually consistency**: Real S3 has eventual consistency (rare); MemoryClient is always consistent.
3. **Rate limits**: Real S3 throttles high-frequency requests; MemoryClient has no limits.

**Best practice:** Always test with `enforceLimits: true` in CI/CD to catch production issues early.

---

**Q: How do I test with different behaviors (body-overflow, body-only, etc.)?**

A: MemoryClient supports all behaviors automatically:

```javascript
const db = new Database({ client: new MemoryClient({ enforceLimits: true }) });
await db.connect();

// Test body-overflow behavior (auto overflow to body)
const users = await db.createResource({
  name: 'users',
  behavior: 'body-overflow',
  attributes: { name: 'string', bio: 'string' }
});

await users.insert({
  name: 'Alice',
  bio: 'A'.repeat(3000) // > 2KB, automatically overflows to body
});

// Test body-only behavior (always use body)
const posts = await db.createResource({
  name: 'posts',
  behavior: 'body-only',
  attributes: { title: 'string', content: 'string' }
});

// Test enforce-limits behavior (strict 2KB limit)
const settings = await db.createResource({
  name: 'settings',
  behavior: 'enforce-limits',
  attributes: { key: 'string', value: 'string' }
});

await settings.insert({ key: 'theme', value: 'dark' }); // OK
await settings.insert({ key: 'config', value: 'X'.repeat(3000) }); // Throws error!
```

---

### Performance and Memory

**Q: How much memory does MemoryClient use?**

A: Memory usage = (metadata size + body size) × number of records:

**Example calculation:**
```javascript
// 1000 users, each:
// - Metadata: ~500 bytes (id, timestamps, etc.)
// - Body: ~2KB (name, email, profile)
// Total: ~2.5KB per record

// 1000 records × 2.5KB = 2.5MB RAM
```

**Large datasets:**
- 10,000 records: ~25MB RAM (fast)
- 100,000 records: ~250MB RAM (ok for CI/CD)
- 1,000,000 records: ~2.5GB RAM (slow snapshots, use `clear()` instead)

**Memory leak prevention:**
```javascript
afterEach(async () => {
  await db.disconnect();
  db.client.clear(); // Free memory immediately
});
```

---

**Q: Can I use MemoryClient for benchmarking s3db.js performance?**

A: **Yes, but carefully!** MemoryClient is useful for **relative benchmarks** (comparing algorithms, query strategies), but not **absolute benchmarks** (real S3 latency).

**Good use case - Compare query strategies:**
```javascript
const db = new Database({ client: new MemoryClient() });

// Benchmark: Full scan vs partition query
console.time('Full scan');
await users.query({ status: 'active' }); // Scans all records
console.timeEnd('Full scan'); // ~10ms for 10k records

console.time('Partition query');
await users.queryFromPartition('byStatus', { status: 'active' }); // O(1) lookup
console.timeEnd('Partition query'); // ~0.5ms (20x faster!)
```

**Bad use case - Absolute latency:**
```javascript
// ❌ Don't benchmark MemoryClient insert latency
console.time('Insert 1000 records');
for (let i = 0; i < 1000; i++) {
  await users.insert({ name: `User ${i}` });
}
console.timeEnd('Insert 1000 records'); // ~50ms (unrealistic!)

// Real S3: ~5000ms (100x slower due to network)
```

---

**Q: Does MemoryClient support parallel operations?**

A: **Yes!** MemoryClient is thread-safe for concurrent operations:

```javascript
const db = new Database({ client: new MemoryClient() });
await db.connect();

const users = await db.createResource({ name: 'users', attributes: { name: 'string' } });

// Parallel inserts (all succeed)
await Promise.all([
  users.insert({ name: 'Alice' }),
  users.insert({ name: 'Bob' }),
  users.insert({ name: 'Charlie' }),
  users.insert({ name: 'Diana' })
]); // ~0.2ms total (vs 0.8ms sequential)

// Parallel reads (all succeed)
const ids = ['id1', 'id2', 'id3'];
const results = await Promise.all(
  ids.map(id => users.get(id))
); // Instant!
```

**Note:** MemoryClient is single-process only. For multi-process apps, use real S3 with locking.

---

### BackupPlugin Integration

**Q: Can I use MemoryClient with BackupPlugin?**

A: **Yes!** MemoryClient implements the full Client interface, including BackupPlugin compatibility:

```javascript
import { Database, MemoryClient, BackupPlugin } from 's3db.js';

const db = new Database({ client: new MemoryClient() });
await db.usePlugin(new BackupPlugin());
await db.connect();

// Populate data
const users = await db.createResource({ name: 'users', attributes: { name: 'string' } });
await users.insert({ name: 'Alice' });

// Export to JSONL.gz (same format as S3)
await db.client.exportBackup('/tmp/backup', {
  compress: true,
  database: db
});

// Import from backup
await db.client.importBackup('/tmp/backup/users.jsonl.gz', {
  database: db,
  resourceName: 'users'
});
```

**Use cases:**
- **Test data seeding**: Export production-like data, import into tests
- **Snapshot testing**: Export state, compare with expected JSONL
- **Data migration**: Test migration scripts without hitting real S3

---

**Q: How do I import production data into MemoryClient for testing?**

A: Use BackupPlugin to export from production, then import into MemoryClient:

**Step 1: Export production data**
```javascript
// Production S3
const prodDb = new Database({
  connectionString: 's3://key:secret@prod-bucket?region=us-east-1'
});
await prodDb.usePlugin(new BackupPlugin());
await prodDb.connect();

// Export to JSONL.gz
await prodDb.exportBackup('/tmp/prod-backup');
```

**Step 2: Import into MemoryClient for testing**
```javascript
// Test suite
const testDb = new Database({ client: new MemoryClient() });
await testDb.usePlugin(new BackupPlugin());
await testDb.connect();

// Import production data
await testDb.importBackup('/tmp/prod-backup/users.jsonl.gz', {
  database: testDb,
  resourceName: 'users'
});

// Now test with real production data!
const users = await testDb.getResource('users');
console.log(await users.list()); // Production data in memory
```

---

### Advanced Usage

**Q: Can I use MemoryClient with encryption (secret fields)?**

A: **Yes!** MemoryClient supports all field types, including `secret` (AES-256-GCM encryption):

```javascript
const db = new Database({
  client: new MemoryClient(),
  encryptionKey: 'your-32-character-secret-key!!' // Required for secret fields
});

await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    password: 'secret|required' // Encrypted in memory
  }
});

await users.insert({
  email: 'alice@example.com',
  password: 'super-secret-password'
});

// Password is encrypted in MemoryClient's internal storage
const user = await users.get(id);
console.log(user.password); // 'super-secret-password' (auto-decrypted)
```

**Note:** Encryption is in-memory only. If you use `persistPath`, the JSON file will contain encrypted values.

---

**Q: Can I inspect MemoryClient's internal state for debugging?**

A: **Yes!** Use `getStorageStats()` and manual inspection:

```javascript
const db = new Database({ client: new MemoryClient({ debug: true }) });
await db.connect();

const users = await db.createResource({ name: 'users', attributes: { name: 'string' } });
await users.insert({ name: 'Alice' });

// Get storage statistics
const stats = db.client.getStorageStats();
console.log(stats);
/*
{
  totalKeys: 3,
  totalSize: 1247,
  breakdown: {
    metadata: { count: 1, size: 523 },
    resource: { count: 1, size: 412 },
    body: { count: 1, size: 312 }
  }
}
*/

// Inspect raw storage (for debugging)
console.log(db.client._store); // Map of all keys
console.log(db.client._metadata); // Map of metadata
console.log(db.client._bodies); // Map of bodies
```

**Warning:** `_store`, `_metadata`, and `_bodies` are internal APIs. Only use for debugging, not production code.

---

**Q: Can I use MemoryClient with partitions?**

A: **Yes!** MemoryClient supports all partition features:

```javascript
const db = new Database({ client: new MemoryClient() });
await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    region: 'string|required',
    status: 'string|required'
  },
  partitions: {
    byRegion: { fields: { region: 'string' } },
    byStatus: { fields: { status: 'string' } }
  }
});

// Insert with partitions
await users.insert({ name: 'Alice', region: 'US', status: 'active' });

// Query from partition (O(1) lookup)
const usUsers = await users.listPartition('byRegion', { region: 'US' });
const activeUsers = await users.listPartition('byStatus', { status: 'active' });
```

Partitions work identically to real S3, making MemoryClient perfect for testing partition logic.

---

### Troubleshooting

**Q: Why am I getting "structuredClone is not defined" errors?**

A: `structuredClone()` was added in Node.js 17. Upgrade to Node.js 18+:

```bash
node --version # Must be >= 18.0.0
```

If you're stuck on Node.js 16, use the polyfill:

```javascript
// Add to test setup
import { Database, MemoryClient } from 's3db.js';

// Polyfill for Node.js 16
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}
```

**Better solution:** Upgrade to Node.js 18+ (required for native fetch, Web Streams, etc.).

---

**Q: My tests are running out of memory. What should I do?**

A: Reduce memory usage:

1. **Clear after each test:**
```javascript
afterEach(async () => {
  await db.disconnect();
  db.client.clear(); // Free memory
});
```

2. **Avoid snapshots for large datasets:**
```javascript
// ❌ Slow (clones 10k records)
const snapshot = db.client.snapshot();

// ✅ Fast (just reset Map)
db.client.clear();
```

3. **Use smaller test datasets:**
```javascript
// ❌ Tests with 10k records
for (let i = 0; i < 10000; i++) {
  await users.insert({ name: `User ${i}` });
}

// ✅ Tests with 100 records (same behavior)
for (let i = 0; i < 100; i++) {
  await users.insert({ name: `User ${i}` });
}
```

4. **Run tests sequentially (not parallel):**
```bash
# Parallel (high memory)
pnpm test --maxWorkers=4

# Sequential (low memory)
pnpm test --maxWorkers=1
```

---

**Q: Can I mock S3 errors with MemoryClient?**

A: **Not directly**, but you can extend MemoryClient:

```javascript
import { MemoryClient } from 's3db.js';

class MockS3ErrorClient extends MemoryClient {
  constructor(options = {}) {
    super(options);
    this.shouldFailNext = false;
  }

  async getObject(bucket, key) {
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      const error = new Error('NoSuchKey');
      error.Code = 'NoSuchKey';
      throw error;
    }
    return super.getObject(bucket, key);
  }
}

// Usage in tests
const db = new Database({ client: new MockS3ErrorClient() });
await db.connect();

const users = await db.getResource('users');

// Trigger error on next get()
db.client.shouldFailNext = true;
await users.get('non-existent-id'); // Throws NoSuchKey error
```

---

**Q: How do I test connection string parsing with MemoryClient?**

A: Use the `memory://` connection string:

```javascript
import { Database } from 's3db.js';

// Test different connection string formats
const tests = [
  'memory://test-bucket',
  'memory://test-bucket/prefix',
  'memory://test-bucket/path/to/db'
];

for (const connectionString of tests) {
  const db = new Database({ connectionString });
  await db.connect();

  console.log('Bucket:', db.client.bucket);
  console.log('Prefix:', db.client.keyPrefix);

  await db.disconnect();
}
```

---

## Contributing

Found a bug? Have a feature request?

Open an issue at: https://github.com/forattini-dev/s3db.js/issues

## License

MIT - Same as s3db.js

---

**Made with ❤️ for the s3db.js community**

🚀 **Happy (fast) testing!**
