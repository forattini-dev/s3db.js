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
import { findBestMatch, matchPath } from './utils/path-matcher.js';

const DEFAULT_LOG_FORMAT = ':verb :url => :status (:elapsed ms, :res[content-length])';
const ANSI_RESET = '\x1b[0m';
const PASTEL_COLORS = {
  method: '\x1b[38;5;117m',
  url: '\x1b[38;5;195m',
  arrow: '\x1b[38;5;244m',
  time: '\x1b[38;5;176m',
  size: '\x1b[38;5;147m'
};

const AUTH_DRIVER_KEYS = ['jwt', 'apiKey', 'basic', 'oidc', 'oauth2'];

function normalizeAuthConfig(authOptions = {}, logger = null) {
  if (!authOptions) {
    return {
      drivers: [],
      pathRules: [],
      pathAuth: undefined,
      strategy: 'any',
      priorities: {},
      resource: null, // Will be set per-driver or fallback to 'users'
      driver: null
    };
  }

  const normalized = {
    drivers: [],
    pathRules: Array.isArray(authOptions.pathRules) ? authOptions.pathRules : [],
    pathAuth: authOptions.pathAuth,
    strategy: authOptions.strategy || 'any',
    priorities: authOptions.priorities || {},
    createResource: authOptions.createResource !== false
  };

  const seen = new Set();

  const addDriver = (name, driverConfig = {}) => {
    if (!name) return;
    const driverName = String(name).trim();
    if (!driverName || seen.has(driverName)) return;
    seen.add(driverName);

    const config = { ...driverConfig };
    if (!config.resource) {
      config.resource = 'users'; // Default resource
    }

    normalized.drivers.push({
      driver: driverName,
      config
    });
  };

  // Drivers provided as array
  if (Array.isArray(authOptions.drivers)) {
    for (const entry of authOptions.drivers) {
      if (typeof entry === 'string') {
        addDriver(entry, {});
      } else if (entry && typeof entry === 'object') {
        addDriver(entry.driver, entry.config || {});
      }
    }
  }

  // Single driver shortcut
  if (authOptions.driver) {
    if (typeof authOptions.driver === 'string') {
      addDriver(authOptions.driver, authOptions.config || {});
    } else if (typeof authOptions.driver === 'object') {
      addDriver(authOptions.driver.driver, authOptions.driver.config || authOptions.config || {});
    }
  }

  normalized.driver = normalized.drivers.length > 0 ? normalized.drivers[0].driver : null;
  return normalized;
}

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
    normalizedAuth.resource = this.usersResourceName;
    normalizedAuth.createResource = options.auth?.createResource !== false;

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
        rules: this._normalizeRateLimitRules(options.rateLimit?.rules)
      },

      // Logging configuration
      logging: (() => {
        const normalizeExclude = (value) => {
          if (Array.isArray(value)) {
            return value.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
          }
          if (typeof value === 'string' && value.trim().length > 0) {
            return [value.trim()];
          }
          return [];
        };

        const baseConfig = {
          format: DEFAULT_LOG_FORMAT,
          verbose: false,
          colorize: true,
          filter: null,
          excludePaths: []
        };

        // Support shorthand: logging: true → { enabled: true }
        if (options.logging === true) {
          return {
            enabled: true,
            ...baseConfig
          };
        }

        // Support shorthand: logging: false → { enabled: false }
        if (options.logging === false || !options.logging) {
          return {
            enabled: false,
            ...baseConfig
          };
        }

        // Object configuration
        return {
          enabled: options.logging.enabled !== false, // Enabled by default when object is provided
          format: options.logging.format || DEFAULT_LOG_FORMAT,
          verbose: options.logging.verbose || false,
          colorize: options.logging.colorize !== false,
          filter: typeof options.logging.filter === 'function' ? options.logging.filter : null,
          excludePaths: normalizeExclude(options.logging.excludePaths)
        };
      })(),

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
    this.config.resources = this._normalizeResourcesConfig(this.options.resources);

    this.server = null;
    this.usersResource = null;
  }

  /**
   * Normalize resources config so array/string inputs become object map
   * @private
   * @param {Object|Array<string|Object>} resources
   * @returns {Object<string, Object>}
   */
  _normalizeResourcesConfig(resources) {
    if (!resources) {
      return {};
    }

    const normalized = {};
    const verbose = this.options?.verbose;

    const addResourceConfig = (name, config = {}) => {
      if (typeof name !== 'string' || !name.trim()) {
        if (verbose) {
          this.logger.warn({ name }, 'Ignoring resource config with invalid name');
        }
        return;
      }

      normalized[name] = { ...config };
    };

    if (Array.isArray(resources)) {
      for (const entry of resources) {
        if (typeof entry === 'string') {
          addResourceConfig(entry);
        } else if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
          const { name, ...config } = entry;
          addResourceConfig(name, config);
        } else {
          if (verbose) {
            this.logger.warn({ entry }, 'Ignoring invalid resource config entry (expected string or object with name)');
          }
        }
      }
      return normalized;
    }

    if (typeof resources === 'object') {
      for (const [name, config] of Object.entries(resources)) {
        if (config === false) {
          addResourceConfig(name, { enabled: false });
        } else if (config === true || config === undefined || config === null) {
          addResourceConfig(name);
        } else if (typeof config === 'object') {
          addResourceConfig(name, config);
        } else {
          if (verbose) {
            this.logger.warn('[API Plugin] Coercing resource config to empty object for', name);
          }
          addResourceConfig(name);
        }
      }
      return normalized;
    }

    if (verbose) {
      this.logger.warn({ type: typeof resources }, 'Invalid resources configuration. Expected object or array, received');
    }

    return {};
  }

  _normalizeRateLimitRules(rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
      return [];
    }

    const normalized = [];
    const verbose = this.options?.verbose;

    rules.forEach((rawRule, index) => {
      if (!rawRule || typeof rawRule !== 'object') {
        if (verbose) {
          this.logger.warn({ rawRule }, 'Ignoring rateLimit rule (expected object)');
        }
        return;
      }

      let pattern = rawRule.path || rawRule.pattern;
      if (typeof pattern !== 'string' || !pattern.trim()) {
        if (verbose) {
          this.logger.warn({ index: index }, 'rateLimit.rules[] missing path/pattern');
        }
        return;
      }

      pattern = pattern.trim();
      if (!pattern.startsWith('/')) {
        pattern = `/${pattern.replace(/^\/*/, '')}`;
      }

      normalized.push({
        id: `rate-limit-${index}-${pattern}`,
        pattern,
        windowMs: typeof rawRule.windowMs === 'number' ? rawRule.windowMs : undefined,
        maxRequests: typeof rawRule.maxRequests === 'number' ? rawRule.maxRequests : undefined,
        maxUniqueKeys: typeof rawRule.maxUniqueKeys === 'number' ? rawRule.maxUniqueKeys : undefined,
        key: rawRule.key || rawRule.scope || 'ip',
        keyHeader: rawRule.keyHeader || rawRule.header || 'x-api-key',
        keyGenerator: typeof rawRule.keyGenerator === 'function' ? rawRule.keyGenerator : null
      });
    });

    return normalized;
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
      this.logger.info('Installing...');
    }

    // Validate dependencies
    try {
      await this._validateDependencies();
    } catch (err) {
      if (this.config.verbose) {
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

    if (this.config.verbose) {
      this.logger.info('Installed successfully');
    }
  }

  /**
   * Create users resource for authentication
   * @private
   */
  async _createUsersResource() {
    const existingResource = this._findExistingUsersResource();

    if (!this.config.auth.createResource) {
      if (!existingResource) {
        throw new Error(
          `[API Plugin] Auth resource "${this.usersResourceName}" not found and auth.createResource is false`
        );
      }
      this.usersResource = existingResource;
      this.config.auth.resource = existingResource.name;
      if (this.config.verbose) {
        this.logger.info({ resourceName: existingResource.name }, 'Using existing resource for authentication');
      }
      return;
    }

    if (existingResource) {
      this.usersResource = existingResource;
      this.config.auth.resource = existingResource.name;
      if (this.config.verbose) {
        this.logger.info({ resourceName: existingResource.name }, 'Reusing existing resource for authentication');
      }
      return;
    }

    // Check if using external auth (OIDC/OAuth2) - password managed externally
    const hasExternalAuth = this.config.auth.drivers.some(driver =>
      ['oidc', 'oauth2'].includes(driver)
    );

    // Password is optional when using external auth providers
    const passwordValidation = hasExternalAuth
      ? 'secret|optional|minlength:8'  // Optional for OIDC/OAuth2 (external password management)
      : 'secret|required|minlength:8'; // Required for local auth (Basic, JWT, API Key)

    const [ok, err, resource] = await tryFn(() =>
      this.database.createResource({
        name: this.usersResourceName,
        attributes: {
          id: 'string|required',
          username: 'string|required|minlength:3',
          email: 'string|required|email',
          password: passwordValidation,
          apiKey: 'string|optional',
          jwtSecret: 'string|optional',
          role: 'string|default:user',
          scopes: 'array|items:string|optional',
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

    if (!ok) {
      throw err;
    }

    this.usersResource = resource;
    this.config.auth.resource = resource.name;
    if (this.config.verbose) {
      const authType = hasExternalAuth ? 'external auth (OIDC/OAuth2)' : 'local auth';
      const passwordNote = hasExternalAuth ? ' (password optional - managed externally)' : ' (password required)';
      this.logger.info({ usersResourceName: this.usersResourceName, authType: authType, passwordNote: passwordNote }, 'Created resource for');
    }
  }

  _findExistingUsersResource() {
    const candidates = new Set([this.usersResourceName]);

    const identityPlugin = this.database?.pluginRegistry?.identity || this.database?.pluginRegistry?.Identity;
    if (identityPlugin) {
      const identityNames = [
        identityPlugin.usersResource?.name,
        identityPlugin.config?.resources?.users?.mergedConfig?.name,
        identityPlugin.config?.resources?.users?.userConfig?.name
      ].filter(Boolean);
      for (const name of identityNames) {
        candidates.add(name);
      }
    }

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
   * Create rate limiting middleware
   * @private
   *
   * Implements sliding window rate limiting with configurable window size and max requests.
   * Returns 429 status code with Retry-After header when limit is exceeded.
   * Uses IP address or custom key generator to track request counts.
   */
  async _createRateLimitMiddleware() {
    const defaultStore = new Map();
    const ruleStores = new Map();
    const { windowMs, maxRequests, keyGenerator, maxUniqueKeys, rules = [] } = this.config.rateLimit;
    const hasRules = Array.isArray(rules) && rules.length > 0;
    const ruleKeyGenerators = new Map();

    const getClientIp = (c) => {
      const forwarded = c.req.header('x-forwarded-for');
      if (forwarded) {
        return forwarded.split(',')[0].trim();
      }
      const cfConnecting = c.req.header('cf-connecting-ip');
      if (cfConnecting) {
        return cfConnecting;
      }
      return c.req.raw?.socket?.remoteAddress || 'unknown';
    };

    const getRuleForPath = (path) => {
      if (!hasRules) return null;
      return findBestMatch(rules, path) || null;
    };

    const getStoreForRule = (rule) => {
      if (!rule) return defaultStore;
      if (!ruleStores.has(rule.id)) {
        ruleStores.set(rule.id, new Map());
      }
      return ruleStores.get(rule.id);
    };

    const getRuleKeyGenerator = (rule) => {
      if (!rule) return null;
      if (ruleKeyGenerators.has(rule.id)) {
        return ruleKeyGenerators.get(rule.id);
      }

      let generator = null;
      if (typeof rule.keyGenerator === 'function') {
        generator = rule.keyGenerator;
      } else {
        const keyType = (rule.key || 'ip').toLowerCase();
        if (keyType === 'user') {
          generator = (c) => c.get('user')?.id || c.get('user')?.email || getClientIp(c) || 'anonymous';
        } else if (keyType === 'apikey' || keyType === 'api-key') {
          const headerName = (rule.keyHeader || 'x-api-key').toLowerCase();
          generator = (c) => c.req.header(headerName) || getClientIp(c) || 'unknown';
        } else {
          generator = (c) => getClientIp(c) || 'unknown';
        }
      }

      ruleKeyGenerators.set(rule.id, generator);
      return generator;
    };

    return async (c, next) => {
      const currentPath = c.req.path || '/';
      const matchedRule = getRuleForPath(currentPath);
      const bucket = getStoreForRule(matchedRule);
      const effectiveWindow = matchedRule?.windowMs ?? windowMs;
      const effectiveLimit = matchedRule?.maxRequests ?? maxRequests;
      const effectiveMaxKeys = matchedRule?.maxUniqueKeys ?? maxUniqueKeys;
      const generator = matchedRule ? getRuleKeyGenerator(matchedRule) : keyGenerator;

      // Generate key (IP or custom)
      const keySource = typeof generator === 'function' ? generator(c) : getClientIp(c);
      const key = keySource || 'unknown';

      let record = bucket.get(key);

      // Reset expired records to prevent unbounded memory growth
      if (record && Date.now() > record.resetAt) {
        bucket.delete(key);
        record = null;
      }

      if (!record) {
        record = { count: 0, resetAt: Date.now() + effectiveWindow };
        bucket.set(key, record);
        if (bucket.size > effectiveMaxKeys) {
          const oldestKey = bucket.keys().next().value;
          if (oldestKey) {
            bucket.delete(oldestKey);
          }
        }
      }

      // Check limit
      if (record.count >= effectiveLimit) {
        const retryAfter = Math.ceil((record.resetAt - Date.now()) / 1000);
        c.header('Retry-After', retryAfter.toString());
        c.header('X-RateLimit-Limit', effectiveLimit.toString());
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
      c.header('X-RateLimit-Limit', effectiveLimit.toString());
      c.header('X-RateLimit-Remaining', Math.max(0, effectiveLimit - record.count).toString());
      c.header('X-RateLimit-Reset', record.resetAt.toString());

      await next();
    };
  }

  /**
   * Create logging middleware using Pino structured logging
   * 🪵 Replaces console.log with plugin logger for HTTP request/response logs
   * @private
   */
  async _createLoggingMiddleware() {
    const { format, colorize, filter, excludePaths } = this.config.logging;
    const logFormat = format || DEFAULT_LOG_FORMAT;
    const useDefaultStyle = logFormat === DEFAULT_LOG_FORMAT;
    const excludedPatterns = Array.isArray(excludePaths) ? excludePaths : [];

    // 🪵 Get child logger for HTTP request logging
    const httpLogger = this.getChildLogger('HTTP', { component: 'api-middleware' });

    const colorStatus = (status, value) => {
      if (!colorize) return value;
      let colorCode = '';
      if (status >= 500) colorCode = '\x1b[31m'; // red
      else if (status >= 400) colorCode = '\x1b[33m'; // yellow
      else if (status >= 300) colorCode = '\x1b[36m'; // cyan
      else if (status >= 200) colorCode = '\x1b[32m'; // green

      return colorCode ? `${colorCode}${value}\x1b[0m` : value;
    };

    const formatHeaderTokens = (message, headers) => {
      return message.replace(/:res\[([^\]]+)\]/gi, (_, headerName) => {
        const value = headers?.get(headerName) ?? headers?.get(headerName.toLowerCase());
        return value ?? '-';
      });
    };

    const replaceTokens = (message, replacements) => {
      let result = message;
      for (const { tokens, value } of replacements) {
        tokens.forEach((token) => {
          if (result.includes(token)) {
            result = result.split(token).join(String(value));
          }
        });
      }
      return result;
    };

    return async (c, next) => {
      const start = process.hrtime.bigint();
      const method = c.req.method;
      const path = c.req.path;
      const requestId = c.get('requestId');

      await next();

      const elapsedNs = process.hrtime.bigint() - start;
      const duration = Number(elapsedNs) / 1_000_000;
      const durationFormatted = duration.toFixed(3);
      const status = c.res?.status ?? 0;
      const user = c.get('user')?.username || c.get('user')?.email || 'anonymous';

      const skipByPath = excludedPatterns.some((pattern) => matchPath(pattern, path));
      const skipByFilter = typeof filter === 'function'
        ? filter({
            context: c,
            method,
            path,
            status,
            duration,
            requestId
          }) === false
        : false;

      if (skipByPath || skipByFilter) {
        return;
      }

      let urlPath = path;
      try {
        const parsed = new URL(c.req.url);
        urlPath = parsed.pathname + parsed.search;
      } catch {
        urlPath = path;
      }

      const baseReplacements = [
        { tokens: [':verb', ':method'], value: method },
        { tokens: [':ruta', ':path'], value: path },
        { tokens: [':url'], value: urlPath },
        { tokens: [':status'], value: colorStatus(status, String(status)) },
        { tokens: [':elapsed', ':response-time'], value: durationFormatted },
        { tokens: [':who', ':user'], value: user },
        { tokens: [':reqId', ':requestId'], value: requestId }
      ];

      const contentLength = c.res?.headers?.get('content-length') ?? '-';

      if (useDefaultStyle) {
        const sizeDisplay = contentLength === '-' ? '–' : contentLength;
        const methodText = colorize ? `${PASTEL_COLORS.method}${method}${ANSI_RESET}` : method;
        const urlText = colorize ? `${PASTEL_COLORS.url}${urlPath}${ANSI_RESET}` : urlPath;
        const arrowSymbol = colorize ? `${PASTEL_COLORS.arrow}⇒${ANSI_RESET}` : '⇒';
        const timeText = colorize ? `${PASTEL_COLORS.time}${durationFormatted}${ANSI_RESET}` : durationFormatted;
        const sizeText = colorize ? `${PASTEL_COLORS.size}${sizeDisplay}${ANSI_RESET}` : sizeDisplay;
        const line = `${methodText} ${urlPath} ${arrowSymbol} ${colorStatus(status, String(status))} (${timeText} ms, ${sizeText})`;

        // 🪵 Structured logging with Pino (replaces console.log)
        httpLogger.info({
          req: { method, url: urlPath },
          res: { statusCode: status },
          responseTime: duration,
          contentLength: sizeDisplay,
          requestId,
          user
        }, line); // Message includes colored formatting for TTY
        return;
      }

      let logMessage = replaceTokens(logFormat, baseReplacements);

      logMessage = formatHeaderTokens(logMessage, c.res?.headers);

      // 🪵 Structured logging with Pino (replaces console.log)
      httpLogger.info({
        req: { method, url: urlPath },
        res: { statusCode: status },
        responseTime: duration,
        requestId,
        user
      }, logMessage);
    };
  }

  /**
   * Create compression middleware (using Node.js zlib)
   * @private
   */
  async _createCompressionMiddleware() {
    const { threshold } = this.config.compression;

    // Content types that should NOT be compressed (already compressed)
    const skipContentTypes = [
      'image/', 'video/', 'audio/',
      'application/zip', 'application/gzip',
      'application/x-gzip', 'application/x-bzip2'
    ];

    // Cache-Control: no-transform regex (from Hono)
    const cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/i;

    return async (c, next) => {
      // IMPORTANT: Set Vary header BEFORE processing request
      // This ensures proxies/caches know the response varies by Accept-Encoding
      c.header('Vary', 'Accept-Encoding');

      await next();

      // Skip if response has no body
      if (!c.res || !c.res.body) {
        return;
      }

      // Skip if already compressed, Transfer-Encoding set, or HEAD request
      if (c.res.headers.has('content-encoding') ||
          c.res.headers.has('transfer-encoding') ||
          c.req.method === 'HEAD') {
        return;
      }

      // Skip if content-type should not be compressed
      const contentType = c.res.headers.get('content-type') || '';
      const isTextLike = contentType.startsWith('text/') || contentType.includes('json');
      if (skipContentTypes.some(type => contentType.startsWith(type)) || !isTextLike) {
        return;
      }

      // Respect Cache-Control: no-transform directive
      const cacheControl = c.res.headers.get('cache-control') || '';
      if (cacheControlNoTransformRegExp.test(cacheControl)) {
        return;
      }

      // Check Content-Length threshold
      const contentLength = c.res.headers.get('content-length');
      let payloadSize = contentLength ? Number(contentLength) : null;

      if ((!payloadSize || Number.isNaN(payloadSize)) && threshold > 0) {
        try {
          const clone = c.res.clone();
          const body = clone.body;
          if (body && typeof body.getReader === 'function') {
            const reader = body.getReader();
            let total = 0;
            try {
              while (total < threshold) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                  total += value.byteLength;
                }
                if (total >= threshold) {
                  total = threshold;
                  break;
                }
              }
            } finally {
              reader.releaseLock?.();
            }
            payloadSize = total;
          }
        } catch {
          payloadSize = null;
        }
      }

      if (payloadSize !== null && payloadSize < threshold) {
        return;
      }

      // Check Accept-Encoding header
      const acceptEncoding = c.req.header('accept-encoding') || '';

      // Determine encoding (prioritize brotli > gzip > deflate)
      let encoding = null;
      if (acceptEncoding.includes('br')) {
        encoding = 'br';
      } else if (acceptEncoding.includes('gzip')) {
        encoding = 'gzip';
      } else if (acceptEncoding.includes('deflate')) {
        encoding = 'deflate';
      }

      // If client doesn't support compression, skip
      if (!encoding) {
        return;
      }

      try {
        // Use CompressionStream for gzip/deflate (stream-based, avoids ReadableStream lock)
        // Brotli ('br') requires different approach as CompressionStream doesn't support it yet
        if (encoding === 'gzip' || encoding === 'deflate') {
          const stream = new CompressionStream(encoding);
          c.res = new Response(c.res.body.pipeThrough(stream), c.res);
          c.res.headers.delete('Content-Length');
          c.res.headers.set('Content-Encoding', encoding);
        } else if (encoding === 'br') {
          // For brotli, we need to use zlib.brotliCompress (not stream-based)
          // This requires consuming the body, which can cause issues
          // For now, fallback to gzip if available, otherwise skip
          if (acceptEncoding.includes('gzip')) {
            const stream = new CompressionStream('gzip');
            c.res = new Response(c.res.body.pipeThrough(stream), c.res);
            c.res.headers.delete('Content-Length');
            c.res.headers.set('Content-Encoding', 'gzip');
          }
          // Otherwise skip - no brotli support yet without consuming stream
        }
      } catch (err) {
        // Compression failed, log and continue with uncompressed response
        if (this.config.verbose) {
          this.logger.error({ error: err.message }, 'Compression error');
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
      const cspConfig = security.contentSecurityPolicy;

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
      verbose: this.config.verbose,
      auth: this.config.auth,
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
      if (ok && this.config.verbose) {
        this.logger.info({ usersResourceName: this.usersResourceName }, 'Deleted resource');
      }
    }

    if (this.config.verbose) {
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
