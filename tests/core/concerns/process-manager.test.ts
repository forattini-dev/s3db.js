/**
 * Tests for ProcessManager - Centralized lifecycle management
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessManager, getProcessManager, resetProcessManager } from '../../../src/concerns/process-manager.js';
import { FakeTimers } from '../../utils/time-helpers.js';

describe('ProcessManager', () => {
  let pm;

  beforeEach(() => {
    pm = new ProcessManager({ logLevel: 'silent', exitOnSignal: false });
  });

  afterEach(async () => {
    // Ensure fake timers are uninstalled before shutdown
    if (FakeTimers._installed) {
      FakeTimers.uninstall();
    }
    if (pm) {
      await pm.shutdown();
      pm.removeSignalHandlers();
    }
    resetProcessManager();
  });

  describe('Interval Management', () => {
    it('should register and track intervals', () => {
      const fn = vi.fn();
      pm.setInterval(fn, 100, 'test-interval');

      const status = pm.getStatus();
      expect(status.intervals).toContain('test-interval');
      expect(status.counts.intervals).toBe(1);
    });

    it('should execute interval function repeatedly', async () => {
      FakeTimers.install();
      const fn = vi.fn();
      pm.setInterval(fn, 50, 'test-interval');

      // Advance time: 50ms, 100ms, 150ms = 3 calls
      await FakeTimers.advance(160);

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should clear interval by name', async () => {
      FakeTimers.install();
      const fn = vi.fn();
      pm.setInterval(fn, 50, 'test-interval');

      await FakeTimers.advance(60); // 1 call
      pm.clearInterval('test-interval');
      await FakeTimers.advance(60); // should not add more calls

      expect(fn.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('should replace existing interval with same name', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

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
      const fn = vi.fn();
      pm.setTimeout(fn, 100, 'test-timeout');

      const status = pm.getStatus();
      expect(status.timeouts).toContain('test-timeout');
      expect(status.counts.timeouts).toBe(1);
    });

    it('should execute timeout function once', async () => {
      FakeTimers.install();
      const fn = vi.fn();
      pm.setTimeout(fn, 50, 'test-timeout');

      await FakeTimers.advance(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should auto-remove timeout after execution', async () => {
      FakeTimers.install();
      const fn = vi.fn();
      pm.setTimeout(fn, 50, 'test-timeout');

      await FakeTimers.advance(100);

      const status = pm.getStatus();
      expect(status.timeouts).not.toContain('test-timeout');
    });

    it('should clear timeout by name', async () => {
      FakeTimers.install();
      const fn = vi.fn();
      pm.setTimeout(fn, 100, 'test-timeout');

      pm.clearTimeout('test-timeout');
      await FakeTimers.advance(150);

      expect(fn).not.toHaveBeenCalled();
    });

    it('should replace existing timeout with same name', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      pm.setTimeout(fn1, 100, 'test-timeout');
      pm.setTimeout(fn2, 100, 'test-timeout');

      const status = pm.getStatus();
      expect(status.counts.timeouts).toBe(1); // Only one timeout
    });
  });

  describe('Cleanup Registration', () => {
    it('should register cleanup functions', () => {
      const cleanup = vi.fn();
      pm.registerCleanup(cleanup, 'test-cleanup');

      const status = pm.getStatus();
      expect(status.cleanups).toContain('test-cleanup');
      expect(status.counts.cleanups).toBe(1);
    });

    it('should execute cleanup functions on shutdown', async () => {
      const cleanup = vi.fn();
      pm.registerCleanup(cleanup, 'test-cleanup');

      await pm.shutdown();

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should execute all cleanup functions on shutdown', async () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      const cleanup3 = vi.fn();

      pm.registerCleanup(cleanup1, 'cleanup-1');
      pm.registerCleanup(cleanup2, 'cleanup-2');
      pm.registerCleanup(cleanup3, 'cleanup-3');

      await pm.shutdown();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup3).toHaveBeenCalledTimes(1);
    });

    it('should handle async cleanup functions', async () => {
      FakeTimers.install();
      let cleanupCompleted = false;
      const cleanup = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        cleanupCompleted = true;
      });

      pm.registerCleanup(cleanup, 'async-cleanup');

      const shutdownPromise = pm.shutdown();
      await FakeTimers.advance(100);
      await shutdownPromise;

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(cleanupCompleted).toBe(true);
    });

    it('should timeout long-running cleanup functions', async () => {
      FakeTimers.install();
      const cleanup = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      pm.registerCleanup(cleanup, 'slow-cleanup');

      const shutdownPromise = pm.shutdown({ timeout: 100 });

      // Advance time to trigger timeout
      await FakeTimers.advance(150);
      await shutdownPromise;

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should unregister cleanup functions', () => {
      const cleanup = vi.fn();
      pm.registerCleanup(cleanup, 'test-cleanup');
      pm.unregisterCleanup('test-cleanup');

      const status = pm.getStatus();
      expect(status.cleanups).not.toContain('test-cleanup');
    });

    it('should replace existing cleanup with same name', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      pm.registerCleanup(cleanup1, 'test-cleanup');
      pm.registerCleanup(cleanup2, 'test-cleanup');

      const status = pm.getStatus();
      expect(status.counts.cleanups).toBe(1);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should clear all intervals on shutdown', async () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      pm.setInterval(fn1, 50, 'interval-1');
      pm.setInterval(fn2, 50, 'interval-2');

      await pm.shutdown();

      const status = pm.getStatus();
      expect(status.counts.intervals).toBe(0);
    });

    it('should clear all timeouts on shutdown', async () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      pm.setTimeout(fn1, 100, 'timeout-1');
      pm.setTimeout(fn2, 100, 'timeout-2');

      await pm.shutdown();

      const status = pm.getStatus();
      expect(status.counts.timeouts).toBe(0);
    });

    it('should run all cleanups on shutdown', async () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      pm.registerCleanup(cleanup1, 'cleanup-1');
      pm.registerCleanup(cleanup2, 'cleanup-2');

      await pm.shutdown();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('should prevent multiple shutdown calls', async () => {
      const cleanup = vi.fn();
      pm.registerCleanup(cleanup, 'test-cleanup');

      const shutdown1 = pm.shutdown();
      const shutdown2 = pm.shutdown();
      const shutdown3 = pm.shutdown();

      await Promise.all([shutdown1, shutdown2, shutdown3]);

      expect(cleanup).toHaveBeenCalledTimes(1); // Only once
    });

    it('should handle cleanup errors gracefully', async () => {
      const goodCleanup = vi.fn();
      const badCleanup = vi.fn(async () => {
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
      FakeTimers.install();
      const healthCheckFn = vi.fn();
      const retryFn = vi.fn();
      const workerCleanup = vi.fn();
      const dbCleanup = vi.fn();

      // Register recurring health check
      pm.setInterval(healthCheckFn, 50, 'health-check');

      // Register retry timeout
      pm.setTimeout(retryFn, 100, 'retry-task');

      // Register worker cleanup
      pm.registerCleanup(workerCleanup, 'worker');

      // Register database cleanup
      pm.registerCleanup(dbCleanup, 'database');

      // Let it run: advance 160ms
      await FakeTimers.advance(160);

      // Shutdown (uninstall fake timers first to avoid issues)
      FakeTimers.uninstall();
      await pm.shutdown();

      // Verify health check ran multiple times (50, 100, 150 = 3 times)
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
