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

      // Version prefix configuration (global default)
      // Can be: true (use resource version), false (no prefix - DEFAULT), or string (custom prefix like 'api/v1')
      versionPrefix: options.versionPrefix !== undefined ? options.versionPrefix : false,

      docs: {
        enabled: options.docs?.enabled !== false && options.docsEnabled !== false, // Enable by default
        ui: options.docs?.ui || 'redoc', // 'swagger' or 'redoc' (redoc is prettier!)
        title: options.docs?.title || options.apiTitle || 's3db.js API',
        version: options.docs?.version || options.apiVersion || '1.0.0',
        description: options.docs?.description || options.apiDescription || 'Auto-generated REST API for s3db.js resources'
      },

      // Authentication configuration (multiple drivers)
      auth: options.auth ? {
        // Array of authentication drivers (OR logic - any driver can authenticate)
        drivers: options.auth.drivers || [],

        // Global settings
        resource: options.auth.resource || 'users',
        usernameField: options.auth.usernameField || 'email',
        passwordField: options.auth.passwordField || 'password'
      } : {
        drivers: [],
        resource: 'users',
        usernameField: 'email',
        passwordField: 'password'
      },

      // Custom routes (plugin-level)
      routes: options.routes || {},

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

      // Legacy CSP config (backward compatibility)
      csp: {
        enabled: options.csp?.enabled || false,
        directives: options.csp?.directives || {},
        reportOnly: options.csp?.reportOnly || false,
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

    // Create users resource if authentication drivers are configured
    const authEnabled = this.config.auth.drivers.length > 0;

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
          email: 'string|required|email',  // Required to support email-based auth
          password: 'secret|required|minlength:8',
          apiKey: 'string|optional',
          jwtSecret: 'string|optional',
          role: 'string|default:user',
          scopes: 'array|items:string|optional',  // Authorization scopes (e.g., ['read:users', 'write:cars'])
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
      c.set('requestId', idGenerator());
      c.set('verbose', this.config.verbose);
      await next();
    });

    // Add security headers middleware (FIRST - most critical)
    if (this.config.security.enabled) {
      const securityMiddleware = await this._createSecurityMiddleware();
      middlewares.push(securityMiddleware);
    }

    // Add CORS middleware
    if (this.config.cors.enabled) {
      const corsMiddleware = await this._createCorsMiddleware();
      middlewares.push(corsMiddleware);
    }

    // Add legacy CSP middleware (deprecated - use security.contentSecurityPolicy instead)
    // This is kept for backward compatibility with old configs
    if (this.config.csp.enabled && !this.config.security.contentSecurityPolicy) {
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
   * Create CORS middleware
   * @private
   *
   * Handles Cross-Origin Resource Sharing (CORS) headers and preflight requests.
   * Supports wildcard origins, credential-based requests, and OPTIONS preflight.
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
   * Create rate limiting middleware
   * @private
   *
   * Implements sliding window rate limiting with configurable window size and max requests.
   * Returns 429 status code with Retry-After header when limit is exceeded.
   * Uses IP address or custom key generator to track request counts.
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
   * Create logging middleware with customizable format
   * @private
   *
   * Supported tokens:
   * - :method - HTTP method (GET, POST, etc)
   * - :path - Request path
   * - :status - HTTP status code
   * - :response-time - Response time in milliseconds
   * - :user - Username or 'anonymous'
   * - :requestId - Request ID (UUID)
   *
   * Example format: ':method :path :status :response-time ms - :user'
   * Output: 'GET /api/v1/cars 200 45ms - john'
   */
  async _createLoggingMiddleware() {
    const { format } = this.config.logging;

    return async (c, next) => {
      const start = Date.now();
      const method = c.req.method;
      const path = c.req.path;
      const requestId = c.get('requestId');

      await next();

      const duration = Date.now() - start;
      const status = c.res.status;
      const user = c.get('user')?.username || c.get('user')?.email || 'anonymous';

      // Parse format string with token replacement
      let logMessage = format
        .replace(':method', method)
        .replace(':path', path)
        .replace(':status', status)
        .replace(':response-time', duration)
        .replace(':user', user)
        .replace(':requestId', requestId);

      console.log(`[API Plugin] ${logMessage}`);
    };
  }

  /**
   * Create compression middleware (using Node.js zlib)
   * @private
   */
  async _createCompressionMiddleware() {
    const { gzip, brotliCompress } = await import('zlib');
    const { promisify } = await import('util');

    const gzipAsync = promisify(gzip);
    const brotliAsync = promisify(brotliCompress);

    const { threshold, level } = this.config.compression;

    // Content types that should NOT be compressed (already compressed)
    const skipContentTypes = [
      'image/', 'video/', 'audio/',
      'application/zip', 'application/gzip',
      'application/x-gzip', 'application/x-bzip2'
    ];

    return async (c, next) => {
      await next();

      // Skip if response has no body
      if (!c.res || !c.res.body) {
        return;
      }

      // Skip if already compressed
      if (c.res.headers.has('content-encoding')) {
        return;
      }

      // Skip if content-type should not be compressed
      const contentType = c.res.headers.get('content-type') || '';
      if (skipContentTypes.some(type => contentType.startsWith(type))) {
        return;
      }

      // Check Accept-Encoding header
      const acceptEncoding = c.req.header('accept-encoding') || '';
      const supportsBrotli = acceptEncoding.includes('br');
      const supportsGzip = acceptEncoding.includes('gzip');

      if (!supportsBrotli && !supportsGzip) {
        return; // Client doesn't support compression
      }

      // Get response body as buffer
      let body;
      try {
        const text = await c.res.text();
        body = Buffer.from(text, 'utf-8');
      } catch (err) {
        // If body is already consumed or not text, skip compression
        return;
      }

      // Skip if body is too small
      if (body.length < threshold) {
        return;
      }

      // Compress with brotli (better) or gzip (fallback)
      let compressed;
      let encoding;

      try {
        if (supportsBrotli) {
          compressed = await brotliAsync(body);
          encoding = 'br';
        } else {
          compressed = await gzipAsync(body, { level });
          encoding = 'gzip';
        }

        // Only use compressed if it's actually smaller
        if (compressed.length >= body.length) {
          return; // Compression didn't help, use original
        }

        // Create new response with compressed body
        const headers = new Headers(c.res.headers);
        headers.set('Content-Encoding', encoding);
        headers.set('Content-Length', compressed.length.toString());
        headers.set('Vary', 'Accept-Encoding');

        // Replace response
        c.res = new Response(compressed, {
          status: c.res.status,
          statusText: c.res.statusText,
          headers
        });

      } catch (err) {
        // Compression failed, log and continue with uncompressed response
        if (this.config.verbose) {
          console.error('[API Plugin] Compression error:', err.message);
        }
      }
    };
  }

  /**
   * Create security headers middleware (Helmet-like)
   * @private
   */
  async _createSecurityMiddleware() {
    const { security } = this.config;

    return async (c, next) => {
      // X-Content-Type-Options: nosniff (MIME sniffing protection)
      if (security.noSniff) {
        c.header('X-Content-Type-Options', 'nosniff');
      }

      // X-Frame-Options (clickjacking protection)
      if (security.frameguard) {
        const action = security.frameguard.action.toUpperCase();
        if (action === 'DENY') {
          c.header('X-Frame-Options', 'DENY');
        } else if (action === 'SAMEORIGIN') {
          c.header('X-Frame-Options', 'SAMEORIGIN');
        }
      }

      // Strict-Transport-Security (HSTS - force HTTPS)
      if (security.hsts) {
        const parts = [`max-age=${security.hsts.maxAge}`];
        if (security.hsts.includeSubDomains) {
          parts.push('includeSubDomains');
        }
        if (security.hsts.preload) {
          parts.push('preload');
        }
        c.header('Strict-Transport-Security', parts.join('; '));
      }

      // Referrer-Policy (privacy)
      if (security.referrerPolicy) {
        c.header('Referrer-Policy', security.referrerPolicy.policy);
      }

      // X-DNS-Prefetch-Control (DNS leak protection)
      if (security.dnsPrefetchControl) {
        const value = security.dnsPrefetchControl.allow ? 'on' : 'off';
        c.header('X-DNS-Prefetch-Control', value);
      }

      // X-Download-Options (IE8+ download security)
      if (security.ieNoOpen) {
        c.header('X-Download-Options', 'noopen');
      }

      // X-Permitted-Cross-Domain-Policies (Flash/PDF security)
      if (security.permittedCrossDomainPolicies) {
        c.header('X-Permitted-Cross-Domain-Policies', security.permittedCrossDomainPolicies.policy);
      }

      // X-XSS-Protection (legacy XSS filter)
      if (security.xssFilter) {
        const mode = security.xssFilter.mode;
        c.header('X-XSS-Protection', mode === 'block' ? '1; mode=block' : '0');
      }

      // Permissions-Policy (modern feature policy)
      if (security.permissionsPolicy && security.permissionsPolicy.features) {
        const features = security.permissionsPolicy.features;
        const policies = [];

        for (const [feature, allowList] of Object.entries(features)) {
          if (Array.isArray(allowList)) {
            const value = allowList.length === 0
              ? `${feature}=()`
              : `${feature}=(${allowList.join(' ')})`;
            policies.push(value);
          }
        }

        if (policies.length > 0) {
          c.header('Permissions-Policy', policies.join(', '));
        }
      }

      // Content-Security-Policy (CSP)
      // Note: This is also handled by _createCSPMiddleware for backward compatibility
      // We check if legacy csp.enabled is true, otherwise use security.contentSecurityPolicy
      const cspConfig = this.config.csp.enabled
        ? this.config.csp
        : security.contentSecurityPolicy;

      if (cspConfig && cspConfig.enabled !== false && cspConfig.directives) {
        const cspParts = [];
        for (const [directive, values] of Object.entries(cspConfig.directives)) {
          if (Array.isArray(values) && values.length > 0) {
            cspParts.push(`${directive} ${values.join(' ')}`);
          } else if (typeof values === 'string') {
            cspParts.push(`${directive} ${values}`);
          }
        }

        if (cspConfig.reportUri) {
          cspParts.push(`report-uri ${cspConfig.reportUri}`);
        }

        if (cspParts.length > 0) {
          const cspValue = cspParts.join('; ');
          const headerName = cspConfig.reportOnly
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy';
          c.header(headerName, cspValue);
        }
      }

      await next();
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
      routes: this.config.routes,
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
