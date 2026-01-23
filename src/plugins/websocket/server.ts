/**
 * WebSocket Server - Real-time connection manager for s3db.js resources
 *
 * Handles WebSocket connections, subscriptions, broadcasts, and authentication.
 *
 * @example
 * const server = new WebSocketServer({
 *   port: 3001,
 *   database,
 *   auth: { jwt: { secret: 'my-secret' } }
 * });
 * await server.start();
 */

import { EventEmitter } from 'events';
import { idGenerator } from '../../concerns/id.js';
import { HealthManager } from './server/health-manager.class.js';
import { ChannelManager } from './server/channel-manager.class.js';
import type { Database } from '../../database.class.js';
import type * as http from 'http';
import type {
  WebSocketAuthDriver,
  WebSocketAuth,
  WebSocketResourceConfig,
  WebSocketOptions,
  ClientInfo,
  WebSocketMetrics
} from './types.internal.js';

export type {
  WebSocketAuthDriver,
  WebSocketAuth,
  WebSocketResourceConfig,
  WebSocketOptions,
  ClientInfo
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
  heartbeatTimeout: number;
  maxPayloadSize: number;
  rateLimit: { enabled: boolean; windowMs?: number; maxRequests?: number };
  cors: { enabled: boolean; origin?: string };
  startupBanner: boolean;
  health: { enabled?: boolean; [key: string]: any };
  channels: { enabled?: boolean; guards?: Record<string, Function> };

  wss: any | null; // WebSocketServer
  httpServer: http.Server | null;
  clients: Map<string, ClientInfo>; // clientId -> ClientInfo
  subscriptions: Map<string, Set<string>>; // resourceName -> Set<clientId>
  heartbeatTimers: Map<string, { ping: NodeJS.Timeout; timeout: NodeJS.Timeout | null }>; // clientId -> { ping, timeout }
  rateLimitState: Map<string, { count: number; windowStart: number }>; // clientId -> { count, windowStart }

  _resourceListeners: Map<string, { insert: Function; update: Function; delete: Function }>;

  healthManager: HealthManager | null;
  channelManager: ChannelManager | null;

  metrics: WebSocketMetrics;

  constructor(options: WebSocketOptions) {
    super();

    this.port = options.port || 3001;
    this.host = options.host || '0.0.0.0';
    this.database = options.database;
    this.namespace = options.namespace;
    this.logger = options.logger;
    this.logLevel = options.logLevel;

    // Configuration
    this.auth = options.auth || {};
    this.resources = options.resources || {};
    this.heartbeatInterval = options.heartbeatInterval || 30000;
    this.heartbeatTimeout = options.heartbeatTimeout || 10000;
    this.maxPayloadSize = options.maxPayloadSize || 1024 * 1024; // 1MB
    this.rateLimit = options.rateLimit || { enabled: false };
    this.cors = options.cors || { enabled: true, origin: '*' };
    this.startupBanner = options.startupBanner !== false;
    this.health = options.health ?? { enabled: true };
    this.channels = options.channels || { enabled: true };

    // Runtime state
    this.wss = null;
    this.httpServer = null;
    this.clients = new Map(); // clientId -> { ws, user, subscriptions, metadata }
    this.subscriptions = new Map(); // resourceName -> Set<clientId>
    this.heartbeatTimers = new Map(); // clientId -> { ping, timeout }
    this.rateLimitState = new Map(); // clientId -> { count, windowStart }

    // Resource event listeners
    this._resourceListeners = new Map();

    // Health manager
    this.healthManager = null;

    // Channel manager (presence, rooms)
    this.channelManager = null;

    // Metrics
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
    // @ts-ignore - ws module is dynamically imported
    const { WebSocketServer: WSServer } = await import('ws');
    const { createServer } = await import('http');

    // Initialize health manager if enabled
    if (this.health?.enabled !== false) {
      this.healthManager = new HealthManager({
        database: this.database,
        wsServer: this,
        healthConfig: this.health,
        logLevel: this.logLevel,
        logger: this.logger
      });
    }

    // Initialize channel manager if enabled
    if (this.channels?.enabled !== false) {
      this.channelManager = new ChannelManager({
        database: this.database,
        authGuard: this.channels?.guards || {},
        logLevel: this.logLevel,
        logger: this.logger
      });
    }

    // Create HTTP server for WebSocket upgrade
    this.httpServer = createServer(async (req, res) => {
      // Handle CORS preflight for HTTP fallback
      if (this.cors.enabled) {
        res.setHeader('Access-Control-Allow-Origin', this.cors.origin || '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key');
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check endpoints (Kubernetes-compatible)
      if (this.healthManager && req.url?.startsWith('/health')) {
        const handled = await this.healthManager.handleRequest(req, res);
        if (handled) return;
      }

      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('WebSocket connection required');
    });

    // Create WebSocket server
    this.wss = new WSServer({
      server: this.httpServer,
      maxPayload: this.maxPayloadSize,
      verifyClient: this._verifyClient.bind(this)
    });

    // Handle connections
    this.wss.on('connection', this._handleConnection.bind(this));
    this.wss.on('error', (error: Error) => {
      this.metrics.errors++;
      this.logger?.error({ error: error.message }, 'WebSocket server error');
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject);
      this.httpServer!.listen(this.port, this.host, () => {
        this.httpServer!.removeListener('error', reject);
        resolve();
      });
    });

    // Setup resource listeners
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
    // Clear all heartbeat timers
    for (const [clientId, timers] of this.heartbeatTimers) {
      clearInterval(timers.ping);
      clearTimeout(timers.timeout!);
    }
    this.heartbeatTimers.clear();

    // Remove resource listeners
    this._removeResourceListeners();

    // Close all client connections
    for (const [clientId, client] of this.clients) {
      try {
        client.ws.close(1001, 'Server shutting down');
      } catch (e) {
        // Ignore close errors
      }
    }
    this.clients.clear();
    this.subscriptions.clear();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    if (this.logLevel) {
      this.logger?.info('WebSocket server stopped');
    }

    this.emit('server.stopped');
  }

  /**
   * Verify client connection (authentication)
   * @private
   */
  private async _verifyClient(info: { origin: string; secure: boolean; req: http.IncomingMessage }, callback: (res: boolean, code?: number, message?: string, headers?: http.OutgoingHttpHeaders) => void): Promise<void> {
    // If no auth configured, allow all
    if (!this.auth.drivers || this.auth.drivers.length === 0) {
      return callback(true);
    }

    try {
      const url = new URL(info.req.url || '/', `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token') ||
        info.req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
        info.req.headers['x-api-key'] as string;

      if (!token && this.auth.required !== false) {
        return callback(false, 401, 'Authentication required');
      }

      // Validate token
      const user = await this._validateToken(token);
      if (!user && this.auth.required !== false) {
        return callback(false, 401, 'Invalid token');
      }

      // Store user info for later retrieval
      (info.req as any)._user = user;
      callback(true);
    } catch (error: any) {
      this.logger?.error({ error: error.message }, 'Auth verification failed');
      callback(false, 401, 'Authentication failed');
    }
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
        // Try next driver
        continue;
      }
    }

    return null;
  }

  /**
   * Handle new WebSocket connection
   * @private
   */
  private _handleConnection(ws: any, req: http.IncomingMessage): void {
    const clientId = idGenerator();
    const user = (req as any)._user || null;

    // Store client
    this.clients.set(clientId, {
      ws,
      user,
      subscriptions: new Set(),
      connectedAt: new Date().toISOString(),
      lastActivity: Date.now(),
      metadata: {
        ip: req.socket?.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    });

    this.metrics.connections++;
    this.logger?.debug({ clientId, userId: user?.id }, 'Client connected');

    // Setup heartbeat
    this._setupHeartbeat(clientId, ws);

    // Send welcome message
    this._send(ws, {
      type: 'connected',
      clientId,
      user: user ? { id: user.id, role: user.role } : null,
      timestamp: new Date().toISOString()
    });

    // Handle messages
    ws.on('message', (data: any) => this._handleMessage(clientId, data));

    // Handle close
    ws.on('close', (code: number, reason: Buffer) => {
      this._handleDisconnect(clientId, code, reason?.toString());
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      this.metrics.errors++;
      this.logger?.error({ clientId, error: error.message }, 'Client error');
    });

    this.emit('client.connected', { clientId, user });
  }

  /**
   * Handle incoming message
   * @private
   */
  private async _handleMessage(clientId: string, data: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = Date.now();
    this.metrics.messagesReceived++;

    // Rate limiting
    if (this.rateLimit.enabled && !this._checkRateLimit(clientId)) {
      this._send(client.ws, {
        type: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests'
      });
      return;
    }

    let message: any;
    try {
      message = JSON.parse(data.toString());
    } catch (e) {
      this._send(client.ws, {
        type: 'error',
        code: 'INVALID_JSON',
        message: 'Invalid JSON format'
      });
      return;
    }

    const { type, requestId, ...payload } = message;

    try {
      let response: any;

      switch (type) {
        case 'ping':
          response = { type: 'pong', timestamp: Date.now() };
          break;

        case 'subscribe':
          response = await this._handleSubscribe(clientId, payload);
          break;

        case 'unsubscribe':
          response = await this._handleUnsubscribe(clientId, payload);
          break;

        case 'publish':
          response = await this._handlePublish(clientId, payload);
          break;

        case 'get':
          response = await this._handleGet(clientId, payload);
          break;

        case 'list':
          response = await this._handleList(clientId, payload);
          break;

        case 'insert':
          response = await this._handleInsert(clientId, payload);
          break;

        case 'update':
          response = await this._handleUpdate(clientId, payload);
          break;

        case 'delete':
          response = await this._handleDelete(clientId, payload);
          break;

        // Channel operations
        case 'join':
          response = await this._handleJoinChannel(clientId, payload);
          break;

        case 'leave':
          response = await this._handleLeaveChannel(clientId, payload);
          break;

        case 'channel:message':
          response = await this._handleChannelMessage(clientId, payload);
          break;

        case 'channel:update':
          response = await this._handleChannelUpdate(clientId, payload);
          break;

        default:
          response = {
            type: 'error',
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: `Unknown message type: ${type}`
          };
      }

      if (requestId) {
        response.requestId = requestId;
      }

      this._send(client.ws, response);
    } catch (error: any) {
      this.metrics.errors++;
      this.logger?.error({ clientId, type, error: error.message }, 'Message handler error');

      this._send(client.ws, {
        type: 'error',
        requestId,
        code: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }

  /**
   * Handle subscribe request
   * @private
   */
  private async _handleSubscribe(clientId: string, payload: any): Promise<any> {
    const { resource, filter, events = ['insert', 'update', 'delete'] } = payload;
    const client = this.clients.get(clientId)!;

    // Check if resource exists and is allowed
    const resourceConfig = this.resources[resource];
    if (!resourceConfig && Object.keys(this.resources).length > 0) {
      return {
        type: 'error',
        code: 'RESOURCE_NOT_FOUND',
        message: `Resource "${resource}" not configured for WebSocket access`
      };
    }

    // Check authorization
    if (resourceConfig?.auth && client.user) {
      const allowed = this._checkResourceAuth(client.user, resourceConfig, 'subscribe');
      if (!allowed) {
        return {
          type: 'error',
          code: 'FORBIDDEN',
          message: `Not authorized to subscribe to "${resource}"`
        };
      }
    }

    // Add subscription
    const subscriptionKey = `${resource}:${JSON.stringify(filter || {})}`;
    client.subscriptions.add(subscriptionKey);

    if (!this.subscriptions.has(resource)) {
      this.subscriptions.set(resource, new Set());
    }
    this.subscriptions.get(resource)!.add(clientId);

    this.logger?.debug({ clientId, resource, filter }, 'Client subscribed');

    return {
      type: 'subscribed',
      resource,
      filter,
      events
    };
  }

  /**
   * Handle unsubscribe request
   * @private
   */
  private async _handleUnsubscribe(clientId: string, payload: any): Promise<any> {
    const { resource, filter } = payload;
    const client = this.clients.get(clientId)!;

    const subscriptionKey = `${resource}:${JSON.stringify(filter || {})}`;
    client.subscriptions.delete(subscriptionKey);

    // Check if client has any other subscriptions to this resource
    const hasOtherSubs = Array.from(client.subscriptions).some(k => k.startsWith(`${resource}:`));
    if (!hasOtherSubs) {
      this.subscriptions.get(resource)?.delete(clientId);
    }

    this.logger?.debug({ clientId, resource }, 'Client unsubscribed');

    return {
      type: 'unsubscribed',
      resource,
      filter
    };
  }

  /**
   * Handle publish request (custom message to subscribers)
   * @private
   */
  private async _handlePublish(clientId: string, payload: any): Promise<any> {
    const { channel, message } = payload;
    const client = this.clients.get(clientId)!;

    // Check if client can publish
    const resourceConfig = this.resources[channel];
    if (resourceConfig?.publishAuth && client.user) {
      const allowed = this._checkResourceAuth(client.user, resourceConfig, 'publish');
      if (!allowed) {
        return {
          type: 'error',
          code: 'FORBIDDEN',
          message: `Not authorized to publish to "${channel}"`
        };
      }
    }

    // Broadcast to subscribers
    const subscriberIds = this.subscriptions.get(channel) || new Set();
    let delivered = 0;

    for (const subscriberId of subscriberIds) {
      if (subscriberId === clientId) continue; // Don't send to self

      const subscriber = this.clients.get(subscriberId);
      if (subscriber) {
        this._send(subscriber.ws, {
          type: 'message',
          channel,
          from: clientId,
          data: message,
          timestamp: new Date().toISOString()
        });
        delivered++;
      }
    }

    return {
      type: 'published',
      channel,
      delivered
    };
  }

  /**
   * Handle get request
   * @private
   */
  private async _handleGet(clientId: string, payload: any): Promise<any> {
    const { resource, id, partition } = payload;
    const client = this.clients.get(clientId)!;

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    // Check authorization
    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.get) {
      const allowed = await resourceConfig.guard.get(client.user, { id, partition });
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
    }

    const options = partition ? { partition } : {};
    const record = await (dbResource as any).get(id, options);

    if (!record) {
      return { type: 'error', code: 'NOT_FOUND', message: 'Record not found' };
    }

    // Filter protected fields
    const filtered = this._filterProtectedFields(record, resourceConfig);

    return {
      type: 'data',
      resource,
      data: filtered
    };
  }

  /**
   * Handle list request
   * @private
   */
  private async _handleList(clientId: string, payload: any): Promise<any> {
    const { resource, filter, partition, limit = 100, cursor } = payload;
    const client = this.clients.get(clientId)!;

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    // Check authorization
    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.list) {
      const guardResult = await resourceConfig.guard.list(client.user, { filter, partition });
      if (guardResult === false) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
      // Guard can return filter object
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

    // Filter protected fields
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
  private async _handleInsert(clientId: string, payload: any): Promise<any> {
    const { resource, data } = payload;
    const client = this.clients.get(clientId)!;

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    // Check authorization
    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.create) {
      const allowed = await resourceConfig.guard.create(client.user, data);
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
    }

    const record = await dbResource.insert(data);
    const filtered = this._filterProtectedFields(record, resourceConfig);

    return {
      type: 'inserted',
      resource,
      data: filtered
    };
  }

  /**
   * Handle update request
   * @private
   */
  private async _handleUpdate(clientId: string, payload: any): Promise<any> {
    const { resource, id, data, partition } = payload;
    const client = this.clients.get(clientId)!;

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    // Check authorization
    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.update) {
      const allowed = await resourceConfig.guard.update(client.user, { id, data, partition });
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
    }

    const options = partition ? { partition } : {};
    const record = await (dbResource as any).update(id, data, options);
    const filtered = this._filterProtectedFields(record, resourceConfig);

    return {
      type: 'updated',
      resource,
      data: filtered
    };
  }

  /**
   * Handle delete request
   * @private
   */
  private async _handleDelete(clientId: string, payload: any): Promise<any> {
    const { resource, id, partition } = payload;
    const client = this.clients.get(clientId)!;

    const dbResource = this.database.resources?.[resource];
    if (!dbResource) {
      return { type: 'error', code: 'RESOURCE_NOT_FOUND', message: `Resource "${resource}" not found` };
    }

    // Check authorization
    const resourceConfig = this.resources[resource];
    if (resourceConfig?.guard?.delete) {
      const allowed = await resourceConfig.guard.delete(client.user, { id, partition });
      if (!allowed) {
        return { type: 'error', code: 'FORBIDDEN', message: 'Access denied' };
      }
    }

    const options = partition ? { partition } : {};
    await (dbResource as any).delete(id, options);

    return {
      type: 'deleted',
      resource,
      id
    };
  }

  /**
   * Handle join channel request
   * @private
   */
  private async _handleJoinChannel(clientId: string, payload: any): Promise<any> {
    const { channel, userInfo = {} } = payload;
    const client = this.clients.get(clientId)!;

    if (!this.channelManager) {
      return {
        type: 'error',
        code: 'CHANNELS_DISABLED',
        message: 'Channels feature is disabled'
      };
    }

    if (!channel) {
      return {
        type: 'error',
        code: 'INVALID_REQUEST',
        message: 'Channel name is required'
      };
    }

    const result = await this.channelManager.join(clientId, channel, client.user, userInfo);

    if (!result.success) {
      return {
        type: 'error',
        code: result.code || 'JOIN_FAILED',
        message: result.error
      };
    }

    // For presence channels, broadcast member_joined to other members
    if (result.type === 'presence') {
      this._broadcastToChannel(channel, {
        type: 'presence:member_joined',
        channel,
        member: result.me,
        timestamp: new Date().toISOString()
      }, clientId); // Exclude the joining client
    }

    this.emit('channel.joined', { clientId, channel, type: result.type });

    return {
      type: 'channel:joined',
      channel,
      channelType: result.type,
      members: result.members,
      me: result.me
    };
  }

  /**
   * Handle leave channel request
   * @private
   */
  private async _handleLeaveChannel(clientId: string, payload: any): Promise<any> {
    const { channel } = payload;

    if (!this.channelManager) {
      return {
        type: 'error',
        code: 'CHANNELS_DISABLED',
        message: 'Channels feature is disabled'
      };
    }

    if (!channel) {
      return {
        type: 'error',
        code: 'INVALID_REQUEST',
        message: 'Channel name is required'
      };
    }

    const channelInfo = this.channelManager.getChannelInfo(channel);
    const result = this.channelManager.leave(clientId, channel);

    if (!result.success) {
      return {
        type: 'error',
        code: result.code || 'LEAVE_FAILED',
        message: result.error
      };
    }

    // For presence channels, broadcast member_left to remaining members
    if (channelInfo?.type === 'presence' && result.member) {
      this._broadcastToChannel(channel, {
        type: 'presence:member_left',
        channel,
        member: result.member,
        timestamp: new Date().toISOString()
      });
    }

    this.emit('channel.left', { clientId, channel });

    return {
      type: 'channel:left',
      channel
    };
  }

  /**
   * Handle channel message (broadcast to channel members)
   * @private
   */
  private async _handleChannelMessage(clientId: string, payload: any): Promise<any> {
    const { channel, data, event = 'message' } = payload;
    const client = this.clients.get(clientId)!;

    if (!this.channelManager) {
      return {
        type: 'error',
        code: 'CHANNELS_DISABLED',
        message: 'Channels feature is disabled'
      };
    }

    if (!channel || data === undefined) {
      return {
        type: 'error',
        code: 'INVALID_REQUEST',
        message: 'Channel and data are required'
      };
    }

    // Check if client is in the channel
    if (!this.channelManager.isInChannel(clientId, channel)) {
      return {
        type: 'error',
        code: 'NOT_IN_CHANNEL',
        message: 'You must join the channel first'
      };
    }

    // Broadcast to all members except sender
    const delivered = this._broadcastToChannel(channel, {
      type: 'channel:message',
      channel,
      event,
      data,
      from: {
        clientId,
        userId: client.user?.id
      },
      timestamp: new Date().toISOString()
    }, clientId);

    return {
      type: 'channel:sent',
      channel,
      delivered
    };
  }

  /**
   * Handle channel update (update member info in presence channel)
   * @private
   */
  private async _handleChannelUpdate(clientId: string, payload: any): Promise<any> {
    const { channel, userInfo } = payload;

    if (!this.channelManager) {
      return {
        type: 'error',
        code: 'CHANNELS_DISABLED',
        message: 'Channels feature is disabled'
      };
    }

    if (!channel || !userInfo) {
      return {
        type: 'error',
        code: 'INVALID_REQUEST',
        message: 'Channel and userInfo are required'
      };
    }

    const result = this.channelManager.updateMemberInfo(clientId, channel, userInfo);

    if (!result.success) {
      return {
        type: 'error',
        code: 'UPDATE_FAILED',
        message: result.error
      };
    }

    // Broadcast member_updated to other members
    this._broadcastToChannel(channel, {
      type: 'presence:member_updated',
      channel,
      member: result.member,
      timestamp: new Date().toISOString()
    }, clientId);

    return {
      type: 'channel:updated',
      channel,
      member: result.member
    };
  }

  /**
   * Broadcast message to all members in a channel
   */
  _broadcastToChannel(channelName: string, message: any, excludeClientId: string | null = null): number {
    if (!this.channelManager) return 0;

    const clientIds = this.channelManager.getChannelClients(channelName);
    let delivered = 0;

    for (const clientId of clientIds) {
      if (excludeClientId && clientId === excludeClientId) continue;

      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === 1) { // 1 = WebSocket.OPEN
        this._send(client.ws, message);
        delivered++;
      }
    }

    return delivered;
  }

  /**
   * Handle client disconnect
   * @private
   */
  private _handleDisconnect(clientId: string, code: number, reason: string | undefined): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clear heartbeat
    const timers = this.heartbeatTimers.get(clientId);
    if (timers) {
      clearInterval(timers.ping);
      clearTimeout(timers.timeout!);
      this.heartbeatTimers.delete(clientId);
    }

    // Remove from all subscriptions
    for (const [resource, subscribers] of this.subscriptions) {
      subscribers.delete(clientId);
    }

    // Remove from all channels and broadcast presence:member_left
    if (this.channelManager) {
      const leftChannels = this.channelManager.leaveAll(clientId);
      for (const { channel, member } of leftChannels) {
        if (member) {
          // This was a presence channel, broadcast member_left
          this._broadcastToChannel(channel, {
            type: 'presence:member_left',
            channel,
            member,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Remove client
    this.clients.delete(clientId);
    this.rateLimitState.delete(clientId);

    this.metrics.disconnections++;
    this.logger?.debug({ clientId, code, reason }, 'Client disconnected');

    this.emit('client.disconnected', { clientId, code, reason });
  }

  /**
   * Setup heartbeat for client
   * @private
   */
  private _setupHeartbeat(clientId: string, ws: any): void {
    const ping = setInterval(() => {
      if (ws.readyState === 1) { // 1 = WebSocket.OPEN
        ws.ping();

        // Set timeout for pong response
        const timeout = setTimeout(() => {
          this.logger?.warn({ clientId }, 'Heartbeat timeout, closing connection');
          ws.terminate();
        }, this.heartbeatTimeout);

        this.heartbeatTimers.set(clientId, { ping, timeout });
      }
    }, this.heartbeatInterval);

    ws.on('pong', () => {
      const timers = this.heartbeatTimers.get(clientId);
      if (timers?.timeout) {
        clearTimeout(timers.timeout);
      }
    });

    this.heartbeatTimers.set(clientId, { ping, timeout: null });
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
    for (const clientId of subscriberIds) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === 1) { // 1 = WebSocket.OPEN
        // Check if client's subscription filter matches
        if (this._matchesSubscriptionFilter(client, resourceName, data)) {
          this._send(client.ws, message);
          delivered++;
        }
      }
    }

    this.metrics.broadcasts++;
    this.logger?.debug({ resourceName, event, delivered }, 'Broadcast sent');
  }

  /**
   * Check if data matches client's subscription filter
   * @private
   */
  private _matchesSubscriptionFilter(client: ClientInfo, resourceName: string, data: any): boolean {
    for (const subKey of client.subscriptions) {
      if (!subKey.startsWith(`${resourceName}:`)) continue;

      const filterJson = subKey.slice(resourceName.length + 1);
      const filter = JSON.parse(filterJson);

      if (Object.keys(filter).length === 0) return true;

      // Simple field matching
      for (const [key, value] of Object.entries(filter)) {
        if (data[key] !== value) return false;
      }
      return true;
    }
    return false;
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
        // Handle nested fields
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

    // More complex auth logic can be added here
    return true;
  }

  /**
   * Check rate limit
   * @private
   */
  private _checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const windowMs = this.rateLimit.windowMs || 60000;
    const maxRequests = this.rateLimit.maxRequests || 100;

    let state = this.rateLimitState.get(clientId);
    if (!state || now - state.windowStart > windowMs) {
      state = { count: 0, windowStart: now };
      this.rateLimitState.set(clientId, state);
    }

    state.count++;
    return state.count <= maxRequests;
  }

  /**
   * Send message to client
   * @private
   */
  private _send(ws: any, message: any): void {
    if (ws.readyState === 1) { // 1 = WebSocket.OPEN
      ws.send(JSON.stringify(message));
      this.metrics.messagesSent++;
    }
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: any, filter: ((client: ClientInfo) => boolean) | null = null): void {
    for (const [clientId, client] of this.clients) {
      if (filter && !filter(client)) continue;
      this._send(client.ws, message);
    }
    this.metrics.broadcasts++;
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: any): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      this._send(client.ws, message);
      return true;
    }
    return false;
  }

  /**
   * Get server info
   */
  getInfo(): any {
    return {
      isRunning: this.wss !== null,
      port: this.port,
      host: this.host,
      clients: this.clients.size,
      subscriptions: Object.fromEntries(
        Array.from(this.subscriptions.entries()).map(([k, v]) => [k, v.size])
      ),
      channels: this.channelManager?.getStats() || null,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Get connected clients
   */
  getClients(): any[] {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      user: client.user ? { id: client.user.id, role: client.user.role } : null,
      subscriptions: Array.from(client.subscriptions),
      connectedAt: client.connectedAt,
      metadata: client.metadata
    }));
  }
}
