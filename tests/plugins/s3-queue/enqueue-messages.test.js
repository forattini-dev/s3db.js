import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

describe.skip('S3QueuePlugin - Enqueue Messages', () => {
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

  test('should enqueue a message', async () => {
    const email = await resource.enqueue({
      to: 'user@example.com',
      subject: 'Test',
      body: 'Hello World'
    });

    expect(email.id).toBeDefined();
    expect(email.to).toBe('user@example.com');

    // Check queue entry was created
    const queueResource = database.resources['emails_queue'];
    const queueEntries = await queueResource.list();

    expect(queueEntries.length).toBe(1);
    expect(queueEntries[0].originalId).toBe(email.id);
    expect(queueEntries[0].status).toBe('pending');
  });

  test('should enqueue multiple messages', async () => {
    await resource.enqueue({ to: 'user1@example.com', subject: 'Test 1', body: 'Body 1' });
    await resource.enqueue({ to: 'user2@example.com', subject: 'Test 2', body: 'Body 2' });
    await resource.enqueue({ to: 'user3@example.com', subject: 'Test 3', body: 'Body 3' });

    const queueResource = database.resources['emails_queue'];
    const queueEntries = await queueResource.list();

    expect(queueEntries.length).toBe(3);
  });

  test('should emit enqueued event', async () => {
    const eventPromise = new Promise((resolve) => {
      plugin.once('plg:s3-queue:message-enqueued', resolve);
    });

    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    const event = await eventPromise;
    expect(event.id).toBeDefined();
    expect(event.queueId).toBeDefined();
  });
});
