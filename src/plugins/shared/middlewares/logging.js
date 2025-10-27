/**
 * Logging Middleware
 *
 * Logs HTTP requests with customizable format and tokens.
 *
 * Supported tokens:
 * - :method - HTTP method (GET, POST, etc)
 * - :path - Request path
 * - :status - HTTP status code
 * - :response-time - Response time in milliseconds
 * - :user - Username or 'anonymous'
 * - :requestId - Request ID (UUID)
 *
 * Example format: ':method :path :status :response-time ms - :user'
 * Output: 'GET /api/v1/cars 200 45ms - john'
 */

/**
 * Create logging middleware
 * @param {Object} config - Logging configuration
 * @param {string} config.format - Log format string with tokens
 * @param {boolean} config.verbose - Enable verbose logging
 * @returns {Function} Hono middleware
 */
export function createLoggingMiddleware(config = {}) {
  const {
    format = ':method :path :status :response-time ms',
    verbose = false
  } = config;

  return async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    const requestId = c.get('requestId');

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    const user = c.get('user')?.username || c.get('user')?.email || 'anonymous';

    // Parse format string with token replacement
    let logMessage = format
      .replace(':method', method)
      .replace(':path', path)
      .replace(':status', status)
      .replace(':response-time', duration)
      .replace(':user', user)
      .replace(':requestId', requestId);

    console.log(`[HTTP] ${logMessage}`);
  };
}
