#!/usr/bin/env node

/**
 * Simple test script for S3DB MCP Server
 * No dependencies required - uses HTTP directly
 */

import { config } from 'dotenv';
config();

/**
 * Simple HTTP client for SSE endpoint
 */
class SimpleSSEClient {
  constructor(baseUrl = 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a request to the SSE endpoint
   */
  async request(method, params = {}) {
    const response = await fetch(`${this.baseUrl}/sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Call a tool
   */
  async callTool(name, args = {}) {
    console.log(`\n🔧 Calling: ${name}`);
    console.log('📥 Args:', JSON.stringify(args, null, 2));
    
    try {
      const response = await this.request('tools/call', {
        name,
        arguments: args
      });
      
      // Parse response
      if (response.result?.content?.[0]?.text) {
        const result = JSON.parse(response.result.content[0].text);
        console.log('📤 Result:', JSON.stringify(result, null, 2));
        return result;
      }
      
      return response;
    } catch (error) {
      console.error('❌ Error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * List available tools
   */
  async listTools() {
    const response = await this.request('tools/list');
    return response.result?.tools || [];
  }
}

/**
 * Test workflow
 */
async function runWorkflow() {
  console.log('═'.repeat(60));
  console.log('🧪 S3DB MCP Server Test Workflow');
  console.log('═'.repeat(60));

  const client = new SimpleSSEClient();

  try {
    // 1. Connect to database
    console.log('\n📌 Step 1: Connect to Database');
    console.log('─'.repeat(40));
    
    await client.callTool('dbConnect', {
      connectionString: process.env.S3DB_CONNECTION || 's3://minioadmin:minioadmin@test-bucket?endpoint=http://localhost:9000&forcePathStyle=true',
      enableCache: true,
      cacheDriver: 'memory',
      verbose: true
    });

    // 2. Check status
    console.log('\n📌 Step 2: Check Status');
    console.log('─'.repeat(40));
    
    await client.callTool('dbStatus');

    // 3. Create a resource
    console.log('\n📌 Step 3: Create Resource');
    console.log('─'.repeat(40));
    
    await client.callTool('dbCreateResource', {
      name: 'products',
      attributes: {
        name: 'string|required',
        price: 'number|positive|required',
        category: 'string|required',
        inStock: 'boolean',
        tags: 'array',
        metadata: {
          type: 'object',
          props: {
            brand: 'string',
            warranty: 'number'
          }
        }
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        byCategory: {
          fields: { category: 'string' }
        }
      }
    });

    // 4. Insert some data
    console.log('\n📌 Step 4: Insert Data');
    console.log('─'.repeat(40));
    
    const products = [
      {
        name: 'Laptop Pro',
        price: 1299.99,
        category: 'electronics',
        inStock: true,
        tags: ['computer', 'portable', 'work'],
        metadata: {
          brand: 'TechCorp',
          warranty: 24
        }
      },
      {
        name: 'Wireless Mouse',
        price: 29.99,
        category: 'electronics',
        inStock: true,
        tags: ['computer', 'accessory'],
        metadata: {
          brand: 'TechCorp',
          warranty: 12
        }
      },
      {
        name: 'Office Chair',
        price: 249.99,
        category: 'furniture',
        inStock: false,
        tags: ['office', 'seating'],
        metadata: {
          brand: 'ComfortSeating',
          warranty: 60
        }
      }
    ];

    const insertedIds = [];
    for (const product of products) {
      const result = await client.callTool('resourceInsert', {
        resourceName: 'products',
        data: product
      });
      if (result.data?.id) {
        insertedIds.push(result.data.id);
      }
    }

    // 5. Query with query builder
    console.log('\n📌 Step 5: Query Builder');
    console.log('─'.repeat(40));
    
    // Create query
    const queryResult = await client.callTool('queryCreate', {
      resourceName: 'products'
    });
    
    const queryId = queryResult.data?.queryId;
    
    if (queryId) {
      // Add filter
      await client.callTool('queryFilter', {
        queryId,
        field: 'category',
        operator: 'eq',
        value: 'electronics'
      });
      
      // Add another filter
      await client.callTool('queryFilter', {
        queryId,
        field: 'price',
        operator: 'lt',
        value: 1000,
        combineWith: 'AND'
      });
      
      // Sort by price
      await client.callTool('querySort', {
        queryId,
        field: 'price',
        direction: 'asc'
      });
      
      // Select specific fields
      await client.callTool('queryProject', {
        queryId,
        fields: ['name', 'price', 'category']
      });
      
      // Execute query
      await client.callTool('queryExecute', {
        queryId
      });
    }

    // 6. Aggregation
    console.log('\n📌 Step 6: Aggregation');
    console.log('─'.repeat(40));
    
    await client.callTool('queryAggregate', {
      resourceName: 'products',
      pipeline: [
        {
          stage: 'group',
          params: {
            by: 'category',
            aggregations: [
              { type: 'count', name: 'total' },
              { type: 'avg', field: 'price', name: 'avgPrice' }
            ]
          }
        }
      ]
    });

    // 7. List all products
    console.log('\n📌 Step 7: List Products');
    console.log('─'.repeat(40));
    
    await client.callTool('resourceList', {
      resourceName: 'products',
      limit: 10
    });

    // 8. Count products
    console.log('\n📌 Step 8: Count Products');
    console.log('─'.repeat(40));
    
    await client.callTool('resourceCount', {
      resourceName: 'products'
    });

    // 9. Get stats
    console.log('\n📌 Step 9: Database Stats');
    console.log('─'.repeat(40));
    
    await client.callTool('dbGetStats');

    // 10. Clean up (optional)
    if (process.argv.includes('--cleanup')) {
      console.log('\n📌 Step 10: Cleanup');
      console.log('─'.repeat(40));
      
      await client.callTool('resourceDeleteAll', {
        resourceName: 'products',
        confirm: true
      });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

/**
 * Check server health
 */
async function checkHealth() {
  try {
    const response = await fetch('http://localhost:8001/health');
    const health = await response.json();
    
    console.log('\n🏥 Server Health Check');
    console.log('─'.repeat(40));
    console.log(JSON.stringify(health, null, 2));
    
    return health;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return null;
  }
}

/**
 * List available tools
 */
async function listTools() {
  try {
    const response = await fetch('http://localhost:8001/tools');
    const tools = await response.json();
    
    console.log('\n📋 Available Tools by Category');
    console.log('─'.repeat(40));
    
    for (const [category, categoryTools] of Object.entries(tools)) {
      if (categoryTools.length > 0) {
        console.log(`\n${category.toUpperCase()}:`);
        for (const tool of categoryTools) {
          console.log(`  • ${tool.name}: ${tool.description}`);
        }
      }
    }
    
    return tools;
  } catch (error) {
    console.error('❌ Failed to list tools:', error.message);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
S3DB MCP Simple Test Script

Usage:
  node test-simple.js [options]

Options:
  --health    Check server health
  --tools     List available tools
  --cleanup   Delete test data after tests
  --help      Show this help

Before running:
  1. Start MCP server: node mcp/server-v2.js --transport=sse
  2. Optional: Start MinIO for local testing

Examples:
  # Run full test workflow
  node test-simple.js
  
  # Check server health
  node test-simple.js --health
  
  # List tools
  node test-simple.js --tools
  
  # Run tests and cleanup
  node test-simple.js --cleanup
    `);
    return;
  }
  
  console.log('🚀 S3DB MCP Test Script\n');
  
  // Check health
  if (args.includes('--health')) {
    await checkHealth();
    return;
  }
  
  // List tools
  if (args.includes('--tools')) {
    await listTools();
    return;
  }
  
  // Run workflow
  await runWorkflow();
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}