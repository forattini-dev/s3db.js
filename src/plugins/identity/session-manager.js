/**
 * Session Manager - Handles user sessions for Identity Provider
 *
 * Manages session lifecycle using S3DB resource as storage:
 * - Create/validate/destroy sessions
 * - Cookie-based session handling
 * - Automatic session cleanup (expired sessions)
 * - IP address and user agent tracking
 */

import { generateSessionId, calculateExpiration, isExpired } from './concerns/token-generator.js';
import tryFn from '../../concerns/try-fn.js';

/**
 * Default session configuration
 */
const DEFAULT_CONFIG = {
  sessionExpiry: '24h',           // Default: 24 hours
  cookieName: 's3db_session',     // Cookie name
  cookiePath: '/',                // Cookie path
  cookieHttpOnly: true,           // HTTP-only cookie (no JS access)
  cookieSecure: false,            // Secure cookie (HTTPS only) - set to true in production
  cookieSameSite: 'Lax',          // SameSite attribute ('Strict', 'Lax', 'None')
  cleanupInterval: 3600000,       // Cleanup interval: 1 hour (in ms)
  enableCleanup: true             // Enable automatic cleanup
};

/**
 * SessionManager class
 * @class
 */
export class SessionManager {
  /**
   * Create Session Manager
   * @param {Object} options - Configuration options
   * @param {Object} options.sessionResource - S3DB sessions resource
   * @param {Object} [options.config] - Session configuration
   */
  constructor(options = {}) {
    this.sessionResource = options.sessionResource;
    this.config = { ...DEFAULT_CONFIG, ...options.config };

    this.cleanupTimer = null;

    if (!this.sessionResource) {
      throw new Error('SessionManager requires a sessionResource');
    }

    // Start automatic cleanup
    if (this.config.enableCleanup) {
      this._startCleanup();
    }
  }

  /**
   * Create a new session
   * @param {Object} data - Session data
   * @param {string} data.userId - User ID
   * @param {Object} [data.metadata] - Additional session metadata
   * @param {string} [data.ipAddress] - Client IP address
   * @param {string} [data.userAgent] - Client user agent
   * @param {string} [duration] - Session duration (overrides default)
   * @returns {Promise<{sessionId: string, expiresAt: number, session: Object}>}
   */
  async createSession(data) {
    const { userId, metadata = {}, ipAddress, userAgent, duration } = data;

    if (!userId) {
      throw new Error('userId is required to create a session');
    }

    // Generate session ID
    const sessionId = generateSessionId();

    // Calculate expiration
    const expiresAt = calculateExpiration(duration || this.config.sessionExpiry);

    // Create session record
    const sessionData = {
      userId,
      expiresAt: new Date(expiresAt).toISOString(),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      metadata,
      createdAt: new Date().toISOString()
    };

    // Insert into S3DB
    const [ok, err, session] = await tryFn(() =>
      this.sessionResource.insert(sessionData)
    );

    if (!ok) {
      throw new Error(`Failed to create session: ${err.message}`);
    }

    return {
      sessionId: session.id, // S3DB auto-generated ID
      expiresAt,
      session
    };
  }

  /**
   * Validate a session
   * @param {string} sessionId - Session ID to validate
   * @returns {Promise<{valid: boolean, session: Object|null, reason: string|null}>}
   */
  async validateSession(sessionId) {
    if (!sessionId) {
      return { valid: false, session: null, reason: 'No session ID provided' };
    }

    // Fetch session from S3DB
    const [ok, err, session] = await tryFn(() =>
      this.sessionResource.get(sessionId)
    );

    if (!ok || !session) {
      return { valid: false, session: null, reason: 'Session not found' };
    }

    // Check if session is expired
    if (isExpired(session.expiresAt)) {
      // Delete expired session
      await this.destroySession(sessionId);
      return { valid: false, session: null, reason: 'Session expired' };
    }

    return { valid: true, session, reason: null };
  }

  /**
   * Get session data without validation
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session object or null
   */
  async getSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    const [ok, , session] = await tryFn(() =>
      this.sessionResource.get(sessionId)
    );

    return ok ? session : null;
  }

  /**
   * Update session metadata
   * @param {string} sessionId - Session ID
   * @param {Object} metadata - New metadata to merge
   * @returns {Promise<Object>} Updated session
   */
  async updateSession(sessionId, metadata) {
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const session = await this.getSession(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    const updatedMetadata = { ...session.metadata, ...metadata };

    const [ok, err, updated] = await tryFn(() =>
      this.sessionResource.update(sessionId, {
        metadata: updatedMetadata
      })
    );

    if (!ok) {
      throw new Error(`Failed to update session: ${err.message}`);
    }

    return updated;
  }

  /**
   * Destroy a session (logout)
   * @param {string} sessionId - Session ID to destroy
   * @returns {Promise<boolean>} True if session was destroyed
   */
  async destroySession(sessionId) {
    if (!sessionId) {
      return false;
    }

    const [ok] = await tryFn(() =>
      this.sessionResource.delete(sessionId)
    );

    return ok;
  }

  /**
   * Destroy all sessions for a user (logout all devices)
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of sessions destroyed
   */
  async destroyUserSessions(userId) {
    if (!userId) {
      return 0;
    }

    // Query all sessions for user
    const [ok, , sessions] = await tryFn(() =>
      this.sessionResource.query({ userId })
    );

    if (!ok || !sessions || sessions.length === 0) {
      return 0;
    }

    // Delete all sessions
    let count = 0;
    for (const session of sessions) {
      const destroyed = await this.destroySession(session.id);
      if (destroyed) count++;
    }

    return count;
  }

  /**
   * Get all active sessions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of active sessions
   */
  async getUserSessions(userId) {
    if (!userId) {
      return [];
    }

    const [ok, , sessions] = await tryFn(() =>
      this.sessionResource.query({ userId })
    );

    if (!ok || !sessions) {
      return [];
    }

    // Filter out expired sessions
    const activeSessions = [];
    for (const session of sessions) {
      if (!isExpired(session.expiresAt)) {
        activeSessions.push(session);
      } else {
        // Clean up expired session
        await this.destroySession(session.id);
      }
    }

    return activeSessions;
  }

  /**
   * Set session cookie in HTTP response
   * @param {Object} res - HTTP response object (Express/Hono style)
   * @param {string} sessionId - Session ID
   * @param {number} expiresAt - Expiration timestamp (Unix ms)
   */
  setSessionCookie(res, sessionId, expiresAt) {
    const expires = new Date(expiresAt);

    const cookieOptions = [
      `${this.config.cookieName}=${sessionId}`,
      `Path=${this.config.cookiePath}`,
      `Expires=${expires.toUTCString()}`,
      `Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}`
    ];

    if (this.config.cookieHttpOnly) {
      cookieOptions.push('HttpOnly');
    }

    if (this.config.cookieSecure) {
      cookieOptions.push('Secure');
    }

    if (this.config.cookieSameSite) {
      cookieOptions.push(`SameSite=${this.config.cookieSameSite}`);
    }

    const cookieValue = cookieOptions.join('; ');

    // Set cookie header
    if (typeof res.setHeader === 'function') {
      // Express-style
      res.setHeader('Set-Cookie', cookieValue);
    } else if (typeof res.header === 'function') {
      // Hono-style
      res.header('Set-Cookie', cookieValue);
    } else {
      throw new Error('Unsupported response object');
    }
  }

  /**
   * Clear session cookie in HTTP response
   * @param {Object} res - HTTP response object
   */
  clearSessionCookie(res) {
    const cookieOptions = [
      `${this.config.cookieName}=`,
      `Path=${this.config.cookiePath}`,
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'Max-Age=0'
    ];

    if (this.config.cookieHttpOnly) {
      cookieOptions.push('HttpOnly');
    }

    if (this.config.cookieSecure) {
      cookieOptions.push('Secure');
    }

    if (this.config.cookieSameSite) {
      cookieOptions.push(`SameSite=${this.config.cookieSameSite}`);
    }

    const cookieValue = cookieOptions.join('; ');

    if (typeof res.setHeader === 'function') {
      res.setHeader('Set-Cookie', cookieValue);
    } else if (typeof res.header === 'function') {
      res.header('Set-Cookie', cookieValue);
    }
  }

  /**
   * Get session ID from HTTP request cookies
   * @param {Object} req - HTTP request object
   * @returns {string|null} Session ID or null
   */
  getSessionIdFromRequest(req) {
    // Parse cookies from request
    const cookieHeader = req.headers?.cookie || req.header?.('cookie');

    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});

    return cookies[this.config.cookieName] || null;
  }

  /**
   * Cleanup expired sessions
   * @returns {Promise<number>} Number of sessions cleaned up
   */
  async cleanupExpiredSessions() {
    // List all sessions
    const [ok, , sessions] = await tryFn(() =>
      this.sessionResource.list({ limit: 1000 })
    );

    if (!ok || !sessions) {
      return 0;
    }

    let count = 0;
    for (const session of sessions) {
      if (isExpired(session.expiresAt)) {
        const destroyed = await this.destroySession(session.id);
        if (destroyed) count++;
      }
    }

    return count;
  }

  /**
   * Start automatic cleanup of expired sessions
   * @private
   */
  _startCleanup() {
    if (this.cleanupTimer) {
      return; // Already running
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        const count = await this.cleanupExpiredSessions();
        if (count > 0) {
          console.log(`[SessionManager] Cleaned up ${count} expired sessions`);
        }
      } catch (error) {
        console.error('[SessionManager] Cleanup error:', error.message);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get session statistics
   * @returns {Promise<Object>} Session statistics
   */
  async getStatistics() {
    const [ok, , sessions] = await tryFn(() =>
      this.sessionResource.list({ limit: 10000 })
    );

    if (!ok || !sessions) {
      return {
        total: 0,
        active: 0,
        expired: 0,
        users: 0
      };
    }

    let active = 0;
    let expired = 0;
    const uniqueUsers = new Set();

    for (const session of sessions) {
      if (isExpired(session.expiresAt)) {
        expired++;
      } else {
        active++;
        uniqueUsers.add(session.userId);
      }
    }

    return {
      total: sessions.length,
      active,
      expired,
      users: uniqueUsers.size
    };
  }
}

export default SessionManager;
