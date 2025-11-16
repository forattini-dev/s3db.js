/**
 * Session Store Interface
 *
 * Enables external session storage (Redis, Memcached, MongoDB, etc.)
 * for horizontal scaling and reduced cookie size.
 *
 * When using a session store:
 * - Cookie contains only session ID (small, ~50 bytes)
 * - Session data stored externally (scalable, shareable)
 * - Multiple app instances can share sessions
 *
 * @module api/concerns/session-store
 */

import { createLogger } from '../../../concerns/logger.js';

/**
 * Base Session Store Interface
 *
 * All session stores must implement these methods.
 *
 * @abstract
 */
export class SessionStore {
  /**
   * Get session data by ID
   *
   * @param {string} sessionId - Unique session identifier
   * @returns {Promise<Object|null>} Session data or null if not found
   */
  async get(sessionId) {
    throw new Error('SessionStore.get() must be implemented');
  }

  /**
   * Set session data
   *
   * @param {string} sessionId - Unique session identifier
   * @param {Object} sessionData - Session data to store
   * @param {number} ttl - Time-to-live in milliseconds
   * @returns {Promise<void>}
   */
  async set(sessionId, sessionData, ttl) {
    throw new Error('SessionStore.set() must be implemented');
  }

  /**
   * Delete session by ID
   *
   * @param {string} sessionId - Unique session identifier
   * @returns {Promise<void>}
   */
  async destroy(sessionId) {
    throw new Error('SessionStore.destroy() must be implemented');
  }

  /**
   * Touch session (update TTL without modifying data)
   * Optional - improves performance for rolling sessions
   *
   * @param {string} sessionId - Unique session identifier
   * @param {number} ttl - New TTL in milliseconds
   * @returns {Promise<void>}
   */
  async touch(sessionId, ttl) {
    // Default implementation: get + set
    const data = await this.get(sessionId);
    if (data) {
      await this.set(sessionId, data, ttl);
    }
  }
}

/**
 * Memory Session Store
 *
 * In-memory session storage for development and testing.
 * NOT suitable for production (not shared across instances).
 *
 * @example
 * const store = new MemoryStore({ maxSessions: 1000 });
 * await store.set('session123', { userId: 'user1' }, 3600000);
 * const data = await store.get('session123');
 */
export class MemoryStore extends SessionStore {
  constructor(options = {}) {
    super();
    this.sessions = new Map();
    this.timers = new Map();
    this.maxSessions = options.maxSessions || 10000;
    this.verbose = options.verbose || false;

    // 🪵 Logger initialization
    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.verbose ? 'debug' : 'info';
      this.logger = createLogger({ name: 'MemoryStore', level: logLevel });
    }
  }

  async get(sessionId) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt < Date.now()) {
      await this.destroy(sessionId);
      return null;
    }

    return entry.data;
  }

  async set(sessionId, sessionData, ttl) {
    // Enforce max sessions limit (LRU-style)
    if (this.sessions.size >= this.maxSessions && !this.sessions.has(sessionId)) {
      // Remove oldest session
      const firstKey = this.sessions.keys().next().value;
      await this.destroy(firstKey);
    }

    const expiresAt = Date.now() + ttl;

    // Clear existing timer
    if (this.timers.has(sessionId)) {
      clearTimeout(this.timers.get(sessionId));
    }

    // Set new timer for automatic cleanup
    const timer = setTimeout(() => {
      this.destroy(sessionId);
    }, ttl);

    this.sessions.set(sessionId, {
      data: sessionData,
      expiresAt,
    });
    this.timers.set(sessionId, timer);

    // 🪵 Debug: session set
    const ttlSeconds = Math.round(ttl / 1000);
    this.logger.debug({ sessionId, ttlSeconds, totalSessions: this.sessions.size }, `Set session ${sessionId} (TTL: ${ttlSeconds}s, Total: ${this.sessions.size})`);
  }

  async destroy(sessionId) {
    // Clear timer
    if (this.timers.has(sessionId)) {
      clearTimeout(this.timers.get(sessionId));
      this.timers.delete(sessionId);
    }

    this.sessions.delete(sessionId);

    // 🪵 Debug: session destroyed
    this.logger.debug({ sessionId, remaining: this.sessions.size }, `Destroyed session ${sessionId} (Remaining: ${this.sessions.size})`);
  }

  async touch(sessionId, ttl) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    entry.expiresAt = Date.now() + ttl;

    // Reset timer
    if (this.timers.has(sessionId)) {
      clearTimeout(this.timers.get(sessionId));
    }

    const timer = setTimeout(() => {
      this.destroy(sessionId);
    }, ttl);
    this.timers.set(sessionId, timer);
  }

  /**
   * Get store statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      count: this.sessions.size,
      maxSessions: this.maxSessions,
    };
  }

  /**
   * Clear all sessions (for testing)
   */
  async clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.sessions.clear();
  }
}

/**
 * Redis Session Store
 *
 * Production-ready session storage using Redis.
 * Supports horizontal scaling and session sharing.
 *
 * Requires: npm install redis
 *
 * @example
 * import { createClient } from 'redis';
 * const redis = createClient({ url: 'redis://localhost:6379' });
 * await redis.connect();
 *
 * const store = new RedisStore({
 *   client: redis,
 *   prefix: 'session:',
 *   serializer: JSON
 * });
 */
export class RedisStore extends SessionStore {
  constructor(options = {}) {
    super();

    if (!options.client) {
      throw new Error('RedisStore requires a Redis client (options.client)');
    }

    this.client = options.client;
    this.prefix = options.prefix || 'session:';
    this.serializer = options.serializer || JSON;
    this.verbose = options.verbose || false;

    // 🪵 Logger initialization
    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.verbose ? 'debug' : 'info';
      this.logger = createLogger({ name: 'RedisStore', level: logLevel });
    }
  }

  _getKey(sessionId) {
    return `${this.prefix}${sessionId}`;
  }

  async get(sessionId) {
    try {
      const key = this._getKey(sessionId);
      const data = await this.client.get(key);

      if (!data) return null;

      return this.serializer.parse(data);
    } catch (err) {
      this.logger.error('[RedisStore] Get error:', err.message);
      return null;
    }
  }

  async set(sessionId, sessionData, ttl) {
    try {
      const key = this._getKey(sessionId);
      const value = this.serializer.stringify(sessionData);
      const ttlSeconds = Math.ceil(ttl / 1000);

      await this.client.setEx(key, ttlSeconds, value);

      // 🪵 Debug: session set in Redis
      this.logger.debug({ sessionId, ttlSeconds }, `Set session ${sessionId} (TTL: ${ttlSeconds}s)`);
    } catch (err) {
      this.logger.error('[RedisStore] Set error:', err.message);
      throw err;
    }
  }

  async destroy(sessionId) {
    try {
      const key = this._getKey(sessionId);
      await this.client.del(key);

      // 🪵 Debug: session destroyed in Redis
      this.logger.debug({ sessionId }, `Destroyed session ${sessionId}`);
    } catch (err) {
      this.logger.error('[RedisStore] Destroy error:', err.message);
      throw err;
    }
  }

  async touch(sessionId, ttl) {
    try {
      const key = this._getKey(sessionId);
      const ttlSeconds = Math.ceil(ttl / 1000);
      await this.client.expire(key, ttlSeconds);

      // 🪵 Debug: session touched in Redis
      this.logger.debug({ sessionId, ttlSeconds }, `Touched session ${sessionId} (TTL: ${ttlSeconds}s)`);
    } catch (err) {
      this.logger.error('[RedisStore] Touch error:', err.message);
      // Non-fatal: fall back to get + set
      await super.touch(sessionId, ttl);
    }
  }

  /**
   * Get store statistics
   * @returns {Promise<Object>} Stats
   */
  async getStats() {
    try {
      const keys = await this.client.keys(`${this.prefix}*`);
      return {
        count: keys.length,
        prefix: this.prefix,
      };
    } catch (err) {
      this.logger.error('[RedisStore] Stats error:', err.message);
      return { count: 0, prefix: this.prefix };
    }
  }

  /**
   * Clear all sessions with this prefix (for testing)
   */
  async clear() {
    try {
      const keys = await this.client.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (err) {
      this.logger.error('[RedisStore] Clear error:', err.message);
    }
  }
}
