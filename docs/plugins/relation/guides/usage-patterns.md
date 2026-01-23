# Usage Patterns

> **In this guide:** Loading strategies, nested relations, N+1 prevention, cascade operations, and real-world examples.

**Navigation:** [← Back to Relation Plugin](../README.md) | [Configuration](./configuration.md)

---

## Basic Setup

```javascript
import { Database } from 's3db.js';
import { RelationPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket/path' });
await db.connect();

// Create resources with partitions on foreign keys
await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    name: 'string',
    email: 'string'
  }
});

await db.createResource({
  name: 'posts',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    title: 'string',
    content: 'string'
  },
  partitions: {
    byAuthor: { fields: { userId: 'string' } }  // Critical for performance!
  }
});

// Install RelationPlugin
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
```

---

## Eager Loading

Load relations upfront with the `include` option.

### Single Relation

```javascript
const user = await users.get('u1', { include: ['profile'] });
console.log(user.profile.bio);
```

### Multiple Relations

```javascript
const user = await users.get('u1', { include: ['profile', 'posts'] });
console.log(`${user.name} has ${user.posts.length} posts`);
```

### With List

```javascript
const allUsers = await users.list({
  limit: 100,
  include: ['posts']
});

allUsers.forEach(user => {
  console.log(`${user.name}: ${user.posts.length} posts`);
});
```

---

## Nested Relations

Load relations of relations.

### Basic Nested Loading

```javascript
const user = await users.get('u1', {
  include: {
    posts: {
      include: ['comments', 'tags']
    },
    profile: true
  }
});

user.posts.forEach(post => {
  console.log(`${post.title}: ${post.comments.length} comments`);
  console.log(`Tags: ${post.tags.map(t => t.name).join(', ')}`);
});
```

### Deep Nesting

```javascript
const user = await users.get('u1', {
  include: {
    posts: {
      include: {
        comments: {
          include: ['author']  // Comment author
        },
        tags: true
      }
    }
  }
});
```

### With Limits

```javascript
const user = await users.get('u1', {
  include: {
    posts: {
      limit: 10,  // Only load 10 posts
      include: ['comments']
    }
  }
});
```

---

## Lazy Loading

Load relations on-demand using dynamic methods.

### Basic Lazy Loading

```javascript
const user = await users.get('u1');

// Load on demand
const posts = await user.posts();      // Returns array
const profile = await user.profile();  // Returns object
```

### Cached Results

```javascript
const user = await users.get('u1');

// First call - queries S3
const posts1 = await user.posts();

// Second call - returns cached results (no S3 query)
const posts2 = await user.posts();
```

---

## N+1 Prevention

Batch loading prevents the N+1 query problem.

### The Problem

```javascript
// Without plugin: 101 queries (1 + 100)
const users = await users.list({ limit: 100 });
for (const user of users) {
  await posts.query({ userId: user.id });  // 100 separate queries!
}
```

### The Solution

```javascript
// With plugin: 2 queries (batched)
const users = await users.list({
  limit: 100,
  include: ['posts']
});
// All posts loaded in a single batched query!
```

### Check Batch Stats

```javascript
const stats = relationPlugin.getStats();
console.log('Batch loads:', stats.batchLoads);
console.log('Deduped queries:', stats.deduplicatedQueries);
```

---

## Cascade Operations

### Cascade Delete

```javascript
const relationPlugin = new RelationPlugin({
  relations: {
    users: {
      posts: {
        type: 'hasMany',
        resource: 'posts',
        foreignKey: 'userId',
        cascade: ['deleted']  // Enable cascade delete
      },
      profile: {
        type: 'hasOne',
        resource: 'profiles',
        foreignKey: 'userId',
        cascade: ['deleted']
      }
    }
  }
});

// Delete user - all posts and profile deleted automatically
await users.delete('u1');
```

### Monitor Cascade Operations

```javascript
const stats = relationPlugin.getStats();
console.log('Cascade deletes:', stats.cascadeDeletes);
console.log('Cascade updates:', stats.cascadeUpdates);
```

---

## Real-World Examples

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
    },
    comments: {
      author: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'authorId'
      },
      post: {
        type: 'belongsTo',
        resource: 'posts',
        foreignKey: 'postId'
      }
    }
  }
});

// Load post with all relations
const post = await posts.get('post-123', {
  include: {
    author: { include: ['profile'] },
    comments: { include: ['author'], limit: 50 },
    tags: true
  }
});

console.log(`${post.title} by ${post.author.name}`);
console.log(`${post.comments.length} comments`);
console.log(`Tags: ${post.tags.map(t => t.name).join(', ')}`);
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
      },
      addresses: {
        type: 'hasMany',
        resource: 'addresses',
        foreignKey: 'userId'
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
      },
      shippingAddress: {
        type: 'belongsTo',
        resource: 'addresses',
        foreignKey: 'shippingAddressId'
      }
    },
    order_items: {
      order: {
        type: 'belongsTo',
        resource: 'orders',
        foreignKey: 'orderId'
      },
      product: {
        type: 'belongsTo',
        resource: 'products',
        foreignKey: 'productId'
      }
    }
  }
});

// Load order with all details
const order = await orders.get('order-456', {
  include: {
    customer: true,
    items: { include: ['product'] },
    shippingAddress: true
  }
});

console.log(`Order #${order.id} for ${order.customer.name}`);
order.items.forEach(item => {
  console.log(`- ${item.product.name} x${item.quantity}`);
});
```

### Self-Referential Relations

```javascript
const plugin = new RelationPlugin({
  relations: {
    users: {
      manager: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'managerId'
      },
      subordinates: {
        type: 'hasMany',
        resource: 'users',
        foreignKey: 'managerId',
        partitionHint: 'byManager'
      }
    }
  }
});

// Load user with manager and subordinates
const employee = await users.get('emp-123', {
  include: ['manager', 'subordinates']
});

console.log(`${employee.name}`);
console.log(`Reports to: ${employee.manager?.name || 'None'}`);
console.log(`Manages: ${employee.subordinates.length} people`);
```

### Multiple Relations to Same Resource

```javascript
const plugin = new RelationPlugin({
  relations: {
    posts: {
      author: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'authorId'
      },
      editor: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'editorId'
      },
      reviewer: {
        type: 'belongsTo',
        resource: 'users',
        foreignKey: 'reviewerId'
      }
    }
  }
});

const post = await posts.get('post-1', {
  include: ['author', 'editor', 'reviewer']
});

console.log(`Written by: ${post.author.name}`);
console.log(`Edited by: ${post.editor?.name || 'Not edited'}`);
console.log(`Reviewed by: ${post.reviewer?.name || 'Not reviewed'}`);
```

---

## Performance Monitoring

### Enable Debug Logging

```javascript
const plugin = new RelationPlugin({
  relations: {...},
  logLevel: 'debug'
});

// Logs:
// [RelationPlugin] Loading hasMany 'posts' for user 'u1'
// [RelationPlugin] ✅ Using partition 'byAuthor' (O(1))
// [RelationPlugin] Query took 45ms
```

### Check Statistics

```javascript
const stats = relationPlugin.getStats();

console.log('Performance Stats:');
console.log('- Total relation loads:', stats.totalRelationLoads);
console.log('- Partition cache hits:', stats.partitionCacheHits);
console.log('- Deduped queries:', stats.deduplicatedQueries);
console.log('- Batch loads:', stats.batchLoads);
console.log('- Cascade deletes:', stats.cascadeDeletes);
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Performance, troubleshooting, FAQ
