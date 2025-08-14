#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';

// Import handlers
import { ConnectionHandler } from './lib/handlers/connection-handler.js';
import { ResourceHandler } from './lib/handlers/resource-handler.js';
import { QueryHandler } from './lib/handlers/query-handler.js';
import { ToolRegistry } from './lib/tool-registry.js';

// Import tool definitions
import { connectionTools } from './lib/tools/connection-tools.js';
import { resourceTools } from './lib/tools/resource-tools.js';
import { queryTools } from './lib/tools/query-tools.js';

// Load environment variables
config();

/**
 * S3DB MCP Server v2 - Clean Architecture
 */
class S3dbMCPServer {
  constructor() {
    this.database = null;
    this.registry = new ToolRegistry();
    this.handlers = {};
    
    this.server = new Server(
      {
        name: 's3db-mcp-v2',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.initialize();
  }

  /**
   * Initialize server components
   */
  initialize() {
    this.setupHandlers();
    this.registerTools();
    this.setupMiddleware();
    this.setupRequestHandlers();
    this.setupTransport();
  }

  /**
   * Setup handler instances
   */
  setupHandlers() {
    this.handlers = {
      connection: new ConnectionHandler(this.database),
      resource: new ResourceHandler(this.database),
      query: new QueryHandler(this.database)
    };
    
    // Update database reference when it changes
    this.on('database:connected', (database) => {
      this.database = database;
      Object.values(this.handlers).forEach(handler => {
        handler.database = database;
      });
    });
  }

  /**
   * Register all tools
   */
  registerTools() {
    // Register connection tools
    this.registerToolCategory('connection', connectionTools, this.handlers.connection);
    
    // Register resource tools
    this.registerToolCategory('resource', resourceTools, this.handlers.resource);
    
    // Register query tools
    this.registerToolCategory('query', queryTools, this.handlers.query);
  }

  /**
   * Register tools for a category
   */
  registerToolCategory(category, tools, handler) {
    for (const tool of tools) {
      this.registry.registerTool(tool.name, tool, async (args) => {
        return handler.execute(handler[tool.method], args);
      });
    }
  }

  /**
   * Setup middleware
   */
  setupMiddleware() {
    // Logging middleware
    this.registry.use(async (args, next, context) => {
      const start = Date.now();
      console.log(`[MCP] Executing tool: ${context.toolName}`);
      
      try {
        const result = await next();
        const duration = Date.now() - start;
        console.log(`[MCP] Tool ${context.toolName} completed in ${duration}ms`);
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        console.error(`[MCP] Tool ${context.toolName} failed after ${duration}ms:`, error.message);
        throw error;
      }
    });
    
    // Validation middleware
    this.registry.use(async (args, next, context) => {
      const validation = this.registry.validateArgs(context.toolName, args);
      
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      
      return next();
    });
    
    // Rate limiting middleware (example)
    if (process.env.MCP_RATE_LIMIT) {
      const rateLimits = new Map();
      const limit = parseInt(process.env.MCP_RATE_LIMIT) || 100;
      
      this.registry.use(async (args, next, context) => {
        const key = context.toolName;
        const now = Date.now();
        
        if (!rateLimits.has(key)) {
          rateLimits.set(key, { count: 0, resetAt: now + 60000 });
        }
        
        const rateLimit = rateLimits.get(key);
        
        if (now > rateLimit.resetAt) {
          rateLimit.count = 0;
          rateLimit.resetAt = now + 60000;
        }
        
        if (rateLimit.count >= limit) {
          throw new Error(`Rate limit exceeded for ${key}. Try again later.`);
        }
        
        rateLimit.count++;
        return next();
      });
    }
  }

  /**
   * Setup MCP request handlers
   */
  setupRequestHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.registry.listTools()
      };
    });
    
    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        // Special handling for connection
        if (name === 'dbConnect') {
          const result = await this.handleConnect(args);
          return this.formatResponse(result);
        }
        
        // Execute tool through registry
        const result = await this.registry.executeTool(name, args);
        return this.formatResponse(result);
        
      } catch (error) {
        return this.formatError(error);
      }
    });
  }

  /**
   * Special handler for database connection
   */
  async handleConnect(args) {
    const result = await this.handlers.connection.connect(args);
    
    if (result.success && result.data?.connected) {
      this.database = this.handlers.connection.database;
      this.emit('database:connected', this.database);
    }
    
    return result;
  }

  /**
   * Setup transport
   */
  setupTransport() {
    const isSSE = process.argv.includes('--transport=sse') || 
                  process.env.MCP_TRANSPORT === 'sse';
    
    const transport = isSSE
      ? new SSEServerTransport(
          '/sse',
          process.env.MCP_SERVER_HOST || '0.0.0.0',
          parseInt(process.env.MCP_SERVER_PORT || '8000')
        )
      : new StdioServerTransport();
    
    this.server.connect(transport);
    
    if (isSSE) {
      const host = process.env.MCP_SERVER_HOST || '0.0.0.0';
      const port = process.env.MCP_SERVER_PORT || '8000';
      
      console.log('╔════════════════════════════════════════╗');
      console.log('║     S3DB MCP Server v2.0.0            ║');
      console.log('╠════════════════════════════════════════╣');
      console.log(`║ Transport: SSE                         ║`);
      console.log(`║ URL: http://${host}:${port}/sse`);
      console.log('║                                        ║');
      console.log('║ Features:                              ║');
      console.log('║ • Modular architecture                 ║');
      console.log('║ • Advanced query builder               ║');
      console.log('║ • Middleware support                   ║');
      console.log('║ • Clean error handling                 ║');
      console.log('╚════════════════════════════════════════╝');
      
      this.setupHealthCheck(host, port);
    }
  }

  /**
   * Setup health check endpoint
   */
  setupHealthCheck(host, port) {
    import('http').then(({ createServer }) => {
      const healthServer = createServer((req, res) => {
        if (req.url === '/health') {
          const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '2.0.0',
            database: {
              connected: this.database?.isConnected() || false,
              bucket: this.database?.bucket || null,
              resourceCount: Object.keys(this.database?.resources || {}).length
            },
            tools: {
              total: this.registry.listTools().length,
              categories: Object.entries(this.registry.getToolsByCategory())
                .map(([cat, tools]) => ({ category: cat, count: tools.length }))
            },
            memory: process.memoryUsage()
          };
          
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify(health, null, 2));
        } else if (req.url === '/tools') {
          const tools = this.registry.getToolsByCategory();
          
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify(tools, null, 2));
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
      
      const healthPort = parseInt(port) + 1;
      healthServer.listen(healthPort, host, () => {
        console.log(`║ Health: http://${host}:${healthPort}/health`);
        console.log(`║ Tools: http://${host}:${healthPort}/tools`);
        console.log('╚════════════════════════════════════════╝');
      });
    }).catch(console.warn);
  }

  /**
   * Format successful response
   */
  formatResponse(result) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * Format error response
   */
  formatError(error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: {
              message: error.message,
              type: error.constructor.name,
              stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }
          }, null, 2)
        }
      ],
      isError: true
    };
  }

  /**
   * Event emitter functionality
   */
  emit(event, data) {
    // Simple event emitter (in production, use EventEmitter)
    if (event === 'database:connected') {
      Object.values(this.handlers).forEach(handler => {
        handler.database = data;
      });
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('\n[MCP] Shutting down server...');
    
    if (this.database?.isConnected()) {
      await this.database.disconnect();
    }
    
    console.log('[MCP] Server shut down successfully');
    process.exit(0);
  }
}

/**
 * Main execution
 */
async function main() {
  const server = new S3dbMCPServer();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => server.shutdown());
  process.on('SIGTERM', () => server.shutdown());
  
  // Handle errors
  process.on('uncaughtException', (error) => {
    console.error('[MCP] Uncaught exception:', error);
    server.shutdown();
  });
  
  process.on('unhandledRejection', (error) => {
    console.error('[MCP] Unhandled rejection:', error);
    server.shutdown();
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { S3dbMCPServer };