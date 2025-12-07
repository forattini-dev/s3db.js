# Core Documentation

The core of s3db.js provides the fundamental building blocks for using S3 as a document database.

## Overview

s3db.js transforms AWS S3 (and compatible storage) into a powerful document database with:

- **Schema validation** using fastest-validator
- **5 behavior strategies** for handling S3's 2KB metadata limit
- **Partitioning** for O(1) queries instead of O(n) scans
- **Field-level encryption** with AES-256-GCM
- **Event system** with hooks for custom logic
- **Streaming API** for large datasets

## Core Components

### [Database](database.md)

The main entry point. Manages connections, resources, and plugins.

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@bucket?region=us-east-1'
});

await db.connect();
```

### [Resource](resource.md)

Represents a collection of records (like a table). Provides CRUD operations.

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|email|required',
    age: 'number|min:0'
  }
});

await users.insert({ name: 'John', email: 'john@example.com', age: 30 });
```

### [Schema](schema.md)

Defines field types, validation rules, and data transformations.

```javascript
const attributes = {
  // Basic types
  name: 'string|required',
  count: 'number|min:0',
  active: 'boolean',

  // Special types
  password: 'secret|required',      // Encrypted with AES-256-GCM
  vector: 'embedding:1536',         // 77% compression
  ip: 'ip4',                        // 47% compression

  // Nested objects (auto-detected!)
  profile: {
    bio: 'string|max:500',
    avatar: 'url'
  }
};
```

### [Behaviors](behaviors.md)

Strategies for handling S3's 2KB metadata limit:

| Behavior | Description |
|----------|-------------|
| `user-managed` | No automatic handling (default) |
| `enforce-limits` | Reject data exceeding 2KB |
| `truncate-data` | Truncate to fit in 2KB |
| `body-overflow` | Store overflow in S3 body |
| `body-only` | Always use S3 body |

### [Partitions](partitions.md)

Enable O(1) lookups instead of O(n) scans:

```javascript
await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    status: 'string|required',
    total: 'number'
  },
  partitions: {
    byUser: { fields: { userId: 'string' } },
    byStatus: { fields: { status: 'string' } }
  }
});

// O(1) lookup instead of scanning all orders
const userOrders = await orders.listPartition('byUser', { userId: 'user123' });
```

### [Events](events.md)

React to database operations:

```javascript
users.on('insert', (event) => {
  console.log('New user:', event.id);
});

users.on('update', (event) => {
  console.log('Updated:', event.id);
});
```

### [Encryption](encryption.md)

Field-level encryption for sensitive data:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    ssn: 'secret|required',        // Encrypted
    apiKey: 'secret|optional'      // Encrypted
  },
  passphrase: 'your-secure-passphrase'
});
```

### [Streaming](streaming.md)

Handle large datasets efficiently:

```javascript
import { ResourceReader, ResourceWriter } from 's3db.js';

// Read as stream
const reader = new ResourceReader(users);
for await (const record of reader) {
  console.log(record);
}

// Write via stream
const writer = new ResourceWriter(users);
writer.write({ name: 'Alice', email: 'alice@example.com' });
writer.end();
```

## Internals

For contributors and advanced users:

- [Distributed Lock](internals/distributed-lock.md) - S3-based distributed locking
- [Distributed Sequence](internals/distributed-sequence.md) - Atomic sequence generation
- [JSON Recovery](internals/json-recovery.md) - Self-healing corrupted metadata
- [Global Coordinator](internals/global-coordinator.md) - Plugin coordination service

## Quick Start

```javascript
import { Database } from 's3db.js';

// 1. Connect
const db = new Database({
  connectionString: 's3://KEY:SECRET@my-bucket?region=us-east-1'
});
await db.connect();

// 2. Create resource
const posts = await db.createResource({
  name: 'posts',
  attributes: {
    title: 'string|required',
    content: 'string|required',
    published: 'boolean'
  },
  behavior: 'body-overflow',  // Handle large content
  timestamps: true            // Add createdAt/updatedAt
});

// 3. CRUD operations
const post = await posts.insert({
  title: 'Hello World',
  content: 'My first post...',
  published: true
});

const found = await posts.get(post.id);
await posts.update(post.id, { published: false });
await posts.delete(post.id);

// 4. Disconnect
await db.disconnect();
```

## Next Steps

- [Getting Started Guide](/guides/getting-started.md) - Full tutorial
- [Plugins](/plugins/) - Extend functionality
- [Examples](/examples/) - 177 working examples
