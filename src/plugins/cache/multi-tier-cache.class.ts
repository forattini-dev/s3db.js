import { Cache, type CacheConfig } from "./cache.class.js";
import { CacheError } from "../cache.errors.js";
import { createLogger, type Logger, type LogLevel } from '../../concerns/logger.js';

export interface CacheDriver {
  get<T>(key: string): Promise<T | null | undefined>;
  set<T>(key: string, data: T): Promise<T>;
  del(key: string): Promise<unknown>;
  clear(prefix?: string): Promise<unknown>;
  size?(): Promise<number>;
  keys?(): Promise<string[]>;
}

export interface DriverConfig {
  driver: CacheDriver;
  name?: string;
}

export interface TierInfo {
  instance: CacheDriver;
  name: string;
  tier: number;
}

export interface MultiTierCacheConfig extends CacheConfig {
  drivers?: DriverConfig[];
  promoteOnHit?: boolean;
  strategy?: 'write-through' | 'lazy-promotion';
  fallbackOnError?: boolean;
  logLevel?: string;
}

export interface TierStats {
  name: string;
  tier: number;
  hits: number;
  misses: number;
  errors: number;
  sets: number;
  promotions: number;
  hitRate?: number;
  hitRatePercent?: string;
}

export interface MultiTierCacheStats {
  hits: number;
  misses: number;
  writes: number;
  deletes: number;
  errors: number;
  tiers: TierStats[];
}

export interface MultiTierCacheStatsResult {
  enabled: boolean;
  strategy: string;
  promoteOnHit: boolean;
  tiers: TierStats[];
  totals: {
    hits: number;
    misses: number;
    promotions: number;
    errors: number;
    sets: number;
    total: number;
    hitRate: number;
    hitRatePercent: string;
  };
}

interface WriteResult {
  success: boolean;
  tier: string;
  error?: Error;
}

export class MultiTierCache extends Cache {
  declare config: MultiTierCacheConfig & {
    promoteOnHit: boolean;
    strategy: string;
    fallbackOnError: boolean;
    logLevel: string;
  };
  drivers: TierInfo[];
  stats: MultiTierCacheStats;
  logger: Logger;

  constructor({
    drivers = [],
    promoteOnHit = true,
    strategy = 'write-through',
    fallbackOnError = true,
    logLevel = 'info'
  }: MultiTierCacheConfig) {
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
      level: logLevel as LogLevel
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

    if ((this.logger as { isLevelEnabled?: (level: string) => boolean }).isLevelEnabled?.('info')) {
      this.logger.info('[MultiTierCache] Initialized with %d drivers', this.drivers.length);
    }
  }

  private _log(...args: unknown[]): void {
    if (this.config.logLevel && args.length > 0) {
      const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
      this.logger.debug(`[MultiTierCache] ${message}`);
    }
  }

  protected override async _get(key: string): Promise<unknown> {
    for (let i = 0; i < this.drivers.length; i++) {
      const tier = this.drivers[i]!;
      const tierStats = this.stats.tiers[i]!;

      try {
        const value = await tier.instance.get(key);

        if (value !== null && value !== undefined) {
          tierStats.hits++;
          this._log(`✓ Cache HIT on ${tier.name} for key: ${key}`);

          if (this.config.promoteOnHit && i > 0) {
            this._promoteToFasterTiers(key, value, i);
          }

          return value;
        } else {
          tierStats.misses++;
          this._log(`✗ Cache MISS on ${tier.name} for key: ${key}`);
        }
      } catch (error) {
        tierStats.errors++;
        this._log(`⚠ Error on ${tier.name} for key: ${key}`, (error as Error).message);

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

  private async _promoteToFasterTiers(key: string, value: unknown, hitTierIndex: number): Promise<void> {
    for (let i = 0; i < hitTierIndex; i++) {
      const tier = this.drivers[i]!;
      const tierStats = this.stats.tiers[i]!;

      try {
        await tier.instance.set(key, value);
        tierStats.promotions++;
        this._log(`↑ Promoted key "${key}" to ${tier.name}`);
      } catch (error) {
        tierStats.errors++;
        this._log(`⚠ Failed to promote key "${key}" to ${tier.name}:`, (error as Error).message);
      }
    }
  }

  protected override async _set(key: string, data: unknown): Promise<void> {
    if (this.config.strategy === 'write-through') {
      await this._writeToAllTiers(key, data);
    } else if (this.config.strategy === 'lazy-promotion') {
      await this._writeToL1Only(key, data);
    }
  }

  private async _writeToAllTiers(key: string, data: unknown): Promise<boolean> {
    const results = await Promise.allSettled(
      this.drivers.map(async (tier, index): Promise<WriteResult> => {
        try {
          await tier.instance.set(key, data);
          this.stats.tiers[index]!.sets++;
          this._log(`✓ Wrote key "${key}" to ${tier.name}`);
          return { success: true, tier: tier.name };
        } catch (error) {
          this.stats.tiers[index]!.errors++;
          this._log(`⚠ Failed to write key "${key}" to ${tier.name}:`, (error as Error).message);
          return { success: false, tier: tier.name, error: error as Error };
        }
      })
    );

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

  private async _writeToL1Only(key: string, data: unknown): Promise<boolean> {
    const tier = this.drivers[0]!;
    const tierStats = this.stats.tiers[0]!;

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

  protected override async _del(key: string): Promise<unknown> {
    const results = await Promise.allSettled(
      this.drivers.map(async (tier): Promise<WriteResult> => {
        try {
          await tier.instance.del(key);
          this._log(`✓ Deleted key "${key}" from ${tier.name}`);
          return { success: true, tier: tier.name };
        } catch (error) {
          this._log(`⚠ Failed to delete key "${key}" from ${tier.name}:`, (error as Error).message);
          return { success: false, tier: tier.name, error: error as Error };
        }
      })
    );

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

  protected override async _clear(prefix?: string): Promise<unknown> {
    await Promise.allSettled(
      this.drivers.map(async (tier): Promise<WriteResult> => {
        try {
          await tier.instance.clear(prefix);
          this._log(`✓ Cleared ${prefix ? `prefix "${prefix}"` : 'all keys'} from ${tier.name}`);
          return { success: true, tier: tier.name };
        } catch (error) {
          this._log(`⚠ Failed to clear ${tier.name}:`, (error as Error).message);
          return { success: false, tier: tier.name, error: error as Error };
        }
      })
    );

    return true;
  }

  async size(): Promise<number> {
    let totalSize = 0;

    for (const tier of this.drivers) {
      try {
        if (typeof tier.instance.size === 'function') {
          const size = await tier.instance.size();
          totalSize += size;
        }
      } catch (error) {
        this._log(`⚠ Failed to get size from ${tier.name}:`, (error as Error).message);
      }
    }

    return totalSize;
  }

  async keys(): Promise<string[]> {
    const allKeys = new Set<string>();

    for (const tier of this.drivers) {
      try {
        if (typeof tier.instance.keys === 'function') {
          const keys = await tier.instance.keys();
          keys.forEach(k => allKeys.add(k));
        }
      } catch (error) {
        this._log(`⚠ Failed to get keys from ${tier.name}:`, (error as Error).message);
      }
    }

    return Array.from(allKeys);
  }

  getStats(): MultiTierCacheStatsResult {
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
