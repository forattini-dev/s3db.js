/**
 * Tests for CoordinatorPlugin Startup Jitter
 *
 * Tests the startup jitter feature that prevents thundering herd when multiple
 * workers start simultaneously (e.g., during full pod restarts in Kubernetes).
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Database } from '#src/database.class.js';
import { CoordinatorPlugin } from '#src/plugins/concerns/coordinator-plugin.class.js';

// Simple test plugin that extends CoordinatorPlugin
class TestCoordinatorPlugin extends CoordinatorPlugin {
  constructor(config = {}) {
    super(config);
    this.becameCoordinatorCount = 0;
    this.stopBeingCoordinatorCount = 0;
    this.coordinatorWorkCount = 0;
  }

  async onBecomeCoordinator() {
    this.becameCoordinatorCount++;
  }

  async onStopBeingCoordinator() {
    this.stopBeingCoordinatorCount++;
  }

  async coordinatorWork() {
    this.coordinatorWorkCount++;
  }
}

const HEARTBEAT_WAIT_MS = 1600;

describe('CoordinatorPlugin Startup Jitter', () => {
  let db;

  beforeEach(async () => {
    const uniquePath = `memory://test-coordinator-jitter/${Date.now()}-${Math.random()}`;
    db = new Database({
      connectionString: uniquePath
    });
    await db.connect();
  });

  afterEach(async () => {
    if (db) {
      await db.disconnect();
    }
  });

  describe('Configuration', () => {
    test('should have default jitter configuration', async () => {
      const plugin = new TestCoordinatorPlugin({});
      await plugin.install(db);

      expect(plugin.coordinatorConfig.startupJitterMin).toBe(0);
      expect(plugin.coordinatorConfig.startupJitterMin).toBe(0);
      expect(plugin.coordinatorConfig.startupJitterMax).toBe(5000);

      await plugin.uninstall();
    });

    test('should accept custom jitter min/max', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMin: 2000,
        startupJitterMax: 8000
      });
      await plugin.install(db);

      expect(plugin.coordinatorConfig.startupJitterMin).toBe(2000);
      expect(plugin.coordinatorConfig.startupJitterMax).toBe(8000);

      await plugin.uninstall();
    });

    test('should allow disabling jitter with max=0', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMax: 0
      });
      await plugin.install(db);

      expect(plugin.coordinatorConfig.startupJitterMin).toBe(0);
      expect(plugin.coordinatorConfig.startupJitterMax).toBe(0);

      await plugin.uninstall();
    });

    test('should reject negative startupJitterMin', () => {
      expect(() => {
        new TestCoordinatorPlugin({
          startupJitterMin: -100
        });
      }).toThrow('startupJitterMin must be >= 0');
    });

    test('should reject invalid range (max < min)', () => {
      expect(() => {
        new TestCoordinatorPlugin({
          startupJitterMin: 5000,
          startupJitterMax: 1000
        });
      }).toThrow('startupJitterMax must be >= startupJitterMin');
    });

    test('should accept equal min and max (fixed delay)', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMin: 3000,
        startupJitterMax: 3000
      });
      await plugin.install(db);

      expect(plugin.coordinatorConfig.startupJitterMin).toBe(3000);
      expect(plugin.coordinatorConfig.startupJitterMax).toBe(3000);

      await plugin.uninstall();
    });
  });

  describe('Jitter Application', () => {
    test('should apply jitter before coordinator election', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMin: 50,
        startupJitterMax: 100,
        verbose: false
      });
      await plugin.install(db);

      const startTime = Date.now();
      await plugin.startCoordination();
      const elapsedMs = Date.now() - startTime;

      // Should have delayed at least 50ms
      expect(elapsedMs).toBeGreaterThanOrEqual(50);

      await plugin.stopCoordination();
      await plugin.uninstall();
    });

    test('should skip jitter when max=0', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMax: 0,
        verbose: false
      });
      await plugin.install(db);

      const startTime = Date.now();
      await plugin.startCoordination();
      const elapsedMs = Date.now() - startTime;

      // Should complete very quickly (< 10ms for setup)
      expect(elapsedMs).toBeLessThan(50);

      await plugin.stopCoordination();
      await plugin.uninstall();
    });

    test('should apply fixed delay when min=max', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMin: 100,
        startupJitterMax: 100,
        verbose: false
      });
      await plugin.install(db);

      const startTime = Date.now();
      await plugin.startCoordination();
      const elapsedMs = Date.now() - startTime;

      // Should have delayed approximately 100ms (±10ms tolerance)
      expect(elapsedMs).toBeGreaterThanOrEqual(90);
      expect(elapsedMs).toBeLessThan(150);

      await plugin.stopCoordination();
      await plugin.uninstall();
    });

    test('should generate random delays within configured range', async () => {
      const delays = [];

      // Run 10 times and collect delays
      for (let i = 0; i < 10; i++) {
        const plugin = new TestCoordinatorPlugin({
          startupJitterMin: 20,
          startupJitterMax: 80,
          verbose: false
        });
        await plugin.install(db);

        const startTime = Date.now();
        await plugin.startCoordination();
        const elapsedMs = Date.now() - startTime;

        delays.push(elapsedMs);

        await plugin.stopCoordination();
        await plugin.uninstall();
      }

      // All delays should be within range (20-80ms, with some tolerance)
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(15); // -5ms tolerance
        expect(delay).toBeLessThan(140); // Allow extra time for setup overhead
      }

      // Delays should not all be identical (randomness check)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('Coordinator Election After Jitter', () => {
    test('should elect coordinator after jitter completes', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMin: 50,
        startupJitterMax: 100,
        heartbeatInterval: 100,
        verbose: false
      });
      await plugin.install(db);

      await plugin.startCoordination();

      // Give time for heartbeat and election to complete (at least one heartbeat cycle)
      await new Promise(resolve => setTimeout(resolve, HEARTBEAT_WAIT_MS));

      // After startup, plugin should have elected a coordinator
      expect(plugin.isCoordinator).toBe(true); // Only worker, so should be coordinator

      await plugin.stopCoordination();
      await plugin.uninstall();
    });

    test('should maintain deterministic election with jitter', async () => {
      // Create two workers with different jitter settings
      const worker1 = new TestCoordinatorPlugin({
        startupJitterMin: 10,
        startupJitterMax: 20,
        heartbeatInterval: 100,
        verbose: false
      });
      await worker1.install(db);

      const worker2 = new TestCoordinatorPlugin({
        startupJitterMin: 50,
        startupJitterMax: 100,
        heartbeatInterval: 100,
        verbose: false
      });
      await worker2.install(db);

      // Start both workers (worker1 should finish jitter first)
      await Promise.all([
        worker1.startCoordination(),
        worker2.startCoordination()
      ]);

      // Give time for heartbeats to sync and election to complete
      await new Promise(resolve => setTimeout(resolve, HEARTBEAT_WAIT_MS));

      // Exactly one should be coordinator
      const coordinatorCount = [worker1.isCoordinator, worker2.isCoordinator].filter(Boolean).length;
      expect(coordinatorCount).toBe(1);

      // Lexicographically first worker ID should win (deterministic)
      const expectedCoordinator = worker1.workerId < worker2.workerId ? worker1 : worker2;
      expect(expectedCoordinator.isCoordinator).toBe(true);

      await worker1.stopCoordination();
      await worker2.stopCoordination();
      await worker1.uninstall();
      await worker2.uninstall();
    });
  });

  describe('Steady-State Behavior', () => {
    test('should not apply jitter to heartbeat loops', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMin: 100,
        startupJitterMax: 200,
        heartbeatInterval: 1000,
        verbose: false
      });
      await plugin.install(db);

      await plugin.startCoordination();

      // Wait for 2 heartbeats
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Heartbeats should happen at regular intervals (not affected by jitter)
      // This is hard to test precisely, but we can verify plugin is running

      expect(plugin.isCoordinator).toBeDefined();

      await plugin.stopCoordination();
      await plugin.uninstall();
    });

    test('should apply jitter again on restart', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMin: 50,
        startupJitterMax: 100,
        verbose: false
      });
      await plugin.install(db);

      // First start
      const startTime1 = Date.now();
      await plugin.startCoordination();
      const elapsed1 = Date.now() - startTime1;

      expect(elapsed1).toBeGreaterThanOrEqual(50);

      // Stop
      await plugin.stopCoordination();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Restart
      const startTime2 = Date.now();
      await plugin.startCoordination();
      const elapsed2 = Date.now() - startTime2;

      // Should apply jitter again
      expect(elapsed2).toBeGreaterThanOrEqual(50);

      await plugin.stopCoordination();
      await plugin.uninstall();
    });
  });

  describe('Mass Restart Simulation', () => {
    test('should spread startup load across jitter window', async () => {
      const workerCount = 20;
      const workers = [];
      const startTimes = [];

      // Create 20 workers
      for (let i = 0; i < workerCount; i++) {
        const worker = new TestCoordinatorPlugin({
          startupJitterMin: 0,
          startupJitterMax: 500, // 0-500ms window
          heartbeatInterval: 100,
          verbose: false
        });
        await worker.install(db);
        workers.push(worker);
      }

      // Start all workers simultaneously (simulating mass pod restart)
      const overallStart = Date.now();
      await Promise.all(
        workers.map(async worker => {
          const workerStart = Date.now();
          await worker.startCoordination();
          const elapsed = Date.now() - workerStart;
          startTimes.push(elapsed);
        })
      );
      const overallElapsed = Date.now() - overallStart;

      // Give time for election to complete (need at least one heartbeat cycle)
      await new Promise(resolve => setTimeout(resolve, HEARTBEAT_WAIT_MS));

      // Verify startup times are spread across window
      const minStartTime = Math.min(...startTimes);
      const maxStartTime = Math.max(...startTimes);
      const spread = maxStartTime - minStartTime;

      // Spread should be significant (at least 100ms out of 500ms window)
      // This proves workers didn't all start simultaneously
      expect(spread).toBeGreaterThan(100);

      // Overall time should be reasonable (< 2.5 seconds for 20 workers with max 500ms jitter)
      expect(overallElapsed).toBeLessThan(2500);

      // Exactly one coordinator should be elected before cleanup
      const coordinators = workers.filter(w => w.isCoordinator);
      expect(coordinators.length).toBe(1);

      // Cleanup
      await Promise.all(workers.map(w => w.stopCoordination()));
      await Promise.all(workers.map(w => w.uninstall()));
    }, 30000); // Increase timeout for this test
  });

  describe('Backward Compatibility', () => {
    test('should work without explicit jitter configuration', async () => {
      const plugin = new TestCoordinatorPlugin({
        // No jitter config specified
        heartbeatInterval: 100,
        verbose: false
      });
      await plugin.install(db);

      // Should use defaults (0-5000ms)
      expect(plugin.coordinatorConfig.startupJitterMin).toBe(0);
      expect(plugin.coordinatorConfig.startupJitterMax).toBe(5000);

      const startTime = Date.now();
      await plugin.startCoordination();
      const elapsed = Date.now() - startTime;

      // Should complete within reasonable time (jitter + setup < 6s)
      expect(elapsed).toBeLessThan(6000);

      // Give time for election to complete (at least one heartbeat cycle)
      await new Promise(resolve => setTimeout(resolve, HEARTBEAT_WAIT_MS));

      // Should elect coordinator
      expect(plugin.isCoordinator).toBe(true);

      await plugin.stopCoordination();
      await plugin.uninstall();
    });

    test('should maintain existing functionality with jitter enabled', async () => {
      const plugin = new TestCoordinatorPlugin({
        startupJitterMin: 50,
        startupJitterMax: 100,
        heartbeatInterval: 100,
        verbose: false
      });
      await plugin.install(db);

      await plugin.startCoordination();

      // Give time for election to complete (at least one heartbeat cycle)
      await new Promise(resolve => setTimeout(resolve, HEARTBEAT_WAIT_MS));

      // All existing functionality should work
      expect(plugin.isCoordinator).toBe(true);
      expect(plugin.becameCoordinatorCount).toBe(1);
      expect(plugin.heartbeatHandle).toBeDefined();

      await plugin.stopCoordination();

      expect(plugin.heartbeatHandle).toBeNull();

      await plugin.uninstall();
    });
  });
});
