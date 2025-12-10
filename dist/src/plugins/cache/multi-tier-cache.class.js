import { Cache } from "./cache.class.js";
import { CacheError } from "../cache.errors.js";
import { createLogger } from '../../concerns/logger.js';
export class MultiTierCache extends Cache {
    drivers;
    stats;
    logger;
    constructor({ drivers = [], promoteOnHit = true, strategy = 'write-through', fallbackOnError = true, logLevel = 'info' }) {
        super();
        if (!Array.isArray(drivers) || drivers.length === 0) {
            throw new CacheError('MultiTierCache requires at least one driver', {
                operation: 'constructor',
                driver: 'MultiTierCache',
                provided: drivers,
                suggestion: 'Pass drivers array with at least one cache driver instance'
            });
        }
        this.drivers = drivers.map((d, index) => ({
            instance: d.driver,
            name: d.name || `L${index + 1}`,
            tier: index + 1
        }));
        this.config = {
            promoteOnHit,
            strategy,
            fallbackOnError,
            logLevel
        };
        this.logger = createLogger({
            name: 'MultiTierCache',
            level: logLevel
        });
        this.stats = {
            hits: 0,
            misses: 0,
            writes: 0,
            deletes: 0,
            errors: 0,
            tiers: this.drivers.map((tier) => ({
                name: tier.name,
                tier: tier.tier,
                hits: 0,
                misses: 0,
                errors: 0,
                sets: 0,
                promotions: 0
            }))
        };
        if (this.logger.isLevelEnabled?.('info')) {
            this.logger.info('[MultiTierCache] Initialized with %d drivers', this.drivers.length);
        }
    }
    _log(...args) {
        if (this.config.logLevel && args.length > 0) {
            const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
            this.logger.debug(`[MultiTierCache] ${message}`);
        }
    }
    async _get(key) {
        for (let i = 0; i < this.drivers.length; i++) {
            const tier = this.drivers[i];
            const tierStats = this.stats.tiers[i];
            try {
                const value = await tier.instance.get(key);
                if (value !== null && value !== undefined) {
                    tierStats.hits++;
                    this._log(`✓ Cache HIT on ${tier.name} for key: ${key}`);
                    if (this.config.promoteOnHit && i > 0) {
                        this._promoteToFasterTiers(key, value, i);
                    }
                    return value;
                }
                else {
                    tierStats.misses++;
                    this._log(`✗ Cache MISS on ${tier.name} for key: ${key}`);
                }
            }
            catch (error) {
                tierStats.errors++;
                this._log(`⚠ Error on ${tier.name} for key: ${key}`, error.message);
                if (!this.config.fallbackOnError) {
                    throw new CacheError(`Cache get failed on ${tier.name}`, {
                        operation: 'get',
                        driver: 'MultiTierCache',
                        tier: tier.name,
                        key,
                        cause: error,
                        suggestion: 'Enable fallbackOnError to skip failed tiers'
                    });
                }
                continue;
            }
        }
        this._log(`✗ Cache MISS on ALL tiers for key: ${key}`);
        return null;
    }
    async _promoteToFasterTiers(key, value, hitTierIndex) {
        for (let i = 0; i < hitTierIndex; i++) {
            const tier = this.drivers[i];
            const tierStats = this.stats.tiers[i];
            try {
                await tier.instance.set(key, value);
                tierStats.promotions++;
                this._log(`↑ Promoted key "${key}" to ${tier.name}`);
            }
            catch (error) {
                tierStats.errors++;
                this._log(`⚠ Failed to promote key "${key}" to ${tier.name}:`, error.message);
            }
        }
    }
    async _set(key, data) {
        if (this.config.strategy === 'write-through') {
            await this._writeToAllTiers(key, data);
        }
        else if (this.config.strategy === 'lazy-promotion') {
            await this._writeToL1Only(key, data);
        }
    }
    async _writeToAllTiers(key, data) {
        const results = await Promise.allSettled(this.drivers.map(async (tier, index) => {
            try {
                await tier.instance.set(key, data);
                this.stats.tiers[index].sets++;
                this._log(`✓ Wrote key "${key}" to ${tier.name}`);
                return { success: true, tier: tier.name };
            }
            catch (error) {
                this.stats.tiers[index].errors++;
                this._log(`⚠ Failed to write key "${key}" to ${tier.name}:`, error.message);
                return { success: false, tier: tier.name, error: error };
            }
        }));
        const l1Result = results[0];
        const l1Success = l1Result?.status === 'fulfilled' && l1Result.value.success;
        if (!l1Success && !this.config.fallbackOnError) {
            throw new CacheError('Failed to write to L1 cache', {
                operation: 'set',
                driver: 'MultiTierCache',
                key,
                results,
                suggestion: 'Enable fallbackOnError or check L1 cache health'
            });
        }
        return true;
    }
    async _writeToL1Only(key, data) {
        const tier = this.drivers[0];
        const tierStats = this.stats.tiers[0];
        try {
            await tier.instance.set(key, data);
            tierStats.sets++;
            this._log(`✓ Wrote key "${key}" to ${tier.name} (lazy-promotion)`);
            return true;
        }
        catch (error) {
            tierStats.errors++;
            throw new CacheError(`Failed to write to ${tier.name}`, {
                operation: 'set',
                driver: 'MultiTierCache',
                tier: tier.name,
                key,
                cause: error,
                suggestion: 'Check L1 cache health'
            });
        }
    }
    async _del(key) {
        const results = await Promise.allSettled(this.drivers.map(async (tier) => {
            try {
                await tier.instance.del(key);
                this._log(`✓ Deleted key "${key}" from ${tier.name}`);
                return { success: true, tier: tier.name };
            }
            catch (error) {
                this._log(`⚠ Failed to delete key "${key}" from ${tier.name}:`, error.message);
                return { success: false, tier: tier.name, error: error };
            }
        }));
        const anySuccess = results.some(r => r.status === 'fulfilled' && r.value.success);
        if (!anySuccess && !this.config.fallbackOnError) {
            throw new CacheError('Failed to delete from all cache tiers', {
                operation: 'delete',
                driver: 'MultiTierCache',
                key,
                results,
                suggestion: 'Enable fallbackOnError or check cache health'
            });
        }
        return true;
    }
    async _clear(prefix) {
        await Promise.allSettled(this.drivers.map(async (tier) => {
            try {
                await tier.instance.clear(prefix);
                this._log(`✓ Cleared ${prefix ? `prefix "${prefix}"` : 'all keys'} from ${tier.name}`);
                return { success: true, tier: tier.name };
            }
            catch (error) {
                this._log(`⚠ Failed to clear ${tier.name}:`, error.message);
                return { success: false, tier: tier.name, error: error };
            }
        }));
        return true;
    }
    async size() {
        let totalSize = 0;
        for (const tier of this.drivers) {
            try {
                if (typeof tier.instance.size === 'function') {
                    const size = await tier.instance.size();
                    totalSize += size;
                }
            }
            catch (error) {
                this._log(`⚠ Failed to get size from ${tier.name}:`, error.message);
            }
        }
        return totalSize;
    }
    async keys() {
        const allKeys = new Set();
        for (const tier of this.drivers) {
            try {
                if (typeof tier.instance.keys === 'function') {
                    const keys = await tier.instance.keys();
                    keys.forEach(k => allKeys.add(k));
                }
            }
            catch (error) {
                this._log(`⚠ Failed to get keys from ${tier.name}:`, error.message);
            }
        }
        return Array.from(allKeys);
    }
    getStats() {
        const totals = {
            hits: 0,
            misses: 0,
            promotions: 0,
            errors: 0,
            sets: 0
        };
        for (const tierStats of this.stats.tiers) {
            totals.hits += tierStats.hits;
            totals.misses += tierStats.misses;
            totals.promotions += tierStats.promotions;
            totals.errors += tierStats.errors;
            totals.sets += tierStats.sets;
        }
        const total = totals.hits + totals.misses;
        const hitRate = total > 0 ? totals.hits / total : 0;
        return {
            enabled: true,
            strategy: this.config.strategy,
            promoteOnHit: this.config.promoteOnHit,
            tiers: this.stats.tiers.map(t => {
                const tierTotal = t.hits + t.misses;
                const tierHitRate = tierTotal > 0 ? t.hits / tierTotal : 0;
                return {
                    ...t,
                    hitRate: tierHitRate,
                    hitRatePercent: (tierHitRate * 100).toFixed(2) + '%'
                };
            }),
            totals: {
                ...totals,
                total,
                hitRate,
                hitRatePercent: (hitRate * 100).toFixed(2) + '%'
            }
        };
    }
}
export default MultiTierCache;
//# sourceMappingURL=multi-tier-cache.class.js.map