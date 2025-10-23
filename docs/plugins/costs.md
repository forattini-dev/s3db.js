# 💰 Costs Plugin

## ⚡ TLDR

**Real-time** AWS S3 cost tracking with comprehensive request, storage, and data transfer monitoring.

**1 line to get started:**
```javascript
plugins: [CostsPlugin]  // Done! Optional configuration available
```

**Key features:**
- ✅ Zero configuration (static plugin, optional config for free tier)
- ✅ Real-time cost tracking for requests, storage, and data transfer
- ✅ Accurate AWS pricing (requests + storage + data transfer)
- ✅ Tiered pricing support (AWS pricing tiers for storage/transfer)
- ✅ Free tier support (100GB/month data transfer OUT)
- ✅ Breakdown by operation + command
- ✅ Monthly/yearly projections

**When to use:**
- 💰 Budget monitoring
- 📊 Cost optimization
- 🔍 Identify expensive operations
- 📈 Future cost projection
- 💾 Storage cost tracking
- 🌐 Data transfer cost monitoring

**Access:**
```javascript
console.log('Total cost:', s3db.client.costs.total);  // $0.123456
console.log('Requests:', s3db.client.costs.requests.counts);  // { put: 3, get: 8, ... }
console.log('Storage:', s3db.client.costs.storage.totalGB);  // 1.5 GB
console.log('Data transfer:', s3db.client.costs.dataTransfer.outGB);  // 0.8 GB
```

---

## 🚀 Quick Start

```javascript
import { S3db, CostsPlugin } from 's3db.js';

// 1. Setup database with CostsPlugin
const db = new S3db({
  connectionString: "s3://KEY:SECRET@bucket/path",
  plugins: [CostsPlugin]
});

await db.connect();

// 2. Use your database normally
const users = db.resources.users;
await users.insert({ name: 'John', email: 'john@example.com' });
await users.list();

// 3. Check costs anytime
console.log('💰 Total cost:', db.client.costs.total);
console.log('📊 Breakdown:');
console.log('  Requests:', db.client.costs.requests.subtotal);
console.log('  Storage:', db.client.costs.storage.subtotal);
console.log('  Transfer:', db.client.costs.dataTransfer.subtotal);
```

**That's it!** Zero configuration needed. Costs are tracked automatically. 🎉

### Enable Free Tier (100GB/month data transfer):

```javascript
// Optional: Enable AWS free tier for data transfer
await CostsPlugin.setup(db, { considerFreeTier: true });
```

---

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [📖 Overview](#overview)
- [✨ Key Features](#key-features)
- [⚙️ Installation & Setup](#installation--setup)
- [🎛️ Configuration Options](#configuration-options)
- [💡 Usage Examples](#usage-examples)
  - [Basic Cost Tracking](#basic-cost-tracking)
  - [Storage & Data Transfer](#storage-and-data-transfer-tracking)
  - [Monthly Projections](#monthly-cost-projections)
  - [Advanced Monitoring](#advanced-cost-monitoring)
  - [Cost Alerts](#cost-alerts-and-monitoring)
- [📊 Cost Tracking Details](#cost-tracking-details)
  - [Request Pricing](#1-request-pricing)
  - [Storage Pricing](#2-storage-pricing-s3-standard---us-east-1)
  - [Data Transfer Pricing](#3-data-transfer-pricing)
- [📚 API Reference](#api-reference)
- [💰 Cost Optimization Tips](#cost-optimization-tips)
- [✅ Best Practices](#best-practices)
- [❓ FAQ](#-faq)
- [🔗 See Also](#see-also)

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
const users = s3db.resources.users;
await users.insert({ name: 'John', email: 'john@example.com' });
await users.list();

// Check costs
console.log('Total cost:', s3db.client.costs.total);
console.log('Request breakdown:', s3db.client.costs.requests);
```

---

## Configuration Options

The Costs Plugin is a **static plugin** that works with zero configuration, but supports optional configuration for AWS free tier support.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `considerFreeTier` | boolean | `false` | Whether to consider AWS free tier (100GB/month data transfer OUT) in cost calculations |
| `region` | string | `'us-east-1'` | AWS region for pricing (for future use) |

**Basic Usage** (zero config):
```javascript
plugins: [CostsPlugin]  // Uses default settings (no free tier)
```

**With Free Tier** (AWS free tier enabled):
```javascript
import { CostsPlugin } from 's3db.js';

// Configure the plugin before using
await CostsPlugin.setup(database, {
  considerFreeTier: true,  // Enable AWS free tier (100GB/month OUT)
  region: 'us-east-1'
});

plugins: [CostsPlugin]
```

---

## Cost Tracking Details

### AWS S3 Pricing Structure

#### 1. Request Pricing

| Operation | Cost per 1000 requests | Tracked Commands |
|-----------|------------------------|------------------|
| PUT/POST/COPY operations | $0.005 | PutObjectCommand, CopyObjectCommand |
| GET/SELECT operations | $0.0004 | GetObjectCommand |
| HEAD operations | $0.0004 | HeadObjectCommand |
| DELETE operations | $0.0004 | DeleteObjectCommand, DeleteObjectsCommand |
| LIST operations | $0.005 | ListObjectsV2Command |

#### 2. Storage Pricing (S3 Standard - us-east-1)

| Tier | Storage Range | Price per GB/month |
|------|--------------|-------------------|
| Tier 1 | First 50 TB | $0.023 |
| Tier 2 | Next 450 TB (50-500 TB) | $0.022 |
| Tier 3 | Over 500 TB | $0.021 |

#### 3. Data Transfer Pricing

| Type | Tier | Transfer Range | Price per GB |
|------|------|---------------|--------------|
| **IN** | All | Unlimited | **$0.00** (Free) |
| **OUT** | Tier 1 | First 10 TB | $0.09 |
| **OUT** | Tier 2 | Next 40 TB (10-50 TB) | $0.085 |
| **OUT** | Tier 3 | Next 100 TB (50-150 TB) | $0.07 |
| **OUT** | Tier 4 | Over 150 TB | $0.05 |
| **OUT** | Free Tier | First 100 GB/month* | $0.00 |

*Free tier is optional (`considerFreeTier: true`) and aggregated across all AWS services.

### Cost Data Structure

```javascript
{
  total: 0.123456,           // Total cost in USD (requests + storage + data transfer)

  // === REQUESTS ===
  requests: {
    prices: {                // Cost per 1000 requests
      put: 0.000005,
      post: 0.000005,
      copy: 0.000005,
      list: 0.000005,
      get: 0.0000004,
      select: 0.0000004,
      head: 0.0000004,
      delete: 0.0000004,
    },
    total: 15,               // Total request count
    counts: {                // Request counters by operation
      put: 3,
      get: 8,
      head: 2,
      delete: 1,
      list: 1,
      post: 0,
      copy: 0,
      select: 0
    },
    totalEvents: 15,         // Total events (same as total)
    events: {                // Command-specific counters
      PutObjectCommand: 3,
      GetObjectCommand: 8,
      HeadObjectCommand: 2,
      DeleteObjectCommand: 1,
      ListObjectsV2Command: 1,
      CopyObjectCommand: 0,
      DeleteObjectsCommand: 0
    },
    subtotal: 0.000042       // Total request costs
  },

  // === STORAGE ===
  storage: {
    totalBytes: 1610612736,  // 1.5 GB in bytes
    totalGB: 1.5,             // Total storage in GB
    tiers: [                  // Tiered pricing structure
      { limit: 51200, pricePerGB: 0.023 },      // First 50 TB
      { limit: 512000, pricePerGB: 0.022 },     // Next 450 TB
      { limit: 999999999, pricePerGB: 0.021 }   // Over 500 TB
    ],
    currentTier: 0,           // Current pricing tier (0-based)
    subtotal: 0.03450         // Monthly storage cost
  },

  // === DATA TRANSFER ===
  dataTransfer: {
    // Upload (always free)
    inBytes: 1610612736,      // 1.5 GB uploaded
    inGB: 1.5,
    inCost: 0,                // Always $0

    // Download (tiered pricing)
    outBytes: 858993459,      // 0.8 GB downloaded
    outGB: 0.8,
    tiers: [                  // Tiered pricing structure
      { limit: 10240, pricePerGB: 0.09 },      // First 10 TB
      { limit: 51200, pricePerGB: 0.085 },     // Next 40 TB
      { limit: 153600, pricePerGB: 0.07 },     // Next 100 TB
      { limit: 999999999, pricePerGB: 0.05 }   // Over 150 TB
    ],
    freeTierGB: 100,          // Free tier limit (100GB/month)
    freeTierUsed: 0,          // Free tier used so far
    currentTier: 0,           // Current pricing tier (0-based)
    subtotal: 0.072           // Data transfer OUT cost
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

const products = s3db.resources.products;

// Perform operations and track costs
await products.insert({ name: 'Widget A', price: 19.99 });
await products.insert({ name: 'Widget B', price: 29.99 });
await products.list();
await products.count();

// Analyze costs
const costs = s3db.client.costs;
console.log(`Operations performed: ${costs.requests.total}`);
console.log(`Total cost: $${costs.total.toFixed(6)}`);
console.log(`Most expensive operation: PUT (${costs.requests.counts.put} requests)`);

// Cost breakdown
console.log('\nCost breakdown:');
Object.entries(costs.requests.counts).forEach(([operation, count]) => {
  if (count > 0) {
    const operationCost = count * costs.requests.prices[operation];
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
const users = s3db.resources.users;

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
const users = s3db.resources.users;
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

### Storage and Data Transfer Tracking

```javascript
import { S3db, CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

await s3db.connect();

// Configure for free tier (optional)
await CostsPlugin.setup(s3db, {
  considerFreeTier: true  // Enable 100GB/month free data transfer OUT
});

const products = s3db.resources.products;

// Perform operations that trigger storage and data transfer costs
for (let i = 0; i < 100; i++) {
  await products.insert({
    name: `Product ${i}`,
    description: 'A'.repeat(1024)  // 1KB of data per product
  });
}

// Retrieve data (triggers data transfer OUT)
const allProducts = await products.list({ limit: 100 });

// Check comprehensive cost breakdown
const costs = s3db.client.costs;

console.log('\n=== Complete Cost Breakdown ===');
console.log(`Total Cost: $${costs.total.toFixed(6)}`);
console.log(`\nRequests:`);
console.log(`  Total: ${costs.requests.total}`);
console.log(`  Subtotal: $${costs.requests.subtotal.toFixed(6)}`);
console.log(`  Operations:`, costs.requests.counts);

console.log(`\nStorage:`);
console.log(`  Total: ${costs.storage.totalGB.toFixed(2)} GB`);
console.log(`  Current Tier: ${costs.storage.currentTier + 1} (${costs.storage.tiers[costs.storage.currentTier].pricePerGB}/GB)`);
console.log(`  Monthly Cost: $${costs.storage.subtotal.toFixed(6)}`);

console.log(`\nData Transfer:`);
console.log(`  IN: ${costs.dataTransfer.inGB.toFixed(2)} GB (Free: $${costs.dataTransfer.inCost})`);
console.log(`  OUT: ${costs.dataTransfer.outGB.toFixed(2)} GB`);
console.log(`  Free Tier Used: ${costs.dataTransfer.freeTierUsed.toFixed(2)} GB of ${costs.dataTransfer.freeTierGB} GB`);
console.log(`  Current OUT Tier: ${costs.dataTransfer.currentTier + 1} (${costs.dataTransfer.tiers[costs.dataTransfer.currentTier].pricePerGB}/GB)`);
console.log(`  Transfer Cost: $${costs.dataTransfer.subtotal.toFixed(6)}`);
```

### Monthly Cost Projections

```javascript
// Calculate monthly cost projections based on current usage
function calculateMonthlyProjections(costs) {
  const now = Date.now();
  const sessionDuration = now - costs.sessionStart || now; // Assume session start tracked
  const secondsInMonth = 30 * 24 * 60 * 60;

  const projections = {
    requests: {
      monthlyTotal: (costs.requests.total / (sessionDuration / 1000)) * secondsInMonth,
      monthlyCost: (costs.requests.subtotal / (sessionDuration / 1000)) * secondsInMonth
    },
    storage: {
      currentGB: costs.storage.totalGB,
      monthlyCost: costs.storage.subtotal  // Already monthly
    },
    dataTransfer: {
      monthlyGB: (costs.dataTransfer.outGB / (sessionDuration / 1000)) * secondsInMonth,
      monthlyCost: (costs.dataTransfer.subtotal / (sessionDuration / 1000)) * secondsInMonth,
      withinFreeTier: costs.dataTransfer.outGB < costs.dataTransfer.freeTierGB
    },
    total: {
      monthlyCost:
        ((costs.requests.subtotal + costs.dataTransfer.subtotal) / (sessionDuration / 1000)) * secondsInMonth +
        costs.storage.subtotal
    }
  };

  console.log('\n=== Monthly Cost Projections ===');
  console.log(`Requests: ~${projections.requests.monthlyTotal.toFixed(0)} ops → $${projections.requests.monthlyCost.toFixed(2)}`);
  console.log(`Storage: ${projections.storage.currentGB.toFixed(2)} GB → $${projections.storage.monthlyCost.toFixed(2)}`);
  console.log(`Data Transfer OUT: ~${projections.dataTransfer.monthlyGB.toFixed(2)} GB → $${projections.dataTransfer.monthlyCost.toFixed(2)}`);
  console.log(`\nTotal Monthly Projection: $${projections.total.monthlyCost.toFixed(2)}`);

  return projections;
}

// Usage
const projections = calculateMonthlyProjections(s3db.client.costs);
```

---

## API Reference

### Accessing Cost Data

```javascript
// Access via s3db client
const costs = s3db.client.costs;

// Top-level properties
costs.total;                    // Total cost (requests + storage + data transfer)

// Request costs
costs.requests.total;           // Total number of requests
costs.requests.counts;          // Request counters by operation
costs.requests.prices;          // Cost per 1000 requests
costs.requests.events;          // AWS SDK command counters
costs.requests.subtotal;        // Total request costs

// Storage costs
costs.storage.totalGB;          // Total storage in GB
costs.storage.currentTier;      // Current pricing tier (0-based)
costs.storage.subtotal;         // Monthly storage cost

// Data transfer costs
costs.dataTransfer.inGB;        // Data uploaded (GB)
costs.dataTransfer.outGB;       // Data downloaded (GB)
costs.dataTransfer.freeTierUsed;// Free tier used (GB)
costs.dataTransfer.subtotal;    // Data transfer OUT cost
```

### Cost Data Properties

#### `total` (number)
Total accumulated cost in USD (requests + storage + data transfer).

```javascript
costs.total  // 0.123456 ($0.12)
```

#### `requests` (object)
Request-related costs and counters:

##### `requests.prices` (object)
Cost per 1000 requests for each operation type:
```javascript
{
  put: 0.000005,      // $0.005 per 1000 requests
  post: 0.000005,     // $0.005 per 1000 requests
  copy: 0.000005,     // $0.005 per 1000 requests
  list: 0.000005,     // $0.005 per 1000 requests
  get: 0.0000004,     // $0.0004 per 1000 requests
  select: 0.0000004,  // $0.0004 per 1000 requests
  head: 0.0000004,    // $0.0004 per 1000 requests
  delete: 0.0000004   // $0.0004 per 1000 requests
}
```

##### `requests.total` (number)
Total number of requests across all operations.

##### `requests.counts` (object)
Request counters by operation type:
```javascript
{
  put: 3,       // PUT operation requests
  post: 0,      // POST operation requests
  copy: 0,      // COPY operation requests
  list: 1,      // LIST operation requests
  get: 8,       // GET operation requests
  select: 0,    // SELECT operation requests
  head: 2,      // HEAD operation requests
  delete: 1     // DELETE operation requests
}
```

##### `requests.totalEvents` (number)
Total number of AWS SDK commands executed (same as `total`).

##### `requests.events` (object)
Command-specific request counters:
```javascript
{
  PutObjectCommand: 3,           // AWS SDK PutObjectCommand count
  GetObjectCommand: 8,           // AWS SDK GetObjectCommand count
  CopyObjectCommand: 0,          // AWS SDK CopyObjectCommand count
  HeadObjectCommand: 2,          // AWS SDK HeadObjectCommand count
  DeleteObjectCommand: 1,        // AWS SDK DeleteObjectCommand count
  DeleteObjectsCommand: 0,       // AWS SDK DeleteObjectsCommand count
  ListObjectsV2Command: 1        // AWS SDK ListObjectsV2Command count
}
```

##### `requests.subtotal` (number)
Total cost from requests only (excludes storage and data transfer).

#### `storage` (object)
Storage-related costs and metrics:

##### `storage.totalBytes` (number)
Total storage in bytes.

##### `storage.totalGB` (number)
Total storage in gigabytes.

##### `storage.tiers` (array)
Tiered pricing structure for S3 Standard storage:
```javascript
[
  { limit: 51200, pricePerGB: 0.023 },      // First 50 TB → $0.023/GB
  { limit: 512000, pricePerGB: 0.022 },     // Next 450 TB → $0.022/GB
  { limit: 999999999, pricePerGB: 0.021 }   // Over 500 TB → $0.021/GB
]
```

##### `storage.currentTier` (number)
Current pricing tier (0-based index). Use this to determine which tier your storage falls into.

##### `storage.subtotal` (number)
Monthly storage cost based on tiered pricing.

#### `dataTransfer` (object)
Data transfer costs and metrics:

##### `dataTransfer.inBytes` (number)
Total data uploaded in bytes.

##### `dataTransfer.inGB` (number)
Total data uploaded in gigabytes.

##### `dataTransfer.inCost` (number)
Cost for data upload (always $0 - uploads are free).

##### `dataTransfer.outBytes` (number)
Total data downloaded in bytes.

##### `dataTransfer.outGB` (number)
Total data downloaded in gigabytes.

##### `dataTransfer.tiers` (array)
Tiered pricing structure for data transfer OUT:
```javascript
[
  { limit: 10240, pricePerGB: 0.09 },       // First 10 TB → $0.09/GB
  { limit: 51200, pricePerGB: 0.085 },      // Next 40 TB → $0.085/GB
  { limit: 153600, pricePerGB: 0.07 },      // Next 100 TB → $0.07/GB
  { limit: 999999999, pricePerGB: 0.05 }    // Over 150 TB → $0.05/GB
]
```

##### `dataTransfer.freeTierGB` (number)
AWS free tier limit for data transfer OUT (100 GB/month).

##### `dataTransfer.freeTierUsed` (number)
Amount of free tier used so far (only tracked when `considerFreeTier: true`).

##### `dataTransfer.currentTier` (number)
Current pricing tier for data transfer OUT (0-based index).

##### `dataTransfer.subtotal` (number)
Total cost for data transfer OUT (after applying free tier if enabled).

---

## 💰 Cost Optimization Tips

### 1. Reduce Request Costs

**Problem:** Too many small requests = high costs

**Solutions:**

```javascript
// ❌ BAD: Individual inserts (expensive)
for (let i = 0; i < 1000; i++) {
  await users.insert({ name: `User ${i}` });
}
// Cost: 1000 PUT requests × $0.000005 = $0.005

// ✅ GOOD: Batch inserts (cheaper)
const batch = Array.from({ length: 1000 }, (_, i) => ({ name: `User ${i}` }));
await users.insertMany(batch);
// Cost: ~10 PUT requests × $0.000005 = $0.00005 (90% savings!)
```

**Savings:** 90% reduction in request costs

### 2. Optimize Storage with Compression

**Problem:** Large objects = high storage costs

**Solutions:**

```javascript
// ✅ Use compression for large data
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

// Before: 1MB JSON
const largeData = { /* 1MB of data */ };

// After: ~200KB compressed (80% savings)
const compressed = await gzipAsync(JSON.stringify(largeData));

await resource.insert({
  id: 'doc-1',
  data: compressed.toString('base64'),
  compressed: true
});
```

**Savings:** 80% reduction in storage costs

### 3. Use Free Tier for Data Transfer

**Problem:** Paying for data transfer when free tier is available

**Solution:**

```javascript
// Enable free tier (100GB/month OUT)
await CostsPlugin.setup(db, {
  considerFreeTier: true
});

// First 100GB/month = FREE
// Example: 80GB transferred = $0.00 (instead of $7.20)
```

**Savings:** Up to $9/month (100GB × $0.09/GB)

### 4. Cache Frequently Accessed Data

**Problem:** Repeated GET requests for same data

**Solution:**

```javascript
import { CachePlugin } from 's3db.js';

const db = new S3db({
  plugins: [
    CostsPlugin,
    new CachePlugin({
      driver: 'memory',
      ttl: 3600  // 1 hour
    })
  ]
});

// First request: $0.0004 (GET from S3)
const user = await users.get('user-123');

// Next requests (within 1h): $0.00 (from cache)
const user2 = await users.get('user-123');  // FREE!
const user3 = await users.get('user-123');  // FREE!
```

**Savings:** 90%+ reduction in GET request costs

### 5. Use Partitions for Efficient Queries

**Problem:** LIST operations scanning entire dataset

**Solution:**

```javascript
// ❌ BAD: Full scan (expensive)
const activeUsers = (await users.list()).filter(u => u.status === 'active');
// Cost: 1 LIST ($0.005) + data transfer

// ✅ GOOD: Partition query (cheaper)
const users = await db.createResource({
  name: 'users',
  partitions: {
    byStatus: { fields: { status: 'string' } }
  }
});

const activeUsers = await users.listPartition({
  partition: 'byStatus',
  partitionValues: { status: 'active' }
});
// Cost: 1 LIST ($0.005) but only partition data transferred (60-90% less data)
```

**Savings:** 60-90% reduction in data transfer costs

### 6. Monitor and Set Budget Alerts

**Problem:** Costs growing without notice

**Solution:**

```javascript
// Set up cost monitoring
const DAILY_BUDGET = 0.50;  // $0.50/day

setInterval(() => {
  const costs = db.client.costs;
  const hoursRunning = (Date.now() - startTime) / (1000 * 60 * 60);
  const dailyProjection = (costs.total / hoursRunning) * 24;

  if (dailyProjection > DAILY_BUDGET) {
    console.error(`🚨 Budget alert! Projected: $${dailyProjection.toFixed(2)}/day`);
    // Send alert email/SMS
    // Pause non-critical operations
  }
}, 60000); // Check every minute
```

**Savings:** Prevents unexpected cost overruns

### 7. Clean Up Old Data

**Problem:** Paying for storage you don't need

**Solution:**

```javascript
// Implement data lifecycle policy
async function cleanupOldData() {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  const oldRecords = await logs.query({
    createdAt: { $lt: thirtyDaysAgo }
  });

  // Delete or archive
  for (const record of oldRecords) {
    await logs.delete(record.id);
  }

  console.log(`🗑️ Cleaned up ${oldRecords.length} old records`);
}

// Run monthly
setInterval(cleanupOldData, 30 * 24 * 60 * 60 * 1000);
```

**Savings:** Reduces storage costs by 30-50%

### 💡 Quick Wins Summary

| Optimization | Effort | Savings | Impact |
|--------------|--------|---------|--------|
| Batch operations | Low | 90% | 🔥🔥🔥 |
| Enable free tier | Very Low | Up to $9/mo | 🔥🔥🔥 |
| Use caching | Low | 90%+ | 🔥🔥🔥 |
| Compression | Medium | 80% | 🔥🔥 |
| Partitions | Medium | 60-90% | 🔥🔥 |
| Budget alerts | Low | Prevents overruns | 🔥 |
| Data cleanup | Medium | 30-50% | 🔥 |

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
const operationCosts = Object.entries(costs.requests.counts)
  .filter(([op]) => op !== 'total' && costs.requests.counts[op] > 0)
  .map(([op, count]) => ({
    operation: op,
    count,
    totalCost: count * costs.requests.prices[op],
    costPerRequest: costs.requests.prices[op]
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
      mostFrequentOperation: Object.entries(costs.requests.counts)
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
      ...Object.entries(costs.requests.counts)
        .filter(([op]) => op !== 'total')
        .map(([op, count]) => 
          `${timestamp},${op},${count},${(count * costs.requests.prices[op]).toFixed(8)}`
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
  const users = s3db.resources.users;
  
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

## ❓ FAQ

### Básico

**P: O plugin afeta a performance das operações?**
R: O impacto é mínimo. O rastreamento de custos adiciona aproximadamente < 0.1ms por operação (overhead negligenciável).

**P: Posso usar em ambiente local (MinIO/LocalStack)?**
R: Sim! O plugin funciona com qualquer backend S3-compatível. Os custos serão $0 para LocalStack mas as métricas de requests serão rastreadas.

**P: Preciso configurar credenciais AWS?**
R: Não. O plugin usa os mesmos credentials já configurados no S3DB e não faz chamadas adicionais à AWS.

### Configuração

**P: Como acessar os custos?**
R: Via `client.costs`:
```javascript
console.log(database.client.costs);
// {
//   total: 0.0042,
//   requests: { total: 850, get: 500, put: 200, ... },
//   events: { GetObjectCommand: 500, ... }
// }
```

**P: Preciso configurar algo?**
R: Não, basta instalar o plugin:
```javascript
database.use(CostsPlugin);
```

**P: Como personalizar os preços por região?**
R: Modifique `CostsPlugin.costs.prices` após instalação:
```javascript
CostsPlugin.costs.requests.prices.get = 0.0005 / 1000;  // Ajuste regional
CostsPlugin.costs.requests.prices.put = 0.006 / 1000;
```

### Operações

**P: Como visualizo os custos acumulados?**
R: Acesse o objeto `costs`:
```javascript
const costs = database.client.costs;
console.log(`Total: $${costs.total.toFixed(6)}`);
console.log(`Requests: ${costs.requests.total}`);
```

**P: Como reseto os contadores?**
R: Não há método público para reset. Reinicie a aplicação ou recrie a instância do database.

**P: Como exportar relatórios de custo?**
R: Serialize o objeto `client.costs`:
```javascript
const report = JSON.stringify(database.client.costs, null, 2);
await fs.writeFile('costs-report.json', report);
```

**P: Quais são os preços por operação?**
R:
- PUT/POST/COPY/LIST: $0.005 por 1,000 requests
- GET/SELECT/HEAD/DELETE: $0.0004 por 1,000 requests

### Performance

**P: Como usar custos para otimizar operações?**
R: Analise quais operações são mais caras:
```javascript
const costs = database.client.costs;
const operationCosts = Object.entries(costs.requests.counts)
  .filter(([op]) => op !== 'total' && costs.requests.counts[op] > 0)
  .map(([op, count]) => ({
    operation: op,
    count,
    totalCost: count * costs.requests.prices[op]
  }))
  .sort((a, b) => b.totalCost - a.totalCost);

console.log('Most expensive operations:', operationCosts);
```

**P: Como monitorar custos em tempo real?**
R: Configure verificações periódicas:
```javascript
setInterval(() => {
  const costs = database.client.costs;
  if (costs.total > 0.10) {
    console.warn(`⚠️ Budget alert: $${costs.total.toFixed(6)}`);
  }
}, 60000); // Every minute
```

### Storage & Data Transfer (Novos Recursos)

**Q: How does storage tracking work?**
R: O plugin rastreia automaticamente o tamanho dos objetos durante PUT/POST/COPY operations:
```javascript
const costs = db.client.costs;
console.log(`Storage: ${costs.storage.totalGB.toFixed(2)} GB`);
console.log(`Monthly cost: $${costs.storage.subtotal.toFixed(2)}`);
console.log(`Current tier: ${costs.storage.currentTier + 1}`);
```

**P: O que é data transfer e como é calculado?**
R: Data transfer rastreia uploads (IN) e downloads (OUT):
- **IN (Upload):** Sempre grátis, rastreado mas custo = $0
- **OUT (Download):** Cobrado por tier, rastreado em GET operations
```javascript
console.log(`Upload: ${costs.dataTransfer.inGB.toFixed(2)} GB (FREE)`);
console.log(`Download: ${costs.dataTransfer.outGB.toFixed(2)} GB`);
console.log(`Transfer cost: $${costs.dataTransfer.subtotal.toFixed(2)}`);
```

**P: Como ativar o free tier da AWS?**
R: Use `considerFreeTier: true` no setup:
```javascript
await CostsPlugin.setup(db, {
  considerFreeTier: true  // 100GB/month OUT grátis
});

// Verifica quanto do free tier foi usado
console.log(`Free tier usado: ${costs.dataTransfer.freeTierUsed} GB de 100 GB`);
```

**P: Vale a pena ativar o free tier?**
R: **SIM!** Se você transfere até 100GB/mês:
- Sem free tier: 80GB × $0.09 = **$7.20/mês**
- Com free tier: 80GB = **$0.00/mês** (economiza $7.20)

**P: Como saber em qual tier de pricing estou?**
R: Check `currentTier` para storage e data transfer:
```javascript
const storageTier = costs.storage.tiers[costs.storage.currentTier];
console.log(`Storage tier: $${storageTier.pricePerGB}/GB`);

const transferTier = costs.dataTransfer.tiers[costs.dataTransfer.currentTier];
console.log(`Transfer OUT tier: $${transferTier.pricePerGB}/GB`);
```

**Q: Why is storage.subtotal "monthly" but requests.subtotal is session total?**
R: Storage é cobrado mensalmente pela AWS ($/GB/mês), então mostramos o custo mensal baseado no storage atual. Requests são cobrados por operação, então mostramos o total acumulado da sessão.

**P: Como estimar meu custo mensal total?**
R: Combine storage mensal + projeção de requests/transfer:
```javascript
function estimateMonthly(costs, hoursRunning) {
  const monthHours = 30 * 24;
  const requestsMonthly = (costs.requests.subtotal / hoursRunning) * monthHours;
  const transferMonthly = (costs.dataTransfer.subtotal / hoursRunning) * monthHours;
  const storageMonthly = costs.storage.subtotal; // Já é mensal

  return {
    requests: requestsMonthly,
    storage: storageMonthly,
    transfer: transferMonthly,
    total: requestsMonthly + storageMonthly + transferMonthly
  };
}

const estimate = estimateMonthly(db.client.costs, 24); // 24h rodando
console.log(`Estimated monthly: $${estimate.total.toFixed(2)}`);
```

### Casos de Uso Práticos

**P: Como comparar custos entre diferentes estratégias?**
R: Crie snapshots e compare:
```javascript
// Snapshot inicial
const before = { ...db.client.costs };

// Execute operação
await myOperation();

// Snapshot final
const after = { ...db.client.costs };

// Compare
console.log('Cost impact:', {
  requests: after.requests.subtotal - before.requests.subtotal,
  storage: after.storage.subtotal - before.storage.subtotal,
  transfer: after.dataTransfer.subtotal - before.dataTransfer.subtotal
});
```

**P: Como evitar surpresas na conta da AWS?**
R: Configure alertas automáticos:
```javascript
const MAX_DAILY = 1.00; // $1/day

setInterval(() => {
  const projection = (costs.total / hoursRunning) * 24;

  if (projection > MAX_DAILY) {
    // Ação imediata!
    console.error('🚨 BUDGET EXCEEDED!');
    // Pausar operações não-críticas
    // Enviar alerta
  } else if (projection > MAX_DAILY * 0.8) {
    console.warn('⚠️ Approaching budget (80%)');
  }
}, 300000); // Check a cada 5 min
```

**P: Qual é o custo típico de operações comuns?**
A: Practical examples:

| Operação | Quantidade | Custo Aproximado |
|----------|-----------|------------------|
| Insert 1000 users | 1000 × PUT | $0.005 |
| List all users | 1 × LIST | $0.000005 |
| Get 1000 users | 1000 × GET | $0.0004 |
| Store 100GB | 100GB/mês | $2.30/mês |
| Download 50GB | 50GB/mês | $0.00 (free tier) |
| Download 150GB | 150GB/mês | $4.50/mês |

**P: Como otimizar para custo mínimo?**
R: Siga as prioridades:
1. ✅ Enable free tier (`considerFreeTier: true`) - **Grátis, $9/mês savings**
2. ✅ Use batch operations - **90% menos requests**
3. ✅ Add caching - **90%+ menos GET requests**
4. ✅ Use partitions - **60-90% menos data transfer**
5. ✅ Compress large data - **80% menos storage**

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Cache Plugin](./cache.md) - Reduce costs through intelligent caching
- [Metrics Plugin](./metrics.md) - Monitor performance alongside costs
- [Audit Plugin](./audit.md) - Track operations for cost analysis