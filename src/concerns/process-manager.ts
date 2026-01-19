import { createLogger, S3DBLogger, LogLevel } from './logger.js';
import { bumpProcessMaxListeners } from './process-max-listeners.js';

export interface ProcessManagerOptions {
  logLevel?: LogLevel;
  shutdownTimeout?: number;
  exitOnSignal?: boolean;
  logger?: S3DBLogger;
}

export interface IntervalEntry {
  id: ReturnType<typeof setTimeout>;
  fn: () => void;
  interval: number;
  precise: boolean;
}

export interface TimeoutEntry {
  id: ReturnType<typeof setTimeout>;
  fn: () => void;
  delay: number;
}

export type CleanupFn = () => Promise<void> | void;

export interface ProcessManagerStatus {
  isShuttingDown: boolean;
  intervals: string[];
  timeouts: string[];
  cleanups: string[];
  counts: {
    intervals: number;
    timeouts: number;
    cleanups: number;
  };
}

export interface ShutdownOptions {
  timeout?: number;
}

export class ProcessManager {
  private options: Required<Omit<ProcessManagerOptions, 'logger'>> & { logger?: S3DBLogger };
  private logger: S3DBLogger;
  private intervals: Map<string, IntervalEntry>;
  private timeouts: Map<string, TimeoutEntry>;
  private cleanups: Map<string, CleanupFn>;
  private isShuttingDown: boolean;
  private shutdownPromise: Promise<void> | null;
  private _boundSignalHandler: (signal: string) => Promise<void>;
  private _boundUncaughtHandler: ((err: Error) => void) | null;
  private _boundUnhandledHandler: ((reason: unknown, promise: Promise<unknown>) => void) | null;
  private _signalHandlersSetup: boolean;

  constructor(options: ProcessManagerOptions = {}) {
    this.options = {
      logLevel: options.logLevel || 'info',
      shutdownTimeout: options.shutdownTimeout || 30000,
      exitOnSignal: options.exitOnSignal !== false,
    };

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.options.logLevel;
      this.logger = createLogger({ name: 'ProcessManager', level: logLevel });
    }

    this.intervals = new Map();
    this.timeouts = new Map();
    this.cleanups = new Map();
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    this._signalHandlersSetup = false;

    this._boundSignalHandler = this._handleSignal.bind(this);
    this._boundUncaughtHandler = null;
    this._boundUnhandledHandler = null;
    this._setupSignalHandlers();

    this.logger.debug({ shutdownTimeout: this.options.shutdownTimeout }, 'ProcessManager initialized');
  }

  setInterval(fn: () => void, interval: number, name: string): ReturnType<typeof setTimeout> {
    if (this.isShuttingDown) {
      throw new Error(`[ProcessManager] Cannot register interval '${name}' during shutdown`);
    }

    if (this.intervals.has(name)) {
      this.logger.warn({ name }, `interval '${name}' already exists, clearing previous`);
      this.clearInterval(name);
    }

    const start = Date.now();
    let expected = start + interval;
    let timerId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const now = Date.now();
      const drift = now - expected;
      let executions = 1;
      if (drift > interval) {
        executions += Math.floor(drift / interval);
      }
      try {
        for (let i = 0; i < executions; i++) fn();
      } finally {
        expected += executions * interval;
        const nextDelay = Math.max(0, interval - (drift % interval));
        timerId = setTimeout(tick, nextDelay);
      }
    };

    timerId = setTimeout(tick, interval);
    this.intervals.set(name, { id: timerId, fn, interval, precise: true });

    this.logger.debug({ name, interval }, `registered interval '${name}' (${interval}ms)`);

    return timerId;
  }

  clearInterval(name: string): void {
    const entry = this.intervals.get(name);
    if (entry) {
      if (entry.precise) {
        clearTimeout(entry.id);
      } else {
        clearInterval(entry.id);
      }
      this.intervals.delete(name);

      this.logger.debug({ name }, `cleared interval '${name}'`);
    }
  }

  setTimeout(fn: () => void, delay: number, name: string): ReturnType<typeof setTimeout> {
    if (this.isShuttingDown) {
      throw new Error(`[ProcessManager] Cannot register timeout '${name}' during shutdown`);
    }

    if (this.timeouts.has(name)) {
      this.logger.warn({ name }, `timeout '${name}' already exists, clearing previous`);
      this.clearTimeout(name);
    }

    const id = setTimeout(() => {
      fn();
      this.timeouts.delete(name);
    }, delay);

    this.timeouts.set(name, { id, fn, delay });

    this.logger.debug({ name, delay }, `registered timeout '${name}' (${delay}ms)`);

    return id;
  }

  clearTimeout(name: string): void {
    const entry = this.timeouts.get(name);
    if (entry) {
      clearTimeout(entry.id);
      this.timeouts.delete(name);

      this.logger.debug({ name }, `cleared timeout '${name}'`);
    }
  }

  registerCleanup(cleanupFn: CleanupFn, name: string): void {
    if (this.isShuttingDown) {
      throw new Error(`[ProcessManager] Cannot register cleanup '${name}' during shutdown`);
    }

    if (this.cleanups.has(name)) {
      this.logger.warn({ name }, `cleanup '${name}' already registered, replacing`);
    }

    this.cleanups.set(name, cleanupFn);

    this.logger.debug({ name }, `registered cleanup '${name}'`);
  }

  unregisterCleanup(name: string): void {
    if (this.cleanups.delete(name)) {
      this.logger.debug({ name }, `unregistered cleanup '${name}'`);
    }
  }

  private _setupSignalHandlers(): void {
    if (this._signalHandlersSetup) return;

    this._boundUncaughtHandler = (err: Error) => {
      this.logger.error({ error: err.message, stack: err.stack }, 'uncaught exception');
      this._handleSignal('uncaughtException');
    };

    this._boundUnhandledHandler = (reason: unknown, promise: Promise<unknown>) => {
      this.logger.error({ reason, promise: String(promise) }, 'unhandled rejection');
      this._handleSignal('unhandledRejection');
    };

    bumpProcessMaxListeners(4);
    process.on('SIGTERM', this._boundSignalHandler as NodeJS.SignalsListener);
    process.on('SIGINT', this._boundSignalHandler as NodeJS.SignalsListener);
    process.on('uncaughtException', this._boundUncaughtHandler);
    process.on('unhandledRejection', this._boundUnhandledHandler);

    this._signalHandlersSetup = true;

    this.logger.debug('signal handlers registered (SIGTERM, SIGINT, uncaughtException, unhandledRejection)');
  }

  private async _handleSignal(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.debug({ signal }, `shutdown already in progress, ignoring ${signal}`);
      return;
    }

    try {
      await this.shutdown();

      if (this.options.exitOnSignal) {
        process.exit(0);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error({ error: error.message, stack: error.stack }, 'error during shutdown');
      if (this.options.exitOnSignal) {
        process.exit(1);
      }
    }
  }

  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.debug('shutdown already in progress, waiting for completion...');
      return this.shutdownPromise!;
    }

    this.isShuttingDown = true;
    const timeout = options.timeout || this.options.shutdownTimeout;

    this.shutdownPromise = this._performShutdown(timeout);
    return this.shutdownPromise;
  }

  private async _performShutdown(timeout: number): Promise<void> {
    const startTime = Date.now();

    if (this.intervals.size > 0) {
      for (const [name, entry] of this.intervals.entries()) {
        if (entry.precise) {
          clearTimeout(entry.id);
        } else {
          clearInterval(entry.id);
        }
        this.logger.debug({ name }, `cleared interval '${name}'`);
      }
      this.intervals.clear();
    }

    if (this.timeouts.size > 0) {
      for (const [name, entry] of this.timeouts.entries()) {
        clearTimeout(entry.id);
        this.logger.debug({ name }, `cleared timeout '${name}'`);
      }
      this.timeouts.clear();
    }

    if (this.cleanups.size > 0) {
      const cleanupPromises = Array.from(this.cleanups.entries()).map(async ([name, cleanupFn]) => {
        try {
          const cleanupTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Cleanup '${name}' timed out`)), timeout)
          );

          await Promise.race([
            cleanupFn(),
            cleanupTimeout
          ]);

          this.logger.debug({ name }, `cleanup '${name}' completed`);
        } catch (err) {
          const error = err as Error;
          this.logger.error({ name, error: error.message }, `cleanup '${name}' failed`);
        }
      });

      await Promise.allSettled(cleanupPromises);
      this.cleanups.clear();
    }

    const elapsed = Date.now() - startTime;
    this.logger.debug({ elapsed }, `shutdown completed in ${elapsed}ms`);
  }

  getStatus(): ProcessManagerStatus {
    return {
      isShuttingDown: this.isShuttingDown,
      intervals: Array.from(this.intervals.keys()),
      timeouts: Array.from(this.timeouts.keys()),
      cleanups: Array.from(this.cleanups.keys()),
      counts: {
        intervals: this.intervals.size,
        timeouts: this.timeouts.size,
        cleanups: this.cleanups.size
      }
    };
  }

  removeSignalHandlers(): void {
    if (!this._signalHandlersSetup) return;

    process.removeListener('SIGTERM', this._boundSignalHandler as NodeJS.SignalsListener);
    process.removeListener('SIGINT', this._boundSignalHandler as NodeJS.SignalsListener);

    if (this._boundUncaughtHandler) {
      process.removeListener('uncaughtException', this._boundUncaughtHandler);
      this._boundUncaughtHandler = null;
    }

    if (this._boundUnhandledHandler) {
      process.removeListener('unhandledRejection', this._boundUnhandledHandler);
      this._boundUnhandledHandler = null;
    }

    this._signalHandlersSetup = false;
    bumpProcessMaxListeners(-4);

    this.logger.debug('signal handlers removed');
  }
}

let globalInstance: ProcessManager | null = null;

export function getProcessManager(options: ProcessManagerOptions = {}): ProcessManager {
  if (!globalInstance) {
    globalInstance = new ProcessManager(options);
  }
  return globalInstance;
}

export function resetProcessManager(): void {
  if (globalInstance) {
    globalInstance.removeSignalHandlers();
    globalInstance = null;
  }
}

export default ProcessManager;
