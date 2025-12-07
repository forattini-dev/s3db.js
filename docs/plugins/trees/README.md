# 🌳 Tree Plugin

> **Hierarchical data structures for s3db.js with Nested Set and Adjacency List drivers.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Manage hierarchical data** (categories, organizations, file systems) with optimized tree operations.

**1 line to get started:**
```javascript
await db.usePlugin(new TreePlugin({ resources: ['categories'], driver: 'nested-set' }));
```

**Full example:**
```javascript
const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set',      // O(1) reads, O(n) writes
  treeField: 'treeId'        // Support multiple independent trees
});

await db.usePlugin(treePlugin);

// Create a hierarchy
const root = await categories.tree.createRoot({ name: 'Electronics', treeId: 'products' });
const phones = await categories.tree.addChild(root.id, { name: 'Phones' });
const iphone = await categories.tree.addChild(phones.id, { name: 'iPhone 15' });

// Query the tree (O(1) with Nested Set!)
const descendants = await categories.tree.getDescendants(root.id);
// Returns: [{ name: 'Phones' }, { name: 'iPhone 15' }]

const ancestors = await categories.tree.getAncestors(iphone.id);
// Returns: [{ name: 'Electronics' }, { name: 'Phones' }]
```

**Key features:**
- ✅ **Two drivers**: Nested Set (fast reads) or Adjacency List (fast writes)
- ✅ **Multi-tree support**: Isolate multiple trees in same resource
- ✅ **O(1) descendants/ancestors**: Single query with Nested Set
- ✅ **Node-level API**: `node.tree.children()`, `node.tree.parent()`
- ✅ **Move subtrees**: Relocate entire branches atomically
- ✅ **Cycle prevention**: Automatic validation on moves
- ✅ **Tree verification & rebuild**: Self-healing capabilities

**Driver Comparison:**

| Feature | Nested Set | Adjacency List |
|---------|------------|----------------|
| Get descendants | O(1) ⚡ | O(n) recursive |
| Get ancestors | O(1) ⚡ | O(depth) recursive |
| Insert child | O(n) | O(1) ⚡ |
| Move subtree | O(n) | O(1) ⚡ |
| Delete node | O(n) | O(1) ⚡ |
| Get children | O(log n) | O(1) ⚡ (partition) |
| Storage | +3 fields (lft/rgt/depth) | +1 field (parentId) |
| Best for | Read-heavy, analytics | Write-heavy, CMS |

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [📦 Dependencies](#-dependencies)
4. [Driver Selection Guide](#driver-selection-guide)
5. [Usage Journey](#usage-journey)
   - [Level 1: Basic Tree Operations](#level-1-basic-tree-operations)
   - [Level 2: Querying the Tree](#level-2-querying-the-tree)
   - [Level 3: Moving & Deleting Nodes](#level-3-moving--deleting-nodes)
   - [Level 4: Multiple Trees in One Resource](#level-4-multiple-trees-in-one-resource)
   - [Level 5: Node-Level API](#level-5-node-level-api)
   - [Level 6: Tree Verification & Rebuild](#level-6-tree-verification--rebuild)
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
import { Database, TreePlugin } from 's3db.js';

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
    // Nested Set fields (auto-managed by plugin)
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

// Build a category tree
const root = await categories.tree.createRoot({ name: 'All Products' });
const electronics = await categories.tree.addChild(root.id, { name: 'Electronics' });
const clothing = await categories.tree.addChild(root.id, { name: 'Clothing' });
const phones = await categories.tree.addChild(electronics.id, { name: 'Phones' });

// Query descendants (O(1) - single S3 query!)
const allElectronics = await categories.tree.getDescendants(electronics.id);
console.log(allElectronics.map(c => c.name));
// Output: ['Phones']

// Query ancestors
const phonePath = await categories.tree.getAncestors(phones.id);
console.log(phonePath.map(c => c.name));
// Output: ['All Products', 'Electronics']
```

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**NO Peer Dependencies!**

TreePlugin works out-of-the-box with **zero external dependencies**:
- ✅ Pure JavaScript implementation
- ✅ Uses S3DB's built-in partitioning for Adjacency List
- ✅ Distributed locking via S3 for Nested Set
- ✅ No database-specific extensions

**Resource Schema Requirements:**

For **Nested Set** driver:
```javascript
attributes: {
  // Your fields
  name: 'string|required',

  // Required tree fields (auto-managed)
  lft: 'number|optional',
  rgt: 'number|optional',
  depth: 'number|optional',
  parentId: 'string|optional'
}
```

For **Adjacency List** driver:
```javascript
attributes: {
  name: 'string|required',
  parentId: 'string|optional'  // Required!
},
partitions: {
  byParent: { fields: { parentId: 'string' } }  // Required for performance!
}
```

---

## Driver Selection Guide

### When to Use Nested Set

**Best for read-heavy workloads:**

- E-commerce category trees (browse products by category)
- Organization hierarchies (reporting structures)
- Analytics dashboards (aggregate by branch)
- Menu systems (render full menus)
- Taxonomy/classification systems

**Characteristics:**
- Descendants query: O(1) - single range query `WHERE lft BETWEEN X AND Y`
- Writes require rebalancing: O(n) - shift all subsequent nodes
- Atomic subtree operations via distributed locking
- Self-healing with `rebuildTree()`

### When to Use Adjacency List

**Best for write-heavy workloads:**

- Content management systems (frequent reorganization)
- File systems (move files/folders constantly)
- Comment threads (add replies frequently)
- Task hierarchies (reorganize projects)
- Real-time collaborative editing

**Characteristics:**
- Child/parent queries: O(1) via `byParent` partition
- Descendants require recursion: O(depth × children)
- Move operations: O(1) - just update `parentId`
- Requires `byParent` partition for performance

### Decision Matrix

| Question | Nested Set | Adjacency List |
|----------|------------|----------------|
| How often do you query descendants? | Frequently | Rarely |
| How often do you add/move nodes? | Rarely | Frequently |
| Do you need aggregate queries? | Yes | No |
| Is tree depth predictable? | Any depth | Shallow (<10 levels) |
| Need subtree counts instantly? | Yes | No |

---

## Usage Journey

### Level 1: Basic Tree Operations

Create and populate a simple tree:

```javascript
const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set'
});

await db.usePlugin(treePlugin);

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

**What you get:** Basic tree structure with automatic lft/rgt management.

### Level 2: Querying the Tree

Navigate and query tree relationships:

```javascript
// Get all children (direct descendants only)
const children = await categories.tree.getChildren(root.id);
// Returns: [{ name: 'Phones' }, { name: 'Laptops' }]

// Get ALL descendants (entire subtree)
const descendants = await categories.tree.getDescendants(root.id);
// Returns: All nodes under Electronics

// Get ancestors (path to root)
const ancestors = await categories.tree.getAncestors(phones.id);
// Returns: [{ name: 'Electronics' }]

// Get siblings
const siblings = await categories.tree.getSiblings(phones.id);
// Returns: [{ name: 'Laptops' }]

// Get root nodes
const roots = await categories.tree.getRoots();
// Returns: [{ name: 'Electronics' }]

// Get tree depth
const depth = await categories.tree.getTreeDepth();
// Returns: 1 (max depth from root)

// Get leaves (nodes without children)
const leaves = await categories.tree.getLeaves(root.id);
// Returns: [{ name: 'Phones' }, { name: 'Laptops' }]
```

**What you get:** Full tree navigation capabilities.

### Level 3: Moving & Deleting Nodes

Reorganize your tree:

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

// Delete a node (with options)
// Option 1: Promote children to parent
await categories.tree.deleteNode(electronics.id, { promoteChildren: true });

// Option 2: Delete entire subtree
await categories.tree.deleteSubtree(clothing.id);
// Removes Clothing AND all descendants
```

**Cycle Prevention:**
```javascript
// This will throw an error - can't move parent under its own descendant!
await categories.tree.moveSubtree(root.id, phones.id);
// Error: Cannot set phones as parent of root: would create a cycle
```

**What you get:** Safe tree manipulation with automatic validation.

### Level 4: Multiple Trees in One Resource

Store multiple independent trees in the same resource:

```javascript
const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set',
  treeField: 'treeId'  // Enable multi-tree support
});

await db.usePlugin(treePlugin);

// Create resource with treeId field
const categories = await db.createResource({
  name: 'categories',
  attributes: {
    name: 'string|required',
    treeId: 'string|required',  // Tree identifier
    lft: 'number|optional',
    rgt: 'number|optional',
    depth: 'number|optional',
    parentId: 'string|optional'
  },
  partitions: {
    byTree: { fields: { treeId: 'string' } }  // Recommended for performance
  }
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

// Add children - treeId is inherited automatically!
const electronics = await categories.tree.addChild(productsRoot.id, {
  name: 'Electronics'
});
console.log(electronics.treeId); // 'products' (inherited from parent)

// Query roots filtered by tree
const productRoots = await categories.tree.getRoots({ treeId: 'products' });
const blogRoots = await categories.tree.getRoots({ treeId: 'blog' });

// Trees are completely isolated
const productDescendants = await categories.tree.getDescendants(productsRoot.id);
// Only includes nodes from 'products' tree

// Cross-tree moves are prevented
await categories.tree.moveSubtree(electronics.id, blogRoot.id);
// Error: Cannot move node to a different tree
```

**Use cases:**
- Multi-tenant category systems
- Multiple menu hierarchies (main menu, footer, sidebar)
- Separate product and blog taxonomies
- Organization structures per department

**What you get:** Complete tree isolation within single resource.

### Level 5: Node-Level API

Every node gets a `.tree` namespace with convenience methods:

```javascript
// Get a node
const phones = await categories.get('phones-id');

// Node-level tree navigation
const parent = await phones.tree.parent();
const children = await phones.tree.children();
const descendants = await phones.tree.descendants();
const ancestors = await phones.tree.ancestors();
const siblings = await phones.tree.siblings();

// Node-level actions
const newChild = await phones.tree.addChild({ name: 'iPhone' });
await phones.tree.moveTo(newParentId);
await phones.tree.delete({ promoteChildren: true });
await phones.tree.deleteSubtree();

// Node-level checks
const isLeaf = await phones.tree.isLeaf();
const isRoot = await phones.tree.isRoot();
const isDescendant = await phones.tree.isDescendantOf(ancestorId);
```

**What you get:** Intuitive object-oriented tree manipulation.

### Level 6: Tree Verification & Rebuild

Maintain tree integrity:

```javascript
// Verify tree structure
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

// Rebuild tree from scratch (fixes all issues)
await categories.tree.rebuild();
// Recalculates all lft/rgt values based on parentId relationships

// Rebuild specific tree in multi-tree setup
await categories.tree.rebuild({ treeId: 'products' });
```

**When to rebuild:**
- After direct database manipulation bypassing the plugin
- After crash during write operation
- When verification reports errors
- During migration from another system

**What you get:** Self-healing tree structure.

### Level 7: Production Patterns

**Pattern 1: Breadcrumb Navigation**
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

**Pattern 2: Nested Menu**
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

**Pattern 3: Count Products Per Category**
```javascript
// With Nested Set, you can count descendants instantly!
const electronics = await categories.get('electronics-id');
const descendantCount = (electronics.rgt - electronics.lft - 1) / 2;
// This is the number of descendants without any additional queries!
```

**Pattern 4: Move with Validation**
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

## 📊 Configuration Reference

### TreePlugin Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
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

### Required Resource Schema

**Nested Set Driver:**
```javascript
{
  attributes: {
    [leftField]: 'number|optional',    // Default: 'lft'
    [rightField]: 'number|optional',   // Default: 'rgt'
    [depthField]: 'number|optional',   // Default: 'depth'
    [parentField]: 'string|optional',  // Default: 'parentId'
    [treeField]: 'string|required'     // Only if multi-tree enabled
  },
  partitions: {
    byTree: { fields: { [treeField]: 'string' } }  // Recommended for multi-tree
  }
}
```

**Adjacency List Driver:**
```javascript
{
  attributes: {
    [parentField]: 'string|optional',  // Default: 'parentId'
    [treeField]: 'string|required'     // Only if multi-tree enabled
  },
  partitions: {
    byParent: { fields: { [parentField]: 'string' } },  // REQUIRED!
    byTree: { fields: { [treeField]: 'string' } }       // Recommended for multi-tree
  }
}
```

---

## 📚 Configuration Examples

### Example 1: Simple Category Tree

```javascript
const treePlugin = new TreePlugin({
  resources: ['categories'],
  driver: 'nested-set'
});

const categories = await db.createResource({
  name: 'categories',
  attributes: {
    name: 'string|required',
    slug: 'string|optional',
    lft: 'number|optional',
    rgt: 'number|optional',
    depth: 'number|optional',
    parentId: 'string|optional'
  }
});

await db.usePlugin(treePlugin);
```

### Example 2: Multi-Tenant Organization Chart

```javascript
const treePlugin = new TreePlugin({
  resources: ['employees'],
  driver: 'adjacency-list',
  treeField: 'companyId'
});

const employees = await db.createResource({
  name: 'employees',
  asyncPartitions: false,  // Important for immediate partition availability
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

await db.usePlugin(treePlugin);

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

// Each company's tree is completely isolated
```

### Example 3: File System Structure

```javascript
const treePlugin = new TreePlugin({
  resources: ['files'],
  driver: 'adjacency-list',  // Optimized for frequent moves
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

await db.usePlugin(treePlugin);

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

### Example 4: Comment Thread System

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

await db.usePlugin(treePlugin);

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

### Example 5: Nested Set with Custom Fields

```javascript
const treePlugin = new TreePlugin({
  resources: ['taxonomy'],
  driver: 'nested-set',
  leftField: 'leftBound',
  rightField: 'rightBound',
  depthField: 'level',
  parentField: 'parent'
});

const taxonomy = await db.createResource({
  name: 'taxonomy',
  attributes: {
    term: 'string|required',
    leftBound: 'number|optional',
    rightBound: 'number|optional',
    level: 'number|optional',
    parent: 'string|optional'
  }
});

await db.usePlugin(treePlugin);
```

---

## 🔧 API Reference

### Resource Tree Namespace

When TreePlugin is installed, resources gain a `.tree` namespace:

```javascript
const tree = categories.tree;
```

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

Every node returned from tree operations has a `.tree` namespace:

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
                          // If false, throws error if node has children
}
```

**Query Options (with treeField):**
```javascript
{
  treeId: 'products'  // Filter results by tree (only when treeField is configured)
}
```

---

## ✅ Best Practices

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
// Partitions must be ready before queries
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

---

## 🚨 Error Handling

### Error Classes

The TreePlugin exports specialized error classes:

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

await categories.tree.moveSubtree('abc', 'nonexistent');
// Error: Node not found: nonexistent
```

### InvalidParentError

**When:** Move operation would create invalid structure

```javascript
// Cycle detection
await categories.tree.moveSubtree(root.id, childOfRoot.id);
// Error: Cannot set childOfRoot as parent of root: would create a cycle

// Cross-tree move (with treeField)
await categories.tree.moveSubtree(productNode.id, blogNode.id);
// Error: Cannot set blogNode as parent of productNode: nodes belong to different trees
```

### RootNodeError

**When:** Invalid operation on root node

```javascript
await categories.tree.deleteNode(root.id, { promoteChildren: false });
// Error: Cannot delete root node (it has children)

// Use deleteSubtree for roots with children
await categories.tree.deleteSubtree(root.id);
```

### Error Handling Pattern

```javascript
try {
  await categories.tree.moveSubtree(nodeId, newParentId);
} catch (error) {
  if (error.name === 'InvalidParentError') {
    console.error('Cannot move:', error.message);
    // Show user-friendly message
  } else if (error.name === 'NodeNotFoundError') {
    console.error('Node missing:', error.nodeId);
    // Refresh tree view
  } else {
    throw error;  // Unexpected error
  }
}
```

---

## ❓ FAQ

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
A: You're missing the `byParent` partition. This partition is required for O(1) children lookups. Add:
```javascript
partitions: {
  byParent: { fields: { parentId: 'string' } }
}
```

**Q: How do I enable multi-tree support?**
A: Set `treeField` in the plugin config and add the field to your schema:
```javascript
new TreePlugin({
  resources: ['categories'],
  treeField: 'treeId'
});
```

### Operations

**Q: How do I get the full path from root to a node?**
A: Use `getAncestors()`:
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
A: Yes, with Nested Set use `insertBefore()` or `insertAfter()`:
```javascript
await categories.tree.insertBefore(siblingId, { name: 'New Node' });
await categories.tree.insertAfter(siblingId, { name: 'New Node' });
```

**Q: How do I delete a node but keep its children?**
A: Use `promoteChildren: true`:
```javascript
await categories.tree.deleteNode(nodeId, { promoteChildren: true });
// Children become children of the deleted node's parent
```

### Multi-Tree

**Q: Can I move nodes between trees?**
A: No, cross-tree moves are prevented to maintain tree integrity. If you need to move between trees, delete from one and recreate in the other.

**Q: How do I get roots for a specific tree?**
A:
```javascript
const roots = await categories.tree.getRoots({ treeId: 'products' });
```

**Q: Is treeId inherited by children?**
A: Yes! When you use `addChild()`, the child automatically inherits the parent's treeId.

### Troubleshooting

**Q: My tree has gaps in lft/rgt values. Is this a problem?**
A: Gaps can occur after deletions but don't affect functionality. Run `rebuild()` to compact if needed:
```javascript
await categories.tree.rebuild();
```

**Q: Tree operations are slow. What can I do?**
A:
1. For Adjacency List: ensure `byParent` partition exists
2. For Nested Set with multi-tree: add `byTree` partition
3. Use `asyncPartitions: false` for immediate partition availability
4. Consider batch operations for large imports

**Q: I'm getting "Node has children" error on delete.**
A: By default, `deleteNode` prevents deleting nodes with children. Options:
```javascript
// Option 1: Promote children
await categories.tree.deleteNode(nodeId, { promoteChildren: true });

// Option 2: Delete entire subtree
await categories.tree.deleteSubtree(nodeId);
```

**Q: How do I recover from a corrupted tree?**
A: Use verify and rebuild:
```javascript
const result = await categories.tree.verify();
if (!result.valid) {
  console.log('Errors:', result.errors);
  await categories.tree.rebuild();
}
```

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
A: Combine with CachePlugin for frequently accessed trees:
```javascript
// Cache getFullTree() results
await db.usePlugin(new CachePlugin({
  driver: 'memory',
  ttl: 60000  // 1 minute
}));
```
