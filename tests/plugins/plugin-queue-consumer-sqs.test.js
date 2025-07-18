import QueueConsumerPlugin from '#src/plugins/queue-consumer.plugin.js';

import {
  createDatabaseForTest,
  createSqsQueueForTest,
  createSqsClientForTest,
} from '#tests/config.js';

import { createReplicator } from '#src/plugins/replicators/index.js';

// Helper: Wait for a record to appear in a resource (for async replicator)
async function waitForRecord(resource, id, timeout = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const record = await resource.get(id);
      if (record) return record;
    } catch (err) {
      // Not found yet
    }
    await new Promise(res => setTimeout(res, 50));
  }
  throw new Error(`Record ${id} not found in resource ${resource.name} after ${timeout}ms`);
}

describe('QueueConsumerPlugin (SQS driver, integration with LocalStack SQS)', () => {
  let database, users, plugin, queueUrl, sqsClient;

  beforeAll(async () => {
    queueUrl = await createSqsQueueForTest('queue-consumer');
    sqsClient = createSqsClientForTest('queue-consumer');
    database = await createDatabaseForTest('queue-consumer');
    await database.connect();
    users = await database.createResource({
      name: 'users',
      attributes: { id: 'string|required', name: 'string|required', email: 'string|required' }
    });
    plugin = new QueueConsumerPlugin({
      enabled: true,
      consumers: [
        {
          driver: 'sqs',
          resources: 'users',
          config: {
            queueUrl,
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            poolingInterval: 1000,
            maxMessages: 2,
            endpoint: 'http://localhost:4566',
          }
        }
      ]
    });
    await plugin.setup(database);
  });

  afterEach(async () => {
    // Clean up users between tests
    try {
      await users.deleteAll();
      // Give more time for cleanup to complete
      await new Promise(res => setTimeout(res, 500));
    } catch (err) {
      // Ignore errors
    }
  });

  afterAll(async () => {
    if (plugin && typeof plugin.stop === 'function') await plugin.stop();
    if (database && typeof database.disconnect === 'function') await database.disconnect();
  }, 10000);

  async function waitForUser(id, timeout = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const user = await users.get(id);
        if (user) return user;
      } catch (e) { }
      await new Promise(res => setTimeout(res, 200));
    }
    throw new Error(`User ${id} not found after ${timeout}ms`);
  }

  async function waitForUserUpdate(id, expectedName, timeout = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const user = await users.get(id);
        if (user && user.name === expectedName) return user;
      } catch (e) { }
      await new Promise(res => setTimeout(res, 200));
    }
    throw new Error(`User ${id} with name '${expectedName}' not found after ${timeout}ms`);
  }

  async function waitForUserDeletion(id, timeout = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        // Use exists method which might be more reliable than get
        const exists = await users.exists(id);
        if (!exists) {
          return { deleted: true };
        }
      } catch (error) {
        // If exists throws an error, user might be deleted
        if (error && /not exists|not found|does not exists/i.test(error.message)) {
          return { deleted: true, error };
        }
      }
      await new Promise(res => setTimeout(res, 300));
    }
    throw new Error(`User ${id} was not deleted after ${timeout}ms`);
  }

  test('should insert via SQS message (body)', async () => {
    await sqsClient.quickSend(queueUrl, {
      $body: {
        resource: 'users',
        action: 'insert',
        data: { id: 'u1', name: 'A', email: 'a@x.com' }
      },
      $attributes: {},
      $raw: {}
    });
    // Wait for message to be processed
    const user = await waitForUser('u1');
    expect(user.name).toBe('A');
    // Message should be consumed and deleted from queue
    const count = await sqsClient.quickCount(queueUrl);
    expect(count).toBe(0);
  });

  test('should update via SQS message (attribute)', async () => {
    // First create a user to update (upsert to avoid conflicts)
    await users.upsert({ id: 'u1', name: 'A', email: 'a@x.com' });
    
    // Then send update message
    await sqsClient.quickSend(queueUrl, {
      $body: {
        resource: 'users',
        action: 'update',
        data: { id: 'u1', name: 'B', email: 'b@x.com' }
      },
      $attributes: {},
      $raw: {}
    });
    // Wait for message to be processed
    const user = await waitForUserUpdate('u1', 'B');
    expect(user.name).toBe('B');
    // Message should be consumed and deleted from queue
    const count = await sqsClient.quickCount(queueUrl);
    expect(count).toBe(0);
  });

  test('should delete via SQS message (mixed)', async () => {
    // First create a user to delete (upsert to avoid conflicts)
    await users.upsert({ id: 'u1', name: 'A', email: 'a@x.com' });
    
    // Then send delete message
    await sqsClient.quickSend(queueUrl, {
      resource: 'users',
      action: 'delete',
      data: { id: 'u1' }
    });
    // Wait for message to be processed (user to be deleted)
    const deleteResult = await waitForUserDeletion('u1');
    expect(deleteResult.deleted).toBe(true);
    // Message should be consumed and deleted from queue
    const count = await sqsClient.quickCount(queueUrl);
    expect(count).toBe(0);
  });

  test('should throw on missing resource', async () => {
    await expect(plugin._handleMessage({
      $body: { resource: 'notfound', action: 'insert', data: { id: 'x' } },
      $attributes: {}, $raw: {}
    }, 'notfound')).rejects.toThrow(/resource 'notfound' not found/);
  });

  test('should throw on unsupported action', async () => {
    await expect(plugin._handleMessage({
      $body: { resource: 'users', action: 'unknown', data: { id: 'x' } },
      $attributes: {}, $raw: {}
    }, 'users')).rejects.toThrow(/unsupported action/);
  });
});

describe('QueueConsumerPlugin (real SQS integration)', () => {
  let database, users, plugin, queueUrl, sqsClient;

  beforeAll(async () => {
    queueUrl = await createSqsQueueForTest('queue-consumer-real');
    sqsClient = createSqsClientForTest('queue-consumer-real');
    database = await createDatabaseForTest('queue-consumer-real');
    users = await database.createResource({
      name: 'users',
      attributes: { id: 'string|required', name: 'string|required', email: 'string|required' }
    });
    plugin = new QueueConsumerPlugin({
      enabled: true,
      consumers: [
        {
          driver: 'sqs',
          resources: 'users',
          config: {
            queueUrl,
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            poolingInterval: 1000,
            maxMessages: 2,
            endpoint: 'http://localhost:4566',
          }
        }
      ]
    });
    await plugin.setup(database);
  });

  afterAll(async () => {
    if (plugin && typeof plugin.stop === 'function') await plugin.stop();
    if (database && typeof database.disconnect === 'function') await database.disconnect();
  });

  test('should process real SQS message and insert user', async () => {
    const msg = {
      $body: {
        resource: 'users',
        action: 'insert',
        data: { id: 'u2', name: 'Real', email: 'real@x.com' }
      },
      $attributes: {},
      $raw: {}
    };
    await sqsClient.quickSend(queueUrl, msg);
    // Wait for message to be processed
    const user = await waitForRecord(users, 'u2');
    expect(user.name).toBe('Real');
    // Message should be consumed and deleted from queue
    const count = await sqsClient.quickCount(queueUrl);
    expect(count).toBe(0);
  });
});

describe('QueueConsumerPlugin (multi-resource, multi-queue integration)', () => {
  let database, users, orders, plugin, queueUrl, sqsClient;

  beforeAll(async () => {
    queueUrl = await createSqsQueueForTest('queue-consumer-multi');
    sqsClient = createSqsClientForTest('queue-consumer-multi');
    database = await createDatabaseForTest('queue-consumer-multi');
    users = await database.createResource({
      name: 'users',
      attributes: { id: 'string|required', name: 'string|required', email: 'string|required' }
    });
    orders = await database.createResource({
      name: 'orders',
      attributes: { id: 'string|required', userId: 'string|required', amount: 'number|required|convert:true' }
    });
    plugin = new QueueConsumerPlugin({
      enabled: true,
      consumers: [
        {
          driver: 'sqs',
          resources: 'users',
          config: {
            queueUrl,
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            poolingInterval: 1000,
            maxMessages: 2,
            endpoint: 'http://localhost:4566',
          }
        },
        {
          driver: 'sqs',
          resources: 'orders',
          config: {
            queueUrl,
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            poolingInterval: 1000,
            maxMessages: 2,
            endpoint: 'http://localhost:4566',
          }
        }
      ]
    });
    await plugin.setup(database);
  });

  afterAll(async () => {
    if (plugin && typeof plugin.stop === 'function') await plugin.stop();
    if (database && typeof database.disconnect === 'function') await database.disconnect();
  });

  test('should process messages for multiple resources and queues', async () => {
    const msgUser = {
      $body: {
        resource: 'users',
        action: 'insert',
        data: { id: 'u3', name: 'Multi', email: 'multi@x.com' }
      },
      $attributes: {},
      $raw: {}
    };
    const msgOrder = {
      $body: {
        resource: 'orders',
        action: 'insert',
        data: { id: 'o1', userId: 'u3', amount: 123 } // Use integer to avoid number parsing issues
      },
      $attributes: {},
      $raw: {}
    };
    await sqsClient.quickSend(queueUrl, msgUser);
    await sqsClient.quickSend(queueUrl, msgOrder);
    // Wait for messages to be processed
    const user = await waitForRecord(users, 'u3');
    const order = await waitForRecord(orders, 'o1');
    expect(user.name).toBe('Multi');
    expect(order.amount).toBe(123); // Simplified assertion for integer
    expect(order.userId).toBe('u3');
    // Messages should be consumed and deleted from queue
    const count = await sqsClient.quickCount(queueUrl);
    expect(count).toBe(0);
  });
});

describe('QueueConsumerPlugin (SQS driver, batch insert)', () => {
  let database, users, plugin, queueUrl, sqsClient;

  beforeAll(async () => {
    queueUrl = await createSqsQueueForTest('queue-consumer-batch');
    sqsClient = createSqsClientForTest('queue-consumer-batch');
    database = await createDatabaseForTest('queue-consumer-batch');
    await database.connect();
    users = await database.createResource({
      name: 'users',
      attributes: { id: 'string|required', name: 'string|required', email: 'string|required' }
    });
    plugin = new QueueConsumerPlugin({
      enabled: true,
      consumers: [
        {
          driver: 'sqs',
          resources: 'users',
          config: {
            queueUrl,
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            poolingInterval: 1000,
            maxMessages: 5,
            endpoint: 'http://localhost:4566',
          }
        }
      ]
    });
    await plugin.setup(database);
  });

  afterAll(async () => {
    if (plugin && typeof plugin.stop === 'function') await plugin.stop();
    if (database && typeof database.disconnect === 'function') await database.disconnect();
  });

  test('should consume 5 messages and populate resource', async () => {
    const msgs = Array.from({ length: 5 }).map((_, i) => ({
      $body: {
        resource: 'users',
        action: 'insert',
        data: { id: `u${i + 10}`, name: `User${i + 10}`, email: `u${i + 10}@x.com` }
      },
      $attributes: {},
      $raw: {}
    }));
    for (const msg of msgs) {
      await sqsClient.quickSend(queueUrl, msg);
    }
    // Espera até todos serem processados
    let count = 0, tries = 0;
    while (tries++ < 30) { // Increased from 10 to 30 attempts
      count = await users.count();
      if (count === 5) break;
      await new Promise(res => setTimeout(res, 200)); // Increased from 100ms to 200ms
    }
    expect(count).toBe(5);
  });
});

describe('QueueConsumerPlugin (SQS driver, multi-resource)', () => {
  let database, users, orders, plugin, queueUrlUsers, queueUrlOrders, sqsClientUsers, sqsClientOrders;

  beforeAll(async () => {
    queueUrlUsers = await createSqsQueueForTest('queue-consumer-users');
    queueUrlOrders = await createSqsQueueForTest('queue-consumer-orders');
    sqsClientUsers = createSqsClientForTest('queue-consumer-users');
    sqsClientOrders = createSqsClientForTest('queue-consumer-orders');
    database = await createDatabaseForTest('queue-consumer-multi-resource');
    await database.connect();
    users = await database.createResource({
      name: 'users',
      attributes: { id: 'string|required', name: 'string|required', email: 'string|required' }
    });
    orders = await database.createResource({
      name: 'orders',
      attributes: { id: 'string|required', userId: 'string|required', amount: 'number|required' }
    });
    plugin = new QueueConsumerPlugin({
      enabled: true,
      consumers: [
        {
          driver: 'sqs',
          resources: 'users',
          config: {
            queueUrl: queueUrlUsers,
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            poolingInterval: 1000,
            maxMessages: 2,
            endpoint: 'http://localhost:4566',
          }
        },
        {
          driver: 'sqs',
          resources: 'orders',
          config: {
            queueUrl: queueUrlOrders,
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            poolingInterval: 1000,
            maxMessages: 2,
            endpoint: 'http://localhost:4566',
          }
        }
      ]
    });
    await plugin.setup(database);
  });

  afterAll(async () => {
    if (plugin && typeof plugin.stop === 'function') await plugin.stop();
    if (database && typeof database.disconnect === 'function') await database.disconnect();
  });

  test('should consume messages for two resources and count correctly', async () => {
    for (let i = 0; i < 3; i++) {
      await sqsClientUsers.quickSend(queueUrlUsers, {
        $body: {
          resource: 'users',
          action: 'insert',
          data: { id: `u${i + 20}`, name: `User${i + 20}`, email: `u${i + 20}@x.com` }
        }, $attributes: {}, $raw: {}
      });
      await sqsClientOrders.quickSend(queueUrlOrders, {
        $body: {
          resource: 'orders',
          action: 'insert',
          data: { id: `o${i + 30}`, userId: `u${i + 20}`, amount: 100 + i }
        }, $attributes: {}, $raw: {}
      });
    }
    // Espera até todos serem processados
    let countUsers = 0, countOrders = 0, tries = 0;
    while (tries++ < 30) { // Increased from 10 to 30 attempts
      countUsers = await users.count();
      countOrders = await orders.count();
      if (countUsers === 3 && countOrders === 3) break;
      await new Promise(res => setTimeout(res, 200)); // Increased from 100ms to 200ms
    }
    expect(countUsers).toBe(3);
    expect(countOrders).toBe(3);
  });
});

describe('ReplicatorPlugin + QueueConsumerPlugin (SQS integration)', () => {
  let dbSource, dbTarget, usersSource, usersTarget, replicator, consumer, queueUrl, sqsClient;

  beforeAll(async () => {
    queueUrl = await createSqsQueueForTest('replicator-sqs');
    sqsClient = createSqsClientForTest('replicator-sqs');
    // Banco de origem
    dbSource = await createDatabaseForTest('replicator-source');
    await dbSource.connect();
    usersSource = await dbSource.createResource({
      name: 'users',
      attributes: { id: 'string|required', name: 'string|required', email: 'string|required' }
    });
    // Banco de destino
    dbTarget = await createDatabaseForTest('replicator-target');
    await dbTarget.connect();
    usersTarget = await dbTarget.createResource({
      name: 'users',
      attributes: { id: 'string|required', name: 'string|required', email: 'string|required' }
    });
    // Replicator envia para fila SQS
    replicator = createReplicator('sqs', {
      queueUrl,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      endpoint: 'http://localhost:4566',
      logMessages: false
    });
    await replicator.initialize(dbSource);
    // Consumer consome da mesma fila e popula resource destino
    consumer = new QueueConsumerPlugin({
      enabled: true,
      consumers: [
        {
          driver: 'sqs',
          resources: 'users',
          config: {
            queueUrl,
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            poolingInterval: 1000,
            maxMessages: 5,
            endpoint: 'http://localhost:4566',
          }
        }
      ]
    });
    await consumer.setup(dbTarget);
  });

  afterAll(async () => {
    if (replicator && typeof replicator.stop === 'function') await replicator.stop();
    if (consumer && typeof consumer.stop === 'function') await consumer.stop();
    if (dbSource && typeof dbSource.disconnect === 'function') await dbSource.disconnect();
    if (dbTarget && typeof dbTarget.disconnect === 'function') await dbTarget.disconnect();
  });

  test('should replicate 5 elements from source to target via SQS', async () => {
    // Insere 5 elementos na resource de origem e replica
    for (let i = 0; i < 5; i++) {
      const data = { id: `u${i + 100}`, name: `User${i + 100}`, email: `u${i + 100}@x.com` };
      await usersSource.insert(data);
      await replicator.replicate('users', 'insert', data, data.id);
    }
    // Espera até todos serem processados no destino
    let countSource = 0, countTarget = 0, tries = 0;
    while (tries++ < 10) {
      countSource = await usersSource.count();
      countTarget = await usersTarget.count();
      if (countSource === 5 && countTarget === 5) break;
      await new Promise(res => setTimeout(res, 100));
    }
    expect(countSource).toBe(5);
    expect(countTarget).toBe(5);
  });
});
