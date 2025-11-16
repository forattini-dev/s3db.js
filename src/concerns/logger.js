/**
 * Logger Factory for s3db.js
 *
 * Provides a centralized Pino-based logging solution with:
 * - Format presets: 'json' (structured) and 'pretty' (human-readable)
 * - Automatic TTY detection (pretty-printing in dev, JSON in prod)
 * - Secret redaction for sensitive fields
 * - Configurable log levels
 * - Child logger support with context binding
 * - Custom error serialization (uses toJson() if available)
 *
 * Usage:
 *   import { createLogger, getGlobalLogger } from './logger.js';
 *
 *   // Default logger (auto-detects environment)
 *   const logger = createLogger({ level: 'debug' });
 *
 *   // JSON format (production)
 *   const jsonLogger = createLogger({ level: 'info', format: 'json' });
 *
 *   // Pretty format (development)
 *   const prettyLogger = createLogger({ level: 'debug', format: 'pretty' });
 *
 *   // Environment variables
 *   // S3DB_LOG_FORMAT=json node app.js
 *   // S3DB_LOG_FORMAT=pretty node app.js
 */

import pino from 'pino';
import { createRedactRules } from './logger-redact.js';

let globalLogger = null;

/**
 * Create a new Pino logger instance
 *
 * @param {Object} options - Logger configuration
 * @param {string} [options.level='info'] - Log level (trace, debug, info, warn, error, fatal)
 * @param {string} [options.name] - Logger name (included in logs)
 * @param {string} [options.format] - Output format preset: 'json' or 'pretty' (overrides transport)
 * @param {Object} [options.transport] - Pino transport config (e.g., { target: 'pino-pretty' })
 * @param {Object} [options.bindings] - Default bindings for all logs
 * @param {Array<RegExp>} [options.redactPatterns] - Custom patterns to redact
 * @param {number} [options.maxPayloadBytes=1000000] - Max bytes before truncation
 * @returns {Object} Pino logger instance
 */
export function createLogger(options = {}) {
  const {
    level = 'info',
    name,
    format, // 'json' or 'pretty'
    transport,
    bindings = {},
    redactPatterns = [],
    maxPayloadBytes = 1_000_000
  } = options;

  // Create redaction rules (merge built-in + custom patterns)
  const redactRules = createRedactRules(redactPatterns);

  // Determine transport based on format preset or explicit transport
  let finalTransport;
  if (format === 'json') {
    finalTransport = undefined; // Use Pino's default JSON output
  } else if (format === 'pretty') {
    finalTransport = createPrettyTransport();
  } else if (transport !== undefined) {
    finalTransport = transport;
  } else {
    finalTransport = createDefaultTransport();
  }

  // Build Pino config
  const config = {
    level,
    redact: redactRules,
    transport: finalTransport || undefined, // Only include if provided
    bindings: name ? { ...bindings, name } : bindings,
    // Custom error serializer - uses toJson() if available
    serializers: {
      err: serializeError,
      error: serializeError
    }
  };

  // Create logger with custom error serialization
  const logger = pino(config);

  // Store max payload bytes for later reference (if needed by serializers)
  logger._maxPayloadBytes = maxPayloadBytes;

  return logger;
}

/**
 * Get or create the global logger instance
 * Useful for singleton pattern where one logger is shared across the app
 *
 * @param {Object} [options] - Logger options (only used on first call)
 * @returns {Object} Global Pino logger instance
 */
export function getGlobalLogger(options = {}) {
  if (!globalLogger) {
    globalLogger = createLogger(options);
  }
  return globalLogger;
}

/**
 * Reset the global logger (useful for testing)
 *
 * @returns {void}
 */
export function resetGlobalLogger() {
  globalLogger = null;
}

/**
 * Serialize error objects using toJSON() if available
 * Falls back to standard Pino error serialization
 *
 * @param {Error} err - Error object to serialize
 * @returns {Object} Serialized error
 */
function serializeError(err) {
  if (!err || typeof err !== 'object') {
    return err;
  }

  // Use toJSON() if available (custom s3db.js errors + standard JavaScript)
  if (typeof err.toJSON === 'function') {
    return err.toJSON();
  }

  // Fallback to standard error properties
  return {
    type: err.constructor.name,
    message: err.message,
    stack: err.stack,
    code: err.code,
    ...err // Include any additional properties
  };
}

/**
 * Create pino-pretty transport configuration
 *
 * @returns {Object} Pino-pretty transport config
 */
function createPrettyTransport() {
  return {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false // Multi-line for readability
    }
  };
}

/**
 * Create default transport based on environment
 * - TTY (terminal): Use pino-pretty for human-readable output
 * - Piped/Production: Use compact JSON
 *
 * @returns {Object|undefined} Transport config or undefined for default
 */
function createDefaultTransport() {
  // Check if output is to terminal (TTY)
  const isTTY = process.stdout.isTTY === true;
  const isDev = process.env.NODE_ENV !== 'production';
  const prettyEnabled = process.env.S3DB_LOG_PRETTY !== 'false';

  // Enable pretty-printing in development when output is TTY
  if (isTTY && isDev && prettyEnabled) {
    return createPrettyTransport();
  }

  // Return undefined for default Pino behavior (compact JSON)
  return undefined;
}

/**
 * Serialize logger options from environment variables
 * Precedence: CLI args > env vars > config > defaults
 *
 * @param {Object} [configOptions] - Base configuration options
 * @returns {Object} Merged options with env var overrides
 */
export function getLoggerOptionsFromEnv(configOptions = {}) {
  const options = { ...configOptions };

  // Override log level from environment
  if (process.env.S3DB_LOG_LEVEL) {
    options.level = process.env.S3DB_LOG_LEVEL;
  }

  // Override format from environment (preferred method)
  if (process.env.S3DB_LOG_FORMAT) {
    const format = process.env.S3DB_LOG_FORMAT.toLowerCase();
    if (format === 'json' || format === 'pretty') {
      options.format = format;
    }
  }
  // Legacy support for S3DB_LOG_PRETTY
  else if (process.env.S3DB_LOG_PRETTY === 'false') {
    options.format = 'json';
  } else if (process.env.S3DB_LOG_PRETTY === 'true') {
    options.format = 'pretty';
  }

  return options;
}

/**
 * Example usage function (for documentation)
 *
 * @returns {void}
 */
export function exampleUsage() {
  // Basic logger (auto-detects environment)
  const logger = createLogger({ level: 'debug' });
  logger.info('Application started');

  // JSON format (structured logs for production)
  const jsonLogger = createLogger({ level: 'info', format: 'json' });
  jsonLogger.info({ user: 'john' }, 'User logged in');

  // Pretty format (human-readable for development)
  const prettyLogger = createLogger({ level: 'debug', format: 'pretty' });
  prettyLogger.debug({ query: 'SELECT *' }, 'Database query');

  // Child logger with context
  const resourceLogger = logger.child({ resource: 'users' });
  resourceLogger.debug({ userId: 123 }, 'user fetched');

  // Global logger
  const globalLog = getGlobalLogger({ level: 'info' });
  globalLog.warn('Warning message');

  // Custom error logging (uses toJSON() automatically)
  const err = new Error('Something went wrong');
  err.toJSON = () => ({ message: err.message, custom: 'data' });
  logger.error({ err }, 'Error occurred');
}

export default createLogger;
