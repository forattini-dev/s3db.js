import { createRequestIdMiddleware } from '../middlewares/request-id.js';
import { createPinoLoggerMiddleware } from '../middlewares/pino-logger.js';
import { createSecurityHeadersMiddleware } from '../middlewares/security-headers.js';
import { createSessionTrackingMiddleware } from '../middlewares/session-tracking.js';
import { createFailbanMiddleware, setupFailbanViolationListener } from '../middlewares/failban.js';
import { errorHelper } from '../middlewares/error-helper.js';
import { setupTemplateEngine } from '../utils/template-engine.js';
import * as formatter from '../../shared/response-formatter.js';
export class MiddlewareChain {
    requestId;
    cors;
    security;
    sessionTracking;
    middlewares;
    templates;
    maxBodySize;
    failban;
    events;
    logLevel;
    logger;
    httpLogger;
    database;
    inFlightRequests;
    acceptingRequests;
    corsMiddleware;
    constructor({ requestId, cors, security, sessionTracking, middlewares, templates, maxBodySize, failban, events, logLevel, logger, httpLogger, database, inFlightRequests, acceptingRequests, corsMiddleware }) {
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
        this.logger = logger || { debug: () => { }, warn: () => { }, error: () => { }, info: () => { }, fatal: () => { }, trace: () => { }, child: () => ({}) };
        this.httpLogger = httpLogger;
        this.database = database;
        this.inFlightRequests = inFlightRequests;
        this.acceptingRequests = acceptingRequests;
        this.corsMiddleware = corsMiddleware;
    }
    async apply(app) {
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
    applyRequestTracking(app) {
        app.use('*', async (c, next) => {
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
            }
            catch (err) {
                this.events.emitRequestEvent('error', {
                    ...requestInfo,
                    duration: Date.now() - startTime,
                    error: err.message,
                    stack: err.stack
                });
                throw err;
            }
            finally {
                this.inFlightRequests.delete(requestId);
            }
        });
    }
    applyFailban(app) {
        if (!this.failban) {
            return;
        }
        const eventsAdapter = this.events.emit && this.events.on
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
    applyRequestId(app) {
        if (!this.requestId?.enabled) {
            app.use('*', async (c, next) => {
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
        this.logger.debug({
            autoLogging: this.httpLogger.autoLogging !== false,
            ignorePaths: this.httpLogger.ignorePaths || ['/health', '/metrics']
        }, 'Pino HTTP logger enabled');
    }
    applyErrorHelper(app) {
        const errorMiddleware = errorHelper({
            includeStack: process.env.NODE_ENV !== 'production',
            logLevel: this.logLevel
        });
        app.use('*', errorMiddleware);
        this.logger.debug('Error helper enabled (c.error() method available)');
    }
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
        const maxAge = corsConfig.maxAge || 86400;
        const origin = corsConfig.origin || '*';
        this.logger.debug({ maxAge, origin }, `CORS enabled (maxAge: ${maxAge}s, origin: ${origin})`);
    }
    applySecurity(app) {
        if (!this.security?.enabled) {
            return;
        }
        const securityMiddleware = createSecurityHeadersMiddleware(this.security);
        app.use('*', securityMiddleware);
        this.logger.debug('Security headers enabled');
    }
    applySessionTracking(app) {
        if (!this.sessionTracking?.enabled) {
            return;
        }
        const sessionMiddleware = createSessionTrackingMiddleware(this.sessionTracking, this.database);
        app.use('*', sessionMiddleware);
        const storageType = this.sessionTracking.resource ? this.sessionTracking.resource : 'in-memory';
        this.logger.debug({ storageType }, `Session tracking enabled (${storageType})`);
    }
    applyCustomMiddlewares(app) {
        this.middlewares.forEach(middleware => {
            app.use('*', middleware);
        });
        if (this.middlewares.length > 0) {
            this.logger.debug({ count: this.middlewares.length }, `Applied ${this.middlewares.length} custom middleware(s)`);
        }
    }
    applyTemplates(app) {
        if (!this.templates?.enabled) {
            return;
        }
        const templateMiddleware = setupTemplateEngine(this.templates);
        app.use('*', templateMiddleware);
        this.logger.debug({ engine: this.templates.engine }, `Template engine enabled: ${this.templates.engine}`);
    }
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
//# sourceMappingURL=middleware-chain.class.js.map