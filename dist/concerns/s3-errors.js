/**
 * S3 Error Classification Utilities
 *
 * Provides consistent error classification across all S3 operations.
 * Handles differences between AWS SDK v3, MinIO, and other S3-compatible clients.
 */
/**
 * Checks if an error indicates the object/resource was not found.
 * Handles various S3 client error formats (AWS SDK v3, MinIO, etc.)
 */
export function isNotFoundError(error) {
    if (!error)
        return false;
    const err = error;
    return (err.name === 'NoSuchKey' ||
        err.name === 'NotFound' ||
        err.code === 'NoSuchKey' ||
        err.code === 'NotFound' ||
        err.Code === 'NoSuchKey' ||
        err.Code === 'NotFound' ||
        err.statusCode === 404 ||
        err.$metadata?.httpStatusCode === 404 ||
        (typeof err.message === 'string' && err.message.includes('NoSuchKey')));
}
/**
 * Checks if an error indicates access was denied.
 */
export function isAccessDeniedError(error) {
    if (!error)
        return false;
    const err = error;
    return (err.name === 'AccessDenied' ||
        err.code === 'AccessDenied' ||
        err.Code === 'AccessDenied' ||
        err.statusCode === 403 ||
        err.$metadata?.httpStatusCode === 403);
}
/**
 * Checks if an error is a transient/retriable error (network, timeout, etc.)
 */
export function isTransientError(error) {
    if (!error)
        return false;
    const err = error;
    const statusCode = err.statusCode || err.$metadata?.httpStatusCode;
    if (statusCode && statusCode >= 500 && statusCode < 600) {
        return true;
    }
    if (statusCode === 429) {
        return true;
    }
    const retriableNames = [
        'TimeoutError',
        'RequestTimeout',
        'NetworkError',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'SocketError',
        'ServiceUnavailable',
        'SlowDown',
        'ThrottlingException',
    ];
    if (err.name && retriableNames.includes(err.name)) {
        return true;
    }
    if (err.code && retriableNames.includes(err.code)) {
        return true;
    }
    return false;
}
//# sourceMappingURL=s3-errors.js.map