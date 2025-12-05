/**
 * A* Algorithm Demonstration Test
 * 
 * Compares Dijkstra vs A* performance on a Grid graph.
 */

import { Database } from '../../src/database.class.js';
import { GraphPlugin } from '../../src/plugins/graph.plugin.js';

describe('GraphPlugin - A* Algorithm', () => {
  let db;
  const GRID_SIZE = 10; // 10x10 grid

  // Helper to get node ID from coordinates
  const id = (x, y) => `${x},${y}`;

  // Manhattan distance heuristic
  const heuristic = (fromId, toId) => {
    const [x1, y1] = fromId.split(',').map(Number);
    const [x2, y2] = toId.split(',').map(Number);
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  };

  beforeAll(async () => {
    db = new Database({ connectionString: 'memory://test/astar-demo' });
    await db.connect();

    // Resources
    await db.createResource({ name: 'grid_nodes', attributes: { x: 'number', y: 'number' } });
    await db.createResource({
      name: 'grid_edges',
      asyncPartitions: false,
      attributes: { source: 'string', target: 'string', weight: 'number' },
      partitions: { bySource: { fields: { source: 'string' } }, byTarget: { fields: { target: 'string' } } }
    });

    // Plugin
    const plugin = new GraphPlugin({
      vertices: 'grid_nodes',
      edges: 'grid_edges',
      weighted: true,
      directed: false, // Undirected grid
      logLevel: 'silent'
    });
    await db.usePlugin(plugin);

    // Build Grid Graph (10x10)
    // Connect each node to neighbors (Right, Down)
    const nodes = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        nodes.push({ id: id(x, y), x, y });
      }
    }
    await db.resources.grid_nodes.insertMany(nodes);

    const edges = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const current = id(x, y);
        
        // Edge to Right
        if (x < GRID_SIZE - 1) {
          edges.push({
            source: current,
            target: id(x + 1, y),
            weight: 1,
            _reverse: false // Let plugin handle undirected logic or manual? 
                            // We used directed: false in plugin config, so plugin handles it?
                            // Wait, insertMany bypasses plugin logic. 
                            // We need to insert via graph API or manually insert both directions.
                            // Plugin config 'directed: false' only affects traverse/query logic if using raw insert?
                            // No, GraphPlugin.createEdge creates reverse edge.
                            // But for speed we are using raw insert.
                            // Let's create raw edges for both directions manually for speed.
          });
          edges.push({ source: id(x + 1, y), target: current, weight: 1 });
        }

        // Edge Down
        if (y < GRID_SIZE - 1) {
          edges.push({
            source: current,
            target: id(x, y + 1),
            weight: 1
          });
          edges.push({ source: id(x, y + 1), target: current, weight: 1 });
        }
      }
    }
    await db.resources.grid_edges.insertMany(edges);
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('should find the same shortest path with Dijkstra and A*', async () => {
    const start = id(0, 0);
    const end = id(GRID_SIZE - 1, GRID_SIZE - 1);

    // Dijkstra (heuristic = null)
    const dijkstra = await db.resources.grid_nodes.graph.shortestPath(start, end, {
      includeStats: true
    });

    // A* (heuristic = manhattan)
    const astar = await db.resources.grid_nodes.graph.shortestPath(start, end, {
      heuristic,
      includeStats: true
    });

    // Verify paths are valid and lengths equal
    expect(dijkstra.distance).toBe((GRID_SIZE - 1) * 2);
    expect(astar.distance).toBe((GRID_SIZE - 1) * 2);
    
    // A* path might differ slightly in nodes chosen if multiple equal paths exist,
    // but distance must be optimal.
  });

  it('A* should be more efficient (visit fewer nodes) than Dijkstra', async () => {
    const start = id(0, 0);
    const end = id(GRID_SIZE - 1, GRID_SIZE - 1);

    // Dijkstra
    const dijkstra = await db.resources.grid_nodes.graph.shortestPath(start, end, {
      includeStats: true
    });

    // A*
    const astar = await db.resources.grid_nodes.graph.shortestPath(start, end, {
      heuristic,
      includeStats: true
    });

    console.log('Dijkstra Stats:', dijkstra.stats);
    console.log('A* Stats:', astar.stats);

    // A* should visit significantly fewer nodes in a grid
    // Dijkstra basically floods the whole grid until it hits the corner
    // A* beams towards the target
    expect(astar.stats.visited).toBeLessThan(dijkstra.stats.visited);
    expect(astar.stats.iterations).toBeLessThan(dijkstra.stats.iterations);
  });
});
