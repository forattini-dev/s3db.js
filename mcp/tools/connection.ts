import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbConnectArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js'; // Assuming S3db is Database
import type { CachePlugin, CostsPlugin } from '../../dist/s3db.es.js'; // Assuming S3db and plugins are typed
import type { FilesystemCache } from '../../src/plugins/cache/filesystem-cache.class.js'; // Assuming it's typed

export const connectionTools = [
  {
    name: 'dbConnect',
    description: 'Connect to an S3DB database with automatic costs tracking and configurable cache (memory or filesystem)',
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: {
          type: 'string',
          description: 'S3DB connection string (e.g., s3://key:secret@bucket/path)'
        },
        verbose: {
          type: 'boolean',
          description: 'Enable verbose logging',
          default: false
        },
        parallelism: {
          type: 'number',
          description: 'Number of parallel operations',
          default: 10
        },
        passphrase: {
          type: 'string',
          description: 'Passphrase for encryption',
          default: 'secret'
        },
        versioningEnabled: {
          type: 'boolean',
          description: 'Enable resource versioning',
          default: false
        },
        enableCache: {
          type: 'boolean',
          description: 'Enable cache for improved performance',
          default: true
        },
        enableCosts: {
          type: 'boolean',
          description: 'Enable costs tracking for S3 operations',
          default: true
        },
        cacheDriver: {
          type: 'string',
          description: 'Cache driver type: "memory" or "filesystem"',
          enum: ['memory', 'filesystem'],
          default: 'memory'
        },
        cacheMaxSize: {
          type: 'number',
          description: 'Maximum number of items in memory cache (memory driver only)',
          default: 1000
        },
        cacheTtl: {
          type: 'number',
          description: 'Cache time-to-live in milliseconds',
          default: 300000
        },
        cacheDirectory: {
          type: 'string',
          description: 'Directory path for filesystem cache (filesystem driver only)',
          default: './cache'
        },
        cachePrefix: {
          type: 'string',
          description: 'Prefix for cache files (filesystem driver only)',
          default: 'cache'
        }
      },
      required: ['connectionString']
    }
  },
  {
    name: 'dbDisconnect',
    description: 'Disconnect from the S3DB database',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'dbStatus',
    description: 'Get the current database connection status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export function createConnectionHandlers(server: S3dbMCPServer) {
  return {
    async dbConnect(args: DbConnectArgs, database: S3db | null, injected: { S3db: typeof S3db; CachePlugin: typeof CachePlugin; CostsPlugin: typeof CostsPlugin; FilesystemCache: typeof FilesystemCache }): Promise<any> {
      const {
        connectionString,
        verbose = false,
        parallelism = 10,
        passphrase = 'secret',
        versioningEnabled = false,
        enableCache = true,
        enableCosts = true,
        cacheDriver = 'memory',
        cacheMaxSize = 1000,
        cacheTtl = 300000,
        cacheDirectory = './cache',
        cachePrefix = 'cache'
      } = args;

      if (database && database.isConnected()) {
        return { success: false, message: 'Database is already connected' };
      }

      const plugins = [];

      // Costs plugin
      const costsEnabled = enableCosts !== false && process.env.S3DB_COSTS_ENABLED !== 'false';
      if (costsEnabled) {
        plugins.push(injected.CostsPlugin);
      }

      // Cache plugin
      const cacheEnabled = enableCache !== false && process.env.S3DB_CACHE_ENABLED !== 'false';

      if (cacheEnabled) {
        const cacheMaxSizeEnv = process.env.S3DB_CACHE_MAX_SIZE ? parseInt(process.env.S3DB_CACHE_MAX_SIZE) : cacheMaxSize;
        const cacheTtlEnv = process.env.S3DB_CACHE_TTL ? parseInt(process.env.S3DB_CACHE_TTL) : cacheTtl;
        const cacheDriverEnv = process.env.S3DB_CACHE_DRIVER || cacheDriver;
        const cacheDirectoryEnv = process.env.S3DB_CACHE_DIRECTORY || cacheDirectory;
        const cachePrefixEnv = process.env.S3DB_CACHE_PREFIX || cachePrefix;

        let cacheConfig: any = {
          includePartitions: true
        };

        if (cacheDriverEnv === 'filesystem') {
          cacheConfig.driver = new injected.FilesystemCache({
            directory: cacheDirectoryEnv,
            prefix: cachePrefixEnv,
            ttl: cacheTtlEnv,
            enableCompression: true,
            enableStats: verbose,
            enableCleanup: true,
            cleanupInterval: 300000,
            createDirectory: true
          });
        } else {
          cacheConfig.driver = 'memory';
          cacheConfig.memoryOptions = {
            maxSize: cacheMaxSizeEnv,
            ttl: cacheTtlEnv,
            enableStats: verbose
          };
        }

        plugins.push(new injected.CachePlugin(cacheConfig));
      }

      const newDatabase = new injected.S3db({
        connectionString,
        verbose,
        parallelism,
        passphrase,
        versioningEnabled,
        plugins
      });

      await newDatabase.connect();

      return {
        success: true,
        message: 'Connected to S3DB database',
        database: newDatabase,
        status: {
          connected: newDatabase.isConnected(),
          bucket: newDatabase.bucket,
          keyPrefix: newDatabase.keyPrefix,
          version: newDatabase.s3dbVersion,
          resourceCount: Object.keys(newDatabase.resources || {}).length,
          plugins: {
            costs: costsEnabled,
            cache: cacheEnabled,
            cacheDriver: cacheEnabled ? cacheDriverEnv : null,
            cacheDirectory: cacheEnabled && cacheDriverEnv === 'filesystem' ? cacheDirectoryEnv : null,
            cacheMaxSize: cacheEnabled && cacheDriverEnv === 'memory' ? cacheMaxSizeEnv : null,
            cacheTtl: cacheEnabled ? cacheTtlEnv : null
          }
        }
      };
    },

    async dbDisconnect(args: any, database: S3db): Promise<any> {
      if (!database || !database.isConnected()) {
        return { success: false, message: 'No database connection to disconnect' };
      }

      await database.disconnect();

      return {
        success: true,
        message: 'Disconnected from S3DB database',
        clearDatabase: true
      };
    },

    async dbStatus(args: any, database: S3db): Promise<any> {
      if (!database) {
        return {
          connected: false,
          message: 'No database instance created'
        };
      }

      return {
        connected: database.isConnected(),
        bucket: database.bucket,
        keyPrefix: database.keyPrefix,
        version: database.s3dbVersion,
        resourceCount: Object.keys(database.resources || {}).length,
        resources: Object.keys(database.resources || {})
      };
    }
  };
}
