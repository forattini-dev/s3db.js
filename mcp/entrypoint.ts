import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { S3db, CachePlugin, CostsPlugin } from 's3db.js';
import { FilesystemCache } from 's3db.js/plugins/cache/filesystem-cache.class';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { resolveConfig } from './config.js';
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
import { resourceTemplates, listResources, readResource } from './resources.js';
import { prompts, getPrompt } from './prompts.js';
import type { TransportArgs } from './types/index.js';

config({ path: join(process.cwd(), '.env'), quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VERSION = '__INJECT_VERSION__';

// Global database instance
let database: S3db | null = null;

// Server configuration
const SERVER_NAME = 's3db-mcp';
const SERVER_VERSION = VERSION !== '__INJECT_VERSION__' ? VERSION : '0.0.0-dev';

const SERVER_INSTRUCTIONS = `s3db.js v${SERVER_VERSION} — S3-based document database. Turns AWS S3 (or MinIO) into a queryable database.

Auto-connects on startup via S3DB_CONNECTION_STRING env var. All resources are restored — just start using tools.

## Tools (all you need)

**Read:** resourceGet (by ID), resourceList (browse/filter), resourcePage (paginate), resourceQuery (filter by values), resourceCount
**Write:** resourceInsert, resourceUpdate, resourceDelete
**Admin:** dbListResources, dbCreateResource, dbConnect (only if not auto-connected), dbStatus
**Docs:** s3dbSearchDocs (search all documentation)

## Partitions (critical for performance)

Partitions turn O(n) scans into O(1) lookups. Most read tools accept \`partition\` + \`partitionValues\` params.

Example: resource "orders" has partition "by-status" on field "status".
- \`resourceList({ resourceName: "orders", partition: "by-status", partitionValues: { status: "pending" } })\` — O(1)
- \`resourceList({ resourceName: "orders" })\` — O(n) full scan

Use \`s3db://resource/{name}\` to see which partitions a resource has.

## Pagination

- \`resourcePage\` with cursor: best for sequential navigation. Returns \`nextCursor\`.
- \`resourcePage\` with page number: for random access (page=1, page=5).
- \`resourceList\` with limit/offset: simple browsing, but offset is slow on large datasets.

## Docs (s3db:// resources)

- \`s3db://resource/{name}\` — live schema, partitions, behavior, usage examples
- \`s3db://overview\` — full capabilities overview
- \`s3db://best-practices\` — behaviors, partitions, performance guide
- \`s3db://plugin/{name}\` — plugin docs (cache, api, audit, ttl, vector, etc.)
- \`s3db://core/security\` — **security config reference** (passphrase, pepper, bcrypt, argon2, passwords)
- \`s3db://guide/{topic}\` — guides (getting-started, performance, testing, security)
- \`s3db://field-type/{type}\` — field type reference (string, password, secret, embedding, ip4)

## Prompts (ask for help)

- \`create_resource\` — generate resource definition with schema, partitions, behavior
- \`setup_plugin\` — configure any plugin with best practices
- \`create_partition_strategy\` — design partitions for your query patterns
- \`explain_behavior\` / \`explain_partitions\` — learn core concepts
- \`debug_query_performance\` / \`optimize_costs\` — troubleshoot issues
- \`migrate_from_mongodb\` / \`migrate_from_dynamodb\` / \`migrate_from_prisma\` — migration guides
`;

export class S3dbMCPServer {
  private server: Server;
  private allToolHandlers: Record<string, Function>;
  private httpTransportServer: ReturnType<typeof createHttpServer> | null;

  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: false, listChanged: true },
          prompts: { listChanged: true },
          logging: {},
        },
        instructions: SERVER_INSTRUCTIONS,
      }
    );

    this.allToolHandlers = this.setupToolHandlers();
    this.httpTransportServer = null;
    this.setupResourceHandlers();
    this.setupPromptHandlers();
    this.setupTransport();
  }

  setupToolHandlers(): Record<string, Function> {
    // List available tools — keep it simple: only essential tools are advertised.
    // All handlers remain registered so advanced tools still work if called directly.
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const essentialCrud = crudTools.filter(t =>
        ['resourceGet', 'resourceList', 'resourcePage', 'resourceCount',
         'resourceInsert', 'resourceInsertMany', 'resourceUpdate', 'resourceDelete'].includes(t.name)
      );
      const essentialQuery = queryTools.filter(t => t.name === 'resourceQuery');
      const essentialConnection = connectionTools.filter(t =>
        ['dbConnect', 'dbStatus'].includes(t.name)
      );
      const essentialDocs = docsSearchTools.filter(t =>
        ['s3dbSearchDocs'].includes(t.name)
      );

      return {
        tools: [
          ...essentialCrud,
          ...essentialQuery,
          ...resourceManagementTools,
          ...essentialConnection,
          ...(essentialDocs.length > 0 ? essentialDocs : docsSearchTools.slice(0, 2)),
        ]
      };
    });

    const handlers: Record<string, Function> = {
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

        // Update global database state from connection handlers
        if (result?.database instanceof S3db) {
          database = result.database;
          delete result.database;
        }
        if (result?.clearDatabase) {
          database = null;
          delete result.clearDatabase;
        }

        let text = JSON.stringify(result, null, 2);

        // Safety guard: truncate responses that would exceed MCP token limits (~200KB)
        const MAX_RESPONSE_SIZE = 200_000;
        if (text.length > MAX_RESPONSE_SIZE) {
          const truncated = this.truncateResult(result, MAX_RESPONSE_SIZE);
          text = JSON.stringify(truncated, null, 2);
        }

        return {
          content: [{ type: 'text', text }]
        };

      } catch (error: any) {
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

  setupResourceHandlers(): void {
    // List available resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return {
        resourceTemplates: resourceTemplates.map((t) => ({
          uriTemplate: t.uriTemplate,
          name: t.name,
          description: t.description,
          mimeType: t.mimeType || 'text/plain',
        })),
      };
    });

    // List concrete resources (static resources available without parameters)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: listResources(),
      };
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      const content = readResource(uri, database);
      if (!content) {
        throw new Error(`Resource not found: ${uri}`);
      }

      return {
        contents: [content],
      };
    });
  }

  setupPromptHandlers(): void {
    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: prompts.map((p) => ({
          name: p.name,
          description: p.description,
          arguments: p.arguments?.map((a) => ({
            name: a.name,
            description: a.description,
            required: a.required,
          })),
        })),
      };
    });

    // Get a specific prompt with arguments
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const result = getPrompt(name, args || {});
      if (!result) {
        throw new Error(`Prompt not found: ${name}`);
      }

      // Return in MCP SDK expected format
      return {
        description: result.description,
        messages: result.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };
    });
  }

  setupTransport(): void {
    const useHttp = process.argv.includes('--transport=http') || process.env.MCP_TRANSPORT === 'http';

    if (useHttp) {
      void this.setupHttpTransport();
    } else {
      // Use stdio transport (default)
      const transport = new StdioServerTransport();
      this.server.connect(transport);
    }
  }

  private _setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  }

  private async _readJsonBody(req: IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
      return undefined;
    }

    const body = Buffer.concat(chunks).toString('utf-8').trim();
    if (!body) {
      return undefined;
    }

    return JSON.parse(body);
  }

  async setupHttpTransport(): Promise<void> {
    const host = process.env.MCP_SERVER_HOST || '0.0.0.0';
    const port = parseInt(process.env.MCP_SERVER_PORT || '17500');

    this.httpTransportServer = createHttpServer(async (req, res) => {
      this._setCorsHeaders(res);

      const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST' && url.pathname === '/mcp') {
        try {
          const body = await this._readJsonBody(req);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
          });

          res.on('close', () => {
            transport.close();
          });

          await this.server.connect(transport);
          await transport.handleRequest(req, res, body);
          return;
        } catch (error) {
          console.error('Error handling MCP request:', error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error'
              },
              id: null
            }));
          }
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/mcp') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'SSE streaming not supported in stateless mode. Use POST /mcp for JSON responses.'
          },
          id: null
        }));
        return;
      }

      if (req.method === 'DELETE' && url.pathname === '/mcp') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
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

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthStatus));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    this.httpTransportServer.listen(port, host, () => {
      console.log(`S3DB MCP Server running on http://${host}:${port}/mcp`);
      console.log(`Health check endpoint: http://${host}:${port}/health`);
    }).on('error', (error: Error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  }

  // Helper methods for tool handlers
  ensureConnected(db: S3db): void {
    if (!db || !db.isConnected()) {
      throw new Error('Database not connected. Set S3DB_CONNECTION_STRING env var for auto-connect, or use dbConnect tool.');
    }
  }

  getResource(db: S3db, resourceName: string): any {
    this.ensureConnected(db);

    if (!db.resources[resourceName]) {
      throw new Error(`Resource '${resourceName}' not found. Available resources: ${Object.keys(db.resources).join(', ')}`);
    }

    return db.resources[resourceName];
  }

  truncateResult(result: any, maxSize: number): any {
    // If result has a data array, truncate the array until it fits
    if (result && Array.isArray(result.data) && result.data.length > 0) {
      const withoutData = { ...result, data: [] };
      const overhead = JSON.stringify(withoutData, null, 2).length + 100;
      const budget = maxSize - overhead;

      const truncatedData: any[] = [];
      let currentSize = 0;
      for (const item of result.data) {
        const itemSize = JSON.stringify(item).length + 10;
        if (currentSize + itemSize > budget) break;
        truncatedData.push(item);
        currentSize += itemSize;
      }

      return {
        ...result,
        data: truncatedData,
        count: truncatedData.length,
        _truncated: {
          original: result.data.length,
          returned: truncatedData.length,
          reason: `Response exceeded ${Math.round(maxSize / 1000)}KB limit. Use pagination (resourcePage) or add partition filters to reduce result size.`
        }
      };
    }

    // If result has a resources array, same logic
    if (result && Array.isArray(result.resources) && result.resources.length > 0) {
      const withoutResources = { ...result, resources: [] };
      const overhead = JSON.stringify(withoutResources, null, 2).length + 100;
      const budget = maxSize - overhead;

      const truncated: any[] = [];
      let currentSize = 0;
      for (const item of result.resources) {
        const itemSize = JSON.stringify(item).length + 10;
        if (currentSize + itemSize > budget) break;
        truncated.push(item);
        currentSize += itemSize;
      }

      return {
        ...result,
        resources: truncated,
        count: truncated.length,
        _truncated: {
          original: result.resources.length,
          returned: truncated.length,
          reason: `Response exceeded ${Math.round(maxSize / 1000)}KB limit.`
        }
      };
    }

    // Fallback: just stringify and hard-cut
    const text = JSON.stringify(result, null, 2);
    return {
      _truncated: {
        reason: `Response exceeded ${Math.round(maxSize / 1000)}KB limit (${Math.round(text.length / 1000)}KB). Use pagination or filters to reduce result size.`
      },
      preview: text.slice(0, maxSize - 500)
    };
  }

  _extractPartitionInfo(resource: any, data: any): Record<string, any> | null {
    if (!resource || !data || !resource.config?.partitions) {
      return null;
    }
    const partitionInfo: Record<string, any> = {};
    const partitions = resource.config.partitions;
    for (const [partitionName, partitionConfig] of Object.entries(partitions)) {
      if ((partitionConfig as any).fields) {
        const partitionValues: Record<string, any> = {};
        let hasValues = false;
        for (const fieldName of Object.keys((partitionConfig as any).fields)) {
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

  _generateCacheKeyHint(resourceName: string, action: string, params: Record<string, any> = {}): string {
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

  _generateCacheInvalidationPatterns(resource: any, data: any, action: string = 'write'): string[] {
    const patterns: string[] = [];
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
export function parseArgs(): TransportArgs {
  const args: TransportArgs = {
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

// Main execution function
export async function startServer(args?: TransportArgs): Promise<void> {
  const finalArgs = args || parseArgs();
  const isStdio = !finalArgs.transport || finalArgs.transport === 'stdio';
  const log = isStdio
    ? (...args: unknown[]) => process.stderr.write(args.join(' ') + '\n')
    : console.log;

  // Set environment variables from arguments
  if (finalArgs.transport) process.env.MCP_TRANSPORT = finalArgs.transport;
  if (finalArgs.host) process.env.MCP_SERVER_HOST = finalArgs.host;
  if (finalArgs.port) process.env.MCP_SERVER_PORT = finalArgs.port.toString();

  const server = new S3dbMCPServer();

  // Preload search indexes for faster first query
  await preloadSearch();

  // Resolve config: defaults < config file < env vars
  const mcpConfig = resolveConfig();

  // Auto-connect if connection string is available
  if (mcpConfig.connectionString) {
    try {
      const plugins = [];

      if (mcpConfig.costs?.enabled !== false) {
        plugins.push(CostsPlugin);
      }

      if (mcpConfig.cache?.enabled !== false) {
        const cacheConf = mcpConfig.cache || {};
        if (cacheConf.driver === 'filesystem') {
          plugins.push(new CachePlugin({
            includePartitions: true,
            driver: new FilesystemCache({
              directory: cacheConf.directory || './cache',
              prefix: cacheConf.prefix || 's3db',
              ttl: cacheConf.ttl || 300000,
              enableCompression: true,
              enableCleanup: true,
              cleanupInterval: 300000,
              createDirectory: true,
            }),
          }));
        } else {
          plugins.push(new CachePlugin({
            driver: 'memory',
            includePartitions: true,
            memoryOptions: {
              maxSize: cacheConf.maxSize || 1000,
              ttl: cacheConf.ttl || 300000,
            },
          }));
        }
      }

      database = new S3db({
        connectionString: mcpConfig.connectionString,
        verbose: mcpConfig.verbose,
        parallelism: mcpConfig.parallelism,
        security: mcpConfig.security,
        versioningEnabled: mcpConfig.versioningEnabled,
        plugins,
      });
      await database.connect();

      const resourceCount = Object.keys(database.resources || {}).length;
      log(`Auto-connected to ${database.bucket} (${resourceCount} resources restored)`);
    } catch (err: any) {
      log(`Auto-connect failed: ${err.message}. Use dbConnect tool manually.`);
      database = null;
    }
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    log('Shutting down S3DB MCP Server...');
    if (database && database.isConnected()) {
      await database.disconnect();
    }
    if ((server as any).httpTransportServer) {
      await new Promise<void>((resolve) => {
        (server as any).httpTransportServer.close(() => resolve());
      });
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log(`S3DB MCP Server v${SERVER_VERSION} started`);
  log(`Transport: ${finalArgs.transport || 'stdio'}`);
  if (finalArgs.transport === 'http') {
    log(`URL: http://${finalArgs.host}:${finalArgs.port}/mcp`);
  }
}

// Start the server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(console.error);
}
