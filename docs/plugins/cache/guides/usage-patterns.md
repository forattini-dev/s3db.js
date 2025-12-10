# Usage Patterns

> **In this guide:** Progressive adoption of caching, from basic to production-ready.

**Navigation:** [← Back to Cache Plugin](/plugins/cache/README.md) | [Configuration](/plugins/cache/guides/configuration.md)

---

## Usage Journey

### Level 1: Basic Memory Caching

Start here for immediate performance gains:

```javascript
// Step 1: Add cache plugin
plugins: [new CachePlugin({ driver: 'memory' })]

// Step 2: Use normally - caching is automatic
await users.count();  // First: 180ms (S3)
await users.count();  // Next: 2ms (cache) - 90x faster!
```

**What you get:** Up to 90x speedup on repeat calls, minimal configuration.

### Level 2: Add Memory Limits

Once caching more data, prevent memory exhaustion:

```javascript
// Option A: Fixed limit (known environment)
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryBytes: 512 * 1024 * 1024,  // 512MB max
    evictionPolicy: 'lru'  // Remove oldest when full
  }
})

// Option B: Percentage limit (containers/cloud)
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryPercent: 0.1,  // Use 10% of system memory
    // 16GB system = 1.6GB cache
    // 32GB system = 3.2GB cache
  }
})
```

**What you get:** Protection against OOM, automatic eviction.

### Level 3: Enable Compression

For larger cached objects, save memory:

```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryPercent: 0.1,
    enableCompression: true,  // Compress with gzip
    compressionThreshold: 1024  // Only compress if >1KB
  }
})
```

**What you get:** 2-3x more data cached in same memory.

### Level 3.5: Custom keys & serialization

Fine-tune how keys and values are stored:

```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    caseSensitive: false,        // "User:1" and "user:1" map to the same entry
    serializer: (value) => Buffer.from(JSON.stringify(value)).toString('base64'),
    deserializer: (raw) => JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  }
});
```

**What you get:** Seamless integration with existing key conventions and custom payload formats.

### Level 4: Add Statistics & Monitoring

Track cache effectiveness:

```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    enableStats: true  // Track hits/misses/evictions
  }
})

// Check performance
const stats = cachePlugin.driver.getStats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
console.log(`Evictions: ${stats.evictions}, Memory: ${stats.memoryUsageBytes} bytes`);

if (!stats.enabled) {
  console.warn('Enable statistics with config.enableStats = true');
}
```

**What you get:** Data-driven cache tuning.

### Level 5: Production - Persistent Cache

For production, survive restarts with filesystem cache:

```javascript
new CachePlugin({
  driver: 'filesystem',
  ttl: 1800000,  // 30 minutes
  config: {
    directory: './cache',
    enableCompression: true,
    enableCleanup: true  // Auto-delete expired files
  }
})
```

**What you get:** Cache survives deployments/restarts.

### Level 6: Multi-Server - Shared S3 Cache

For distributed systems, share cache across servers:

```javascript
new CachePlugin({
  driver: 's3',
  ttl: 3600000,  // 1 hour (milliseconds)
  config: {
    keyPrefix: 'app-cache/',
    // Uses same S3 bucket as database
  }
})
```

**What you get:** All servers share cache, no cold starts.

### Level 7: Production Optimization

Combine techniques for maximum efficiency:

```javascript
// 1. Use filesystem for speed + persistence
new CachePlugin({
  driver: 'filesystem',
  ttl: 1800000,  // 30 min
  config: {
    directory: '/mnt/cache',  // Fast SSD
    enableCompression: true,
    enableCleanup: true
  }
})

// 2. Monitor cache health
setInterval(() => {
  const stats = cachePlugin.driver.getStats();
  if (!stats.enabled) return;
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? stats.hits / total : 0;
  if (hitRate < 0.7) {
    console.warn('Low hit rate, consider increasing TTL');
  }
}, 60000);

// 3. Selective resource caching
// (Cache plugin auto-skips plugin-created resources)
```

**What you get:** Production-ready caching with monitoring.

---

## Configuration Examples

### Multi-Tier Cache Architecture

**Multi-tier caching** creates a cascade of cache layers with different speed/cost trade-offs:

```javascript
// L1 (Memory) → L2 (Redis) → L3 (S3) → Database
await db.usePlugin(new CachePlugin({
  drivers: [
    {
      driver: 'memory',
      ttl: 300000,        // 5 minutes (hot data)
      config: {
        maxMemoryPercent: 0.1,  // 10% of system memory
        evictionPolicy: 'lru',
        enableCompression: true
      }
    },
    {
      driver: 'redis',
      ttl: 3600000,       // 1 hour (warm data)
      config: {
        host: 'localhost',
        port: 6379,
        keyPrefix: 'app-cache/',
        enableCompression: true
      }
    },
    {
      driver: 's3',
      ttl: 86400000,      // 24 hours (cold data)
      config: {
        keyPrefix: 'cache/'
      }
    }
  ],
  promoteOnHit: true,    // Move data to faster layers when accessed
  strategy: 'write-through'  // Write to all layers immediately
}));

// How it works:
// 1. GET request checks L1 (memory) → ~1ms if found
// 2. If L1 miss, check L2 (Redis) → ~15ms if found, promote to L1
// 3. If L2 miss, check L3 (S3) → ~120ms if found, promote to L1+L2
// 4. If L3 miss, fetch from database → ~500ms, store in all layers
```

**Performance characteristics:**
- L1 (Memory): ~1-2ms, 10-100MB, instance-specific
- L2 (Redis): ~10-20ms, 1-10GB, shared across instances
- L3 (S3): ~100-200ms, unlimited, persistent, multi-region

**Use cases:**
- **Hot path**: Frequently accessed data lives in L1 (memory)
- **Warm data**: Less frequent but still popular data in L2 (Redis)
- **Cold data**: Rarely accessed but cacheable data in L3 (S3)
- **Auto-promotion**: Popular data automatically moves to faster layers

### Example 1: Memory Cache (Fast, Temporary)

Best for development and temporary caching:

```javascript
new CachePlugin({
  driver: 'memory',
  ttl: 600000,  // 10 minutes
  maxSize: 500,
  config: {
    evictionPolicy: 'lru',
    enableStats: true
  }
})

const users = s3db.resources.users;
await users.list();  // Cached

// Check stats
if (users.cache.stats) {
  const stats = users.cache.stats();
  console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
}
// Output: Hit rate: 85.5%, Hits: 342, Misses: 58
```

### Example 1.1: Memory Cache with Absolute Limit

Prevent memory exhaustion with hard byte limit:

```javascript
new CachePlugin({
  driver: 'memory',
  ttl: 600000,  // 10 minutes
  config: {
    maxMemoryBytes: 512 * 1024 * 1024,  // 512MB hard limit
    enableCompression: true,
    compressionThreshold: 1024
  }
})

const users = s3db.resources.users;
await users.list();  // Cached with memory protection

// Monitor memory usage
const memStats = users.cache.getMemoryStats();
console.log(`Memory: ${memStats.memoryUsage.current} / ${memStats.memoryUsage.max}`);
console.log(`Usage: ${memStats.memoryUsagePercent}%`);
console.log(`Evicted: ${memStats.evictedDueToMemory} items`);
// Output: Memory: 245.12 MB / 512.00 MB
//         Usage: 47.87%
//         Evicted: 15 items
```

### Example 1.2: Memory Cache with Percentage Limit (Cloud-Native)

Perfect for containers/Kubernetes where memory varies:

```javascript
new CachePlugin({
  driver: 'memory',
  ttl: 1800000,  // 30 minutes
  config: {
    maxMemoryPercent: 0.1,  // Use max 10% of system memory (0.1 = 10%)
    enableCompression: true
  }
})

// On 16GB system = ~1.6GB cache limit
// On 32GB system = ~3.2GB cache limit
// Automatically adapts to container memory!

const products = s3db.resources.products;
await products.list();  // Cached

// Check system memory stats
const memStats = products.cache.getMemoryStats();
console.log(`System Memory: ${memStats.systemMemory.total}`);
console.log(`Cache using: ${memStats.systemMemory.cachePercent} of system`);
console.log(`Cache limit: ${(memStats.maxMemoryPercent * 100).toFixed(1)}%`);
// Output: System Memory: 16.00 GB
//         Cache using: 0.8% of system
//         Cache limit: 10.0%
```

### Multi-instance namespaces

Need distinct cache layers for separate workloads? Install the plugin multiple times with the `namespace` option (or a custom alias in `db.usePlugin`) to isolate drivers, PluginStorage keys, and generated resource prefixes:

```javascript
await db.usePlugin(new CachePlugin({
  driver: 'memory',
  namespace: 'hot-path',
  ttl: 5_000
}), 'cacheHot');

await db.usePlugin(new CachePlugin({
  driver: 's3',
  namespace: 'analytics',
  ttl: 60_000
}), 'cacheCold');

const users = db.resources.users;
const hotDriver = users.getCacheDriver('cache--hot-path');
const coldDriver = users.getCacheDriver('cache--analytics');

const analyticsKey = await users.getCacheKeyResolver('cache--analytics')({ action: 'list' });
const cached = await coldDriver.get(analyticsKey);
```

- The first installed instance now exposes a **cache management namespace** at `resource.cache`, which proxies driver calls and adds helpers like `warmPage`, `warmItem`, `invalidate`, `keyFor`, and `stats`.
- Access the underlying driver via `resource.cache.driver` or `resource.getCacheDriver()`; additional instances are exposed with `resource.getCacheNamespace(<slug>)` and `resource.getCacheKeyResolver(<slug>)`.
- Namespaces slugify into resource prefixes (`plg_cache--analytics_*`) and PluginStorage keys (`plugin=cache--analytics/...`).
- Passing a second argument to `db.usePlugin(plugin, 'cacheSecondary')` auto-derives the namespace when you omit it.

### Cache management namespace

Whenever the CachePlugin is installed for a resource, that resource gains `resource.cache`: a lightweight facade that forwards to the driver **and** adds operational helpers.

| Helper | Purpose |
|--------|---------|
| `cache.driver` / `cache.getDriver()` | Underlying cache driver instance |
| `cache.keyFor(action, { params, partition, partitionValues })` | Generate the cache key that plugins/middleware use |
| `cache.warmPage({ offset, size, partition, partitionValues }, { forceRefresh, returnData })` | Prime page caches without waiting for user traffic |
| `cache.warmItem(id, { forceRefresh, returnData })` / `cache.warmMany(ids)` | Preload individual documents |
| `cache.warmList()` / `cache.warmQuery(filter, options)` / `cache.warmCount()` | Preload aggregate queries |
| `cache.warmPartition(partitions, options)` | Partition-aware warm-up (PartitionAwareFilesystemCache only) |
| `cache.warm(options)` | Shortcut to the plugin-level `warmCache(resourceName, options)` |
| `cache.invalidate(scope)` | Invalidate entries (optionally scoped by `{ id, partition, partitionValues }`) |
| `cache.clearAll()` | Clear every entry for the resource (`resource=${name}` prefix) |
| `cache.stats()` | Driver stats (falls back to plugin counters when unavailable) |

All driver-specific methods remain available thanks to proxying—`resource.cache.getMemoryStats()` still works with the MemoryCache driver.

```javascript
const users = db.resources.users;
const { cache } = users;

// Prime the first page and a specific record
await cache.warmPage({ offset: 0, size: 25 }, { forceRefresh: true });
await cache.warmItem('user_123', { forceRefresh: true });

// Inspect the generated key and read it directly from the driver
const pageKey = await cache.keyFor('page', { params: { offset: 0, size: 25 } });
const cachedPayload = await cache.get(pageKey);

// Later on, invalidate when the record changes
await cache.invalidate({ id: 'user_123' });

// Need a different cache instance?
const analyticsCache = users.getCacheNamespace('cache--analytics');
await analyticsCache?.warmList({ partition: 'byCustomer', partitionValues: { customerId: 'acme' } });
```

### Example 2: Filesystem Cache (Persistent, Local)

Best for production with single server:

```javascript
new CachePlugin({
  driver: 'filesystem',
  ttl: 1800000,  // 30 minutes
  config: {
    directory: './cache',
    enableCompression: true,
    enableCleanup: true
  }
})

const products = s3db.resources.products;
await products.count();  // Cached to disk

// Cache persists across restarts
console.log('Cache stored in ./cache directory');
```

> When you pass `createDirectory: false`, the driver now refuses to create the folder for you. Make sure the path already exists or the filesystem cache will raise a `CacheError` during installation.

### Example 3: S3 Cache (Shared, Distributed)

Best for multi-server deployments:

```javascript
new CachePlugin({
  driver: 's3',
  ttl: 3600000,  // 1 hour
  config: {
    keyPrefix: 'app-cache/'
  }
})

// Cache shared across all servers
const users = s3db.resources.users;
await users.list();  // Cached in S3

console.log('Cache shared across all application instances');
```

### Example 4: Compression for Large Data

Reduce storage with compression:

```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    enableCompression: true,
    compressionThreshold: 512  // Compress items > 512 bytes
  }
})

const orders = s3db.resources.orders;
await orders.list();  // Large results compressed

console.log('Large cached values are compressed automatically');
```

### Example 5: Manual Cache Control

Take control of caching behavior:

```javascript
new CachePlugin({ driver: 'memory' })

const users = s3db.resources.users;

// Manual cache operations
await users.cache.set('my-key', { data: 'value' });
const cached = await users.cache.get('my-key');

// Clear specific cache
await users.cache.delete('my-key');

// Clear all cache for resource
await users.cache.clear();

console.log('Manual cache control enabled');
```

### Inspecting Cache Statistics

```javascript
const plugin = new CachePlugin({
  driver: 'filesystem',
  partitionAware: true,
  config: { directory: './cache' }
});

await db.usePlugin(plugin);
// ...
const stats = await plugin.getCacheStats();
console.log(stats.driver); // e.g. "PartitionAwareFilesystemCache"
console.log(stats.size);   // Number of cached entries (nested partitions included)
console.log(stats.keys.slice(0, 5)); // Sample cache keys
```

`getCacheStats()` now returns consistent `size`, `keys`, and driver metadata for every backend. The partition-aware filesystem cache traverses nested directories, so `size` and `keys` reflect the on-disk structure—even when partitions fan out into multiple folders. Cache keys omit the `partition=` segment when no partition values were provided, matching the runtime key shape produced by read/write operations.

---

## API Reference

### Resource Cache Methods

When CachePlugin is installed, resources gain these methods:

```javascript
const resource = s3db.resources.users;

// Get cached value
const value = await resource.cache.get(key);

// Set cached value
await resource.cache.set(key, value, ttl);  // ttl optional

// Delete cached value
await resource.cache.delete(key);

// Clear all cache
await resource.cache.clear();

// Get statistics (if enabled)
const stats = resource.cache.stats();
if (stats.enabled) {
  console.log('Cache stats:', {
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
    evictions: stats.evictions,
    memoryUsageBytes: stats.memoryUsageBytes
  });
}
```

---

## See Also

- [Configuration](/plugins/cache/guides/configuration.md) - Detailed driver options
- [Best Practices](/plugins/cache/guides/best-practices.md) - Recommendations and troubleshooting
