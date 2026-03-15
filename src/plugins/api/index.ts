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

import type { Context, MiddlewareHandler } from '#src/plugins/shared/http-runtime.js';
import { Plugin } from '../plugin.class.js';
import { requirePluginDependency } from '../concerns/plugin-dependencies.js';
import * as raffel from 'raffel';
import tryFn from '../../concerns/try-fn.js';
import { ApiServer } from './server.js';
import { ApiRouteRegistry } from './route-registry.js';
import { idGenerator } from '../../concerns/id.js';
import { resolveResourceName } from '../concerns/resource-names.js';
import { normalizeBasePath } from './utils/base-path.js';
import { normalizeApiListeners } from './config/normalize-listeners.js';
import { normalizeAuthConfig } from './config/normalize-auth.js';
import { normalizeLoggingConfig } from './config/normalize-logging.js';
import { normalizeRateLimitRules } from './config/normalize-ratelimit.js';
import { normalizeResourcesConfig } from './config/normalize-resources.js';
import { createCompressionMiddleware } from './middleware/compression.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { createIdentityContextMiddleware } from './middleware/identity.js';
import { createLoggingMiddleware } from './middleware/logging.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import { createSecurityMiddleware } from './middleware/security.js';
import { initCookieChunking } from './concerns/cookie-chunking.js';

import type { HttpApp } from '#src/plugins/shared/http-runtime.js';
import type {
  ResourceDescriptor,
  RegistrationConfig,
  LoginThrottleConfig,
  DocsConfig,
  ApiCorsConfig as CorsConfig,
  ApiRateLimitConfig as RateLimitConfig,
  ApiLoggingConfig as LoggingConfig,
  CompressionConfig,
  ValidationConfig,
  CspDirectives,
  ContentSecurityPolicyConfig,
  FrameguardConfig,
  HstsConfig,
  ReferrerPolicyConfig,
  DnsPrefetchControlConfig,
  PermittedCrossDomainPoliciesConfig,
  XssFilterConfig,
  PermissionsPolicyConfig,
  ApiSecurityConfig as SecurityConfig,
  TemplatesConfig,
  FailbanConfig,
  HealthConfig,
  StaticConfig,
  AuthDriverDefinition,
  AuthConfig,
  ApiPluginConfig,
  ApiListenerConfigInput,
  ApiListenerConfig,
  ApiListenerConfigInputProtocol,
  UninstallOptions,
  DatabaseLike,
  ResourceLike,
} from './types.internal.js';
import type { ApiRuntimeInspectionPreview } from './runtime-inspection.js';

export interface ApiPluginOptions {
  port?: number;
  host?: string;
  basePath?: string;
  startupBanner?: boolean;
  versionPrefix?: boolean | string;
  listeners?: ApiListenerConfigInput | ApiListenerConfigInput[];
  docs?: Partial<DocsConfig>;
  auth?: Partial<AuthConfig> & {
    resource?: string;
    registration?: Partial<RegistrationConfig>;
    loginThrottle?: Partial<LoginThrottleConfig>;
  };
  routes?: Record<string, unknown>;
  templates?: Partial<TemplatesConfig>;
  cors?: Partial<CorsConfig>;
  rateLimit?: Partial<RateLimitConfig> & { rules?: unknown[] };
  logging?: Partial<LoggingConfig>;
  compression?: Partial<CompressionConfig>;
  validation?: Partial<ValidationConfig>;
  security?: Partial<SecurityConfig> & { contentSecurityPolicy?: Partial<ContentSecurityPolicyConfig> | false };
  csp?: { directives?: CspDirectives; reportOnly?: boolean; reportUri?: string };
  middlewares?: MiddlewareHandler[];
  rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
  requestId?: { enabled: boolean };
  sessionTracking?: { enabled: boolean };
  events?: { enabled: boolean };
  metrics?: { enabled: boolean };
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

import type { ServerInfo } from '../shared/types.js';

const BASE_USER_ATTRIBUTES: Record<string, string> = {
  id: 'string|required',
  username: 'string|required|minlength:3',
  email: 'string|required|email',
  role: 'string|default:user',
  scopes: 'array|items:string|optional',
  active: 'boolean|default:true',
  createdAt: 'string|optional',
  lastLoginAt: 'string|optional',
  metadata: 'json|optional'
};

function requiresManagedAuthResource(drivers: Array<{ driver?: string; type?: string }> = []): boolean {
  return drivers.some((driver) => {
    const value = String(driver?.driver || driver?.type || '').trim().toLowerCase();
    return value !== 'oidc'
      && value !== 'header-secret'
      && value !== 'header_secret'
      && value !== 'headersecret';
  });
}


export class ApiPlugin extends Plugin {
  public readonly raffel = raffel;
  declare config: ApiPluginConfig;
  private _usersResourceDescriptor: ResourceDescriptor;
  usersResourceName: string;
  server: ApiServer | null;
  private _servers: ApiServer[] = [];
  usersResource: ResourceLike | null;
  compiledMiddlewares: MiddlewareHandler[];

  constructor(options: ApiPluginOptions = {}) {
    super(options as ConstructorParameters<typeof Plugin>[0]);

    const resourceNamesOption = options.resourceNames || {};
    const defaultPort = options.port || 3000;
    const defaultHost = options.host || '0.0.0.0';
    const normalizedListeners = normalizeApiListeners(options.listeners, {
      host: defaultHost,
      port: defaultPort
    });
    const primaryListener = normalizedListeners[0];
    if (!primaryListener) {
      throw new Error('ApiPlugin could not resolve a primary listener.');
    }

    const jwtDriver = options.auth?.drivers?.find(d => d.driver === 'jwt');
    const jwtDriverResource = jwtDriver?.config?.resource;
    this._usersResourceDescriptor = {
      defaultName: 'plg_api_users',
      override: resourceNamesOption.authUsers || options.auth?.resource || jwtDriverResource
    };
    const normalizedAuthBase = normalizeAuthConfig(
      options.auth as Parameters<typeof normalizeAuthConfig>[0],
      this.logger
    );
    const normalizedAuth: AuthConfig = {
      ...normalizedAuthBase,
      registration: {
        enabled: options.auth?.registration?.enabled === true,
        allowedFields: Array.isArray(options.auth?.registration?.allowedFields)
          ? options.auth.registration.allowedFields
          : [],
        defaultRole: options.auth?.registration?.defaultRole || 'user'
      },
      loginThrottle: {
        enabled: options.auth?.loginThrottle?.enabled !== false,
        maxAttempts: options.auth?.loginThrottle?.maxAttempts || 5,
        windowMs: options.auth?.loginThrottle?.windowMs || 60_000,
        blockDurationMs: options.auth?.loginThrottle?.blockDurationMs || 300_000,
        maxEntries: options.auth?.loginThrottle?.maxEntries || 10_000
      },
      usersResourcePasswordValidation: options.auth?.usersResourcePasswordValidation || 'password|required|minlength:8',
      enableIdentityContextMiddleware: options.auth?.enableIdentityContextMiddleware !== false,
      usersResourceAttributes: options.auth?.usersResourceAttributes || {},
      skipRoutes: options.auth?.skipRoutes === true,
      usernameField: options.auth?.usernameField,
      passwordField: options.auth?.passwordField
    };
    this.usersResourceName = this._resolveUsersResourceName();
    normalizedAuth.createResource = options.auth?.createResource !== false;

    this.config = {
      port: primaryListener.bind.port,
      host: primaryListener.bind.host,
      logLevel: this.logLevel,
      basePath: normalizeBasePath(options.basePath),
      startupBanner: options.startupBanner !== false,
      versionPrefix: options.versionPrefix !== undefined ? options.versionPrefix : false,
      listeners: normalizedListeners,

      docs: {
        enabled: options.docs?.enabled !== false,
        title: options.docs?.title || 's3db.js API',
        version: options.docs?.version || '1.0.0',
        description: options.docs?.description || 'Auto-generated REST API for s3db.js resources',
        uiTheme: options.docs?.uiTheme || 'auto',
        tryItOut: options.docs?.tryItOut !== false,
        codeGeneration: options.docs?.codeGeneration !== false,
      },

      auth: normalizedAuth,
      routes: options.routes || {},

      templates: {
        enabled: options.templates?.enabled || false,
        engine: options.templates?.engine || 'jsx',
        templatesDir: options.templates?.templatesDir || './views',
        layout: options.templates?.layout || null,
        engineOptions: options.templates?.engineOptions || {},
        customRenderer: options.templates?.customRenderer || null
      },

      cors: {
        enabled: options.cors?.enabled || false,
        origin: options.cors?.origin || '*',
        methods: options.cors?.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: options.cors?.allowedHeaders || ['Content-Type', 'Authorization', 'X-API-Key'],
        exposedHeaders: options.cors?.exposedHeaders || ['X-Total-Count', 'X-Page-Count', 'X-Next-Cursor', 'X-Pagination-Mode'],
        credentials: options.cors?.credentials !== false,
        maxAge: options.cors?.maxAge || 86400
      },

      rateLimit: {
        enabled: options.rateLimit?.enabled || false,
        windowMs: options.rateLimit?.windowMs || 60000,
        maxRequests: options.rateLimit?.maxRequests || 100,
        keyGenerator: typeof options.rateLimit?.keyGenerator === 'function'
          ? options.rateLimit.keyGenerator
          : null,
        maxUniqueKeys: options.rateLimit?.maxUniqueKeys || 1000,
        rules: normalizeRateLimitRules(options.rateLimit?.rules as Parameters<typeof normalizeRateLimitRules>[0], this.logger)
      },

      logging: normalizeLoggingConfig(options.logging) as unknown as LoggingConfig,

      compression: {
        enabled: options.compression?.enabled || false,
        threshold: options.compression?.threshold || 1024,
        level: options.compression?.level || 6
      },

      validation: {
        enabled: options.validation?.enabled !== false,
        validateOnInsert: options.validation?.validateOnInsert !== false,
        validateOnUpdate: options.validation?.validateOnUpdate !== false,
        returnValidationErrors: options.validation?.returnValidationErrors !== false
      },

      security: {
        enabled: options.security?.enabled !== false,

        contentSecurityPolicy: options.security?.contentSecurityPolicy !== false ? (() => {
          const directives: CspDirectives = (options.security?.contentSecurityPolicy as Partial<ContentSecurityPolicyConfig> | undefined)?.directives || options.csp?.directives || {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'font-src': ["'self'"],
            'img-src': ["'self'", 'data:', 'https:'],
            'connect-src': ["'self'"]
          };

          return {
            enabled: (options.security?.contentSecurityPolicy as Partial<ContentSecurityPolicyConfig> | undefined)?.enabled !== false,
            directives,
            reportOnly: (options.security?.contentSecurityPolicy as Partial<ContentSecurityPolicyConfig> | undefined)?.reportOnly || options.csp?.reportOnly || false,
            reportUri: (options.security?.contentSecurityPolicy as Partial<ContentSecurityPolicyConfig> | undefined)?.reportUri || options.csp?.reportUri || null
          };
        })() : false,

        frameguard: options.security?.frameguard !== false ? {
          action: (options.security?.frameguard as FrameguardConfig | undefined)?.action || 'deny'
        } : false,

        noSniff: options.security?.noSniff !== false,

        hsts: options.security?.hsts !== false ? {
          maxAge: (options.security?.hsts as HstsConfig | undefined)?.maxAge || 15552000,
          includeSubDomains: (options.security?.hsts as HstsConfig | undefined)?.includeSubDomains !== false,
          preload: (options.security?.hsts as HstsConfig | undefined)?.preload || false
        } : false,

        referrerPolicy: options.security?.referrerPolicy !== false ? {
          policy: (options.security?.referrerPolicy as ReferrerPolicyConfig | undefined)?.policy || 'no-referrer'
        } : false,

        dnsPrefetchControl: options.security?.dnsPrefetchControl !== false ? {
          allow: (options.security?.dnsPrefetchControl as DnsPrefetchControlConfig | undefined)?.allow || false
        } : false,

        ieNoOpen: options.security?.ieNoOpen !== false,

        permittedCrossDomainPolicies: options.security?.permittedCrossDomainPolicies !== false ? {
          policy: (options.security?.permittedCrossDomainPolicies as PermittedCrossDomainPoliciesConfig | undefined)?.policy || 'none'
        } : false,

        xssFilter: options.security?.xssFilter !== false ? {
          mode: (options.security?.xssFilter as XssFilterConfig | undefined)?.mode || 'block'
        } : false,

        permissionsPolicy: options.security?.permissionsPolicy !== false ? {
          features: (options.security?.permissionsPolicy as PermissionsPolicyConfig | undefined)?.features || {
            geolocation: [],
            microphone: [],
            camera: [],
            payment: [],
            usb: [],
            magnetometer: [],
            gyroscope: [],
            accelerometer: []
          }
        } : false
      },

      middlewares: options.middlewares || [],
      requestId: options.requestId || { enabled: false },
      sessionTracking: options.sessionTracking || { enabled: false },
      events: options.events || { enabled: false },
      metrics: options.metrics || { enabled: false },
      failban: {
        ...(options.failban || {}),
        enabled: options.failban?.enabled === true,
        resourceNames: resourceNamesOption.failban || options.failban?.resourceNames || {}
      },
      static: Array.isArray(options.static) ? options.static : [],
      health: typeof options.health === 'object'
        ? options.health as HealthConfig
        : { enabled: options.health !== false },
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024,
      rootRoute: options.rootRoute,
      resources: normalizeResourcesConfig(this.options.resources as Parameters<typeof normalizeResourcesConfig>[0], this.logger)
    };

    this.server = null;
    this.usersResource = null;
    this.compiledMiddlewares = [];
  }

  private async _validateDependencies(): Promise<void> {
    await requirePluginDependency('api-plugin', {
      throwOnError: true,
      checkVersions: true
    });
    await initCookieChunking();
  }

  override async onInstall(): Promise<void> {
    if (this.config.logLevel) {
      this.logger.info('Installing...');
    }

    try {
      await this._validateDependencies();
    } catch (err) {
      if (this.config.logLevel) {
        this.logger.error({ error: (err as Error).message }, 'Dependency validation failed');
      }
      throw err;
    }

    const authEnabled = requiresManagedAuthResource(this.config.auth.drivers);

    if (authEnabled) {
      await this._createUsersResource();
    }

    await this._setupMiddlewares();

    if (this.config.logLevel) {
      this.logger.info('Installed successfully');
    }
  }

  private async _createUsersResource(): Promise<void> {
    const existingResource = this._findExistingUsersResource();

    if (!this.config.auth.createResource) {
      if (!existingResource) {
        throw new Error(
          `[API Plugin] Auth resource "${this.usersResourceName}" not found and auth.createResource is false`
        );
      }
      this.usersResource = existingResource;
      this.config.auth.resource = existingResource.name;
      if (this.config.logLevel) {
        this.logger.info({ resourceName: existingResource.name }, 'Using existing resource for authentication');
      }
      return;
    }

    if (existingResource) {
      this.usersResource = existingResource;
      this.config.auth.resource = existingResource.name;
      if (this.config.logLevel) {
        this.logger.info({ resourceName: existingResource.name }, 'Reusing existing resource for authentication');
      }
      return;
    }

    const passwordValidation = this.config.auth.usersResourcePasswordValidation;

    const mergedAttributes = this._deepMerge(BASE_USER_ATTRIBUTES, this.config.auth.usersResourceAttributes);
    mergedAttributes.password = passwordValidation;

    const [ok, err, resource] = await tryFn<ResourceLike>(() =>
      (this.database as unknown as DatabaseLike).createResource({
        name: this.usersResourceName,
        attributes: mergedAttributes,
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'ApiPlugin'
      })
    );

    if (!ok) {
      throw err;
    }

    this.usersResource = resource;
    this.config.auth.resource = resource.name;
    if (this.config.logLevel) {
      this.logger.info({ usersResourceName: this.usersResourceName, passwordValidation: passwordValidation }, 'Created resource for authentication with configurable password validation');
    }
  }

  private _findExistingUsersResource(): ResourceLike | null {
    const candidates = new Set([this.usersResourceName, this.config?.auth?.resource].filter(Boolean));
    const db = this.database as unknown as DatabaseLike;

    for (const name of candidates) {
      if (!name) continue;
      const resource = db.resources?.[name];
      if (resource) {
        return resource;
      }
    }
    return null;
  }

  private _deepMerge(target: Record<string, string>, source: Record<string, string>): Record<string, string> {
    const output = { ...target };

    if (target && typeof target === 'object' && source && typeof source === 'object') {
      Object.keys(source).forEach(key => {
        const sourceVal = source[key];
        const targetVal = target[key];
        if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) && targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)) {
          output[key] = this._deepMerge(targetVal as unknown as Record<string, string>, sourceVal as unknown as Record<string, string>) as unknown as string;
        } else if (sourceVal !== undefined) {
          output[key] = sourceVal;
        }
      });
    }
    return output;
  }

  private async _setupMiddlewares(): Promise<void> {
    const middlewares: MiddlewareHandler[] = [];

    middlewares.push(async (c, next) => {
      c.set('requestId' as never, idGenerator() as never);
      c.set('logLevel' as never, this.config.logLevel as never);
      await next();
    });

    if (this.config.auth.enableIdentityContextMiddleware) {
      middlewares.push(createIdentityContextMiddleware());
    }

    if (this.config.security.enabled) {
      const securityMiddleware = await createSecurityMiddleware(this.config.security as unknown as Parameters<typeof createSecurityMiddleware>[0]);
      middlewares.push(securityMiddleware);
    }

    if (this.config.cors.enabled) {
      const corsMiddleware = await createCorsMiddleware(this.config.cors as unknown as Parameters<typeof createCorsMiddleware>[0]);
      middlewares.push(corsMiddleware);
    }

    if (this.config.rateLimit.enabled) {
      const rateLimitMiddleware = await createRateLimitMiddleware(this.config.rateLimit as unknown as Parameters<typeof createRateLimitMiddleware>[0]);
      middlewares.push(rateLimitMiddleware);
    }

    if (this.config.logging.enabled) {
      const loggingMiddleware = await createLoggingMiddleware(this.config.logging as unknown as Parameters<typeof createLoggingMiddleware>[0], this.logger);
      middlewares.push(loggingMiddleware);
    }

    if (this.config.compression.enabled) {
      const compressionMiddleware = await createCompressionMiddleware(this.config.compression, this.logger);
      middlewares.push(compressionMiddleware);
    }

    middlewares.push(...this.config.middlewares);

    this.compiledMiddlewares = middlewares;
  }

  override async onStart(): Promise<void> {
    if (this.config.logLevel) {
      this.logger.info('Starting server...');
    }

    if (this.config.logLevel) {
      this.logger.info({
        listeners: this.config.listeners.map((listener) => ({
          name: listener.name,
          bind: listener.bind,
          protocols: this._buildListenerProtocolSummary(listener)
        })),
        httpRequestLogging: {
          enabled: this.config.logging.enabled,
          format: this.config.logging.format
        }
      }, 'API listeners resolved with protocol matrix');
    }

    this._servers = this.config.listeners.map((listener) => this._createApiServer(listener));
    this.server = this._servers[0] || null;

    await this._checkListenersAvailability();

    const startedListeners: ApiServer[] = [];

    try {
      for (let i = 0; i < this._servers.length; i += 1) {
        const listenerServer = this._servers[i]!;
        const listener = this.config.listeners[i];

        if (listener && this.config.logLevel) {
          this.logger.info({
            listener: listener.name,
            bind: listener.bind,
            protocols: this._buildListenerProtocolSummary(listener)
          }, `Starting listener ${listener.name}`);
        }

        await listenerServer.start();
        startedListeners.push(listenerServer);

        if (listener && this.config.logLevel) {
          this.logger.info({
            listener: listener.name,
            bind: listener.bind,
            protocolSummary: this._buildListenerProtocolSummary(listener)
          }, `Listener ${listener.name} is up`);
        }
      }
    } catch (err) {
      for (const startedListener of startedListeners) {
        await startedListener.stop();
      }

      this._servers = [];
      this.server = null;
      throw err;
    }

    this.emit('plugin.started', {
      port: this.config.port,
      host: this.config.host
    });
  }

  private async _checkListenersAvailability(): Promise<void> {
    const checkedTcp = new Set<string>();
    const checkedUdp = new Set<string>();

    for (const listener of this.config.listeners) {
      const bindKey = `${listener.bind.host}:${listener.bind.port}`;
      const hasHttpOrWebSocket = listener.protocols.http.enabled || listener.protocols.websocket.enabled;
      const hasTcpTransport = listener.protocols.tcp.enabled;
      const hasTcpBasedTransport = hasHttpOrWebSocket || hasTcpTransport;
      const hasUdpTransport = listener.protocols.udp.enabled;

      if (listener.protocols.tcp.enabled && (listener.protocols.http.enabled || listener.protocols.websocket.enabled)) {
        throw new Error(
          `Listener "${listener.name}" cannot enable TCP together with HTTP or WebSocket on the same bind (${bindKey}). Use separate listeners for raw TCP.`
        );
      }

      if (hasTcpBasedTransport && !checkedTcp.has(bindKey)) {
        checkedTcp.add(bindKey);
        await this._checkTcpAvailability(listener.bind.port, listener.bind.host);
      }

      if (hasUdpTransport && !checkedUdp.has(bindKey)) {
        checkedUdp.add(bindKey);
        await this._checkUdpAvailability(listener.bind.port, listener.bind.host);
      }
    }
  }

  private async _checkTcpAvailability(port: number, host: string): Promise<void> {
    const { createServer } = await import('net');
    return new Promise((resolve, reject) => {
      const server = createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use. Please choose a different port or stop the process using it.`));
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        server.close(() => resolve());
      });

      server.listen(port, host);
    });
  }

  private async _checkUdpAvailability(port: number, host: string): Promise<void> {
    const { createSocket } = await import('node:dgram');
    return new Promise((resolve, reject) => {
      const socket = createSocket(host.includes(':') ? 'udp6' : 'udp4');
      const onError = (err: NodeJS.ErrnoException) => {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          reject(new Error(`UDP bind on ${host}:${port} is already in use. Please choose a different port or stop the process using it.`));
        } else {
          reject(err);
        }
      };

      socket.once('error', onError);
      socket.bind(port, host, () => {
        socket.removeListener('error', onError);
        socket.close(() => resolve());
      });
    });
  }

  override async onStop(): Promise<void> {
    if (this.config.logLevel) {
      this.logger.info('Stopping server...');
    }

    for (const runningServer of this._servers) {
      await runningServer.stop();
    }
    this._servers = [];
    this.server = null;
  }

  private _resolveUsersResourceName(): string {
    return resolveResourceName('api', {
      defaultName: this._usersResourceDescriptor.defaultName,
      override: this._usersResourceDescriptor.override ?? undefined
    }, {
      namespace: this.namespace ?? undefined
    });
  }

  override onNamespaceChanged(): void {
    this.usersResourceName = this._resolveUsersResourceName();
    if (this.config?.auth) {
      this.config.auth.resource = this.usersResourceName;
    }
    for (const runningServer of this._servers) {
      if ((runningServer as unknown as { failban?: { setNamespace: (ns: string) => void } })?.failban) {
        (runningServer as unknown as { failban: { setNamespace: (ns: string) => void } }).failban.setNamespace(this.namespace ?? '');
      }
    }
  }

  override async onUninstall(options: UninstallOptions = {}): Promise<void> {
    const { purgeData = false } = options;

    await this.onStop();

    if (purgeData && this.usersResource) {
      const [ok] = await tryFn(() => (this.database as unknown as DatabaseLike).deleteResource(this.usersResourceName));
      if (ok && this.config.logLevel) {
        this.logger.info({ usersResourceName: this.usersResourceName }, 'Deleted resource');
      }
    }

    if (this.config.logLevel) {
      this.logger.info('Uninstalled successfully');
    }
  }

  private _isProtocolEnabled(protocolConfig: ApiListenerConfigInputProtocol | boolean | undefined): boolean {
    if (protocolConfig === undefined) {
      return false;
    }

    if (typeof protocolConfig === 'boolean') {
      return protocolConfig;
    }

    return protocolConfig.enabled !== false;
  }

  private _buildListenerProtocolSummary(listener: ApiListenerConfig): {
    http: { enabled: boolean; path: string };
    websocket: { enabled: boolean; path: string; maxPayloadBytes: number; hasHandlers: boolean };
    tcp: { enabled: boolean; hasHandlers: { onConnection: boolean; onData: boolean; onClose: boolean; onError: boolean } };
    udp: { enabled: boolean; maxMessageBytes: number; hasHandlers: boolean };
    custom: Record<string, { enabled: boolean; path?: string; maxPayloadBytes?: number; maxMessageBytes?: number }>;
  } {
    const custom: Record<string, { enabled: boolean; path?: string; maxPayloadBytes?: number; maxMessageBytes?: number }> = {};

    Object.entries(listener.protocols.custom).forEach(([name, protocol]) => {
      const config = this._isProtocolEnabled(protocol);
      if (!config) {
        return;
      }

      const details: { enabled: boolean; path?: string; maxPayloadBytes?: number; maxMessageBytes?: number } = {
        enabled: true
      };

      if (typeof protocol === 'object' && protocol !== null) {
        if (protocol.path) {
          details.path = protocol.path;
        }
        if (protocol.maxPayloadBytes) {
          details.maxPayloadBytes = protocol.maxPayloadBytes;
        }
        if (protocol.maxMessageBytes) {
          details.maxMessageBytes = protocol.maxMessageBytes;
        }
      }

      custom[name] = details;
    });

    return {
      http: {
        enabled: listener.protocols.http.enabled,
        path: listener.protocols.http.path
      },
      websocket: {
        enabled: listener.protocols.websocket.enabled,
        path: listener.protocols.websocket.path,
        maxPayloadBytes: listener.protocols.websocket.maxPayloadBytes,
        hasHandlers: !!(
          listener.protocols.websocket.onConnection
          || listener.protocols.websocket.onMessage
          || listener.protocols.websocket.onClose
        )
      },
      tcp: {
        enabled: listener.protocols.tcp.enabled,
        hasHandlers: {
          onConnection: !!listener.protocols.tcp.onConnection,
          onData: !!listener.protocols.tcp.onData,
          onClose: !!listener.protocols.tcp.onClose,
          onError: !!listener.protocols.tcp.onError
        }
      },
      udp: {
        enabled: listener.protocols.udp.enabled,
        maxMessageBytes: listener.protocols.udp.maxMessageBytes,
        hasHandlers: !!(
          listener.protocols.udp.onMessage
          || listener.protocols.udp.onError
        )
      },
      custom
    };
  }

  getServerInfo(): ServerInfo {
    return this.server ? this.server.getInfo() : { isRunning: false };
  }

  getApp(): HttpApp | null {
    return this.server ? this.server.getApp() : null;
  }

  async previewRuntime(): Promise<ApiRuntimeInspectionPreview> {
    return await this._withPreviewServer((server) => server.previewRuntime());
  }

  async doctor() {
    return await this._withPreviewServer((server) => server.doctor());
  }

  async contractTests() {
    return await this._withPreviewServer((server) => server.contractTests());
  }

  private _mergeBasePaths(listenerBasePath?: string): string {
    const globalBasePath = normalizeBasePath(this.config.basePath);
    const listenerBase = normalizeBasePath(listenerBasePath);
    if (!globalBasePath) {
      return listenerBase;
    }
    return `${globalBasePath}${listenerBase}`;
  }

  private _createApiServer(listener: ApiListenerConfig): ApiServer {
    const routeRegistry = new ApiRouteRegistry();
    const mergedHttpBasePath = this._mergeBasePaths(listener.protocols.http.path);
    const mergedWebSocketPath = this._mergeBasePaths(listener.protocols.websocket.path);
    const mergedTcpEnabled = listener.protocols.tcp.enabled;

    return new ApiServer({
      listenerName: listener.name,
      port: listener.bind.port,
      host: listener.bind.host,
      httpEnabled: listener.protocols.http.enabled,
      database: this.database as any,
      namespace: this.namespace,
      basePath: mergedHttpBasePath,
      versionPrefix: this.config.versionPrefix,
      resources: this.config.resources,
      routes: this.config.routes,
      templates: this.config.templates,
      middlewares: this.compiledMiddlewares,
      cors: this.config.cors as unknown as Record<string, unknown> & { enabled: boolean },
      security: this.config.security as unknown as Record<string, unknown> & { enabled: boolean },
      requestId: this.config.requestId,
      sessionTracking: this.config.sessionTracking,
      events: this.config.events,
      metrics: this.config.metrics,
      failban: this.config.failban,
      static: this.config.static,
      health: this.config.health,
      maxBodySize: this.config.maxBodySize,
      logLevel: this.config.logLevel || undefined,
      auth: this.config.auth,
      compression: this.config.compression,
      rootRoute: this.config.rootRoute,
      docs: this.config.docs,
      startupBanner: this.config.startupBanner,
      logger: this.logger,
      websocket: listener.protocols.websocket.enabled ? {
        enabled: true,
        path: mergedWebSocketPath,
        maxPayloadBytes: listener.protocols.websocket.maxPayloadBytes,
        heartbeatInterval: (listener.protocols.websocket as any).heartbeatInterval,
        channels: (listener.protocols.websocket as any).channels,
        auth: (listener.protocols.websocket as any).auth,
        compression: (listener.protocols.websocket as any).compression,
        backpressure: (listener.protocols.websocket as any).backpressure,
        recovery: (listener.protocols.websocket as any).recovery,
        onConnection: listener.protocols.websocket.onConnection,
        onMessage: listener.protocols.websocket.onMessage,
        onClose: listener.protocols.websocket.onClose
      } : undefined,
      tcp: mergedTcpEnabled ? {
        enabled: true,
        onConnection: listener.protocols.tcp.onConnection,
        onData: listener.protocols.tcp.onData,
        onClose: listener.protocols.tcp.onClose,
        onError: listener.protocols.tcp.onError
      } : undefined,
      udp: listener.protocols.udp.enabled ? {
        enabled: true,
        maxMessageBytes: listener.protocols.udp.maxMessageBytes,
        onMessage: listener.protocols.udp.onMessage,
        onError: listener.protocols.udp.onError
      } : undefined,
      customProtocols: listener.protocols.custom,
      routeRegistry
    });
  }

  private async _withPreviewServer<T>(fn: (server: ApiServer) => Promise<T>): Promise<T> {
    if (this.server) {
      return await fn(this.server);
    }

    if (!this.database) {
      throw new Error('ApiPlugin preview requires the plugin to be attached to a database via usePlugin().');
    }

    const primaryListener = this.config.listeners[0];
    if (!primaryListener) {
      throw new Error('ApiPlugin preview could not resolve a primary listener.');
    }
    const previewServer = this._createApiServer(primaryListener);
    return await fn(previewServer);
  }
}

export { OIDCClient } from './auth/oidc-client.js';

export {
  createToken,
  verifyToken,
  createRefreshToken,
  verifyRefreshToken,
  jwtRefresh,
  createAuthMiddleware,
  generateApiKey,
  createOAuth2Handler,
  clearJWKSCache
} from './auth/index.js';

export type { JWTConfig, JWTPayload, LoginResult, UserRecord } from './auth/jwt-auth.js';
export type { HeaderSecretConfig } from './auth/header-secret-auth.js';
export type { OAuth2Config, OAuth2User, OAuth2Handler } from './auth/oauth2-auth.js';
export type { ClientCredentialsConfig, AuthRoutesConfig } from './routes/auth-routes.js';
export * from './concerns/guards-helpers.js';

export { setupTemplateEngine, ejsEngine, pugEngine, jsxEngine } from './utils/template-engine.js';

export { OpenGraphHelper } from './concerns/opengraph-helper.js';

export {
  NotificationStateMachine,
  AttemptStateMachine,
  createNotificationStateMachine,
  createAttemptStateMachine
} from './concerns/state-machine.js';

export { RouteContext, createRouteContext, withContext } from './concerns/route-context.js';
export type { ApiRuntimeInspectionPreview } from './runtime-inspection.js';

export { errorResponse, successResponse } from './utils/route-helper.js';

export { createContextInjectionMiddleware } from './middlewares/context-injection.js';

export {
  HttpBadRequestError,
  HttpValidationError,
  HttpUnauthorizedError,
  HttpForbiddenError,
  HttpNotFoundError,
  HttpMethodNotAllowedError,
  HttpConflictError,
  HttpUnprocessableEntityError,
  HttpTooManyRequestsError,
  HttpInternalServerError,
  HttpNotImplementedError,
  HttpServiceUnavailableError,
  HTTP_ERRORS,
  createHttpError
} from './errors.js';

export {
  getChunkedCookie,
  setChunkedCookie,
  deleteChunkedCookie,
  isChunkedCookie,
  initCookieChunking,
  CookieChunkOverflowError,
  type CookieOptions,
  type ChunkingOptions,
  type CookieChunkOverflowDetails
} from './concerns/cookie-chunking.js';
