import {
  createAuthContext,
  getAuthRoles,
  getAuthScopes,
  getPrincipalId,
  type AuthRequirement,
  type ContextLogger,
  type Principal
} from 'raffel';
import type { Context } from '#src/plugins/shared/http-runtime.js';
import type { Database } from '../../../database.class.js';
import { decodeRequestParam, decodeRequestParams } from '../utils/request-params.js';

export interface UserInfo {
  id?: string;
  sub?: string;
  role?: string;
  roles?: string[];
  scope?: string;
  scopes?: string[];
  tenantId?: string;
  token_use?: string;
  token_type?: string;
  service_account?: Record<string, unknown>;
  claims?: Record<string, unknown>;
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

export interface RouteContextFactoryOptions {
  database?: Database | null;
  resource?: ResourceLike | null;
  plugins?: PluginRegistry;
}

export interface WithContextOptions extends RouteContextFactoryOptions {}

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
  badRequest(message?: string, details?: unknown): Response;
  notFound(message?: string): Response;
  unauthorized(message?: string): Response;
  forbidden(message?: string): Response;
  validationError(message?: string, details?: unknown): Response;
  serverError(message?: string, details?: unknown): Response;
  html(htmlContent: string, status?: number): Response;
  redirect(url: string, status?: number): Response;
}

export interface RouteInputApi {
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly metadata: Readonly<Record<string, string>>;
  body<T = Record<string, unknown>>(): Promise<T>;
  json<T = Record<string, unknown>>(): Promise<T>;
  text(): Promise<string>;
  formData(): Promise<FormData>;
}

export interface RouteServicesApi {
  readonly db: Database;
  readonly database: Database;
  readonly resources: Readonly<Record<string, ResourceLike>>;
  readonly resource: ResourceLike | null;
  readonly plugins: Readonly<PluginRegistry>;
  readonly pluginRegistry: Readonly<PluginRegistry>;
}

export interface RouteAuthApi {
  readonly user: UserInfo | null;
  readonly session: Record<string, unknown> | null;
  readonly sessionId: string | null;
  readonly requestId: string | null;
  readonly method: string | null;
  readonly identity: Record<string, unknown> | null;
  readonly serviceAccount: Record<string, unknown> | null;
  readonly authenticated: boolean;
  readonly principal: Principal | null;
  readonly principalId: string | null;
  readonly roles: readonly string[];
  readonly scopes: readonly string[];
  readonly claims: Readonly<Record<string, unknown>>;
  readonly tenantId: string | null;
  readonly isAuthenticated: boolean;
  readonly isServiceAccount: boolean;
  require(requirement?: AuthRequirement): Principal;
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

function normalizeScopeList(input: unknown): string[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input
      .filter((value): value is string => typeof value === 'string')
      .flatMap((value) => value.split(/\s+/))
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (typeof input === 'string') {
    return input
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
}

function freezeStringRecord(record: Record<string, string>): Readonly<Record<string, string>> {
  return Object.freeze({ ...record });
}

function normalizeClaims(input: unknown): Readonly<Record<string, unknown>> {
  if (!input || typeof input !== 'object') {
    return Object.freeze({});
  }

  return Object.freeze({ ...(input as Record<string, unknown>) });
}

function matchesScope(grantedScopes: readonly string[], scope: string): boolean {
  if (grantedScopes.includes(scope) || grantedScopes.includes('*')) {
    return true;
  }

  const wildcards = grantedScopes.filter((value) => value.endsWith(':*'));
  for (const wildcard of wildcards) {
    const prefix = wildcard.slice(0, -2);
    if (scope.startsWith(`${prefix}:`)) {
      return true;
    }
  }

  return false;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return !!value
    && typeof value === 'object'
    && 'aborted' in value
    && typeof (value as { addEventListener?: unknown }).addEventListener === 'function';
}

const NOOP_CONTEXT_LOGGER: ContextLogger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() {
    return NOOP_CONTEXT_LOGGER;
  }
};

function createContextLogger(input: unknown): ContextLogger {
  if (!input || typeof input !== 'object') {
    return NOOP_CONTEXT_LOGGER;
  }

  const logger = input as Partial<ContextLogger> & Record<string, unknown>;
  let wrappedLogger: ContextLogger;
  const bindMethod = (method: keyof Omit<ContextLogger, 'child'>): ContextLogger[typeof method] => {
    const candidate = logger[method];
    if (typeof candidate === 'function') {
      return candidate.bind(input) as ContextLogger[typeof method];
    }

    return NOOP_CONTEXT_LOGGER[method];
  };

  wrappedLogger = {
    trace: bindMethod('trace'),
    debug: bindMethod('debug'),
    info: bindMethod('info'),
    warn: bindMethod('warn'),
    error: bindMethod('error'),
    fatal: bindMethod('fatal'),
    child(bindings: Record<string, unknown>): ContextLogger {
      const childLogger = typeof logger.child === 'function'
        ? logger.child.call(input, bindings)
        : null;
      return createContextLogger(childLogger ?? input);
    }
  };

  return wrappedLogger;
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
  input: RouteInputApi;
  services: RouteServicesApi;
  logger: ContextLogger;
  signal: AbortSignal;
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
    this.input = this._createInputApi();
    this.services = this._createServicesApi();
    this.logger = this._createLogger();
    this.signal = this._resolveSignal();
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

  private _getHeaders(): Record<string, string> {
    const rawHeaders = this.c.req.raw?.headers;
    return rawHeaders ? Object.fromEntries(rawHeaders.entries()) : {};
  }

  private _createInputApi(): RouteInputApi {
    const params = freezeStringRecord(this.params());
    const query = freezeStringRecord(this.queries());
    const metadata = freezeStringRecord(this._getHeaders());

    return Object.freeze({
      params,
      query,
      metadata,
      body: async <T = Record<string, unknown>>(): Promise<T> => await this.body<T>(),
      json: async <T = Record<string, unknown>>(): Promise<T> => await this.body<T>(),
      text: async (): Promise<string> => await this.text(),
      formData: async (): Promise<FormData> => await this.formData()
    });
  }

  private _createServicesApi(): RouteServicesApi {
    const plugins = Object.freeze({ ...this.pluginRegistry });

    return Object.freeze({
      db: this.db,
      database: this.database,
      resources: this.resources,
      resource: this.resource,
      plugins,
      pluginRegistry: plugins
    });
  }

  private _createLogger(): ContextLogger {
    return createContextLogger(this.c.get('logger' as never) ?? this.c.get('reqLogger' as never));
  }

  private _resolveSignal(): AbortSignal {
    const rawSignal = (this.c.req.raw as { signal?: unknown } | undefined)?.signal
      ?? this.c.get('signal' as never);

    return isAbortSignal(rawSignal) ? rawSignal : new AbortController().signal;
  }

  private _getClaims(): Readonly<Record<string, unknown>> {
    const user = this.user;

    if (user) {
      const nestedClaims = user.claims && typeof user.claims === 'object'
        ? user.claims
        : {};
      return normalizeClaims({
        ...user,
        ...nestedClaims
      });
    }

    return normalizeClaims(this.serviceAccount);
  }

  private _getNormalizedRoles(): readonly string[] {
    const claims = this._getClaims() as Record<string, unknown>;
    return Object.freeze([
      ...new Set([
        ...normalizeStringList(this.user?.role),
        ...normalizeStringList(this.user?.roles),
        ...normalizeStringList(claims.role),
        ...normalizeStringList(claims.roles)
      ])
    ]);
  }

  private _getNormalizedScopes(): readonly string[] {
    const claims = this._getClaims() as Record<string, unknown>;
    const serviceAccount = this.serviceAccount as { scopes?: unknown } | null;

    return Object.freeze([
      ...new Set([
        ...normalizeScopeList(this.user?.scope),
        ...normalizeScopeList(this.user?.scopes),
        ...normalizeScopeList(serviceAccount?.scopes),
        ...normalizeScopeList(claims.scope),
        ...normalizeScopeList(claims.scopes)
      ])
    ]);
  }

  private _getTenantId(): string | null {
    const claims = this._getClaims() as Record<string, unknown>;
    const tenantId = this.user?.tenantId ?? claims.tenantId;
    return typeof tenantId === 'string' && tenantId.trim() ? tenantId : null;
  }

  private _resolvePrincipalIdFromState(): string | null {
    const user = this.user;
    const serviceAccount = this.serviceAccount as { clientId?: unknown } | null;

    const principalId = user?.id
      ?? user?.sub
      ?? (typeof serviceAccount?.clientId === 'string' ? serviceAccount.clientId : null);

    return typeof principalId === 'string' && principalId.trim() ? principalId : null;
  }

  private _buildPrincipalFromState(): Principal | null {
    const principalId = this._resolvePrincipalIdFromState();
    if (!principalId) {
      return null;
    }

    const roles = this._getNormalizedRoles();
    const scopes = this._getNormalizedScopes();
    const tenantId = this._getTenantId();
    const claims = this._getClaims();

    return {
      type: this.isServiceAccount ? 'service' : 'user',
      id: principalId,
      ...(roles.length > 0 ? { roles } : {}),
      ...(scopes.length > 0 ? { scopes } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(Object.keys(claims).length > 0 ? { claims } : {})
    };
  }

  private _getAuthContext() {
    return createAuthContext({
      authenticated: this.isAuthenticated,
      principal: this._buildPrincipalFromState() || undefined,
      principalId: this._resolvePrincipalIdFromState() || undefined,
      roles: this._getNormalizedRoles(),
      scopes: this._getNormalizedScopes(),
      tenantId: this._getTenantId() || undefined,
      claims: { ...this._getClaims() }
    });
  }

  private _getRoles(): readonly string[] {
    return Object.freeze([...getAuthRoles(this._getAuthContext())]);
  }

  private _getScopes(): readonly string[] {
    return Object.freeze([...getAuthScopes(this._getAuthContext())]);
  }

  private _getPrincipalId(): string | null {
    const authContext = this._getAuthContext();
    return authContext.principalId || getPrincipalId(authContext.principal) || null;
  }

  private _getPrincipal(): Principal | null {
    const principal = this._getAuthContext().principal;
    if (!principal) {
      return null;
    }

    if (typeof principal === 'string') {
      return {
        type: this.isServiceAccount ? 'service' : 'user',
        id: principal
      };
    }

    return principal as Principal;
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
      headers: (): Record<string, string> => ({ ...this.input.metadata }),
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
      badRequest: (message: string = 'Bad request', details: unknown = null): Response => this.badRequest(message, details),
      notFound: (message: string = 'Not found'): Response => this.notFound(message),
      unauthorized: (message: string = 'Unauthorized'): Response => this.unauthorized(message),
      forbidden: (message: string = 'Forbidden'): Response => this.forbidden(message),
      validationError: (message: string = 'Validation failed', details: unknown = null): Response => this.validationError(message, details),
      serverError: (message: string = 'Internal server error', details: unknown = null): Response => this.serverError(message, details),
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
      get authenticated() {
        return self.isAuthenticated;
      },
      get principal() {
        return self._getPrincipal();
      },
      get principalId() {
        return self._getPrincipalId();
      },
      get roles() {
        return self._getRoles();
      },
      get scopes() {
        return self._getScopes();
      },
      get claims() {
        return self._getClaims();
      },
      get tenantId() {
        return self._getTenantId();
      },
      get isAuthenticated() {
        return self.isAuthenticated;
      },
      get isServiceAccount() {
        return self.isServiceAccount;
      },
      require: (requirement?: AuthRequirement): Principal => this.require(requirement),
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
    return decodeRequestParam(this.c.req.param(name));
  }

  params(): Record<string, string> {
    return decodeRequestParams(this.c.req.param());
  }

  query(): Record<string, string>;
  query(name: string): string | undefined;
  query(name?: string): Record<string, string> | string | undefined {
    if (typeof name === 'string') {
      return this.c.req.query(name);
    }

    return this.c.req.query();
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

  set(key: string, value: unknown): void {
    this.c.set(key as never, value as never);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.c.get(key as never) as T | undefined;
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

  badRequest(message: string = 'Bad request', details: unknown = null): Response {
    return this.error(message, 400, details);
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

  validationError(message: string = 'Validation failed', details: unknown = null): Response {
    return this.error(message, 400, details);
  }

  serverError(message: string = 'Internal server error', details: unknown = null): Response {
    return this.error(message, 500, details);
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
    return !!(this.user || this.serviceAccount);
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
    if (typeof role !== 'string' || !role.trim()) {
      return false;
    }

    return this._getRoles().includes(role);
  }

  hasScope(scope: string): boolean {
    if (typeof scope !== 'string' || !scope.trim()) {
      return false;
    }

    return matchesScope(this._getScopes(), scope);
  }

  hasAnyScope(...scopes: string[]): boolean {
    return scopes.some(scope => this.hasScope(scope));
  }

  hasAllScopes(...scopes: string[]): boolean {
    return scopes.every(scope => this.hasScope(scope));
  }

  require(requirement: AuthRequirement = { authenticated: true }): Principal {
    if (requirement.authenticated !== false || requirement.roles?.length || requirement.scopes?.length) {
      this.requireAuth();
    }

    if (requirement.roles && requirement.roles.some((role) => !this.hasRole(role))) {
      throw Object.assign(
        new Error('Missing required role'),
        { status: 403, code: 'FORBIDDEN' }
      );
    }

    if (requirement.scopes && requirement.scopes.some((scope) => !this.hasScope(scope))) {
      throw Object.assign(
        new Error('Missing required scope'),
        { status: 403, code: 'FORBIDDEN' }
      );
    }

    const principal = this._getPrincipal();
    if (!principal) {
      throw Object.assign(
        new Error('Authentication required'),
        { status: 401, code: 'UNAUTHORIZED' }
      );
    }

    return principal;
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
  handler: (c: Context, ctx: RouteContext) => Promise<Response> | Response,
  options: WithContextOptions = {}
): (c: Context) => Promise<Response> {
  return async (c: Context): Promise<Response> => {
    const ctx = createRouteContext(c, options);
    return await handler(c, ctx);
  };
}

export function autoWrapHandler(
  handler: ((c: Context) => Promise<Response> | Response) | ((c: Context, ctx: RouteContext) => Promise<Response> | Response),
  options: WithContextOptions = {}
): (c: Context) => Promise<Response> {
  return withContext(handler as (c: Context, ctx: RouteContext) => Promise<Response> | Response, options);
}

export function createRouteContext(c: Context, options: RouteContextFactoryOptions = {}): RouteContext {
  const database = options.database
    || c.get('db' as never)
    || c.get('database' as never);

  if (!database) {
    throw new Error(
      '[RouteContext] Database not found. ' +
      'Ensure context injection middleware is registered or pass options.database.'
    );
  }

  const plugins = options.plugins
    || (database as Database & { pluginRegistry?: PluginRegistry }).pluginRegistry
    || {};

  return new RouteContext(
    c,
    database as Database,
    (options.resource || null) as ResourceLike | null,
    plugins
  );
}
