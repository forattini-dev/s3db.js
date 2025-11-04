import { jest } from '@jest/globals';

import { SchedulerPlugin } from '../../../src/plugins/scheduler.plugin.js';

export function setupTimerMocks() {
  jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => ({
    id: Math.random(),
    fn,
    delay,
  }));
  jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});
}

export function restoreTimerMocks() {
  jest.restoreAllMocks();
}

export function buildMockActions() {
  return {
    testAction: jest.fn().mockResolvedValue({ success: true }),
    longRunningAction: jest.fn().mockResolvedValue({ done: true }),
    failingAction: jest.fn().mockRejectedValue(new Error('Action failed')),
    timeoutAction: jest.fn().mockImplementation(() => new Promise(() => {})),
  };
}

export function defaultJobs(mockActions) {
  return {
    test_job: {
      schedule: '*/5 * * * *',
      description: 'Test job that runs every 5 minutes',
      action: mockActions.testAction,
      enabled: false,
      retries: 2,
      timeout: 1000,
    },
    daily_job: {
      schedule: '@daily',
      description: 'Daily cleanup job',
      action: mockActions.testAction,
      enabled: false,
    },
    disabled_job: {
      schedule: '0 0 * * *',
      description: 'Disabled job',
      action: mockActions.testAction,
      enabled: false,
    },
    failing_job: {
      schedule: '0 * * * *',
      description: 'Job that always fails',
      action: mockActions.failingAction,
      enabled: false,
      retries: 1,
    },
    timeout_job: {
      schedule: '0 0 * * *',
      description: 'Job that times out',
      action: mockActions.timeoutAction,
      enabled: false,
      timeout: 100,
    },
  };
}

export function createTestPlugin(mockActions = buildMockActions(), overrides = {}) {
  const jobs = overrides.jobs || defaultJobs(mockActions);
  const persistJobs =
    Object.prototype.hasOwnProperty.call(overrides, 'persistJobs') ? overrides.persistJobs : true;

  const config = {
    timezone: 'UTC',
    jobs,
    defaultTimeout: 500,
    defaultRetries: 1,
    persistJobs,
    onJobStart: overrides.onJobStart || jest.fn(),
    onJobComplete: overrides.onJobComplete || jest.fn(),
    onJobError: overrides.onJobError || jest.fn(),
    verbose: false,
    ...overrides,
    jobs,
    persistJobs,
  };

  return new SchedulerPlugin(config);
}
