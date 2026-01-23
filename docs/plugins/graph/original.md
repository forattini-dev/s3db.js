# Graph Plugin

> Transform S3DB into a graph database with vertices, edges, and traversal algorithms

[← Back to Plugins](../README.md)

---

## TLDR

```javascript
import { Database } from 's3db.js';
import { GraphPlugin } from 's3db.js';

const db = new Database({ connectionString: 'memory://test/db' });
await db.connect();

// Create resources
await db.createResource({
  name: 'people',
  attributes: { name: 'string|required', role: 'string|optional' }
});

await db.createResource({
  name: 'relationships',
  attributes: {
    source: 'string|required',
    target: 'string|required',
    label: 'string|optional',
    weight: 'number|optional'
  },
  partitions: {
    bySource: { fields: { source: 'string' } },
    byTarget: { fields: { target: 'string' } },
    byLabel: { fields: { label: 'string' } }
  }
});

// Install plugin
const graphPlugin = new GraphPlugin({
  vertices: 'people',
  edges: 'relationships',
  directed: true,
  weighted: true
});
await db.usePlugin(graphPlugin);

// Use shorthand methods
const alice = await db.resources.people.insert({ name: 'Alice', role: 'dev' });
const bob = await db.resources.people.insert({ name: 'Bob', role: 'pm' });

// Connect vertices
await db.resources.people.graph.connect(alice.id, bob.id, { label: 'works-with', weight: 1 });

// Query edges
const edges = await db.resources.people.graph.edges(alice.id);
const neighbors = await db.resources.people.graph.neighbors(alice.id);

// Find shortest path (A* algorithm)
const path = await db.resources.people.graph.shortestPath(alice.id, bob.id);
```

**Key Features:**
- Directed and undirected graphs
- Weighted edges for pathfinding
- Partitioned edge storage for O(1) lookups
- A* shortest path algorithm
- BFS/DFS traversal
- Label-based edge filtering

---

## Table of Contents

1. [Quickstart](#quickstart)
2. [Configuration](#configuration)
3. [Vertex Methods](#vertex-methods)
4. [Edge Methods](#edge-methods)
5. [Pathfinding](#pathfinding)
6. [Traversal](#traversal)
7. [Best Practices](#best-practices)
8. [FAQ](#faq)

---

## Quickstart

### Installation

```bash
# s3db.js already includes GraphPlugin
npm install s3db.js
```

### Basic Setup

```javascript
import { Database } from 's3db.js';
import { GraphPlugin } from 's3db.js';

const db = new Database({ connectionString: 'memory://test/db' });
await db.connect();

// Option 1: Let the plugin create resources automatically
const graph = new GraphPlugin({
  vertices: 'nodes',
  edges: 'edges',
  createResources: true  // Creates resources with optimal partitions
});
await db.usePlugin(graph);

// Option 2: Use existing resources (recommended for production)
await db.createResource({
  name: 'users',
  attributes: { name: 'string', email: 'email' }
});

await db.createResource({
  name: 'connections',
  attributes: {
    source: 'string|required',
    target: 'string|required',
    label: 'string|optional',
    weight: 'number|optional'
  },
  partitions: {
    bySource: { fields: { source: 'string' } },
    byTarget: { fields: { target: 'string' } },
    byLabel: { fields: { label: 'string' } }
  }
});

const graph = new GraphPlugin({
  vertices: 'users',
  edges: 'connections'
});
await db.usePlugin(graph);
```

---

## Configuration

### Full Configuration Reference

```javascript
new GraphPlugin({
  // Resources
  vertices: 'nodes',              // Vertex resource name(s) - string or array
  edges: 'edges',                 // Edge resource name(s) - string or array

  // Graph type
  directed: true,                 // true = directed, false = bidirectional
  weighted: false,                // Enable edge weights
  defaultWeight: 1,               // Default weight when not specified

  // Traversal limits
  maxTraversalDepth: 50,          // Max depth for pathfinding/traversal

  // Resource creation
  createResources: false,         // Auto-create vertex/edge resources

  // Field mapping (customize if your schema differs)
  vertexIdField: 'id',            // Vertex ID field
  edgeSourceField: 'source',      // Edge source vertex field
  edgeTargetField: 'target',      // Edge target vertex field
  edgeLabelField: 'label',        // Edge label field
  edgeWeightField: 'weight'       // Edge weight field
});
```

### Directed vs Undirected Graphs

```javascript
// Directed graph (default) - A→B does NOT imply B→A
const directedGraph = new GraphPlugin({
  vertices: 'nodes',
  edges: 'edges',
  directed: true
});

// Undirected graph - A→B automatically creates B→A
const undirectedGraph = new GraphPlugin({
  vertices: 'nodes',
  edges: 'edges',
  directed: false  // Creates reverse edges automatically
});
```

### Weighted Graphs

```javascript
const weightedGraph = new GraphPlugin({
  vertices: 'cities',
  edges: 'roads',
  weighted: true,
  defaultWeight: 1
});

// Connect with weight
await cities.graph.connect('nyc', 'boston', { weight: 215 }); // 215 miles
await cities.graph.connect('nyc', 'philly', { weight: 95 });

// Shortest path considers weights
const path = await cities.graph.shortestPath('boston', 'philly');
// Returns: { path: ['boston', 'nyc', 'philly'], distance: 310, edges: [...] }
```

---

## Vertex Methods

All vertex resources get a `.graph` namespace with these methods:

### `graph.edges(vertexId, options?)`

Get all edges connected to a vertex.

```javascript
const edges = await users.graph.edges('user-1');
// Returns: [{ id, source, target, label, weight, _direction: 'outgoing'|'incoming' }, ...]

// Filter by direction
const outgoing = await users.graph.edges('user-1', { direction: 'outgoing' });
const incoming = await users.graph.edges('user-1', { direction: 'incoming' });

// Filter by label
const friends = await users.graph.edges('user-1', { label: 'friend' });
```

### `graph.neighbors(vertexId, options?)`

Get neighbor vertices connected to this vertex.

```javascript
const neighbors = await users.graph.neighbors('user-1');
// Returns: [{ id, name, ... }, ...]

// With edges included
const withEdges = await users.graph.neighbors('user-1', { includeEdges: true });
// Returns: [{ id, name, ..., _edges: [edge1, edge2] }, ...]

// Direction filtering
const following = await users.graph.outgoingNeighbors('user-1');
const followers = await users.graph.incomingNeighbors('user-1');
```

### `graph.degree(vertexId, options?)`

Get the degree (connection count) of a vertex.

```javascript
const degree = await users.graph.degree('user-1');
// Returns: { total: 10, outgoing: 6, incoming: 4 }
```

### `graph.connect(fromId, toId, options?)`

Create an edge between two vertices.

```javascript
// Simple connection
await users.graph.connect('alice', 'bob');

// With label
await users.graph.connect('alice', 'bob', { label: 'friend' });

// With weight (requires weighted: true)
await users.graph.connect('alice', 'bob', { weight: 5 });

// With additional data
await users.graph.connect('alice', 'bob', {
  label: 'colleague',
  data: { since: '2024-01-01', department: 'engineering' }
});
```

### `graph.disconnect(fromId, toId, options?)`

Remove edge(s) between two vertices.

```javascript
// Remove all edges between vertices
await users.graph.disconnect('alice', 'bob');

// Remove only specific label
await users.graph.disconnect('alice', 'bob', { label: 'friend' });
```

### `graph.isConnected(fromId, toId, options?)`

Check if there's a direct edge between vertices.

```javascript
const connected = await users.graph.isConnected('alice', 'bob');
// Returns: true/false

// Check specific label
const areFriends = await users.graph.isConnected('alice', 'bob', { label: 'friend' });
```

### `graph.pathExists(fromId, toId, options?)`

Check if any path exists between vertices.

```javascript
const reachable = await users.graph.pathExists('alice', 'charlie');
// Returns: true/false
```

---

## Edge Methods

Edge resources get their own `.graph` namespace:

### `graph.labels(label, options?)`

Get all edges with a specific label.

```javascript
const friendships = await connections.graph.labels('friend');
// Returns: [{ id, source, target, label: 'friend' }, ...]

// With limit
const recent = await connections.graph.labels('friend', { limit: 100 });
```

### `graph.bySource(sourceId, options?)`

Get all edges originating from a vertex.

```javascript
const aliceConnections = await connections.graph.bySource('alice');
```

### `graph.byTarget(targetId, options?)`

Get all edges pointing to a vertex.

```javascript
const aliceFollowers = await connections.graph.byTarget('alice');
```

### `graph.between(sourceId, targetId, options?)`

Get all edges between two specific vertices.

```javascript
const edges = await connections.graph.between('alice', 'bob');
// Returns: [{ id, source: 'alice', target: 'bob', label, ... }, ...]
```

### `graph.create(sourceId, targetId, options?)`

Create an edge (same as vertex.graph.connect).

```javascript
await connections.graph.create('alice', 'bob', { label: 'friend' });
```

### `graph.remove(sourceId, targetId, options?)`

Remove an edge (same as vertex.graph.disconnect).

```javascript
await connections.graph.remove('alice', 'bob', { label: 'friend' });
```

---

## Pathfinding

### A* Shortest Path

The plugin implements the A* algorithm for optimal pathfinding:

```javascript
// Basic shortest path
const result = await users.graph.shortestPath('alice', 'dave');
// Returns: {
//   path: ['alice', 'bob', 'charlie', 'dave'],
//   edges: [edge1, edge2, edge3],
//   distance: 3  // or weighted sum if weighted: true
// }

// With custom heuristic (for geographic coordinates, etc.)
const geoResult = await cities.graph.shortestPath('nyc', 'la', {
  heuristic: (nodeId, targetId) => {
    // Return estimated distance to target
    return haversineDistance(getCoords(nodeId), getCoords(targetId));
  }
});

// With max depth limit
const limited = await users.graph.shortestPath('alice', 'dave', {
  maxDepth: 3  // Only find paths with ≤3 hops
});

// Check if path exists without returning full path
const reachable = await users.graph.pathExists('alice', 'eve');
```

### Weighted Pathfinding

```javascript
const graph = new GraphPlugin({
  vertices: 'cities',
  edges: 'routes',
  weighted: true
});

// Edges have weights (e.g., distances)
await cities.graph.connect('nyc', 'boston', { weight: 215 });
await cities.graph.connect('nyc', 'philly', { weight: 95 });
await cities.graph.connect('philly', 'boston', { weight: 300 });

// A* finds the path with minimum total weight
const path = await cities.graph.shortestPath('philly', 'boston');
// Returns: { path: ['philly', 'nyc', 'boston'], distance: 310, edges: [...] }
// (NYC route is shorter than direct philly→boston)
```

---

## Traversal

### BFS/DFS Traversal

```javascript
// Breadth-First Search (default)
const bfsResult = await users.graph.traverse('alice', {
  mode: 'bfs',
  maxDepth: 3
});
// Returns: [{ id, depth, path, data }, ...]

// Depth-First Search
const dfsResult = await users.graph.traverse('alice', {
  mode: 'dfs',
  maxDepth: 5
});

// With filter function
const filtered = await users.graph.traverse('alice', {
  filter: (node) => node.data?.role === 'developer',
  maxDepth: 3
});

// With visitor callback
const visited = [];
await users.graph.traverse('alice', {
  visitor: async (node) => {
    visited.push(node.id);
    // Return false to stop traversing this branch
    return node.depth < 2;
  }
});

// Direction control
const downstream = await users.graph.traverse('alice', {
  direction: 'outgoing'  // Only follow outgoing edges
});

const upstream = await users.graph.traverse('alice', {
  direction: 'incoming'  // Only follow incoming edges
});
```

---

## Best Practices

### 1. Design Partitions for Your Query Patterns

```javascript
// Good: Partitions match common queries
await db.createResource({
  name: 'edges',
  attributes: { source: 'string', target: 'string', label: 'string', weight: 'number' },
  partitions: {
    bySource: { fields: { source: 'string' } },   // For outgoing edges
    byTarget: { fields: { target: 'string' } },   // For incoming edges
    byLabel: { fields: { label: 'string' } }      // For edge type queries
  }
});
```

### 2. Use Labels for Edge Types

```javascript
// Group related edge types
await graph.connect(user.id, post.id, { label: 'authored' });
await graph.connect(user.id, post.id, { label: 'liked' });
await graph.connect(user.id, user2.id, { label: 'follows' });

// Query by type
const authored = await edges.graph.labels('authored');
const likes = await edges.graph.labels('liked');
```

### 3. Limit Traversal Depth

```javascript
// Always set reasonable depth limits
const neighbors = await users.graph.traverse('user-1', {
  maxDepth: 3  // Don't traverse entire graph
});

// Use pathExists for reachability checks (faster than shortestPath)
const canReach = await users.graph.pathExists('a', 'z', { maxDepth: 10 });
```

### 4. Use Weighted Edges for Distance/Cost

```javascript
// Model real-world distances, costs, or priorities
await cities.graph.connect('nyc', 'la', {
  weight: 2789,  // miles
  data: { estimatedTime: 40, flightCost: 350 }
});
```

---

## FAQ

### Can I use multiple vertex resources?

Yes, you can specify multiple vertex and edge resources:

```javascript
const graph = new GraphPlugin({
  vertices: ['users', 'products', 'orders'],
  edges: ['user_product_relations', 'order_items']
});
```

### How do I model a social network?

```javascript
const social = new GraphPlugin({
  vertices: 'users',
  edges: 'relationships',
  directed: true  // Follows are directional
});

// Alice follows Bob (but Bob doesn't follow Alice)
await users.graph.connect(alice.id, bob.id, { label: 'follows' });

// Get followers
const followers = await users.graph.incomingNeighbors(bob.id);

// Get following
const following = await users.graph.outgoingNeighbors(alice.id);
```

### How do I model an undirected graph?

```javascript
const graph = new GraphPlugin({
  vertices: 'nodes',
  edges: 'edges',
  directed: false  // Creates reverse edges automatically
});

// Creates A→B and B→A
await nodes.graph.connect('a', 'b');
```

### What's the complexity of operations?

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `edges(id)` | O(1) | Uses partition lookup |
| `neighbors(id)` | O(k) | k = number of neighbors |
| `labels(label)` | O(1) | Uses partition lookup |
| `shortestPath()` | O(E + V log V) | A* algorithm |
| `traverse()` | O(V + E) | BFS/DFS |

### How do I handle cycles?

The plugin handles cycles automatically:
- `shortestPath()` tracks visited nodes to avoid infinite loops
- `traverse()` maintains a visited set
- Set `maxDepth` to limit traversal in cyclic graphs

### Can I add custom properties to edges?

Yes, use the `data` option:

```javascript
await users.graph.connect('alice', 'bob', {
  label: 'colleague',
  weight: 5,
  data: {
    startDate: '2024-01-01',
    department: 'engineering',
    level: 'senior'
  }
});
```

---

## Related

- [Vector Plugin](../vector.md) - Similarity search
- [Cache Plugin](../cache.md) - Cache graph queries
- [S3 Queue Plugin](../s3-queue.md) - Process graph changes asynchronously
