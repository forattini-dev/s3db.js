/**
 * MiddlewareChain - Manages middleware application order
 *
 * Applies middlewares in correct order for security and performance:
 * 1. Request tracking (for graceful shutdown)
 * 2. Failban (block banned IPs early)
 * 3. Request ID (before all logging)
 * 4. Pino HTTP logger (automatic request/response logging)
 * 5. Error helper (adds c.error() method)
 * 6. CORS (before auth checks)
 * 7. Security headers
 * 8. Session tracking
 * 9. Custom middlewares
 * 10. Templates
 * 11. Body size limits
 */

import { idGenerator } from '../../../concerns/id.js';
import { createRequestIdMiddleware } from '../middlewares/request-id.js';
import { createPinoLoggerMiddleware } from '../middlewares/pino-logger.js';
import { createSecurityHeadersMiddleware } from '../middlewares/security-headers.js';
import { createSessionTrackingMiddleware } from '../middlewares/session-tracking.js';
import { createFailbanMiddleware, setupFailbanViolationListener } from '../middlewares/failban.js';
import { errorHelper } from '../middlewares/error-helper.js';
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
    logger,
    httpLogger, // pino-http configuration
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
    this.logger = logger || { debug: () => {} }; // Optional Pino logger from APIPlugin, noop if not provided
    this.httpLogger = httpLogger; // pino-http configuration
    this.database = database;
    this.inFlightRequests = inFlightRequests;
    this.acceptingRequests = acceptingRequests;
    this.corsMiddleware = corsMiddleware;
  }

  /**
   * Apply all middlewares to Hono app in correct order
   * @param {Hono} app - Hono application instance
   */
  async apply(app) {
    // 1. Request tracking (must be first!)
    this.applyRequestTracking(app);

    // 2. Failban (check banned IPs early)
    this.applyFailban(app);

    // 3. Request ID
    this.applyRequestId(app);

    // 4. Pino HTTP logger (automatic request/response logging)
    await this.applyHttpLogger(app);

    // 5. Error helper (adds c.error() method)
    this.applyErrorHelper(app);

    // 6. CORS
    this.applyCors(app);

    // 7. Security headers
    this.applySecurity(app);

    // 8. Session tracking
    this.applySessionTracking(app);

    // 9. Custom middlewares (compression will be applied here via ApiPlugin)
    this.applyCustomMiddlewares(app);

    // 10. Template engine
    this.applyTemplates(app);

    // 11. Body size limits
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

    // 🪵 Debug: failban protection enabled
    this.logger.debug('Failban protection enabled');
  }

  /**
   * Apply request ID middleware
   * @private
   */
  applyRequestId(app) {
    if (!this.requestId?.enabled) {
      // Only propagate verbose flag when requestId tracking is disabled
      app.use('*', async (c, next) => {
        c.set('verbose', this.verbose);
        await next();
      });
      return;
    }

    const requestIdMiddleware = createRequestIdMiddleware(this.requestId);
    app.use('*', requestIdMiddleware);

    // 🪵 Debug: request ID tracking enabled
    const headerName = this.requestId.headerName || 'X-Request-ID';
    this.logger.debug({ headerName }, `Request ID tracking enabled (header: ${headerName})`);
  }

  /**
   * Apply pino-http logger middleware
   * @private
   */
  async applyHttpLogger(app) {
    if (!this.httpLogger?.enabled || !this.logger) {
      return;
    }

    const pinoMiddleware = await createPinoLoggerMiddleware({
      logger: this.logger,
      autoLogging: this.httpLogger.autoLogging !== false,
      ignorePaths: this.httpLogger.ignorePaths || ['/health', '/metrics'],
      customLogLevel: this.httpLogger.customLogLevel,
      customProps: this.httpLogger.customProps
    });

    app.use('*', pinoMiddleware);

    // 🪵 Debug: pino-http logger enabled
    this.logger.debug({
      autoLogging: this.httpLogger.autoLogging !== false,
      ignorePaths: this.httpLogger.ignorePaths || ['/health', '/metrics']
    }, 'Pino HTTP logger enabled');
  }

  /**
   * Apply error helper middleware
   * Adds c.error() method to all route handlers
   * @private
   */
  applyErrorHelper(app) {
    const errorMiddleware = errorHelper({
      includeStack: process.env.NODE_ENV !== 'production',
      verbose: this.verbose
    });

    app.use('*', errorMiddleware);

    // 🪵 Debug: error helper enabled
    this.logger.debug('Error helper enabled (c.error() method available)');
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

    // 🪵 Debug: CORS enabled
    const maxAge = corsConfig.maxAge || 86400;
    const origin = corsConfig.origin || '*';
    this.logger.debug({ maxAge, origin }, `CORS enabled (maxAge: ${maxAge}s, origin: ${origin})`);
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

    // 🪵 Debug: security headers enabled
    this.logger.debug('Security headers enabled');
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

    // 🪵 Debug: session tracking enabled
    const storageType = this.sessionTracking.resource ? this.sessionTracking.resource : 'in-memory';
    this.logger.debug({ storageType }, `Session tracking enabled (${storageType})`);
  }

  /**
   * Apply custom middlewares
   * @private
   */
  applyCustomMiddlewares(app) {
    this.middlewares.forEach(middleware => {
      app.use('*', middleware);
    });

    // 🪵 Debug: applied custom middlewares
    if (this.middlewares.length > 0) {
      this.logger.debug({ count: this.middlewares.length }, `Applied ${this.middlewares.length} custom middleware(s)`);
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

    // 🪵 Debug: template engine enabled
    this.logger.debug({ engine: this.templates.engine }, `Template engine enabled: ${this.templates.engine}`);
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
