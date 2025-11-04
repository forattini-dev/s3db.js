/**
 * CronManager - Centralized Cron Job Management
 *
 * Manages cron jobs with automatic cleanup on process signals (SIGTERM, SIGINT).
 * Prevents memory leaks from lingering cron jobs on nodemon restarts.
 *
 * Features:
 * - Named cron jobs for better debugging
 * - Auto-cleanup on SIGTERM/SIGINT/beforeExit
 * - Graceful shutdown with timeout protection
 * - Lazy loading of node-cron (peer dependency)
 * - Singleton pattern for global access
 * - Helper utilities to convert intervals to cron expressions
 *
 * @example
 * ```javascript
 * import { getCronManager } from 's3db.js';
 *
 * const cronManager = getCronManager();
 *
 * // Schedule with cron expression
 * cronManager.schedule('* * * * *', () => {
 *   console.log('Runs every minute');
 * }, 'my-minute-job');
 *
 * // Schedule with interval helper
 * cronManager.scheduleInterval(5000, () => {
 *   console.log('Runs every 5 seconds');
 * }, 'my-interval-job');
 * ```
 */

/**
 * Convert milliseconds to cron expression (best effort)
 */
function createStepExpression(value) {
  return ['*', '/', String(value)].join('');
}

function createHourlyStepExpression(value) {
  return ['0 ', createStepExpression(value), ' * * *'].join('');
}

function createDailyStepExpression(value) {
  return ['0 0 ', createStepExpression(value), ' * *'].join('');
}

export function intervalToCron(ms) {
  const seconds = Math.floor(ms / 1000);

  // Every N seconds (max 59)
  if (seconds < 60) {
    return `${createStepExpression(seconds)} * * * * *`; // Every N seconds
  }

  const minutes = Math.floor(seconds / 60);

  // Every N minutes (max 59)
  if (minutes < 60) {
    return `${createStepExpression(minutes)} * * * *`; // Every N minutes
  }

  const hours = Math.floor(minutes / 60);

  // Every N hours (max 23)
  if (hours < 24) {
    return createHourlyStepExpression(hours); // Every N hours
  }

  const days = Math.floor(hours / 24);

  // Every N days
  return createDailyStepExpression(days); // Every N days at midnight
}

/**
 * Common cron expression presets
 */
export const CRON_PRESETS = {
  // Seconds (node-cron supports 6-field format with seconds)
  EVERY_SECOND: '* * * * * *',
  EVERY_5_SECONDS: `${createStepExpression(5)} * * * * *`,
  EVERY_10_SECONDS: `${createStepExpression(10)} * * * * *`,
  EVERY_15_SECONDS: `${createStepExpression(15)} * * * * *`,
  EVERY_30_SECONDS: `${createStepExpression(30)} * * * * *`,

  // Minutes
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: `${createStepExpression(5)} * * * *`,
  EVERY_10_MINUTES: `${createStepExpression(10)} * * * *`,
  EVERY_15_MINUTES: `${createStepExpression(15)} * * * *`,
  EVERY_30_MINUTES: `${createStepExpression(30)} * * * *`,

  // Hours
  EVERY_HOUR: '0 * * * *',
  EVERY_2_HOURS: createHourlyStepExpression(2),
  EVERY_6_HOURS: createHourlyStepExpression(6),
  EVERY_12_HOURS: createHourlyStepExpression(12),

  // Days
  EVERY_DAY: '0 0 * * *',          // Midnight
  EVERY_DAY_NOON: '0 12 * * *',    // Noon
  EVERY_WEEK: '0 0 * * 0',         // Sunday midnight
  EVERY_MONTH: '0 0 1 * *',        // 1st of month midnight

  // Business hours
  BUSINESS_HOURS_START: '0 9 * * 1-5',  // 9 AM weekdays
  BUSINESS_HOURS_END: '0 17 * * 1-5',   // 5 PM weekdays
};

/**
 * CronManager class
 */
export class CronManager {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      shutdownTimeout: options.shutdownTimeout || 30000,
      exitOnSignal: options.exitOnSignal !== false,
    };

    this.jobs = new Map(); // name -> { task, expression, options }
    this._cron = null;     // Lazy loaded node-cron
    this._destroyed = false;
    this._signalHandlersSetup = false;

    if (this.options.verbose) {
      console.log('[CronManager] Initialized');
    }

    this._setupSignalHandlers();
  }

  /**
   * Setup signal handlers for auto-cleanup
   */
  _setupSignalHandlers() {
    if (this._signalHandlersSetup) return;

    this._boundShutdownHandler = this._handleShutdown.bind(this);
    this._boundErrorHandler = this._handleError.bind(this);

    process.once('SIGTERM', this._boundShutdownHandler);
    process.once('SIGINT', this._boundShutdownHandler);
    process.once('beforeExit', this._boundShutdownHandler);
    process.once('uncaughtException', this._boundErrorHandler);
    process.once('unhandledRejection', this._boundErrorHandler);

    this._signalHandlersSetup = true;

    if (this.options.verbose) {
      console.log('[CronManager] Signal handlers registered');
    }
  }

  /**
   * Remove signal handlers (useful for testing)
   */
  removeSignalHandlers() {
    if (!this._signalHandlersSetup) return;

    process.removeListener('SIGTERM', this._boundShutdownHandler);
    process.removeListener('SIGINT', this._boundShutdownHandler);
    process.removeListener('beforeExit', this._boundShutdownHandler);
    process.removeListener('uncaughtException', this._boundErrorHandler);
    process.removeListener('unhandledRejection', this._boundErrorHandler);

    this._signalHandlersSetup = false;

    if (this.options.verbose) {
      console.log('[CronManager] Signal handlers removed');
    }
  }

  /**
   * Handle shutdown signals
   */
  _handleShutdown(signal) {
    if (this._destroyed) return;

    if (this.options.verbose) {
      console.log(`[CronManager] Received ${signal}, shutting down...`);
    }

    this.shutdown({ signal })
      .then(() => {
        if (this.options.exitOnSignal) {
          process.exit(0);
        }
      })
      .catch((error) => {
        console.error('[CronManager] Shutdown error:', error);
        if (this.options.exitOnSignal) {
          process.exit(1);
        }
      });
  }

  /**
   * Handle uncaught errors
   */
  _handleError(error) {
    console.error('[CronManager] Uncaught error:', error);
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

  /**
   * Lazy load node-cron
   */
  async _loadCron() {
    if (this._cron) return this._cron;

    try {
      const cronModule = await import('node-cron');
      this._cron = cronModule.default || cronModule;

      if (this.options.verbose) {
        console.log('[CronManager] node-cron loaded');
      }

      return this._cron;
    } catch (error) {
      throw new Error(
        'node-cron is not installed. Install it with: pnpm add node-cron\n' +
        'Error: ' + error.message
      );
    }
  }

  /**
   * Schedule a cron job
   *
   * @param {string} expression - Cron expression (supports 5 or 6 fields)
   * @param {Function} fn - Function to execute
   * @param {string} name - Unique name for the job
   * @param {Object} options - Options (timezone, scheduled, etc.)
   * @returns {Object} Scheduled task
   *
   * @example
   * ```javascript
   * // Run every minute
   * cronManager.schedule('* * * * *', () => {
   *   console.log('Every minute');
   * }, 'minute-job');
   *
   * // Run every 10 seconds (6-field format with seconds)
   * cronManager.schedule('*_/10 * * * * *'.replace('_', ''), () => {
   *   console.log('Every 10 seconds');
   * }, 'ten-second-job');
   *
   * // With timezone
   * cronManager.schedule('0 9 * * *', () => {
   *   console.log('9 AM in New York');
   * }, 'morning-job', { timezone: 'America/New_York' });
   * ```
   */
  async schedule(expression, fn, name, options = {}) {
    if (this._destroyed) {
      console.warn(`[CronManager] Cannot schedule job '${name}' - manager is destroyed`);
      return null;
    }

    if (this.jobs.has(name)) {
      throw new Error(`[CronManager] Job '${name}' already exists`);
    }

    const cron = await this._loadCron();

    const task = cron.schedule(
      expression,
      fn,
      {
        scheduled: options.scheduled !== false,
        timezone: options.timezone,
        recoverMissedExecutions: options.recoverMissedExecutions || false,
      }
    );

    // Start the task if not explicitly disabled
    if (options.scheduled !== false && task?.start) {
      task.start();
    }

    this.jobs.set(name, {
      task,
      expression,
      fn,
      options,
      createdAt: Date.now(),
    });

    if (this.options.verbose) {
      console.log(`[CronManager] Scheduled job '${name}': ${expression}`);
    }

    return task;
  }

  /**
   * Schedule a job using interval (converts to cron expression)
   *
   * @param {number} ms - Interval in milliseconds
   * @param {Function} fn - Function to execute
   * @param {string} name - Unique name for the job
   * @param {Object} options - Options
   * @returns {Object} Scheduled task
   *
   * @example
   * ```javascript
   * // Run every 5 seconds
   * cronManager.scheduleInterval(5000, () => {
   *   console.log('Every 5 seconds');
   * }, 'five-second-job');
   *
   * // Run every 10 minutes
   * cronManager.scheduleInterval(600000, () => {
   *   console.log('Every 10 minutes');
   * }, 'ten-minute-job');
   * ```
   */
  async scheduleInterval(ms, fn, name, options = {}) {
    const expression = intervalToCron(ms);
    return this.schedule(expression, fn, name, options);
  }

  /**
   * Stop a specific job
   *
   * @param {string} name - Job name
   * @returns {boolean} True if stopped
   */
  stop(name) {
    const entry = this.jobs.get(name);
    if (!entry) {
      if (this.options.verbose) {
        console.warn(`[CronManager] Job '${name}' not found`);
      }
      return false;
    }

    try {
      entry.task?.stop?.();
      entry.task?.destroy?.();
      this.jobs.delete(name);

      if (this.options.verbose) {
        console.log(`[CronManager] Stopped job '${name}'`);
      }

      return true;
    } catch (error) {
      console.error(`[CronManager] Error stopping job '${name}':`, error);
      return false;
    }
  }

  /**
   * Get job statistics
   *
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
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

  /**
   * Check if manager is destroyed
   *
   * @returns {boolean}
   */
  isDestroyed() {
    return this._destroyed;
  }

  /**
   * Graceful shutdown - stop all cron jobs
   *
   * @param {Object} options - Shutdown options
   * @returns {Promise<void>}
   */
  async shutdown(options = {}) {
    if (this._destroyed) {
      if (this.options.verbose) {
        console.log('[CronManager] Already destroyed');
      }
      return;
    }

    const timeout = options.timeout || this.options.shutdownTimeout;

    if (this.options.verbose) {
      console.log(`[CronManager] Shutting down ${this.jobs.size} jobs...`);
    }

    // Stop all cron jobs
    const stopPromises = [];
    for (const [name, entry] of this.jobs.entries()) {
      const stopPromise = new Promise((resolve, reject) => {
        try {
          entry.task?.stop?.();
          entry.task?.destroy?.();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      // Wrap with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Stop timeout for job '${name}'`)), timeout)
      );

      stopPromises.push(
        Promise.race([stopPromise, timeoutPromise])
          .catch(error => {
            if (this.options.verbose) {
              console.warn(`[CronManager] Error stopping job '${name}':`, error.message);
            }
          })
      );
    }

    await Promise.allSettled(stopPromises);

    this.jobs.clear();
    this._destroyed = true;

    if (this.options.verbose) {
      console.log('[CronManager] Shutdown complete');
    }
  }
}

// Singleton instance
let _globalCronManager = null;

/**
 * Get global CronManager instance (singleton)
 *
 * @param {Object} options - Options (only used on first call)
 * @returns {CronManager}
 */
export function getCronManager(options = {}) {
  if (!_globalCronManager) {
    _globalCronManager = new CronManager(options);
  }
  return _globalCronManager;
}

/**
 * Reset global CronManager (useful for testing)
 */
export function resetCronManager() {
  if (_globalCronManager) {
    _globalCronManager.shutdown().catch(() => {});
    _globalCronManager.removeSignalHandlers();
    _globalCronManager = null;
  }
}

/**
 * Create a new CronManager instance (non-singleton)
 *
 * @param {Object} options - Options
 * @returns {CronManager}
 */
export function createCronManager(options = {}) {
  return new CronManager(options);
}
