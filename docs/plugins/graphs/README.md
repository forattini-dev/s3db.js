# 🕸️ Graph Plugin

> **Graph database functionality for s3db.js with vertices, edges, and pathfinding algorithms.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Model relationships** (social networks, recommendations, knowledge graphs) with graph database capabilities.

**1 line to get started:**
```javascript
await db.usePlugin(new GraphPlugin({ vertices: 'users', edges: 'follows' }));
```

**Full example:**
```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'relationships',
  directed: true,           // A→B ≠ B→A
  weighted: true,           // Edge weights for pathfinding
  denormalize: ['name']     // Cache vertex data on edges
});

await db.usePlugin(graphPlugin);

// Create connections
await users.graph.connect('alice', 'bob', { label: 'follows', weight: 1 });
await users.graph.connect('bob', 'charlie', { label: 'follows', weight: 1 });

// Find shortest path (A* algorithm)
const path = await users.graph.shortestPath('alice', 'charlie');
// { path: ['alice', 'bob', 'charlie'], distance: 2, edges: [...] }

// Get neighbors
const following = await users.graph.neighbors('alice', { direction: 'outgoing' });
// [{ id: 'bob', name: 'Bob', _edges: [...] }]
```

**Key features:**
- ✅ **Vertex & Edge resources**: Flexible graph modeling
- ✅ **Directed/Undirected**: Support both graph types
- ✅ **Weighted edges**: For distance/cost calculations
- ✅ **A* pathfinding**: Optimal shortest path algorithm
- ✅ **Labels**: Categorize edge types (follows, likes, knows)
- ✅ **Denormalization**: Cache vertex data on edges for faster queries
- ✅ **BFS/DFS traversal**: Explore graphs systematically
- ✅ **O(1) edge lookups**: Via partition-based queries

**Performance Characteristics:**

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

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [📦 Dependencies](#-dependencies)
4. [Graph Concepts](#graph-concepts)
5. [Usage Journey](#usage-journey)
   - [Level 1: Basic Graph Setup](#level-1-basic-graph-setup)
   - [Level 2: Creating Connections](#level-2-creating-connections)
   - [Level 3: Querying Neighbors](#level-3-querying-neighbors)
   - [Level 4: Shortest Path with A*](#level-4-shortest-path-with-a)
   - [Level 5: Graph Traversal](#level-5-graph-traversal)
   - [Level 6: Denormalization for Performance](#level-6-denormalization-for-performance)
   - [Level 7: Production Patterns](#level-7-production-patterns)
6. [📊 Configuration Reference](#-configuration-reference)
7. [📚 Configuration Examples](#-configuration-examples)
8. [🔧 API Reference](#-api-reference)
9. [✅ Best Practices](#-best-practices)
10. [🚨 Error Handling](#-error-handling)
11. [❓ FAQ](#-faq)

---

## ⚡ Quickstart

```javascript
import { Database, GraphPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

await db.connect();

// Create vertex resource (nodes)
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    avatar: 'url|optional'
  }
});

// Create edge resource (relationships)
const relationships = await db.createResource({
  name: 'relationships',
  attributes: {
    source: 'string|required',
    target: 'string|required',
    label: 'string|optional',
    weight: 'number|optional',
    snapshot: 'object|optional'  // For denormalization
  },
  partitions: {
    bySource: { fields: { source: 'string' } },
    byTarget: { fields: { target: 'string' } },
    byLabel: { fields: { label: 'string' } }
  }
});

// Install plugin
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'relationships',
  directed: true,
  weighted: true
});

await db.usePlugin(graphPlugin);

// Create users
const alice = await users.insert({ name: 'Alice' });
const bob = await users.insert({ name: 'Bob' });
const charlie = await users.insert({ name: 'Charlie' });

// Create connections
await users.graph.connect(alice.id, bob.id, { label: 'follows', weight: 1 });
await users.graph.connect(bob.id, charlie.id, { label: 'follows', weight: 2 });

// Find path
const path = await users.graph.shortestPath(alice.id, charlie.id);
console.log('Path:', path.path);
// Output: Path: ['alice-id', 'bob-id', 'charlie-id']
console.log('Distance:', path.distance);
// Output: Distance: 3
```

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**NO Peer Dependencies!**

GraphPlugin works out-of-the-box with **zero external dependencies**:
- ✅ Pure JavaScript A* implementation with MinHeap
- ✅ Uses S3DB's built-in partitioning for O(1) edge lookups
- ✅ No graph database required

**Required Edge Resource Schema:**

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
    bySource: { fields: { source: 'string' } },  // REQUIRED for performance
    byTarget: { fields: { target: 'string' } },  // REQUIRED for incoming edges
    byLabel: { fields: { label: 'string' } }     // RECOMMENDED for label queries
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

## Usage Journey

### Level 1: Basic Graph Setup

Create vertex and edge resources:

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'connections'
});

// Optionally let plugin create resources
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'connections',
  createResources: true  // Auto-create with proper schema
});

await db.usePlugin(graphPlugin);
```

**What you get:** Graph methods available on vertex and edge resources.

### Level 2: Creating Connections

Connect vertices with edges:

```javascript
// Simple connection
await users.graph.connect(alice.id, bob.id);

// With label
await users.graph.connect(alice.id, bob.id, { label: 'follows' });

// With weight
await users.graph.connect(alice.id, bob.id, { label: 'follows', weight: 5 });

// With custom data
await users.graph.connect(alice.id, bob.id, {
  label: 'follows',
  weight: 5,
  data: { since: new Date(), source: 'recommendation' }
});

// Check if connected
const isFollowing = await users.graph.isConnected(alice.id, bob.id);
// true

// Remove connection
await users.graph.disconnect(alice.id, bob.id);
// Removes edge(s) between alice and bob
```

**Using Edge Resource Directly:**

```javascript
// Create edge via edge resource
const edge = await connections.graph.create(alice.id, bob.id, {
  label: 'follows',
  weight: 1
});

// Remove via edge resource
await connections.graph.remove(alice.id, bob.id, { label: 'follows' });
```

**What you get:** Full CRUD operations on graph edges.

### Level 3: Querying Neighbors

Find connected vertices:

```javascript
// All neighbors (both directions)
const allNeighbors = await users.graph.neighbors(alice.id);

// Outgoing neighbors only (who does Alice follow?)
const following = await users.graph.outgoingNeighbors(alice.id);

// Incoming neighbors only (who follows Alice?)
const followers = await users.graph.incomingNeighbors(alice.id);

// Filter by label
const friends = await users.graph.neighbors(alice.id, {
  direction: 'both',
  label: 'friend'
});

// Neighbors include edge info
const neighbors = await users.graph.neighbors(alice.id);
for (const neighbor of neighbors) {
  console.log(neighbor.name);           // Vertex data
  console.log(neighbor._edges);         // Edge data
  console.log(neighbor._edges[0].label); // Edge label
}
```

**Get Vertex Degree:**

```javascript
const degree = await users.graph.degree(alice.id);
// { total: 15, outgoing: 10, incoming: 5 }
```

**What you get:** Efficient neighbor discovery.

### Level 4: Shortest Path with A*

Find optimal paths between vertices:

```javascript
// Basic shortest path
const result = await users.graph.shortestPath(alice.id, charlie.id);
// {
//   path: ['alice', 'bob', 'charlie'],
//   edges: [{ source: 'alice', target: 'bob' }, ...],
//   distance: 2
// }

// With options
const result = await users.graph.shortestPath(alice.id, charlie.id, {
  maxDepth: 10,              // Limit search depth
  direction: 'outgoing',     // Follow edges in this direction
  includeStats: true         // Include algorithm stats
});
// result.stats = { iterations: 42, visited: 15 }

// With custom heuristic (for geographic data)
const result = await users.graph.shortestPath(startCity, endCity, {
  heuristic: (currentId, targetId) => {
    // Return estimated distance to target
    const current = cityCoords[currentId];
    const target = cityCoords[targetId];
    return haversineDistance(current, target);
  }
});

// Check if path exists (without retrieving it)
const reachable = await users.graph.pathExists(alice.id, charlie.id);
// true
```

**Weighted Pathfinding:**

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'cities',
  edges: 'routes',
  weighted: true,
  defaultWeight: 1
});

// Edges have distances
await cities.graph.connect('nyc', 'boston', { weight: 215 });  // miles
await cities.graph.connect('nyc', 'philly', { weight: 95 });
await cities.graph.connect('philly', 'boston', { weight: 310 });

// Shortest path by distance
const route = await cities.graph.shortestPath('nyc', 'boston');
// path: ['nyc', 'boston'], distance: 215
// (direct is shorter than nyc→philly→boston = 405)
```

**What you get:** Optimal pathfinding with A* algorithm.

### Level 5: Graph Traversal

Explore graphs systematically:

```javascript
// Breadth-First Search (explores level by level)
const bfsResult = await users.graph.traverse(alice.id, {
  mode: 'bfs',
  maxDepth: 3
});
// Returns all vertices reachable within 3 hops

// Depth-First Search (explores branches fully)
const dfsResult = await users.graph.traverse(alice.id, {
  mode: 'dfs',
  maxDepth: 5
});

// With filter (only include matching vertices)
const activeUsers = await users.graph.traverse(alice.id, {
  mode: 'bfs',
  filter: (node) => node.data?.isActive === true
});

// With visitor callback (process each node)
const visited = [];
await users.graph.traverse(alice.id, {
  mode: 'bfs',
  visitor: async (node) => {
    visited.push(node.id);
    // Return false to stop exploring this branch
    if (node.depth >= 2) return false;
    return true;  // Continue
  }
});

// Traversal result structure
const result = await users.graph.traverse(alice.id);
// [
//   { id: 'alice', depth: 0, path: ['alice'], data: {...} },
//   { id: 'bob', depth: 1, path: ['alice', 'bob'], data: {...} },
//   { id: 'charlie', depth: 2, path: ['alice', 'bob', 'charlie'], data: {...} }
// ]
```

**What you get:** Systematic graph exploration.

### Level 6: Denormalization for Performance

Cache vertex data on edges to avoid N+1 queries:

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'follows',
  denormalize: ['name', 'avatar', 'verified']  // Fields to cache
});

await db.usePlugin(graphPlugin);

// When creating edge, target vertex data is cached
await users.graph.connect(alice.id, bob.id, { label: 'follows' });
// Edge stores: {
//   source: 'alice',
//   target: 'bob',
//   label: 'follows',
//   snapshot: { name: 'Bob', avatar: 'http://...', verified: true }
// }

// Neighbor queries use cached data (no additional fetches!)
const following = await users.graph.neighbors(alice.id);
// [{ id: 'bob', name: 'Bob', avatar: '...', verified: true, _edges: [...] }]
// ☝️ Vertex data came from edge.snapshot, not from fetching users!
```

**When to Use Denormalization:**

✅ **Good use cases:**
- Displaying follower/following lists with names/avatars
- Friend suggestions with basic profile info
- Social feeds with author previews

❌ **Avoid when:**
- Vertex data changes frequently
- You need always-fresh data
- Caching too many fields (bloats edges)

**Trade-offs:**
- Faster reads (no vertex fetches)
- Stale data risk (if vertex updated)
- Larger edge objects
- Update complexity (may need to refresh edges)

**What you get:** Significantly faster neighbor queries.

### Level 7: Production Patterns

**Pattern 1: Social Follow System**

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'follows',
  directed: true,
  denormalize: ['username', 'avatar', 'displayName']
});

// Follow a user
async function followUser(followerId, followeeId) {
  const isFollowing = await users.graph.isConnected(followerId, followeeId);
  if (isFollowing) {
    throw new Error('Already following');
  }
  await users.graph.connect(followerId, followeeId, { label: 'follows' });
}

// Unfollow
async function unfollowUser(followerId, followeeId) {
  await users.graph.disconnect(followerId, followeeId, { label: 'follows' });
}

// Get followers with pagination
async function getFollowers(userId, { limit = 20, offset = 0 } = {}) {
  const edges = await follows.graph.byTarget(userId, { limit: limit + offset });
  return edges.slice(offset, offset + limit).map(e => ({
    id: e.source,
    ...e.snapshot
  }));
}

// Mutual followers
async function getMutualFollowers(userA, userB) {
  const [followersA, followersB] = await Promise.all([
    users.graph.incomingNeighbors(userA),
    users.graph.incomingNeighbors(userB)
  ]);
  const setB = new Set(followersB.map(f => f.id));
  return followersA.filter(f => setB.has(f.id));
}
```

**Pattern 2: Recommendation Engine**

```javascript
// "Users who follow X also follow..."
async function getRecommendations(userId, limit = 10) {
  // 1. Get who this user follows
  const following = await users.graph.outgoingNeighbors(userId);
  const followingIds = new Set(following.map(f => f.id));
  followingIds.add(userId); // Exclude self

  // 2. Get who they follow (2nd degree)
  const recommendations = new Map();

  for (const followee of following) {
    const theirFollowing = await users.graph.outgoingNeighbors(followee.id);
    for (const candidate of theirFollowing) {
      if (!followingIds.has(candidate.id)) {
        const count = recommendations.get(candidate.id) || 0;
        recommendations.set(candidate.id, count + 1);
      }
    }
  }

  // 3. Sort by frequency (most followed by people you follow)
  return Array.from(recommendations.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ id, score }));
}
```

**Pattern 3: Knowledge Graph**

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'concepts',
  edges: 'relations',
  directed: true,
  weighted: true
});

// Create knowledge graph
await concepts.insert({ id: 'javascript', name: 'JavaScript', type: 'language' });
await concepts.insert({ id: 'typescript', name: 'TypeScript', type: 'language' });
await concepts.insert({ id: 'react', name: 'React', type: 'framework' });

await concepts.graph.connect('typescript', 'javascript', {
  label: 'extends',
  weight: 0.9  // Strong relationship
});

await concepts.graph.connect('react', 'javascript', {
  label: 'requires',
  weight: 0.8
});

// Find related concepts
async function getRelatedConcepts(conceptId, depth = 2) {
  return await concepts.graph.traverse(conceptId, {
    mode: 'bfs',
    maxDepth: depth,
    direction: 'both'
  });
}

// Find path between concepts
async function howAreTheyRelated(concept1, concept2) {
  try {
    const path = await concepts.graph.shortestPath(concept1, concept2, {
      direction: 'both'  // Traverse in any direction
    });
    return path.edges.map(e => e.label);
  } catch (e) {
    if (e.name === 'PathNotFoundError') return null;
    throw e;
  }
}
```

**Pattern 4: Access Control Graph**

```javascript
const graphPlugin = new GraphPlugin({
  vertices: ['users', 'groups', 'resources'],
  edges: 'permissions',
  directed: true
});

// Grant access
await permissions.graph.create(userId, resourceId, { label: 'can_read' });
await permissions.graph.create(groupId, resourceId, { label: 'can_write' });
await permissions.graph.create(userId, groupId, { label: 'member_of' });

// Check access (can user reach resource with required permission?)
async function hasAccess(userId, resourceId, permission) {
  // Direct access
  const directEdges = await permissions.graph.between(userId, resourceId);
  if (directEdges.some(e => e.label === permission)) return true;

  // Via groups
  const groups = await permissions.graph.bySource(userId);
  for (const edge of groups) {
    if (edge.label === 'member_of') {
      const groupPermissions = await permissions.graph.between(edge.target, resourceId);
      if (groupPermissions.some(e => e.label === permission)) return true;
    }
  }

  return false;
}
```

---

## 📊 Configuration Reference

### GraphPlugin Options

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

### Field Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vertexIdField` | string | `'id'` | Field name for vertex ID |
| `edgeSourceField` | string | `'source'` | Field name for source vertex |
| `edgeTargetField` | string | `'target'` | Field name for target vertex |
| `edgeLabelField` | string | `'label'` | Field name for edge label |
| `edgeWeightField` | string | `'weight'` | Field name for edge weight |

### Required Edge Partitions

```javascript
partitions: {
  bySource: { fields: { source: 'string' } },  // Required
  byTarget: { fields: { target: 'string' } },  // Required
  byLabel: { fields: { label: 'string' } }     // Recommended
}
```

---

## 📚 Configuration Examples

### Example 1: Social Network

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'follows',
  directed: true,
  denormalize: ['username', 'avatar', 'verified']
});

const follows = await db.createResource({
  name: 'follows',
  attributes: {
    source: 'string|required',
    target: 'string|required',
    label: 'string|optional',
    createdAt: 'date|optional',
    snapshot: 'object|optional'
  },
  partitions: {
    bySource: { fields: { source: 'string' } },
    byTarget: { fields: { target: 'string' } }
  }
});

await db.usePlugin(graphPlugin);
```

### Example 2: Weighted Road Network

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'cities',
  edges: 'roads',
  directed: false,    // Roads are bidirectional
  weighted: true,
  defaultWeight: 100  // Default distance in km
});

const roads = await db.createResource({
  name: 'roads',
  attributes: {
    source: 'string|required',
    target: 'string|required',
    weight: 'number|required',  // Distance in km
    label: 'string|optional',   // highway, local, etc.
    tollCost: 'number|optional'
  },
  partitions: {
    bySource: { fields: { source: 'string' } },
    byTarget: { fields: { target: 'string' } },
    byLabel: { fields: { label: 'string' } }
  }
});

await db.usePlugin(graphPlugin);

// Find shortest route with toll cost heuristic
const route = await cities.graph.shortestPath('new-york', 'los-angeles', {
  heuristic: (current, target) => {
    // Add estimated remaining distance
    return estimatedDistance(current, target);
  }
});
```

### Example 3: Multi-Resource Graph

```javascript
const graphPlugin = new GraphPlugin({
  vertices: ['users', 'products', 'categories'],
  edges: 'interactions',
  directed: true,
  weighted: true
});

// Different relationship types
await users.graph.connect(userId, productId, { label: 'purchased', weight: 10 });
await users.graph.connect(userId, productId, { label: 'viewed', weight: 1 });
await products.graph.connect(productId, categoryId, { label: 'belongs_to' });

// Query across resource types
const userInteractions = await interactions.graph.bySource(userId);
const productRelations = await interactions.graph.bySource(productId);
```

### Example 4: Undirected Friendship Graph

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'friendships',
  directed: false,  // A↔B automatically creates both edges
  denormalize: ['name', 'avatar']
});

// Creates two edges: alice→bob AND bob→alice
await users.graph.connect(alice.id, bob.id, { label: 'friend' });

// Either direction returns the edge
const aliceFriends = await users.graph.neighbors(alice.id);  // includes bob
const bobFriends = await users.graph.neighbors(bob.id);      // includes alice

// Disconnect removes both directions
await users.graph.disconnect(alice.id, bob.id);
```

### Example 5: Auto-Created Resources

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'nodes',
  edges: 'links',
  createResources: true,  // Plugin creates resources with proper schema
  directed: true,
  weighted: true
});

await db.usePlugin(graphPlugin);

// Resources are auto-created with:
// - nodes: { id, data }
// - links: { source, target, label, weight } + partitions
```

---

## 🔧 API Reference

### Vertex Resource Methods

When GraphPlugin is installed, vertex resources gain a `.graph` namespace:

```javascript
const graph = users.graph;
```

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

```javascript
const graph = relationships.graph;
```

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

## ✅ Best Practices

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

// ⚠️ Undirected doubles edge storage!
```

### 3. Use Denormalization for Display Data

```javascript
// Cache fields commonly shown with edges
denormalize: ['name', 'avatar', 'username']

// ❌ Don't cache:
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

## 🚨 Error Handling

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

### VertexNotFoundError

**When:** Referenced vertex doesn't exist (with denormalization)

```javascript
// If denormalization enabled and vertex not found
await users.graph.connect('nonexistent', bob.id);
// May store edge with empty snapshot
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

## ❓ FAQ

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
// Filter out direct friends (depth 1)
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
// Users can be in many groups, groups have many users
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
