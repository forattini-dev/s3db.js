import type { Context, Next, MiddlewareHandler } from 'hono';
import type { S3DBLogger } from '../../../concerns/logger.js';

export interface LoggingConfig {
  format?: string;
  logLevel?: string;
}

export interface LoggingContext {
  logger: S3DBLogger;
}

interface UserInfo {
  username?: string;
  email?: string;
}

export function createLoggingMiddleware(
  config: LoggingConfig = {},
  context?: LoggingContext
): MiddlewareHandler {
  const {
    format = ':method :path :status :response-time ms',
    logLevel = 'info'
  } = config;

  return async function(this: LoggingContext | undefined, c: Context, next: Next): Promise<void> {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    const requestId = c.get('requestId') as string | undefined;

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    const user = c.get('user') as UserInfo | undefined;
    const username = user?.username || user?.email || 'anonymous';

    let logMessage = format
      .replace(':method', method)
      .replace(':path', path)
      .replace(':status', status.toString())
      .replace(':response-time', duration.toString())
      .replace(':user', username)
      .replace(':requestId', requestId || 'unknown');

    const logger = context?.logger || (this as LoggingContext | undefined)?.logger;
    if (logger) {
      logger.info(`[HTTP] ${logMessage}`);
    }
  };
}
