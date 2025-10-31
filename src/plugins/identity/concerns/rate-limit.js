/**
 * Sliding window rate limiter for IP-based throttling
 */

export class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.windowMs - Window size in milliseconds
   * @param {number} options.max - Maximum number of hits allowed per window
   */
  constructor(options = {}) {
    this.windowMs = options.windowMs ?? 60000;
    this.max = options.max ?? 10;
    this.buckets = new Map(); // key -> { count, expiresAt }
  }

  /**
   * Consume a token for the given key
   * @param {string} key - Identifier (usually IP address)
   * @returns {{allowed: boolean, remaining: number, retryAfter: number}}
   */
  consume(key) {
    if (!this.enabled()) {
      return { allowed: true, remaining: Infinity, retryAfter: 0 };
    }

    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.expiresAt <= now) {
      const expiresAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, expiresAt });
      this._prune(now);
      return {
        allowed: true,
        remaining: Math.max(this.max - 1, 0),
        retryAfter: 0
      };
    }

    if (bucket.count < this.max) {
      bucket.count += 1;
      this._prune(now);
      return {
        allowed: true,
        remaining: Math.max(this.max - bucket.count, 0),
        retryAfter: 0
      };
    }

    const retryAfterMs = bucket.expiresAt - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(Math.ceil(retryAfterMs / 1000), 1)
    };
  }

  /**
   * Whether the limiter is active
   * @returns {boolean}
   */
  enabled() {
    return this.max > 0 && this.windowMs > 0;
  }

  /**
   * Periodically remove expired buckets
   * @private
   */
  _prune(now) {
    if (this.buckets.size > 5000) {
      for (const [key, bucket] of this.buckets.entries()) {
        if (bucket.expiresAt <= now) {
          this.buckets.delete(key);
        }
      }
    }
  }
}

/**
 * Create Hono middleware for API-style responses
 * @param {RateLimiter} limiter
 * @param {(c: import('hono').Context) => string} getKey
 */
export function createJsonRateLimitMiddleware(limiter, getKey) {
  return async (c, next) => {
    const key = getKey(c);
    const result = limiter.consume(key);

    if (result.allowed) {
      return await next();
    }

    c.header('Retry-After', String(result.retryAfter));
    return c.json({
      error: 'too_many_requests',
      error_description: `Too many requests. Try again in ${result.retryAfter} seconds.`
    }, 429);
  };
}

/**
 * Create Hono middleware for browser redirect flows (login UI)
 * @param {RateLimiter} limiter
 * @param {(c: import('hono').Context) => string} getKey
 * @param {(retryAfter: number) => string} buildRedirectUrl
 */
export function createRedirectRateLimitMiddleware(limiter, getKey, buildRedirectUrl) {
  return async (c, next) => {
    const key = getKey(c);
    const result = limiter.consume(key);

    if (result.allowed) {
      return await next();
    }

    const url = buildRedirectUrl(result.retryAfter);
    return c.redirect(url, 302);
  };
}

export default RateLimiter;
