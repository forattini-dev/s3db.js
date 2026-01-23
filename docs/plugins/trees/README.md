# Tree Plugin

> **Hierarchical data structures for s3db.js with Nested Set and Adjacency List drivers.**

---

## TLDR

**Manage hierarchical data (categories, organizations, file systems) with optimized tree operations.**

**1 line to get started:**
```javascript
await db.usePlugin(new TreePlugin({ resources: ['categories'], driver: 'nested-set' }));
```

**Key features:**
- 2 drivers: Nested Set (fast reads) or Adjacency List (fast writes)
- Multi-tree support: Isolate multiple trees in same resource
- O(1) descendants/ancestors with Nested Set
- Node-level API: `node.tree.children()`, `node.tree.parent()`
- Move subtrees atomically with cycle prevention
- Tree verification and rebuild capabilities

**Use cases:**
- E-commerce category trees
- Organization hierarchies
- File system structures
- Comment threads
- Menu systems

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { TreePlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

const categories = await db.createResource({
  name: 'categories',
  attributes: {
    name: 'string|required',
    lft: 'number|optional',
    rgt: 'number|optional',
    depth: 'number|optional',
    parentId: 'string|optional'
  }
});

const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set',
  treeField: 'treeId'
});

await db.usePlugin(treePlugin);

// Create a hierarchy
const root = await categories.tree.createRoot({ name: 'Electronics', treeId: 'products' });
const phones = await categories.tree.addChild(root.id, { name: 'Phones' });
const iphone = await categories.tree.addChild(phones.id, { name: 'iPhone 15' });

// Query the tree (O(1) with Nested Set!)
const descendants = await categories.tree.getDescendants(root.id);
const ancestors = await categories.tree.getAncestors(iphone.id);
```

---

## Dependencies

**Zero external dependencies** - built directly into s3db.js core.

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, driver selection, resource schemas, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Tree operations, querying, node-level API, real-world examples |
| [Best Practices](./guides/best-practices.md) | Performance, error handling, troubleshooting, FAQ |

---

## Quick Reference

### Driver Comparison

| Feature | Nested Set | Adjacency List |
|---------|------------|----------------|
| Get descendants | O(1) | O(n) recursive |
| Get ancestors | O(1) | O(depth) recursive |
| Insert child | O(n) | O(1) |
| Move subtree | O(n) | O(1) |
| Storage | +3 fields (lft/rgt/depth) | +1 field (parentId) |
| Best for | Read-heavy, analytics | Write-heavy, CMS |

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resources` | string[] | `[]` | Resources to enable tree functionality |
| `driver` | string | `'nested-set'` | `'nested-set'` or `'adjacency-list'` |
| `treeField` | string | `null` | Field for multi-tree isolation |
| `parentField` | string | `'parentId'` | Parent reference field |
| `autoRebuild` | boolean | `false` | Auto-rebuild on integrity errors |

### Plugin Methods

```javascript
// Core operations
await categories.tree.createRoot(data);
await categories.tree.addChild(parentId, data);
await categories.tree.moveSubtree(nodeId, newParentId);
await categories.tree.deleteNode(nodeId, { promoteChildren: true });
await categories.tree.deleteSubtree(nodeId);

// Query operations
await categories.tree.getChildren(nodeId);
await categories.tree.getDescendants(nodeId);
await categories.tree.getAncestors(nodeId);
await categories.tree.getSiblings(nodeId);
await categories.tree.getRoots();
await categories.tree.getLeaves(nodeId);

// Tree operations
await categories.tree.getFullTree();
await categories.tree.toNestedArray(nodeId);
await categories.tree.verify();
await categories.tree.rebuild();
```

### Node-Level API

```javascript
const node = await categories.get(nodeId);

// Navigation
await node.tree.parent();
await node.tree.children();
await node.tree.descendants();
await node.tree.ancestors();

// Actions
await node.tree.addChild(data);
await node.tree.moveTo(newParentId);
await node.tree.delete({ promoteChildren: true });
```

---

## How It Works

1. **Choose a driver** based on your read/write patterns
2. **Create resources** with required tree fields
3. **Build hierarchy** using `createRoot()` and `addChild()`
4. **Query efficiently** using partition-optimized methods
5. **Move and delete** with automatic cycle prevention
6. **Verify and rebuild** for tree integrity maintenance

---

## Configuration Examples

### Nested Set (Read-Heavy)

```javascript
const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set'
});

// Schema requires: lft, rgt, depth, parentId
```

### Adjacency List (Write-Heavy)

```javascript
const treePlugin = new TreePlugin({
  resources: ['files'],
  driver: 'adjacency-list'
});

// Schema requires: parentId
// Partition required: byParent
```

### Multi-Tree Support

```javascript
const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set',
  treeField: 'treeId'
});

// Create isolated trees
await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
await categories.tree.createRoot({ name: 'Blog Tags', treeId: 'blog' });
```

---

## See Also

- [Graph Plugin](/plugins/graphs/README.md) - General graph relationships
- [Relation Plugin](/plugins/relation/README.md) - ORM-style relations
- [Cache Plugin](/plugins/cache/README.md) - Cache tree queries
