import { matchPath } from '../utils/path-matcher.js';
import { formatPrettyHttpLog, colorizeStatus } from '../utils/http-logger.js';

const DEFAULT_LOG_FORMAT = ':verb :url => :status (:elapsed ms, :res[content-length])';

/**
 * Create logging middleware using Pino structured logging with pretty format
 * @param {object} loggingConfig - Logging configuration object
 * @param {object} logger - Pino logger instance
 * @returns {function} Hono middleware
 */
export async function createLoggingMiddleware(loggingConfig, logger) {
  const { format, colorize = true, filter, excludePaths } = loggingConfig;
  const logFormat = format || DEFAULT_LOG_FORMAT;
  const useDefaultStyle = logFormat === DEFAULT_LOG_FORMAT;
  const excludedPatterns = Array.isArray(excludePaths) ? excludePaths : [];

  // 🪵 Get child logger for HTTP request logging (inherits pretty format from parent)
  const httpLogger = logger.child({ component: 'http' });


  const formatHeaderTokens = (message, headers) => {
    return message.replace(/:res\[([^\]]+)\]/gi, (_, headerName) => {
      const value = headers?.get(headerName) ?? headers?.get(headerName.toLowerCase());
      return value ?? '-';
    });
  };

  const replaceTokens = (message, replacements) => {
    let result = message;
    for (const { tokens, value } of replacements) {
      tokens.forEach((token) => {
        if (result.includes(token)) {
          result = result.split(token).join(String(value));
        }
      });
    }
    return result;
  };

  return async (c, next) => {
    const start = process.hrtime.bigint();
    const method = c.req.method;
    const path = c.req.path;
    const requestId = c.get('requestId');

    await next();

    const elapsedNs = process.hrtime.bigint() - start;
    const duration = Number(elapsedNs) / 1_000_000;
    const durationFormatted = duration.toFixed(3);
    const status = c.res?.status ?? 0;
    const user = c.get('user')?.username || c.get('user')?.email || 'anonymous';

    const skipByPath = excludedPatterns.some((pattern) => matchPath(pattern, path));
    const skipByFilter = typeof filter === 'function'
      ? filter({
          context: c,
          method,
          path,
          status,
          duration,
          requestId
        }) === false
      : false;

    if (skipByPath || skipByFilter) {
      return;
    }

    let urlPath = path;
    try {
      const parsed = new URL(c.req.url);
      urlPath = parsed.pathname + parsed.search;
    } catch {
      urlPath = path;
    }

    const baseReplacements = [
      { tokens: [':verb', ':method'], value: method },
      { tokens: [':ruta', ':path'], value: path },
      { tokens: [':url'], value: urlPath },
      { tokens: [':status'], value: colorizeStatus(status, String(status)) },
      { tokens: [':elapsed', ':response-time'], value: durationFormatted },
      { tokens: [':who', ':user'], value: user },
      { tokens: [':reqId', ':requestId'], value: requestId }
    ];

    const contentLength = c.res?.headers?.get('content-length') ?? '-';

    if (useDefaultStyle) {
      // 🪵 Pretty HTTP logging inspired by Morgan's dev format
      const prettyMessage = formatPrettyHttpLog({
        method,
        url: urlPath,
        status,
        duration,
        contentLength,
        colorize
      });

      httpLogger.info({
        req: { method, url: urlPath },
        res: { statusCode: status },
        responseTime: duration,
        contentLength: contentLength === '-' ? undefined : contentLength,
        requestId,
        user
      }, prettyMessage);
      return;
    }

    let logMessage = replaceTokens(logFormat, baseReplacements);

    logMessage = formatHeaderTokens(logMessage, c.res?.headers);

    // 🪵 Structured logging with Pino (replaces console.log)
    httpLogger.info({
      req: { method, url: urlPath },
      res: { statusCode: status },
      responseTime: duration,
      requestId,
      user
    }, logMessage);
  };
}
