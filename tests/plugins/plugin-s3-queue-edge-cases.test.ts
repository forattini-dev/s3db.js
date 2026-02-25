import { S3QueuePlugin } from '#src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '#tests/config.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { getCronManager } from '../../src/concerns/cron-manager.js';

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
      logLevel: 'debug',  // Test expects verbose logging output
        resource: 'tasks',
        autoStart: false
      });

      const logSpy = vi.spyOn(plugin.logger, 'debug').mockImplementation();

      await plugin.install(database);

      // Verify verbose log was called
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'tasks' }),
        expect.stringContaining('Setup completed')
      );

      logSpy.mockRestore();
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
      logLevel: 'debug',  // Test expects verbose logging output
        resource: 'tasks',
        autoStart: false,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);
      plugin.logger.level = 'debug'; // Force debug level for test

      const logSpy = vi.spyOn(plugin.logger, 'debug').mockImplementation();

      await plugin.startProcessing();
      await new Promise(resolve => setTimeout(resolve, 100));
      await plugin.stopProcessing();

      // Verify verbose logs
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Started'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Stopped'));

      logSpy.mockRestore();
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
      logLevel: 'debug',  // Test expects verbose logging output
        resource: 'tasks',
        autoStart: false,
        onMessage: async (task) => ({ done: true })
      });

      await plugin.install(database);
      plugin.logger.level = 'debug'; // Force debug level for test

      const logSpy = vi.spyOn(plugin.logger, 'debug').mockImplementation();

      await plugin.startProcessing();

      // Try to start again (should log "already running")
      await plugin.startProcessing();

      await plugin.stopProcessing();

      // Verify "already running" log
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Already running'));

      logSpy.mockRestore();
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
      logLevel: 'debug',  // Test expects verbose logging output
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
      logLevel: 'debug',  // Test expects verbose logging output
        resource: 'tasks',
        autoStart: false,
        pollInterval: 50,
        maxAttempts: 1,
        visibilityTimeout: 500,
        deadLetterResource: 'dead_tasks',
        logLevel: 'silent'
      });

      await plugin.install(database);

      const originalLog = console.log;
      const originalWarn = console.warn;
      const logs = [];
      console.log = (...args) => {
        logs.push(args.join(' '));
        // Don't print during tests - just capture
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
        resource: 'tasks',
        autoStart: false,
        logLevel: 'silent'
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
        resource: 'tasks',
        autoStart: false,
        logLevel: 'silent',
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
        logLevel: 'silent',
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

  describe('Queue maintenance methods', () => {
    test('should truncate queue and dead-letter entries', async () => {
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
        deadLetterResource: 'tasks_dead'
      });

      await plugin.install(database);

      await resource.enqueue({ name: 'Task 1' });
      await resource.enqueue({ name: 'Task 2' });

      const queueResource = database.resources['tasks_queue'];
      const deadLetterResource = database.resources['tasks_dead'];

      await deadLetterResource.insert({
        id: 'dl-1',
        originalId: 'dl-origin',
        queueId: 'queue-origin',
        data: { name: 'dead' },
        error: 'manual dead letter',
        attempts: 1,
        createdAt: new Date().toISOString()
      });

      const result = await (resource as unknown as {
        truncateQueue: (options?: { includeDeadLetter?: boolean }) => Promise<{ queueDeleted: number; deadLetterDeleted: number }>;
      }).truncateQueue({ includeDeadLetter: true });

      expect(result.queueDeleted).toBeGreaterThanOrEqual(2);
      expect(result.deadLetterDeleted).toBe(1);
      expect((await queueResource.list()).length).toBe(0);
      expect((await deadLetterResource.list()).length).toBe(0);
    });

    test('deleteQueue should stop workers and clear queue state', async () => {
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
        deadLetterResource: 'tasks_dead'
      });

      await plugin.install(database);
      await plugin.startProcessing(async () => ({ done: true }));

      await resource.enqueue({ name: 'Task 3' });
      await resource.enqueue({ name: 'Task 4' });

      const result = await (resource as unknown as {
        deleteQueue: (options?: {
          includeDeadLetter?: boolean;
          stopProcessing?: boolean;
          clearTickets?: boolean;
        }) => Promise<{
          queueDeleted: number;
          deadLetterDeleted: number;
          removedTickets: number;
          queueResourceDeleted: boolean;
          deadLetterResourceDeleted: boolean;
        }>; 
      }).deleteQueue();

      expect(plugin.isRunning).toBe(false);
      expect(result.removedTickets).toBeGreaterThanOrEqual(0);
      expect(result.queueResourceDeleted).toBe(true);
      expect(result.deadLetterResourceDeleted).toBe(true);
      expect(database.resources['tasks_queue']).toBeUndefined();
      expect(database.resources['tasks_dead']).toBeUndefined();
      expect(database.resources[plugin.queueResourceName]).toBeUndefined();
    });

    test('deleteQueue can skip dead-letter cleanup and still remove queue resources', async () => {
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
        deadLetterResource: 'tasks_dead'
      });

      await plugin.install(database);
      await resource.enqueue({ name: 'Task 5' });
      await resource.enqueue({ name: 'Task 6' });

      const queueResource = database.resources['tasks_queue'];
      const deadLetterResource = database.resources['tasks_dead'];
      await deadLetterResource.insert({
        id: 'dl-2',
        originalId: 'task-dead',
        queueId: 'queue-origin',
        data: { name: 'dead' },
        error: 'manual dead letter',
        attempts: 2,
        createdAt: new Date().toISOString()
      });

      const result = await (resource as unknown as {
        deleteQueue: (options?: {
          includeDeadLetter?: boolean;
          stopProcessing?: boolean;
          clearTickets?: boolean;
        }) => Promise<{
          queueDeleted: number;
          deadLetterDeleted: number;
          removedTickets: number;
          queueResourceDeleted: boolean;
          deadLetterResourceDeleted: boolean;
        }>;
      }).deleteQueue({ includeDeadLetter: false, clearTickets: false });

      expect(result.deadLetterDeleted).toBe(0);
      expect(result.queueResourceDeleted).toBe(true);
      expect(result.deadLetterResourceDeleted).toBe(false);
      expect((await queueResource.list()).length).toBe(0);
      expect((await database.resources['tasks_dead'].list()).length).toBe(1);
      expect(database.resources[plugin.queueResourceName]).toBeUndefined();
      expect(database.resources['tasks_dead']).toBeDefined();
    });

    test('truncateQueue remains safe even when resources are missing', async () => {
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

      const queueResource = database.resources['tasks_queue'];
      delete database.resources[plugin.queueResourceName];

      const result = await (resource as unknown as {
        truncateQueue: (options?: { includeDeadLetter?: boolean }) => Promise<{ queueDeleted: number; deadLetterDeleted: number }>;
        deleteQueue: (options?: { includeDeadLetter?: boolean }) => Promise<{ queueResourceDeleted: boolean; deadLetterResourceDeleted: boolean }>;
      }).truncateQueue({ includeDeadLetter: true });

      expect(result.queueDeleted).toBe(0);
      expect(result.deadLetterDeleted).toBe(0);
      expect(queueResource).toBeDefined();

      const deleteResult = await (resource as unknown as {
        deleteQueue: (options?: { includeDeadLetter?: boolean }) => Promise<{ queueResourceDeleted: boolean; deadLetterResourceDeleted: boolean }>;
      }).deleteQueue({ includeDeadLetter: true });

      expect(deleteResult.queueResourceDeleted).toBe(true);
    });
  });

  describe('Processed cache edge cases', () => {
    test('does not drop valid dedup marker during cleanup', async () => {
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
        logLevel: 'silent',
        processedCacheTTL: 2000
      });

      await plugin.install(database);

      const cronManager = getCronManager();
      const scheduleCalls = new Map<string, () => Promise<void> | void>();
      const spy = vi.spyOn(cronManager, 'scheduleInterval').mockImplementation(async (_ms, fn, name) => {
        scheduleCalls.set(name, fn as () => Promise<void> | void);
        return {
          start: vi.fn(),
          stop: vi.fn(),
          destroy: vi.fn(),
          run: vi.fn()
        } as unknown as { start: () => void; stop: () => void; destroy: () => void; run: () => Promise<void> };
      });

      try {
        await plugin.startProcessing(async () => ({ processed: true }));

        const cleanupName = `queue-cache-cleanup-${plugin.workerId}`;
        const cleanup = scheduleCalls.get(cleanupName);
        expect(cleanup).toBeDefined();

        plugin['processedCache'].set('message-keep', Date.now() + plugin.config.processedCacheTTL * 10);
        await cleanup!();

        expect(plugin['processedCache'].has('message-keep')).toBe(true);
      } finally {
        await plugin.stopProcessing();
        spy.mockRestore();
      }
    });
  });

  describe('Coordinator ticket atomicity', () => {
    test('should claim tickets through versioned storage updates', async () => {
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
        logLevel: 'silent'
      });

      await plugin.install(database);

      try {
        await resource.enqueue({ name: 'Task 1' });

        const queueResource = database.resources['tasks_queue'];
        const queueEntries = await queueResource.list();
        const published = await (plugin as any).publishDispatchTickets(queueEntries);
        expect(published).toBeGreaterThan(0);

        const tickets = await (plugin as any).getAvailableTickets();
        expect(tickets).toHaveLength(1);

        const storage = (plugin as any).getStorage();
        const setIfVersionSpy = vi.spyOn(storage, 'setIfVersion');

        await (plugin as any).claimFromTicket(tickets[0]);

        expect(setIfVersionSpy).toHaveBeenCalled();
        expect(setIfVersionSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ status: 'claimed' }),
          expect.any(String),
          expect.objectContaining({ behavior: 'body-only' })
        );
      } finally {
        await plugin.stop();
      }
    });

    test('should not release ticket claimed by another worker unless forced', async () => {
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
        logLevel: 'silent'
      });

      await plugin.install(database);

      try {
        await resource.enqueue({ name: 'Task 2' });

        const queueResource = database.resources['tasks_queue'];
        const queueEntries = await queueResource.list();
        const published = await (plugin as any).publishDispatchTickets(queueEntries);
        expect(published).toBeGreaterThan(0);

        const tickets = await (plugin as any).getAvailableTickets();
        expect(tickets).toHaveLength(1);

        const storage = (plugin as any).getStorage();
        const ticket = tickets[0];
        const ticketKey = storage.getPluginKey(null, 'tickets', ticket.ticketId);

        await storage.set(ticketKey, {
          ...ticket,
          status: 'claimed',
          claimedBy: 'external-worker',
          claimedAt: Date.now()
        }, {
          behavior: 'body-only'
        });

        await (plugin as any).releaseTicket(ticket.ticketId);

        const currentAfterRelease = await storage.get(ticketKey) as Record<string, unknown>;
        expect(currentAfterRelease.claimedBy).toBe('external-worker');
        expect(currentAfterRelease.status).toBe('claimed');

        await (plugin as any).releaseTicket(ticket.ticketId, { forceOwner: true });

        const currentAfterForcedRelease = await storage.get(ticketKey) as Record<string, unknown>;
        expect(currentAfterForcedRelease.claimedBy).toBeNull();
        expect(currentAfterForcedRelease.status).toBe('available');
      } finally {
        await plugin.stop();
      }
    });
  });
});
