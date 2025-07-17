import { createDatabaseForTest, sleep } from './config.js';
import { ReplicatorPlugin } from '#src/plugins/replicator.plugin.js';

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

describe('simple replication tests', () => {
  let sourceDb;
  let destDb;

  beforeEach(async () => {
    sourceDb = createDatabaseForTest('source-db-simple');
    destDb = createDatabaseForTest('dest-db-simple');

    await Promise.all([
      sourceDb.connect(),
      destDb.connect()
    ]);

    const resource = {
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      }
    };

    await Promise.all([
      sourceDb.createResource(resource),
      destDb.createResource(resource)
    ]);

    // Explicitly set database property for event listener installation
    sourceDb.resources.users.database = sourceDb;
    destDb.resources.users.database = destDb;

    const replicatorPlugin = new ReplicatorPlugin({
      verbose: true,
      persistReplicatorLog: true,
      replicators: [
        {
          driver: 's3db',
          client: destDb,
          resources: ['users']
        }
      ]
    });

    await replicatorPlugin.setup(sourceDb);
  });

  afterEach(async () => {
    await Promise.all([
      sourceDb.disconnect(),
      destDb.disconnect()
    ]);
  });

  test('should replicate inserted data from source to destination', async () => {
    const user = {
      name: 'Test User',
      email: 'test@example.com'
    }
    const srcUser = await sourceDb.resources.users.insert(user);
    await sleep(200);
    const destUser = await destDb.resources.users.get(srcUser.id);
    expect(destUser).toMatchObject(user);
  });

  test('should replicate 10 users', async () => {
    const users = Array.from({ length: 10 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@example.com`
    }))

    expect(users.length).toBe(10);
    await sourceDb.resources.users.insertMany(users);
    const c1 = await sourceDb.resources.users.count();
    
    await sleep(1*1000);
    const c2 = await destDb.resources.users.count();
    expect(c1).toBe(10);
    expect(c2).toBe(10);
  }, 22*1000);
});

describe('a bit more complex replication tests', () => {
  let sourceDb;
  let destDb;

  beforeEach(async () => {
    sourceDb = createDatabaseForTest('source-db-complex');
    destDb = createDatabaseForTest('dest-db-complex');

    await Promise.all([
      sourceDb.connect(),
      destDb.connect()
    ]);

    await Promise.all([
      sourceDb.createResource({
        name: 'users',
        attributes: {
          name: 'string|required',
          email: 'string|required'
        }
      }),
      destDb.createResource({
        name: 'users',
        attributes: {
          name: 'string|required',
          email: 'string|required',
          replicatedAt: 'date',
        }
      })
    ]);

    // Explicitly set database property for event listener installation
    sourceDb.resources.users.database = sourceDb;
    destDb.resources.users.database = destDb;

    const replicatorPlugin = new ReplicatorPlugin({
      replicators: [
        {
          driver: 's3db',
          client: destDb,
          resources: {
            users: {
              resource: 'users',
              actions: ['insert', 'update', 'delete'],
              transform: (el) => {
                const result = { ...el, id: el.id, replicatedAt: new Date() };
                return result;
              },
            }
          }
        }
      ]
    });

    await replicatorPlugin.setup(sourceDb);
  });

  afterEach(async () => {
    await Promise.all([
      sourceDb.disconnect(),
      destDb.disconnect()
    ]);
  });

  test('should replicate inserted data from source to destination', async () => {
    const user = {
      name: 'Test User',
      email: 'test@example.com'
    }
    sourceDb.resources.users.on('insert', (user) => {
    });
    destDb.resources.users.on('insert', (user) => {
    });

    const srcUser = await sourceDb.resources.users.insert(user);
    const destUser = await waitForReplication((id) => destDb.resources.users.get(id), srcUser.id);
    expect(destUser).toMatchObject(user);
  });

  test('should replicate 10 users', async () => {
    const users = Array.from({ length: 10 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@example.com`
    }))

    expect(users.length).toBe(10);
    await sourceDb.resources.users.insertMany(users);
    const c1 = await sourceDb.resources.users.count();
    
    // Wait for replication to complete by polling the count
    const start = Date.now();
    let c2 = 0;
    while (Date.now() - start < 10000) { // 10 second timeout
      c2 = await destDb.resources.users.count();
      if (c2 === 10) break;
      await sleep(200);
    }
    
    expect(c1).toBe(10);
    expect(c2).toBe(10);
  }, 22*1000);
});
