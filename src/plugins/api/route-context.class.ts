/**
 * RouteContext - Single, clean context for route handlers
 *
 * Wraps HTTP context (c) and injects db/resources plus helper methods
 * Keeps HTTP context "clean" while providing rich functionality
 */

import type { Context } from '#src/plugins/shared/http-runtime.js';
import type { ContentfulStatusCode } from '#src/plugins/shared/http-runtime.js';

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

export interface RouteRequestApi {
  readonly method: string;
  readonly path: string;
  readonly url: string | undefined;
  readonly id: string | null;
  raw: Context['req'];
  param(key: string): string | undefined;
  query(key?: string): Record<string, string> | string | undefined;
  header(name: string): string | undefined;
  headers(): Record<string, string>;
  body<T = unknown>(): Promise<T>;
}

export interface RouteResponseApi {
  raw: Context['res'];
  json(data: unknown, status?: number): Response;
  success(data?: Record<string, unknown> | unknown, status?: number): Response;
  error(message: string | Error, statusOrOptions?: number | ErrorResponseOptions, detailsOverride?: unknown | null): Response;
  badRequest(message?: string, details?: unknown | null): Response;
  unauthorized(message?: string, details?: unknown | null): Response;
  forbidden(message?: string, details?: unknown | null): Response;
  notFound(message?: string, details?: unknown | null): Response;
  validationError(message?: string, details?: unknown | null): Response;
  serverError(message?: string, details?: unknown | null): Response;
  text(text: string, status?: number): Response;
  html(html: string, status?: number): Response;
  redirect(location: string, status?: number): Response;
}

export interface RouteAuthApi {
  readonly user: Record<string, unknown> | null;
  readonly method: string | null;
  readonly requestId: string | null;
  readonly isAuthenticated: boolean;
  readonly isServiceAccount: boolean;
  hasRole(role: string): boolean;
  hasScope(scope: string): boolean;
  requireAuth(): void;
  requireRole(role: string): void;
  requireScope(scope: string): void;
}

function normalizeStringList(input: unknown): string[] {
  if (!input) {
    return [];
  }

  const values = Array.isArray(input) ? input : [input];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

export class RouteContext {
  readonly c: Context;
  readonly db: unknown | null;
  readonly resources: Record<string, unknown> | null;
  readonly request: RouteRequestApi;
  readonly response: RouteResponseApi;
  readonly auth: RouteAuthApi;
  private _bodyPromise: Promise<unknown> | null;

  constructor(c: Context, { db = null, resources = null }: RouteContextOptions = {}) {
    this.c = c;
    this.db = db;
    this.resources = resources;
    this._bodyPromise = null;
    this.request = this._createRequestApi();
    this.response = this._createResponseApi();
    this.auth = this._createAuthApi();
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
    if (!this._bodyPromise) {
      this._bodyPromise = this.c.req.json();
    }

    return await this._bodyPromise as T;
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

  get user(): Record<string, unknown> | null {
    return (this.c.get('user' as never) as Record<string, unknown> | null) || null;
  }

  get requestId(): string | null {
    return (this.c.get('requestId' as never) as string | null) || null;
  }

  get authMethod(): string | null {
    return (this.c.get('authMethod' as never) as string | null) || null;
  }

  get isAuthenticated(): boolean {
    return !!this.user;
  }

  get isServiceAccount(): boolean {
    const serviceAccount = this.c.get('serviceAccount' as never) as Record<string, unknown> | null;
    if (serviceAccount) {
      return true;
    }

    const user = this.user;
    if (!user) {
      return false;
    }

    return user.token_use === 'service'
      || user.token_type === 'service'
      || !!user.service_account
      || (typeof user.sub === 'string' && user.sub.startsWith('sa:'));
  }

  hasRole(role: string): boolean {
    const user = this.user;
    if (!user || !role) {
      return false;
    }

    const roles = [
      ...normalizeStringList(user.role),
      ...normalizeStringList(user.roles)
    ];
    return roles.includes(role);
  }

  hasScope(scope: string): boolean {
    const user = this.user;
    if (!user) {
      return false;
    }

    const scopes = normalizeStringList(user.scopes);
    if (scopes.includes(scope) || scopes.includes('*')) {
      return true;
    }

    const wildcards = scopes.filter((value) => value.endsWith(':*'));
    return wildcards.some((value) => scope.startsWith(`${value.slice(0, -2)}:`));
  }

  requireAuth(): void {
    if (!this.isAuthenticated) {
      throw Object.assign(new Error('Authentication required'), { status: 401, code: 'UNAUTHORIZED' });
    }
  }

  requireRole(role: string): void {
    this.requireAuth();
    if (!this.hasRole(role)) {
      throw Object.assign(new Error(`Role required: ${role}`), { status: 403, code: 'FORBIDDEN' });
    }
  }

  requireScope(scope: string): void {
    this.requireAuth();
    if (!this.hasScope(scope)) {
      throw Object.assign(new Error(`Scope required: ${scope}`), { status: 403, code: 'FORBIDDEN' });
    }
  }

  private _createRequestApi(): RouteRequestApi {
    const self = this;
    return {
      get method() {
        return self.c.req.method;
      },
      get path() {
        return self.c.req.path;
      },
      get url() {
        return self.c.req.url;
      },
      get id() {
        return self.requestId;
      },
      raw: this.c.req,
      param: (key: string): string | undefined => this.param(key),
      query: (key?: string): Record<string, string> | string | undefined => key ? this.query(key) : this.query(),
      header: (name: string): string | undefined => this.header(name),
      headers: (): Record<string, string> => {
        const rawHeaders = this.c.req.raw?.headers;
        return rawHeaders ? Object.fromEntries(rawHeaders.entries()) : {};
      },
      body: async <T = unknown>(): Promise<T> => await this.body<T>()
    };
  }

  private _createResponseApi(): RouteResponseApi {
    return {
      raw: this.c.res,
      json: (data: unknown, status: number = 200): Response => this.json(data, status),
      success: (data: Record<string, unknown> | unknown = {}, status: number = 200): Response => this.success(data, status),
      error: (message: string | Error, statusOrOptions: number | ErrorResponseOptions = {}, detailsOverride: unknown | null = null): Response => this.error(message, statusOrOptions, detailsOverride),
      badRequest: (message: string = 'Bad request', details: unknown | null = null): Response => this.badRequest(message, details),
      unauthorized: (message: string = 'Unauthorized', details: unknown | null = null): Response => this.unauthorized(message, details),
      forbidden: (message: string = 'Forbidden', details: unknown | null = null): Response => this.forbidden(message, details),
      notFound: (message: string = 'Not found', details: unknown | null = null): Response => this.notFound(message, details),
      validationError: (message: string = 'Validation failed', details: unknown | null = null): Response => this.validationError(message, details),
      serverError: (message: string = 'Internal server error', details: unknown | null = null): Response => this.serverError(message, details),
      text: (text: string, status: number = 200): Response => this.text(text, status),
      html: (html: string, status: number = 200): Response => this.html(html, status),
      redirect: (location: string, status: number = 302): Response => this.redirect(location, status)
    };
  }

  private _createAuthApi(): RouteAuthApi {
    const self = this;
    return {
      get user() {
        return self.user;
      },
      get method() {
        return self.authMethod;
      },
      get requestId() {
        return self.requestId;
      },
      get isAuthenticated() {
        return self.isAuthenticated;
      },
      get isServiceAccount() {
        return self.isServiceAccount;
      },
      hasRole: (role: string): boolean => this.hasRole(role),
      hasScope: (scope: string): boolean => this.hasScope(scope),
      requireAuth: (): void => this.requireAuth(),
      requireRole: (role: string): void => this.requireRole(role),
      requireScope: (scope: string): void => this.requireScope(scope)
    };
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
