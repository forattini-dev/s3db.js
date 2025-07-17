import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest, createSqsQueueForTest, createSqsClientForTest, sleep } from '../config.js';
import { ReplicatorPlugin } from '../../src/plugins/replicator.plugin.js';

describe('SqsReplicator - s3db to sqs replication', () => {
  let db, users, queueUrl, sqsClient, plugin;
  beforeAll(async () => {
    db = createDatabaseForTest('rep-b1-src');
    await db.connect();
    users = await db.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' }
    });
    queueUrl = await createSqsQueueForTest('rep-b1-queue');
    sqsClient = createSqsClientForTest();
    plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [
        {
          driver: 'sqs',
          queueUrlDefault: queueUrl,
          client: sqsClient,
          resources: ['users']
        }
      ]
    });
    await plugin.setup(db);
  });
  afterAll(async () => {
    await db.disconnect();
  });
  test('replicates insert to SQS default queue', async () => {
    const user = { id: '1', name: 'Bob' };
    await users.insert(user);
    console.log('Inserted user:', user);
    await sleep(1500);
    const messages = (await sqsClient.quickGet(queueUrl, 1)).Messages || [];
    console.log('SQS messages:', messages);
    const found = messages.find(m => JSON.parse(m.Body).data.id === '1');
    expect(found).toBeDefined();
    const payload = JSON.parse(found.Body);
    expect(payload.resource).toBe('users');
    expect(payload.action).toBe('insert');
    expect(payload.data.name).toBe('Bob');
  });
});

describe('SqsReplicator - b2: two resources, each to its own SQS queue', () => {
  let db, users, orders, usersQueue, ordersQueue, sqsClient, plugin;
  beforeAll(async () => {
    db = createDatabaseForTest('rep-b2-src');
    await db.connect();
    users = await db.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' }
    });
    orders = await db.createResource({
      name: 'orders',
      attributes: { id: 'string', total: 'number' }
    });
    usersQueue = await createSqsQueueForTest('rep-b2-users');
    ordersQueue = await createSqsQueueForTest('rep-b2-orders');
    sqsClient = createSqsClientForTest();
    plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [
        {
          driver: 'sqs',
          client: sqsClient,
          resources: {
            users: { queueUrl: usersQueue, actions: ['insert'] },
            orders: { queueUrl: ordersQueue, actions: ['insert'] }
          }
        }
      ]
    });
    await plugin.setup(db);
  });
  afterAll(async () => {
    await db.disconnect();
  });
  test('replicates insert to correct SQS queues', async () => {
    await users.insert({ id: 'u1', name: 'Carol' });
    await orders.insert({ id: 'o1', total: 42 });
    console.log('Inserted users and orders');
    await sleep(1500);
    const userMsgs = (await sqsClient.quickGet(usersQueue, 1)).Messages || [];
    const orderMsgs = (await sqsClient.quickGet(ordersQueue, 1)).Messages || [];
    console.log('SQS userMsgs:', userMsgs);
    console.log('SQS orderMsgs:', orderMsgs);
    const userPayload = JSON.parse(userMsgs[0].Body);
    const orderPayload = JSON.parse(orderMsgs[0].Body);
    expect(userPayload.resource).toBe('users');
    expect(userPayload.data.name).toBe('Carol');
    expect(orderPayload.resource).toBe('orders');
    expect(orderPayload.data.total).toBe(42);
  });
});

describe('SqsReplicator - b3: one resource, transform adds replication date', () => {
  let db, users, queueUrl, sqsClient, plugin;
  beforeAll(async () => {
    db = createDatabaseForTest('rep-b3-src');
    await db.connect();
    users = await db.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' }
    });
    queueUrl = await createSqsQueueForTest('rep-b3-queue');
    sqsClient = createSqsClientForTest();
    plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [
        {
          driver: 'sqs',
          client: sqsClient,
          resources: {
            users: {
              queueUrl,
              actions: ['insert'],
              transform: (data) => ({ ...data, replicatedAt: new Date().toISOString() })
            }
          }
        }
      ]
    });
    await plugin.setup(db);
  });
  afterAll(async () => {
    await db.disconnect();
  });
  test('replicates insert to SQS with replication date', async () => {
    const user = { id: 'x1', name: 'Zoe' };
    await users.insert(user);
    console.log('Inserted user:', user);
    await sleep(1500);
    const messages = (await sqsClient.quickGet(queueUrl, 1)).Messages || [];
    console.log('SQS messages:', messages);
    const found = messages.find(m => JSON.parse(m.Body).data.id === 'x1');
    expect(found).toBeDefined();
    const payload = JSON.parse(found.Body);
    expect(payload.resource).toBe('users');
    expect(payload.data.name).toBe('Zoe');
    expect(typeof payload.data.replicatedAt).toBe('string');
    expect(new Date(payload.data.replicatedAt).toString()).not.toBe('Invalid Date');
  });
});