/**
 * SafeEventEmitter - EventEmitter with automatic listener cleanup on process signals
 *
 * Prevents memory leaks by automatically removing all listeners on SIGTERM/SIGINT.
 * Drop-in replacement for Node.js EventEmitter.
 *
 * @example
 * import { SafeEventEmitter } from 's3db.js';
 *
 * class MyService extends SafeEventEmitter {
 *   constructor() {
 *     super({ logLevel: 'debug' });
 *   }
 * }
 *
 * const service = new MyService();
 * service.on('data', (data) => console.log(data));
 * // Auto-cleanup on SIGTERM/SIGINT - no memory leaks!
 */

import EventEmitter from 'events';
import { createLogger } from './logger.js';

export class SafeEventEmitter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      logLevel: options.logLevel || 'info',
      autoCleanup: options.autoCleanup !== false, // Default: true
      maxListeners: options.maxListeners || 0 // 0 = unlimited
    };

    // 🪵 Logger initialization
    if (options.logger) {
      this.logger = options.logger;
    } else {
      // Use logLevel from options
      this.logger = createLogger({ name: 'SafeEventEmitter', level: this.options.logLevel });
    }

    // Track if signal handlers are setup
    this._signalHandlersSetup = false;
    this._isDestroyed = false;

    // Set max listeners
    if (this.options.maxListeners > 0) {
      this.setMaxListeners(this.options.maxListeners);
    }

    // Setup automatic cleanup on process signals
    if (this.options.autoCleanup) {
      this._setupSignalHandlers();
    }

    // 🪵 Debug: initialization
    this.logger.debug({ autoCleanup: this.options.autoCleanup }, `Initialized with auto-cleanup: ${this.options.autoCleanup}`);
  }

  /**
   * Setup signal handlers for automatic cleanup
   * @private
   */
  _setupSignalHandlers() {
    if (this._signalHandlersSetup) return;

    // Bind handlers to preserve context
    this._boundCleanupHandler = this._handleCleanup.bind(this);

    // Register handlers
    process.once('SIGTERM', this._boundCleanupHandler);
    process.once('SIGINT', this._boundCleanupHandler);
    process.once('beforeExit', this._boundCleanupHandler);

    this._signalHandlersSetup = true;

    // 🪵 Debug: signal handlers registered
    this.logger.debug('Signal handlers registered (SIGTERM, SIGINT, beforeExit)');
  }

  /**
   * Handle cleanup on process signals
   * @private
   */
  _handleCleanup(signal) {
    if (this._isDestroyed) return;

    // 🪵 Debug: cleanup signal received
    this.logger.debug({ signal }, `Received ${signal}, cleaning up listeners...`);

    this.destroy();
  }

  /**
   * Override on() to track listeners
   */
  on(eventName, listener) {
    if (this._isDestroyed) {
      // 🪵 Warn: cannot add listener
      this.logger.warn({ eventName }, `Cannot add listener for '${eventName}' - emitter is destroyed`);
      return this;
    }

    return super.on(eventName, listener);
  }

  /**
   * Override once() to track listeners
   */
  once(eventName, listener) {
    if (this._isDestroyed) {
      // 🪵 Warn: cannot add once listener
      this.logger.warn({ eventName }, `Cannot add once listener for '${eventName}' - emitter is destroyed`);
      return this;
    }

    return super.once(eventName, listener);
  }

  /**
   * Override emit() to prevent emission after destruction
   */
  emit(eventName, ...args) {
    if (this._isDestroyed) {
      // 🪵 Warn: cannot emit on destroyed emitter
      this.logger.warn({ eventName }, `Cannot emit '${eventName}' - emitter is destroyed`);
      return false;
    }

    return super.emit(eventName, ...args);
  }

  /**
   * Get count of listeners for all events
   * @returns {Object} Event name -> listener count
   */
  getListenerStats() {
    const stats = {};
    const events = this.eventNames();

    for (const event of events) {
      stats[event] = this.listenerCount(event);
    }

    return stats;
  }

  /**
   * Get total listener count across all events
   * @returns {number}
   */
  getTotalListenerCount() {
    return this.eventNames().reduce((total, event) => {
      return total + this.listenerCount(event);
    }, 0);
  }

  /**
   * Remove all listeners and cleanup
   */
  destroy() {
    if (this._isDestroyed) return;

    const totalListeners = this.getTotalListenerCount();

    // 🪵 Debug: destroying emitter
    this.logger.debug({ totalListeners }, `Destroying emitter (${totalListeners} listeners)...`);

    // Remove all listeners
    this.removeAllListeners();

    // Remove signal handlers
    if (this._boundCleanupHandler) {
      process.removeListener('SIGTERM', this._boundCleanupHandler);
      process.removeListener('SIGINT', this._boundCleanupHandler);
      process.removeListener('beforeExit', this._boundCleanupHandler);
      this._signalHandlersSetup = false;
    }

    this._isDestroyed = true;

    // 🪵 Debug: destroyed
    this.logger.debug('Destroyed');
  }

  /**
   * Check if emitter is destroyed
   * @returns {boolean}
   */
  isDestroyed() {
    return this._isDestroyed;
  }

  /**
   * Manually remove signal handlers (useful for testing)
   */
  removeSignalHandlers() {
    if (this._boundCleanupHandler) {
      process.removeListener('SIGTERM', this._boundCleanupHandler);
      process.removeListener('SIGINT', this._boundCleanupHandler);
      process.removeListener('beforeExit', this._boundCleanupHandler);
      this._signalHandlersSetup = false;

      // 🪵 Debug: signal handlers removed
      this.logger.debug('Signal handlers removed');
    }
  }
}

/**
 * Create a safe event emitter instance
 * @param {Object} options - Options for SafeEventEmitter
 * @returns {SafeEventEmitter}
 */
export function createSafeEventEmitter(options = {}) {
  return new SafeEventEmitter(options);
}

export default SafeEventEmitter;
