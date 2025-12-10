# Best Practices & Troubleshooting

> **In this guide:** Production recommendations, cost savings measurement, error handling, and FAQ.

**Navigation:** [← Back to Cache Plugin](/plugins/cache/README.md) | [Configuration](/plugins/cache/guides/configuration.md) | [Usage Patterns](/plugins/cache/guides/usage-patterns.md)

---

## Best Practices

### 1. Choose the Right Driver

```javascript
// Development: Memory cache (L1 - fastest)
{ driver: 'memory', ttl: 300000 }

// Production single-server: Redis cache (L2 - persistent, shared)
{ driver: 'redis', config: { host: 'localhost', port: 6379 } }

// Multi-server/Distributed: S3 cache (L3 - unlimited, multi-region)
{ driver: 's3' }

// Production multi-tier: Combine all 3 layers
{
  drivers: [
    { driver: 'memory', ttl: 300000, config: { maxMemoryPercent: 0.1 } },
    { driver: 'redis', ttl: 3600000, config: { host: 'localhost' } },
    { driver: 's3', ttl: 86400000 }
  ]
}
```

### 2. Tune TTL Based on Data Freshness

```javascript
// Frequently changing data: Short TTL
{ ttl: 60000 }  // 1 minute

// Rarely changing data: Long TTL
{ ttl: 3600000 }  // 1 hour
```

### 3. Monitor Cache Performance

```javascript
new CachePlugin({
  driver: 'memory',
  config: { enableStats: true }
})

// Check hit rate
const stats = resource.cache.stats();
if (stats.hitRate < 0.7) {
  console.warn(`Low cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
}
```

---

## Measuring Real Cost Savings with Costs Plugin

Combine `CachePlugin` with `CostsPlugin` to track actual AWS cost savings:

### Complete Example

```javascript
import { S3db, CachePlugin, CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: 's3://key:secret@bucket/path',
  plugins: [
    CostsPlugin,  // Track real AWS costs
    new CachePlugin({ driver: 'memory', ttl: 300000 })  // 5min cache
  ]
});

await s3db.connect();
const users = s3db.resources.users;

// Scenario: 10,000 read operations
console.log('=== Without Cache ===');

// Reset costs
s3db.client.costs.reset();

// Simulate 10,000 calls without cache (disable temporarily)
users.cache.driver.enabled = false;
for (let i = 0; i < 10000; i++) {
  await users.count();
}

const noCacheCost = s3db.client.costs.total;
const noCacheRequests = s3db.client.costs.requests.get;
console.log(`Cost: $${noCacheCost.toFixed(4)}`);
console.log(`GET requests: ${noCacheRequests}`);
// Output: Cost: $4.0000, GET requests: 10000

console.log('\n=== With Cache ===');

// Reset and enable cache
s3db.client.costs.reset();
users.cache.driver.enabled = true;

// Same 10,000 calls with cache
for (let i = 0; i < 10000; i++) {
  await users.count();
}

const cacheCost = s3db.client.costs.total;
const cacheRequests = s3db.client.costs.requests.get;
const cacheStats = users.cache.stats();

console.log(`Cost: $${cacheCost.toFixed(4)}`);
console.log(`GET requests: ${cacheRequests}`);
console.log(`Cache hits: ${cacheStats.hits}`);
console.log(`Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
// Output:
// Cost: $0.0004
// GET requests: 1
// Cache hits: 9999
// Cache hit rate: 99.99%

console.log('\n=== Savings ===');
const savings = noCacheCost - cacheCost;
const savingsPercent = ((savings / noCacheCost) * 100).toFixed(1);
console.log(`Total savings: $${savings.toFixed(4)} (${savingsPercent}%)`);
console.log(`Requests saved: ${noCacheRequests - cacheRequests} (${((1 - cacheRequests/noCacheRequests) * 100).toFixed(1)}%)`);
// Output:
// Total savings: $3.9996 (99.99%)
// Requests saved: 9999 (99.99%)
```

### Monthly Projection

```javascript
// Calculate monthly costs based on current usage
const operations = {
  count: 100000,      // 100K count() calls/month
  list: 50000,        // 50K list() calls/month
  get: 200000         // 200K get() calls/month
};

// Without cache (all operations hit S3)
const monthlyWithoutCache =
  (operations.count * 0.0000004) +  // count = GET
  (operations.list * 0.000005) +     // list = LIST
  (operations.get * 0.0000004);      // get = GET

console.log(`Monthly cost without cache: $${monthlyWithoutCache.toFixed(2)}`);
// Output: Monthly cost without cache: $0.37

// With cache (assuming 95% hit rate)
const hitRate = 0.95;
const monthlyWithCache =
  ((operations.count * (1 - hitRate)) * 0.0000004) +
  ((operations.list * (1 - hitRate)) * 0.000005) +
  ((operations.get * (1 - hitRate)) * 0.0000004);

console.log(`Monthly cost with cache: $${monthlyWithCache.toFixed(2)}`);
// Output: Monthly cost with cache: $0.02

console.log(`Monthly savings: $${(monthlyWithoutCache - monthlyWithCache).toFixed(2)}`);
// Output: Monthly savings: $0.35
```

### Real-Time Monitoring

```javascript
// Monitor costs and cache performance in real-time
setInterval(() => {
  const costs = s3db.client.costs;
  const stats = users.cache.stats();

  console.log('=== Cache & Costs Report ===');
  console.log(`Total cost: $${costs.total.toFixed(4)}`);
  console.log(`Total requests: ${costs.requests.total}`);
  console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`Cache memory: ${stats.memoryUsagePercent}%`);

  // Alert if cache not saving money
  if (stats.hitRate < 0.8) {
    console.warn('Low cache hit rate - consider adjusting TTL');
  }
}, 60000); // Every minute
```

### Cost Breakdown by Operation

```javascript
// After running your application
const costs = s3db.client.costs;

console.log('=== Cost Breakdown ===');
console.log(`PUT operations: ${costs.requests.put} x $${costs.prices.put} = $${(costs.requests.put * costs.prices.put).toFixed(6)}`);
console.log(`GET operations: ${costs.requests.get} x $${costs.prices.get} = $${(costs.requests.get * costs.prices.get).toFixed(6)}`);
console.log(`LIST operations: ${costs.requests.list} x $${costs.prices.list} = $${(costs.requests.list * costs.prices.list).toFixed(6)}`);
console.log(`Total: $${costs.total.toFixed(6)}`);

// Example output:
// PUT operations: 50 x $0.000005 = $0.000250
// GET operations: 10 x $0.0000004 = $0.000004
// LIST operations: 5 x $0.000005 = $0.000025
// Total: $0.000279
```

---

## Error Handling

The Cache Plugin uses standardized error classes with comprehensive context and recovery guidance:

### CacheError

All cache operations throw `CacheError` instances with HTTP-style metadata:

```javascript
try {
  await resource.cache.get('invalid-key');
} catch (error) {
  console.error(error.name);        // 'CacheError'
  console.error(error.message);     // Brief error summary
  console.error(error.statusCode);  // e.g. 400, 413, 500
  console.error(error.description); // Detailed explanation with guidance
  console.error(error.context);     // Operation context
  console.error(error.retriable);   // boolean
  console.error(error.suggestion);  // Next steps in plain English
}
```

### Common Errors

#### Invalid Cache Key

**When**: Cache key is null, undefined, or invalid type
**Error**: `Invalid cache key: must be a non-empty string`
**Recovery**:
```javascript
// Bad
await resource.cache.get(null);           // Throws CacheError
await resource.cache.get('');             // Throws CacheError
await resource.cache.get(undefined);      // Throws CacheError

// Good
await resource.cache.get('valid-key');    // Works
```

#### Resource Not Found

**When**: Warming cache for non-existent resource
**Error**: `Resource not found for cache warming: {resourceName}`
**Recovery**:
```javascript
// Bad
await cachePlugin.warmCache('nonexistent-resource');  // Throws CacheError

// Good
const resourceNames = Object.keys(database.resources);
for (const name of resourceNames) {
  await cachePlugin.warmCache(name);
}
```

#### Driver-Specific Errors

**Filesystem Driver**:
```javascript
try {
  await resource.cache.get('key');
} catch (error) {
  if (error.name === 'CacheError') {
    console.error('Filesystem cache error:', error.description);
    console.error('Status:', error.statusCode, 'Retriable?', error.retriable);
    // Common fixes: check directory permissions, disk space, lockTimeout settings
  }
}
```

**S3 Driver**:
```javascript
try {
  await resource.cache.set('key', data);
} catch (error) {
  if (error.name === 'CacheError') {
    console.error('S3 cache error:', error.description);
    // Check S3 credentials, permissions, bucket access
  }
}
```

**Memory Driver**:
```javascript
try {
  await resource.cache.set('key', hugePayload);
} catch (error) {
  if (error.name === 'CacheError' && error.statusCode === 400) {
    console.warn(error.suggestion); // e.g. choose either maxMemoryBytes or maxMemoryPercent
  }
}
```

#### Memory Limit Errors

**When**: Conflicting memory configuration
**Error**: `Cannot use both maxMemoryBytes and maxMemoryPercent`
**Recovery**:
```javascript
// Bad
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryBytes: 512 * 1024 * 1024,
    maxMemoryPercent: 0.1  // Conflict!
  }
})

// Good - Choose one
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryPercent: 0.1  // OR maxMemoryBytes, not both
  }
})
```

### Error Recovery Patterns

#### Graceful Degradation

Skip cache on errors and fetch from S3:
```javascript
async function getWithCacheFallback(resource, id) {
  try {
    // Try cache first
    return await resource.cache.get(id);
  } catch (cacheError) {
    console.warn('Cache unavailable, fetching from S3:', cacheError.message);
    // Fall back to direct S3 read
    return await resource.get(id, { skipCache: true });
  }
}
```

#### Cache Health Monitoring

Monitor cache errors and disable if unhealthy:
```javascript
let cacheErrorCount = 0;
const MAX_ERRORS = 10;

resource.on('cache-error', (error) => {
  cacheErrorCount++;

  if (cacheErrorCount > MAX_ERRORS) {
    console.error('Cache unhealthy, disabling');
    cachePlugin.enabled = false;
  }
});
```

#### Retry with Backoff

Retry transient cache errors:
```javascript
async function cacheSetWithRetry(cache, key, value, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await cache.set(key, value);
    } catch (error) {
      if (error.name === 'CacheError' && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
}
```

---

## Troubleshooting

**Issue: Cache not improving performance**
- Solution: Check if TTL is too short or writes are clearing cache frequently

**Issue: Memory usage too high**
- Solution: Reduce `maxSize` or enable `enableCompression`

**Issue: Stale data in cache**
- Solution: Reduce `ttl` or manually clear cache after updates

---

## FAQ

### Basics

**Q: Which cache driver should I use?**
A: Depends on your use case:
- `memory`: Development and hot data (fastest, ~1ms)
- `redis`: Production/shared cache (persistent, ~15ms)
- `s3`: Multi-server/distributed (unlimited, ~120ms)
- Multi-tier: Combine all 3 for optimal performance

**Q: Does cache work automatically?**
A: Yes! After installing the plugin, all read operations (`fetched`, `list`, `count`, `query`) are automatically cached.

**Q: How to skip cache for a specific operation?**
A: Pass `skipCache: true` as an option:
```javascript
const user = await users.get('id123', { skipCache: true });
```

### Configuration

**Q: How to configure TTL (time-to-live)?**
A: Use the `ttl` option in milliseconds:
```javascript
new CachePlugin({
  driver: 'memory',
  ttl: 60000  // 60 seconds
})
```

**Q: Can I cache only specific resources?**
A: Yes! Use `include` or `exclude`:
```javascript
new CachePlugin({
  include: ['users', 'products'],  // Only these resources
  exclude: ['logs']                // All except logs
})
```

**Q: How to avoid caching plugin-created resources?**
A: By default, resources with `createdBy !== 'user'` are not cached. To explicitly include them, add to the `include` array.

### Operations

**Q: How to manually clear cache?**
A: Use the plugin methods:
```javascript
// Clear cache for a resource
await users.cache.clear();

// Clear all cache
await database.plugins.cache.clearAllCache();

// Partition-aware: clear specific partition
await resource.clearPartitionCache('byRegion', { region: 'US' });
```

**Q: How to warm up the cache?**
A: Use the `warmCache` method:
```javascript
await database.plugins.cache.warmCache('users', {
  includePartitions: true,
  sampleSize: 1000
});
```

### Performance

**Q: Which driver is fastest?**
A: Performance ranking (fastest to slowest):
1. `memory`: ~1-2ms (in-process)
2. `redis`: ~10-20ms (network, shared)
3. `s3`: ~100-200ms (API call, distributed)
Use multi-tier to get benefits of all layers.

**Q: How to analyze cache usage?**
A: Use `analyzeCacheUsage()` with partition-aware cache:
```javascript
const analysis = await database.plugins.cache.analyzeCacheUsage();
// Returns: most used partitions, least used, recommendations
```

**Q: How to configure maximum size?**
A: You have 3 options (choose only ONE):

1. **By item count** (simple):
```javascript
new CachePlugin({
  driver: 'memory',
  maxSize: 1000,  // Maximum 1000 items
  config: {
    evictionPolicy: 'lru'
  }
})
```

2. **By absolute bytes** (fixed environments):
```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryBytes: 512 * 1024 * 1024,  // 512MB
    enableCompression: true
  }
})
```

3. **By percentage** (containers/cloud - RECOMMENDED):
```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryPercent: 0.1,  // 10% of system memory
    enableCompression: true
  }
})
```

**IMPORTANT**: Don't use `maxMemoryBytes` and `maxMemoryPercent` together - the system will throw an error!

**Q: How to monitor cache memory usage?**
A: Use the driver's `getMemoryStats()` method:
```javascript
const cache = database.plugins.cache.driver;
const stats = cache.getMemoryStats();

console.log('Memory Stats:', {
  current: stats.memoryUsage.current,
  max: stats.memoryUsage.max,
  usage: `${stats.memoryUsagePercent.toFixed(1)}%`,
  items: stats.totalItems,
  avgSize: stats.averageItemSize,
  evicted: stats.evictedDueToMemory
});

// Alert if usage is high
if (stats.memoryUsagePercent > 90) {
  console.warn('Cache memory usage above 90%!');
}
```

**Q: What happens when memory limit is reached?**
A: Cache automatically removes oldest items (eviction) until there's enough space. You can monitor how many items were removed with `stats.evictedDueToMemory`.

### Troubleshooting

**Q: Cache is not being invalidated after updates?**
A: Check if the plugin was installed BEFORE creating the resources. The plugin installs middlewares on resources during `onInstall()`.

**Q: I'm seeing stale data?**
A: Reduce TTL or use `skipCache: true` for operations that need real-time data.

**Q: Memory usage too high / OOM errors?**
A: Configure `maxMemoryBytes` or `maxMemoryPercent`:
```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryPercent: 0.1,  // Limit to 10% of memory
    enableCompression: true  // Reduces memory usage
  }
})
```

**Q: How to debug cache issues?**
A: Enable debug mode and monitor statistics:
```javascript
new CachePlugin({
  logLevel: 'debug',
  config: { enableStats: true }
})

// Check statistics
const stats = resource.cache.stats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

// Check memory
const memStats = resource.cache.getMemoryStats();
console.log(`Memory: ${memStats.memoryUsagePercent.toFixed(1)}%`);
```

---

## See Also

- [Configuration](/plugins/cache/guides/configuration.md) - Detailed driver options
- [Usage Patterns](/plugins/cache/guides/usage-patterns.md) - Examples and workflows
- [Metrics Plugin](/plugins/metrics/README.md) - Monitor cache performance
- [Costs Plugin](/plugins/costs/README.md) - Track caching cost savings
