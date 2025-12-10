import { error as formatError } from './response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({ name: 'ErrorHandler', level: 'info' });
const errorStatusMap = {
    'ValidationError': 400,
    'InvalidResourceItem': 400,
    'ResourceNotFound': 404,
    'NoSuchKey': 404,
    'NoSuchBucket': 404,
    'PartitionError': 400,
    'CryptoError': 500,
    'SchemaError': 400,
    'QueueError': 500,
    'ResourceError': 500
};
export function getStatusFromError(err) {
    if (err.name && errorStatusMap[err.name]) {
        return errorStatusMap[err.name];
    }
    if (err.constructor && err.constructor.name && errorStatusMap[err.constructor.name]) {
        return errorStatusMap[err.constructor.name];
    }
    if (err.message) {
        if (err.message.includes('not found') || err.message.includes('does not exist')) {
            return 404;
        }
        if (err.message.includes('validation') || err.message.includes('invalid')) {
            return 400;
        }
        if (err.message.includes('unauthorized') || err.message.includes('authentication')) {
            return 401;
        }
        if (err.message.includes('forbidden') || err.message.includes('permission')) {
            return 403;
        }
    }
    return 500;
}
export function errorHandler(err, c) {
    const status = getStatusFromError(err);
    const code = err.name || 'INTERNAL_ERROR';
    const details = {};
    const s3dbErr = err;
    if (s3dbErr.resource)
        details.resource = s3dbErr.resource;
    if (s3dbErr.bucket)
        details.bucket = s3dbErr.bucket;
    if (s3dbErr.key)
        details.key = s3dbErr.key;
    if (s3dbErr.operation)
        details.operation = s3dbErr.operation;
    if (s3dbErr.suggestion)
        details.suggestion = s3dbErr.suggestion;
    if (s3dbErr.availableResources)
        details.availableResources = s3dbErr.availableResources;
    const response = formatError(err, {
        status,
        code,
        details
    });
    const logLevel = c?.get?.('logLevel');
    if (logLevel === 'debug' || logLevel === 'trace') {
        if (status >= 500) {
            logger.error({
                message: err.message,
                code,
                status,
                stack: err.stack,
                details
            }, '[API Plugin] Error');
        }
        else if (status >= 400 && status < 500) {
            logger.warn({
                message: err.message,
                code,
                status,
                details
            }, '[API Plugin] Client error');
        }
    }
    return c.json(response, response._status);
}
export function asyncHandler(fn) {
    return async (c) => {
        try {
            return await fn(c);
        }
        catch (err) {
            return errorHandler(err, c);
        }
    };
}
export async function tryApiCall(fn, c) {
    try {
        const result = await fn();
        return [true, null, result];
    }
    catch (err) {
        const response = errorHandler(err, c);
        return [false, err, response];
    }
}
export default {
    errorHandler,
    asyncHandler,
    tryApiCall,
    getStatusFromError
};
//# sourceMappingURL=error-handler.js.map