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

  // Check if pino-http is available
  if (!pinoHttpModule) {
    logger.warn(
      'pino-http is not installed. HTTP request logging is disabled. ' +
      'Install with: npm install pino-http'
    );

    // Return no-op middleware
    return async (c, next) => {
      c.set('logger', logger);
      c.set('reqLogger', logger);
      await next();
    };
  }

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

  // Return Hono-compatible middleware
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
