import { join } from "path";

import { sha256 } from "../crypto.js";
import Plugin from "./plugin.class.js";
import S3Cache from "./cache/s3-cache.class.js";
import MemoryCache from "./cache/memory-cache.class.js";
import tryFn from "../concerns/try-fn.js";

export class CachePlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.driver = options.driver;
    this.config = {
      enabled: options.enabled !== false,
      includePartitions: options.includePartitions !== false,
      ...options
    };
  }

  async setup(database) {
    if (!this.config.enabled) {
      return; // Don't setup when disabled
    }
    
    // Call parent setup only when enabled
    await super.setup(database);
  }

  async onSetup() {
    // Initialize cache driver
    if (this.config.driver) {
      // Use custom driver if provided
      this.driver = this.config.driver;
    } else if (this.config.driverType === 'memory') {
      this.driver = new MemoryCache(this.config.memoryOptions || {});
    } else {
      // Default to S3Cache, sempre passa o client do database
      this.driver = new S3Cache({ client: this.database.client, ...(this.config.s3Options || {}) });
    }

    // Install database proxy for new resources
    this.installDatabaseProxy();
    
    // Install hooks for existing resources
    this.installResourceHooks();
  }

  async onStart() {
    // Plugin is ready
  }

  async onStop() {
    // Cleanup if needed
  }

  installDatabaseProxy() {
    if (this.database._cacheProxyInstalled) {
      return; // Already installed
    }
    
    const installResourceHooks = this.installResourceHooks.bind(this);
    
    // Store original method
    this.database._originalCreateResourceForCache = this.database.createResource;
    
    // Create new method that doesn't call itself
    this.database.createResource = async function (...args) {
      const resource = await this._originalCreateResourceForCache(...args);
      installResourceHooks(resource);
      return resource;
    };
    
    // Mark as installed
    this.database._cacheProxyInstalled = true;
  }

  installResourceHooks() {
    for (const resource of Object.values(this.database.resources)) {
      this.installResourceHooksForResource(resource);
    }
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

    // List of methods to cache
    const cacheMethods = [
      'count', 'listIds', 'getMany', 'getAll', 'page', 'list', 'get'
    ];
    for (const method of cacheMethods) {
      resource.useMiddleware(method, async (ctx, next) => {
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
        } else if (method === 'getAll') {
          key = await resource.cacheKeyFor({ action: method });
        } else if (method === 'get') {
          key = await resource.cacheKeyFor({ action: method, params: { id: ctx.args[0] } });
        }
        // Try cache
        const [ok, err, cached] = await tryFn(() => resource.cache.get(key));
        if (ok && cached !== null && cached !== undefined) return cached;
        if (!ok && err.name !== 'NoSuchKey') throw err;
        // Not cached, call next
        const result = await next();
        await resource.cache.set(key, result);
        return result;
      });
    }

    // List of methods to clear cache on write
    const writeMethods = ['insert', 'update', 'delete', 'deleteMany'];
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
    
    // Always clear main cache for this resource
    await resource.cache.clear(keyPrefix);
    
    // Only clear partition cache if partitions are enabled AND resource has partitions AND includePartitions is true
    if (this.config.includePartitions === true && resource.config?.partitions && Object.keys(resource.config.partitions).length > 0) {
      if (!data) {
        // If no data, clear all partition caches
        for (const partitionName of Object.keys(resource.config.partitions)) {
          const partitionKeyPrefix = join(keyPrefix, `partition=${partitionName}`);
          await resource.cache.clear(partitionKeyPrefix);
        }
      } else {
        const partitionValues = this.getPartitionValues(data, resource);
        for (const [partitionName, values] of Object.entries(partitionValues)) {
          // Only clear partition cache if there are actual values
          if (values && Object.keys(values).length > 0 && Object.values(values).some(v => v !== null && v !== undefined)) {
            const partitionKeyPrefix = join(keyPrefix, `partition=${partitionName}`);
            await resource.cache.clear(partitionKeyPrefix);
          }
        }
      }
    }
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
      const paramsHash = await this.hashParams(params);
      keyParts.push(paramsHash);
    }

    return join(...keyParts) + '.json.gz';
  }

  async hashParams(params) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|') || 'empty';
    
    return await sha256(sortedParams);
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

    const { includePartitions = true } = options;

    // Warm main cache using the wrapped method (which will call the original)
    await resource.getAll();

    // Warm partition caches if enabled
    if (includePartitions && resource.config.partitions) {
      for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
        if (partitionDef.fields) {
          // Get some sample partition values and warm those caches
          const allRecords = await resource.getAll();
          
          // Ensure allRecords is an array
          const recordsArray = Array.isArray(allRecords) ? allRecords : [];
          const partitionValues = new Set();
          
          for (const record of recordsArray.slice(0, 10)) { // Sample first 10 records
            const values = this.getPartitionValues(record, resource);
            if (values[partitionName]) {
              partitionValues.add(JSON.stringify(values[partitionName]));
            }
          }
          
          // Warm cache for each partition value
          for (const partitionValueStr of partitionValues) {
            const partitionValues = JSON.parse(partitionValueStr);
            await resource.list({ partition: partitionName, partitionValues });
          }
        }
      }
    }
  }
}

export default CachePlugin;
