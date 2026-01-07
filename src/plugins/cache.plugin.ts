import { join } from 'path';
import jsonStableStringify from 'json-stable-stringify';
import crypto from 'crypto';

import { Plugin, ResourceLike } from './plugin.class.js';
import S3Cache from './cache/s3-cache.class.js';
import MemoryCache from './cache/memory-cache.class.js';
import RedisCache from './cache/redis-cache.class.js';
import { FilesystemCache } from './cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from './cache/partition-aware-filesystem-cache.class.js';
import MultiTierCache from './cache/multi-tier-cache.class.js';
import { resolveCacheMemoryLimit, type MemoryLimitResult } from './cache/utils/memory-limits.js';
export { resolveCacheMemoryLimit, type MemoryLimitResult };
import tryFn from '../concerns/try-fn.js';
import { CacheError } from './cache.errors.js';
import { createLogger, type S3DBLogger, type LogLevel } from '../concerns/logger.js';

interface Database {
  client: S3Client;
  resources: Record<string, Resource>;
  addHook(event: string, handler: (ctx: HookContext) => Promise<void>): void;
}

interface S3Client {
  send(command: unknown): Promise<unknown>;
}

interface Resource {
  name: string;
  $schema: ResourceSchema;
  useMiddleware(method: string, handler: MiddlewareHandler): void;
  get(id: string, options?: Record<string, unknown>): Promise<unknown>;
  getMany(ids: string[], options?: Record<string, unknown>): Promise<unknown[]>;
  list(options?: Record<string, unknown>): Promise<unknown[]>;
  page(options?: Record<string, unknown>): Promise<PageResult | unknown[]>;
  count(options?: Record<string, unknown>): Promise<number>;
  query(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown[]>;
  cacheInstances?: Record<string, CacheDriver>;
  cacheNamespaces?: Record<string, CacheNamespace>;
  cache?: CacheNamespace;
  cacheKeyResolvers?: Record<string, CacheKeyResolver>;
  cacheKeyFor?: CacheKeyResolver;
  getCacheDriver?: (name?: string | null) => CacheDriver | null;
  getCacheNamespace?: (name?: string | null) => CacheNamespace | null;
  getCacheKeyResolver?: (name?: string | null) => CacheKeyResolver | null;
  clearPartitionCache?: (partition: string, partitionValues?: Record<string, unknown>) => Promise<void>;
  getPartitionCacheStats?: (partition?: string | null) => Promise<Record<string, unknown>>;
  getCacheRecommendations?: () => Promise<CacheRecommendation[]>;
  warmPartitionCache?: (partitions: string[], options?: Record<string, unknown>) => Promise<WarmResult>;
}

interface ResourceSchema {
  partitions?: Record<string, PartitionDefinition>;
  createdBy?: string;
}

interface PartitionDefinition {
  fields?: string[];
  [key: string]: unknown;
}

interface PageResult {
  items: unknown[];
  total?: number;
}

interface HookContext {
  resource: Resource;
}

type MiddlewareHandler = (ctx: MiddlewareContext, next: () => Promise<unknown>) => Promise<unknown>;

interface MiddlewareContext {
  args: unknown[];
}

type CacheKeyResolver = (options?: CacheKeyOptions) => Promise<string>;

interface CacheKeyOptions {
  action?: string;
  params?: Record<string, unknown>;
  partition?: string | null;
  partitionValues?: Record<string, unknown> | null;
}

interface CacheDriver {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  clear(keyPrefix?: string): Promise<void>;
  size(): Promise<number>;
  keys(): Promise<string[]>;
  stats?(): CacheDriverStats;
  getStats?(): CacheDriverStats;
  shutdown?(): Promise<void>;
  on?(event: string, handler: (payload: unknown) => void): void;
  _get?(key: string, options: Record<string, unknown>): Promise<unknown>;
  _set?(key: string, value: unknown, options: Record<string, unknown>): Promise<void>;
  getPartitionStats?(resourceName: string, partition?: string | null): Promise<Record<string, unknown>>;
  getCacheRecommendations?(resourceName: string): Promise<CacheRecommendation[]>;
  warmPartitionCache?(resourceName: string, options: Record<string, unknown>): Promise<WarmResult>;
  clearPartition?(resourceName: string, partition: string, partitionValues?: Record<string, unknown>): Promise<void>;
}

interface CacheDriverStats {
  size?: number;
  hits?: number;
  misses?: number;
  [key: string]: unknown;
}

interface CacheRecommendation {
  recommendation: string;
  priority: number;
  partition?: string;
  [key: string]: unknown;
}

interface WarmResult {
  resourceName: string;
  recordsSampled?: number;
  partitionsWarmed?: number;
  [key: string]: unknown;
}

interface CacheNamespace {
  driver: CacheDriver;
  instanceKey: string;
  driverName: string;
  keyFor(action: string, options?: CacheKeyOptions): Promise<string>;
  resolve(action: string, options?: CacheKeyOptions): Promise<string>;
  getDriver(): CacheDriver;
  warm(options?: Record<string, unknown>): Promise<WarmResult>;
  warmItem(id: string, control?: WarmControl): Promise<unknown>;
  warmMany(ids: string[], control?: WarmControl): Promise<unknown>;
  warmList(listOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
  warmPage(pageOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
  warmQuery(filter?: Record<string, unknown>, queryOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
  warmCount(countOptions?: Record<string, unknown>, control?: WarmControl): Promise<unknown>;
  warmPartition(partitions?: string[], options?: Record<string, unknown>): Promise<WarmResult>;
  invalidate(scope?: unknown): Promise<void>;
  clearAll(): Promise<void>;
  stats(): CacheDriverStats;
}

interface WarmControl {
  forceRefresh?: boolean;
  returnData?: boolean;
}

export interface CachePluginOptions {
  driver?: string | CacheDriver;
  drivers?: DriverConfig[];
  promoteOnHit?: boolean;
  strategy?: 'write-through' | 'write-behind' | 'cache-aside';
  fallbackOnError?: boolean;
  ttl?: number;
  maxSize?: number;
  maxMemoryBytes?: number;
  maxMemoryPercent?: number;
  config?: DriverSpecificConfig;
  include?: string[] | null;
  exclude?: string[];
  includePartitions?: boolean;
  partitionStrategy?: string;
  partitionAware?: boolean;
  trackUsage?: boolean;
  preloadRelated?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  verbose?: boolean;
  logger?: S3DBLogger;
  logLevel?: string;
  instanceName?: string;
  slug?: string;
  [key: string]: unknown;
}

interface DriverConfig {
  driver: string;
  name?: string;
  config?: DriverSpecificConfig;
}

interface DriverSpecificConfig {
  ttl?: number;
  maxSize?: number;
  maxMemoryBytes?: number;
  maxMemoryPercent?: number;
  enableCompression?: boolean;
  compressionThreshold?: number;
  inferredMaxMemoryPercent?: number;
  [key: string]: unknown;
}

interface CacheConfig {
  driver: string | CacheDriver;
  drivers?: DriverConfig[];
  isMultiTier: boolean;
  promoteOnHit: boolean;
  strategy: string;
  fallbackOnError: boolean;
  config: DriverSpecificConfig;
  include: string[] | null;
  exclude: string[];
  includePartitions: boolean;
  partitionStrategy: string;
  partitionAware: boolean;
  trackUsage: boolean;
  preloadRelated: boolean;
  retryAttempts: number;
  retryDelay: number;
  logLevel?: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  deletes: number;
  errors: number;
  startTime: number;
}

interface CacheStatsResult {
  hits: number;
  misses: number;
  writes: number;
  deletes: number;
  errors: number;
  total: number;
  hitRate: string;
  missRate: string;
  hitRateDecimal: number;
  missRateDecimal: number;
  uptime: number;
  uptimeFormatted: string;
  startTime: string;
  hitsPerSecond: string | number;
  missesPerSecond: string | number;
  writesPerSecond: string | number;
}

interface CacheAnalysis {
  message?: string;
  totalResources?: number;
  resourceStats?: Record<string, unknown>;
  recommendations?: Record<string, CacheRecommendation[]>;
  summary?: {
    mostUsedPartitions: CacheRecommendation[];
    leastUsedPartitions: CacheRecommendation[];
    suggestedOptimizations: string[];
  };
}

export class CachePlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;
  declare instanceName: string | null;
  declare slug: string;

  config: CacheConfig;
  driver: CacheDriver | null = null;
  stats: CacheStats;

  constructor(options: CachePluginOptions = {}) {
    super(options);

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = (this.logLevel || 'info') as LogLevel;
      this.logger = createLogger({ name: 'CachePlugin', level: logLevel });
    }

    const cacheOptions = this.options as CachePluginOptions;
    const {
      driver = 's3',
      drivers,
      promoteOnHit = true,
      strategy = 'write-through',
      fallbackOnError = true,
      ttl,
      maxSize,
      maxMemoryBytes,
      maxMemoryPercent,
      config = {},
      include = null,
      exclude = [],
      includePartitions = true,
      partitionStrategy = 'hierarchical',
      partitionAware = true,
      trackUsage = true,
      preloadRelated = true,
      retryAttempts = 3,
      retryDelay = 100
    } = cacheOptions;

    const isMultiTier = Array.isArray(drivers) && drivers.length > 0;

    this.config = {
      driver,
      drivers,
      isMultiTier,
      promoteOnHit,
      strategy,
      fallbackOnError,
      config: {
        ttl,
        maxSize,
        maxMemoryBytes,
        maxMemoryPercent,
        ...config
      },
      include,
      exclude,
      includePartitions,
      partitionStrategy,
      partitionAware,
      trackUsage,
      preloadRelated,
      retryAttempts,
      retryDelay,
      logLevel: this.logLevel
    };

    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      deletes: 0,
      errors: 0,
      startTime: Date.now()
    };
  }

  override async onInstall(): Promise<void> {
    if (this.config.isMultiTier) {
      this.driver = await this._createMultiTierDriver();
    } else if (this.config.driver && typeof this.config.driver === 'object') {
      this.driver = this.config.driver as CacheDriver;
    } else {
      if (this.config.driver === 'memory' || (this.config.driver as unknown) === MemoryCache || (this.config.driver as { name?: string })?.name === 'MemoryCache') {
        const resolvedLimit = resolveCacheMemoryLimit({
          maxMemoryBytes: this.config.config?.maxMemoryBytes,
          maxMemoryPercent: this.config.config?.maxMemoryPercent,
        }) as MemoryLimitResult;

        if (!this.config.config) {
          this.config.config = {};
        }

        this.config.config.maxMemoryBytes = resolvedLimit.maxMemoryBytes;

        if (typeof this.config.config.maxMemoryPercent !== 'undefined') {
          delete this.config.config.maxMemoryPercent;
        }

        this.config.config.inferredMaxMemoryPercent = resolvedLimit.inferredPercent;

        const source = resolvedLimit.derivedFromPercent ? 'percent/cgroup' : 'explicit';
        this.logger.warn({
          maxMemoryMB: Math.round(resolvedLimit.maxMemoryBytes / (1024 * 1024)),
          source,
          heapLimitMB: Math.round(resolvedLimit.heapLimit / (1024 * 1024))
        }, `Memory driver capped at ${Math.round(resolvedLimit.maxMemoryBytes / (1024 * 1024))} MB (source: ${source}, heapLimit=${Math.round(resolvedLimit.heapLimit / (1024 * 1024))} MB)`);
      }

      this.driver = await this._createSingleDriver(this.config.driver as string, this.config.config);
    }

    if (this.driver && typeof this.driver.on === 'function') {
      this.driver.on('memory:pressure', (payload: unknown) => {
        this.emit('cache:memoryPressure', {
          driver: 'memory',
          ...(payload as Record<string, unknown>)
        });
        const typedPayload = payload as { reason?: string; currentBytes?: number };
        const reason = typedPayload?.reason || 'unknown';
        this.logger.warn({
          reason,
          currentMB: Math.round((typedPayload?.currentBytes || 0) / (1024 * 1024))
        }, `Memory pressure detected (reason: ${reason}) current=${Math.round((typedPayload?.currentBytes || 0) / (1024 * 1024))}MB`);
      });
      this.driver.on('memory:evict', (payload: unknown) => {
        this.emit('cache:memoryEvict', {
          driver: 'memory',
          ...(payload as Record<string, unknown>)
        });
      });
    }

    this.installDatabaseHooks();
    this.installResourceHooks();
  }

  installDatabaseHooks(): void {
    this.database.addHook('afterCreateResource', async (context: Record<string, unknown>) => {
      const resource = (context as any).resource as Resource;
      if (this.shouldCacheResource(resource.name)) {
        this.installResourceHooksForResource(resource);
      }
    });
  }

  createResourceCacheNamespace(
    resource: Resource,
    driver: CacheDriver,
    computeCacheKey: CacheKeyResolver,
    instanceKey: string
  ): CacheNamespace {
    const plugin = this;

    const keyFor = async (action: string, { params = {}, partition, partitionValues }: CacheKeyOptions = {}): Promise<string> => {
      return computeCacheKey({ action, params, partition, partitionValues });
    };

    const shouldStore = (value: unknown): boolean => value !== undefined && value !== null;

    const namespaceTarget: CacheNamespace = {
      driver,
      instanceKey,
      driverName: driver?.constructor?.name || 'CacheDriver',

      async keyFor(action: string, options: CacheKeyOptions = {}): Promise<string> {
        return keyFor(action, options);
      },

      async resolve(action: string, options: CacheKeyOptions = {}): Promise<string> {
        return keyFor(action, options);
      },

      getDriver(): CacheDriver {
        return driver;
      },

      async warm(options: Record<string, unknown> = {}): Promise<WarmResult> {
        return plugin.warmCache(resource.name, options);
      },

      async warmItem(id: string, control: WarmControl = {}): Promise<unknown> {
        if (!id) {
          throw new CacheError('warmItem requires an id', {
            resource: resource.name,
            driver: driver?.constructor?.name
          });
        }

        const { forceRefresh = false, returnData = false } = control;
        let result: unknown;

        if (forceRefresh) {
          result = await resource.get(id, { skipCache: true });
          if (shouldStore(result)) {
            const key = await keyFor('get', { params: { id } });
            await driver.set(key, result);
          }
        } else {
          result = await resource.get(id);
        }

        return returnData ? result : undefined;
      },

      async warmMany(ids: string[] = [], control: WarmControl = {}): Promise<unknown> {
        if (!Array.isArray(ids) || ids.length === 0) {
          throw new CacheError('warmMany requires a non-empty array of ids', {
            resource: resource.name,
            driver: driver?.constructor?.name
          });
        }

        const { forceRefresh = false, returnData = false } = control;
        const options = forceRefresh ? { skipCache: true } : {};
        const result = await resource.getMany(ids, options);

        if (forceRefresh && shouldStore(result)) {
          const key = await keyFor('getMany', { params: { ids } });
          await driver.set(key, result);
        }

        return returnData ? result : undefined;
      },

      async warmList(listOptions: Record<string, unknown> = {}, control: WarmControl = {}): Promise<unknown> {
        const { forceRefresh = false, returnData = false } = control;
        const options = { ...(listOptions || {}) } as Record<string, unknown>;
        if (forceRefresh) {
          options.skipCache = true;
        }

        const result = await resource.list(options);

        if (forceRefresh && shouldStore(result)) {
          const { partition, partitionValues } = options;
          const key = await keyFor('list', { partition: partition as string | null, partitionValues: partitionValues as Record<string, unknown> | null });
          await driver.set(key, result);
        }

        return returnData ? result : undefined;
      },

      async warmPage(pageOptions: Record<string, unknown> = {}, control: WarmControl = {}): Promise<unknown> {
        const { forceRefresh = false, returnData = false } = control;
        const { offset = 0, size = 100, partition, partitionValues, ...rest } = pageOptions || {};
        const options = { offset, size, partition, partitionValues, ...rest } as Record<string, unknown>;
        if (forceRefresh) {
          options.skipCache = true;
        }

        const result = await resource.page(options);

        if (forceRefresh && shouldStore(result)) {
          const key = await keyFor('page', {
            params: { offset, size },
            partition: partition as string | null,
            partitionValues: partitionValues as Record<string, unknown> | null
          });
          await driver.set(key, result);
        }

        return returnData ? result : undefined;
      },

      async warmQuery(filter: Record<string, unknown> = {}, queryOptions: Record<string, unknown> = {}, control: WarmControl = {}): Promise<unknown> {
        const { forceRefresh = false, returnData = false } = control;
        const options = { ...(queryOptions || {}) } as Record<string, unknown>;

        if (forceRefresh) {
          options.skipCache = true;
        }

        const result = await resource.query(filter, options);

        if (forceRefresh && shouldStore(result)) {
          const key = await keyFor('query', {
            params: {
              filter,
              options: {
                limit: options.limit,
                offset: options.offset
              }
            },
            partition: options.partition as string | null,
            partitionValues: options.partitionValues as Record<string, unknown> | null
          });
          await driver.set(key, result);
        }

        return returnData ? result : undefined;
      },

      async warmCount(countOptions: Record<string, unknown> = {}, control: WarmControl = {}): Promise<unknown> {
        const { forceRefresh = false, returnData = false } = control;
        const options = { ...(countOptions || {}) } as Record<string, unknown>;
        if (forceRefresh) {
          options.skipCache = true;
        }

        const result = await resource.count(options);

        if (forceRefresh && shouldStore(result)) {
          const { partition, partitionValues } = options;
          const key = await keyFor('count', { partition: partition as string | null, partitionValues: partitionValues as Record<string, unknown> | null });
          await driver.set(key, result);
        }

        return returnData ? result : undefined;
      },

      async warmPartition(partitions: string[] = [], options: Record<string, unknown> = {}): Promise<WarmResult> {
        if (typeof resource.warmPartitionCache !== 'function') {
          throw new CacheError('Partition warming is only supported with partition-aware cache drivers', {
            resource: resource.name,
            driver: driver?.constructor?.name
          });
        }

        return resource.warmPartitionCache(partitions, options);
      },

      async invalidate(scope?: unknown): Promise<void> {
        await plugin.clearCacheForResource(resource, scope as Record<string, unknown> | undefined);
      },

      async clearAll(): Promise<void> {
        const keyPrefix = `resource=${resource.name}`;
        await driver.clear(keyPrefix);
      },

      stats(): CacheDriverStats {
        if (typeof driver.stats === 'function') {
          return driver.stats();
        }
        if (typeof driver.getStats === 'function') {
          return driver.getStats();
        }
        return { ...plugin.stats };
      }
    };

    return new Proxy(namespaceTarget, {
      get(target: CacheNamespace, prop: string | symbol, receiver: unknown): unknown {
        if (prop in target) {
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? (value as Function).bind(target) : value;
        }

        const value = (driver as unknown as Record<string | symbol, unknown>)[prop];
        if (typeof value === 'function') {
          return (value as Function).bind(driver);
        }
        return value;
      },
      set(target: CacheNamespace, prop: string | symbol, value: unknown): boolean {
        if (prop in target) {
          (target as unknown as Record<string | symbol, unknown>)[prop] = value;
          return true;
        }
        (driver as unknown as Record<string | symbol, unknown>)[prop] = value;
        return true;
      },
      has(target: CacheNamespace, prop: string | symbol): boolean {
        return prop in target || prop in driver;
      },
      ownKeys(target: CacheNamespace): (string | symbol)[] {
        const targetKeys = Reflect.ownKeys(target);
        const driverKeys = Reflect.ownKeys(driver);
        return Array.from(new Set([...targetKeys, ...driverKeys]));
      },
      getOwnPropertyDescriptor(target: CacheNamespace, prop: string | symbol): PropertyDescriptor | undefined {
        if (Reflect.has(target, prop)) {
          return Object.getOwnPropertyDescriptor(target, prop);
        }
        const descriptor = Object.getOwnPropertyDescriptor(driver, prop);
        if (descriptor) {
          descriptor.configurable = true;
        }
        return descriptor;
      }
    }) as CacheNamespace;
  }

  override async onStart(): Promise<void> {
    // Plugin is ready
  }

  private async _createSingleDriver(driverName: string, config: DriverSpecificConfig): Promise<CacheDriver> {
    if (driverName === 'memory') {
      return new MemoryCache(config) as unknown as CacheDriver;
    } else if (driverName === 'redis') {
      return new RedisCache(config) as unknown as CacheDriver;
    } else if (driverName === 'filesystem') {
      if (this.config.partitionAware) {
        return new PartitionAwareFilesystemCache({
          directory: (config as any).directory || '/tmp/s3db-cache',
          partitionStrategy: this.config.partitionStrategy as 'flat' | 'hierarchical' | 'temporal' | undefined,
          trackUsage: this.config.trackUsage,
          preloadRelated: this.config.preloadRelated,
          ...config
        } as any) as unknown as CacheDriver;
      } else {
        return new FilesystemCache(config as any) as unknown as CacheDriver;
      }
    } else {
      return new S3Cache({
        client: this.database.client,
        ...config
      }) as unknown as CacheDriver;
    }
  }

  private async _createMultiTierDriver(): Promise<CacheDriver> {
    const driverInstances: Array<{ driver: CacheDriver; name: string }> = [];

    for (const driverConfig of this.config.drivers || []) {
      const driverInstance = await this._createSingleDriver(
        driverConfig.driver,
        driverConfig.config || {}
      );

      driverInstances.push({
        driver: driverInstance,
        name: driverConfig.name || `L${driverInstances.length + 1}-${driverConfig.driver}`
      });
    }

    return new MultiTierCache({
      drivers: driverInstances as any,
      promoteOnHit: this.config.promoteOnHit,
      strategy: this.config.strategy as 'write-through' | 'lazy-promotion' | undefined,
      fallbackOnError: this.config.fallbackOnError,
      logLevel: this.logLevel
    }) as unknown as CacheDriver;
  }

  installResourceHooks(): void {
    for (const resource of Object.values(this.database.resources)) {
      if (!this.shouldCacheResource(resource.name)) {
        continue;
      }
      this.installResourceHooksForResource(resource as any);
    }
  }

  shouldCacheResource(resourceName: string): boolean {
    const resource = this.database.resources[resourceName]!;

    if (resource?.$schema?.createdBy && resource.$schema.createdBy !== 'user' && !this.config.include) {
      return false;
    }

    if (resourceName.startsWith('plg_') && !this.config.include) {
      return false;
    }

    if (this.config.exclude.includes(resourceName)) {
      return false;
    }

    if (this.config.include && !this.config.include.includes(resourceName)) {
      return false;
    }

    return true;
  }

  installResourceHooksForResource(resource: Resource): void {
    if (!this.driver) return;

    const driver = this.driver;
    const instanceKey = this.instanceName || this.slug || 'default';

    resource.cacheInstances = resource.cacheInstances || {};
    resource.cacheInstances[instanceKey] = driver;

    const computeCacheKey: CacheKeyResolver = async (options: CacheKeyOptions = {}): Promise<string> => {
      const { action, params = {}, partition, partitionValues } = options;
      return this.generateCacheKey(resource, action || '', params, partition || null, partitionValues || null);
    };

    const cacheNamespace = this.createResourceCacheNamespace(resource, driver, computeCacheKey, instanceKey);

    resource.cacheNamespaces = resource.cacheNamespaces || {};
    resource.cacheNamespaces[instanceKey] = cacheNamespace;

    if (!Object.prototype.hasOwnProperty.call(resource, 'cache')) {
      Object.defineProperty(resource, 'cache', {
        value: cacheNamespace,
        writable: true,
        configurable: true,
        enumerable: false
      });
    }

    if (typeof resource.getCacheDriver !== 'function') {
      Object.defineProperty(resource, 'getCacheDriver', {
        value: (name: string | null = null): CacheDriver | null => {
          if (!name) {
            const defaultNamespace = resource.cache;
            return defaultNamespace?.driver || resource.cacheInstances?.[instanceKey] || null;
          }
          return resource.cacheInstances?.[name] || null;
        },
        writable: true,
        configurable: true,
        enumerable: false
      });
    }

    if (typeof resource.getCacheNamespace !== 'function') {
      Object.defineProperty(resource, 'getCacheNamespace', {
        value: (name: string | null = null): CacheNamespace | null => {
          if (!name) {
            return resource.cache || null;
          }
          return resource.cacheNamespaces?.[name] || null;
        },
        writable: true,
        configurable: true,
        enumerable: false
      });
    }

    resource.cacheKeyResolvers = resource.cacheKeyResolvers || {};
    resource.cacheKeyResolvers[instanceKey] = computeCacheKey;

    if (!resource.cacheKeyFor) {
      resource.cacheKeyFor = computeCacheKey;
    }

    if (typeof resource.getCacheKeyResolver !== 'function') {
      Object.defineProperty(resource, 'getCacheKeyResolver', {
        value: (name: string | null = null): CacheKeyResolver | null => {
          if (!name) return resource.cacheKeyFor || null;
          return resource.cacheKeyResolvers?.[name] || null;
        },
        writable: true,
        configurable: true,
        enumerable: false
      });
    }

    if (this.driver instanceof PartitionAwareFilesystemCache) {
      const partitionDriver = this.driver as unknown as PartitionAwareFilesystemCache;
      (resource as any).clearPartitionCache = async (partition: string, partitionValues: Record<string, unknown> = {}): Promise<void> => {
        await partitionDriver.clearPartition(resource.name, partition, partitionValues);
      };

      (resource as any).getPartitionCacheStats = async (partition: string | null = null): Promise<Record<string, unknown>> => {
        return await partitionDriver.getPartitionStats(resource.name, partition) as unknown as Record<string, unknown>;
      };

      (resource as any).getCacheRecommendations = async (): Promise<CacheRecommendation[]> => {
        return await partitionDriver.getCacheRecommendations(resource.name) as unknown as CacheRecommendation[];
      };

      (resource as any).warmPartitionCache = async (partitions: string[] = [], options: Record<string, unknown> = {}): Promise<WarmResult> => {
        return await partitionDriver.warmPartitionCache(resource.name, { partitions, ...options }) as unknown as WarmResult;
      };
    }

    const cacheMethods = [
      'count', 'listIds', 'getMany', 'getAll', 'page', 'list', 'get',
      'exists', 'content', 'hasContent', 'query', 'getFromPartition'
    ];

    for (const method of cacheMethods) {
      resource.useMiddleware(method, async (ctx: MiddlewareContext, next: () => Promise<unknown>): Promise<unknown> => {
        const resolveCacheKey = resource.cacheKeyResolvers?.[instanceKey] || computeCacheKey;
        let skipCache = false;
        const lastArg = ctx.args[ctx.args.length - 1];
        if (lastArg && typeof lastArg === 'object' && (lastArg as Record<string, unknown>).skipCache === true) {
          skipCache = true;
        }

        if (skipCache) {
          return await next();
        }

        let key: string;
        if (method === 'getMany') {
          key = await resolveCacheKey({ action: method, params: { ids: ctx.args[0] } });
        } else if (method === 'page') {
          const options = (ctx.args[0] || {}) as Record<string, unknown>;
          const { offset, size, partition, partitionValues } = options;
          key = await resolveCacheKey({ action: method, params: { offset, size }, partition: partition as string | null, partitionValues: partitionValues as Record<string, unknown> | null });
        } else if (method === 'list' || method === 'listIds' || method === 'count') {
          const options = (ctx.args[0] || {}) as Record<string, unknown>;
          const { partition, partitionValues } = options;
          key = await resolveCacheKey({ action: method, partition: partition as string | null, partitionValues: partitionValues as Record<string, unknown> | null });
        } else if (method === 'query') {
          const filter = (ctx.args[0] || {}) as Record<string, unknown>;
          const options = (ctx.args[1] || {}) as Record<string, unknown>;
          key = await resolveCacheKey({
            action: method,
            params: { filter, options: { limit: options.limit, offset: options.offset } },
            partition: options.partition as string | null,
            partitionValues: options.partitionValues as Record<string, unknown> | null
          });
        } else if (method === 'getFromPartition') {
          const options = (ctx.args[0] || {}) as Record<string, unknown>;
          const { id, partitionName, partitionValues } = options;
          key = await resolveCacheKey({
            action: method,
            params: { id, partitionName },
            partition: partitionName as string | null,
            partitionValues: partitionValues as Record<string, unknown> | null
          });
        } else if (method === 'getAll') {
          key = await resolveCacheKey({ action: method });
        } else if (['get', 'exists', 'content', 'hasContent'].includes(method)) {
          key = await resolveCacheKey({ action: method, params: { id: ctx.args[0] } });
        } else {
          key = await resolveCacheKey({ action: method });
        }

        if (this.driver instanceof PartitionAwareFilesystemCache) {
          let partition: string | undefined;
          let partitionValues: Record<string, unknown> | undefined;

          if (method === 'list' || method === 'listIds' || method === 'count' || method === 'page') {
            const args = (ctx.args[0] || {}) as Record<string, unknown>;
            partition = args.partition as string | undefined;
            partitionValues = args.partitionValues as Record<string, unknown> | undefined;
          } else if (method === 'query') {
            const options = (ctx.args[1] || {}) as Record<string, unknown>;
            partition = options.partition as string | undefined;
            partitionValues = options.partitionValues as Record<string, unknown> | undefined;
          } else if (method === 'getFromPartition') {
            const options = (ctx.args[0] || {}) as Record<string, unknown>;
            partition = options.partitionName as string | undefined;
            partitionValues = options.partitionValues as Record<string, unknown> | undefined;
          }

          const [ok, err, result] = await tryFn(() => driver._get!(key, {
            resource: resource.name,
            action: method,
            partition,
            partitionValues
          }));

          if (ok && result !== null && result !== undefined) {
            this.stats.hits++;
            return result;
          }
          if (!ok && (err as Error & { name?: string }).name !== 'NoSuchKey') {
            this.stats.errors++;
            throw err;
          }

          this.stats.misses++;
          const freshResult = await next();

          this.stats.writes++;
          await driver._set!(key, freshResult, {
            resource: resource.name,
            action: method,
            partition,
            partitionValues
          });

          return freshResult;
        } else {
          const [ok, err, result] = await tryFn(() => driver.get(key));
          if (ok && result !== null && result !== undefined) {
            this.stats.hits++;
            return result;
          }
          if (!ok && (err as Error & { name?: string }).name !== 'NoSuchKey') {
            this.stats.errors++;
            throw err;
          }

          this.stats.misses++;
          const freshResult = await next();
          this.stats.writes++;
          await driver.set(key, freshResult);
          return freshResult;
        }
      });
    }

    const writeMethods = ['insert', 'update', 'delete', 'deleteMany', 'setContent', 'deleteContent', 'replace'];
    for (const method of writeMethods) {
      resource.useMiddleware(method, async (ctx: MiddlewareContext, next: () => Promise<unknown>): Promise<unknown> => {
        const result = await next();
        if (method === 'insert') {
          await this.clearCacheForResource(resource, ctx.args[0] as Record<string, unknown>);
        } else if (method === 'update') {
          await this.clearCacheForResource(resource, { id: ctx.args[0], ...(ctx.args[1] as Record<string, unknown>) });
        } else if (method === 'delete') {
          let data: Record<string, unknown> = { id: ctx.args[0] as string };
          if (typeof resource.get === 'function') {
            const [ok, , full] = await tryFn(() => resource.get(ctx.args[0] as string));
            if (ok && full) data = full as Record<string, unknown>;
          }
          await this.clearCacheForResource(resource, data);
        } else if (method === 'setContent' || method === 'deleteContent') {
          const id = ((ctx.args[0] as Record<string, unknown>)?.id || ctx.args[0]) as string;
          await this.clearCacheForResource(resource, { id });
        } else if (method === 'replace') {
          const id = ctx.args[0] as string;
          await this.clearCacheForResource(resource, { id, ...(ctx.args[1] as Record<string, unknown>) });
        } else if (method === 'deleteMany') {
          await this.clearCacheForResource(resource);
        }
        return result;
      });
    }
  }

  async clearCacheForResource(resource: Resource, data?: Record<string, unknown>): Promise<void> {
    const driver = this._getDriverForResource(resource);
    if (!driver) return;

    const keyPrefix = `resource=${resource.name}`;

    if (data && data.id) {
      const itemSpecificMethods = ['get', 'exists', 'content', 'hasContent'];
      for (const method of itemSpecificMethods) {
        const specificKey = await this.generateCacheKey(resource, method, { id: data.id });
        const [ok, err] = await this.clearCacheWithRetry(driver, specificKey);

        if (!ok) {
          this.emit('plg:cache:clear-error', {
            resource: resource.name,
            method,
            id: data.id,
            error: (err as Error).message
          });

          this.logger.warn({ resourceName: resource.name, method, id: data.id, error: (err as Error).message }, `Failed to clear ${method} cache for ${resource.name}:${data.id}: ${(err as Error).message}`);
        }
      }

      if (this.config.includePartitions === true && resource.$schema.partitions && Object.keys(resource.$schema.partitions).length > 0) {
        const partitionValues = this.getPartitionValues(data, resource as any);
        for (const [partitionName, values] of Object.entries(partitionValues)) {
          if (values && Object.keys(values as Record<string, unknown>).length > 0 && Object.values(values as Record<string, unknown>).some(v => v !== null && v !== undefined)) {
            const partitionKeyPrefix = join(keyPrefix, `partition=${partitionName}`);
            const [ok, err] = await this.clearCacheWithRetry(driver, partitionKeyPrefix);

            if (!ok) {
              this.emit('plg:cache:clear-error', {
                resource: resource.name,
                partition: partitionName,
                error: (err as Error).message
              });

              this.logger.warn({ resourceName: resource.name, partitionName, error: (err as Error).message }, `Failed to clear partition cache for ${resource.name}/${partitionName}: ${(err as Error).message}`);
            }
          }
        }
      }
    }

    const [ok, err] = await this.clearCacheWithRetry(driver, keyPrefix);

    if (!ok) {
      this.emit('plg:cache:clear-error', {
        resource: resource.name,
        type: 'broad',
        error: (err as Error).message
      });

      this.logger.warn({ resourceName: resource.name, error: (err as Error).message }, `Failed to clear broad cache for ${resource.name}, trying specific methods: ${(err as Error).message}`);

      const aggregateMethods = ['count', 'list', 'listIds', 'getAll', 'page', 'query'];
      for (const method of aggregateMethods) {
        await this.clearCacheWithRetry(driver, `${keyPrefix}/action=${method}`);
        await this.clearCacheWithRetry(driver, `resource=${resource.name}/action=${method}`);
      }
    }
  }

  async clearCacheWithRetry(cache: CacheDriver, key: string): Promise<[boolean, Error | null]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      const [ok, err] = await tryFn(() => cache.clear(key));

      if (ok) {
        this.stats.deletes++;
        return [true, null];
      }

      lastError = err as Error;

      if ((err as Error & { name?: string; code?: string }).name === 'NoSuchKey' || (err as Error & { name?: string; code?: string }).code === 'NoSuchKey') {
        return [true, null];
      }

      if (attempt < this.config.retryAttempts - 1) {
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return [false, lastError];
  }

  private _getDriverForResource(resource: Resource): CacheDriver | null {
    const instanceKey = this.instanceName || this.slug || 'default';
    if (resource?.cacheInstances && instanceKey && resource.cacheInstances[instanceKey]) {
      return resource.cacheInstances[instanceKey];
    }
    return this.driver;
  }

  async generateCacheKey(
    resource: Resource,
    action: string,
    params: Record<string, unknown> = {},
    partition: string | null = null,
    partitionValues: Record<string, unknown> | null = null
  ): Promise<string> {
    const keyParts = [
      `resource=${resource.name}`,
      `action=${action}`
    ];

    if (partition && partitionValues && Object.keys(partitionValues).length > 0) {
      keyParts.push(`partition:${partition}`);
      for (const [field, value] of Object.entries(partitionValues)) {
        if (value !== null && value !== undefined) {
          keyParts.push(`${field}:${value}`);
        }
      }
    }

    if (Object.keys(params).length > 0) {
      const paramsHash = this.hashParams(params);
      keyParts.push(paramsHash);
    }

    return join(...keyParts) + '.json.gz';
  }

  hashParams(params: Record<string, unknown>): string {
    const serialized = jsonStableStringify(params) || 'empty';
    return crypto.createHash('md5').update(serialized).digest('hex').substring(0, 16);
  }

  override getPartitionValues(data: Record<string, unknown>, resource: ResourceLike): Record<string, Record<string, unknown>> {
    const partitionValues: Record<string, Record<string, unknown>> = {};

    const schema = resource.$schema as ResourceSchema | undefined;
    if (!schema?.partitions) {
      return partitionValues;
    }

    for (const [partitionName, partitionDef] of Object.entries(schema.partitions)) {
      const typedPartitionDef = partitionDef as PartitionDefinition;
      if (typedPartitionDef.fields) {
        const values: Record<string, unknown> = {};
        for (const field of typedPartitionDef.fields) {
          if (data[field] !== undefined) {
            values[field] = data[field];
          }
        }
        if (Object.keys(values).length > 0) {
          partitionValues[partitionName] = values;
        }
      }
    }

    return partitionValues;
  }

  async getCacheStats(): Promise<{ size: number; keys: string[]; driver: string; stats: CacheDriverStats | null } | null> {
    if (!this.driver) return null;

    const driverStats = typeof this.driver.getStats === 'function'
      ? this.driver.getStats()
      : null;

    return {
      size: await this.driver.size(),
      keys: await this.driver.keys(),
      driver: this.driver.constructor.name,
      stats: driverStats
    };
  }

  async clearAllCache(): Promise<void> {
    if (!this.driver) return;

    for (const resource of Object.values(this.database.resources)) {
      const driver = this._getDriverForResource(resource as any);
      if (!driver) continue;

      const keyPrefix = `resource=${resource.name}`;
      await driver.clear(keyPrefix);
    }
  }

  async warmCache(resourceName: string, options: Record<string, unknown> = {}): Promise<WarmResult> {
    const resource = this.database.resources[resourceName]!;
    if (!resource) {
      throw new CacheError('Resource not found for cache warming', {
        operation: 'warmCache',
        driver: this.driver?.constructor.name,
        resourceName,
        availableResources: Object.keys(this.database.resources),
        suggestion: 'Check resource name spelling or ensure resource has been created'
      });
    }

    const { includePartitions = true, sampleSize = 100 } = options;

    if (this.driver instanceof PartitionAwareFilesystemCache && (resource as any).warmPartitionCache) {
      const partitionNames = resource.$schema.partitions ? Object.keys(resource.$schema.partitions) : [];
      return await (resource as any).warmPartitionCache(partitionNames, options);
    }

    let offset = 0;
    const pageSize = 100;
    const sampledRecords: Record<string, unknown>[] = [];

    while (sampledRecords.length < (sampleSize as number)) {
      const [ok, , pageResult] = await tryFn(() => resource.page({ offset, size: pageSize }));

      if (!ok || !pageResult) {
        break;
      }

      const pageItems = Array.isArray(pageResult)
        ? pageResult
        : ((pageResult as PageResult).items || []);

      if (pageItems.length === 0) {
        break;
      }

      sampledRecords.push(...(pageItems as Record<string, unknown>[]));
      offset += pageSize;
    }

    if (includePartitions && resource.$schema.partitions && sampledRecords.length > 0) {
      for (const [partitionName, partitionDef] of Object.entries(resource.$schema.partitions)) {
        if (partitionDef.fields) {
          const partitionValuesSet = new Set<string>();

          for (const record of sampledRecords) {
            const values = this.getPartitionValues(record, resource as ResourceLike);
            if (values[partitionName]) {
              partitionValuesSet.add(JSON.stringify(values[partitionName]));
            }
          }

          for (const partitionValueStr of partitionValuesSet) {
            const partitionValues = JSON.parse(partitionValueStr);
            await tryFn(() => resource.list({ partition: partitionName, partitionValues }));
          }
        }
      }
    }

    return {
      resourceName,
      recordsSampled: sampledRecords.length,
      partitionsWarmed: includePartitions && resource.$schema.partitions
        ? Object.keys(resource.$schema.partitions).length
        : 0
    };
  }

  async analyzeCacheUsage(): Promise<CacheAnalysis> {
    if (!(this.driver instanceof PartitionAwareFilesystemCache)) {
      return { message: 'Cache usage analysis is only available with PartitionAwareFilesystemCache' };
    }

    const analysis: CacheAnalysis = {
      totalResources: Object.keys(this.database.resources).length,
      resourceStats: {},
      recommendations: {},
      summary: {
        mostUsedPartitions: [],
        leastUsedPartitions: [],
        suggestedOptimizations: []
      }
    };

    for (const [resourceName] of Object.entries(this.database.resources)) {
      if (!this.shouldCacheResource(resourceName)) {
        continue;
      }

      try {
        analysis.resourceStats![resourceName] = await this.driver.getPartitionStats(resourceName);
        analysis.recommendations![resourceName] = await this.driver.getCacheRecommendations(resourceName);
      } catch (error) {
        analysis.resourceStats![resourceName] = { error: (error as Error).message };
      }
    }

    const allRecommendations = Object.values(analysis.recommendations!).flat();
    analysis.summary!.mostUsedPartitions = allRecommendations
      .filter(r => r.recommendation === 'preload')
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5);

    analysis.summary!.leastUsedPartitions = allRecommendations
      .filter(r => r.recommendation === 'archive')
      .slice(0, 5);

    analysis.summary!.suggestedOptimizations = [
      `Consider preloading ${analysis.summary!.mostUsedPartitions.length} high-usage partitions`,
      `Archive ${analysis.summary!.leastUsedPartitions.length} unused partitions`,
      `Monitor cache hit rates for partition efficiency`
    ];

    return analysis;
  }

  getStats(): CacheStatsResult {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    const missRate = total > 0 ? (this.stats.misses / total) * 100 : 0;
    const uptime = Date.now() - this.stats.startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      writes: this.stats.writes,
      deletes: this.stats.deletes,
      errors: this.stats.errors,
      total,
      hitRate: hitRate.toFixed(2) + '%',
      missRate: missRate.toFixed(2) + '%',
      hitRateDecimal: hitRate / 100,
      missRateDecimal: missRate / 100,
      uptime: uptimeSeconds,
      uptimeFormatted: this._formatUptime(uptimeSeconds),
      startTime: new Date(this.stats.startTime).toISOString(),
      hitsPerSecond: uptimeSeconds > 0 ? (this.stats.hits / uptimeSeconds).toFixed(2) : 0,
      missesPerSecond: uptimeSeconds > 0 ? (this.stats.misses / uptimeSeconds).toFixed(2) : 0,
      writesPerSecond: uptimeSeconds > 0 ? (this.stats.writes / uptimeSeconds).toFixed(2) : 0
    };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      deletes: 0,
      errors: 0,
      startTime: Date.now()
    };
  }

  private _formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  override async onStop(): Promise<void> {
    if (this.driver && typeof this.driver.shutdown === 'function') {
      await this.driver.shutdown();
    }
  }
}
