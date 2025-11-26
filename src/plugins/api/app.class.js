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
  constructor({ db = null, resources = null } = {}) {
    this.hono = new Hono();
    this.routes = [];
    this.guards = new Map();
    this.middlewares = [];
    this.validator = new Validator();
    this.db = db;
    this.resources = resources || db?.resources || {};

    // Compile cache for schemas
    this.schemaCache = new Map();
  }

  /**
   * Explicit route registration
   * @param {string} method - HTTP method (GET, POST, PUT, PATCH, DELETE)
   * @param {string} path - Route path
   * @param {Object} options - Route options (meta, schema, guards, priority)
   * @param {Function} handler - Route handler (receives RouteContext)
   */
  route(method, path, options = {}, handler) {
    const {
      description = null,
      summary = null,
      tags = [],
      operationId = null,
      schema = null,
      requestSchema = null,
      responseSchema = null,
      guards = [],
      protected: protectedFields = [],
      priority = DEFAULT_PRIORITY
    } = options;

    // Compile schema at registration time (not at runtime!)
    const { compiledValidator, openApiRequestSchema, openApiResponseSchema } =
      this._compileSchemaAtRegistration(schema, requestSchema, responseSchema);

    // Register route metadata
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

    // Build middleware chain (deterministic order)
    const chain = this._buildMiddlewareChain(route, handler);
    route.handlers = chain;

    this.routes.push(route);

    // Register with Hono
    const methodLower = method.toLowerCase();
    this.hono[methodLower](path, ...chain);

    return this;
  }

  // Convenience methods
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

  /**
   * Register global middleware with priority
   */
  use(middleware, { priority = DEFAULT_PRIORITY, name = null } = {}) {
    this.middlewares.push({
      fn: middleware,
      priority,
      name: name || `middleware_${this.middlewares.length}`
    });

    // Sort by priority (lower number = higher priority)
    this.middlewares.sort((a, b) => a.priority - b.priority);

    return this;
  }

  /**
   * Register named guard
   */
  guard(name, guardFn, { priority = DEFAULT_PRIORITY } = {}) {
    if (this.guards.has(name)) {
      throw new Error(`Guard '${name}' already registered`);
    }

    this.guards.set(name, { fn: guardFn, priority });
    return this;
  }

  /**
   * Create route group with shared metadata/guards
   */
  group(basePath, options = {}) {
    const {
      tags = [],
      guards = [],
      priority = DEFAULT_PRIORITY
    } = options;

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
        return this.route('GET', fullPath, { ...options, tags: [...tags, ...(options.tags || [])], guards: [...guards, ...(options.guards || [])] }, handler);
      },

      post: (path, options, handler) => {
        const fullPath = `${basePath}${path}`;
        if (typeof options === 'function') {
          handler = options;
          options = {};
        }
        return this.route('POST', fullPath, { ...options, tags: [...tags, ...(options.tags || [])], guards: [...guards, ...(options.guards || [])] }, handler);
      },

      put: (path, options, handler) => {
        const fullPath = `${basePath}${path}`;
        if (typeof options === 'function') {
          handler = options;
          options = {};
        }
        return this.route('PUT', fullPath, { ...options, tags: [...tags, ...(options.tags || [])], guards: [...guards, ...(options.guards || [])] }, handler);
      },

      patch: (path, options, handler) => {
        const fullPath = `${basePath}${path}`;
        if (typeof options === 'function') {
          handler = options;
          options = {};
        }
        return this.route('PATCH', fullPath, { ...options, tags: [...tags, ...(options.tags || [])], guards: [...guards, ...(options.guards || [])] }, handler);
      },

      delete: (path, options, handler) => {
        const fullPath = `${basePath}${path}`;
        if (typeof options === 'function') {
          handler = options;
          options = {};
        }
        return this.route('DELETE', fullPath, { ...options, tags: [...tags, ...(options.tags || [])], guards: [...guards, ...(options.guards || [])] }, handler);
      }
    };
  }

  /**
   * Mount documentation endpoints
   */
  mountDocs(options = {}) {
    const {
      title = 'API Documentation',
      version = '1.0.0',
      description = 'Auto-generated API documentation',
      servers = [],
      jsonPath = '/openapi.json',
      htmlPath = '/docs',
      includeCodeSamples = true
    } = options;

    // JSON endpoint - generates spec on request to reflect new routes
    this.get(jsonPath, {}, async (ctx) => {
      const spec = await this._generateOpenAPISpec({
        title,
        version,
        description,
        servers,
        includeCodeSamples
      });
      return ctx.json(spec);
    });

    // HTML endpoint (Redoc UI)
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

  /**
   * Get all registered routes
   */
  getRoutes() {
    return this.routes;
  }

  /**
   * Access to underlying Hono instance
   */
  get fetch() {
    return this.hono.fetch.bind(this.hono);
  }

  onError(handler) {
    return this.hono.onError(handler);
  }

  notFound(handler) {
    return this.hono.notFound(handler);
  }

  /**
   * Generate OpenAPI spec (public API)
   * Useful for external integrations or custom documentation
   */
  async generateOpenAPI(info = {}) {
    return await this._generateOpenAPISpec({
      title: info.title || 'API Documentation',
      version: info.version || '1.0.0',
      description: info.description || 'Auto-generated API documentation'
    });
  }

  /**
   * Alternative group() syntax with callback (for better DX)
   * @param {string} basePath - Base path for group
   * @param {Object|Function} optionsOrCallback - Options object or callback function
   * @param {Function} [callback] - Callback function (if options provided)
   *
   * Usage:
   *   app.groupWithCallback('/admin', { tags: ['Admin'] }, (admin) => {
   *     admin.get('/stats', {}, handler);
   *   });
   *
   *   OR
   *
   *   app.groupWithCallback('/admin', (admin) => {
   *     admin.get('/stats', {}, handler);
   *   });
   */
  groupWithCallback(basePath, optionsOrCallback, callback) {
    let options = {};
    let cb = callback;

    // Handle both signatures
    if (typeof optionsOrCallback === 'function') {
      cb = optionsOrCallback;
    } else {
      options = optionsOrCallback || {};
    }

    // Create group proxy
    const groupProxy = this.group(basePath, options);

    // Execute callback with group proxy
    if (cb) {
      cb(groupProxy);
    }

    return this;
  }

  /**
   * Helper: Create CRUD routes for a resource (DX sugar)
   * @param {string} resourceName - Resource name (e.g., 'users')
   * @param {Object} handlers - CRUD handlers { list, get, create, update, delete }
   * @param {Object} options - Shared options (tags, guards, schemas)
   *
   * Usage:
   *   app.crud('users', {
   *     list: async (ctx) => ctx.success({ data: await ctx.db.resources.users.list() }),
   *     get: async (ctx) => ctx.success({ data: await ctx.db.resources.users.get(ctx.param('id')) }),
   *     create: async (ctx) => ctx.success({ data: await ctx.db.resources.users.insert(await ctx.body()) }),
   *     update: async (ctx) => ctx.success({ data: await ctx.db.resources.users.update(ctx.param('id'), await ctx.body()) }),
   *     delete: async (ctx) => ctx.success({ data: await ctx.db.resources.users.delete(ctx.param('id')) })
   *   }, {
   *     tags: ['Users'],
   *     guards: ['isAuthenticated'],
   *     schemas: {
   *       create: { email: 'string|required|email', name: 'string|required' },
   *       update: { email: 'string|email', name: 'string' }
   *     }
   *   });
   */
  crud(resourceName, handlers, options = {}) {
    const {
      tags = [resourceName],
      guards = [],
      schemas = {},
      basePath = `/${resourceName}`
    } = options;

    // LIST
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

    // GET
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

    // CREATE
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

    // UPDATE
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

    // PATCH
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

    // DELETE
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

  /**
   * Helper: Add health check endpoint (DX sugar)
   */
  health(path = '/health', options = {}) {
    const { checker = null } = options;

    this.get(path, {
      description: 'Health check endpoint',
      tags: ['Health'],
      operationId: 'health_check'
    }, async (ctx) => {
      let healthy = true;
      const checks = {};

      // Run custom health checker if provided
      if (checker && typeof checker === 'function') {
        try {
          const result = await checker(ctx);
          healthy = result.healthy !== false;
          Object.assign(checks, result.checks || {});
        } catch (err) {
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

  // ========== PRIVATE METHODS ==========

  /**
   * Compile schema at registration time (not runtime!)
   */
  _compileSchemaAtRegistration(schema, requestSchema, responseSchema) {
    let compiledValidator = null;
    let openApiRequestSchema = requestSchema;
    let openApiResponseSchema = responseSchema;

    if (schema) {
      const schemaKey = JSON.stringify(schema);

      // Check cache
      if (this.schemaCache.has(schemaKey)) {
        const cached = this.schemaCache.get(schemaKey);
        compiledValidator = cached.validator;
        openApiRequestSchema = cached.openApi;
      } else {
        // Compile FV validator
        try {
          compiledValidator = this.validator.compile(schema);
        } catch (err) {
          console.warn('Failed to compile schema:', err);
        }

        // Convert to OpenAPI
        openApiRequestSchema = this._fvToOpenApi(schema);

        // Cache
        this.schemaCache.set(schemaKey, {
          validator: compiledValidator,
          openApi: openApiRequestSchema
        });
      }
    }

    return { compiledValidator, openApiRequestSchema, openApiResponseSchema };
  }

  /**
   * Build middleware chain in deterministic order
   */
  _buildMiddlewareChain(route, handler) {
    const chain = [];

    // 1. RouteContext injection + compatibility layer (always first)
    chain.push(async (c, next) => {
      const ctx = new RouteContext(c, { db: this.db, resources: this.resources });
      c.set('ctx', ctx);

      // Compatibility: inject db/database/resources directly on Hono context
      c.db = this.db;
      c.database = this.db;
      c.resources = this.resources;

      // Compatibility: customRouteContext (with both db/database and resources/resource)
      c.set('customRouteContext', {
        db: this.db,
        database: this.db,      // Alias for db
        resources: this.resources,
        resource: null          // Legacy compatibility (set by withContext if needed)
      });

      await next();
    });

    // 2. Validation middleware (if schema exists)
    if (route.compiledValidator) {
      chain.push(this._createValidationMiddleware(route));
    }

    // 3. Guards (sorted by priority)
    if (route.guards && route.guards.length > 0) {
      const guardsWithPriority = route.guards.map(guardName => {
        const guard = this.guards.get(guardName);
        if (!guard) {
          throw new Error(`Guard '${guardName}' not registered`);
        }
        return { name: guardName, ...guard };
      });

      // Sort by priority
      guardsWithPriority.sort((a, b) => a.priority - b.priority);

      // Add guard middleware
      chain.push(this._createGuardsMiddleware(guardsWithPriority));
    }

    // 4. Global middlewares (already sorted by priority)
    for (const mw of this.middlewares) {
      chain.push(mw.fn);
    }

    // 5. Final handler (wrapped with RouteContext)
    chain.push(async (c) => {
      const ctx = c.get('ctx');
      try {
        return await handler(ctx);
      } catch (err) {
        return ctx.serverError(err.message, { details: { stack: err.stack } });
      }
    });

    return chain;
  }

  /**
   * Create validation middleware (body vs query separation)
   */
  _createValidationMiddleware(route) {
    const validator = route.compiledValidator;
    const method = route.method;

    return async (c, next) => {
      const ctx = c.get('ctx');
      let data;

      // Separate body vs query based on method
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        // Body data for mutations
        data = await ctx.body().catch(() => ({}));
      } else {
        // Query params for queries
        data = ctx.query();
      }

      const valid = validator(data);

      if (valid !== true) {
        const errors = Array.isArray(valid) ? valid : validator.errors || [valid];
        return ctx.validationError('Validation failed', errors);
      }

      await next();
    };
  }

  /**
   * Create guards middleware
   */
  _createGuardsMiddleware(guards) {
    return async (c, next) => {
      const ctx = c.get('ctx');

      for (const guard of guards) {
        try {
          const result = await guard.fn(ctx, { db: this.db, resources: this.resources });

          if (result === false) {
            return ctx.forbidden('Access denied by guard');
          }

          // Guard can return filter for list operations
          if (result && typeof result === 'object') {
            ctx.set('guardFilter', result);
          }
        } catch (err) {
          return ctx.forbidden(err.message);
        }
      }

      await next();
    };
  }

  /**
   * Convert FV schema to OpenAPI (improved version)
   */
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
    // String shorthand
    if (typeof rule === 'string') {
      const parts = rule.split('|');
      const base = parts[0];
      const required = parts.includes('required');
      const schema = this._mapType(base);

      // Parse constraints
      parts.forEach((p) => {
        if (p.startsWith('min:')) {
          const value = Number(p.split(':')[1]);
          if (schema.type === 'number' || schema.type === 'integer') {
            schema.minimum = value;
          } else {
            schema.minLength = value;
          }
        }
        if (p.startsWith('max:')) {
          const value = Number(p.split(':')[1]);
          if (schema.type === 'number' || schema.type === 'integer') {
            schema.maximum = value;
          } else {
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

    // Object format
    if (rule && typeof rule === 'object') {
      // Nested object
      if (rule.type === 'object' && rule.props) {
        const nested = this._fvToOpenApi(rule.props);
        return {
          schema: { type: 'object', ...nested },
          required: rule.optional !== true
        };
      }

      // Array
      if (rule.type === 'array' && rule.items) {
        const nested = this._parseRule(rule.items);
        return {
          schema: { type: 'array', items: nested.schema },
          required: rule.optional !== true
        };
      }

      const schema = this._mapType(rule.type || 'string');

      if (rule.enum) schema.enum = rule.enum;
      if (typeof rule.min === 'number') schema.minimum = rule.min;
      if (typeof rule.max === 'number') schema.maximum = rule.max;
      if (typeof rule.minLength === 'number') schema.minLength = rule.minLength;
      if (typeof rule.maxLength === 'number') schema.maxLength = rule.maxLength;
      if (rule.pattern) schema.pattern = rule.pattern;
      if (rule.default !== undefined) schema.default = rule.default;

      return {
        schema,
        required: rule.optional !== true
      };
    }

    return { schema: { type: 'string' }, required: false };
  }

  /**
   * Map FV types to OpenAPI (expanded)
   */
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

  /**
   * Generate OpenAPI spec (enhanced with code samples and all errors)
   */
  async _generateOpenAPISpec({ title, version, description, servers = [], includeCodeSamples = true }) {
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

    // Add security schemes if guards are used
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

      // Build operation
      const operation = {
        summary: route.summary || route.description || `${route.method} ${route.path}`,
        description: route.description,
        operationId: route.operationId || `${route.method.toLowerCase()}_${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
        tags: route.tags && route.tags.length > 0 ? route.tags : ['Default']
      };

      // Add security if route has guards
      if (route.guards && route.guards.length > 0) {
        operation.security = [
          { bearerAuth: [] },
          { apiKey: [] }
        ];
      }

      // Add request body for mutations
      if (['POST', 'PUT', 'PATCH'].includes(route.method) && route.requestSchema) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: route.requestSchema,
              examples: {
                default: {
                  summary: 'Example request',
                  value: await this._generateExampleFromSchema(route.requestSchema)
                }
              }
            }
          }
        };
      }

      // Add query parameters for GET/DELETE
      if (['GET', 'DELETE'].includes(route.method) && route.requestSchema) {
        operation.parameters = this._generateParametersFromSchema(route.requestSchema);
      }

      // Build responses with ALL possible errors
      operation.responses = await this._generateAllResponses(route);

      // Add code samples if requested
      if (includeCodeSamples) {
        const baseUrl = servers[0]?.url || 'http://localhost:3000';
        operation['x-codeSamples'] = await this._generateCodeSamples(route, baseUrl);
      }

      spec.paths[path][route.method.toLowerCase()] = operation;
    }

    return spec;
  }

  /**
   * Generate ALL possible responses for a route
   */
  async _generateAllResponses(route) {
    const responses = {};

    // 200 - Success
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
          },
          examples: {
            success: {
              summary: 'Successful response',
              value: route.responseSchema
                ? await this._generateExampleFromSchema(route.responseSchema)
                : { success: true, data: {} }
            }
          }
        }
      }
    };

    // 400 - Bad Request (for POST/PUT/PATCH)
    if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
      responses['400'] = {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: this._errorSchema(),
            examples: {
              badRequest: {
                summary: 'Invalid request format',
                value: {
                  success: false,
                  error: {
                    message: 'Invalid request format',
                    code: 'BAD_REQUEST',
                    status: 400
                  }
                }
              }
            }
          }
        }
      };
    }

    // 401 - Unauthorized (if route has guards)
    if (route.guards && route.guards.length > 0) {
      responses['401'] = {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: this._errorSchema(),
            examples: {
              missingToken: {
                summary: 'Missing authentication token',
                value: {
                  success: false,
                  error: {
                    message: 'Authentication required',
                    code: 'UNAUTHORIZED',
                    status: 401
                  }
                }
              },
              invalidToken: {
                summary: 'Invalid or expired token',
                value: {
                  success: false,
                  error: {
                    message: 'Invalid or expired token',
                    code: 'UNAUTHORIZED',
                    status: 401
                  }
                }
              }
            }
          }
        }
      };

      // 403 - Forbidden
      responses['403'] = {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: this._errorSchema(),
            examples: {
              forbidden: {
                summary: 'Access denied by guard',
                value: {
                  success: false,
                  error: {
                    message: 'Forbidden by guard',
                    code: 'FORBIDDEN',
                    status: 403
                  }
                }
              }
            }
          }
        }
      };
    }

    // 404 - Not Found (for routes with :id parameter)
    if (route.path.includes(':id')) {
      responses['404'] = {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: this._errorSchema(),
            examples: {
              notFound: {
                summary: 'Resource not found',
                value: {
                  success: false,
                  error: {
                    message: 'Resource not found',
                    code: 'NOT_FOUND',
                    status: 404
                  }
                }
              }
            }
          }
        }
      };
    }

    // 422 - Validation Error (if route has schema)
    if (route.compiledValidator) {
      responses['422'] = {
        description: 'Validation failed',
        content: {
          'application/json': {
            schema: this._errorSchema(true),
            examples: {
              validationError: {
                summary: 'Validation error example',
                value: this._generateValidationErrorExample(route.requestSchema)
              }
            }
          }
        }
      };
    }

    // 500 - Internal Server Error (always possible)
    responses['500'] = {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: this._errorSchema(),
          examples: {
            serverError: {
              summary: 'Unexpected server error',
              value: {
                success: false,
                error: {
                  message: 'Internal server error',
                  code: 'INTERNAL_ERROR',
                  status: 500
                }
              }
            }
          }
        }
      }
    };

    return responses;
  }

  /**
   * Generate error schema
   */
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

  /**
   * Generate validation error example from schema
   */
  _generateValidationErrorExample(schema) {
    const errors = [];

    if (schema && schema.properties) {
      const required = schema.required || [];

      // Example: missing required field
      if (required.length > 0) {
        errors.push({
          field: required[0],
          message: `The '${required[0]}' field is required.`,
          type: 'required'
        });
      }

      // Example: invalid format
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop.format === 'email') {
          errors.push({
            field: key,
            message: `The '${key}' field must be a valid email address.`,
            type: 'email',
            expected: 'user@example.com',
            actual: 'invalid-email'
          });
          break;
        }
      }
    }

    return {
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        status: 422,
        details: errors.length > 0 ? errors : [
          {
            field: 'example',
            message: 'Validation constraint not met',
            type: 'validation'
          }
        ]
      }
    };
  }

  /**
   * Generate query parameters from schema
   */
  _generateParametersFromSchema(schema) {
    if (!schema || !schema.properties) return [];

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

  /**
   * Generate code samples for route
   */
  async _generateCodeSamples(route, baseUrl) {
    try {
      const { CodeSamplesGenerator } = await import('./utils/code-samples-generator.js');
      const samples = CodeSamplesGenerator.generate(route, baseUrl);

      return [
        { lang: 'cURL', source: samples.curl },
        { lang: 'Node.js', source: samples.nodejs },
        { lang: 'JavaScript', source: samples.javascript },
        { lang: 'Python', source: samples.python },
        { lang: 'PHP', source: samples.php },
        { lang: 'Go', source: samples.go }
      ];
    } catch (err) {
      console.warn('Could not load CodeSamplesGenerator:', err.message);
      return [];
    }
  }

  async _generateExampleFromSchema(schema) {
    try {
      const { CodeSamplesGenerator } = await import('./utils/code-samples-generator.js');
      return CodeSamplesGenerator.generateExampleFromSchema(schema);
    } catch (err) {
      return {};
    }
  }
}
