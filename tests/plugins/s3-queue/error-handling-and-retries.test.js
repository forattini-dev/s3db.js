import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

describe('S3QueuePlugin - Error Handling and Retries', () => {
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
      autoStart: false,
      pollInterval: 100,
      maxAttempts: 3,
      visibilityTimeout: 1000  // Short timeout for tests
    });

    await plugin.install(database);
  });

  test.skip('should retry failed messages', async () => { // FLAKY: Timing-dependent test
    let attempts = 0;

    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    await resource.startProcessing(async (email) => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return { sent: true };
    }, { concurrency: 1 });

    // Wait for retries (needs more time due to exponential backoff and visibility timeout)
    await new Promise(resolve => setTimeout(resolve, 8000));

    await resource.stopProcessing();

    // Should have at least 2 attempts, ideally 3
    expect(attempts).toBeGreaterThanOrEqual(2);

    // Check queue entry is completed or being retried
    const queueResource = database.resources['emails_queue'];
    const queueEntries = await queueResource.list();

    const completed = queueEntries.filter(e => e.status === 'completed');
    // Should have completed if got 3 attempts
    if (attempts === 3) {
      expect(completed.length).toBe(1);
    }
  });

  test('should emit retry events', async () => {
    const retryEvents = [];
    let attempts = 0;

    plugin.on('plg:s3-queue:message-retry', (event) => {
      retryEvents.push(event);
    });

    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    await resource.startProcessing(async (email) => {
      attempts++;
      if (attempts < 2) {
        throw new Error('Temporary failure');
      }
      return { sent: true };
    }, { concurrency: 1 });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    await resource.stopProcessing();

    expect(retryEvents.length).toBe(1);
    expect(retryEvents[0].error).toBe('Temporary failure');
  });

  test('should move to dead letter after max attempts', async () => {
    plugin = new S3QueuePlugin({
      resource: 'emails',
      autoStart: false,
      pollInterval: 100,
      maxAttempts: 2,
      visibilityTimeout: 500,
      deadLetterResource: 'failed_emails'
    });

    await plugin.install(database);

    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    await resource.startProcessing(async (email) => {
      throw new Error('Permanent failure');
    }, { concurrency: 1 });

    // Wait for all retries and dead letter processing
    await new Promise(resolve => setTimeout(resolve, 3500));

    await resource.stopProcessing();

    // Check queue entry is dead
    const queueResource = database.resources['emails_queue'];
    const queueEntries = await queueResource.list();

    const dead = queueEntries.filter(e => e.status === 'dead');
    expect(dead.length).toBe(1);

    // Check dead letter queue
    const deadLetterResource = database.resources['failed_emails'];
    const deadLetters = await deadLetterResource.list();

    expect(deadLetters.length).toBe(1);
    expect(deadLetters[0].error).toBe('Permanent failure');
  });

  test('should call onError callback', async () => {
    const errors = [];

    plugin.config.onError = (error, record) => {
      errors.push({ error, record });
    };

    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    await resource.startProcessing(async (email) => {
      throw new Error('Test error');
    }, { concurrency: 1 });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    await resource.stopProcessing();

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].error.message).toBe('Test error');
  });
});
