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
export class RouteContext {
    c;
    db;
    database;
    _currentResource;
    pluginRegistry;
    resources;
    validator;
    resource;
    _partitionFilters;
    constructor(honoContext, database, resource = null, plugins = {}) {
        this.c = honoContext;
        this.db = database;
        this.database = database;
        this._currentResource = resource;
        this.pluginRegistry = plugins;
        this._partitionFilters = [];
        this.resources = this._createResourcesProxy();
        this.validator = this._createValidator();
        this.resource = resource;
    }
    _createResourcesProxy() {
        const self = this;
        return new Proxy({}, {
            get(_target, prop) {
                const resources = self.database.resources;
                if (resources[prop]) {
                    return resources[prop];
                }
                const available = Object.keys(resources);
                throw new Error(`Resource "${prop}" not found. Available resources: ${available.join(', ')}`);
            },
            ownKeys() {
                return Object.keys(self.database.resources);
            },
            getOwnPropertyDescriptor(_target, prop) {
                const resources = self.database.resources;
                if (resources[prop]) {
                    return {
                        enumerable: true,
                        configurable: true
                    };
                }
                return undefined;
            }
        });
    }
    _createValidator() {
        const ctx = this;
        return {
            validate(resourceOrData, data = null) {
                let resource;
                let dataToValidate;
                if (typeof resourceOrData === 'object' && data === null) {
                    if (!ctx._currentResource) {
                        throw new Error('validator.validate(data) requires a current resource. Use validator.validate("resourceName", data) instead.');
                    }
                    resource = ctx._currentResource;
                    dataToValidate = resourceOrData;
                }
                else if (typeof resourceOrData === 'string' && data !== null) {
                    resource = ctx.resources[resourceOrData];
                    dataToValidate = data;
                }
                else {
                    throw new Error('Invalid arguments. Use validator.validate(data) or validator.validate("resourceName", data)');
                }
                const validation = resource.schema?.validate(dataToValidate);
                if (validation === true) {
                    return { valid: true };
                }
                else {
                    return {
                        valid: false,
                        errors: Array.isArray(validation) ? validation : [validation]
                    };
                }
            },
            validateOrThrow(resourceOrData, data = null) {
                const result = this.validate(resourceOrData, data);
                if (!result.valid) {
                    const error = new Error('Validation failed');
                    error.code = 'VALIDATION_ERROR';
                    error.errors = result.errors;
                    error.status = 400;
                    throw error;
                }
            },
            async validateBody(resourceName = null) {
                const body = await ctx.c.req.json();
                if (resourceName) {
                    const result = this.validate(resourceName, body);
                    return { ...result, data: body };
                }
                else {
                    const result = this.validate(body);
                    return { ...result, data: body };
                }
            }
        };
    }
    param(name) {
        return this.c.req.param(name);
    }
    params() {
        return this.c.req.param();
    }
    query(name) {
        return this.c.req.query(name);
    }
    queries() {
        return this.c.req.query();
    }
    header(name) {
        return this.c.req.header(name);
    }
    async body() {
        return await this.c.req.json();
    }
    async text() {
        return await this.c.req.text();
    }
    async formData() {
        return await this.c.req.formData();
    }
    json(data, status = 200) {
        return this.c.json(data, status);
    }
    success(data, status = 200) {
        return this.c.json({
            success: true,
            data
        }, status);
    }
    error(message, status = 400, details = null) {
        const errorObj = typeof message === 'string'
            ? new Error(message)
            : (message || new Error('Unknown error'));
        const resolvedStatus = status || getErrorStatus(errorObj);
        const code = getErrorCode(errorObj);
        const stack = process.env.NODE_ENV !== 'production' && errorObj.stack
            ? errorObj.stack.split('\n').map(line => line.trim())
            : undefined;
        return this.c.json({
            success: false,
            error: {
                message: errorObj.message || message,
                code,
                status: resolvedStatus,
                ...(details ? { details } : {}),
                ...(stack ? { stack } : {})
            }
        }, resolvedStatus);
    }
    notFound(message = 'Not found') {
        return this.c.json({
            success: false,
            error: {
                message,
                code: 'NOT_FOUND',
                status: 404
            }
        }, 404);
    }
    unauthorized(message = 'Unauthorized') {
        return this.c.json({
            success: false,
            error: {
                message,
                code: 'UNAUTHORIZED',
                status: 401
            }
        }, 401);
    }
    forbidden(message = 'Forbidden') {
        return this.c.json({
            success: false,
            error: {
                message,
                code: 'FORBIDDEN',
                status: 403
            }
        }, 403);
    }
    html(htmlContent, status = 200) {
        return this.c.html(htmlContent, status);
    }
    redirect(url, status = 302) {
        return this.c.redirect(url, status);
    }
    async render(template, data = {}, options = {}) {
        const renderFn = this.c.render;
        if (!renderFn) {
            throw new Error('Template engine not configured. Use ApiPlugin with templates: { engine: "ejs" | "pug" | "jsx" }');
        }
        return await renderFn(template, data, options);
    }
    get user() {
        return this.c.get('user') || null;
    }
    get session() {
        return this.c.get('session') || null;
    }
    get sessionId() {
        return this.c.get('sessionId') || null;
    }
    get requestId() {
        return this.c.get('requestId') || null;
    }
    get isAuthenticated() {
        return !!this.user;
    }
    hasScope(scope) {
        return this.user?.scopes?.includes(scope) || false;
    }
    hasAnyScope(...scopes) {
        return scopes.some(scope => this.hasScope(scope));
    }
    hasAllScopes(...scopes) {
        return scopes.every(scope => this.hasScope(scope));
    }
    requireAuth() {
        if (!this.isAuthenticated) {
            throw Object.assign(new Error('Authentication required'), { status: 401, code: 'UNAUTHORIZED' });
        }
    }
    requireScope(scope) {
        this.requireAuth();
        if (!this.hasScope(scope)) {
            throw Object.assign(new Error(`Scope required: ${scope}`), { status: 403, code: 'FORBIDDEN' });
        }
    }
    setPartition(partitionName, partitionFields) {
        this._partitionFilters.push({ partitionName, partitionFields });
    }
    getPartitionFilters() {
        return this._partitionFilters;
    }
    clearPartitionFilters() {
        this._partitionFilters = [];
    }
    hasPartitionFilters() {
        return this._partitionFilters.length > 0;
    }
}
export function withContext(handler, options = {}) {
    return async (c) => {
        const legacyContext = c.get('customRouteContext') || {};
        const { database, resource, plugins = {} } = legacyContext;
        const currentResource = options.resource || resource || null;
        const ctx = new RouteContext(c, database, currentResource, plugins);
        return await handler(c, ctx);
    };
}
export function autoWrapHandler(handler, options = {}) {
    if (handler.length === 1) {
        return handler;
    }
    return withContext(handler, options);
}
//# sourceMappingURL=route-context.js.map