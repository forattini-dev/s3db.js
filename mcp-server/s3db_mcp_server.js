#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { S3db } from 's3db.js';
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
            description: 'Connect to an S3DB database',
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
    const { connectionString, verbose = false, parallelism = 10, passphrase = 'secret', versioningEnabled = false } = args;

    if (database && database.isConnected()) {
      return { success: false, message: 'Database is already connected' };
    }

    database = new S3db({
      connectionString,
      verbose,
      parallelism,
      passphrase,
      versioningEnabled
    });

    await database.connect();

    return {
      success: true,
      message: 'Connected to S3DB database',
      status: {
        connected: database.isConnected(),
        bucket: database.bucket,
        keyPrefix: database.keyPrefix,
        version: database.s3dbVersion
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
    
    return {
      success: true,
      data: result
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
    const { resourceName, id } = args;
    
    const resource = this.getResource(resourceName);
    const result = await resource.get(id);
    
    return {
      success: true,
      data: result
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
    
    return {
      success: true,
      data: result
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
    const { resourceName, id } = args;
    
    const resource = this.getResource(resourceName);
    const exists = await resource.exists(id);
    
    return {
      success: true,
      exists,
      id,
      resource: resourceName
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
    
    return {
      success: true,
      data: result,
      count: result.length,
      pagination: {
        limit,
        offset,
        hasMore: result.length === limit
      }
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
    
    return {
      success: true,
      count,
      resource: resourceName
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