# 🔌 s3db.js Plugin System

<p align="center">
  <strong>Comprehensive guide to all s3db.js plugins</strong><br>
  <em>Extend your database with powerful features</em>
</p>

---

## 📋 Table of Contents

- [🚀 Overview](#-overview)
- [🏗️ Plugin Architecture](#️-plugin-architecture)
- [📦 Getting Started](#-getting-started)
- [🧩 Available Plugins](#-available-plugins)
- [⏰ Plugin Timing](#-plugin-timing-before-vs-after-resource-creation)
- [🔧 Plugin Development](#-plugin-development)
- [💡 Plugin Combinations](#-plugin-combinations)
- [🎯 Best Practices](#-best-practices)
- [🔍 Troubleshooting](#-troubleshooting)
- [📚 Additional Resources](#-additional-resources)

---

## 🚀 Overview

The s3db.js plugin system provides a powerful and flexible way to extend database functionality. Plugins can intercept operations, add new methods to resources, track metrics, implement caching, and much more.

### Key Capabilities

- **🔌 Extensible**: Add new functionality without modifying core code
- **🎯 Flexible**: Plugins can be added before or after resources exist
- **🔄 Composable**: Combine multiple plugins for complex workflows
- **📊 Observable**: Rich event system for monitoring and integration
- **🛠️ Maintainable**: Clean separation of concerns

---

## 🏗️ Plugin Architecture

### Plugin Lifecycle

All plugins extend the base `Plugin` class and follow a consistent lifecycle:

```javascript
import { Plugin } from 's3db.js';

class MyPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = 'MyPlugin';
    // Plugin initialization
  }

  async onSetup() {
    // Called when plugin is attached to database
    // Access database via this.database
  }

  async onStart() {
    // Called after setup is complete
    // Plugin is ready to operate
  }

  async onStop() {
    // Cleanup when plugin is stopped
  }
}
```

**Lifecycle Stages:**

1. **Construction**: Plugin instance created with configuration
2. **Registration**: Plugin added to database via `usePlugin()` or constructor
3. **Setup**: `onSetup()` called when database is connected
4. **Start**: `onStart()` called after setup completes
5. **Operation**: Plugin actively processing database operations
6. **Stop**: `onStop()` called for cleanup

### Driver-Based Architecture

Most s3db.js plugins follow a **driver pattern** where you specify:
- **`driver`**: The storage/connection type (`filesystem`, `s3`, `multi`, etc.)
- **`config`**: Driver-specific configuration options
- **Plugin options**: Global settings that apply across drivers

```javascript
// Single driver example
new SomePlugin({
  driver: 'driverType',
  config: {
    // Driver-specific options
    option1: 'value1',
    option2: 'value2'
  },
  // Global plugin options
  verbose: true,
  timeout: 30000
});

// Multi-driver example  
new SomePlugin({
  driver: 'multi',
  config: {
    strategy: 'all',
    destinations: [
      { driver: 'driver1', config: {...} },
      { driver: 'driver2', config: {...} }
    ]
  }
});
```

### Plugin Types

- **Instance Plugins**: Require `new` - `new CachePlugin(config)`
- **Static Plugins**: Used directly - `CostsPlugin`
- **Configurable**: Accept options for customization
- **Event-Driven**: Emit events for monitoring and integration
- **Deferred Setup**: Can be added before target resources exist (e.g., EventualConsistencyPlugin)

---

## 📦 Getting Started

### Basic Plugin Usage

```javascript
import { S3db, CachePlugin, BackupPlugin, CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await s3db.connect();

// Driver-based plugins (most common)
await s3db.usePlugin(new CachePlugin({
  driver: 'memory',
  config: { maxSize: 1000 }
}));

await s3db.usePlugin(new BackupPlugin({
  driver: 'filesystem',
  config: { path: './backups/{date}/' }
}));

// Static utility plugins
await s3db.usePlugin(CostsPlugin);
```

### Adding Plugins to Your Database

#### Method 1: Using usePlugin() (Recommended)

```javascript
const database = new S3db({ connectionString: '...' });
await database.connect();

// Add plugin after connection
const cachePlugin = new CachePlugin({
  driver: 'memory',
  config: { maxSize: 1000 }
});

await database.usePlugin(cachePlugin);
```

#### Method 2: Constructor Configuration

```javascript
const cachePlugin = new CachePlugin({ driver: 'memory' });
const auditPlugin = new AuditPlugin({ driver: 'memory' });

const database = new S3db({
  connectionString: '...',
  plugins: [cachePlugin, auditPlugin]
});

await database.connect(); // Plugins are initialized during connection
```

#### Method 3: Plugin Factory Functions

Some plugins provide static factory methods:

```javascript
await database.usePlugin(CostsPlugin); // Static plugin
```

---

## 🧩 Available Plugins

### Core Plugins

| Plugin | Description | Type | Use Cases |
|--------|-------------|------|-----------|
| **[💾 Cache Plugin](./cache.md)** | Driver-based caching system | Instance | Performance optimization, cost reduction |
| **[💰 Costs Plugin](./costs.md)** | Real-time AWS S3 cost tracking | Static | Cost monitoring, budget management |
| **[📝 Audit Plugin](./audit.md)** | Comprehensive audit logging | Instance | Compliance, security monitoring |
| **[📊 Metrics Plugin](./metrics.md)** | Performance monitoring and analytics | Instance | Performance tracking, insights |

### Data Management Plugins

| Plugin | Description | Type | Use Cases |
|--------|-------------|------|-----------|
| **[💾 Backup Plugin](./backup.md)** | Multi-destination backup system | Instance | Data protection, disaster recovery |
| **[🔄 Replicator Plugin](./replicator.md)** | Real-time data replication | Instance | Data synchronization, multi-environment |
| **[🔍 FullText Plugin](./fulltext.md)** | Full-text search capabilities | Instance | Search functionality, content discovery |
| **[⚡ Eventual Consistency Plugin](./eventual-consistency.md)** | Transaction-based eventual consistency | Instance | Counters, balances, accumulator fields |

### Workflow Plugins

| Plugin | Description | Type | Use Cases |
|--------|-------------|------|-----------|
| **[🤖 State Machine Plugin](./state-machine.md)** | Finite state machine workflows | Instance | Business processes, workflow management |
| **[⏰ Scheduler Plugin](./scheduler.md)** | Cron-based job scheduling | Instance | Automated tasks, maintenance jobs |
| **[📬 Queue Consumer Plugin](./queue-consumer.md)** | External queue message processing | Instance | Event-driven architecture, integration |
| **[🔒 S3Queue Plugin](./s3-queue.md)** | Distributed queue processing with zero race conditions | Instance | Task queues, message processing, worker pools |

### Plugin Quick Reference

```javascript
// Core functionality
import { 
  CachePlugin,      // 💾 Intelligent caching
  CostsPlugin,      // 💰 Cost tracking  
  AuditPlugin,      // 📝 Operation logging
  MetricsPlugin     // 📊 Performance monitoring
} from 's3db.js';

// Data management
import {
  BackupPlugin,              // 💾 Data protection
  ReplicatorPlugin,          // 🔄 Data replication
  FullTextPlugin,            // 🔍 Search capabilities
  EventualConsistencyPlugin  // ⚡ Eventual consistency
} from 's3db.js';

// Workflow automation
import {
  StateMachinePlugin,   // 🤖 Business workflows
  SchedulerPlugin,      // ⏰ Job scheduling
  QueueConsumerPlugin,  // 📬 Message processing
  S3QueuePlugin         // 🔒 Distributed queue processing
} from 's3db.js';
```

---

## ⏰ Plugin Timing: Before vs After Resource Creation

One of the key features of the s3db.js plugin system is that plugins can be added at any time - before or after resources are created.

### Adding Plugins BEFORE Resource Creation

Plugins can be added before their target resources exist. They will automatically set up once the resource is created:

```javascript
const database = new S3db({ connectionString: '...' });
await database.connect();

// Add plugin for a resource that doesn't exist yet
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',  // This resource doesn't exist yet
  field: 'balance',
  mode: 'sync'
});

await database.usePlugin(plugin); // Plugin defers setup

// Later, create the resource
const wallets = await database.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});

// Plugin automatically completes setup and adds methods
console.log(typeof wallets.add); // 'function'
```

### Adding Plugins AFTER Resource Creation

Plugins can also be added after resources already exist:

```javascript
// Create resource first
const products = await database.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    stock: 'number|default:0'
  }
});

// Add plugin later
const plugin = new EventualConsistencyPlugin({
  resource: 'products',
  field: 'stock',
  mode: 'async'
});

await database.usePlugin(plugin);

// Methods are immediately available
await products.add('product-1', 10);
```

### How Deferred Setup Works

When a plugin requires a resource that doesn't exist:

1. **Detection**: Plugin checks for resource in `onSetup()`
2. **Deferral**: Sets up a watcher using database hooks
3. **Monitoring**: Listens for `afterCreateResource` events
4. **Completion**: When target resource is created, completes setup automatically

Example implementation pattern:

```javascript
class MyResourcePlugin extends Plugin {
  async onSetup() {
    this.targetResource = this.database.resources[this.config.resource];
    
    if (!this.targetResource) {
      // Resource doesn't exist - defer setup
      this.deferredSetup = true;
      this.watchForResource();
      return;
    }
    
    // Resource exists - complete setup now
    await this.completeSetup();
  }

  watchForResource() {
    this.database.addHook('afterCreateResource', async ({ resource, config }) => {
      if (config.name === this.config.resource && this.deferredSetup) {
        this.targetResource = resource;
        this.deferredSetup = false;
        await this.completeSetup();
      }
    });
  }

  async completeSetup() {
    // Perform actual setup work
    this.addMethodsToResource();
    this.installHooks();
  }
}
```

---

## 🔧 Plugin Development

### Creating a Custom Plugin

```javascript
import { Plugin } from 's3db.js';

class MyCustomPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = 'MyCustomPlugin';
    this.version = '1.0.0';
    
    // Validate configuration
    if (!options.resource) {
      throw new Error('Resource name is required');
    }
    
    this.config = {
      ...this.getDefaultConfig(),
      ...options
    };
  }

  getDefaultConfig() {
    return {
      enabled: true,
      verbose: false
    };
  }

  async onSetup() {
    // Called when plugin is attached to database
    // Access database via this.database
    await this.initialize();
  }

  async onStart() {
    // Called after setup is complete
    this.emit('plugin.started', { name: this.name });
  }

  async onStop() {
    // Cleanup when plugin is stopped
    this.removeAllListeners();
    await this.cleanup();
  }

  async initialize() {
    // Custom initialization logic
    this.setupHooks();
    this.addResourceMethods();
  }

  setupHooks() {
    this.database.addHook('beforeInsert', async (data) => {
      // Intercept insert operations
      return this.processInsert(data);
    });
  }

  addResourceMethods() {
    const resource = this.database.resources[this.config.resource];
    if (!resource) return;

    // Add custom methods to resource
    resource.customMethod = async (...args) => {
      return this.handleCustomMethod(...args);
    };
  }
}
```

### Plugin Patterns

#### Pattern 1: Multi-Driver Support

```javascript
class FlexiblePlugin extends Plugin {
  async onSetup() {
    switch(this.config.driver) {
      case 'memory':
        this.driver = new MemoryDriver(this.config);
        break;
      case 'redis':
        this.driver = new RedisDriver(this.config);
        break;
      default:
        throw new Error(`Unknown driver: ${this.config.driver}`);
    }
  }
}
```

#### Pattern 2: Resource Method Extension

```javascript
class ExtensionPlugin extends Plugin {
  addResourceMethods(resource) {
    const plugin = this;
    
    resource.newMethod = async function(...args) {
      // Access both resource and plugin context
      return plugin.processMethod(this, ...args);
    };
  }
}
```

#### Pattern 3: Operation Interception

```javascript
class InterceptorPlugin extends Plugin {
  interceptOperation(resource, operation) {
    const original = resource[operation];
    
    resource[operation] = async function(...args) {
      // Pre-processing
      await plugin.beforeOperation(operation, args);
      
      // Call original
      const result = await original.apply(this, args);
      
      // Post-processing
      await plugin.afterOperation(operation, result);
      
      return result;
    };
  }
}
```

### Plugin Hooks and Events

#### Database Hooks

Plugins can register hooks for database operations:

```javascript
this.database.addHook('beforeCreateResource', async ({ config }) => {
  // Modify resource configuration
});

this.database.addHook('afterCreateResource', async ({ resource }) => {
  // React to resource creation
});
```

#### Resource Events

Plugins can listen to resource-level events:

```javascript
resource.on('insert', async (data) => {
  // React to insert operations
});

resource.on('update', async (id, changes) => {
  // React to updates
});
```

#### Plugin Events

Plugins can emit their own events:

```javascript
this.emit('cache.hit', { key, value });
this.emit('audit.logged', { operation, data });
```

---

## 💡 Plugin Combinations

### Production Stack

Perfect for production applications requiring performance, reliability, and monitoring:

```javascript
const productionPlugins = [
  // Performance optimization
  new CachePlugin({
    driver: 'multi',
    config: {
      strategy: 'all',
      destinations: [
        { driver: 'memory', config: { maxSize: 1000 } },
        { driver: 'filesystem', config: { path: './cache' } }
      ]
    }
  }),
  
  // Data protection
  new BackupPlugin({
    driver: 'multi',
    config: {
      strategy: 'all',
      destinations: [
        { driver: 'filesystem', config: { path: './backups/{date}/' } },
        { driver: 's3', config: { bucket: 'backup-bucket' } }
      ]
    },
    retention: { daily: 7, weekly: 4, monthly: 12 }
  }),
  
  // Monitoring and compliance
  new AuditPlugin({ 
    includeData: true,
    trackOperations: ['insert', 'update', 'delete']
  }),
  new MetricsPlugin({ 
    collectPerformance: true,
    trackSlowQueries: true
  }),
  CostsPlugin,
  
  // Automation
  new SchedulerPlugin({
    jobs: {
      daily_cleanup: {
        schedule: '0 3 * * *',
        action: async (db) => {
          // Daily maintenance tasks
        }
      }
    }
  })
];
```

### Analytics Platform

Ideal for data analysis, search, and real-time processing:

```javascript
const analyticsPlugins = [
  // Search and discovery
  new FullTextPlugin({
    fields: ['title', 'content', 'tags'],
    fuzzySearch: true,
    stemming: true
  }),
  
  // Real-time data pipeline
  new ReplicatorPlugin({
    replicators: [{
      driver: 'bigquery',
      resources: { events: 'event_analytics' },
      config: {
        projectId: 'analytics-project',
        datasetId: 'events'
      }
    }]
  }),
  
  // Event processing
  new QueueConsumerPlugin({
    consumers: [{
      driver: 'sqs',
      config: { queueUrl: 'analytics-queue-url' },
      consumers: [{ resources: ['events'] }]
    }]
  }),
  
  // Performance monitoring
  new MetricsPlugin({
    collectUsage: true,
    trackSlowQueries: true
  }),
  new CachePlugin({
    driver: 'memory',
    config: { maxSize: 5000 }
  })
];
```

### E-commerce Workflow

Perfect for order processing, inventory management, and business workflows:

```javascript
const ecommercePlugins = [
  // Business process management
  new StateMachinePlugin({
    stateMachines: {
      order_processing: {
        initialState: 'pending',
        states: {
          pending: { on: { CONFIRM: 'confirmed' } },
          confirmed: { on: { SHIP: 'shipped' } },
          shipped: { on: { DELIVER: 'delivered' } },
          delivered: { type: 'final' }
        }
      }
    }
  }),
  
  // Inventory management with eventual consistency
  new EventualConsistencyPlugin({
    resource: 'inventory',
    field: 'quantity',
    mode: 'sync'
  }),
  
  // Automated operations
  new SchedulerPlugin({
    jobs: {
      inventory_sync: {
        schedule: '*/15 * * * *',
        action: async (db) => {
          // Sync inventory every 15 minutes
        }
      },
      daily_reports: {
        schedule: '0 9 * * *',
        action: async (db) => {
          // Generate daily sales reports
        }
      }
    }
  }),
  
  // Data synchronization
  new ReplicatorPlugin({
    replicators: [{
      driver: 'sqs',
      resources: ['orders', 'inventory'],
      config: { queueUrl: 'order-events-queue' }
    }]
  }),
  
  // Audit and compliance
  new AuditPlugin({
    trackOperations: ['insert', 'update', 'delete'],
    includeData: true
  }),
  
  // Performance optimization
  new CachePlugin({
    driver: 'memory',
    config: { maxSize: 2000 }
  })
];
```

### Development Environment

Lightweight setup for development with debugging and testing support:

```javascript
const developmentPlugins = [
  // Fast local caching
  new CachePlugin({
    driver: 'memory',
    config: { maxSize: 500 }
  }),
  
  // Local backups
  new BackupPlugin({
    driver: 'filesystem',
    config: { path: './dev-backups/{date}/' }
  }),
  
  // Development metrics
  new MetricsPlugin({
    verbose: true,
    collectPerformance: true
  }),
  
  // Cost tracking
  CostsPlugin,
  
  // Search for testing
  new FullTextPlugin({
    fields: ['title', 'content'],
    verbose: true
  })
];
```

---

## 🎯 Best Practices

### 1. Initialization Safety

Always check if resources exist before accessing them:

```javascript
async onSetup() {
  if (!this.database.resources[this.config.resource]) {
    // Handle missing resource (defer or error)
  }
}
```

### 2. Cleanup on Stop

Always clean up resources in `onStop()`:

```javascript
async onStop() {
  clearInterval(this.timer);
  await this.flushCache();
  this.removeAllListeners();
}
```

### 3. Error Handling

Use proper error handling with tryFn:

```javascript
const [ok, err, result] = await tryFn(() => 
  this.performOperation()
);

if (!ok) {
  this.emit('plugin.error', err);
  return null;
}
```

### 4. Configuration Validation

Validate configuration in constructor:

```javascript
constructor(options = {}) {
  super(options);
  
  if (!options.resource) {
    throw new Error('Resource name is required');
  }
  
  this.config = {
    ...this.getDefaultConfig(),
    ...options
  };
}
```

### 5. Avoid Conflicts

Check for existing methods before adding new ones:

```javascript
if (resource.addBalance) {
  console.warn('Method addBalance already exists');
  return;
}

resource.addBalance = async (...) => { ... };
```

### Plugin Performance

- **Cache Strategically**: Use caching plugins for frequently accessed data
- **Monitor Resources**: Track performance impact with metrics plugins
- **Optimize Configurations**: Tune plugin settings based on usage patterns
- **Profile Operations**: Use metrics to identify bottlenecks

### Plugin Security

- **Audit Critical Operations**: Log all sensitive data operations
- **Encrypt Sensitive Data**: Use encryption in backup and replication plugins
- **Validate Configurations**: Ensure plugin configurations don't expose sensitive data
- **Monitor Access**: Track plugin-generated operations

### Plugin Monitoring

- **Event-Driven Monitoring**: Use plugin events for real-time monitoring
- **Health Checks**: Implement plugin health checks
- **Error Handling**: Robust error handling in plugin configurations
- **Performance Tracking**: Monitor plugin impact on overall performance

### Plugin Combinations

- **Avoid Conflicts**: Ensure plugins don't interfere with each other
- **Order Matters**: Consider plugin initialization order
- **Resource Usage**: Monitor combined plugin resource usage
- **Configuration Overlap**: Avoid conflicting plugin configurations

---

## 🔍 Troubleshooting

### Plugin Not Initializing

**Problem**: Plugin methods not appearing on resource

**Solutions**:
- Ensure database is connected before adding plugin
- Check if resource name matches exactly
- Verify plugin setup completed without errors

### Deferred Setup Not Working

**Problem**: Plugin not setting up when resource is created

**Solutions**:
- Ensure plugin is watching for correct resource name
- Check that database hooks are properly registered
- Verify no errors in completeSetup() method

### Method Conflicts

**Problem**: Plugin methods overwriting existing methods

**Solutions**:
- Check for existing methods before adding
- Use unique method names with prefixes
- Consider using namespaced methods (resource.plugin.method)

### Performance Issues

**Problem**: Plugin slowing down operations

**Solutions**:
- Use async operations where possible
- Implement caching for expensive operations
- Batch operations when appropriate
- Profile plugin performance with metrics

---

## 📚 Additional Resources

### Documentation

Each plugin has comprehensive documentation:

- [Cache Plugin](./cache.md) - Intelligent caching system
- [Costs Plugin](./costs.md) - AWS S3 cost tracking
- [Audit Plugin](./audit.md) - Comprehensive audit logging
- [Metrics Plugin](./metrics.md) - Performance monitoring
- [Backup Plugin](./backup.md) - Data backup and recovery
- [Replicator Plugin](./replicator.md) - Data replication
- [FullText Plugin](./fulltext.md) - Full-text search
- [Eventual Consistency Plugin](./eventual-consistency.md) - Event sourcing for numeric fields
- [State Machine Plugin](./state-machine.md) - Workflow management
- [Scheduler Plugin](./scheduler.md) - Job scheduling
- [Queue Consumer Plugin](./queue-consumer.md) - Message processing
- [S3Queue Plugin](./s3-queue.md) - Distributed queue processing

### Testing Plugins

#### Unit Testing

```javascript
describe('MyPlugin', () => {
  let database, plugin;
  
  beforeEach(async () => {
    database = await createDatabaseForTest('my-plugin-test');
    await database.connect();
    
    plugin = new MyPlugin({ /* config */ });
    await database.usePlugin(plugin);
  });
  
  afterEach(async () => {
    await database.disconnect();
  });
  
  it('should add methods to resource', async () => {
    const resource = await database.createResource({
      name: 'test',
      attributes: { id: 'string|required' }
    });
    
    expect(typeof resource.myMethod).toBe('function');
  });
});
```

#### Integration Testing

```javascript
it('should work with multiple plugins', async () => {
  const cache = new CachePlugin({ driver: 'memory' });
  const audit = new AuditPlugin({ driver: 'memory' });
  
  await database.usePlugin(cache);
  await database.usePlugin(audit);
  
  // Test combined functionality
  const resource = await database.createResource({ ... });
  await resource.insert({ id: '1', data: 'test' });
  
  // Verify both plugins are working
  expect(cache.getStats().operations).toBe(1);
  expect(audit.getLogs().length).toBe(1);
});
```

### Plugin File Structure

```
docs/plugins/
├── README.md              # This comprehensive guide
├── cache.md              # Cache Plugin documentation
├── costs.md              # Costs Plugin documentation
├── audit.md              # Audit Plugin documentation
├── metrics.md            # Metrics Plugin documentation
├── backup.md             # Backup Plugin documentation
├── replicator.md         # Replicator Plugin documentation
├── fulltext.md           # FullText Plugin documentation
├── queue-consumer.md     # Queue Consumer Plugin documentation
├── s3-queue.md           # S3Queue Plugin documentation
├── state-machine.md      # State Machine Plugin documentation
├── scheduler.md          # Scheduler Plugin documentation
└── eventual-consistency.md # Eventual Consistency Plugin documentation
```

Each individual plugin file follows a consistent structure:
- **Overview**: Plugin purpose and how it works
- **Key Features**: Core and technical capabilities
- **Installation & Setup**: Getting started quickly
- **Configuration Options**: Complete parameter reference
- **Usage Examples**: Practical implementation examples
- **API Reference**: Method and event documentation
- **Advanced Patterns**: Complex use cases and patterns
- **Best Practices**: Recommendations and guidelines
- **Troubleshooting**: Common issues and solutions

### Community & Support

- [GitHub Issues](https://github.com/s3db-js/s3db.js/issues) - Bug reports and feature requests
- [Discussions](https://github.com/s3db-js/s3db.js/discussions) - Community discussions
- [Plugin Development Guide](./plugin-development.md) - Detailed guide for creating custom plugins
- [Plugin API Reference](./plugin-api.md) - Complete API documentation
- [Community Plugin Registry](https://github.com/s3db-js/plugins) - Third-party plugins

---

This comprehensive guide provides everything you need to understand, use, and develop plugins for s3db.js. For specific plugin details, refer to the individual plugin documentation files listed above.