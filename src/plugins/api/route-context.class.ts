/**
 * RouteContext - Single, clean context for route handlers
 *
 * Wraps Hono context (c) and injects db/resources plus helper methods
 * Keeps Hono context "clean" while providing rich functionality
 */

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface RouteContextOptions {
  db?: unknown | null;
  resources?: Record<string, unknown> | null;
}

export interface ErrorResponseOptions {
  status?: number;
  code?: string;
  details?: unknown | null;
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    status: number;
    details?: unknown;
    stack?: string[];
  };
}

export interface SuccessResponse {
  success: true;
  [key: string]: unknown;
}

export class RouteContext {
  readonly c: Context;
  readonly db: unknown | null;
  readonly resources: Record<string, unknown> | null;

  constructor(c: Context, { db = null, resources = null }: RouteContextOptions = {}) {
    this.c = c;
    this.db = db;
    this.resources = resources;
  }

  get req() {
    return this.c.req;
  }

  get res() {
    return this.c.res;
  }

  get var() {
    return this.c.var;
  }

  set(key: string, value: unknown) {
    return this.c.set(key as never, value as never);
  }

  get(key: string) {
    return this.c.get(key as never);
  }

  async body<T = unknown>(): Promise<T> {
    return await this.c.req.json();
  }

  query(): Record<string, string>;
  query(key: string): string | undefined;
  query(key?: string): Record<string, string> | string | undefined {
    if (key) {
      return this.c.req.query(key);
    }
    return this.c.req.query();
  }

  param(key: string): string | undefined {
    return this.c.req.param(key);
  }

  header(name: string): string | undefined {
    return this.c.req.header(name);
  }

  success(data: Record<string, unknown> | unknown = {}, status: number = 200): Response {
    const response: SuccessResponse = {
      success: true,
      ...(typeof data === 'object' && data !== null ? data as Record<string, unknown> : { data })
    };
    return this.c.json(response, status as ContentfulStatusCode);
  }

  error(
    message: string | Error,
    statusOrOptions: number | ErrorResponseOptions = {},
    detailsOverride: unknown | null = null
  ): Response {
    const isNumber = typeof statusOrOptions === 'number';
    const providedStatus = isNumber ? statusOrOptions : statusOrOptions?.status;
    const providedCode = isNumber ? null : statusOrOptions?.code;
    const providedDetails = isNumber ? detailsOverride : (statusOrOptions?.details ?? detailsOverride ?? null);

    const errorObj = typeof message === 'string'
      ? new Error(message)
      : (message || new Error('Unknown error'));

    const resolvedStatus = providedStatus ?? this._getErrorStatus(errorObj);
    const resolvedCode = providedCode ?? this._getErrorCode(errorObj);

    const stack = process.env.NODE_ENV !== 'production' && errorObj.stack
      ? errorObj.stack.split('\n').map(line => line.trim())
      : undefined;

    const response: ErrorResponse = {
      success: false,
      error: {
        message: errorObj.message || (typeof message === 'string' ? message : 'Unknown error'),
        code: resolvedCode,
        status: resolvedStatus,
        ...(providedDetails ? { details: providedDetails } : {}),
        ...(stack ? { stack } : {})
      }
    };

    return this.c.json(response, resolvedStatus as ContentfulStatusCode);
  }

  badRequest(message: string = 'Bad request', details: unknown | null = null): Response {
    return this.error(message, { status: 400, code: 'BAD_REQUEST', details });
  }

  unauthorized(message: string = 'Unauthorized', details: unknown | null = null): Response {
    return this.error(message, { status: 401, code: 'UNAUTHORIZED', details });
  }

  forbidden(message: string = 'Forbidden', details: unknown | null = null): Response {
    return this.error(message, { status: 403, code: 'FORBIDDEN', details });
  }

  notFound(message: string = 'Not found', details: unknown | null = null): Response {
    return this.error(message, { status: 404, code: 'NOT_FOUND', details });
  }

  validationError(message: string = 'Validation failed', details: unknown | null = null): Response {
    return this.error(message, { status: 422, code: 'VALIDATION_ERROR', details });
  }

  serverError(message: string = 'Internal server error', details: unknown | null = null): Response {
    return this.error(message, { status: 500, code: 'INTERNAL_ERROR', details });
  }

  private _getErrorCode(error: Error & { code?: string }): string {
    if (error.code) return error.code;
    if (error.name && error.name !== 'Error') return error.name;
    return 'INTERNAL_ERROR';
  }

  private _getErrorStatus(error: Error & { status?: number; statusCode?: number; httpStatus?: number }): number {
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

  json(data: unknown, status: number = 200): Response {
    return this.c.json(data, status as ContentfulStatusCode);
  }

  text(text: string, status: number = 200): Response {
    return this.c.text(text, status as ContentfulStatusCode);
  }

  html(html: string, status: number = 200): Response {
    return this.c.html(html, status as ContentfulStatusCode);
  }

  redirect(location: string, status: number = 302): Response {
    return this.c.redirect(location, status as 301 | 302 | 303 | 307 | 308);
  }

  get raw(): Context {
    return this.c;
  }
}
