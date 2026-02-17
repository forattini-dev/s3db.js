import { createLogger, S3DBLogger, LogLevel } from './logger.js';
import { bumpProcessMaxListeners } from './process-max-listeners.js';

export interface CronManagerOptions {
  logLevel?: LogLevel;
  shutdownTimeout?: number;
  exitOnSignal?: boolean;
  disabled?: boolean;
  logger?: S3DBLogger;
}

export interface CronJobEntry {
  task: CronTask;
  expression: string;
  fn: () => void | Promise<void>;
  options: ScheduleOptions;
  createdAt: number;
}

export interface CronTask {
  start(): void;
  stop(): void;
  destroy?(): void;
  run?(...args: unknown[]): Promise<void>;
}

export interface ScheduleOptions {
  scheduled?: boolean;
  timezone?: string;
  recoverMissedExecutions?: boolean;
  replace?: boolean;
}

export interface JobStats {
  name: string;
  expression: string;
  createdAt: number;
  uptime: number;
}

export interface CronStats {
  totalJobs: number;
  jobs: JobStats[];
  isDestroyed: boolean;
}

export interface CronShutdownOptions {
  timeout?: number;
  signal?: string;
  error?: Error;
}

interface NodeCronModule {
  schedule(
    expression: string,
    fn: () => void | Promise<void>,
    options?: {
      scheduled?: boolean;
      timezone?: string;
      recoverMissedExecutions?: boolean;
    }
  ): CronTask;
}

function createStepExpression(value: number): string {
  return ['*', '/', String(value)].join('');
}

function createHourlyStepExpression(value: number): string {
  return ['0 ', createStepExpression(value), ' * * *'].join('');
}

function createDailyStepExpression(value: number): string {
  return ['0 0 ', createStepExpression(value), ' * *'].join('');
}

export function intervalToCron(ms: number): string {
  const seconds = Math.max(1, Math.floor(ms / 1000));

  if (seconds < 60) {
    return `${createStepExpression(seconds)} * * * * *`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${createStepExpression(minutes)} * * * *`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return createHourlyStepExpression(hours);
  }

  const days = Math.floor(hours / 24);

  return createDailyStepExpression(days);
}

export const CRON_PRESETS = {
  EVERY_SECOND: '* * * * * *',
  EVERY_5_SECONDS: `${createStepExpression(5)} * * * * *`,
  EVERY_10_SECONDS: `${createStepExpression(10)} * * * * *`,
  EVERY_15_SECONDS: `${createStepExpression(15)} * * * * *`,
  EVERY_30_SECONDS: `${createStepExpression(30)} * * * * *`,
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: `${createStepExpression(5)} * * * *`,
  EVERY_10_MINUTES: `${createStepExpression(10)} * * * *`,
  EVERY_15_MINUTES: `${createStepExpression(15)} * * * *`,
  EVERY_30_MINUTES: `${createStepExpression(30)} * * * *`,
  EVERY_HOUR: '0 * * * *',
  EVERY_2_HOURS: createHourlyStepExpression(2),
  EVERY_6_HOURS: createHourlyStepExpression(6),
  EVERY_12_HOURS: createHourlyStepExpression(12),
  EVERY_DAY: '0 0 * * *',
  EVERY_DAY_NOON: '0 12 * * *',
  EVERY_WEEK: '0 0 * * 0',
  EVERY_MONTH: '0 0 1 * *',
  BUSINESS_HOURS_START: '0 9 * * 1-5',
  BUSINESS_HOURS_END: '0 17 * * 1-5',
} as const;

export class CronManager {
  private options: Required<Omit<CronManagerOptions, 'logger'>> & { logger?: S3DBLogger };
  private logger: S3DBLogger;
  private jobs: Map<string, CronJobEntry>;
  private _cron: NodeCronModule | null;
  private _destroyed: boolean;
  private _signalHandlersSetup: boolean;
  private _boundShutdownHandler?: (signal: string) => void;
  private _boundErrorHandler?: (error: Error) => void;
  disabled: boolean;

  constructor(options: CronManagerOptions = {}) {
    const envDisabled = typeof process !== 'undefined' && process.env.S3DB_DISABLE_CRON === 'true';
    const explicitDisabled = typeof options.disabled === 'boolean' ? options.disabled : undefined;
    const isDisabled = explicitDisabled !== undefined ? explicitDisabled : envDisabled;

    this.options = {
      logLevel: options.logLevel || 'info',
      shutdownTimeout: options.shutdownTimeout || 30000,
      exitOnSignal: options.exitOnSignal !== false,
      disabled: isDisabled,
    };

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.options.logLevel;
      this.logger = createLogger({ name: 'CronManager', level: logLevel });
    }

    this.jobs = new Map();
    this._cron = null;
    this._destroyed = false;
    this._signalHandlersSetup = false;
    this.disabled = this.options.disabled;

    this.logger.debug({ disabled: this.disabled }, 'CronManager initialized');

    if (!this.disabled) {
      this._setupSignalHandlers();
    }
  }

  private _setupSignalHandlers(): void {
    if (this.disabled || this._signalHandlersSetup) return;

    this._boundShutdownHandler = this._handleShutdown.bind(this);
    this._boundErrorHandler = this._handleError.bind(this);

    bumpProcessMaxListeners(5);
    process.once('SIGTERM', this._boundShutdownHandler);
    process.once('SIGINT', this._boundShutdownHandler);
    process.once('beforeExit', this._boundShutdownHandler);
    process.once('uncaughtException', this._boundErrorHandler);
    process.once('unhandledRejection', this._boundErrorHandler as (reason: unknown) => void);

    this._signalHandlersSetup = true;

    this.logger.debug('Signal handlers registered');
  }

  removeSignalHandlers(): void {
    if (!this._signalHandlersSetup) return;

    if (this._boundShutdownHandler) {
      process.removeListener('SIGTERM', this._boundShutdownHandler);
      process.removeListener('SIGINT', this._boundShutdownHandler);
      process.removeListener('beforeExit', this._boundShutdownHandler);
    }
    if (this._boundErrorHandler) {
      process.removeListener('uncaughtException', this._boundErrorHandler);
      process.removeListener('unhandledRejection', this._boundErrorHandler as (reason: unknown) => void);
    }

    this._signalHandlersSetup = false;
    bumpProcessMaxListeners(-5);

    this.logger.debug('Signal handlers removed');
  }

  private _handleShutdown(signal: string): void {
    if (this._destroyed) return;

    this.logger.debug({ signal }, `Received ${signal}, shutting down...`);

    this.shutdown({ signal })
      .then(() => {
        if (this.options.exitOnSignal) {
          process.exit(0);
        }
      })
      .catch((error: Error) => {
        this.logger.error({ error: error.message, stack: error.stack }, 'Shutdown error');
        if (this.options.exitOnSignal) {
          process.exit(1);
        }
      });
  }

  private _handleError(error: Error): void {
    this.logger.error({ error: error.message, stack: error.stack }, 'Uncaught error');
    this.shutdown({ error })
      .then(() => {
        if (this.options.exitOnSignal) {
          process.exit(1);
        }
      })
      .catch(() => {
        if (this.options.exitOnSignal) {
          process.exit(1);
        }
      });
  }

  private async _loadCron(): Promise<NodeCronModule> {
    if (this._cron) return this._cron;

    const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

    try {
      const cronModule = await import('node-cron');
      this._cron = cronModule.default || cronModule;

      this.logger.debug('node-cron loaded');

      return this._cron;
    } catch (error) {
      if (isTestEnv) {
        this.logger.warn({ error: (error as Error).message }, `Falling back to in-memory cron stub for tests`);

        this._cron = this._createTestCronStub();
        return this._cron;
      }

      throw new Error(
        'Failed to load the bundled node-cron dependency. Try reinstalling packages with `pnpm install`.\n' +
        'Error: ' + (error as Error).message
      );
    }
  }

  async schedule(
    expression: string,
    fn: () => void | Promise<void>,
    name: string,
    options: ScheduleOptions = {}
  ): Promise<CronTask | null> {
    if (this._destroyed) {
      this.logger.warn({ name }, `Cannot schedule job '${name}' - manager is destroyed`);
      return null;
    }

    if (this.disabled) {
      this.logger.debug({ name }, `Scheduling disabled - skipping job '${name}'`);
      return this._createStubTask(name, fn);
    }

    const { replace = false, ...cronOptions } = options || {};

    if (this.jobs.has(name)) {
      if (!replace) {
        throw new Error(`[CronManager] Job '${name}' already exists`);
      }

      const stopped = this.stop(name);

      if (!stopped && this.jobs.has(name)) {
        this.jobs.delete(name);
      }

      this.logger.debug({ name }, `Replaced existing job '${name}'`);
    }

    const cron = await this._loadCron();

    const task = cron.schedule(
      expression,
      fn,
      {
        scheduled: cronOptions.scheduled !== false,
        timezone: cronOptions.timezone,
        recoverMissedExecutions: cronOptions.recoverMissedExecutions || false,
      }
    );

    if (cronOptions.scheduled !== false && task?.start) {
      task.start();
    }

    this.jobs.set(name, {
      task,
      expression,
      fn,
      options: { ...cronOptions, replace },
      createdAt: Date.now(),
    });

    this.logger.debug({ name, expression }, `Scheduled job '${name}': ${expression}`);

    return task;
  }

  async scheduleInterval(
    ms: number,
    fn: () => void | Promise<void>,
    name: string,
    options: ScheduleOptions = {}
  ): Promise<CronTask | null> {
    const normalizedMs = Math.floor(ms);
    const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

    if (this._destroyed) {
      this.logger.warn({ name }, `Cannot schedule job '${name}' - manager is destroyed`);
      return null;
    }

    if (isTestEnv && normalizedMs > 0 && normalizedMs < 1000) {
      const intervalMs = Math.max(normalizedMs, 10);

      let timerId: ReturnType<typeof setInterval> | null = null;

      const run = async () => {
        try {
          await fn?.();
        } catch (error) {
          this.logger.warn({ error: (error as Error)?.message || String(error) }, `In-memory interval job '${name}' failed`);
        }
      };

      const start = () => {
        if (timerId !== null) {
          return;
        }
        timerId = setInterval(() => {
          void run();
        }, intervalMs);
      };

      const stop = () => {
        if (timerId === null) {
          return;
        }
        clearInterval(timerId);
        timerId = null;
      };

      const task: CronTask = {
        start,
        stop,
        destroy: stop,
        run
      };

      if (options.scheduled !== false) {
        start();
      }

      this.jobs.set(name, {
        task,
        expression: `every ${intervalMs}ms`,
        fn,
        options: { ...options },
        createdAt: Date.now(),
      });

      this.logger.debug({ name, intervalMs }, `Scheduled in-memory test interval job '${name}': ${intervalMs}ms`);

      return task;
    }

    if (this.disabled) {
      this.logger.debug({ name }, `Scheduling disabled - skipping job '${name}'`);
      return this._createStubTask(name, fn);
    }

    const expression = intervalToCron(ms);
    return this.schedule(expression, fn, name, options);
  }

  stop(name: string): boolean {
    const jobName = typeof name === 'string' ? name : String(name);

    if (!this.jobs.has(name)) {
      (this.logger as { trace?: S3DBLogger['debug'] }).trace?.({ name: jobName }, `Job '${jobName}' not found`);
      return false;
    }

    const entry = this.jobs.get(name)!;

    try {
      entry.task?.stop?.();
      entry.task?.destroy?.();
      this.jobs.delete(name);

      this.logger.debug({ name }, `Stopped job '${name}'`);

      return true;
    } catch (error) {
      this.logger.error({ name, error: (error as Error).message, stack: (error as Error).stack }, `Error stopping job '${name}'`);
      return false;
    }
  }

  getStats(): CronStats {
    const stats: CronStats = {
      totalJobs: this.jobs.size,
      jobs: [],
      isDestroyed: this._destroyed,
    };

    for (const [name, entry] of this.jobs.entries()) {
      stats.jobs.push({
        name,
        expression: entry.expression,
        createdAt: entry.createdAt,
        uptime: Date.now() - entry.createdAt,
      });
    }

    return stats;
  }

  isDestroyed(): boolean {
    return this._destroyed;
  }

  async shutdown(options: CronShutdownOptions = {}): Promise<void> {
    if (this._destroyed) {
      this.logger.debug('Already destroyed');
      return;
    }

    const timeout = options.timeout || this.options.shutdownTimeout;

    this.logger.debug({ jobCount: this.jobs.size }, `Shutting down ${this.jobs.size} jobs...`);

    if (this.disabled) {
      this.jobs.clear();
      this._destroyed = true;
      return;
    }

    const stopPromises: Promise<void>[] = [];
    for (const [name, entry] of this.jobs.entries()) {
      const stopPromise = new Promise<void>((resolve, reject) => {
        try {
          entry.task?.stop?.();
          entry.task?.destroy?.();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Stop timeout for job '${name}'`)), timeout)
      );

      stopPromises.push(
        Promise.race([stopPromise, timeoutPromise])
          .catch(error => {
            this.logger.warn({ name, error: (error as Error).message }, `Error stopping job '${name}'`);
          })
      );
    }

    await Promise.allSettled(stopPromises);

    this.jobs.clear();
    this._destroyed = true;

    this.logger.debug('Shutdown complete');
  }

  private _createStubTask(name: string, fn: () => void | Promise<void>): CronTask {
    const logger = this.logger;
    return {
      start() {},
      stop() {},
      destroy() {},
      async run(...args: unknown[]) {
        try {
          await fn?.();
        } catch (error) {
          logger.error({ name, error: (error as Error).message, stack: (error as Error).stack }, `Stub task '${name}' execution error`);
        }
      }
    };
  }

  private _inferIntervalFromExpression(expression: string): number {
    if (!expression || typeof expression !== 'string') {
      return 60_000;
    }

    const parts = expression.trim().split(/\s+/);

    if (parts.length === 6) {
      const secondsPart = parts[0] ?? '';
      const match = secondsPart.match(/^\*\/(\d+)$/);
      if (match && match[1]) {
        const step = parseInt(match[1], 10);
        if (!Number.isNaN(step) && step > 0) {
          return Math.max(step * 1000, 10);
        }
      }
    }

    if (parts.length >= 5) {
      const minutesPart = parts[0] ?? '';
      const match = minutesPart.match(/^\*\/(\d+)$/);
      if (match && match[1]) {
        const step = parseInt(match[1], 10);
        if (!Number.isNaN(step) && step > 0) {
          return Math.max(step * 60_000, 10);
        }
      }
    }

    return 60_000;
  }

  private _createTestCronStub(): NodeCronModule {
    const setIntervalFn = (
      (globalThis as { originalSetInterval?: typeof setInterval }).originalSetInterval ||
      globalThis.setInterval ||
      setInterval
    ).bind(globalThis);

    const clearIntervalFn = (
      (globalThis as { originalClearInterval?: typeof clearInterval }).originalClearInterval ||
      globalThis.clearInterval ||
      clearInterval
    ).bind(globalThis);

    const logger = this.logger;
    const inferInterval = this._inferIntervalFromExpression.bind(this);

    return {
      schedule: (expression: string, fn: () => void | Promise<void>, options: { scheduled?: boolean } = {}) => {
        const intervalMs = inferInterval(expression);
        let timerId: ReturnType<typeof setInterval> | null = null;

        const run = async () => {
          try {
            await fn?.();
          } catch (err) {
            logger.warn({ error: (err as Error)?.message || String(err) }, 'Test cron stub task error');
          }
        };

        const start = () => {
          if (timerId !== null) return;
          timerId = setIntervalFn(run, intervalMs);
        };

        const stop = () => {
          if (timerId === null) return;
          clearIntervalFn(timerId);
          timerId = null;
        };

        const destroy = () => {
          stop();
        };

        if (options.scheduled !== false) {
          start();
        }

        return {
          start,
          stop,
          destroy,
          run,
        };
      },
    };
  }
}

let _globalCronManager: CronManager | null = null;

export function getCronManager(options: CronManagerOptions = {}): CronManager {
  if (!_globalCronManager) {
    _globalCronManager = new CronManager(options);
  }
  return _globalCronManager;
}

export function resetCronManager(): void {
  if (_globalCronManager) {
    _globalCronManager.shutdown().catch(() => {});
    _globalCronManager.removeSignalHandlers();
    _globalCronManager = null;
  }
}

export function createCronManager(options: CronManagerOptions = {}): CronManager {
  return new CronManager(options);
}
