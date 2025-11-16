/**
 * Router - Handles all route mounting for API server
 *
 * Separates routing concerns from server lifecycle management.
 * Responsible for mounting:
 * - Resource routes (auto-generated CRUD)
 * - Authentication routes
 * - Static file serving
 * - Custom user routes
 * - Relational routes (if RelationPlugin active)
 * - Admin routes (failban, metrics)
 */

import { createResourceRoutes, createRelationalRoutes } from '../routes/resource-routes.js';
import { createAuthRoutes } from '../routes/auth-routes.js';
import { mountCustomRoutes } from '../utils/custom-routes.js';
import * as formatter from '../../shared/response-formatter.js';
import { createFilesystemHandler, validateFilesystemConfig } from '../utils/static-filesystem.js';
import { createS3Handler, validateS3Config } from '../utils/static-s3.js';
import { createFailbanAdminRoutes } from '../middlewares/failban.js';
import { createContextInjectionMiddleware } from '../middlewares/context-injection.js';
import { applyBasePath } from '../utils/base-path.js';

export class Router {
  constructor({ database, resources, routes, versionPrefix, basePath = '', auth, static: staticConfigs, failban, metrics, relationsPlugin, authMiddleware, logLevel, logger, Hono, apiTitle, apiDescription, docsEnabled, rootRoute }) {
    this.database = database;
    this.resources = resources || {};
    this.routes = routes || {};
    this.versionPrefix = versionPrefix;
    this.basePath = basePath || '';
    this.auth = auth;
    this.staticConfigs = staticConfigs || [];
    this.failban = failban;
    this.metrics = metrics;
    this.relationsPlugin = relationsPlugin;
    this.authMiddleware = authMiddleware;
    this.logLevel = logLevel;
    this.logger = logger; // Pino logger instance from APIPlugin
    this.Hono = Hono;
    this.apiTitle = apiTitle || 's3db.js API';
    this.apiDescription = apiDescription || 'Auto-generated REST API for s3db.js resources';
    this.docsEnabled = docsEnabled !== false;
    this.rootRoute = rootRoute; // undefined = default splash, false = disabled, function = custom
    this.routeSummaries = [];
  }

  /**
   * Mount all routes on Hono app
   * @param {Hono} app - Hono application instance
   * @param {Object} events - Event emitter
   */
  mount(app, events) {
    // ✅ Context Injection Middleware (FIRST - makes resources accessible via c.get())
    const contextInjection = createContextInjectionMiddleware(this.database);
    app.use('*', contextInjection);

    // 🪵 Debug: context injection middleware registered
    this.logger?.debug('Context injection middleware registered (resources accessible via c.get())');

    // Root splash screen (before static files to allow override)
    this.mountRootRoute(app);

    // Static files first (give them priority)
    this.mountStaticRoutes(app);

    // Resource routes
    this.mountResourceRoutes(app, events);

    // Authentication routes
    this.mountAuthRoutes(app);

    // Relational routes (if RelationPlugin is active)
    this.mountRelationalRoutes(app);

    // Plugin-level custom routes
    this.mountCustomRoutes(app);

    // Admin routes (failban, metrics)
    this.mountAdminRoutes(app);
  }

  /**
   * Mount root splash screen route
   * @private
   */
  mountRootRoute(app) {
    // Skip if explicitly disabled
    if (this.rootRoute === false) {
      // 🪵 Debug: root route disabled
      this.logger?.debug('Root route disabled via config.rootRoute = false');
      return;
    }

    const rootPath = this._withBasePath('/');

    // Custom handler provided
    if (typeof this.rootRoute === 'function') {
      app.get(rootPath, this.rootRoute);
      // 🪵 Debug: mounted custom root handler
      this.logger?.debug({ path: rootPath }, `Mounted custom root handler at ${rootPath}`);
      return;
    }

    // Default splash screen
    const docsPath = this._withBasePath('/docs');
    app.get(rootPath, (c) => {
      const html = this._createSplashScreen(docsPath);
      return c.html(html);
    });

    // 🪵 Debug: mounted default splash screen
    this.logger?.debug({ path: rootPath }, `Mounted default splash screen at ${rootPath}`);
  }

  /**
   * Create HTML splash screen
   * @private
   */
  _createSplashScreen(docsPath) {
    const title = this.apiTitle;
    const description = this.apiDescription;
    const docsLink = this.docsEnabled
      ? `<a href="${docsPath}" class="docs-link">📚 View API Documentation</a>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 60px 40px;
      max-width: 600px;
      text-align: center;
      animation: fadeIn 0.5s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .logo {
      font-size: 72px;
      margin-bottom: 20px;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.05);
      }
    }

    h1 {
      color: #2d3748;
      font-size: 36px;
      margin-bottom: 16px;
      font-weight: 700;
    }

    .description {
      color: #718096;
      font-size: 18px;
      line-height: 1.6;
      margin-bottom: 40px;
    }

    .docs-link {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }

    .docs-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }

    .footer {
      margin-top: 60px;
      padding-top: 30px;
      border-top: 1px solid #e2e8f0;
      color: #a0aec0;
      font-size: 14px;
    }

    .footer a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s ease;
    }

    .footer a:hover {
      color: #764ba2;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #f0fdf4;
      color: #166534;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 30px;
    }

    .status::before {
      content: '●';
      color: #22c55e;
      animation: blink 2s ease-in-out infinite;
    }

    @keyframes blink {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🚀</div>
    <div class="status">API Online</div>
    <h1>${title}</h1>
    <p class="description">${description}</p>
    ${docsLink}
    <div class="footer">
      Powered by <a href="https://github.com/forattini-dev/s3db.js" target="_blank">s3db.js</a>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Mount resource routes (auto-generated CRUD)
   * @private
   */
  mountResourceRoutes(app, events) {
    const databaseResources = this.database.resources;
    this.routeSummaries = [];

    for (const [name, resource] of Object.entries(databaseResources)) {
      const resourceConfig = this.resources[name];
      const isPluginResource = name.startsWith('plg_');

      // Internal plugin resources require explicit opt-in
      if (isPluginResource && !resourceConfig) {
        // 🪵 Debug: skipping internal resource
        this.logger?.debug({ resourceName: name }, `Skipping internal resource '${name}' (not included in config.resources)`);
        continue;
      }

      // Allow explicit disabling via config
      if (resourceConfig?.enabled === false) {
        // 🪵 Debug: resource disabled
        this.logger?.debug({ resourceName: name }, `Resource '${name}' disabled via config.resources`);
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
      } else if (this.versionPrefix !== undefined) {
        versionPrefixConfig = this.versionPrefix;
      } else {
        versionPrefixConfig = false;
      }

      // Calculate the actual prefix to use
      let prefix = '';
      if (versionPrefixConfig === true) {
        prefix = version;
      } else if (versionPrefixConfig === false) {
        prefix = '';
      } else if (typeof versionPrefixConfig === 'string') {
        prefix = versionPrefixConfig;
      }

      // Prepare custom middleware
      const middlewares = [];

      // Add global authentication middleware unless explicitly disabled
      const authDisabled = resourceConfig?.auth === false;

      if (this.authMiddleware && !authDisabled) {
        middlewares.push(this.authMiddleware);
      }

      // Add resource-specific middleware from config
      const extraMiddleware = resourceConfig?.customMiddleware;
      if (extraMiddleware) {
        const toRegister = Array.isArray(extraMiddleware) ? extraMiddleware : [extraMiddleware];

        for (const middleware of toRegister) {
          if (typeof middleware === 'function') {
            middlewares.push(middleware);
          } else {
            // 🪵 Warn: ignoring non-function middleware
            this.logger?.warn({ resourceName: name }, `Ignoring non-function middleware for resource '${name}'`);
          }
        }
      }

      // Normalize HTTP methods
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
        events,
        relationsPlugin: this.relationsPlugin
      }, this.Hono);

      // Mount resource routes
      const mountPath = prefix ? `/${prefix}/${name}` : `/${name}`;
      const fullMountPath = this._withBasePath(mountPath);
      app.route(fullMountPath, resourceApp);

      // 🪵 Debug: mounted resource routes
      this.logger?.debug({ resourceName: name, path: fullMountPath, methods }, `Mounted routes for resource '${name}' at ${fullMountPath}`);

      this.routeSummaries.push({
        resource: name,
        path: fullMountPath,
        methods,
        authEnabled: !!this.authMiddleware && !authDisabled
      });

      // Mount custom routes for this resource
      if (resource.config?.routes) {
        const routeContext = {
          resource,
          database: this.database,
          resourceName: name,
          version
        };

        mountCustomRoutes(resourceApp, resource.config.routes, routeContext, this.logLevel);
      }
    }
  }

  /**
   * Mount authentication routes
   * @private
   */
  mountAuthRoutes(app) {
    // Be tolerant when auth is not configured (legacy/partial configs)
    const { drivers, resource: resourceName, usernameField, passwordField, registration, loginThrottle } = (this.auth || {});

    if (!drivers || (Array.isArray(drivers) && drivers.length === 0)) {
      // 🪵 Warn: auth not configured
      this.logger?.warn('Auth not configured or empty drivers; skipping built-in auth routes');
      return;
    }

    const identityPlugin = this.database?.pluginRegistry?.identity || this.database?.pluginRegistry?.Identity;
    if (identityPlugin) {
      // 🪵 Warn: IdentityPlugin detected
      this.logger?.warn('IdentityPlugin detected. Skipping built-in auth routes.');
      return;
    }

    // Skip JWT auth routes if OIDC driver exists (OIDC provides its own /auth/login)
    const oidcDriver = drivers?.find(d => d.driver === 'oidc');
    if (oidcDriver) {
      // 🪵 Debug: OIDC driver detected
      this.logger?.debug('OIDC driver detected. Skipping JWT auth routes (OIDC provides /auth/login).');
      return;
    }

    // Find first JWT driver
    const jwtDriver = drivers?.find(d => d.driver === 'jwt');

    if (!jwtDriver) {
      return;
    }

    // Get auth resource
    const authResource = this.database.resources[resourceName];
    if (!authResource) {
      this.logger.error(`[API Router] Auth resource '${resourceName}' not found. Skipping auth routes.`);
      return;
    }

    const driverConfig = jwtDriver.config || {};
    const registrationConfig = {
      enabled: driverConfig.allowRegistration === true ||
        driverConfig.registration?.enabled === true ||
        registration?.enabled === true,
      allowedFields: Array.isArray(driverConfig.registration?.allowedFields)
        ? driverConfig.registration.allowedFields
        : Array.isArray(registration?.allowedFields)
          ? registration.allowedFields
          : [],
      defaultRole: driverConfig.registration?.defaultRole ??
        registration?.defaultRole ??
        'user'
    };

    const driverLoginThrottle = driverConfig.loginThrottle || {};
    const loginThrottleConfig = {
      enabled: driverLoginThrottle.enabled ?? loginThrottle?.enabled ?? true,
      maxAttempts: driverLoginThrottle.maxAttempts || loginThrottle?.maxAttempts || 5,
      windowMs: driverLoginThrottle.windowMs || loginThrottle?.windowMs || 60_000,
      blockDurationMs: driverLoginThrottle.blockDurationMs || loginThrottle?.blockDurationMs || 300_000,
      maxEntries: driverLoginThrottle.maxEntries || loginThrottle?.maxEntries || 10_000
    };

    // Prepare auth config for routes
    const authConfig = {
      driver: 'jwt',
      drivers: this.auth.drivers,  // Pass all enabled drivers
      usernameField,
      passwordField,
      jwtSecret: driverConfig.jwtSecret || driverConfig.secret,
      jwtExpiresIn: driverConfig.jwtExpiresIn || driverConfig.expiresIn || '7d',
      passphrase: driverConfig.passphrase || 'secret',
      allowRegistration: registrationConfig.enabled,
      registration: registrationConfig,
      loginThrottle: loginThrottleConfig
    };

    // Create auth routes
    const authApp = createAuthRoutes(authResource, authConfig);

    // Mount auth routes
    const authPath = this._withBasePath('/auth');
    app.route(authPath, authApp);

    // 🪵 Debug: mounted auth routes
    this.logger?.debug({ path: authPath, driver: 'jwt' }, `Mounted auth routes (driver: jwt) at ${authPath}`);
  }

  /**
   * Mount static file serving routes
   * @private
   */
  mountStaticRoutes(app) {
    if (!this.staticConfigs || this.staticConfigs.length === 0) {
      return;
    }

    if (!Array.isArray(this.staticConfigs)) {
      throw new Error('Static config must be an array of mount points');
    }

    for (const [index, config] of this.staticConfigs.entries()) {
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
          validateS3Config({ ...config, ...driverConfig });

          const s3Client = this.database?.client?.client;

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

        // Mount handler
        const mountPath = config.path === '/' ? '/*' : `${config.path}/*`;
        app.get(mountPath, handler);
        app.on('HEAD', mountPath, handler);  // Explicit HEAD support

        // 🪵 Debug: mounted static files
        const source = config.driver === 'filesystem' ? config.root : `s3://${config.bucket}/${config.prefix || ''}`;
        this.logger?.debug({ driver: config.driver, path: config.path, source }, `Mounted static files (${config.driver}) at ${config.path} -> ${source}`);

      } catch (err) {
        this.logger.error(`[API Router] Failed to setup static files for index ${index}:`, err.message);
        throw err;
      }
    }
  }

  /**
   * Mount relational routes (if RelationPlugin is active)
   * @private
   */
  mountRelationalRoutes(app) {
    if (!this.relationsPlugin || !this.relationsPlugin.relations) {
      return;
    }

    const relations = this.relationsPlugin.relations;

    // 🪵 Debug: setting up relational routes
    this.logger?.debug('Setting up relational routes...');

    for (const [resourceName, relationsDef] of Object.entries(relations)) {
      const resource = this.database.resources[resourceName];
      if (!resource) {
        // 🪵 Warn: resource not found for relational routes
        this.logger?.warn({ resourceName }, `Resource '${resourceName}' not found for relational routes`);
        continue;
      }

      // Skip plugin resources unless explicitly included
      if (resourceName.startsWith('plg_') && !this.resources[resourceName]) {
        continue;
      }

      const version = resource.config?.currentVersion || resource.version || 'v1';

      for (const [relationName, relationConfig] of Object.entries(relationsDef)) {
        // Skip belongsTo relations
        if (relationConfig.type === 'belongsTo') {
          continue;
        }

        // Check if relation should be exposed
        const resourceConfig = this.resources[resourceName];
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

        // Mount relational routes
        const relationPath = this._withBasePath(`/${version}/${resourceName}/:id/${relationName}`);
        app.route(relationPath, relationalApp);

        // 🪵 Debug: mounted relational route
        this.logger?.debug({ path: relationPath, type: relationConfig.type, targetResource: relationConfig.resource }, `Mounted relational route: ${relationPath} (${relationConfig.type} -> ${relationConfig.resource})`);
      }
    }
  }

  /**
   * Mount plugin-level custom routes
   * @private
   */
  mountCustomRoutes(app) {
    if (!this.routes || Object.keys(this.routes).length === 0) {
      return;
    }

    const context = {
      database: this.database,
      plugins: this.database?.pluginRegistry || {}
    };

    mountCustomRoutes(app, this.routes, context, this.logLevel, {
      pathPrefix: this.basePath
    });

    // 🪵 Debug: mounted plugin-level custom routes
    const routeCount = Object.keys(this.routes).length;
    this.logger?.debug({ routeCount }, `Mounted ${routeCount} plugin-level custom routes`);
  }

  /**
   * Mount admin routes (failban, metrics)
   * @private
   */
  mountAdminRoutes(app) {
    // Metrics endpoint
    const metricsEnabled = this.metrics?.options?.enabled ?? false;
    if (metricsEnabled) {
      const metricsPath = this._withBasePath('/metrics');
      const metricsFormat = (this.metrics?.options?.format || 'json').toLowerCase();
      app.get(metricsPath, (c) => {
        if (metricsFormat === 'prometheus') {
          const body = this.metrics.getPrometheusMetrics();
          c.header('Content-Type', 'text/plain; version=0.0.4');
          return c.body(body);
        }
        const summary = this.metrics.getSummary();
        const response = formatter.success(summary);
        return c.json(response);
      });

      // 🪵 Debug: metrics endpoint enabled
      this.logger?.debug({ path: metricsPath, format: metricsFormat }, `Metrics endpoint enabled at ${metricsPath}`);
    }

    // Failban admin endpoints
    if (this.failban) {
      const failbanAdminRoutes = createFailbanAdminRoutes(this.Hono, this.failban);
      const failbanPath = this._withBasePath('/admin/security');
      app.route(failbanPath, failbanAdminRoutes);

      // 🪵 Debug: failban admin endpoints enabled
      this.logger?.debug({ path: failbanPath }, `Failban admin endpoints enabled at ${failbanPath}`);
    }
  }

  /**
   * Helper to prepend base path to a route
   * @private
   */
  _withBasePath(path) {
    return applyBasePath(this.basePath, path);
  }

  /**
   * Get summaries of mounted routes
   * @returns {Array<{resource: string, path: string, methods: string[], authEnabled: boolean}>}
   */
  getRouteSummaries() {
    return this.routeSummaries.slice();
  }
}
