# 🗃️ s3db.js

<p align="center">
  <img width="200" src="https://img.icons8.com/fluency/200/database.png" alt="s3db.js">
</p>

<p align="center">
  <strong>Transform AWS S3 into a powerful document database</strong><br>
  <em>Cost-effective storage • Automatic encryption • ORM-like interface • Streaming API</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/s3db.js"><img src="https://img.shields.io/npm/v/s3db.js.svg?style=flat&color=brightgreen" alt="npm version"></a>
  &nbsp;
  <a href="https://github.com/forattini-dev/s3db.js"><img src="https://img.shields.io/github/stars/forattini-dev/s3db.js?style=flat&color=yellow" alt="GitHub stars"></a>
  &nbsp;
  <a href="https://github.com/forattini-dev/s3db.js/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Unlicense-blue.svg?style=flat" alt="License"></a>
  &nbsp;
  <a href="https://api.codeclimate.com/v1/badges/26e3dc46c42367d44f18/maintainability"><img src="https://api.codeclimate.com/v1/badges/26e3dc46c42367d44f18/maintainability" alt="Maintainability"></a>
  &nbsp;
  <a href="https://coveralls.io/github/forattini-dev/s3db.js?branch=main"><img src="https://coveralls.io/repos/github/forattini-dev/s3db.js/badge.svg?branch=main&style=flat" alt="Coverage Status"></a>
</p>

<p align="center">
  <a href="https://github.com/forattini-dev/s3db.js"><img src="https://img.shields.io/badge/Built_with-Node.js-339933.svg?style=flat&logo=node.js" alt="Built with Node.js"></a>
  &nbsp;
  <a href="https://aws.amazon.com/s3/"><img src="https://img.shields.io/badge/Powered_by-AWS_S3-FF9900.svg?style=flat&logo=amazon-aws" alt="Powered by AWS S3"></a>
  &nbsp;
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Runtime-Node.js-339933.svg?style=flat&logo=node.js" alt="Node.js Runtime"></a>
</p>

<br>

## 🚀 What is s3db.js?

**s3db.js** is a document database that transforms AWS S3 into a fully functional database using S3's metadata capabilities. Instead of traditional storage methods, it stores document data in S3's metadata fields (up to 2KB), making it highly cost-effective while providing a familiar ORM-like interface.

**Perfect for:**
- 🌐 **Serverless applications** - No database servers to manage
- 💰 **Cost-conscious projects** - Pay only for what you use
- 🔒 **Secure applications** - Built-in encryption and validation
- 📊 **Analytics platforms** - Efficient data streaming and processing
- 🚀 **Rapid prototyping** - Get started in minutes, not hours

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 🎯 **Database Operations**
- **ORM-like Interface** - Familiar CRUD operations
- **Schema Validation** - Automatic data validation
- **Streaming API** - Handle large datasets efficiently
- **Event System** - Real-time notifications

</td>
<td width="50%">

### 🔐 **Security & Performance**
- **Field-level Encryption** - Secure sensitive data
- **Intelligent Caching** - Reduce API calls
- **Auto-generated Passwords** - Secure by default
- **Cost Tracking** - Monitor AWS expenses

</td>
</tr>
<tr>
<td width="50%">

### 📦 **Data Management**
- **Partitions** - Organize data efficiently
- **Bulk Operations** - Handle multiple records
- **Nested Objects** - Complex data structures
- **Automatic Timestamps** - Track changes

</td>
<td width="50%">

### 🔧 **Extensibility**
- **Custom Behaviors** - Handle large documents
- **Hooks System** - Custom business logic
- **Plugin Architecture** - Extend functionality
- **Event System** - Real-time notifications

</td>
</tr>
</table>

---

## 📋 Table of Contents

- [🚀 What is s3db.js?](#-what-is-s3dbjs)
- [✨ Key Features](#-key-features)
- [🚀 Quick Start](#-quick-start)
- [💾 Installation](#-installation)
- [🗄️ Database](#️-database)
- [📋 Resources](#-resources)
- [🔌 Plugins](#-plugins)
- [🤖 MCP & Integrations](#-mcp--integrations)
- [🔧 CLI](#-cli)
- [📖 Documentation](#-documentation)

---

## 🚀 Quick Start

Get up and running in less than 5 minutes!

### 1. Install s3db.js

```bash
npm install s3db.js
```

### 2. Connect to your S3 database

```javascript
import { S3db } from "s3db.js";

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await s3db.connect();
console.log("🎉 Connected to S3 database!");
```

> **⚡ Performance Tip:** s3db.js comes with optimized HTTP client settings by default for excellent S3 performance. The default configuration includes keep-alive enabled, balanced connection pooling, and appropriate timeouts for most applications.

> **ℹ️ Note:** You do **not** need to provide `ACCESS_KEY` and `SECRET_KEY` in the connection string if your environment already has S3 permissions (e.g., via IAM Role on EKS, EC2, Lambda, or other compatible clouds). s3db.js will use the default AWS credential provider chain, so credentials can be omitted for role-based or environment-based authentication. This also applies to S3-compatible clouds (MinIO, DigitalOcean Spaces, etc.) if they support such mechanisms.

---

### 3. Create your first resource

Schema validation powered by **[fastest-validator](https://github.com/icebob/fastest-validator)** ⚡

```javascript
const users = await s3db.createResource({
  name: "users",
  attributes: {
    name: "string|min:2|max:100",
    email: "email|unique",
    age: "number|integer|positive",
    isActive: "boolean"
  },
  timestamps: true
});
```

### 4. Start storing data

```javascript
// Insert a user
const user = await users.insert({
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  isActive: true,
  createdAt: new Date()
});

// Query the user
const foundUser = await users.get(user.id);
console.log(`Hello, ${foundUser.name}! 👋`);

// Update the user
await users.update(user.id, { age: 31 });

// List all users
const allUsers = await users.list();
console.log(`Total users: ${allUsers.length}`);
```

**That's it!** You now have a fully functional document database running on AWS S3. 🎉

### 5. Add plugins for a better experience (Optional)

Enhance your database with powerful plugins for production-ready features:

```javascript
import { S3db, TTLPlugin, RelationPlugin, ReplicatorPlugin, CachePlugin } from "s3db.js";

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [
    // Auto-cleanup expired records (no cron jobs needed!)
    new TTLPlugin({
      resources: {
        sessions: { ttl: 86400, onExpire: 'soft-delete' }  // 24h
      }
    }),

    // ORM-like relationships with 10-100x faster queries
    new RelationPlugin({
      relations: {
        users: {
          posts: { type: 'hasMany', resource: 'posts', foreignKey: 'userId' }
        }
      }
    }),

    // Real-time replication to BigQuery, PostgreSQL, etc.
    new ReplicatorPlugin({
      replicators: [{
        driver: 'bigquery',
        config: { projectId: 'my-project', datasetId: 'analytics' },
        resources: { users: 'users_table', posts: 'posts_table' }
      }]
    }),

    // Cache frequently accessed data (memory, S3, or filesystem)
    new CachePlugin({
      driver: 'memory',
      ttl: 300000  // 5 minutes
    })
  ]
});
```

**Learn more** about available plugins and their features in the [Plugin Documentation](docs/plugins/README.md).

---

## 💾 Installation

### Package Manager

```bash
# npm
npm install s3db.js
# pnpm
pnpm add s3db.js
# yarn
yarn add s3db.js
```

### 📦 Optional Dependencies

Some features require additional dependencies to be installed manually:

#### Replicator Dependencies

If you plan to use the replicator system with external services, install the corresponding dependencies:

```bash
# For SQS replicator (AWS SQS queues)
npm install @aws-sdk/client-sqs

# For BigQuery replicator (Google BigQuery)
npm install @google-cloud/bigquery

# For PostgreSQL replicator (PostgreSQL databases)
npm install pg
```

**Why manual installation?** These are marked as `peerDependencies` to keep the main package lightweight. Only install what you need!

### 📘 TypeScript Support

s3db.js includes comprehensive TypeScript definitions out of the box. Get full type safety, autocomplete, and IntelliSense support in your IDE!

#### Basic Usage (Automatic Types)

```typescript
import { Database, DatabaseConfig, Resource } from 's3db.js';

// Type-safe configuration
const config: DatabaseConfig = {
  connectionString: 's3://ACCESS_KEY:SECRET@bucket/path',
  verbose: true,
  parallelism: 10,
  cache: { enabled: true, ttl: 3600 }
};

const db = new Database(config);

// TypeScript knows all methods and options!
await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required|email',
    age: 'number|min:0'
  }
});

// Full autocomplete for all operations
const users: Resource<any> = db.resources.users;
const user = await users.insert({ name: 'Alice', email: 'alice@example.com', age: 28 });
```

#### Advanced: Generate Resource Types

For even better type safety, auto-generate TypeScript interfaces from your resources:

```typescript
import { generateTypes } from 's3db.js/typescript-generator';

// Generate types after creating resources
await generateTypes(db, { outputPath: './types/database.d.ts' });
```

See the complete example in [`docs/examples/typescript-usage-example.ts`](docs/examples/typescript-usage-example.ts).

---

## 🗄️ Database

A Database is a logical container for your resources, stored in a specific S3 bucket path. The database manages resource metadata, connections, and provides the core interface for all operations.

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `connectionString` | `string` | **required** | S3 connection string (see formats below) |
| `httpClientOptions` | `object` | optimized | HTTP client configuration for S3 requests |
| `verbose` | `boolean` | `false` | Enable verbose logging for debugging |
| `parallelism` | `number` | `10` | Concurrent operations for bulk operations |
| `versioningEnabled` | `boolean` | `false` | Enable automatic resource versioning |
| `passphrase` | `string` | `'secret'` | Default passphrase for field encryption |
| `plugins` | `array` | `[]` | Array of plugin instances to extend functionality |

### Connection Strings

s3db.js supports multiple connection string formats for different S3 providers:

```javascript
// AWS S3 (with credentials)
"s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp?region=us-east-1"

// AWS S3 (IAM role - recommended for production)
"s3://BUCKET_NAME/databases/myapp?region=us-east-1"

// MinIO (self-hosted)
"http://minioadmin:minioadmin@localhost:9000/bucket/databases/myapp"

// Digital Ocean Spaces
"https://SPACES_KEY:SPACES_SECRET@nyc3.digitaloceanspaces.com/SPACE_NAME/databases/myapp"

// LocalStack (local testing)
"http://test:test@localhost:4566/mybucket/databases/myapp"

// MemoryClient (ultra-fast in-memory testing - no S3 required!)
// Note: MemoryClient doesn't use a connection string, instantiate directly:
//   const db = new S3db({ client: new MemoryClient({ bucket: 'test-bucket' }) });
// See MemoryClient section below for full documentation

// Backblaze B2
"https://KEY_ID:APPLICATION_KEY@s3.us-west-002.backblazeb2.com/BUCKET/databases/myapp"

// Cloudflare R2
"https://ACCESS_KEY:SECRET_KEY@ACCOUNT_ID.r2.cloudflarestorage.com/BUCKET/databases/myapp"
```

<details>
<summary><strong>🔑 Complete authentication examples</strong></summary>

#### 1. Access Keys (Development)
```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});
```

#### 2. IAM Roles (Production - Recommended)
```javascript
// No credentials needed - uses IAM role permissions
const s3db = new S3db({
  connectionString: "s3://BUCKET_NAME/databases/myapp"
});
```

#### 3. MinIO (Self-hosted S3)
```javascript
// MinIO running locally (note: http:// protocol and port)
const s3db = new S3db({
  connectionString: "http://minioadmin:minioadmin@localhost:9000/mybucket/databases/myapp"
});
```

#### 4. Digital Ocean Spaces (SaaS)
```javascript
// Digital Ocean Spaces (NYC3 datacenter)
const s3db = new S3db({
  connectionString: "https://SPACES_KEY:SPACES_SECRET@nyc3.digitaloceanspaces.com/SPACE_NAME/databases/myapp"
});
```

</details>

---

### 🚀 MemoryClient - Ultra-Fast Testing (100-1000x faster!)

For testing, s3db.js provides **MemoryClient** - a pure in-memory implementation that's **100-1000x faster** than LocalStack and requires **zero dependencies**.

**Why MemoryClient?**
- ⚡ **100-1000x faster** than LocalStack/MinIO
- 🎯 **Zero dependencies** - no Docker, LocalStack, or S3 needed
- 💯 **100% compatible** - same API as S3Client
- 🧪 **Perfect for tests** - instant setup and teardown
- 💾 **Optional persistence** - save/load snapshots to disk

```javascript
import { S3db, MemoryClient } from 's3db.js';

// Create database with MemoryClient
const db = new S3db({
  client: new MemoryClient({ bucket: 'test-bucket' })
});

await db.connect();

// Use exactly like S3 - same API!
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'email|required'
  }
});

await users.insert({ id: 'u1', name: 'John', email: 'john@test.com' });
const user = await users.get('u1');
```

**Advanced Features:**

```javascript
import { MemoryClient } from 's3db.js';

const client = new MemoryClient({
  bucket: 'test-bucket',
  keyPrefix: 'tests/',              // Optional prefix for all keys
  enforceLimits: true,               // Enforce S3 2KB metadata limit
  persistPath: './test-data.json',  // Optional: persist to disk
  verbose: false                     // Disable logging
});

// Snapshot/Restore (perfect for tests)
const snapshot = client.snapshot();        // Capture current state
// ... run tests that modify data ...
client.restore(snapshot);                  // Restore to original state

// Persistence
await client.saveToDisk();                 // Save to persistPath
await client.loadFromDisk();               // Load from persistPath

// Statistics
const stats = client.getStats();
console.log(`Objects: ${stats.objectCount}, Size: ${stats.totalSizeFormatted}`);

// Clear all data
client.clear();
```

**Testing Example:**

```javascript
import { describe, test, beforeEach } from '@jest/globals';
import { S3db, MemoryClient } from 's3db.js';

describe('User Tests', () => {
  let db, users, snapshot;

  beforeEach(async () => {
    db = new S3db({ client: new MemoryClient({ bucket: 'test' }) });
    await db.connect();
    users = await db.createResource({
      name: 'users',
      attributes: { name: 'string', email: 'email' }
    });

    // Save snapshot for each test
    snapshot = db.client.snapshot();
  });

  afterEach(() => {
    // Restore to clean state (faster than recreating)
    db.client.restore(snapshot);
  });

  test('should insert user', async () => {
    await users.insert({ id: 'u1', name: 'John', email: 'john@test.com' });
    const user = await users.get('u1');
    expect(user.name).toBe('John');
  });
});
```

**Performance Comparison:**

| Operation | LocalStack | MemoryClient | Speedup |
|-----------|------------|--------------|---------|
| Insert 100 records | ~2000ms | ~50ms | **40x faster** |
| Query 1000 records | ~5000ms | ~100ms | **50x faster** |
| Full test suite | ~120s | ~2s | **60x faster** |

📚 [**Full MemoryClient Documentation**](./src/clients/memory-client.md)

---

### S3 Bucket Structure

When you create a database, s3db.js organizes your data in a structured way within your S3 bucket:

```
bucket-name/
└── databases/
    └── myapp/                                  # Database root (from connection string)
        ├── s3db.json                           # Database metadata & resource definitions
        │
        ├── resource=users/                     # Resource: users
        │   ├── data/
        │   │   ├── id=user-123                 # Document (metadata in S3 metadata, optional body)
        │   │   └── id=user-456
        │   └── partition=byRegion/             # Partition: byRegion
        │       ├── region=US/
        │       │   ├── id=user-123             # Partition reference
        │       │   └── id=user-789
        │       └── region=EU/
        │           └── id=user-456
        │
        ├── resource=posts/                     # Resource: posts
        │   └── data/
        │       ├── id=post-abc
        │       └── id=post-def
        │
        ├── resource=sessions/                  # Resource: sessions (with TTL)
        │   └── data/
        │       ├── id=session-xyz
        │       └── id=session-qwe
        │
        ├── plugin=cache/                       # Plugin: CachePlugin (global data)
        │   ├── config                          # Plugin configuration
        │   └── locks/
        │       └── cache-cleanup               # Distributed lock
        │
        └── resource=wallets/                   # Resource: wallets
            ├── data/
            │   └── id=wallet-123
            └── plugin=eventual-consistency/    # Plugin: scoped to resource
                ├── balance/
                │   └── transactions/
                │       └── id=txn-123          # Plugin-specific data
                └── locks/
                    └── balance-sync            # Resource-scoped lock
```

**Key Path Patterns:**

| Type | Pattern | Example |
|------|---------|---------|
| **Metadata** | `s3db.json` | Database schema, resources, versions |
| **Document** | `resource={name}/data/id={id}` | `resource=users/data/id=user-123` |
| **Partition** | `resource={name}/partition={partition}/{field}={value}/id={id}` | `resource=users/partition=byRegion/region=US/id=user-123` |
| **Plugin (global)** | `plugin={slug}/{path}` | `plugin=cache/config` |
| **Plugin (resource)** | `resource={name}/plugin={slug}/{path}` | `resource=wallets/plugin=eventual-consistency/balance/transactions/id=txn-123` |
| **Lock (global)** | `plugin={slug}/locks/{lockName}` | `plugin=ttl/locks/cleanup` |
| **Lock (resource)** | `resource={name}/plugin={slug}/locks/{lockName}` | `resource=wallets/plugin=eventual-consistency/locks/balance-sync` |

**Storage Layers:**

1. **Documents** - User data stored in resources
   - Metadata: Stored in S3 object metadata (up to 2KB)
   - Body: Large content stored in S3 object body (unlimited)

2. **Partitions** - Organized references for O(1) queries
   - Hierarchical paths with field values
   - References point to main document

3. **Plugin Storage** - Plugin-specific data
   - **Global**: `plugin={slug}/...` - Shared config, caches, locks
   - **Resource-scoped**: `resource={name}/plugin={slug}/...` - Per-resource data
   - Supports same behaviors as resources (body-overflow, body-only, etc.)
   - 3-5x faster than creating full resources
   - Examples: EventualConsistency transactions, TTL expiration queues, Cache entries, Audit logs

**Why This Structure?**

- ✅ **Flat hierarchy** - No deep nesting, better S3 performance
- ✅ **Self-documenting** - Path tells you what data it contains
- ✅ **Partition-friendly** - O(1) lookups via S3 prefix queries
- ✅ **Plugin isolation** - Each plugin has its own namespace
- ✅ **Consistent naming** - `resource=`, `partition=`, `plugin=`, `id=` prefixes

### Creating a Database

```javascript
import { S3db } from 's3db.js';

// Simple connection
const db = new S3db({
  connectionString: 's3://ACCESS_KEY:SECRET@bucket/databases/myapp'
});

await db.connect();

// With plugins and options
const db = new S3db({
  connectionString: 's3://bucket/databases/myapp',
  verbose: true,
  parallelism: 20,
  versioningEnabled: true,
  plugins: [
    new CachePlugin({ ttl: 300000 }),
    new MetricsPlugin()
  ],
  httpClientOptions: {
    keepAlive: true,
    maxSockets: 100,
    timeout: 60000
  }
});

await db.connect();
```

### Database Methods

| Method | Description |
|--------|-------------|
| `connect()` | Initialize database connection and load metadata |
| `createResource(config)` | Create or update a resource |
| `getResource(name, options?)` | Get existing resource instance |
| `resourceExists(name)` | Check if resource exists |
| `resources.{name}` | Access resource by property |
| `uploadMetadataFile()` | Save metadata changes to S3 |

### HTTP Client Configuration

Customize HTTP performance for your workload:

```javascript
const db = new S3db({
  connectionString: '...',
  httpClientOptions: {
    keepAlive: true,          // Enable connection reuse
    keepAliveMsecs: 1000,     // Keep connections alive for 1s
    maxSockets: 50,           // Max 50 concurrent connections
    maxFreeSockets: 10,       // Keep 10 free connections in pool
    timeout: 60000            // 60 second timeout
  }
});
```

**Presets:**

<details>
<summary><strong>High Concurrency (APIs)</strong></summary>

```javascript
httpClientOptions: {
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 100,         // Higher concurrency
  maxFreeSockets: 20,      // More free connections
  timeout: 60000
}
```
</details>

<details>
<summary><strong>Aggressive Performance (High-throughput)</strong></summary>

```javascript
httpClientOptions: {
  keepAlive: true,
  keepAliveMsecs: 5000,    // Longer keep-alive
  maxSockets: 200,         // High concurrency
  maxFreeSockets: 50,      // Large connection pool
  timeout: 120000          // 2 minute timeout
}
```
</details>

**Complete documentation**: See above for all Database configuration options

---

## 📋 Resources

Resources are the core abstraction in s3db.js - they define your data structure, validation rules, and behavior. Think of them as tables in traditional databases, but with much more flexibility and features.

### TL;DR

Resources provide:
- ✅ **Schema validation** with 30+ field types
- ✅ **5 behavior strategies** for handling 2KB S3 metadata limit
- ✅ **Partitioning** for O(1) queries vs O(n) scans
- ✅ **Hooks & middlewares** for custom logic
- ✅ **Events** for real-time notifications
- ✅ **Versioning** for schema evolution
- ✅ **Encryption** for sensitive fields
- ✅ **Streaming** for large datasets

**Quick example:**
```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required|unique',
    password: 'secret|required',
    age: 'number|min:18|max:120'
  },
  behavior: 'enforce-limits',
  timestamps: true,
  partitions: {
    byAge: { fields: { age: 'number' } }
  }
});

await users.insert({ email: 'john@example.com', password: 'secret123', age: 25 });
```

### Schema & Field Types

Define your data structure with powerful validation using **[fastest-validator](https://github.com/icebob/fastest-validator)** - a blazing-fast validation library with comprehensive type support:

#### Basic Types

| Type | Example | Validation Rules |
|------|---------|------------------|
| `string` | `"name: 'string\|required'"` | `min`, `max`, `length`, `pattern`, `enum` |
| `number` | `"age: 'number\|min:0'"` | `min`, `max`, `integer`, `positive`, `negative` |
| `boolean` | `"isActive: 'boolean'"` | `true`, `false` |
| `email` | `"email: 'email\|required'"` | RFC 5322 validation |
| `url` | `"website: 'url'"` | Valid URL format |
| `date` | `"createdAt: 'date'"` | ISO 8601 dates |
| `array` | `"tags: 'array\|items:string'"` | `items`, `min`, `max`, `unique` |
| `object` | `"profile: { type: 'object', props: {...} }"` | Nested validation |

#### Advanced Types (with encoding)

| Type | Savings | Example |
|------|---------|---------|
| `secret` | Encrypted | `"password: 'secret\|required'"` - AES-256-GCM |
| `embedding:N` | 77% | `"vector: 'embedding:1536'"` - Fixed-point Base62 |
| `ip4` | 47% | `"ipAddress: 'ip4'"` - Binary Base64 |
| `ip6` | 44% | `"ipv6: 'ip6'"` - Binary Base64 |

**Encoding optimizations:**
- ISO timestamps → Unix Base62 (67% savings)
- UUIDs → Binary Base64 (33% savings)
- Dictionary values → Single bytes (95% savings)

#### Schema Examples

> **📖 Validation powered by [fastest-validator](https://github.com/icebob/fastest-validator)**
> All schemas use fastest-validator's syntax with full support for shorthand notation.

```javascript
// Simple schema
{
  name: 'string|required|min:2|max:100',
  email: 'email|required|unique',
  age: 'number|integer|min:0|max:150'
}

// Nested objects - MAGIC AUTO-DETECT! ✨ (recommended)
// Just write your object structure - s3db detects it automatically!
{
  name: 'string|required',
  profile: {               // ← No $$type needed! Auto-detected as optional object
    bio: 'string|max:500',
    avatar: 'url|optional',
    social: {              // ← Deeply nested also works!
      twitter: 'string|optional',
      github: 'string|optional'
    }
  }
}

// Need validation control? Use $$type (when you need required/optional)
{
  name: 'string|required',
  profile: {
    $$type: 'object|required',  // ← Add required validation
    bio: 'string|max:500',
    avatar: 'url|optional'
  }
}

// Advanced: Full control (rare cases - strict mode, etc)
{
  name: 'string|required',
  profile: {
    type: 'object',
    optional: false,
    strict: true,        // ← Enable strict validation
    props: {
      bio: 'string|max:500',
      avatar: 'url|optional'
    }
  }
}

// Arrays with validation
{
  name: 'string|required',
  tags: 'array|items:string|min:1|max:10|unique',
  scores: 'array|items:number|min:0|max:100'
}

// Encrypted fields
{
  email: 'email|required',
  password: 'secret|required',
  apiKey: 'secret|required'
}
```

### Behaviors (Handling 2KB Metadata Limit)

S3 metadata has a 2KB limit. Behaviors define how to handle data that exceeds this:

| Behavior | Enforcement | Data Loss | Use Case |
|----------|-------------|-----------|----------|
| `user-managed` | None | Possible | Dev/Test - warnings only |
| `enforce-limits` | Strict | No | Production - throws errors |
| `truncate-data` | Truncates | Yes | Content management - smart truncation |
| `body-overflow` | Splits | No | Mixed data - metadata + body |
| `body-only` | Unlimited | No | Large docs - everything in body |

```javascript
// Enforce limits (recommended for production)
const users = await db.createResource({
  name: 'users',
  behavior: 'enforce-limits',
  attributes: { name: 'string', bio: 'string' }
});

// Body overflow for large content
const blogs = await db.createResource({
  name: 'blogs',
  behavior: 'body-overflow',
  attributes: { title: 'string', content: 'string' }
});

// Body-only for documents
const documents = await db.createResource({
  name: 'documents',
  behavior: 'body-only',
  attributes: { title: 'string', content: 'string', metadata: 'object' }
});
```

### Resource Methods

#### CRUD Operations

```javascript
// Create
const user = await users.insert({ name: 'John', email: 'john@example.com' });

// Read
const user = await users.get('user-123');
const all = await users.list({ limit: 10, offset: 0 });
const filtered = await users.query({ isActive: true });

// Update (3 methods with different performance)
await users.update(id, { name: 'Jane' });      // GET+PUT merge (baseline)
await users.patch(id, { name: 'Jane' });       // HEAD+COPY (40-60% faster*)
await users.replace(id, fullObject);           // PUT only (30-40% faster)
// *patch() uses HEAD+COPY for metadata-only behaviors

// Delete
await users.delete('user-123');
```

#### Bulk Operations

```javascript
// Bulk insert
await users.insertMany([
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' }
]);

// Bulk get
const data = await users.getMany(['user-1', 'user-2', 'user-3']);

// Bulk delete
await users.deleteMany(['user-1', 'user-2']);
```

### Partitions (O(1) Queries)

Organize data for fast queries without scanning:

```javascript
const analytics = await db.createResource({
  name: 'analytics',
  attributes: {
    userId: 'string',
    event: 'string',
    timestamp: 'date',
    region: 'string'
  },
  partitions: {
    // Single field
    byEvent: { fields: { event: 'string' } },

    // Multiple fields (composite)
    byEventAndRegion: {
      fields: {
        event: 'string',
        region: 'string'
      }
    },

    // Nested field
    byUserCountry: {
      fields: {
        'profile.country': 'string'
      }
    }
  },

  // Async partitions for 70-100% faster writes
  asyncPartitions: true
});

// Query by partition (O(1))
const usEvents = await analytics.list({
  partition: 'byEventAndRegion',
  partitionValues: { event: 'click', region: 'US' }
});
```

**Automatic timestamp partitions:**

```javascript
const events = await db.createResource({
  name: 'events',
  attributes: { name: 'string', data: 'object' },
  timestamps: true  // Auto-creates byCreatedDate and byUpdatedDate partitions
});

const todayEvents = await events.list({
  partition: 'byCreatedDate',
  partitionValues: { createdAt: '2024-01-15' }
});
```

### Hooks (Lifecycle Functions)

Add custom logic before/after operations:

```javascript
const products = await db.createResource({
  name: 'products',
  attributes: { name: 'string', price: 'number', sku: 'string' },
  hooks: {
    // Before operations
    beforeInsert: [
      async (data) => {
        data.sku = `PROD-${Date.now()}`;
        return data;
      }
    ],
    beforeUpdate: [
      async (data) => {
        data.updatedAt = new Date().toISOString();
        return data;
      }
    ],

    // After operations
    afterInsert: [
      async (data) => {
        console.log(`Product ${data.name} created with SKU ${data.sku}`);
      }
    ],
    afterDelete: [
      async (data) => {
        await notifyWarehouse(data.sku);
      }
    ]
  }
});
```

**Available hooks:**
- `beforeInsert`, `afterInsert`
- `beforeUpdate`, `afterUpdate`
- `beforeDelete`, `afterDelete`
- `beforeGet`, `afterGet`
- `beforeList`, `afterList`

### Middlewares (Method Wrappers)

Intercept and transform method calls:

```javascript
// Authentication middleware
users.useMiddleware('inserted', async (ctx, next) => {
  if (!ctx.args[0].userId) {
    throw new Error('Authentication required');
  }
  return await next();
});

// Logging middleware
users.useMiddleware('updated', async (ctx, next) => {
  const start = Date.now();
  const result = await next();
  console.log(`Update took ${Date.now() - start}ms`);
  return result;
});

// Validation middleware
users.useMiddleware('inserted', async (ctx, next) => {
  ctx.args[0].name = ctx.args[0].name.toUpperCase();
  return await next();
});
```

**Supported methods:**
`fetched`, `list`, `inserted`, `updated`, `deleted`, `deleteMany`, `exists`, `getMany`, `count`, `page`, `listIds`, `getAll`

### Events (Real-time Notifications)

Listen to resource operations:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { name: 'string', email: 'string' },

  // Declarative event listeners
  events: {
    insert: (event) => {
      console.log('User created:', event.id, event.name);
    },

    update: [
      (event) => console.log('Update detected:', event.id),
      (event) => {
        if (event.$before.email !== event.$after.email) {
          console.log('Email changed!');
        }
      }
    ],

    delete: (event) => {
      console.log('User deleted:', event.id);
    }
  }
});

// Programmatic listeners
users.on('inserted', (event) => {
  sendWelcomeEmail(event.email);
});
```

**Available events:**
`inserted`, `updated`, `deleted`, `insertMany`, `deleteMany`, `list`, `count`, `fetched`, `getMany`

### Streaming API

Process large datasets efficiently:

```javascript
// Readable stream
const readableStream = await users.readable({
  batchSize: 50,
  concurrency: 10
});

readableStream.on('data', (user) => {
  console.log('Processing:', user.name);
});

readableStream.on('end', () => {
  console.log('Stream completed');
});

// Writable stream
const writableStream = await users.writable({
  batchSize: 25,
  concurrency: 5
});

userData.forEach(user => writableStream.write(user));
writableStream.end();
```

### Complete Resource Example

A complex, production-ready resource showing all capabilities:

```javascript
const orders = await db.createResource({
  name: 'orders',

  // Schema with all features
  attributes: {
    // Basic fields
    orderId: 'string|required|unique',
    userId: 'string|required',
    status: 'string|required|enum:pending,processing,completed,cancelled',
    total: 'number|required|min:0',

    // Encrypted sensitive data
    paymentToken: 'secret|required',

    // Nested objects
    customer: {
      type: 'object',
      props: {
        name: 'string|required',
        email: 'email|required',
        phone: 'string|optional',
        address: {
          type: 'object',
          props: {
            street: 'string|required',
            city: 'string|required',
            country: 'string|required|length:2',
            zipCode: 'string|required'
          }
        }
      }
    },

    // Arrays
    items: 'array|items:object|min:1',
    tags: 'array|items:string|unique|optional',

    // Special types
    ipAddress: 'ip4',
    userAgent: 'string|max:500',

    // Embeddings for AI/ML
    orderEmbedding: 'embedding:384'
  },

  // Behavior for large orders
  behavior: 'body-overflow',

  // Automatic timestamps
  timestamps: true,

  // Versioning for schema evolution
  versioningEnabled: true,

  // Custom ID generation
  idGenerator: () => `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,

  // Partitions for efficient queries
  partitions: {
    byStatus: { fields: { status: 'string' } },
    byUser: { fields: { userId: 'string' } },
    byCountry: { fields: { 'customer.address.country': 'string' } },
    byUserAndStatus: {
      fields: {
        userId: 'string',
        status: 'string'
      }
    }
  },

  // Async partitions for faster writes
  asyncPartitions: true,

  // Hooks for business logic
  hooks: {
    beforeInsert: [
      async function(data) {
        // Validate stock availability
        const available = await this.validateStock(data.items);
        if (!available) throw new Error('Insufficient stock');

        // Calculate total
        data.total = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        return data;
      },
      async (data) => {
        // Add metadata
        data.processedAt = new Date().toISOString();
        return data;
      }
    ],

    afterInsert: [
      async (data) => {
        // Send confirmation email
        await sendOrderConfirmation(data.customer.email, data.orderId);
      },
      async (data) => {
        // Update inventory
        await updateInventory(data.items);
      }
    ],

    beforeUpdate: [
      async function(data) {
        // Prevent status rollback
        if (data.status === 'cancelled' && this.previousStatus === 'completed') {
          throw new Error('Cannot cancel completed order');
        }
        return data;
      }
    ],

    afterUpdate: [
      async (data) => {
        // Notify customer of status change
        if (data.$before.status !== data.$after.status) {
          await notifyStatusChange(data.customer.email, data.status);
        }
      }
    ]
  },

  // Events for monitoring
  events: {
    insert: (event) => {
      console.log(`Order ${event.orderId} created - Total: $${event.total}`);
      metrics.increment('orders.created');
    },

    update: [
      (event) => {
        if (event.$before.status !== event.$after.status) {
          console.log(`Order ${event.orderId}: ${event.$before.status} → ${event.$after.status}`);
          metrics.increment(`orders.status.${event.$after.status}`);
        }
      }
    ],

    delete: (event) => {
      console.warn(`Order ${event.orderId} deleted`);
      metrics.increment('orders.deleted');
    }
  }
});

// Add middlewares for cross-cutting concerns
orders.useMiddleware('inserted', async (ctx, next) => {
  // Rate limiting
  await checkRateLimit(ctx.args[0].userId);
  return await next();
});

orders.useMiddleware('updated', async (ctx, next) => {
  // Audit logging
  const start = Date.now();
  const result = await next();
  await auditLog.write({
    action: 'order.update',
    orderId: ctx.args[0],
    duration: Date.now() - start,
    timestamp: new Date()
  });
  return result;
});
```

**Complete documentation**: [**docs/resources.md**](./docs/resources.md)

---

## 🔌 Plugins

Extend s3db.js with powerful plugins for caching, monitoring, replication, relationships, and more.

### Available Plugins

| Plugin | Description | Dependencies |
|--------|-------------|--------------|
| [**APIPlugin**](./docs/plugins/api.md) | Auto-generated REST API with OpenAPI, path-based auth, template engine | `ejs` (optional) |
| [**AuditPlugin**](./docs/plugins/audit.md) | Complete audit trail for all operations | None |
| [**BackupPlugin**](./docs/plugins/backup.md) | Multi-destination backup system for data protection | None |
| [**CachePlugin**](./docs/plugins/cache.md) | Memory/S3/filesystem caching with compression | None |
| [**CloudInventoryPlugin**](./docs/plugins/cloud-inventory.md) | Multi-cloud inventory with versioning & diffs | None |
| [**CostsPlugin**](./docs/plugins/costs.md) | AWS cost tracking and optimization | None |
| [**EventualConsistencyPlugin**](./docs/plugins/eventual-consistency.md) | Eventually consistent counters and analytics | None |
| [**FullTextPlugin**](./docs/plugins/fulltext.md) | Full-text search with indexing | None |
| [**GeoPlugin**](./docs/plugins/geo.md) | Geospatial queries and distance calculations | None |
| [**IdentityPlugin**](./docs/plugins/identity.md) | OAuth2/OIDC authentication with MFA and whitelabel UI | None |
| [**ImporterPlugin**](./docs/plugins/importer.md) | Multi-format data import (JSON, CSV, bulk migrations) | None |
| [**MetricsPlugin**](./docs/plugins/metrics.md) | Performance monitoring and Prometheus export | None |
| [**MLPlugin**](./docs/plugins/ml-plugin.md) | Machine learning model management and inference | None |
| [**QueueConsumerPlugin**](./docs/plugins/queue-consumer.md) | Process RabbitMQ/SQS messages for event-driven architecture | `@aws-sdk/client-sqs`, `amqplib` |
| [**RelationPlugin**](./docs/plugins/relation.md) | ORM-like relationships (10-100x faster queries) | None |
| [**ReplicatorPlugin**](./docs/plugins/replicator.md) | Real-time replication to BigQuery, PostgreSQL, SQS | `pg`, `@google-cloud/bigquery`, `@aws-sdk/client-sqs` |
| [**S3QueuePlugin**](./docs/plugins/s3-queue.md) | Distributed queue with zero race conditions | None |
| [**SchedulerPlugin**](./docs/plugins/scheduler.md) | Cron-based job scheduling for maintenance tasks | `node-cron` |
| [**StateMachinePlugin**](./docs/plugins/state-machine.md) | Finite state machine workflows for business processes | None |
| [**TfstatePlugin**](./docs/plugins/tfstate.md) | Track Terraform infrastructure changes | `node-cron` |
| [**TTLPlugin**](./docs/plugins/ttl.md) | Auto-cleanup expired records (O(1) partition-based) | None |
| [**VectorPlugin**](./docs/plugins/vector.md) | Vector similarity search (cosine, euclidean) for RAG & ML | None |

### Plugin Installation

```bash
# Core plugins (no dependencies)
# Included in s3db.js package

# External dependencies (install only what you need)
pnpm add pg                      # PostgreSQL replication (ReplicatorPlugin)
pnpm add @google-cloud/bigquery  # BigQuery replication (ReplicatorPlugin)
pnpm add @aws-sdk/client-sqs     # SQS replication/consumption (ReplicatorPlugin, QueueConsumerPlugin)
pnpm add amqplib                 # RabbitMQ consumption (QueueConsumerPlugin)
pnpm add node-cron               # Job scheduling (SchedulerPlugin, TfstatePlugin)
pnpm add ejs                     # Template engine (APIPlugin - optional)
```

### Quick Example

```javascript
import { S3db, CachePlugin, MetricsPlugin, TTLPlugin } from 's3db.js';

const db = new S3db({
  connectionString: 's3://bucket/databases/myapp',
  plugins: [
    // Cache frequently accessed data
    new CachePlugin({
      driver: 'memory',
      ttl: 300000,  // 5 minutes
      config: {
        maxMemoryPercent: 0.1,  // 10% of system memory
        enableCompression: true
      }
    }),

    // Track performance metrics
    new MetricsPlugin({
      enablePrometheus: true,
      port: 9090
    }),

    // Auto-cleanup expired sessions
    new TTLPlugin({
      resources: {
        sessions: { ttl: 86400, onExpire: 'soft-delete' }  // 24h
      }
    })
  ]
});
```

### Creating Custom Plugins

Simple plugin example:

```javascript
import { Plugin } from 's3db.js';

export class MyPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = 'MyPlugin';
  }

  async initialize(database) {
    console.log('Plugin initialized!');

    // Wrap methods
    this.wrapMethod('Resource', 'inserted', async (original, resource, args) => {
      console.log(`Inserting into ${resource.name}`);
      const result = await original(...args);
      console.log(`Inserted: ${result.id}`);
      return result;
    });
  }
}
```

**Complete documentation**: [**docs/plugins/README.md**](./docs/plugins/README.md)

---

## 🤖 MCP & Integrations

### Model Context Protocol (MCP) Server

S3DB includes a powerful MCP server with **28 specialized tools** for database operations, debugging, and monitoring.

#### Quick Start

```bash
# Claude CLI (one command)
claude mcp add s3db \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio

# Standalone HTTP server
npx s3db.js s3db-mcp --transport=sse
```

#### Features

- ✅ **28 tools** - CRUD, debugging, partitions, bulk ops, export/import, monitoring
- ✅ **Multiple transports** - SSE for web, stdio for CLI
- ✅ **Auto-optimization** - Cache and cost tracking enabled by default
- ✅ **Partition-aware** - Intelligent caching with partition support

#### Tool Categories

1. **Connection** (3) - `dbConnect`, `dbDisconnect`, `dbStatus`
2. **Debugging** (5) - `dbInspectResource`, `dbGetMetadata`, `resourceValidate`, `dbHealthCheck`, `resourceGetRaw`
3. **Query** (2) - `resourceQuery`, `resourceSearch`
4. **Partitions** (4) - `resourceListPartitions`, `dbFindOrphanedPartitions`, etc.
5. **Bulk Ops** (3) - `resourceUpdateMany`, `resourceBulkUpsert`, `resourceDeleteAll`
6. **Export/Import** (3) - `resourceExport`, `resourceImport`, `dbBackupMetadata`
7. **Monitoring** (4) - `dbGetStats`, `resourceGetStats`, `cacheGetStats`, `dbClearCache`

**Complete documentation**: [**docs/mcp.md**](./docs/mcp.md)

### Integrations

s3db.js integrates seamlessly with:

- **BigQuery** - Real-time data replication via ReplicatorPlugin
- **PostgreSQL** - Sync to traditional databases via ReplicatorPlugin
- **AWS SQS** - Event streaming and message queues
- **RabbitMQ** - Message queue integration
- **Prometheus** - Metrics export via MetricsPlugin
- **Vector Databases** - Embedding field type with 77% compression

---

## 🔧 CLI

s3db.js includes a powerful CLI for database management and operations.

### Installation

```bash
# Global
npm install -g s3db.js

# Project
npm install s3db.js
npx s3db [command]
```

### Commands

```bash
# List resources
s3db list

# Query resources
s3db query users
s3db query users --filter '{"status":"active"}'

# Insert records
s3db insert users --data '{"name":"John","email":"john@example.com"}'

# Update records
s3db update users user-123 --data '{"age":31}'

# Delete records
s3db delete users user-123

# Export data
s3db export users --format json > users.json
s3db export users --format csv > users.csv

# Import data
s3db import users < users.json

# Stats
s3db stats
s3db stats users

# MCP Server
s3db s3db-mcp --transport=stdio
s3db s3db-mcp --transport=sse --port=17500
```

### Environment Variables

```bash
S3DB_CONNECTION_STRING=s3://bucket/databases/myapp
S3DB_CACHE_ENABLED=true
S3DB_COSTS_ENABLED=true
S3DB_VERBOSE=false
```

---

## 📖 Documentation

### Core Documentation

- [**Resources (Complete Guide)**](./docs/resources.md) - Everything about resources, schemas, behaviors, partitions, hooks, middlewares, events
- [**Client Class**](./docs/client.md) - Low-level S3 operations and HTTP configuration
- [**Schema Validation**](./docs/schema.md) - Comprehensive schema validation and field types
- [**Plugins Overview**](./docs/plugins/README.md) - All available plugins and how to create custom ones

### Plugin Documentation

- [Cache Plugin](./docs/plugins/cache.md)
- [Costs Plugin](./docs/plugins/costs.md)
- [Metrics Plugin](./docs/plugins/metrics.md)
- [Audit Plugin](./docs/plugins/audit.md)
- [TTL Plugin](./docs/plugins/ttl.md)
- [Relation Plugin](./docs/plugins/relation.md)
- [Replicator Plugin](./docs/plugins/replicator.md)

### MCP & Integrations

- [MCP Server Guide](./docs/mcp.md) - Complete MCP documentation with all 28 tools
- [NPX Setup Guide](./mcp/NPX_SETUP.md) - Use MCP with npx
- [Claude CLI Setup](./mcp/CLAUDE_CLI_SETUP.md) - Detailed Claude CLI configuration

### Benchmarks & Performance

- [Benchmark Index](./docs/benchmarks/README.md)
- [Base62 Encoding](./docs/benchmarks/base62.md)
- [All Types Encoding](./docs/benchmarks/all-types-encoding.md)
- [String Encoding Optimizations](./docs/benchmarks/STRING-ENCODING-OPTIMIZATIONS.md)
- [EventualConsistency Plugin](./docs/benchmarks/eventual-consistency.md)
- [Partitions Matrix](./docs/benchmarks/partitions.md)
- [Vector Clustering](./docs/benchmarks/vector-clustering.md)

### Examples

Browse [**60+ examples**](./docs/examples/) covering:
- Basic CRUD (e01-e07)
- Advanced features (e08-e17)
- Plugins (e18-e33)
- Vectors & RAG (e41-e43)
- Testing patterns (e38-e40, e64-e65)

### API Reference

| Resource | Link |
|----------|------|
| Resource API | [docs/resources.md](./docs/resources.md) |
| Client API | [docs/client.md](./docs/client.md) |
| Schema Validation | [docs/schema.md](./docs/schema.md) |
| Plugin API | [docs/plugins/README.md](./docs/plugins/README.md) |

---

## 🔧 Troubleshooting

Common issues and solutions:

<details>
<summary><strong>Connection Issues</strong></summary>

**Problem:** Cannot connect to S3 bucket

**Solutions:**
1. Verify credentials in connection string
2. Check IAM permissions (s3:ListBucket, s3:GetObject, s3:PutObject)
3. Ensure bucket exists
4. Check network connectivity

```javascript
// Enable verbose logging
const db = new S3db({
  connectionString: '...',
  verbose: true
});
```
</details>

<details>
<summary><strong>Metadata Size Exceeded</strong></summary>

**Problem:** Error: "S3 metadata size exceeds 2KB limit"

**Solutions:**
1. Change behavior to `body-overflow` or `body-only`
2. Reduce field sizes or use truncation
3. Move large content to separate fields

```javascript
const resource = await db.createResource({
  name: 'blogs',
  behavior: 'body-overflow',  // Automatically handle overflow
  attributes: { title: 'string', content: 'string' }
});
```
</details>

<details>
<summary><strong>Performance Issues</strong></summary>

**Problem:** Slow queries or operations

**Solutions:**
1. Use partitions for frequently queried fields
2. Enable caching with CachePlugin
3. Increase HTTP client concurrency
4. Use bulk operations instead of loops

```javascript
// Add partitions
const resource = await db.createResource({
  name: 'analytics',
  attributes: { event: 'string', region: 'string' },
  partitions: {
    byEvent: { fields: { event: 'string' } }
  },
  asyncPartitions: true  // 70-100% faster writes
});

// Enable caching
const db = new S3db({
  connectionString: '...',
  plugins: [new CachePlugin({ ttl: 300000 })]
});
```
</details>

<details>
<summary><strong>Orphaned Partitions</strong></summary>

**Problem:** Partition references deleted field

**Solutions:**

```javascript
const resource = await db.getResource('users', { strictValidation: false });
const orphaned = resource.findOrphanedPartitions();
console.log('Orphaned:', orphaned);

// Remove them
resource.removeOrphanedPartitions();
await db.uploadMetadataFile();
```
</details>

---

## 📊 Performance Benchmarks

> **⚠️ Important**: All benchmark results documented were generated using **Node.js v22.6.0**. Performance may vary with different Node.js versions.

s3db.js includes comprehensive benchmarks demonstrating real-world performance optimizations:

- [**Base62 Encoding**](./docs/benchmarks/base62.md) - 40-46% space savings, 5x faster than Base36
- [**All Types Encoding**](./docs/benchmarks/all-types-encoding.md) - Comprehensive encoding across all field types
- [**String Encoding Optimizations**](./docs/benchmarks/STRING-ENCODING-OPTIMIZATIONS.md) - 2-3x faster UTF-8 calculations
- [**EventualConsistency Plugin**](./docs/benchmarks/eventual-consistency.md) - 70-100% faster writes
- [**Partitions Matrix**](./docs/benchmarks/partitions.md) - Test 110 combinations to find optimal config
- [**Vector Clustering**](./docs/benchmarks/vector-clustering.md) - Vector similarity and clustering performance

**[📋 Complete Benchmark Index](./docs/benchmarks/README.md)**

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

---

## 📄 License

This project is licensed under the [Unlicense](LICENSE) - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- Built with [AWS SDK for JavaScript](https://aws.amazon.com/sdk-for-javascript/)
- Validation powered by [@icebob/fastest-validator](https://github.com/icebob/fastest-validator)
- ID generation using [nanoid](https://github.com/ai/nanoid)

---

<p align="center">
  Made with ❤️ by the s3db.js community
</p>
