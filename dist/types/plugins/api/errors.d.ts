/**
 * Standard HTTP Error Classes for API Plugin
 *
 * Pre-configured error classes with semantic names, HTTP status codes,
 * and error codes. Designed to work seamlessly with c.error() helper.
 *
 * NOTE: These classes use "Http" prefix to avoid conflicts with core s3db.js
 * error classes (like ValidationError, NotFoundError, etc.)
 */
export interface ErrorDetails {
    [key: string]: unknown;
}
/**
 * Base HTTP Error Class
 */
declare class HttpError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details: ErrorDetails | null;
    constructor(message: string, code: string, status: number, details?: ErrorDetails | null);
}
/**
 * 400 Bad Request - Invalid request syntax or parameters
 */
export declare class HttpBadRequestError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 400 Bad Request - Validation failed
 */
export declare class HttpValidationError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 401 Unauthorized - Authentication required or failed
 */
export declare class HttpUnauthorizedError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 403 Forbidden - Authenticated but insufficient permissions
 */
export declare class HttpForbiddenError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 404 Not Found - Resource does not exist
 */
export declare class HttpNotFoundError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 405 Method Not Allowed - HTTP method not supported
 */
export declare class HttpMethodNotAllowedError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 409 Conflict - Request conflicts with current state
 */
export declare class HttpConflictError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 422 Unprocessable Entity - Valid syntax but semantic errors
 */
export declare class HttpUnprocessableEntityError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export declare class HttpTooManyRequestsError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 500 Internal Server Error - Unexpected server error
 */
export declare class HttpInternalServerError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 501 Not Implemented - Feature not implemented yet
 */
export declare class HttpNotImplementedError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export declare class HttpServiceUnavailableError extends HttpError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * All error classes exported as a map
 */
export declare const HTTP_ERRORS: {
    HttpBadRequestError: typeof HttpBadRequestError;
    HttpValidationError: typeof HttpValidationError;
    HttpUnauthorizedError: typeof HttpUnauthorizedError;
    HttpForbiddenError: typeof HttpForbiddenError;
    HttpNotFoundError: typeof HttpNotFoundError;
    HttpMethodNotAllowedError: typeof HttpMethodNotAllowedError;
    HttpConflictError: typeof HttpConflictError;
    HttpUnprocessableEntityError: typeof HttpUnprocessableEntityError;
    HttpTooManyRequestsError: typeof HttpTooManyRequestsError;
    HttpInternalServerError: typeof HttpInternalServerError;
    HttpNotImplementedError: typeof HttpNotImplementedError;
    HttpServiceUnavailableError: typeof HttpServiceUnavailableError;
};
/**
 * Create error by HTTP status code
 */
export declare function createHttpError(status: number, message: string, details?: ErrorDetails | null): HttpError;
declare const _default: {
    HttpBadRequestError: typeof HttpBadRequestError;
    HttpValidationError: typeof HttpValidationError;
    HttpUnauthorizedError: typeof HttpUnauthorizedError;
    HttpForbiddenError: typeof HttpForbiddenError;
    HttpNotFoundError: typeof HttpNotFoundError;
    HttpMethodNotAllowedError: typeof HttpMethodNotAllowedError;
    HttpConflictError: typeof HttpConflictError;
    HttpUnprocessableEntityError: typeof HttpUnprocessableEntityError;
    HttpTooManyRequestsError: typeof HttpTooManyRequestsError;
    HttpInternalServerError: typeof HttpInternalServerError;
    HttpNotImplementedError: typeof HttpNotImplementedError;
    HttpServiceUnavailableError: typeof HttpServiceUnavailableError;
    HTTP_ERRORS: {
        HttpBadRequestError: typeof HttpBadRequestError;
        HttpValidationError: typeof HttpValidationError;
        HttpUnauthorizedError: typeof HttpUnauthorizedError;
        HttpForbiddenError: typeof HttpForbiddenError;
        HttpNotFoundError: typeof HttpNotFoundError;
        HttpMethodNotAllowedError: typeof HttpMethodNotAllowedError;
        HttpConflictError: typeof HttpConflictError;
        HttpUnprocessableEntityError: typeof HttpUnprocessableEntityError;
        HttpTooManyRequestsError: typeof HttpTooManyRequestsError;
        HttpInternalServerError: typeof HttpInternalServerError;
        HttpNotImplementedError: typeof HttpNotImplementedError;
        HttpServiceUnavailableError: typeof HttpServiceUnavailableError;
    };
    createHttpError: typeof createHttpError;
};
export default _default;
//# sourceMappingURL=errors.d.ts.map