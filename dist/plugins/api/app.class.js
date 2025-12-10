/**
 * ApiApp v2 - Explicit builder pattern, no Proxy, deterministic execution
 *
 * Key improvements:
 * - Explicit app.route() instead of Proxy magic
 * - Single RouteContext (ctx) with db/resources/helpers
 * - Deterministic priority queue for guards/middlewares
 * - Schemas compiled at registration (zero runtime work)
 * - app.mountDocs() for integrated documentation
 * - app.group() for route composition
 */
import { Hono } from 'hono';
import Validator from 'fastest-validator';
import { RouteContext } from './route-context.class.js';
const DEFAULT_PRIORITY = 100;
export class ApiApp {
    hono;
    routes;
    guards;
    middlewares;
    validator;
    db;
    resources;
    schemaCache;
    constructor({ db = null, resources = null } = {}) {
        this.hono = new Hono();
        this.routes = [];
        this.guards = new Map();
        this.middlewares = [];
        this.validator = new Validator();
        this.db = db;
        this.resources = resources || db?.resources || {};
        this.schemaCache = new Map();
    }
    route(methodOrPath, pathOrApp, options = {}, handler) {
        if (typeof methodOrPath === 'string' && methodOrPath.startsWith('/')) {
            this.hono.route(methodOrPath, pathOrApp);
            return this;
        }
        const method = methodOrPath;
        const path = pathOrApp;
        const { description = null, summary = null, tags = [], operationId = null, schema = null, requestSchema = null, responseSchema = null, guards = [], protected: protectedFields = [], priority = DEFAULT_PRIORITY } = options;
        const { compiledValidator, openApiRequestSchema, openApiResponseSchema } = this._compileSchemaAtRegistration(schema, requestSchema, responseSchema);
        const route = {
            method: method.toUpperCase(),
            path,
            description,
            summary,
            tags,
            operationId,
            requestSchema: openApiRequestSchema,
            responseSchema: openApiResponseSchema,
            guards,
            protected: protectedFields,
            priority,
            compiledValidator
        };
        const chain = this._buildMiddlewareChain(route, handler);
        route.handlers = chain;
        this.routes.push(route);
        const methodLower = method.toLowerCase();
        this.hono[methodLower](path, ...chain);
        return this;
    }
    get(path, options, handler) {
        if (typeof options === 'function') {
            handler = options;
            options = {};
        }
        return this.route('GET', path, options, handler);
    }
    post(path, options, handler) {
        if (typeof options === 'function') {
            handler = options;
            options = {};
        }
        return this.route('POST', path, options, handler);
    }
    put(path, options, handler) {
        if (typeof options === 'function') {
            handler = options;
            options = {};
        }
        return this.route('PUT', path, options, handler);
    }
    patch(path, options, handler) {
        if (typeof options === 'function') {
            handler = options;
            options = {};
        }
        return this.route('PATCH', path, options, handler);
    }
    delete(path, options, handler) {
        if (typeof options === 'function') {
            handler = options;
            options = {};
        }
        return this.route('DELETE', path, options, handler);
    }
    use(pathOrMiddleware, middlewareOrOptions, maybeOptions = {}) {
        const isPathSignature = typeof pathOrMiddleware === 'string';
        const middleware = isPathSignature ? middlewareOrOptions : pathOrMiddleware;
        const options = isPathSignature ? maybeOptions : middlewareOrOptions || {};
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }
        const { priority = DEFAULT_PRIORITY, name = null } = options || {};
        this.middlewares.push({
            fn: middleware,
            priority,
            name: name || `middleware_${this.middlewares.length}`
        });
        this.middlewares.sort((a, b) => a.priority - b.priority);
        return this;
    }
    guard(name, guardFn, { priority = DEFAULT_PRIORITY } = {}) {
        if (this.guards.has(name)) {
            throw new Error(`Guard '${name}' already registered`);
        }
        this.guards.set(name, { fn: guardFn, priority });
        return this;
    }
    group(basePath, options = {}) {
        const { tags = [], guards = [], priority = DEFAULT_PRIORITY } = options;
        return {
            route: (method, path, routeOptions, handler) => {
                const fullPath = `${basePath}${path}`;
                const mergedOptions = {
                    ...routeOptions,
                    tags: [...tags, ...(routeOptions.tags || [])],
                    guards: [...guards, ...(routeOptions.guards || [])],
                    priority: routeOptions.priority ?? priority
                };
                return this.route(method, fullPath, mergedOptions, handler);
            },
            get: (path, options, handler) => {
                const fullPath = `${basePath}${path}`;
                if (typeof options === 'function') {
                    handler = options;
                    options = {};
                }
                return this.route('GET', fullPath, {
                    ...options,
                    tags: [...tags, ...(options.tags || [])],
                    guards: [...guards, ...(options.guards || [])]
                }, handler);
            },
            post: (path, options, handler) => {
                const fullPath = `${basePath}${path}`;
                if (typeof options === 'function') {
                    handler = options;
                    options = {};
                }
                return this.route('POST', fullPath, {
                    ...options,
                    tags: [...tags, ...(options.tags || [])],
                    guards: [...guards, ...(options.guards || [])]
                }, handler);
            },
            put: (path, options, handler) => {
                const fullPath = `${basePath}${path}`;
                if (typeof options === 'function') {
                    handler = options;
                    options = {};
                }
                return this.route('PUT', fullPath, {
                    ...options,
                    tags: [...tags, ...(options.tags || [])],
                    guards: [...guards, ...(options.guards || [])]
                }, handler);
            },
            patch: (path, options, handler) => {
                const fullPath = `${basePath}${path}`;
                if (typeof options === 'function') {
                    handler = options;
                    options = {};
                }
                return this.route('PATCH', fullPath, {
                    ...options,
                    tags: [...tags, ...(options.tags || [])],
                    guards: [...guards, ...(options.guards || [])]
                }, handler);
            },
            delete: (path, options, handler) => {
                const fullPath = `${basePath}${path}`;
                if (typeof options === 'function') {
                    handler = options;
                    options = {};
                }
                return this.route('DELETE', fullPath, {
                    ...options,
                    tags: [...tags, ...(options.tags || [])],
                    guards: [...guards, ...(options.guards || [])]
                }, handler);
            }
        };
    }
    mountDocs(options = {}) {
        const { title = 'API Documentation', version = '1.0.0', description = 'Auto-generated API documentation', servers = [], jsonPath = '/openapi.json', htmlPath = '/docs', includeCodeSamples = true } = options;
        this.get(jsonPath, {}, (ctx) => {
            const spec = this._generateOpenAPISpec({
                title,
                version,
                description,
                servers,
                includeCodeSamples
            });
            return ctx.json(spec);
        });
        this.get(htmlPath, {}, (ctx) => {
            const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <redoc spec-url='${jsonPath}'></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;
            return ctx.html(html);
        });
        return this;
    }
    getRoutes() {
        return this.routes;
    }
    get fetch() {
        return this.hono.fetch.bind(this.hono);
    }
    onError(handler) {
        this.hono.onError(handler);
        return this;
    }
    notFound(handler) {
        this.hono.notFound(handler);
        return this;
    }
    async generateOpenAPI(info = {}) {
        return this._generateOpenAPISpec({
            title: info.title || 'API Documentation',
            version: info.version || '1.0.0',
            description: info.description || 'Auto-generated API documentation',
            servers: info.servers || [],
            includeCodeSamples: info.includeCodeSamples !== undefined ? info.includeCodeSamples : true
        });
    }
    groupWithCallback(basePath, optionsOrCallback, callback) {
        let options = {};
        let cb = callback;
        if (typeof optionsOrCallback === 'function') {
            cb = optionsOrCallback;
        }
        else {
            options = optionsOrCallback || {};
        }
        const groupProxy = this.group(basePath, options);
        if (cb) {
            cb(groupProxy);
        }
        return this;
    }
    crud(resourceName, handlers, options = {}) {
        const { tags = [resourceName], guards = [], schemas = {}, basePath = `/${resourceName}` } = options;
        if (handlers.list) {
            this.get(basePath, {
                description: `List ${resourceName}`,
                summary: `Get all ${resourceName}`,
                tags,
                guards,
                operationId: `list_${resourceName}`,
                schema: schemas.list
            }, handlers.list);
        }
        if (handlers.get) {
            this.get(`${basePath}/:id`, {
                description: `Get ${resourceName} by ID`,
                summary: `Get single ${resourceName}`,
                tags,
                guards,
                operationId: `get_${resourceName}`,
                schema: schemas.get
            }, handlers.get);
        }
        if (handlers.create) {
            this.post(basePath, {
                description: `Create ${resourceName}`,
                summary: `Create new ${resourceName}`,
                tags,
                guards,
                operationId: `create_${resourceName}`,
                schema: schemas.create
            }, handlers.create);
        }
        if (handlers.update) {
            this.put(`${basePath}/:id`, {
                description: `Update ${resourceName}`,
                summary: `Update ${resourceName} by ID`,
                tags,
                guards,
                operationId: `update_${resourceName}`,
                schema: schemas.update
            }, handlers.update);
        }
        if (handlers.patch) {
            this.patch(`${basePath}/:id`, {
                description: `Partially update ${resourceName}`,
                summary: `Patch ${resourceName} by ID`,
                tags,
                guards,
                operationId: `patch_${resourceName}`,
                schema: schemas.patch || schemas.update
            }, handlers.patch);
        }
        if (handlers.delete) {
            this.delete(`${basePath}/:id`, {
                description: `Delete ${resourceName}`,
                summary: `Delete ${resourceName} by ID`,
                tags,
                guards,
                operationId: `delete_${resourceName}`
            }, handlers.delete);
        }
        return this;
    }
    health(path = '/health', options = {}) {
        const { checker = null } = options;
        this.get(path, {
            description: 'Health check endpoint',
            tags: ['Health'],
            operationId: 'health_check'
        }, async (ctx) => {
            let healthy = true;
            const checks = {};
            if (checker && typeof checker === 'function') {
                try {
                    const result = await checker(ctx);
                    healthy = result.healthy !== false;
                    Object.assign(checks, result.checks || {});
                }
                catch (err) {
                    healthy = false;
                    checks.error = err.message;
                }
            }
            const response = {
                status: healthy ? 'ok' : 'error',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                ...checks
            };
            return ctx.json(response, healthy ? 200 : 503);
        });
        return this;
    }
    _compileSchemaAtRegistration(schema, requestSchema, responseSchema) {
        let compiledValidator = null;
        let openApiRequestSchema = requestSchema;
        let openApiResponseSchema = responseSchema;
        if (schema) {
            const schemaKey = JSON.stringify(schema);
            if (this.schemaCache.has(schemaKey)) {
                const cached = this.schemaCache.get(schemaKey);
                compiledValidator = cached.validator;
                openApiRequestSchema = cached.openApi;
            }
            else {
                try {
                    compiledValidator = this.validator.compile(schema);
                }
                catch (err) {
                    console.warn('Failed to compile schema:', err);
                }
                openApiRequestSchema = this._fvToOpenApi(schema);
                this.schemaCache.set(schemaKey, {
                    validator: compiledValidator,
                    openApi: openApiRequestSchema
                });
            }
        }
        return { compiledValidator, openApiRequestSchema, openApiResponseSchema };
    }
    _buildMiddlewareChain(route, handler) {
        const chain = [];
        chain.push(async (c, next) => {
            const ctx = new RouteContext(c, { db: this.db, resources: this.resources });
            c.set('ctx', ctx);
            c.db = this.db;
            c.database = this.db;
            c.resources = this.resources;
            c.set('customRouteContext', {
                db: this.db,
                database: this.db,
                resources: this.resources,
                resource: null
            });
            await next();
        });
        if (route.compiledValidator) {
            chain.push(this._createValidationMiddleware(route));
        }
        if (route.guards && route.guards.length > 0) {
            const guardsWithPriority = route.guards.map(guardName => {
                const guard = this.guards.get(guardName);
                if (!guard) {
                    throw new Error(`Guard '${guardName}' not registered`);
                }
                return { name: guardName, ...guard };
            });
            guardsWithPriority.sort((a, b) => a.priority - b.priority);
            chain.push(this._createGuardsMiddleware(guardsWithPriority));
        }
        for (const mw of this.middlewares) {
            chain.push(mw.fn);
        }
        chain.push(async (c) => {
            const ctx = c.get('ctx');
            try {
                return await handler(ctx);
            }
            catch (err) {
                return ctx.serverError(err.message, { details: { stack: err.stack } });
            }
        });
        return chain;
    }
    _createValidationMiddleware(route) {
        const validator = route.compiledValidator;
        const method = route.method;
        return async (c, next) => {
            const ctx = c.get('ctx');
            let data;
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
                data = await ctx.body().catch(() => ({}));
            }
            else {
                data = ctx.query();
            }
            const valid = validator(data);
            if (valid !== true) {
                const errors = Array.isArray(valid) ? valid : [valid];
                return ctx.validationError('Validation failed', errors);
            }
            await next();
        };
    }
    _createGuardsMiddleware(guards) {
        return async (c, next) => {
            const ctx = c.get('ctx');
            for (const guard of guards) {
                try {
                    const result = await guard.fn(ctx, { db: this.db, resources: this.resources });
                    if (result === false) {
                        return ctx.forbidden('Access denied by guard');
                    }
                    if (result && typeof result === 'object') {
                        ctx.set('guardFilter', result);
                    }
                }
                catch (err) {
                    return ctx.forbidden(err.message);
                }
            }
            await next();
        };
    }
    _fvToOpenApi(schema) {
        const result = {
            type: 'object',
            properties: {},
            required: []
        };
        for (const [key, rule] of Object.entries(schema || {})) {
            const parsed = this._parseRule(rule);
            result.properties[key] = parsed.schema;
            if (parsed.required) {
                result.required.push(key);
            }
        }
        if (result.required.length === 0) {
            delete result.required;
        }
        return result;
    }
    _parseRule(rule) {
        if (typeof rule === 'string') {
            const parts = rule.split('|');
            const base = parts[0] || 'string';
            const required = parts.includes('required');
            const schema = this._mapType(base);
            parts.forEach((p) => {
                if (p.startsWith('min:')) {
                    const value = Number(p.split(':')[1]);
                    if (schema.type === 'number' || schema.type === 'integer') {
                        schema.minimum = value;
                    }
                    else {
                        schema.minLength = value;
                    }
                }
                if (p.startsWith('max:')) {
                    const value = Number(p.split(':')[1]);
                    if (schema.type === 'number' || schema.type === 'integer') {
                        schema.maximum = value;
                    }
                    else {
                        schema.maxLength = value;
                    }
                }
                if (p.startsWith('pattern:')) {
                    schema.pattern = p.substring(8);
                }
                if (p === 'email') {
                    schema.format = 'email';
                }
                if (p === 'url') {
                    schema.format = 'uri';
                }
                if (p === 'uuid' || p === 'uuidv4') {
                    schema.format = 'uuid';
                }
            });
            return { schema, required };
        }
        if (rule && typeof rule === 'object') {
            const ruleObj = rule;
            if (ruleObj.type === 'object' && ruleObj.props) {
                const nested = this._fvToOpenApi(ruleObj.props);
                return {
                    schema: { ...nested, type: 'object' },
                    required: ruleObj.optional !== true
                };
            }
            if (ruleObj.type === 'array' && ruleObj.items) {
                const nested = this._parseRule(ruleObj.items);
                return {
                    schema: { type: 'array', items: nested.schema },
                    required: ruleObj.optional !== true
                };
            }
            const schema = this._mapType(ruleObj.type || 'string');
            if (ruleObj.enum)
                schema.enum = ruleObj.enum;
            if (typeof ruleObj.min === 'number')
                schema.minimum = ruleObj.min;
            if (typeof ruleObj.max === 'number')
                schema.maximum = ruleObj.max;
            if (typeof ruleObj.minLength === 'number')
                schema.minLength = ruleObj.minLength;
            if (typeof ruleObj.maxLength === 'number')
                schema.maxLength = ruleObj.maxLength;
            if (ruleObj.pattern)
                schema.pattern = ruleObj.pattern;
            if (ruleObj.default !== undefined)
                schema.default = ruleObj.default;
            return {
                schema,
                required: ruleObj.optional !== true
            };
        }
        return { schema: { type: 'string' }, required: false };
    }
    _mapType(type) {
        const typeMap = {
            'string': { type: 'string' },
            'number': { type: 'number' },
            'integer': { type: 'integer' },
            'boolean': { type: 'boolean' },
            'email': { type: 'string', format: 'email' },
            'url': { type: 'string', format: 'uri' },
            'ip4': { type: 'string', format: 'ipv4' },
            'ip6': { type: 'string', format: 'ipv6' },
            'uuid': { type: 'string', format: 'uuid' },
            'date': { type: 'string', format: 'date-time' },
            'secret': { type: 'string', format: 'password' },
            'embedding': { type: 'array', items: { type: 'number' } },
            'array': { type: 'array', items: { type: 'string' } },
            'object': { type: 'object' }
        };
        return typeMap[type] || { type: 'string' };
    }
    _generateOpenAPISpec(params) {
        const { title, version, description, servers = [], includeCodeSamples = true } = params;
        const spec = {
            openapi: '3.1.0',
            info: { title, version, description },
            servers: servers.length > 0 ? servers : [
                { url: 'http://localhost:3000', description: 'Development server' }
            ],
            paths: {},
            components: {
                schemas: {},
                securitySchemes: {}
            }
        };
        const hasAuthGuards = this.routes.some(r => r.guards && r.guards.length > 0);
        if (hasAuthGuards) {
            spec.components.securitySchemes = {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                },
                apiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key'
                }
            };
        }
        for (const route of this.routes) {
            const path = route.path.replace(/:([^/]+)/g, '{$1}');
            if (!spec.paths[path]) {
                spec.paths[path] = {};
            }
            const operation = {
                summary: route.summary || route.description || `${route.method} ${route.path}`,
                description: route.description,
                operationId: route.operationId || `${route.method.toLowerCase()}_${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
                tags: route.tags && route.tags.length > 0 ? route.tags : ['Default']
            };
            if (route.guards && route.guards.length > 0) {
                operation.security = [
                    { bearerAuth: [] },
                    { apiKey: [] }
                ];
            }
            if (['POST', 'PUT', 'PATCH'].includes(route.method) && route.requestSchema) {
                operation.requestBody = {
                    required: true,
                    content: {
                        'application/json': {
                            schema: route.requestSchema,
                            examples: {
                                default: {
                                    summary: 'Example request',
                                    value: this._generateExampleFromSchema(route.requestSchema)
                                }
                            }
                        }
                    }
                };
            }
            if (['GET', 'DELETE'].includes(route.method) && route.requestSchema) {
                operation.parameters = this._generateParametersFromSchema(route.requestSchema);
            }
            operation.responses = this._generateAllResponses(route);
            if (includeCodeSamples) {
                const baseUrl = servers[0]?.url || 'http://localhost:3000';
                operation['x-codeSamples'] = this._generateCodeSamples(route, baseUrl);
            }
            spec.paths[path][route.method.toLowerCase()] = operation;
        }
        return spec;
    }
    _generateAllResponses(route) {
        const responses = {};
        responses['200'] = {
            description: 'Successful response',
            content: {
                'application/json': {
                    schema: route.responseSchema || {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean', example: true },
                            data: { type: 'object' }
                        }
                    }
                }
            }
        };
        if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
            responses['400'] = {
                description: 'Bad request',
                content: {
                    'application/json': {
                        schema: this._errorSchema()
                    }
                }
            };
        }
        if (route.guards && route.guards.length > 0) {
            responses['401'] = {
                description: 'Authentication required',
                content: {
                    'application/json': {
                        schema: this._errorSchema()
                    }
                }
            };
            responses['403'] = {
                description: 'Insufficient permissions',
                content: {
                    'application/json': {
                        schema: this._errorSchema()
                    }
                }
            };
        }
        if (route.path.includes(':id')) {
            responses['404'] = {
                description: 'Resource not found',
                content: {
                    'application/json': {
                        schema: this._errorSchema()
                    }
                }
            };
        }
        if (route.compiledValidator) {
            responses['422'] = {
                description: 'Validation failed',
                content: {
                    'application/json': {
                        schema: this._errorSchema(true)
                    }
                }
            };
        }
        responses['500'] = {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: this._errorSchema()
                }
            }
        };
        return responses;
    }
    _errorSchema(includeDetails = false) {
        const schema = {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: false },
                error: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                        code: { type: 'string' },
                        status: { type: 'integer' }
                    }
                }
            }
        };
        if (includeDetails) {
            schema.properties.error.properties.details = {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        field: { type: 'string' },
                        message: { type: 'string' },
                        type: { type: 'string' }
                    }
                }
            };
        }
        return schema;
    }
    _generateParametersFromSchema(schema) {
        if (!schema || !schema.properties)
            return [];
        const parameters = [];
        const required = schema.required || [];
        for (const [key, prop] of Object.entries(schema.properties)) {
            parameters.push({
                name: key,
                in: 'query',
                required: required.includes(key),
                schema: prop,
                description: prop.description || `${key} parameter`
            });
        }
        return parameters;
    }
    _generateCodeSamples(route, baseUrl) {
        const url = `${baseUrl}${route.path}`;
        const bodyExample = route.requestSchema
            ? JSON.stringify(this._generateExampleFromSchema(route.requestSchema), null, 2)
            : null;
        const authHeader = route.guards && route.guards.length > 0
            ? '\n  -H "Authorization: Bearer <token>"'
            : '';
        const curlSample = [
            `curl -X ${route.method}`,
            `  "${url}"`,
            '  -H "Content-Type: application/json"',
            authHeader.trim() ? `  ${authHeader.trim()}` : '',
            bodyExample ? `  -d '${bodyExample}'` : ''
        ].filter(Boolean).join('\n');
        return [
            { lang: 'cURL', source: curlSample }
        ];
    }
    _generateExampleFromSchema(schema) {
        if (!schema || typeof schema !== 'object')
            return {};
        if (schema.example !== undefined)
            return schema.example;
        if (schema.type === 'array' && schema.items) {
            return [this._generateExampleFromSchema(schema.items)];
        }
        if (schema.type === 'object' && schema.properties) {
            const example = {};
            for (const [key, prop] of Object.entries(schema.properties)) {
                example[key] = this._generateExampleFromSchema(prop);
            }
            return example;
        }
        const type = schema.type || 'string';
        if (type === 'string') {
            if (schema.format === 'email')
                return 'user@example.com';
            if (schema.format === 'uuid')
                return '00000000-0000-4000-8000-000000000000';
            if (schema.format === 'date-time')
                return new Date().toISOString();
            return schema.example || 'example';
        }
        if (type === 'integer' || type === 'number') {
            const min = schema.minimum ?? 0;
            const max = schema.maximum ?? min + 100;
            return schema.example ?? Math.max(min, Math.min(max, min + 1));
        }
        if (type === 'boolean') {
            return schema.example ?? true;
        }
        return schema.example ?? {};
    }
}
//# sourceMappingURL=app.class.js.map