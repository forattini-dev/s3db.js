/**
 * Rate Limiting Middleware
 *
 * Implements sliding window rate limiting with configurable window size and max requests.
 * Returns 429 status code with Retry-After header when limit is exceeded.
 * Uses IP address or custom key generator to track request counts.
 */

/**
 * Create rate limiting middleware
 * @param {Object} config - Rate limiting configuration
 * @param {number} config.windowMs - Time window in milliseconds
 * @param {number} config.maxRequests - Maximum requests per window
 * @param {Function} config.keyGenerator - Custom key generator function
 * @returns {Function} Hono middleware
 */
export function createRateLimitMiddleware(config = {}) {
  const {
    windowMs = 60000, // 1 minute
    maxRequests = 100,
    keyGenerator = null
  } = config;

  const requests = new Map();

  return async (c, next) => {
    // Generate key (IP or custom)
    const key = keyGenerator
      ? keyGenerator(c)
      : c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';

    // Get or create request count
    if (!requests.has(key)) {
      requests.set(key, { count: 0, resetAt: Date.now() + windowMs });
    }

    const record = requests.get(key);

    // Reset if window expired
    if (Date.now() > record.resetAt) {
      record.count = 0;
      record.resetAt = Date.now() + windowMs;
    }

    // Check limit
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - Date.now()) / 1000);
      c.header('Retry-After', retryAfter.toString());
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', record.resetAt.toString());

      return c.json({
        success: false,
        error: {
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          details: { retryAfter }
        }
      }, 429);
    }

    // Increment count
    record.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header('X-RateLimit-Remaining', (maxRequests - record.count).toString());
    c.header('X-RateLimit-Reset', record.resetAt.toString());

    await next();
  };
}
