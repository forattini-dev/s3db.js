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

export class WebSocketServer extends EventEmitter {
  constructor(options = {}) {
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
  async start() {
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

    // Create HTTP server for WebSocket upgrade
    this.httpServer = createServer(async (req, res) => {
      // Handle CORS preflight for HTTP fallback
      if (this.cors.enabled) {
        res.setHeader('Access-Control-Allow-Origin', this.cors.origin);
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
    this.wss.on('error', (error) => {
      this.metrics.errors++;
      this.logger?.error({ error: error.message }, 'WebSocket server error');
    });

    // Start listening
    await new Promise((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(this.port, this.host, () => {
        this.httpServer.removeListener('error', reject);
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
  async stop() {
    // Clear all heartbeat timers
    for (const [clientId, timers] of this.heartbeatTimers) {
      clearInterval(timers.ping);
      clearTimeout(timers.timeout);
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
      await new Promise((resolve) => {
        this.wss.close(() => resolve());
      });
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise((resolve) => {
        this.httpServer.close(() => resolve());
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
  async _verifyClient(info, callback) {
    // If no auth configured, allow all
    if (!this.auth.drivers || this.auth.drivers.length === 0) {
      return callback(true);
    }

    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token') ||
        info.req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
        info.req.headers['x-api-key'];

      if (!token && this.auth.required !== false) {
        return callback(false, 401, 'Authentication required');
      }

      // Validate token
      const user = await this._validateToken(token);
      if (!user && this.auth.required !== false) {
        return callback(false, 401, 'Invalid token');
      }

      // Store user info for later retrieval
      info.req._user = user;
      callback(true);
    } catch (error) {
      this.logger?.error({ error: error.message }, 'Auth verification failed');
      callback(false, 401, 'Authentication failed');
    }
  }

  /**
   * Validate authentication token
   * @private
   */
  async _validateToken(token) {
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
            scopes: payload.scopes || payload.scope?.split(' ') || []
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
  _handleConnection(ws, req) {
    const clientId = idGenerator();
    const user = req._user || null;

    // Store client
    this.clients.set(clientId, {
      ws,
      user,
      subscriptions: new Set(),
      connectedAt: new Date().toISOString(),
      lastActivity: Date.now(),
      metadata: {
        ip: req.socket.remoteAddress,
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
    ws.on('message', (data) => this._handleMessage(clientId, data));

    // Handle close
    ws.on('close', (code, reason) => {
      this._handleDisconnect(clientId, code, reason?.toString());
    });

    // Handle errors
    ws.on('error', (error) => {
      this.metrics.errors++;
      this.logger?.error({ clientId, error: error.message }, 'Client error');
    });

    this.emit('client.connected', { clientId, user });
  }

  /**
   * Handle incoming message
   * @private
   */
  async _handleMessage(clientId, data) {
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

    let message;
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
      let response;

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
    } catch (error) {
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
  async _handleSubscribe(clientId, payload) {
    const { resource, filter, events = ['insert', 'update', 'delete'] } = payload;
    const client = this.clients.get(clientId);

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
    this.subscriptions.get(resource).add(clientId);

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
  async _handleUnsubscribe(clientId, payload) {
    const { resource, filter } = payload;
    const client = this.clients.get(clientId);

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
  async _handlePublish(clientId, payload) {
    const { channel, message } = payload;
    const client = this.clients.get(clientId);

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
  async _handleGet(clientId, payload) {
    const { resource, id, partition } = payload;
    const client = this.clients.get(clientId);

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
    const record = await dbResource.get(id, options);

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
  async _handleList(clientId, payload) {
    const { resource, filter, partition, limit = 100, cursor } = payload;
    const client = this.clients.get(clientId);

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

    const options = { limit };
    if (partition) options.partition = partition;
    if (cursor) options.startAfter = cursor;

    let records;
    if (filter && Object.keys(filter).length > 0) {
      records = await dbResource.query(filter, options);
    } else {
      records = await dbResource.list(options);
    }

    // Filter protected fields
    const filtered = records.map(r => this._filterProtectedFields(r, resourceConfig));

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
  async _handleInsert(clientId, payload) {
    const { resource, data } = payload;
    const client = this.clients.get(clientId);

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
  async _handleUpdate(clientId, payload) {
    const { resource, id, data, partition } = payload;
    const client = this.clients.get(clientId);

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
    const record = await dbResource.update(id, data, options);
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
  async _handleDelete(clientId, payload) {
    const { resource, id, partition } = payload;
    const client = this.clients.get(clientId);

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
    await dbResource.delete(id, options);

    return {
      type: 'deleted',
      resource,
      id
    };
  }

  /**
   * Handle client disconnect
   * @private
   */
  _handleDisconnect(clientId, code, reason) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clear heartbeat
    const timers = this.heartbeatTimers.get(clientId);
    if (timers) {
      clearInterval(timers.ping);
      clearTimeout(timers.timeout);
      this.heartbeatTimers.delete(clientId);
    }

    // Remove from all subscriptions
    for (const [resource, subscribers] of this.subscriptions) {
      subscribers.delete(clientId);
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
  _setupHeartbeat(clientId, ws) {
    const ping = setInterval(() => {
      if (ws.readyState === 1) { // OPEN
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
  async _setupResourceListeners() {
    if (!this.database) return;

    for (const resourceName of Object.keys(this.resources)) {
      const resource = this.database.resources?.[resourceName];
      if (!resource) continue;

      const listener = (event, data) => {
        this._broadcastResourceEvent(resourceName, event, data);
      };

      // Listen to resource events
      resource.on('insert', (data) => listener('insert', data));
      resource.on('update', (data) => listener('update', data));
      resource.on('delete', (data) => listener('delete', data));

      this._resourceListeners.set(resourceName, listener);
    }
  }

  /**
   * Remove resource event listeners
   * @private
   */
  _removeResourceListeners() {
    for (const [resourceName, listener] of this._resourceListeners) {
      const resource = this.database.resources?.[resourceName];
      if (resource) {
        resource.removeListener('insert', listener);
        resource.removeListener('update', listener);
        resource.removeListener('delete', listener);
      }
    }
    this._resourceListeners.clear();
  }

  /**
   * Broadcast resource event to subscribers
   * @private
   */
  _broadcastResourceEvent(resourceName, event, data) {
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
      if (client && client.ws.readyState === 1) {
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
  _matchesSubscriptionFilter(client, resourceName, data) {
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
  _filterProtectedFields(data, resourceConfig) {
    if (!data || !resourceConfig?.protected) return data;

    const result = { ...data };
    for (const field of resourceConfig.protected) {
      if (field.includes('.')) {
        // Handle nested fields
        const parts = field.split('.');
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]] && typeof current[parts[i]] === 'object') {
            current = current[parts[i]];
          } else {
            break;
          }
        }
        delete current[parts[parts.length - 1]];
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
  _checkResourceAuth(user, resourceConfig, action) {
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
  _checkRateLimit(clientId) {
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
  _send(ws, message) {
    if (ws.readyState === 1) { // OPEN
      ws.send(JSON.stringify(message));
      this.metrics.messagesSent++;
    }
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message, filter = null) {
    for (const [clientId, client] of this.clients) {
      if (filter && !filter(client)) continue;
      this._send(client.ws, message);
    }
    this.metrics.broadcasts++;
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId, message) {
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
  getInfo() {
    return {
      isRunning: this.wss !== null,
      port: this.port,
      host: this.host,
      clients: this.clients.size,
      subscriptions: Object.fromEntries(
        Array.from(this.subscriptions.entries()).map(([k, v]) => [k, v.size])
      ),
      metrics: { ...this.metrics }
    };
  }

  /**
   * Get connected clients
   */
  getClients() {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      user: client.user ? { id: client.user.id, role: client.user.role } : null,
      subscriptions: Array.from(client.subscriptions),
      connectedAt: client.connectedAt,
      metadata: client.metadata
    }));
  }
}
