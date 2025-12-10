import type { Context, Next, MiddlewareHandler } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
import { idGenerator } from '../../../concerns/id.js';
import { createRequestIdMiddleware } from '../middlewares/request-id.js';
import { createPinoLoggerMiddleware, type LoggerLike, type CustomLogLevelFn, type CustomPropsFn } from '../middlewares/pino-logger.js';
import { createSecurityHeadersMiddleware, type SecurityHeadersMiddlewareConfig } from '../middlewares/security-headers.js';
import { createSessionTrackingMiddleware, type DatabaseLike as SessionDatabaseLike } from '../middlewares/session-tracking.js';
import { createFailbanMiddleware, setupFailbanViolationListener, type FailbanManagerLike, type ApiEventEmitterLike } from '../middlewares/failban.js';
import { errorHelper } from '../middlewares/error-helper.js';
import { setupTemplateEngine, type TemplateEngineOptions } from '../utils/template-engine.js';
import * as formatter from '../../shared/response-formatter.js';

type HonoType = {
  use: (path: string, handler: MiddlewareHandler) => void;
};

export interface RequestIdConfig {
  enabled?: boolean;
  headerName?: string;
  generator?: () => string;
}

export interface CorsConfig {
  enabled?: boolean;
  origin?: string | string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface SecurityConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

export interface SessionTrackingConfig {
  enabled?: boolean;
  resource?: string;
  [key: string]: unknown;
}

export interface TemplatesConfig {
  enabled?: boolean;
  engine?: string;
  [key: string]: unknown;
}

export interface HttpLoggerConfig {
  enabled?: boolean;
  autoLogging?: boolean;
  ignorePaths?: string[];
  customLogLevel?: (c: Context, res: Response) => string;
  customProps?: (c: Context) => Record<string, unknown>;
}

export interface EventEmitter {
  emitRequestEvent: (event: string, data: Record<string, unknown>) => void;
  emit?: (event: string, data: unknown) => void;
  on?: (event: string, handler: (data: unknown) => void) => void;
}

export interface DatabaseLike {
  [key: string]: unknown;
}

export interface CorsMiddlewareFactory {
  (config: {
    origin: string | string[];
    allowMethods: string[];
    allowHeaders: string[];
    exposeHeaders: string[];
    credentials: boolean;
    maxAge: number;
  }): MiddlewareHandler;
}

export interface MiddlewareChainOptions {
  requestId?: RequestIdConfig;
  cors?: CorsConfig;
  security?: SecurityConfig;
  sessionTracking?: SessionTrackingConfig;
  middlewares?: MiddlewareHandler[];
  templates?: TemplatesConfig;
  maxBodySize: number;
  failban?: FailbanManagerLike;
  events: EventEmitter;
  logLevel?: string;
  logger?: Logger;
  httpLogger?: HttpLoggerConfig;
  database?: SessionDatabaseLike;
  inFlightRequests: Set<symbol>;
  acceptingRequests: () => boolean;
  corsMiddleware?: CorsMiddlewareFactory;
}

export class MiddlewareChain {
  private requestId: RequestIdConfig | undefined;
  private cors: CorsConfig | undefined;
  private security: SecurityConfig | undefined;
  private sessionTracking: SessionTrackingConfig | undefined;
  private middlewares: MiddlewareHandler[];
  private templates: TemplatesConfig | undefined;
  private maxBodySize: number;
  private failban: FailbanManagerLike | undefined;
  private events: EventEmitter;
  private logLevel: string | undefined;
  private logger: Logger;
  private httpLogger: HttpLoggerConfig | undefined;
  private database: SessionDatabaseLike | undefined;
  private inFlightRequests: Set<symbol>;
  private acceptingRequests: () => boolean;
  private corsMiddleware: CorsMiddlewareFactory | undefined;

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
    logLevel,
    logger,
    httpLogger,
    database,
    inFlightRequests,
    acceptingRequests,
    corsMiddleware
  }: MiddlewareChainOptions) {
    this.requestId = requestId;
    this.cors = cors;
    this.security = security;
    this.sessionTracking = sessionTracking;
    this.middlewares = middlewares || [];
    this.templates = templates;
    this.maxBodySize = maxBodySize;
    this.failban = failban;
    this.events = events;
    this.logLevel = logLevel;
    this.logger = logger || { debug: () => {}, warn: () => {}, error: () => {}, info: () => {}, fatal: () => {}, trace: () => {}, child: () => ({}) } as unknown as Logger;
    this.httpLogger = httpLogger;
    this.database = database;
    this.inFlightRequests = inFlightRequests;
    this.acceptingRequests = acceptingRequests;
    this.corsMiddleware = corsMiddleware;
  }

  async apply(app: HonoType): Promise<void> {
    this.applyRequestTracking(app);
    this.applyFailban(app);
    this.applyRequestId(app);
    await this.applyHttpLogger(app);
    this.applyErrorHelper(app);
    this.applyCors(app);
    this.applySecurity(app);
    this.applySessionTracking(app);
    this.applyCustomMiddlewares(app);
    this.applyTemplates(app);
    this.applyBodySizeLimits(app);
  }

  private applyRequestTracking(app: HonoType): void {
    app.use('*', async (c: Context, next: Next): Promise<Response | void> => {
      if (!this.acceptingRequests()) {
        return c.json({ error: 'Server is shutting down' }, 503);
      }

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

      this.events.emitRequestEvent('start', requestInfo);

      try {
        await next();

        this.events.emitRequestEvent('end', {
          ...requestInfo,
          duration: Date.now() - startTime,
          status: c.res.status
        });
      } catch (err) {
        this.events.emitRequestEvent('error', {
          ...requestInfo,
          duration: Date.now() - startTime,
          error: (err as Error).message,
          stack: (err as Error).stack
        });
        throw err;
      } finally {
        this.inFlightRequests.delete(requestId);
      }
    });
  }

  private applyFailban(app: HonoType): void {
    if (!this.failban) {
      return;
    }

    const eventsAdapter: ApiEventEmitterLike | null = this.events.emit && this.events.on
      ? { emit: this.events.emit.bind(this.events), on: this.events.on.bind(this.events) }
      : null;

    const failbanMiddleware = createFailbanMiddleware({
      plugin: this.failban,
      events: eventsAdapter
    });

    app.use('*', failbanMiddleware);

    setupFailbanViolationListener({
      plugin: this.failban,
      events: eventsAdapter || undefined
    });

    this.logger.debug('Failban protection enabled');
  }

  private applyRequestId(app: HonoType): void {
    if (!this.requestId?.enabled) {
      app.use('*', async (c: Context, next: Next) => {
        c.set('logLevel', this.logLevel);
        await next();
      });
      return;
    }

    const requestIdMiddleware = createRequestIdMiddleware(this.requestId);
    app.use('*', requestIdMiddleware);

    const headerName = this.requestId.headerName || 'X-Request-ID';
    this.logger.debug({ headerName }, `Request ID tracking enabled (header: ${headerName})`);
  }

  private async applyHttpLogger(app: HonoType): Promise<void> {
    if (!this.httpLogger?.enabled || !this.logger) {
      return;
    }

    const pinoMiddleware = await createPinoLoggerMiddleware({
      logger: this.logger as unknown as LoggerLike,
      autoLogging: this.httpLogger.autoLogging !== false,
      ignorePaths: this.httpLogger.ignorePaths || ['/health', '/metrics'],
      customLogLevel: this.httpLogger.customLogLevel as CustomLogLevelFn | undefined,
      customProps: this.httpLogger.customProps as CustomPropsFn | null | undefined
    });

    app.use('*', pinoMiddleware);

    this.logger.debug({
      autoLogging: this.httpLogger.autoLogging !== false,
      ignorePaths: this.httpLogger.ignorePaths || ['/health', '/metrics']
    }, 'Pino HTTP logger enabled');
  }

  private applyErrorHelper(app: HonoType): void {
    const errorMiddleware = errorHelper({
      includeStack: process.env.NODE_ENV !== 'production',
      logLevel: this.logLevel
    });

    app.use('*', errorMiddleware);

    this.logger.debug('Error helper enabled (c.error() method available)');
  }

  private applyCors(app: HonoType): void {
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

    const maxAge = corsConfig.maxAge || 86400;
    const origin = corsConfig.origin || '*';
    this.logger.debug({ maxAge, origin }, `CORS enabled (maxAge: ${maxAge}s, origin: ${origin})`);
  }

  private applySecurity(app: HonoType): void {
    if (!this.security?.enabled) {
      return;
    }

    const securityMiddleware = createSecurityHeadersMiddleware(this.security as SecurityHeadersMiddlewareConfig);
    app.use('*', securityMiddleware);

    this.logger.debug('Security headers enabled');
  }

  private applySessionTracking(app: HonoType): void {
    if (!this.sessionTracking?.enabled) {
      return;
    }

    const sessionMiddleware = createSessionTrackingMiddleware(
      this.sessionTracking,
      this.database
    );
    app.use('*', sessionMiddleware);

    const storageType = this.sessionTracking.resource ? this.sessionTracking.resource : 'in-memory';
    this.logger.debug({ storageType }, `Session tracking enabled (${storageType})`);
  }

  private applyCustomMiddlewares(app: HonoType): void {
    this.middlewares.forEach(middleware => {
      app.use('*', middleware);
    });

    if (this.middlewares.length > 0) {
      this.logger.debug({ count: this.middlewares.length }, `Applied ${this.middlewares.length} custom middleware(s)`);
    }
  }

  private applyTemplates(app: HonoType): void {
    if (!this.templates?.enabled) {
      return;
    }

    const templateMiddleware = setupTemplateEngine(this.templates as TemplateEngineOptions);
    app.use('*', templateMiddleware);

    this.logger.debug({ engine: this.templates.engine }, `Template engine enabled: ${this.templates.engine}`);
  }

  private applyBodySizeLimits(app: HonoType): void {
    app.use('*', async (c: Context, next: Next): Promise<Response | void> => {
      const method = c.req.method;

      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const contentLength = c.req.header('content-length');

        if (contentLength) {
          const size = parseInt(contentLength);

          if (size > this.maxBodySize) {
            const response = formatter.payloadTooLarge(size, this.maxBodySize);
            c.header('Connection', 'close');
            return c.json(response, (response as { _status: number })._status as Parameters<typeof c.json>[1]);
          }
        }
      }

      await next();
    });
  }
}
