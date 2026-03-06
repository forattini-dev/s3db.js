import type { Context } from '#src/plugins/shared/http-runtime.js';
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

export interface RouteRequestApi {
  readonly method: string;
  readonly path: string;
  readonly url: string | undefined;
  readonly id: string | null;
  raw: Context['req'];
  param(name: string): string | undefined;
  params(): Record<string, string>;
  query(name: string): string | undefined;
  queries(): Record<string, string>;
  header(name: string): string | undefined;
  headers(): Record<string, string>;
  body<T = Record<string, unknown>>(): Promise<T>;
  json<T = Record<string, unknown>>(): Promise<T>;
  text(): Promise<string>;
  formData(): Promise<FormData>;
}

export interface RouteResponseApi {
  raw: Context['res'];
  json(data: unknown, status?: number): Response;
  success(data: unknown, status?: number): Response;
  error(message: string | Error | null, status?: number, details?: unknown): Response;
  notFound(message?: string): Response;
  unauthorized(message?: string): Response;
  forbidden(message?: string): Response;
  html(htmlContent: string, status?: number): Response;
  redirect(url: string, status?: number): Response;
}

export interface RouteAuthApi {
  readonly user: UserInfo | null;
  readonly session: Record<string, unknown> | null;
  readonly sessionId: string | null;
  readonly requestId: string | null;
  readonly method: string | null;
  readonly identity: Record<string, unknown> | null;
  readonly serviceAccount: Record<string, unknown> | null;
  readonly isAuthenticated: boolean;
  readonly isServiceAccount: boolean;
  hasRole(role: string): boolean;
  hasScope(scope: string): boolean;
  hasAnyScope(...scopes: string[]): boolean;
  hasAllScopes(...scopes: string[]): boolean;
  requireAuth(): void;
  requireRole(role: string): void;
  requireScope(scope: string): void;
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
  c: Context;
  db: Database;
  database: Database;
  private _currentResource: ResourceLike | null;
  pluginRegistry: PluginRegistry;
  resources: Record<string, ResourceLike>;
  validator: ValidatorHelper;
  resource: ResourceLike | null;
  request: RouteRequestApi;
  response: RouteResponseApi;
  auth: RouteAuthApi;
  private _partitionFilters: PartitionFilter[];
  private _jsonBodyPromise: Promise<Record<string, unknown>> | null;
  private _textBodyPromise: Promise<string> | null;
  private _formDataPromise: Promise<FormData> | null;

  constructor(
    context: Context,
    database: Database,
    resource: ResourceLike | null = null,
    plugins: PluginRegistry = {}
  ) {
    this.c = context;
    this.db = database;
    this.database = database;
    this._currentResource = resource;
    this.pluginRegistry = plugins;
    this._partitionFilters = [];
    this._jsonBodyPromise = null;
    this._textBodyPromise = null;
    this._formDataPromise = null;

    this.resources = this._createResourcesProxy();
    this.validator = this._createValidator();
    this.resource = resource;
    this.request = this._createRequestApi();
    this.response = this._createResponseApi();
    this.auth = this._createAuthApi();
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
        const body = await ctx.body<Record<string, unknown>>();

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
      param: (name: string): string | undefined => this.param(name),
      params: (): Record<string, string> => this.params(),
      query: (name: string): string | undefined => this.query(name),
      queries: (): Record<string, string> => this.queries(),
      header: (name: string): string | undefined => this.header(name),
      headers: (): Record<string, string> => {
        const rawHeaders = this.c.req.raw?.headers;
        return rawHeaders ? Object.fromEntries(rawHeaders.entries()) : {};
      },
      body: async <T = Record<string, unknown>>(): Promise<T> => await this.body<T>(),
      json: async <T = Record<string, unknown>>(): Promise<T> => await this.body<T>(),
      text: async (): Promise<string> => await this.text(),
      formData: async (): Promise<FormData> => await this.formData()
    };
  }

  private _createResponseApi(): RouteResponseApi {
    return {
      raw: this.c.res,
      json: (data: unknown, status: number = 200): Response => this.json(data, status),
      success: (data: unknown, status: number = 200): Response => this.success(data, status),
      error: (message: string | Error | null, status: number = 400, details: unknown = null): Response => this.error(message, status, details),
      notFound: (message: string = 'Not found'): Response => this.notFound(message),
      unauthorized: (message: string = 'Unauthorized'): Response => this.unauthorized(message),
      forbidden: (message: string = 'Forbidden'): Response => this.forbidden(message),
      html: (htmlContent: string, status: number = 200): Response => this.html(htmlContent, status),
      redirect: (url: string, status: number = 302): Response => this.redirect(url, status)
    };
  }

  private _createAuthApi(): RouteAuthApi {
    const self = this;
    return {
      get user() {
        return self.user;
      },
      get session() {
        return self.session;
      },
      get sessionId() {
        return self.sessionId;
      },
      get requestId() {
        return self.requestId;
      },
      get method() {
        return self.authMethod;
      },
      get identity() {
        return self.identity;
      },
      get serviceAccount() {
        return self.serviceAccount;
      },
      get isAuthenticated() {
        return self.isAuthenticated;
      },
      get isServiceAccount() {
        return self.isServiceAccount;
      },
      hasRole: (role: string): boolean => this.hasRole(role),
      hasScope: (scope: string): boolean => this.hasScope(scope),
      hasAnyScope: (...scopes: string[]): boolean => this.hasAnyScope(...scopes),
      hasAllScopes: (...scopes: string[]): boolean => this.hasAllScopes(...scopes),
      requireAuth: (): void => this.requireAuth(),
      requireRole: (role: string): void => this.requireRole(role),
      requireScope: (scope: string): void => this.requireScope(scope)
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

  async body<T = Record<string, unknown>>(): Promise<T> {
    if (!this._jsonBodyPromise) {
      this._jsonBodyPromise = this.c.req.json() as Promise<Record<string, unknown>>;
    }

    return await this._jsonBodyPromise as T;
  }

  async text(): Promise<string> {
    if (!this._textBodyPromise) {
      this._textBodyPromise = this.c.req.text();
    }

    return await this._textBodyPromise;
  }

  async formData(): Promise<FormData> {
    if (!this._formDataPromise) {
      this._formDataPromise = this.c.req.formData();
    }

    return await this._formDataPromise;
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
    return (this.c.get('user') as UserInfo | null) || null;
  }

  get session(): Record<string, unknown> | null {
    return (this.c.get('session') as Record<string, unknown> | null) || null;
  }

  get sessionId(): string | null {
    return (this.c.get('sessionId') as string | null) || null;
  }

  get requestId(): string | null {
    return (this.c.get('requestId') as string | null) || null;
  }

  get authMethod(): string | null {
    return (this.c.get('authMethod') as string | null) || null;
  }

  get identity(): Record<string, unknown> | null {
    return (this.c.get('identity') as Record<string, unknown> | null) || null;
  }

  get serviceAccount(): Record<string, unknown> | null {
    return (this.c.get('serviceAccount') as Record<string, unknown> | null) || null;
  }

  get isAuthenticated(): boolean {
    return !!this.user;
  }

  get isServiceAccount(): boolean {
    if (this.serviceAccount) {
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
    if (!this.user || typeof role !== 'string' || !role.trim()) {
      return false;
    }

    const roles = [
      ...normalizeStringList(this.user.role),
      ...normalizeStringList(this.user.roles)
    ];

    return roles.includes(role);
  }

  hasScope(scope: string): boolean {
    const scopes = this.user?.scopes;
    if (!Array.isArray(scopes)) {
      return false;
    }

    if (scopes.includes(scope)) {
      return true;
    }

    const wildcards = scopes.filter((s): s is string => typeof s === 'string' && s.endsWith(':*'));
    for (const wildcard of wildcards) {
      const prefix = wildcard.slice(0, -2);
      if (scope.startsWith(`${prefix}:`)) {
        return true;
      }
    }

    return scopes.includes('*');
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

  requireRole(role: string): void {
    this.requireAuth();

    if (!this.hasRole(role)) {
      throw Object.assign(
        new Error(`Role required: ${role}`),
        { status: 403, code: 'FORBIDDEN' }
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
