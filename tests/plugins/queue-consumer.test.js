import QueueConsumerPlugin from '#src/plugins/queue-consumer.plugin.js';

import { 
  createDatabaseForTest,
  createSqsQueueForTest,
  createSqsClientForTest,
} from '#tests/config.js';

describe('QueueConsumerPlugin (integration with LocalStack SQS)', () => {
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
      queues: { users: queueUrl },
      poolingInterval: 1000,
      maxMessages: 2,
      startConsumers: true
    });
    plugin.database = database;
    await plugin.setup(database);
  });

  afterAll(async () => {
    if (plugin && typeof plugin.stop === 'function') await plugin.stop();
    if (database && typeof database.disconnect === 'function') await database.disconnect();
  });

  async function waitForUser(id, timeout = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const user = await users.get(id);
        if (user) return user;
      } catch (e) {}
      await new Promise(res => setTimeout(res, 200));
    }
    throw new Error(`User ${id} not found after ${timeout}ms`);
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
    const user = await waitForUser('u1');
    expect(user.name).toBe('A');
  });

  test('should update via SQS message (attribute)', async () => {
    await sqsClient.quickSend(queueUrl, {
      $body: {
        resource: 'users',
        action: 'update',
        data: { id: 'u1', name: 'B', email: 'b@x.com' }
      },
      $attributes: {},
      $raw: {}
    });
    const user = await waitForUser('u1');
    expect(user.name).toBe('B');
  });

  test('should delete via SQS message (mixed)', async () => {
    await sqsClient.quickSend(queueUrl, {
      resource: 'users',
      action: 'delete',
      data: { id: 'u1' }
    });
    await new Promise(res => setTimeout(res, 1000));
    let user, error;
    try {
      user = await users.get('u1');
    } catch (err) {
      error = err;
    }
    expect(user === null || (error && /not exists|not found|does not exists/i.test(error.message))).toBe(true);
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
      maxMessages: 2,
      startConsumers: true,
      poolingInterval: 1000,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      queues: { users: queueUrl }
    });
    await plugin.setup(database);
  });

  afterAll(async () => {
    if (plugin && typeof plugin.stop === 'function') await plugin.stop();
    if (database && typeof database.disconnect === 'function') await database.disconnect();
  });

  test('should process real SQS message and insert user', async () => {
    const msg = {
      resource: 'users',
      action: 'insert',
      data: { id: 'u2', name: 'Real', email: 'real@x.com' }
    };
    await sqsClient.quickSend(queueUrl, msg);
    await new Promise(res => setTimeout(res, 2500));
    const user = await users.get('u2');
    expect(user.name).toBe('Real');
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
      attributes: { id: 'string|required', userId: 'string|required', amount: 'number|required' }
    });
    plugin = new QueueConsumerPlugin({
      maxMessages: 2,
      region: 'us-east-1',
      startConsumers: true,
      poolingInterval: 1000,
      endpoint: 'http://localhost:4566',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      queues: { users: queueUrl, orders: queueUrl }
    });
    await plugin.setup(database);
  });

  afterAll(async () => {
    if (plugin && typeof plugin.stop === 'function') await plugin.stop();
    if (database && typeof database.disconnect === 'function') await database.disconnect();
  });

  test('should process messages for multiple resources and queues', async () => {
    const msgUser = {
      resource: 'users',
      action: 'insert',
      data: { id: 'u3', name: 'Multi', email: 'multi@x.com' }
    };
    const msgOrder = {
      resource: 'orders',
      action: 'insert',
      data: { id: 'o1', userId: 'u3', amount: 123.45 }
    };
    await sqsClient.quickSend(queueUrl, msgUser);
    await sqsClient.quickSend(queueUrl, msgOrder);
    await new Promise(res => setTimeout(res, 4000));
    const user = await users.get('u3');
    const order = await orders.get('o1');
    expect(user.name).toBe('Multi');
    expect(order.amount).toBeCloseTo(123, 0);
    expect(order.userId).toBe('u3');
  });
}); 