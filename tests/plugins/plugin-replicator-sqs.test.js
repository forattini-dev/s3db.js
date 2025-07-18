import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createDatabaseForTest, createSqsQueueForTest, createSqsClientForTest, sleep } from '../config.js';
import { ReplicatorPlugin } from '../../src/plugins/replicator.plugin.js';
import SqsReplicator from '../../src/plugins/replicators/sqs-replicator.class.js';

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

describe('SQS Replicator - Configuration and Validation Tests', () => {
  test('validateConfig should return errors for missing queue configuration', () => {
    
    const replicator = new SqsReplicator({}, [], null);
    const validation = replicator.validateConfig();
    
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Either queueUrl, queues object, defaultQueue, or resourceQueueMap must be provided');
  });

  test('validateConfig should pass with queueUrl', () => {
    
    const replicator = new SqsReplicator({
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue'
    }, ['users']);
    const validation = replicator.validateConfig();
    
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('validateConfig should pass with queues object', () => {
    
    const replicator = new SqsReplicator({
      queues: {
        users: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue'
      }
    }, ['users']);
    const validation = replicator.validateConfig();
    
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('validateConfig should pass with defaultQueue', () => {
    
    const replicator = new SqsReplicator({
      defaultQueue: 'https://sqs.us-east-1.amazonaws.com/123456789012/default-queue'
    }, ['users']);
    const validation = replicator.validateConfig();
    
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('constructor should build queues from resources configuration', () => {
    
    const resources = {
      users: { queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue' },
      orders: { queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue' }
    };
    const replicator = new SqsReplicator({}, resources);
    
    expect(replicator.queues).toEqual({
      users: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue',
      orders: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue'
    });
  });
});

describe('SQS Replicator - Message Creation Tests', () => {
  let replicator;
  
  beforeEach(() => {
    
    replicator = new SqsReplicator({
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue'
    }, ['users']);
  });

  test('createMessage should create correct message for insert operation', () => {
    const data = { id: 'user1', name: 'John Doe' };
    const message = replicator.createMessage('users', 'insert', data, 'user1');
    
    expect(message).toEqual(expect.objectContaining({
      resource: 'users',
      action: 'insert',
      data: data,
      timestamp: expect.any(String),
      source: 's3db-replicator'
    }));
    expect(new Date(message.timestamp)).toBeInstanceOf(Date);
  });

  test('createMessage should create correct message for update operation', () => {
    const data = { id: 'user1', name: 'John Updated' };
    const beforeData = { id: 'user1', name: 'John Doe' };
    const message = replicator.createMessage('users', 'update', data, 'user1', beforeData);
    
    expect(message).toEqual(expect.objectContaining({
      resource: 'users',
      action: 'update',
      data: data,
      before: beforeData,
      timestamp: expect.any(String),
      source: 's3db-replicator'
    }));
  });

  test('createMessage should create correct message for delete operation', () => {
    const data = { id: 'user1', name: 'John Doe' };
    const message = replicator.createMessage('users', 'delete', data, 'user1');
    
    expect(message).toEqual(expect.objectContaining({
      resource: 'users',
      action: 'delete',
      data: data,
      timestamp: expect.any(String),
      source: 's3db-replicator'
    }));
  });

  test('createMessage should handle unknown operation with default structure', () => {
    const data = { id: 'user1', name: 'John Doe' };
    const message = replicator.createMessage('users', 'unknown', data, 'user1');
    
    expect(message).toEqual(expect.objectContaining({
      resource: 'users',
      action: 'unknown',
      data: data,
      timestamp: expect.any(String),
      source: 's3db-replicator'
    }));
  });
});

describe('SQS Replicator - Queue URL Resolution Tests', () => {
  test('getQueueUrlsForResource should return specific queue for resource', () => {
    
    const replicator = new SqsReplicator({
      queues: {
        users: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue'
      }
    }, ['users']);
    
    const urls = replicator.getQueueUrlsForResource('users');
    expect(urls).toEqual(['https://sqs.us-east-1.amazonaws.com/123456789012/users-queue']);
  });

  test('getQueueUrlsForResource should return main queueUrl when resource not in queues', () => {
    
    const replicator = new SqsReplicator({
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/main-queue'
    }, ['users']);
    
    const urls = replicator.getQueueUrlsForResource('users');
    expect(urls).toEqual(['https://sqs.us-east-1.amazonaws.com/123456789012/main-queue']);
  });

  test('getQueueUrlsForResource should return defaultQueue when no other options', () => {
    
    const replicator = new SqsReplicator({
      defaultQueue: 'https://sqs.us-east-1.amazonaws.com/123456789012/default-queue'
    }, ['users']);
    
    const urls = replicator.getQueueUrlsForResource('users');
    expect(urls).toEqual(['https://sqs.us-east-1.amazonaws.com/123456789012/default-queue']);
  });

  test('getQueueUrlsForResource should throw error when no queue found', () => {
    
    const replicator = new SqsReplicator({}, ['users']);
    
    expect(() => {
      replicator.getQueueUrlsForResource('users');
    }).toThrow("No queue URL found for resource 'users'");
  });

  test('getQueueUrlsForResource should use resourceQueueMap when available', () => {
    
    const replicator = new SqsReplicator({}, ['users']);
    replicator.resourceQueueMap = {
      users: ['https://sqs.us-east-1.amazonaws.com/123456789012/users-queue-1']
    };
    
    const urls = replicator.getQueueUrlsForResource('users');
    expect(urls).toEqual(['https://sqs.us-east-1.amazonaws.com/123456789012/users-queue-1']);
  });
});

describe('SQS Replicator - Resource Filtering Tests', () => {
  test('shouldReplicateResource should return true for resource in queues', () => {
    
    const replicator = new SqsReplicator({
      queues: { users: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue' }
    }, ['users']);
    
    expect(replicator.shouldReplicateResource('users')).toBe(true);
  });

  test('shouldReplicateResource should return true when defaultQueue exists', () => {
    
    const replicator = new SqsReplicator({
      defaultQueue: 'https://sqs.us-east-1.amazonaws.com/123456789012/default-queue'
    }, ['users']);
    
    expect(replicator.shouldReplicateResource('anyresource')).toBe(true);
  });

  test('shouldReplicateResource should return true when queueUrl exists', () => {
    
    const replicator = new SqsReplicator({
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/main-queue'
    }, ['users']);
    
    expect(replicator.shouldReplicateResource('anyresource')).toBe(true);
  });

  test('shouldReplicateResource should return true for resource in resources list', () => {
    
    const replicator = new SqsReplicator({}, { users: {} });
    
    expect(replicator.shouldReplicateResource('users')).toBe(true);
  });

  test('shouldReplicateResource should return false when no matching configuration', () => {
    
    const replicator = new SqsReplicator({}, ['users']);
    
    expect(replicator.shouldReplicateResource('orders')).toBe(false);
  });
});

describe('SQS Replicator - Transformer Tests', () => {
  test('_applyTransformer should apply transform function', () => {
    
    const replicator = new SqsReplicator({}, {
      users: {
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue',
        transform: (data) => ({ ...data, transformed: true })
      }
    });
    
    const data = { id: 'user1', name: 'John' };
    const transformed = replicator._applyTransformer('users', data);
    
    expect(transformed).toEqual({
      id: 'user1',
      name: 'John',
      transformed: true
    });
  });

  test('_applyTransformer should apply transformer function', () => {
    
    const replicator = new SqsReplicator({}, {
      users: {
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue',
        transformer: (data) => ({ ...data, processed: true })
      }
    });
    
    const data = { id: 'user1', name: 'John' };
    const transformed = replicator._applyTransformer('users', data);
    
    expect(transformed).toEqual({
      id: 'user1',
      name: 'John',
      processed: true
    });
  });

  test('_applyTransformer should return original data when no transformer', () => {
    
    const replicator = new SqsReplicator({}, {
      users: {
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue'
      }
    });
    
    const data = { id: 'user1', name: 'John' };
    const transformed = replicator._applyTransformer('users', data);
    
    expect(transformed).toEqual(data);
  });

  test('_applyTransformer should return original data when resource not found', () => {
    
    const replicator = new SqsReplicator({}, {});
    
    const data = { id: 'user1', name: 'John' };
    const transformed = replicator._applyTransformer('users', data);
    
    expect(transformed).toEqual(data);
  });

  test('_applyTransformer should return original data when transformer returns falsy', () => {
    
    const replicator = new SqsReplicator({}, {
      users: {
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue',
        transform: () => null
      }
    });
    
    const data = { id: 'user1', name: 'John' };
    const transformed = replicator._applyTransformer('users', data);
    
    expect(transformed).toEqual(data);
  });
});

describe('SQS Replicator - Initialization Tests', () => {
  let mockSqsClient, db;
  
  beforeEach(async () => {
    db = createDatabaseForTest('sqs-init-test');
    await db.connect();
    mockSqsClient = createSqsClientForTest();
  });

  afterEach(async () => {
    await db?.disconnect?.();
  });

  test('initialize should setup SQS client when not provided', async () => {
    
    const replicator = new SqsReplicator({
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
      region: 'us-east-1'
    }, ['users']);
    
    let initEventEmitted = false;
    replicator.on('initialized', (event) => {
      initEventEmitted = true;
      expect(event.replicator).toBeDefined();
      // queueUrl might be undefined in test environment
      expect(event.replicator).toBe('SqsReplicator');
    });
    
    // Don't pass client so the event gets emitted
    await replicator.initialize(db);
    expect(replicator.sqsClient).toBeDefined();
    expect(initEventEmitted).toBe(true);
  });

  test('initialize should use provided client', async () => {
    
    const replicator = new SqsReplicator({
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue'
    }, ['users'], mockSqsClient);
    
    await replicator.initialize(db);
    expect(replicator.sqsClient).toBe(mockSqsClient);
  });
});

describe('SQS Replicator - Error Handling Tests', () => {
  let db, queueUrl, mockSqsClient;
  
  beforeEach(async () => {
    db = createDatabaseForTest('sqs-error-test');
    await db.connect();
    queueUrl = await createSqsQueueForTest('error-test-queue');
    mockSqsClient = createSqsClientForTest();
  });

  afterEach(async () => {
    await db?.disconnect?.();
  });

  test('replicate should return error result when SQS operation fails', async () => {
    
    const badClient = {
      send: jest.fn().mockRejectedValue(new Error('SQS Error'))
    };
    const replicator = new SqsReplicator({
      queueUrl: queueUrl
    }, ['users'], badClient);
    
    let errorEmitted = false;
    replicator.on('replicator_error', (event) => {
      errorEmitted = true;
      expect(event.resource).toBe('users');
      expect(event.operation).toBe('insert');
      expect(event.error).toBe('SQS Error');
    });
    
    await replicator.initialize(db);
    const result = await replicator.replicate('users', 'insert', { id: 'test', name: 'Test' }, 'test');
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('SQS Error');
    expect(errorEmitted).toBe(true);
  });

  test('replicate should skip when resource not included', async () => {
    
    const replicator = new SqsReplicator({
      queues: { users: queueUrl }
    }, ['users'], mockSqsClient);
    
    const result = await replicator.replicate('orders', 'insert', { id: 'test', name: 'Test' }, 'test');
    expect(result).toEqual({ skipped: true, reason: 'resource_not_included' });
  });

  test('replicate should skip when disabled', async () => {
    
    const replicator = new SqsReplicator({
      queueUrl: queueUrl
    }, ['users'], mockSqsClient);
    replicator.enabled = false;
    
    const result = await replicator.replicate('users', 'insert', { id: 'test', name: 'Test' }, 'test');
    expect(result).toEqual({ skipped: true, reason: 'resource_not_included' });
  });
});

describe('SQS Replicator - Lifecycle Methods Tests', () => {
  let db, queueUrl, mockSqsClient, replicator;
  
  beforeEach(async () => {
    db = createDatabaseForTest('sqs-lifecycle-test');
    await db.connect();
    queueUrl = await createSqsQueueForTest('lifecycle-test-queue');
    mockSqsClient = createSqsClientForTest();
    
    
    replicator = new SqsReplicator({
      queueUrl: queueUrl
    }, ['users'], mockSqsClient);
  });

  afterEach(async () => {
    if (replicator) {
      await replicator.cleanup();
    }
    await db?.disconnect?.();
  });

  test('testConnection should return true for valid connection', async () => {
    await replicator.initialize(db);
    const result = await replicator.testConnection();
    expect(result).toBe(true);
  });

  test('testConnection should return false and emit error for invalid connection', async () => {
    
    const badReplicator = new SqsReplicator({
      queueUrl: 'https://invalid-sqs-url'
    }, ['users']);
    
    let errorEmitted = false;
    badReplicator.on('connection_error', () => {
      errorEmitted = true;
    });
    
    const result = await badReplicator.testConnection();
    expect(result).toBe(false);
    expect(errorEmitted).toBe(true);
  });

  test('getStatus should return comprehensive status', async () => {
    await replicator.initialize(db);
    const status = await replicator.getStatus();
    
    expect(status).toEqual(expect.objectContaining({
      connected: true,
      queueUrl: queueUrl,
      region: 'us-east-1',
      resources: ['users'],
      totalreplicators: expect.any(Number),
      totalErrors: expect.any(Number)
    }));
  });

  test('cleanup should properly cleanup SQS client', async () => {
    await replicator.initialize(db);
    expect(replicator.sqsClient).toBeDefined();
    
    const destroySpy = jest.spyOn(replicator.sqsClient, 'destroy');
    await replicator.cleanup();
    expect(destroySpy).toHaveBeenCalled();
  });
});

describe('SQS Replicator - Batch Operations Tests', () => {
  let db, queueUrl, mockSqsClient;
  
  beforeEach(async () => {
    db = createDatabaseForTest('sqs-batch-test');
    await db.connect();
    queueUrl = await createSqsQueueForTest('batch-test-queue');
    mockSqsClient = createSqsClientForTest();
  });

  afterEach(async () => {
    await db?.disconnect?.();
  });

  test('replicateBatch should skip when resource not included', async () => {
    
    const replicator = new SqsReplicator({
      queues: { users: queueUrl }
    }, ['users'], mockSqsClient);
    
    const records = [
      { id: 'test1', operation: 'insert', data: { id: 'test1', name: 'Test 1' } }
    ];
    
    const result = await replicator.replicateBatch('orders', records);
    expect(result).toEqual({ skipped: true, reason: 'resource_not_included' });
  });

  test('replicateBatch should skip when disabled', async () => {
    
    const replicator = new SqsReplicator({
      queueUrl: queueUrl
    }, ['users'], mockSqsClient);
    replicator.enabled = false;
    
    const records = [
      { id: 'test1', operation: 'insert', data: { id: 'test1', name: 'Test 1' } }
    ];
    
    const result = await replicator.replicateBatch('users', records);
    expect(result).toEqual({ skipped: true, reason: 'resource_not_included' });
  });

  test('replicateBatch should process records in batches of 10', async () => {
    
    const replicator = new SqsReplicator({
      queueUrl: queueUrl
    }, ['users'], mockSqsClient);
    
    await replicator.initialize(db);
    
    // Create 15 records to test batching
    const records = Array.from({ length: 15 }, (_, i) => ({
      id: `test${i}`,
      operation: 'insert',
      data: { id: `test${i}`, name: `Test ${i}` }
    }));
    
    let batchEmitted = false;
    replicator.on('batch_replicated', (event) => {
      batchEmitted = true;
      expect(event.resource).toBe('users');
      expect(event.total).toBe(15);
    });
    
    const result = await replicator.replicateBatch('users', records);
    
    expect(result.success).toBe(true);
    expect(result.total).toBe(15);
    expect(batchEmitted).toBe(true);
  });

  test('replicateBatch should handle batch errors gracefully', async () => {
    
    const badClient = {
      send: jest.fn().mockRejectedValue(new Error('Batch error'))
    };
    const replicator = new SqsReplicator({
      queueUrl: queueUrl
    }, ['users'], badClient);
    
    // Don't call initialize to avoid overwriting the badClient
    replicator.database = db;
    
    const records = [
      { id: 'test1', operation: 'insert', data: { id: 'test1', name: 'Test 1' } }
    ];
    
    let batchErrorEmitted = false;
    replicator.on('batch_replicator_error', (event) => {
      batchErrorEmitted = true;
      expect(event.resource).toBe('users');
      expect(event.error).toBe('Batch error');
    });
    
    const result = await replicator.replicateBatch('users', records);
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Batch error');
    expect(batchErrorEmitted).toBe(true);
  });
});

describe('SQS Replicator - FIFO Queue Tests', () => {
  test('replicate should include MessageGroupId and MessageDeduplicationId for FIFO queues', async () => {
    
    const mockClient = {
      send: jest.fn().mockResolvedValue({ MessageId: 'test-message-id' })
    };
    
    const replicator = new SqsReplicator({
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test.fifo',
      messageGroupId: 'test-group',
      deduplicationId: 'test-dedup'
    }, ['users'], mockClient);
    
    const db = createDatabaseForTest('sqs-fifo-test');
    await db.connect();
    
    try {
      await replicator.initialize(db);
      
      let replicatedEventEmitted = false;
      replicator.on('replicated', (event) => {
        replicatedEventEmitted = true;
        expect(event.success).toBe(true);
        expect(event.messageId).toBe('test-message-id');
      });
      
      const result = await replicator.replicate('users', 'insert', { id: 'test', name: 'Test' }, 'test');
      
      expect(result.success).toBe(true);
      expect(mockClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            MessageGroupId: 'test-group',
            MessageDeduplicationId: 'users:insert:test'
          })
        })
      );
      expect(replicatedEventEmitted).toBe(true);
    } finally {
      await db?.disconnect?.();
    }
  });
});