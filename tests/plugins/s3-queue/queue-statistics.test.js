import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

describe.skip('S3QueuePlugin - Queue Statistics', () => {
  let database;
  let resource;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=plugins/transactions');
    await database.connect();

    resource = await database.createResource({
      name: 'emails',
      attributes: {
        id: 'string|optional',
        to: 'string|required',
        subject: 'string',
        body: 'string'
      }
    });
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.stop();
    }
    if (database) {
      await database.disconnect();
    }
  });

  beforeEach(async () => {
    plugin = new S3QueuePlugin({
      resource: 'emails',
      autoStart: false
    });

    await plugin.install(database);
  });

  test('should return queue stats', async () => {
    // Enqueue some messages
    await resource.enqueue({ to: 'user1@example.com', subject: 'Test', body: 'Body' });
    await resource.enqueue({ to: 'user2@example.com', subject: 'Test', body: 'Body' });
    await resource.enqueue({ to: 'user3@example.com', subject: 'Test', body: 'Body' });

    const stats = await resource.queueStats();

    expect(stats.total).toBe(3);
    expect(stats.pending).toBe(3);
    expect(stats.processing).toBe(0);
    expect(stats.completed).toBe(0);
  });

  test('should track completed messages', async () => {
    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    await resource.startProcessing(async (email) => {
      return { sent: true };
    }, { concurrency: 1 });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    await resource.stopProcessing();

    const stats = await resource.queueStats();

    expect(stats.completed).toBe(1);
    expect(stats.pending).toBe(0);
  });
});
