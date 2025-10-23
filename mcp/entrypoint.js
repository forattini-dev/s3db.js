#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { S3db, CachePlugin, CostsPlugin } from '../dist/s3db.es.js';
import { FilesystemCache } from '../src/plugins/cache/filesystem-cache.class.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import express from 'express';

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
          // 📖 DOCUMENTATION TOOLS (for AI agents)
          {
            name: 's3dbQueryDocs',
            description: 'Search s3db.js documentation to answer questions about features, plugins, best practices, and usage. Use this tool to help AI agents understand how to use s3db.js effectively.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language question about s3db.js (e.g., "How do I use GeoPlugin?", "What is the best caching strategy?", "How do partitions work?")'
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum number of documentation files to return',
                  default: 5
                }
              },
              required: ['query']
            }
          },
          {
            name: 's3dbListTopics',
            description: 'List all available documentation topics and their categories',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
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
          },
          // 🔍 DEBUGGING TOOLS
          {
            name: 'dbInspectResource',
            description: 'Inspect detailed information about a resource including schema, partitions, behaviors, and configuration',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource to inspect'
                }
              },
              required: ['resourceName']
            }
          },
          {
            name: 'dbGetMetadata',
            description: 'Get raw metadata.json from the S3 bucket for debugging',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'resourceValidate',
            description: 'Validate data against resource schema without inserting',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                data: {
                  type: 'object',
                  description: 'Data to validate'
                }
              },
              required: ['resourceName', 'data']
            }
          },
          {
            name: 'dbHealthCheck',
            description: 'Perform comprehensive health check on database including orphaned partitions detection',
            inputSchema: {
              type: 'object',
              properties: {
                includeOrphanedPartitions: {
                  type: 'boolean',
                  description: 'Include orphaned partitions check',
                  default: true
                }
              },
              required: []
            }
          },
          {
            name: 'resourceGetRaw',
            description: 'Get raw S3 object data (metadata + body) for debugging',
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
          // 📊 QUERY & FILTERING TOOLS
          {
            name: 'resourceQuery',
            description: 'Query documents with complex filters and conditions',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                filters: {
                  type: 'object',
                  description: 'Query filters (e.g., {status: "active", age: {$gt: 18}})'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 100
                },
                offset: {
                  type: 'number',
                  description: 'Number of results to skip',
                  default: 0
                }
              },
              required: ['resourceName', 'filters']
            }
          },
          {
            name: 'resourceSearch',
            description: 'Search for documents by text in specific fields',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                searchText: {
                  type: 'string',
                  description: 'Text to search for'
                },
                fields: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Fields to search in (if not specified, searches all string fields)'
                },
                caseSensitive: {
                  type: 'boolean',
                  description: 'Case-sensitive search',
                  default: false
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 100
                }
              },
              required: ['resourceName', 'searchText']
            }
          },
          // 🔧 PARTITION MANAGEMENT TOOLS
          {
            name: 'resourceListPartitions',
            description: 'List all partitions defined for a resource',
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
            name: 'resourceListPartitionValues',
            description: 'List unique values for a specific partition field',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                partitionName: {
                  type: 'string',
                  description: 'Name of the partition'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of values to return',
                  default: 1000
                }
              },
              required: ['resourceName', 'partitionName']
            }
          },
          {
            name: 'dbFindOrphanedPartitions',
            description: 'Find partitions that reference fields no longer in the schema',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of specific resource to check (optional - checks all if not provided)'
                }
              },
              required: []
            }
          },
          {
            name: 'dbRemoveOrphanedPartitions',
            description: 'Remove orphaned partitions from resource configuration',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                dryRun: {
                  type: 'boolean',
                  description: 'Preview changes without applying them',
                  default: true
                }
              },
              required: ['resourceName']
            }
          },
          // 🚀 BULK OPERATIONS TOOLS
          {
            name: 'resourceUpdateMany',
            description: 'Update multiple documents matching a query filter',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                filters: {
                  type: 'object',
                  description: 'Query filters to select documents'
                },
                updates: {
                  type: 'object',
                  description: 'Updates to apply to matching documents'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of documents to update',
                  default: 1000
                }
              },
              required: ['resourceName', 'filters', 'updates']
            }
          },
          {
            name: 'resourceBulkUpsert',
            description: 'Upsert multiple documents (insert if not exists, update if exists)',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                data: {
                  type: 'array',
                  description: 'Array of documents to upsert (must include id field)'
                }
              },
              required: ['resourceName', 'data']
            }
          },
          // 💾 EXPORT/IMPORT TOOLS
          {
            name: 'resourceExport',
            description: 'Export resource data to JSON, CSV, or NDJSON format',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                format: {
                  type: 'string',
                  description: 'Export format',
                  enum: ['json', 'ndjson', 'csv'],
                  default: 'json'
                },
                filters: {
                  type: 'object',
                  description: 'Optional filters to export subset of data'
                },
                fields: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific fields to export (exports all if not specified)'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of records to export'
                }
              },
              required: ['resourceName']
            }
          },
          {
            name: 'resourceImport',
            description: 'Import data from JSON or NDJSON format into a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: {
                  type: 'string',
                  description: 'Name of the resource'
                },
                data: {
                  type: 'array',
                  description: 'Array of documents to import'
                },
                mode: {
                  type: 'string',
                  description: 'Import mode',
                  enum: ['insert', 'upsert', 'replace'],
                  default: 'insert'
                },
                batchSize: {
                  type: 'number',
                  description: 'Batch size for bulk operations',
                  default: 100
                }
              },
              required: ['resourceName', 'data']
            }
          },
          {
            name: 'dbBackupMetadata',
            description: 'Create a backup of the metadata.json file',
            inputSchema: {
              type: 'object',
              properties: {
                timestamp: {
                  type: 'boolean',
                  description: 'Include timestamp in backup name',
                  default: true
                }
              },
              required: []
            }
          },
          // 📈 ENHANCED STATS TOOLS
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
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          // Documentation tools
          case 's3dbQueryDocs':
            result = await this.handleS3dbQueryDocs(args);
            break;

          case 's3dbListTopics':
            result = await this.handleS3dbListTopics(args);
            break;

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

          // Debugging tools
          case 'dbInspectResource':
            result = await this.handleDbInspectResource(args);
            break;

          case 'dbGetMetadata':
            result = await this.handleDbGetMetadata(args);
            break;

          case 'resourceValidate':
            result = await this.handleResourceValidate(args);
            break;

          case 'dbHealthCheck':
            result = await this.handleDbHealthCheck(args);
            break;

          case 'resourceGetRaw':
            result = await this.handleResourceGetRaw(args);
            break;

          // Query & filtering tools
          case 'resourceQuery':
            result = await this.handleResourceQuery(args);
            break;

          case 'resourceSearch':
            result = await this.handleResourceSearch(args);
            break;

          // Partition management tools
          case 'resourceListPartitions':
            result = await this.handleResourceListPartitions(args);
            break;

          case 'resourceListPartitionValues':
            result = await this.handleResourceListPartitionValues(args);
            break;

          case 'dbFindOrphanedPartitions':
            result = await this.handleDbFindOrphanedPartitions(args);
            break;

          case 'dbRemoveOrphanedPartitions':
            result = await this.handleDbRemoveOrphanedPartitions(args);
            break;

          // Bulk operations tools
          case 'resourceUpdateMany':
            result = await this.handleResourceUpdateMany(args);
            break;

          case 'resourceBulkUpsert':
            result = await this.handleResourceBulkUpsert(args);
            break;

          // Export/import tools
          case 'resourceExport':
            result = await this.handleResourceExport(args);
            break;

          case 'resourceImport':
            result = await this.handleResourceImport(args);
            break;

          case 'dbBackupMetadata':
            result = await this.handleDbBackupMetadata(args);
            break;

          // Enhanced stats tools
          case 'resourceGetStats':
            result = await this.handleResourceGetStats(args);
            break;

          case 'cacheGetStats':
            result = await this.handleCacheGetStats(args);
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
    const useHttp = process.argv.includes('--transport=http') || process.env.MCP_TRANSPORT === 'http';

    if (useHttp) {
      // Setup Express server for Streamable HTTP transport
      this.setupHttpTransport();
    } else {
      // Use stdio transport (default)
      const transport = new StdioServerTransport();
      this.server.connect(transport);
    }
  }

  setupHttpTransport() {
    const host = process.env.MCP_SERVER_HOST || '0.0.0.0';
    const port = parseInt(process.env.MCP_SERVER_PORT || '17500');

    const app = express();
    app.use(express.json());

    // Enable CORS for browser-based clients
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
      res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Streamable HTTP endpoint (stateless mode - recommended)
    app.post('/mcp', async (req, res) => {
      try {
        // Create a new transport for each request to prevent request ID collisions
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true
        });

        res.on('close', () => {
          transport.close();
        });

        await this.server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error'
            },
            id: null
          });
        }
      }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
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
          transport: 'streamable-http'
        }
      };

      res.json(healthStatus);
    });

    // Start Express server
    app.listen(port, host, () => {
      console.log(`S3DB MCP Server running on http://${host}:${port}/mcp`);
      console.log(`Health check endpoint: http://${host}:${port}/health`);
    }).on('error', error => {
      console.error('Server error:', error);
      process.exit(1);
    });
  }


  // 📖 DOCUMENTATION TOOLS HANDLERS

  async handleS3dbQueryDocs(args) {
    const { query, maxResults = 5 } = args;

    // Import the documentation handler dynamically
    const { createDocumentationHandlers } = await import('./tools/documentation.js');
    const handlers = createDocumentationHandlers(this);

    return await handlers.s3dbQueryDocs(args);
  }

  async handleS3dbListTopics(args) {
    // Import the documentation handler dynamically
    const { createDocumentationHandlers } = await import('./tools/documentation.js');
    const handlers = createDocumentationHandlers(this);

    return await handlers.s3dbListTopics(args);
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
    
    // Declare cache variables in outer scope to avoid reference errors
    let cacheMaxSizeEnv, cacheTtlEnv, cacheDriverEnv, cacheDirectoryEnv, cachePrefixEnv;
    
    if (cacheEnabled) {
      cacheMaxSizeEnv = process.env.S3DB_CACHE_MAX_SIZE ? parseInt(process.env.S3DB_CACHE_MAX_SIZE) : cacheMaxSize;
      cacheTtlEnv = process.env.S3DB_CACHE_TTL ? parseInt(process.env.S3DB_CACHE_TTL) : cacheTtl;
      cacheDriverEnv = process.env.S3DB_CACHE_DRIVER || cacheDriver;
      cacheDirectoryEnv = process.env.S3DB_CACHE_DIRECTORY || cacheDirectory;
      cachePrefixEnv = process.env.S3DB_CACHE_PREFIX || cachePrefix;
      
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

  // 🔍 DEBUGGING TOOLS HANDLERS

  async handleDbInspectResource(args) {
    this.ensureConnected();
    const { resourceName } = args;
    const resource = this.getResource(resourceName);

    const inspection = {
      success: true,
      resource: {
        name: resource.name,
        behavior: resource.behavior,
        version: resource.version,
        createdBy: resource.createdBy || 'user',

        schema: {
          attributes: resource.attributes,
          attributeCount: Object.keys(resource.attributes || {}).length,
          fieldTypes: {}
        },

        partitions: resource.config.partitions ? {
          count: Object.keys(resource.config.partitions).length,
          definitions: resource.config.partitions,
          orphaned: resource.findOrphanedPartitions ? resource.findOrphanedPartitions() : null
        } : null,

        configuration: {
          timestamps: resource.config.timestamps,
          paranoid: resource.config.paranoid,
          strictValidation: resource.strictValidation,
          asyncPartitions: resource.config.asyncPartitions,
          versioningEnabled: resource.config.versioningEnabled,
          autoDecrypt: resource.config.autoDecrypt
        },

        hooks: resource.config.hooks ? {
          beforeInsert: resource.config.hooks.beforeInsert?.length || 0,
          afterInsert: resource.config.hooks.afterInsert?.length || 0,
          beforeUpdate: resource.config.hooks.beforeUpdate?.length || 0,
          afterUpdate: resource.config.hooks.afterUpdate?.length || 0,
          beforeDelete: resource.config.hooks.beforeDelete?.length || 0,
          afterDelete: resource.config.hooks.afterDelete?.length || 0
        } : null,

        s3Paths: {
          metadataKey: `${database.keyPrefix}metadata.json`,
          resourcePrefix: `${database.keyPrefix}resource=${resourceName}/`
        }
      }
    };

    // Analyze field types
    for (const [fieldName, fieldDef] of Object.entries(resource.attributes || {})) {
      const typeStr = typeof fieldDef === 'string' ? fieldDef : fieldDef.type;
      inspection.resource.schema.fieldTypes[fieldName] = typeStr;
    }

    return inspection;
  }

  async handleDbGetMetadata(args) {
    this.ensureConnected();

    const metadataKey = `${database.keyPrefix}metadata.json`;

    try {
      const response = await database.client.getObject({
        Bucket: database.bucket,
        Key: metadataKey
      });

      const metadataContent = await response.Body.transformToString();
      const metadata = JSON.parse(metadataContent);

      return {
        success: true,
        metadata,
        s3Info: {
          key: metadataKey,
          bucket: database.bucket,
          lastModified: response.LastModified,
          size: response.ContentLength,
          etag: response.ETag
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        key: metadataKey
      };
    }
  }

  async handleResourceValidate(args) {
    this.ensureConnected();
    const { resourceName, data } = args;
    const resource = this.getResource(resourceName);

    try {
      // Use the schema validator if available
      const validationResult = resource.schema.validate(data);

      return {
        success: true,
        valid: validationResult === true,
        errors: validationResult === true ? [] : validationResult,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        valid: false,
        error: error.message,
        data: data
      };
    }
  }

  async handleDbHealthCheck(args) {
    this.ensureConnected();
    const { includeOrphanedPartitions = true } = args;

    const health = {
      success: true,
      timestamp: new Date().toISOString(),
      database: {
        connected: database.isConnected(),
        bucket: database.bucket,
        keyPrefix: database.keyPrefix,
        version: database.s3dbVersion
      },
      resources: {
        total: Object.keys(database.resources || {}).length,
        list: Object.keys(database.resources || {}),
        details: {}
      },
      issues: []
    };

    // Check each resource
    for (const [name, resource] of Object.entries(database.resources || {})) {
      const resourceHealth = {
        name,
        behavior: resource.behavior,
        attributeCount: Object.keys(resource.attributes || {}).length,
        partitionCount: resource.config.partitions ? Object.keys(resource.config.partitions).length : 0
      };

      // Check for orphaned partitions
      if (includeOrphanedPartitions && resource.findOrphanedPartitions) {
        const orphaned = resource.findOrphanedPartitions();
        if (Object.keys(orphaned).length > 0) {
          resourceHealth.orphanedPartitions = orphaned;
          health.issues.push({
            severity: 'warning',
            resource: name,
            type: 'orphaned_partitions',
            message: `Resource '${name}' has ${Object.keys(orphaned).length} orphaned partition(s)`,
            details: orphaned
          });
        }
      }

      health.resources.details[name] = resourceHealth;
    }

    health.healthy = health.issues.length === 0;

    return health;
  }

  async handleResourceGetRaw(args) {
    this.ensureConnected();
    const { resourceName, id } = args;
    const resource = this.getResource(resourceName);

    try {
      // Build S3 key
      const key = `${database.keyPrefix}resource=${resourceName}/id=${id}.json`;

      const response = await database.client.getObject({
        Bucket: database.bucket,
        Key: key
      });

      const body = await response.Body.transformToString();
      const bodyData = body ? JSON.parse(body) : null;

      return {
        success: true,
        s3Object: {
          key,
          bucket: database.bucket,
          metadata: response.Metadata || {},
          contentLength: response.ContentLength,
          lastModified: response.LastModified,
          etag: response.ETag,
          contentType: response.ContentType
        },
        data: {
          metadata: response.Metadata,
          body: bodyData
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        id,
        resource: resourceName
      };
    }
  }

  // 📊 QUERY & FILTERING TOOLS HANDLERS

  async handleResourceQuery(args) {
    this.ensureConnected();
    const { resourceName, filters, limit = 100, offset = 0 } = args;
    const resource = this.getResource(resourceName);

    try {
      // Use the query method from resource
      const results = await resource.query(filters, { limit, offset });

      return {
        success: true,
        data: results,
        count: results.length,
        filters,
        pagination: {
          limit,
          offset,
          hasMore: results.length === limit
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        filters
      };
    }
  }

  async handleResourceSearch(args) {
    this.ensureConnected();
    const { resourceName, searchText, fields, caseSensitive = false, limit = 100 } = args;
    const resource = this.getResource(resourceName);

    try {
      // Get all documents and filter in memory
      const allDocs = await resource.list({ limit: limit * 2 }); // Fetch more to ensure we have enough after filtering

      const searchString = caseSensitive ? searchText : searchText.toLowerCase();

      // Determine fields to search
      let searchFields = fields;
      if (!searchFields || searchFields.length === 0) {
        // Auto-detect string fields
        searchFields = Object.keys(resource.attributes || {}).filter(key => {
          const attr = resource.attributes[key];
          const type = typeof attr === 'string' ? attr.split('|')[0] : attr.type;
          return type === 'string';
        });
      }

      // Filter documents
      const results = allDocs.filter(doc => {
        return searchFields.some(field => {
          const value = doc[field];
          if (!value) return false;
          const valueString = caseSensitive ? String(value) : String(value).toLowerCase();
          return valueString.includes(searchString);
        });
      }).slice(0, limit);

      return {
        success: true,
        data: results,
        count: results.length,
        searchText,
        searchFields,
        caseSensitive
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        searchText
      };
    }
  }

  // 🔧 PARTITION MANAGEMENT TOOLS HANDLERS

  async handleResourceListPartitions(args) {
    this.ensureConnected();
    const { resourceName } = args;
    const resource = this.getResource(resourceName);

    const partitions = resource.config.partitions || {};

    return {
      success: true,
      resource: resourceName,
      partitions: Object.keys(partitions),
      count: Object.keys(partitions).length,
      details: partitions
    };
  }

  async handleResourceListPartitionValues(args) {
    this.ensureConnected();
    const { resourceName, partitionName, limit = 1000 } = args;
    const resource = this.getResource(resourceName);

    if (!resource.config.partitions || !resource.config.partitions[partitionName]) {
      throw new Error(`Partition '${partitionName}' not found in resource '${resourceName}'`);
    }

    try {
      // List all objects with this partition prefix
      const prefix = `${database.keyPrefix}resource=${resourceName}/partition=${partitionName}/`;

      const response = await database.client.listObjectsV2({
        Bucket: database.bucket,
        Prefix: prefix,
        MaxKeys: limit
      });

      // Extract unique partition values from keys
      const partitionValues = new Set();

      for (const obj of response.Contents || []) {
        // Parse partition values from key
        const keyParts = obj.Key.split('/');
        const partitionPart = keyParts.find(part => part.startsWith('partition='));
        if (partitionPart) {
          const valuesPart = keyParts.slice(keyParts.indexOf(partitionPart) + 1).find(part => !part.startsWith('id='));
          if (valuesPart) {
            partitionValues.add(valuesPart);
          }
        }
      }

      return {
        success: true,
        resource: resourceName,
        partition: partitionName,
        values: Array.from(partitionValues),
        count: partitionValues.size
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        resource: resourceName,
        partition: partitionName
      };
    }
  }

  async handleDbFindOrphanedPartitions(args) {
    this.ensureConnected();
    const { resourceName } = args;

    const orphanedByResource = {};
    const resourcesToCheck = resourceName
      ? [resourceName]
      : Object.keys(database.resources || {});

    for (const name of resourcesToCheck) {
      const resource = database.resources[name];
      if (resource && resource.findOrphanedPartitions) {
        const orphaned = resource.findOrphanedPartitions();
        if (Object.keys(orphaned).length > 0) {
          orphanedByResource[name] = orphaned;
        }
      }
    }

    return {
      success: true,
      orphanedPartitions: orphanedByResource,
      affectedResources: Object.keys(orphanedByResource),
      count: Object.keys(orphanedByResource).length,
      hasIssues: Object.keys(orphanedByResource).length > 0
    };
  }

  async handleDbRemoveOrphanedPartitions(args) {
    this.ensureConnected();
    const { resourceName, dryRun = true } = args;
    const resource = this.getResource(resourceName);

    if (!resource.removeOrphanedPartitions) {
      throw new Error(`Resource '${resourceName}' does not support removeOrphanedPartitions method`);
    }

    // Find orphaned partitions first
    const orphaned = resource.findOrphanedPartitions();

    if (Object.keys(orphaned).length === 0) {
      return {
        success: true,
        message: 'No orphaned partitions found',
        resource: resourceName,
        dryRun
      };
    }

    if (dryRun) {
      return {
        success: true,
        message: 'Dry run - no changes made',
        resource: resourceName,
        orphanedPartitions: orphaned,
        wouldRemove: Object.keys(orphaned),
        dryRun: true
      };
    }

    // Actually remove
    const removed = resource.removeOrphanedPartitions();

    // Save metadata
    await database.uploadMetadataFile();

    return {
      success: true,
      message: `Removed ${Object.keys(removed).length} orphaned partition(s)`,
      resource: resourceName,
      removedPartitions: removed,
      dryRun: false
    };
  }

  // 🚀 BULK OPERATIONS TOOLS HANDLERS

  async handleResourceUpdateMany(args) {
    this.ensureConnected();
    const { resourceName, filters, updates, limit = 1000 } = args;
    const resource = this.getResource(resourceName);

    try {
      // Query documents matching filters
      const docs = await resource.query(filters, { limit });

      // Update each document
      const updatePromises = docs.map(doc =>
        resource.update(doc.id, updates)
      );

      const results = await Promise.all(updatePromises);

      return {
        success: true,
        updatedCount: results.length,
        filters,
        updates,
        data: results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        filters,
        updates
      };
    }
  }

  async handleResourceBulkUpsert(args) {
    this.ensureConnected();
    const { resourceName, data } = args;
    const resource = this.getResource(resourceName);

    try {
      // Upsert each document
      const upsertPromises = data.map(doc => resource.upsert(doc));
      const results = await Promise.all(upsertPromises);

      return {
        success: true,
        upsertedCount: results.length,
        data: results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 💾 EXPORT/IMPORT TOOLS HANDLERS

  async handleResourceExport(args) {
    this.ensureConnected();
    const { resourceName, format = 'json', filters, fields, limit } = args;
    const resource = this.getResource(resourceName);

    try {
      // Get data
      let data;
      if (filters) {
        data = await resource.query(filters, limit ? { limit } : {});
      } else if (limit) {
        data = await resource.list({ limit });
      } else {
        data = await resource.getAll();
      }

      // Filter fields if specified
      if (fields && fields.length > 0) {
        data = data.map(doc => {
          const filtered = {};
          for (const field of fields) {
            if (doc[field] !== undefined) {
              filtered[field] = doc[field];
            }
          }
          return filtered;
        });
      }

      let exportData;
      let contentType;

      switch (format) {
        case 'json':
          exportData = JSON.stringify(data, null, 2);
          contentType = 'application/json';
          break;

        case 'ndjson':
          exportData = data.map(doc => JSON.stringify(doc)).join('\n');
          contentType = 'application/x-ndjson';
          break;

        case 'csv':
          // Simple CSV conversion
          if (data.length === 0) {
            exportData = '';
          } else {
            const headers = Object.keys(data[0]);
            const csvRows = [headers.join(',')];
            for (const doc of data) {
              const row = headers.map(h => {
                const val = doc[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return JSON.stringify(val);
                return String(val).includes(',') ? `"${val}"` : val;
              });
              csvRows.push(row.join(','));
            }
            exportData = csvRows.join('\n');
          }
          contentType = 'text/csv';
          break;

        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      return {
        success: true,
        resource: resourceName,
        format,
        recordCount: data.length,
        exportData,
        contentType,
        size: exportData.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        resource: resourceName,
        format
      };
    }
  }

  async handleResourceImport(args) {
    this.ensureConnected();
    const { resourceName, data, mode = 'insert', batchSize = 100 } = args;
    const resource = this.getResource(resourceName);

    try {
      const results = [];
      let processed = 0;

      // Process in batches
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        let batchResults;
        switch (mode) {
          case 'insert':
            batchResults = await resource.insertMany(batch);
            break;

          case 'upsert':
            batchResults = await Promise.all(batch.map(doc => resource.upsert(doc)));
            break;

          case 'replace':
            // Delete all first if first batch
            if (i === 0) {
              await resource.deleteAll();
            }
            batchResults = await resource.insertMany(batch);
            break;

          default:
            throw new Error(`Unsupported mode: ${mode}`);
        }

        results.push(...batchResults);
        processed += batch.length;
      }

      return {
        success: true,
        resource: resourceName,
        mode,
        importedCount: results.length,
        totalRecords: data.length,
        batchSize
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        resource: resourceName,
        mode,
        processed
      };
    }
  }

  async handleDbBackupMetadata(args) {
    this.ensureConnected();
    const { timestamp = true } = args;

    try {
      const metadataKey = `${database.keyPrefix}metadata.json`;

      // Read current metadata
      const response = await database.client.getObject({
        Bucket: database.bucket,
        Key: metadataKey
      });

      const metadataContent = await response.Body.transformToString();

      // Create backup key
      const backupSuffix = timestamp ? `-backup-${Date.now()}` : '-backup';
      const backupKey = metadataKey.replace('.json', `${backupSuffix}.json`);

      // Save backup
      await database.client.putObject({
        Bucket: database.bucket,
        Key: backupKey,
        Body: metadataContent,
        ContentType: 'application/json'
      });

      return {
        success: true,
        message: 'Metadata backup created',
        backup: {
          key: backupKey,
          bucket: database.bucket,
          timestamp: new Date().toISOString(),
          size: metadataContent.length
        },
        original: {
          key: metadataKey
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 📈 ENHANCED STATS TOOLS HANDLERS

  async handleResourceGetStats(args) {
    this.ensureConnected();
    const { resourceName, includePartitionStats = true } = args;
    const resource = this.getResource(resourceName);

    try {
      const stats = {
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
              fields: Object.keys(partitionConfig.fields || {}),
              documentCount: partitionCount
            };
          } catch (error) {
            stats.partitions.details[partitionName] = {
              fields: Object.keys(partitionConfig.fields || {}),
              error: error.message
            };
          }
        }
      }

      return stats;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        resource: resourceName
      };
    }
  }

  async handleCacheGetStats(args) {
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
        const resourceKeys = allKeys.filter(key => key.includes(`resource=${resourceName}`));
        stats.resource = {
          name: resourceName,
          keys: resourceKeys.length,
          sampleKeys: resourceKeys.slice(0, 5)
        };
      } else {
        // Group by resource
        const byResource = {};
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
      if (cachePlugin.driver.constructor.name === 'MemoryCache' && cachePlugin.driver.getMemoryStats) {
        stats.memory = cachePlugin.driver.getMemoryStats();
      }

      return stats;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Handle command line arguments
function parseArgs() {
  const args = {
    transport: 'stdio',
    host: '0.0.0.0',
    port: 17500
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
  if (args.transport === 'http') {
    console.log(`URL: http://${args.host}:${args.port}/mcp`);
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { S3dbMCPServer };