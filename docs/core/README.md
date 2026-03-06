# Core Documentation

This section is the real center of s3db.js. It explains the database model, resources, schema system, storage behaviors, partitions, hooks, events, streaming, and the runtime internals that make the rest of the platform possible.

**Navigation:** [← Introduction](/) | [Clients](/clients/README.md) | [Plugins](/plugins/README.md)

---

## TLDR

- If you want to understand s3db.js, start with `Resource`, not plugins.
- The three core ideas are: schema-driven resources, behavior strategies for the 2KB metadata limit, and partitions for O(1)-style access patterns.
- Most day-to-day application work lives in four docs: [Database](./database.md), [Resource](./resource.md), [Schema](./schema.md), and [Partitions](./partitions.md).

## Table of Contents

- [What Makes Core Different](#what-makes-core-different)
- [Start Here](#start-here)
- [Core Components](#core-components)
- [Resource Method Map](#resource-method-map)
- [Common Learning Paths](#common-learning-paths)
- [Internals](#internals)
- [Quick Start](#quick-start)
- [Next Steps](#next-steps)

## What Makes Core Different

s3db.js turns S3-compatible storage into a document database by combining:

- **schema validation** using fastest-validator
- **behavior strategies** for the 2KB metadata limit
- **partitions** for O(1)-style access instead of O(n) scans
- **field-level encryption** with AES-256-GCM
- **hooks, middlewares, and events** for custom logic and observability
- **streaming APIs** for large datasets and batch processing

The plugin layer builds on top of this. If the core model is clear, the rest of the project gets much easier to reason about.

## Start Here

Use this order if you are new to the core:

1. [Database](./database.md) to understand connection, resource registration, and plugin installation.
2. [Resource](./resource.md) to learn the main abstraction and the CRUD/query surface.
3. [Schema](./schema.md) to define fields, validation, custom types, and transformations.
4. [Partitions](./partitions.md) to avoid expensive full scans.
5. [Behaviors](./behaviors.md) to decide what happens when records exceed metadata limits.

If you are already using resources in production, the most important advanced docs are:

- [Events](./events.md)
- [Streaming](./streaming.md)
- [Encryption](./encryption.md)

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

This is the most important doc in the entire core section because it brings together:

- schema
- behaviors
- partitions
- methods
- hooks
- middlewares
- events
- versioning

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

Read this earlier than most people think. Partition design is one of the biggest factors in whether a resource feels instant or expensive.

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
  security: {
    passphrase: 'your-secure-passphrase',
  },
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

## Resource Method Map

If you are looking for “the main methods”, start here:

| Goal | Primary Methods | Read |
| --- | --- | --- |
| Create and mutate one record | `insert`, `update`, `patch`, `replace`, `delete` | [Resource](./resource.md#resource-methods) |
| Work in batches | `insertMany`, `getMany`, `deleteMany` | [Resource](./resource.md#resource-methods) |
| Read collections | `list`, `listIds`, `count`, `page`, `query` | [Resource](./resource.md#resource-methods) |
| Read by partition directly | `listPartition`, `getFromPartition` | [Partitions](./partitions.md) |
| Add lifecycle logic | hooks, middlewares, events | [Resource](./resource.md#hooks-system), [Resource](./resource.md#middlewares), [Events](./events.md) |
| Handle large payloads | `behavior`, binary content, streaming | [Behaviors](./behaviors.md), [Streaming](./streaming.md), [Resource](./resource.md#binary-content) |

## Common Learning Paths

### I just want normal CRUD

Read:

- [Database](./database.md)
- [Resource](./resource.md)
- [Schema](./schema.md)

### I need fast query patterns

Read:

- [Partitions](./partitions.md)
- [Resource](./resource.md#partitioning)
- [Resource](./resource.md#resource-methods)

### I need hooks, auditing, or custom logic

Read:

- [Resource](./resource.md#hooks-system)
- [Resource](./resource.md#middlewares)
- [Events](./events.md)

### I store large or irregular documents

Read:

- [Behaviors](./behaviors.md)
- [Resource](./resource.md#binary-content)
- [Streaming](./streaming.md)

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
- [Plugins](/plugins/README.md) - Extend functionality
- [Examples](/examples/README.md) - Working examples across core and plugins
