import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbClearCacheArgs, ResourceGetStatsArgs, CacheGetStatsArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
import type { CachePlugin } from '../../dist/s3db.es.js'; // Assuming it's typed

export const statsTools = [
  {
    name: 'dbGetStats',
    description: 'Get database statistics including costs and cache performance',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'dbClearCache',
    description: 'Clear all cached data or cache for specific resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of specific resource to clear cache (optional - if not provided, clears all cache)'
        }
      },
      required: []
    }
  },
  {
    name: 'resourceGetStats',
    description: 'Get detailed statistics for a specific resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        includePartitionStats: {
          type: 'boolean',
          description: 'Include partition statistics',
          default: true
        }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'cacheGetStats',
    description: 'Get detailed cache statistics including hit/miss ratios and memory usage',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Get stats for specific resource (optional - gets all if not provided)'
        }
      },
      required: []
    }
  }
];

export function createStatsHandlers(server: S3dbMCPServer) {
  return {
    async dbGetStats(args: {}, database: S3db): Promise<any> {
      server.ensureConnected(database);

      const stats: any = {
        database: {
          connected: database.isConnected(),
          bucket: database.bucket,
          keyPrefix: database.keyPrefix,
          version: database.s3dbVersion,
          resourceCount: Object.keys(database.resources || {}).length,
          resources: Object.keys(database.resources || {})
        },
        costs: null,
        cache: null
      };

      // Get costs from client if available
      if ((database.client as any) && (database.client as any).costs) {
        stats.costs = {
          total: (database.client as any).costs.total,
          totalRequests: (database.client as any).costs.requests.total,
          requestsByType: { ...(database.client as any).costs.requests },
          eventsByType: { ...(database.client as any).costs.events },
          estimatedCostUSD: (database.client as any).costs.total
        };
      }

      // Get cache stats from plugins if available
      try {
        const cachePlugin = (database.pluginList as any)?.find((p: any) => p.constructor.name === 'CachePlugin');
        if (cachePlugin && cachePlugin.driver) {
          const cacheSize = await cachePlugin.driver.size();
          const cacheKeys = await cachePlugin.driver.keys();

          stats.cache = {
            enabled: true,
            driver: cachePlugin.driver.constructor.name,
            size: cacheSize,
            maxSize: cachePlugin.driver.maxSize || 'unlimited',
            ttl: cachePlugin.driver.ttl || 'no expiration',
            keyCount: cacheKeys.length,
            sampleKeys: cacheKeys.slice(0, 5) // First 5 keys as sample
          };
        } else {
          stats.cache = { enabled: false };
        }
      } catch (error: any) {
        stats.cache = { enabled: false, error: error.message };
      }

      return {
        success: true,
        stats
      };
    },

    async dbClearCache(args: DbClearCacheArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName } = args;

      try {
        const cachePlugin: CachePlugin = (database.pluginList as any)?.find((p: any) => p.constructor.name === 'CachePlugin');
        if (!cachePlugin || !cachePlugin.driver) {
          return {
            success: false,
            message: 'Cache is not enabled or available'
          };
        }

        if (resourceName) {
          // Clear cache for specific resource
          const resource = server.getResource(database, resourceName);
          await (cachePlugin.clearCacheForResource as any)(resource);

          return {
            success: true,
            message: `Cache cleared for resource: ${resourceName}`
          };
        } else {
          // Clear all cache
          await cachePlugin.driver.clear();

          return {
            success: true,
            message: 'All cache cleared'
          };
        }
      } catch (error: any) {
        return {
          success: false,
          message: `Failed to clear cache: ${error.message}`
        };
      }
    },

    async resourceGetStats(args: ResourceGetStatsArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, includePartitionStats = true } = args;
      const resource = server.getResource(database, resourceName);

      try {
        const stats: any = {
          success: true,
          resource: resourceName,
          totalDocuments: await resource.count(),
          schema: {
            attributeCount: Object.keys(resource.attributes || {}).length,
            attributes: Object.keys(resource.attributes || {})
          },
          configuration: {
            behavior: resource.behavior,
            timestamps: resource.config.timestamps,
            paranoid: resource.config.paranoid,
            asyncPartitions: resource.config.asyncPartitions
          }
        };

        // Partition stats
        if (includePartitionStats && resource.config.partitions) {
          stats.partitions = {
            count: Object.keys(resource.config.partitions).length,
            details: {}
          };

          for (const [partitionName, partitionConfig] of Object.entries(resource.config.partitions)) {
            try {
              const partitionCount = await resource.count({ partition: partitionName });
              stats.partitions.details[partitionName] = {
                fields: Object.keys((partitionConfig as any).fields || {}),
                documentCount: partitionCount
              };
            } catch (error: any) {
              stats.partitions.details[partitionName] = {
                fields: Object.keys((partitionConfig as any).fields || {}),
                error: error.message
              };
            }
          }
        }

        return stats;
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          resource: resourceName
        };
      }
    },

    async cacheGetStats(args: CacheGetStatsArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName } = args;

      try {
        const cachePlugin: CachePlugin = (database.pluginList as any)?.find((p: any) => p.constructor.name === 'CachePlugin');

        if (!cachePlugin || !cachePlugin.driver) {
          return {
            success: false,
            message: 'Cache is not enabled or available'
          };
        }

        const allKeys = await cachePlugin.driver.keys();
        const cacheSize = await cachePlugin.driver.size();

        const stats = {
          success: true,
          enabled: true,
          driver: cachePlugin.driver.constructor.name,
          totalKeys: allKeys.length,
          totalSize: cacheSize,
          config: {
            maxSize: cachePlugin.driver.maxSize || 'unlimited',
            ttl: cachePlugin.driver.ttl || 'no expiration'
          }
        };

        // Resource-specific stats if requested
        if (resourceName) {
          const resourceKeys = allKeys.filter((key: string) => key.includes(`resource=${resourceName}`));
          stats.resource = {
            name: resourceName,
            keys: resourceKeys.length,
            sampleKeys: resourceKeys.slice(0, 5)
          };
        } else {
          // Group by resource
          const byResource: Record<string, number> = {};
          for (const key of allKeys) {
            const match = key.match(/resource=([^/]+)/);
            if (match) {
              const res = match[1];
              byResource[res] = (byResource[res] || 0) + 1;
            }
          }
          stats.byResource = byResource;
        }

        // Memory stats for memory cache
        if (cachePlugin.driver.constructor.name === 'MemoryCache' && (cachePlugin.driver as any).getMemoryStats) {
          stats.memory = (cachePlugin.driver as any).getMemoryStats();
        }

        return stats;
      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  };
}
