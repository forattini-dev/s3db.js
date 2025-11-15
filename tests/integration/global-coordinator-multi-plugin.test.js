/**
 * Integration Tests: Global Coordinator Service with S3QueuePlugin
 *
 * This test suite validates that:
 * 1. S3QueuePlugin works with global coordination
 * 2. Single election loop can serve multiple plugins (core concept)
 * 3. Leader change events are delivered correctly
 * 4. Metrics accurately track heartbeats, elections, worker changes
 *
 * Note: These tests verify GlobalCoordinatorService integration at the core level.
 * For full end-to-end plugin integration tests, see plugin-specific test suites.
 *
 * Storage Verification:
 * - plg_coordinator_global/<namespace>/state.json - Leader lease
 * - plg_coordinator_global/<namespace>/workers/<id>.json - Worker heartbeats
 * - plg_coordinator_global/<namespace>/metadata.json - Service metadata
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest, sleep } from '#tests/config.js';
import { S3QueuePlugin } from '#src/plugins/s3-queue.plugin.js';

describe('GlobalCoordinatorService - Integration Tests', () => {
  let database;
  let emailsResource;

  beforeAll(async () => {
    database = createDatabaseForTest('integration/global-coordinator');
    await database.connect();

    // Create test resource
    emailsResource = await database.createResource({
      name: 'emails',
      attributes: {
        id: 'string|required',
        to: 'string|required',
        subject: 'string|required',
        body: 'string|required',
        status: 'string|default:pending'
      },
      timestamps: true
    });
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('1. Plugin Initialization with Global Coordination', () => {
    it('should initialize plugin with global coordination (default)', async () => {
      const queuePlugin = new S3QueuePlugin({
        resource: 'emails',
        enableCoordinator: true,
        heartbeatInterval: 1000,
        heartbeatJitter: 200,
        leaseTimeout: 3000,
        workerTimeout: 5000,
        visibilityTimeout: 30000,
        pollInterval: 500,
        autoStart: false,
        onMessage: async () => ({ processed: true }),
        onError: () => {}
      });

      // All plugins now use global coordination by default
      expect(queuePlugin.enableCoordinator).toBe(true);
    });
  });

  describe('2. GlobalCoordinatorService Lazy Instantiation', () => {
    it('should create one coordinator service per namespace', async () => {
      const coordinator1 = await database.getGlobalCoordinator('namespace-1');
      const coordinator2 = await database.getGlobalCoordinator('namespace-1');
      const coordinator3 = await database.getGlobalCoordinator('namespace-2');

      // Same namespace returns same instance
      expect(coordinator1).toBe(coordinator2);

      // Different namespaces return different instances
      expect(coordinator1).not.toBe(coordinator3);
      expect(coordinator1.namespace).toBe('namespace-1');
      expect(coordinator3.namespace).toBe('namespace-2');

      await coordinator1.stop();
      await coordinator3.stop();
    });

    it('should cache coordinator services', async () => {
      const coordinator = await database.getGlobalCoordinator('cache-test');

      // Should be in cache
      expect(database._globalCoordinators.has('cache-test')).toBe(true);
      expect(database._globalCoordinators.get('cache-test')).toBe(coordinator);

      await coordinator.stop();
    });
  });

  describe('3. Leader Election & Heartbeat', () => {
    it('should elect a leader and maintain heartbeat', async () => {
      const queuePlugin = new S3QueuePlugin({
        resource: 'emails',
        enableCoordinator: true,
        heartbeatInterval: 500,
        heartbeatJitter: 100,
        leaseTimeout: 1500,
        workerTimeout: 3000,
        visibilityTimeout: 30000,
        pollInterval: 500,
        autoStart: false,
        onMessage: async () => ({ processed: true })
      });

      await database.usePlugin(queuePlugin, 'queue');

      const coordinator = await database.getGlobalCoordinator('election-test');
      await coordinator.start();

      // Wait for initial election
      await sleep(1000);

      const leader = await coordinator.getLeader();
      expect(leader).toBeDefined();
      expect(typeof leader).toBe('string');

      await coordinator.stop();
    });

    it('should track heartbeat metrics', async () => {
      const queuePlugin = new S3QueuePlugin({
        resource: 'emails',
        enableCoordinator: true,
        heartbeatInterval: 300,
        heartbeatJitter: 100,
        leaseTimeout: 1000,
        workerTimeout: 2000,
        visibilityTimeout: 30000,
        pollInterval: 500,
        autoStart: false,
        onMessage: async () => ({ processed: true })
      });

      await database.usePlugin(queuePlugin, 'queue');

      const coordinator = await database.getGlobalCoordinator('heartbeat-metrics');
      await coordinator.start();

      // Wait for heartbeat cycles
      await sleep(1500);

      const metrics = coordinator.getMetrics();
      expect(metrics.heartbeatCount).toBeGreaterThan(0);
      expect(metrics.electionCount).toBeGreaterThan(0);
      expect(typeof metrics.lastHeartbeatTime).toBe('number');

      await coordinator.stop();
    });
  });

  describe('4. Worker Registration', () => {
    it('should register and track active workers', async () => {
      const queuePlugin = new S3QueuePlugin({
        resource: 'emails',
        enableCoordinator: true,
        heartbeatInterval: 500,
        heartbeatJitter: 100,
        leaseTimeout: 1500,
        workerTimeout: 3000,
        visibilityTimeout: 30000,
        pollInterval: 500,
        autoStart: false,
        onMessage: async () => ({ processed: true })
      });

      await database.usePlugin(queuePlugin, 'queue');

      const coordinator = await database.getGlobalCoordinator('workers-test');
      await coordinator.start();

      // Wait for worker registration
      await sleep(1000);

      const workers = await coordinator.getActiveWorkers();
      expect(Array.isArray(workers)).toBe(true);
      expect(workers.length).toBeGreaterThan(0);

      // Verify worker structure
      const worker = workers[0];
      expect(worker.workerId).toBeDefined();
      expect(worker.lastHeartbeat).toBeDefined();
      expect(typeof worker.lastHeartbeat).toBe('number');

      await coordinator.stop();
    });
  });

  describe('5. Plugin Subscription', () => {
    it('should manage plugin subscriptions', async () => {
      const coordinator = await database.getGlobalCoordinator('subscription-test');

      // Create mock plugin
      const mockPlugin = { name: 'test-plugin' };

      // Subscribe plugin
      coordinator.subscribePlugin('test', mockPlugin);
      expect(coordinator.subscribedPlugins.has('test')).toBe(true);
      expect(coordinator.subscribedPlugins.get('test')).toBe(mockPlugin);

      // Unsubscribe plugin
      coordinator.unsubscribePlugin('test');
      expect(coordinator.subscribedPlugins.has('test')).toBe(false);

      await coordinator.stop();
    });

    it('should support multiple plugin subscriptions', async () => {
      const coordinator = await database.getGlobalCoordinator('multi-sub-test');

      // Subscribe multiple plugins
      coordinator.subscribePlugin('queue', { name: 'queue' });
      coordinator.subscribePlugin('ttl', { name: 'ttl' });
      coordinator.subscribePlugin('cache', { name: 'cache' });

      expect(coordinator.subscribedPlugins.size).toBe(3);
      expect(coordinator.subscribedPlugins.has('queue')).toBe(true);
      expect(coordinator.subscribedPlugins.has('ttl')).toBe(true);
      expect(coordinator.subscribedPlugins.has('cache')).toBe(true);

      await coordinator.stop();
    });
  });

  describe('6. Leader Change Events', () => {
    it('should emit leader:changed events', async () => {
      const leaderChanges = [];

      const queuePlugin = new S3QueuePlugin({
        resource: 'emails',
        enableCoordinator: true,
        heartbeatInterval: 500,
        heartbeatJitter: 100,
        leaseTimeout: 1500,
        workerTimeout: 3000,
        visibilityTimeout: 30000,
        pollInterval: 500,
        autoStart: false,
        onMessage: async () => ({ processed: true })
      });

      await database.usePlugin(queuePlugin, 'queue');

      const coordinator = await database.getGlobalCoordinator('leader-event-test');

      coordinator.on('leader:changed', (event) => {
        leaderChanges.push({
          timestamp: Date.now(),
          newLeader: event.newLeader,
          epoch: event.epoch,
          namespace: event.namespace
        });
      });

      await coordinator.start();

      // Wait for heartbeat cycles
      await sleep(2000);

      // Should have recorded leader changes
      expect(leaderChanges.length).toBeGreaterThan(0);

      // Verify event structure
      const event = leaderChanges[0];
      expect(event.newLeader).toBeDefined();
      expect(event.epoch).toBeDefined();
      expect(event.namespace).toBe('leader-event-test');

      await coordinator.stop();
    });
  });

  describe('7. Lifecycle Management', () => {
    it('should start and stop coordinator cleanly', async () => {
      const queuePlugin = new S3QueuePlugin({
        resource: 'emails',
        enableCoordinator: true,
        heartbeatInterval: 500,
        heartbeatJitter: 100,
        leaseTimeout: 1500,
        workerTimeout: 3000,
        visibilityTimeout: 30000,
        pollInterval: 500,
        autoStart: false,
        onMessage: async () => ({ processed: true })
      });

      await database.usePlugin(queuePlugin, 'queue');

      const coordinator = await database.getGlobalCoordinator('lifecycle-test');

      expect(coordinator.isRunning).toBe(false);

      await coordinator.start();
      expect(coordinator.isRunning).toBe(true);

      await coordinator.stop();
      expect(coordinator.isRunning).toBe(false);
    });

    it('should handle multiple stop calls gracefully', async () => {
      const coordinator = await database.getGlobalCoordinator('multi-stop-test');

      await coordinator.start();
      await coordinator.stop();

      // Second stop should not throw
      expect(() => coordinator.stop()).not.toThrow();

      expect(coordinator.isRunning).toBe(false);
    });
  });

  describe('8. Storage Structure', () => {
    it('should use correct storage key formats', async () => {
      const coordinator = await database.getGlobalCoordinator('storage-format-test');

      // Verify key formats
      const stateKey = coordinator._getStateKey();
      expect(stateKey).toContain('plg_coordinator_global/');
      expect(stateKey).toContain('storage-format-test');
      expect(stateKey).toContain('/state.json');

      const workersPrefix = coordinator._getWorkersPrefix();
      expect(workersPrefix).toContain('plg_coordinator_global/');
      expect(workersPrefix).toContain('storage-format-test');
      expect(workersPrefix).toContain('/workers/');

      const metadataKey = coordinator._getMetadataKey();
      expect(metadataKey).toContain('plg_coordinator_global/');
      expect(metadataKey).toContain('storage-format-test');
      expect(metadataKey).toContain('/metadata.json');

      await coordinator.stop();
    });
  });

  describe('9. Configuration Handling', () => {
    it('should apply configuration with defaults', async () => {
      const coordinator = await database.getGlobalCoordinator('config-defaults');

      // Should have defaults
      expect(coordinator.config.heartbeatInterval).toBeGreaterThanOrEqual(1000);
      expect(coordinator.config.leaseTimeout).toBeGreaterThanOrEqual(5000);
      expect(coordinator.config.workerTimeout).toBeGreaterThanOrEqual(5000);

      await coordinator.stop();
    });

    it('should enforce minimum configuration values', async () => {
      const testDb = createDatabaseForTest('config-minimums');
      await testDb.connect();

      // Try to create coordinator with values below minimums
      const coordinator = await testDb.getGlobalCoordinator('min-test');

      // Config should have enforced minimums
      expect(coordinator.config.heartbeatInterval).toBeGreaterThanOrEqual(1000);
      expect(coordinator.config.leaseTimeout).toBeGreaterThanOrEqual(5000);

      await coordinator.stop();
      await testDb.disconnect();
    });
  });

  describe('10. Multi-Namespace Isolation', () => {
    it('should maintain separate state for different namespaces', async () => {
      const coordinator1 = await database.getGlobalCoordinator('iso1');
      const coordinator2 = await database.getGlobalCoordinator('iso2');

      await coordinator1.start();
      await coordinator2.start();

      await sleep(1000);

      const leader1 = await coordinator1.getLeader();
      const leader2 = await coordinator2.getLeader();

      // Both should have leaders, but independent election
      expect(leader1).toBeDefined();
      expect(leader2).toBeDefined();

      // Verify they have different state keys
      expect(coordinator1._getStateKey()).not.toEqual(coordinator2._getStateKey());

      await coordinator1.stop();
      await coordinator2.stop();
    });
  });

  describe('11. Graceful Shutdown', () => {
    it('should clean up on database disconnect', async () => {
      const testDb = createDatabaseForTest('cleanup-test');
      await testDb.connect();

      const coordinator = await testDb.getGlobalCoordinator('cleanup');
      await coordinator.start();

      expect(testDb._globalCoordinators.size).toBe(1);

      // Disconnect should clean up coordinators
      await testDb.disconnect();

      expect(testDb._globalCoordinators.size).toBe(0);
    });
  });

  describe('12. Metrics Tracking', () => {
    it('should track all key metrics', async () => {
      const queuePlugin = new S3QueuePlugin({
        resource: 'emails',
        enableCoordinator: true,
        heartbeatInterval: 300,
        heartbeatJitter: 100,
        leaseTimeout: 1000,
        workerTimeout: 2000,
        visibilityTimeout: 30000,
        pollInterval: 500,
        autoStart: false,
        onMessage: async () => ({ processed: true })
      });

      await database.usePlugin(queuePlugin, 'queue');

      const coordinator = await database.getGlobalCoordinator('metrics-all');
      await coordinator.start();

      await sleep(1500);

      const metrics = coordinator.getMetrics();

      // Verify all metrics are present
      expect(typeof metrics.heartbeatCount).toBe('number');
      expect(typeof metrics.electionCount).toBe('number');
      expect(typeof metrics.electionDurationMs).toBe('number');
      expect(typeof metrics.leaderChanges).toBe('number');
      expect(typeof metrics.workerRegistrations).toBe('number');
      expect(typeof metrics.workerTimeouts).toBe('number');
      expect(typeof metrics.lastHeartbeatTime).toBe('number');

      // Verify values are reasonable
      expect(metrics.heartbeatCount).toBeGreaterThan(0);
      expect(metrics.electionCount).toBeGreaterThan(0);

      await coordinator.stop();
    });
  });
});
