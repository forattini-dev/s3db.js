export function createLoggingMiddleware(config = {}, context) {
    const { format = ':method :path :status :response-time ms', logLevel = 'info' } = config;
    return async function (c, next) {
        const start = Date.now();
        const method = c.req.method;
        const path = c.req.path;
        const requestId = c.get('requestId');
        await next();
        const duration = Date.now() - start;
        const status = c.res.status;
        const user = c.get('user');
        const username = user?.username || user?.email || 'anonymous';
        let logMessage = format
            .replace(':method', method)
            .replace(':path', path)
            .replace(':status', status.toString())
            .replace(':response-time', duration.toString())
            .replace(':user', username)
            .replace(':requestId', requestId || 'unknown');
        const logger = context?.logger || this?.logger;
        if (logger) {
            logger.info(`[HTTP] ${logMessage}`);
        }
    };
}
//# sourceMappingURL=logging.js.map