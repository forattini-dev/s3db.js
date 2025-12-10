import type { Context, MiddlewareHandler, Next } from 'hono';

export interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  [level: string]: ((obj: unknown, msg?: string) => void) | unknown;
}

export interface RequestLike {
  id?: string;
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  socket?: {
    remoteAddress?: string;
    remotePort?: number;
  };
  log?: LoggerLike;
  raw?: unknown;
}

export interface ResponseLike {
  statusCode?: number;
  status?: number;
  headers?: Headers;
  getHeader?(name: string): string | number | string[] | undefined;
}

export interface SerializedRequest {
  id?: string;
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  remoteAddress?: string;
  remotePort?: number;
}

export interface SerializedResponse {
  statusCode?: number;
  headers: Record<string, string | number | string[] | undefined>;
}

export interface SerializedError {
  type?: string;
  message?: string;
  stack?: string;
  code?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export type CustomLogLevelFn = (req: RequestLike | { method: string; url: string }, res: ResponseLike | { statusCode: number }, err: Error | null) => string;
export type CustomPropsFn = (req: unknown, res: unknown) => Record<string, unknown>;

export interface PinoLoggerOptions {
  logger: LoggerLike;
  autoLogging?: boolean;
  customLogLevel?: CustomLogLevelFn;
  ignorePaths?: string[];
  customProps?: CustomPropsFn | null;
}

export interface PinoHttpLike {
  (req: unknown, res: unknown): void;
}

export interface PinoHttpModule {
  (options: {
    logger: LoggerLike;
    autoLogging: boolean;
    customLogLevel: CustomLogLevelFn;
    customProps?: CustomPropsFn;
    serializers: {
      req: (req: RequestLike) => SerializedRequest;
      res: (res: ResponseLike) => SerializedResponse;
      err: (err: Error) => SerializedError;
    };
  }): PinoHttpLike;
}

let pinoHttp: PinoHttpModule | null = null;
let pinoHttpLoaded = false;

async function loadPinoHttp(): Promise<PinoHttpModule | null> {
  if (pinoHttpLoaded) return pinoHttp;

  try {
    const module = await import('pino-http');
    pinoHttp = (module.default || module) as unknown as PinoHttpModule;
  } catch {
    pinoHttp = null;
  }

  pinoHttpLoaded = true;
  return pinoHttp;
}

function defaultLogLevel(_req: RequestLike | { method: string; url: string }, res: ResponseLike | { statusCode: number }, err: Error | null): string {
  const statusCode = (res as ResponseLike).statusCode ?? (res as { statusCode: number }).statusCode;
  if (err || (statusCode && statusCode >= 500)) {
    return 'error';
  }
  if (statusCode && statusCode >= 400) {
    return 'warn';
  }
  if (statusCode && statusCode >= 300) {
    return 'info';
  }
  return 'info';
}

function reqSerializer(req: RequestLike): SerializedRequest {
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

function resSerializer(res: ResponseLike): SerializedResponse {
  return {
    statusCode: res.statusCode,
    headers: {
      'content-type': res.getHeader?.('content-type'),
      'content-length': res.getHeader?.('content-length')
    }
  };
}

function errSerializer(err: unknown): SerializedError {
  if (!err || typeof err !== 'object') {
    return err as SerializedError;
  }

  const errorObj = err as Error & { toJSON?: () => SerializedError; code?: string; statusCode?: number };

  if (typeof errorObj.toJSON === 'function') {
    return errorObj.toJSON();
  }

  return {
    ...errorObj,
    type: errorObj.constructor.name,
    message: errorObj.message,
    stack: errorObj.stack,
    code: errorObj.code,
    statusCode: errorObj.statusCode
  };
}

function createSimpleHttpLoggerMiddleware(options: PinoLoggerOptions): MiddlewareHandler {
  const {
    logger,
    autoLogging = true,
    customLogLevel = defaultLogLevel,
    ignorePaths = [],
    customProps = null
  } = options;

  return async (c: Context, next: Next): Promise<void | Response> => {
    const path = c.req.path;

    if (ignorePaths.some(ignorePath => path.startsWith(ignorePath))) {
      c.set('logger', logger);
      c.set('reqLogger', logger);
      return next();
    }

    c.set('logger', logger);
    c.set('reqLogger', logger);

    if (!autoLogging) {
      return next();
    }

    const startTime = Date.now();
    const method = c.req.method;

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

      const duration = Date.now() - startTime;
      const statusCode = c.res.status || 200;

      const level = customLogLevel(
        { method, url: c.req.url },
        { statusCode },
        null
      );

      const logFn = logger[level];
      if (typeof logFn === 'function') {
        (logFn as (obj: unknown, msg: string) => void).call(logger, {
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
      }

    } catch (err) {
      const duration = Date.now() - startTime;

      logger.error({
        req: {
          method,
          url: path
        },
        err: errSerializer(err),
        responseTime: duration
      }, 'request error');

      throw err;
    }
  };
}

export async function createPinoLoggerMiddleware(options: PinoLoggerOptions): Promise<MiddlewareHandler> {
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

  const pinoHttpModule = await loadPinoHttp();

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

  logger.debug('pino-http detected - using enhanced HTTP logging');

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

  return async (c: Context, next: Next): Promise<void | Response> => {
    const path = c.req.path;

    if (ignorePaths.some(ignorePath => path.startsWith(ignorePath))) {
      return next();
    }

    c.set('logger', logger);

    const req = c.req.raw as unknown as RequestLike;
    const res = c.res;

    httpLogger(req, res);

    c.set('reqLogger', req.log);

    try {
      await next();

      if (autoLogging && req.log) {
        const statusCode = c.res.status || 200;
        const level = customLogLevel(req, { statusCode } as ResponseLike, null);

        const logFn = req.log[level];
        if (typeof logFn === 'function') {
          const headers = c.res.headers as unknown as { entries(): IterableIterator<[string, string]> };
          (logFn as (obj: unknown, msg: string) => void).call(req.log, {
            res: {
              statusCode,
              headers: Object.fromEntries(headers.entries())
            }
          }, 'request completed');
        }
      }
    } catch (err) {
      if (req.log) {
        req.log.error({ err }, 'request error');
      }
      throw err;
    }
  };
}

export function getRequestLogger(c: Context): LoggerLike {
  return c.get('reqLogger') || c.get('logger');
}

export function customLogLevelExample(req: RequestLike | { method: string; url: string }, res: ResponseLike | { statusCode: number }): string {
  const url = (req as RequestLike).url ?? (req as { url: string }).url;
  const statusCode = (res as ResponseLike).statusCode ?? (res as { statusCode: number }).statusCode;

  if (url === '/health' && statusCode < 400) {
    return 'debug';
  }

  if (statusCode === 401 || statusCode === 403) {
    return 'warn';
  }

  return defaultLogLevel(req, res, null);
}
