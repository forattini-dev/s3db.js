/**
 * Identity Server - Hono-based HTTP server for Identity Provider Plugin
 *
 * Manages OAuth2/OIDC endpoints only (no CRUD routes)
 */

import { errorHandler } from '../shared/error-handler.js';
import * as formatter from '../shared/response-formatter.js';
import {
  createCorsMiddleware,
  createSecurityMiddleware,
  createLoggingMiddleware
} from '../shared/middlewares/index.js';
import { idGenerator } from '../../concerns/id.js';

/**
 * Create Express-style response adapter for Hono context
 * Allows OAuth2Server handlers to use res.status().json() API
 * @param {Object} c - Hono context
 * @returns {Object} Express-style response object
 */
function createExpressStyleResponse(c) {
  let statusCode = 200;

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      return c.json(data, statusCode);
    }
  };
}

/**
 * Identity Server class
 * @class
 */
export class IdentityServer {
  /**
   * Create Identity server
   * @param {Object} options - Server options
   */
  constructor(options = {}) {
    this.options = {
      port: options.port || 4000,
      host: options.host || '0.0.0.0',
      verbose: options.verbose || false,
      issuer: options.issuer,
      oauth2Server: options.oauth2Server,
      sessionManager: options.sessionManager || null,
      usersResource: options.usersResource || null,
      identityPlugin: options.identityPlugin || null,
      cors: options.cors || {},
      security: options.security || {},
      logging: options.logging || {}
    };

    this.app = null;
    this.server = null;
    this.isRunning = false;
    this.initialized = false;
  }

  /**
   * Setup all routes
   * @private
   */
  _setupRoutes() {
    // Request ID middleware
    this.app.use('*', async (c, next) => {
      c.set('requestId', idGenerator());
      c.set('verbose', this.options.verbose);
      await next();
    });

    // Apply CORS middleware if enabled
    if (this.options.cors.enabled) {
      const corsMiddleware = createCorsMiddleware(this.options.cors);
      this.app.use('*', corsMiddleware);
    }

    // Apply security headers if enabled
    if (this.options.security.enabled) {
      const securityMiddleware = createSecurityMiddleware(this.options.security);
      this.app.use('*', securityMiddleware);
    }

    // Apply logging middleware if enabled
    if (this.options.logging.enabled) {
      const loggingMiddleware = createLoggingMiddleware(this.options.logging);
      this.app.use('*', loggingMiddleware);
    }

    // Health check endpoints
    this.app.get('/health', (c) => {
      const response = formatter.success({
        status: 'ok',
        service: 'identity-provider',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
      return c.json(response);
    });

    this.app.get('/health/live', (c) => {
      const response = formatter.success({
        status: 'alive',
        timestamp: new Date().toISOString()
      });
      return c.json(response);
    });

    this.app.get('/health/ready', (c) => {
      const isReady = this.options.oauth2Server !== null;

      if (!isReady) {
        const response = formatter.error('Service not ready', {
          status: 503,
          code: 'NOT_READY'
        });
        return c.json(response, 503);
      }

      const response = formatter.success({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
      return c.json(response);
    });

    // Root endpoint - discovery redirect
    this.app.get('/', (c) => {
      return c.redirect('/.well-known/openid-configuration', 302);
    });

    // Setup OAuth2/OIDC routes
    this._setupOAuth2Routes();

    // Setup UI routes (login, register, profile, etc.)
    this._setupUIRoutes();

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
   * Setup OAuth2/OIDC routes
   * @private
   */
  _setupOAuth2Routes() {
    const { oauth2Server } = this.options;

    if (!oauth2Server) {
      console.error('[Identity Server] OAuth2 Server not provided');
      return;
    }

    // OIDC Discovery endpoint
    this.app.get('/.well-known/openid-configuration', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.discoveryHandler(c.req, res);
    });

    // JWKS (JSON Web Key Set) endpoint
    this.app.get('/.well-known/jwks.json', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.jwksHandler(c.req, res);
    });

    // OAuth2 Token endpoint
    this.app.post('/oauth/token', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.tokenHandler(c.req, res);
    });

    // OIDC UserInfo endpoint
    this.app.get('/oauth/userinfo', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.userinfoHandler(c.req, res);
    });

    // Token introspection endpoint
    this.app.post('/oauth/introspect', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.introspectHandler(c.req, res);
    });

    // Authorization endpoint (GET for user consent UI)
    this.app.get('/oauth/authorize', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.authorizeHandler(c.req, res);
    });

    // Authorization endpoint (POST for processing login)
    this.app.post('/oauth/authorize', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.authorizePostHandler(c.req, res);
    });

    // Client registration endpoint
    this.app.post('/oauth/register', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.registerClientHandler(c.req, res);
    });

    // Token revocation endpoint
    this.app.post('/oauth/revoke', async (c) => {
      const res = createExpressStyleResponse(c);
      return await oauth2Server.revokeHandler(c.req, res);
    });

    if (this.options.verbose) {
      console.log('[Identity Server] Mounted OAuth2/OIDC routes:');
      console.log('[Identity Server]   GET  /.well-known/openid-configuration (OIDC Discovery)');
      console.log('[Identity Server]   GET  /.well-known/jwks.json (JWKS)');
      console.log('[Identity Server]   GET  /oauth/authorize (Authorization UI)');
      console.log('[Identity Server]   POST /oauth/authorize (Process Login)');
      console.log('[Identity Server]   POST /oauth/token (Token)');
      console.log('[Identity Server]   GET  /oauth/userinfo (UserInfo)');
      console.log('[Identity Server]   POST /oauth/introspect (Introspection)');
      console.log('[Identity Server]   POST /oauth/register (Client Registration)');
      console.log('[Identity Server]   POST /oauth/revoke (Token Revocation)');
    }
  }

  /**
   * Setup UI routes (login, register, profile, etc.)
   * @private
   */
  async _setupUIRoutes() {
    const { sessionManager, identityPlugin } = this.options;

    if (!sessionManager || !identityPlugin) {
      if (this.options.verbose) {
        console.log('[Identity Server] SessionManager or IdentityPlugin not provided, skipping UI routes');
      }
      return;
    }

    try {
      // Dynamic import of UI routes
      const { registerUIRoutes } = await import('./ui/routes.js');

      // Register all UI routes (login, register, logout)
      registerUIRoutes(this.app, identityPlugin);

      if (this.options.verbose) {
        console.log('[Identity Server] Mounted UI routes:');
        console.log('[Identity Server]   GET  /login (Login Form)');
        console.log('[Identity Server]   POST /login (Process Login)');
        console.log('[Identity Server]   GET  /register (Registration Form)');
        console.log('[Identity Server]   POST /register (Process Registration)');
        console.log('[Identity Server]   GET  /logout (Logout)');
        console.log('[Identity Server]   POST /logout (Logout)');
      }
    } catch (error) {
      console.error('[Identity Server] Failed to setup UI routes:', error);
    }
  }

  /**
   * Start the server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      console.warn('[Identity Server] Server is already running');
      return;
    }

    // Dynamic import of Hono dependencies
    if (!this.initialized) {
      const { Hono } = await import('hono');
      const { serve } = await import('@hono/node-server');

      this.Hono = Hono;
      this.serve = serve;

      // Initialize app
      this.app = new Hono();

      // Setup routes
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
          console.log(`[Identity Server] Server listening on http://${info.address}:${info.port}`);
          console.log(`[Identity Server] Issuer: ${this.options.issuer}`);
          console.log(`[Identity Server] Discovery: ${this.options.issuer}/.well-known/openid-configuration`);
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
      console.warn('[Identity Server] Server is not running');
      return;
    }

    if (this.server && typeof this.server.close === 'function') {
      await new Promise((resolve) => {
        this.server.close(() => {
          this.isRunning = false;
          console.log('[Identity Server] Server stopped');
          resolve();
        });
      });
    } else {
      this.isRunning = false;
      console.log('[Identity Server] Server stopped');
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
      issuer: this.options.issuer
    };
  }

  /**
   * Get Hono app instance
   * @returns {Hono} Hono app
   */
  getApp() {
    return this.app;
  }
}

export default IdentityServer;
