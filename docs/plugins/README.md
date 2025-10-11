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
    this.slug = 'my-plugin'; // Used for PluginStorage namespace
    // Plugin initialization
  }

  async onInstall() {
    // Called when plugin is attached to database
    // Access database via this.database
    // Setup resources, storage, and configuration
    const storage = this.getStorage();
    await storage.put(
      storage.getPluginKey(null, 'config'),
      { enabled: true, version: '1.0.0' }
    );
  }

  async onStart() {
    // Called after install is complete
    // Start timers, workers, and background tasks
    this.timer = setInterval(() => this.processQueue(), 5000);
  }

  async onStop() {
    // Cleanup when plugin is stopped
    // Stop timers, close connections, flush buffers
    if (this.timer) clearInterval(this.timer);
    await this.flushPendingData();
  }

  async onUninstall(options = {}) {
    // Called when plugin is being removed
    // Cleanup plugin-specific resources
    // Note: PluginStorage is automatically cleaned if purgeData=true
    await this.removeHooksFromResources();
    await this.cleanupInternalState();
  }
}
```

**Lifecycle Stages:**

1. **Construction**: Plugin instance created with configuration
2. **Registration**: Plugin added to database via `usePlugin()` or constructor
3. **Install**: `onInstall()` called when database is connected
   - Setup resources, hooks, and initial configuration
   - Initialize PluginStorage
   - Prepare deferred setups for missing resources
4. **Start**: `onStart()` called after install completes
   - Start background tasks, timers, workers
   - Begin active operation
5. **Operation**: Plugin actively processing database operations
   - Intercept methods, respond to hooks, process events
6. **Stop**: `onStop()` called for cleanup
   - Stop timers and background tasks
   - Flush pending data
   - Close connections
7. **Uninstall**: `onUninstall()` called when plugin is removed
   - Remove hooks and method wrappers
   - Cleanup internal state
   - Optionally purge all data from S3 (`purgeData: true`)

### Plugin Cleanup and Uninstall

Proper cleanup is essential for preventing data leaks and resource exhaustion. The s3db.js plugin system provides robust cleanup mechanisms at multiple levels.

#### Manual Uninstall

Remove a plugin and optionally purge all its data:

```javascript
const plugin = new MyPlugin({ /* config */ });
await database.usePlugin(plugin);

// Later, uninstall the plugin
await plugin.uninstall({ purgeData: true });
// ✅ Plugin removed
// ✅ All PluginStorage data deleted from S3
// ✅ Hooks and method wrappers removed
// ✅ Background tasks stopped
```

#### Automatic Data Purge

When `purgeData: true` is passed to `uninstall()`, the Plugin base class automatically:

1. Calls `onUninstall(options)` for custom cleanup
2. Deletes **all** plugin data from PluginStorage
3. Emits `plugin.dataPurged` event with deletion count

```javascript
async uninstall(options = {}) {
  const { purgeData = false } = options;

  this.beforeUninstall();
  await this.onUninstall(options);

  // Automatic purge if requested
  if (purgeData && this._storage) {
    const deleted = await this._storage.deleteAll();
    this.emit('plugin.dataPurged', { deleted });
  }

  this.afterUninstall();
}
```

#### Implementing Custom Cleanup

Override `onUninstall()` for plugin-specific cleanup:

```javascript
class MyPlugin extends Plugin {
  async onUninstall(options = {}) {
    // Stop all timers
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
      this.consolidationTimer = null;
    }

    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    // Flush pending operations
    if (this.pendingQueue.length > 0) {
      await this.flushQueue();
    }

    // Remove hooks from all resources
    for (const [resourceName, hooks] of this.installedHooks) {
      const resource = this.database.resources[resourceName];
      if (resource) {
        hooks.forEach(hook => resource.removeHook(hook.event, hook.handler));
      }
    }

    // Close external connections
    if (this.externalClient) {
      await this.externalClient.close();
      this.externalClient = null;
    }

    // Clear caches
    this.cache?.clear();

    // Remove event listeners
    this.removeAllListeners();

    console.log(`${this.name} uninstalled successfully`);
  }
}
```

#### Cleanup Best Practices

**✅ DO:**

```javascript
async onUninstall(options) {
  // 1. Stop all timers/intervals
  clearInterval(this.timer);

  // 2. Flush pending data
  await this.flushPendingData();

  // 3. Close external connections
  await this.client?.close();

  // 4. Remove all hooks
  this.removeAllHooks();

  // 5. Clear caches
  this.cache.clear();

  // 6. Remove event listeners
  this.removeAllListeners();

  // 7. Let purgeData handle PluginStorage cleanup
  // (automatic if purgeData=true)
}
```

**❌ DON'T:**

```javascript
async onUninstall(options) {
  // ❌ Don't forget to stop timers
  // this.timer keeps running forever

  // ❌ Don't manually delete PluginStorage data
  await this.getStorage().deleteAll();
  // This is redundant - base class handles it automatically

  // ❌ Don't leak event listeners
  // this.removeAllListeners() is required

  // ❌ Don't leave pending operations
  // await this.flushPendingData() is required
}
```

#### Cleanup Examples by Plugin Type

##### Timer-Based Plugins (Scheduler, EventualConsistency)

```javascript
async onUninstall(options) {
  // Stop all scheduled jobs
  for (const [jobName, job] of this.jobs) {
    job.stop();
  }

  // Clear job registry
  this.jobs.clear();

  // Flush any pending execution
  await this.flushPendingJobs();
}
```

##### Queue-Based Plugins (S3Queue, QueueConsumer)

```javascript
async onUninstall(options) {
  // Stop consuming messages
  await this.stopConsuming();

  // Flush pending messages
  await this.flushQueue();

  // Close queue connection
  await this.queueClient.disconnect();
}
```

##### Connection-Based Plugins (Replicator, External APIs)

```javascript
async onUninstall(options) {
  // Close all replicator connections
  for (const replicator of this.replicators) {
    await replicator.close();
  }

  // Flush pending replications
  await this.flushPendingReplications();

  // Clear connection pool
  this.connectionPool.clear();
}
```

##### Cache Plugins

```javascript
async onUninstall(options) {
  // Flush cache if needed
  if (options.flushCache) {
    await this.writeBackCache();
  }

  // Clear all cache entries
  this.cache.clear();

  // Close cache backend connection
  await this.cacheBackend?.close();
}
```

#### Monitoring Cleanup Events

Listen to cleanup events for debugging:

```javascript
plugin.on('plugin.beforeUninstall', (date) => {
  console.log(`Uninstalling plugin at ${date}`);
});

plugin.on('plugin.dataPurged', ({ deleted }) => {
  console.log(`Purged ${deleted} objects from S3`);
});

plugin.on('plugin.afterUninstall', (date) => {
  console.log(`Plugin uninstalled at ${date}`);
});
```

#### Testing Cleanup

Always test plugin cleanup in your test suite:

```javascript
describe('MyPlugin cleanup', () => {
  it('should cleanup all resources on uninstall', async () => {
    const plugin = new MyPlugin();
    await database.usePlugin(plugin);

    // Create some data
    await plugin.doSomething();

    // Verify data exists
    const storage = plugin.getStorage();
    const keys = await storage.list();
    expect(keys.length).toBeGreaterThan(0);

    // Uninstall with purge
    await plugin.uninstall({ purgeData: true });

    // Verify all data is gone
    const keysAfter = await storage.list();
    expect(keysAfter.length).toBe(0);

    // Verify timers are stopped
    expect(plugin.timer).toBeNull();
  });

  it('should keep data when purgeData=false', async () => {
    const plugin = new MyPlugin();
    await database.usePlugin(plugin);

    await plugin.doSomething();

    // Uninstall WITHOUT purge
    await plugin.uninstall({ purgeData: false });

    // Verify data still exists
    const storage = new PluginStorage(database.client, 'my-plugin');
    const keys = await storage.list();
    expect(keys.length).toBeGreaterThan(0);
  });
});
```

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

### 💾 PluginStorage: Efficient Data Persistence for Plugins

**PluginStorage** is a lightweight storage utility that enables plugins to persist data efficiently without the overhead of creating full Resources. It reuses s3db.js's metadata encoding and behavior system for cost optimization.

#### Why Use PluginStorage?

- **⚡ 3-5x Faster** than creating Resources
- **💰 30-40% Fewer S3 API calls**
- **🔐 Automatic Data Isolation** between plugins
- **📦 Metadata Encoding** for cost optimization
- **🎯 Behavior Support** (`body-overflow`, `body-only`, `enforce-limits`)
- **🗂️ Hierarchical Keys** for organized data storage

#### Key Features

1. **Automatic Data Isolation**: Each plugin gets its own namespace
2. **Resource-Scoped Storage**: Store data per resource or globally
3. **Efficient Serialization**: Reuses s3db.js's advanced metadata encoding
4. **Behavior Patterns**: Smart data distribution between metadata and body
5. **Batch Operations**: Efficient bulk read/write operations
6. **Easy Cleanup**: Delete all plugin data on uninstall

#### When to Use PluginStorage vs Resources

**✅ Use PluginStorage for:**
- Plugin configuration and settings (low volume)
- Distributed locks with TTL
- Simple key-value data (< 1000 records)
- Transient state and temporary data
- Plugin-internal bookkeeping

**❌ Use Resources for:**
- High-volume data (> 1000 records)
- Complex queries with filters and partitions
- Time-series data requiring date-based partitioning
- Audit logs and historical records
- Data requiring structured schemas and validation

#### Getting Started with PluginStorage

Every plugin has access to `PluginStorage` through the `getStorage()` method:

```javascript
import { Plugin } from 's3db.js';

class MyPlugin extends Plugin {
  constructor() {
    super({ slug: 'my-plugin' }); // Slug is used as namespace
  }

  async onInstall() {
    // Get plugin storage instance
    const storage = this.getStorage();

    // Save global plugin configuration
    await storage.set(
      storage.getPluginKey(null, 'config'),
      {
        enabled: true,
        lastSync: Date.now(),
        settings: { retries: 3, timeout: 30000 }
      },
      { behavior: 'body-overflow' }
    );

    // Save resource-scoped data with TTL
    await storage.set(
      storage.getPluginKey('users', 'cache', 'user-123'),
      { name: 'Alice', email: 'alice@example.com', cachedAt: Date.now() },
      { ttl: 300, behavior: 'body-only' } // Auto-expires after 5 minutes
    );
  }
}
```

#### TTL Support for Auto-Expiring Data

PluginStorage supports automatic expiration with TTL (Time-To-Live):

```javascript
const storage = this.getStorage();

// Store data that expires after 60 seconds
await storage.set('session:abc123',
  { userId: 'user1', token: 'xyz789' },
  { ttl: 60 }
);

// Get data - returns null if expired
const session = await storage.get('session:abc123');
if (!session) {
  console.log('Session expired or not found');
}

// Check if data is expired
const expired = await storage.isExpired('session:abc123');

// Get remaining TTL in seconds
const remainingSeconds = await storage.getTTL('session:abc123');
console.log(`Expires in ${remainingSeconds}s`);

// Extend TTL by adding more seconds
await storage.touch('session:abc123', 30); // Add 30 more seconds
```

**TTL Use Cases:**
- Session storage
- Temporary locks
- Rate limiting counters
- Cache entries
- Temporary state during processing

#### Distributed Locks with TTL

PluginStorage provides built-in distributed lock support with automatic expiration:

```javascript
const storage = this.getStorage();

// Acquire lock with auto-expiration
const lock = await storage.acquireLock('consolidate:user123', {
  ttl: 300,        // Auto-release after 5 minutes
  timeout: 5000,   // Wait up to 5 seconds to acquire
  workerId: process.pid
});

if (!lock) {
  console.log('Could not acquire lock');
  return;
}

try {
  // Do critical work...
  await this.consolidateUserData('user123');
} finally {
  // Always release lock
  await storage.releaseLock('consolidate:user123');
}

// Check if locked
const isLocked = await storage.isLocked('consolidate:user123');
```

**Before (Manual Lock Implementation):**
```javascript
// ❌ OLD WAY: Manual locks with Resources (33 lines)
const lockResource = await database.createResource({
  name: 'locks',
  attributes: { id: 'string', lockedAt: 'number', workerId: 'string' }
});

const [lockAcquired] = await tryFn(() =>
  lockResource.insert({
    id: `lock-${id}`,
    lockedAt: Date.now(),
    workerId: process.pid
  })
);

if (!lockAcquired) return;

try {
  // Do work
} finally {
  await lockResource.delete(`lock-${id}`);
}

// Manual cleanup of stale locks
const locks = await lockResource.list();
for (const lock of locks) {
  if (Date.now() - lock.lockedAt > 300000) {
    await lockResource.delete(lock.id);
  }
}
```

**After (PluginStorage with TTL):**
```javascript
// ✅ NEW WAY: TTL-based locks (6 lines, 82% less code!)
const storage = this.getStorage();
const lock = await storage.acquireLock(id, { ttl: 300 });
if (!lock) return;

try {
  // Do work
} finally {
  await storage.releaseLock(id);
}
// No manual cleanup needed - TTL handles it! ✨
```

#### Convenience Methods

PluginStorage includes helpful utility methods:

```javascript
const storage = this.getStorage();

// Check existence (not expired)
const exists = await storage.has('config'); // true/false

// Atomic counter operations
await storage.set('counter', { value: 0 });
await storage.increment('counter', 5);  // +5
await storage.decrement('counter', 2);  // -2
const counter = await storage.get('counter'); // { value: 3 }

// TTL management
const ttl = await storage.getTTL('session'); // Remaining seconds
await storage.touch('session', 60);          // Extend by 60s
const expired = await storage.isExpired('session'); // true/false
```

#### Key Structure

PluginStorage uses hierarchical S3 keys for organization:

```javascript
// Global plugin data: plugin={slug}/{path}
storage.getPluginKey(null, 'config')
// → "plugin=my-plugin/config"

storage.getPluginKey(null, 'state', 'current')
// → "plugin=my-plugin/state/current"

// Resource-scoped data: resource={name}/plugin={slug}/{path}
storage.getPluginKey('users', 'cache', 'user-123')
// → "resource=users/plugin=my-plugin/cache/user-123"

storage.getPluginKey('wallets', 'transactions', 'txn-456')
// → "resource=wallets/plugin=my-plugin/transactions/txn-456"
```

#### Core Methods

##### `set(key, data, options)`

Save data to S3 with automatic encoding, behavior handling, and optional TTL:

```javascript
const storage = this.getStorage();

// Simple set with body-overflow (default)
await storage.set(
  storage.getPluginKey(null, 'config'),
  { mode: 'async', interval: 5000 }
);

// Set with TTL (auto-expires after 300 seconds)
await storage.set(
  storage.getPluginKey('users', 'session', 'user-1'),
  { token: 'abc123', loggedInAt: Date.now() },
  { ttl: 300 }
);

// Force everything to body
await storage.set(
  storage.getPluginKey('users', 'cache', 'user-1'),
  { huge: 'data'.repeat(1000) },
  { behavior: 'body-only' }
);

// Enforce strict metadata limits
await storage.set(
  storage.getPluginKey(null, 'small-config'),
  { enabled: true },
  { behavior: 'enforce-limits' } // Throws if exceeds 2KB
);
```

> **Note**: `put()` is still available as a deprecated alias for backward compatibility.

##### `get(key)`

Retrieve data with automatic decoding:

```javascript
// Get global config
const config = await storage.get(
  storage.getPluginKey(null, 'config')
);

// Get resource-scoped data
const cachedUser = await storage.get(
  storage.getPluginKey('users', 'cache', 'user-1')
);

// Returns null if not found
const missing = await storage.get(
  storage.getPluginKey(null, 'nonexistent')
);
// missing === null
```

##### `list(prefix, options)`

List all keys with a given prefix:

```javascript
// List all plugin keys
const allKeys = await storage.list();
// ['plugin=my-plugin/config', 'plugin=my-plugin/state', ...]

// List with prefix
const configKeys = await storage.list('config');
// ['plugin=my-plugin/config/general', 'plugin=my-plugin/config/advanced']

// List with limit
const first10 = await storage.list('', { limit: 10 });
```

##### `listForResource(resourceName, subPrefix, options)`

List keys for a specific resource:

```javascript
// List all data for 'users' resource
const userKeys = await storage.listForResource('users');
// ['resource=users/plugin=my-plugin/cache/user-1', ...]

// List with subprefix
const userCacheKeys = await storage.listForResource('users', 'cache');
// ['resource=users/plugin=my-plugin/cache/user-1', 'resource=users/plugin=my-plugin/cache/user-2']

// List with limit
const first5 = await storage.listForResource('users', '', { limit: 5 });
```

##### `delete(key)`

Delete a single key:

```javascript
await storage.delete(
  storage.getPluginKey(null, 'temp-data')
);
```

##### `deleteAll(resourceName)`

Delete all plugin data (useful for uninstall):

```javascript
// Delete all data for specific resource
const deleted = await storage.deleteAll('users');
console.log(`Deleted ${deleted} objects from users resource`);

// Delete ALL plugin data (global + all resources)
const totalDeleted = await storage.deleteAll();
console.log(`Deleted ${totalDeleted} total objects`);
```

##### `batchPut(items)` and `batchGet(keys)`

Efficient bulk operations:

```javascript
// Batch put
const items = [
  { key: storage.getPluginKey(null, 'item-1'), data: { value: 1 } },
  { key: storage.getPluginKey(null, 'item-2'), data: { value: 2 } },
  { key: storage.getPluginKey(null, 'item-3'), data: { value: 3 } }
];

const results = await storage.batchPut(items);
results.forEach(r => console.log(`${r.key}: ${r.ok ? 'OK' : r.error}`));

// Batch get
const keys = [
  storage.getPluginKey(null, 'item-1'),
  storage.getPluginKey(null, 'item-2')
];

const data = await storage.batchGet(keys);
data.forEach(d => console.log(d.ok ? d.data : d.error));
```

#### TTL Management Methods

##### `has(key)`

Check if a key exists and is not expired:

```javascript
const exists = await storage.has('session:user123'); // true/false
```

##### `isExpired(key)`

Check if a key is expired:

```javascript
const expired = await storage.isExpired('session:user123');
if (expired) {
  console.log('Session has expired');
}
```

##### `getTTL(key)`

Get remaining TTL in seconds:

```javascript
const remaining = await storage.getTTL('session:user123');
if (remaining) {
  console.log(`Expires in ${remaining} seconds`);
} else {
  console.log('No TTL set or key not found');
}
```

##### `touch(key, additionalSeconds)`

Extend TTL by adding more seconds:

```javascript
// Add 60 more seconds to current TTL
const extended = await storage.touch('session:user123', 60);
if (extended) {
  console.log('TTL extended successfully');
}
```

#### Distributed Lock Methods

##### `acquireLock(lockName, options)`

Acquire a distributed lock with TTL and retry logic:

```javascript
const lock = await storage.acquireLock('process:task1', {
  ttl: 300,        // Auto-release after 5 minutes
  timeout: 5000,   // Wait up to 5 seconds to acquire
  workerId: process.pid
});

if (lock) {
  console.log('Lock acquired:', lock.workerId);
} else {
  console.log('Could not acquire lock');
}
```

##### `releaseLock(lockName)`

Release a distributed lock:

```javascript
await storage.releaseLock('process:task1');
```

##### `isLocked(lockName)`

Check if a lock is currently held:

```javascript
const locked = await storage.isLocked('process:task1');
if (locked) {
  console.log('Lock is currently held');
}
```

#### Counter Methods

##### `increment(key, amount, options)`

Atomically increment a counter:

```javascript
// Increment by 1 (default)
await storage.increment('api-calls');

// Increment by custom amount
await storage.increment('api-calls', 5);

// Increment with TTL
await storage.increment('hourly-requests', 1, { ttl: 3600 });
```

##### `decrement(key, amount, options)`

Atomically decrement a counter:

```javascript
// Decrement by 1 (default)
await storage.decrement('available-slots');

// Decrement by custom amount
await storage.decrement('available-slots', 3);
```

#### Real-World Patterns

##### Pattern 1: Transaction Log with TTL (EventualConsistency)

```javascript
class EventualConsistencyPlugin extends Plugin {
  async saveTransaction(resourceName, field, transaction) {
    const storage = this.getStorage();

    await storage.set(
      storage.getPluginKey(resourceName, field, 'transactions', `id=${transaction.id}`),
      transaction,
      {
        behavior: 'body-overflow',
        ttl: 3600 // Auto-expire after 1 hour
      }
    );
  }

  async getPendingTransactions(resourceName, field, originalId) {
    const storage = this.getStorage();

    // List all transactions for this field
    const keys = await storage.listForResource(resourceName, `${field}/transactions`);

    // Filter for specific original ID
    const txnKeys = keys.filter(key => key.includes(`/originalId=${originalId}/`));

    // Batch get all transactions (expired ones return null automatically)
    const results = await storage.batchGet(txnKeys);

    return results.filter(r => r.ok && r.data).map(r => r.data);
  }

  async deleteAppliedTransactions(resourceName, field, transactionIds) {
    const storage = this.getStorage();

    for (const id of transactionIds) {
      await storage.delete(
        storage.getPluginKey(resourceName, field, 'transactions', `id=${id}`)
      );
    }
  }
}
```

##### Pattern 2: Cache Plugin with Automatic TTL

```javascript
class CachePlugin extends Plugin {
  async cacheRecord(resourceName, id, data, ttlSeconds) {
    const storage = this.getStorage();

    // Use built-in TTL - no manual expiration needed!
    await storage.set(
      storage.getPluginKey(resourceName, 'cache', id),
      { ...data, cachedAt: Date.now() },
      {
        ttl: ttlSeconds,
        behavior: 'body-only' // Large data in body
      }
    );
  }

  async getCachedRecord(resourceName, id) {
    const storage = this.getStorage();

    // get() automatically returns null if expired
    const data = await storage.get(
      storage.getPluginKey(resourceName, 'cache', id)
    );

    return data; // null if expired or not found
  }

  async extendCache(resourceName, id, additionalSeconds) {
    const storage = this.getStorage();

    // Extend TTL without rewriting data
    const extended = await storage.touch(
      storage.getPluginKey(resourceName, 'cache', id),
      additionalSeconds
    );

    return extended;
  }

  async invalidateCache(resourceName, id) {
    const storage = this.getStorage();

    await storage.delete(
      storage.getPluginKey(resourceName, 'cache', id)
    );
  }

  async invalidateAllForResource(resourceName) {
    const storage = this.getStorage();

    const deleted = await storage.deleteAll(resourceName);
    console.log(`Invalidated ${deleted} cached records for ${resourceName}`);
  }
}
```

##### Pattern 3: Plugin Configuration & State

```javascript
class MyPlugin extends Plugin {
  async onInstall() {
    const storage = this.getStorage();

    // Initialize config if not exists
    let config = await storage.get(storage.getPluginKey(null, 'config'));

    if (!config) {
      config = {
        mode: 'async',
        interval: 5000,
        enabled: true,
        lastRun: null
      };

      await storage.set(
        storage.getPluginKey(null, 'config'),
        config
      );
    }

    this.config = config;
  }

  async updateConfig(changes) {
    const storage = this.getStorage();

    this.config = { ...this.config, ...changes };

    await storage.set(
      storage.getPluginKey(null, 'config'),
      this.config
    );
  }

  async saveState(state) {
    const storage = this.getStorage();

    await storage.set(
      storage.getPluginKey(null, 'state'),
      {
        ...state,
        updatedAt: Date.now()
      }
    );
  }

  async getState() {
    const storage = this.getStorage();

    return await storage.get(
      storage.getPluginKey(null, 'state')
    );
  }
}
```

##### Pattern 4: Analytics & Metrics

```javascript
class AnalyticsPlugin extends Plugin {
  async recordMetric(resourceName, field, cohort, metrics) {
    const storage = this.getStorage();

    await storage.set(
      storage.getPluginKey(resourceName, field, 'analytics', cohort),
      {
        cohort,
        count: metrics.count,
        sum: metrics.sum,
        avg: metrics.avg,
        min: metrics.min,
        max: metrics.max,
        recordedAt: Date.now()
      },
      { behavior: 'body-overflow' }
    );
  }

  async getAnalytics(resourceName, field, startCohort, endCohort) {
    const storage = this.getStorage();

    // List all analytics for field
    const keys = await storage.listForResource(resourceName, `${field}/analytics`);

    // Filter by cohort range
    const relevantKeys = keys.filter(key => {
      const cohort = key.split('/').pop();
      return cohort >= startCohort && cohort <= endCohort;
    });

    // Batch get
    const results = await storage.batchGet(relevantKeys);

    return results.filter(r => r.ok).map(r => r.data);
  }
}
```

#### Behavior Strategies

PluginStorage supports three behavior strategies for handling S3's 2KB metadata limit:

##### `body-overflow` (Default - Recommended)

Automatically distributes data between metadata and body based on field size:

```javascript
await storage.set(key, data, { behavior: 'body-overflow' });
```

- **Small fields** → Metadata (fast, no additional read)
- **Large fields** → Body (bypass metadata limit)
- **Automatic optimization** based on UTF-8 byte size

##### `body-only`

Stores all data in S3 body:

```javascript
await storage.set(key, largeData, { behavior: 'body-only' });
```

- **Best for**: Large objects (> 2KB)
- **Metadata**: Only contains minimal system fields
- **Body limit**: 5TB per object

##### `enforce-limits`

Throws error if data exceeds metadata limit:

```javascript
try {
  await storage.set(key, data, { behavior: 'enforce-limits' });
} catch (error) {
  console.error('Data exceeds 2KB limit:', error.message);
}
```

- **Best for**: Strict data validation
- **Throws**: If data > 2KB
- **Use case**: Ensure data fits in metadata for fastest access

#### Cleanup on Uninstall

Always clean up plugin data when uninstalling:

```javascript
class MyPlugin extends Plugin {
  async onUninstall(options = {}) {
    const { purgeData = false } = options;

    if (purgeData) {
      const storage = this.getStorage();

      // Delete all plugin data
      const deleted = await storage.deleteAll();
      console.log(`Cleaned up ${deleted} plugin objects`);
    }
  }
}

// Usage
await database.uninstallPlugin(myPlugin, { purgeData: true });
```

#### Performance Tips

1. **Use `body-overflow` for mixed data sizes** - Automatic optimization
2. **Batch operations** when possible - Reduces API calls
3. **Use `listForResource()`** instead of `list()` when filtering by resource
4. **Cache frequently accessed data** in memory within your plugin
5. **Use descriptive key paths** for easier debugging

#### Common Pitfalls

❌ **Don't use camelCase in keys** - S3 converts metadata keys to lowercase

```javascript
// Bad
await storage.put(key, { firstName: 'Alice', lastName: 'Smith' });
// Retrieved as: { firstname: 'Alice', lastname: 'Smith' }

// Good
await storage.put(key, { first_name: 'Alice', last_name: 'Smith' });
```

❌ **Don't forget to handle null returns**

```javascript
// Bad
const data = await storage.get(key);
console.log(data.field); // Crashes if key doesn't exist

// Good
const data = await storage.get(key);
if (data) {
  console.log(data.field);
}
```

❌ **Don't skip cleanup**

```javascript
// Bad
async onUninstall() {
  // Nothing - leaves orphaned data
}

// Good
async onUninstall(options = {}) {
  if (options.purgeData) {
    await this.getStorage().deleteAll();
  }
}
```

#### Testing PluginStorage

```javascript
import { PluginStorage } from 's3db.js';
import { createDatabaseForTest } from './test-utils';

describe('MyPlugin with PluginStorage', () => {
  let db, plugin, storage;

  beforeEach(async () => {
    db = createDatabaseForTest('my-plugin-test');
    await db.connect();

    plugin = new MyPlugin();
    await plugin.install(db);

    storage = new PluginStorage(db.client, 'my-plugin');
  });

  afterEach(async () => {
    await storage.deleteAll(); // Cleanup
    await db.disconnect();
  });

  it('should persist plugin configuration', async () => {
    const key = storage.getPluginKey(null, 'config');

    await storage.set(key, { enabled: true });

    const retrieved = await storage.get(key);
    expect(retrieved.enabled).toBe(true);
  });

  it('should handle TTL expiration', async () => {
    const key = storage.getPluginKey(null, 'session');

    // Set with 1 second TTL
    await storage.set(key, { userId: 'user1' }, { ttl: 1 });

    // Should exist immediately
    expect(await storage.has(key)).toBe(true);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should be expired and return null
    expect(await storage.get(key)).toBe(null);
    expect(await storage.has(key)).toBe(false);
  });

  it('should handle distributed locks', async () => {
    const lock1 = await storage.acquireLock('task1', { ttl: 5 });
    expect(lock1).toBeTruthy();

    // Second acquire should fail (already locked)
    const lock2 = await storage.acquireLock('task1', { timeout: 0 });
    expect(lock2).toBe(null);

    // Release lock
    await storage.releaseLock('task1');

    // Now should be able to acquire
    const lock3 = await storage.acquireLock('task1', { ttl: 5 });
    expect(lock3).toBeTruthy();
  });

  it('should handle atomic counters', async () => {
    await storage.set('counter', { value: 0 });

    await storage.increment('counter', 5);
    await storage.increment('counter', 3);
    await storage.decrement('counter', 2);

    const counter = await storage.get('counter');
    expect(counter.value).toBe(6); // 0 + 5 + 3 - 2 = 6
  });

  it('should isolate resource-scoped data', async () => {
    await storage.set(
      storage.getPluginKey('users', 'cache', 'user-1'),
      { name: 'Alice' }
    );

    await storage.set(
      storage.getPluginKey('products', 'cache', 'prod-1'),
      { title: 'Product 1' }
    );

    const userKeys = await storage.listForResource('users');
    expect(userKeys.length).toBe(1);

    const productKeys = await storage.listForResource('products');
    expect(productKeys.length).toBe(1);
  });
});
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