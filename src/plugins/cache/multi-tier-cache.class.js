/**
 * Multi-Tier Cache
 *
 * Cascading cache implementation that chains multiple cache drivers (L1 → L2 → L3).
 * Provides automatic promotion of hot data to faster layers and fallback on errors.
 *
 * @example
 * // Memory → Redis → S3 cascade
 * const cache = new MultiTierCache({
 *   drivers: [
 *     { driver: memoryInstance, name: 'L1-Memory' },
 *     { driver: redisInstance, name: 'L2-Redis' },
 *     { driver: s3Instance, name: 'L3-S3' }
 *   ],
 *   promoteOnHit: true,
 *   strategy: 'write-through'
 * });
 */
import { Cache } from "./cache.class.js";
import { CacheError } from "../cache.errors.js";

export class MultiTierCache extends Cache {
  constructor({
    drivers = [],
    promoteOnHit = true,
    strategy = 'write-through', // 'write-through' | 'lazy-promotion'
    fallbackOnError = true,
    verbose = false
  }) {
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
      verbose
    };

    // Statistics per tier
    this.stats = {
      enabled: true,
      tiers: this.drivers.map(d => ({
        name: d.name,
        hits: 0,
        misses: 0,
        promotions: 0,
        errors: 0,
        sets: 0
      }))
    };
  }

  /**
   * Log message if verbose enabled
   * @private
   */
  _log(...args) {
    if (this.config.verbose) {
      this.logger.info('[MultiTierCache]', ...args);
    }
  }

  /**
   * Get value from cache tiers (cascade L1 → L2 → L3)
   * @private
   */
  async _get(key) {
    for (let i = 0; i < this.drivers.length; i++) {
      const tier = this.drivers[i];
      const tierStats = this.stats.tiers[i];

      try {
        const value = await tier.instance.get(key);

        if (value !== null && value !== undefined) {
          // Cache hit!
          tierStats.hits++;
          this._log(`✓ Cache HIT on ${tier.name} for key: ${key}`);

          // Promote to faster tiers if enabled and not already in L1
          if (this.config.promoteOnHit && i > 0) {
            this._promoteToFasterTiers(key, value, i);
          }

          return value;
        } else {
          // Cache miss on this tier, try next
          tierStats.misses++;
          this._log(`✗ Cache MISS on ${tier.name} for key: ${key}`);
        }
      } catch (error) {
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

        // Continue to next tier on error (fallback)
        continue;
      }
    }

    // Miss on all tiers
    this._log(`✗ Cache MISS on ALL tiers for key: ${key}`);
    return null;
  }

  /**
   * Promote value to faster tiers (L2 hit → write to L1, L3 hit → write to L1+L2)
   * @private
   */
  async _promoteToFasterTiers(key, value, hitTierIndex) {
    // Write to all tiers faster than the one where we found the value
    for (let i = 0; i < hitTierIndex; i++) {
      const tier = this.drivers[i];
      const tierStats = this.stats.tiers[i];

      try {
        await tier.instance.set(key, value);
        tierStats.promotions++;
        this._log(`↑ Promoted key "${key}" to ${tier.name}`);
      } catch (error) {
        tierStats.errors++;
        this._log(`⚠ Failed to promote key "${key}" to ${tier.name}:`, error.message);
        // Continue promoting to other tiers even if one fails
      }
    }
  }

  /**
   * Set value in cache tiers
   * @private
   */
  async _set(key, data) {
    if (this.config.strategy === 'write-through') {
      // Write to ALL tiers immediately
      return this._writeToAllTiers(key, data);
    } else if (this.config.strategy === 'lazy-promotion') {
      // Write only to L1, let promotions handle the rest
      return this._writeToL1Only(key, data);
    }
  }

  /**
   * Write-through strategy: write to all tiers immediately
   * @private
   */
  async _writeToAllTiers(key, data) {
    const results = await Promise.allSettled(
      this.drivers.map(async (tier, index) => {
        try {
          await tier.instance.set(key, data);
          this.stats.tiers[index].sets++;
          this._log(`✓ Wrote key "${key}" to ${tier.name}`);
          return { success: true, tier: tier.name };
        } catch (error) {
          this.stats.tiers[index].errors++;
          this._log(`⚠ Failed to write key "${key}" to ${tier.name}:`, error.message);
          return { success: false, tier: tier.name, error };
        }
      })
    );

    // Check if at least L1 succeeded
    const l1Success = results[0]?.status === 'fulfilled' && results[0].value.success;

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

  /**
   * Lazy-promotion strategy: write only to L1
   * @private
   */
  async _writeToL1Only(key, data) {
    const tier = this.drivers[0];
    const tierStats = this.stats.tiers[0];

    try {
      await tier.instance.set(key, data);
      tierStats.sets++;
      this._log(`✓ Wrote key "${key}" to ${tier.name} (lazy-promotion)`);
      return true;
    } catch (error) {
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

  /**
   * Delete key from all tiers
   * @private
   */
  async _del(key) {
    const results = await Promise.allSettled(
      this.drivers.map(async (tier) => {
        try {
          await tier.instance.del(key);
          this._log(`✓ Deleted key "${key}" from ${tier.name}`);
          return { success: true, tier: tier.name };
        } catch (error) {
          this._log(`⚠ Failed to delete key "${key}" from ${tier.name}:`, error.message);
          return { success: false, tier: tier.name, error };
        }
      })
    );

    // Consider successful if at least one tier succeeded
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

  /**
   * Clear all keys from all tiers
   * @private
   */
  async _clear(prefix) {
    const results = await Promise.allSettled(
      this.drivers.map(async (tier) => {
        try {
          await tier.instance.clear(prefix);
          this._log(`✓ Cleared ${prefix ? `prefix "${prefix}"` : 'all keys'} from ${tier.name}`);
          return { success: true, tier: tier.name };
        } catch (error) {
          this._log(`⚠ Failed to clear ${tier.name}:`, error.message);
          return { success: false, tier: tier.name, error };
        }
      })
    );

    return true;
  }

  /**
   * Get total size across all tiers (may have duplicates)
   */
  async size() {
    let totalSize = 0;

    for (const tier of this.drivers) {
      try {
        if (typeof tier.instance.size === 'function') {
          const size = await tier.instance.size();
          totalSize += size;
        }
      } catch (error) {
        this._log(`⚠ Failed to get size from ${tier.name}:`, error.message);
      }
    }

    return totalSize;
  }

  /**
   * Get all keys from all tiers (deduplicated)
   */
  async keys() {
    const allKeys = new Set();

    for (const tier of this.drivers) {
      try {
        if (typeof tier.instance.keys === 'function') {
          const keys = await tier.instance.keys();
          keys.forEach(k => allKeys.add(k));
        }
      } catch (error) {
        this._log(`⚠ Failed to get keys from ${tier.name}:`, error.message);
      }
    }

    return Array.from(allKeys);
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    // Calculate totals
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
