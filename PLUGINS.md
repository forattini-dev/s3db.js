# 🔌 s3db.js Plugins Documentation

<p align="center">
  <strong>Comprehensive guide to all s3db.js plugins</strong><br>
  <em>Extend your database with powerful features</em>
</p>

---

## 📋 Table of Contents

- [🚀 Getting Started](#-getting-started-with-plugins)
- [🧩 Available Plugins](#-available-plugins)
  - [💾 Cache Plugin](#-cache-plugin)
  - [💰 Costs Plugin](#-costs-plugin)
  - [📝 Audit Plugin](#-audit-plugin)
  - [🔍 FullText Plugin](#-fulltext-plugin)
  - [📊 Metrics Plugin](#-metrics-plugin)
  - [🔄 Replicator Plugin](#-replicator-plugin)
  - [📬 Queue Consumer Plugin](#-queue-consumer-plugin)
- [🔧 Plugin Development](#-plugin-development)
- [💡 Plugin Combinations](#-plugin-combinations)
- [🎯 Best Practices](#-best-practices)

---

## 🚀 Getting Started with Plugins

Plugins extend s3db.js with additional functionality. They can be used individually or combined for powerful workflows.

### Basic Plugin Usage

```javascript
import { S3db, CachePlugin, CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [
    new CachePlugin(),
    CostsPlugin // Some plugins are static objects
  ]
});

await s3db.connect();
```

### Plugin Types

- **Instance Plugins**: Require `new` - `new CachePlugin(config)`
- **Static Plugins**: Used directly - `CostsPlugin`
- **Configurable**: Accept options for customization
- **Event-Driven**: Emit events for monitoring and integration

---

## 🧩 Available Plugins

## 💾 Cache Plugin

Intelligent caching system that reduces S3 API calls and improves performance by storing frequently accessed data in memory or S3.

### ⚡ Quick Start

```javascript
import { S3db, CachePlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new CachePlugin()]
});

await s3db.connect();

// Cache is automatically used for read operations
const users = s3db.resource('users');
await users.count(); // Cached for default TTL
await users.list();  // Cached result
```

### ⚙️ Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `driverType` | string | `'s3'` | Cache driver: `'memory'` or `'s3'` |
| `ttl` | number | `300000` | Time-to-live in milliseconds (5 minutes) |
| `maxSize` | number | `1000` | Maximum number of items in cache (memory driver) |
| `includePartitions` | boolean | `true` | Include partition values in cache keys |
| `driver` | object | `null` | Custom cache driver instance |
| `memoryOptions` | object | `{}` | Options for memory cache driver |
| `s3Options` | object | `{}` | Options for S3 cache driver |

### Memory Driver Options (`memoryOptions`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxSize` | number | `1000` | Maximum items in memory |
| `ttl` | number | `300000` | Default TTL in milliseconds |
| `checkPeriod` | number | `600000` | Cleanup interval in milliseconds |

### S3 Driver Options (`s3Options`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `bucket` | string | Same as database | S3 bucket for cache storage |
| `prefix` | string | `'cache/'` | S3 key prefix for cache objects |
| `client` | object | Database client | Custom S3 client instance |

### 🔧 Easy Example

```javascript
import { S3db, CachePlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new CachePlugin({
    driverType: 'memory',
    ttl: 600000, // 10 minutes
    maxSize: 500
  })]
});

await s3db.connect();

const products = s3db.resource('products');

// First call hits the database
console.time('First call');
const result1 = await products.count();
console.timeEnd('First call'); // ~200ms

// Second call uses cache
console.time('Cached call');
const result2 = await products.count();
console.timeEnd('Cached call'); // ~2ms

// Cache is automatically cleared on write operations
await products.insert({ name: 'New Product', price: 29.99 });

// Next call will hit database again (cache cleared)
const result3 = await products.count(); // Fresh data
```

### 🚀 Advanced Configuration Example

```javascript
import { S3db, CachePlugin, MemoryCache, S3Cache } from 's3db.js';

// Custom cache driver with advanced configuration
const customCache = new MemoryCache({
  maxSize: 2000,
  ttl: 900000, // 15 minutes
  checkPeriod: 300000, // 5 minutes cleanup
  algorithm: 'lru' // Least Recently Used
});

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new CachePlugin({
    driver: customCache,
    includePartitions: true,
    
    // S3 cache fallback for persistence
    s3Options: {
      bucket: 'my-cache-bucket',
      prefix: 'app-cache/',
      ttl: 3600000, // 1 hour S3 cache
      compression: true,
      encryption: true
    },
    
    // Memory cache for speed
    memoryOptions: {
      maxSize: 5000,
      ttl: 600000, // 10 minutes memory cache
      checkPeriod: 120000, // 2 minutes cleanup
      evictionPolicy: 'lru',
      stats: true // Enable cache statistics
    }
  })]
});

await s3db.connect();

// Access cache methods on resources
const users = s3db.resource('users');

// Generate custom cache keys
const cacheKey = await users.cacheKeyFor({
  action: 'list',
  params: { limit: 10 },
  partition: 'byStatus',
  partitionValues: { status: 'active' }
});

// Manual cache operations
await users.cache.set(cacheKey, data, 1800000); // 30 minutes
const cached = await users.cache.get(cacheKey);
await users.cache.delete(cacheKey);
await users.cache.clear(); // Clear all cache

// Cache statistics (if enabled)
const stats = users.cache.stats();
console.log('Cache hit rate:', stats.hitRate);
console.log('Total hits:', stats.hits);
console.log('Total misses:', stats.misses);
```

---

## 💰 Costs Plugin

Track and monitor AWS S3 costs in real-time by calculating expenses for each API operation. Essential for cost optimization and budget management.

### ⚡ Quick Start

```javascript
import { S3db, CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin] // Static plugin - no 'new' required
});

await s3db.connect();

// Use your database normally
const users = s3db.resource('users');
await users.insert({ name: 'John', email: 'john@example.com' });
await users.list();

// Check costs
console.log('Total cost:', s3db.client.costs.total);
console.log('Request breakdown:', s3db.client.costs.requests);
```

### ⚙️ Configuration Parameters

**Note**: CostsPlugin is a static plugin with no configuration options. It automatically tracks all S3 operations.

### Cost Tracking Details

| Operation | Cost per 1000 requests | Tracked Commands |
|-----------|------------------------|------------------|
| PUT operations | $0.005 | PutObjectCommand |
| GET operations | $0.0004 | GetObjectCommand |
| HEAD operations | $0.0004 | HeadObjectCommand |
| DELETE operations | $0.0004 | DeleteObjectCommand, DeleteObjectsCommand |
| LIST operations | $0.005 | ListObjectsV2Command |

### Cost Data Structure

```javascript
{
  total: 0.000123,           // Total cost in USD
  prices: {                  // Cost per 1000 requests
    put: 0.000005,
    get: 0.0000004,
    head: 0.0000004,
    delete: 0.0000004,
    list: 0.000005
  },
  requests: {                // Request counters
    total: 15,
    put: 3,
    get: 8,
    head: 2,
    delete: 1,
    list: 1
  },
  events: {                  // Command-specific counters
    total: 15,
    PutObjectCommand: 3,
    GetObjectCommand: 8,
    HeadObjectCommand: 2,
    DeleteObjectCommand: 1,
    ListObjectsV2Command: 1
  }
}
```

### 🔧 Easy Example

```javascript
import { S3db, CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

await s3db.connect();

const products = s3db.resource('products');

// Perform operations and track costs
await products.insert({ name: 'Widget A', price: 19.99 });
await products.insert({ name: 'Widget B', price: 29.99 });
await products.list();
await products.count();

// Analyze costs
const costs = s3db.client.costs;
console.log(`Operations performed: ${costs.requests.total}`);
console.log(`Total cost: $${costs.total.toFixed(6)}`);
console.log(`Most expensive operation: PUT (${costs.requests.put} requests)`);

// Cost breakdown
console.log('\nCost breakdown:');
Object.entries(costs.requests).forEach(([operation, count]) => {
  if (operation !== 'total' && count > 0) {
    const operationCost = count * costs.prices[operation];
    console.log(`  ${operation.toUpperCase()}: ${count} requests = $${operationCost.toFixed(6)}`);
  }
});
```

### 🚀 Advanced Monitoring Example

```javascript
import { S3db, CostsPlugin } from 's3db.js';

class CostMonitor {
  constructor(s3db) {
    this.s3db = s3db;
    this.startTime = Date.now();
    this.checkpoints = [];
  }
  
  checkpoint(label) {
    const costs = { ...this.s3db.client.costs };
    const timestamp = Date.now();
    
    this.checkpoints.push({
      label,
      timestamp,
      costs,
      duration: timestamp - this.startTime
    });
    
    return costs;
  }
  
  report() {
    console.log('\n=== Cost Analysis Report ===');
    
    for (let i = 0; i < this.checkpoints.length; i++) {
      const checkpoint = this.checkpoints[i];
      const prevCheckpoint = i > 0 ? this.checkpoints[i - 1] : null;
      
      console.log(`\n${checkpoint.label}:`);
      console.log(`  Time: ${checkpoint.duration}ms`);
      console.log(`  Total cost: $${checkpoint.costs.total.toFixed(6)}`);
      
      if (prevCheckpoint) {
        const costDiff = checkpoint.costs.total - prevCheckpoint.costs.total;
        const requestDiff = checkpoint.costs.requests.total - prevCheckpoint.costs.requests.total;
        console.log(`  Cost increase: $${costDiff.toFixed(6)}`);
        console.log(`  New requests: ${requestDiff}`);
      }
    }
    
    // Efficiency metrics
    const finalCosts = this.checkpoints[this.checkpoints.length - 1].costs;
    const totalTime = this.checkpoints[this.checkpoints.length - 1].duration;
    
    console.log('\n=== Efficiency Metrics ===');
    console.log(`Total execution time: ${totalTime}ms`);
    console.log(`Total requests: ${finalCosts.requests.total}`);
    console.log(`Requests per second: ${(finalCosts.requests.total / (totalTime / 1000)).toFixed(2)}`);
    console.log(`Cost per request: $${(finalCosts.total / finalCosts.requests.total).toFixed(8)}`);
    console.log(`Monthly projection (1M ops): $${(finalCosts.total * 1000000).toFixed(2)}`);
  }
}

// Usage
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

await s3db.connect();

const monitor = new CostMonitor(s3db);
const users = s3db.resource('users');

// Bulk operations with cost tracking
monitor.checkpoint('Initial state');

// Bulk insert
const userData = Array.from({ length: 100 }, (_, i) => ({
  name: `User ${i}`,
  email: `user${i}@example.com`,
  role: i % 3 === 0 ? 'admin' : 'user'
}));

await users.insertMany(userData);
monitor.checkpoint('After bulk insert');

// Query operations
await users.count();
await users.list({ limit: 50 });
await users.list({ limit: 25, offset: 25 });
monitor.checkpoint('After queries');

// Update operations
const userList = await users.list({ limit: 10 });
for (const user of userList) {
  await users.update(user.id, { lastLogin: new Date().toISOString() });
}
monitor.checkpoint('After updates');

// Generate detailed report
monitor.report();

// Set cost alerts
const currentCost = s3db.client.costs.total;
if (currentCost > 0.01) { // $0.01 threshold
  console.warn(`⚠️  Cost threshold exceeded: $${currentCost.toFixed(6)}`);
}

// Export cost data for external analysis
const costData = {
  timestamp: new Date().toISOString(),
  sessionCosts: s3db.client.costs,
  checkpoints: monitor.checkpoints,
  summary: {
    totalCost: s3db.client.costs.total,
    totalRequests: s3db.client.costs.requests.total,
    avgCostPerRequest: s3db.client.costs.total / s3db.client.costs.requests.total,
    mostExpensiveOperation: Object.entries(s3db.client.costs.requests)
      .filter(([key]) => key !== 'total')
      .sort(([,a], [,b]) => b - a)[0]
  }
};

console.log('\nExportable cost data:', JSON.stringify(costData, null, 2));
```

---

## 📝 Audit Plugin

Comprehensive audit logging system that tracks all database operations for compliance, security monitoring, and debugging purposes.

### ⚡ Quick Start

```javascript
import { S3db, AuditPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new AuditPlugin({ enabled: true })]
});

await s3db.connect();

// All operations are automatically logged
const users = s3db.resource('users');
await users.insert({ name: 'John', email: 'john@example.com' });
await users.update(userId, { name: 'John Doe' });

// Access audit logs
const auditResource = s3db.resource('audits');
const logs = await auditResource.list();
console.log('Audit trail:', logs);
```

### ⚙️ Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable audit logging |
| `includeData` | boolean | `true` | Include data payloads in audit logs |
| `includePartitions` | boolean | `true` | Include partition information in logs |
| `maxDataSize` | number | `10000` | Maximum data size to log (bytes) |
| `trackOperations` | array | `['insert', 'update', 'delete']` | Operations to audit |
| `excludeResources` | array | `[]` | Resources to exclude from auditing |
| `userId` | function | `null` | Function to extract user ID from context |
| `metadata` | function | `null` | Function to add custom metadata |

### Audit Log Structure

```javascript
{
  id: 'audit-abc123',
  resourceName: 'users',
  operation: 'insert',
  recordId: 'user-123',
  userId: 'admin-456',
  timestamp: '2024-01-15T10:30:00.000Z',
  oldData: '{"name":"John"}',        // For updates
  newData: '{"name":"John Doe"}',    // JSON string of data
  partition: 'byStatus',             // If using partitions
  partitionValues: '{"status":"active"}',
  metadata: '{"ip":"192.168.1.1"}',  // Custom metadata
  _v: 0                              // Audit record version
}
```

### 🔧 Easy Example

```javascript
import { S3db, AuditPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new AuditPlugin({
    enabled: true,
    includeData: true,
    trackOperations: ['insert', 'update', 'delete', 'get'],
    maxDataSize: 5000
  })]
});

await s3db.connect();

const products = s3db.resource('products');
const audits = s3db.resource('audits');

// Perform operations (automatically audited)
const product = await products.insert({
  name: 'Gaming Laptop',
  price: 1299.99,
  category: 'electronics'
});

await products.update(product.id, { price: 1199.99 });
await products.get(product.id);
await products.delete(product.id);

// Review audit trail
const auditLogs = await audits.list();

console.log('\n=== Audit Trail ===');
auditLogs.forEach(log => {
  console.log(`${log.timestamp} | ${log.operation.toUpperCase()} | ${log.resourceName} | ${log.recordId}`);
  
  if (log.operation === 'update') {
    const oldData = JSON.parse(log.oldData);
    const newData = JSON.parse(log.newData);
    console.log(`  Price changed: $${oldData.price} → $${newData.price}`);
  }
});

// Query specific audit logs
const updateLogs = await audits.list({
  filter: log => log.operation === 'update'
});

console.log(`\nFound ${updateLogs.length} update operations`);
```

### 🚀 Advanced Configuration Example

```javascript
import { S3db, AuditPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new AuditPlugin({
    enabled: true,
    includeData: true,
    includePartitions: true,
    maxDataSize: 20000, // 20KB limit
    
    // Track all operations including reads
    trackOperations: ['insert', 'update', 'delete', 'get', 'list'],
    
    // Exclude sensitive resources from auditing
    excludeResources: ['sessions', 'temp_data'],
    
    // Extract user ID from request context
    userId: (context) => {
      return context?.user?.id || 
             context?.headers?.['x-user-id'] || 
             'anonymous';
    },
    
    // Add custom metadata to audit logs
    metadata: (operation, resourceName, data, context) => {
      return {
        ip: context?.ip,
        userAgent: context?.userAgent,
        sessionId: context?.sessionId,
        apiVersion: '1.0',
        environment: process.env.NODE_ENV,
        requestId: context?.requestId,
        
        // Operation-specific metadata
        ...(operation === 'insert' && { 
          createdVia: 'api',
          validationPassed: true 
        }),
        
        ...(operation === 'update' && {
          fieldsChanged: Object.keys(data || {}),
          automaticUpdate: false
        }),
        
        ...(operation === 'delete' && {
          softDelete: false,
          cascadeDelete: false
        })
      };
    }
  })]
});

await s3db.connect();

// Custom audit query functions
class AuditAnalyzer {
  constructor(auditResource) {
    this.audits = auditResource;
  }
  
  async getUserActivity(userId, timeRange = 24) {
    const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
    const logs = await this.audits.list();
    
    return logs.filter(log => 
      log.userId === userId && 
      new Date(log.timestamp) > since
    );
  }
  
  async getResourceActivity(resourceName, operation = null) {
    const logs = await this.audits.list();
    
    return logs.filter(log => 
      log.resourceName === resourceName &&
      (!operation || log.operation === operation)
    );
  }
  
  async getDataChanges(resourceName, recordId) {
    const logs = await this.audits.list();
    
    return logs
      .filter(log => 
        log.resourceName === resourceName && 
        log.recordId === recordId &&
        log.operation === 'update'
      )
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(log => ({
        timestamp: log.timestamp,
        oldData: JSON.parse(log.oldData || '{}'),
        newData: JSON.parse(log.newData || '{}'),
        userId: log.userId,
        metadata: JSON.parse(log.metadata || '{}')
      }));
  }
  
  async generateComplianceReport(startDate, endDate) {
    const logs = await this.audits.list();
    
    const filteredLogs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= startDate && logDate <= endDate;
    });
    
    const summary = {
      totalOperations: filteredLogs.length,
      operationBreakdown: {},
      resourceActivity: {},
      userActivity: {},
      timeRange: { startDate, endDate }
    };
    
    filteredLogs.forEach(log => {
      // Operation breakdown
      summary.operationBreakdown[log.operation] = 
        (summary.operationBreakdown[log.operation] || 0) + 1;
      
      // Resource activity
      summary.resourceActivity[log.resourceName] = 
        (summary.resourceActivity[log.resourceName] || 0) + 1;
      
      // User activity
      summary.userActivity[log.userId] = 
        (summary.userActivity[log.userId] || 0) + 1;
    });
    
    return summary;
  }
}

// Usage with context
const users = s3db.resource('users');
const audits = s3db.resource('audits');
const analyzer = new AuditAnalyzer(audits);

// Simulate operations with user context
const userContext = {
  user: { id: 'admin-123', role: 'admin' },
  ip: '192.168.1.100',
  userAgent: 'Mozilla/5.0...',
  sessionId: 'sess-789',
  requestId: 'req-456'
};

// Operations with context (would be passed through middleware in real app)
await users.insert({ 
  name: 'Alice Johnson', 
  email: 'alice@example.com' 
}, userContext);

// Analyze audit data
const userActivity = await analyzer.getUserActivity('admin-123');
console.log('Recent user activity:', userActivity);

const complianceReport = await analyzer.generateComplianceReport(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
  new Date()
);

console.log('\n=== Compliance Report ===');
console.log(`Total operations: ${complianceReport.totalOperations}`);
console.log('Operation breakdown:', complianceReport.operationBreakdown);
console.log('Most active resource:', 
  Object.entries(complianceReport.resourceActivity)
    .sort(([,a], [,b]) => b - a)[0]
);

// Real-time audit monitoring
audits.on('insert', (auditLog) => {
  console.log(`🔍 New audit log: ${auditLog.operation} on ${auditLog.resourceName}`);
  
  // Security alerts
  if (auditLog.operation === 'delete' && auditLog.userId === 'anonymous') {
    console.warn('🚨 SECURITY ALERT: Anonymous user performed delete operation');
  }
  
  if (auditLog.operation === 'get' && auditLog.resourceName === 'sensitive_data') {
    console.warn('🔒 PRIVACY ALERT: Sensitive data accessed');
  }
});

// Audit log retention and cleanup
setInterval(async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const oldLogs = await audits.list({
    filter: log => new Date(log.timestamp) < thirtyDaysAgo
  });
  
  console.log(`Cleaning up ${oldLogs.length} old audit logs`);
  
  for (const log of oldLogs) {
    await audits.delete(log.id);
  }
}, 24 * 60 * 60 * 1000); // Daily cleanup
```

---

## 🔍 FullText Plugin

Powerful full-text search engine with automatic indexing, scoring, and advanced search capabilities for your s3db resources.

### ⚡ Quick Start

```javascript
import { S3db, FullTextPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new FullTextPlugin({ 
    enabled: true,
    fields: ['title', 'description', 'content'] 
  })]
});

await s3db.connect();

const articles = s3db.resource('articles');

// Insert data (automatically indexed)
await articles.insert({
  title: 'Introduction to Machine Learning',
  description: 'A comprehensive guide to ML basics',
  content: 'Machine learning is a subset of artificial intelligence...'
});

// Search across indexed fields
const results = await s3db.plugins.fulltext.searchRecords('articles', 'machine learning');
console.log('Search results:', results);
```

### ⚙️ Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable full-text search |
| `fields` | array | `[]` | Fields to index for search |
| `minWordLength` | number | `3` | Minimum word length for indexing |
| `maxResults` | number | `100` | Maximum search results to return |
| `language` | string | `'en-US'` | Language for text processing |
| `stopWords` | array | `['the', 'a', 'an', ...]` | Words to exclude from indexing |
| `stemming` | boolean | `false` | Enable word stemming |
| `caseSensitive` | boolean | `false` | Case-sensitive search |
| `fuzzySearch` | boolean | `false` | Enable fuzzy matching |
| `indexName` | string | `'fulltext_indexes'` | Name of index resource |

### Search Result Structure

```javascript
{
  id: 'article-123',
  title: 'Introduction to Machine Learning',
  description: 'A comprehensive guide to ML basics',
  content: 'Machine learning is a subset...',
  _searchScore: 0.85,              // Relevance score (0-1)
  _matchedFields: ['title', 'content'],  // Fields with matches
  _matchedWords: ['machine', 'learning'], // Matched search terms
  _highlights: {                   // Highlighted snippets
    title: 'Introduction to <mark>Machine Learning</mark>',
    content: '<mark>Machine learning</mark> is a subset...'
  }
}
```

### 🔧 Easy Example

```javascript
import { S3db, FullTextPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new FullTextPlugin({
    enabled: true,
    fields: ['name', 'description', 'tags'],
    minWordLength: 2,
    maxResults: 50
  })]
});

await s3db.connect();

const products = s3db.resource('products');

// Add products with searchable content
await products.insertMany([
  {
    name: 'Gaming Laptop Pro',
    description: 'High-performance laptop for gaming and productivity',
    tags: ['gaming', 'laptop', 'computer', 'electronics']
  },
  {
    name: 'Wireless Gaming Mouse',
    description: 'Precision wireless mouse designed for gamers',
    tags: ['gaming', 'mouse', 'wireless', 'electronics']
  },
  {
    name: 'Mechanical Keyboard',
    description: 'Professional mechanical keyboard with RGB lighting',
    tags: ['keyboard', 'mechanical', 'typing', 'electronics']
  }
]);

// Search for gaming products
const gamingProducts = await s3db.plugins.fulltext.searchRecords('products', 'gaming');

console.log('\n=== Gaming Products ===');
gamingProducts.forEach(product => {
  console.log(`${product.name} (Score: ${product._searchScore.toFixed(2)})`);
  console.log(`  Matched fields: ${product._matchedFields.join(', ')}`);
  console.log(`  Description: ${product.description}`);
});

// Search for wireless devices
const wirelessProducts = await s3db.plugins.fulltext.searchRecords('products', 'wireless');

console.log('\n=== Wireless Products ===');
wirelessProducts.forEach(product => {
  console.log(`${product.name} - ${product.description}`);
});

// Multi-word search
const laptopGaming = await s3db.plugins.fulltext.searchRecords('products', 'laptop gaming');

console.log('\n=== Laptop Gaming Search ===');
console.log(`Found ${laptopGaming.length} products matching "laptop gaming"`);
```

### 🚀 Advanced Configuration Example

```javascript
import { S3db, FullTextPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new FullTextPlugin({
    enabled: true,
    
    // Comprehensive field indexing
    fields: ['title', 'description', 'content', 'tags', 'category', 'author'],
    
    // Advanced text processing
    minWordLength: 2,
    maxResults: 200,
    language: 'en-US',
    stemming: true,          // Enable word stemming (run/running/ran)
    caseSensitive: false,
    fuzzySearch: true,       // Enable typo tolerance
    
    // Custom stop words (words to ignore)
    stopWords: [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ],
    
    // Advanced search options
    highlightTags: {
      start: '<mark class="highlight">',
      end: '</mark>'
    },
    
    // Custom scoring weights per field
    fieldWeights: {
      title: 3.0,        // Title matches score higher
      description: 2.0,   // Description is important
      content: 1.0,       // Content has normal weight
      tags: 2.5,          // Tags are highly relevant
      category: 1.5,      // Category is moderately important
      author: 1.0         // Author has normal weight
    },
    
    // Indexing behavior
    indexName: 'search_indexes',
    autoReindex: true,      // Automatically reindex on data changes
    batchSize: 100,         // Index batch size
    maxIndexSize: 10000     // Maximum index entries
  })]
});

await s3db.connect();

// Advanced search class with custom methods
class AdvancedSearch {
  constructor(fulltextPlugin) {
    this.plugin = fulltextPlugin;
  }
  
  async searchWithFilters(resourceName, query, filters = {}) {
    let results = await this.plugin.searchRecords(resourceName, query);
    
    // Apply additional filters
    if (filters.category) {
      results = results.filter(item => item.category === filters.category);
    }
    
    if (filters.minScore) {
      results = results.filter(item => item._searchScore >= filters.minScore);
    }
    
    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      results = results.filter(item => {
        const itemDate = new Date(item.createdAt);
        return itemDate >= start && itemDate <= end;
      });
    }
    
    return results;
  }
  
  async searchMultipleResources(resourceNames, query) {
    const allResults = [];
    
    for (const resourceName of resourceNames) {
      const results = await this.plugin.searchRecords(resourceName, query);
      allResults.push(...results.map(item => ({
        ...item,
        _resourceType: resourceName
      })));
    }
    
    // Sort by relevance across all resources
    return allResults.sort((a, b) => b._searchScore - a._searchScore);
  }
  
  async suggestWords(resourceName, partial) {
    // Get all indexed words that start with partial
    const allIndexes = await this.plugin.indexResource.list();
    
    const suggestions = allIndexes
      .filter(index => 
        index.resourceName === resourceName &&
        index.word.toLowerCase().startsWith(partial.toLowerCase())
      )
      .sort((a, b) => b.count - a.count) // Sort by frequency
      .slice(0, 10)
      .map(index => index.word);
    
    return [...new Set(suggestions)]; // Remove duplicates
  }
  
  async getSearchAnalytics(resourceName) {
    const indexes = await this.plugin.indexResource.list();
    const resourceIndexes = indexes.filter(i => i.resourceName === resourceName);
    
    const analytics = {
      totalWords: resourceIndexes.length,
      totalOccurrences: resourceIndexes.reduce((sum, i) => sum + i.count, 0),
      avgWordsPerDocument: 0,
      topWords: resourceIndexes
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map(i => ({ word: i.word, count: i.count })),
      wordDistribution: {},
      lastIndexed: Math.max(...resourceIndexes.map(i => new Date(i.lastUpdated)))
    };
    
    // Calculate word distribution by frequency ranges
    resourceIndexes.forEach(index => {
      const range = index.count < 5 ? 'rare' : 
                   index.count < 20 ? 'common' : 'frequent';
      analytics.wordDistribution[range] = (analytics.wordDistribution[range] || 0) + 1;
    });
    
    return analytics;
  }
}

// Setup sample data
const articles = s3db.resource('articles');
const products = s3db.resource('products');

await articles.insertMany([
  {
    title: 'Advanced JavaScript Techniques',
    description: 'Deep dive into modern JavaScript features',
    content: 'JavaScript has evolved significantly with ES6+ features...',
    tags: ['javascript', 'programming', 'web-development'],
    category: 'technology',
    author: 'John Smith'
  },
  {
    title: 'Machine Learning Fundamentals',
    description: 'Introduction to ML concepts and algorithms',
    content: 'Machine learning is revolutionizing how we process data...',
    tags: ['machine-learning', 'ai', 'data-science'],
    category: 'technology',
    author: 'Jane Doe'
  },
  {
    title: 'Sustainable Cooking Tips',
    description: 'Eco-friendly approaches to home cooking',
    content: 'Sustainable cooking practices can reduce your environmental impact...',
    tags: ['cooking', 'sustainability', 'environment'],
    category: 'lifestyle',
    author: 'Chef Maria'
  }
]);

// Initialize advanced search
const search = new AdvancedSearch(s3db.plugins.fulltext);

// Complex search with filters
const techArticles = await search.searchWithFilters('articles', 'javascript programming', {
  category: 'technology',
  minScore: 0.5
});

console.log('\n=== Technology Articles ===');
techArticles.forEach(article => {
  console.log(`${article.title} by ${article.author}`);
  console.log(`  Score: ${article._searchScore.toFixed(3)}`);
  console.log(`  Matches: ${article._matchedWords.join(', ')}`);
  console.log(`  Highlighted: ${article._highlights?.title || article.title}`);
});

// Multi-resource search
const allContent = await search.searchMultipleResources(['articles', 'products'], 'technology');

console.log('\n=== Cross-Resource Search ===');
allContent.forEach(item => {
  console.log(`[${item._resourceType.toUpperCase()}] ${item.title || item.name}`);
  console.log(`  Score: ${item._searchScore.toFixed(3)}`);
});

// Auto-complete suggestions
const suggestions = await search.suggestWords('articles', 'java');
console.log('\nSuggestions for "java":', suggestions);

// Search analytics
const analytics = await search.getSearchAnalytics('articles');
console.log('\n=== Search Analytics ===');
console.log(`Total indexed words: ${analytics.totalWords}`);
console.log(`Total word occurrences: ${analytics.totalOccurrences}`);
console.log('Top words:', analytics.topWords.slice(0, 5));
console.log('Word distribution:', analytics.wordDistribution);

// Real-time search monitoring
s3db.plugins.fulltext.on('indexed', (data) => {
  console.log(`🔍 Indexed: ${data.resourceName} - ${data.recordId}`);
});

s3db.plugins.fulltext.on('searched', (data) => {
  console.log(`🔎 Search: "${data.query}" in ${data.resourceName} (${data.results} results)`);
});

// Performance monitoring
console.time('Search Performance');
const perfResults = await s3db.plugins.fulltext.searchRecords('articles', 'machine learning javascript');
console.timeEnd('Search Performance');
console.log(`Search returned ${perfResults.length} results`);
```

---

## 📊 Metrics Plugin

Comprehensive performance monitoring and usage analytics system that tracks operation timing, resource usage, errors, and provides detailed insights.

### ⚡ Quick Start

```javascript
import { S3db, MetricsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new MetricsPlugin({ enabled: true })]
});

await s3db.connect();

// Use your database normally - metrics are collected automatically
const users = s3db.resource('users');
await users.insert({ name: 'John', email: 'john@example.com' });
await users.list();
await users.count();

// Get comprehensive metrics
const metrics = await s3db.plugins.metrics.getMetrics();
console.log('Performance metrics:', metrics);
```

### ⚙️ Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable metrics collection |
| `collectPerformance` | boolean | `true` | Track operation timing and performance |
| `collectErrors` | boolean | `true` | Track errors and failures |
| `collectUsage` | boolean | `true` | Track resource usage patterns |
| `retentionDays` | number | `30` | Days to retain metric data |
| `flushInterval` | number | `60000` | Interval to flush metrics (ms) |
| `sampleRate` | number | `1.0` | Sampling rate for metrics (0.0-1.0) |
| `trackSlowQueries` | boolean | `true` | Track slow operations |
| `slowQueryThreshold` | number | `1000` | Threshold for slow queries (ms) |
| `batchSize` | number | `100` | Batch size for metric storage |

### Metrics Data Structure

```javascript
{
  performance: {
    averageResponseTime: 245,     // milliseconds
    totalRequests: 1250,
    requestsPerSecond: 12.5,
    slowestOperations: [
      { operation: "list", resource: "users", avgTime: 450, count: 50 },
      { operation: "get", resource: "products", avgTime: 320, count: 200 }
    ],
    operationTiming: {
      insert: { avg: 180, min: 120, max: 350, total: 50 },
      update: { avg: 160, min: 90, max: 280, total: 30 },
      get: { avg: 95, min: 45, max: 180, total: 200 }
    }
  },
  usage: {
    resources: {
      users: { inserts: 150, updates: 75, deletes: 10, reads: 800 },
      products: { inserts: 300, updates: 120, deletes: 25, reads: 1200 }
    },
    totalOperations: 2680,
    mostActiveResource: "products",
    peakUsageHour: "14:00",
    dailyPatterns: { /* hourly usage data */ }
  },
  errors: {
    total: 15,
    byType: {
      "ValidationError": 8,
      "NotFoundError": 5,
      "PermissionError": 2
    },
    byResource: { users: 10, products: 5 },
    errorRate: 0.0056  // 0.56%
  },
  cache: {
    hitRate: 0.78,
    totalHits: 980,
    totalMisses: 270
  }
}
```

### 🔧 Easy Example

```javascript
import { S3db, MetricsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new MetricsPlugin({
    enabled: true,
    collectPerformance: true,
    collectErrors: true,
    flushInterval: 30000  // 30 seconds
  })]
});

await s3db.connect();

const orders = s3db.resource('orders');

// Simulate various operations
console.log('Performing operations...');

// Fast operations
for (let i = 0; i < 10; i++) {
  await orders.insert({
    customerId: `customer-${i}`,
    amount: Math.random() * 1000,
    status: 'pending'
  });
}

// Query operations
await orders.count();
await orders.list({ limit: 5 });

// Some updates
const orderList = await orders.list({ limit: 3 });
for (const order of orderList) {
  await orders.update(order.id, { status: 'processing' });
}

// Get performance metrics
const metrics = await s3db.plugins.metrics.getMetrics();

console.log('\n=== Performance Report ===');
console.log(`Average response time: ${metrics.performance.averageResponseTime}ms`);
console.log(`Total operations: ${metrics.usage.totalOperations}`);
console.log(`Error rate: ${(metrics.errors.errorRate * 100).toFixed(2)}%`);

console.log('\n=== Operation Breakdown ===');
Object.entries(metrics.performance.operationTiming).forEach(([op, timing]) => {
  console.log(`${op.toUpperCase()}: avg ${timing.avg}ms (${timing.total} operations)`);
});

console.log('\n=== Resource Usage ===');
Object.entries(metrics.usage.resources).forEach(([resource, usage]) => {
  const total = Object.values(usage).reduce((sum, count) => sum + count, 0);
  console.log(`${resource}: ${total} total operations`);
});
```

### 🚀 Advanced Configuration Example

```javascript
import { S3db, MetricsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new MetricsPlugin({
    enabled: true,
    
    // Comprehensive monitoring
    collectPerformance: true,
    collectErrors: true,
    collectUsage: true,
    
    // Advanced settings
    retentionDays: 90,        // 3 months of data
    flushInterval: 10000,     // 10 seconds
    sampleRate: 1.0,          // 100% sampling
    
    // Performance thresholds
    trackSlowQueries: true,
    slowQueryThreshold: 500,  // 500ms threshold
    
    // Storage optimization
    batchSize: 50,
    compressionEnabled: true,
    
    // Custom alerting thresholds
    alertThresholds: {
      errorRate: 0.05,        // 5% error rate
      avgResponseTime: 1000,  // 1 second average
      memoryUsage: 0.9        // 90% memory usage
    },
    
    // Event hooks
    onSlowQuery: (operation, resource, duration) => {
      console.warn(`🐌 Slow query: ${operation} on ${resource} took ${duration}ms`);
    },
    
    onHighErrorRate: (resource, errorRate) => {
      console.error(`🚨 High error rate: ${resource} has ${(errorRate * 100).toFixed(1)}% errors`);
    },
    
    onThresholdExceeded: (metric, value, threshold) => {
      console.warn(`⚠️  Threshold exceeded: ${metric} = ${value} (threshold: ${threshold})`);
    }
  })]
});

await s3db.connect();

// Advanced metrics analysis class
class MetricsAnalyzer {
  constructor(metricsPlugin) {
    this.plugin = metricsPlugin;
    this.alertHandlers = new Map();
  }
  
  addAlertHandler(condition, handler) {
    this.alertHandlers.set(condition, handler);
  }
  
  async analyzePerformance(timeRange = 3600000) { // 1 hour
    const metrics = await this.plugin.getMetrics();
    const analysis = {
      summary: {
        totalOperations: metrics.usage.totalOperations,
        avgResponseTime: metrics.performance.averageResponseTime,
        errorRate: metrics.errors.errorRate,
        slowQueries: metrics.performance.slowestOperations.length
      },
      recommendations: [],
      alerts: []
    };
    
    // Performance analysis
    if (metrics.performance.averageResponseTime > 500) {
      analysis.recommendations.push({
        type: 'performance',
        message: 'Average response time is high. Consider adding caching or optimizing queries.',
        priority: 'high'
      });
    }
    
    // Error rate analysis
    if (metrics.errors.errorRate > 0.02) { // 2%
      analysis.alerts.push({
        type: 'error_rate',
        message: `Error rate (${(metrics.errors.errorRate * 100).toFixed(2)}%) exceeds threshold`,
        severity: 'warning'
      });
    }
    
    // Resource usage patterns
    const resourceUsage = Object.entries(metrics.usage.resources);
    const imbalancedResources = resourceUsage.filter(([name, usage]) => {
      const writes = usage.inserts + usage.updates + usage.deletes;
      const reads = usage.reads;
      return writes > 0 && (reads / writes) < 0.1; // Very low read/write ratio
    });
    
    if (imbalancedResources.length > 0) {
      analysis.recommendations.push({
        type: 'usage_pattern',
        message: `Resources with low read/write ratio: ${imbalancedResources.map(([name]) => name).join(', ')}`,
        priority: 'medium'
      });
    }
    
    return analysis;
  }
  
  async generateReport(format = 'console') {
    const metrics = await this.plugin.getMetrics();
    const analysis = await this.analyzePerformance();
    
    if (format === 'console') {
      console.log('\n=== 📊 COMPREHENSIVE METRICS REPORT ===');
      
      // Performance Summary
      console.log('\n🚀 Performance Summary:');
      console.log(`  Total Operations: ${analysis.summary.totalOperations.toLocaleString()}`);
      console.log(`  Average Response Time: ${analysis.summary.avgResponseTime}ms`);
      console.log(`  Error Rate: ${(analysis.summary.errorRate * 100).toFixed(2)}%`);
      console.log(`  Slow Queries: ${analysis.summary.slowQueries}`);
      
      // Operation Breakdown
      console.log('\n⏱️  Operation Timing:');
      Object.entries(metrics.performance.operationTiming).forEach(([op, timing]) => {
        console.log(`  ${op.toUpperCase()}:`);
        console.log(`    Average: ${timing.avg}ms`);
        console.log(`    Range: ${timing.min}ms - ${timing.max}ms`);
        console.log(`    Count: ${timing.total}`);
      });
      
      // Resource Activity
      console.log('\n📈 Resource Activity:');
      Object.entries(metrics.usage.resources)
        .sort(([,a], [,b]) => {
          const totalA = Object.values(a).reduce((sum, val) => sum + val, 0);
          const totalB = Object.values(b).reduce((sum, val) => sum + val, 0);
          return totalB - totalA;
        })
        .forEach(([resource, usage]) => {
          const total = Object.values(usage).reduce((sum, val) => sum + val, 0);
          console.log(`  ${resource}: ${total} operations`);
          console.log(`    Reads: ${usage.reads}, Writes: ${usage.inserts + usage.updates + usage.deletes}`);
        });
      
      // Error Analysis
      if (metrics.errors.total > 0) {
        console.log('\n🚨 Error Analysis:');
        console.log(`  Total Errors: ${metrics.errors.total}`);
        console.log('  By Type:');
        Object.entries(metrics.errors.byType).forEach(([type, count]) => {
          console.log(`    ${type}: ${count}`);
        });
      }
      
      // Recommendations
      if (analysis.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        analysis.recommendations.forEach(rec => {
          const emoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
          console.log(`  ${emoji} [${rec.priority.toUpperCase()}] ${rec.message}`);
        });
      }
      
      // Alerts
      if (analysis.alerts.length > 0) {
        console.log('\n⚠️  Active Alerts:');
        analysis.alerts.forEach(alert => {
          console.log(`  🚨 ${alert.message}`);
        });
      }
    }
    
    return { metrics, analysis };
  }
  
  async exportMetrics(filename) {
    const metrics = await this.plugin.getMetrics();
    const data = {
      timestamp: new Date().toISOString(),
      metrics,
      analysis: await this.analyzePerformance()
    };
    
    // In real implementation, save to file
    console.log(`📁 Metrics exported to ${filename}`);
    return data;
  }
  
  startRealTimeMonitoring(interval = 5000) {
    const monitor = setInterval(async () => {
      const metrics = await this.plugin.getMetrics();
      
      // Check alert conditions
      this.alertHandlers.forEach((handler, condition) => {
        if (condition(metrics)) {
          handler(metrics);
        }
      });
      
      // Auto-optimization suggestions
      if (metrics.performance.averageResponseTime > 1000) {
        console.log('💡 Suggestion: Consider implementing caching for frequently accessed data');
      }
      
      if (metrics.errors.errorRate > 0.05) {
        console.log('🚨 Alert: Error rate is above 5% - investigate immediately');
      }
      
    }, interval);
    
    return monitor;
  }
}

// Simulate complex workload
const users = s3db.resource('users');
const products = s3db.resource('products');
const orders = s3db.resource('orders');

// Setup metrics analyzer
const analyzer = new MetricsAnalyzer(s3db.plugins.metrics);

// Add custom alert handlers
analyzer.addAlertHandler(
  (metrics) => metrics.errors.errorRate > 0.03,
  (metrics) => console.log('🚨 Error rate alert triggered!')
);

analyzer.addAlertHandler(
  (metrics) => metrics.performance.averageResponseTime > 800,
  (metrics) => console.log('⏰ Performance degradation detected!')
);

// Simulate workload
console.log('🔄 Simulating complex workload...');

// Bulk operations
const userData = Array.from({ length: 50 }, (_, i) => ({
  name: `User ${i}`,
  email: `user${i}@example.com`,
  role: i % 3 === 0 ? 'admin' : 'user'
}));

await users.insertMany(userData);

// Mixed operations with some errors
for (let i = 0; i < 20; i++) {
  try {
    await products.insert({
      name: `Product ${i}`,
      price: Math.random() * 100,
      category: ['electronics', 'books', 'clothing'][i % 3]
    });
    
    if (i % 5 === 0) {
      // Simulate some slow operations
      await new Promise(resolve => setTimeout(resolve, 600));
      await products.list({ limit: 20 });
    }
    
    if (i % 10 === 0) {
      // Simulate some errors
      try {
        await products.get('non-existent-id');
      } catch (error) {
        // Expected error for testing
      }
    }
    
  } catch (error) {
    // Handle errors
  }
}

// Generate comprehensive report
await analyzer.generateReport();

// Start real-time monitoring
const monitor = analyzer.startRealTimeMonitoring(3000);

// Export metrics for external analysis
await analyzer.exportMetrics('metrics-export.json');

// Stop monitoring after demo
setTimeout(() => {
  clearInterval(monitor);
  console.log('\n✅ Metrics demonstration completed');
}, 15000);
```

---

## 🔄 Replicator Plugin

Powerful data replication system that synchronizes your s3db data to multiple targets including other S3DB instances, SQS queues, BigQuery, and PostgreSQL databases.

### ⚡ Quick Start

```javascript
import { S3db, ReplicatorPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new ReplicatorPlugin({
    replicators: [
      {
        driver: 's3db',
        resources: ['users'],
        config: {
          connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
        }
      }
    ]
  })]
});

await s3db.connect();

// Data is automatically replicated
const users = s3db.resource('users');
await users.insert({ name: 'John', email: 'john@example.com' });
// This insert is automatically replicated to the backup database
```

### ⚙️ Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable replication |
| `replicators` | array | `[]` | Array of replicator configurations |
| `persistReplicatorLog` | boolean | `false` | Store replication logs in database |
| `replicatorLogResource` | string | `'replicator_logs'` | Name of log resource |
| `batchSize` | number | `10` | Batch size for bulk operations |
| `retryAttempts` | number | `3` | Retry failed replications |
| `retryDelay` | number | `1000` | Delay between retries (ms) |
| `syncInterval` | number | `0` | Auto-sync interval (0 = disabled) |

### Replicator Drivers

#### S3DB Replicator

Replicate to another S3DB instance:

```javascript
{
  driver: 's3db',
  resources: ['users', 'products'],
  config: {
    connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
  }
}
```

#### SQS Replicator

Send changes to AWS SQS queues:

```javascript
{
  driver: 'sqs',
  resources: ['orders'],
  config: {
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
    region: 'us-east-1',
    messageGroupId: 's3db-replicator',
    deduplicationId: true
  }
}
```

#### BigQuery Replicator

Replicate to Google BigQuery:

```javascript
{
  driver: 'bigquery',
  resources: {
    users: [{ actions: ['insert', 'update'], table: 'users_table' }],
    orders: 'orders_table'
  },
  config: {
    projectId: 'my-project',
    datasetId: 'analytics',
    credentials: { /* service account */ }
  }
}
```

#### PostgreSQL Replicator

Replicate to PostgreSQL database:

```javascript
{
  driver: 'postgres',
  resources: {
    users: [{ actions: ['insert', 'update', 'delete'], table: 'users_table' }]
  },
  config: {
    connectionString: 'postgresql://user:pass@localhost:5432/analytics'
  }
}
```

### Resource Configuration Formats

Multiple formats supported for resource mapping:

```javascript
// 1. Simple array (replicate to same name)
resources: ['users', 'products']

// 2. Object mapping (source → destination)
resources: { users: 'people', products: 'items' }

// 3. Advanced mapping with transformers
resources: {
  users: [
    {
      resource: 'people',
      transformer: (data) => ({ ...data, fullName: `${data.first} ${data.last}` })
    }
  ]
}

// 4. Action-specific configuration (BigQuery/PostgreSQL)
resources: {
  users: [
    { actions: ['insert', 'update'], table: 'users_table' },
    { actions: ['insert'], table: 'users_analytics' }
  ]
}
```

### 🔧 Easy Example

```javascript
import { S3db, ReplicatorPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new ReplicatorPlugin({
    persistReplicatorLog: true,
    replicators: [
      {
        driver: 's3db',
        resources: ['users', 'products'],
        config: {
          connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
        }
      },
      {
        driver: 'sqs',
        resources: ['orders'],
        config: {
          queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue.fifo',
          region: 'us-east-1',
          messageGroupId: 'order-updates'
        }
      }
    ]
  })]
});

await s3db.connect();

const users = s3db.resource('users');
const orders = s3db.resource('orders');

// Monitor replication events
const replicatorPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicatorPlugin');

replicatorPlugin.on('replicator.success', (data) => {
  console.log(`✅ Replicated: ${data.action} on ${data.resource} to ${data.replicator}`);
});

replicatorPlugin.on('replicator.failed', (data) => {
  console.error(`❌ Replication failed: ${data.error}`);
});

// Insert data (automatically replicated)
const user = await users.insert({
  name: 'Alice Johnson',
  email: 'alice@example.com',
  role: 'customer'
});

const order = await orders.insert({
  userId: user.id,
  amount: 99.99,
  items: ['item1', 'item2']
});

// Check replication logs
const replicatorLogs = s3db.resource('replicator_logs');
const logs = await replicatorLogs.list();

console.log('\n=== Replication History ===');
logs.forEach(log => {
  console.log(`${log.timestamp}: ${log.action} ${log.resource} → ${log.replicator}`);
});
```

### 🚀 Advanced Multi-Driver Example

```javascript
import { S3db, ReplicatorPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new ReplicatorPlugin({
    enabled: true,
    persistReplicatorLog: true,
    replicatorLogResource: 'replication_audit',
    batchSize: 25,
    retryAttempts: 5,
    retryDelay: 2000,
    
    replicators: [
      // Backup to another S3DB instance
      {
        driver: 's3db',
        resources: ['users', 'products', 'orders'],
        config: {
          connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup",
          enabled: true,
          timeout: 30000
        }
      },
      
      // Real-time events to SQS
      {
        driver: 'sqs',
        resources: ['orders', 'users'],
        config: {
          region: 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          },
          // Resource-specific queues
          queues: {
            orders: 'https://sqs.us-east-1.amazonaws.com/123456789012/order-events.fifo',
            users: 'https://sqs.us-east-1.amazonaws.com/123456789012/user-events.fifo'
          },
          // Default queue for unspecified resources
          defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/default-events.fifo',
          messageGroupId: 's3db-replicator',
          deduplicationId: true,
          messageAttributes: {
            source: { StringValue: 'production-db', DataType: 'String' },
            version: { StringValue: '1.0', DataType: 'String' }
          }
        }
      },
      
      // Analytics to BigQuery
      {
        driver: 'bigquery',
        config: {
          projectId: 'my-analytics-project',
          datasetId: 's3db_analytics',
          location: 'US',
          logTable: 'replication_log',
          credentials: {
            client_email: 'service-account@project.iam.gserviceaccount.com',
            private_key: process.env.BIGQUERY_PRIVATE_KEY,
            project_id: 'my-analytics-project'
          }
        },
        resources: {
          // Multiple destinations for users
          users: [
            { actions: ['insert', 'update'], table: 'dim_users' },
            { actions: ['insert'], table: 'fact_user_activity' }
          ],
          
          // Orders to analytics tables
          orders: [
            { actions: ['insert'], table: 'fact_orders' },
            { actions: ['insert'], table: 'daily_revenue', 
              transformer: (data) => ({
                date: data.createdAt?.split('T')[0],
                revenue: data.amount,
                customer_id: data.userId,
                order_count: 1
              })
            }
          ],
          
          // Products with transformation
          products: {
            table: 'dim_products',
            actions: ['insert', 'update'],
            transformer: (data) => ({
              ...data,
              price_category: data.price > 100 ? 'premium' : 'standard',
              last_updated: new Date().toISOString()
            })
          }
        }
      },
      
      // Operational database (PostgreSQL)
      {
        driver: 'postgres',
        config: {
          connectionString: 'postgresql://analytics:password@localhost:5432/operations',
          ssl: { rejectUnauthorized: false },
          logTable: 'replication_log',
          pool: {
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000
          }
        },
        resources: {
          users: [
            { 
              actions: ['insert', 'update', 'delete'], 
              table: 'operational_users',
              transformer: (data, action) => {
                if (action === 'delete') return { id: data.id, deleted_at: new Date() };
                return {
                  ...data,
                  sync_timestamp: new Date(),
                  source_system: 's3db'
                };
              }
            }
          ],
          
          orders: [
            { actions: ['insert'], table: 'order_events' },
            { 
              actions: ['update'], 
              table: 'order_updates',
              transformer: (data) => ({
                order_id: data.id,
                updated_fields: Object.keys(data),
                update_timestamp: new Date()
              })
            }
          ]
        }
      }
    ]
  })]
});

await s3db.connect();

// Advanced replicator management
class ReplicatorManager {
  constructor(replicatorPlugin) {
    this.plugin = replicatorPlugin;
    this.stats = {
      totalReplications: 0,
      successfulReplications: 0,
      failedReplications: 0,
      byReplicator: {},
      byResource: {}
    };
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.plugin.on('replicator.queued', (data) => {
      this.stats.totalReplications++;
      this.updateResourceStats(data.resource, 'queued');
    });
    
    this.plugin.on('replicator.success', (data) => {
      this.stats.successfulReplications++;
      this.updateReplicatorStats(data.replicator, 'success');
      this.updateResourceStats(data.resource, 'success');
    });
    
    this.plugin.on('replicator.failed', (data) => {
      this.stats.failedReplications++;
      this.updateReplicatorStats(data.replicator, 'failed');
      this.updateResourceStats(data.resource, 'failed');
      
      // Advanced error handling
      if (data.error.includes('BigQuery')) {
        console.log('🔧 BigQuery error detected - checking schema compatibility...');
      } else if (data.error.includes('SQS')) {
        console.log('📮 SQS error detected - checking queue permissions...');
      }
    });
  }
  
  updateReplicatorStats(replicator, status) {
    if (!this.stats.byReplicator[replicator]) {
      this.stats.byReplicator[replicator] = { success: 0, failed: 0 };
    }
    this.stats.byReplicator[replicator][status]++;
  }
  
  updateResourceStats(resource, status) {
    if (!this.stats.byResource[resource]) {
      this.stats.byResource[resource] = { queued: 0, success: 0, failed: 0 };
    }
    this.stats.byResource[resource][status]++;
  }
  
  async getReplicationHealth() {
    const totalAttempts = this.stats.successfulReplications + this.stats.failedReplications;
    const successRate = totalAttempts > 0 ? this.stats.successfulReplications / totalAttempts : 1;
    
    return {
      overall: {
        successRate: successRate,
        totalReplications: this.stats.totalReplications,
        pending: this.stats.totalReplications - totalAttempts,
        health: successRate > 0.95 ? 'excellent' : 
                successRate > 0.85 ? 'good' : 
                successRate > 0.7 ? 'warning' : 'critical'
      },
      byReplicator: this.stats.byReplicator,
      byResource: this.stats.byResource
    };
  }
  
  async pauseReplicator(replicatorId) {
    const replicator = this.plugin.replicators.find(r => r.id === replicatorId);
    if (replicator) {
      replicator.enabled = false;
      console.log(`⏸️  Paused replicator: ${replicatorId}`);
    }
  }
  
  async resumeReplicator(replicatorId) {
    const replicator = this.plugin.replicators.find(r => r.id === replicatorId);
    if (replicator) {
      replicator.enabled = true;
      console.log(`▶️  Resumed replicator: ${replicatorId}`);
    }
  }
  
  async testReplicatorConnections() {
    console.log('🔍 Testing replicator connections...');
    
    for (const replicator of this.plugin.replicators) {
      try {
        const result = await replicator.testConnection();
        console.log(`✅ ${replicator.driver}: ${result.status}`);
      } catch (error) {
        console.log(`❌ ${replicator.driver}: ${error.message}`);
      }
    }
  }
}

// Setup sample data and test all replicators
const users = s3db.resource('users');
const products = s3db.resource('products');
const orders = s3db.resource('orders');

const replicatorPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicatorPlugin');
const manager = new ReplicatorManager(replicatorPlugin);

// Test connections
await manager.testReplicatorConnections();

// Create sample data
console.log('🔄 Creating sample data with multi-driver replication...');

const sampleUsers = await users.insertMany([
  { name: 'John Smith', email: 'john@example.com', role: 'admin' },
  { name: 'Jane Doe', email: 'jane@example.com', role: 'user' },
  { name: 'Bob Wilson', email: 'bob@example.com', role: 'user' }
]);

const sampleProducts = await products.insertMany([
  { name: 'Laptop Pro', price: 1299.99, category: 'electronics' },
  { name: 'Wireless Mouse', price: 29.99, category: 'electronics' },
  { name: 'Coffee Mug', price: 12.99, category: 'home' }
]);

const sampleOrders = await orders.insertMany([
  { userId: sampleUsers[0].id, amount: 1329.98, items: [sampleProducts[0].id, sampleProducts[1].id] },
  { userId: sampleUsers[1].id, amount: 29.99, items: [sampleProducts[1].id] },
  { userId: sampleUsers[2].id, amount: 12.99, items: [sampleProducts[2].id] }
]);

// Wait for replications to complete
await new Promise(resolve => setTimeout(resolve, 3000));

// Get replication statistics
const health = await manager.getReplicationHealth();
console.log('\n=== Replication Health Report ===');
console.log(`Overall success rate: ${(health.overall.successRate * 100).toFixed(1)}%`);
console.log(`Health status: ${health.overall.health.toUpperCase()}`);
console.log(`Total replications: ${health.overall.totalReplications}`);
console.log(`Pending: ${health.overall.pending}`);

console.log('\n=== By Replicator ===');
Object.entries(health.byReplicator).forEach(([replicator, stats]) => {
  const total = stats.success + stats.failed;
  const rate = total > 0 ? (stats.success / total * 100).toFixed(1) : 0;
  console.log(`${replicator}: ${rate}% success (${stats.success}/${total})`);
});

console.log('\n=== By Resource ===');
Object.entries(health.byResource).forEach(([resource, stats]) => {
  console.log(`${resource}: queued ${stats.queued}, success ${stats.success}, failed ${stats.failed}`);
});

// Get detailed replication logs
const replicationLogs = await replicatorPlugin.getReplicatorLogs({ limit: 10 });
console.log('\n=== Recent Replication Logs ===');
replicationLogs.forEach(log => {
  const status = log.success ? '✅' : '❌';
  console.log(`${status} ${log.timestamp} | ${log.action} ${log.resource} → ${log.replicator}`);
  if (!log.success && log.error) {
    console.log(`    Error: ${log.error}`);
  }
});

console.log('\n✅ Multi-driver replication demonstration completed');
```

---

## 📬 Queue Consumer Plugin

Consume messages from external queues (SQS, RabbitMQ) and automatically process them into your s3db resources.

### ⚡ Quick Start

```javascript
import { S3db, QueueConsumerPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new QueueConsumerPlugin({
    consumers: [
      {
        driver: 'sqs',
        config: {
          queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
          region: 'us-east-1'
        },
        consumers: [
          { resources: 'users' }
        ]
      }
    ]
  })]
});

await s3db.connect();
// Queue messages are automatically processed into your resources
```

### ⚙️ Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable queue consumption |
| `consumers` | array | `[]` | Array of consumer configurations |
| `batchSize` | number | `10` | Messages to process per batch |
| `concurrency` | number | `5` | Concurrent message processing |
| `retryAttempts` | number | `3` | Retry failed message processing |
| `retryDelay` | number | `1000` | Delay between retries (ms) |
| `deadLetterQueue` | string | `null` | DLQ for failed messages |

### Supported Drivers

#### SQS Consumer

Consume from AWS SQS queues:

```javascript
{
  driver: 'sqs',
  config: {
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
    region: 'us-east-1',
    credentials: { accessKeyId: '...', secretAccessKey: '...' },
    pollingInterval: 1000,
    maxMessages: 10,
    visibilityTimeout: 300
  },
  consumers: [
    { resources: ['users'], queueUrl: 'specific-queue-url' }
  ]
}
```

#### RabbitMQ Consumer

Consume from RabbitMQ queues:

```javascript
{
  driver: 'rabbitmq',
  config: {
    amqpUrl: 'amqp://user:pass@localhost:5672',
    exchange: 'my-exchange',
    prefetch: 10,
    reconnectInterval: 2000
  },
  consumers: [
    { resources: ['orders'], queue: 'orders-queue' }
  ]
}
```

### Message Format

Expected message structure:

```javascript
{
  resource: 'users',           // Target resource name
  action: 'insert',           // Operation: insert, update, delete
  data: {                     // Data payload
    name: 'John Doe',
    email: 'john@example.com'
  }
}
```

### 🔧 Easy Example

```javascript
import { S3db, QueueConsumerPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new QueueConsumerPlugin({
    enabled: true,
    consumers: [
      {
        driver: 'sqs',
        config: {
          queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/user-updates.fifo',
          region: 'us-east-1',
          pollingInterval: 2000,
          maxMessages: 5
        },
        consumers: [
          { resources: ['users', 'profiles'] }
        ]
      }
    ]
  })]
});

await s3db.connect();

// Messages are automatically consumed and processed
console.log('Queue consumer started - listening for messages...');

// Simulate sending a message (in real use, external systems send these)
const testMessage = {
  resource: 'users',
  action: 'insert',
  data: {
    name: 'Queue User',
    email: 'queue@example.com',
    source: 'external-system'
  }
};

console.log('Processing message:', testMessage);
```

### 🚀 Advanced Multi-Driver Example

```javascript
import { S3db, QueueConsumerPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new QueueConsumerPlugin({
    enabled: true,
    batchSize: 20,
    concurrency: 10,
    retryAttempts: 5,
    retryDelay: 2000,
    
    consumers: [
      // SQS Consumer for user events
      {
        driver: 'sqs',
        config: {
          region: 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          },
          pollingInterval: 1000,
          maxMessages: 10,
          visibilityTimeout: 300,
          waitTimeSeconds: 20  // Long polling
        },
        consumers: [
          {
            resources: ['users'],
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/user-events.fifo',
            messageGroupId: 'user-processing'
          },
          {
            resources: ['orders'],
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/order-events.fifo',
            messageGroupId: 'order-processing'
          }
        ]
      },
      
      // RabbitMQ Consumer for analytics events
      {
        driver: 'rabbitmq',
        config: {
          amqpUrl: 'amqp://analytics:password@localhost:5672',
          exchange: 'analytics-events',
          exchangeType: 'topic',
          prefetch: 15,
          reconnectInterval: 3000,
          heartbeat: 60
        },
        consumers: [
          {
            resources: ['analytics', 'metrics'],
            queue: 'analytics-queue',
            routingKey: 'analytics.*',
            durable: true
          },
          {
            resources: ['logs'],
            queue: 'logs-queue',
            routingKey: 'logs.*',
            durable: true
          }
        ]
      }
    ]
  })]
});

await s3db.connect();

// Advanced message processing with custom handlers
class QueueMessageProcessor {
  constructor(queuePlugin) {
    this.plugin = queuePlugin;
    this.stats = {
      processed: 0,
      errors: 0,
      byResource: {},
      byAction: {}
    };
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Listen for message processing events
    this.plugin.on('message.received', (data) => {
      console.log(`📨 Received message: ${data.action} on ${data.resource}`);
    });
    
    this.plugin.on('message.processed', (data) => {
      this.stats.processed++;
      this.updateStats(data.resource, data.action, 'success');
      console.log(`✅ Processed: ${data.action} on ${data.resource}`);
    });
    
    this.plugin.on('message.failed', (data) => {
      this.stats.errors++;
      this.updateStats(data.resource, data.action, 'error');
      console.error(`❌ Failed: ${data.error}`);
      
      // Custom error handling
      this.handleProcessingError(data);
    });
  }
  
  updateStats(resource, action, status) {
    if (!this.stats.byResource[resource]) {
      this.stats.byResource[resource] = { success: 0, error: 0 };
    }
    if (!this.stats.byAction[action]) {
      this.stats.byAction[action] = { success: 0, error: 0 };
    }
    
    this.stats.byResource[resource][status]++;
    this.stats.byAction[action][status]++;
  }
  
  handleProcessingError(errorData) {
    const { resource, action, error, attempts } = errorData;
    
    // Log to external monitoring system
    console.log(`🚨 Error processing ${action} on ${resource}: ${error}`);
    
    // Custom retry logic
    if (attempts >= 3) {
      console.log(`💀 Moving to dead letter queue after ${attempts} attempts`);
      // In real implementation, move to DLQ
    }
    
    // Resource-specific error handling
    if (resource === 'users' && error.includes('validation')) {
      console.log('👤 User validation error - checking schema compatibility');
    } else if (resource === 'orders' && error.includes('duplicate')) {
      console.log('🛒 Duplicate order detected - implementing idempotency check');
    }
  }
  
  getProcessingStats() {
    const totalMessages = this.stats.processed + this.stats.errors;
    const successRate = totalMessages > 0 ? this.stats.processed / totalMessages : 1;
    
    return {
      summary: {
        totalProcessed: this.stats.processed,
        totalErrors: this.stats.errors,
        successRate: successRate,
        health: successRate > 0.95 ? 'excellent' : 
                successRate > 0.85 ? 'good' : 
                successRate > 0.7 ? 'warning' : 'critical'
      },
      byResource: this.stats.byResource,
      byAction: this.stats.byAction
    };
  }
  
  async pauseConsumption() {
    console.log('⏸️  Pausing queue consumption...');
    await this.plugin.pause();
  }
  
  async resumeConsumption() {
    console.log('▶️  Resuming queue consumption...');
    await this.plugin.resume();
  }
}

// Setup message processing
const queuePlugin = s3db.plugins.find(p => p.constructor.name === 'QueueConsumerPlugin');
const processor = new QueueMessageProcessor(queuePlugin);

// Simulate processing for demonstration
console.log('🔄 Queue consumers started - processing messages...');

// In real scenario, messages come from external systems
// Here we simulate the processing results
setTimeout(async () => {
  const stats = processor.getProcessingStats();
  
  console.log('\n=== Queue Processing Stats ===');
  console.log(`Total processed: ${stats.summary.totalProcessed}`);
  console.log(`Total errors: ${stats.summary.totalErrors}`);
  console.log(`Success rate: ${(stats.summary.successRate * 100).toFixed(1)}%`);
  console.log(`Health: ${stats.summary.health.toUpperCase()}`);
  
  console.log('\n=== By Resource ===');
  Object.entries(stats.byResource).forEach(([resource, counts]) => {
    const total = counts.success + counts.error;
    console.log(`${resource}: ${counts.success}/${total} successful`);
  });
  
  console.log('\n=== By Action ===');
  Object.entries(stats.byAction).forEach(([action, counts]) => {
    const total = counts.success + counts.error;
    console.log(`${action}: ${counts.success}/${total} successful`);
  });
  
}, 5000);

console.log('\n✅ Queue consumer demonstration completed');
```

---

## 🔧 Plugin Development

Create custom plugins to extend s3db.js with your specific requirements.

### Plugin Base Class

```javascript
import { Plugin } from 's3db.js';

class MyCustomPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.config = {
      enabled: options.enabled !== false,
      ...options
    };
  }
  
  async onSetup() {
    // Initialize plugin after database connection
    console.log('Setting up MyCustomPlugin');
  }
  
  async onStart() {
    // Plugin is ready to operate
    console.log('MyCustomPlugin started');
  }
  
  async onStop() {
    // Cleanup before shutdown
    console.log('MyCustomPlugin stopped');
  }
}
```

### Plugin Lifecycle

1. **Constructor**: Configure plugin options
2. **setup()**: Called when database connects
3. **onSetup()**: Initialize plugin resources
4. **start()**: Called when database is ready
5. **onStart()**: Begin plugin operations
6. **stop()**: Called during shutdown
7. **onStop()**: Cleanup plugin resources

### Custom Plugin Example

```javascript
class NotificationPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.config = {
      enabled: options.enabled !== false,
      webhookUrl: options.webhookUrl,
      events: options.events || ['insert', 'update', 'delete'],
      ...options
    };
  }
  
  async onSetup() {
    // Install hooks for all resources
    for (const resource of Object.values(this.database.resources)) {
      this.installResourceHooks(resource);
    }
  }
  
  installResourceHooks(resource) {
    this.config.events.forEach(event => {
      resource.on(event, async (data) => {
        await this.sendNotification(event, resource.name, data);
      });
    });
  }
  
  async sendNotification(event, resourceName, data) {
    if (!this.config.webhookUrl) return;
    
    const payload = {
      event,
      resource: resourceName,
      data,
      timestamp: new Date().toISOString()
    };
    
    try {
      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Notification failed:', error);
    }
  }
}
```

---

## 💡 Plugin Combinations

Powerful workflows using multiple plugins together.

### Complete Monitoring Stack

```javascript
import { 
  S3db, 
  CachePlugin, 
  CostsPlugin, 
  AuditPlugin, 
  FullTextPlugin, 
  MetricsPlugin, 
  ReplicatorPlugin 
} from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [
    // Performance optimization
    new CachePlugin({ 
      driverType: 'memory',
      ttl: 600000 
    }),
    
    // Cost tracking
    CostsPlugin,
    
    // Compliance and security
    new AuditPlugin({ 
      enabled: true,
      includeData: true,
      trackOperations: ['insert', 'update', 'delete', 'get']
    }),
    
    // Search capabilities
    new FullTextPlugin({
      enabled: true,
      fields: ['name', 'description', 'content', 'tags']
    }),
    
    // Performance monitoring
    new MetricsPlugin({
      enabled: true,
      collectPerformance: true,
      collectErrors: true,
      flushInterval: 30000
    }),
    
    // Data replication
    new ReplicatorPlugin({
      replicators: [
        {
          driver: 's3db',
          resources: ['users', 'products', 'orders'],
          config: {
            connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
          }
        }
      ]
    })
  ]
});

await s3db.connect();

// All plugins work seamlessly together
const products = s3db.resource('products');

// This single operation triggers:
// - Audit logging
// - Cost tracking  
// - Performance metrics
// - Cache invalidation
// - Data replication
// - Search indexing
await products.insert({
  name: 'New Product',
  description: 'Amazing new product with great features',
  price: 99.99,
  tags: ['new', 'featured', 'electronics']
});
```

### E-commerce Analytics Pipeline

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/ecommerce",
  plugins: [
    // Real-time search
    new FullTextPlugin({
      fields: ['name', 'description', 'brand', 'category'],
      language: 'en-US',
      stemming: true
    }),
    
    // Performance monitoring
    new MetricsPlugin({
      collectPerformance: true,
      slowQueryThreshold: 500
    }),
    
    // Multi-destination replication
    new ReplicatorPlugin({
      replicators: [
        // Backup
        { driver: 's3db', resources: '*', config: { connectionString: 'backup-db' } },
        
        // Analytics warehouse
        { 
          driver: 'bigquery', 
          resources: { 
            orders: 'fact_orders',
            products: 'dim_products',
            users: 'dim_customers'
          },
          config: { projectId: 'analytics', datasetId: 'ecommerce' }
        },
        
        // Real-time events
        { 
          driver: 'sqs', 
          resources: ['orders', 'cart_events'],
          config: { queueUrl: 'order-events-queue' }
        }
      ]
    }),
    
    // Comprehensive auditing
    new AuditPlugin({
      trackOperations: ['insert', 'update', 'delete'],
      includeData: true,
      excludeResources: ['sessions', 'temp_data']
    })
  ]
});
```

---

## 🎯 Best Practices

### Plugin Performance

1. **Enable caching** for read-heavy workloads
2. **Monitor costs** in production environments  
3. **Use appropriate sampling** for metrics collection
4. **Configure retention policies** for audit logs
5. **Test replicator connections** before deployment

### Plugin Security

1. **Exclude sensitive resources** from full-text indexing
2. **Limit audit data size** to prevent information leakage
3. **Use IAM roles** instead of access keys when possible
4. **Encrypt replication data** in transit and at rest
5. **Validate message sources** in queue consumers

### Plugin Monitoring

1. **Set up alerting** for replication failures
2. **Monitor plugin health** with metrics
3. **Track error rates** across all plugins
4. **Use structured logging** for debugging
5. **Implement circuit breakers** for external services

---

**🎉 That's a wrap!** You now have comprehensive documentation for all s3db.js plugins. Each plugin is designed to work independently or in combination with others, providing a powerful and flexible foundation for your database needs.

For more examples and advanced use cases, check out the `/examples` directory in the s3db.js repository.

**Happy coding with s3db.js! 🚀**
