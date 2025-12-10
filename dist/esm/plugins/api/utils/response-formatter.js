function deleteNestedField(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
            return;
        }
        current = current[part];
    }
    const lastPart = parts[parts.length - 1];
    if (current && typeof current === 'object' && lastPart !== undefined && lastPart in current) {
        delete current[lastPart];
    }
}
export function filterProtectedFields(data, protectedFields) {
    if (!protectedFields || protectedFields.length === 0) {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map(item => filterProtectedFields(item, protectedFields));
    }
    if (data === null || typeof data !== 'object') {
        return data;
    }
    const result = { ...data };
    for (const fieldPath of protectedFields) {
        deleteNestedField(result, fieldPath);
    }
    return result;
}
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
export function error(errorInput, options = {}) {
    const { status = 500, code = 'INTERNAL_ERROR', details = {} } = options;
    const errorMessage = errorInput instanceof Error ? errorInput.message : errorInput;
    const errorStack = errorInput instanceof Error && process.env.NODE_ENV !== 'production'
        ? errorInput.stack
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
            total: total ?? items.length,
            page: page ?? 1,
            pageSize: pageSize ?? items.length,
            pageCount: pageCount ?? 1
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
    filterProtectedFields
};
//# sourceMappingURL=response-formatter.js.map