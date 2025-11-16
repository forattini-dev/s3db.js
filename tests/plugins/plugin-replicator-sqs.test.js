import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createDatabaseForTest, createSqsQueueForTest, createSqsClientForTest, sleep } from '../config.js';
import { ReplicatorPlugin } from '../../src/plugins/replicator.plugin.js';
import SqsReplicator from '../../src/plugins/replicators/sqs-replicator.class.js';

const shouldRunSqsTests = process.env.RUN_SQS_TESTS === 'true';
const describeSqs = shouldRunSqsTests ? describe : describe.skip;

// --- OPTIMIZED: Single comprehensive test suite instead of multiple ---
describeSqs('SqsReplicator - Comprehensive Integration Tests', () => {
  let db, users, queueUrl, sqsClient, plugin;
  
  beforeAll(async () => {
    db = createDatabaseForTest('suite=plugins/replicator-sqs');
    await db.connect();
    users = await db.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' }
    });
    queueUrl = await createSqsQueueForTest('rep-sqs-optimized-queue');
    sqsClient = createSqsClientForTest();
    plugin = new ReplicatorPlugin({
      logLevel: 'debug',  // Test expects verbose logging output
      replicators: [
        {
          driver: 'sqs',
          defaultQueue: queueUrl,
          client: sqsClient,
          resources: ['users']
        }
      ]
    });
    await plugin.install(db);
  });
  
  afterAll(async () => {
    await db.disconnect();
  });
  
  test('replicates insert to SQS default queue', async () => {
    const user = { id: '1', name: 'Bob' };
    await users.insert(user);
    
    // Reduced wait time
    await sleep(200);
    
    const messages = (await sqsClient.quickGet(queueUrl, 1)).Messages || [];
    const found = messages.find(m => JSON.parse(m.Body).data.id === '1');
    expect(found).toBeDefined();
    
    const payload = JSON.parse(found.Body);
    expect(payload.resource).toBe('users');
    expect(payload.action).toBe('insert');
    expect(payload.data.name).toBe('Bob');
  });

  test('replicates update to SQS queue', async () => {
    const user = { id: '2', name: 'Alice' };
    await users.insert(user);
    
    // Wait for initial replication
    await sleep(200);
    
    // Update the user
    await users.update('2', { name: 'Alice Updated' });
    
    // Wait for update replication
    await sleep(200);
    
    const messages = (await sqsClient.quickGet(queueUrl, 2)).Messages || [];
    const updateMessage = messages.find(m => {
      const payload = JSON.parse(m.Body);
      return payload.action === 'update' && payload.data.id === '2';
    });
    
    expect(updateMessage).toBeDefined();
    const payload = JSON.parse(updateMessage.Body);
    expect(payload.resource).toBe('users');
    expect(payload.action).toBe('update');
    expect(payload.data.name).toBe('Alice Updated');
  });

  test('replicates delete to SQS queue', async () => {
    const user = { id: '3', name: 'Charlie' };
    await users.insert(user);
    
    // Wait for initial replication
    await sleep(200);
    
    // Delete the user
    await users.delete('3');
    
    // Wait for delete replication
    await sleep(200);
    
    const messages = (await sqsClient.quickGet(queueUrl, 3)).Messages || [];
    const deleteMessage = messages.find(m => {
      const payload = JSON.parse(m.Body);
      return payload.action === 'delete' && payload.data.id === '3';
    });
    
    expect(deleteMessage).toBeDefined();
    const payload = JSON.parse(deleteMessage.Body);
    expect(payload.resource).toBe('users');
    expect(payload.action).toBe('delete');
    expect(payload.data.id).toBe('3');
  });

  test('validates configuration correctly', () => {
    const replicator = new SqsReplicator({
      defaultQueue: 'https://sqs.test.com/queue',
      client: sqsClient
    }, ['users']);

    expect(replicator.shouldReplicateResource('users', 'insert')).toBe(true);
    // With default queue, all resources are accepted
    expect(replicator.shouldReplicateResource('products', 'insert')).toBe(true);
  });
});

describe('SqsReplicator - Additional Coverage Tests', () => {
  let sqsReplicator;
  let mockSqsClient;

  beforeEach(() => {
    mockSqsClient = {
      send: jest.fn().mockResolvedValue({ MessageId: 'test-msg-id' })
    };
  });

  test('should validate config correctly', () => {
    // Valid config with queueUrl
    const validReplicator = new SqsReplicator({ queueUrl: 'https://sqs.test.com/queue' });
    const validResult = validReplicator.validateConfig();
    expect(validResult.isValid).toBe(true);
    expect(validResult.errors).toHaveLength(0);

    // Invalid config without any queue configuration
    const invalidReplicator = new SqsReplicator({});
    const invalidResult = invalidReplicator.validateConfig();
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  test('should handle array resources configuration', () => {
    const replicator = new SqsReplicator({ queueUrl: 'test' }, ['users', 'posts']);
    expect(replicator.resources).toEqual({ users: true, posts: true });
  });

  test('should handle object resources configuration', () => {
    const resources = {
      users: { queueUrl: 'user-queue' },
      posts: { queueUrl: 'post-queue' }
    };
    const replicator = new SqsReplicator({}, resources);
    expect(replicator.resources).toEqual(resources);
    expect(replicator.queues.users).toBe('user-queue');
    expect(replicator.queues.posts).toBe('post-queue');
  });

  test('should handle object resource with name property', () => {
    const resources = [
      { name: 'users', queueUrl: 'user-queue' },
      { name: 'posts', queueUrl: 'post-queue' }
    ];
    const replicator = new SqsReplicator({}, resources);
    expect(replicator.resources.users).toEqual({ name: 'users', queueUrl: 'user-queue' });
    expect(replicator.resources.posts).toEqual({ name: 'posts', queueUrl: 'post-queue' });
  });

  test('should get queue URLs for resource correctly', () => {
    const replicator = new SqsReplicator({
      queueUrl: 'default-queue',
      queues: { users: 'user-queue' },
      defaultQueue: 'fallback-queue'
    });

    // Test resource-specific queue
    expect(replicator.getQueueUrlsForResource('users')).toEqual(['user-queue']);
    
    // Test default queue
    expect(replicator.getQueueUrlsForResource('posts')).toEqual(['default-queue']);
  });

  test('should throw error when no queue URL found', () => {
    const replicator = new SqsReplicator({});
    expect(() => replicator.getQueueUrlsForResource('unknown')).toThrow('No queue URL found for resource \'unknown\'');
  });

  test('should apply transformer correctly', () => {
    const replicator = new SqsReplicator({});
    replicator.resources = { 
      users: { 
        transform: (data) => ({ ...data, transformed: true }) 
      } 
    };

    const result = replicator._applyTransformer('users', { id: '1', name: 'test' });
    expect(result.transformed).toBe(true);
  });

  test('should clean internal fields', () => {
    const replicator = new SqsReplicator({});
    const data = { 
      id: '1', 
      name: 'test', 
      _v: 'v1', 
      _partition: 'part1',
      _timestamp: Date.now()
    };
    
    const cleaned = replicator._cleanInternalFields(data);
    expect(cleaned).toEqual({ id: '1', name: 'test' });
    expect(cleaned._v).toBeUndefined();
    expect(cleaned._partition).toBeUndefined();
    expect(cleaned._timestamp).toBeUndefined();
  });

  test('should create message with correct format', () => {
    const replicator = new SqsReplicator({});
    const message = replicator.createMessage('users', 'insert', { id: '1', name: 'test' }, '1');
    
    expect(message.resource).toBe('users');
    expect(message.action).toBe('insert');
    expect(message.data).toEqual({ id: '1', name: 'test' });
    expect(message.timestamp).toBeDefined();
    expect(message.source).toBe('s3db-replicator');
  });

  test('should create message with before data for updates', () => {
    const replicator = new SqsReplicator({});
    const beforeData = { id: '1', name: 'old' };
    const newData = { id: '1', name: 'new' };
    
    const message = replicator.createMessage('users', 'update', newData, '1', beforeData);
    
    expect(message.action).toBe('update');
    expect(message.data).toEqual(newData);
    expect(message.before).toEqual(beforeData);
  });

  test('should handle replication with FIFO queue settings', async () => {
    const replicator = new SqsReplicator({
      queueUrl: 'test-queue',
      messageGroupId: 'test-group',
      deduplicationId: true
    });
    replicator.sqsClient = mockSqsClient;
    replicator.enabled = true;
    replicator.resources = { users: true };

    const result = await replicator.replicate('users', 'insert', { id: '1', name: 'test' }, '1');
    
    expect(result.success).toBe(true);
    expect(mockSqsClient.send).toHaveBeenCalled();
    
    const sendArgs = mockSqsClient.send.mock.calls[0][0];
    expect(sendArgs.input.MessageGroupId).toBe('test-group');
    expect(sendArgs.input.MessageDeduplicationId).toBe('users:insert:1');
  });

  test('should handle replication errors gracefully', async () => {
    const errorClient = {
      send: jest.fn().mockRejectedValue(new Error('SQS error'))
    };
    
    const replicator = new SqsReplicator({ queueUrl: 'test-queue', logLevel: 'debug' });
    replicator.sqsClient = errorClient;
    replicator.enabled = true;
    replicator.resources = { users: true };

    // Mock console.warn to avoid output during test
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await replicator.replicate('users', 'insert', { id: '1' }, '1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('SQS error');
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  test('should handle batch replication', async () => {
    const replicator = new SqsReplicator({ queueUrl: 'test-queue' });
    replicator.sqsClient = mockSqsClient;
    replicator.enabled = true;
    replicator.resources = { users: true };

    const records = [
      { id: '1', operation: 'insert', data: { id: '1', name: 'User 1' } },
      { id: '2', operation: 'insert', data: { id: '2', name: 'User 2' } }
    ];

    const result = await replicator.replicateBatch('users', records);
    
    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(mockSqsClient.send).toHaveBeenCalled();
  });

  test('should skip replication when disabled', async () => {
    const replicator = new SqsReplicator({ queueUrl: 'test-queue' });
    replicator.enabled = false;

    const result = await replicator.replicate('users', 'insert', { id: '1' }, '1');
    expect(result.skipped).toBe(true);
  });

  test('should skip replication for non-included resources', async () => {
    const replicator = new SqsReplicator({});
    replicator.enabled = true;
    replicator.resources = { users: true };

    const result = await replicator.replicate('posts', 'insert', { id: '1' }, '1');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('resource_not_included');
  });

  test('should handle default queue configuration', () => {
    const replicator = new SqsReplicator({
      defaultQueue: 'default-queue'
    });

    const urls = replicator.getQueueUrlsForResource('any-resource');
    expect(urls).toEqual(['default-queue']);
  });

  test('should handle resourceQueueMap configuration', () => {
    const replicator = new SqsReplicator({});
    replicator.resourceQueueMap = {
      users: ['queue1', 'queue2']
    };

    const urls = replicator.getQueueUrlsForResource('users');
    expect(urls).toEqual(['queue1', 'queue2']);
  });

  test('should handle batch replication with errors', async () => {
    const errorClient = {
      send: jest.fn().mockRejectedValue(new Error('Batch error'))
    };
    
    const replicator = new SqsReplicator({ queueUrl: 'test-queue' });
    replicator.sqsClient = errorClient;
    replicator.enabled = true;
    replicator.resources = { users: true };

    // Mock console.warn to avoid output during test
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const records = [
      { id: '1', operation: 'insert', data: { id: '1', name: 'User 1' } }
    ];

    const result = await replicator.replicateBatch('users', records);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    
    consoleSpy.mockRestore();
  });

  test('should handle large batch splitting', async () => {
    const replicator = new SqsReplicator({ queueUrl: 'test-queue' });
    replicator.sqsClient = mockSqsClient;
    replicator.enabled = true;
    replicator.resources = { users: true };

    // Create 15 records (more than SQS batch limit of 10)
    const records = Array.from({ length: 15 }, (_, i) => ({
      id: `${i + 1}`,
      operation: 'insert',
      data: { id: `${i + 1}`, name: `User ${i + 1}` }
    }));

    const result = await replicator.replicateBatch('users', records);
    
    expect(result.total).toBe(15);
    // Should be called twice (10 + 5 records)
    expect(mockSqsClient.send).toHaveBeenCalledTimes(2);
  });

  test('should emit events on successful replication', async () => {
    const replicator = new SqsReplicator({ queueUrl: 'test-queue' });
    replicator.sqsClient = mockSqsClient;
    replicator.enabled = true;
    replicator.resources = { users: true };

    const emitSpy = jest.spyOn(replicator, 'emit');

    await replicator.replicate('users', 'insert', { id: '1' }, '1');
    
    expect(emitSpy).toHaveBeenCalledWith('plg:replicator:replicated', expect.objectContaining({
      replicator: replicator.name,
      resource: 'users',
      operation: 'insert',
      success: true
    }));
  });

  test('should emit error events on failed replication', async () => {
    const errorClient = {
      send: jest.fn().mockRejectedValue(new Error('SQS error'))
    };
    
    const replicator = new SqsReplicator({ queueUrl: 'test-queue' });
    replicator.sqsClient = errorClient;
    replicator.enabled = true;
    replicator.resources = { users: true };

    const emitSpy = jest.spyOn(replicator, 'emit');

    await replicator.replicate('users', 'insert', { id: '1' }, '1');
    
    expect(emitSpy).toHaveBeenCalledWith('plg:replicator:error', expect.objectContaining({
      replicator: replicator.name,
      resource: 'users',
      operation: 'insert',
      error: 'SQS error'
    }));
  });
});
