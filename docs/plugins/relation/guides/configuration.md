# Configuration

> **In this guide:** All configuration options, relation types, partition setup, cascade operations, and API reference.

**Navigation:** [← Back to Relation Plugin](../README.md)

---

## Plugin Options

```javascript
new RelationPlugin({
  relations: {},      // Relation definitions (required)
  cache: true,        // Enable partition caching
  preventN1: true,    // Enable N+1 prevention
  batchSize: 100,     // Max records per batch
  parallelism: 10,    // Max concurrent S3 queries
  logLevel: 'silent'  // Log level (silent/debug)
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `relations` | object | `{}` | Relation definitions |
| `cache` | boolean | `true` | Enable partition lookup caching |
| `preventN1` | boolean | `true` | Enable N+1 query prevention |
| `batchSize` | number | `100` | Max records per batch load |
| `parallelism` | number | `10` | Max concurrent S3 queries |
| `logLevel` | string | `'silent'` | Logging level |

---

## Relation Types

| Type | Cardinality | Example | Use Case |
|------|-------------|---------|----------|
| `hasOne` | 1:1 | User → Profile | One parent, one child |
| `hasMany` | 1:n | User → Posts | One parent, many children |
| `belongsTo` | n:1 | Post → User | Many children, one parent |
| `belongsToMany` | m:n | Post ↔ Tags | Many-to-many via junction table |

---

## Relation Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | `hasOne`, `hasMany`, `belongsTo`, `belongsToMany` |
| `resource` | string | ✅ | Target resource name |
| `foreignKey` | string | ✅ | Foreign key field name |
| `localKey` | string | ❌ | Local key field (default: `'id'`) |
| `through` | string | m:n only | Junction table resource name |
| `otherKey` | string | m:n only | Other foreign key in junction table |
| `partitionHint` | string | ❌ | Explicit partition name |
| `junctionPartitionHint` | string | m:n only | Junction table partition |
| `eager` | boolean | ❌ | Auto-load (default: `false`) |
| `cascade` | array | ❌ | `['deleted', 'updated']` |

---

## hasOne (1:1)

One parent has exactly one child.

```javascript
relations: {
  users: {
    profile: {
      type: 'hasOne',
      resource: 'profiles',
      foreignKey: 'userId',      // Field in profiles table
      localKey: 'id',            // Field in users table (default)
      partitionHint: 'byUserId', // Optional: explicit partition
      cascade: ['deleted']       // Delete profile when user deleted
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
    byUserId: { fields: { userId: 'string' } }  // Critical for performance!
  }
});
```

---

## hasMany (1:n)

One parent has multiple children.

```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'userId',      // Field in posts table
      partitionHint: 'byAuthor', // Optional
      cascade: ['deleted']       // Delete posts when user deleted
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
    byAuthor: { fields: { userId: 'string' } }  // Critical for performance!
  }
});
```

---

## belongsTo (n:1)

Many children belong to one parent.

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

---

## belongsToMany (m:n)

Many-to-many via junction table.

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

**Junction Table Schema:**
```javascript
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

---

## Partition Configuration

### Why Partitions Matter

| Without Partitions | With Partitions |
|-------------------|-----------------|
| O(n) full scans | O(1) lookups |
| ~5000ms for 100 records | ~50ms for 100 records |
| 100x slower | 100x faster |

### Creating Partitions for Relations

```javascript
// Single-field partition on foreign key
await db.createResource({
  name: 'posts',
  attributes: {
    userId: 'string|required'  // Foreign key
  },
  partitions: {
    byAuthor: { fields: { userId: 'string' } }  // Single field = optimal
  }
});
```

### Partition Auto-Detection

Plugin automatically finds partitions matching the foreign key. Use `partitionHint` to force a specific partition:

```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'userId',
      partitionHint: 'byAuthor'  // Explicit partition name
    }
  }
}
```

---

## Cascade Operations

### Enable Cascade Delete

```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'userId',
      cascade: ['deleted']  // Delete posts when user deleted
    },
    profile: {
      type: 'hasOne',
      resource: 'profiles',
      foreignKey: 'userId',
      cascade: ['deleted']  // Delete profile when user deleted
    }
  }
}
```

### Cascade Options

| Option | Description |
|--------|-------------|
| `'deleted'` | Delete related records when parent is deleted |
| `'updated'` | Update related records when parent foreign key changes |

---

## API Reference

### Plugin Methods

#### getStats()

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

#### clearPartitionCache()

```javascript
plugin.clearPartitionCache();
```

### Query Options

#### include Option

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

## API Plugin Integration

When installed with API Plugin, adds `?populate=` query parameter:

```http
GET /orders?populate=customer,items.product
GET /posts?populate=author.profile,comments.author
```

- Works with nested relations (dot notation)
- Validates relation names automatically
- Returns `400 INVALID_POPULATE` on unknown paths

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Loading strategies, nested relations, real-world examples
- [Best Practices](./best-practices.md) - Performance, troubleshooting, FAQ
