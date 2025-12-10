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
export function error(err, options = {}) {
    const { status = 500, code = 'INTERNAL_ERROR', details = {} } = options;
    const errorMessage = err instanceof Error ? err.message : err;
    const errorStack = err instanceof Error && process.env.NODE_ENV !== 'production'
        ? err.stack
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
export function validationError(errors) {
    return error('Validation failed', {
        status: 400,
        code: 'VALIDATION_ERROR',
        details: { errors }
    });
}
export function notFound(resource, id) {
    return error(`${resource} with id '${id}' not found`, {
        status: 404,
        code: 'NOT_FOUND',
        details: { resource, id }
    });
}
export function unauthorized(message = 'Unauthorized') {
    return error(message, {
        status: 401,
        code: 'UNAUTHORIZED'
    });
}
export function forbidden(message = 'Forbidden') {
    return error(message, {
        status: 403,
        code: 'FORBIDDEN'
    });
}
export function rateLimitExceeded(retryAfter) {
    return error('Rate limit exceeded', {
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        details: { retryAfter }
    });
}
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
export function createCustomFormatters(customFormatters = {}) {
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
//# sourceMappingURL=response-formatter.js.map