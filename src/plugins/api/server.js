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
import { setupTemplateEngine } from './utils/template-engine.js';
import { createPathBasedAuthMiddleware, findAuthRule } from './auth/path-auth-matcher.js';
import { jwtAuth } from './auth/jwt-auth.js';
import { apiKeyAuth } from './auth/api-key-auth.js';
import { basicAuth } from './auth/basic-auth.js';
import { createOAuth2Handler } from './auth/oauth2-auth.js';
import { createRequestIdMiddleware } from './middlewares/request-id.js';
import { createSecurityHeadersMiddleware } from './middlewares/security-headers.js';
import { createSessionTrackingMiddleware } from './middlewares/session-tracking.js';
import { createAuthDriverRateLimiter } from './middlewares/rate-limit.js';
import { createFailbanMiddleware, setupFailbanViolationListener, createFailbanAdminRoutes } from './middlewares/failban.js';
import { FailbanManager } from './concerns/failban-manager.js';
import { ApiEventEmitter } from './concerns/event-emitter.js';
import { MetricsCollector } from './concerns/metrics-collector.js';

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
      templates: options.templates || { enabled: false, engine: 'jsx' }, // Template engine config
      middlewares: options.middlewares || [],
      requestId: options.requestId || { enabled: false }, // Request ID tracking config
      cors: options.cors || { enabled: false }, // CORS configuration
      security: options.security || { enabled: false }, // Security headers config
      sessionTracking: options.sessionTracking || { enabled: false }, // Session tracking config
      events: options.events || { enabled: false }, // Event hooks config
      metrics: options.metrics || { enabled: false }, // Metrics collection config
      failban: options.failban || { enabled: false }, // Failban (fail2ban-style) config
      verbose: options.verbose || false,
      auth: options.auth || {},
      static: options.static || [], // Static file serving config
      docsEnabled: options.docsEnabled !== false, // Enable /docs by default
      docsUI: options.docsUI || 'redoc', // 'swagger' or 'redoc'
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024, // 10MB default
      rootHandler: options.rootHandler, // Custom handler for root path, if not provided redirects to /docs
      versionPrefix: options.versionPrefix, // Global version prefix config
      namespace: options.namespace || null,
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

    // Graceful shutdown tracking
    this.inFlightRequests = new Set(); // Track in-flight requests
    this.acceptingRequests = true; // Accept new requests flag

    // Event emitter
    this.events = new ApiEventEmitter({
      enabled: this.options.events?.enabled !== false,
      verbose: this.options.events?.verbose || this.options.verbose,
      maxListeners: this.options.events?.maxListeners
    });

    // Metrics collector
    this.metrics = new MetricsCollector({
      enabled: this.options.metrics?.enabled !== false,
      verbose: this.options.metrics?.verbose || this.options.verbose,
      maxPathsTracked: this.options.metrics?.maxPathsTracked,
      resetInterval: this.options.metrics?.resetInterval
    });

    // Wire up event listeners to metrics collector
    if (this.options.metrics?.enabled && this.options.events?.enabled !== false) {
      this._setupMetricsEventListeners();
    }

    // Failban manager (fail2ban-style automatic banning - internal feature)
    this.failban = null;
    if (this.options.failban?.enabled) {
      this.failban = new FailbanManager({
        database: this.options.database,
        namespace: this.options.namespace,
        enabled: true,
        maxViolations: this.options.failban.maxViolations || 3,
        violationWindow: this.options.failban.violationWindow || 3600000,
        banDuration: this.options.failban.banDuration || 86400000,
        whitelist: this.options.failban.whitelist || ['127.0.0.1', '::1'],
        blacklist: this.options.failban.blacklist || [],
        persistViolations: this.options.failban.persistViolations !== false,
        verbose: this.options.failban.verbose || this.options.verbose,
        geo: this.options.failban.geo || {}
      });
    }

    // Detect if RelationPlugin is installed
    this.relationsPlugin = this.options.database?.plugins?.relation ||
                          this.options.database?.plugins?.RelationPlugin ||
                          null;

    // Routes will be setup in start() after dynamic import
  }

  /**
   * Setup metrics event listeners
   * @private
   */
  _setupMetricsEventListeners() {
    // Request metrics
    this.events.on('request:end', (data) => {
      this.metrics.recordRequest({
        method: data.method,
        path: data.path,
        status: data.status,
        duration: data.duration
      });
    });

    this.events.on('request:error', (data) => {
      this.metrics.recordError({
        error: data.error,
        type: 'request'
      });
    });

    // Auth metrics
    this.events.on('auth:success', (data) => {
      this.metrics.recordAuth({
        success: true,
        method: data.method
      });
    });

    this.events.on('auth:failure', (data) => {
      this.metrics.recordAuth({
        success: false,
        method: data.allowedMethods?.[0] || 'unknown'
      });
    });

    // Resource metrics
    this.events.on('resource:created', (data) => {
      this.metrics.recordResourceOperation({
        action: 'created',
        resource: data.resource
      });
    });

    this.events.on('resource:updated', (data) => {
      this.metrics.recordResourceOperation({
        action: 'updated',
        resource: data.resource
      });
    });

    this.events.on('resource:deleted', (data) => {
      this.metrics.recordResourceOperation({
        action: 'deleted',
        resource: data.resource
      });
    });

    // User metrics
    this.events.on('user:created', (data) => {
      this.metrics.recordUserEvent({
        action: 'created'
      });
    });

    this.events.on('user:login', (data) => {
      this.metrics.recordUserEvent({
        action: 'login'
      });
    });

    if (this.options.verbose) {
      console.log('[API Server] Metrics event listeners configured');
    }
  }

  /**
   * Setup request tracking middleware for graceful shutdown
   * @private
   */
  _setupRequestTracking() {
    this.app.use('*', async (c, next) => {
      // Check if we're still accepting requests
      if (!this.acceptingRequests) {
        return c.json({ error: 'Server is shutting down' }, 503);
      }

      // Track this request
      const requestId = Symbol('request');
      this.inFlightRequests.add(requestId);

      const startTime = Date.now();
      const requestInfo = {
        requestId: c.get('requestId') || requestId.toString(),
        method: c.req.method,
        path: c.req.path,
        userAgent: c.req.header('user-agent'),
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
      };

      // Emit request:start
      this.events.emitRequestEvent('start', requestInfo);

      try {
        await next();

        // Emit request:end
        this.events.emitRequestEvent('end', {
          ...requestInfo,
          duration: Date.now() - startTime,
          status: c.res.status
        });
      } catch (err) {
        // Emit request:error
        this.events.emitRequestEvent('error', {
          ...requestInfo,
          duration: Date.now() - startTime,
          error: err.message,
          stack: err.stack
        });
        throw err; // Re-throw for error handler
      } finally {
        // Remove from tracking when done
        this.inFlightRequests.delete(requestId);
      }
    });
  }

  /**
   * Stop accepting new requests
   * @returns {void}
   */
  stopAcceptingRequests() {
    this.acceptingRequests = false;
    if (this.options.verbose) {
      console.log('[API Server] Stopped accepting new requests');
    }
  }

  /**
   * Wait for all in-flight requests to finish
   * @param {Object} options - Options
   * @param {number} options.timeout - Max time to wait in ms (default: 30000)
   * @returns {Promise<boolean>} True if all requests finished, false if timeout
   */
  async waitForRequestsToFinish({ timeout = 30000 } = {}) {
    const startTime = Date.now();

    while (this.inFlightRequests.size > 0) {
      const elapsed = Date.now() - startTime;

      if (elapsed >= timeout) {
        if (this.options.verbose) {
          console.warn(`[API Server] Timeout waiting for ${this.inFlightRequests.size} in-flight requests`);
        }
        return false;
      }

      if (this.options.verbose) {
        console.log(`[API Server] Waiting for ${this.inFlightRequests.size} in-flight requests...`);
      }

      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.options.verbose) {
      console.log('[API Server] All requests finished');
    }
    return true;
  }

  /**
   * Graceful shutdown
   * @param {Object} options - Shutdown options
   * @param {number} options.timeout - Max time to wait for requests (default: 30000)
   * @returns {Promise<void>}
   */
  async shutdown({ timeout = 30000 } = {}) {
    if (!this.isRunning) {
      console.warn('[API Server] Server is not running');
      return;
    }

    console.log('[API Server] Initiating graceful shutdown...');

    // Stop accepting new requests
    this.stopAcceptingRequests();

    // Wait for in-flight requests to finish
    const allFinished = await this.waitForRequestsToFinish({ timeout });

    if (!allFinished) {
      console.warn('[API Server] Some requests did not finish in time');
    }

    // Close HTTP server
    if (this.server) {
      await new Promise((resolve, reject) => {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    this.isRunning = false;
    console.log('[API Server] Shutdown complete');
  }

  /**
   * Setup all routes
   * @private
   */
  _setupRoutes() {
    // Request tracking for graceful shutdown (must be first!)
    this._setupRequestTracking();

    // Failban middleware (check banned IPs early)
    if (this.failban) {
      const failbanMiddleware = createFailbanMiddleware({
        plugin: this.failban,
        events: this.events
      });
      this.app.use('*', failbanMiddleware);

      // Setup violation listeners (connects events to failban)
      setupFailbanViolationListener({
        plugin: this.failban,
        events: this.events
      });

      if (this.options.verbose) {
        console.log('[API Server] Failban protection enabled');
      }
    }

    // Request ID middleware (before all other middlewares)
    if (this.options.requestId?.enabled) {
      const requestIdMiddleware = createRequestIdMiddleware(this.options.requestId);
      this.app.use('*', requestIdMiddleware);

      if (this.options.verbose) {
        console.log(`[API Server] Request ID tracking enabled (header: ${this.options.requestId.headerName || 'X-Request-ID'})`);
      }
    }

    // CORS middleware
    if (this.options.cors?.enabled) {
      const corsConfig = this.options.cors;
      this.app.use('*', this.cors({
        origin: corsConfig.origin || '*',
        allowMethods: corsConfig.allowMethods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: corsConfig.allowHeaders || ['Content-Type', 'Authorization', 'X-Request-ID'],
        exposeHeaders: corsConfig.exposeHeaders || ['X-Request-ID'],
        credentials: corsConfig.credentials || false,
        maxAge: corsConfig.maxAge || 86400  // 24 hours cache by default
      }));

      if (this.options.verbose) {
        console.log(`[API Server] CORS enabled (maxAge: ${corsConfig.maxAge || 86400}s, origin: ${corsConfig.origin || '*'})`);
      }
    }

    // Security headers middleware
    if (this.options.security?.enabled) {
      const securityMiddleware = createSecurityHeadersMiddleware(this.options.security);
      this.app.use('*', securityMiddleware);

      if (this.options.verbose) {
        console.log('[API Server] Security headers enabled');
      }
    }

    // Session tracking middleware
    if (this.options.sessionTracking?.enabled) {
      const sessionMiddleware = createSessionTrackingMiddleware(
        this.options.sessionTracking,
        this.options.database
      );
      this.app.use('*', sessionMiddleware);

      if (this.options.verbose) {
        const resource = this.options.sessionTracking.resource ? ` (resource: ${this.options.sessionTracking.resource})` : ' (in-memory)';
        console.log(`[API Server] Session tracking enabled${resource}`);
      }
    }

    // Apply global middlewares
    this.options.middlewares.forEach(middleware => {
      this.app.use('*', middleware);
    });

    // Template engine middleware (if enabled)
    if (this.options.templates?.enabled) {
      const templateMiddleware = setupTemplateEngine(this.options.templates);
      this.app.use('*', templateMiddleware);

      if (this.options.verbose) {
        console.log(`[API Server] Template engine enabled: ${this.options.templates.engine}`);
      }
    }

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
    this.app.get('/health/ready', async (c) => {
      const checks = {};
      let isHealthy = true;

      // Get custom checks configuration
      const healthConfig = this.options.health || {};
      const customChecks = healthConfig.readiness?.checks || [];

      // Built-in: Database check
      try {
        const startTime = Date.now();
        const isDbReady = this.options.database &&
                         this.options.database.connected &&
                         Object.keys(this.options.database.resources).length > 0;
        const latency = Date.now() - startTime;

        if (isDbReady) {
          checks.s3db = {
            status: 'healthy',
            latency_ms: latency,
            resources: Object.keys(this.options.database.resources).length
          };
        } else {
          checks.s3db = {
            status: 'unhealthy',
            connected: this.options.database?.connected || false,
            resources: Object.keys(this.options.database?.resources || {}).length
          };
          isHealthy = false;
        }
      } catch (err) {
        checks.s3db = {
          status: 'unhealthy',
          error: err.message
        };
        isHealthy = false;
      }

      // Execute custom checks
      for (const check of customChecks) {
        try {
          const startTime = Date.now();
          const timeout = check.timeout || 5000;

          // Run check with timeout
          const result = await Promise.race([
            check.check(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), timeout)
            )
          ]);

          const latency = Date.now() - startTime;

          checks[check.name] = {
            status: result.healthy ? 'healthy' : 'unhealthy',
            latency_ms: latency,
            ...result
          };

          // Only mark as unhealthy if check is not optional
          if (!result.healthy && !check.optional) {
            isHealthy = false;
          }
        } catch (err) {
          checks[check.name] = {
            status: 'unhealthy',
            error: err.message
          };

          // Only mark as unhealthy if check is not optional
          if (!check.optional) {
            isHealthy = false;
          }
        }
      }

      const status = isHealthy ? 200 : 503;

      return c.json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks
      }, status);
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

    // Metrics endpoint
    if (this.options.metrics?.enabled) {
      this.app.get('/metrics', (c) => {
        const summary = this.metrics.getSummary();
        const response = formatter.success(summary);
        return c.json(response);
      });

      if (this.options.verbose) {
        console.log('[API Server] Metrics endpoint enabled at /metrics');
      }
    }

    // Failban admin endpoints
    if (this.failban) {
      const failbanAdminRoutes = createFailbanAdminRoutes(this.Hono, this.failban);
      this.app.route('/admin/security', failbanAdminRoutes);

      if (this.options.verbose) {
        console.log('[API Server] Failban admin endpoints enabled at /admin/security');
      }
    }

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

    // Setup authentication routes if JWT driver is configured
    const hasJwtDriver = Array.isArray(this.options.auth?.drivers)
      ? this.options.auth.drivers.some(d => d.driver === 'jwt')
      : false;

    if (this.options.auth?.driver || hasJwtDriver) {
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
    const { database, resources: resourceConfigs = {} } = this.options;

    // Get all resources from database
    const resources = database.resources;

    // Create global auth middleware (applies to all resources, guards control access)
    const authMiddleware = this._createAuthMiddleware();

    for (const [name, resource] of Object.entries(resources)) {
      const resourceConfig = resourceConfigs[name];
      const isPluginResource = name.startsWith('plg_');

      // Internal plugin resources require explicit opt-in
      if (isPluginResource && !resourceConfig) {
        if (this.options.verbose) {
          console.log(`[API Plugin] Skipping internal resource '${name}' (not included in config.resources)`);
        }
        continue;
      }

      // Allow explicit disabling via config
      if (resourceConfig?.enabled === false) {
        if (this.options.verbose) {
          console.log(`[API Plugin] Resource '${name}' disabled via config.resources`);
        }
        continue;
      }

      // Determine version
      const version = resource.config?.currentVersion || resource.version || 'v1';

      // Determine version prefix (resource-level overrides global)
      let versionPrefixConfig;
      if (resourceConfig && resourceConfig.versionPrefix !== undefined) {
        versionPrefixConfig = resourceConfig.versionPrefix;
      } else if (resource.config && resource.config.versionPrefix !== undefined) {
        versionPrefixConfig = resource.config.versionPrefix;
      } else if (this.options.versionPrefix !== undefined) {
        versionPrefixConfig = this.options.versionPrefix;
      } else {
        versionPrefixConfig = false;
      }

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

      // Add global authentication middleware unless explicitly disabled
      const authDisabled = resourceConfig?.auth === false;

      if (authMiddleware && !authDisabled) {
        middlewares.push(authMiddleware);
      }

      // Add resource-specific middleware from config (support single fn or array)
      const extraMiddleware = resourceConfig?.customMiddleware;
      if (extraMiddleware) {
        const toRegister = Array.isArray(extraMiddleware) ? extraMiddleware : [extraMiddleware];

        for (const middleware of toRegister) {
          if (typeof middleware === 'function') {
            middlewares.push(middleware);
          } else if (this.options.verbose) {
            console.warn(`[API Plugin] Ignoring non-function middleware for resource '${name}'`);
          }
        }
      }

      // Normalize HTTP methods (resource config > resource definition > defaults)
      let methods = resourceConfig?.methods || resource.config?.methods;
      if (!Array.isArray(methods) || methods.length === 0) {
        methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
      } else {
        methods = methods
          .filter(Boolean)
          .map(method => typeof method === 'string' ? method.toUpperCase() : method);
      }

      // Determine validation toggle
      const enableValidation = resourceConfig?.validation !== undefined
        ? resourceConfig.validation !== false
        : resource.config?.validation !== false;

      // Create resource routes
      const resourceApp = createResourceRoutes(resource, version, {
        methods,
        customMiddleware: middlewares,
        enableValidation,
        versionPrefix: prefix,
        events: this.events
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
    const oidcHandler = createOIDCHandler(config, this.app, authResource, this.events);

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
    const { drivers, resource: defaultResourceName, pathAuth, pathRules } = auth;

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

    // NEW: If pathRules configured, use new path-based auth system
    if (pathRules && pathRules.length > 0) {
      return this._createPathRulesAuthMiddleware(authResource, drivers, pathRules);
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
   * Create path-based auth middleware using pathRules
   * @private
   * @param {Object} authResource - Users resource for authentication
   * @param {Array} drivers - Auth driver configurations
   * @param {Array} pathRules - Path-based auth rules
   * @returns {Function} Hono middleware
   */
  _createPathRulesAuthMiddleware(authResource, drivers, pathRules) {
    // Build auth middlewares map by driver type
    const authMiddlewares = {};

    for (const driverDef of drivers) {
      const driverType = driverDef.type || driverDef.driver;
      const driverConfig = driverDef.config || driverDef;

      // Skip oauth2-server (not a request auth method)
      if (driverType === 'oauth2-server') {
        continue;
      }

      // OIDC middleware (already configured)
      if (driverType === 'oidc') {
        if (this.oidcMiddleware) {
          authMiddlewares.oidc = this.oidcMiddleware;
        }
        continue;
      }

      // JWT
      if (driverType === 'jwt') {
        authMiddlewares.jwt = jwtAuth({
          secret: driverConfig.jwtSecret || driverConfig.secret,
          expiresIn: driverConfig.jwtExpiresIn || driverConfig.expiresIn || '7d',
          usersResource: authResource,
          optional: true
        });
      }

      // API Key
      if (driverType === 'apiKey') {
        authMiddlewares.apiKey = apiKeyAuth({
          headerName: driverConfig.headerName || 'X-API-Key',
          usersResource: authResource,
          optional: true
        });
      }

      // Basic Auth
      if (driverType === 'basic') {
        authMiddlewares.basic = basicAuth({
          authResource,
          usernameField: driverConfig.usernameField || 'email',
          passwordField: driverConfig.passwordField || 'password',
          passphrase: driverConfig.passphrase || 'secret',
          adminUser: driverConfig.adminUser || null,
          optional: true
        });
      }

      // OAuth2
      if (driverType === 'oauth2') {
        const oauth2Handler = createOAuth2Handler(driverConfig, authResource);
        authMiddlewares.oauth2 = async (c, next) => {
          const user = await oauth2Handler(c);
          if (user) {
            c.set('user', user);
            return await next();
          }
        };
      }
    }

    if (this.options.verbose) {
      console.log(`[API Server] Path-based auth with ${pathRules.length} rules`);
      console.log(`[API Server] Available auth methods: ${Object.keys(authMiddlewares).join(', ')}`);
    }

    // Create and return path-based auth middleware
    return createPathBasedAuthMiddleware({
      rules: pathRules,
      authMiddlewares,
      unauthorizedHandler: (c, message) => {
        // Content negotiation
        const acceptHeader = c.req.header('accept') || '';
        const acceptsHtml = acceptHeader.includes('text/html');

        if (acceptsHtml) {
          // Redirect to login if OIDC is available
          if (authMiddlewares.oidc) {
            return c.redirect('/auth/login', 302);
          }
        }

        return c.json({
          error: 'Unauthorized',
          message
        }, 401);
      },
      events: this.events
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
            fallback: driverConfig.fallback,
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
      const { cors } = await import('hono/cors');

      // Store for use in _setupRoutes
      this.Hono = Hono;
      this.serve = serve;
      this.swaggerUI = swaggerUI;
      this.cors = cors;

      // Initialize app
      this.app = new Hono();

      // Initialize failban manager if enabled
      if (this.failban) {
        await this.failban.initialize();
      }

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

          // Setup graceful shutdown on SIGTERM/SIGINT
          const shutdownHandler = async (signal) => {
            console.log(`[API Server] Received ${signal}, initiating graceful shutdown...`);
            try {
              await this.shutdown({ timeout: 30000 });
              process.exit(0);
            } catch (err) {
              console.error('[API Server] Error during shutdown:', err);
              process.exit(1);
            }
          };

          process.once('SIGTERM', () => shutdownHandler('SIGTERM'));
          process.once('SIGINT', () => shutdownHandler('SIGINT'));

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

    // Cleanup metrics collector
    if (this.metrics) {
      this.metrics.stop();
    }

    // Cleanup failban plugin
    if (this.failban) {
      await this.failban.cleanup();
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
    const { port, host, database, resources, auth, apiInfo, versionPrefix } = this.options;

    return generateOpenAPISpec(database, {
      title: apiInfo.title,
      version: apiInfo.version,
      description: apiInfo.description,
      serverUrl: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
      auth,
      resources,
      versionPrefix
    });
  }
}

export default ApiServer;
