import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import type {
  MCPResource,
  MCPResourceTemplate,
  MCPResourceContent,
} from './types/index.js';

import {
  plugins,
  fieldTypes,
  behaviors,
  clients,
  guides,
  exampleCategories,
  getPluginByName,
  getFieldTypeByName,
  getBehaviorByName,
  getClientByName,
  getGuideByTopic,
  getExamplesByCategory,
} from './docs-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../');
const DOCS_ROOT = join(PROJECT_ROOT, 'docs');

// =============================================================================
// Resource Templates
// =============================================================================

export const resourceTemplates: MCPResourceTemplate[] = [
  {
    uriTemplate: 's3db://core/{topic}',
    name: 'Core Documentation',
    description: 'Core s3db.js concepts: database, schema, resource, behaviors, partitions, encryption, security, streaming, events',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://client/{name}',
    name: 'Storage Client',
    description: 'Storage client documentation: s3, memory, filesystem',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://plugin/{name}',
    name: 'Plugin Documentation',
    description: 'Plugin documentation: cache, api, audit, ttl, vector, geo, replicator, metrics, backup, queue, etc.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://guide/{topic}',
    name: 'Guide',
    description: 'Usage guides: getting-started, performance, typescript, testing, multi-tenancy, security',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://example/{category}',
    name: 'Examples',
    description: 'Example code by category: crud, bulk, partitioning, caching, vector-rag, auth, streaming, hooks',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://reference/{topic}',
    name: 'Reference',
    description: 'Reference documentation: cli, mcp, errors, connection-strings',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://field-type/{type}',
    name: 'Field Type',
    description: 'Field type documentation: string, number, secret, embedding, ip4, object, array, etc.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://behavior/{name}',
    name: 'Behavior',
    description: 'Behavior documentation: body-overflow, body-only, truncate-data, enforce-limits, user-managed',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://resource/{name}',
    name: 'Database Resource',
    description: 'Live resource inspection: schema, attributes, partitions, behavior, configuration, and S3 paths. Requires active database connection.',
    mimeType: 'text/markdown',
  },
];

// =============================================================================
// Static Resources (always available)
// =============================================================================

export const staticResources: MCPResource[] = [
  {
    uri: 's3db://overview',
    name: 'S3DB Overview',
    description: 'Complete overview of s3db.js capabilities and architecture',
    mimeType: 'text/markdown',
  },
  {
    uri: 's3db://quick-reference',
    name: 'Quick Reference',
    description: 'Quick reference card for common operations',
    mimeType: 'text/markdown',
  },
  {
    uri: 's3db://api-summary',
    name: 'API Summary',
    description: 'Summary of all available methods and their signatures',
    mimeType: 'text/markdown',
  },
  {
    uri: 's3db://best-practices',
    name: 'Best Practices',
    description: 'Best practices for behaviors, partitions, update methods, pagination, caching, and cost optimization',
    mimeType: 'text/markdown',
  },
];

// =============================================================================
// URI Parsing
// =============================================================================

interface ParsedUri {
  scheme: string;
  type: string;
  name: string;
}

function parseResourceUri(uri: string): ParsedUri | null {
  const match = uri.match(/^(\w+):\/\/([^/]+)(?:\/(.+))?$/);
  if (!match) return null;

  return {
    scheme: match[1],
    type: match[2],
    name: match[3] || '',
  };
}

// =============================================================================
// Resource Handlers
// =============================================================================

export function readResource(uri: string, database?: any): MCPResourceContent | null {
  const parsed = parseResourceUri(uri);
  if (!parsed) return null;

  const { scheme, type, name } = parsed;
  if (scheme !== 's3db') return null;

  try {
    let text: string;

    switch (type) {
      case 'overview':
        text = generateOverview();
        break;

      case 'quick-reference':
        text = generateQuickReference();
        break;

      case 'api-summary':
        text = generateApiSummary();
        break;

      case 'best-practices':
        text = generateBestPractices();
        break;

      case 'core':
        text = readCoreDoc(name);
        break;

      case 'client':
        text = generateClientDoc(name);
        break;

      case 'plugin':
        text = generatePluginDoc(name);
        break;

      case 'guide':
        text = readGuideDoc(name);
        break;

      case 'example':
        text = generateExamplesDoc(name);
        break;

      case 'reference':
        text = readReferenceDoc(name);
        break;

      case 'field-type':
        text = generateFieldTypeDoc(name);
        break;

      case 'behavior':
        text = generateBehaviorDoc(name);
        break;

      case 'resource':
        text = generateResourceDoc(name, database);
        break;

      default:
        return null;
    }

    return {
      uri,
      mimeType: 'text/markdown',
      text,
    };
  } catch (err) {
    return null;
  }
}

// =============================================================================
// Content Generators
// =============================================================================

function generateOverview(): string {
  return `# S3DB.js Overview

Transform AWS S3 into a powerful document database with ORM-like interface.

## Key Features

- **Zero-cost storage**: Pay only for S3 usage
- **30+ field types**: With automatic encoding/compression
- **5 behavior strategies**: Handle the 2KB metadata limit
- **Partitioning**: O(1) queries instead of O(n) scans
- **Built-in encryption**: AES-256-GCM for secret fields, bcrypt/argon2id for passwords
- **26+ plugins**: Cache, API, Audit, TTL, Vector, Geo, etc.

## Core API

| Method | Description | Performance |
|--------|-------------|-------------|
| \`insert()\` | Insert document (atomic via ifNoneMatch) | Baseline |
| \`get()\` | Get by ID | Fastest (single S3 call) |
| \`update()\` | GET+PUT merge | Baseline |
| \`patch()\` | HEAD+COPY merge | **40-60% faster** than update |
| \`replace()\` | PUT only | **30-40% faster** than update |
| \`page()\` | Cursor or page-number pagination | Recommended for pagination |
| \`list()\` | List with limit/offset | O(n) or O(1) with partitions |
| \`query()\` | Query with filters | O(n) or O(1) with partitions |

## Connection Strings

\`\`\`
s3://KEY:SECRET@bucket?region=us-east-1     # AWS S3
http://KEY:SECRET@localhost:9000/bucket      # MinIO
memory://bucket/path                         # MemoryClient (testing)
file:///tmp/s3db                             # FileSystemClient (testing)
\`\`\`

## Quick Example

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@my-bucket?region=us-east-1',
  security: {                           // optional
    passphrase: process.env.ENCRYPTION_KEY,  // for secret fields
    pepper: process.env.PASSWORD_PEPPER,      // for password hashing
    bcrypt: { rounds: 12 },                   // password:bcrypt config
  },
});

await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    name: 'string|required',
    bio: 'string',
  },
  behavior: 'body-overflow',
  partitions: {
    byEmail: { fields: { email: 'string' } }
  }
});

await users.insert({ email: 'john@example.com', name: 'John Doe' });
const user = await users.get('user-id');
\`\`\`

## How to Learn

| What you need | Resource |
|---------------|----------|
| Security config (encryption, passwords, bcrypt, argon2) | \`s3db://core/security\` |
| Best practices & decision guides | \`s3db://best-practices\` |
| Plugin documentation (full README) | \`s3db://plugin/{name}\` (e.g., \`s3db://plugin/cache\`) |
| Usage guides | \`s3db://guide/{topic}\` (getting-started, performance, testing, security) |
| Field type reference | \`s3db://field-type/{type}\` (string, secret, embedding, ip4, etc.) |
| Behavior reference | \`s3db://behavior/{name}\` (body-overflow, body-only, enforce-limits) |
| Quick reference card | \`s3db://quick-reference\` |
| API signatures | \`s3db://api-summary\` |
| Search docs | \`s3dbSearchDocs\` tool |

## Decision Guide

**Which behavior?** Start with \`body-overflow\`. Use \`body-only\` for large docs, \`enforce-limits\` for strict schemas.

**Which update method?** \`patch()\` for partial updates (fastest), \`replace()\` for full replacement, \`update()\` when you need the merged result.

**Need partitions?** Yes, if >100 docs AND you filter by specific fields. Define partitions on those fields.

**Which pagination?** \`page()\` with cursor for sequential, \`page()\` with page number for random access. Avoid \`list()\` with large offsets.

## Plugin Categories

**Core** — Essential for most deployments:
- **CachePlugin**: Memory/filesystem cache to reduce S3 calls
- **CostsPlugin**: Track S3 API call costs
- **TTLPlugin**: Auto-cleanup expired documents (O(1) partition-based)
- **MetricsPlugin**: Prometheus-compatible metrics
- **AuditPlugin**: Track all data changes

**Data** — Advanced data capabilities:
- **VectorPlugin**: Vector embeddings + similarity search (AI/RAG)
- **FullTextPlugin**: Indexed text search with stemming
- **GraphPlugin**: Graph relationships and traversal
- **StateMachinePlugin**: State transitions with history
- **RelationPlugin**: Resource relationships (1:N, N:M)
- **TreePlugin**: Hierarchical data structures

**Integration** — Connect with external systems:
- **ApiPlugin**: REST API with OpenAPI docs, guards, rate limiting
- **ReplicatorPlugin**: Sync to PostgreSQL/BigQuery/SQS
- **WebSocketPlugin**: Real-time subscriptions
- **SMTPPlugin**: Send emails
- **IdentityPlugin**: Authentication (OAuth2, OIDC, API keys)

**Utility** — Operations and automation:
- **BackupPlugin**: Automated backups
- **S3QueuePlugin**: Distributed job queue
- **SchedulerPlugin**: Cron-like scheduling
- **QueueConsumerPlugin**: Process queue messages
- **ImporterPlugin**: Bulk data import

**Specialized** — Domain-specific:
- **SpiderPlugin**: Web crawling with hybrid HTTP/browser fetching
- **PuppeteerPlugin**: Browser automation
- **ReconPlugin**: OSINT and reconnaissance
- **CloudInventoryPlugin**: Cloud resource inventory
- **KubernetesInventoryPlugin**: K8s cluster inventory
- **TfStatePlugin**: Terraform state management
- **TournamentPlugin**: Tournament brackets and matchmaking
`;
}

function generateQuickReference(): string {
  return `# S3DB Quick Reference

## Connection

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@bucket?region=us-east-1',
  security: {                                    // optional
    passphrase: process.env.ENCRYPTION_KEY,      // for \`secret\` fields
    pepper: process.env.PASSWORD_PEPPER,          // for password hashing
    bcrypt: { rounds: 12 },                       // bcrypt config
    // argon2: { memoryCost: 65536, timeCost: 3 } // for password:argon2id
  },
});
await db.connect();
\`\`\`

## Security (see \`s3db://core/security\` for full reference)

| Config | Purpose | Used By |
|--------|---------|---------|
| \`security.passphrase\` | AES-256-GCM encryption key | \`secret\` fields |
| \`security.pepper\` | Extra entropy before hashing | \`password\` fields |
| \`security.bcrypt.rounds\` | Cost factor (default 12) | \`password\`, \`password:bcrypt\` |
| \`security.argon2.*\` | Memory-hard hash config | \`password:argon2id\` |

## Resource Creation

\`\`\`javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    name: 'string'
  },
  behavior: 'body-overflow',  // handle 2KB limit
  partitions: {
    byStatus: { fields: { status: 'string' } }
  }
});
\`\`\`

## CRUD Operations

\`\`\`javascript
// Create
const user = await users.insert({ email: 'john@example.com' });
const many = await users.insertMany([{ email: 'a@b.com' }, { email: 'c@d.com' }]);

// Read
const user = await users.get(id);
const batch = await users.getMany([id1, id2]);
const all = await users.list({ limit: 100 });
const ids = await users.listIds({ limit: 100 });
const everything = await users.getAll();

// Update
await users.update(id, { name: 'John' });  // GET+PUT merge (baseline)
await users.patch(id, { name: 'John' });   // HEAD+COPY merge (40-60% faster)
await users.replace(id, fullData);          // PUT only (30-40% faster)
await users.upsert({ id, name: 'John' });  // Insert or update

// Delete
await users.delete(id);
await users.deleteMany([id1, id2]);
await users.deleteAll();

// Query & Count
const active = await users.query({ status: 'active' });
const count = await users.count();
const exists = await users.exists(id);

// Pagination (cursor-based or page-number)
const page1 = await users.page({ size: 20 });
const page2 = await users.page({ size: 20, cursor: page1.nextCursor });
const pageN = await users.page({ size: 20, page: 3 });
\`\`\`

## Partitions (O(1) queries)

\`\`\`javascript
// Instead of O(n) query scan:
const active = await users.query({ status: 'active' }); // SLOW

// Use O(1) partition lookup:
const active = await users.listPartition('byStatus', { status: 'active' }); // FAST
\`\`\`

## Field Types

| Type | Example |
|------|---------|
| string | \`'string|required|min:3'\` |
| number | \`'number|min:0|max:100'\` |
| email | \`'email|required'\` |
| password | \`'password|required|min:8'\` (one-way hash) |
| secret | \`'secret'\` (encrypted, reversible) |
| embedding | \`'embedding:1536'\` (77% compression) |
| ip4/ip6 | \`'ip4'\` (44% compression) |
| object | \`{ nested: 'string' }\` |

## Behaviors (2KB limit)

| Behavior | Use Case |
|----------|----------|
| body-overflow | Default - small in metadata, large in body |
| body-only | Always in body (large docs) |
| enforce-limits | Fail if >2KB (strict schema) |
| truncate-data | Accept data loss (logs, previews) |
`;
}

function generateApiSummary(): string {
  return `# S3DB API Summary

## Database Class

\`\`\`typescript
class Database {
  constructor(options: DatabaseOptions)
  connect(): Promise<void>
  disconnect(): Promise<void>
  createResource(config: ResourceConfig): Promise<Resource>
  getResource(name: string): Resource
  use(plugin: Plugin): void
  isConnected(): boolean
}
\`\`\`

## Resource Class

\`\`\`typescript
class Resource {
  // Create
  insert(data: object): Promise<object>
  insertMany(items: object[]): Promise<object[]>

  // Read
  get(id: string): Promise<object | null>
  getMany(ids: string[]): Promise<object[]>
  getAll(): Promise<object[]>
  exists(id: string): Promise<boolean>

  // Update
  update(id: string, data: object): Promise<object>    // GET+PUT merge (baseline)
  patch(id: string, data: object): Promise<object>      // HEAD+COPY merge (40-60% faster)
  replace(id: string, data: object): Promise<object>    // PUT only (30-40% faster)
  upsert(data: object): Promise<object>

  // Delete
  delete(id: string): Promise<void>
  deleteMany(ids: string[]): Promise<void>
  deleteAll(): Promise<void>

  // Query
  list(options?: ListOptions): Promise<object[]>
  listIds(options?: ListOptions): Promise<string[]>
  page(options?: PageOptions): Promise<PageResult>
  query(filters: object, options?: QueryOptions): Promise<object[]>
  count(options?: CountOptions): Promise<number>

  // Partitions
  listPartition(name: string, values: object): Promise<object[]>
  getFromPartition(name: string, values: object, id: string): Promise<object>

  // Streaming
  stream(options?: StreamOptions): AsyncIterable<object>
  writeStream(): WritableStream

  // Hooks
  beforeInsert(hook: HookFn): void
  afterInsert(hook: HookFn): void
  beforeUpdate(hook: HookFn): void
  afterUpdate(hook: HookFn): void
  beforeDelete(hook: HookFn): void
  afterDelete(hook: HookFn): void
}
\`\`\`

## Options Types

\`\`\`typescript
interface ListOptions {
  limit?: number
  offset?: number
  partition?: string
  partitionValues?: Record<string, any>
}

interface PageOptions {
  size?: number          // Page size (default: 20)
  cursor?: string        // Cursor from previous result (for cursor-based)
  page?: number          // Page number, 1-based (for page-number)
  partition?: string
  partitionValues?: Record<string, any>
  skipCount?: boolean    // Skip total count for faster queries
}

interface PageResult {
  data: object[]
  nextCursor?: string    // Cursor for next page (null if last page)
  totalCount?: number    // Total documents (omitted if skipCount)
  pageSize: number
}

interface QueryOptions {
  limit?: number
  partition?: string
  partitionValues?: Record<string, any>
}

interface CountOptions {
  partition?: string
  partitionValues?: Record<string, any>
}

interface ResourceConfig {
  name: string
  attributes: Record<string, string | object>
  behavior?: 'body-overflow' | 'body-only' | 'enforce-limits' | 'truncate-data' | 'user-managed'
  partitions?: Record<string, PartitionConfig>
  timestamps?: boolean
  paranoid?: boolean  // soft delete
}

interface PartitionConfig {
  fields: Record<string, string>
}
\`\`\`
`;
}

function generateBestPractices(): string {
  return `# s3db.js Best Practices

## 1. Behavior Selection

S3 has a **2KB metadata limit**. Choose a behavior based on your data size:

| Behavior | When to Use | Trade-off |
|----------|-------------|-----------|
| \`body-overflow\` | **Default choice.** Most data fits in metadata, large docs overflow to body | Balanced — fast reads for small docs, works for all sizes |
| \`body-only\` | Documents always >2KB (blog posts, logs with details, JSON blobs) | Always uses GET (body read), slightly slower for small docs |
| \`enforce-limits\` | Production schemas where you KNOW data is <2KB | Rejects oversized data — safest for strict schemas |
| \`truncate-data\` | Logs, previews, analytics where data loss is acceptable | **DATA LOSS** — truncates to fit 2KB |
| \`user-managed\` | Custom handling via events | You handle overflow yourself |

**Rule of thumb:** Start with \`body-overflow\`. Switch to \`body-only\` if most documents are >2KB. Use \`enforce-limits\` in production for small, fixed schemas.

## 2. Partitions (Critical for Performance)

Without partitions, **every query scans ALL objects** — O(n). With partitions, queries become O(1).

**When to create partitions:**
- Resource will have >100 documents
- You filter by specific fields (\`status\`, \`type\`, \`userId\`, \`category\`)
- You need fast lookups on non-ID fields

**How to design partitions:**
\`\`\`javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    status: 'string|required',
    customerId: 'string|required',
    total: 'number',
  },
  partitions: {
    byStatus: { fields: { status: 'string' } },         // "pending", "shipped", "delivered"
    byCustomer: { fields: { customerId: 'string' } },    // Per-customer lookup
  },
  behavior: 'body-overflow',
});

// O(1) instead of O(n):
const pending = await orders.list({ partition: 'byStatus', partitionValues: { status: 'pending' } });
\`\`\`

**Composite partitions** for multi-field filtering:
\`\`\`javascript
partitions: {
  byStatusAndCustomer: { fields: { status: 'string', customerId: 'string' } }
}
\`\`\`

## 3. Update Methods

| Method | Mechanism | Speed | Use When |
|--------|-----------|-------|----------|
| \`patch(id, data)\` | HEAD + COPY | **40-60% faster** | Partial updates (change 1-2 fields) |
| \`update(id, data)\` | GET + PUT | Baseline | Need the full merged document back |
| \`replace(id, data)\` | PUT only | **30-40% faster** | Full document replacement (you have all fields) |

**Rule of thumb:** Use \`patch()\` for partial updates, \`replace()\` when you have the complete document, \`update()\` when you need the merged result.

## 4. Pagination

\`\`\`javascript
// GOOD: Cursor-based pagination (efficient, consistent)
const page1 = await resource.page({ size: 20 });
const page2 = await resource.page({ size: 20, cursor: page1.nextCursor });

// GOOD: Page-number pagination (random access)
const page3 = await resource.page({ size: 20, page: 3 });

// AVOID: list() with offset for large datasets (scans all objects)
const items = await resource.list({ limit: 20, offset: 100 }); // Slow on large datasets
\`\`\`

## 5. ID Strategies

\`\`\`javascript
// UUID (default) — universally unique, no coordination needed
idGenerator: 'uuid'

// Incremental — human-readable, sequential
idGenerator: 'incremental'           // 1, 2, 3...
idGenerator: 'incremental:1000'      // Start at 1000
idGenerator: 'incremental:ORD-0001'  // Prefixed: ORD-0001, ORD-0002...
idGenerator: 'incremental:fast'      // Batch mode (~1ms/ID)

// Custom ID — use email, slug, etc. as ID for O(1) lookups
await users.insert({ id: 'daniel@tetis.io', name: 'Daniel' });
await users.get('daniel@tetis.io'); // O(1) direct lookup
\`\`\`

## 6. Caching

Use \`CachePlugin\` in production to reduce S3 API calls and costs:
\`\`\`javascript
import { CachePlugin } from 's3db.js';

db.use(new CachePlugin({
  driver: 'memory',         // or FilesystemCache for persistence
  memoryOptions: {
    maxSize: 1000,          // Max items in cache
    ttl: 300000,            // 5 minutes TTL
  },
  includePartitions: true,  // Cache partition lookups too
}));
\`\`\`

## 7. Cost Optimization

- Use \`CostsPlugin\` to track S3 API call costs
- \`patch()\` over \`update()\` saves 1 GET per update (HEAD is cheaper)
- Partitions avoid full scans (1 LIST vs N GETs)
- Cache frequently accessed data
- Use \`page()\` with \`skipCount: true\` when total count is not needed

## 8. Testing

| Client | Use Case | Notes |
|--------|----------|-------|
| \`FileSystemClient\` | **Default for tests** | Safe parallelism, isolated directories |
| \`MemoryClient\` | Single-file tests only | RAM explosion risk with many objects |
| \`S3Client\` | Integration tests | Real S3/MinIO connection |

\`\`\`javascript
// Test with FileSystemClient
const db = new Database({ connectionString: 'file:///tmp/test-db' });

// Test with MemoryClient (single test only)
const db = new Database({ connectionString: 'memory://test-bucket' });
\`\`\`

## 9. Schema Design

- \`secret\` fields are AES-256-GCM encrypted at rest
- \`embedding:N\` fields get 77% compression (for AI vectors)
- Nested objects auto-detect: \`profile: { bio: 'string', age: 'number' }\`
- Use \`|required\` for mandatory fields: \`email: 'email|required'\`
- Use \`|default:value\` for defaults: \`active: 'bool|default:true'\`

## 10. Hooks for Common Patterns

\`\`\`javascript
// Auto-timestamps
resource.beforeInsert(async (data) => {
  data.createdAt = new Date().toISOString();
  return data;
});

resource.beforeUpdate(async (data) => {
  data.updatedAt = new Date().toISOString();
  return data;
});

// Or use timestamps: true in resource config (automatic)
\`\`\`
`;
}

function readCoreDoc(topic: string): string {
  const topicMap: Record<string, string> = {
    database: 'core/database.md',
    schema: 'schema.md',
    resource: 'core/resource.md',
    behaviors: 'core/behaviors.md',
    partitions: 'core/partitions.md',
    encryption: 'core/encryption.md',
    streaming: 'core/streaming.md',
    events: 'core/events.md',
    hooks: 'core/events.md',
    security: '__generated__',
  };

  const filePath = topicMap[topic];
  if (!filePath) {
    const availableTopics = Object.keys(topicMap).join(', ');
    return `# Core: ${topic}\n\nTopic not found. Available topics: ${availableTopics}`;
  }

  if (filePath === '__generated__') {
    return generateCoreFallback(topic);
  }

  try {
    return readFileSync(join(DOCS_ROOT, filePath), 'utf-8');
  } catch {
    return generateCoreFallback(topic);
  }
}

function generateCoreFallback(topic: string): string {
  const fallbacks: Record<string, string> = {
    database: `# Database

The Database class is the main entry point for s3db.js.

## Constructor Options

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@bucket?region=us-east-1',
  verbose: false,              // Enable debug logging
  parallelism: 10,             // Max parallel S3 operations
  versioningEnabled: false,    // Enable resource versioning
  security: {                  // See s3db://core/security for full reference
    passphrase: 'string',      // AES-256-GCM key for \`secret\` fields
    pepper: 'string',          // Extra entropy for password hashing
    bcrypt: { rounds: 12 },    // Bcrypt cost factor (min 12, max 31)
    argon2: {                  // Argon2id config (GPU-resistant)
      memoryCost: 65536,       // Memory in KiB (power of 2)
      timeCost: 3,             // Iterations
      parallelism: 4,          // Threads
    },
  },
  plugins: [],                 // Array of plugin instances
});

await db.connect();
\`\`\`

## Creating Resources

\`\`\`javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    name: 'string',
    password: 'password|required|min:8',  // auto-hashed via security config
    apiKey: 'secret',                      // auto-encrypted via security.passphrase
  },
  behavior: 'body-overflow',
  partitions: {
    byEmail: { fields: { email: 'string' } },
  },
});
\`\`\`

## Using Plugins

\`\`\`javascript
import { CachePlugin } from 's3db.js';

db.use(new CachePlugin({ driver: 'memory' }));
\`\`\`

## Related

- \`s3db://core/security\` — Full security configuration reference
- \`s3db://best-practices\` — Behaviors, partitions, performance guide
`,
    behaviors: `# Behaviors

S3 has a hard 2KB limit for user-defined metadata. Behaviors define how s3db.js handles this limit.

## Available Behaviors

| Behavior | Description |
|----------|-------------|
| \`body-overflow\` | **Default.** Tries metadata first, overflows to body if >2KB |
| \`body-only\` | Always stores in body. No size limit. |
| \`enforce-limits\` | Throws error if >2KB. Guarantees metadata-only. |
| \`truncate-data\` | Truncates data >2KB. DATA LOSS. |
| \`user-managed\` | No checking. You handle it. |

## Usage

\`\`\`javascript
const resource = await db.createResource({
  name: 'logs',
  attributes: { message: 'string' },
  behavior: 'truncate-data',  // Accept data loss for logs
});
\`\`\`
`,
    partitions: `# Partitions

S3 has no indexes. Without partitions, every query scans ALL objects (O(n)).
With partitions, queries become O(1) lookups.

## How It Works

Partitions create additional S3 keys as "pointers" to records.

## Creating Partitions

\`\`\`javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    status: 'string',
    customerId: 'string',
  },
  partitions: {
    byStatus: { fields: { status: 'string' } },
    byCustomer: { fields: { customerId: 'string' } },
  },
});
\`\`\`

## Using Partitions

\`\`\`javascript
// O(1) lookup instead of O(n) scan
const pending = await orders.listPartition('byStatus', { status: 'pending' });
const customerOrders = await orders.listPartition('byCustomer', { customerId: 'cust-123' });
\`\`\`
`,
    security: `# Security Configuration

All security options are consolidated under the \`security\` sub-object in the Database constructor (or per-resource override).

## SecurityConfig Interface

\`\`\`typescript
interface SecurityConfig {
  passphrase?: string;    // AES-256-GCM encryption key for \`secret\` fields
  pepper?: string;        // Extra string appended to passwords before hashing
  bcrypt?: {
    rounds?: number;      // Cost factor (min 12, max 31, default 12)
  };
  argon2?: {
    memoryCost?: number;  // Memory in KiB (must be power of 2, default 65536 = 64MB)
    timeCost?: number;    // Iterations (default 3)
    parallelism?: number; // Threads (default 4)
  };
}
\`\`\`

## Usage in Database Constructor

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@bucket',
  security: {
    passphrase: process.env.ENCRYPTION_KEY,  // for \`secret\` field encryption
    pepper: process.env.PASSWORD_PEPPER,      // for password hashing
    bcrypt: { rounds: 12 },                   // bcrypt cost factor
    argon2: {                                 // argon2id config (if using password:argon2id)
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    },
  },
});
\`\`\`

## Per-Resource Override

Resources can partially override the database security config via deep merge:

\`\`\`javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    password: 'password:argon2id|required|min:8',
    apiKey: 'secret',
  },
  security: {
    // Overrides only argon2 config; inherits passphrase, pepper, bcrypt from database
    argon2: { memoryCost: 131072 },
  },
});
\`\`\`

## Field Types That Use Security Config

| Field Type | Uses | Config Key |
|------------|------|------------|
| \`secret\` | AES-256-GCM encryption (reversible) | \`security.passphrase\` |
| \`password\` | Bcrypt hash (one-way, default) | \`security.pepper\`, \`security.bcrypt.rounds\` |
| \`password:bcrypt\` | Explicit bcrypt hash | \`security.pepper\`, \`security.bcrypt.rounds\` |
| \`password:argon2id\` | Argon2id hash (GPU-resistant) | \`security.pepper\`, \`security.argon2.*\` |

## How Each Config Key Works

### passphrase
Encryption key for \`secret\` fields. Used with PBKDF2 to derive an AES-256-GCM key.
- Auto-encrypts on write, auto-decrypts on read
- Required if any field uses the \`secret\` type
- Default: \`'secret'\` (change in production!)

### pepper
Extra string appended to passwords before hashing. Adds a server-side secret that isn't stored in the database.
- Applied to both \`password\` and \`password:argon2id\` types
- If set, \`verifyPassword()\` also needs the same pepper

### bcrypt
Controls bcrypt hashing for \`password\` and \`password:bcrypt\` fields.
- \`rounds\`: Cost factor (default 12). Each +1 doubles computation time.
- Hashes stored in compact base62 format (56 chars instead of standard 60)

### argon2
Controls argon2id hashing for \`password:argon2id\` fields. Memory-hard, GPU-resistant.
- \`memoryCost\`: Memory in KiB (default 65536 = 64MB). Must be power of 2.
- \`timeCost\`: Number of iterations (default 3)
- \`parallelism\`: Degree of parallelism (default 4)
- Hashes stored in compact base62 format (~76 chars instead of standard 97)
- Requires \`argon2\` npm package as peer dependency

## Verifying Passwords

\`\`\`javascript
import { verifyPassword } from 's3db.js';

const user = await users.get(userId);
const isValid = await verifyPassword('user-input', user.password);
\`\`\`

## MCP Server Configuration

Via environment variables:
\`\`\`
S3DB_SECURITY_PASSPHRASE=your-encryption-key
S3DB_SECURITY_PEPPER=your-pepper
S3DB_SECURITY_BCRYPT_ROUNDS=12
S3DB_SECURITY_ARGON2=true
S3DB_SECURITY_ARGON2_MEMORY_COST=65536
S3DB_SECURITY_ARGON2_TIME_COST=3
S3DB_SECURITY_ARGON2_PARALLELISM=4
\`\`\`

Or via config file (\`s3db.config.json\`):
\`\`\`json
{
  "security": {
    "passphrase": "your-encryption-key",
    "pepper": "your-pepper",
    "bcrypt": { "rounds": 12 },
    "argon2": { "memoryCost": 65536, "timeCost": 3, "parallelism": 4 }
  }
}
\`\`\`

## Related Resources

- \`s3db://core/encryption\` — AES-256-GCM encryption details for \`secret\` fields
- \`s3db://field-type/password\` — Password field type reference
- \`s3db://field-type/secret\` — Secret field type reference
- \`s3db://guide/security\` — Security best practices guide
`,
  };

  return fallbacks[topic] || `# Core: ${topic}\n\nDocumentation for this topic is not yet available.`;
}

function generateClientDoc(name: string): string {
  const client = getClientByName(name);
  if (!client) {
    const availableClients = clients.map(c => c.name.replace('Client', '').toLowerCase()).join(', ');
    return `# Client: ${name}\n\nClient not found. Available clients: ${availableClients}`;
  }

  return `# ${client.name}

${client.description}

## Connection String

\`\`\`
${client.connectionString}
\`\`\`

## Use Case

${client.useCase}

## Performance

${client.performance}

## Dependencies

${client.dependencies.length > 0 ? client.dependencies.map(d => `- \`${d}\``).join('\n') : 'None (zero dependencies)'}

## Example

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: '${client.connectionString}'
});

await db.connect();
\`\`\`
`;
}

const PLUGIN_DIR_MAP: Record<string, string> = {
  cache: 'cache',
  api: 'api',
  audit: 'audit',
  ttl: 'ttl',
  vector: 'vector',
  geo: 'geo',
  replicator: 'replicator',
  metrics: 'metrics',
  backup: 'backup',
  scheduler: 'scheduler',
  fulltext: 'fulltext',
  s3queue: 's3-queue',
  queue: 's3-queue',
  eventualconsistency: 'eventual-consistency',
  websocket: 'websocket',
  graph: 'graph',
  statemachine: 'state-machine',
  ml: 'ml',
  puppeteer: 'puppeteer',
  spider: 'spider',
  costs: 'costs',
  smtp: 'smtp',
  cloudinventory: 'cloud-inventory',
  kubernetesinventory: 'kubernetes-inventory',
  identity: 'identity',
  tree: 'tree',
  coordinator: 'coordinator',
  tournament: 'tournament',
  cookiefarm: 'cookie-farm',
  queueconsumer: 'queue-consumer',
  importer: 'importer',
  tfstate: 'tfstate',
  recon: 'recon',
  relation: 'relation',
};

function resolvePluginDir(name: string): string | null {
  const normalized = name.toLowerCase().replace(/plugin$/i, '').replace(/[-_\s]/g, '');
  return PLUGIN_DIR_MAP[normalized] || null;
}

function generatePluginDoc(name: string): string {
  const plugin = getPluginByName(name);
  if (!plugin) {
    const availablePlugins = plugins.map(p => p.name.replace('Plugin', '').toLowerCase()).join(', ');
    return `# Plugin: ${name}\n\nPlugin not found. Available plugins: ${availablePlugins}`;
  }

  const dirName = resolvePluginDir(name);
  if (dirName) {
    const readmePath = join(DOCS_ROOT, 'plugins', dirName, 'README.md');
    if (existsSync(readmePath)) {
      try {
        return readFileSync(readmePath, 'utf-8');
      } catch {
        // Fall through to generated stub
      }
    }
  }

  const configTable = plugin.configOptions.length > 0
    ? `## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
${plugin.configOptions.map(o => `| \`${o.name}\` | \`${o.type}\` | ${o.required ? 'Yes' : 'No'} | ${o.default || '-'} | ${o.description} |`).join('\n')}
`
    : '';

  const methodsSection = plugin.methods.length > 0
    ? `## Methods

${plugin.methods.map(m => `### \`${m.name}\`

\`\`\`typescript
${m.signature}
\`\`\`

${m.description}
`).join('\n')}
`
    : '';

  return `# ${plugin.name}

**Category:** ${plugin.category}

${plugin.description}

${configTable}

## Basic Usage

\`\`\`javascript
import { Database } from 's3db.js';
import { ${plugin.name} } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
db.use(new ${plugin.name}({
  // configuration options here
}));

await db.connect();
\`\`\`

${methodsSection}

## Examples

${plugin.examples.length > 0 ? plugin.examples.map(e => `- \`docs/examples/${e}\``).join('\n') : 'No examples available.'}

## Related Plugins

${plugin.relatedPlugins && plugin.relatedPlugins.length > 0 ? plugin.relatedPlugins.map(p => `- ${p}`).join('\n') : 'None'}
`;
}

function readGuideDoc(topic: string): string {
  const guide = getGuideByTopic(topic);
  if (!guide) {
    const availableGuides = guides.map(g => g.topic).join(', ');
    return `# Guide: ${topic}\n\nGuide not found. Available guides: ${availableGuides}`;
  }

  const topicMap: Record<string, string> = {
    'getting-started': 'README.md',
    'performance-tuning': 'guides/performance-tuning.md',
    typescript: 'guides/typescript.md',
    testing: 'guides/testing.md',
    'multi-tenancy': 'guides/multi-tenancy.md',
    security: 'guides/security-best-practices.md',
  };

  const filePath = topicMap[topic];
  if (filePath) {
    try {
      return readFileSync(join(DOCS_ROOT, filePath), 'utf-8');
    } catch {
      // Fall through to generated content
    }
  }

  return `# ${guide.title}

${guide.description}

## Sections

${guide.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
}

function generateExamplesDoc(category: string): string {
  const examples = getExamplesByCategory(category);
  if (examples.length === 0) {
    const availableCategories = Object.keys(exampleCategories).join(', ');
    return `# Examples: ${category}\n\nCategory not found. Available categories: ${availableCategories}`;
  }

  return `# Examples: ${category}

## Available Examples

${examples.map(e => `- \`docs/examples/${e}\``).join('\n')}

## Usage

All examples are in \`docs/examples/\` directory and can be run with:

\`\`\`bash
node docs/examples/${examples[0]}
\`\`\`

## Category Description

${getCategoryDescription(category)}
`;
}

function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    crud: 'Basic CRUD operations: insert, get, update, delete, list, query.',
    bulk: 'Bulk operations for high-throughput data processing.',
    partitioning: 'Partitioning strategies for O(1) query performance.',
    caching: 'Caching patterns to reduce S3 API calls and costs.',
    'vector-rag': 'Vector embeddings and RAG (Retrieval Augmented Generation) for AI applications.',
    auth: 'Authentication patterns with JWT, Basic Auth, OIDC.',
    streaming: 'Streaming large datasets for memory-efficient processing.',
    hooks: 'Lifecycle hooks for validation, timestamps, versioning.',
    replication: 'Data replication to PostgreSQL, BigQuery, SQS.',
    testing: 'Testing patterns with MemoryClient and FilesystemClient.',
  };

  return descriptions[category] || 'Examples for this category.';
}

function readReferenceDoc(topic: string): string {
  const topicMap: Record<string, string> = {
    cli: 'reference/cli.md',
    mcp: 'mcp.md',
    errors: 'reference/errors.md',
    'connection-strings': 'reference/connection-strings.md',
  };

  const filePath = topicMap[topic];
  if (!filePath) {
    const availableTopics = Object.keys(topicMap).join(', ');
    return `# Reference: ${topic}\n\nTopic not found. Available topics: ${availableTopics}`;
  }

  try {
    return readFileSync(join(DOCS_ROOT, filePath), 'utf-8');
  } catch {
    return `# Reference: ${topic}\n\nDocumentation file not found: ${filePath}`;
  }
}

function generateFieldTypeDoc(type: string): string {
  const fieldType = getFieldTypeByName(type);
  if (!fieldType) {
    const availableTypes = fieldTypes.map(f => f.name).join(', ');
    return `# Field Type: ${type}\n\nType not found. Available types: ${availableTypes}`;
  }

  return `# Field Type: ${fieldType.name}

## Syntax

\`\`\`
${fieldType.syntax}
\`\`\`

## Compression

${fieldType.compression}

## Description

${fieldType.description}

## Examples

\`\`\`javascript
const resource = await db.createResource({
  name: 'example',
  attributes: {
    ${fieldType.examples.join(',\n    ')}
  }
});
\`\`\`

## Available Validators

${fieldType.validators.length > 0 ? fieldType.validators.map(v => `- \`${v}\``).join('\n') : 'None'}
`;
}

function generateBehaviorDoc(name: string): string {
  const behavior = getBehaviorByName(name);
  if (!behavior) {
    const availableBehaviors = behaviors.map(b => b.name).join(', ');
    return `# Behavior: ${name}\n\nBehavior not found. Available behaviors: ${availableBehaviors}`;
  }

  return `# Behavior: ${behavior.name}

## Overview

| Property | Value |
|----------|-------|
| Safety | ${behavior.safety} |
| Performance | ${behavior.performance} |
| Data Integrity | ${behavior.dataIntegrity} |
| Use Case | ${behavior.useCase} |

## Description

${behavior.description}

## Example

\`\`\`javascript
const resource = await db.createResource({
  name: 'items',
  attributes: { data: 'any' },
  ${behavior.example}
});
\`\`\`

## When to Use

${behavior.useCase}

## Comparison with Other Behaviors

${behaviors.filter(b => b.name !== behavior.name).map(b => `- **${b.name}**: ${b.useCase}`).join('\n')}
`;
}

// =============================================================================
// Resource Inspection (live database)
// =============================================================================

function generateResourceDoc(name: string, database?: any): string {
  if (!database || !database.isConnected()) {
    return `# Resource: ${name}\n\nDatabase not connected. Set S3DB_CONNECTION_STRING env var for auto-connect, or use \`dbConnect\` tool.`;
  }

  const resource = database.resources?.[name];
  if (!resource) {
    const available = Object.keys(database.resources || {});
    return `# Resource: ${name}\n\nResource not found. Available resources: ${available.length > 0 ? available.join(', ') : '(none)'}`;
  }

  const attributes = resource.attributes || {};
  const partitions = resource.config?.partitions || {};
  const behavior = resource.behavior || 'user-managed';
  const version = resource.version || 'v1';

  const attrLines = Object.entries(attributes).map(([field, def]) => {
    const type = typeof def === 'string' ? def : (typeof def === 'object' && def !== null ? JSON.stringify(def) : String(def));
    return `| \`${field}\` | \`${type}\` |`;
  });

  const partitionLines = Object.entries(partitions).map(([pName, pDef]: [string, any]) => {
    const fields = pDef?.fields ? Object.entries(pDef.fields).map(([f, r]) => `${f} (${r})`).join(', ') : '';
    return `| \`${pName}\` | ${fields} |`;
  });

  const config = resource.config || {};

  return `# Resource: ${name}

## Schema

| Field | Type |
|-------|------|
${attrLines.join('\n')}

## Configuration

| Property | Value |
|----------|-------|
| **Behavior** | \`${behavior}\` |
| **Version** | \`${version}\` |
| **Timestamps** | \`${config.timestamps || false}\` |
| **Paranoid** | \`${config.paranoid !== undefined ? config.paranoid : true}\` |
| **Strict Validation** | \`${resource.strictValidation || false}\` |
| **Auto Decrypt** | \`${config.autoDecrypt !== undefined ? config.autoDecrypt : true}\` |
| **Async Partitions** | \`${config.asyncPartitions !== undefined ? config.asyncPartitions : true}\` |

${partitionLines.length > 0 ? `## Partitions

| Partition | Fields |
|-----------|--------|
${partitionLines.join('\n')}
` : '## Partitions\n\nNo partitions defined.'}

## S3 Paths

- **Data prefix**: \`${database.keyPrefix || ''}resource=${name}/data/\`
- **Partition prefix**: \`${database.keyPrefix || ''}resource=${name}/partition=\`

## Usage Examples

\`\`\`javascript
// Get by ID
const item = await ${name}.get('some-id');

// Insert
const created = await ${name}.insert({ ${Object.keys(attributes).slice(0, 3).map(k => `${k}: ...`).join(', ')} });

// List
const items = await ${name}.list({ limit: 100 });

// Query
const results = await ${name}.query({ ${Object.keys(attributes)[0] || 'field'}: 'value' });
${partitionLines.length > 0 ? `
// Partition query (O(1))
const partitioned = await ${name}.list({
  partition: '${Object.keys(partitions)[0]}',
  partitionValues: { ${Object.keys((Object.values(partitions)[0] as any)?.fields || {})[0] || 'field'}: 'value' }
});` : ''}
\`\`\`
`;
}

// =============================================================================
// List Resources
// =============================================================================

export function listResources(): MCPResource[] {
  // Return static resources plus dynamically generated ones
  const dynamicResources: MCPResource[] = [];

  // Add all plugins as resources
  plugins.forEach((plugin) => {
    dynamicResources.push({
      uri: `s3db://plugin/${plugin.name.replace('Plugin', '').toLowerCase()}`,
      name: plugin.name,
      description: plugin.description,
      mimeType: 'text/markdown',
    });
  });

  // Add all field types as resources
  fieldTypes.forEach((ft) => {
    dynamicResources.push({
      uri: `s3db://field-type/${ft.name}`,
      name: `Field Type: ${ft.name}`,
      description: ft.description,
      mimeType: 'text/markdown',
    });
  });

  // Add all behaviors as resources
  behaviors.forEach((b) => {
    dynamicResources.push({
      uri: `s3db://behavior/${b.name}`,
      name: `Behavior: ${b.name}`,
      description: b.useCase,
      mimeType: 'text/markdown',
    });
  });

  // Add all clients as resources
  clients.forEach((c) => {
    dynamicResources.push({
      uri: `s3db://client/${c.name.replace('Client', '').toLowerCase()}`,
      name: c.name,
      description: c.description,
      mimeType: 'text/markdown',
    });
  });

  // Add all guides as resources
  guides.forEach((g) => {
    dynamicResources.push({
      uri: `s3db://guide/${g.topic}`,
      name: g.title,
      description: g.description,
      mimeType: 'text/markdown',
    });
  });

  return [...staticResources, ...dynamicResources];
}

export default {
  resourceTemplates,
  staticResources,
  readResource,
  listResources,
};
