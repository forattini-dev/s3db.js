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
| `driver` | string | `'s3'` | Cache driver: `'memory'` or `'s3'` |
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
    driver: 'memory',
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

**Enterprise-grade data replication system** that synchronizes your s3db data in real-time to multiple targets including other S3DB instances, SQS queues, BigQuery, PostgreSQL databases, and more. Features robust error handling, advanced transformation capabilities, and comprehensive monitoring.

### 🎯 Key Features

- **Real-time Replication**: Automatic data synchronization on insert, update, and delete operations
- **Multi-Target Support**: Replicate to S3DB, BigQuery, PostgreSQL, SQS, and custom targets
- **Advanced Transformations**: Transform data with custom functions before replication
- **Error Resilience**: Automatic retries, detailed error reporting, and dead letter queue support
- **Performance Monitoring**: Built-in metrics, performance tracking, and health monitoring
- **Flexible Configuration**: Support for multiple resource mapping syntaxes and selective replication

### ⚡ Quick Start

```javascript
import { S3db, ReplicatorPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new ReplicatorPlugin({
    verbose: true, // Enable detailed logging for debugging
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

// Data is automatically replicated with detailed error reporting
const users = s3db.resource('users');
await users.insert({ name: 'John', email: 'john@example.com' });
// This insert is automatically replicated to the backup database
```

### ⚙️ Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable replication globally |
| `replicators` | array | `[]` | Array of replicator configurations (required) |
| `verbose` | boolean | `false` | Enable detailed console logging for debugging |
| `persistReplicatorLog` | boolean | `false` | Store replication logs in database resource |
| `replicatorLogResource` | string | `'replicator_log'` | Name of log resource for persistence |
| `logErrors` | boolean | `true` | Log errors to replication log resource |
| `batchSize` | number | `100` | Batch size for bulk replication operations |
| `maxRetries` | number | `3` | Maximum retry attempts for failed replications |
| `timeout` | number | `30000` | Timeout for replication operations (ms) |

### 🗂️ Event System & Debugging

The Replicator Plugin emits comprehensive events for monitoring and debugging:

```javascript
const replicatorPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicatorPlugin');

// Success events
replicatorPlugin.on('replicated', (data) => {
  console.log(`✅ Replicated: ${data.operation} on ${data.resourceName} to ${data.replicator}`);
});

// Error events
replicatorPlugin.on('replicator_error', (data) => {
  console.error(`❌ Replication failed: ${data.error} (${data.resourceName})`);
});

// Log resource errors
replicatorPlugin.on('replicator_log_error', (data) => {
  console.warn(`⚠️ Failed to log replication: ${data.logError}`);
});

// Setup errors
replicatorPlugin.on('replicator_log_resource_creation_error', (data) => {
  console.error(`🚨 Log resource creation failed: ${data.error}`);
});

// Cleanup errors
replicatorPlugin.on('replicator_cleanup_error', (data) => {
  console.warn(`🧹 Cleanup failed for ${data.replicator}: ${data.error}`);
});
```

### 🔧 Replicator Drivers

#### 🗃️ S3DB Replicator

Replicate to another S3DB instance with **advanced resource mapping and transformation capabilities**. Supports multiple configuration syntaxes for maximum flexibility.

**Basic Configuration:**
```javascript
{
  driver: 's3db',
  config: {
    connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
  },
  resources: {
    // Simple resource mapping (replicate to same name)
    users: 'users',
    
    // Map source → destination resource name
    products: 'backup_products',
    
    // Advanced mapping with transform function
    orders: {
      resource: 'order_backup',
      transform: (data) => ({
        ...data,
        backup_timestamp: new Date().toISOString(),
        original_source: 'production',
        migrated_at: new Date().toISOString()
      }),
      actions: ['insert', 'update', 'delete']
    }
  }
}
```

### 📋 Resource Configuration Syntaxes

The S3DB replicator supports **multiple configuration syntaxes** for maximum flexibility. You can mix and match these formats as needed:

#### 1. Array of Resource Names
**Use case**: Simple backup/clone scenarios
```javascript
resources: ['users', 'products', 'orders']
// Replicates each resource to itself in the destination database
```

#### 2. Simple Object Mapping
**Use case**: Rename resources during replication
```javascript
resources: { 
  users: 'people',           // users → people
  products: 'items',         // products → items  
  orders: 'order_history'    // orders → order_history
}
```

#### 3. Object with Transform Function
**Use case**: Data transformation during replication ⭐ **RECOMMENDED**
```javascript
resources: { 
  users: { 
    resource: 'people',     // Destination resource name
    transform: (data) => ({  // Data transformation function
      ...data, 
      fullName: `${data.firstName} ${data.lastName}`,
      migrated_at: new Date().toISOString(),
      source_system: 'production'
    }),
    actions: ['insert', 'update', 'delete']  // Optional: which operations to replicate
  }
}
```

#### 4. Function-Only Transformation
**Use case**: Transform data without changing resource name
```javascript
resources: { 
  users: (data) => ({ 
    ...data, 
    processed: true,
    backup_date: new Date().toISOString(),
    hash: crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
  })
}
```

#### 5. Multi-Destination Replication
**Use case**: Send data to multiple targets with different transformations
```javascript
resources: { 
  users: [
    'people',                    // Simple copy to 'people'
    { 
      resource: 'user_analytics', 
      transform: (data) => ({    // Transformed copy to 'user_analytics'
        id: data.id,
        signup_date: data.createdAt,
        user_type: data.role || 'standard',
        last_activity: new Date().toISOString()
      })
    },
    {
      resource: 'audit_trail',
      transform: (data) => ({    // Audit copy to 'audit_trail'
        user_id: data.id,
        action: 'user_replicated',
        timestamp: new Date().toISOString(),
        data_hash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
      })
    }
  ]
}
```

#### 6. Advanced Mixed Configuration
**Use case**: Complex enterprise scenarios
```javascript
resources: {
  // Simple mappings
  sessions: 'user_sessions',
  
  // Transform without renaming
  products: (data) => ({ 
    ...data, 
    search_keywords: data.name?.toLowerCase().split(' ') || [],
    price_category: data.price > 100 ? 'premium' : 'standard'
  }),
  
  // Complex multi-destination with conditions
  orders: [
    'order_backup',              // Simple backup
    { 
      resource: 'order_analytics',
      transform: (data) => ({
        order_id: data.id,
        customer_id: data.userId,
        amount: data.amount,
        order_date: data.createdAt?.split('T')[0],
        status: data.status || 'pending',
        item_count: data.items?.length || 0,
        is_large_order: data.amount > 1000
      }),
      actions: ['insert', 'update']  // Only replicate inserts and updates, not deletes
    },
    {
      resource: 'financial_records',
      transform: (data) => ({
        transaction_id: data.id,
        amount: data.amount,
        currency: data.currency || 'USD',
        type: 'order_payment',
        timestamp: new Date().toISOString(),
        metadata: {
          customer_id: data.userId,
          order_items: data.items?.length || 0
        }
      }),
      actions: ['insert']  // Only replicate new orders for financial records
    }
  ],
  
  // Conditional replication
  users: {
    resource: 'customer_profiles',
    transform: (data) => {
      // Only replicate active users
      if (data.status !== 'active') return null;
      
      return {
        ...data,
        fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        account_age_days: data.createdAt ? 
          Math.floor((Date.now() - new Date(data.createdAt)) / (1000 * 60 * 60 * 24)) : 0,
        preferences: data.preferences || {},
        last_updated: new Date().toISOString()
      };
    },
    actions: ['insert', 'update']
  }
}
```

### 🔧 S3DB Replicator Configuration Options

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `connectionString` | string | Yes* | S3DB connection string for destination database |
| `client` | S3db | Yes* | Pre-configured S3DB client instance |
| `resources` | object/array | Yes | Resource mapping configuration (see syntaxes above) |
| `timeout` | number | No | Operation timeout in milliseconds (default: 30000) |
| `retryAttempts` | number | No | Number of retry attempts for failed operations (default: 3) |

*Either `connectionString` or `client` must be provided.

### 🎯 Transform Function Features

Transform functions provide powerful data manipulation capabilities:

#### Data Transformation Examples:
```javascript
// 1. Field mapping and enrichment
transform: (data) => ({
  id: data.id,
  customer_name: `${data.firstName} ${data.lastName}`,
  email_domain: data.email?.split('@')[1] || 'unknown',
  created_timestamp: Date.now(),
  source: 'production-db'
})

// 2. Conditional logic
transform: (data) => {
  if (data.type === 'premium') {
    return { ...data, priority: 'high', sla: '4hours' };
  }
  return { ...data, priority: 'normal', sla: '24hours' };
}

// 3. Data validation and filtering
transform: (data) => {
  // Skip replication for invalid data
  if (!data.email || !data.name) return null;
  
  return {
    ...data,
    email: data.email.toLowerCase(),
    name: data.name.trim(),
    validated: true
  };
}

// 4. Computed fields
transform: (data) => ({
  ...data,
  age: data.birthDate ? 
    Math.floor((Date.now() - new Date(data.birthDate)) / (1000 * 60 * 60 * 24 * 365)) : null,
  account_value: (data.orders || []).reduce((sum, order) => sum + order.amount, 0),
  last_activity: new Date().toISOString()
})

// 5. Data aggregation
transform: (data) => ({
  user_id: data.id,
  total_orders: data.orderHistory?.length || 0,
  total_spent: data.orderHistory?.reduce((sum, order) => sum + order.amount, 0) || 0,
  favorite_category: data.orderHistory?.map(o => o.category)
    .sort((a,b) => a.localeCompare(b))
    .reduce((prev, curr, i, arr) => 
      arr.filter(v => v === prev).length >= arr.filter(v => v === curr).length ? prev : curr
    ) || null,
  analysis_date: new Date().toISOString()
})
```

**Transform Function Best Practices:**
- **Return `null`** to skip replication for specific records
- **Preserve the `id` field** unless specifically mapping to a different field
- **Handle edge cases** like missing fields or null values
- **Use immutable operations** to avoid modifying the original data
- **Keep transforms lightweight** to maintain replication performance
- **Add metadata fields** like timestamps for tracking purposes

#### 📬 SQS Replicator

**Real-time event streaming** to AWS SQS queues for microservices integration and event-driven architectures.

**⚠️ Required Dependency:**
```bash
pnpm add @aws-sdk/client-sqs
```

**Basic Configuration:**
```javascript
{
  driver: 'sqs',
  resources: ['orders', 'users'],
  config: {
    region: 'us-east-1',
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/events.fifo',
    messageGroupId: 's3db-events',
    deduplicationId: true
  }
}
```

**Advanced Configuration with Resource-Specific Queues:**
```javascript
{
  driver: 'sqs',
  config: {
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    
    // Resource-specific queue URLs
    queues: {
      orders: 'https://sqs.us-east-1.amazonaws.com/123456789012/order-events.fifo',
      users: 'https://sqs.us-east-1.amazonaws.com/123456789012/user-events.fifo',
      payments: 'https://sqs.us-east-1.amazonaws.com/123456789012/payment-events.fifo'
    },
    
    // Default queue for resources not specifically mapped
    defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/general-events.fifo',
    
    // FIFO queue settings
    messageGroupId: 's3db-replicator',
    deduplicationId: true,
    
    // Message attributes (applied to all messages)
    messageAttributes: {
      source: { StringValue: 'production-db', DataType: 'String' },
      version: { StringValue: '1.0', DataType: 'String' },
      environment: { StringValue: process.env.NODE_ENV || 'development', DataType: 'String' }
    }
  },
  resources: {
    // Simple resource mapping
    orders: true,
    users: true,
    
    // Resource with transformation
    payments: {
      transform: (data) => ({
        payment_id: data.id,
        amount: data.amount,
        currency: data.currency || 'USD',
        customer_id: data.userId,
        payment_method: data.method,
        status: data.status,
        timestamp: new Date().toISOString(),
        
        // Add computed fields
        amount_usd: data.currency === 'USD' ? data.amount : data.amount * (data.exchange_rate || 1),
        is_large_payment: data.amount > 1000,
        risk_score: data.amount > 5000 ? 'high' : data.amount > 1000 ? 'medium' : 'low'
      })
    }
  }
}
```

**SQS Message Format:**
```javascript
{
  // Message Body (JSON string)
  MessageBody: JSON.stringify({
    resource: 'orders',           // Source resource name
    operation: 'insert',          // Operation: insert, update, delete
    id: 'order-123',             // Record ID
    data: {                      // Transformed data payload
      id: 'order-123',
      userId: 'user-456',
      amount: 99.99,
      status: 'pending',
      timestamp: '2024-01-15T10:30:00.000Z'
    },
    beforeData: null,            // Previous data for updates
    metadata: {
      source: 'production-db',
      replicator: 'sqs-replicator',
      timestamp: '2024-01-15T10:30:00.000Z'
    }
  }),
  
  // Message Attributes
  MessageAttributes: {
    source: { StringValue: 'production-db', DataType: 'String' },
    resource: { StringValue: 'orders', DataType: 'String' },
    operation: { StringValue: 'insert', DataType: 'String' }
  },
  
  // FIFO Queue Settings
  MessageGroupId: 's3db-events',
  MessageDeduplicationId: 'orders:insert:order-123'
}
```

**Configuration Options:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | Yes | AWS region for SQS service |
| `queueUrl` | string | Yes* | Single queue URL for all resources |
| `queues` | object | Yes* | Resource-specific queue mapping |
| `defaultQueueUrl` | string | No | Fallback queue for unmapped resources |
| `credentials` | object | No | AWS credentials (uses default chain if omitted) |
| `messageGroupId` | string | No | Message group ID for FIFO queues |
| `deduplicationId` | boolean | No | Enable message deduplication for FIFO queues |
| `messageAttributes` | object | No | Custom message attributes applied to all messages |

*Either `queueUrl` or `queues` must be provided.

#### 📊 BigQuery Replicator

**Data warehouse integration** for Google BigQuery with advanced transformation capabilities, multi-table support, and automatic retry logic for streaming buffer limitations.

**⚠️ Required Dependency:**
```bash
pnpm add @google-cloud/bigquery
```

**Basic Configuration:**
```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'my-analytics-project',
    datasetId: 'production_data',
    location: 'US',
    credentials: {
      client_email: 'service-account@project.iam.gserviceaccount.com',
      private_key: process.env.BIGQUERY_PRIVATE_KEY,
      project_id: 'my-analytics-project'
    }
  },
  resources: {
    // Simple table mapping
    users: 'users_table',
    orders: 'orders_table',
    products: 'products_table'
  }
}
```

**Advanced Multi-Table Configuration:**
```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'my-analytics-project',
    datasetId: 'analytics_warehouse',
    location: 'US',
    logTable: 'replication_audit_log',  // Optional: audit all operations
    credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDENTIALS, 'base64').toString())
  },
  resources: {
    // Simple string mapping
    sessions: 'user_sessions',
    clicks: 'click_events',
    
    // Single table with actions and transforms
    users: {
      table: 'dim_users',
      actions: ['insert', 'update'],
      transform: (data) => ({
        ...data,
        // Data cleaning and enrichment
        email: data.email?.toLowerCase(),
        full_name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        registration_date: data.createdAt?.split('T')[0],
        account_age_days: data.createdAt ? 
          Math.floor((Date.now() - new Date(data.createdAt)) / (1000 * 60 * 60 * 24)) : 0,
        
        // Computed fields for analytics
        user_tier: data.totalSpent > 1000 ? 'premium' : 
                   data.totalSpent > 100 ? 'standard' : 'basic',
        is_active: data.lastLoginAt && 
          (Date.now() - new Date(data.lastLoginAt)) < (30 * 24 * 60 * 60 * 1000),
        
        // BigQuery-specific fields
        processed_at: new Date().toISOString(),
        data_source: 'production_s3db'
      })
    },
    
    // Multiple destinations for comprehensive analytics
    orders: [
      // Fact table for detailed order data
      {
        table: 'fact_orders',
        actions: ['insert', 'update'],
        transform: (data) => ({
          order_id: data.id,
          customer_id: data.userId,
          order_date: data.createdAt?.split('T')[0],
          order_timestamp: data.createdAt,
          amount: parseFloat(data.amount) || 0,
          currency: data.currency || 'USD',
          status: data.status,
          item_count: data.items?.length || 0,
          
          // Derived analytics fields
          is_weekend_order: new Date(data.createdAt).getDay() % 6 === 0,
          order_hour: new Date(data.createdAt).getHours(),
          is_large_order: data.amount > 500,
          
          // Metadata
          ingested_at: new Date().toISOString(),
          source_system: 'production'
        })
      },
      
      // Daily aggregation table
      {
        table: 'daily_revenue_summary',
        actions: ['insert'],  // Only for new orders
        transform: (data) => ({
          date: data.createdAt?.split('T')[0],
          revenue: parseFloat(data.amount) || 0,
          currency: data.currency || 'USD',
          order_count: 1,
          customer_id: data.userId,
          
          // Additional dimensions
          order_source: data.source || 'web',
          payment_method: data.paymentMethod,
          is_first_order: data.isFirstOrder || false,
          
          created_at: new Date().toISOString()
        })
      },
      
      // Customer analytics (updates only)
      {
        table: 'customer_order_analytics',
        actions: ['insert', 'update'],
        transform: (data) => ({
          customer_id: data.userId,
          latest_order_id: data.id,
          latest_order_date: data.createdAt?.split('T')[0],
          latest_order_amount: parseFloat(data.amount) || 0,
          
          // Will need to be aggregated in BigQuery
          lifetime_value_increment: parseFloat(data.amount) || 0,
          
          updated_at: new Date().toISOString()
        })
      }
    ],
    
    // Event tracking with conditional replication
    events: {
      table: 'user_events',
      actions: ['insert'],
      transform: (data) => {
        // Only replicate certain event types
        const allowedEventTypes = ['page_view', 'button_click', 'form_submit', 'purchase'];
        if (!allowedEventTypes.includes(data.event_type)) {
          return null; // Skip replication
        }
        
        return {
          event_id: data.id,
          user_id: data.userId,
          event_type: data.event_type,
          event_timestamp: data.timestamp,
          event_date: data.timestamp?.split('T')[0],
          
          // Parse and clean event properties
          properties: JSON.stringify(data.properties || {}),
          page_url: data.properties?.page_url,
          referrer: data.properties?.referrer,
          
          // Session information
          session_id: data.sessionId,
          
          // Technical metadata
          user_agent: data.userAgent,
          ip_address: data.ipAddress ? 'masked' : null, // Privacy compliance
          
          // Processing metadata
          processed_at: new Date().toISOString(),
          schema_version: '1.0'
        };
      }
    }
  }
}
```

**Transform Function Features:**

1. **Data Cleaning & Validation:**
```javascript
transform: (data) => {
  // Skip invalid records
  if (!data.email || !data.id) return null;
  
  return {
    ...data,
    email: data.email.toLowerCase().trim(),
    phone: data.phone?.replace(/\D/g, '') || null, // Remove non-digits
    validated_at: new Date().toISOString()
  };
}
```

2. **Type Conversion for BigQuery:**
```javascript
transform: (data) => ({
  ...data,
  amount: parseFloat(data.amount) || 0,
  quantity: parseInt(data.quantity) || 0,
  is_active: Boolean(data.isActive),
  tags: Array.isArray(data.tags) ? data.tags : [],
  metadata: JSON.stringify(data.metadata || {})
})
```

3. **Computed Analytics Fields:**
```javascript
transform: (data) => ({
  ...data,
  // Date dimensions
  order_date: data.createdAt?.split('T')[0],
  order_year: new Date(data.createdAt).getFullYear(),
  order_month: new Date(data.createdAt).getMonth() + 1,
  order_quarter: Math.ceil((new Date(data.createdAt).getMonth() + 1) / 3),
  
  // Business logic
  customer_segment: data.totalSpent > 1000 ? 'VIP' : 
                   data.totalSpent > 500 ? 'Premium' : 'Standard',
  
  // Geospatial (if you have coordinates)
  location_string: data.lat && data.lng ? `${data.lat},${data.lng}` : null
})
```

**Configuration Options:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | Google Cloud project ID |
| `datasetId` | string | Yes | BigQuery dataset ID |
| `credentials` | object | No | Service account credentials (uses ADC if omitted) |
| `location` | string | No | Dataset location/region (default: 'US') |
| `logTable` | string | No | Table name for operation audit logging |

**Resource Configuration Formats:**

1. **String**: Simple table mapping
```javascript
resources: { users: 'users_table' }
```

2. **Object**: Single table with actions and transform
```javascript
resources: {
  users: {
    table: 'users_table',
    actions: ['insert', 'update'],
    transform: (data) => ({ ...data, processed: true })
  }
}
```

3. **Array**: Multiple destination tables
```javascript
resources: {
  orders: [
    { table: 'fact_orders', actions: ['insert'] },
    { table: 'daily_revenue', actions: ['insert'], transform: aggregationFn }
  ]
}
```

**Automatic Features:**

- **🔄 Retry Logic**: Handles BigQuery streaming buffer limitations with 30-second delays
- **🛡️ Error Handling**: Graceful handling of schema mismatches and quota limits  
- **📋 Operation Logging**: Optional audit trail in specified log table
- **🔧 Schema Compatibility**: Automatic handling of missing fields and type coercion
- **⚡ Streaming Inserts**: Uses BigQuery streaming API for real-time data ingestion
- **🎯 Selective Replication**: Transform functions can return `null` to skip records

#### 🐘 PostgreSQL Replicator

**Operational database integration** for PostgreSQL with support for complex SQL operations, connection pooling, and custom transformations.

**⚠️ Required Dependency:**
```bash
pnpm add pg
```

**Basic Configuration:**
```javascript
{
  driver: 'postgres',
  config: {
    connectionString: 'postgresql://user:pass@localhost:5432/analytics',
    ssl: { rejectUnauthorized: false },
    pool: {
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    }
  },
  resources: {
    users: [{ 
      table: 'users_table',
      actions: ['insert', 'update', 'delete']
    }]
  }
}
```

**Advanced Configuration with Custom SQL:**
```javascript
{
  driver: 'postgres',
  config: {
    connectionString: 'postgresql://analytics:password@localhost:5432/operations',
    ssl: { rejectUnauthorized: false },
    logTable: 'replication_audit',
    pool: {
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      acquireTimeoutMillis: 60000
    }
  },
  resources: {
    // Multi-table replication with different strategies
    users: [
      {
        table: 'operational_users',
        actions: ['insert', 'update', 'delete'],
        transform: (data, operation) => {
          if (operation === 'delete') {
            return { 
              id: data.id, 
              deleted_at: new Date(),
              deletion_reason: 'user_requested'
            };
          }
          
          return {
            ...data,
            sync_timestamp: new Date(),
            source_system: 's3db',
            data_version: '1.0',
            
            // Computed fields
            full_name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
            email_domain: data.email?.split('@')[1] || 'unknown',
            account_age_days: data.createdAt ? 
              Math.floor((Date.now() - new Date(data.createdAt)) / (1000 * 60 * 60 * 24)) : 0
          };
        }
      },
      
      // Separate audit trail table
      {
        table: 'user_audit_trail',
        actions: ['insert', 'update', 'delete'],
        transform: (data, operation) => ({
          user_id: data.id,
          operation_type: operation,
          operation_timestamp: new Date(),
          data_snapshot: JSON.stringify(data),
          source_database: 's3db',
          replication_id: crypto.randomUUID()
        })
      }
    ],
    
    // Orders with complex business logic
    orders: [
      {
        table: 'order_events',
        actions: ['insert'],
        transform: (data) => ({
          event_id: crypto.randomUUID(),
          order_id: data.id,
          customer_id: data.userId,
          event_type: 'order_created',
          event_timestamp: new Date(),
          order_amount: parseFloat(data.amount) || 0,
          order_status: data.status || 'pending',
          
          // Business metrics
          is_large_order: data.amount > 500,
          order_priority: data.amount > 1000 ? 'high' : 
                         data.amount > 100 ? 'medium' : 'low',
          estimated_fulfillment: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
          
          // Metadata
          created_at: new Date(),
          source_system: 'production_s3db'
        })
      },
      
      {
        table: 'order_updates',
        actions: ['update'],
        transform: (data, operation, beforeData) => ({
          update_id: crypto.randomUUID(),
          order_id: data.id,
          updated_at: new Date(),
          
          // Track what changed
          changed_fields: Object.keys(data).filter(key => 
            beforeData && data[key] !== beforeData[key]
          ),
          previous_status: beforeData?.status,
          new_status: data.status,
          
          // Change metadata
          status_progression: `${beforeData?.status || 'unknown'} -> ${data.status}`,
          update_source: 'automated_replication'
        })
      }
    ],
    
    // Conditional replication based on data
    sensitive_data: {
      table: 'masked_sensitive_data',
      actions: ['insert', 'update'],
      transform: (data) => {
        // Skip replication for certain sensitive records
        if (data.privacy_level === 'restricted') {
          return null;
        }
        
        return {
          id: data.id,
          // Mask sensitive fields
          email: data.email ? `${data.email.split('@')[0].slice(0, 3)}***@${data.email.split('@')[1]}` : null,
          phone: data.phone ? `***-***-${data.phone.slice(-4)}` : null,
          name: data.name ? `${data.name.charAt(0)}${'*'.repeat(data.name.length - 1)}` : null,
          
          // Keep non-sensitive data
          created_at: data.createdAt,
          status: data.status,
          category: data.category,
          
          // Add masking metadata
          masked_at: new Date(),
          masking_version: '1.0'
        };
      }
    }
  }
}
```

**Configuration Options:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `connectionString` | string | Yes | PostgreSQL connection string |
| `ssl` | object | No | SSL configuration options |
| `pool` | object | No | Connection pool configuration |
| `logTable` | string | No | Table name for operation audit logging |

**Pool Configuration Options:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max` | number | `10` | Maximum number of connections in pool |
| `min` | number | `0` | Minimum number of connections in pool |
| `idleTimeoutMillis` | number | `10000` | How long a client is allowed to remain idle |
| `connectionTimeoutMillis` | number | `0` | Return an error after timeout |
| `acquireTimeoutMillis` | number | `0` | Return an error if no connection available |

**Resource Configuration:**

Resources must be configured as arrays of table configurations:

```javascript
resources: {
  resourceName: [
    {
      table: 'destination_table',
      actions: ['insert', 'update', 'delete'],
      transform: (data, operation, beforeData) => ({
        // Return transformed data or null to skip
      })
    }
  ]
}
```

**Automatic Features:**

- **🔄 Connection Pooling**: Efficient database connection management
- **📋 Audit Logging**: Optional audit trail in specified log table
- **🛡️ Error Handling**: Graceful handling of connection failures and SQL errors
- **⚡ Bulk Operations**: Optimized for high-throughput replication
- **🎯 Flexible Actions**: Support for insert, update, delete operations
- **🔧 Custom SQL**: Transform functions receive operation context for complex logic

### 🔍 Monitoring & Health Checks

Monitor replication health and performance with built-in tools:

```javascript
// Get replication status for all replicators
const replicationStatus = await replicatorPlugin.getReplicationStats();

console.log('Replication Health:', {
  totalReplicators: replicationStatus.replicators.length,
  activeReplicators: replicationStatus.replicators.filter(r => r.status.enabled).length,
  lastSync: replicationStatus.lastSync,
  errorRate: replicationStatus.stats.errorRate
});

// Check individual replicator health
for (const replicator of replicationStatus.replicators) {
  console.log(`${replicator.driver} replicator:`, {
    enabled: replicator.status.enabled,
    connected: replicator.status.connected,
    lastActivity: replicator.status.lastActivity,
    totalOperations: replicator.status.totalOperations,
    errorCount: replicator.status.errorCount
  });
}

// Get detailed replication logs
const replicationLogs = await replicatorPlugin.getReplicationLogs({
  resourceName: 'users',     // Filter by resource
  status: 'failed',          // Show only failed replications
  limit: 50,                 // Limit results
  offset: 0                  // Pagination
});

console.log('Recent failures:', replicationLogs.map(log => ({
  timestamp: log.timestamp,
  resource: log.resourceName,
  operation: log.operation,
  error: log.error,
  replicator: log.replicator
})));

// Retry failed replications
const retryResult = await replicatorPlugin.retryFailedReplications();
console.log(`Retried ${retryResult.retried} failed replications`);
```

### 🚨 Troubleshooting Guide

#### Common Issues and Solutions

**1. Replication Not Happening**
```javascript
// Check if replicator is enabled
const plugin = s3db.plugins.find(p => p.constructor.name === 'ReplicatorPlugin');
console.log('Plugin enabled:', plugin.config.enabled);

// Check resource configuration
console.log('Resources configured:', Object.keys(plugin.config.replicators[0].resources));

// Listen for debug events
plugin.on('replicator_error', (error) => {
  console.error('Replication error:', error);
});
```

**2. Transform Function Errors**
```javascript
// Add error handling in transform functions
transform: (data) => {
  try {
    return {
      ...data,
      fullName: `${data.firstName} ${data.lastName}`,
      processedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Transform error:', error, 'Data:', data);
    return data; // Fallback to original data
  }
}
```

**3. Connection Issues**
```javascript
// Test replicator connections
const testResults = await Promise.allSettled(
  replicatorPlugin.replicators.map(async (replicator) => {
    try {
      const result = await replicator.testConnection();
      return { replicator: replicator.id, success: result, error: null };
    } catch (error) {
      return { replicator: replicator.id, success: false, error: error.message };
    }
  })
);

testResults.forEach(result => {
  if (result.status === 'fulfilled') {
    console.log(`${result.value.replicator}: ${result.value.success ? '✅' : '❌'} ${result.value.error || ''}`);
  }
});
```

**4. Performance Issues**
```javascript
// Monitor replication performance
const performanceMonitor = setInterval(async () => {
  const stats = await replicatorPlugin.getReplicationStats();
  
  console.log('Performance Metrics:', {
    operationsPerSecond: stats.operationsPerSecond,
    averageLatency: stats.averageLatency,
    queueSize: stats.queueSize,
    memoryUsage: process.memoryUsage()
  });
  
  // Alert on performance degradation
  if (stats.averageLatency > 5000) { // 5 seconds
    console.warn('⚠️ High replication latency detected:', stats.averageLatency + 'ms');
  }
}, 30000); // Check every 30 seconds
```

### 🎯 Advanced Use Cases

#### Multi-Environment Replication Pipeline

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  verbose: true,
  persistReplicatorLog: true,
  replicators: [
    // Production backup
    {
      driver: 's3db',
      config: { connectionString: process.env.BACKUP_DB_URL },
      resources: ['users', 'orders', 'products']
    },
    
    // Staging environment sync
    {
      driver: 's3db',
      config: { connectionString: process.env.STAGING_DB_URL },
      resources: {
        users: {
          resource: 'users',
          transform: (data) => ({
            ...data,
            // Remove PII for staging
            email: data.email?.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
            phone: '***-***-' + (data.phone?.slice(-4) || '0000')
          })
        }
      }
    },
    
    // Analytics warehouse
    {
      driver: 'bigquery',
      config: {
        projectId: 'analytics-project',
        datasetId: 'production_data'
      },
      resources: {
        orders: [
          { table: 'fact_orders', actions: ['insert'] },
          { table: 'daily_revenue', actions: ['insert'], transform: aggregateDaily }
        ]
      }
    },
    
    // Real-time events
    {
      driver: 'sqs',
      config: {
        region: 'us-east-1',
        queues: {
          users: process.env.USER_EVENTS_QUEUE,
          orders: process.env.ORDER_EVENTS_QUEUE
        }
      },
      resources: ['users', 'orders']
    }
  ]
});
```

#### Conditional Replication Based on Business Rules

```javascript
const businessRulesReplicator = new ReplicatorPlugin({
  replicators: [
    {
      driver: 's3db',
      config: { connectionString: process.env.COMPLIANCE_DB_URL },
      resources: {
        users: {
          resource: 'compliant_users',
          transform: (data) => {
            // Only replicate users from certain regions
            const allowedRegions = ['US', 'EU', 'CA'];
            if (!allowedRegions.includes(data.region)) {
              return null; // Skip replication
            }
            
            // Apply data retention rules
            const accountAge = Date.now() - new Date(data.createdAt);
            const maxAge = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years
            
            if (accountAge > maxAge && data.status === 'inactive') {
              return null; // Skip old inactive accounts
            }
            
            return {
              ...data,
              complianceVersion: '2.0',
              lastAudit: new Date().toISOString(),
              retentionCategory: accountAge > maxAge * 0.8 ? 'pending_review' : 'active'
            };
          }
        },
        
        orders: {
          resource: 'audit_orders',
          transform: (data) => {
            // Only replicate high-value orders for compliance
            if (data.amount < 10000) return null;
            
            return {
              order_id: data.id,
              customer_id: data.userId,
              amount: data.amount,
              currency: data.currency,
              order_date: data.createdAt,
              compliance_flag: 'high_value',
              audit_required: true,
              retention_years: 10
            };
          }
        }
      }
    }
  ]
});
```

#### Event-Driven Architecture Integration

```javascript
// Custom event handlers for complex workflows
replicatorPlugin.on('replicated', async (event) => {
  const { resourceName, operation, recordId, replicator } = event;
  
  // Trigger downstream processes
  if (resourceName === 'orders' && operation === 'insert') {
    // Trigger inventory update
    await inventoryService.updateStock(event.data);
    
    // Send confirmation email
    await emailService.sendOrderConfirmation(event.data);
    
    // Update analytics dashboard
    await analyticsService.recordSale(event.data);
  }
  
  if (resourceName === 'users' && operation === 'update') {
    // Check for important profile changes
    const criticalFields = ['email', 'phone', 'address'];
    const changedFields = Object.keys(event.data);
    
    if (criticalFields.some(field => changedFields.includes(field))) {
      await auditService.logCriticalChange({
        userId: recordId,
        changedFields: changedFields.filter(f => criticalFields.includes(f)),
        timestamp: new Date()
      });
    }
  }
});

// Handle replication failures with custom logic
replicatorPlugin.on('replicator_error', async (error) => {
  const { resourceName, operation, recordId, replicator, error: errorMessage } = error;
  
  // Log to external monitoring system
  await monitoringService.logError({
    service: 'replication',
    error: errorMessage,
    context: { resourceName, operation, recordId, replicator }
  });
  
  // Send alerts for critical resources
  const criticalResources = ['users', 'orders', 'payments'];
  if (criticalResources.includes(resourceName)) {
    await alertingService.sendAlert({
      severity: 'high',
      message: `Critical replication failure: ${resourceName}`,
      details: error
    });
  }
  
  // Implement circuit breaker pattern
  const errorCount = await redis.incr(`replication_errors:${replicator}`);
  await redis.expire(`replication_errors:${replicator}`, 3600); // 1 hour window
  
  if (errorCount > 10) {
    console.warn(`⚠️ Circuit breaker: Disabling ${replicator} due to high error rate`);
    // Temporarily disable problematic replicator
    const problematicReplicator = replicatorPlugin.replicators.find(r => r.id === replicator);
    if (problematicReplicator) {
      problematicReplicator.enabled = false;
    }
  }
});
```

### 🎛️ Performance Tuning

#### Optimize Replication Performance

```javascript
// Configure for high-throughput scenarios
const highPerformanceReplicator = new ReplicatorPlugin({
  batchSize: 500,           // Larger batches for better throughput
  maxRetries: 5,            // More retries for reliability
  timeout: 60000,           // Longer timeout for large operations
  
  replicators: [
    {
      driver: 'bigquery',
      config: {
        projectId: 'analytics',
        datasetId: 'high_volume_data',
        // Use streaming inserts for real-time data
        streamingInserts: true,
        insertAllTimeout: 30000
      },
      resources: {
        events: {
          table: 'raw_events',
          actions: ['insert'],
          // Optimize transform for performance
          transform: (data) => {
            // Pre-compute expensive operations
            const eventDate = data.timestamp?.split('T')[0];
            
            return {
              event_id: data.id,
              user_id: data.userId,
              event_type: data.type,
              event_date: eventDate,
              properties: JSON.stringify(data.properties || {}),
              
              // Batch-friendly fields
              partition_date: eventDate,
              ingestion_timestamp: Math.floor(Date.now() / 1000) // Unix timestamp
            };
          }
        }
      }
    },
    
    {
      driver: 'postgres',
      config: {
        connectionString: process.env.POSTGRES_URL,
        pool: {
          max: 50,              // Larger connection pool
          min: 10,
          idleTimeoutMillis: 60000,
          acquireTimeoutMillis: 10000
        }
      },
      resources: {
        users: [{
          table: 'users_cache',
          actions: ['insert', 'update'],
          // Use upsert pattern for better performance
          upsertMode: true,
          transform: (data) => ({
            id: data.id,
            email: data.email,
            name: data.name,
            updated_at: new Date(),
            
            // Optimized for query performance
            search_vector: `${data.name} ${data.email}`.toLowerCase()
          })
        }]
      }
    }
  ]
});
```

### 🔐 Security Best Practices

#### Secure Replication Configuration

```javascript
const secureReplicator = new ReplicatorPlugin({
  replicators: [
    {
      driver: 'bigquery',
      config: {
        projectId: 'secure-analytics',
        datasetId: 'encrypted_data',
        // Use service account with minimal permissions
        credentials: {
          type: 'service_account',
          project_id: 'secure-analytics',
          private_key: process.env.BIGQUERY_PRIVATE_KEY,
          client_email: 'replication-service@secure-analytics.iam.gserviceaccount.com'
        }
      },
      resources: {
        users: {
          table: 'encrypted_users',
          actions: ['insert', 'update'],
          transform: (data) => ({
            // Hash sensitive identifiers
            user_hash: crypto.createHash('sha256').update(data.id + process.env.SALT).digest('hex'),
            
            // Encrypt PII fields
            encrypted_email: encrypt(data.email),
            encrypted_phone: data.phone ? encrypt(data.phone) : null,
            
            // Keep non-sensitive analytics data
            registration_date: data.createdAt?.split('T')[0],
            account_type: data.accountType,
            region: data.region,
            
            // Add encryption metadata
            encryption_version: '1.0',
            processed_at: new Date().toISOString()
          })
        }
      }
    }
  ]
});

// Encryption utility functions
function encrypt(text) {
  if (!text) return null;
  const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const decipher = crypto.createDecipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### ✅ Best Practices Summary

1. **Configuration Management**
   - Use environment variables for connection strings and credentials
   - Implement proper error handling in transform functions
   - Test replicator connections during application startup

2. **Performance Optimization**
   - Use appropriate batch sizes for your data volume
   - Configure connection pools for database replicators
   - Monitor replication lag and throughput

3. **Security & Compliance**
   - Encrypt sensitive data before replication
   - Implement data masking for non-production environments
   - Use minimal privilege service accounts

4. **Monitoring & Alerting**
   - Set up alerts for replication failures
   - Monitor replication lag and error rates
   - Implement health checks for all replicators

5. **Error Handling**
   - Implement circuit breakers for unreliable targets
   - Use dead letter queues for failed messages
   - Log detailed error information for debugging

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
      driver: 'memory',
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
