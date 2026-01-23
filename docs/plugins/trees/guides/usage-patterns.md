# Usage Patterns

> **In this guide:** Tree operations, querying, node-level API, and real-world examples.

**Navigation:** [← Back to Tree Plugin](/plugins/trees/README.md) | [Configuration](/plugins/trees/guides/configuration.md)

---

## Basic Setup

```javascript
import { Database } from 's3db.js';
import { TreePlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

await db.connect();

// Create resource with tree fields
const categories = await db.createResource({
  name: 'categories',
  attributes: {
    name: 'string|required',
    description: 'string|optional',
    // Nested Set fields (auto-managed)
    lft: 'number|optional',
    rgt: 'number|optional',
    depth: 'number|optional',
    parentId: 'string|optional'
  }
});

// Install plugin
const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set'
});

await db.usePlugin(treePlugin);
```

---

## Basic Tree Operations

### Create Root and Children

```javascript
// Create root node
const root = await categories.tree.createRoot({
  name: 'Electronics'
});
// Result: { id: 'abc123', name: 'Electronics', lft: 1, rgt: 2, depth: 0 }

// Add children
const phones = await categories.tree.addChild(root.id, { name: 'Phones' });
// Result: { id: 'def456', name: 'Phones', lft: 2, rgt: 3, depth: 1 }

const laptops = await categories.tree.addChild(root.id, { name: 'Laptops' });
// Result: { id: 'ghi789', name: 'Laptops', lft: 4, rgt: 5, depth: 1 }

// Tree structure:
//       Electronics (1,6)
//       /           \
//   Phones (2,3)  Laptops (4,5)
```

### Insert at Specific Position (Nested Set)

```javascript
// Insert before sibling
await categories.tree.insertBefore(laptops.id, { name: 'Tablets' });

// Insert after sibling
await categories.tree.insertAfter(phones.id, { name: 'Accessories' });
```

---

## Querying the Tree

### Get Children and Descendants

```javascript
// Get direct children only
const children = await categories.tree.getChildren(root.id);
// Returns: [{ name: 'Phones' }, { name: 'Laptops' }]

// Get ALL descendants (entire subtree)
const descendants = await categories.tree.getDescendants(root.id);
// Returns: All nodes under Electronics
```

### Get Ancestors and Path

```javascript
// Get ancestors (path to root)
const ancestors = await categories.tree.getAncestors(phones.id);
// Returns: [{ name: 'Electronics' }]

// Full path including current node
const node = await categories.get(phones.id);
const path = [...ancestors, node];
```

### Get Siblings and Leaves

```javascript
// Get siblings
const siblings = await categories.tree.getSiblings(phones.id);
// Returns: [{ name: 'Laptops' }]

// Get leaves (nodes without children)
const leaves = await categories.tree.getLeaves(root.id);
// Returns: [{ name: 'Phones' }, { name: 'Laptops' }]
```

### Get Roots and Tree Info

```javascript
// Get root nodes
const roots = await categories.tree.getRoots();

// Get tree depth
const depth = await categories.tree.getTreeDepth();

// Get full tree
const fullTree = await categories.tree.getFullTree();

// Get nested structure
const nested = await categories.tree.toNestedArray(root.id);
// Returns:
// [
//   {
//     id: 'phones', name: 'Phones', children: []
//   },
//   {
//     id: 'laptops', name: 'Laptops', children: []
//   }
// ]
```

---

## Moving and Deleting Nodes

### Move Subtree

```javascript
// Create initial structure
const root = await categories.tree.createRoot({ name: 'Products' });
const electronics = await categories.tree.addChild(root.id, { name: 'Electronics' });
const clothing = await categories.tree.addChild(root.id, { name: 'Clothing' });
const phones = await categories.tree.addChild(electronics.id, { name: 'Phones' });

// Move subtree: Phones → Clothing
await categories.tree.moveSubtree(phones.id, clothing.id);

// Verify move
const phonesUpdated = await categories.get(phones.id);
console.log(phonesUpdated.parentId); // Now points to Clothing
```

### Cycle Prevention

```javascript
// This will throw an error - can't move parent under its own descendant!
await categories.tree.moveSubtree(root.id, phones.id);
// Error: Cannot set phones as parent of root: would create a cycle
```

### Delete Node

```javascript
// Option 1: Promote children to parent
await categories.tree.deleteNode(electronics.id, { promoteChildren: true });

// Option 2: Delete entire subtree
await categories.tree.deleteSubtree(clothing.id);
// Removes Clothing AND all descendants
```

---

## Node-Level API

Every node gets a `.tree` namespace with convenience methods:

```javascript
// Get a node
const phones = await categories.get('phones-id');

// Navigation
const parent = await phones.tree.parent();
const children = await phones.tree.children();
const descendants = await phones.tree.descendants();
const ancestors = await phones.tree.ancestors();
const siblings = await phones.tree.siblings();

// Actions
const newChild = await phones.tree.addChild({ name: 'iPhone' });
await phones.tree.moveTo(newParentId);
await phones.tree.delete({ promoteChildren: true });
await phones.tree.deleteSubtree();

// Checks
const isLeaf = await phones.tree.isLeaf();
const isRoot = await phones.tree.isRoot();
const isDescendant = await phones.tree.isDescendantOf(ancestorId);
```

---

## Tree Verification and Rebuild

### Verify Tree Integrity

```javascript
const verification = await categories.tree.verify();
// Returns: { valid: true, errors: [], nodeCount: 150 }

// If issues found:
// {
//   valid: false,
//   errors: [
//     { type: 'gap', node: 'xyz', expected: 5, actual: 7 },
//     { type: 'overlap', nodes: ['a', 'b'] }
//   ]
// }
```

### Rebuild Tree

```javascript
// Rebuild tree from scratch
await categories.tree.rebuild();

// Rebuild specific tree in multi-tree setup
await categories.tree.rebuild({ treeId: 'products' });
```

---

## Real-World Examples

### Breadcrumb Navigation

```javascript
async function getBreadcrumbs(categoryId) {
  const ancestors = await categories.tree.getAncestors(categoryId);
  const current = await categories.get(categoryId);
  return [...ancestors, current].map(c => ({
    id: c.id,
    name: c.name,
    url: `/category/${c.id}`
  }));
}

// Usage
const breadcrumbs = await getBreadcrumbs('phones-id');
// [
//   { id: 'root', name: 'Products', url: '/category/root' },
//   { id: 'electronics', name: 'Electronics', url: '/category/electronics' },
//   { id: 'phones', name: 'Phones', url: '/category/phones' }
// ]
```

### Nested Menu

```javascript
async function buildMenu(rootId) {
  const tree = await categories.tree.toNestedArray(rootId);
  return tree;
}

// Returns nested structure:
// [
//   {
//     id: 'electronics',
//     name: 'Electronics',
//     children: [
//       { id: 'phones', name: 'Phones', children: [] },
//       { id: 'laptops', name: 'Laptops', children: [] }
//     ]
//   }
// ]
```

### Count Products Per Category (Nested Set)

```javascript
// With Nested Set, you can count descendants instantly!
const electronics = await categories.get('electronics-id');
const descendantCount = (electronics.rgt - electronics.lft - 1) / 2;
// This is the number of descendants without any additional queries!
```

### Multi-Tenant Organization Chart

```javascript
const treePlugin = new TreePlugin({
  resources: ['employees'],
  driver: 'adjacency-list',
  treeField: 'companyId'
});

const employees = await db.createResource({
  name: 'employees',
  asyncPartitions: false,
  attributes: {
    name: 'string|required',
    title: 'string|required',
    companyId: 'string|required',
    parentId: 'string|optional'
  },
  partitions: {
    byParent: { fields: { parentId: 'string' } },
    byCompany: { fields: { companyId: 'string' } }
  }
});

// Create org charts for different companies
const acmeCEO = await employees.tree.createRoot({
  name: 'John CEO',
  title: 'CEO',
  companyId: 'acme'
});

const techCorpCEO = await employees.tree.createRoot({
  name: 'Jane CEO',
  title: 'CEO',
  companyId: 'techcorp'
});
```

### File System Structure

```javascript
const treePlugin = new TreePlugin({
  resources: ['files'],
  driver: 'adjacency-list',
  parentField: 'folderId'
});

const files = await db.createResource({
  name: 'files',
  asyncPartitions: false,
  attributes: {
    name: 'string|required',
    type: 'string|required',  // 'file' or 'folder'
    size: 'number|optional',
    folderId: 'string|optional'
  },
  partitions: {
    byFolder: { fields: { folderId: 'string' } }
  }
});

// Create folder structure
const root = await files.tree.createRoot({ name: 'Home', type: 'folder' });
const docs = await files.tree.addChild(root.id, { name: 'Documents', type: 'folder' });
const readme = await files.tree.addChild(docs.id, {
  name: 'README.txt',
  type: 'file',
  size: 1024
});

// Move file to different folder (O(1) with Adjacency List!)
const downloads = await files.tree.addChild(root.id, { name: 'Downloads', type: 'folder' });
await files.tree.moveSubtree(readme.id, downloads.id);
```

### Comment Thread System

```javascript
const treePlugin = new TreePlugin({
  resources: ['comments'],
  driver: 'adjacency-list',
  treeField: 'postId'  // Each post has its own comment tree
});

const comments = await db.createResource({
  name: 'comments',
  asyncPartitions: false,
  attributes: {
    text: 'string|required',
    authorId: 'string|required',
    postId: 'string|required',
    parentId: 'string|optional',
    createdAt: 'date|optional'
  },
  partitions: {
    byParent: { fields: { parentId: 'string' } },
    byPost: { fields: { postId: 'string' } }
  }
});

// Create comment thread for a post
const topComment = await comments.tree.createRoot({
  text: 'Great article!',
  authorId: 'user1',
  postId: 'post123'
});

const reply = await comments.tree.addChild(topComment.id, {
  text: 'Thanks! Glad you liked it.',
  authorId: 'user2'
  // postId is inherited automatically!
});
```

### Safe Move with Validation

```javascript
async function safeMoveCategory(nodeId, newParentId) {
  const node = await categories.get(nodeId);
  const newParent = await categories.get(newParentId);

  // Custom business validation
  if (newParent.depth >= 5) {
    throw new Error('Maximum category depth exceeded');
  }

  if (node.isProtected && newParent.treeId !== node.treeId) {
    throw new Error('Protected categories cannot change trees');
  }

  await categories.tree.moveSubtree(nodeId, newParentId);
}
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Performance, troubleshooting, FAQ
