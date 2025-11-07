import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createDatabaseForTest } from '../../config.js';
import { SchedulerPlugin } from '../../../src/plugins/scheduler.plugin.js';
import {
  buildMockActions,
  createTestPlugin,
  restoreTimerMocks,
  setupTimerMocks,
} from './helpers.js';

describe('SchedulerPlugin - Management & Scheduling', () => {
  let mockActions;

  beforeEach(() => {
    setupTimerMocks();
    mockActions = buildMockActions();
  });

  afterEach(() => {
    restoreTimerMocks();
  });

  describe('Job Management', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-management');
      plugin = createTestPlugin(mockActions);

      await database.connect();
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should enable disabled job', () => {
      expect(plugin.jobs.get('disabled_job').enabled).toBe(false);

      const enableSpy = jest.fn();
      plugin.on('plg:scheduler:job-enabled', enableSpy);

      plugin.enableJob('disabled_job');

      expect(plugin.jobs.get('disabled_job').enabled).toBe(true);
      expect(enableSpy).toHaveBeenCalledWith({ jobName: 'disabled_job' });
    });

    it('should disable enabled job', () => {
      plugin.enableJob('test_job');
      expect(plugin.jobs.get('test_job').enabled).toBe(true);

      const disableSpy = jest.fn();
      plugin.on('plg:scheduler:job-disabled', disableSpy);

      plugin.disableJob('test_job');

      expect(plugin.jobs.get('test_job').enabled).toBe(false);
      expect(disableSpy).toHaveBeenCalledWith({ jobName: 'test_job' });
    });

    it('should throw error when enabling non-existent job', () => {
      expect(() => plugin.enableJob('non_existent')).toThrow("Job 'non_existent' not found");
    });

    it('should throw error when disabling non-existent job', () => {
      expect(() => plugin.disableJob('non_existent')).toThrow("Job 'non_existent' not found");
    });

    it('should cancel scheduled execution when disabling job', () => {
      plugin.enableJob('test_job');
      plugin.disableJob('test_job');

      expect(plugin.timers.has('test_job')).toBe(false);
    });
  });

  describe('Job Status and Statistics', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-status');
      plugin = createTestPlugin(mockActions);

      await database.connect();
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should return job status', () => {
      plugin.enableJob('test_job');
      const status = plugin.getJobStatus('test_job');

      expect(status).toEqual({
        name: 'test_job',
        enabled: true,
        schedule: '*/5 * * * *',
        description: 'Test job that runs every 5 minutes',
        lastRun: null,
        nextRun: expect.any(Date),
        isRunning: false,
        statistics: {
          totalRuns: 0,
          totalSuccesses: 0,
          totalErrors: 0,
          successRate: 0,
          avgDuration: 0,
          lastSuccess: null,
          lastError: null,
        },
      });
    });

    it('should return null for non-existent job', () => {
      const status = plugin.getJobStatus('non_existent');
      expect(status).toBeNull();
    });

    it('should return all jobs status', () => {
      const allStatus = plugin.getAllJobsStatus();

      expect(allStatus).toHaveLength(5);
      expect(allStatus.some(job => job.name === 'test_job')).toBe(true);
    });

    it.skip('should calculate success rate correctly', async () => {
      await plugin.runJob('test_job');

      plugin.enableJob('failing_job');
      try {
        await plugin.runJob('failing_job');
      } catch (error) {
        // Expected
      }

      await plugin.runJob('test_job');

      const status = plugin.getJobStatus('test_job');
      expect(status?.statistics.totalRuns).toBe(2);
    }, 60000);
  });

  describe('Job History', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-history');
      plugin = createTestPlugin(mockActions);

      await database.connect();
      await plugin.install(database);
      await plugin.runJob('test_job');
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should return job execution history', async () => {
      const history = await plugin.getJobHistory('test_job');

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        id: expect.any(String),
        status: 'success',
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        duration: expect.any(Number),
        result: { success: true },
        error: null,
        retryCount: 0,
      });
    });

    it('should limit history results', async () => {
      await plugin.runJob('test_job');
      await plugin.runJob('test_job');

      const limitedHistory = await plugin.getJobHistory('test_job', { limit: 2 });
      expect(limitedHistory).toHaveLength(2);
    });

    it('should return empty array when persistence disabled', async () => {
      const noPersistPlugin = new SchedulerPlugin({
      verbose: false,jobs: {
          test: { schedule: '@daily', action: () => {} },
        },
        persistJobs: false,
      });

      const history = await noPersistPlugin.getJobHistory('test');
      expect(history).toEqual([]);
    });

    it('should handle history query errors gracefully', async () => {
      const resourceName = plugin.config.jobHistoryResource;
      const originalResource = plugin.database.resources[resourceName];
      plugin.database.resources[resourceName] = {
        list: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      const history = await plugin.getJobHistory('test_job');
      expect(history).toEqual([]);

      plugin.database.resources[resourceName] = originalResource;
    });
  });

  describe('Dynamic Job Management', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-dynamic');
      plugin = createTestPlugin(mockActions);

      await database.connect();
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should add new job at runtime', () => {
      const addSpy = jest.fn();
      plugin.on('plg:scheduler:job-added', addSpy);

      plugin.addJob('runtime_job', {
        schedule: '@hourly',
        description: 'Job added at runtime',
        action: jest.fn().mockResolvedValue({ added: true }),
        enabled: true,
      });

      expect(plugin.jobs.has('runtime_job')).toBe(true);
      expect(plugin.statistics.has('runtime_job')).toBe(true);
      expect(addSpy).toHaveBeenCalledWith({ jobName: 'runtime_job' });
    });

    it('should throw error when adding job with existing name', () => {
      expect(() => {
        plugin.addJob('test_job', {
          schedule: '@daily',
          action: () => {},
        });
      }).toThrow("Job 'test_job' already exists");
    });

    it('should validate new job configuration', () => {
      expect(() => {
        plugin.addJob('invalid_job', {
          schedule: 'invalid cron',
        });
      }).toThrow('Job must have schedule and action');

      expect(() => {
        plugin.addJob('invalid_job2', {
          schedule: 'invalid cron',
          action: () => {},
        });
      }).toThrow(/Invalid cron expression/);
    });

    it('should remove existing job', () => {
      const removeSpy = jest.fn();
      plugin.on('plg:scheduler:job-removed', removeSpy);

      plugin.removeJob('test_job');

      expect(plugin.jobs.has('test_job')).toBe(false);
      expect(plugin.statistics.has('test_job')).toBe(false);
      expect(plugin.timers.has('test_job')).toBe(false);
      expect(removeSpy).toHaveBeenCalledWith({ jobName: 'test_job' });
    });

    it('should throw error when removing non-existent job', () => {
      expect(() => plugin.removeJob('non_existent')).toThrow("Job 'non_existent' not found");
    });
  });

  describe('Scheduling', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-scheduling');
      plugin = createTestPlugin(mockActions);

      await database.connect();
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should schedule enabled jobs', () => {
      const enabledJobs = Array.from(plugin.jobs.entries())
        .filter(([, job]) => job.enabled)
        .map(([name]) => name);

      enabledJobs.forEach(jobName => {
        const job = plugin.jobs.get(jobName);
        expect(job.nextRun).toBeDefined();
      });
    });

    it('should not schedule disabled jobs', () => {
      const disabledJob = plugin.jobs.get('disabled_job');
      expect(disabledJob.nextRun).toBeNull();
      expect(plugin.timers.has('disabled_job')).toBe(false);
    });

    it.skip('should reschedule after job execution', async () => {
      plugin.enableJob('test_job');
      const job = plugin.jobs.get('test_job');
      const originalNextRun = job.nextRun;

      await plugin.runJob('test_job');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(job.nextRun).not.toEqual(originalNextRun);
      expect(job.nextRun).toBeGreaterThan(originalNextRun);
    });
  });

  describe('Hook Execution', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-hooks');
      plugin = createTestPlugin(mockActions);

      await database.connect();
      await plugin.install(database);
    });

    afterEach(async () => {
      if (plugin?.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should execute onJobStart hook', async () => {
      await plugin.runJob('test_job');

      expect(plugin.config.onJobStart).toHaveBeenCalledWith(
        'test_job',
        expect.objectContaining({
          jobName: 'test_job',
        }),
      );
    });

    it('should execute onJobComplete hook on success', async () => {
      await plugin.runJob('test_job');

      expect(plugin.config.onJobComplete).toHaveBeenCalledWith(
        'test_job',
        { success: true },
        expect.any(Number),
      );
    });

    it.skip('should execute onJobError hook on failure', async () => {
      plugin.enableJob('failing_job');

      try {
        await plugin.runJob('failing_job');
      } catch (error) {
        // Expected failure
      }

      expect(plugin.config.onJobError).toHaveBeenCalledWith(
        'failing_job',
        expect.any(Error),
        1,
      );
    }, 60000);

    it('should handle hook execution errors gracefully', async () => {
      plugin.config.onJobStart = jest.fn().mockRejectedValue(new Error('Hook failed'));

      await plugin.runJob('test_job');

      expect(mockActions.testAction).toHaveBeenCalled();
    });
  });
});
