/**
 * MiddlewareChain - Manages middleware application order
 *
 * Applies middlewares in correct order for security and performance:
 * 1. Request tracking (for graceful shutdown)
 * 2. Failban (block banned IPs early)
 * 3. Request ID (before all logging)
 * 4. CORS (before auth checks)
 * 5. Security headers
 * 6. Session tracking
 * 7. Custom middlewares
 * 8. Templates
 * 9. Body size limits
 */

import { idGenerator } from '../../../concerns/id.js';
import { createRequestIdMiddleware } from '../middlewares/request-id.js';
import { createSecurityHeadersMiddleware } from '../middlewares/security-headers.js';
import { createSessionTrackingMiddleware } from '../middlewares/session-tracking.js';
import { createFailbanMiddleware, setupFailbanViolationListener } from '../middlewares/failban.js';
import { setupTemplateEngine } from '../utils/template-engine.js';
import * as formatter from '../../shared/response-formatter.js';

export class MiddlewareChain {
  constructor({
    requestId,
    cors,
    security,
    sessionTracking,
    middlewares,
    templates,
    maxBodySize,
    failban,
    events,
    verbose,
    database,
    inFlightRequests,
    acceptingRequests,
    corsMiddleware
  }) {
    this.requestId = requestId;
    this.cors = cors;
    this.security = security;
    this.sessionTracking = sessionTracking;
    this.middlewares = middlewares || [];
    this.templates = templates;
    this.maxBodySize = maxBodySize;
    this.failban = failban;
    this.events = events;
    this.verbose = verbose;
    this.database = database;
    this.inFlightRequests = inFlightRequests;
    this.acceptingRequests = acceptingRequests;
    this.corsMiddleware = corsMiddleware;
  }

  /**
   * Apply all middlewares to Hono app in correct order
   * @param {Hono} app - Hono application instance
   */
  apply(app) {
    // 1. Request tracking (must be first!)
    this.applyRequestTracking(app);

    // 2. Failban (check banned IPs early)
    this.applyFailban(app);

    // 3. Request ID
    this.applyRequestId(app);

    // 4. CORS
    this.applyCors(app);

    // 5. Security headers
    this.applySecurity(app);

    // 6. Session tracking
    this.applySessionTracking(app);

    // 7. Custom middlewares
    this.applyCustomMiddlewares(app);

    // 8. Template engine
    this.applyTemplates(app);

    // 9. Body size limits
    this.applyBodySizeLimits(app);
  }

  /**
   * Apply request tracking middleware (for graceful shutdown)
   * @private
   */
  applyRequestTracking(app) {
    app.use('*', async (c, next) => {
      // Check if we're still accepting requests
      if (!this.acceptingRequests()) {
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
        throw err;
      } finally {
        // Remove from tracking
        this.inFlightRequests.delete(requestId);
      }
    });
  }

  /**
   * Apply failban middleware
   * @private
   */
  applyFailban(app) {
    if (!this.failban) {
      return;
    }

    const failbanMiddleware = createFailbanMiddleware({
      plugin: this.failban,
      events: this.events
    });

    app.use('*', failbanMiddleware);

    // Setup violation listeners
    setupFailbanViolationListener({
      plugin: this.failban,
      events: this.events
    });

    if (this.verbose) {
      console.log('[MiddlewareChain] Failban protection enabled');
    }
  }

  /**
   * Apply request ID middleware
   * @private
   */
  applyRequestId(app) {
    if (!this.requestId?.enabled) {
      // Always set requestId and verbose, even if not officially enabled
      app.use('*', async (c, next) => {
        c.set('requestId', idGenerator());
        c.set('verbose', this.verbose);
        await next();
      });
      return;
    }

    const requestIdMiddleware = createRequestIdMiddleware(this.requestId);
    app.use('*', requestIdMiddleware);

    if (this.verbose) {
      console.log(`[MiddlewareChain] Request ID tracking enabled (header: ${this.requestId.headerName || 'X-Request-ID'})`);
    }
  }

  /**
   * Apply CORS middleware
   * @private
   */
  applyCors(app) {
    if (!this.cors?.enabled || !this.corsMiddleware) {
      return;
    }

    const corsConfig = this.cors;
    app.use('*', this.corsMiddleware({
      origin: corsConfig.origin || '*',
      allowMethods: corsConfig.allowMethods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: corsConfig.allowHeaders || ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposeHeaders: corsConfig.exposeHeaders || ['X-Request-ID'],
      credentials: corsConfig.credentials || false,
      maxAge: corsConfig.maxAge || 86400
    }));

    if (this.verbose) {
      console.log(`[MiddlewareChain] CORS enabled (maxAge: ${corsConfig.maxAge || 86400}s, origin: ${corsConfig.origin || '*'})`);
    }
  }

  /**
   * Apply security headers middleware
   * @private
   */
  applySecurity(app) {
    if (!this.security?.enabled) {
      return;
    }

    const securityMiddleware = createSecurityHeadersMiddleware(this.security);
    app.use('*', securityMiddleware);

    if (this.verbose) {
      console.log('[MiddlewareChain] Security headers enabled');
    }
  }

  /**
   * Apply session tracking middleware
   * @private
   */
  applySessionTracking(app) {
    if (!this.sessionTracking?.enabled) {
      return;
    }

    const sessionMiddleware = createSessionTrackingMiddleware(
      this.sessionTracking,
      this.database
    );
    app.use('*', sessionMiddleware);

    if (this.verbose) {
      const resource = this.sessionTracking.resource ? ` (resource: ${this.sessionTracking.resource})` : ' (in-memory)';
      console.log(`[MiddlewareChain] Session tracking enabled${resource}`);
    }
  }

  /**
   * Apply custom middlewares
   * @private
   */
  applyCustomMiddlewares(app) {
    this.middlewares.forEach(middleware => {
      app.use('*', middleware);
    });

    if (this.verbose && this.middlewares.length > 0) {
      console.log(`[MiddlewareChain] Applied ${this.middlewares.length} custom middleware(s)`);
    }
  }

  /**
   * Apply template engine middleware
   * @private
   */
  applyTemplates(app) {
    if (!this.templates?.enabled) {
      return;
    }

    const templateMiddleware = setupTemplateEngine(this.templates);
    app.use('*', templateMiddleware);

    if (this.verbose) {
      console.log(`[MiddlewareChain] Template engine enabled: ${this.templates.engine}`);
    }
  }

  /**
   * Apply body size limits
   * @private
   */
  applyBodySizeLimits(app) {
    app.use('*', async (c, next) => {
      const method = c.req.method;

      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const contentLength = c.req.header('content-length');

        if (contentLength) {
          const size = parseInt(contentLength);

          if (size > this.maxBodySize) {
            const response = formatter.payloadTooLarge(size, this.maxBodySize);
            c.header('Connection', 'close');
            return c.json(response, response._status);
          }
        }
      }

      await next();
    });
  }
}
