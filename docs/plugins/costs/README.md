# Costs Plugin

> **Real-time S3 request, storage, and transfer cost tracking for every workload.**

---

## TLDR

**Real-time** AWS S3 cost tracking with comprehensive request, storage, and data transfer monitoring.

**1 line to get started:**
```javascript
plugins: [CostsPlugin]  // Done! Optional configuration available
```

**Main features:**
- Zero configuration (static plugin)
- Real-time cost tracking (requests + storage + data transfer)
- Tiered pricing support (AWS pricing tiers)
- Free tier support (100GB/month data transfer OUT)
- Monthly/yearly projections

**When to use:**
- Budget monitoring
- Cost optimization
- Identify expensive operations
- Future cost projection

**Access:**
```javascript
console.log('Total cost:', s3db.client.costs.total);  // $0.123456
console.log('Requests:', s3db.client.costs.requests.counts);
console.log('Storage:', s3db.client.costs.storage.totalGB);
```

---

## Quick Start

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
console.log('Total cost:', db.client.costs.total);
console.log('Breakdown:');
console.log('  Requests:', db.client.costs.requests.subtotal);
console.log('  Storage:', db.client.costs.storage.subtotal);
console.log('  Transfer:', db.client.costs.dataTransfer.subtotal);
```

**Enable Free Tier (100GB/month data transfer):**

```javascript
await CostsPlugin.setup(db, { considerFreeTier: true });
```

---

## Dependencies

**Zero external dependencies** - built into s3db.js core.

**What's Included:**
- AWS S3 pricing tables (built-in)
- Request tracking (automatic)
- Storage calculation (automatic)
- Data transfer tracking (automatic)
- Tiered pricing logic (built-in)

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](/plugins/costs/guides/configuration.md) | All options, AWS pricing structure, data structure reference |
| [Usage Patterns](/plugins/costs/guides/usage-patterns.md) | Examples, advanced monitoring, cost analysis |
| [Cost Optimization](/plugins/costs/guides/cost-optimization.md) | Proven strategies to reduce costs |
| [Best Practices](/plugins/costs/guides/best-practices.md) | Production tips, troubleshooting, FAQ |

---

## Quick Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `considerFreeTier` | boolean | `false` | Enable AWS free tier (100GB/month OUT) |
| `region` | string | `'us-east-1'` | AWS region for pricing |

### AWS S3 Pricing

| Operation | Cost per 1000 requests |
|-----------|------------------------|
| PUT/POST/COPY/LIST | $0.005 |
| GET/SELECT/HEAD/DELETE | $0.0004 |

| Data Transfer | Price per GB |
|---------------|--------------|
| IN (Upload) | $0.00 (Free) |
| OUT (First 10 TB) | $0.09 |
| OUT (Free Tier) | $0.00 (100GB/month) |

| Storage (S3 Standard) | Price per GB/month |
|-----------------------|-------------------|
| First 50 TB | $0.023 |
| Next 450 TB | $0.022 |
| Over 500 TB | $0.021 |

### Key Access Points

```javascript
// Total cost
s3db.client.costs.total

// Request breakdown
s3db.client.costs.requests.total       // Count
s3db.client.costs.requests.counts      // By operation
s3db.client.costs.requests.subtotal    // Cost

// Storage
s3db.client.costs.storage.totalGB      // Size
s3db.client.costs.storage.subtotal     // Monthly cost

// Data Transfer
s3db.client.costs.dataTransfer.inGB    // Upload (free)
s3db.client.costs.dataTransfer.outGB   // Download
s3db.client.costs.dataTransfer.subtotal // Cost
```

### Quick Optimization Tips

| Optimization | Effort | Savings |
|--------------|--------|---------|
| Batch operations | Low | 90% |
| Enable free tier | Very Low | Up to $9/mo |
| Use caching | Low | 90%+ |
| Compression | Medium | 80% |
| Partitions | Medium | 60-90% |

---

## See Also

- [Cache Plugin](/plugins/cache/README.md) - Reduce costs through intelligent caching
- [Metrics Plugin](/plugins/metrics/README.md) - Monitor performance alongside costs
- [Audit Plugin](/plugins/audit/README.md) - Track operations for cost analysis
