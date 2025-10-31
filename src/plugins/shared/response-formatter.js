/**
 * Response Formatter - Standard JSON API responses
 *
 * Provides consistent response formatting across all API endpoints
 */

/**
 * Format successful response
 * @param {Object} data - Response data
 * @param {Object} options - Response options
 * @param {number} options.status - HTTP status code (default: 200)
 * @param {Object} options.meta - Additional metadata
 * @returns {Object} Formatted response
 */
export function success(data, options = {}) {
  const { status = 200, meta = {} } = options;

  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    },
    _status: status
  };
}

/**
 * Format error response
 * @param {string|Error} error - Error message or Error object
 * @param {Object} options - Error options
 * @param {number} options.status - HTTP status code (default: 500)
 * @param {string} options.code - Error code
 * @param {Object} options.details - Additional error details
 * @returns {Object} Formatted error response
 */
export function error(error, options = {}) {
  const { status = 500, code = 'INTERNAL_ERROR', details = {} } = options;

  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error && process.env.NODE_ENV !== 'production'
    ? error.stack
    : undefined;

  return {
    success: false,
    error: {
      message: errorMessage,
      code,
      details,
      stack: errorStack
    },
    meta: {
      timestamp: new Date().toISOString()
    },
    _status: status
  };
}

/**
 * Format list response with pagination
 * @param {Array} items - List items
 * @param {Object} pagination - Pagination info
 * @param {number} pagination.total - Total count
 * @param {number} pagination.page - Current page
 * @param {number} pagination.pageSize - Items per page
 * @param {number} pagination.pageCount - Total pages
 * @returns {Object} Formatted list response
 */
export function list(items, pagination = {}) {
  const { total, page, pageSize, pageCount } = pagination;

  return {
    success: true,
    data: items,
    pagination: {
      total: total || items.length,
      page: page || 1,
      pageSize: pageSize || items.length,
      pageCount: pageCount || 1
    },
    meta: {
      timestamp: new Date().toISOString()
    },
    _status: 200
  };
}

/**
 * Format created response
 * @param {Object} data - Created resource data
 * @param {string} location - Resource location URL
 * @returns {Object} Formatted created response
 */
export function created(data, location) {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      location
    },
    _status: 201
  };
}

/**
 * Format no content response
 * @returns {Object} Formatted no content response
 */
export function noContent() {
  return {
    success: true,
    data: null,
    meta: {
      timestamp: new Date().toISOString()
    },
    _status: 204
  };
}

/**
 * Format validation error response
 * @param {Array} errors - Validation errors
 * @returns {Object} Formatted validation error response
 */
export function validationError(errors) {
  return error('Validation failed', {
    status: 400,
    code: 'VALIDATION_ERROR',
    details: { errors }
  });
}

/**
 * Format not found response
 * @param {string} resource - Resource name
 * @param {string} id - Resource ID
 * @returns {Object} Formatted not found response
 */
export function notFound(resource, id) {
  return error(`${resource} with id '${id}' not found`, {
    status: 404,
    code: 'NOT_FOUND',
    details: { resource, id }
  });
}

/**
 * Format unauthorized response
 * @param {string} message - Unauthorized message
 * @returns {Object} Formatted unauthorized response
 */
export function unauthorized(message = 'Unauthorized') {
  return error(message, {
    status: 401,
    code: 'UNAUTHORIZED'
  });
}

/**
 * Format forbidden response
 * @param {string} message - Forbidden message
 * @returns {Object} Formatted forbidden response
 */
export function forbidden(message = 'Forbidden') {
  return error(message, {
    status: 403,
    code: 'FORBIDDEN'
  });
}

/**
 * Format rate limit exceeded response
 * @param {number} retryAfter - Retry after seconds
 * @returns {Object} Formatted rate limit response
 */
export function rateLimitExceeded(retryAfter) {
  return error('Rate limit exceeded', {
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    details: { retryAfter }
  });
}

/**
 * Format payload too large response
 * @param {number} size - Received payload size in bytes
 * @param {number} limit - Maximum allowed size in bytes
 * @returns {Object} Formatted payload too large response
 */
export function payloadTooLarge(size, limit) {
  return error('Request payload too large', {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    details: {
      receivedSize: size,
      maxSize: limit,
      receivedMB: (size / 1024 / 1024).toFixed(2),
      maxMB: (limit / 1024 / 1024).toFixed(2)
    }
  });
}

/**
 * Create custom formatters with override support
 *
 * Allows customization of response formats while maintaining fallbacks.
 * Useful for adapting to existing API contracts or organizational standards.
 *
 * @param {Object} customFormatters - Custom formatter functions
 * @param {Function} customFormatters.success - Custom success formatter
 * @param {Function} customFormatters.error - Custom error formatter
 * @param {Function} customFormatters.list - Custom list formatter
 * @param {Function} customFormatters.created - Custom created formatter
 * @returns {Object} Formatters object with custom overrides
 *
 * @example
 * const formatters = createCustomFormatters({
 *   success: (data, meta) => ({ ok: true, result: data, ...meta }),
 *   error: (err, status) => ({ ok: false, message: err.message, code: status })
 * });
 *
 * // Use in API routes:
 * return c.json(formatters.success(user));
 */
export function createCustomFormatters(customFormatters = {}) {
  // Default formatters
  const defaults = {
    success: (data, meta = {}) => success(data, { meta }),
    error: (err, status, code) => error(err, { status, code }),
    list: (items, pagination) => list(items, pagination),
    created: (data, location) => created(data, location),
    noContent: () => noContent(),
    validationError: (errors) => validationError(errors),
    notFound: (resource, id) => notFound(resource, id),
    unauthorized: (message) => unauthorized(message),
    forbidden: (message) => forbidden(message),
    rateLimitExceeded: (retryAfter) => rateLimitExceeded(retryAfter),
    payloadTooLarge: (size, limit) => payloadTooLarge(size, limit)
  };

  // Merge custom formatters with defaults
  return {
    ...defaults,
    ...customFormatters
  };
}

export default {
  success,
  error,
  list,
  created,
  noContent,
  validationError,
  notFound,
  unauthorized,
  forbidden,
  rateLimitExceeded,
  payloadTooLarge,
  createCustomFormatters
};
