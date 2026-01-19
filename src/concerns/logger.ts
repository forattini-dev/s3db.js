import pino, { Logger as PinoLogger, LoggerOptions as PinoLoggerOptions, TransportSingleOptions, DestinationStream } from 'pino';
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
}

export interface S3DBLogger extends PinoLogger {}

export type Logger = S3DBLogger;

let globalLogger: S3DBLogger | null = null;
let sharedPrettyTransport: ReturnType<typeof pino.transport> | null = null;
let sharedDestination: DestinationStream | null = null;
const namedLoggers: Map<string, S3DBLogger> = new Map();

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

function getSharedPrettyTransport(): ReturnType<typeof pino.transport> {
  if (!sharedPrettyTransport) {
    sharedPrettyTransport = pino.transport(createPrettyTransport());
  }
  return sharedPrettyTransport;
}

function getSharedDestination(format?: LogFormat): DestinationStream | undefined {
  const envFormat = process.env.S3DB_LOG_FORMAT?.toLowerCase();
  const effectiveFormat = format ?? (envFormat === 'json' ? 'json' : 'pretty');

  if (effectiveFormat === 'json') {
    return undefined;
  }

  if (!sharedDestination) {
    sharedDestination = getSharedPrettyTransport();
  }
  return sharedDestination;
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
    redactPatterns = []
  } = options;

  const redactRules = createRedactRules(redactPatterns);
  const normalizedBindings = bindings && typeof bindings === 'object' ? bindings : {};

  const useSharedDestination = !transport && format !== 'json';
  const destination = useSharedDestination ? getSharedDestination(format) : undefined;

  const config: PinoLoggerOptions = {
    level,
    redact: redactRules,
    serializers: {
      err: serializeError,
      error: serializeError
    }
  };

  if (transport) {
    config.transport = transport;
  } else if (format === 'json') {
    // no transport, write plain JSON to stdout
  } else if (!destination) {
    config.transport = createDefaultTransport();
  }

  let logger: S3DBLogger;
  if (destination) {
    logger = pino({ ...config, name }, destination) as S3DBLogger;
  } else {
    logger = pino({ ...config, name }) as S3DBLogger;
  }

  const baseBindings = name ? { ...normalizedBindings, name } : normalizedBindings;
  if (baseBindings && Object.keys(baseBindings).length > 0) {
    logger = logger.child(baseBindings) as S3DBLogger;
  }

  return logger;
}

export function getLogger(name: string, options: Omit<LoggerOptions, 'name'> = {}): S3DBLogger {
  const cached = namedLoggers.get(name);
  if (cached) {
    return cached;
  }

  const logger = createLogger({ ...options, name });
  namedLoggers.set(name, logger);
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
  namedLoggers.clear();
  sharedPrettyTransport = null;
  sharedDestination = null;
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
