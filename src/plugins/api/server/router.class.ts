import type { Context, HttpApp as HttpAppType, MiddlewareHandler } from '#src/plugins/shared/http-runtime.js';
import type { Logger, LogLevel } from '../../../concerns/logger.js';
import { createResourceRoutes, createRelationalRoutes } from '../routes/resource-routes.js';
import { createAuthRoutes } from '../routes/auth-routes.js';
import { mountCustomRoutes, parseRouteKey } from '../utils/custom-routes.js';
import * as formatter from '../../shared/response-formatter.js';
import { createFilesystemHandler, validateFilesystemConfig } from '../utils/static-filesystem.js';
import { createS3Handler, validateS3Config } from '../utils/static-s3.js';
import { createFailbanAdminRoutes } from '../middlewares/failban.js';
import { createContextInjectionMiddleware } from '../middlewares/context-injection.js';
import { createVersionAdapterMiddleware } from '../middlewares/version-adapter.js';
import { applyBasePath } from '../utils/base-path.js';
import { createLogger } from '../../../concerns/logger.js';
import { ApiRouteRegistry } from '../route-registry.js';
import { assertNoLegacyResourceRoutes, getResourceCustomRoutes } from '../utils/resource-custom-routes.js';
import type { AuthConfig, DocsConfig } from '../types.internal.js';

type HttpAppConstructor = new () => HttpAppType;

export interface VersionAdapter {
  response?: (data: Record<string, unknown>) => Record<string, unknown>;
  request?: (data: Record<string, unknown>) => Record<string, unknown>;
  deprecated?: boolean;
  sunset?: string;
}

export interface VersionsConfig {
  current?: string;
  adapters: Record<string, VersionAdapter>;
}

export interface ResourceConfig {
  enabled?: boolean;
  versionPrefix?: string | boolean;
  auth?: boolean | string[];
  customMiddleware?: MiddlewareHandler | MiddlewareHandler[];
  methods?: string[];
  validation?: boolean;
  relations?: Record<string, { expose?: boolean }>;
  versions?: VersionsConfig;
  [key: string]: unknown;
}

export interface ResourceLike {
  config?: {
    currentVersion?: string;
    versionPrefix?: string | boolean;
    methods?: string[];
    validation?: boolean;
    routes?: Record<string, unknown>;
    [key: string]: unknown;
  };
  version?: string;
  [key: string]: unknown;
}

export interface RoutesConfig {
  [path: string]: unknown;
}

export interface StaticConfig {
  driver: 'filesystem' | 's3';
  path: string;
  root?: string;
  bucket?: string;
  prefix?: string;
  spa?: boolean;
  pwa?: boolean;
  config?: {
    index?: string[];
    fallback?: string | boolean;
    dotfiles?: 'ignore' | 'allow' | 'deny';
    fallbackIgnore?: string[];
    maxAge?: number;
    etag?: boolean;
    cors?: boolean;
    streaming?: boolean;
    signedUrlExpiry?: number;
    cacheControl?: string;
    contentDisposition?: string;
  };
}

export interface FailbanPlugin {
  [key: string]: unknown;
}

export interface MetricsPlugin {
  options?: {
    enabled?: boolean;
    format?: string;
  };
  getPrometheusMetrics?: () => string;
  getSummary?: () => Record<string, unknown>;
}

export interface RelationConfig {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
  resource: string;
  [key: string]: unknown;
}

export interface RelationsPlugin {
  relations?: Record<string, Record<string, RelationConfig>>;
  database?: DatabaseLike;
  populate?(resource: unknown, items: unknown, includes: Record<string, unknown>): Promise<void>;
}

export interface EventEmitter {
  emitResourceEvent(event: string, data: Record<string, unknown>): void;
}

export interface DatabaseLike {
  resources: Record<string, ResourceLike>;
  client?: {
    client?: unknown;
  };
  pluginRegistry?: Record<string, unknown>;
}

export interface RouteSummary {
  resource: string;
  path: string;
  methods: string[];
  authEnabled: boolean;
  authConfig?: boolean | string[];
}

export interface RouterOptions {
  database: DatabaseLike;
  resources?: Record<string, ResourceConfig>;
  routes?: RoutesConfig;
  versionPrefix?: string | boolean;
  basePath?: string;
  auth?: AuthConfig;
  static?: StaticConfig[];
  failban?: FailbanPlugin;
  metrics?: MetricsPlugin;
  relationsPlugin?: RelationsPlugin;
  authMiddleware?: MiddlewareHandler;
  logLevel?: string;
  logger?: Logger;
  HttpApp: HttpAppConstructor;
  docs?: Pick<DocsConfig, 'enabled' | 'title' | 'description'>;
  rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
  routeRegistry: ApiRouteRegistry;
}

export class Router {
  private database: DatabaseLike;
  private resources: Record<string, ResourceConfig>;
  private routes: RoutesConfig;
  private versionPrefix: string | boolean | undefined;
  private basePath: string;
  private auth: AuthConfig | undefined;
  private staticConfigs: StaticConfig[];
  private failban: FailbanPlugin | undefined;
  private metrics: MetricsPlugin | undefined;
  private relationsPlugin: RelationsPlugin | undefined;
  private authMiddleware: MiddlewareHandler | undefined;
  private logLevel: string | undefined;
  private logger: Logger;
  private HttpApp: HttpAppConstructor;
  private docs: Pick<DocsConfig, 'enabled' | 'title' | 'description'>;
  private rootRoute: boolean | ((c: Context) => Response | Promise<Response>) | undefined;
  private routeSummaries: RouteSummary[];
  private routeRegistry: ApiRouteRegistry;

  constructor({
    database,
    resources,
    routes,
    versionPrefix,
    basePath = '',
    auth,
    static: staticConfigs,
    failban,
    metrics,
    relationsPlugin,
    authMiddleware,
    logLevel,
    logger,
    HttpApp,
    docs,
    rootRoute,
    routeRegistry
  }: RouterOptions) {
    this.database = database;
    this.resources = resources || {};
    this.routes = routes || {};
    this.versionPrefix = versionPrefix;
    this.basePath = basePath || '';
    this.auth = auth;
    this.staticConfigs = staticConfigs || [];
    this.failban = failban;
    this.metrics = metrics;
    this.relationsPlugin = relationsPlugin;
    this.authMiddleware = authMiddleware;
    this.logLevel = logLevel;

    if (logger) {
      this.logger = logger;
    } else {
      this.logger = createLogger({
        name: 'Router',
        level: (logLevel || 'info') as LogLevel
      });
    }

    this.HttpApp = HttpApp;
    this.docs = {
      enabled: docs?.enabled !== false,
      title: docs?.title || 's3db.js API',
      description: docs?.description || 'Auto-generated REST API for s3db.js resources'
    };
    this.rootRoute = rootRoute;
    this.routeSummaries = [];
    this.routeRegistry = routeRegistry;
  }

  mount(app: HttpAppType, events: EventEmitter): void {
    const contextInjection = createContextInjectionMiddleware(this.database as unknown as Parameters<typeof createContextInjectionMiddleware>[0]);
    app.use('*', contextInjection);

    this.logger?.debug('Context injection middleware registered (resources accessible via c.get())');

    this.mountRootRoute(app);
    this.mountStaticRoutes(app);
    this.mountResourceRoutes(app, events);
    this.mountAuthRoutes(app);
    this.mountRelationalRoutes(app);
    this.mountCustomRoutes(app);
    this.mountAdminRoutes(app);
  }

  private mountRootRoute(app: HttpAppType): void {
    if (this.rootRoute === false) {
      this.logger?.debug('Root route disabled via config.rootRoute = false');
      return;
    }

    const rootPath = this._withBasePath('/');

    if (typeof this.rootRoute === 'function') {
      app.get(rootPath, this.rootRoute);
      this.routeRegistry.register({
        kind: 'root',
        path: rootPath,
        methods: ['GET'],
        tags: ['System'],
        sourceKind: 'programmatic'
      });
      this.logger?.debug({ path: rootPath }, `Mounted custom root handler at ${rootPath}`);
      return;
    }

    const docsPath = this._withBasePath('/docs');
    app.get(rootPath, (c: Context) => {
      const html = this._createSplashScreen(docsPath);
      return c.html(html);
    });

    this.routeRegistry.register({
      kind: 'root',
      path: rootPath,
      methods: ['GET'],
      tags: ['System'],
      sourceKind: 'programmatic'
    });

    this.logger?.debug({ path: rootPath }, `Mounted default splash screen at ${rootPath}`);
  }

  private _createSplashScreen(docsPath: string): string {
    const title = this.docs.title;
    const description = this.docs.description;
    const docsLink = this.docs.enabled
      ? `<a href="${docsPath}" class="docs-link">📚 View API Documentation</a>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 60px 40px;
      max-width: 600px;
      text-align: center;
      animation: fadeIn 0.5s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .logo {
      font-size: 72px;
      margin-bottom: 20px;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.05);
      }
    }

    h1 {
      color: #2d3748;
      font-size: 36px;
      margin-bottom: 16px;
      font-weight: 700;
    }

    .description {
      color: #718096;
      font-size: 18px;
      line-height: 1.6;
      margin-bottom: 40px;
    }

    .docs-link {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }

    .docs-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }

    .footer {
      margin-top: 60px;
      padding-top: 30px;
      border-top: 1px solid #e2e8f0;
      color: #a0aec0;
      font-size: 14px;
    }

    .footer a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s ease;
    }

    .footer a:hover {
      color: #764ba2;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #f0fdf4;
      color: #166534;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 30px;
    }

    .status::before {
      content: '●';
      color: #22c55e;
      animation: blink 2s ease-in-out infinite;
    }

    @keyframes blink {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🚀</div>
    <div class="status">API Online</div>
    <h1>${title}</h1>
    <p class="description">${description}</p>
    ${docsLink}
    <div class="footer">
      Powered by <a href="https://github.com/forattini-dev/s3db.js" target="_blank">s3db.js</a>
    </div>
  </div>
</body>
</html>`;
  }

  private resolveResourcePrefix(resourceName: string, resource: ResourceLike, version: string): string {
    const resourceConfig = this.resources[resourceName];
    let versionPrefixConfig: string | boolean | undefined;

    if (resourceConfig && resourceConfig.versionPrefix !== undefined) {
      versionPrefixConfig = resourceConfig.versionPrefix;
    } else if (resource.config && resource.config.versionPrefix !== undefined) {
      versionPrefixConfig = resource.config.versionPrefix;
    } else if (this.versionPrefix !== undefined) {
      versionPrefixConfig = this.versionPrefix;
    } else {
      versionPrefixConfig = false;
    }

    if (versionPrefixConfig === true) {
      return version;
    }
    if (versionPrefixConfig === false) {
      return '';
    }
    if (typeof versionPrefixConfig === 'string') {
      return versionPrefixConfig;
    }
    return '';
  }

  private mountResourceRoutes(app: HttpAppType, events: EventEmitter): void {
    const databaseResources = this.database.resources;
    this.routeSummaries = [];

    for (const [name, resource] of Object.entries(databaseResources)) {
      const resourceConfig = this.resources[name];
      const isPluginResource = name.startsWith('plg_');

      if (isPluginResource && !resourceConfig) {
        this.logger?.debug({ resourceName: name }, `Skipping internal resource '${name}' (not included in config.resources)`);
        continue;
      }

      if (resourceConfig?.enabled === false) {
        this.logger?.debug({ resourceName: name }, `Resource '${name}' disabled via config.resources`);
        continue;
      }

      const version = resource.config?.currentVersion || resource.version || 'v1';
      const prefix = this.resolveResourcePrefix(name, resource, version);

      const middlewares: MiddlewareHandler[] = [];
      assertNoLegacyResourceRoutes(name, resource.config?.routes as Record<string, unknown> | undefined);
      const authDisabled = resourceConfig?.auth === false;

      if (this.authMiddleware && !authDisabled) {
        middlewares.push(this.authMiddleware);
      }

      const extraMiddleware = resourceConfig?.customMiddleware;
      if (extraMiddleware) {
        const toRegister = Array.isArray(extraMiddleware) ? extraMiddleware : [extraMiddleware];

        for (const middleware of toRegister) {
          if (typeof middleware === 'function') {
            middlewares.push(middleware);
          } else {
            this.logger?.warn({ resourceName: name }, `Ignoring non-function middleware for resource '${name}'`);
          }
        }
      }

      let methods = resourceConfig?.methods || resource.config?.methods;
      if (!Array.isArray(methods) || methods.length === 0) {
        methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
      } else {
        methods = methods
          .filter(Boolean)
          .map(method => typeof method === 'string' ? method.toUpperCase() : method);
      }

      const resourceApp = createResourceRoutes(
        resource as unknown as Parameters<typeof createResourceRoutes>[0],
        version,
        {
          methods,
          customMiddleware: middlewares,
          versionPrefix: prefix,
          events,
          relationsPlugin: this.relationsPlugin as unknown
        } as Parameters<typeof createResourceRoutes>[2],
        this.HttpApp as unknown as Parameters<typeof createResourceRoutes>[3]
      );

      const mountPath = prefix ? `/${prefix}/${name}` : `/${name}`;
      const fullMountPath = this._withBasePath(mountPath);

      const resourceCustomRoutes = getResourceCustomRoutes(resource.config?.api as Record<string, unknown> | undefined);
      if (resourceCustomRoutes.length > 0) {
        this.registerCustomRouteEntries(Object.fromEntries(
          resourceCustomRoutes.map((route) => [route.key, route.handler])
        ), {
          kind: 'resource-custom',
          pathPrefix: fullMountPath,
          resource: name
        });
      }

      app.route(fullMountPath, resourceApp as unknown as HttpAppType);

      this.routeRegistry.register({
        kind: 'resource',
        path: fullMountPath,
        methods: methods as string[],
        resource: name,
        authEnabled: !!this.authMiddleware && !authDisabled,
        authConfig: resourceConfig?.auth,
        tags: [name],
        sourceKind: 'rest-resource',
        auth: {
          required: !!this.authMiddleware && !authDisabled,
          mode: !!this.authMiddleware && !authDisabled ? 'required' : 'optional',
          drivers: Array.isArray(resourceConfig?.auth)
            ? resourceConfig.auth.map((value) => String(value))
            : undefined
        }
      });

      this.logger?.debug({ resourceName: name, path: fullMountPath, methods }, `Mounted routes for resource '${name}' at ${fullMountPath}`);

      const schemaVersions = (resource as unknown as { $schema?: { api?: { versions?: VersionsConfig } } }).$schema?.api?.versions;
      const pluginVersions = resourceConfig?.versions;
      const versionsConfig = pluginVersions || schemaVersions;

      if (versionsConfig) {
        const currentVersion = versionsConfig.current
          || resource.config?.currentVersion
          || resource.version
          || 'v1';

        if (!prefix) {
          const currentMountPath = this._withBasePath(`/${currentVersion}/${name}`);
          app.route(currentMountPath, resourceApp as unknown as HttpAppType);
          this.routeRegistry.register({
            kind: 'resource',
            path: currentMountPath,
            methods: methods as string[],
            resource: name,
            tags: [name],
            sourceKind: 'rest-resource',
            auth: {
              required: !!this.authMiddleware && !authDisabled,
              mode: !!this.authMiddleware && !authDisabled ? 'required' : 'optional',
              drivers: Array.isArray(resourceConfig?.auth)
                ? resourceConfig.auth.map((value) => String(value))
                : undefined
            }
          });
          this.logger?.debug({ resourceName: name, path: currentMountPath }, `Mounted current version alias '${currentVersion}' for resource '${name}'`);
        }

        for (const [versionKey, adapter] of Object.entries(versionsConfig.adapters)) {
          const versionedApp = createResourceRoutes(
            resource as unknown as Parameters<typeof createResourceRoutes>[0],
            versionKey,
            {
              methods,
              customMiddleware: [...middlewares, createVersionAdapterMiddleware(adapter, versionKey)],
              versionPrefix: versionKey,
              events,
              relationsPlugin: this.relationsPlugin as unknown
            } as Parameters<typeof createResourceRoutes>[2],
            this.HttpApp as unknown as Parameters<typeof createResourceRoutes>[3]
          );

          const versionedMountPath = this._withBasePath(`/${versionKey}/${name}`);
          app.route(versionedMountPath, versionedApp as unknown as HttpAppType);

          this.routeRegistry.register({
            kind: 'resource',
            path: versionedMountPath,
            methods: methods as string[],
            resource: name,
            tags: [name],
            sourceKind: 'rest-resource',
            deprecated: adapter.deprecated === true,
            auth: {
              required: !!this.authMiddleware && !authDisabled,
              mode: !!this.authMiddleware && !authDisabled ? 'required' : 'optional',
              drivers: Array.isArray(resourceConfig?.auth)
                ? resourceConfig.auth.map((value) => String(value))
                : undefined
            }
          });

          this.logger?.debug({ resourceName: name, path: versionedMountPath, deprecated: adapter.deprecated }, `Mounted versioned route '${versionKey}' for resource '${name}'`);
        }
      }

      this.routeSummaries.push({
        resource: name,
        path: fullMountPath,
        methods: methods as string[],
        authEnabled: !!this.authMiddleware && !authDisabled,
        authConfig: resourceConfig?.auth
      });
    }
  }

  private mountAuthRoutes(app: HttpAppType): void {
    const drivers = this.auth?.drivers || [];
    const resourceName = this.auth?.resource || null;
    const usernameField = this.auth?.usernameField;
    const passwordField = this.auth?.passwordField;
    const registration = this.auth?.registration;
    const loginThrottle = this.auth?.loginThrottle;
    const skipRoutes = this.auth?.skipRoutes;

    if (drivers.length === 0) {
      this.logger?.warn('Auth not configured or empty drivers; skipping built-in auth routes');
      return;
    }

    if (skipRoutes) {
      this.logger?.debug('auth.skipRoutes is true; skipping built-in auth routes (middleware still active)');
      return;
    }

    const oidcDriver = drivers?.find(d => d.driver === 'oidc');
    if (oidcDriver) {
      this.logger?.debug('OIDC driver detected. Skipping JWT auth routes (OIDC provides /auth/login).');
      return;
    }

    const jwtDriver = drivers?.find(d => d.driver === 'jwt');

    if (!jwtDriver) {
      return;
    }

    const authResource = this.database.resources[resourceName!];
    if (!authResource) {
      this.logger.error(`[API Router] Auth resource '${resourceName}' not found. Skipping auth routes.`);
      return;
    }

    const driverConfig = jwtDriver.config || {};
    const lookupById = (driverConfig as Record<string, unknown>).lookupById === true;
    const registrationConfig = {
      enabled: (driverConfig as Record<string, unknown>).allowRegistration === true ||
        ((driverConfig as Record<string, { enabled?: boolean }>).registration)?.enabled === true ||
        registration?.enabled === true,
      allowedFields: Array.isArray(((driverConfig as Record<string, { allowedFields?: string[] }>).registration)?.allowedFields)
        ? ((driverConfig as Record<string, { allowedFields?: string[] }>).registration)!.allowedFields
        : Array.isArray(registration?.allowedFields)
          ? registration!.allowedFields
          : [],
      defaultRole: ((driverConfig as Record<string, { defaultRole?: string }>).registration)?.defaultRole ??
        registration?.defaultRole ??
        'user'
    };

    const driverLoginThrottle = (driverConfig as Record<string, Record<string, unknown>>).loginThrottle || {};
    const loginThrottleConfig = {
      enabled: (driverLoginThrottle as Record<string, boolean>).enabled ?? loginThrottle?.enabled ?? true,
      maxAttempts: (driverLoginThrottle as Record<string, number>).maxAttempts || loginThrottle?.maxAttempts || 5,
      windowMs: (driverLoginThrottle as Record<string, number>).windowMs || loginThrottle?.windowMs || 60_000,
      blockDurationMs: (driverLoginThrottle as Record<string, number>).blockDurationMs || loginThrottle?.blockDurationMs || 300_000,
      maxEntries: (driverLoginThrottle as Record<string, number>).maxEntries || loginThrottle?.maxEntries || 10_000
    };

    const authConfig = {
      driver: 'jwt' as const,
      drivers,
      usernameField,
      passwordField,
      jwtSecret: (driverConfig as Record<string, string>).jwtSecret || (driverConfig as Record<string, string>).secret,
      jwtExpiresIn: (driverConfig as Record<string, string>).jwtExpiresIn || (driverConfig as Record<string, string>).expiresIn || '7d',
      jwtRefreshExpiresIn: (driverConfig as Record<string, string>).jwtRefreshExpiresIn || (driverConfig as Record<string, string>).refreshExpiresIn || '30d',
      passphrase: (driverConfig as Record<string, string>).passphrase || 'secret',
      lookupById,
      allowRegistration: registrationConfig.enabled,
      registration: registrationConfig,
      loginThrottle: loginThrottleConfig,
      clientCredentials: (driverConfig as Record<string, unknown>).clientCredentials || {}
    };

    const authApp = createAuthRoutes(
      authResource as unknown as Parameters<typeof createAuthRoutes>[0],
      authConfig as unknown as Parameters<typeof createAuthRoutes>[1],
      this.authMiddleware as unknown as Parameters<typeof createAuthRoutes>[2]
    );

    const authPath = this._withBasePath('/auth');

    app.route(authPath, authApp as unknown as HttpAppType);

    this.routeRegistry.registerMany([
      { kind: 'auth', path: `${authPath}/register`, methods: ['POST'], tags: ['Authentication'], sourceKind: 'programmatic' },
      { kind: 'auth', path: `${authPath}/login`, methods: ['POST'], tags: ['Authentication'], sourceKind: 'programmatic' },
      { kind: 'auth', path: `${authPath}/token/refresh`, methods: ['POST'], tags: ['Authentication'], sourceKind: 'programmatic' },
      { kind: 'auth', path: `${authPath}/me`, methods: ['GET'], tags: ['Authentication'], sourceKind: 'programmatic' },
      { kind: 'auth', path: `${authPath}/api-key/regenerate`, methods: ['POST'], tags: ['Authentication'], sourceKind: 'programmatic' },
      { kind: 'auth', path: `${authPath}/token`, methods: ['POST'], tags: ['Authentication'], sourceKind: 'programmatic' }
    ]);

    this.logger?.debug({ path: authPath, driver: 'jwt' }, `Mounted auth routes (driver: jwt) at ${authPath}`);
  }

  private mountStaticRoutes(app: HttpAppType): void {
    if (!this.staticConfigs || this.staticConfigs.length === 0) {
      return;
    }

    if (!Array.isArray(this.staticConfigs)) {
      throw new Error('Static config must be an array of mount points');
    }

    for (const [index, config] of this.staticConfigs.entries()) {
      try {
        if (!config.driver) {
          throw new Error(`static[${index}]: "driver" is required (filesystem or s3)`);
        }

        if (!config.path) {
          throw new Error(`static[${index}]: "path" is required (mount path)`);
        }

        if (!config.path.startsWith('/')) {
          throw new Error(`static[${index}]: "path" must start with / (got: ${config.path})`);
        }

        const driverConfig = (config.config || {}) as Record<string, unknown>;
        const isSpaMode = config.spa || config.pwa;
        const mountedPath = config.path;
        const routePattern = mountedPath === '/' ? '/*' : `${mountedPath}/*`;
        const fallbackValue = isSpaMode && driverConfig.fallback === undefined ? 'index.html' : driverConfig.fallback;
        const fallbackIgnoreValue = isSpaMode
          ? this._mergeFallbackIgnoreWithDefaults(Array.isArray(driverConfig.fallbackIgnore) ? driverConfig.fallbackIgnore : [])
          : driverConfig.fallbackIgnore;

        let handler: MiddlewareHandler;

        if (config.driver === 'filesystem') {
          validateFilesystemConfig({
            ...config,
            ...driverConfig,
            fallback: fallbackValue as string | boolean | undefined,
            fallbackIgnore: fallbackIgnoreValue as string[] | undefined
          });

          const indexValue = driverConfig.index;
          const indexArray = typeof indexValue === 'string' ? [indexValue] : (indexValue as string[] | undefined);
          handler = createFilesystemHandler({
            root: config.root!,
            mountPath: mountedPath,
            index: indexArray,
            fallback: fallbackValue as string | boolean | undefined,
            fallbackIgnore: fallbackIgnoreValue as string[] | undefined,
            maxAge: driverConfig.maxAge as number | undefined,
            dotfiles: driverConfig.dotfiles as 'ignore' | 'allow' | 'deny' | undefined,
            etag: driverConfig.etag as boolean | undefined,
            cors: driverConfig.cors as boolean | undefined
          });

        } else if (config.driver === 's3') {
          validateS3Config({
            ...config,
            ...driverConfig,
            fallback: fallbackValue as string | boolean | undefined,
            fallbackIgnore: fallbackIgnoreValue as string[] | undefined
          });

          const s3Client = (this.database as unknown as { client?: { client?: unknown } })?.client?.client;

          if (!s3Client) {
            throw new Error(`static[${index}]: S3 driver requires database with S3 client`);
          }

          handler = createS3Handler({
            s3Client: s3Client as Parameters<typeof createS3Handler>[0]['s3Client'],
            bucket: config.bucket!,
            mountPath: mountedPath,
            prefix: config.prefix,
            index: typeof driverConfig.index === 'string' ? [driverConfig.index] : driverConfig.index as string[] | undefined,
            fallback: fallbackValue as string | boolean | undefined,
            fallbackIgnore: fallbackIgnoreValue as string[] | undefined,
            streaming: driverConfig.streaming as boolean | undefined,
            signedUrlExpiry: driverConfig.signedUrlExpiry as number | undefined,
            maxAge: driverConfig.maxAge as number | undefined,
            cacheControl: driverConfig.cacheControl as string | undefined,
            contentDisposition: driverConfig.contentDisposition as string | undefined,
            etag: driverConfig.etag as boolean | undefined,
            cors: driverConfig.cors as boolean | undefined
          });

        } else {
          throw new Error(
            `static[${index}]: invalid driver "${config.driver}". Valid drivers: filesystem, s3`
          );
        }

        app.get(routePattern, handler);
        // Use on() for HEAD - fallback to get() if on() not available (bundling issues)
        if (typeof (app as any).on === 'function') {
          (app as any).on('HEAD', routePattern, handler);
        }

        this.routeRegistry.register({
          kind: 'static',
          path: routePattern,
          methods: ['GET', 'HEAD'],
          tags: ['Static Files'],
          sourceKind: 'programmatic'
        });

        const source = config.driver === 'filesystem' ? config.root : `s3://${config.bucket}/${config.prefix || ''}`;
        this.logger?.debug({ driver: config.driver, path: mountedPath, source }, `Mounted static files (${config.driver}) at ${mountedPath} -> ${source}`);

      } catch (err) {
        this.logger.error({ index, error: (err as Error).message }, `[API Router] Failed to setup static files for index ${index}`);
        throw err;
      }
    }
  }

  private _normalizeFallbackIgnorePrefix(prefix: string): string {
    if (!prefix || prefix === '/') {
      return '';
    }

    return `/${prefix.replace(/^\/+|\/+$/g, '')}`;
  }

  private _normalizeBasePathForFallbackIgnore(): string[] {
    const paths = new Set<string>(['/api', '/auth', '/ws', '/socket', '/rpc', '/health', '/docs', '/.well-known']);

    const normalizedBasePath = this._normalizeFallbackIgnorePrefix(this.basePath);
    if (normalizedBasePath) {
      paths.add(normalizedBasePath);
      paths.add(`${normalizedBasePath}/api`);
      paths.add(`${normalizedBasePath}/auth`);
      paths.add(`${normalizedBasePath}/ws`);
      paths.add(`${normalizedBasePath}/socket`);
      paths.add(`${normalizedBasePath}/rpc`);
      paths.add(`${normalizedBasePath}/health`);
      paths.add(`${normalizedBasePath}/docs`);
      paths.add(`${normalizedBasePath}/.well-known`);
    }

    return [...paths];
  }

  private _mergeFallbackIgnoreWithDefaults(fallbackIgnore: string[]): string[] {
    const baseDefaults = this._normalizeBasePathForFallbackIgnore();

    return [...new Set([
      ...fallbackIgnore.filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => this._normalizeFallbackIgnorePrefix(value)),
      ...baseDefaults
    ])];
  }

  private mountRelationalRoutes(app: HttpAppType): void {
    if (!this.relationsPlugin || !this.relationsPlugin.relations) {
      return;
    }

    const relations = this.relationsPlugin.relations;

    this.logger?.debug('Setting up relational routes...');

    for (const [resourceName, relationsDef] of Object.entries(relations)) {
      const resource = this.database.resources[resourceName]!;
      if (!resource) {
        this.logger?.warn({ resourceName }, `Resource '${resourceName}' not found for relational routes`);
        continue;
      }

      if (resourceName.startsWith('plg_') && !this.resources[resourceName]) {
        continue;
      }

      const version = resource.config?.currentVersion || resource.version || 'v1';
      const prefix = this.resolveResourcePrefix(resourceName, resource, version);

      for (const [relationName, relationConfig] of Object.entries(relationsDef)) {
        if (relationConfig.type === 'belongsTo') {
          continue;
        }

        const resourceConfig = this.resources[resourceName];
        const exposeRelation = resourceConfig?.relations?.[relationName]?.expose !== false;

        if (!exposeRelation) {
          continue;
        }

        const relationalApp = createRelationalRoutes(
          resource as unknown as Parameters<typeof createRelationalRoutes>[0],
          relationName,
          relationConfig as unknown as Parameters<typeof createRelationalRoutes>[2],
          version,
          this.HttpApp as unknown as Parameters<typeof createRelationalRoutes>[4]
        );

        const relationPath = this._withBasePath(
          prefix ? `/${prefix}/${resourceName}/:id/${relationName}` : `/${resourceName}/:id/${relationName}`
        );
        app.route(relationPath, relationalApp as unknown as HttpAppType);

        this.routeRegistry.register({
          kind: 'relation',
          path: relationPath,
          methods: ['GET'],
          resource: resourceName,
          relation: relationName,
          tags: [resourceName],
          sourceKind: 'rest-resource'
        });

        this.logger?.debug({ path: relationPath, type: relationConfig.type, targetResource: relationConfig.resource }, `Mounted relational route: ${relationPath} (${relationConfig.type} -> ${relationConfig.resource})`);
      }
    }
  }

  private mountCustomRoutes(app: HttpAppType): void {
    if (!this.routes || Object.keys(this.routes).length === 0) {
      return;
    }

    const context = {
      database: this.database,
      plugins: this.database?.pluginRegistry || {}
    };

    mountCustomRoutes(app as unknown as Parameters<typeof mountCustomRoutes>[0], this.routes as unknown as Parameters<typeof mountCustomRoutes>[1], context, this.logLevel, {
      pathPrefix: this.basePath
    });
    this.registerCustomRouteEntries(this.routes as Record<string, unknown>, {
      kind: 'plugin-custom',
      pathPrefix: this.basePath
    });

    const routeCount = Object.keys(this.routes).length;
    this.logger?.debug({ routeCount }, `Mounted ${routeCount} plugin-level custom routes`);
  }

  private mountAdminRoutes(app: HttpAppType): void {
    const metricsEnabled = this.metrics?.options?.enabled ?? false;
    if (metricsEnabled) {
      const metricsPath = this._withBasePath('/metrics');
      const metricsFormat = (this.metrics?.options?.format || 'json').toLowerCase();
      app.get(metricsPath, (c: Context) => {
        if (metricsFormat === 'prometheus') {
          const body = this.metrics!.getPrometheusMetrics!();
          c.header('Content-Type', 'text/plain; version=0.0.4');
          return c.body(body);
        }
        const summary = this.metrics!.getSummary!();
        const response = formatter.success(summary);
        return c.json(response);
      });

      this.routeRegistry.register({
        kind: 'metrics',
        path: metricsPath,
        methods: ['GET'],
        tags: ['Metrics'],
        sourceKind: 'programmatic'
      });

      this.logger?.debug({ path: metricsPath, format: metricsFormat }, `Metrics endpoint enabled at ${metricsPath}`);
    }

    if (this.failban) {
      const failbanAdminRoutes = createFailbanAdminRoutes(this.HttpApp as unknown as Parameters<typeof createFailbanAdminRoutes>[0], this.failban as unknown as Parameters<typeof createFailbanAdminRoutes>[1]);
      const failbanPath = this._withBasePath('/admin/security');
      app.route(failbanPath, failbanAdminRoutes as unknown as HttpAppType);

      this.routeRegistry.registerMany([
        { kind: 'admin', path: `${failbanPath}/bans`, methods: ['GET', 'POST'], tags: ['Administration'], sourceKind: 'programmatic' },
        { kind: 'admin', path: `${failbanPath}/bans/:ip`, methods: ['GET', 'DELETE'], tags: ['Administration'], sourceKind: 'programmatic' },
        { kind: 'admin', path: `${failbanPath}/stats`, methods: ['GET'], tags: ['Administration'], sourceKind: 'programmatic' }
      ]);

      this.logger?.debug({ path: failbanPath }, `Failban admin endpoints enabled at ${failbanPath}`);
    }
  }

  private registerCustomRouteEntries(
    routes: Record<string, unknown> | null | undefined,
    {
      kind,
      pathPrefix = '',
      resource
    }: {
      kind: 'plugin-custom' | 'resource-custom';
      pathPrefix?: string;
      resource?: string;
    }
  ): void {
    if (!routes || typeof routes !== 'object') {
      return;
    }

    for (const [key, handler] of Object.entries(routes)) {
      if (typeof handler !== 'function') {
        continue;
      }

      try {
        const parsed = parseRouteKey(key);
        const relativePath = parsed.path === '/' ? '' : parsed.path;
        const fullPath = relativePath ? `${pathPrefix}${relativePath}` : pathPrefix;

        this.routeRegistry.register({
          kind,
          path: fullPath || '/',
          methods: [parsed.method],
          resource,
          originalKey: key,
          tags: kind === 'resource-custom'
            ? [resource || 'Resources']
            : ['Custom Routes'],
          sourceKind: kind === 'resource-custom' ? 'rest-resource' : 'programmatic',
          sourceLocation: key
        });
      } catch {
        continue;
      }
    }
  }

  private _withBasePath(path: string): string {
    return applyBasePath(this.basePath, path);
  }

  getRouteSummaries(): RouteSummary[] {
    return this.routeSummaries.slice();
  }
}
