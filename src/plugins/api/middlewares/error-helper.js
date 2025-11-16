/**
import { createLogger } from '../../../concerns/logger.js';

// Module-level logger
const logger = createLogger({ name: 'ErrorHelper', level: 'info' });

 * Error Helper Middleware
 *
 * Adds a standardized error response method to Hono context: c.error()
 *
 * Usage:
 *   c.error(error)                              // Auto-detect status from error
 *   c.error(error, 404)                         // Custom status
 *   c.error(error, 400, { field: 'email' })     // With details
 *   c.error('Invalid input', 400)               // String message
 *
 * Response format:
 * {
 *   success: false,
 *   error: {
 *     message: "Error message",
 *     code: "ERROR_CODE",
 *     status: 400,
 *     details: {...}
 *   }
 * }
 *
 * @example
 * import { errorHelper } from './middlewares/error-helper.js';
 *
 * app.use('*', errorHelper());
 *
 * app.get('/users/:id', async (c) => {
 *   const user = await db.users.get(c.req.param('id'));
 *   if (!user) {
 *     return c.error(new Error('User not found'), 404);
 *   }
 *   return c.json({ success: true, data: user });
 * });
 */

/**
 * Extract error code from error object
 * @param {Error|Object} error - Error object
 * @returns {string} Error code
 */
function getErrorCode(error) {
  if (error.code) return error.code;
  if (error.name && error.name !== 'Error') return error.name;
  return 'INTERNAL_ERROR';
}

/**
 * Extract HTTP status code from error
 * @param {Error|Object} error - Error object
 * @returns {number} HTTP status code
 */
function getErrorStatus(error) {
  // Check common status properties
  if (error.status) return error.status;
  if (error.statusCode) return error.statusCode;
  if (error.httpStatus) return error.httpStatus;

  // Map common error names to status codes
  const errorName = error.name || '';
  const errorMsg = error.message || '';

  if (errorName === 'ValidationError') return 400;
  if (errorName === 'UnauthorizedError') return 401;
  if (errorName === 'ForbiddenError') return 403;
  if (errorName === 'NotFoundError') return 404;
  if (errorName === 'ConflictError') return 409;
  if (errorName === 'TooManyRequestsError') return 429;

  // Check message patterns
  if (/not found/i.test(errorMsg)) return 404;
  if (/unauthorized|unauthenticated/i.test(errorMsg)) return 401;
  if (/forbidden|access denied/i.test(errorMsg)) return 403;
  if (/invalid|validation|bad request/i.test(errorMsg)) return 400;
  if (/conflict|already exists/i.test(errorMsg)) return 409;
  if (/rate limit|too many/i.test(errorMsg)) return 429;

  // Default to 500 for unknown errors
  return 500;
}

/**
 * Create error helper middleware
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeStack - Include stack trace in dev mode (default: NODE_ENV !== 'production')
 * @param {boolean} options.logLevel - Enable verbose logging (default: false)
 * @returns {Function} Hono middleware
 */
export function errorHelper(options = {}) {
  const {
    includeStack = process.env.NODE_ENV !== 'production',
    logLevel = 'info'
  } = options;

  return async (c, next) => {
    // Add c.error() method to context
    c.error = function (error, statusCode = null, details = null) {
      // Handle string errors
      if (typeof error === 'string') {
        error = new Error(error);
      }

      // Ensure error is an object
      if (!error || typeof error !== 'object') {
        error = new Error('Unknown error');
      }

      // Determine status code
      const status = statusCode || getErrorStatus(error);

      // Build error response
      const errorResponse = {
        success: false,
        error: {
          message: error.message || 'An error occurred',
          code: getErrorCode(error),
          status
        }
      };

      // Add details if provided
      if (details) {
        errorResponse.error.details = details;
      }

      // Add stack trace in development
      if (includeStack && error.stack) {
        errorResponse.error.stack = error.stack.split('\n').map(line => line.trim());
      }

      // Verbose logging
      if (logLevel === 'debug' || logLevel === 'trace') {
        logger.error('[API Error]', {
          status,
          code: errorResponse.error.code,
          message: error.message,
          path: c.req.path,
          method: c.req.method,
          details
        });
      }

      // Return JSON response
      return c.json(errorResponse, status);
    };

    await next();
  };
}

export default errorHelper;
