#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { S3db, CachePlugin, CostsPlugin } from '../dist/s3db.es.js';
import { FilesystemCache } from '../src/plugins/cache/filesystem-cache.class.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global database instance
let database = null;

// Server configuration
const SERVER_NAME = 's3db-mcp';
const SERVER_VERSION = '1.0.0';

class S3dbMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupTransport();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
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
          },
          {
            name: 'dbCreateResource',
            description: 'Create a new resource (collection/table) in the database',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Resource name'
                },
                attributes: {
                  type: 'object',
                  description: 'Schema attributes definition (e.g., {"name": "string|required", "age": "number"})'
                },
                behavior: {
                  type: 'string',
                  description: 'Resource behavior',
                  enum: ['user-managed', 'body-only', 'body-overflow', 'enforce-limits', 'truncate-data'],
                  default: 'user-managed'
                },
                timestamps: {
                  type: 'boolean',
                  description: 'Enable automatic timestamps',
                  default: false
                },
                partitions: {
                  type: 'object',
                  description: 'Partition configuration'
                },
                paranoid: {
                  type: 'boolean',
                  description: 'Enable paranoid mode (soft deletes)',
                  default: true
                }
              },
              required: ['name', 'attributes']
            }
          },
          {
            name: 'dbListResources',
            description: 'List all resources in the database',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'resourceInsert',
            description: 'Insert a new document into a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                data: {
                  type: 'object',
                  description: 'Data to insert'
                }
              },
              required: ['resourceName', 'data']
            }
          },
          {
            name: 'resourceInsertMany',
            description: 'Insert multiple documents into a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                data: {
                  type: 'array',
                  description: 'Array of documents to insert'
                }
              },
              required: ['resourceName', 'data']
            }
          },
          {
            name: 'resourceGet',
            description: 'Get a document by ID from a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                id: {
                  type: 'string',
                  description: 'Document ID'
                },
                partition: {
                  type: 'string',
                  description: 'Partition name for optimized retrieval'
                },
                partitionValues: {
                  type: 'object',
                  description: 'Partition values for targeted access'
                }
              },
              required: ['resourceName', 'id']
            }
          },
          {
            name: 'resourceGetMany',
            description: 'Get multiple documents by IDs from a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of document IDs'
                }
              },
              required: ['resourceName', 'ids']
            }
          },
          {
            name: 'resourceUpdate',
            description: 'Update a document in a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                id: {
                  type: 'string',
                  description: 'Document ID'
                },
                data: {
                  type: 'object',
                  description: 'Data to update'
                }
              },
              required: ['resourceName', 'id', 'data']
            }
          },
          {
            name: 'resourceUpsert',
            description: 'Insert or update a document in a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                data: {
                  type: 'object',
                  description: 'Data to upsert (must include id if updating)'
                }
              },
              required: ['resourceName', 'data']
            }
          },
          {
            name: 'resourceDelete',
            description: 'Delete a document from a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                id: {
                  type: 'string',
                  description: 'Document ID'
                }
              },
              required: ['resourceName', 'id']
            }
          },
          {
            name: 'resourceDeleteMany',
            description: 'Delete multiple documents from a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of document IDs to delete'
                }
              },
              required: ['resourceName', 'ids']
            }
          },
          {
            name: 'resourceExists',
            description: 'Check if a document exists in a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                id: {
                  type: 'string',
                  description: 'Document ID'
                },
                partition: {
                  type: 'string',
                  description: 'Partition name for optimized check'
                },
                partitionValues: {
                  type: 'object',
                  description: 'Partition values for targeted check'
                }
              },
              required: ['resourceName', 'id']
            }
          },
          {
            name: 'resourceList',
            description: 'List documents in a resource with pagination and filtering',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of documents to return',
                  default: 100
                },
                offset: {
                  type: 'number',
                  description: 'Number of documents to skip',
                  default: 0
                },
                partition: {
                  type: 'string',
                  description: 'Partition name to filter by'
                },
                partitionValues: {
                  type: 'object',
                  description: 'Partition values for filtering'
                }
              },
              required: ['resourceName']
            }
          },
          {
            name: 'resourceListIds',
            description: 'List document IDs in a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of IDs to return',
                  default: 1000
                },
                offset: {
                  type: 'number',
                  description: 'Number of IDs to skip',
                  default: 0
                }
              },
              required: ['resourceName']
            }
          },
          {
            name: 'resourceCount',
            description: 'Count documents in a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                partition: {
                  type: 'string',
                  description: 'Partition name to filter by'
                },
                partitionValues: {
                  type: 'object',
                  description: 'Partition values for filtering'
                }
              },
              required: ['resourceName']
            }
          },
          {
            name: 'resourceGetAll',
            description: 'Get all documents from a resource (use with caution on large datasets)',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                }
              },
              required: ['resourceName']
            }
          },
          {
            name: 'resourceDeleteAll',
            description: 'Delete all documents from a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                confirm: {
                  type: 'boolean',
                  description: 'Confirmation flag - must be true to proceed'
                }
              },
              required: ['resourceName', 'confirm']
            }
          },
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
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case 'dbConnect':
            result = await this.handleDbConnect(args);
            break;

          case 'dbDisconnect':
            result = await this.handleDbDisconnect(args);
            break;

          case 'dbStatus':
            result = await this.handleDbStatus(args);
            break;

          case 'dbCreateResource':
            result = await this.handleDbCreateResource(args);
            break;

          case 'dbListResources':
            result = await this.handleDbListResources(args);
            break;

          case 'resourceInsert':
            result = await this.handleResourceInsert(args);
            break;

          case 'resourceInsertMany':
            result = await this.handleResourceInsertMany(args);
            break;

          case 'resourceGet':
            result = await this.handleResourceGet(args);
            break;

          case 'resourceGetMany':
            result = await this.handleResourceGetMany(args);
            break;

          case 'resourceUpdate':
            result = await this.handleResourceUpdate(args);
            break;

          case 'resourceUpsert':
            result = await this.handleResourceUpsert(args);
            break;

          case 'resourceDelete':
            result = await this.handleResourceDelete(args);
            break;

          case 'resourceDeleteMany':
            result = await this.handleResourceDeleteMany(args);
            break;

          case 'resourceExists':
            result = await this.handleResourceExists(args);
            break;

          case 'resourceList':
            result = await this.handleResourceList(args);
            break;

          case 'resourceListIds':
            result = await this.handleResourceListIds(args);
            break;

          case 'resourceCount':
            result = await this.handleResourceCount(args);
            break;

          case 'resourceGetAll':
            result = await this.handleResourceGetAll(args);
            break;

          case 'resourceDeleteAll':
            result = await this.handleResourceDeleteAll(args);
            break;

          case 'dbGetStats':
            result = await this.handleDbGetStats(args);
            break;

          case 'dbClearCache':
            result = await this.handleDbClearCache(args);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error.message,
                type: error.constructor.name,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  setupTransport() {
    const transport = process.argv.includes('--transport=sse') || process.env.MCP_TRANSPORT === 'sse'
      ? new SSEServerTransport('/sse', process.env.MCP_SERVER_HOST || '0.0.0.0', parseInt(process.env.MCP_SERVER_PORT || '8000'))
      : new StdioServerTransport();

    this.server.connect(transport);
    
    // SSE specific setup
    if (transport instanceof SSEServerTransport) {
      const host = process.env.MCP_SERVER_HOST || '0.0.0.0';
      const port = process.env.MCP_SERVER_PORT || '8000';
      
      console.log(`S3DB MCP Server running on http://${host}:${port}/sse`);
      
      // Add health check endpoint for SSE transport
      this.setupHealthCheck(host, port);
    }
  }

  setupHealthCheck(host, port) {
    import('http').then(({ createServer }) => {
      const healthServer = createServer((req, res) => {
        if (req.url === '/health') {
          const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: SERVER_VERSION,
            database: {
              connected: database ? database.isConnected() : false,
              bucket: database?.bucket || null,
              keyPrefix: database?.keyPrefix || null,
              resourceCount: database ? Object.keys(database.resources || {}).length : 0
            },
            memory: process.memoryUsage(),
            environment: {
              nodeVersion: process.version,
              platform: process.platform,
              transport: 'sse'
            }
          };

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
          res.end(JSON.stringify(healthStatus, null, 2));
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      // Listen on a different port for health checks to avoid conflicts
      const healthPort = parseInt(port) + 1;
      healthServer.listen(healthPort, host, () => {
        console.log(`Health check endpoint: http://${host}:${healthPort}/health`);
      });
    }).catch(err => {
      console.warn('Could not setup health check endpoint:', err.message);
    });
  }

  // Database connection handlers
  async handleDbConnect(args) {
    const { 
      connectionString, 
      verbose = false, 
      parallelism = 10, 
      passphrase = 'secret', 
      versioningEnabled = false,
      enableCache = true,
      enableCosts = true,
      cacheDriver = 'memory', // 'memory', 'filesystem', or 'custom'
      cacheMaxSize = 1000,
      cacheTtl = 300000, // 5 minutes
      cacheDirectory = './cache', // For filesystem cache
      cachePrefix = 'cache'
    } = args;

    if (database && database.isConnected()) {
      return { success: false, message: 'Database is already connected' };
    }

    // Setup plugins array
    const plugins = [];

    // Always add CostsPlugin (unless explicitly disabled)
    const costsEnabled = enableCosts !== false && process.env.S3DB_COSTS_ENABLED !== 'false';
    if (costsEnabled) {
      plugins.push(CostsPlugin);
    }

    // Add CachePlugin (enabled by default, configurable)
    const cacheEnabled = enableCache !== false && process.env.S3DB_CACHE_ENABLED !== 'false';
    if (cacheEnabled) {
      const cacheMaxSizeEnv = process.env.S3DB_CACHE_MAX_SIZE ? parseInt(process.env.S3DB_CACHE_MAX_SIZE) : cacheMaxSize;
      const cacheTtlEnv = process.env.S3DB_CACHE_TTL ? parseInt(process.env.S3DB_CACHE_TTL) : cacheTtl;
      const cacheDriverEnv = process.env.S3DB_CACHE_DRIVER || cacheDriver;
      const cacheDirectoryEnv = process.env.S3DB_CACHE_DIRECTORY || cacheDirectory;
      const cachePrefixEnv = process.env.S3DB_CACHE_PREFIX || cachePrefix;
      
      let cacheConfig = {
        includePartitions: true
      };
      
      if (cacheDriverEnv === 'filesystem') {
        // Filesystem cache configuration
        cacheConfig.driver = new FilesystemCache({
          directory: cacheDirectoryEnv,
          prefix: cachePrefixEnv,
          ttl: cacheTtlEnv,
          enableCompression: true,
          enableStats: verbose,
          enableCleanup: true,
          cleanupInterval: 300000, // 5 minutes
          createDirectory: true
        });
      } else {
        // Memory cache configuration (default)
        cacheConfig.driver = 'memory';
        cacheConfig.memoryOptions = {
          maxSize: cacheMaxSizeEnv,
          ttl: cacheTtlEnv,
          enableStats: verbose
        };
      }
      
      plugins.push(new CachePlugin(cacheConfig));
    }

    database = new S3db({
      connectionString,
      verbose,
      parallelism,
      passphrase,
      versioningEnabled,
      plugins
    });

    await database.connect();

    return {
      success: true,
      message: 'Connected to S3DB database',
      status: {
        connected: database.isConnected(),
        bucket: database.bucket,
        keyPrefix: database.keyPrefix,
        version: database.s3dbVersion,
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
  }

  async handleDbDisconnect(args) {
    if (!database || !database.isConnected()) {
      return { success: false, message: 'No database connection to disconnect' };
    }

    await database.disconnect();
    database = null;

    return {
      success: true,
      message: 'Disconnected from S3DB database'
    };
  }

  async handleDbStatus(args) {
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

  async handleDbCreateResource(args) {
    this.ensureConnected();
    
    const { name, attributes, behavior = 'user-managed', timestamps = false, partitions, paranoid = true } = args;

    const resource = await database.createResource({
      name,
      attributes,
      behavior,
      timestamps,
      partitions,
      paranoid
    });

    return {
      success: true,
      resource: {
        name: resource.name,
        behavior: resource.behavior,
        attributes: resource.attributes,
        partitions: resource.config.partitions,
        timestamps: resource.config.timestamps
      }
    };
  }

  async handleDbListResources(args) {
    this.ensureConnected();
    
    const resourceList = await database.listResources();
    
    return {
      success: true,
      resources: resourceList,
      count: resourceList.length
    };
  }

  // Resource operation handlers
  async handleResourceInsert(args) {
    this.ensureConnected();
    const { resourceName, data } = args;
    
    const resource = this.getResource(resourceName);
    const result = await resource.insert(data);
    
    // Extract partition information for cache invalidation
    const partitionInfo = this._extractPartitionInfo(resource, result);
    
    // Generate cache invalidation patterns
    const cacheInvalidationPatterns = this._generateCacheInvalidationPatterns(resource, result, 'insert');
    
    return {
      success: true,
      data: result,
      ...(partitionInfo && { partitionInfo }),
      cacheInvalidationPatterns
    };
  }

  async handleResourceInsertMany(args) {
    this.ensureConnected();
    const { resourceName, data } = args;
    
    const resource = this.getResource(resourceName);
    const result = await resource.insertMany(data);
    
    return {
      success: true,
      data: result,
      count: result.length
    };
  }

  async handleResourceGet(args) {
    this.ensureConnected();
    const { resourceName, id, partition, partitionValues } = args;
    
    const resource = this.getResource(resourceName);
    
    // Use partition information for optimized retrieval if provided
    let options = {};
    if (partition && partitionValues) {
      options.partition = partition;
      options.partitionValues = partitionValues;
    }
    
    const result = await resource.get(id, options);
    
    // Extract partition information from result
    const partitionInfo = this._extractPartitionInfo(resource, result);
    
    return {
      success: true,
      data: result,
      ...(partitionInfo && { partitionInfo })
    };
  }

  async handleResourceGetMany(args) {
    this.ensureConnected();
    const { resourceName, ids } = args;
    
    const resource = this.getResource(resourceName);
    const result = await resource.getMany(ids);
    
    return {
      success: true,
      data: result,
      count: result.length
    };
  }

  async handleResourceUpdate(args) {
    this.ensureConnected();
    const { resourceName, id, data } = args;
    
    const resource = this.getResource(resourceName);
    const result = await resource.update(id, data);
    
    // Extract partition information for cache invalidation
    const partitionInfo = this._extractPartitionInfo(resource, result);
    
    return {
      success: true,
      data: result,
      ...(partitionInfo && { partitionInfo })
    };
  }

  async handleResourceUpsert(args) {
    this.ensureConnected();
    const { resourceName, data } = args;
    
    const resource = this.getResource(resourceName);
    const result = await resource.upsert(data);
    
    return {
      success: true,
      data: result
    };
  }

  async handleResourceDelete(args) {
    this.ensureConnected();
    const { resourceName, id } = args;
    
    const resource = this.getResource(resourceName);
    await resource.delete(id);
    
    return {
      success: true,
      message: `Document ${id} deleted from ${resourceName}`
    };
  }

  async handleResourceDeleteMany(args) {
    this.ensureConnected();
    const { resourceName, ids } = args;
    
    const resource = this.getResource(resourceName);
    await resource.deleteMany(ids);
    
    return {
      success: true,
      message: `${ids.length} documents deleted from ${resourceName}`,
      deletedIds: ids
    };
  }

  async handleResourceExists(args) {
    this.ensureConnected();
    const { resourceName, id, partition, partitionValues } = args;
    
    const resource = this.getResource(resourceName);
    
    // Use partition information for optimized existence check if provided
    let options = {};
    if (partition && partitionValues) {
      options.partition = partition;
      options.partitionValues = partitionValues;
    }
    
    const exists = await resource.exists(id, options);
    
    return {
      success: true,
      exists,
      id,
      resource: resourceName,
      ...(partition && { partition }),
      ...(partitionValues && { partitionValues })
    };
  }

  async handleResourceList(args) {
    this.ensureConnected();
    const { resourceName, limit = 100, offset = 0, partition, partitionValues } = args;
    
    const resource = this.getResource(resourceName);
    const options = { limit, offset };
    
    if (partition && partitionValues) {
      options.partition = partition;
      options.partitionValues = partitionValues;
    }
    
    const result = await resource.list(options);
    
    // Generate cache key hint for intelligent caching
    const cacheKeyHint = this._generateCacheKeyHint(resourceName, 'list', { 
      limit, 
      offset, 
      partition, 
      partitionValues 
    });
    
    return {
      success: true,
      data: result,
      count: result.length,
      pagination: {
        limit,
        offset,
        hasMore: result.length === limit
      },
      cacheKeyHint,
      ...(partition && { partition }),
      ...(partitionValues && { partitionValues })
    };
  }

  async handleResourceListIds(args) {
    this.ensureConnected();
    const { resourceName, limit = 1000, offset = 0 } = args;
    
    const resource = this.getResource(resourceName);
    const result = await resource.listIds({ limit, offset });
    
    return {
      success: true,
      ids: result,
      count: result.length,
      pagination: {
        limit,
        offset,
        hasMore: result.length === limit
      }
    };
  }

  async handleResourceCount(args) {
    this.ensureConnected();
    const { resourceName, partition, partitionValues } = args;
    
    const resource = this.getResource(resourceName);
    const options = {};
    
    if (partition && partitionValues) {
      options.partition = partition;
      options.partitionValues = partitionValues;
    }
    
    const count = await resource.count(options);
    
    // Generate cache key hint for intelligent caching
    const cacheKeyHint = this._generateCacheKeyHint(resourceName, 'count', { 
      partition, 
      partitionValues 
    });
    
    return {
      success: true,
      count,
      resource: resourceName,
      cacheKeyHint,
      ...(partition && { partition }),
      ...(partitionValues && { partitionValues })
    };
  }

  async handleResourceGetAll(args) {
    this.ensureConnected();
    const { resourceName } = args;
    
    const resource = this.getResource(resourceName);
    const result = await resource.getAll();
    
    return {
      success: true,
      data: result,
      count: result.length,
      warning: result.length > 1000 ? 'Large dataset returned. Consider using resourceList with pagination.' : undefined
    };
  }

  async handleResourceDeleteAll(args) {
    this.ensureConnected();
    const { resourceName, confirm } = args;
    
    if (!confirm) {
      throw new Error('Confirmation required. Set confirm: true to proceed with deleting all data.');
    }
    
    const resource = this.getResource(resourceName);
    await resource.deleteAll();
    
    return {
      success: true,
      message: `All documents deleted from ${resourceName}`
    };
  }

  async handleDbGetStats(args) {
    this.ensureConnected();
    
    const stats = {
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
    if (database.client && database.client.costs) {
      stats.costs = {
        total: database.client.costs.total,
        totalRequests: database.client.costs.requests.total,
        requestsByType: { ...database.client.costs.requests },
        eventsByType: { ...database.client.costs.events },
        estimatedCostUSD: database.client.costs.total
      };
    }

    // Get cache stats from plugins if available
    try {
      const cachePlugin = database.pluginList?.find(p => p.constructor.name === 'CachePlugin');
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
    } catch (error) {
      stats.cache = { enabled: false, error: error.message };
    }

    return {
      success: true,
      stats
    };
  }

  async handleDbClearCache(args) {
    this.ensureConnected();
    const { resourceName } = args;
    
    try {
      const cachePlugin = database.pluginList?.find(p => p.constructor.name === 'CachePlugin');
      if (!cachePlugin || !cachePlugin.driver) {
        return {
          success: false,
          message: 'Cache is not enabled or available'
        };
      }

      if (resourceName) {
        // Clear cache for specific resource
        const resource = this.getResource(resourceName);
        await cachePlugin.clearCacheForResource(resource);
        
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
    } catch (error) {
      return {
        success: false,
        message: `Failed to clear cache: ${error.message}`
      };
    }
  }

  // Helper methods
  ensureConnected() {
    if (!database || !database.isConnected()) {
      throw new Error('Database not connected. Use dbConnect tool first.');
    }
  }

  getResource(resourceName) {
    this.ensureConnected();
    
    if (!database.resources[resourceName]) {
      throw new Error(`Resource '${resourceName}' not found. Available resources: ${Object.keys(database.resources).join(', ')}`);
    }
    
    return database.resources[resourceName];
  }

  // Helper method to extract partition information from data for cache optimization
  _extractPartitionInfo(resource, data) {
    if (!resource || !data || !resource.config?.partitions) {
      return null;
    }

    const partitionInfo = {};
    const partitions = resource.config.partitions;

    for (const [partitionName, partitionConfig] of Object.entries(partitions)) {
      if (partitionConfig.fields) {
        const partitionValues = {};
        let hasValues = false;

        for (const fieldName of Object.keys(partitionConfig.fields)) {
          if (data[fieldName] !== undefined && data[fieldName] !== null) {
            partitionValues[fieldName] = data[fieldName];
            hasValues = true;
          }
        }

        if (hasValues) {
          partitionInfo[partitionName] = partitionValues;
        }
      }
    }

    return Object.keys(partitionInfo).length > 0 ? partitionInfo : null;
  }

  // Helper method to generate intelligent cache keys including partition information
  _generateCacheKeyHint(resourceName, action, params = {}) {
    const keyParts = [`resource=${resourceName}`, `action=${action}`];
    
    // Add partition information if present
    if (params.partition && params.partitionValues) {
      keyParts.push(`partition=${params.partition}`);
      
      // Sort partition values for consistent cache keys
      const sortedValues = Object.entries(params.partitionValues)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
        
      if (sortedValues) {
        keyParts.push(`values=${sortedValues}`);
      }
    }
    
    // Add other parameters (excluding partition info to avoid duplication)
    const otherParams = { ...params };
    delete otherParams.partition;
    delete otherParams.partitionValues;
    
    if (Object.keys(otherParams).length > 0) {
      const sortedParams = Object.entries(otherParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
        
      if (sortedParams) {
        keyParts.push(`params=${sortedParams}`);
      }
    }
    
    return keyParts.join('/') + '.json.gz';
  }

  // Helper method to generate cache invalidation patterns based on data changes
  _generateCacheInvalidationPatterns(resource, data, action = 'write') {
    const patterns = [];
    const resourceName = resource.name;
    
    // Always invalidate general resource cache
    patterns.push(`resource=${resourceName}/action=list`);
    patterns.push(`resource=${resourceName}/action=count`);
    patterns.push(`resource=${resourceName}/action=getAll`);
    
    // Extract partition info and invalidate partition-specific cache
    const partitionInfo = this._extractPartitionInfo(resource, data);
    if (partitionInfo) {
      for (const [partitionName, partitionValues] of Object.entries(partitionInfo)) {
        const sortedValues = Object.entries(partitionValues)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}=${value}`)
          .join('&');
          
        if (sortedValues) {
          // Invalidate specific partition caches
          patterns.push(`resource=${resourceName}/action=list/partition=${partitionName}/values=${sortedValues}`);
          patterns.push(`resource=${resourceName}/action=count/partition=${partitionName}/values=${sortedValues}`);
          patterns.push(`resource=${resourceName}/action=listIds/partition=${partitionName}/values=${sortedValues}`);
        }
      }
    }
    
    // For specific document operations, invalidate document cache
    if (data.id) {
      patterns.push(`resource=${resourceName}/action=get/params=id=${data.id}`);
      patterns.push(`resource=${resourceName}/action=exists/params=id=${data.id}`);
    }
    
    return patterns;
  }
}

// Handle command line arguments
function parseArgs() {
  const args = {
    transport: 'stdio',
    host: '0.0.0.0',
    port: 8000
  };

  process.argv.forEach((arg, index) => {
    if (arg.startsWith('--transport=')) {
      args.transport = arg.split('=')[1];
    } else if (arg === '--transport' && process.argv[index + 1]) {
      args.transport = process.argv[index + 1];
    } else if (arg.startsWith('--host=')) {
      args.host = arg.split('=')[1];
    } else if (arg.startsWith('--port=')) {
      args.port = parseInt(arg.split('=')[1]);
    }
  });

  return args;
}

// Main execution
async function main() {
  const args = parseArgs();
  
  // Set environment variables from command line args
  process.env.MCP_TRANSPORT = args.transport;
  process.env.MCP_SERVER_HOST = args.host;
  process.env.MCP_SERVER_PORT = args.port.toString();

  const server = new S3dbMCPServer();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down S3DB MCP Server...');
    if (database && database.isConnected()) {
      await database.disconnect();
    }
    process.exit(0);
  });

  console.log(`S3DB MCP Server v${SERVER_VERSION} started`);
  console.log(`Transport: ${args.transport}`);
  if (args.transport === 'sse') {
    console.log(`URL: http://${args.host}:${args.port}/sse`);
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { S3dbMCPServer };