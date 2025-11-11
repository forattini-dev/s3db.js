/**
 * Rate Limiting Middleware
 *
 * Provides rate limiting per auth driver to prevent brute force attacks.
 * Uses in-memory storage with sliding window algorithm.
 *
 * Features:
 * - Per-IP tracking
 * - Per-user tracking (optional)
 * - Configurable time windows
 * - Configurable max attempts
 * - Retry-After header
 * - Auto-cleanup of expired entries
 *
 * @example
 * import { createDriverRateLimiter } from './middlewares/rate-limit.js';
 *
 * const rateLimiter = createDriverRateLimiter({
 *   windowMs: 900000, // 15 minutes
 *   maxAttempts: 5,
 *   keyPrefix: 'oidc'
 * });
 *
 * app.use('/auth/login', rateLimiter);
 */

import { getCronManager } from '../../../concerns/cron-manager.js';

/**
 * In-memory rate limit store
 * Maps: key -> { attempts: [timestamp, timestamp, ...] }
 */
class RateLimitStore {
  constructor(options = {}) {
    this.store = new Map();
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.cronManager = getCronManager();
    this.cleanupJobName = `rate-limit-cleanup-${Date.now()}`;

    // Start cleanup timer
    this.cronManager.scheduleInterval(
      this.cleanupInterval,
      () => this.cleanup(),
      this.cleanupJobName
    );
  }

  /**
   * Record an attempt
   * @param {string} key - Rate limit key
   * @returns {number} Current attempt count in window
   */
  record(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    if (!this.store.has(key)) {
      this.store.set(key, { attempts: [] });
    }

    const entry = this.store.get(key);

    // Remove attempts outside the window
    entry.attempts = entry.attempts.filter(timestamp => timestamp > cutoff);

    // Add new attempt
    entry.attempts.push(now);

    return entry.attempts.length;
  }

  /**
   * Get current attempt count
   * @param {string} key - Rate limit key
   * @returns {number} Current attempt count in window
   */
  getCount(key) {
    if (!this.store.has(key)) {
      return 0;
    }

    const now = Date.now();
    const cutoff = now - this.windowMs;
    const entry = this.store.get(key);

    // Remove expired attempts
    entry.attempts = entry.attempts.filter(timestamp => timestamp > cutoff);

    return entry.attempts.length;
  }

  /**
   * Reset rate limit for key
   * @param {string} key - Rate limit key
   */
  reset(key) {
    this.store.delete(key);
  }

  /**
   * Get time until next allowed attempt
   * @param {string} key - Rate limit key
   * @returns {number} Milliseconds until next attempt allowed
   */
  getRetryAfter(key) {
    if (!this.store.has(key)) {
      return 0;
    }

    const entry = this.store.get(key);
    if (entry.attempts.length === 0) {
      return 0;
    }

    // Oldest attempt timestamp + window = when it expires
    const oldestAttempt = entry.attempts[0];
    const expiresAt = oldestAttempt + this.windowMs;
    const now = Date.now();

    return Math.max(0, expiresAt - now);
  }

  /**
   * Cleanup expired entries
   * @private
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    for (const [key, entry] of this.store.entries()) {
      // Remove expired attempts
      entry.attempts = entry.attempts.filter(timestamp => timestamp > cutoff);

      // Remove entry if no attempts remain
      if (entry.attempts.length === 0) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Stop cleanup timer
   */
  stop() {
    if (this.cleanupJobName) {
      this.cronManager.stop(this.cleanupJobName);
      this.cleanupJobName = null;
    }
  }

  /**
   * Get statistics
   * @returns {Object} Store statistics
   */
  getStats() {
    return {
      totalKeys: this.store.size,
      totalAttempts: Array.from(this.store.values()).reduce(
        (sum, entry) => sum + entry.attempts.length,
        0
      )
    };
  }
}

/**
 * Create rate limiter middleware
 *
 * @param {Object} config - Rate limiter configuration
 * @param {number} config.windowMs - Time window in milliseconds (default: 900000 = 15 min)
 * @param {number} config.maxAttempts - Max attempts per window (default: 5)
 * @param {string} config.keyPrefix - Prefix for rate limit keys (default: 'ratelimit')
 * @param {Function} config.keyGenerator - Custom key generator function
 * @param {boolean} config.skipSuccessfulRequests - Don't count successful auths (default: false)
 * @param {Function} config.handler - Custom handler for rate limit exceeded
 * @param {boolean} config.enabled - Enable rate limiting (default: true)
 * @returns {Function} Hono middleware
 */
export function createDriverRateLimiter(config = {}) {
  const {
    windowMs = 60000, // 1 minute
    maxAttempts = 200,
    keyPrefix = 'ratelimit',
    keyGenerator = null,
    skipSuccessfulRequests = false,
    handler = null,
    enabled = true
  } = config;

  // If disabled, return no-op middleware
  if (!enabled) {
    return async (c, next) => await next();
  }

  // Create store
  const store = new RateLimitStore({ windowMs });

  // Middleware
  return async (c, next) => {
    // Generate rate limit key
    let key;
    if (keyGenerator && typeof keyGenerator === 'function') {
      key = await keyGenerator(c);
    } else {
      // Default: use IP address
      const ip = c.req.header('x-forwarded-for') ||
                 c.req.header('x-real-ip') ||
                 'unknown';
      key = `${keyPrefix}:${ip}`;
    }

    // Check current attempt count
    const currentCount = store.getCount(key);

    // If limit exceeded, reject
    if (currentCount >= maxAttempts) {
      const retryAfter = store.getRetryAfter(key);
      const retryAfterSeconds = Math.ceil(retryAfter / 1000);

      c.header('Retry-After', String(retryAfterSeconds));
      c.header('X-RateLimit-Limit', String(maxAttempts));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Date.now() + retryAfter));

      // Use custom handler or default response
      if (handler && typeof handler === 'function') {
        return handler(c, { retryAfter: retryAfterSeconds });
      }

      return c.json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds
      }, 429);
    }

    // Record attempt (before processing request)
    if (!skipSuccessfulRequests) {
      store.record(key);
    }

    // Continue to next middleware
    const previousUser = c.get('user');
    await next();

    // If skipSuccessfulRequests enabled, only record on auth failure
    if (skipSuccessfulRequests) {
      const currentUser = c.get('user');
      // If no user was set, auth failed - record attempt
      if (!currentUser && !previousUser) {
        store.record(key);
      }
    }

    // Add rate limit headers to response
    const remaining = Math.max(0, maxAttempts - store.getCount(key));
    c.header('X-RateLimit-Limit', String(maxAttempts));
    c.header('X-RateLimit-Remaining', String(remaining));
  };
}

/**
 * Create rate limiter for specific auth driver
 *
 * @param {string} driver - Auth driver name (oidc, jwt, basic, apikey)
 * @param {Object} config - Driver-specific rate limit config
 * @returns {Function} Hono middleware
 */
export function createAuthDriverRateLimiter(driver, config = {}) {
  const defaults = {
    oidc: {
      windowMs: 60000, // 1 minute
      maxAttempts: 200,
      keyPrefix: 'auth:oidc',
      skipSuccessfulRequests: true
    },
    jwt: {
      windowMs: 60000, // 1 minute
      maxAttempts: 200,
      keyPrefix: 'auth:jwt',
      skipSuccessfulRequests: false
    },
    basic: {
      windowMs: 60000, // 1 minute
      maxAttempts: 200,
      keyPrefix: 'auth:basic',
      skipSuccessfulRequests: true
    },
    apikey: {
      windowMs: 60000, // 1 minute
      maxAttempts: 100,
      keyPrefix: 'auth:apikey',
      skipSuccessfulRequests: false
    }
  };

  const driverDefaults = defaults[driver] || defaults.basic;
  const finalConfig = { ...driverDefaults, ...config };

  return createDriverRateLimiter(finalConfig);
}

export default {
  createDriverRateLimiter,
  createAuthDriverRateLimiter,
  RateLimitStore
};
