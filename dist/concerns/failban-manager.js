import { requirePluginDependency } from '#src/plugins/concerns/plugin-dependencies.js';
import { tryFn } from './try-fn.js';
import { resolveResourceNames } from '../plugins/concerns/resource-names.js';
import { getCronManager } from './cron-manager.js';
import { createLogger } from './logger.js';
export class FailbanManager {
    logger;
    namespace;
    resourceNames;
    options;
    database;
    bansResource;
    violationsResource;
    memoryCache;
    geoCache;
    geoReader;
    cleanupJobName;
    _resourceDescriptors;
    constructor(options = {}) {
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = options.logLevel ? 'debug' : 'info';
            this.logger = createLogger({ name: 'FailbanManager', level: logLevel });
        }
        this.namespace = options.namespace || null;
        const resourceOverrides = options.resourceNames || options.resources || {};
        this._resourceDescriptors = {
            bans: {
                defaultName: 'plg_api_failban_bans',
                override: resourceOverrides.bans
            },
            violations: {
                defaultName: 'plg_api_failban_violations',
                override: resourceOverrides.violations
            }
        };
        this.resourceNames = this._resolveResourceNames();
        this.options = {
            enabled: options.enabled !== false,
            database: options.database,
            maxViolations: options.maxViolations || 3,
            violationWindow: options.violationWindow || 3600000,
            banDuration: options.banDuration || 86400000,
            whitelist: options.whitelist || ['127.0.0.1', '::1'],
            blacklist: options.blacklist || [],
            persistViolations: options.persistViolations !== false,
            logLevel: options.logLevel || 'info',
            geo: {
                enabled: options.geo?.enabled || false,
                databasePath: options.geo?.databasePath || null,
                allowedCountries: options.geo?.allowedCountries || [],
                blockedCountries: options.geo?.blockedCountries || [],
                blockUnknown: options.geo?.blockUnknown || false,
                cacheResults: options.geo?.cacheResults !== false
            },
            resources: this.resourceNames
        };
        this.database = options.database;
        this.bansResource = null;
        this.violationsResource = null;
        this.memoryCache = new Map();
        this.geoCache = new Map();
        this.geoReader = null;
        this.cleanupJobName = null;
    }
    _resolveResourceNames() {
        return resolveResourceNames('api_failban', this._resourceDescriptors, {
            namespace: this.namespace ?? undefined
        });
    }
    setNamespace(namespace) {
        this.namespace = namespace;
        this.resourceNames = this._resolveResourceNames();
        this.options.resources = this.resourceNames;
    }
    async initialize() {
        if (!this.options.enabled) {
            if (this.options.logLevel) {
                this.logger.info('Disabled, skipping initialization');
            }
            return;
        }
        if (!this.database) {
            throw new Error('[Failban] Database instance is required');
        }
        if (this.options.geo.enabled) {
            await this._initializeGeoIP();
        }
        this.bansResource = await this._createBansResource();
        if (this.options.persistViolations) {
            this.violationsResource = await this._createViolationsResource();
        }
        await this._loadBansIntoCache();
        await this._setupCleanupTimer();
        if (this.options.logLevel) {
            this.logger.info('Initialized');
            this.logger.info({ maxViolations: this.options.maxViolations }, 'Max violations');
            this.logger.info({ violationWindow: this.options.violationWindow }, 'Violation window (ms)');
            this.logger.info({ banDuration: this.options.banDuration }, 'Ban duration (ms)');
            this.logger.info({ whitelist: this.options.whitelist.join(', ') }, 'Whitelist');
            if (this.options.geo.enabled) {
                this.logger.info('GeoIP enabled');
                this.logger.info({ allowedCountries: this.options.geo.allowedCountries.join(', ') || 'none' }, 'Allowed countries');
                this.logger.info({ blockedCountries: this.options.geo.blockedCountries.join(', ') || 'none' }, 'Blocked countries');
                this.logger.info({ blockUnknown: this.options.geo.blockUnknown }, 'Block unknown');
            }
        }
    }
    async _createBansResource() {
        const resourceName = this.resourceNames.bans;
        try {
            return await this.database.getResource(resourceName);
        }
        catch {
            // fall through
        }
        const [created, createErr, resource] = await tryFn(() => this.database.createResource({
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
            timestamps: true
        }));
        if (!created) {
            const existing = this.database.resources?.[resourceName];
            if (existing) {
                return existing;
            }
            throw createErr;
        }
        const ttlPlugin = this.database.pluginRegistry?.ttl || this.database.pluginRegistry?.TTLPlugin;
        if (ttlPlugin) {
            ttlPlugin.options.resources = ttlPlugin.options.resources || {};
            ttlPlugin.options.resources[resourceName] = {
                enabled: true,
                field: 'expiresAt'
            };
            if (this.options.logLevel) {
                this.logger.info({ resourceName }, 'TTL configured for bans resource');
            }
        }
        else {
            if (this.options.logLevel) {
                this.logger.warn('TTLPlugin not found - bans will not auto-expire from DB');
            }
        }
        return resource;
    }
    async _createViolationsResource() {
        const resourceName = this.resourceNames.violations;
        try {
            return await this.database.getResource(resourceName);
        }
        catch {
            // fall through
        }
        const [created, createErr, resource] = await tryFn(() => this.database.createResource({
            name: resourceName,
            attributes: {
                ip: 'string|required',
                timestamp: 'string|required',
                type: 'string',
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
        }));
        if (!created) {
            const existing = this.database.resources?.[resourceName];
            if (existing) {
                return existing;
            }
            throw createErr;
        }
        return resource;
    }
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
            if (this.options.logLevel) {
                this.logger.info({ count: this.memoryCache.size }, 'Loaded active bans into cache');
            }
        }
        catch (err) {
            if (this.options.logLevel) {
                this.logger.error({ error: err.message }, 'Failed to load bans');
            }
        }
    }
    async _setupCleanupTimer() {
        const cronManager = getCronManager();
        this.cleanupJobName = await cronManager.schedule('0 * * * * *', () => {
            const now = Date.now();
            let cleaned = 0;
            for (const [ip, ban] of this.memoryCache.entries()) {
                if (ban.expiresAt <= now) {
                    this.memoryCache.delete(ip);
                    cleaned++;
                    this.database?.emit?.('security:unbanned', {
                        ip,
                        reason: 'expired',
                        bannedFor: ban.reason
                    });
                }
            }
            if (this.options.logLevel && cleaned > 0) {
                this.logger.info({ cleaned }, 'Cleaned expired bans from cache');
            }
        }, 'failban-cleanup');
    }
    async _initializeGeoIP() {
        if (!this.options.geo.databasePath) {
            if (this.options.logLevel) {
                this.logger.warn('GeoIP enabled but no databasePath provided');
            }
            return;
        }
        try {
            const maxmind = await requirePluginDependency('@maxmind/geoip2-node', 'ApiPlugin (Failban)');
            const Reader = maxmind;
            this.geoReader = await Reader.open(this.options.geo.databasePath);
            if (this.options.logLevel) {
                this.logger.info({ databasePath: this.options.geo.databasePath }, 'GeoIP database loaded');
            }
        }
        catch (err) {
            if (this.options.logLevel) {
                this.logger.error({ error: err.message }, 'Failed to initialize GeoIP');
                this.logger.warn('GeoIP features will be disabled');
            }
            this.options.geo.enabled = false;
        }
    }
    getCountryCode(ip) {
        if (!this.options.geo.enabled || !this.geoReader) {
            return null;
        }
        if (this.options.geo.cacheResults && this.geoCache.has(ip)) {
            return this.geoCache.get(ip) || null;
        }
        try {
            const response = this.geoReader.country(ip);
            const countryCode = response?.country?.isoCode || null;
            if (this.options.geo.cacheResults) {
                this.geoCache.set(ip, countryCode);
                if (this.geoCache.size > 10000) {
                    const firstKey = this.geoCache.keys().next().value;
                    if (firstKey) {
                        this.geoCache.delete(firstKey);
                    }
                }
            }
            return countryCode;
        }
        catch (err) {
            if (this.options.logLevel) {
                this.logger.debug({ ip, error: err.message }, 'GeoIP lookup failed');
            }
            return null;
        }
    }
    isCountryBlocked(countryCode) {
        if (!this.options.geo.enabled) {
            return false;
        }
        if (!countryCode) {
            return this.options.geo.blockUnknown;
        }
        const upperCode = countryCode.toUpperCase();
        if (this.options.geo.blockedCountries.length > 0) {
            if (this.options.geo.blockedCountries.includes(upperCode)) {
                return true;
            }
        }
        if (this.options.geo.allowedCountries.length > 0) {
            return !this.options.geo.allowedCountries.includes(upperCode);
        }
        return false;
    }
    checkCountryBlock(ip) {
        if (!this.options.geo.enabled) {
            return null;
        }
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
    isWhitelisted(ip) {
        return this.options.whitelist.includes(ip);
    }
    isBlacklisted(ip) {
        return this.options.blacklist.includes(ip);
    }
    isBanned(ip) {
        if (!this.options.enabled)
            return false;
        if (this.isWhitelisted(ip))
            return false;
        if (this.isBlacklisted(ip))
            return true;
        const cachedBan = this.memoryCache.get(ip);
        if (cachedBan) {
            if (cachedBan.expiresAt > Date.now()) {
                return true;
            }
            else {
                this.memoryCache.delete(ip);
                return false;
            }
        }
        return false;
    }
    async getBan(ip) {
        if (!this.options.enabled)
            return null;
        if (this.isBlacklisted(ip)) {
            return {
                ip,
                reason: 'blacklisted',
                permanent: true
            };
        }
        try {
            const ban = await this.bansResource.get(ip);
            if (!ban)
                return null;
            if (new Date(ban.expiresAt).getTime() <= Date.now()) {
                return null;
            }
            return ban;
        }
        catch {
            return null;
        }
    }
    async recordViolation(ip, type = 'rate_limit', metadata = {}) {
        if (!this.options.enabled)
            return;
        if (this.isWhitelisted(ip))
            return;
        const now = new Date().toISOString();
        this.database?.emit?.('security:violation', {
            ip,
            type,
            timestamp: now,
            ...metadata
        });
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
            }
            catch (err) {
                if (this.options.logLevel) {
                    this.logger.error({ error: err.message }, 'Failed to persist violation');
                }
            }
        }
        await this._checkAndBan(ip, type, metadata);
    }
    async _checkAndBan(ip, type, metadata) {
        if (this.isBanned(ip))
            return;
        const cutoff = new Date(Date.now() - this.options.violationWindow).toISOString();
        let violationCount = 0;
        if (this.violationsResource) {
            try {
                const violations = await this.violationsResource.query({
                    ip,
                    timestamp: { $gte: cutoff }
                });
                violationCount = violations.length;
            }
            catch (err) {
                if (this.options.logLevel) {
                    this.logger.error({ error: err.message }, 'Failed to count violations');
                }
                return;
            }
        }
        if (violationCount >= this.options.maxViolations) {
            await this.ban(ip, `${violationCount} ${type} violations`, metadata);
        }
    }
    async ban(ip, reason, metadata = {}) {
        if (!this.options.enabled)
            return;
        if (this.isWhitelisted(ip)) {
            if (this.options.logLevel) {
                this.logger.warn({ ip }, 'Cannot ban whitelisted IP');
            }
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
            }
        };
        try {
            await this.bansResource.insert(banRecord);
            this.memoryCache.set(ip, {
                expiresAt: expiresAt.getTime(),
                reason,
                violations: banRecord.violations
            });
            this.database?.emit?.('security:banned', {
                ip,
                reason,
                expiresAt: expiresAt.toISOString(),
                duration: this.options.banDuration
            });
            if (this.options.logLevel) {
                this.logger.info({ ip, reason, expiresAt: expiresAt.toISOString() }, 'IP banned');
            }
        }
        catch (err) {
            if (this.options.logLevel) {
                this.logger.error({ error: err.message }, 'Failed to ban IP');
            }
        }
    }
    async unban(ip) {
        if (!this.options.enabled)
            return false;
        try {
            await this.bansResource.delete(ip);
            this.memoryCache.delete(ip);
            this.database?.emit?.('security:unbanned', {
                ip,
                reason: 'manual',
                unbannedAt: new Date().toISOString()
            });
            if (this.options.logLevel) {
                this.logger.info({ ip }, 'IP unbanned');
            }
            return true;
        }
        catch (err) {
            if (this.options.logLevel) {
                this.logger.error({ error: err.message }, 'Failed to unban IP');
            }
            return false;
        }
    }
    async listBans() {
        if (!this.options.enabled)
            return [];
        try {
            const bans = await this.bansResource.list({ limit: 1000 });
            const now = Date.now();
            return bans.filter(ban => new Date(ban.expiresAt).getTime() > now);
        }
        catch (err) {
            if (this.options.logLevel) {
                this.logger.error({ error: err.message }, 'Failed to list bans');
            }
            return [];
        }
    }
    async getStats() {
        const activeBans = await this.listBans();
        let totalViolations = 0;
        if (this.violationsResource) {
            try {
                const violations = await this.violationsResource.list({ limit: 10000 });
                totalViolations = violations.length;
            }
            catch (err) {
                if (this.options.logLevel) {
                    this.logger.error({ error: err.message }, 'Failed to count violations');
                }
            }
        }
        return {
            enabled: this.options.enabled,
            activeBans: activeBans.length,
            cachedBans: this.memoryCache.size,
            totalViolations,
            whitelistedIPs: this.options.whitelist.length,
            blacklistedIPs: this.options.blacklist.length,
            geo: {
                enabled: this.options.geo.enabled,
                allowedCountries: this.options.geo.allowedCountries.length,
                blockedCountries: this.options.geo.blockedCountries.length,
                blockUnknown: this.options.geo.blockUnknown
            },
            config: {
                maxViolations: this.options.maxViolations,
                violationWindow: this.options.violationWindow,
                banDuration: this.options.banDuration
            }
        };
    }
    async cleanup() {
        if (this.cleanupJobName) {
            const cronManager = getCronManager();
            cronManager.stop('failban-cleanup');
            this.cleanupJobName = null;
        }
        this.memoryCache.clear();
        this.geoCache.clear();
        if (this.geoReader) {
            this.geoReader = null;
        }
        if (this.options.logLevel) {
            this.logger.info('Cleaned up');
        }
    }
}
//# sourceMappingURL=failban-manager.js.map