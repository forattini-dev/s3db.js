/**
 * API Server - Raffel-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and delegates routing/middleware concerns
 * to dedicated components (MiddlewareChain, Router, HealthManager).
 */

import type { Context, MiddlewareHandler, HttpApp } from '#src/plugins/shared/http-runtime.js';
import { serve } from '#src/plugins/shared/http-runtime.js';
import type { Server } from 'node:http';
import type { NetworkInterfaceInfo } from 'node:os';
import type { Socket as UdpSocket } from 'node:dgram';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { Logger } from '../../concerns/logger.js';
import { networkInterfaces } from 'node:os';
import { createErrorHandler } from '../shared/error-handler.js';
import * as formatter from '../shared/response-formatter.js';
import { createOIDCHandler } from './auth/oidc-auth.js';
import { createSessionStore } from './concerns/session-store-factory.js';
import { FailbanManager } from '../../concerns/failban-manager.js';
import { bumpProcessMaxListeners } from '../../concerns/process-max-listeners.js';
import { ApiEventEmitter } from './concerns/event-emitter.js';
import { MetricsCollector } from './concerns/metrics-collector.js';
import { MiddlewareChain } from './server/middleware-chain.class.js';
import { Router } from './server/router.class.js';
import { HealthManager } from './server/health-manager.class.js';
import { OpenAPIGeneratorCached } from './utils/openapi-generator-cached.class.js';
import { AuthStrategyFactory } from './auth/strategies/factory.class.js';
import { applyBasePath } from './utils/base-path.js';
import { ApiRouteRegistry } from './route-registry.js';
import {
  buildApiRuntimeContractTests,
  buildApiRuntimeDoctorReport,
  buildApiRuntimeInspectionPreview,
  type ApiRuntimeInspectionPreview
} from './runtime-inspection.js';
import type {
  ApiListenerConfigInputProtocol,
  ApiListenerWebSocketConfig,
  ApiListenerUdpConfig,
  AuthConfig,
  AuthPathRule,
  DocsConfig
} from './types.internal.js';
import type { AuthRule } from './auth/path-rules-middleware.js';

export interface ApiServerOptions {
  port?: number;
  host?: string;
  listenerName?: string;
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
  maxBodySize?: number;
  startupBanner?: boolean;
  rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
  compression?: { enabled: boolean; threshold?: number };
  logger?: Logger;
  docs?: Partial<DocsConfig>;
  routeRegistry?: ApiRouteRegistry;
  websocket?: {
    enabled: boolean;
    path?: string;
    maxPayloadBytes?: number;
    onConnection?: (socket: unknown, request: unknown) => void;
    onMessage?: (socket: unknown, message: unknown, isBinary?: boolean) => void;
    onError?: (error: Error) => void;
  };
  udp?: {
    enabled: boolean;
    maxMessageBytes?: number;
    onMessage?: (message: Buffer, remoteInfo: { address: string; port: number; family: string; size: number }) => void;
    onError?: (error: Error) => void;
  };
  customProtocols?: Record<string, ApiListenerConfigInputProtocol | boolean>;
}

export interface StaticConfig {
  path: string;
  root: string;
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
  port: number;
  hostname: string;
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

function normalizeAuthPathRules(pathRules: AuthPathRule[] | undefined): AuthRule[] {
  if (!Array.isArray(pathRules)) {
    return [];
  }

  return pathRules
    .map((rule): AuthRule | null => {
      if (!rule || typeof rule !== 'object') {
        return null;
      }

      const path = typeof rule.path === 'string' ? rule.path.trim() : '';
      if (!path) {
        return null;
      }

      return {
        path,
        methods: Array.isArray(rule.methods)
          ? rule.methods
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
          : [],
        required: rule.required !== false,
        roles: rule.roles,
        scopes: rule.scopes,
        allowServiceAccounts: rule.allowServiceAccounts
      };
    })
    .filter((rule): rule is AuthRule => rule !== null);
}

function createDefaultAuthConfig(): AuthConfig {
  return {
    drivers: [],
    pathRules: [],
    strategy: 'any',
    priorities: {},
    registration: {
      enabled: false,
      allowedFields: [],
      defaultRole: 'user'
    },
    loginThrottle: {
      enabled: true,
      maxAttempts: 5,
      windowMs: 60_000,
      blockDurationMs: 300_000,
      maxEntries: 10_000
    },
    createResource: true,
    driver: null,
    resource: null,
    usersResourcePasswordValidation: 'password|required|minlength:8',
    enableIdentityContextMiddleware: true,
    usersResourceAttributes: {}
  };
}

export class ApiServer {
  public readonly customProtocols: Record<string, ApiListenerConfigInputProtocol | boolean>;
  private options: Required<Pick<ApiServerOptions, 'port' | 'host'>> & ApiServerOptions;
  private logger: Logger;
  private app: HttpApp | null = null;
  private server: Server | null = null;
  private isRunning = false;
  private initialized = false;
  private oidcMiddleware: MiddlewareHandler | null = null;
  private middlewareChain: MiddlewareChain | null = null;
  router: Router | null = null;
  private healthManager: HealthManager | null = null;
  private inFlightRequests = new Set<symbol>();
  private acceptingRequests = true;
  events: ApiEventEmitter;
  metrics: MetricsCollector;
  failban: FailbanManager | null = null;
  private relationsPlugin: unknown;
  private openApiGenerator: OpenAPIGeneratorCached;
  private routeRegistry: ApiRouteRegistry;
  private _signalHandlersSetup = false;
  private _boundSigtermHandler: (() => void) | null = null;
  private _boundSigintHandler: (() => void) | null = null;
  private _metricsListeners: Map<string, (data: any) => void> = new Map();
  private _webSocketServer: unknown | null = null;
  private _udpSocket: UdpSocket | null = null;
  private _udpSocketMessageHandler: ((message: Buffer, remoteInfo: { address: string; port: number; family: string; size: number }) => void) | null = null;
  private _udpSocketErrorHandler: ((error: Error) => void) | null = null;
  private _webSocketUpgradeHandler: ((request: IncomingMessage, socket: Socket, head: Buffer) => void) | null = null;

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
      auth: options.auth || createDefaultAuthConfig(),
      docs: {
        enabled: options.docs?.enabled !== false,
        title: options.docs?.title || 's3db.js API',
        version: options.docs?.version || '1.0.0',
        description: options.docs?.description || 'Auto-generated REST API for s3db.js resources',
        uiTheme: options.docs?.uiTheme || 'auto',
        tryItOut: options.docs?.tryItOut !== false,
        codeGeneration: options.docs?.codeGeneration !== false
      },
      maxBodySize: options.maxBodySize || 10 * 1024 * 1024,
      startupBanner: options.startupBanner !== false,
      rootRoute: options.rootRoute,
      compression: options.compression || { enabled: false },
      websocket: options.websocket,
      udp: options.udp,
      customProtocols: options.customProtocols || {}
    };
    this.customProtocols = this.options.customProtocols || {};

    this.logger = options.logger!;
    this.routeRegistry = options.routeRegistry || new ApiRouteRegistry();

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
      routeRegistry: this.routeRegistry,
      logger: this.logger,
      options: {
        auth: this.options.auth,
        resources: this.options.resources as ConstructorParameters<typeof OpenAPIGeneratorCached>[0]['options']['resources'],
        routes: this.options.routes,
        versionPrefix: this.options.versionPrefix,
        basePath: this.options.basePath,
        title: this.options.docs?.title,
        version: this.options.docs?.version,
        description: this.options.docs?.description,
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
      const { HttpApp } = await import('#src/plugins/shared/http-runtime.js');
      const { cors } = await import('raffel/http');

      const corsMiddleware = cors as unknown as ConstructorParameters<typeof MiddlewareChain>[0]['corsMiddleware'];

      this.routeRegistry.clear();
      this.app = new HttpApp();

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
        inFlightRequests: this.inFlightRequests,
        acceptingRequests: () => this.acceptingRequests,
        corsMiddleware
      });
      this.middlewareChain.apply(this.app!);

      const oidcDriver = this.options.auth?.drivers?.find((d) => d.driver === 'oidc');
      if (oidcDriver) {
        await this._setupOIDCRoutes(oidcDriver.config as OIDCConfig);
      }

      const authMiddleware = await this._createAuthMiddleware();

      await this._setupDocumentationRoutes();

      if (this.options.health?.enabled !== false) {
        this.healthManager = new HealthManager({
          database: this.options.database as ConstructorParameters<typeof HealthManager>[0]['database'],
          healthConfig: this.options.health as ConstructorParameters<typeof HealthManager>[0]['healthConfig'],
          logLevel: this.options.logLevel,
          logger: this.logger
        });
        this.healthManager.register(this.app!);
        this._registerHealthRouteEntries();
      }

      this.router = this._createRouter(HttpApp, authMiddleware || undefined);
      this.router.mount(this.app!, this.events);

      const handleAppError = createErrorHandler({ logger: this.logger as Parameters<typeof createErrorHandler>[0]['logger'] });
      this.app!.onError((err: Error, c: Context) => handleAppError(err, c));
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

    const serverInfo = await new Promise<ServerInfo>((resolve, reject) => {
      try {
        this.server = serve({
          fetch: fetchHandler,
          port,
          hostname: host,
          keepAliveTimeout: 65000,
          headersTimeout: 66000,
          onListen: ({ port, hostname }) => {
            resolve({ port, hostname });
          }
        });
      } catch (err) {
        reject(err);
      }
    });

    try {
      await this._setupProtocolBindings();
    } catch (err) {
      await this._teardownProtocolBindings();
      await this._closeHttpServer();
      throw err;
    }

    this.isRunning = true;
    if (this.options.logLevel) {
      this.logger.info({ address: serverInfo.hostname, port: serverInfo.port }, 'Server listening');
    }
    this._printStartupBanner(serverInfo);

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
      this._boundSigtermHandler = () => {
        void shutdownHandler('SIGTERM');
      };
      this._boundSigintHandler = () => {
        void shutdownHandler('SIGINT');
      };
      bumpProcessMaxListeners(2);
      process.once('SIGTERM', this._boundSigtermHandler);
      process.once('SIGINT', this._boundSigintHandler);
      this._signalHandlersSetup = true;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      if (this.options.logLevel) {
        this.logger.warn('Server is not running');
      }
      return;
    }

    await this._teardownProtocolBindings();

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

    this.inFlightRequests.clear();
  }

  getInfo(): { isRunning: boolean; port: number; host: string; resources: number } {
    return {
      isRunning: this.isRunning,
      port: this.options.port,
      host: this.options.host,
      resources: Object.keys(this.options.database?.resources || {}).length
    };
  }

  getApp(): HttpApp | null {
    return this.app;
  }

  getRegisteredRoutes() {
    return this.routeRegistry.list();
  }

  private async _closeHttpServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    this.server = null;
  }

  private _normalizeTransportPath(rawPath?: string): string {
    if (!rawPath) {
      return '/';
    }

    const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    if (normalized === '/') {
      return '/';
    }

    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  }

  private _isMatchingPath(requestPath: string, protocolPath: string): boolean {
    const pathname = (() => {
      try {
        return new URL(requestPath, 'http://localhost').pathname;
      } catch {
        return requestPath;
      }
    })();

    const normalizedRequest = this._normalizeTransportPath(pathname);
    return normalizedRequest === protocolPath;
  }

  private async _setupProtocolBindings(): Promise<void> {
    if (this.options.websocket?.enabled) {
      await this._setupWebSocketProtocol();
    }

    if (this.options.udp?.enabled) {
      await this._setupUdpProtocol();
    }
  }

  private async _teardownProtocolBindings(): Promise<void> {
    await this._closeUdpProtocol();
    await this._closeWebSocketProtocol();
  }

  private async _setupWebSocketProtocol(): Promise<void> {
    if (!this.options.websocket?.enabled || !this.server) {
      return;
    }

    const websocketOptions = this.options.websocket as {
      enabled: boolean;
      path?: string;
      maxPayloadBytes?: number;
      onConnection?: (socket: unknown, request: unknown) => void;
      onMessage?: (socket: unknown, message: unknown, isBinary?: boolean) => void;
      onError?: (error: Error) => void;
    };

    let WebSocketServer: any;
    try {
      ({ WebSocketServer } = await import('ws'));
    } catch {
      throw new Error('WebSocket protocol is enabled for ApiServer but dependency `ws` is missing. Install it or disable websocket.');
    }

    this._webSocketServer = new WebSocketServer({
      noServer: true,
      maxPayload: websocketOptions.maxPayloadBytes || 1024 * 1024
    });

    const path = this._normalizeTransportPath(websocketOptions.path);
    const onConnection = websocketOptions.onConnection;
    const onMessage = websocketOptions.onMessage;
    const onError = websocketOptions.onError;

    const websocketErrorHandler = (error: Error) => {
      if (typeof onError === 'function') {
        onError(error);
      } else if (this.options.logLevel) {
        this.logger.error({ error: error.message }, 'WebSocket protocol error');
      }
    };

    (this._webSocketServer as { on: (event: string, handler: (...args: any[]) => void) => void }).on('error', websocketErrorHandler);

    const onUpgrade = async (request: IncomingMessage, socket: Socket, head: Buffer) => {
      if (!request.url || !this._isMatchingPath(request.url, path)) {
        socket.destroy();
        return;
      }

      try {
        (this._webSocketServer as { handleUpgrade: (req: IncomingMessage, socket: Socket, head: Buffer, cb: (client: unknown) => void) => void }).handleUpgrade(
          request,
          socket,
          head,
          (client: unknown) => {
            if (typeof onConnection === 'function') {
              onConnection(client, request);
            }

            const isBinaryHandler = (data: unknown, isBinary?: boolean): void => {
              if (typeof onMessage === 'function') {
                onMessage(client, data, isBinary);
              }
            };

            const maybeMessageHandler = onMessage ? isBinaryHandler : null;
            if (maybeMessageHandler && typeof (client as { on: (...args: any[]) => void }).on === 'function') {
              (client as { on: (...args: any[]) => void }).on('message', isBinaryHandler);
            }
          }
        );
      } catch (error) {
        this._loggerError('Error while handling WebSocket upgrade', error as Error);
        socket.destroy();
      }
    };

    this._webSocketUpgradeHandler = onUpgrade;
    this.server.on('upgrade', this._webSocketUpgradeHandler);
  }

  private async _closeWebSocketProtocol(): Promise<void> {
    if (this._webSocketUpgradeHandler && this.server) {
      this.server.off('upgrade', this._webSocketUpgradeHandler);
      this._webSocketUpgradeHandler = null;
    }

    if (!this._webSocketServer) {
      return;
    }

    await new Promise<void>((resolve) => {
      (this._webSocketServer as { close: (callback?: () => void) => void }).close(() => {
        resolve();
      });
    });

    this._webSocketServer = null;
  }

  private async _setupUdpProtocol(): Promise<void> {
    if (!this.options.udp?.enabled || !this.options.udp) {
      return;
    }

    const { createSocket } = await import('node:dgram');
    const udpOptions = this.options.udp;
    const maxMessageBytes = udpOptions.maxMessageBytes || 65507;
    const socket = createSocket(this.options.host.includes(':') ? 'udp6' : 'udp4');
    this._udpSocket = socket;

    this._udpSocketMessageHandler = (message, remoteInfo) => {
      if (message.length > maxMessageBytes) {
        if (this.options.logLevel) {
          this.logger.debug(
            { messageLength: message.length, maxMessageBytes, address: remoteInfo.address, port: remoteInfo.port },
            'Dropped UDP message bigger than maxMessageBytes'
          );
        }
        return;
      }

      if (typeof udpOptions.onMessage === 'function') {
        udpOptions.onMessage(message, remoteInfo);
      }
    };

    this._udpSocketErrorHandler = (error) => {
      if (typeof udpOptions.onError === 'function') {
        udpOptions.onError(error);
      } else if (this.options.logLevel) {
        this.logger.error({ error: error.message }, 'UDP protocol error');
      }
    };

    socket.on('message', this._udpSocketMessageHandler);
    socket.on('error', this._udpSocketErrorHandler);

    await new Promise<void>((resolve, reject) => {
      const onBindError = (error: Error) => {
        socket.off('error', this._udpSocketErrorHandler as (...args: unknown[]) => void);
        this._udpSocket = null;
        socket.close();
        reject(error);
      };
      socket.once('error', onBindError);
      socket.once('listening', () => {
        socket.off('error', onBindError);
        resolve();
      });

      socket.bind(this.options.port, this.options.host);
    });
  }

  private async _closeUdpProtocol(): Promise<void> {
    if (!this._udpSocket) {
      return;
    }

    if (this._udpSocketMessageHandler) {
      this._udpSocket.off('message', this._udpSocketMessageHandler);
      this._udpSocketMessageHandler = null;
    }

    if (this._udpSocketErrorHandler) {
      this._udpSocket.off('error', this._udpSocketErrorHandler);
      this._udpSocketErrorHandler = null;
    }

    await new Promise<void>((resolve) => {
      this._udpSocket!.close(() => {
        resolve();
      });
    });
    this._udpSocket = null;
  }

  private _loggerError(message: string, error: Error): void {
    if (!this.options.logLevel) {
      return;
    }

    this.logger.error({ error: error.message }, message);
  }

  async previewRuntime(): Promise<ApiRuntimeInspectionPreview> {
    await this._ensurePlannedRouteRegistry();

    return buildApiRuntimeInspectionPreview({
      spec: this.openApiGenerator.generate(),
      routes: this.routeRegistry.list(),
      host: this.options.host,
      port: this.options.port,
      basePath: this.options.basePath || ''
    });
  }

  async doctor() {
    return buildApiRuntimeDoctorReport(await this.previewRuntime());
  }

  async contractTests() {
    return buildApiRuntimeContractTests(await this.previewRuntime());
  }

  stopAcceptingRequests(): void {
    this.acceptingRequests = false;
    if (this.options.logLevel) {
      this.logger.info('Stopped accepting new requests');
    }
  }

  private _registerMetricsPluginRoute(): void {
    const metricsRoute = this._getIntegratedMetricsPluginRoute();
    if (!metricsRoute || !this.app) return;

    const { metricsPlugin, path, enforceIpAllowlist, ipAllowlist } = metricsRoute;

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

    this._registerMetricsPluginRouteEntry();

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
      await this._teardownProtocolBindings();
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

  private async _setupDocumentationRoutes(): Promise<void> {
    const { createUSDHandlers, createRegistry, createSchemaRegistry } = await import('raffel');

    if (this.options.logLevel) {
      this.logger.debug({ docsEnabled: this.options.docs?.enabled }, 'Setting up documentation routes');
    }

    const basePath = this.options.basePath || '';
    const openApiPath = applyBasePath(basePath, '/openapi.json');
    const usdPath = applyBasePath(basePath, '/api.usd.json');
    const docsPath = applyBasePath(basePath, '/docs');
    const docsOpenApiPath = applyBasePath(basePath, '/docs/openapi.json');
    const docsUsdJsonPath = applyBasePath(basePath, '/docs/usd.json');
    const docsUsdYamlPath = applyBasePath(basePath, '/docs/usd.yaml');

    if (this.options.logLevel) {
      this.logger.debug(
        { docsPath, openApiPath, usdPath, docsOpenApiPath, docsUsdJsonPath, docsUsdYamlPath },
        'Documentation paths configured'
      );
    }

    if (this.options.docs?.enabled) {
      const registry = createRegistry();
      const schemaRegistry = createSchemaRegistry();

      const getHandlers = () => {
        const spec = this.openApiGenerator.generate();
        return createUSDHandlers(
          { registry, schemaRegistry },
          {
            info: {
              title: this.options.docs?.title || 's3db.js API',
              version: this.options.docs?.version || '1.0.0',
              description: this.options.docs?.description,
            },
            protocols: ['http'],
            externalPaths: spec.paths as Record<string, never>,
            externalComponents: {
              schemas: spec.components.schemas as Record<string, never>,
              securitySchemes: spec.components.securitySchemes as Record<string, never>,
            },
            ui: {
              theme: this.options.docs?.uiTheme || 'auto',
              tryItOut: this.options.docs?.tryItOut !== false,
              codeGeneration: this.options.docs?.codeGeneration !== false
                ? { enabled: true, languages: ['typescript', 'curl', 'python', 'go'] as ('typescript' | 'python' | 'go' | 'curl')[] }
                : { enabled: false }
            }
          }
        );
      };

      this.app!.get(openApiPath, (c: Context) => {
        return c.json(this.openApiGenerator.generate());
      });
      this.app!.get(usdPath, () => getHandlers().serveUSD());
      this.app!.get(docsOpenApiPath, () => getHandlers().serveOpenAPI());
      this.app!.get(docsUsdJsonPath, () => getHandlers().serveUSD());
      this.app!.get(docsUsdYamlPath, () => getHandlers().serveUSDYaml());
      this.app!.get(docsPath, () => getHandlers().serveUI());

      this._registerDocumentationRouteEntries();

      if (this.options.logLevel) {
        this.logger.debug(
          { docsPath, openApiPath, usdPath, docsOpenApiPath, docsUsdJsonPath, docsUsdYamlPath },
          'Docs routes registered with Raffel USD'
        );
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
    const { drivers, resource: defaultResourceName, pathRules } = auth || {};

    if (!drivers || drivers.length === 0) {
      return null;
    }

    const requiresAuthResource = (drivers || []).some((driver) => {
      const value = String(driver?.driver || '').trim().toLowerCase();
      return value !== 'oidc'
        && value !== 'header-secret'
        && value !== 'header_secret'
        && value !== 'headersecret';
    });

    const authResource = database?.resources?.[defaultResourceName || ''];
    if (requiresAuthResource && !authResource) {
      this.logger.error({ resource: defaultResourceName }, 'Auth resource not found for middleware');
      return null;
    }

    const strategy = AuthStrategyFactory.create({
      drivers,
      authResource: authResource as unknown as Parameters<typeof AuthStrategyFactory.create>[0]['authResource'],
      oidcMiddleware: this.oidcMiddleware || null,
      database: database as unknown as Parameters<typeof AuthStrategyFactory.create>[0]['database'],
      pathRules: normalizeAuthPathRules(pathRules),
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
    const docsPath = this.options.docs?.enabled !== false
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

  private _createRouter(
    HttpAppCtor: new () => HttpApp,
    authMiddleware?: MiddlewareHandler
  ): Router {
    return new Router({
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
      authMiddleware,
      logLevel: this.options.logLevel,
      logger: this.logger,
      HttpApp: HttpAppCtor,
      docs: {
        enabled: this.options.docs?.enabled !== false,
        title: this.options.docs?.title || 's3db.js API',
        description: this.options.docs?.description || 'Auto-generated REST API for s3db.js resources'
      },
      rootRoute: this.options.rootRoute,
      routeRegistry: this.routeRegistry
    });
  }

  private async _ensurePlannedRouteRegistry(): Promise<void> {
    if (this.routeRegistry.list().length > 0) {
      return;
    }

    const { HttpApp } = await import('#src/plugins/shared/http-runtime.js');

    this.routeRegistry.clear();
    this._registerMetricsPluginRouteEntry();
    this._registerDocumentationRouteEntries();
    if (this.options.health?.enabled !== false) {
      this._registerHealthRouteEntries();
    }

    this.router = this._createRouter(HttpApp as unknown as new () => HttpApp);

    const noopApp = {
      use() {},
      get() {},
      on() {},
      route() {}
    };

    this.router.mount(
      noopApp as unknown as HttpApp,
      { emitResourceEvent() {} }
    );
  }

  private _getIntegratedMetricsPluginRoute():
    | {
        metricsPlugin: Record<string, unknown>;
        path: string;
        enforceIpAllowlist: boolean | undefined;
        ipAllowlist: string[];
      }
    | null {
    const metricsPlugin = this.options.database?.pluginRegistry?.metrics ||
                          this.options.database?.pluginRegistry?.MetricsPlugin;

    if (!metricsPlugin) return null;

    const config = (metricsPlugin as { config?: { prometheus?: { enabled?: boolean; mode?: string; path?: string; enforceIpAllowlist?: boolean; ipAllowlist?: string[] } } }).config;
    if (!config?.prometheus?.enabled) return null;

    const mode = config.prometheus.mode;
    if (mode !== 'integrated' && mode !== 'auto') return null;

    return {
      metricsPlugin: metricsPlugin as Record<string, unknown>,
      path: config.prometheus.path || '/metrics',
      enforceIpAllowlist: config.prometheus.enforceIpAllowlist,
      ipAllowlist: config.prometheus.ipAllowlist || []
    };
  }

  private _registerMetricsPluginRouteEntry(): void {
    const metricsRoute = this._getIntegratedMetricsPluginRoute();
    if (!metricsRoute) {
      return;
    }

    this.routeRegistry.register({
      kind: 'metrics',
      path: metricsRoute.path,
      methods: ['GET'],
      summary: 'Prometheus Metrics',
      tags: ['Monitoring'],
      sourceKind: 'programmatic'
    });
  }

  private _registerDocumentationRouteEntries(): void {
    if (this.options.docs?.enabled === false) {
      return;
    }

    const basePath = this.options.basePath || '';
    const entries = [
      applyBasePath(basePath, '/openapi.json'),
      applyBasePath(basePath, '/api.usd.json'),
      applyBasePath(basePath, '/docs/openapi.json'),
      applyBasePath(basePath, '/docs/usd.json'),
      applyBasePath(basePath, '/docs/usd.yaml'),
      applyBasePath(basePath, '/docs')
    ].map((path) => ({
      kind: 'docs' as const,
      path,
      methods: ['GET'],
      tags: ['Documentation'],
      sourceKind: 'programmatic' as const
    }));

    this.routeRegistry.registerMany(entries);
  }

  private _registerHealthRouteEntries(): void {
    this.routeRegistry.registerMany([
      {
        kind: 'health',
        path: '/health',
        methods: ['GET'],
        tags: ['Health'],
        sourceKind: 'programmatic'
      },
      {
        kind: 'health',
        path: '/health/live',
        methods: ['GET'],
        tags: ['Health'],
        sourceKind: 'programmatic'
      },
      {
        kind: 'health',
        path: '/health/ready',
        methods: ['GET'],
        tags: ['Health'],
        sourceKind: 'programmatic'
      }
    ]);
  }
}

export default ApiServer;
