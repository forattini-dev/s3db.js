/**
 * Graph Plugin Tests
 */

import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { GraphPlugin } from '../../src/plugins/graph.plugin.js';

describe('GraphPlugin', () => {
  let db;
  let graphPlugin;

  beforeAll(async () => {
    db = new Database({ connectionString: 'memory://test/graph-db' });
    await db.connect();

    // Create vertex resource
    await db.createResource({
      name: 'nodes',
      attributes: {
        name: 'string|required',
        type: 'string|optional'
      }
    });

    // Create edge resource with partitions
    await db.createResource({
      name: 'edges',
      asyncPartitions: false,
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

    // Install graph plugin
    graphPlugin = new GraphPlugin({
      vertices: 'nodes',
      edges: 'edges',
      directed: true,
      weighted: true,
      logLevel: 'silent'
    });

    await db.usePlugin(graphPlugin);
  });

  afterAll(async () => {
    await db.disconnect();
  });

  describe('Plugin Installation', () => {
    it('should add .graph namespace to vertex resources', () => {
      expect(db.resources.nodes.graph).toBeDefined();
      expect(typeof db.resources.nodes.graph.edges).toBe('function');
      expect(typeof db.resources.nodes.graph.neighbors).toBe('function');
      expect(typeof db.resources.nodes.graph.connect).toBe('function');
    });

    it('should add .graph namespace to edge resources', () => {
      expect(db.resources.edges.graph).toBeDefined();
      expect(typeof db.resources.edges.graph.labels).toBe('function');
      expect(typeof db.resources.edges.graph.bySource).toBe('function');
      expect(typeof db.resources.edges.graph.byTarget).toBe('function');
    });
  });

  describe('Vertex Operations', () => {
    let alice, bob, charlie;

    beforeEach(async () => {
      // Clear existing data
      const allNodes = await db.resources.nodes.list();
      for (const node of allNodes || []) {
        await db.resources.nodes.delete(node.id);
      }
      const allEdges = await db.resources.edges.list();
      for (const edge of allEdges || []) {
        await db.resources.edges.delete(edge.id);
      }

      // Create test vertices
      alice = await db.resources.nodes.insert({ name: 'Alice', type: 'person' });
      bob = await db.resources.nodes.insert({ name: 'Bob', type: 'person' });
      charlie = await db.resources.nodes.insert({ name: 'Charlie', type: 'person' });
    });

    it('should connect vertices', async () => {
      await db.resources.nodes.graph.connect(alice.id, bob.id, { label: 'knows' });

      const edges = await db.resources.nodes.graph.edges(alice.id);
      expect(edges).toHaveLength(1);
      expect(edges[0].source).toBe(alice.id);
      expect(edges[0].target).toBe(bob.id);
      expect(edges[0].label).toBe('knows');
    });

    it('should get outgoing neighbors', async () => {
      await db.resources.nodes.graph.connect(alice.id, bob.id, { label: 'knows' });
      await db.resources.nodes.graph.connect(alice.id, charlie.id, { label: 'knows' });

      const neighbors = await db.resources.nodes.graph.neighbors(alice.id, { direction: 'outgoing' });
      expect(neighbors).toHaveLength(2);

      const neighborIds = neighbors.map(n => n.id);
      expect(neighborIds).toContain(bob.id);
      expect(neighborIds).toContain(charlie.id);
    });

    it('should get incoming neighbors', async () => {
      await db.resources.nodes.graph.connect(alice.id, charlie.id, { label: 'knows' });
      await db.resources.nodes.graph.connect(bob.id, charlie.id, { label: 'knows' });

      const neighbors = await db.resources.nodes.graph.neighbors(charlie.id, { direction: 'incoming' });
      expect(neighbors).toHaveLength(2);
    });

    it('should check if vertices are connected', async () => {
      await db.resources.nodes.graph.connect(alice.id, bob.id);

      const connected = await db.resources.nodes.graph.isConnected(alice.id, bob.id);
      const notConnected = await db.resources.nodes.graph.isConnected(alice.id, charlie.id);

      expect(connected).toBe(true);
      expect(notConnected).toBe(false);
    });

    it('should disconnect vertices', async () => {
      await db.resources.nodes.graph.connect(alice.id, bob.id, { label: 'knows' });
      await db.resources.nodes.graph.disconnect(alice.id, bob.id);

      const connected = await db.resources.nodes.graph.isConnected(alice.id, bob.id);
      expect(connected).toBe(false);
    });

    it('should get vertex degree', async () => {
      await db.resources.nodes.graph.connect(alice.id, bob.id);
      await db.resources.nodes.graph.connect(alice.id, charlie.id);
      await db.resources.nodes.graph.connect(bob.id, alice.id);

      const degree = await db.resources.nodes.graph.degree(alice.id);
      expect(degree.outgoing).toBe(2);
      expect(degree.incoming).toBe(1);
      expect(degree.total).toBe(3);
    });
  });

  describe('Edge Operations', () => {
    let alice, bob, charlie;

    beforeEach(async () => {
      // Clear existing data
      const allNodes = await db.resources.nodes.list();
      for (const node of allNodes || []) {
        await db.resources.nodes.delete(node.id);
      }
      const allEdges = await db.resources.edges.list();
      for (const edge of allEdges || []) {
        await db.resources.edges.delete(edge.id);
      }

      // Create test vertices and edges
      alice = await db.resources.nodes.insert({ name: 'Alice' });
      bob = await db.resources.nodes.insert({ name: 'Bob' });
      charlie = await db.resources.nodes.insert({ name: 'Charlie' });

      await db.resources.edges.graph.create(alice.id, bob.id, { label: 'knows' });
      await db.resources.edges.graph.create(alice.id, charlie.id, { label: 'works-with' });
      await db.resources.edges.graph.create(bob.id, charlie.id, { label: 'knows' });
    });

    it('should get edges by label', async () => {
      const knowsEdges = await db.resources.edges.graph.labels('knows');
      expect(knowsEdges).toHaveLength(2);

      const worksWithEdges = await db.resources.edges.graph.labels('works-with');
      expect(worksWithEdges).toHaveLength(1);
    });

    it('should get edges by source', async () => {
      const aliceEdges = await db.resources.edges.graph.bySource(alice.id);
      expect(aliceEdges).toHaveLength(2);
    });

    it('should get edges by target', async () => {
      const charlieEdges = await db.resources.edges.graph.byTarget(charlie.id);
      expect(charlieEdges).toHaveLength(2);
    });

    it('should get edges between two vertices', async () => {
      const edges = await db.resources.edges.graph.between(alice.id, bob.id);
      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('knows');
    });
  });

  describe('Pathfinding', () => {
    let a, b, c, d, e;

    beforeEach(async () => {
      // Clear existing data
      const allNodes = await db.resources.nodes.list();
      for (const node of allNodes || []) {
        await db.resources.nodes.delete(node.id);
      }
      const allEdges = await db.resources.edges.list();
      for (const edge of allEdges || []) {
        await db.resources.edges.delete(edge.id);
      }

      // Create a graph: A -> B -> C -> D -> E
      //                 |         ^
      //                 +------>--+
      a = await db.resources.nodes.insert({ name: 'A' });
      b = await db.resources.nodes.insert({ name: 'B' });
      c = await db.resources.nodes.insert({ name: 'C' });
      d = await db.resources.nodes.insert({ name: 'D' });
      e = await db.resources.nodes.insert({ name: 'E' });

      await db.resources.nodes.graph.connect(a.id, b.id, { weight: 1 });
      await db.resources.nodes.graph.connect(b.id, c.id, { weight: 1 });
      await db.resources.nodes.graph.connect(c.id, d.id, { weight: 1 });
      await db.resources.nodes.graph.connect(d.id, e.id, { weight: 1 });
      await db.resources.nodes.graph.connect(a.id, c.id, { weight: 3 }); // Shortcut but heavier
    });

    it('should find shortest path', async () => {
      const result = await db.resources.nodes.graph.shortestPath(a.id, e.id);

      expect(result.path).toHaveLength(5);
      expect(result.path[0]).toBe(a.id);
      expect(result.path[result.path.length - 1]).toBe(e.id);
      expect(result.distance).toBe(4); // A->B->C->D->E = 4
    });

    it('should find weighted shortest path', async () => {
      // The direct A->C path has weight 3
      // The A->B->C path has weight 2 (1+1)
      const result = await db.resources.nodes.graph.shortestPath(a.id, c.id);

      expect(result.path).toEqual([a.id, b.id, c.id]);
      expect(result.distance).toBe(2);
    });

    it('should throw when no path exists', async () => {
      // Create isolated vertex
      const isolated = await db.resources.nodes.insert({ name: 'Isolated' });

      await expect(
        db.resources.nodes.graph.shortestPath(a.id, isolated.id)
      ).rejects.toThrow('No path found');
    });

    it('should check if path exists', async () => {
      const exists = await db.resources.nodes.graph.pathExists(a.id, e.id);
      expect(exists).toBe(true);

      const isolated = await db.resources.nodes.insert({ name: 'Isolated' });
      const notExists = await db.resources.nodes.graph.pathExists(a.id, isolated.id);
      expect(notExists).toBe(false);
    });
  });

  describe('Traversal', () => {
    let root, child1, child2, grandchild;

    beforeEach(async () => {
      // Clear existing data
      const allNodes = await db.resources.nodes.list();
      for (const node of allNodes || []) {
        await db.resources.nodes.delete(node.id);
      }
      const allEdges = await db.resources.edges.list();
      for (const edge of allEdges || []) {
        await db.resources.edges.delete(edge.id);
      }

      // Create a tree:
      //      root
      //     /    \
      //  child1  child2
      //    |
      // grandchild
      root = await db.resources.nodes.insert({ name: 'Root' });
      child1 = await db.resources.nodes.insert({ name: 'Child1' });
      child2 = await db.resources.nodes.insert({ name: 'Child2' });
      grandchild = await db.resources.nodes.insert({ name: 'Grandchild' });

      await db.resources.nodes.graph.connect(root.id, child1.id);
      await db.resources.nodes.graph.connect(root.id, child2.id);
      await db.resources.nodes.graph.connect(child1.id, grandchild.id);
    });

    it('should traverse graph with BFS', async () => {
      const result = await db.resources.nodes.graph.traverse(root.id, { mode: 'bfs' });

      expect(result).toHaveLength(4);
      expect(result[0].id).toBe(root.id);
      expect(result[0].depth).toBe(0);

      // BFS: depth 1 nodes should come before depth 2
      const depths = result.map(r => r.depth);
      expect(depths).toEqual([0, 1, 1, 2]);
    });

    it('should respect maxDepth', async () => {
      const result = await db.resources.nodes.graph.traverse(root.id, { maxDepth: 1 });

      expect(result).toHaveLength(3); // root + 2 children
      expect(result.map(r => r.depth).every(d => d <= 1)).toBe(true);
    });

    it('should apply filter function', async () => {
      const result = await db.resources.nodes.graph.traverse(root.id, {
        filter: (node) => node.data?.name?.includes('Root') || node.data?.name?.includes('Child')
      });

      expect(result.length).toBe(3); // Root + Child1 + Child2 (Grandchild filtered out)
    });
  });

  describe('Undirected Graph', () => {
    let undirectedDb;
    let undirectedPlugin;

    beforeAll(async () => {
      undirectedDb = new Database({ connectionString: 'memory://test/undirected-db' });
      await undirectedDb.connect();

      await undirectedDb.createResource({
        name: 'friends',
        attributes: { name: 'string|required' }
      });

      await undirectedDb.createResource({
        name: 'friendships',
        asyncPartitions: false,
        attributes: {
          source: 'string|required',
          target: 'string|required'
        },
        partitions: {
          bySource: { fields: { source: 'string' } },
          byTarget: { fields: { target: 'string' } }
        }
      });

      undirectedPlugin = new GraphPlugin({
        vertices: 'friends',
        edges: 'friendships',
        directed: false, // Undirected!
        logLevel: 'silent'
      });

      await undirectedDb.usePlugin(undirectedPlugin);
    });

    afterAll(async () => {
      await undirectedDb.disconnect();
    });

    it('should create bidirectional edges', async () => {
      const alice = await undirectedDb.resources.friends.insert({ name: 'Alice' });
      const bob = await undirectedDb.resources.friends.insert({ name: 'Bob' });

      await undirectedDb.resources.friends.graph.connect(alice.id, bob.id);

      // Both should see each other as neighbors
      const aliceNeighbors = await undirectedDb.resources.friends.graph.neighbors(alice.id);
      const bobNeighbors = await undirectedDb.resources.friends.graph.neighbors(bob.id);

      expect(aliceNeighbors.some(n => n.id === bob.id)).toBe(true);
      expect(bobNeighbors.some(n => n.id === alice.id)).toBe(true);
    });
  });
});
