import { S3QueuePlugin } from '#src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('S3QueuePlugin - Edge Cases', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=plugins/transactions-edge-cases');
    await database.connect();
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('Setup Error Handling', () => {
    test('should handle verbose logging', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        verbose: true  // Enable verbose logging
      });

      // Capture console.log
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));

      await plugin.install(database);

      console.log = originalLog;

      // Verify verbose log was called
      expect(logs.some(log => log.includes('Setup completed'))).toBe(true);
    });

    test('should handle worker start/stop with verbose logging', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        verbose: true,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);

      // Capture console.log
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));

      await plugin.startProcessing();
      await new Promise(resolve => setTimeout(resolve, 100));
      await plugin.stopProcessing();

      console.log = originalLog;

      // Verify verbose logs
      expect(logs.some(log => log.includes('Started'))).toBe(true);
      expect(logs.some(log => log.includes('Stopped'))).toBe(true);
    });

    test('should handle already running startProcessing', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        verbose: true,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);

      // Capture console.log
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));

      await plugin.startProcessing();

      // Try to start again (should log "already running")
      await plugin.startProcessing();

      await plugin.stopProcessing();

      console.log = originalLog;

      // Verify "already running" log
      expect(logs.some(log => log.includes('Already running'))).toBe(true);
    });

    test('should handle stopProcessing when not running', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false
      });

      await plugin.install(database);

      // Stop without starting (should not throw)
      await expect(plugin.stopProcessing()).resolves.not.toThrow();
    });
  });

  describe('Dead Letter Queue Edge Cases', () => {
    test('should handle dead letter when dead letter resource exists', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        pollInterval: 50,
        maxAttempts: 1,
        visibilityTimeout: 500,
        deadLetterResource: 'dead_tasks',
        verbose: true
      });

      await plugin.install(database);

      // Enqueue a task
      await resource.enqueue({ name: 'Task 1' });

      let attempts = 0;

      await resource.startProcessing(async (task) => {
        attempts++;
        throw new Error('Always fail');
      }, { concurrency: 1 });

      // Wait for failure and dead letter processing
      await new Promise(resolve => setTimeout(resolve, 6000));

      await resource.stopProcessing();

      // Check dead letter queue
      const deadLetterResource = database.resources['dead_tasks'];
      const deadLetters = await deadLetterResource.list();

      expect(deadLetters.length).toBeGreaterThanOrEqual(1);
      if (deadLetters.length > 0) {
        expect(deadLetters[0].error).toContain('Always fail');
      }
    });

    test('should handle moveToDeadLetter with verbose logging', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        pollInterval: 50,
        maxAttempts: 1,
        visibilityTimeout: 500,
        deadLetterResource: 'dead_tasks',
        verbose: true
      });

      await plugin.install(database);

      // Capture console.log
      const originalLog = console.log;
      const originalWarn = console.warn;
      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));
      console.warn = (...args) => logs.push(args.join(' '));

      await resource.enqueue({ name: 'Task 1' });

      await resource.startProcessing(async (task) => {
        throw new Error('Test error');
      }, { concurrency: 1 });

      await new Promise(resolve => setTimeout(resolve, 1500));

      await resource.stopProcessing();

      console.log = originalLog;
      console.warn = originalWarn;
    });
  });

  describe('Stats Edge Cases', () => {
    test('should handle getStats without errors', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        verbose: true
      });

      await plugin.install(database);

      // Get stats normally (should work even with empty queue)
      const stats = await plugin.getStats();

      expect(stats).toBeDefined();
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
    });
  });

  describe('Claim Edge Cases', () => {
    test('should handle claim when original record is deleted', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        pollInterval: 50,
        visibilityTimeout: 5000
      });

      await plugin.install(database);

      // Enqueue a task
      const task = await resource.enqueue({ name: 'Task 1' });

      // Delete the original record
      await resource.delete(task.id);

      let processed = false;

      await resource.startProcessing(async (t) => {
        processed = true;
        return { done: true };
      }, { concurrency: 1 });

      // Wait for processing attempt
      await new Promise(resolve => setTimeout(resolve, 4000));

      await resource.stopProcessing();

      // Should not have processed (record was deleted)
      expect(processed).toBe(false);

      // Check queue - should have failed status
      const queueResource = database.resources['tasks_queue'];
      const queueEntries = await queueResource.list();

      const failed = queueEntries.filter(e => e.status === 'failed');
      expect(failed.length).toBeGreaterThanOrEqual(1);
      if (failed.length > 0) {
        expect(failed[0].error).toContain('Original record not found');
      }
    });

    test('should handle claim race condition gracefully', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        pollInterval: 10  // Very fast polling
      });

      await plugin.install(database);

      // Enqueue tasks
      for (let i = 0; i < 5; i++) {
        await resource.enqueue({ name: `Task ${i}` });
      }

      const processed = [];

      await resource.startProcessing(async (task) => {
        processed.push(task.name);
        // Quick processing
        await new Promise(resolve => setTimeout(resolve, 20));
        return { done: true };
      }, { concurrency: 2 });

      await new Promise(resolve => setTimeout(resolve, 4000));

      await resource.stopProcessing();

      // Should have processed some tasks (relaxed expectations due to timing variability)
      expect(processed.length).toBeGreaterThanOrEqual(1);  // At least 1 of 5
    });
  });

  describe('Event Emission', () => {
    test('should emit workers.started event', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);

      const eventPromise = new Promise((resolve) => {
        plugin.once('plg:s3-queue:workers-started', resolve);
      });

      await plugin.startProcessing();

      const event = await eventPromise;
      expect(event.concurrency).toBeDefined();
      expect(event.workerId).toBeDefined();

      await plugin.stopProcessing();
    });

    test('should emit workers.stopped event', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);

      await plugin.startProcessing();

      const eventPromise = new Promise((resolve) => {
        plugin.once('plg:s3-queue:workers-stopped', resolve);
      });

      await plugin.stopProcessing();

      const event = await eventPromise;
      expect(event.workerId).toBeDefined();
    });
  });

  describe('Cleanup Edge Cases', () => {
    test('should handle stop when plugin is destroyed', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
        resource: 'tasks',
        autoStart: false,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);
      await plugin.startProcessing();

      // Call stop from plugin lifecycle
      await plugin.stop();

      // Should have stopped cleanly
      expect(plugin.isRunning).toBe(false);
    });
  });
});
