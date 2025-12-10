# Best Practices & FAQ

> **In this guide:** Performance optimization, schema design, troubleshooting, and comprehensive FAQ.

**Navigation:** [← Back to Relation Plugin](../README.md) | [Configuration](./configuration.md)

---

## Performance Optimization

### Always Create Partitions on Foreign Keys

```javascript
// ✅ GOOD: Partition on foreign key (100x faster)
await db.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    userId: 'string|required'
  },
  partitions: {
    byUserId: { fields: { userId: 'string' } }
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

### Use Single-Field Partitions

```javascript
// ✅ GOOD: Single field partition
partitions: {
  byUserId: { fields: { userId: 'string' } }
}

// ❌ AVOID: Multi-field partitions (slower for simple lookups)
partitions: {
  byUserAndDate: {
    fields: {
      userId: 'string',
      createdAt: 'number'
    }
  }
}
```

### Partition Junction Tables on Both Directions

```javascript
// ✅ GOOD: Both directions partitioned
await db.createResource({
  name: 'post_tags',
  partitions: {
    byPost: { fields: { postId: 'string' } },  // For post.tags()
    byTag: { fields: { tagId: 'string' } }     // For tag.posts()
  }
});
```

### Use Eager Loading for Bulk Operations

```javascript
// ✅ GOOD: Eager (2 queries)
const users = await users.list({
  limit: 100,
  include: ['posts']
});

// ❌ BAD: Lazy in loop (101 queries - N+1 problem!)
const users = await users.list({ limit: 100 });
for (const user of users) {
  await user.posts();  // N+1!
}
```

### Performance Benchmarks

| Scenario | Without Partitions | With Partitions |
|----------|-------------------|-----------------|
| hasMany (100 records) | ~5000ms | ~50ms |
| belongsTo (100 records) | ~5000ms | ~50ms |
| belongsToMany (50×200) | ~15000ms | ~150ms |

---

## Schema Design

### Best Practice Pattern

```javascript
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

### Relation Configuration Pattern

```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'authorId',      // Descriptive name
      partitionHint: 'byAuthor',   // Explicit partition
      cascade: ['deleted']         // Cleanup on delete
    }
  }
}
```

---

## Troubleshooting

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

**Debug steps:**
1. Enable debug mode: `new RelationPlugin({ logLevel: 'debug' })`
2. Check stats: `plugin.getStats()`
3. Verify partitions exist on foreign keys
4. Use eager loading instead of lazy in loops

### High Query Counts

**Solutions:**
1. Use eager loading with `include`
2. Enable N+1 prevention: `preventN1: true` (default)
3. Check deduplication stats

### Cascade Not Working

**Solution:** Ensure `cascade` is configured:
```javascript
relations: {
  users: {
    posts: {
      type: 'hasMany',
      resource: 'posts',
      foreignKey: 'userId',
      cascade: ['deleted']  // Must specify explicitly
    }
  }
}
```

### Dynamic Methods Not Available

**Solution:** Ensure plugin is installed before fetching records:
```javascript
await db.usePlugin(relationPlugin);  // Before get/list
const user = await users.get('u1');
await user.posts();  // Now available
```

### Relations Returning null/undefined

**Check:**
1. Foreign key values match
2. Related records exist
3. Resource names spelled correctly
4. Relations defined in correct direction

---

## FAQ

### General

**Q: What does the RelationPlugin do?**

A: Provides ORM-like relationships (hasOne, hasMany, belongsTo, belongsToMany) with automatic partition optimization, N+1 prevention, and cascade operations.

**Q: Do I need to recreate resources to use relations?**

A: No. Define relations against existing resources. Adding partitions improves performance but is optional.

**Q: What relation types are supported?**

A:
- `hasOne` (1:1) - User → Profile
- `hasMany` (1:n) - User → Posts
- `belongsTo` (n:1) - Post → User
- `belongsToMany` (m:n) - Post ↔ Tags

**Q: Does RelationPlugin work with MemoryClient?**

A: Yes! All relation operations work with MemoryClient for fast testing.

---

### Configuration

**Q: What are the minimum required parameters?**

A:
```javascript
new RelationPlugin({
  relations: {
    users: {
      posts: {
        type: 'hasMany',
        resource: 'posts',
        foreignKey: 'userId'
      }
    }
  }
})
```

**Q: How to configure cascade operations?**

A:
```javascript
{
  type: 'hasMany',
  resource: 'posts',
  foreignKey: 'userId',
  cascade: ['deleted', 'updated']
}
```

**Q: How to disable N+1 prevention?**

A: Set `preventN1: false` in plugin options.

---

### Performance & Partitions

**Q: Why are partitions important?**

A: Without partitions, finding related records requires full scans (O(n)). With partitions on foreign keys, lookups are O(1) - **100x faster**.

**Q: How does the plugin detect partitions?**

A: Automatically scans resource metadata for partitions matching the foreign key. Use `partitionHint` to force a specific partition.

**Q: What if I don't create partitions?**

A: Relations still work but use full scans (slower). Plugin warns: "No partition found, falling back to full scan."

**Q: How to check partition usage?**

A: Enable debug mode:
```javascript
new RelationPlugin({ logLevel: 'debug' })
```

---

### Loading Strategies

**Q: What's the difference between eager and lazy loading?**

A:
- **Eager**: Load relations upfront with `include` (fewer queries, better for bulk)
- **Lazy**: Load on-demand with dynamic methods (better for selective access)

**Q: How to load nested relations?**

A:
```javascript
const user = await users.get('u1', {
  include: {
    posts: { include: ['comments', 'tags'] }
  }
});
```

**Q: Are lazy-loaded relations cached?**

A: Yes! Second call returns cached results without S3 query.

---

### N+1 Problem

**Q: What is the N+1 problem?**

A: Loading 100 users, then loading posts for each = 101 queries (1 + 100). RelationPlugin batches this into 2 queries.

**Q: How does the plugin prevent N+1?**

A: Automatically batches relation loads when loading multiple parent records with `include`.

**Q: Does N+1 prevention work with lazy loading?**

A: No. Only works with eager loading (`include`). Don't call lazy methods in loops!

---

### Cascade Operations

**Q: What are cascade operations?**

A: Automatically delete/update related records when parent is deleted/updated.

**Q: Do cascade operations use partitions?**

A: Yes! Cascade operations automatically use partitions for 100x faster deletion.

---

### API Integration

**Q: How does RelationPlugin integrate with API Plugin?**

A: Adds `?populate=` query parameter to all REST endpoints:
```http
GET /orders?populate=customer,items.product
```

**Q: Can I populate nested relations via API?**

A: Yes! Use dot notation:
```http
GET /posts?populate=author.profile,comments.author
```

---

### Advanced

**Q: Can I have bidirectional relations?**

A: Yes! Define both directions:
```javascript
relations: {
  users: {
    posts: { type: 'hasMany', resource: 'posts', foreignKey: 'userId' }
  },
  posts: {
    author: { type: 'belongsTo', resource: 'users', foreignKey: 'userId' }
  }
}
```

**Q: How to implement self-referential relations?**

A:
```javascript
relations: {
  users: {
    manager: { type: 'belongsTo', resource: 'users', foreignKey: 'managerId' },
    subordinates: { type: 'hasMany', resource: 'users', foreignKey: 'managerId' }
  }
}
```

**Q: Can I have multiple relations to the same resource?**

A: Yes! Use different foreign keys:
```javascript
relations: {
  posts: {
    author: { type: 'belongsTo', resource: 'users', foreignKey: 'authorId' },
    editor: { type: 'belongsTo', resource: 'users', foreignKey: 'editorId' }
  }
}
```

---

### For AI Agents

**Q: What's the relation loading algorithm?**

A:
1. Check if partition exists for foreign key
2. If yes: use partition query (O(1))
3. If no: fall back to full scan with filter
4. Batch multiple parent records to prevent N+1
5. Cache partition lookups for repeated loads

**Q: How does partition auto-detection work?**

A: Scans resource metadata for partitions where one field matches `foreignKey`. Prefers single-field partitions.

**Q: What's the difference between foreignKey and localKey?**

A:
- `foreignKey`: Field in child resource (where foreign key is stored)
- `localKey`: Field in parent resource (typically 'id')

**Q: How are belongsToMany queries optimized?**

A: Two queries: (1) junction table with partition, (2) batch load target records by IDs.

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Loading strategies, real-world examples
- [Cache Plugin](../../cache/README.md) - Faster relation loading
- [Metrics Plugin](../../metrics/README.md) - Monitor performance
