# Usage Patterns

> **In this guide:** Progressive adoption, production patterns, and real-world examples.

**Navigation:** [← Back to Graph Plugin](../README.md) | [Configuration](./configuration.md)

---

## Level 1: Basic Graph Setup

Create vertex and edge resources:

```javascript
import { Database, GraphPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket' });
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
    snapshot: 'object|optional'
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
```

---

## Level 2: Creating Connections

Connect vertices with edges:

```javascript
// Create users
const alice = await users.insert({ name: 'Alice' });
const bob = await users.insert({ name: 'Bob' });
const charlie = await users.insert({ name: 'Charlie' });

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
```

---

## Level 3: Querying Neighbors

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

// Get vertex degree
const degree = await users.graph.degree(alice.id);
// { total: 15, outgoing: 10, incoming: 5 }
```

---

## Level 4: Shortest Path with A*

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
    const current = cityCoords[currentId];
    const target = cityCoords[targetId];
    return haversineDistance(current, target);
  }
});

// Check if path exists (without retrieving it)
const reachable = await users.graph.pathExists(alice.id, charlie.id);
// true
```

---

## Level 5: Graph Traversal

Explore graphs systematically:

```javascript
// Breadth-First Search (explores level by level)
const bfsResult = await users.graph.traverse(alice.id, {
  mode: 'bfs',
  maxDepth: 3
});

// Depth-First Search (explores branches fully)
const dfsResult = await users.graph.traverse(alice.id, {
  mode: 'dfs',
  maxDepth: 5
});

// With filter
const activeUsers = await users.graph.traverse(alice.id, {
  mode: 'bfs',
  filter: (node) => node.data?.isActive === true
});

// With visitor callback
const visited = [];
await users.graph.traverse(alice.id, {
  mode: 'bfs',
  visitor: async (node) => {
    visited.push(node.id);
    if (node.depth >= 2) return false;  // Stop at depth 2
    return true;
  }
});
```

---

## Level 6: Denormalization for Performance

Cache vertex data on edges to avoid N+1 queries:

```javascript
const graphPlugin = new GraphPlugin({
  vertices: 'users',
  edges: 'follows',
  denormalize: ['name', 'avatar', 'verified']
});

await db.usePlugin(graphPlugin);

// When creating edge, target vertex data is cached
await users.graph.connect(alice.id, bob.id, { label: 'follows' });
// Edge stores: {
//   source: 'alice',
//   target: 'bob',
//   snapshot: { name: 'Bob', avatar: 'http://...', verified: true }
// }

// Neighbor queries use cached data (no additional fetches!)
const following = await users.graph.neighbors(alice.id);
// [{ id: 'bob', name: 'Bob', avatar: '...', verified: true, _edges: [...] }]
```

---

## Production Patterns

### Pattern 1: Social Follow System

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
  if (isFollowing) throw new Error('Already following');
  await users.graph.connect(followerId, followeeId, { label: 'follows' });
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

### Pattern 2: Recommendation Engine

```javascript
// "Users who follow X also follow..."
async function getRecommendations(userId, limit = 10) {
  const following = await users.graph.outgoingNeighbors(userId);
  const followingIds = new Set(following.map(f => f.id));
  followingIds.add(userId);

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

  return Array.from(recommendations.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ id, score }));
}
```

### Pattern 3: Knowledge Graph

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
  weight: 0.9
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
      direction: 'both'
    });
    return path.edges.map(e => e.label);
  } catch (e) {
    if (e.name === 'PathNotFoundError') return null;
    throw e;
  }
}
```

### Pattern 4: Access Control Graph

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

// Check access
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

## Configuration Examples

### Social Network

```javascript
new GraphPlugin({
  vertices: 'users',
  edges: 'follows',
  directed: true,
  denormalize: ['username', 'avatar', 'verified']
});
```

### Weighted Road Network

```javascript
new GraphPlugin({
  vertices: 'cities',
  edges: 'roads',
  directed: false,    // Roads are bidirectional
  weighted: true,
  defaultWeight: 100  // Default distance in km
});
```

### Undirected Friendship Graph

```javascript
new GraphPlugin({
  vertices: 'users',
  edges: 'friendships',
  directed: false,  // A↔B automatically creates both edges
  denormalize: ['name', 'avatar']
});

// Creates two edges: alice→bob AND bob→alice
await users.graph.connect(alice.id, bob.id, { label: 'friend' });
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Tips, error handling, FAQ
