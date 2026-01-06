# Best Practices & FAQ

> **In this guide:** Performance optimization, error handling, troubleshooting, and comprehensive FAQ.

**Navigation:** [← Back to Tree Plugin](/plugins/tree/README.md) | [Configuration](/plugins/tree/guides/configuration.md)

---

## Best Practices

### 1. Choose the Right Driver

```javascript
// Read-heavy (category browsing, menus, breadcrumbs)
{ driver: 'nested-set' }

// Write-heavy (CMS, file systems, reorganization)
{ driver: 'adjacency-list' }
```

### 2. Use Multi-Tree for Isolation

```javascript
// Bad: Mixing different taxonomies in same tree
const products = await categories.tree.createRoot({ name: 'Products' });
const blogTags = await categories.tree.createRoot({ name: 'Blog Tags' });
// These share lft/rgt space - can interfere!

// Good: Use treeField for isolation
const treePlugin = new TreePlugin({
  resources: ['categories'],
  treeField: 'taxonomyType'
});

const products = await categories.tree.createRoot({
  name: 'Products',
  taxonomyType: 'products'
});
const blogTags = await categories.tree.createRoot({
  name: 'Tags',
  taxonomyType: 'blog'
});
// Each tree is completely independent
```

### 3. Use asyncPartitions: false for Adjacency List

```javascript
// IMPORTANT: Adjacency List queries byParent partition immediately
const resource = await db.createResource({
  name: 'categories',
  asyncPartitions: false,  // Critical!
  attributes: { ... },
  partitions: {
    byParent: { fields: { parentId: 'string' } }
  }
});
```

### 4. Validate Before Move Operations

```javascript
async function safeMove(nodeId, newParentId) {
  const node = await categories.get(nodeId);
  const newParent = await categories.get(newParentId);

  // Custom validations
  if (newParent.depth >= MAX_DEPTH) {
    throw new Error('Maximum depth exceeded');
  }

  // Plugin handles cycle detection automatically
  await categories.tree.moveSubtree(nodeId, newParentId);
}
```

### 5. Use Verification in CI/CD

```javascript
// In your health check or startup
const verification = await categories.tree.verify();
if (!verification.valid) {
  console.error('Tree integrity issues:', verification.errors);
  await categories.tree.rebuild();
}
```

### 6. Leverage Node-Level API for Clean Code

```javascript
// Instead of this:
const parent = await categories.tree.getNode(node.parentId);
const children = await categories.tree.getChildren(node.id);

// Use node-level API:
const parent = await node.tree.parent();
const children = await node.tree.children();
```

### 7. Cache Frequently Accessed Trees

```javascript
// Combine with CachePlugin
await db.usePlugin(new CachePlugin({
  driver: 'memory',
  ttl: 60000  // 1 minute
}));
```

---

## Error Handling

### Error Classes

```javascript
import {
  TreeConfigurationError,
  NodeNotFoundError,
  InvalidParentError,
  RootNodeError
} from 's3db.js';
```

### TreeConfigurationError

**When:** Invalid plugin configuration

```javascript
// Bad driver
new TreePlugin({ driver: 'invalid' });
// Error: Unknown driver: invalid

// Missing byParent partition (Adjacency List)
await categories.tree.createRoot({ name: 'Root' });
// Error: Adjacency list driver requires 'byParent' partition
```

### NodeNotFoundError

**When:** Referenced node doesn't exist

```javascript
await categories.tree.addChild('nonexistent-id', { name: 'Child' });
// Error: Node not found: nonexistent-id
```

### InvalidParentError

**When:** Move operation would create invalid structure

```javascript
// Cycle detection
await categories.tree.moveSubtree(root.id, childOfRoot.id);
// Error: Cannot set childOfRoot as parent of root: would create a cycle

// Cross-tree move (with treeField)
await categories.tree.moveSubtree(productNode.id, blogNode.id);
// Error: Cannot move node to a different tree
```

### RootNodeError

**When:** Invalid operation on root node

```javascript
await categories.tree.deleteNode(root.id, { promoteChildren: false });
// Error: Cannot delete root node (it has children)
```

### Error Handling Pattern

```javascript
try {
  await categories.tree.moveSubtree(nodeId, newParentId);
} catch (error) {
  if (error.name === 'InvalidParentError') {
    console.error('Cannot move:', error.message);
  } else if (error.name === 'NodeNotFoundError') {
    console.error('Node missing:', error.nodeId);
  } else {
    throw error;
  }
}
```

---

## Troubleshooting

### My Adjacency List is Slow

**Solution:** Add the `byParent` partition:
```javascript
partitions: {
  byParent: { fields: { parentId: 'string' } }
}
```

### Tree Has Gaps in lft/rgt Values

Gaps can occur after deletions but don't affect functionality. Run `rebuild()` to compact:
```javascript
await categories.tree.rebuild();
```

### "Node has children" Error on Delete

By default, `deleteNode` prevents deleting nodes with children:
```javascript
// Option 1: Promote children
await categories.tree.deleteNode(nodeId, { promoteChildren: true });

// Option 2: Delete entire subtree
await categories.tree.deleteSubtree(nodeId);
```

### Corrupted Tree Recovery

```javascript
const result = await categories.tree.verify();
if (!result.valid) {
  console.log('Errors:', result.errors);
  await categories.tree.rebuild();
}
```

---

## FAQ

### Basics

**Q: Which driver should I use?**

A: Use **Nested Set** for read-heavy applications (category browsing, menus, analytics). Use **Adjacency List** for write-heavy applications (CMS, file systems, frequent reorganization).

**Q: Can I switch drivers later?**

A: Yes, but it requires migration. Both drivers use `parentId`, so you can rebuild the tree with the new driver. Nested Set → Adjacency List is easier (just drop lft/rgt). Adjacency List → Nested Set requires running `rebuild()`.

**Q: How many trees can I have in one resource?**

A: Unlimited when using `treeField`. Each unique value creates an isolated tree with its own numbering.

### Configuration

**Q: Do I need all the tree fields in my schema?**

A: For Nested Set: yes, include `lft`, `rgt`, `depth`, and `parentId`. For Adjacency List: only `parentId` is required.

**Q: Why is my Adjacency List slow?**

A: You're missing the `byParent` partition:
```javascript
partitions: {
  byParent: { fields: { parentId: 'string' } }
}
```

**Q: How do I enable multi-tree support?**

A: Set `treeField` in the plugin config:
```javascript
new TreePlugin({
  resources: ['categories'],
  treeField: 'treeId'
});
```

### Operations

**Q: How do I get the full path from root to a node?**

A:
```javascript
const ancestors = await categories.tree.getAncestors(nodeId);
const current = await categories.get(nodeId);
const path = [...ancestors, current];
```

**Q: How do I count descendants without fetching them?**

A: With Nested Set, use the lft/rgt formula:
```javascript
const node = await categories.get(nodeId);
const descendantCount = (node.rgt - node.lft - 1) / 2;
```

**Q: Can I insert a node at a specific position among siblings?**

A: Yes, with Nested Set:
```javascript
await categories.tree.insertBefore(siblingId, { name: 'New Node' });
await categories.tree.insertAfter(siblingId, { name: 'New Node' });
```

**Q: How do I delete a node but keep its children?**

A:
```javascript
await categories.tree.deleteNode(nodeId, { promoteChildren: true });
```

### Multi-Tree

**Q: Can I move nodes between trees?**

A: No, cross-tree moves are prevented to maintain tree integrity. Delete from one and recreate in the other if needed.

**Q: How do I get roots for a specific tree?**

A:
```javascript
const roots = await categories.tree.getRoots({ treeId: 'products' });
```

**Q: Is treeId inherited by children?**

A: Yes! When you use `addChild()`, the child automatically inherits the parent's treeId.

### Performance

**Q: What's the performance of getDescendants()?**

A:
- Nested Set: O(1) - single range query
- Adjacency List: O(depth × avgChildren) - recursive fetches

**Q: What's the performance of moveSubtree()?**

A:
- Nested Set: O(n) - must renumber all affected nodes
- Adjacency List: O(1) - just update parentId

**Q: How can I optimize tree queries in production?**

A: Combine with CachePlugin:
```javascript
await db.usePlugin(new CachePlugin({
  driver: 'memory',
  ttl: 60000
}));
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Tree operations, querying, real-world examples
