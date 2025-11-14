/**
 * Route Context - Enhanced context wrapper for custom routes
 *
 * Provides clean, dev-friendly access to database, resources, and utilities
 * without verbose c.get('customRouteContext').database.resources.xxx
 *
 * @example
 * // Automatic (default behavior)
 * routes: {
 *   '/:id': async (c, ctx) => {
 *     const { db, resources, resource, validator } = ctx;
 *     const url = await resources.urls.get(c.req.param('id'));
 *     return c.json({ url });
 *   }
 * }
 */

/**
 * RouteContext class - provides clean access to database, resources, and helpers
 */
export class RouteContext {
  /**
   * Create RouteContext
   * @param {Object} honoContext - Hono context (c)
   * @param {Object} database - s3db.js Database instance
   * @param {Object} resource - Current resource (for resource-level routes)
   * @param {Object} plugins - Plugin instances
   */
  constructor(honoContext, database, resource = null, plugins = {}) {
    this.c = honoContext;
    this.db = database;
    this.database = database;  // Alias
    this._currentResource = resource;
    this.pluginRegistry = plugins;

    // Create resources proxy for clean access
    this.resources = this._createResourcesProxy();

    // Validator helper
    this.validator = this._createValidator();

    // Current resource shortcut (for resource-level routes)
    this.resource = resource;
  }

  /**
   * Create Proxy for easy resource access
   * @private
   */
  _createResourcesProxy() {
    return new Proxy({}, {
      get: (target, prop) => {
        // Check if resource exists
        if (this.database.resources[prop]) {
          return this.database.resources[prop];
        }

        // Helpful error message
        const available = Object.keys(this.database.resources);
        throw new Error(
          `Resource "${prop}" not found. Available resources: ${available.join(', ')}`
        );
      },

      // List available resources (for debugging)
      ownKeys: () => {
        return Object.keys(this.database.resources);
      },

      // Make resources enumerable
      getOwnPropertyDescriptor: (target, prop) => {
        if (this.database.resources[prop]) {
          return {
            enumerable: true,
            configurable: true
          };
        }
        return undefined;
      }
    });
  }

  /**
   * Create validator helper
   * @private
   */
  _createValidator() {
    const ctx = this;

    return {
      /**
       * Validate data against resource schema
       * @param {string|Object} resourceOrData - Resource name or data object
       * @param {Object} data - Data to validate (if first param is resource name)
       * @returns {Object} { valid: boolean, errors?: Array }
       */
      validate(resourceOrData, data = null) {
        let resource;
        let dataToValidate;

        // Case 1: validate(data) - use current resource (resource-level routes)
        if (typeof resourceOrData === 'object' && data === null) {
          if (!ctx._currentResource) {
            throw new Error('validator.validate(data) requires a current resource. Use validator.validate("resourceName", data) instead.');
          }
          resource = ctx._currentResource;
          dataToValidate = resourceOrData;
        }
        // Case 2: validate("resourceName", data)
        else if (typeof resourceOrData === 'string' && data !== null) {
          resource = ctx.resources[resourceOrData];  // Will throw if not found (via Proxy)
          dataToValidate = data;
        }
        else {
          throw new Error('Invalid arguments. Use validator.validate(data) or validator.validate("resourceName", data)');
        }

        // Run validation via resource schema
        const validation = resource.schema.validate(dataToValidate);

        if (validation === true) {
          return { valid: true };
        } else {
          return {
            valid: false,
            errors: Array.isArray(validation) ? validation : [validation]
          };
        }
      },

      /**
       * Validate and throw if invalid
       * @param {string|Object} resourceOrData - Resource name or data object
       * @param {Object} data - Data to validate
       * @throws {Error} Validation error with details
       */
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

      /**
       * Validate request body against resource schema
       * @param {string} resourceName - Resource name (optional if current resource exists)
       * @returns {Promise<Object>} { valid: boolean, data?: Object, errors?: Array }
       */
      async validateBody(resourceName = null) {
        const body = await ctx.c.req.json();

        if (resourceName) {
          const result = this.validate(resourceName, body);
          return { ...result, data: body };
        } else {
          const result = this.validate(body);
          return { ...result, data: body };
        }
      }
    };
  }

  // ============================================
  // Request Helpers (proxy to Hono context)
  // ============================================

  /**
   * Get path parameter
   * @param {string} name - Parameter name
   * @returns {string} Parameter value
   */
  param(name) {
    return this.c.req.param(name);
  }

  /**
   * Get all path parameters
   * @returns {Object} All parameters
   */
  params() {
    return this.c.req.param();
  }

  /**
   * Get query parameter
   * @param {string} name - Query parameter name
   * @returns {string|undefined} Query value
   */
  query(name) {
    return this.c.req.query(name);
  }

  /**
   * Get all query parameters
   * @returns {Object} All query parameters
   */
  queries() {
    return this.c.req.query();
  }

  /**
   * Get request header
   * @param {string} name - Header name
   * @returns {string|undefined} Header value
   */
  header(name) {
    return this.c.req.header(name);
  }

  /**
   * Parse JSON body
   * @returns {Promise<Object>} Parsed body
   */
  async body() {
    return await this.c.req.json();
  }

  /**
   * Get request body as text
   * @returns {Promise<string>} Body text
   */
  async text() {
    return await this.c.req.text();
  }

  /**
   * Get request body as FormData
   * @returns {Promise<FormData>} FormData
   */
  async formData() {
    return await this.c.req.formData();
  }

  // ============================================
  // Response Helpers (shortcuts)
  // ============================================

  /**
   * Send JSON response
   * @param {Object} data - Response data
   * @param {number} status - HTTP status code
   * @returns {Response} Hono response
   */
  json(data, status = 200) {
    return this.c.json(data, status);
  }

  /**
   * Send success response
   * @param {Object} data - Response data
   * @param {number} status - HTTP status code
   * @returns {Response} Success response
   */
  success(data, status = 200) {
    return this.c.json({
      success: true,
      data
    }, status);
  }

  /**
   * Send error response
   * @param {string} message - Error message
   * @param {number} status - HTTP status code
   * @returns {Response} Error response
   */
  error(message, status = 400) {
    return this.c.json({
      success: false,
      error: {
        message,
        code: 'ERROR',
        status
      }
    }, status);
  }

  /**
   * Send 404 Not Found
   * @param {string} message - Optional message
   * @returns {Response} 404 response
   */
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

  /**
   * Send 401 Unauthorized
   * @param {string} message - Optional message
   * @returns {Response} 401 response
   */
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

  /**
   * Send 403 Forbidden
   * @param {string} message - Optional message
   * @returns {Response} 403 response
   */
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

  /**
   * Send HTML response
   * @param {string} html - HTML content
   * @param {number} status - HTTP status code
   * @returns {Response} HTML response
   */
  html(html, status = 200) {
    return this.c.html(html, status);
  }

  /**
   * Redirect to URL
   * @param {string} url - Target URL
   * @param {number} status - HTTP status code (default 302)
   * @returns {Response} Redirect response
   */
  redirect(url, status = 302) {
    return this.c.redirect(url, status);
  }

  /**
   * Render template (if template engine is configured)
   * @param {string|JSX.Element} template - Template name or JSX element
   * @param {Object} data - Data to pass to template
   * @param {Object} options - Render options
   * @returns {Promise<Response>} Rendered HTML response
   */
  async render(template, data = {}, options = {}) {
    if (!this.c.render) {
      throw new Error(
        'Template engine not configured. Use ApiPlugin with templates: { engine: "ejs" | "pug" | "jsx" }'
      );
    }

    return await this.c.render(template, data, options);
  }

  // ============================================
  // Context Helpers
  // ============================================

  /**
   * Get authenticated user (if auth is enabled)
   * @returns {Object|null} User object
   */
  get user() {
    return this.c.get('user') || null;
  }

  /**
   * Get session (if session tracking enabled)
   * @returns {Object|null} Session object
   */
  get session() {
    return this.c.get('session') || null;
  }

  /**
   * Get session ID (if session tracking enabled)
   * @returns {string|null} Session ID
   */
  get sessionId() {
    return this.c.get('sessionId') || null;
  }

  /**
   * Get request ID (if request ID tracking enabled)
   * @returns {string|null} Request ID
   */
  get requestId() {
    return this.c.get('requestId') || null;
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} True if authenticated
   */
  get isAuthenticated() {
    return !!this.user;
  }

  /**
   * Check if user has scope
   * @param {string} scope - Scope to check
   * @returns {boolean} True if user has scope
   */
  hasScope(scope) {
    return this.user?.scopes?.includes(scope) || false;
  }

  /**
   * Check if user has any of the scopes
   * @param {Array<string>} scopes - Scopes to check
   * @returns {boolean} True if user has any scope
   */
  hasAnyScope(...scopes) {
    return scopes.some(scope => this.hasScope(scope));
  }

  /**
   * Check if user has all scopes
   * @param {Array<string>} scopes - Scopes to check
   * @returns {boolean} True if user has all scopes
   */
  hasAllScopes(...scopes) {
    return scopes.every(scope => this.hasScope(scope));
  }

  /**
   * Require authentication (throw if not authenticated)
   * @throws {Error} If not authenticated
   */
  requireAuth() {
    if (!this.isAuthenticated) {
      throw Object.assign(
        new Error('Authentication required'),
        { status: 401, code: 'UNAUTHORIZED' }
      );
    }
  }

  /**
   * Require scope (throw if not authorized)
   * @param {string} scope - Required scope
   * @throws {Error} If scope missing
   */
  requireScope(scope) {
    this.requireAuth();

    if (!this.hasScope(scope)) {
      throw Object.assign(
        new Error(`Scope required: ${scope}`),
        { status: 403, code: 'FORBIDDEN' }
      );
    }
  }

  // ============================================
  // Partition Helpers (for Guards)
  // ============================================

  /**
   * Set partition filter for current query (used by guards for tenant isolation)
   * @param {string} partitionName - Partition name (e.g., 'byUserId')
   * @param {Object} partitionFields - Partition field values (e.g., { userId: 'user123' })
   * @returns {void}
   *
   * @example
   * // In guard:
   * users.guard = {
   *   list: (ctx) => {
   *     if (ctx.user.scopes?.includes('preset:admin')) {
   *       return true; // Admin sees everything
   *     }
   *
   *     // Regular user sees only their data (O(1) via partition)
   *     ctx.setPartition('byUserId', { userId: ctx.user.id });
   *     return true;
   *   }
   * };
   */
  setPartition(partitionName, partitionFields) {
    if (!this._partitionFilters) {
      this._partitionFilters = [];
    }

    this._partitionFilters.push({ partitionName, partitionFields });
  }

  /**
   * Get partition filters set by guards
   * @returns {Array} Partition filters
   * @internal
   */
  getPartitionFilters() {
    return this._partitionFilters || [];
  }

  /**
   * Clear partition filters
   * @returns {void}
   * @internal
   */
  clearPartitionFilters() {
    this._partitionFilters = [];
  }

  /**
   * Check if partition filters are set
   * @returns {boolean} True if partition filters exist
   */
  hasPartitionFilters() {
    return this._partitionFilters && this._partitionFilters.length > 0;
  }
}

/**
 * Wrap route handler to provide enhanced context
 *
 * @param {Function} handler - Route handler (c, ctx) => Response
 * @param {Object} options - Options
 * @param {Object} options.resource - Current resource (for resource-level routes)
 * @returns {Function} Wrapped handler
 *
 * @example
 * // Plugin-level route
 * routes: {
 *   'GET /health': withContext(async (c, ctx) => {
 *     const { db, resources } = ctx;
 *     return ctx.success({ uptime: process.uptime() });
 *   })
 * }
 *
 * @example
 * // Resource-level route (ctx.resource is auto-populated)
 * resources: {
 *   users: {
 *     api: {
 *       'POST /users/:id/reset-password': withContext(async (c, ctx) => {
 *         const { resource, validator } = ctx;
 *         const id = ctx.param('id');
 *
 *         // Validate body against current resource schema
 *         const { valid, errors } = await ctx.validator.validateBody();
 *         if (!valid) return ctx.error(errors, 400);
 *
 *         // Use current resource
 *         const user = await resource.get(id);
 *         return ctx.success({ user });
 *       })
 *     }
 *   }
 * }
 */
export function withContext(handler, options = {}) {
  return async (c) => {
    // Extract legacy context (for backward compatibility)
    const legacyContext = c.get('customRouteContext') || {};
    const { database, resource, plugins = {} } = legacyContext;

    // Use options.resource if provided (resource-level routes)
    const currentResource = options.resource || resource || null;

    // Create enhanced context
    const ctx = new RouteContext(c, database, currentResource, plugins);

    // Call handler with both Hono context and enhanced context
    return await handler(c, ctx);
  };
}

/**
 * Auto-wrap handler - automatically wraps handlers to provide enhanced context
 * This is used internally by the API Plugin to make enhanced context the default
 *
 * @param {Function} handler - Route handler
 * @param {Object} options - Options
 * @returns {Function} Wrapped handler
 * @private
 */
export function autoWrapHandler(handler, options = {}) {
  // Check if handler is already wrapped or if it only expects 1 argument (c)
  // In that case, don't wrap (backward compatibility)
  if (handler.length === 1) {
    // Handler only expects (c) - use legacy behavior
    return handler;
  }

  // Handler expects (c, ctx) - wrap it
  return withContext(handler, options);
}
