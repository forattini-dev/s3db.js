# Getting Started

This guide will help you get up and running with s3db.js in minutes.

## Installation

```bash
# Using pnpm (recommended)
pnpm add s3db.js

# Using npm
npm install s3db.js

# Using yarn
yarn add s3db.js
```

## Prerequisites

- Node.js 18+ or Bun
- An S3-compatible storage:
  - AWS S3
  - MinIO (local/self-hosted)
  - DigitalOcean Spaces
  - Cloudflare R2
  - Or use MemoryClient for testing

## Quick Start

### 1. Create a Database Connection

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@mybucket?region=us-east-1'
});

await db.connect();
```

### 2. Define a Resource

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    age: 'number|optional|min:0',
    status: 'string|default:active'
  },
  timestamps: true  // Adds createdAt, updatedAt
});
```

### 3. CRUD Operations

```javascript
// Create
const user = await users.insert({
  email: 'alice@example.com',
  name: 'Alice',
  age: 30
});
console.log('Created:', user.id);

// Read
const retrieved = await users.get(user.id);

// Update
await users.update(user.id, { age: 31 });

// Delete
await users.delete(user.id);

// List
const allUsers = await users.list();
```

## Connection Strings

### AWS S3

```javascript
const db = new Database({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@mybucket?region=us-east-1'
});
```

### MinIO (Local Development)

```bash
# Start MinIO with Docker
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

```javascript
const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/mybucket'
});
```

### Memory (Testing)

```javascript
const db = new Database({
  connectionString: 'memory://testbucket/myapp'
});
```

### FileSystem (Local)

```javascript
const db = new Database({
  connectionString: 'file:///tmp/s3db-data'
});
```

## Schema Types

s3db.js supports 30+ field types:

```javascript
const posts = await db.createResource({
  name: 'posts',
  attributes: {
    // Strings
    title: 'string|required',
    slug: 'string|optional',

    // Numbers
    views: 'number|default:0',
    rating: 'number|min:0|max:5',

    // Booleans
    published: 'boolean|default:false',

    // Dates
    publishedAt: 'date|optional',

    // Arrays
    tags: 'array|items:string',

    // Objects (auto-detected!)
    metadata: {
      author: 'string',
      category: 'string'
    },

    // Encrypted fields
    secretNotes: 'secret|optional',

    // Special types
    email: 'email|required',
    url: 'url|optional',
    ip: 'ip4|optional',
    embedding: 'embedding:1536'  // Vector embeddings
  }
});
```

## Behaviors (2KB Limit)

S3 metadata has a 2KB limit. Behaviors handle this automatically:

```javascript
const resource = await db.createResource({
  name: 'documents',
  attributes: { ... },
  behavior: 'body-overflow'  // Default: auto-overflow to body
});
```

| Behavior | Use Case |
|----------|----------|
| `body-overflow` | Default, auto-splits data |
| `body-only` | Always store in body (>2KB data) |
| `enforce-limits` | Fail if data exceeds 2KB |
| `truncate-data` | Truncate to fit (data loss!) |
| `user-managed` | Manual handling via events |

## Partitions (Indexed Queries)

Speed up queries with partitions:

```javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    customerId: 'string|required',
    status: 'string|required',
    total: 'number|required'
  },
  partitions: {
    byCustomer: { fields: { customerId: 'string' } },
    byStatus: { fields: { status: 'string' } }
  }
});

// O(1) lookup instead of O(n) scan
const pendingOrders = await orders.listPartition('byStatus', {
  status: 'pending'
});
```

## Hooks

Execute code before/after operations:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { ... },
  hooks: {
    beforeInsert: async (data) => {
      data.slug = slugify(data.name);
      return data;
    },
    afterInsert: async (result) => {
      console.log('User created:', result.id);
    },
    beforeUpdate: async (id, data) => {
      data.updatedBy = getCurrentUser();
      return data;
    }
  }
});
```

## Events

Listen to resource events:

```javascript
users.on('inserted', ({ id, data }) => {
  console.log('New user:', id);
});

users.on('updated', ({ id, data, previous }) => {
  console.log('User updated:', id);
});

users.on('deleted', ({ id }) => {
  console.log('User deleted:', id);
});
```

## Plugins

Extend functionality with plugins:

```javascript
import { Database } from 's3db.js';
import { CachePlugin, TTLPlugin, ApiPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: '...',
  plugins: [
    new CachePlugin({ driver: 'memory', ttl: 300000 }),
    new TTLPlugin({ defaultTTL: 86400000 }),
    new ApiPlugin({ port: 3000 })
  ]
});

await db.connect();
```

Popular plugins:
- **CachePlugin**: In-memory/S3/filesystem caching
- **TTLPlugin**: Auto-delete expired records
- **ApiPlugin**: REST API with OpenAPI docs
- **AuditPlugin**: Track all changes
- **ReplicatorPlugin**: Sync to PostgreSQL/BigQuery

## Environment Variables

```bash
# .env
S3_CONNECTION_STRING=s3://KEY:SECRET@bucket?region=us-east-1
ENCRYPTION_KEY=your-secret-passphrase-here
LOG_LEVEL=info
```

```javascript
const db = new Database({
  connectionString: process.env.S3_CONNECTION_STRING,
  passphrase: process.env.ENCRYPTION_KEY,
  logLevel: process.env.LOG_LEVEL
});
```

## Error Handling

```javascript
import { ResourceNotFound, ValidationError } from 's3db.js/errors';

try {
  const user = await users.get('nonexistent');
} catch (err) {
  if (err instanceof ResourceNotFound) {
    console.log('User not found');
  } else if (err instanceof ValidationError) {
    console.log('Validation failed:', err.message);
  } else {
    throw err;
  }
}
```

## TypeScript

s3db.js includes TypeScript definitions:

```typescript
import { Database, Resource } from 's3db.js';

interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

const db = new Database({ connectionString: '...' });
await db.connect();

const users = await db.createResource<User>({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required'
  },
  timestamps: true
});

const user: User = await users.insert({
  email: 'alice@example.com',
  name: 'Alice'
});
```

## CLI

s3db.js includes a CLI for database operations:

```bash
# List resources
s3db list

# Query a resource
s3db query users --limit 10

# Insert a record
s3db insert users -d '{"email":"a@b.com","name":"Alice"}'

# Get a record
s3db get users abc123

# Delete a record
s3db delete users abc123
```

## Next Steps

- [Database](../core/database.md) - Full Database API
- [Resource](../core/resource.md) - CRUD operations deep dive
- [Schema](../core/schema.md) - All field types and validation
- [Partitions](../core/partitions.md) - Query optimization
- [Plugins](../plugins/README.md) - Available plugins
- [Examples](../examples/README.md) - 170+ examples

## Example: Complete Application

```javascript
import { Database } from 's3db.js';
import { CachePlugin, TTLPlugin } from 's3db.js/plugins';

// Initialize
const db = new Database({
  connectionString: process.env.S3_CONNECTION_STRING,
  passphrase: process.env.ENCRYPTION_KEY,
  logLevel: 'info',
  plugins: [
    new CachePlugin({ driver: 'memory', ttl: 60000 }),
    new TTLPlugin()
  ]
});

await db.connect();

// Define resources
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    password: 'secret|required',
    role: 'string|default:user'
  },
  timestamps: true,
  partitions: {
    byRole: { fields: { role: 'string' } }
  }
});

const sessions = await db.createResource({
  name: 'sessions',
  attributes: {
    userId: 'string|required',
    token: 'string|required',
    expiresAt: 'date|required'
  },
  ttl: 86400000  // Auto-delete after 24h
});

// Use the database
const user = await users.insert({
  email: 'admin@example.com',
  name: 'Admin',
  password: 'secretPassword',
  role: 'admin'
});

const session = await sessions.insert({
  userId: user.id,
  token: crypto.randomUUID(),
  expiresAt: new Date(Date.now() + 86400000)
});

console.log('User created:', user.id);
console.log('Session token:', session.token);

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  await db.disconnect();
  process.exit(0);
});
```
