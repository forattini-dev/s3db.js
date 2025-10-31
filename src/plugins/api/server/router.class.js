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

export class Router {
  constructor({ database, resources, routes, versionPrefix, auth, static: staticConfigs, failban, metrics, relationsPlugin, authMiddleware, verbose, Hono }) {
    this.database = database;
    this.resources = resources || {};
    this.routes = routes || {};
    this.versionPrefix = versionPrefix;
    this.auth = auth;
    this.staticConfigs = staticConfigs || [];
    this.failban = failban;
    this.metrics = metrics;
    this.relationsPlugin = relationsPlugin;
    this.authMiddleware = authMiddleware;
    this.verbose = verbose;
    this.Hono = Hono;
  }

  /**
   * Mount all routes on Hono app
   * @param {Hono} app - Hono application instance
   * @param {Object} events - Event emitter
   */
  mount(app, events) {
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
   * Mount resource routes (auto-generated CRUD)
   * @private
   */
  mountResourceRoutes(app, events) {
    const databaseResources = this.database.resources;

    for (const [name, resource] of Object.entries(databaseResources)) {
      const resourceConfig = this.resources[name];
      const isPluginResource = name.startsWith('plg_');

      // Internal plugin resources require explicit opt-in
      if (isPluginResource && !resourceConfig) {
        if (this.verbose) {
          console.log(`[API Router] Skipping internal resource '${name}' (not included in config.resources)`);
        }
        continue;
      }

      // Allow explicit disabling via config
      if (resourceConfig?.enabled === false) {
        if (this.verbose) {
          console.log(`[API Router] Resource '${name}' disabled via config.resources`);
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
          } else if (this.verbose) {
            console.warn(`[API Router] Ignoring non-function middleware for resource '${name}'`);
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
        events
      }, this.Hono);

      // Mount resource routes
      const mountPath = prefix ? `/${prefix}/${name}` : `/${name}`;
      app.route(mountPath, resourceApp);

      if (this.verbose) {
        console.log(`[API Router] Mounted routes for resource '${name}' at ${mountPath}`);
      }

      // Mount custom routes for this resource
      if (resource.config?.routes) {
        const routeContext = {
          resource,
          database: this.database,
          resourceName: name,
          version
        };

        mountCustomRoutes(resourceApp, resource.config.routes, routeContext, this.verbose);
      }
    }
  }

  /**
   * Mount authentication routes
   * @private
   */
  mountAuthRoutes(app) {
    const { drivers, resource: resourceName, usernameField, passwordField, registration, loginThrottle } = this.auth;

    const identityPlugin = this.database?.plugins?.identity || this.database?.plugins?.Identity;
    if (identityPlugin) {
      if (this.verbose) {
        console.warn('[API Router] IdentityPlugin detected. Skipping built-in auth routes.');
      }
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
      console.error(`[API Router] Auth resource '${resourceName}' not found. Skipping auth routes.`);
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

    // Mount auth routes at /auth
    app.route('/auth', authApp);

    if (this.verbose) {
      console.log('[API Router] Mounted auth routes (driver: jwt) at /auth');
    }
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
        app.head(mountPath, handler);

        if (this.verbose) {
          console.log(
            `[API Router] Mounted static files (${config.driver}) at ${config.path}` +
            (config.driver === 'filesystem' ? ` -> ${config.root}` : ` -> s3://${config.bucket}/${config.prefix || ''}`)
          );
        }

      } catch (err) {
        console.error(`[API Router] Failed to setup static files for index ${index}:`, err.message);
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

    if (this.verbose) {
      console.log('[API Router] Setting up relational routes...');
    }

    for (const [resourceName, relationsDef] of Object.entries(relations)) {
      const resource = this.database.resources[resourceName];
      if (!resource) {
        if (this.verbose) {
          console.warn(`[API Router] Resource '${resourceName}' not found for relational routes`);
        }
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
        app.route(`/${version}/${resourceName}/:id/${relationName}`, relationalApp);

        if (this.verbose) {
          console.log(
            `[API Router] Mounted relational route: /${version}/${resourceName}/:id/${relationName} ` +
            `(${relationConfig.type} -> ${relationConfig.resource})`
          );
        }
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
      plugins: this.database?.plugins || {}
    };

    mountCustomRoutes(app, this.routes, context, this.verbose);

    if (this.verbose) {
      console.log(`[API Router] Mounted ${Object.keys(this.routes).length} plugin-level custom routes`);
    }
  }

  /**
   * Mount admin routes (failban, metrics)
   * @private
   */
  mountAdminRoutes(app) {
    // Metrics endpoint
    if (this.metrics?.enabled) {
      app.get('/metrics', (c) => {
        const summary = this.metrics.getSummary();
        const response = formatter.success(summary);
        return c.json(response);
      });

      if (this.verbose) {
        console.log('[API Router] Metrics endpoint enabled at /metrics');
      }
    }

    // Failban admin endpoints
    if (this.failban) {
      const failbanAdminRoutes = createFailbanAdminRoutes(this.Hono, this.failban);
      app.route('/admin/security', failbanAdminRoutes);

      if (this.verbose) {
        console.log('[API Router] Failban admin endpoints enabled at /admin/security');
      }
    }
  }
}
