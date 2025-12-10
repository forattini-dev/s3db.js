export const RETRIABLE = 'RETRIABLE' as const;
export const NON_RETRIABLE = 'NON_RETRIABLE' as const;

export type ErrorClassification = typeof RETRIABLE | typeof NON_RETRIABLE;

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

const RETRIABLE_AWS_CODES = new Set([
  'ThrottlingException',
  'TooManyRequestsException',
  'RequestLimitExceeded',
  'ProvisionedThroughputExceededException',
  'RequestThrottledException',
  'SlowDown',
  'ServiceUnavailable'
]);

const RETRIABLE_AWS_CONFLICTS = new Set([
  'ConditionalCheckFailedException',
  'TransactionConflictException'
]);

const RETRIABLE_STATUS_CODES = new Set([
  429,
  500,
  502,
  503,
  504,
  507,
  509
]);

const NON_RETRIABLE_ERROR_NAMES = new Set([
  'ValidationError',
  'StateMachineError',
  'SchemaError',
  'AuthenticationError',
  'PermissionError',
  'BusinessLogicError',
  'InvalidStateTransition'
]);

const NON_RETRIABLE_STATUS_CODES = new Set([
  400,
  401,
  403,
  404,
  405,
  406,
  409,
  410,
  422
]);

export interface ClassifyOptions {
  retryableErrors?: string[];
  nonRetriableErrors?: string[];
}

export interface ClassifiableError extends Error {
  code?: string;
  statusCode?: number;
  retriable?: boolean;
}

export class ErrorClassifier {
  static classify(error: ClassifiableError | null | undefined, options: ClassifyOptions = {}): ErrorClassification {
    if (!error) return NON_RETRIABLE;

    const {
      retryableErrors = [],
      nonRetriableErrors = []
    } = options;

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

    if (error.retriable === false) return NON_RETRIABLE;
    if (error.retriable === true) return RETRIABLE;

    if (NON_RETRIABLE_ERROR_NAMES.has(error.name)) {
      return NON_RETRIABLE;
    }

    if (error.statusCode && NON_RETRIABLE_STATUS_CODES.has(error.statusCode)) {
      return NON_RETRIABLE;
    }

    if (error.code && RETRIABLE_NETWORK_CODES.has(error.code)) {
      return RETRIABLE;
    }

    if (error.code && RETRIABLE_AWS_CODES.has(error.code)) {
      return RETRIABLE;
    }

    if (error.code && RETRIABLE_AWS_CONFLICTS.has(error.code)) {
      return RETRIABLE;
    }

    if (error.statusCode && RETRIABLE_STATUS_CODES.has(error.statusCode)) {
      return RETRIABLE;
    }

    if (error.message && typeof error.message === 'string') {
      const lowerMessage = error.message.toLowerCase();
      if (lowerMessage.includes('timeout') ||
          lowerMessage.includes('timed out') ||
          lowerMessage.includes('network') ||
          lowerMessage.includes('connection')) {
        return RETRIABLE;
      }
    }

    return RETRIABLE;
  }

  static isRetriable(error: ClassifiableError | null | undefined, options: ClassifyOptions = {}): boolean {
    return this.classify(error, options) === RETRIABLE;
  }

  static isNonRetriable(error: ClassifiableError | null | undefined, options: ClassifyOptions = {}): boolean {
    return this.classify(error, options) === NON_RETRIABLE;
  }
}
