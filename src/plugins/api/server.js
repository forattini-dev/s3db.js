/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and routing
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { swaggerUI } from '@hono/swagger-ui';
import { createResourceRoutes } from './routes/resource-routes.js';
import { errorHandler } from './utils/error-handler.js';
import * as formatter from './utils/response-formatter.js';
import { generateOpenAPISpec } from './utils/openapi-generator.js';

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
      middlewares: options.middlewares || [],
      verbose: options.verbose || false,
      auth: options.auth || {},
      docsEnabled: options.docsEnabled !== false, // Enable /docs by default
      docsUI: options.docsUI || 'redoc', // 'swagger' or 'redoc'
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024, // 10MB default
      rootHandler: options.rootHandler, // Custom handler for root path, if not provided redirects to /docs
      apiInfo: {
        title: options.apiTitle || 's3db.js API',
        version: options.apiVersion || '1.0.0',
        description: options.apiDescription || 'Auto-generated REST API for s3db.js resources'
      }
    };

    this.app = new Hono();
    this.server = null;
    this.isRunning = false;
    this.openAPISpec = null;

    this._setupRoutes();
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
        // Swagger UI (legacy, less pretty)
        this.app.get('/docs', swaggerUI({
          url: '/openapi.json'
        }));
      } else {
        // Redoc (modern, beautiful design!)
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

      // Create resource routes
      const resourceApp = createResourceRoutes(resource, version, {
        methods: config.methods,
        customMiddleware: config.customMiddleware || [],
        enableValidation: config.validation !== false
      });

      // Mount resource routes
      this.app.route(`/${version}/${name}`, resourceApp);

      if (this.options.verbose) {
        console.log(`[API Plugin] Mounted routes for resource '${name}' at /${version}/${name}`);
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

    const { port, host } = this.options;

    return new Promise((resolve, reject) => {
      try {
        this.server = serve({
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
