# Cost Optimization

> **In this guide:** Proven strategies to reduce AWS S3 costs significantly.

**Navigation:** [← Back to Costs Plugin](/plugins/costs/README.md) | [Configuration](/plugins/costs/guides/configuration.md)

---

## Quick Wins Summary

| Optimization | Effort | Savings | Impact |
|--------------|--------|---------|--------|
| Batch operations | Low | 90% | High |
| Enable free tier | Very Low | Up to $9/mo | High |
| Use caching | Low | 90%+ | High |
| Compression | Medium | 80% | Medium |
| Partitions | Medium | 60-90% | Medium |
| Budget alerts | Low | Prevents overruns | Medium |
| Data cleanup | Medium | 30-50% | Medium |

---

## 1. Reduce Request Costs

**Problem:** Too many small requests = high costs

**Solutions:**

```javascript
// BAD: Individual inserts (expensive)
for (let i = 0; i < 1000; i++) {
  await users.insert({ name: `User ${i}` });
}
// Cost: 1000 PUT requests x $0.000005 = $0.005

// GOOD: Batch inserts (cheaper)
const batch = Array.from({ length: 1000 }, (_, i) => ({ name: `User ${i}` }));
await users.insertMany(batch);
// Cost: ~10 PUT requests x $0.000005 = $0.00005 (90% savings!)
```

**Savings:** 90% reduction in request costs

---

## 2. Optimize Storage with Compression

**Problem:** Large objects = high storage costs

**Solutions:**

```javascript
// Use compression for large data
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

---

## 3. Use Free Tier for Data Transfer

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

**Savings:** Up to $9/month (100GB x $0.09/GB)

---

## 4. Cache Frequently Accessed Data

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

---

## 5. Use Partitions for Efficient Queries

**Problem:** LIST operations scanning entire dataset

**Solution:**

```javascript
// BAD: Full scan (expensive)
const activeUsers = (await users.list()).filter(u => u.status === 'active');
// Cost: 1 LIST ($0.005) + data transfer

// GOOD: Partition query (cheaper)
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

---

## 6. Monitor and Set Budget Alerts

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
    console.error(`Budget alert! Projected: $${dailyProjection.toFixed(2)}/day`);
    // Send alert email/SMS
    // Pause non-critical operations
  }
}, 60000); // Check every minute
```

**Savings:** Prevents unexpected cost overruns

---

## 7. Clean Up Old Data

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

  console.log(`Cleaned up ${oldRecords.length} old records`);
}

// Run monthly
setInterval(cleanupOldData, 30 * 24 * 60 * 60 * 1000);
```

**Savings:** Reduces storage costs by 30-50%

---

## Typical Costs Reference

| Operation | Quantity | Approximate Cost |
|----------|-----------|------------------|
| Insert 1000 users | 1000 x PUT | $0.005 |
| List all users | 1 x LIST | $0.000005 |
| Get 1000 users | 1000 x GET | $0.0004 |
| Store 100GB | 100GB/month | $2.30/month |
| Download 50GB | 50GB/month | $0.00 (free tier) |
| Download 150GB | 150GB/month | $4.50/month |

---

## Optimization Priority Checklist

1. **Enable free tier** (`considerFreeTier: true`) - **Free, $9/month savings**
2. **Use batch operations** - **90% fewer requests**
3. **Add caching** - **90%+ fewer GET requests**
4. **Use partitions** - **60-90% less data transfer**
5. **Compress large data** - **80% less storage**

---

## See Also

- [Configuration](/plugins/costs/guides/configuration.md) - Detailed configuration options
- [Usage Patterns](/plugins/costs/guides/usage-patterns.md) - Examples and monitoring patterns
- [Best Practices](/plugins/costs/guides/best-practices.md) - Recommendations and FAQ
