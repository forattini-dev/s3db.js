import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

import { TreePlugin } from '#src/plugins/tree/index.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('Tree Plugin (Nested Set Driver)', () => {
  jest.setTimeout(30000);
  let database;
  let treePlugin;
  let categories;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/tree-nested-set');
    await database.connect();

    treePlugin = new TreePlugin({
      logLevel: 'silent',
      driver: 'nested-set',
      resources: ['categories']
    });

    categories = await database.createResource({
      name: 'categories',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        lft: 'number|optional',
        rgt: 'number|optional',
        depth: 'number|optional',
        parentId: 'string|optional'
      }
    });

    await treePlugin.install(database);
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('Setup and Initialization', () => {
    test('should setup nested tree plugin correctly', async () => {
      expect(treePlugin.config.resources).toEqual(['categories']);
      expect(treePlugin.config.leftField).toBe('lft');
      expect(treePlugin.config.rightField).toBe('rgt');
      expect(treePlugin.config.depthField).toBe('depth');
      expect(treePlugin.config.parentField).toBe('parentId');
    });

    test('should install tree namespace on resource', async () => {
      expect(categories.tree).toBeDefined();
      expect(typeof categories.tree.createRoot).toBe('function');
      expect(typeof categories.tree.addChild).toBe('function');
      expect(typeof categories.tree.getDescendants).toBe('function');
      expect(typeof categories.tree.getAncestors).toBe('function');
    });

    test('should handle custom field names', async () => {
      const customPlugin = new TreePlugin({
        logLevel: 'silent',
        driver: 'nested-set',
        resources: ['categories'],
        leftField: 'left_val',
        rightField: 'right_val',
        depthField: 'level',
        parentField: 'parent'
      });

      expect(customPlugin.config.leftField).toBe('left_val');
      expect(customPlugin.config.rightField).toBe('right_val');
      expect(customPlugin.config.depthField).toBe('level');
      expect(customPlugin.config.parentField).toBe('parent');
    });
  });

  describe('Creating Tree Structure', () => {
    test('should create a root node', async () => {
      const root = await categories.tree.createRoot({ name: 'Clothing' });

      expect(root).toBeDefined();
      expect(root.name).toBe('Clothing');
      expect(root.lft).toBe(1);
      expect(root.rgt).toBe(2);
      expect(root.depth).toBe(0);
      expect(root.parentId).toBeNull();
    });

    test('should create multiple root nodes', async () => {
      const root1 = await categories.tree.createRoot({ name: 'Clothing' });
      const root2 = await categories.tree.createRoot({ name: 'Electronics' });

      expect(root1.lft).toBe(1);
      expect(root1.rgt).toBe(2);
      expect(root2.lft).toBe(3);
      expect(root2.rgt).toBe(4);
    });

    test('should add child to a node', async () => {
      const root = await categories.tree.createRoot({ name: 'Clothing' });
      const child = await categories.tree.addChild(root.id, { name: "Men's" });

      expect(child).toBeDefined();
      expect(child.name).toBe("Men's");
      expect(child.lft).toBe(2);
      expect(child.rgt).toBe(3);
      expect(child.depth).toBe(1);
      expect(child.parentId).toBe(root.id);

      const updatedRoot = await categories.get(root.id);
      expect(updatedRoot.rgt).toBe(4);
    });

    test('should build complete tree from example (Clothing hierarchy)', async () => {
      const clothing = await categories.tree.createRoot({ name: 'Clothing' });

      const mens = await categories.tree.addChild(clothing.id, { name: "Men's" });
      const womens = await categories.tree.addChild(clothing.id, { name: "Women's" });

      const suits = await categories.tree.addChild(mens.id, { name: 'Suits' });
      await categories.tree.addChild(suits.id, { name: 'Slacks' });
      await categories.tree.addChild(suits.id, { name: 'Jackets' });

      const dresses = await categories.tree.addChild(womens.id, { name: 'Dresses' });
      await categories.tree.addChild(dresses.id, { name: 'Evening Gowns' });
      await categories.tree.addChild(dresses.id, { name: 'Sun Dresses' });

      await categories.tree.addChild(womens.id, { name: 'Skirts' });
      await categories.tree.addChild(womens.id, { name: 'Blouses' });

      const verification = await categories.tree.verify();
      expect(verification.valid).toBe(true);
      expect(verification.nodeCount).toBe(11);
    });

    test('should insert node before sibling', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      const child1 = await categories.tree.addChild(root.id, { name: 'Child 1' });
      await categories.tree.addChild(root.id, { name: 'Child 2' });

      const newChild = await categories.tree.insertBefore(child1.id, { name: 'New Child' });

      expect(newChild.depth).toBe(child1.depth);
      expect(newChild.parentId).toBe(child1.parentId);

      const children = await categories.tree.getChildren(root.id);
      expect(children[0].name).toBe('New Child');
    });

    test('should insert node after sibling', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      const child1 = await categories.tree.addChild(root.id, { name: 'Child 1' });
      await categories.tree.addChild(root.id, { name: 'Child 2' });

      const newChild = await categories.tree.insertAfter(child1.id, { name: 'New Child' });

      expect(newChild.depth).toBe(child1.depth);
      expect(newChild.parentId).toBe(child1.parentId);

      const children = await categories.tree.getChildren(root.id);
      expect(children[1].name).toBe('New Child');
    });
  });

  describe('Reading Tree Structure', () => {
    let clothing, mens, womens, suits, slacks, jackets, dresses, eveningGowns, sunDresses, skirts, blouses;

    beforeEach(async () => {
      clothing = await categories.tree.createRoot({ name: 'Clothing' });

      mens = await categories.tree.addChild(clothing.id, { name: "Men's" });
      womens = await categories.tree.addChild(clothing.id, { name: "Women's" });

      suits = await categories.tree.addChild(mens.id, { name: 'Suits' });
      slacks = await categories.tree.addChild(suits.id, { name: 'Slacks' });
      jackets = await categories.tree.addChild(suits.id, { name: 'Jackets' });

      dresses = await categories.tree.addChild(womens.id, { name: 'Dresses' });
      eveningGowns = await categories.tree.addChild(dresses.id, { name: 'Evening Gowns' });
      sunDresses = await categories.tree.addChild(dresses.id, { name: 'Sun Dresses' });

      skirts = await categories.tree.addChild(womens.id, { name: 'Skirts' });
      blouses = await categories.tree.addChild(womens.id, { name: 'Blouses' });
    });

    test('should get root node', async () => {
      const root = await categories.tree.getRoot();
      expect(root.name).toBe('Clothing');
    });

    test('should get all roots', async () => {
      const electronics = await categories.tree.createRoot({ name: 'Electronics' });
      const roots = await categories.tree.getRoots();

      expect(roots.length).toBe(2);
      expect(roots.map(r => r.name)).toContain('Clothing');
      expect(roots.map(r => r.name)).toContain('Electronics');
    });

    test('should get parent of a node', async () => {
      const parent = await categories.tree.getParent(suits.id);
      expect(parent.id).toBe(mens.id);
    });

    test('should return null for root parent', async () => {
      const parent = await categories.tree.getParent(clothing.id);
      expect(parent).toBeNull();
    });

    test('should get children of a node', async () => {
      const children = await categories.tree.getChildren(womens.id);

      expect(children.length).toBe(3);
      expect(children.map(c => c.name)).toContain('Dresses');
      expect(children.map(c => c.name)).toContain('Skirts');
      expect(children.map(c => c.name)).toContain('Blouses');
    });

    test('should get all descendants of a node', async () => {
      const descendants = await categories.tree.getDescendants(clothing.id);

      expect(descendants.length).toBe(10);
      expect(descendants.map(d => d.name)).toContain("Men's");
      expect(descendants.map(d => d.name)).toContain("Women's");
      expect(descendants.map(d => d.name)).toContain('Suits');
      expect(descendants.map(d => d.name)).toContain('Slacks');
    });

    test('should get descendants including node itself', async () => {
      const descendants = await categories.tree.getDescendants(mens.id, { includeNode: true });

      expect(descendants.length).toBe(4);
      expect(descendants.map(d => d.name)).toContain("Men's");
    });

    test('should get descendants with max depth', async () => {
      const descendants = await categories.tree.getDescendants(clothing.id, { maxDepth: 1 });

      expect(descendants.length).toBe(2);
      expect(descendants.map(d => d.name)).toContain("Men's");
      expect(descendants.map(d => d.name)).toContain("Women's");
    });

    test('should get all ancestors of a node', async () => {
      const ancestors = await categories.tree.getAncestors(slacks.id);

      expect(ancestors.length).toBe(3);
      expect(ancestors[0].name).toBe('Clothing');
      expect(ancestors[1].name).toBe("Men's");
      expect(ancestors[2].name).toBe('Suits');
    });

    test('should get ancestors including node itself', async () => {
      const ancestors = await categories.tree.getAncestors(slacks.id, { includeNode: true });

      expect(ancestors.length).toBe(4);
      expect(ancestors[3].name).toBe('Slacks');
    });

    test('should get siblings of a node', async () => {
      const siblings = await categories.tree.getSiblings(dresses.id);

      expect(siblings.length).toBe(2);
      expect(siblings.map(s => s.name)).toContain('Skirts');
      expect(siblings.map(s => s.name)).toContain('Blouses');
    });

    test('should get siblings including self', async () => {
      const siblings = await categories.tree.getSiblings(dresses.id, { includeSelf: true });

      expect(siblings.length).toBe(3);
      expect(siblings.map(s => s.name)).toContain('Dresses');
    });

    test('should get subtree of a node', async () => {
      const subtree = await categories.tree.getSubtree(womens.id);

      expect(subtree.length).toBe(6);
      expect(subtree[0].name).toBe("Women's");
    });

    test('should get leaf nodes', async () => {
      const leaves = await categories.tree.getLeaves();

      expect(leaves.length).toBe(6);
      expect(leaves.map(l => l.name)).toContain('Slacks');
      expect(leaves.map(l => l.name)).toContain('Jackets');
      expect(leaves.map(l => l.name)).toContain('Evening Gowns');
    });

    test('should get leaf nodes under specific node', async () => {
      const leaves = await categories.tree.getLeaves(mens.id);

      expect(leaves.length).toBe(2);
      expect(leaves.map(l => l.name)).toContain('Slacks');
      expect(leaves.map(l => l.name)).toContain('Jackets');
    });

    test('should get depth of a node', async () => {
      expect(await categories.tree.getDepth(clothing.id)).toBe(0);
      expect(await categories.tree.getDepth(mens.id)).toBe(1);
      expect(await categories.tree.getDepth(suits.id)).toBe(2);
      expect(await categories.tree.getDepth(slacks.id)).toBe(3);
    });

    test('should get tree depth', async () => {
      const depth = await categories.tree.getTreeDepth();
      expect(depth).toBe(3);
    });

    test('should check if node is root', async () => {
      expect(await categories.tree.isRoot(clothing.id)).toBe(true);
      expect(await categories.tree.isRoot(mens.id)).toBe(false);
    });

    test('should check if node is leaf', async () => {
      expect(await categories.tree.isLeaf(slacks.id)).toBe(true);
      expect(await categories.tree.isLeaf(suits.id)).toBe(false);
    });

    test('should check if node is descendant of another', async () => {
      expect(await categories.tree.isDescendantOf(slacks.id, clothing.id)).toBe(true);
      expect(await categories.tree.isDescendantOf(slacks.id, mens.id)).toBe(true);
      expect(await categories.tree.isDescendantOf(slacks.id, womens.id)).toBe(false);
    });

    test('should check if node is ancestor of another', async () => {
      expect(await categories.tree.isAncestorOf(clothing.id, slacks.id)).toBe(true);
      expect(await categories.tree.isAncestorOf(mens.id, slacks.id)).toBe(true);
      expect(await categories.tree.isAncestorOf(womens.id, slacks.id)).toBe(false);
    });

    test('should count descendants', async () => {
      expect(await categories.tree.countDescendants(clothing.id)).toBe(10);
      expect(await categories.tree.countDescendants(mens.id)).toBe(3);
      expect(await categories.tree.countDescendants(slacks.id)).toBe(0);
    });

    test('should get full tree as flat array', async () => {
      const tree = await categories.tree.getFullTree({ flat: true });

      expect(tree.length).toBe(11);
      expect(tree[0].name).toBe('Clothing');
    });

    test('should convert tree to nested array', async () => {
      const nested = await categories.tree.toNestedArray();

      expect(nested.length).toBe(1);
      expect(nested[0].name).toBe('Clothing');
      expect(nested[0].children.length).toBe(2);
      expect(nested[0].children[0].name).toBe("Men's");
      expect(nested[0].children[1].name).toBe("Women's");
    });

    test('should convert subtree to nested array', async () => {
      const nested = await categories.tree.toNestedArray(womens.id);

      expect(nested.length).toBe(1);
      expect(nested[0].name).toBe("Women's");
      expect(nested[0].children.length).toBe(3);
    });
  });

  describe('Moving Nodes', () => {
    let clothing, mens, womens, suits, slacks, jackets;

    beforeEach(async () => {
      clothing = await categories.tree.createRoot({ name: 'Clothing' });
      mens = await categories.tree.addChild(clothing.id, { name: "Men's" });
      womens = await categories.tree.addChild(clothing.id, { name: "Women's" });
      suits = await categories.tree.addChild(mens.id, { name: 'Suits' });
      slacks = await categories.tree.addChild(suits.id, { name: 'Slacks' });
      jackets = await categories.tree.addChild(suits.id, { name: 'Jackets' });
    });

    test('should move subtree to new parent', async () => {
      await categories.tree.moveSubtree(suits.id, womens.id);

      const movedSuits = await categories.get(suits.id);
      expect(movedSuits.parentId).toBe(womens.id);

      const verification = await categories.tree.verify();
      expect(verification.valid).toBe(true);

      const womensChildren = await categories.tree.getChildren(womens.id);
      expect(womensChildren.map(c => c.name)).toContain('Suits');
    });

    test('should update depths when moving subtree', async () => {
      await categories.tree.moveSubtree(suits.id, clothing.id);

      const movedSuits = await categories.get(suits.id);
      expect(movedSuits.depth).toBe(1);

      const movedSlacks = await categories.get(slacks.id);
      expect(movedSlacks.depth).toBe(2);
    });

    test('should throw error when moving to own descendant', async () => {
      await expect(categories.tree.moveSubtree(mens.id, suits.id))
        .rejects.toThrow(/descendant|cycle/);
    });

    test('should not change anything when moving to same parent', async () => {
      const originalSuits = await categories.get(suits.id);
      await categories.tree.moveSubtree(suits.id, mens.id);
      const sameSuits = await categories.get(suits.id);

      expect(sameSuits.parentId).toBe(originalSuits.parentId);
    });
  });

  describe('Deleting Nodes', () => {
    let clothing, mens, womens, suits, slacks, jackets;

    beforeEach(async () => {
      clothing = await categories.tree.createRoot({ name: 'Clothing' });
      mens = await categories.tree.addChild(clothing.id, { name: "Men's" });
      womens = await categories.tree.addChild(clothing.id, { name: "Women's" });
      suits = await categories.tree.addChild(mens.id, { name: 'Suits' });
      slacks = await categories.tree.addChild(suits.id, { name: 'Slacks' });
      jackets = await categories.tree.addChild(suits.id, { name: 'Jackets' });
    });

    test('should delete leaf node', async () => {
      const result = await categories.tree.deleteNode(slacks.id);

      expect(result.deleted).toBe(1);

      const suitsChildren = await categories.tree.getChildren(suits.id);
      expect(suitsChildren.length).toBe(1);
      expect(suitsChildren[0].name).toBe('Jackets');

      const verification = await categories.tree.verify();
      expect(verification.valid).toBe(true);
    });

    test('should delete node and promote children', async () => {
      const result = await categories.tree.deleteNode(suits.id, { promoteChildren: true });

      expect(result.deleted).toBe(1);
      expect(result.promoted).toBe(2);

      const mensChildren = await categories.tree.getChildren(mens.id);
      expect(mensChildren.length).toBe(2);
      expect(mensChildren.map(c => c.name)).toContain('Slacks');
      expect(mensChildren.map(c => c.name)).toContain('Jackets');
    });

    test('should throw error when deleting node with children without promotion', async () => {
      await expect(categories.tree.deleteNode(suits.id, { promoteChildren: false }))
        .rejects.toThrow('Node has children');
    });

    test('should delete entire subtree', async () => {
      const result = await categories.tree.deleteSubtree(mens.id);

      expect(result.deleted).toBe(4);

      const clothingChildren = await categories.tree.getChildren(clothing.id);
      expect(clothingChildren.length).toBe(1);
      expect(clothingChildren[0].name).toBe("Women's");

      const verification = await categories.tree.verify();
      expect(verification.valid).toBe(true);
    });
  });

  describe('Tree Verification and Rebuild', () => {
    test('should verify valid tree', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      await categories.tree.addChild(root.id, { name: 'Child 1' });
      await categories.tree.addChild(root.id, { name: 'Child 2' });

      const verification = await categories.tree.verify();

      expect(verification.valid).toBe(true);
      expect(verification.nodeCount).toBe(3);
      expect(verification.errors.length).toBe(0);
    });

    test('should detect invalid tree structure', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      await categories.tree.addChild(root.id, { name: 'Child 1' });

      await categories.update(root.id, { lft: 10, rgt: 5 });

      const verification = await categories.tree.verify();

      expect(verification.valid).toBe(false);
      expect(verification.errors.some(e => e.type === 'INVALID_LR_ORDER')).toBe(true);
    });

    test('should rebuild tree from parent references', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      const child1 = await categories.tree.addChild(root.id, { name: 'Child 1' });
      await categories.tree.addChild(child1.id, { name: 'Grandchild' });
      await categories.tree.addChild(root.id, { name: 'Child 2' });

      await categories.update(root.id, { lft: 100, rgt: 200 });
      await categories.update(child1.id, { lft: 300, rgt: 400 });

      const result = await categories.tree.rebuild();

      expect(result.rebuilt).toBe(4);

      const verification = await categories.tree.verify();
      expect(verification.valid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty tree', async () => {
      const root = await categories.tree.getRoot();
      expect(root).toBeNull();

      const roots = await categories.tree.getRoots();
      expect(roots.length).toBe(0);

      const leaves = await categories.tree.getLeaves();
      expect(leaves.length).toBe(0);
    });

    test('should handle single node tree', async () => {
      const root = await categories.tree.createRoot({ name: 'Only' });

      expect(await categories.tree.isRoot(root.id)).toBe(true);
      expect(await categories.tree.isLeaf(root.id)).toBe(true);
      expect(await categories.tree.countDescendants(root.id)).toBe(0);
    });

    test('should handle node not found', async () => {
      await expect(categories.tree.getNode('non-existent'))
        .rejects.toThrow('Node not found');
    });
  });

  describe('Plugin Lifecycle', () => {
    test('should uninstall plugin and remove tree namespace', async () => {
      expect(categories.tree).toBeDefined();

      await treePlugin.onUninstall({});

      expect(categories.tree).toBeUndefined();
    });

    test('should return stats', () => {
      const stats = treePlugin.getStats();

      expect(stats.resources).toEqual(['categories']);
      expect(stats.leftField).toBe('lft');
      expect(stats.rightField).toBe('rgt');
      expect(stats.depthField).toBe('depth');
      expect(stats.parentField).toBe('parentId');
    });
  });

  describe('Node-level Tree API', () => {
    let clothing, mens, womens, suits, slacks, jackets;

    beforeEach(async () => {
      clothing = await categories.tree.createRoot({ name: 'Clothing' });
      mens = await categories.tree.addChild(clothing.id, { name: "Men's" });
      womens = await categories.tree.addChild(clothing.id, { name: "Women's" });
      suits = await categories.tree.addChild(mens.id, { name: 'Suits' });
      slacks = await categories.tree.addChild(suits.id, { name: 'Slacks' });
      jackets = await categories.tree.addChild(suits.id, { name: 'Jackets' });
    });

    test('node should have tree namespace after get()', async () => {
      const node = await categories.get(suits.id);

      expect(node.tree).toBeDefined();
      expect(typeof node.tree.parent).toBe('function');
      expect(typeof node.tree.children).toBe('function');
      expect(typeof node.tree.siblings).toBe('function');
    });

    test('node.tree.parent() should return parent node', async () => {
      const node = await categories.get(suits.id);
      const parent = await node.tree.parent();

      expect(parent.id).toBe(mens.id);
      expect(parent.name).toBe("Men's");
    });

    test('node.tree.children() should return children', async () => {
      const node = await categories.get(suits.id);
      const children = await node.tree.children();

      expect(children.length).toBe(2);
      expect(children.map(c => c.name)).toContain('Slacks');
      expect(children.map(c => c.name)).toContain('Jackets');
    });

    test('node.tree.siblings() should return siblings', async () => {
      const node = await categories.get(mens.id);
      const siblings = await node.tree.siblings();

      expect(siblings.length).toBe(1);
      expect(siblings[0].name).toBe("Women's");
    });

    test('node.tree.descendants() should return all descendants', async () => {
      const node = await categories.get(mens.id);
      const descendants = await node.tree.descendants();

      expect(descendants.length).toBe(3);
      expect(descendants.map(d => d.name)).toContain('Suits');
      expect(descendants.map(d => d.name)).toContain('Slacks');
      expect(descendants.map(d => d.name)).toContain('Jackets');
    });

    test('node.tree.ancestors() should return all ancestors', async () => {
      const node = await categories.get(slacks.id);
      const ancestors = await node.tree.ancestors();

      expect(ancestors.length).toBe(3);
      expect(ancestors[0].name).toBe('Clothing');
      expect(ancestors[1].name).toBe("Men's");
      expect(ancestors[2].name).toBe('Suits');
    });

    test('node.tree.isRoot() should check if node is root', async () => {
      const rootNode = await categories.get(clothing.id);
      const leafNode = await categories.get(slacks.id);

      expect(await rootNode.tree.isRoot()).toBe(true);
      expect(await leafNode.tree.isRoot()).toBe(false);
    });

    test('node.tree.isLeaf() should check if node is leaf', async () => {
      const leafNode = await categories.get(slacks.id);
      const branchNode = await categories.get(suits.id);

      expect(await leafNode.tree.isLeaf()).toBe(true);
      expect(await branchNode.tree.isLeaf()).toBe(false);
    });

    test('node.tree.isDescendantOf() should check ancestry', async () => {
      const node = await categories.get(slacks.id);

      expect(await node.tree.isDescendantOf(clothing.id)).toBe(true);
      expect(await node.tree.isDescendantOf(mens.id)).toBe(true);
      expect(await node.tree.isDescendantOf(womens.id)).toBe(false);
    });

    test('node.tree.depth() should return node depth', async () => {
      const rootNode = await categories.get(clothing.id);
      const leafNode = await categories.get(slacks.id);

      expect(await rootNode.tree.depth()).toBe(0);
      expect(await leafNode.tree.depth()).toBe(3);
    });

    test('node.tree.countDescendants() should count descendants', async () => {
      const node = await categories.get(mens.id);

      expect(await node.tree.countDescendants()).toBe(3);
    });

    test('node.tree.addChild() should add a child to the node', async () => {
      const node = await categories.get(womens.id);
      const newChild = await node.tree.addChild({ name: 'Blouses' });

      expect(newChild.name).toBe('Blouses');
      expect(newChild.parentId).toBe(womens.id);

      const children = await node.tree.children();
      expect(children.map(c => c.name)).toContain('Blouses');
    });

    test('node.tree.moveTo() should move subtree to new parent', async () => {
      const node = await categories.get(suits.id);
      await node.tree.moveTo(womens.id);

      const movedNode = await categories.get(suits.id);
      expect(movedNode.parentId).toBe(womens.id);

      const verification = await categories.tree.verify();
      expect(verification.valid).toBe(true);
    });

    test('node.tree.subtree() should return subtree', async () => {
      const node = await categories.get(mens.id);
      const subtree = await node.tree.subtree();

      expect(subtree.length).toBe(4);
      expect(subtree[0].name).toBe("Men's");
    });

    test('nodes from list() should have tree namespace', async () => {
      const nodes = await categories.list();

      expect(nodes.length).toBe(6);
      for (const node of nodes) {
        expect(node.tree).toBeDefined();
        expect(typeof node.tree.parent).toBe('function');
      }
    });

    test('nodes from query() should have tree namespace', async () => {
      const nodes = await categories.query({ depth: 2 });

      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(node.tree).toBeDefined();
        expect(typeof node.tree.children).toBe('function');
      }
    });

    test('chained operations should work', async () => {
      const node = await categories.get(slacks.id);
      const parent = await node.tree.parent();
      const grandparent = await parent.tree.parent();

      expect(grandparent.name).toBe("Men's");

      const children = await grandparent.tree.children();
      expect(children.length).toBe(1);
      expect(children[0].name).toBe('Suits');
    });
  });
});

describe('Tree Plugin - Multi-Tree Support (Nested Set)', () => {
  jest.setTimeout(30000);
  let database;
  let treePlugin;
  let categories;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/tree-nested-set-multi');
    await database.connect();

    treePlugin = new TreePlugin({
      logLevel: 'silent',
      driver: 'nested-set',
      resources: ['categories'],
      treeField: 'treeId'
    });

    categories = await database.createResource({
      name: 'categories',
      asyncPartitions: false, // Critical for tests - ensures partitions are ready immediately
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        treeId: 'string|required',
        lft: 'number|optional',
        rgt: 'number|optional',
        depth: 'number|optional',
        parentId: 'string|optional'
      },
      partitions: {
        byTree: { fields: { treeId: 'string' } }
      }
    });

    await treePlugin.install(database);
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('Tree Isolation', () => {
    test('should create independent trees with separate lft/rgt ranges', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });

      // Each tree should start with lft=1
      expect(productsRoot.lft).toBe(1);
      expect(productsRoot.rgt).toBe(2);
      expect(blogRoot.lft).toBe(1);
      expect(blogRoot.rgt).toBe(2);
    });

    test('should get roots filtered by treeId', async () => {
      await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      await categories.tree.createRoot({ name: 'Services', treeId: 'products' });
      await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });

      const productRoots = await categories.tree.getRoots({ treeId: 'products' });
      const blogRoots = await categories.tree.getRoots({ treeId: 'blog' });

      expect(productRoots.length).toBe(2);
      expect(blogRoots.length).toBe(1);
    });

    test('should inherit treeId when adding children', async () => {
      const root = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const child = await categories.tree.addChild(root.id, { name: 'Electronics' });
      const grandchild = await categories.tree.addChild(child.id, { name: 'Phones' });

      expect(child.treeId).toBe('products');
      expect(grandchild.treeId).toBe('products');
    });

    test('should get descendants only from same tree', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const electronics = await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });
      await categories.tree.addChild(electronics.id, { name: 'Phones' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });
      await categories.tree.addChild(blogRoot.id, { name: 'Tech Posts' });

      const productDescendants = await categories.tree.getDescendants(productsRoot.id);
      const blogDescendants = await categories.tree.getDescendants(blogRoot.id);

      expect(productDescendants.length).toBe(2);
      expect(productDescendants.map(d => d.name)).toContain('Electronics');
      expect(productDescendants.map(d => d.name)).toContain('Phones');

      expect(blogDescendants.length).toBe(1);
      expect(blogDescendants.map(d => d.name)).toContain('Tech Posts');
    });

    test('should prevent moving nodes between different trees', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const electronics = await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });

      await expect(categories.tree.moveSubtree(electronics.id, blogRoot.id))
        .rejects.toThrow(/different tree/);
    });

    test('should shift only nodes within same tree', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });
      const blogChild = await categories.tree.addChild(blogRoot.id, { name: 'Tech' });

      // Blog tree lft/rgt should remain unchanged when we modify products tree
      const blogChildBefore = await categories.get(blogChild.id);
      expect(blogChildBefore.lft).toBe(2);
      expect(blogChildBefore.rgt).toBe(3);

      // Add more nodes to products tree
      await categories.tree.addChild(productsRoot.id, { name: 'Clothing' });

      // Blog tree should still have same values
      const blogChildAfter = await categories.get(blogChild.id);
      expect(blogChildAfter.lft).toBe(2);
      expect(blogChildAfter.rgt).toBe(3);
    });

    test('should verify tree by treeId', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });
      await categories.tree.addChild(blogRoot.id, { name: 'Tech' });

      const productVerification = await categories.tree.verify({ treeId: 'products' });
      const blogVerification = await categories.tree.verify({ treeId: 'blog' });

      expect(productVerification.valid).toBe(true);
      expect(productVerification.nodeCount).toBe(2);

      expect(blogVerification.valid).toBe(true);
      expect(blogVerification.nodeCount).toBe(2);
    });

    test('should rebuild tree by treeId', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });
      await categories.tree.addChild(blogRoot.id, { name: 'Tech' });

      // Corrupt products tree
      await categories.update(productsRoot.id, { lft: 100, rgt: 200 });

      // Rebuild only products tree
      const result = await categories.tree.rebuild({ treeId: 'products' });
      expect(result.rebuilt).toBe(2);

      // Verify both trees are valid
      const productVerification = await categories.tree.verify({ treeId: 'products' });
      const blogVerification = await categories.tree.verify({ treeId: 'blog' });

      expect(productVerification.valid).toBe(true);
      expect(blogVerification.valid).toBe(true);
    });

    test('should get full tree filtered by treeId', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });
      await categories.tree.addChild(productsRoot.id, { name: 'Clothing' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });
      await categories.tree.addChild(blogRoot.id, { name: 'Tech' });

      const productTree = await categories.tree.getFullTree({ treeId: 'products', flat: true });
      const blogTree = await categories.tree.getFullTree({ treeId: 'blog', flat: true });

      expect(productTree.length).toBe(3);
      expect(blogTree.length).toBe(2);
    });

    test('should delete subtree without affecting other trees', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const electronics = await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });
      await categories.tree.addChild(electronics.id, { name: 'Phones' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });
      const blogChild = await categories.tree.addChild(blogRoot.id, { name: 'Tech' });

      // Delete electronics subtree
      await categories.tree.deleteSubtree(electronics.id);

      // Products tree should only have root
      const productVerification = await categories.tree.verify({ treeId: 'products' });
      expect(productVerification.nodeCount).toBe(1);

      // Blog tree should be unchanged
      const blogVerification = await categories.tree.verify({ treeId: 'blog' });
      expect(blogVerification.nodeCount).toBe(2);

      // Blog child lft/rgt should be unchanged
      const blogChildAfter = await categories.get(blogChild.id);
      expect(blogChildAfter.lft).toBe(2);
      expect(blogChildAfter.rgt).toBe(3);
    });
  });
});
