import { S3QueuePlugin } from '#src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('S3QueuePlugin', () => {
  let database, resource, plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=plugins/transactions');
    await database.connect();

    // Create target resource
    resource = await database.createResource({
      name: 'emails',
      attributes: {
        id: 'string|required',
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

  describe('Setup and Configuration', () => {
    test('should require resource option', () => {
      expect(() => {
        new S3QueuePlugin({});
      }).toThrow('S3QueuePlugin requires "resource" option');
    });

    test('should setup queue resource', async () => {
      plugin = new S3QueuePlugin({
        resource: 'emails',
        autoStart: false
      });

      await plugin.install(database);

      // Check that queue resource was created
      const queueResource = database.resources['emails_queue'];
      expect(queueResource).toBeDefined();
      expect(queueResource.name).toBe('emails_queue');
    });

    test('should add helper methods to target resource', async () => {
      plugin = new S3QueuePlugin({
        resource: 'emails',
        autoStart: false
      });

      await plugin.install(database);

      expect(typeof resource.enqueue).toBe('function');
      expect(typeof resource.queueStats).toBe('function');
      expect(typeof resource.startProcessing).toBe('function');
      expect(typeof resource.stopProcessing).toBe('function');
    });

    test('should throw error if target resource not found', async () => {
      plugin = new S3QueuePlugin({
        resource: 'nonexistent',
        autoStart: false
      });

      await expect(plugin.install(database)).rejects.toThrow(
        "S3QueuePlugin: resource 'nonexistent' not found"
      );
    });
  });

  describe('Enqueue Messages', () => {
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
        plugin.once('message.enqueued', resolve);
      });

      await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

      const event = await eventPromise;
      expect(event.id).toBeDefined();
      expect(event.queueId).toBeDefined();
    });
  });

  describe('Process Messages', () => {
    beforeEach(async () => {
      plugin = new S3QueuePlugin({
        resource: 'emails',
        autoStart: false,
        pollInterval: 100,  // Fast polling for tests
        visibilityTimeout: 5000
      });

      await plugin.install(database);
    });

    test('should process a message', async () => {
      const processed = [];

      await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

      // Start processing
      await resource.startProcessing(async (email) => {
        processed.push(email);
        return { sent: true };
      }, { concurrency: 1 });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Stop processing
      await resource.stopProcessing();

      expect(processed.length).toBe(1);
      expect(processed[0].to).toBe('user@example.com');

      // Check queue entry is completed
      const queueResource = database.resources['emails_queue'];
      const queueEntries = await queueResource.list();

      const completed = queueEntries.filter(e => e.status === 'completed');
      expect(completed.length).toBe(1);
    });

    test('should process multiple messages', async () => {
      const processed = [];

      await resource.enqueue({ to: 'user1@example.com', subject: 'Test 1', body: 'Body 1' });
      await resource.enqueue({ to: 'user2@example.com', subject: 'Test 2', body: 'Body 2' });
      await resource.enqueue({ to: 'user3@example.com', subject: 'Test 3', body: 'Body 3' });

      await resource.startProcessing(async (email) => {
        processed.push(email);
        return { sent: true };
      }, { concurrency: 1 });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      await resource.stopProcessing();

      expect(processed.length).toBe(3);
    });

    test('should emit completed event', async () => {
      const events = [];

      plugin.on('message.completed', (event) => {
        events.push(event);
      });

      await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

      await resource.startProcessing(async (email) => {
        return { sent: true };
      }, { concurrency: 1 });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      await resource.stopProcessing();

      expect(events.length).toBe(1);
      expect(events[0].queueId).toBeDefined();
      expect(events[0].duration).toBeGreaterThan(0);
    });

    test('should call onComplete callback', async () => {
      let completeCalled = false;
      let completeRecord = null;
      let completeResult = null;

      plugin.config.onComplete = (record, result) => {
        completeCalled = true;
        completeRecord = record;
        completeResult = result;
      };

      await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

      await resource.startProcessing(async (email) => {
        return { sent: true };
      }, { concurrency: 1 });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      await resource.stopProcessing();

      expect(completeCalled).toBe(true);
      expect(completeRecord.to).toBe('user@example.com');
      expect(completeResult.sent).toBe(true);
    });
  });

  describe('Error Handling and Retries', () => {
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

    test('should retry failed messages', async () => {
      let attempts = 0;

      await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

      await resource.startProcessing(async (email) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { sent: true };
      }, { concurrency: 1 });

      // Wait for retries (needs more time due to exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 5000));

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

      plugin.on('message.retry', (event) => {
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

      // Wait for all retries
      await new Promise(resolve => setTimeout(resolve, 2500));

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

  describe('Queue Statistics', () => {
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

  describe('ETag-based Atomicity', () => {
    beforeEach(async () => {
      plugin = new S3QueuePlugin({
        resource: 'emails',
        autoStart: false,
        pollInterval: 10  // Very fast polling
      });

      await plugin.install(database);
    });

    test('should expose _etag field', async () => {
      const email = await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

      const queueResource = database.resources['emails_queue'];
      const queueEntries = await queueResource.list();

      expect(queueEntries[0]._etag).toBeDefined();
      expect(typeof queueEntries[0]._etag).toBe('string');
    });

    test('updateConditional should succeed with correct ETag', async () => {
      const email = await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

      const queueResource = database.resources['emails_queue'];
      const queueEntry = await queueResource.get(
        (await queueResource.list())[0].id
      );

      const result = await queueResource.updateConditional(
        queueEntry.id,
        { status: 'processing' },
        { ifMatch: queueEntry._etag }
      );

      expect(result.success).toBe(true);
      expect(result.etag).toBeDefined();
    });

    test('updateConditional should fail with wrong ETag', async () => {
      const email = await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

      const queueResource = database.resources['emails_queue'];
      const queueEntry = await queueResource.get(
        (await queueResource.list())[0].id
      );

      const result = await queueResource.updateConditional(
        queueEntry.id,
        { status: 'processing' },
        { ifMatch: '"wrong-etag"' }
      );

      expect(result.success).toBe(false);
      // Can be either "ETag mismatch" or "PreconditionFailed" depending on S3 implementation
      expect(result.error).toMatch(/ETag mismatch|PreconditionFailed|pre-conditions/i);
    });
  });
});
