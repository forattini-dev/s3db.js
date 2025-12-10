import type { Context } from 'hono';
import type { Database } from '../../../database.class.js';

export interface UserInfo {
  scopes?: string[];
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors?: unknown[];
}

export interface ValidateBodyResult extends ValidationResult {
  data?: Record<string, unknown>;
}

export interface SchemaLike {
  validate(data: Record<string, unknown>): true | unknown[];
}

export interface ResourceLike {
  schema?: SchemaLike;
  [key: string]: unknown;
}

export interface PluginRegistry {
  [key: string]: unknown;
}

export interface PartitionFilter {
  partitionName: string;
  partitionFields: Record<string, unknown>;
}

export interface ValidatorHelper {
  validate(resourceOrData: string | Record<string, unknown>, data?: Record<string, unknown> | null): ValidationResult;
  validateOrThrow(resourceOrData: string | Record<string, unknown>, data?: Record<string, unknown> | null): void;
  validateBody(resourceName?: string | null): Promise<ValidateBodyResult>;
}

export interface LegacyContext {
  database?: Database;
  resource?: ResourceLike;
  plugins?: PluginRegistry;
}

export interface WithContextOptions {
  resource?: ResourceLike | null;
}

export interface ErrorLike extends Error {
  code?: string;
  status?: number;
  statusCode?: number;
  httpStatus?: number;
  errors?: unknown[];
}

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

export class RouteContext {
  c: Context;
  db: Database;
  database: Database;
  private _currentResource: ResourceLike | null;
  pluginRegistry: PluginRegistry;
  resources: Record<string, ResourceLike>;
  validator: ValidatorHelper;
  resource: ResourceLike | null;
  private _partitionFilters: PartitionFilter[];

  constructor(
    honoContext: Context,
    database: Database,
    resource: ResourceLike | null = null,
    plugins: PluginRegistry = {}
  ) {
    this.c = honoContext;
    this.db = database;
    this.database = database;
    this._currentResource = resource;
    this.pluginRegistry = plugins;
    this._partitionFilters = [];

    this.resources = this._createResourcesProxy();
    this.validator = this._createValidator();
    this.resource = resource;
  }

  private _createResourcesProxy(): Record<string, ResourceLike> {
    const self = this;
    return new Proxy({} as Record<string, ResourceLike>, {
      get(_target, prop: string): ResourceLike {
        const resources = self.database.resources as unknown as Record<string, ResourceLike>;
        if (resources[prop]) {
          return resources[prop]!;
        }

        const available = Object.keys(resources);
        throw new Error(
          `Resource "${prop}" not found. Available resources: ${available.join(', ')}`
        );
      },

      ownKeys(): string[] {
        return Object.keys(self.database.resources);
      },

      getOwnPropertyDescriptor(_target, prop: string): PropertyDescriptor | undefined {
        const resources = self.database.resources as unknown as Record<string, ResourceLike>;
        if (resources[prop]) {
          return {
            enumerable: true,
            configurable: true
          };
        }
        return undefined;
      }
    });
  }

  private _createValidator(): ValidatorHelper {
    const ctx = this;

    return {
      validate(resourceOrData: string | Record<string, unknown>, data: Record<string, unknown> | null = null): ValidationResult {
        let resource: ResourceLike;
        let dataToValidate: Record<string, unknown>;

        if (typeof resourceOrData === 'object' && data === null) {
          if (!ctx._currentResource) {
            throw new Error('validator.validate(data) requires a current resource. Use validator.validate("resourceName", data) instead.');
          }
          resource = ctx._currentResource;
          dataToValidate = resourceOrData;
        } else if (typeof resourceOrData === 'string' && data !== null) {
          resource = ctx.resources[resourceOrData]!;
          dataToValidate = data;
        } else {
          throw new Error('Invalid arguments. Use validator.validate(data) or validator.validate("resourceName", data)');
        }

        const validation = resource.schema?.validate(dataToValidate);

        if (validation === true) {
          return { valid: true };
        } else {
          return {
            valid: false,
            errors: Array.isArray(validation) ? validation : [validation]
          };
        }
      },

      validateOrThrow(resourceOrData: string | Record<string, unknown>, data: Record<string, unknown> | null = null): void {
        const result = this.validate(resourceOrData, data);

        if (!result.valid) {
          const error = new Error('Validation failed') as ErrorLike;
          error.code = 'VALIDATION_ERROR';
          error.errors = result.errors;
          error.status = 400;
          throw error;
        }
      },

      async validateBody(resourceName: string | null = null): Promise<ValidateBodyResult> {
        const body = await ctx.c.req.json();

        if (resourceName) {
          const result = this.validate(resourceName, body);
          return { ...result, data: body };
        } else {
          const result = this.validate(body);
          return { ...result, data: body };
        }
      }
    };
  }

  param(name: string): string | undefined {
    return this.c.req.param(name);
  }

  params(): Record<string, string> {
    return this.c.req.param();
  }

  query(name: string): string | undefined {
    return this.c.req.query(name);
  }

  queries(): Record<string, string> {
    return this.c.req.query();
  }

  header(name: string): string | undefined {
    return this.c.req.header(name);
  }

  async body(): Promise<Record<string, unknown>> {
    return await this.c.req.json();
  }

  async text(): Promise<string> {
    return await this.c.req.text();
  }

  async formData(): Promise<FormData> {
    return await this.c.req.formData();
  }

  json(data: unknown, status: number = 200): Response {
    return this.c.json(data, status as Parameters<typeof this.c.json>[1]);
  }

  success(data: unknown, status: number = 200): Response {
    return this.c.json({
      success: true,
      data
    }, status as Parameters<typeof this.c.json>[1]);
  }

  error(message: string | Error | null, status: number = 400, details: unknown = null): Response {
    const errorObj = typeof message === 'string'
      ? new Error(message)
      : (message || new Error('Unknown error'));
    const resolvedStatus = status || getErrorStatus(errorObj as ErrorLike);
    const code = getErrorCode(errorObj as ErrorLike);
    const stack = process.env.NODE_ENV !== 'production' && errorObj.stack
      ? errorObj.stack.split('\n').map(line => line.trim())
      : undefined;

    return this.c.json({
      success: false,
      error: {
        message: errorObj.message || message,
        code,
        status: resolvedStatus,
        ...(details ? { details } : {}),
        ...(stack ? { stack } : {})
      }
    }, resolvedStatus as Parameters<typeof this.c.json>[1]);
  }

  notFound(message: string = 'Not found'): Response {
    return this.c.json({
      success: false,
      error: {
        message,
        code: 'NOT_FOUND',
        status: 404
      }
    }, 404);
  }

  unauthorized(message: string = 'Unauthorized'): Response {
    return this.c.json({
      success: false,
      error: {
        message,
        code: 'UNAUTHORIZED',
        status: 401
      }
    }, 401);
  }

  forbidden(message: string = 'Forbidden'): Response {
    return this.c.json({
      success: false,
      error: {
        message,
        code: 'FORBIDDEN',
        status: 403
      }
    }, 403);
  }

  html(htmlContent: string, status: number = 200): Response {
    return this.c.html(htmlContent, status as Parameters<typeof this.c.html>[1]);
  }

  redirect(url: string, status: number = 302): Response {
    return this.c.redirect(url, status as Parameters<typeof this.c.redirect>[1]);
  }

  async render(template: string, data: Record<string, unknown> = {}, options: Record<string, unknown> = {}): Promise<Response> {
    const renderFn = (this.c as unknown as { render?: (template: string, data: Record<string, unknown>, options: Record<string, unknown>) => Promise<Response> }).render;
    if (!renderFn) {
      throw new Error(
        'Template engine not configured. Use ApiPlugin with templates: { engine: "ejs" | "pug" | "jsx" }'
      );
    }

    return await renderFn(template, data, options);
  }

  get user(): UserInfo | null {
    return this.c.get('user') || null;
  }

  get session(): Record<string, unknown> | null {
    return this.c.get('session') || null;
  }

  get sessionId(): string | null {
    return this.c.get('sessionId') || null;
  }

  get requestId(): string | null {
    return this.c.get('requestId') || null;
  }

  get isAuthenticated(): boolean {
    return !!this.user;
  }

  hasScope(scope: string): boolean {
    return this.user?.scopes?.includes(scope) || false;
  }

  hasAnyScope(...scopes: string[]): boolean {
    return scopes.some(scope => this.hasScope(scope));
  }

  hasAllScopes(...scopes: string[]): boolean {
    return scopes.every(scope => this.hasScope(scope));
  }

  requireAuth(): void {
    if (!this.isAuthenticated) {
      throw Object.assign(
        new Error('Authentication required'),
        { status: 401, code: 'UNAUTHORIZED' }
      );
    }
  }

  requireScope(scope: string): void {
    this.requireAuth();

    if (!this.hasScope(scope)) {
      throw Object.assign(
        new Error(`Scope required: ${scope}`),
        { status: 403, code: 'FORBIDDEN' }
      );
    }
  }

  setPartition(partitionName: string, partitionFields: Record<string, unknown>): void {
    this._partitionFilters.push({ partitionName, partitionFields });
  }

  getPartitionFilters(): PartitionFilter[] {
    return this._partitionFilters;
  }

  clearPartitionFilters(): void {
    this._partitionFilters = [];
  }

  hasPartitionFilters(): boolean {
    return this._partitionFilters.length > 0;
  }
}

export function withContext(
  handler: (c: Context, ctx: RouteContext) => Promise<Response>,
  options: WithContextOptions = {}
): (c: Context) => Promise<Response> {
  return async (c: Context): Promise<Response> => {
    const legacyContext = c.get('customRouteContext') as LegacyContext | undefined || {};
    const { database, resource, plugins = {} } = legacyContext;

    const currentResource = options.resource || resource || null;

    const ctx = new RouteContext(c, database as Database, currentResource as ResourceLike | null, plugins);

    return await handler(c, ctx);
  };
}

export function autoWrapHandler(
  handler: ((c: Context) => Promise<Response>) | ((c: Context, ctx: RouteContext) => Promise<Response>),
  options: WithContextOptions = {}
): (c: Context) => Promise<Response> {
  if (handler.length === 1) {
    return handler as (c: Context) => Promise<Response>;
  }

  return withContext(handler as (c: Context, ctx: RouteContext) => Promise<Response>, options);
}
