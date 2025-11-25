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

import { createLogger } from '../../../concerns/logger.js';

export class ChannelManager {
  constructor({ database, authGuard, logLevel, logger }) {
    this.database = database;
    this.authGuard = authGuard || {};
    this.logLevel = logLevel;

    if (logger) {
      this.logger = logger;
    } else {
      this.logger = createLogger({
        name: 'WS:ChannelManager',
        level: logLevel || 'info'
      });
    }

    // Channel state
    // channelName -> { type, members: Map<clientId, memberInfo>, metadata }
    this.channels = new Map();

    // Client to channels mapping for cleanup
    // clientId -> Set<channelName>
    this.clientChannels = new Map();
  }

  /**
   * Get channel type from name
   * @private
   */
  _getChannelType(channelName) {
    if (channelName.startsWith('presence-')) return 'presence';
    if (channelName.startsWith('private-')) return 'private';
    return 'public';
  }

  /**
   * Check if client is authorized to join channel
   * @private
   */
  async _authorizeJoin(channelName, user, userInfo) {
    const type = this._getChannelType(channelName);

    // Public channels - always allowed
    if (type === 'public') {
      return { authorized: true };
    }

    // Private and presence channels need auth
    if (!user) {
      return { authorized: false, reason: 'Authentication required' };
    }

    // Check custom guard if provided
    const guardKey = channelName.replace(/^(presence-|private-)/, '');
    const guard = this.authGuard[guardKey] || this.authGuard['*'];

    if (guard) {
      try {
        const result = await guard(user, channelName, userInfo);
        if (result === false) {
          return { authorized: false, reason: 'Access denied by guard' };
        }
        if (typeof result === 'object' && result.authorized === false) {
          return { authorized: false, reason: result.reason || 'Access denied' };
        }
      } catch (err) {
        return { authorized: false, reason: err.message };
      }
    }

    return { authorized: true };
  }

  /**
   * Join a channel
   * @param {string} clientId - Client identifier
   * @param {string} channelName - Channel name (public-*, private-*, presence-*)
   * @param {Object} user - Authenticated user object (can be null)
   * @param {Object} userInfo - Custom member info for presence channels
   * @returns {Object} - { success, channel, members?, error? }
   */
  async join(clientId, channelName, user, userInfo = {}) {
    const type = this._getChannelType(channelName);

    // Authorize
    const auth = await this._authorizeJoin(channelName, user, userInfo);
    if (!auth.authorized) {
      return {
        success: false,
        error: auth.reason,
        code: 'FORBIDDEN'
      };
    }

    // Create channel if doesn't exist
    if (!this.channels.has(channelName)) {
      this.channels.set(channelName, {
        type,
        members: new Map(),
        createdAt: new Date().toISOString()
      });
    }

    const channel = this.channels.get(channelName);

    // Build member info
    const memberInfo = {
      id: user?.id || clientId,
      clientId,
      joinedAt: new Date().toISOString(),
      ...(type === 'presence' ? {
        // Include user info for presence channels
        name: userInfo.name || user?.name || user?.email || 'Anonymous',
        avatar: userInfo.avatar || user?.avatar,
        ...userInfo
      } : {})
    };

    // Add to channel
    channel.members.set(clientId, memberInfo);

    // Track client's channels for cleanup
    if (!this.clientChannels.has(clientId)) {
      this.clientChannels.set(clientId, new Set());
    }
    this.clientChannels.get(clientId).add(channelName);

    this.logger?.debug({
      clientId,
      channelName,
      type,
      memberCount: channel.members.size
    }, 'Client joined channel');

    // Build response
    const response = {
      success: true,
      channel: channelName,
      type
    };

    // Include members list for presence channels
    if (type === 'presence') {
      response.members = this.getMembers(channelName);
      response.me = memberInfo;
    }

    return response;
  }

  /**
   * Leave a channel
   * @param {string} clientId - Client identifier
   * @param {string} channelName - Channel name
   * @returns {Object} - { success, channel, member? }
   */
  leave(clientId, channelName) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      return { success: false, error: 'Channel not found', code: 'NOT_FOUND' };
    }

    const member = channel.members.get(clientId);
    if (!member) {
      return { success: false, error: 'Not a member', code: 'NOT_MEMBER' };
    }

    // Remove from channel
    channel.members.delete(clientId);

    // Remove from client tracking
    this.clientChannels.get(clientId)?.delete(channelName);

    // Cleanup empty channels
    if (channel.members.size === 0) {
      this.channels.delete(channelName);
    }

    this.logger?.debug({
      clientId,
      channelName,
      memberCount: channel.members.size
    }, 'Client left channel');

    return {
      success: true,
      channel: channelName,
      member: channel.type === 'presence' ? member : undefined
    };
  }

  /**
   * Remove client from all channels (on disconnect)
   * @param {string} clientId - Client identifier
   * @returns {Array} - List of { channel, member } for each left channel
   */
  leaveAll(clientId) {
    const channels = this.clientChannels.get(clientId);
    if (!channels) return [];

    const left = [];
    for (const channelName of channels) {
      const result = this.leave(clientId, channelName);
      if (result.success) {
        left.push({
          channel: channelName,
          member: result.member
        });
      }
    }

    this.clientChannels.delete(clientId);
    return left;
  }

  /**
   * Get members of a channel
   * @param {string} channelName - Channel name
   * @returns {Array} - List of member info objects
   */
  getMembers(channelName) {
    const channel = this.channels.get(channelName);
    if (!channel) return [];

    return Array.from(channel.members.values());
  }

  /**
   * Get member count of a channel
   * @param {string} channelName - Channel name
   * @returns {number}
   */
  getMemberCount(channelName) {
    const channel = this.channels.get(channelName);
    return channel ? channel.members.size : 0;
  }

  /**
   * Get all clients in a channel (for broadcasting)
   * @param {string} channelName - Channel name
   * @returns {Array<string>} - List of client IDs
   */
  getChannelClients(channelName) {
    const channel = this.channels.get(channelName);
    if (!channel) return [];

    return Array.from(channel.members.keys());
  }

  /**
   * Check if client is in channel
   * @param {string} clientId - Client identifier
   * @param {string} channelName - Channel name
   * @returns {boolean}
   */
  isInChannel(clientId, channelName) {
    const channel = this.channels.get(channelName);
    return channel ? channel.members.has(clientId) : false;
  }

  /**
   * Get all channels a client is in
   * @param {string} clientId - Client identifier
   * @returns {Array<string>} - List of channel names
   */
  getClientChannels(clientId) {
    const channels = this.clientChannels.get(clientId);
    return channels ? Array.from(channels) : [];
  }

  /**
   * Get channel info
   * @param {string} channelName - Channel name
   * @returns {Object|null}
   */
  getChannelInfo(channelName) {
    const channel = this.channels.get(channelName);
    if (!channel) return null;

    return {
      name: channelName,
      type: channel.type,
      memberCount: channel.members.size,
      createdAt: channel.createdAt,
      members: channel.type === 'presence' ? this.getMembers(channelName) : undefined
    };
  }

  /**
   * List all channels
   * @param {Object} options - { type?: string, prefix?: string }
   * @returns {Array}
   */
  listChannels(options = {}) {
    const { type, prefix } = options;
    const channels = [];

    for (const [name, channel] of this.channels) {
      if (type && channel.type !== type) continue;
      if (prefix && !name.startsWith(prefix)) continue;

      channels.push({
        name,
        type: channel.type,
        memberCount: channel.members.size
      });
    }

    return channels;
  }

  /**
   * Update member info (for presence channels)
   * @param {string} clientId - Client identifier
   * @param {string} channelName - Channel name
   * @param {Object} userInfo - Updated user info
   * @returns {Object}
   */
  updateMemberInfo(clientId, channelName, userInfo) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      return { success: false, error: 'Channel not found' };
    }

    if (channel.type !== 'presence') {
      return { success: false, error: 'Not a presence channel' };
    }

    const member = channel.members.get(clientId);
    if (!member) {
      return { success: false, error: 'Not a member' };
    }

    // Update member info
    const updatedMember = {
      ...member,
      ...userInfo,
      updatedAt: new Date().toISOString()
    };
    channel.members.set(clientId, updatedMember);

    return {
      success: true,
      member: updatedMember
    };
  }

  /**
   * Get stats
   * @returns {Object}
   */
  getStats() {
    let totalMembers = 0;
    const byType = { public: 0, private: 0, presence: 0 };

    for (const channel of this.channels.values()) {
      totalMembers += channel.members.size;
      byType[channel.type]++;
    }

    return {
      channels: this.channels.size,
      totalMembers,
      byType,
      clients: this.clientChannels.size
    };
  }
}
