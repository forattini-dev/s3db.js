import { afterEach, beforeEach, describe, expect, it, jest, test } from '@jest/globals';

import { createDatabaseForTest } from '../../config.js';
import { SchedulerPlugin } from '../../../src/plugins/scheduler.plugin.js';
import {
  buildMockActions,
  createTestPlugin,
  restoreTimerMocks,
  setupTimerMocks,
} from './helpers.js';

describe('SchedulerPlugin - Validation & Setup', () => {
  let mockActions;

  beforeEach(() => {
    setupTimerMocks();
    mockActions = buildMockActions();
  });

  afterEach(() => {
    restoreTimerMocks();
  });

  describe('Configuration Validation', () => {
    it('should throw error when no jobs defined', () => {
      expect(() => {
        new SchedulerPlugin({ verbose: false,});
      }).toThrow('At least one job must be defined');
    });

    it('should throw error when job has no schedule', () => {
      expect(() => {
        new SchedulerPlugin({
      verbose: false,jobs: {
            invalid: {
              action: () => {},
            },
          },
        });
      }).toThrow("Job 'invalid' must have a schedule");
    });

    it('should throw error when job has no action', () => {
      expect(() => {
        new SchedulerPlugin({
      verbose: false,jobs: {
            invalid: {
              schedule: '* * * * *',
            },
          },
        });
      }).toThrow("Job 'invalid' must have an action function");
    });

    it('should throw error when job action is not a function', () => {
      expect(() => {
        new SchedulerPlugin({
      verbose: false,jobs: {
            invalid: {
              schedule: '* * * * *',
              action: 'not a function',
            },
          },
        });
      }).toThrow("Job 'invalid' must have an action function");
    });

    it('should throw error for invalid cron expression', () => {
      expect(() => {
        new SchedulerPlugin({
      verbose: false,jobs: {
            invalid: {
              schedule: 'invalid cron',
              action: () => {},
            },
          },
        });
      }).toThrow(/Job 'invalid' has invalid cron expression/);
    });

    it('should accept valid shorthand expressions', () => {
      expect(() => {
        new SchedulerPlugin({
      verbose: false,jobs: {
            hourly: { schedule: '@hourly', action: () => {} },
            daily: { schedule: '@daily', action: () => {} },
            weekly: { schedule: '@weekly', action: () => {} },
            monthly: { schedule: '@monthly', action: () => {} },
            yearly: { schedule: '@yearly', action: () => {} },
          },
        });
      }).not.toThrow();
    });
  });

  describe('Plugin Setup (with database)', () => {
    let database;
    let plugin;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=plugins/scheduler');
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

    it('should setup properly with database', async () => {
      expect(plugin.database).toBe(database);
      expect(plugin.jobs.size).toBe(5);
      expect(plugin.activeJobs.size).toBe(0);
      expect(plugin.timers.size).toBe(0);
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
        lastError: null,
      });
    });

    it('should emit initialized event', async () => {
      const initSpy = jest.fn();

      const newPlugin = new SchedulerPlugin({
      verbose: false,jobs: {
          test: { schedule: '@daily', action: () => {}, enabled: true },
        },
      });

      newPlugin.on('db:plugin:initialized', initSpy);

      const newDb = createDatabaseForTest('suite=plugins/scheduler-init');

      await newDb.connect();
      await newPlugin.install(newDb);

      expect(initSpy).toHaveBeenCalledWith({ jobs: 1 });

      await newPlugin.stop();
      await newDb.disconnect();
    });
  });

  describe('Cron Expression Validation', () => {
    const createPlugin = () =>
      new SchedulerPlugin({
      verbose: false,jobs: {
          test: { schedule: '@daily', action: () => {} },
        },
      });

    it('should validate standard cron expressions', () => {
      const plugin = createPlugin();

      expect(plugin._isValidCronExpression('0 0 * * *')).toBe(true);
      expect(plugin._isValidCronExpression('*/15 * * * *')).toBe(true);
      expect(plugin._isValidCronExpression('0 9 * * MON')).toBe(true);
    });

    it('should validate shorthand expressions', () => {
      const plugin = createPlugin();

      expect(plugin._isValidCronExpression('@hourly')).toBe(true);
      expect(plugin._isValidCronExpression('@daily')).toBe(true);
      expect(plugin._isValidCronExpression('@weekly')).toBe(true);
      expect(plugin._isValidCronExpression('@monthly')).toBe(true);
      expect(plugin._isValidCronExpression('@yearly')).toBe(true);
      expect(plugin._isValidCronExpression('@annually')).toBe(true);
    });

    it('should reject invalid expressions', () => {
      const plugin = createPlugin();

      expect(plugin._isValidCronExpression('@invalid')).toBe(false);
      expect(plugin._isValidCronExpression('invalid cron expression')).toBe(false);
      expect(plugin._isValidCronExpression('* * *')).toBe(false);
    });
  });

  describe('Next Run Calculation', () => {
    it('should return null for disabled jobs', () => {
      const plugin = new SchedulerPlugin({
      verbose: false,jobs: {
          test: {
            schedule: '* * * * *',
            action: () => {},
            enabled: false,
          },
        },
      });

      const nextRun = plugin._calculateNextRunFromConfig({
        schedule: '* * * * *',
        enabled: false,
      });
      expect(nextRun).toBeNull();
    });

    it('should calculate next run for enabled jobs', () => {
      const plugin = new SchedulerPlugin({
      verbose: false,jobs: {
          test: {
            schedule: '* * * * *',
            action: () => {},
            enabled: true,
          },
        },
      });

      const nextRun = plugin._calculateNextRunFromConfig({
        schedule: '* * * * *',
        enabled: true,
      });
      expect(nextRun).toBeInstanceOf(Date);
    });

    it('should handle custom timezone', () => {
      const plugin = new SchedulerPlugin({
      verbose: false,timezone: 'America/Sao_Paulo',
        jobs: {
          test: {
            schedule: '0 0 * * *',
            action: () => {},
            enabled: true,
          },
        },
      });

      const nextRun = plugin._calculateNextRunFromConfig({
        schedule: '0 0 * * *',
        enabled: true,
      });
      expect(nextRun).toBeInstanceOf(Date);
    });

    it('should reschedule after execution', async () => {
      const plugin = createTestPlugin(mockActions, {
        jobs: {
          sync_job: {
            schedule: '* * * * *',
            action: mockActions.testAction,
            enabled: true,
          },
        },
      });

      const jobConfig = plugin.config.jobs.sync_job;
      const nextRun = plugin._calculateNextRunFromConfig(jobConfig);
      expect(nextRun).toBeInstanceOf(Date);
    });
  });
});
