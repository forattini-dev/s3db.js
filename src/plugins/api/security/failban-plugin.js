/**
 * Failban Plugin - Automatic IP banning for security violations
 *
 * fail2ban-style automatic banning system for API protection.
 * Uses plugin storage with TTL for automatic ban expiration.
 *
 * Features:
 * - Auto-ban after multiple rate limit violations
 * - Persistent ban storage in S3DB
 * - TTL-based auto-unban
 * - Whitelist/Blacklist support
 * - Events: security:banned, security:unbanned, security:violation
 * - Admin endpoints for manual ban management
 *
 * @example
 * import { FailbanPlugin } from './security/failban-plugin.js';
 *
 * const failban = new FailbanPlugin({
 *   enabled: true,
 *   maxViolations: 3,
 *   violationWindow: 3600000, // 1 hour
 *   banDuration: 86400000, // 24 hours
 *   whitelist: ['127.0.0.1'],
 *   blacklist: []
 * });
 *
 * db.use(failban);
 */

import { Plugin } from '../../plugin.class.js';
import { TTLPlugin } from '../../ttl.plugin.js';

export class FailbanPlugin extends Plugin {
  constructor(options = {}) {
    super('FailbanPlugin', '1.0.0');

    this.options = {
      enabled: options.enabled !== false,
      maxViolations: options.maxViolations || 3, // Ban after 3 violations
      violationWindow: options.violationWindow || 3600000, // 1 hour window
      banDuration: options.banDuration || 86400000, // 24 hour ban
      whitelist: options.whitelist || ['127.0.0.1', '::1'], // Never ban
      blacklist: options.blacklist || [], // Always ban
      persistViolations: options.persistViolations !== false, // Track violations in DB
      verbose: options.verbose || false,
      ...options
    };

    this.bansResource = null;
    this.violationsResource = null;
    this.memoryCache = new Map(); // In-memory cache for fast lookups
  }

  /**
   * Initialize plugin
   */
  async initialize(database) {
    await super.initialize(database);

    if (!this.options.enabled) {
      if (this.options.verbose) {
        console.log('[FailbanPlugin] Disabled, skipping initialization');
      }
      return;
    }

    // Create bans resource with TTL
    this.bansResource = await this._createBansResource();

    // Create violations tracking resource (optional)
    if (this.options.persistViolations) {
      this.violationsResource = await this._createViolationsResource();
    }

    // Load existing bans into memory cache
    await this._loadBansIntoCache();

    // Setup cleanup timer for memory cache
    this._setupCleanupTimer();

    if (this.options.verbose) {
      console.log('[FailbanPlugin] Initialized');
      console.log(`[FailbanPlugin] Max violations: ${this.options.maxViolations}`);
      console.log(`[FailbanPlugin] Violation window: ${this.options.violationWindow}ms`);
      console.log(`[FailbanPlugin] Ban duration: ${this.options.banDuration}ms`);
      console.log(`[FailbanPlugin] Whitelist: ${this.options.whitelist.join(', ')}`);
    }
  }

  /**
   * Create bans resource with TTL support
   * @private
   */
  async _createBansResource() {
    const resourceName = '_failban_bans';

    try {
      // Try to get existing resource
      return await this.database.getResource(resourceName);
    } catch (err) {
      // Create new resource
      const resource = await this.database.createResource({
        name: resourceName,
        attributes: {
          ip: 'string|required',
          reason: 'string',
          violations: 'number',
          bannedAt: 'string',
          expiresAt: 'string|required',
          metadata: {
            userAgent: 'string',
            path: 'string',
            lastViolation: 'string'
          }
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: {
          byExpiry: {
            fields: { expiresAtCohort: 'string' }
          }
        }
      });

      // Apply TTL plugin to this resource
      const ttlPlugin = this.database.plugins?.ttl || this.database.plugins?.TTLPlugin;
      if (ttlPlugin) {
        // Configure TTL for bans resource
        ttlPlugin.options.resources = ttlPlugin.options.resources || {};
        ttlPlugin.options.resources[resourceName] = {
          enabled: true,
          field: 'expiresAt'
        };

        if (this.options.verbose) {
          console.log('[FailbanPlugin] TTL configured for bans resource');
        }
      } else {
        console.warn('[FailbanPlugin] TTLPlugin not found - bans will not auto-expire from DB');
      }

      return resource;
    }
  }

  /**
   * Create violations tracking resource
   * @private
   */
  async _createViolationsResource() {
    const resourceName = '_failban_violations';

    try {
      return await this.database.getResource(resourceName);
    } catch (err) {
      return await this.database.createResource({
        name: resourceName,
        attributes: {
          ip: 'string|required',
          timestamp: 'string|required',
          type: 'string', // 'rate_limit', 'auth_failure', etc.
          path: 'string',
          userAgent: 'string'
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: {
          byIp: {
            fields: { ip: 'string' }
          }
        }
      });
    }
  }

  /**
   * Load existing bans into memory cache
   * @private
   */
  async _loadBansIntoCache() {
    try {
      const bans = await this.bansResource.list({ limit: 1000 });
      const now = Date.now();

      for (const ban of bans) {
        const expiresAt = new Date(ban.expiresAt).getTime();
        if (expiresAt > now) {
          this.memoryCache.set(ban.ip, {
            expiresAt,
            reason: ban.reason,
            violations: ban.violations
          });
        }
      }

      if (this.options.verbose) {
        console.log(`[FailbanPlugin] Loaded ${this.memoryCache.size} active bans into cache`);
      }
    } catch (err) {
      console.error('[FailbanPlugin] Failed to load bans:', err.message);
    }
  }

  /**
   * Setup cleanup timer for memory cache
   * @private
   */
  _setupCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [ip, ban] of this.memoryCache.entries()) {
        if (ban.expiresAt <= now) {
          this.memoryCache.delete(ip);
          cleaned++;

          // Emit unban event
          this.database.emit?.('security:unbanned', {
            ip,
            reason: 'expired',
            bannedFor: ban.reason
          });
        }
      }

      if (this.options.verbose && cleaned > 0) {
        console.log(`[FailbanPlugin] Cleaned ${cleaned} expired bans from cache`);
      }
    }, 60000); // Every minute
  }

  /**
   * Check if IP is in whitelist
   */
  isWhitelisted(ip) {
    return this.options.whitelist.includes(ip);
  }

  /**
   * Check if IP is in blacklist (permanently banned)
   */
  isBlacklisted(ip) {
    return this.options.blacklist.includes(ip);
  }

  /**
   * Check if IP is currently banned
   */
  isBanned(ip) {
    if (!this.options.enabled) return false;
    if (this.isWhitelisted(ip)) return false;
    if (this.isBlacklisted(ip)) return true;

    // Check memory cache first (fast path)
    const cachedBan = this.memoryCache.get(ip);
    if (cachedBan) {
      if (cachedBan.expiresAt > Date.now()) {
        return true;
      } else {
        // Expired - remove from cache
        this.memoryCache.delete(ip);
        return false;
      }
    }

    return false;
  }

  /**
   * Get ban details for IP
   */
  async getBan(ip) {
    if (!this.options.enabled) return null;
    if (this.isBlacklisted(ip)) {
      return {
        ip,
        reason: 'blacklisted',
        permanent: true
      };
    }

    try {
      const ban = await this.bansResource.get(ip);
      if (!ban) return null;

      // Check if expired
      if (new Date(ban.expiresAt).getTime() <= Date.now()) {
        return null;
      }

      return ban;
    } catch (err) {
      return null;
    }
  }

  /**
   * Record a violation
   */
  async recordViolation(ip, type = 'rate_limit', metadata = {}) {
    if (!this.options.enabled) return;
    if (this.isWhitelisted(ip)) return;

    const now = new Date().toISOString();

    // Emit violation event
    this.database.emit?.('security:violation', {
      ip,
      type,
      timestamp: now,
      ...metadata
    });

    // Persist violation if enabled
    if (this.violationsResource) {
      try {
        await this.violationsResource.insert({
          id: `${ip}_${Date.now()}`,
          ip,
          timestamp: now,
          type,
          path: metadata.path,
          userAgent: metadata.userAgent
        });
      } catch (err) {
        console.error('[FailbanPlugin] Failed to persist violation:', err.message);
      }
    }

    // Check if should ban
    await this._checkAndBan(ip, type, metadata);
  }

  /**
   * Check violation count and ban if threshold exceeded
   * @private
   */
  async _checkAndBan(ip, type, metadata) {
    if (this.isBanned(ip)) return; // Already banned

    // Count recent violations
    const cutoff = new Date(Date.now() - this.options.violationWindow).toISOString();
    let violationCount = 0;

    if (this.violationsResource) {
      try {
        const violations = await this.violationsResource.query({
          ip,
          timestamp: { $gte: cutoff }
        });
        violationCount = violations.length;
      } catch (err) {
        console.error('[FailbanPlugin] Failed to count violations:', err.message);
        return;
      }
    }

    // Ban if threshold exceeded
    if (violationCount >= this.options.maxViolations) {
      await this.ban(ip, `${violationCount} ${type} violations`, metadata);
    }
  }

  /**
   * Ban an IP
   */
  async ban(ip, reason, metadata = {}) {
    if (!this.options.enabled) return;
    if (this.isWhitelisted(ip)) {
      console.warn(`[FailbanPlugin] Cannot ban whitelisted IP: ${ip}`);
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.options.banDuration);

    const banRecord = {
      id: ip,
      ip,
      reason,
      violations: metadata.violationCount || this.options.maxViolations,
      bannedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: {
        userAgent: metadata.userAgent,
        path: metadata.path,
        lastViolation: now.toISOString()
      },
      createdBy: 'FailbanPlugin' // Mark as plugin storage
    };

    try {
      // Save to DB
      await this.bansResource.insert(banRecord);

      // Add to memory cache
      this.memoryCache.set(ip, {
        expiresAt: expiresAt.getTime(),
        reason,
        violations: banRecord.violations
      });

      // Emit ban event
      this.database.emit?.('security:banned', {
        ip,
        reason,
        expiresAt: expiresAt.toISOString(),
        duration: this.options.banDuration
      });

      if (this.options.verbose) {
        console.log(`[FailbanPlugin] Banned ${ip} for ${reason} until ${expiresAt.toISOString()}`);
      }
    } catch (err) {
      console.error('[FailbanPlugin] Failed to ban IP:', err.message);
    }
  }

  /**
   * Unban an IP (manual unban)
   */
  async unban(ip) {
    if (!this.options.enabled) return;

    try {
      // Remove from DB
      await this.bansResource.delete(ip);

      // Remove from cache
      this.memoryCache.delete(ip);

      // Emit unban event
      this.database.emit?.('security:unbanned', {
        ip,
        reason: 'manual',
        unbannedAt: new Date().toISOString()
      });

      if (this.options.verbose) {
        console.log(`[FailbanPlugin] Unbanned ${ip}`);
      }

      return true;
    } catch (err) {
      console.error('[FailbanPlugin] Failed to unban IP:', err.message);
      return false;
    }
  }

  /**
   * List all active bans
   */
  async listBans() {
    if (!this.options.enabled) return [];

    try {
      const bans = await this.bansResource.list({ limit: 1000 });
      const now = Date.now();

      // Filter out expired bans
      return bans.filter(ban => new Date(ban.expiresAt).getTime() > now);
    } catch (err) {
      console.error('[FailbanPlugin] Failed to list bans:', err.message);
      return [];
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    const activeBans = await this.listBans();

    let totalViolations = 0;
    if (this.violationsResource) {
      try {
        const violations = await this.violationsResource.list({ limit: 10000 });
        totalViolations = violations.length;
      } catch (err) {
        console.error('[FailbanPlugin] Failed to count violations:', err.message);
      }
    }

    return {
      enabled: this.options.enabled,
      activeBans: activeBans.length,
      cachedBans: this.memoryCache.size,
      totalViolations,
      whitelistedIPs: this.options.whitelist.length,
      blacklistedIPs: this.options.blacklist.length,
      config: {
        maxViolations: this.options.maxViolations,
        violationWindow: this.options.violationWindow,
        banDuration: this.options.banDuration
      }
    };
  }

  /**
   * Cleanup on plugin removal
   */
  async cleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.memoryCache.clear();

    if (this.options.verbose) {
      console.log('[FailbanPlugin] Cleaned up');
    }
  }
}

export default FailbanPlugin;
