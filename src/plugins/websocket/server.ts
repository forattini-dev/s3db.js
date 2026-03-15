/**
 * WebSocket Server - Real-time connection manager for s3db.js resources
 *
 * Uses raffel's WebSocket adapter for connection management, heartbeat,
 * auth, channels, backpressure, and compression. Implements s3db.js
 * CRUD protocol via onMessage hook.
 *
 * @example
 * const server = new WebSocketServer({
 *   port: 3001,
 *   database,
 *   auth: { drivers: [{ driver: 'jwt', config: { secret: 'my-secret' } }] }
 * });
 * await server.start();
 */

import { EventEmitter } from 'events';
import type { Database } from '../../database.class.js';
import type * as http from 'http';
import type {
  WebSocketAuthDriver,
  WebSocketAuth,
  WebSocketResourceConfig,
  WebSocketOptions,
  WebSocketMetrics,
  WebSocketSendFn,
  WebSocketMessageHandler,
  WebSocketHookContext,
  WebSocketTicketAuthConfig,
  WebSocketTokenRefreshConfig,
  WebSocketRecoveryConfig,
  WebSocketChannelRateLimits,
  WebSocketChannelHistoryConfig,
  WebSocketChannelTransformFn,
  WebSocketChannelTypingConfig,
  WebSocketChannelRestApiConfig,
  WebSocketCompressionConfig,
  WebSocketChannelsConfig
} from './types.internal.js';

export type {
  WebSocketAuthDriver,
  WebSocketAuth,
  WebSocketResourceConfig,
  WebSocketOptions,
  WebSocketMetrics,
  WebSocketSendFn,
  WebSocketMessageHandler,
  WebSocketHookContext,
  WebSocketTicketAuthConfig,
  WebSocketTokenRefreshConfig,
  WebSocketRecoveryConfig,
  WebSocketChannelRateLimits,
  WebSocketChannelHistoryConfig,
  WebSocketChannelTransformFn,
  WebSocketChannelTypingConfig,
  WebSocketChannelRestApiConfig,
  WebSocketCompressionConfig,
  WebSocketChannelsConfig
};

type RaffelWebSocketAdapter = {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly clientCount: number;
  readonly channels: RaffelChannelManager | null;
  send(socketId: string, message: unknown): void;
  sendRaw(socketId: string, data: string | Buffer): void;
  broadcast(message: unknown, except?: string): void;
  getClient(socketId: string): { id: string; remoteAddress?: string; metadata: Record<string, string>; authSeed?: any; connectedAt: number } | undefined;
  getClients(): Array<{ id: string; remoteAddress?: string; metadata: Record<string, string>; authSeed?: any; connectedAt: number }>;
  disconnect(socketId: string, code?: number, reason?: string): void;
};

type RaffelChannelManager = {
  subscribe(socketId: string, channel: string, ctx: any, since?: { seq: number; epoch: string }): Promise<{ success: boolean; error?: { code: string; status: number; message: string }; members?: any[] }>;
  unsubscribe(socketId: string, channel: string): void;
  unsubscribeAll(socketId: string): void;
  isSubscribed(socketId: string, channel: string): boolean;
  getSubscriptions(socketId: string): string[];
  broadcast(channel: string, event: string, data: unknown, except?: string): void;
  sendToSocket(socketId: string, channel: string, event: string, data: unknown): void;
  getMembers(channel: string): Array<{ id: string; userId?: string; info: Record<string, unknown>; joinedAt: number }>;
  getMember(channel: string, socketId: string): { id: string; userId?: string; info: Record<string, unknown>; joinedAt: number } | undefined;
  getMemberCount(channel: string): number;
  kick(channel: string, socketId: string): void;
  getChannels(): string[];
  getSubscribers(channel: string): string[];
  hasChannel(channel: string): boolean;
  getSubscriberCount(channel: string): number;
  registerClient(socketId: string, info?: Partial<{ userId: string; data: Record<string, unknown> }>): void;
  removeClient(socketId: string): void;
  getClient(socketId: string): { id: string; userId?: string; data: Record<string, unknown>; channels: string[]; connectedAt: number } | undefined;
  getClients(): Array<{ id: string; userId?: string; data: Record<string, unknown>; channels: string[]; connectedAt: number }>;
  getClientCount(): number;
  sendToClient(socketId: string, event: string, data: unknown): void;
  broadcastAll(event: string, data: unknown, except?: string): void;
  handleTyping(socketId: string, channel: string, isTyping: boolean): void;
};

export class WebSocketServer extends EventEmitter {
  port: number;
  host: string;
  database: Database;
  namespace?: string;
  logger: any;
  logLevel?: string;

  auth: WebSocketAuth;
  resources: Record<string, WebSocketResourceConfig>;
  heartbeatInterval: number;
  maxPayloadSize: number;
  rateLimit: { enabled: boolean; windowMs?: number; maxRequests?: number };
  cors: { enabled: boolean; origin?: string };
  startupBanner: boolean;
  health: { enabled?: boolean; [key: string]: any };
  channels: WebSocketChannelsConfig;
  compression: boolean | WebSocketCompressionConfig;
  ticketAuth?: WebSocketTicketAuthConfig;
  tokenRefresh?: WebSocketTokenRefreshConfig;
  recovery?: WebSocketRecoveryConfig;

  private adapter: RaffelWebSocketAdapter | null = null;
  private httpServer: http.Server | null = null;
  private _ticketStore: any = null;
  private _channelRestHandler: any = null;
  subscriptions: Map<string, Set<string>>;
  private rateLimitState: Map<string, { count: number; windowStart: number }>;
  private _resourceListeners: Map<string, { insert: Function; update: Function; delete: Function }>;
  private _clientUsers: Map<string, any>;
  private _messageHandlers: Record<string, WebSocketMessageHandler>;
  private _onMessage?: (socketId: string, raw: string | Buffer, send: WebSocketSendFn, ctx: WebSocketHookContext) => boolean | Promise<boolean>;
  private _onConnection?: (socketId: string, send: WebSocketSendFn, req: any, ctx: WebSocketHookContext) => void | Promise<void>;
  private _onClose?: (socketId: string, code: number, reason: string, ctx: WebSocketHookContext) => void | Promise<void>;

  metrics: WebSocketMetrics;

  constructor(options: WebSocketOptions) {
    super();

    this.port = options.port || 3001;
    this.host = options.host || '0.0.0.0';
    this.database = options.database;
    this.namespace = options.namespace;
    this.logger = options.logger;
    this.logLevel = options.logLevel;

    this.auth = options.auth || {};
    this.resources = options.resources || {};
    this.heartbeatInterval = options.heartbeatInterval || 30000;
    this.maxPayloadSize = options.maxPayloadSize || 1024 * 1024;
    this.rateLimit = options.rateLimit || { enabled: false };
    this.cors = options.cors || { enabled: true, origin: '*' };
    this.startupBanner = options.startupBanner !== false;
    this.health = options.health ?? { enabled: true };
    this.channels = options.channels || { enabled: true };
    this.compression = options.compression ?? true;
    this.ticketAuth = options.ticketAuth;
    this.tokenRefresh = options.tokenRefresh;
    this.recovery = options.recovery;

    this._messageHandlers = options.messageHandlers || {};
    this._onMessage = options.onMessage;
    this._onConnection = options.onConnection;
    this._onClose = options.onClose;

    this.subscriptions = new Map();
    this.rateLimitState = new Map();
    this._resourceListeners = new Map();
    this._clientUsers = new Map();

    this.metrics = {
      connections: 0,
      disconnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      broadcasts: 0,
      errors: 0
    };
  }

  /**
   * Start WebSocket server
   */
  async start(): Promise<void> {
    const { createWebSocketAdapter, createRegistry, createRouter } = await import('raffel');
    const { createServer } = await import('http');

    // Create ticket store if ticket auth is enabled
    if (this.ticketAuth?.enabled) {
      const { createMemoryTicketStore } = await import('raffel');
      this._ticketStore = createMemoryTicketStore({ gcInterval: 10_000 });
    }

    // Create HTTP server for health + channel REST API endpoints
    this.httpServer = createServer(async (req, res) => {
      if (this.cors.enabled) {
        res.setHeader('Access-Control-Allow-Origin', this.cors.origin || '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type');
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (this.health?.enabled !== false && req.url?.startsWith('/health')) {
        const handled = await this._handleHealthRequest(req, res);
        if (handled) return;
      }

      // Channel REST API
      if (this.channels?.restApi?.enabled && this._channelRestHandler && req.url?.startsWith(this.channels.restApi.path || '/channels')) {
        const handled = await this._channelRestHandler(req, res);
        if (handled) return;
      }

      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('WebSocket connection required');
    });

    const registry = createRegistry();
    const router = createRouter(registry);

    const channelsConfig = this.channels?.enabled !== false ? {
      authorize: (socketId: string, channel: string, ctx: any) => this._authorizeChannel(socketId, channel, ctx),
      presenceData: (socketId: string, channel: string, ctx: any) => this._getPresenceData(socketId, channel, ctx),
      hooks: {
        onSubscribe: (socketId: string, channel: string) => {
          this.logger?.debug({ socketId, channel }, 'Client subscribed to channel');
        },
        onUnsubscribe: (socketId: string, channel: string) => {
          this.logger?.debug({ socketId, channel }, 'Client unsubscribed from channel');
        },
        onMemberAdded: (channel: string, member: any) => {
          this.emit('channel.joined', { clientId: member.id, channel });
        },
        onMemberRemoved: (channel: string, member: any) => {
          this.emit('channel.left', { clientId: member.id, channel });
        }
      },
      ...(this.channels.rateLimits ? { rateLimits: this.channels.rateLimits } : {}),
      ...(this.channels.history?.enabled ? { history: this.channels.history } : {}),
      ...(this.channels.transform ? { transform: this.channels.transform } : {}),
      ...(this.channels.maxSubscribersPerChannel != null ? { maxSubscribersPerChannel: this.channels.maxSubscribersPerChannel } : {}),
      ...(this.channels.typing?.enabled ? { typing: this.channels.typing } : {}),
    } : undefined;

    // Build compression config
    const compressionConfig = typeof this.compression === 'object'
      ? this.compression
      : this.compression;

    // Build recovery config
    const recoveryConfig = this.recovery?.enabled ? {
      enabled: true,
      ttl: this.recovery.ttl || 120_000,
    } : undefined;

    this.adapter = createWebSocketAdapter(router, {
      server: this.httpServer,
      maxPayloadSize: this.maxPayloadSize,
      heartbeatInterval: this.heartbeatInterval,
      auth: this._buildRaffelAuth(),
      channels: channelsConfig,
      backpressure: { maxBufferedAmount: 1024 * 1024, strategy: 'drop' },
      compression: compressionConfig,
      recovery: recoveryConfig,
      onConnection: async (socketId, send, req) => {
        const user = (req as any)._user || null;
        this._clientUsers.set(socketId, user);
        this.metrics.connections++;
        this.logger?.debug({ clientId: socketId, userId: user?.id }, 'Client connected');

        send({
          type: 'connected',
          clientId: socketId,
          user: user ? { id: user.id, role: user.role } : null,
          timestamp: new Date().toISOString()
        });

        if (this._onConnection) {
          await this._onConnection(socketId, send, req, this._getHookContext());
        }

        this.emit('client.connected', { clientId: socketId, user });
      },
      onMessage: (socketId, raw, send) => this._handleMessage(socketId, raw, send),
      onClose: async (socketId, code, reason) => {
        this._handleDisconnect(socketId, code, reason);

        if (this._onClose) {
          await this._onClose(socketId, code, reason, this._getHookContext());
        }
      }
    });

    // Setup channel REST API if enabled
    if (this.channels?.restApi?.enabled && this.adapter.channels) {
      const { createChannelRestApi } = await import('raffel');
      this._channelRestHandler = createChannelRestApi(this.adapter.channels as any, {
        path: this.channels.restApi.path || '/channels',
        apiKey: this.channels.restApi.apiKey,
        auth: this.channels.restApi.auth,
      });
    }

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject);
      this.httpServer!.listen(this.port, this.host, () => {
        this.httpServer!.removeListener('error', reject);
        resolve();
      });
    });

    await this.adapter.start();
    await this._setupResourceListeners();

    if (this.startupBanner && this.logLevel) {
      this.logger?.info({
        port: this.port,
        host: this.host,
        resources: Object.keys(this.resources).length
      }, 'WebSocket server started');
    }

    this.emit('server.started', { port: this.port, host: this.host });
  }

  /**
   * Stop WebSocket server
   */
  async stop(): Promise<void> {
    this._removeResourceListeners();

    if (this.adapter) {
      await this.adapter.stop();
      this.adapter = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    this.subscriptions.clear();
    this.rateLimitState.clear();
    this._clientUsers.clear();

    if (this._ticketStore?.dispose) {
      this._ticketStore.dispose();
      this._ticketStore = null;
    }

    this._channelRestHandler = null;

    if (this.logLevel) {
      this.logger?.info('WebSocket server stopped');
    }

    this.emit('server.stopped');
  }

  /**
   * Build raffel auth config from s3db auth drivers
   * @private
   */
  private _buildRaffelAuth(): any {
    // Ticket auth mode — single-use tokens generated server-side
    if (this.ticketAuth?.enabled && this._ticketStore) {
      const auth: any = {
        mode: 'ticket' as const,
        ticketStore: this._ticketStore,
        ticketTTL: this.ticketAuth.ttl || 30_000,
      };

      if (this.tokenRefresh?.enabled) {
        auth.refreshToken = async (token: string) => {
          const user = await this.tokenRefresh!.validateRefreshToken(token);
          if (!user) return null;
          return {
            auth: {
              authenticated: true,
              principal: user.id,
              roles: [user.role],
              scopes: user.scopes || [],
              claims: user
            }
          };
        };
      }

      return auth;
    }

    const drivers = this.auth.drivers || [];
    if (drivers.length === 0 && this.auth.required === false) return undefined;
    if (drivers.length === 0) return undefined;

    const jwtDriver = drivers.find(d => d.driver === 'jwt');
    const apiKeyDriver = drivers.find(d => d.driver === 'apiKey');

    const buildRefreshToken = () => {
      if (!this.tokenRefresh?.enabled) return undefined;
      return async (token: string) => {
        const user = await this.tokenRefresh!.validateRefreshToken(token);
        if (!user) return null;
        return {
          auth: {
            authenticated: true,
            principal: user.id,
            roles: [user.role],
            scopes: user.scopes || [],
            claims: user
          }
        };
      };
    };

    if (jwtDriver) {
      return {
        mode: 'bearer' as const,
        extractToken: (req: http.IncomingMessage) => {
          const url = new URL(req.url || '/', `http://${req.headers.host}`);
          return url.searchParams.get('token') ||
            req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
            undefined;
        },
        validateToken: async (token: string) => {
          const user = await this._validateToken(token);
          if (!user) return null;
          return {
            auth: {
              authenticated: true,
              principal: user.id,
              roles: [user.role],
              scopes: user.scopes || [],
              claims: user
            }
          };
        },
        refreshToken: buildRefreshToken()
      };
    }

    if (apiKeyDriver) {
      return {
        mode: 'custom' as const,
        extractToken: (req: http.IncomingMessage) => {
          const url = new URL(req.url || '/', `http://${req.headers.host}`);
          const header = apiKeyDriver.config?.header || 'x-api-key';
          return req.headers[header] as string ||
            url.searchParams.get('token') ||
            url.searchParams.get(apiKeyDriver.config?.queryParam || 'apiKey') ||
            undefined;
        },
        validateToken: async (token: string) => {
          const user = await this._validateToken(token);
          if (!user) return null;
          return {
            auth: {
              authenticated: true,
              principal: user.id,
              roles: [user.role],
              scopes: user.scopes || [],
              claims: user
            }
          };
        },
        refreshToken: buildRefreshToken()
      };
    }

    return undefined;
  }

  /**
   * Validate authentication token
   * @private
   */
  private async _validateToken(token: string): Promise<any | null> {
    if (!token) return null;

    for (const driver of (this.auth.drivers || [])) {
      try {
        if (driver.driver === 'jwt' && driver.config?.secret) {
          const { jwtVerify, createRemoteJWKSet } = await import('jose');

          let payload;
          if (driver.config.jwksUri) {
            const JWKS = createRemoteJWKSet(new URL(driver.config.jwksUri));
            const result = await jwtVerify(token, JWKS, {
              issuer: driver.config.issuer,
              audience: driver.config.audience
            });
            payload = result.payload;
          } else {
            const secret = new TextEncoder().encode(driver.config.secret);
            const result = await jwtVerify(token, secret);
            payload = result.payload;
          }

          return {
            id: payload.sub || payload.id,
            email: payload.email,
            role: payload.role || 'user',
            scopes: payload.scopes || (typeof payload.scope === 'string' ? payload.scope.split(' ') : []) || []
          };
        }

        if (driver.driver === 'apiKey' && driver.config?.keys) {
          const keyConfig = driver.config.keys[token];
          if (keyConfig) {
            return {
              id: keyConfig.id || token.slice(0, 8),
              role: keyConfig.role || 'user',
              scopes: keyConfig.scopes || []
            };
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  /**
   * Authorize channel subscription via raffel
   * @private
   */
  private _getHookContext(): WebSocketHookContext {
    return {
      database: this.database,
      server: this,
      adapter: this.adapter,
      getUser: (socketId: string) => this._clientUsers.get(socketId),
    };
  }

  private _getChannelType(channel: string): string {
    if (channel.startsWith('presence-')) return 'presence';
    if (channel.startsWith('private-')) return 'private';
    if (channel.startsWith('queue-')) return 'queue';
    return 'public';
  }

  private async _authorizeChannel(socketId: string, channel: string, ctx: any): Promise<boolean> {
    const isPrivate = channel.startsWith('private-');
    const isPresence = channel.startsWith('presence-');

    // Public and queue channels don't require auth
    if (!isPrivate && !isPresence) return true;

    if (!ctx?.auth?.authenticated) return false;

    const guardKey = channel.replace(/^(presence-|private-)/, '');
    const guards = this.channels?.guards || {};
    const guard = guards[guardKey] || guards['*'];

    if (guard) {
      try {
        const user = this._clientUsers.get(socketId);
        const result = await guard(user, channel, {});
        if (result === false) return false;
        if (typeof result === 'object' && result.authorized === false) return false;
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * Get presence data for channel member
   * @private
   */
  private _getPresenceData(socketId: string, channel: string, ctx: any): Record<string, unknown> {
    const user = this._clientUsers.get(socketId);
    return {
      userId: user?.id || ctx?.auth?.principal,
      name: user?.name || user?.email || 'Anonymous',
      avatar: user?.avatar
    };
  }

  /**
   * Handle incoming message via raffel onMessage hook
   * @private
   */
  private async _handleMessage(socketId: string, raw: string | Buffer, send: (message: unknown) => void): Promise<boolean> {
    this.metrics.messagesReceived++;

    // User-level raw interceptor — full control, can skip everything
    if (this._onMessage) {
      const handled = await this._onMessage(socketId, raw, send, this._getHookContext());
      if (handled) return true;
    }

    if (this.rateLimit.enabled && !this._checkRateLimit(socketId)) {
      send({ type: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' });
      return true;
    }

    let message: any;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send({ type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON format' });
      return true;
    }

    const { type, requestId, ...payload } = message;

    try {
      // Custom message handlers take priority over built-in
      const customHandler = this._messageHandlers[type];
      if (customHandler) {
        const user = this._clientUsers.get(socketId);
        const response = await customHandler(socketId, payload, { send, user, server: this, database: this.database, adapter: this.adapter });
        if (response !== undefined && response !== null) {
          if (requestId) response.requestId = requestId;
          send(response);
          this.metrics.messagesSent++;
        }
        return true;
      }

      let response: any;

      switch (type) {
        case 'ping':
          response = { type: 'pong', timestamp: Date.now() };
          break;

        case 'subscribe':
          response = await this._handleSubscribe(socketId, payload);
          break;

        case 'unsubscribe':
          response = await this._handleUnsubscribe(socketId, payload);
          break;

        case 'publish':
          response = await this._handlePublish(socketId, payload);
          break;

        case 'get':
          response = await this._handleGet(socketId, payload);
          break;

        case 'list':
          response = await this._handleList(socketId, payload);
          break;

        case 'insert':
          response = await this._handleInsert(socketId, payload);
          break;

        case 'update':
          response = await this._handleUpdate(socketId, payload);
          break;

        case 'delete':
          response = await this._handleDelete(socketId, payload);
          break;

        case 'join':
          response = await this._handleJoinChannel(socketId, payload, send);
          break;

        case 'leave':
          response = await this._handleLeaveChannel(socketId, payload);
          break;

        case 'channel:message':
          response = await this._handleChannelMessage(socketId, payload);
          break;

        case 'channel:update':
          response = await this._handleChannelUpdate(socketId, payload);
          break;

        default:
          // Unknown type — pass to raffel for channel protocol handling
          return false;
      }

      if (requestId) {
        response.requestId = requestId;
      }

      send(response);
      this.metrics.messagesSent++;
      return true;
    } catch (error: any) {
      this.metrics.errors++;
      this.logger?.error({ clientId: socketId, type, error: error.message }, 'Message handler error');
      send({ type: 'error', requestId, code: 'INTERNAL_ERROR', message: error.message });
      return true;
    }
  }

  /**
   * Handle subscribe request (resource subscription)
   * @private
   */
  private async _handleSubscribe(socketId: string, payload: any): Promise<any> {
    const { resource, filter, events = ['insert', 'update', 'delete'] } = payload;
    const user = this._clientUsers.get(socketId);

    const resourceConfig = this.resources[resource];
    if (!resourceConfig && Object.keys(this.resources).length > 0) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not configured for WebSocket access` };
    }

    if (resourceConfig?.auth && user) {
      const allowed = this._checkResourceAuth(user, resourceConfig, 'subscribe');
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: `Not authorized to subscribe to "${resource}"` };
      }
    }

    if (!this.subscriptions.has(resource)) {
      this.subscriptions.set(resource, new Set());
    }
    this.subscriptions.get(resource)!.add(socketId);

    this.logger?.debug({ clientId: socketId, resource, filter }, 'Client subscribed');

    return { type: 'subscribed', resource, filter, events };
  }

  /**
   * Handle unsubscribe request
   * @private
   */
  private async _handleUnsubscribe(socketId: string, payload: any): Promise<any> {
    const { resource } = payload;
    this.subscriptions.get(resource)?.delete(socketId);
    this.logger?.debug({ clientId: socketId, resource }, 'Client unsubscribed');
    return { type: 'unsubscribed', resource };
  }

  /**
   * Handle publish request
   * @private
   */
  private async _handlePublish(socketId: string, payload: any): Promise<any> {
    const { channel, message: msg } = payload;
    const user = this._clientUsers.get(socketId);

    const resourceConfig = this.resources[channel];
    if (resourceConfig?.publishAuth && user) {
      const allowed = this._checkResourceAuth(user, resourceConfig, 'publish');
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: `Not authorized to publish to "${channel}"` };
      }
    }

    const subscriberIds = this.subscriptions.get(channel) || new Set();
    let delivered = 0;

    for (const subscriberId of subscriberIds) {
      if (subscriberId === socketId) continue;
      if (this.adapter) {
        this.adapter.send(subscriberId, {
          type: 'message',
          channel,
          from: socketId,
          data: msg,
          timestamp: new Date().toISOString()
        });
        delivered++;
      }
    }

    return { type: 'published', channel, delivered };
  }

  /**
   * Handle get request
   * @private
   */
  private async _handleGet(socketId: string, payload: any): Promise<any> {
    const { resource, id, partition } = payload;
    const user = this._clientUsers.get(socketId);

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.get) {
      const allowed = await resourceConfig.guard.get(user, { id, partition });
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
    }

    const options = partition ? { partition } : {};
    const record = await (dbResource as any).get(id, options);

    if (!record) {
      return { type: 'error', code: 'NOT_FOUND', message: 'Record not found' };
    }

    const filtered = this._filterProtectedFields(record, resourceConfig);
    return { type: 'data', resource, data: filtered };
  }

  /**
   * Handle list request
   * @private
   */
  private async _handleList(socketId: string, payload: any): Promise<any> {
    const { resource, filter, partition, limit = 100, cursor } = payload;
    const user = this._clientUsers.get(socketId);

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.list) {
      const guardResult = await resourceConfig.guard.list(user, { filter, partition });
      if (guardResult === false) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
      if (typeof guardResult === 'object') {
        Object.assign(filter || {}, guardResult);
      }
    }

    const options: any = { limit };
    if (partition) options.partition = partition;
    if (cursor) options.startAfter = cursor;

    let records;
    if (filter && Object.keys(filter).length > 0) {
      records = await dbResource.query(filter, options);
    } else {
      records = await dbResource.list(options);
    }

    const filtered = records.map((r: any) => this._filterProtectedFields(r, resourceConfig));

    return {
      type: 'data',
      resource,
      data: filtered,
      cursor: records.length === limit ? records[records.length - 1]?.id : null
    };
  }

  /**
   * Handle insert request
   * @private
   */
  private async _handleInsert(socketId: string, payload: any): Promise<any> {
    const { resource, data } = payload;
    const user = this._clientUsers.get(socketId);

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.create) {
      const allowed = await resourceConfig.guard.create(user, data);
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
    }

    const record = await dbResource.insert(data);
    const filtered = this._filterProtectedFields(record, resourceConfig);
    return { type: 'inserted', resource, data: filtered };
  }

  /**
   * Handle update request
   * @private
   */
  private async _handleUpdate(socketId: string, payload: any): Promise<any> {
    const { resource, id, data, partition } = payload;
    const user = this._clientUsers.get(socketId);

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.update) {
      const allowed = await resourceConfig.guard.update(user, { id, data, partition });
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
    }

    const options = partition ? { partition } : {};
    const record = await (dbResource as any).update(id, data, options);
    const filtered = this._filterProtectedFields(record, resourceConfig);
    return { type: 'updated', resource, data: filtered };
  }

  /**
   * Handle delete request
   * @private
   */
  private async _handleDelete(socketId: string, payload: any): Promise<any> {
    const { resource, id, partition } = payload;
    const user = this._clientUsers.get(socketId);

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.delete) {
      const allowed = await resourceConfig.guard.delete(user, { id, partition });
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
    }

    const options = partition ? { partition } : {};
    await (dbResource as any).delete(id, options);
    return { type: 'deleted', resource, id };
  }

  /**
   * Handle join channel request (delegates to raffel ChannelManager)
   * @private
   */
  private async _handleJoinChannel(socketId: string, payload: any, send: (message: unknown) => void): Promise<any> {
    const { channel } = payload;

    if (!this.adapter?.channels) {
      return { type: 'error', code: 'CHANNELS_DISABLED', message: 'Channels feature is disabled' };
    }

    if (!channel) {
      return { type: 'error', code: 'INVALID_REQUEST', message: 'Channel name is required' };
    }

    const user = this._clientUsers.get(socketId);
    const ctx = user ? {
      auth: { authenticated: true, principal: user.id, roles: [user.role], scopes: user.scopes || [] }
    } : { auth: { authenticated: false } };

    const result = await this.adapter.channels.subscribe(socketId, channel, ctx);

    if (!result.success) {
      return {
        type: 'error',
        code: result.error?.code || 'JOIN_FAILED',
        message: result.error?.message || 'Failed to join channel'
      };
    }

    return {
      type: 'channel:joined',
      channel,
      members: result.members
    };
  }

  /**
   * Handle leave channel request
   * @private
   */
  private async _handleLeaveChannel(socketId: string, payload: any): Promise<any> {
    const { channel } = payload;

    if (!this.adapter?.channels) {
      return { type: 'error', code: 'CHANNELS_DISABLED', message: 'Channels feature is disabled' };
    }

    if (!channel) {
      return { type: 'error', code: 'INVALID_REQUEST', message: 'Channel name is required' };
    }

    this.adapter.channels.unsubscribe(socketId, channel);

    return { type: 'channel:left', channel };
  }

  /**
   * Handle channel message
   * @private
   */
  private async _handleChannelMessage(socketId: string, payload: any): Promise<any> {
    const { channel, data, event = 'message' } = payload;

    if (!this.adapter?.channels) {
      return { type: 'error', code: 'CHANNELS_DISABLED', message: 'Channels feature is disabled' };
    }

    if (!channel || data === undefined) {
      return { type: 'error', code: 'INVALID_REQUEST', message: 'Channel and data are required' };
    }

    if (!this.adapter.channels.isSubscribed(socketId, channel)) {
      return { type: 'error', code: 'NOT_IN_CHANNEL', message: 'You must join the channel first' };
    }

    const user = this._clientUsers.get(socketId);
    this.adapter.channels.broadcast(channel, event, {
      data,
      from: { clientId: socketId, userId: user?.id },
      timestamp: new Date().toISOString()
    }, socketId);

    const delivered = this.adapter.channels.getSubscriberCount(channel) - 1;
    return { type: 'channel:sent', channel, delivered: Math.max(0, delivered) };
  }

  /**
   * Handle channel update (presence info)
   * @private
   */
  private async _handleChannelUpdate(socketId: string, payload: any): Promise<any> {
    const { channel, userInfo } = payload;

    if (!this.adapter?.channels) {
      return { type: 'error', code: 'CHANNELS_DISABLED', message: 'Channels feature is disabled' };
    }

    if (!channel || !userInfo) {
      return { type: 'error', code: 'INVALID_REQUEST', message: 'Channel and userInfo are required' };
    }

    const member = this.adapter.channels.getMember(channel, socketId);
    if (!member) {
      return { type: 'error', code: 'UPDATE_FAILED', message: 'Not a member of this channel' };
    }

    const updatedMember = { ...member, info: { ...member.info, ...userInfo, updatedAt: new Date().toISOString() } };

    this.adapter.channels.broadcast(channel, 'presence:member_updated', {
      channel,
      member: updatedMember,
      timestamp: new Date().toISOString()
    }, socketId);

    return { type: 'channel:updated', channel, member: updatedMember };
  }

  /**
   * Handle client disconnect
   * @private
   */
  private _handleDisconnect(socketId: string, code: number, reason: string): void {
    for (const [resource, subscribers] of this.subscriptions) {
      subscribers.delete(socketId);
    }

    this.rateLimitState.delete(socketId);
    this._clientUsers.delete(socketId);

    this.metrics.disconnections++;
    this.logger?.debug({ clientId: socketId, code, reason }, 'Client disconnected');

    this.emit('client.disconnected', { clientId: socketId, code, reason });
  }

  /**
   * Setup resource event listeners for broadcasting
   * @private
   */
  private async _setupResourceListeners(): Promise<void> {
    if (!this.database) return;

    for (const resourceName of Object.keys(this.resources)) {
      const resource = (this.database.resources as any)?.[resourceName];
      if (!resource) continue;

      const insertListener = (data: any) => {
        this._broadcastResourceEvent(resourceName, 'insert', data);
      };
      const updateListener = (data: any) => {
        this._broadcastResourceEvent(resourceName, 'update', data);
      };
      const deleteListener = (data: any) => {
        this._broadcastResourceEvent(resourceName, 'delete', data);
      };

      resource.on('insert', insertListener);
      resource.on('update', updateListener);
      resource.on('delete', deleteListener);

      this._resourceListeners.set(resourceName, {
        insert: insertListener,
        update: updateListener,
        delete: deleteListener
      });
    }
  }

  /**
   * Remove resource event listeners
   * @private
   */
  private _removeResourceListeners(): void {
    for (const [resourceName, listeners] of this._resourceListeners) {
      const resource = (this.database.resources as any)?.[resourceName];
      if (resource) {
        resource.removeListener('insert', listeners.insert);
        resource.removeListener('update', listeners.update);
        resource.removeListener('delete', listeners.delete);
      }
    }
    this._resourceListeners.clear();
  }

  /**
   * Broadcast resource event to subscribers
   * @private
   */
  private _broadcastResourceEvent(resourceName: string, event: string, data: any): void {
    const subscriberIds = this.subscriptions.get(resourceName);
    if (!subscriberIds || subscriberIds.size === 0) return;
    if (!this.adapter) return;

    const resourceConfig = this.resources[resourceName];
    const filteredData = this._filterProtectedFields(data, resourceConfig);

    const message = {
      type: 'event',
      event,
      resource: resourceName,
      data: filteredData,
      timestamp: new Date().toISOString()
    };

    let delivered = 0;
    for (const socketId of subscriberIds) {
      try {
        this.adapter.send(socketId, message);
        delivered++;
      } catch {
        // Client may have disconnected
      }
    }

    this.metrics.broadcasts++;
    this.logger?.debug({ resourceName, event, delivered }, 'Broadcast sent');
  }

  /**
   * Filter protected fields from data
   * @private
   */
  private _filterProtectedFields(data: any, resourceConfig?: WebSocketResourceConfig): any {
    if (!data || !resourceConfig?.protected) return data;

    const result = { ...data };
    for (const field of resourceConfig.protected) {
      if (field.includes('.')) {
        const parts = field.split('.');
        let current: any = result;
        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]!] && typeof current[parts[i]!] === 'object') {
            current = current[parts[i]!];
          } else {
            break;
          }
        }
        delete current[parts[parts.length - 1]!];
      } else {
        delete result[field];
      }
    }
    return result;
  }

  /**
   * Check resource authorization
   * @private
   */
  private _checkResourceAuth(user: any, resourceConfig: WebSocketResourceConfig, action: string): boolean {
    if (!resourceConfig.auth) return true;

    const allowedRoles = resourceConfig.auth;
    if (Array.isArray(allowedRoles)) {
      return allowedRoles.includes(user?.role);
    }

    return true;
  }

  /**
   * Check rate limit
   * @private
   */
  private _checkRateLimit(socketId: string): boolean {
    const now = Date.now();
    const windowMs = this.rateLimit.windowMs || 60000;
    const maxRequests = this.rateLimit.maxRequests || 100;

    let state = this.rateLimitState.get(socketId);
    if (!state || now - state.windowStart > windowMs) {
      state = { count: 0, windowStart: now };
      this.rateLimitState.set(socketId, state);
    }

    state.count++;
    return state.count <= maxRequests;
  }

  /**
   * Handle health check requests
   * @private
   */
  private async _handleHealthRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    const url = req.url?.split('?')[0];

    if (url === '/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'alive', timestamp: new Date().toISOString() }));
      return true;
    }

    if (url === '/health/ready') {
      const isHealthy = this.adapter !== null && this.database?.isConnected();
      const status = isHealthy ? 200 : 503;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          websocket: { status: this.adapter ? 'healthy' : 'unhealthy', clients: this.adapter?.clientCount || 0 },
          s3db: { status: this.database?.isConnected() ? 'healthy' : 'unhealthy' }
        }
      }));
      return true;
    }

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        connections: this.adapter?.clientCount || 0,
        subscriptions: this.subscriptions.size,
        endpoints: { liveness: '/health/live', readiness: '/health/ready' }
      }));
      return true;
    }

    return false;
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Broadcast message to all clients
   */
  broadcast(message: any, filter: ((client: any) => boolean) | null = null): void {
    if (!this.adapter) return;

    if (!filter) {
      this.adapter.broadcast(message);
    } else {
      const clients = this.adapter.getClients();
      for (const client of clients) {
        const clientWithUser = { ...client, user: this._clientUsers.get(client.id) };
        if (filter(clientWithUser)) {
          this.adapter.send(client.id, message);
        }
      }
    }

    this.metrics.broadcasts++;
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: any): boolean {
    if (!this.adapter) return false;

    const client = this.adapter.getClient(clientId);
    if (client) {
      this.adapter.send(clientId, message);
      return true;
    }
    return false;
  }

  /**
   * Get server info
   */
  getInfo(): any {
    return {
      isRunning: this.adapter !== null,
      port: this.port,
      host: this.host,
      clients: this.adapter?.clientCount || 0,
      subscriptions: Object.fromEntries(
        Array.from(this.subscriptions.entries()).map(([k, v]) => [k, v.size])
      ),
      channels: this._getChannelStats(),
      metrics: { ...this.metrics }
    };
  }

  /**
   * Get connected clients
   */
  getClients(): any[] {
    if (!this.adapter) return [];

    return this.adapter.getClients().map(client => ({
      id: client.id,
      user: this._clientUsers.get(client.id) || null,
      subscriptions: this.adapter?.channels?.getSubscriptions(client.id) || [],
      connectedAt: new Date(client.connectedAt).toISOString(),
      metadata: {
        ip: client.remoteAddress,
        ...client.metadata
      }
    }));
  }

  /**
   * Broadcast to channel members
   */
  _broadcastToChannel(channelName: string, message: any, excludeClientId: string | null = null): number {
    if (!this.adapter?.channels) return 0;

    const subscribers = this.adapter.channels.getSubscribers(channelName);
    let delivered = 0;

    for (const socketId of subscribers) {
      if (excludeClientId && socketId === excludeClientId) continue;
      this.adapter.send(socketId, message);
      delivered++;
    }

    return delivered;
  }

  /**
   * Get channel stats from raffel ChannelManager
   * @private
   */
  private _getChannelStats(): any {
    if (!this.adapter?.channels) return null;

    const channels = this.adapter.channels.getChannels();
    let totalMembers = 0;
    const byType = { public: 0, private: 0, presence: 0, queue: 0 };

    for (const ch of channels) {
      const count = this.adapter.channels.getSubscriberCount(ch);
      totalMembers += count;
      if (ch.startsWith('presence-')) byType.presence++;
      else if (ch.startsWith('private-')) byType.private++;
      else if (ch.startsWith('queue-')) byType.queue++;
      else byType.public++;
    }

    return {
      channels: channels.length,
      totalMembers,
      byType,
      clients: this.adapter.channels.getClientCount()
    };
  }

  /**
   * Get channel info
   */
  getChannelInfo(channelName: string): any | null {
    if (!this.adapter?.channels) return null;
    if (!this.adapter.channels.hasChannel(channelName)) return null;

    const isPresence = channelName.startsWith('presence-');
    return {
      name: channelName,
      type: this._getChannelType(channelName),
      memberCount: this.adapter.channels.getSubscriberCount(channelName),
      members: isPresence ? this.adapter.channels.getMembers(channelName) : undefined
    };
  }

  /**
   * List all channels
   */
  listChannels(options: { type?: string; prefix?: string } = {}): any[] {
    if (!this.adapter?.channels) return [];

    return this.adapter.channels.getChannels()
      .filter(ch => {
        if (options.type) {
          if (this._getChannelType(ch) !== options.type) return false;
        }
        if (options.prefix && !ch.startsWith(options.prefix)) return false;
        return true;
      })
      .map(ch => ({
        name: ch,
        type: this._getChannelType(ch),
        memberCount: this.adapter!.channels!.getSubscriberCount(ch)
      }));
  }

  /**
   * Get members of a presence channel
   */
  getChannelMembers(channelName: string): any[] {
    return this.adapter?.channels?.getMembers(channelName) || [];
  }

  /**
   * Get channel stats
   */
  getChannelStats(): any {
    return this._getChannelStats() || {
      channels: 0,
      totalMembers: 0,
      byType: { public: 0, private: 0, presence: 0, queue: 0 },
      clients: 0
    };
  }

  /**
   * Get the ticket store (only available when ticketAuth is enabled)
   */
  get ticketStore(): any {
    return this._ticketStore;
  }

  /**
   * Generate a single-use connection ticket for a user.
   * The client connects with ?ticket=<ticketId>.
   * Requires ticketAuth to be enabled.
   */
  async generateTicket(userId: string, options?: { ttl?: number; permissions?: string[]; metadata?: Record<string, unknown> }): Promise<{ id: string; userId: string; expiresAt: number }> {
    if (!this._ticketStore) {
      throw new Error('Ticket auth is not enabled. Set ticketAuth: { enabled: true } in WebSocket options.');
    }

    const { generateTicket } = await import('raffel');
    const ticket = generateTicket(userId, {
      ttl: options?.ttl || this.ticketAuth?.ttl || 30_000,
      permissions: options?.permissions,
      metadata: options?.metadata,
    });

    await this._ticketStore.create(ticket);

    return { id: ticket.id, userId: ticket.userId, expiresAt: ticket.expiresAt };
  }
}
