
import { createDatabaseForTest } from '../../config.js';
import { SchedulerPlugin } from '../../../src/plugins/scheduler.plugin.js';
import {
  buildMockActions,
  createTestPlugin,
  restoreTimerMocks,
  setupTimerMocks,
} from './helpers.js';

describe('SchedulerPlugin - Lifecycle & Edge Cases', () => {
  let database;
  let mockActions;

  beforeAll(async () => {
    database = createDatabaseForTest('suite=plugins/scheduler-lifecycle-edge');
    await database.connect();
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  beforeEach(() => {
    setupTimerMocks();
    mockActions = buildMockActions();
  });

  afterEach(() => {
    restoreTimerMocks();
  });

  describe('Plugin Integration', () => {
    let plugin;

    beforeEach(async () => {
      plugin = createTestPlugin(mockActions);
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
    });

    it('should return null for missing plugin', () => {
      const result = plugin.getPlugin('NonExistentPlugin');
      expect(result).toBeNull();
    });

    it('should pass scheduler instance to job actions', async () => {
      await plugin.runJob('test_job');

      expect(mockActions.testAction).toHaveBeenCalledWith(
        plugin.database,
        expect.any(Object),
        plugin,
      );
    });
  });

  describe('Plugin Lifecycle', () => {
    let plugin;

    beforeEach(async () => {
      plugin = createTestPlugin(mockActions);
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
    });

    it('should start successfully', async () => {
      await plugin.start();
    });

    it('should stop and clear timers', async () => {
      plugin.enableJob('test_job');
      plugin.enableJob('daily_job');

      expect(plugin.timers.size).toBeGreaterThan(0);

      await plugin.stop();

      expect(plugin.timers.size).toBe(0);
    });

    it('should wait for active jobs to complete on stop', async () => {
      plugin.activeJobs.set('test_job', 'execution_123');

      const stopPromise = plugin.stop();

      setImmediate(() => {
        plugin.activeJobs.clear();
      });

      await stopPromise;

      expect(plugin.activeJobs.size).toBe(0);
    });

    it('should cleanup successfully', async () => {
      const removeListenersSpy = vi.spyOn(plugin, 'removeAllListeners');

      await plugin.stop();

      expect(plugin.jobs.size).toBe(0);
      expect(plugin.statistics.size).toBe(0);
      expect(plugin.activeJobs.size).toBe(0);
      expect(removeListenersSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    let plugin;

    beforeEach(async () => {
      plugin = createTestPlugin(mockActions);
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
    });

    it('should handle zero retries gracefully', async () => {
      plugin.addJob('no_retry_job', {
        schedule: '@hourly',
        action: mockActions.failingAction,
        retries: 0,
        enabled: true,
      });

      try {
        await plugin.runJob('no_retry_job');
      } catch (error) {
        // Expected failure
      }

      expect(mockActions.failingAction).toHaveBeenCalledTimes(1);
    }, 60000);

    it('should handle extremely long job names', () => {
      const longName = 'a'.repeat(1000);

      plugin.addJob(longName, {
        schedule: '@daily',
        action: () => ({ success: true }),
        enabled: true,
      });

      expect(plugin.jobs.has(longName)).toBe(true);
    });

    it('should handle timezone edge cases', () => {
      const timezonePlugin = new SchedulerPlugin({
      logLevel: 'silent',timezone: 'America/Sao_Paulo',
        jobs: {
          test: { schedule: '@daily', action: () => {} },
        },
      });

      expect(timezonePlugin.config.timezone).toBe('America/Sao_Paulo');
    });

    it('should handle rapid consecutive job additions and removals', () => {
      for (let i = 0; i < 100; i++) {
        plugin.addJob(`temp_job_${i}`, {
          schedule: '@daily',
          action: () => {},
          enabled: false,
        });
      }

      expect(plugin.jobs.size).toBe(105);

      for (let i = 0; i < 100; i++) {
        plugin.removeJob(`temp_job_${i}`);
      }

      expect(plugin.jobs.size).toBe(5);
    });
  });

  describe('Complex Scheduling Scenarios', () => {
    let plugin;

    beforeEach(async () => {
      plugin = createTestPlugin(mockActions);
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
    });

    it('should handle overlapping job executions correctly', async () => {
      const slowAction = vi.fn().mockResolvedValue({ done: true });

      plugin.addJob('slow_job', {
        schedule: '@daily',
        action: slowAction,
        enabled: true,
      });

      const promise1 = plugin.runJob('slow_job');

      await expect(plugin.runJob('slow_job')).rejects.toThrow(
        "Job 'slow_job' is already running",
      );

      await promise1;

      await plugin.runJob('slow_job');

      expect(slowAction).toHaveBeenCalledTimes(2);
    });

    it.skip('should maintain correct statistics across multiple executions', async () => {
      await plugin.runJob('test_job');

      plugin.enableJob('failing_job');
      try {
        await plugin.runJob('failing_job');
      } catch (error) {
        // Expected
      }

      await plugin.runJob('test_job');

      const testJobStats = plugin.getJobStatus('test_job')?.statistics;
      const failingJobStats = plugin.getJobStatus('failing_job')?.statistics;

      expect(testJobStats?.totalRuns).toBe(2);
      expect(failingJobStats?.totalErrors).toBe(1);
    }, 60000);
  });
});
