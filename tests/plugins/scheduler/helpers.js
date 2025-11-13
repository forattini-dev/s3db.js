import { jest } from '@jest/globals';

import { SchedulerPlugin } from '../../../src/plugins/scheduler.plugin.js';

export function setupTimerMocks() {
  // No mocking - use real timers
}

export function restoreTimerMocks() {
  // No mocking cleanup needed
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
    testAction: async (...args) => {
      calls.testAction.push(args);
      return { success: true };
    },
    longRunningAction: async (...args) => {
      calls.longRunningAction.push(args);
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work
      return { done: true };
    },
    failingAction: async (...args) => {
      calls.failingAction.push(args);
      throw new Error('Action failed');
    },
    timeoutAction: async (...args) => {
      calls.timeoutAction.push(args);
      // Simulate timeout - never resolves
      return new Promise(() => {});
    },
    // Expose calls for assertions
    _calls: calls,
  };

  // Add helper methods for assertions (Jest-compatible API)
  for (const actionName of Object.keys(calls)) {
    const action = actions[actionName];

    // Check if function was called
    action.toHaveBeenCalled = () => {
      if (calls[actionName].length === 0) {
        throw new Error(`Expected ${actionName} to have been called, but it was not called.`);
      }
      return true;
    };

    // Check if function was called with specific arguments
    action.toHaveBeenCalledWith = (...expectedArgs) => {
      const matchingCall = calls[actionName].find(actualArgs => {
        if (actualArgs.length !== expectedArgs.length) return false;
        return expectedArgs.every((expected, idx) => {
          const actual = actualArgs[idx];
          // Handle expect.objectContaining and expect.any
          if (expected && typeof expected === 'object' && expected.asymmetricMatch) {
            return expected.asymmetricMatch(actual);
          }
          return JSON.stringify(actual) === JSON.stringify(expected);
        });
      });

      if (!matchingCall) {
        throw new Error(
          `Expected ${actionName} to have been called with ${JSON.stringify(expectedArgs)}, ` +
          `but it was called with ${JSON.stringify(calls[actionName])}`
        );
      }
      return true;
    };

    // Check if function was called N times
    action.toHaveBeenCalledTimes = (expectedCount) => {
      const actualCount = calls[actionName].length;
      if (actualCount !== expectedCount) {
        throw new Error(
          `Expected ${actionName} to have been called ${expectedCount} times, ` +
          `but it was called ${actualCount} times.`
        );
      }
      return true;
    };

    // Get call count
    action.mock = {
      calls: calls[actionName],
      get callCount() { return calls[actionName].length; }
    };
  }

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
    const hookFn = (...args) => hookCalls[hookName].push(args);

    // Add assertion methods (Jest-compatible API)
    hookFn.toHaveBeenCalled = () => {
      if (hookCalls[hookName].length === 0) {
        throw new Error(`Expected ${hookName} to have been called, but it was not called.`);
      }
      return true;
    };

    hookFn.toHaveBeenCalledWith = (...expectedArgs) => {
      const matchingCall = hookCalls[hookName].find(actualArgs => {
        if (actualArgs.length !== expectedArgs.length) return false;
        return expectedArgs.every((expected, idx) => {
          const actual = actualArgs[idx];
          if (expected && typeof expected === 'object' && expected.asymmetricMatch) {
            return expected.asymmetricMatch(actual);
          }
          return JSON.stringify(actual) === JSON.stringify(expected);
        });
      });

      if (!matchingCall) {
        throw new Error(
          `Expected ${hookName} to have been called with ${JSON.stringify(expectedArgs)}, ` +
          `but it was called with ${JSON.stringify(hookCalls[hookName])}`
        );
      }
      return true;
    };

    hookFn.toHaveBeenCalledTimes = (expectedCount) => {
      const actualCount = hookCalls[hookName].length;
      if (actualCount !== expectedCount) {
        throw new Error(
          `Expected ${hookName} to have been called ${expectedCount} times, ` +
          `but it was called ${actualCount} times.`
        );
      }
      return true;
    };

    hookFn.mock = {
      calls: hookCalls[hookName],
      get callCount() { return hookCalls[hookName].length; }
    };

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
    verbose: false,
    ...overrides,
    jobs,
    persistJobs,
    _hookCalls: hookCalls, // Expose for test assertions
    _hooks: hooks, // Expose hook functions for assertions
  };

  return new SchedulerPlugin(config);
}
