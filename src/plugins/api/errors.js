/**
 * Standard HTTP Error Classes for API Plugin
 *
 * Pre-configured error classes with semantic names, HTTP status codes,
 * and error codes. Designed to work seamlessly with c.error() helper.
 *
 * NOTE: These classes use "Http" prefix to avoid conflicts with core s3db.js
 * error classes (like ValidationError, NotFoundError, etc.)
 *
 * @example
 * import { HttpNotFoundError, HttpValidationError } from 's3db.js/api';
 *
 * // Simple usage
 * throw new HttpNotFoundError('User not found');
 *
 * // With details
 * throw new HttpValidationError('Invalid input', {
 *   field: 'email',
 *   rule: 'required'
 * });
 *
 * // In route handler
 * routes: {
 *   'GET /users/:id': async (c, ctx) => {
 *     const user = await ctx.resources.users.get(ctx.param('id'));
 *     if (!user) {
 *       return c.error(new HttpNotFoundError('User not found'));
 *       // → { success: false, error: { message, code: 'NOT_FOUND', status: 404 } }
 *     }
 *     return ctx.success(user);
 *   }
 * }
 */

/**
 * Base HTTP Error Class
 * @private
 */
class HttpError extends Error {
  constructor(message, code, status, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Invalid request syntax or parameters
 *
 * Use for general client-side errors that don't fit other 4xx categories.
 *
 * @example
 * throw new HttpBadRequestError('Invalid query parameter format');
 * throw new HttpBadRequestError('Missing required field', { field: 'name' });
 */
export class HttpBadRequestError extends HttpError {
  constructor(message = 'Bad request', details = null) {
    super(message, 'BAD_REQUEST', 400, details);
  }
}

/**
 * 400 Bad Request - Validation failed
 *
 * Use when request data fails schema validation or business rules.
 *
 * @example
 * throw new HttpValidationError('Email format is invalid');
 * throw new HttpValidationError('Validation failed', {
 *   field: 'email',
 *   rule: 'email',
 *   value: 'not-an-email'
 * });
 */
export class HttpValidationError extends HttpError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 *
 * Use when user is not authenticated or credentials are invalid.
 *
 * @example
 * throw new HttpUnauthorizedError('Authentication required');
 * throw new HttpUnauthorizedError('Invalid token', { reason: 'expired' });
 */
export class HttpUnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, 'UNAUTHORIZED', 401, details);
  }
}

/**
 * 403 Forbidden - Authenticated but insufficient permissions
 *
 * Use when user is authenticated but lacks required permissions/scopes.
 *
 * @example
 * throw new HttpForbiddenError('Admin access required');
 * throw new HttpForbiddenError('Insufficient permissions', {
 *   required: ['admin'],
 *   current: ['user']
 * });
 */
export class HttpForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details = null) {
    super(message, 'FORBIDDEN', 403, details);
  }
}

/**
 * 404 Not Found - Resource does not exist
 *
 * Use when requested resource cannot be found.
 *
 * @example
 * throw new HttpNotFoundError('User not found');
 * throw new HttpNotFoundError('Resource not found', {
 *   resource: 'users',
 *   id: 'user-123'
 * });
 */
export class HttpNotFoundError extends HttpError {
  constructor(message = 'Not found', details = null) {
    super(message, 'NOT_FOUND', 404, details);
  }
}

/**
 * 405 Method Not Allowed - HTTP method not supported
 *
 * Use when endpoint exists but doesn't support the HTTP method used.
 *
 * @example
 * throw new HttpMethodNotAllowedError('DELETE not supported on this endpoint');
 * throw new HttpMethodNotAllowedError('Method not allowed', {
 *   method: 'DELETE',
 *   allowed: ['GET', 'POST']
 * });
 */
export class HttpMethodNotAllowedError extends HttpError {
  constructor(message = 'Method not allowed', details = null) {
    super(message, 'METHOD_NOT_ALLOWED', 405, details);
  }
}

/**
 * 409 Conflict - Request conflicts with current state
 *
 * Use for conflicts like duplicate keys, concurrent modifications, etc.
 *
 * @example
 * throw new HttpConflictError('Email already exists');
 * throw new HttpConflictError('Resource conflict', {
 *   field: 'email',
 *   value: 'user@example.com'
 * });
 */
export class HttpConflictError extends HttpError {
  constructor(message = 'Conflict', details = null) {
    super(message, 'CONFLICT', 409, details);
  }
}

/**
 * 422 Unprocessable Entity - Valid syntax but semantic errors
 *
 * Use when request is well-formed but contains semantic errors.
 *
 * @example
 * throw new HttpUnprocessableEntityError('Cannot delete user with active orders');
 * throw new HttpUnprocessableEntityError('Business rule violation', {
 *   rule: 'minimum_age',
 *   provided: 15,
 *   required: 18
 * });
 */
export class HttpUnprocessableEntityError extends HttpError {
  constructor(message = 'Unprocessable entity', details = null) {
    super(message, 'UNPROCESSABLE_ENTITY', 422, details);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 *
 * Use when client has sent too many requests in a given timeframe.
 *
 * @example
 * throw new HttpTooManyRequestsError('Rate limit exceeded');
 * throw new HttpTooManyRequestsError('Too many requests', {
 *   limit: 100,
 *   window: '1 minute',
 *   retryAfter: 45
 * });
 */
export class HttpTooManyRequestsError extends HttpError {
  constructor(message = 'Too many requests', details = null) {
    super(message, 'TOO_MANY_REQUESTS', 429, details);
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 *
 * Use for unexpected errors that don't fit other categories.
 *
 * @example
 * throw new HttpInternalServerError('Database connection failed');
 * throw new HttpInternalServerError('Unexpected error', {
 *   operation: 'insert',
 *   error: err.message
 * });
 */
export class HttpInternalServerError extends HttpError {
  constructor(message = 'Internal server error', details = null) {
    super(message, 'INTERNAL_SERVER_ERROR', 500, details);
  }
}

/**
 * 501 Not Implemented - Feature not implemented yet
 *
 * Use for endpoints or features that are planned but not yet implemented.
 *
 * @example
 * throw new HttpNotImplementedError('Export to PDF not implemented yet');
 */
export class HttpNotImplementedError extends HttpError {
  constructor(message = 'Not implemented', details = null) {
    super(message, 'NOT_IMPLEMENTED', 501, details);
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 *
 * Use when service is down for maintenance or overloaded.
 *
 * @example
 * throw new HttpServiceUnavailableError('Database maintenance in progress');
 * throw new HttpServiceUnavailableError('Service unavailable', {
 *   reason: 'maintenance',
 *   retryAfter: 3600
 * });
 */
export class HttpServiceUnavailableError extends HttpError {
  constructor(message = 'Service unavailable', details = null) {
    super(message, 'SERVICE_UNAVAILABLE', 503, details);
  }
}

/**
 * All error classes exported as a map
 * Useful for dynamic error creation
 */
export const HTTP_ERRORS = {
  HttpBadRequestError,
  HttpValidationError,
  HttpUnauthorizedError,
  HttpForbiddenError,
  HttpNotFoundError,
  HttpMethodNotAllowedError,
  HttpConflictError,
  HttpUnprocessableEntityError,
  HttpTooManyRequestsError,
  HttpInternalServerError,
  HttpNotImplementedError,
  HttpServiceUnavailableError
};

/**
 * Create error by HTTP status code
 *
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {Object} details - Optional error details
 * @returns {HttpError} Error instance
 *
 * @example
 * throw createHttpError(404, 'User not found', { id: 'user-123' });
 */
export function createHttpError(status, message, details = null) {
  const errorMap = {
    400: HttpBadRequestError,
    401: HttpUnauthorizedError,
    403: HttpForbiddenError,
    404: HttpNotFoundError,
    405: HttpMethodNotAllowedError,
    409: HttpConflictError,
    422: HttpUnprocessableEntityError,
    429: HttpTooManyRequestsError,
    500: HttpInternalServerError,
    501: HttpNotImplementedError,
    503: HttpServiceUnavailableError
  };

  const ErrorClass = errorMap[status] || HttpInternalServerError;
  return new ErrorClass(message, details);
}

export default {
  HttpBadRequestError,
  HttpValidationError,
  HttpUnauthorizedError,
  HttpForbiddenError,
  HttpNotFoundError,
  HttpMethodNotAllowedError,
  HttpConflictError,
  HttpUnprocessableEntityError,
  HttpTooManyRequestsError,
  HttpInternalServerError,
  HttpNotImplementedError,
  HttpServiceUnavailableError,
  HTTP_ERRORS,
  createHttpError
};
