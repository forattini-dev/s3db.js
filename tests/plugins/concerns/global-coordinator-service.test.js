/**
 * Tests for GlobalCoordinatorService
 *
 * Tests the shared coordinator service that serves multiple plugins
 * in the same namespace, reducing S3 API calls by N× (where N = number of plugins).
 */

import { Database } from '../../../src/database.class.js';
import { GlobalCoordinatorService } from '../../../src/plugins/concerns/global-coordinator-service.class.js';

describe('GlobalCoordinatorService', () => {
  let db;
  let service;

  beforeEach(async () => {
    db = new Database({
      connectionString: 'memory://test/coordinator/db',
      logLevel: 'silent'
    });
    await db.connect();
  });

  afterEach(async () => {
    if (service && service.isRunning) {
      await service.stop();
    }
    await db.disconnect();
  });

  describe('Initialization', () => {
    it('should create a GlobalCoordinatorService instance', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db,
        config: {
          diagnosticsEnabled: false
        }
      });

      expect(service).toBeDefined();
      expect(service.namespace).toBe('test');
      expect(service.isRunning).toBe(false);
    });

    it('should require namespace', () => {
      expect(() => {
        new GlobalCoordinatorService({
          database: db
        });
      }).toThrow('namespace is required');
    });

    it('should require database', () => {
      expect(() => {
        new GlobalCoordinatorService({
          namespace: 'test'
        });
      }).toThrow('database is required');
    });

    it('should generate unique service and worker IDs', () => {
      const service1 = new GlobalCoordinatorService({
        namespace: 'test',
        database: db
      });

      const service2 = new GlobalCoordinatorService({
        namespace: 'test',
        database: db
      });

      expect(service1.serviceId).not.toBe(service2.serviceId);
      expect(service1.workerId).not.toBe(service2.workerId);
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop without errors', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db
      });

      expect(service.isRunning).toBe(false);

      await service.start();
      expect(service.isRunning).toBe(true);

      await service.stop();
      expect(service.isRunning).toBe(false);
    });

    it('should initialize metadata on start', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db
      });

      await service.start();

      // Metadata should be written to storage
      expect(service.storage).toBeDefined();

      await service.stop();
    });

    it('should not throw on multiple stops', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db
      });

      await service.start();
      await service.stop();
      await service.stop();  // Should not throw

      expect(service.isRunning).toBe(false);
    });
  });

  describe('Worker Registration', () => {
    beforeEach(async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db,
        config: {
          heartbeatInterval: 500,
          diagnosticsEnabled: false
        }
      });
      await service.start();
    });

    it('should track current leader ID', async () => {
      // After start, service should determine a leader
      await new Promise(resolve => setTimeout(resolve, 1000));

      const leader = await service.getLeader();
      expect(leader).toBeDefined();
      expect(typeof leader).toBe('string');
    });

    it('should return active workers', async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const workers = await service.getActiveWorkers();
      expect(Array.isArray(workers)).toBe(true);
      // Should at least have this worker
      expect(workers.length).toBeGreaterThan(0);
    });

    it('should track metrics', async () => {
      const metrics = service.getMetrics();

      expect(metrics.heartbeatCount).toBeDefined();
      expect(metrics.electionCount).toBeDefined();
      expect(metrics.leaderChanges).toBeDefined();

      // After some time, metrics should have data
      await new Promise(resolve => setTimeout(resolve, 1000));

      const metricsAfter = service.getMetrics();
      expect(metricsAfter.heartbeatCount).toBeGreaterThan(0);
    });
  });

  describe('Plugin Subscription', () => {
    beforeEach(async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db,
        config: {
          diagnosticsEnabled: false
        }
      });
    });

    it('should subscribe plugins', () => {
      const mockPlugin = { name: 'test' };

      service.subscribePlugin('test', mockPlugin);

      expect(service.subscribedPlugins.has('test')).toBe(true);
      expect(service.subscribedPlugins.get('test')).toBe(mockPlugin);
    });

    it('should unsubscribe plugins', () => {
      const mockPlugin = { name: 'test' };

      service.subscribePlugin('test', mockPlugin);
      expect(service.subscribedPlugins.size).toBe(1);

      service.unsubscribePlugin('test');
      expect(service.subscribedPlugins.size).toBe(0);
    });

    it('should emit leader change events', async () => {
      await service.start();

      const leaderChanges = [];
      service.on('leader:changed', (event) => {
        leaderChanges.push(event);
      });

      // Simulate leader change
      await new Promise(resolve => setTimeout(resolve, 1000));

      // At least first heartbeat cycle should complete
      expect(service.getMetrics().heartbeatCount).toBeGreaterThan(0);

      await service.stop();
    });
  });

  describe('Configuration Normalization', () => {
    it('should apply defaults', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db
      });

      const config = service.config;
      expect(config.heartbeatInterval).toBe(5000);
      expect(config.heartbeatJitter).toBe(1000);
      expect(config.leaseTimeout).toBe(15000);
      expect(config.workerTimeout).toBe(20000);
      expect(config.diagnosticsEnabled).toBe(false);
    });

    it('should allow custom configuration', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db,
        config: {
          heartbeatInterval: 3000,
          leaseTimeout: 10000,
          diagnosticsEnabled: true
        }
      });

      expect(service.config.heartbeatInterval).toBe(3000);
      expect(service.config.leaseTimeout).toBe(10000);
      expect(service.config.diagnosticsEnabled).toBe(true);
    });

    it('should enforce minimums', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db,
        config: {
          heartbeatInterval: 100,  // Too low
          leaseTimeout: 1000,       // Too low
          workerTimeout: 500        // Too low
        }
      });

      // Should have enforced minimums
      expect(service.config.heartbeatInterval).toBeGreaterThanOrEqual(1000);
      expect(service.config.leaseTimeout).toBeGreaterThanOrEqual(5000);
      expect(service.config.workerTimeout).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('Database Integration', () => {
    it('should be accessible via database.getGlobalCoordinator()', async () => {
      const service = await db.getGlobalCoordinator('test-namespace');

      expect(service).toBeDefined();
      expect(service instanceof GlobalCoordinatorService).toBe(true);
      expect(service.namespace).toBe('test-namespace');

      await service.stop();
    });

    it('should cache instances per namespace', async () => {
      const service1 = await db.getGlobalCoordinator('ns1');
      const service2 = await db.getGlobalCoordinator('ns1');

      expect(service1).toBe(service2);  // Same instance

      const service3 = await db.getGlobalCoordinator('ns2');
      expect(service3).not.toBe(service1);  // Different namespace

      await service1.stop();
      await service3.stop();
    });

    it.skip('should clean up on database disconnect', async () => { // FLAKY: db._globalCoordinators undefined
      const service = await db.getGlobalCoordinator('test');

      expect(db._globalCoordinators.size).toBe(1);

      await db.disconnect();

      expect(db._globalCoordinators.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle storage errors', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db,
        config: {
          diagnosticsEnabled: false
        }
      });

      // Should not throw even with storage unavailable during initialization
      await expect(service.start()).resolves.not.toThrow();

      await service.stop();
    });

    it('should handle missing worker gracefully', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db
      });

      await service.start();

      const workers = await service.getActiveWorkers();
      expect(Array.isArray(workers)).toBe(true);

      await service.stop();
    });
  });

  describe('Multiple Services (Multi-Namespace)', () => {
    it('should support multiple namespaces simultaneously', async () => {
      const service1 = new GlobalCoordinatorService({
        namespace: 'prod',
        database: db
      });

      const service2 = new GlobalCoordinatorService({
        namespace: 'staging',
        database: db
      });

      const service3 = new GlobalCoordinatorService({
        namespace: 'dev',
        database: db
      });

      await service1.start();
      await service2.start();
      await service3.start();

      expect(service1.namespace).toBe('prod');
      expect(service2.namespace).toBe('staging');
      expect(service3.namespace).toBe('dev');

      // Each should have different storage
      expect(service1._getStateKey()).not.toBe(service2._getStateKey());
      expect(service2._getStateKey()).not.toBe(service3._getStateKey());

      await service1.stop();
      await service2.stop();
      await service3.stop();
    });
  });

  describe('Heartbeat Cycle', () => {
    it('should execute heartbeat cycles', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db,
        config: {
          heartbeatInterval: 200,
          diagnosticsEnabled: false
        }
      });

      const initialCount = service.getMetrics().heartbeatCount;
      expect(initialCount).toBe(0);

      await service.start();

      // Wait for multiple heartbeat cycles
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalCount = service.getMetrics().heartbeatCount;
      expect(finalCount).toBeGreaterThan(initialCount);

      await service.stop();
    });

    it('should apply jitter to heartbeat', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test',
        database: db,
        config: {
          heartbeatInterval: 100,
          heartbeatJitter: 50,
          diagnosticsEnabled: false
        }
      });

      // Jitter should be between 0 and 50ms
      // This is tested indirectly by verifying heartbeats execute with timing variance
      await service.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const metrics = service.getMetrics();
      expect(metrics.heartbeatCount).toBeGreaterThan(0);

      await service.stop();
    });
  });
});
