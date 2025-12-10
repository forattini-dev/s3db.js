import { TreePlugin } from '#src/plugins/tree/index.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('Tree Plugin (Adjacency List Driver)', () => {
  /* TODO: Use vi.setConfig({ testTimeout: 30000 }) or test options */ vi.setConfig({ testTimeout: 30000 });
  let database;
  let treePlugin;
  let categories;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/tree-adjacency');
    await database.connect();

    treePlugin = new TreePlugin({
      logLevel: 'silent',
      driver: 'adjacency-list',
      resources: ['categories']
    });

    categories = await database.createResource({
      name: 'categories',
      asyncPartitions: false, // Critical for Adjacency List performance/correctness in tests
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        parentId: 'string|optional'
      },
      partitions: {
        byParent: {
          fields: { parentId: 'string' }
        }
      }
    });

    await treePlugin.install(database);
  });

  afterEach(async () => {
    if (database) await database.disconnect();
  });

  describe('Initialization', () => {
    test('should require byParent partition', async () => {
      const badDb = createDatabaseForTest('suite=plugins/tree-adjacency-bad');
      await badDb.connect();
      await badDb.createResource({ name: 'bad_resource', attributes: { name: 'string' } });
      
      const badPlugin = new TreePlugin({
        driver: 'adjacency-list',
        resources: ['bad_resource']
      });
      await badPlugin.install(badDb);

      // Should throw when trying to use tree methods
      await expect(badDb.resources.bad_resource.tree.createRoot({ name: 'Root' }))
        .rejects.toThrow(/must have a 'byParent' partition/);
        
      await badDb.disconnect();
    });
  });

  describe('Tree Operations', () => {
    test('should create hierarchy', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      const child1 = await categories.tree.addChild(root.id, { name: 'Child 1' });
      const child2 = await categories.tree.addChild(root.id, { name: 'Child 2' });
      const grandChild = await categories.tree.addChild(child1.id, { name: 'GrandChild' });

      const children = await categories.tree.getChildren(root.id);
      expect(children).toHaveLength(2);
      expect(children.map(c => c.name).sort()).toEqual(['Child 1', 'Child 2']);

      const descendants = await categories.tree.getDescendants(root.id);
      expect(descendants).toHaveLength(3);
      expect(descendants.map(d => d.name).sort()).toEqual(['Child 1', 'Child 2', 'GrandChild']);
    });

    test('should get ancestors (recursive)', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      const child = await categories.tree.addChild(root.id, { name: 'Child' });
      const grandChild = await categories.tree.addChild(child.id, { name: 'GrandChild' });

      const ancestors = await categories.tree.getAncestors(grandChild.id);
      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].id).toBe(root.id);
      expect(ancestors[1].id).toBe(child.id);
    });

    test('should move subtree (O(1) operation)', async () => {
      const root1 = await categories.tree.createRoot({ name: 'Root 1' });
      const root2 = await categories.tree.createRoot({ name: 'Root 2' });
      const child = await categories.tree.addChild(root1.id, { name: 'Moving Child' });
      await categories.tree.addChild(child.id, { name: 'GrandChild' });

      // Move child from Root 1 to Root 2
      await categories.tree.moveSubtree(child.id, root2.id);

      const movedChild = await categories.get(child.id);
      expect(movedChild.parentId).toBe(root2.id);

      // Verify descendants are still attached
      const descendants = await categories.tree.getDescendants(child.id);
      expect(descendants).toHaveLength(1);
      expect(descendants[0].name).toBe('GrandChild');
    });

    test('should prevent cycles during move', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      const child = await categories.tree.addChild(root.id, { name: 'Child' });
      const grandChild = await categories.tree.addChild(child.id, { name: 'GrandChild' });

      // Try to move Root as a child of GrandChild (Cycle!)
      await expect(categories.tree.moveSubtree(root.id, grandChild.id))
        .rejects.toThrow(/descendant|cycle/);
    });

    test('should delete subtree', async () => {
      const root = await categories.tree.createRoot({ name: 'Root' });
      const child = await categories.tree.addChild(root.id, { name: 'Child' });
      await categories.tree.addChild(child.id, { name: 'GrandChild' });

      // Adjacency list deleteNode with promoteChildren=false throws by default if children exist
      // This mimics the interface behavior
      await expect(categories.tree.deleteNode(child.id, { promoteChildren: false }))
        .rejects.toThrow(/Node has children/);
        
      // Promote children (GrandChild becomes child of Root)
      await categories.tree.deleteNode(child.id, { promoteChildren: true });
      
      const newChildren = await categories.tree.getChildren(root.id);
      expect(newChildren).toHaveLength(1);
      expect(newChildren[0].name).toBe('GrandChild');
    });
  });
});

describe('Tree Plugin - Multi-Tree Support (Adjacency List)', () => {
  /* TODO: Use vi.setConfig({ testTimeout: 30000 }) or test options */ vi.setConfig({ testTimeout: 30000 });
  let database;
  let treePlugin;
  let categories;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/tree-adjacency-multi');
    await database.connect();

    treePlugin = new TreePlugin({
      logLevel: 'silent',
      driver: 'adjacency-list',
      resources: ['categories'],
      treeField: 'treeId'
    });

    categories = await database.createResource({
      name: 'categories',
      asyncPartitions: false,
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        treeId: 'string|required',
        parentId: 'string|optional'
      },
      partitions: {
        byParent: { fields: { parentId: 'string' } },
        byTree: { fields: { treeId: 'string' } }
      }
    });

    await treePlugin.install(database);
  });

  afterEach(async () => {
    if (database) await database.disconnect();
  });

  describe('Tree Isolation', () => {
    test('should create independent trees', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });

      expect(productsRoot.treeId).toBe('products');
      expect(blogRoot.treeId).toBe('blog');
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

    test('should prevent moving nodes between different trees', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const electronics = await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });

      await expect(categories.tree.moveSubtree(electronics.id, blogRoot.id))
        .rejects.toThrow(/different tree/);
    });

    test('should move nodes within same tree', async () => {
      const root = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const electronics = await categories.tree.addChild(root.id, { name: 'Electronics' });
      const clothing = await categories.tree.addChild(root.id, { name: 'Clothing' });
      const phones = await categories.tree.addChild(electronics.id, { name: 'Phones' });

      // Move phones under clothing (same tree)
      await categories.tree.moveSubtree(phones.id, clothing.id);

      const movedPhones = await categories.get(phones.id);
      expect(movedPhones.parentId).toBe(clothing.id);
      expect(movedPhones.treeId).toBe('products');
    });

    test('descendants should only include nodes from same tree', async () => {
      const productsRoot = await categories.tree.createRoot({ name: 'Products', treeId: 'products' });
      const electronics = await categories.tree.addChild(productsRoot.id, { name: 'Electronics' });
      await categories.tree.addChild(electronics.id, { name: 'Phones' });

      const blogRoot = await categories.tree.createRoot({ name: 'Blog', treeId: 'blog' });
      await categories.tree.addChild(blogRoot.id, { name: 'Tech Posts' });

      // Adjacency list naturally isolates descendants by following parent pointers
      const productDescendants = await categories.tree.getDescendants(productsRoot.id);
      expect(productDescendants.length).toBe(2);
      expect(productDescendants.map(d => d.name)).not.toContain('Tech Posts');
    });
  });
});
