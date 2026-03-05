import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbConnectArgs } from '../types/index.js';
import type { S3db, CachePlugin, CostsPlugin } from '../../src/index.js';
import type { FilesystemCache } from '../../src/plugins/cache/filesystem-cache.class.js';
import { resolveConfig } from '../config.js';

export const connectionTools = [
  {
    name: 'dbConnect',
    description: 'Connect to S3DB database manually. Usually NOT needed — the server auto-connects via S3DB_CONNECTION_STRING env var. Use only to connect to a different database or if auto-connect is not configured. Formats: s3://key:secret@bucket (AWS S3), http://key:secret@host:9000/bucket (MinIO), memory://bucket (testing), file:///path (testing).',
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
        security: {
          type: 'object',
          description: 'Security config. Also configurable via env vars: S3DB_PASSPHRASE, S3DB_PEPPER, S3DB_BCRYPT_ROUNDS, S3DB_ARGON2=true, S3DB_ARGON2_MEMORY_COST, S3DB_ARGON2_TIME_COST, S3DB_ARGON2_PARALLELISM.',
          properties: {
            passphrase: {
              type: 'string',
              description: 'Passphrase for secret field encryption (AES-256-GCM)'
            },
            pepper: {
              type: 'string',
              description: 'Pepper appended to passwords before hashing'
            },
            bcrypt: {
              type: 'object',
              description: 'Bcrypt configuration',
              properties: {
                rounds: {
                  type: 'number',
                  description: 'Number of bcrypt rounds (min 12, max 31)',
                  default: 12
                }
              }
            },
            argon2: {
              type: 'object',
              description: 'Argon2id configuration (memory-hard, GPU-resistant)',
              properties: {
                memoryCost: {
                  type: 'number',
                  description: 'Memory cost in KiB (must be power of 2, default 65536 = 64MB)'
                },
                timeCost: {
                  type: 'number',
                  description: 'Number of iterations (default 3)'
                },
                parallelism: {
                  type: 'number',
                  description: 'Degree of parallelism (default 4)'
                }
              }
            }
          }
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
      if (database && database.isConnected()) {
        return { success: false, message: 'Database is already connected' };
      }

      // Resolve config: defaults < config file < env vars < tool args
      const toolOverrides: Record<string, unknown> = {};
      if (args.connectionString) toolOverrides.connectionString = args.connectionString;
      if (args.verbose !== undefined) toolOverrides.verbose = args.verbose;
      if (args.parallelism !== undefined) toolOverrides.parallelism = args.parallelism;
      if (args.versioningEnabled !== undefined) toolOverrides.versioningEnabled = args.versioningEnabled;
      if (args.security) toolOverrides.security = args.security;
      if (args.enableCache !== undefined) toolOverrides.cache = { ...(toolOverrides.cache as object || {}), enabled: args.enableCache };
      if (args.enableCosts !== undefined) toolOverrides.costs = { enabled: args.enableCosts };
      if (args.cacheDriver) (toolOverrides.cache as Record<string, unknown>) = { ...(toolOverrides.cache as object || {}), driver: args.cacheDriver };
      if (args.cacheMaxSize) (toolOverrides.cache as Record<string, unknown>) = { ...(toolOverrides.cache as object || {}), maxSize: args.cacheMaxSize };
      if (args.cacheTtl) (toolOverrides.cache as Record<string, unknown>) = { ...(toolOverrides.cache as object || {}), ttl: args.cacheTtl };
      if (args.cacheDirectory) (toolOverrides.cache as Record<string, unknown>) = { ...(toolOverrides.cache as object || {}), directory: args.cacheDirectory };
      if (args.cachePrefix) (toolOverrides.cache as Record<string, unknown>) = { ...(toolOverrides.cache as object || {}), prefix: args.cachePrefix };

      const config = resolveConfig(toolOverrides);

      if (!config.connectionString) {
        return { success: false, message: 'connectionString is required' };
      }

      const plugins = [];
      const cacheConf = config.cache || {};
      const costsConf = config.costs || {};

      if (costsConf.enabled !== false) {
        plugins.push(injected.CostsPlugin);
      }

      if (cacheConf.enabled !== false) {
        if (cacheConf.driver === 'filesystem') {
          plugins.push(new injected.CachePlugin({
            includePartitions: true,
            driver: new injected.FilesystemCache({
              directory: cacheConf.directory || './cache',
              prefix: cacheConf.prefix || 's3db',
              ttl: cacheConf.ttl || 300000,
              enableCompression: true,
              enableStats: config.verbose,
              enableCleanup: true,
              cleanupInterval: 300000,
              createDirectory: true,
            }),
          }));
        } else {
          plugins.push(new injected.CachePlugin({
            driver: 'memory',
            includePartitions: true,
            memoryOptions: {
              maxSize: cacheConf.maxSize || 1000,
              ttl: cacheConf.ttl || 300000,
              enableStats: config.verbose,
            },
          }));
        }
      }

      const newDatabase = new injected.S3db({
        connectionString: config.connectionString,
        verbose: config.verbose,
        parallelism: config.parallelism,
        security: config.security,
        versioningEnabled: config.versioningEnabled,
        plugins,
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
            costs: costsConf.enabled !== false,
            cache: cacheConf.enabled !== false,
            cacheDriver: cacheConf.enabled !== false ? (cacheConf.driver || 'memory') : null,
          },
        },
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
