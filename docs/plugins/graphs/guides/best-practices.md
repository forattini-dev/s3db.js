# Best Practices & FAQ

> **In this guide:** Performance tips, error handling, troubleshooting, and FAQ.

**Navigation:** [← Back to Graph Plugin](../README.md) | [Configuration](./configuration.md)

---

## Best Practices

### 1. Always Create Edge Partitions

```javascript
// REQUIRED for performance!
partitions: {
  bySource: { fields: { source: 'string' } },
  byTarget: { fields: { target: 'string' } }
}

// Without partitions, queries scan ALL edges: O(n)
// With partitions, queries are O(1)
```

### 2. Choose Directed vs Undirected Carefully

```javascript
// Directed: A→B ≠ B→A
// Use for: follows, likes, reports_to, depends_on
{ directed: true }

// Undirected: A↔B (stores 2 edges)
// Use for: friends, knows, connected_to
{ directed: false }

// Undirected doubles edge storage!
```

### 3. Use Denormalization for Display Data

```javascript
// Cache fields commonly shown with edges
denormalize: ['name', 'avatar', 'username']

// Don't cache:
// - Large fields (descriptions, content)
// - Frequently changing data
// - Sensitive data (emails, passwords)
```

### 4. Limit Traversal Depth

```javascript
// Prevent runaway queries
const result = await users.graph.traverse(startId, {
  maxDepth: 5  // Reasonable limit
});

// For pathfinding
const path = await users.graph.shortestPath(a, b, {
  maxDepth: 10  // Paths longer than this are probably not useful
});
```

### 5. Use Labels for Different Relationship Types

```javascript
// Multiple relationship types between same vertices
await users.graph.connect(alice, bob, { label: 'follows' });
await users.graph.connect(alice, bob, { label: 'blocks' });
await users.graph.connect(alice, bob, { label: 'mentions' });

// Query by type
const blockedUsers = await blocks.graph.bySource(alice, { label: 'blocks' });
```

---

## Error Handling

### Error Classes

```javascript
import {
  GraphError,
  GraphConfigurationError,
  VertexNotFoundError,
  PathNotFoundError,
  InvalidEdgeError
} from 's3db.js';
```

### GraphConfigurationError

**When:** Invalid plugin configuration

```javascript
// No edge resource
new GraphPlugin({ vertices: 'users' });
// Error: No edge resource configured

// Missing partitions
await users.graph.connect(a, b);
// Error: Edge resource missing required partitions
```

### PathNotFoundError

**When:** No path exists between vertices

```javascript
try {
  await users.graph.shortestPath(isolated.id, target.id);
} catch (error) {
  if (error.name === 'PathNotFoundError') {
    console.log('No path exists');
    console.log('Searched depth:', error.context.maxDepth);
    console.log('Iterations:', error.context.iterations);
  }
}
```

### InvalidEdgeError

**When:** Edge operation is invalid

```javascript
// Self-loop (if not allowed)
await users.graph.connect(alice.id, alice.id);
// Error: Cannot create self-referencing edge
```

### Error Handling Pattern

```javascript
async function findRoute(from, to) {
  try {
    const path = await cities.graph.shortestPath(from, to, {
      maxDepth: 20
    });
    return { success: true, path };
  } catch (error) {
    if (error.name === 'PathNotFoundError') {
      return { success: false, reason: 'No route exists' };
    }
    if (error.name === 'VertexNotFoundError') {
      return { success: false, reason: 'Invalid city' };
    }
    throw error;  // Unexpected error
  }
}
```

---

## FAQ

### Basics

**Q: What's the difference between directed and undirected graphs?**
A: Directed graphs have one-way edges (A→B), undirected graphs have two-way edges (A↔B). Use directed for asymmetric relationships (follows, owns), undirected for symmetric (friends, connected_to).

**Q: How many edges can I have?**
A: Unlimited, but consider performance. With proper partitions, edge lookups are O(1) regardless of total count.

**Q: Can I have multiple edges between the same vertices?**
A: Yes! Use different labels to distinguish them:
```javascript
await graph.connect(a, b, { label: 'follows' });
await graph.connect(a, b, { label: 'likes' });
```

### Performance

**Q: Why are my neighbor queries slow?**
A: You're likely missing partitions. Always create `bySource` and `byTarget` partitions on edge resources.

**Q: How do I optimize pathfinding?**
A:
1. Use weighted edges with realistic weights
2. Provide a heuristic function for A*
3. Set reasonable `maxDepth` limits
4. For geographic data, use haversine distance as heuristic

**Q: Should I use denormalization?**
A: Use it when:
- You frequently display neighbor info (names, avatars)
- The cached data rarely changes
- You have many more reads than writes

### Operations

**Q: How do I get all friends of friends?**
A:
```javascript
const fof = await users.graph.traverse(userId, {
  mode: 'bfs',
  maxDepth: 2,
  direction: 'outgoing'
});
const friendsOfFriends = fof.filter(n => n.depth === 2);
```

**Q: How do I count edges without fetching them?**
A: Use the degree method:
```javascript
const degree = await users.graph.degree(userId);
console.log(`${degree.outgoing} following, ${degree.incoming} followers`);
```

**Q: How do I delete all edges for a vertex?**
A:
```javascript
const edges = await users.graph.edges(vertexId);
for (const edge of edges) {
  await edgeResource.delete(edge.id);
}
```

### Data Modeling

**Q: How do I model a many-to-many relationship?**
A: Use the graph! Each edge represents one relationship:
```javascript
await users.graph.connect(userId, groupId, { label: 'member_of' });
```

**Q: How do I add properties to relationships?**
A: Use the `data` option or custom edge fields:
```javascript
await users.graph.connect(a, b, {
  label: 'rated',
  data: { score: 5, comment: 'Great!' }
});
```

**Q: Can I query edges by custom properties?**
A: Yes, query the edge resource directly:
```javascript
const highRatings = await ratings.query({
  label: 'rated',
  'data.score': { $gte: 4 }
});
```

### Troubleshooting

**Q: PathNotFoundError even though path exists?**
A: Check:
1. `direction` option (try `'both'`)
2. `maxDepth` (increase if path is longer)
3. Edge directions match your query direction

**Q: Denormalized data is stale?**
A: Denormalization caches data at edge creation time. Options:
1. Re-create edge when vertex changes
2. Accept eventual consistency
3. Don't use denormalization for frequently-changing data

**Q: Undirected graph has double the expected edges?**
A: Correct! Undirected edges create two records (A→B and B→A). This is by design for efficient bidirectional queries.

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Examples and production patterns
