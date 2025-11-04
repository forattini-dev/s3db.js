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
pnpm test:js               # JavaScript only
pnpm test:plugins          # Plugin tests
pnpm test:js-coverage      # Coverage report

# CLI
s3db list                           # List resources
s3db query <resource>               # Query records
s3db insert <resource> -d '<json>'  # Insert
```

## File Locations

### Tests & Examples
- **Tests**: `tests/` (Jest ESM, LocalStack)
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

**All plugin documentation must follow the standardized format** established by PuppeteerPlugin (`docs/plugins/puppeteer.md`). This ensures consistency, discoverability, and user-friendliness across the entire plugin ecosystem.

### Required Sections (in order)

#### 1. **Header Block**
```markdown
# 🎭 Plugin Name

> **One-line description of plugin purpose and key features.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration) | [FAQ ↓](#-faq)

---
```

**Requirements**:
- Emoji in title (represents plugin category/function)
- One-line description (max 100 characters)
- Navigation links to: Plugin Index, Configuration section, FAQ section
- Horizontal rule separator

#### 2. **TLDR Section**
```markdown
## ⚡ TLDR

**One-sentence summary of what this plugin does.**

**1 line to get started:**
```javascript
await db.usePlugin(new PluginName({ /* minimal config */ }));
```

**Production-ready setup:**
```javascript
await db.usePlugin(new PluginName({
  option1: value1,  // Explanation
  option2: value2,  // Explanation
  option3: value3   // Explanation
}));

// Usage example
const result = await plugin.doSomething();
```

**Key features:**
- ✅ **Feature 1** - Brief description
- ✅ **Feature 2** - Brief description
- ✅ **Feature 3** - Brief description
- ✅ **Feature 4** - Brief description

**Performance comparison:** (optional, but recommended)
```javascript
// ❌ Without plugin
// ... inefficient code

// ✅ With plugin
// ... optimized code
```
```

**Requirements**:
- One-sentence summary at top
- Minimal "1 line to get started" example
- Production-ready example with inline comments
- 4-7 key features with checkmarks
- Optional performance comparison showing value proposition

#### 3. **Table of Contents**
```markdown
## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [Usage Journey](#usage-journey) or [Usage Patterns](#usage-patterns)
   - [Level 1: Basic Usage](#level-1-basic-usage)
   - [Level 2: Intermediate](#level-2-intermediate)
   - [Level 3: Advanced](#level-3-advanced)
4. [📊 Configuration Reference](#-configuration-reference)
5. [📚 Configuration Examples](#-configuration-examples)
6. [🔧 API Reference](#-api-reference)
7. [✅ Best Practices](#-best-practices)
8. [🚨 Error Handling](#-error-handling)
9. [🔗 See Also](#-see-also)
10. [❓ FAQ](#-faq)

---
```

**Requirements**:
- All sections linked with anchor tags
- Progressive learning path (Level 1 → Level 7 or similar)
- Standard sections for Configuration, API, Best Practices, Error Handling, FAQ

#### 4. **Quickstart Section**
```markdown
## ⚡ Quickstart

```javascript
import { Database } from 's3db.js';
import { PluginName } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

// Create and use plugin
const plugin = new PluginName({
  // essential options only
});

await db.usePlugin(plugin);
await db.connect();

// Complete working example (10-20 lines)
const result = await plugin.doSomething();
console.log(result);

await db.disconnect();
```

---
```

**Requirements**:
- Complete, copy-paste-ready example
- Only essential imports
- Standard database setup
- 10-20 lines of functional code
- Shows plugin initialization, usage, and cleanup

#### 5. **Usage Journey / Usage Patterns**
```markdown
## Usage Journey

### Level 1: Basic [Feature]

Brief explanation of what this level demonstrates.

```javascript
// Complete example
```

**What's happening:**
- Point 1
- Point 2

---

### Level 2: Intermediate [Feature]

Progressive example building on Level 1.

```javascript
// Complete example
```

**New concepts:**
- Concept 1
- Concept 2

---

[Continue through Level 7 or appropriate progression]
```

**Requirements**:
- 5-7 progressive levels OR 3-5 common usage patterns
- Each level/pattern is self-contained
- Builds complexity gradually
- Includes "What's happening" or "New concepts" explanations
- Real-world scenarios

#### 6. **Configuration Reference**
```markdown
## 📊 Configuration Reference

Complete configuration object with inline comments:

```javascript
new PluginName({
  // ============================================
  // SECTION 1: Category Name
  // ============================================
  option1: {
    subOption1: defaultValue,  // Description
    subOption2: defaultValue,  // Description
  },

  // ============================================
  // SECTION 2: Another Category
  // ============================================
  option2: {
    // ...
  }
})
```

**Table format for complex options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `option1` | string | `'default'` | What it does |
| `option2.subOption` | number | `100` | What it controls |

---
```

**Requirements**:
- Complete configuration object (not partial)
- Organized by logical sections with visual separators
- Inline comments for every option
- Table format for complex/nested options
- Default values clearly shown

#### 7. **Configuration Examples**
```markdown
## 📚 Configuration Examples

### Use Case 1: Scenario Name

```javascript
new PluginName({
  // Focused configuration for this use case
})
```

---

### Use Case 2: Another Scenario

```javascript
new PluginName({
  // Different configuration
})
```

---

[5-10 common use cases]
```

**Requirements**:
- 5-10 real-world scenarios
- Each scenario has descriptive name
- Configuration focused on that specific use case
- Brief explanation of when to use

#### 8. **API Reference**
```markdown
## 🔧 API Reference

### Plugin Methods

#### `methodName(param1, param2?): Promise<ReturnType>`

Description of what method does.

**Parameters:**
- `param1` (type, required): Description
- `param2` (type, optional): Description

**Returns:** `Promise<ReturnType>` - Description

**Example:**
```javascript
const result = await plugin.methodName('value', { option: true });
```

**Throws:**
- `PluginError` - When and why

---

[Document all public methods]

### Events

#### `event.name`

Emitted when [condition].

**Payload:**
```javascript
{
  field1: 'value',
  field2: 123
}
```

**Example:**
```javascript
plugin.on('event.name', ({ field1, field2 }) => {
  console.log(`Event fired: ${field1}`);
});
```

---

[Document all events]
```

**Requirements**:
- Every public method documented
- Clear parameter types and requirements
- Return types specified
- Example for each method
- Error conditions listed
- All events documented with payload structure

#### 9. **Best Practices**
```markdown
## ✅ Best Practices

### Do's ✅

1. **Practice name**
   ```javascript
   // ✅ Good example
   ```

2. **Another practice**
   ```javascript
   // ✅ Good example
   ```

[5-10 do's]

---

### Don'ts ❌

1. **Anti-pattern name**
   ```javascript
   // ❌ Bad example

   // ✅ Correct way
   ```

[5-10 don'ts with corrections]

---

### Performance Tips

- **Tip 1**: Explanation
- **Tip 2**: Explanation

---

### Security Considerations

- **Warning 1**: What to avoid and why
- **Best practice 1**: What to do instead

---
```

**Requirements**:
- Separate Do's and Don'ts sections
- Each with working code examples
- Don'ts show both bad and good approach
- Performance tips section
- Security considerations section

#### 10. **Error Handling**
```markdown
## 🚨 Error Handling

### Common Errors

#### Error 1: Descriptive Name

**Problem**: What causes this error.

**Solution:**
```javascript
try {
  await plugin.method();
} catch (error) {
  if (error.code === 'SPECIFIC_ERROR') {
    // Handle specifically
  }
}
```

---

[Document 5-10 common errors]

### Troubleshooting

#### Issue 1: Symptom

**Diagnosis:**
1. Check X
2. Verify Y

**Fix:**
```javascript
// Solution code
```

---

[5-10 troubleshooting scenarios]
```

**Requirements**:
- Common errors documented with codes
- Solutions provided with code
- Troubleshooting decision tree
- Real-world debugging scenarios

#### 11. **See Also / Related Documentation**
```markdown
## 🔗 See Also

- [Related Plugin 1](./related-plugin.md) - How they work together
- [Core Concept](../concepts/concept.md) - Background info
- [Example](../examples/e42-example.js) - Working code

---
```

**Requirements**:
- Links to related plugins
- Links to core concepts
- Links to examples
- Brief description of relationship

#### 12. **FAQ Section**
```markdown
## ❓ FAQ

### General

**Q: Question about basic usage?**

A: Detailed answer with code example.

```javascript
// Example demonstrating answer
```

---

**Q: Another common question?**

A: Answer with explanation.

[10-20 questions organized by category]

---

### Advanced

**Q: Complex scenario question?**

A: Detailed technical answer.

---

### Performance

**Q: Performance-related question?**

A: Answer with benchmarks or metrics.

---

### Troubleshooting

**Q: Common error question?**

A: Diagnostic steps and solution.

---
```

**Requirements**:
- Minimum 10-20 questions
- Organized by categories (General, Advanced, Performance, Troubleshooting)
- Code examples where helpful
- Real questions from users or anticipated needs

---

### Documentation Quality Checklist

Before publishing plugin documentation, verify:

- [ ] All 12 required sections present
- [ ] Navigation links functional (Plugin Index, Configuration, FAQ)
- [ ] Code examples are complete and runnable
- [ ] All configuration options documented
- [ ] All public methods in API reference
- [ ] All events documented
- [ ] At least 10 FAQ entries
- [ ] Progressive learning path (5-7 levels)
- [ ] Performance comparisons included
- [ ] Error handling comprehensive
- [ ] Best practices with examples
- [ ] Troubleshooting scenarios covered
- [ ] Cross-links to related docs
- [ ] Consistent emoji usage
- [ ] Proper markdown formatting
- [ ] Table of contents matches sections

---

### Example Reference

**Gold Standard**: See `docs/plugins/puppeteer.md` for the exemplar implementation of this standard.

**Current Status**:
- ✅ **PuppeteerPlugin**: 100% compliant (1,850+ lines, 80+ FAQ entries)
- 🟡 **ReconPlugin**: Needs reformatting (has content, needs restructure)
- 🟡 **SpiderSuitePlugin**: Needs FAQ and Usage Journey expansion
- 🟡 **CookieFarmSuitePlugin**: Needs FAQ and Usage Journey expansion

---

### Templates

Quick-start templates are available:
- `docs/templates/plugin-doc-template.md` - Full template with all sections
- `docs/templates/plugin-doc-minimal.md` - Minimal viable documentation

When creating new plugin documentation, copy the appropriate template and fill in plugin-specific content.
