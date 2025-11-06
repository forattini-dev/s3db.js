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
| `TTLPlugin` | Auto-cleanup expired records (O(1) partition-based) |
| `CachePlugin` | Cache reads (memory/S3/filesystem) |
| `AuditPlugin` | Track all changes |
| `ReplicatorPlugin` | Sync to PostgreSQL/BigQuery/SQS |
| `MetricsPlugin` | Performance monitoring |
| `CostsPlugin` | AWS cost tracking |
| `EventualConsistencyPlugin` | Eventually consistent counters |

**TTL v2 Architecture**: Uses plugin storage with partition on `expiresAtCohort` for O(1) cleanup. Auto-detects granularity (minute/hour/day/week) and runs multiple intervals. Zero full scans.

**Performance**: Use `patch()` for metadata-only behaviors (`enforce-limits`, `truncate-data`) in plugin internal resources for 40-60% faster updates.

**BigQuery Mutability Modes** (`src/plugins/replicators/bigquery-replicator.class.js`):
- `append-only` (default): Updates/deletes → inserts with `_operation_type`, `_operation_timestamp`. No streaming buffer issues.
- `mutable`: Traditional UPDATE/DELETE with retry logic (90-minute streaming buffer window)
- `immutable`: Full audit trail with `_operation_type`, `_operation_timestamp`, `_is_deleted`, `_version`
- Configure globally or per-resource: `{ mutability: 'append-only' }`

### Utilities

| Function | Location | Purpose |
|----------|----------|---------|
| `tryFn()` | `src/concerns/try-fn.js` | `[ok, err, data]` error handling |
| `calculateTotalSize()` | `src/concerns/calculator.js:125` | UTF-8 byte count |
| `encrypt()/decrypt()` | `src/concerns/crypto.js` | AES-256-GCM |
| `mapAwsError()` | `src/errors.js:190` | AWS error translator |
| `idGenerator()` | `src/concerns/id.js` | nanoid (22 chars) |
| `requirePluginDependency()` | `src/plugins/concerns/plugin-dependencies.js` | Validate plugin deps |

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

# Plugin Verbosity (Tests & Dev)
- Always pass `verbose: false` when instantiating plugins in tests unless the
  test intentionally checks logging behavior. The base `Plugin` normalizes
  options via `normalizePluginOptions`, keeping verbose mode opt-in per plugin.

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
