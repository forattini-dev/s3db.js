import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createDatabaseForTest, createSqsQueueForTest, createSqsClientForTest, sleep } from '../config.js';
import { ReplicatorPlugin } from '../../src/plugins/replicator.plugin.js';
import SqsReplicator from '../../src/plugins/replicators/sqs-replicator.class.js';

// --- OPTIMIZED: Single comprehensive test suite instead of multiple ---
describe('SqsReplicator - Comprehensive Integration Tests', () => {
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
      verbose: false, // Reduced from true for faster execution
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
      queueUrlDefault: 'https://sqs.test.com/queue',
      client: sqsClient
    }, ['users']);
    
    expect(replicator.shouldReplicateResource('users', 'insert')).toBe(true);
    // With default queue, all resources are accepted
    expect(replicator.shouldReplicateResource('products', 'insert')).toBe(true);
  });
});