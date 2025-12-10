# Configuration

> **In this guide:** All configuration options, field settings, required partitions, and API reference.

**Navigation:** [← Back to Graph Plugin](../README.md)

---

## Plugin Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vertices` | string \| string[] | `null` | Vertex resource name(s) |
| `edges` | string \| string[] | `null` | Edge resource name(s) |
| `directed` | boolean | `true` | Whether edges are directed |
| `weighted` | boolean | `false` | Enable edge weights |
| `defaultWeight` | number | `1` | Default weight for new edges |
| `maxTraversalDepth` | number | `50` | Max depth for traversal/pathfinding |
| `createResources` | boolean | `false` | Auto-create vertex/edge resources |
| `denormalize` | string[] | `[]` | Vertex fields to cache on edges |

---

## Field Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vertexIdField` | string | `'id'` | Field name for vertex ID |
| `edgeSourceField` | string | `'source'` | Field name for source vertex |
| `edgeTargetField` | string | `'target'` | Field name for target vertex |
| `edgeLabelField` | string | `'label'` | Field name for edge label |
| `edgeWeightField` | string | `'weight'` | Field name for edge weight |

---

## Required Edge Resource Schema

```javascript
{
  attributes: {
    source: 'string|required',     // Source vertex ID
    target: 'string|required',     // Target vertex ID
    label: 'string|optional',      // Edge type/category
    weight: 'number|optional',     // For weighted graphs
    snapshot: 'object|optional'    // For denormalization
  },
  partitions: {
    bySource: { fields: { source: 'string' } },  // REQUIRED
    byTarget: { fields: { target: 'string' } },  // REQUIRED
    byLabel: { fields: { label: 'string' } }     // RECOMMENDED
  }
}
```

---

## Graph Concepts

### Directed vs Undirected Graphs

**Directed Graph** (`directed: true`, default):
- Edges have direction: A→B is different from B→A
- Alice follows Bob ≠ Bob follows Alice
- Single edge stored per connection

```
Alice ──follows──▶ Bob
```

**Undirected Graph** (`directed: false`):
- Edges are bidirectional: A↔B
- Alice knows Bob = Bob knows Alice
- Two edges stored per connection (A→B and B→A)

```
Alice ◀──knows──▶ Bob
```

### Weighted Edges

**Unweighted** (`weighted: false`):
- All edges have implicit weight of 1
- Shortest path = fewest edges

**Weighted** (`weighted: true`):
- Each edge has a numeric weight
- Shortest path = lowest total weight
- Useful for: distances, costs, strengths

### Edge Labels

Labels categorize relationships:

```javascript
await users.graph.connect(alice, bob, { label: 'follows' });
await users.graph.connect(alice, bob, { label: 'likes' });
await users.graph.connect(alice, charlie, { label: 'blocks' });

// Query by label
const followEdges = await relationships.graph.labels('follows');
```

### Denormalization

Cache vertex data on edges for faster neighbor queries:

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'relationships',
  denormalize: ['name', 'avatar']  // Cache these fields
});

// When creating edges, snapshot is auto-populated
await users.graph.connect(alice, bob, { label: 'follows' });
// Edge stores: { source, target, snapshot: { name: 'Bob', avatar: '...' } }

// Neighbor queries return cached data without fetching vertices!
const neighbors = await users.graph.neighbors(alice);
// [{ id: 'bob', name: 'Bob', avatar: '...', _edges: [...] }]
```

---

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Get edges by source | O(1) | Uses `bySource` partition |
| Get edges by target | O(1) | Uses `byTarget` partition |
| Get edges by label | O(1) | Uses `byLabel` partition |
| Get neighbors | O(edges) | Fetches edges + optional vertex data |
| Shortest path | O(E log V) | A* with min-heap priority queue |
| Traverse (BFS/DFS) | O(V + E) | Visits each vertex/edge once |
| Create edge | O(1) | O(2) for undirected (creates reverse) |

---

## API Reference

### Vertex Resource Methods

When GraphPlugin is installed, vertex resources gain a `.graph` namespace:

| Method | Description | Returns |
|--------|-------------|---------|
| `connect(fromId, toId, opts?)` | Create edge between vertices | Edge |
| `disconnect(fromId, toId, opts?)` | Remove edge(s) between vertices | `{ deleted: number }` |
| `isConnected(fromId, toId, opts?)` | Check if direct edge exists | boolean |
| `pathExists(fromId, toId, opts?)` | Check if any path exists | boolean |
| `shortestPath(fromId, toId, opts?)` | Find optimal path (A*) | PathResult |
| `neighbors(vertexId, opts?)` | Get connected vertices | Vertex[] |
| `outgoingNeighbors(vertexId, opts?)` | Get vertices this points to | Vertex[] |
| `incomingNeighbors(vertexId, opts?)` | Get vertices pointing here | Vertex[] |
| `edges(vertexId, opts?)` | Get edges for vertex | Edge[] |
| `outgoingEdges(vertexId, opts?)` | Get outgoing edges | Edge[] |
| `incomingEdges(vertexId, opts?)` | Get incoming edges | Edge[] |
| `degree(vertexId, opts?)` | Count connections | `{ total, outgoing, incoming }` |
| `traverse(startId, opts?)` | BFS/DFS traversal | TraversalNode[] |

### Edge Resource Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `create(sourceId, targetId, opts?)` | Create edge | Edge |
| `remove(sourceId, targetId, opts?)` | Remove edge(s) | `{ deleted: number }` |
| `between(sourceId, targetId, opts?)` | Get edges between two vertices | Edge[] |
| `bySource(sourceId, opts?)` | Get all edges from source | Edge[] |
| `byTarget(targetId, opts?)` | Get all edges to target | Edge[] |
| `labels(label, opts?)` | Get edges by label | Edge[] |

### Options Parameters

**Connect/Create Options:**
```javascript
{
  label: 'follows',        // Edge label/type
  weight: 1.5,             // Edge weight (if weighted graph)
  data: { custom: 'data' } // Additional edge data
}
```

**Neighbor Options:**
```javascript
{
  direction: 'both',       // 'outgoing', 'incoming', or 'both'
  label: 'follows',        // Filter by label
  includeEdges: true,      // Include edge data (default: true via _edges)
  limit: 1000              // Max results
}
```

**ShortestPath Options:**
```javascript
{
  maxDepth: 50,            // Max path length
  direction: 'outgoing',   // Edge direction to follow
  returnPath: true,        // Include full path (false = distance only)
  includeStats: false,     // Include algorithm stats
  heuristic: (curr, target) => estimatedDistance  // Custom A* heuristic
}
```

**Traverse Options:**
```javascript
{
  mode: 'bfs',             // 'bfs' or 'dfs'
  maxDepth: 50,            // Max traversal depth
  direction: 'outgoing',   // Edge direction to follow
  filter: (node) => true,  // Filter function
  visitor: async (node) => true  // Callback for each node
}
```

### Return Types

**PathResult:**
```javascript
{
  path: ['a', 'b', 'c'],           // Vertex IDs in order
  edges: [{ source, target, ... }], // Edges traversed
  distance: 5.5,                   // Total weight/distance
  stats?: { iterations, visited }  // If includeStats: true
}
```

**TraversalNode:**
```javascript
{
  id: 'vertex-id',
  depth: 2,                  // Distance from start
  path: ['start', 'middle', 'vertex-id'],  // Path taken
  data: { ... }              // Vertex data
}
```

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Examples and production patterns
- [Best Practices](./best-practices.md) - Tips, error handling, FAQ
