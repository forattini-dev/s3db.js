/**
 * API Plugin - RESTful HTTP API for s3db.js resources
 *
 * Transforms s3db.js resources into HTTP REST endpoints with:
 * - Multiple authentication methods (JWT, API Key, Basic Auth, Public)
 * - Automatic versioning based on resource version
 * - Production features (CORS, Rate Limiting, Logging, Compression)
 * - Schema validation middleware
 * - Custom middleware support
 *
 * @example
 * const apiPlugin = new ApiPlugin({
 *   port: 3000,
 *   docs: { enabled: true },
 *   auth: {
 *     jwt: { enabled: true, secret: 'my-secret' },
 *     apiKey: { enabled: true }
 *   },
 *   resources: {
 *     cars: {
 *       auth: ['jwt', 'apiKey'],
 *       methods: ['GET', 'POST', 'PUT', 'DELETE']
 *     }
 *   },
 *   cors: { enabled: true },
 *   rateLimit: { enabled: true, maxRequests: 100 },
 *   logging: { enabled: true },
 *   compression: { enabled: true },
 *   validation: { enabled: true }
 * });
 *
 * await database.usePlugin(apiPlugin);
 */

import { Plugin } from '../plugin.class.js';
import { ApiServer } from './server.js';
import { requirePluginDependency } from '../concerns/plugin-dependencies.js';
import tryFn from '../../concerns/try-fn.js';

/**
 * API Plugin class
 * @class
 * @extends Plugin
 */
export class ApiPlugin extends Plugin {
  /**
   * Create API Plugin instance
   * @param {Object} options - Plugin configuration
   */
  constructor(options = {}) {
    super(options);

    this.config = {
      // Server configuration
      port: options.port || 3000,
      host: options.host || '0.0.0.0',
      verbose: options.verbose || false,

      // API Documentation (supports both new and legacy formats)
      docs: {
        enabled: options.docs?.enabled !== false && options.docsEnabled !== false, // Enable by default
        ui: options.docs?.ui || 'redoc', // 'swagger' or 'redoc' (redoc is prettier!)
        title: options.docs?.title || options.apiTitle || 's3db.js API',
        version: options.docs?.version || options.apiVersion || '1.0.0',
        description: options.docs?.description || options.apiDescription || 'Auto-generated REST API for s3db.js resources'
      },

      // Authentication configuration
      auth: {
        jwt: {
          enabled: options.auth?.jwt?.enabled || false,
          secret: options.auth?.jwt?.secret || null,
          expiresIn: options.auth?.jwt?.expiresIn || '7d'
        },
        apiKey: {
          enabled: options.auth?.apiKey?.enabled || false,
          headerName: options.auth?.apiKey?.headerName || 'X-API-Key'
        },
        basic: {
          enabled: options.auth?.basic?.enabled || false,
          realm: options.auth?.basic?.realm || 'API Access'
        }
      },

      // Resource configuration
      resources: options.resources || {},

      // CORS configuration
      cors: {
        enabled: options.cors?.enabled || false,
        origin: options.cors?.origin || '*',
        methods: options.cors?.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: options.cors?.allowedHeaders || ['Content-Type', 'Authorization', 'X-API-Key'],
        exposedHeaders: options.cors?.exposedHeaders || ['X-Total-Count', 'X-Page-Count'],
        credentials: options.cors?.credentials !== false,
        maxAge: options.cors?.maxAge || 86400
      },

      // Rate limiting configuration
      rateLimit: {
        enabled: options.rateLimit?.enabled || false,
        windowMs: options.rateLimit?.windowMs || 60000, // 1 minute
        maxRequests: options.rateLimit?.maxRequests || 100,
        keyGenerator: options.rateLimit?.keyGenerator || null
      },

      // Logging configuration
      logging: {
        enabled: options.logging?.enabled || false,
        format: options.logging?.format || ':method :path :status :response-time ms',
        verbose: options.logging?.verbose || false
      },

      // Compression configuration
      compression: {
        enabled: options.compression?.enabled || false,
        threshold: options.compression?.threshold || 1024, // 1KB
        level: options.compression?.level || 6
      },

      // Validation configuration
      validation: {
        enabled: options.validation?.enabled !== false,
        validateOnInsert: options.validation?.validateOnInsert !== false,
        validateOnUpdate: options.validation?.validateOnUpdate !== false,
        returnValidationErrors: options.validation?.returnValidationErrors !== false
      },

      // Content Security Policy (CSP) configuration
      csp: {
        enabled: options.csp?.enabled || false,
        // Default CSP that works with Redoc v2.5.1 (allows CDN scripts/styles)
        directives: options.csp?.directives || {
          'default-src': ["'self'"],
          'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.redoc.ly/redoc/v2.5.1/'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.redoc.ly/redoc/v2.5.1/', 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'https:'],
          'connect-src': ["'self'"]
        },
        reportOnly: options.csp?.reportOnly || false, // If true, uses Content-Security-Policy-Report-Only
        reportUri: options.csp?.reportUri || null
      },

      // Custom global middlewares
      middlewares: options.middlewares || []
    };

    this.server = null;
    this.usersResource = null;
  }

  /**
   * Validate plugin dependencies
   * @private
   */
  async _validateDependencies() {
    await requirePluginDependency('api-plugin', {
      throwOnError: true,
      checkVersions: true
    });
  }

  /**
   * Install plugin
   */
  async onInstall() {
    if (this.config.verbose) {
      console.log('[API Plugin] Installing...');
    }

    // Validate dependencies
    try {
      await this._validateDependencies();
    } catch (err) {
      console.error('[API Plugin] Dependency validation failed:', err.message);
      throw err;
    }

    // Create users resource if authentication is enabled
    const authEnabled = this.config.auth.jwt.enabled ||
                       this.config.auth.apiKey.enabled ||
                       this.config.auth.basic.enabled;

    if (authEnabled) {
      await this._createUsersResource();
    }

    // Setup middlewares
    await this._setupMiddlewares();

    if (this.config.verbose) {
      console.log('[API Plugin] Installed successfully');
    }
  }

  /**
   * Create users resource for authentication
   * @private
   */
  async _createUsersResource() {
    const [ok, err, resource] = await tryFn(() =>
      this.database.createResource({
        name: 'plg_users',
        attributes: {
          id: 'string|required',
          username: 'string|required|minlength:3',
          email: 'string|optional|email',
          password: 'secret|required|minlength:8',
          apiKey: 'string|optional',
          jwtSecret: 'string|optional',
          role: 'string|default:user',
          active: 'boolean|default:true',
          createdAt: 'string|optional',
          lastLoginAt: 'string|optional',
          metadata: 'json|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'ApiPlugin'
      })
    );

    if (ok) {
      this.usersResource = resource;
      if (this.config.verbose) {
        console.log('[API Plugin] Created plg_users resource for authentication');
      }
    } else if (this.database.resources.plg_users) {
      // Resource already exists
      this.usersResource = this.database.resources.plg_users;
      if (this.config.verbose) {
        console.log('[API Plugin] Using existing plg_users resource');
      }
    } else {
      throw err;
    }
  }

  /**
   * Setup middlewares
   * @private
   */
  async _setupMiddlewares() {
    const middlewares = [];

    // Add request ID middleware
    middlewares.push(async (c, next) => {
      c.set('requestId', crypto.randomUUID());
      c.set('verbose', this.config.verbose);
      await next();
    });

    // Add CORS middleware
    if (this.config.cors.enabled) {
      const corsMiddleware = await this._createCorsMiddleware();
      middlewares.push(corsMiddleware);
    }

    // Add CSP middleware
    if (this.config.csp.enabled) {
      const cspMiddleware = await this._createCSPMiddleware();
      middlewares.push(cspMiddleware);
    }

    // Add rate limiting middleware
    if (this.config.rateLimit.enabled) {
      const rateLimitMiddleware = await this._createRateLimitMiddleware();
      middlewares.push(rateLimitMiddleware);
    }

    // Add logging middleware
    if (this.config.logging.enabled) {
      const loggingMiddleware = await this._createLoggingMiddleware();
      middlewares.push(loggingMiddleware);
    }

    // Add compression middleware
    if (this.config.compression.enabled) {
      const compressionMiddleware = await this._createCompressionMiddleware();
      middlewares.push(compressionMiddleware);
    }

    // Add custom middlewares
    middlewares.push(...this.config.middlewares);

    // Store compiled middlewares
    this.compiledMiddlewares = middlewares;
  }

  /**
   * Create CORS middleware (placeholder)
   * @private
   */
  async _createCorsMiddleware() {
    return async (c, next) => {
      const { origin, methods, allowedHeaders, exposedHeaders, credentials, maxAge } = this.config.cors;

      // Set CORS headers
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Methods', methods.join(', '));
      c.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      c.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));

      if (credentials) {
        c.header('Access-Control-Allow-Credentials', 'true');
      }

      c.header('Access-Control-Max-Age', maxAge.toString());

      // Handle OPTIONS preflight
      if (c.req.method === 'OPTIONS') {
        return c.body(null, 204);
      }

      await next();
    };
  }

  /**
   * Create CSP middleware
   * @private
   */
  async _createCSPMiddleware() {
    return async (c, next) => {
      const { directives, reportOnly, reportUri } = this.config.csp;

      // Build CSP header value from directives
      const cspParts = [];
      for (const [directive, values] of Object.entries(directives)) {
        if (Array.isArray(values) && values.length > 0) {
          cspParts.push(`${directive} ${values.join(' ')}`);
        } else if (typeof values === 'string') {
          cspParts.push(`${directive} ${values}`);
        }
      }

      // Add report-uri if specified
      if (reportUri) {
        cspParts.push(`report-uri ${reportUri}`);
      }

      const cspValue = cspParts.join('; ');

      // Set appropriate header (report-only or enforced)
      const headerName = reportOnly
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';

      c.header(headerName, cspValue);

      await next();
    };
  }

  /**
   * Create rate limiting middleware (placeholder)
   * @private
   */
  async _createRateLimitMiddleware() {
    const requests = new Map();
    const { windowMs, maxRequests, keyGenerator } = this.config.rateLimit;

    return async (c, next) => {
      // Generate key (IP or custom)
      const key = keyGenerator
        ? keyGenerator(c)
        : c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';

      // Get or create request count
      if (!requests.has(key)) {
        requests.set(key, { count: 0, resetAt: Date.now() + windowMs });
      }

      const record = requests.get(key);

      // Reset if window expired
      if (Date.now() > record.resetAt) {
        record.count = 0;
        record.resetAt = Date.now() + windowMs;
      }

      // Check limit
      if (record.count >= maxRequests) {
        const retryAfter = Math.ceil((record.resetAt - Date.now()) / 1000);
        c.header('Retry-After', retryAfter.toString());
        c.header('X-RateLimit-Limit', maxRequests.toString());
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', record.resetAt.toString());

        return c.json({
          success: false,
          error: {
            message: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            details: { retryAfter }
          }
        }, 429);
      }

      // Increment count
      record.count++;

      // Set rate limit headers
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', (maxRequests - record.count).toString());
      c.header('X-RateLimit-Reset', record.resetAt.toString());

      await next();
    };
  }

  /**
   * Create logging middleware (placeholder)
   * @private
   */
  async _createLoggingMiddleware() {
    return async (c, next) => {
      const start = Date.now();
      const method = c.req.method;
      const path = c.req.path;
      const requestId = c.get('requestId');

      await next();

      const duration = Date.now() - start;
      const status = c.res.status;
      const user = c.get('user')?.username || 'anonymous';

      console.log(`[API Plugin] ${requestId} - ${method} ${path} ${status} ${duration}ms - ${user}`);
    };
  }

  /**
   * Create compression middleware (placeholder)
   * @private
   */
  async _createCompressionMiddleware() {
    return async (c, next) => {
      await next();

      // Note: Actual compression would require proper streaming support
      // For now, this is a placeholder
      const acceptEncoding = c.req.header('accept-encoding') || '';

      if (acceptEncoding.includes('gzip')) {
        c.header('Content-Encoding', 'gzip');
      } else if (acceptEncoding.includes('deflate')) {
        c.header('Content-Encoding', 'deflate');
      }
    };
  }

  /**
   * Start plugin
   */
  async onStart() {
    if (this.config.verbose) {
      console.log('[API Plugin] Starting server...');
    }

    // Create server instance
    this.server = new ApiServer({
      port: this.config.port,
      host: this.config.host,
      database: this.database,
      resources: this.config.resources,
      middlewares: this.compiledMiddlewares,
      verbose: this.config.verbose,
      auth: this.config.auth,
      docsEnabled: this.config.docs.enabled,
      docsUI: this.config.docs.ui,
      apiTitle: this.config.docs.title,
      apiVersion: this.config.docs.version,
      apiDescription: this.config.docs.description
    });

    // Start server
    await this.server.start();

    this.emit('plugin.started', {
      port: this.config.port,
      host: this.config.host
    });
  }

  /**
   * Stop plugin
   */
  async onStop() {
    if (this.config.verbose) {
      console.log('[API Plugin] Stopping server...');
    }

    if (this.server) {
      await this.server.stop();
      this.server = null;
    }

    this.emit('plugin.stopped');
  }

  /**
   * Uninstall plugin
   */
  async onUninstall(options = {}) {
    const { purgeData = false } = options;

    // Stop server if running
    await this.onStop();

    // Optionally delete users resource
    if (purgeData && this.usersResource) {
      // Delete all users (plugin data cleanup happens automatically via base Plugin class)
      const [ok] = await tryFn(() => this.database.deleteResource('plg_users'));

      if (ok && this.config.verbose) {
        console.log('[API Plugin] Deleted plg_users resource');
      }
    }

    if (this.config.verbose) {
      console.log('[API Plugin] Uninstalled successfully');
    }
  }

  /**
   * Get server information
   * @returns {Object} Server info
   */
  getServerInfo() {
    return this.server ? this.server.getInfo() : { isRunning: false };
  }

  /**
   * Get Hono app instance (for advanced usage)
   * @returns {Hono|null} Hono app
   */
  getApp() {
    return this.server ? this.server.getApp() : null;
  }
}

export default ApiPlugin;
