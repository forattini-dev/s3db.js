/**
 * Integration test: ApiPlugin + 3 Coordinator Plugins
 *
 * Validates that multiple coordinator plugins share the GlobalCoordinatorService
 * efficiently, reducing S3 API calls and preventing MaxListenersExceededWarning.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from '../../../src/database.class.js';

describe('Multi-Plugin Coordinator Integration (v19.3+)', () => {
  let db: Database;
  let warningHandler: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    warningHandler = vi.fn();
    process.on('warning', warningHandler);

    db = new Database({
      connectionString: 'memory://test/multi-plugin-integration',
      logLevel: 'silent'
    });
    await db.connect();
  });

  afterEach(async () => {
    process.removeListener('warning', warningHandler);
    await db.disconnect();
  });

  describe('Shared GlobalCoordinatorService', () => {
    it('should share single coordinator across multiple plugins in same namespace', async () => {
      const coordinator1 = await db.getGlobalCoordinator('shared-namespace');
      const coordinator2 = await db.getGlobalCoordinator('shared-namespace');
      const coordinator3 = await db.getGlobalCoordinator('shared-namespace');

      expect(coordinator1).toBe(coordinator2);
      expect(coordinator2).toBe(coordinator3);

      await coordinator1.stop();
    });

    it('should create separate coordinators for different namespaces', async () => {
      const ttlCoordinator = await db.getGlobalCoordinator('ttl');
      const schedulerCoordinator = await db.getGlobalCoordinator('scheduler');
      const queueCoordinator = await db.getGlobalCoordinator('queue');

      expect(ttlCoordinator).not.toBe(schedulerCoordinator);
      expect(schedulerCoordinator).not.toBe(queueCoordinator);
      expect(ttlCoordinator).not.toBe(queueCoordinator);

      await ttlCoordinator.stop();
      await schedulerCoordinator.stop();
      await queueCoordinator.stop();
    });
  });

  describe('Resource + Coordinator Plugin Coexistence', () => {
    it('should handle multiple resources and coordinator plugins without MaxListenersExceededWarning', async () => {
      const resources = [];
      for (let i = 0; i < 10; i++) {
        const resource = await db.createResource({
          name: `resource_${i}`,
          attributes: { name: 'string', status: 'string' }
        });
        resources.push(resource);
      }

      const coordinators = [];
      for (let i = 0; i < 3; i++) {
        const coordinator = await db.getGlobalCoordinator(`namespace_${i}`);
        await coordinator.start();
        coordinators.push(coordinator);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(warningHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MaxListenersExceededWarning' })
      );

      for (const coordinator of coordinators) {
        await coordinator.stop();
      }
    });
  });

  describe('Heartbeat Efficiency', () => {
    it('should execute single heartbeat for multiple subscribed plugins', async () => {
      const coordinator = await db.getGlobalCoordinator('efficiency-test');

      const mockPlugin1 = { name: 'plugin1', workerId: 'shared-worker' };
      const mockPlugin2 = { name: 'plugin2', workerId: 'shared-worker' };
      const mockPlugin3 = { name: 'plugin3', workerId: 'shared-worker' };

      coordinator.subscribePlugin('plugin1', mockPlugin1);
      coordinator.subscribePlugin('plugin2', mockPlugin2);
      coordinator.subscribePlugin('plugin3', mockPlugin3);

      expect(coordinator.subscribedPlugins.size).toBe(3);

      await coordinator.start();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const metrics = coordinator.getMetrics();
      expect(metrics.heartbeatCount).toBeGreaterThan(0);

      const workers = await coordinator.getActiveWorkers();
      const sharedWorkerCount = workers.filter(w =>
        w === 'shared-worker' || (typeof w === 'string' && w.includes('shared-worker'))
      ).length;
      expect(sharedWorkerCount).toBeLessThanOrEqual(1);

      await coordinator.stop();
    });
  });

  describe('Lifecycle Management', () => {
    it('should clean up all coordinators on database disconnect', async () => {
      const coord1 = await db.getGlobalCoordinator('cleanup-test-1');
      const coord2 = await db.getGlobalCoordinator('cleanup-test-2');

      await coord1.start();
      await coord2.start();

      expect(coord1.isRunning).toBe(true);
      expect(coord2.isRunning).toBe(true);

      await db.disconnect();

      expect(coord1.isRunning).toBe(false);
      expect(coord2.isRunning).toBe(false);

      db = new Database({
        connectionString: 'memory://test/multi-plugin-integration-2',
        logLevel: 'silent'
      });
      await db.connect();
    });

    it('should handle rapid start/stop cycles gracefully', async () => {
      const coordinator = await db.getGlobalCoordinator('rapid-cycle');

      for (let i = 0; i < 5; i++) {
        await coordinator.start();
        await coordinator.stop();
      }

      expect(coordinator.isRunning).toBe(false);

      expect(warningHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MaxListenersExceededWarning' })
      );
    });
  });

  describe('State Cache Across Plugins', () => {
    it('should share cached state across plugin operations', async () => {
      const coordinator = await db.getGlobalCoordinator('cache-sharing', {
        heartbeatInterval: 500,
        stateCacheTtl: 5000
      });

      await coordinator.start();
      await new Promise(resolve => setTimeout(resolve, 600));

      const state1 = await coordinator._getState();
      const cacheTime1 = coordinator._stateCacheTime;

      const state2 = await coordinator._getState();
      const cacheTime2 = coordinator._stateCacheTime;

      expect(cacheTime1).toBe(cacheTime2);
      expect(state1).toBeDefined();
      expect(state2).toBeDefined();

      await coordinator.stop();
    });
  });

  describe('Error Isolation', () => {
    it('should isolate errors between different namespace coordinators', async () => {
      const coord1 = await db.getGlobalCoordinator('isolated-1');
      const coord2 = await db.getGlobalCoordinator('isolated-2');

      await coord1.start();
      await coord2.start();

      await new Promise(resolve => setTimeout(resolve, 600));

      const coord1CacheTimeBefore = coord1._stateCacheTime;
      const coord2CacheTimeBefore = coord2._stateCacheTime;

      coord1._invalidateStateCache();

      expect(coord1._stateCacheTime).toBe(0);
      expect(coord2._stateCacheTime).toBe(coord2CacheTimeBefore);

      await coord1.stop();
      await coord2.stop();
    });
  });

  describe('Metrics Aggregation', () => {
    it('should track metrics independently per coordinator', async () => {
      const coord1 = await db.getGlobalCoordinator('metrics-1', {
        heartbeatInterval: 500
      });
      const coord2 = await db.getGlobalCoordinator('metrics-2', {
        heartbeatInterval: 500
      });

      await coord1.start();
      await coord2.start();

      await new Promise(resolve => setTimeout(resolve, 1200));

      const metrics1 = coord1.getMetrics();
      const metrics2 = coord2.getMetrics();

      expect(metrics1.heartbeatCount).toBeGreaterThan(0);
      expect(metrics2.heartbeatCount).toBeGreaterThan(0);

      expect(coord1.serviceId).not.toBe(coord2.serviceId);

      await coord1.stop();
      await coord2.stop();
    });
  });
});
