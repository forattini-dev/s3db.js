/**
 * Tests for ProcessManager - Centralized lifecycle management
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ProcessManager, getProcessManager, resetProcessManager } from '../../src/concerns/process-manager.js';

describe('ProcessManager', () => {
  let pm;

  beforeEach(() => {
    pm = new ProcessManager({ verbose: false, exitOnSignal: false });
  });

  afterEach(async () => {
    if (pm) {
      await pm.shutdown();
      pm.removeSignalHandlers();
    }
    resetProcessManager();
  });

  describe('Interval Management', () => {
    it('should register and track intervals', () => {
      const fn = jest.fn();
      pm.setInterval(fn, 100, 'test-interval');

      const status = pm.getStatus();
      expect(status.intervals).toContain('test-interval');
      expect(status.counts.intervals).toBe(1);
    });

    it('should execute interval function repeatedly', async () => {
      const fn = jest.fn();
      pm.setInterval(fn, 50, 'test-interval');

      await new Promise(resolve => setTimeout(resolve, 160));

      expect(fn).toHaveBeenCalledTimes(3); // ~50ms, ~100ms, ~150ms
    });

    it('should clear interval by name', async () => {
      const fn = jest.fn();
      pm.setInterval(fn, 50, 'test-interval');

      await new Promise(resolve => setTimeout(resolve, 60));
      pm.clearInterval('test-interval');
      await new Promise(resolve => setTimeout(resolve, 60));

      expect(fn.mock.calls.length).toBeLessThanOrEqual(2); // Only called before clearing
    });

    it('should replace existing interval with same name', () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();

      pm.setInterval(fn1, 100, 'test-interval');
      pm.setInterval(fn2, 100, 'test-interval');

      const status = pm.getStatus();
      expect(status.counts.intervals).toBe(1); // Only one interval
    });

    it('should prevent registering intervals during shutdown', async () => {
      const shutdownPromise = pm.shutdown();

      expect(() => {
        pm.setInterval(() => {}, 100, 'late-interval');
      }).toThrow(/during shutdown/);

      await shutdownPromise;
    });
  });

  describe('Timeout Management', () => {
    it('should register and track timeouts', () => {
      const fn = jest.fn();
      pm.setTimeout(fn, 100, 'test-timeout');

      const status = pm.getStatus();
      expect(status.timeouts).toContain('test-timeout');
      expect(status.counts.timeouts).toBe(1);
    });

    it('should execute timeout function once', async () => {
      const fn = jest.fn();
      pm.setTimeout(fn, 50, 'test-timeout');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should auto-remove timeout after execution', async () => {
      const fn = jest.fn();
      pm.setTimeout(fn, 50, 'test-timeout');

      await new Promise(resolve => setTimeout(resolve, 100));

      const status = pm.getStatus();
      expect(status.timeouts).not.toContain('test-timeout');
    });

    it('should clear timeout by name', async () => {
      const fn = jest.fn();
      pm.setTimeout(fn, 100, 'test-timeout');

      pm.clearTimeout('test-timeout');
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(fn).not.toHaveBeenCalled();
    });

    it('should replace existing timeout with same name', () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();

      pm.setTimeout(fn1, 100, 'test-timeout');
      pm.setTimeout(fn2, 100, 'test-timeout');

      const status = pm.getStatus();
      expect(status.counts.timeouts).toBe(1); // Only one timeout
    });
  });

  describe('Cleanup Registration', () => {
    it('should register cleanup functions', () => {
      const cleanup = jest.fn();
      pm.registerCleanup(cleanup, 'test-cleanup');

      const status = pm.getStatus();
      expect(status.cleanups).toContain('test-cleanup');
      expect(status.counts.cleanups).toBe(1);
    });

    it('should execute cleanup functions on shutdown', async () => {
      const cleanup = jest.fn();
      pm.registerCleanup(cleanup, 'test-cleanup');

      await pm.shutdown();

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should execute all cleanup functions on shutdown', async () => {
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();
      const cleanup3 = jest.fn();

      pm.registerCleanup(cleanup1, 'cleanup-1');
      pm.registerCleanup(cleanup2, 'cleanup-2');
      pm.registerCleanup(cleanup3, 'cleanup-3');

      await pm.shutdown();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup3).toHaveBeenCalledTimes(1);
    });

    it('should handle async cleanup functions', async () => {
      const cleanup = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      pm.registerCleanup(cleanup, 'async-cleanup');
      await pm.shutdown();

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should timeout long-running cleanup functions', async () => {
      const cleanup = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      pm.registerCleanup(cleanup, 'slow-cleanup');

      const start = Date.now();
      await pm.shutdown({ timeout: 100 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(150); // Should timeout around 100ms
    });

    it('should unregister cleanup functions', () => {
      const cleanup = jest.fn();
      pm.registerCleanup(cleanup, 'test-cleanup');
      pm.unregisterCleanup('test-cleanup');

      const status = pm.getStatus();
      expect(status.cleanups).not.toContain('test-cleanup');
    });

    it('should replace existing cleanup with same name', () => {
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();

      pm.registerCleanup(cleanup1, 'test-cleanup');
      pm.registerCleanup(cleanup2, 'test-cleanup');

      const status = pm.getStatus();
      expect(status.counts.cleanups).toBe(1);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should clear all intervals on shutdown', async () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();

      pm.setInterval(fn1, 50, 'interval-1');
      pm.setInterval(fn2, 50, 'interval-2');

      await pm.shutdown();

      const status = pm.getStatus();
      expect(status.counts.intervals).toBe(0);
    });

    it('should clear all timeouts on shutdown', async () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();

      pm.setTimeout(fn1, 100, 'timeout-1');
      pm.setTimeout(fn2, 100, 'timeout-2');

      await pm.shutdown();

      const status = pm.getStatus();
      expect(status.counts.timeouts).toBe(0);
    });

    it('should run all cleanups on shutdown', async () => {
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();

      pm.registerCleanup(cleanup1, 'cleanup-1');
      pm.registerCleanup(cleanup2, 'cleanup-2');

      await pm.shutdown();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('should prevent multiple shutdown calls', async () => {
      const cleanup = jest.fn();
      pm.registerCleanup(cleanup, 'test-cleanup');

      const shutdown1 = pm.shutdown();
      const shutdown2 = pm.shutdown();
      const shutdown3 = pm.shutdown();

      await Promise.all([shutdown1, shutdown2, shutdown3]);

      expect(cleanup).toHaveBeenCalledTimes(1); // Only once
    });

    it('should handle cleanup errors gracefully', async () => {
      const goodCleanup = jest.fn();
      const badCleanup = jest.fn(async () => {
        throw new Error('Cleanup failed');
      });

      pm.registerCleanup(goodCleanup, 'good-cleanup');
      pm.registerCleanup(badCleanup, 'bad-cleanup');

      await expect(pm.shutdown()).resolves.not.toThrow();

      expect(goodCleanup).toHaveBeenCalledTimes(1);
      expect(badCleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('Status Reporting', () => {
    it('should report correct status', () => {
      pm.setInterval(() => {}, 100, 'interval-1');
      pm.setTimeout(() => {}, 100, 'timeout-1');
      pm.registerCleanup(() => {}, 'cleanup-1');

      const status = pm.getStatus();

      expect(status.intervals).toEqual(['interval-1']);
      expect(status.timeouts).toEqual(['timeout-1']);
      expect(status.cleanups).toEqual(['cleanup-1']);
      expect(status.counts.intervals).toBe(1);
      expect(status.counts.timeouts).toBe(1);
      expect(status.counts.cleanups).toBe(1);
      expect(status.isShuttingDown).toBe(false);
    });

    it('should update status after shutdown', async () => {
      pm.setInterval(() => {}, 100, 'interval-1');
      pm.setTimeout(() => {}, 100, 'timeout-1');
      pm.registerCleanup(() => {}, 'cleanup-1');

      await pm.shutdown();

      const status = pm.getStatus();

      expect(status.counts.intervals).toBe(0);
      expect(status.counts.timeouts).toBe(0);
      expect(status.counts.cleanups).toBe(0);
      expect(status.isShuttingDown).toBe(true);
    });
  });

  describe('Singleton Instance', () => {
    it('should return same global instance', () => {
      const instance1 = getProcessManager();
      const instance2 = getProcessManager();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getProcessManager();
      resetProcessManager();
      const instance2 = getProcessManager();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Real-World Scenario', () => {
    it('should handle complex lifecycle', async () => {
      const healthCheckFn = jest.fn();
      const retryFn = jest.fn();
      const workerCleanup = jest.fn();
      const dbCleanup = jest.fn();

      // Register recurring health check
      pm.setInterval(healthCheckFn, 50, 'health-check');

      // Register retry timeout
      pm.setTimeout(retryFn, 100, 'retry-task');

      // Register worker cleanup
      pm.registerCleanup(workerCleanup, 'worker');

      // Register database cleanup
      pm.registerCleanup(dbCleanup, 'database');

      // Let it run
      await new Promise(resolve => setTimeout(resolve, 160));

      // Shutdown
      await pm.shutdown();

      // Verify health check ran multiple times
      expect(healthCheckFn.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Verify retry ran once
      expect(retryFn).toHaveBeenCalledTimes(1);

      // Verify cleanups ran
      expect(workerCleanup).toHaveBeenCalledTimes(1);
      expect(dbCleanup).toHaveBeenCalledTimes(1);

      // Verify all cleared
      const status = pm.getStatus();
      expect(status.counts.intervals).toBe(0);
      expect(status.counts.timeouts).toBe(0);
      expect(status.counts.cleanups).toBe(0);
    });
  });
});
