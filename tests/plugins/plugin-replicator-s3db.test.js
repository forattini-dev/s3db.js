import { createDatabaseForTest, sleep } from '../config.js';
import { ReplicatorPlugin } from '#src/plugins/replicator.plugin.js';
import S3dbReplicator from '#src/plugins/replicators/s3db-replicator.class.js';

// Add utility polling function to wait for replication - OPTIMIZED
async function waitForReplication(getFn, id, { timeout = 500, interval = 25 } = {}) {
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

async function waitForDelete(resource, id, timeout = 300) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await resource.get(id);
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.code === 'NoSuchKey') return true;
    }
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('Resource was not deleted in time');
}

// --- OPTIMIZED: Single comprehensive test suite instead of multiple ---
describe('S3dbReplicator - Comprehensive Integration Tests', () => {
  let dbA, dbB, plugin;
  
  beforeEach(async () => {
    dbA = createDatabaseForTest('suite=plugins/replicator-s3db-src');
    dbB = createDatabaseForTest('suite=plugins/replicator-s3db-dst');
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
    
    plugin = new ReplicatorPlugin({
      logLevel: 'silent',
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
    await plugin.install(dbA);
  });

  afterEach(async () => {
    // Reduced wait time
    await new Promise(resolve => setTimeout(resolve, 200));
    if (plugin && typeof plugin.stop === 'function') {
      await plugin.stop();
      plugin = null;
    }
  });

  test('sanity check: insert/get direct in destination resource', async () => {
    const user = { id: 'sanity', name: 'Sanity Check' }
    await dbB.resources['users'].insert(user)
    const found = await dbB.resources['users'].get('sanity')
    expect(found).toMatchObject(user)
  })

  test('replicates insert from users to users', async () => {
    const user = { id: 'user1', name: 'John Doe' };
    await dbA.resources['users'].insert(user);
    
    const replicated = await waitForReplication(
      () => dbB.resources['users'].get('user1'),
      'user1',
      { timeout: 500 }
    );
    expect(replicated).toMatchObject(user);
  });

  test('replicates update from users to users', async () => {
    const user = { id: 'user2', name: 'Jane Doe' };
    await dbA.resources['users'].insert(user);
    
    // Wait for initial replication
    await waitForReplication(
      () => dbB.resources['users'].get('user2'),
      'user2',
      { timeout: 500 }
    );
    
    // Update
    await dbA.resources['users'].update('user2', { name: 'Jane Updated' });
    
    // Wait longer for update replication
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const updated = await waitForReplication(
      () => dbB.resources['users'].get('user2'),
      'user2',
      { timeout: 1000 }
    );
    expect(updated.name).toBe('Jane Updated');
  });

  test('replicates delete from users to users', async () => {
    const user = { id: 'user3', name: 'Bob Smith' };
    await dbA.resources['users'].insert(user);
    
    // Wait for initial replication
    await waitForReplication(
      () => dbB.resources['users'].get('user3'),
      'user3',
      { timeout: 500 }
    );
    
    // Delete
    await dbA.resources['users'].delete('user3');
    
    // Wait for deletion
    await waitForDelete(dbB.resources['users'], 'user3', 300);
    
    // Verify deletion
    try {
      await dbB.resources['users'].get('user3');
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err.name).toBe('NoSuchKey');
    }
  });

  test('handles edge cases gracefully', async () => {
    // Test null/undefined id handling
    try {
      await dbA.resources['users'].insert({ id: null, name: 'Test' });
    } catch (err) {
      expect(err).toBeDefined();
    }
    
    // Test non-existent id update/delete - these should throw errors
    try {
      await dbA.resources['users'].update('non-existent', { name: 'Test' });
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err.message).toContain("does not exist");
    }
    
    try {
      await dbA.resources['users'].delete('non-existent');
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err.message).toContain("No such key");
    }
  });

  test('validates configuration correctly', () => {
    const replicator = new S3dbReplicator({}, {
      users: { resource: 'users', actions: ['insert'] }
    });

    expect(replicator.shouldReplicateResource('users', 'insert')).toBe(true);
    expect(replicator.shouldReplicateResource('users', 'update')).toBe(false);
    expect(replicator.shouldReplicateResource('products', 'insert')).toBe(false);
  });

  test('uses targetDatabase when accessing resources (not client)', async () => {
    const replicator = new S3dbReplicator(
      { connectionString: dbB.options.connectionString },
      { users: 'users' }
    );

    replicator.targetDatabase = dbB;

    // This should work using targetDatabase, not this.client
    const resourceObj = replicator._getDestResourceObj('users');
    expect(resourceObj).toBeDefined();
    expect(resourceObj.name).toBe('users');
  });

  test('skips replication when enabled is false', async () => {
    const replicator = new S3dbReplicator({}, { users: 'users' }, dbB);
    replicator.targetDatabase = dbB;
    replicator.enabled = false;

    const result = await replicator.replicateBatch('users', [
      { id: '1', operation: 'insert', data: { id: '1', name: 'Test' } }
    ]);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('replicator_disabled');
  });
});
