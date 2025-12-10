# Cache Plugin

> **Adaptive multi-tier caching for s3db.js with memory, Redis, and S3 layers.**

---

## TLDR

**Drastically** reduces S3 costs and latency with intelligent caching (memory/redis/S3).

**1 line to get started:**
```javascript
await db.usePlugin(new CachePlugin({ driver: 'memory' }));  // 90x faster!
```

**Multi-tier caching (cascade L1 → L2 → L3 → Database):**
```javascript
await db.usePlugin(new CachePlugin({
  drivers: [
    { driver: 'memory', ttl: 300000, config: { maxMemoryPercent: 0.1 } },  // L1: ~1ms
    { driver: 'redis', ttl: 3600000, config: { host: 'localhost' } },      // L2: ~15ms
    { driver: 's3', ttl: 86400000, config: { keyPrefix: 'cache/' } }       // L3: ~120ms
  ]
}));
```

**Key features:**
- Drivers: memory (LRU/FIFO), redis, S3
- Multi-tier caching with auto-promotion (hot data moves to faster layers)
- Configurable TTL per layer + automatic invalidation
- Optional compression (gzip)
- Hit/miss/eviction statistics
- Partition-aware caching with usage insights

**Performance & Cost** (measured with Costs Plugin):
```javascript
// Without cache: Every call hits S3
for (let i = 0; i < 1000; i++) {
  await users.count(); // Each call: ~180ms + 1 GET request ($0.0004)
}
// Total: ~180 seconds, 1000 GET requests = $0.40

// With cache: First call S3, rest from memory
for (let i = 0; i < 1000; i++) {
  await users.count(); // First: 180ms + 1 GET, Rest: 2ms (cache hit)
}
// Total: ~2 seconds (90x faster), 1 GET request = $0.0004 (1000x cheaper!)
```

---

## Quickstart

```javascript
import { S3db, CachePlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://key:secret@bucket/path",
  plugins: [new CachePlugin({ driver: 'memory' })]
});

await s3db.connect();

const users = s3db.resources.users;

// First call hits S3
console.time('First call');
const count1 = await users.count();
console.timeEnd('First call');
// First call: 180ms

// Second call uses cache
console.time('Cached call');
const count2 = await users.count();
console.timeEnd('Cached call');
// Cached call: 2ms

console.log(`Count: ${count2}, Speed improvement: ${(180/2).toFixed(0)}x faster`);
// Output: Count: 150, Speed improvement: 90x faster
```

---

## Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**NO Peer Dependencies!**

CachePlugin works out-of-the-box with **zero external dependencies**. All caching capabilities use:
- Node.js built-in modules (`fs`, `path`, `crypto`, `os`)
- Core s3db.js functionality
- No NPM packages required

**Cache Drivers (all built-in):**

| Driver | Best For | Dependencies |
|--------|----------|--------------|
| `memory` | Development, single-process apps | None |
| `filesystem` | Local caching, serverless, single-server | None |
| `s3` | Multi-server, AWS Lambda, distributed | None (uses s3db.js client) |

**Zero-Configuration Setup:**
```javascript
import { Database } from 's3db.js';
import { CachePlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });
await db.usePlugin(new CachePlugin());  // That's it!
await db.connect();
```

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](/plugins/cache/guides/configuration.md) | Driver options (Memory, Redis, S3), dependency graph |
| [Usage Patterns](/plugins/cache/guides/usage-patterns.md) | Progressive adoption journey, multi-tier setup, examples |
| [Best Practices](/plugins/cache/guides/best-practices.md) | Production tips, cost measurement, error handling, FAQ |

---

## Quick Reference

### Driver Selection

```javascript
// Memory (default) - zero config
new CachePlugin({ driver: 'memory' })

// Filesystem - specify cache directory
new CachePlugin({
  driver: 'filesystem',
  config: { cacheDir: './cache' }
})

// S3 - uses your existing S3 bucket
new CachePlugin({
  driver: 's3',
  config: { prefix: 'cache/' }
})
```

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `driver` | string | `'memory'` | Cache driver (`'memory'`, `'filesystem'`, `'redis'`, `'s3'`) |
| `drivers` | array | - | Multi-tier: `[{ driver, ttl, config }, ...]` |
| `ttl` | number | `300000` | Time-to-live in milliseconds (5 min default) |
| `maxSize` | number | `1000` | Maximum cached items |
| `config` | object | `{}` | Driver-specific options |

### Cache Management

```javascript
const { cache } = resource;

// Manual operations
await cache.set('key', value);
await cache.get('key');
await cache.delete('key');
await cache.clear();

// Warming
await cache.warmPage({ offset: 0, size: 25 });
await cache.warmItem('user_123');

// Invalidation
await cache.invalidate({ id: 'user_123' });

// Statistics
const stats = cache.stats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

## See Also

- [Metrics Plugin](/plugins/metrics/README.md) - Monitor cache performance
- [Costs Plugin](/plugins/costs/README.md) - Track caching cost savings
