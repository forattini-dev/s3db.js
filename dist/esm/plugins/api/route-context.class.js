/**
 * RouteContext - Single, clean context for route handlers
 *
 * Wraps Hono context (c) and injects db/resources plus helper methods
 * Keeps Hono context "clean" while providing rich functionality
 */
export class RouteContext {
    c;
    db;
    resources;
    constructor(c, { db = null, resources = null } = {}) {
        this.c = c;
        this.db = db;
        this.resources = resources;
    }
    get req() {
        return this.c.req;
    }
    get res() {
        return this.c.res;
    }
    get var() {
        return this.c.var;
    }
    set(key, value) {
        return this.c.set(key, value);
    }
    get(key) {
        return this.c.get(key);
    }
    async body() {
        return await this.c.req.json();
    }
    query(key) {
        if (key) {
            return this.c.req.query(key);
        }
        return this.c.req.query();
    }
    param(key) {
        return this.c.req.param(key);
    }
    header(name) {
        return this.c.req.header(name);
    }
    success(data = {}, status = 200) {
        const response = {
            success: true,
            ...(typeof data === 'object' && data !== null ? data : { data })
        };
        return this.c.json(response, status);
    }
    error(message, statusOrOptions = {}, detailsOverride = null) {
        const isNumber = typeof statusOrOptions === 'number';
        const providedStatus = isNumber ? statusOrOptions : statusOrOptions?.status;
        const providedCode = isNumber ? null : statusOrOptions?.code;
        const providedDetails = isNumber ? detailsOverride : (statusOrOptions?.details ?? detailsOverride ?? null);
        const errorObj = typeof message === 'string'
            ? new Error(message)
            : (message || new Error('Unknown error'));
        const resolvedStatus = providedStatus ?? this._getErrorStatus(errorObj);
        const resolvedCode = providedCode ?? this._getErrorCode(errorObj);
        const stack = process.env.NODE_ENV !== 'production' && errorObj.stack
            ? errorObj.stack.split('\n').map(line => line.trim())
            : undefined;
        const response = {
            success: false,
            error: {
                message: errorObj.message || (typeof message === 'string' ? message : 'Unknown error'),
                code: resolvedCode,
                status: resolvedStatus,
                ...(providedDetails ? { details: providedDetails } : {}),
                ...(stack ? { stack } : {})
            }
        };
        return this.c.json(response, resolvedStatus);
    }
    badRequest(message = 'Bad request', details = null) {
        return this.error(message, { status: 400, code: 'BAD_REQUEST', details });
    }
    unauthorized(message = 'Unauthorized', details = null) {
        return this.error(message, { status: 401, code: 'UNAUTHORIZED', details });
    }
    forbidden(message = 'Forbidden', details = null) {
        return this.error(message, { status: 403, code: 'FORBIDDEN', details });
    }
    notFound(message = 'Not found', details = null) {
        return this.error(message, { status: 404, code: 'NOT_FOUND', details });
    }
    validationError(message = 'Validation failed', details = null) {
        return this.error(message, { status: 422, code: 'VALIDATION_ERROR', details });
    }
    serverError(message = 'Internal server error', details = null) {
        return this.error(message, { status: 500, code: 'INTERNAL_ERROR', details });
    }
    _getErrorCode(error) {
        if (error.code)
            return error.code;
        if (error.name && error.name !== 'Error')
            return error.name;
        return 'INTERNAL_ERROR';
    }
    _getErrorStatus(error) {
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
    json(data, status = 200) {
        return this.c.json(data, status);
    }
    text(text, status = 200) {
        return this.c.text(text, status);
    }
    html(html, status = 200) {
        return this.c.html(html, status);
    }
    redirect(location, status = 302) {
        return this.c.redirect(location, status);
    }
    get raw() {
        return this.c;
    }
}
//# sourceMappingURL=route-context.class.js.map