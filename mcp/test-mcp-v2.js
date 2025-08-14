#!/usr/bin/env node

/**
 * Test script for S3DB MCP Server v2
 * This simulates how an AI agent would use the MCP server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { config } from 'dotenv';

config();

/**
 * MCP Test Client
 */
class MCPTestClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'http://localhost:8000/sse';
    this.transport = options.transport || 'sse';
    this.client = null;
    this.serverProcess = null;
  }

  /**
   * Start the MCP server
   */
  async startServer() {
    console.log('🚀 Starting MCP Server...');
    
    if (this.transport === 'stdio') {
      // Start server as subprocess for stdio
      this.serverProcess = spawn('node', ['mcp/server-v2.js'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const transport = new StdioClientTransport({
        stdin: this.serverProcess.stdin,
        stdout: this.serverProcess.stdout
      });
      
      this.client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      await this.client.connect(transport);
      
    } else {
      // For SSE, assume server is running separately
      console.log(`📡 Connecting to SSE server at ${this.serverUrl}`);
      
      const transport = new SSEClientTransport(new URL(this.serverUrl));
      this.client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      await this.client.connect(transport);
    }
    
    console.log('✅ Connected to MCP Server');
  }

  /**
   * Stop the server
   */
  async stopServer() {
    if (this.client) {
      await this.client.close();
    }
    
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    
    console.log('🛑 MCP Server stopped');
  }

  /**
   * List available tools
   */
  async listTools() {
    const response = await this.client.request({
      method: 'tools/list',
      params: {}
    });
    
    return response.tools;
  }

  /**
   * Call a tool
   */
  async callTool(name, args = {}) {
    const response = await this.client.request({
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    });
    
    // Parse the response
    if (response.content && response.content[0]) {
      return JSON.parse(response.content[0].text);
    }
    
    return response;
  }
}

/**
 * Mock test client for development
 */
class MockMCPClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'http://localhost:8000/sse';
    console.log('🔧 Using Mock MCP Client (for testing without real server)');
  }

  async startServer() {
    console.log('🎭 Mock server started');
  }

  async stopServer() {
    console.log('🎭 Mock server stopped');
  }

  async listTools() {
    // Return mock tools list
    return [
      { name: 'dbConnect', description: 'Connect to S3DB database' },
      { name: 'dbStatus', description: 'Get database status' },
      { name: 'dbCreateResource', description: 'Create a resource' },
      { name: 'resourceInsert', description: 'Insert document' },
      { name: 'queryCreate', description: 'Create query builder' }
    ];
  }

  async callTool(name, args = {}) {
    // Mock responses
    const responses = {
      dbConnect: {
        success: true,
        data: {
          connected: true,
          bucket: 'test-bucket',
          keyPrefix: 'test'
        }
      },
      dbStatus: {
        success: true,
        data: {
          connected: true,
          resourceCount: 2,
          resources: ['users', 'posts']
        }
      },
      dbCreateResource: {
        success: true,
        data: {
          name: args.name || 'test-resource',
          attributes: args.attributes || {}
        }
      },
      resourceInsert: {
        success: true,
        data: {
          id: 'doc_' + Math.random().toString(36).substr(2, 9),
          ...args.data
        }
      },
      queryCreate: {
        success: true,
        data: {
          queryId: 'query_' + Date.now(),
          resourceName: args.resourceName
        }
      }
    };
    
    return responses[name] || { success: false, error: 'Tool not found' };
  }
}

/**
 * Test scenarios
 */
class TestScenarios {
  constructor(client) {
    this.client = client;
    this.results = [];
  }

  /**
   * Run all test scenarios
   */
  async runAll() {
    console.log('\n📋 Running Test Scenarios\n');
    console.log('═'.repeat(50));
    
    await this.testConnection();
    await this.testResourceCreation();
    await this.testDataOperations();
    await this.testQueryBuilder();
    await this.testErrorHandling();
    
    this.printSummary();
  }

  /**
   * Test 1: Database Connection
   */
  async testConnection() {
    console.log('\n🔗 Test 1: Database Connection');
    console.log('─'.repeat(40));
    
    try {
      // Connect to database
      const connectResult = await this.client.callTool('dbConnect', {
        connectionString: process.env.S3DB_CONNECTION || 's3://test:test@test-bucket/test',
        enableCache: true,
        cacheDriver: 'memory'
      });
      
      console.log('✅ Connected:', connectResult.success);
      
      // Check status
      const statusResult = await this.client.callTool('dbStatus');
      console.log('📊 Status:', statusResult.data);
      
      this.results.push({ test: 'Connection', passed: true });
    } catch (error) {
      console.error('❌ Connection test failed:', error.message);
      this.results.push({ test: 'Connection', passed: false, error: error.message });
    }
  }

  /**
   * Test 2: Resource Creation
   */
  async testResourceCreation() {
    console.log('\n📦 Test 2: Resource Creation');
    console.log('─'.repeat(40));
    
    try {
      // Create a resource
      const result = await this.client.callTool('dbCreateResource', {
        name: 'test_users',
        attributes: {
          name: 'string|required',
          email: 'email|required',
          age: 'number|positive',
          metadata: {
            type: 'object',
            props: {
              tags: 'array',
              score: 'number'
            }
          }
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: {
          byAge: {
            fields: { ageGroup: 'string' }
          }
        }
      });
      
      console.log('✅ Resource created:', result.data?.name);
      
      // List resources
      const listResult = await this.client.callTool('dbListResources');
      console.log('📋 Resources:', listResult.data?.resources);
      
      this.results.push({ test: 'Resource Creation', passed: true });
    } catch (error) {
      console.error('❌ Resource creation failed:', error.message);
      this.results.push({ test: 'Resource Creation', passed: false, error: error.message });
    }
  }

  /**
   * Test 3: Data Operations
   */
  async testDataOperations() {
    console.log('\n💾 Test 3: Data Operations');
    console.log('─'.repeat(40));
    
    try {
      // Insert document
      const insertResult = await this.client.callTool('resourceInsert', {
        resourceName: 'test_users',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
          metadata: {
            tags: ['vip', 'premium'],
            score: 95.5
          }
        }
      });
      
      const docId = insertResult.data?.id;
      console.log('✅ Document inserted:', docId);
      
      // Get document
      const getResult = await this.client.callTool('resourceGet', {
        resourceName: 'test_users',
        id: docId
      });
      console.log('📄 Retrieved:', getResult.data);
      
      // Update document
      const updateResult = await this.client.callTool('resourceUpdate', {
        resourceName: 'test_users',
        id: docId,
        data: {
          age: 31,
          metadata: {
            score: 98
          }
        }
      });
      console.log('✏️ Updated:', updateResult.success);
      
      // List documents
      const listResult = await this.client.callTool('resourceList', {
        resourceName: 'test_users',
        limit: 10
      });
      console.log('📋 List count:', listResult.data?.count);
      
      // Count documents
      const countResult = await this.client.callTool('resourceCount', {
        resourceName: 'test_users'
      });
      console.log('🔢 Total count:', countResult.data?.count);
      
      this.results.push({ test: 'Data Operations', passed: true });
    } catch (error) {
      console.error('❌ Data operations failed:', error.message);
      this.results.push({ test: 'Data Operations', passed: false, error: error.message });
    }
  }

  /**
   * Test 4: Query Builder
   */
  async testQueryBuilder() {
    console.log('\n🔍 Test 4: Query Builder');
    console.log('─'.repeat(40));
    
    try {
      // Create query
      const createResult = await this.client.callTool('queryCreate', {
        resourceName: 'test_users'
      });
      
      const queryId = createResult.data?.queryId;
      console.log('✅ Query created:', queryId);
      
      // Add filters
      await this.client.callTool('queryFilter', {
        queryId,
        field: 'age',
        operator: 'gte',
        value: 25
      });
      
      await this.client.callTool('queryFilter', {
        queryId,
        field: 'metadata.score',
        operator: 'gt',
        value: 90,
        combineWith: 'AND'
      });
      
      console.log('🔧 Filters added');
      
      // Add sorting
      await this.client.callTool('querySort', {
        queryId,
        field: 'age',
        direction: 'desc'
      });
      
      console.log('🔧 Sorting added');
      
      // Add projection
      await this.client.callTool('queryProject', {
        queryId,
        fields: ['name', 'email', 'age']
      });
      
      console.log('🔧 Projection added');
      
      // Execute query
      const executeResult = await this.client.callTool('queryExecute', {
        queryId,
        limit: 5
      });
      
      console.log('📊 Query results:', executeResult.data?.count || 0, 'documents');
      
      // Test aggregation
      const aggResult = await this.client.callTool('queryAggregate', {
        resourceName: 'test_users',
        pipeline: [
          {
            stage: 'group',
            params: {
              by: 'ageGroup',
              aggregations: [
                { type: 'count', name: 'total' },
                { type: 'avg', field: 'metadata.score', name: 'avgScore' }
              ]
            }
          }
        ]
      });
      
      console.log('📈 Aggregation results:', aggResult.data?.results);
      
      this.results.push({ test: 'Query Builder', passed: true });
    } catch (error) {
      console.error('❌ Query builder failed:', error.message);
      this.results.push({ test: 'Query Builder', passed: false, error: error.message });
    }
  }

  /**
   * Test 5: Error Handling
   */
  async testErrorHandling() {
    console.log('\n⚠️ Test 5: Error Handling');
    console.log('─'.repeat(40));
    
    try {
      // Test invalid resource
      const result1 = await this.client.callTool('resourceGet', {
        resourceName: 'non_existent_resource',
        id: 'test'
      });
      
      if (result1.success === false) {
        console.log('✅ Invalid resource handled correctly');
      }
      
      // Test missing parameters
      const result2 = await this.client.callTool('resourceInsert', {
        resourceName: 'test_users'
        // Missing 'data' parameter
      });
      
      if (result2.success === false) {
        console.log('✅ Missing parameters handled correctly');
      }
      
      // Test invalid query operator
      const queryResult = await this.client.callTool('queryCreate', {
        resourceName: 'test_users'
      });
      
      const result3 = await this.client.callTool('queryFilter', {
        queryId: queryResult.data?.queryId,
        field: 'age',
        operator: 'invalid_operator',
        value: 25
      });
      
      if (result3.success === false) {
        console.log('✅ Invalid operator handled correctly');
      }
      
      this.results.push({ test: 'Error Handling', passed: true });
    } catch (error) {
      console.error('❌ Error handling test failed:', error.message);
      this.results.push({ test: 'Error Handling', passed: false, error: error.message });
    }
  }

  /**
   * Print test summary
   */
  printSummary() {
    console.log('\n' + '═'.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(50));
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    
    for (const result of this.results) {
      const icon = result.passed ? '✅' : '❌';
      const status = result.passed ? 'PASSED' : 'FAILED';
      console.log(`${icon} ${result.test}: ${status}`);
      if (result.error) {
        console.log(`   └─ ${result.error}`);
      }
    }
    
    console.log('─'.repeat(50));
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);
    
    if (failed === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log(`\n⚠️ ${failed} test(s) failed`);
    }
  }
}

/**
 * Interactive test menu
 */
async function interactiveMenu(client) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  console.log('\n' + '═'.repeat(50));
  console.log('🎮 INTERACTIVE MCP TEST CLIENT');
  console.log('═'.repeat(50));

  while (true) {
    console.log('\nOptions:');
    console.log('1. List available tools');
    console.log('2. Connect to database');
    console.log('3. Get database status');
    console.log('4. Create a resource');
    console.log('5. Insert document');
    console.log('6. Query documents');
    console.log('7. Run all tests');
    console.log('8. Custom tool call');
    console.log('0. Exit');
    
    const choice = await question('\nSelect option: ');
    
    switch (choice) {
      case '1': {
        const tools = await client.listTools();
        console.log('\n📋 Available tools:');
        tools.forEach(tool => {
          console.log(`  • ${tool.name}: ${tool.description}`);
        });
        break;
      }
      
      case '2': {
        const connStr = await question('Connection string: ') || 's3://test:test@test-bucket';
        const result = await client.callTool('dbConnect', {
          connectionString: connStr
        });
        console.log('Result:', JSON.stringify(result, null, 2));
        break;
      }
      
      case '3': {
        const result = await client.callTool('dbStatus');
        console.log('Status:', JSON.stringify(result, null, 2));
        break;
      }
      
      case '4': {
        const name = await question('Resource name: ');
        const result = await client.callTool('dbCreateResource', {
          name,
          attributes: {
            name: 'string|required',
            value: 'number'
          }
        });
        console.log('Result:', JSON.stringify(result, null, 2));
        break;
      }
      
      case '5': {
        const resourceName = await question('Resource name: ');
        const name = await question('Document name: ');
        const value = await question('Document value: ');
        
        const result = await client.callTool('resourceInsert', {
          resourceName,
          data: { name, value: parseInt(value) || 0 }
        });
        console.log('Result:', JSON.stringify(result, null, 2));
        break;
      }
      
      case '6': {
        const resourceName = await question('Resource name: ');
        const result = await client.callTool('resourceList', {
          resourceName,
          limit: 10
        });
        console.log('Results:', JSON.stringify(result, null, 2));
        break;
      }
      
      case '7': {
        const scenarios = new TestScenarios(client);
        await scenarios.runAll();
        break;
      }
      
      case '8': {
        const toolName = await question('Tool name: ');
        const argsStr = await question('Arguments (JSON): ');
        try {
          const args = argsStr ? JSON.parse(argsStr) : {};
          const result = await client.callTool(toolName, args);
          console.log('Result:', JSON.stringify(result, null, 2));
        } catch (error) {
          console.error('Error:', error.message);
        }
        break;
      }
      
      case '0':
        rl.close();
        return;
      
      default:
        console.log('Invalid option');
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    mock: args.includes('--mock'),
    interactive: args.includes('--interactive') || args.includes('-i'),
    transport: args.includes('--stdio') ? 'stdio' : 'sse',
    serverUrl: process.env.MCP_SERVER_URL || 'http://localhost:8000/sse'
  };
  
  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
S3DB MCP Test Client

Usage:
  node test-mcp-v2.js [options]

Options:
  --mock         Use mock client (no real server needed)
  --interactive  Interactive mode
  --stdio        Use stdio transport instead of SSE
  --help         Show this help

Environment:
  MCP_SERVER_URL  Server URL (default: http://localhost:8000/sse)
  S3DB_CONNECTION Connection string for tests

Examples:
  # Run automated tests with mock client
  node test-mcp-v2.js --mock
  
  # Interactive mode with real server
  node test-mcp-v2.js --interactive
  
  # Run tests against real server
  node test-mcp-v2.js
    `);
    return;
  }
  
  // Create client
  const ClientClass = options.mock ? MockMCPClient : MCPTestClient;
  const client = new ClientClass({
    serverUrl: options.serverUrl,
    transport: options.transport
  });
  
  try {
    // Start server/connection
    await client.startServer();
    
    if (options.interactive) {
      // Interactive mode
      await interactiveMenu(client);
    } else {
      // Run automated tests
      const scenarios = new TestScenarios(client);
      await scenarios.runAll();
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.stopServer();
  }
}

// Run main
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MCPTestClient, MockMCPClient, TestScenarios };