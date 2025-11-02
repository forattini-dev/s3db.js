import { BaseHandler } from '../base-handler.js';
import { S3db, CachePlugin, CostsPlugin, MetricsPlugin, FilesystemCache, MemoryCache } from 's3db.js';

/**
 * Handler for database connection operations
 */
export class ConnectionHandler extends BaseHandler {
  constructor(database) {
    super(database);
  }

  /**
   * Connect to S3DB database
   */
  async connect(args) {
    const {
      connectionString,
      verbose = false,
      parallelism = 10,
      passphrase = 'secret',
      versioningEnabled = false,
      persistHooks = false,
      enableCache = true,
      enableCosts = true,
      enableMetrics = false,
      cacheDriver = 'memory',
      cacheMaxSize = 1000,
      cacheTtl = 300000,
      cacheDirectory = './cache',
      cachePrefix = 'cache',
      cacheCompress = true
    } = args;

    this.validateParams(args, ['connectionString']);

    if (this.database && this.database.isConnected()) {
      return this.formatResponse(null, {
        message: 'Database is already connected',
        status: await this.getStatus()
      });
    }

    // Build plugins array
    const plugins = this.buildPlugins({
      enableCache,
      enableCosts,
      enableMetrics,
      cacheDriver,
      cacheMaxSize,
      cacheTtl,
      cacheDirectory,
      cachePrefix,
      cacheCompress,
      verbose
    });

    // Create and connect database
    this.database = new S3db({
      connectionString,
      verbose,
      parallelism,
      passphrase,
      versioningEnabled,
      persistHooks,
      plugins
    });

    await this.database.connect();

    return this.formatResponse({
      connected: true,
      bucket: this.database.bucket,
      keyPrefix: this.database.keyPrefix,
      version: this.database.s3dbVersion
    }, {
      message: 'Connected to S3DB database',
      plugins: this.getPluginInfo(plugins)
    });
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    if (!this.database || !this.database.isConnected()) {
      return this.formatResponse(null, {
        message: 'No database connection to disconnect'
      });
    }

    await this.database.disconnect();
    const info = {
      bucket: this.database.bucket,
      keyPrefix: this.database.keyPrefix
    };
    
    this.database = null;

    return this.formatResponse(info, {
      message: 'Disconnected from S3DB database'
    });
  }

  /**
   * Get database status
   */
  async status() {
    if (!this.database) {
      return this.formatResponse({
        connected: false,
        message: 'No database instance created'
      });
    }

    const status = await this.getStatus();
    return this.formatResponse(status);
  }

  /**
   * Get detailed database statistics
   */
  async getStats() {
    this.ensureConnected();

    const stats = {
      database: await this.getStatus(),
      costs: this.getCostStats(),
      cache: await this.getCacheStats(),
      metrics: this.getMetricsStats()
    };

    return this.formatResponse(stats);
  }

  /**
   * Clear cache
   */
  async clearCache(args) {
    this.ensureConnected();
    const { resourceName } = args;

    const cachePlugin = this.getCachePlugin();
    if (!cachePlugin) {
      return this.formatResponse(null, {
        message: 'Cache is not enabled'
      });
    }

    if (resourceName) {
      const resource = this.getResource(resourceName);
      await cachePlugin.clearCacheForResource(resource);
      
      return this.formatResponse(null, {
        message: `Cache cleared for resource: ${resourceName}`
      });
    }

    await cachePlugin.driver.clear();
    return this.formatResponse(null, {
      message: 'All cache cleared'
    });
  }

  // Private helper methods

  private buildPlugins(config) {
    const plugins = [];

    // Costs plugin
    if (config.enableCosts && process.env.S3DB_COSTS_ENABLED !== 'false') {
      plugins.push(CostsPlugin);
    }

    // Cache plugin
    if (config.enableCache && process.env.S3DB_CACHE_ENABLED !== 'false') {
      plugins.push(this.buildCachePlugin(config));
    }

    // Metrics plugin
    if (config.enableMetrics) {
      plugins.push(MetricsPlugin);
    }

    return plugins;
  }

  private buildCachePlugin(config) {
    const cacheConfig = {
      includePartitions: true
    };

    const driver = process.env.S3DB_CACHE_DRIVER || config.cacheDriver;
    
    if (driver === 'filesystem') {
      cacheConfig.driver = new FilesystemCache({
        directory: process.env.S3DB_CACHE_DIRECTORY || config.cacheDirectory,
        prefix: process.env.S3DB_CACHE_PREFIX || config.cachePrefix,
        ttl: parseInt(process.env.S3DB_CACHE_TTL) || config.cacheTtl,
        enableCompression: config.cacheCompress,
        enableStats: config.verbose,
        enableCleanup: true,
        cleanupInterval: 300000,
        createDirectory: true
      });
    } else {
      cacheConfig.driver = 'memory';
      cacheConfig.memoryOptions = {
        maxSize: parseInt(process.env.S3DB_CACHE_MAX_SIZE) || config.cacheMaxSize,
        ttl: parseInt(process.env.S3DB_CACHE_TTL) || config.cacheTtl,
        enableStats: config.verbose
      };
    }

    return new CachePlugin(cacheConfig);
  }

  private async getStatus() {
    return {
      connected: this.database.isConnected(),
      bucket: this.database.bucket,
      keyPrefix: this.database.keyPrefix,
      version: this.database.s3dbVersion,
      resourceCount: Object.keys(this.database.resources || {}).length,
      resources: Object.keys(this.database.resources || {})
    };
  }

  private getCostStats() {
    if (!this.database.client?.costs) return null;

    const costs = this.database.client.costs;
    return {
      total: costs.total,
      totalRequests: costs.requests.total,
      requestsByType: { ...costs.requests },
      eventsByType: { ...costs.events },
      estimatedCostUSD: costs.total
    };
  }

  private async getCacheStats() {
    const plugin = this.getCachePlugin();
    if (!plugin?.driver) return { enabled: false };

    try {
      const size = await plugin.driver.size();
      const keys = await plugin.driver.keys();
      
      return {
        enabled: true,
        driver: plugin.driver.constructor.name,
        size,
        maxSize: plugin.driver.maxSize || 'unlimited',
        ttl: plugin.driver.ttl || 'no expiration',
        keyCount: keys.length,
        sampleKeys: keys.slice(0, 5)
      };
    } catch (error) {
      return { enabled: false, error: error.message };
    }
  }

  private getMetricsStats() {
    const plugin = this.database.pluginList?.find(p => p.constructor.name === 'MetricsPlugin');
    if (!plugin) return null;

    return plugin.getMetrics();
  }

  private getCachePlugin() {
    return this.database.pluginList?.find(p => p.constructor.name === 'CachePlugin');
  }

  private getPluginInfo(plugins) {
    return plugins.map(p => ({
      name: typeof p === 'function' ? p.name : p.constructor.name,
      enabled: true
    }));
  }
}