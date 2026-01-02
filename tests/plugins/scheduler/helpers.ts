import { vi } from 'vitest';

import { SchedulerPlugin } from '../../../src/plugins/scheduler.plugin.js';
import { FakeTimers } from '../../utils/time-helpers.js';

export { FakeTimers };

export function setupTimerMocks() {
  // No-op: Don't install fake timers globally as they block async operations
  // Use FakeTimers.install() inside specific tests that need it
}

export function restoreTimerMocks() {
  // Ensure fake timers are cleaned up if test installed them
  FakeTimers.uninstall();
}

export function buildMockActions() {
  // Track calls for assertions
  const calls = {
    testAction: [],
    longRunningAction: [],
    failingAction: [],
    timeoutAction: [],
  };

  const actions = {
    testAction: vi.fn(async (...args) => {
      calls.testAction.push(args);
      return { success: true };
    }),
    longRunningAction: vi.fn(async (...args) => {
      calls.longRunningAction.push(args);
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work
      return { done: true };
    }),
    failingAction: vi.fn(async (...args) => {
      calls.failingAction.push(args);
      throw new Error('Action failed');
    }),
    timeoutAction: vi.fn(async (...args) => {
      calls.timeoutAction.push(args);
      // Simulate timeout - never resolves
      return new Promise(() => {});
    })
  };

  actions._calls = calls;

  return actions;
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

  // Track hook calls
  const hookCalls = {
    onJobStart: [],
    onJobComplete: [],
    onJobError: [],
  };

  // Create hook functions with tracking and assertion methods
  const hooks = {};
  for (const hookName of ['onJobStart', 'onJobComplete', 'onJobError']) {
    const hookFn = vi.fn((...args) => hookCalls[hookName].push(args));

    hooks[hookName] = overrides[hookName] || hookFn;
  }

  const config = {
    timezone: 'UTC',
    jobs,
    defaultTimeout: 500,
    defaultRetries: 1,
    persistJobs,
    onJobStart: hooks.onJobStart,
    onJobComplete: hooks.onJobComplete,
    onJobError: hooks.onJobError,
    logLevel: 'silent',
    ...overrides,
    jobs,
    persistJobs,
    _hookCalls: hookCalls, // Expose for test assertions
    _hooks: hooks, // Expose hook functions for assertions
  };

  return new SchedulerPlugin(config);
}