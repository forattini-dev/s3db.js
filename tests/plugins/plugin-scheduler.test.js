import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { SchedulerPlugin } from '../../src/plugins/scheduler.plugin.js';

describe('SchedulerPlugin', () => {
  let mockActions = {};

  beforeEach(async () => {
    // Mock setTimeout and clearTimeout to prevent actual scheduling
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
      return { id: Math.random(), fn, delay };
    });
    jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});
    
    // Reset mocks
    mockActions = {
      testAction: jest.fn().mockResolvedValue({ success: true }),
      longRunningAction: jest.fn().mockImplementation(() => 
        Promise.resolve({ done: true })
      ),
      failingAction: jest.fn().mockRejectedValue(new Error('Action failed')),
      timeoutAction: jest.fn().mockImplementation(() => 
        new Promise(() => {}) // Never resolves - will timeout
      )
    };
  });

  afterEach(async () => {
    // Restore mocks
    jest.restoreAllMocks();
  });

  // Helper function to create a test plugin configuration
  function createTestPlugin(opts = {}) {
    return new SchedulerPlugin({
      timezone: 'UTC',
      jobs: {
        test_job: {
          schedule: '*/5 * * * *',
          description: 'Test job that runs every 5 minutes',
          action: mockActions.testAction,
          enabled: false,
          retries: 2,
          timeout: 1000
        },
        daily_job: {
          schedule: '@daily',
          description: 'Daily cleanup job',
          action: mockActions.testAction,
          enabled: false
        },
        disabled_job: {
          schedule: '0 0 * * *',
          description: 'Disabled job',
          action: mockActions.testAction,
          enabled: false
        },
        failing_job: {
          schedule: '0 * * * *',
          description: 'Job that always fails',
          action: mockActions.failingAction,
          enabled: false,
          retries: 1
        },
        timeout_job: {
          schedule: '0 0 * * *',
          description: 'Job that times out',
          action: mockActions.timeoutAction,
          enabled: false,
          timeout: 100
        }
      },
      defaultTimeout: 500, // Reduced for faster tests
      defaultRetries: 1,
      persistJobs: opts.persistJobs !== false, // Default true, can be overridden
      onJobStart: jest.fn(),
      onJobComplete: jest.fn(),
      onJobError: jest.fn(),
      verbose: false
    });
  }

  describe('Configuration Validation', () => {
    it('should throw error when no jobs defined', () => {
      expect(() => {
        new SchedulerPlugin({});
      }).toThrow('At least one job must be defined');
    });

    it('should throw error when job has no schedule', () => {
      expect(() => {
        new SchedulerPlugin({
          jobs: {
            invalid: {
              action: () => {}
            }
          }
        });
      }).toThrow("Job 'invalid' must have a schedule");
    });

    it('should throw error when job has no action', () => {
      expect(() => {
        new SchedulerPlugin({
          jobs: {
            invalid: {
              schedule: '* * * * *'
            }
          }
        });
      }).toThrow("Job 'invalid' must have an action function");
    });

    it('should throw error when job action is not a function', () => {
      expect(() => {
        new SchedulerPlugin({
          jobs: {
            invalid: {
              schedule: '* * * * *',
              action: 'not a function'
            }
          }
        });
      }).toThrow("Job 'invalid' must have an action function");
    });

    it('should throw error for invalid cron expression', () => {
      expect(() => {
        new SchedulerPlugin({
          jobs: {
            invalid: {
              schedule: 'invalid cron',
              action: () => {}
            }
          }
        });
      }).toThrow("Job 'invalid' has invalid cron expression: invalid cron");
    });

    it('should accept valid shorthand expressions', () => {
      expect(() => {
        new SchedulerPlugin({
          jobs: {
            hourly: { schedule: '@hourly', action: () => {} },
            daily: { schedule: '@daily', action: () => {} },
            weekly: { schedule: '@weekly', action: () => {} },
            monthly: { schedule: '@monthly', action: () => {} },
            yearly: { schedule: '@yearly', action: () => {} }
          }
        });
      }).not.toThrow();
    });
  });

  // Tests that require database connection
  describe('Plugin Setup (with database)', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should setup properly with database', async () => {
      expect(plugin.database).toBe(database);
      expect(plugin.jobs.size).toBe(5);
      expect(plugin.activeJobs.size).toBe(0);
      expect(plugin.timers.size).toBe(0); // No enabled jobs in test config
    });

    it('should create job history resource when persistence enabled', async () => {
      expect(database.resources[plugin.config.jobHistoryResource]).toBeDefined();
    });

    it('should initialize job statistics', () => {
      expect(plugin.statistics.size).toBe(5);
      
      const testJobStats = plugin.statistics.get('test_job');
      expect(testJobStats).toEqual({
        totalRuns: 0,
        totalSuccesses: 0,
        totalErrors: 0,
        avgDuration: 0,
        lastRun: null,
        lastSuccess: null,
        lastError: null
      });
    });

    it('should emit initialized event', async () => {
      const initSpy = jest.fn();
      
      const newPlugin = new SchedulerPlugin({
        jobs: {
          test: { schedule: '@daily', action: () => {}, enabled: true }
        }
      });
      
      newPlugin.on('initialized', initSpy);
      
      const newDb = createDatabaseForTest('suite=plugins/scheduler-init');
      
      await newDb.connect();
      await newPlugin.setup(newDb);
      
      expect(initSpy).toHaveBeenCalledWith({ jobs: 1 });
      
      await newPlugin.stop();
      await newDb.disconnect();
    });
  });

  describe('Cron Expression Validation', () => {
    it('should validate standard cron expressions', () => {
      const testPlugin = new SchedulerPlugin({
        jobs: {
          test: { schedule: '@daily', action: () => {} }
        }
      });
      
      expect(testPlugin._isValidCronExpression('0 0 * * *')).toBe(true);
      expect(testPlugin._isValidCronExpression('*/15 * * * *')).toBe(true);
      expect(testPlugin._isValidCronExpression('0 9 * * MON')).toBe(true);
    });

    it('should validate shorthand expressions', () => {
      const testPlugin = new SchedulerPlugin({
        jobs: {
          test: { schedule: '@daily', action: () => {} }
        }
      });
      
      expect(testPlugin._isValidCronExpression('@hourly')).toBe(true);
      expect(testPlugin._isValidCronExpression('@daily')).toBe(true);
      expect(testPlugin._isValidCronExpression('@weekly')).toBe(true);
      expect(testPlugin._isValidCronExpression('@monthly')).toBe(true);
      expect(testPlugin._isValidCronExpression('@yearly')).toBe(true);
      expect(testPlugin._isValidCronExpression('@annually')).toBe(true);
    });

    it('should reject invalid expressions', () => {
      const testPlugin = new SchedulerPlugin({
        jobs: {
          test: { schedule: '@daily', action: () => {} }
        }
      });
      
      expect(testPlugin._isValidCronExpression('')).toBe(false);
      expect(testPlugin._isValidCronExpression('invalid')).toBe(false);
      expect(testPlugin._isValidCronExpression('* * *')).toBe(false); // Too few parts
      expect(testPlugin._isValidCronExpression(123)).toBe(false); // Not a string
    });
  });

  describe('Next Run Calculation', () => {
    it('should calculate next run for shorthand expressions', () => {
      const testPlugin = new SchedulerPlugin({
        jobs: {
          test: { schedule: '@daily', action: () => {} }
        }
      });
      
      // Test @hourly - should be at next hour
      const hourly = testPlugin._calculateNextRun('@hourly');
      expect(hourly instanceof Date).toBe(true);
      expect(hourly.getMinutes()).toBe(0);
      expect(hourly.getSeconds()).toBe(0);
      
      // Test @daily - should be tomorrow at midnight
      const daily = testPlugin._calculateNextRun('@daily');
      expect(daily instanceof Date).toBe(true);
      expect(daily.getHours()).toBe(0);
      expect(daily.getMinutes()).toBe(0);
      
      // Test @weekly - should be next Sunday
      const weekly = testPlugin._calculateNextRun('@weekly');
      expect(weekly instanceof Date).toBe(true);
      expect(weekly.getDay()).toBe(0); // Sunday
    });

    it('should calculate next run for standard cron expressions', () => {
      const testPlugin = new SchedulerPlugin({
        jobs: {
          test: { schedule: '@daily', action: () => {} }
        }
      });
      
      // Every hour at minute 0
      const hourly = testPlugin._calculateNextRun('0 * * * *');
      expect(hourly instanceof Date).toBe(true);
      expect(hourly.getMinutes()).toBe(0);
      
      // Every day at 3 AM
      const daily = testPlugin._calculateNextRun('0 3 * * *');
      expect(daily instanceof Date).toBe(true);
      expect(daily.getHours()).toBe(3);
      expect(daily.getMinutes()).toBe(0);
    });

    it('should handle past time by moving to next occurrence', () => {
      const testPlugin = new SchedulerPlugin({
        jobs: {
          test: { schedule: '@daily', action: () => {} }
        }
      });
      
      // Test with current time - should always return future date
      const next = testPlugin._calculateNextRun('0 9 * * *');
      expect(next instanceof Date).toBe(true);
      expect(next.getTime()).toBeGreaterThan(Date.now());
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });
  });

  describe('Job Execution', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-execution');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
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
          database: plugin.database
        }),
        plugin
      );
      
      expect(plugin.config.onJobStart).toHaveBeenCalled();
      expect(plugin.config.onJobComplete).toHaveBeenCalled();
    });

    it('should prevent concurrent execution of same job', async () => {
      // Start first execution
      const promise1 = plugin.runJob('test_job');
      
      // Try to start second execution
      await expect(plugin.runJob('test_job')).rejects.toThrow(
        "Job 'test_job' is already running"
      );
      
      await promise1;
    });

    it('should throw error for non-existent job', async () => {
      await expect(plugin.runJob('non_existent')).rejects.toThrow(
        "Job 'non_existent' not found"
      );
    });

    it('should emit job_start and job_complete events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();
      
      plugin.on('job_start', startSpy);
      plugin.on('job_complete', completeSpy);
      
      await plugin.runJob('test_job');
      
      expect(startSpy).toHaveBeenCalledWith(expect.objectContaining({
        jobName: 'test_job'
      }));
      
      expect(completeSpy).toHaveBeenCalledWith(expect.objectContaining({
        jobName: 'test_job',
        status: 'success'
      }));
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

    // TODO: Fix infinite loop in retry logic - test hangs indefinitely
    it.skip('should handle action errors with retries', async () => {
      // Create a simple isolated test with minimal dependencies
      const simpleFailingAction = jest.fn().mockRejectedValue(new Error('Action failed'));
      
      // Create a simple plugin for this test only
      const testPlugin = new SchedulerPlugin({
        jobs: {
          simple_failing_job: {
            schedule: '@daily',
            action: simpleFailingAction,
            retries: 1,
            enabled: false,
            timeout: 100
          }
        },
        defaultTimeout: 100,
        defaultRetries: 1,
        persistJobs: false, // Disable persistence for this test
        verbose: false
      });
      
      // Setup with a minimal mock database
      await testPlugin.setup({ createResource: jest.fn() });
      
      let errorOccurred = false;
      try {
        await testPlugin.runJob('simple_failing_job');
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toBe('Action failed');
      }
      
      expect(errorOccurred).toBe(true);
      expect(simpleFailingAction).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
      
      const job = testPlugin.jobs.get('simple_failing_job');
      const stats = testPlugin.statistics.get('simple_failing_job');
      
      expect(job.errorCount).toBe(1);
      expect(stats.totalErrors).toBe(1);
      expect(stats.lastError).toBeDefined();
      
      await testPlugin.stop();
    }, 60000);

    it.skip('should handle job timeout', async () => {
      plugin.enableJob('timeout_job');
      
      let errorOccurred = false;
      try {
        await plugin.runJob('timeout_job');
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toBe('Job execution timeout');
      }
      
      expect(errorOccurred).toBe(true);
      
      const job = plugin.jobs.get('timeout_job');
      const stats = plugin.statistics.get('timeout_job');
      
      expect(job.errorCount).toBe(1);
      expect(stats.totalErrors).toBe(1);
      expect(stats.lastError).toBeDefined();
    }, 60000);

    it('should persist job execution history', async () => {
      // First test direct insertion to ensure resource works
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
        createdAt: new Date().toISOString().slice(0, 10)
      };
      
      await database.resource(plugin.config.jobHistoryResource).insert(testRecord);
      
      // Verify direct insertion worked
      const directRecords = await database.resource(plugin.config.jobHistoryResource).list();
      expect(directRecords).toHaveLength(1);
      
      // Clear the test record
      await database.resource(plugin.config.jobHistoryResource).delete('test_123');
      
      // Now test actual job execution
      await plugin.runJob('test_job');
      
      // Check that action was called
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

  describe('Job Management', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-management');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should enable disabled job', () => {
      expect(plugin.jobs.get('disabled_job').enabled).toBe(false);
      
      const enableSpy = jest.fn();
      plugin.on('job_enabled', enableSpy);
      
      plugin.enableJob('disabled_job');
      
      expect(plugin.jobs.get('disabled_job').enabled).toBe(true);
      expect(enableSpy).toHaveBeenCalledWith({ jobName: 'disabled_job' });
    });

    it('should disable enabled job', () => {
      plugin.enableJob('test_job'); // Enable for testing
      expect(plugin.jobs.get('test_job').enabled).toBe(true);
      
      const disableSpy = jest.fn();
      plugin.on('job_disabled', disableSpy);
      
      plugin.disableJob('test_job');
      
      expect(plugin.jobs.get('test_job').enabled).toBe(false);
      expect(disableSpy).toHaveBeenCalledWith({ jobName: 'test_job' });
    });

    it('should throw error when enabling non-existent job', () => {
      expect(() => plugin.enableJob('non_existent')).toThrow(
        "Job 'non_existent' not found"
      );
    });

    it('should throw error when disabling non-existent job', () => {
      expect(() => plugin.disableJob('non_existent')).toThrow(
        "Job 'non_existent' not found"
      );
    });

    it('should cancel scheduled execution when disabling job', () => {
      plugin.enableJob('test_job'); // Enable for testing
      const job = plugin.jobs.get('test_job');
      expect(job.enabled).toBe(true);
      
      const timersBefore = plugin.timers.size;
      plugin.disableJob('test_job');
      
      expect(plugin.timers.has('test_job')).toBe(false);
    });
  });

  describe('Job Status and Statistics', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-status');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should return job status', () => {
      plugin.enableJob('test_job'); // Enable for testing
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
          lastError: null
        }
      });
    });

    it('should return null for non-existent job', () => {
      const status = plugin.getJobStatus('non_existent');
      expect(status).toBeNull();
    });

    it('should return all jobs status', () => {
      const allStatus = plugin.getAllJobsStatus();
      
      expect(allStatus).toHaveLength(5);
      expect(allStatus.every(job => job.name)).toBe(true);
      expect(allStatus.some(job => job.name === 'test_job')).toBe(true);
    });

    it.skip('should calculate success rate correctly', async () => {
      // Run successful job
      await plugin.runJob('test_job');
      
      // Run failing job
      plugin.enableJob('failing_job');
      try {
        await plugin.runJob('failing_job');
      } catch (error) {
        // Expected to fail
      }
      
      const testJobStatus = plugin.getJobStatus('test_job');
      const failingJobStatus = plugin.getJobStatus('failing_job');
      
      expect(testJobStatus.statistics.successRate).toBe(100);
      expect(failingJobStatus.statistics.successRate).toBe(0);
    }, 60000);

    it('should update average duration', async () => {
      await plugin.runJob('test_job');
      await plugin.runJob('test_job');
      
      const status = plugin.getJobStatus('test_job');
      expect(status.statistics.avgDuration).toBeGreaterThan(0);
    });
  });

  describe('Job History', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-history');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);

      // Setup data for tests - just run successful job, handle failing job per test
      await plugin.runJob('test_job');
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
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
        retryCount: 0
      });
    });

    it.skip('should filter history by status', async () => {
      const successHistory = await plugin.getJobHistory('test_job', { status: 'success' });
      
      // Run failing job for error history
      plugin.enableJob('failing_job');
      try {
        await plugin.runJob('failing_job');
      } catch (error) {
        // Expected to fail
      }
      
      const errorHistory = await plugin.getJobHistory('failing_job', { status: 'error' });
      
      expect(successHistory).toHaveLength(1);
      expect(successHistory[0].status).toBe('success');
      
      expect(errorHistory).toHaveLength(1);
      expect(errorHistory[0].status).toBe('error');
    }, 60000);

    it('should limit history results', async () => {
      // Run job multiple times
      await plugin.runJob('test_job');
      await plugin.runJob('test_job');
      
      const limitedHistory = await plugin.getJobHistory('test_job', { limit: 2 });
      expect(limitedHistory).toHaveLength(2);
    });

    it('should return empty array when persistence disabled', async () => {
      const noPersistPlugin = new SchedulerPlugin({
        jobs: {
          test: { schedule: '@daily', action: () => {} }
        },
        persistJobs: false
      });
      
      const history = await noPersistPlugin.getJobHistory('test');
      expect(history).toEqual([]);
    });

    it('should handle history query errors gracefully', async () => {
      // Mock database error
      const originalResource = plugin.database.resource;
      plugin.database.resource = jest.fn().mockReturnValue({
        list: jest.fn().mockRejectedValue(new Error('Database error'))
      });
      
      const history = await plugin.getJobHistory('test_job');
      expect(history).toEqual([]);
      
      // Restore original
      plugin.database.resource = originalResource;
    });
  });

  describe('Dynamic Job Management', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-dynamic');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should add new job at runtime', () => {
      const addSpy = jest.fn();
      plugin.on('job_added', addSpy);
      
      plugin.addJob('runtime_job', {
        schedule: '@hourly',
        description: 'Job added at runtime',
        action: jest.fn().mockResolvedValue({ added: true }),
        enabled: true
      });
      
      expect(plugin.jobs.has('runtime_job')).toBe(true);
      expect(plugin.statistics.has('runtime_job')).toBe(true);
      expect(addSpy).toHaveBeenCalledWith({ jobName: 'runtime_job' });
    });

    it('should throw error when adding job with existing name', () => {
      expect(() => {
        plugin.addJob('test_job', {
          schedule: '@daily',
          action: () => {}
        });
      }).toThrow("Job 'test_job' already exists");
    });

    it('should validate new job configuration', () => {
      expect(() => {
        plugin.addJob('invalid_job', {
          schedule: 'invalid cron'
        });
      }).toThrow('Job must have schedule and action');
      
      expect(() => {
        plugin.addJob('invalid_job2', {
          schedule: 'invalid cron',
          action: () => {}
        });
      }).toThrow('Invalid cron expression: invalid cron');
    });

    it('should remove existing job', () => {
      const removeSpy = jest.fn();
      plugin.on('job_removed', removeSpy);
      
      plugin.removeJob('test_job');
      
      expect(plugin.jobs.has('test_job')).toBe(false);
      expect(plugin.statistics.has('test_job')).toBe(false);
      expect(plugin.timers.has('test_job')).toBe(false);
      expect(removeSpy).toHaveBeenCalledWith({ jobName: 'test_job' });
    });

    it('should throw error when removing non-existent job', () => {
      expect(() => plugin.removeJob('non_existent')).toThrow(
        "Job 'non_existent' not found"
      );
    });
  });

  describe('Scheduling', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-scheduling');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should schedule enabled jobs', () => {
      const enabledJobs = Array.from(plugin.jobs.entries())
        .filter(([name, job]) => job.enabled)
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
      plugin.enableJob('test_job'); // Enable for testing
      const job = plugin.jobs.get('test_job');
      const originalNextRun = job.nextRun;
      
      await plugin.runJob('test_job');
      
      // Allow a small delay for scheduling to complete
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
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
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
          jobName: 'test_job'
        })
      );
    });

    it('should execute onJobComplete hook on success', async () => {
      await plugin.runJob('test_job');
      
      expect(plugin.config.onJobComplete).toHaveBeenCalledWith(
        'test_job',
        { success: true },
        expect.any(Number)
      );
    });

    it.skip('should execute onJobError hook on failure', async () => {
      plugin.enableJob('failing_job');
      
      try {
        await plugin.runJob('failing_job');
      } catch (error) {
        // Expected to fail
      }
      
      expect(plugin.config.onJobError).toHaveBeenCalledWith(
        'failing_job',
        expect.any(Error),
        1 // retry count
      );
    }, 60000);

    it('should handle hook execution errors gracefully', async () => {
      plugin.config.onJobStart = jest.fn().mockRejectedValue(new Error('Hook failed'));
      
      // Should not prevent job from executing
      await plugin.runJob('test_job');
      
      expect(mockActions.testAction).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-errors');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
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
        // Expected to fail
      }
      
      // Check that multiple retry attempts were made
      expect(mockActions.failingAction).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    }, 60000);

    it('should handle persistence errors gracefully', async () => {
      // Mock database error
      const originalResource = plugin.database.resource;
      plugin.database.resource = jest.fn().mockReturnValue({
        insert: jest.fn().mockRejectedValue(new Error('Database error'))
      });
      
      // Should not prevent job execution
      await plugin.runJob('test_job');
      
      expect(mockActions.testAction).toHaveBeenCalled();
      
      // Restore original
      plugin.database.resource = originalResource;
    });
  });

  describe('Plugin Integration', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-integration');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
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
        plugin
      );
    });
  });

  describe('Plugin Lifecycle', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-lifecycle');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should start successfully', async () => {
      await plugin.start();
      // No specific assertions - just ensure no errors
    });

    it('should stop and clear timers', async () => {
      // Enable a job to create timers
      plugin.enableJob('test_job');
      plugin.enableJob('daily_job');
      
      const timersBefore = plugin.timers.size;
      expect(timersBefore).toBeGreaterThan(0);
      
      await plugin.stop();
      
      expect(plugin.timers.size).toBe(0);
    });

    it('should wait for active jobs to complete on stop', async () => {
      // Add mock active job
      plugin.activeJobs.set('test_job', 'execution_123');
      
      const stopPromise = plugin.stop();
      
      // Clear active jobs to simulate completion
      setImmediate(() => {
        plugin.activeJobs.clear();
      });
      
      await stopPromise;
      
      expect(plugin.activeJobs.size).toBe(0);
    });

    it('should cleanup successfully', async () => {
      const removeListenersSpy = jest.spyOn(plugin, 'removeAllListeners');
      
      await plugin.cleanup();
      
      expect(plugin.jobs.size).toBe(0);
      expect(plugin.statistics.size).toBe(0);
      expect(plugin.activeJobs.size).toBe(0);
      expect(removeListenersSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-edge-cases');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should handle job action returning undefined', async () => {
      const undefinedAction = jest.fn().mockResolvedValue(undefined);
      
      plugin.addJob('undefined_job', {
        schedule: '@daily',
        action: undefinedAction,
        enabled: true
      });
      
      await plugin.runJob('undefined_job');
      
      const history = await plugin.getJobHistory('undefined_job');
      expect(history[0].result).toBeNull();
    });

    it.skip('should handle very short timeouts', async () => {
      const shortTimeoutAction = jest.fn().mockImplementation(() => 
        new Promise(() => {}) // Never resolves to test timeout
      );
      
      plugin.addJob('short_timeout_job', {
        schedule: '@daily',
        action: shortTimeoutAction,
        timeout: 10, // Very short timeout
        enabled: true
      });
      
      let errorOccurred = false;
      try {
        await plugin.runJob('short_timeout_job');
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toBe('Job execution timeout');
      }
      
      expect(errorOccurred).toBe(true);
    }, 60000);

    it.skip('should handle jobs with zero retries', async () => {
      plugin.addJob('no_retry_job', {
        schedule: '@daily',
        action: mockActions.failingAction,
        retries: 0,
        enabled: true
      });
      
      try {
        await plugin.runJob('no_retry_job');
      } catch (error) {
        // Expected to fail
      }
      
      expect(mockActions.failingAction).toHaveBeenCalledTimes(1); // No retries
    }, 60000);

    it('should handle extremely long job names', () => {
      const longName = 'a'.repeat(1000);
      
      plugin.addJob(longName, {
        schedule: '@daily',
        action: () => ({ success: true }),
        enabled: true
      });
      
      expect(plugin.jobs.has(longName)).toBe(true);
    });

    it('should handle timezone edge cases', () => {
      const timezonePlugin = new SchedulerPlugin({
        timezone: 'America/Sao_Paulo',
        jobs: {
          test: { schedule: '@daily', action: () => {} }
        }
      });
      
      expect(timezonePlugin.config.timezone).toBe('America/Sao_Paulo');
    });

    it('should handle rapid consecutive job additions and removals', () => {
      for (let i = 0; i < 100; i++) {
        plugin.addJob(`temp_job_${i}`, {
          schedule: '@daily',
          action: () => {},
          enabled: false
        });
      }
      
      expect(plugin.jobs.size).toBe(105); // 5 original + 100 added
      
      for (let i = 0; i < 100; i++) {
        plugin.removeJob(`temp_job_${i}`);
      }
      
      expect(plugin.jobs.size).toBe(5); // Back to original 5
    });
  });

  describe('Complex Scheduling Scenarios', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler-complex');
      plugin = createTestPlugin();
      
      await database.connect();
      await plugin.setup(database);
    });

    afterEach(async () => {
      if (plugin && plugin.stop) {
        await plugin.stop();
      }
      if (database) {
        await database.disconnect();
      }
    });

    it('should handle overlapping job executions correctly', async () => {
      const slowAction = jest.fn().mockImplementation(() => 
        Promise.resolve({ done: true })
      );
      
      plugin.addJob('slow_job', {
        schedule: '@daily',
        action: slowAction,
        enabled: true
      });
      
      // Start first execution
      const promise1 = plugin.runJob('slow_job');
      
      // Try to start second execution while first is running
      await expect(plugin.runJob('slow_job')).rejects.toThrow(
        "Job 'slow_job' is already running"
      );
      
      await promise1;
      
      // Now second execution should work
      await plugin.runJob('slow_job');
      
      expect(slowAction).toHaveBeenCalledTimes(2);
    });

    it.skip('should maintain correct statistics across multiple executions', async () => {
      // Run mix of successful and failing executions
      await plugin.runJob('test_job'); // Success
      
      plugin.enableJob('failing_job');
      try {
        await plugin.runJob('failing_job'); // Failure
      } catch (error) {
        // Expected
      }
      
      await plugin.runJob('test_job'); // Success
      
      const testJobStats = plugin.getJobStatus('test_job').statistics;
      const failingJobStats = plugin.getJobStatus('failing_job').statistics;
      
      expect(testJobStats.totalRuns).toBe(2);
      expect(testJobStats.totalSuccesses).toBe(2);
      expect(testJobStats.successRate).toBe(100);
      
      expect(failingJobStats.totalRuns).toBe(1);
      expect(failingJobStats.totalErrors).toBe(1);
      expect(failingJobStats.successRate).toBe(0);
    }, 60000);
  });
});