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
import { HealthManager } from './server/health-manager.class.js';
import { ChannelManager } from './server/channel-manager.class.js';
import type { Database } from '../../database.class.js';
import type * as http from 'http';
export interface WebSocketAuthDriver {
    driver: 'jwt' | 'apiKey';
    config?: any;
}
export interface WebSocketAuth {
    drivers?: WebSocketAuthDriver[];
    required?: boolean;
}
export interface WebSocketResourceConfig {
    auth?: string[] | Record<string, any>;
    protected?: string[];
    guard?: {
        get?: Function;
        list?: Function;
        create?: Function;
        update?: Function;
        delete?: Function;
    };
    publishAuth?: string[] | Record<string, any>;
}
export interface WebSocketOptions {
    port?: number;
    host?: string;
    database: Database;
    namespace?: string;
    logger?: any;
    logLevel?: string;
    auth?: WebSocketAuth;
    resources?: Record<string, WebSocketResourceConfig>;
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
    maxPayloadSize?: number;
    rateLimit?: {
        enabled: boolean;
        windowMs?: number;
        maxRequests?: number;
    };
    cors?: {
        enabled: boolean;
        origin?: string;
    };
    startupBanner?: boolean;
    health?: {
        enabled?: boolean;
        [key: string]: any;
    };
    channels?: {
        enabled?: boolean;
        guards?: Record<string, Function>;
    };
    messageHandlers?: Record<string, Function>;
}
export interface ClientInfo {
    ws: any;
    user: any | null;
    subscriptions: Set<string>;
    connectedAt: string;
    lastActivity: number;
    metadata: {
        ip?: string;
        userAgent?: string;
    };
}
export declare class WebSocketServer extends EventEmitter {
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
    rateLimit: {
        enabled: boolean;
        windowMs?: number;
        maxRequests?: number;
    };
    cors: {
        enabled: boolean;
        origin?: string;
    };
    startupBanner: boolean;
    health: {
        enabled?: boolean;
        [key: string]: any;
    };
    channels: {
        enabled?: boolean;
        guards?: Record<string, Function>;
    };
    wss: any | null;
    httpServer: http.Server | null;
    clients: Map<string, ClientInfo>;
    subscriptions: Map<string, Set<string>>;
    heartbeatTimers: Map<string, {
        ping: NodeJS.Timeout;
        timeout: NodeJS.Timeout | null;
    }>;
    rateLimitState: Map<string, {
        count: number;
        windowStart: number;
    }>;
    _resourceListeners: Map<string, Function>;
    healthManager: HealthManager | null;
    channelManager: ChannelManager | null;
    metrics: {
        connections: number;
        disconnections: number;
        messagesReceived: number;
        messagesSent: number;
        broadcasts: number;
        errors: number;
    };
    constructor(options: WebSocketOptions);
    /**
     * Start WebSocket server
     */
    start(): Promise<void>;
    /**
     * Stop WebSocket server
     */
    stop(): Promise<void>;
    /**
     * Verify client connection (authentication)
     * @private
     */
    private _verifyClient;
    /**
     * Validate authentication token
     * @private
     */
    private _validateToken;
    /**
     * Handle new WebSocket connection
     * @private
     */
    private _handleConnection;
    /**
     * Handle incoming message
     * @private
     */
    private _handleMessage;
    /**
     * Handle subscribe request
     * @private
     */
    private _handleSubscribe;
    /**
     * Handle unsubscribe request
     * @private
     */
    private _handleUnsubscribe;
    /**
     * Handle publish request (custom message to subscribers)
     * @private
     */
    private _handlePublish;
    /**
     * Handle get request
     * @private
     */
    private _handleGet;
    /**
     * Handle list request
     * @private
     */
    private _handleList;
    /**
     * Handle insert request
     * @private
     */
    private _handleInsert;
    /**
     * Handle update request
     * @private
     */
    private _handleUpdate;
    /**
     * Handle delete request
     * @private
     */
    private _handleDelete;
    /**
     * Handle join channel request
     * @private
     */
    private _handleJoinChannel;
    /**
     * Handle leave channel request
     * @private
     */
    private _handleLeaveChannel;
    /**
     * Handle channel message (broadcast to channel members)
     * @private
     */
    private _handleChannelMessage;
    /**
     * Handle channel update (update member info in presence channel)
     * @private
     */
    private _handleChannelUpdate;
    /**
     * Broadcast message to all members in a channel
     */
    _broadcastToChannel(channelName: string, message: any, excludeClientId?: string | null): number;
    /**
     * Handle client disconnect
     * @private
     */
    private _handleDisconnect;
    /**
     * Setup heartbeat for client
     * @private
     */
    private _setupHeartbeat;
    /**
     * Setup resource event listeners for broadcasting
     * @private
     */
    private _setupResourceListeners;
    /**
     * Remove resource event listeners
     * @private
     */
    private _removeResourceListeners;
    /**
     * Broadcast resource event to subscribers
     * @private
     */
    private _broadcastResourceEvent;
    /**
     * Check if data matches client's subscription filter
     * @private
     */
    private _matchesSubscriptionFilter;
    /**
     * Filter protected fields from data
     * @private
     */
    private _filterProtectedFields;
    /**
     * Check resource authorization
     * @private
     */
    private _checkResourceAuth;
    /**
     * Check rate limit
     * @private
     */
    private _checkRateLimit;
    /**
     * Send message to client
     * @private
     */
    private _send;
    /**
     * Broadcast message to all clients
     */
    broadcast(message: any, filter?: ((client: ClientInfo) => boolean) | null): void;
    /**
     * Send message to specific client
     */
    sendToClient(clientId: string, message: any): boolean;
    /**
     * Get server info
     */
    getInfo(): any;
    /**
     * Get connected clients
     */
    getClients(): any[];
}
//# sourceMappingURL=server.d.ts.map