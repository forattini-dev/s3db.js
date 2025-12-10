# Configuration

> **In this guide:** All configuration options, AWS pricing structure, and data structure reference.

**Navigation:** [← Back to Costs Plugin](/plugins/costs/README.md)

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

## AWS S3 Pricing Structure

### 1. Request Pricing

| Operation | Cost per 1000 requests | Tracked Commands |
|-----------|------------------------|------------------|
| PUT/POST/COPY operations | $0.005 | PutObjectCommand, CopyObjectCommand |
| GET/SELECT operations | $0.0004 | GetObjectCommand |
| HEAD operations | $0.0004 | HeadObjectCommand |
| DELETE operations | $0.0004 | DeleteObjectCommand, DeleteObjectsCommand |
| LIST operations | $0.005 | ListObjectsV2Command |

### 2. Storage Pricing (S3 Standard - us-east-1)

| Tier | Storage Range | Price per GB/month |
|------|--------------|-------------------|
| Tier 1 | First 50 TB | $0.023 |
| Tier 2 | Next 450 TB (50-500 TB) | $0.022 |
| Tier 3 | Over 500 TB | $0.021 |

### 3. Data Transfer Pricing

| Type | Tier | Transfer Range | Price per GB |
|------|------|---------------|--------------|
| **IN** | All | Unlimited | **$0.00** (Free) |
| **OUT** | Tier 1 | First 10 TB | $0.09 |
| **OUT** | Tier 2 | Next 40 TB (10-50 TB) | $0.085 |
| **OUT** | Tier 3 | Next 100 TB (50-150 TB) | $0.07 |
| **OUT** | Tier 4 | Over 150 TB | $0.05 |
| **OUT** | Free Tier | First 100 GB/month* | $0.00 |

*Free tier is optional (`considerFreeTier: true`) and aggregated across all AWS services.

---

## Cost Data Structure

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

## See Also

- [Usage Patterns](/plugins/costs/guides/usage-patterns.md) - Examples and monitoring patterns
- [Cost Optimization](/plugins/costs/guides/cost-optimization.md) - Reduce costs with proven strategies
- [Best Practices](/plugins/costs/guides/best-practices.md) - Recommendations and FAQ
