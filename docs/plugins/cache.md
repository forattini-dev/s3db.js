# 💾 Cache Plugin

## ⚡ TLDR

**Drastically** reduces S3 costs and latency with intelligent caching (memory/filesystem/S3).

**1 line to get started:**
```javascript
await db.usePlugin(new CachePlugin({ driver: 'memory' }));  // 90x faster!
```

**Key features:**
- ✅ Drivers: memory (LRU/FIFO), filesystem, S3
- ✅ Configurable TTL + automatic invalidation
- ✅ Optional compression (gzip)
- ✅ Hit/miss rate statistics
- ✅ Partition-aware caching

**When to use:**
- 💰 Reduce S3 API costs
- ⚡ Improve performance (2ms vs 180ms)
- 📊 Cache heavy queries
- 🌍 Multi-server with S3 driver

---

## ⚡ Quickstart

```javascript
import { S3db, CachePlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://key:secret@bucket/path",
  plugins: [new CachePlugin({ driver: 'memory' })]
});

await s3db.connect();

const users = s3db.resource('users');

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

## 📊 Configuration Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `driver` | string | `'memory'` | Cache storage driver: `'memory'`, `'filesystem'`, or `'s3'` |
| `ttl` | number | `300000` | Time-to-live in milliseconds (5 minutes default) |
| `maxSize` | number | `1000` | Maximum number of cached items |
| `config` | object | `{}` | Driver-specific configuration options |

### Memory Driver Config

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxMemoryBytes` | number | `0` | Maximum memory in bytes (0 = unlimited). **Cannot be used with maxMemoryPercent** |
| `maxMemoryPercent` | number | `0` | Maximum memory as fraction 0...1 (e.g., 0.1 = 10%). **Cannot be used with maxMemoryBytes** |
| `evictionPolicy` | string | `'lru'` | Eviction strategy: `'lru'` (least recently used) or `'fifo'` |
| `enableStats` | boolean | `false` | Track cache hit/miss statistics |
| `enableCompression` | boolean | `false` | Compress cached values with gzip |
| `compressionThreshold` | number | `1024` | Minimum size (bytes) to trigger compression |

### Filesystem Driver Config

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `directory` | string | **required** | Path to store cache files |
| `enableCompression` | boolean | `true` | Enable gzip compression |
| `createDirectory` | boolean | `true` | Auto-create directory if missing |
| `enableCleanup` | boolean | `true` | Auto-cleanup expired files |
| `cleanupInterval` | number | `300000` | Cleanup interval in ms (5 minutes) |

### S3 Driver Config

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `keyPrefix` | string | `'cache'` | S3 key prefix for cache objects |
| `client` | object | DB client | Custom S3 client (uses database client by default) |

---

## 📚 Configuration Examples

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

const users = s3db.resource('users');
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

const users = s3db.resource('users');
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

const products = s3db.resource('products');
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

const products = s3db.resource('products');
await products.count();  // Cached to disk

// Cache persists across restarts
console.log('Cache stored in ./cache directory');
```

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
const users = s3db.resource('users');
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

const orders = s3db.resource('orders');
await orders.list();  // Large results compressed

console.log('Large cached values are compressed automatically');
```

### Example 5: Manual Cache Control

Take control of caching behavior:

```javascript
new CachePlugin({ driver: 'memory' })

const users = s3db.resource('users');

// Manual cache operations
await users.cache.set('my-key', { data: 'value' });
const cached = await users.cache.get('my-key');

// Clear specific cache
await users.cache.delete('my-key');

// Clear all cache for resource
await users.cache.clear();

console.log('Manual cache control enabled');
```

---

## 🔧 API Reference

### Resource Cache Methods

When CachePlugin is installed, resources gain these methods:

```javascript
const resource = s3db.resource('users');

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
console.log('Cache stats:', {
  hits: stats.hits,
  misses: stats.misses,
  hitRate: stats.hitRate,
  size: stats.size
});
```

---

## ✅ Best Practices

### 1. Choose the Right Driver

```javascript
// Development: Memory cache
{ driver: 'memory', ttl: 300000 }

// Single server: Filesystem cache
{ driver: 'filesystem', config: { directory: './cache' } }

// Multi-server: S3 cache
{ driver: 's3' }
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

## 🔗 See Also

- [Metrics Plugin](./metrics.md) - Monitor cache performance
- [Costs Plugin](./costs.md) - Track caching cost savings

---

## 🚨 Error Handling

The Cache Plugin uses standardized error classes with comprehensive context and recovery guidance:

### CacheError

All cache operations throw `CacheError` instances with detailed context:

```javascript
try {
  await resource.cache.get('invalid-key');
} catch (error) {
  console.error(error.name);        // 'CacheError'
  console.error(error.message);     // Brief error summary
  console.error(error.description); // Detailed explanation with guidance
  console.error(error.context);     // Operation context
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
    // Check directory permissions, disk space
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

## 🐛 Troubleshooting

**Issue: Cache not improving performance**
- Solution: Check if TTL is too short or writes are clearing cache frequently

**Issue: Memory usage too high**
- Solution: Reduce `maxSize` or enable `enableCompression`

**Issue: Stale data in cache**
- Solution: Reduce `ttl` or manually clear cache after updates

---

## ❓ FAQ

### Básico

**Q: Qual driver de cache devo usar?**
A: Depende do seu caso de uso:
- `memory`: Desenvolvimento e cache temporário (mais rápido)
- `filesystem`: Produção single-server (persiste entre restarts)
- `s3`: Multi-server/distributed (compartilhado entre instâncias)

**Q: O cache funciona automaticamente?**
A: Sim! Após instalar o plugin, todas as operações de leitura (`get`, `list`, `count`, `query`) são automaticamente cacheadas.

**Q: Como pular o cache em uma operação específica?**
A: Passe `skipCache: true` como opção:
```javascript
const user = await users.get('id123', { skipCache: true });
```

### Configuração

**Q: Como configurar TTL (time-to-live)?**
A: Use a opção `ttl` em milissegundos:
```javascript
new CachePlugin({
  driver: 'memory',
  ttl: 60000  // 60 segundos
})
```

**Q: Posso cachear apenas recursos específicos?**
A: Sim! Use `include` ou `exclude`:
```javascript
new CachePlugin({
  include: ['users', 'products'],  // Apenas estes recursos
  exclude: ['logs']                // Todos exceto logs
})
```

**Q: Como evitar cachear recursos criados por plugins?**
A: Por padrão, recursos com `createdBy !== 'user'` já não são cacheados. Para incluí-los explicitamente, adicione ao array `include`.

### Operações

**Q: Como limpar o cache manualmente?**
A: Use os métodos do plugin:
```javascript
// Limpar cache de um recurso
await users.cache.clear();

// Limpar todo o cache
await database.plugins.cache.clearAllCache();

// Partition-aware: limpar partição específica
await resource.clearPartitionCache('byRegion', { region: 'US' });
```

**Q: Como preaquecer o cache?**
A: Use o método `warmCache`:
```javascript
await database.plugins.cache.warmCache('users', {
  includePartitions: true,
  sampleSize: 1000
});
```

### Performance

**Q: Qual driver é mais rápido?**
A: `memory` é o mais rápido (~2ms vs 180ms do S3). `filesystem` é intermediário. `s3` tem maior latência mas permite compartilhamento entre instâncias.

**Q: Como analisar o uso do cache?**
A: Use `analyzeCacheUsage()` com partition-aware cache:
```javascript
const analysis = await database.plugins.cache.analyzeCacheUsage();
// Retorna: most used partitions, least used, recomendações
```

**Q: Como configurar o tamanho máximo?**
A: Você tem 3 opções (escolha apenas UMA):

1. **Por número de itens** (simples):
```javascript
new CachePlugin({
  driver: 'memory',
  maxSize: 1000,  // Máximo 1000 itens
  config: {
    evictionPolicy: 'lru'
  }
})
```

2. **Por bytes absolutos** (ambientes fixos):
```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryBytes: 512 * 1024 * 1024,  // 512MB
    enableCompression: true
  }
})
```

3. **Por porcentagem** (containers/cloud - RECOMENDADO):
```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryPercent: 0.1,  // 10% da memória do sistema
    enableCompression: true
  }
})
```

⚠️ **IMPORTANTE**: Não use `maxMemoryBytes` e `maxMemoryPercent` juntos - o sistema lançará um erro!

**Q: Como monitorar o uso de memória do cache?**
A: Use o método `getMemoryStats()` do driver:
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

// Alerta se uso alto
if (stats.memoryUsagePercent > 90) {
  console.warn('⚠️ Cache memory usage above 90%!');
}
```

**Q: O que acontece quando o limite de memória é atingido?**
A: O cache automaticamente remove os itens mais antigos (eviction) até ter espaço suficiente. Você pode monitorar quantos itens foram removidos com `stats.evictedDueToMemory`.

### Troubleshooting

**Q: O cache não está sendo invalidado após updates?**
A: Verifique se o plugin foi instalado ANTES de criar os recursos. O plugin instala middlewares nos recursos durante `onInstall()`.

**Q: Estou vendo dados desatualizados?**
A: Reduza o TTL ou use `skipCache: true` para operações que precisam dados em tempo real.

**Q: Memory usage too high / OOM errors?**
A: Configure `maxMemoryBytes` ou `maxMemoryPercent`:
```javascript
new CachePlugin({
  driver: 'memory',
  config: {
    maxMemoryPercent: 0.1,  // Limite a 10% da memória
    enableCompression: true  // Reduz uso de memória
  }
})
```

**Q: Como debugar problemas de cache?**
A: Ative o modo verbose e monitore estatísticas:
```javascript
new CachePlugin({
  verbose: true,
  config: { enableStats: true }
})

// Verifique estatísticas
const stats = resource.cache.stats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

// Verifique memória
const memStats = resource.cache.getMemoryStats();
console.log(`Memory: ${memStats.memoryUsagePercent.toFixed(1)}%`);
```
