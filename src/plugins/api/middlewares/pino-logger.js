/**
 * Pino HTTP Logger Middleware
 *
 * Integrates pino-http with Hono for automatic HTTP request/response logging.
 *
 * Features:
 * - Automatic request/response logging
 * - Request ID tracking (from x-request-id header or generated)
 * - Error serialization with toJSON() support
 * - Customizable log levels per HTTP status
 * - Compatible with s3db.js error handling
 *
 * **Dependency:** Requires `pino-http` to be installed separately:
 *   npm install pino-http
 *
 * Usage:
 *   import { createPinoLoggerMiddleware } from './middlewares/pino-logger.js';
 *
 *   const middleware = createPinoLoggerMiddleware({
 *     logger: myPinoLogger,
 *     autoLogging: true
 *   });
 *
 *   app.use('*', middleware);
 */

// Lazy load pino-http to avoid errors if not installed
let pinoHttp = null;
let pinoHttpLoaded = false;

async function loadPinoHttp() {
  if (pinoHttpLoaded) return pinoHttp;

  try {
    const module = await import('pino-http');
    pinoHttp = module.default || module;
  } catch (err) {
    pinoHttp = null;
  }

  pinoHttpLoaded = true;
  return pinoHttp;
}

/**
 * Create pino-http middleware adapted for Hono
 *
 * Dynamically detects if pino-http is installed:
 * - If installed: Uses full pino-http with all features
 * - If not installed: Falls back to simple logging middleware
 *
 * @param {Object} options - Middleware options
 * @param {Object} options.logger - Pino logger instance
 * @param {boolean} [options.autoLogging=true] - Enable automatic request/response logging
 * @param {Function} [options.customLogLevel] - Custom function to determine log level based on res
 * @param {Array<string>} [options.ignorePaths=[]] - Paths to skip logging (e.g., ['/health', '/metrics'])
 * @param {Object} [options.customProps] - Additional properties to include in logs
 * @returns {Function} Hono middleware function
 */
export async function createPinoLoggerMiddleware(options = {}) {
  const {
    logger,
    autoLogging = true,
    customLogLevel = defaultLogLevel,
    ignorePaths = [],
    customProps = null
  } = options;

  if (!logger) {
    throw new Error('Logger is required for pino-http middleware');
  }

  // Load pino-http lazily
  const pinoHttpModule = await loadPinoHttp();

  // If pino-http is NOT available, use simple fallback middleware
  if (!pinoHttpModule) {
    logger.debug(
      'pino-http not installed - using simple HTTP logging middleware. ' +
      'For enhanced features, install: npm install pino-http'
    );

    return createSimpleHttpLoggerMiddleware({
      logger,
      autoLogging,
      customLogLevel,
      ignorePaths,
      customProps
    });
  }

  // pino-http IS available - use full-featured middleware
  logger.debug('pino-http detected - using enhanced HTTP logging');

  // Create pino-http instance
  const httpLogger = pinoHttpModule({
    logger,
    autoLogging,
    customLogLevel,
    customProps: customProps || undefined,
    serializers: {
      req: reqSerializer,
      res: resSerializer,
      err: errSerializer
    }
  });

  // Return Hono-compatible middleware with pino-http
  return async (c, next) => {
    const path = c.req.path;

    // Skip logging for ignored paths
    if (ignorePaths.some(ignorePath => path.startsWith(ignorePath))) {
      return next();
    }

    // Attach logger to context for use in handlers
    c.set('logger', logger);

    // Get native Node.js request/response objects
    const req = c.req.raw;
    const res = c.res;

    // Apply pino-http to native request
    httpLogger(req, res);

    // Attach request logger to context (child logger with request ID)
    c.set('reqLogger', req.log);

    try {
      await next();

      // Log response after request completes
      if (autoLogging) {
        const statusCode = c.res.status || 200;
        const level = customLogLevel(req, res, null);

        req.log[level]({
          res: {
            statusCode,
            headers: Object.fromEntries(c.res.headers.entries())
          }
        }, 'request completed');
      }
    } catch (err) {
      // Log error
      req.log.error({ err }, 'request error');
      throw err; // Re-throw for error handler
    }
  };
}

/**
 * Create simple HTTP logger middleware (fallback when pino-http not installed)
 *
 * Provides basic HTTP logging without pino-http dependency:
 * - Request logging (method, URL, headers)
 * - Response logging (status code, duration)
 * - Error logging
 *
 * @param {Object} options - Middleware options
 * @param {Object} options.logger - Pino logger instance
 * @param {boolean} [options.autoLogging=true] - Enable automatic logging
 * @param {Function} [options.customLogLevel] - Custom log level function
 * @param {Array<string>} [options.ignorePaths=[]] - Paths to skip
 * @param {Object} [options.customProps] - Additional properties
 * @returns {Function} Hono middleware function
 */
function createSimpleHttpLoggerMiddleware(options) {
  const {
    logger,
    autoLogging = true,
    customLogLevel = defaultLogLevel,
    ignorePaths = [],
    customProps = null
  } = options;

  return async (c, next) => {
    const path = c.req.path;

    // Skip logging for ignored paths
    if (ignorePaths.some(ignorePath => path.startsWith(ignorePath))) {
      // Still attach logger to context
      c.set('logger', logger);
      c.set('reqLogger', logger);
      return next();
    }

    // Attach logger to context
    c.set('logger', logger);
    c.set('reqLogger', logger);

    if (!autoLogging) {
      return next();
    }

    const startTime = Date.now();
    const method = c.req.method;
    const url = c.req.url;

    // Log request
    logger.info({
      req: {
        method,
        url: path,
        headers: {
          'user-agent': c.req.header('user-agent'),
          'content-type': c.req.header('content-type')
        }
      },
      ...(customProps ? customProps(c.req.raw, c.res) : {})
    }, 'request started');

    try {
      await next();

      // Log response
      const duration = Date.now() - startTime;
      const statusCode = c.res.status || 200;

      // Determine log level based on status code
      const level = customLogLevel(
        { method, url },
        { statusCode },
        null
      );

      logger[level]({
        req: {
          method,
          url: path
        },
        res: {
          statusCode,
          headers: {
            'content-type': c.res.headers.get('content-type')
          }
        },
        responseTime: duration
      }, 'request completed');

    } catch (err) {
      // Log error
      const duration = Date.now() - startTime;

      logger.error({
        req: {
          method,
          url: path
        },
        err: errSerializer(err),
        responseTime: duration
      }, 'request error');

      throw err; // Re-throw for error handler
    }
  };
}

/**
 * Default log level based on HTTP status code
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Error} err - Error object (if any)
 * @returns {string} Log level
 */
function defaultLogLevel(req, res, err) {
  if (err || (res && res.statusCode >= 500)) {
    return 'error';
  }
  if (res && res.statusCode >= 400) {
    return 'warn';
  }
  if (res && res.statusCode >= 300) {
    return 'info';
  }
  return 'info';
}

/**
 * Request serializer
 *
 * @param {Object} req - Request object
 * @returns {Object} Serialized request
 */
function reqSerializer(req) {
  return {
    id: req.id,
    method: req.method,
    url: req.url,
    headers: {
      host: req.headers.host,
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
      'accept': req.headers.accept
    },
    remoteAddress: req.socket?.remoteAddress,
    remotePort: req.socket?.remotePort
  };
}

/**
 * Response serializer
 *
 * @param {Object} res - Response object
 * @returns {Object} Serialized response
 */
function resSerializer(res) {
  return {
    statusCode: res.statusCode,
    headers: {
      'content-type': res.getHeader?.('content-type'),
      'content-length': res.getHeader?.('content-length')
    }
  };
}

/**
 * Error serializer with toJSON() support
 *
 * @param {Error} err - Error object
 * @returns {Object} Serialized error
 */
function errSerializer(err) {
  if (!err || typeof err !== 'object') {
    return err;
  }

  // Use toJSON() if available (s3db.js custom errors)
  if (typeof err.toJSON === 'function') {
    return err.toJSON();
  }

  // Fallback to standard error properties
  return {
    type: err.constructor.name,
    message: err.message,
    stack: err.stack,
    code: err.code,
    statusCode: err.statusCode,
    ...err
  };
}

/**
 * Helper to get request logger from context
 *
 * @param {Object} c - Hono context
 * @returns {Object} Request-scoped Pino logger
 */
export function getRequestLogger(c) {
  return c.get('reqLogger') || c.get('logger');
}

/**
 * Example: Custom log level function
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {string} Log level
 */
export function customLogLevelExample(req, res) {
  // Don't log success responses for health checks
  if (req.url === '/health' && res.statusCode < 400) {
    return 'debug';
  }

  // Log auth failures as warnings
  if (res.statusCode === 401 || res.statusCode === 403) {
    return 'warn';
  }

  // Use default logic for everything else
  return defaultLogLevel(req, res);
}
