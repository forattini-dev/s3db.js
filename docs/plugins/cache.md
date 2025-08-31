# 💾 Cache Plugin

<p align="center">
  <strong>Driver-Based Caching System</strong><br>
  <em>Intelligent caching that reduces S3 API calls and improves performance</em>
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [Driver Configuration](#driver-configuration)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)

---

## Overview

The Cache Plugin is a **driver-based caching system** that dramatically reduces S3 API calls and improves performance by caching frequently accessed data. It supports multiple storage drivers including memory, filesystem, and S3.

### How It Works

1. **Automatic Interception**: Automatically intercepts read operations (list, count, get)
2. **Driver-Based Storage**: Uses configurable drivers for different storage needs
3. **Intelligent Invalidation**: Cache is cleared on write operations to maintain consistency
4. **Partition Awareness**: Includes partition values in cache keys for accurate caching

> 🏎️ **Performance**: Dramatically reduces S3 costs and latency by caching frequently accessed data.

---

## Key Features

### 🎯 Core Features
- **Multiple Drivers**: Memory, filesystem, and S3 storage options
- **Automatic Caching**: Transparent caching of read operations
- **Smart Invalidation**: Cache cleared on write operations
- **Partition Support**: Partition-aware caching with hierarchical organization
- **TTL Management**: Configurable time-to-live for cache entries

### 🔧 Technical Features
- **Compression**: Optional gzip compression for cached values
- **Statistics**: Hit/miss tracking and performance metrics
- **Eviction Policies**: LRU and FIFO eviction strategies
- **Custom Keys**: Generate custom cache keys for specific operations
- **Manual Control**: Direct cache operations (set, get, delete, clear)

---

## Installation & Setup

### Basic Setup

```javascript
import { S3db, CachePlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [
    new CachePlugin({
      driver: 'memory',
      ttl: 300000,        // 5 minutes
      maxSize: 1000,      // Max 1000 items
      config: {
        evictionPolicy: 'lru',
        enableStats: true
      }
    })
  ]
});

await s3db.connect();

// Cache automatically intercepts read operations
const users = s3db.resource('users');
await users.count(); // ⚡ Cached for 5 minutes
await users.list();  // ⚡ Cached result
```

### Driver Options

#### Memory Driver (Fast & Temporary)
```javascript
new CachePlugin({
  driver: 'memory',
  ttl: 300000,
  maxSize: 1000,
  config: {
    evictionPolicy: 'lru',
    enableStats: true,
    enableCompression: false
  }
})
```

#### S3 Driver (Persistent & Shared)
```javascript
new CachePlugin({
  driver: 's3',
  ttl: 1800000,
  config: {
    bucket: 'my-cache-bucket',
    keyPrefix: 'cache/',
    storageClass: 'STANDARD'
  }
})
```

#### Filesystem Driver (Local & Fast)
```javascript
new CachePlugin({
  driver: 'filesystem',
  config: {
    path: './cache',
    partitionAware: true,
    partitionStrategy: 'hierarchical'
  }
})
```

---

## Configuration Options

### Plugin-Level Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `driver` | string | `'s3'` | Cache driver: `'memory'`, `'s3'`, or `'filesystem'` |
| `ttl` | number | `300000` | Time-to-live in milliseconds (5 minutes) |
| `maxSize` | number | `1000` | Maximum number of items in cache |
| `config` | object | `{}` | Driver-specific configuration options |
| `includePartitions` | boolean | `true` | Include partition values in cache keys |
| `partitionAware` | boolean | `false` | Use partition-aware filesystem cache |
| `partitionStrategy` | string | `'hierarchical'` | Partition strategy |
| `trackUsage` | boolean | `true` | Track partition usage statistics |
| `preloadRelated` | boolean | `false` | Preload related partition data |

**Configuration Priority**: Driver-specific `config` options override global plugin settings.

---

## Driver Configuration

### Memory Driver (`driver: 'memory'`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ttl` | number | inherited | TTL override for memory cache |
| `maxSize` | number | inherited | Max items override for memory cache |
| `enableStats` | boolean | `false` | Track cache statistics |
| `evictionPolicy` | string | `'lru'` | Eviction policy: `'lru'` or `'fifo'` |
| `logEvictions` | boolean | `false` | Log when items are evicted |
| `cleanupInterval` | number | `60000` | Cleanup interval in milliseconds |
| `enableCompression` | boolean | `false` | Enable gzip compression |
| `compressionThreshold` | number | `1024` | Minimum size to trigger compression |
| `tags` | object | `{}` | Default tags for cached items |
| `persistent` | boolean | `false` | Persist cache to disk (experimental) |

### S3 Driver (`driver: 's3'`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ttl` | number | inherited | TTL override for S3 cache |
| `keyPrefix` | string | `'cache'` | S3 key prefix for cache objects |
| `client` | object | Database client | Custom S3 client instance |

**Note:** S3 cache automatically uses gzip compression for all cached values.

### Filesystem Driver (`driver: 'filesystem'`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `directory` | string | required | Directory path to store cache files |
| `ttl` | number | inherited | TTL override for filesystem cache |
| `prefix` | string | `'cache'` | Prefix for cache filenames |
| `enableCompression` | boolean | `true` | Enable gzip compression |
| `compressionThreshold` | number | `1024` | Minimum size to trigger compression |
| `createDirectory` | boolean | `true` | Create directory if it doesn't exist |
| `fileExtension` | string | `'.cache'` | File extension for cache files |
| `enableMetadata` | boolean | `true` | Store metadata alongside cache data |
| `maxFileSize` | number | `10485760` | Maximum file size (10MB) |
| `enableCleanup` | boolean | `true` | Automatic cleanup of expired files |
| `cleanupInterval` | number | `300000` | Cleanup interval (5 minutes) |

---

## Usage Examples

### Basic Caching Example

```javascript
import { S3db, CachePlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new CachePlugin({
    driver: 'memory',
    ttl: 600000, // 10 minutes
    maxSize: 500,
    config: {
      enableStats: true,
      evictionPolicy: 'lru'
    }
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

### Advanced Configuration Example

```javascript
// Advanced cache configuration with partition-aware filesystem cache
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new CachePlugin({
    driver: 'filesystem',
    
    // Global cache settings
    ttl: 3600000, // 1 hour default
    maxSize: 5000, // 5000 items max
    includePartitions: true,
    partitionAware: true,
    partitionStrategy: 'hierarchical',
    trackUsage: true,
    preloadRelated: true,
    
    // Driver-specific configuration
    config: {
      directory: './data/cache',
      prefix: 'app-cache',
      ttl: 7200000, // 2 hours - overrides global TTL
      enableCompression: true,
      compressionThreshold: 512,
      enableCleanup: true,
      cleanupInterval: 600000, // 10 minutes
      enableMetadata: true,
      maxFileSize: 5242880, // 5MB per file
      enableStats: true
    }
  })]
});
```

### Manual Cache Operations

```javascript
const users = s3db.resource('users');

// Generate custom cache keys
const cacheKey = await users.cacheKeyFor({
  action: 'list',
  params: { limit: 10 },
  partition: 'byStatus',
  partitionValues: { status: 'active' }
});

// Manual cache operations
await users.cache.set(cacheKey, data);
const cached = await users.cache.get(cacheKey);
await users.cache.delete(cacheKey);
await users.cache.clear(); // Clear all cache

// Partition-aware cache operations
if (users.cache.clearPartition) {
  await users.cache.clearPartition('byStatus', { status: 'active' });
  const stats = await users.cache.getPartitionStats('byStatus');
  console.log('Partition stats:', stats);
}
```

### Cache Statistics

```javascript
// Cache statistics (if enabled)
if (users.cache.stats) {
  const stats = users.cache.stats();
  console.log('Cache hit rate:', stats.hitRate);
  console.log('Total hits:', stats.hits);
  console.log('Total misses:', stats.misses);
  console.log('Cache size:', stats.size);
  console.log('Memory usage:', stats.memoryUsage);
}
```

---

## API Reference

### Plugin Constructor

```javascript
new CachePlugin({
  driver: 'memory' | 's3' | 'filesystem',
  ttl?: number,
  maxSize?: number,
  config?: object,
  includePartitions?: boolean,
  partitionAware?: boolean,
  partitionStrategy?: string,
  trackUsage?: boolean,
  preloadRelated?: boolean
})
```

### Resource Cache Methods

When the plugin is installed, resources gain these cache methods:

#### `cache.get(key)`
Retrieve a value from cache.

#### `cache.set(key, value, ttl?)`
Store a value in cache with optional TTL override.

#### `cache.delete(key)`
Remove a value from cache.

#### `cache.clear()`
Clear all cached values.

#### `cache.stats()`
Get cache statistics (if enabled).

#### `cacheKeyFor(options)`
Generate cache key for specific operations.

### Partition-Aware Methods (when `partitionAware: true`)

#### `cache.clearPartition(partition, values)`
Clear cache for specific partition.

#### `cache.getPartitionStats(partition)`
Get statistics for specific partition.

---

## Best Practices

### 1. Choose the Right Driver

- **Memory Driver**: Best for temporary, fast access with limited memory usage
- **Filesystem Driver**: Best for persistent local caching with compression
- **S3 Driver**: Best for shared caching across multiple instances

### 2. Configure TTL Appropriately

```javascript
// High-frequency data: Short TTL
{ ttl: 300000 }  // 5 minutes

// Medium-frequency data: Moderate TTL
{ ttl: 1800000 } // 30 minutes

// Low-frequency data: Long TTL
{ ttl: 3600000 } // 1 hour
```

### 3. Enable Compression for Large Data

```javascript
{
  config: {
    enableCompression: true,
    compressionThreshold: 1024 // Compress items > 1KB
  }
}
```

### 4. Monitor Cache Performance

```javascript
// Enable statistics to monitor cache effectiveness
{
  config: {
    enableStats: true
  }
}

// Check hit rates periodically
const stats = resource.cache.stats();
if (stats.hitRate < 0.7) {
  console.warn('Low cache hit rate:', stats.hitRate);
}
```

### 5. Use Partition-Aware Caching

```javascript
// For partitioned resources
{
  partitionAware: true,
  partitionStrategy: 'hierarchical',
  trackUsage: true,
  preloadRelated: true
}
```

### 6. Handle Cache Invalidation

```javascript
// Cache is automatically cleared on writes, but you can also
// manually clear specific partitions or keys when needed
await users.cache.clearPartition('byStatus', { status: 'inactive' });
```

---

## Troubleshooting

### Issue: Cache not improving performance
**Solution**: Check if TTL is too short or if write operations are frequently clearing the cache.

### Issue: Memory usage growing too large
**Solution**: Reduce `maxSize` or enable compression with `enableCompression: true`.

### Issue: Cache inconsistency
**Solution**: Ensure cache is properly cleared on write operations. Check TTL settings.

### Issue: Filesystem cache growing too large
**Solution**: Enable cleanup with `enableCleanup: true` and adjust `cleanupInterval`.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Metrics Plugin](./metrics.md) - For monitoring cache performance
- [Backup Plugin](./backup.md) - For data backup strategies