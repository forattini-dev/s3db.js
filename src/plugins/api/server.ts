/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and delegates routing/middleware concerns
 * to dedicated components (MiddlewareChain, Router, HealthManager).
 */

import type { Context, MiddlewareHandler, Hono } from 'hono';
import type { Server } from 'node:http';
import type { NetworkInterfaceInfo } from 'node:os';
import type { Logger } from '../../concerns/logger.js';
import { networkInterfaces } from 'node:os';
import { errorHandler } from '../shared/error-handler.js';
import * as formatter from '../shared/response-formatter.js';
import { createOIDCHandler } from './auth/oidc-auth.js';
import { createSessionStore } from './concerns/session-store-factory.js';
import { FailbanManager } from '../../concerns/failban-manager.js';
import { bumpProcessMaxListeners } from '../../concerns/process-max-listeners.js';
import { validatePathAuth } from './utils/path-matcher.js';
import { ApiEventEmitter } from './concerns/event-emitter.js';
import { MetricsCollector } from './concerns/metrics-collector.js';
import { MiddlewareChain } from './server/middleware-chain.class.js';
import { Router } from './server/router.class.js';
import { HealthManager } from './server/health-manager.class.js';
import { OpenAPIGeneratorCached } from './utils/openapi-generator-cached.class.js';
import { AuthStrategyFactory } from './auth/strategies/factory.class.js';
import { applyBasePath } from './utils/base-path.js';

export interface ApiServerOptions {
  port?: number;
  host?: string;
  database?: DatabaseLike;
  namespace?: string | null;
  basePath?: string;
  versionPrefix?: string | boolean;
  resources?: Record<string, unknown>;
  routes?: Record<string, unknown>;
  templates?: { enabled: boolean; engine: string };
  middlewares?: MiddlewareHandler[];
  cors?: { enabled: boolean; [key: string]: unknown };
  security?: { enabled: boolean; [key: string]: unknown };
  sessionTracking?: { enabled: boolean; [key: string]: unknown };
  requestId?: { enabled: boolean; [key: string]: unknown };
  httpLogger?: { enabled: boolean; [key: string]: unknown };
  events?: { enabled: boolean; logLevel?: string; maxListeners?: number; [key: string]: unknown };
  metrics?: {
    enabled: boolean;
    logLevel?: string;
    maxPathsTracked?: number;
    resetInterval?: number;
    format?: string;
    [key: string]: unknown;
  };
  failban?: {
    enabled: boolean;
    maxViolations?: number;
    violationWindow?: number;
    banDuration?: number;
    whitelist?: string[];
    blacklist?: string[];
    persistViolations?: boolean;
    logLevel?: string;
    geo?: Record<string, unknown>;
    resourceNames?: Record<string, string>;
    [key: string]: unknown;
  };
  static?: StaticConfig[];
  health?: { enabled: boolean; [key: string]: unknown };
  logLevel?: string;
  auth?: AuthConfig;
  docsEnabled?: boolean;
  docsUI?: string;
  docsCsp?: string | null;
  apiTitle?: string;
  apiVersion?: string;
  apiDescription?: string;
  maxBodySize?: number;
  startupBanner?: boolean;
  rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
  compression?: { enabled: boolean; threshold?: number };
  logger?: Logger;
  docs?: {
    enabled?: boolean;
    ui?: string;
    title?: string;
    version?: string;
    description?: string;
    csp?: string | null;
  };
}

export interface StaticConfig {
  path: string;
  root: string;
  [key: string]: unknown;
}

export interface AuthConfig {
  drivers?: DriverConfig[];
  resource?: string;
  pathAuth?: PathAuthConfig[];
  pathRules?: PathRuleConfig[];
  [key: string]: unknown;
}

export interface DriverConfig {
  driver: string;
  config?: Record<string, unknown>;
}

export interface PathAuthConfig {
  pattern?: string;
  path?: string;
  required?: boolean;
  drivers?: string[];
}

export interface PathRuleConfig {
  pattern: string;
  auth?: string[] | boolean;
  methods?: string[];
  [key: string]: unknown;
}

export interface DatabaseLike {
  resources?: Record<string, ResourceLike>;
  s3dbVersion?: string;
  pluginRegistry?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResourceLike {
  name?: string;
  [key: string]: unknown;
}

export interface ServerInfo {
  address: string;
  port: number;
}

export interface RouteSummary {
  path: string;
  methods: string[];
  authEnabled: boolean;
  authConfig?: string[] | boolean;
}

export interface OIDCConfig {
  sessionStore?: SessionStoreConfig | SessionStore;
  [key: string]: unknown;
}

export interface SessionStoreConfig {
  driver: string;
  config?: Record<string, unknown>;
}

export interface SessionStore {
  get(id: string): Promise<unknown>;
  set(id: string, data: unknown, ttl: number): Promise<void>;
  destroy(id: string): Promise<void>;
}

export class ApiServer {
  private options: Required<Pick<ApiServerOptions, 'port' | 'host'>> & ApiServerOptions;
  private logger: Logger;
  private app: Hono | null = null;
  private server: Server | null = null;
  private isRunning = false;
  private initialized = false;
  private oidcMiddleware: MiddlewareHandler | null = null;
  private middlewareChain: MiddlewareChain | null = null;
  router: Router | null = null;
  private healthManager: HealthManager | null = null;
  private inFlightRequests = new Set<string>();
  private acceptingRequests = true;
  events: ApiEventEmitter;
  metrics: MetricsCollector;
  failban: FailbanManager | null = null;
  private relationsPlugin: unknown;
  private openApiGenerator: OpenAPIGeneratorCached;
  private Hono: typeof Hono | null = null;
  private serve: ((options: unknown, callback?: (info: ServerInfo) => void) => Server) | null = null;
  private swaggerUI: ((options: { url: string }) => MiddlewareHandler) | null = null;
  private cors: ((options: unknown) => MiddlewareHandler) | null = null;
  private ApiApp: unknown = null;
  private _signalHandlersSetup = false;
  private _boundSigtermHandler: (() => void) | null = null;
  private _boundSigintHandler: (() => void) | null = null;
  private _metricsListeners: Map<string, (data: any) => void> = new Map();

  constructor(options: ApiServerOptions = {}) {
    this.options = {
      port: options.port || 3000,
      host: options.host || '0.0.0.0',
      database: options.database,
      namespace: options.namespace || null,
      basePath: options.basePath || '',
      versionPrefix: options.versionPrefix,
      resources: options.resources || {},
      routes: options.routes || {},
      templates: options.templates || { enabled: false, engine: 'jsx' },
      middlewares: options.middlewares || [],
      cors: options.cors || { enabled: false },
      security: options.security || { enabled: false },
      sessionTracking: options.sessionTracking || { enabled: false },
      requestId: options.requestId || { enabled: false },
      httpLogger: options.httpLogger || { enabled: false },
      events: options.events || { enabled: false },
      metrics: options.metrics || { enabled: false },
      failban: options.failban || { enabled: false },
      static: Array.isArray(options.static) ? options.static : [],
      health: options.health ?? { enabled: true },
      logLevel: options.logLevel || 'info',
      auth: options.auth || {},
      docsEnabled: (options.docs?.enabled !== false) && (options.docsEnabled !== false),
      docsUI: options.docs?.ui || options.docsUI || 'redoc',
      docsCsp: options.docsCsp || options.docs?.csp || null,
      apiTitle: options.docs?.title || options.apiTitle || 's3db.js API',
      apiVersion: options.docs?.version || options.apiVersion || '1.0.0',
      apiDescription: options.docs?.description || options.apiDescription || 'Auto-generated REST API for s3db.js resources',
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024,
      startupBanner: options.startupBanner !== false,
      rootRoute: options.rootRoute,
      compression: options.compression || { enabled: false }
    };

    this.logger = options.logger!;

    this.events = new ApiEventEmitter({
      enabled: this.options.events?.enabled !== false,
      logLevel: this.options.events?.logLevel || this.options.logLevel,
      maxListeners: this.options.events?.maxListeners
    });

    this.metrics = new MetricsCollector({
      enabled: this.options.metrics?.enabled !== false,
      logLevel: this.options.metrics?.logLevel || this.options.logLevel,
      maxPathsTracked: this.options.metrics?.maxPathsTracked,
      resetInterval: this.options.metrics?.resetInterval,
      format: (this.options.metrics?.format || 'json') as 'json' | 'prometheus'
    });

    if (this.options.metrics?.enabled && this.options.events?.enabled !== false) {
      this._setupMetricsEventListeners();
    }

    if (this.options.failban?.enabled) {
      this.failban = new FailbanManager({
        database: this.options.database as unknown,
        namespace: this.options.namespace as string | undefined,
        enabled: true,
        maxViolations: this.options.failban.maxViolations || 3,
        violationWindow: this.options.failban.violationWindow || 3600000,
        banDuration: this.options.failban.banDuration || 86400000,
        whitelist: this.options.failban.whitelist || ['127.0.0.1', '::1'],
        blacklist: this.options.failban.blacklist || [],
        persistViolations: this.options.failban.persistViolations !== false,
        logLevel: (this.options.failban.logLevel || this.options.logLevel) as 'debug' | 'info' | 'warn' | 'error',
        geo: this.options.failban.geo || {},
        resourceNames: this.options.failban.resourceNames as Record<string, string> | undefined,
        logger: this.logger
      } as ConstructorParameters<typeof FailbanManager>[0]);
    }

    this.relationsPlugin = this.options.database?.pluginRegistry?.relation ||
      this.options.database?.pluginRegistry?.RelationPlugin ||
      null;

    const resolvedHost = (this.options.host || 'localhost') === '0.0.0.0'
      ? 'localhost'
      : (this.options.host || 'localhost');

    this.openApiGenerator = new OpenAPIGeneratorCached({
      database: this.options.database as ConstructorParameters<typeof OpenAPIGeneratorCached>[0]['database'],
      app: this.app as ConstructorParameters<typeof OpenAPIGeneratorCached>[0]['app'],
      logger: this.logger,
      options: {
        auth: this.options.auth as ConstructorParameters<typeof OpenAPIGeneratorCached>[0]['options']['auth'],
        resources: this.options.resources as ConstructorParameters<typeof OpenAPIGeneratorCached>[0]['options']['resources'],
        routes: this.options.routes,
        versionPrefix: this.options.versionPrefix,
        basePath: this.options.basePath,
        title: this.options.apiTitle,
        version: this.options.apiVersion,
        description: this.options.apiDescription,
        serverUrl: `http://${resolvedHost}:${this.options.port}`,
        logLevel: this.options.logLevel
      }
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      if (this.options.logLevel) {
        this.logger.warn('Server is already running');
      }
      return;
    }

    if (!this.initialized) {
      const { Hono } = await import('hono');
      const { serve } = await import('@hono/node-server');
      const { swaggerUI } = await import('@hono/swagger-ui');
      const { cors } = await import('hono/cors');
      const { ApiApp } = await import('./app.class.js');

      this.Hono = Hono;
      this.serve = serve as unknown as typeof this.serve;
      this.swaggerUI = swaggerUI;
      this.cors = cors as unknown as typeof this.cors;
      this.ApiApp = ApiApp;

      this.app = new (ApiApp as unknown as new (options: unknown) => Hono)({
        db: this.options.database,
        resources: this.options.database?.resources
      });

      if (this.failban) {
        await this.failban.initialize();
      }

      this._registerMetricsPluginRoute();

      this.middlewareChain = new MiddlewareChain({
        requestId: this.options.requestId,
        cors: this.options.cors,
        security: this.options.security,
        sessionTracking: this.options.sessionTracking,
        middlewares: this.options.middlewares,
        templates: this.options.templates,
        maxBodySize: this.options.maxBodySize || 10 * 1024 * 1024,
        failban: this.failban as unknown as ConstructorParameters<typeof MiddlewareChain>[0]['failban'],
        events: this.events as ConstructorParameters<typeof MiddlewareChain>[0]['events'],
        logLevel: this.options.logLevel,
        logger: this.logger,
        httpLogger: this.options.httpLogger,
        database: this.options.database as ConstructorParameters<typeof MiddlewareChain>[0]['database'],
        inFlightRequests: this.inFlightRequests as unknown as Set<symbol>,
        acceptingRequests: () => this.acceptingRequests,
        corsMiddleware: this.cors as ConstructorParameters<typeof MiddlewareChain>[0]['corsMiddleware']
      });
      this.middlewareChain.apply(this.app!);

      const oidcDriver = this.options.auth?.drivers?.find((d) => d.driver === 'oidc');
      if (oidcDriver) {
        await this._setupOIDCRoutes(oidcDriver.config as OIDCConfig);
      }

      const authMiddleware = await this._createAuthMiddleware();

      this._setupDocumentationRoutes();

      if (this.options.health?.enabled !== false) {
        this.healthManager = new HealthManager({
          database: this.options.database as ConstructorParameters<typeof HealthManager>[0]['database'],
          healthConfig: this.options.health as ConstructorParameters<typeof HealthManager>[0]['healthConfig'],
          logLevel: this.options.logLevel,
          logger: this.logger
        });
        this.healthManager.register(this.app!);
      }

      this.router = new Router({
        database: this.options.database as ConstructorParameters<typeof Router>[0]['database'],
        resources: this.options.resources as ConstructorParameters<typeof Router>[0]['resources'],
        routes: this.options.routes,
        versionPrefix: this.options.versionPrefix,
        basePath: this.options.basePath,
        auth: this.options.auth,
        static: this.options.static as ConstructorParameters<typeof Router>[0]['static'],
        failban: this.failban as unknown as ConstructorParameters<typeof Router>[0]['failban'],
        metrics: this.metrics as unknown as ConstructorParameters<typeof Router>[0]['metrics'],
        relationsPlugin: this.relationsPlugin as unknown as ConstructorParameters<typeof Router>[0]['relationsPlugin'],
        authMiddleware: authMiddleware as unknown as ConstructorParameters<typeof Router>[0]['authMiddleware'],
        logLevel: this.options.logLevel,
        logger: this.logger,
        Hono: this.Hono as unknown as ConstructorParameters<typeof Router>[0]['Hono'],
        apiTitle: this.options.apiTitle,
        apiDescription: this.options.apiDescription,
        docsEnabled: this.options.docsEnabled,
        rootRoute: this.options.rootRoute
      });
      this.router.mount(this.app! as unknown as Parameters<Router['mount']>[0], this.events as unknown as Parameters<Router['mount']>[1]);

      this.app!.onError((err: Error, c: Context) => (errorHandler as (err: Error, c: Context) => Response)(err, c));
      this.app!.notFound((c: Context) => {
        const response = formatter.error('Route not found', {
          status: 404,
          code: 'NOT_FOUND',
          details: {
            path: c.req.path,
            method: c.req.method
          }
        });
        return c.json(response, 404);
      });

      this.initialized = true;
    }

    const { port, host } = this.options;

    let fetchHandler = (this.app as any).fetch;
    if (this.options.compression?.enabled) {
      const { threshold = 1024 } = this.options.compression;
      const { gzipSync, deflateSync } = await import('node:zlib');
      const baseFetch = (this.app as any).fetch;

      fetchHandler = async (req: Request, env?: unknown, ctx?: unknown): Promise<Response> => {
        const res = await baseFetch(req, env, ctx);

        const existingEncoding = res.headers.get('content-encoding');
        if (existingEncoding) return res;

        const acceptEncoding = req.headers.get('accept-encoding') || '';
        const wantsGzip = acceptEncoding.includes('gzip');
        const wantsDeflate = acceptEncoding.includes('deflate');
        if (!wantsGzip && !wantsDeflate) return res;

        const contentType = res.headers.get('content-type') || '';
        const isTextLike = contentType.startsWith('text/') || contentType.includes('json');
        if (!isTextLike) return res;

        const source = typeof res.clone === 'function' ? res.clone() : res;
        const buffer = Buffer.from(await source.arrayBuffer());
        if (buffer.length < threshold) {
          if (source === res) {
            const headers = new Headers(res.headers);
            return new Response(buffer, {
              status: res.status,
              statusText: res.statusText,
              headers
            });
          }
          return res;
        }

        const encoding = wantsGzip ? 'gzip' : 'deflate';
        const compressed = encoding === 'gzip' ? gzipSync(buffer) : deflateSync(buffer);
        const headers = new Headers(res.headers);
        headers.set('Content-Encoding', encoding);
        headers.set('Vary', 'Accept-Encoding');
        headers.delete('Content-Length');

        return new Response(new Uint8Array(compressed), {
          status: res.status,
          statusText: res.statusText,
          headers
        });
      };
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = this.serve!(
          {
            fetch: fetchHandler,
            port,
            hostname: host,
            keepAliveTimeout: 65000,
            headersTimeout: 66000
          },
          (info: ServerInfo) => {
            this.isRunning = true;
            if (this.options.logLevel) {
              this.logger.info({ address: info.address, port: info.port }, 'Server listening');
            }
            this._printStartupBanner(info);

            const shutdownHandler = async (signal: string) => {
              if (this.options.logLevel) {
                this.logger.info({ signal }, 'Received shutdown signal');
              }
              try {
                await this.shutdown({ timeout: 30000 });
                process.exit(0);
              } catch (err) {
                if (this.options.logLevel) {
                  this.logger.error({ error: (err as Error).message }, 'Error during shutdown');
                }
                process.exit(1);
              }
            };

            if (!this._signalHandlersSetup) {
              this._boundSigtermHandler = () => shutdownHandler('SIGTERM');
              this._boundSigintHandler = () => shutdownHandler('SIGINT');
              bumpProcessMaxListeners(2);
              process.once('SIGTERM', this._boundSigtermHandler);
              process.once('SIGINT', this._boundSigintHandler);
              this._signalHandlersSetup = true;
            }

            resolve();
          }
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      if (this.options.logLevel) {
        this.logger.warn('Server is not running');
      }
      return;
    }

    if (this.server && typeof this.server.close === 'function') {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          this.isRunning = false;
          if (this.options.logLevel) {
            this.logger.info('Server stopped');
          }
          resolve();
        });
      });
    } else {
      this.isRunning = false;
      if (this.options.logLevel) {
        this.logger.info('Server stopped');
      }
    }

    if (this.metrics) {
      this.metrics.stop();
    }

    this._removeMetricsEventListeners();

    if (this.failban) {
      await this.failban.cleanup();
    }

    if (this.oidcMiddleware && typeof (this.oidcMiddleware as unknown as { destroy?: () => void }).destroy === 'function') {
      (this.oidcMiddleware as unknown as { destroy: () => void }).destroy();
    }

    if (this._signalHandlersSetup) {
      if (this._boundSigtermHandler) {
        process.removeListener('SIGTERM', this._boundSigtermHandler);
        this._boundSigtermHandler = null;
      }
      if (this._boundSigintHandler) {
        process.removeListener('SIGINT', this._boundSigintHandler);
        this._boundSigintHandler = null;
      }
      this._signalHandlersSetup = false;
      bumpProcessMaxListeners(-2);
    }
  }

  getInfo(): { isRunning: boolean; port: number; host: string; resources: number } {
    return {
      isRunning: this.isRunning,
      port: this.options.port,
      host: this.options.host,
      resources: Object.keys(this.options.database?.resources || {}).length
    };
  }

  getApp(): Hono | null {
    return this.app;
  }

  stopAcceptingRequests(): void {
    this.acceptingRequests = false;
    if (this.options.logLevel) {
      this.logger.info('Stopped accepting new requests');
    }
  }

  private _registerMetricsPluginRoute(): void {
    const metricsPlugin = this.options.database?.pluginRegistry?.metrics ||
                          this.options.database?.pluginRegistry?.MetricsPlugin;

    if (!metricsPlugin) return;

    const config = (metricsPlugin as { config?: { prometheus?: { enabled?: boolean; mode?: string; path?: string; enforceIpAllowlist?: boolean; ipAllowlist?: string[] } } }).config;
    if (!config?.prometheus?.enabled) return;

    const mode = config.prometheus.mode;
    if (mode !== 'integrated' && mode !== 'auto') return;

    const path = config.prometheus.path || '/metrics';
    const enforceIpAllowlist = config.prometheus.enforceIpAllowlist;
    const ipAllowlist = config.prometheus.ipAllowlist || [];

    this.app!.get(path, async (c: Context) => {
      if (enforceIpAllowlist) {
        const { isIpAllowed, getClientIp } = await import('../concerns/ip-allowlist.js');
        const clientIp = getClientIp(c as unknown as Parameters<typeof getClientIp>[0]);

        if (!clientIp || !isIpAllowed(clientIp, ipAllowlist)) {
          if (this.options.logLevel) {
            this.logger.warn(
              { clientIp: clientIp || 'unknown' },
              'Blocked /metrics request from unauthorized IP'
            );
          }
          return c.text('Forbidden', 403);
        }
      }

      try {
        const metrics = await (metricsPlugin as { getPrometheusMetrics: () => Promise<string> }).getPrometheusMetrics();
        return c.text(metrics, 200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
        });
      } catch (err) {
        if (this.options.logLevel) {
          this.logger.error({ error: (err as Error).message }, 'Error generating Prometheus metrics');
        }
        return c.text('Internal Server Error', 500);
      }
    });

    if (this.options.logLevel) {
      const ipFilter = enforceIpAllowlist ? ` (IP allowlist: ${ipAllowlist.length} ranges)` : ' (no IP filtering)';
      this.logger.debug(
        { path, ipFilter, ipAllowlistSize: ipAllowlist.length },
        'Registered MetricsPlugin route'
      );
    }
  }

  async waitForRequestsToFinish({ timeout = 30000 } = {}): Promise<boolean> {
    const startTime = Date.now();

    while (this.inFlightRequests.size > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        if (this.options.logLevel) {
          this.logger.warn({ inFlightCount: this.inFlightRequests.size }, 'Timeout waiting for in-flight requests');
        }
        return false;
      }

      if (this.options.logLevel) {
        this.logger.debug({ inFlightCount: this.inFlightRequests.size }, 'Waiting for in-flight requests');
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.options.logLevel) {
      this.logger.info('All requests finished');
    }

    return true;
  }

  async shutdown({ timeout = 30000 } = {}): Promise<void> {
    if (!this.isRunning) {
      if (this.options.logLevel) {
        this.logger.warn('Server is not running');
      }
      return;
    }

    if (this.options.logLevel) {
      this.logger.info('Initiating graceful shutdown');
    }
    this.stopAcceptingRequests();

    const finished = await this.waitForRequestsToFinish({ timeout });
    if (!finished) {
      if (this.options.logLevel) {
        this.logger.warn({ inFlightCount: this.inFlightRequests.size }, 'Some requests did not finish in time');
      }
    }

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    this.isRunning = false;
    if (this.options.logLevel) {
      this.logger.info('Shutdown complete');
    }
  }

  private _setupMetricsEventListeners(): void {
    const requestEndHandler = (data: { method: string; path: string; status: number; duration: number }) => {
      this.metrics.recordRequest({
        method: data.method,
        path: data.path,
        status: data.status,
        duration: data.duration
      });
    };
    this._metricsListeners.set('request:end', requestEndHandler);
    this.events.on('request:end', requestEndHandler);

    const requestErrorHandler = (data: { error: Error }) => {
      this.metrics.recordError({
        error: data.error.message,
        type: 'request'
      });
    };
    this._metricsListeners.set('request:error', requestErrorHandler);
    this.events.on('request:error', requestErrorHandler);

    const authSuccessHandler = (data: { method: string }) => {
      this.metrics.recordAuth({
        success: true,
        method: data.method
      });
    };
    this._metricsListeners.set('auth:success', authSuccessHandler);
    this.events.on('auth:success', authSuccessHandler);

    const authFailureHandler = (data: { allowedMethods?: string[] }) => {
      this.metrics.recordAuth({
        success: false,
        method: data.allowedMethods?.[0] || 'unknown'
      });
    };
    this._metricsListeners.set('auth:failure', authFailureHandler);
    this.events.on('auth:failure', authFailureHandler);

    const resourceCreatedHandler = (data: { resource: string }) => {
      this.metrics.recordResourceOperation({
        action: 'created',
        resource: data.resource
      });
    };
    this._metricsListeners.set('resource:created', resourceCreatedHandler);
    this.events.on('resource:created', resourceCreatedHandler);

    const resourceUpdatedHandler = (data: { resource: string }) => {
      this.metrics.recordResourceOperation({
        action: 'updated',
        resource: data.resource
      });
    };
    this._metricsListeners.set('resource:updated', resourceUpdatedHandler);
    this.events.on('resource:updated', resourceUpdatedHandler);

    const resourceDeletedHandler = (data: { resource: string }) => {
      this.metrics.recordResourceOperation({
        action: 'deleted',
        resource: data.resource
      });
    };
    this._metricsListeners.set('resource:deleted', resourceDeletedHandler);
    this.events.on('resource:deleted', resourceDeletedHandler);

    const userCreatedHandler = () => {
      this.metrics.recordUserEvent({ action: 'created' });
    };
    this._metricsListeners.set('user:created', userCreatedHandler);
    this.events.on('user:created', userCreatedHandler);

    const userLoginHandler = () => {
      this.metrics.recordUserEvent({ action: 'login' });
    };
    this._metricsListeners.set('user:login', userLoginHandler);
    this.events.on('user:login', userLoginHandler);

    if (this.options.logLevel) {
      this.logger.debug('Metrics event listeners configured');
    }
  }

  private _removeMetricsEventListeners(): void {
    for (const [event, handler] of this._metricsListeners) {
      this.events.removeListener(event, handler);
    }
    this._metricsListeners.clear();
  }

  private _setupDocumentationRoutes(): void {
    if (this.options.logLevel) {
      this.logger.debug({ docsEnabled: this.options.docsEnabled, docsUI: this.options.docsUI }, 'Setting up documentation routes');
    }

    const basePath = this.options.basePath || '';
    const openApiPath = applyBasePath(basePath, '/openapi.json');
    const docsPath = applyBasePath(basePath, '/docs');

    if (this.options.logLevel) {
      this.logger.debug({ docsPath, openApiPath }, 'Documentation paths configured');
    }

    if (this.options.docsEnabled) {
      if (this.options.logLevel) {
        this.logger.debug({ openApiPath }, 'Registering OpenAPI route');
      }
      this.app!.get(openApiPath, (c: Context) => {
        if (this.options.logLevel) {
          this.logger.debug('OpenAPI route hit');
        }
        const spec = this.openApiGenerator.generate();
        return c.json(spec);
      });
      if (this.options.logLevel) {
        this.logger.debug('OpenAPI route registered');
      }

      if (this.options.docsUI === 'swagger') {
        if (this.options.logLevel) {
          this.logger.debug({ docsPath }, 'Registering Swagger UI');
        }
        const swaggerHandler = this.swaggerUI!({ url: openApiPath });
        this.app!.get(docsPath, (c: Context) => {
          let cspHeader = this.options.docsCsp;
          if (!cspHeader) {
            cspHeader = [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              "connect-src 'self'"
            ].join('; ');
          }
          const res = swaggerHandler(c, async () => {}) as unknown as Response;
          if (res?.headers) {
            res.headers.set('Content-Security-Policy', cspHeader);
            res.headers.delete('Content-Security-Policy-Report-Only');
          }
          return res;
        });
      } else {
        if (this.options.logLevel) {
          this.logger.debug({ docsPath }, 'Registering Redoc UI');
        }
        this.app!.get(docsPath, (c: Context) => {
          if (this.options.logLevel) {
            this.logger.debug('Redoc docs route hit');
          }
          const redocCdn = 'https://cdn.redoc.ly';
          const fontsCss = 'https://fonts.googleapis.com';
          const fontsGstatic = 'https://fonts.gstatic.com';
          let cspHeader = this.options.docsCsp;
          if (!cspHeader) {
            cspHeader = [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' ${redocCdn}`,
              `script-src-elem 'self' 'unsafe-inline' ${redocCdn}`,
              `style-src 'self' 'unsafe-inline' ${redocCdn} ${fontsCss}`,
              "img-src 'self' data: https:",
              `font-src 'self' ${fontsGstatic}`,
              "connect-src 'self'"
            ].join('; ');
          }
          const html = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8">',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '  <title>' + String(this.options.apiTitle || 's3db.js API') + ' - API Documentation</title>',
            '  <style>',
            '    body { margin: 0; padding: 0; }',
            '  </style>',
            '</head>',
            '<body>',
            '  <redoc spec-url="' + String(openApiPath) + '"></redoc>',
            '  <script src="https://cdn.redoc.ly/redoc/v2.5.1/bundles/redoc.standalone.js"></script>',
            '</body>',
            '</html>'
          ].join('\n');
          const res = c.html(html);
          if (res?.headers) {
            res.headers.set('Content-Security-Policy', cspHeader);
            res.headers.delete('Content-Security-Policy-Report-Only');
          }
          return res;
        });
        if (this.options.logLevel) {
          this.logger.debug('Redoc UI route registered');
        }
      }
      if (this.options.logLevel) {
        this.logger.debug('Documentation routes setup complete');
      }
    }
  }

  private async _setupOIDCRoutes(config: OIDCConfig): Promise<void> {
    this.logger.debug({ hasConfig: !!config }, '[API] Setting up OIDC routes');
    const { database, auth } = this.options;
    const authResource = database?.resources?.[auth?.resource || ''];

    if (!authResource) {
      this.logger.error({ resource: auth?.resource }, 'Auth resource not found for OIDC');
      return;
    }

    let sessionStore: SessionStore | null = null;
    if (config.sessionStore) {
      try {
        if ((config.sessionStore as SessionStoreConfig).driver) {
          sessionStore = await createSessionStore(config.sessionStore as unknown as Parameters<typeof createSessionStore>[0], database as unknown as Parameters<typeof createSessionStore>[1]);

          if (this.options.logLevel) {
            this.logger.info({ driver: (config.sessionStore as SessionStoreConfig).driver }, 'Session store initialized');
          }
        } else {
          sessionStore = config.sessionStore as SessionStore;
        }
      } catch (err) {
        this.logger.error({ error: (err as Error).message }, 'Failed to create session store');
        throw err;
      }

      config.sessionStore = sessionStore as SessionStore;
    }

    const oidcHandler = await createOIDCHandler(config as unknown as Parameters<typeof createOIDCHandler>[0], this.app!, database as unknown as Parameters<typeof createOIDCHandler>[2], this.events);
    this.oidcMiddleware = oidcHandler.middleware;

    if (this.options.logLevel && oidcHandler.routes) {
      const routes = Object.entries(oidcHandler.routes).map(([path, description]) => ({ path, description }));
      this.logger.info({ routes }, 'Mounted OIDC routes');
    }
  }

  private async _createAuthMiddleware(): Promise<MiddlewareHandler | null> {
    const { database, auth } = this.options;
    const { drivers, resource: defaultResourceName, pathAuth, pathRules } = auth || {};

    if (!drivers || drivers.length === 0) {
      return null;
    }

    const authResource = database?.resources?.[defaultResourceName || ''];
    if (!authResource) {
      this.logger.error({ resource: defaultResourceName }, 'Auth resource not found for middleware');
      return null;
    }

    if (pathAuth) {
      try {
        validatePathAuth(pathAuth);
      } catch (err) {
        this.logger.error({ error: (err as Error).message }, 'Invalid pathAuth configuration');
        throw err;
      }
    }

    const strategy = AuthStrategyFactory.create({
      drivers,
      authResource: authResource as unknown as Parameters<typeof AuthStrategyFactory.create>[0]['authResource'],
      oidcMiddleware: this.oidcMiddleware || null,
      database: database as unknown as Parameters<typeof AuthStrategyFactory.create>[0]['database'],
      pathRules: pathRules as unknown as Parameters<typeof AuthStrategyFactory.create>[0]['pathRules'],
      pathAuth,
      events: this.events,
      logLevel: this.options.logLevel || 'info',
      logger: this.logger
    } as Parameters<typeof AuthStrategyFactory.create>[0]);

    try {
      return await strategy.createMiddleware();
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, 'Failed to create auth middleware');
      throw err;
    }
  }

  private _printStartupBanner(info: ServerInfo): void {
    if (this.options.startupBanner === false) {
      return;
    }

    const version = this.options.database?.s3dbVersion || 'latest';
    const basePath = this.options.basePath || '';
    const localHost = this._resolveLocalHostname();
    const localUrl = this._buildUrl(localHost, info.port, basePath);
    const networkHost = this._resolveNetworkHostname();
    const networkUrl = networkHost ? this._buildUrl(networkHost, info.port, basePath) : null;
    const docsPath = this.options.docsEnabled !== false
      ? (basePath ? `${basePath}/docs` : '/docs')
      : null;
    const docsUrl = docsPath ? this._buildUrl(localHost, info.port, docsPath) : null;

    const lines = [
      '',
      `  🗄️  s3db.js API ${version}`,
      `     - Local:    ${localUrl}`
    ];

    if (networkUrl && networkUrl !== localUrl) {
      lines.push(`     - Network:  ${networkUrl}`);
    }

    if (docsUrl) {
      lines.push(`     - Docs:     ${docsUrl}`);
    }

    const routeSummaries = this.router?.getRouteSummaries?.() || [];
    if (routeSummaries.length > 0) {
      lines.push('     Routes:');

      const globalDrivers = this.options.auth?.drivers?.map(d => d.driver === 'apiKey' ? 'apikey' : d.driver) || [];
      const maxPathLen = routeSummaries.reduce((max: number, r: RouteSummary) => Math.max(max, r.path.length), 0);

      routeSummaries.forEach((route: RouteSummary) => {
        const actions: string[] = [];
        const m = route.methods;
        if (m.includes('GET')) actions.push('list', 'show');
        if (m.includes('POST')) actions.push('create');
        if (m.includes('PATCH')) actions.push('update');
        if (m.includes('PUT')) actions.push('replace');
        if (m.includes('DELETE')) actions.push('delete');

        const actionStr = actions.join(', ');

        let authTag = '[public]';
        if (route.authEnabled) {
          let activeDrivers = globalDrivers;
          if (Array.isArray(route.authConfig)) {
             activeDrivers = globalDrivers.filter(d => (route.authConfig as string[]).includes(d) || (route.authConfig as string[]).includes(d === 'apikey' ? 'apiKey' : d));
          }

          authTag = activeDrivers.length > 0
            ? `[auth:${activeDrivers.join(',')}]`
            : '[auth:none]';
        }

        lines.push(`       ${route.path.padEnd(maxPathLen + 2)} ${authTag.padEnd(25)} ${actionStr}`);
      });
    }

    lines.push('');
    this.logger.info(lines.join('\n'));
  }

  private _resolveLocalHostname(): string {
    const host = this.options.host;
    if (!host || host === '0.0.0.0' || host === '::') {
      return 'localhost';
    }
    return host;
  }

  private _resolveNetworkHostname(): string | null {
    const host = this.options.host;
    if (host && host !== '0.0.0.0' && host !== '::') {
      return host;
    }
    return this._findLanAddress() || null;
  }

  private _findLanAddress(): string | null {
    const nets = networkInterfaces();
    for (const interfaceDetails of Object.values(nets)) {
      if (!interfaceDetails) continue;
      for (const detail of interfaceDetails as NetworkInterfaceInfo[]) {
        if (detail.family === 'IPv4' && !detail.internal) {
          return detail.address;
        }
      }
    }
    return null;
  }

  private _buildUrl(host: string | null, port: number, path: string = ''): string {
    if (!host) return '';
    const isIPv6 = host.includes(':') && !host.startsWith('[');
    const hostPart = isIPv6 ? `[${host}]` : host;
    const base = `http://${hostPart}:${port}`;

    if (!path) {
      return base;
    }

    const normalizedPath = path === '/'
      ? '/'
      : (path.startsWith('/') ? path : `/${path}`);

    if (normalizedPath === '/') {
      return `${base}/`;
    }

    return `${base}${normalizedPath}`;
  }

  _generateOpenAPISpec(): Record<string, unknown> {
    return this.openApiGenerator.generate() as unknown as Record<string, unknown>;
  }
}

export default ApiServer;
