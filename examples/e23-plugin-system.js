/**
 * Advanced Plugin System Example
 * 
 * This example demonstrates the newly implemented plugin system in s3db.js,
 * showing how to create, configure, and use plugins for extending functionality.
 */

import { S3db, CostsPlugin, CachePlugin, LoggingPlugin } from '../src/index.js';
import { setupDatabase, teardownDatabase } from './database.js';

// Example custom plugin class
class MetricsPlugin {
  constructor(options = {}) {
    this.name = 'MetricsPlugin';
    this.options = options;
    this.database = null;
    this.metrics = {
      operations: 0,
      errors: 0,
      avgResponseTime: 0,
      responseTimes: []
    };
    this.startTime = null;
  }

  async setup(database) {
    this.database = database;
    this.startTime = Date.now();
    
    // Listen to database events
    this.database.on('s3db.resourceCreated', () => {
      this.metrics.operations++;
    });
    
    this.database.on('s3db.resourceUpdated', () => {
      this.metrics.operations++;
    });
    
    console.log('📊 MetricsPlugin setup complete');
  }

  async start() {
    console.log('📈 MetricsPlugin started - collecting metrics...');
    
    // Listen to client events for response time tracking
    if (this.database.client) {
      this.database.client.on('command.response', (commandName, response, input) => {
        const responseTime = Date.now() - (input._startTime || Date.now());
        this.recordResponseTime(responseTime);
      });
      
      this.database.client.on('command.request', (commandName, input) => {
        input._startTime = Date.now();
      });
    }
  }

  async stop() {
    console.log('📊 MetricsPlugin stopped');
    this.printMetrics();
  }

  recordResponseTime(time) {
    this.responseTimes.push(time);
    
    // Keep only last 100 measurements
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    
    // Calculate average
    this.metrics.avgResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  printMetrics() {
    const uptime = (Date.now() - this.startTime) / 1000;
    
    console.log('\n📊 Metrics Summary');
    console.log('================');
    console.log(`⏱️  Uptime: ${uptime.toFixed(2)}s`);
    console.log(`🔧 Operations: ${this.metrics.operations}`);
    console.log(`⚡ Avg Response Time: ${this.metrics.avgResponseTime.toFixed(2)}ms`);
    console.log(`📈 Operations/sec: ${(this.metrics.operations / uptime).toFixed(2)}`);
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

// Example plugin object (simpler approach)
const simplePlugin = {
  name: 'SimplePlugin',
  database: null,
  
  setup(database) {
    this.database = database;
    console.log('🔧 SimplePlugin setup complete');
  },
  
  start() {
    console.log('▶️ SimplePlugin started');
  },
  
  stop() {
    console.log('⏹️ SimplePlugin stopped');
  }
};

async function main() {
  console.log('🚀 s3db.js Plugin System Demo');
  console.log('==============================\n');

  // Initialize database with multiple plugins
  const s3db = new S3db({
    connectionString: process.env.BUCKET_CONNECTION_STRING
      ?.replace('USER', process.env.MINIO_USER)
      ?.replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/databases/plugin-demo-${Date.now()}`,
    
    plugins: [
      // Built-in plugins
      CostsPlugin,
      new CachePlugin({ 
        ttl: 3600 // Cache for 1 hour
      }),
      new LoggingPlugin({
        logLevel: 'info',
        enableColors: true,
        enableTimestamps: true
      }),
      
      // Custom plugins
      new MetricsPlugin(),
      simplePlugin // Object-based plugin
    ]
  });

  try {
    console.log('📱 Connecting to database...');
    await s3db.connect();
    console.log('✅ Database connected with plugins!\n');

    // Create a resource to test plugin functionality
    console.log('📋 Creating test resource...');
    const users = await s3db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|default:true'
      },
      timestamps: true
    });
    
    console.log('✅ Resource created!\n');

    // Test basic operations to trigger plugin events
    console.log('🧪 Testing operations...');
    
    // Insert some test data
    const testUsers = [
      { name: 'Alice Johnson', email: 'alice@example.com', age: 28 },
      { name: 'Bob Smith', email: 'bob@example.com', age: 32 },
      { name: 'Charlie Brown', email: 'charlie@example.com', age: 25 }
    ];

    console.log('📝 Inserting test users...');
    for (const userData of testUsers) {
      await users.insert(userData);
    }

    console.log('📖 Reading users...');
    const allUsers = await users.list();
    console.log(`   Found ${allUsers.length} users`);

    // Test cache (second read should be faster)
    console.log('🔄 Testing cache (second read)...');
    const cachedUsers = await users.list();
    console.log(`   Found ${cachedUsers.length} users (cached)`);

    // Update a user
    console.log('📝 Updating user...');
    if (allUsers.length > 0) {
      await users.update(allUsers[0].id, { age: 29 });
      console.log('   User updated');
    }

    // Test count operation
    console.log('🔢 Counting users...');
    const userCount = await users.count();
    console.log(`   Total users: ${userCount}`);

    // Access plugin-specific features
    console.log('\n🔌 Plugin-specific features:');
    
    // Logging plugin stats
    const loggingPlugin = s3db.plugins.find(p => p.constructor.name === 'LoggingPlugin');
    if (loggingPlugin) {
      const stats = loggingPlugin.getStats();
      console.log('📊 Logging Stats:', stats);
    }

    // Costs plugin stats
    if (s3db.client.costs) {
      console.log(`💰 Total Cost: $${s3db.client.costs.total.toFixed(6)}`);
      console.log(`📈 Total Requests: ${s3db.client.costs.requests.total}`);
    }

    // Custom metrics plugin
    const metricsPlugin = s3db.plugins.find(p => p.constructor.name === 'MetricsPlugin');
    if (metricsPlugin) {
      const metrics = metricsPlugin.getMetrics();
      console.log('📈 Custom Metrics:', metrics);
    }

    console.log('\n✅ Plugin system demo completed successfully!');
    console.log('\n🎉 Key Features Demonstrated:');
    console.log('   ✅ Multiple plugin types (class-based and object-based)');
    console.log('   ✅ Plugin lifecycle management (setup, start, stop)');
    console.log('   ✅ Event-driven architecture');
    console.log('   ✅ Built-in plugins (Costs, Cache, Logging)');
    console.log('   ✅ Custom plugin development');
    console.log('   ✅ Plugin configuration and options');
    console.log('   ✅ Plugin event listeners and metrics');

  } catch (error) {
    console.error('❌ Error in plugin demo:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await teardownDatabase();
    console.log('✅ Cleanup complete');
  }
}

// Advanced plugin example: Performance monitoring
class PerformancePlugin {
  constructor(options = {}) {
    this.name = 'PerformancePlugin';
    this.options = options;
    this.database = null;
    this.slowQueryThreshold = options.slowQueryThreshold || 1000; // 1 second
    this.performanceLog = [];
  }

  async setup(database) {
    this.database = database;
    console.log('🎯 PerformancePlugin monitoring slow queries...');
    
    // Monitor slow operations
    this.database.client.on('command.response', (commandName, response, input) => {
      const duration = Date.now() - (input._startTime || Date.now());
      
      if (duration > this.slowQueryThreshold) {
        this.logSlowQuery(commandName, duration, input);
      }
    });
  }

  async start() {
    console.log('🏃 PerformancePlugin started');
  }

  async stop() {
    console.log('⚡ PerformancePlugin stopped');
    this.printSlowQueries();
  }

  logSlowQuery(commandName, duration, input) {
    const slowQuery = {
      command: commandName,
      duration,
      key: input.Key || input.Prefix || 'unknown',
      timestamp: new Date().toISOString()
    };
    
    this.performanceLog.push(slowQuery);
    console.warn(`⚠️  Slow query detected: ${commandName} took ${duration}ms`);
  }

  printSlowQueries() {
    if (this.performanceLog.length === 0) {
      console.log('✅ No slow queries detected');
      return;
    }
    
    console.log('\n🐌 Slow Queries Report');
    console.log('====================');
    
    this.performanceLog.forEach(query => {
      console.log(`⏱️  ${query.command}: ${query.duration}ms (${query.key})`);
    });
  }
}

// Export for use in other examples
export {
  main,
  MetricsPlugin,
  PerformancePlugin,
  simplePlugin
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}