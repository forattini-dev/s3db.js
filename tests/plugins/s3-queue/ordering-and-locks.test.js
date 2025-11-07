import { describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForCondition(predicate, { timeout = 10000, interval = 25 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) return true;
    if (Date.now() - start > timeout) {
      throw new Error('waitForCondition timed out');
    }
    await sleep(interval);
  }
}

// Updated to work with coordinator mode enabled by default (v14.2.0+)
// Tests verify both coordinator and non-coordinator behavior
describe('S3QueuePlugin - Ordering & Locks', () => {
  let database;
  let resource;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=plugins/s3-queue-ordering');
    await database.connect();

    resource = await database.createResource({
      name: 'jobs',
      attributes: {
        id: 'string|optional',
        payload: 'string|required'
      }
    });
  });

  afterEach(async () => {
    if (resource) {
      await resource.stopProcessing?.();
    }
    if (plugin) {
      await plugin.stop();
    }
    if (database) {
      await database.disconnect();
    }
  });

  test('enforces FIFO ordering when orderingGuarantee is true', async () => {
    plugin = new S3QueuePlugin({
      resource: 'jobs',
      autoStart: false,
      visibilityTimeout: 2000,
      pollInterval: 50,
      concurrency: 4,
      enableCoordinator: true,
      heartbeatInterval: 500,
      dispatchInterval: 100,
      verbose: false
    });

    await plugin.install(database);

    const processed = [];
    const totalMessages = 6;

    for (let i = 0; i < totalMessages; i++) {
      await resource.enqueue({ id: `job-${i}`, payload: `payload-${i}` });
    }

    await plugin.startProcessing(async (job) => {
      processed.push(job.id);
    }, { concurrency: 4 });

    await waitForCondition(() => processed.length === totalMessages, { timeout: 25000 });
    await plugin.stopProcessing();

    expect(processed).toEqual(Array.from({ length: totalMessages }, (_, i) => `job-${i}`));
  }, 30000);

  test('supports LIFO ordering when configured', async () => {
    plugin = new S3QueuePlugin({
      resource: 'jobs',
      autoStart: false,
      visibilityTimeout: 2000,
      pollInterval: 50,
      orderingMode: 'lifo',
      enableCoordinator: true,
      heartbeatInterval: 500,
      dispatchInterval: 100,
      verbose: false
    });

    await plugin.install(database);

    const processed = [];
    const totalMessages = 5;

    for (let i = 0; i < totalMessages; i++) {
      await resource.enqueue({ id: `job-${i}`, payload: `payload-${i}` });
    }

    await plugin.startProcessing(async (job) => {
      processed.push(job.id);
    }, { concurrency: 1 });

    await waitForCondition(() => processed.length === totalMessages, { timeout: 25000 });
    await plugin.stopProcessing();

    expect(processed).toEqual(Array.from({ length: totalMessages }, (_, i) => `job-${totalMessages - 1 - i}`));
  }, 30000);

  test('emits best-effort ordering event when guarantee disabled', async () => {
    plugin = new S3QueuePlugin({
      resource: 'jobs',
      autoStart: false,
      visibilityTimeout: 2000,
      pollInterval: 50,
      concurrency: 2,
      orderingGuarantee: false,
      enableCoordinator: true,
      heartbeatInterval: 500,
      verbose: false
    });

    await plugin.install(database);

    const bestEffortEvents = [];
    plugin.once('plg:s3-queue:ordering-best-effort', (event) => {
      bestEffortEvents.push(event);
    });

    await resource.enqueue({ id: 'job-1', payload: 'payload-1' });
    await plugin.startProcessing(async () => {
      // No-op
    }, { concurrency: 2 });

    await waitForCondition(() => bestEffortEvents.length === 1, { timeout: 25000 });
    await plugin.stopProcessing();

    expect(bestEffortEvents[0]).toMatchObject({
      orderingMode: 'fifo',
      orderingGuarantee: false
    });
  }, 30000);

  test('prevents duplicate processing with high concurrency', async () => {
    plugin = new S3QueuePlugin({
      resource: 'jobs',
      autoStart: false,
      visibilityTimeout: 2000,
      pollInterval: 20,
      concurrency: 25,
      orderingGuarantee: false,
      enableCoordinator: true,
      heartbeatInterval: 500,
      dispatchInterval: 50,
      ticketBatchSize: 10,
      verbose: false
    });

    await plugin.install(database);

    const processedIds = [];
    const totalMessages = 30;

    for (let i = 0; i < totalMessages; i++) {
      await resource.enqueue({ id: `job-${i}`, payload: `payload-${i}` });
    }

    await plugin.startProcessing(async (job) => {
      processedIds.push(job.id);
      await sleep(10); // simulate small processing delay
    }, { concurrency: 25 });

    await waitForCondition(() => processedIds.length === totalMessages, { timeout: 30000 });
    await plugin.stopProcessing();

    const unique = new Set(processedIds);
    expect(unique.size).toBe(totalMessages);
  }, 45000);

  test('allows workers to renew message locks', async () => {
    plugin = new S3QueuePlugin({
      resource: 'jobs',
      autoStart: false,
      visibilityTimeout: 200,
      pollInterval: 20,
      maxAttempts: 2,
      enableCoordinator: true,
      heartbeatInterval: 500,
      verbose: false
    });

    await plugin.install(database);
    await resource.enqueue({ id: 'job-renew', payload: 'renew-me' });

    const renewResults = [];
    const attemptsSeen = [];

    await plugin.startProcessing(async (job, ctx) => {
      attemptsSeen.push(ctx.attempts);
      await sleep(150);
      renewResults.push(await ctx.renewLock(400));
      await sleep(150);
    }, { concurrency: 1 });

    await waitForCondition(() => renewResults.length === 1, { timeout: 25000 });
    await plugin.stopProcessing();

    expect(renewResults[0]).toBe(true);
    expect(attemptsSeen).toEqual([1]);

    const queueResource = database.resources[plugin.queueResourceName];
    const entries = await queueResource.query({ originalId: 'job-renew' }, { limit: 1 });
    expect(entries[0].status).toBe('completed');
    expect(entries[0].attempts).toBe(1);
  }, 30000);

  test('handles three competing clients without duplicates', async () => {
    const baseOptions = {
      resource: 'jobs',
      autoStart: false,
      visibilityTimeout: 500,
      pollInterval: 25,
      orderingGuarantee: true,
      enableCoordinator: true,
      heartbeatInterval: 500,
      dispatchInterval: 100,
      ticketBatchSize: 5,
      verbose: false
    };

    const pluginA = new S3QueuePlugin({ ...baseOptions });
    const pluginB = new S3QueuePlugin({ ...baseOptions });
    const pluginC = new S3QueuePlugin({ ...baseOptions });

    await pluginA.install(database);
    await pluginB.install(database);
    await pluginC.install(database);

    const processed = [];
    const handler = (client) => async (job) => {
      processed.push({ client, id: job.id });
      await sleep(5);
    };

    try {
      await pluginA.startProcessing(handler('client-a'), { concurrency: 1 });
      await pluginB.startProcessing(handler('client-b'), { concurrency: 1 });
      await pluginC.startProcessing(handler('client-c'), { concurrency: 1 });

      const totalMessages = 15;
      for (let i = 0; i < totalMessages; i++) {
        await resource.enqueue({ id: `job-${i}`, payload: `payload-${i}` });
      }

      await waitForCondition(() => processed.length === totalMessages, { timeout: 30000, interval: 20 });

      const uniqueIds = new Set(processed.map(entry => entry.id));
      expect(uniqueIds.size).toBe(totalMessages);

      const clients = new Set(processed.map(entry => entry.client));
      expect(clients.size).toBe(3);
    } finally {
      await pluginA.stopProcessing();
      await pluginB.stopProcessing();
      await pluginC.stopProcessing();
      await pluginA.stop();
      await pluginB.stop();
      await pluginC.stop();
    }

    plugin = null;
  }, 60000);
});
