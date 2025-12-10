import pino from 'pino';
import { createRedactRules } from './logger-redact.js';
let globalLogger = null;
function serializeError(err) {
    if (!err || typeof err !== 'object') {
        return err;
    }
    const error = err;
    if (typeof error.toJSON === 'function') {
        return error.toJSON();
    }
    return {
        ...error,
        message: error.message,
        stack: error.stack,
    };
}
function createPrettyTransport() {
    return {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false
        }
    };
}
function createDefaultTransport() {
    const envFormat = process.env.S3DB_LOG_FORMAT?.toLowerCase();
    if (envFormat === 'json') {
        return undefined;
    }
    return createPrettyTransport();
}
export function createLogger(options = {}) {
    const { level = 'info', name, format, transport, bindings = {}, redactPatterns = [], maxPayloadBytes = 1_000_000 } = options;
    const redactRules = createRedactRules(redactPatterns);
    let finalTransport;
    if (format === 'json') {
        finalTransport = undefined;
    }
    else if (format === 'pretty') {
        finalTransport = createPrettyTransport();
    }
    else if (transport !== undefined) {
        finalTransport = transport;
    }
    else {
        finalTransport = createDefaultTransport();
    }
    const normalizedBindings = bindings && typeof bindings === 'object' ? bindings : {};
    const config = {
        level,
        redact: redactRules,
        transport: finalTransport || undefined,
        serializers: {
            err: serializeError,
            error: serializeError
        }
    };
    let logger = pino({
        ...config,
        name
    });
    const baseBindings = name ? { ...normalizedBindings, name } : normalizedBindings;
    if (baseBindings && Object.keys(baseBindings).length > 0) {
        logger = logger.child(baseBindings);
    }
    logger._maxPayloadBytes = maxPayloadBytes;
    return logger;
}
export function getGlobalLogger(options = {}) {
    if (!globalLogger) {
        globalLogger = createLogger(options);
    }
    return globalLogger;
}
export function resetGlobalLogger() {
    globalLogger = null;
}
export function getLoggerOptionsFromEnv(configOptions = {}) {
    const options = { ...configOptions };
    if (process.env.S3DB_LOG_LEVEL) {
        options.level = process.env.S3DB_LOG_LEVEL;
    }
    if (process.env.S3DB_LOG_FORMAT) {
        const format = process.env.S3DB_LOG_FORMAT.toLowerCase();
        if (format === 'json' || format === 'pretty') {
            options.format = format;
        }
    }
    else if (process.env.S3DB_LOG_PRETTY === 'false') {
        options.format = 'json';
    }
    else if (process.env.S3DB_LOG_PRETTY === 'true') {
        options.format = 'pretty';
    }
    return options;
}
export function exampleUsage() {
    const logger = createLogger({ level: 'debug' });
    logger.info('Application started');
    const jsonLogger = createLogger({ level: 'info', format: 'json' });
    jsonLogger.info({ user: 'john' }, 'User logged in');
    const prettyLogger = createLogger({ level: 'debug', format: 'pretty' });
    prettyLogger.debug({ query: 'SELECT *' }, 'Database query');
    const resourceLogger = logger.child({ resource: 'users' });
    resourceLogger.debug({ userId: 123 }, 'user fetched');
    const globalLog = getGlobalLogger({ level: 'info' });
    globalLog.warn('Warning message');
    const err = new Error('Something went wrong');
    err.toJSON = () => ({ message: err.message, custom: 'data' });
    logger.error({ err }, 'Error occurred');
}
export default createLogger;
//# sourceMappingURL=logger.js.map