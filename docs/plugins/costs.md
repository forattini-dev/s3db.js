# 💰 Costs Plugin

<p align="center">
  <strong>Real-time AWS S3 Cost Tracking</strong><br>
  <em>Track and monitor AWS S3 costs by calculating expenses for each API operation</em>
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Cost Tracking Details](#cost-tracking-details)
- [Best Practices](#best-practices)

---

## Overview

The Costs Plugin tracks and monitors AWS S3 costs in real-time by calculating expenses for each API operation. It's essential for cost optimization and budget management, providing detailed insights into your S3 usage patterns and associated costs.

### How It Works

1. **Automatic Tracking**: Automatically tracks all S3 API operations
2. **Real-time Calculations**: Calculates costs based on current AWS S3 pricing
3. **Detailed Breakdown**: Provides operation-by-operation cost analysis
4. **Zero Configuration**: Static plugin that requires no setup or configuration

> 💡 **Essential for Cost Management**: Perfect for understanding and optimizing your S3 API usage costs.

---

## Key Features

### 🎯 Core Features
- **Real-time Cost Tracking**: Monitor costs as operations happen
- **Operation Breakdown**: Detailed cost analysis by operation type
- **Request Counting**: Track the number of each type of request
- **Zero Configuration**: Static plugin with automatic setup
- **AWS Pricing Alignment**: Uses current AWS S3 pricing structure

### 🔧 Technical Features
- **Command-level Tracking**: Tracks specific AWS SDK commands
- **Cumulative Totals**: Maintains running totals across all operations
- **Cost Projections**: Calculate monthly/yearly cost projections
- **Performance Metrics**: Cost per request and efficiency analysis

---

## Installation & Setup

### Basic Setup

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

---

## Configuration Options

The Costs Plugin is a **static plugin** with no configuration options. It automatically tracks all S3 operations without any setup required.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| None | - | - | Static plugin requires no configuration |

**Usage**: Simply add `CostsPlugin` (without `new`) to your plugins array.

---

## Cost Tracking Details

### AWS S3 Pricing Structure

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

---

## Usage Examples

### Basic Cost Tracking

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

### Advanced Cost Monitoring

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

// Generate detailed report
monitor.report();
```

### Cost Alerts and Monitoring

```javascript
// Set up cost monitoring with alerts
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

await s3db.connect();

// Function to check cost thresholds
function checkCostThresholds(costs) {
  const thresholds = {
    warning: 0.01,  // $0.01
    critical: 0.05  // $0.05
  };
  
  if (costs.total >= thresholds.critical) {
    console.error(`🚨 CRITICAL: Cost threshold exceeded: $${costs.total.toFixed(6)}`);
    return 'critical';
  } else if (costs.total >= thresholds.warning) {
    console.warn(`⚠️  WARNING: Cost threshold exceeded: $${costs.total.toFixed(6)}`);
    return 'warning';
  }
  
  return 'ok';
}

// Perform operations with monitoring
const users = s3db.resource('users');
await users.insertMany([
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' }
]);

// Check costs after operations
const alertLevel = checkCostThresholds(s3db.client.costs);

// Export detailed cost data
const costReport = {
  timestamp: new Date().toISOString(),
  alertLevel,
  costs: s3db.client.costs,
  projections: {
    dailyCost: s3db.client.costs.total * (24 * 60 * 60 * 1000) / Date.now(),
    monthlyCost: s3db.client.costs.total * 30,
    yearlyProjection: s3db.client.costs.total * 365
  }
};

console.log('Cost Report:', JSON.stringify(costReport, null, 2));
```

---

## API Reference

### Accessing Cost Data

```javascript
// Access via s3db client
const costs = s3db.client.costs;

// Cost properties
costs.total;        // Total cost in USD (number)
costs.prices;       // Cost per 1000 requests (object)
costs.requests;     // Request counters by operation (object)
costs.events;       // Command-specific counters (object)
```

### Cost Data Properties

#### `total` (number)
Total accumulated cost in USD.

#### `prices` (object)
Cost per 1000 requests for each operation type:
```javascript
{
  put: 0.000005,      // $0.005 per 1000 requests
  get: 0.0000004,     // $0.0004 per 1000 requests
  head: 0.0000004,    // $0.0004 per 1000 requests
  delete: 0.0000004,  // $0.0004 per 1000 requests
  list: 0.000005      // $0.005 per 1000 requests
}
```

#### `requests` (object)
Request counters by operation type:
```javascript
{
  total: 15,    // Total requests across all operations
  put: 3,       // PUT operation requests
  get: 8,       // GET operation requests
  head: 2,      // HEAD operation requests
  delete: 1,    // DELETE operation requests
  list: 1       // LIST operation requests
}
```

#### `events` (object)
Command-specific request counters:
```javascript
{
  total: 15,                // Total commands executed
  PutObjectCommand: 3,      // AWS SDK PutObjectCommand count
  GetObjectCommand: 8,      // AWS SDK GetObjectCommand count
  HeadObjectCommand: 2,     // AWS SDK HeadObjectCommand count
  DeleteObjectCommand: 1,   // AWS SDK DeleteObjectCommand count
  ListObjectsV2Command: 1   // AWS SDK ListObjectsV2Command count
}
```

---

## Best Practices

### 1. Regular Cost Monitoring

```javascript
// Set up periodic cost reporting
setInterval(() => {
  const costs = s3db.client.costs;
  if (costs.total > 0) {
    console.log(`Current session cost: $${costs.total.toFixed(6)}`);
    console.log(`Total requests: ${costs.requests.total}`);
  }
}, 60000); // Every minute
```

### 2. Optimize Based on Cost Data

```javascript
// Analyze which operations are most expensive
const costs = s3db.client.costs;
const operationCosts = Object.entries(costs.requests)
  .filter(([op]) => op !== 'total' && costs.requests[op] > 0)
  .map(([op, count]) => ({
    operation: op,
    count,
    totalCost: count * costs.prices[op],
    costPerRequest: costs.prices[op]
  }))
  .sort((a, b) => b.totalCost - a.totalCost);

console.log('Most expensive operations:');
operationCosts.forEach(op => {
  console.log(`${op.operation}: ${op.count} requests = $${op.totalCost.toFixed(6)}`);
});
```

### 3. Set Up Cost Budgets

```javascript
class CostBudget {
  constructor(s3db, dailyBudget = 0.10) { // $0.10 per day
    this.s3db = s3db;
    this.dailyBudget = dailyBudget;
    this.startTime = Date.now();
  }
  
  checkBudget() {
    const costs = this.s3db.client.costs;
    const timeElapsed = Date.now() - this.startTime;
    const dailyProjection = costs.total * (24 * 60 * 60 * 1000) / timeElapsed;
    
    const budgetUsed = dailyProjection / this.dailyBudget;
    
    if (budgetUsed > 1.0) {
      console.error(`🚨 Daily budget exceeded! Projected: $${dailyProjection.toFixed(6)}`);
      return false;
    } else if (budgetUsed > 0.8) {
      console.warn(`⚠️  80% of daily budget used. Projected: $${dailyProjection.toFixed(6)}`);
    }
    
    return true;
  }
}
```

### 4. Export Cost Data for Analysis

```javascript
// Function to export cost data in various formats
function exportCostData(s3db, format = 'json') {
  const costs = s3db.client.costs;
  const timestamp = new Date().toISOString();
  
  const data = {
    timestamp,
    costs,
    analysis: {
      mostFrequentOperation: Object.entries(costs.requests)
        .filter(([op]) => op !== 'total')
        .sort(([,a], [,b]) => b - a)[0]?.[0],
      costPerRequest: costs.total / costs.requests.total,
      efficiency: costs.requests.total / costs.total // requests per dollar
    }
  };
  
  if (format === 'csv') {
    // Convert to CSV format for spreadsheet analysis
    const csv = [
      'Timestamp,Operation,Requests,Cost',
      ...Object.entries(costs.requests)
        .filter(([op]) => op !== 'total')
        .map(([op, count]) => 
          `${timestamp},${op},${count},${(count * costs.prices[op]).toFixed(8)}`
        )
    ].join('\n');
    return csv;
  }
  
  return JSON.stringify(data, null, 2);
}
```

### 5. Performance vs Cost Optimization

```javascript
// Compare different approaches and their costs
async function compareApproaches(s3db) {
  const users = s3db.resource('users');
  
  // Reset cost tracking
  Object.keys(s3db.client.costs.requests).forEach(key => {
    s3db.client.costs.requests[key] = 0;
  });
  s3db.client.costs.total = 0;
  
  // Approach 1: Individual inserts
  console.time('Individual inserts');
  for (let i = 0; i < 10; i++) {
    await users.insert({ name: `User ${i}` });
  }
  console.timeEnd('Individual inserts');
  const individualCost = s3db.client.costs.total;
  
  // Reset for next test
  Object.keys(s3db.client.costs.requests).forEach(key => {
    s3db.client.costs.requests[key] = 0;
  });
  s3db.client.costs.total = 0;
  
  // Approach 2: Batch insert
  console.time('Batch insert');
  const batchData = Array.from({ length: 10 }, (_, i) => ({ name: `Batch User ${i}` }));
  await users.insertMany(batchData);
  console.timeEnd('Batch insert');
  const batchCost = s3db.client.costs.total;
  
  console.log(`Individual inserts cost: $${individualCost.toFixed(6)}`);
  console.log(`Batch insert cost: $${batchCost.toFixed(6)}`);
  console.log(`Savings with batch: $${(individualCost - batchCost).toFixed(6)}`);
}
```

---

## Troubleshooting

### Issue: Costs showing as zero
**Solution**: Ensure the plugin is added correctly as `CostsPlugin` (not `new CostsPlugin()`).

### Issue: Costs seem inaccurate
**Solution**: Verify you're using the latest plugin version. AWS pricing may change over time.

### Issue: Need historical cost data
**Solution**: The plugin only tracks current session costs. Implement your own persistence layer to store historical data.

### Issue: High costs detected
**Solution**: Use the cost breakdown to identify expensive operations and optimize your usage patterns.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Cache Plugin](./cache.md) - Reduce costs through intelligent caching
- [Metrics Plugin](./metrics.md) - Monitor performance alongside costs
- [Audit Plugin](./audit.md) - Track operations for cost analysis