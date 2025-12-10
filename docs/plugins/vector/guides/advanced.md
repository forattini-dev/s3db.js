# 🚀 Advanced Features

**Prev:** [API Reference](./api-reference.md)
**Next:** [Best Practices](./best-practices.md)
**Main:** [README](/plugins/vector/README.md) | **All guides:** [Index](/plugins/vector/README.md#-documentation-index)

> **In this guide:**
> - Event system and monitoring
> - Real-time event tracking
> - Performance tuning strategies
> - Production monitoring patterns
> - Partition-based optimization
> - Caching integration

**Time to read:** 20 minutes
**Difficulty:** Advanced

---

## Events & Monitoring

VectorPlugin emits comprehensive events for observability, debugging, and analytics. All events can be disabled by setting `emitEvents: false` in plugin configuration.

### Event Categories

#### 🔄 Lifecycle Events

Standard plugin lifecycle events (emitted by base Plugin class):

| Event | When | Payload |
|-------|------|---------|
| `db:plugin:installed` | Plugin installed | `{ plugin: 'VectorPlugin' }` |
| `db:plugin:started` | Plugin started | `{ plugin: 'VectorPlugin' }` |
| `db:plugin:stopped` | Plugin stopped | `{ plugin: 'VectorPlugin' }` |
| `uninstalled` | Plugin uninstalled | `{ plugin: 'VectorPlugin' }` |

#### 🔍 Search Events

| Event | When | Payload | Verbose |
|-------|------|---------|---------|
| `plg:vector:search-start` | Search initiated | `{ resource, vectorField, limit, distanceMetric, partition, threshold, queryDimensions, timestamp }` | No |
| `plg:vector:search-progress` | Search progress | `{ resource, processed, total, progress, timestamp }` | **Yes** |
| `plg:vector:search-complete` | Search completed | `{ resource, vectorField, resultsCount, totalRecords, processedRecords, dimensionMismatches, duration, throughput, timestamp }` | No |
| `plg:vector:search-error` | Search error | `{ resource, error, stack, timestamp }` | No |

#### 🎯 Clustering Events

| Event | When | Payload | Verbose |
|-------|------|---------|---------|
| `plg:vector:cluster-start` | Clustering initiated | `{ resource, vectorField, k, distanceMetric, partition, maxIterations, timestamp }` | No |
| `plg:vector:cluster-iteration` | Each k-means iteration | `{ resource, k, iteration, inertia, converged, timestamp }` | **Yes** |
| `plg:vector:cluster-converged` | Algorithm converged | `{ resource, k, iterations, inertia, timestamp }` | No |
| `plg:vector:cluster-complete` | Clustering completed | `{ resource, vectorField, k, vectorCount, iterations, converged, inertia, clusterSizes, duration, timestamp }` | No |
| `plg:vector:cluster-error` | Clustering error | `{ resource, error, stack, timestamp }` | No |

#### ⚙️ Configuration & Validation Events

| Event | When | Payload |
|-------|------|---------|
| `plg:vector:field-detected` | Auto-detected embedding field | `{ resource, vectorField, timestamp }` |
| `plg:vector:storage-warning` | Large vectors without proper behavior | `{ resource, vectorFields, totalEstimatedBytes, metadataLimit, currentBehavior, recommendation }` |
| `plg:vector:behavior-fixed` | Auto-fixed behavior | `{ resource, newBehavior }` |
| `plg:vector:dimension-mismatch` | Dimension mismatch detected | `{ resource, recordIndex, expected, got, timestamp }` |
| `plg:vector:empty-dataset` | No vectors found | `{ resource, vectorField, totalRecords, timestamp }` |
| `plg:vector:partition-filter` | Partition filter applied | `{ resource, partition, timestamp }` |

#### 📊 Performance Events

| Event | When | Payload | Verbose |
|-------|------|---------|---------|
| `plg:vector:performance` | After operations | `{ operation, resource, duration, throughput, recordsPerSecond, timestamp }` | **Yes** |

---

## Event Usage Examples

### Basic Monitoring

Monitor all search operations:

```javascript
vectorPlugin.on('plg:vector:search-start', (data) => {
  console.log(`🔍 Starting search on ${data.resource}...`);
  console.log(`   Query dimensions: ${data.queryDimensions}`);
  console.log(`   Distance metric: ${data.distanceMetric}`);
  console.log(`   Limit: ${data.limit}`);
});

vectorPlugin.on('plg:vector:search-complete', (data) => {
  console.log(`✅ Search completed in ${data.duration}ms`);
  console.log(`   Found: ${data.resultsCount} results`);
  console.log(`   Throughput: ${data.throughput} records/s`);
  if (data.dimensionMismatches > 0) {
    console.warn(`   ⚠️  ${data.dimensionMismatches} dimension mismatches`);
  }
});

vectorPlugin.on('plg:vector:search-error', (data) => {
  console.error(`❌ Search error on ${data.resource}:`, data.error);
});
```

### Clustering Progress Tracking

Track clustering progress with visual feedback:

```javascript
const vectorPlugin = new VectorPlugin({
  verboseEvents: true,
  eventThrottle: 500  // Update every 500ms
});

let lastIteration = 0;

vectorPlugin.on('plg:vector:cluster-start', (data) => {
  console.log(`\n🎯 Clustering ${data.vectorCount} vectors with k=${data.k}`);
  console.log(`   Resource: ${data.resource}`);
  console.log(`   Distance metric: ${data.distanceMetric}`);
  console.log(`   Max iterations: ${data.maxIterations}\n`);
  lastIteration = 0;
});

vectorPlugin.on('plg:vector:cluster-iteration', (data) => {
  if (data.iteration > lastIteration) {
    const bar = '█'.repeat(Math.floor(data.iteration / data.maxIterations * 20));
    console.log(`   Iteration ${data.iteration}: ${bar} Inertia: ${data.inertia.toFixed(2)}`);
    lastIteration = data.iteration;
  }
});

vectorPlugin.on('plg:vector:cluster-converged', (data) => {
  console.log(`\n✅ Converged after ${data.iterations} iterations!`);
  console.log(`   Final inertia: ${data.inertia.toFixed(2)}`);
});

vectorPlugin.on('plg:vector:cluster-complete', (data) => {
  console.log(`\n📊 Clustering Results:`);
  console.log(`   Duration: ${data.duration}ms`);
  console.log(`   Cluster sizes:`, data.clusterSizes);
  console.log(`   Converged: ${data.converged ? 'Yes' : 'No'}\n`);
});
```

### Production Monitoring with Prometheus

Integrate with Prometheus metrics:

```javascript
import prometheus from 'prom-client';

// Create metrics
const searchDuration = new prometheus.Histogram({
  name: 'vector_search_duration_ms',
  help: 'Vector search duration in milliseconds',
  labelNames: ['resource', 'metric']
});

const searchResults = new prometheus.Histogram({
  name: 'vector_search_results',
  help: 'Number of results returned',
  labelNames: ['resource']
});

const clusteringDuration = new prometheus.Histogram({
  name: 'vector_clustering_duration_ms',
  help: 'Clustering duration in milliseconds',
  labelNames: ['resource', 'k']
});

const dimensionMismatches = new prometheus.Counter({
  name: 'vector_dimension_mismatches_total',
  help: 'Total dimension mismatches detected',
  labelNames: ['resource']
});

// Wire up events
vectorPlugin.on('plg:vector:search-complete', (data) => {
  searchDuration.labels(data.resource, data.distanceMetric).observe(data.duration);
  searchResults.labels(data.resource).observe(data.resultsCount);

  if (data.dimensionMismatches > 0) {
    dimensionMismatches.labels(data.resource).inc(data.dimensionMismatches);
  }
});

vectorPlugin.on('plg:vector:cluster-complete', (data) => {
  clusteringDuration.labels(data.resource, data.k.toString()).observe(data.duration);
});

// Alert on errors
vectorPlugin.on('plg:vector:search-error', (data) => {
  logger.error('Vector search error', { resource: data.resource, error: data.error });
  alerting.notify('VectorPlugin Search Error', data);
});

vectorPlugin.on('plg:vector:cluster-error', (data) => {
  logger.error('Vector clustering error', { resource: data.resource, error: data.error });
  alerting.notify('VectorPlugin Clustering Error', data);
});
```

### Quality Monitoring with Alerts

Monitor search quality and alert on degradation:

```javascript
const qualityThresholds = {
  minResults: 5,              // Alert if < 5 results
  maxAvgDistance: 0.7,        // Alert if avg distance > 0.7
  maxDimensionMismatches: 10  // Alert if > 10 mismatches
};

let recentSearches = [];

vectorPlugin.on('plg:vector:search-complete', (data) => {
  // Track recent searches (last 100)
  recentSearches.push(data);
  if (recentSearches.length > 100) {
    recentSearches.shift();
  }

  // Check quality
  if (data.resultsCount < qualityThresholds.minResults) {
    logger.warn('Low search results', {
      resource: data.resource,
      resultsCount: data.resultsCount,
      threshold: qualityThresholds.minResults
    });
  }

  if (data.dimensionMismatches > qualityThresholds.maxDimensionMismatches) {
    logger.error('High dimension mismatch rate', {
      resource: data.resource,
      mismatches: data.dimensionMismatches,
      totalRecords: data.totalRecords
    });

    alerting.notify('Vector Dimension Mismatch Alert', data);
  }
});

// Periodic quality analysis
setInterval(() => {
  if (recentSearches.length === 0) return;

  const avgDuration = recentSearches.reduce((sum, s) => sum + s.duration, 0) / recentSearches.length;
  const avgResults = recentSearches.reduce((sum, s) => sum + s.resultsCount, 0) / recentSearches.length;

  console.log('\n🔍 Search Quality Report:');
  console.log(`   Recent searches: ${recentSearches.length}`);
  console.log(`   Avg duration: ${avgDuration.toFixed(2)}ms`);
  console.log(`   Avg results: ${avgResults.toFixed(1)}`);

  if (avgDuration > 5000) {
    logger.warn('Search performance degradation', { avgDuration });
  }
}, 300000); // Every 5 minutes
```

### Development/Debugging

Set log level to debug events for development:

```javascript
if (process.env.NODE_ENV === 'development') {
  const vectorPlugin = new VectorPlugin({
    verboseEvents: true,    // Enable all events
    eventThrottle: 50       // Fast updates for debugging
  });

  // Log everything
  vectorPlugin.on('plg:vector:search-progress', (data) => {
    console.log(`[PROGRESS] Processed ${data.processed}/${data.total} (${data.progress.toFixed(1)}%)`);
  });

  vectorPlugin.on('plg:vector:dimension-mismatch', (data) => {
    console.warn(`[MISMATCH] Record ${data.recordIndex}: expected ${data.expected} dims, got ${data.got}`);
  });

  vectorPlugin.on('plg:vector:performance', (data) => {
    console.log(`[PERF] ${data.operation} on ${data.resource}: ${data.duration}ms (${data.throughput} records/s)`);
  });

  vectorPlugin.on('plg:vector:partition-filter', (data) => {
    console.log(`[PARTITION] Filtering by partition: ${JSON.stringify(data.partition)}`);
  });
}
```

### Event Configuration Best Practices

**Production Setup** - Only essential events:
```javascript
const vectorPlugin = new VectorPlugin({
  emitEvents: true,       // Enable monitoring
  verboseEvents: false,   // Set log level to silent (performance)
  eventThrottle: 1000     // Throttle to reduce overhead
});
```

**Development Setup** - All events for debugging:
```javascript
const vectorPlugin = new VectorPlugin({
  emitEvents: true,
  verboseEvents: true,    // Full visibility
  eventThrottle: 100      // Fast updates
});
```

**Performance Testing** - No event overhead:
```javascript
const vectorPlugin = new VectorPlugin({
  emitEvents: false       // No event overhead
});
```

---

## Performance Optimization

### Distance Metric Selection

Choose metric based on your data characteristics:

| Use Case | Recommended Metric | Why |
|----------|-------------------|-----|
| Text embeddings (OpenAI, etc.) | **Cosine** | Direction matters, magnitude doesn't |
| Image features | **Euclidean** | Absolute differences matter |
| High-dimensional sparse data | **Manhattan** | Faster, less sensitive to outliers |
| Normalized vectors | **Cosine** | Already unit length, most efficient |

### Partition-Based Filtering

Use partitions to reduce search space and improve performance:

```javascript
// Create resource with category partition
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    category: 'string|required',
    vector: 'embedding:1536'
  },
  partitions: {
    byCategory: { fields: { category: 'string' } }
  }
});

// Search only within specific partition - 10x faster!
const results = await products.vectorSearch(queryVector, {
  limit: 10,
  partition: 'byCategory',
  partitionValues: { category: 'electronics' }
});
```

**Performance Impact:**
- Without partition: Scans 100K products
- With partition: Scans ~10K products
- **Result: 10x faster search**

### Batch Operations

Insert many vectors at once:

```javascript
// Insert 1000+ vectors efficiently
const vectors = items.map(item => ({
  id: item.id,
  name: item.name,
  vector: item.embedding
}));

await products.insertMany(vectors);
```

### Caching with CachePlugin

Cache expensive operations:

```javascript
import { CachePlugin } from 's3db.js/plugins';

// Add caching layer
const cache = new CachePlugin({
  driver: 'memory',
  ttl: 3600000  // 1 hour
});
await db.usePlugin(cache);

// Frequent searches are automatically cached
const results = await products.vectorSearch(queryVector, { limit: 10 });
// Second identical call uses cache (100x faster!)
```

### Optimal K Caching

Cache expensive optimal K analysis:

```javascript
const cacheKey = `optimal-k-${vectors.length}`;
let analysis = await cache.get(cacheKey);

if (!analysis) {
  // Expensive computation
  analysis = await VectorPlugin.findOptimalK(vectors, {
    minK: 2,
    maxK: 10,
    nReferences: 10,
    stabilityRuns: 5
  });

  // Cache for 24 hours
  await cache.set(cacheKey, analysis, { ttl: 86400000 });
}

console.log(`Optimal K: ${analysis.consensus}`);
```

---

## Memory & Storage

### Vector Storage Size (After Compression)

| Model | Dimensions | Raw Size | Compressed | Savings |
|-------|-----------|----------|-----------|---------|
| OpenAI text-embedding-3 | 1536 | 12.3 KB | 2.8 KB | 77% |
| BERT / Sentence Transformers | 384 | 3.1 KB | 0.7 KB | 77% |
| Small models | 128 | 1.0 KB | 0.23 KB | 77% |

### Storage Behavior

- **< 2KB**: Fits in S3 metadata, very fast access
- **2KB - 500KB**: Uses `body-overflow`, still fast
- **> 500KB**: Needs optimization, consider chunking

### S3 Metadata Limit Handling

Use `embedding:XXX` notation for automatic compression:

```javascript
// Automatically compressed to ~2.8KB (fits with body-overflow)
const products = await db.createResource({
  name: 'products',
  attributes: {
    vector: 'embedding:1536'  // OpenAI default
  },
  behavior: 'body-overflow'  // For safety
});
```

---

## Advanced Patterns

### Multi-Field Search

Search across multiple embedding fields:

```javascript
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    description: 'string',
    textVector: 'embedding:1536',     // Text embeddings
    imageVector: 'embedding:2048'      // Image embeddings
  },
  behavior: 'body-overflow'
});

// Search by text
const textResults = await products.vectorSearch(queryTextVector, {
  vectorField: 'textVector',
  limit: 10
});

// Search by image
const imageResults = await products.vectorSearch(queryImageVector, {
  vectorField: 'imageVector',
  limit: 10
});

// Combine results
const combined = [
  ...textResults.map(r => ({ ...r, type: 'text' })),
  ...imageResults.map(r => ({ ...r, type: 'image' }))
].sort((a, b) => a.distance - b.distance).slice(0, 10);
```

### Hybrid Filtering

Combine vector similarity with metadata filtering:

```javascript
const results = await products.vectorSearch(queryVector, {
  limit: 50,
  partition: 'byCategory',
  partitionValues: { category: 'electronics' }
});

// Post-process with business logic
const filtered = results
  .filter(r => r.record.price >= minPrice && r.record.price <= maxPrice)
  .filter(r => r.record.rating >= minRating)
  .filter(r => r.record.inStock === true);

console.log(`Found ${filtered.length} products matching all criteria`);
```

### Similarity Scoring

Convert distance to similarity percentage:

```javascript
const results = await products.vectorSearch(queryVector, { limit: 10 });

const scored = results.map(({ record, distance }) => ({
  ...record,
  similarity: (1 - distance) * 100,  // 0-100%
  distance
}));

scored.forEach(item => {
  console.log(`${item.name}: ${item.similarity.toFixed(1)}% similar`);
});
```

---

## 📚 See Also

- **[Getting Started](./getting-started.md)** - Installation and setup
- **[API Reference](./api-reference.md)** - All methods and parameters
- **[Usage Patterns](./usage-patterns.md)** - Real-world examples
- **[Best Practices](./best-practices.md)** - Tips, troubleshooting, FAQ

---

**Ready to monitor your vectors in production?** Check [Best Practices →](./best-practices.md) for error handling and troubleshooting.
