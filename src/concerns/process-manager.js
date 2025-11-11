/**
 * Process Manager - Centralized lifecycle management for intervals, timers, and workers
 *
 * Prevents memory leaks by ensuring ALL async operations are cleaned up on process exit.
 * Handles SIGTERM, SIGINT, and uncaught errors gracefully.
 *
 * @example
 * import { ProcessManager } from 's3db.js/concerns/process-manager';
 *
 * const pm = new ProcessManager({ verbose: true });
 *
 * // Register interval (auto-cleanup on exit)
 * pm.setInterval(() => console.log('tick'), 1000, 'health-check');
 *
 * // Register timeout
 * pm.setTimeout(() => console.log('delayed'), 5000, 'delayed-task');
 *
 * // Register worker/cleanup function
 * pm.registerCleanup(async () => {
 *   await worker.stop();
 * }, 'sqs-worker');
 *
 * // Graceful shutdown
 * await pm.shutdown();
 */

export class ProcessManager {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      shutdownTimeout: options.shutdownTimeout || 30000, // 30 seconds
      exitOnSignal: options.exitOnSignal !== false, // Default: true
    };

    // Track all managed resources
    this.intervals = new Map(); // name -> { id, fn, interval }
    this.timeouts = new Map();  // name -> { id, fn, delay }
    this.cleanups = new Map();  // name -> async cleanup function
    this.isShuttingDown = false;
    this.shutdownPromise = null;

    // Bind signal handlers
    this._boundSignalHandler = this._handleSignal.bind(this);
    this._setupSignalHandlers();

    if (this.options.verbose) {
      // console.log('[ProcessManager] Initialized with shutdown timeout:', this.options.shutdownTimeout, 'ms');
    }
  }

  /**
   * Register a recurring interval (replacement for setInterval)
   * @param {Function} fn - Function to execute
   * @param {number} interval - Interval in milliseconds
   * @param {string} name - Unique identifier for this interval
   * @returns {number} Interval ID
   */
  setInterval(fn, interval, name) {
    if (this.isShuttingDown) {
      throw new Error(`[ProcessManager] Cannot register interval '${name}' during shutdown`);
    }

    if (this.intervals.has(name)) {
      if (this.options.verbose) {
        console.warn(`[ProcessManager] Interval '${name}' already exists, clearing previous`);
      }
      this.clearInterval(name);
    }

    // Use precise timer (reduces drift and increases determinism under load)
    const start = Date.now();
    let expected = start + interval;
    let timerId = null;

    const tick = () => {
      const now = Date.now();
      const drift = now - expected;
      // Ensure at least one execution per interval elapsed
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

    if (this.options.verbose) {
      // console.log(`[ProcessManager] Registered interval '${name}' (${interval}ms)`);
    }

    return id;
  }

  /**
   * Clear a specific interval by name
   * @param {string} name - Interval name
   */
  clearInterval(name) {
    const entry = this.intervals.get(name);
    if (entry) {
      if (entry.precise) {
        clearTimeout(entry.id);
      } else {
        clearInterval(entry.id);
      }
      this.intervals.delete(name);

      if (this.options.verbose) {
        // console.log(`[ProcessManager] Cleared interval '${name}'`);
      }
    }
  }

  /**
   * Register a one-time timeout (replacement for setTimeout)
   * @param {Function} fn - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @param {string} name - Unique identifier for this timeout
   * @returns {number} Timeout ID
   */
  setTimeout(fn, delay, name) {
    if (this.isShuttingDown) {
      throw new Error(`[ProcessManager] Cannot register timeout '${name}' during shutdown`);
    }

    if (this.timeouts.has(name)) {
      if (this.options.verbose) {
        console.warn(`[ProcessManager] Timeout '${name}' already exists, clearing previous`);
      }
      this.clearTimeout(name);
    }

    const id = setTimeout(() => {
      fn();
      this.timeouts.delete(name); // Auto-remove after execution
    }, delay);

    this.timeouts.set(name, { id, fn, delay });

    if (this.options.verbose) {
      // console.log(`[ProcessManager] Registered timeout '${name}' (${delay}ms)`);
    }

    return id;
  }

  /**
   * Clear a specific timeout by name
   * @param {string} name - Timeout name
   */
  clearTimeout(name) {
    const entry = this.timeouts.get(name);
    if (entry) {
      clearTimeout(entry.id);
      this.timeouts.delete(name);

      if (this.options.verbose) {
        // console.log(`[ProcessManager] Cleared timeout '${name}'`);
      }
    }
  }

  /**
   * Register a cleanup function to run on shutdown
   * @param {Function} cleanupFn - Async cleanup function
   * @param {string} name - Unique identifier for this cleanup
   */
  registerCleanup(cleanupFn, name) {
    if (this.isShuttingDown) {
      throw new Error(`[ProcessManager] Cannot register cleanup '${name}' during shutdown`);
    }

    if (this.cleanups.has(name)) {
      if (this.options.verbose) {
        console.warn(`[ProcessManager] Cleanup '${name}' already registered, replacing`);
      }
    }

    this.cleanups.set(name, cleanupFn);

    if (this.options.verbose) {
      // console.log(`[ProcessManager] Registered cleanup '${name}'`);
    }
  }

  /**
   * Unregister a cleanup function
   * @param {string} name - Cleanup name
   */
  unregisterCleanup(name) {
    if (this.cleanups.delete(name)) {
      if (this.options.verbose) {
        // console.log(`[ProcessManager] Unregistered cleanup '${name}'`);
      }
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   * @private
   */
  _setupSignalHandlers() {
    // Only setup once
    if (this._signalHandlersSetup) return;

    process.on('SIGTERM', this._boundSignalHandler);
    process.on('SIGINT', this._boundSignalHandler);
    process.on('uncaughtException', (err) => {
      if (this.options.verbose) {
        console.error('[ProcessManager] Uncaught exception:', err);
      }
      this._handleSignal('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      if (this.options.verbose) {
        console.error('[ProcessManager] Unhandled rejection at:', promise, 'reason:', reason);
      }
      this._handleSignal('unhandledRejection');
    });

    this._signalHandlersSetup = true;

    if (this.options.verbose) {
      // console.log('[ProcessManager] Signal handlers registered (SIGTERM, SIGINT, uncaughtException, unhandledRejection)');
    }
  }

  /**
   * Handle process signals
   * @private
   */
  async _handleSignal(signal) {
    if (this.isShuttingDown) {
      if (this.options.verbose) {
        // console.log(`[ProcessManager] Shutdown already in progress, ignoring ${signal}`);
      }
      return;
    }

    // console.log(`[ProcessManager] Received ${signal}, initiating graceful shutdown...`);

    try {
      await this.shutdown();

      if (this.options.exitOnSignal) {
        process.exit(0);
      }
    } catch (err) {
      if (this.options.verbose) {
        console.error('[ProcessManager] Error during shutdown:', err);
      }
      if (this.options.exitOnSignal) {
        process.exit(1);
      }
    }
  }

  /**
   * Graceful shutdown - cleanup all resources
   * @param {Object} options - Shutdown options
   * @param {number} options.timeout - Override default timeout
   * @returns {Promise<void>}
   */
  async shutdown(options = {}) {
    // Prevent multiple shutdown calls
    if (this.isShuttingDown) {
      if (this.options.verbose) {
        // console.log('[ProcessManager] Shutdown already in progress, waiting for completion...');
      }
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    const timeout = options.timeout || this.options.shutdownTimeout;

    this.shutdownPromise = this._performShutdown(timeout);
    return this.shutdownPromise;
  }

  /**
   * Perform the actual shutdown
   * @private
   */
  async _performShutdown(timeout) {
    const startTime = Date.now();

    // console.log('[ProcessManager] Starting shutdown sequence...');

    // 1. Clear all intervals
    if (this.intervals.size > 0) {
      // console.log(`[ProcessManager] Clearing ${this.intervals.size} intervals...`);
      for (const [name, entry] of this.intervals.entries()) {
        if (entry.precise) {
          clearTimeout(entry.id);
        } else {
          clearInterval(entry.id);
        }
        if (this.options.verbose) {
          // console.log(`[ProcessManager]   ✓ Cleared interval '${name}'`);
        }
      }
      this.intervals.clear();
    }

    // 2. Clear all timeouts
    if (this.timeouts.size > 0) {
      // console.log(`[ProcessManager] Clearing ${this.timeouts.size} timeouts...`);
      for (const [name, entry] of this.timeouts.entries()) {
        clearTimeout(entry.id);
        if (this.options.verbose) {
          // console.log(`[ProcessManager]   ✓ Cleared timeout '${name}'`);
        }
      }
      this.timeouts.clear();
    }

    // 3. Run cleanup functions with timeout
    if (this.cleanups.size > 0) {
      // console.log(`[ProcessManager] Running ${this.cleanups.size} cleanup functions...`);

      const cleanupPromises = Array.from(this.cleanups.entries()).map(async ([name, cleanupFn]) => {
        try {
          const cleanupTimeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Cleanup '${name}' timed out`)), timeout)
          );

          await Promise.race([
            cleanupFn(),
            cleanupTimeout
          ]);

          if (this.options.verbose) {
            // console.log(`[ProcessManager]   ✓ Cleanup '${name}' completed`);
          }
        } catch (err) {
          if (this.options.verbose) {
            console.error(`[ProcessManager]   ✗ Cleanup '${name}' failed:`, err.message);
          }
        }
      });

      await Promise.allSettled(cleanupPromises);
      this.cleanups.clear();
    }

    const elapsed = Date.now() - startTime;
    // console.log(`[ProcessManager] Shutdown complete in ${elapsed}ms`);
  }

  /**
   * Get status of managed resources
   * @returns {Object} Status information
   */
  getStatus() {
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

  /**
   * Remove all signal handlers (useful for testing)
   */
  removeSignalHandlers() {
    process.removeListener('SIGTERM', this._boundSignalHandler);
    process.removeListener('SIGINT', this._boundSignalHandler);
    this._signalHandlersSetup = false;

    if (this.options.verbose) {
      // console.log('[ProcessManager] Signal handlers removed');
    }
  }
}

/**
 * Singleton instance for global use
 */
let globalInstance = null;

/**
 * Get or create the global ProcessManager instance
 * @param {Object} options - Options for ProcessManager
 * @returns {ProcessManager}
 */
export function getProcessManager(options = {}) {
  if (!globalInstance) {
    globalInstance = new ProcessManager(options);
  }
  return globalInstance;
}

/**
 * Reset the global instance (useful for testing)
 */
export function resetProcessManager() {
  if (globalInstance) {
    globalInstance.removeSignalHandlers();
    globalInstance = null;
  }
}

export default ProcessManager;
