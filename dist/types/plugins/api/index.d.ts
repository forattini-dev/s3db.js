/**
 * API Plugin - RESTful HTTP API for s3db.js resources
 *
 * Transforms s3db.js resources into HTTP REST endpoints with:
 * - Multiple authentication methods (JWT, API Key, Basic Auth, Public)
 * - Automatic versioning based on resource version
 * - Production features (CORS, Rate Limiting, Logging, Compression)
 * - Schema validation middleware
 * - Custom middleware support
 *
 * @example
 * const apiPlugin = new ApiPlugin({
 *   port: 3000,
 *   docs: { enabled: true },
 *   auth: {
 *     jwt: { enabled: true, secret: 'my-secret' },
 *     apiKey: { enabled: true }
 *   },
 *   resources: {
 *     cars: {
 *       auth: ['jwt', 'apiKey'],
 *       methods: ['GET', 'POST', 'PUT', 'DELETE']
 *     }
 *   },
 *   cors: { enabled: true },
 *   rateLimit: { enabled: true, maxRequests: 100 },
 *   logging: { enabled: true },
 *   compression: { enabled: true },
 *   validation: { enabled: true }
 * });
 *
 * await database.usePlugin(apiPlugin);
 */
import type { Context, MiddlewareHandler } from 'hono';
import { Plugin } from '../plugin.class.js';
import { ApiServer } from './server.js';
import type { Hono } from 'hono';
export interface ResourceDescriptor {
    defaultName: string;
    override?: string | null;
}
export interface RegistrationConfig {
    enabled: boolean;
    allowedFields: string[];
    defaultRole: string;
}
export interface LoginThrottleConfig {
    enabled: boolean;
    maxAttempts: number;
    windowMs: number;
    blockDurationMs: number;
    maxEntries: number;
}
export interface DocsConfig {
    enabled: boolean;
    ui: 'swagger' | 'redoc';
    title: string;
    version: string;
    description: string;
    csp: string | null;
}
export interface CorsConfig {
    enabled: boolean;
    origin: string | string[];
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
}
export interface RateLimitConfig {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    keyGenerator: ((c: Context) => string) | null;
    maxUniqueKeys: number;
    rules: unknown[];
}
export interface LoggingConfig {
    enabled: boolean;
    [key: string]: unknown;
}
export interface CompressionConfig {
    enabled: boolean;
    threshold: number;
    level: number;
}
export interface ValidationConfig {
    enabled: boolean;
    validateOnInsert: boolean;
    validateOnUpdate: boolean;
    returnValidationErrors: boolean;
}
export interface CspDirectives {
    'default-src'?: string[];
    'script-src'?: string[];
    'style-src'?: string[];
    'font-src'?: string[];
    'img-src'?: string[];
    'connect-src'?: string[];
    [key: string]: string[] | undefined;
}
export interface ContentSecurityPolicyConfig {
    enabled: boolean;
    directives: CspDirectives;
    reportOnly: boolean;
    reportUri: string | null;
}
export interface FrameguardConfig {
    action: 'deny' | 'sameorigin';
}
export interface HstsConfig {
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
}
export interface ReferrerPolicyConfig {
    policy: string;
}
export interface DnsPrefetchControlConfig {
    allow: boolean;
}
export interface PermittedCrossDomainPoliciesConfig {
    policy: string;
}
export interface XssFilterConfig {
    mode: string;
}
export interface PermissionsPolicyFeatures {
    geolocation?: string[];
    microphone?: string[];
    camera?: string[];
    payment?: string[];
    usb?: string[];
    magnetometer?: string[];
    gyroscope?: string[];
    accelerometer?: string[];
    [key: string]: string[] | undefined;
}
export interface PermissionsPolicyConfig {
    features: PermissionsPolicyFeatures;
}
export interface SecurityConfig {
    enabled: boolean;
    contentSecurityPolicy: ContentSecurityPolicyConfig | false;
    frameguard: FrameguardConfig | false;
    noSniff: boolean;
    hsts: HstsConfig | false;
    referrerPolicy: ReferrerPolicyConfig | false;
    dnsPrefetchControl: DnsPrefetchControlConfig | false;
    ieNoOpen: boolean;
    permittedCrossDomainPolicies: PermittedCrossDomainPoliciesConfig | false;
    xssFilter: XssFilterConfig | false;
    permissionsPolicy: PermissionsPolicyConfig | false;
}
export interface TemplatesConfig {
    enabled: boolean;
    engine: 'jsx' | 'ejs' | 'custom';
    templatesDir: string;
    layout: string | null;
    engineOptions: Record<string, unknown>;
    customRenderer: ((template: string, data: unknown) => string) | null;
}
export interface FailbanConfig {
    enabled: boolean;
    resourceNames?: Record<string, string>;
    [key: string]: unknown;
}
export interface HealthConfig {
    enabled: boolean;
    [key: string]: unknown;
}
export interface StaticConfig {
    path: string;
    root: string;
    [key: string]: unknown;
}
export interface AuthDriverDefinition {
    driver: string;
    config?: {
        resource?: string;
        [key: string]: unknown;
    };
}
export interface AuthConfig {
    drivers: AuthDriverDefinition[];
    registration: RegistrationConfig;
    loginThrottle: LoginThrottleConfig;
    createResource: boolean;
    usersResourcePasswordValidation: string;
    enableIdentityContextMiddleware: boolean;
    usersResourceAttributes: Record<string, string>;
    resource?: string;
    [key: string]: unknown;
}
export interface ApiPluginConfig {
    port: number;
    host: string;
    logLevel: string | false;
    basePath: string;
    startupBanner: boolean;
    versionPrefix: boolean | string;
    docs: DocsConfig;
    auth: AuthConfig;
    routes: Record<string, unknown>;
    templates: TemplatesConfig;
    cors: CorsConfig;
    rateLimit: RateLimitConfig;
    logging: LoggingConfig;
    compression: CompressionConfig;
    validation: ValidationConfig;
    security: SecurityConfig;
    middlewares: MiddlewareHandler[];
    requestId: {
        enabled: boolean;
    };
    sessionTracking: {
        enabled: boolean;
    };
    events: {
        enabled: boolean;
    };
    metrics: {
        enabled: boolean;
    };
    failban: FailbanConfig;
    static: StaticConfig[];
    health: HealthConfig;
    maxBodySize: number;
    resources: Record<string, unknown>;
}
export interface ApiPluginOptions {
    port?: number;
    host?: string;
    basePath?: string;
    startupBanner?: boolean;
    versionPrefix?: boolean | string;
    docs?: Partial<DocsConfig>;
    docsEnabled?: boolean;
    apiTitle?: string;
    apiVersion?: string;
    apiDescription?: string;
    auth?: Partial<AuthConfig> & {
        resource?: string;
        registration?: Partial<RegistrationConfig>;
        loginThrottle?: Partial<LoginThrottleConfig>;
    };
    routes?: Record<string, unknown>;
    templates?: Partial<TemplatesConfig>;
    cors?: Partial<CorsConfig>;
    rateLimit?: Partial<RateLimitConfig> & {
        rules?: unknown[];
    };
    logging?: Partial<LoggingConfig>;
    compression?: Partial<CompressionConfig>;
    validation?: Partial<ValidationConfig>;
    security?: Partial<SecurityConfig> & {
        contentSecurityPolicy?: Partial<ContentSecurityPolicyConfig> | false;
    };
    csp?: {
        directives?: CspDirectives;
        reportOnly?: boolean;
        reportUri?: string;
    };
    middlewares?: MiddlewareHandler[];
    requestId?: {
        enabled: boolean;
    };
    sessionTracking?: {
        enabled: boolean;
    };
    events?: {
        enabled: boolean;
    };
    metrics?: {
        enabled: boolean;
    };
    failban?: Partial<FailbanConfig>;
    static?: StaticConfig[];
    health?: Partial<HealthConfig> | boolean;
    maxBodySize?: number;
    resources?: Record<string, unknown>;
    resourceNames?: {
        authUsers?: string;
        failban?: Record<string, string>;
    };
    logLevel?: string | false;
}
export interface ServerInfo {
    isRunning: boolean;
    port?: number;
    host?: string;
    resources?: number;
}
export interface UninstallOptions {
    purgeData?: boolean;
}
interface ResourceLike {
    name: string;
    [key: string]: unknown;
}
export declare class ApiPlugin extends Plugin {
    config: ApiPluginConfig;
    private _usersResourceDescriptor;
    usersResourceName: string;
    server: ApiServer | null;
    usersResource: ResourceLike | null;
    compiledMiddlewares: MiddlewareHandler[];
    constructor(options?: ApiPluginOptions);
    private _validateDependencies;
    onInstall(): Promise<void>;
    private _createUsersResource;
    private _findExistingUsersResource;
    private _deepMerge;
    private _setupMiddlewares;
    onStart(): Promise<void>;
    private _checkPortAvailability;
    onStop(): Promise<void>;
    private _resolveUsersResourceName;
    onNamespaceChanged(): void;
    onUninstall(options?: UninstallOptions): Promise<void>;
    getServerInfo(): ServerInfo;
    getApp(): Hono | null;
}
export { OIDCClient } from './auth/oidc-client.js';
export * from './concerns/guards-helpers.js';
export { setupTemplateEngine, ejsEngine, pugEngine, jsxEngine } from './utils/template-engine.js';
export { OpenGraphHelper } from './concerns/opengraph-helper.js';
export { NotificationStateMachine, AttemptStateMachine, createNotificationStateMachine, createAttemptStateMachine } from './concerns/state-machine.js';
export { RouteContext, withContext } from './concerns/route-context.js';
export { errorResponse, successResponse } from './utils/route-helper.js';
export { createContextInjectionMiddleware } from './middlewares/context-injection.js';
export { HttpBadRequestError, HttpValidationError, HttpUnauthorizedError, HttpForbiddenError, HttpNotFoundError, HttpMethodNotAllowedError, HttpConflictError, HttpUnprocessableEntityError, HttpTooManyRequestsError, HttpInternalServerError, HttpNotImplementedError, HttpServiceUnavailableError, HTTP_ERRORS, createHttpError } from './errors.js';
export { getChunkedCookie, setChunkedCookie, deleteChunkedCookie, isChunkedCookie, CookieChunkOverflowError, type CookieOptions, type ChunkingOptions, type CookieChunkOverflowDetails } from './concerns/cookie-chunking.js';
//# sourceMappingURL=index.d.ts.map