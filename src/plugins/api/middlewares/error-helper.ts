import type { Context, MiddlewareHandler, Next } from 'hono';
import { createLogger } from '../../../concerns/logger.js';
import type { Logger } from '../../../concerns/logger.js';

const logger: Logger = createLogger({ name: 'ErrorHelper', level: 'info' });

export interface ErrorLike {
  message?: string;
  name?: string;
  code?: string;
  status?: number;
  statusCode?: number;
  httpStatus?: number;
  stack?: string;
  [key: string]: unknown;
}

export interface ErrorResponseDetails {
  [key: string]: unknown;
}

export interface ErrorResponseError {
  message: string;
  code: string;
  status: number;
  details?: ErrorResponseDetails;
  stack?: string[];
}

export interface ErrorResponse {
  success: false;
  error: ErrorResponseError;
}

export interface ErrorHelperOptions {
  includeStack?: boolean;
  logLevel?: string;
}

export type ContextWithError = Context & {
  error: (error: Error | string | ErrorLike, statusCode?: number | null, details?: ErrorResponseDetails | null) => Response;
};

function getErrorCode(error: ErrorLike): string {
  if (error.code) return error.code;
  if (error.name && error.name !== 'Error') return error.name;
  return 'INTERNAL_ERROR';
}

function getErrorStatus(error: ErrorLike): number {
  if (error.status) return error.status;
  if (error.statusCode) return error.statusCode;
  if (error.httpStatus) return error.httpStatus;

  const errorName = error.name || '';
  const errorMsg = error.message || '';

  if (errorName === 'ValidationError') return 400;
  if (errorName === 'UnauthorizedError') return 401;
  if (errorName === 'ForbiddenError') return 403;
  if (errorName === 'NotFoundError') return 404;
  if (errorName === 'ConflictError') return 409;
  if (errorName === 'TooManyRequestsError') return 429;

  if (/not found/i.test(errorMsg)) return 404;
  if (/unauthorized|unauthenticated/i.test(errorMsg)) return 401;
  if (/forbidden|access denied/i.test(errorMsg)) return 403;
  if (/invalid|validation|bad request/i.test(errorMsg)) return 400;
  if (/conflict|already exists/i.test(errorMsg)) return 409;
  if (/rate limit|too many/i.test(errorMsg)) return 429;

  return 500;
}

export function errorHelper(options: ErrorHelperOptions = {}): MiddlewareHandler {
  const {
    includeStack = process.env.NODE_ENV !== 'production',
    logLevel = 'info'
  } = options;

  return async (c: Context, next: Next): Promise<void | Response> => {
    const contextWithError = c as unknown as ContextWithError;

    (contextWithError as unknown as { error: unknown }).error = function (
      errorInput: Error | string | ErrorLike,
      statusCode: number | null = null,
      details: ErrorResponseDetails | null = null
    ): Response {
      let error: ErrorLike;

      if (typeof errorInput === 'string') {
        error = new Error(errorInput) as ErrorLike;
      } else if (!errorInput || typeof errorInput !== 'object') {
        error = new Error('Unknown error') as ErrorLike;
      } else {
        error = errorInput as ErrorLike;
      }

      const status = statusCode || getErrorStatus(error);

      const errorResponse: ErrorResponse = {
        success: false,
        error: {
          message: error.message || 'An error occurred',
          code: getErrorCode(error),
          status
        }
      };

      if (details) {
        errorResponse.error.details = details;
      }

      if (includeStack && error.stack) {
        errorResponse.error.stack = error.stack.split('\n').map(line => line.trim());
      }

      if (logLevel === 'debug' || logLevel === 'trace') {
        logger.error({
          status,
          code: errorResponse.error.code,
          message: error.message,
          path: c.req.path,
          method: c.req.method,
          details
        }, '[API Error]');
      }

      return c.json(errorResponse, status as Parameters<typeof c.json>[1]);
    };

    await next();
  };
}

export default errorHelper;
