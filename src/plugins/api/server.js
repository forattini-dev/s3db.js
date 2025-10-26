/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and routing
 */

import { createResourceRoutes, createRelationalRoutes } from './routes/resource-routes.js';
import { createAuthRoutes } from './routes/auth-routes.js';
import { mountCustomRoutes } from './utils/custom-routes.js';
import { errorHandler } from './utils/error-handler.js';
import * as formatter from './utils/response-formatter.js';
import { generateOpenAPISpec } from './utils/openapi-generator.js';
import { jwtAuth } from './auth/jwt-auth.js';
import { basicAuth } from './auth/basic-auth.js';

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
    const { database, resources: resourceConfigs } = this.options;

    // Get all resources from database
    const resources = database.resources;

    for (const [name, resource] of Object.entries(resources)) {
      // Skip plugin resources unless explicitly included
      if (name.startsWith('plg_') && !resourceConfigs[name]) {
        continue;
      }

      // Get resource configuration
      const config = resourceConfigs[name] || {
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        auth: false
      };

      // Determine version
      const version = resource.config?.currentVersion || resource.version || 'v1';

      // Determine version prefix (resource-level overrides global)
      // Priority: resource.versionPrefix > global versionPrefix > false (default - no prefix)
      let versionPrefixConfig = config.versionPrefix !== undefined
        ? config.versionPrefix
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
      const middlewares = [...(config.customMiddleware || [])];

      // Add authentication middleware if required
      if (config.auth && this.options.auth.driver) {
        const authMiddleware = this._createAuthMiddleware();
        if (authMiddleware) {
          middlewares.unshift(authMiddleware); // Add at beginning
        }
      }

      // Create resource routes
      const resourceApp = createResourceRoutes(resource, version, {
        methods: config.methods,
        customMiddleware: middlewares,
        enableValidation: config.validation !== false,
        versionPrefix: prefix
      }, this.Hono);

      // Mount resource routes (with or without prefix)
      const mountPath = prefix ? `/${prefix}/${name}` : `/${name}`;
      this.app.route(mountPath, resourceApp);

      if (this.options.verbose) {
        console.log(`[API Plugin] Mounted routes for resource '${name}' at ${mountPath}`);
      }

      // Mount custom routes for this resource (if defined)
      if (config.routes) {
        const routeContext = {
          resource,
          database,
          resourceName: name,
          version
        };

        // Mount on the resourceApp (nested under resource path)
        mountCustomRoutes(resourceApp, config.routes, routeContext, this.options.verbose);
      }
    }
  }

  /**
   * Setup authentication routes (when auth driver is configured)
   * @private
   */
  _setupAuthRoutes() {
    const { database, auth } = this.options;
    const { driver, resource: resourceName, usernameField, passwordField, config } = auth;

    // Get auth resource from database
    const authResource = database.resources[resourceName];
    if (!authResource) {
      console.error(`[API Plugin] Auth resource '${resourceName}' not found. Skipping auth routes.`);
      return;
    }

    // Prepare auth config for routes
    const authConfig = {
      driver,
      usernameField,
      passwordField,
      jwtSecret: config.jwtSecret || config.secret,
      jwtExpiresIn: config.jwtExpiresIn || config.expiresIn || '7d',
      passphrase: config.passphrase || 'secret',
      allowRegistration: config.allowRegistration !== false
    };

    // Create auth routes
    const authApp = createAuthRoutes(authResource, authConfig);

    // Mount auth routes at /auth
    this.app.route('/auth', authApp);

    if (this.options.verbose) {
      console.log(`[API Plugin] Mounted auth routes (driver: ${driver}) at /auth`);
    }
  }

  /**
   * Create authentication middleware based on driver
   * @private
   * @returns {Function|null} Auth middleware function
   */
  _createAuthMiddleware() {
    const { database, auth } = this.options;
    const { driver, resource: resourceName, usernameField, passwordField, config } = auth;

    if (!driver) {
      return null;
    }

    const authResource = database.resources[resourceName];
    if (!authResource) {
      console.error(`[API Plugin] Auth resource '${resourceName}' not found for middleware`);
      return null;
    }

    if (driver === 'jwt') {
      const jwtSecret = config.jwtSecret || config.secret;
      if (!jwtSecret) {
        console.error('[API Plugin] JWT driver requires jwtSecret in config');
        return null;
      }

      return jwtAuth({
        secret: jwtSecret,
        authResource,
        usernameField,
        passwordField
      });
    }

    if (driver === 'basic') {
      return basicAuth({
        realm: config.realm || 'API Access',
        authResource,
        usernameField,
        passwordField,
        passphrase: config.passphrase || 'secret'
      });
    }

    console.error(`[API Plugin] Unknown auth driver: ${driver}`);
    return null;
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
