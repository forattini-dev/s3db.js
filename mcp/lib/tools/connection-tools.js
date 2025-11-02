/**
 * Connection tool definitions
 */
export const connectionTools = [
  {
    name: 'dbConnect',
    method: 'connect',
    description: 'Connect to S3DB database with advanced configuration',
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: {
          type: 'string',
          description: 'S3DB connection string (s3://key:secret@bucket/path)',
          pattern: '^(s3|https?)://'
        },
        verbose: {
          type: 'boolean',
          description: 'Enable verbose logging',
          default: false
        },
        parallelism: {
          type: 'number',
          description: 'Number of parallel operations',
          default: 10,
          minimum: 1,
          maximum: 100
        },
        passphrase: {
          type: 'string',
          description: 'Encryption passphrase',
          default: 'secret'
        },
        versioningEnabled: {
          type: 'boolean',
          description: 'Enable resource versioning',
          default: false
        },
        persistHooks: {
          type: 'boolean',
          description: 'Persist hooks in S3',
          default: false
        },
        enableCache: {
          type: 'boolean',
          description: 'Enable caching',
          default: true
        },
        enableCosts: {
          type: 'boolean',
          description: 'Track AWS costs',
          default: true
        },
        enableMetrics: {
          type: 'boolean',
          description: 'Enable metrics collection',
          default: false
        },
        cacheDriver: {
          type: 'string',
          enum: ['memory', 'filesystem', 's3'],
          description: 'Cache storage driver',
          default: 'memory'
        },
        cacheMaxSize: {
          type: 'number',
          description: 'Max cache entries (memory driver)',
          default: 1000,
          minimum: 1
        },
        cacheTtl: {
          type: 'number',
          description: 'Cache TTL in milliseconds',
          default: 300000,
          minimum: 0
        },
        cacheDirectory: {
          type: 'string',
          description: 'Directory for filesystem cache',
          default: './cache'
        },
        cachePrefix: {
          type: 'string',
          description: 'Cache file prefix',
          default: 'cache'
        },
        cacheCompress: {
          type: 'boolean',
          description: 'Compress cached data',
          default: true
        }
      },
      required: ['connectionString']
    },
    examples: [
      {
        description: 'Connect to AWS S3',
        args: {
          connectionString: 's3://AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI@my-bucket/databases/prod'
        }
      },
      {
        description: 'Connect to MinIO with filesystem cache',
        args: {
          connectionString: 'http://minioadmin:minioadmin@localhost:9000/test-bucket',
          cacheDriver: 'filesystem',
          cacheDirectory: './s3db-cache'
        }
      }
    ]
  },
  
  {
    name: 'dbDisconnect',
    method: 'disconnect',
    description: 'Disconnect from S3DB database',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  
  {
    name: 'dbStatus',
    method: 'status',
    description: 'Get database connection status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  
  {
    name: 'dbGetStats',
    method: 'getStats',
    description: 'Get detailed database statistics',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  
  {
    name: 'dbClearCache',
    method: 'clearCache',
    description: 'Clear cache for all or specific resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource to clear cache for (optional)'
        }
      },
      required: []
    }
  }
];