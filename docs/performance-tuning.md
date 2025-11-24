# ⚡ Performance Tuning Guide

> **Maximize throughput, minimize latency, and optimize costs with s3db.js**
>
> **Navigation:** [Executor Pool](#-executor-pool) | [HTTP Client](#-http-client-tuning) | [MemoryClient](#-memoryclient-fast-testing) | [Partitions](#-partitions-o1-queries) | [Caching](#-caching-strategies) | [Checklist](#-production-checklist)

---

s3db.js is designed for high performance on S3, but default settings are conservative to ensure stability across all environments. This guide helps you tune the library for your specific workload.

## 🚀 Executor Pool

The **Separate Executor Pools** architecture is your primary tool for controlling throughput and concurrency.

### Understanding Concurrency

Each `Database` instance has its own operation queue. The `concurrency` setting determines how many operations are sent to S3 simultaneously.

*   **Too Low**: Underutilizes network bandwidth and increases latency for bulk operations.
*   **Too High**: Causes memory spikes, CPU thrashing, and S3 throttling (`503 SlowDown`).

### Recommended Settings

| Environment | Workload | Recommended `concurrency` |
| :--- | :--- | :--- |
| **Local / CI** | Functional Tests | `10 - 20` (Limit CPU/Memory usage) |
| **Production** | API (Latency Sensitive) | `50 - 100` (Prevent queueing) |
| **Production** | Batch Processing | `200 - 500` (Max throughput) |
| **Lambda** | Serverless | `20 - 50` (Memory constrained) |

### Configuration

```javascript
const db = new S3db({
  connectionString: 's3://...',
  executorPool: {
    // 🚀 Primary tuning knob
    concurrency: 100, 

    // Retry strategy
    retries: 3,
    retryDelay: 1000, // Exponential backoff (1s, 2s, 4s...)
    
    // Timeout per operation
    timeout: 30000,
    
    // Optional: Auto-tuning
    autotune: {
      enabled: true,
      targetLatency: 100, // Aim for 100ms avg latency
      minConcurrency: 50,
      maxConcurrency: 500
    }
  }
});
```

### Priority Queues

Use priorities to ensure user-facing requests aren't blocked by background jobs.

```javascript
// 🔴 High Priority (User Request)
await users.get('user-123', { priority: 100 });

// 🟢 Low Priority (Background Analytics)
await analytics.insert(eventData, { priority: 0 });
```

---

## 🌐 HTTP Client Tuning

The underlying Node.js HTTP agent can be a bottleneck. s3db.js uses optimized defaults, but high-throughput workloads may need adjustment.

### Key Parameters

*   **`keepAlive`**: Reuses TCP connections. Crucial for SSL/TLS performance.
*   **`maxSockets`**: Maximum concurrent TCP connections. Should match or exceed your `executorPool.concurrency`.
*   **`timeout`**: Socket timeout.

### Tuning for Throughput

If you increase `executorPool.concurrency` to 200, you **must** increase `maxSockets` to match.

```javascript
const db = new S3db({
  connectionString: 's3://...',
  
  // Match maxSockets to your executor concurrency
  httpClientOptions: {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 200,      // ⚡ Match Executor Pool
    maxFreeSockets: 50,   // Keep connections ready
    timeout: 60000
  }
});
```

---

## 💾 MemoryClient: Fast Testing

For unit tests and CI, **never use S3 or LocalStack**. Use `MemoryClient`.

*   **Speed**: 100-1000x faster than LocalStack.
*   **Cost**: Free.
*   **Setup**: Zero dependencies.

```javascript
// In your test setup
const db = new S3db({
  // ⚡ Magic Protocol
  connectionString: 'memory://test-bucket/integration-tests'
});

// Reset between tests
afterEach(() => {
  db.client.clear();
});
```

---

## 🗂️ Partitions: O(1) Queries

S3 `LIST` operations are slow (O(n)). Partitions organize data into folders, enabling O(1) lookups.

### When to Partition

Partition any field you frequently query by.

*   **Good**: `status`, `category`, `region`, `date` (year/month).
*   **Bad**: `description`, `uniqueId` (use primary ID), high-cardinality random values.

### Configuration

```javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: { /* ... */ },
  
  partitions: {
    // ⚡ Creates folder: /partitions/byStatus/status=pending/
    byStatus: { fields: { status: 'string' } },
    
    // ⚡ Creates folder: /partitions/byDate/date=2024-01-01/
    byDate: { fields: { createdAt: 'date' } }
  },
  
  // 🚀 Critical for write performance
  asyncPartitions: true
});
```

### Async Partitions

Always set `asyncPartitions: true` for production.
*   **True**: Writes to partitions in background (Latency: ~20-50ms).
*   **False**: Writes to partitions sequentially (Latency: ~100-200ms).

### Querying Partitions

```javascript
// ❌ Slow Scan (O(n))
const pending = await orders.query({ status: 'pending' });

// ✅ Fast Lookup (O(1))
const pending = await orders.list({
  partition: 'byStatus',
  partitionValues: { status: 'pending' }
});
```

---

## 📦 Caching Strategies

Reduce S3 costs and latency by caching reads.

### CachePlugin

Automates caching for all `get()` operations.

```javascript
import { CachePlugin } from 's3db.js';

await db.usePlugin(new CachePlugin({
  // Drivers: 'memory', 'redis', 'filesystem', 's3'
  driver: 'memory', 
  ttl: 60000, // 1 minute
  max: 1000   // Max items
}));
```

### Application-Level Memoization

For static config or rarely changing data, use the internal `Memoizer`.

```javascript
import { Memoizer } from 's3db.js';

const getConfig = Memoizer(async () => {
  return await configs.get('global-settings');
}, { ttl: 300000 }); // 5 mins

// ⚡ Instant return on subsequent calls
const settings = await getConfig();
```

---

## ✅ Production Checklist

1.  [ ] **Concurrency**: Set `executorPool.concurrency` between 50-200 based on workload.
2.  [ ] **HTTP**: Ensure `maxSockets` >= `concurrency`.
3.  [ ] **Partitions**: Use partitions for all common query filters.
4.  [ ] **Async**: Enable `asyncPartitions: true`.
5.  [ ] **Behaviors**: Use `body-overflow` or `body-only` for large documents (>2KB).
6.  [ ] **Keep-Alive**: Verify `httpClientOptions.keepAlive` is true (default).
7.  [ ] **Region**: Ensure your compute (EC2/Lambda) is in the same AWS Region as your S3 Bucket. Cross-region latency is 10x higher.
