# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference Tables

### Core Classes & Methods

| Term | Location | Usage Example | Notes |
|------|----------|---------------|-------|
| `Database` | `src/database.class.js` | `new Database({ bucketName, region, credentials })` | Main entry point |
| `Resource` | `src/resource.class.js` | `await db.createResource({ name, attributes })` | Represents a data collection |
| `Client` | `src/client.class.js` | `new Client({ connectionString })` | Low-level S3 operations |
| `Schema` | `src/schema.class.js` | `new Schema({ attributes })` | Field validation & mapping |
| `insert()` | `resource.class.js:717` | `await resource.insert({ name: 'John' })` | Create new record |
| `update()` | `resource.class.js:884` | `await resource.update(id, { name: 'Jane' })` | Update existing record |
| `get()` | `resource.class.js:1144` | `await resource.get(id)` | Fetch single record |
| `list()` | `resource.class.js:1384` | `await resource.list({ limit: 100 })` | Fetch multiple records |
| `query()` | `resource.class.js:1616` | `await resource.query({ status: 'active' })` | Filter records |
| `count()` | `resource.class.js:1507` | `await resource.count({ partition: 'byRegion' })` | Count records |

### Behaviors (2KB Metadata Handling)

| Behavior | File | When to Use | Example |
|----------|------|-------------|---------|
| `body-overflow` | `src/behaviors/body-overflow.js` | Default, automatic overflow | `behavior: 'body-overflow'` |
| `body-only` | `src/behaviors/body-only.js` | Large data (>2KB), max 5TB | `behavior: 'body-only'` |
| `truncate-data` | `src/behaviors/truncate-data.js` | Accept data loss for speed | `behavior: 'truncate-data'` |
| `enforce-limits` | `src/behaviors/enforce-limits.js` | Production, strict validation | `behavior: 'enforce-limits'` |
| `user-managed` | `src/behaviors/user-managed.js` | Custom handling via events | `behavior: 'user-managed'` |

### Partitioning

| Term | Location | Usage Example | Notes |
|------|----------|---------------|-------|
| Partition config | Resource options | `partitions: { byRegion: { fields: { region: 'string' } } }` | Define partitions |
| `getFromPartition()` | `resource.class.js:2297` | `await resource.getFromPartition({ id, partitionName, partitionValues })` | Get from specific partition |
| `listPartition()` | `resource.class.js:1419` | `await resource.listPartition({ partition: 'byRegion', partitionValues: { region: 'US' } })` | List partition records |
| Async partitions | Resource options | `asyncPartitions: true` | 70-100% faster writes (default) |
| `findOrphanedPartitions()` | `resource.class.js:550` | `const orphaned = resource.findOrphanedPartitions()` | Detect missing field refs |
| `removeOrphanedPartitions()` | `resource.class.js:596` | `resource.removeOrphanedPartitions({ dryRun: true })` | Clean up broken partitions |

### Plugins

| Plugin | File | Usage Example | Purpose |
|--------|------|---------------|---------|
| `CachePlugin` | `src/plugins/cache.plugin.js` | `db.usePlugin(new CachePlugin({ driver: 'memory', ttl: 3600 }))` | Cache reads (memory/S3/filesystem) |
| `AuditPlugin` | `src/plugins/audit.plugin.js` | `db.usePlugin(new AuditPlugin({ trackOperations: ['insert', 'update'] }))` | Track all changes |
| `ReplicatorPlugin` | `src/plugins/replicator.plugin.js` | `db.usePlugin(new ReplicatorPlugin({ replicators: [...] }))` | Sync to PostgreSQL/BigQuery/SQS |
| `MetricsPlugin` | `src/plugins/metrics.plugin.js` | `db.usePlugin(new MetricsPlugin({ trackLatency: true }))` | Performance monitoring |
| `CostsPlugin` | `src/plugins/costs.plugin.js` | `db.usePlugin(new CostsPlugin())` | AWS cost tracking |
| `EventualConsistencyPlugin` | `src/plugins/eventual-consistency/` | `db.usePlugin(new EventualConsistencyPlugin({ resources: { users: ['balance'] } }))` | Eventually consistent counters |

### Field Types & Validation

| Type | Notation | Example | Notes |
|------|----------|---------|-------|
| String | `string` | `name: 'string\|required'` | Basic string |
| Number | `number` | `age: 'number\|min:0\|max:120'` | Integer or float |
| Boolean | `boolean` | `active: 'boolean'` | true/false |
| Secret | `secret` | `password: 'secret\|required'` | Auto-encrypted (AES-256-GCM) |
| Embedding | `embedding:N` | `vector: 'embedding:1536'` | Vector embeddings, 77% compression |
| IPv4 Address | `ip4` | `ipAddress: 'ip4'` | IPv4 addresses, 47% compression |
| IPv6 Address | `ip6` | `ipAddress: 'ip6'` | IPv6 addresses, 44% compression |
| Array | `array` | `tags: 'array\|items:string'` | Arrays of any type |
| Object | `object` | `profile: { type: 'object', props: {...} }` | Nested objects |
| JSON | `json` | `metadata: 'json'` | Free-form JSON |

### Utilities & Helpers

| Function | Location | Usage Example | Purpose |
|----------|----------|---------------|---------|
| `tryFn()` | `src/concerns/try-fn.js` | `const [ok, err, data] = await tryFn(() => ...)` | Safe async error handling |
| `calculateTotalSize()` | `src/concerns/calculator.js:125` | `const bytes = calculateTotalSize(mappedObject)` | UTF-8 byte calculation |
| `encrypt()` / `decrypt()` | `src/concerns/crypto.js` | `const encrypted = await encrypt(data, passphrase)` | AES-256-GCM encryption |
| `mapAwsError()` | `src/errors.js:190` | `const mapped = mapAwsError(err, { bucket, key })` | AWS error translator |
| `idGenerator()` | `src/concerns/id.js` | `const id = idGenerator()` | Generate nanoid (22 chars) |
| Base62 encode/decode | `src/concerns/base62.js` | `const encoded = encode(12345)` | Number compression |
| `encodeIPv4()` / `decodeIPv4()` | `src/concerns/ip.js` | `const encoded = encodeIPv4('192.168.1.1')` | IPv4 binary encoding (47% savings) |
| `encodeIPv6()` / `decodeIPv6()` | `src/concerns/ip.js` | `const encoded = encodeIPv6('2001:db8::1')` | IPv6 binary encoding (44% savings) |
| `isValidIPv4()` / `isValidIPv6()` | `src/concerns/ip.js` | `const valid = isValidIPv4('192.168.1.1')` | IP address validation |

### Streams

| Class | File | Usage Example | Purpose |
|-------|------|---------------|---------|
| `ResourceReader` | `src/stream/resource-reader.class.js` | `new ResourceReader({ resource, batchSize: 100 })` | Read records as stream |
| `ResourceWriter` | `src/stream/resource-writer.class.js` | `new ResourceWriter({ resource })` | Write records via stream |
| `ResourceIdsReader` | `src/stream/resource-ids-reader.class.js` | `new ResourceIdsReader({ resource })` | Stream record IDs only |

### Testing & Examples

| Category | Location | Examples | Notes |
|----------|----------|----------|-------|
| Unit tests | `tests/` | `pnpm test:js` | Jest with ESM modules |
| TypeScript tests | `tests/typescript/` | `pnpm test:ts` | Type validation |
| Plugin tests | `tests/plugins/` | `pnpm test:plugins` | All plugin tests |
| Basic examples | `docs/examples/e01-e07` | Bulk insert, streams, CSV export | CRUD operations |
| Advanced examples | `docs/examples/e08-e17` | Partitions, versioning, hooks | Complex features |
| Plugin examples | `docs/examples/e18-e33` | Replicators, caching, queue consumers | Plugin usage |
| Vector examples | `docs/examples/e41-e43` | RAG chatbot, embeddings | AI/ML integration |

### Error Classes

| Error | File | When Thrown | Recovery |
|-------|------|-------------|----------|
| `PartitionError` | `src/errors.js:93` | Partition field missing | Use `findOrphanedPartitions()` |
| `ValidationError` | `src/errors.js:71` | Schema validation fails | Check attribute rules |
| `ResourceNotFound` | `src/errors.js:102` | Resource doesn't exist | Create resource first |
| `NoSuchKey` | `src/errors.js:128` | S3 object not found | Check ID exists |
| `NoSuchBucket` | `src/errors.js:137` | S3 bucket missing | Create bucket or check name |
| `CryptoError` | `src/errors.js:154` | Encryption/decryption fails | Check passphrase |

### Configuration Options

| Option | Level | Example | Default | Notes |
|--------|-------|---------|---------|-------|
| `behavior` | Resource | `behavior: 'body-overflow'` | `'body-overflow'` | Metadata handling strategy |
| `timestamps` | Resource | `timestamps: true` | `false` | Add createdAt/updatedAt |
| `paranoid` | Resource | `paranoid: true` | `true` | Prevent destructive deletes |
| `strictValidation` | Resource | `strictValidation: false` | `true` | Partition field validation |
| `asyncPartitions` | Resource | `asyncPartitions: true` | `true` | Async partition indexing |
| `parallelism` | Database/Resource | `parallelism: 20` | `10` | Concurrent operations |
| `versioningEnabled` | Database/Resource | `versioningEnabled: true` | `false` | Schema versioning |
| `autoDecrypt` | Resource | `autoDecrypt: true` | `true` | Auto-decrypt secret fields |

## Critical S3 Limitations & Solutions

### 2KB Metadata Limit
**Problem**: S3 metadata max 2047 bytes total.
**Solution**: 5 behaviors in `src/behaviors/`:
- `body-overflow`: Sorts fields by size, fills metadata with smallest first, overflows to body
- `body-only`: Metadata only has `_v` field, everything in body (5TB limit)
- `truncate-data`: Truncates last fitting field to maximize retention
- `enforce-limits`: Throws errors when exceeding limits (production)
- `user-managed`: Emits `exceedsLimit` events, fallback to body

**Size Calculation**: `src/concerns/calculator.js`
- Precise UTF-8 byte counting with surrogate pairs
- `calculateEffectiveLimit()` accounts for system overhead (`_v`, timestamps)
- `S3_METADATA_LIMIT_BYTES = 2047`

### Self-Healing JSON System
**Location**: `database.class.js::_attemptJsonRecovery()`
**Layers**:
1. JSON parsing fixes (trailing commas, missing quotes, incomplete braces)
2. Metadata structure validation (adds missing fields)
3. Resource healing (fixes invalid version references, removes null hooks)
4. Timestamped backups of corrupted files

**Recovery Strategy**:
```javascript
// Changes non-existent currentVersion to first available
if (!versions[currentVersion]) {
  resource.currentVersion = Object.keys(versions)[0];
}
```

## Architecture Decisions

### Partitioning
**Key Structure**: `resource=users/partition=byRegion/region=US/id=user123`
**Features**:
- Field-consistent ordering (alphabetical regardless of input order)
- Multi-field support with automatic sorting
- Partition-aware caching (`PartitionAwareFilesystemCache`)
- O(1) partition lookups vs O(n) full scans
- **Async partition indexing (v9.3.0+)**: Default `asyncPartitions: true` for 70-100% faster writes
- **Parallel operations**: All partition operations use `Promise.all()` for concurrent execution
- **Automatic partition migration on update (v9.2.2+)**: When updating a partitioned field, records automatically move between partitions to maintain consistency

#### Orphaned Partitions Problem & Recovery
**Problem**: Partitions can reference fields that no longer exist in the schema, causing validation errors and blocking all operations.

**When it happens**:
1. A partition is created for a specific field (e.g., `region`)
2. The field is later removed from the schema via `updateAttributes()`
3. With `strictValidation: true` (default), the partition validation throws:
   ```
   PartitionError: Partition 'byRegion' uses field 'region' which does not
   exist in resource attributes. Available fields: name, email, status.
   ```
4. **ALL resource operations become blocked** (insert, update, query, etc.)

**Detection** (`src/resource.class.js:550`):
```javascript
// Find all partitions with missing field references
const orphaned = resource.findOrphanedPartitions();
// Returns: {
//   byRegion: {
//     missingFields: ['region'],
//     definition: { fields: { region: 'string' } },
//     allFields: ['region']
//   }
// }
```

**Recovery Workflow** (`src/resource.class.js:596`, see `docs/examples/e44-orphaned-partitions-recovery.js`):
```javascript
// Step 1: Load resource with validation disabled (bypass blocking)
const resource = await database.getResource('users', {
  strictValidation: false
});

// Step 2: Detect orphaned partitions
const orphaned = resource.findOrphanedPartitions();
console.log('Orphaned:', Object.keys(orphaned)); // ['byRegion']

// Step 3: Preview removal (dry run)
const toRemove = resource.removeOrphanedPartitions({ dryRun: true });
console.log('Would remove:', Object.keys(toRemove));

// Step 4: Actually remove orphaned partitions
resource.removeOrphanedPartitions();
// Emits: 'orphanedPartitionsRemoved' event with details

// Step 5: Persist changes to S3
await database.uploadMetadataFile();

// Step 6: Re-enable strict validation
resource.strictValidation = true;
```

**Prevention** (enforced by default):
```javascript
// strictValidation: true (default) prevents orphaned partitions at creation time
await database.createResource({
  name: 'products',
  attributes: {
    name: 'string'
    // category field missing!
  },
  options: {
    strictValidation: true, // Default - validation happens in constructor
    partitions: {
      byCategory: { fields: { category: 'string' } } // ❌ Will throw immediately
    }
  }
});
// Error: Partition 'byCategory' uses field 'category' which does not exist
```

**Best Practice - Check Before Removing Fields**:
```javascript
// Before removing a field, check if any partitions depend on it
const fieldToRemove = 'status';
const partitionsUsingField = Object.entries(resource.config.partitions || {})
  .filter(([name, def]) => def.fields && fieldToRemove in def.fields)
  .map(([name]) => name);

if (partitionsUsingField.length > 0) {
  console.warn(`Warning: These partitions use '${fieldToRemove}':`, partitionsUsingField);
  // Option 1: Remove partitions first
  partitionsUsingField.forEach(name => delete resource.config.partitions[name]);
  await database.uploadMetadataFile();

  // Option 2: Keep the field in schema
  // Option 3: Re-design partitions
}
```

**Location**:
- Core logic: `src/resource.class.js:483-620`
- TypeScript definitions: `src/s3db.d.ts:766-767`
- Tests: `tests/resources/orphaned-partitions.test.js`
- Complete example: `docs/examples/e44-orphaned-partitions-recovery.js`

**Key Points**:
- Orphaned partitions **completely block resource operations** with strict validation
- `findOrphanedPartitions()` detects the issue
- `removeOrphanedPartitions()` fixes it (with optional `dryRun` preview)
- Always `uploadMetadataFile()` after removal to persist changes
- Prevention is automatic with `strictValidation: true` (default)

### Plugin System
**Base**: `src/plugins/plugin.class.js`
**Interception Methods**:
1. Method wrapping: Result transformation
2. Middleware: Request interception with `next()` pattern
3. Hooks: Pre/post operation logic

**Plugin Types**:
- `cache`: Memory/filesystem/S3 drivers with TTL/LRU/FIFO
- `audit`: Change tracking with audit logs
- `replicator`: Sync to PostgreSQL/BigQuery/SQS/S3DB
- `queue-consumer`: Process RabbitMQ/SQS messages
- `costs`: AWS API cost tracking
- `metrics`: Performance monitoring
- `fulltext`: Text search

### Resource Origin Tracking (createdBy)
**Purpose**: Track who created a resource to enable plugin-aware behavior
**Location**: `database.class.js::uploadMetadataFile()`, `resource.class.js::constructor()`

**Metadata Structure**:
```javascript
{
  resources: {
    users: {
      createdBy: 'user', // User-created resource
      currentVersion: 'v0',
      versions: { ... }
    },
    users_transactions_balance: {
      createdBy: 'EventualConsistencyPlugin', // Plugin-created resource
      currentVersion: 'v0',
      versions: { ... }
    }
  }
}
```

**Values**:
- `'user'`: Default, created programmatically by application code
- `'plugin'`: Generic plugin-created resource
- `'EventualConsistencyPlugin'`, `'AuditPlugin'`, etc.: Specific plugin name

**Usage**:
```javascript
// Create user resource
const users = await database.createResource({
  name: 'users',
  attributes: { ... },
  createdBy: 'user' // Optional, defaults to 'user'
});

// Plugin creates internal resources
const transactions = await database.createResource({
  name: 'users_transactions',
  attributes: { ... },
  createdBy: 'EventualConsistencyPlugin' // Marked as plugin-created
});
```

**Cache Behavior**: CachePlugin automatically skips plugin-created resources unless explicitly included
```javascript
// CachePlugin.shouldCacheResource() checks createdBy
if (resourceMetadata?.createdBy && resourceMetadata.createdBy !== 'user' && !this.config.include) {
  return false; // Skip plugin resources
}
```

**Benefits**:
- Prevents caching of transient plugin data (transactions, locks, analytics)
- Enables plugin-specific behavior (e.g., monitoring, replication filters)
- Self-documenting resource ownership in metadata
- Forward-compatible for future plugin ecosystem features

### Advanced Metadata Encoding
**Implementation**: Schema hooks system (`src/schema.class.js`, `src/concerns/`)
**Optimizations**:
- ISO timestamps → Unix Base62 (67% savings)
- UUIDs → Binary Base64 (33% savings)
- Dictionary encoding for common values (95% savings)
- Hex strings → Base64 (33% savings)
- Large numbers → Base62 (40-46% savings)
- IPv4 addresses → Binary Base64 (47% savings) - `src/concerns/ip.js`
- IPv6 addresses → Binary Base64 (44% savings) - `src/concerns/ip.js`
- Vector embeddings → Fixed-point Base62 (77% savings) - `src/concerns/base62.js`
- UTF-8 byte calculation memory cache (2-3x faster)

**Dictionary**: 34 common values mapped to single bytes
- Statuses: `active`, `inactive`, `pending`, etc.
- Booleans: `true`, `false`, `yes`, `no`
- HTTP methods: `GET`, `POST`, `PUT`, `DELETE`
- Null values: `null`, `undefined`, `none`

### Encryption
**Algorithm**: AES-256-GCM with PBKDF2 key derivation
**Implementation**: `src/concerns/crypto.js`
- 100,000 iterations for key derivation
- Random 16-byte salt + 12-byte IV
- Base64 encoding for storage
- Automatic for `secret` field types
- Cross-platform (Node.js webcrypto / browser crypto)

### Versioning System
**Metadata Structure**:
```javascript
{
  currentVersion: "v1",
  versions: {
    v0: { hash: "sha256:...", attributes: {...} },
    v1: { hash: "sha256:...", attributes: {...} }
  }
}
```
**Detection**: Hash-based using `jsonStableStringify`
**Events**: `resourceDefinitionsChanged` on schema changes

### Hook Persistence
**Serialization**: Functions to strings with `__s3db_serialized_function` marker
**Deserialization**: `new Function('return ' + code)()` (not eval)
**Limitations**:
- Loses closure variables
- No external dependencies
- Pure functions only
- Failed deserializations filtered silently

### Stream Processing
**Classes**: `src/stream/`
- `ResourceReader`: Parallel fetching with PromisePool
- `ResourceWriter`: Bulk writes with backpressure
- `ResourceIdsReader`: Paginated ID streaming

**Features**:
- Configurable batch size and concurrency
- Object mode Transform streams
- Error recovery per item
- Partition-aware streaming

### Error Handling
**Utility**: `tryFn()` returns `[ok, err, data]` tuple
**AWS Mapping**: `mapAwsError()` with actionable suggestions
**Custom Errors**: Rich context preservation (bucket, key, suggestion)
**Recovery**:
- Graceful degradation
- Exponential backoff retries
- Circuit breaker pattern
- Fallback strategies

### Connection Strings
**Formats**:
```
s3://KEY:SECRET@bucket?region=us-east-1
http://KEY:SECRET@localhost:9000/bucket  # MinIO
https://KEY:SECRET@nyc3.digitaloceanspaces.com/bucket  # DO Spaces
```
**Features**:
- URL-safe credential encoding
- Path-style vs virtual-hosted detection
- Subpath/prefix support
- Query parameter parsing

## Commands

### Development
```bash
pnpm install         # Use pnpm only
pnpm run build       # Rollup build
pnpm run dev         # Watch mode
```

### Testing
```bash
pnpm test                   # All tests
pnpm test:js               # JavaScript only
pnpm test:ts               # TypeScript only
pnpm test:plugins          # Plugin tests
pnpm test:cache            # Cache tests
pnpm test:audit            # Audit (memory intensive)

# Single test
node --no-warnings --experimental-vm-modules node_modules/jest/bin/jest.js tests/path/to/test.js
```

## Performance Optimizations

### Caching Strategy
- **S3Cache**: Compression + encryption, configurable storage class
- **MemoryCache**: LRU/FIFO eviction, memory limits, compression, statistics tracking
- **FilesystemCache**: Atomic writes, directory organization
- **PartitionAwareFilesystemCache**: Hierarchical invalidation

**MemoryCache Features**:
- **Memory Limits**: `maxMemoryBytes` or `maxMemoryPercent` prevents exhaustion (enforces byte-level limits)
- **Percentage-based Limits**: Use `maxMemoryPercent` for dynamic limits based on system memory (ideal for containers/cloud)
- **Item Limits**: `maxSize` limits number of cached items
- **Compression**: Optional gzip compression to reduce memory usage
- **Statistics**: `getMemoryStats()` provides current/max/available memory, system memory info, eviction counts
- **Auto-eviction**: Automatically removes oldest items when limits are exceeded

**Example Configurations**:
```javascript
// Absolute memory limit (good for fixed environments)
new CachePlugin({
  driver: 'memory',
  maxSize: 5000, // Max 5000 items
  ttl: 1800000, // 30 minutes
  config: {
    maxMemoryBytes: 512 * 1024 * 1024, // 512MB hard limit
    enableCompression: true,
    compressionThreshold: 1024 // Compress items > 1KB
  }
})

// Percentage-based limit (good for containers/cloud)
new CachePlugin({
  driver: 'memory',
  ttl: 1800000, // 30 minutes
  config: {
    maxMemoryPercent: 0.1, // Use max 10% of system memory (0.1 = 10%)
    enableCompression: true
  }
})
// On 16GB system = ~1.6GB limit
// On 32GB system = ~3.2GB limit

// Monitor memory usage
const stats = cachePlugin.driver.getMemoryStats();
console.log(`Memory: ${stats.memoryUsage.current} / ${stats.memoryUsage.max}`);
console.log(`Usage: ${stats.memoryUsagePercent}%`);
console.log(`System: ${stats.systemMemory.total} (cache: ${stats.systemMemory.cachePercent})`);
console.log(`Evicted: ${stats.evictedDueToMemory}`);
```

**Cache Keys**: Deterministic generation including resource/version/partition/params

### Batch Operations
- `PromisePool` for controlled concurrency (default 10)
- Connection pooling via `@smithy/node-http-handler`
- Chunk processing to prevent memory overflow
- Parallel partition operations

### Query Optimization
- Partition keys enable O(1) lookups
- Stream processing for large result sets
- Pagination with continuation tokens
- Selective field retrieval with behaviors

## Critical Patterns

### Resource Creation
```javascript
database.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',      // Auto-encrypted
    embedding: 'embedding:1536',      // Vector embedding (77% compression)
    profile: {                        // Nested object
      type: 'object',
      props: { name: 'string' }
    }
  },
  behavior: 'body-overflow',     // Handle large data
  timestamps: true,               // createdAt/updatedAt
  paranoid: true,                // Soft deletes
  asyncPartitions: true,         // Fast async indexing (default)
  partitions: {
    byRegion: { fields: { region: 'string' } }
  },
  hooks: {
    beforeInsert: [async (data) => data]
  }
})
```

#### Custom Type Notations

**Embedding Type** - Shorthand for vector embeddings with automatic fixed-point encoding:
```javascript
// Shorthand notation (recommended)
attributes: {
  vector: 'embedding:1536'        // OpenAI text-embedding-3-small/3-large
}

// Alternative pipe notation
attributes: {
  vector: 'embedding|length:768'  // Common BERT dimension
}

// Object notation (for additional options)
attributes: {
  vector: {
    type: 'array',
    items: 'number',
    length: 1536,
    empty: false
  }
}

// All forms automatically apply fixed-point encoding (77% compression)
// Common dimensions: 256, 384, 512, 768, 1024, 1536, 2048, 3072
```

**Secret Type** - Auto-encrypted fields:
```javascript
attributes: {
  password: 'secret|required',           // AES-256-GCM encryption
  apiKey: 'secret|min:32',              // Encrypted with validation
  token: 'secretAny',                   // Any type, encrypted
  pin: 'secretNumber'                   // Number type, encrypted
}
```

**IP Address Types** - Compact binary encoding for IPv4 and IPv6:
```javascript
// IPv4 addresses (11-15 chars → 8 chars Base64, ~47% savings)
attributes: {
  ipv4: 'ip4',                          // Basic IPv4
  requiredIP: 'ip4|required',           // Required IPv4
  clientIP: { type: 'ip4', required: true }  // Object notation
}

// IPv6 addresses (up to 39 chars → 24 chars Base64, ~44% savings)
attributes: {
  ipv6: 'ip6',                          // Basic IPv6
  serverIP: 'ip6|optional',             // Optional IPv6
  gatewayIP: { type: 'ip6' }            // Object notation
}

// Mixed IP types
attributes: {
  clientIPv4: 'ip4',
  clientIPv6: 'ip6',
  timestamp: 'number',
  userAgent: 'string'
}

// Automatic encoding/decoding
const data = { ipv4: '192.168.1.1', ipv6: '2001:db8::1' };
await resource.insert(data);
// Stored as: { ipv4: 'wKgBAQ==', ipv6: 'IAENuAAAAAAAAAAAAAAAAQ==' }

const record = await resource.get(id);
// Retrieved as: { ipv4: '192.168.1.1', ipv6: '2001:db8::1' }

// Encoding details:
// - IPv4: 4 bytes → Base64 (8 characters with padding)
// - IPv6: 16 bytes → Base64 (24 characters with padding)
// - Invalid IPs are preserved as-is (no encoding)
// - Null/undefined values are preserved
// - IPv6 addresses are automatically compressed on decode
```

### Error Recovery Pattern
```javascript
const [ok, err, result] = await tryFn(async () => {
  return await resource.insert(data);
});
if (!ok) {
  const mappedError = mapAwsError(err, { bucket, key });
  // Handle with suggestions
}
```

### Stream Pattern
```javascript
const reader = new ResourceReader({ 
  resource, 
  batchSize: 100,
  concurrency: 5 
});
reader.pipe(transformStream).pipe(writeStream);
```

## Constraints & Workarounds

### S3 Limitations
- 2KB metadata → behavioral patterns
- No transactions → eventual consistency
- No indexes → partition strategy
- Rate limits → batching + backoff

### JavaScript Limitations
- Function serialization → pure functions only
- Memory limits → streaming API
- Async complexity → tryFn pattern

### Security Considerations
- Hook deserialization uses Function constructor
- Credentials in connection strings need encoding
- Field-level encryption for sensitive data
- Paranoid mode for destructive operations

## MCP Server
**Location**: `mcp/server.js`
**Transports**: SSE, stdio
**Usage**: `npx s3db-mcp-server --transport=sse`
**Port**: 8000 (default)

## CLI & Standalone Binaries

### s3db CLI
**Location**: `bin/s3db-cli.js` (ES modules), `bin/s3db-cli-standalone.js` (CommonJS)
**Commands**:
```bash
s3db list                            # List all resources
s3db query <resource>                # Query records
s3db insert <resource> -d '<json>'   # Insert data
s3db get <resource> <id>             # Get by ID
s3db delete <resource> <id>          # Delete record
s3db count <resource>                # Count records
```

**Connection**: Via `--connection` or `S3DB_CONNECTION` env var
**Features**: Colored output, progress spinners, table formatting

### Building Standalone Binaries
**Script**: `build-binaries.sh` or `pnpm run build:binaries`
**Process**:
1. Bundle with esbuild (includes ALL dependencies)
2. Compile with pkg to native executables
3. Output to `bin/standalone/`

**Created Binaries**:
- `s3db-linux-x64` (~47MB)
- `s3db-macos-x64` (~52MB) - Needs codesigning
- `s3db-macos-arm64` (~45MB) - Needs codesigning
- `s3db-win-x64.exe` (~39MB)
- `s3db-mcp-linux-x64` (~47MB)
- `s3db-mcp-macos-x64` (~52MB)
- `s3db-mcp-macos-arm64` (~45MB)
- `s3db-mcp-win-x64.exe` (~39MB)

**CommonJS Compatibility**: 
- Created `server-standalone.js` for MCP to avoid `import.meta.url` issues
- Uses `__dirname` instead of `fileURLToPath(import.meta.url)`
- Bundles include AWS SDK, all CLI tools (chalk, ora, commander)

### NPM Distribution
**Best Practices**:
- Don't include binaries in NPM package (too large)
- Binaries available via GitHub releases
- NPM package includes source + dist builds only

## Testing Infrastructure

### Test Coverage
**Target**: 90% minimum coverage for all files
**Current**: ~89.8% overall coverage
**Commands**:
```bash
pnpm test                   # All tests
pnpm test:js               # JavaScript only
pnpm test:ts               # TypeScript only
pnpm test:plugins          # Plugin tests
pnpm test:cache            # Cache tests
pnpm test:audit            # Audit (memory intensive)

# Coverage report
pnpm test:js-coverage

# Single test file
node --no-warnings --experimental-vm-modules node_modules/jest/bin/jest.js tests/path/to/test.js
```

### Test Infrastructure
- Jest with ESM (`--experimental-vm-modules`)
- LocalStack for S3 simulation
- Coverage reports in `coverage/`
- TypeScript validation in `tests/typescript/`
- Max workers: 1 (prevents race conditions)
- Vitest support via `vitest.config.js`

### Key Test Files
- `tests/functions/advanced-metadata-encoding.test.js` - Encoding optimizations
- `tests/concerns/calculator.test.js` - UTF-8 byte calculations
- `tests/s3db.json/` - Self-healing JSON tests
- `tests/plugins/` - All plugin functionality
- `tests/resources/` - Resource CRUD operations

## Examples Directory

**Location**: `docs/examples/` (NOT `examples/`)
**Naming Convention**: `eXX-description.js` (e.g., `e41-vector-rag-chatbot.js`)
**Purpose**: Production-ready examples for documentation and developer reference

**Categories**:
- Basic CRUD: `e01-e07` (bulk insert, streams, CSV/ZIP export, JWT, resource creation)
- Advanced Features: `e08-e17` (behaviors, partitioning, schema validation, versioning, hooks, pagination, error handling)
- Plugins: `e18-e33` (costs, replicators, queue consumers, middleware, caching)
- HTTP & Optimization: `e34-e37` (HTTP client benchmarks, cache drivers, self-healing)
- Testing: `e38-e40` (isolated plugins, partial schemas, mock database)
- Vectors: `e41-e43` (RAG chatbot, provider integrations, benchmarks)
- Maintenance: `e44` (orphaned partitions recovery)

**When Adding Examples**:
1. Always save to `docs/examples/` directory
2. Use next available `eXX` number
3. Include comprehensive comments and error handling
4. Demonstrate production-ready patterns
5. Show both basic and advanced usage