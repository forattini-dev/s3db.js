/**
 * WebSocket Plugin - Real-time communication for s3db.js resources
 *
 * Provides WebSocket server with real-time subscriptions, broadcasts, and CRUD operations.
 *
 * Features:
 * - Real-time subscriptions to resource changes (insert/update/delete)
 * - Multiple authentication methods (JWT, API Key)
 * - Guards for row-level security
 * - Protected fields filtering
 * - Rate limiting
 * - Heartbeat/ping-pong for connection health
 * - Custom message publishing
 *
 * @example
 * const wsPlugin = new WebSocketPlugin({
 *   port: 3001,
 *   auth: {
 *     drivers: [{ driver: 'jwt', config: { secret: 'my-secret' } }]
 *   },
 *   resources: {
 *     users: {
 *       auth: ['admin', 'user'],
 *       protected: ['password', 'apiToken'],
 *       guard: {
 *         list: async (user) => user?.role === 'admin' ? true : { userId: user.id }
 *       }
 *     }
 *   }
 * });
 *
 * await database.usePlugin(wsPlugin);
 */

import { Plugin } from '../plugin.class.js';
import { requirePluginDependency } from '../concerns/plugin-dependencies.js';
import { WebSocketServer } from './server.js';
import { normalizeAuthConfig } from './config/normalize-auth.js';
import { normalizeResourcesConfig } from './config/normalize-resources.js';

export class WebSocketPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    // Normalize configurations
    const normalizedAuth = normalizeAuthConfig(options.auth, this.logger);

    this.config = {
      // Server configuration
      port: options.port || 3001,
      host: options.host || '0.0.0.0',
      logLevel: this.logLevel,
      startupBanner: options.startupBanner !== false,

      // Authentication
      auth: normalizedAuth,

      // Resources configuration
      resources: normalizeResourcesConfig(options.resources, this.logger),

      // Connection settings
      heartbeatInterval: options.heartbeatInterval || 30000,
      heartbeatTimeout: options.heartbeatTimeout || 10000,
      maxPayloadSize: options.maxPayloadSize || 1024 * 1024, // 1MB

      // Rate limiting
      rateLimit: {
        enabled: options.rateLimit?.enabled || false,
        windowMs: options.rateLimit?.windowMs || 60000,
        maxRequests: options.rateLimit?.maxRequests || 100
      },

      // CORS for HTTP upgrade
      cors: {
        enabled: options.cors?.enabled !== false,
        origin: options.cors?.origin || '*'
      },

      // Health checks (Kubernetes-compatible)
      health: typeof options.health === 'object'
        ? options.health
        : { enabled: options.health !== false },

      // Channels (presence, rooms)
      channels: typeof options.channels === 'object'
        ? options.channels
        : { enabled: options.channels !== false },

      // Custom message handlers
      messageHandlers: options.messageHandlers || {}
    };

    this.server = null;
  }

  /**
   * Validate plugin dependencies
   * @private
   */
  async _validateDependencies() {
    await requirePluginDependency('websocket-plugin', {
      throwOnError: true,
      checkVersions: true
    });
  }

  /**
   * Install plugin
   */
  async onInstall() {
    if (this.logLevel) {
      this.logger.info('Installing WebSocket plugin...');
    }

    // Validate dependencies
    try {
      await this._validateDependencies();
    } catch (err) {
      if (this.logLevel) {
        this.logger.error({ error: err.message }, 'Dependency validation failed');
      }
      throw err;
    }

    if (this.logLevel) {
      this.logger.info('WebSocket plugin installed successfully');
    }
  }

  /**
   * Start plugin
   */
  async onStart() {
    if (this.logLevel) {
      this.logger.info('Starting WebSocket server...');
    }

    // Create server instance
    this.server = new WebSocketServer({
      port: this.config.port,
      host: this.config.host,
      database: this.database,
      namespace: this.namespace,
      auth: this.config.auth,
      resources: this.config.resources,
      heartbeatInterval: this.config.heartbeatInterval,
      heartbeatTimeout: this.config.heartbeatTimeout,
      maxPayloadSize: this.config.maxPayloadSize,
      rateLimit: this.config.rateLimit,
      cors: this.config.cors,
      health: this.config.health,
      channels: this.config.channels,
      startupBanner: this.config.startupBanner,
      logLevel: this.logLevel,
      logger: this.logger
    });

    // Forward server events
    this.server.on('server.started', (data) => this.emit('server.started', data));
    this.server.on('server.stopped', () => this.emit('server.stopped'));
    this.server.on('client.connected', (data) => this.emit('client.connected', data));
    this.server.on('client.disconnected', (data) => this.emit('client.disconnected', data));

    // Check port availability
    await this._checkPortAvailability(this.config.port, this.config.host);

    // Start server
    await this.server.start();

    this.emit('plugin.started', {
      port: this.config.port,
      host: this.config.host
    });
  }

  /**
   * Check if port is available
   * @private
   */
  async _checkPortAvailability(port, host) {
    const { createServer } = await import('net');
    return new Promise((resolve, reject) => {
      const server = createServer();

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use. Please choose a different port.`));
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

  /**
   * Stop plugin
   */
  async onStop() {
    if (this.logLevel) {
      this.logger.info('Stopping WebSocket server...');
    }

    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }

  /**
   * Uninstall plugin
   */
  async onUninstall(options = {}) {
    await this.onStop();

    if (this.logLevel) {
      this.logger.info('WebSocket plugin uninstalled');
    }
  }

  /**
   * Get server information
   */
  getServerInfo() {
    return this.server ? this.server.getInfo() : { isRunning: false };
  }

  /**
   * Get connected clients
   */
  getClients() {
    return this.server ? this.server.getClients() : [];
  }

  /**
   * Broadcast message to all connected clients
   * @param {Object} message - Message to broadcast
   * @param {Function} filter - Optional filter function (client) => boolean
   */
  broadcast(message, filter = null) {
    if (this.server) {
      this.server.broadcast(message, filter);
    }
  }

  /**
   * Send message to specific client
   * @param {string} clientId - Client ID
   * @param {Object} message - Message to send
   */
  sendToClient(clientId, message) {
    if (this.server) {
      return this.server.sendToClient(clientId, message);
    }
    return false;
  }

  /**
   * Broadcast to clients subscribed to a specific resource
   * @param {string} resource - Resource name
   * @param {Object} message - Message to send
   */
  broadcastToResource(resource, message) {
    if (!this.server) return;

    this.server.broadcast(message, (client) => {
      return Array.from(client.subscriptions).some(sub => sub.startsWith(`${resource}:`));
    });
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return this.server?.getInfo()?.metrics || {
      connections: 0,
      disconnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      broadcasts: 0,
      errors: 0
    };
  }

  // ============================================
  // Channel Methods
  // ============================================

  /**
   * Get channel info
   * @param {string} channelName - Channel name
   * @returns {Object|null}
   */
  getChannel(channelName) {
    return this.server?.channelManager?.getChannelInfo(channelName) || null;
  }

  /**
   * List all channels
   * @param {Object} options - { type?: 'public'|'private'|'presence', prefix?: string }
   * @returns {Array}
   */
  listChannels(options = {}) {
    return this.server?.channelManager?.listChannels(options) || [];
  }

  /**
   * Get members in a presence channel
   * @param {string} channelName - Channel name
   * @returns {Array}
   */
  getChannelMembers(channelName) {
    return this.server?.channelManager?.getMembers(channelName) || [];
  }

  /**
   * Broadcast message to all members in a channel
   * @param {string} channelName - Channel name
   * @param {Object} message - Message to broadcast
   * @param {string} excludeClientId - Optional client to exclude
   */
  broadcastToChannel(channelName, message, excludeClientId = null) {
    if (!this.server) return 0;
    return this.server._broadcastToChannel(channelName, message, excludeClientId);
  }

  /**
   * Get channel statistics
   * @returns {Object}
   */
  getChannelStats() {
    return this.server?.channelManager?.getStats() || {
      channels: 0,
      totalMembers: 0,
      byType: { public: 0, private: 0, presence: 0 },
      clients: 0
    };
  }
}

// Export server class for advanced usage
export { WebSocketServer };

// Export channel manager for advanced usage
export { ChannelManager } from './server/channel-manager.class.js';
