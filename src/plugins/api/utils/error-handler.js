/**
 * Error Handler - Global error handling middleware
 *
 * Catches and formats errors from routes and middlewares
 */

import { error as formatError } from './response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';


// Module-level logger
const logger = createLogger({ name: 'ErrorHandler', level: 'info' });
/**
 * Map s3db.js errors to HTTP status codes
 */
const errorStatusMap = {
  'ValidationError': 400,
  'InvalidResourceItem': 400,
  'ResourceNotFound': 404,
  'NoSuchKey': 404,
  'NoSuchBucket': 404,
  'PartitionError': 400,
  'CryptoError': 500,
  'SchemaError': 400,
  'QueueError': 500,
  'ResourceError': 500
};

/**
 * Get HTTP status code from error
 * @param {Error} err - Error object
 * @returns {number} HTTP status code
 */
function getStatusFromError(err) {
  // Check error name
  if (err.name && errorStatusMap[err.name]) {
    return errorStatusMap[err.name];
  }

  // Check error constructor name
  if (err.constructor && err.constructor.name && errorStatusMap[err.constructor.name]) {
    return errorStatusMap[err.constructor.name];
  }

  // Check for specific error patterns
  if (err.message) {
    if (err.message.includes('not found') || err.message.includes('does not exist')) {
      return 404;
    }
    if (err.message.includes('validation') || err.message.includes('invalid')) {
      return 400;
    }
    if (err.message.includes('unauthorized') || err.message.includes('authentication')) {
      return 401;
    }
    if (err.message.includes('forbidden') || err.message.includes('permission')) {
      return 403;
    }
  }

  // Default to 500
  return 500;
}

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} c - Hono context
 * @returns {Response} Error response
 */
export function errorHandler(err, c) {
  const status = getStatusFromError(err);

  // Get error code from error name or default
  const code = err.name || 'INTERNAL_ERROR';

  // Extract error details
  const details = {};

  if (err.resource) details.resource = err.resource;
  if (err.bucket) details.bucket = err.bucket;
  if (err.key) details.key = err.key;
  if (err.operation) details.operation = err.operation;
  if (err.suggestion) details.suggestion = err.suggestion;
  if (err.availableResources) details.availableResources = err.availableResources;

  // Format error response
  const response = formatError(err, {
    status,
    code,
    details
  });

  // Log only when verbose is enabled in context
  if (c && c.get && c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
    if (status >= 500) {
      logger.error('[API Plugin] Error:', {
        message: err.message,
        code,
        status,
        stack: err.stack,
        details
      });
    } else if (status >= 400 && status < 500) {
      logger.warn('[API Plugin] Client error:', {
        message: err.message,
        code,
        status,
        details
      });
    }
  }

  return c.json(response, response._status);
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler with error catching
 */
export function asyncHandler(fn) {
  return async (c) => {
    try {
      return await fn(c);
    } catch (err) {
      return errorHandler(err, c);
    }
  };
}

/**
 * Try-catch wrapper with formatted error response
 * @param {Function} fn - Function to execute
 * @param {Object} c - Hono context
 * @returns {Promise<[boolean, Error|null, any]>} [ok, error, result] tuple
 */
export async function tryApiCall(fn, c) {
  try {
    const result = await fn();
    return [true, null, result];
  } catch (err) {
    const response = errorHandler(err, c);
    return [false, err, response];
  }
}

export default {
  errorHandler,
  asyncHandler,
  tryApiCall,
  getStatusFromError
};
