/**
 * API Event Emitter
 *
 * Provides event hooks throughout the API lifecycle for monitoring,
 * analytics, and custom integrations.
 *
 * Supported Events:
 * - user:created - New user created via OIDC
 * - user:login - User logged in
 * - auth:success - Authentication succeeded
 * - auth:failure - Authentication failed
 * - resource:created - Resource record created
 * - resource:updated - Resource record updated
 * - resource:deleted - Resource record deleted
 * - request:start - Request started
 * - request:end - Request ended
 * - request:error - Request errored
 *
 * @example
 * const events = new ApiEventEmitter();
 *
 * // Listen to user creation
 * events.on('user:created', (data) => {
 *   logger.info('New user:', data.user);
 * });
 *
 * // Listen to all resource changes
 * events.on('resource:*', (data) => {
 *   logger.info('Resource event:', data.event, data.resource);
 * });
 *
 * // Emit events
 * events.emit('user:created', { user: userObject, source: 'oidc' });
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../concerns/logger.js';


// Module-level logger
const logger = createLogger({ name: 'EventEmitter', level: 'info' });
export class ApiEventEmitter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enabled: options.enabled !== false, // Enabled by default
      verbose: options.verbose || false,
      maxListeners: options.maxListeners || 10
    };

    this.setMaxListeners(this.options.maxListeners);
  }

  /**
   * Emit event with wildcard support
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emit(event, data = {}) {
    if (!this.options.enabled) {
      return false;
    }

    if (this.options.verbose) {
      logger.info(`[API Events] ${event}`, data);
    }

    // Emit specific event
    super.emit(event, { event, ...data, timestamp: new Date().toISOString() });

    // Emit wildcard pattern (e.g., "resource:*" for "resource:created")
    if (event.includes(':')) {
      const [prefix] = event.split(':');
      const wildcardEvent = `${prefix}:*`;
      super.emit(wildcardEvent, { event, ...data, timestamp: new Date().toISOString() });
    }

    return true;
  }

  /**
   * Helper to emit user events
   * @param {string} action - created, login, updated, deleted
   * @param {Object} data - Event data
   */
  emitUserEvent(action, data) {
    this.emit(`user:${action}`, data);
  }

  /**
   * Helper to emit auth events
   * @param {string} action - success, failure
   * @param {Object} data - Event data
   */
  emitAuthEvent(action, data) {
    this.emit(`auth:${action}`, data);
  }

  /**
   * Helper to emit resource events
   * @param {string} action - created, updated, deleted
   * @param {Object} data - Event data
   */
  emitResourceEvent(action, data) {
    this.emit(`resource:${action}`, data);
  }

  /**
   * Helper to emit request events
   * @param {string} action - start, end, error
   * @param {Object} data - Event data
   */
  emitRequestEvent(action, data) {
    this.emit(`request:${action}`, data);
  }

  /**
   * Get event statistics
   * @returns {Object} Event statistics
   */
  getStats() {
    const stats = {
      enabled: this.options.enabled,
      maxListeners: this.options.maxListeners,
      listeners: {}
    };

    // Count listeners per event
    for (const event of this.eventNames()) {
      stats.listeners[event] = this.listenerCount(event);
    }

    return stats;
  }
}

export default ApiEventEmitter;
