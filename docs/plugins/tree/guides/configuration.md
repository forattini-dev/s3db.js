# Configuration

> **In this guide:** All configuration options, driver selection, resource schemas, and API reference.

**Navigation:** [← Back to Tree Plugin](/plugins/tree/README.md)

---

## Plugin Options

```javascript
new TreePlugin({
  resources: ['categories'],      // Resources to enable tree functionality
  driver: 'nested-set',           // 'nested-set' or 'adjacency-list'
  treeField: null,                // Field for multi-tree isolation
  leftField: 'lft',               // Left value field (Nested Set)
  rightField: 'rgt',              // Right value field (Nested Set)
  depthField: 'depth',            // Depth field
  parentField: 'parentId',        // Parent reference field
  rootParentValue: null,          // Value of parentId for root nodes
  autoRebuild: false,             // Auto-rebuild on integrity errors
  logLevel: 'info'                // Log level
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resources` | string[] | `[]` | Resources to enable tree functionality |
| `driver` | string | `'nested-set'` | Tree implementation: `'nested-set'` or `'adjacency-list'` |
| `treeField` | string | `null` | Field for multi-tree isolation (e.g., `'treeId'`) |
| `leftField` | string | `'lft'` | Field name for left value (Nested Set) |
| `rightField` | string | `'rgt'` | Field name for right value (Nested Set) |
| `depthField` | string | `'depth'` | Field name for depth value |
| `parentField` | string | `'parentId'` | Field name for parent reference |
| `rootParentValue` | any | `null` | Value of parentId for root nodes |
| `autoRebuild` | boolean | `false` | Auto-rebuild on integrity errors |
| `logLevel` | string | `'info'` | Log level: `'silent'`, `'debug'`, `'info'`, `'warn'`, `'error'` |

---

## Driver Selection

### Nested Set Driver

**Best for read-heavy workloads:**
- E-commerce category trees
- Organization hierarchies
- Analytics dashboards
- Menu systems
- Taxonomy/classification systems

**Characteristics:**
- Descendants query: O(1) - single range query
- Writes require rebalancing: O(n)
- Atomic subtree operations via distributed locking
- Self-healing with `rebuildTree()`

### Adjacency List Driver

**Best for write-heavy workloads:**
- Content management systems
- File systems
- Comment threads
- Task hierarchies
- Real-time collaborative editing

**Characteristics:**
- Child/parent queries: O(1) via `byParent` partition
- Descendants require recursion: O(depth × children)
- Move operations: O(1) - just update `parentId`
- Requires `byParent` partition

### Performance Comparison

| Feature | Nested Set | Adjacency List |
|---------|------------|----------------|
| Get descendants | O(1) | O(n) recursive |
| Get ancestors | O(1) | O(depth) recursive |
| Insert child | O(n) | O(1) |
| Move subtree | O(n) | O(1) |
| Delete node | O(n) | O(1) |
| Get children | O(log n) | O(1) (partition) |
| Storage | +3 fields (lft/rgt/depth) | +1 field (parentId) |

### Decision Matrix

| Question | Nested Set | Adjacency List |
|----------|------------|----------------|
| How often do you query descendants? | Frequently | Rarely |
| How often do you add/move nodes? | Rarely | Frequently |
| Do you need aggregate queries? | Yes | No |
| Is tree depth predictable? | Any depth | Shallow (<10 levels) |
| Need subtree counts instantly? | Yes | No |

---

## Resource Schema Requirements

### Nested Set Driver

```javascript
{
  attributes: {
    // Your fields
    name: 'string|required',

    // Required tree fields (auto-managed)
    lft: 'number|optional',
    rgt: 'number|optional',
    depth: 'number|optional',
    parentId: 'string|optional',

    // Only if multi-tree enabled
    treeId: 'string|required'
  },
  partitions: {
    // Recommended for multi-tree
    byTree: { fields: { treeId: 'string' } }
  }
}
```

### Adjacency List Driver

```javascript
{
  attributes: {
    name: 'string|required',
    parentId: 'string|optional',  // Required!

    // Only if multi-tree enabled
    treeId: 'string|required'
  },
  partitions: {
    byParent: { fields: { parentId: 'string' } },  // REQUIRED!
    byTree: { fields: { treeId: 'string' } }       // Recommended for multi-tree
  }
}
```

---

## Multi-Tree Support

Store multiple independent trees in the same resource:

```javascript
const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set',
  treeField: 'treeId'
});

// Create separate trees
const productsRoot = await categories.tree.createRoot({
  name: 'Products',
  treeId: 'products'
});

const blogRoot = await categories.tree.createRoot({
  name: 'Blog Categories',
  treeId: 'blog'
});

// treeId is inherited by children automatically
const electronics = await categories.tree.addChild(productsRoot.id, {
  name: 'Electronics'
});
console.log(electronics.treeId); // 'products'

// Query roots filtered by tree
const productRoots = await categories.tree.getRoots({ treeId: 'products' });

// Cross-tree moves are prevented
await categories.tree.moveSubtree(electronics.id, blogRoot.id);
// Error: Cannot move node to a different tree
```

---

## API Reference

### Core Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `createRoot(data)` | Create a root node | Node |
| `addChild(parentId, data)` | Add child to parent | Node |
| `getNode(nodeId)` | Get node by ID | Node |
| `deleteNode(nodeId, opts)` | Delete node | void |
| `deleteSubtree(nodeId)` | Delete node and all descendants | void |
| `moveSubtree(nodeId, newParentId)` | Move node under new parent | void |

### Query Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `getRoots(opts?)` | Get all root nodes | Node[] |
| `getChildren(nodeId, opts?)` | Get direct children | Node[] |
| `getDescendants(nodeId, opts?)` | Get all descendants | Node[] |
| `getAncestors(nodeId, opts?)` | Get path to root | Node[] |
| `getSiblings(nodeId, opts?)` | Get siblings | Node[] |
| `getLeaves(nodeId?, opts?)` | Get leaf nodes | Node[] |
| `getTreeDepth(opts?)` | Get max tree depth | number |

### Tree Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `getFullTree(opts?)` | Get entire tree | Node[] |
| `toNestedArray(nodeId?, opts?)` | Get nested structure | NestedNode[] |
| `verify(opts?)` | Verify tree integrity | VerifyResult |
| `rebuild(opts?)` | Rebuild tree structure | void |

### Check Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `isRoot(nodeId)` | Check if node is root | boolean |
| `isLeaf(nodeId)` | Check if node is leaf | boolean |
| `isDescendantOf(nodeId, ancestorId)` | Check descendant relationship | boolean |
| `isAncestorOf(nodeId, descendantId)` | Check ancestor relationship | boolean |
| `countDescendants(nodeId)` | Count all descendants | number |

### Insert Operations (Nested Set only)

| Method | Description | Returns |
|--------|-------------|---------|
| `insertBefore(siblingId, data)` | Insert before sibling | Node |
| `insertAfter(siblingId, data)` | Insert after sibling | Node |

### Node-Level API

Every node has a `.tree` namespace:

```javascript
const node = await categories.get('node-id');

// Navigation
await node.tree.parent();
await node.tree.children();
await node.tree.descendants();
await node.tree.ancestors();
await node.tree.siblings();

// Actions
await node.tree.addChild(data);
await node.tree.moveTo(newParentId);
await node.tree.delete(opts);
await node.tree.deleteSubtree();

// Checks
await node.tree.isRoot();
await node.tree.isLeaf();
await node.tree.isDescendantOf(ancestorId);
```

### Options Parameters

**DeleteNode Options:**
```javascript
{
  promoteChildren: false  // If true, children become children of deleted node's parent
}
```

**Query Options (with treeField):**
```javascript
{
  treeId: 'products'  // Filter results by tree
}
```

---

## Error Classes

```javascript
import {
  TreeConfigurationError,
  NodeNotFoundError,
  InvalidParentError,
  RootNodeError
} from 's3db.js';
```

| Error | When |
|-------|------|
| `TreeConfigurationError` | Invalid plugin configuration |
| `NodeNotFoundError` | Referenced node doesn't exist |
| `InvalidParentError` | Move would create cycle or cross-tree |
| `RootNodeError` | Invalid operation on root node |

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Tree operations, querying, real-world examples
- [Best Practices](./best-practices.md) - Performance, troubleshooting, FAQ
