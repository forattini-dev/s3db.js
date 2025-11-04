/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and delegates routing/middleware concerns
 * to dedicated components (MiddlewareChain, Router, HealthManager).
 */

import { errorHandler } from '../shared/error-handler.js';
import * as formatter from '../shared/response-formatter.js';
import { createOIDCHandler } from './auth/oidc-auth.js';
import { FailbanManager } from './concerns/failban-manager.js';
import { validatePathAuth } from './utils/path-matcher.js';
import { ApiEventEmitter } from './concerns/event-emitter.js';
import { MetricsCollector } from './concerns/metrics-collector.js';
import { MiddlewareChain } from './server/middleware-chain.class.js';
import { Router } from './server/router.class.js';
import { HealthManager } from './server/health-manager.class.js';
import { OpenAPIGeneratorCached } from './utils/openapi-generator-cached.class.js';
import { AuthStrategyFactory } from './auth/strategies/factory.class.js';

export class ApiServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      host: options.host || '0.0.0.0',
      database: options.database,
      namespace: options.namespace || null,
      versionPrefix: options.versionPrefix,
      resources: options.resources || {},
      routes: options.routes || {},
      templates: options.templates || { enabled: false, engine: 'jsx' },
      middlewares: options.middlewares || [],
      cors: options.cors || { enabled: false },
      security: options.security || { enabled: false },
      sessionTracking: options.sessionTracking || { enabled: false },
      requestId: options.requestId || { enabled: false },
      events: options.events || { enabled: false },
      metrics: options.metrics || { enabled: false },
      failban: options.failban || { enabled: false },
      static: Array.isArray(options.static) ? options.static : [],
      health: options.health ?? { enabled: true },
      verbose: options.verbose || false,
      auth: options.auth || {},
      docsEnabled: (options.docs?.enabled !== false) && (options.docsEnabled !== false),
      docsUI: options.docs?.ui || options.docsUI || 'redoc',
      apiTitle: options.docs?.title || options.apiTitle || 's3db.js API',
      apiVersion: options.docs?.version || options.apiVersion || '1.0.0',
      apiDescription: options.docs?.description || options.apiDescription || 'Auto-generated REST API for s3db.js resources',
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024
    };

    this.app = null;
    this.server = null;
    this.isRunning = false;
    this.initialized = false;
    this.oidcMiddleware = null;
    this.middlewareChain = null;
    this.router = null;
    this.healthManager = null;

    this.inFlightRequests = new Set();
    this.acceptingRequests = true;

    this.events = new ApiEventEmitter({
      enabled: this.options.events?.enabled !== false,
      verbose: this.options.events?.verbose || this.options.verbose,
      maxListeners: this.options.events?.maxListeners
    });

    this.metrics = new MetricsCollector({
      enabled: this.options.metrics?.enabled !== false,
      verbose: this.options.metrics?.verbose || this.options.verbose,
      maxPathsTracked: this.options.metrics?.maxPathsTracked,
      resetInterval: this.options.metrics?.resetInterval
    });

    if (this.options.metrics?.enabled && this.options.events?.enabled !== false) {
      this._setupMetricsEventListeners();
    }

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
        geo: this.options.failban.geo || {},
        resourceNames: this.options.failban.resourceNames || {}
      });
    }

    this.relationsPlugin = this.options.database?.plugins?.relation ||
      this.options.database?.plugins?.RelationPlugin ||
      null;

    const resolvedHost = (this.options.host || 'localhost') === '0.0.0.0'
      ? 'localhost'
      : (this.options.host || 'localhost');

    this.openApiGenerator = new OpenAPIGeneratorCached({
      database: this.options.database,
      options: {
        auth: this.options.auth,
        resources: this.options.resources,
        versionPrefix: this.options.versionPrefix,
        title: this.options.apiTitle,
        version: this.options.apiVersion,
        description: this.options.apiDescription,
        serverUrl: `http://${resolvedHost}:${this.options.port}`,
        verbose: this.options.verbose
      }
    });
  }

  async start() {
    if (this.isRunning) {
      console.warn('[API Plugin] Server is already running');
      return;
    }

    if (!this.initialized) {
      const { Hono } = await import('hono');
      const { serve } = await import('@hono/node-server');
      const { swaggerUI } = await import('@hono/swagger-ui');
      const { cors } = await import('hono/cors');

      this.Hono = Hono;
      this.serve = serve;
      this.swaggerUI = swaggerUI;
      this.cors = cors;
      this.app = new Hono();

      if (this.failban) {
        await this.failban.initialize();
      }

      this.middlewareChain = new MiddlewareChain({
        requestId: this.options.requestId,
        cors: this.options.cors,
        security: this.options.security,
        sessionTracking: this.options.sessionTracking,
        middlewares: this.options.middlewares,
        templates: this.options.templates,
        maxBodySize: this.options.maxBodySize,
        failban: this.failban,
        events: this.events,
        verbose: this.options.verbose,
        database: this.options.database,
        inFlightRequests: this.inFlightRequests,
        acceptingRequests: () => this.acceptingRequests,
        corsMiddleware: this.cors
      });
      this.middlewareChain.apply(this.app);

      const oidcDriver = this.options.auth?.drivers?.find((d) => d.driver === 'oidc');
      if (oidcDriver) {
        this._setupOIDCRoutes(oidcDriver.config);
      }

      const authMiddleware = this._createAuthMiddleware();

      this.router = new Router({
        database: this.options.database,
        resources: this.options.resources,
        routes: this.options.routes,
        versionPrefix: this.options.versionPrefix,
        auth: this.options.auth,
        static: this.options.static,
        failban: this.failban,
        metrics: this.metrics,
        relationsPlugin: this.relationsPlugin,
        authMiddleware,
        verbose: this.options.verbose,
        Hono: this.Hono
      });
      this.router.mount(this.app, this.events);

      if (this.options.health?.enabled !== false) {
        this.healthManager = new HealthManager({
          database: this.options.database,
          healthConfig: this.options.health,
          verbose: this.options.verbose
        });
        this.healthManager.register(this.app);
      }

      this._setupDocumentationRoutes();

      this.app.onError((err, c) => errorHandler(err, c));
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

      this.initialized = true;
    }

    const { port, host } = this.options;

    return new Promise((resolve, reject) => {
      try {
        this.server = this.serve(
          {
            fetch: this.app.fetch,
            port,
            hostname: host,
            // ⚡ OPTIMIZATION: HTTP Keep-Alive (20-30% latency reduction)
            keepAliveTimeout: 65000,  // 65 seconds
            headersTimeout: 66000      // 66 seconds (must be > keepAliveTimeout)
          },
          (info) => {
            this.isRunning = true;
            console.log(`[API Plugin] Server listening on http://${info.address}:${info.port}`);

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
          }
        );
      } catch (err) {
        reject(err);
      }
    });
  }

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
      this.isRunning = false;
      console.log('[API Plugin] Server stopped');
    }

    if (this.metrics) {
      this.metrics.stop();
    }

    if (this.failban) {
      await this.failban.cleanup();
    }

    // Cleanup OIDC client if present
    if (this.oidcMiddleware && typeof this.oidcMiddleware.destroy === 'function') {
      this.oidcMiddleware.destroy();
    }
  }

  getInfo() {
    return {
      isRunning: this.isRunning,
      port: this.options.port,
      host: this.options.host,
      resources: Object.keys(this.options.database?.resources || {}).length
    };
  }

  getApp() {
    return this.app;
  }

  stopAcceptingRequests() {
    this.acceptingRequests = false;
    if (this.options.verbose) {
      console.log('[API Server] Stopped accepting new requests');
    }
  }

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

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.options.verbose) {
      console.log('[API Server] All requests finished');
    }

    return true;
  }

  async shutdown({ timeout = 30000 } = {}) {
    if (!this.isRunning) {
      console.warn('[API Server] Server is not running');
      return;
    }

    console.log('[API Server] Initiating graceful shutdown...');
    this.stopAcceptingRequests();

    const finished = await this.waitForRequestsToFinish({ timeout });
    if (!finished) {
      console.warn('[API Server] Some requests did not finish in time');
    }

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

  _setupMetricsEventListeners() {
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

    this.events.on('user:created', () => {
      this.metrics.recordUserEvent({ action: 'created' });
    });

    this.events.on('user:login', () => {
      this.metrics.recordUserEvent({ action: 'login' });
    });

    if (this.options.verbose) {
      console.log('[API Server] Metrics event listeners configured');
    }
  }

  _setupDocumentationRoutes() {
    if (this.options.docsEnabled) {
      this.app.get('/openapi.json', (c) => {
        const spec = this.openApiGenerator.generate();
        return c.json(spec);
      });

      if (this.options.docsUI === 'swagger') {
        this.app.get('/docs', this.swaggerUI({ url: '/openapi.json' }));
      } else {
        this.app.get('/docs', (c) => c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.options.apiTitle} - API Documentation</title>
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <redoc spec-url="/openapi.json"></redoc>
  <script src="https://cdn.redoc.ly/redoc/v2.5.1/bundles/redoc.standalone.js"></script>
</body>
</html>`));
      }
    }

    this.app.get('/', (c) => {
      if (this.options.rootHandler) {
        return this.options.rootHandler(c);
      }

      if (this.options.docsEnabled) {
        return c.redirect('/docs', 302);
      }

      return c.json(formatter.success({
        status: 'ok',
        message: 's3db.js API is running'
      }));
    });
  }

  _setupOIDCRoutes(config) {
    const { database, auth } = this.options;
    const authResource = database.resources[auth.resource];

    if (!authResource) {
      console.error(`[API Plugin] Auth resource '${auth.resource}' not found for OIDC`);
      return;
    }

    const oidcHandler = createOIDCHandler(config, this.app, authResource, this.events);
    this.oidcMiddleware = oidcHandler.middleware;

    if (this.options.verbose) {
      console.log('[API Plugin] Mounted OIDC routes:');
      for (const [path, description] of Object.entries(oidcHandler.routes)) {
        console.log(`[API Plugin]   ${path} - ${description}`);
      }
    }
  }

  _createAuthMiddleware() {
    const { database, auth } = this.options;
    const { drivers, resource: defaultResourceName, pathAuth, pathRules } = auth;

    if (!drivers || drivers.length === 0) {
      return null;
    }

    const authResource = database.resources[defaultResourceName];
    if (!authResource) {
      console.error(`[API Plugin] Auth resource '${defaultResourceName}' not found for middleware`);
      return null;
    }

    if (pathAuth) {
      try {
        validatePathAuth(pathAuth);
      } catch (err) {
        console.error(`[API Plugin] Invalid pathAuth configuration: ${err.message}`);
        throw err;
      }
    }

    const strategy = AuthStrategyFactory.create({
      drivers,
      authResource,
      oidcMiddleware: this.oidcMiddleware || null,
      pathRules,
      pathAuth,
      events: this.events,
      verbose: this.options.verbose
    });

    try {
      return strategy.createMiddleware();
    } catch (err) {
      console.error('[API Plugin] Failed to create auth middleware:', err.message);
      throw err;
    }
  }

  _generateOpenAPISpec() {
    return this.openApiGenerator.generate();
  }
}

export default ApiServer;
