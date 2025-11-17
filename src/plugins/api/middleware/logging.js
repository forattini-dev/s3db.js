import { matchPath } from '../utils/path-matcher.js';

const DEFAULT_LOG_FORMAT = ':verb :url => :status (:elapsed ms, :res[content-length])';
const ANSI_RESET = '\x1b[0m';
const PASTEL_COLORS = {
  method: '\x1b[38;5;117m',
  url: '\x1b[38;5;195m',
  arrow: '\x1b[38;5;244m',
  time: '\x1b[38;5;176m',
  size: '\x1b[38;5;147m'
};

/**
 * Create logging middleware using Pino structured logging
 * @param {object} loggingConfig - Logging configuration object
 * @param {object} logger - Pino logger instance
 * @returns {function} Hono middleware
 */
export async function createLoggingMiddleware(loggingConfig, logger) {
  const { format, colorize, filter, excludePaths } = loggingConfig;
  const logFormat = format || DEFAULT_LOG_FORMAT;
  const useDefaultStyle = logFormat === DEFAULT_LOG_FORMAT;
  const excludedPatterns = Array.isArray(excludePaths) ? excludePaths : [];

  // 🪵 Get child logger for HTTP request logging
  const httpLogger = logger.child({ component: 'api-middleware' });

  const colorStatus = (status, value) => {
    if (!colorize) return value;
    let colorCode = '';
    if (status >= 500) colorCode = '\x1b[31m'; // red
    else if (status >= 400) colorCode = '\x1b[33m'; // yellow
    else if (status >= 300) colorCode = '\x1b[36m'; // cyan
    else if (status >= 200) colorCode = '\x1b[32m'; // green

    return colorCode ? `${colorCode}${value}\x1b[0m` : value;
  };

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
      { tokens: [':status'], value: colorStatus(status, String(status)) },
      { tokens: [':elapsed', ':response-time'], value: durationFormatted },
      { tokens: [':who', ':user'], value: user },
      { tokens: [':reqId', ':requestId'], value: requestId }
    ];

    const contentLength = c.res?.headers?.get('content-length') ?? '-';

    if (useDefaultStyle) {
      const sizeDisplay = contentLength === '-' ? '–' : contentLength;
      const methodText = colorize ? `${PASTEL_COLORS.method}${method}${ANSI_RESET}` : method;
      const urlText = colorize ? `${PASTEL_COLORS.url}${urlPath}${ANSI_RESET}` : urlPath;
      const arrowSymbol = colorize ? `${PASTEL_COLORS.arrow}⇒${ANSI_RESET}` : '⇒';
      const timeText = colorize ? `${PASTEL_COLORS.time}${durationFormatted}${ANSI_RESET}` : durationFormatted;
      const sizeText = colorize ? `${PASTEL_COLORS.size}${sizeDisplay}${ANSI_RESET}` : sizeDisplay;
      const line = `${methodText} ${urlPath} ${arrowSymbol} ${colorStatus(status, String(status))} (${timeText} ms, ${sizeText})`;

      // 🪵 Structured logging with Pino (replaces console.log)
      httpLogger.info({
        req: { method, url: urlPath },
        res: { statusCode: status },
        responseTime: duration,
        contentLength: sizeDisplay,
        requestId,
        user
      }, line); // Message includes colored formatting for TTY
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
