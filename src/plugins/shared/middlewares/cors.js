/**
 * CORS Middleware
 *
 * Handles Cross-Origin Resource Sharing (CORS) headers and preflight requests.
 * Supports wildcard origins, credential-based requests, and OPTIONS preflight.
 */

/**
 * Create CORS middleware
 * @param {Object} config - CORS configuration
 * @param {string} config.origin - Allowed origin ('*' or specific domain)
 * @param {Array<string>} config.methods - Allowed HTTP methods
 * @param {Array<string>} config.allowedHeaders - Allowed request headers
 * @param {Array<string>} config.exposedHeaders - Exposed response headers
 * @param {boolean} config.credentials - Allow credentials
 * @param {number} config.maxAge - Preflight cache duration
 * @returns {Function} Hono middleware
 */
export function createCorsMiddleware(config = {}) {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders = ['X-Total-Count', 'X-Page-Count'],
    credentials = true,
    maxAge = 86400
  } = config;

  return async (c, next) => {
    // Set CORS headers
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', methods.join(', '));
    c.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    c.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));

    if (credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    c.header('Access-Control-Max-Age', maxAge.toString());

    // Handle OPTIONS preflight
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    await next();
  };
}
