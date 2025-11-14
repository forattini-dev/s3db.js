/**
 * Resource Session Store
 *
 * Session storage using s3db.js resources for persistence.
 * Perfect for applications that already use s3db.js for data storage.
 *
 * **Features:**
 * - ✅ Persistent sessions (survive server restart)
 * - ✅ Horizontal scaling (shared via S3)
 * - ✅ Auto-cleanup with TTL plugin
 * - ✅ Full CRUD via REST API
 *
 * @example
 * const resource = db.resources.oidc_sessions;
 * const store = new ResourceSessionStore(resource);
 *
 * @module api/concerns/resource-session-store
 */

import { SessionStore } from './session-store.js';

/**
 * Session Store backed by an s3db.js Resource
 *
 * Sessions are stored as resource documents with automatic expiration tracking.
 */
export class ResourceSessionStore extends SessionStore {
  /**
   * Initialize with an s3db.js resource
   *
   * @param {Resource} resource - An s3db.js resource (e.g., db.resources.oidc_sessions)
   * @param {Object} options - Configuration options
   * @param {boolean} options.verbose - Enable debug logging
   *
   * @throws {Error} If resource is not provided or invalid
   *
   * @example
   * const store = new ResourceSessionStore(db.resources.oidc_sessions);
   */
  constructor(resource, options = {}) {
    if (!resource) {
      throw new Error('ResourceSessionStore requires a resource argument');
    }

    super();
    this.resource = resource;
    this.verbose = options.verbose || false;

    if (this.verbose) {
      console.log(`[ResourceSessionStore] Initialized with resource: ${resource.name}`);
    }
  }

  /**
   * Retrieve session by ID
   *
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object|null>} Session data or null if not found/expired
   */
  async get(sessionId) {
    try {
      const session = await this.resource.get(sessionId);

      if (this.verbose) {
        console.log(`[ResourceSessionStore] Retrieved session: ${sessionId}`);
      }

      return session;
    } catch (err) {
      // Session not found (expired or doesn't exist)
      if (
        err.message?.includes('NotFound') ||
        err.code === 'ENOTFOUND' ||
        err.statusCode === 404
      ) {
        return null;
      }

      throw err;
    }
  }

  /**
   * Store session data with TTL
   *
   * @param {string} sessionId - Session identifier
   * @param {Object} sessionData - Session data (user, tokens, etc.)
   * @param {number} ttl - Time-to-live in milliseconds
   * @returns {Promise<void>}
   */
  async set(sessionId, sessionData, ttl) {
    const expiresAt = new Date(Date.now() + ttl).toISOString();

    try {
      // Try updating first (session might already exist)
      await this.resource.update(sessionId, {
        ...sessionData,
        expiresAt  // Track expiration time for TTL plugin
      });

      if (this.verbose) {
        console.log(`[ResourceSessionStore] Updated session: ${sessionId}`);
      }
    } catch (err) {
      // If session doesn't exist, insert it
      if (
        err.message?.includes('NotFound') ||
        err.code === 'ENOTFOUND' ||
        err.statusCode === 404
      ) {
        await this.resource.insert({
          id: sessionId,
          ...sessionData,
          expiresAt
        });

        if (this.verbose) {
          console.log(`[ResourceSessionStore] Created session: ${sessionId}`);
        }
      } else {
        throw err;
      }
    }
  }

  /**
   * Delete a session (on logout)
   *
   * @param {string} sessionId - Session identifier
   * @returns {Promise<void>}
   */
  async destroy(sessionId) {
    try {
      await this.resource.delete(sessionId);

      if (this.verbose) {
        console.log(`[ResourceSessionStore] Deleted session: ${sessionId}`);
      }
    } catch (err) {
      // Ignore "not found" errors (already deleted or never existed)
      if (
        !err.message?.includes('NotFound') &&
        err.code !== 'ENOTFOUND' &&
        err.statusCode !== 404
      ) {
        throw err;
      }

      if (this.verbose) {
        console.log(`[ResourceSessionStore] Session not found (already deleted): ${sessionId}`);
      }
    }
  }

  /**
   * Update session TTL without changing data
   * Uses PATCH for performance (metadata-only update)
   *
   * @param {string} sessionId - Session identifier
   * @param {number} ttl - New TTL in milliseconds
   * @returns {Promise<void>}
   */
  async touch(sessionId, ttl) {
    const session = await this.get(sessionId);
    if (session) {
      const expiresAt = new Date(Date.now() + ttl).toISOString();
      await this.resource.patch(sessionId, { expiresAt });

      if (this.verbose) {
        console.log(`[ResourceSessionStore] Touched session: ${sessionId}`);
      }
    }
  }

  /**
   * Get store statistics
   *
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    try {
      const list = await this.resource.list({ limit: 1 });
      return {
        resourceName: this.resource.name,
        totalSessions: list.total || 0
      };
    } catch (err) {
      console.error('[ResourceSessionStore] Error getting stats:', err.message);
      return { error: err.message };
    }
  }

  /**
   * Clear all sessions (useful for testing)
   *
   * @returns {Promise<number>} Number of sessions deleted
   */
  async clear() {
    try {
      const sessions = await this.resource.query();
      let deleted = 0;

      for (const session of sessions) {
        try {
          await this.resource.delete(session.id);
          deleted++;
        } catch (err) {
          // Continue even if one delete fails
          console.warn(`Failed to delete session ${session.id}:`, err.message);
        }
      }

      if (this.verbose) {
        console.log(`[ResourceSessionStore] Cleared ${deleted} sessions`);
      }

      return deleted;
    } catch (err) {
      console.error('[ResourceSessionStore] Error clearing sessions:', err.message);
      return 0;
    }
  }
}
