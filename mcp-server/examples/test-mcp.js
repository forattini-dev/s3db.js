#!/usr/bin/env node

/**
 * S3DB MCP Server Test Script
 * 
 * This script demonstrates how to test the S3DB MCP server functionality
 * by making direct tool calls and showing the expected responses.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Mock MCP client for testing
class MockMCPClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.tools = [];
  }

  async initialize() {
    console.log('🔌 Initializing MCP Client...');
    console.log(`📡 Server URL: ${this.serverUrl}`);
    
    // In a real implementation, this would connect to the MCP server
    // and fetch the available tools
    this.tools = [
      'dbConnect', 'dbDisconnect', 'dbStatus', 'dbCreateResource', 'dbListResources',
      'resourceInsert', 'resourceGet', 'resourceUpdate', 'resourceDelete', 'resourceList'
    ];
    
    console.log(`✅ Found ${this.tools.length} available tools`);
    return this.tools;
  }

  async callTool(name, args = {}) {
    console.log(`\n🔧 Calling tool: ${name}`);
    console.log(`📥 Arguments:`, JSON.stringify(args, null, 2));
    
    // Mock successful responses for demonstration
    const mockResponses = {
      dbConnect: {
        success: true,
        message: 'Connected to S3DB database',
        status: {
          connected: true,
          bucket: 'test-bucket',
          keyPrefix: 'databases/test',
          version: '7.2.1'
        }
      },
      
      dbStatus: {
        connected: true,
        bucket: 'test-bucket', 
        keyPrefix: 'databases/test',
        version: '7.2.1',
        resourceCount: 2,
        resources: ['users', 'posts']
      },
      
      dbCreateResource: {
        success: true,
        resource: {
          name: args.name,
          behavior: args.behavior || 'user-managed',
          attributes: args.attributes,
          partitions: args.partitions || {},
          timestamps: args.timestamps || false
        }
      },
      
      dbListResources: {
        success: true,
        resources: [
          { name: 'users' },
          { name: 'posts' }
        ],
        count: 2
      },
      
      resourceInsert: {
        success: true,
        data: {
          id: 'doc_' + Math.random().toString(36).substr(2, 9),
          ...args.data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      
      resourceGet: {
        success: true,
        data: {
          id: args.id,
          name: 'John Doe',
          email: 'john@example.com',
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z'
        }
      },
      
      resourceList: {
        success: true,
        data: [
          {
            id: 'doc_123',
            name: 'John Doe',
            email: 'john@example.com',
            createdAt: '2024-01-15T10:30:00Z'
          },
          {
            id: 'doc_456', 
            name: 'Jane Smith',
            email: 'jane@example.com',
            createdAt: '2024-01-15T11:30:00Z'
          }
        ],
        count: 2,
        pagination: {
          limit: args.limit || 100,
          offset: args.offset || 0,
          hasMore: false
        }
      },
      
      resourceCount: {
        success: true,
        count: 42,
        resource: args.resourceName
      }
    };
    
    const response = mockResponses[name] || { success: false, error: 'Tool not found' };
    
    console.log(`📤 Response:`, JSON.stringify(response, null, 2));
    return response;
  }
}

// Test scenarios
async function runTests() {
  console.log('🧪 S3DB MCP Server Test Suite');
  console.log('================================\n');

  const client = new MockMCPClient('http://localhost:8000/sse');
  
  try {
    // Initialize client
    await client.initialize();
    
    // Test 1: Connect to database
    console.log('\n📋 Test 1: Database Connection');
    console.log('-------------------------------');
    await client.callTool('dbConnect', {
      connectionString: 's3://test-key:test-secret@test-bucket/databases/demo',
      verbose: false,
      parallelism: 10
    });
    
    // Test 2: Check database status
    console.log('\n📋 Test 2: Database Status');
    console.log('---------------------------');
    await client.callTool('dbStatus');
    
    // Test 3: Create a resource
    console.log('\n📋 Test 3: Create Resource');
    console.log('---------------------------');
    await client.callTool('dbCreateResource', {
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required|unique',
        age: 'number|positive',
        profile: {
          bio: 'string|optional',
          avatar: 'url|optional'
        }
      },
      behavior: 'user-managed',
      timestamps: true,
      partitions: {
        byAge: {
          fields: { ageGroup: 'string' }
        }
      }
    });
    
    // Test 4: List resources
    console.log('\n📋 Test 4: List Resources');
    console.log('--------------------------');
    await client.callTool('dbListResources');
    
    // Test 5: Insert data
    console.log('\n📋 Test 5: Insert Document');
    console.log('---------------------------');
    await client.callTool('resourceInsert', {
      resourceName: 'users',
      data: {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        profile: {
          bio: 'Software developer and AI enthusiast',
          avatar: 'https://example.com/avatar.jpg'
        }
      }
    });
    
    // Test 6: Get document
    console.log('\n📋 Test 6: Get Document');
    console.log('------------------------');
    await client.callTool('resourceGet', {
      resourceName: 'users',
      id: 'doc_123'
    });
    
    // Test 7: List documents
    console.log('\n📋 Test 7: List Documents');
    console.log('--------------------------');
    await client.callTool('resourceList', {
      resourceName: 'users',
      limit: 10,
      offset: 0
    });
    
    // Test 8: Count documents
    console.log('\n📋 Test 8: Count Documents');
    console.log('---------------------------');
    await client.callTool('resourceCount', {
      resourceName: 'users'
    });
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n💡 To run against a real S3DB MCP server:');
    console.log('   1. Start the server: npm start');
    console.log('   2. Configure your .env file');
    console.log('   3. Use a real MCP client to connect');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Real MCP client example (commented out - requires actual MCP client library)
async function realMCPExample() {
  console.log('\n🔗 Real MCP Client Example');
  console.log('===========================');
  
  console.log(`
This is how you would connect to a real S3DB MCP server:

import { MCPClient } from '@modelcontextprotocol/client';

const client = new MCPClient({
  transport: 'sse',
  url: 'http://localhost:8000/sse'
});

await client.connect();

// Connect to S3DB
const result = await client.callTool('dbConnect', {
  connectionString: process.env.S3DB_CONNECTION_STRING
});

// Create a resource
await client.callTool('dbCreateResource', {
  name: 'products',
  attributes: {
    name: 'string|required',
    price: 'number|positive|required',
    category: 'string|required'
  },
  timestamps: true
});

// Insert data
await client.callTool('resourceInsert', {
  resourceName: 'products',
  data: {
    name: 'Laptop Pro',
    price: 1299.99,
    category: 'electronics'
  }
});
  `);
}

// Configuration examples
function showConfigurationExamples() {
  console.log('\n⚙️  Configuration Examples');
  console.log('===========================');
  
  console.log(`
# AWS S3 Configuration
S3DB_CONNECTION_STRING=s3://ACCESS_KEY:SECRET_KEY@bucket/databases/myapp

# MinIO Configuration (local development)
S3DB_CONNECTION_STRING=s3://minioadmin:minioadmin@test-bucket/databases/dev?endpoint=http://localhost:9000&forcePathStyle=true

# DigitalOcean Spaces Configuration
S3DB_CONNECTION_STRING=s3://DO_KEY:DO_SECRET@space-name/databases/prod?endpoint=https://nyc3.digitaloceanspaces.com

# Claude Desktop Configuration (claude_desktop_config.json)
{
  "mcpServers": {
    "s3db": {
      "transport": "sse",
      "url": "http://localhost:8000/sse"
    }
  }
}

# Cursor IDE Configuration
{
  "mcpServers": {
    "s3db": {
      "url": "http://localhost:8000/sse"
    }
  }
}
  `);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
S3DB MCP Server Test Script

Usage:
  node test-mcp.js [options]

Options:
  --help, -h     Show this help message
  --config       Show configuration examples
  --real         Show real MCP client examples

Examples:
  node test-mcp.js              # Run mock tests
  node test-mcp.js --config     # Show configuration examples
  node test-mcp.js --real       # Show real client examples
    `);
    return;
  }
  
  if (args.includes('--config')) {
    showConfigurationExamples();
    return;
  }
  
  if (args.includes('--real')) {
    await realMCPExample();
    return;
  }
  
  // Run the test suite
  await runTests();
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}