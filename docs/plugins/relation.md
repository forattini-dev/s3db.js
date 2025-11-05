# 🔗 Relation Plugin

> **ORM-style relations, cascade operations, and partition-aware joins for S3DB.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#configuration) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**ORM-like relationships for S3DB** with automatic partition optimization for 10-100x faster queries.

**1 line to get started:**
```javascript
plugins: [new RelationPlugin({ relations: { users: { posts: { type: 'hasMany', resource: 'posts', foreignKey: 'userId' } } } })]
```

**Key features:**
- ✅ **4 relation types**: hasOne (1:1), hasMany (1:n), belongsTo (n:1), belongsToMany (m:n)
- ✅ **Automatic partition detection** - 100x faster with zero config
- ✅ **Eager & lazy loading** - load relations upfront or on-demand
- ✅ **N+1 prevention** - intelligent batch loading (1 query instead of 100)
- ✅ **Nested relations** - load relations of relations
- ✅ **Cascade operations** - auto-delete/update related records
- ✅ **Cache integration** - works with CachePlugin
- ✅ **Query deduplication** - 30-80% fewer S3 calls

**When to use:**
- 🔗 Relational data (users → posts, posts → comments)
- 📊 Complex nested queries (blog post with author, comments, tags)
- 🚀 Performance optimization (partition-based joins)
- 💾 Automatic cascade cleanup
- 🎯 ORM-like development experience

**Access:**
```javascript
// Eager loading
const user = await users.get('u1', { include: ['posts', 'profile'] });
console.log(`${user.posts.length} posts`);

// Lazy loading
const posts = await user.posts();  // Dynamic method

// Stats
const stats = relationPlugin.getStats();
console.log('Partition cache hits:', stats.partitionCacheHits);
```

---

## 🚀 Quick Start

```javascript
import { S3db, RelationPlugin } from 's3db.js';

// 1. Create resources with partitions on foreign keys
const db = new S3db({
  connectionString: "s3://KEY:SECRET@bucket/path"
});

await db.connect();

// Users resource
await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    name: 'string',
    email: 'string'
  }
});

// Posts resource with partition on userId for 100x faster queries
await db.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    userId: 'string|required',  // Foreign key
    title: 'string',
    content: 'string'
  },
  partitions: {
    byAuthor: { fields: { userId: 'string' } }  // ← Critical for performance!
  }
});

// Profiles resource
await db.createResource({
  name: 'profiles',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    bio: 'string',
    avatar: 'string'
  },
  partitions: {
    byUserId: { fields: { userId: 'string' } }  // ← Critical for performance!
  }
});

// 2. Install RelationPlugin with relation definitions
const relationPlugin = new RelationPlugin({
  relations: {
    users: {
      // 1:n - one user has many posts
      posts: {
        type: 'hasMany',
        resource: 'posts',
        foreignKey: 'userId',
        partitionHint: 'byAuthor',  // Use this partition (auto-detected if omitted)
        cascade: ['deleted']          // Delete posts when user deleted
      },

      // 1:1 - one user has one profile
      profile: {
        type: 'hasOne',
        resource: 'profiles',
        foreignKey: 'userId',
        partitionHint: 'byUserId',
        cascade: ['deleted']
      }
    },

    posts: {
      // n:1 - many posts belong to one user
      author: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'userId'
      }
    }
  },

  cache: true,      // Enable partition cache (default)
  preventN1: true,  // Enable N+1 prevention (default)
  verbose: false    // Debug logging
});

await db.usePlugin(relationPlugin);

// 3. Use relations!

// Eager loading - load relations upfront (2 queries total)
const user = await db.resources.users.get('u1', {
  include: ['posts', 'profile']
});

console.log(`User: ${user.name}`);
console.log(`Bio: ${user.profile.bio}`);
console.log(`Posts: ${user.posts.length}`);

// Lazy loading - load on demand
const user2 = await db.resources.users.get('u2');
const posts = await user2.posts();  // ← Dynamic method, uses partition automatically
const profile = await user2.profile();

// Nested relations - load relations of relations
const user3 = await db.resources.users.get('u3', {
  include: {
    posts: {
      include: ['author']  // Load posts and their authors
    }
  }
});

// Batch loading - N+1 prevention (only 2 queries, not 101!)
const users = await db.resources.users.list({
  limit: 100,
  include: ['posts']  // Plugin batches the post queries
});

// 4. Check performance stats
const stats = relationPlugin.getStats();
console.log('Performance Stats:');
console.log('- Total relation loads:', stats.totalRelationLoads);
console.log('- Partition cache hits:', stats.partitionCacheHits);
console.log('- Deduped queries:', stats.deduplicatedQueries);
console.log('- Batch loads:', stats.batchLoads);
```

---

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [📖 Overview](#-overview)
- [✨ Key Features](#-key-features)
- [📊 Performance](#-performance)
- [⚙️ Configuration](#️-configuration)
- [🔗 Relation Types](#-relation-types)
  - [hasOne (1:1)](#1-hasone-11)
  - [hasMany (1:n)](#2-hasmany-1n)
  - [belongsTo (n:1)](#3-belongsto-n1)
  - [belongsToMany (m:n)](#4-belongstomany-mn)
- [💡 Usage Examples](#-usage-examples)
- [⚡ Performance Optimization](#-performance-optimization)
- [📚 API Reference](#-api-reference)
- [✅ Best Practices](#-best-practices)
- [🔧 Troubleshooting](#-troubleshooting)
- [🌍 Real-World Examples](#-real-world-examples)

---

## 📖 Overview

The **RelationPlugin** brings ORM-like relationship capabilities to S3DB, enabling you to define and query relationships between resources (hasOne, hasMany, belongsTo, belongsToMany) with automatic performance optimization.

### Supported Relationship Types

| Type | Cardinality | Example | Use Case |
|------|-------------|---------|----------|
| `hasOne` | 1:1 | User → Profile | One parent, one child |
| `hasMany` | 1:n | User → Posts | One parent, many children |
| `belongsTo` | n:1 | Post → User | Many children, one parent |
| `belongsToMany` | m:n | Post ↔ Tags | Many-to-many via junction table |

### How It Works

1. **Define relations** in plugin config
2. **Create partitions** on foreign keys (critical for performance!)
3. **Query with `include`** for eager loading
4. **Or use dynamic methods** for lazy loading
5. Plugin automatically:
   - ✅ Detects and uses partitions (100x faster)
   - ✅ Batches queries to prevent N+1
   - ✅ Caches partition lookups
   - ✅ Deduplicates S3 calls

---

## ✨ Key Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Eager Loading** | Load relations upfront with `include` option |
| **Lazy Loading** | Load on-demand with dynamic methods (`user.posts()`) |
| **Nested Relations** | Load relations of relations (`user.posts.comments`) |
| **Cascade Operations** | Auto-delete/update related records |
| **N+1 Prevention** | Intelligent batch loading |
| **Cache Integration** | Works seamlessly with CachePlugin |

### Automatic Performance Optimizations

| Optimization | Benefit |
|--------------|---------|
| **Partition Auto-Detection** | Finds and uses partitions automatically |
| **Partition Caching** | 100% faster on repeated operations |
| **Query Deduplication** | 30-80% fewer S3 calls |
| **Controlled Parallelism** | Configurable batch loading (default: 10 concurrent) |
| **Cascade Optimization** | Uses partitions in cascade operations |
| **Zero Configuration** | All optimizations work automatically |

---

## 📊 Performance

### Benchmarks

**Without Partitions (full scans):**
- `hasMany(100 records)`: ~5000ms
- `belongsTo(100 records)`: ~5000ms
- `belongsToMany(50 posts, 200 tags)`: ~15000ms

**With Partitions (O(1) lookups):**
- `hasMany(100 records)`: ~50ms → **100x faster** ⚡
- `belongsTo(100 records)`: ~50ms → **100x faster** ⚡
- `belongsToMany(50 posts, 200 tags)`: ~150ms → **100x faster** ⚡

**With Deduplication:**
- Loading same author for 100 posts: **1 query instead of 100** → 30-80% reduction

### Performance Tips

✅ **DO**: Create single-field partitions on foreign keys
❌ **DON'T**: Use multi-field partitions for simple lookups
✅ **DO**: Use eager loading for bulk operations
❌ **DON'T**: Use lazy loading in loops (N+1 problem)
✅ **DO**: Monitor with `verbose: true`
✅ **DO**: Check stats with `getStats()`

---

## ⚙️ Configuration

### Plugin Options

```javascript
new RelationPlugin({
  relations: {},      // Relation definitions (required)
  cache: true,        // Enable partition caching
  preventN1: true,    // Enable N+1 prevention
  batchSize: 100,     // Max records per batch
  parallelism: 10,    // Max concurrent S3 queries
  verbose: false      // Debug logging
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `relations` | object | `{}` | Relation definitions (see below) |
| `cache` | boolean | `true` | Enable partition lookup caching |
| `preventN1` | boolean | `true` | Enable N+1 query prevention |
| `batchSize` | number | `100` | Max records per batch load |
| `parallelism` | number | `10` | Max concurrent S3 queries |
| `verbose` | boolean | `false` | Enable debug logging |

### Relation Configuration

Each relation is defined with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `hasOne`, `hasMany`, `belongsTo`, `belongsToMany` |
| `resource` | string | ✅ | Target resource name |
| `foreignKey` | string | ✅ | Foreign key field name |
| `localKey` | string | ❌ | Local key field (default: `'id'`) |
| `through` | string | **m:n only** | Junction table resource name |
| `otherKey` | string | **m:n only** | Other foreign key in junction table |
| `partitionHint` | string | ❌ | Explicit partition name |
| `junctionPartitionHint` | string | **m:n only** | Junction table partition |
| `eager` | boolean | ❌ | Auto-load (default: `false`) |
| `cascade` | array | ❌ | `['deleted', 'updated']` |

### API Plugin Integration

When you install the [API Plugin](./api.md) after the RelationPlugin, every REST endpoint gains a `?populate=` query parameter:

```http
GET /orders?populate=customer,items.product
```

- Works with nested relations (`items.product.manufacturer`)
- Validates relation names automatically (`400 INVALID_POPULATE` on unknown paths)
- Uses the same eager-loading engine as the `include` option in code

No additional configuration is required—just ensure the RelationPlugin is registered before the API Plugin.

---

## 🔗 Relation Types

### 1. hasOne (1:1)

**One parent has exactly one child.**

**Example:** User → Profile

```javascript
relations: {
  users: {
    profile: {
      type: 'hasOne',
      resource: 'profiles',
      foreignKey: 'userId',      // Field in profiles table
      localKey: 'id',            // Field in users table (default)
      partitionHint: 'byUserId', // Optional: explicit partition
      cascade: ['deleted']        // Delete profile when user deleted
    }
  }
}
```

**Schema Setup:**
```javascript
await db.createResource({
  name: 'profiles',
  attributes: {
    id: 'string|required',
    userId: 'string|required',  // Foreign key
    bio: 'string',
    avatar: 'string'
  },
  partitions: {
    byUserId: { fields: { userId: 'string' } }  // ← Critical!
  }
});
```

**Usage:**
```javascript
// Eager
const user = await users.get('u1', { include: ['profile'] });
console.log(user.profile.bio);

// Lazy
const profile = await user.profile();
```

---

### 2. hasMany (1:n)

**One parent has multiple children.**

**Example:** User → Posts

```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'userId',      // Field in posts table
      partitionHint: 'byAuthor', // Optional
      cascade: ['deleted']        // Delete posts when user deleted
    }
  }
}
```

**Schema Setup:**
```javascript
await db.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    userId: 'string|required',  // Foreign key
    title: 'string',
    content: 'string'
  },
  partitions: {
    byAuthor: { fields: { userId: 'string' } }  // ← Critical!
  }
});
```

**Usage:**
```javascript
// Eager
const user = await users.get('u1', { include: ['posts'] });
console.log(`${user.posts.length} posts`);

// Lazy
const posts = await user.posts();  // Returns array
```

---

### 3. belongsTo (n:1)

**Many children belong to one parent.**

**Example:** Post → User

```javascript
relations: {
  posts: {
    author: {
      type: 'belongsTo',
      resource: 'users',
      foreignKey: 'userId',  // Field in posts table
      localKey: 'id'         // Field in users table
    }
  }
}
```

**Usage:**
```javascript
// Eager
const post = await posts.get('p1', { include: ['author'] });
console.log(`By ${post.author.name}`);

// Lazy
const author = await post.author();  // Returns single object
```

---

### 4. belongsToMany (m:n)

**Many-to-many via junction table.**

**Example:** Post ↔ Tags

```javascript
relations: {
  posts: {
    tags: {
      type: 'belongsToMany',
      resource: 'tags',
      through: 'post_tags',           // Junction table
      foreignKey: 'postId',           // Field in junction
      otherKey: 'tagId',              // Other field in junction
      junctionPartitionHint: 'byPost',
      partitionHint: 'byId'
    }
  },
  tags: {
    posts: {
      type: 'belongsToMany',
      resource: 'posts',
      through: 'post_tags',
      foreignKey: 'tagId',
      otherKey: 'postId',
      junctionPartitionHint: 'byTag'
    }
  }
}
```

**Schema Setup:**
```javascript
// Junction table - partition on BOTH foreign keys!
await db.createResource({
  name: 'post_tags',
  attributes: {
    id: 'string|required',
    postId: 'string|required',
    tagId: 'string|required'
  },
  partitions: {
    byPost: { fields: { postId: 'string' } },  // For post.tags()
    byTag: { fields: { tagId: 'string' } }     // For tag.posts()
  }
});
```

**Usage:**
```javascript
// Load post with tags
const post = await posts.get('p1', { include: ['tags'] });
console.log(post.tags.map(t => t.name));  // ['nodejs', 'database']

// Load tag with posts
const tag = await tags.get('t1', { include: ['posts'] });
```

---

## 💡 Usage Examples

### Basic Eager Loading

```javascript
// Single relation
const user = await users.get('u1', { include: ['profile'] });

// Multiple relations
const user = await users.get('u1', { include: ['profile', 'posts'] });

// With list
const allUsers = await users.list({ include: ['posts'] });
```

### Nested Relations

```javascript
// Load relations of relations
const user = await users.get('u1', {
  include: {
    posts: {
      include: ['comments', 'tags']
    },
    profile: true
  }
});

// Access nested
user.posts.forEach(post => {
  console.log(`${post.title}: ${post.comments.length} comments`);
});
```

### Lazy Loading

```javascript
const user = await users.get('u1');

// Load on demand
const posts = await user.posts();      // Array
const profile = await user.profile();  // Object

// Cached - second call returns cached
const samePosts = await user.posts();  // No S3 query
```

### Batch Loading (N+1 Prevention)

```javascript
// Load 100 users - only 2 queries!
const users = await users.list({
  limit: 100,
  include: ['posts']
});

// Without plugin: 101 queries (1 + 100)
// With plugin: 2 queries (batched) ⚡
```

### Cascade Delete

```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'userId',
      cascade: ['deleted']  // ← Enable cascade
    }
  }
}

// Delete user - all posts deleted automatically
await users.delete('u1');
```

---

## ⚡ Performance Optimization

### Best Practices

#### 1. Always Create Partitions on Foreign Keys

```javascript
// ✅ GOOD: Partition on foreign key
await db.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    userId: 'string|required'
  },
  partitions: {
    byUserId: { fields: { userId: 'string' } }  // ← 100x faster!
  }
});

// ❌ BAD: No partition = full scan
await db.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    userId: 'string|required'
  }
  // Missing partition = O(n) queries
});
```

#### 2. Use Single-Field Partitions

```javascript
// ✅ GOOD
partitions: {
  byUserId: { fields: { userId: 'string' } }
}

// ❌ AVOID (slower for simple lookups)
partitions: {
  byUserAndDate: {
    fields: {
      userId: 'string',
      createdAt: 'number'
    }
  }
}
```

#### 3. Partition Junction Tables on Both Directions

```javascript
// ✅ GOOD
await db.createResource({
  name: 'post_tags',
  partitions: {
    byPost: { fields: { postId: 'string' } },  // For post.tags()
    byTag: { fields: { tagId: 'string' } }     // For tag.posts()
  }
});
```

#### 4. Use Eager Loading for Bulk Operations

```javascript
// ✅ GOOD: Eager (2 queries)
const users = await users.list({
  limit: 100,
  include: ['posts']
});

// ❌ BAD: Lazy in loop (101 queries)
const users = await users.list({ limit: 100 });
for (const user of users) {
  await user.posts();  // N+1!
}
```

#### 5. Monitor with Verbose Mode

```javascript
const plugin = new RelationPlugin({ verbose: true });

// Shows:
// [RelationPlugin] Loading hasMany 'posts' for user 'u1'
// [RelationPlugin] ✅ Using partition 'byAuthor' (O(1))
// [RelationPlugin] Query took 45ms
```

---

## 📚 API Reference

### Plugin Methods

#### `getStats()`

Returns performance statistics.

```javascript
const stats = plugin.getStats();
// {
//   totalRelationLoads: 150,
//   partitionCacheHits: 120,
//   deduplicatedQueries: 45,
//   batchLoads: 8,
//   cascadeDeletes: 2,
//   cascadeUpdates: 0
// }
```

#### `clearPartitionCache()`

Clears the partition lookup cache.

```javascript
plugin.clearPartitionCache();
```

### Query Options

#### `include` Option

**Simple:**
```javascript
{ include: ['profile', 'posts'] }
```

**Nested:**
```javascript
{
  include: {
    posts: {
      include: ['comments', 'tags']
    },
    profile: true
  }
}
```

**With limits:**
```javascript
{
  include: {
    posts: {
      limit: 10,
      include: ['comments']
    }
  }
}
```

### Dynamic Relation Methods

After plugin installation, records get dynamic methods:

```javascript
const user = await users.get('u1');

// hasOne / belongsTo (returns object)
const profile = await user.profile();

// hasMany / belongsToMany (returns array)
const posts = await user.posts();
```

---

## ✅ Best Practices

### 1. Schema Design

```javascript
// ✅ Best practice: foreign key + partition
await db.createResource({
  name: 'comments',
  attributes: {
    id: 'string|required',
    postId: 'string|required',    // Foreign key
    userId: 'string|required',    // Author
    content: 'string'
  },
  partitions: {
    byPost: { fields: { postId: 'string' } },    // For post.comments()
    byAuthor: { fields: { userId: 'string' } }   // For user.comments()
  }
});
```

### 2. Relation Configuration

```javascript
// ✅ Clear naming and cascade
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'authorId',      // Descriptive
      partitionHint: 'byAuthor',   // Explicit
      cascade: ['deleted']          // Cleanup
    }
  }
}
```

### 3. Query Patterns

```javascript
// ✅ GOOD: Load upfront
const posts = await posts.list({
  limit: 20,
  include: {
    author: true,
    comments: { include: ['author'] },
    tags: true
  }
});

// ❌ BAD: Lazy in loops
const posts = await posts.list({ limit: 20 });
for (const post of posts) {
  await post.author();     // N+1!
  await post.comments();   // N+1!
}
```

---

## 🔧 Troubleshooting

### "No partition found" Warnings

**Symptom:**
```
[RelationPlugin] Warning: No partition found for hasMany 'posts'
[RelationPlugin] Falling back to full scan (slow)
```

**Solution:**
```javascript
partitions: {
  byUserId: { fields: { userId: 'string' } }
}
```

### Slow Relation Loading

**Debug:**
1. Enable verbose: `new RelationPlugin({ verbose: true })`
2. Check stats: `plugin.getStats()`
3. Verify partitions exist

### High Query Counts

**Solutions:**
1. Use eager loading instead of lazy
2. Enable N+1 prevention: `preventN1: true`
3. Check deduplication: `stats.deduplicatedQueries`

### Cascade Not Working

**Solution:**
```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'userId',
      cascade: ['deleted']  // ← Must specify
    }
  }
}
```

---

## 🌍 Real-World Examples

### Blog System

```javascript
const plugin = new RelationPlugin({
  relations: {
    users: {
      posts: {
        type: 'hasMany',
        resource: 'posts',
        foreignKey: 'authorId',
        partitionHint: 'byAuthor',
        cascade: ['deleted']
      },
      profile: {
        type: 'hasOne',
        resource: 'profiles',
        foreignKey: 'userId',
        cascade: ['deleted']
      }
    },
    posts: {
      author: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'authorId'
      },
      comments: {
        type: 'hasMany',
        resource: 'comments',
        foreignKey: 'postId',
        partitionHint: 'byPost',
        cascade: ['deleted']
      },
      tags: {
        type: 'belongsToMany',
        resource: 'tags',
        through: 'post_tags',
        foreignKey: 'postId',
        otherKey: 'tagId'
      }
    }
  }
});

// Usage
const post = await posts.get('post-123', {
  include: {
    author: { include: ['profile'] },
    comments: { include: ['author'], limit: 50 },
    tags: true
  }
});
```

### E-commerce

```javascript
const plugin = new RelationPlugin({
  relations: {
    users: {
      orders: {
        type: 'hasMany',
        resource: 'orders',
        foreignKey: 'userId',
        partitionHint: 'byCustomer'
      }
    },
    orders: {
      customer: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'userId'
      },
      items: {
        type: 'hasMany',
        resource: 'order_items',
        foreignKey: 'orderId',
        partitionHint: 'byOrder',
        cascade: ['deleted']
      }
    }
  }
});

// Usage
const order = await orders.get('order-456', {
  include: {
    customer: true,
    items: { include: ['product'] }
  }
});
```

---

## ❓ FAQ

### Do I need to recreate resources to use relations?
No. Define relations against your existing resources. Adding partitions matching foreign keys dramatically improves performance but is optional.

### Can relations coexist with custom business logic?
Yes. Relations simply add helpers and hooks; your existing resource methods continue working. You can mix manual queries with relation-powered helpers.

### How do I prevent cascades from removing data?
Leave `cascade` unset (default) or specify only the operations you need (e.g., `cascade: ['deleted']`). Nothing cascades unless explicitly configured.

---

## Summary

The **RelationPlugin** provides:
- ✅ Full ORM-like relationships (hasOne, hasMany, belongsTo, belongsToMany)
- ✅ Automatic partition optimization (100x faster with zero config)
- ✅ N+1 prevention with intelligent batching
- ✅ Nested relation loading
- ✅ Cascade operations
- ✅ Cache integration
- ✅ Production-ready performance

**Key to Performance**: Create partitions on all foreign keys! 🚀
