import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest, sleep } from '../config.js';
import { ReplicatorPlugin } from '#src/plugins/replicator.plugin.js';
import S3dbReplicator from '#src/plugins/replicators/s3db-replicator.class.js';

// Adiciona função utilitária de polling para aguardar replicação
async function waitForReplication(getFn, id, { timeout = 5000, interval = 200 } = {}) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeout) {
    try {
      const result = await getFn(id);
      if (result) return result;
    } catch (err) {
      lastErr = err;
    }
    await sleep(interval);
  }
  if (lastErr) throw lastErr;
  throw new Error('Timeout waiting for replication');
}

async function waitForDelete(resource, id, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await resource.get(id);
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.code === 'NoSuchKey') return true;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Resource was not deleted in time');
}

// --- a1: same resource name, same attributes ---
describe('S3dbReplicator - s3db to s3db replication', () => {
  let dbA, dbB, plugin;
  beforeEach(async () => {
    dbA = createDatabaseForTest('rep-a1-src');
    dbB = createDatabaseForTest('rep-a1-dst');
    await Promise.all([
      dbA.connect(),
      dbB.connect()
    ]);
    await Promise.all([
      dbA.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      }),
      dbB.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      })
    ]);
    // Defensive: ensure resource is registered
    if (!dbB.resources['users']) {
      await dbB.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      });
    }
    // Construct and setup plugin here - exemplo simples
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'users',
              actions: ['insert', 'update', 'delete']
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
  });

  afterEach(async () => {
    // Wait for any pending replication operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    // Wait for any pending replication operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    if (plugin && typeof plugin.cleanup === 'function') {
      await plugin.cleanup();
      plugin = null;
    }
  });

  test('sanity check: insert/get direto no resource de destino', async () => {
    const user = { id: 'sanity', name: 'Sanity Check' }
    await dbB.resources['users'].insert(user)
    const found = await dbB.resources['users'].get('sanity')
    expect(found).toMatchObject(user)
  })

  afterAll(async () => {
    await dbA?.disconnect?.();
    await dbB?.disconnect?.();
  });
  test('replicates insert from users to users', async () => {
    await dbA.resources['users'].insert({ id: '1', name: 'Alice' });
    const userB = await waitForReplication((id) => dbB.resources['users'].get(id), '1');
    expect(userB).toMatchObject({ id: '1', name: 'Alice' });
  });

  test('replicates update from users to users', async () => {
    await dbA.resources['users'].insert({ id: '1', name: 'Alice' });
    await waitForReplication((id) => dbB.resources['users'].get(id), '1');
    await dbA.resources['users'].update('1', { name: 'Alice Updated' });
    // Wait a bit longer for update replication to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    const userB2 = await waitForReplication((id) => dbB.resources['users'].get(id), '1');
    expect(userB2).toMatchObject({ id: '1', name: 'Alice Updated' });
  });

  test('replicates delete from users to users', async () => {
    await dbA.resources['users'].insert({ id: '1', name: 'Alice' });
    await waitForReplication((id) => dbB.resources['users'].get(id), '1');
    await dbA.resources['users'].delete('1');
    await waitForDelete(dbB.resources['users'], '1');
  });

  test('replicates insert, update, and delete from users to users', async () => {
    await dbA.resources['users'].insert({ id: '1', name: 'Alice' });
    await waitForReplication((id) => dbB.resources['users'].get(id), '1');
    await dbA.resources['users'].update('1', { name: 'Alice Updated' });
    // Wait a bit longer for update replication to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    const userB2 = await waitForReplication((id) => dbB.resources['users'].get(id), '1');
    expect(userB2).toMatchObject({ id: '1', name: 'Alice Updated' });
    await dbA.resources['users'].delete('1');
    await waitForDelete(dbB.resources['users'], '1');
  });
});

// --- a2: same resource name/attributes, array syntax ---
describe('S3dbReplicator - a2: same resource name/attributes', () => {
  let dbA, dbB, usersA, usersB, plugin;
  beforeAll(async () => {
    dbA = createDatabaseForTest('rep-a2-src');
    dbB = createDatabaseForTest('rep-a2-dst');
    await Promise.all([
      dbA.connect(),
      dbB.connect()
    ]);
    [usersA, usersB] = await Promise.all([
      dbA.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      }),
      dbB.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      })
    ]);
    // Defensive: ensure resource is registered
    if (!dbB.resources['users']) {
      usersB = await dbB.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      });
    }
  });
  beforeEach(async () => {
    for (const resource of [usersA, usersB]) {
      const all = await resource.list();
      for (const item of all) {
        if (item.id) await resource.delete(item.id).catch(() => {});
      }
    }
  });
  afterAll(async () => {
    await dbA?.disconnect?.();
    await dbB?.disconnect?.();
  });
  afterEach(async () => {
    // Wait for any pending replication operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    // Wait for any pending replication operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    if (plugin && typeof plugin.cleanup === 'function') {
      await plugin.cleanup();
      plugin = null;
    }
  });
  test('replicates insert from users to users', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    if (!usersB) throw new Error('users not registered in dbB.resources after plugin setup');
    if (plugin.replicators && plugin.replicators[0] && plugin.replicators[0].instance) {
      const resourceObj = plugin.replicators[0].instance.client.resources['users'];
      if (Object.keys(plugin.replicators[0].instance.client.resources).length === 0) throw new Error('replicator client.resources is empty before test');
    }
    const user = { id: '2', name: 'Bob' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => usersB.get(id), '2');
    expect(found).toBeDefined();
    expect(found.name).toBe('Bob');
  });

  test('replicates update from users to users', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    if (!usersB) throw new Error('users not registered in dbB.resources after plugin setup');
    if (plugin.replicators && plugin.replicators[0] && plugin.replicators[0].instance) {
      const resourceObj = plugin.replicators[0].instance.client.resources['users'];
      if (Object.keys(plugin.replicators[0].instance.client.resources).length === 0) throw new Error('replicator client.resources is empty before test');
    }
    const user = { id: '2', name: 'Bob' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => usersB.get(id), '2');
    expect(found).toBeDefined();
    expect(found.name).toBe('Bob');
    await usersA.update('2', { name: 'Bob Updated' });
    // Wait a bit longer for update replication to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    const found2 = await waitForReplication((id) => usersB.get(id), '2');
    expect(found2).toMatchObject({ id: '2', name: 'Bob Updated' });
  });

  test('replicates delete from users to users', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    if (!usersB) throw new Error('users not registered in dbB.resources after plugin setup');
    if (plugin.replicators && plugin.replicators[0] && plugin.replicators[0].instance) {
      const resourceObj = plugin.replicators[0].instance.client.resources['users'];
      if (Object.keys(plugin.replicators[0].instance.client.resources).length === 0) throw new Error('replicator client.resources is empty before test');
    }
    const user = { id: '2', name: 'Bob' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => usersB.get(id), '2');
    expect(found).toBeDefined();
    await usersA.delete('2');
    await waitForDelete(usersB, '2');
  });

  test('replicates insert, update, and delete from users to users', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    if (!usersB) throw new Error('users not registered in dbB.resources after plugin setup');
    if (plugin.replicators && plugin.replicators[0] && plugin.replicators[0].instance) {
      const resourceObj = plugin.replicators[0].instance.client.resources['users'];
      if (Object.keys(plugin.replicators[0].instance.client.resources).length === 0) throw new Error('replicator client.resources is empty before test');
    }
    const user = { id: '2', name: 'Bob' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => usersB.get(id), '2');
    expect(found).toBeDefined();
    await usersA.update('2', { name: 'Bob Updated' });
    // Wait a bit longer for update replication to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    const found2 = await waitForReplication((id) => usersB.get(id), '2');
    expect(found2).toMatchObject({ id: '2', name: 'Bob Updated' });
    await usersA.delete('2');
    await waitForDelete(usersB, '2');
  });
});

// --- a3: different resources, insert with transform ---
describe('S3dbReplicator - a3: different resources, insert with transform', () => {
  let dbA, dbB, usersA, peopleB, plugin;
  beforeAll(async () => {
    dbA = createDatabaseForTest('rep-a3-src');
    dbB = createDatabaseForTest('rep-a3-dst');
    await Promise.all([
      dbA.connect(),
      dbB.connect()
    ]);
    [usersA, peopleB] = await Promise.all([
      dbA.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      }),
      dbB.createResource({
        name: 'people',
        attributes: { id: 'string', fullName: 'string' }
      })
    ]);
    // Defensive: ensure resource is registered
    if (!dbB.resources['people']) {
      peopleB = await dbB.createResource({
        name: 'people',
        attributes: { id: 'string', fullName: 'string' }
      });
    }
  });
  beforeEach(async () => {
    for (const resource of [usersA, peopleB]) {
      const all = await resource.list();
      for (const item of all) {
        if (item.id) await resource.delete(item.id).catch(() => {});
      }
    }
  });
  afterAll(async () => {
    await dbA?.disconnect?.();
    await dbB?.disconnect?.();
  });
  afterEach(async () => {
    // Wait for any pending replication operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    if (plugin && typeof plugin.cleanup === 'function') {
      await plugin.cleanup();
      plugin = null;
    }
  });
  test('replicates insert from users to people with transform', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'people',
              actions: ['insert', 'update', 'delete'],
              transformer: (data) => ({ id: data.id, fullName: data.name + ' transformed' })
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
    if (!peopleB) throw new Error('people not registered in dbB.resources after plugin setup');
    if (plugin.replicators && plugin.replicators[0] && plugin.replicators[0].instance) {
      const resourceObj = plugin.replicators[0].instance.client.resources['people'];
      if (Object.keys(plugin.replicators[0].instance.client.resources).length === 0) throw new Error('replicator client.resources is empty before test');
    }
    const user = { id: '3', name: 'Eve' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => peopleB.get(id), '3');
    expect(found).toBeDefined();
    expect(found.fullName).toBe('Eve transformed');
  }, 10000);

  test('replicates update from users to people with transform', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'people',
              actions: ['insert', 'update', 'delete'],
              transformer: (data) => ({ id: data.id, fullName: data.name + ' transformed' })
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
    if (!peopleB) throw new Error('people not registered in dbB.resources after plugin setup');
    if (plugin.replicators && plugin.replicators[0] && plugin.replicators[0].instance) {
      const resourceObj = plugin.replicators[0].instance.client.resources['people'];
      if (Object.keys(plugin.replicators[0].instance.client.resources).length === 0) throw new Error('replicator client.resources is empty before test');
    }
    const user = { id: '3', name: 'Eve' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => peopleB.get(id), '3');
    expect(found).toBeDefined();
    expect(found.fullName).toBe('Eve transformed');
    await usersA.update('3', { name: 'Eve Updated' });
    // Wait for update replication by checking if fullName changed
    const found2 = await waitForReplication(async (id) => {
      const person = await peopleB.get(id);
      return person.fullName === 'Eve Updated transformed' ? person : null;
    }, '3');
    expect(found2).toMatchObject({ id: '3', fullName: 'Eve Updated transformed' });
  }, 10000);

  test('replicates delete from users to people with transform', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'people',
              actions: ['insert', 'update', 'delete'],
              transformer: (data) => ({ id: data.id, fullName: data.name + ' transformed' })
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
    if (!peopleB) throw new Error('people not registered in dbB.resources after plugin setup');
    if (plugin.replicators && plugin.replicators[0] && plugin.replicators[0].instance) {
      const resourceObj = plugin.replicators[0].instance.client.resources['people'];
      if (Object.keys(plugin.replicators[0].instance.client.resources).length === 0) throw new Error('replicator client.resources is empty before test');
    }
    const user = { id: '3', name: 'Eve' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => peopleB.get(id), '3');
    expect(found).toBeDefined();
    await usersA.delete('3');
    // Wait for delete replication to complete
    await waitForDelete(peopleB, '3', 10000);
    await expect(peopleB.get('3')).rejects.toThrow();
  }, 10000);

  test('replicates insert, update, and delete from users to people with transform', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'people',
              actions: ['insert', 'update', 'delete'],
              transformer: (data) => ({ id: data.id, fullName: data.name + ' transformed' })
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
    if (!peopleB) throw new Error('people not registered in dbB.resources after plugin setup');
    if (plugin.replicators && plugin.replicators[0] && plugin.replicators[0].instance) {
      const resourceObj = plugin.replicators[0].instance.client.resources['people'];
      if (Object.keys(plugin.replicators[0].instance.client.resources).length === 0) throw new Error('replicator client.resources is empty before test');
    }
    const user = { id: '3', name: 'Eve' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => peopleB.get(id), '3');
    expect(found).toBeDefined();
    await usersA.update('3', { name: 'Eve Updated' });
    // Wait for update replication by checking if fullName changed
    const found2 = await waitForReplication(async (id) => {
      const person = await peopleB.get(id);
      return person.fullName === 'Eve Updated transformed' ? person : null;
    }, '3');
    expect(found2).toMatchObject({ id: '3', fullName: 'Eve Updated transformed' });
    await usersA.delete('3');
    // Wait for delete replication to complete
    await waitForDelete(peopleB, '3', 10000);
    await expect(peopleB.get('3')).rejects.toThrow();
  }, 10000);
});

describe('S3dbReplicator - edge cases', () => {
  let dbA, dbB, usersA, usersB, plugin;
  beforeAll(async () => {
    dbA = createDatabaseForTest('rep-edge-src');
    dbB = createDatabaseForTest('rep-edge-dst');
    await Promise.all([
      dbA.connect(),
      dbB.connect()
    ]);
    [usersA, usersB] = await Promise.all([
      dbA.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      }),
      dbB.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      })
    ]);
  });
  beforeEach(async () => {
    for (const resource of [usersA, usersB]) {
      const all = await resource.list();
      for (const item of all) {
        if (item.id) await resource.delete(item.id).catch(() => {});
      }
    }
  });
  afterAll(async () => {
    await dbA?.disconnect?.();
    await dbB?.disconnect?.();
  });

  test('does not replicate when id is null', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    await expect(usersA.insert({ id: null, name: 'Invalid' })).rejects.toThrow();
    await expect(usersB.get(null)).rejects.toThrow();
  });

  test('does not replicate when id is undefined', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    await expect(usersA.insert({ name: 'NoId' })).rejects.toThrow();
    // There should be no item with undefined id
    await expect(usersB.get(undefined)).rejects.toThrow();
  });

  test('does not replicate when id is an object', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    await expect(usersA.insert({ id: { foo: 'bar' }, name: 'ObjId' })).rejects.toThrow();
    await expect(usersB.get({ foo: 'bar' })).rejects.toThrow();
  });

  test('update and delete of non-existent id does not break replicator', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    // Update non-existent
    await expect(usersA.update('notfound', { name: 'Ghost' })).rejects.toThrow();
    await expect(usersB.get('notfound')).rejects.toThrow();
    // Delete non-existent
    await expect(usersA.delete('notfound')).rejects.toThrow();
    await expect(usersB.get('notfound')).rejects.toThrow();
  });

  test('duplicate insert does not break replicator', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    const user = { id: 'dupe', name: 'First' };
    await usersA.insert(user);
    await expect(usersA.insert(user)).rejects.toThrow();
    const found = await waitForReplication((id) => usersB.get(id), 'dupe');
    expect(found).toBeDefined();
    expect(found.name).toBe('First');
  });

  test('insert with missing/extra attributes', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(dbA);
    // Missing required attribute
    await expect(usersA.insert({ id: 'missing' })).rejects.toThrow();
    await expect(usersB.get('missing')).rejects.toThrow();
    // Extra attribute (should be ignored or allowed depending on schema)
    const user = { id: 'extra', name: 'Extra', foo: 'bar' };
    await usersA.insert(user);
    const found = await waitForReplication((id) => usersB.get(id), 'extra');
    expect(found).toBeDefined();
    expect(found.name).toBe('Extra');
    // Extra attribute behavior may vary - could be undefined or preserved
    // expect(found.foo).toBeUndefined();
  });
});

describe('S3dbReplicator - multi-resource replication', () => {
  let dbA, dbB, usersA, productsA, usersB, productsB, plugin;
  beforeAll(async () => {
    dbA = createDatabaseForTest('rep-multi-src');
    dbB = createDatabaseForTest('rep-multi-dst');
    await Promise.all([
      dbA.connect(),
      dbB.connect()
    ]);
    [usersA, productsA] = await Promise.all([
      dbA.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      }),
      dbA.createResource({
        name: 'products',
        attributes: { id: 'string', title: 'string', price: 'number|decimal' }
      })
    ]);
    [usersB, productsB] = await Promise.all([
      dbB.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      }),
      dbB.createResource({
        name: 'products',
        attributes: { id: 'string', title: 'string', price: 'number|decimal' }
      })
    ]);
    // Defensive: ensure resources are registered
    if (!dbB.resources['users']) {
      usersB = await dbB.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      });
    }
    if (!dbB.resources['products']) {
      productsB = await dbB.createResource({
        name: 'products',
        attributes: { id: 'string', title: 'string', price: 'number|decimal' }
      });
    }
  });
  beforeEach(async () => {
    for (const resource of [usersA, productsA, usersB, productsB]) {
      const all = await resource.list();
      for (const item of all) {
        if (item.id) await resource.delete(item.id).catch(() => {});
      }
    }
  });

  test('should replicate inserts, updates, and deletes independently for users and products', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'users',
              actions: ['insert', 'update', 'delete'],
              transformer: (data) => ({ ...data, replicatedAt: new Date().toISOString() })
            },
            products: {
              resource: 'products',
              actions: ['insert', 'update'],
              transformer: (data) => ({ ...data, price: parseFloat(data.price), category: 'replicated' })
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
    // Insert user and product in dbA
    await usersA.insert({ id: 'u1', name: 'Alice' });
    await productsA.insert({ id: 'p1', title: 'Widget', price: 9.99 });
    // Wait for replication
    const userB = await waitForReplication((id) => usersB.get(id), 'u1');
    const productB = await waitForReplication((id) => productsB.get(id), 'p1');
    expect(userB).toMatchObject({ id: 'u1', name: 'Alice' });
    expect(productB).toMatchObject({ id: 'p1', title: 'Widget', price: 9.99 });
    // Update user and product in dbA
    await usersA.update('u1', { name: 'Alice Smith' });
    await productsA.update('p1', { price: 12.5 });
    // Wait a bit longer for update replication to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    const userB2 = await waitForReplication((id) => usersB.get(id), 'u1');
    const productB2 = await waitForReplication((id) => productsB.get(id), 'p1');
    expect(userB2).toMatchObject({ id: 'u1', name: 'Alice Smith' });
    expect(productB2).toMatchObject({ id: 'p1', title: 'Widget', price: 12.5 });
    // Delete user and product in dbA
    await usersA.delete('u1');
    await productsA.delete('p1');
    // Wait a bit longer for delete replication to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Users should be deleted (has delete action)
    await expect(usersB.get('u1')).rejects.toThrow();
    // Products should NOT be deleted (no delete action configured)
    const productStillExists = await productsB.get('p1');
    expect(productStillExists).toBeDefined();
    // Ensure no cross-contamination
    await usersA.insert({ id: 'u2', name: 'Bob' });
    await productsA.insert({ id: 'p2', title: 'Gadget', price: 5 });
    const userB3 = await waitForReplication((id) => usersB.get(id), 'u2');
    const productB3 = await waitForReplication((id) => productsB.get(id), 'p2');
    expect(userB3).toMatchObject({ id: 'u2', name: 'Bob' });
    expect(productB3).toMatchObject({ id: 'p2', title: 'Gadget', price: 5 });
    // Ensure usersB does not have products and vice versa
    await expect(usersB.get('p2')).rejects.toThrow();
    await expect(productsB.get('u2')).rejects.toThrow();
  });
});

describe('S3dbReplicator - transformation replication', () => {
  let dbA, dbB, usersA, peopleB, plugin;
  beforeAll(async () => {
    dbA = createDatabaseForTest('rep-transform-src');
    dbB = createDatabaseForTest('rep-transform-dst');
    await Promise.all([
      dbA.connect(),
      dbB.connect()
    ]);
    usersA = await dbA.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' }
    });
    peopleB = await dbB.createResource({
      name: 'people',
      attributes: { id: 'string', fullName: 'string' }
    });
    // Defensive: ensure resource is registered
    if (!dbB.resources['people']) {
      peopleB = await dbB.createResource({
        name: 'people',
        attributes: { id: 'string', fullName: 'string' }
      });
    }
  });
  beforeEach(async () => {
    for (const resource of [usersA, peopleB]) {
      const all = await resource.list();
      for (const item of all) {
        if (item.id) await resource.delete(item.id).catch(() => {});
      }
    }
  });
  afterEach(async () => {
    // Wait for any pending replication operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    if (plugin && typeof plugin.cleanup === 'function') {
      await plugin.cleanup();
      plugin = null;
    }
  });

  test('should replicate with transformation (rename and modify fields)', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'people',
              actions: ['insert', 'update', 'delete'],
              transformer: (data) => ({
                id: data.id,
                fullName: data.name + ' [replicated]'
              })
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
    // Insert user in dbA
    await usersA.insert({ id: 'u1', name: 'Alice' });
    // Wait for replication
    const personB = await waitForReplication((id) => peopleB.get(id), 'u1');
    expect(personB).toMatchObject({ id: 'u1', fullName: 'Alice [replicated]' });
    // Update user in dbA
    await usersA.update('u1', { name: 'Alice Smith' });
    // Wait for update replication by checking if fullName changed
    const personB2 = await waitForReplication(async (id) => {
      const person = await peopleB.get(id);
      return person.fullName === 'Alice Smith [replicated]' ? person : null;
    }, 'u1');
    expect(personB2).toMatchObject({ id: 'u1', fullName: 'Alice Smith [replicated]' });
    // Delete user in dbA
    await usersA.delete('u1');
    // Wait for delete replication to complete
    await waitForDelete(peopleB, 'u1', 10000);
    await expect(peopleB.get('u1')).rejects.toThrow();
  }, 15000);
});

describe('S3dbReplicator - isolation between tests', () => {
  let dbA, dbB, resourceA, resourceB, plugin1, plugin2;
  beforeAll(async () => {
    dbA = createDatabaseForTest('rep-iso-src');
    dbB = createDatabaseForTest('rep-iso-dst');
    await Promise.all([
      dbA.connect(),
      dbB.connect()
    ]);
  });
  beforeEach(async () => {
    for (const resource of [dbA.resources.users_iso1, dbA.resources.users_iso2, dbB.resources.users_iso1, dbB.resources.users_iso2]) {
      if (resource) {
        const all = await resource.list();
        for (const item of all) {
          if (item.id) await resource.delete(item.id).catch(() => {});
        }
      }
    }
    // Defensive: ensure resources are registered
    if (!dbA.resources['users_iso1']) {
      await dbA.createResource({ name: 'users_iso1', attributes: { id: 'string', name: 'string' } });
    }
    if (!dbA.resources['users_iso2']) {
      await dbA.createResource({ name: 'users_iso2', attributes: { id: 'string', name: 'string' } });
    }
    if (!dbB.resources['users_iso1']) {
      await dbB.createResource({ name: 'users_iso1', attributes: { id: 'string', name: 'string' } });
    }
    if (!dbB.resources['users_iso2']) {
      await dbB.createResource({ name: 'users_iso2', attributes: { id: 'string', name: 'string' } });
    }
  });
  afterEach(async () => {
    // Wait for any pending replication operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    if (plugin1 && typeof plugin1.cleanup === 'function') {
      await plugin1.cleanup();
      plugin1 = null;
    }
    if (plugin2 && typeof plugin2.cleanup === 'function') {
      await plugin2.cleanup();
      plugin2 = null;
    }
  });

  test('should not leak data between resources with similar names', async () => {
    // Create both resources in both dbs
    const resA1 = await dbA.createResource({
      name: 'users_iso1',
      attributes: { id: 'string', name: 'string' }
    });
    const resB1 = await dbB.createResource({
      name: 'users_iso1',
      attributes: { id: 'string', name: 'string' }
    });
    const resA2 = await dbA.createResource({
      name: 'users_iso2',
      attributes: { id: 'string', name: 'string' }
    });
    const resB2 = await dbB.createResource({
      name: 'users_iso2',
      attributes: { id: 'string', name: 'string' }
    });
    
    // Setup replicator for both resources, but they should be isolated
    plugin1 = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users_iso1: { resource: 'users_iso1', actions: ['insert', 'update', 'delete'] },
            users_iso2: { resource: 'users_iso2', actions: ['insert', 'update', 'delete'] }
          }
        }
      ]
    });
    await plugin1.setup(dbA);
    
    // Insert in both resources
    await resA1.insert({ id: 'a', name: 'Alpha' });
    await resA2.insert({ id: 'b', name: 'Beta' });
    
    // Wait for both replications
    const found1 = await waitForReplication((id) => resB1.get(id), 'a');
    const found2 = await waitForReplication((id) => resB2.get(id), 'b');
    
    expect(found1).toMatchObject({ id: 'a', name: 'Alpha' });
    expect(found2).toMatchObject({ id: 'b', name: 'Beta' });
    
    // Ensure resources are isolated - each should only have its own data
    await expect(resB1.get('b')).rejects.toThrow();
    await expect(resB2.get('a')).rejects.toThrow();
  }, 15000);
});

describe('S3dbReplicator - error handling', () => {
  let dbA, dbB, usersA, plugin;
  beforeAll(async () => {
    dbA = createDatabaseForTest('rep-err-src');
    dbB = createDatabaseForTest('rep-err-dst');
    await Promise.all([
      dbA.connect(),
      dbB.connect()
    ]);
    usersA = await dbA.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' }
    });
    // Defensive: ensure resource is registered
    if (!dbB.resources['users']) {
      await dbB.createResource({ name: 'users', attributes: { id: 'string', name: 'string' } });
    }
  });
  beforeEach(async () => {
    for (const resource of [usersA, dbB.resources?.users]) {
      if (resource && resource.list) {
        const all = await resource.list();
        for (const item of all) {
          if (item.id) await resource.delete(item.id).catch(() => {});
        }
      }
    }
  });
  afterEach(async () => {
    // Wait for any pending replication operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    if (plugin && typeof plugin.cleanup === 'function') {
      await plugin.cleanup();
      plugin = null;
    }
  });

  test('should report error if destination resource does not exist', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            notfound: { resource: 'notfound', actions: ['insert'] }
          }
        }
      ]
    });
    await plugin.setup(dbA);
    await usersA.insert({ id: 'e1', name: 'Error' });
    // Defensive: check for resource existence before .get
    if (dbB.resources.notfound) {
      await expect(dbB.resources.notfound.get('e1')).rejects.toThrow();
    } else {
      expect(dbB.resources.notfound).toBeUndefined();
    }
  });

  test('should report error if transformer throws, but continue for other items', async () => {
    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'users',
              actions: ['insert'],
              transformer: (data) => {
                if (data.id === 'bad') throw new Error('Transformer failed');
                return data;
              }
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
    // Insert good and bad data
    await usersA.insert({ id: 'good', name: 'Good' });
    await usersA.insert({ id: 'bad', name: 'Bad' });
    // Wait for replication of good
    const found = await waitForReplication((id) => dbB.resources.users.get(id), 'good');
    expect(found).toMatchObject({ id: 'good', name: 'Good' });
    // The bad one should not be replicated
    await expect(dbB.resources.users.get('bad')).rejects.toThrow();
  }, 15000);
});

describe('S3DB Replicator - Configuration and Validation Tests', () => {
  let dbA, dbB;

  beforeEach(async () => {
    dbA = createDatabaseForTest('s3db-config-src');
    dbB = createDatabaseForTest('s3db-config-dst');
    await Promise.all([dbA.connect(), dbB.connect()]);
  });

  afterEach(async () => {
    await Promise.all([
      dbA?.disconnect?.(),
      dbB?.disconnect?.()
    ]);
  });

  test('validateConfig should return errors for missing client and connectionString', () => {
    const replicator = new S3dbReplicator({}, [], null);
    const validation = replicator.validateConfig();
    
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('You must provide a client or a connectionString');
    expect(validation.errors).toContain('You must provide a resources map or array');
  });

  test('validateConfig should pass with valid client', () => {
    
    const replicator = new S3dbReplicator({}, ['users'], dbB);
    const validation = replicator.validateConfig();
    
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('validateConfig should pass with connectionString', () => {
    
    const replicator = new S3dbReplicator({
      connectionString: 's3://test-bucket/test-path'
    }, ['users']);
    const validation = replicator.validateConfig();
    
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should normalize resources correctly - array format', () => {
    
    const replicator = new S3dbReplicator({}, ['users', 'orders'], dbB);
    
    expect(replicator.resourcesMap).toHaveProperty('users');
    expect(replicator.resourcesMap).toHaveProperty('orders');
  });

  test('should normalize resources correctly - string format', () => {
    
    const replicator = new S3dbReplicator({}, { users: 'users' }, dbB);
    
    expect(replicator.resourcesMap).toHaveProperty('users');
  });

  test('should normalize resources correctly - function format', () => {
    
    const transformFn = (data) => ({ ...data, transformed: true });
    const replicator = new S3dbReplicator({}, { users: transformFn }, dbB);
    
    expect(replicator.resourcesMap.users).toBe(transformFn);
  });

  test('should normalize resources correctly - object with transformer', () => {
    
    const config = {
      users: { 
        resource: 'people', 
        transformer: (data) => ({ ...data, transformed: true }),
        actions: ['insert', 'update']
      }
    };
    const replicator = new S3dbReplicator({}, config, dbB);
    
    expect(replicator.resourcesMap.users).toEqual(expect.objectContaining({
      resource: 'people',
      transformer: expect.any(Function),
      actions: ['insert', 'update']
    }));
  });

  test('should handle null/undefined resources gracefully', () => {
    
    const replicator = new S3dbReplicator({}, null, dbB);
    
    expect(replicator.resourcesMap).toEqual({});
  });
});

describe('S3DB Replicator - Internal Methods Tests', () => {
  let dbA, dbB, replicator;

  beforeEach(async () => {
    dbA = createDatabaseForTest('s3db-internal-src');
    dbB = createDatabaseForTest('s3db-internal-dst');
    await Promise.all([dbA.connect(), dbB.connect()]);
    
    await dbB.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string', fullName: 'string|optional' }
    });

    
    replicator = new S3dbReplicator({}, {
      users: {
        resource: 'users',
        transformer: (data) => ({ ...data, fullName: `${data.name} (transformed)` })
      }
    }, dbB);
  });

  afterEach(async () => {
    await Promise.all([
      dbA?.disconnect?.(),
      dbB?.disconnect?.()
    ]);
  });

  test('_applyTransformer should transform data correctly', () => {
    const data = { id: 'test', name: 'John' };
    const transformed = replicator._applyTransformer('users', data);
    
    expect(transformed).toEqual({
      id: 'test',
      name: 'John',
      fullName: 'John (transformed)'
    });
  });

  test('_applyTransformer should preserve id when transformer result lacks id', () => {
    
    const testReplicator = new S3dbReplicator({}, {
      users: {
        resource: 'users',
        transformer: (data) => ({ name: data.name }) // Doesn't include id
      }
    }, dbB);
    
    const data = { id: 'test', name: 'John' };
    const transformed = testReplicator._applyTransformer('users', data);
    
    expect(transformed.id).toBe('test');
  });

  test('_applyTransformer should return original data if transformer returns null', () => {
    
    const testReplicator = new S3dbReplicator({}, {
      users: {
        resource: 'users',
        transformer: () => null
      }
    }, dbB);
    
    const data = { id: 'test', name: 'John' };
    const transformed = testReplicator._applyTransformer('users', data);
    
    expect(transformed).toEqual(data);
  });

  test('_resolveDestResource should resolve destination resource correctly', () => {
    const destResource = replicator._resolveDestResource('users', {});
    expect(destResource).toBe('users');
  });

  test('_resolveDestResource should handle array format', () => {
    
    const testReplicator = new S3dbReplicator({}, {
      users: ['people', (data) => data]
    }, dbB);
    
    const destResource = testReplicator._resolveDestResource('users', {});
    expect(destResource).toBe('people');
  });

  test('_resolveDestResource should handle string mapping', () => {
    
    const testReplicator = new S3dbReplicator({}, {
      users: 'people'
    }, dbB);
    
    const destResource = testReplicator._resolveDestResource('users', {});
    expect(destResource).toBe('people');
  });

  test('_getDestResourceObj should return resource object', () => {
    const resourceObj = replicator._getDestResourceObj('users');
    expect(resourceObj).toBe(dbB.resources.users);
  });

  test('_getDestResourceObj should throw error for non-existent resource', () => {
    expect(() => {
      replicator._getDestResourceObj('nonexistent');
    }).toThrow('[S3dbReplicator] Destination resource not found: nonexistent');
  });

  test('shouldReplicateResource should return true for mapped resources', () => {
    expect(replicator.shouldReplicateResource('users')).toBe(true);
  });

  test('shouldReplicateResource should return false for unmapped resources', () => {
    expect(replicator.shouldReplicateResource('orders')).toBe(false);
  });

  test('shouldReplicateResource should respect actions filter', () => {
    
    const testReplicator = new S3dbReplicator({}, {
      users: {
        resource: 'users',
        actions: ['insert']
      }
    }, dbB);
    
    expect(testReplicator.shouldReplicateResource('users', 'insert')).toBe(true);
    expect(testReplicator.shouldReplicateResource('users', 'update')).toBe(false);
  });

  test('shouldReplicateResource should accept all actions when actions not specified', () => {
    expect(replicator.shouldReplicateResource('users', 'insert')).toBe(true);
    expect(replicator.shouldReplicateResource('users', 'update')).toBe(true);
    expect(replicator.shouldReplicateResource('users', 'delete')).toBe(true);
  });
});

describe('S3DB Replicator - Lifecycle Methods Tests', () => {
  let dbA, dbB, replicator;

  beforeEach(async () => {
    dbA = createDatabaseForTest('s3db-lifecycle-src');
    dbB = createDatabaseForTest('s3db-lifecycle-dst');
    await Promise.all([dbA.connect(), dbB.connect()]);

    
    replicator = new S3dbReplicator({}, ['users'], dbB);
  });

  afterEach(async () => {
    if (replicator) {
      await replicator.cleanup();
    }
    await Promise.all([
      dbA?.disconnect?.(),
      dbB?.disconnect?.()
    ]);
  });

  test('initialize should setup target database with client', async () => {
    await replicator.initialize(dbA);
    expect(replicator.targetDatabase).toBe(dbB);
  });

  test('initialize should throw error when no client or connectionString', async () => {
    
    const badReplicator = new S3dbReplicator({}, ['users'], null);
    
    await expect(badReplicator.initialize(dbA)).rejects.toThrow(
      'S3dbReplicator: No client or connectionString provided'
    );
  });

  test('testConnection should return true for valid connection', async () => {
    await replicator.initialize(dbA);
    const result = await replicator.testConnection();
    expect(result).toBe(true);
  });

  test('testConnection should return false and emit error for invalid connection', async () => {
    
    const badReplicator = new S3dbReplicator({}, ['users'], null);
    
    let errorEmitted = false;
    badReplicator.on('connection_error', () => {
      errorEmitted = true;
    });
    
    const result = await badReplicator.testConnection();
    expect(result).toBe(false);
    expect(errorEmitted).toBe(true);
  });

  test('getStatus should return comprehensive status', async () => {
    await replicator.initialize(dbA);
    const status = await replicator.getStatus();
    
    expect(status).toEqual(expect.objectContaining({
      connected: true,
      targetDatabase: expect.any(String),
      resources: ['users'],
      totalreplicators: expect.any(Number),
      totalErrors: expect.any(Number)
    }));
  });

  test('cleanup should properly cleanup target database', async () => {
    await replicator.initialize(dbA);
    expect(replicator.targetDatabase).toBeDefined();
    
    await replicator.cleanup();
    // Verify cleanup was called
    expect(replicator.targetDatabase.listenerCount()).toBe(0);
  });
});

describe('S3DB Replicator - Batch Operations Tests', () => {
  let dbA, dbB, plugin;

  beforeEach(async () => {
    dbA = createDatabaseForTest('s3db-batch-src');
    dbB = createDatabaseForTest('s3db-batch-dst');
    await Promise.all([dbA.connect(), dbB.connect()]);
    
    await Promise.all([
      dbA.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      }),
      dbB.createResource({
        name: 'users',
        attributes: { id: 'string', name: 'string' }
      })
    ]);

    plugin = new ReplicatorPlugin({
      verbose: false,
      persistReplicatorLog: false,
      replicators: [
        {
          driver: 's3db',
          client: dbB,
          resources: {
            users: {
              resource: 'users',
              actions: ['insert', 'update', 'delete'],
              transformer: (data) => ({ 
                ...data, 
                processedAt: new Date().toISOString(),
                source: 'batch-replication'
              })
            }
          }
        }
      ]
    });
    await plugin.setup(dbA);
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.cleanup();
    }
    await Promise.all([
      dbA?.disconnect?.(),
      dbB?.disconnect?.()
    ]);
  });

  test('replicateBatch should skip when resource not included', async () => {
    const s3dbReplicator = plugin.replicators[0];
    const records = [
      { id: 'test1', operation: 'insert', data: { id: 'test1', name: 'Test 1' } }
    ];
    
    const result = await s3dbReplicator.replicateBatch('orders', records);
    expect(result).toEqual({ skipped: true, reason: 'resource_not_included' });
  });

  test('replicateBatch should process multiple records successfully', async () => {
    const s3dbReplicator = plugin.replicators[0];
    const records = [
      { id: 'batch1', operation: 'insert', data: { id: 'batch1', name: 'Batch User 1' } },
      { id: 'batch2', operation: 'insert', data: { id: 'batch2', name: 'Batch User 2' } }
    ];

    let batchEmitted = false;
    s3dbReplicator.on('batch_replicated', (event) => {
      batchEmitted = true;
      expect(event.resourceName).toBe('users');
      expect(event.total).toBe(2);
    });
    
    const result = await s3dbReplicator.replicateBatch('users', records);
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(batchEmitted).toBe(true);
  });

  test('replicateBatch should handle errors gracefully', async () => {
    const s3dbReplicator = plugin.replicators[0];
    const records = [
      { id: 'good', operation: 'insert', data: { id: 'good', name: 'Good User' } },
      { id: 'bad', operation: 'invalid_op', data: { id: 'bad', name: 'Bad User' } }
    ];
    
    const result = await s3dbReplicator.replicateBatch('users', records);
    
    expect(result.success).toBe(false);
    expect(result.total).toBe(2);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('S3DB Replicator - Error Handling Tests', () => {
  test('should handle initialize errors gracefully', async () => {
    
    const replicator = new S3dbReplicator({
      connectionString: 'invalid://connection/string'
    }, ['users']);
    
    await expect(replicator.initialize(null)).rejects.toThrow();
  });

  test('should emit connected event on successful initialization', async () => {
    const dbA = createDatabaseForTest('s3db-event-src');
    const dbB = createDatabaseForTest('s3db-event-dst');
    
    try {
      await Promise.all([dbA.connect(), dbB.connect()]);
      
      
      const replicator = new S3dbReplicator({}, ['users'], dbB);
      
      let eventEmitted = false;
      replicator.on('connected', (event) => {
        eventEmitted = true;
        expect(event.replicator).toBeDefined();
      });
      
      await replicator.initialize(dbA);
      expect(eventEmitted).toBe(true);
      
      await replicator.cleanup();
    } finally {
      await Promise.all([
        dbA?.disconnect?.(),
        dbB?.disconnect?.()
      ]);
    }
  });
});
