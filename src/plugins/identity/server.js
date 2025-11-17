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
      logLevel: options.logLevel || 'info',
      issuer: options.issuer,
      oauth2Server: options.oauth2Server,
      sessionManager: options.sessionManager || null,
      usersResource: options.usersResource || null,
      identityPlugin: options.identityPlugin || null,
      failbanManager: options.failbanManager || null,
      failbanConfig: options.failbanConfig || {},
      cors: options.cors || {},
      security: options.security || {},
      logging: options.logging || {},
      logger: options.logger || console // Use provided logger or fallback to console
    };

    this.app = null;
    this.server = null;
    this.isRunning = false;
    this.initialized = false;
    this.logger = this.options.logger;
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

        if (this.options.logLevel && this.logger) {
          this.logger.info(`[Failban] Blocked blacklisted IP: ${ip}`);
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

          if (this.options.logLevel && this.logger) {
            this.logger.info(`[Failban] Blocked country ${countryBlock.country} for IP: ${ip}`);
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

          if (this.options.logLevel && this.logger) {
            this.logger.info(`[Failban] Blocked banned IP: ${ip} (expires in ${retryAfter}s)`);
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

    if (this.options.logLevel && this.logger) {
      this.logger.info('[Identity Server] Failban middleware enabled (global ban check)');
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
      c.set('logLevel', this.options.logLevel);
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

    this.app.get('/health/ready', async (c) => {
      const isReady = this.options.oauth2Server !== null;

      // Check onboarding status
      let onboardingStatus = null;
      if (this.options.identityPlugin && typeof this.options.identityPlugin.getOnboardingStatus === 'function') {
        try {
          onboardingStatus = await this.options.identityPlugin.getOnboardingStatus();
        } catch (error) {
          // Non-fatal - continue without onboarding status
        }
      }

      if (!isReady) {
        const response = formatter.error('Service not ready', {
          status: 503,
          code: 'NOT_READY',
          onboarding: onboardingStatus
        });
        return c.json(response, 503);
      }

      // If onboarding not completed, return degraded status
      if (onboardingStatus && !onboardingStatus.completed && !onboardingStatus.adminExists) {
        const response = formatter.error('First run setup required', {
          status: 503,
          code: 'ONBOARDING_REQUIRED',
          onboarding: {
            required: true,
            adminExists: false,
            mode: onboardingStatus.mode
          }
        });
        return c.json(response, 503);
      }

      const response = formatter.success({
        status: 'ready',
        timestamp: new Date().toISOString(),
        onboarding: onboardingStatus ? {
          required: false,
          adminExists: onboardingStatus.adminExists,
          completedAt: onboardingStatus.completedAt
        } : undefined
      });
      return c.json(response);
    });

    // Onboarding status endpoint
    this.app.get('/onboarding/status', async (c) => {
      if (!this.options.identityPlugin || typeof this.options.identityPlugin.getOnboardingStatus !== 'function') {
        const response = formatter.error('Onboarding not available', {
          status: 501,
          code: 'NOT_IMPLEMENTED'
        });
        return c.json(response, 501);
      }

      try {
        const status = await this.options.identityPlugin.getOnboardingStatus();
        const response = formatter.success(status);
        return c.json(response);
      } catch (error) {
        const response = formatter.error('Failed to get onboarding status', {
          status: 500,
          code: 'INTERNAL_ERROR',
          details: error.message
        });
        return c.json(response, 500);
      }
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
      this.logger.error('[Identity Server] OAuth2 Server not provided');
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

    // S3DB Identity Integration Metadata endpoint (for ApiPlugin and other consumers)
    this.app.get('/.well-known/s3db-identity.json', (c) => {
      const metadata = this.identityPlugin.getIntegrationMetadata();
      const etag = `"${Buffer.from(JSON.stringify(metadata)).toString('base64').slice(0, 16)}"`;

      // Handle conditional requests (If-None-Match)
      const ifNoneMatch = c.req.header('if-none-match');
      if (ifNoneMatch === etag) {
        return c.body(null, 304); // Not Modified
      }

      // Return metadata with cache headers
      c.header('Content-Type', 'application/json');
      c.header('ETag', etag);
      c.header('Cache-Control', `public, max-age=${metadata.cacheTtl}`);
      c.header('Last-Modified', new Date(metadata.issuedAt).toUTCString());

      return c.json(metadata);
    });

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

    if (this.options.logLevel && this.logger) {
      this.logger.info('[Identity Server] Mounted OAuth2/OIDC routes:');
      this.logger.info('[Identity Server]   GET  /.well-known/openid-configuration (OIDC Discovery)');
      this.logger.info('[Identity Server]   GET  /.well-known/jwks.json (JWKS)');
      this.logger.info('[Identity Server]   GET  /.well-known/s3db-identity.json (S3DB Integration Metadata)');
      this.logger.info('[Identity Server]   GET  /oauth/authorize (Authorization UI)');
      this.logger.info('[Identity Server]   POST /oauth/authorize (Process Login)');
      this.logger.info('[Identity Server]   POST /oauth/token (Token)');
      this.logger.info('[Identity Server]   GET  /oauth/userinfo (UserInfo)');
      this.logger.info('[Identity Server]   POST /oauth/introspect (Introspection)');
      this.logger.info('[Identity Server]   POST /oauth/register (Client Registration)');
      this.logger.info('[Identity Server]   POST /oauth/revoke (Token Revocation)');
    }
  }

  /**
   * Setup UI routes (login, register, profile, etc.)
   * @private
   */
  async _setupUIRoutes() {
    const { sessionManager, identityPlugin } = this.options;

    if (!sessionManager || !identityPlugin) {
      if (this.options.logLevel && this.logger) {
        this.logger.info('[Identity Server] SessionManager or IdentityPlugin not provided, skipping UI routes');
      }
      return;
    }

    try {
      // Dynamic import of UI routes
      const { registerUIRoutes } = await import('./ui/routes.js');

      // Register all UI routes (login, register, logout)
      registerUIRoutes(this.app, identityPlugin);

      if (this.options.logLevel && this.logger) {
        this.logger.info('[Identity Server] Mounted UI routes:');
        this.logger.info('[Identity Server]   GET  /login (Login Form)');
        this.logger.info('[Identity Server]   POST /login (Process Login)');
        this.logger.info('[Identity Server]   GET  /register (Registration Form)');
        this.logger.info('[Identity Server]   POST /register (Process Registration)');
        this.logger.info('[Identity Server]   GET  /logout (Logout)');
        this.logger.info('[Identity Server]   POST /logout (Logout)');
        this.logger.info('[Identity Server]   GET  /forgot-password (Forgot Password Form)');
        this.logger.info('[Identity Server]   POST /forgot-password (Process Forgot Password)');
        this.logger.info('[Identity Server]   GET  /reset-password (Reset Password Form)');
        this.logger.info('[Identity Server]   POST /reset-password (Process Password Reset)');
        this.logger.info('[Identity Server]   GET  /profile (User Profile - Protected)');
        this.logger.info('[Identity Server]   POST /profile/update (Update Profile)');
        this.logger.info('[Identity Server]   POST /profile/change-password (Change Password)');
        this.logger.info('[Identity Server]   POST /profile/logout-session (Logout Specific Session)');
        this.logger.info('[Identity Server]   POST /profile/logout-all-sessions (Logout All Other Sessions)');
        this.logger.info('[Identity Server]   GET  /admin (Admin Dashboard - Protected)');
        this.logger.info('[Identity Server]   GET  /admin/clients (List OAuth2 Clients)');
        this.logger.info('[Identity Server]   GET  /admin/clients/new (New Client Form)');
        this.logger.info('[Identity Server]   POST /admin/clients/create (Create Client)');
        this.logger.info('[Identity Server]   GET  /admin/clients/:id/edit (Edit Client Form)');
        this.logger.info('[Identity Server]   POST /admin/clients/:id/update (Update Client)');
        this.logger.info('[Identity Server]   POST /admin/clients/:id/delete (Delete Client)');
        this.logger.info('[Identity Server]   POST /admin/clients/:id/rotate-secret (Rotate Client Secret)');
        this.logger.info('[Identity Server]   POST /admin/clients/:id/toggle-active (Toggle Client Active)');
        this.logger.info('[Identity Server]   GET  /admin/users (List Users - Protected)');
        this.logger.info('[Identity Server]   GET  /admin/users/:id/edit (Edit User Form)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/update (Update User)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/delete (Delete User)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/change-status (Change User Status)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/verify-email (Mark Email Verified)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/reset-password (Send Password Reset)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/toggle-admin (Toggle Admin Role)');
        this.logger.info('[Identity Server]   GET  /oauth/authorize (OAuth2 Consent Screen - Overrides OAuth2Server)');
        this.logger.info('[Identity Server]   POST /oauth/consent (Process OAuth2 Consent Decision)');
        this.logger.info('[Identity Server]   GET  /verify-email (Verify Email with Token)');
        this.logger.info('[Identity Server]   POST /verify-email/resend (Resend Verification Email)');
      }
    } catch (error) {
      this.logger.error('[Identity Server] Failed to setup UI routes:', error);
    }
  }

  /**
   * Start the server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('[Identity Server] Server is already running');
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
          this.logger.info(`[Identity Server] Server listening on http://${info.address}:${info.port}`);
          this.logger.info(`[Identity Server] Issuer: ${this.options.issuer}`);
          this.logger.info(`[Identity Server] Discovery: ${this.options.issuer}/.well-known/openid-configuration`);
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
      this.logger.warn('[Identity Server] Server is not running');
      return;
    }

    if (this.server && typeof this.server.close === 'function') {
      await new Promise((resolve) => {
        this.server.close(() => {
          this.isRunning = false;
          this.logger.info('[Identity Server] Server stopped');
          resolve();
        });
      });
    } else {
      this.isRunning = false;
      this.logger.info('[Identity Server] Server stopped');
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
