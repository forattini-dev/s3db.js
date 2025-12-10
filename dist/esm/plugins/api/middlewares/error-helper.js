import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({ name: 'ErrorHelper', level: 'info' });
function getErrorCode(error) {
    if (error.code)
        return error.code;
    if (error.name && error.name !== 'Error')
        return error.name;
    return 'INTERNAL_ERROR';
}
function getErrorStatus(error) {
    if (error.status)
        return error.status;
    if (error.statusCode)
        return error.statusCode;
    if (error.httpStatus)
        return error.httpStatus;
    const errorName = error.name || '';
    const errorMsg = error.message || '';
    if (errorName === 'ValidationError')
        return 400;
    if (errorName === 'UnauthorizedError')
        return 401;
    if (errorName === 'ForbiddenError')
        return 403;
    if (errorName === 'NotFoundError')
        return 404;
    if (errorName === 'ConflictError')
        return 409;
    if (errorName === 'TooManyRequestsError')
        return 429;
    if (/not found/i.test(errorMsg))
        return 404;
    if (/unauthorized|unauthenticated/i.test(errorMsg))
        return 401;
    if (/forbidden|access denied/i.test(errorMsg))
        return 403;
    if (/invalid|validation|bad request/i.test(errorMsg))
        return 400;
    if (/conflict|already exists/i.test(errorMsg))
        return 409;
    if (/rate limit|too many/i.test(errorMsg))
        return 429;
    return 500;
}
export function errorHelper(options = {}) {
    const { includeStack = process.env.NODE_ENV !== 'production', logLevel = 'info' } = options;
    return async (c, next) => {
        const contextWithError = c;
        contextWithError.error = function (errorInput, statusCode = null, details = null) {
            let error;
            if (typeof errorInput === 'string') {
                error = new Error(errorInput);
            }
            else if (!errorInput || typeof errorInput !== 'object') {
                error = new Error('Unknown error');
            }
            else {
                error = errorInput;
            }
            const status = statusCode || getErrorStatus(error);
            const errorResponse = {
                success: false,
                error: {
                    message: error.message || 'An error occurred',
                    code: getErrorCode(error),
                    status
                }
            };
            if (details) {
                errorResponse.error.details = details;
            }
            if (includeStack && error.stack) {
                errorResponse.error.stack = error.stack.split('\n').map(line => line.trim());
            }
            if (logLevel === 'debug' || logLevel === 'trace') {
                logger.error({
                    status,
                    code: errorResponse.error.code,
                    message: error.message,
                    path: c.req.path,
                    method: c.req.method,
                    details
                }, '[API Error]');
            }
            return c.json(errorResponse, status);
        };
        await next();
    };
}
export default errorHelper;
//# sourceMappingURL=error-helper.js.map