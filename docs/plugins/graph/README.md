# Graph Plugin

> **Graph database functionality with vertices, edges, A* pathfinding, and traversal algorithms.**

---

## TLDR

**Model relationships** (social networks, recommendations, knowledge graphs) with graph database capabilities.

**1 line to get started:**
```javascript
await db.usePlugin(new GraphPlugin({ vertices: 'users', edges: 'follows' }));
```

**Key features:**
- Vertex & Edge resources with flexible modeling
- Directed/Undirected graph support
- Weighted edges for distance/cost calculations
- A* pathfinding algorithm
- BFS/DFS traversal
- Edge labels for relationship types
- Denormalization for faster queries
- O(1) edge lookups via partitions

**Performance:**
```javascript
// Without partitions: O(n) - scans ALL edges
const neighbors = await users.graph.neighbors(userId);

// With partitions: O(1) - direct lookup
// bySource/byTarget partitions are REQUIRED
```

---

## Quick Start

```javascript
import { Database, GraphPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Create vertex resource
const users = await db.createResource({
  name: 'users',
  attributes: { name: 'string|required' }
});

// Create edge resource with REQUIRED partitions
const relationships = await db.createResource({
  name: 'relationships',
  attributes: {
    source: 'string|required',
    target: 'string|required',
    label: 'string|optional',
    weight: 'number|optional'
  },
  partitions: {
    bySource: { fields: { source: 'string' } },
    byTarget: { fields: { target: 'string' } }
  }
});

// Install plugin
await db.usePlugin(new GraphPlugin({
  vertices: 'users',
  edges: 'relationships',
  directed: true,
  weighted: true
}));

// Create connections
const alice = await users.insert({ name: 'Alice' });
const bob = await users.insert({ name: 'Bob' });
await users.graph.connect(alice.id, bob.id, { label: 'follows' });

// Find shortest path
const path = await users.graph.shortestPath(alice.id, bob.id);
console.log(path.distance);
```

---

## Dependencies

**Zero external dependencies** - built into s3db.js core.

**What's Included:**
- Pure JavaScript A* implementation with MinHeap
- BFS/DFS traversal algorithms
- Uses S3DB's partitioning for O(1) lookups

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, field settings, required partitions, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Progressive adoption, production patterns, real-world examples |
| [Best Practices](./guides/best-practices.md) | Performance tips, error handling, troubleshooting, FAQ |

---

## Quick Reference

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `vertices` | string/string[] | Required | Vertex resource name(s) |
| `edges` | string/string[] | Required | Edge resource name(s) |
| `directed` | boolean | `true` | One-way (true) or bidirectional (false) |
| `weighted` | boolean | `false` | Enable edge weights |
| `denormalize` | string[] | `[]` | Vertex fields to cache on edges |

### Vertex Resource Methods

```javascript
// Create/remove connections
await users.graph.connect(fromId, toId, { label: 'follows' });
await users.graph.disconnect(fromId, toId);

// Check connections
await users.graph.isConnected(fromId, toId);
await users.graph.pathExists(fromId, toId);

// Get neighbors
await users.graph.neighbors(vertexId);
await users.graph.outgoingNeighbors(vertexId);
await users.graph.incomingNeighbors(vertexId);

// Pathfinding
const result = await users.graph.shortestPath(fromId, toId, {
  maxDepth: 10,
  direction: 'outgoing'
});
// { path: [...], edges: [...], distance: 5 }

// Traversal
const nodes = await users.graph.traverse(startId, {
  mode: 'bfs',
  maxDepth: 3
});

// Degree
const degree = await users.graph.degree(vertexId);
// { total: 15, outgoing: 10, incoming: 5 }
```

### Edge Resource Methods

```javascript
// Direct edge operations
await edges.graph.create(sourceId, targetId, { label: 'follows' });
await edges.graph.remove(sourceId, targetId);

// Query edges
await edges.graph.between(sourceId, targetId);
await edges.graph.bySource(sourceId);
await edges.graph.byTarget(targetId);
await edges.graph.labels('follows');
```

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Get edges by source | O(1) | Uses `bySource` partition |
| Get edges by target | O(1) | Uses `byTarget` partition |
| Shortest path | O(E log V) | A* with min-heap |
| Traverse (BFS/DFS) | O(V + E) | Visits each once |
| Create edge | O(1) | O(2) for undirected |

---

## How It Works

1. **Vertex Resources**: Your existing data (users, products, cities)
2. **Edge Resources**: Relationships with source, target, label, weight
3. **Partitions**: `bySource`/`byTarget` enable O(1) neighbor lookups
4. **A* Algorithm**: Optimal pathfinding with optional heuristics
5. **Denormalization**: Cache vertex data on edges to avoid N+1 queries

---

## Configuration Examples

### Social Network (Directed)

```javascript
new GraphPlugin({
  vertices: 'users',
  edges: 'follows',
  directed: true,
  denormalize: ['username', 'avatar']
});
```

### Road Network (Weighted, Undirected)

```javascript
new GraphPlugin({
  vertices: 'cities',
  edges: 'roads',
  directed: false,
  weighted: true,
  defaultWeight: 100
});
```

### Knowledge Graph

```javascript
new GraphPlugin({
  vertices: 'concepts',
  edges: 'relations',
  directed: true,
  weighted: true
});
```

---

## See Also

- [Geo Plugin](/plugins/geo/README.md) - Use with graph for geographic pathfinding
- [Vector Plugin](/plugins/vector/README.md) - Combine similarity with graph relationships
- [Partitioning Guide](/guides/partitioning.md) - Essential for graph performance
