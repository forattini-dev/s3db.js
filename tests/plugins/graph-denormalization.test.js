/**
 * Graph Denormalization Test
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { GraphPlugin } from '../../src/plugins/graph.plugin.js';

describe('GraphPlugin - Denormalization', () => {
  let db;

  beforeAll(async () => {
    db = new Database({ connectionString: 'memory://test/graph-denorm' });
    await db.connect();

    // Resources
    await db.createResource({ 
      name: 'users', 
      attributes: { name: 'string', avatar: 'string|optional' } 
    });
    
    await db.createResource({
      name: 'follows',
      asyncPartitions: false,
      attributes: { source: 'string', target: 'string', snapshot: 'object|optional' },
      partitions: { bySource: { fields: { source: 'string' } }, byTarget: { fields: { target: 'string' } } }
    });

    // Plugin with denormalization enabled
    const plugin = new GraphPlugin({
      vertices: 'users',
      edges: 'follows',
      directed: true,
      denormalize: ['name', 'avatar'], // Snapshot these fields
      logLevel: 'silent'
    });
    await db.usePlugin(plugin);
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('should snapshot vertex data onto the edge upon connection', async () => {
    // Create users
    const alice = await db.resources.users.insert({ name: 'Alice', avatar: 'alice.png' });
    const bob = await db.resources.users.insert({ name: 'Bob', avatar: 'bob.png' });

    // Connect Alice -> Bob
    await db.resources.users.graph.connect(alice.id, bob.id);

    // Verify edge has snapshot
    const edges = await db.resources.follows.graph.bySource(alice.id);
    
    // Force refresh/get to ensure we see the field (if list didn't return it)
    // But bySource calls listPartition which calls get() which should include plugin fields
    expect(edges[0].snapshot).toBeDefined();
    expect(edges[0].snapshot.name).toBe('Bob');
    expect(edges[0].snapshot.avatar).toBe('bob.png');
  });

  it('should use cached data in neighbors() without fetching vertex', async () => {
    const charlie = await db.resources.users.insert({ name: 'Charlie', avatar: 'charlie.png' });
    const dave = await db.resources.users.insert({ name: 'Dave', avatar: 'dave.png' });

    await db.resources.users.graph.connect(charlie.id, dave.id);

    // Spy on users.getMany/get to ensure it's NOT called
    const getSpy = jest.spyOn(db.resources.users, 'getMany');
    const getSingleSpy = jest.spyOn(db.resources.users, 'get');

    const neighbors = await db.resources.users.graph.neighbors(charlie.id);

    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].name).toBe('Dave');
    expect(neighbors[0].avatar).toBe('dave.png');

    // Should NOT have called getMany/get because data was in edge
    expect(getSpy).not.toHaveBeenCalled();
    expect(getSingleSpy).not.toHaveBeenCalled();

    getSpy.mockRestore();
    getSingleSpy.mockRestore();
  });

  it('should fallback to fetch if snapshot is missing', async () => {
    const eve = await db.resources.users.insert({ name: 'Eve' });
    const frank = await db.resources.users.insert({ name: 'Frank' });

    // Create edge manually WITHOUT snapshot
    // Note: insert() bypasses plugin logic unless we use graph.connect
    await db.resources.follows.insert({
      source: eve.id,
      target: frank.id
    });

    // neighbors() should fetch Frank from DB since edge has no _targetData
    const getManySpy = jest.spyOn(db.resources.users, 'getMany');
    
    const neighbors = await db.resources.users.graph.neighbors(eve.id);
    
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].name).toBe('Frank');
    expect(getManySpy).toHaveBeenCalled(); // Must fetch!

    getManySpy.mockRestore();
  });
});
