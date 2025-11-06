# Project Context

## Purpose

**s3db.js** is a document database library that transforms AWS S3 into a fully functional database using S3's metadata capabilities. It provides an ORM-like interface for storing and querying JSON documents directly in S3, making it highly cost-effective for serverless applications.

**Primary Goals:**
- Provide zero-cost database storage (pay only for S3 usage)
- Eliminate database server management overhead
- Offer familiar ORM-like interface for S3
- Enable efficient document storage using S3 metadata (2KB) + body (unlimited)
- Support enterprise features: encryption, validation, streaming, partitioning

**Target Use Cases:**
- Serverless applications (Lambda, Edge Functions)
- Cost-conscious projects
- Analytics platforms (large dataset processing)
- Rapid prototyping
- Applications requiring secure, scalable document storage

## Tech Stack

### Core Technologies
- **Runtime**: Node.js 18+ (ESM modules)
- **Language**: JavaScript (ES2022+) with TypeScript definitions
- **Package Manager**: pnpm (NOT npm or yarn)
- **Build Tool**: Rollup + esbuild
- **Test Framework**: Jest (ESM mode) + LocalStack for S3 simulation
- **Validation**: fastest-validator (NOT Joi or Yup)

### Primary Dependencies
- `@aws-sdk/client-s3` (v3) - AWS S3 operations
- `fastest-validator` - Schema validation
- `nanoid` - ID generation (22-char)
- `lodash-es` - Utilities (tree-shakeable)
- `@supercharge/promise-pool` - Concurrent operations

### Optional/Peer Dependencies (Lazy Loaded)
**API & Auth**:
- `hono` - HTTP framework (ApiPlugin, IdentityPlugin)
- `jose` - JWT handling
- `bcrypt` - Password hashing

**Data Replication**:
- `pg` - PostgreSQL replication
- `@google-cloud/bigquery` - BigQuery replication
- `@libsql/client` - Turso/LibSQL replication

**Browser Automation**:
- `puppeteer` - Browser control
- `puppeteer-extra` - Stealth plugin support

**Cloud Inventory**:
- `@aws-sdk/*` - AWS service clients
- `@google-cloud/*` - GCP service clients
- `@azure/*` - Azure service clients

## Project Conventions

### Code Style

**Language**: Pure JavaScript (no TypeScript source), with `.d.ts` type definitions

**Module System**:
- ESM modules exclusively (`import`/`export`)
- No CommonJS in source code
- Rollup builds both ESM (`dist/s3db.es.js`) and CJS (`dist/s3db.cjs`)

**Naming Conventions**:
- **Classes**: PascalCase (e.g., `Database`, `Resource`, `ApiPlugin`)
- **Files**: kebab-case (e.g., `database.class.js`, `s3-client.class.js`)
- **Methods**: camelCase (e.g., `createResource`, `getById`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `DEFAULT_BEHAVIOR`, `AVAILABLE_BEHAVIORS`)
- **Private methods**: Prefix with `_` (e.g., `_validateSchema()`)

**File Naming Patterns**:
- Classes: `*.class.js` (e.g., `database.class.js`)
- Concerns/utilities: `*.js` (e.g., `calculator.js`, `crypto.js`)
- Plugins: `*.plugin.js` (e.g., `cache.plugin.js`)
- Tests: `*.test.js` (e.g., `database.class.test.js`)

**Code Organization**:
```
src/
├── database.class.js          # Main Database class
├── resource.class.js          # Resource class (CRUD operations)
├── schema.class.js            # Schema validation/encoding
├── clients/                   # S3 client implementations
├── concerns/                  # Shared utilities
├── plugins/                   # Plugin system
├── stream/                    # Streaming API
├── behaviors/                 # 2KB metadata handling strategies
└── errors.js                  # Custom error classes
```

**Comments**:
- JSDoc for public APIs
- Inline comments for complex logic
- No comments for self-explanatory code

**Formatting**:
- 2 spaces indentation
- Single quotes for strings
- Semicolons optional (ASI)
- 100-char line limit (soft)

### Architecture Patterns

**Core Architecture**:
1. **Database Layer**: Connection management, resource registration
2. **Resource Layer**: CRUD operations, schema validation
3. **Client Layer**: S3 abstraction (S3Client, MemoryClient)
4. **Plugin System**: Middleware-based extensibility

**Key Patterns**:

**1. Lazy Loading (CRITICAL)**
- All peer dependencies use lazy loading via dynamic `import()`
- Prevents "module not found" errors for optional features
- Example: `lazyLoadPlugin('ApiPlugin')` loads only when used

**2. Error Handling**
```javascript
// Always use tryFn for fallible operations
import tryFn from './concerns/try-fn.js';
const [ok, err, data] = await tryFn(() => operation());
if (!ok) { /* handle error */ }
```

**3. Behaviors (2KB Metadata Management)**
- `body-overflow`: Auto-overflow to body (default)
- `body-only`: Large data (>2KB)
- `truncate-data`: Accept data loss for speed
- `enforce-limits`: Strict validation (production)
- `user-managed`: Custom handling via events

**4. Plugin System**
- Base class: `Plugin` (in `src/plugins/plugin.class.js`)
- Lifecycle: `onInstall` → `onStart` → `onStop` → `onUninstall`
- Method wrapping: Plugins can intercept database/resource methods
- Middleware pattern: `next()` calls for chaining

**5. Partitioning**
- O(1) lookups vs O(n) scans
- Key structure: `resource=users/partition=byRegion/region=US/id=user123`
- Async indexing: `asyncPartitions: true` (70-100% faster writes)

**6. Advanced Encoding**
- ISO timestamps → Unix Base62 (67% savings)
- UUIDs → Binary Base64 (33% savings)
- IPv4/IPv6 → Binary Base64 (44-47% savings)
- Vector embeddings → Fixed-point Base62 (77% savings)
- Dictionary encoding: 34 common values → single bytes

**7. Update Method Selection**
- `update()`: GET+PUT, merges data (baseline)
- `patch()`: HEAD+COPY, 40-60% faster (metadata-only)
- `replace()`: PUT only, 30-40% faster (no merge)

### Testing Strategy

**Framework**: Jest with ESM support

**Test Structure**:
```
tests/
├── classes/          # Core class tests
├── clients/          # S3/Memory client tests
├── functions/        # Utility function tests
├── integration/      # End-to-end tests
├── plugins/          # Plugin tests
└── resources/        # Resource operation tests
```

**Running Tests**:
```bash
pnpm test              # All tests
pnpm test:core         # Core only (no plugins)
pnpm test:plugins      # Plugin tests
pnpm test:coverage     # With coverage
```

**Test Requirements**:
- Use MemoryClient for fast tests (100-1000x faster than S3)
- Mock external services (AWS, GCP, Azure)
- Test both success and error paths
- Use descriptive test names: `should [expected behavior] when [condition]`

**Coverage Target**: 70%+ (current: varies by module)

**LocalStack**: Used for integration tests requiring real S3 behavior

### Git Workflow

**Branching Strategy**:
- `main` - Production-ready code
- Feature branches: `feat/feature-name`
- Bug fixes: `fix/bug-name`
- No develop branch (direct to main)

**Commit Conventions** (Conventional Commits):
```
feat: add new feature
fix: bug fix
docs: documentation changes
refactor: code refactoring
test: test additions/changes
chore: tooling/config changes
perf: performance improvements
```

**Commit Message Format**:
```
<type>: <subject>

<body (optional)>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**PR Requirements**:
- Tests must pass
- No decrease in coverage (if applicable)
- Documentation updated
- Examples added (if new feature)

**Release Process**:
- Semantic versioning (MAJOR.MINOR.PATCH)
- Changelog updated
- npm publish (manual, not automated)

## Domain Context

### S3 as a Database

**Core Concept**: s3db.js stores documents using S3 metadata fields (up to 2KB) for speed/cost optimization, with automatic overflow to body for larger documents.

**S3 Metadata Limit**: 2047 bytes (UTF-8)
- s3db.js uses `src/concerns/calculator.js` for precise byte counting
- Behaviors handle overflow automatically
- Compression/encoding optimizations maximize metadata usage

**Key Structure** (S3 object keys):
```
{bucketName}/resource={resourceName}/[partition={partitionName}/{field}={value}/]id={recordId}
```

Example:
```
mybucket/resource=users/partition=byRegion/region=US/id=user_abc123
```

**S3 Operations Mapping**:
- `insert()` → PutObject
- `update()` → GetObject + PutObject
- `patch()` → HeadObject + CopyObject (40-60% faster)
- `replace()` → PutObject (30-40% faster)
- `get()` → GetObject
- `list()` → ListObjectsV2
- `query()` → ListObjectsV2 + filtering
- `delete()` → DeleteObject

### Schema Validation

**Validator**: fastest-validator (NOT Joi/Yup)

**Field Types** (30+ supported):
- **Basic**: `string`, `number`, `boolean`, `date`, `object`, `array`
- **Special**: `secret` (AES-256-GCM encrypted), `uuid`, `email`, `url`
- **Network**: `ip4`, `ip6` (binary-encoded)
- **ML**: `embedding:N` (vector embeddings, 77% compression)
- **Advanced**: `json`, `any`, `enum`, `custom`

**Schema Definition**:
```javascript
{
  name: 'string|required',           // Shorthand
  age: { type: 'number', min: 0 },   // Object form
  tags: 'array|items:string',        // Array validation
  profile: {                         // Nested (auto-detected! ✨)
    bio: 'string',
    avatar: 'url'
  }
}
```

### Plugin System

**Available Plugins**:
- **Core** (no peer deps): AuditPlugin, CachePlugin, CostsPlugin, FulltextPlugin, MetricsPlugin, RelationPlugin, S3QueuePlugin, SchedulerPlugin, StateMachinePlugin, TTLPlugin, VectorPlugin
- **With peer deps**: ApiPlugin, IdentityPlugin, ReplicatorPlugin, PuppeteerPlugin, BackupPlugin, CloudInventoryPlugin, KubernetesInventoryPlugin, CookieFarmPlugin, ReconPlugin, GeoPlugin, QueueConsumerPlugin

**Plugin Dependencies**:
- Runtime validation via `requirePluginDependency()`
- Keeps core package lightweight (~500KB)
- Lazy loading prevents import errors

## Important Constraints

### Technical Constraints

**S3 Limitations**:
- 2KB metadata maximum (2047 bytes UTF-8)
- No transactions (eventual consistency)
- No indexes (use partitions instead)
- Rate limits (request throttling)
- No atomic operations

**Performance Constraints**:
- S3 API latency (50-200ms per request)
- ListObjectsV2 max 1000 objects per call
- Pagination required for large datasets
- Batching recommended for bulk operations

**Node.js Version**: 18+ required (ESM support, modern features)

### Security Constraints

**Encryption**:
- Field-level: AES-256-GCM for `secret` type fields
- Transport: HTTPS only for S3 communication
- At-rest: S3 server-side encryption (optional)

**Credentials**:
- AWS credentials via environment or profiles
- No credentials in code (use AWS SDK credential chain)
- Connection strings support URL encoding

**Validation**:
- All user input validated via fastest-validator
- Schema enforcement prevents injection attacks
- Paranoid mode prevents accidental destructive operations

### Business Constraints

**Cost Optimization**:
- Minimize S3 API calls (use caching)
- Prefer metadata storage over body (cheaper)
- Use partitions to reduce ListObjects calls
- Batch operations when possible

**License**: UNLICENSED (private/proprietary)

### Regulatory Constraints

**Data Residency**:
- S3 region determines data location
- Multi-region support via S3 replication
- GDPR compliance via data deletion capabilities

## External Dependencies

### AWS Services

**Primary**:
- **S3** (required): Object storage, metadata storage
- **Credentials**: IAM roles, access keys, profiles

**Optional** (via plugins):
- **SQS**: Queue replication (QueueConsumerPlugin)
- **Lambda**: Cloud inventory (CloudInventoryPlugin)
- **EC2, RDS, etc.**: Cloud inventory scanning

**Required IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetObjectMetadata",
      "s3:CopyObject"
    ],
    "Resource": [
      "arn:aws:s3:::bucket-name",
      "arn:aws:s3:::bucket-name/*"
    ]
  }]
}
```

### Compatible Storage

**S3-Compatible**:
- AWS S3 (primary)
- MinIO (self-hosted)
- DigitalOcean Spaces
- Cloudflare R2
- Backblaze B2
- Wasabi

**Connection Strings**:
```javascript
// AWS S3
's3://KEY:SECRET@bucket?region=us-east-1'

// MinIO
'http://KEY:SECRET@localhost:9000/bucket'

// MemoryClient (testing)
'memory://bucket/path'
```

### Cloud Providers (via CloudInventoryPlugin)

**Supported**:
- AWS (20+ services)
- Google Cloud Platform (10+ services)
- Microsoft Azure (10+ services)
- Vultr
- Linode
- DigitalOcean
- Hetzner Cloud
- Oracle Cloud
- Alibaba Cloud

### Replication Targets (via ReplicatorPlugin)

**Databases**:
- PostgreSQL
- Google BigQuery (3 mutability modes)
- Turso/LibSQL
- PlanetScale

**Queues**:
- AWS SQS
- RabbitMQ (via amqplib)

### Model Context Protocol (MCP)

**MCP Server** (`mcp/entrypoint.js`):
- **Transports**: stdio (local), HTTP/SSE (remote)
- **Tools**: 41+ database operations
- **Docs**: Built-in documentation search

**Usage**:
```bash
# Local (Claude Desktop)
s3db-mcp --transport=stdio

# Remote (HTTP)
s3db-mcp --transport=sse --port=17500
```

---

**Last Updated**: 2025-11-06
**Maintainer**: @forattini-dev
**Repository**: https://github.com/forattini-dev/s3db.js
