/**
 * Request ID Middleware
 *
 * Generates or extracts request IDs for correlation and tracing.
 * Useful for troubleshooting, logging, and distributed tracing.
 *
 * Features:
 * - Auto-generates ID if not present in request header
 * - Configurable header name (default: X-Request-ID)
 * - Includes ID in response headers
 * - Exposes ID via context (c.get('requestId'))
 * - Custom ID generator support
 *
 * @example
 * import { createRequestIdMiddleware } from './middlewares/request-id.js';
 *
 * const middleware = createRequestIdMiddleware({
 *   headerName: 'X-Request-ID',
 *   generator: () => nanoid(),
 *   includeInResponse: true
 * });
 *
 * app.use('*', middleware);
 *
 * // In route handlers:
 * app.get('/users', (c) => {
 *   const requestId = c.get('requestId');
 *   logger.info(`[${requestId}] Fetching users...`);
 * });
 */

import { idGenerator } from '../../../concerns/id.js';
import { createLogger } from '../../../concerns/logger.js';


// Module-level logger
const logger = createLogger({ name: 'RequestId', level: 'info' });
/**
 * Create request ID middleware
 *
 * @param {Object} config - Middleware configuration
 * @param {string} config.headerName - Header name to check/set (default: X-Request-ID)
 * @param {Function} config.generator - Function to generate IDs (default: nanoid)
 * @param {boolean} config.includeInResponse - Include ID in response header (default: true)
 * @param {boolean} config.includeInLogs - Reserved for future logging integration (default: true)
 * @returns {Function} Hono middleware
 */
export function createRequestIdMiddleware(config = {}) {
  const {
    headerName = 'X-Request-ID',
    generator = () => idGenerator(),
    includeInResponse = true,
    includeInLogs = true  // Reserved for future use
  } = config;

  return async (c, next) => {
    // Check if request already has an ID (from load balancer, proxy, etc)
    let requestId = c.req.header(headerName);

    // Generate new ID if not present
    if (!requestId) {
      requestId = generator();
    }

    // Store in context for use in handlers
    c.set('requestId', requestId);

    // Continue request processing
    await next();

    // Include ID in response header
    if (includeInResponse) {
      c.header(headerName, requestId);
    }
  };
}

export default createRequestIdMiddleware;
