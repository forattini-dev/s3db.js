/**
 * ChannelManager - Manages channels, rooms, and presence for WebSocket plugin
 *
 * Implements channel types:
 * - public-* : Anyone can join, no auth required
 * - private-* : Requires authorization via guard
 * - presence-* : Private + tracks online members with metadata
 *
 * Features:
 * - Join/leave channels
 * - Member presence tracking
 * - Channel-scoped messaging
 * - Member metadata (name, avatar, etc.)
 */
import type { Database } from '../../../database.class.js';
export interface ChannelManagerConfig {
    database: Database;
    authGuard?: Record<string, Function>;
    logLevel?: string;
    logger?: any;
}
export interface MemberInfo {
    id: string;
    clientId: string;
    joinedAt: string;
    name?: string;
    avatar?: string;
    [key: string]: any;
}
export interface ChannelState {
    type: 'public' | 'private' | 'presence';
    members: Map<string, MemberInfo>;
    createdAt: string;
    metadata?: Record<string, any>;
}
export declare class ChannelManager {
    private database;
    private authGuard;
    private logLevel?;
    private logger;
    private channels;
    private clientChannels;
    constructor({ database, authGuard, logLevel, logger }: ChannelManagerConfig);
    /**
     * Get channel type from name
     * @private
     */
    private _getChannelType;
    /**
     * Check if client is authorized to join channel
     * @private
     */
    private _authorizeJoin;
    /**
     * Join a channel
     * @param clientId - Client identifier
     * @param channelName - Channel name (public-*, private-*, presence-*)
     * @param user - Authenticated user object (can be null)
     * @param userInfo - Custom member info for presence channels
     * @returns - { success, channel, members?, error? }
     */
    join(clientId: string, channelName: string, user: any, userInfo?: any): Promise<any>;
    /**
     * Leave a channel
     * @param clientId - Client identifier
     * @param channelName - Channel name
     * @returns - { success, channel, member? }
     */
    leave(clientId: string, channelName: string): any;
    /**
     * Remove client from all channels (on disconnect)
     * @param clientId - Client identifier
     * @returns - List of { channel, member } for each left channel
     */
    leaveAll(clientId: string): Array<{
        channel: string;
        member?: MemberInfo;
    }>;
    /**
     * Get members of a channel
     * @param channelName - Channel name
     * @returns - List of member info objects
     */
    getMembers(channelName: string): MemberInfo[];
    /**
     * Get member count of a channel
     * @param channelName - Channel name
     * @returns
     */
    getMemberCount(channelName: string): number;
    /**
     * Get all clients in a channel (for broadcasting)
     * @param channelName - Channel name
     * @returns - List of client IDs
     */
    getChannelClients(channelName: string): string[];
    /**
     * Check if client is in channel
     * @param clientId - Client identifier
     * @param channelName - Channel name
     * @returns
     */
    isInChannel(clientId: string, channelName: string): boolean;
    /**
     * Get all channels a client is in
     * @param clientId - Client identifier
     * @returns - List of channel names
     */
    getClientChannels(clientId: string): string[];
    /**
     * Get channel info
     * @param channelName - Channel name
     * @returns
     */
    getChannelInfo(channelName: string): ChannelState | null;
    /**
     * List all channels
     * @param options - { type?: string, prefix?: string }
     * @returns
     */
    listChannels(options?: {
        type?: string;
        prefix?: string;
    }): any[];
    /**
     * Update member info (for presence channels)
     * @param clientId - Client identifier
     * @param channelName - Channel name
     * @param userInfo - Updated user info
     * @returns
     */
    updateMemberInfo(clientId: string, channelName: string, userInfo: any): any;
    /**
     * Get stats
     * @returns
     */
    getStats(): any;
}
//# sourceMappingURL=channel-manager.class.d.ts.map