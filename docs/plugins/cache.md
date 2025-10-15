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
A: Use `maxSize`:
```javascript
new CachePlugin({
  driver: 'memory',
  maxSize: 1000,  // Máximo 1000 itens
  config: {
    evictionPolicy: 'lru'  // Least Recently Used
  }
})
```

### Troubleshooting

**Q: O cache não está sendo invalidado após updates?**
A: Verifique se o plugin foi instalado ANTES de criar os recursos. O plugin instala middlewares nos recursos durante `onInstall()`.

**Q: Estou vendo dados desatualizados?**
A: Reduza o TTL ou use `skipCache: true` para operações que precisam dados em tempo real.

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
```
