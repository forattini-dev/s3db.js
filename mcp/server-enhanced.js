#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { S3db, CachePlugin, CostsPlugin, MetricsPlugin, FilesystemCache, MemoryCache } from 's3db.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, createReadStream, createWriteStream } from 'fs';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global database instance
let database = null;
let queryBuilders = new Map(); // Store active query builders
let streamProcessors = new Map(); // Store active stream processors

// Server configuration
const SERVER_NAME = 's3db-mcp-enhanced';
const SERVER_VERSION = '2.0.0';

class S3dbMCPEnhancedServer {
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
          // ========== CONNECTION MANAGEMENT ==========
          {
            name: 'dbConnect',
            description: 'Connect to S3DB with advanced configuration',
            inputSchema: {
              type: 'object',
              properties: {
                connectionString: { type: 'string', description: 'S3DB connection string' },
                verbose: { type: 'boolean', default: false },
                parallelism: { type: 'number', default: 10 },
                passphrase: { type: 'string', default: 'secret' },
                versioningEnabled: { type: 'boolean', default: false },
                persistHooks: { type: 'boolean', default: false },
                enableCache: { type: 'boolean', default: true },
                enableCosts: { type: 'boolean', default: true },
                enableMetrics: { type: 'boolean', default: true },
                cacheDriver: { type: 'string', enum: ['memory', 'filesystem', 's3'], default: 'memory' },
                cacheMaxSize: { type: 'number', default: 1000 },
                cacheTtl: { type: 'number', default: 300000 },
                cacheDirectory: { type: 'string', default: './cache' },
                cacheCompress: { type: 'boolean', default: true }
              },
              required: ['connectionString']
            }
          },

          // ========== RESOURCE INTROSPECTION ==========
          {
            name: 'resourceInspect',
            description: 'Get detailed schema and metadata for a resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string', description: 'Resource name' },
                includeStats: { type: 'boolean', description: 'Include usage statistics', default: true },
                includeSample: { type: 'boolean', description: 'Include sample documents', default: false },
                sampleSize: { type: 'number', description: 'Number of sample documents', default: 3 }
              },
              required: ['resourceName']
            }
          },

          {
            name: 'resourceValidate',
            description: 'Validate data against resource schema without inserting',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                data: { type: 'object', description: 'Data to validate' },
                strict: { type: 'boolean', description: 'Strict validation mode', default: true }
              },
              required: ['resourceName', 'data']
            }
          },

          {
            name: 'resourceAnalyze',
            description: 'Analyze resource for optimization opportunities',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                analyzePartitions: { type: 'boolean', default: true },
                analyzeBehavior: { type: 'boolean', default: true },
                analyzeSize: { type: 'boolean', default: true }
              },
              required: ['resourceName']
            }
          },

          // ========== QUERY BUILDER ==========
          {
            name: 'queryCreate',
            description: 'Create a new query builder for complex queries',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                queryId: { type: 'string', description: 'Optional query ID for reuse' }
              },
              required: ['resourceName']
            }
          },

          {
            name: 'queryFilter',
            description: 'Add filter conditions to a query',
            inputSchema: {
              type: 'object',
              properties: {
                queryId: { type: 'string' },
                field: { type: 'string' },
                operator: { 
                  type: 'string', 
                  enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'startsWith', 'endsWith', 'regex'],
                  description: 'Comparison operator'
                },
                value: { description: 'Value to compare' },
                combineWith: { type: 'string', enum: ['AND', 'OR'], default: 'AND' }
              },
              required: ['queryId', 'field', 'operator', 'value']
            }
          },

          {
            name: 'querySort',
            description: 'Add sorting to a query',
            inputSchema: {
              type: 'object',
              properties: {
                queryId: { type: 'string' },
                field: { type: 'string' },
                direction: { type: 'string', enum: ['asc', 'desc'], default: 'asc' }
              },
              required: ['queryId', 'field']
            }
          },

          {
            name: 'queryProject',
            description: 'Select specific fields to return',
            inputSchema: {
              type: 'object',
              properties: {
                queryId: { type: 'string' },
                fields: { type: 'array', items: { type: 'string' }, description: 'Fields to include' },
                exclude: { type: 'boolean', description: 'Exclude specified fields instead', default: false }
              },
              required: ['queryId', 'fields']
            }
          },

          {
            name: 'queryExecute',
            description: 'Execute a built query',
            inputSchema: {
              type: 'object',
              properties: {
                queryId: { type: 'string' },
                limit: { type: 'number', default: 100 },
                offset: { type: 'number', default: 0 },
                explain: { type: 'boolean', description: 'Return query execution plan', default: false }
              },
              required: ['queryId']
            }
          },

          {
            name: 'queryAggregate',
            description: 'Perform aggregation operations',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                pipeline: {
                  type: 'array',
                  description: 'Aggregation pipeline stages',
                  items: {
                    type: 'object',
                    properties: {
                      stage: { type: 'string', enum: ['group', 'match', 'sort', 'limit', 'count', 'sum', 'avg', 'min', 'max'] },
                      params: { type: 'object' }
                    }
                  }
                }
              },
              required: ['resourceName', 'pipeline']
            }
          },

          // ========== BATCH OPERATIONS ==========
          {
            name: 'batchUpdate',
            description: 'Update multiple documents matching conditions',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                filter: { type: 'object', description: 'Filter conditions' },
                update: { type: 'object', description: 'Update operations' },
                upsert: { type: 'boolean', default: false },
                dryRun: { type: 'boolean', description: 'Preview changes without applying', default: false }
              },
              required: ['resourceName', 'filter', 'update']
            }
          },

          {
            name: 'batchDelete',
            description: 'Delete multiple documents matching conditions',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                filter: { type: 'object', description: 'Filter conditions' },
                dryRun: { type: 'boolean', description: 'Preview deletions without applying', default: false },
                confirm: { type: 'boolean', description: 'Confirmation flag', default: false }
              },
              required: ['resourceName', 'filter']
            }
          },

          {
            name: 'transaction',
            description: 'Execute multiple operations atomically',
            inputSchema: {
              type: 'object',
              properties: {
                operations: {
                  type: 'array',
                  description: 'List of operations to execute',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['insert', 'update', 'delete', 'upsert'] },
                      resource: { type: 'string' },
                      data: { type: 'object' },
                      id: { type: 'string' },
                      filter: { type: 'object' }
                    }
                  }
                },
                rollbackOnError: { type: 'boolean', default: true }
              },
              required: ['operations']
            }
          },

          // ========== STREAM PROCESSING ==========
          {
            name: 'streamCreate',
            description: 'Create a stream processor for large data operations',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                streamId: { type: 'string', description: 'Stream identifier' },
                type: { type: 'string', enum: ['read', 'write', 'transform'], default: 'read' },
                batchSize: { type: 'number', default: 100 },
                concurrency: { type: 'number', default: 5 }
              },
              required: ['resourceName']
            }
          },

          {
            name: 'streamProcess',
            description: 'Process data through a stream',
            inputSchema: {
              type: 'object',
              properties: {
                streamId: { type: 'string' },
                transform: { 
                  type: 'object',
                  description: 'Transformation function as string',
                  properties: {
                    code: { type: 'string', description: 'JavaScript transformation code' }
                  }
                },
                filter: { type: 'object', description: 'Filter conditions' },
                progress: { type: 'boolean', description: 'Report progress', default: true }
              },
              required: ['streamId']
            }
          },

          {
            name: 'streamStatus',
            description: 'Get stream processing status',
            inputSchema: {
              type: 'object',
              properties: {
                streamId: { type: 'string' }
              },
              required: ['streamId']
            }
          },

          // ========== SCHEMA MANAGEMENT ==========
          {
            name: 'schemaEvolve',
            description: 'Evolve resource schema with migration',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                newAttributes: { type: 'object', description: 'New schema definition' },
                migration: {
                  type: 'object',
                  properties: {
                    strategy: { type: 'string', enum: ['additive', 'breaking', 'versioned'], default: 'additive' },
                    transform: { type: 'string', description: 'Migration code for existing data' }
                  }
                },
                dryRun: { type: 'boolean', default: true }
              },
              required: ['resourceName', 'newAttributes']
            }
          },

          {
            name: 'schemaCompare',
            description: 'Compare schemas between resources or versions',
            inputSchema: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'Source resource name' },
                target: { type: 'string', description: 'Target resource name' },
                detailed: { type: 'boolean', default: true }
              },
              required: ['source', 'target']
            }
          },

          // ========== EXPORT/IMPORT ==========
          {
            name: 'exportData',
            description: 'Export resource data to various formats',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                format: { type: 'string', enum: ['json', 'csv', 'ndjson', 'parquet', 'excel'], default: 'json' },
                filter: { type: 'object', description: 'Filter conditions' },
                fields: { type: 'array', items: { type: 'string' }, description: 'Fields to export' },
                destination: { type: 'string', description: 'Output file path or S3 URL' },
                compress: { type: 'boolean', default: false }
              },
              required: ['resourceName']
            }
          },

          {
            name: 'importData',
            description: 'Import data from various formats',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                format: { type: 'string', enum: ['json', 'csv', 'ndjson', 'parquet', 'excel'], default: 'json' },
                source: { type: 'string', description: 'Input file path or S3 URL' },
                mapping: { type: 'object', description: 'Field mapping rules' },
                validation: { type: 'string', enum: ['strict', 'loose', 'none'], default: 'strict' },
                onConflict: { type: 'string', enum: ['skip', 'update', 'error'], default: 'skip' },
                dryRun: { type: 'boolean', default: false }
              },
              required: ['resourceName', 'source']
            }
          },

          // ========== PERFORMANCE OPTIMIZATION ==========
          {
            name: 'createIndex',
            description: 'Create virtual index for faster queries',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                indexName: { type: 'string' },
                fields: { type: 'array', items: { type: 'string' } },
                unique: { type: 'boolean', default: false },
                sparse: { type: 'boolean', default: false }
              },
              required: ['resourceName', 'indexName', 'fields']
            }
          },

          {
            name: 'analyzePerformance',
            description: 'Analyze query and operation performance',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                period: { type: 'string', enum: ['1h', '24h', '7d', '30d'], default: '24h' },
                operations: { type: 'array', items: { type: 'string' }, description: 'Specific operations to analyze' }
              },
              required: ['resourceName']
            }
          },

          {
            name: 'optimizeSuggest',
            description: 'Get optimization suggestions for resource',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                analyzeQueries: { type: 'boolean', default: true },
                analyzeSchema: { type: 'boolean', default: true },
                analyzePartitions: { type: 'boolean', default: true }
              },
              required: ['resourceName']
            }
          },

          // ========== MONITORING & ALERTS ==========
          {
            name: 'metricsRealtime',
            description: 'Get real-time metrics for database operations',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string', description: 'Specific resource or all' },
                metrics: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Metrics to track',
                  default: ['operations', 'latency', 'errors', 'cache_hits']
                },
                interval: { type: 'number', description: 'Update interval in ms', default: 1000 }
              }
            }
          },

          {
            name: 'alertCreate',
            description: 'Create alert for specific conditions',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                condition: {
                  type: 'object',
                  properties: {
                    metric: { type: 'string' },
                    operator: { type: 'string', enum: ['>', '<', '>=', '<=', '=='] },
                    threshold: { type: 'number' }
                  }
                },
                action: { type: 'string', enum: ['log', 'email', 'webhook'], default: 'log' },
                cooldown: { type: 'number', description: 'Cooldown period in ms', default: 60000 }
              },
              required: ['name', 'condition']
            }
          },

          // ========== ADVANCED FEATURES ==========
          {
            name: 'backup',
            description: 'Create backup of resource or entire database',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string', description: 'Specific resource or null for all' },
                destination: { type: 'string', description: 'Backup destination S3 URL' },
                incremental: { type: 'boolean', default: false },
                compress: { type: 'boolean', default: true },
                encryption: { type: 'boolean', default: true }
              },
              required: ['destination']
            }
          },

          {
            name: 'restore',
            description: 'Restore from backup',
            inputSchema: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'Backup source S3 URL' },
                resourceName: { type: 'string', description: 'Specific resource to restore' },
                overwrite: { type: 'boolean', default: false },
                dryRun: { type: 'boolean', default: true }
              },
              required: ['source']
            }
          },

          {
            name: 'hookManage',
            description: 'Manage resource hooks dynamically',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                action: { type: 'string', enum: ['add', 'remove', 'list', 'test'] },
                hookType: { type: 'string', enum: ['beforeInsert', 'afterInsert', 'beforeUpdate', 'afterUpdate', 'beforeDelete', 'afterDelete'] },
                hookCode: { type: 'string', description: 'Hook function code' },
                hookName: { type: 'string', description: 'Hook identifier' }
              },
              required: ['resourceName', 'action']
            }
          },

          {
            name: 'pluginManage',
            description: 'Manage S3DB plugins dynamically',
            inputSchema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['add', 'remove', 'list', 'configure'] },
                pluginName: { type: 'string', enum: ['cache', 'costs', 'metrics', 'audit', 'fulltext', 'replicator'] },
                config: { type: 'object', description: 'Plugin configuration' }
              },
              required: ['action']
            }
          },

          // ========== AI-SPECIFIC TOOLS ==========
          {
            name: 'aiSuggestSchema',
            description: 'AI-powered schema suggestion based on sample data',
            inputSchema: {
              type: 'object',
              properties: {
                sampleData: { type: 'array', description: 'Sample documents' },
                resourceName: { type: 'string', description: 'Suggested resource name' },
                useCase: { type: 'string', description: 'Describe the use case' }
              },
              required: ['sampleData']
            }
          },

          {
            name: 'aiOptimizeQuery',
            description: 'AI-powered query optimization',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'object', description: 'Current query' },
                resourceName: { type: 'string' },
                goal: { type: 'string', enum: ['speed', 'cost', 'balanced'], default: 'balanced' }
              },
              required: ['query', 'resourceName']
            }
          },

          {
            name: 'aiAnalyzeUsage',
            description: 'AI analysis of database usage patterns',
            inputSchema: {
              type: 'object',
              properties: {
                period: { type: 'string', enum: ['24h', '7d', '30d'], default: '7d' },
                recommendations: { type: 'boolean', default: true }
              }
            }
          },

          // Keep all original basic tools from server.js
          ...this.getOriginalTools()
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        // Route to appropriate handler
        if (name.startsWith('query')) {
          result = await this.handleQueryOperation(name, args);
        } else if (name.startsWith('stream')) {
          result = await this.handleStreamOperation(name, args);
        } else if (name.startsWith('batch')) {
          result = await this.handleBatchOperation(name, args);
        } else if (name.startsWith('schema')) {
          result = await this.handleSchemaOperation(name, args);
        } else if (name.startsWith('ai')) {
          result = await this.handleAIOperation(name, args);
        } else {
          // Fall back to enhanced handlers or original handlers
          result = await this.handleEnhancedOperation(name, args);
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
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                suggestion: this.getErrorSuggestion(error)
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  // ========== QUERY OPERATIONS ==========
  async handleQueryOperation(name, args) {
    switch (name) {
      case 'queryCreate': {
        const { resourceName, queryId } = args;
        const id = queryId || `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const queryBuilder = {
          id,
          resourceName,
          filters: [],
          sort: [],
          projection: null,
          limit: 100,
          offset: 0
        };
        
        queryBuilders.set(id, queryBuilder);
        
        return {
          success: true,
          queryId: id,
          message: `Query builder created for resource: ${resourceName}`
        };
      }

      case 'queryFilter': {
        const { queryId, field, operator, value, combineWith } = args;
        const builder = queryBuilders.get(queryId);
        
        if (!builder) throw new Error(`Query ${queryId} not found`);
        
        builder.filters.push({ field, operator, value, combineWith });
        
        return {
          success: true,
          queryId,
          filters: builder.filters
        };
      }

      case 'querySort': {
        const { queryId, field, direction } = args;
        const builder = queryBuilders.get(queryId);
        
        if (!builder) throw new Error(`Query ${queryId} not found`);
        
        builder.sort.push({ field, direction });
        
        return {
          success: true,
          queryId,
          sort: builder.sort
        };
      }

      case 'queryProject': {
        const { queryId, fields, exclude } = args;
        const builder = queryBuilders.get(queryId);
        
        if (!builder) throw new Error(`Query ${queryId} not found`);
        
        builder.projection = { fields, exclude };
        
        return {
          success: true,
          queryId,
          projection: builder.projection
        };
      }

      case 'queryExecute': {
        const { queryId, limit, offset, explain } = args;
        const builder = queryBuilders.get(queryId);
        
        if (!builder) throw new Error(`Query ${queryId} not found`);
        
        this.ensureConnected();
        const resource = this.getResource(builder.resourceName);
        
        // Build execution plan
        const executionPlan = {
          resource: builder.resourceName,
          filters: builder.filters,
          sort: builder.sort,
          projection: builder.projection,
          limit: limit || builder.limit,
          offset: offset || builder.offset
        };
        
        if (explain) {
          return {
            success: true,
            queryId,
            executionPlan,
            estimatedCost: this.estimateQueryCost(executionPlan)
          };
        }
        
        // Execute query
        const results = await this.executeComplexQuery(resource, executionPlan);
        
        return {
          success: true,
          queryId,
          data: results,
          count: results.length,
          executionTime: Date.now() - builder.createdAt
        };
      }

      case 'queryAggregate': {
        const { resourceName, pipeline } = args;
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        const results = await this.executeAggregation(resource, pipeline);
        
        return {
          success: true,
          resourceName,
          pipeline,
          results
        };
      }
    }
  }

  // ========== STREAM OPERATIONS ==========
  async handleStreamOperation(name, args) {
    switch (name) {
      case 'streamCreate': {
        const { resourceName, streamId, type, batchSize, concurrency } = args;
        const id = streamId || `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        const processor = {
          id,
          resourceName,
          type,
          batchSize,
          concurrency,
          status: 'created',
          processed: 0,
          errors: 0,
          startTime: null
        };
        
        streamProcessors.set(id, processor);
        
        return {
          success: true,
          streamId: id,
          type,
          message: `Stream processor created for resource: ${resourceName}`
        };
      }

      case 'streamProcess': {
        const { streamId, transform, filter, progress } = args;
        const processor = streamProcessors.get(streamId);
        
        if (!processor) throw new Error(`Stream ${streamId} not found`);
        
        processor.status = 'processing';
        processor.startTime = Date.now();
        
        // Start async processing
        this.processStream(processor, transform, filter, progress);
        
        return {
          success: true,
          streamId,
          status: 'processing',
          message: 'Stream processing started'
        };
      }

      case 'streamStatus': {
        const { streamId } = args;
        const processor = streamProcessors.get(streamId);
        
        if (!processor) throw new Error(`Stream ${streamId} not found`);
        
        const runtime = processor.startTime ? Date.now() - processor.startTime : 0;
        
        return {
          success: true,
          streamId,
          status: processor.status,
          processed: processor.processed,
          errors: processor.errors,
          runtime,
          throughput: processor.processed / (runtime / 1000) || 0
        };
      }
    }
  }

  // ========== BATCH OPERATIONS ==========
  async handleBatchOperation(name, args) {
    switch (name) {
      case 'batchUpdate': {
        const { resourceName, filter, update, upsert, dryRun } = args;
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        // Find matching documents
        const matches = await this.findDocuments(resource, filter);
        
        if (dryRun) {
          return {
            success: true,
            dryRun: true,
            matchCount: matches.length,
            matches: matches.slice(0, 10),
            update
          };
        }
        
        // Apply updates
        const results = await this.applyBatchUpdate(resource, matches, update);
        
        return {
          success: true,
          updated: results.updated,
          failed: results.failed,
          errors: results.errors
        };
      }

      case 'batchDelete': {
        const { resourceName, filter, dryRun, confirm } = args;
        
        if (!confirm && !dryRun) {
          throw new Error('Confirmation required for batch delete. Set confirm: true');
        }
        
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        const matches = await this.findDocuments(resource, filter);
        
        if (dryRun) {
          return {
            success: true,
            dryRun: true,
            matchCount: matches.length,
            matches: matches.slice(0, 10)
          };
        }
        
        // Delete documents
        await resource.deleteMany(matches.map(doc => doc.id));
        
        return {
          success: true,
          deleted: matches.length,
          ids: matches.map(doc => doc.id)
        };
      }

      case 'transaction': {
        const { operations, rollbackOnError } = args;
        this.ensureConnected();
        
        const results = [];
        const rollback = [];
        
        try {
          for (const op of operations) {
            const result = await this.executeTransactionOp(op);
            results.push(result);
            
            if (rollbackOnError) {
              rollback.push(this.createRollbackOp(op, result));
            }
          }
          
          return {
            success: true,
            operations: operations.length,
            results
          };
          
        } catch (error) {
          if (rollbackOnError) {
            await this.executeRollback(rollback);
          }
          
          throw error;
        }
      }
    }
  }

  // ========== SCHEMA OPERATIONS ==========
  async handleSchemaOperation(name, args) {
    switch (name) {
      case 'schemaEvolve': {
        const { resourceName, newAttributes, migration, dryRun } = args;
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        const changes = this.analyzeSchemaChanges(resource.attributes, newAttributes);
        
        if (dryRun) {
          return {
            success: true,
            dryRun: true,
            changes,
            affectedDocuments: await resource.count()
          };
        }
        
        // Apply schema evolution
        await this.evolveSchema(resource, newAttributes, migration);
        
        return {
          success: true,
          resourceName,
          changes,
          migrated: true
        };
      }

      case 'schemaCompare': {
        const { source, target, detailed } = args;
        this.ensureConnected();
        
        const sourceResource = this.getResource(source);
        const targetResource = this.getResource(target);
        
        const comparison = this.compareSchemas(
          sourceResource.attributes,
          targetResource.attributes,
          detailed
        );
        
        return {
          success: true,
          source,
          target,
          comparison
        };
      }
    }
  }

  // ========== AI OPERATIONS ==========
  async handleAIOperation(name, args) {
    switch (name) {
      case 'aiSuggestSchema': {
        const { sampleData, resourceName, useCase } = args;
        
        const schema = this.inferSchemaFromData(sampleData);
        const optimizations = this.suggestSchemaOptimizations(schema, useCase);
        
        return {
          success: true,
          suggestedName: resourceName || this.suggestResourceName(sampleData),
          attributes: schema,
          optimizations,
          partitions: this.suggestPartitions(schema, useCase)
        };
      }

      case 'aiOptimizeQuery': {
        const { query, resourceName, goal } = args;
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        const optimized = this.optimizeQuery(query, resource, goal);
        const comparison = this.compareQueryPerformance(query, optimized);
        
        return {
          success: true,
          original: query,
          optimized,
          comparison,
          recommendations: this.getQueryRecommendations(resource, optimized)
        };
      }

      case 'aiAnalyzeUsage': {
        const { period, recommendations } = args;
        this.ensureConnected();
        
        const usage = await this.analyzeUsagePatterns(period);
        const insights = this.generateUsageInsights(usage);
        
        return {
          success: true,
          period,
          usage,
          insights,
          recommendations: recommendations ? this.generateRecommendations(usage) : null
        };
      }
    }
  }

  // ========== ENHANCED OPERATIONS ==========
  async handleEnhancedOperation(name, args) {
    switch (name) {
      case 'resourceInspect': {
        const { resourceName, includeStats, includeSample, sampleSize } = args;
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        const inspection = {
          name: resource.name,
          behavior: resource.behavior,
          attributes: resource.attributes,
          partitions: resource.config.partitions,
          timestamps: resource.config.timestamps,
          paranoid: resource.config.paranoid,
          hooks: Object.keys(resource.hooks || {})
        };
        
        if (includeStats) {
          inspection.stats = {
            count: await resource.count(),
            estimatedSize: await this.estimateResourceSize(resource),
            lastModified: await this.getLastModified(resource)
          };
        }
        
        if (includeSample) {
          inspection.sample = await resource.list({ limit: sampleSize });
        }
        
        return {
          success: true,
          resourceName,
          inspection
        };
      }

      case 'resourceValidate': {
        const { resourceName, data, strict } = args;
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        const validation = await resource.schema.validate(data, { strict });
        
        return {
          success: validation.valid,
          resourceName,
          data,
          validation
        };
      }

      case 'resourceAnalyze': {
        const { resourceName, analyzePartitions, analyzeBehavior, analyzeSize } = args;
        this.ensureConnected();
        const resource = this.getResource(resourceName);
        
        const analysis = {};
        
        if (analyzePartitions) {
          analysis.partitions = await this.analyzePartitions(resource);
        }
        
        if (analyzeBehavior) {
          analysis.behavior = this.analyzeBehavior(resource);
        }
        
        if (analyzeSize) {
          analysis.size = await this.analyzeSizeDistribution(resource);
        }
        
        return {
          success: true,
          resourceName,
          analysis,
          recommendations: this.generateAnalysisRecommendations(analysis)
        };
      }

      // Delegate to original handlers
      default:
        return await this.handleOriginalOperation(name, args);
    }
  }

  // ========== HELPER METHODS ==========
  
  async executeComplexQuery(resource, plan) {
    let results = await resource.list({ limit: 10000 });
    
    // Apply filters
    for (const filter of plan.filters) {
      results = this.applyFilter(results, filter);
    }
    
    // Apply sorting
    if (plan.sort.length > 0) {
      results = this.applySort(results, plan.sort);
    }
    
    // Apply projection
    if (plan.projection) {
      results = this.applyProjection(results, plan.projection);
    }
    
    // Apply pagination
    results = results.slice(plan.offset, plan.offset + plan.limit);
    
    return results;
  }

  applyFilter(data, filter) {
    return data.filter(item => {
      const value = item[filter.field];
      
      switch (filter.operator) {
        case 'eq': return value === filter.value;
        case 'ne': return value !== filter.value;
        case 'gt': return value > filter.value;
        case 'gte': return value >= filter.value;
        case 'lt': return value < filter.value;
        case 'lte': return value <= filter.value;
        case 'in': return filter.value.includes(value);
        case 'nin': return !filter.value.includes(value);
        case 'contains': return String(value).includes(filter.value);
        case 'startsWith': return String(value).startsWith(filter.value);
        case 'endsWith': return String(value).endsWith(filter.value);
        case 'regex': return new RegExp(filter.value).test(String(value));
        default: return true;
      }
    });
  }

  applySort(data, sortRules) {
    return data.sort((a, b) => {
      for (const rule of sortRules) {
        const aVal = a[rule.field];
        const bVal = b[rule.field];
        
        if (aVal < bVal) return rule.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return rule.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  applyProjection(data, projection) {
    return data.map(item => {
      if (projection.exclude) {
        const result = { ...item };
        projection.fields.forEach(field => delete result[field]);
        return result;
      } else {
        const result = {};
        projection.fields.forEach(field => {
          if (item[field] !== undefined) result[field] = item[field];
        });
        return result;
      }
    });
  }

  async findDocuments(resource, filter) {
    const all = await resource.list({ limit: 10000 });
    return this.applyFilter(all, filter);
  }

  inferSchemaFromData(sampleData) {
    const schema = {};
    
    for (const doc of sampleData) {
      for (const [key, value] of Object.entries(doc)) {
        if (!schema[key]) {
          schema[key] = this.inferFieldType(value);
        }
      }
    }
    
    return schema;
  }

  inferFieldType(value) {
    if (value === null || value === undefined) return 'any';
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
      if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) return 'email';
      if (/^https?:\/\//.test(value)) return 'url';
      return 'string';
    }
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'any';
  }

  getErrorSuggestion(error) {
    if (error.message.includes('not connected')) {
      return 'Use dbConnect tool first to establish database connection';
    }
    if (error.message.includes('not found')) {
      return 'Check resource name or use dbListResources to see available resources';
    }
    if (error.message.includes('validation')) {
      return 'Use resourceValidate to check data before insertion';
    }
    return null;
  }

  // Delegate methods
  ensureConnected() {
    if (!database || !database.isConnected()) {
      throw new Error('Database not connected. Use dbConnect tool first.');
    }
  }

  getResource(resourceName) {
    this.ensureConnected();
    
    if (!database.resources[resourceName]) {
      throw new Error(`Resource '${resourceName}' not found. Available: ${Object.keys(database.resources).join(', ')}`);
    }
    
    return database.resources[resourceName];
  }

  getOriginalTools() {
    // Return original tool definitions from server.js
    return [];
  }

  async handleOriginalOperation(name, args) {
    // Delegate to original handler implementation
    throw new Error(`Tool ${name} not implemented in enhanced server`);
  }

  setupTransport() {
    const transport = process.argv.includes('--transport=sse') || process.env.MCP_TRANSPORT === 'sse'
      ? new SSEServerTransport('/sse', process.env.MCP_SERVER_HOST || '0.0.0.0', parseInt(process.env.MCP_SERVER_PORT || '8000'))
      : new StdioServerTransport();

    this.server.connect(transport);
    
    if (transport instanceof SSEServerTransport) {
      const host = process.env.MCP_SERVER_HOST || '0.0.0.0';
      const port = process.env.MCP_SERVER_PORT || '8000';
      
      console.log(`S3DB MCP Enhanced Server v${SERVER_VERSION}`);
      console.log(`Running on http://${host}:${port}/sse`);
    }
  }
}

// Main execution
async function main() {
  const server = new S3dbMCPEnhancedServer();

  process.on('SIGINT', async () => {
    console.log('\nShutting down S3DB MCP Enhanced Server...');
    if (database && database.isConnected()) {
      await database.disconnect();
    }
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { S3dbMCPEnhancedServer };