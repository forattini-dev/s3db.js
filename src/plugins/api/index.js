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
import { requirePluginDependency } from '../concerns/plugin-dependencies.js';
import tryFn from '../../concerns/try-fn.js';
import { ApiServer } from './server.js';
import { idGenerator } from '../../concerns/id.js';
import { resolveResourceName } from '../concerns/resource-names.js';
import { normalizeBasePath } from './utils/base-path.js';
import { normalizeAuthConfig } from './config/normalize-auth.js';
import { normalizeLoggingConfig } from './config/normalize-logging.js';
import { normalizeRateLimitRules } from './config/normalize-ratelimit.js';
import { normalizeResourcesConfig } from './config/normalize-resources.js';
import { createCompressionMiddleware } from './middleware/compression.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { createIdentityContextMiddleware } from './middleware/identity.js';
import { createLoggingMiddleware } from './middleware/logging.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import { createSecurityMiddleware } from './middleware/security.js';

const BASE_USER_ATTRIBUTES = {
  id: 'string|required',
  username: 'string|required|minlength:3',
  email: 'string|required|email',
  role: 'string|default:user',
  scopes: 'array|items:string|optional',
  active: 'boolean|default:true',
  createdAt: 'string|optional',
  lastLoginAt: 'string|optional',
  metadata: 'json|optional'
};

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

    const resourceNamesOption = options.resourceNames || {};
    this._usersResourceDescriptor = {
      defaultName: 'plg_api_users',
      override: resourceNamesOption.authUsers || options.auth?.resource
    };
    const normalizedAuth = normalizeAuthConfig(options.auth, this.logger);
    normalizedAuth.registration = {
      enabled: options.auth?.registration?.enabled === true,
      allowedFields: Array.isArray(options.auth?.registration?.allowedFields)
        ? options.auth.registration.allowedFields
        : [],
      defaultRole: options.auth?.registration?.defaultRole || 'user'
    };
    normalizedAuth.loginThrottle = {
      enabled: options.auth?.loginThrottle?.enabled !== false,
      maxAttempts: options.auth?.loginThrottle?.maxAttempts || 5,
      windowMs: options.auth?.loginThrottle?.windowMs || 60_000,
      blockDurationMs: options.auth?.loginThrottle?.blockDurationMs || 300_000,
      maxEntries: options.auth?.loginThrottle?.maxEntries || 10_000
    };
    this.usersResourceName = this._resolveUsersResourceName();
    normalizedAuth.createResource = options.auth?.createResource !== false;
    normalizedAuth.usersResourcePasswordValidation = options.auth?.usersResourcePasswordValidation || 'secret|required|minlength:8';
    normalizedAuth.enableIdentityContextMiddleware = options.auth?.enableIdentityContextMiddleware !== false;
    normalizedAuth.usersResourceAttributes = options.auth?.usersResourceAttributes || {};

    this.config = {
      // Server configuration
      port: options.port || 3000,
      host: options.host || '0.0.0.0',
      logLevel: this.logLevel, // Use normalized logLevel from Plugin base
      basePath: normalizeBasePath(options.basePath),
      startupBanner: options.startupBanner !== false,

      // Version prefix configuration (global default)
      // Can be: true (use resource version), false (no prefix - DEFAULT), or string (custom prefix like 'api/v1')
      versionPrefix: options.versionPrefix !== undefined ? options.versionPrefix : false,

      docs: {
        enabled: options.docs?.enabled !== false && options.docsEnabled !== false, // Enable by default
        ui: options.docs?.ui || 'redoc', // 'swagger' or 'redoc' (redoc is prettier!)
        title: options.docs?.title || options.apiTitle || 's3db.js API',
        version: options.docs?.version || options.apiVersion || '1.0.0',
        description: options.docs?.description || options.apiDescription || 'Auto-generated REST API for s3db.js resources',
        csp: options.docs?.csp || null
      },

      // Authentication configuration (multiple drivers)
      auth: normalizedAuth,

      // Custom routes (plugin-level)
      routes: options.routes || {},

      // Template engine configuration
      templates: {
        enabled: options.templates?.enabled || false,
        engine: options.templates?.engine || 'jsx', // 'jsx' (default), 'ejs', 'custom'
        templatesDir: options.templates?.templatesDir || './views',
        layout: options.templates?.layout || null,
        engineOptions: options.templates?.engineOptions || {},
        customRenderer: options.templates?.customRenderer || null
      },

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
        keyGenerator: typeof options.rateLimit?.keyGenerator === 'function'
          ? options.rateLimit.keyGenerator
          : null,
        maxUniqueKeys: options.rateLimit?.maxUniqueKeys || 1000,
        rules: normalizeRateLimitRules(options.rateLimit?.rules, this.logger)
      },

      // Logging configuration
      logging: normalizeLoggingConfig(options.logging),

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

      // Security Headers (Helmet-like configuration)
      security: {
        enabled: options.security?.enabled !== false, // Enabled by default

        // Content Security Policy (CSP)
        contentSecurityPolicy: options.security?.contentSecurityPolicy !== false ? {
          enabled: options.security?.contentSecurityPolicy?.enabled !== false,
          directives: options.security?.contentSecurityPolicy?.directives || options.csp?.directives || {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.redoc.ly/redoc/v2.5.1/'],
            'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.redoc.ly/redoc/v2.5.1/', 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'img-src': ["'self'", 'data:', 'https:'],
            'connect-src': ["'self'"]
          },
          reportOnly: options.security?.contentSecurityPolicy?.reportOnly || options.csp?.reportOnly || false,
          reportUri: options.security?.contentSecurityPolicy?.reportUri || options.csp?.reportUri || null
        } : false,

        // X-Frame-Options (clickjacking protection)
        frameguard: options.security?.frameguard !== false ? {
          action: options.security?.frameguard?.action || 'deny' // 'deny' or 'sameorigin'
        } : false,

        // X-Content-Type-Options (MIME sniffing protection)
        noSniff: options.security?.noSniff !== false, // Enabled by default

        // Strict-Transport-Security (HSTS - force HTTPS)
        hsts: options.security?.hsts !== false ? {
          maxAge: options.security?.hsts?.maxAge || 15552000, // 180 days (Helmet default)
          includeSubDomains: options.security?.hsts?.includeSubDomains !== false,
          preload: options.security?.hsts?.preload || false
        } : false,

        // Referrer-Policy (privacy)
        referrerPolicy: options.security?.referrerPolicy !== false ? {
          policy: options.security?.referrerPolicy?.policy || 'no-referrer'
        } : false,

        // X-DNS-Prefetch-Control (DNS leak protection)
        dnsPrefetchControl: options.security?.dnsPrefetchControl !== false ? {
          allow: options.security?.dnsPrefetchControl?.allow || false
        } : false,

        // X-Download-Options (IE8+ download security)
        ieNoOpen: options.security?.ieNoOpen !== false, // Enabled by default

        // X-Permitted-Cross-Domain-Policies (Flash/PDF security)
        permittedCrossDomainPolicies: options.security?.permittedCrossDomainPolicies !== false ? {
          policy: options.security?.permittedCrossDomainPolicies?.policy || 'none'
        } : false,

        // X-XSS-Protection (legacy XSS filter)
        xssFilter: options.security?.xssFilter !== false ? {
          mode: options.security?.xssFilter?.mode || 'block'
        } : false,

        // Permissions-Policy (modern feature policy)
        permissionsPolicy: options.security?.permissionsPolicy !== false ? {
          features: options.security?.permissionsPolicy?.features || {
            geolocation: [],
            microphone: [],
            camera: [],
            payment: [],
            usb: [],
            magnetometer: [],
            gyroscope: [],
            accelerometer: []
          }
        } : false
      },


      // Custom global middlewares
      middlewares: options.middlewares || [],

      requestId: options.requestId || { enabled: false },
      sessionTracking: options.sessionTracking || { enabled: false },
      events: options.events || { enabled: false },
      metrics: options.metrics || { enabled: false },
      failban: {
        ...(options.failban || {}),
        enabled: options.failban?.enabled === true,
        resourceNames: resourceNamesOption.failban || options.failban?.resourceNames || {}
      },
      static: Array.isArray(options.static) ? options.static : [],
      health: typeof options.health === 'object'
        ? options.health
        : { enabled: options.health !== false },
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024
    };

    // Note: logLevel is already set above in config, no need to reassign
    this.config.resources = normalizeResourcesConfig(this.options.resources, this.logger);

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
    if (this.config.logLevel) {
      this.logger.info('Installing...');
    }

    // Validate dependencies
    try {
      await this._validateDependencies();
    } catch (err) {
      if (this.config.logLevel) {
        this.logger.error({ error: err.message }, 'Dependency validation failed');
      }
      throw err;
    }

    // Create users resource if authentication drivers are configured
    const authEnabled = this.config.auth.drivers.length > 0;

    if (authEnabled) {
      await this._createUsersResource();
    }

    // Setup middlewares
    await this._setupMiddlewares();

    if (this.config.logLevel) {
      this.logger.info('Installed successfully');
    }
  }

  /**
   * Create users resource for authentication
   * @private
   */
  async _createUsersResource() {
    const existingResource = this._findExistingUsersResource();

    // If createResource is explicitly set to false, we *must* use an existing resource.
    // If no existing resource is found, an error is thrown.
    if (!this.config.auth.createResource) {
      if (!existingResource) {
        throw new Error(
          `[API Plugin] Auth resource "${this.usersResourceName}" not found and auth.createResource is false`
        );
      }
      this.usersResource = existingResource;
      this.config.auth.resource = existingResource.name;
      if (this.config.logLevel) {
        this.logger.info({ resourceName: existingResource.name }, 'Using existing resource for authentication');
      }
      return;
    }

    if (existingResource) {
      this.usersResource = existingResource;
      this.config.auth.resource = existingResource.name;
      if (this.config.logLevel) {
        this.logger.info({ resourceName: existingResource.name }, 'Reusing existing resource for authentication');
      }
      return;
    }

    const passwordValidation = this.config.auth.usersResourcePasswordValidation;

    const mergedAttributes = this._deepMerge(BASE_USER_ATTRIBUTES, this.config.auth.usersResourceAttributes);
    mergedAttributes.password = passwordValidation;

    const [ok, err, resource] = await tryFn(() =>
      this.database.createResource({
        name: this.usersResourceName,
        attributes: mergedAttributes,
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'ApiPlugin'
      })
    );

    if (!ok) {
      throw err;
    }

    this.usersResource = resource;
    this.config.auth.resource = resource.name;
    if (this.config.logLevel) {
      this.logger.info({ usersResourceName: this.usersResourceName, passwordValidation: passwordValidation }, 'Created resource for authentication with configurable password validation');
    }
  }

  _findExistingUsersResource() {
    const candidates = new Set([this.usersResourceName, this.config?.auth?.resource].filter(Boolean));

    for (const name of candidates) {
      if (!name) continue;
      const resource = this.database.resources?.[name];
      if (resource) {
        return resource;
      }
    }
    return null;
  }

  /**
   * Deeply merge two objects.
   * @param {Object} target - The target object to merge into.
   * @param {Object} source - The source object to merge from.
   * @returns {Object} The merged object.
   * @private
   */
  _deepMerge(target, source) {
    const output = { ...target };

    if (target && typeof target === 'object' && source && typeof source === 'object') {
      Object.keys(source).forEach(key => {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          output[key] = this._deepMerge(target[key], source[key]);
        } else {
          output[key] = source[key];
        }
      });
    }
    return output;
  }
  /**
   * Setup middlewares
   * @private
   */
  async _setupMiddlewares() {
    const middlewares = [];

    // Add request ID middleware
    middlewares.push(async (c, next) => {
      c.set('requestId', idGenerator());
      c.set('logLevel', this.config.logLevel);
      await next();
    });

    // Add Identity context middleware (OIDC-aware helper)
    if (this.config.auth.enableIdentityContextMiddleware) {
      middlewares.push(createIdentityContextMiddleware());
    }

    // Add security headers middleware (FIRST - most critical)
    if (this.config.security.enabled) {
      const securityMiddleware = await createSecurityMiddleware(this.config.security);
      middlewares.push(securityMiddleware);
    }

    // Add CORS middleware
    if (this.config.cors.enabled) {
      const corsMiddleware = await createCorsMiddleware(this.config.cors);
      middlewares.push(corsMiddleware);
    }


    // Add rate limiting middleware
    if (this.config.rateLimit.enabled) {
      const rateLimitMiddleware = await createRateLimitMiddleware(this.config.rateLimit);
      middlewares.push(rateLimitMiddleware);
    }

    // Add logging middleware
    if (this.config.logging.enabled) {
      const loggingMiddleware = await createLoggingMiddleware(this.config.logging, this.logger);
      middlewares.push(loggingMiddleware);
    }

    // Add compression middleware
    if (this.config.compression.enabled) {
      const compressionMiddleware = await createCompressionMiddleware(this.config.compression, this.logger);
      middlewares.push(compressionMiddleware);
    }

    // Add custom middlewares
    middlewares.push(...this.config.middlewares);

    // Store compiled middlewares
    this.compiledMiddlewares = middlewares;
  }

  /**
   * Start plugin
   */
  async onStart() {
    if (this.config.logLevel) {
      this.logger.info('Starting server...');
    }

    // Create server instance
    this.server = new ApiServer({
      port: this.config.port,
      host: this.config.host,
      database: this.database,
      namespace: this.namespace,
      basePath: this.config.basePath,
      versionPrefix: this.config.versionPrefix,
      resources: this.config.resources,
      routes: this.config.routes,
      templates: this.config.templates,
      middlewares: this.compiledMiddlewares,
      cors: this.config.cors,
      security: this.config.security,
      requestId: this.config.requestId,
      sessionTracking: this.config.sessionTracking,
      events: this.config.events,
      metrics: this.config.metrics,
      failban: this.config.failban,
      static: this.config.static,
      health: this.config.health,
      maxBodySize: this.config.maxBodySize,
      logLevel: this.config.logLevel,
      auth: this.config.auth,
      compression: this.config.compression,
      docsEnabled: this.config.docs.enabled,
      docsUI: this.config.docs.ui,
      docsCsp: this.config.docs.csp,
      apiTitle: this.config.docs.title,
      apiVersion: this.config.docs.version,
      apiDescription: this.config.docs.description,
      startupBanner: this.config.startupBanner,
      logger: this.logger
    });

    // Start server
    await this._checkPortAvailability(this.config.port, this.config.host);
    await this.server.start();

    this.emit('plugin.started', {
      port: this.config.port,
      host: this.config.host
    });
  }

  /**
   * Check if the port is available
   * @private
   */
  async _checkPortAvailability(port, host) {
    const { createServer } = await import('net');
    return new Promise((resolve, reject) => {
      const server = createServer();

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use. Please choose a different port or stop the process using it.`));
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        server.close(() => resolve());
      });

      server.listen(port, host);
    });
  }

  /**
   * Stop plugin
   */
  async onStop() {
    if (this.config.logLevel) {
      this.logger.info('Stopping server...');
    }

    if (this.server) {
      await this.server.stop();
    }
    this.server = null;
  }

  _resolveUsersResourceName() {
    return resolveResourceName('api', this._usersResourceDescriptor, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    this.usersResourceName = this._resolveUsersResourceName();
    if (this.config?.auth) {
      this.config.auth.resource = this.usersResourceName;
    }
    if (this.server?.failban) {
      this.server.failban.setNamespace(this.namespace);
    }
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
      const [ok] = await tryFn(() => this.database.deleteResource(this.usersResourceName));
      if (ok && this.config.logLevel) {
        this.logger.info({ usersResourceName: this.usersResourceName }, 'Deleted resource');
      }
    }

    if (this.config.logLevel) {
      this.logger.info('Uninstalled successfully');
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

// Export auth utilities (OIDCClient, guards helpers, etc.)
export { OIDCClient } from './auth/oidc-client.js';
export * from './concerns/guards-helpers.js';

// Export template engine utilities
export { setupTemplateEngine, ejsEngine, pugEngine, jsxEngine } from './utils/template-engine.js';

// Export OpenGraph helper
export { OpenGraphHelper } from './concerns/opengraph-helper.js';

// Export state machines
export {
  NotificationStateMachine,
  AttemptStateMachine,
  createNotificationStateMachine,
  createAttemptStateMachine
} from './concerns/state-machine.js';

// Export route context utilities (Enhanced Context System)
export { RouteContext, withContext } from './concerns/route-context.js';

// Export route helper utilities (response helpers for backward compatibility)
export { errorResponse, successResponse } from './utils/route-helper.js';

// Export context injection middleware
export { createContextInjectionMiddleware } from './middlewares/context-injection.js';

// Export standard HTTP error classes
export {
  // With Http prefix (recommended to avoid conflicts)
  HttpBadRequestError,
  HttpValidationError,
  HttpUnauthorizedError,
  HttpForbiddenError,
  HttpNotFoundError,
  HttpMethodNotAllowedError,
  HttpConflictError,
  HttpUnprocessableEntityError,
  HttpTooManyRequestsError,
  HttpInternalServerError,
  HttpNotImplementedError,
  HttpServiceUnavailableError,
  // Utilities
  HTTP_ERRORS,
  createHttpError
} from './errors.js';
