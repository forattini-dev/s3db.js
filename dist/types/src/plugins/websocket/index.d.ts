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
import { WebSocketServer, WebSocketOptions } from './server.js';
export declare class WebSocketPlugin extends Plugin {
    config: WebSocketOptions;
    server: WebSocketServer | null;
    constructor(options?: Partial<WebSocketOptions>);
    /**
     * Validate plugin dependencies
     * @private
     */
    private _validateDependencies;
    /**
     * Install plugin
     */
    onInstall(): Promise<void>;
    /**
     * Start plugin
     */
    onStart(): Promise<void>;
    /**
     * Check if port is available
     * @private
     */
    private _checkPortAvailability;
    /**
     * Stop plugin
     */
    onStop(): Promise<void>;
    /**
     * Uninstall plugin
     */
    onUninstall(options?: any): Promise<void>;
    /**
     * Get server information
     */
    getServerInfo(): any;
    /**
     * Get connected clients
     */
    getClients(): any[];
    /**
     * Broadcast message to all connected clients
     * @param message - Message to broadcast
     * @param filter - Optional filter function (client) => boolean
     */
    broadcast(message: any, filter?: ((client: any) => boolean) | null): void;
    /**
     * Send message to specific client
     * @param clientId - Client ID
     * @param message - Message to send
     */
    sendToClient(clientId: string, message: any): boolean;
    /**
     * Broadcast to clients subscribed to a specific resource
     * @param resource - Resource name
     * @param message - Message to send
     */
    broadcastToResource(resource: string, message: any): void;
    /**
     * Get metrics
     */
    getMetrics(): any;
    /**
     * Get channel info
     * @param channelName - Channel name
     * @returns
     */
    getChannel(channelName: string): any | null;
    /**
     * List all channels
     * @param options - { type?: 'public'|'private'|'presence', prefix?: string }
     * @returns
     */
    listChannels(options?: {
        type?: 'public' | 'private' | 'presence';
        prefix?: string;
    }): any[];
    /**
     * Get members in a presence channel
     * @param channelName - Channel name
     * @returns
     */
    getChannelMembers(channelName: string): any[];
    /**
     * Broadcast message to all members in a channel
     * @param channelName - Channel name
     * @param message - Message to broadcast
     * @param excludeClientId - Optional client to exclude
     */
    broadcastToChannel(channelName: string, message: any, excludeClientId?: string | null): number;
    /**
     * Get channel statistics
     * @returns
     */
    getChannelStats(): any;
}
export { WebSocketServer };
export { ChannelManager } from './server/channel-manager.class.js';
//# sourceMappingURL=index.d.ts.map