/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and routing
 */

import { createResourceRoutes, createRelationalRoutes } from './routes/resource-routes.js';
import { createAuthRoutes } from './routes/auth-routes.js';
import { mountCustomRoutes } from './utils/custom-routes.js';
import { errorHandler } from '../shared/error-handler.js';
import * as formatter from '../shared/response-formatter.js';
import { generateOpenAPISpec } from './utils/openapi-generator.js';
import { createAuthMiddleware } from './auth/index.js';
import { createOIDCHandler } from './auth/oidc-auth.js';
import { findBestMatch, validatePathAuth } from './utils/path-matcher.js';
import { createFilesystemHandler, validateFilesystemConfig } from './utils/static-filesystem.js';
import { createS3Handler, validateS3Config } from './utils/static-s3.js';

/**
 * API Server class
 * @class
 */
export class ApiServer {
  /**
   * Create API server
   * @param {Object} options - Server options
   * @param {number} options.port - Server port
   * @param {string} options.host - Server host
   * @param {Object} options.database - s3db.js database instance
   * @param {Object} options.resources - Resource configuration
   * @param {Array} options.middlewares - Global middlewares
   */
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      host: options.host || '0.0.0.0',
      database: options.database,
      resources: options.resources || {},
      routes: options.routes || {}, // Plugin-level custom routes
      middlewares: options.middlewares || [],
      verbose: options.verbose || false,
      auth: options.auth || {},
      static: options.static || [], // Static file serving config
      docsEnabled: options.docsEnabled !== false, // Enable /docs by default
      docsUI: options.docsUI || 'redoc', // 'swagger' or 'redoc'
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024, // 10MB default
      rootHandler: options.rootHandler, // Custom handler for root path, if not provided redirects to /docs
      versionPrefix: options.versionPrefix, // Global version prefix config
      apiInfo: {
        title: options.apiTitle || 's3db.js API',
        version: options.apiVersion || '1.0.0',
        description: options.apiDescription || 'Auto-generated REST API for s3db.js resources'
      }
    };

    this.app = null; // Will be initialized in start() with dynamic import
    this.server = null;
    this.isRunning = false;
    this.openAPISpec = null;
    this.initialized = false;

    // Detect if RelationPlugin is installed
    this.relationsPlugin = this.options.database?.plugins?.relation ||
                          this.options.database?.plugins?.RelationPlugin ||
                          null;

    // Routes will be setup in start() after dynamic import
  }

  /**
   * Setup all routes
   * @private
   */
  _setupRoutes() {
    // Apply global middlewares
    this.options.middlewares.forEach(middleware => {
      this.app.use('*', middleware);
    });

    // Body size limit middleware (only for POST, PUT, PATCH)
    this.app.use('*', async (c, next) => {
      const method = c.req.method;

      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const contentLength = c.req.header('content-length');

        if (contentLength) {
          const size = parseInt(contentLength);

          if (size > this.options.maxBodySize) {
            const response = formatter.payloadTooLarge(size, this.options.maxBodySize);
            c.header('Connection', 'close'); // Close connection for large payloads
            return c.json(response, response._status);
          }
        }
      }

      await next();
    });

    // Kubernetes Liveness Probe - checks if app is alive
    // If this fails, k8s will restart the pod
    this.app.get('/health/live', (c) => {
      // Simple check: if we can respond, we're alive
      const response = formatter.success({
        status: 'alive',
        timestamp: new Date().toISOString()
      });
      return c.json(response);
    });

    // Kubernetes Readiness Probe - checks if app is ready to receive traffic
    // If this fails, k8s will remove pod from service endpoints
    this.app.get('/health/ready', (c) => {
      // Check if database is connected and resources are loaded
      const isReady = this.options.database &&
                      this.options.database.connected &&
                      Object.keys(this.options.database.resources).length > 0;

      if (!isReady) {
        const response = formatter.error('Service not ready', {
          status: 503,
          code: 'NOT_READY',
          details: {
            database: {
              connected: this.options.database?.connected || false,
              resources: Object.keys(this.options.database?.resources || {}).length
            }
          }
        });
        return c.json(response, 503);
      }

      const response = formatter.success({
        status: 'ready',
        database: {
          connected: true,
          resources: Object.keys(this.options.database.resources).length
        },
        timestamp: new Date().toISOString()
      });
      return c.json(response);
    });

    // Generic Health Check endpoint
    this.app.get('/health', (c) => {
      const response = formatter.success({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        checks: {
          liveness: '/health/live',
          readiness: '/health/ready'
        }
      });
      return c.json(response);
    });

    // Root endpoint - custom handler or redirect to docs
    this.app.get('/', (c) => {
      // If user provided a custom root handler, use it
      if (this.options.rootHandler) {
        return this.options.rootHandler(c);
      }

      // Otherwise, redirect to docs
      return c.redirect('/docs', 302);
    });

    // Setup static file serving (before resource routes to give static files priority)
    this._setupStaticRoutes();

    // OpenAPI spec endpoint
    if (this.options.docsEnabled) {
      this.app.get('/openapi.json', (c) => {
        if (!this.openAPISpec) {
          this.openAPISpec = this._generateOpenAPISpec();
        }
        return c.json(this.openAPISpec);
      });

      // API Documentation UI endpoint
      if (this.options.docsUI === 'swagger') {
        this.app.get('/docs', this.swaggerUI({
          url: '/openapi.json'
        }));
      } else {
        this.app.get('/docs', (c) => {
          return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.options.apiInfo.title} - API Documentation</title>
  <style>
    body {
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  <redoc spec-url="/openapi.json"></redoc>
  <script src="https://cdn.redoc.ly/redoc/v2.5.1/bundles/redoc.standalone.js"></script>
</body>
</html>`);
        });
      }
    }

    // Setup resource routes
    this._setupResourceRoutes();

    // Setup authentication routes if driver is configured
    if (this.options.auth.driver) {
      this._setupAuthRoutes();
    }

    // Setup OIDC routes if configured
    const oidcDriver = this.options.auth?.drivers?.find(d => d.driver === 'oidc');
    if (oidcDriver) {
      this._setupOIDCRoutes(oidcDriver.config);
    }

    // Setup relational routes if RelationPlugin is active
    if (this.relationsPlugin) {
      this._setupRelationalRoutes();
    }

    // Setup plugin-level custom routes
    this._setupPluginRoutes();

    // Global error handler
    this.app.onError((err, c) => {
      return errorHandler(err, c);
    });

    // 404 handler
    this.app.notFound((c) => {
      const response = formatter.error('Route not found', {
        status: 404,
        code: 'NOT_FOUND',
        details: {
          path: c.req.path,
          method: c.req.method
        }
      });
      return c.json(response, 404);
    });
  }

  /**
   * Setup routes for all resources
   * @private
   */
  _setupResourceRoutes() {
    const { database } = this.options;

    // Get all resources from database
    const resources = database.resources;

    // Create global auth middleware (applies to all resources, guards control access)
    const authMiddleware = this._createAuthMiddleware();

    for (const [name, resource] of Object.entries(resources)) {
      // Skip plugin resources (they're internal)
      if (name.startsWith('plg_')) {
        continue;
      }

      // Determine version
      const version = resource.config?.currentVersion || resource.version || 'v1';

      // Determine version prefix (resource-level overrides global)
      let versionPrefixConfig = resource.config?.versionPrefix !== undefined
        ? resource.config?.versionPrefix
        : this.options.versionPrefix !== undefined
          ? this.options.versionPrefix
          : false;

      // Calculate the actual prefix to use
      let prefix = '';
      if (versionPrefixConfig === true) {
        // true: use resource version
        prefix = version;
      } else if (versionPrefixConfig === false) {
        // false: no prefix
        prefix = '';
      } else if (typeof versionPrefixConfig === 'string') {
        // string: custom prefix
        prefix = versionPrefixConfig;
      }

      // Prepare custom middleware
      const middlewares = [];

      // Add global authentication middleware (always applied, guards control authorization)
      if (authMiddleware) {
        middlewares.push(authMiddleware);
      }

      // Create resource routes
      const resourceApp = createResourceRoutes(resource, version, {
        methods: resource.config?.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        customMiddleware: middlewares,
        enableValidation: resource.config?.validation !== false,
        versionPrefix: prefix
      }, this.Hono);

      // Mount resource routes (with or without prefix)
      const mountPath = prefix ? `/${prefix}/${name}` : `/${name}`;
      this.app.route(mountPath, resourceApp);

      if (this.options.verbose) {
        console.log(`[API Plugin] Mounted routes for resource '${name}' at ${mountPath}`);
      }

      // Mount custom routes for this resource
      if (resource.config?.routes) {
        const routeContext = {
          resource,
          database,
          resourceName: name,
          version
        };

        // Mount on the resourceApp (nested under resource path)
        mountCustomRoutes(resourceApp, resource.config.routes, routeContext, this.options.verbose);
      }
    }
  }

  /**
   * Setup authentication routes (when auth drivers are configured)
   * @private
   */
  _setupAuthRoutes() {
    const { database, auth } = this.options;
    const { drivers, resource: resourceName, usernameField, passwordField } = auth;

    // Find first JWT driver (for /auth/login endpoint)
    const jwtDriver = drivers.find(d => d.driver === 'jwt');

    if (!jwtDriver) {
      // No JWT driver = no /auth routes
      return;
    }

    // Get auth resource from database
    const authResource = database.resources[resourceName];
    if (!authResource) {
      console.error(`[API Plugin] Auth resource '${resourceName}' not found. Skipping auth routes.`);
      return;
    }

    const driverConfig = jwtDriver.config || {};

    // Prepare auth config for routes
    const authConfig = {
      driver: 'jwt',
      usernameField,
      passwordField,
      jwtSecret: driverConfig.jwtSecret || driverConfig.secret,
      jwtExpiresIn: driverConfig.jwtExpiresIn || driverConfig.expiresIn || '7d',
      passphrase: driverConfig.passphrase || 'secret',
      allowRegistration: driverConfig.allowRegistration !== false
    };

    // Create auth routes
    const authApp = createAuthRoutes(authResource, authConfig);

    // Mount auth routes at /auth
    this.app.route('/auth', authApp);

    if (this.options.verbose) {
      console.log('[API Plugin] Mounted auth routes (driver: jwt) at /auth');
    }
  }

  /**
   * Setup OIDC routes (when oidc driver is configured)
   * @private
   * @param {Object} config - OIDC driver configuration
   */
  _setupOIDCRoutes(config) {
    const { database, auth } = this.options;
    const authResource = database.resources[auth.resource];

    if (!authResource) {
      console.error(`[API Plugin] Auth resource '${auth.resource}' not found for OIDC`);
      return;
    }

    // Create OIDC handler (which creates routes + middleware)
    const oidcHandler = createOIDCHandler(config, this.app, authResource);

    // Store middleware for later use in _createAuthMiddleware
    this.oidcMiddleware = oidcHandler.middleware;

    if (this.options.verbose) {
      console.log('[API Plugin] Mounted OIDC routes:');
      for (const [path, description] of Object.entries(oidcHandler.routes)) {
        console.log(`[API Plugin]   ${path} - ${description}`);
      }
    }
  }

  /**
   * Create authentication middleware based on configured drivers
   * @private
   * @returns {Function|null} Hono middleware or null
   */
  _createAuthMiddleware() {
    const { database, auth } = this.options;
    const { drivers, resource: defaultResourceName, pathAuth } = auth;

    // If no drivers configured, no auth
    if (!drivers || drivers.length === 0) {
      return null;
    }

    // Get auth resource
    const authResource = database.resources[defaultResourceName];
    if (!authResource) {
      console.error(`[API Plugin] Auth resource '${defaultResourceName}' not found for middleware`);
      return null;
    }

    // Validate pathAuth config if provided
    if (pathAuth) {
      try {
        validatePathAuth(pathAuth);
      } catch (err) {
        console.error(`[API Plugin] Invalid pathAuth configuration: ${err.message}`);
        throw err;
      }
    }

    // Helper: Extract driver configs from drivers array
    const extractDriverConfigs = (driverNames) => {
      const configs = {
        jwt: {},
        apiKey: {},
        basic: {},
        oauth2: {}
      };

      for (const driverDef of drivers) {
        const driverName = driverDef.driver;
        const driverConfig = driverDef.config || {};

        // Skip if not in requested drivers
        if (driverNames && !driverNames.includes(driverName)) {
          continue;
        }

        // Skip oauth2-server and oidc drivers (they're handled separately)
        if (driverName === 'oauth2-server' || driverName === 'oidc') {
          continue;
        }

        // Map driver configs
        if (driverName === 'jwt') {
          configs.jwt = {
            secret: driverConfig.jwtSecret || driverConfig.secret,
            expiresIn: driverConfig.jwtExpiresIn || driverConfig.expiresIn || '7d'
          };
        } else if (driverName === 'apiKey') {
          configs.apiKey = {
            headerName: driverConfig.headerName || 'X-API-Key'
          };
        } else if (driverName === 'basic') {
          configs.basic = {
            realm: driverConfig.realm || 'API Access',
            passphrase: driverConfig.passphrase || 'secret'
          };
        } else if (driverName === 'oauth2') {
          configs.oauth2 = driverConfig;
        }
      }

      return configs;
    };

    // If pathAuth is defined, create path-based conditional middleware
    if (pathAuth) {
      return async (c, next) => {
        const requestPath = c.req.path;

        // Find best matching rule for this path
        const matchedRule = findBestMatch(pathAuth, requestPath);

        if (this.options.verbose) {
          if (matchedRule) {
            console.log(`[API Plugin] Path ${requestPath} matched rule: ${matchedRule.pattern}`);
          } else {
            console.log(`[API Plugin] Path ${requestPath} no pathAuth rule matched (using global auth)`);
          }
        }

        // If no rule matched, use global auth (all drivers, optional)
        if (!matchedRule) {
          const methods = drivers
            .map(d => d.driver)
            .filter(d => d !== 'oauth2-server' && d !== 'oidc');

          const driverConfigs = extractDriverConfigs(null); // all drivers

          const globalAuth = createAuthMiddleware({
            methods,
            jwt: driverConfigs.jwt,
            apiKey: driverConfigs.apiKey,
            basic: driverConfigs.basic,
            oauth2: driverConfigs.oauth2,
            oidc: this.oidcMiddleware || null,
            usersResource: authResource,
            optional: true
          });

          return await globalAuth(c, next);
        }

        // Rule matched - check if auth is required
        if (!matchedRule.required) {
          // Public path - no auth required
          return await next();
        }

        // Auth required - apply with specific drivers from rule
        const ruleMethods = matchedRule.drivers || [];
        const driverConfigs = extractDriverConfigs(ruleMethods);

        const ruleAuth = createAuthMiddleware({
          methods: ruleMethods,
          jwt: driverConfigs.jwt,
          apiKey: driverConfigs.apiKey,
          basic: driverConfigs.basic,
          oauth2: driverConfigs.oauth2,
          oidc: this.oidcMiddleware || null,
          usersResource: authResource,
          optional: false  // Auth is required for this path
        });

        return await ruleAuth(c, next);
      };
    }

    // No pathAuth - use original behavior (global auth, all drivers)
    const methods = [];
    const driverConfigs = {
      jwt: {},
      apiKey: {},
      basic: {},
      oauth2: {}
    };

    for (const driverDef of drivers) {
      const driverName = driverDef.driver;
      const driverConfig = driverDef.config || {};

      // Skip oauth2-server and oidc drivers (they're handled separately)
      if (driverName === 'oauth2-server' || driverName === 'oidc') {
        continue;
      }

      if (!methods.includes(driverName)) {
        methods.push(driverName);
      }

      // Map driver configs
      if (driverName === 'jwt') {
        driverConfigs.jwt = {
          secret: driverConfig.jwtSecret || driverConfig.secret,
          expiresIn: driverConfig.jwtExpiresIn || driverConfig.expiresIn || '7d'
        };
      } else if (driverName === 'apiKey') {
        driverConfigs.apiKey = {
          headerName: driverConfig.headerName || 'X-API-Key'
        };
      } else if (driverName === 'basic') {
        driverConfigs.basic = {
          realm: driverConfig.realm || 'API Access',
          passphrase: driverConfig.passphrase || 'secret'
        };
      } else if (driverName === 'oauth2') {
        driverConfigs.oauth2 = driverConfig;
      }
    }

    // Create unified auth middleware
    return createAuthMiddleware({
      methods,
      jwt: driverConfigs.jwt,
      apiKey: driverConfigs.apiKey,
      basic: driverConfigs.basic,
      oauth2: driverConfigs.oauth2,
      oidc: this.oidcMiddleware || null,  // OIDC middleware (if configured)
      usersResource: authResource,
      optional: true  // Let guards handle authorization
    });
  }

  /**
   * Setup relational routes (when RelationPlugin is active)
   * @private
   */
  _setupRelationalRoutes() {
    if (!this.relationsPlugin || !this.relationsPlugin.relations) {
      return;
    }

    const { database } = this.options;
    const relations = this.relationsPlugin.relations;

    if (this.options.verbose) {
      console.log('[API Plugin] Setting up relational routes...');
    }

    for (const [resourceName, relationsDef] of Object.entries(relations)) {
      const resource = database.resources[resourceName];
      if (!resource) {
        if (this.options.verbose) {
          console.warn(`[API Plugin] Resource '${resourceName}' not found for relational routes`);
        }
        continue;
      }

      // Skip plugin resources unless explicitly included
      if (resourceName.startsWith('plg_') && !this.options.resources[resourceName]) {
        continue;
      }

      const version = resource.config?.currentVersion || resource.version || 'v1';

      for (const [relationName, relationConfig] of Object.entries(relationsDef)) {
        // Only create routes for relations that should be exposed via API
        // Skip belongsTo relations (they're just reverse lookups, not useful as endpoints)
        if (relationConfig.type === 'belongsTo') {
          continue;
        }

        // Check if relation should be exposed (default: yes, unless explicitly disabled)
        const resourceConfig = this.options.resources[resourceName];
        const exposeRelation = resourceConfig?.relations?.[relationName]?.expose !== false;

        if (!exposeRelation) {
          continue;
        }

        // Create relational routes
        const relationalApp = createRelationalRoutes(
          resource,
          relationName,
          relationConfig,
          version,
          this.Hono
        );

        // Mount relational routes at /{version}/{resource}/:id/{relation}
        this.app.route(`/${version}/${resourceName}/:id/${relationName}`, relationalApp);

        if (this.options.verbose) {
          console.log(
            `[API Plugin] Mounted relational route: /${version}/${resourceName}/:id/${relationName} ` +
            `(${relationConfig.type} -> ${relationConfig.resource})`
          );
        }
      }
    }
  }

  /**
   * Setup plugin-level custom routes
   * @private
   */
  _setupPluginRoutes() {
    const { routes, database } = this.options;

    if (!routes || Object.keys(routes).length === 0) {
      return;
    }

    // Plugin-level routes context
    const context = {
      database,
      plugins: database?.plugins || {}
    };

    // Mount plugin routes directly on main app (not nested)
    mountCustomRoutes(this.app, routes, context, this.options.verbose);

    if (this.options.verbose) {
      console.log(`[API Plugin] Mounted ${Object.keys(routes).length} plugin-level custom routes`);
    }
  }

  /**
   * Setup static file serving routes
   * @private
   */
  _setupStaticRoutes() {
    const { static: staticConfigs, database } = this.options;

    if (!staticConfigs || staticConfigs.length === 0) {
      return;
    }

    if (!Array.isArray(staticConfigs)) {
      throw new Error('Static config must be an array of mount points');
    }

    for (const [index, config] of staticConfigs.entries()) {
      try {
        // Validate required fields
        if (!config.driver) {
          throw new Error(`static[${index}]: "driver" is required (filesystem or s3)`);
        }

        if (!config.path) {
          throw new Error(`static[${index}]: "path" is required (mount path)`);
        }

        if (!config.path.startsWith('/')) {
          throw new Error(`static[${index}]: "path" must start with / (got: ${config.path})`);
        }

        const driverConfig = config.config || {};

        // Create handler based on driver
        let handler;

        if (config.driver === 'filesystem') {
          // Validate filesystem-specific config
          validateFilesystemConfig({ ...config, ...driverConfig });

          handler = createFilesystemHandler({
            root: config.root,
            index: driverConfig.index,
            maxAge: driverConfig.maxAge,
            dotfiles: driverConfig.dotfiles,
            etag: driverConfig.etag,
            cors: driverConfig.cors
          });

        } else if (config.driver === 's3') {
          // Validate S3-specific config
          validateS3Config({ ...config, ...driverConfig });

          // Get S3 client from database
          const s3Client = database?.client?.client; // S3Client instance

          if (!s3Client) {
            throw new Error(`static[${index}]: S3 driver requires database with S3 client`);
          }

          handler = createS3Handler({
            s3Client,
            bucket: config.bucket,
            prefix: config.prefix,
            streaming: driverConfig.streaming,
            signedUrlExpiry: driverConfig.signedUrlExpiry,
            maxAge: driverConfig.maxAge,
            cacheControl: driverConfig.cacheControl,
            contentDisposition: driverConfig.contentDisposition,
            etag: driverConfig.etag,
            cors: driverConfig.cors
          });

        } else {
          throw new Error(
            `static[${index}]: invalid driver "${config.driver}". Valid drivers: filesystem, s3`
          );
        }

        // Mount handler at specified path
        // Use wildcard to match all sub-paths
        const mountPath = config.path === '/' ? '/*' : `${config.path}/*`;
        this.app.get(mountPath, handler);
        this.app.head(mountPath, handler);

        if (this.options.verbose) {
          console.log(
            `[API Plugin] Mounted static files (${config.driver}) at ${config.path}` +
            (config.driver === 'filesystem' ? ` -> ${config.root}` : ` -> s3://${config.bucket}/${config.prefix || ''}`)
          );
        }

      } catch (err) {
        console.error(`[API Plugin] Failed to setup static files for index ${index}:`, err.message);
        throw err;
      }
    }
  }

  /**
   * Start the server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      console.warn('[API Plugin] Server is already running');
      return;
    }

    // Dynamic import of Hono dependencies (peer dependencies)
    // This ensures hono is only loaded when server actually starts
    if (!this.initialized) {
      const { Hono } = await import('hono');
      const { serve } = await import('@hono/node-server');
      const { swaggerUI } = await import('@hono/swagger-ui');

      // Store for use in _setupRoutes
      this.Hono = Hono;
      this.serve = serve;
      this.swaggerUI = swaggerUI;

      // Initialize app
      this.app = new Hono();

      // Setup all routes
      this._setupRoutes();

      this.initialized = true;
    }

    const { port, host } = this.options;

    return new Promise((resolve, reject) => {
      try {
        this.server = this.serve({
          fetch: this.app.fetch,
          port,
          hostname: host
        }, (info) => {
          this.isRunning = true;
          console.log(`[API Plugin] Server listening on http://${info.address}:${info.port}`);
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stop the server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      console.warn('[API Plugin] Server is not running');
      return;
    }

    if (this.server && typeof this.server.close === 'function') {
      await new Promise((resolve) => {
        this.server.close(() => {
          this.isRunning = false;
          console.log('[API Plugin] Server stopped');
          resolve();
        });
      });
    } else {
      // For some Hono adapters, server might not have close method
      this.isRunning = false;
      console.log('[API Plugin] Server stopped');
    }
  }

  /**
   * Get server info
   * @returns {Object} Server information
   */
  getInfo() {
    return {
      isRunning: this.isRunning,
      port: this.options.port,
      host: this.options.host,
      resources: Object.keys(this.options.database.resources).length
    };
  }

  /**
   * Get Hono app instance
   * @returns {Hono} Hono app
   */
  getApp() {
    return this.app;
  }

  /**
   * Generate OpenAPI specification
   * @private
   * @returns {Object} OpenAPI spec
   */
  _generateOpenAPISpec() {
    const { port, host, database, resources, auth, apiInfo } = this.options;

    return generateOpenAPISpec(database, {
      title: apiInfo.title,
      version: apiInfo.version,
      description: apiInfo.description,
      serverUrl: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
      auth,
      resources
    });
  }
}

export default ApiServer;
