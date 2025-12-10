import type { Context, Next } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
import { matchPath } from '../utils/path-matcher.js';
import { formatPrettyHttpLog, colorizeStatus } from '../utils/http-logger.js';

const DEFAULT_LOG_FORMAT = ':verb :url => :status (:elapsed ms, :res[content-length])';

export interface FilterContext {
  context: Context;
  method: string;
  path: string;
  status: number;
  duration: number;
  requestId: string | undefined;
}

export interface LoggingConfig {
  format?: string;
  colorize?: boolean;
  filter?: (ctx: FilterContext) => boolean;
  excludePaths?: string[];
}

interface TokenReplacement {
  tokens: string[];
  value: string | number | undefined;
}

export async function createLoggingMiddleware(
  loggingConfig: LoggingConfig,
  logger: Logger
): Promise<(c: Context, next: Next) => Promise<void>> {
  const { format, colorize = true, filter, excludePaths } = loggingConfig;
  const logFormat = format || DEFAULT_LOG_FORMAT;
  const useDefaultStyle = logFormat === DEFAULT_LOG_FORMAT;
  const excludedPatterns = Array.isArray(excludePaths) ? excludePaths : [];

  const httpLogger = logger.child({});

  const formatHeaderTokens = (message: string, headers?: Headers): string => {
    return message.replace(/:res\[([^\]]+)\]/gi, (_, headerName: string) => {
      const value = headers?.get(headerName) ?? headers?.get(headerName.toLowerCase());
      return value ?? '-';
    });
  };

  const replaceTokens = (message: string, replacements: TokenReplacement[]): string => {
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

  return async (c: Context, next: Next): Promise<void> => {
    const start = process.hrtime.bigint();
    const method = c.req.method;
    const path = c.req.path;
    const requestId = c.get('requestId') as string | undefined;

    await next();

    const elapsedNs = process.hrtime.bigint() - start;
    const duration = Number(elapsedNs) / 1_000_000;
    const durationFormatted = duration.toFixed(3);
    const status = c.res?.status ?? 0;
    const user = (c.get('user') as { username?: string; email?: string } | undefined);
    const userName = user?.username || user?.email || 'anonymous';

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

    const baseReplacements: TokenReplacement[] = [
      { tokens: [':verb', ':method'], value: method },
      { tokens: [':ruta', ':path'], value: path },
      { tokens: [':url'], value: urlPath },
      { tokens: [':status'], value: colorizeStatus(status, String(status)) },
      { tokens: [':elapsed', ':response-time'], value: durationFormatted },
      { tokens: [':who', ':user'], value: userName },
      { tokens: [':reqId', ':requestId'], value: requestId }
    ];

    const contentLength = c.res?.headers?.get('content-length') ?? '-';

    const isHealthCheck = path === '/health' || path === '/health/live' || path === '/health/ready' || path === '/readiness' || path === '/liveness';
    const logLevel = isHealthCheck ? 'debug' : 'info';

    if (useDefaultStyle) {
      const prettyMessage = formatPrettyHttpLog({
        method,
        url: urlPath,
        status,
        duration,
        contentLength,
        colorize
      });

      httpLogger[logLevel](prettyMessage);
      return;
    }

    let logMessage = replaceTokens(logFormat, baseReplacements);

    logMessage = formatHeaderTokens(logMessage, c.res?.headers);

    httpLogger[logLevel]({
      req: { method, url: urlPath },
      res: { statusCode: status },
      responseTime: duration,
      requestId,
      user: userName
    }, logMessage);
  };
}
