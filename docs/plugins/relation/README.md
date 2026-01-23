# Relation Plugin

> **ORM-style relations, cascade operations, and partition-aware joins for S3DB.**

---

## TLDR

**ORM-like relationships for S3DB with automatic partition optimization for 10-100x faster queries.**

**1 line to get started:**
```javascript
plugins: [new RelationPlugin({ relations: { users: { posts: { type: 'hasMany', resource: 'posts', foreignKey: 'userId' } } } })]
```

**Key features:**
- 4 relation types: hasOne (1:1), hasMany (1:n), belongsTo (n:1), belongsToMany (m:n)
- Automatic partition detection - 100x faster with zero config
- Eager & lazy loading - load relations upfront or on-demand
- N+1 prevention - intelligent batch loading (1 query instead of 100)
- Cascade operations - auto-delete/update related records

**Use cases:**
- Relational data (users → posts, posts → comments)
- Complex nested queries (blog post with author, comments, tags)
- Performance optimization (partition-based joins)
- Automatic cascade cleanup

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { RelationPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// Create resources with partitions on foreign keys
await db.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    title: 'string'
  },
  partitions: {
    byAuthor: { fields: { userId: 'string' } }  // Critical for performance!
  }
});

const relationPlugin = new RelationPlugin({
  relations: {
    users: {
      posts: {
        type: 'hasMany',
        resource: 'posts',
        foreignKey: 'userId',
        partitionHint: 'byAuthor',
        cascade: ['deleted']
      }
    },
    posts: {
      author: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'userId'
      }
    }
  }
});

await db.usePlugin(relationPlugin);

// Eager loading (2 queries total)
const user = await db.resources.users.get('u1', {
  include: ['posts']
});
console.log(`${user.posts.length} posts`);

// Lazy loading
const posts = await user.posts();  // Dynamic method
```

---

## Dependencies

**Zero external dependencies** - built directly into s3db.js core.

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, relation types, partition setup, cascade operations, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Loading strategies, nested relations, N+1 prevention, real-world examples |
| [Best Practices](./guides/best-practices.md) | Performance, schema design, troubleshooting, FAQ |

---

## Quick Reference

### Relation Types

| Type | Cardinality | Example | Use Case |
|------|-------------|---------|----------|
| `hasOne` | 1:1 | User → Profile | One parent, one child |
| `hasMany` | 1:n | User → Posts | One parent, many children |
| `belongsTo` | n:1 | Post → User | Many children, one parent |
| `belongsToMany` | m:n | Post ↔ Tags | Many-to-many via junction table |

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `relations` | object | Required | Relation definitions |
| `cache` | boolean | `true` | Enable partition caching |
| `preventN1` | boolean | `true` | Enable N+1 prevention |
| `batchSize` | number | `100` | Max records per batch |
| `parallelism` | number | `10` | Max concurrent queries |

### Performance

| Scenario | Without Partitions | With Partitions |
|----------|-------------------|-----------------|
| hasMany (100 records) | ~5000ms | ~50ms (100x faster) |
| belongsTo (100 records) | ~5000ms | ~50ms (100x faster) |
| belongsToMany (50×200) | ~15000ms | ~150ms (100x faster) |

### Plugin Methods

```javascript
// Get statistics
const stats = plugin.getStats();
// { totalRelationLoads, partitionCacheHits, deduplicatedQueries, batchLoads }

// Clear partition cache
plugin.clearPartitionCache();
```

### Loading Patterns

```javascript
// Eager loading
const user = await users.get('u1', { include: ['posts', 'profile'] });

// Nested relations
const user = await users.get('u1', {
  include: {
    posts: { include: ['comments', 'tags'] }
  }
});

// Lazy loading
const posts = await user.posts();  // Dynamic method
```

---

## How It Works

1. **Define relations** in plugin config
2. **Create partitions** on foreign keys (critical for performance!)
3. **Query with `include`** for eager loading
4. **Or use dynamic methods** for lazy loading
5. Plugin automatically:
   - Detects and uses partitions (100x faster)
   - Batches queries to prevent N+1
   - Caches partition lookups
   - Deduplicates S3 calls

---

## Configuration Examples

### hasMany with Cascade

```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'userId',
      partitionHint: 'byAuthor',
      cascade: ['deleted']  // Delete posts when user deleted
    }
  }
}
```

### belongsToMany (M:N)

```javascript
relations: {
  posts: {
    tags: {
      type: 'belongsToMany',
      resource: 'tags',
      through: 'post_tags',
      foreignKey: 'postId',
      otherKey: 'tagId',
      junctionPartitionHint: 'byPost'
    }
  }
}
```

### API Plugin Integration

When installed with API Plugin, adds `?populate=` query parameter:

```http
GET /orders?populate=customer,items.product
```

---

## See Also

- [Cache Plugin](../cache/README.md) - Faster relation loading
- [Metrics Plugin](../metrics/README.md) - Monitor performance
- [Audit Plugin](../audit/README.md) - Track changes
