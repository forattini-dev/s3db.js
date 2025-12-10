import { error as formatError, ErrorResponse } from './response-formatter.js';
import type { Context } from 'hono';
import type { S3DBLogger } from '../../concerns/logger.js';

export interface S3DBError extends Error {
  resource?: string;
  bucket?: string;
  key?: string;
  operation?: string;
  suggestion?: string;
  availableResources?: string[];
}

export interface ErrorHandlerContext {
  logger: S3DBLogger;
}

const errorStatusMap: Record<string, number> = {
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

export function getStatusFromError(err: Error): number {
  if (err.name && errorStatusMap[err.name]) {
    return errorStatusMap[err.name]!;
  }

  if (err.constructor && err.constructor.name && errorStatusMap[err.constructor.name]) {
    return errorStatusMap[err.constructor.name]!;
  }

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

  return 500;
}

export function createErrorHandler(context: ErrorHandlerContext) {
  return function errorHandler(err: S3DBError, c: Context): Response {
    const status = getStatusFromError(err);
    const code = err.name || 'INTERNAL_ERROR';

    const details: Record<string, unknown> = {};

    if (err.resource) details.resource = err.resource;
    if (err.bucket) details.bucket = err.bucket;
    if (err.key) details.key = err.key;
    if (err.operation) details.operation = err.operation;
    if (err.suggestion) details.suggestion = err.suggestion;
    if (err.availableResources) details.availableResources = err.availableResources;

    const response = formatError(err, {
      status,
      code,
      details
    });

    if (status >= 500) {
      context.logger.error({
        message: err.message || err.toString(),
        code,
        status,
        stack: err.stack,
        details,
        originalError: err,
      }, '[API Plugin] Error');
    } else if (status >= 400 && status < 500) {
      const logLevel = c.get('logLevel') as string | undefined;
      if (logLevel === 'debug' || logLevel === 'trace') {
        const customReplacer = (_key: string, value: unknown): unknown => {
          if (value instanceof Error) {
            const errorObject: Record<string, unknown> = {};
            Object.getOwnPropertyNames(value).forEach(propName => {
              errorObject[propName] = (value as unknown as Record<string, unknown>)[propName];
            });
            return errorObject;
          }
          return value;
        };

        context.logger.warn({
          message: err.message || err.toString(),
          code,
          status,
          details,
          originalError: JSON.stringify(err, customReplacer),
        }, '[API Plugin] Client error');
      }
    }

    return c.json(response, response._status as Parameters<typeof c.json>[1]);
  };
}

export function errorHandler(this: ErrorHandlerContext, err: S3DBError, c: Context): Response {
  return createErrorHandler(this)(err, c);
}

export function asyncHandler(
  fn: (c: Context) => Promise<Response>,
  context?: ErrorHandlerContext
): (c: Context) => Promise<Response> {
  const handler = context ? createErrorHandler(context) : errorHandler;

  return async (c: Context): Promise<Response> => {
    try {
      return await fn(c);
    } catch (err) {
      return handler.call(context, err as S3DBError, c);
    }
  };
}

export type TryApiCallResult<T> = [true, null, T] | [false, Error, Response];

export async function tryApiCall<T>(
  fn: () => Promise<T>,
  c: Context,
  context?: ErrorHandlerContext
): Promise<TryApiCallResult<T>> {
  const handler = context ? createErrorHandler(context) : errorHandler;

  try {
    const result = await fn();
    return [true, null, result];
  } catch (err) {
    const response = handler.call(context, err as S3DBError, c);
    return [false, err as Error, response];
  }
}

export default {
  errorHandler,
  asyncHandler,
  tryApiCall,
  getStatusFromError,
  createErrorHandler
};
