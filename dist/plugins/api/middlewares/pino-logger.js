let pinoHttp = null;
let pinoHttpLoaded = false;
async function loadPinoHttp() {
    if (pinoHttpLoaded)
        return pinoHttp;
    try {
        const module = await import('pino-http');
        pinoHttp = (module.default || module);
    }
    catch {
        pinoHttp = null;
    }
    pinoHttpLoaded = true;
    return pinoHttp;
}
function defaultLogLevel(_req, res, err) {
    const statusCode = res.statusCode ?? res.statusCode;
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
function resSerializer(res) {
    return {
        statusCode: res.statusCode,
        headers: {
            'content-type': res.getHeader?.('content-type'),
            'content-length': res.getHeader?.('content-length')
        }
    };
}
function errSerializer(err) {
    if (!err || typeof err !== 'object') {
        return err;
    }
    const errorObj = err;
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
function createSimpleHttpLoggerMiddleware(options) {
    const { logger, autoLogging = true, customLogLevel = defaultLogLevel, ignorePaths = [], customProps = null } = options;
    return async (c, next) => {
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
            const level = customLogLevel({ method, url: c.req.url }, { statusCode }, null);
            const logFn = logger[level];
            if (typeof logFn === 'function') {
                logFn.call(logger, {
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
        }
        catch (err) {
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
export async function createPinoLoggerMiddleware(options) {
    const { logger, autoLogging = true, customLogLevel = defaultLogLevel, ignorePaths = [], customProps = null } = options;
    if (!logger) {
        throw new Error('Logger is required for pino-http middleware');
    }
    const pinoHttpModule = await loadPinoHttp();
    if (!pinoHttpModule) {
        logger.debug('pino-http not installed - using simple HTTP logging middleware. ' +
            'For enhanced features, install: npm install pino-http');
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
    return async (c, next) => {
        const path = c.req.path;
        if (ignorePaths.some(ignorePath => path.startsWith(ignorePath))) {
            return next();
        }
        c.set('logger', logger);
        const req = c.req.raw;
        const res = c.res;
        httpLogger(req, res);
        c.set('reqLogger', req.log);
        try {
            await next();
            if (autoLogging && req.log) {
                const statusCode = c.res.status || 200;
                const level = customLogLevel(req, { statusCode }, null);
                const logFn = req.log[level];
                if (typeof logFn === 'function') {
                    const headers = c.res.headers;
                    logFn.call(req.log, {
                        res: {
                            statusCode,
                            headers: Object.fromEntries(headers.entries())
                        }
                    }, 'request completed');
                }
            }
        }
        catch (err) {
            if (req.log) {
                req.log.error({ err }, 'request error');
            }
            throw err;
        }
    };
}
export function getRequestLogger(c) {
    return c.get('reqLogger') || c.get('logger');
}
export function customLogLevelExample(req, res) {
    const url = req.url ?? req.url;
    const statusCode = res.statusCode ?? res.statusCode;
    if (url === '/health' && statusCode < 400) {
        return 'debug';
    }
    if (statusCode === 401 || statusCode === 403) {
        return 'warn';
    }
    return defaultLogLevel(req, res, null);
}
//# sourceMappingURL=pino-logger.js.map