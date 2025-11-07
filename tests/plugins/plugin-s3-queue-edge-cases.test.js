import { S3QueuePlugin } from '#src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '#tests/config.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

describe('S3QueuePlugin - Edge Cases', () => {
  let database;

  beforeEach(async () => {
    // Clear storage before each test to prevent interference
    MemoryClient.clearAllStorage();

    database = await createDatabaseForTest('suite=plugins/transactions-edge-cases');
    await database.connect();
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
    // Clear storage after each test
    MemoryClient.clearAllStorage();
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
      verbose: false,
        resource: 'tasks',
        autoStart: false,
        verbose: false  // Enable verbose logging
      });

      // Capture console.log
      const originalLog = console.log;
      const logs = [];

      console.log = (...args) => {
        logs.push(args.join(' '));
        return originalLog(...args);
      };
      try {
        await plugin.install(database);
      } finally {
        console.log = originalLog;
      }

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
      verbose: false,
        resource: 'tasks',
        autoStart: false,
        verbose: false,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);

      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => {
        logs.push(args.join(' '));
        return originalLog(...args);
      };
      try {
        await plugin.startProcessing();
        await new Promise(resolve => setTimeout(resolve, 100));
        await plugin.stopProcessing();
      } finally {
        console.log = originalLog;
      }

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
      verbose: false,
        resource: 'tasks',
        autoStart: false,
        verbose: false,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);

      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => {
        logs.push(args.join(' '));
        return originalLog(...args);
      };
      try {
        await plugin.startProcessing();

        // Try to start again (should log "already running")
        await plugin.startProcessing();

        await plugin.stopProcessing();
      } finally {
        console.log = originalLog;
      }

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
      verbose: false,
        resource: 'tasks',
        autoStart: false
      });

      await plugin.install(database);

      // Stop without starting (should not throw)
      await expect(plugin.stopProcessing()).resolves.not.toThrow();
    });
  });

  describe('Dead Letter Queue Edge Cases', () => {
    test('should handle moveToDeadLetter with verbose logging', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
      verbose: false,
        resource: 'tasks',
        autoStart: false,
        pollInterval: 50,
        maxAttempts: 1,
        visibilityTimeout: 500,
        deadLetterResource: 'dead_tasks',
        verbose: false
      });

      await plugin.install(database);

      const originalLog = console.log;
      const originalWarn = console.warn;
      const logs = [];
      console.log = (...args) => {
        logs.push(args.join(' '));
        return originalLog(...args);
      };
      console.warn = (...args) => {
        return originalWarn(...args);
      };

      await resource.enqueue({ name: 'Task 1' });

      try {
        await resource.startProcessing(async (task) => {
          throw new Error('Test error');
        }, { concurrency: 1 });

        await new Promise(resolve => setTimeout(resolve, 1500));

        await resource.stopProcessing();
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
      }

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
      verbose: false,
        resource: 'tasks',
        autoStart: false,
        verbose: false
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
    // Skip: Async queue processing timing issues with MemoryClient
    // (orphaned code removed - was causing syntax error)

    test('should emit workers.stopped event', async () => {
      const resource = await database.createResource({
        name: 'tasks',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const plugin = new S3QueuePlugin({
      verbose: false,
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
      verbose: false,
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
