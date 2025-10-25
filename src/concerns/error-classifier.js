/**
 * Error Classifier - Determines if errors should be retried
 *
 * Classifies errors into RETRIABLE or NON_RETRIABLE categories
 * based on error codes, HTTP status codes, and error properties.
 *
 * @example
 * const classification = ErrorClassifier.classify(error);
 * if (classification === 'RETRIABLE') {
 *   // Retry the operation
 * }
 */

const RETRIABLE = 'RETRIABLE';
const NON_RETRIABLE = 'NON_RETRIABLE';

/**
 * Network and timeout error codes (retriable)
 */
const RETRIABLE_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'NetworkError',
  'NETWORK_ERROR',
  'TimeoutError',
  'TIMEOUT'
]);

/**
 * AWS throttling and rate limit codes (retriable)
 */
const RETRIABLE_AWS_CODES = new Set([
  'ThrottlingException',
  'TooManyRequestsException',
  'RequestLimitExceeded',
  'ProvisionedThroughputExceededException',
  'RequestThrottledException',
  'SlowDown',
  'ServiceUnavailable'
]);

/**
 * AWS conflict and conditional check failures (retriable)
 */
const RETRIABLE_AWS_CONFLICTS = new Set([
  'ConditionalCheckFailedException',
  'TransactionConflictException'
]);

/**
 * Retriable HTTP status codes (5xx server errors, 429 rate limit)
 */
const RETRIABLE_STATUS_CODES = new Set([
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
  507, // Insufficient Storage
  509  // Bandwidth Limit Exceeded
]);

/**
 * Non-retriable error names (validation, business logic)
 */
const NON_RETRIABLE_ERROR_NAMES = new Set([
  'ValidationError',
  'StateMachineError',
  'SchemaError',
  'AuthenticationError',
  'PermissionError',
  'BusinessLogicError',
  'InvalidStateTransition'
]);

/**
 * Non-retriable HTTP status codes (client errors)
 */
const NON_RETRIABLE_STATUS_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  406, // Not Acceptable
  409, // Conflict
  410, // Gone
  422  // Unprocessable Entity
]);

export class ErrorClassifier {
  /**
   * Classify an error as RETRIABLE or NON_RETRIABLE
   *
   * @param {Error} error - The error to classify
   * @param {Object} options - Classification options
   * @param {Array<string>} options.retryableErrors - Custom retriable error names/codes
   * @param {Array<string>} options.nonRetriableErrors - Custom non-retriable error names/codes
   * @returns {string} 'RETRIABLE' or 'NON_RETRIABLE'
   */
  static classify(error, options = {}) {
    if (!error) return NON_RETRIABLE;

    const {
      retryableErrors = [],
      nonRetriableErrors = []
    } = options;

    // Check custom error lists first
    if (retryableErrors.length > 0) {
      const isCustomRetriable = retryableErrors.some(errType =>
        error.code === errType ||
        error.name === errType ||
        error.message?.includes(errType)
      );
      if (isCustomRetriable) return RETRIABLE;
    }

    if (nonRetriableErrors.length > 0) {
      const isCustomNonRetriable = nonRetriableErrors.some(errType =>
        error.code === errType ||
        error.name === errType ||
        error.message?.includes(errType)
      );
      if (isCustomNonRetriable) return NON_RETRIABLE;
    }

    // Check explicit retriable property on error
    if (error.retriable === false) return NON_RETRIABLE;
    if (error.retriable === true) return RETRIABLE;

    // Check for non-retriable error names
    if (NON_RETRIABLE_ERROR_NAMES.has(error.name)) {
      return NON_RETRIABLE;
    }

    // Check for non-retriable HTTP status codes
    if (error.statusCode && NON_RETRIABLE_STATUS_CODES.has(error.statusCode)) {
      return NON_RETRIABLE;
    }

    // Check for retriable network errors
    if (error.code && RETRIABLE_NETWORK_CODES.has(error.code)) {
      return RETRIABLE;
    }

    // Check for retriable AWS errors
    if (error.code && RETRIABLE_AWS_CODES.has(error.code)) {
      return RETRIABLE;
    }

    // Check for retriable AWS conflicts
    if (error.code && RETRIABLE_AWS_CONFLICTS.has(error.code)) {
      return RETRIABLE;
    }

    // Check for retriable HTTP status codes
    if (error.statusCode && RETRIABLE_STATUS_CODES.has(error.statusCode)) {
      return RETRIABLE;
    }

    // Check for timeout in error message
    if (error.message && typeof error.message === 'string') {
      const lowerMessage = error.message.toLowerCase();
      if (lowerMessage.includes('timeout') ||
          lowerMessage.includes('timed out') ||
          lowerMessage.includes('network') ||
          lowerMessage.includes('connection')) {
        return RETRIABLE;
      }
    }

    // Default: treat as retriable (conservative approach)
    // This ensures transient failures are retried by default
    return RETRIABLE;
  }

  /**
   * Check if an error is retriable
   *
   * @param {Error} error - The error to check
   * @param {Object} options - Classification options
   * @returns {boolean} true if retriable
   */
  static isRetriable(error, options = {}) {
    return this.classify(error, options) === RETRIABLE;
  }

  /**
   * Check if an error is non-retriable
   *
   * @param {Error} error - The error to check
   * @param {Object} options - Classification options
   * @returns {boolean} true if non-retriable
   */
  static isNonRetriable(error, options = {}) {
    return this.classify(error, options) === NON_RETRIABLE;
  }
}

export { RETRIABLE, NON_RETRIABLE };
