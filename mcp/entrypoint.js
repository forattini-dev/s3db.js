import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { S3db, CachePlugin, CostsPlugin } from '../src/index.js';
import { FilesystemCache } from '../src/plugins/cache/filesystem-cache.class.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import express from 'express';
import { createConnectionHandlers, connectionTools } from './tools/connection.js';
import { createResourceManagementHandlers, resourceManagementTools } from './tools/resources.js';
import { createCrudHandlers, crudTools } from './tools/crud.js';
import { createDebuggingHandlers, debuggingTools } from './tools/debugging.js';
import { createQueryHandlers, queryTools } from './tools/query.js';
import { createPartitionHandlers, partitionTools } from './tools/partitions.js';
import { createBulkHandlers, bulkTools } from './tools/bulk.js';
import { createExportImportHandlers, exportImportTools } from './tools/export-import.js';
import { createStatsHandlers, statsTools } from './tools/stats.js';
import { createDocsSearchHandlers, docsSearchTools, preloadSearch } from './tools/docs-search.js';
import { createDocumentationHandlers, documentationTools } from './tools/documentation.js';
// Load environment variables
config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Global database instance
let database = null;
// Server configuration
const SERVER_NAME = 's3db-mcp';
const SERVER_VERSION = '1.0.0';
export class S3dbMCPServer {
    server;
    allToolHandlers;
    constructor() {
        this.server = new Server({
            name: SERVER_NAME,
            version: SERVER_VERSION,
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.allToolHandlers = this.setupToolHandlers();
        this.setupTransport();
    }
    setupToolHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    ...docsSearchTools,
                    ...connectionTools,
                    ...resourceManagementTools,
                    ...crudTools,
                    ...debuggingTools,
                    ...queryTools,
                    ...partitionTools,
                    ...bulkTools,
                    ...exportImportTools,
                    ...statsTools,
                    ...documentationTools, // Legacy
                ]
            };
        });
        const handlers = {
            ...createConnectionHandlers(this),
            ...createResourceManagementHandlers(this),
            ...createCrudHandlers(this),
            ...createDebuggingHandlers(this),
            ...createQueryHandlers(this),
            ...createPartitionHandlers(this),
            ...createBulkHandlers(this),
            ...createExportImportHandlers(this),
            ...createStatsHandlers(this),
            ...createDocsSearchHandlers(this),
            ...createDocumentationHandlers(this), // Legacy
        };
        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                const handler = handlers[name];
                if (!handler) {
                    throw new Error(`Unknown tool: ${name}`);
                }
                const result = await handler(args, database, { S3db, CachePlugin, CostsPlugin, FilesystemCache });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            catch (error) {
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
        return handlers;
    }
    setupTransport() {
        const useHttp = process.argv.includes('--transport=http') || process.env.MCP_TRANSPORT === 'http';
        if (useHttp) {
            // Setup Express server for Streamable HTTP transport
            this.setupHttpTransport();
        }
        else {
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
            }
            catch (error) {
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
        }).on('error', (error) => {
            console.error('Server error:', error);
            process.exit(1);
        });
    }
    // Helper methods for tool handlers
    ensureConnected(db) {
        if (!db || !db.isConnected()) {
            throw new Error('Database not connected. Use dbConnect tool first.');
        }
    }
    getResource(db, resourceName) {
        this.ensureConnected(db);
        if (!db.resources[resourceName]) {
            throw new Error(`Resource '${resourceName}' not found. Available resources: ${Object.keys(db.resources).join(', ')}`);
        }
        return db.resources[resourceName];
    }
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
    _generateCacheKeyHint(resourceName, action, params = {}) {
        const keyParts = [`resource=${resourceName}`, `action=${action}`];
        if (params.partition && params.partitionValues) {
            keyParts.push(`partition=${params.partition}`);
            const sortedValues = Object.entries(params.partitionValues)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => `${key}=${value}`)
                .join('&');
            if (sortedValues) {
                keyParts.push(`values=${sortedValues}`);
            }
        }
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
    _generateCacheInvalidationPatterns(resource, data, action = 'write') {
        const patterns = [];
        const resourceName = resource.name;
        patterns.push(`resource=${resourceName}/action=list`);
        patterns.push(`resource=${resourceName}/action=count`);
        patterns.push(`resource=${resourceName}/action=getAll`);
        const partitionInfo = this._extractPartitionInfo(resource, data);
        if (partitionInfo) {
            for (const [partitionName, partitionValues] of Object.entries(partitionInfo)) {
                const sortedValues = Object.entries(partitionValues)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => `${key}=${value}`)
                    .join('&');
                if (sortedValues) {
                    patterns.push(`resource=${resourceName}/action=list/partition=${partitionName}/values=${sortedValues}`);
                    patterns.push(`resource=${resourceName}/action=count/partition=${partitionName}/values=${sortedValues}`);
                    patterns.push(`resource=${resourceName}/action=listIds/partition=${partitionName}/values=${sortedValues}`);
                }
            }
        }
        if (data.id) {
            patterns.push(`resource=${resourceName}/action=get/params=id=${data.id}`);
            patterns.push(`resource=${resourceName}/action=exists/params=id=${data.id}`);
        }
        return patterns;
    }
}
// Handle command line arguments
export function parseArgs() {
    const args = {
        transport: 'stdio',
        host: '0.0.0.0',
        port: 17500
    };
    process.argv.forEach((arg, index) => {
        if (arg.startsWith('--transport=')) {
            args.transport = arg.split('=')[1];
        }
        else if (arg === '--transport' && process.argv[index + 1]) {
            args.transport = process.argv[index + 1];
        }
        else if (arg.startsWith('--host=')) {
            args.host = arg.split('=')[1];
        }
        else if (arg.startsWith('--port=')) {
            args.port = parseInt(arg.split('=')[1]);
        }
    });
    return args;
}
// Main execution function
export async function startServer(args) {
    const finalArgs = args || parseArgs();
    // Set environment variables from arguments
    if (finalArgs.transport)
        process.env.MCP_TRANSPORT = finalArgs.transport;
    if (finalArgs.host)
        process.env.MCP_SERVER_HOST = finalArgs.host;
    if (finalArgs.port)
        process.env.MCP_SERVER_PORT = finalArgs.port.toString();
    const server = new S3dbMCPServer();
    // Preload search indexes for faster first query
    await preloadSearch();
    // Handle graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down S3DB MCP Server...');
        if (database && database.isConnected()) {
            await database.disconnect();
        }
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    console.log(`S3DB MCP Server v${SERVER_VERSION} started`);
    console.log(`Transport: ${finalArgs.transport}`);
    if (finalArgs.transport === 'http') {
        console.log(`URL: http://${finalArgs.host}:${finalArgs.port}/mcp`);
    }
}
// Start the server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    startServer().catch(console.error);
}
//# sourceMappingURL=entrypoint.js.map