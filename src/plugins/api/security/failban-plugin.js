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
 * - IP Whitelist/Blacklist support
 * - Country-based restrictions (whitelist/blacklist)
 * - GeoIP lookup with MaxMind GeoLite2
 * - Events: security:banned, security:unbanned, security:violation, security:country_blocked
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
 *   blacklist: [],
 *   geo: {
 *     enabled: true,
 *     databasePath: '/path/to/GeoLite2-Country.mmdb',
 *     allowedCountries: ['BR', 'US'], // ISO 3166-1 alpha-2 codes
 *     blockedCountries: ['CN', 'RU'], // Block these countries
 *     blockUnknown: false // Block IPs with unknown country
 *   }
 * });
 *
 * db.use(failban);
 */

import { Plugin } from '../../plugin.class.js';
import { TTLPlugin } from '../../ttl.plugin.js';
import { requirePluginDependency } from '../../concerns/plugin-dependencies.js';

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
      geo: {
        enabled: options.geo?.enabled || false,
        databasePath: options.geo?.databasePath || null,
        allowedCountries: options.geo?.allowedCountries || [], // ISO 3166-1 alpha-2
        blockedCountries: options.geo?.blockedCountries || [], // ISO 3166-1 alpha-2
        blockUnknown: options.geo?.blockUnknown || false, // Block unknown countries
        cacheResults: options.geo?.cacheResults !== false // Cache GeoIP lookups
      },
      ...options
    };

    this.bansResource = null;
    this.violationsResource = null;
    this.memoryCache = new Map(); // In-memory cache for fast lookups
    this.geoCache = new Map(); // GeoIP lookup cache
    this.geoReader = null; // MaxMind reader instance
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

    // Initialize GeoIP if enabled
    if (this.options.geo.enabled) {
      await this._initializeGeoIP();
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

      if (this.options.geo.enabled) {
        console.log(`[FailbanPlugin] GeoIP enabled`);
        console.log(`[FailbanPlugin] Allowed countries: ${this.options.geo.allowedCountries.join(', ') || 'none'}`);
        console.log(`[FailbanPlugin] Blocked countries: ${this.options.geo.blockedCountries.join(', ') || 'none'}`);
        console.log(`[FailbanPlugin] Block unknown: ${this.options.geo.blockUnknown}`);
      }
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
   * Initialize GeoIP reader
   * @private
   */
  async _initializeGeoIP() {
    if (!this.options.geo.databasePath) {
      console.warn('[FailbanPlugin] GeoIP enabled but no databasePath provided');
      return;
    }

    try {
      // Dynamic import to avoid requiring @maxmind/geoip2-node for all users
      const Reader = await requirePluginDependency(
        '@maxmind/geoip2-node',
        'FailbanPlugin',
        'GeoIP country blocking'
      );

      this.geoReader = await Reader.open(this.options.geo.databasePath);

      if (this.options.verbose) {
        console.log(`[FailbanPlugin] GeoIP database loaded from ${this.options.geo.databasePath}`);
      }
    } catch (err) {
      console.error('[FailbanPlugin] Failed to initialize GeoIP:', err.message);
      console.warn('[FailbanPlugin] GeoIP features will be disabled');
      this.options.geo.enabled = false;
    }
  }

  /**
   * Get country code for IP address
   * @param {string} ip - IP address
   * @returns {string|null} ISO 3166-1 alpha-2 country code or null
   */
  getCountryCode(ip) {
    if (!this.options.geo.enabled || !this.geoReader) {
      return null;
    }

    // Check cache first
    if (this.options.geo.cacheResults && this.geoCache.has(ip)) {
      return this.geoCache.get(ip);
    }

    try {
      const response = this.geoReader.country(ip);
      const countryCode = response?.country?.isoCode || null;

      // Cache result
      if (this.options.geo.cacheResults) {
        this.geoCache.set(ip, countryCode);

        // Limit cache size (keep last 10000 lookups)
        if (this.geoCache.size > 10000) {
          const firstKey = this.geoCache.keys().next().value;
          this.geoCache.delete(firstKey);
        }
      }

      return countryCode;
    } catch (err) {
      // IP not found in database or invalid IP
      if (this.options.verbose) {
        console.log(`[FailbanPlugin] GeoIP lookup failed for ${ip}: ${err.message}`);
      }
      return null;
    }
  }

  /**
   * Check if country is blocked
   * @param {string} countryCode - ISO 3166-1 alpha-2 country code
   * @returns {boolean}
   */
  isCountryBlocked(countryCode) {
    if (!this.options.geo.enabled) {
      return false;
    }

    // Unknown country handling
    if (!countryCode) {
      return this.options.geo.blockUnknown;
    }

    const upperCode = countryCode.toUpperCase();

    // Check blocklist first (takes precedence)
    if (this.options.geo.blockedCountries.length > 0) {
      if (this.options.geo.blockedCountries.includes(upperCode)) {
        return true;
      }
    }

    // Check allowlist
    if (this.options.geo.allowedCountries.length > 0) {
      // If allowlist is set, only allowed countries can pass
      return !this.options.geo.allowedCountries.includes(upperCode);
    }

    return false;
  }

  /**
   * Check if IP is blocked by country restrictions
   * @param {string} ip - IP address
   * @returns {Object|null} Block info or null if not blocked
   */
  checkCountryBlock(ip) {
    if (!this.options.geo.enabled) {
      return null;
    }

    // Whitelisted IPs bypass country checks
    if (this.isWhitelisted(ip)) {
      return null;
    }

    const countryCode = this.getCountryCode(ip);

    if (this.isCountryBlocked(countryCode)) {
      return {
        blocked: true,
        reason: 'country_restricted',
        country: countryCode || 'unknown',
        ip
      };
    }

    return null;
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
    this.geoCache.clear();

    // Close GeoIP reader
    if (this.geoReader) {
      // MaxMind reader doesn't have explicit close, just dereference
      this.geoReader = null;
    }

    if (this.options.verbose) {
      console.log('[FailbanPlugin] Cleaned up');
    }
  }
}

export default FailbanPlugin;
