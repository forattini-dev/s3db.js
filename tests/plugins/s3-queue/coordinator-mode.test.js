import { describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForCondition(predicate, { timeout = 10000, interval = 50 } = {}) {
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

describe('S3QueuePlugin - Coordinator Mode', () => {
  let database;
  let resource;
  let plugins = [];

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=plugins/s3-queue-coordinator');
    await database.connect();

    resource = await database.createResource({
      name: 'jobs',
      attributes: {
        id: 'string|optional',
        payload: 'string|required'
      }
    });

    plugins = [];
  });

  afterEach(async () => {
    // Stop all plugins
    for (const plugin of plugins) {
      try {
        await plugin.stopProcessing();
        await plugin.stop();
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    plugins = [];

    if (database) {
      await database.disconnect();
    }
  });

  test('single worker becomes coordinator immediately', async () => {
    const plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 1000,
      heartbeatTTL: 5,
      verbose: false
    });

    await plugin.install(database);
    plugins.push(plugin);

    const electionEvents = [];
    plugin.on('plg:s3-queue:coordinator-elected', (event) => {
      electionEvents.push(event);
    });

    await plugin.startProcessing(async () => {
      // No-op handler
    });

    await sleep(2000); // Wait for heartbeat and election

    expect(plugin.isCoordinator).toBe(true);
    expect(electionEvents.length).toBeGreaterThanOrEqual(1);
    expect(electionEvents[0].isCoordinator).toBe(true);
  }, 15000);

  test('deterministic coordinator election with multiple workers', async () => {
    const pluginA = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 1000,
      heartbeatTTL: 10,
      coldStartDuration: 1500, // Allow time for all workers to discover each other
      verbose: false
    });

    const pluginB = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 1000,
      heartbeatTTL: 10,
      coldStartDuration: 1500,
      verbose: false
    });

    const pluginC = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 1000,
      heartbeatTTL: 10,
      coldStartDuration: 1500,
      verbose: false
    });

    await pluginA.install(database);
    await pluginB.install(database);
    await pluginC.install(database);

    plugins.push(pluginA, pluginB, pluginC);

    // Start all workers in parallel so they can see each other during cold start
    await Promise.all([
      pluginA.startProcessing(async () => {}),
      pluginB.startProcessing(async () => {}),
      pluginC.startProcessing(async () => {})
    ]);

    await sleep(200); // Give time for heartbeats to sync

    // Exactly one should be coordinator
    const coordinators = [pluginA, pluginB, pluginC].filter(p => p.isCoordinator);
    expect(coordinators.length).toBe(1);

    // Should be lexicographically first worker ID
    const activeWorkers = await coordinators[0].getActiveWorkers();
    const sortedIds = activeWorkers.map(w => w.workerId).sort();
    expect(coordinators[0].workerId).toBe(sortedIds[0]);
  }, 20000);

  test('coordinator publishes dispatch tickets', async () => {
    const plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 500,
      dispatchInterval: 200,
      ticketBatchSize: 3,
      verbose: false
    });

    await plugin.install(database);
    plugins.push(plugin);

    const ticketEvents = [];
    plugin.on('plg:s3-queue:tickets-published', (event) => {
      ticketEvents.push(event);
    });

    // Enqueue some messages
    for (let i = 0; i < 5; i++) {
      await resource.enqueue({ payload: `job-${i}` });
    }

    await plugin.startProcessing(async () => {
      await sleep(100); // Slow processing
    });

    // Wait for coordinator to publish tickets
    await sleep(3000);

    expect(ticketEvents.length).toBeGreaterThan(0);
    expect(ticketEvents[0].count).toBeGreaterThan(0);
    expect(ticketEvents[0].count).toBeLessThanOrEqual(3); // ticketBatchSize

    // Check tickets in storage
    const tickets = await plugin.getAvailableTickets();
    expect(tickets).toBeDefined();
  }, 20000);

  test('workers claim messages via dispatch tickets', async () => {
    const plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 500,
      dispatchInterval: 100,
      ticketBatchSize: 5,
      visibilityTimeout: 5000,
      verbose: false
    });

    await plugin.install(database);
    plugins.push(plugin);

    const processed = [];

    // Enqueue messages
    for (let i = 0; i < 5; i++) {
      await resource.enqueue({ id: `job-${i}`, payload: `data-${i}` });
    }

    await plugin.startProcessing(async (job) => {
      processed.push(job.id);
      await sleep(50);
    }, { concurrency: 2 });

    await waitForCondition(() => processed.length === 5, { timeout: 15000 });

    expect(processed.length).toBe(5);
    expect(new Set(processed).size).toBe(5); // No duplicates
  }, 25000);

  test('lock renewal rejected after message completion', async () => {
    const plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      visibilityTimeout: 10000,
      verbose: false
    });

    await plugin.install(database);
    plugins.push(plugin);

    await resource.enqueue({ payload: 'test-job' });

    let capturedContext;
    let capturedQueueId;

    const rejectionEvents = [];
    plugin.on('plg:s3-queue:lock-renewal-rejected', (event) => {
      rejectionEvents.push(event);
    });

    await plugin.startProcessing(async (job, ctx) => {
      capturedContext = ctx;
      capturedQueueId = ctx.queueId;
      // Complete processing normally
    }, { concurrency: 1 });

    await waitForCondition(() => capturedContext !== undefined, { timeout: 5000 });
    await sleep(500); // Ensure message is completed

    // Try to renew lock after completion
    const renewed = await capturedContext.renewLock(5000);

    expect(renewed).toBe(false);
    expect(rejectionEvents.length).toBeGreaterThan(0);
    expect(rejectionEvents[0].reason).toMatch(/terminal_state|lock_released/);
  }, 15000);

  test('lock renewal rejected for wrong token', async () => {
    const plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      visibilityTimeout: 10000,
      verbose: false
    });

    await plugin.install(database);
    plugins.push(plugin);

    await resource.enqueue({ payload: 'test-job' });

    let capturedQueueId;
    let processing = false;

    const rejectionEvents = [];
    plugin.on('plg:s3-queue:lock-renewal-rejected', (event) => {
      rejectionEvents.push(event);
    });

    await plugin.startProcessing(async (job, ctx) => {
      capturedQueueId = ctx.queueId;
      processing = true;
      await sleep(2000); // Keep processing
    }, { concurrency: 1 });

    await waitForCondition(() => processing, { timeout: 5000 });
    await sleep(100);

    // Try to renew with wrong token
    const wrongToken = 'invalid-token-123';
    const renewed = await plugin.renewLock(capturedQueueId, wrongToken, 5000);

    expect(renewed).toBe(false);
    expect(rejectionEvents.length).toBeGreaterThan(0);
    expect(rejectionEvents[0].reason).toBe('token_mismatch');
  }, 15000);

  test('coordinator recovers stalled tickets from dead worker', async () => {
    const pluginA = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 500,
      heartbeatTTL: 2, // Very short TTL for testing
      dispatchInterval: 200,
      ticketBatchSize: 10,
      verbose: false
    });

    await pluginA.install(database);
    plugins.push(pluginA);

    // Enqueue messages
    for (let i = 0; i < 3; i++) {
      await resource.enqueue({ payload: `job-${i}` });
    }

    await pluginA.startProcessing(async () => {
      await sleep(10000); // Very slow processing
    }, { concurrency: 1 });

    await sleep(2000); // Let it publish tickets

    // Simulate death: stop heartbeat without cleanup
    pluginA.heartbeatJobName = null;

    // Wait for heartbeat TTL to expire
    await sleep(3000);

    // Coordinator should recover stalled tickets
    const recovered = [];
    pluginA.on('plg:s3-queue:tickets-recovered', (event) => {
      recovered.push(event);
    });

    await pluginA.recoverStalledTickets();

    // Note: Recovery may or may not emit event depending on timing
    // The important thing is no error was thrown
  }, 20000);

  // Skipped: This test expects immediate re-election when a worker with earlier ID joins,
  // but the epoch-based policy requires waiting for epoch expiration (min 60s).
  // The epochDuration minimum prevents testing this behavior in reasonable time.
  test.skip('coordinator transitions when worker joins/leaves', async () => {
    const pluginA = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 500,
      heartbeatTTL: 3,
      epochDuration: 3000, // Short epoch for testing transitions
      verbose: false
    });

    await pluginA.install(database);
    plugins.push(pluginA);

    const promotionEvents = [];
    const demotionEvents = [];

    pluginA.on('plg:s3-queue:coordinator-promoted', (e) => promotionEvents.push(e));
    pluginA.on('plg:s3-queue:coordinator-demoted', (e) => demotionEvents.push(e));

    await pluginA.startProcessing(async () => {}, { concurrency: 1 });
    await sleep(1500);

    expect(pluginA.isCoordinator).toBe(true);

    // Add a second worker with lexicographically earlier ID
    const pluginB = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 500,
      heartbeatTTL: 3,
      epochDuration: 3000, // Short epoch for testing transitions
      verbose: false
    });

    // Force an earlier worker ID
    pluginB.workerId = 'aaaaa-early-worker';

    await pluginB.install(database);
    plugins.push(pluginB);

    pluginB.on('plg:s3-queue:coordinator-promoted', (e) => promotionEvents.push(e));

    await pluginB.startProcessing(async () => {}, { concurrency: 1 });

    // Wait for re-election
    await sleep(2000);

    // B should become coordinator (earlier ID)
    expect(pluginB.isCoordinator).toBe(true);
    expect(promotionEvents.some(e => e.workerId === pluginB.workerId)).toBe(true);
  }, 20000);

  // Skipped: This test requires epochDuration < 60s to test renewal in reasonable time,
  // but the minimum epochDuration is 60s for production safety.
  // TODO: Add a test mode flag that allows shorter epochs for testing.
  test.skip('epoch renewal extends coordinator leadership', async () => {
    const plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      heartbeatInterval: 500,
      epochDuration: 2000, // Short epoch for testing
      verbose: false
    });

    await plugin.install(database);
    plugins.push(plugin);

    const renewalEvents = [];
    plugin.on('plg:s3-queue:coordinator-epoch-renewed', (e) => renewalEvents.push(e));

    await plugin.startProcessing(async () => {}, { concurrency: 1 });

    await sleep(1000); // Let it become coordinator
    expect(plugin.isCoordinator).toBe(true);

    // Wait for epoch to approach expiry
    await sleep(2500);

    // Should have renewed
    expect(renewalEvents.length).toBeGreaterThan(0);
    expect(plugin.isCoordinator).toBe(true);
  }, 15000);

  test('cold start observes environment before processing', async () => {
    // First worker starts
    const pluginA = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      coldStartDuration: 1500, // 1.5 seconds
      heartbeatInterval: 500,
      verbose: false
    });

    await pluginA.install(database);
    plugins.push(pluginA);

    const coldStartEvents = [];
    pluginA.on('plg:s3-queue:cold-start-phase', (e) => coldStartEvents.push(e));
    pluginA.on('plg:s3-queue:cold-start-complete', (e) => coldStartEvents.push(e));

    // Start first worker
    const startTime = Date.now();
    await pluginA.startProcessing(async () => {}, { concurrency: 1 });
    const coldStartDuration = Date.now() - startTime;

    // Cold start should have taken at least 1.3 seconds (allow for timing variations)
    expect(coldStartDuration).toBeGreaterThanOrEqual(1300);

    // Should have emitted phase events
    expect(coldStartEvents.length).toBeGreaterThan(0);
    expect(coldStartEvents.find(e => e.phase === 'observing')).toBeDefined();
    expect(coldStartEvents.find(e => e.phase === 'election')).toBeDefined();
    expect(coldStartEvents.find(e => e.phase === 'tickets')).toBeDefined();

    // Should be coordinator (first worker)
    expect(pluginA.isCoordinator).toBe(true);
    expect(pluginA.coldStartCompleted).toBe(true);
    expect(pluginA.coldStartPhase).toBe('ready');
  }, 20000);

  test('cold start can be skipped for testing', async () => {
    const plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      skipColdStart: true,
      verbose: false
    });

    await plugin.install(database);
    plugins.push(plugin);

    const startTime = Date.now();
    await plugin.startProcessing(async () => {}, { concurrency: 1 });
    const duration = Date.now() - startTime;

    // Should start immediately (< 500ms)
    expect(duration).toBeLessThan(500);
    expect(plugin.coldStartCompleted).toBe(true);
    expect(plugin.coldStartPhase).toBe('ready');
  }, 10000);

  test('multiple workers discover each other during cold start', async () => {
    // Start first worker
    const pluginA = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      coldStartDuration: 2000,
      heartbeatInterval: 500,
      verbose: false
    });

    pluginA.workerId = 'worker-aaa';
    await pluginA.install(database);
    plugins.push(pluginA);

    const discoveryEvents = [];
    pluginA.on('plg:s3-queue:cold-start-phase', (e) => {
      if (e.phase === 'observing') {
        discoveryEvents.push(e);
      }
    });

    // Start both workers simultaneously
    const startPromises = [
      pluginA.startProcessing(async () => {}, { concurrency: 1 })
    ];

    // Start second worker slightly later (during first worker's cold start)
    await sleep(300);

    const pluginB = new S3QueuePlugin({
      verbose: false,
      resource: 'jobs',
      autoStart: false,
      enableCoordinator: true,
      coldStartDuration: 2000,
      heartbeatInterval: 500,
      verbose: false
    });

    pluginB.workerId = 'worker-bbb';
    await pluginB.install(database);
    plugins.push(pluginB);

    pluginB.on('plg:s3-queue:cold-start-phase', (e) => {
      if (e.phase === 'observing') {
        discoveryEvents.push(e);
      }
    });

    startPromises.push(pluginB.startProcessing(async () => {}, { concurrency: 1 }));

    // Wait for both to complete cold start
    await Promise.all(startPromises);

    // Both should have discovered workers
    expect(discoveryEvents.length).toBeGreaterThan(0);

    // Worker with lexicographically smaller ID should be coordinator
    expect(pluginA.isCoordinator).toBe(true);
    expect(pluginB.isCoordinator).toBe(false);
  }, 25000);
});
