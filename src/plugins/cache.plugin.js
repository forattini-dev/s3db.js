import { join } from "path";
import jsonStableStringify from "json-stable-stringify";
import crypto from 'crypto';

import Plugin from "./plugin.class.js";
import S3Cache from "./cache/s3-cache.class.js";
import MemoryCache from "./cache/memory-cache.class.js";
import { FilesystemCache } from "./cache/filesystem-cache.class.js";
import { PartitionAwareFilesystemCache } from "./cache/partition-aware-filesystem-cache.class.js";
import tryFn from "../concerns/try-fn.js";

export class CachePlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    // Clean, consolidated configuration
    this.config = {
      // Driver configuration
      driver: options.driver || 's3',
      config: {
        ttl: options.ttl,
        maxSize: options.maxSize,
        ...options.config // Driver-specific config (can override ttl/maxSize)
      },

      // Resource filtering
      include: options.include || null, // Array of resource names to cache (null = all)
      exclude: options.exclude || [], // Array of resource names to exclude

      // Partition settings
      includePartitions: options.includePartitions !== false,
      partitionStrategy: options.partitionStrategy || 'hierarchical',
      partitionAware: options.partitionAware !== false,
      trackUsage: options.trackUsage !== false,
      preloadRelated: options.preloadRelated !== false,

      // Retry configuration
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 100, // ms

      // Logging
      verbose: options.verbose || false
    };
  }

  async onInstall() {
    // Initialize cache driver
    if (this.config.driver && typeof this.config.driver === 'object') {
      // Use custom driver instance if provided
      this.driver = this.config.driver;
    } else if (this.config.driver === 'memory') {
      this.driver = new MemoryCache(this.config.config);
    } else if (this.config.driver === 'filesystem') {
      // Use partition-aware filesystem cache if enabled
      if (this.config.partitionAware) {
        this.driver = new PartitionAwareFilesystemCache({
          partitionStrategy: this.config.partitionStrategy,
          trackUsage: this.config.trackUsage,
          preloadRelated: this.config.preloadRelated,
          ...this.config.config
        });
      } else {
        this.driver = new FilesystemCache(this.config.config);
      }
    } else {
      // Default to S3Cache
      this.driver = new S3Cache({
        client: this.database.client,
        ...this.config.config
      });
    }

    // Use database hooks instead of method overwriting
    this.installDatabaseHooks();

    // Install hooks for existing resources
    this.installResourceHooks();
  }

  /**
   * Install database hooks to handle resource creation/updates
   */
  installDatabaseHooks() {
    // Hook into resource creation to install cache middleware
    this.database.addHook('afterCreateResource', async ({ resource }) => {
      if (this.shouldCacheResource(resource.name)) {
        this.installResourceHooksForResource(resource);
      }
    });
  }

  async onStart() {
    // Plugin is ready
  }

  async onStop() {
    // Cleanup if needed
  }

  // Remove the old installDatabaseProxy method
  installResourceHooks() {
    for (const resource of Object.values(this.database.resources)) {
      // Check if resource should be cached
      if (!this.shouldCacheResource(resource.name)) {
        continue;
      }
      this.installResourceHooksForResource(resource);
    }
  }

  shouldCacheResource(resourceName) {
    // Get resource metadata to check createdBy
    const resourceMetadata = this.database.savedMetadata?.resources?.[resourceName];

    // Skip plugin-created resources by default (unless explicitly included)
    if (resourceMetadata?.createdBy && resourceMetadata.createdBy !== 'user' && !this.config.include) {
      return false;
    }

    // Legacy: Skip plugin resources by name pattern (unless explicitly included)
    if (resourceName.startsWith('plg_') && !this.config.include) {
      return false;
    }

    // Check exclude list
    if (this.config.exclude.includes(resourceName)) {
      return false;
    }

    // Check include list (if specified)
    if (this.config.include && !this.config.include.includes(resourceName)) {
      return false;
    }

    return true;
  }

  installResourceHooksForResource(resource) {
    if (!this.driver) return;

    // Add cache methods to resource
    Object.defineProperty(resource, 'cache', {
      value: this.driver,
      writable: true,
      configurable: true,
      enumerable: false
    });
    resource.cacheKeyFor = async (options = {}) => {
      const { action, params = {}, partition, partitionValues } = options;
      return this.generateCacheKey(resource, action, params, partition, partitionValues);
    };

    // Add partition-aware methods if using PartitionAwareFilesystemCache
    if (this.driver instanceof PartitionAwareFilesystemCache) {
      resource.clearPartitionCache = async (partition, partitionValues = {}) => {
        return await this.driver.clearPartition(resource.name, partition, partitionValues);
      };
      
      resource.getPartitionCacheStats = async (partition = null) => {
        return await this.driver.getPartitionStats(resource.name, partition);
      };
      
      resource.getCacheRecommendations = async () => {
        return await this.driver.getCacheRecommendations(resource.name);
      };
      
      resource.warmPartitionCache = async (partitions = [], options = {}) => {
        return await this.driver.warmPartitionCache(resource.name, { partitions, ...options });
      };
    }

    // Expanded list of methods to cache (including previously missing ones)
    const cacheMethods = [
      'count', 'listIds', 'getMany', 'getAll', 'page', 'list', 'get',
      'exists', 'content', 'hasContent', 'query', 'getFromPartition'
    ];
    
    for (const method of cacheMethods) {
      resource.useMiddleware(method, async (ctx, next) => {
        // Check for skipCache option in the last argument
        let skipCache = false;
        const lastArg = ctx.args[ctx.args.length - 1];
        if (lastArg && typeof lastArg === 'object' && lastArg.skipCache === true) {
          skipCache = true;
        }

        // If skipCache is true, bypass cache entirely
        if (skipCache) {
          return await next();
        }

        // Build cache key
        let key;
        if (method === 'getMany') {
          key = await resource.cacheKeyFor({ action: method, params: { ids: ctx.args[0] } });
        } else if (method === 'page') {
          const { offset, size, partition, partitionValues } = ctx.args[0] || {};
          key = await resource.cacheKeyFor({ action: method, params: { offset, size }, partition, partitionValues });
        } else if (method === 'list' || method === 'listIds' || method === 'count') {
          const { partition, partitionValues } = ctx.args[0] || {};
          key = await resource.cacheKeyFor({ action: method, partition, partitionValues });
        } else if (method === 'query') {
          const filter = ctx.args[0] || {};
          const options = ctx.args[1] || {};
          key = await resource.cacheKeyFor({
            action: method,
            params: { filter, options: { limit: options.limit, offset: options.offset } },
            partition: options.partition,
            partitionValues: options.partitionValues
          });
        } else if (method === 'getFromPartition') {
          const { id, partitionName, partitionValues } = ctx.args[0] || {};
          key = await resource.cacheKeyFor({
            action: method,
            params: { id, partitionName },
            partition: partitionName,
            partitionValues
          });
        } else if (method === 'getAll') {
          key = await resource.cacheKeyFor({ action: method });
        } else if (['get', 'exists', 'content', 'hasContent'].includes(method)) {
          key = await resource.cacheKeyFor({ action: method, params: { id: ctx.args[0] } });
        }
        
        // Try cache with partition awareness
        let cached;
        if (this.driver instanceof PartitionAwareFilesystemCache) {
          // Extract partition info for partition-aware cache
          let partition, partitionValues;
          if (method === 'list' || method === 'listIds' || method === 'count' || method === 'page') {
            const args = ctx.args[0] || {};
            partition = args.partition;
            partitionValues = args.partitionValues;
          } else if (method === 'query') {
            const options = ctx.args[1] || {};
            partition = options.partition;
            partitionValues = options.partitionValues;
          } else if (method === 'getFromPartition') {
            const { partitionName, partitionValues: pValues } = ctx.args[0] || {};
            partition = partitionName;
            partitionValues = pValues;
          }
          
          const [ok, err, result] = await tryFn(() => resource.cache._get(key, {
            resource: resource.name,
            action: method,
            partition,
            partitionValues
          }));
          
          if (ok && result !== null && result !== undefined) return result;
          if (!ok && err.name !== 'NoSuchKey') throw err;
          
          // Not cached, call next
          const freshResult = await next();
          
          // Store with partition context
          await resource.cache._set(key, freshResult, {
            resource: resource.name,
            action: method,
            partition,
            partitionValues
          });
          
          return freshResult;
        } else {
          // Standard cache behavior
          const [ok, err, result] = await tryFn(() => resource.cache.get(key));
          if (ok && result !== null && result !== undefined) return result;
          if (!ok && err.name !== 'NoSuchKey') throw err;
          
          // Not cached, call next
          const freshResult = await next();
          await resource.cache.set(key, freshResult);
          return freshResult;
        }
      });
    }

    // List of methods to clear cache on write (expanded to include new methods)
    const writeMethods = ['insert', 'update', 'delete', 'deleteMany', 'setContent', 'deleteContent', 'replace'];
    for (const method of writeMethods) {
      resource.useMiddleware(method, async (ctx, next) => {
        const result = await next();
        // Determine which records to clear
        if (method === 'insert') {
          await this.clearCacheForResource(resource, ctx.args[0]);
        } else if (method === 'update') {
          await this.clearCacheForResource(resource, { id: ctx.args[0], ...ctx.args[1] });
        } else if (method === 'delete') {
          let data = { id: ctx.args[0] };
          if (typeof resource.get === 'function') {
            const [ok, err, full] = await tryFn(() => resource.get(ctx.args[0]));
            if (ok && full) data = full;
          }
          await this.clearCacheForResource(resource, data);
        } else if (method === 'setContent' || method === 'deleteContent') {
          const id = ctx.args[0]?.id || ctx.args[0];
          await this.clearCacheForResource(resource, { id });
        } else if (method === 'replace') {
          const id = ctx.args[0];
          await this.clearCacheForResource(resource, { id, ...ctx.args[1] });
        } else if (method === 'deleteMany') {
          // After all deletions, clear all aggregate and partition caches
          await this.clearCacheForResource(resource);
        }
        return result;
      });
    }
  }

  async clearCacheForResource(resource, data) {
    if (!resource.cache) return; // Skip if no cache is available

    const keyPrefix = `resource=${resource.name}`;

    // For specific operations, only clear relevant cache entries
    if (data && data.id) {
      // Clear specific item caches for this ID
      const itemSpecificMethods = ['get', 'exists', 'content', 'hasContent'];
      for (const method of itemSpecificMethods) {
        const specificKey = await this.generateCacheKey(resource, method, { id: data.id });
        const [ok, err] = await this.clearCacheWithRetry(resource.cache, specificKey);

        if (!ok) {
          this.emit('cache_clear_error', {
            resource: resource.name,
            method,
            id: data.id,
            error: err.message
          });

          if (this.config.verbose) {
            console.warn(`[CachePlugin] Failed to clear ${method} cache for ${resource.name}:${data.id}:`, err.message);
          }
        }
      }
      
      // Clear partition-specific caches if this resource has partitions
      if (this.config.includePartitions === true && resource.config?.partitions && Object.keys(resource.config.partitions).length > 0) {
        const partitionValues = this.getPartitionValues(data, resource);
        for (const [partitionName, values] of Object.entries(partitionValues)) {
          if (values && Object.keys(values).length > 0 && Object.values(values).some(v => v !== null && v !== undefined)) {
            const partitionKeyPrefix = join(keyPrefix, `partition=${partitionName}`);
            const [ok, err] = await this.clearCacheWithRetry(resource.cache, partitionKeyPrefix);

            if (!ok) {
              this.emit('cache_clear_error', {
                resource: resource.name,
                partition: partitionName,
                error: err.message
              });

              if (this.config.verbose) {
                console.warn(`[CachePlugin] Failed to clear partition cache for ${resource.name}/${partitionName}:`, err.message);
              }
            }
          }
        }
      }
    }

    // Clear aggregate caches more broadly to ensure all variants are cleared
    const [ok, err] = await this.clearCacheWithRetry(resource.cache, keyPrefix);

    if (!ok) {
      this.emit('cache_clear_error', {
        resource: resource.name,
        type: 'broad',
        error: err.message
      });

      if (this.config.verbose) {
        console.warn(`[CachePlugin] Failed to clear broad cache for ${resource.name}, trying specific methods:`, err.message);
      }

      // If broad clearing fails, try specific method clearing
      const aggregateMethods = ['count', 'list', 'listIds', 'getAll', 'page', 'query'];
      for (const method of aggregateMethods) {
        // Try multiple key patterns to ensure we catch all variations
        await this.clearCacheWithRetry(resource.cache, `${keyPrefix}/action=${method}`);
        await this.clearCacheWithRetry(resource.cache, `resource=${resource.name}/action=${method}`);
      }
    }
  }

  async clearCacheWithRetry(cache, key) {
    let lastError;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      const [ok, err] = await tryFn(() => cache.clear(key));

      if (ok) {
        return [true, null];
      }

      lastError = err;

      // Don't retry if it's a "not found" error
      if (err.name === 'NoSuchKey' || err.code === 'NoSuchKey') {
        return [true, null]; // Key doesn't exist, that's fine
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.config.retryAttempts - 1) {
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return [false, lastError];
  }

  async generateCacheKey(resource, action, params = {}, partition = null, partitionValues = null) {
    const keyParts = [
      `resource=${resource.name}`,
      `action=${action}`
    ];

    // Add partition information if available
    if (partition && partitionValues && Object.keys(partitionValues).length > 0) {
      keyParts.push(`partition:${partition}`);
      for (const [field, value] of Object.entries(partitionValues)) {
        if (value !== null && value !== undefined) {
          keyParts.push(`${field}:${value}`);
        }
      }
    }

    // Add params if they exist
    if (Object.keys(params).length > 0) {
      const paramsHash = this.hashParams(params);
      keyParts.push(paramsHash);
    }

    return join(...keyParts) + '.json.gz';
  }

  hashParams(params) {
    // Use json-stable-stringify for deterministic serialization
    // Handles nested objects, dates, and maintains consistent key order
    const serialized = jsonStableStringify(params) || 'empty';

    // Use MD5 for fast non-cryptographic hashing (10x faster than SHA-256)
    // Security not needed here - just need consistent, collision-resistant hash
    return crypto.createHash('md5').update(serialized).digest('hex').substring(0, 16);
  }

  // Utility methods
  async getCacheStats() {
    if (!this.driver) return null;
    
    return {
      size: await this.driver.size(),
      keys: await this.driver.keys(),
      driver: this.driver.constructor.name
    };
  }

  async clearAllCache() {
    if (!this.driver) return;
    
    for (const resource of Object.values(this.database.resources)) {
      if (resource.cache) {
        const keyPrefix = `resource=${resource.name}`;
        await resource.cache.clear(keyPrefix);
      }
    }
  }

  async warmCache(resourceName, options = {}) {
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new Error(`Resource '${resourceName}' not found`);
    }

    const { includePartitions = true, sampleSize = 100 } = options;

    // Use partition-aware warming if available
    if (this.driver instanceof PartitionAwareFilesystemCache && resource.warmPartitionCache) {
      const partitionNames = resource.config.partitions ? Object.keys(resource.config.partitions) : [];
      return await resource.warmPartitionCache(partitionNames, options);
    }

    // Use pagination instead of getAll() for efficiency
    let offset = 0;
    const pageSize = 100;
    const sampledRecords = [];

    // Get sample of records using pagination
    while (sampledRecords.length < sampleSize) {
      const [ok, err, pageResult] = await tryFn(() => resource.page({ offset, size: pageSize }));

      if (!ok || !pageResult) {
        break;
      }

      // page() might return { items, total } or just an array
      const pageItems = Array.isArray(pageResult) ? pageResult : (pageResult.items || []);

      if (pageItems.length === 0) {
        break;
      }

      sampledRecords.push(...pageItems);
      offset += pageSize;

      // Cache the page while we're at it
      // (page() call already cached it via middleware)
    }

    // Warm partition caches if enabled
    if (includePartitions && resource.config.partitions && sampledRecords.length > 0) {
      for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
        if (partitionDef.fields) {
          // Get unique partition values from sample
          const partitionValuesSet = new Set();

          for (const record of sampledRecords) {
            const values = this.getPartitionValues(record, resource);
            if (values[partitionName]) {
              partitionValuesSet.add(JSON.stringify(values[partitionName]));
            }
          }

          // Warm cache for each partition value
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
      partitionsWarmed: includePartitions && resource.config.partitions
        ? Object.keys(resource.config.partitions).length
        : 0
    };
  }

  async analyzeCacheUsage() {
    if (!(this.driver instanceof PartitionAwareFilesystemCache)) {
      return { message: 'Cache usage analysis is only available with PartitionAwareFilesystemCache' };
    }

    const analysis = {
      totalResources: Object.keys(this.database.resources).length,
      resourceStats: {},
      recommendations: {},
      summary: {
        mostUsedPartitions: [],
        leastUsedPartitions: [],
        suggestedOptimizations: []
      }
    };

    // Analyze each resource (respect include/exclude filters)
    for (const [resourceName, resource] of Object.entries(this.database.resources)) {
      // Skip resources that shouldn't be cached
      if (!this.shouldCacheResource(resourceName)) {
        continue;
      }

      try {
        analysis.resourceStats[resourceName] = await this.driver.getPartitionStats(resourceName);
        analysis.recommendations[resourceName] = await this.driver.getCacheRecommendations(resourceName);
      } catch (error) {
        analysis.resourceStats[resourceName] = { error: error.message };
      }
    }

    // Generate summary
    const allRecommendations = Object.values(analysis.recommendations).flat();
    analysis.summary.mostUsedPartitions = allRecommendations
      .filter(r => r.recommendation === 'preload')
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5);

    analysis.summary.leastUsedPartitions = allRecommendations
      .filter(r => r.recommendation === 'archive')
      .slice(0, 5);

    analysis.summary.suggestedOptimizations = [
      `Consider preloading ${analysis.summary.mostUsedPartitions.length} high-usage partitions`,
      `Archive ${analysis.summary.leastUsedPartitions.length} unused partitions`,
      `Monitor cache hit rates for partition efficiency`
    ];

    return analysis;
  }
}

export default CachePlugin;
