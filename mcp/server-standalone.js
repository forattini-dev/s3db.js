#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const express = require('express');
const cors = require('cors');
const { S3db } = require('../dist/s3db.cjs.js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Use __dirname instead of import.meta.url for compatibility
const packageJson = require('../package.json');

const PORT = process.env.S3DB_MCP_PORT || 8000;

class S3DBMCPServer {
  constructor() {
    this.server = new Server({
      name: 's3db-mcp-server',
      version: packageJson.version || '1.0.0'
    }, {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {}
      }
    });

    this.databases = new Map();
    this.setupHandlers();
  }

  async getDatabase(connectionString) {
    if (!this.databases.has(connectionString)) {
      const db = new S3db({ connectionString });
      await db.init();
      this.databases.set(connectionString, db);
    }
    return this.databases.get(connectionString);
  }

  setupHandlers() {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [
        {
          uri: 's3db://resources',
          name: 'S3DB Resources',
          description: 'List all resources in the S3DB database',
          mimeType: 'application/json'
        }
      ];

      // Add dynamic resources if we have a default connection
      const defaultConnection = process.env.S3DB_CONNECTION;
      if (defaultConnection) {
        try {
          const db = await this.getDatabase(defaultConnection);
          const dbResources = await db.listResources();
          
          dbResources.forEach(resource => {
            resources.push({
              uri: `s3db://resource/${resource.name}`,
              name: resource.name,
              description: `Access ${resource.name} resource`,
              mimeType: 'application/json'
            });
          });
        } catch (error) {
          console.error('Failed to list resources:', error);
        }
      }

      return { resources };
    });

    // Read resource data
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      const defaultConnection = process.env.S3DB_CONNECTION;
      
      if (!defaultConnection) {
        throw new Error('No S3DB_CONNECTION environment variable set');
      }

      const db = await this.getDatabase(defaultConnection);

      if (uri === 's3db://resources') {
        const resources = await db.listResources();
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(resources, null, 2)
          }]
        };
      }

      // Handle specific resource URIs
      const resourceMatch = uri.match(/^s3db:\/\/resource\/(.+)$/);
      if (resourceMatch) {
        const resourceName = resourceMatch[1];
        const resource = await db.resource(resourceName);
        const data = await resource.list({ limit: 100 });
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2)
          }]
        };
      }

      throw new Error(`Unknown resource URI: ${uri}`);
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 's3db_query',
            description: 'Query S3DB resources',
            inputSchema: {
              type: 'object',
              properties: {
                connection: { type: 'string', description: 'S3DB connection string (optional, uses env var if not provided)' },
                resource: { type: 'string', description: 'Resource name' },
                query: { type: 'object', description: 'Query parameters' }
              },
              required: ['resource']
            }
          },
          {
            name: 's3db_insert',
            description: 'Insert data into S3DB resource',
            inputSchema: {
              type: 'object',
              properties: {
                connection: { type: 'string', description: 'S3DB connection string (optional)' },
                resource: { type: 'string', description: 'Resource name' },
                data: { type: 'object', description: 'Data to insert' }
              },
              required: ['resource', 'data']
            }
          },
          {
            name: 's3db_update',
            description: 'Update data in S3DB resource',
            inputSchema: {
              type: 'object',
              properties: {
                connection: { type: 'string', description: 'S3DB connection string (optional)' },
                resource: { type: 'string', description: 'Resource name' },
                id: { type: 'string', description: 'Record ID' },
                data: { type: 'object', description: 'Data to update' }
              },
              required: ['resource', 'id', 'data']
            }
          },
          {
            name: 's3db_delete',
            description: 'Delete data from S3DB resource',
            inputSchema: {
              type: 'object',
              properties: {
                connection: { type: 'string', description: 'S3DB connection string (optional)' },
                resource: { type: 'string', description: 'Resource name' },
                id: { type: 'string', description: 'Record ID' }
              },
              required: ['resource', 'id']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const connection = args.connection || process.env.S3DB_CONNECTION;
      
      if (!connection) {
        throw new Error('No connection string provided and S3DB_CONNECTION not set');
      }

      const db = await this.getDatabase(connection);

      switch (name) {
        case 's3db_query': {
          const resource = await db.resource(args.resource);
          const results = await resource.list(args.query || {});
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }]
          };
        }

        case 's3db_insert': {
          const resource = await db.resource(args.resource);
          const result = await resource.insert(args.data);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }

        case 's3db_update': {
          const resource = await db.resource(args.resource);
          const result = await resource.update(args.id, args.data);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }

        case 's3db_delete': {
          const resource = await db.resource(args.resource);
          await resource.delete(args.id);
          return {
            content: [{
              type: 'text',
              text: `Deleted record ${args.id} from ${args.resource}`
            }]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 's3db_setup',
            description: 'Setup S3DB connection and initialize database',
            arguments: [
              {
                name: 'bucket',
                description: 'S3 bucket name',
                required: true
              }
            ]
          }
        ]
      };
    });

    // Get prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 's3db_setup') {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Help me set up S3DB with bucket: ${args.bucket}`
              }
            }
          ]
        };
      }

      throw new Error(`Unknown prompt: ${name}`);
    });
  }

  async start(transport) {
    const args = process.argv.slice(2);
    const transportType = args.includes('--transport=sse') ? 'sse' : 
                         args.includes('--transport=stdio') ? 'stdio' : 
                         transport || 'stdio';

    if (transportType === 'sse') {
      console.log(`Starting S3DB MCP Server with SSE transport on port ${PORT}...`);
      
      const app = express();
      app.use(cors());

      const sseTransport = new SSEServerTransport('/sse', app);
      await this.server.connect(sseTransport);

      app.listen(PORT, () => {
        console.log(`S3DB MCP Server running at http://localhost:${PORT}`);
        console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
      });
    } else {
      console.error('Starting S3DB MCP Server with stdio transport...');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('S3DB MCP Server running on stdio');
    }
  }
}

// Start the server
const server = new S3DBMCPServer();
server.start().catch(console.error);