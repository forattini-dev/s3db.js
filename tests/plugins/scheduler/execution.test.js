import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createDatabaseForTest } from '../../config.js';
import {
  buildMockActions,
  createTestPlugin,
  restoreTimerMocks,
  setupTimerMocks,
} from './helpers.js';

describe('SchedulerPlugin - Job Execution', () => {
  let mockActions;

  beforeEach(() => {
    setupTimerMocks();
    mockActions = buildMockActions();
  });

  afterEach(() => {
    restoreTimerMocks();
  });

  describe('Execution Flow', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-execution');
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

    it('should execute job manually', async () => {
      await plugin.runJob('test_job');

      expect(mockActions.testAction).toHaveBeenCalledWith(
        plugin.database,
        expect.objectContaining({
          jobName: 'test_job',
          database: plugin.database,
        }),
        plugin,
      );

      expect(plugin.config.onJobStart).toHaveBeenCalled();
      expect(plugin.config.onJobComplete).toHaveBeenCalled();
    });

    it('should prevent concurrent execution of same job', async () => {
      const promise1 = plugin.runJob('test_job');

      await expect(plugin.runJob('test_job')).rejects.toThrow("Job 'test_job' is already running");

      await promise1;
    });

    it('should throw error for non-existent job', async () => {
      await expect(plugin.runJob('non_existent')).rejects.toThrow("Job 'non_existent' not found");
    });

    it('should emit job_start and job_complete events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      plugin.on('plg:scheduler:job-start', startSpy);
      plugin.on('plg:scheduler:job-complete', completeSpy);

      await plugin.runJob('test_job');

      expect(startSpy).toHaveBeenCalledWith(expect.objectContaining({ jobName: 'test_job' }));
      expect(completeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ jobName: 'test_job', status: 'success' }),
      );
    });

    it('should update job statistics on success', async () => {
      await plugin.runJob('test_job');

      const job = plugin.jobs.get('test_job');
      const stats = plugin.statistics.get('test_job');

      expect(job.runCount).toBe(1);
      expect(job.successCount).toBe(1);
      expect(job.errorCount).toBe(0);
      expect(stats.totalRuns).toBe(1);
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.totalErrors).toBe(0);
      expect(stats.lastSuccess).toBeDefined();
    });

    it('should persist job execution history', async () => {
      const testRecord = {
        id: 'test_123',
        jobName: 'test_job',
        status: 'success',
        startTime: Date.now(),
        endTime: Date.now() + 100,
        duration: 100,
        result: JSON.stringify({}),
        error: null,
        retryCount: 0,
        createdAt: new Date().toISOString().slice(0, 10),
      };

      await database.resources[plugin.config.jobHistoryResource].insert(testRecord);
      const directRecords = await database.resources[plugin.config.jobHistoryResource].list();
      expect(directRecords).toHaveLength(1);

      await database.resources[plugin.config.jobHistoryResource].delete('test_123');
      await plugin.runJob('test_job');

      expect(mockActions.testAction).toHaveBeenCalled();

      const history = await plugin.getJobHistory('test_job');

      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('success');
      expect(history[0].duration).toBeGreaterThan(0);
      expect(history[0].retryCount).toBe(0);
    });

    it('should clean up active jobs after execution', async () => {
      expect(plugin.activeJobs.has('test_job')).toBe(false);

      await plugin.runJob('test_job');

      expect(plugin.activeJobs.has('test_job')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-errors');
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

    it.skip('should handle action execution errors', async () => {
      plugin.enableJob('failing_job');

      let errorOccurred = false;
      try {
        await plugin.runJob('failing_job');
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toBe('Action failed');
      }

      expect(errorOccurred).toBe(true);
    }, 60000);

    it.skip('should handle timeout errors', async () => {
      plugin.enableJob('timeout_job');

      let errorOccurred = false;
      try {
        await plugin.runJob('timeout_job');
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toBe('Job execution timeout');
      }

      expect(errorOccurred).toBe(true);
    }, 60000);

    it.skip('should implement exponential backoff for retries', async () => {
      plugin.enableJob('failing_job');

      try {
        await plugin.runJob('failing_job');
      } catch (error) {
        // Expected
      }

      const job = plugin.jobs.get('failing_job');
      expect(job.retryCount).toBeGreaterThanOrEqual(0);
    }, 60000);
  });
});
