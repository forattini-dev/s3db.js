/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and delegates routing/middleware concerns
 * to dedicated components (MiddlewareChain, Router, HealthManager).
 */

import { errorHandler } from '../shared/error-handler.js';
import * as formatter from '../shared/response-formatter.js';
import { createOIDCHandler } from './auth/oidc-auth.js';
import { createSessionStore } from './concerns/session-store-factory.js';
import { FailbanManager } from './concerns/failban-manager.js';
import { validatePathAuth } from './utils/path-matcher.js';
import { ApiEventEmitter } from './concerns/event-emitter.js';
import { MetricsCollector } from './concerns/metrics-collector.js';
import { MiddlewareChain } from './server/middleware-chain.class.js';
import { Router } from './server/router.class.js';
import { HealthManager } from './server/health-manager.class.js';
import { OpenAPIGeneratorCached } from './utils/openapi-generator-cached.class.js';
import { AuthStrategyFactory } from './auth/strategies/factory.class.js';
import { applyBasePath } from './utils/base-path.js';
import { networkInterfaces } from 'node:os';

export class ApiServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      host: options.host || '0.0.0.0',
      database: options.database,
      namespace: options.namespace || null,
      basePath: options.basePath || '',
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
      docsCsp: options.docsCsp || options.docs?.csp || null,
      apiTitle: options.docs?.title || options.apiTitle || 's3db.js API',
      apiVersion: options.docs?.version || options.apiVersion || '1.0.0',
      apiDescription: options.docs?.description || options.apiDescription || 'Auto-generated REST API for s3db.js resources',
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024,
      startupBanner: options.startupBanner !== false,
      rootRoute: options.rootRoute // undefined = default splash, false = disabled, function = custom handler
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
      resetInterval: this.options.metrics?.resetInterval,
      format: this.options.metrics?.format || 'json'
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

    this.relationsPlugin = this.options.database?.pluginRegistry?.relation ||
      this.options.database?.pluginRegistry?.RelationPlugin ||
      null;

    const resolvedHost = (this.options.host || 'localhost') === '0.0.0.0'
      ? 'localhost'
      : (this.options.host || 'localhost');

    this.openApiGenerator = new OpenAPIGeneratorCached({
      database: this.options.database,
      options: {
        auth: this.options.auth,
        resources: this.options.resources,
        routes: this.options.routes,
        versionPrefix: this.options.versionPrefix,
        basePath: this.options.basePath,
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
      if (this.options.verbose) {
        console.warn('[API Plugin] Server is already running');
      }
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

      // IMPORTANT: Register MetricsPlugin /metrics route BEFORE middlewares
      // This allows Prometheus scraping without authentication
      this._registerMetricsPluginRoute();

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
        await this._setupOIDCRoutes(oidcDriver.config);
      }

      const authMiddleware = this._createAuthMiddleware();

      // ⚠️ IMPORTANT: Setup documentation routes BEFORE router mounting
      // This ensures /docs and /openapi.json are registered before catch-all routes like /:urlId
      this._setupDocumentationRoutes();

      this.router = new Router({
        database: this.options.database,
        resources: this.options.resources,
        routes: this.options.routes,
        versionPrefix: this.options.versionPrefix,
        basePath: this.options.basePath,
        auth: this.options.auth,
        static: this.options.static,
        failban: this.failban,
        metrics: this.metrics,
        relationsPlugin: this.relationsPlugin,
        authMiddleware,
        verbose: this.options.verbose,
        Hono: this.Hono,
        apiTitle: this.options.apiTitle,
        apiDescription: this.options.apiDescription,
        docsEnabled: this.options.docsEnabled,
        rootRoute: this.options.rootRoute
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
            if (this.options.verbose) {
              console.log(`[API Plugin] Server listening on http://${info.address}:${info.port}`);
            }
            this._printStartupBanner(info);

            const shutdownHandler = async (signal) => {
              if (this.options.verbose) {
                console.log(`[API Server] Received ${signal}, initiating graceful shutdown...`);
              }
              try {
                await this.shutdown({ timeout: 30000 });
                process.exit(0);
              } catch (err) {
                if (this.options.verbose) {
                  console.error('[API Server] Error during shutdown:', err);
                }
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
      if (this.options.verbose) {
        console.warn('[API Plugin] Server is not running');
      }
      return;
    }

    if (this.server && typeof this.server.close === 'function') {
      await new Promise((resolve) => {
        this.server.close(() => {
          this.isRunning = false;
          if (this.options.verbose) {
            console.log('[API Plugin] Server stopped');
          }
          resolve();
        });
      });
    } else {
      this.isRunning = false;
      if (this.options.verbose) {
        console.log('[API Plugin] Server stopped');
      }
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

  /**
   * Register MetricsPlugin /metrics route BEFORE auth middlewares
   * Called during initialize() before middlewareChain.apply()
   * @private
   */
  _registerMetricsPluginRoute() {
    // Find MetricsPlugin instance
    const metricsPlugin = this.options.database?.pluginRegistry?.metrics ||
                          this.options.database?.pluginRegistry?.MetricsPlugin;

    if (!metricsPlugin) {
      return; // No MetricsPlugin installed
    }

    // Check if Prometheus is enabled
    if (!metricsPlugin.config?.prometheus?.enabled) {
      return; // Prometheus export disabled
    }

    // Only register if mode is 'integrated' or 'auto' (and API Plugin detected)
    const mode = metricsPlugin.config.prometheus.mode;
    if (mode !== 'integrated' && mode !== 'auto') {
      return; // Standalone mode doesn't use APIPlugin
    }

    const path = metricsPlugin.config.prometheus.path || '/metrics';
    const enforceIpAllowlist = metricsPlugin.config.prometheus.enforceIpAllowlist;
    const ipAllowlist = metricsPlugin.config.prometheus.ipAllowlist || [];

    // Register PUBLIC route (no auth middlewares applied yet, but with IP filtering)
    this.app.get(path, async (c) => {
      // IP allowlist check (if enabled)
      if (enforceIpAllowlist) {
        // Lazy-load IP allowlist helper (only when needed)
        const { isIpAllowed, getClientIp } = await import('../concerns/ip-allowlist.js');
        const clientIp = getClientIp(c);

        if (!clientIp || !isIpAllowed(clientIp, ipAllowlist)) {
          if (this.options.verbose) {
            console.warn(
              `[API Server] Blocked /metrics request from unauthorized IP: ${clientIp || 'unknown'}`
            );
          }
          return c.text('Forbidden', 403);
        }
      }

      try {
        const metrics = await metricsPlugin.getPrometheusMetrics();
        return c.text(metrics, 200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
        });
      } catch (err) {
        if (this.options.verbose) {
          console.error('[API Server] Error generating Prometheus metrics:', err);
        }
        return c.text('Internal Server Error', 500);
      }
    });

    if (this.options.verbose) {
      const ipFilter = enforceIpAllowlist ? ` (IP allowlist: ${ipAllowlist.length} ranges)` : ' (no IP filtering)';
      console.log(
        `[API Server] Registered MetricsPlugin route: ${path}${ipFilter}`
      );
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
      if (this.options.verbose) {
        console.warn('[API Server] Server is not running');
      }
      return;
    }

    if (this.options.verbose) {
      console.log('[API Server] Initiating graceful shutdown...');
    }
    this.stopAcceptingRequests();

    const finished = await this.waitForRequestsToFinish({ timeout });
    if (!finished) {
      if (this.options.verbose) {
        console.warn('[API Server] Some requests did not finish in time');
      }
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
    if (this.options.verbose) {
      console.log('[API Server] Shutdown complete');
    }
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
    if (this.options.verbose) {
      console.log('[API Server] _setupDocumentationRoutes()');
      console.log('[API Server] docsEnabled =', this.options.docsEnabled);
      console.log('[API Server] docsUI =', this.options.docsUI);
    }

    const basePath = this.options.basePath || '';
    const openApiPath = applyBasePath(basePath, '/openapi.json');
    const docsPath = applyBasePath(basePath, '/docs');

    if (this.options.verbose) {
      console.log('[API Server] docsPath =', docsPath);
      console.log('[API Server] openApiPath =', openApiPath);
    }

    // OpenAPI spec endpoint
    if (this.options.docsEnabled) {
      if (this.options.verbose) {
        console.log('[API Server] Registering OpenAPI route:', openApiPath);
      }
      this.app.get(openApiPath, (c) => {
        if (this.options.verbose) {
          console.log('[API Server] OpenAPI route hit');
        }
        const spec = this.openApiGenerator.generate();
        return c.json(spec);
      });
      if (this.options.verbose) {
        console.log('[API Server] OpenAPI route registered');
      }

      // Documentation UI endpoint
      if (this.options.docsUI === 'swagger') {
        if (this.options.verbose) {
          console.log('[API Server] Registering Swagger UI at', docsPath);
        }
        // Wrap swagger handler to ensure permissive CSP for docs page
        const swaggerHandler = this.swaggerUI({ url: openApiPath });
        this.app.get(docsPath, (c) => {
          // Allow override via options.docsCsp (string)
          let cspHeader = this.options.docsCsp;
          if (!cspHeader) {
            cspHeader = [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              "connect-src 'self'"
            ].join('; ');
          }
          c.header('Content-Security-Policy', cspHeader);
          return swaggerHandler(c);
        });
      } else {
        // Default: Redoc UI
        if (this.options.verbose) {
          console.log('[API Server] Registering Redoc UI at', docsPath);
        }
        this.app.get(docsPath, (c) => {
          if (this.options.verbose) {
            console.log('[API Server] Redoc docs route hit');
          }
          // Set CSP to allow Redoc CDN by default
          const redocCdn = 'https://cdn.redoc.ly';
          const fontsCss = 'https://fonts.googleapis.com';
          const fontsGstatic = 'https://fonts.gstatic.com';
          let cspHeader = this.options.docsCsp;
          if (!cspHeader) {
            cspHeader = [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' ${redocCdn}`,
              `script-src-elem 'self' 'unsafe-inline' ${redocCdn}`,
              `style-src 'self' 'unsafe-inline' ${redocCdn} ${fontsCss}`,
              "img-src 'self' data: https:",
              `font-src 'self' ${fontsGstatic}`,
              "connect-src 'self'"
            ].join('; ');
          }
          c.header('Content-Security-Policy', cspHeader);
          const html = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8">',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '  <title>' + String(this.options.apiTitle || 's3db.js API') + ' - API Documentation</title>',
            '  <style>',
            '    body { margin: 0; padding: 0; }',
            '  </style>',
            '</head>',
            '<body>',
            '  <redoc spec-url="' + String(openApiPath) + '"></redoc>',
            '  <script src="https://cdn.redoc.ly/redoc/v2.5.1/bundles/redoc.standalone.js"></script>',
            '</body>',
            '</html>'
          ].join('\n');
          return c.html(html);
        });
        if (this.options.verbose) {
          console.log('[API Server] Redoc UI route registered');
        }
      }
      if (this.options.verbose) {
        console.log('[API Server] Documentation routes setup complete');
      }
    }

    // Note: Root route (/) is now handled by Router.mountRootRoute()
    // This was moved to maintain proper route precedence and avoid conflicts
  }

  async _setupOIDCRoutes(config) {
    const { database, auth } = this.options;
    const authResource = database.resources[auth.resource];

    if (!authResource) {
      console.error(`[API Plugin] Auth resource '${auth.resource}' not found for OIDC`);
      return;
    }

    // Create session store if configured
    let sessionStore = null;
    if (config.sessionStore) {
      try {
        // sessionStore can be either:
        // 1. A driver config: { driver: 's3db', config: {...} }
        // 2. An already instantiated SessionStore
        if (config.sessionStore.driver) {
          // Driver config - instantiate using factory
          sessionStore = await createSessionStore(config.sessionStore, database);

          if (this.options.verbose) {
            console.log(`[API Plugin] Session store initialized: ${config.sessionStore.driver}`);
          }
        } else {
          // Already instantiated store
          sessionStore = config.sessionStore;
        }
      } catch (err) {
        console.error('[API Plugin] Failed to create session store:', err.message);
        throw err;
      }

      // Replace config.sessionStore with instantiated store
      config.sessionStore = sessionStore;
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

  _printStartupBanner(info) {
    if (this.options.startupBanner === false) {
      return;
    }

    const version = this.options.database?.s3dbVersion || 'latest';
    const basePath = this.options.basePath || '';
    const localHost = this._resolveLocalHostname();
    const localUrl = this._buildUrl(localHost, info.port, basePath);
    const networkHost = this._resolveNetworkHostname();
    const networkUrl = networkHost ? this._buildUrl(networkHost, info.port, basePath) : null;
    const docsPath = this.options.docsEnabled !== false
      ? (basePath ? `${basePath}/docs` : '/docs')
      : null;
    const docsUrl = docsPath ? this._buildUrl(localHost, info.port, docsPath) : null;

    const lines = [
      '',
      `  🗄️  s3db.js API ${version}`,
      `     - Local:    ${localUrl}`
    ];

    if (networkUrl && networkUrl !== localUrl) {
      lines.push(`     - Network:  ${networkUrl}`);
    }

    if (docsUrl) {
      lines.push(`     - Docs:     ${docsUrl}`);
    }

    const routeSummaries = this.router?.getRouteSummaries?.() || [];
    if (routeSummaries.length > 0) {
      lines.push('     Routes:');
      routeSummaries.forEach((route) => {
        const methods = route.methods.join(', ');
        const authLabel = route.authEnabled ? 'auth:on' : 'auth:off';
        lines.push(`       • ${methods} ${route.path} (${authLabel})`);
      });
    }

    lines.push('');
    console.log(lines.join('\n'));
  }

  _resolveLocalHostname() {
    const host = this.options.host;
    if (!host || host === '0.0.0.0' || host === '::') {
      return 'localhost';
    }
    return host;
  }

  _resolveNetworkHostname() {
    const host = this.options.host;
    if (host && host !== '0.0.0.0' && host !== '::') {
      return host;
    }
    return this._findLanAddress() || null;
  }

  _findLanAddress() {
    const nets = networkInterfaces();
    for (const interfaceDetails of Object.values(nets)) {
      if (!interfaceDetails) continue;
      for (const detail of interfaceDetails) {
        if (detail.family === 'IPv4' && !detail.internal) {
          return detail.address;
        }
      }
    }
    return null;
  }

  _buildUrl(host, port, path = '') {
    if (!host) return '';
    const isIPv6 = host.includes(':') && !host.startsWith('[');
    const hostPart = isIPv6 ? `[${host}]` : host;
    const base = `http://${hostPart}:${port}`;

    if (!path) {
      return base;
    }

    const normalizedPath = path === '/'
      ? '/'
      : (path.startsWith('/') ? path : `/${path}`);

    if (normalizedPath === '/') {
      return `${base}/`;
    }

    return `${base}${normalizedPath}`;
  }

  _generateOpenAPISpec() {
    return this.openApiGenerator.generate();
  }
}

export default ApiServer;
