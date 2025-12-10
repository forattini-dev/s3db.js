import pino, { Logger as PinoLogger, LoggerOptions as PinoLoggerOptions, TransportSingleOptions } from 'pino';
import { createRedactRules } from './logger-redact.js';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
export type LogFormat = 'json' | 'pretty';

export interface LoggerOptions {
  level?: LogLevel;
  name?: string;
  format?: LogFormat;
  transport?: TransportSingleOptions;
  bindings?: Record<string, unknown>;
  redactPatterns?: RegExp[];
  maxPayloadBytes?: number;
}

export interface S3DBLogger extends PinoLogger {
  _maxPayloadBytes?: number;
}

export type Logger = S3DBLogger;

let globalLogger: S3DBLogger | null = null;

function serializeError(err: unknown): Record<string, unknown> | unknown {
  if (!err || typeof err !== 'object') {
    return err;
  }

  const error = err as Error & { toJSON?: () => Record<string, unknown>; code?: string };

  if (typeof error.toJSON === 'function') {
    return error.toJSON();
  }

    return {
      ...error,
      message: error.message,
      stack: error.stack,
    };
}

function createPrettyTransport(): TransportSingleOptions {
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

function createDefaultTransport(): TransportSingleOptions | undefined {
  const envFormat = process.env.S3DB_LOG_FORMAT?.toLowerCase();

  if (envFormat === 'json') {
    return undefined;
  }

  return createPrettyTransport();
}

export function createLogger(options: LoggerOptions = {}): S3DBLogger {
  const {
    level = 'info',
    name,
    format,
    transport,
    bindings = {},
    redactPatterns = [],
    maxPayloadBytes = 1_000_000
  } = options;

  const redactRules = createRedactRules(redactPatterns);

  let finalTransport: TransportSingleOptions | undefined;
  if (format === 'json') {
    finalTransport = undefined;
  } else if (format === 'pretty') {
    finalTransport = createPrettyTransport();
  } else if (transport !== undefined) {
    finalTransport = transport;
  } else {
    finalTransport = createDefaultTransport();
  }

  const normalizedBindings = bindings && typeof bindings === 'object' ? bindings : {};

  const config: PinoLoggerOptions = {
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
  }) as S3DBLogger;

  const baseBindings = name ? { ...normalizedBindings, name } : normalizedBindings;
  if (baseBindings && Object.keys(baseBindings).length > 0) {
    logger = logger.child(baseBindings) as S3DBLogger;
  }

  logger._maxPayloadBytes = maxPayloadBytes;

  return logger;
}

export function getGlobalLogger(options: LoggerOptions = {}): S3DBLogger {
  if (!globalLogger) {
    globalLogger = createLogger(options);
  }
  return globalLogger;
}

export function resetGlobalLogger(): void {
  globalLogger = null;
}

export function getLoggerOptionsFromEnv(configOptions: LoggerOptions = {}): LoggerOptions {
  const options: LoggerOptions = { ...configOptions };

  if (process.env.S3DB_LOG_LEVEL) {
    options.level = process.env.S3DB_LOG_LEVEL as LogLevel;
  }

  if (process.env.S3DB_LOG_FORMAT) {
    const format = process.env.S3DB_LOG_FORMAT.toLowerCase();
    if (format === 'json' || format === 'pretty') {
      options.format = format as LogFormat;
    }
  } else if (process.env.S3DB_LOG_PRETTY === 'false') {
    options.format = 'json';
  } else if (process.env.S3DB_LOG_PRETTY === 'true') {
    options.format = 'pretty';
  }

  return options;
}

export function exampleUsage(): void {
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

  const err = new Error('Something went wrong') as Error & { toJSON: () => Record<string, unknown> };
  err.toJSON = () => ({ message: err.message, custom: 'data' });
  logger.error({ err }, 'Error occurred');
}

export default createLogger;
