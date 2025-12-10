/**
 * Standard HTTP Error Classes for API Plugin
 *
 * Pre-configured error classes with semantic names, HTTP status codes,
 * and error codes. Designed to work seamlessly with c.error() helper.
 *
 * NOTE: These classes use "Http" prefix to avoid conflicts with core s3db.js
 * error classes (like ValidationError, NotFoundError, etc.)
 */
/**
 * Base HTTP Error Class
 */
class HttpError extends Error {
    code;
    status;
    details;
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
 */
export class HttpBadRequestError extends HttpError {
    constructor(message = 'Bad request', details = null) {
        super(message, 'BAD_REQUEST', 400, details);
    }
}
/**
 * 400 Bad Request - Validation failed
 */
export class HttpValidationError extends HttpError {
    constructor(message = 'Validation failed', details = null) {
        super(message, 'VALIDATION_ERROR', 400, details);
    }
}
/**
 * 401 Unauthorized - Authentication required or failed
 */
export class HttpUnauthorizedError extends HttpError {
    constructor(message = 'Unauthorized', details = null) {
        super(message, 'UNAUTHORIZED', 401, details);
    }
}
/**
 * 403 Forbidden - Authenticated but insufficient permissions
 */
export class HttpForbiddenError extends HttpError {
    constructor(message = 'Forbidden', details = null) {
        super(message, 'FORBIDDEN', 403, details);
    }
}
/**
 * 404 Not Found - Resource does not exist
 */
export class HttpNotFoundError extends HttpError {
    constructor(message = 'Not found', details = null) {
        super(message, 'NOT_FOUND', 404, details);
    }
}
/**
 * 405 Method Not Allowed - HTTP method not supported
 */
export class HttpMethodNotAllowedError extends HttpError {
    constructor(message = 'Method not allowed', details = null) {
        super(message, 'METHOD_NOT_ALLOWED', 405, details);
    }
}
/**
 * 409 Conflict - Request conflicts with current state
 */
export class HttpConflictError extends HttpError {
    constructor(message = 'Conflict', details = null) {
        super(message, 'CONFLICT', 409, details);
    }
}
/**
 * 422 Unprocessable Entity - Valid syntax but semantic errors
 */
export class HttpUnprocessableEntityError extends HttpError {
    constructor(message = 'Unprocessable entity', details = null) {
        super(message, 'UNPROCESSABLE_ENTITY', 422, details);
    }
}
/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class HttpTooManyRequestsError extends HttpError {
    constructor(message = 'Too many requests', details = null) {
        super(message, 'TOO_MANY_REQUESTS', 429, details);
    }
}
/**
 * 500 Internal Server Error - Unexpected server error
 */
export class HttpInternalServerError extends HttpError {
    constructor(message = 'Internal server error', details = null) {
        super(message, 'INTERNAL_SERVER_ERROR', 500, details);
    }
}
/**
 * 501 Not Implemented - Feature not implemented yet
 */
export class HttpNotImplementedError extends HttpError {
    constructor(message = 'Not implemented', details = null) {
        super(message, 'NOT_IMPLEMENTED', 501, details);
    }
}
/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class HttpServiceUnavailableError extends HttpError {
    constructor(message = 'Service unavailable', details = null) {
        super(message, 'SERVICE_UNAVAILABLE', 503, details);
    }
}
/**
 * All error classes exported as a map
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
//# sourceMappingURL=errors.js.map