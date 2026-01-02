import { vi, type MockInstance } from 'vitest';

/**
 * FakeTimers - Utilities for controlling time in tests.
 *
 * Usage:
 * ```typescript
 * import { FakeTimers } from '#tests/utils/time-helpers.js';
 *
 * beforeEach(() => FakeTimers.install());
 * afterEach(() => FakeTimers.uninstall());
 *
 * it('test with fake timers', async () => {
 *   setTimeout(() => console.log('fired'), 5000);
 *   await FakeTimers.advance(5000); // Instant!
 * });
 * ```
 */
export const FakeTimers = {
  _installed: false,
  _originalDateNow: Date.now,

  /**
   * Install fake timers. Call in beforeEach().
   * @param options - Vitest fake timer options
   */
  install(options: Parameters<typeof vi.useFakeTimers>[0] = {}): void {
    if (this._installed) return;
    vi.useFakeTimers({
      shouldAdvanceTime: false,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      ...options,
    });
    this._installed = true;
  },

  /**
   * Uninstall fake timers. Call in afterEach().
   */
  uninstall(): void {
    if (!this._installed) return;
    vi.useRealTimers();
    this._installed = false;
  },

  /**
   * Advance time by milliseconds and flush pending timers.
   * @param ms - Milliseconds to advance
   */
  async advance(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
  },

  /**
   * Run all pending timers (setTimeout, setInterval).
   * Use with caution - may cause infinite loops with setInterval.
   */
  async runAll(): Promise<void> {
    await vi.runAllTimersAsync();
  },

  /**
   * Run only pending setTimeout callbacks (not setInterval).
   */
  async runOnlyPending(): Promise<void> {
    await vi.runOnlyPendingTimersAsync();
  },

  /**
   * Advance to the next timer and execute it.
   */
  async next(): Promise<void> {
    await vi.advanceTimersToNextTimerAsync();
  },

  /**
   * Set the current system time.
   * @param date - Date to set (Date object or timestamp)
   */
  setSystemTime(date: Date | number): void {
    vi.setSystemTime(date);
  },

  /**
   * Get current mocked time.
   */
  now(): number {
    return Date.now();
  },

  /**
   * Get count of pending timers.
   */
  getPendingTimers(): number {
    return vi.getTimerCount();
  },

  /**
   * Clear all pending timers without executing them.
   */
  clearAll(): void {
    vi.clearAllTimers();
  },
};

/**
 * Wait helper that works with both real and fake timers.
 * In fake timer mode, instantly advances time.
 * In real timer mode, actually waits.
 *
 * @param ms - Milliseconds to wait
 */
export async function wait(ms: number): Promise<void> {
  if (FakeTimers._installed) {
    await FakeTimers.advance(ms);
  } else {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Run a callback with fake timers temporarily installed.
 * Automatically uninstalls after callback completes.
 *
 * @param callback - Async function to run with fake timers
 */
export async function withFakeTimers<T>(callback: () => Promise<T>): Promise<T> {
  FakeTimers.install();
  try {
    return await callback();
  } finally {
    FakeTimers.uninstall();
  }
}

/**
 * Create a deferred promise that can be resolved/rejected externally.
 * Useful for controlling async flow in tests.
 */
export function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Wait for a condition to be true, with timeout.
 * Works with both real and fake timers.
 *
 * @param condition - Function that returns true when condition is met
 * @param options - Timeout and interval options
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 10 } = options;
  const start = Date.now();

  while (!(await condition())) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timeout after ${timeout}ms`);
    }
    await wait(interval);
  }
}

/**
 * Execute callback multiple times with time advancement between each.
 * Useful for testing periodic tasks like cron jobs.
 *
 * @param count - Number of iterations
 * @param intervalMs - Time to advance between iterations
 * @param callback - Callback to execute each iteration
 */
export async function repeatWithTimeAdvance(
  count: number,
  intervalMs: number,
  callback: (iteration: number) => Promise<void>
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await callback(i);
    if (i < count - 1) {
      await wait(intervalMs);
    }
  }
}

/**
 * Spy on setTimeout calls and capture their details.
 * Returns a spy that tracks all setTimeout invocations.
 */
export function spyOnSetTimeout(): MockInstance & {
  getCalls: () => Array<{ callback: Function; delay: number }>;
} {
  const calls: Array<{ callback: Function; delay: number }> = [];
  const originalSetTimeout = globalThis.setTimeout;

  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay) => {
    calls.push({ callback: callback as Function, delay: delay || 0 });
    return originalSetTimeout(callback, delay);
  });

  (spy as any).getCalls = () => calls;
  return spy as any;
}

/**
 * Scheduler-specific helpers for cron job testing.
 */
export const SchedulerTimers = {
  /**
   * Advance to the next cron trigger time.
   * @param cronExpression - Cron expression (e.g., "0 * * * *" for hourly)
   * @param fromDate - Starting date (defaults to now)
   */
  async advanceToNextCron(cronExpression: string, fromDate?: Date): Promise<void> {
    const { parseExpression } = await import('cron-parser');
    const interval = parseExpression(cronExpression, {
      currentDate: fromDate || new Date(),
    });
    const next = interval.next().toDate();
    const msToAdvance = next.getTime() - (fromDate?.getTime() || Date.now());

    if (msToAdvance > 0) {
      await FakeTimers.advance(msToAdvance);
    }
  },

  /**
   * Simulate multiple cron cycles.
   * @param cronExpression - Cron expression
   * @param cycles - Number of cycles to simulate
   * @param callback - Optional callback after each cycle
   */
  async simulateCronCycles(
    cronExpression: string,
    cycles: number,
    callback?: (cycle: number) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < cycles; i++) {
      await this.advanceToNextCron(cronExpression);
      if (callback) {
        await callback(i);
      }
    }
  },
};

/**
 * TTL-specific helpers for testing time-to-live functionality.
 */
export const TTLTimers = {
  /**
   * Advance time past a TTL expiration.
   * @param ttlSeconds - TTL in seconds
   * @param extraMs - Extra milliseconds past expiration (default: 100)
   */
  async expireTTL(ttlSeconds: number, extraMs = 100): Promise<void> {
    await FakeTimers.advance(ttlSeconds * 1000 + extraMs);
  },

  /**
   * Advance to just before TTL expires.
   * @param ttlSeconds - TTL in seconds
   * @param beforeMs - Milliseconds before expiration (default: 100)
   */
  async advanceBeforeExpiration(ttlSeconds: number, beforeMs = 100): Promise<void> {
    await FakeTimers.advance(ttlSeconds * 1000 - beforeMs);
  },
};
