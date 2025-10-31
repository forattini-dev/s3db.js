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
import { createJsonRateLimitMiddleware } from './concerns/rate-limit.js';

/**
 * Create Express-style response adapter for Hono context
 * Allows OAuth2Server handlers to use res.status().json() API
 * @param {Object} c - Hono context
 * @returns {Object} Express-style response object
 */
function createExpressStyleResponse(c) {
  let statusCode = 200;

  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      return c.json(data, statusCode);
    },
    header(name, value) {
      c.header(name, value);
      return this;
    },
    setHeader(name, value) {
      c.header(name, value);
      return this;
    },
    send(data) {
      if (data === undefined || data === null) {
        return c.body('', statusCode);
      }

      if (typeof data === 'string' || data instanceof Uint8Array) {
        return c.body(data, statusCode);
      }

      // Fallback to JSON serialization for objects
      return c.json(data, statusCode);
    },
    redirect(url, code = 302) {
      return c.redirect(url, code);
    }
  };

  return response;
}

/**
 * Parse cookies from request header
 * @param {string} cookieHeader
 * @returns {Object}
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [key, ...rest] = part.split('=');
      acc[key] = decodeURIComponent(rest.join('=') || '');
      return acc;
    }, {});
}

/**
 * Create Express-style request adapter for Hono context
 * @param {Object} c - Hono context
 * @returns {Promise<Object>} Express-style request object
 */
async function createExpressStyleRequest(c) {
  const cached = c.get('expressStyleRequest');
  if (cached) {
    return cached;
  }

  const raw = c.req.raw;
  const headers = {};
  raw.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const url = new URL(raw.url);
  let body = undefined;
  const contentType = headers['content-type']?.split(';')[0].trim();

  try {
    if (contentType === 'application/json') {
      body = await c.req.json();
    } else if (
      contentType === 'application/x-www-form-urlencoded' ||
      contentType === 'multipart/form-data'
    ) {
      body = await c.req.parseBody();
    }
  } catch {
    body = undefined;
  }

  const query = Object.fromEntries(url.searchParams.entries());
  const cookies = parseCookies(headers.cookie);
  const clientIp =
    c.get('clientIp') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown';

  const expressReq = {
    method: raw.method,
    url: raw.url,
    originalUrl: raw.url,
    path: url.pathname,
    headers,
    query,
    body: body ?? {},
    cookies,
    ip: clientIp,
    protocol: url.protocol.replace(':', ''),
    get(name) {
      return headers[name.toLowerCase()];
    }
  };

  c.set('expressStyleRequest', expressReq);
  return expressReq;
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
      failbanManager: options.failbanManager || null,
      failbanConfig: options.failbanConfig || {},
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
   * Setup failban middleware for brute force protection
   * @private
   */
  _setupFailbanMiddleware() {
    const { failbanManager } = this.options;

    // Global ban check middleware
    this.app.use('*', async (c, next) => {
      // Extract IP address
      const ip = this._extractClientIp(c);

      // Store IP in context for later use
      c.set('clientIp', ip);

      // Check if blacklisted
      if (failbanManager.isBlacklisted(ip)) {
        c.header('X-Ban-Status', 'blacklisted');
        c.header('X-Ban-Reason', 'IP is permanently blacklisted');

        if (this.options.verbose) {
          console.log(`[Failban] Blocked blacklisted IP: ${ip}`);
        }

        return c.json({
          error: 'Forbidden',
          message: 'Your IP address has been permanently blocked',
          ip
        }, 403);
      }

      // Check country restrictions (GeoIP)
      if (this.options.failbanConfig.geo?.enabled) {
        const countryBlock = failbanManager.checkCountryBlock(ip);
        if (countryBlock) {
          c.header('X-Ban-Status', 'country_blocked');
          c.header('X-Ban-Reason', countryBlock.reason);
          c.header('X-Country-Code', countryBlock.country);

          if (this.options.verbose) {
            console.log(`[Failban] Blocked country ${countryBlock.country} for IP: ${ip}`);
          }

          return c.json({
            error: 'Forbidden',
            message: 'Access from your country is not allowed',
            country: countryBlock.country,
            ip
          }, 403);
        }
      }

      // Check if banned
      if (failbanManager.isBanned(ip)) {
        const ban = await failbanManager.getBan(ip);

        if (ban) {
          const expiresAt = new Date(ban.expiresAt);
          const retryAfter = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);

          c.header('Retry-After', String(retryAfter));
          c.header('X-Ban-Status', 'banned');
          c.header('X-Ban-Reason', ban.reason);
          c.header('X-Ban-Expires', ban.expiresAt);

          if (this.options.verbose) {
            console.log(`[Failban] Blocked banned IP: ${ip} (expires in ${retryAfter}s)`);
          }

          return c.json({
            error: 'Forbidden',
            message: 'Your IP address has been temporarily banned due to security violations',
            reason: ban.reason,
            expiresAt: ban.expiresAt,
            retryAfter
          }, 403);
        }
      }

      // Not banned - continue
      await next();
    });

    if (this.options.verbose) {
      console.log('[Identity Server] Failban middleware enabled (global ban check)');
    }
  }

  /**
   * Extract client IP from request
   * @param {import('hono').Context} c
   * @returns {string}
   * @private
   */
  _extractClientIp(c) {
    return c.get('clientIp') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      c.env?.ip ||
      'unknown';
  }

  /**
   * Create rate limit middleware for API endpoints
   * @param {RateLimiter} limiter
   * @returns {Function}
   * @private
   */
  _createRateLimitMiddleware(limiter) {
    return createJsonRateLimitMiddleware(limiter, (c) => this._extractClientIp(c));
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

    // Apply failban middleware if enabled (global IP ban check)
    if (this.options.failbanManager && this.options.failbanConfig.enabled) {
      this._setupFailbanMiddleware();
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

    const rateLimiters = this.options.identityPlugin?.rateLimiters || {};
    const wrap = (handler) => async (c) => {
      const req = await createExpressStyleRequest(c);
      const res = createExpressStyleResponse(c);
      return await handler.call(oauth2Server, req, res);
    };

    // OIDC Discovery endpoint
    this.app.get('/.well-known/openid-configuration', wrap(oauth2Server.discoveryHandler));

    // JWKS (JSON Web Key Set) endpoint
    this.app.get('/.well-known/jwks.json', wrap(oauth2Server.jwksHandler));

    // OAuth2 Token endpoint
    const tokenHandler = wrap(oauth2Server.tokenHandler);
    if (rateLimiters.token) {
      this.app.post('/oauth/token', this._createRateLimitMiddleware(rateLimiters.token), tokenHandler);
    } else {
      this.app.post('/oauth/token', tokenHandler);
    }

    // OIDC UserInfo endpoint
    this.app.get('/oauth/userinfo', wrap(oauth2Server.userinfoHandler));

    // Token introspection endpoint
    this.app.post('/oauth/introspect', wrap(oauth2Server.introspectHandler));

    // Authorization endpoints
    const authorizeGet = wrap(oauth2Server.authorizeHandler);
    const authorizePost = wrap(oauth2Server.authorizePostHandler);
    if (rateLimiters.authorize) {
      const middleware = this._createRateLimitMiddleware(rateLimiters.authorize);
      this.app.get('/oauth/authorize', middleware, authorizeGet);
      this.app.post('/oauth/authorize', middleware, authorizePost);
    } else {
      this.app.get('/oauth/authorize', authorizeGet);
      this.app.post('/oauth/authorize', authorizePost);
    }

    // Client registration endpoint
    this.app.post('/oauth/register', wrap(oauth2Server.registerClientHandler));

    // Token revocation endpoint
    this.app.post('/oauth/revoke', wrap(oauth2Server.revokeHandler));

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
        console.log('[Identity Server]   GET  /forgot-password (Forgot Password Form)');
        console.log('[Identity Server]   POST /forgot-password (Process Forgot Password)');
        console.log('[Identity Server]   GET  /reset-password (Reset Password Form)');
        console.log('[Identity Server]   POST /reset-password (Process Password Reset)');
        console.log('[Identity Server]   GET  /profile (User Profile - Protected)');
        console.log('[Identity Server]   POST /profile/update (Update Profile)');
        console.log('[Identity Server]   POST /profile/change-password (Change Password)');
        console.log('[Identity Server]   POST /profile/logout-session (Logout Specific Session)');
        console.log('[Identity Server]   POST /profile/logout-all-sessions (Logout All Other Sessions)');
        console.log('[Identity Server]   GET  /admin (Admin Dashboard - Protected)');
        console.log('[Identity Server]   GET  /admin/clients (List OAuth2 Clients)');
        console.log('[Identity Server]   GET  /admin/clients/new (New Client Form)');
        console.log('[Identity Server]   POST /admin/clients/create (Create Client)');
        console.log('[Identity Server]   GET  /admin/clients/:id/edit (Edit Client Form)');
        console.log('[Identity Server]   POST /admin/clients/:id/update (Update Client)');
        console.log('[Identity Server]   POST /admin/clients/:id/delete (Delete Client)');
        console.log('[Identity Server]   POST /admin/clients/:id/rotate-secret (Rotate Client Secret)');
        console.log('[Identity Server]   POST /admin/clients/:id/toggle-active (Toggle Client Active)');
        console.log('[Identity Server]   GET  /admin/users (List Users - Protected)');
        console.log('[Identity Server]   GET  /admin/users/:id/edit (Edit User Form)');
        console.log('[Identity Server]   POST /admin/users/:id/update (Update User)');
        console.log('[Identity Server]   POST /admin/users/:id/delete (Delete User)');
        console.log('[Identity Server]   POST /admin/users/:id/change-status (Change User Status)');
        console.log('[Identity Server]   POST /admin/users/:id/verify-email (Mark Email Verified)');
        console.log('[Identity Server]   POST /admin/users/:id/reset-password (Send Password Reset)');
        console.log('[Identity Server]   POST /admin/users/:id/toggle-admin (Toggle Admin Role)');
        console.log('[Identity Server]   GET  /oauth/authorize (OAuth2 Consent Screen - Overrides OAuth2Server)');
        console.log('[Identity Server]   POST /oauth/consent (Process OAuth2 Consent Decision)');
        console.log('[Identity Server]   GET  /verify-email (Verify Email with Token)');
        console.log('[Identity Server]   POST /verify-email/resend (Resend Verification Email)');
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
