<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

AI guidance for working with s3db.js codebase.

## Lazy Loading Architecture (v14.1.6+)

**CRITICAL:** All plugin peer dependencies use lazy loading to prevent "module not found" errors.

**Commenting policy:** Do not add inline comments throughout code. If written documentation is required, use JSDoc blocks placed right before the relevant class, function, method, or constant.

### Why Lazy Loading?

Before v14.1.6, importing s3db.js loaded ALL plugins and their dependencies (AWS SDK, GCP SDK, Azure SDK, puppeteer, etc.), causing errors if users hadn't installed them. Now dependencies are loaded only when used.

### Implementation Pattern

**❌ OLD (static imports - causes build warnings):**
```javascript
import { AwsInventoryDriver } from './drivers/aws-driver.js';
export { AwsInventoryDriver };
```

**✅ NEW (lazy loading):**
```javascript
const DRIVER_LOADERS = {
  aws: () => import('./drivers/aws-driver.js').then(m => m.AwsInventoryDriver)
};

export async function loadDriver(name) {
  const loader = DRIVER_LOADERS[name];
  const DriverClass = await loader();
  return new DriverClass(options);
}
```

### Files Using Lazy Loading

| File | Pattern Used |
|------|--------------|
| `src/plugins/index.js` | Lazy plugin loaders (`lazyLoadPlugin()`) |
| `src/plugins/replicators/index.js` | Lazy replicator loaders (`createReplicator()` is async) |
| `src/plugins/consumers/index.js` | Lazy consumer loaders (`createConsumer()` is async) |
| `src/plugins/cloud-inventory/index.js` | Lazy cloud driver loaders (`loadCloudDriver()`) |
| `src/plugins/cloud-inventory/registry.js` | Async `createCloudDriver()` with fallback to lazy loading |

### Rollup External Dependencies

**ALL peer dependencies MUST be marked as `external` in `rollup.config.js`** to prevent bundling and avoid "Unresolved dependencies" warnings.

When adding a new plugin with external dependencies:
1. Add package to `peerDependencies` in `package.json`
2. Add package to `peerDependenciesMeta` with `optional: true`
3. **Add package to `external` array in `rollup.config.js`**
4. Use lazy loading pattern in plugin index file

Example peer dependency categories in rollup.config.js:
```javascript
external: [
  // Core (bundled)
  '@aws-sdk/client-s3',
  'fastest-validator',

  // AWS SDK (peer)
  '@aws-sdk/client-ec2',
  '@aws-sdk/client-lambda',

  // GCP (peer)
  '@google-cloud/compute',
  '@google-cloud/bigquery',

  // Azure (peer)
  '@azure/identity',
  '@azure/arm-compute',

  // Other clouds (peer)
  '@vultr/vultr-node',
  '@linode/api-v4',
  'digitalocean-js',
  'hcloud-js',
  'oci-common',

  // Other plugins (peer)
  'hono',
  'puppeteer',
  'pg',
  '@tensorflow/tfjs-node',
]
```

### Testing Without Peer Dependencies

Core functionality must work without ANY peer dependencies installed:

```bash
cd /tmp && mkdir test-s3db && cd test-s3db
cat > test.js << 'EOF'
import { Database } from '/path/to/s3db.js/src/database.class.js';
const db = new Database({ connectionString: 'memory://test/db' });
await db.connect();
await db.createResource({ name: 'users', attributes: { name: 'string' } });
console.log('✅ Core works without peer dependencies!');
EOF
node test.js
```

## Validation Engine

**s3db uses [fastest-validator](https://github.com/icebob/fastest-validator)** for all schema validation - a blazing-fast, comprehensive validation library.

**Key Points:**
- All `attributes` schemas follow fastest-validator syntax
- **Magic auto-detect**: Nested objects are automatically detected - no `$$type` needed! ✨
- Three formats (in order of preference):
  1. **Magic** (99% of cases): `profile: { bio: 'string', avatar: 'url' }` - Auto-detected!
  2. **$$type** (validation control): `{ $$type: 'object|required', ...fields }` - When you need required/optional
  3. **Explicit** (advanced): `{ type: 'object', props: {...} }` - Full control (strict mode, etc.)
- Full docs: `/home/cyber/Work/tetis/s3db.js/docs/fastest-validator.md`

## Core Reference

### Classes & Methods

| Term | Location | Usage | Notes |
|------|----------|-------|-------|
| `Database` | `src/database.class.js` | `new Database({ bucketName, region })` | Main entry |
| `Resource` | `src/resource.class.js` | `await db.createResource({ name, attributes })` | Data collection |
| `insert()` | `resource.class.js:717` | `await resource.insert({ name: 'John' })` | Create |
| `update()` | `resource.class.js:884` | `await resource.update(id, { name: 'Jane' })` | GET+PUT merge |
| `patch()` | `resource.class.js:1282` | `await resource.patch(id, { name: 'Jane' })` | HEAD+COPY (40-60% faster) |
| `replace()` | `resource.class.js:1432` | `await resource.replace(id, fullData)` | PUT only (30-40% faster) |
| `get()` | `resource.class.js:1144` | `await resource.get(id)` | Fetch |
| `list()` | `resource.class.js:1384` | `await resource.list({ limit: 100 })` | Fetch multiple |
| `query()` | `resource.class.js:1616` | `await resource.query({ status: 'active' })` | Filter |

### Behaviors (2KB Metadata)

| Behavior | Use Case |
|----------|----------|
| `body-overflow` | Default, auto overflow to body |
| `body-only` | Large data (>2KB) |
| `truncate-data` | Accept data loss for speed |
| `enforce-limits` | Production, strict validation |
| `user-managed` | Custom handling via events |

### Incremental IDs

Auto-incrementing ID generation using distributed sequences with locking.

**Basic Usage:**
```javascript
// Sequential IDs: 1, 2, 3...
idGenerator: 'incremental'

// Start from custom value: 1000, 1001...
idGenerator: 'incremental:1000'

// Custom increment: 100, 110, 120...
idGenerator: { type: 'incremental', start: 100, increment: 10 }

// Prefixed IDs: ORD-0001, ORD-0002...
idGenerator: 'incremental:ORD-0001'

// Fast mode (batch reservation, ~1ms/ID):
idGenerator: 'incremental:fast'
idGenerator: { type: 'incremental', mode: 'fast', batchSize: 500 }
```

**Utility Methods:**
| Method | Purpose |
|--------|---------|
| `getSequenceValue(field)` | Peek next value without incrementing |
| `resetSequence(field, value)` | Reset sequence (use with caution) |
| `listSequences()` | List all sequences for resource |
| `reserveIdBatch(count)` | Reserve batch (fast mode) |
| `getBatchStatus(field)` | Get local batch status |

**Performance:**
| Mode | Latency | Use Case |
|------|---------|----------|
| Standard | ~20-50ms/ID | Order numbers, invoices |
| Fast | ~1ms/ID | Bulk imports, high-traffic |

**Files:** `src/concerns/incremental-sequence.js`, `docs/examples/e51-incremental-ids.js`

**Internal Architecture (Concurrency):**

The incremental ID system uses distributed locking via S3 preconditions to ensure uniqueness:

```
Resource.insert()
    │
    ▼
IncrementalSequence.next()
    │
    ├─► Standard: PluginStorage.nextSequence() per ID
    │       └─► withLock() → acquireLock() → read/increment → releaseLock()
    │
    └─► Fast: Check local batch, reserve new if exhausted
            └─► reserveBatch() → PluginStorage.nextSequence(batchSize)
```

**Lock Mechanism** (`distributed-lock.js`):
- Uses `ifNoneMatch: '*'` S3 precondition for atomic lock acquisition
- If object exists → 412 PreconditionFailed → retry with exponential backoff
- TTL on locks prevents deadlocks if process crashes
- Token-based release ensures only owner can release
- Shared by `PluginStorage` and `SequenceStorage` via composition

**Concurrency Guarantees:**
1. **Uniqueness**: Distributed lock ensures only one process increments at a time
2. **Atomicity**: S3 `ifNoneMatch` is atomic (no check-then-write race)
3. **Fault Tolerance**: Lock TTL auto-expires stale locks
4. **Contention Handling**: Exponential backoff + jitter reduces thundering herd

**Storage Structure (resource-scoped, NOT plugin-scoped):**
```
resource={resourceName}/
└── sequence={fieldName}/
    ├── value   (current sequence value: { value: N, name, createdAt, ... })
    └── lock    (distributed lock with TTL)
```

**Fast Mode Trade-offs:**
| Aspect | Standard | Fast |
|--------|----------|------|
| Contiguous IDs | Always | Within batch |
| ID Gaps | Never | Possible (crashed process) |
| Use Case | Orders, Invoices | Logs, Analytics, Bulk |

### Field Types

| Type | Example | Notes |
|------|---------|-------|
| `string` | `name: 'string\|required'` | Basic string |
| `number` | `age: 'number\|min:0'` | Integer/float |
| `secret` | `password: 'secret\|required'` | AES-256-GCM encrypted |
| `embedding:N` | `vector: 'embedding:1536'` | 77% compression |
| `ip4` | `ip: 'ip4'` | 47% compression |
| `ip6` | `ip: 'ip6'` | 44% compression |
| `array` | `tags: 'array\|items:string'` | Arrays |
| `object` | `profile: { bio: 'string', avatar: 'url' }` (auto-detect! ✨) | Nested objects - just write them naturally! |

### Partitioning

| Function | Location | Usage |
|----------|----------|-------|
| Config | Resource options | `partitions: { byRegion: { fields: { region: 'string' } } }` |
| `getFromPartition()` | `resource.class.js:2297` | Get from specific partition |
| `listPartition()` | `resource.class.js:1419` | List partition records |
| `findOrphanedPartitions()` | `resource.class.js:550` | Detect missing field refs |
| `removeOrphanedPartitions()` | `resource.class.js:596` | Clean up broken partitions |

**Orphaned Partitions**: When partition references deleted field → blocks ALL operations. Fix:
```javascript
const resource = await db.getResource('users', { strictValidation: false });
resource.removeOrphanedPartitions();
await db.uploadMetadataFile();
```

### Plugins

| Plugin | Purpose |
|--------|---------|
| `ApiPlugin` | REST API with guards, protected fields, OpenAPI docs |
| `TTLPlugin` | Auto-cleanup expired records (O(1) partition-based) |
| `CachePlugin` | Cache reads (memory/S3/filesystem) |
| `AuditPlugin` | Track all changes |
| `ReplicatorPlugin` | Sync to PostgreSQL/BigQuery/SQS |
| `MetricsPlugin` | Performance monitoring |
| `CostsPlugin` | AWS cost tracking |
| `EventualConsistencyPlugin` | Eventually consistent counters |

### API Plugin Configuration

Resources can define API-specific configuration under the `api` attribute in `$schema`:

```javascript
await database.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',
    apiToken: 'secret|optional',
    ip: 'ip4|optional'
  },
  api: {
    description: 'User management endpoints',
    protected: ['ip', 'metadata.internal'],  // Fields filtered from API responses
    guard: {
      list: async (c, ctx) => {
        if (!ctx.user) throw new Error('Auth required');
        if (ctx.user.role === 'admin') return true;
        return { userId: ctx.user.id };  // Filter by ownership
      },
      get: async (c, ctx) => { /* ... */ },
      create: async (c, ctx) => true,
      update: async (c, ctx) => { /* ... */ },
      delete: async (c, ctx) => { /* ... */ }
    }
  }
});
```

**API Config Options:**

| Option | Type | Description |
|--------|------|-------------|
| `description` | `string` | OpenAPI documentation description |
| `protected` | `string[]` | Fields to filter from responses (supports dot notation) |
| `guard` | `object` | Row-level security guards per operation |

**Guard Return Values:**
- `true` - Allow operation
- `false` / `throw Error` - Deny operation
- `{ field: value }` - Apply filter to list operations (partition-based O(1) lookup)

**Protected Fields:**
- Supports dot notation: `['ip', 'metadata.internal', 'audit.createdBy']`
- Filters from all API responses (GET, LIST, POST, PUT, PATCH)
- Does NOT affect direct Resource access (only API layer)

**TTL v2 Architecture**: Uses plugin storage with partition on `expiresAtCohort` for O(1) cleanup. Auto-detects granularity (minute/hour/day/week) and runs multiple intervals. Zero full scans.

**Performance**: Use `patch()` for metadata-only behaviors (`enforce-limits`, `truncate-data`) in plugin internal resources for 40-60% faster updates.

**BigQuery Mutability Modes** (`src/plugins/replicators/bigquery-replicator.class.js`):
- `append-only` (default): Updates/deletes → inserts with `_operation_type`, `_operation_timestamp`. No streaming buffer issues.
- `mutable`: Traditional UPDATE/DELETE with retry logic (90-minute streaming buffer window)
- `immutable`: Full audit trail with `_operation_type`, `_operation_timestamp`, `_is_deleted`, `_version`
- Configure globally or per-resource: `{ mutability: 'append-only' }`

### Global Coordinator Service

**Location**: `src/plugins/concerns/global-coordinator-service.class.js`

**Philosophy**: All plugins use shared `GlobalCoordinatorService` for leader election. No per-plugin mode, no fallbacks - just one elegant way.

**Key Features**:
- Lazy instantiation: One coordinator per namespace, cached on Database
- Atomic heartbeat with configurable interval (default: 5s) and jitter (0-1s)
- Deterministic leader election: Lexicographically first worker ID
- Event-driven plugin subscriptions with leader change notifications
- Automatic worker timeout detection and cleanup
- Single heartbeat loop replaces N independent loops (10× fewer API calls)

**Performance Impact**:
- **API Calls**: 7,200/hour → 720/hour (10× reduction for 10 plugins)
- **Monthly Cost**: $0.35 → $0.04 (90% savings)
- **Startup Convergence**: 15-25s → 3-4s (75% faster)
- **Code Complexity**: Reduced 46% (939 → 503 lines in CoordinatorPlugin)

**Quick Start**:
```javascript
// All plugins automatically use global coordination
const queuePlugin = new S3QueuePlugin({
  resource: 'emails',
  enableCoordinator: true,              // Enable coordination
  heartbeatInterval: 5000,              // Shared heartbeat interval
  leaseTimeout: 15000,                  // Leader lease TTL
  workerTimeout: 20000,                 // Worker discovery timeout
  // ... rest of config
});

const ttlPlugin = new TTLPlugin({
  resource: 'cache_entries',
  enableCoordinator: true,
  // ... config
});

await database.usePlugin(queuePlugin, 'queue');
await database.usePlugin(ttlPlugin, 'ttl');

// Both share ONE coordinator service in 'default' namespace
const coordinator = await database.getGlobalCoordinator('default');
const metrics = coordinator.getMetrics();
console.log('Single heartbeat:', metrics.heartbeatCount);  // Both plugins share this
```

**Configuration**:
```javascript
{
  enableCoordinator: true,              // Enable/disable coordination
  startupJitterMin: 0,                  // Min startup delay (ms)
  startupJitterMax: 5000,               // Max startup delay (0-5s random)
  coldStartDuration: 0,                 // Worker discovery period (ms)
  coordinatorWorkInterval: null,        // Work frequency (ms), null = disabled

  // GlobalCoordinatorService parameters (used by all plugins in namespace)
  heartbeatInterval: 5000,              // Heartbeat frequency (ms)
  heartbeatJitter: 1000,                // Random jitter per beat (ms)
  leaseTimeout: 15000,                  // Leader lease duration (ms)
  workerTimeout: 20000                  // Worker registration TTL (ms)
}
```

**Plugin Integration**:
All plugins extending `CoordinatorPlugin` automatically get:
- `S3QueuePlugin` ✅ Global coordination included
- `SchedulerPlugin` ✅ Global coordination included
- `TTLPlugin` ✅ Global coordination included
- `EventualConsistencyPlugin` ✅ Global coordination included

No code changes needed - plugins just implement:
```javascript
class MyPlugin extends CoordinatorPlugin {
  async onBecomeCoordinator() { /* ... */ }
  async onStopBeingCoordinator() { /* ... */ }
  async coordinatorWork() { /* ... */ }
}
```

**Storage Structure** (follows plugin= convention):
```
plugin=coordinator/<namespace>/
  state.json                          # Leader lease and epoch
  workers/<workerId>.json             # Worker heartbeat registration
  metadata.json                       # Service metadata
```

**Accessing the Coordinator**:
```javascript
const coordinator = await database.getGlobalCoordinator('default');

// Check status
console.log('Running:', coordinator.isRunning);
console.log('Leader:', await coordinator.getLeader());
console.log('Workers:', await coordinator.getActiveWorkers());

// Monitor metrics
const metrics = coordinator.getMetrics();
console.log('Heartbeats:', metrics.heartbeatCount);  // Should increase steadily
console.log('Elections:', metrics.electionCount);    // Should be low
console.log('Leader changes:', metrics.leaderChanges); // Should be rare

// Listen for leadership changes
coordinator.on('leader:changed', ({ previousLeader, newLeader, epoch }) => {
  console.log(`Leader: ${previousLeader} → ${newLeader} (epoch: ${epoch})`);
});
```

**Startup Jitter (Thundering Herd Prevention)**:
Random delay before coordination starts prevents all pods hitting S3 simultaneously:
```javascript
// Example: 100 workers starting with 5s jitter
// They spread startup load over 5 seconds instead of all at once
const jitterMs = startupJitterMin + Math.random() * (startupJitterMax - startupJitterMin);
```

**Namespace Isolation**:
```javascript
// Different namespaces = independent coordinators
const prodCoordinator = await database.getGlobalCoordinator('production');
const stagingCoordinator = await database.getGlobalCoordinator('staging');

// Each namespace has own leader election
console.log('Prod:', await prodCoordinator.getLeader());
console.log('Staging:', await stagingCoordinator.getLeader());
```

**Design Benefits**:
1. **One way to coordinate** - No options, no fallbacks
2. **Simpler code** - CoordinatorPlugin is thin wrapper (503 lines)
3. **Better performance** - Shared heartbeat = 10× fewer API calls
4. **Event-driven** - No polling, reactive to leader changes
5. **Single source of truth** - All plugins agree on leadership

**Debugging**:
- Enable verbose logs: `logLevel: 'debug'` in plugin config
- Check coordinator metrics via `coordinator.getMetrics()`
- Monitor S3 storage: `plugin=coordinator/<namespace>/`
- See [Coordinator Design](docs/architecture/COORDINATOR-DESIGN.md) for detailed guide

**Documentation**:
- [Design Guide](docs/architecture/COORDINATOR-DESIGN.md) - Architecture & rationale
- [Troubleshooting](docs/troubleshooting/global-coordinator.md) - Common issues
- [Migration Guide](docs/migration-guides/global-coordinator-mode.md) - Implementation steps
- [Example](docs/examples/e100-global-coordinator-multi-plugin.js) - Working code

### Utilities

| Function | Location | Purpose |
|----------|----------|---------|
| `tryFn()` | `src/concerns/try-fn.js` | `[ok, err, data]` error handling |
| `calculateTotalSize()` | `src/concerns/calculator.js:125` | UTF-8 byte count |
| `encrypt()/decrypt()` | `src/concerns/crypto.js` | AES-256-GCM |
| `mapAwsError()` | `src/errors.js:190` | AWS error translator |
| `idGenerator()` | `src/concerns/id.js` | nanoid (22 chars) |
| `requirePluginDependency()` | `src/plugins/concerns/plugin-dependencies.js` | Validate plugin deps |
| `DistributedLock` | `src/concerns/distributed-lock.js` | S3-based distributed locking |
| `DistributedSequence` | `src/concerns/distributed-sequence.js` | S3-based atomic sequences |

### Distributed Lock & Sequence

Shared primitives for distributed coordination using S3 conditional writes.

**DistributedLock** (`src/concerns/distributed-lock.js`):
```javascript
import { DistributedLock } from './distributed-lock.js';

const lock = new DistributedLock(storage, {
  keyGenerator: (name) => `locks/${name}`
});

// Acquire and release manually
const handle = await lock.acquire('my-resource', { ttl: 30, timeout: 5000 });
try {
  // Critical section
} finally {
  await lock.release(handle);
}

// Or use withLock helper
const result = await lock.withLock('my-resource', { ttl: 30 }, async () => {
  return await doWork();
});
```

**DistributedSequence** (`src/concerns/distributed-sequence.js`):
```javascript
import { DistributedSequence, createSequence } from './distributed-sequence.js';

// Resource-scoped sequence
const seq = createSequence(storage, { resourceName: 'orders' });

const nextId = await seq.next('id', { initialValue: 1000 });  // Returns 1000, stores 1001
const current = await seq.get('id');                          // Returns 1001
await seq.reset('id', 5000);                                  // Resets to 5000
```

**Exported Helpers:**
| Function | Purpose |
|----------|---------|
| `computeBackoff(attempt, base, max)` | Exponential backoff with jitter |
| `sleep(ms)` | Promise-based delay |
| `isPreconditionFailure(err)` | Check if error is 412 PreconditionFailed |

### Streams

| Class | File | Purpose |
|-------|------|---------|
| `ResourceReader` | `src/stream/resource-reader.class.js` | Read as stream |
| `ResourceWriter` | `src/stream/resource-writer.class.js` | Write via stream |
| `ResourceIdsReader` | `src/stream/resource-ids-reader.class.js` | Stream IDs only |

## Critical Concepts

### S3 Metadata Limit (2KB)
- **Problem**: S3 metadata max 2047 bytes
- **Solution**: Behaviors handle overflow automatically
- **Calculation**: `src/concerns/calculator.js` - precise UTF-8 byte counting

### Self-Healing JSON
**Location**: `database.class.js::_attemptJsonRecovery()`
- Fixes JSON parsing errors (trailing commas, missing quotes)
- Validates metadata structure
- Heals resources (invalid version refs, null hooks)
- Creates timestamped backups

### Partitioning Architecture
**Key Structure**: `resource=users/partition=byRegion/region=US/id=user123`
- Field-consistent ordering (alphabetical)
- O(1) lookups vs O(n) scans
- Async indexing: `asyncPartitions: true` (70-100% faster writes)
- Auto-migration when partition fields change

### Update Methods Comparison

| Method | Requests | Merge | Speed | Use Case |
|--------|----------|-------|-------|----------|
| `update()` | GET+PUT (2) | Yes | Baseline | Default |
| `patch()` | HEAD+COPY (2)* | Yes | 40-60% faster* | Partial updates |
| `replace()` | PUT (1) | No | 30-40% faster | Full replacement |

\* patch() uses HEAD+COPY only for metadata-only behaviors with simple fields. Falls back to update() for body behaviors.

**Method Selection**:
```javascript
// Default - merges data
await resource.update(id, { status: 'active' });

// Performance - 40-60% faster for metadata-only behaviors
await resource.patch(id, { loginCount: 5 });

// Maximum speed - 30-40% faster, no merge
await resource.replace(id, completeObject);
```

**Known Limitation**: Both `update()` and `patch()` lose sibling fields with dot notation (e.g., `{ 'profile.bio': 'New' }`). Workaround: update entire nested object.

### Plugin System
**Base**: `src/plugins/plugin.class.js`
**Methods**: Method wrapping, middleware (`next()`), hooks (pre/post)

**Plugin Dependencies** (`src/plugins/concerns/plugin-dependencies.js`):
- Runtime validation for external packages
- Keeps core package lightweight (~500KB)
- Auto-validates on plugin `initialize()`

**Resource Tracking**: `createdBy` field tracks origin ('user' vs plugin name)
- CachePlugin auto-skips plugin-created resources
- Prevents caching transient plugin data

### Advanced Encoding
**Optimizations** (`src/schema.class.js`, `src/concerns/`):
- ISO timestamps → Unix Base62 (67% savings)
- UUIDs → Binary Base64 (33% savings)
- Dictionary encoding for common values (95% savings)
- IPv4/IPv6 → Binary Base64 (44-47% savings)
- Vector embeddings → Fixed-point Base62 (77% savings)

**Dictionary**: 34 common values → single bytes (`active`, `true`, `GET`, etc.)

### Encryption
- **Algorithm**: AES-256-GCM with PBKDF2
- **Location**: `src/concerns/crypto.js`
- 100k iterations, random salt+IV, Base64 encoding
- Automatic for `secret` field types

### Error Handling
```javascript
const [ok, err, data] = await tryFn(async () => resource.insert(data));
if (!ok) {
  const mapped = mapAwsError(err, { bucket, key }); // Actionable suggestions
}
```

## Patterns

### Resource Creation
```javascript
await database.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',
    vector: 'embedding:1536',
    ip: 'ip4'
  },
  behavior: 'body-overflow',
  timestamps: true,
  asyncPartitions: true,
  partitions: { byRegion: { fields: { region: 'string' } } }
})
```

### Connection Strings
```
s3://KEY:SECRET@bucket?region=us-east-1           # AWS S3
http://KEY:SECRET@localhost:9000/bucket           # MinIO
memory://mybucket/databases/myapp                 # MemoryClient (testing)
```

### Caching
```javascript
new CachePlugin({
  driver: 'memory',
  ttl: 1800000,
  config: {
    maxMemoryPercent: 0.1, // 10% of system memory
    enableCompression: true
  }
})
```

## Commands

```bash
# Development
pnpm install && pnpm run build

# Testing
pnpm test                   # All tests
pnpm test:js                # JavaScript only
pnpm test:plugins           # Plugin tests (May require S3-compatible backend)
pnpm run test:coverage      # Enforces ≥90% global coverage and generates reports

# Plugin Log Levels (Tests & Dev)
- Use `logLevel: 'silent'` when instantiating plugins in tests to suppress logs,
  or `logLevel: 'debug'` when debugging. The base `Plugin` normalizes options via
  `normalizePluginOptions`, defaulting to 'info' level.

# CLI
s3db list                           # List resources
s3db query <resource>               # Query records
s3db insert <resource> -d '<json>'  # Insert
```

## File Locations

### Tests & Examples
- **Tests**: `tests/` (Jest ESM, LocalStack)
- **Testing Guide**: `docs/testing.md` (S3-compatible setup, coverage policy)
- **Examples**: `docs/examples/eXX-description.js`
  - `e01-e07`: Basic CRUD
  - `e08-e17`: Advanced features
  - `e18-e33`: Plugins
  - `e41-e43`: Vectors/RAG
  - `e44`: Orphaned partitions recovery
  - `e50`: patch/replace/update comparison

### Client Implementations
- **S3Client**: `src/clients/s3-client.class.js` (Production - AWS S3, MinIO, LocalStack)
- **MemoryClient**: `src/clients/memory-client.class.js` (Testing - 100-1000x faster, zero dependencies)
  - Pure in-memory implementation
  - Connection string: `memory://bucket/path` (recommended)
  - Manual config: `new MemoryClient({ bucket, keyPrefix })`
  - Snapshot/restore for test isolation
  - Optional persistence to disk
  - Full S3 API compatibility
  - Use for: tests, development, CI/CD (not production)

### Key Files
- **Calculator**: `src/concerns/calculator.js` (UTF-8 byte counting)
- **Crypto**: `src/concerns/crypto.js` (AES-256-GCM)
- **IP Encoding**: `src/concerns/ip.js` (IPv4/IPv6)
- **Base62**: `src/concerns/base62.js` (number/vector compression)
- **Errors**: `src/errors.js` (custom error classes)
- **Plugin Storage**: `src/concerns/plugin-storage.js` (HEAD+COPY optimizations)
- **Distributed Lock**: `src/concerns/distributed-lock.js` (shared locking primitives)
- **Distributed Sequence**: `src/concerns/distributed-sequence.js` (shared sequence primitives)
- **API Routes**: `src/plugins/api/routes/resource-routes.js` (guards, protected fields)
- **Response Formatter**: `src/plugins/api/utils/response-formatter.js` (field filtering)

## MCP Server

**Location**: `mcp/entrypoint.js`

**Transports**:
- **stdio** (default): `node mcp/entrypoint.js` - For local integration (Claude Desktop, etc.)
- **Streamable HTTP**: `node mcp/entrypoint.js --transport=http` - For remote access
  - URL: `http://0.0.0.0:17500/mcp`
  - Health: `http://0.0.0.0:17500/health`
  - Custom port/host: `--port=3000 --host=localhost`

**Features**:
- 41+ tools available (dbConnect, resourceInsert, query, etc.)
- Documentation search: `s3dbQueryDocs(query)`, `s3dbListTopics()`
- CORS enabled for browser clients
- Stateless mode (no session management)

## CLI Binaries

**Build**: `pnpm run build:binaries` → `bin/standalone/`
- Linux/macOS/Windows executables (~40-50MB)
- Includes all dependencies (AWS SDK, CLI tools)
- CommonJS compatible (`server-standalone.js`)

## Constraints

### S3 Limitations
- 2KB metadata → use behaviors
- No transactions → eventual consistency
- No indexes → use partitions
- Rate limits → batching + backoff

### Security
- Hook deserialization uses `Function` constructor (not eval)
- Field-level encryption for `secret` types
- Paranoid mode prevents destructive deletes
- Credentials need URL encoding in connection strings

---

## Plugin Documentation Standard

**All plugin documentation follows a standardized format.** For complete specification and requirements, see:

- **[📋 Plugin Documentation Standard](./docs/plugin-docs-standard.md)** - Complete specification with 12 required sections, quality checklist, and organization guidelines
- **[📝 Full Template](./docs/templates/plugin-doc-template.md)** - Comprehensive template for complex plugins (5+ features, 2000+ lines)
- **[📝 Minimal Template](./docs/templates/plugin-doc-minimal.md)** - Streamlined template for simple plugins (<5 features, <2000 lines)
- **[🌟 Gold Standard](./docs/plugins/puppeteer.md)** - Exemplar implementation (1,850+ lines, 80+ FAQ entries)

### Quick Reference

**12 Required Sections** (in order):
1. Header Block (title, emoji, one-liner, navigation)
2. TLDR (quick start, key features, performance comparison)
3. Table of Contents
4. Quickstart (complete working example)
5. Dependencies (required/optional packages)
6. Usage Journey/Patterns (progressive learning, 5-7 levels)
7. Configuration Reference (complete config object)
8. Configuration Examples (5-10 real-world scenarios)
9. API Reference (all methods, parameters, events)
10. Best Practices (do's, don'ts, performance, security)
11. Error Handling (common errors, troubleshooting)
12. FAQ (minimum 10-20 questions, categorized)

### Quality Badges

- 🟢 **Complete**: All 12 sections, 10+ FAQ, examples, cross-links
- 🟡 **Partial**: Most sections present (8-11), some content missing
- 🔴 **Minimal**: Stub documentation, incomplete sections

### Plugin Organization

**Simple plugins** (single file):
- Less than 5 major features
- Less than 2000 lines
- Example: `docs/plugins/cache.md`

**Complex plugins** (subdirectory):
- 5+ major features
- 2000+ lines
- Example: `docs/plugins/puppeteer/` (main.md + feature-specific docs)

### Creating New Plugin Documentation

1. Choose template based on complexity (full vs minimal)
2. Copy template to `docs/plugins/{plugin-name}.md`
3. Replace all `{PLACEHOLDERS}` with actual content
4. Remove template comments
5. Verify against quality checklist
6. Add plugin to `docs/plugins/README.md` with quality badge

For AI assistants: When documenting plugins, consult the full standard at `./docs/plugin-docs-standard.md` for detailed requirements and examples.
