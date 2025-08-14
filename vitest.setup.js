// Setup environment for Vitest tests
import { vi, afterEach, beforeEach, describe, it, test, expect } from 'vitest';

// Set test environment variables
process.env.BUCKET_CONNECTION_STRING = 's3://test:test@test-bucket?endpoint=http://localhost:4566&forcePathStyle=true';
process.env.NODE_ENV = 'test';

// Make Vitest functions available globally
global.afterEach = afterEach;
global.beforeEach = beforeEach;
global.describe = describe;
global.it = it;
global.test = test;
global.expect = expect;
global.vi = vi;

// Jest compatibility - add jest object to global
global.jest = {
  fn: vi.fn,
  spyOn: vi.spyOn,
  clearAllMocks: vi.clearAllMocks,
  resetAllMocks: vi.resetAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
  mock: vi.mock,
  unmock: vi.unmock,
  useFakeTimers: vi.useFakeTimers,
  useRealTimers: vi.useRealTimers,
  advanceTimersByTime: vi.advanceTimersByTime,
  runAllTimers: vi.runAllTimers,
  runOnlyPendingTimers: vi.runOnlyPendingTimers,
  clearAllTimers: vi.clearAllTimers
};